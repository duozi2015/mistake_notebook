from datetime import datetime, timedelta, timezone
from uuid import uuid4
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from passlib.context import CryptContext
from jose import jwt, JWTError

from app.config import settings
from app.database import get_db
from app.models import User, TokenBlacklist, FamilyBinding

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer(auto_error=False)


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def create_access_token(user: User) -> tuple[str, str, int]:
    jti = str(uuid4())
    expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user.id),
        "username": user.username,
        "jti": jti,
        "type": "access",
        "exp": now + expires,
        "iat": now,
    }
    token = jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)
    return token, jti, int(expires.total_seconds())


def create_refresh_token(user: User) -> tuple[str, str, int]:
    jti = str(uuid4())
    expires = timedelta(minutes=settings.REFRESH_TOKEN_EXPIRE_MINUTES)
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user.id),
        "username": user.username,
        "jti": jti,
        "type": "refresh",
        "exp": now + expires,
        "iat": now,
    }
    token = jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)
    return token, jti, int(expires.total_seconds())


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
) -> User:
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "UNAUTHORIZED", "message": "缺少认证 Token"},
        )
    token = credentials.credentials
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail={"code": "UNAUTHORIZED", "message": "Token 类型错误"},
            )
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "UNAUTHORIZED", "message": "Token 无效或已过期"},
        )
    jti = payload.get("jti")
    blacklisted = db.query(TokenBlacklist).filter(TokenBlacklist.jti == jti).first()
    if blacklisted:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "TOKEN_BLACKLISTED", "message": "Token 已被登出"},
        )
    user = db.query(User).filter(User.id == int(payload.get("sub"))).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "UNAUTHORIZED", "message": "用户不存在"},
        )
    return user


def require_parent(current_user: User = Depends(get_current_user)) -> User:
    """仅家长可访问的依赖。"""
    if current_user.role != "parent":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "FORBIDDEN", "message": "仅家长可操作"},
        )
    return current_user


def require_student(current_user: User = Depends(get_current_user)) -> User:
    """仅学生可访问的依赖。"""
    if current_user.role != "student":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "FORBIDDEN", "message": "仅学生可操作"},
        )
    return current_user


def is_active_binding(db: Session, parent_id: int, student_id: int) -> bool:
    """parent 与 student 是否存在已生效（active）的绑定。"""
    return (
        db.query(FamilyBinding)
        .filter(
            FamilyBinding.parent_id == parent_id,
            FamilyBinding.student_id == student_id,
            FamilyBinding.status == "active",
        )
        .first()
        is not None
    )


def resolve_student_id(db: Session, current_user: User, student_id: int | None) -> int:
    """家长可指定已 active 绑定的学生 id；否则使用本人。学生禁止查看他人数据。"""
    if student_id is None:
        return current_user.id
    if current_user.role != "parent":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "FORBIDDEN", "message": "无权查看他人数据"},
        )
    if not is_active_binding(db, current_user.id, student_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "NOT_BOUND", "message": "未绑定该学生"},
        )
    return student_id