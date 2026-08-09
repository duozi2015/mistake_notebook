#!/bin/bash
# 数据库自动备份：每天一份，SQLite 安全在线备份，最多保留 15 份（第 16 天起覆盖/删除最旧）。
# 由 launchd 每天 00:00 调用；可用环境变量覆盖路径（便于测试）。
set -euo pipefail

DB_PATH="${DB_PATH:-/Users/doudou_files/Claude/mistake_notebook/backend/data/mistake_notebook.db}"
BACKUP_DIR="${BACKUP_DIR:-/Users/doudou_files/Claude/mistake_notebook/backend/data/backups}"
LOG_FILE="${LOG_FILE:-/Users/doudou_files/Claude/mistake_notebook/backend/logs/backup.log}"
KEEP="${KEEP:-15}"
STAMP="${STAMP:-$(date +%Y%m%d)}"

mkdir -p "$BACKUP_DIR"
mkdir -p "$(dirname "$LOG_FILE")"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >> "$LOG_FILE"; }

if [ ! -f "$DB_PATH" ]; then
    log "SKIP: 数据库不存在 $DB_PATH"
    exit 0
fi

DEST="$BACKUP_DIR/mistake_notebook_$STAMP.db"
TMP="$DEST.tmp"

# SQLite 在线备份：即使数据库正在写入也得到一致快照（比 cp 安全）
sqlite3 "$DB_PATH" ".backup '${TMP}'" && mv "$TMP" "$DEST"

# 轮转：保留最近 KEEP 份，删除更早的
ls -1t "$BACKUP_DIR"/mistake_notebook_*.db 2>/dev/null \
    | tail -n +$((KEEP + 1)) \
    | xargs -r rm -f || true

REMAIN=$(ls -1 "$BACKUP_DIR"/mistake_notebook_*.db 2>/dev/null | wc -l | tr -d ' ')
log "备份完成: $DEST (当前保留 $REMAIN 份)"
