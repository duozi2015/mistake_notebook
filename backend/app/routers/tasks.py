"""任务模块：模板、每日任务、图片上传、提交/撤回/批改状态机、乐观锁。"""

import json
import os
import time
import uuid
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import FamilyBinding, TaskImage, TaskInstance, TaskTemplate, User
from app.auth import get_current_user, is_active_binding, require_parent, require_student
from app.schemas import (
    CheckinSubmit,
    CopyRequest,
    OverviewItem,
    ReviewRequest,
    TaskImageResponse,
    TaskInstanceCreate,
    TaskInstanceResponse,
    TaskInstanceUpdate,
    TaskTemplateCreate,
    TaskTemplateResponse,
    TaskTemplateUpdate,
)
from app.services import task_generation

router = APIRouter(prefix="/api/v1/tasks", tags=["任务"])

UPLOAD_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "uploads"
)
TASKS_DIR = os.path.join(UPLOAD_DIR, "tasks")
ALLOWED_MIMES = {"image/jpeg", "image/png", "image/webp"}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


# ── 权限 / 辅助 ────────────────────────────────────────────────────────


def _require_bound_student(db: Session, parent: User, student_id: int) -> None:
    if not is_active_binding(db, parent.id, student_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "NOT_BOUND", "message": "未绑定该学生"},
        )


def _can_manage(db: Session, user: User, inst: TaskInstance) -> bool:
    """家长可管理绑定学生的全部任务；学生仅可管理自己创建的任务。"""
    if user.role == "parent":
        return is_active_binding(db, user.id, inst.student_id)
    return inst.student_id == user.id and inst.created_by_id == user.id


def _check_version(obj, version) -> None:
    if version is not None and version != obj.version:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "VERSION_CONFLICT", "message": "任务已被他人修改，请刷新后重试"},
        )


def _image_filepath(img: TaskImage) -> str:
    return os.path.join(UPLOAD_DIR, img.file_path.replace("/uploads/", ""))


def _delete_image_file(img: TaskImage) -> None:
    try:
        p = _image_filepath(img)
        if os.path.exists(p):
            os.remove(p)
    except OSError:
        pass


def _load_images(db: Session, target_type: str, target_id: int) -> list[TaskImageResponse]:
    rows = (
        db.query(TaskImage)
        .filter(TaskImage.target_type == target_type, TaskImage.target_id == target_id)
        .order_by(TaskImage.sort_order, TaskImage.id)
        .all()
    )
    return [
        TaskImageResponse(
            id=r.id,
            kind=r.kind,
            file_path=r.file_path,
            mime_type=r.mime_type,
            file_size=r.file_size,
            original_name=r.original_name,
        )
        for r in rows
    ]


def _attach_images(
    db: Session, image_ids: list[int], target_type: str, target_id: int, kind: str, user_id: int
) -> None:
    if not image_ids:
        return
    imgs = db.query(TaskImage).filter(TaskImage.id.in_(image_ids)).all()
    if len(imgs) != len(image_ids):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "IMAGE_NOT_FOUND", "message": "部分图片不存在"},
        )
    for img in imgs:
        if img.uploaded_by_user_id != user_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={"code": "FORBIDDEN", "message": "无权使用该图片"},
            )
        img.target_type = target_type
        img.target_id = target_id
        img.kind = kind


def _replace_images(
    db: Session, image_ids: list[int], target_type: str, target_id: int, kind: str, user_id: int
) -> None:
    """删除旧的 kind 图片（行+文件），挂载新的。"""
    old = (
        db.query(TaskImage)
        .filter(
            TaskImage.target_type == target_type,
            TaskImage.target_id == target_id,
            TaskImage.kind == kind,
        )
        .all()
    )
    for o in old:
        _delete_image_file(o)
        db.delete(o)
    _attach_images(db, image_ids, target_type, target_id, kind, user_id)


def _instance_response(db: Session, inst: TaskInstance) -> TaskInstanceResponse:
    images = _load_images(db, "instance", inst.id)
    return TaskInstanceResponse(
        id=inst.id,
        template_id=inst.template_id,
        created_by_id=inst.created_by_id,
        student_id=inst.student_id,
        task_date=inst.task_date,
        category=inst.category,
        subject=inst.subject,
        name=inst.name,
        description=inst.description,
        require_evidence=inst.require_evidence,
        estimated_minutes=inst.estimated_minutes,
        actual_minutes=inst.actual_minutes,
        source=inst.source,
        status=inst.status,
        checkin_note=inst.checkin_note,
        submitted_at=inst.submitted_at,
        reviewed_by_id=inst.reviewed_by_id,
        rating=inst.rating,
        review_comment=inst.review_comment,
        reviewed_at=inst.reviewed_at,
        version=inst.version,
        images=images,
        created_at=inst.created_at,
        updated_at=inst.updated_at,
    )


def _template_response(db: Session, t: TaskTemplate) -> TaskTemplateResponse:
    try:
        weekdays = json.loads(t.repeat_weekdays or "[]")
    except (ValueError, TypeError):
        weekdays = []
    return TaskTemplateResponse(
        id=t.id,
        created_by_id=t.created_by_id,
        student_id=t.student_id,
        category=t.category,
        subject=t.subject,
        name=t.name,
        description=t.description,
        require_evidence=t.require_evidence,
        estimated_minutes=t.estimated_minutes,
        repeat_type=t.repeat_type,
        repeat_weekdays=weekdays,
        start_date=t.start_date,
        end_date=t.end_date,
        status=t.status,
        version=t.version,
        images=_load_images(db, "template", t.id),
        created_at=t.created_at,
        updated_at=t.updated_at,
    )


def _status_counts(db: Session, student_id: int, d: date) -> dict:
    rows = (
        db.query(TaskInstance.status, func.count(TaskInstance.id))
        .filter(TaskInstance.student_id == student_id, TaskInstance.task_date == d)
        .group_by(TaskInstance.status)
        .all()
    )
    counts = {"pending": 0, "submitted": 0, "rejected": 0, "approved": 0}
    for s, c in rows:
        counts[s] = c
    counts["total"] = sum(counts.values())
    return counts


# ── 图片上传 ───────────────────────────────────────────────────────────


@router.post("/images/upload", response_model=TaskImageResponse, status_code=status.HTTP_201_CREATED)
def upload_task_image(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    os.makedirs(TASKS_DIR, exist_ok=True)
    if file.content_type not in ALLOWED_MIMES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail={"code": "UNSUPPORTED_MEDIA_TYPE", "message": f"不支持的文件类型: {file.content_type}"},
        )
    contents = file.file.read()
    if len(contents) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail={"code": "FILE_TOO_LARGE", "message": "文件大小超过 10MB"},
        )
    ext = file.filename.rsplit(".", 1)[-1] if "." in file.filename else "jpg"
    filename = f"{uuid.uuid4().hex}_{int(time.time())}.{ext}"
    with open(os.path.join(TASKS_DIR, filename), "wb") as f:
        f.write(contents)
    img = TaskImage(
        kind="illustration",  # 挂载前临时值；挂载时按用途改写
        file_path=f"/uploads/tasks/{filename}",
        original_name=file.filename,
        file_size=len(contents),
        mime_type=file.content_type,
        uploaded_by_user_id=current_user.id,
    )
    db.add(img)
    db.commit()
    db.refresh(img)
    return TaskImageResponse(
        id=img.id,
        kind=img.kind,
        file_path=img.file_path,
        mime_type=img.mime_type,
        file_size=img.file_size,
        original_name=img.original_name,
    )


@router.delete("/images/{image_id}")
def delete_task_image(
    image_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    img = db.get(TaskImage, image_id)
    if not img:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "NOT_FOUND", "message": "图片不存在"},
        )
    if img.uploaded_by_user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "FORBIDDEN", "message": "无权删除该图片"},
        )
    if img.target_type:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "IMAGE_ATTACHED", "message": "图片已挂载到任务，请在任务编辑中移除"},
        )
    _delete_image_file(img)
    db.delete(img)
    db.commit()
    return {"message": "已删除"}


# ── 模板 ───────────────────────────────────────────────────────────────


@router.get("/templates", response_model=list[TaskTemplateResponse])
def list_templates(
    student_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_parent),
):
    _require_bound_student(db, current_user, student_id)
    rows = (
        db.query(TaskTemplate)
        .filter(TaskTemplate.student_id == student_id)
        .order_by(TaskTemplate.created_at.desc())
        .all()
    )
    return [_template_response(db, t) for t in rows]


@router.post("/templates", response_model=TaskTemplateResponse, status_code=status.HTTP_201_CREATED)
def create_template(
    data: TaskTemplateCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_parent),
):
    _require_bound_student(db, current_user, data.student_id)
    if data.repeat_type == "weekly" and not data.repeat_weekdays:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "WEEKDAYS_REQUIRED", "message": "每周任务需选择重复星期"},
        )
    t = TaskTemplate(
        created_by_id=current_user.id,
        student_id=data.student_id,
        category=data.category,
        subject=data.subject,
        name=data.name,
        description=data.description,
        require_evidence=data.require_evidence,
        estimated_minutes=data.estimated_minutes,
        repeat_type=data.repeat_type,
        repeat_weekdays=json.dumps(data.repeat_weekdays),
        start_date=data.start_date or task_generation.local_today(),
        end_date=data.end_date,
        status="active",
        version=0,
    )
    db.add(t)
    db.flush()
    _attach_images(db, data.illustration_image_ids, "template", t.id, "illustration", current_user.id)
    db.commit()
    db.refresh(t)
    return _template_response(db, t)


@router.put("/templates/{template_id}", response_model=TaskTemplateResponse)
def update_template(
    template_id: int,
    data: TaskTemplateUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_parent),
):
    t = db.get(TaskTemplate, template_id)
    if not t:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "NOT_FOUND", "message": "模板不存在"},
        )
    _require_bound_student(db, current_user, t.student_id)
    _check_version(t, data.version)
    for field in ["category", "subject", "name", "description", "require_evidence",
                  "estimated_minutes", "repeat_type", "start_date", "end_date", "status"]:
        val = getattr(data, field, None)
        if val is not None:
            setattr(t, field, val)
    if data.repeat_weekdays is not None:
        if t.repeat_type == "weekly" and not data.repeat_weekdays:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"code": "WEEKDAYS_REQUIRED", "message": "每周任务需选择重复星期"},
            )
        t.repeat_weekdays = json.dumps(data.repeat_weekdays)
    if data.illustration_image_ids is not None:
        _replace_images(db, data.illustration_image_ids, "template", t.id, "illustration", current_user.id)
    t.version += 1
    t.updated_at = _utcnow()
    db.commit()
    db.refresh(t)
    return _template_response(db, t)


@router.delete("/templates/{template_id}")
def delete_template(
    template_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_parent),
):
    t = db.get(TaskTemplate, template_id)
    if not t:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "NOT_FOUND", "message": "模板不存在"},
        )
    _require_bound_student(db, current_user, t.student_id)
    t.status = "archived"
    db.commit()
    return {"message": "已归档"}


# ── 每日任务 ───────────────────────────────────────────────────────────


@router.get("/daily", response_model=list[TaskInstanceResponse])
def list_daily(
    date: date | None = None,
    student_id: int | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    d = date or task_generation.local_today()
    if current_user.role == "parent":
        if not student_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"code": "STUDENT_REQUIRED", "message": "请选择孩子"},
            )
        _require_bound_student(db, current_user, student_id)
    else:
        student_id = current_user.id
    task_generation.ensure_instances(db, student_id, d)
    if d == task_generation.local_today():
        task_generation.ensure_auto_review(db, student_id)
    rows = (
        db.query(TaskInstance)
        .filter(TaskInstance.student_id == student_id, TaskInstance.task_date == d)
        .order_by(TaskInstance.id)
        .all()
    )
    return [_instance_response(db, r) for r in rows]


@router.post("/daily", response_model=TaskInstanceResponse, status_code=status.HTTP_201_CREATED)
def create_daily_task(
    data: TaskInstanceCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role == "parent":
        _require_bound_student(db, current_user, data.student_id)
    else:
        if data.student_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={"code": "FORBIDDEN", "message": "只能为自己创建附加任务"},
            )
    inst = TaskInstance(
        template_id=None,
        created_by_id=current_user.id,
        student_id=data.student_id,
        task_date=data.date,
        category=data.category,
        subject=data.subject,
        name=data.name,
        description=data.description,
        require_evidence=data.require_evidence,
        estimated_minutes=data.estimated_minutes,
        source="manual",
        status="pending",
        version=0,
    )
    db.add(inst)
    db.flush()
    _attach_images(db, data.illustration_image_ids, "instance", inst.id, "illustration", current_user.id)
    db.commit()
    db.refresh(inst)
    return _instance_response(db, inst)


@router.put("/{instance_id}", response_model=TaskInstanceResponse)
def update_instance(
    instance_id: int,
    data: TaskInstanceUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    inst = db.get(TaskInstance, instance_id)
    if not inst:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "NOT_FOUND", "message": "任务不存在"},
        )
    if not _can_manage(db, current_user, inst):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "FORBIDDEN", "message": "无权编辑该任务"},
        )
    _check_version(inst, data.version)
    for field in ["category", "subject", "name", "description", "require_evidence", "estimated_minutes"]:
        val = getattr(data, field, None)
        if val is not None:
            setattr(inst, field, val)
    if data.illustration_image_ids is not None:
        _replace_images(db, data.illustration_image_ids, "instance", inst.id, "illustration", current_user.id)
    inst.version += 1
    inst.updated_at = _utcnow()
    db.commit()
    db.refresh(inst)
    return _instance_response(db, inst)


@router.delete("/{instance_id}")
def delete_instance(
    instance_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    inst = db.get(TaskInstance, instance_id)
    if not inst:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "NOT_FOUND", "message": "任务不存在"},
        )
    if not _can_manage(db, current_user, inst):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "FORBIDDEN", "message": "无权删除该任务"},
        )
    if inst.source == "auto_review":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "CANNOT_DELETE_AUTO", "message": "自动复习任务不可删除"},
        )
    imgs = (
        db.query(TaskImage)
        .filter(TaskImage.target_type == "instance", TaskImage.target_id == inst.id)
        .all()
    )
    for im in imgs:
        _delete_image_file(im)
        db.delete(im)
    db.delete(inst)
    db.commit()
    return {"message": "已删除"}


@router.post("/daily/copy")
def copy_yesterday(
    data: CopyRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_parent),
):
    _require_bound_student(db, current_user, data.student_id)
    target = data.target_date or task_generation.local_today()
    source = target - timedelta(days=1)
    task_generation.ensure_instances(db, data.student_id, source)
    src_rows = (
        db.query(TaskInstance)
        .filter(TaskInstance.student_id == data.student_id, TaskInstance.task_date == source)
        .all()
    )
    existing = (
        db.query(TaskInstance)
        .filter(TaskInstance.student_id == data.student_id, TaskInstance.task_date == target)
        .all()
    )
    existing_keys = {(e.category, e.subject, e.name, e.description) for e in existing}
    copied = skipped = 0
    for s in src_rows:
        if s.source == "auto_review":
            continue  # 自动复习任务按记忆曲线每天单独生成，不参与复制
        key = (s.category, s.subject, s.name, s.description)
        if key in existing_keys:
            skipped += 1
            continue
        inst = TaskInstance(
            template_id=None,
            created_by_id=current_user.id,
            student_id=data.student_id,
            task_date=target,
            category=s.category,
            subject=s.subject,
            name=s.name,
            description=s.description,
            require_evidence=s.require_evidence,
            estimated_minutes=s.estimated_minutes,
            source="manual",
            status="pending",
            version=0,
        )
        db.add(inst)
        db.flush()
        task_generation._copy_illustrations(db, "instance", s.id, "instance", inst.id)
        existing_keys.add(key)
        copied += 1
    db.commit()
    return {"copied": copied, "skipped": skipped}


# ── 状态机：提交 / 撤回 / 批改 ────────────────────────────────────────


@router.post("/{instance_id}/submit", response_model=TaskInstanceResponse)
def submit_task(
    instance_id: int,
    data: CheckinSubmit,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_student),
):
    inst = db.get(TaskInstance, instance_id)
    if not inst:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "NOT_FOUND", "message": "任务不存在"},
        )
    if inst.student_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "FORBIDDEN", "message": "只能提交自己的任务"},
        )
    if inst.status not in ("pending", "rejected"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "INVALID_STATE", "message": "当前状态不可提交"},
        )
    if inst.task_date != task_generation.local_today():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "TASK_DATE_MISMATCH", "message": "仅可在任务当天提交"},
        )
    if inst.require_evidence and not data.evidence_image_ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "EVIDENCE_REQUIRED", "message": "该任务需上传完成图片"},
        )
    if data.evidence_image_ids:
        _replace_images(db, data.evidence_image_ids, "instance", inst.id, "evidence", current_user.id)
    inst.status = "submitted"
    inst.checkin_note = data.note
    if data.actual_minutes is not None:
        inst.actual_minutes = data.actual_minutes
    inst.submitted_at = _utcnow()
    inst.updated_at = _utcnow()
    db.commit()
    db.refresh(inst)
    return _instance_response(db, inst)


@router.post("/{instance_id}/withdraw", response_model=TaskInstanceResponse)
def withdraw_submission(
    instance_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_student),
):
    inst = db.get(TaskInstance, instance_id)
    if not inst:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "NOT_FOUND", "message": "任务不存在"},
        )
    if inst.student_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "FORBIDDEN", "message": "只能撤回自己的任务"},
        )
    if inst.status != "submitted":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "INVALID_STATE", "message": "当前状态不可撤回"},
        )
    inst.status = "pending"
    inst.updated_at = _utcnow()
    db.commit()
    db.refresh(inst)
    return _instance_response(db, inst)


@router.post("/{instance_id}/review", response_model=TaskInstanceResponse)
def review_task(
    instance_id: int,
    data: ReviewRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_parent),
):
    inst = db.get(TaskInstance, instance_id)
    if not inst:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "NOT_FOUND", "message": "任务不存在"},
        )
    _require_bound_student(db, current_user, inst.student_id)
    if inst.status != "submitted":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "INVALID_STATE", "message": "仅待检查任务可批改"},
        )
    _check_version(inst, data.version)
    if data.result == "approved":
        if data.rating is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"code": "RATING_REQUIRED", "message": "通过时请给出星级评分"},
            )
        inst.status = "approved"
        inst.rating = data.rating
        inst.review_comment = data.comment
        inst.reviewed_by_id = current_user.id
        inst.reviewed_at = _utcnow()
    else:
        inst.status = "rejected"
        inst.review_comment = data.comment
        inst.reviewed_by_id = current_user.id
        inst.reviewed_at = _utcnow()
        if data.correction_image_ids:
            _replace_images(db, data.correction_image_ids, "instance", inst.id, "correction", current_user.id)
    inst.version += 1
    inst.updated_at = _utcnow()
    db.commit()
    db.refresh(inst)
    return _instance_response(db, inst)


# ── 历史 / 汇总 ────────────────────────────────────────────────────────


@router.get("/history", response_model=list[TaskInstanceResponse])
def list_history(
    start: date,
    end: date,
    student_id: int | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role == "parent":
        if not student_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"code": "STUDENT_REQUIRED", "message": "请选择孩子"},
            )
        _require_bound_student(db, current_user, student_id)
    else:
        student_id = current_user.id
    task_generation.ensure_instances(db, student_id, end)
    rows = (
        db.query(TaskInstance)
        .filter(
            TaskInstance.student_id == student_id,
            TaskInstance.task_date >= start,
            TaskInstance.task_date <= end,
        )
        .order_by(TaskInstance.task_date, TaskInstance.id)
        .all()
    )
    return [_instance_response(db, r) for r in rows]


@router.get("/overview")
def task_overview(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    today = task_generation.local_today()
    if current_user.role == "parent":
        children = (
            db.query(FamilyBinding)
            .filter(FamilyBinding.parent_id == current_user.id, FamilyBinding.status == "active")
            .all()
        )
        result = []
        for c in children:
            stu = db.get(User, c.student_id)
            if not stu:
                continue
            task_generation.ensure_instances(db, c.student_id, today)
            task_generation.ensure_auto_review(db, c.student_id)
            counts = _status_counts(db, c.student_id, today)
            result.append(
                OverviewItem(
                    student_id=c.student_id,
                    username=stu.username,
                    display_name=stu.display_name,
                    **counts,
                )
            )
        return {"data": result}
    task_generation.ensure_instances(db, current_user.id, today)
    task_generation.ensure_auto_review(db, current_user.id)
    return _status_counts(db, current_user.id, today)
