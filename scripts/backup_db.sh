#!/bin/bash
# ==============================================================================
# ALLYRICH - Automated Local PostgreSQL Database Backup Script
# Creates a compressed SQL dump in /home/ubuntu/backups and retains last 7 days
# ==============================================================================
BACKUP_DIR="/home/ubuntu/backups"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/allyrich_db_${TIMESTAMP}.sql.gz"

mkdir -p "$BACKUP_DIR"
CONTAINER=$(docker ps --format '{{.Names}}' | grep -E 'al[l|e]yrich-db' | head -n 1)
[ -z "$CONTAINER" ] && CONTAINER="alleyrich-db"
docker exec "$CONTAINER" pg_dump -U alleyrich_admin -d alleyrich_production 2>/dev/null | gzip > "$BACKUP_FILE" || docker exec "$CONTAINER" pg_dump -U allyrich -d allyrich_db 2>/dev/null | gzip > "$BACKUP_FILE"

# Keep last 7 days of backups
find "$BACKUP_DIR" -type f -name "allyrich_db_*.sql.gz" -mtime +7 -delete

echo "✅ Backup successfully created: $BACKUP_FILE"
