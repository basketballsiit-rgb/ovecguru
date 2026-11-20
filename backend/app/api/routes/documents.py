"""Document Ingestion (Thai OCR + Structure-Aware Chunking + Incremental Embedding),
Document Management, Source File Viewer, and Knowledge Gaps API.
"""

from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from app.api.deps import (
    ensure_can_archive_document,
    ensure_can_commit_document,
    get_current_user,
    get_governance_policy,
    require_roles,
)
from app.core.config import settings
from app.db.session import get_db
from app.models import (
    Document,
    DocumentCategory,
    DocumentChunk,
    DocumentStatus,
    GovernancePolicy,
    KnowledgeGap,
    KnowledgeGapStatus,
    User,
    UserRole,
)
from app.schemas.document import (
    ChunkPreviewItem,
    ChunkPreviewRequest,
    ChunkPreviewResponse,
    DocumentChunkResponse,
    DocumentCommitRequest,
    DocumentCommitResponse,
    DocumentDetailResponse,
    DocumentResponse,
    DocumentStatusUpdateRequest,
    ExtractPreviewResponse,
    KnowledgeGapResponse,
    KnowledgeGapUpdateRequest,
)
from app.services.ai_client import AIClientError, create_embeddings, is_ai_configured
from app.services.chunker import chunk_thai_official_text
from app.services.ocr import extract_document_text, save_uploaded_file

router = APIRouter(tags=["Documents, OCR Ingestion & Knowledge Gaps"])

ingestion_roles = require_roles(
    UserRole.SUPER_ADMIN,
    UserRole.KNOWLEDGE_ADMIN,
    UserRole.OCR_REVIEWER,
)
admin_or_knowledge = require_roles(UserRole.SUPER_ADMIN, UserRole.KNOWLEDGE_ADMIN)


def _to_document_response(doc: Document, chunk_count: int) -> DocumentResponse:
    cat = doc.category
    grp = cat.group if cat else None
    return DocumentResponse(
        id=doc.id,
        title=doc.title,
        category_id=doc.category_id,
        category_name=cat.name if cat else None,
        group_id=grp.id if grp else None,
        group_name=grp.name if grp else None,
        effective_date=doc.effective_date,
        ingestion_type=doc.ingestion_type,
        file_path=doc.file_path,
        file_url=f"/api/documents/{doc.id}/file",
        status=doc.status,
        created_by=doc.created_by,
        created_at=doc.created_at,
        chunk_count=chunk_count,
    )


def _validate_upload_path(file_path_str: str) -> Path:
    """Ensure file_path resides safely inside settings.UPLOAD_DIR (prevents path traversal)."""
    upload_root = Path(settings.UPLOAD_DIR).resolve()
    target = Path(file_path_str).resolve()
    try:
        target.relative_to(upload_root)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="พาธไฟล์ไม่อยู่ภายใต้โฟลเดอร์จัดเก็บ UPLOAD_DIR ที่ได้รับอนุญาต",
        )
    if not target.is_file():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="ไม่พบไฟล์ต้นฉบับที่ระบุใน UPLOAD_DIR",
        )
    return target


# ==============================================================================
# Stage 1 (Human-in-the-Loop): Upload + Extract/Thai OCR + Chunk Preview
# ==============================================================================


@router.post("/api/documents/extract-preview", response_model=ExtractPreviewResponse)
def extract_and_preview_document(
    file: UploadFile = File(...),
    max_chars: int = Query(default=1200, ge=300, le=4000),
    _user: User = Depends(ingestion_roles),
) -> ExtractPreviewResponse:
    """Upload PDF/DOCX/Image into UPLOAD_DIR, extract text (pypdf or Poppler+Tesseract tha+eng),
    and return editable text + Structure-Aware Chunk preview for Human-in-the-Loop review.
    """
    stored_filename, abs_path, ext = save_uploaded_file(file)
    extraction = extract_document_text(abs_path, ext)
    extracted_text = str(extraction["extracted_text"])

    chunks_raw = chunk_thai_official_text(extracted_text, max_chars=max_chars)
    chunks_preview = [ChunkPreviewItem(**c) for c in chunks_raw]

    return ExtractPreviewResponse(
        original_filename=file.filename or stored_filename,
        stored_filename=stored_filename,
        file_path=str(abs_path),
        ingestion_type=str(extraction["ingestion_type"]),
        page_count=int(extraction["page_count"]),
        used_ocr=bool(extraction["used_ocr"]),
        extracted_text=extracted_text,
        chunks_preview=chunks_preview,
    )


@router.post("/api/documents/chunk-preview", response_model=ChunkPreviewResponse)
def preview_structure_chunks(
    payload: ChunkPreviewRequest,
    _user: User = Depends(ingestion_roles),
) -> ChunkPreviewResponse:
    """Re-run Structure-Aware Chunker after human reviewer edits OCR text."""
    chunks_raw = chunk_thai_official_text(payload.text, max_chars=payload.max_chars)
    items = [ChunkPreviewItem(**c) for c in chunks_raw]
    return ChunkPreviewResponse(total_chunks=len(items), chunks=items)


# ==============================================================================
# Stage 2: Incremental Commit + Cloud Embedding + Optional Replace/Archive
# ==============================================================================


@router.post(
    "/api/documents/commit",
    response_model=DocumentCommitResponse,
    status_code=status.HTTP_201_CREATED,
)
async def commit_document_incremental(
    payload: DocumentCommitRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    policy: GovernancePolicy = Depends(get_governance_policy),
) -> DocumentCommitResponse:
    """Commit reviewed chunks with incremental Cloud Embedding update.

    - Enforces RBAC and `require_super_approve_for_ocr` governance policy.
    - If `replace_document_id` is supplied, enforces archive policy and marks old document `archived`.
    """
    ensure_can_commit_document(current_user, policy, payload.ingestion_type)

    category = db.scalar(
        select(DocumentCategory)
        .options(joinedload(DocumentCategory.group))
        .where(DocumentCategory.id == payload.category_id)
    )
    if category is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="ไม่พบหมวดหมู่เอกสารที่เลือก")

    # Validate file_path unless manual entry without physical file
    if payload.ingestion_type != "manual":
        _validate_upload_path(payload.file_path)

    # Validate replacement target (if "แทนที่ประกาศฉบับเดิม" is selected)
    old_doc: Optional[Document] = None
    if payload.replace_document_id is not None:
        ensure_can_archive_document(current_user, policy)
        old_doc = db.get(Document, payload.replace_document_id)
        if old_doc is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="ไม่พบเอกสารฉบับเดิมที่ต้องการแทนที่",
            )

    # Build final chunk list from either explicitly reviewed chunks or edited content_text
    prepared_chunks = []
    if payload.chunks:
        for idx, ch in enumerate(payload.chunks):
            prepared_chunks.append(
                {
                    "chunk_index": ch.chunk_index if ch.chunk_index is not None else idx,
                    "clause_heading": ch.clause_heading,
                    "content_text": ch.content_text.strip(),
                }
            )
    elif payload.content_text and payload.content_text.strip():
        for ch in chunk_thai_official_text(payload.content_text):
            prepared_chunks.append(
                {
                    "chunk_index": int(ch["chunk_index"]),
                    "clause_heading": ch["clause_heading"],
                    "content_text": str(ch["content_text"]),
                }
            )

    if not prepared_chunks:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="ไม่พบเนื้อหาหรือ Chunk สำหรับนำเข้าสู่ฐานข้อมูล",
        )

    # Call Cloud Embedding API (incremental — only for this document's chunks)
    embeddings: List[Optional[List[float]]] = [None] * len(prepared_chunks)
    embedded_count = 0
    embedding_warning: Optional[str] = None

    texts_to_embed = [
        f"{payload.title}\n{c['clause_heading'] or ''}\n{c['content_text']}".strip()
        for c in prepared_chunks
    ]

    if is_ai_configured():
        try:
            vectors = await create_embeddings(texts_to_embed)
            embeddings = [v for v in vectors]
            embedded_count = len(vectors)
        except AIClientError as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"ไม่สามารถแปลงเวกเตอร์ผ่าน Cloud Embedding API ได้: {exc}",
            )
    else:
        embedding_warning = (
            "ยังไม่ได้ตั้งค่า AI_API_KEY ในไฟล์ .env ระบบบันทึกเฉพาะข้อความ Chunk โดยยังไม่มีเวกเตอร์ Embedding"
        )

    new_doc = Document(
        title=payload.title.strip(),
        category_id=payload.category_id,
        effective_date=payload.effective_date,
        ingestion_type=payload.ingestion_type,
        file_path=payload.file_path,
        status=DocumentStatus.ACTIVE,
        created_by=current_user.id,
    )
    db.add(new_doc)
    db.flush()

    for ch_data, vec in zip(prepared_chunks, embeddings):
        db.add(
            DocumentChunk(
                document_id=new_doc.id,
                clause_heading=ch_data["clause_heading"],
                content_text=ch_data["content_text"],
                embedding=vec,
                chunk_index=ch_data["chunk_index"],
            )
        )

    archived_old_id: Optional[int] = None
    if old_doc is not None:
        old_doc.status = DocumentStatus.ARCHIVED
        archived_old_id = old_doc.id

    db.commit()
    db.refresh(new_doc)
    new_doc.category = category

    return DocumentCommitResponse(
        document=_to_document_response(new_doc, chunk_count=len(prepared_chunks)),
        embedded_chunks=embedded_count,
        archived_previous_document_id=archived_old_id,
        embedding_warning=embedding_warning,
    )


# ==============================================================================
# Document Listing, Details, Archive Toggle & Original File Serving
# ==============================================================================


@router.get("/api/documents", response_model=List[DocumentResponse])
def list_documents(
    doc_status: Optional[DocumentStatus] = Query(default=None, alias="status"),
    category_id: Optional[int] = Query(default=None),
    group_id: Optional[int] = Query(default=None),
    q: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
) -> List[DocumentResponse]:
    """List documents with optional filters by status, category, group, or title keyword."""
    stmt = (
        select(Document)
        .join(DocumentCategory, Document.category_id == DocumentCategory.id)
        .options(joinedload(Document.category).joinedload(DocumentCategory.group))
        .order_by(Document.effective_date.desc(), Document.created_at.desc())
    )
    if doc_status is not None:
        stmt = stmt.where(Document.status == doc_status)
    if category_id is not None:
        stmt = stmt.where(Document.category_id == category_id)
    if group_id is not None:
        stmt = stmt.where(DocumentCategory.group_id == group_id)
    if q and q.strip():
        stmt = stmt.where(Document.title.ilike(f"%{q.strip()}%"))

    docs = db.scalars(stmt).all()
    chunk_counts = dict(
        db.execute(
            select(DocumentChunk.document_id, func.count(DocumentChunk.id)).group_by(
                DocumentChunk.document_id
            )
        ).all()
    )

    return [_to_document_response(doc, chunk_counts.get(doc.id, 0)) for doc in docs]


@router.get("/api/documents/{document_id}", response_model=DocumentDetailResponse)
def get_document_detail(document_id: int, db: Session = Depends(get_db)) -> DocumentDetailResponse:
    """Fetch a document along with all of its ordered chunks."""
    doc = db.scalar(
        select(Document)
        .options(
            joinedload(Document.category).joinedload(DocumentCategory.group),
            joinedload(Document.chunks),
        )
        .where(Document.id == document_id)
    )
    if doc is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="ไม่พบเอกสารที่ระบุ")

    base = _to_document_response(doc, chunk_count=len(doc.chunks))
    return DocumentDetailResponse(
        **base.model_dump(),
        chunks=[DocumentChunkResponse.model_validate(c) for c in doc.chunks],
    )


@router.patch("/api/documents/{document_id}/status", response_model=DocumentResponse)
def update_document_status(
    document_id: int,
    payload: DocumentStatusUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    policy: GovernancePolicy = Depends(get_governance_policy),
) -> DocumentResponse:
    """Archive or reactivate a document (enforces allow_knowledge_admin_archive_docs policy)."""
    ensure_can_archive_document(current_user, policy)

    doc = db.scalar(
        select(Document)
        .options(joinedload(Document.category).joinedload(DocumentCategory.group))
        .where(Document.id == document_id)
    )
    if doc is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="ไม่พบเอกสารที่ระบุ")

    doc.status = payload.status
    db.commit()
    db.refresh(doc)

    chunk_count = (
        db.scalar(select(func.count(DocumentChunk.id)).where(DocumentChunk.document_id == doc.id))
        or 0
    )
    return _to_document_response(doc, chunk_count=chunk_count)


@router.get("/api/documents/{document_id}/file")
def download_original_document_file(document_id: int, db: Session = Depends(get_db)):
    """Serve the original uploaded PDF/DOCX/image file from UPLOAD_DIR."""
    doc = db.get(Document, document_id)
    if doc is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="ไม่พบเอกสารที่ระบุ")

    file_path = _validate_upload_path(doc.file_path)
    return FileResponse(path=str(file_path), filename=file_path.name)


# ==============================================================================
# Knowledge Gaps Management (/api/admin/knowledge-gaps)
# ==============================================================================


@router.get("/api/admin/knowledge-gaps", response_model=List[KnowledgeGapResponse])
def list_knowledge_gaps(
    gap_status: Optional[KnowledgeGapStatus] = Query(default=None, alias="status"),
    db: Session = Depends(get_db),
    _user: User = Depends(admin_or_knowledge),
) -> List[KnowledgeGapResponse]:
    """List unanswered questions recorded in knowledge_gaps ordered by frequency."""
    stmt = select(KnowledgeGap).order_by(
        KnowledgeGap.asked_count.desc(), KnowledgeGap.updated_at.desc()
    )
    if gap_status is not None:
        stmt = stmt.where(KnowledgeGap.status == gap_status)
    gaps = db.scalars(stmt).all()
    return [KnowledgeGapResponse.model_validate(g) for g in gaps]


@router.patch("/api/admin/knowledge-gaps/{gap_id}", response_model=KnowledgeGapResponse)
def update_knowledge_gap(
    gap_id: int,
    payload: KnowledgeGapUpdateRequest,
    db: Session = Depends(get_db),
    _user: User = Depends(admin_or_knowledge),
) -> KnowledgeGapResponse:
    """Update status or suggested_category of a knowledge gap item."""
    gap = db.get(KnowledgeGap, gap_id)
    if gap is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="ไม่พบรายการ Knowledge Gap ที่ระบุ")

    if payload.suggested_category is not None:
        gap.suggested_category = payload.suggested_category.strip()
    if payload.status is not None:
        gap.status = payload.status

    db.commit()
    db.refresh(gap)
    return KnowledgeGapResponse.model_validate(gap)
