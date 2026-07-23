from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Text, Float, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from app.database import Base


def _utcnow():
    """返回不带时区的当前 UTC 时间（替代已弃用的 _utcnow）"""
    return datetime.now(timezone.utc).replace(tzinfo=None)


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, index=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    display_name = Column(String(100), default="")
    created_at = Column(DateTime, default=_utcnow)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow)

    questions = relationship("Question", back_populates="user")
    reviews = relationship("Review", back_populates="user")


class Question(Base):
    __tablename__ = "questions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, default=1)
    question_content = Column(Text, default="")
    subject = Column(String(50), default="")
    error_type = Column(String(20), default="")
    difficulty = Column(Integer, default=3)
    source = Column(String(200), default="")
    correct_solution = Column(Text, default="")
    user_analysis = Column(Text, default="")
    status = Column(String(20), default="active")
    current_ef = Column(Float, default=2.5)
    current_interval = Column(Integer, default=0)
    current_rep_count = Column(Integer, default=0)
    next_review_date = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=_utcnow)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow)

    user = relationship("User", back_populates="questions")
    images = relationship("QuestionImage", back_populates="question", cascade="all, delete-orphan")
    tags = relationship("QuestionTag", back_populates="question", cascade="all, delete-orphan")
    reviews = relationship("Review", back_populates="question", cascade="all, delete-orphan")


class QuestionImage(Base):
    __tablename__ = "question_images"

    id = Column(Integer, primary_key=True, index=True)
    question_id = Column(Integer, ForeignKey("questions.id", ondelete="CASCADE"), nullable=True)
    file_path = Column(String(500), nullable=False)
    original_name = Column(String(200), default="")
    file_size = Column(Integer, default=0)
    mime_type = Column(String(50), default="image/jpeg")
    image_type = Column(String(20), default="question")  # "question" or "solution"
    sort_order = Column(Integer, default=0)
    created_at = Column(DateTime, default=_utcnow)

    question = relationship("Question", back_populates="images")


class QuestionTag(Base):
    __tablename__ = "question_tags"
    __table_args__ = (UniqueConstraint("question_id", "tag_name"),)

    id = Column(Integer, primary_key=True, index=True)
    question_id = Column(Integer, ForeignKey("questions.id", ondelete="CASCADE"), nullable=False)
    tag_name = Column(String(50), nullable=False, index=True)
    created_at = Column(DateTime, default=_utcnow)

    question = relationship("Question", back_populates="tags")


class Review(Base):
    __tablename__ = "reviews"

    id = Column(Integer, primary_key=True, index=True)
    question_id = Column(Integer, ForeignKey("questions.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    review_date = Column(DateTime, default=_utcnow)
    quality = Column(Integer, nullable=False)
    ef_before = Column(Float, default=2.5)
    ef_after = Column(Float, default=2.5)
    interval_before = Column(Integer, default=0)
    interval_after = Column(Integer, default=0)
    created_at = Column(DateTime, default=_utcnow)

    question = relationship("Question", back_populates="reviews")
    user = relationship("User", back_populates="reviews")


class TokenBlacklist(Base):
    __tablename__ = "token_blacklist"

    id = Column(Integer, primary_key=True, index=True)
    jti = Column(String(36), unique=True, index=True, nullable=False)
    expires_at = Column(DateTime, nullable=False)
    blacklisted_at = Column(DateTime, default=_utcnow)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)


class ShareLink(Base):
    __tablename__ = "share_links"

    id = Column(Integer, primary_key=True, index=True)
    token = Column(String(64), unique=True, index=True, nullable=False)
    question_ids = Column(Text, default="[]")  # JSON array
    expires_at = Column(DateTime, nullable=False)
    created_at = Column(DateTime, default=_utcnow)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)


class SystemConfig(Base):
    """系统配置键值对"""
    __tablename__ = "system_config"

    id = Column(Integer, primary_key=True, index=True)
    key = Column(String(50), unique=True, nullable=False, index=True)
    value = Column(String(200), nullable=False, default="")
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow)


class InviteCode(Base):
    """邀请码表"""
    __tablename__ = "invite_codes"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(20), unique=True, nullable=False, index=True)
    expires_at = Column(DateTime, nullable=False)
    used = Column(Integer, default=0)  # 0=未使用, 1=已使用
    used_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=_utcnow)