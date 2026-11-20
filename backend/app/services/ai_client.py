"""OpenAI-compatible Cloud AI Client (httpx) for Embeddings and Streaming Chat Completions.

Supports OpenAI, Gemini OpenAI-compat, and Typhoon API purely via .env settings.
Reads live .env values on demand so multi-worker Uvicorn picks up UI config updates immediately.
Strictly zero local PyTorch / AVX dependencies.
"""

import json
from pathlib import Path
from typing import AsyncGenerator, Dict, List

import httpx
from dotenv import dotenv_values

from app.core.config import BACKEND_DIR, PROJECT_ROOT, settings


class AIClientError(RuntimeError):
    """Raised when Cloud AI API is unconfigured or returns an error."""


def _resolve_env_file() -> Path:
    root_env = PROJECT_ROOT / ".env"
    if root_env.exists():
        return root_env
    backend_env = BACKEND_DIR / ".env"
    if backend_env.exists():
        return backend_env
    return root_env


def get_live_ai_config() -> Dict[str, object]:
    """Read latest AI API config from .env (falling back to in-memory settings)."""
    env_path = _resolve_env_file()
    file_vals = dotenv_values(env_path) if env_path.exists() else {}

    def _pick(key: str, default_val):
        raw = file_vals.get(key)
        if raw is not None and str(raw).strip() != "":
            return str(raw).strip()
        return default_val

    return {
        "api_base_url": _pick("AI_API_BASE_URL", settings.AI_API_BASE_URL),
        "api_key": _pick("AI_API_KEY", settings.AI_API_KEY),
        "chat_model": _pick("AI_CHAT_MODEL", settings.AI_CHAT_MODEL),
        "embedding_model": _pick("AI_EMBEDDING_MODEL", settings.AI_EMBEDDING_MODEL),
        "embedding_dimensions": int(
            _pick("AI_EMBEDDING_DIMENSIONS", str(settings.AI_EMBEDDING_DIMENSIONS))
        ),
        "rag_min_relevance_score": float(
            _pick("RAG_MIN_RELEVANCE_SCORE", str(settings.RAG_MIN_RELEVANCE_SCORE))
        ),
        "env_file_path": str(env_path),
    }


def mask_api_key(api_key: str) -> str:
    key = (api_key or "").strip()
    if not key or key.startswith("CHANGE_ME") or key.startswith("PUT_YOUR"):
        return ""
    if len(key) <= 10:
        return "••••••"
    return f"{key[:6]}••••••{key[-4:]}"


def is_ai_configured() -> bool:
    key = str(get_live_ai_config().get("api_key") or "").strip()
    return bool(key and not key.startswith("CHANGE_ME") and not key.startswith("PUT_YOUR"))


def _build_url(base_url: str, endpoint: str) -> str:
    base = base_url.rstrip("/")
    path = endpoint.lstrip("/")
    return f"{base}/{path}"


def _auth_headers(api_key: str) -> Dict[str, str]:
    key = (api_key or "").strip()
    if not key or key.startswith("CHANGE_ME") or key.startswith("PUT_YOUR"):
        raise AIClientError(
            "ยังไม่ได้ตั้งค่า AI_API_KEY กรุณาตั้งค่าที่แท็บ 'สถาปัตยกรรมระบบ' หรือในไฟล์ .env"
        )
    return {
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
    }


async def create_embeddings(texts: List[str], batch_size: int = 32) -> List[List[float]]:
    """Generate vector embeddings via OpenAI-compatible /embeddings endpoint."""
    if not texts:
        return []

    cfg = get_live_ai_config()
    headers = _auth_headers(str(cfg["api_key"]))
    url = _build_url(str(cfg["api_base_url"]), "embeddings")
    model = str(cfg["embedding_model"])
    target_dims = int(cfg["embedding_dimensions"])
    all_embeddings: List[List[float]] = []

    async with httpx.AsyncClient(timeout=settings.AI_TIMEOUT_SECONDS) as client:
        for i in range(0, len(texts), batch_size):
            batch = texts[i : i + batch_size]
            payload = {
                "model": model,
                "input": batch,
            }
            if target_dims > 0:
                payload["dimensions"] = target_dims
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
    cfg = get_live_ai_config()
    headers = _auth_headers(str(cfg["api_key"]))
    url = _build_url(str(cfg["api_base_url"]), "chat/completions")
    payload = {
        "model": str(cfg["chat_model"]),
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
