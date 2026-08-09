"""家长只读错题本测试：questions/statistics 支持 student_id（仅绑定家长），含 due 过滤。"""

from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import text
from fastapi.testclient import TestClient

from app.database import Base, engine, SessionLocal
from app.main import app
from app.models import FamilyBinding, Question, User
from app.auth import create_access_token


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
def env(test_db, client):
    test_db.execute(text("SET FOREIGN_KEY_CHECKS=0"))
    test_db.query(Question).delete()
    test_db.query(FamilyBinding).delete()
    test_db.query(User).delete()
    test_db.execute(text("SET FOREIGN_KEY_CHECKS=1"))
    test_db.commit()
    parent = User(username="pv_parent", password_hash="x", role="parent")
    student = User(username="pv_student", password_hash="x", role="student")
    other = User(username="pv_other", password_hash="x", role="student")
    test_db.add_all([parent, student, other])
    test_db.commit()
    for u in (parent, student, other):
        test_db.refresh(u)
    test_db.add(FamilyBinding(parent_id=parent.id, student_id=student.id, status="active"))
    test_db.commit()

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    due = Question(
        user_id=student.id, question_content="到期题", subject="数学",
        status="active", next_review_date=now,
    )
    later = Question(
        user_id=student.id, question_content="未到期题", subject="语文",
        status="active", next_review_date=now + timedelta(days=5),
    )
    other_q = Question(
        user_id=other.id, question_content="别人的题", subject="英语", status="active",
        next_review_date=now,
    )
    test_db.add_all([due, later, other_q])
    test_db.commit()
    # 用全新会话返回，避免 MySQL 陈旧快照
    db = SessionLocal()

    def headers(u):
        return {"Authorization": f"Bearer {create_access_token(u)[0]}"}

    yield {
        "client": client, "db": db, "parent": parent, "student": student, "other": other,
        "ph": headers(parent), "sh": headers(student), "oh": headers(other),
    }
    db.close()


def test_parent_lists_child_questions(env):
    resp = env["client"].get(
        f"/api/v1/questions?student_id={env['student'].id}&page_size=50", headers=env["ph"]
    )
    assert resp.status_code == 200
    names = [q["question_content"] for q in resp.json()["data"]]
    assert "到期题" in names and "未到期题" in names
    assert "别人的题" not in names


def test_parent_cannot_view_unbound_student(env):
    resp = env["client"].get(
        f"/api/v1/questions?student_id={env['other'].id}", headers=env["ph"]
    )
    assert resp.status_code == 403
    assert resp.json()["detail"]["code"] == "NOT_BOUND"


def test_student_cannot_view_others(env):
    resp = env["client"].get(
        f"/api/v1/questions?student_id={env['other'].id}", headers=env["sh"]
    )
    assert resp.status_code == 403
    assert resp.json()["detail"]["code"] == "FORBIDDEN"


def test_parent_due_filter(env):
    resp = env["client"].get(
        f"/api/v1/questions?student_id={env['student'].id}&due=1", headers=env["ph"]
    )
    assert resp.status_code == 200
    names = [q["question_content"] for q in resp.json()["data"]]
    assert "到期题" in names
    assert "未到期题" not in names


def test_parent_sees_child_statistics_overview(env):
    resp = env["client"].get(
        f"/api/v1/statistics/overview?student_id={env['student'].id}", headers=env["ph"]
    )
    assert resp.status_code == 200
    assert resp.json()["total_questions"] == 2
    assert resp.json()["overdue_review_count"] == 1


def test_parent_statistics_unbound_403(env):
    resp = env["client"].get(
        f"/api/v1/statistics/overview?student_id={env['other'].id}", headers=env["ph"]
    )
    assert resp.status_code == 403
