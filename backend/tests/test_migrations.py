"""数据库迁移框架测试（MySQL）：铁律 = 增量、幂等、非破坏，不影响存量数据。"""

import pytest
from sqlalchemy import inspect, text

# 确保全部模型注册到 Base.metadata（create_all 需要）
from app import models  # noqa: F401
from app.database import Base, engine
from app.migrations import run_migrations

LEGACY_USERS_DDL = """
CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    display_name VARCHAR(100),
    created_at DATETIME,
    updated_at DATETIME
)
"""


@pytest.fixture(scope="module")
def legacy_users():
    """临时库中建「旧结构（无 role 列）users 表」+ 一条存量数据。"""
    Base.metadata.drop_all(bind=engine)  # 确保临时库干净
    with engine.begin() as conn:
        conn.exec_driver_sql(LEGACY_USERS_DDL)
        conn.exec_driver_sql(
            "INSERT INTO users (username, password_hash, display_name, created_at) "
            "VALUES ('legacy_user', 'hash-abc', '存量用户', '2026-01-01 00:00:00')"
        )
    yield
    Base.metadata.drop_all(bind=engine)


def _role_cols():
    return [c["name"] for c in inspect(engine).get_columns("users")]


def test_migration_adds_role_and_preserves_existing_data(legacy_users):
    applied = run_migrations(engine)
    assert "users.role" in applied
    assert "role" in _role_cols()
    with engine.connect() as conn:
        row = conn.execute(
            text("SELECT username, display_name, role FROM users WHERE username = 'legacy_user'")
        ).fetchone()
        assert row.username == "legacy_user"
        assert row.display_name == "存量用户"  # 存量数据原样保留
        assert row.role == "student"  # 自动获得默认角色


def test_migration_is_idempotent(legacy_users):
    run_migrations(engine)
    applied_again = run_migrations(engine)
    assert applied_again == []  # 已迁移过，不再重复 ALTER
    assert _role_cols().count("role") == 1


def test_migration_creates_new_tables(legacy_users):
    run_migrations(engine)
    tables = inspect(engine).get_table_names()
    for t in ["family_bindings", "task_templates", "task_instances", "task_images"]:
        assert t in tables
