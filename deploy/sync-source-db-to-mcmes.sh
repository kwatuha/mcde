#!/usr/bin/env bash
#
# Copy PostgreSQL from the source Machakos server (users + sample data) to MCmes.
# Does NOT use your laptop database — dump runs on SOURCE, restore on TARGET over SSH.
#
# Prerequisites:
#   - SOURCE api/.env with working DB_* (default: kunye@165.22.227.234)
#   - TARGET api/.env with machakos_mcmes / mcmes_app (default: administrator@84.247.128.58)
#   - pg_dump on SOURCE, psql on TARGET
#   - TARGET database machakos_mcmes owned by mcmes_app (setup-server-postgresql-native.sh)
#
# Usage:
#   DEPLOY_SYNC_DB_CONFIRM=yes ./deploy/sync-source-db-to-mcmes.sh
#
# Overrides:
#   SOURCE_HOST SOURCE_USER SOURCE_PATH
#   TARGET_HOST TARGET_USER TARGET_PATH
#   SSH_IDENTITY=~/.ssh/id_asusme
#   DEPLOY_RESTORE_SUDO_POSTGRES=yes
#   DEPLOY_STRIP_VECTOR_EXTENSION_DDL=yes
#   DEPLOY_PSQL_DOCKER_IMAGE=postgres:16-alpine
#   SKIP_DUMP=1 TARGET_REMOTE_DUMP=/tmp/source_to_mcmes_....sql.gz   # resume restore only
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
DEPLOY_SYNC_DB_CONFIRM="${DEPLOY_SYNC_DB_CONFIRM:-}"
DEPLOY_RESTORE_SUDO_POSTGRES="${DEPLOY_RESTORE_SUDO_POSTGRES:-}"
DEPLOY_STRIP_VECTOR_EXTENSION_DDL="${DEPLOY_STRIP_VECTOR_EXTENSION_DDL:-}"
DEPLOY_PSQL_DOCKER_IMAGE="${DEPLOY_PSQL_DOCKER_IMAGE:-postgres:16-alpine}"
SKIP_DUMP="${SKIP_DUMP:-0}"
TARGET_REMOTE_DUMP="${TARGET_REMOTE_DUMP:-}"
LOCAL_DUMP_PATH="${LOCAL_DUMP_PATH:-}"

if [[ "${DEPLOY_SYNC_DB_CONFIRM}" != "yes" ]]; then
  echo "This OVERWRITES the database in TARGET api/.env on ${TARGET_USER}@${TARGET_HOST}." >&2
  echo "Set:  DEPLOY_SYNC_DB_CONFIRM=yes ./deploy/sync-source-db-to-mcmes.sh" >&2
  exit 2
fi

SSH_OPTS=(-o StrictHostKeyChecking=accept-new)
if [[ -n "$SSH_IDENTITY" && -f "${SSH_IDENTITY/#\~/$HOME}" ]]; then
  SSH_OPTS+=(-i "${SSH_IDENTITY/#\~/$HOME}")
fi

SOURCE_REMOTE="${SOURCE_USER}@${SOURCE_HOST}"
TARGET_REMOTE="${TARGET_USER}@${TARGET_HOST}"

load_env_file_allowlist() {
  local env_file="$1"
  local allow_csv="$2"
  [[ -f "$env_file" ]] || return 0
  local line key value f l
  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line%$'\r'}"
    [[ "$line" =~ ^[[:space:]]*# ]] && continue
    [[ -z "${line//[[:space:]]/}" ]] && continue
    [[ "$line" != *=* ]] && continue
    key="${line%%=*}"
    value="${line#*=}"
    key="${key#"${key%%[![:space:]]*}"}"
    key="${key%"${key##*[![:space:]]}"}"
    [[ " $allow_csv " == *" $key "* ]] || continue
    [[ "$key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || continue
    value="${value#"${value%%[![:space:]]*}"}"
    value="${value%"${value##*[![:space:]]}"}"
    if [[ ${#value} -ge 2 ]]; then
      f="${value:0:1}"
      l="${value: -1}"
      if [[ "$f" == '"' && "$l" == '"' ]]; then value="${value:1:${#value}-2}"; fi
      if [[ "$f" == "'" && "$l" == "'" ]]; then value="${value:1:${#value}-2}"; fi
    fi
    declare -gx "${key}=${value}"
  done <"$env_file"
}

BACKUP_DIR="${ROOT}/db_backups"
mkdir -p "$BACKUP_DIR"
STAMP="$(date +%Y%m%d_%H%M%S)"
DUMP_LOCAL="${BACKUP_DIR}/source_to_mcmes_${STAMP}.sql.gz"
REMOTE_DUMP=""

if [[ "$SKIP_DUMP" == "1" || "$SKIP_DUMP" == "yes" ]]; then
  if [[ -n "$TARGET_REMOTE_DUMP" ]]; then
    REMOTE_DUMP="$TARGET_REMOTE_DUMP"
    echo "==> Skipping dump; using existing dump on TARGET: ${REMOTE_DUMP}"
  elif [[ -n "$LOCAL_DUMP_PATH" ]]; then
    if [[ "$LOCAL_DUMP_PATH" != /* ]]; then
      LOCAL_DUMP_PATH="${ROOT}/${LOCAL_DUMP_PATH}"
    fi
    if [[ ! -f "$LOCAL_DUMP_PATH" ]]; then
      echo "LOCAL_DUMP_PATH not found: ${LOCAL_DUMP_PATH}" >&2
      exit 1
    fi
    DUMP_LOCAL="$LOCAL_DUMP_PATH"
    echo "==> Skipping SOURCE dump; uploading local file: ${DUMP_LOCAL}"
    scp "${SSH_OPTS[@]}" "$DUMP_LOCAL" "${TARGET_REMOTE}:/tmp/$(basename "$DUMP_LOCAL")"
    REMOTE_DUMP="/tmp/$(basename "$DUMP_LOCAL")"
  else
    echo "SKIP_DUMP=1 requires TARGET_REMOTE_DUMP or LOCAL_DUMP_PATH" >&2
    exit 1
  fi
else
  echo "==> Dumping SOURCE ${SOURCE_REMOTE}:${SOURCE_PATH}"
  ssh "${SSH_OPTS[@]}" "$SOURCE_REMOTE" \
    env DEPLOY_PATH="$SOURCE_PATH" \
    bash -s <<REMOTE_DUMP | sed '/^\\restrict/d;/^\\unrestrict/d' | gzip -1 >"$DUMP_LOCAL"
$(declare -f load_env_file_allowlist)
set -euo pipefail
cd "\$DEPLOY_PATH"
load_env_file_allowlist api/.env "DATABASE_URL DB_HOST DB_PORT DB_USER DB_PASSWORD DB_NAME"
if [[ -n "\${DATABASE_URL:-}" ]]; then
  pg_dump --no-owner --no-acl -F p "\$DATABASE_URL"
  exit 0
fi
DB_HOST_USE="\${DB_HOST:-127.0.0.1}"
if [[ "\$DB_HOST_USE" == "host.docker.internal" ]]; then
  DB_HOST_USE="127.0.0.1"
fi
if ! command -v pg_dump >/dev/null 2>&1; then
  echo "pg_dump not found on SOURCE server" >&2
  exit 1
fi
export PGPASSWORD="\${DB_PASSWORD:?DB_PASSWORD missing on SOURCE}"
pg_dump -h "\$DB_HOST_USE" -p "\${DB_PORT:-5432}" -U "\${DB_USER:?}" -d "\${DB_NAME:?}" --no-owner --no-acl -F p
unset PGPASSWORD
REMOTE_DUMP

  echo "    Dump saved: ${DUMP_LOCAL} ($(du -h "$DUMP_LOCAL" | cut -f1))"

  echo "==> Uploading dump to ${TARGET_REMOTE}:/tmp/"
  scp "${SSH_OPTS[@]}" "$DUMP_LOCAL" "${TARGET_REMOTE}:/tmp/$(basename "$DUMP_LOCAL")"
  REMOTE_DUMP="/tmp/$(basename "$DUMP_LOCAL")"
fi

echo "==> Restoring on TARGET ${TARGET_REMOTE} (database from TARGET api/.env)"
ssh "${SSH_OPTS[@]}" "$TARGET_REMOTE" \
  env DEPLOY_PATH="$TARGET_PATH" \
      REMOTE_DUMP="$REMOTE_DUMP" \
      DEPLOY_RESTORE_SUDO_POSTGRES="${DEPLOY_RESTORE_SUDO_POSTGRES}" \
      DEPLOY_STRIP_VECTOR_EXTENSION_DDL="${DEPLOY_STRIP_VECTOR_EXTENSION_DDL}" \
      DEPLOY_PSQL_DOCKER_IMAGE="${DEPLOY_PSQL_DOCKER_IMAGE}" \
  bash -s <<REMOTE_RESTORE
$(declare -f load_env_file_allowlist)
set -euo pipefail
cd "\$DEPLOY_PATH"
load_env_file_allowlist api/.env "DATABASE_URL DB_HOST DB_PORT DB_USER DB_PASSWORD DB_NAME"

DB_HOST_USE="\${DB_HOST:-127.0.0.1}"
if [[ "\$DB_HOST_USE" == "host.docker.internal" ]]; then
  DB_HOST_USE="127.0.0.1"
fi
DB_PORT_USE="\${DB_PORT:-5432}"
DB_USER_USE="\${DB_USER:?DB_USER missing in TARGET api/.env}"
DB_NAME_USE="\${DB_NAME:?DB_NAME missing in TARGET api/.env}"
export PGPASSWORD="\${DB_PASSWORD:?DB_PASSWORD missing in TARGET api/.env}"

PSQL_BIN=""
for candidate in /usr/bin/psql /usr/local/bin/psql \
  /usr/lib/postgresql/18/bin/psql /usr/lib/postgresql/17/bin/psql \
  /usr/lib/postgresql/16/bin/psql /usr/lib/postgresql/15/bin/psql; do
  if [[ -x "\$candidate" ]]; then PSQL_BIN="\$candidate"; break; fi
done
if [[ -z "\$PSQL_BIN" ]] && command -v psql >/dev/null 2>&1; then
  PSQL_BIN="psql"
fi
PSQL_DOCKER_MODE=0
if [[ -z "\$PSQL_BIN" ]]; then
  if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
    PSQL_DOCKER_MODE=1
    echo "    No host psql; using docker run --network host \${DEPLOY_PSQL_DOCKER_IMAGE:-postgres:16-alpine} psql ..."
  else
    echo "psql not found on TARGET and Docker is not usable." >&2
    echo "Fix: sudo apt install postgresql-client   OR ensure docker works for user \$(whoami)" >&2
    exit 1
  fi
fi

run_psql() {
  local db="\$1"
  shift
  if [[ "\$PSQL_DOCKER_MODE" == "1" ]]; then
    docker run --rm -i --network host -e PGPASSWORD="\$PGPASSWORD" \
      "\${DEPLOY_PSQL_DOCKER_IMAGE:-postgres:16-alpine}" \
      psql -h "\$DB_HOST_USE" -p "\$DB_PORT_USE" -U "\$DB_USER_USE" -d "\$db" "\$@"
  else
    "\$PSQL_BIN" -h "\$DB_HOST_USE" -p "\$DB_PORT_USE" -U "\$DB_USER_USE" -d "\$db" "\$@"
  fi
}

STRIP_VECTOR=(cat)
if [[ "\${DEPLOY_STRIP_VECTOR_EXTENSION_DDL:-}" == "1" || "\${DEPLOY_STRIP_VECTOR_EXTENSION_DDL:-}" == "yes" ]]; then
  STRIP_VECTOR=(sed -E \
    -e '/^DROP EXTENSION( IF EXISTS)?[[:space:]]+vector\b/d' \
    -e '/^CREATE EXTENSION( IF NOT EXISTS)?[[:space:]]+vector\b/d' \
    -e '/^COMMENT ON EXTENSION[[:space:]]+vector\b/d' \
    -e '/^ALTER EXTENSION[[:space:]]+vector\b/d')
fi

echo "    Target DB: \${DB_USER_USE}@\${DB_HOST_USE}:\${DB_PORT_USE}/\${DB_NAME_USE}"
if [[ ! -f "\$REMOTE_DUMP" ]]; then
  echo "Dump missing on TARGET: \$REMOTE_DUMP" >&2
  exit 1
fi

docker compose -f docker-compose.server.yml stop api 2>/dev/null || true
sleep 2

run_psql postgres -v ON_ERROR_STOP=0 -qtAc \
  "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '\${DB_NAME_USE}' AND pid <> pg_backend_pid();" \
  >/dev/null 2>&1 || true

if [[ "\${DEPLOY_RESTORE_SUDO_POSTGRES:-}" == "1" || "\${DEPLOY_RESTORE_SUDO_POSTGRES:-}" == "yes" ]]; then
  if [[ -z "\$PSQL_BIN" ]]; then
    echo "DEPLOY_RESTORE_SUDO_POSTGRES requires host psql (not docker-only mode)" >&2
    exit 1
  fi
  gunzip -c "\$REMOTE_DUMP" | sed '/^\\restrict/d;/^\\unrestrict/d' | "\${STRIP_VECTOR[@]}" \
    | sudo -n -u postgres "\$PSQL_BIN" -p "\$DB_PORT_USE" -d "\$DB_NAME_USE" -v ON_ERROR_STOP=1
  # REASSIGN OWNED fails on system-owned objects; transfer app objects in public only.
  sudo -n -u postgres "\$PSQL_BIN" -p "\$DB_PORT_USE" -d "\$DB_NAME_USE" -v ON_ERROR_STOP=1 <<EOSQL
DO \$\$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE public.%I OWNER TO %I', r.tablename, '\${DB_USER_USE}');
  END LOOP;
  FOR r IN SELECT sequence_name FROM information_schema.sequences WHERE sequence_schema = 'public'
  LOOP
    EXECUTE format('ALTER SEQUENCE public.%I OWNER TO %I', r.sequence_name, '\${DB_USER_USE}');
  END LOOP;
  FOR r IN SELECT viewname FROM pg_views WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER VIEW public.%I OWNER TO %I', r.viewname, '\${DB_USER_USE}');
  END LOOP;
END
\$\$;
ALTER SCHEMA public OWNER TO "\${DB_USER_USE}";
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO "\${DB_USER_USE}";
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO "\${DB_USER_USE}";
EOSQL
else
  gunzip -c "\$REMOTE_DUMP" | sed '/^\\restrict/d;/^\\unrestrict/d' | "\${STRIP_VECTOR[@]}" \
    | run_psql "\$DB_NAME_USE" -v ON_ERROR_STOP=1
fi

unset PGPASSWORD
docker compose -f docker-compose.server.yml up -d api 2>/dev/null || true
rm -f "\$REMOTE_DUMP"
echo "    TARGET restore finished."
REMOTE_RESTORE

echo "==> Done."
if [[ -f "$DUMP_LOCAL" ]]; then
  echo "    Local dump kept: ${DUMP_LOCAL}"
fi
echo "    Run county-role migrations on MCmes if position_rows is still 0."
echo "    APP_LOGIN_URL on MCmes should be http://${TARGET_HOST}:8084/login"
echo "    Copy photos/documents from SOURCE (DB does not include files):"
echo "      DEPLOY_SYNC_UPLOADS_CONFIRM=yes ./deploy/sync-source-uploads-to-mcmes.sh"
