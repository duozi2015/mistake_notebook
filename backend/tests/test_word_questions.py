"""english-word-helper 集成契约测试。

对方项目（考纲词汇 Web 应用）约定通过 POST /api/v1/questions 联动背错单词：
  subject="英语" / tags=["单词","考纲词汇"] / source="english-word-helper"
  error_type ∈ {"拼写错误","词义混淆"}
本文件钉住这个契约：字段可往返、筛选可用，防止未来改表时静默破坏。
"""

import pytest
from sqlalchemy import text
from fastapi.testclient import TestClient

from app.database import Base, engine, SessionLocal
from app.main import app
from app.models import Question, QuestionTag, User
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
    for m in (QuestionTag, Question, User):
        test_db.query(m).delete()
    test_db.execute(text("SET FOREIGN_KEY_CHECKS=1"))
    test_db.commit()

    student = User(username="word_kid", password_hash="x", role="student")
    test_db.add(student)
    test_db.commit()
    test_db.refresh(student)

    yield {
        "client": client,
        "student": student,
        "h": {"Authorization": f"Bearer {create_access_token(student)[0]}"},
    }


def _word_body(**overrides) -> dict:
    """english-word-helper 约定的最小联动 body。"""
    body = {
        "question_content": "abandon — ______（写出词义）",
        "subject": "英语",
        "tags": ["单词", "考纲词汇"],
        "error_type": "拼写错误",
        "difficulty": 3,
        "source": "english-word-helper",
        "correct_solution": "放弃；抛弃（v.）",
        "user_analysis": "误拼为 adbandon",
    }
    body.update(overrides)
    return body


def test_create_word_question_round_trip(env):
    """联动 body 创建 → 字段完整往返。"""
    resp = env["client"].post("/api/v1/questions", json=_word_body(), headers=env["h"])
    assert resp.status_code == 201
    data = resp.json()
    assert data["subject"] == "英语"
    assert data["error_type"] == "拼写错误"
    assert data["source"] == "english-word-helper"
    assert set(data["tags"]) == {"单词", "考纲词汇"}
    assert data["correct_solution"] == "放弃；抛弃（v.）"
    # SM-2 字段自动初始化，进复习调度零成本
    assert data["current_ef"] == 2.5
    assert data["next_review_date"] is None


def test_create_word_question_confusion_type(env):
    """另一种错误类型「词义混淆」同样可用。"""
    resp = env["client"].post(
        "/api/v1/questions",
        json=_word_body(
            question_content="adapt — ______（区别：adopt）",
            error_type="词义混淆",
            user_analysis="误选 adopt",
        ),
        headers=env["h"],
    )
    assert resp.status_code == 201
    assert resp.json()["error_type"] == "词义混淆"


def test_filter_by_word_error_type(env):
    """列表接口按 error_type 筛选（对方回查错词将用这个）。"""
    env["client"].post("/api/v1/questions", json=_word_body(), headers=env["h"])
    env["client"].post(
        "/api/v1/questions",
        json=_word_body(question_content="adapt — ______", error_type="词义混淆"),
        headers=env["h"],
    )

    resp = env["client"].get(
        "/api/v1/questions",
        params={"error_type": "拼写错误", "status": "active"},
        headers=env["h"],
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["pagination"]["total"] == 1
    assert data["data"][0]["error_type"] == "拼写错误"

    resp2 = env["client"].get(
        "/api/v1/questions",
        params={"error_type": "词义混淆", "status": "active"},
        headers=env["h"],
    )
    assert resp2.json()["pagination"]["total"] == 1

    # 未出现过的类型 → 空列表而非报错
    resp3 = env["client"].get(
        "/api/v1/questions",
        params={"error_type": "不存在的类型", "status": "active"},
        headers=env["h"],
    )
    assert resp3.status_code == 200
    assert resp3.json()["pagination"]["total"] == 0


def test_word_question_isolated_by_user(env):
    """其他用户看不到这些联动错题（数据隔离契约）。"""
    env["client"].post("/api/v1/questions", json=_word_body(), headers=env["h"])

    other = User(username="word_other", password_hash="x", role="student")
    test_db = SessionLocal()
    test_db.add(other)
    test_db.commit()
    test_db.refresh(other)
    other_h = {"Authorization": f"Bearer {create_access_token(other)[0]}"}
    test_db.close()

    resp = env["client"].get("/api/v1/questions", params={"status": "active"}, headers=other_h)
    assert resp.json()["pagination"]["total"] == 0


# ── 复习调度分离：单词错题归背单词应用，错题本只归档 ───────────────────


def _create_question(db: SessionLocal, user_id: int, **overrides) -> Question:
    body = {
        "user_id": user_id,
        "subject": "英语",
        "difficulty": 3,
        "question_content": "hello — ______",
        "correct_solution": "你好",
        "status": "active",
    }
    body.update(overrides)
    q = Question(**body)
    db.add(q)
    db.commit()
    db.refresh(q)
    return q


def test_list_source_filter(env):
    """列表按 source 精确过滤 / 排除过滤（前端 Tab 依赖）。"""
    test_db = SessionLocal()
    normal = _create_question(test_db, env["student"].id, subject="数学",
                              question_content="1+1=?")
    word = _create_question(test_db, env["student"].id,
                            source="english-word-helper")
    normal_id, word_id = normal.id, word.id
    test_db.close()

    only_words = env["client"].get(
        "/api/v1/questions",
        params={"source": "english-word-helper", "status": "active"},
        headers=env["h"],
    ).json()
    assert only_words["pagination"]["total"] == 1
    assert only_words["data"][0]["id"] == word_id

    only_normal = env["client"].get(
        "/api/v1/questions",
        params={"exclude_source": "english-word-helper", "status": "active"},
        headers=env["h"],
    ).json()
    assert only_normal["pagination"]["total"] == 1
    assert only_normal["data"][0]["id"] == normal_id


def test_daily_review_excludes_word_questions(env):
    """复习队列不出现单词错题（它们的节奏归背单词应用）。"""
    test_db = SessionLocal()
    _create_question(test_db, env["student"].id, subject="数学",
                     question_content="2+2=?")
    _create_question(test_db, env["student"].id,
                     source="english-word-helper")
    test_db.close()

    resp = env["client"].get("/api/v1/reviews/daily", headers=env["h"])
    assert resp.status_code == 200
    data = resp.json()
    assert data["pagination"]["total"] == 1
    assert data["data"][0]["source"] != "english-word-helper"


def test_variants_exclude_word_questions(env):
    """变式题候选不含单词错题。"""
    from app.models import QuestionTag

    test_db = SessionLocal()
    base = _create_question(test_db, env["student"].id, subject="英语",
                            question_content="take — ______")
    candidate = _create_question(test_db, env["student"].id, subject="英语",
                                 question_content="bring — ______")
    word = _create_question(test_db, env["student"].id,
                            source="english-word-helper")
    for q in (base, candidate, word):
        test_db.add(QuestionTag(question_id=q.id, tag_name="动词辨析"))
    test_db.commit()
    base_id, candidate_id, word_id = base.id, candidate.id, word.id
    test_db.close()

    resp = env["client"].get(f"/api/v1/variants/{base_id}", headers=env["h"])
    assert resp.status_code == 200
    data = resp.json()
    ids = [q["id"] for q in data["data"]]
    assert candidate_id in ids
    assert word_id not in ids
