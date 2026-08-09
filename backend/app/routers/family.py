"""家庭绑定：家长发起 → 孩子确认 → 生效（多对多）。"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User, FamilyBinding
from app.auth import get_current_user, require_parent, require_student
from app.schemas import (
    FamilyBindRequest,
    FamilyBindResponse,
    FamilyChildResponse,
    FamilyParentResponse,
    FamilyRequestResponse,
)

router = APIRouter(prefix="/api/v1/family", tags=["家庭"])


@router.post("/bind", response_model=FamilyBindResponse, status_code=status.HTTP_201_CREATED)
def bind_student(
    data: FamilyBindRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_parent),
):
    """家长按孩子用户名发起绑定请求（pending，待孩子确认）。"""
    student = db.query(User).filter(User.username == data.username.strip()).first()
    if not student:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "NOT_FOUND", "message": "学生账号不存在"},
        )
    if student.role != "student":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "INVALID_TARGET", "message": "只能绑定学生账号"},
        )
    if student.id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "SELF_BIND", "message": "不能绑定自己"},
        )
    existing = (
        db.query(FamilyBinding)
        .filter(
            FamilyBinding.parent_id == current_user.id,
            FamilyBinding.student_id == student.id,
        )
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "ALREADY_BOUND", "message": "已存在绑定关系"},
        )
    binding = FamilyBinding(
        parent_id=current_user.id, student_id=student.id, status="pending"
    )
    db.add(binding)
    db.commit()
    db.refresh(binding)
    return FamilyBindResponse(
        id=binding.id,
        parent_id=binding.parent_id,
        student_id=binding.student_id,
        student_username=student.username,
        student_display_name=student.display_name,
        status=binding.status,
    )


@router.get("/children", response_model=list[FamilyChildResponse])
def list_children(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_parent),
):
    """家长的绑定孩子列表（含待确认/已生效）。"""
    rows = (
        db.query(FamilyBinding)
        .filter(FamilyBinding.parent_id == current_user.id)
        .order_by(FamilyBinding.created_at.desc())
        .all()
    )
    result = []
    for b in rows:
        stu = db.get(User, b.student_id)
        if stu:
            result.append(
                FamilyChildResponse(
                    id=b.id,
                    student_id=b.student_id,
                    username=stu.username,
                    display_name=stu.display_name,
                    status=b.status,
                    created_at=b.created_at,
                )
            )
    return result


@router.get("/requests", response_model=list[FamilyRequestResponse])
def list_requests(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_student),
):
    """学生收到的待确认绑定请求。"""
    rows = (
        db.query(FamilyBinding)
        .filter(FamilyBinding.student_id == current_user.id, FamilyBinding.status == "pending")
        .order_by(FamilyBinding.created_at.desc())
        .all()
    )
    result = []
    for b in rows:
        parent = db.get(User, b.parent_id)
        if parent:
            result.append(
                FamilyRequestResponse(
                    id=b.id,
                    parent_id=b.parent_id,
                    username=parent.username,
                    display_name=parent.display_name,
                )
            )
    return result


@router.get("/me", response_model=list[FamilyParentResponse])
def list_my_parents(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_student),
):
    """学生的绑定家长列表（含待确认/已生效）。"""
    rows = (
        db.query(FamilyBinding)
        .filter(FamilyBinding.student_id == current_user.id)
        .order_by(FamilyBinding.created_at.desc())
        .all()
    )
    result = []
    for b in rows:
        p = db.get(User, b.parent_id)
        if p:
            result.append(
                FamilyParentResponse(
                    id=b.id,
                    parent_id=b.parent_id,
                    username=p.username,
                    display_name=p.display_name,
                    status=b.status,
                )
            )
    return result


@router.post("/bind/{binding_id}/confirm")
def confirm_binding(
    binding_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_student),
):
    """孩子确认绑定请求 → active。"""
    b = db.get(FamilyBinding, binding_id)
    if not b:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "NOT_FOUND", "message": "绑定请求不存在"},
        )
    if b.student_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "FORBIDDEN", "message": "无权操作该请求"},
        )
    if b.status != "pending":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "INVALID_STATE", "message": "该请求已处理"},
        )
    b.status = "active"
    db.commit()
    return {"id": b.id, "status": "active"}


@router.delete("/bind/{binding_id}")
def delete_binding(
    binding_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """任一方解绑（家长或学生本人）。"""
    b = db.get(FamilyBinding, binding_id)
    if not b:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "NOT_FOUND", "message": "绑定关系不存在"},
        )
    if b.parent_id != current_user.id and b.student_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "FORBIDDEN", "message": "无权解绑该关系"},
        )
    db.delete(b)
    db.commit()
    return {"message": "已解绑"}
