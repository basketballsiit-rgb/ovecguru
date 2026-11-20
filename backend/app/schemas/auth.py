from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.models.user import UserRole, UserStatus


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=1)


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    full_name: str
    email: EmailStr
    department: str
    role: UserRole
    status: UserStatus
    is_primary_super: bool
    created_at: datetime
    updated_at: datetime


class GovernancePolicyResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    allow_knowledge_admin_manage_categories: bool
    allow_knowledge_admin_archive_docs: bool
    require_super_approve_for_ocr: bool
    updated_at: datetime


class GovernancePolicyUpdate(BaseModel):
    allow_knowledge_admin_manage_categories: bool
    allow_knowledge_admin_archive_docs: bool
    require_super_approve_for_ocr: bool


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse
    governance_policy: GovernancePolicyResponse


class MeResponse(BaseModel):
    user: UserResponse
    governance_policy: GovernancePolicyResponse


class UserCreateRequest(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=255)
    email: EmailStr
    password: str = Field(..., min_length=6, max_length=128)
    department: str = Field(default="", max_length=255)
    role: UserRole = UserRole.COLLEGE_STAFF
    status: UserStatus = UserStatus.ACTIVE


class UserUpdateRequest(BaseModel):
    full_name: Optional[str] = Field(default=None, min_length=2, max_length=255)
    email: Optional[EmailStr] = None
    password: Optional[str] = Field(default=None, min_length=6, max_length=128)
    department: Optional[str] = Field(default=None, max_length=255)
    role: Optional[UserRole] = None
    status: Optional[UserStatus] = None


class UserListResponse(BaseModel):
    total: int
    items: List[UserResponse]


class TransferPrimarySuperRequest(BaseModel):
    target_user_id: int


class AIConfigResponse(BaseModel):
    ai_api_base_url: str
    ai_api_key_configured: bool
    ai_api_key_masked: str
    ai_chat_model: str
    ai_embedding_model: str
    ai_embedding_dimensions: int
    rag_min_relevance_score: float


class AIConfigUpdateRequest(BaseModel):
    ai_api_base_url: str = Field(..., min_length=8, max_length=500)
    ai_api_key: Optional[str] = Field(default=None, max_length=500)
    ai_chat_model: str = Field(..., min_length=1, max_length=200)
    ai_embedding_model: str = Field(..., min_length=1, max_length=200)
    rag_min_relevance_score: Optional[float] = Field(default=None, ge=0.1, le=0.95)
