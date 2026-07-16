#!/usr/bin/env bash
#
# Deploy Machakos / MCmes to administrator@84.247.128.58 behind cimes.machakos.go.ke.
#
# Usage:
#   chmod +x deploy/mcmes-deploy.sh
#   ./deploy/mcmes-deploy.sh
#
# Overrides (optional):
#   DEPLOY_HOST=84.247.128.58 DEPLOY_USER=administrator DEPLOY_PATH=/home/administrator/dev/machakos
#   SSH_IDENTITY=~/.ssh/id_asusme ./deploy/mcmes-deploy.sh   # default key; override if needed
#   MCMES_DOMAIN=cimes.machakos.go.ke       # public hostname (HTTPS via system nginx)
#   MCMES_PUBLIC_URL=https://cimes.machakos.go.ke
#   MCMES_HTTP_PORT=8084                    # docker nginx_proxy listen port (see nginx/nginx.conf)
#   MCMES_FORCE_ENV_DEPLOY=1                # overwrite remote deploy/.env.deploy
#   DEPLOY_SYNC_UPLOADS=0                   # skip media sync
#   docs/ is not synced (local-only); override: DEPLOY_RSYNC_EXTRA_EXCLUDES=""
#   DEPLOY_SYNC_DB=1 DEPLOY_SYNC_DB_CONFIRM=yes   # destructive DB push (see deploy-to-server.sh)
#   After cloning DB from source (sync-source-db-to-mcmes.sh), copy media files too:
#     DEPLOY_SYNC_UPLOADS_CONFIRM=yes ./deploy/sync-source-uploads-to-mcmes.sh
#   DEPLOY_SYNC_UPLOADS=1 syncs uploads from YOUR LAPTOP only — not from the source server.
#
# First-time on server:
#   - Docker + docker compose plugin
#   - mkdir -p "$DEPLOY_PATH"
#   - api/.env with DB_* (not rsync'd). Set at minimum:
#       APP_LOGIN_URL=https://cimes.machakos.go.ke/login
#       APP_FRONTEND_URL=https://cimes.machakos.go.ke
#       ADVANTA_PARTNER_ID, ADVANTA_API_KEY, ADVANTA_SHORT_CODE (SMS OTP; see api/.env.remote.example)
#   - DNS A: cimes.machakos.go.ke -> 84.247.128.58
#   - System nginx + TLS: sudo bash deploy/install-cimes-nginx-on-server.sh --certbot
#   - sudo ufw allow 80,443/tcp (and 8084 if you still use the IP URL)
#   - Run DB migrations manually (deploy does not migrate)
#
# Access after deploy:
#   Staff:   https://cimes.machakos.go.ke/
#   Citizen: https://cimes.machakos.go.ke/citizen/
#   Direct:  http://84.247.128.58:8084/ (still works; prefer the subdomain)
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

DEPLOY_HOST="${DEPLOY_HOST:-84.247.128.58}"
DEPLOY_USER="${DEPLOY_USER:-administrator}"
DEPLOY_PATH="${DEPLOY_PATH:-/home/administrator/dev/machakos}"
MCMES_HTTP_PORT="${MCMES_HTTP_PORT:-8084}"
MCMES_FORCE_ENV_DEPLOY="${MCMES_FORCE_ENV_DEPLOY:-0}"
SSH_IDENTITY="${SSH_IDENTITY:-$HOME/.ssh/id_asusme}"
MCMES_DOMAIN="${MCMES_DOMAIN:-cimes.machakos.go.ke}"

MCMES_PUBLIC_URL="${MCMES_PUBLIC_URL:-https://${MCMES_DOMAIN}}"
MCMES_CITIZEN_PUBLIC_URL="${MCMES_CITIZEN_PUBLIC_URL:-${MCMES_PUBLIC_URL}/citizen}"

SSH_OPTS=(-o StrictHostKeyChecking=accept-new)
if [[ -n "$SSH_IDENTITY" ]]; then
  SSH_OPTS+=(-i "${SSH_IDENTITY/#\~/$HOME}")
fi
REMOTE="${DEPLOY_USER}@${DEPLOY_HOST}"

load_local_maps_key() {
  if [[ -n "${VITE_MAPS_API_KEY:-}" ]]; then
    return 0
  fi
  if [[ -f "$ROOT/api/.env" ]]; then
    VITE_MAPS_API_KEY="$(grep -E '^VITE_MAPS_API_KEY=' "$ROOT/api/.env" | head -1 | cut -d= -f2- | tr -d '"' || true)"
  fi
}

ensure_mcmes_compose_env() {
  load_local_maps_key
  local cert_name="${VITE_CERT_COUNTY_NAME:-County Government of Machakos}"
  echo "==> Ensuring remote deploy/.env.deploy for ${MCMES_PUBLIC_URL}"
  ssh "${SSH_OPTS[@]}" "$REMOTE" bash -s <<REMOTE_EOF
set -euo pipefail
DEPLOY_PATH="${DEPLOY_PATH}"
FORCE="${MCMES_FORCE_ENV_DEPLOY}"
ENV_FILE="\$DEPLOY_PATH/deploy/.env.deploy"
mkdir -p "\$DEPLOY_PATH/deploy"
if [[ "\$FORCE" == "1" || ! -f "\$ENV_FILE" ]]; then
  cat > "\$ENV_FILE" <<ENV
MACHAKOS_PUBLIC_URL=${MCMES_PUBLIC_URL}
MACHAKOS_CITIZEN_PUBLIC_URL=${MCMES_CITIZEN_PUBLIC_URL}
MACHAKOS_CITIZEN_BASE_PATH=/citizen/
MACHAKOS_API_PROXY=http://host.docker.internal:3002
VITE_MAPS_API_KEY=${VITE_MAPS_API_KEY:-}
VITE_CERT_COUNTY_NAME=${cert_name}
ENV
  echo "Wrote \$ENV_FILE"
else
  echo "Keeping existing \$ENV_FILE (set MCMES_FORCE_ENV_DEPLOY=1 to replace)"
fi
REMOTE_EOF
}

warn_server_api_env() {
  echo "==> Checking remote api/.env login URL hints"
  ssh "${SSH_OPTS[@]}" "$REMOTE" bash -s <<REMOTE_EOF || true
set -euo pipefail
ENV_FILE="${DEPLOY_PATH}/api/.env"
if [[ ! -f "\$ENV_FILE" ]]; then
  echo "WARNING: ${DEPLOY_PATH}/api/.env missing — create it with DB_* and APP_LOGIN_URL=${MCMES_PUBLIC_URL}/login" >&2
  exit 0
fi
login_url="\$(grep -E '^APP_LOGIN_URL=' "\$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '"' || true)"
if [[ -z "\$login_url" ]]; then
  echo "WARNING: Add APP_LOGIN_URL=${MCMES_PUBLIC_URL}/login to api/.env (password-reset emails)." >&2
elif [[ "\$login_url" != *"${MCMES_DOMAIN}"* && "\$login_url" != *"${DEPLOY_HOST}"* ]]; then
  echo "WARNING: APP_LOGIN_URL is '\$login_url' but MCmes URL is ${MCMES_PUBLIC_URL}/login" >&2
else
  echo "APP_LOGIN_URL looks aligned: \$login_url"
fi
REMOTE_EOF
}

print_http_caveats() {
  cat <<EOF

==> MCmes deployment notes
Staff:   ${MCMES_PUBLIC_URL}/
Citizen: ${MCMES_CITIZEN_PUBLIC_URL}/
Direct:  http://${DEPLOY_HOST}:${MCMES_HTTP_PORT}/

Configure:
  1. System nginx + TLS (once): sudo bash deploy/install-cimes-nginx-on-server.sh --certbot
  2. Google Maps — add referrers in Google Cloud Console:
       ${MCMES_PUBLIC_URL}/*
       http://${DEPLOY_HOST}:${MCMES_HTTP_PORT}/*
  3. api/.env — set APP_LOGIN_URL=${MCMES_PUBLIC_URL}/login
     (and APP_FRONTEND_URL=${MCMES_PUBLIC_URL} if used).
  4. Firewall — 80/443 for the subdomain; ${MCMES_HTTP_PORT} optional for IP access.
  5. Database migrations — not run by this script.

EOF
}

echo "==> MCmes deploy target: ${REMOTE}:${DEPLOY_PATH}"
ensure_mcmes_compose_env
warn_server_api_env

export DEPLOY_HOST DEPLOY_USER DEPLOY_PATH SSH_IDENTITY
export DEPLOY_SYNC_UPLOADS="${DEPLOY_SYNC_UPLOADS:-1}"
export DEPLOY_SYNC_DB="${DEPLOY_SYNC_DB:-0}"
export DEPLOY_SYNC_DB_CONFIRM="${DEPLOY_SYNC_DB_CONFIRM:-}"
export DEPLOY_RSYNC_EXTRA_EXCLUDES="${DEPLOY_RSYNC_EXTRA_EXCLUDES:-docs/}"

"$ROOT/deploy/deploy-to-server.sh"

print_http_caveats
