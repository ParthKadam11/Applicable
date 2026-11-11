#!/usr/bin/env bash
# Daily Postgres dump for CaniApply (runs on the VPS host).
# Keeps the last 7 days of gzipped SQL dumps under BACKUP_DIR.
#
# Cron (as root):
#   0 3 * * * /opt/caniapply/scripts/backup-postgres.sh >> /var/log/caniapply-backup.log 2>&1
#
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/root/backups}"
CONTAINER="${POSTGRES_CONTAINER:-caniapply-postgres}"
KEEP_DAYS="${KEEP_DAYS:-7}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="${BACKUP_DIR}/caniapply-${STAMP}.sql.gz"

mkdir -p "${BACKUP_DIR}"

if ! docker ps --format '{{.Names}}' | grep -qx "${CONTAINER}"; then
  echo "[backup] container ${CONTAINER} is not running" >&2
  exit 1
fi

echo "[backup] dumping ${CONTAINER} → ${OUT}"
docker exec "${CONTAINER}" pg_dump -U "${POSTGRES_USER:-caniapply}" -d "${POSTGRES_DB:-caniapply}" \
  | gzip -c > "${OUT}"

# Drop dumps older than KEEP_DAYS
find "${BACKUP_DIR}" -maxdepth 1 -type f -name 'caniapply-*.sql.gz' -mtime "+${KEEP_DAYS}" -print -delete

echo "[backup] done ($(du -h "${OUT}" | cut -f1))"
ls -lh "${BACKUP_DIR}"/caniapply-*.sql.gz 2>/dev/null || true
