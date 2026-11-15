#!/usr/bin/env bash
# Enable mcp.applicable.click → :3110 with Let's Encrypt TLS.
# Keeps mcp.parthkadam.tech; optionally redirects it after cert is live.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
CONF="$ROOT/mcp.applicable.click.conf"
ENABLED=/etc/nginx/sites-enabled
OLD_HOST=mcp.parthkadam.tech
NEW_HOST=mcp.applicable.click

sudo ln -sfn "$CONF" "$ENABLED/mcp.applicable.click.conf"
sudo nginx -t
sudo systemctl reload nginx

if ! sudo test -f "/etc/letsencrypt/live/${NEW_HOST}/fullchain.pem"; then
  sudo certbot --nginx -d "$NEW_HOST" --non-interactive --agree-tos \
    --register-unsafely-without-email --redirect
else
  sudo certbot install --cert-name "$NEW_HOST" --nginx --non-interactive || true
  sudo nginx -t && sudo systemctl reload nginx
fi

echo "${NEW_HOST} enabled"
echo "  health: https://${NEW_HOST}/health"
echo "  mcp:    https://${NEW_HOST}/mcp"
echo "Legacy ${OLD_HOST} is still live until you point clients at the new host."
