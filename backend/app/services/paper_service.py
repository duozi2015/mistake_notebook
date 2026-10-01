"""试卷初稿生成：确定性统计 + 两阶段 prompt + 容错。

流程：
  ① build_stats()      后端直接算统计（快且准，作为模型的「事实底座」）
  ② Ollama 调用 A      结构化整理错题 → 总结（Markdown）
  ③ Ollama 调用 B      按固定模板 → 试卷初稿（Markdown）
  ④ 附润色指令          供用户复制到千问 / DeepSeek
"""

import logging
import re
from collections import Counter

from app.config import settings
from app.models import Question
from app.services.ollama_service import OllamaService

logger = logging.getLogger(__name__)


# ── 润色指令（常量，随初稿一起复制给外部大模型） ──────────────────────

POLISH_PROMPT = """请以「资深命题老师」身份，对上面的试卷初稿做三件事：
1. **排版润色**：统一题号、分值标注、选项对齐，达到可直接打印的正式试卷排版。
2. **质量复核**：逐题检查答案与解析是否正确，指出并修正任何错误、歧义或超纲内容。
3. **备选出题**：为每个知识点额外提供 1 道备选题目（含答案与解析），供替换。
输出顺序：先给润色后的完整试卷，再给「备选题」小节。"""


# ── Prompt 模板 ────────────────────────────────────────────────────

_SUMMARY_PROMPT = """你是一位资深学科老师。请阅读下面的错题清单与统计，输出一份【结构化总结】，用 Markdown。

必须包含三节：
## 一、知识点梳理
把错题归纳为若干知识点，每个说明：涉及几题、典型错因。
## 二、错因分析
按错误类型归纳共性原因（概念不清 / 计算失误 / 审题错误 / 知识遗忘 等）。
## 三、出题建议
给出建议题量、题型配比（选择/填空/解答）、难度配比。

【硬性约束】
1. 只输出 Markdown 正文，不要前言、不要代码围栏。
2. 不要杜撰清单之外的错题。
3. 全文字数控制在 400 字以内。

【统计】
{stats}

【错题清单】
{items}
"""

_DRAFT_PROMPT = """你是一位资深命题老师。请根据【结构化总结】与【原始错题】，按下面的固定模板生成一份试卷初稿。

【输出模板】（严格遵守，Markdown）
# {title}

## 一、选择题
1. 题干……
   A. ……  B. ……  C. ……  D. ……

## 二、填空题
1. ……

## 三、解答题
1. ……

---

## 参考答案与解析
1. **答案**：……  **解析**：……
2. ……

【硬性约束】
1. 恰好 {count} 道题：选择题 {n_choice} 道、填空题 {n_blank} 道、解答题 {n_solution} 道。
2. 覆盖知识点：{knowledge_points}
3. 不得照抄原题——换数字、换情境，但考同一知识点；难度与原错题相当或略高。
4. 直接输出 Markdown 正文，第一个字符必须是 #，不要任何解释、不要代码围栏。

【结构化总结】
{summary}

【原始错题】
{items}
"""


# ── 文本清洗 ───────────────────────────────────────────────────────

_THINK_RE = re.compile(
    r"(?:<think(?:ing)?>|<｜begin▁of▁thinking｜>).*?(?:</think(?:ing)?>|<｜end▁of▁thinking｜>|$)",
    re.S,
)
_FENCE_RE = re.compile(r"^```[a-zA-Z]*\s*|\s*```$")


def clean_output(text: str) -> str:
    """剥离思维链（支持 <think> 与 deepseek 的 ｜ 格式）与误加的代码围栏。"""
    if not text:
        return ""
    text = _THINK_RE.sub("", text)
    return _FENCE_RE.sub("", text.strip()).strip()


# ── 确定性统计 ─────────────────────────────────────────────────────

def build_stats(questions: list[Question]) -> dict:
    """后端直接算统计，不依赖模型——快且准，防止模型杜撰。"""
    return {
        "total": len(questions),
        "subjects": sorted({q.subject or "未分类" for q in questions}),
        "difficulty": dict(Counter(q.difficulty for q in questions)),
        "error_types": dict(Counter(q.error_type or "未分类" for q in questions)),
        "knowledge_points": sorted({t.tag_name for q in questions for t in q.tags}),
    }


def _format_stats(stats: dict) -> str:
    diff = "、".join(f"{k}星×{v}" for k, v in sorted(stats["difficulty"].items()))
    errs = "、".join(f"{k}×{v}" for k, v in stats["error_types"].items())
    kps = "、".join(stats["knowledge_points"]) or "（无标签）"
    return (
        f"总题数: {stats['total']}\n"
        f"学科: {'、'.join(stats['subjects'])}\n"
        f"难度分布: {diff or '无'}\n"
        f"错误类型: {errs or '无'}\n"
        f"知识点: {kps}"
    )


def _format_items(questions: list[Question]) -> str:
    lines = []
    for i, q in enumerate(questions, 1):
        tags = "、".join(t.tag_name for t in q.tags) or "无"
        lines.append(
            f"错题{i}｜学科:{q.subject or '未分类'}｜难度:{q.difficulty}/5"
            f"｜错误类型:{q.error_type or '未分类'}｜知识点:{tags}\n"
            f"  题干: {q.question_content or '无'}\n"
            f"  正确答案: {q.correct_solution or '无'}\n"
            f"  学生错因: {q.user_analysis or '无'}"
        )
    return "\n".join(lines)


def _distribute(count: int) -> tuple[int, int, int]:
    """题型配比：选择题约 1/2，填空约 1/4，其余解答题。"""
    n_choice = count // 2
    n_blank = count // 4
    return n_choice, n_blank, count - n_choice - n_blank


# ── 主流程 ─────────────────────────────────────────────────────────

def generate_paper(questions: list[Question], count: int) -> dict:
    """生成试卷初稿。

    Returns:
        成功: {"summary", "draft", "polish_prompt", "stats", "model"}
        失败: {"error": code, "message": str}
    """
    stats = build_stats(questions)
    items = _format_items(questions)

    # 阶段①：结构化整理
    r1 = OllamaService.generate(
        _SUMMARY_PROMPT.format(stats=_format_stats(stats), items=items)
    )
    if r1.get("error"):
        return {"error": r1["error"], "message": "本地模型未就绪，请先启动 ollama serve"}
    summary = clean_output(r1["text"])

    # 阶段②：按模板生成初稿（不合格则重试一次）
    n_choice, n_blank, n_solution = _distribute(count)
    subjects = "、".join(stats["subjects"]) or "综合"
    knowledge_points = "、".join(stats["knowledge_points"]) or "（见错题清单）"

    draft = ""
    for attempt in (1, 2):
        r2 = OllamaService.generate(
            _DRAFT_PROMPT.format(
                title=f"{subjects}错题重练试卷",
                count=count,
                n_choice=n_choice,
                n_blank=n_blank,
                n_solution=n_solution,
                knowledge_points=knowledge_points,
                summary=summary,
                items=items,
            ),
            temperature=0.4 if attempt == 1 else 0.2,
        )
        if r2.get("error"):
            return {"error": r2["error"], "message": "本地模型未就绪，请先启动 ollama serve"}
        draft = clean_output(r2["text"])
        if len(draft) >= 200 and "参考答案" in draft:
            break
        logger.warning("试卷初稿第 %d 次输出不合格（长度 %d）", attempt, len(draft))
        if attempt == 2:
            return {
                "error": "LLM_BAD_OUTPUT",
                "message": "模型输出异常，请减少题量后重试",
            }

    return {
        "summary": summary,
        "draft": draft,
        "polish_prompt": POLISH_PROMPT,
        "stats": stats,
        "model": settings.OLLAMA_MODEL,
    }
