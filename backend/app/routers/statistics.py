from datetime import datetime, timedelta, timezone, date
from typing import Sequence
from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User, Question, Review, WORD_APP_SOURCE
from app.auth import get_current_user, resolve_student_id

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
    student_id: int | None = None,
    current_user: User = Depends(get_current_user),
):
    user_id = resolve_student_id(db, current_user, student_id)
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
    # next_review_date 为 NULL 的新题与 /reviews/daily 口径一致，也算待复习
    # 单词错题由背单词应用调度，不计入错题本待复习数
    overdue_review_count = (
        db.query(func.count(Question.id))
        .filter(
            Question.user_id == user_id,
            Question.status == "active",
            or_(
                Question.next_review_date.is_(None),
                Question.next_review_date <= today_end,
            ),
            or_(
                Question.source.is_(None),
                Question.source != WORD_APP_SOURCE,
            ),
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

    # Mastery rate: average of reviewed active questions' EF mapped to 0-1
    # 只统计复习过（rep_count > 0）的题：从未复习的新题 EF 是默认值，计入会虚增掌握度
    avg_ef = (
        db.query(func.avg(Question.current_ef))
        .filter(
            Question.user_id == user_id,
            Question.status == "active",
            Question.current_rep_count > 0,
        )
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
    student_id: int | None = None,
    current_user: User = Depends(get_current_user),
):
    user_id = resolve_student_id(db, current_user, student_id)
    thirty_days_ago = _now() - timedelta(days=29)
    thirty_days_ago_date = _utc_to_local(_now()).date() - timedelta(days=29)

    # Questions added per day (grouped by local date，SQL 取 UTC 日期后按本地时区归桶)
    added_rows = (
        db.query(Question.created_at)
        .filter(
            Question.user_id == user_id,
            Question.created_at >= thirty_days_ago,
        )
        .all()
    )
    added_map: dict[date, int] = {}
    for row in added_rows:
        d = _utc_to_local(row.created_at).date()
        added_map[d] = added_map.get(d, 0) + 1

    # Reviews completed per day (grouped by local date)
    review_rows = (
        db.query(Review.review_date)
        .filter(
            Review.user_id == user_id,
            Review.review_date >= thirty_days_ago,
        )
        .all()
    )
    review_map: dict[date, int] = {}
    for row in review_rows:
        d = _utc_to_local(row.review_date).date()
        review_map[d] = review_map.get(d, 0) + 1

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
    student_id: int | None = None,
    current_user: User = Depends(get_current_user),
):
    user_id = resolve_student_id(db, current_user, student_id)
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

    # Review completion rate: period 内完成次数 / (完成次数 + 截至当前仍逾期的活跃题数)
    # 旧口径（当前 next_review_date 落在窗口内）会漏掉已复习的题、漏掉 NULL 排期，
    # 且单题多次复习可 >100%；新口径任何情况下都在 0~100%。
    reviews_done = (
        db.query(func.count(Review.id))
        .filter(
            Review.user_id == user_id,
            Review.review_date >= period_start,
        )
        .scalar()
        or 0
    )
    still_overdue = (
        db.query(func.count(Question.id))
        .filter(
            Question.user_id == user_id,
            Question.status == "active",
            or_(
                Question.next_review_date.is_(None),
                Question.next_review_date <= now,
            ),
            or_(
                Question.source.is_(None),
                Question.source != WORD_APP_SOURCE,
            ),
        )
        .scalar()
        or 0
    )
    reviews_scheduled = reviews_done + still_overdue
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
    # "error" 定义为 current_ef < 2.5（低于默认值，说明复习反馈不佳）。
    # 全部在 Python 内按 question 聚合（tag 总数与错误数同源，口径一致）。
    from collections import defaultdict

    tag_totals: dict[str, int] = defaultdict(int)
    tag_errors: dict[str, int] = defaultdict(int)

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
            tag_totals[t.tag_name] += 1
            if is_error:
                tag_errors[t.tag_name] += 1

    # Build sorted list of weak tags
    tag_weak_list = []
    for tag_name, total_count in tag_totals.items():
        error_count = tag_errors.get(tag_name, 0)
        error_rate = round(error_count / total_count * 100, 1) if total_count > 0 else 0.0
        tag_weak_list.append(
            {
                "tag": tag_name,
                "error_count": error_count,
                "total_count": total_count,
                "error_rate": error_rate,
            }
        )
    tag_weak_list.sort(key=lambda x: x["error_rate"], reverse=True)
    top_weak_tags = tag_weak_list[:5]

    # Generate rule-based suggestions（AI 学情建议的兜底文案）
    suggestions = []
    if top_weak_tags:
        wt = top_weak_tags[0]
        suggestions.append(
            f"您在「{wt['tag']}」板块错误率最高（{wt['error_rate']}%，{wt['error_count']}/{wt['total_count']} 题），建议优先复习该知识点的基础概念与易错点"
        )
        for wt2 in top_weak_tags[1:3]:
            if wt2["error_rate"] >= 50:
                suggestions.append(
                    f"「{wt2['tag']}」错误率 {wt2['error_rate']}%，同样需要重点关注"
                )
        if review_completion_rate < 60:
            suggestions.append(
                f"近{7 if period == 'weekly' else 30}天复习完成率 {review_completion_rate}%，建议每天固定时间复习，先清掉逾期题目"
            )
        if new_questions >= 5:
            suggestions.append(
                f"本期新增 {new_questions} 道错题，注意及时整理错误原因，避免同类错误重复出现"
            )
    else:
        suggestions.append("继续保持！您最近的复习表现良好。")

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
    student_id: int | None = None,
    current_user: User = Depends(get_current_user),
):
    user_id = resolve_student_id(db, current_user, student_id)

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


def _utc_to_local(dt: datetime) -> datetime:
    """把 DB 里存的 naive UTC 时间转换为服务器本地时区的 naive 时间。

    统计类接口（热力图/趋势）面向「用户当地的学习时段」，
    必须先转本地时区再按 date/hour 聚合，否则 UTC+8 用户全天偏移 8 小时。
    """
    return dt.replace(tzinfo=timezone.utc).astimezone().replace(tzinfo=None)


@router.get("/knowledge/heatmap")
def get_heatmap(
    db: Session = Depends(get_db),
    student_id: int | None = None,
    current_user: User = Depends(get_current_user),
):
    user_id = resolve_student_id(db, current_user, student_id)
    thirty_days_ago = _now() - timedelta(days=29)

    # 复习记录（关联活跃题，排除已归档题的复习）
    reviews = (
        db.query(Review.review_date)
        .join(Question, Review.question_id == Question.id)
        .filter(
            Review.user_id == user_id,
            Review.review_date >= thirty_days_ago,
            Question.status == "active",
        )
        .all()
    )

    # Aggregate by local date + hour
    from collections import defaultdict

    heatmap_data: dict[tuple[str, int], int] = defaultdict(int)
    for r in reviews:
        local_dt = _utc_to_local(r.review_date)
        key = (local_dt.date().isoformat(), local_dt.hour)
        heatmap_data[key] += 1

    # Also add questions created per local date + hour（仅活跃题）
    questions = (
        db.query(Question.created_at)
        .filter(
            Question.user_id == user_id,
            Question.status == "active",
            Question.created_at >= thirty_days_ago,
        )
        .all()
    )
    for q in questions:
        local_dt = _utc_to_local(q.created_at)
        key = (local_dt.date().isoformat(), local_dt.hour)
        heatmap_data[key] += 1

    data = [
        {"date": d, "hour": h, "count": c}
        for (d, h), c in sorted(heatmap_data.items())
    ]

    return {"data": data}