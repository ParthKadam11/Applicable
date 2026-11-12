#!/usr/bin/env bash
# Enable applicable.parthkadam.tech (Next.js) + reload mcp vhost (/api). Needs sudo.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
ENABLED=/etc/nginx/sites-enabled

sudo ln -sfn "$ROOT/applicable.parthkadam.tech.conf" "$ENABLED/applicable.parthkadam.tech.conf"
# mcp.conf is already symlinked; reload picks up /api/ block if it was added later
sudo nginx -t
sudo systemctl reload nginx

if ! sudo test -f /etc/letsencrypt/live/applicable.parthkadam.tech/fullchain.pem; then
  sudo certbot --nginx -d applicable.parthkadam.tech --non-interactive --agree-tos \
    --register-unsafely-without-email --redirect
else
  sudo nginx -t && sudo systemctl reload nginx
fi

echo "applicable.parthkadam.tech enabled → 127.0.0.1:3010"
echo "  site: https://applicable.parthkadam.tech"
echo "Also reloaded mcp.parthkadam.tech (for /api/* → :3110)"
