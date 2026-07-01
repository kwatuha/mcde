#!/usr/bin/env bash
#
# Build Machakos Collector APK and publish to one or more deployment servers.
# Each server gets the APK file + a database release record (users see dashboard notification).
#
# Usage:
#   ./deploy/release-mobile-app.sh --version 1.0.0
#   ./deploy/release-mobile-app.sh --version 1.0.1 --notes "Offline sync fixes"
#   ./deploy/release-mobile-app.sh --version 1.0.1 --skip-build --apk path/to/app-release.apk
#   ./deploy/release-mobile-app.sh --version 1.0.0 --local-only
#   ./deploy/release-mobile-app.sh --version 1.0.1 --target kunye@165.22.227.234:/home/kunye/dev/machakos
#
# Per-server wrappers (same defaults as deploy/*.sh):
#   ./deploy/release-mobile-app-mcmes.sh --version 1.0.1 --notes "Bug fixes"
#   ./deploy/release-mobile-app-monitoring.sh --version 1.0.1 --notes "Bug fixes"
#
# Targets: copy deploy/mobile-app-targets.example.env → deploy/mobile-app-targets.env
# and list SSH targets as MOBILE_APP_TARGETS array entries:
#   "user@host:/remote/path/to/machakos"
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

VERSION=""
NOTES=""
SKIP_BUILD=0
LOCAL_ONLY=0
APK_PATH=""
TARGETS_FILE="${TARGETS_FILE:-$ROOT/deploy/mobile-app-targets.env}"
SSH_IDENTITY="${SSH_IDENTITY:-$HOME/.ssh/id_asusme}"
SINGLE_TARGET="${MOBILE_APP_TARGET:-}"

usage() {
  cat <<EOF
Usage: $0 --version VERSION [options]

Options:
  --version VERSION   Required release label (e.g. 1.0.0)
  --notes TEXT        Release notes shown to staff
  --skip-build        Do not run Gradle; use existing APK (--apk or default path)
  --apk PATH          APK file to publish (default: mobile-collector release output)
  --local-only        Publish to this machine only (api/.env database)
  --target SPEC       Publish to one server only (user@host:/path/to/machakos)
  --targets-file PATH Env file with MOBILE_APP_TARGETS (default: deploy/mobile-app-targets.env)
  -h, --help          Show this help

Examples:
  $0 --version 1.0.0
  $0 --version 1.0.1 --notes "Checklist sync improvements" --skip-build
  $0 --version 1.0.0 --local-only
  ./deploy/release-mobile-app-mcmes.sh --version 1.0.1 --notes "Bug fixes"
  ./deploy/release-mobile-app-monitoring.sh --version 1.0.1 --notes "Bug fixes"
  ./deploy/release-mobile-app-all.sh --version 1.0.2 --notes "Both servers in one command"
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --version)
      VERSION="$2"
      shift 2
      ;;
    --notes|--release-notes)
      NOTES="$2"
      shift 2
      ;;
    --skip-build)
      SKIP_BUILD=1
      shift
      ;;
    --apk)
      APK_PATH="$2"
      shift 2
      ;;
    --local-only)
      LOCAL_ONLY=1
      shift
      ;;
    --target)
      SINGLE_TARGET="$2"
      shift 2
      ;;
    --targets-file)
      TARGETS_FILE="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [[ -z "$VERSION" ]]; then
  echo "ERROR: --version is required." >&2
  usage >&2
  exit 1
fi

APP_CONFIG="$ROOT/mobile-collector/src/config/api.ts"
if [[ -f "$APP_CONFIG" ]]; then
  echo "==> Syncing mobile-collector APP_VERSION → $VERSION"
  sed -i "s/export const APP_VERSION = '[^']*'/export const APP_VERSION = '${VERSION}'/" "$APP_CONFIG"
fi

DEFAULT_APK="$ROOT/mobile-collector/android/app/build/outputs/apk/release/app-release.apk"

if [[ -z "$APK_PATH" ]]; then
  APK_PATH="$DEFAULT_APK"
fi

if [[ "$SKIP_BUILD" != "1" ]]; then
  echo "==> Building release APK (mobile-collector)"
  if [[ ! -d "$ROOT/mobile-collector/node_modules" ]]; then
    echo "    Installing mobile-collector dependencies..."
    (cd "$ROOT/mobile-collector" && npm install)
  fi
  (cd "$ROOT/mobile-collector" && npm run android:release)
fi

if [[ ! -f "$APK_PATH" ]]; then
  echo "ERROR: APK not found at: $APK_PATH" >&2
  echo "Run without --skip-build or pass --apk PATH" >&2
  exit 1
fi

echo "==> APK: $APK_PATH ($(du -h "$APK_PATH" | awk '{print $1}'))"
echo "==> Version: $VERSION"

publish_local() {
  local notes_arg=()
  if [[ -n "$NOTES" ]]; then
    notes_arg=(--notes "$NOTES")
  fi
  node "$ROOT/api/scripts/publishMobileAppRelease.js" \
    --version "$VERSION" \
    --apk "$APK_PATH" \
    "${notes_arg[@]}"
}

publish_remote() {
  local remote_spec="$1"
  local remote_user_host="${remote_spec%%:*}"
  local remote_path="${remote_spec#*:}"
  if [[ -z "$remote_user_host" || -z "$remote_path" || "$remote_user_host" == "$remote_spec" ]]; then
    echo "ERROR: Invalid target '$remote_spec' (expected user@host:/path)" >&2
    exit 1
  fi

  local ssh_opts=(-o StrictHostKeyChecking=accept-new)
  if [[ -n "$SSH_IDENTITY" ]]; then
    ssh_opts+=(-i "${SSH_IDENTITY/#\~/$HOME}")
  fi

  local staging_name=".publish-staging-${VERSION}-$$.apk"
  local remote_staging="api/uploads/mobile-app/${staging_name}"
  echo "==> Publishing to ${remote_user_host}:${remote_path}"
  ssh "${ssh_opts[@]}" "$remote_user_host" "mkdir -p ${remote_path}/api/uploads/mobile-app"
  scp "${ssh_opts[@]}" "$APK_PATH" "${remote_user_host}:${remote_path}/${remote_staging}"
  ssh "${ssh_opts[@]}" "$remote_user_host" bash -s <<REMOTE_EOF
set -euo pipefail
REMOTE_PATH="${remote_path}"
REMOTE_STAGING="${remote_staging}"
STAGING_BASENAME="${staging_name}"
VERSION="${VERSION}"
NOTES=$(printf '%q' "$NOTES")
cd "\$REMOTE_PATH"

extra_args=()
if [[ -n "\$NOTES" ]]; then
  extra_args=(--notes "\$NOTES")
fi

apk_container="/app/uploads/mobile-app/\${STAGING_BASENAME}"
published=0

compose_env_args=()
if [[ -f deploy/.env.deploy ]]; then
  compose_env_args=(--env-file deploy/.env.deploy)
fi

register_in_api_container() {
  local container="\$1"
  local apk_in_container="\$2"
  if ! docker ps --format '{{.Names}}' | grep -qx "\$container"; then
    return 1
  fi
  if ! docker exec "\$container" test -f scripts/publishMobileAppRelease.js 2>/dev/null; then
    echo "    API container \$container is running but lacks scripts/publishMobileAppRelease.js (redeploy API first)." >&2
    return 1
  fi
  echo "    Registering release via docker exec \$container ..."
  docker exec "\$container" node scripts/publishMobileAppRelease.js \\
    --version "\$VERSION" \\
    --apk "\$apk_in_container" \\
    "\${extra_args[@]}"
}

register_via_compose() {
  local compose_file="\$1"
  local apk_in_container="\$2"
  if [[ ! -f "\$compose_file" ]]; then
    return 1
  fi
  if ! docker compose "\${compose_env_args[@]}" -f "\$compose_file" ps api 2>/dev/null | grep -qiE 'up|running'; then
    return 1
  fi
  echo "    Registering release via docker compose (\$compose_file) ..."
  docker compose "\${compose_env_args[@]}" -f "\$compose_file" exec -T api \\
    node scripts/publishMobileAppRelease.js \\
    --version "\$VERSION" \\
    --apk "\$apk_in_container" \\
    "\${extra_args[@]}"
}

register_via_host_node() {
  local apk_path="\$1"
  if ! command -v node >/dev/null 2>&1; then
    return 1
  fi
  echo "    Registering release via host node ..."
  node api/scripts/publishMobileAppRelease.js \\
    --version "\$VERSION" \\
    --apk "\$apk_path" \\
    "\${extra_args[@]}"
}

verify_release_in_db() {
  local expected="\$1"
  local actual=""
  if docker ps --format '{{.Names}}' | grep -qx machakosme_node_api; then
    actual=\$(docker exec machakosme_node_api node -e "
const pool=require('./config/db');
pool.query('SELECT version FROM mobile_app_releases WHERE voided = FALSE ORDER BY created_at DESC, id DESC LIMIT 1')
  .then(r => { process.stdout.write(String(r.rows?.[0]?.version || '')); process.exit(0); })
  .catch(() => process.exit(2));
" 2>/dev/null || true)
  fi
  if [[ -z "\$actual" ]] && command -v node >/dev/null 2>&1 && [[ -f api/scripts/publishMobileAppRelease.js ]]; then
    actual=\$(node -e "
require('dotenv').config({ path: 'api/.env' });
const pool=require('./api/config/db');
pool.query('SELECT version FROM mobile_app_releases WHERE voided = FALSE ORDER BY created_at DESC, id DESC LIMIT 1')
  .then(r => { process.stdout.write(String(r.rows?.[0]?.version || '')); process.exit(0); })
  .catch(() => process.exit(2));
" 2>/dev/null || true)
  fi
  if [[ "\$actual" != "\$expected" ]]; then
    echo "ERROR: Database still shows release v\${actual:-<none>}, expected v\$expected." >&2
    return 1
  fi
  echo "    Verified database current release: v\$actual"
  return 0
}

if register_via_compose docker-compose.server.yml "\$apk_container"; then
  published=1
elif register_in_api_container machakosme_node_api "\$apk_container"; then
  published=1
elif register_via_compose docker-compose.production.yml "\$apk_container"; then
  published=1
elif register_via_compose docker-compose.yml "\$apk_container"; then
  published=1
elif register_via_host_node "\$REMOTE_STAGING"; then
  published=1
fi

if [[ "\$published" != "1" ]]; then
  echo "ERROR: APK copied to \$REMOTE_STAGING but release was NOT registered in the database." >&2
  echo "       Server: \$(hostname -f 2>/dev/null || hostname) — path \$REMOTE_PATH" >&2
  echo "       Register inside the API container:" >&2
  echo "         cd \$REMOTE_PATH" >&2
  echo "         docker compose \${compose_env_args[*]} -f docker-compose.server.yml exec -T api \\" >&2
  echo "           node scripts/publishMobileAppRelease.js --version \$VERSION --apk \$apk_container \${extra_args[*]}" >&2
  echo "       Or: docker exec machakosme_node_api node scripts/publishMobileAppRelease.js ..." >&2
  echo "       If the script is missing, redeploy the API first: ./deploy/deploy-to-server.sh" >&2
  exit 1
fi

if ! verify_release_in_db "\$VERSION"; then
  echo "ERROR: Release registration did not update the active version in PostgreSQL." >&2
  echo "       Staging APK kept at: \$REMOTE_STAGING (for manual retry)" >&2
  exit 1
fi

rm -f "\$REMOTE_STAGING"
echo "    Release v\${VERSION} registered in database."
REMOTE_EOF
}

if [[ "$LOCAL_ONLY" == "1" ]]; then
  publish_local
  echo "==> Done (local only). Staff on this environment will see the dashboard notification after refresh."
  exit 0
fi

TARGETS=()
if [[ -n "$SINGLE_TARGET" ]]; then
  TARGETS=("$SINGLE_TARGET")
elif [[ -f "$TARGETS_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$TARGETS_FILE"
  if [[ -n "${MOBILE_APP_TARGETS+x}" ]] && [[ ${#MOBILE_APP_TARGETS[@]} -gt 0 ]]; then
    TARGETS=("${MOBILE_APP_TARGETS[@]}")
  fi
fi

if [[ ${#TARGETS[@]} -eq 0 ]]; then
  echo "WARNING: No deploy/mobile-app-targets.env found — publishing locally only." >&2
  echo "         Copy deploy/mobile-app-targets.example.env → deploy/mobile-app-targets.env" >&2
  publish_local
  exit 0
fi

PUBLISH_OK=()
PUBLISH_FAIL=()
for target in "${TARGETS[@]}"; do
  [[ -z "$target" || "$target" =~ ^# ]] && continue
  if publish_remote "$target"; then
    PUBLISH_OK+=("$target")
  else
    PUBLISH_FAIL+=("$target")
    echo ""
    echo "ERROR: Publish failed for ${target}" >&2
    if [[ "$target" == *"165.22.227.234"* ]] || [[ "$target" == *"kunye@"* ]]; then
      echo "       Retry monitoring only:" >&2
      echo "         ./deploy/release-mobile-app-monitoring.sh --version ${VERSION} --skip-build --notes $(printf '%q' "$NOTES")" >&2
    elif [[ "$target" == *"84.247.128.58"* ]] || [[ "$target" == *"administrator@"* ]]; then
      echo "       Retry MCmes only:" >&2
      echo "         ./deploy/release-mobile-app-mcmes.sh --version ${VERSION} --skip-build --notes $(printf '%q' "$NOTES")" >&2
    fi
  fi
done

echo ""
if [[ ${#PUBLISH_FAIL[@]} -gt 0 ]]; then
  echo "==> Partial failure: ${#PUBLISH_OK[@]} server(s) ok, ${#PUBLISH_FAIL[@]} failed." >&2
  for t in "${PUBLISH_OK[@]}"; do echo "    OK:   $t"; done
  for t in "${PUBLISH_FAIL[@]}"; do echo "    FAIL: $t" >&2; done
  exit 1
fi

echo "==> Published v${VERSION} to ${#PUBLISH_OK[@]} server(s):"
for t in "${PUBLISH_OK[@]}"; do echo "    - $t"; done
echo "    Staff will see a dashboard notification after refresh."
