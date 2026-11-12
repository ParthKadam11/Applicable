#!/usr/bin/env bash
# Daily Postgres dump for Applicable (runs on the VPS host).
# Keeps the last 7 days of gzipped SQL dumps under BACKUP_DIR.
#
# Cron (as root):
#   0 3 * * * /opt/applicable/scripts/backup-postgres.sh >> /var/log/applicable-backup.log 2>&1
#
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/root/backups}"
CONTAINER="${POSTGRES_CONTAINER:-applicable-postgres}"
KEEP_DAYS="${KEEP_DAYS:-7}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="${BACKUP_DIR}/applicable-${STAMP}.sql.gz"

mkdir -p "${BACKUP_DIR}"

if ! docker ps --format '{{.Names}}' | grep -qx "${CONTAINER}"; then
  echo "[backup] container ${CONTAINER} is not running" >&2
  exit 1
fi

echo "[backup] dumping ${CONTAINER} → ${OUT}"
docker exec "${CONTAINER}" pg_dump -U "${POSTGRES_USER:-applicable}" -d "${POSTGRES_DB:-applicable}" \
  | gzip -c > "${OUT}"

# Drop dumps older than KEEP_DAYS
find "${BACKUP_DIR}" -maxdepth 1 -type f -name 'applicable-*.sql.gz' -mtime "+${KEEP_DAYS}" -print -delete

echo "[backup] done ($(du -h "${OUT}" | cut -f1))"
ls -lh "${BACKUP_DIR}"/applicable-*.sql.gz 2>/dev/null || true
