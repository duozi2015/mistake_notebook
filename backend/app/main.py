import os
import subprocess
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.database import engine
from app.config import settings
from app.migrations import run_migrations
from app.routers import auth, questions, images, reviews, ocr, variants, export, statistics, admin, family, tasks, achievements


@asynccontextmanager
async def lifespan(app: FastAPI):
    # 启动时：执行数据库迁移（建新表 + 存量表加列，幂等非破坏）+ 上传目录
    run_migrations(engine)
    os.makedirs("uploads/temp", exist_ok=True)
    os.makedirs("uploads/questions", exist_ok=True)
    os.makedirs("uploads/tasks", exist_ok=True)
    yield


app = FastAPI(title="智能错题本 API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 注册路由
app.include_router(auth.router)
app.include_router(questions.router)
app.include_router(images.router)
app.include_router(reviews.router)
app.include_router(statistics.router)
app.include_router(ocr.router)
app.include_router(variants.router)
app.include_router(export.router)
app.include_router(admin.router)
app.include_router(family.router)
app.include_router(tasks.router)
app.include_router(achievements.router)


def _get_git_commit():
    """获取当前 Git 提交的短哈希"""
    try:
        return subprocess.run(
            ["git", "rev-parse", "--short", "HEAD"],
            capture_output=True, text=True, cwd=os.path.dirname(__file__),
            timeout=5,
        ).stdout.strip()
    except Exception:
        return "unknown"


@app.get("/api/v1/auth/health")
def health():
    import socket
    hostname = socket.gethostname().lower()
    # 自动识别：MacBook Pro → 开发环境，其他（Mac mini 等）→ 生产环境
    env = "development" if "macbook" in hostname else "production"
    return {
        "status": "ok",
        "version": "0.1.0",
        "commit": _get_git_commit(),
        "environment": env,
        "hostname": socket.gethostname(),
    }