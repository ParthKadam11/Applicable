#!/usr/bin/env bash
# Enable applicable.click (Next.js). MCP is mcp.applicable.click (separate vhost).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
ENABLED=/etc/nginx/sites-enabled
DOMAIN=applicable.click

sudo ln -sfn "$ROOT/${DOMAIN}.conf" "$ENABLED/${DOMAIN}.conf"

# Remove legacy main-site vhost (waitlist stays)
sudo rm -f "$ENABLED/applicable.parthkadam.tech.conf"

sudo nginx -t
sudo systemctl reload nginx

if ! sudo test -f "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem"; then
  sudo certbot --nginx -d "$DOMAIN" -d "www.${DOMAIN}" --non-interactive --agree-tos \
    --register-unsafely-without-email --redirect
else
  sudo nginx -t && sudo systemctl reload nginx
fi

echo "${DOMAIN} enabled → 127.0.0.1:3010"
echo "  site: https://${DOMAIN}"
echo "MCP: https://mcp.applicable.click (see enable-mcp-applicable.sh)"
echo "joinwaitlist.parthkadam.tech left unchanged"
