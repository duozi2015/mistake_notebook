from datetime import datetime, date
from math import ceil
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field, ConfigDict

from app.database import get_db
from app.models import User, Question, Review
from app.auth import get_current_user
from app.services.sm2 import calculate_sm2

router = APIRouter(prefix="/api/v1/reviews", tags=["复习"])


# ── Pydantic schemas (local to this router) ──────────────────────


class ReviewSubmit(BaseModel):
    question_id: int
    quality: int = Field(..., ge=0, le=5)


class ReviewResult(BaseModel):
    question_id: int
    quality: int
    next_review_date: str
    current_ef: float
    current_interval: int


class ReviewHistoryItem(BaseModel):
    id: int
    question_id: int
    review_date: datetime
    quality: int
    ef_before: float
    ef_after: float
    interval_before: int
    interval_after: int

    model_config = ConfigDict(from_attributes=True)


class DailyReviewQuestion(BaseModel):
    id: int
    question_content: str
    subject: str
    tags: list[str]
    images: list = []
    solution_images: list = []
    error_type: str
    difficulty: int
    source: str
    correct_solution: str
    user_analysis: str
    current_ef: float
    current_interval: int
    current_rep_count: int
    next_review_date: str | None
    urgency_score: float

    model_config = ConfigDict(from_attributes=True)


class PaginatedDailyReviews(BaseModel):
    data: list[DailyReviewQuestion]
    pagination: dict


# ── Endpoints ────────────────────────────────────────────────────


@router.get("/daily", response_model=PaginatedDailyReviews)
def get_daily_reviews(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Get today's review tasks — questions whose next_review_date <= today.
    Ordered by urgency score.
    """
    today = date.today()

    questions = (
        db.query(Question)
        .filter(
            Question.user_id == current_user.id,
            Question.status == "active",
            or_(
                Question.next_review_date == None,
                Question.next_review_date <= datetime.combine(today, datetime.min.time()),
            ),
        )
        .all()
    )

    # Calculate urgency score for each question
    scored = []
    for q in questions:
        overdue_days = (today - q.next_review_date.date()).days if q.next_review_date else 0
        difficulty = (q.difficulty or 3) / 5.0  # Normalise 1-5 → 0.2-1.0
        # mastery inferred from rep_count (capped at 10 for scaling)
        raw_mastery = min(q.current_rep_count or 0, 10) / 10.0
        urgency = overdue_days * 0.5 + difficulty * 0.3 + (1 - raw_mastery) * 0.2
        scored.append((urgency, q))

    # Sort descending by urgency (most urgent first)
    scored.sort(key=lambda x: x[0], reverse=True)

    # Paginate
    total = len(scored)
    start = (page - 1) * page_size
    end = start + page_size
    page_items = scored[start:end]

    return PaginatedDailyReviews(
        data=[
            DailyReviewQuestion(
                id=q.id,
                question_content=q.question_content or "",
                subject=q.subject or "",
                tags=[t.tag_name for t in q.tags],
                images=[{"id": img.id, "file_path": img.file_path, "mime_type": img.mime_type, "file_size": img.file_size, "image_type": img.image_type} for img in q.images if img.image_type == "question"],
                solution_images=[{"id": img.id, "file_path": img.file_path, "mime_type": img.mime_type, "file_size": img.file_size, "image_type": img.image_type} for img in q.images if img.image_type == "solution"],
                error_type=q.error_type or "",
                difficulty=q.difficulty,
                source=q.source or "",
                correct_solution=q.correct_solution or "",
                user_analysis=q.user_analysis or "",
                current_ef=q.current_ef,
                current_interval=q.current_interval,
                current_rep_count=q.current_rep_count,
                next_review_date=q.next_review_date.isoformat() if q.next_review_date else None,
                urgency_score=round(urgency, 4),
            )
            for urgency, q in page_items
        ],
        pagination={
            "page": page,
            "page_size": page_size,
            "total": total,
            "total_pages": max(1, ceil(total / page_size)),
        },
    )


@router.post("", response_model=ReviewResult)
def submit_review(
    data: ReviewSubmit,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Submit a review result for a question.
    Calculates new SM-2 parameters, stores history, and updates the question.
    """
    # Validate question exists and belongs to user
    question = (
        db.query(Question)
        .filter(
            Question.id == data.question_id,
            Question.user_id == current_user.id,
        )
        .first()
    )
    if not question:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "NOT_FOUND", "message": "题目不存在"},
        )

    # Read current SM-2 state
    ef_before = question.current_ef or 2.5
    interval_before = question.current_interval or 0
    rep_count_before = question.current_rep_count or 0

    # Calculate new parameters
    result = calculate_sm2(
        quality=data.quality,
        ef=ef_before,
        interval=interval_before,
        rep_count=rep_count_before,
    )

    # Store history record
    review_record = Review(
        question_id=question.id,
        user_id=current_user.id,
        quality=data.quality,
        ef_before=ef_before,
        ef_after=result["new_ef"],
        interval_before=interval_before,
        interval_after=result["new_interval"],
    )
    db.add(review_record)

    # Update question with new SM-2 state
    question.current_ef = result["new_ef"]
    question.current_interval = result["new_interval"]
    question.current_rep_count = result["new_rep_count"]
    question.next_review_date = datetime.fromisoformat(result["next_review_date"])

    db.commit()
    db.refresh(question)

    return ReviewResult(
        question_id=question.id,
        quality=data.quality,
        next_review_date=question.next_review_date.isoformat(),
        current_ef=question.current_ef,
        current_interval=question.current_interval,
    )


@router.get("/history/{question_id}", response_model=list[ReviewHistoryItem])
def get_review_history(
    question_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Get review history for a question, ordered by review_date descending.
    """
    # Verify question belongs to user
    question = (
        db.query(Question)
        .filter(
            Question.id == question_id,
            Question.user_id == current_user.id,
        )
        .first()
    )
    if not question:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "NOT_FOUND", "message": "题目不存在"},
        )

    reviews = (
        db.query(Review)
        .filter(
            Review.question_id == question_id,
            Review.user_id == current_user.id,
        )
        .order_by(Review.review_date.desc())
        .all()
    )

    return reviews