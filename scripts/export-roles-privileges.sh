#!/usr/bin/env bash
# Export RBAC tables (roles, privileges, role_privileges) — never users.
# Requires Node and dependencies installed under api/ (npm install in api/).
#
# Usage:
#   chmod +x scripts/export-roles-privileges.sh
#   set -a && source api/.env && set +a   # optional; script loads api/.env itself
#   ./scripts/export-roles-privileges.sh report
#   ./scripts/export-roles-privileges.sh export-sql /tmp/rbac-local.sql
#   ./scripts/export-roles-privileges.sh export-json /tmp/rbac-local.json
#
# Apply generated SQL on remote PostgreSQL:
#   PGPASSWORD=... psql -h HOST -U USER -d DB -v ON_ERROR_STOP=1 -f /tmp/rbac-local.sql

set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export NODE_PATH="${ROOT}/api/node_modules${NODE_PATH:+:${NODE_PATH}}"
exec node "${ROOT}/scripts/export-roles-privileges.js" "$@"
