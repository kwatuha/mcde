#!/usr/bin/env bash
# 1) Dump local DB to db_backups/
# 2) Dump remote DB to db_backups/
# 3) Replace local DB with the remote backup
#
# Remote DB: set REMOTE_DB_* env vars, or create api/.env.remote with:
#   REMOTE_DB_HOST=your-remote-host
#   REMOTE_DB_PORT=5432
#   REMOTE_DB_NAME=government_projects
#   REMOTE_DB_USER=your_user
#   REMOTE_DB_PASSWORD=your_password

set -e
BACKUP_DIR="/home/dev/dev/imes_working/db_backups"
TS=$(date +%Y%m%d_%H%M%S)
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
API_ENV="${PROJECT_ROOT}/api/.env"
REMOTE_ENV="${PROJECT_ROOT}/api/.env.remote"

# Load local DB config
if [[ ! -f "$API_ENV" ]]; then
  echo "Missing ${API_ENV}"
  exit 1
fi
source "$API_ENV"
LOCAL_HOST="${DB_HOST:-127.0.0.1}"
LOCAL_PORT="${DB_PORT:-5432}"
LOCAL_USER="${DB_USER}"
LOCAL_PASS="${DB_PASSWORD}"
LOCAL_DB="${DB_NAME}"

# Load remote DB config (api/.env.remote or REMOTE_DB_* env)
if [[ -f "$REMOTE_ENV" ]]; then
  source "$REMOTE_ENV"
fi
REMOTE_HOST="${REMOTE_DB_HOST:?Set REMOTE_DB_HOST or create api/.env.remote}"
REMOTE_PORT="${REMOTE_DB_PORT:-5432}"
REMOTE_USER="${REMOTE_DB_USER:?Set REMOTE_DB_USER}"
REMOTE_PASS="${REMOTE_DB_PASSWORD:?Set REMOTE_DB_PASSWORD}"
REMOTE_DB="${REMOTE_DB_NAME:-government_projects}"

LOCAL_BACKUP="${BACKUP_DIR}/local_${LOCAL_DB}_${TS}.sql"
REMOTE_BACKUP="${BACKUP_DIR}/remote_${REMOTE_DB}_${TS}.sql"

echo "--- 1) Dump local DB to ${LOCAL_BACKUP}"
export PGPASSWORD="$LOCAL_PASS"
pg_dump -h "$LOCAL_HOST" -p "$LOCAL_PORT" -U "$LOCAL_USER" -d "$LOCAL_DB" -F p -f "$LOCAL_BACKUP"
unset PGPASSWORD
echo "    Done."

echo "--- 2) Dump remote DB to ${REMOTE_BACKUP}"
export PGPASSWORD="$REMOTE_PASS"
pg_dump -h "$REMOTE_HOST" -p "$REMOTE_PORT" -U "$REMOTE_USER" -d "$REMOTE_DB" -F p -f "$REMOTE_BACKUP"
unset PGPASSWORD
echo "    Done."

echo "--- 3) Replace local DB with remote backup"
export PGPASSWORD="$LOCAL_PASS"
# Terminate existing connections to local DB (connect to 'postgres' to run)
psql -h "$LOCAL_HOST" -p "$LOCAL_PORT" -U "$LOCAL_USER" -d postgres -v ON_ERROR_STOP=1 -c "
  SELECT pg_terminate_backend(pid) FROM pg_stat_activity
  WHERE datname = '${LOCAL_DB}' AND pid <> pg_backend_pid();
"
psql -h "$LOCAL_HOST" -p "$LOCAL_PORT" -U "$LOCAL_USER" -d postgres -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS ${LOCAL_DB};"
psql -h "$LOCAL_HOST" -p "$LOCAL_PORT" -U "$LOCAL_USER" -d postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE ${LOCAL_DB};"
psql -h "$LOCAL_HOST" -p "$LOCAL_PORT" -U "$LOCAL_USER" -d "$LOCAL_DB" -v ON_ERROR_STOP=1 -f "$REMOTE_BACKUP"
unset PGPASSWORD
echo "    Done."
echo "Local DB ${LOCAL_DB} is now a copy of remote ${REMOTE_DB}. Backups: ${LOCAL_BACKUP}, ${REMOTE_BACKUP}"
