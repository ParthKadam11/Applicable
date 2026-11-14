#!/usr/bin/env bash
# Rebuild + restart Applicable Next.js (PM2). Run on the VPS after git pull.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WEB="$ROOT/web"
cd "$WEB"

if [[ ! -f .env.local ]]; then
  echo "ERROR: missing $WEB/.env.local" >&2
  exit 1
fi

echo "==> npm ci"
# VPS often has NODE_ENV=production (PM2); that would skip typescript/eslint
# and break `next.config.ts` + next build. Always install devDeps for build.
npm ci --no-fund --no-audit --include=dev

echo "==> clean .next"
rm -rf .next

echo "==> next build"
# Keep production mode for the Next build itself, not for npm install above.
NODE_ENV=production npm run build

echo "==> pm2 restart applicable-web (env from web/.env.local only)"
# PM2 dump can leak DATABASE_URL from other apps on this VPS (e.g. jobfit).
# Always delete + start with a clean env sourced from this project's .env.local.
pm2 delete applicable-web >/dev/null 2>&1 || true

# Parse KEY=VALUE lines safely into a temporary env file for PM2.
ENV_FILE="$(mktemp)"
trap 'rm -f "$ENV_FILE"' EXIT
# Strip CR, skip comments/blank, keep only simple KEY=VALUE assignments.
grep -E '^[A-Za-z_][A-Za-z0-9_]*=' .env.local | tr -d '\r' >"$ENV_FILE"
# Force production runtime for Next start.
grep -q '^NODE_ENV=' "$ENV_FILE" || echo 'NODE_ENV=production' >>"$ENV_FILE"

# Start with only PATH/HOME + project env — no inherited sibling-app secrets.
env -i \
  HOME="${HOME}" \
  PATH="${PATH}" \
  USER="${USER:-deployer}" \
  PM2_HOME="${PM2_HOME:-$HOME/.pm2}" \
  bash -c '
    set -euo pipefail
    set -a
    # shellcheck disable=SC1090
    source "'"$ENV_FILE"'"
    set +a
    cd "'"$WEB"'"
    pm2 start npm --name applicable-web --cwd "'"$WEB"'" -- start
  '

pm2 save

echo "==> smoke"
ok=0
for i in $(seq 1 30); do
  if curl -fsS -o /dev/null "http://127.0.0.1:3010/"; then
    ok=1
    break
  fi
  sleep 1
done
if [[ "$ok" -ne 1 ]]; then
  echo "ERROR: web did not become ready on :3010" >&2
  pm2 logs applicable-web --lines 40 --nostream || true
  exit 1
fi

# Verify API talks to Applicable DB (not a sibling project's Postgres).
jobs_body="$(curl -fsS "http://127.0.0.1:3010/api/jobs?limit=1" || true)"
if ! printf '%s' "$jobs_body" | grep -q '"items"'; then
  echo "ERROR: /api/jobs failed after deploy: $jobs_body" >&2
  pm2 env "$(pm2 jlist | python3 -c 'import sys,json; d=json.load(sys.stdin); print(next(p["pm_id"] for p in d if p["name"]=="applicable-web"))')" 2>/dev/null \
    | grep DATABASE_URL | sed 's/:[^:@]*@/:***@/' || true
  pm2 logs applicable-web --lines 40 --nostream || true
  exit 1
fi

echo "OK build=$(cat .next/BUILD_ID) routes=$(find .next/server/app -type d | wc -l)"
