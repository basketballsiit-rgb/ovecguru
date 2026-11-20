"""Export all SQLAlchemy models so Base.metadata registers every table."""

from app.models.document import (
    Document,
    DocumentCategory,
    DocumentChunk,
    DocumentGroup,
    DocumentStatus,
    IngestionType,
)
from app.models.governance import GovernancePolicy
from app.models.knowledge_gap import KnowledgeGap, KnowledgeGapStatus
from app.models.user import User, UserRole, UserStatus

__all__ = [
    "User",
    "UserRole",
    "UserStatus",
    "GovernancePolicy",
    "DocumentGroup",
    "DocumentCategory",
    "Document",
    "DocumentStatus",
    "IngestionType",
    "DocumentChunk",
    "KnowledgeGap",
    "KnowledgeGapStatus",
]
