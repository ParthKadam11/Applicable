#!/usr/bin/env bash
# Enable joinwaitlist.parthkadam.tech → applicable-web :3010. Needs sudo + DNS A record.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
ENABLED=/etc/nginx/sites-enabled
CONF="$ROOT/joinwaitlist.parthkadam.tech.conf"

# Drop old waitlist.* vhost if it was linked earlier
sudo rm -f "$ENABLED/waitlist.parthkadam.tech.conf"

sudo ln -sfn "$CONF" "$ENABLED/joinwaitlist.parthkadam.tech.conf"
sudo nginx -t
sudo systemctl reload nginx

if ! sudo test -f /etc/letsencrypt/live/joinwaitlist.parthkadam.tech/fullchain.pem; then
  sudo certbot --nginx -d joinwaitlist.parthkadam.tech --non-interactive --agree-tos \
    --register-unsafely-without-email --redirect
else
  sudo nginx -t && sudo systemctl reload nginx
fi

echo "joinwaitlist.parthkadam.tech enabled → 127.0.0.1:3010 (/waitlist)"
echo "  site: https://joinwaitlist.parthkadam.tech"
