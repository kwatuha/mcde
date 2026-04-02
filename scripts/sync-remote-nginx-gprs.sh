#!/usr/bin/env bash
#
# Pull / push system nginx site config for GPRS (/etc/nginx/sites-available/gprs)
# using the same SSH defaults as deploy-gprs-server.sh.
#
# Usage:
#   chmod +x scripts/sync-remote-nginx-gprs.sh
#   ./scripts/sync-remote-nginx-gprs.sh pull         # remote -> nginx/gprs.sites-available.working
#   ./scripts/sync-remote-nginx-gprs.sh push-upload  # scp only (no sudo); then SSH and run printed commands
#   ./scripts/sync-remote-nginx-gprs.sh push         # install + nginx -t + reload (needs passwordless sudo)
#
#   LOCAL_PATH=./my-gprs.conf ./scripts/sync-remote-nginx-gprs.sh pull
#
# If push fails with "sudo: a terminal is required", use push-upload and run sudo on the server interactively.
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Same defaults as deploy-gprs-server.sh (override with env)
SERVER_USER="${SERVER_USER:-fortress}"
SERVER_IP="${SERVER_IP:-102.210.149.119}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/id_gprs_server}"

REMOTE_SITES_FILE="${REMOTE_SITES_FILE:-/etc/nginx/sites-available/gprs}"
LOCAL_PATH="${LOCAL_PATH:-$REPO_ROOT/nginx/gprs.sites-available.working}"
REMOTE_TMP="${REMOTE_TMP:-/home/${SERVER_USER}/gprs.sites-available.upload.$$}"
REMOTE_HOME_COPY="${REMOTE_HOME_COPY:-/home/${SERVER_USER}/gprs.sites-available.new}"

SSH_OPTS=(-i "$SSH_KEY" -o ConnectTimeout=15)
SSH_TARGET="${SERVER_USER}@${SERVER_IP}"

usage() {
  sed -n '1,18p' "$0"
}

if [[ ! -f "$SSH_KEY" ]]; then
  echo "ERROR: SSH key not found: $SSH_KEY" >&2
  echo "Set SSH_KEY or create the key (see deploy-gprs-server.sh)." >&2
  exit 1
fi

cmd="${1:-}"
case "$cmd" in
  pull)
    echo "Pulling ${SSH_TARGET}:${REMOTE_SITES_FILE}"
    echo "  -> $LOCAL_PATH"
    mkdir -p "$(dirname "$LOCAL_PATH")"
    # scp fails if file is root-only; try scp then fall back to ssh cat+sudo
    if scp "${SSH_OPTS[@]}" "${SSH_TARGET}:${REMOTE_SITES_FILE}" "$LOCAL_PATH" 2>/dev/null; then
      echo "Done (scp)."
    else
      echo "scp failed (permissions?). Trying: ssh sudo cat ..."
      ssh "${SSH_OPTS[@]}" "$SSH_TARGET" "sudo cat '$REMOTE_SITES_FILE'" > "$LOCAL_PATH"
      echo "Done (sudo cat)."
    fi
    ls -la "$LOCAL_PATH"
    echo "Edit the file, then: $0 push"
    ;;
  push)
    if [[ ! -f "$LOCAL_PATH" ]]; then
      echo "ERROR: local file missing: $LOCAL_PATH" >&2
      echo "Run: $0 pull" >&2
      exit 1
    fi
    echo "Uploading $LOCAL_PATH -> ${SSH_TARGET}:${REMOTE_TMP}"
    scp "${SSH_OPTS[@]}" "$LOCAL_PATH" "${SSH_TARGET}:${REMOTE_TMP}"
    echo "Installing to $REMOTE_SITES_FILE and reloading nginx..."
    ssh "${SSH_OPTS[@]}" "$SSH_TARGET" bash -s <<REMOTE
set -euo pipefail
sudo install -m 0644 -T '$REMOTE_TMP' '$REMOTE_SITES_FILE'
rm -f '$REMOTE_TMP'
sudo nginx -t
sudo systemctl reload nginx
echo "OK: nginx reloaded."
REMOTE
    echo "Done."
    ;;
  push-upload)
    if [[ ! -f "$LOCAL_PATH" ]]; then
      echo "ERROR: local file missing: $LOCAL_PATH" >&2
      exit 1
    fi
    echo "Uploading $LOCAL_PATH -> ${SSH_TARGET}:${REMOTE_HOME_COPY}"
    scp "${SSH_OPTS[@]}" "$LOCAL_PATH" "${SSH_TARGET}:${REMOTE_HOME_COPY}"
    echo ""
    echo "[INFO] Uploaded. On the server (interactive SSH so sudo can prompt), run:"
    echo ""
    echo "  ssh -i $SSH_KEY ${SSH_TARGET}"
    echo "  sudo cp $REMOTE_HOME_COPY $REMOTE_SITES_FILE"
    echo "  sudo nginx -t && sudo systemctl reload nginx"
    echo ""
    ;;
  -h|--help|help)
    usage
    exit 0
    ;;
  *)
    echo "Usage: $0 pull|push|push-upload" >&2
    exit 1
    ;;
esac
