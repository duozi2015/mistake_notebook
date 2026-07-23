import secrets
import string
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User, InviteCode, SystemConfig
from app.schemas import (
    RegistrationModeUpdate,
    InviteCodeResponse,
    AdminSettingsResponse,
)
from app.auth import get_current_user

router = APIRouter(prefix="/api/v1/admin", tags=["管理员"])


def _require_admin(current_user: User = Depends(get_current_user)) -> User:
    """校验当前用户是否为管理员 doudou"""
    if current_user.username != "doudou":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "FORBIDDEN", "message": "仅管理员可执行此操作"},
        )
    return current_user


def _generate_invite_code() -> str:
    """生成6位随机邀请码（排除易混淆字符）"""
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # 不含 0/O/1/I
    return "".join(secrets.choice(alphabet) for _ in range(6))


def _get_or_create_invite_code(db: Session) -> InviteCode:
    """获取当前有效邀请码，若过期或不存在则自动生成新码"""
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    # 查找当前有效的未使用邀请码
    active_code = (
        db.query(InviteCode)
        .filter(
            InviteCode.used == 0,
            InviteCode.expires_at > now,
        )
        .order_by(InviteCode.created_at.desc())
        .first()
    )

    if active_code:
        return active_code

    # 没有有效码，生成新码
    new_code = InviteCode(
        code=_generate_invite_code(),
        expires_at=now + timedelta(days=2),
        used=0,
    )
    db.add(new_code)
    db.commit()
    db.refresh(new_code)
    return new_code


def _get_registration_mode(db: Session) -> str:
    """获取当前注册模式，默认为 open"""
    config = (
        db.query(SystemConfig)
        .filter(SystemConfig.key == "registration_mode")
        .first()
    )
    if not config:
        # 创建默认配置
        config = SystemConfig(key="registration_mode", value="open")
        db.add(config)
        db.commit()
        return "open"
    return config.value


def _invite_code_to_response(code: InviteCode) -> InviteCodeResponse:
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    remaining = max(0, int((code.expires_at - now).total_seconds()))
    return InviteCodeResponse(
        code=code.code,
        expires_at=code.expires_at,
        used=bool(code.used),
        remaining_seconds=remaining,
    )


@router.get("/settings", response_model=AdminSettingsResponse)
def get_admin_settings(
    db: Session = Depends(get_db),
    _admin: User = Depends(_require_admin),
):
    """获取管理员设置（注册模式 + 邀请码状态）"""
    mode = _get_registration_mode(db)
    invite_code = _get_or_create_invite_code(db)
    return AdminSettingsResponse(
        registration_mode=mode,
        invite_code=_invite_code_to_response(invite_code),
    )


@router.put("/settings/registration-mode", response_model=AdminSettingsResponse)
def update_registration_mode(
    data: RegistrationModeUpdate,
    db: Session = Depends(get_db),
    _admin: User = Depends(_require_admin),
):
    """切换注册模式（open / invite_only）"""
    config = (
        db.query(SystemConfig)
        .filter(SystemConfig.key == "registration_mode")
        .first()
    )
    if config:
        config.value = data.mode
        config.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    else:
        config = SystemConfig(key="registration_mode", value=data.mode)
        db.add(config)
    db.commit()

    invite_code = _get_or_create_invite_code(db)
    return AdminSettingsResponse(
        registration_mode=data.mode,
        invite_code=_invite_code_to_response(invite_code),
    )


@router.post("/invite-code/refresh", response_model=InviteCodeResponse)
def refresh_invite_code(
    db: Session = Depends(get_db),
    _admin: User = Depends(_require_admin),
):
    """强制刷新邀请码（旧码失效，生成新码）"""
    # 将当前所有未使用的邀请码标记为已使用
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    db.query(InviteCode).filter(
        InviteCode.used == 0,
        InviteCode.expires_at > now,
    ).update({"used": 1, "used_at": now})

    # 生成新码
    new_code = InviteCode(
        code=_generate_invite_code(),
        expires_at=now + timedelta(days=2),
        used=0,
    )
    db.add(new_code)
    db.commit()
    db.refresh(new_code)
    return _invite_code_to_response(new_code)