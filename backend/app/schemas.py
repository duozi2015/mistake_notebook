from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field


# === 用户相关 ===
class UserRegister(BaseModel):
    username: str = Field(min_length=3, max_length=50)
    password: str = Field(min_length=8, max_length=100)
    display_name: str = Field(default="", max_length=100)


class UserLogin(BaseModel):
    username: str
    password: str


class UserResponse(BaseModel):
    id: int
    username: str
    display_name: str

    class Config:
        from_attributes = True


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int
    user: UserResponse


class RefreshRequest(BaseModel):
    refresh_token: str


class PasswordChange(BaseModel):
    old_password: str
    new_password: str = Field(min_length=8, max_length=100)


# === 图片相关 ===
class ImageResponse(BaseModel):
    id: int
    file_path: str
    mime_type: str
    file_size: int
    image_type: str = "question"

    class Config:
        from_attributes = True


# === 错题相关 ===
class QuestionCreate(BaseModel):
    question_content: str = ""
    subject: str = ""
    tags: list[str] = []
    error_type: str = ""
    difficulty: int = Field(default=3, ge=1, le=5)
    source: str = ""
    correct_solution: str = ""
    user_analysis: str = ""
    image_ids: list[int] = []
    solution_image_ids: list[int] = []


class QuestionUpdate(BaseModel):
    question_content: Optional[str] = None
    subject: Optional[str] = None
    tags: Optional[list[str]] = None
    error_type: Optional[str] = None
    difficulty: Optional[int] = None
    source: Optional[str] = None
    correct_solution: Optional[str] = None
    user_analysis: Optional[str] = None
    status: Optional[str] = None


class QuestionResponse(BaseModel):
    id: int
    question_content: str
    subject: str
    tags: list[str]
    images: list[ImageResponse]
    solution_images: list[ImageResponse] = []
    error_type: str
    difficulty: int
    source: str
    correct_solution: str
    user_analysis: str
    status: str
    next_review_date: Optional[datetime]
    current_ef: float
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# === 分页 ===
class Pagination(BaseModel):
    page: int
    page_size: int
    total: int
    total_pages: int


class PaginatedQuestions(BaseModel):
    data: list[QuestionResponse]
    pagination: Pagination


# === 统一错误 ===
class ErrorDetail(BaseModel):
    code: str
    message: str
    details: Optional[dict] = None


class ErrorResponse(BaseModel):
    error: ErrorDetail