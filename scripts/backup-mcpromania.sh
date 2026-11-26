#!/usr/bin/env bash
# ==============================================================================
# MCP ROMÂNIA - VPS Configuration Backup Script
# ==============================================================================
# NOTĂ ARHITECTURALĂ:
#   Acest script salvează EXCLUSIV fișierele de configurație de pe VPS
#   (.env, docker-compose.yml, Caddyfile).
#   Datele aplicației și cotele sunt gestionate extern în:
#     - Supabase Cloud (PostgreSQL + backup-uri/PITR gestionate în dashboard)
#     - Upstash Cloud (Redis gestionat în dashboard)
#
# UTILIZARE:
#   export BACKUP_PASSPHRASE="parola-puternica-aici"
#   ./scripts/backup-mcpromania.sh
#
# RESTAURARE CONFIGURAȚIE (pe VPS nou sau după incident):
#   export BACKUP_PASSPHRASE="parola-folosita-la-backup"
#   openssl enc -d -aes-256-cbc -pbkdf2 -pass env:BACKUP_PASSPHRASE \
#     -in /var/backups/mcpromania/backup_YYYY-MM-DD_HHMMSS.tar.gz.enc \
#     | tar -xzf - -C /
# ==============================================================================
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/var/backups/mcpromania}"
TIMESTAMP=$(date +"%Y-%m-%d_%H%M%S")
BACKUP_ARCHIVE="${BACKUP_DIR}/backup_${TIMESTAMP}.tar.gz"
LOG_PREFIX="[$(date +'%Y-%m-%dT%H:%M:%S%z')][MCPR-BACKUP]"

trap 'rm -f "$BACKUP_ARCHIVE"; echo "${LOG_PREFIX} [ERROR] Scriptul de backup a eșuat la linia $LINENO." >&2; exit 1' ERR

echo "${LOG_PREFIX} Începere backup configurație VPS..."

# 1. Asigură existența directorului cu permisiuni stricte (doar root)
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

# 2. Colectează fișierele de configurație existente pentru arhivă
FILES_TO_BACKUP=()
CONTAINS_ENV=0
CANDIDATES=(
    "/opt/mcpromania/.env"
    "/opt/mcpromania/docker-compose.yml"
    "/etc/caddy/Caddyfile"
)

for file in "${CANDIDATES[@]}"; do
    if [[ -f "$file" ]]; then
        FILES_TO_BACKUP+=("$file")
        echo "${LOG_PREFIX} Adăugat în backup: $file"
        if [[ "$file" == */.env ]]; then
            CONTAINS_ENV=1
        fi
    else
        echo "${LOG_PREFIX} [INFO] Fișierul nu a fost găsit (omite): $file"
    fi
done

if [[ ${#FILES_TO_BACKUP[@]} -eq 0 ]]; then
    echo "${LOG_PREFIX} [ERROR] Niciun fișier de configurație nu a fost găsit pentru backup." >&2
    exit 1
fi

# 3. Impune criptare obligatorie dacă arhiva conține .env (secrete live)
if [[ "$CONTAINS_ENV" -eq 1 && -z "${BACKUP_PASSPHRASE:-}" ]]; then
    echo "${LOG_PREFIX} [ERROR] Arhiva conține .env, dar BACKUP_PASSPHRASE nu este setat. Refuz salvarea necriptată!" >&2
    exit 1
fi

# 4. Creează și verifică integritatea arhivei tar.gz
tar -czf "$BACKUP_ARCHIVE" "${FILES_TO_BACKUP[@]}"
tar -tzf "$BACKUP_ARCHIVE" >/dev/null
echo "${LOG_PREFIX} Arhiva tar.gz creată și verificată."

# 5. Criptare AES-256-CBC prin variabilă de mediu (nu expune parola în `ps`)
FINAL_BACKUP="$BACKUP_ARCHIVE"
if [[ -n "${BACKUP_PASSPHRASE:-}" ]]; then
    export BACKUP_PASSPHRASE
    ENCRYPTED_FILE="${BACKUP_ARCHIVE}.enc"
    openssl enc -aes-256-cbc -salt -pbkdf2 \
        -in "$BACKUP_ARCHIVE" \
        -out "$ENCRYPTED_FILE" \
        -pass env:BACKUP_PASSPHRASE
    rm -f "$BACKUP_ARCHIVE"
    FINAL_BACKUP="$ENCRYPTED_FILE"
    echo "${LOG_PREFIX} Arhiva a fost criptată cu succes cu AES-256."
fi

# 6. Setează permisiuni stricte 0600 pe fișierul final
chmod 600 "$FINAL_BACKUP"

# 7. Rotație: șterge backup-urile mai vechi de 14 zile
find "$BACKUP_DIR" -type f \( -name "backup_*.tar.gz" -o -name "backup_*.tar.gz.enc" \) -mtime +14 -delete

echo "${LOG_PREFIX} [SUCCESS] Backup configurație VPS finalizat: $FINAL_BACKUP ($(du -h "$FINAL_BACKUP" | cut -f1))"
