#!/usr/bin/env bash
# ==============================================================================
# MCP ROMÂNIA - VPS Configuration Backup & Authenticated Restore Script
# ==============================================================================
# NOTĂ ARHITECTURALĂ:
#   Salvează EXCLUSIV fișierele de configurație de pe VPS (.env, docker-compose.yml, Caddyfile).
#   Datele aplicației și cotele sunt gestionate în Supabase Cloud și Upstash Cloud.
#
# CRIPTARE AUTENTIFICATĂ (2 moduri suportate, preferând age):
#   1) MOD RECOMANDAT (`age` asimetric AEAD ChaCha20-Poly1305):
#      - Instalează `age` pe VPS: apt-get update && apt-get install -y age
#      - Generează cheia offline sau pe VPS: age-keygen -o backup-age.key
#      - Pune DOAR cheia publică (`age1...`) în /root/.backup-age.pub (pe VPS),
#        iar cheia privată (`AGE-SECRET-KEY-1...`) păstreaz-o DOAR offline la tine!
#        Astfel, chiar dacă VPS-ul este compromis, backup-urile nu pot fi decriptate de pe VPS.
#   2) MOD FALLBACK (`openssl` AES-256-CBC + tag HMAC-SHA256 Encrypt-then-MAC):
#      - Folosit automat dacă BACKUP_PASSPHRASE este setat și `age` / cheia publică lipsesc.
#      - Generează un fișier `.hmac` separat și refuză decriptarea dacă ciphertext-ul a fost modificat.
#
# TEST PRACTIC DE RESTAURARE (extrage într-un director temporar izolat și verifică conținutul):
#   ./scripts/backup-mcpromania.sh --verify /var/backups/mcpromania/backup_YYYY.tar.gz.age
#   (pentru age, setează AGE_KEY_FILE=/cale/catre/backup-age.key; pentru HMAC, setează BACKUP_PASSPHRASE)
# ==============================================================================
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/var/backups/mcpromania}"
AGE_RECIPIENT_FILE="${AGE_RECIPIENT_FILE:-/root/.backup-age.pub}"
LOG_PREFIX="[$(date +'%Y-%m-%dT%H:%M:%S%z')][MCPR-BACKUP]"

verify_restore() {
    local archive_path="$1"
    if [[ ! -f "$archive_path" ]]; then
        echo "${LOG_PREFIX} [ERROR] Arhiva nu există: $archive_path" >&2
        exit 1
    fi

    local tmp_dir
    tmp_dir=$(mktemp -d /tmp/mcpr-restore-verify.XXXXXX)
    trap 'rm -rf "$tmp_dir"' RETURN

    echo "${LOG_PREFIX} Test practic de restaurare în director temporar izolat: $tmp_dir"

    if [[ "$archive_path" == *.age ]]; then
        if ! command -v age >/dev/null 2>&1; then
            echo "${LOG_PREFIX} [ERROR] Comanda 'age' lipsește pentru decriptarea arhivei .age." >&2
            exit 1
        fi
        if [[ -z "${AGE_KEY_FILE:-}" || ! -f "${AGE_KEY_FILE}" ]]; then
            echo "${LOG_PREFIX} [ERROR] Setează AGE_KEY_FILE=/cale/cheie-privata.key pentru testul de restaurare." >&2
            exit 1
        fi
        age -d -i "$AGE_KEY_FILE" "$archive_path" | tar -xzf - -C "$tmp_dir"
    elif [[ "$archive_path" == *.enc ]]; then
        local hmac_file="${archive_path}.hmac"
        if [[ ! -f "$hmac_file" ]]; then
            echo "${LOG_PREFIX} [ERROR] Lipsește fișierul de autentificare HMAC ($hmac_file). Refuz decriptarea!" >&2
            exit 1
        fi
        if [[ -z "${BACKUP_PASSPHRASE:-}" ]]; then
            echo "${LOG_PREFIX} [ERROR] BACKUP_PASSPHRASE este necesar pentru verificarea HMAC și decriptare." >&2
            exit 1
        fi
        export BACKUP_PASSPHRASE
        local expected_hmac actual_hmac
        expected_hmac=$(cat "$hmac_file")
        actual_hmac=$(openssl dgst -sha256 -hmac "$BACKUP_PASSPHRASE" "$archive_path" | awk '{print $NF}')
        if [[ "$expected_hmac" != "$actual_hmac" ]]; then
            echo "${LOG_PREFIX} [ERROR] Eșec de autentificare HMAC! Arhiva a fost modificată sau parola este greșită." >&2
            exit 1
        fi
        echo "${LOG_PREFIX} Autentificare HMAC-SHA256 validată cu succes."
        openssl enc -d -aes-256-cbc -pbkdf2 -pass env:BACKUP_PASSPHRASE -in "$archive_path" | tar -xzf - -C "$tmp_dir"
    else
        echo "${LOG_PREFIX} [ERROR] Format de arhivă neautentificat/nesuportat pentru restaurare: $archive_path" >&2
        exit 1
    fi

    local restored_count
    restored_count=$(find "$tmp_dir" -type f | wc -l)
    if [[ "$restored_count" -eq 0 ]]; then
        echo "${LOG_PREFIX} [ERROR] Arhiva decriptată nu conține niciun fișier!" >&2
        exit 1
    fi

    echo "${LOG_PREFIX} [SUCCESS] Restaurare practică reușită ($restored_count fișiere extrase și verificate):"
    find "$tmp_dir" -type f -exec ls -lh {} +
}

if [[ "${1:-}" == "--verify" ]]; then
    if [[ -z "${2:-}" ]]; then
        echo "Utilizare: $0 --verify /cale/catre/backup.tar.gz.age|.enc" >&2
        exit 1
    fi
    verify_restore "$2"
    exit 0
fi

TIMESTAMP=$(date +"%Y-%m-%d_%H%M%S")
BACKUP_ARCHIVE="${BACKUP_DIR}/backup_${TIMESTAMP}.tar.gz"
trap 'rm -f "$BACKUP_ARCHIVE"; echo "${LOG_PREFIX} [ERROR] Scriptul de backup a eșuat la linia $LINENO." >&2; exit 1' ERR

echo "${LOG_PREFIX} Începere backup autentificat configurație VPS..."

# 1. Asigură existența directorului cu permisiuni stricte (doar root)
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

# 2. Colectează fișierele de configurație existente
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

# 3. Determină modul de criptare autentificată (preferă age cu cheie publică)
USE_AGE=0
if command -v age >/dev/null 2>&1 && [[ -f "$AGE_RECIPIENT_FILE" ]]; then
    USE_AGE=1
elif [[ "$CONTAINS_ENV" -eq 1 && -z "${BACKUP_PASSPHRASE:-}" ]]; then
    echo "${LOG_PREFIX} [ERROR] Arhiva conține .env, dar nici age ($AGE_RECIPIENT_FILE), nici BACKUP_PASSPHRASE nu sunt configurate. Refuz salvarea necriptată!" >&2
    exit 1
fi

# 4. Creează arhiva tar.gz
tar -czf "$BACKUP_ARCHIVE" "${FILES_TO_BACKUP[@]}"
tar -tzf "$BACKUP_ARCHIVE" >/dev/null

# 5. Criptare autentificată
FINAL_BACKUP=""
if [[ "$USE_AGE" -eq 1 ]]; then
    FINAL_BACKUP="${BACKUP_ARCHIVE}.age"
    age -R "$AGE_RECIPIENT_FILE" -o "$FINAL_BACKUP" "$BACKUP_ARCHIVE"
    rm -f "$BACKUP_ARCHIVE"
    chmod 600 "$FINAL_BACKUP"
    echo "${LOG_PREFIX} Arhiva a fost criptată și autentificată cu age (ChaCha20-Poly1305 AEAD)."
else
    export BACKUP_PASSPHRASE
    FINAL_BACKUP="${BACKUP_ARCHIVE}.enc"
    openssl enc -aes-256-cbc -salt -pbkdf2 \
        -in "$BACKUP_ARCHIVE" \
        -out "$FINAL_BACKUP" \
        -pass env:BACKUP_PASSPHRASE
    rm -f "$BACKUP_ARCHIVE"
    chmod 600 "$FINAL_BACKUP"
    # Encrypt-then-MAC: generează tag HMAC-SHA256 peste ciphertext
    openssl dgst -sha256 -hmac "$BACKUP_PASSPHRASE" "$FINAL_BACKUP" | awk '{print $NF}' > "${FINAL_BACKUP}.hmac"
    chmod 600 "${FINAL_BACKUP}.hmac"
    echo "${LOG_PREFIX} Arhiva a fost criptată AES-256-CBC și autentificată cu HMAC-SHA256 (${FINAL_BACKUP}.hmac)."
fi

# 6. Rotație: șterge backup-urile mai vechi de 14 zile
find "$BACKUP_DIR" -type f \( -name "backup_*.tar.gz" -o -name "backup_*.tar.gz.enc" -o -name "backup_*.tar.gz.enc.hmac" -o -name "backup_*.tar.gz.age" \) -mtime +14 -delete

echo "${LOG_PREFIX} [SUCCESS] Backup configurație VPS finalizat: $FINAL_BACKUP ($(du -h "$FINAL_BACKUP" | cut -f1))"
