"""测试隔离：自动化测试使用专用 MySQL 库 mistake_autotest，绝不影响开发/生产数据。

- 开发/生产库：mistake_test / mistake_prod —— pytest 不触碰。
- mistake_autotest 为 pytest 专用，可随意建表/清表；会话开始先清空一次保证干净。
- MySQL 不可达时（如 Mac mini 离线）自动降级为本地临时 SQLite，保证测试随时可跑。
"""
import os
import socket
import tempfile
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


def _mysql_reachable(host: str, port: int) -> bool:
    try:
        with socket.create_connection((host, port), timeout=2):
            return True
    except OSError:
        return False


if _mysql_reachable(DB_HOST, DB_PORT):
    # 让 app 连接专用自动化测试库
    os.environ["DATABASE_URL"] = (
        f"mysql+pymysql://{DB_USER}:{DB_PASS}@{DB_HOST}:{DB_PORT}/{DB_NAME}"
    )
else:
    # 兜底：MySQL 不可达时用临时 SQLite（每次 pytest 会话独立）
    _sqlite_path = Path(tempfile.mkdtemp(prefix="mistake_autotest_")) / "autotest.db"
    os.environ["DATABASE_URL"] = f"sqlite:///{_sqlite_path}"


@pytest.fixture(scope="session", autouse=True)
def _clean_session_db():
    """会话开始时清空自动化测试库，保证每次跑测试从干净状态开始。"""
    from app.database import Base, engine
    Base.metadata.drop_all(bind=engine)
    yield
