# 📝 智能错题本系统

> 基于知识图谱与 SM-2 遗忘曲线的智能错题管理系统  
> 多模态录入 → 结构化存储 → 智能复习调度 → 数据洞察反馈

---

## 📱 功能特性

| 模块 | 功能 |
|------|------|
| 📸 **智能录入** | 拍照上传 + 图片识别 + 结构化表单 |
| 🏷️ **知识图谱** | 多级标签 + 知识点关联 + 掌握度可视化 |
| 🔄 **遗忘曲线复习** | SM-2 算法 + 自适应间隔 + 六档评分反馈 |
| 🔀 **变式题推荐** | 同知识点不同角度强化训练 |
| 📊 **数据洞察** | 趋势图 + 错误类型分布 + 薄弱知识点分析 |
| 📤 **导出分享** | 错题导出 + 安全分享链接 |
| 📱 **多端适配** | 响应式设计，iPhone / Android / Mac 均可访问 |

---

## 🖥️ Mac mini 部署步骤

### 环境要求

- macOS Ventura+
- Python 3.12+
- Node.js 18+
- Nginx（`brew install nginx`）

### 第一步：安装依赖

```bash
# 安装 Python 3.12（推荐 3.12，3.14 部分库尚不兼容）
brew install python@3.12 node@18 nginx

# 重启终端或重新加载 shell
exec $SHELL -l
```

### 第二步：获取代码

将项目代码放到 Mac mini 上（U盘 / git clone / AirDrop 等），假设路径为：

```bash
cd /Users/YOUR_USERNAME/mistake_notebook
```

### 第三步：配置后端环境

```bash
cd backend

# 创建 Python 虚拟环境
python3.12 -m venv venv
source venv/bin/activate

# 安装依赖
pip install --upgrade pip
pip install -r requirements.txt
```

### 第四步：配置环境变量

```bash
cd ..
cp .env.example .env

# 编辑 .env，修改 JWT_SECRET 为随机字符串
vi .env
```

`.env` 文件内容：

```
JWT_SECRET=your-random-secret-at-least-32-chars-long
DATABASE_URL=sqlite:///data/mistake_notebook.db
OCR_ENABLED=false
HOST=0.0.0.0
PORT=8000
```

### 第五步：构建前端

```bash
cd frontend
npm install
npm run build
```

### 第六步：配置 Nginx

```bash
# 复制 Nginx 配置
cp /path/to/mistake_notebook/nginx.conf /opt/homebrew/etc/nginx/servers/mistake-notebook.conf

# 编辑配置，修改 root 路径为你的实际路径
vi /opt/homebrew/etc/nginx/servers/mistake-notebook.conf
```

确认以下内容：

```nginx
server {
    listen 2530;                      # 前端访问端口
    server_name _;
    client_max_body_size 20M;         # 图片上传限制

    root /Users/YOUR_USERNAME/mistake_notebook/frontend/dist;
    index index.html;

    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_read_timeout 60s;
    }

    location /uploads/ {
        alias /Users/YOUR_USERNAME/mistake_notebook/backend/uploads/;
        expires 30d;
    }

    location / { try_files $uri $uri/ /index.html; }
}
```

### 第七步：启动服务

```bash
# 1. 启动后端
cd /path/to/mistake_notebook/backend
source venv/bin/activate
uvicorn app.main:app --host 0.0.0.0 --port 8000 &

# 2. 启动 Nginx
sudo nginx -t           # 测试配置
sudo nginx              # 启动

# 3. 或者使用一键脚本
cd /path/to/mistake_notebook
chmod +x deploy.sh
./deploy.sh
```

### 第八步：访问使用

```
打开浏览器 → http://localhost:2530
            → 点击"注册账号"
            → 设置管理员用户名和密码
            → 登录进入首页
            → 开始录入错题
```

同一局域网的其他设备：

```
iPhone / Android / MacBook
→ 浏览器打开 http://192.168.x.x:2530
（查看 Mac mini 的局域网 IP：ipconfig getifaddr en0）
```

---

## 🚀 快速启动（开发模式）

```bash
# 终端 1：后端
cd backend && source venv/bin/activate && uvicorn app.main:app --reload --port 8000

# 终端 2：前端（开发服务器，支持热更新）
cd frontend && npm run dev

# 浏览器访问 http://localhost:5173
```

---

## 🧠 核心算法：SM-2

基于 SuperMemo SM-2 算法的自适应间隔重复系统。

| 评分 | 标签 | 说明 | 间隔调整 |
|------|------|------|---------|
| 0 | Again | 完全不记得 | 重置为 1 天 |
| 1 | Hard | 答错但有印象 | 重置为 1 天 |
| 2 | Medium | 答错但接近正确 | 重置为 1 天 |
| 3 | Good | 答对，稍有迟疑 | 正常递增 |
| 4 | VeryGood | 答对，比较流畅 | 正常递增 |
| 5 | Easy | 完全掌握 | 额外 +1 天 |

---

## 🔧 运维命令

| 操作 | 命令 |
|------|------|
| 启动后端 | `cd backend && source venv/bin/activate && uvicorn app.main:app --host 0.0.0.0 --port 8000` |
| 构建前端 | `cd frontend && npm run build` |
| 重启 Nginx | `sudo nginx -s reload` |
| 查看日志 | `tail -f backend/logs/access.log` |
| 备份数据库 | `./backup.sh` |
| 全部停止 | `./stop.sh` |
| 一键部署 | `./deploy.sh` |

---

## 📁 项目结构

```
mistake_notebook/
├── backend/                     # Python FastAPI 后端
│   ├── app/
│   │   ├── main.py             # 入口 + 路由注册
│   │   ├── models.py           # 8 张数据表
│   │   ├── schemas.py          # Pydantic 数据模型
│   │   ├── auth.py             # JWT 认证
│   │   ├── routers/            # 8 个路由模块（24 个 API 端点）
│   │   └── services/           # SM-2 算法 + EasyOCR
│   ├── data/                   # SQLite 数据库文件
│   └── uploads/                # 用户上传图片
│
├── frontend/                   # React + TypeScript 前端
│   └── src/
│       ├── features/           # 8 个功能页面
│       ├── services/           # API 调用封装
│       └── stores/             # Zustand 状态管理
│
├── nginx.conf                  # Nginx 配置（端口 2530）
├── deploy.sh                   # 一键部署脚本
├── stop.sh                     # 停止服务脚本
├── backup.sh                   # 数据库备份脚本
├── .env.example                # 环境变量模板
└── README.md                   # 本文档
```

---

## 📋 自检清单

部署完成后用以下命令验证：

```bash
# 检查后端
curl -s http://localhost:8000/api/v1/auth/health
# 应返回 {"status":"ok","version":"0.1.0"}

# 检查前端
curl -s -o /dev/null -w "%{http_code}" http://localhost:2530
# 应返回 200

# 检查 Nginx API 代理
curl -s http://localhost:2530/api/v1/auth/health
# 应返回 {"status":"ok","version":"0.1.0"}
```

---

## 🛠️ 技术栈

| 层级 | 技术 | 版本 |
|------|------|------|
| 前端 | React + TypeScript + Vite + Tailwind CSS | — |
| 后端 | Python FastAPI | 3.12 |
| 数据库 | SQLite（WAL 模式） | — |
| 认证 | JWT + bcrypt | — |
| 服务端 | Nginx | — |
| OCR | EasyOCR（可选） | — |

---

*部署问题请参考 [设计文档](design.md)*