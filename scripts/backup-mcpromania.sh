#!/usr/bin/env bash
# ==============================================================================
# MCP ROMÂNIA - Production Backup Script
# ==============================================================================
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/var/backups/mcpromania}"
TIMESTAMP=$(date +"%Y-%m-%d_%H%M%S")
BACKUP_ARCHIVE="${BACKUP_DIR}/backup_${TIMESTAMP}.tar.gz"
LOG_PREFIX="[$(date +'%Y-%m-%dT%H:%M:%S%z')][MCPR-BACKUP]"

trap 'echo "${LOG_PREFIX} [ERROR] Scriptul de backup a eșuat la linia $LINENO." >&2; exit 1' ERR

echo "${LOG_PREFIX} Începere procedură backup..."

# 1. Asigură existența directorului cu permisiuni stricte (doar root)
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

# 2. Trigger Redis Snapshot (BGSAVE) dacă Redis este instalat / rulează
if command -v redis-cli >/dev/null 2>&1; then
    echo "${LOG_PREFIX} Salvare snapshot memorie Redis (BGSAVE)..."
    redis-cli bgsave 2>/dev/null || true
    sleep 2
fi

# 3. Colectează fișierele existente pentru arhivă
FILES_TO_BACKUP=()
CANDIDATES=(
    "/opt/mcpromania/.env"
    "/opt/mcpromania/docker-compose.yml"
    "/etc/caddy/Caddyfile"
    "/var/lib/redis/dump.rdb"
)

for file in "${CANDIDATES[@]}"; do
    if [[ -f "$file" ]]; then
        FILES_TO_BACKUP+=("$file")
        echo "${LOG_PREFIX} Adăugat în backup: $file"
    else
        echo "${LOG_PREFIX} [INFO] Fișierul nu a fost găsit (omite): $file"
    fi
done

if [[ ${#FILES_TO_BACKUP[@]} -eq 0 ]]; then
    echo "${LOG_PREFIX} [ERROR] Niciun fișier critic nu a fost găsit pentru backup." >&2
    exit 1
fi

# 4. Creează arhiva tar.gz
tar -czf "$BACKUP_ARCHIVE" "${FILES_TO_BACKUP[@]}"

# 5. Criptare opțională dacă BACKUP_PASSPHRASE este definit în mediu
FINAL_BACKUP="$BACKUP_ARCHIVE"
if [[ -n "${BACKUP_PASSPHRASE:-}" ]]; then
    ENCRYPTED_FILE="${BACKUP_ARCHIVE}.enc"
    openssl enc -aes-256-cbc -salt -pbkdf2 \
        -in "$BACKUP_ARCHIVE" \
        -out "$ENCRYPTED_FILE" \
        -pass "pass:${BACKUP_PASSPHRASE}"
    rm -f "$BACKUP_ARCHIVE"
    FINAL_BACKUP="$ENCRYPTED_FILE"
    echo "${LOG_PREFIX} Arhiva a fost criptată cu succes cu AES-256."
fi

# 6. Setează permisiuni stricte 0600 pe fișierul final
chmod 600 "$FINAL_BACKUP"

# 7. Rotație: șterge backup-urile mai vechi de 14 zile
find "$BACKUP_DIR" -type f \( -name "backup_*.tar.gz" -o -name "backup_*.tar.gz.enc" \) -mtime +14 -delete

echo "${LOG_PREFIX} [SUCCESS] Backup finalizat cu succes: $FINAL_BACKUP ($(du -h "$FINAL_BACKUP" | cut -f1))"
