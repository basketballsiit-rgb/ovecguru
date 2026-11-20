"""OpenAI-compatible Cloud AI Client (httpx) for Embeddings and Streaming Chat Completions.

Supports OpenAI, Gemini OpenAI-compat, and Typhoon API purely via .env settings.
Strictly zero local PyTorch / AVX dependencies.
"""

import json
from typing import AsyncGenerator, Dict, List

import httpx

from app.core.config import settings


class AIClientError(RuntimeError):
    """Raised when Cloud AI API is unconfigured or returns an error."""


def is_ai_configured() -> bool:
    key = (settings.AI_API_KEY or "").strip()
    return bool(key and not key.startswith("CHANGE_ME") and not key.startswith("PUT_YOUR"))


def _build_url(endpoint: str) -> str:
    base = settings.AI_API_BASE_URL.rstrip("/")
    path = endpoint.lstrip("/")
    return f"{base}/{path}"


def _auth_headers() -> Dict[str, str]:
    if not is_ai_configured():
        raise AIClientError(
            "ยังไม่ได้ตั้งค่า AI_API_KEY ในไฟล์ .env กรุณาระบุ API Key ของ Gemini, OpenAI หรือ Typhoon"
        )
    return {
        "Authorization": f"Bearer {settings.AI_API_KEY.strip()}",
        "Content-Type": "application/json",
    }


async def create_embeddings(texts: List[str], batch_size: int = 32) -> List[List[float]]:
    """Generate vector embeddings via OpenAI-compatible /embeddings endpoint."""
    if not texts:
        return []

    headers = _auth_headers()
    url = _build_url("embeddings")
    all_embeddings: List[List[float]] = []

    async with httpx.AsyncClient(timeout=settings.AI_TIMEOUT_SECONDS) as client:
        for i in range(0, len(texts), batch_size):
            batch = texts[i : i + batch_size]
            payload = {
                "model": settings.AI_EMBEDDING_MODEL,
                "input": batch,
            }
            try:
                resp = await client.post(url, headers=headers, json=payload)
            except httpx.HTTPError as exc:
                raise AIClientError(f"เชื่อมต่อ Cloud Embedding API ไม่สำเร็จ: {exc}") from exc

            if resp.status_code >= 400:
                raise AIClientError(
                    f"Cloud Embedding API ตอบกลับสถานะ {resp.status_code}: {resp.text[:300]}"
                )

            data = resp.json()
            items = sorted(data.get("data", []), key=lambda x: x.get("index", 0))
            if len(items) != len(batch):
                raise AIClientError("จำนวนเวกเตอร์ที่ได้รับจาก Cloud Embedding API ไม่ตรงกับจำนวน Chunk")

            for item in items:
                vec = item.get("embedding")
                if not isinstance(vec, list) or not vec:
                    raise AIClientError("รูปแบบเวกเตอร์จาก Cloud Embedding API ไม่ถูกต้อง")
                all_embeddings.append([float(v) for v in vec])

    return all_embeddings


async def stream_chat_completion(
    messages: List[Dict[str, str]],
    temperature: float = 0.1,
) -> AsyncGenerator[str, None]:
    """Stream text deltas from an OpenAI-compatible /chat/completions endpoint."""
    headers = _auth_headers()
    url = _build_url("chat/completions")
    payload = {
        "model": settings.AI_CHAT_MODEL,
        "messages": messages,
        "temperature": temperature,
        "stream": True,
    }

    async with httpx.AsyncClient(timeout=settings.AI_TIMEOUT_SECONDS) as client:
        try:
            async with client.stream("POST", url, headers=headers, json=payload) as resp:
                if resp.status_code >= 400:
                    body = (await resp.aread()).decode("utf-8", errors="ignore")
                    raise AIClientError(
                        f"Cloud LLM API ตอบกลับสถานะ {resp.status_code}: {body[:300]}"
                    )

                async for raw_line in resp.aiter_lines():
                    line = raw_line.strip()
                    if not line or not line.startswith("data:"):
                        continue
                    data_str = line[5:].strip()
                    if data_str == "[DONE]":
                        break
                    try:
                        chunk = json.loads(data_str)
                    except json.JSONDecodeError:
                        continue
                    choices = chunk.get("choices") or []
                    if not choices:
                        continue
                    delta = choices[0].get("delta") or {}
                    content = delta.get("content")
                    if content:
                        yield content
        except httpx.HTTPError as exc:
            raise AIClientError(f"เชื่อมต่อ Cloud LLM API ไม่สำเร็จ: {exc}") from exc
