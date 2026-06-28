#!/usr/bin/env bash
#
# Build once and publish Machakos Collector to MCmes + monitoring in one step.
#
# Usage:
#   ./deploy/release-mobile-app-all.sh --version 1.0.2 --notes "Login and icon fixes"
#   ./deploy/release-mobile-app-all.sh --version 1.0.2 --skip-build
#
# Optional:
#   SSH_IDENTITY=~/.ssh/id_asusme ./deploy/release-mobile-app-all.sh --version 1.0.2
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

SSH_IDENTITY="${SSH_IDENTITY:-$HOME/.ssh/id_asusme}"
export SSH_IDENTITY

TARGETS_FILE="$ROOT/deploy/mobile-app-all-targets.env"

echo "==> Mobile app release → MCmes + monitoring (single build)"
echo "    MCmes:       http://84.247.128.58:8084/mobile-app"
echo "    Monitoring:  https://monitoring.icskenya.co.ke/mobile-app (or host :8084)"
echo ""

exec "$ROOT/deploy/release-mobile-app.sh" \
  --targets-file "$TARGETS_FILE" \
  "$@"
