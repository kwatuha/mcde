#!/usr/bin/env bash
#
# Run July 2026 PostgreSQL migrations (Machakos).
# Safe to re-run: migrations use IF NOT EXISTS / ON CONFLICT / WHERE NOT EXISTS.
#
# Usage (from repo root):
#   chmod +x scripts/run-july-2026-migrations.sh
#   ./scripts/run-july-2026-migrations.sh
#
# Skip optional reference template seed:
#   SKIP_SEED_TEMPLATE=1 ./scripts/run-july-2026-migrations.sh
#
# One-liner equivalent (without this script):
#   set -a && source api/.env && set +a
#   export PGPASSWORD="$DB_PASSWORD"
#   for f in api/migrations/20260630_project_escalation_signals.sql ...; do
#     psql -h "$DB_HOST" -p "${DB_PORT:-5432}" -U "$DB_USER" -d "$DB_NAME" \
#       -v ON_ERROR_STOP=1 -f "$f"
#   done
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ ! -f api/.env ]]; then
  echo "ERROR: api/.env not found in $ROOT" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1091
source api/.env
set +a

export PGPASSWORD="${DB_PASSWORD:?DB_PASSWORD missing in api/.env}"

PSQL=(psql
  -h "${DB_HOST:-127.0.0.1}"
  -p "${DB_PORT:-5432}"
  -U "${DB_USER:-postgres}"
  -d "${DB_NAME:-government_projects}"
  -v ON_ERROR_STOP=1
  -P pager=off
)

MIGRATIONS=(
  api/migrations/20260627_mobile_app_releases.sql
  api/migrations/20260630_project_escalation_signals.sql
  api/migrations/20260630_pmc_menu_visibility.sql
  api/migrations/20260632_public_feedback_evaluation.sql
  api/migrations/20260702_data_collection_template_access.sql
  api/migrations/20260703_village_monitoring_workflow.sql
  api/migrations/20260704_contractor_portal.sql
  api/migrations/20260706_data_collection_subject_types.sql
)

if [[ "${SKIP_SEED_TEMPLATE:-0}" != "1" ]]; then
  MIGRATIONS+=(
    api/migrations/20260701_seed_reference_data_collection_template.sql
    api/migrations/20260705_update_reference_data_collection_template.sql
    api/migrations/20260707_update_reference_data_collection_template.sql
  )
fi

echo "Database: ${DB_USER}@${DB_HOST:-127.0.0.1}:${DB_PORT:-5432}/${DB_NAME}"
echo "Running ${#MIGRATIONS[@]} migration file(s)..."
echo ""

for f in "${MIGRATIONS[@]}"; do
  if [[ ! -f "$f" ]]; then
    echo "ERROR: missing file: $f" >&2
    exit 1
  fi
  echo "=== $f ==="
  "${PSQL[@]}" -f "$f"
  echo ""
done

echo "All migrations completed successfully."
echo "Restart the API if it is already running."
