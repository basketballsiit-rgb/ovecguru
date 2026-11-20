from datetime import date, datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field

from app.models.document import DocumentStatus
from app.models.knowledge_gap import KnowledgeGapStatus


class ChunkPreviewItem(BaseModel):
    chunk_index: int
    clause_heading: Optional[str] = None
    content_text: str
    char_count: int


class ExtractPreviewResponse(BaseModel):
    original_filename: str
    stored_filename: str
    file_path: str
    ingestion_type: str
    page_count: int
    used_ocr: bool
    extracted_text: str
    chunks_preview: List[ChunkPreviewItem]


class ChunkPreviewRequest(BaseModel):
    text: str = Field(..., min_length=1)
    max_chars: int = Field(default=1200, ge=300, le=4000)


class ChunkPreviewResponse(BaseModel):
    total_chunks: int
    chunks: List[ChunkPreviewItem]


class ChunkCommitItem(BaseModel):
    clause_heading: Optional[str] = None
    content_text: str = Field(..., min_length=1)
    chunk_index: Optional[int] = None


class DocumentCommitRequest(BaseModel):
    title: str = Field(..., min_length=2, max_length=500)
    category_id: int
    effective_date: Optional[date] = None
    ingestion_type: str = Field(default="pdf_text", max_length=32)
    file_path: str = Field(..., min_length=1, max_length=1024)
    content_text: Optional[str] = None
    chunks: Optional[List[ChunkCommitItem]] = None
    replace_document_id: Optional[int] = None


class DocumentStatusUpdateRequest(BaseModel):
    status: DocumentStatus


class DocumentUpdateRequest(BaseModel):
    title: Optional[str] = Field(default=None, min_length=2, max_length=500)
    category_id: Optional[int] = None
    effective_date: Optional[date] = None
    status: Optional[DocumentStatus] = None


class DocumentChunkResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    document_id: int
    clause_heading: Optional[str] = None
    content_text: str
    chunk_index: int


class DocumentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    category_id: int
    category_name: Optional[str] = None
    group_id: Optional[int] = None
    group_name: Optional[str] = None
    effective_date: Optional[date] = None
    ingestion_type: str
    file_path: str
    file_url: str
    status: DocumentStatus
    created_by: Optional[int] = None
    created_at: datetime
    chunk_count: int = 0
    embedded_chunk_count: int = 0


class DocumentDetailResponse(DocumentResponse):
    chunks: List[DocumentChunkResponse] = Field(default_factory=list)


class DocumentCommitResponse(BaseModel):
    document: DocumentResponse
    embedded_chunks: int
    archived_previous_document_id: Optional[int] = None
    embedding_warning: Optional[str] = None


class KnowledgeGapResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    question_text: str
    asked_count: int
    suggested_category: Optional[str] = None
    status: KnowledgeGapStatus
    updated_at: datetime


class KnowledgeGapUpdateRequest(BaseModel):
    suggested_category: Optional[str] = Field(default=None, max_length=255)
    status: Optional[KnowledgeGapStatus] = None
