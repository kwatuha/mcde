#!/usr/bin/env bash
#
# Run ON THE MCmes SERVER (as root or with sudo) after DNS for cimes.machakos.go.ke
# points at this host (A -> 84.247.128.58) and Docker nginx is on 127.0.0.1:8084.
#
# Usage:
#   sudo bash deploy/install-cimes-nginx-on-server.sh
#   sudo bash deploy/install-cimes-nginx-on-server.sh --certbot   # also issue TLS cert
#
# Optional:
#   MACHAKOS_CIMES_EMAIL=ictreports@machakos.go.ke  # required with --certbot (Let's Encrypt)
#   MACHAKOS_DOMAIN=cimes.machakos.go.ke
#
# Requires: nginx; for --certbot also certbot (python3-certbot-nginx)
#
set -euo pipefail

DOMAIN="${MACHAKOS_DOMAIN:-cimes.machakos.go.ke}"
RUN_CERTBOT=0
for arg in "$@"; do
  case "$arg" in
    --certbot) RUN_CERTBOT=1 ;;
    -h|--help)
      sed -n '2,20p' "$0"
      exit 0
      ;;
  esac
done

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONF_SRC="${REPO_ROOT}/deploy/snippets/nginx-cimes.machakos.go.ke.conf"
CONF_DST="/etc/nginx/sites-available/cimes.machakos.go.ke.conf"
ENABLED_LINK="/etc/nginx/sites-enabled/cimes.machakos.go.ke.conf"

if [[ "${EUID:-0}" -ne 0 ]]; then
  echo "Run as root: sudo $0 $*" >&2
  exit 1
fi

if [[ ! -f "$CONF_SRC" ]]; then
  echo "Missing $CONF_SRC" >&2
  exit 1
fi

if ! command -v nginx >/dev/null 2>&1; then
  echo "nginx not found. Install nginx first." >&2
  exit 1
fi

cp -v "$CONF_SRC" "$CONF_DST"
ln -sf "$CONF_DST" "$ENABLED_LINK"
nginx -t
systemctl reload nginx

echo "==> HTTP reverse proxy installed for ${DOMAIN} → 127.0.0.1:8084"

if [[ "$RUN_CERTBOT" != "1" ]]; then
  echo "==> Obtain certificate:"
  echo "    certbot --nginx -d ${DOMAIN}"
  echo "Or re-run with --certbot (set MACHAKOS_CIMES_EMAIL):"
  echo "    MACHAKOS_CIMES_EMAIL=ictreports@machakos.go.ke sudo -E bash $0 --certbot"
  exit 0
fi

if ! command -v certbot >/dev/null 2>&1; then
  echo "certbot not found. Install python3-certbot-nginx, then re-run with --certbot." >&2
  exit 1
fi

EMAIL="${MACHAKOS_CIMES_EMAIL:-}"
if [[ -z "$EMAIL" ]]; then
  echo "Set MACHAKOS_CIMES_EMAIL for non-interactive certbot." >&2
  exit 1
fi

certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "$EMAIL" --redirect
nginx -t
systemctl reload nginx
echo "==> HTTPS ready: https://${DOMAIN}/"
