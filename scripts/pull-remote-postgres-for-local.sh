#!/usr/bin/env bash
#
# Pull a PostgreSQL dump from the GPRS remote server into a local file, then restore into your
# local database for debugging (e.g. organization scopes, real agency names, user rows).
#
# deploy-machos-server.sh only deploys code (rsync + Docker). It does NOT dump the database.
# On the server, PostgreSQL is expected on the host at 127.0.0.1 (see docker-compose.prod.yml).
#
# Prerequisites on the remote:
#   - api/.env with DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME (optional; defaults below)
#   - pg_dump in PATH on the server
#
# Usage:
#   chmod +x scripts/pull-remote-postgres-for-local.sh
#   ./scripts/pull-remote-postgres-for-local.sh              # full database dump
#   ./scripts/pull-remote-postgres-for-local.sh --org-only   # users, user_organization_scope, agencies, roles
#   ./scripts/pull-remote-postgres-for-local.sh --dry-run    # print plan only
#
# After pull, restore locally (example — adjust DB name; use PGPASSWORD from api/.env):
#   psql -h localhost -U postgres -d postgres -c "CREATE DATABASE gprs_remote_snap;"
#   psql -h localhost -U postgres -d gprs_remote_snap -v ON_ERROR_STOP=1 -f .remote-dumps/gprs-remote-....sql
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DUMP_DIR="${DUMP_DIR:-$REPO_ROOT/.remote-dumps}"

# Defaults match deploy-machos-server.sh
SERVER_USER="${SERVER_USER:-fortress}"
SERVER_IP="${SERVER_IP:-102.210.149.119}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/id_gprs_server}"
SERVER_PATH="${SERVER_PATH:-/home/fortress/gprs}"

ORG_ONLY=0
DRY_RUN=0
for arg in "$@"; do
  case "$arg" in
    --org-only) ORG_ONLY=1 ;;
    --dry-run) DRY_RUN=1 ;;
    --help|-h)
      grep '^#' "$0" | sed 's/^# \?//'
      exit 0
      ;;
  esac
done

STAMP="$(date +%Y%m%d-%H%M%S)"
REMOTE_FILE="/tmp/gprs-remote-dump-${STAMP}.sql"
LOCAL_FILE="$DUMP_DIR/gprs-remote-${STAMP}$([ "$ORG_ONLY" = 1 ] && echo '-org-scope' || echo '-full').sql"

if [[ ! -f "$SSH_KEY" ]]; then
  echo "ERROR: SSH key not found: $SSH_KEY — same key as deploy-machos-server.sh (SSH_KEY)" >&2
  exit 1
fi

mkdir -p "$DUMP_DIR"
SSH=(ssh -i "$SSH_KEY" -o ConnectTimeout=15 "$SERVER_USER@$SERVER_IP")

if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "[dry-run] ssh -i $SSH_KEY $SERVER_USER@$SERVER_IP"
  echo "[dry-run] remote: cd $SERVER_PATH && source api/.env && pg_dump ... -> $REMOTE_FILE"
  echo "[dry-run] scp -> $LOCAL_FILE"
  exit 0
fi

echo "Creating dump on $SERVER_USER@$SERVER_IP ..."

"${SSH[@]}" bash <<EOS
set -euo pipefail
cd $(printf '%q' "$SERVER_PATH")
REMOTE_DB_HOST=$(printf '%q' "${REMOTE_DB_HOST:-}")
REMOTE_DB_PORT=$(printf '%q' "${REMOTE_DB_PORT:-}")
REMOTE_DB_USER=$(printf '%q' "${REMOTE_DB_USER:-}")
REMOTE_DB_NAME=$(printf '%q' "${REMOTE_DB_NAME:-}")
REMOTE_DB_PASSWORD=$(printf '%q' "${REMOTE_DB_PASSWORD:-}")
if [[ -f api/.env ]]; then
  set -a
  # shellcheck disable=SC1091
  source api/.env
  set +a
fi
DB_HOST="\${REMOTE_DB_HOST:-\${DB_HOST:-127.0.0.1}}"
DB_PORT="\${REMOTE_DB_PORT:-\${DB_PORT:-5432}}"
DB_USER="\${REMOTE_DB_USER:-\${DB_USER:-postgres}}"
DB_NAME="\${REMOTE_DB_NAME:-\${DB_NAME:-government_projects}}"
export PGPASSWORD="\${REMOTE_DB_PASSWORD:-\${DB_PASSWORD:-postgres}}"
OUT=$(printf '%q' "$REMOTE_FILE")
if [[ "$ORG_ONLY" -eq 1 ]]; then
  pg_dump -h "\$DB_HOST" -p "\$DB_PORT" -U "\$DB_USER" -d "\$DB_NAME" -F p --no-owner --no-acl \\
    -t public.users \\
    -t public.user_organization_scope \\
    -t public.agencies \\
    -t public.roles \\
    -f "\$OUT"
else
  pg_dump -h "\$DB_HOST" -p "\$DB_PORT" -U "\$DB_USER" -d "\$DB_NAME" -F p --no-owner --no-acl -f "\$OUT"
fi
echo "Remote dump written: \$OUT"
EOS

echo "Downloading to $LOCAL_FILE ..."
scp -i "$SSH_KEY" "$SERVER_USER@$SERVER_IP:$REMOTE_FILE" "$LOCAL_FILE"

echo "Removing remote temp file..."
"${SSH[@]}" "rm -f $(printf '%q' "$REMOTE_FILE")"

echo ""
echo "Done. Local file:"
echo "  $LOCAL_FILE"
echo ""
echo "Restore into a spare local DB (do not overwrite production without a backup):"
echo "  export PGPASSWORD=...  # from your api/.env"
echo "  psql -h localhost -U <user> -d postgres -c \"CREATE DATABASE gprs_remote_snap;\""
echo "  psql -h localhost -U <user> -d gprs_remote_snap -v ON_ERROR_STOP=1 -f \"$LOCAL_FILE\""
echo ""
