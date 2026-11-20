from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class GovernancePolicy(Base):
    """Singleton table storing Super Admin governance toggles for OVEC GURU."""

    __tablename__ = "governance_policies"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    allow_knowledge_admin_manage_categories: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )
    allow_knowledge_admin_archive_docs: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )
    require_super_approve_for_ocr: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    def __repr__(self) -> str:
        return (
            f"<GovernancePolicy id={self.id} "
            f"manage_categories={self.allow_knowledge_admin_manage_categories} "
            f"archive_docs={self.allow_knowledge_admin_archive_docs} "
            f"approve_ocr={self.require_super_approve_for_ocr}>"
        )
