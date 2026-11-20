"""OpenAI-compatible Cloud AI Client (httpx) for Embeddings and Streaming Chat Completions.

Supports OpenAI, Gemini OpenAI-compat, and Typhoon API purely via .env settings.
Reads live .env values on demand so multi-worker Uvicorn picks up UI config updates immediately.
Strictly zero local PyTorch / AVX dependencies.
"""

import asyncio
import json
import time
from pathlib import Path
from typing import AsyncGenerator, Dict, List, Optional

import httpx
from dotenv import dotenv_values

from app.core.config import BACKEND_DIR, PROJECT_ROOT, settings

RETRYABLE_STATUS_CODES = {429, 500, 502, 503, 504}
FALLBACK_TRIGGER_CODES = {404, 429, 500, 502, 503, 504}
MAX_AI_RETRIES = 2

# In-memory TTL caches so subsequent questions skip slow/503 models & /models lookups
_CACHE_TTL_SECONDS = 600.0
_models_cache: Dict[str, object] = {"expires_at": 0.0, "base_url": "", "data": None}
_working_model_cache: Dict[str, object] = {"expires_at": 0.0, "primary": "", "model": None}
_shared_http_client: Optional[httpx.AsyncClient] = None


def _get_http_client() -> httpx.AsyncClient:
    """Reuse a persistent HTTP/TLS connection pool to avoid ~500ms handshake overhead per query."""
    global _shared_http_client
    if _shared_http_client is None or _shared_http_client.is_closed:
        _shared_http_client = httpx.AsyncClient(
            timeout=httpx.Timeout(connect=10.0, read=45.0, write=15.0, pool=10.0),
            limits=httpx.Limits(max_keepalive_connections=10, max_connections=20),
        )
    return _shared_http_client

_NON_CHAT_KEYWORDS = ("embedding", "imagen", "veo", "aqa", "tts", "audio", "whisper", "dall-e", "moderation")


async def list_available_models(force_refresh: bool = False) -> Dict[str, List[str]]:
    """Query OpenAI-compatible GET /models using the live API Key (cached 10 min)."""
    cfg = get_live_ai_config()
    base_url = str(cfg["api_base_url"])
    now = time.monotonic()
    if (
        not force_refresh
        and _models_cache["data"] is not None
        and _models_cache["base_url"] == base_url
        and now < float(_models_cache["expires_at"])
    ):
        return _models_cache["data"]  # type: ignore[return-value]

    headers = _auth_headers(str(cfg["api_key"]))
    url = _build_url(base_url, "models")
    client = _get_http_client()

    try:
        resp = await client.get(url, headers=headers, timeout=12.0)
    except httpx.HTTPError as exc:
        raise AIClientError(f"ไม่สามารถดึงรายชื่อโมเดลจาก API ได้: {exc}") from exc

    if resp.status_code >= 400:
        raise AIClientError(f"GET /models ตอบกลับสถานะ {resp.status_code}: {resp.text[:250]}")

    data = resp.json()

    raw_ids: List[str] = []
    for item in data.get("data", []):
        mid = str(item.get("id") or "").strip()
        if not mid:
            continue
        if mid.startswith("models/"):
            mid = mid[7:]
        if mid not in raw_ids:
            raw_ids.append(mid)

    embedding_models = [m for m in raw_ids if "embedding" in m.lower()]
    chat_models = [
        m for m in raw_ids if not any(bad in m.lower() for bad in _NON_CHAT_KEYWORDS)
    ]

    # Prioritize fast flash / lite models first for low latency & high availability
    def _chat_rank(name: str) -> tuple:
        low = name.lower()
        is_lite = 0 if "lite" in low else 1
        is_flash = 0 if "flash" in low else 1
        is_preview = 1 if ("preview" in low or "exp" in low) else 0
        return (is_flash, is_lite, is_preview, low)

    chat_models.sort(key=_chat_rank)
    result = {"chat_models": chat_models, "embedding_models": embedding_models}
    _models_cache["data"] = result
    _models_cache["base_url"] = base_url
    _models_cache["expires_at"] = now + _CACHE_TTL_SECONDS
    return result


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
            resp = None
            last_error = ""
            for attempt in range(1, MAX_AI_RETRIES + 1):
                try:
                    resp = await client.post(url, headers=headers, json=payload)
                except httpx.HTTPError as exc:
                    last_error = f"เชื่อมต่อ Cloud Embedding API ไม่สำเร็จ: {exc}"
                    if attempt < MAX_AI_RETRIES:
                        await asyncio.sleep(1.5 * attempt)
                        continue
                    raise AIClientError(last_error) from exc

                if resp.status_code in RETRYABLE_STATUS_CODES and attempt < MAX_AI_RETRIES:
                    await asyncio.sleep(1.5 * attempt)
                    continue
                break

            if resp is None or resp.status_code >= 400:
                status_code = resp.status_code if resp is not None else "N/A"
                body_preview = resp.text[:300] if resp is not None else last_error
                raise AIClientError(
                    f"Cloud Embedding API ตอบกลับสถานะ {status_code}: {body_preview}"
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


async def _build_chat_model_chain(primary_model: str) -> List[str]:
    """Build ordered list of live models starting with primary_model, then discovered /models fallbacks."""
    chain = [primary_model]
    try:
        discovered = await list_available_models()
        for candidate in discovered.get("chat_models", []):
            if candidate not in chain:
                chain.append(candidate)
            if len(chain) >= 6:
                break
    except AIClientError:
        pass
    return chain


async def stream_chat_completion(
    messages: List[Dict[str, str]],
    temperature: float = 0.1,
) -> AsyncGenerator[str, None]:
    """Stream text deltas from an OpenAI-compatible /chat/completions endpoint
    with pooled connections, fast working-model caching, and dynamic /models fallback.
    """
    cfg = get_live_ai_config()
    base_url = str(cfg["api_base_url"])
    headers = _auth_headers(str(cfg["api_key"]))
    url = _build_url(base_url, "chat/completions")
    primary_model = str(cfg["chat_model"])

    # If a fast working fallback model was recently verified for this primary, try it FIRST
    now = time.monotonic()
    cached_working = (
        _working_model_cache["model"]
        if (
            _working_model_cache["model"]
            and _working_model_cache["primary"] == primary_model
            and now < float(_working_model_cache["expires_at"])
        )
        else None
    )
    model_chain: List[str] = [str(cached_working)] if cached_working else [primary_model]
    if primary_model not in model_chain:
        model_chain.append(primary_model)

    discovered_loaded = False
    last_error_msg = "ไม่สามารถเชื่อมต่อ Cloud LLM API ได้"
    client = _get_http_client()

    model_idx = 0
    while model_idx < len(model_chain):
        model_name = model_chain[model_idx]
        payload: Dict[str, object] = {
            "model": model_name,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": 1024,
            "stream": True,
        }
        # Fail fast (15s read timeout) on congested/stalled models so fallback kicks in quickly
        req_timeout = httpx.Timeout(connect=8.0, read=18.0, write=15.0, pool=8.0)

        yielded_any = False
        try:
            async with client.stream(
                "POST", url, headers=headers, json=payload, timeout=req_timeout
            ) as resp:
                if resp.status_code in FALLBACK_TRIGGER_CODES:
                    body = (await resp.aread()).decode("utf-8", errors="ignore")
                    last_error_msg = (
                        f"Cloud LLM API ({model_name}) ตอบกลับสถานะ {resp.status_code}: {body[:240]}"
                    )
                    if not discovered_loaded:
                        discovered_loaded = True
                        discovered_chain = await _build_chat_model_chain(primary_model)
                        for m in discovered_chain:
                            if m not in model_chain:
                                model_chain.append(m)
                    model_idx += 1
                    continue

                if resp.status_code >= 400:
                    body = (await resp.aread()).decode("utf-8", errors="ignore")
                    raise AIClientError(
                        f"Cloud LLM API ({model_name}) ตอบกลับสถานะ {resp.status_code}: {body[:300]}"
                    )

                # Cache this responsive model for 10 minutes so next question streams immediately!
                _working_model_cache["primary"] = primary_model
                _working_model_cache["model"] = model_name
                _working_model_cache["expires_at"] = time.monotonic() + _CACHE_TTL_SECONDS

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
                        yielded_any = True
                        yield content
                return
        except httpx.HTTPError as exc:
            last_error_msg = f"เชื่อมต่อ Cloud LLM API ({model_name}) ไม่สำเร็จหรือหมดเวลา: {exc}"
            if yielded_any:
                raise AIClientError(last_error_msg) from exc
            if not discovered_loaded:
                discovered_loaded = True
                discovered_chain = await _build_chat_model_chain(primary_model)
                for m in discovered_chain:
                    if m not in model_chain:
                        model_chain.append(m)
            model_idx += 1

    raise AIClientError(last_error_msg)
