"""试卷生成测试：文本清洗、统计、两阶段生成、容错重试、异步任务路由。"""

import pytest
from sqlalchemy import text
from fastapi.testclient import TestClient

from app.database import Base, engine, SessionLocal
from app.main import app
from app.models import Question, QuestionTag, User
from app.auth import create_access_token
from app.services import paper_jobs, paper_service
from app.services.ollama_service import OllamaService


def _long_draft() -> str:
    """构造一份长度达标（>200）且含「参考答案」的假初稿。"""
    parts = ["# 数学错题重练试卷", "", "## 一、选择题"]
    for i in range(1, 6):
        parts.append(f"{i}. 这是第 {i} 道选择题的题干内容，请选出正确答案。")
        parts.append("   A. 选项甲  B. 选项乙  C. 选项丙  D. 选项丁")
    parts += ["", "## 二、填空题"]
    for i in range(1, 3):
        parts.append(f"{i}. 这是第 {i} 道填空题的题干内容。")
    parts += ["", "## 三、解答题"]
    for i in range(1, 3):
        parts.append(f"{i}. 这是第 {i} 道解答题的题干内容，请写出完整过程。")
    parts += ["", "---", "", "## 参考答案与解析"]
    for i in range(1, 9):
        parts.append(f"{i}. **答案**：参考解答内容。  **解析**：本题考查相关知识点。")
    return "\n".join(parts)


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
    """清空相关表，建一个学生 + 两道错题。"""
    paper_jobs._JOBS.clear()
    test_db.execute(text("SET FOREIGN_KEY_CHECKS=0"))
    for m in (QuestionTag, Question, User):
        test_db.query(m).delete()
    test_db.execute(text("SET FOREIGN_KEY_CHECKS=1"))
    test_db.commit()

    student = User(username="paper_kid", password_hash="x", role="student")
    test_db.add(student)
    test_db.commit()
    test_db.refresh(student)

    q1 = Question(
        user_id=student.id, subject="数学", difficulty=4, error_type="计算错误",
        question_content="已知 f(x)=x²+1，求 f(2)。",
        correct_solution="f(2)=5", user_analysis="忘记平方",
        status="active",
    )
    q2 = Question(
        user_id=student.id, subject="数学", difficulty=3, error_type="概念不清",
        question_content="求 y=2x+1 的斜率。", correct_solution="2",
        user_analysis="概念混淆", status="active",
    )
    test_db.add_all([q1, q2])
    test_db.commit()
    test_db.refresh(q1)
    test_db.refresh(q2)
    test_db.add_all([
        QuestionTag(question_id=q1.id, tag_name="二次函数"),
        QuestionTag(question_id=q2.id, tag_name="一次函数"),
    ])
    test_db.commit()

    db = SessionLocal()
    yield {
        "client": client,
        "db": db,
        "student": student,
        "q1": q1,
        "q2": q2,
        "h": {"Authorization": f"Bearer {create_access_token(student)[0]}"},
    }
    db.close()


# ── 文本清洗 ────────────────────────────────────────────────────────

def test_clean_output_strips_fence():
    assert paper_service.clean_output("```markdown\n# 标题\n```") == "# 标题"


def test_clean_output_strips_think_block():
    raw = "<｜begin▁of▁thinking｜>让我想想……这个题目……<｜end▁of▁thinking｜># 试卷"
    assert paper_service.clean_output(raw) == "# 试卷"


def test_clean_output_handles_empty():
    assert paper_service.clean_output("") == ""


# ── 统计 ────────────────────────────────────────────────────────────

def test_build_stats(env):
    stats = paper_service.build_stats([env["q1"], env["q2"]])
    assert stats["total"] == 2
    assert stats["subjects"] == ["数学"]
    assert stats["difficulty"] == {4: 1, 3: 1}
    assert stats["error_types"] == {"计算错误": 1, "概念不清": 1}
    assert set(stats["knowledge_points"]) == {"二次函数", "一次函数"}


def test_distribute_covers_all():
    for n in (8, 9, 10, 11, 12):
        c, b, s = paper_service._distribute(n)
        assert c + b + s == n
        assert c > 0 and b > 0 and s > 0


# ── 生成流程（mock Ollama） ──────────────────────────────────────────

def test_generate_paper_success(env, monkeypatch):
    calls = {"n": 0}

    def fake_generate(prompt, *, temperature=0.4):
        calls["n"] += 1
        if prompt.startswith("你是一位资深学科老师"):
            return {"text": "## 一、知识点梳理\n二次函数……"}
        return {"text": _long_draft()}

    monkeypatch.setattr(OllamaService, "generate", fake_generate)

    result = paper_service.generate_paper([env["q1"], env["q2"]], 8)
    assert "error" not in result
    assert result["summary"].startswith("## 一、知识点梳理")
    assert "参考答案" in result["draft"]
    assert result["polish_prompt"]
    assert result["stats"]["total"] == 2
    assert calls["n"] == 2  # 总结一次 + 初稿一次


def test_generate_paper_retries_then_fails(env, monkeypatch):
    """初稿两次都不合格 → LLM_BAD_OUTPUT。"""
    calls = {"draft": 0}

    def fake_generate(prompt, *, temperature=0.4):
        if prompt.startswith("你是一位资深学科老师"):
            return {"text": "## 一、知识点梳理\n……"}
        calls["draft"] += 1
        return {"text": "太短了"}  # 长度不足且无「参考答案」

    monkeypatch.setattr(OllamaService, "generate", fake_generate)

    result = paper_service.generate_paper([env["q1"], env["q2"]], 8)
    assert result["error"] == "LLM_BAD_OUTPUT"
    assert calls["draft"] == 2  # 恰好重试一次


def test_generate_paper_ollama_down(env, monkeypatch):
    monkeypatch.setattr(
        OllamaService, "generate", lambda *a, **k: {"error": "OLLAMA_UNAVAILABLE"}
    )
    result = paper_service.generate_paper([env["q1"], env["q2"]], 8)
    assert result["error"] == "OLLAMA_UNAVAILABLE"


# ── 路由 ────────────────────────────────────────────────────────────

def test_generate_route_ollama_unavailable(env, monkeypatch):
    monkeypatch.setattr(OllamaService, "is_available", classmethod(lambda cls: False))
    resp = env["client"].post(
        "/api/v1/papers/generate",
        json={"question_ids": [env["q1"].id], "count": 8},
        headers=env["h"],
    )
    assert resp.status_code == 503
    assert resp.json()["detail"]["code"] == "OLLAMA_UNAVAILABLE"


def test_generate_route_not_found(env, monkeypatch):
    monkeypatch.setattr(OllamaService, "is_available", classmethod(lambda cls: True))
    resp = env["client"].post(
        "/api/v1/papers/generate",
        json={"question_ids": [999999], "count": 8},
        headers=env["h"],
    )
    assert resp.status_code == 404
    assert resp.json()["detail"]["code"] == "NOT_FOUND"


def test_generate_route_happy_path(env, monkeypatch):
    """TestClient 会同步执行 BackgroundTasks，故 POST 后 job 应已 done。"""
    monkeypatch.setattr(OllamaService, "is_available", classmethod(lambda cls: True))

    def fake_generate(prompt, *, temperature=0.4):
        if prompt.startswith("你是一位资深学科老师"):
            return {"text": "## 一、知识点梳理\n二次函数"}
        return {"text": _long_draft()}

    monkeypatch.setattr(OllamaService, "generate", fake_generate)

    resp = env["client"].post(
        "/api/v1/papers/generate",
        json={"question_ids": [env["q1"].id, env["q2"].id], "count": 8},
        headers=env["h"],
    )
    assert resp.status_code == 202
    job_id = resp.json()["job_id"]

    job = env["client"].get(f"/api/v1/papers/jobs/{job_id}", headers=env["h"])
    assert job.status_code == 200
    body = job.json()
    assert body["status"] == "done"
    assert body["result"]["draft"].startswith("# 数学错题重练试卷")


def test_job_isolated_between_users(env, monkeypatch):
    """A 用户不能查询 B 用户的 job。"""
    monkeypatch.setattr(OllamaService, "is_available", classmethod(lambda cls: True))
    monkeypatch.setattr(
        OllamaService, "generate",
        lambda *a, **k: {"text": "# 试卷\n\n## 参考答案与解析\n1. ……"},
    )

    resp = env["client"].post(
        "/api/v1/papers/generate",
        json={"question_ids": [env["q1"].id], "count": 8},
        headers=env["h"],
    )
    job_id = resp.json()["job_id"]

    # 另一个用户
    other = User(username="paper_other", password_hash="x", role="student")
    env["db"].add(other)
    env["db"].commit()
    env["db"].refresh(other)
    other_h = {"Authorization": f"Bearer {create_access_token(other)[0]}"}

    resp2 = env["client"].get(f"/api/v1/papers/jobs/{job_id}", headers=other_h)
    assert resp2.status_code == 404
