from typing import List, Optional

from pydantic import BaseModel, Field


class ChatStreamRequest(BaseModel):
    question: str = Field(..., min_length=2, max_length=2000)
    category_id: Optional[int] = None
    group_id: Optional[int] = None
    document_id: Optional[int] = None
    top_k: int = Field(default=5, ge=1, le=12)


class CitationChunk(BaseModel):
    chunk_id: int
    chunk_index: int
    clause_heading: Optional[str] = None
    content_text: str
    score: float


class CitationCard(BaseModel):
    document_id: int
    title: str
    category_name: str
    group_name: str
    effective_date: Optional[str] = None
    cited_clauses: List[str] = Field(default_factory=list)
    file_url: str
    chunks: List[CitationChunk] = Field(default_factory=list)
