from datetime import datetime, timedelta, timezone, date
from typing import Sequence
from fastapi import APIRouter, Depends, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User, Question, QuestionTag, Review, QuestionImage
from app.auth import get_current_user

router = APIRouter(prefix="/api/v1/statistics", tags=["统计"])


def _now() -> datetime:
    """Return naive UTC datetime for consistency with DB stored values."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _today_start() -> datetime:
    """Return naive UTC today midnight start."""
    return datetime.combine(_now().date(), datetime.min.time())


def _today_end() -> datetime:
    """Return naive UTC today end (23:59:59)."""
    return datetime.combine(_now().date(), datetime.max.time())


def _ef_to_mastery(ef: float) -> float:
    """Map SM-2 EF (1.3-3.0) to mastery score 0-1."""
    return max(0.0, min(1.0, (ef - 1.3) / 2.0))


# ── Overview ────────────────────────────────────────────────────────


@router.get("/overview")
def get_overview(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    user_id = current_user.id
    today = _now().date()
    today_start = datetime.combine(today, datetime.min.time())
    today_end = datetime.combine(today, datetime.max.time())
    seven_days_ago = _now() - timedelta(days=7)

    # Total questions
    total_questions = (
        db.query(func.count(Question.id))
        .filter(Question.user_id == user_id)
        .scalar()
        or 0
    )

    # Active questions
    active_questions = (
        db.query(func.count(Question.id))
        .filter(Question.user_id == user_id, Question.status == "active")
        .scalar()
        or 0
    )

    # Archived questions
    archived_questions = total_questions - active_questions

    # Today's reviews count
    today_review_count = (
        db.query(func.count(Review.id))
        .filter(
            Review.user_id == user_id,
            Review.review_date >= today_start,
            Review.review_date <= today_end,
        )
        .scalar()
        or 0
    )

    # Overdue reviews (active questions with next_review_date <= today)
    overdue_review_count = (
        db.query(func.count(Question.id))
        .filter(
            Question.user_id == user_id,
            Question.status == "active",
            Question.next_review_date <= today_end,
        )
        .scalar()
        or 0
    )

    # Weekly added questions
    weekly_added = (
        db.query(func.count(Question.id))
        .filter(
            Question.user_id == user_id,
            Question.created_at >= seven_days_ago,
        )
        .scalar()
        or 0
    )

    # Mastery rate: average of all active questions' EF mapped to 0-1
    avg_ef = (
        db.query(func.avg(Question.current_ef))
        .filter(Question.user_id == user_id, Question.status == "active")
        .scalar()
    )
    mastery_rate = round(_ef_to_mastery(avg_ef) * 100, 1) if avg_ef else 0.0

    # Total reviews ever
    total_reviews = (
        db.query(func.count(Review.id))
        .filter(Review.user_id == user_id)
        .scalar()
        or 0
    )

    return {
        "total_questions": total_questions,
        "active_questions": active_questions,
        "archived_questions": archived_questions,
        "today_review_count": today_review_count,
        "overdue_review_count": overdue_review_count,
        "weekly_added": weekly_added,
        "mastery_rate": mastery_rate,
        "total_reviews": total_reviews,
    }


# ── Trends (last 30 days) ──────────────────────────────────────────


@router.get("/trends")
def get_trends(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    user_id = current_user.id
    thirty_days_ago = _now() - timedelta(days=29)
    thirty_days_ago_date = thirty_days_ago.date()

    # Questions added per day (grouped by date)
    added_rows = (
        db.query(
            func.date(Question.created_at).label("date"),
            func.count(Question.id).label("cnt"),
        )
        .filter(
            Question.user_id == user_id,
            Question.created_at >= thirty_days_ago,
        )
        .group_by(func.date(Question.created_at))
        .all()
    )
    added_map = {}
    for row in added_rows:
        try:
            d = date.fromisoformat(row.date) if isinstance(row.date, str) else row.date
        except (ValueError, TypeError):
            d = row.date
        added_map[d] = row.cnt

    # Reviews completed per day (grouped by date)
    review_rows = (
        db.query(
            func.date(Review.review_date).label("date"),
            func.count(Review.id).label("cnt"),
        )
        .filter(
            Review.user_id == user_id,
            Review.review_date >= thirty_days_ago,
        )
        .group_by(func.date(Review.review_date))
        .all()
    )
    review_map = {}
    for row in review_rows:
        try:
            d = date.fromisoformat(row.date) if isinstance(row.date, str) else row.date
        except (ValueError, TypeError):
            d = row.date
        review_map[d] = row.cnt

    # Build 30-day series
    daily = []
    for i in range(30):
        d = thirty_days_ago_date + timedelta(days=i)
        daily.append(
            {
                "date": d.isoformat(),
                "added": added_map.get(d, 0),
                "reviewed": review_map.get(d, 0),
            }
        )

    return {"daily": daily}


# ── Study Report ───────────────────────────────────────────────────


@router.get("/report")
def get_report(
    period: str = Query("weekly", pattern="^(weekly|monthly)$"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    user_id = current_user.id
    now = _now()

    if period == "weekly":
        period_start = now - timedelta(days=7)
    else:
        period_start = now - timedelta(days=30)

    # Total questions
    total_questions = (
        db.query(func.count(Question.id))
        .filter(Question.user_id == user_id)
        .scalar()
        or 0
    )

    # New questions in period
    new_questions = (
        db.query(func.count(Question.id))
        .filter(
            Question.user_id == user_id,
            Question.created_at >= period_start,
        )
        .scalar()
        or 0
    )

    # Review completion rate: reviews done / total reviews scheduled in period
    reviews_done = (
        db.query(func.count(Review.id))
        .filter(
            Review.user_id == user_id,
            Review.review_date >= period_start,
        )
        .scalar()
        or 0
    )
    # Scheduled reviews in period: count of active questions whose next_review_date
    # fell within the period (including those that were overdue before it)
    reviews_scheduled = (
        db.query(func.count(Question.id))
        .filter(
            Question.user_id == user_id,
            Question.status == "active",
            Question.next_review_date <= now,
            Question.next_review_date >= period_start - timedelta(days=1),
        )
        .scalar()
        or 0
    )
    review_completion_rate = (
        round(reviews_done / reviews_scheduled * 100, 1) if reviews_scheduled > 0 else 0.0
    )

    # Top error types
    error_type_rows = (
        db.query(
            Question.error_type,
            func.count(Question.id).label("cnt"),
        )
        .filter(
            Question.user_id == user_id,
            Question.error_type != "",
            Question.error_type.isnot(None),
        )
        .group_by(Question.error_type)
        .order_by(func.count(Question.id).desc())
        .limit(5)
        .all()
    )
    top_error_types = []
    for row in error_type_rows:
        pct = round(row.cnt / total_questions * 100, 1) if total_questions > 0 else 0.0
        top_error_types.append(
            {"type": row.error_type, "count": row.cnt, "percentage": pct}
        )

    # Top weak tags: tags with highest error rate (non-perfect questions)
    # We define "error" as a question where current_ef < 2.5 (i.e., below default)
    # Or where the question has been reviewed with low quality
    # More practical: find tags with high error_count / total_count ratio
    # Count questions per tag
    tag_question_counts = (
        db.query(
            QuestionTag.tag_name,
            func.count(func.distinct(QuestionTag.question_id)).label("total_count"),
        )
        .join(Question, QuestionTag.question_id == Question.id)
        .filter(
            Question.user_id == user_id,
            Question.status == "active",
        )
        .group_by(QuestionTag.tag_name)
        .all()
    )

    # Count "error" questions per tag (current_ef < 2.5 or rep_count == 0)
    tag_error_counts = (
        db.query(
            QuestionTag.tag_name,
            func.count(func.distinct(QuestionTag.question_id)).label("error_count"),
        )
        .join(Question, QuestionTag.tag_name == QuestionTag.tag_name)
        .filter(
            Question.user_id == user_id,
            Question.status == "active",
            Question.current_ef < 2.5,
        )
        .group_by(QuestionTag.tag_name)
        .all()
    )
    # The above query is wrong — it cross-joins rather than matching on question_id.
    # Let me compute it properly in Python instead.

    # Build tag stats in Python
    from collections import defaultdict

    tag_totals: dict[str, int] = {}
    tag_errors: dict[str, int] = {}

    for row in tag_question_counts:
        tag_totals[row.tag_name] = row.total_count

    # Query all active questions with their tags and EF for the user
    from sqlalchemy.orm import joinedload

    questions_with_tags = (
        db.query(Question)
        .options(joinedload(Question.tags))
        .filter(
            Question.user_id == user_id,
            Question.status == "active",
        )
        .all()
    )

    for q in questions_with_tags:
        is_error = q.current_ef < 2.5
        for t in q.tags:
            if is_error:
                tag_errors[t.tag_name] = tag_errors.get(t.tag_name, 0) + 1

    # Build sorted list of weak tags
    tag_weak_list = []
    for tag_name, total_count in tag_totals.items():
        error_count = tag_errors.get(tag_name, 0)
        error_rate = round(error_count / total_count * 100, 1) if total_count > 0 else 0.0
        tag_weak_list.append(
            {
                "tag": tag_name,
                "error_count": error_count,
                "error_rate": error_rate,
            }
        )
    tag_weak_list.sort(key=lambda x: x["error_rate"], reverse=True)
    top_weak_tags = tag_weak_list[:5]

    # Generate suggestions
    suggestions = []
    for wt in top_weak_tags:
        if wt["error_rate"] >= 50:
            suggestions.append(
                f"您近期在「{wt['tag']}」板块错误率高达 {wt['error_rate']}%，建议重点复习相关公式"
            )
    if not suggestions and top_weak_tags:
        suggestions.append(
            f"继续保持！您最近的复习表现良好。"
        )

    return {
        "period": period,
        "total_questions": total_questions,
        "new_questions": new_questions,
        "review_completion_rate": review_completion_rate,
        "top_error_types": top_error_types,
        "top_weak_tags": top_weak_tags,
        "suggestions": suggestions,
    }


# ── Knowledge Mastery (radar chart) ────────────────────────────────


@router.get("/knowledge/mastery")
def get_knowledge_mastery(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    user_id = current_user.id

    from sqlalchemy.orm import joinedload

    questions_with_tags = (
        db.query(Question)
        .options(joinedload(Question.tags))
        .filter(
            Question.user_id == user_id,
            Question.status == "active",
        )
        .all()
    )

    # Aggregate per tag
    tag_data: dict[str, dict] = {}
    for q in questions_with_tags:
        for t in q.tags:
            if t.tag_name not in tag_data:
                tag_data[t.tag_name] = {
                    "total_count": 0,
                    "ef_sum": 0.0,
                    "error_count": 0,
                }
            tag_data[t.tag_name]["total_count"] += 1
            tag_data[t.tag_name]["ef_sum"] += q.current_ef
            if q.current_ef < 2.5:
                tag_data[t.tag_name]["error_count"] += 1

    data = []
    for tag_name, stats in tag_data.items():
        avg_ef = stats["ef_sum"] / stats["total_count"]
        mastery = round(_ef_to_mastery(avg_ef), 2)
        data.append(
            {
                "tag": tag_name,
                "mastery": mastery,
                "error_count": stats["error_count"],
                "total_count": stats["total_count"],
            }
        )
    data.sort(key=lambda x: x["mastery"])

    return {"data": data}


# ── Heatmap (last 30 days, by hour) ────────────────────────────────


@router.get("/knowledge/heatmap")
def get_heatmap(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    user_id = current_user.id
    thirty_days_ago = _now() - timedelta(days=29)

    reviews = (
        db.query(Review.review_date)
        .filter(
            Review.user_id == user_id,
            Review.review_date >= thirty_days_ago,
        )
        .all()
    )

    # Aggregate by date + hour
    from collections import defaultdict

    heatmap_data: dict[tuple[str, int], int] = defaultdict(int)
    for r in reviews:
        key = (r.review_date.date().isoformat(), r.review_date.hour)
        heatmap_data[key] += 1

    # Also add questions created per date + hour
    questions = (
        db.query(Question.created_at)
        .filter(
            Question.user_id == user_id,
            Question.created_at >= thirty_days_ago,
        )
        .all()
    )
    for q in questions:
        key = (q.created_at.date().isoformat(), q.created_at.hour)
        heatmap_data[key] += 1

    data = [
        {"date": d, "hour": h, "count": c}
        for (d, h), c in sorted(heatmap_data.items())
    ]

    return {"data": data}