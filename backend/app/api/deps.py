"""FastAPI dependencies for authentication, RBAC, and governance policy enforcement."""

from typing import Callable, Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.security import JWTError, decode_access_token
from app.db.session import get_db
from app.models import GovernancePolicy, User, UserRole, UserStatus

bearer_scheme = HTTPBearer(auto_error=False)


def get_governance_policy(db: Session = Depends(get_db)) -> GovernancePolicy:
    """Fetch singleton governance policy (auto-creating default row id=1 if absent)."""
    policy = db.get(GovernancePolicy, 1)
    if policy is None:
        policy = GovernancePolicy(
            id=1,
            allow_knowledge_admin_manage_categories=False,
            allow_knowledge_admin_archive_docs=False,
            require_super_approve_for_ocr=True,
        )
        db.add(policy)
        db.commit()
        db.refresh(policy)
    return policy


def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    """Authenticate caller from Bearer JWT and verify active account status."""
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="กรุณาเข้าสู่ระบบก่อนใช้งาน (ไม่พบ Token)",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        payload = decode_access_token(credentials.credentials)
        sub = payload.get("sub")
        user_id = int(sub) if sub is not None else None
    except (JWTError, ValueError, TypeError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token ไม่ถูกต้องหรือหมดอายุ กรุณาเข้าสู่ระบบใหม่",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token ไม่สมบูรณ์",
        )

    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="ไม่พบบัญชีผู้ใช้งานนี้ในระบบ",
        )
    if user.status != UserStatus.ACTIVE:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="บัญชีผู้ใช้งานนี้ถูกระงับสิทธิ์การใช้งาน",
        )
    return user


def require_roles(*allowed_roles: UserRole) -> Callable[[User], User]:
    """Dependency factory enforcing that the authenticated user holds one of allowed_roles."""

    def _checker(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="คุณไม่มีสิทธิ์เข้าถึงฟังก์ชันนี้",
            )
        return current_user

    return _checker


def require_category_manager(
    current_user: User = Depends(get_current_user),
    policy: GovernancePolicy = Depends(get_governance_policy),
) -> User:
    """Enforce governance policy for managing document groups & categories."""
    if current_user.role == UserRole.SUPER_ADMIN:
        return current_user
    if (
        current_user.role == UserRole.KNOWLEDGE_ADMIN
        and policy.allow_knowledge_admin_manage_categories
    ):
        return current_user
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="นโยบายปัจจุบันอนุญาตเฉพาะผู้ดูแลระบบสูงสุด (Super Admin) ในการจัดการกลุ่มและหมวดหมู่เอกสาร",
    )


def ensure_can_archive_document(user: User, policy: GovernancePolicy) -> None:
    """Enforce governance policy for archiving/replacing existing documents."""
    if user.role == UserRole.SUPER_ADMIN:
        return
    if user.role == UserRole.KNOWLEDGE_ADMIN and policy.allow_knowledge_admin_archive_docs:
        return
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="นโยบายปัจจุบันไม่อนุญาตให้จัดเก็บเอกสารเข้าคลังเก่า (Archive) หรือแทนที่ประกาศเดิม กรุณาติดต่อ Super Admin",
    )


def ensure_can_commit_document(
    user: User,
    policy: GovernancePolicy,
    ingestion_type: str,
) -> None:
    """Enforce role & OCR approval governance policy when committing documents."""
    if user.role == UserRole.SUPER_ADMIN:
        return
    if user.role not in (UserRole.KNOWLEDGE_ADMIN, UserRole.OCR_REVIEWER):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="คุณไม่มีสิทธิ์นำเข้าเอกสารสู่คลังความรู้",
        )
    if ingestion_type == "pdf_ocr" and policy.require_super_approve_for_ocr:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="นโยบายปัจจุบันกำหนดให้เอกสารที่ผ่านการสกัดด้วย OCR ต้องได้รับการอนุมัติและนำเข้าโดย Super Admin เท่านั้น",
        )
