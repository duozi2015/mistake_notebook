"""数据库迁移框架测试：铁律 = 增量、幂等、非破坏，不影响存量数据。"""

import sqlite3

import pytest
from sqlalchemy import create_engine, text

# 确保全部模型注册到 Base.metadata（create_all 需要）
from app import models  # noqa: F401
from app.migrations import run_migrations

LEGACY_USERS_DDL = """
CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    display_name VARCHAR(100),
    created_at DATETIME,
    updated_at DATETIME
)
"""


@pytest.fixture
def legacy_engine(tmp_path):
    """旧结构（无 role 列）的 users 表 + 一条存量数据。"""
    db_path = tmp_path / "legacy.db"
    conn = sqlite3.connect(db_path)
    conn.executescript(LEGACY_USERS_DDL)
    conn.execute(
        "INSERT INTO users (username, password_hash, display_name, created_at) VALUES (?, ?, ?, ?)",
        ("legacy_user", "hash-abc", "存量用户", "2026-01-01 00:00:00"),
    )
    conn.commit()
    conn.close()
    engine = create_engine(f"sqlite:///{db_path}")
    yield engine
    engine.dispose()


def test_migration_adds_role_and_preserves_existing_data(legacy_engine):
    applied = run_migrations(legacy_engine)
    assert "users.role" in applied

    with legacy_engine.connect() as conn:
        cols = [r[1] for r in conn.exec_driver_sql('PRAGMA table_info("users")').fetchall()]
        assert "role" in cols
        row = conn.execute(
            text("SELECT username, display_name, role FROM users WHERE username = 'legacy_user'")
        ).fetchone()
        assert row.username == "legacy_user"
        assert row.display_name == "存量用户"  # 存量数据原样保留
        assert row.role == "student"  # 自动获得默认角色


def test_migration_is_idempotent(legacy_engine):
    run_migrations(legacy_engine)
    applied_again = run_migrations(legacy_engine)
    assert applied_again == []  # 已迁移过，不再重复 ALTER
    with legacy_engine.connect() as conn:
        cols = [r[1] for r in conn.exec_driver_sql('PRAGMA table_info("users")').fetchall()]
        assert cols.count("role") == 1


def test_migration_creates_new_tables(legacy_engine):
    run_migrations(legacy_engine)
    with legacy_engine.connect() as conn:
        tables = [r[0] for r in conn.exec_driver_sql("SELECT name FROM sqlite_master WHERE type='table'").fetchall()]
        for t in ["family_bindings", "task_templates", "task_instances", "task_images"]:
            assert t in tables
