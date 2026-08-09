"""成就规则引擎：按角色实时聚合指标并评估解锁状态（无状态、无持久化）。"""

from datetime import date

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import Question, Review, TaskInstance, User

# (code, title, desc, emoji, metric, target)
STUDENT_RULES = [
    ("first_task", "首战告捷", "完成第一个任务", "🌟", "tasks_completed", 1),
    ("task_10", "任务小能手", "累计完成 10 个任务", "🔥", "tasks_completed", 10),
    ("task_50", "任务达人", "累计完成 50 个任务", "🏆", "tasks_completed", 50),
    ("task_100", "任务大师", "累计完成 100 个任务", "👑", "tasks_completed", 100),
    ("streak_3", "持之以恒·3天", "连续 3 天完成任务", "📅", "tasks_streak", 3),
    ("streak_7", "持之以恒·7天", "连续 7 天完成任务", "📅", "tasks_streak", 7),
    ("streak_30", "持之以恒·30天", "连续 30 天完成任务", "📅", "tasks_streak", 30),
    ("stars_10", "星光闪耀·10星", "累计获得 10 星", "⭐", "stars_total", 10),
    ("stars_50", "星光闪耀·50星", "累计获得 50 星", "⭐", "stars_total", 50),
    ("self_task_5", "自主之星", "自主添加并完成 5 个任务", "🚀", "self_completed", 5),
    ("mistake_10", "错题新手", "收录 10 道错题", "📚", "questions_total", 10),
    ("mistake_50", "错题高手", "收录 50 道错题", "📚", "questions_total", 50),
    ("review_7", "温故知新·7天", "连续 7 天复习错题", "🔁", "review_streak", 7),
    ("review_30", "温故知新·30天", "连续 30 天复习错题", "🔁", "review_streak", 30),
]

PARENT_RULES = [
    ("assign_first", "尽职尽责", "布置第一天任务", "👨‍👩‍👧", "assign_days", 1),
    ("assign_7", "坚持布置·7天", "累计布置 7 天任务", "📋", "assign_days", 7),
    ("assign_30", "坚持布置·30天", "累计布置 30 天任务", "📋", "assign_days", 30),
    ("review_first", "首次批改", "完成第一次批改", "✍️", "reviews_count", 1),
    ("review_10", "认真批改·10次", "累计批改 10 次", "✅", "reviews_count", 10),
    ("review_50", "认真批改·50次", "累计批改 50 次", "✅", "reviews_count", 50),
    ("timely_3", "及时反馈·3天", "连续 3 天当日批改", "⚡", "timely_streak", 3),
    ("timely_7", "及时反馈·7天", "连续 7 天当日批改", "⚡", "timely_streak", 7),
    ("stars_give_20", "送星大使", "累计送出 20 星", "⭐", "stars_given", 20),
]


def _max_streak(dates: set) -> int:
    """dates 为 date 集合，返回最长连续天数。"""
    if not dates:
        return 0
    ds = sorted(dates)
    best = cur = 1
    for a, b in zip(ds, ds[1:]):
        if (b - a).days == 1:
            cur += 1
            best = max(best, cur)
        else:
            cur = 1
    return best


def _student_metrics(db: Session, user_id: int) -> dict:
    approved_dates = {
        r[0] for r in db.query(TaskInstance.task_date)
        .filter(TaskInstance.student_id == user_id, TaskInstance.status == "approved")
        .distinct().all()
    }
    tasks_completed = db.query(func.count(TaskInstance.id)) \
        .filter(TaskInstance.student_id == user_id, TaskInstance.status == "approved").scalar() or 0
    review_dates = {
        r[0].date() for r in db.query(Review.review_date)
        .filter(Review.user_id == user_id, Review.review_date.isnot(None)).all()
    }
    stars = db.query(func.coalesce(func.sum(TaskInstance.rating), 0)) \
        .filter(TaskInstance.student_id == user_id, TaskInstance.status == "approved").scalar() or 0
    self_completed = db.query(func.count(TaskInstance.id)) \
        .filter(
            TaskInstance.student_id == user_id,
            TaskInstance.created_by_id == user_id,
            TaskInstance.status == "approved",
        ).scalar() or 0
    questions_total = db.query(func.count(Question.id)) \
        .filter(Question.user_id == user_id).scalar() or 0
    return {
        "tasks_completed": tasks_completed,
        "tasks_streak": _max_streak({d for d in approved_dates if isinstance(d, date)}),
        "stars_total": int(stars),
        "self_completed": self_completed,
        "questions_total": questions_total,
        "review_streak": _max_streak({d for d in review_dates if isinstance(d, date)}),
    }


def _parent_metrics(db: Session, user_id: int) -> dict:
    assign_dates = {
        r[0] for r in db.query(TaskInstance.task_date)
        .filter(TaskInstance.created_by_id == user_id).distinct().all()
    }
    # 批改次数 + 送星
    reviews_count = db.query(func.count(TaskInstance.id)) \
        .filter(TaskInstance.reviewed_by_id == user_id).scalar() or 0
    stars_given = db.query(func.coalesce(func.sum(TaskInstance.rating), 0)) \
        .filter(TaskInstance.reviewed_by_id == user_id).scalar() or 0
    # 当日批改（reviewed_at 与 submitted_at 同一天）
    timely_rows = db.query(TaskInstance.submitted_at, TaskInstance.reviewed_at) \
        .filter(
            TaskInstance.reviewed_by_id == user_id,
            TaskInstance.submitted_at.isnot(None),
            TaskInstance.reviewed_at.isnot(None),
        ).all()
    timely_dates = {
        r.reviewed_at.date() for r in timely_rows
        if r.reviewed_at.date() == r.submitted_at.date()
    }
    return {
        "assign_days": len(assign_dates),
        "reviews_count": reviews_count,
        "timely_streak": _max_streak(timely_dates),
        "stars_given": int(stars_given),
    }


def get_achievements(db: Session, user: User) -> list[dict]:
    if user.role == "parent":
        metrics = _parent_metrics(db, user.id)
        rules = PARENT_RULES
    else:
        metrics = _student_metrics(db, user.id)
        rules = STUDENT_RULES
    result = []
    for code, title, desc, emoji, metric, target in rules:
        val = metrics.get(metric, 0)
        result.append({
            "code": code,
            "title": title,
            "desc": desc,
            "emoji": emoji,
            "unlocked": val >= target,
            "progress": min(val, target),
            "target": target,
        })
    return result
