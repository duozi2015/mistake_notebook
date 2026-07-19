import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.database import engine, Base
from app.config import settings
from app.routers import auth, questions, images, reviews, ocr, variants, export, statistics

app = FastAPI(title="智能错题本 API", version="0.1.0")

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


@app.on_event("startup")
def startup():
    Base.metadata.create_all(bind=engine)
    # 确保上传目录存在
    os.makedirs("uploads/temp", exist_ok=True)
    os.makedirs("uploads/questions", exist_ok=True)


@app.get("/api/v1/auth/health")
def health():
    import socket
    hostname = socket.gethostname()
    # 判断环境：通过 hostname 或环境变量
    env = os.getenv("APP_ENV", "development")
    return {
        "status": "ok",
        "version": "0.1.0",
        "environment": env,
        "hostname": hostname,
    }