import enum
from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, Enum as SAEnum, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class KnowledgeGapStatus(str, enum.Enum):
    OPEN = "open"
    IN_PROGRESS = "in_progress"
    RESOLVED = "resolved"
    DISMISSED = "dismissed"


class KnowledgeGap(Base):
    """Tracks user questions that currently lack sufficient document coverage."""

    __tablename__ = "knowledge_gaps"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    question_text: Mapped[str] = mapped_column(Text, nullable=False)
    asked_count: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    suggested_category: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    status: Mapped[KnowledgeGapStatus] = mapped_column(
        SAEnum(
            KnowledgeGapStatus,
            values_callable=lambda enum_cls: [e.value for e in enum_cls],
            native_enum=False,
            length=24,
        ),
        nullable=False,
        default=KnowledgeGapStatus.OPEN,
        index=True,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    def __repr__(self) -> str:
        return (
            f"<KnowledgeGap id={self.id} asked_count={self.asked_count} "
            f"status={self.status.value!r}>"
        )
