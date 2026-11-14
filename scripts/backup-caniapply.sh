#!/usr/bin/env bash
# Nightly Postgres dump for caniapply (host cron as deployer).
# Gzipped SQL → /home/deployer/backups, keep 7 days.
#
# Proposed cron (NOT enabled yet):
#   0 3 * * * set -a; . /home/deployer/apps/CaniApply/.env; set +a; \
#     /home/deployer/apps/CaniApply/scripts/backup-caniapply.sh \
#     >> /home/deployer/backups/backup.log 2>&1
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck disable=SC1091
if [[ -f "${ROOT}/.env" ]]; then
  set -a
  # Prefer explicit env; .env supplies POSTGRES_* when cron loads it
  # (cron line above already sources .env — this is for manual runs).
  source "${ROOT}/.env"
  set +a
fi

BACKUP_DIR="${BACKUP_DIR:-/home/deployer/backups}"
CONTAINER="${POSTGRES_CONTAINER:-applicable-postgres}"
KEEP_DAYS="${KEEP_DAYS:-7}"
PGUSER="${POSTGRES_USER:-caniapply}"
PGDB="${POSTGRES_DB:-caniapply}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="${BACKUP_DIR}/caniapply-${STAMP}.sql.gz"

mkdir -p "${BACKUP_DIR}"

if ! docker ps --format '{{.Names}}' | grep -qx "${CONTAINER}"; then
  echo "[backup] container ${CONTAINER} is not running" >&2
  exit 1
fi

echo "[backup] dumping ${CONTAINER} ${PGUSER}@${PGDB} → ${OUT}"
docker exec "${CONTAINER}" pg_dump -U "${PGUSER}" -d "${PGDB}" \
  | gzip -c > "${OUT}"

find "${BACKUP_DIR}" -maxdepth 1 -type f -name 'caniapply-*.sql.gz' -mtime "+${KEEP_DAYS}" -print -delete

echo "[backup] done ($(du -h "${OUT}" | cut -f1))"
ls -lh "${BACKUP_DIR}"/caniapply-*.sql.gz 2>/dev/null || true
