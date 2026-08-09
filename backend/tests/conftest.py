"""测试隔离：自动化测试使用「独立 MySQL 临时库」，绝不影响开发/生产数据。

历史教训：测试模块的 drop_all 曾清空共享库导致数据丢失。
本文件在 pytest 收集前创建一次性临时库（mistake_test_tmp_<随机>），
测试的建表/清表只影响该临时库，结束后自动删除。

前提：mistake_test 账号需有 CREATE/DROP DATABASE 权限，否则报错并给出授权命令。
"""
import atexit
import os
import random
import string
from pathlib import Path


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


DB_HOST = _load_env("DB_TEST_HOST", "127.0.0.1")
DB_PORT = int(_load_env("DB_TEST_PORT", "3306"))
DB_USER = _load_env("DB_TEST_USER", "mistake_test")
DB_PASS = _load_env("DB_TEST_PASSWORD", "")

SUFFIX = "".join(random.choices(string.ascii_lowercase + string.digits, k=6))
TEST_DB = f"mistake_test_tmp_{SUFFIX}"

import pymysql  # noqa: E402


def _connect(autocommit: bool = True):
    conn = pymysql.connect(
        host=DB_HOST, port=DB_PORT, user=DB_USER, password=DB_PASS,
        connect_timeout=10, autocommit=autocommit,
    )
    return conn


try:
    conn = _connect()
    with conn.cursor() as cur:
        cur.execute(f"CREATE DATABASE `{TEST_DB}` CHARACTER SET utf8mb4")
    conn.close()
except Exception as e:  # noqa: BLE001
    raise SystemExit(
        f"\n❌ 无法创建测试数据库 {TEST_DB}：{e}\n"
        "请在 Mac mini 的 MySQL 上为测试账号授权创建临时库，然后重跑：\n"
        "  GRANT ALL PRIVILEGES ON `mistake_test_tmp_%`.* TO 'mistake_test'@'192.168.3.%';\n"
        "  FLUSH PRIVILEGES;\n"
    ) from e


@atexit.register
def _cleanup():
    try:
        conn = _connect()
        with conn.cursor() as cur:
            cur.execute(f"DROP DATABASE IF EXISTS `{TEST_DB}`")
        conn.close()
    except Exception:  # noqa: BLE001
        pass


# 让 app 连接一次性临时库
os.environ["DATABASE_URL"] = (
    f"mysql+pymysql://{DB_USER}:{DB_PASS}@{DB_HOST}:{DB_PORT}/{TEST_DB}"
)
