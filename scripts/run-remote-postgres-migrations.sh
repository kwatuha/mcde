#!/usr/bin/env bash
#
# Run selected PostgreSQL migrations against the REMOTE GPRS database over SSH.
# Default migrations include:
#   - role rename migration
#   - scope-down obsolete privileges cleanup
#
# Usage:
#   chmod +x scripts/run-remote-postgres-migrations.sh
#   ./scripts/run-remote-postgres-migrations.sh
#   ./scripts/run-remote-postgres-migrations.sh --dry-run
#   ./scripts/run-remote-postgres-migrations.sh --with-org-scope
#   ./scripts/run-remote-postgres-migrations.sh --no-backup
#   ./scripts/run-remote-postgres-migrations.sh --as-postgres
#
# Optional environment overrides:
#   SERVER_USER, SERVER_IP, SSH_KEY, SERVER_PATH
#   REMOTE_DB_HOST, REMOTE_DB_PORT, REMOTE_DB_USER, REMOTE_DB_NAME, REMOTE_DB_PASSWORD
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Defaults aligned with deploy/pull scripts.
SERVER_USER="${SERVER_USER:-fortress}"
SERVER_IP="${SERVER_IP:-102.210.149.119}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/id_gprs_server}"
SERVER_PATH="${SERVER_PATH:-/home/fortress/gprs}"

DRY_RUN=0
NO_BACKUP=0
WITH_ORG_SCOPE=0
AS_POSTGRES=0

usage() {
  sed -n '1,36p' "$0"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    --no-backup)
      NO_BACKUP=1
      shift
      ;;
    --with-org-scope)
      WITH_ORG_SCOPE=1
      shift
      ;;
    --as-postgres)
      AS_POSTGRES=1
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if [[ ! -f "$SSH_KEY" ]]; then
  echo "ERROR: SSH key not found: $SSH_KEY" >&2
  exit 1
fi

MIGRATIONS=(
  "$REPO_ROOT/scripts/migration/rename-role-names.sql"
  "$REPO_ROOT/scripts/migration/remove-scope-down-obsolete-privileges.sql"
)

if [[ "$WITH_ORG_SCOPE" -eq 1 ]]; then
  MIGRATIONS+=("$REPO_ROOT/scripts/migration/add-user-organization-scope.sql")
fi

for migration in "${MIGRATIONS[@]}"; do
  if [[ ! -f "$migration" ]]; then
    echo "ERROR: migration file not found: $migration" >&2
    exit 1
  fi
done

SSH=(ssh -i "$SSH_KEY" -o ConnectTimeout=15 "$SERVER_USER@$SERVER_IP")
STAMP="$(date +%Y%m%d-%H%M%S)"
REMOTE_BACKUP_FILE="/tmp/gprs-pre-migrations-${STAMP}.sql"

remote_db_bootstrap='
set -euo pipefail
cd '"$(printf '%q' "$SERVER_PATH")"'
if [[ -f api/.env ]]; then
  set -a
  # shellcheck disable=SC1091
  source api/.env
  set +a
fi
DB_HOST="${REMOTE_DB_HOST:-${DB_HOST:-127.0.0.1}}"
DB_PORT="${REMOTE_DB_PORT:-${DB_PORT:-5432}}"
DB_USER="${REMOTE_DB_USER:-${DB_USER:-postgres}}"
DB_NAME="${REMOTE_DB_NAME:-${DB_NAME:-government_projects}}"
export PGPASSWORD="${REMOTE_DB_PASSWORD:-${DB_PASSWORD:-postgres}}"
'

echo "Target remote: $SERVER_USER@$SERVER_IP"
echo "Remote app path: $SERVER_PATH"
echo "Migrations to run:"
for migration in "${MIGRATIONS[@]}"; do
  echo "  - ${migration#$REPO_ROOT/}"
done
echo ""

if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "[dry-run] Would connect with SSH key: $SSH_KEY"
  if [[ "$NO_BACKUP" -eq 0 ]]; then
    echo "[dry-run] Would create remote backup: $REMOTE_BACKUP_FILE"
  fi
  if [[ "$AS_POSTGRES" -eq 1 ]]; then
    echo "[dry-run] Would run migrations using: sudo -u postgres psql -d <db> -v ON_ERROR_STOP=1 -f -"
  else
    echo "[dry-run] Would run migrations using: psql -h <host> -p <port> -U <user> -d <db> -v ON_ERROR_STOP=1 -f -"
  fi
  exit 0
fi

if [[ "$NO_BACKUP" -eq 0 ]]; then
  echo "Creating remote pre-migration backup..."
  if [[ "$AS_POSTGRES" -eq 1 ]]; then
    "${SSH[@]}" "bash -lc $(printf '%q' "$remote_db_bootstrap"'sudo -u postgres pg_dump -d "$DB_NAME" -F p --no-owner --no-acl -f '"$(printf '%q' "$REMOTE_BACKUP_FILE")"'; chmod 600 '"$(printf '%q' "$REMOTE_BACKUP_FILE")"'; echo \"Backup: '"$REMOTE_BACKUP_FILE"'\"')"
  else
    "${SSH[@]}" "bash -lc $(printf '%q' "$remote_db_bootstrap"'pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -F p --no-owner --no-acl -f '"$(printf '%q' "$REMOTE_BACKUP_FILE")"'; chmod 600 '"$(printf '%q' "$REMOTE_BACKUP_FILE")"'; echo \"Backup: '"$REMOTE_BACKUP_FILE"'\"')"
  fi
  echo ""
fi

for migration in "${MIGRATIONS[@]}"; do
  rel_path="${migration#$REPO_ROOT/}"
  echo "Applying $rel_path ..."
  if [[ "$AS_POSTGRES" -eq 1 ]]; then
    "${SSH[@]}" "bash -lc $(printf '%q' "$remote_db_bootstrap"'sudo -u postgres psql -d "$DB_NAME" -v ON_ERROR_STOP=1 -f -')" < "$migration"
  else
    "${SSH[@]}" "bash -lc $(printf '%q' "$remote_db_bootstrap"'psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -f -')" < "$migration"
  fi
  echo "Done: $rel_path"
  echo ""
done

echo "All selected migrations completed successfully."
if [[ "$NO_BACKUP" -eq 0 ]]; then
  echo "Remote backup file: $REMOTE_BACKUP_FILE"
fi

