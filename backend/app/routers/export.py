import json
import secrets
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User, Question, ShareLink
from app.auth import get_current_user

router = APIRouter(prefix="/api/v1/export", tags=["导出"])


class ExportPdfRequest(BaseModel):
    question_ids: list[int] = Field(..., min_length=1)
    include_solution: bool = True


class ShareLinkRequest(BaseModel):
    question_ids: list[int] = Field(..., min_length=1)
    expire_hours: int = Field(default=72, ge=1, le=720)


@router.post("/pdf")
def export_pdf(
    data: ExportPdfRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """导出题目为 PDF（或纯文本回退）"""
    questions = (
        db.query(Question)
        .filter(
            Question.id.in_(data.question_ids),
            Question.user_id == current_user.id,
        )
        .all()
    )

    if not questions:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "NOT_FOUND", "message": "未找到指定题目"},
        )

    # 构建文本内容
    lines = []
    lines.append("=" * 60)
    lines.append("智能错题本 - 题目导出")
    lines.append(f"导出时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    lines.append(f"题目数量: {len(questions)}")
    lines.append("=" * 60)
    lines.append("")

    for i, q in enumerate(questions, 1):
        lines.append(f"--- 第 {i} 题 ---")
        lines.append(f"科目: {q.subject or '未分类'}")
        tags = ", ".join(t.tag_name for t in q.tags)
        lines.append(f"标签: {tags or '无'}")
        lines.append(f"难度: {q.difficulty}/5")
        lines.append(f"错误类型: {q.error_type or '未分类'}")
        lines.append(f"来源: {q.source or '未填写'}")
        lines.append("")
        lines.append("【题目内容】")
        lines.append(q.question_content or "无内容")
        lines.append("")
        if data.include_solution:
            lines.append("【正确答案】")
            lines.append(q.correct_solution or "未填写")
            lines.append("")
            lines.append("【用户分析】")
            lines.append(q.user_analysis or "未填写")
        lines.append("")

    content = "\n".join(lines)

    # 尝试使用 reportlab 生成 PDF
    try:
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib.units import mm
        from reportlab.platypus import (
            SimpleDocTemplate,
            Paragraph,
            Spacer,
            PageBreak,
        )
        from reportlab.lib import colors

        import io

        buf = io.BytesIO()
        doc = SimpleDocTemplate(
            buf,
            pagesize=A4,
            topMargin=20 * mm,
            bottomMargin=20 * mm,
            leftMargin=20 * mm,
            rightMargin=20 * mm,
        )

        styles = getSampleStyleSheet()
        title_style = ParagraphStyle(
            "CustomTitle",
            parent=styles["Title"],
            fontSize=18,
            spaceAfter=12,
        )
        heading_style = ParagraphStyle(
            "CustomHeading",
            parent=styles["Heading2"],
            fontSize=14,
            spaceAfter=6,
            spaceBefore=12,
            textColor=colors.HexColor("#2563eb"),
        )
        body_style = ParagraphStyle(
            "CustomBody",
            parent=styles["Normal"],
            fontSize=10,
            leading=16,
            spaceAfter=6,
        )

        story = []
        story.append(Paragraph("智能错题本 - 题目导出", title_style))
        story.append(
            Paragraph(
                f"导出时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
                body_style,
            )
        )
        story.append(
            Paragraph(f"题目数量: {len(questions)}", body_style)
        )
        story.append(Spacer(1, 12))

        for i, q in enumerate(questions, 1):
            story.append(Paragraph(f"第 {i} 题", heading_style))
            story.append(
                Paragraph(
                    f"<b>科目:</b> {q.subject or '未分类'} &nbsp;&nbsp; "
                    f"<b>难度:</b> {q.difficulty}/5 &nbsp;&nbsp; "
                    f"<b>错误类型:</b> {q.error_type or '未分类'}",
                    body_style,
                )
            )
            tags = ", ".join(t.tag_name for t in q.tags)
            story.append(Paragraph(f"<b>标签:</b> {tags or '无'}", body_style))
            story.append(Spacer(1, 6))
            story.append(Paragraph("<b>【题目内容】</b>", body_style))
            story.append(
                Paragraph(
                    (q.question_content or "无内容").replace("\n", "<br/>"),
                    body_style,
                )
            )
            story.append(Spacer(1, 6))
            if data.include_solution:
                story.append(Paragraph("<b>【正确答案】</b>", body_style))
                story.append(
                    Paragraph(
                        (q.correct_solution or "未填写").replace("\n", "<br/>"),
                        body_style,
                    )
                )
                story.append(Spacer(1, 6))
                story.append(Paragraph("<b>【用户分析】</b>", body_style))
                story.append(
                    Paragraph(
                        (q.user_analysis or "未填写").replace("\n", "<br/>"),
                        body_style,
                    )
                )
                story.append(Spacer(1, 6))
            if i < len(questions):
                story.append(Spacer(1, 12))

        doc.build(story)
        pdf_bytes = buf.getvalue()
        buf.close()

        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={
                "Content-Disposition": f'attachment; filename="mistakes_{datetime.now().strftime("%Y%m%d_%H%M%S")}.pdf"'
            },
        )
    except ImportError:
        # reportlab 未安装，回退到纯文本
        return Response(
            content=content,
            media_type="text/plain; charset=utf-8",
            headers={
                "Content-Disposition": f'attachment; filename="mistakes_{datetime.now().strftime("%Y%m%d_%H%M%S")}.txt"'
            },
        )


@router.post("/share-link")
def create_share_link(
    data: ShareLinkRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """生成分享链接"""
    # 验证题目属于当前用户
    count = (
        db.query(Question)
        .filter(
            Question.id.in_(data.question_ids),
            Question.user_id == current_user.id,
        )
        .count()
    )
    if count != len(data.question_ids):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "NOT_FOUND",
                "message": "部分题目不存在或不属于当前用户",
            },
        )

    token = secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(hours=data.expire_hours)

    share_link = ShareLink(
        token=token,
        question_ids=json.dumps(data.question_ids),
        expires_at=expires_at,
        user_id=current_user.id,
    )
    db.add(share_link)
    db.commit()
    db.refresh(share_link)

    return {
        "share_url": f"/share/{token}",
        "token": token,
        "expires_at": expires_at.isoformat(),
        "question_ids": data.question_ids,
    }