#!/bin/bash
# 智能错题本 - 启动脚本
# 由 LaunchAgent 自动调用，用户登录时启动所有服务

PROJECT_DIR="/Users/doudou_files/Claude/mistake_notebook"
LOG_DIR="$PROJECT_DIR/backend/logs"
mkdir -p "$LOG_DIR"

# 记录启动时间
echo "=== $(date) 启动服务 ===" >> "$LOG_DIR/startup.log"

# 1. 加载环境变量
set -a
source "$PROJECT_DIR/.env" 2>/dev/null
set +a

# 2. 启动后端
cd "$PROJECT_DIR/backend"
source venv/bin/activate
if pgrep -f "uvicorn app.main" > /dev/null; then
    echo "后端已在运行" >> "$LOG_DIR/startup.log"
else
    nohup uvicorn app.main:app --host 0.0.0.0 --port 8000 > "$LOG_DIR/app.log" 2>&1 &
    echo "后端已启动 (PID: $!) 环境: ${APP_ENV:-development}" >> "$LOG_DIR/startup.log"
fi

# 2. 确保 Nginx 运行
if pgrep -x nginx > /dev/null; then
    echo "Nginx 已在运行" >> "$LOG_DIR/startup.log"
    # 确保配置最新
    nginx -s reload 2>/dev/null && echo "Nginx 配置已重载" >> "$LOG_DIR/startup.log"
else
    nginx 2>/dev/null && echo "Nginx 已启动" >> "$LOG_DIR/startup.log"
fi

# 3. 注册数据库备份定时任务（幂等：每天 00:00 自动备份，保留 15 份）
BACKUP_PLIST="$PROJECT_DIR/com.mistake-notebook.backup.plist"
LAUNCH_AGENTS_DIR="$HOME/Library/LaunchAgents"
if [ -f "$BACKUP_PLIST" ]; then
    mkdir -p "$LAUNCH_AGENTS_DIR"
    cp -f "$BACKUP_PLIST" "$LAUNCH_AGENTS_DIR/"
    if launchctl list 2>/dev/null | grep -q "com.mistake-notebook.backup"; then
        echo "备份定时任务已在运行" >> "$LOG_DIR/startup.log"
    else
        launchctl load -w "$LAUNCH_AGENTS_DIR/com.mistake-notebook.backup.plist" 2>/dev/null \
            && echo "备份定时任务已注册" >> "$LOG_DIR/startup.log" \
            || echo "备份定时任务注册失败（launchctl）" >> "$LOG_DIR/startup.log"
    fi
fi

echo "=== 启动完成 ===" >> "$LOG_DIR/startup.log"