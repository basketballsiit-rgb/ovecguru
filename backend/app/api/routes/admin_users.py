"""Super Admin User Management (/api/admin/users) and Governance Policy (/api/admin/governance)."""

from pathlib import Path
from typing import Optional

from dotenv import set_key
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.api.deps import get_governance_policy, require_roles
from app.core.config import settings
from app.core.security import hash_password
from app.db.session import get_db
from app.models import GovernancePolicy, User, UserRole, UserStatus
from app.schemas.auth import (
    AIConfigResponse,
    AIConfigUpdateRequest,
    GovernancePolicyResponse,
    GovernancePolicyUpdate,
    TransferPrimarySuperRequest,
    UserCreateRequest,
    UserListResponse,
    UserResponse,
    UserUpdateRequest,
)
from app.services.ai_client import (
    AIClientError,
    create_embeddings,
    get_live_ai_config,
    is_ai_configured,
    mask_api_key,
)

router = APIRouter(tags=["Admin Users & Governance"])

super_admin_only = require_roles(UserRole.SUPER_ADMIN)


def _count_active_super_admins(db: Session) -> int:
    return (
        db.scalar(
            select(func.count(User.id)).where(
                User.role == UserRole.SUPER_ADMIN,
                User.status == UserStatus.ACTIVE,
            )
        )
        or 0
    )


@router.get("/api/admin/users", response_model=UserListResponse)
def list_users(
    q: Optional[str] = Query(default=None, description="ค้นหาจากชื่อ อีเมล หรือหน่วยงาน"),
    role: Optional[UserRole] = Query(default=None, description="กรองตามระดับสิทธิ์"),
    user_status: Optional[UserStatus] = Query(default=None, alias="status", description="กรองตามสถานะ"),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
    _admin: User = Depends(super_admin_only),
) -> UserListResponse:
    """List, search, and filter users (Super Admin only)."""
    filters = []
    if q and q.strip():
        pattern = f"%{q.strip()}%"
        filters.append(
            or_(
                User.full_name.ilike(pattern),
                User.email.ilike(pattern),
                User.department.ilike(pattern),
            )
        )
    if role is not None:
        filters.append(User.role == role)
    if user_status is not None:
        filters.append(User.status == user_status)

    total = db.scalar(select(func.count(User.id)).where(*filters)) or 0
    items = db.scalars(
        select(User)
        .where(*filters)
        .order_by(User.is_primary_super.desc(), User.id.asc())
        .offset(skip)
        .limit(limit)
    ).all()

    return UserListResponse(
        total=total,
        items=[UserResponse.model_validate(u) for u in items],
    )


@router.post("/api/admin/users", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def create_user(
    payload: UserCreateRequest,
    db: Session = Depends(get_db),
    _admin: User = Depends(super_admin_only),
) -> UserResponse:
    """Create a new user account (Super Admin only)."""
    normalized_email = payload.email.lower().strip()
    existing = db.scalar(select(User).where(func.lower(User.email) == normalized_email))
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="อีเมลนี้ถูกใช้งานในระบบแล้ว",
        )

    user = User(
        full_name=payload.full_name.strip(),
        email=normalized_email,
        password_hash=hash_password(payload.password),
        department=payload.department.strip(),
        role=payload.role,
        status=payload.status,
        is_primary_super=False,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return UserResponse.model_validate(user)


@router.patch("/api/admin/users/{user_id}", response_model=UserResponse)
def update_user(
    user_id: int,
    payload: UserUpdateRequest,
    db: Session = Depends(get_db),
    _admin: User = Depends(super_admin_only),
) -> UserResponse:
    """Update a user while strictly protecting the last active Super Admin and Primary Super Admin."""
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="ไม่พบผู้ใช้งานที่ระบุ")

    new_role = payload.role if payload.role is not None else user.role
    new_status = payload.status if payload.status is not None else user.status

    is_demoting = user.role == UserRole.SUPER_ADMIN and new_role != UserRole.SUPER_ADMIN
    is_suspending = user.status == UserStatus.ACTIVE and new_status != UserStatus.ACTIVE

    # Iron Rule 1: Primary Super Admin cannot be demoted or suspended directly
    if user.is_primary_super and (is_demoting or is_suspending):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="ไม่สามารถลดระดับสิทธิ์หรือระงับสิทธิ์ Primary Super Admin ได้ กรุณาโอนย้ายตำแหน่ง Primary Super Admin ก่อน",
        )

    # Iron Rule 2: Never allow demoting or suspending the LAST active super_admin
    if user.role == UserRole.SUPER_ADMIN and user.status == UserStatus.ACTIVE:
        if (is_demoting or is_suspending) and _count_active_super_admins(db) <= 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="กฎเหล็กความปลอดภัย: ห้ามลดระดับสิทธิ์หรือระงับสิทธิ์ผู้ดูแลระบบสูงสุด (Super Admin) คนสุดท้ายที่ยังเปิดใช้งานอยู่",
            )

    if payload.email is not None:
        normalized_email = payload.email.lower().strip()
        conflict = db.scalar(
            select(User).where(func.lower(User.email) == normalized_email, User.id != user.id)
        )
        if conflict is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="อีเมลนี้ถูกใช้งานโดยบัญชีอื่นแล้ว",
            )
        user.email = normalized_email

    if payload.full_name is not None:
        user.full_name = payload.full_name.strip()
    if payload.department is not None:
        user.department = payload.department.strip()
    if payload.password is not None:
        user.password_hash = hash_password(payload.password)

    user.role = new_role
    user.status = new_status

    db.commit()
    db.refresh(user)
    return UserResponse.model_validate(user)


@router.delete("/api/admin/users/{user_id}", status_code=status.HTTP_200_OK)
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    _admin: User = Depends(super_admin_only),
) -> dict:
    """Delete a user while strictly forbidding deletion of Primary or Last Active Super Admin."""
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="ไม่พบผู้ใช้งานที่ระบุ")

    if user.is_primary_super:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="ห้ามลบบัญชี Primary Super Admin กรุณาโอนย้ายตำแหน่ง Primary Super Admin ให้ผู้ดูแลท่านอื่นก่อน",
        )

    if (
        user.role == UserRole.SUPER_ADMIN
        and user.status == UserStatus.ACTIVE
        and _count_active_super_admins(db) <= 1
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="กฎเหล็กความปลอดภัย: ห้ามลบผู้ดูแลระบบสูงสุด (Super Admin) คนสุดท้ายที่ยังเปิดใช้งานอยู่",
        )

    db.delete(user)
    db.commit()
    return {"message": "ลบผู้ใช้งานเรียบร้อยแล้ว", "deleted_user_id": user_id}


@router.get("/api/admin/governance/policy", response_model=GovernancePolicyResponse)
def read_governance_policy(
    policy: GovernancePolicy = Depends(get_governance_policy),
    _admin: User = Depends(super_admin_only),
) -> GovernancePolicyResponse:
    """Read current Super Admin governance policies."""
    return GovernancePolicyResponse.model_validate(policy)


@router.put("/api/admin/governance/policy", response_model=GovernancePolicyResponse)
def update_governance_policy(
    payload: GovernancePolicyUpdate,
    db: Session = Depends(get_db),
    policy: GovernancePolicy = Depends(get_governance_policy),
    _admin: User = Depends(super_admin_only),
) -> GovernancePolicyResponse:
    """Update Super Admin governance policies (enforced immediately across all roles)."""
    policy.allow_knowledge_admin_manage_categories = payload.allow_knowledge_admin_manage_categories
    policy.allow_knowledge_admin_archive_docs = payload.allow_knowledge_admin_archive_docs
    policy.require_super_approve_for_ocr = payload.require_super_approve_for_ocr
    db.commit()
    db.refresh(policy)
    return GovernancePolicyResponse.model_validate(policy)


@router.post("/api/admin/governance/transfer-primary", response_model=UserResponse)
def transfer_primary_super_admin(
    payload: TransferPrimarySuperRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(super_admin_only),
) -> UserResponse:
    """Transfer the Primary Super Admin role to another active Super Admin."""
    if not current_user.is_primary_super:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="เฉพาะผู้ถือตำแหน่ง Primary Super Admin คนปัจจุบันเท่านั้นที่สามารถโอนย้ายตำแหน่งนี้ได้",
        )

    if payload.target_user_id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="ผู้ใช้งานเป้าหมายคือ Primary Super Admin คนปัจจุบันอยู่แล้ว",
        )

    target = db.get(User, payload.target_user_id)
    if target is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="ไม่พบผู้ใช้งานเป้าหมาย")
    if target.role != UserRole.SUPER_ADMIN or target.status != UserStatus.ACTIVE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="ผู้รับโอนตำแหน่ง Primary Super Admin ต้องมีสิทธิ์ระดับ super_admin และมีสถานะ active เท่านั้น",
        )

    current_user.is_primary_super = False
    target.is_primary_super = True
    db.commit()
    db.refresh(target)
    return UserResponse.model_validate(target)


# ==============================================================================
# Cloud AI API Settings (/api/admin/ai-config) — Super Admin Only
# ==============================================================================


@router.get("/api/admin/ai-config", response_model=AIConfigResponse)
def read_ai_config(_admin: User = Depends(super_admin_only)) -> AIConfigResponse:
    """Return current Cloud AI API configuration (with masked API Key)."""
    cfg = get_live_ai_config()
    return AIConfigResponse(
        ai_api_base_url=str(cfg["api_base_url"]),
        ai_api_key_configured=is_ai_configured(),
        ai_api_key_masked=mask_api_key(str(cfg["api_key"])),
        ai_chat_model=str(cfg["chat_model"]),
        ai_embedding_model=str(cfg["embedding_model"]),
        ai_embedding_dimensions=int(cfg["embedding_dimensions"]),
        rag_min_relevance_score=float(cfg["rag_min_relevance_score"]),
    )


@router.put("/api/admin/ai-config", response_model=AIConfigResponse)
def update_ai_config(
    payload: AIConfigUpdateRequest,
    _admin: User = Depends(super_admin_only),
) -> AIConfigResponse:
    """Persist Cloud AI API settings to .env and apply immediately across all workers."""
    cfg = get_live_ai_config()
    env_path = Path(str(cfg["env_file_path"]))
    if not env_path.exists():
        env_path.touch()

    base_url = payload.ai_api_base_url.strip()
    chat_model = payload.ai_chat_model.strip()
    embedding_model = payload.ai_embedding_model.strip()

    set_key(str(env_path), "AI_API_BASE_URL", base_url)
    set_key(str(env_path), "AI_CHAT_MODEL", chat_model)
    set_key(str(env_path), "AI_EMBEDDING_MODEL", embedding_model)

    settings.AI_API_BASE_URL = base_url
    settings.AI_CHAT_MODEL = chat_model
    settings.AI_EMBEDDING_MODEL = embedding_model

    if payload.ai_api_key is not None and payload.ai_api_key.strip():
        clean_key = payload.ai_api_key.strip()
        set_key(str(env_path), "AI_API_KEY", clean_key)
        settings.AI_API_KEY = clean_key

    if payload.rag_min_relevance_score is not None:
        set_key(str(env_path), "RAG_MIN_RELEVANCE_SCORE", str(payload.rag_min_relevance_score))
        settings.RAG_MIN_RELEVANCE_SCORE = payload.rag_min_relevance_score

    updated = get_live_ai_config()
    return AIConfigResponse(
        ai_api_base_url=str(updated["api_base_url"]),
        ai_api_key_configured=is_ai_configured(),
        ai_api_key_masked=mask_api_key(str(updated["api_key"])),
        ai_chat_model=str(updated["chat_model"]),
        ai_embedding_model=str(updated["embedding_model"]),
        ai_embedding_dimensions=int(updated["embedding_dimensions"]),
        rag_min_relevance_score=float(updated["rag_min_relevance_score"]),
    )


@router.post("/api/admin/ai-config/test")
async def test_ai_config(_admin: User = Depends(super_admin_only)) -> dict:
    """Test the configured Cloud AI API by requesting a single test embedding."""
    try:
        vectors = await create_embeddings(["ทดสอบการเชื่อมต่อ OVEC GURU Cloud AI API"])
        dim = len(vectors[0]) if vectors else 0
        return {
            "ok": True,
            "message": f"เชื่อมต่อ Cloud AI API สำเร็จ! (ขนาดเวกเตอร์ Embedding: {dim} มิติ)",
            "vector_dimensions": dim,
        }
    except AIClientError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
