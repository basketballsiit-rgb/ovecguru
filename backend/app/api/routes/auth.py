"""Authentication routes: email/password login returning JWT + current user profile."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_governance_policy
from app.core.security import create_access_token, verify_password
from app.db.session import get_db
from app.models import GovernancePolicy, User, UserStatus
from app.schemas.auth import (
    GovernancePolicyResponse,
    LoginRequest,
    MeResponse,
    TokenResponse,
    UserResponse,
)

router = APIRouter(prefix="/api/auth", tags=["Authentication"])


@router.post("/login", response_model=TokenResponse)
def login(
    payload: LoginRequest,
    db: Session = Depends(get_db),
    policy: GovernancePolicy = Depends(get_governance_policy),
) -> TokenResponse:
    """Authenticate with email and password and issue a Bearer JWT token."""
    user = db.scalar(select(User).where(func.lower(User.email) == payload.email.lower().strip()))
    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="อีเมลหรือรหัสผ่านไม่ถูกต้อง",
        )
    if user.status != UserStatus.ACTIVE:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="บัญชีผู้ใช้งานนี้ถูกระงับสิทธิ์การใช้งาน กรุณาติดต่อผู้ดูแลระบบสูงสุด",
        )

    token = create_access_token(
        user_id=user.id,
        role=user.role.value,
        extra_claims={"is_primary_super": user.is_primary_super},
    )
    return TokenResponse(
        access_token=token,
        token_type="bearer",
        user=UserResponse.model_validate(user),
        governance_policy=GovernancePolicyResponse.model_validate(policy),
    )


@router.get("/me", response_model=MeResponse)
def get_me(
    current_user: User = Depends(get_current_user),
    policy: GovernancePolicy = Depends(get_governance_policy),
) -> MeResponse:
    """Return the authenticated user's profile and active governance policy."""
    return MeResponse(
        user=UserResponse.model_validate(current_user),
        governance_policy=GovernancePolicyResponse.model_validate(policy),
    )
