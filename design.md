# 智能错题本系统 — 设计文档

> 版本：v2.0
> 创建日期：2026-07-18
> 状态：设计阶段（已修复架构审查问题）

---

## 1. 项目概述

### 1.1 核心目标

构建一个基于知识图谱与 SM-2 遗忘曲线的智能错题管理系统。核心业务闭环：**多模态录入 → 结构化存储 → 智能复习调度 → 数据洞察反馈**。

### 1.2 技术栈

| 层级 | 技术 | 说明 |
|------|------|------|
| 前端 | React 18 + TypeScript + Vite | H5 页面，移动端优先 |
| UI 框架 | Tailwind CSS | 移动端适配，375px-480px 主设计基准 |
| 路由 | React Router v6 | 前端路由 |
| 状态管理 | Zustand | 轻量级，无 Provider 嵌套 |
| 图表 | ECharts | 移动端适配图表 |
| 公式渲染 | KaTeX | 轻量级 LaTeX 渲染 |
| 后端 | Python FastAPI | RESTful API |
| OCR | EasyOCR | 中英文识别（异步任务，避免阻塞） |
| 数据库 | SQLite（WAL 模式） | 单文件，零配置，Mac mini 部署首选 |
| 部署 | Nginx 反向代理 | Mac mini 原生部署 |

### 1.3 架构图

```
┌──────────────────────────────────────────────────┐
│           手机浏览器 / 移动端 H5                   │
│   iOS Safari · Android Chrome · 添加到桌面 PWA    │
│  ┌──────────────────────────────────────────────┐│
│  │         React SPA（移动端优先）               ││
│  │  ┌──────┐ ┌──────┐ ┌──────┐ ┌───────────┐  ││
│  │  │录入页│ │复习页│ │统计页│ │错题列表页  │  ││
│  │  └──┬───┘ └──┬───┘ └──┬───┘ └─────┬─────┘  ││
│  │     └────────┴────────┴────────────┘         ││
│  │         HTTP Client (Axios + 拦截器)          ││
│  └──────────────────────┬───────────────────────┘│
└─────────────────────────┼─────────────────────────┘
                          │ JSON API (API Key 认证)
                          ▼
┌──────────────────────────────────────────────────┐
│            FastAPI 后端 (Python)                   │
│  ┌──────────┐ ┌──────────┐ ┌──────────────────┐ │
│  │OCR 模块  │ │SM-2 引擎 │ │报表聚合服务      │ │
│  │EasyOCR   │ │复习调度  │ │数据分析          │ │
│  │异步任务  │ │          │ │                  │ │
│  └────┬─────┘ └────┬─────┘ └────────┬─────────┘ │
│       └────────────┴────────────────┘            │
│      SQLAlchemy ORM + Alembic 迁移管理           │
└──────────────────────┬───────────────────────────┘
                       │
                       ▼
              ┌──────────────────────┐
              │ SQLite (WAL 模式)      │
              │  → PostgreSQL (生产)   │
              └──────────────────────┘
```

---

## 2. 数据模型设计（修正版）

### 设计原则
- ✅ 所有表包含 `user_id`，支持多用户扩展（即使 MVP 默认 user_id=1）
- ✅ 建立关联表替代 JSON 字段，满足第一范式，支持索引和约束
- ✅ questions 表冗余存储当前 SM-2 状态，避免全表扫描历史记录
- ✅ 定义明确的 ER 关系和级联删除策略

### 2.1 错题表 (questions)

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | 自增主键 |
| user_id | INTEGER FK | 用户 ID（默认 1，多用户扩展基础） |
| question_content | TEXT | 题目原文（Markdown 格式） |
| subject | TEXT | 学科分类 |
| error_type | TEXT | 错误类型：概念不清/审题错误/计算失误/知识遗忘/其他 |
| difficulty | INTEGER | 难度评级 1-5 |
| source | TEXT | 题目来源/试卷名称 |
| correct_solution | TEXT | 标准解析（Markdown 支持 LaTeX） |
| user_analysis | TEXT | 个人反思笔记 |
| status | TEXT | 状态：active/archived |
| current_ef | REAL | 当前 SM-2 易度因子（初始 2.5） |
| current_interval | INTEGER | 当前 SM-2 间隔天数（初始 0） |
| current_rep_count | INTEGER | 当前 SM-2 连续正确次数（初始 0） |
| next_review_date | DATETIME | 下次复习日期 |
| created_at | DATETIME | 创建时间 |
| updated_at | DATETIME | 更新时间 |

### 2.2 错题-图片关联表 (question_images)

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | 自增主键 |
| question_id | INTEGER FK | 关联错题 ID（ON DELETE CASCADE） |
| file_path | TEXT | 文件路径，如 `/uploads/questions/{qid}/{ts}_{name}` |
| original_name | TEXT | 原始文件名 |
| file_size | INTEGER | 文件大小（bytes） |
| mime_type | TEXT | 媒体类型（image/jpeg / image/png / image/webp） |
| sort_order | INTEGER | 排序序号 |
| created_at | DATETIME | 创建时间 |

### 2.3 错题-知识点关联表 (question_tags)

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | 自增主键 |
| question_id | INTEGER FK | 关联错题 ID（ON DELETE CASCADE） |
| tag_name | TEXT | 知识点名称（如"三角函数"） |
| created_at | DATETIME | 创建时间 |

> 索引：`UNIQUE(question_id, tag_name)`，`INDEX(tag_name)`

### 2.4 复习记录表 (reviews)

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | 自增主键 |
| question_id | INTEGER FK | 关联错题 ID（ON DELETE CASCADE） |
| user_id | INTEGER FK | 用户 ID |
| review_date | DATETIME | 复习日期 |
| quality | INTEGER | 评分 0-5（Again/Hard/Medium/Good/VeryGood/Easy） |
| ef_before | REAL | 复习前的 EF 值（用于历史追溯） |
| ef_after | REAL | 复习后的 EF 值 |
| interval_before | INTEGER | 复习前的间隔天数 |
| interval_after | INTEGER | 复习后的间隔天数 |
| created_at | DATETIME | 创建时间 |

### 2.5 知识点掌握度表 (knowledge_mastery)

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | 自增主键 |
| user_id | INTEGER FK | 用户 ID |
| tag_name | TEXT | 知识点名称 |
| error_count | INTEGER | 错误次数 |
| total_count | INTEGER | 总出现次数 |
| mastery_level | REAL | 掌握度 0.0-1.0（基于 SM-2 EF 映射） |
| last_error_time | DATETIME | 最近错误时间 |
| updated_at | DATETIME | 更新时间 |

> 掌握度计算公式：`mastery = min(1.0, max(0.0, (current_ef - 1.3) / 2.0))`，其中 current_ef 取该知识点下所有错题的平均 EF

### 2.6 变式题库表 (variant_questions)

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | 自增主键 |
| source_question_id | INTEGER FK | 源错题 ID（直接关联至某道错题） |
| question_content | TEXT | 题目内容 |
| correct_solution | TEXT | 解析 |
| difficulty | INTEGER | 难度 1-5 |
| source | TEXT | 来源 |
| created_at | DATETIME | 创建时间 |

### 2.7 用户表 (users)

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | 自增主键 |
| username | TEXT | 用户名（唯一） |
| password_hash | TEXT | bcrypt 密码哈希 |
| display_name | TEXT | 显示名称 |
| created_at | DATETIME | 创建时间 |
| updated_at | DATETIME | 更新时间 |

### 2.8 会话黑名单表 (token_blacklist)

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | 自增主键 |
| jti | TEXT | JWT ID（唯一） |
| expires_at | DATETIME | Token 过期时间 |
| blacklisted_at | DATETIME | 加入黑名单时间 |
| user_id | INTEGER FK | 用户 ID |

> 用于处理用户登出和密码修改后旧 Token 失效
| created_at | DATETIME | 创建时间 |

### 2.9 ER 关系

```
users 1 ──── * questions
users 1 ──── * reviews
users 1 ──── * knowledge_mastery
users 1 ──── * token_blacklist

questions 1 ──── * question_images    (ON DELETE CASCADE)
questions 1 ──── * question_tags      (ON DELETE CASCADE)
questions 1 ──── * reviews            (ON DELETE CASCADE)
questions 1 ──── * variant_questions  (source_question_id)

question_tags * ──── * knowledge_mastery  (通过 tag_name 匹配)
```

---

## 3. API 接口设计（修正版）

### 设计原则
- ✅ 所有端点使用 `/api/v1/` 前缀，为后续版本兼容留空间
- ✅ 统一认证：所有请求需携带 `X-API-Key` Header
- ✅ 统一错误响应格式：`{"error": {"code": "ERROR_CODE", "message": "描述", "details": {}}}`
- ✅ 统一分页响应格式：`{"data": [...], "pagination": {"page": 1, "page_size": 20, "total": 150, "total_pages": 8}}`
- ✅ 使用查询参数代替特殊路径端点（消灭 `/today`、`/daily` 等）

### 3.1 认证

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/v1/auth/register | 注册账号（首次部署时注册管理员） |
| POST | /api/v1/auth/login | 登录，返回 JWT Token |
| POST | /api/v1/auth/logout | 登出，将当前 Token 加入黑名单 |
| POST | /api/v1/auth/refresh | 刷新 Token |
| GET | /api/v1/auth/me | 获取当前用户信息（验证 Token 有效性） |
| GET | /api/v1/auth/health | 健康检查（无需认证） |

**认证方式：**
- 所有 API 端点（除 `/auth/health`、`/auth/login`、`/auth/register`）需在请求头携带 `Authorization: Bearer <jwt_token>`
- Token 使用 HS256 签名，JWT_SECRET 从环境变量读取
- Token 有效期：Access Token 24 小时，Refresh Token 7 天
- 登出时将 Token 的 jti 加入黑名单表，防止重复使用

**注册请求体：**
```json
{
  "username": "admin",
  "password": "your-password",
  "display_name": "管理员"
}
```

**登录请求体：**
```json
{
  "username": "admin",
  "password": "your-password"
}
```

**登录响应体：**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIs...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIs...",
  "token_type": "bearer",
  "expires_in": 86400,
  "user": {
    "id": 1,
    "username": "admin",
    "display_name": "管理员"
  }
}
```

**刷新 Token 请求体：**
```json
{
  "refresh_token": "eyJhbGciOiJIUzI1NiIs..."
}
```

**JWT Payload 结构：**
```json
{
  "sub": 1,
  "username": "admin",
  "jti": "uuid-v4",
  "type": "access",
  "exp": 1690000000,
  "iat": 1689913600
}
```

### 3.2 OCR 相关

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/v1/ocr/recognize | 上传图片识别文本（支持 multipart 文件上传和 base64 两种方式） |

**OCR 请求体（multipart/form-data）：**
```
file: <binary image data>
```

**OCR 请求体（application/json）：**
```json
{
  "image": "base64_encoded_string",
  "filename": "optional_name.jpg"
}
```

**OCR 响应体（异步任务模式）：**
```json
{
  "task_id": "uuid",
  "status": "processing",
  "estimated_seconds": 5
}
```

**OCR 结果查询：**
```
GET /api/v1/ocr/status/{task_id}
```

**OCR 响应体（完成时）：**
```json
{
  "task_id": "uuid",
  "status": "completed",
  "result": {
    "text": "识别出的文本内容",
    "confidence": 0.95
  }
}
```

> 使用 FastAPI BackgroundTasks 或简单队列异步处理 OCR，避免阻塞请求线程。EasyOCR 模型加载在首次请求时完成，后续请求复用已加载模型。

### 3.3 错题管理

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/v1/questions | 获取错题列表（支持分页/筛选/排序） |
| POST | /api/v1/questions | 创建错题 |
| GET | /api/v1/questions/{id} | 获取单道错题详情 |
| PUT | /api/v1/questions/{id} | 更新错题 |
| DELETE | /api/v1/questions/{id} | 删除错题（软删除） |

**查询参数：**
- `page` (int, default=1), `page_size` (int, default=20, max=100)
- `subject` — 学科筛选
- `tag` — 知识点标签筛选（通过 question_tags 关联表查询）
- `error_type` — 错误类型筛选
- `status` — 状态筛选（active/archived）
- `next_review_before` — 筛选 next_review_date 在指定日期前的题目（替代 `/today` 端点）
- `sort_by` — 排序字段（created_at / difficulty / next_review_date / error_count）
- `sort_order` — 排序方向（asc / desc）

**分页响应格式：**
```json
{
  "data": [
    {
      "id": 1,
      "question_content": "题目原文",
      "subject": "数学",
      "tags": ["三角函数", "正弦定理"],
      "images": [
        {"id": 1, "file_path": "/uploads/...", "mime_type": "image/jpeg"}
      ],
      "error_type": "概念不清",
      "difficulty": 4,
      "source": "2024高考数学真题",
      "status": "active",
      "next_review_date": "2026-07-20",
      "current_ef": 2.5,
      "created_at": "2026-07-18T10:00:00"
    }
  ],
  "pagination": {
    "page": 1,
    "page_size": 20,
    "total": 150,
    "total_pages": 8
  }
}
```

**创建错题请求体：**
```json
{
  "question_content": "题目原文",
  "subject": "数学",
  "tags": ["三角函数", "正弦定理"],
  "error_type": "概念不清",
  "difficulty": 4,
  "source": "2024高考数学真题",
  "correct_solution": "标准解析",
  "user_analysis": "反思笔记",
  "image_ids": [1, 2, 3]
}
```

### 3.4 图片上传

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/v1/images/upload | 上传图片，返回文件信息 |

**请求体（multipart/form-data）：** `file: <binary>`

**响应体：**
```json
{
  "id": 1,
  "file_path": "/uploads/questions/0/1690000000.jpg",
  "mime_type": "image/jpeg",
  "file_size": 102400
}
```

> 图片上传后先存入 `uploads/temp/` 目录，关联到错题后移动到 `uploads/questions/{question_id}/`。未关联的临时图片由定时任务清理（保留 24h）。
> 文件校验：仅允许 `image/jpeg`、`image/png`、`image/webp`，最大 10MB。前端上传前 Canvas 压缩至 1920px 宽。

| 方法 | 路径 | 说明 |
|------|------|------|
| DELETE | /api/v1/images/{id} | 删除图片（级联删除文件） |

### 3.5 复习管理

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/v1/reviews/daily | 获取今日复习任务列表（带排序） |
| POST | /api/v1/reviews | 提交复习结果（更新 SM-2 状态 + 写入 reviews 历史） |
| GET | /api/v1/reviews/history/{question_id} | 获取某道题的复习历史 |

**获取今日复习任务：**
```
GET /api/v1/questions?next_review_before=2026-07-18&status=active&sort_by=next_review_date&sort_order=asc&page_size=20
```

**提交复习请求体：**
```json
{
  "question_id": 1,
  "quality": 4
}
```
> quality: 0=Again, 1=Hard, 2=Medium, 3=Good, 4=VeryGood, 5=Easy

**提交复习响应体：**
```json
{
  "question_id": 1,
  "quality": 4,
  "next_review_date": "2026-07-25",
  "current_ef": 2.65,
  "current_interval": 7
}
```

### 3.6 知识点与统计

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/v1/knowledge/mastery | 获取知识点掌握度分布（雷达图数据） |
| GET | /api/v1/knowledge/heatmap | 近30天错题热力图数据 |
| GET | /api/v1/statistics/overview | 总览统计（错题总数、待复习数、复习完成率等） |
| GET | /api/v1/statistics/report | 生成学情报告 |
| GET | /api/v1/statistics/trends | 错题趋势数据（日/周/月粒度） |

### 3.7 变式题

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/v1/variants/{question_id} | 获取某道错题的变式题推荐（基于同知识点标签匹配） |

**推荐逻辑：**
1. 查询源错题的 `question_tags` 获取所有 tag_name
2. 查询 `variant_questions` 中 `source_question_id != 当前题` 且 `tag_name` 匹配的题目
3. 排除已掌握（mastery_level > 0.9）的知识点对应题目
4. 按难度匹配度排序，返回 3-5 道

### 3.8 导出

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/v1/export/pdf | 生成错题 PDF（查询参数传入筛选条件，幂等可缓存） |
| POST | /api/v1/export/share-link | 生成分享链接（带过期时间） |

**PDF 导出请求参数：**
```
GET /api/v1/export/pdf?question_ids=1,2,3&include_solution=true
```

**分享链接请求体：**
```json
{
  "question_ids": [1, 2, 3],
  "expire_hours": 72
}
```

**分享链接响应体：**
```json
{
  "share_url": "https://your-domain.com/share/abc123def456",
  "expires_at": "2026-07-21T10:00:00"
}
```

> 分享 Token 使用 `secrets.token_urlsafe(32)` 生成，存储在数据库时 SHA-256 哈希，防止 Token 泄露后伪造。

### 3.9 统一错误响应

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "题目不存在",
    "details": {
      "question_id": 999
    }
  }
}
```

| HTTP 状态码 | error.code | 说明 |
|-------------|-----------|------|
| 400 | VALIDATION_ERROR | 参数校验失败 |
| 401 | UNAUTHORIZED | Token 无效、过期或未提供 |
| 401 | TOKEN_BLACKLISTED | Token 已被登出 |
| 401 | INVALID_CREDENTIALS | 用户名或密码错误 |
| 403 | FORBIDDEN | 无权限访问（非本人数据） |
| 404 | NOT_FOUND | 资源不存在 |
| 409 | CONFLICT | 数据冲突（如用户名已存在） |
| 413 | FILE_TOO_LARGE | 文件过大 |
| 415 | UNSUPPORTED_MEDIA_TYPE | 不支持的图片格式 |
| 500 | INTERNAL_ERROR | 服务器内部错误 |
| 503 | SERVICE_UNAVAILABLE | 服务暂时不可用（如 OCR 繁忙） |

---

## 4. 前端路由设计

```
/                    → 首页（仪表盘）
/login               → 登录页（用户名 + 密码）
/register            → 注册页（首次设置管理员账号）

/questions           → 错题列表
/questions/new       → 新增错题（OCR 录入 + 手动录入）
/questions/:id       → 错题详情
/questions/:id/edit  → 编辑错题

/review              → 今日复习
/review/complete     → 复习完成页

/statistics          → 数据统计与学情报告

/settings            → 设置（主题切换等）
```

---

## 5. 前端组件树（修正版）

```
App
├── Providers
│   ├── AuthProvider (JWT Token 管理)
│   └── RouterProvider
│
├── Layout
│   ├── Header (导航栏 + 移动端汉堡菜单)
│   ├── Sidebar (桌面端侧边导航)
│   └── MainContent
│
├── Pages
│   ├── Login (登录页)
│   │   ├── Logo (应用 Logo + 标题)
│   │   ├── LoginForm (用户名 + 密码表单)
│   │   │   ├── UsernameInput
│   │   │   ├── PasswordInput
│   │   │   └── LoginButton (含加载状态)
│   │   ├── ErrorMessage (登录失败提示)
│   │   └── RegisterLink (注册入口)
│   │
│   ├── Register (注册页)
│   │   ├── RegisterForm (用户名 + 密码 + 确认密码)
│   │   └── SuccessMessage (注册成功提示 + 跳转登录)
│   │
│   ├── Dashboard (首页仪表盘)
│   │   ├── TodayReviewCard (今日待复习数量)
│   │   ├── RecentErrors (近期错误 Top5)
│   │   └── MasteryRadar (掌握度雷达图)
│   │
│   ├── QuestionList (错题列表)
│   │   ├── SearchBar (搜索 + 筛选)
│   │   ├── FilterPanel (学科/知识点/错误类型筛选)
│   │   ├── QuestionCard (错题卡片)
│   │   └── Pagination (分页组件)
│   │
│   ├── QuestionNew (新增错题)
│   │   ├── OCRUploader (图片上传/拍照)
│   │   │   ├── ImagePreview (图片预览)
│   │   │   ├── OCRTaskStatus (OCR 处理状态追踪)
│   │   │   └── OCRResultEditor (OCR 结果编辑)
│   │   ├── ManualInput (手动录入)
│   │   └── QuestionForm (结构化表单)
│   │       ├── SubjectSelector (学科选择)
│   │       ├── KnowledgeTagInput (知识点标签)
│   │       ├── ErrorTypeSelector (错误类型)
│   │       ├── DifficultyRating (难度评级)
│   │       ├── SolutionEditor (解析编辑器 - 支持 LaTeX)
│   │       └── AnalysisEditor (反思笔记)
│   │
│   ├── QuestionDetail (错题详情)
│   │   ├── QuestionContent (题目展示 + 图片轮播)
│   │   ├── SolutionPanel (解析面板 - 可折叠)
│   │   ├── ReviewHistory (复习历史时间线)
│   │   └── VariantQuestions (变式题推荐)
│   │
│   ├── Review (今日复习)
│   │   ├── ReviewCard (复习卡片)
│   │   │   ├── QuestionDisplay (题目展示)
│   │   │   ├── AnswerToggle (遮挡/显示答案)
│   │   │   └── QualityFeedback (掌握度反馈 0-5 六档)
│   │   ├── ReviewProgress (复习进度条 + 剩余数量)
│   │   └── ReviewComplete (复习完成页 - 统计本次复习)
│   │
│   └── Statistics (数据统计)
│       ├── TrendChart (错题趋势折线图)
│       ├── ErrorTypePie (错误类型饼图)
│       ├── KnowledgeRadar (知识点雷达图)
│       ├── Heatmap (近30天错题热力图)
│       └── ReportCard (学情报告 - 含改进建议)
│
└── Shared Components
    ├── Loading (加载状态 - 骨架屏)
    ├── ErrorBoundary (错误边界 - 降级 UI)
    ├── EmptyState (空状态 - 含引导操作)
    ├── ConfirmDialog (确认弹窗)
    ├── Toast (消息提示 - 成功/错误/警告)
    ├── FormField (表单字段组件 - 含校验错误展示)
    ├── OfflineBanner (离线提示横幅)
    └── Pagination (分页组件)
```

---

## 6. 核心算法：SM-2 复习调度（修正版）

### 6.1 修正说明
原设计 v1.0 中 quality 评分区间为 0-3，但 EF 公式使用 `(5 - q)`，导致 Easy 评分反而降低 EF 值。**这是一个严重 Bug**。

**修正方案：** 将 quality 改为 0-5 六档制，与原始 SM-2 论文的评分区间对齐。

### 6.2 算法参数

| 参数 | 初始值 | 说明 |
|------|--------|------|
| easiness_factor | 2.5 | 易度因子，最小值 1.3 |
| interval | 0 | 当前间隔天数 |
| repetition_count | 0 | 连续正确次数 |

### 6.3 评分映射（六档制）

| 评分 | 标签 | 说明 | 重置间隔 | EF 调整 |
|------|------|------|---------|---------|
| 0 | Again | 完全不记得 | interval=1, rep=0 | EF -= 0.2 |
| 1 | Hard | 答错但有点印象 | interval=1, rep=0 | EF -= 0.15 |
| 2 | Medium | 答错但接近正确 | interval=1, rep=0 | EF -= 0.1 |
| 3 | Good | 答对，但有些迟疑 | 正常间隔递增 | EF 不变 |
| 4 | VeryGood | 答对，比较流畅 | 正常间隔递增 | EF += 0.1 |
| 5 | Easy | 完全掌握 | 额外 +1 天 | EF += 0.15 |

### 6.4 EF 计算公式（原始 SM-2 论文公式）

```
EF' = EF + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))
EF' = max(1.3, EF')
```

其中 q ∈ [0, 5]，为整数。

### 6.5 间隔计算

```
若 rep == 0: interval = 1
若 rep == 1: interval = 6
否则:        interval = round(interval * EF)
```

### 6.6 状态更新流程

每次提交复习结果时，后端同步执行：
1. 读取 `questions` 表当前 SM-2 状态（current_ef, current_interval, current_rep_count）
2. 根据 quality 计算新的 EF、间隔、重复次数
3. 将**旧状态**和**新状态**写入 `reviews` 表（历史记录）
4. 更新 `questions` 表的 `current_ef`、`current_interval`、`current_rep_count`、`next_review_date`

所有操作在**同一个数据库事务**中完成，保证数据一致性。

### 6.7 每日复习队列生成策略

1. **筛选条件：** `next_review_date <= TODAY() AND status = 'active'`
2. **排序策略：** 按紧急度分数降序
3. **紧急度公式：**
   ```
   urgency = (逾期天数 × 0.5) + (难度 × 0.3) + ((1 - 当前掌握度) × 0.2)
   ```
4. **每日上限：** 默认 20 道（用户可配置），超过上限的题目顺延至次日
5. **前端增量加载：** 支持分页获取复习任务，每次加载 10 道

---

## 7. 安全设计

### 7.1 JWT 认证
- 所有 API 端点（除 `/api/v1/auth/health`、`/api/v1/auth/login`、`/api/v1/auth/register`）需携带 `Authorization: Bearer <jwt_token>` Header
- JWT 使用 HS256 签名，密钥通过环境变量 `JWT_SECRET` 配置
- Access Token 有效期 24 小时，Refresh Token 有效期 7 天
- 登出时 Token 的 jti 加入黑名单表，防止重复使用
- 密码使用 bcrypt 哈希存储，不存明文

### 7.2 路由守卫（前端）
- 未登录（无有效 Token）→ 重定向到 `/login`
- Token 过期 → 自动尝试 Refresh Token → 刷新成功则继续，失败则跳转 `/login`
- API 返回 401 → 清除 localStorage 中的 Token → 跳转 `/login`

### 7.3 首次部署流程
```
首次访问 /register → 注册管理员账号
    → 后端创建用户 + 写入 bcrypt 哈希
    → 跳转 /login → 输入用户名密码 → 获取 JWT Token
    → 存入 localStorage → 跳转首页
```

### 7.2 文件上传安全
- 仅允许 MIME 类型：`image/jpeg`、`image/png`、`image/webp`
- 单文件最大 10MB，单次请求最大 50MB
- 文件名使用 `{timestamp}_{uuid}` 重命名，防止路径遍历攻击
- 上传目录与静态文件目录严格分离

### 7.3 数据库安全
- SQLite 数据库文件存储在 `backend/data/` 目录
- Nginx 配置明确拒绝访问 `*.db` 文件

### 7.4 分享安全
- 分享 Token 使用 `secrets.token_urlsafe(32)` 生成
- 数据库中存储 Token 的 SHA-256 哈希值
- 支持设置过期时间，过期后自动失效
- 支持手动撤销分享链接

### 7.5 Nginx 安全配置（示例）

```nginx
# 拒绝访问数据库文件
location ~ \.db$ {
    deny all;
    return 404;
}

# 拒绝敏感文件
location ~ /\. {
    deny all;
}

# 上传文件目录
location /uploads/ {
    alias /app/uploads/;
    expires 30d;
    add_header Cache-Control "public, immutable";
}
```

---

## 8. 移动端适配策略（H5 移动优先）

### 8.1 设计理念

**移动优先（Mobile First）**，以 iPhone 17 Pro Max（430px）和小米14 Pro（480px）为主设计基准，渐进增强至平板和桌面。

### 8.2 目标设备适配

| 设备 | 屏幕宽度 | 设计基准 | 适配策略 |
|------|---------|---------|---------|
| iPhone 17 Pro Max | ~430px | ✅ 主基准 | 字体 16px，触摸目标 48px |
| 小米14 Pro | ~480px | ✅ 主基准 | 与 iPhone 尺寸接近，统一适配 |
| iPhone 标准版 | ~390px | 向下兼容 | 流式收缩，间距缩减 |
| 其他 Android | 360-480px | 流式自适应 | flex 布局 + 百分比宽度 |
| iPad | 768-1024px | 增强布局 | 双列 + 侧边栏 |
| Mac mini 桌面 | >1024px | 增强布局 | 三列 + 完整侧边栏 |

### 8.3 移动端断点

| 断点 | 宽度 | 布局 | 设计基准 |
|------|------|------|---------|
| xs | < 375px | 小屏手机：紧凑布局 | 向下兼容 |
| sm | 375-480px | 主流手机：标准布局 | 📱 主设计基准 |
| md | 480-768px | 大屏手机/小平板：宽松布局 | 间距增大 |
| lg | 768-1024px | 平板：双列 + 侧边栏 | 侧边导航 |
| xl | > 1024px | 桌面：三列 + 完整布局 | 最大内容区 1200px |

### 8.4 移动端专项优化

- **触摸优化**：按钮最小尺寸 48×48px（比标准 44px 更大），间距 16px 以上
- **安全区域**：适配 iPhone 刘海屏/灵动岛，使用 `safe-area-inset-*` CSS 环境变量
- **底部导航**：固定底部 TabBar，5 个图标菜单（首页/录入/复习/统计/设置），适配 Home Indicator
- **拍照录入**：调用 `<input type="file" accept="image/*" capture="environment">` 直接调用相机
- **图片压缩**：上传前 Canvas 压缩至 1920px 宽，质量 0.8，减少移动网络上传耗时
- **下拉刷新**：错题列表支持下拉刷新（Pull-to-Refresh）
- **虚拟列表**：错题列表超过 50 条时启用虚拟滚动，保证流畅度
- **骨架屏**：页面加载时显示骨架屏（Skeleton Screen），避免白屏
- **离线提示**：网络不可用时显示离线 Banner，不影响已缓存内容的浏览
- **PWA**：manifest.json + Service Worker（Workbox），支持添加到桌面
- **Swipe 手势**：复习卡片使用 Framer Motion 的 `drag="x"` 配合 `onDragEnd` 实现滑动切换

### 8.3 PWA 离线策略

```
Service Worker 注册
    │
    ├── 预缓存: 应用 Shell (HTML/CSS/JS 核心资源)
    │
    ├── 运行时缓存 (Network First):
    │   ├── /api/v1/questions → 最近浏览的错题
    │   └── /uploads/ → 已加载的图片
    │
    └── 离线回退:
        ├── 网络不可用 → 使用缓存数据
        ├── 复习评分 → 暂存 IndexedDB，联网后同步
        └── 拍照录入 → 暂存 IndexedDB，联网后 OCR
```

---

## 9. 实施计划（MVP 分版本）

### 设计原则
- ✅ 按 MVP 版本拆分，每个版本独立可用
- ✅ 移动端优先，H5 页面适配 iPhone/Android 主流机型
- ✅ 数据库使用 SQLite（WAL 模式），零配置
- ✅ 每个版本包含测试任务
- ✅ 任务依赖关系合理，版本间可独立交付

---

### MVP-v1：基础框架 + 注册登录 + 错题 CRUD（~12h）

**目标：** 用户可注册登录、录入错题、浏览错题列表、查看错题详情

| 任务 | 预估 | 产出 |
|------|------|------|
| **1.1 项目脚手架** | 1h | Vite + React + TypeScript + Tailwind + FastAPI 项目结构 |
| **1.2 数据库模型定义** | 1h | SQLAlchemy 模型 + SQLite 初始化（WAL 模式） |
| **1.3 后端认证 API** | 1.5h | register / login / logout / refresh / me 端点 |
| **1.4 前端登录/注册页** | 1.5h | H5 适配的登录页 + 注册页（含表单校验） |
| **1.5 前端路由守卫** | 0.5h | JWT 拦截器 + 未登录跳转 + Token 刷新 |
| **1.6 错题 CRUD API** | 1.5h | 5 个 REST 端点（含分页/筛选/排序） |
| **1.7 图片上传 API** | 1h | 文件校验 + 存储 + 清理 |
| **1.8 错题录入页面** | 1.5h | H5 表单 + 图片上传 + 移动端键盘适配 |
| **1.9 错题列表页面** | 1h | 虚拟列表 + 下拉刷新 + 筛选 |
| **1.10 错题详情页面** | 0.5h | 详情展示 + 解析折叠 |
| **测试** | 1h | API 端点 + 前端功能验证 |
| **总计** | **~12h** | **MVP-v1 可用** |

**MVP-v1 交付物：**
- 用户注册/登录/登出
- 错题录入（文本 + 图片）
- 错题列表（分页 + 筛选 + 搜索）
- 错题详情查看
- 移动端 H5 适配（iPhone 17 Pro Max / 小米14 Pro）

---

### MVP-v2：智能复习引擎（~4h）

**目标：** 基于 SM-2 算法的复习调度，可交互复习

| 任务 | 预估 | 产出 |
|------|------|------|
| **2.1 SM-2 算法实现** | 0.5h | 纯 Python 实现，含单元测试 |
| **2.2 复习 API** | 1h | 今日任务 + 提交结果 + 事务更新 |
| **2.3 复习页面（H5）** | 2h | 复习卡片 + 答案遮挡/显示 + 六档评分 + 滑动切换 |
| **2.4 复习完成页** | 0.5h | 本次复习统计 + 掌握度变化 |
| **测试** | 0.5h | SM-2 算法验证 + 复习流程测试 |
| **总计** | **~4h** | **MVP-v2 可用** |

**MVP-v2 增量：**
- 每日复习任务自动生成
- 复习卡片交互（遮挡答案 + 六档评分）
- SM-2 算法调度复习间隔
- 复习历史记录

---

### MVP-v3：统计与可视化（~4h）

**目标：** 数据看板，掌握度雷达图、错题趋势、错误原因分布

| 任务 | 预估 | 产出 |
|------|------|------|
| **3.1 统计 API** | 1h | 趋势/归因/薄弱点聚合数据 |
| **3.2 知识点掌握度 API** | 0.5h | 掌握度计算公式 + 雷达图数据 |
| **3.3 首页仪表盘** | 1h | 今日待复习卡片 + 高频错误 Top5 + 雷达图 |
| **3.4 统计页面（H5）** | 1.5h | 趋势图 + 饼图 + 热力图 + 学情报告 |
| **测试** | 0.5h | 数据准确性验证 |
| **总计** | **~4h** | **MVP-v3 可用** |

**MVP-v3 增量：**
- 首页仪表盘
- 掌握度雷达图
- 错题趋势折线图
- 错误原因饼图
- 学情报告卡片（含改进建议）

---

### MVP-v4：增强功能（~4h）

**目标：** 变式题推荐、PDF 导出、分享链接

| 任务 | 预估 | 产出 |
|------|------|------|
| **4.1 EasyOCR 集成** | 1.5h | 异步 OCR 服务 + 前端状态追踪 |
| **4.2 变式题 API + 页面** | 1h | 推荐逻辑 + 错题详情页展示 |
| **4.3 PDF 导出服务** | 1h | 服务端生成 + 前端下载 |
| **4.4 分享链接** | 0.5h | Token 生成 + 验证 |
| **测试** | 0.5h | OCR 识别 + 导出验证 |
| **总计** | **~4h** | **MVP-v4 可用** |

**MVP-v4 增量：**
- EasyOCR 拍照识别
- 同知识点变式题推荐
- 错题 PDF 导出
- 分享链接生成

---

### 总路线图

```
MVP-v1 ──→ MVP-v2 ──→ MVP-v3 ──→ MVP-v4
 基础     智能复习    数据分析    增强功能
  ~12h      ~4h        ~4h        ~4h
  ↓         ↓          ↓          ↓
 可录入    可复习     可分析     可导出
 可浏览    可调度     可看报告   可分享
```

| 版本 | 主要功能 | 预估 | 累计 | 可交付价值 |
|------|---------|------|------|-----------|
| MVP-v1 | 注册登录 + 错题 CRUD + 图片 | 12h | 12h | 开始使用 |
| MVP-v2 | SM-2 复习 + 交互 | 4h | 16h | 智能复习 |
| MVP-v3 | 统计图表 + 学情报告 | 4h | 20h | 数据洞察 |
| MVP-v4 | OCR + 变式题 + PDF + 分享 | 4h | 24h | 完整功能 |

---

## 10. 项目目录结构

```
mistake_notebook/
├── frontend/                    # React 前端
│   ├── public/
│   │   ├── manifest.json        # PWA 配置
│   │   ├── sw.js                # Service Worker (Workbox)
│   │   └── icons/               # 应用图标
│   ├── src/
│   │   ├── components/          # 通用组件
│   │   │   ├── Layout/          # 布局组件
│   │   │   ├── Shared/          # 共享 UI 组件
│   │   │   └── Charts/          # 图表组件封装
│   │   ├── features/            # 按功能组织的页面组件
│   │   │   ├── dashboard/
│   │   │   ├── questions/
│   │   │   │   ├── list/
│   │   │   │   ├── new/
│   │   │   │   └── detail/
│   │   │   ├── review/
│   │   │   └── statistics/
│   │   ├── services/            # API 调用封装
│   │   │   ├── api.ts           # Axios 实例 + 拦截器
│   │   │   ├── questions.ts     # 错题相关 API
│   │   │   ├── reviews.ts       # 复习相关 API
│   │   │   ├── ocr.ts           # OCR 相关 API
│   │   │   └── statistics.ts    # 统计相关 API
│   │   ├── stores/              # Zustand 状态仓库
│   │   │   ├── authStore.ts
│   │   │   ├── questionStore.ts
│   │   │   └── reviewStore.ts
│   │   ├── hooks/               # 自定义 Hooks
│   │   ├── types/               # TypeScript 类型定义
│   │   │   └── generated/       # openapi-typescript 自动生成
│   │   ├── utils/               # 工具函数
│   │   ├── App.tsx              # 根组件 + 路由
│   │   └── main.tsx             # 入口
│   ├── package.json
│   ├── tsconfig.json
│   ├── tailwind.config.js
│   └── vite.config.ts
│
├── backend/                     # FastAPI 后端
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py              # 应用入口 + CORS + 中间件
│   │   ├── config.py            # 配置管理（环境变量）
│   │   ├── auth.py              # API Key 认证依赖项
│   │   ├── database.py          # 数据库连接 + Session 管理
│   │   ├── models.py            # SQLAlchemy 模型定义
│   │   ├── schemas.py           # Pydantic 请求/响应模型
│   │   ├── routers/             # 路由模块
│   │   │   ├── __init__.py
│   │   │   ├── auth.py
│   │   │   ├── questions.py
│   │   │   ├── images.py
│   │   │   ├── reviews.py
│   │   │   ├── ocr.py
│   │   │   ├── statistics.py
│   │   │   ├── variants.py
│   │   │   └── export.py
│   │   ├── services/            # 业务逻辑
│   │   │   ├── __init__.py
│   │   │   ├── sm2.py           # SM-2 算法（纯函数，可单元测试）
│   │   │   ├── ocr_service.py   # EasyOCR 封装（异步加载 + 推理）
│   │   │   ├── statistics.py    # 统计聚合服务
│   │   │   └── export_service.py # PDF 导出服务
│   │   ├── migrations/          # Alembic 迁移脚本
│   │   └── exceptions.py        # 统一异常处理
│   ├── data/                    # 数据库文件
│   │   └── .gitkeep
│   ├── uploads/                 # 图片存储目录
│   │   ├── temp/                # 临时上传目录
│   │   ├── questions/           # 按错题 ID 分组的图片
│   │   └── .gitkeep
│   ├── tests/                   # 测试文件
│   │   ├── test_sm2.py
│   │   ├── test_questions.py
│   │   ├── test_reviews.py
│   │   └── test_ocr.py
│   ├── requirements.txt
│   ├── Dockerfile
│   └── alembic.ini
│
├── nginx.conf                   # Nginx 反代 + 安全配置
├── docker-compose.yml           # 容器编排
├── .env.example                 # 环境变量模板（JWT_SECRET, DATABASE_URL 等）
├── Makefile                     # 常用命令
└── design.md                    # 本文档
```

---

## 11. 非功能性需求（增强版）

### 11.1 性能
- 首次加载 < 2s（Gzip + 代码分割 + 预缓存）
- API 响应 < 500ms（含 OCR 除外）
- OCR 处理 < 10s（单张图片，CPU 推理）
- 数据库查询 < 100ms（含关联表查询）

### 11.2 安全
- 所有 API 需携带 `Authorization: Bearer <jwt>` 认证
- JWT 使用 HS256 签名，密钥 32 位以上随机字符串
- 密码使用 bcrypt 哈希存储
- 登出后 Token 加入黑名单
- 文件上传仅允许 jpg/png/webp，最大 10MB

### 11.3 可维护性
- 前后端分离，独立部署
- API 版本前缀 `/api/v1/`
- 前端 TypeScript 类型通过 `openapi-typescript` 从 OpenAPI schema 自动生成
- 后端使用 Alembic 管理数据库迁移
- 环境变量统一管理（`.env` 文件）

### 11.4 数据一致性
- 复习状态更新在单数据库事务中完成（questions + reviews 同时更新）
- SM-2 状态以 questions 表为准，reviews 表为历史记录
- 图片删除时级联删除文件（应用层 + 定时任务兜底）

### 11.5 离线可用性
- Service Worker 缓存应用 Shell
- 网络不可用时显示离线 Banner
- 离线复习评分暂存 IndexedDB，联网后同步（Phase 2+）

---

## 12. 部署方案：Mac mini 原生部署

### 12.1 部署架构

```
┌───────────────────────────────────────────────────────────┐
│                     Mac mini（家庭服务器）                    │
│                                                           │
│  ┌────────────── Nginx（端口 80） ───────────────────────┐ │
│  │  /api/*         → proxy_pass http://127.0.0.1:8000    │ │
│  │  /uploads/*     → 静态文件目录（alias）                │ │
│  │  /*             → 前端静态文件（root dist/）           │ │
│  └────────────────────────┬──────────────────────────────┘ │
│                           │                                │
│              ┌────────────┼────────────┐                   │
│              ▼            ▼            ▼                   │
│       ┌──────────┐ ┌──────────┐ ┌──────────┐              │
│       │ 前端     │ │ 后端     │ │ SQLite   │              │
│       │ React    │ │ FastAPI  │ │ data/    │              │
│       │ dist/    │ │ :8000    │ │          │              │
│       └──────────┘ └──────────┘ └──────────┘              │
│                                                           │
│  IP: 192.168.1.x（内网）                                  │
│  Tailscale: 100.x.x.x（外网）                             │
└───────────────────────────────────────────────────────────┘
```

### 12.2 环境要求

| 依赖 | 版本 | 安装方式 |
|------|------|---------|
| macOS | macOS Ventura+ | 内置 |
| Python | 3.11+ | `brew install python@3.11` |
| Node.js | 18+ | `brew install node@18` |
| Nginx | 最新 | `brew install nginx` |
| Git | 最新 | `brew install git` |

可选（外网访问用）：
- Tailscale：`brew install tailscale` 并登录
- Cloudflare Tunnel：`brew install cloudflared`

### 12.3 目录结构约定

```
/Users/doudou_files/Claude/mistake_notebook/
├── frontend/
│   └── dist/                      # npm run build 产物
├── backend/
│   ├── app/                        # Python 源码
│   ├── data/                       # SQLite 数据库文件
│   ├── uploads/                    # 图片存储
│   │   ├── temp/
│   │   └── questions/
│   └── venv/                       # Python 虚拟环境
├── deploy.sh                       # 一键部署脚本
├── stop.sh                         # 停止服务脚本
├── nginx.conf                      # Nginx 配置
└── .env                            # 环境变量
```

### 12.4 部署步骤

#### 第一步：环境准备

```bash
# 安装依赖
brew install python@3.11 node@18 nginx

# 创建项目目录
mkdir -p /Users/doudou_files/Claude/mistake_notebook
cd /Users/doudou_files/Claude/mistake_notebook

# 配置 Python 虚拟环境
cd backend
python3.11 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt

# 预下载 EasyOCR 模型（首次运行会下载，约 1-2GB）
python -c "
import easyocr
reader = easyocr.Reader(['ch_sim', 'en'], gpu=False)
print('EasyOCR 模型下载完成')
"
```

#### 第二步：配置环境变量

```bash
# 在项目根目录创建 .env
cd /Users/doudou_files/Claude/mistake_notebook
cat > .env << 'EOF'
JWT_SECRET=your-strong-jwt-secret-at-least-32-chars
DATABASE_URL=sqlite:///data/mistake_notebook.db
OCR_ENABLED=true
HOST=0.0.0.0
PORT=8000
EOF
```

#### 第三步：配置 Nginx

```bash
# 复制 Nginx 配置
sudo cp /Users/doudou_files/Claude/mistake_notebook/nginx.conf \
  /usr/local/etc/nginx/servers/mistake-notebook.conf

# 或编辑主配置文件
sudo vi /usr/local/etc/nginx/nginx.conf
```

**Nginx 配置（`nginx.conf`，注意路径替换为实际路径）：**

```nginx
server {
    listen 80;
    server_name _;

    # 前端 - React SPA
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
    location ~ \.db$ {
        deny all;
        return 404;
    }

    # SPA 路由
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

#### 第四步：一键部署脚本

**`deploy.sh`：**

```bash
#!/bin/bash
set -e

PROJECT_DIR="/Users/doudou_files/Claude/mistake_notebook"
cd "$PROJECT_DIR"

# 加载环境变量
export $(grep -v '^#' .env | xargs)

echo "=== 1. 构建前端 ==="
cd frontend
npm install --silent
npm run build
echo "前端构建完成 → dist/"

echo "=== 2. 启动后端 ==="
cd "$PROJECT_DIR/backend"
source venv/bin/activate
uvicorn app.main:app \
    --host "$HOST" \
    --port "$PORT" \
    --reload &
BACKEND_PID=$!
echo "后端已启动 (PID: $BACKEND_PID)"

echo "=== 3. 启动 Nginx ==="
sudo nginx -t
sudo nginx -s reload 2>/dev/null || sudo nginx
echo "Nginx 已启动"

echo ""
echo "========================================="
echo "✅ 部署完成！"
echo "本机访问: http://localhost"
echo "局域网访问: http://$(ipconfig getifaddr en0 2>/dev/null || echo '请查看路由器分配 IP')"
echo "首次访问: http://localhost/register 创建管理员账号"
echo "JWT Secret: 已配置（.env 文件中）"
echo ""
echo "停止服务: ./stop.sh"
echo "========================================="
```

**`stop.sh`：**

```bash
#!/bin/bash
echo "=== 停止后端 ==="
pkill -f "uvicorn app.main" 2>/dev/null && echo "后端已停止" || echo "后端未运行"

echo "=== 停止 Nginx ==="
sudo nginx -s stop 2>/dev/null && echo "Nginx 已停止" || echo "Nginx 未运行"

echo "=== 服务已全部停止 ==="
```

### 12.5 外网访问方案

#### 方案 A：Tailscale（推荐，免费）

```bash
# Mac mini 安装
brew install tailscale
sudo tailscale up

# 在 iPhone / Android 上安装 Tailscale App
# 用同一账号登录

# 访问方式
# 手机浏览器 → http://100.x.x.x（Tailscale 分配的虚拟 IP）
```

**优点**：无需公网 IP、无需端口转发、端到端加密、配置简单

#### 方案 B：路由器端口转发

```bash
# 1. 给 Mac mini 设置固定内网 IP
#   macOS 系统设置 → 网络 → 高级 → TCP/IP → 配置 IPv4 → 手动
#   例如：IP 192.168.1.100，子网掩码 255.255.255.0，路由器 192.168.1.1

# 2. 路由器设置端口转发
#   外部端口 80 → 内部 IP 192.168.1.100 → 内部端口 80

# 3. 配置 DDNS（如果公网 IP 动态变化）
#   路由器内置 DDNS 或使用 ddns-go
```

**注意**：需要公网 IP 且运营商未封 80 端口。如果 80 端口被封，可将 Nginx 改为其他端口（如 8080）。

### 12.6 开机自启

使用 macOS launchd 实现开机自动启动后端：

**`~/Library/LaunchAgents/com.mistake-notebook.backend.plist`：**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.mistake-notebook.backend</string>
    <key>ProgramArguments</key>
    <array>
        <string>/Users/doudou_files/Claude/mistake_notebook/backend/venv/bin/uvicorn</string>
        <string>app.main:app</string>
        <string>--host</string>
        <string>0.0.0.0</string>
        <string>--port</string>
        <string>8000</string>
    </array>
    <key>WorkingDirectory</key>
    <string>/Users/doudou_files/Claude/mistake_notebook/backend</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>JWT_SECRET</key>
        <string>your-strong-jwt-secret-at-least-32-chars</string>
        <key>DATABASE_URL</key>
        <string>sqlite:///data/mistake_notebook.db</string>
        <key>OCR_ENABLED</key>
        <string>true</string>
    </dict>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/Users/doudou_files/Claude/mistake_notebook/backend/logs/access.log</string>
    <key>StandardErrorPath</key>
    <string>/Users/doudou_files/Claude/mistake_notebook/backend/logs/error.log</string>
</dict>
</plist>
```

```bash
# 加载开机自启
mkdir -p /Users/doudou_files/Claude/mistake_notebook/backend/logs
launchctl load ~/Library/LaunchAgents/com.mistake-notebook.backend.plist

# 检查状态
launchctl list | grep mistake-notebook

# 停止
launchctl unload ~/Library/LaunchAgents/com.mistake-notebook.backend.plist
```

Nginx 开机自启（通过 Homebrew 安装的 Nginx 已自带 plist）：

```bash
# 确认 Nginx 已设置为开机自启
sudo brew services list | grep nginx

# 如果没有，启用
sudo brew services start nginx
```

### 12.7 日常运维命令

| 操作 | 命令 |
|------|------|
| 启动所有服务 | `./deploy.sh` |
| 停止所有服务 | `./stop.sh` |
| 单独启动后端 | `cd backend && source venv/bin/activate && uvicorn app.main:app --host 0.0.0.0 --port 8000` |
| 单独构建前端 | `cd frontend && npm run build` |
| 重启 Nginx | `sudo nginx -s reload` |
| 查看后端日志 | `tail -f backend/logs/access.log` |
| 查看 Nginx 日志 | `tail -f /usr/local/var/log/nginx/error.log` |
| 数据库备份 | `cp backend/data/mistake_notebook.db backend/data/backup_$(date +%Y%m%d).db` |
| 查看监听的端口 | `lsof -i :80 -i :8000` |

### 12.8 数据库备份脚本

**`backup.sh`：**

```bash
#!/bin/bash
BACKUP_DIR="/Users/doudou_files/Claude/mistake_notebook/backend/data/backups"
mkdir -p "$BACKUP_DIR"

# 备份数据库（带时间戳）
cp /Users/doudou_files/Claude/mistake_notebook/backend/data/mistake_notebook.db \
   "$BACKUP_DIR/backup_$(date +%Y%m%d_%H%M%S).db"

# 保留最近 30 天的备份，删除更早的
find "$BACKUP_DIR" -name "backup_*.db" -mtime +30 -delete

echo "备份完成: $BACKUP_DIR"
```

```bash
# 设置定时备份（每天凌晨 3 点）
crontab -e
# 添加以下行：
0 3 * * * /Users/doudou_files/Claude/mistake_notebook/backup.sh
```

### 12.9 访问方式汇总

| 位置 | 访问方式 | 网络要求 |
|------|---------|---------|
| Mac mini 本机 | `http://localhost` | 无需网络 |
| 家庭内网 - MacBook | `http://192.168.1.100` | 同一局域网 |
| 家庭内网 - iPhone | `http://192.168.1.100` | 同一 WiFi |
| 家庭内网 - Android | `http://192.168.1.100` | 同一 WiFi |
| 外网 - 任何设备 | `http://100.x.x.x`（Tailscale） | 需安装 Tailscale |
| 外网 - 任何设备 | `http://你的域名.com`（端口转发） | 需公网 IP + DDNS |

**首次使用流程：**
```
1. 浏览器访问 http://192.168.1.100
2. 自动跳转 /register 页面
3. 设置用户名 + 密码（管理员账号）
4. 跳转 /login 登录
5. 进入首页，开始使用
```

---

*文档结束 — v2.0 已修复所有架构审查问题，含 Mac mini 部署方案*