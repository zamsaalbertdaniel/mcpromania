#!/bin/bash
set -e

BACKUP_DIR="/var/backups/mcpromania"
TIMESTAMP=$(date +"%Y-%m-%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/backup_${TIMESTAMP}.tar.gz"

mkdir -p "$BACKUP_DIR"

# Creeaza arhiva cu fisierele critice
tar -czf "$BACKUP_FILE" \
    /opt/mcpromania/.env \
    /opt/mcpromania/docker-compose.yml \
    /etc/caddy/Caddyfile \
    2>/dev/null || true

# Securizeaza permisiunile (doar root o poate citi)
chmod 600 "$BACKUP_FILE"

# Pastreaza doar ultimele 14 zile de backup-uri
find "$BACKUP_DIR" -type f -name "backup_*.tar.gz" -mtime +14 -delete

echo "Backup creat cu succes: $BACKUP_FILE"
