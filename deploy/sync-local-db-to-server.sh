#!/usr/bin/env bash
#
# Push your LOCAL PostgreSQL database to the REMOTE server's Postgres (overwrites remote data).
#
# Prerequisites:
#   - Local: Postgres anywhere (Docker or native) — pg_dump uses YOUR machine's api/.env only.
#   - Remote Postgres:
#       A) Published on the host (DB_HOST=127.0.0.1 or host.docker.internal with a mapped port):
#          default path runs psql ON THE SERVER HOST (same as now).
#       B) Only inside a Docker network (api/.env uses a hostname the host cannot resolve):
#          set DEPLOY_RESTORE_DOCKER_CONTAINER to the Postgres container name or ID, e.g.
#            export DEPLOY_RESTORE_DOCKER_CONTAINER=machakosme_postgres_1
#          Restore then uses: gunzip | docker exec -i <container> psql -U ... -d ...
#       C) psql missing on server: set DEPLOY_PSQL_PATH, or use Docker (DEPLOY_RESTORE_DOCKER_CONTAINER or
#          ephemeral DEPLOY_PSQL_DOCKER_IMAGE + docker run --network host when apt is unavailable).
#   - Remote user can run docker compose -f docker-compose.server.yml stop/start api and docker exec.
#
# Native DB on server (no Docker for Postgres): see deploy/setup-server-postgresql-native.sh (run on server with sudo).
#
# pgvector: if your dump contains CREATE EXTENSION vector (RAG / embedding columns), the REMOTE server must
# have pgvector installed. Vanilla postgres:* Docker images do not ship it — use pgvector/pgvector:pg<major>
# or install postgresql-<major>-pgvector on the host. Otherwise restore fails with "extension vector is not available".
#
# pg_dump 17.6+ adds psql meta-lines \restrict / \unrestrict; older psql rejects them. This script strips those lines
# when building the dump and again when piping into psql on the server.
#
# Restore as app user fails on DROP EXTENSION vector (clean dumps) if the extension owner is still postgres.
# Either one-time on server (PostgreSQL has no ALTER EXTENSION ... OWNER TO): update pg_extension.extowner, e.g.
#   sudo -u postgres psql -p PORT -d DB -c "UPDATE pg_extension SET extowner = (SELECT oid FROM pg_roles WHERE rolname = 'appuser') WHERE extname = 'vector';"
# Or set DEPLOY_RESTORE_SUDO_POSTGRES=yes (host-native psql path only): restore pipes through sudo -n -u postgres,
# then REASSIGN OWNED + UPDATE pg_extension for vector. Requires passwordless sudo for that psql (NOPASSWD); ssh has no TTY.
#
# pg_dump --clean emits DROP/CREATE/COMMENT/ALTER EXTENSION vector; CREATE requires superuser. To restore as a normal
# DB user when vector is already on the server (superuser CREATE EXTENSION + optional UPDATE pg_extension extowner), set:
#   DEPLOY_STRIP_VECTOR_EXTENSION_DDL=yes
# so matching lines (including quoted "vector") are removed from the dump before gzip (see deploy-to-server.sh header).
#
# Safety (required for non-dry-run):
#   export DEPLOY_SYNC_DB_CONFIRM=yes
#
# Usage (standalone):
#   DEPLOY_HOST=165.22.227.234 DEPLOY_USER=kunye DEPLOY_PATH=/home/kunye/dev/machakos \
#   DEPLOY_SYNC_DB_CONFIRM=yes ./deploy/sync-local-db-to-server.sh
# With clean dumps + extension vector + app-owned restore issues:
#   DEPLOY_RESTORE_SUDO_POSTGRES=yes DEPLOY_SYNC_DB_CONFIRM=yes ./deploy/sync-local-db-to-server.sh
# Or strip vector extension DDL if vector is pre-installed on server (no superuser restore):
#   DEPLOY_STRIP_VECTOR_EXTENSION_DDL=yes DEPLOY_SYNC_DB_CONFIRM=yes ./deploy/sync-local-db-to-server.sh
#
# Dry run (dump only to repo db_backups/, no SSH restore):
#   ./deploy/sync-local-db-to-server.sh --dry-run
#
# Optional: deploy/.env.deploy.db (not in git) can set DEPLOY_HOST DEPLOY_USER DEPLOY_PATH
#
set -euo pipefail

# Do NOT `source api/.env` — values with spaces (e.g. SMTP_FROM=Government ...) break bash.
# Load only an explicit allowlist of KEY=value assignments (dotenv-style, one line per key).
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

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

DEPLOY_HOST="${DEPLOY_HOST:-165.22.227.234}"
DEPLOY_USER="${DEPLOY_USER:-kunye}"
DEPLOY_PATH="${DEPLOY_PATH:-/home/kunye/dev/machakos}"
SSH_IDENTITY="${SSH_IDENTITY:-}"
DEPLOY_SYNC_DB_CONFIRM="${DEPLOY_SYNC_DB_CONFIRM:-}"
DEPLOY_RESTORE_DOCKER_CONTAINER="${DEPLOY_RESTORE_DOCKER_CONTAINER:-}"
DEPLOY_PSQL_PATH="${DEPLOY_PSQL_PATH:-}"
DEPLOY_PSQL_DOCKER_IMAGE="${DEPLOY_PSQL_DOCKER_IMAGE:-postgres:16-alpine}"
DEPLOY_RESTORE_SUDO_POSTGRES="${DEPLOY_RESTORE_SUDO_POSTGRES:-}"
DEPLOY_STRIP_VECTOR_EXTENSION_DDL="${DEPLOY_STRIP_VECTOR_EXTENSION_DDL:-}"

SSH_OPTS=(-o StrictHostKeyChecking=accept-new)
if [[ -n "$SSH_IDENTITY" ]]; then
  SSH_OPTS+=(-i "${SSH_IDENTITY/#\~/$HOME}")
fi
REMOTE="${DEPLOY_USER}@${DEPLOY_HOST}"

API_ENV="${ROOT}/api/.env"
DEPLOY_DB_ENV="${ROOT}/deploy/.env.deploy.db"
DRY_RUN=0
for arg in "$@"; do
  if [[ "$arg" == "--dry-run" ]]; then DRY_RUN=1; fi
done

if [[ -f "$DEPLOY_DB_ENV" ]]; then
  load_env_file_allowlist "$DEPLOY_DB_ENV" "DEPLOY_HOST DEPLOY_USER DEPLOY_PATH DEPLOY_RESTORE_DOCKER_CONTAINER DEPLOY_PSQL_PATH DEPLOY_PSQL_DOCKER_IMAGE DEPLOY_SYNC_DB_CONFIRM DEPLOY_RESTORE_SUDO_POSTGRES DEPLOY_STRIP_VECTOR_EXTENSION_DDL"
fi

if [[ ! -f "$API_ENV" ]]; then
  echo "Missing ${API_ENV}" >&2
  exit 1
fi

load_env_file_allowlist "$API_ENV" "DATABASE_URL DB_HOST DB_PORT DB_USER DB_PASSWORD DB_NAME"

if [[ "$DRY_RUN" -eq 0 && "${DEPLOY_SYNC_DB_CONFIRM}" != "yes" ]]; then
  echo "Refusing to overwrite remote database." >&2
  echo "Set:  export DEPLOY_SYNC_DB_CONFIRM=yes" >&2
  echo "Or:   ./deploy/sync-local-db-to-server.sh --dry-run   (writes a local dump only)" >&2
  exit 2
fi

BACKUP_DIR="${ROOT}/db_backups"
mkdir -p "$BACKUP_DIR"
STAMP="$(date +%Y%m%d_%H%M%S)"
DUMP_LOCAL="${BACKUP_DIR}/local_to_server_${STAMP}.sql.gz"

echo "==> Dumping local database to ${DUMP_LOCAL}"
# pg_dump 17.6+ emits psql \restrict / \unrestrict; older psql (e.g. 16) fails with "invalid command \restrict".
STRIP_PSQL_RESTRICT=(sed '/^\\restrict/d;/^\\unrestrict/d')
STRIP_VECTOR_EXT=(cat)
if [[ "${DEPLOY_STRIP_VECTOR_EXTENSION_DDL:-}" == "1" || "${DEPLOY_STRIP_VECTOR_EXTENSION_DDL:-}" == "yes" ]]; then
  # Match pg_dump variants (quoted or not). If DROP slips through but CREATE is stripped, restore hits
  # "extension vector does not exist" on COMMENT ON EXTENSION etc. — strip those too.
  STRIP_VECTOR_EXT=(sed -E \
    -e '/^DROP EXTENSION( IF EXISTS)?[[:space:]]+vector\b/d' \
    -e '/^DROP EXTENSION( IF EXISTS)?[[:space:]]+"vector"/d' \
    -e '/^CREATE EXTENSION( IF NOT EXISTS)?[[:space:]]+vector\b/d' \
    -e '/^CREATE EXTENSION( IF NOT EXISTS)?[[:space:]]+"vector"/d' \
    -e '/^COMMENT ON EXTENSION[[:space:]]+vector\b/d' \
    -e '/^COMMENT ON EXTENSION[[:space:]]+"vector"/d' \
    -e '/^ALTER EXTENSION[[:space:]]+vector\b/d' \
    -e '/^ALTER EXTENSION[[:space:]]+"vector"/d')
  echo "    (DEPLOY_STRIP_VECTOR_EXTENSION_DDL=yes: omitting vector extension DDL/COMMENT/ALTER lines from dump — server DB must already have vector.)"
fi

if [[ -n "${DATABASE_URL:-}" ]]; then
  pg_dump --no-owner --no-acl --clean --if-exists -F p "$DATABASE_URL" | "${STRIP_PSQL_RESTRICT[@]}" | "${STRIP_VECTOR_EXT[@]}" | gzip -1 >"$DUMP_LOCAL"
else
  : "${DB_USER:?Set DB_USER in api/.env}"
  : "${DB_PASSWORD:?Set DB_PASSWORD in api/.env}"
  : "${DB_NAME:?Set DB_NAME in api/.env}"
  export PGPASSWORD="$DB_PASSWORD"
  pg_dump -h "${DB_HOST:-127.0.0.1}" -p "${DB_PORT:-5432}" -U "$DB_USER" -d "$DB_NAME" \
    --no-owner --no-acl --clean --if-exists -F p | "${STRIP_PSQL_RESTRICT[@]}" | "${STRIP_VECTOR_EXT[@]}" | gzip -1 >"$DUMP_LOCAL"
  unset PGPASSWORD
fi

echo "    Dump size: $(du -h "$DUMP_LOCAL" | cut -f1)"

DUMP_HAS_VECTOR=0
if command -v zgrep >/dev/null 2>&1 && zgrep -qE '^CREATE EXTENSION( IF NOT EXISTS)?[[:space:]]+vector\b' "$DUMP_LOCAL" 2>/dev/null; then
  DUMP_HAS_VECTOR=1
  echo ""
  echo ">>> pgvector: dump includes CREATE EXTENSION vector — remote Postgres must have pgvector installed."
  echo "    (Errors mentioning .../vector.control under /usr/local/share/postgresql/ = official postgres Docker image without pgvector.)"
  echo "    Fix: point server api/.env DB_HOST/DB_PORT at native Postgres with postgresql-<major>-pgvector, or use image pgvector/pgvector:pg16 (match server major)."
  echo "    Then: CREATE EXTENSION IF NOT EXISTS vector;  (once per database, as superuser if needed.)"
  echo ""
fi

if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "==> Dry run: not uploading or restoring on server."
  exit 0
fi

echo "==> Uploading dump to ${REMOTE}:/tmp/"
scp "${SSH_OPTS[@]}" "$DUMP_LOCAL" "${REMOTE}:/tmp/$(basename "$DUMP_LOCAL")"

REMOTE_DUMP="/tmp/$(basename "$DUMP_LOCAL")"

echo "==> Restoring on server (stopping API, psql restore, starting API)"
# Quoted heredoc: only env DEPLOY_* / REMOTE_DUMP injected from this machine; server DB_* from api/.env.
if [[ -n "$DEPLOY_RESTORE_DOCKER_CONTAINER" ]]; then
  echo "    (Remote restore will use docker exec into: ${DEPLOY_RESTORE_DOCKER_CONTAINER})"
fi

# Unquoted heredoc: $(declare -f) expands here; use \$VAR so remote bash expands DB_* / paths from env.
ssh "${SSH_OPTS[@]}" "$REMOTE" \
  env DEPLOY_PATH="$DEPLOY_PATH" REMOTE_DUMP="$REMOTE_DUMP" \
      DUMP_HAS_VECTOR="${DUMP_HAS_VECTOR:-0}" \
      DEPLOY_RESTORE_DOCKER_CONTAINER="${DEPLOY_RESTORE_DOCKER_CONTAINER}" \
      DEPLOY_RESTORE_SUDO_POSTGRES="${DEPLOY_RESTORE_SUDO_POSTGRES:-}" \
      DEPLOY_PSQL_PATH="${DEPLOY_PSQL_PATH}" \
      DEPLOY_PSQL_DOCKER_IMAGE="${DEPLOY_PSQL_DOCKER_IMAGE}" \
  bash -s <<REMOTE_SCRIPT
$(declare -f load_env_file_allowlist)
set -euo pipefail
cd "\$DEPLOY_PATH"
if [[ ! -f api/.env ]]; then
  echo "Missing \${DEPLOY_PATH}/api/.env on server" >&2
  exit 1
fi
load_env_file_allowlist api/.env "DATABASE_URL DB_HOST DB_PORT DB_USER DB_PASSWORD DB_NAME"

PSQL_BIN=""
if [[ -n "\${DEPLOY_PSQL_PATH:-}" && -x "\${DEPLOY_PSQL_PATH}" ]]; then
  PSQL_BIN="\${DEPLOY_PSQL_PATH}"
fi
if [[ -z "\$PSQL_BIN" ]]; then
  for candidate in /usr/bin/psql /usr/local/bin/psql /usr/lib/postgresql/18/bin/psql /usr/lib/postgresql/17/bin/psql /usr/lib/postgresql/16/bin/psql /usr/lib/postgresql/15/bin/psql /usr/lib/postgresql/14/bin/psql; do
    if [[ -x "\$candidate" ]]; then PSQL_BIN="\$candidate"; break; fi
  done
fi
if [[ -z "\$PSQL_BIN" ]] && command -v psql >/dev/null 2>&1; then
  PSQL_BIN="psql"
fi
PSQL_DOCKER_MODE=0
if [[ -z "\${DEPLOY_RESTORE_DOCKER_CONTAINER:-}" && -z "\$PSQL_BIN" ]]; then
  if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
    PSQL_DOCKER_MODE=1
    echo "    No host psql; using ephemeral client: docker run --rm -i --network host \${DEPLOY_PSQL_DOCKER_IMAGE:-postgres:16-alpine} psql ..." >&2
  else
    echo "psql not found on server and Docker is not usable for a fallback client." >&2
    echo "Fix one of:" >&2
    echo "  1) Install postgresql-client (if apt works), or fix apt for your Ubuntu release (interim EOL → upgrade LTS or use old-releases)." >&2
    echo "  2) export DEPLOY_PSQL_PATH=/full/path/to/psql" >&2
    echo "  3) export DEPLOY_RESTORE_DOCKER_CONTAINER=<postgres_container_id>" >&2
    echo "  4) Ensure your user can run docker without sudo (usermod -aG docker \$USER; re-login)" >&2
    exit 1
  fi
fi

DB_HOST_USE="\${DB_HOST:-127.0.0.1}"
if [[ "\$DB_HOST_USE" == "host.docker.internal" ]]; then
  DB_HOST_USE="127.0.0.1"
fi
DB_PORT_USE="\${DB_PORT:-5432}"
DB_USER_USE="\${DB_USER:?DB_USER missing in server api/.env}"
DB_NAME_USE="\${DB_NAME:?DB_NAME missing in server api/.env}"
DB_PASS_USE="\${DB_PASSWORD:?DB_PASSWORD missing in server api/.env}"

export PGPASSWORD="\$DB_PASS_USE"

if [[ "\${DUMP_HAS_VECTOR:-0}" == "1" ]]; then
  echo "    Preflight: dump needs extension vector — checking pg_available_extensions on restore target..."
  echo "    (This uses ONLY \${DEPLOY_PATH}/api/.env on the server — not your laptop. Target: \${DB_HOST_USE}:\${DB_PORT_USE} user=\${DB_USER_USE} db=\${DB_NAME_USE})"
  VEC_SQL="SELECT 1 FROM pg_available_extensions WHERE name = 'vector' LIMIT 1;"
  vec_ok=0
  if [[ -n "\${DEPLOY_RESTORE_DOCKER_CONTAINER:-}" ]]; then
    if docker exec -e PGPASSWORD="\$DB_PASS_USE" "\$DEPLOY_RESTORE_DOCKER_CONTAINER" psql -U "\$DB_USER_USE" -d postgres -v ON_ERROR_STOP=1 -qtAc "\$VEC_SQL" 2>/dev/null | grep -qx 1; then vec_ok=1; fi
  elif [[ "\${PSQL_DOCKER_MODE:-0}" == "1" ]]; then
    if docker run --rm --network host -e PGPASSWORD="\$DB_PASS_USE" "\${DEPLOY_PSQL_DOCKER_IMAGE:-postgres:16-alpine}" psql -h "\$DB_HOST_USE" -p "\$DB_PORT_USE" -U "\$DB_USER_USE" -d postgres -v ON_ERROR_STOP=1 -qtAc "\$VEC_SQL" 2>/dev/null | grep -qx 1; then vec_ok=1; fi
  else
    if "\$PSQL_BIN" -h "\$DB_HOST_USE" -p "\$DB_PORT_USE" -U "\$DB_USER_USE" -d postgres -v ON_ERROR_STOP=1 -qtAc "\$VEC_SQL" 2>/dev/null | grep -qx 1; then vec_ok=1; fi
  fi
  if [[ "\$vec_ok" != "1" ]]; then
    echo "" >&2
    echo "ERROR: This dump creates extension \"vector\", but the Postgres you are restoring into does not offer pgvector." >&2
    echo "  Native Postgres on the host can still be fine — the script follows server api/.env. You asked for: \${DB_HOST_USE}:\${DB_PORT_USE}." >&2
    echo "  (vector.control missing — often /usr/local/share/postgresql/extension/ = vanilla postgres Docker image.)" >&2
    echo "  Options:" >&2
    echo "    A) Server api/.env: set DB_HOST=127.0.0.1 and DB_PORT to native PostgreSQL where postgresql-<major>-pgvector is installed (not a vanilla postgres container)." >&2
    echo "    B) If you must use Postgres in Docker: switch that container's image to pgvector/pgvector:pg16 (or matching major), recreate volume if needed." >&2
    echo "    C) Ensure only one Postgres listens on that port — you may be hitting a container without pgvector while apt Postgres has it." >&2
    echo "" >&2
    exit 1
  fi
  echo "    pgvector is available on the restore target."
fi

echo "    Stopping API container (releases DB connections)..."
docker compose -f docker-compose.server.yml stop api 2>/dev/null || true
sleep 2

echo "    Terminating other sessions on \${DB_NAME_USE} (best effort)..."
if [[ -n "\${DEPLOY_RESTORE_DOCKER_CONTAINER:-}" ]]; then
  docker exec -e PGPASSWORD="\$DB_PASS_USE" "\$DEPLOY_RESTORE_DOCKER_CONTAINER" psql -U "\$DB_USER_USE" -d postgres -v ON_ERROR_STOP=0 -qtAc "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '\${DB_NAME_USE}' AND pid <> pg_backend_pid();" >/dev/null 2>&1 || true
elif [[ "\${PSQL_DOCKER_MODE:-0}" == "1" ]]; then
  docker run --rm --network host -e PGPASSWORD="\$DB_PASS_USE" "\${DEPLOY_PSQL_DOCKER_IMAGE:-postgres:16-alpine}" psql -h "\$DB_HOST_USE" -p "\$DB_PORT_USE" -U "\$DB_USER_USE" -d postgres -v ON_ERROR_STOP=0 -qtAc "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '\${DB_NAME_USE}' AND pid <> pg_backend_pid();" >/dev/null 2>&1 || true
else
  "\$PSQL_BIN" -h "\$DB_HOST_USE" -p "\$DB_PORT_USE" -U "\$DB_USER_USE" -d postgres -v ON_ERROR_STOP=0 -qtAc "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '\${DB_NAME_USE}' AND pid <> pg_backend_pid();" >/dev/null 2>&1 || true
fi

echo "    Restoring (this may take several minutes)..."
if [[ -n "\${DEPLOY_RESTORE_DOCKER_CONTAINER:-}" ]]; then
  gunzip -c "\$REMOTE_DUMP" | sed '/^\\restrict/d;/^\\unrestrict/d' | docker exec -i -e PGPASSWORD="\$DB_PASS_USE" "\$DEPLOY_RESTORE_DOCKER_CONTAINER" psql -U "\$DB_USER_USE" -d "\$DB_NAME_USE" -v ON_ERROR_STOP=1
elif [[ "\${PSQL_DOCKER_MODE:-0}" == "1" ]]; then
  gunzip -c "\$REMOTE_DUMP" | sed '/^\\restrict/d;/^\\unrestrict/d' | docker run --rm -i --network host -e PGPASSWORD="\$DB_PASS_USE" "\${DEPLOY_PSQL_DOCKER_IMAGE:-postgres:16-alpine}" psql -h "\$DB_HOST_USE" -p "\$DB_PORT_USE" -U "\$DB_USER_USE" -d "\$DB_NAME_USE" -v ON_ERROR_STOP=1
elif [[ "\${DEPLOY_RESTORE_SUDO_POSTGRES:-}" == "1" || "\${DEPLOY_RESTORE_SUDO_POSTGRES:-}" == "yes" ]]; then
  echo "    Using sudo -n -u postgres for restore (DEPLOY_RESTORE_SUDO_POSTGRES=yes; host socket, port \${DB_PORT_USE})" >&2
  if ! sudo -n -u postgres /bin/true 2>/dev/null; then
    echo "" >&2
    echo "ERROR: DEPLOY_RESTORE_SUDO_POSTGRES=yes needs passwordless sudo over SSH (no TTY for a prompt)." >&2
    echo "  On the server, as root: visudo" >&2
    echo "  Add a line (replace kunye with your deploy user, adjust psql path from: \${PSQL_BIN}):" >&2
    echo "    deployuser ALL=(postgres) NOPASSWD: /usr/bin/psql, /usr/lib/postgresql/16/bin/psql" >&2
    echo "  Or skip sudo restore: unset DEPLOY_RESTORE_SUDO_POSTGRES and run once on server:" >&2
    echo "    sudo -u postgres psql -p \${DB_PORT_USE} -d \${DB_NAME_USE} -c \"UPDATE pg_extension SET extowner = (SELECT oid FROM pg_roles WHERE rolname = '\$DB_USER_USE') WHERE extname = 'vector';\"" >&2
    echo "" >&2
    exit 1
  fi
  gunzip -c "\$REMOTE_DUMP" | sed '/^\\restrict/d;/^\\unrestrict/d' | sudo -n -u postgres "\$PSQL_BIN" -p "\$DB_PORT_USE" -d "\$DB_NAME_USE" -v ON_ERROR_STOP=1
  echo "    Reassigning objects owned by postgres to \${DB_USER_USE}..." >&2
  sudo -n -u postgres "\$PSQL_BIN" -p "\$DB_PORT_USE" -d "\$DB_NAME_USE" -v ON_ERROR_STOP=1 -c "REASSIGN OWNED BY postgres TO \"\$DB_USER_USE\";"
  sudo -n -u postgres "\$PSQL_BIN" -p "\$DB_PORT_USE" -d "\$DB_NAME_USE" -v ON_ERROR_STOP=0 -c "UPDATE pg_extension SET extowner = (SELECT oid FROM pg_roles WHERE rolname = '\$DB_USER_USE') WHERE extname = 'vector';" 2>/dev/null || true
else
  gunzip -c "\$REMOTE_DUMP" | sed '/^\\restrict/d;/^\\unrestrict/d' | "\$PSQL_BIN" -h "\$DB_HOST_USE" -p "\$DB_PORT_USE" -U "\$DB_USER_USE" -d "\$DB_NAME_USE" -v ON_ERROR_STOP=1
fi

unset PGPASSWORD

echo "    Starting API container..."
docker compose -f docker-compose.server.yml up -d api

rm -f "\$REMOTE_DUMP"
echo "    Remote restore finished."
REMOTE_SCRIPT

echo "==> Done. Local dump kept at: ${DUMP_LOCAL}"
echo "    Verify app + DB on server; keep DEPLOY_SYNC_DB_CONFIRM unset for normal deploys."
