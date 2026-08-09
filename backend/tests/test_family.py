"""家庭绑定 API 测试：多对多两步绑定（发起→确认→生效）。"""

import pytest
from sqlalchemy import text
from fastapi.testclient import TestClient

from app.database import Base, engine, SessionLocal
from app.main import app
from app.models import User, FamilyBinding
from app.auth import create_access_token, is_active_binding


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
    """隔离环境：清空用户/绑定后新建 家长、学生、另一个学生。"""
    test_db.execute(text("SET FOREIGN_KEY_CHECKS=0"))
    test_db.query(FamilyBinding).delete()
    test_db.query(User).delete()
    test_db.execute(text("SET FOREIGN_KEY_CHECKS=1"))
    test_db.commit()
    parent = User(username="papa", password_hash="x", display_name="爸爸", role="parent")
    student = User(username="kid", password_hash="x", display_name="小明", role="student")
    other = User(username="other_student", password_hash="x", display_name="别的学生", role="student")
    test_db.add_all([parent, student, other])
    test_db.commit()
    for u in (parent, student, other):
        test_db.refresh(u)
    # 用全新会话返回，避免 MySQL 陈旧快照
    db = SessionLocal()

    def headers(u):
        return {"Authorization": f"Bearer {create_access_token(u)[0]}"}

    yield {
        "client": client,
        "db": db,
        "parent": parent,
        "student": student,
        "other": other,
        "ph": headers(parent),
        "sh": headers(student),
        "oh": headers(other),
    }
    db.close()


def test_bind_student_creates_pending(env):
    resp = env["client"].post("/api/v1/family/bind", json={"username": "kid"}, headers=env["ph"])
    assert resp.status_code == 201
    body = resp.json()
    assert body["status"] == "pending"
    assert body["student_username"] == "kid"
    assert body["student_display_name"] == "小明"


def test_bind_duplicate_conflict(env):
    env["client"].post("/api/v1/family/bind", json={"username": "kid"}, headers=env["ph"])
    resp = env["client"].post("/api/v1/family/bind", json={"username": "kid"}, headers=env["ph"])
    assert resp.status_code == 409


def test_bind_nonexistent_404(env):
    resp = env["client"].post("/api/v1/family/bind", json={"username": "nobody"}, headers=env["ph"])
    assert resp.status_code == 404


def test_bind_parent_target_400(env):
    resp = env["client"].post("/api/v1/family/bind", json={"username": "papa"}, headers=env["ph"])
    assert resp.status_code == 400


def test_bind_self_400(env):
    resp = env["client"].post("/api/v1/family/bind", json={"username": "papa"}, headers=env["ph"])
    assert resp.status_code == 400


def test_student_sees_pending_request(env):
    env["client"].post("/api/v1/family/bind", json={"username": "kid"}, headers=env["ph"])
    resp = env["client"].get("/api/v1/family/requests", headers=env["sh"])
    assert resp.status_code == 200
    items = resp.json()
    assert len(items) == 1
    assert items[0]["parent_id"] == env["parent"].id
    assert items[0]["username"] == "papa"


def test_student_confirm_binding_activates(env):
    env["client"].post("/api/v1/family/bind", json={"username": "kid"}, headers=env["ph"])
    req_id = env["client"].get("/api/v1/family/requests", headers=env["sh"]).json()[0]["id"]
    resp = env["client"].post(f"/api/v1/family/bind/{req_id}/confirm", headers=env["sh"])
    assert resp.status_code == 200
    assert resp.json()["status"] == "active"
    assert is_active_binding(env["db"], env["parent"].id, env["student"].id)


def test_confirm_twice_rejected(env):
    env["client"].post("/api/v1/family/bind", json={"username": "kid"}, headers=env["ph"])
    req_id = env["client"].get("/api/v1/family/requests", headers=env["sh"]).json()[0]["id"]
    env["client"].post(f"/api/v1/family/bind/{req_id}/confirm", headers=env["sh"])
    resp = env["client"].post(f"/api/v1/family/bind/{req_id}/confirm", headers=env["sh"])
    assert resp.status_code == 400


def test_confirm_by_other_student_forbidden(env):
    env["client"].post("/api/v1/family/bind", json={"username": "kid"}, headers=env["ph"])
    req_id = env["client"].get("/api/v1/family/requests", headers=env["sh"]).json()[0]["id"]
    resp = env["client"].post(f"/api/v1/family/bind/{req_id}/confirm", headers=env["oh"])
    assert resp.status_code == 403


def test_parent_children_list(env):
    env["client"].post("/api/v1/family/bind", json={"username": "kid"}, headers=env["ph"])
    req_id = env["client"].get("/api/v1/family/requests", headers=env["sh"]).json()[0]["id"]
    env["client"].post(f"/api/v1/family/bind/{req_id}/confirm", headers=env["sh"])
    resp = env["client"].get("/api/v1/family/children", headers=env["ph"])
    assert resp.status_code == 200
    items = resp.json()
    assert any(i["username"] == "kid" and i["status"] == "active" for i in items)


def test_student_rejects_binding(env):
    env["client"].post("/api/v1/family/bind", json={"username": "kid"}, headers=env["ph"])
    req_id = env["client"].get("/api/v1/family/requests", headers=env["sh"]).json()[0]["id"]
    resp = env["client"].delete(f"/api/v1/family/bind/{req_id}", headers=env["sh"])
    assert resp.status_code == 200
    # 确认该请求已不存在
    resp2 = env["client"].post(f"/api/v1/family/bind/{req_id}/confirm", headers=env["sh"])
    assert resp2.status_code == 404


def test_unbind_by_other_forbidden(env):
    env["client"].post("/api/v1/family/bind", json={"username": "kid"}, headers=env["ph"])
    req_id = env["client"].get("/api/v1/family/requests", headers=env["sh"]).json()[0]["id"]
    resp = env["client"].delete(f"/api/v1/family/bind/{req_id}", headers=env["oh"])
    assert resp.status_code == 403


def test_student_sees_my_parents(env):
    env["client"].post("/api/v1/family/bind", json={"username": "kid"}, headers=env["ph"])
    req_id = env["client"].get("/api/v1/family/requests", headers=env["sh"]).json()[0]["id"]
    env["client"].post(f"/api/v1/family/bind/{req_id}/confirm", headers=env["sh"])
    resp = env["client"].get("/api/v1/family/me", headers=env["sh"])
    assert resp.status_code == 200
    items = resp.json()
    assert any(i["username"] == "papa" and i["status"] == "active" for i in items)


def test_role_gates(env):
    # 家长不能看 /requests，学生不能看 /children
    assert env["client"].get("/api/v1/family/requests", headers=env["ph"]).status_code == 403
    assert env["client"].get("/api/v1/family/children", headers=env["sh"]).status_code == 403
