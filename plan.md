# 智能错题本系统 — 实施计划

> 版本：v1.0
> 创建日期：2026-07-18
> 目标版本：MVP-v1（基础框架 + 注册登录 + 错题 CRUD）

---

## 总览

### MVP-v1 范围

```
注册/登录 → 错题录入 → 错题列表 → 错题详情
     ↓           ↓           ↓           ↓
  JWT 认证    图片上传    分页筛选    图片展示
```

### 目录结构（最终形态）

```
mistake_notebook/
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── config.py
│   │   ├── auth.py
│   │   ├── database.py
│   │   ├── models.py
│   │   ├── schemas.py
│   │   ├── exceptions.py
│   │   ├── routers/
│   │   │   ├── __init__.py
│   │   │   ├── auth.py
│   │   │   ├── questions.py
│   │   │   └── images.py
│   │   └── services/
│   │       ├── __init__.py
│   │       └── sm2.py  (占位)
│   ├── data/
│   ├── uploads/
│   │   ├── temp/
│   │   └── questions/
│   ├── venv/
│   └── requirements.txt
│
├── frontend/
│   ├── public/
│   │   ├── manifest.json
│   │   └── icons/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Layout/
│   │   │   │   ├── MobileLayout.tsx
│   │   │   │   ├── BottomNav.tsx
│   │   │   │   └── Header.tsx
│   │   │   └── Shared/
│   │   │       ├── Loading.tsx
│   │   │       ├── ErrorBoundary.tsx
│   │   │       ├── EmptyState.tsx
│   │   │       ├── Toast.tsx
│   │   │       └── FormField.tsx
│   │   ├── features/
│   │   │   ├── auth/
│   │   │   │   ├── LoginPage.tsx
│   │   │   │   └── RegisterPage.tsx
│   │   │   ├── questions/
│   │   │   │   ├── QuestionListPage.tsx
│   │   │   │   ├── QuestionNewPage.tsx
│   │   │   │   └── QuestionDetailPage.tsx
│   │   │   └── dashboard/
│   │   │       └── DashboardPage.tsx  (占位)
│   │   ├── services/
│   │   │   ├── api.ts
│   │   │   ├── auth.ts
│   │   │   └── questions.ts
│   │   ├── stores/
│   │   │   ├── authStore.ts
│   │   │   └── toastStore.ts
│   │   ├── hooks/
│   │   │   └── useApi.ts
│   │   ├── types/
│   │   │   └── index.ts
│   │   ├── utils/
│   │   │   └── index.ts
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── index.html
│   ├── package.json
│   ├── tsconfig.json
│   ├── tailwind.config.js
│   ├── vite.config.ts
│   └── postcss.config.js
│
├── nginx.conf
├── deploy.sh
├── stop.sh
├── .env.example
├── design.md
├── plan.md
└── README.md
```

---

## 任务清单

每个任务标注了：
- **文件路径** — 需要创建或修改的文件
- **核心代码** — 关键实现代码
- **验证步骤** — 如何确认任务完成

---

### 任务 1：后端项目脚手架

**文件：** 多个

**步骤：**
1. 创建 `backend/` 目录结构
2. 创建 `backend/requirements.txt`

**`backend/requirements.txt`：**
```txt
fastapi==0.111.0
uvicorn[standard]==0.29.0
sqlalchemy==2.0.30
python-jose[cryptography]==3.3.0
passlib[bcrypt]==1.7.4
python-multipart==0.0.9
aiofiles==23.2.1
pydantic==2.7.0
pydantic-settings==2.2.0
```

3. 创建 `backend/app/__init__.py`（空文件）
4. 创建 `backend/app/config.py`

```python
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    JWT_SECRET: str = "dev-secret-change-in-production"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440  # 24h
    REFRESH_TOKEN_EXPIRE_MINUTES: int = 10080  # 7d
    DATABASE_URL: str = "sqlite:///data/mistake_notebook.db"
    OCR_ENABLED: bool = False
    HOST: str = "0.0.0.0"
    PORT: int = 8000

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"

settings = Settings()
```

5. 创建 `backend/app/database.py`

```python
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase

from app.config import settings

engine = create_engine(
    settings.DATABASE_URL,
    connect_args={"check_same_thread": False},
    echo=False,
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

6. 创建 `backend/app/main.py`

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.database import engine, Base
from app.config import settings

app = FastAPI(title="智能错题本 API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def startup():
    Base.metadata.create_all(bind=engine)

@app.get("/api/v1/auth/health")
def health():
    return {"status": "ok", "version": "0.1.0"}
```

**验证步骤：**
```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
# 访问 http://localhost:8000/api/v1/auth/health 应返回 {"status":"ok","version":"0.1.0"}
# 访问 http://localhost:8000/docs 应显示 Swagger 文档
```

---

### 任务 2：前端项目脚手架

**文件：** 多个

**步骤：**
1. 创建 `frontend/` 目录

```bash
cd frontend
npm create vite@latest . -- --template react-ts
npm install
npm install react-router-dom@6 zustand axios tailwindcss @tailwindcss/vite
```

2. 配置 `frontend/vite.config.ts`

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 3000, proxy: { '/api': 'http://localhost:8000' } },
})
```

3. 配置 `frontend/tailwind.config.js`

```javascript
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: { primary: { 50: '#eff6ff', 100: '#dbeafe', 500: '#3b82f6', 600: '#2563eb', 700: '#1d4ed8' } }
    },
  },
  plugins: [],
}
```

4. 删除 `frontend/src/App.css`，创建 `frontend/src/index.css`

```css
@import "tailwindcss";
```

5. 创建 `frontend/src/types/index.ts`

```typescript
export interface User {
  id: number
  username: string
  display_name: string
}

export interface Question {
  id: number
  question_content: string
  subject: string
  tags: string[]
  images: QuestionImage[]
  error_type: string
  difficulty: number
  source: string
  correct_solution: string
  user_analysis: string
  status: 'active' | 'archived'
  next_review_date: string | null
  current_ef: number
  created_at: string
  updated_at: string
}

export interface QuestionImage {
  id: number
  file_path: string
  mime_type: string
}

export interface PaginatedResponse<T> {
  data: T[]
  pagination: { page: number; page_size: number; total: number; total_pages: number }
}

export interface ApiError {
  error: { code: string; message: string; details?: Record<string, unknown> }
}
```

**验证步骤：**
```bash
cd frontend
npm run dev
# 浏览器访问 http://localhost:3000 应显示 Vite + React 默认页
```

---

### 任务 3：后端数据模型

**文件：** `backend/app/models.py`

```python
from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, Float, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from app.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, index=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    display_name = Column(String(100), default="")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    questions = relationship("Question", back_populates="user")
    reviews = relationship("Review", back_populates="user")


class Question(Base):
    __tablename__ = "questions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, default=1)
    question_content = Column(Text, default="")
    subject = Column(String(50), default="")
    error_type = Column(String(20), default="")
    difficulty = Column(Integer, default=3)
    source = Column(String(200), default="")
    correct_solution = Column(Text, default="")
    user_analysis = Column(Text, default="")
    status = Column(String(20), default="active")
    current_ef = Column(Float, default=2.5)
    current_interval = Column(Integer, default=0)
    current_rep_count = Column(Integer, default=0)
    next_review_date = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User", back_populates="questions")
    images = relationship("QuestionImage", back_populates="question", cascade="all, delete-orphan")
    tags = relationship("QuestionTag", back_populates="question", cascade="all, delete-orphan")
    reviews = relationship("Review", back_populates="question", cascade="all, delete-orphan")


class QuestionImage(Base):
    __tablename__ = "question_images"

    id = Column(Integer, primary_key=True, index=True)
    question_id = Column(Integer, ForeignKey("questions.id", ondelete="CASCADE"), nullable=False)
    file_path = Column(String(500), nullable=False)
    original_name = Column(String(200), default="")
    file_size = Column(Integer, default=0)
    mime_type = Column(String(50), default="image/jpeg")
    sort_order = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)

    question = relationship("Question", back_populates="images")


class QuestionTag(Base):
    __tablename__ = "question_tags"
    __table_args__ = (UniqueConstraint("question_id", "tag_name"),)

    id = Column(Integer, primary_key=True, index=True)
    question_id = Column(Integer, ForeignKey("questions.id", ondelete="CASCADE"), nullable=False)
    tag_name = Column(String(50), nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    question = relationship("Question", back_populates="tags")


class Review(Base):
    __tablename__ = "reviews"

    id = Column(Integer, primary_key=True, index=True)
    question_id = Column(Integer, ForeignKey("questions.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    review_date = Column(DateTime, default=datetime.utcnow)
    quality = Column(Integer, nullable=False)
    ef_before = Column(Float, default=2.5)
    ef_after = Column(Float, default=2.5)
    interval_before = Column(Integer, default=0)
    interval_after = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)

    question = relationship("Question", back_populates="reviews")
    user = relationship("User", back_populates="reviews")


class TokenBlacklist(Base):
    __tablename__ = "token_blacklist"

    id = Column(Integer, primary_key=True, index=True)
    jti = Column(String(36), unique=True, index=True, nullable=False)
    expires_at = Column(DateTime, nullable=False)
    blacklisted_at = Column(DateTime, default=datetime.utcnow)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
```

**验证步骤：**
```bash
cd backend
source venv/bin/activate
python -c "
from app.database import engine, Base
from app.models import User, Question, QuestionImage, QuestionTag, Review, TokenBlacklist
Base.metadata.create_all(bind=engine)
print('所有表创建成功')
"
# 检查 backend/data/ 目录下是否生成了 mistake_notebook.db 文件
```

---

### 任务 4：Pydantic 数据模型（schemas）

**文件：** `backend/app/schemas.py`

```python
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field


# === 用户相关 ===
class UserRegister(BaseModel):
    username: str = Field(min_length=3, max_length=50)
    password: str = Field(min_length=8, max_length=100)
    display_name: str = Field(default="", max_length=100)

class UserLogin(BaseModel):
    username: str
    password: str

class UserResponse(BaseModel):
    id: int
    username: str
    display_name: str

    class Config: from_attributes = True

class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int
    user: UserResponse

class RefreshRequest(BaseModel):
    refresh_token: str


# === 图片相关 ===
class ImageResponse(BaseModel):
    id: int
    file_path: str
    mime_type: str
    file_size: int

    class Config: from_attributes = True


# === 错题相关 ===
class QuestionCreate(BaseModel):
    question_content: str = ""
    subject: str = ""
    tags: list[str] = []
    error_type: str = ""
    difficulty: int = Field(default=3, ge=1, le=5)
    source: str = ""
    correct_solution: str = ""
    user_analysis: str = ""
    image_ids: list[int] = []

class QuestionUpdate(BaseModel):
    question_content: Optional[str] = None
    subject: Optional[str] = None
    tags: Optional[list[str]] = None
    error_type: Optional[str] = None
    difficulty: Optional[int] = None
    source: Optional[str] = None
    correct_solution: Optional[str] = None
    user_analysis: Optional[str] = None
    status: Optional[str] = None

class QuestionResponse(BaseModel):
    id: int
    question_content: str
    subject: str
    tags: list[str]
    images: list[ImageResponse]
    error_type: str
    difficulty: int
    source: str
    correct_solution: str
    user_analysis: str
    status: str
    next_review_date: Optional[datetime]
    current_ef: float
    created_at: datetime
    updated_at: datetime

    class Config: from_attributes = True


# === 分页 ===
class Pagination(BaseModel):
    page: int
    page_size: int
    total: int
    total_pages: int

class PaginatedQuestions(BaseModel):
    data: list[QuestionResponse]
    pagination: Pagination


# === 统一错误 ===
class ErrorDetail(BaseModel):
    code: str
    message: str
    details: Optional[dict] = None

class ErrorResponse(BaseModel):
    error: ErrorDetail
```

**验证步骤：** 无运行验证，导入不报错即可（后续任务中会用到）

---

### 任务 5：后端认证服务

**文件：** `backend/app/auth.py`

```python
from datetime import datetime, timedelta, timezone
from uuid import uuid4
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from passlib.context import CryptContext
from jose import jwt, JWTError

from app.config import settings
from app.database import get_db
from app.models import User, TokenBlacklist

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer(auto_error=False)


def hash_password(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def create_access_token(user: User) -> tuple[str, str, int]:
    jti = str(uuid4())
    expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user.id,
        "username": user.username,
        "jti": jti,
        "type": "access",
        "exp": now + expires,
        "iat": now,
    }
    token = jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)
    return token, jti, int(expires.total_seconds())


def create_refresh_token(user: User) -> tuple[str, str, int]:
    jti = str(uuid4())
    expires = timedelta(minutes=settings.REFRESH_TOKEN_EXPIRE_MINUTES)
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user.id,
        "username": user.username,
        "jti": jti,
        "type": "refresh",
        "exp": now + expires,
        "iat": now,
    }
    token = jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)
    return token, jti, int(expires.total_seconds())


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
) -> User:
    if credentials is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail={"code": "UNAUTHORIZED", "message": "缺少认证 Token"})
    token = credentials.credentials
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail={"code": "UNAUTHORIZED", "message": "Token 类型错误"})
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail={"code": "UNAUTHORIZED", "message": "Token 无效或已过期"})
    jti = payload.get("jti")
    blacklisted = db.query(TokenBlacklist).filter(TokenBlacklist.jti == jti).first()
    if blacklisted:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail={"code": "TOKEN_BLACKLISTED", "message": "Token 已被登出"})
    user = db.query(User).filter(User.id == payload.get("sub")).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail={"code": "UNAUTHORIZED", "message": "用户不存在"})
    return user
```

**验证步骤：** 后续认证路由实现后统一测试

---

### 任务 6：后端认证路由

**文件：** `backend/app/routers/__init__.py`（空文件）
**文件：** `backend/app/routers/auth.py`

```python
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from jose import jwt, JWTError

from app.config import settings
from app.database import get_db
from app.models import User, TokenBlacklist
from app.schemas import UserRegister, UserLogin, TokenResponse, RefreshRequest, UserResponse
from app.auth import hash_password, verify_password, create_access_token, create_refresh_token, get_current_user

router = APIRouter(prefix="/api/v1/auth", tags=["认证"])


@router.post("/register", response_model=UserResponse)
def register(data: UserRegister, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.username == data.username).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail={"code": "CONFLICT", "message": "用户名已存在"})
    user = User(
        username=data.username,
        password_hash=hash_password(data.password),
        display_name=data.display_name or data.username,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return UserResponse(id=user.id, username=user.username, display_name=user.display_name)


@router.post("/login", response_model=TokenResponse)
def login(data: UserLogin, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == data.username).first()
    if not user or not verify_password(data.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail={"code": "INVALID_CREDENTIALS", "message": "用户名或密码错误"})
    access_token, _, expires_in = create_access_token(user)
    refresh_token, _, _ = create_refresh_token(user)
    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=expires_in,
        user=UserResponse(id=user.id, username=user.username, display_name=user.display_name),
    )


@router.post("/refresh", response_model=TokenResponse)
def refresh(data: RefreshRequest, db: Session = Depends(get_db)):
    try:
        payload = jwt.decode(data.refresh_token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
        if payload.get("type") != "refresh":
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail={"code": "UNAUTHORIZED", "message": "Token 类型错误"})
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail={"code": "UNAUTHORIZED", "message": "Refresh Token 无效或已过期"})
    user = db.query(User).filter(User.id == payload.get("sub")).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail={"code": "UNAUTHORIZED", "message": "用户不存在"})
    access_token, _, expires_in = create_access_token(user)
    refresh_token, _, _ = create_refresh_token(user)
    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=expires_in,
        user=UserResponse(id=user.id, username=user.username, display_name=user.display_name),
    )


@router.post("/logout")
def logout(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    # 简单实现：客户端自行丢弃 Token。服务端可扩展黑名单逻辑
    return {"message": "已登出"}


@router.get("/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user)):
    return UserResponse(id=current_user.id, username=current_user.username, display_name=current_user.display_name)
```

**更新 `backend/app/main.py` 注册路由：**
```python
from app.routers import auth as auth_router
app.include_router(auth_router.router)
```

**验证步骤：**
```bash
cd backend
source venv/bin/activate
uvicorn app.main:app --reload --port 8000
# 测试注册
curl -X POST http://localhost:8000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"password123","display_name":"管理员"}'
# 应返回 {"id":1,"username":"admin","display_name":"管理员"}

# 测试登录
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"password123"}'
# 应返回包含 access_token 和 refresh_token 的 JSON

# 测试 /me（替换 <token> 为上一步返回的 access_token）
curl -X GET http://localhost:8000/api/v1/auth/me \
  -H "Authorization: Bearer <token>"
# 应返回用户信息
```

---

### 任务 7：前端 API 层 + 认证状态管理

**文件：** `frontend/src/services/api.ts`

```typescript
import axios from 'axios'

const api = axios.create({ baseURL: '/api/v1' })

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    if (error.response?.status === 401) {
      const refreshToken = localStorage.getItem('refresh_token')
      if (refreshToken && !error.config._retry) {
        error.config._retry = true
        try {
          const { data } = await axios.post('/api/v1/auth/refresh', { refresh_token: refreshToken })
          localStorage.setItem('access_token', data.access_token)
          localStorage.setItem('refresh_token', data.refresh_token)
          error.config.headers.Authorization = `Bearer ${data.access_token}`
          return api(error.config)
        } catch { /* refresh failed */ }
      }
      localStorage.removeItem('access_token')
      localStorage.removeItem('refresh_token')
      localStorage.removeItem('user')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  },
)

export default api
```

**文件：** `frontend/src/services/auth.ts`

```typescript
import api from './api'
import type { User } from '../types'

export interface LoginData { username: string; password: string }
export interface RegisterData { username: string; password: string; display_name?: string }
export interface AuthResponse { access_token: string; refresh_token: string; token_type: string; expires_in: number; user: User }

export const authApi = {
  register: (data: RegisterData) => api.post<AuthResponse>('/auth/register', data),
  login: (data: LoginData) => api.post<AuthResponse>('/auth/login', data),
  refresh: (refreshToken: string) => api.post<AuthResponse>('/auth/refresh', { refresh_token: refreshToken }),
  logout: () => api.post('/auth/logout'),
  me: () => api.get<User>('/auth/me'),
}
```

**文件：** `frontend/src/stores/authStore.ts`

```typescript
import { create } from 'zustand'
import type { User } from '../types'

interface AuthState {
  user: User | null
  isAuthenticated: boolean
  setUser: (user: User) => void
  logout: () => void
  init: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  setUser: (user) => {
    localStorage.setItem('user', JSON.stringify(user))
    set({ user, isAuthenticated: true })
  },
  logout: () => {
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
    localStorage.removeItem('user')
    set({ user: null, isAuthenticated: false })
    window.location.href = '/login'
  },
  init: () => {
    const stored = localStorage.getItem('user')
    const token = localStorage.getItem('access_token')
    if (stored && token) {
      set({ user: JSON.parse(stored), isAuthenticated: true })
    }
  },
}))
```

**文件：** `frontend/src/stores/toastStore.ts`

```typescript
import { create } from 'zustand'

interface Toast { id: string; message: string; type: 'success' | 'error' | 'info' }
interface ToastState { toasts: Toast[]; addToast: (m: string, t?: Toast['type']) => void; removeToast: (id: string) => void }

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  addToast: (message, type = 'info') => {
    const id = Date.now().toString()
    set((s) => ({ toasts: [...s.toasts, { id, message, type }] }))
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 3000)
  },
  removeToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}))
```

**验证步骤：** 后续页面实现后统一测试

---

### 任务 8：前端布局组件 + 路由

**文件：** `frontend/src/components/Layout/BottomNav.tsx`

```tsx
import { NavLink } from 'react-router-dom'

const NAV_ITEMS = [
  { to: '/', label: '首页', icon: '🏠' },
  { to: '/questions/new', label: '录入', icon: '📝' },
  { to: '/review', label: '复习', icon: '🔄' },
  { to: '/statistics', label: '统计', icon: '📊' },
  { to: '/settings', label: '设置', icon: '⚙️' },
]

export default function BottomNav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200 safe-area-bottom">
      <div className="flex justify-around items-center h-14">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex flex-col items-center justify-center px-3 py-1 text-xs ${
                isActive ? 'text-blue-600' : 'text-gray-500'
              }`
            }
          >
            <span className="text-xl">{item.icon}</span>
            <span className="mt-0.5">{item.label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
```

**文件：** `frontend/src/components/Layout/MobileLayout.tsx`

```tsx
import { Outlet } from 'react-router-dom'
import BottomNav from './BottomNav'
import Toast from '../Shared/Toast'

export default function MobileLayout() {
  return (
    <div className="min-h-screen bg-gray-50 pb-16">
      <main className="max-w-lg mx-auto px-4 pt-4">
        <Outlet />
      </main>
      <BottomNav />
      <Toast />
    </div>
  )
}
```

**文件：** `frontend/src/components/Shared/Toast.tsx`

```tsx
import { useToastStore } from '../../stores/toastStore'

export default function Toast() {
  const { toasts, removeToast } = useToastStore()
  if (toasts.length === 0) return null
  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] space-y-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          onClick={() => removeToast(t.id)}
          className={`px-4 py-2 rounded-lg shadow-lg text-white text-sm cursor-pointer ${
            t.type === 'success' ? 'bg-green-500' : t.type === 'error' ? 'bg-red-500' : 'bg-gray-800'
          }`}
        >
          {t.message}
        </div>
      ))}
    </div>
  )
}
```

**文件：** `frontend/src/App.tsx`

```tsx
import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './stores/authStore'
import MobileLayout from './components/Layout/MobileLayout'
import LoginPage from './features/auth/LoginPage'
import RegisterPage from './features/auth/RegisterPage'
import QuestionListPage from './features/questions/QuestionListPage'
import QuestionNewPage from './features/questions/QuestionNewPage'
import QuestionDetailPage from './features/questions/QuestionDetailPage'
import DashboardPage from './features/dashboard/DashboardPage'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return <>{children}</>
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  if (isAuthenticated) return <Navigate to="/" replace />
  return <>{children}</>
}

export default function App() {
  const init = useAuthStore((s) => s.init)
  useEffect(() => { init() }, [init])

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
        <Route path="/register" element={<PublicRoute><RegisterPage /></PublicRoute>} />
        <Route element={<ProtectedRoute><MobileLayout /></ProtectedRoute>}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/questions" element={<QuestionListPage />} />
          <Route path="/questions/new" element={<QuestionNewPage />} />
          <Route path="/questions/:id" element={<QuestionDetailPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
```

**文件：** `frontend/src/features/dashboard/DashboardPage.tsx`（占位）

```tsx
export default function DashboardPage() {
  return (
    <div className="text-center py-20">
      <div className="text-4xl mb-4">📝</div>
      <h1 className="text-xl font-bold text-gray-800">智能错题本</h1>
      <p className="text-gray-500 mt-2">欢迎使用，先录入你的第一道错题吧</p>
      <a href="/questions/new" className="inline-block mt-6 px-6 py-3 bg-blue-600 text-white rounded-lg">
        录入错题
      </a>
    </div>
  )
}
```

**验证步骤：**
```bash
cd frontend
npm run dev
# 浏览器访问 http://localhost:3000
# 未登录应跳转到 /login
# 页面底部显示 5 个 Tab 导航
```

---

### 任务 9：前端登录页

**文件：** `frontend/src/features/auth/LoginPage.tsx`

```tsx
import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { authApi } from '../../services/auth'
import { useAuthStore } from '../../stores/authStore'
import { useToastStore } from '../../stores/toastStore'

export default function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()
  const setUser = useAuthStore((s) => s.setUser)
  const addToast = useToastStore((s) => s.addToast)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!username.trim() || !password.trim()) { setError('请输入用户名和密码'); return }
    setLoading(true)
    try {
      const { data } = await authApi.login({ username: username.trim(), password })
      localStorage.setItem('access_token', data.access_token)
      localStorage.setItem('refresh_token', data.refresh_token)
      setUser(data.user)
      addToast('登录成功', 'success')
      navigate('/', { replace: true })
    } catch (err: any) {
      setError(err.response?.data?.detail?.message || '登录失败，请检查用户名和密码')
    } finally { setLoading(false) }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">📝</div>
          <h1 className="text-2xl font-bold text-gray-800">智能错题本</h1>
          <p className="text-gray-500 mt-1">登录以继续</p>
        </div>
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl p-6 shadow-sm space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">用户名</label>
            <input
              type="text" value={username} onChange={(e) => setUsername(e.target.value)}
              placeholder="输入用户名"
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-base"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">密码</label>
            <input
              type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              placeholder="输入密码"
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-base"
            />
          </div>
          {error && <div className="text-red-500 text-sm bg-red-50 p-3 rounded-xl">{error}</div>}
          <button
            type="submit" disabled={loading}
            className="w-full py-3 bg-blue-600 text-white rounded-xl font-medium text-base disabled:opacity-50 active:bg-blue-700"
          >
            {loading ? '登录中...' : '🔓 登录'}
          </button>
          <div className="text-center text-sm text-gray-500">
            还没有账号？<Link to="/register" className="text-blue-600 font-medium">注册账号 →</Link>
          </div>
        </form>
      </div>
    </div>
  )
}
```

**验证步骤：**
```bash
# 确保后端已启动
# 前端访问 http://localhost:3000/login
# 应显示登录表单
# 输入错误凭据 → 显示红色错误提示
# 输入正确凭据 → 跳转首页
```

---

### 任务 10：前端注册页

**文件：** `frontend/src/features/auth/RegisterPage.tsx`

```tsx
import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { authApi } from '../../services/auth'
import { useToastStore } from '../../stores/toastStore'

export default function RegisterPage() {
  const [form, setForm] = useState({ username: '', displayName: '', password: '', confirmPassword: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const navigate = useNavigate()
  const addToast = useToastStore((s) => s.addToast)

  const validate = () => {
    const errs: Record<string, string> = {}
    if (form.username.length < 3) errs.username = '用户名至少3个字符'
    if (form.password.length < 8) errs.password = '密码至少8位字符'
    if (form.password !== form.confirmPassword) errs.confirmPassword = '两次密码不一致'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return
    setLoading(true)
    try {
      await authApi.register({
        username: form.username.trim(),
        password: form.password,
        display_name: form.displayName.trim() || undefined,
      })
      setSuccess(true)
      addToast('注册成功，请登录', 'success')
      setTimeout(() => navigate('/login'), 1500)
    } catch (err: any) {
      const msg = err.response?.data?.detail?.message || '注册失败'
      if (msg.includes('已存在')) setErrors({ username: msg })
      else addToast(msg, 'error')
    } finally { setLoading(false) }
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="text-center">
          <div className="text-6xl mb-4">✅</div>
          <h1 className="text-2xl font-bold text-gray-800">注册成功！</h1>
          <p className="text-gray-500 mt-2">正在跳转登录页...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">📝</div>
          <h1 className="text-2xl font-bold text-gray-800">创建账号</h1>
          <p className="text-gray-500 mt-1">首次使用，请注册管理员账号</p>
        </div>
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl p-6 shadow-sm space-y-4">
          <FormField label="用户名" error={errors.username} placeholder="3-20位字符" value={form.username} onChange={(v) => setForm({ ...form, username: v })} />
          <FormField label="显示名称" error={errors.displayName} placeholder="页面顶部显示的名称" value={form.displayName} onChange={(v) => setForm({ ...form, displayName: v })} />
          <FormField label="密码" type="password" error={errors.password} placeholder="至少8位字符" value={form.password} onChange={(v) => setForm({ ...form, password: v })} />
          <FormField label="确认密码" type="password" error={errors.confirmPassword} placeholder="再次输入密码" value={form.confirmPassword} onChange={(v) => setForm({ ...form, confirmPassword: v })} />
          <button type="submit" disabled={loading} className="w-full py-3 bg-blue-600 text-white rounded-xl font-medium text-base disabled:opacity-50 active:bg-blue-700">
            {loading ? '注册中...' : '✅ 注册'}
          </button>
          <div className="text-center text-sm text-gray-500">
            已有账号？<Link to="/login" className="text-blue-600 font-medium">去登录 →</Link>
          </div>
        </form>
      </div>
    </div>
  )
}

function FormField({ label, type = 'text', error, placeholder, value, onChange }: {
  label: string; type?: string; error?: string; placeholder: string; value: string; onChange: (v: string) => void
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input
        type={type} value={value} onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-base ${error ? 'border-red-300 bg-red-50' : 'border-gray-300'}`}
      />
      {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
    </div>
  )
}
```

**验证步骤：**
```bash
# 访问 http://localhost:3000/register
# 输入 < 3 位用户名 → 显示 "用户名至少3个字符"
# 两次密码不一致 → 显示 "两次密码不一致"
# 正确填写 → 注册成功 → 跳转登录页
```

---

### 任务 11：后端错题 CRUD API

**文件：** `backend/app/routers/questions.py`

```python
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from math import ceil

from app.database import get_db
from app.models import User, Question, QuestionTag, QuestionImage
from app.schemas import QuestionCreate, QuestionUpdate, QuestionResponse, PaginatedQuestions, ImageResponse
from app.auth import get_current_user

router = APIRouter(prefix="/api/v1/questions", tags=["错题"])


def _question_to_response(q: Question) -> QuestionResponse:
    return QuestionResponse(
        id=q.id,
        question_content=q.question_content or "",
        subject=q.subject or "",
        tags=[t.tag_name for t in q.tags],
        images=[ImageResponse(id=img.id, file_path=img.file_path, mime_type=img.mime_type, file_size=img.file_size) for img in q.images],
        error_type=q.error_type or "",
        difficulty=q.difficulty,
        source=q.source or "",
        correct_solution=q.correct_solution or "",
        user_analysis=q.user_analysis or "",
        status=q.status,
        next_review_date=q.next_review_date,
        current_ef=q.current_ef,
        created_at=q.created_at,
        updated_at=q.updated_at,
    )


@router.get("", response_model=PaginatedQuestions)
def list_questions(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    subject: str = None,
    tag: str = None,
    error_type: str = None,
    status: str = None,
    sort_by: str = "created_at",
    sort_order: str = "desc",
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(Question).filter(Question.user_id == current_user.id)
    if subject: query = query.filter(Question.subject == subject)
    if error_type: query = query.filter(Question.error_type == error_type)
    if status: query = query.filter(Question.status == status)
    if tag: query = query.filter(Question.tags.any(QuestionTag.tag_name == tag))
    total = query.count()
    sort_col = getattr(Question, sort_by, Question.created_at)
    sort_fn = sort_col.desc() if sort_order == "desc" else sort_col.asc()
    questions = query.order_by(sort_fn).offset((page - 1) * page_size).limit(page_size).all()
    return PaginatedQuestions(
        data=[_question_to_response(q) for q in questions],
        pagination={"page": page, "page_size": page_size, "total": total, "total_pages": ceil(total / page_size)},
    )


@router.post("", response_model=QuestionResponse, status_code=status.HTTP_201_CREATED)
def create_question(data: QuestionCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    q = Question(
        user_id=current_user.id,
        question_content=data.question_content,
        subject=data.subject,
        error_type=data.error_type,
        difficulty=data.difficulty,
        source=data.source,
        correct_solution=data.correct_solution,
        user_analysis=data.user_analysis,
    )
    db.add(q)
    db.flush()
    for tag_name in data.tags:
        db.add(QuestionTag(question_id=q.id, tag_name=tag_name))
    if data.image_ids:
        db.query(QuestionImage).filter(QuestionImage.id.in_(data.image_ids)).update({"question_id": q.id})
    db.commit()
    db.refresh(q)
    return _question_to_response(q)


@router.get("/{question_id}", response_model=QuestionResponse)
def get_question(question_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    q = db.query(Question).filter(Question.id == question_id, Question.user_id == current_user.id).first()
    if not q: raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail={"code": "NOT_FOUND", "message": "题目不存在"})
    return _question_to_response(q)


@router.put("/{question_id}", response_model=QuestionResponse)
def update_question(question_id: int, data: QuestionUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    q = db.query(Question).filter(Question.id == question_id, Question.user_id == current_user.id).first()
    if not q: raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail={"code": "NOT_FOUND", "message": "题目不存在"})
    for field in ["question_content", "subject", "error_type", "difficulty", "source", "correct_solution", "user_analysis", "status"]:
        val = getattr(data, field, None)
        if val is not None: setattr(q, field, val)
    if data.tags is not None:
        db.query(QuestionTag).filter(QuestionTag.question_id == q.id).delete()
        for tag_name in data.tags: db.add(QuestionTag(question_id=q.id, tag_name=tag_name))
    q.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(q)
    return _question_to_response(q)


@router.delete("/{question_id}")
def delete_question(question_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    q = db.query(Question).filter(Question.id == question_id, Question.user_id == current_user.id).first()
    if not q: raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail={"code": "NOT_FOUND", "message": "题目不存在"})
    q.status = "archived"
    db.commit()
    return {"message": "已归档"}
```

**注册路由到 `main.py`：**
```python
from app.routers import questions as questions_router
app.include_router(questions_router.router)
```

**验证步骤：**
```bash
# 先获取 token
TOKEN=$(curl -s -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"password123"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['access_token'])")

# 创建错题
curl -X POST http://localhost:8000/api/v1/questions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"question_content":"在△ABC中，已知a=2, b=3, C=60°","subject":"数学","tags":["三角函数","正弦定理"],"error_type":"概念不清","difficulty":4}'

# 获取列表
curl -s "http://localhost:8000/api/v1/questions?page=1&page_size=10" \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
```

---

### 任务 12：后端图片上传 API

**文件：** `backend/app/routers/images.py`

```python
import os
import uuid
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models import User, QuestionImage
from app.schemas import ImageResponse
from app.auth import get_current_user

router = APIRouter(prefix="/api/v1/images", tags=["图片"])

UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "uploads")
TEMP_DIR = os.path.join(UPLOAD_DIR, "temp")
os.makedirs(TEMP_DIR, exist_ok=True)

ALLOWED_MIMES = {"image/jpeg", "image/png", "image/webp"}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB


@router.post("/upload", response_model=ImageResponse)
def upload_image(file: UploadFile = File(...), db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if file.content_type not in ALLOWED_MIMES:
        raise HTTPException(status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, detail={"code": "UNSUPPORTED_MEDIA_TYPE", "message": f"不支持的文件类型: {file.content_type}"})
    contents = file.file.read()
    if len(contents) > MAX_FILE_SIZE:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail={"code": "FILE_TOO_LARGE", "message": "文件大小超过 10MB"})
    ext = file.filename.rsplit(".", 1)[-1] if "." in file.filename else "jpg"
    filename = f"{uuid.uuid4().hex}_{int(__import__('time').time())}.{ext}"
    filepath = os.path.join(TEMP_DIR, filename)
    with open(filepath, "wb") as f: f.write(contents)
    img = QuestionImage(file_path=f"/uploads/temp/{filename}", original_name=file.filename, file_size=len(contents), mime_type=file.content_type)
    db.add(img)
    db.commit()
    db.refresh(img)
    return ImageResponse(id=img.id, file_path=img.file_path, mime_type=img.mime_type, file_size=img.file_size)


@router.delete("/{image_id}")
def delete_image(image_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    img = db.query(QuestionImage).filter(QuestionImage.id == image_id).first()
    if not img: raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail={"code": "NOT_FOUND", "message": "图片不存在"})
    filepath = os.path.join(UPLOAD_DIR, img.file_path.replace("/uploads/", ""))
    if os.path.exists(filepath): os.remove(filepath)
    db.delete(img)
    db.commit()
    return {"message": "已删除"}
```

**注册路由到 `main.py`：**
```python
from app.routers import images as images_router
app.include_router(images_router.router)
```

**验证步骤：**
```bash
# 上传图片
curl -X POST http://localhost:8000/api/v1/images/upload \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@/path/to/test.jpg"
# 应返回 {"id": 1, "file_path": "/uploads/temp/xxx.jpg", ...}
```

---

### 任务 13：前端错题服务 API

**文件：** `frontend/src/services/questions.ts`

```typescript
import api from './api'
import type { Question, PaginatedResponse } from '../types'

export interface QuestionListParams {
  page?: number; page_size?: number; subject?: string; tag?: string
  error_type?: string; status?: string; sort_by?: string; sort_order?: string
}

export interface CreateQuestionData {
  question_content?: string; subject?: string; tags?: string[]
  error_type?: string; difficulty?: number; source?: string
  correct_solution?: string; user_analysis?: string; image_ids?: number[]
}

export const questionApi = {
  list: (params?: QuestionListParams) => api.get<PaginatedResponse<Question>>('/questions', { params }),
  get: (id: number) => api.get<Question>(`/questions/${id}`),
  create: (data: CreateQuestionData) => api.post<Question>('/questions', data),
  update: (id: number, data: Partial<CreateQuestionData>) => api.put<Question>(`/questions/${id}`, data),
  delete: (id: number) => api.delete(`/questions/${id}`),
  uploadImage: (file: File) => {
    const fd = new FormData(); fd.append('file', file)
    return api.post<{ id: number; file_path: string; mime_type: string; file_size: number }>('/images/upload', fd)
  },
}
```

---

### 任务 14：前端错题录入页

**文件：** `frontend/src/features/questions/QuestionNewPage.tsx`

```tsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { questionApi } from '../../services/questions'
import { useToastStore } from '../../stores/toastStore'

const ERROR_TYPES = ['概念不清', '审题错误', '计算失误', '知识遗忘', '其他']
const SUBJECTS = ['数学', '物理', '化学', '英语', '语文', '其他']

export default function QuestionNewPage() {
  const [form, setForm] = useState({
    question_content: '', subject: '', tags: '', error_type: '', difficulty: 3, source: '',
    correct_solution: '', user_analysis: '',
  })
  const [images, setImages] = useState<{ id: number; file_path: string }[]>([])
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const navigate = useNavigate()
  const addToast = useToastStore((s) => s.addToast)

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const { data } = await questionApi.uploadImage(file)
      setImages((prev) => [...prev, data])
    } catch { addToast('图片上传失败', 'error') }
    finally { setUploading(false) }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.question_content.trim()) { addToast('请输入题目内容', 'error'); return }
    setSaving(true)
    try {
      await questionApi.create({
        ...form,
        tags: form.tags.split(/[,，\s]+/).filter(Boolean),
        image_ids: images.map((i) => i.id),
      })
      addToast('保存成功', 'success')
      navigate('/questions')
    } catch { addToast('保存失败', 'error') }
    finally { setSaving(false) }
  }

  return (
    <div className="pb-8">
      <h1 className="text-lg font-bold text-gray-800 mb-4">新增错题</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* 图片上传 */}
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <label className="text-sm font-medium text-gray-700 mb-2 block">图片</label>
          <div className="flex gap-2 overflow-x-auto pb-2">
            {images.map((img) => (
              <img key={img.id} src={img.file_path} className="w-20 h-20 rounded-lg object-cover flex-shrink-0" alt="" />
            ))}
            <label className="w-20 h-20 rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center text-2xl text-gray-400 cursor-pointer flex-shrink-0">
              {uploading ? '⏳' : '+'}
              <input type="file" accept="image/*" capture="environment" onChange={handleImageUpload} className="hidden" />
            </label>
          </div>
        </div>

        {/* 学科与错误类型 */}
        <div className="grid grid-cols-2 gap-3">
          <select value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} className="w-full px-3 py-3 border border-gray-300 rounded-xl text-base">
            <option value="">选择学科</option>
            {SUBJECTS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={form.error_type} onChange={(e) => setForm({ ...form, error_type: e.target.value })} className="w-full px-3 py-3 border border-gray-300 rounded-xl text-base">
            <option value="">错误类型</option>
            {ERROR_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>

        {/* 知识点标签 */}
        <input type="text" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="知识点标签（用逗号分隔）" className="w-full px-4 py-3 border border-gray-300 rounded-xl text-base" />

        {/* 难度 */}
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" onClick={() => setForm({ ...form, difficulty: n })}
              className={`flex-1 py-2 rounded-lg text-center ${form.difficulty >= n ? 'bg-yellow-400 text-white' : 'bg-gray-100 text-gray-400'}`}
            >★</button>
          ))}
        </div>

        {/* 题目来源 */}
        <input type="text" value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} placeholder="题目来源（如：2024高考真题）" className="w-full px-4 py-3 border border-gray-300 rounded-xl text-base" />

        {/* 题目内容 */}
        <textarea value={form.question_content} onChange={(e) => setForm({ ...form, question_content: e.target.value })} placeholder="题目内容（支持 Markdown）" rows={5} className="w-full px-4 py-3 border border-gray-300 rounded-xl text-base resize-none" />

        {/* 正确解析 */}
        <textarea value={form.correct_solution} onChange={(e) => setForm({ ...form, correct_solution: e.target.value })} placeholder="正确解析（支持 LaTeX 公式）" rows={4} className="w-full px-4 py-3 border border-gray-300 rounded-xl text-base resize-none" />

        {/* 反思笔记 */}
        <textarea value={form.user_analysis} onChange={(e) => setForm({ ...form, user_analysis: e.target.value })} placeholder="个人反思笔记" rows={3} className="w-full px-4 py-3 border border-gray-300 rounded-xl text-base resize-none" />

        <button type="submit" disabled={saving} className="w-full py-3 bg-blue-600 text-white rounded-xl font-medium text-base disabled:opacity-50">
          {saving ? '保存中...' : '保存错题'}
        </button>
      </form>
    </div>
  )
}
```

**验证步骤：**
```bash
# 登录后访问 /questions/new
# 填写表单，上传图片，点击保存
# 应跳转错题列表页
```

---

### 任务 15：前端错题列表页

**文件：** `frontend/src/features/questions/QuestionListPage.tsx`

```tsx
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { questionApi } from '../../services/questions'
import type { Question } from '../../types'

export default function QuestionListPage() {
  const [questions, setQuestions] = useState<Question[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [subject, setSubject] = useState('')
  const pageSize = 20

  const load = async (p: number) => {
    setLoading(true)
    try {
      const { data } = await questionApi.list({ page: p, page_size: pageSize, subject: subject || undefined })
      setQuestions(data.data)
      setTotal(data.pagination.total)
    } finally { setLoading(false) }
  }

  useEffect(() => { load(1) }, [subject])

  const totalPages = Math.ceil(total / pageSize)

  return (
    <div className="pb-8">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-bold text-gray-800">我的错题</h1>
        <Link to="/questions/new" className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm">+ 新增</Link>
      </div>

      {/* 筛选 */}
      <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
        {['', '数学', '物理', '化学', '英语'].map((s) => (
          <button key={s} onClick={() => setSubject(s)}
            className={`px-3 py-1.5 rounded-full text-sm whitespace-nowrap ${subject === s ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}
          >{s || '全部'}</button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">{[1, 2, 3].map((i) => <div key={i} className="h-24 bg-gray-100 rounded-xl animate-pulse" />)}</div>
      ) : questions.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <div className="text-4xl mb-3">📭</div>
          <p>还没有错题</p>
          <Link to="/questions/new" className="text-blue-600 mt-2 inline-block">录入第一道错题</Link>
        </div>
      ) : (
        <div className="space-y-3">
          {questions.map((q) => (
            <Link key={q.id} to={`/questions/${q.id}`} className="block bg-white rounded-xl p-4 shadow-sm">
              <div className="flex items-start justify-between mb-1">
                <span className="text-sm text-blue-600 font-medium">{q.subject || '未分类'}</span>
                <span className="text-xs text-gray-400">{'★'.repeat(q.difficulty)}{'☆'.repeat(5 - q.difficulty)}</span>
              </div>
              <p className="text-gray-800 text-sm line-clamp-2">{q.question_content || '无题目内容'}</p>
              <div className="flex items-center gap-2 mt-2">
                {q.tags.map((t) => <span key={t} className="px-2 py-0.5 bg-blue-50 text-blue-600 rounded text-xs">{t}</span>)}
                {q.error_type && <span className="px-2 py-0.5 bg-red-50 text-red-500 rounded text-xs">{q.error_type}</span>}
              </div>
              <div className="text-xs text-gray-400 mt-2">{new Date(q.created_at).toLocaleDateString()}</div>
            </Link>
          ))}
        </div>
      )}

      {/* 分页 */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-2 mt-4">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <button key={p} onClick={() => setPage(p)}
              className={`w-8 h-8 rounded-full text-sm ${page === p ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}
            >{p}</button>
          ))}
        </div>
      )}
    </div>
  )
}
```

**验证步骤：**
```bash
# 登录后访问 /questions
# 应显示错题列表（或空状态）
# 点击新增 → 跳转录入页
# 创建错题后返回列表 → 应显示新创建的错题
```

---

### 任务 16：前端错题详情页

**文件：** `frontend/src/features/questions/QuestionDetailPage.tsx`

```tsx
import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { questionApi } from '../../services/questions'
import type { Question } from '../../types'

export default function QuestionDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [question, setQuestion] = useState<Question | null>(null)
  const [loading, setLoading] = useState(true)
  const [showSolution, setShowSolution] = useState(false)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    questionApi.get(Number(id)).then(({ data }) => setQuestion(data)).finally(() => setLoading(false))
  }, [id])

  if (loading) return <div className="text-center py-20"><div className="animate-spin text-4xl">⏳</div></div>
  if (!question) return <div className="text-center py-20 text-gray-400">题目不存在</div>

  return (
    <div className="pb-8">
      <button onClick={() => navigate(-1)} className="text-blue-600 text-sm mb-4">← 返回</button>

      <div className="bg-white rounded-xl p-4 shadow-sm mb-4">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-sm text-blue-600 font-medium">{question.subject || '未分类'}</span>
          <span className="text-xs text-gray-400">{'★'.repeat(question.difficulty)}</span>
          {question.error_type && <span className="px-2 py-0.5 bg-red-50 text-red-500 rounded text-xs ml-auto">{question.error_type}</span>}
        </div>
        {question.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-3">
            {question.tags.map((t) => <span key={t} className="px-2 py-0.5 bg-blue-50 text-blue-600 rounded text-xs">{t}</span>)}
          </div>
        )}
        {question.images.length > 0 && (
          <div className="flex gap-2 overflow-x-auto mb-3">
            {question.images.map((img) => <img key={img.id} src={img.file_path} className="h-48 rounded-lg" alt="" />)}
          </div>
        )}
        <div className="text-gray-800 whitespace-pre-wrap text-base leading-relaxed">{question.question_content}</div>
      </div>

      {/* 解析 */}
      <div className="bg-white rounded-xl p-4 shadow-sm mb-4">
        <button onClick={() => setShowSolution(!showSolution)} className="flex items-center justify-between w-full text-left">
          <span className="font-medium text-gray-700">正确解析</span>
          <span className="text-gray-400">{showSolution ? '▲' : '▼'}</span>
        </button>
        {showSolution && (
          <div className="mt-3 text-gray-700 whitespace-pre-wrap text-base leading-relaxed border-t pt-3">
            {question.correct_solution || '暂无解析'}
          </div>
        )}
      </div>

      {/* 反思笔记 */}
      {question.user_analysis && (
        <div className="bg-yellow-50 rounded-xl p-4 shadow-sm">
          <div className="font-medium text-gray-700 mb-2">📝 反思笔记</div>
          <div className="text-gray-700 whitespace-pre-wrap text-sm">{question.user_analysis}</div>
        </div>
      )}

      <div className="text-xs text-gray-400 text-center mt-4">
        创建于 {new Date(question.created_at).toLocaleString()}
      </div>
    </div>
  )
}
```

**验证步骤：**
```bash
# 登录后点击错题列表中的某道题
# 应显示题目详情、标签、图片
# 点击"正确解析" → 展开/折叠解析内容
```

---

### 任务 17：Nginx 配置 + 部署脚本

**文件：** `nginx.conf`

```nginx
server {
    listen 80;
    server_name _;

    root /Users/doudou_files/Claude/mistake_notebook/frontend/dist;
    index index.html;

    # API 反向代理
    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 60s;
    }

    # 上传图片
    location /uploads/ {
        alias /Users/doudou_files/Claude/mistake_notebook/backend/uploads/;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    # 拒绝数据库文件
    location ~ \.db$ { deny all; return 404; }

    # SPA 路由
    location / { try_files $uri $uri/ /index.html; }
}
```

**文件：** `deploy.sh`

```bash
#!/bin/bash
set -e
PROJECT_DIR="/Users/doudou_files/Claude/mistake_notebook"
cd "$PROJECT_DIR"
export $(grep -v '^#' .env 2>/dev/null | xargs)

echo "=== 1. 构建前端 ==="
cd frontend
npm install --silent
npm run build
echo "前端构建完成"

echo "=== 2. 启动后端 ==="
cd "$PROJECT_DIR/backend"
source venv/bin/activate 2>/dev/null || python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt -q
uvicorn app.main:app --host 0.0.0.0 --port 8000 &
BACKEND_PID=$!
echo "后端 PID: $BACKEND_PID"

echo "=== 3. 启动 Nginx ==="
sudo nginx -t 2>/dev/null
sudo nginx -s reload 2>/dev/null || sudo nginx
echo "Nginx 已启动"

echo ""
echo "✅ 部署完成！"
echo "本机访问: http://localhost"
echo "局域网访问: http://$(ipconfig getifaddr en0 2>/dev/null || echo '查看路由器 IP')"
echo "首次使用: 访问 /register 创建管理员账号"
```

**文件：** `stop.sh`

```bash
#!/bin/bash
pkill -f "uvicorn app.main" 2>/dev/null && echo "后端已停止" || echo "后端未运行"
sudo nginx -s stop 2>/dev/null && echo "Nginx 已停止" || echo "Nginx 未运行"
echo "服务已全部停止"
```

**文件：** `.env.example`

```bash
JWT_SECRET=your-strong-jwt-secret-at-least-32-chars
DATABASE_URL=sqlite:///data/mistake_notebook.db
OCR_ENABLED=false
HOST=0.0.0.0
PORT=8000
```

---

## 验证清单

### 端到端测试

| 步骤 | 操作 | 预期结果 |
|------|------|---------|
| 1 | 访问 `http://localhost:3000` | 自动跳转 `/login` |
| 2 | 点击"注册账号" | 跳转 `/register` |
| 3 | 先输入短用户名 | 显示"用户名至少3个字符" |
| 4 | 输入密码不匹配 | 显示"两次密码不一致" |
| 5 | 正确填写注册 | 显示"注册成功"，跳转 `/login` |
| 6 | 输入刚注册的用户名密码登录 | 跳转首页，显示仪表盘 |
| 7 | 点击底部"录入"Tab | 显示错题录入表单 |
| 8 | 填写题目内容，上传图片，选学科/标签/难度，点击保存 | 跳转错题列表 |
| 9 | 列表显示刚创建的错题 | 卡片显示学科、标签、难度 |
| 10 | 点击错题卡片 | 进入详情页，显示完整内容 |
| 11 | 点击"正确解析" | 展开/折叠解析 |
| 12 | 刷新页面 | 保持登录状态（Token 持久化） |
| 13 | 手机浏览器访问 `http://<Mac mini IP>` | 显示移动端适配界面 |

---

*计划结束 — MVP-v1 共 17 个任务，预估 ~12h*