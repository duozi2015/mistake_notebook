"""AI 学情建议服务测试：mock LLM 网关，不依赖真实 AI 服务。"""

import pytest
from fastapi.testclient import TestClient

from app.auth import create_access_token
from app.config import settings
from app.database import Base, SessionLocal, engine
from app.main import app
from app.services import ai_suggestion_service as svc


@pytest.fixture(scope="module")
def test_db():
    """创建独立表并返回会话（与 test_statistics.py 同模式）。"""
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    yield db
    db.close()
    Base.metadata.drop_all(bind=engine)


@pytest.fixture(scope="module")
def client():
    return TestClient(app)


def auth_headers(user):
    """构造 Bearer 认证头（普通函数，避免 fixture 直调用告警）。"""
    token = create_access_token(user)[0]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(autouse=True)
def _clear_cache():
    svc._cache.clear()
    yield
    svc._cache.clear()


@pytest.fixture
def ai_settings(monkeypatch):
    """模拟已配置的 AI 网关。"""
    monkeypatch.setattr(settings, "AI_SUGGEST_ENABLED", True)
    monkeypatch.setattr(settings, "AI_BASE_URL", "https://mock-gateway.test")
    monkeypatch.setattr(settings, "AI_MODEL", "test-model:9b")
    monkeypatch.setattr(settings, "AI_API_KEY", "mock-key")


def _mock_response(content: str):
    class _Resp:
        def raise_for_status(self):
            pass

        def json(self):
            return {"choices": [{"message": {"content": content}}]}

    return _Resp()


# ── _parse_suggestions 单元测试 ────────────────────────────────────


class TestParseSuggestions:
    def test_json_array(self):
        assert svc._parse_suggestions('["建议一", "建议二"]') == ["建议一", "建议二"]

    def test_json_with_think_wrapper(self):
        text = '<think>推理过程...</think>```json\n["复习二次函数", "整理错题"]\n```'
        assert svc._parse_suggestions(text) == ["复习二次函数", "整理错题"]

    def test_plain_lines_fallback(self):
        text = "1. 先复习二次函数的基础概念\n2. 每天完成5道复习题\n好的"
        parsed = svc._parse_suggestions(text)
        assert len(parsed) == 2
        assert "二次函数" in parsed[0]

    def test_garbage_returns_empty(self):
        assert svc._parse_suggestions("嗯。") == []


# ── 服务层 / 端点集成测试 ──────────────────────────────────────────


@pytest.fixture
def user_with_data(test_db):
    from datetime import datetime, timedelta

    from app.models import Question, QuestionTag, User

    # 幂等创建：库中可能残留同名用户（非独立会话时）
    user = test_db.query(User).filter(User.username == "ai_sugg_user").first()
    if not user:
        user = User(username="ai_sugg_user", password_hash="x", display_name="AI")
        test_db.add(user)
        test_db.commit()
        test_db.refresh(user)
    # 保证该用户恰好 3 道带「二次函数」标签的活跃题（清除可能的残留）
    old_ids = [q.id for q in test_db.query(Question).filter(Question.user_id == user.id).all()]
    if old_ids:
        test_db.query(QuestionTag).filter(QuestionTag.question_id.in_(old_ids)).delete(synchronize_session=False)
        test_db.query(Question).filter(Question.user_id == user.id).delete(synchronize_session=False)
        test_db.commit()
    for i in range(3):
        q = Question(
            user_id=user.id,
            question_content=f"AI 测试题{i}",
            subject="数学",
            status="active",
            current_ef=1.5,
            current_rep_count=1,
            created_at=datetime.utcnow() - timedelta(days=1),
        )
        test_db.add(q)
        test_db.commit()
        test_db.add(QuestionTag(question_id=q.id, tag_name="二次函数"))
    test_db.commit()
    return user


class TestAiSuggestions:
    def test_ai_success_and_cache(self, client, test_db, ai_settings, user_with_data, monkeypatch):
        calls = []

        def fake_post(url, **kwargs):
            calls.append(url)
            return _mock_response('["建议A：复习二次函数", "建议B：每天复习5题", "建议C：整理错因"]')

        monkeypatch.setattr(svc.httpx2, "post", fake_post)

        headers = auth_headers(user_with_data)
        resp = client.get("/api/v1/statistics/ai-suggestions", headers=headers)
        assert resp.status_code == 200
        body = resp.json()
        assert body["source"] == "ai"
        assert body["model"] == "test-model:9b"
        assert len(body["suggestions"]) == 3
        assert body["cached"] is False
        assert len(calls) == 1
        assert calls[0].startswith("https://mock-gateway.test/v1/chat/completions")

        # 第二次命中缓存
        resp2 = client.get("/api/v1/statistics/ai-suggestions", headers=headers)
        body2 = resp2.json()
        assert body2["cached"] is True
        assert body2["source"] == "ai"
        assert len(calls) == 1  # 未再打网关

        # force 刷新会再次调用
        resp3 = client.get("/api/v1/statistics/ai-suggestions?force=true", headers=headers)
        assert resp3.json()["cached"] is False
        assert len(calls) == 2

    def test_fallback_on_llm_failure(self, client, test_db, ai_settings, user_with_data, monkeypatch):
        def fake_post(url, **kwargs):
            raise ConnectionError("gateway down")

        monkeypatch.setattr(svc.httpx2, "post", fake_post)
        headers = auth_headers(user_with_data)
        resp = client.get("/api/v1/statistics/ai-suggestions", headers=headers)
        assert resp.status_code == 200
        body = resp.json()
        assert body["source"] == "rules"
        assert len(body["suggestions"]) > 0
        assert any("二次函数" in s for s in body["suggestions"])

    def test_unconfigured_falls_back_to_rules(self, client, test_db, user_with_data, monkeypatch):
        monkeypatch.setattr(settings, "AI_BASE_URL", "")
        headers = auth_headers(user_with_data)
        resp = client.get("/api/v1/statistics/ai-suggestions", headers=headers)
        assert resp.status_code == 200
        body = resp.json()
        assert body["source"] == "rules"
        assert len(body["suggestions"]) > 0

    def test_requires_auth(self, client):
        resp = client.get("/api/v1/statistics/ai-suggestions")
        assert resp.status_code in (401, 403)

    def test_stats_context(self, test_db, user_with_data):
        ctx = svc.build_stats_context(test_db, user_with_data.id)
        assert ctx.total_questions == 3
        assert ctx.active_questions == 3
        assert ctx.weak_tags and ctx.weak_tags[0]["tag"] == "二次函数"
        assert ctx.weak_tags[0]["error_rate"] == 100.0
