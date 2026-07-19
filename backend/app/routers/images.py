import os
import uuid
import time
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User, QuestionImage
from app.schemas import ImageResponse
from app.auth import get_current_user

router = APIRouter(prefix="/api/v1/images", tags=["图片"])

UPLOAD_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "uploads"
)
TEMP_DIR = os.path.join(UPLOAD_DIR, "temp")
QUESTIONS_DIR = os.path.join(UPLOAD_DIR, "questions")
os.makedirs(TEMP_DIR, exist_ok=True)
os.makedirs(QUESTIONS_DIR, exist_ok=True)

ALLOWED_MIMES = {"image/jpeg", "image/png", "image/webp"}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB


@router.post("/upload", response_model=ImageResponse)
def upload_image(
    file: UploadFile = File(...),
    image_type: str = "question",
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if file.content_type not in ALLOWED_MIMES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail={
                "code": "UNSUPPORTED_MEDIA_TYPE",
                "message": f"不支持的文件类型: {file.content_type}",
            },
        )
    contents = file.file.read()
    if len(contents) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail={"code": "FILE_TOO_LARGE", "message": "文件大小超过 10MB"},
        )
    ext = file.filename.rsplit(".", 1)[-1] if "." in file.filename else "jpg"
    filename = f"{uuid.uuid4().hex}_{int(time.time())}.{ext}"
    filepath = os.path.join(TEMP_DIR, filename)
    with open(filepath, "wb") as f:
        f.write(contents)
    img = QuestionImage(
        file_path=f"/uploads/temp/{filename}",
        original_name=file.filename,
        file_size=len(contents),
        mime_type=file.content_type,
    )
    db.add(img)
    db.commit()
    db.refresh(img)
    return ImageResponse(
        id=img.id,
        file_path=img.file_path,
        mime_type=img.mime_type,
        file_size=img.file_size,
    )


@router.delete("/{image_id}")
def delete_image(
    image_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    img = db.query(QuestionImage).filter(QuestionImage.id == image_id).first()
    if not img:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "NOT_FOUND", "message": "图片不存在"},
        )
    filepath = os.path.join(UPLOAD_DIR, img.file_path.replace("/uploads/", ""))
    if os.path.exists(filepath):
        os.remove(filepath)
    db.delete(img)
    db.commit()
    return {"message": "已删除"}