"""Hybrid RAG & Server-Sent Events (SSE) Streaming Chatbot Endpoint (/api/chat/stream)."""

import json
from typing import AsyncGenerator

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.session import get_db
from app.models import DocumentCategory
from app.schemas.chat import ChatStreamRequest
from app.services.ai_client import (
    AIClientError,
    get_live_ai_config,
    is_ai_configured,
    stream_chat_completion,
)
from app.services.rag import (
    build_citation_cards,
    build_grounded_messages,
    hybrid_search_active_chunks,
    record_knowledge_gap,
)

router = APIRouter(tags=["Chatbot Streaming (RAG)"])

UNGROUNDED_FALLBACK_MESSAGE = (
    "ขออภัยครับ ขณะนี้ยังไม่พบประกาศ ระเบียบ หรือเอกสารอ้างอิงที่เปิดใช้งานอยู่ในคลังความรู้ สอศ. "
    "ที่ตรงกับคำถามของคุณอย่างเพียงพอ เพื่อความถูกต้องตามหลัก Strict Grounding ระบบจึงไม่สามารถตอบคำถามนี้ได้ "
    "ทั้งนี้ระบบได้บันทึกคำถามนี้ไว้ในรายการ Knowledge Gaps เพื่อให้ผู้ดูแลคลังความรู้เร่งจัดหาและอัปเดตเอกสารเพิ่มเติมแล้วครับ"
)


def _sse_event(event_name: str, payload: dict) -> str:
    return f"event: {event_name}\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n"


@router.post("/api/chat/stream")
async def chat_stream(
    payload: ChatStreamRequest,
    db: Session = Depends(get_db),
) -> StreamingResponse:
    """Hybrid Search (ACTIVE docs only) + Strict Grounding SSE Streaming response.

    SSE Event Protocol:
      1. `event: metadata` -> {"grounded": bool, "citations": [...], "knowledge_gap_logged": bool, ...}
      2. `event: token`    -> {"text": "..."} (streamed incrementally from Cloud LLM)
      3. `event: error`    -> {"message": "..."} (only if upstream LLM fails)
      4. `event: done`     -> {"ok": true}
    """
    matched_items, search_note = await hybrid_search_active_chunks(
        db=db,
        question=payload.question,
        category_id=payload.category_id,
        group_id=payload.group_id,
        top_k=payload.top_k,
    )

    live_cfg = get_live_ai_config()
    min_threshold = max(float(live_cfg.get("rag_min_relevance_score", settings.RAG_MIN_RELEVANCE_SCORE)), 0.55)

    top_item = matched_items[0] if matched_items else None
    top_score = float(top_item["score"]) if top_item else 0.0
    top_vec = float(top_item.get("vector_score", 0.0)) if top_item else 0.0
    top_kw = float(top_item.get("keyword_score", 0.0)) if top_item else 0.0

    # Strict Grounding Gate: require combined score >= threshold AND either strong vector match or keyword overlap
    is_grounded = (
        top_item is not None
        and top_score >= min_threshold
        and (top_vec >= 0.72 or top_kw >= 0.15)
    )

    if not is_grounded:
        suggested_cat = None
        if payload.category_id is not None:
            cat = db.get(DocumentCategory, payload.category_id)
            if cat is not None:
                suggested_cat = cat.name

        gap = record_knowledge_gap(
            db=db,
            question=payload.question,
            suggested_category=suggested_cat,
        )

        async def ungrounded_stream() -> AsyncGenerator[str, None]:
            yield _sse_event(
                "metadata",
                {
                    "grounded": False,
                    "top_score": top_score,
                    "threshold": min_threshold,
                    "knowledge_gap_logged": True,
                    "knowledge_gap_id": gap.id,
                    "asked_count": gap.asked_count,
                    "citations": [],
                    "note": search_note,
                },
            )
            yield _sse_event("token", {"text": UNGROUNDED_FALLBACK_MESSAGE})
            yield _sse_event("done", {"ok": True})

        return StreamingResponse(
            ungrounded_stream(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )

    # Filter matched items to relevant chunks only for LLM context & citations
    relevant_items = [
        item
        for item in matched_items
        if float(item["score"]) >= max(min_threshold * 0.85, 0.45)
    ] or matched_items[:1]

    citation_cards = build_citation_cards(db, relevant_items)
    llm_messages = build_grounded_messages(payload.question, relevant_items)

    async def grounded_stream() -> AsyncGenerator[str, None]:
        yield _sse_event(
            "metadata",
            {
                "grounded": True,
                "top_score": top_score,
                "threshold": min_threshold,
                "knowledge_gap_logged": False,
                "citations": citation_cards,
                "note": search_note,
            },
        )

        if not is_ai_configured():
            yield _sse_event(
                "token",
                {
                    "text": (
                        "พบเอกสารอ้างอิงที่เกี่ยวข้องแล้ว (แสดงในการ์ดอ้างอิงด้านล่าง) "
                        "แต่ยังไม่ได้ตั้งค่า AI_API_KEY ในไฟล์ .env จึงยังไม่สามารถสรุปคำตอบผ่าน Cloud LLM API ได้"
                    )
                },
            )
            yield _sse_event("done", {"ok": True})
            return

        try:
            async for delta_text in stream_chat_completion(llm_messages, temperature=0.1):
                yield _sse_event("token", {"text": delta_text})
        except AIClientError as exc:
            yield _sse_event("error", {"message": str(exc)})

        yield _sse_event("done", {"ok": True})

    return StreamingResponse(
        grounded_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
