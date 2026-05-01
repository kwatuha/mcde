#!/usr/bin/env bash
#
# Run ON THE SERVER (as root or with sudo) after DNS for monitoring.icskenya.co.ke points here
# and Machakos Docker nginx is listening on 127.0.0.1:8084.
#
# Usage:
#   sudo bash deploy/install-ssl-nginx-on-server.sh
#
# Requires: nginx, certbot (python3-certbot-nginx on Debian/Ubuntu)
#
set -euo pipefail

DOMAIN="${MACHAKOS_DOMAIN:-monitoring.icskenya.co.ke}"
CONF_SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/deploy/snippets/nginx-monitoring.icskenya.co.ke.conf"
CONF_DST="/etc/nginx/sites-available/machakos-monitoring.conf"

if [[ "${EUID:-0}" -ne 0 ]]; then
  echo "Run as root: sudo $0" >&2
  exit 1
fi

if [[ ! -f "$CONF_SRC" ]]; then
  echo "Missing $CONF_SRC" >&2
  exit 1
fi

cp -v "$CONF_SRC" "$CONF_DST"
ln -sf "$CONF_DST" /etc/nginx/sites-enabled/machakos-monitoring.conf
nginx -t
systemctl reload nginx

echo "==> HTTP reverse proxy installed. Obtain certificate:"
echo "    certbot --nginx -d $DOMAIN"
echo "Or non-interactive (set email):"
echo "    certbot --nginx -d $DOMAIN --non-interactive --agree-tos -m YOUR_EMAIL@icskenya.co.ke --redirect"
