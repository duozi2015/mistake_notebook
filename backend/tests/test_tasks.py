"""任务模块测试：模板生成、自动复习任务、每日任务/复制、状态机、乐观锁、权限。"""

from datetime import date, timedelta

import pytest
from sqlalchemy import text
from fastapi.testclient import TestClient

from app.database import Base, engine, SessionLocal
from app.main import app
from app.models import (
    FamilyBinding,
    Question,
    TaskImage,
    TaskInstance,
    TaskTemplate,
    User,
)
from app.auth import create_access_token
from app.services import task_generation

TODAY = date(2026, 8, 10)  # 周一


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
def env(test_db, client, monkeypatch):
    """清空相关表，建 家长+学生+另一学生，绑定生效；today 固定为 2026-08-10。"""
    test_db.execute(text("SET FOREIGN_KEY_CHECKS=0"))
    for m in (TaskImage, TaskInstance, TaskTemplate, FamilyBinding, Question, User):
        test_db.query(m).delete()
    test_db.execute(text("SET FOREIGN_KEY_CHECKS=1"))
    test_db.commit()
    parent = User(username="papa_t", password_hash="x", role="parent")
    student = User(username="kid_t", password_hash="x", role="student")
    other = User(username="other_t", password_hash="x", role="student")
    test_db.add_all([parent, student, other])
    test_db.commit()
    for u in (parent, student, other):
        test_db.refresh(u)
    test_db.add(FamilyBinding(parent_id=parent.id, student_id=student.id, status="active"))
    test_db.commit()
    monkeypatch.setattr(task_generation, "local_today", lambda: TODAY)
    # 用全新会话返回，避免 MySQL REPEATABLE READ 陈旧快照看不到 API 提交的数据
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


def _mk_task(env, student_id, name="作业", d=None, category="learning", **kw):
    payload = {
        "student_id": student_id,
        "date": (d or TODAY).isoformat(),
        "category": category,
        "subject": kw.get("subject", "数学"),
        "name": name,
        "description": kw.get("description", ""),
        "require_evidence": kw.get("require_evidence", False),
    }
    resp = env["client"].post("/api/v1/tasks/daily", json=payload, headers=env["ph"])
    assert resp.status_code == 201, resp.text
    return resp.json()


# ── 模板 + 惰性生成 ────────────────────────────────────────────────────


def test_daily_template_generates_instance(env):
    env["client"].post(
        "/api/v1/tasks/templates",
        json={"student_id": env["student"].id, "category": "learning", "subject": "语文",
              "name": "每日背诵", "repeat_type": "daily"},
        headers=env["ph"],
    )
    resp = env["client"].get(f"/api/v1/tasks/daily?student_id={env['student'].id}&date={TODAY.isoformat()}", headers=env["ph"])
    assert resp.status_code == 200
    items = resp.json()
    assert any(i["name"] == "每日背诵" and i["template_id"] and i["status"] == "pending" for i in items)


def test_daily_template_idempotent(env):
    env["client"].post(
        "/api/v1/tasks/templates",
        json={"student_id": env["student"].id, "category": "chores", "name": "扫地", "repeat_type": "daily"},
        headers=env["ph"],
    )
    for _ in range(2):
        env["client"].get(f"/api/v1/tasks/daily?student_id={env['student'].id}&date={TODAY.isoformat()}", headers=env["ph"])
    count = env["db"].query(TaskInstance).filter(TaskInstance.student_id == env["student"].id).count()
    assert count == 1


def test_weekly_template_matches_weekdays(env):
    # 每周一三五（0/2/4）
    env["client"].post(
        "/api/v1/tasks/templates",
        json={"student_id": env["student"].id, "category": "learning", "name": "口算",
              "repeat_type": "weekly", "repeat_weekdays": [0, 2, 4]},
        headers=env["ph"],
    )
    mon = TODAY  # 8/10 周一
    wed = TODAY + timedelta(days=2)  # 8/12 周三
    tue = TODAY + timedelta(days=1)  # 8/11 周二
    mon_items = env["client"].get(f"/api/v1/tasks/daily?student_id={env['student'].id}&date={mon.isoformat()}", headers=env["ph"]).json()
    wed_items = env["client"].get(f"/api/v1/tasks/daily?student_id={env['student'].id}&date={wed.isoformat()}", headers=env["ph"]).json()
    tue_items = env["client"].get(f"/api/v1/tasks/daily?student_id={env['student'].id}&date={tue.isoformat()}", headers=env["ph"]).json()
    assert any(i["name"] == "口算" for i in mon_items)
    assert any(i["name"] == "口算" for i in wed_items)
    assert not any(i["name"] == "口算" for i in tue_items)


def test_template_start_date_in_future_no_instance(env):
    future = TODAY + timedelta(days=5)
    env["client"].post(
        "/api/v1/tasks/templates",
        json={"student_id": env["student"].id, "category": "sports", "name": "跳绳",
              "repeat_type": "daily", "start_date": future.isoformat()},
        headers=env["ph"],
    )
    items = env["client"].get(f"/api/v1/tasks/daily?student_id={env['student'].id}&date={TODAY.isoformat()}", headers=env["ph"]).json()
    assert not any(i["name"] == "跳绳" for i in items)


def test_stop_template_keeps_today_and_history_deletes_future(env):
    t = env["client"].post(
        "/api/v1/tasks/templates",
        json={"student_id": env["student"].id, "category": "learning", "name": "每日一读", "repeat_type": "daily"},
        headers=env["ph"],
    ).json()
    tomorrow = TODAY + timedelta(days=1)
    env["client"].get(f"/api/v1/tasks/daily?student_id={env['student'].id}&date={tomorrow.isoformat()}", headers=env["ph"])
    env["client"].get(f"/api/v1/tasks/daily?student_id={env['student'].id}&date={TODAY.isoformat()}", headers=env["ph"])
    resp = env["client"].delete(f"/api/v1/tasks/templates/{t['id']}", headers=env["ph"])
    assert resp.status_code == 200
    assert resp.json()["message"] == "已停止"
    today_items = env["client"].get(f"/api/v1/tasks/daily?student_id={env['student'].id}&date={TODAY.isoformat()}", headers=env["ph"]).json()
    tomorrow_items = env["client"].get(f"/api/v1/tasks/daily?student_id={env['student'].id}&date={tomorrow.isoformat()}", headers=env["ph"]).json()
    assert any(i["name"] == "每日一读" for i in today_items)  # 今天保留
    assert not any(i["name"] == "每日一读" for i in tomorrow_items)  # 明天已删


def test_resume_template_restarts_from_today(env):
    t = env["client"].post(
        "/api/v1/tasks/templates",
        json={"student_id": env["student"].id, "category": "chores", "name": "扫地", "repeat_type": "daily",
              "start_date": (TODAY - timedelta(days=5)).isoformat()},
        headers=env["ph"],
    ).json()
    env["client"].delete(f"/api/v1/tasks/templates/{t['id']}", headers=env["ph"])
    resp = env["client"].post(f"/api/v1/tasks/templates/{t['id']}/resume", headers=env["ph"])
    assert resp.status_code == 200
    assert resp.json()["status"] == "active"
    assert resp.json()["start_date"] == TODAY.isoformat()  # 从今天起，不补历史
    today_items = env["client"].get(f"/api/v1/tasks/daily?student_id={env['student'].id}&date={TODAY.isoformat()}", headers=env["ph"]).json()
    assert any(i["name"] == "扫地" for i in today_items)
    past = TODAY - timedelta(days=5)
    past_items = env["client"].get(f"/api/v1/tasks/daily?student_id={env['student'].id}&date={past.isoformat()}", headers=env["ph"]).json()
    assert not any(i["name"] == "扫地" for i in past_items)  # 未补历史


def test_templates_list_active_first(env):
    env["client"].post("/api/v1/tasks/templates", json={"student_id": env["student"].id, "category": "learning", "name": "进行中A", "repeat_type": "daily"}, headers=env["ph"]).json()
    stopped = env["client"].post("/api/v1/tasks/templates", json={"student_id": env["student"].id, "category": "chores", "name": "已停止B", "repeat_type": "daily"}, headers=env["ph"]).json()
    env["client"].delete(f"/api/v1/tasks/templates/{stopped['id']}", headers=env["ph"])
    items = env["client"].get(f"/api/v1/tasks/templates?student_id={env['student'].id}", headers=env["ph"]).json()
    names = [i["name"] for i in items]
    assert names[0] == "进行中A"
    assert names.index("已停止B") > names.index("进行中A")


def test_archived_template_stops_generating(env):
    t = env["client"].post(
        "/api/v1/tasks/templates",
        json={"student_id": env["student"].id, "category": "learning", "name": "阅读", "repeat_type": "daily"},
        headers=env["ph"],
    ).json()
    env["client"].delete(f"/api/v1/tasks/templates/{t['id']}", headers=env["ph"])
    items = env["client"].get(f"/api/v1/tasks/daily?student_id={env['student'].id}&date={TODAY.isoformat()}", headers=env["ph"]).json()
    assert not any(i["name"] == "阅读" for i in items)


def test_unbound_parent_template_403(env):
    resp = env["client"].post(
        "/api/v1/tasks/templates",
        json={"student_id": env["other"].id, "category": "learning", "name": "x"},
        headers=env["ph"],
    )
    assert resp.status_code == 403
    assert resp.json()["detail"]["code"] == "NOT_BOUND"


# ── 自动复习任务（记忆曲线） ─────────────────────────────────────────────


def _seed_due_questions(env, student_id, subjects=("数学", "语文")):
    for i, subj in enumerate(subjects):
        env["db"].add(Question(
            user_id=student_id, question_content=f"错题{i}", subject=subj,
            status="active", next_review_date=TODAY,
        ))
    env["db"].commit()


def test_auto_review_generated_when_due(env):
    _seed_due_questions(env, env["student"].id)
    items = env["client"].get(f"/api/v1/tasks/daily?student_id={env['student'].id}&date={TODAY.isoformat()}", headers=env["ph"]).json()
    auto = [i for i in items if i["source"] == "auto_review"]
    assert len(auto) == 1
    assert auto[0]["name"] == "错题复习"
    assert auto[0]["category"] == "learning"
    assert auto[0]["require_evidence"] is False
    assert "2 道" in auto[0]["description"]  # 数学x1、语文x1


def test_auto_review_single_per_day(env):
    _seed_due_questions(env, env["student"].id)
    for _ in range(2):
        env["client"].get(f"/api/v1/tasks/daily?student_id={env['student'].id}&date={TODAY.isoformat()}", headers=env["ph"])
    count = env["db"].query(TaskInstance).filter(
        TaskInstance.student_id == env["student"].id, TaskInstance.source == "auto_review"
    ).count()
    assert count == 1


def test_auto_review_auto_approves_when_no_due(env):
    # 先有到期错题 → 生成；再清空错题 → 自动完成
    _seed_due_questions(env, env["student"].id)
    env["client"].get(f"/api/v1/tasks/daily?student_id={env['student'].id}&date={TODAY.isoformat()}", headers=env["ph"])
    env["db"].query(Question).delete()
    env["db"].commit()
    env["client"].get(f"/api/v1/tasks/daily?student_id={env['student'].id}&date={TODAY.isoformat()}", headers=env["ph"])
    auto = env["db"].query(TaskInstance).filter(TaskInstance.source == "auto_review").first()
    assert auto.status == "approved"


# ── 每日任务：创建 / 自主 / 编辑 / 删除 / 复制 ──────────────────────────


def test_parent_creates_daily_task(env):
    inst = _mk_task(env, env["student"].id, name="练习册")
    assert inst["created_by_id"] == env["parent"].id
    assert inst["status"] == "pending"


def test_student_self_add_task(env):
    payload = {
        "student_id": env["student"].id,
        "date": TODAY.isoformat(),
        "category": "learning",
        "subject": "数学",
        "name": "自主加练",
        "require_evidence": False,
    }
    resp = env["client"].post("/api/v1/tasks/daily", json=payload, headers=env["sh"])
    assert resp.status_code == 201
    assert resp.json()["created_by_id"] == env["student"].id


def test_student_cannot_create_for_other(env):
    payload = {
        "student_id": env["other"].id,
        "date": TODAY.isoformat(),
        "category": "learning",
        "name": "x",
    }
    resp = env["client"].post("/api/v1/tasks/daily", json=payload, headers=env["sh"])
    assert resp.status_code == 403


def test_edit_and_version_lock(env):
    inst = _mk_task(env, env["student"].id, name="初稿")
    # 不带 version → 成功
    resp = env["client"].put(f"/api/v1/tasks/{inst['id']}", json={"name": "改稿"}, headers=env["ph"])
    assert resp.status_code == 200
    assert resp.json()["version"] == 1
    # 携带过期 version 0 → 409
    resp = env["client"].put(f"/api/v1/tasks/{inst['id']}", json={"name": "再改", "version": 0}, headers=env["ph"])
    assert resp.status_code == 409
    assert resp.json()["detail"]["code"] == "VERSION_CONFLICT"
    # 携带最新 version 1 → 成功
    resp = env["client"].put(f"/api/v1/tasks/{inst['id']}", json={"name": "再改", "version": 1}, headers=env["ph"])
    assert resp.status_code == 200


def test_student_cannot_edit_parent_task(env):
    inst = _mk_task(env, env["student"].id)
    resp = env["client"].put(f"/api/v1/tasks/{inst['id']}", json={"name": "篡改"}, headers=env["sh"])
    assert resp.status_code == 403


def test_student_can_delete_own_self_added(env):
    payload = {
        "student_id": env["student"].id,
        "date": TODAY.isoformat(),
        "category": "chores",
        "name": "自己打扫",
    }
    inst = env["client"].post("/api/v1/tasks/daily", json=payload, headers=env["sh"]).json()
    resp = env["client"].delete(f"/api/v1/tasks/{inst['id']}", headers=env["sh"])
    assert resp.status_code == 200


def test_copy_yesterday_skips_duplicates(env):
    yesterday = TODAY - timedelta(days=1)
    _mk_task(env, env["student"].id, name="语文", d=yesterday)
    _mk_task(env, env["student"].id, name="数学", d=yesterday)
    _mk_task(env, env["student"].id, name="语文", d=TODAY)  # 今日已有一条同名
    resp = env["client"].post(
        "/api/v1/tasks/daily/copy",
        json={"student_id": env["student"].id, "date": TODAY.isoformat()},
        headers=env["ph"],
    )
    assert resp.status_code == 200
    assert resp.json() == {"copied": 1, "skipped": 1}


def test_copy_yesterday_skips_auto_review(env):
    yesterday = TODAY - timedelta(days=1)
    env["db"].add(TaskInstance(
        created_by_id=None, student_id=env["student"].id, task_date=yesterday,
        category="learning", name="错题复习", source="auto_review", status="pending",
    ))
    env["db"].add(TaskInstance(
        created_by_id=env["parent"].id, student_id=env["student"].id, task_date=yesterday,
        category="chores", name="手工任务", source="manual", status="pending",
    ))
    env["db"].commit()
    resp = env["client"].post(
        "/api/v1/tasks/daily/copy",
        json={"student_id": env["student"].id, "date": TODAY.isoformat()},
        headers=env["ph"],
    )
    assert resp.status_code == 200
    assert resp.json() == {"copied": 1, "skipped": 0}
    today_items = env["client"].get(f"/api/v1/tasks/daily?student_id={env['student'].id}&date={TODAY.isoformat()}", headers=env["ph"]).json()
    assert any(i["name"] == "手工任务" and i["source"] == "manual" for i in today_items)
    assert not any(i["name"] == "错题复习" and i["source"] == "manual" for i in today_items)


def test_auto_review_task_not_deletable(env):
    _seed_due_questions(env, env["student"].id)
    items = env["client"].get(f"/api/v1/tasks/daily?student_id={env['student'].id}&date={TODAY.isoformat()}", headers=env["ph"]).json()
    auto = next(i for i in items if i["source"] == "auto_review")
    resp = env["client"].delete(f"/api/v1/tasks/{auto['id']}", headers=env["ph"])
    assert resp.status_code == 400


# ── 状态机：提交 / 撤回 / 批改 ──────────────────────────────────────────


def test_submit_requires_evidence_when_enabled(env):
    inst = _mk_task(env, env["student"].id, name="需图", require_evidence=True)
    resp = env["client"].post(f"/api/v1/tasks/{inst['id']}/submit", json={"note": "完成"}, headers=env["sh"])
    assert resp.status_code == 400
    assert resp.json()["detail"]["code"] == "EVIDENCE_REQUIRED"


def _upload_image(env, user_headers):
    resp = env["client"].post(
        "/api/v1/tasks/images/upload",
        files={"file": ("pic.jpg", b"fake-jpeg-bytes", "image/jpeg")},
        headers=user_headers,
    )
    assert resp.status_code == 201
    return resp.json()["id"]


def test_submit_with_evidence_then_withdraw(env):
    inst = _mk_task(env, env["student"].id, name="作业A", require_evidence=True)
    img_id = _upload_image(env, env["sh"])
    resp = env["client"].post(
        f"/api/v1/tasks/{inst['id']}/submit",
        json={"note": "写完了", "evidence_image_ids": [img_id]},
        headers=env["sh"],
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "submitted"
    assert resp.json()["checkin_note"] == "写完了"
    # 再次提交 → 400
    resp = env["client"].post(f"/api/v1/tasks/{inst['id']}/submit", json={}, headers=env["sh"])
    assert resp.status_code == 400
    # 撤回 → pending
    resp = env["client"].post(f"/api/v1/tasks/{inst['id']}/withdraw", headers=env["sh"])
    assert resp.status_code == 200
    assert resp.json()["status"] == "pending"


def test_submit_only_on_task_date(env):
    # 任务日期是明天
    tomorrow = TODAY + timedelta(days=1)
    inst = _mk_task(env, env["student"].id, name="明日事", d=tomorrow)
    resp = env["client"].post(f"/api/v1/tasks/{inst['id']}/submit", json={}, headers=env["sh"])
    assert resp.status_code == 400
    assert resp.json()["detail"]["code"] == "TASK_DATE_MISMATCH"


def test_review_approve_flow(env):
    inst = _mk_task(env, env["student"].id, name="批改A")
    env["client"].post(f"/api/v1/tasks/{inst['id']}/submit", json={"note": "好了"}, headers=env["sh"])
    resp = env["client"].post(
        f"/api/v1/tasks/{inst['id']}/review",
        json={"result": "approved", "rating": 5, "comment": "很棒"},
        headers=env["ph"],
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "approved"
    assert body["rating"] == 5
    assert body["review_comment"] == "很棒"
    assert body["version"] == 1


def test_review_requires_rating(env):
    inst = _mk_task(env, env["student"].id)
    env["client"].post(f"/api/v1/tasks/{inst['id']}/submit", json={}, headers=env["sh"])
    resp = env["client"].post(
        f"/api/v1/tasks/{inst['id']}/review", json={"result": "approved"}, headers=env["ph"]
    )
    assert resp.status_code == 400
    assert resp.json()["detail"]["code"] == "RATING_REQUIRED"


def test_reject_then_resubmit_then_approve(env):
    inst = _mk_task(env, env["student"].id, name="纠错流程")
    env["client"].post(f"/api/v1/tasks/{inst['id']}/submit", json={"note": "一稿"}, headers=env["sh"])
    # 家长驳回
    resp = env["client"].post(
        f"/api/v1/tasks/{inst['id']}/review",
        json={"result": "rejected", "comment": "第二题有误，请订正"},
        headers=env["ph"],
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "rejected"
    # 孩子重新提交
    resp = env["client"].post(f"/api/v1/tasks/{inst['id']}/submit", json={"note": "二稿"}, headers=env["sh"])
    assert resp.status_code == 200
    assert resp.json()["status"] == "submitted"
    # 家长通过
    resp = env["client"].post(
        f"/api/v1/tasks/{inst['id']}/review",
        json={"result": "approved", "rating": 4, "comment": "订正正确"},
        headers=env["ph"],
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "approved"


def test_review_version_conflict(env):
    inst = _mk_task(env, env["student"].id)
    env["client"].post(f"/api/v1/tasks/{inst['id']}/submit", json={}, headers=env["sh"])
    resp = env["client"].post(
        f"/api/v1/tasks/{inst['id']}/review",
        json={"result": "approved", "rating": 5, "version": 99},
        headers=env["ph"],
    )
    assert resp.status_code == 409


def test_student_cannot_review(env):
    inst = _mk_task(env, env["student"].id)
    env["client"].post(f"/api/v1/tasks/{inst['id']}/submit", json={}, headers=env["sh"])
    resp = env["client"].post(
        f"/api/v1/tasks/{inst['id']}/review", json={"result": "approved", "rating": 5}, headers=env["sh"]
    )
    assert resp.status_code == 403


def test_student_cannot_submit_others_task(env):
    inst = _mk_task(env, env["student"].id, name="我的任务")
    resp = env["client"].post(f"/api/v1/tasks/{inst['id']}/submit", json={}, headers=env["oh"])
    assert resp.status_code == 403
