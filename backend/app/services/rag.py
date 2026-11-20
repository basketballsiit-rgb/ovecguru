"""Hybrid Search (Vector Similarity + Keyword Match + Effective Date Recency),
Strict Grounding prompt builder, and Knowledge Gap logger for OVEC GURU.
"""

import math
import re
from collections import defaultdict
from datetime import date
from typing import Dict, List, Optional, Tuple

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, joinedload

from app.core.config import settings
from app.models import (
    Document,
    DocumentCategory,
    DocumentChunk,
    DocumentGroup,
    DocumentStatus,
    KnowledgeGap,
    KnowledgeGapStatus,
)
from app.services.ai_client import AIClientError, create_embeddings, is_ai_configured

THAI_STOPWORDS = {
    "คือ",
    "อะไร",
    "อย่างไร",
    "ยังไง",
    "ไหม",
    "มั้ย",
    "หรือ",
    "ไม่",
    "ได้",
    "ครับ",
    "ค่ะ",
    "คะ",
    "นะ",
    "ของ",
    "ใน",
    "ที่",
    "และ",
    "กับ",
    "เป็น",
    "มี",
    "ให้",
    "จะ",
    "ต้อง",
    "ขอ",
    "ทราบ",
    "ช่วย",
    "อธิบาย",
    "หน่อย",
    "เรื่อง",
}

STRICT_GROUNDING_SYSTEM_PROMPT = """คุณคือ "OVEC GURU" ผู้ช่วยอัจฉริยะด้านระเบียบ กฎหมาย หลักสูตร และแนวปฏิบัติของสำนักงานคณะกรรมการการอาชีวศึกษา (สอศ.)

กฎเหล็กในการตอบคำถาม (Strict Grounding):
1. ตอบคำถามโดยอ้างอิงจาก "เอกสารอ้างอิงที่ระบบส่งให้" ด้านล่างนี้เท่านั้น ห้ามแต่งเติม คาดเดา หรือนำข้อมูลจากภายนอกที่ไม่มีในเอกสารมาตอบโดยเด็ดขาด
2. ระบุชื่อประกาศ/เอกสาร และหมวด/ข้อที่ใช้อ้างอิงให้ชัดเจนในคำตอบเสมอ
3. หากเอกสารที่ส่งให้มีหลายฉบับ ให้ยึดถือข้อมูลจากฉบับที่มี "วันที่บังคับใช้ล่าสุด" เป็นหลัก
4. หากส่วนใดของคำถามไม่มีระบุไว้ในเอกสารอ้างอิง ให้ระบุอย่างตรงไปตรงมาว่าไม่มีข้อมูลส่วนดังกล่าวในเอกสารอ้างอิง
5. ใช้ภาษาไทยที่เป็นทางการ สุภาพ กระชับ อ่านง่าย และจัดโครงสร้างเป็นข้อ ๆ เมื่อเหมาะสม"""


def _extract_keywords(question: str) -> List[str]:
    cleaned = re.sub(r"[^\wก-๙๐-๙\s./-]", " ", question.lower())
    raw_tokens = [tok.strip() for tok in cleaned.split() if len(tok.strip()) >= 2]
    tokens = [tok for tok in raw_tokens if tok not in THAI_STOPWORDS]
    return tokens or raw_tokens


def _cosine_similarity(vec_a: List[float], vec_b: List[float]) -> float:
    if not vec_a or not vec_b or len(vec_a) != len(vec_b):
        return 0.0
    dot = sum(a * b for a, b in zip(vec_a, vec_b))
    norm_a = math.sqrt(sum(a * a for a in vec_a))
    norm_b = math.sqrt(sum(b * b for b in vec_b))
    if norm_a == 0.0 or norm_b == 0.0:
        return 0.0
    return max(0.0, min(1.0, dot / (norm_a * norm_b)))


def _keyword_score(question: str, keywords: List[str], doc_title: str, heading: Optional[str], content: str) -> float:
    haystack = f"{doc_title} {heading or ''} {content}".lower()
    q_norm = question.strip().lower()
    exact_phrase_bonus = 0.35 if (len(q_norm) >= 4 and q_norm in haystack) else 0.0

    if not keywords:
        return exact_phrase_bonus

    hits = 0.0
    title_heading = f"{doc_title} {heading or ''}".lower()
    for kw in keywords:
        if kw in title_heading:
            hits += 1.25
        elif kw in haystack:
            hits += 1.0

    coverage = min(1.0, hits / len(keywords))
    return min(1.0, coverage * 0.75 + exact_phrase_bonus)


def _recency_score(effective_date: Optional[date], max_date: Optional[date]) -> float:
    """Give highest recency weight to documents with the latest effective_date."""
    if effective_date is None:
        return 0.25
    reference = max_date or date.today()
    days_old = max(0, (reference - effective_date).days)
    # Smooth decay: 0 days -> 1.0, ~3 years -> ~0.5, ~10 years -> ~0.2
    return round(1.0 / (1.0 + days_old / 1095.0), 4)


async def hybrid_search_active_chunks(
    db: Session,
    question: str,
    category_id: Optional[int] = None,
    group_id: Optional[int] = None,
    top_k: int = 5,
) -> Tuple[List[Dict[str, object]], Optional[str]]:
    """Run Hybrid Search over ACTIVE documents only.

    Combines:
      - Vector similarity (pgvector cosine distance on PostgreSQL, cosine math on SQLite)
      - Exact & token keyword matching
      - Effective date recency boost
    """
    dialect = db.bind.dialect.name if db.bind is not None else "sqlite"
    keywords = _extract_keywords(question)

    query_embedding: Optional[List[float]] = None
    embedding_note: Optional[str] = None
    if is_ai_configured():
        try:
            vectors = await create_embeddings([question])
            if vectors:
                query_embedding = vectors[0]
        except AIClientError as exc:
            embedding_note = str(exc)

    # Base filter: strictly ACTIVE documents only
    base_filters = [Document.status == DocumentStatus.ACTIVE]
    if category_id is not None:
        base_filters.append(Document.category_id == category_id)
    if group_id is not None:
        base_filters.append(DocumentCategory.group_id == group_id)

    candidate_chunks: Dict[int, DocumentChunk] = {}
    vector_scores: Dict[int, float] = {}

    if dialect == "postgresql" and query_embedding is not None:
        # 1) pgvector cosine distance top candidates
        dist_expr = DocumentChunk.embedding.cosine_distance(query_embedding)
        vec_stmt = (
            select(DocumentChunk, dist_expr.label("cosine_dist"))
            .join(Document, DocumentChunk.document_id == Document.id)
            .join(DocumentCategory, Document.category_id == DocumentCategory.id)
            .options(
                joinedload(DocumentChunk.document)
                .joinedload(Document.category)
                .joinedload(DocumentCategory.group)
            )
            .where(*base_filters, DocumentChunk.embedding.is_not(None))
            .order_by(dist_expr.asc())
            .limit(max(top_k * 4, 20))
        )
        for chunk, dist in db.execute(vec_stmt).all():
            candidate_chunks[chunk.id] = chunk
            vector_scores[chunk.id] = max(0.0, min(1.0, 1.0 - float(dist or 1.0)))

        # 2) Keyword ILIKE candidates so exact clauses/numbers are never missed
        if keywords:
            kw_clauses = []
            for kw in keywords[:8]:
                pattern = f"%{kw}%"
                kw_clauses.append(DocumentChunk.content_text.ilike(pattern))
                kw_clauses.append(DocumentChunk.clause_heading.ilike(pattern))
                kw_clauses.append(Document.title.ilike(pattern))
            kw_stmt = (
                select(DocumentChunk)
                .join(Document, DocumentChunk.document_id == Document.id)
                .join(DocumentCategory, Document.category_id == DocumentCategory.id)
                .options(
                    joinedload(DocumentChunk.document)
                    .joinedload(Document.category)
                    .joinedload(DocumentCategory.group)
                )
                .where(*base_filters, or_(*kw_clauses))
                .limit(max(top_k * 4, 20))
            )
            for chunk in db.scalars(kw_stmt).all():
                candidate_chunks.setdefault(chunk.id, chunk)
                if chunk.id not in vector_scores and chunk.embedding:
                    vector_scores[chunk.id] = _cosine_similarity(query_embedding, list(chunk.embedding))
    else:
        # SQLite dev mode or keyword-only fallback
        stmt = (
            select(DocumentChunk)
            .join(Document, DocumentChunk.document_id == Document.id)
            .join(DocumentCategory, Document.category_id == DocumentCategory.id)
            .options(
                joinedload(DocumentChunk.document)
                .joinedload(Document.category)
                .joinedload(DocumentCategory.group)
            )
            .where(*base_filters)
        )
        for chunk in db.scalars(stmt).all():
            candidate_chunks[chunk.id] = chunk
            if query_embedding is not None and chunk.embedding:
                vector_scores[chunk.id] = _cosine_similarity(query_embedding, list(chunk.embedding))

    if not candidate_chunks:
        return [], embedding_note

    dates = [
        c.document.effective_date
        for c in candidate_chunks.values()
        if c.document and c.document.effective_date is not None
    ]
    newest_date = max(dates) if dates else date.today()

    scored_results: List[Dict[str, object]] = []
    for chunk_id, chunk in candidate_chunks.items():
        doc = chunk.document
        vec_s = vector_scores.get(chunk_id, 0.0)
        kw_s = _keyword_score(question, keywords, doc.title, chunk.clause_heading, chunk.content_text)
        rec_s = _recency_score(doc.effective_date, newest_date)

        if query_embedding is not None and chunk.embedding:
            combined = 0.65 * vec_s + 0.25 * kw_s + 0.10 * rec_s
        else:
            # Keyword + recency fallback when embedding is unavailable
            combined = 0.85 * kw_s + 0.15 * rec_s

        scored_results.append(
            {
                "chunk": chunk,
                "document": doc,
                "vector_score": round(vec_s, 4),
                "keyword_score": round(kw_s, 4),
                "recency_score": round(rec_s, 4),
                "score": round(combined, 4),
            }
        )

    # Sort by combined score DESC, then effective_date DESC (latest regulation first)
    scored_results.sort(
        key=lambda item: (
            item["score"],
            item["document"].effective_date or date.min,
        ),
        reverse=True,
    )

    return scored_results[:top_k], embedding_note


def record_knowledge_gap(
    db: Session,
    question: str,
    suggested_category: Optional[str] = None,
) -> KnowledgeGap:
    """Increment asked_count if this unanswered question already exists, else create a new gap."""
    normalized_q = re.sub(r"\s+", " ", question).strip()
    existing = db.scalar(
        select(KnowledgeGap).where(
            func.lower(KnowledgeGap.question_text) == normalized_q.lower(),
            KnowledgeGap.status.in_([KnowledgeGapStatus.OPEN, KnowledgeGapStatus.IN_PROGRESS]),
        )
    )
    if existing is not None:
        existing.asked_count += 1
        if suggested_category and not existing.suggested_category:
            existing.suggested_category = suggested_category
        db.commit()
        db.refresh(existing)
        return existing

    gap = KnowledgeGap(
        question_text=normalized_q,
        asked_count=1,
        suggested_category=suggested_category,
        status=KnowledgeGapStatus.OPEN,
    )
    db.add(gap)
    db.commit()
    db.refresh(gap)
    return gap


def build_citation_cards(db: Session, matched_items: List[Dict[str, object]]) -> List[Dict[str, object]]:
    """Build rich citation cards grouped by document, including all document chunks for highlight viewer."""
    grouped_matches: Dict[int, List[Dict[str, object]]] = defaultdict(list)
    doc_order: List[int] = []

    for item in matched_items:
        doc: Document = item["document"]
        if doc.id not in grouped_matches:
            doc_order.append(doc.id)
        grouped_matches[doc.id].append(item)

    # Load all chunks for each referenced document so frontend can render full context with highlights
    all_chunks_by_doc: Dict[int, List[DocumentChunk]] = defaultdict(list)
    if doc_order:
        all_chunks = db.scalars(
            select(DocumentChunk)
            .where(DocumentChunk.document_id.in_(doc_order))
            .order_by(DocumentChunk.document_id.asc(), DocumentChunk.chunk_index.asc())
        ).all()
        for ch in all_chunks:
            all_chunks_by_doc[ch.document_id].append(ch)

    cards: List[Dict[str, object]] = []
    for doc_id in doc_order:
        matches = grouped_matches[doc_id]
        doc: Document = matches[0]["document"]
        category: Optional[DocumentCategory] = doc.category
        group: Optional[DocumentGroup] = category.group if category else None

        score_map = {m["chunk"].id: float(m["score"]) for m in matches}
        cited_clauses = []
        for m in matches:
            heading = m["chunk"].clause_heading
            if heading and heading not in cited_clauses:
                cited_clauses.append(heading)

        cards.append(
            {
                "document_id": doc.id,
                "title": doc.title,
                "category_name": category.name if category else "-",
                "group_name": group.name if group else "-",
                "effective_date": doc.effective_date.isoformat() if doc.effective_date else None,
                "cited_clauses": cited_clauses,
                "file_url": f"/api/documents/{doc.id}/file",
                "chunks": [
                    {
                        "chunk_id": ch.id,
                        "chunk_index": ch.chunk_index,
                        "clause_heading": ch.clause_heading,
                        "content_text": ch.content_text,
                        "score": score_map.get(ch.id, 0.0),
                        "is_matched": ch.id in score_map,
                    }
                    for ch in all_chunks_by_doc.get(doc_id, [])
                ],
            }
        )

    return cards


def build_grounded_messages(question: str, matched_items: List[Dict[str, object]]) -> List[Dict[str, str]]:
    """Build Strict Grounding chat messages from top matched chunks."""
    context_blocks = []
    for idx, item in enumerate(matched_items, start=1):
        doc: Document = item["document"]
        chunk: DocumentChunk = item["chunk"]
        eff = doc.effective_date.isoformat() if doc.effective_date else "ไม่ระบุวันที่"
        cat_name = doc.category.name if doc.category else "-"
        heading = chunk.clause_heading or "เนื้อหาเอกสาร"
        context_blocks.append(
            f"[เอกสารอ้างอิง #{idx}]\n"
            f"ชื่อประกาศ/เอกสาร: {doc.title}\n"
            f"หมวดหมู่: {cat_name} | วันที่บังคับใช้: {eff}\n"
            f"หมวด/ข้อ: {heading}\n"
            f"เนื้อหา:\n{chunk.content_text}"
        )

    user_prompt = (
        "ข้อมูลเอกสารอ้างอิงอย่างเป็นทางการของ สอศ.:\n\n"
        + "\n\n---\n\n".join(context_blocks)
        + f"\n\n---\n\nคำถามจากผู้ใช้งาน: {question}\n\n"
        "กรุณาตอบคำถามโดยอ้างอิงจากเอกสารด้านบนเท่านั้น พร้อมระบุชื่อประกาศและหมวด/ข้อที่อ้างอิง"
    )

    return [
        {"role": "system", "content": STRICT_GROUNDING_SYSTEM_PROMPT},
        {"role": "user", "content": user_prompt},
    ]
