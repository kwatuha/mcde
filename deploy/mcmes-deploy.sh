#!/usr/bin/env bash
#
# Deploy Machakos / MCmes to administrator@84.247.128.58 over HTTP (no subdomain).
#
# Usage:
#   chmod +x deploy/mcmes-deploy.sh
#   ./deploy/mcmes-deploy.sh
#
# Overrides (optional):
#   DEPLOY_HOST=84.247.128.58 DEPLOY_USER=administrator DEPLOY_PATH=/home/administrator/dev/machakos
#   SSH_IDENTITY=~/.ssh/id_asusme ./deploy/mcmes-deploy.sh   # default key; override if needed
#   MCMES_HTTP_PORT=8084                    # nginx_proxy listen port (see nginx/nginx.conf)
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
#       APP_LOGIN_URL=http://84.247.128.58:8084/login
#       APP_FRONTEND_URL=http://84.247.128.58:8084
#       ADVANTA_PARTNER_ID, ADVANTA_API_KEY, ADVANTA_SHORT_CODE (SMS OTP; see api/.env.remote.example)
#   - sudo ufw allow 8084/tcp   (or your MCMES_HTTP_PORT)
#   - Run DB migrations manually (deploy does not migrate)
#
# Access after deploy:
#   Staff:   http://84.247.128.58:8084/
#   Citizen: http://84.247.128.58:8084/citizen/
#
# HTTP / no-subdomain caveats (see script tail or README in comments):
#   - Google Maps key must allow http://84.247.128.58:8084/* referrers
#   - Email login links use APP_LOGIN_URL in api/.env
#   - Browsers show "Not secure" on login forms (expected without HTTPS)
#   - No Let's Encrypt without a domain name
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

MCMES_PUBLIC_URL="${MCMES_PUBLIC_URL:-http://${DEPLOY_HOST}:${MCMES_HTTP_PORT}}"
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
  echo "==> Ensuring remote deploy/.env.deploy for HTTP (${MCMES_PUBLIC_URL})"
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
elif [[ "\$login_url" != *"${DEPLOY_HOST}"* ]]; then
  echo "WARNING: APP_LOGIN_URL is '\$login_url' but MCmes URL is ${MCMES_PUBLIC_URL}/login" >&2
else
  echo "APP_LOGIN_URL looks aligned: \$login_url"
fi
REMOTE_EOF
}

print_http_caveats() {
  cat <<EOF

==> MCmes HTTP deployment notes
Staff:   ${MCMES_PUBLIC_URL}/
Citizen: ${MCMES_CITIZEN_PUBLIC_URL}/

Likely OK on plain HTTP:
  - Login (JWT in browser storage, not secure cookies)
  - API, uploads, PDF reports, PMC workflows
  - Citizen dashboard (/citizen/)
  - Socket.IO chat (if VITE_ENABLE_CHAT=true)

Configure or expect limitations:
  1. Google Maps — add HTTP referrers in Google Cloud Console:
       ${MCMES_PUBLIC_URL}/*
       http://${DEPLOY_HOST}/*
     Without this, maps show errors or "development only" watermark.
  2. api/.env — set APP_LOGIN_URL=${MCMES_PUBLIC_URL}/login
     (and APP_FRONTEND_URL=${MCMES_PUBLIC_URL} if used).
  3. SMTP — account emails still work; links must use the HTTP URLs above.
  4. Browser "Not secure" on login — cosmetic without TLS.
  5. Firewall — ensure port ${MCMES_HTTP_PORT}/tcp is open on ${DEPLOY_HOST}.
  6. Database migrations — not run by this script (apply county roles, PMC, etc. manually).
  7. Standard port 80 — stack listens on ${MCMES_HTTP_PORT} (nginx/nginx.conf). For :80,
     add system nginx reverse-proxy to 127.0.0.1:${MCMES_HTTP_PORT} or change listen port.

Does NOT require a subdomain or HTTPS for core app function.

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
