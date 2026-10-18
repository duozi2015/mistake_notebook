"""ima 笔记备份导出：把错题打包成 ZIP，每题一个 PDF（对应一个 ima 笔记）。

背景：腾讯 ima 知识库无 API/CLI，用户手动导入。因此交付物是 ZIP 下载包，
用户解压后批量导入 ima（每个 PDF 即一篇笔记）。

只读功能：不建表、不迁移、不写数据库，仅查询 + 打包。
PDF 写法与 app/routers/export.py 保持一致（中文字体、三种 ParagraphStyle）。
"""

import io
import re
import zipfile
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Question, User
from app.auth import get_current_user

router = APIRouter(prefix="/api/v1/ima-backup", tags=["导出"])

# 原始题目图片所在目录：backend/uploads/questions/
# file_path 形如 "/uploads/questions/xxx.jpg"，去掉首部 "/" 后拼到 backend 根目录
_BACKEND_ROOT = Path(__file__).resolve().parents[2]


def _safe_name(text: str, fallback: str) -> str:
    """把学科等字段转成适合文件名的形式（去路径分隔符等）。"""
    cleaned = re.sub(r'[\\/:*?"<>|\s]+', "_", (text or "").strip())
    return cleaned or fallback


@router.get("/notes")
def export_ima_notes(
    subject: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """导出当前用户的活跃错题为 ima 笔记 ZIP（每题一个 PDF）。"""
    query = (
        db.query(Question)
        .filter(
            Question.user_id == current_user.id,
            Question.status == "active",
        )
        .order_by(Question.id)
    )
    if subject:
        query = query.filter(Question.subject == subject)
    questions = query.all()

    if not questions:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "NOT_FOUND", "message": "没有可备份的错题"},
        )

    # PDF 依赖延迟导入：reportlab 缺失时给出明确错误，而不是 500
    try:
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib.units import cm
        from reportlab.platypus import (
            SimpleDocTemplate,
            Paragraph,
            Spacer,
            Image,
        )
        from reportlab.lib import colors
        from reportlab.lib.utils import ImageReader

        from app.services.pdf_font import ensure_cjk_font
    except ImportError as exc:  # pragma: no cover
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"code": "PDF_DEP_MISSING", "message": f"服务器缺少 PDF 依赖: {exc}"},
        ) from exc

    cjk_font = ensure_cjk_font()

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "ImaTitle",
        parent=styles["Title"],
        fontName=cjk_font or styles["Title"].fontName,
        fontSize=14,
        spaceAfter=8,
    )
    tag_style = ParagraphStyle(
        "ImaTag",
        parent=styles["Heading2"],
        fontName=cjk_font or styles["Heading2"].fontName,
        fontSize=10,
        spaceAfter=6,
        textColor=colors.HexColor("#16a34a"),
    )
    body_style = ParagraphStyle(
        "ImaBody",
        parent=styles["Normal"],
        fontName=cjk_font or styles["Normal"].fontName,
        fontSize=10,
        leading=16,
        spaceAfter=6,
    )

    def build_question_pdf(q: Question) -> bytes:
        buf = io.BytesIO()
        doc = SimpleDocTemplate(
            buf,
            pagesize=A4,
            topMargin=15 * 2.54 / 2.54 * cm / 2.54,  # 1.5cm
            bottomMargin=15 * 2.54 / 2.54 * cm / 2.54,
            leftMargin=2 * cm,
            rightMargin=2 * cm,
        )
        created = q.created_at.strftime("%Y-%m-%d") if q.created_at else "未知日期"
        subject_text = q.subject or "未分类"

        story = []
        # 标题行：#题号 学科｜难度N/5｜错误类型｜日期
        story.append(Paragraph(
            f"#{q.id} {subject_text}｜难度{q.difficulty or 3}/5｜"
            f"{q.error_type or '未分类'}｜{created}",
            title_style,
        ))
        # 知识点标签行
        tags = ", ".join(t.tag_name for t in q.tags)
        story.append(Paragraph(f"知识点: {tags or '无'}", tag_style))
        story.append(Paragraph("<b>【题目】</b>", body_style))
        story.append(Paragraph(
            (q.question_content or "无内容").replace("\n", "<br/>"),
            body_style,
        ))
        story.append(Paragraph("<b>【正确答案】</b>", body_style))
        story.append(Paragraph(
            (q.correct_solution or "未填写").replace("\n", "<br/>"),
            body_style,
        ))
        story.append(Paragraph("<b>【我的错因】</b>", body_style))
        story.append(Paragraph(
            (q.user_analysis or "未填写").replace("\n", "<br/>"),
            body_style,
        ))
        story.append(Paragraph(f"<b>来源:</b> {q.source or '未填写'}", body_style))

        # 原始题目图片（image_type=="question"，按 sort_order 排）
        for img in sorted(
            [i for i in q.images if i.image_type == "question"],
            key=lambda i: i.sort_order or 0,
        ):
            rel = (img.file_path or "").lstrip("/")
            disk = _BACKEND_ROOT / rel
            if not disk.is_file():
                story.append(Paragraph(
                    f"<i>[原始图片缺失: {img.original_name or rel}]</i>",
                    body_style,
                ))
                continue
            try:
                natural_w, natural_h = ImageReader(str(disk)).getSize()
                width = min(15 * cm, natural_w)  # 最大宽 ~15cm，保持纵横比
                ratio = width / natural_w
                story.append(Spacer(1, 6))
                story.append(Image(str(disk), width=width, height=natural_h * ratio))
            except Exception:  # noqa: BLE001 — 图片损坏时跳过，不阻塞整包
                story.append(Paragraph(
                    f"<i>[图片无法读取: {img.original_name or rel}]</i>",
                    body_style,
                ))

        doc.build(story)
        data = buf.getvalue()
        buf.close()
        return data

    zip_buf = io.BytesIO()
    with zipfile.ZipFile(zip_buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for q in questions:
            date_part = q.created_at.strftime("%Y%m%d") if q.created_at else "nodate"
            name = f"q{q.id}_{_safe_name(q.subject, '未分类')}_{date_part}.pdf"
            zf.writestr(name, build_question_pdf(q))

    zip_bytes = zip_buf.getvalue()
    zip_buf.close()

    filename = f"ima_notes_{datetime.now().strftime('%Y%m%d_%H%M%S')}.zip"
    return Response(
        content=zip_bytes,
        media_type="application/zip",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
        },
    )
