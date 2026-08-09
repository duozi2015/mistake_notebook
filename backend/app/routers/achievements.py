"""成就接口：按当前用户角色返回成就列表（解锁状态 + 进度）。"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User
from app.auth import get_current_user
from app.services.achievements_service import get_achievements

router = APIRouter(prefix="/api/v1", tags=["成就"])


@router.get("/achievements")
def list_achievements(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return {"data": get_achievements(db, current_user)}
