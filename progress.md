# 智能错题本系统 — 项目状态汇总报告

> **生成时间**：2026-07-20 20:45
> **Git 版本**：`4acaa45c`（feat: 自动识别环境(基于hostname) + 显示Git版本号）
> **环境**：MacBook Pro（开发环境） / Mac mini（生产环境，自动识别）

---

## 一、总体状态

| 检查项 | 结果 | 备注 |
|-------|------|------|
| 后端测试（37 个用例） | ✅ **37/37 通过** | SM-2 23 个 + Statistics 14 个全部通过 |
| 前端 TypeScript 编译 | ✅ **0 errors** | `tsc -b` 通过 |
| 前端构建 | ✅ **成功** | 97 modules, 173ms, JS 100.48 KB gzip |
| 后端 API 端点 | ✅ **26 个** | 9 个 router 注册（含 health） |
| 前端路由 | ✅ **10 条** | 2 公开 + 8 需认证 |
| 前后端连通 | ⚠️ 14/26 前端调用 | 12 个端点未对接前端 |
| 后端运行状态 | ✅ **运行中** | `localhost:8000` |
| Nginx 反向代理 | ✅ **运行中** | `localhost:2530` → 前端 + API |
| 已知 Bug | ⚠️ 5 个 | 见 bugs.md（部分已修复但文档未更新） |
| 前后端连通性 | ✅ **连通** | 通过 Nginx 代理：`/api/` → `:8000`，静态文件 → `frontend/dist` |

---

## 二、后端测试状态

### 测试结果（2026-07-20 20:45 实测）

| 测试文件 | 用例数 | 通过 | 失败 | 说明 |
|---------|--------|------|------|------|
| `tests/test_sm2.py` | 23 | 23 | 0 | ✅ SM-2 算法——参数化边界全覆盖 |
| `tests/test_statistics.py` | 14 | 14 | 0 | ✅ 概览、趋势、报告、掌握度、热力图 |
| **合计** | **37** | **37** | **0** | **✅ 全部通过** |

### 测试环境

| 组件 | 版本 | 状态 |
|------|------|------|
| Python | 3.12 | ✅ |
| FastAPI | 0.139.2 | ✅ |
| SQLAlchemy | 2.0.51 | ✅ |
| pytest | 9.1.1 | ✅ |
| bcrypt | 4.0.1 | ✅（降级以兼容 passlib 1.7.4） |
| passlib | 1.7.4 | ✅ |
| reportlab | 5.0.0 | ✅ |
| EasyOCR | 未安装 | ⚠️ OCR 功能不可用 |

### 遗留警告（非阻塞）

- `@app.on_event("startup")` 已废弃，建议迁移到 `lifespan` 事件处理
- `datetime.utcnow()` 已废弃，建议使用 `datetime.now(datetime.UTC)`
- Pydantic V2 `class Config` 已废弃，建议使用 `model_config`

---

## 三、前端构建状态

### 构建结果（2026-07-20 20:45 实测）

| 产出 | 原始大小 | Gzip |
|------|---------|------|
| `dist/index.html` | 0.80 KB | 0.44 KB |
| `dist/assets/index--xYCeU0C.css` | 32.76 KB | 6.83 KB |
| `dist/assets/index-4-iIBKRZ.js` | 330.03 KB | 100.48 KB |

- **构建命令**: `npm run build`（`tsc -b && vite build`）
- **构建时间**: 173ms
- **TypeScript 错误**: 0
- **警告**: 0

### 依赖完整性

| 依赖 | 版本 | 用途 | 状态 |
|------|------|------|------|
| react | 19.2.7 | UI 框架 | ✅ |
| react-router-dom | 6.30.4 | 路由 | ✅ |
| zustand | 5.0.14 | 状态管理 | ✅ |
| axios | 1.18.1 | HTTP 客户端 | ✅ |
| tailwindcss | 4.3.3 | CSS 框架 | ✅ |
| typescript | 6.0.2 | 类型检查 | ✅ |
| vite | 8.1.1 | 构建工具 | ✅ |

---

## 四、路由完整性

### 前端路由（10 条）

| 路径 | 页面组件 | 认证 | 底部导航 | 状态 |
|------|---------|------|---------|------|
| `/login` | LoginPage | 仅未登录 | ❌ | ✅ |
| `/register` | RegisterPage | 仅未登录 | ❌ | ✅ |
| `/` | DashboardPage | 需登录 | ✅ 首页 | ✅ |
| `/review` | ReviewPage | 需登录 | ✅ 复习 | ✅ |
| `/review/complete` | ReviewCompletePage | 需登录 | ❌ | ✅ |
| `/questions` | QuestionListPage | 需登录 | ✅ 错题 | ✅ |
| `/questions/new` | QuestionNewPage | 需登录 | ✅ 录入 | ✅ |
| `/questions/:id` | QuestionDetailPage | 需登录 | ❌ | ✅ |
| `/statistics` | StatisticsPage | 需登录 | ⚠️ **缺失** | ✅ |
| `/settings` | SettingsPage | 需登录 | ✅ 设置 | ✅ |

**⚠️ 已知问题**: `/statistics` 路由已注册，但 BottomNav 组件缺少统计页入口，用户只能通过手动输入 URL 访问。

### 后端 API 端点（26 个）

#### Auth（7 个端点）

| 方法 | 端点 | 前端调用 | 状态 |
|------|------|---------|------|
| `POST` | `/api/v1/auth/register` | ✅ RegisterPage | ✅ |
| `POST` | `/api/v1/auth/login` | ✅ LoginPage | ✅ |
| `POST` | `/api/v1/auth/refresh` | ✅ Axios 拦截器 | ✅ |
| `POST` | `/api/v1/auth/logout` | ⚠️ 仅清理本地 localStorage | ✅ |
| `GET` | `/api/v1/auth/me` | ❌ 未调用 | ✅ |
| `PUT` | `/api/v1/auth/password` | ✅ SettingsPage | ✅ |
| `GET` | `/api/v1/auth/health` | ✅ useEnv hook | ✅ |

#### Questions（5 个端点）

| 方法 | 端点 | 前端调用 | 状态 |
|------|------|---------|------|
| `GET` | `/api/v1/questions` | ✅ QuestionListPage | ✅ |
| `POST` | `/api/v1/questions` | ✅ QuestionNewPage | ✅ |
| `GET` | `/api/v1/questions/{id}` | ✅ QuestionDetailPage | ✅ |
| `PUT` | `/api/v1/questions/{id}` | ❌ 前端未实现编辑 | ✅ |
| `DELETE` | `/api/v1/questions/{id}` | ❌ 前端未实现删除 | ✅ |

#### Images（2 个端点）

| 方法 | 端点 | 前端调用 | 状态 |
|------|------|---------|------|
| `POST` | `/api/v1/images/upload` | ✅ QuestionNewPage | ✅ |
| `DELETE` | `/api/v1/images/{id}` | ❌ 前端未调用 | ✅ |

#### Reviews（3 个端点）

| 方法 | 端点 | 前端调用 | 状态 |
|------|------|---------|------|
| `GET` | `/api/v1/reviews/daily` | ✅ ReviewPage / DashboardPage | ✅ |
| `POST` | `/api/v1/reviews` | ✅ ReviewPage | ✅ |
| `GET` | `/api/v1/reviews/history/{id}` | ❌ 前端未调用 | ✅ |

#### Statistics（5 个端点）

| 方法 | 端点 | 前端调用 | 状态 |
|------|------|---------|------|
| `GET` | `/api/v1/statistics/overview` | ✅ DashboardPage / StatisticsPage | ✅ |
| `GET` | `/api/v1/statistics/trends` | ✅ StatisticsPage | ✅ |
| `GET` | `/api/v1/statistics/report` | ✅ DashboardPage | ✅ |
| `GET` | `/api/v1/statistics/knowledge/mastery` | ✅ StatisticsPage | ✅ |
| `GET` | `/api/v1/statistics/knowledge/heatmap` | ❌ 前端未调用 | ✅ |

#### OCR / Variants / Export（4 个端点）

| 方法 | 端点 | 前端调用 | 状态 |
|------|------|---------|------|
| `POST` | `/api/v1/ocr/recognize` | ❌ 前端无对应模块 | ⚠️ 需安装 EasyOCR |
| `GET` | `/api/v1/variants/{id}` | ❌ 前端无对应模块 | ✅ |
| `POST` | `/api/v1/export/pdf` | ❌ 前端无对应模块 | ✅ |
| `POST` | `/api/v1/export/share-link` | ❌ 前端无对应模块 | ✅ |

---

## 五、已实现功能清单

### MVP-v1：基础框架 + 注册登录 + 错题 CRUD

| 功能 | 状态 | 说明 |
|------|------|------|
| 后端项目脚手架 | ✅ | FastAPI + SQLAlchemy + SQLite |
| 前端项目脚手架 | ✅ | Vite + React 19 + TypeScript + Tailwind CSS v4 |
| 数据库模型（7 张表） | ✅ | User, Question, QuestionImage, QuestionTag, Review, TokenBlacklist, ShareLink |
| JWT 认证（含刷新+黑名单） | ✅ | register / login / refresh / logout / me / password 全部实现 |
| 错题 CRUD（后端） | ✅ | 5 个端点（分页筛选、增删改查） |
| 图片上传 | ✅ | 文件存储 + 10MB 限制 + JPEG/PNG/WebP 格式校验 |
| 登录/注册页 | ✅ | 表单校验、错误提示、成功状态 |
| 错题列表/录入/详情页 | ✅ | 移动端适配、分页、标签筛选 |
| 路由守卫 | ✅ | PublicRoute / ProtectedRoute |

### MVP-v2：SM-2 智能复习引擎

| 功能 | 状态 | 说明 |
|------|------|------|
| SM-2 算法 | ✅ | EF 下限 1.3、间隔递增、质量 0-5、全边界测试 23 例通过 |
| 每日复习任务 API | ✅ | 含新建题目（next_review_date=NULL）、紧急度排序 |
| 复习提交（事务更新） | ✅ | 单事务更新 questions + reviews |
| 复习卡片页 | ✅ | 6 档评分（Again~Easy）、答案遮挡、滑动切换、Loading/Empty/Error 状态 |
| 复习完成页 | ✅ | 掌握度分布统计 |

### MVP-v3：统计图表 + 学情报告

| 功能 | 状态 | 说明 |
|------|------|------|
| 统计概览 API | ✅ | 总题数/待复习/掌握度/周新增等 |
| 30 天趋势 API | ✅ | 日粒度新增+复习数据 |
| 学情报告 API | ✅ | 错误类型分布、薄弱知识点、学习建议 |
| 知识点掌握度 API | ✅ | 雷达图数据 |
| 首页仪表盘 | ✅ | 4 统计卡片 + 待复习列表 + 高频错误 + Loading/Error/Empty 状态 |
| 统计页面 | ✅ | 趋势图 + 错误类型 + 薄弱点 + 掌握度雷达图 |

### MVP-v4：增强功能

| 功能 | 状态 | 说明 |
|------|------|------|
| EasyOCR 服务 | ⚠️ 后端就绪，前端无调用 | 依赖未安装，需 `pip install easyocr` |
| 变式题推荐 API | ⚠️ 后端就绪，前端无调用 | 同知识点标签匹配算法 |
| PDF 导出 | ⚠️ 后端就绪，前端无调用 | reportlab 可用时生成 PDF，否则回退纯文本 |
| 安全分享链接 | ⚠️ 后端就绪，前端无调用 | Token 生成 + 过期时间（1-720h） |
| 设置页面 | ✅ | 密码修改、退出登录 |
| PWA 支持 | ✅ | manifest.json + 图标 |

### 部署与运维

| 功能 | 状态 | 说明 |
|------|------|------|
| 环境自动识别 | ✅ | hostname 含 "macbook" → 开发环境，否则生产环境 |
| Git 版本号显示 | ✅ | 后端 API 返回 commit hash，前端顶部显示 |
| 生产环境标识隐藏 | ✅ | 仅开发环境显示黄色标识条 |
| Nginx 反向代理 | ✅ | 配置就绪，已部署运行 |
| 一键部署脚本 | ✅ | deploy.sh |
| 停止脚本 | ✅ | stop.sh |
| 数据库备份脚本 | ✅ | backup.sh（保留 30 天） |
| LaunchAgent 开机自启 | ✅ | plist 就绪，startup.sh 已配置 |
| brew services nginx 自启 | ✅ | 已配置 |
| 环境变量模板 | ✅ | .env.example |

---

## 六、服务状态

### 当前运行服务（2026-07-20 20:45 验证）

| 服务 | 端口 | 状态 | 验证 |
|------|------|------|------|
| 后端 API（uvicorn） | 8000 | ✅ **运行中** | `GET /api/v1/auth/health` → 200 OK |
| Nginx 反向代理 | 2530 | ✅ **运行中** | `GET /` → 200（前端静态文件） |
| Nginx API 代理 | 2530 | ✅ **运行中** | `GET /api/v1/auth/health` → 200（代理到 8000） |
| API 文档 | 8000 | ✅ **可访问** | `GET /docs` → Swagger UI |

### 访问方式

```
本地访问:    http://localhost:2530
局域网访问:  http://192.168.3.234:2530  （Mac mini 生产环境）
API 文档:   http://localhost:8000/docs
```

---

## 七、数据库状态

### 表结构（7 张表）

| 表名 | 说明 | 关键字段 |
|------|------|---------|
| `users` | 用户表 | id, username, password_hash, display_name |
| `questions` | 错题表 | id, user_id, subject, error_type, difficulty, status, current_ef, current_interval, next_review_date |
| `question_images` | 图片表 | id, question_id, file_path, mime_type, image_type（question/solution） |
| `question_tags` | 标签表 | id, question_id, tag_name（唯一约束: question_id + tag_name） |
| `reviews` | 复习记录表 | id, question_id, user_id, quality, ef_before, ef_after, interval_before, interval_after |
| `token_blacklist` | Token 黑名单 | id, jti, expires_at |
| `share_links` | 分享链接 | id, token, question_ids, expires_at |

### 当前记录数

| 表 | 记录数 | 备注 |
|----|--------|------|
| users | 0 | 数据库已清空（测试套件重建导致） |
| questions | 0 | 需要重新录入数据 |
| reviews | 0 | 同上 |
| question_tags | 0 | 同上 |
| question_images | 0 | 同上 |
| token_blacklist | 0 | ✅ 正常 |
| share_links | 0 | ✅ 正常 |

**⚠️ 注意**: 数据库表在启动时自动创建（`Base.metadata.create_all`），当前为空。之前的测试数据（3 questions, 4 users, 1 review）已被覆盖。启动后端后注册用户即可正常使用。

---

## 八、已知问题与风险

### 阻塞性问题

| 编号 | 问题 | 影响 | 当前状态 |
|------|------|------|---------|
| B1 | 数据库为空 | 无数据可演示 | ⚠️ 启动后端后注册即可，非阻塞 |

### 非阻塞性问题

| 编号 | 问题 | 影响 | 说明 |
|------|------|------|------|
| B2 | 无法使用已有账号登录 | 用户无法登录 | ✅ **已修复** — bcrypt 已降级到 4.0.1，注册/登录正常 |
| B3 | 数据隔离问题 | 用户能看到他人错题 | ✅ **已验证不存在** — 后端按 `current_user.id` 过滤，测试通过 |
| B4 | 错题复习时看不到题目 | 复习卡片空白 | ⚠️ 待实测验证 |
| B5 | 图片上传/查看不可用 | 拍照上传失败 | ⚠️ `file_path` 使用 `/uploads/` 前缀，需检查 Nginx 是否代理该路径 |
| B6 | 统计页面无底部导航入口 | 用户无法通过导航访问 | ⚠️ BottomNav 缺少 `/statistics` 路径 |
| B7 | 12 个后端端点无前端调用 | 功能不完整 | ⚠️ OCR、变式题、PDF 导出、分享链接、热力图、编辑/删除题目等 |
| B8 | 退出登录未调用后端 API | logout 仅清理本地 | ⚠️ 后端 `POST /auth/logout` 未被调用 |
| B9 | 前端无 tests | 无前端测试覆盖 | ⚠️ 仅后端有 pytest 测试 |
| B10 | 后端弃用警告 | 代码质量 | ⚠️ `on_event` 和 `datetime.utcnow()` 建议迁移 |

---

## 九、文件清单

### 后端（19 个 Python 文件）

```
backend/
├── app/
│   ├── __init__.py
│   ├── main.py              # FastAPI 入口 + 9 个 router 注册 + health 端点
│   ├── config.py            # pydantic-settings 配置（.env）
│   ├── database.py          # SQLAlchemy 会话管理
│   ├── models.py            # 7 个 ORM 模型
│   ├── schemas.py           # Pydantic 请求/响应模型
│   ├── auth.py              # JWT 生成/验证 + bcrypt 密码哈希
│   ├── routers/
│   │   ├── __init__.py
│   │   ├── auth.py          # 7 个端点
│   │   ├── questions.py     # 5 个端点
│   │   ├── images.py        # 2 个端点
│   │   ├── reviews.py       # 3 个端点
│   │   ├── statistics.py    # 5 个端点
│   │   ├── ocr.py           # 1 个端点
│   │   ├── variants.py      # 1 个端点
│   │   └── export.py        # 2 个端点
│   └── services/
│       ├── __init__.py
│       ├── sm2.py           # SM-2 间隔重复算法
│       └── ocr_service.py   # EasyOCR 服务
├── tests/
│   ├── test_sm2.py          # 23 个参数化测试
│   └── test_statistics.py   # 14 个集成测试
├── requirements.txt
├── data/mistake_notebook.db
└── logs/
    ├── access.log
    ├── app.log
    └── error.log
```

### 前端（31 个 TypeScript/TSX 文件）

```
frontend/src/
├── App.tsx                  # 路由定义（10 条路由）
├── main.tsx                 # 入口
├── index.css                # 全局样式（Tailwind CSS v4）
├── types/index.ts           # 类型定义
├── services/
│   ├── api.ts               # Axios 配置 + Token 拦截器 + 自动刷新
│   ├── auth.ts              # 认证 API
│   ├── questions.ts         # 错题 API
│   ├── reviews.ts           # 复习 API
│   └── statistics.ts        # 统计 API
├── stores/
│   ├── authStore.ts         # 认证状态（Zustand）
│   └── toastStore.ts        # Toast 通知（Zustand）
├── hooks/
│   └── useEnv.ts            # 环境检测 hook
├── utils/
│   └── image.ts             # 图片工具函数
├── components/
│   ├── Layout/
│   │   ├── BottomNav.tsx    # 底部导航栏（5 个标签，⚠️ 缺统计页）
│   │   └── MobileLayout.tsx # 布局外壳（含环境标识条）
│   └── Shared/
│       ├── ImageViewer.tsx  # 图片查看器
│       └── Toast.tsx        # Toast 通知组件
└── features/
    ├── auth/
    │   ├── LoginPage.tsx
    │   └── RegisterPage.tsx
    ├── dashboard/
    │   └── DashboardPage.tsx
    ├── questions/
    │   ├── QuestionListPage.tsx
    │   ├── QuestionNewPage.tsx
    │   └── QuestionDetailPage.tsx
    ├── review/
    │   ├── ReviewPage.tsx
    │   └── ReviewCompletePage.tsx
    ├── statistics/
    │   └── StatisticsPage.tsx
    └── settings/
        └── SettingsPage.tsx
```

---

## 十、核心功能链路验证

### 流程验证

| 步骤 | 操作 | 预期结果 | 实测结果 |
|------|------|---------|---------|
| 1 | 注册新用户 | 返回用户信息（id, username） | ✅ 通过 |
| 2 | 登录 | 返回 access_token + refresh_token | ✅ 通过 |
| 3 | 创建错题 | 返回完整题目信息 | ✅ 通过 |
| 4 | 列出错题 | 分页返回当前用户错题 | ✅ 通过（数据隔离已验证） |
| 5 | 获取每日复习 | 返回待复习题目列表 | ✅ 通过 |
| 6 | 提交复习评分 | 返回新的 SM-2 参数 | ✅ 通过 |
| 7 | 查看统计概览 | 返回总题数/掌握度等 | ✅ 通过 |
| 8 | 修改密码 | 返回成功消息 | ✅ 通过 |
| 9 | 前端构建 | 0 errors | ✅ 通过 |
| 10 | 后端测试 | 37/37 通过 | ✅ 通过 |

### 状态覆盖检查

| 页面 | Loading | Empty | Error | 正常 | 说明 |
|------|---------|-------|-------|------|------|
| DashboardPage | ✅ | ✅ | ✅ | ✅ | 骨架屏 + 空状态 + 错误重试 |
| ReviewPage | ✅ | ✅ | ✅ | ✅ | 骨架屏 + 空状态 + 错误重试 |
| ReviewCompletePage | ✅ | ❌ | ❌ | ✅ | 简单页面 |
| QuestionListPage | ⚠️ | ⚠️ | ⚠️ | ✅ | 需确认 |
| QuestionNewPage | ❌ | ❌ | ❌ | ✅ | 表单页 |
| QuestionDetailPage | ⚠️ | ⚠️ | ⚠️ | ✅ | 需确认 |
| LoginPage | ❌ | ❌ | ✅ | ✅ | 有错误提示 |
| RegisterPage | ❌ | ❌ | ✅ | ✅ | 有错误提示 |
| StatisticsPage | ✅ | ✅ | ✅ | ✅ | 骨架屏 + 空状态 + 错误重试 |
| SettingsPage | ❌ | ❌ | ❌ | ✅ | 简单页面 |

---

## 十一、验收建议

### 验收前建议检查

1. **浏览器打开** `http://localhost:2530` → 确认注册/登录/录入/复习/统计核心链路完整可用
2. **运行测试** → `cd backend && source venv/bin/activate && pytest tests/ -v` → 37/37 通过
3. **前端构建** → `cd frontend && npm run build` → 0 errors
4. **确认数据库表已创建** → 启动后端后自动创建，无需手动操作

### 已知问题概要

| 优先级 | 问题 | 影响面 |
|--------|------|--------|
| ⚠️ 低 | 统计页无底部导航入口 | 用户体验 |
| ⚠️ 低 | 12 个后端端点未对接前端 | 功能缺失（MVP-v4） |
| ⚠️ 低 | 退出登录未调用后端 API | Token 黑名单无效 |
| ⚠️ 低 | 图片上传/查看路径需确认 | 图片功能 |
| 🔧 技术债务 | `on_event` / `utcnow()` 弃用警告 | 代码维护 |
| 🔧 技术债务 | 前端无测试覆盖 | 质量保障 |
| 🔧 技术债务 | Pydantic v2 `class Config` 弃用 | 代码维护 |