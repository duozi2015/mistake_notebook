#!/bin/bash
# 智能错题本 - 一键部署脚本（MySQL 专用）
# 流程：① 确保数据库存在 → ② 部署前备份 → ③ 构建前端 → ④ 停止旧后端 → ⑤ 数据库升级(建表/加列) → ⑥ 启动后端+健康检查 → ⑦ nginx
# 生产环境若路径不同：MISTAKE_NOTEBOOK_DIR=/实际/路径 ./deploy.sh
set -e

PROJECT_DIR="${MISTAKE_NOTEBOOK_DIR:-/Users/doudou_files/claude/mistake_notebook}"
cd "$PROJECT_DIR"
export $(grep -v '^#' .env 2>/dev/null | xargs)

# Fix expat compatibility issue on macOS with Python 3.12
export DYLD_LIBRARY_PATH="/opt/homebrew/Cellar/expat/2.8.2/lib:$DYLD_LIBRARY_PATH"

BACKUP_DIR="$PROJECT_DIR/backend/data/backups"
HOST_PORT=8000

echo "=== 0. 创建日志目录 ==="
mkdir -p "$PROJECT_DIR/backend/logs"

echo "=== 0.5 解析实际 MySQL 连接（与 app 一致：按机器环境选生产/测试库） ==="
cd "$PROJECT_DIR/backend"
source venv/bin/activate 2>/dev/null || (python3 -m venv venv && source venv/bin/activate)
pip install --upgrade pip -q
pip install -r requirements.txt -q

DB_URL=$(venv/bin/python -c "from app.config import settings; print(settings.resolved_database_url())")
eval "$(venv/bin/python - "$DB_URL" <<'PY'
import sys, urllib.parse
u = sys.argv[1].split("://", 1)[1]
auth, rest = u.split("@", 1)
user = urllib.parse.unquote(auth.split(":", 1)[0])
passwd = urllib.parse.unquote(auth.split(":", 1)[1]) if ":" in auth else ""
hostport, db = rest.split("/", 1)
host = hostport.split(":", 1)[0]
port = hostport.split(":", 1)[1] if ":" in hostport else "3306"
print(f"DB_USER={user!r}")
print(f"DB_PASS={passwd!r}")
print(f"DB_HOST={host!r}")
print(f"DB_PORT={port!r}")
print(f"DB_NAME={db!r}")
PY
)"
echo "数据库: $DB_USER@$DB_HOST:$DB_PORT/$DB_NAME"

echo "=== 0.6 确保数据库存在（全新生产库自动建库） ==="
if mysql -h"$DB_HOST" -P"$DB_PORT" -u"$DB_USER" -p"$DB_PASS" -e "CREATE DATABASE IF NOT EXISTS \`$DB_NAME\` CHARACTER SET utf8mb4" 2>/dev/null; then
    echo "✅ 数据库就绪（不存在则已创建）"
else
    echo "⚠️ 自动建库失败（账号可能无权限），请确认 $DB_NAME 已存在后继续"
fi

echo "=== 0.7 备份数据库（部署前，mysqldump 一致性备份） ==="
mkdir -p "$BACKUP_DIR"
STAMP=$(date +%Y%m%d_%H%M%S)
if mysqldump --single-transaction --default-character-set=utf8mb4 \
    -h"$DB_HOST" -P"$DB_PORT" -u"$DB_USER" -p"$DB_PASS" "$DB_NAME" \
    > "$BACKUP_DIR/deploy_$STAMP.sql" 2>/dev/null; then
    echo "✅ 已备份: deploy_$STAMP.sql"
    # 部署备份保留最近 15 份
    ls -1t "$BACKUP_DIR"/deploy_*.sql 2>/dev/null | tail -n +16 | xargs -r rm -f || true
    echo "   当前保留 $(ls -1 "$BACKUP_DIR"/deploy_*.sql 2>/dev/null | wc -l | tr -d ' ') 份"
else
    echo "⚠️ 备份失败（全新库可能暂无权限），继续部署"
fi

echo "=== 1. 构建前端 ==="
cd frontend
npm install --silent
npm run build
cd "$PROJECT_DIR"

echo "=== 2. 停止旧后端 ==="
kill $(lsof -ti:$HOST_PORT) 2>/dev/null || true
sleep 1

echo "=== 3. 数据库升级（建表/加列，增量幂等非破坏） ==="
cd "$PROJECT_DIR/backend"
echo "--- 完整性预检 ---"
CHK=$(mysql -N -h"$DB_HOST" -P"$DB_PORT" -u"$DB_USER" -p"$DB_PASS" -e "CHECK TABLE \`$DB_NAME\`.users" 2>/dev/null | head -1)
echo "完整性检查: ${CHK:-表不存在（全新库，将创建）}"

BEFORE=$(mysql -N -h"$DB_HOST" -P"$DB_PORT" -u"$DB_USER" -p"$DB_PASS" -e "SELECT COUNT(*) FROM \`$DB_NAME\`.users" 2>/dev/null || echo "表不存在")
echo "迁移前 users 行数: $BEFORE"

python - <<'PY'
from app.database import engine
from app.migrations import run_migrations
applied = run_migrations(engine)
print("迁移完成。本次变更:", applied if applied else "无（库已是最新）")
PY

AFTER=$(mysql -N -h"$DB_HOST" -P"$DB_PORT" -u"$DB_USER" -p"$DB_PASS" -e "SELECT COUNT(*) FROM \`$DB_NAME\`.users" 2>/dev/null || echo "表不存在")
echo "迁移后 users 行数: $AFTER"
if [ "$BEFORE" = "$AFTER" ] && [ "$BEFORE" != "表不存在" ]; then
    echo "✅ 存量用户数未变化（$BEFORE），升级未影响现有数据"
elif [ "$BEFORE" = "表不存在" ]; then
    echo "ℹ️ 全新数据库，已创建完整表结构"
else
    echo "⚠️ 注意：users 行数变化 $BEFORE → $AFTER，请人工核查"
fi

echo "=== 4. 启动后端 ==="
nohup uvicorn app.main:app --host 0.0.0.0 --port "$HOST_PORT" > "$PROJECT_DIR/backend/logs/access.log" 2>&1 &
BACKEND_PID=$!
echo "后端 PID: $BACKEND_PID"

echo "=== 4.5 后端健康检查 ==="
HEALTH_OK=""
for i in $(seq 1 20); do
    sleep 1
    if curl -sf "http://127.0.0.1:$HOST_PORT/api/v1/auth/health" > /dev/null 2>&1; then
        HEALTH_OK="yes"
        break
    fi
done
if [ "$HEALTH_OK" = "yes" ]; then
    echo "✅ 后端健康检查通过"
else
    echo "❌ 后端未通过健康检查，请查看日志: backend/logs/access.log"
    exit 1
fi

echo "=== 5. 启动 Nginx ==="
nginx -t 2>/dev/null && nginx 2>/dev/null || echo "nginx 已在运行或无需启动"

echo ""
echo "✅ 部署完成！"
echo "前端访问: http://localhost:2530"
echo "后端 API: http://localhost:$HOST_PORT"
echo "数据库: $DB_NAME @ $DB_HOST"
echo "部署备份位于: $BACKUP_DIR"
