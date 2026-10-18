"""ima 笔记备份导出测试。

覆盖：ZIP 内 PDF 数量与命名（q{id}_{学科}_{日期}.pdf）、带图/不带图/图片缺失、
subject 过滤、status=active 过滤、未认证拒绝。只读功能：不触碰 mistake_test，
测试跑在专用库 mistake_autotest（见 conftest.py）。
"""

import base64
import io
import zipfile
from pathlib import Path

import pytest
from sqlalchemy import text
from fastapi.testclient import TestClient

from app.database import Base, engine, SessionLocal
from app.main import app
from app.models import Question, QuestionImage, QuestionTag, User
from app.auth import create_access_token

# 1x1 PNG（最小合法图片，reportlab 可读）
_TINY_PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
)


@pytest.fixture(scope="module")
def test_db():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    yield db
    db.close()
    Base.metadata.drop_all(bind=engine)


@pytest.fixture(scope="module")
def client(test_db):
    return TestClient(app)


@pytest.fixture
def env(test_db, client, tmp_path):
    test_db.execute(text("SET FOREIGN_KEY_CHECKS=0"))
    for m in (QuestionImage, QuestionTag, Question, User):
        test_db.query(m).delete()
    test_db.execute(text("SET FOREIGN_KEY_CHECKS=1"))
    test_db.commit()

    student = User(username="ima_kid", password_hash="x", role="student")
    test_db.add(student)
    test_db.commit()
    test_db.refresh(student)

    # 真实图片文件：放进 backend/uploads/questions/（本 worktree 内，测完清理）
    uploads_dir = Path(__file__).resolve().parents[1] / "uploads" / "questions"
    uploads_dir.mkdir(parents=True, exist_ok=True)
    img_file = uploads_dir / "_test_ima_sample.png"
    img_file.write_bytes(_TINY_PNG)

    # 数学题：带原始图片
    q_math = Question(
        user_id=student.id,
        question_content="已知 f(x)=x²，求 f(2)。",
        subject="数学",
        error_type="计算错误",
        difficulty=3,
        source="练习册",
        correct_solution="f(2)=4",
        user_analysis="忘了平方",
        status="active",
    )
    test_db.add(q_math)
    test_db.flush()
    test_db.add(QuestionImage(
        question_id=q_math.id,
        file_path="/uploads/questions/_test_ima_sample.png",
        original_name="sample.png",
        image_type="question",
        sort_order=0,
    ))

    # 英语题：无图片
    test_db.add(Question(
        user_id=student.id,
        question_content="abandon — ______（写出词义）",
        subject="英语",
        error_type="拼写错误",
        difficulty=2,
        source="english-word-helper",
        correct_solution="放弃；抛弃（v.）",
        user_analysis="误拼为 adbandon",
        status="active",
    ))

    # 已归档题：不应出现在备份里
    test_db.add(Question(
        user_id=student.id,
        question_content="已归档的题",
        subject="数学",
        status="archived",
    ))

    # 图片行指向不存在的文件：PDF 应降级为占位说明，不报 500
    q_missing = Question(
        user_id=student.id,
        question_content="图片丢失的题",
        subject="物理",
        status="active",
    )
    test_db.add(q_missing)
    test_db.flush()
    test_db.add(QuestionImage(
        question_id=q_missing.id,
        file_path="/uploads/questions/_no_such_file.png",
        original_name="ghost.png",
        image_type="question",
    ))

    test_db.commit()

    yield {
        "client": client,
        "h": {"Authorization": f"Bearer {create_access_token(student)[0]}"},
        "math_id": q_math.id,
    }

    img_file.unlink(missing_ok=True)


def test_ima_backup_zip_names_and_count(env):
    """ZIP 内每个 active 错题一个 PDF，命名 q{id}_{学科}_{日期}.pdf。"""
    resp = env["client"].get("/api/v1/ima-backup/notes", headers=env["h"])
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "application/zip"
    assert "attachment" in resp.headers.get("content-disposition", "")

    zf = zipfile.ZipFile(io.BytesIO(resp.content))
    names = sorted(zf.namelist())
    # 3 个 active：数学(带图)、英语、物理(图片缺失)
    assert len(names) == 3
    import re
    for name in names:
        assert re.fullmatch(r"q\d+_[^/]+_\d{8}\.pdf", name), name
    assert any(name.startswith(f"q{env['math_id']}_数学_") for name in names)
    # 每个都是真实 PDF（reportlab 输出以 %PDF 开头）
    for name in names:
        assert zf.read(name)[:4] == b"%PDF", name


def test_ima_backup_subject_filter(env):
    """可选 subject 参数只保留对应学科。"""
    resp = env["client"].get("/api/v1/ima-backup/notes", params={"subject": "数学"}, headers=env["h"])
    assert resp.status_code == 200
    names = zipfile.ZipFile(io.BytesIO(resp.content)).namelist()
    assert len(names) == 1
    assert names[0].startswith(f"q{env['math_id']}_数学_")


def test_ima_backup_empty_result_404(env):
    """过滤后无题（含 archived 被排除的情形）→ 404 而不是空 ZIP。"""
    resp = env["client"].get(
        "/api/v1/ima-backup/notes", params={"subject": "不存在学科"}, headers=env["h"]
    )
    assert resp.status_code == 404


def test_ima_backup_requires_auth(client):
    """未认证拒绝。"""
    resp = client.get("/api/v1/ima-backup/notes")
    assert resp.status_code in (401, 403)
