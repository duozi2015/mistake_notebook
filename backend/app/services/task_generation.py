"""任务惰性生成：模板周期生成 + 记忆曲线「错题复习」自动任务。

无需定时任务：任何查询某日任务的请求，先按 active 模板补齐实例；仅对「今天」生成自动复习任务。
"""
import json
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import Question, TaskImage, TaskInstance, TaskTemplate


def local_today() -> date:
    """服务器本地日期（家庭同时间区）。"""
    return date.today()


def _utcnow_dt() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _template_matches(t: TaskTemplate, d: date) -> bool:
    """模板在日期 d 是否生成实例。"""
    if t.repeat_type == "daily":
        return True
    if t.repeat_type == "weekly":
        try:
            weekdays = json.loads(t.repeat_weekdays or "[]")
        except (ValueError, TypeError):
            weekdays = []
        # Python weekday：周一=0 … 周日=6
        return d.weekday() in weekdays
    return False


def _copy_illustrations(
    db: Session, src_type: str, src_id: int, dst_type: str, dst_id: int
) -> None:
    """把源（模板/实例）的插图复制为目标的插图（快照，独立可改）。"""
    srcs = (
        db.query(TaskImage)
        .filter(
            TaskImage.target_type == src_type,
            TaskImage.target_id == src_id,
            TaskImage.kind == "illustration",
        )
        .all()
    )
    for s in srcs:
        db.add(
            TaskImage(
                target_type=dst_type,
                target_id=dst_id,
                kind="illustration",
                file_path=s.file_path,
                original_name=s.original_name,
                file_size=s.file_size,
                mime_type=s.mime_type,
                uploaded_by_user_id=s.uploaded_by_user_id,
                sort_order=s.sort_order,
            )
        )


def ensure_instances(
    db: Session, student_id: int, up_to: date, today: date | None = None
) -> None:
    """把 active 模板在 [start_date, max(up_to, today)] 内的实例补齐（幂等）。"""
    today = today or local_today()
    horizon = max(up_to, today)
    templates = (
        db.query(TaskTemplate)
        .filter(TaskTemplate.student_id == student_id, TaskTemplate.status == "active")
        .all()
    )
    for t in templates:
        d = t.start_date
        if t.end_date and d > t.end_date:
            continue
        while d <= horizon and (t.end_date is None or d <= t.end_date):
            if _template_matches(t, d):
                exists = (
                    db.query(TaskInstance)
                    .filter(TaskInstance.template_id == t.id, TaskInstance.task_date == d)
                    .first()
                )
                if not exists:
                    inst = TaskInstance(
                        template_id=t.id,
                        created_by_id=t.created_by_id,
                        student_id=student_id,
                        task_date=d,
                        category=t.category,
                        subject=t.subject,
                        name=t.name,
                        description=t.description,
                        require_evidence=t.require_evidence,
                        estimated_minutes=t.estimated_minutes,
                        source="manual",
                        status="pending",
                    )
                    db.add(inst)
                    db.flush()
                    _copy_illustrations(db, "template", t.id, "instance", inst.id)
            d += timedelta(days=1)
    db.commit()


def due_review_rows(db: Session, student_id: int, on_date: date):
    """该学生 on_date 到期（next_review_date <= on_date）的错题按学科计数。"""
    end = datetime.combine(on_date, datetime.max.time())
    return (
        db.query(Question.subject, func.count(Question.id))
        .filter(
            Question.user_id == student_id,
            Question.status == "active",
            Question.next_review_date <= end,
        )
        .group_by(Question.subject)
        .all()
    )


def _review_desc(db: Session, student_id: int, on_date: date) -> str:
    rows = due_review_rows(db, student_id, on_date)
    total = sum(r[1] for r in rows)
    parts = "、".join(f"{r[0]}x{r[1]}" for r in rows if r[0])
    if parts:
        return f"今日待复习 {total} 道（{parts}，按记忆曲线安排）"
    return f"今日待复习 {total} 道（按记忆曲线安排）"


def ensure_auto_review(db: Session, student_id: int, today: date | None = None) -> None:
    """仅对「今天」生成/刷新记忆曲线复习任务；无到期错题时自动完成 pending。"""
    today = today or local_today()
    count = sum(r[1] for r in due_review_rows(db, student_id, today))
    existing = (
        db.query(TaskInstance)
        .filter(
            TaskInstance.student_id == student_id,
            TaskInstance.task_date == today,
            TaskInstance.source == "auto_review",
        )
        .first()
    )
    if count > 0:
        desc = _review_desc(db, student_id, today)
        if existing:
            if existing.status == "pending":
                existing.description = desc
        else:
            db.add(
                TaskInstance(
                    created_by_id=None,
                    student_id=student_id,
                    task_date=today,
                    category="learning",
                    subject="",
                    name="错题复习",
                    description=desc,
                    require_evidence=False,
                    source="auto_review",
                    status="pending",
                )
            )
        db.commit()
    else:
        if existing and existing.status == "pending":
            existing.status = "approved"
            existing.reviewed_at = _utcnow_dt()
            db.commit()
