from functools import lru_cache
from pathlib import Path
from typing import List

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Resolve project root so both `backend/.env` and `<project_root>/.env` are supported
BACKEND_DIR = Path(__file__).resolve().parents[2]
PROJECT_ROOT = BACKEND_DIR.parent


class Settings(BaseSettings):
    """Centralized application settings loaded from environment variables / .env."""

    model_config = SettingsConfigDict(
        env_file=(PROJECT_ROOT / ".env", BACKEND_DIR / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # Application
    APP_NAME: str = "OVEC GURU"
    APP_ENV: str = "production"
    APP_DEBUG: bool = False
    BACKEND_HOST: str = "127.0.0.1"
    BACKEND_PORT: int = 8000
    CORS_ORIGINS: str = "http://localhost:5173,http://127.0.0.1:5173"

    # Database (PostgreSQL + pgvector: Supabase Cloud or local Docker)
    DATABASE_URL: str = "postgresql+psycopg2://ovec_guru:change_me@127.0.0.1:5432/ovec_guru"

    # Cloud AI API (OpenAI-compatible: Gemini, OpenAI, Typhoon)
    AI_API_BASE_URL: str = "https://generativelanguage.googleapis.com/v1beta/openai/"
    AI_API_KEY: str = ""
    AI_CHAT_MODEL: str = "gemini-2.5-flash"
    AI_EMBEDDING_MODEL: str = "text-embedding-004"
    AI_EMBEDDING_DIMENSIONS: int = 768
    AI_TIMEOUT_SECONDS: float = 90.0
    RAG_MIN_RELEVANCE_SCORE: float = 0.42

    # Storage paths (strictly under /home/ovec_guru on production server)
    UPLOAD_DIR: str = "/home/ovec_guru/uploads"
    TEMP_DIR: str = "/home/ovec_guru/tmp"
    CACHE_DIR: str = "/home/ovec_guru/cache"
    LOG_DIR: str = "/home/ovec_guru/logs"

    # Authentication / JWT
    JWT_SECRET: str = "change-me-in-production"
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 480

    # Initial Primary Super Admin (used only during first-time DB bootstrap)
    INIT_SUPER_ADMIN_NAME: str = "ผู้ดูแลระบบหลัก สอศ."
    INIT_SUPER_ADMIN_EMAIL: str = "admin@ovec.go.th"
    INIT_SUPER_ADMIN_PASSWORD: str = "ChangeMe@OVEC2026!"
    INIT_SUPER_ADMIN_DEPARTMENT: str = "สำนักงานคณะกรรมการการอาชีวศึกษา (สอศ.)"

    @field_validator("DATABASE_URL", mode="before")
    @classmethod
    def normalize_database_url(cls, value: str) -> str:
        """Ensure PostgreSQL URLs use the psycopg2 SQLAlchemy 2.0 driver prefix."""
        if not isinstance(value, str):
            return value
        if value.startswith("postgres://"):
            return value.replace("postgres://", "postgresql+psycopg2://", 1)
        if value.startswith("postgresql://"):
            return value.replace("postgresql://", "postgresql+psycopg2://", 1)
        return value

    @property
    def cors_origins_list(self) -> List[str]:
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]

    def ensure_storage_dirs(self) -> None:
        """Create configured storage directories if they do not exist."""
        for dir_path in (self.UPLOAD_DIR, self.TEMP_DIR, self.CACHE_DIR, self.LOG_DIR):
            Path(dir_path).mkdir(parents=True, exist_ok=True)


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
