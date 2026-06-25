#!/usr/bin/env bash
#
# Copy media files (uploads/) from the source Machakos server to MCmes.
# Database clone scripts do NOT copy files — run this after sync-source-db-to-mcmes.sh
# if project photos, documents, or attachments are missing on MCmes.
#
# What is copied (under DEPLOY_PATH on each host):
#   uploads/          — project documents, payments, imports (repo root)
#   api/uploads/      — project photos (project-photos/), chat files, etc.
#
# Usage:
#   ./deploy/sync-source-uploads-to-mcmes.sh
#   DEPLOY_SYNC_UPLOADS_CONFIRM=yes ./deploy/sync-source-uploads-to-mcmes.sh
#
# Overrides (same defaults as sync-source-db-to-mcmes.sh):
#   SOURCE_HOST=165.22.227.234 SOURCE_USER=kunye SOURCE_PATH=/home/kunye/dev/machakos
#   TARGET_HOST=84.247.128.58 TARGET_USER=administrator TARGET_PATH=/home/administrator/dev/machakos
#   SSH_IDENTITY=~/.ssh/id_asusme
#
# Transfer method (rsync cannot copy remote→remote in one step):
#   Default: tar stream SOURCE → laptop → TARGET (no local disk copy of all files)
#   Optional: UPLOADS_VIA_LOCAL_STAGING=1 — rsync SOURCE→laptop→TARGET (uses disk under .upload-sync-staging/)
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

SOURCE_HOST="${SOURCE_HOST:-165.22.227.234}"
SOURCE_USER="${SOURCE_USER:-kunye}"
SOURCE_PATH="${SOURCE_PATH:-/home/kunye/dev/machakos}"

TARGET_HOST="${TARGET_HOST:-84.247.128.58}"
TARGET_USER="${TARGET_USER:-administrator}"
TARGET_PATH="${TARGET_PATH:-/home/administrator/dev/machakos}"

SSH_IDENTITY="${SSH_IDENTITY:-$HOME/.ssh/id_asusme}"
DEPLOY_SYNC_UPLOADS_CONFIRM="${DEPLOY_SYNC_UPLOADS_CONFIRM:-}"
UPLOADS_VIA_LOCAL_STAGING="${UPLOADS_VIA_LOCAL_STAGING:-0}"

if [[ "${DEPLOY_SYNC_UPLOADS_CONFIRM}" != "yes" ]]; then
  echo "This copies uploads from ${SOURCE_USER}@${SOURCE_HOST}:${SOURCE_PATH}" >&2
  echo "to ${TARGET_USER}@${TARGET_HOST}:${TARGET_PATH} (may take a while)." >&2
  echo "Set:  DEPLOY_SYNC_UPLOADS_CONFIRM=yes ./deploy/sync-source-uploads-to-mcmes.sh" >&2
  exit 2
fi

SSH_OPTS=(-o StrictHostKeyChecking=accept-new)
if [[ -n "$SSH_IDENTITY" && -f "${SSH_IDENTITY/#\~/$HOME}" ]]; then
  SSH_OPTS+=(-i "${SSH_IDENTITY/#\~/$HOME}")
fi

RSYNC_RSH="ssh ${SSH_OPTS[*]}"

SOURCE_REMOTE="${SOURCE_USER}@${SOURCE_HOST}"
TARGET_REMOTE="${TARGET_USER}@${TARGET_HOST}"

echo "==> Ensuring upload directories exist on TARGET"
ssh "${SSH_OPTS[@]}" "$TARGET_REMOTE" bash -s <<REMOTE_EOF
set -euo pipefail
mkdir -p "${TARGET_PATH}/uploads" "${TARGET_PATH}/api/uploads"
REMOTE_EOF

count_remote_dir() {
  local remote="$1"
  local dir="$2"
  ssh "${SSH_OPTS[@]}" "$remote" "find \"$dir\" -type f 2>/dev/null | wc -l" | tr -d ' '
}

SOURCE_FILES="$(count_remote_dir "$SOURCE_REMOTE" "${SOURCE_PATH}/uploads")"
SOURCE_API_FILES="$(count_remote_dir "$SOURCE_REMOTE" "${SOURCE_PATH}/api/uploads")"
echo "==> SOURCE file counts: uploads/=${SOURCE_FILES}, api/uploads/=${SOURCE_API_FILES}"

sync_via_tar_pipe() {
  echo "==> Streaming uploads SOURCE → TARGET (tar over SSH; laptop is the pipe only)"
  set -o pipefail
  ssh "${SSH_OPTS[@]}" "$SOURCE_REMOTE" \
    "cd $(printf '%q' "$SOURCE_PATH") && dirs=(); [ -d uploads ] && dirs+=(uploads); [ -d api/uploads ] && dirs+=(api/uploads); [ \${#dirs[@]} -eq 0 ] && exit 1; tar czf - \"\${dirs[@]}\"" \
    | ssh "${SSH_OPTS[@]}" "$TARGET_REMOTE" \
    "cd $(printf '%q' "$TARGET_PATH") && tar xzf - --no-same-owner --no-same-permissions"
}

sync_via_local_staging() {
  local staging="${ROOT}/.upload-sync-staging"
  echo "==> Syncing via local staging: ${staging}"
  rm -rf "${staging}"
  mkdir -p "${staging}/uploads" "${staging}/api-uploads"

  echo "    SOURCE → laptop (uploads/)"
  rsync -avz --no-group --no-owner --no-perms --omit-dir-times \
    --rsh="$RSYNC_RSH" \
    "${SOURCE_REMOTE}:${SOURCE_PATH}/uploads/" "${staging}/uploads/"

  echo "    SOURCE → laptop (api/uploads/)"
  rsync -avz --no-group --no-owner --no-perms --omit-dir-times \
    --rsh="$RSYNC_RSH" \
    "${SOURCE_REMOTE}:${SOURCE_PATH}/api/uploads/" "${staging}/api-uploads/"

  echo "    laptop → TARGET (uploads/)"
  rsync -avz --no-group --no-owner --no-perms --omit-dir-times \
    --rsh="$RSYNC_RSH" \
    "${staging}/uploads/" "${TARGET_REMOTE}:${TARGET_PATH}/uploads/"

  echo "    laptop → TARGET (api/uploads/)"
  rsync -avz --no-group --no-owner --no-perms --omit-dir-times \
    --rsh="$RSYNC_RSH" \
    "${staging}/api-uploads/" "${TARGET_REMOTE}:${TARGET_PATH}/api/uploads/"

  rm -rf "${staging}"
  echo "    Removed local staging."
}

if [[ "$UPLOADS_VIA_LOCAL_STAGING" == "1" ]]; then
  sync_via_local_staging
else
  sync_via_tar_pipe
fi

TARGET_FILES="$(count_remote_dir "$TARGET_REMOTE" "${TARGET_PATH}/uploads")"
TARGET_API_FILES="$(count_remote_dir "$TARGET_REMOTE" "${TARGET_PATH}/api/uploads")"
echo "==> TARGET file counts after sync: uploads/=${TARGET_FILES}, api/uploads/=${TARGET_API_FILES}"

echo "==> Restarting API on TARGET so static /uploads mounts are fresh"
ssh "${SSH_OPTS[@]}" "$TARGET_REMOTE" bash -s <<REMOTE_EOF
set -euo pipefail
cd "${TARGET_PATH}"
ENV_FILE_ARGS=()
if [[ -f deploy/.env.deploy ]]; then
  ENV_FILE_ARGS=(--env-file deploy/.env.deploy)
fi
docker compose "\${ENV_FILE_ARGS[@]}" -f docker-compose.server.yml up -d api 2>/dev/null || true
REMOTE_EOF

cat <<EOF

==> Upload sync finished.
Photos are stored under api/uploads/project-photos/ and served at /uploads/project-photos/...
Documents use repo uploads/ and are served at /uploads/...

If images still fail:
  1. Open browser devtools → Network → failed image URL (404 vs 403).
  2. On TARGET: ls -la ${TARGET_PATH}/api/uploads/project-photos | head
  3. Confirm docker-compose.server.yml mounts ./api/uploads and ./uploads into the API container.

Re-run after new photos on SOURCE:
  DEPLOY_SYNC_UPLOADS_CONFIRM=yes ./deploy/sync-source-uploads-to-mcmes.sh

EOF
