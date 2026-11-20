"""Document Groups (/api/admin/groups) and Categories (/api/categories) CRUD API."""

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session, joinedload

from app.api.deps import require_category_manager
from app.db.session import get_db
from app.models import Document, DocumentCategory, DocumentGroup, KnowledgeGap, User
from app.schemas.category import (
    DocumentCategoryCreate,
    DocumentCategoryResponse,
    DocumentCategoryUpdate,
    DocumentGroupCreate,
    DocumentGroupResponse,
    DocumentGroupUpdate,
)

router = APIRouter(tags=["Document Groups & Categories"])


# ==============================================================================
# Document Groups (/api/admin/groups)
# ==============================================================================


@router.get("/api/admin/groups", response_model=List[DocumentGroupResponse])
def list_document_groups(db: Session = Depends(get_db)) -> List[DocumentGroupResponse]:
    """List all document groups along with their child categories and document counts."""
    groups = db.scalars(
        select(DocumentGroup)
        .options(joinedload(DocumentGroup.categories))
        .order_by(DocumentGroup.id.asc())
    ).unique().all()

    doc_counts = dict(
        db.execute(
            select(Document.category_id, func.count(Document.id)).group_by(Document.category_id)
        ).all()
    )

    results: List[DocumentGroupResponse] = []
    for grp in groups:
        cats = [
            DocumentCategoryResponse(
                id=cat.id,
                name=cat.name,
                group_id=cat.group_id,
                group_name=grp.name,
                is_default=cat.is_default,
                document_count=doc_counts.get(cat.id, 0),
            )
            for cat in sorted(grp.categories, key=lambda c: c.id)
        ]
        results.append(
            DocumentGroupResponse(
                id=grp.id,
                name=grp.name,
                description=grp.description,
                category_count=len(cats),
                categories=cats,
            )
        )
    return results


@router.post(
    "/api/admin/groups",
    response_model=DocumentGroupResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_document_group(
    payload: DocumentGroupCreate,
    db: Session = Depends(get_db),
    _manager: User = Depends(require_category_manager),
) -> DocumentGroupResponse:
    """Create a new top-level document group."""
    name = payload.name.strip()
    existing = db.scalar(select(DocumentGroup).where(func.lower(DocumentGroup.name) == name.lower()))
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="ชื่อกลุ่มประเภทเอกสารนี้มีอยู่ในระบบแล้ว",
        )

    group = DocumentGroup(name=name, description=payload.description)
    db.add(group)
    db.commit()
    db.refresh(group)
    return DocumentGroupResponse(
        id=group.id,
        name=group.name,
        description=group.description,
        category_count=0,
        categories=[],
    )


@router.patch("/api/admin/groups/{group_id}", response_model=DocumentGroupResponse)
def update_document_group(
    group_id: int,
    payload: DocumentGroupUpdate,
    db: Session = Depends(get_db),
    _manager: User = Depends(require_category_manager),
) -> DocumentGroupResponse:
    """Update a document group's name or description."""
    group = db.get(DocumentGroup, group_id)
    if group is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="ไม่พบกลุ่มประเภทเอกสารที่ระบุ")

    if payload.name is not None:
        new_name = payload.name.strip()
        conflict = db.scalar(
            select(DocumentGroup).where(
                func.lower(DocumentGroup.name) == new_name.lower(),
                DocumentGroup.id != group.id,
            )
        )
        if conflict is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="ชื่อกลุ่มประเภทเอกสารนี้มีอยู่ในระบบแล้ว",
            )
        group.name = new_name

    if payload.description is not None:
        group.description = payload.description

    db.commit()
    db.refresh(group)

    cats = db.scalars(
        select(DocumentCategory)
        .where(DocumentCategory.group_id == group.id)
        .order_by(DocumentCategory.id.asc())
    ).all()
    return DocumentGroupResponse(
        id=group.id,
        name=group.name,
        description=group.description,
        category_count=len(cats),
        categories=[
            DocumentCategoryResponse(
                id=c.id,
                name=c.name,
                group_id=c.group_id,
                group_name=group.name,
                is_default=c.is_default,
                document_count=0,
            )
            for c in cats
        ],
    )


@router.delete("/api/admin/groups/{group_id}", status_code=status.HTTP_200_OK)
def delete_document_group(
    group_id: int,
    db: Session = Depends(get_db),
    _manager: User = Depends(require_category_manager),
) -> dict:
    """Delete a document group only when it has no child categories."""
    group = db.get(DocumentGroup, group_id)
    if group is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="ไม่พบกลุ่มประเภทเอกสารที่ระบุ")

    child_count = (
        db.scalar(select(func.count(DocumentCategory.id)).where(DocumentCategory.group_id == group_id))
        or 0
    )
    if child_count > 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"ไม่สามารถลบกลุ่มประเภทเอกสารนี้ได้ เนื่องจากยังมีหมวดหมู่ย่อยสังกัดอยู่ {child_count} หมวดหมู่",
        )

    db.delete(group)
    db.commit()
    return {"message": "ลบกลุ่มประเภทเอกสารเรียบร้อยแล้ว", "deleted_group_id": group_id}


# ==============================================================================
# Document Categories (/api/categories)
# ==============================================================================


@router.get("/api/categories", response_model=List[DocumentCategoryResponse])
def list_categories(
    group_id: Optional[int] = Query(default=None, description="กรองตามกลุ่มประเภทเอกสารหลัก"),
    db: Session = Depends(get_db),
) -> List[DocumentCategoryResponse]:
    """List document categories (optionally filtered by group_id)."""
    stmt = (
        select(DocumentCategory)
        .options(joinedload(DocumentCategory.group))
        .order_by(DocumentCategory.group_id.asc(), DocumentCategory.id.asc())
    )
    if group_id is not None:
        stmt = stmt.where(DocumentCategory.group_id == group_id)

    categories = db.scalars(stmt).all()
    doc_counts = dict(
        db.execute(
            select(Document.category_id, func.count(Document.id)).group_by(Document.category_id)
        ).all()
    )

    return [
        DocumentCategoryResponse(
            id=cat.id,
            name=cat.name,
            group_id=cat.group_id,
            group_name=cat.group.name if cat.group else None,
            is_default=cat.is_default,
            document_count=doc_counts.get(cat.id, 0),
        )
        for cat in categories
    ]


@router.post(
    "/api/categories",
    response_model=DocumentCategoryResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_category(
    payload: DocumentCategoryCreate,
    db: Session = Depends(get_db),
    _manager: User = Depends(require_category_manager),
) -> DocumentCategoryResponse:
    """Create a new document category under an existing document group."""
    group = db.get(DocumentGroup, payload.group_id)
    if group is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="ไม่พบกลุ่มประเภทเอกสารหลักที่เลือก")

    name = payload.name.strip()
    existing = db.scalar(
        select(DocumentCategory).where(
            DocumentCategory.group_id == payload.group_id,
            func.lower(DocumentCategory.name) == name.lower(),
        )
    )
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="ชื่อหมวดหมู่เอกสารนี้มีอยู่ในกลุ่มเดียวกันแล้ว",
        )

    category = DocumentCategory(
        name=name,
        group_id=payload.group_id,
        is_default=payload.is_default,
    )
    db.add(category)
    db.commit()
    db.refresh(category)

    return DocumentCategoryResponse(
        id=category.id,
        name=category.name,
        group_id=category.group_id,
        group_name=group.name,
        is_default=category.is_default,
        document_count=0,
    )


@router.patch("/api/categories/{category_id}", response_model=DocumentCategoryResponse)
def update_category(
    category_id: int,
    payload: DocumentCategoryUpdate,
    db: Session = Depends(get_db),
    _manager: User = Depends(require_category_manager),
) -> DocumentCategoryResponse:
    """Update a category and auto-sync related records (e.g. knowledge_gaps.suggested_category)."""
    category = db.get(DocumentCategory, category_id)
    if category is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="ไม่พบหมวดหมู่เอกสารที่ระบุ")

    old_name = category.name
    target_group_id = payload.group_id if payload.group_id is not None else category.group_id
    target_name = payload.name.strip() if payload.name is not None else category.name

    group = db.get(DocumentGroup, target_group_id)
    if group is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="ไม่พบกลุ่มประเภทเอกสารหลักที่เลือก")

    conflict = db.scalar(
        select(DocumentCategory).where(
            DocumentCategory.group_id == target_group_id,
            func.lower(DocumentCategory.name) == target_name.lower(),
            DocumentCategory.id != category.id,
        )
    )
    if conflict is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="ชื่อหมวดหมู่เอกสารนี้มีอยู่ในกลุ่มเดียวกันแล้ว",
        )

    category.name = target_name
    category.group_id = target_group_id
    if payload.is_default is not None:
        category.is_default = payload.is_default

    # Auto-sync renamed category name to knowledge_gaps.suggested_category
    if old_name != target_name:
        db.execute(
            update(KnowledgeGap)
            .where(KnowledgeGap.suggested_category == old_name)
            .values(suggested_category=target_name)
        )

    db.commit()
    db.refresh(category)

    doc_count = (
        db.scalar(select(func.count(Document.id)).where(Document.category_id == category.id)) or 0
    )
    return DocumentCategoryResponse(
        id=category.id,
        name=category.name,
        group_id=category.group_id,
        group_name=group.name,
        is_default=category.is_default,
        document_count=doc_count,
    )


@router.delete("/api/categories/{category_id}", status_code=status.HTTP_200_OK)
def delete_category(
    category_id: int,
    db: Session = Depends(get_db),
    _manager: User = Depends(require_category_manager),
) -> dict:
    """Delete a category only when no documents are attached to it."""
    category = db.get(DocumentCategory, category_id)
    if category is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="ไม่พบหมวดหมู่เอกสารที่ระบุ")

    doc_count = (
        db.scalar(select(func.count(Document.id)).where(Document.category_id == category_id)) or 0
    )
    if doc_count > 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"ไม่สามารถลบหมวดหมู่นี้ได้ เนื่องจากยังมีเอกสารผูกอยู่ในคลังจำนวน {doc_count} ฉบับ",
        )

    db.delete(category)
    db.commit()
    return {"message": "ลบหมวดหมู่เอกสารเรียบร้อยแล้ว", "deleted_category_id": category_id}
