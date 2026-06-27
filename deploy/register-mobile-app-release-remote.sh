#!/usr/bin/env bash
#
# Register an APK in the mobile_app_releases table on a remote server (repair / one-off).
# Use when release-mobile-app*.sh copied the APK but failed with "node: command not found".
#
# Usage:
#   ./deploy/register-mobile-app-release-remote.sh --version 1.0.1 --apk mobile-collector/android/app/build/outputs/apk/release/app-release.apk
#   ./deploy/register-mobile-app-release-mcmes.sh --version 1.0.1 --apk path/to/app-release.apk
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET="${MOBILE_APP_TARGET:-}"
VERSION=""
APK_PATH=""
NOTES=""
SSH_IDENTITY="${SSH_IDENTITY:-}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --version) VERSION="$2"; shift 2 ;;
    --apk) APK_PATH="$2"; shift 2 ;;
    --notes|--release-notes) NOTES="$2"; shift 2 ;;
    --target) TARGET="$2"; shift 2 ;;
    -h|--help)
      echo "Usage: $0 --target user@host:/path --version 1.0.1 --apk path/to.apk [--notes text]"
      exit 0
      ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

if [[ -z "$TARGET" || -z "$VERSION" || -z "$APK_PATH" ]]; then
  echo "ERROR: --target, --version, and --apk are required." >&2
  exit 1
fi
if [[ ! -f "$APK_PATH" ]]; then
  echo "ERROR: APK not found: $APK_PATH" >&2
  exit 1
fi

export MOBILE_APP_TARGET="$TARGET"
export SSH_IDENTITY
exec "$ROOT/deploy/release-mobile-app.sh" --version "$VERSION" --apk "$APK_PATH" --skip-build --target "$TARGET" ${NOTES:+--notes "$NOTES"}
