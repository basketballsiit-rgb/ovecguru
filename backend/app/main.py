from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.api.routes import admin_users, auth, categories, chat, documents
from app.core.config import settings
from app.db.session import get_db
from app.services.ai_client import get_live_ai_config, is_ai_configured


@asynccontextmanager
async def lifespan(_app: FastAPI):
    try:
        settings.ensure_storage_dirs()
    except OSError:
        pass
    yield


app = FastAPI(
    title=settings.APP_NAME,
    description="OVEC GURU Intelligent Chatbot API for Office of the Vocational Education Commission",
    version="0.2.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register Step 2 API Routers
app.include_router(auth.router)
app.include_router(admin_users.router)
app.include_router(categories.router)
app.include_router(documents.router)
app.include_router(chat.router)


@app.get("/api/health", tags=["System"])
def health_check(db: Session = Depends(get_db)) -> dict:
    """Verify API liveness, database connectivity, and pgvector extension (when on PostgreSQL)."""
    db_ok = False
    pgvector_ok = False
    dialect = db.bind.dialect.name if db.bind is not None else "unknown"
    error_detail = None

    try:
        db.execute(text("SELECT 1"))
        db_ok = True
        if dialect == "postgresql":
            ext = db.execute(
                text("SELECT extname FROM pg_extension WHERE extname = 'vector'")
            ).scalar_one_or_none()
            pgvector_ok = ext == "vector"
    except Exception as exc:  # pragma: no cover - runtime connectivity check
        error_detail = str(exc)

    is_healthy = db_ok and (pgvector_ok if dialect == "postgresql" else True)

    live_ai = get_live_ai_config()

    return {
        "status": "ok" if is_healthy else "degraded",
        "app_name": settings.APP_NAME,
        "environment": settings.APP_ENV,
        "database_dialect": dialect,
        "database_connected": db_ok,
        "pgvector_enabled": pgvector_ok,
        "ai_api_key_configured": is_ai_configured(),
        "ai_chat_model": live_ai["chat_model"],
        "ai_embedding_model": live_ai["embedding_model"],
        "upload_dir": settings.UPLOAD_DIR,
        "error": error_detail,
    }
