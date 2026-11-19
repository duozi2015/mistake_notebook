"""AI 学情建议服务：基于统计快照调用本地 LLM 网关生成个性化学习建议。

- OpenAI 兼容协议（/v1/chat/completions），地址/模型/密钥来自 settings（.env.local）。
- 每用户内存缓存（TTL 默认 1 小时），避免每次进页都打 LLM。
- 任何失败（未配置/超时/网关异常）返回 None，由路由层降级为规则建议，绝不阻塞页面。
"""

import logging
import re
import time
from dataclasses import dataclass, field

import httpx2
from sqlalchemy.orm import Session

from app.config import settings

logger = logging.getLogger(__name__)


@dataclass
class SuggestionResult:
    suggestions: list[str]
    source: str  # "ai" / "rules"
    model: str = ""
    elapsed_ms: int = 0
    cached: bool = False
    error: str = ""


@dataclass
class StatsContext:
    """喂给 LLM 的统计快照（全部来自既有统计口径，不含个人信息）。"""

    total_questions: int = 0
    active_questions: int = 0
    mastery_rate: float = 0.0
    review_completion_rate: float = 0.0
    weekly_new: int = 0
    weak_tags: list[dict] = field(default_factory=list)
    top_error_types: list[dict] = field(default_factory=list)
    trend_summary: str = ""  # 近7天 vs 前7天 新增/复习对比


def build_stats_context(db: Session, user_id: int) -> StatsContext:
    """从 DB 聚合统计快照（与统计页同口径，轻量查询）。"""
    from datetime import datetime, timedelta

    from sqlalchemy import func, or_

    from app.models import WORD_APP_SOURCE, Question, QuestionTag, Review

    ctx = StatsContext()
    now = datetime.utcnow()

    ctx.total_questions = (
        db.query(func.count(Question.id)).filter(Question.user_id == user_id).scalar() or 0
    )
    ctx.active_questions = (
        db.query(func.count(Question.id))
        .filter(Question.user_id == user_id, Question.status == "active")
        .scalar()
        or 0
    )

    # 掌握度：仅统计复习过的活跃题（与 /overview 口径一致）
    avg_ef = (
        db.query(func.avg(Question.current_ef))
        .filter(
            Question.user_id == user_id,
            Question.status == "active",
            Question.current_rep_count > 0,
        )
        .scalar()
    )
    if avg_ef:
        ctx.mastery_rate = round(max(0.0, min(1.0, (avg_ef - 1.3) / 2.0)) * 100, 1)

    # 复习完成率：近7天完成 / (完成 + 当前仍逾期)
    week_ago = now - timedelta(days=7)
    reviews_done = (
        db.query(func.count(Review.id))
        .filter(Review.user_id == user_id, Review.review_date >= week_ago)
        .scalar()
        or 0
    )
    still_overdue = (
        db.query(func.count(Question.id))
        .filter(
            Question.user_id == user_id,
            Question.status == "active",
            or_(
                Question.next_review_date.is_(None),
                Question.next_review_date <= now,
            ),
            or_(
                Question.source.is_(None),
                Question.source != WORD_APP_SOURCE,
            ),
        )
        .scalar()
        or 0
    )
    scheduled = reviews_done + still_overdue
    ctx.review_completion_rate = round(reviews_done / scheduled * 100, 1) if scheduled > 0 else 100.0
    ctx.weekly_new = (
        db.query(func.count(Question.id))
        .filter(Question.user_id == user_id, Question.created_at >= week_ago)
        .scalar()
        or 0
    )

    # 弱项标签：错误 = current_ef < 2.5，与 /report 口径一致
    from sqlalchemy.orm import joinedload

    questions = (
        db.query(Question)
        .options(joinedload(Question.tags))
        .filter(Question.user_id == user_id, Question.status == "active")
        .all()
    )
    tag_totals: dict[str, int] = {}
    tag_errors: dict[str, int] = {}
    error_type_count: dict[str, int] = {}
    for q in questions:
        if q.error_type:
            error_type_count[q.error_type] = error_type_count.get(q.error_type, 0) + 1
        is_error = q.current_ef < 2.5
        for t in q.tags:
            tag_totals[t.tag_name] = tag_totals.get(t.tag_name, 0) + 1
            if is_error:
                tag_errors[t.tag_name] = tag_errors.get(t.tag_name, 0) + 1

    ctx.weak_tags = [
        {
            "tag": name,
            "total": total,
            "errors": tag_errors.get(name, 0),
            "error_rate": round(tag_errors.get(name, 0) / total * 100, 1) if total else 0.0,
        }
        for name, total in tag_totals.items()
    ]
    ctx.weak_tags.sort(key=lambda x: x["error_rate"], reverse=True)

    ctx.top_error_types = sorted(
        (
            {"type": k, "count": v, "percentage": round(v / len(questions) * 100, 1) if questions else 0.0}
            for k, v in error_type_count.items()
        ),
        key=lambda x: x["count"],
        reverse=True,
    )[:3]

    # 趋势对比：近7天 vs 前7天
    prev_week_start = week_ago - timedelta(days=7)
    prev_new = (
        db.query(func.count(Question.id))
        .filter(
            Question.user_id == user_id,
            Question.created_at >= prev_week_start,
            Question.created_at < week_ago,
        )
        .scalar()
        or 0
    )
    prev_reviews = (
        db.query(func.count(Review.id))
        .filter(Review.user_id == user_id, Review.review_date >= prev_week_start, Review.review_date < week_ago)
        .scalar()
        or 0
    )
    ctx.trend_summary = f"近7天新增 {ctx.weekly_new} 题、复习 {reviews_done} 次；前7天新增 {prev_new} 题、复习 {prev_reviews} 次"

    return ctx


def _build_prompt(ctx: StatsContext) -> tuple[str, str]:
    system = (
        "你是一位面向中小学家长的学情分析助手。根据给出的错题本统计数据，"
        "生成 3~5 条简洁、可执行的学习建议。要求：\n"
        "1. 每条一句话，具体指出薄弱知识点和下一步动作，不空谈；\n"
        "2. 语气鼓励但不回避问题；不要编造数据里没有的信息；\n"
        "3. 严格只输出 JSON 数组，格式如 [\"建议1\", \"建议2\"]，不要输出其他任何文字。"
    )
    user = (
        "错题本统计快照：\n"
        f"- 累计错题 {ctx.total_questions} 道，活跃 {ctx.active_questions} 道，掌握度 {ctx.mastery_rate}%\n"
        f"- 近7天复习完成率 {ctx.review_completion_rate}%，{ctx.trend_summary}\n"
        f"- 薄弱知识点（错误率降序，最多5个）：{ctx.weak_tags[:5]}\n"
        f"- 主要错误原因（最多3个）：{ctx.top_error_types}\n"
        "请生成学习建议 JSON 数组。"
    )
    return system, user


def _parse_suggestions(text: str) -> list[str]:
    """从模型回复中稳健解析 JSON 数组；失败时按行拆分兜底。"""
    text = re.sub(r"<think(?:ing)?>.*?(?:</think(?:ing)?>|$)", "", text, flags=re.DOTALL).strip()
    m = re.search(r"\[.*\]", text, flags=re.DOTALL)
    if m:
        import json

        try:
            arr = json.loads(m.group(0))
            if isinstance(arr, list):
                items = [str(x).strip() for x in arr if str(x).strip()]
                if items:
                    return items[:6]
        except json.JSONDecodeError:
            pass
    # 兜底：按行拆分，去掉序号前缀
    lines = [re.sub(r"^[\d一二三四五六七八九十]+[.、）\)]\s*|^[•\\-]\\s*", "", ln).strip()
             for ln in text.splitlines() if ln.strip()]
    return [ln for ln in lines if len(ln) >= 6][:6]


# ── 每用户内存缓存 ────────────────────────────────────────────────
_cache: dict[int, tuple[float, SuggestionResult]] = {}


def _cache_get(user_id: int) -> SuggestionResult | None:
    hit = _cache.get(user_id)
    if not hit:
        return None
    ts, result = hit
    if time.time() - ts > settings.AI_SUGGEST_CACHE_SECONDS:
        _cache.pop(user_id, None)
        return None
    return result


def _cache_put(user_id: int, result: SuggestionResult) -> None:
    _cache[user_id] = (time.time(), result)
    # 简单防膨胀：超过 512 个用户时清最旧一半
    if len(_cache) > 512:
        for uid, _ in sorted(_cache.items(), key=lambda kv: kv[1][0])[:256]:
            _cache.pop(uid, None)


def is_ai_configured() -> bool:
    return bool(settings.AI_SUGGEST_ENABLED and settings.AI_BASE_URL and settings.AI_MODEL and settings.AI_API_KEY)


def generate_ai_suggestions(db: Session, user_id: int, force: bool = False) -> SuggestionResult:
    """生成 AI 学情建议。失败返回 source="rules" 的降级结果（由调用方填充规则建议）。"""
    if not force:
        cached = _cache_get(user_id)
        if cached:
            cached.cached = True
            return cached

    ctx = build_stats_context(db, user_id)
    result = SuggestionResult(suggestions=[], source="rules", model=settings.AI_MODEL)

    if not is_ai_configured():
        result.error = "ai_not_configured"
        return result

    system, user = _build_prompt(ctx)
    started = time.time()
    try:
        resp = httpx2.post(
            f"{settings.AI_BASE_URL.rstrip('/')}/v1/chat/completions",
            headers={"Authorization": f"Bearer {settings.AI_API_KEY}"},
            json={
                "model": settings.AI_MODEL,
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ],
                "temperature": 0.6,
                "max_tokens": 600,
            },
            timeout=settings.AI_TIMEOUT_SECONDS,
        )
        resp.raise_for_status()
        content = resp.json()["choices"][0]["message"]["content"]
        suggestions = _parse_suggestions(content)
        if not suggestions:
            raise ValueError("模型未返回可解析的建议")
        result.suggestions = suggestions
        result.source = "ai"
        result.elapsed_ms = int((time.time() - started) * 1000)
        _cache_put(user_id, result)
        return result
    except Exception as exc:  # noqa: BLE001 — LLM 调用任何失败都降级，不阻塞统计页
        logger.warning("AI 学情建议生成失败（降级为规则建议）: %s", exc)
        result.error = str(exc)[:200]
        result.elapsed_ms = int((time.time() - started) * 1000)
        return result


def rule_based_suggestions(ctx: StatsContext) -> list[str]:
    """无 AI / AI 失败时的规则建议（与 /report 的 suggestions 同风格）。"""
    suggestions = []
    if ctx.weak_tags:
        wt = ctx.weak_tags[0]
        suggestions.append(
            f"您在「{wt['tag']}」板块错误率最高（{wt['error_rate']}%，{wt['errors']}/{wt['total']} 题），建议优先复习该知识点的基础概念与易错点"
        )
        for wt2 in ctx.weak_tags[1:3]:
            if wt2["error_rate"] >= 50:
                suggestions.append(f"「{wt2['tag']}」错误率 {wt2['error_rate']}%，同样需要重点关注")
    if ctx.review_completion_rate < 60:
        suggestions.append(
            f"近7天复习完成率 {ctx.review_completion_rate}%，建议每天固定时间复习，先清掉逾期题目"
        )
    if ctx.weekly_new >= 5:
        suggestions.append(
            f"本周新增 {ctx.weekly_new} 道错题，注意及时整理错误原因，避免同类错误重复出现"
        )
    if not suggestions:
        suggestions.append("继续保持！您最近的复习表现良好。")
    return suggestions
