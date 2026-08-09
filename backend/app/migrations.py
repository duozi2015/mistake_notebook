"""增量、幂等、非破坏的数据库迁移（铁律：不破坏存量数据）。

原则：
- 新增表：由 `Base.metadata.create_all` 在启动时创建（不会触碰已有表）。
- 存量表加列：维护在 COLUMN_MIGRATIONS 中，启动时 `PRAGMA table_info` 检查，
  缺列才 `ALTER TABLE ADD COLUMN`（带 DEFAULT，存量行自动填充）。
- 绝不对存量表做删列/改列/加唯一约束（可能与旧数据冲突）。
"""

from app.database import Base
from app import models  # noqa: F401  # 确保全部模型注册到 Base.metadata（create_all 依赖）

# (表, 列, DDL)。ALTER 时带上 DEFAULT，确保存量行自动获得默认值。
COLUMN_MIGRATIONS = [
    ("users", "role", "VARCHAR(20) NOT NULL DEFAULT 'student'"),
]


def run_migrations(engine) -> list[str]:
    """执行全部迁移，返回本次执行的变更描述（幂等，可重复调用）。"""
    Base.metadata.create_all(bind=engine)
    applied: list[str] = []
    with engine.begin() as conn:
        for table, column, ddl in COLUMN_MIGRATIONS:
            rows = conn.exec_driver_sql(f'PRAGMA table_info("{table}")').fetchall()
            cols = [r[1] for r in rows]
            if column not in cols:
                conn.exec_driver_sql(f'ALTER TABLE "{table}" ADD COLUMN "{column}" {ddl}')
                applied.append(f"{table}.{column}")
    return applied
