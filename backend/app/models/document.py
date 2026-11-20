import enum
from datetime import date, datetime
from typing import Optional

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Enum as SAEnum,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.config import settings
from app.db.base import Base
from app.db.types import EmbeddingVector


class DocumentStatus(str, enum.Enum):
    ACTIVE = "active"
    ARCHIVED = "archived"


class IngestionType(str, enum.Enum):
    PDF_TEXT = "pdf_text"
    PDF_OCR = "pdf_ocr"
    DOCX = "docx"
    MANUAL = "manual"


class DocumentGroup(Base):
    __tablename__ = "document_groups"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    categories = relationship(
        "DocumentCategory",
        back_populates="group",
        cascade="all, delete-orphan",
    )

    def __repr__(self) -> str:
        return f"<DocumentGroup id={self.id} name={self.name!r}>"


class DocumentCategory(Base):
    __tablename__ = "document_categories"
    __table_args__ = (
        UniqueConstraint("group_id", "name", name="uq_document_categories_group_name"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    group_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("document_groups.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    is_default: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    group = relationship("DocumentGroup", back_populates="categories")
    documents = relationship("Document", back_populates="category")

    def __repr__(self) -> str:
        return f"<DocumentCategory id={self.id} name={self.name!r} group_id={self.group_id}>"


class Document(Base):
    __tablename__ = "documents"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    title: Mapped[str] = mapped_column(String(500), nullable=False, index=True)
    category_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("document_categories.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    effective_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True, index=True)
    ingestion_type: Mapped[str] = mapped_column(
        String(32),
        nullable=False,
        default=IngestionType.PDF_TEXT.value,
    )
    file_path: Mapped[str] = mapped_column(String(1024), nullable=False)
    status: Mapped[DocumentStatus] = mapped_column(
        SAEnum(
            DocumentStatus,
            values_callable=lambda enum_cls: [e.value for e in enum_cls],
            native_enum=False,
            length=16,
        ),
        nullable=False,
        default=DocumentStatus.ACTIVE,
        index=True,
    )
    created_by: Mapped[Optional[int]] = mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    category = relationship("DocumentCategory", back_populates="documents")
    creator = relationship("User", back_populates="documents")
    chunks = relationship(
        "DocumentChunk",
        back_populates="document",
        cascade="all, delete-orphan",
        order_by="DocumentChunk.chunk_index",
    )

    def __repr__(self) -> str:
        return f"<Document id={self.id} title={self.title!r} status={self.status.value!r}>"


class DocumentChunk(Base):
    __tablename__ = "document_chunks"
    __table_args__ = (
        Index("ix_document_chunks_doc_chunk_idx", "document_id", "chunk_index"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    document_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("documents.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    clause_heading: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    content_text: Mapped[str] = mapped_column(Text, nullable=False)
    embedding: Mapped[Optional[list[float]]] = mapped_column(
        EmbeddingVector(settings.AI_EMBEDDING_DIMENSIONS),
        nullable=True,
    )
    chunk_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    document = relationship("Document", back_populates="chunks")

    def __repr__(self) -> str:
        return f"<DocumentChunk id={self.id} document_id={self.document_id} chunk_index={self.chunk_index}>"
