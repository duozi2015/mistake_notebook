"""认证角色与权限依赖测试：注册默认学生、家长角色、登录/me 返回 role、角色门禁。"""

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.database import Base, engine, SessionLocal
from app.main import app
from app.models import User
from app.auth import require_parent, require_student


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


def _register(client, username, role=None):
    payload = {
        "username": username,
        "password": "password123",
        "display_name": f"{username}昵称",
    }
    if role:
        payload["role"] = role
    return client.post("/api/v1/auth/register", json=payload)


def test_register_default_role_is_student(client):
    resp = _register(client, "std_default")
    assert resp.status_code == 200
    assert resp.json()["role"] == "student"


def test_register_parent_role(client):
    resp = _register(client, "parent_one", role="parent")
    assert resp.status_code == 200
    assert resp.json()["role"] == "parent"


def test_register_rejects_invalid_role(client):
    resp = _register(client, "bad_role", role="admin")
    assert resp.status_code == 422


def test_login_returns_role(client):
    _register(client, "login_user")
    resp = client.post(
        "/api/v1/auth/login", json={"username": "login_user", "password": "password123"}
    )
    assert resp.status_code == 200
    assert resp.json()["user"]["role"] == "student"


def test_me_returns_role(client):
    _register(client, "me_user")
    login = client.post(
        "/api/v1/auth/login", json={"username": "me_user", "password": "password123"}
    ).json()
    headers = {"Authorization": f"Bearer {login['access_token']}"}
    resp = client.get("/api/v1/auth/me", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["role"] == "student"


def test_require_parent_blocks_student(test_db):
    student = User(username="s_parent", password_hash="x", role="student")
    test_db.add(student)
    test_db.commit()
    with pytest.raises(HTTPException) as exc:
        require_parent(student)
    assert exc.value.status_code == 403


def test_require_student_blocks_parent(test_db):
    parent = User(username="p_child", password_hash="x", role="parent")
    test_db.add(parent)
    test_db.commit()
    with pytest.raises(HTTPException) as exc:
        require_student(parent)
    assert exc.value.status_code == 403
