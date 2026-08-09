from datetime import datetime, date
from typing import Optional
from pydantic import BaseModel, Field, ConfigDict


# === 用户相关 ===
class UserRegister(BaseModel):
    username: str = Field(min_length=3, max_length=50)
    password: str = Field(min_length=8, max_length=100)
    display_name: str = Field(default="", max_length=100)
    invite_code: str = Field(default="", max_length=20)
    role: str = Field(default="student", pattern="^(student|parent)$")


class UserLogin(BaseModel):
    username: str
    password: str


class UserResponse(BaseModel):
    id: int
    username: str
    display_name: str
    role: str

    model_config = ConfigDict(from_attributes=True)


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

    model_config = ConfigDict(from_attributes=True)


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

    model_config = ConfigDict(from_attributes=True)


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


# === 管理员相关 ===
class RegistrationModeUpdate(BaseModel):
    mode: str = Field(..., pattern="^(open|invite_only)$")


class InviteCodeResponse(BaseModel):
    code: str
    expires_at: datetime
    used: bool
    remaining_seconds: int


class AdminSettingsResponse(BaseModel):
    registration_mode: str
    invite_code: InviteCodeResponse | None = None


# === 家庭绑定 ===
class FamilyBindRequest(BaseModel):
    username: str = Field(min_length=3, max_length=50)


class FamilyBindResponse(BaseModel):
    id: int
    parent_id: int
    student_id: int
    student_username: str
    student_display_name: str
    status: str


class FamilyChildResponse(BaseModel):
    id: int
    student_id: int
    username: str
    display_name: str
    status: str
    created_at: datetime


class FamilyRequestResponse(BaseModel):
    id: int
    parent_id: int
    username: str
    display_name: str


class FamilyParentResponse(BaseModel):
    id: int
    parent_id: int
    username: str
    display_name: str
    status: str


# === 任务 ===
CATEGORY_PATTERN = "^(learning|sports|chores)$"


class TaskImageResponse(BaseModel):
    id: int
    kind: str
    file_path: str
    mime_type: str
    file_size: int
    original_name: str


class TaskTemplateCreate(BaseModel):
    student_id: int
    category: str = Field(..., pattern=CATEGORY_PATTERN)
    subject: str = ""
    name: str = Field(..., min_length=1, max_length=100)
    description: str = ""
    require_evidence: bool = True
    repeat_type: str = Field("none", pattern="^(none|daily|weekly)$")
    repeat_weekdays: list[int] = []
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    illustration_image_ids: list[int] = []


class TaskTemplateUpdate(BaseModel):
    category: Optional[str] = Field(default=None, pattern=CATEGORY_PATTERN)
    subject: Optional[str] = None
    name: Optional[str] = None
    description: Optional[str] = None
    require_evidence: Optional[bool] = None
    repeat_type: Optional[str] = Field(default=None, pattern="^(none|daily|weekly)$")
    repeat_weekdays: Optional[list[int]] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    status: Optional[str] = Field(default=None, pattern="^(active|paused|archived)$")
    illustration_image_ids: Optional[list[int]] = None
    version: Optional[int] = None


class TaskTemplateResponse(BaseModel):
    id: int
    created_by_id: int
    student_id: int
    category: str
    subject: str
    name: str
    description: str
    require_evidence: bool
    repeat_type: str
    repeat_weekdays: list[int]
    start_date: Optional[date]
    end_date: Optional[date]
    status: str
    version: int
    images: list[TaskImageResponse] = []
    created_at: datetime
    updated_at: datetime


class TaskInstanceCreate(BaseModel):
    student_id: int
    date: date
    category: str = Field(..., pattern=CATEGORY_PATTERN)
    subject: str = ""
    name: str = Field(..., min_length=1, max_length=100)
    description: str = ""
    require_evidence: bool = True
    illustration_image_ids: list[int] = []


class TaskInstanceUpdate(BaseModel):
    category: Optional[str] = Field(default=None, pattern=CATEGORY_PATTERN)
    subject: Optional[str] = None
    name: Optional[str] = None
    description: Optional[str] = None
    require_evidence: Optional[bool] = None
    illustration_image_ids: Optional[list[int]] = None
    version: Optional[int] = None


class TaskInstanceResponse(BaseModel):
    id: int
    template_id: Optional[int]
    created_by_id: Optional[int]
    student_id: int
    task_date: date
    category: str
    subject: str
    name: str
    description: str
    require_evidence: bool
    source: str
    status: str
    checkin_note: str
    submitted_at: Optional[datetime]
    reviewed_by_id: Optional[int]
    rating: Optional[int]
    review_comment: str
    reviewed_at: Optional[datetime]
    version: int
    images: list[TaskImageResponse] = []
    created_at: datetime
    updated_at: datetime


class CheckinSubmit(BaseModel):
    note: str = ""
    evidence_image_ids: list[int] = []


class ReviewRequest(BaseModel):
    result: str = Field(..., pattern="^(approved|rejected)$")
    rating: Optional[int] = Field(default=None, ge=1, le=5)
    comment: str = ""
    correction_image_ids: list[int] = []
    version: Optional[int] = None


class CopyRequest(BaseModel):
    student_id: int
    target_date: Optional[date] = Field(default=None, alias="date")

    model_config = ConfigDict(populate_by_name=True)


class OverviewItem(BaseModel):
    student_id: int
    username: str
    display_name: str
    total: int
    pending: int
    submitted: int
    rejected: int
    approved: int