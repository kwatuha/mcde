#!/usr/bin/env bash
# Register mobile app release on monitoring server only.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEPLOY_HOST="${DEPLOY_HOST:-165.22.227.234}"
DEPLOY_USER="${DEPLOY_USER:-kunye}"
DEPLOY_PATH="${DEPLOY_PATH:-/home/kunye/dev/machakos}"
SSH_IDENTITY="${SSH_IDENTITY:-$HOME/.ssh/id_asusme}"
export SSH_IDENTITY
export MOBILE_APP_TARGET="${DEPLOY_USER}@${DEPLOY_HOST}:${DEPLOY_PATH}"
exec "$ROOT/deploy/register-mobile-app-release-remote.sh" --target "$MOBILE_APP_TARGET" "$@"
