from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase

from app.config import settings

# 按机器环境解析出实际 MySQL 数据库地址（生产→mistake_prod，开发→mistake_test）
db_url = settings.resolved_database_url()
engine = create_engine(db_url, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()