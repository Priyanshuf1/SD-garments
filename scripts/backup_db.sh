#!/bin/bash
# ==============================================================================
# ALLYRICH - Automated Local PostgreSQL Database Backup Script
# Creates a compressed SQL dump in /home/ubuntu/backups and retains last 7 days
# ==============================================================================
BACKUP_DIR="/home/ubuntu/backups"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/allyrich_db_${TIMESTAMP}.sql.gz"

mkdir -p "$BACKUP_DIR"
docker exec allyrich-db pg_dump -U allyrich -d allyrich_db | gzip > "$BACKUP_FILE"

# Keep last 7 days of backups
find "$BACKUP_DIR" -type f -name "allyrich_db_*.sql.gz" -mtime +7 -delete

echo "✅ Backup successfully created: $BACKUP_FILE"
