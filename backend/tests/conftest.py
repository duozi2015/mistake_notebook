"""测试隔离：自动化测试使用专用 MySQL 库 mistake_autotest，绝不影响开发/生产数据。

- 开发/生产库：mistake_test / mistake_prod —— pytest 不触碰。
- mistake_autotest 为 pytest 专用，可随意建表/清表；会话开始先清空一次保证干净。
"""
import os
from pathlib import Path

import pytest


def _load_env(key: str, default: str = "") -> str:
    env_path = Path(__file__).resolve().parent.parent.parent / ".env"
    if not env_path.exists():
        return default
    for line in env_path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        if k.strip() == key:
            return v.strip().strip('"')
    return default


DB_HOST = _load_env("DB_AUTOTEST_HOST", "127.0.0.1")
DB_PORT = int(_load_env("DB_AUTOTEST_PORT", "3306"))
DB_NAME = _load_env("DB_AUTOTEST_NAME", "mistake_autotest")
DB_USER = _load_env("DB_AUTOTEST_USER", "mistake_autotest")
DB_PASS = _load_env("DB_AUTOTEST_PASSWORD", "")

# 让 app 连接专用自动化测试库
os.environ["DATABASE_URL"] = (
    f"mysql+pymysql://{DB_USER}:{DB_PASS}@{DB_HOST}:{DB_PORT}/{DB_NAME}"
)


@pytest.fixture(scope="session", autouse=True)
def _clean_session_db():
    """会话开始时清空自动化测试库，保证每次跑测试从干净状态开始。"""
    from app.database import Base, engine
    Base.metadata.drop_all(bind=engine)
    yield
