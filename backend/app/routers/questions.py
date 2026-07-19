from datetime import datetime
from math import ceil
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User, Question, QuestionTag, QuestionImage
from app.schemas import (
    QuestionCreate,
    QuestionUpdate,
    QuestionResponse,
    PaginatedQuestions,
    ImageResponse,
)
from app.auth import get_current_user

router = APIRouter(prefix="/api/v1/questions", tags=["错题"])


def _question_to_response(q: Question) -> QuestionResponse:
    return QuestionResponse(
        id=q.id,
        question_content=q.question_content or "",
        subject=q.subject or "",
        tags=[t.tag_name for t in q.tags],
        images=[
            ImageResponse(
                id=img.id,
                file_path=img.file_path,
                mime_type=img.mime_type,
                file_size=img.file_size,
                image_type=img.image_type,
            )
            for img in q.images if img.image_type == "question"
        ],
        solution_images=[
            ImageResponse(
                id=img.id,
                file_path=img.file_path,
                mime_type=img.mime_type,
                file_size=img.file_size,
                image_type=img.image_type,
            )
            for img in q.images if img.image_type == "solution"
        ],
        error_type=q.error_type or "",
        difficulty=q.difficulty,
        source=q.source or "",
        correct_solution=q.correct_solution or "",
        user_analysis=q.user_analysis or "",
        status=q.status,
        next_review_date=q.next_review_date,
        current_ef=q.current_ef,
        created_at=q.created_at,
        updated_at=q.updated_at,
    )


@router.get("", response_model=PaginatedQuestions)
def list_questions(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    subject: str = None,
    tag: str = None,
    error_type: str = None,
    status: str = None,
    sort_by: str = "created_at",
    sort_order: str = "desc",
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(Question).filter(Question.user_id == current_user.id)
    if subject:
        query = query.filter(Question.subject == subject)
    if error_type:
        query = query.filter(Question.error_type == error_type)
    if status:
        query = query.filter(Question.status == status)
    if tag:
        query = query.filter(Question.tags.any(QuestionTag.tag_name == tag))
    total = query.count()
    sort_col = getattr(Question, sort_by, Question.created_at)
    sort_fn = sort_col.desc() if sort_order == "desc" else sort_col.asc()
    questions = (
        query.order_by(sort_fn)
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    return PaginatedQuestions(
        data=[_question_to_response(q) for q in questions],
        pagination={
            "page": page,
            "page_size": page_size,
            "total": total,
            "total_pages": ceil(total / page_size) if total > 0 else 1,
        },
    )


@router.post("", response_model=QuestionResponse, status_code=status.HTTP_201_CREATED)
def create_question(
    data: QuestionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = Question(
        user_id=current_user.id,
        question_content=data.question_content,
        subject=data.subject,
        error_type=data.error_type,
        difficulty=data.difficulty,
        source=data.source,
        correct_solution=data.correct_solution,
        user_analysis=data.user_analysis,
    )
    db.add(q)
    db.flush()
    for tag_name in data.tags:
        db.add(QuestionTag(question_id=q.id, tag_name=tag_name))
    if data.image_ids:
        db.query(QuestionImage).filter(
            QuestionImage.id.in_(data.image_ids)
        ).update({"question_id": q.id, "image_type": "question"})
    if data.solution_image_ids:
        db.query(QuestionImage).filter(
            QuestionImage.id.in_(data.solution_image_ids)
        ).update({"question_id": q.id, "image_type": "solution"})
    db.commit()
    db.refresh(q)
    return _question_to_response(q)


@router.get("/{question_id}", response_model=QuestionResponse)
def get_question(
    question_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(Question).filter(
        Question.id == question_id, Question.user_id == current_user.id
    ).first()
    if not q:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "NOT_FOUND", "message": "题目不存在"},
        )
    return _question_to_response(q)


@router.put("/{question_id}", response_model=QuestionResponse)
def update_question(
    question_id: int,
    data: QuestionUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(Question).filter(
        Question.id == question_id, Question.user_id == current_user.id
    ).first()
    if not q:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "NOT_FOUND", "message": "题目不存在"},
        )
    for field in [
        "question_content",
        "subject",
        "error_type",
        "difficulty",
        "source",
        "correct_solution",
        "user_analysis",
        "status",
    ]:
        val = getattr(data, field, None)
        if val is not None:
            setattr(q, field, val)
    if data.tags is not None:
        db.query(QuestionTag).filter(QuestionTag.question_id == q.id).delete()
        for tag_name in data.tags:
            db.add(QuestionTag(question_id=q.id, tag_name=tag_name))
    q.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(q)
    return _question_to_response(q)


@router.delete("/{question_id}")
def delete_question(
    question_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(Question).filter(
        Question.id == question_id, Question.user_id == current_user.id
    ).first()
    if not q:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "NOT_FOUND", "message": "题目不存在"},
        )
    q.status = "archived"
    db.commit()
    return {"message": "已归档"}