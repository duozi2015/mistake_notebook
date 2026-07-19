from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import desc

from app.database import get_db
from app.models import User, Question, QuestionTag, Review
from app.schemas import QuestionResponse, ImageResponse
from app.auth import get_current_user

router = APIRouter(prefix="/api/v1/variants", tags=["变式题"])


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
            )
            for img in q.images
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


@router.get("/{question_id}")
def get_variant_questions(
    question_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """获取指定题目的变式题（相同标签的题目）"""
    # 1. 获取当前题目
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

    # 2. 获取当前题目的所有标签
    tag_names = [t.tag_name for t in question.tags]
    if not tag_names:
        return {"data": [], "total": 0}

    # 3. 查找有相同标签的其他题目
    same_tag_questions = (
        db.query(Question)
        .filter(
            Question.id != question_id,
            Question.user_id == current_user.id,
            Question.status == "active",
            Question.tags.any(QuestionTag.tag_name.in_(tag_names)),
        )
        .all()
    )

    # 4. 排除已掌握的题目
    # 掌握判定：最近一次复习质量 >= 4 或 current_ef > 3.0
    candidate_ids = []
    for q in same_tag_questions:
        # 检查 current_ef
        if q.current_ef > 3.0:
            continue
        # 检查最近一次复习质量
        latest_review = (
            db.query(Review)
            .filter(
                Review.question_id == q.id,
                Review.user_id == current_user.id,
            )
            .order_by(desc(Review.review_date))
            .first()
        )
        if latest_review and latest_review.quality >= 4:
            continue
        candidate_ids.append(q.id)

    if not candidate_ids:
        return {"data": [], "total": 0}

    # 5. 按难度匹配排序（与当前题目难度差值的绝对值排序）
    candidates = (
        db.query(Question)
        .filter(Question.id.in_(candidate_ids))
        .all()
    )

    # 按难度差排序，取 3-5 条
    candidates.sort(key=lambda q: abs(q.difficulty - question.difficulty))
    result = candidates[:5]

    return {
        "data": [_question_to_response(q) for q in result],
        "total": len(result),
    }