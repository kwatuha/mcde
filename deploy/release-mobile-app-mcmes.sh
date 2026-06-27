#!/usr/bin/env bash
#
# Publish Machakos Collector APK to the MCmes server only.
# Same SSH defaults as deploy/mcmes-deploy.sh (84.247.128.58, administrator, port 8084 staff URL).
#
# Usage:
#   ./deploy/release-mobile-app-mcmes.sh --version 1.0.1 --notes "Bug fixes"
#   ./deploy/release-mobile-app-mcmes.sh --version 1.0.1 --skip-build
#
# Overrides (optional, same as mcmes-deploy.sh):
#   DEPLOY_HOST=84.247.128.58 DEPLOY_USER=administrator DEPLOY_PATH=/home/administrator/dev/machakos
#   SSH_IDENTITY=~/.ssh/id_asusme ./deploy/release-mobile-app-mcmes.sh --version 1.0.1
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

DEPLOY_HOST="${DEPLOY_HOST:-84.247.128.58}"
DEPLOY_USER="${DEPLOY_USER:-administrator}"
DEPLOY_PATH="${DEPLOY_PATH:-/home/administrator/dev/machakos}"
MCMES_HTTP_PORT="${MCMES_HTTP_PORT:-8084}"
SSH_IDENTITY="${SSH_IDENTITY:-$HOME/.ssh/id_asusme}"

TARGET="${DEPLOY_USER}@${DEPLOY_HOST}:${DEPLOY_PATH}"
PUBLIC_URL="${MCMES_PUBLIC_URL:-http://${DEPLOY_HOST}:${MCMES_HTTP_PORT}}"

echo "==> MCmes mobile app release"
echo "    Server:  ${TARGET}"
echo "    Staff:   ${PUBLIC_URL}/"
echo "    Mobile:  ${PUBLIC_URL}/mobile-app"
echo ""

export SSH_IDENTITY
exec "$ROOT/deploy/release-mobile-app.sh" --target "$TARGET" "$@"
