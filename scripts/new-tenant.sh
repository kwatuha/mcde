#!/usr/bin/env bash
#
# Scaffold a new tenant deployment from the template.
#
# Usage:
#   ./scripts/new-tenant.sh moald
#   ./scripts/new-tenant.sh kisumu
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TENANT_ROOT="${TENANT_ROOT:-$ROOT}"
CODE="${1:-}"

if [[ -z "$CODE" ]]; then
  echo "Usage: $0 <tenant-code>"
  echo "Example: $0 kisumu"
  echo "Optional: TENANT_ROOT=/path/to/fork $0 kisumu"
  exit 1
fi

CODE_LOWER="$(echo "$CODE" | tr '[:upper:]' '[:lower:]')"
CONFIG="$TENANT_ROOT/config/counties/${CODE_LOWER}.json"
ASSETS="$TENANT_ROOT/assets/tenants/${CODE_LOWER}"
ENV_SNIPPET="$TENANT_ROOT/tenants/${CODE_LOWER}/.env.example"
TEMPLATE="$ROOT/config/counties/_template.json"

if [[ -f "$CONFIG" ]]; then
  echo "Config already exists: $CONFIG"
else
  cp "$TEMPLATE" "$CONFIG"
  sed -i "s/\"code\": \"TENANT\"/\"code\": \"${CODE^^}\"/" "$CONFIG"
  sed -i "s/\"name\": \"Tenant Name\"/\"name\": \"${CODE^^}\"/" "$CONFIG"
  sed -i "s/tenant_db/${CODE_LOWER}db/g" "$CONFIG"
  sed -i "s/tenant_/${CODE_LOWER}_/g" "$CONFIG"
  sed -i "s/assets\\/tenants\\/tenant/assets\\/tenants\\/${CODE_LOWER}/g" "$CONFIG"
  echo "Created $CONFIG"
fi

mkdir -p "$ASSETS"
if [[ ! -f "$ASSETS/logo.png" ]]; then
  echo "Add logo at: $ASSETS/logo.png"
fi

mkdir -p "$(dirname "$ENV_SNIPPET")"
cat > "$ENV_SNIPPET" <<EOF
# Tenant: ${CODE_LOWER}
# Copy relevant lines into api/.env on this fork/server.

COUNTY_CODE=${CODE_LOWER}
DB_NAME=${CODE_LOWER}db

# Optional overrides (usually set in config/counties/${CODE_LOWER}.json instead):
# CERT_COUNTY_NAME=
# COUNTY_LOGO_PATH=assets/tenants/${CODE_LOWER}/logo.png
EOF
echo "Created $ENV_SNIPPET"

echo ""
echo "Next steps:"
echo "  1. Edit $CONFIG (organization, branding, labels, docker ports)"
echo "  2. Add logo: $ASSETS/logo.png"
echo "  3. Set COUNTY_CODE=${CODE_LOWER} in api/.env"
echo "  4. Create DB and run migrations"
echo "  5. Deploy"
