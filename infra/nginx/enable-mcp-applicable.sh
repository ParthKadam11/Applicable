#!/usr/bin/env bash
# Enable mcp.applicable.click → :3110 with Let's Encrypt TLS.
# Legacy mcp.parthkadam.tech → 301 redirect to branded host.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
CONF="$ROOT/mcp.applicable.click.conf"
LEGACY="$ROOT/mcp.parthkadam.tech.conf"
ENABLED=/etc/nginx/sites-enabled
NEW_HOST=mcp.applicable.click

sudo ln -sfn "$CONF" "$ENABLED/mcp.applicable.click.conf"
sudo ln -sfn "$LEGACY" "$ENABLED/mcp.parthkadam.tech.conf"
sudo nginx -t
sudo systemctl reload nginx

if ! sudo test -f "/etc/letsencrypt/live/${NEW_HOST}/fullchain.pem"; then
  sudo certbot --nginx -d "$NEW_HOST" --non-interactive --agree-tos \
    --register-unsafely-without-email --redirect
else
  sudo nginx -t && sudo systemctl reload nginx
fi

echo "${NEW_HOST} enabled"
echo "  health: https://${NEW_HOST}/health"
echo "  mcp:    https://${NEW_HOST}"
echo "Legacy mcp.parthkadam.tech → 301 https://${NEW_HOST}"
