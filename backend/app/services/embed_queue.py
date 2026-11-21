"""Lightweight zero-dependency background auto-embedding worker for large documents.

Designed for CentOS Stream 9 (3.6 GB RAM) without Redis/Celery:
- Serializes large embedding jobs via asyncio.Lock so rate limits aren't triggered concurrently.
- Commits each completed batch (40 chunks) to PostgreSQL immediately so progress is never lost.
- On 429 Free Tier rate limit, automatically waits 65 seconds for the per-minute window to reset
  and resumes seamlessly until 100% of chunks are embedded.
"""

import asyncio
import logging
from typing import Set

from sqlalchemy import select
from sqlalchemy.orm import joinedload

from app.db.session import SessionLocal
from app.models import Document, DocumentChunk
from app.services.ai_client import AIClientError, create_embeddings_resumable, is_ai_configured

logger = logging.getLogger("ovec_guru.embed_queue")

_embed_lock = asyncio.Lock()
_active_doc_ids: Set[int] = set()

BATCH_SIZE = 40
RATE_LIMIT_COOLDOWN_SECONDS = 65.0
MAX_RATE_LIMIT_WAITS = 20  # Supports up to ~800+ chunks even on Free Tier!


def is_document_embedding(document_id: int) -> bool:
    return document_id in _active_doc_ids


async def _run_background_embedding(document_id: int) -> None:
    if not is_ai_configured():
        _active_doc_ids.discard(document_id)
        return

    try:
        async with _embed_lock:
            rate_limit_waits = 0

            while True:
                with SessionLocal() as db:
                    doc = db.scalar(
                        select(Document)
                        .options(joinedload(Document.chunks))
                        .where(Document.id == document_id)
                    )
                    if doc is None:
                        logger.info("Document #%d deleted; stopping background embedding.", document_id)
                        return

                    missing_chunks = [c for c in doc.chunks if c.embedding is None]
                    if not missing_chunks:
                        logger.info(
                            "Document #%d (%s) reached 100%% embeddings (%d chunks).",
                            doc.id,
                            doc.title,
                            len(doc.chunks),
                        )
                        return

                    batch_chunks = missing_chunks[:BATCH_SIZE]
                    texts = [
                        f"{doc.title}\n{c.clause_heading or ''}\n{c.content_text}".strip()
                        for c in batch_chunks
                    ]
                    batch_ids = [c.id for c in batch_chunks]
                    total_chunks = len(doc.chunks)
                    remaining_before = len(missing_chunks)

                try:
                    vectors, warning = await create_embeddings_resumable(
                        texts,
                        batch_size=BATCH_SIZE,
                        throttle_seconds=1.5,
                    )
                except AIClientError as exc:
                    logger.warning(
                        "Background embedding aborted for doc #%d due to API error: %s",
                        document_id,
                        exc,
                    )
                    return

                saved = 0
                with SessionLocal() as db:
                    for cid, vec in zip(batch_ids, vectors):
                        if vec is not None:
                            chunk = db.get(DocumentChunk, cid)
                            if chunk is not None:
                                chunk.embedding = vec
                                saved += 1
                    if saved > 0:
                        db.commit()

                logger.info(
                    "Background embedding doc #%d: saved %d chunks (%d remaining of %d).",
                    document_id,
                    saved,
                    max(0, remaining_before - saved),
                    total_chunks,
                )

                if warning:
                    rate_limit_waits += 1
                    if rate_limit_waits > MAX_RATE_LIMIT_WAITS:
                        logger.warning(
                            "Background embedding doc #%d reached max 429 waits (%d); pausing.",
                            document_id,
                            MAX_RATE_LIMIT_WAITS,
                        )
                        return
                    logger.info(
                        "Doc #%d hit 429 rate limit; cooling down %.0fs before next batch (%d/%d)...",
                        document_id,
                        RATE_LIMIT_COOLDOWN_SECONDS,
                        rate_limit_waits,
                        MAX_RATE_LIMIT_WAITS,
                    )
                    await asyncio.sleep(RATE_LIMIT_COOLDOWN_SECONDS)
                else:
                    # Short polite pause between successful batches
                    await asyncio.sleep(2.0)
    finally:
        _active_doc_ids.discard(document_id)


def schedule_background_embedding(document_id: int) -> bool:
    """Enqueue a document for background auto-embedding if not already queued."""
    if document_id in _active_doc_ids or not is_ai_configured():
        return False
    _active_doc_ids.add(document_id)
    asyncio.create_task(_run_background_embedding(document_id))
    return True
