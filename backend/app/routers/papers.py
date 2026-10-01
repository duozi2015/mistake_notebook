"""试卷初稿生成路由。

异步任务 + 轮询：POST /generate 立即返回 job_id，后台线程池跑 Ollama，
前端每 2.5 秒轮询 GET /jobs/{job_id}。
"""

import logging

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import SessionLocal, get_db
from app.models import Question, User
from app.schemas import PaperGenerateRequest, PaperJobResponse
from app.auth import get_current_user
from app.services import paper_jobs, paper_service
from app.services.ollama_service import OllamaService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/papers", tags=["试卷"])


def _run_job(job_id: str, question_ids: list[int], count: int, user_id: int) -> None:
    """后台任务：同步函数 → FastAPI 丢进线程池执行，不阻塞事件循环。"""
    paper_jobs.set_running(job_id)
    db: Session = SessionLocal()  # 后台任务需自建会话（请求会话已随响应关闭）
    try:
        questions = (
            db.query(Question)
            .filter(Question.id.in_(question_ids), Question.user_id == user_id)
            .all()
        )
        result = paper_service.generate_paper(questions, count)
        if result.get("error"):
            paper_jobs.set_failed(job_id, result["error"], result["message"])
        else:
            paper_jobs.set_done(job_id, result)
    except Exception:  # noqa: BLE001
        logger.exception("试卷生成任务失败 job_id=%s", job_id)
        paper_jobs.set_failed(job_id, "INTERNAL_ERROR", "生成失败，请重试")
    finally:
        db.close()


@router.post("/generate", status_code=status.HTTP_202_ACCEPTED)
def start_generate(
    data: PaperGenerateRequest,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """发起试卷初稿生成，立即返回 job_id。"""
    questions = (
        db.query(Question)
        .filter(
            Question.id.in_(data.question_ids),
            Question.user_id == current_user.id,
            Question.status == "active",
        )
        .all()
    )
    if not questions:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "NOT_FOUND", "message": "未找到指定错题"},
        )

    if not OllamaService.is_available():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"code": "OLLAMA_UNAVAILABLE", "message": "本地模型未启动，请先运行 ollama serve"},
        )

    job_id = paper_jobs.create_job(current_user.id)
    background.add_task(
        _run_job, job_id, [q.id for q in questions], data.count, current_user.id
    )
    return {"job_id": job_id, "status": "pending"}


@router.get("/jobs/{job_id}", response_model=PaperJobResponse)
def get_job(job_id: str, current_user: User = Depends(get_current_user)):
    """查询生成任务状态。"""
    job = paper_jobs.get_job(job_id)
    if not job or job["user_id"] != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "NOT_FOUND", "message": "任务不存在或已过期"},
        )
    return job
