#!/usr/bin/env bash
# Run once on the VPS (needs sudo): enable mcp.parthkadam.tech + TLS.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
ENABLED=/etc/nginx/sites-enabled
CONF="$ROOT/mcp.parthkadam.tech.conf"

sudo ln -sfn "$CONF" "$ENABLED/mcp.parthkadam.tech.conf"
sudo nginx -t
sudo systemctl reload nginx

if ! sudo test -f /etc/letsencrypt/live/mcp.parthkadam.tech/fullchain.pem; then
  sudo certbot --nginx -d mcp.parthkadam.tech --non-interactive --agree-tos \
    --register-unsafely-without-email --redirect
else
  sudo nginx -t && sudo systemctl reload nginx
fi

echo "mcp.parthkadam.tech enabled"
echo "  health: https://mcp.parthkadam.tech/health"
echo "  mcp:    https://mcp.parthkadam.tech/mcp"
