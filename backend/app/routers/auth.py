from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from jose import jwt, JWTError

from app.config import settings
from app.database import get_db
from app.models import User, TokenBlacklist, InviteCode, SystemConfig
from app.schemas import UserRegister, UserLogin, TokenResponse, RefreshRequest, UserResponse, PasswordChange
from app.auth import (
    hash_password,
    verify_password,
    create_access_token,
    create_refresh_token,
    get_current_user,
)

router = APIRouter(prefix="/api/v1/auth", tags=["认证"])


@router.get("/registration-mode")
def get_registration_mode(db: Session = Depends(get_db)):
    """获取当前注册模式（公开端点，无需认证）"""
    config = (
        db.query(SystemConfig)
        .filter(SystemConfig.key == "registration_mode")
        .first()
    )
    mode = config.value if config else "open"
    return {"mode": mode}


@router.post("/register", response_model=UserResponse)
def register(data: UserRegister, db: Session = Depends(get_db)):
    # 检查用户名是否已存在
    existing = db.query(User).filter(User.username == data.username).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "CONFLICT", "message": "用户名已存在"},
        )

    # 检查注册模式
    config = (
        db.query(SystemConfig)
        .filter(SystemConfig.key == "registration_mode")
        .first()
    )
    registration_mode = config.value if config else "open"

    if registration_mode == "invite_only":
        # 仅邀请码模式：验证邀请码
        if not data.invite_code:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"code": "INVITE_CODE_REQUIRED", "message": "当前为仅邀请码注册模式，请提供邀请码"},
            )

        now = datetime.utcnow()
        invite = (
            db.query(InviteCode)
            .filter(
                InviteCode.code == data.invite_code.strip().upper(),
                InviteCode.used == 0,
                InviteCode.expires_at > now,
            )
            .first()
        )
        if not invite:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"code": "INVALID_INVITE_CODE", "message": "邀请码无效或已过期"},
            )

        # 标记邀请码为已使用
        invite.used = 1
        invite.used_at = now

        # 自动生成新邀请码
        from app.routers.admin import _generate_invite_code as gen_code
        new_code = InviteCode(
            code=gen_code(),
            expires_at=now + timedelta(days=2),
            used=0,
        )
        db.add(new_code)

    user = User(
        username=data.username,
        password_hash=hash_password(data.password),
        display_name=data.display_name or data.username,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return UserResponse(id=user.id, username=user.username, display_name=user.display_name)


@router.post("/login", response_model=TokenResponse)
def login(data: UserLogin, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == data.username).first()
    if not user or not verify_password(data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "INVALID_CREDENTIALS", "message": "用户名或密码错误"},
        )
    access_token, _, expires_in = create_access_token(user)
    refresh_token, _, _ = create_refresh_token(user)
    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=expires_in,
        user=UserResponse(id=user.id, username=user.username, display_name=user.display_name),
    )


@router.post("/refresh", response_model=TokenResponse)
def refresh(data: RefreshRequest, db: Session = Depends(get_db)):
    try:
        payload = jwt.decode(
            data.refresh_token,
            settings.JWT_SECRET,
            algorithms=[settings.JWT_ALGORITHM],
        )
        if payload.get("type") != "refresh":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail={"code": "UNAUTHORIZED", "message": "Token 类型错误"},
            )
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "UNAUTHORIZED", "message": "Refresh Token 无效或已过期"},
        )
    user = db.query(User).filter(User.id == int(payload.get("sub"))).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "UNAUTHORIZED", "message": "用户不存在"},
        )
    access_token, _, expires_in = create_access_token(user)
    refresh_token, _, _ = create_refresh_token(user)
    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=expires_in,
        user=UserResponse(id=user.id, username=user.username, display_name=user.display_name),
    )


@router.post("/logout")
def logout(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return {"message": "已登出"}


@router.get("/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user)):
    return UserResponse(
        id=current_user.id,
        username=current_user.username,
        display_name=current_user.display_name,
    )


@router.put("/password")
def change_password(
    data: PasswordChange,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not verify_password(data.old_password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "INVALID_PASSWORD", "message": "当前密码错误"},
        )
    current_user.password_hash = hash_password(data.new_password)
    db.commit()
    return {"message": "密码已更新"}