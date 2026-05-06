#!/usr/bin/env bash
# Generate a .sql file from your LOCAL PostgreSQL that you can run on REMOTE to seed Gantt data
# (project_milestones, activities, milestone_activities) for one project.
#
# Usage:
#   ./api/scripts/export_gantt_schedule_for_remote.sh "LOCAL_CONNECTION_STRING" SOURCE_PROJECT_ID [OUTPUT.sql] [TARGET_PROJECT_ID]
#
# TARGET_PROJECT_ID defaults to SOURCE_PROJECT_ID (same project id on remote after you created the project).
#
# Example:
#   ./api/scripts/export_gantt_schedule_for_remote.sh "host=127.0.0.1 port=5433 user=u dbname=localdb password=p" 1 ./gantt_import.sql
#   psql "REMOTE_CONNECTION_STRING" -v ON_ERROR_STOP=1 -f ./gantt_import.sql
#
set -euo pipefail

usage() {
  sed -n '1,20p' "$0" | tail -n +2
  exit "${1:-0}"
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" || $# -lt 2 ]]; then
  usage 1
fi

LOCAL_URL="$1"
SRC="$2"
OUT="${3:-gantt_schedule_import.sql}"
DST="${4:-$SRC}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEMPLATE="$SCRIPT_DIR/../migrations/gantt_export_inserts_postgresql.sql"

if [[ ! -f "$TEMPLATE" ]]; then
  echo "Missing template: $TEMPLATE" >&2
  exit 1
fi

sed \
  -e "s/__SOURCE_PROJECT_ID__/${SRC}/g" \
  -e "s/__TARGET_PROJECT_ID__/${DST}/g" \
  "$TEMPLATE" \
| psql "$LOCAL_URL" -v ON_ERROR_STOP=1 -q -t -A -o "$OUT"

echo "Wrote: $OUT" >&2
echo "Next:  psql REMOTE_URL -v ON_ERROR_STOP=1 -f $OUT" >&2
echo "Requires: remote has projects row with project_id=${DST}; no PK clashes on milestone_id / activityId / milestone_activities.id (fresh DB or clear those rows first)." >&2
