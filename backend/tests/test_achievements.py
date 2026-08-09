"""成就引擎测试：指标聚合 + 规则解锁 + 角色区分。"""

from datetime import date, datetime, timedelta

import pytest
from sqlalchemy import text
from fastapi.testclient import TestClient

from app.database import Base, engine, SessionLocal
from app.main import app
from app.models import FamilyBinding, Question, Review, TaskInstance, User
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
    for m in (Review, TaskInstance, Question, FamilyBinding, User):
        test_db.query(m).delete()
    test_db.execute(text("SET FOREIGN_KEY_CHECKS=1"))
    test_db.commit()
    parent = User(username="ac_parent", password_hash="x", role="parent")
    student = User(username="ac_student", password_hash="x", role="student")
    test_db.add_all([parent, student])
    test_db.commit()
    for u in (parent, student):
        test_db.refresh(u)
    test_db.add(FamilyBinding(parent_id=parent.id, student_id=student.id, status="active"))
    test_db.commit()
    # 用全新会话返回，避免 MySQL 陈旧快照
    db = SessionLocal()

    def headers(u):
        return {"Authorization": f"Bearer {create_access_token(u)[0]}"}

    yield {
        "client": client, "db": db, "parent": parent, "student": student,
        "ph": headers(parent), "sh": headers(student),
    }
    db.close()


def _approved(db, student_id, d, created_by=None, rating=None, reviewed_by=None):
    inst = TaskInstance(
        created_by_id=created_by, student_id=student_id, task_date=d,
        category="learning", name="t", status="approved",
        rating=rating, reviewed_by_id=reviewed_by,
    )
    db.add(inst)
    db.commit()
    return inst


def _by_code(data, code):
    return next(x for x in data if x["code"] == code)


def test_student_no_data_all_locked(env):
    resp = env["client"].get("/api/v1/achievements", headers=env["sh"])
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert all(not x["unlocked"] for x in data)
    assert _by_code(data, "first_task")["progress"] == 0


def test_student_first_task_and_thresholds(env):
    _approved(env["db"], env["student"].id, date(2026, 8, 1), created_by=env["parent"].id)
    data = env["client"].get("/api/v1/achievements", headers=env["sh"]).json()["data"]
    assert _by_code(data, "first_task")["unlocked"] is True
    assert _by_code(data, "task_10")["unlocked"] is False
    assert _by_code(data, "task_10")["progress"] == 1
    # 补到 10 个
    for i in range(9):
        _approved(env["db"], env["student"].id, date(2026, 8, 1) + timedelta(days=i))
    data = env["client"].get("/api/v1/achievements", headers=env["sh"]).json()["data"]
    assert _by_code(data, "task_10")["unlocked"] is True


def test_student_streak_3(env):
    base = date(2026, 8, 1)
    for i in range(3):
        _approved(env["db"], env["student"].id, base + timedelta(days=i), created_by=env["parent"].id)
    data = env["client"].get("/api/v1/achievements", headers=env["sh"]).json()["data"]
    assert _by_code(data, "streak_3")["unlocked"] is True
    assert _by_code(data, "streak_7")["unlocked"] is False


def test_student_stars_and_self(env):
    for i in range(4):
        _approved(env["db"], env["student"].id, date(2026, 8, 1) + timedelta(days=i),
                  created_by=env["student"].id, rating=5)  # 自主任务，4*5=20星
    data = env["client"].get("/api/v1/achievements", headers=env["sh"]).json()["data"]
    assert _by_code(data, "stars_10")["unlocked"] is True
    assert _by_code(data, "self_task_5")["unlocked"] is False  # 4 < 5


def test_student_review_streak(env):
    q = Question(user_id=env["student"].id, question_content="复习用题", status="active")
    env["db"].add(q)
    env["db"].commit()
    env["db"].refresh(q)
    base = date(2026, 8, 1)
    for i in range(7):
        env["db"].add(Review(
            user_id=env["student"].id, question_id=q.id,
            review_date=datetime.combine(base + timedelta(days=i), datetime.min.time()),
            quality=3,
        ))
    env["db"].commit()
    data = env["client"].get("/api/v1/achievements", headers=env["sh"]).json()["data"]
    assert _by_code(data, "review_7")["unlocked"] is True


def test_parent_assign_and_review(env):
    base = date(2026, 8, 1)
    for i in range(7):  # 布置 7 天
        _approved(env["db"], env["student"].id, base + timedelta(days=i),
                  created_by=env["parent"].id, rating=5, reviewed_by=env["parent"].id)
    data = env["client"].get("/api/v1/achievements", headers=env["ph"]).json()["data"]
    assert _by_code(data, "assign_7")["unlocked"] is True
    assert _by_code(data, "review_first")["unlocked"] is True
    assert _by_code(data, "stars_give_20")["unlocked"] is True  # 7*5=35 星


def test_role_split(env):
    student_data = env["client"].get("/api/v1/achievements", headers=env["sh"]).json()["data"]
    parent_data = env["client"].get("/api/v1/achievements", headers=env["ph"]).json()["data"]
    student_codes = {x["code"] for x in student_data}
    parent_codes = {x["code"] for x in parent_data}
    assert "first_task" in student_codes and "first_task" not in parent_codes
    assert "assign_first" in parent_codes and "assign_first" not in student_codes
