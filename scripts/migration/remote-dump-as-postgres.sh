#!/usr/bin/env bash
#
# Run this ON THE REMOTE SERVER to create a PostgreSQL dump as the postgres OS user.
# Output file is written to /tmp, then you can copy it to your machine with scp.
#
# Usage on remote:
#   chmod +x scripts/migration/remote-dump-as-postgres.sh
#   ./scripts/migration/remote-dump-as-postgres.sh
#   ./scripts/migration/remote-dump-as-postgres.sh --org-only
#   ./scripts/migration/remote-dump-as-postgres.sh --db government_projects
#
# Then copy from local machine:
#   scp -i ~/.ssh/id_gprs_server fortress@102.210.149.119:/tmp/<filename>.sql .
#
set -euo pipefail

DB_NAME="government_projects"
ORG_ONLY=0
OUT_FILE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --db)
      DB_NAME="${2:-}"
      shift 2
      ;;
    --org-only)
      ORG_ONLY=1
      shift
      ;;
    --out)
      OUT_FILE="${2:-}"
      shift 2
      ;;
    --help|-h)
      sed -n '1,35p' "$0"
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

if [[ -z "$DB_NAME" ]]; then
  echo "DB name is required. Use --db <name>." >&2
  exit 1
fi

STAMP="$(date +%Y%m%d-%H%M%S)"
if [[ -z "$OUT_FILE" ]]; then
  if [[ "$ORG_ONLY" -eq 1 ]]; then
    OUT_FILE="/tmp/${DB_NAME}-org-scope-${STAMP}.sql"
  else
    OUT_FILE="/tmp/${DB_NAME}-full-${STAMP}.sql"
  fi
fi

echo "Creating dump as postgres user..."
if [[ "$ORG_ONLY" -eq 1 ]]; then
  sudo -u postgres pg_dump -d "$DB_NAME" -F p --no-owner --no-acl \
    -t public.users \
    -t public.user_organization_scope \
    -t public.agencies \
    -t public.roles \
    -t public.privileges \
    -t public.role_privileges \
    -f "$OUT_FILE"
else
  sudo -u postgres pg_dump -d "$DB_NAME" -F p --no-owner --no-acl -f "$OUT_FILE"
fi

chmod 644 "$OUT_FILE"

echo ""
echo "Dump created:"
echo "  $OUT_FILE"
echo ""
echo "Copy to your local machine (run on LOCAL terminal):"
echo "  scp -i ~/.ssh/id_gprs_server fortress@102.210.149.119:$OUT_FILE ."
echo ""
