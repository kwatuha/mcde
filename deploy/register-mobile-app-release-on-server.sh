#!/usr/bin/env bash
#
# Register a mobile app release in the database on a remote server (APK already on disk).
# Use when release-mobile-app*.sh copied the APK but failed at "node: command not found".
#
# Usage:
#   ./deploy/register-mobile-app-release-on-server.sh \
#     --target administrator@84.247.128.58:/home/administrator/dev/machakos \
#     --version 1.0.1 \
#     --apk api/uploads/mobile-app/app-release.apk
#
# Or re-upload + register in one step:
#   ./deploy/release-mobile-app-mcmes.sh --version 1.0.1 --skip-build
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET=""
VERSION=""
APK_REL="api/uploads/mobile-app/app-release.apk"
NOTES=""
SSH_IDENTITY="${SSH_IDENTITY:-}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --target) TARGET="$2"; shift 2 ;;
    --version) VERSION="$2"; shift 2 ;;
    --apk) APK_REL="$2"; shift 2 ;;
    --notes) NOTES="$2"; shift 2 ;;
    -h|--help)
      sed -n '1,20p' "$0"
      exit 0
      ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

if [[ -z "$TARGET" || -z "$VERSION" ]]; then
  echo "ERROR: --target and --version are required." >&2
  exit 1
fi

remote_user_host="${TARGET%%:*}"
remote_path="${TARGET#*:}"
ssh_opts=(-o StrictHostKeyChecking=accept-new)
if [[ -n "$SSH_IDENTITY" ]]; then
  ssh_opts+=(-i "${SSH_IDENTITY/#\~/$HOME}")
fi

notes_q=$(printf '%q' "$NOTES")
ssh "${ssh_opts[@]}" "$remote_user_host" bash -s <<REMOTE_EOF
set -euo pipefail
cd "${remote_path}"
VERSION="${VERSION}"
APK_REL="${APK_REL}"
NOTES=${notes_q}

if [[ ! -f "\$APK_REL" ]]; then
  echo "ERROR: APK not found on server: \$(pwd)/\$APK_REL" >&2
  echo "Copy it first, e.g. scp app-release.apk ${remote_user_host}:${remote_path}/\$APK_REL" >&2
  exit 1
fi

# Path inside API container (api/uploads is mounted at /app/uploads)
apk_container="/app/\${APK_REL#api/}"
extra=()
[[ -n "\$NOTES" ]] && extra=(--notes "\$NOTES")

if docker ps --format '{{.Names}}' | grep -qx machakosme_node_api; then
  docker exec machakosme_node_api node scripts/publishMobileAppRelease.js \\
    --version "\$VERSION" --apk "\$apk_container" "\${extra[@]}"
elif docker compose -f docker-compose.server.yml ps api 2>/dev/null | grep -qiE 'up|running'; then
  docker compose -f docker-compose.server.yml exec -T api \\
    node scripts/publishMobileAppRelease.js \\
    --version "\$VERSION" --apk "\$apk_container" "\${extra[@]}"
else
  echo "ERROR: machakosme_node_api is not running." >&2
  exit 1
fi

echo "OK: registered mobile app release v\${VERSION}"
REMOTE_EOF

echo "==> Done. Verify: curl -H \"Authorization: Bearer TOKEN\" http://HOST:8084/api/mobile-app/release"
