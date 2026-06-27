#!/usr/bin/env bash
#
# Publish Machakos Collector APK to the monitoring / production server only.
# Same SSH defaults as deploy/deploy-to-server.sh (165.22.227.234, kunye).
#
# Usage:
#   ./deploy/release-mobile-app-monitoring.sh --version 1.0.1 --notes "Bug fixes"
#   ./deploy/release-mobile-app-monitoring.sh --version 1.0.1 --skip-build
#
# Overrides (optional, same as deploy-to-server.sh):
#   DEPLOY_HOST=165.22.227.234 DEPLOY_USER=kunye DEPLOY_PATH=/home/kunye/dev/machakos
#   SSH_IDENTITY=~/.ssh/id_asusme ./deploy/release-mobile-app-monitoring.sh --version 1.0.1
#
# HTTPS (when configured): monitoring.icskenya.co.ke — see deploy/deploy-to-server.sh header.
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

DEPLOY_HOST="${DEPLOY_HOST:-165.22.227.234}"
DEPLOY_USER="${DEPLOY_USER:-kunye}"
DEPLOY_PATH="${DEPLOY_PATH:-/home/kunye/dev/machakos}"
SSH_IDENTITY="${SSH_IDENTITY:-}"

TARGET="${DEPLOY_USER}@${DEPLOY_HOST}:${DEPLOY_PATH}"

echo "==> Monitoring server mobile app release"
echo "    Server: ${TARGET}"
echo "    (Same host as deploy/deploy-to-server.sh — monitoring.icskenya.co.ke when HTTPS is enabled)"
echo ""

if [[ -n "$SSH_IDENTITY" ]]; then
  export SSH_IDENTITY
fi
exec "$ROOT/deploy/release-mobile-app.sh" --target "$TARGET" "$@"
