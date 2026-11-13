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
npm ci --no-fund --no-audit

echo "==> clean .next"
rm -rf .next

echo "==> next build"
npm run build

echo "==> pm2 restart applicable-web"
if pm2 describe applicable-web >/dev/null 2>&1; then
  pm2 restart applicable-web --update-env
else
  pm2 start npm --name applicable-web --cwd "$WEB" -- start
fi
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
echo "OK build=$(cat .next/BUILD_ID) routes=$(find .next/server/app -type d | wc -l)"
