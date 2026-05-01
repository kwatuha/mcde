#!/usr/bin/env bash
#
# Deploy Machakos to a remote host over SSH + rsync, then restart Docker Compose.
#
# Usage:
#   ./deploy/deploy-to-server.sh
# Defaults match imes deploy-to-production.sh (165.22.227.234, user kunye). Override any time:
#   DEPLOY_HOST=... DEPLOY_USER=... DEPLOY_PATH=... ./deploy/deploy-to-server.sh
# Optional: SSH_IDENTITY=~/.ssh/id_asusme
# Media sync defaults ON: DEPLOY_SYNC_UPLOADS=1 (copies uploads/ and api/uploads/ without --delete)
# Set DEPLOY_SYNC_UPLOADS=0 to skip media sync.
#
# First-time on server:
#   - mkdir -p "$DEPLOY_PATH" && ensure Docker + docker compose plugin installed
#   - Create api/.env on the server with DB_* (not rsync'd). Containers start without it; the API needs it to reach Postgres.
#   - Optional: create deploy/.env.deploy for compose variable overrides (e.g. MACHAKOS_CITIZEN_BASE_PATH)
#
# HTTPS (monitoring.icskenya.co.ke):
#   - Point DNS A record to the server
#   - Install deploy/snippets/nginx-monitoring.icskenya.co.ke.conf on system nginx (see file header)
#   - Run certbot (see snippet comments)
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

DEPLOY_HOST="${DEPLOY_HOST:-165.22.227.234}"
DEPLOY_USER="${DEPLOY_USER:-kunye}"
DEPLOY_PATH="${DEPLOY_PATH:-/home/kunye/dev/machakos}"
SSH_IDENTITY="${SSH_IDENTITY:-}"
DEPLOY_SYNC_UPLOADS="${DEPLOY_SYNC_UPLOADS:-1}"

SSH_OPTS=(-o StrictHostKeyChecking=accept-new)
if [[ -n "$SSH_IDENTITY" ]]; then
  SSH_OPTS+=(-i "${SSH_IDENTITY/#\~/$HOME}")
fi

RSYNC_RSH="ssh ${SSH_OPTS[*]}"
REMOTE="${DEPLOY_USER}@${DEPLOY_HOST}"

echo "==> Syncing repo to ${REMOTE}:${DEPLOY_PATH}"
rsync -avz --delete \
  --rsh="$RSYNC_RSH" \
  --filter='P .pgdata/' \
  --exclude '.git' \
  --exclude '.cursor' \
  --exclude '.pgdata' \
  --exclude 'node_modules' \
  --exclude 'frontend/node_modules' \
  --exclude 'api/node_modules' \
  --exclude 'public-dashboard/node_modules' \
  --exclude '**/dist' \
  --exclude '.env' \
  --exclude 'api/.env' \
  --filter='P deploy/.env.deploy' \
  --exclude 'deploy/.env.deploy' \
  --exclude 'uploads' \
  --exclude 'api/uploads' \
  "$ROOT/" "${REMOTE}:${DEPLOY_PATH}/"

if [[ "$DEPLOY_SYNC_UPLOADS" == "1" ]]; then
  echo "==> Syncing media uploads (uploads/ and api/uploads/) to server"
  mkdir -p "$ROOT/uploads" "$ROOT/api/uploads"
  rsync -avz \
    --rsh="$RSYNC_RSH" \
    "$ROOT/uploads/" "${REMOTE}:${DEPLOY_PATH}/uploads/"
  rsync -avz \
    --rsh="$RSYNC_RSH" \
    "$ROOT/api/uploads/" "${REMOTE}:${DEPLOY_PATH}/api/uploads/"
else
  echo "==> Skipping uploads sync (set DEPLOY_SYNC_UPLOADS=1 to copy media files)"
fi

echo "==> Rebuilding and restarting stack on server"
ssh "${SSH_OPTS[@]}" "$REMOTE" bash -s <<REMOTE_EOF
set -euo pipefail
cd "${DEPLOY_PATH}"
if [[ ! -f api/.env ]]; then
  echo "WARNING: api/.env missing on server — compose will start, but set DB_HOST DB_USER DB_PASSWORD DB_NAME (and DB_TYPE=postgresql) in api/.env for the API." >&2
fi
ENV_FILE_ARGS=()
if [[ -f deploy/.env.deploy ]]; then
  ENV_FILE_ARGS=(--env-file deploy/.env.deploy)
fi
docker compose "\${ENV_FILE_ARGS[@]}" -f docker-compose.server.yml build
docker compose "\${ENV_FILE_ARGS[@]}" -f docker-compose.server.yml up -d
docker compose -f docker-compose.server.yml ps
REMOTE_EOF

echo "==> Done. Check: http://${DEPLOY_HOST}:8084 (direct) or https://monitoring.icskenya.co.ke after system nginx + certbot."
