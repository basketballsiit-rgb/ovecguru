from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field


class DocumentCategoryBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    group_id: int
    is_default: bool = False


class DocumentCategoryCreate(DocumentCategoryBase):
    pass


class DocumentCategoryUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    group_id: Optional[int] = None
    is_default: Optional[bool] = None


class DocumentCategoryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    group_id: int
    group_name: Optional[str] = None
    is_default: bool
    document_count: int = 0


class DocumentGroupCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None


class DocumentGroupUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    description: Optional[str] = None


class DocumentGroupResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    description: Optional[str] = None
    category_count: int = 0
    categories: List[DocumentCategoryResponse] = Field(default_factory=list)
