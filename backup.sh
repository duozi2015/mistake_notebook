#!/bin/bash
# Automated backup script for mistake notebook
set -e

BACKUP_DIR="/Users/doudou_files/Claude/mistake_notebook/backend/data/backups"
DB_PATH="/Users/doudou_files/Claude/mistake_notebook/backend/data/mistake_notebook.db"

mkdir -p "$BACKUP_DIR"

# Create timestamped backup
cp "$DB_PATH" "$BACKUP_DIR/backup_$(date +%Y%m%d_%H%M%S).db"

# Keep only last 30 days of backups
find "$BACKUP_DIR" -name "backup_*.db" -mtime +30 -delete

echo "备份完成: $(ls -t $BACKUP_DIR | head -1)"
