#!/usr/bin/env bash
# Simple setup: uses the connection details below directly (no .env).
# Creates revised_gov_db from government_projects, then creates gov_local_user and .envGov.
#
# If you get "permission denied to create database", grant once as postgres superuser:
#   psql -U postgres -d postgres -c "ALTER ROLE postgres_user CREATEDB CREATEROLE;"
# Then run this script again.
set -e

# --- Your local DB connection (used for dump + create/restore) ---
# Set secrets in the environment; do not commit real passwords.
DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-5432}"
DB_USER="${DB_USER:-postgres_user}"
DB_PASSWORD="${SOURCE_DB_PASSWORD:?Set SOURCE_DB_PASSWORD for the source DB user ${DB_USER}}"
DB_NAME="${DB_NAME:-government_projects}"

# --- Target ---
TARGET_DB="revised_gov_db"
NEW_USER="gov_local_user"
NEW_PASS="${GOV_LOCAL_PASSWORD:?Set GOV_LOCAL_PASSWORD for new role ${NEW_USER}}"

# --- Paths ---
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DUMP_FILE="${SCRIPT_DIR}/.revised_gov_db_dump.sql"
ENVGOV_FILE="${SCRIPT_DIR}/.envGov"

echo "--- 1) Dump ${DB_NAME} to ${DUMP_FILE}"
export PGPASSWORD="$DB_PASSWORD"
pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -F p -f "$DUMP_FILE"
unset PGPASSWORD
echo "    Done."

echo "--- 2) Create database ${TARGET_DB} (drop if exists)"
export PGPASSWORD="$DB_PASSWORD"
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -v ON_ERROR_STOP=1 -c "
  SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${TARGET_DB}' AND pid <> pg_backend_pid();
" 2>/dev/null || true
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS ${TARGET_DB};"
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE ${TARGET_DB};"
echo "    Done."

echo "--- 3) Restore dump into ${TARGET_DB}"
export PGPASSWORD="$DB_PASSWORD"
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$TARGET_DB" -v ON_ERROR_STOP=1 -f "$DUMP_FILE"
unset PGPASSWORD
echo "    Done."

echo "--- 4) Create user ${NEW_USER} and grant privileges"
export PGPASSWORD="$DB_PASSWORD"
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -v ON_ERROR_STOP=1 -c "
  DO \$\$
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${NEW_USER}') THEN
      CREATE ROLE ${NEW_USER} WITH LOGIN PASSWORD '${NEW_PASS}';
    ELSE
      ALTER ROLE ${NEW_USER} WITH PASSWORD '${NEW_PASS}';
    END IF;
  END \$\$;
"
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -v ON_ERROR_STOP=1 -c "GRANT CONNECT ON DATABASE ${TARGET_DB} TO ${NEW_USER};"
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$TARGET_DB" -v ON_ERROR_STOP=1 -c "
  GRANT USAGE ON SCHEMA public TO ${NEW_USER};
  GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO ${NEW_USER};
  GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO ${NEW_USER};
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO ${NEW_USER};
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO ${NEW_USER};
"
unset PGPASSWORD
echo "    Done."

echo "--- 5) Write ${ENVGOV_FILE}"
cat > "$ENVGOV_FILE" << EOF
# Connection to revised government DB
DB_TYPE=postgresql
DB_HOST=${DB_HOST}
DB_PORT=${DB_PORT}
DB_NAME=${TARGET_DB}
DB_USER=${NEW_USER}
DB_PASSWORD=${NEW_PASS}
EOF
echo "    Done."

echo "--- 6) Remove dump file"
rm -f "$DUMP_FILE"
echo "    Done."

echo "Done. Database ${TARGET_DB} is ready. User: ${NEW_USER}. Config: ${ENVGOV_FILE}"
