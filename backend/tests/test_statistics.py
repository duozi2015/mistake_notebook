"""
Tests for the statistics and knowledge mastery endpoints.
"""

from datetime import datetime, timezone, timedelta, date
from unittest.mock import patch

import pytest
from fastapi import status
from fastapi.testclient import TestClient

from app.database import Base, engine, SessionLocal, get_db
from app.main import app
from app.models import User, Question, QuestionTag, Review
from app.auth import create_access_token


# ── Fixtures ────────────────────────────────────────────────────────


@pytest.fixture(scope="module")
def test_db():
    """Create fresh tables and return a session."""
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    yield db
    db.close()
    Base.metadata.drop_all(bind=engine)


@pytest.fixture(scope="module")
def client():
    """Return a TestClient for the FastAPI app."""
    return TestClient(app)


@pytest.fixture(scope="module")
def test_user(test_db):
    """Create and return a test user."""
    user = User(
        username="teststat",
        password_hash="nothashed",
        display_name="Test Stats User",
    )
    test_db.add(user)
    test_db.commit()
    test_db.refresh(user)
    return user


@pytest.fixture(scope="module")
def token(test_user):
    """Generate a valid access token for the test user."""
    token_str, _jti, _exp = create_access_token(test_user)
    return token_str


@pytest.fixture(scope="module")
def auth_headers(token):
    """Return auth headers for the test user."""
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="module")
def seed_data(test_db, test_user):
    """Seed the database with questions, tags, and reviews for testing."""
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    uid = test_user.id

    # ── Questions ───────────────────────────────────────────────────
    questions = [
        # id=1: active, 三角函数, 概念不清, EF=2.5
        Question(
            user_id=uid,
            question_content="题1: 三角函数",
            subject="数学",
            error_type="概念不清",
            status="active",
            current_ef=2.5,
            current_rep_count=2,
            created_at=now - timedelta(days=5),
            next_review_date=now - timedelta(days=1),  # overdue
        ),
        # id=2: active, 三角函数, 审题错误, EF=1.3 (low mastery)
        Question(
            user_id=uid,
            question_content="题2: 三角函数",
            subject="数学",
            error_type="审题错误",
            status="active",
            current_ef=1.3,
            current_rep_count=0,
            created_at=now - timedelta(days=3),
            next_review_date=now - timedelta(days=2),  # overdue
        ),
        # id=3: active, 数列, 概念不清, EF=3.0 (high mastery)
        Question(
            user_id=uid,
            question_content="题3: 数列",
            subject="数学",
            error_type="概念不清",
            status="active",
            current_ef=3.0,
            current_rep_count=5,
            created_at=now - timedelta(days=10),
            next_review_date=now + timedelta(days=7),  # future
        ),
        # id=4: active, 数列, 计算错误, EF=2.0
        Question(
            user_id=uid,
            question_content="题4: 数列",
            subject="数学",
            error_type="计算错误",
            status="active",
            current_ef=2.0,
            current_rep_count=1,
            created_at=now - timedelta(days=1),
            next_review_date=now + timedelta(days=3),
        ),
        # id=5: archived
        Question(
            user_id=uid,
            question_content="题5: archived",
            subject="数学",
            error_type="概念不清",
            status="archived",
            current_ef=2.5,
            current_rep_count=0,
            created_at=now - timedelta(days=20),
            next_review_date=None,
        ),
        # id=6: active, 三角函数, 概念不清, EF=2.5 (created today for weekly test)
        Question(
            user_id=uid,
            question_content="题6: 三角函数 today",
            subject="数学",
            error_type="概念不清",
            status="active",
            current_ef=2.5,
            current_rep_count=0,
            created_at=now,
            next_review_date=now + timedelta(days=1),
        ),
    ]
    for q in questions:
        test_db.add(q)
    test_db.flush()

    # ── Tags ────────────────────────────────────────────────────────
    tags = [
        QuestionTag(question_id=1, tag_name="三角函数"),
        QuestionTag(question_id=2, tag_name="三角函数"),
        QuestionTag(question_id=3, tag_name="数列"),
        QuestionTag(question_id=4, tag_name="数列"),
        # Question 6 also tagged 三角函数
        QuestionTag(question_id=6, tag_name="三角函数"),
    ]
    for t in tags:
        test_db.add(t)
    test_db.flush()

    # ── Reviews ─────────────────────────────────────────────────────
    reviews = [
        # Today's reviews
        Review(
            question_id=1, user_id=uid,
            review_date=now, quality=4,
            ef_before=2.5, ef_after=2.5,
            interval_before=1, interval_after=3,
        ),
        Review(
            question_id=2, user_id=uid,
            review_date=now, quality=2,
            ef_before=1.3, ef_after=1.3,
            interval_before=0, interval_after=1,
        ),
        # Yesterday's reviews
        Review(
            question_id=1, user_id=uid,
            review_date=now - timedelta(days=1), quality=3,
            ef_before=2.5, ef_after=2.36,
            interval_before=0, interval_after=1,
        ),
        # Earlier reviews
        Review(
            question_id=3, user_id=uid,
            review_date=now - timedelta(days=3), quality=5,
            ef_before=2.5, ef_after=2.6,
            interval_before=0, interval_after=1,
        ),
        Review(
            question_id=3, user_id=uid,
            review_date=now - timedelta(days=7), quality=4,
            ef_before=2.5, ef_after=2.5,
            interval_before=0, interval_after=1,
        ),
    ]
    for r in reviews:
        test_db.add(r)
    test_db.commit()

    return questions, tags, reviews


# ── Tests: Overview ─────────────────────────────────────────────────


class TestOverview:
    """Tests for GET /api/v1/statistics/overview"""

    def test_overview_returns_expected_counts(self, client, auth_headers, seed_data):
        resp = client.get("/api/v1/statistics/overview", headers=auth_headers)
        assert resp.status_code == status.HTTP_200_OK
        data = resp.json()

        # 5 active (1,2,3,4,6) + 1 archived (5) = 6 total
        assert data["total_questions"] == 6
        assert data["active_questions"] == 5
        assert data["archived_questions"] == 1

        # 2 reviews today (q1 and q2)
        assert data["today_review_count"] == 2

        # Overdue: active questions with next_review_date <= now
        # q1: yesterday (overdue), q2: 2 days ago (overdue) = 2
        # q3: future, q4: future, q6: future
        assert data["overdue_review_count"] == 2

        # Weekly added: questions created in last 7 days
        # q1 (5d ago), q2 (3d ago), q4 (1d ago), q6 (today) = 4
        assert data["weekly_added"] == 4

        # Mastery rate: avg EF of active questions, mapped to 0-1
        # active questions: q1(2.5), q2(1.3), q3(3.0), q4(2.0), q6(2.5)
        # avg_ef = (2.5+1.3+3.0+2.0+2.5)/5 = 2.26
        # mastery = (2.26-1.3)/2.0 = 0.48 -> 48.0%
        # But we need to check the rounding
        assert isinstance(data["mastery_rate"], float)
        assert 0 <= data["mastery_rate"] <= 100
        # 5 reviews in total
        assert data["total_reviews"] == 5

    def test_overview_requires_auth(self, client):
        resp = client.get("/api/v1/statistics/overview")
        assert resp.status_code == status.HTTP_401_UNAUTHORIZED

    def test_overview_new_user_empty(self, client, test_db):
        """A brand new user with no questions should get zeros."""
        empty_user = User(
            username="emptystat",
            password_hash="nothashed",
            display_name="Empty",
        )
        test_db.add(empty_user)
        test_db.commit()
        test_db.refresh(empty_user)

        token_str, _jti, _exp = create_access_token(empty_user)
        headers = {"Authorization": f"Bearer {token_str}"}
        resp = client.get("/api/v1/statistics/overview", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_questions"] == 0
        assert data["active_questions"] == 0
        assert data["archived_questions"] == 0
        assert data["today_review_count"] == 0
        assert data["overdue_review_count"] == 0
        assert data["weekly_added"] == 0
        assert data["mastery_rate"] == 0.0
        assert data["total_reviews"] == 0


# ── Tests: Trends ───────────────────────────────────────────────────


class TestTrends:
    """Tests for GET /api/v1/statistics/trends"""

    def test_trends_returns_30_days(self, client, auth_headers, seed_data):
        resp = client.get("/api/v1/statistics/trends", headers=auth_headers)
        assert resp.status_code == status.HTTP_200_OK
        data = resp.json()
        assert "daily" in data
        assert len(data["daily"]) == 30

        # Each entry has date, added, reviewed
        for entry in data["daily"]:
            assert "date" in entry
            assert "added" in entry
            assert "reviewed" in entry
            assert isinstance(entry["added"], int)
            assert isinstance(entry["reviewed"], int)

        # Verify there are some dates with non-zero values
        has_added = any(e["added"] > 0 for e in data["daily"])
        has_reviewed = any(e["reviewed"] > 0 for e in data["daily"])
        assert has_added
        assert has_reviewed

    def test_trends_dates_are_consecutive(self, client, auth_headers, seed_data):
        resp = client.get("/api/v1/statistics/trends", headers=auth_headers)
        data = resp.json()
        dates = [e["date"] for e in data["daily"]]
        # Check they are consecutive
        for i in range(len(dates) - 1):
            d1 = date.fromisoformat(dates[i])
            d2 = date.fromisoformat(dates[i + 1])
            assert (d2 - d1).days == 1


# ── Tests: Report ───────────────────────────────────────────────────


class TestReport:
    """Tests for GET /api/v1/statistics/report"""

    def test_report_weekly(self, client, auth_headers, seed_data):
        resp = client.get("/api/v1/statistics/report?period=weekly", headers=auth_headers)
        assert resp.status_code == status.HTTP_200_OK
        data = resp.json()
        assert data["period"] == "weekly"
        assert data["total_questions"] == 6
        # New questions in last 7 days: q1, q2, q4, q6 = 4
        assert data["new_questions"] == 4
        assert isinstance(data["review_completion_rate"], float)
        assert "top_error_types" in data
        assert "top_weak_tags" in data
        assert "suggestions" in data

    def test_report_monthly(self, client, auth_headers, seed_data):
        resp = client.get("/api/v1/statistics/report?period=monthly", headers=auth_headers)
        assert resp.status_code == status.HTTP_200_OK
        data = resp.json()
        assert data["period"] == "monthly"
        # All 6 questions should be within 30 days
        assert data["new_questions"] == 6

    def test_report_invalid_period(self, client, auth_headers):
        resp = client.get("/api/v1/statistics/report?period=daily", headers=auth_headers)
        assert resp.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

    def test_report_top_error_types(self, client, auth_headers, seed_data):
        resp = client.get("/api/v1/statistics/report", headers=auth_headers)
        data = resp.json()
        # We have: 概念不清 (q1, q3, q5, q6 = 4), 审题错误 (q2 = 1), 计算错误 (q4 = 1)
        error_types = data["top_error_types"]
        assert len(error_types) >= 1
        # 概念不清 should be first with count 4
        top = error_types[0]
        assert top["type"] == "概念不清"
        assert top["count"] == 4
        assert isinstance(top["percentage"], float)

    def test_report_top_weak_tags(self, client, auth_headers, seed_data):
        resp = client.get("/api/v1/statistics/report", headers=auth_headers)
        data = resp.json()
        # q2 (三角函数, EF=1.3) and q4 (数列, EF=2.0) are "errors" (EF<2.5)
        # q1 (三角函数, EF=2.5) is not < 2.5
        # q3 (数列, EF=3.0) is not < 2.5
        # q6 (三角函数, EF=2.5) is not < 2.5
        # So: 三角函数 has 1 error out of 3, 数列 has 1 error out of 2
        weak_tags = data["top_weak_tags"]
        # At least one tag should be present
        assert len(weak_tags) >= 1

    def test_report_suggestions(self, client, auth_headers, seed_data):
        resp = client.get("/api/v1/statistics/report", headers=auth_headers)
        data = resp.json()
        assert isinstance(data["suggestions"], list)
        # If there are high-error tags, suggestions should be meaningful
        if data["suggestions"]:
            assert isinstance(data["suggestions"][0], str)


# ── Tests: Knowledge Mastery ────────────────────────────────────────


class TestKnowledgeMastery:
    """Tests for GET /api/v1/statistics/knowledge/mastery"""

    def test_mastery_returns_data(self, client, auth_headers, seed_data):
        resp = client.get("/api/v1/statistics/knowledge/mastery", headers=auth_headers)
        assert resp.status_code == status.HTTP_200_OK
        data = resp.json()
        assert "data" in data
        assert isinstance(data["data"], list)

        # Should have 2 tags: 三角函数, 数列
        tag_names = {item["tag"] for item in data["data"]}
        assert "三角函数" in tag_names
        assert "数列" in tag_names

    def test_mastery_values(self, client, auth_headers, seed_data):
        resp = client.get("/api/v1/statistics/knowledge/mastery", headers=auth_headers)
        data = resp.json()

        for item in data["data"]:
            assert 0 <= item["mastery"] <= 1.0
            assert isinstance(item["error_count"], int)
            assert isinstance(item["total_count"], int)
            assert item["error_count"] <= item["total_count"]

        # 三角函数: q1(2.5), q2(1.3), q6(2.5) → avg_ef = (2.5+1.3+2.5)/3 = 2.1
        # mastery = (2.1-1.3)/2.0 = 0.4
        # 数列: q3(3.0), q4(2.0) → avg_ef = 2.5
        # mastery = (2.5-1.3)/2.0 = 0.6
        trig = next(item for item in data["data"] if item["tag"] == "三角函数")
        seq = next(item for item in data["data"] if item["tag"] == "数列")

        assert trig["total_count"] == 3
        assert trig["error_count"] == 1  # q2 only (EF=1.3 < 2.5)
        assert trig["mastery"] == 0.4

        assert seq["total_count"] == 2
        assert seq["error_count"] == 1  # q4 only (EF=2.0 < 2.5)
        assert seq["mastery"] == 0.6


# ── Tests: Heatmap ──────────────────────────────────────────────────


class TestHeatmap:
    """Tests for GET /api/v1/statistics/knowledge/heatmap"""

    def test_heatmap_returns_data(self, client, auth_headers, seed_data):
        resp = client.get("/api/v1/statistics/knowledge/heatmap", headers=auth_headers)
        assert resp.status_code == status.HTTP_200_OK
        data = resp.json()
        assert "data" in data
        assert isinstance(data["data"], list)

        # There should be at least some entries from the seed data
        assert len(data["data"]) > 0

        for entry in data["data"]:
            assert "date" in entry
            assert "hour" in entry
            assert "count" in entry
            assert isinstance(entry["hour"], int)
            assert isinstance(entry["count"], int)
            assert 0 <= entry["hour"] <= 23