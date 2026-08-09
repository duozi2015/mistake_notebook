from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase

from app.config import settings

# 按机器环境解析出实际数据库地址（显式 DATABASE_URL 优先；否则生产/测试 MySQL）
db_url = settings.resolved_database_url()

# 方言相关引擎参数：SQLite 需 check_same_thread；MySQL 用 pool_pre_ping 防断连
engine_kwargs = {}
if db_url.startswith("sqlite"):
    engine_kwargs["connect_args"] = {"check_same_thread": False}
else:
    engine_kwargs["pool_pre_ping"] = True

engine = create_engine(db_url, **engine_kwargs)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()