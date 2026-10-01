"""试卷生成任务的内存存储。

进程内字典 + 线程锁，重启即丢——对「生成一次初稿」这种一次性操作足够，
避免为此建表 / 走迁移。超过 TTL 的 job 在创建新 job 时顺带清理。
"""

import threading
import time
import uuid

from app.config import settings

_JOBS: dict[str, dict] = {}
_LOCK = threading.Lock()


def _gc_locked() -> None:
    """清理超过 TTL 的旧 job（调用方需已持锁）。"""
    now = time.time()
    ttl = settings.PAPER_JOB_TTL_SECONDS
    for key in [k for k, v in _JOBS.items() if now - v["created_at"] > ttl]:
        _JOBS.pop(key, None)


def create_job(user_id: int) -> str:
    job_id = uuid.uuid4().hex
    with _LOCK:
        _JOBS[job_id] = {
            "status": "pending",
            "result": None,
            "error": None,
            "user_id": user_id,
            "created_at": time.time(),
        }
        _gc_locked()
    return job_id


def set_running(job_id: str) -> None:
    with _LOCK:
        if job_id in _JOBS:
            _JOBS[job_id]["status"] = "running"


def set_done(job_id: str, result: dict) -> None:
    with _LOCK:
        if job_id in _JOBS:
            _JOBS[job_id]["status"] = "done"
            _JOBS[job_id]["result"] = result


def set_failed(job_id: str, code: str, message: str) -> None:
    with _LOCK:
        if job_id in _JOBS:
            _JOBS[job_id]["status"] = "failed"
            _JOBS[job_id]["error"] = {"code": code, "message": message}


def get_job(job_id: str) -> dict | None:
    with _LOCK:
        job = _JOBS.get(job_id)
        return dict(job) if job else None
