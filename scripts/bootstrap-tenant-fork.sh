#!/usr/bin/env bash
#
# Reset or create a tenant fork from the upstream Machakos codebase.
# Preserves tenant-specific env, config, assets, and sample migrations.
#
# Usage:
#   ./scripts/bootstrap-tenant-fork.sh moald /home/dev/dev/moald
#   UPSTREAM=/path/to/machakos ./scripts/bootstrap-tenant-fork.sh kisumu /home/dev/dev/kisumu
#
# Optional:
#   INIT_GIT=1          — init git repo and add upstream remote
#   UPSTREAM_REMOTE=git@github.com:kwatuha/mcde.git
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TENANT="${1:-}"
TARGET="${2:-}"
UPSTREAM="${UPSTREAM:-$ROOT}"
INIT_GIT="${INIT_GIT:-0}"
UPSTREAM_REMOTE="${UPSTREAM_REMOTE:-git@github.com:kwatuha/mcde.git}"

if [[ -z "$TENANT" || -z "$TARGET" ]]; then
  echo "Usage: $0 <tenant-code> <target-directory>"
  echo "Example: $0 moald /home/dev/dev/moald"
  exit 1
fi

TENANT_LOWER="$(echo "$TENANT" | tr '[:upper:]' '[:lower:]')"
BACKUP=""
if [[ -d "$TARGET" ]]; then
  BACKUP="$(mktemp -d)"
  echo "==> Backing up tenant overlay from $TARGET"
  for path in \
    "api/.env" \
    "deploy/.env.deploy" \
    "deploy/.env.deploy.production" \
    "config/counties/${TENANT_LOWER}.json" \
    "assets/tenants/${TENANT_LOWER}" \
    "tenants/${TENANT_LOWER}" \
    "MOALD_DEPLOY.md" \
    "deploy/deploy-${TENANT_LOWER}.sh" \
    "deploy/setup-${TENANT_LOWER}db-on-server.sh" \
    "deploy/snippets/nginx-${TENANT_LOWER}.example.conf" \
    "scripts/apply-${TENANT_LOWER}-sample-data.sh"
  do
    if [[ -e "$TARGET/$path" ]]; then
      mkdir -p "$BACKUP/$(dirname "$path")"
      cp -a "$TARGET/$path" "$BACKUP/$path"
    fi
  done
  shopt -s nullglob
  for f in "$TARGET"/api/migrations/*_"${TENANT_LOWER}"_*.sql; do
    mkdir -p "$BACKUP/api/migrations"
    cp -a "$f" "$BACKUP/api/migrations/"
  done
  shopt -u nullglob
fi

mkdir -p "$TARGET"
echo "==> Syncing upstream ($UPSTREAM) → $TARGET"
rsync -a --delete \
  --exclude '.git' \
  --exclude '.cursor' \
  --exclude 'node_modules' \
  --exclude 'frontend/node_modules' \
  --exclude 'api/node_modules' \
  --exclude 'public-dashboard/node_modules' \
  --exclude 'mobile-collector/node_modules' \
  --exclude '**/dist' \
  --exclude '.pgdata' \
  --exclude 'uploads' \
  --exclude 'api/uploads' \
  --exclude 'db_backups' \
  --exclude '.env' \
  --exclude 'api/.env' \
  --exclude 'deploy/.env.deploy' \
  --exclude 'deploy/.env.deploy.production' \
  "$UPSTREAM/" "$TARGET/"

if [[ -n "$BACKUP" && -d "$BACKUP" ]]; then
  echo "==> Restoring tenant overlay"
  rsync -a "$BACKUP/" "$TARGET/"
  rm -rf "$BACKUP"
fi

if [[ ! -f "$TARGET/config/counties/${TENANT_LOWER}.json" ]]; then
  echo "==> Creating tenant config in $TARGET"
  TENANT_ROOT="$TARGET" "$ROOT/scripts/new-tenant.sh" "$TENANT_LOWER"
fi

if [[ "$INIT_GIT" == "1" ]]; then
  echo "==> Initializing git in $TARGET"
  cd "$TARGET"
  if [[ ! -d .git ]]; then
    git init
    git remote add upstream "$UPSTREAM_REMOTE" 2>/dev/null || git remote set-url upstream "$UPSTREAM_REMOTE"
    git add -A
    git commit -m "Bootstrap ${TENANT_LOWER} tenant fork from upstream"
    echo "Created initial commit. Add origin remote for your tenant repo if needed."
  fi
fi

echo ""
echo "Done. Tenant fork at: $TARGET"
echo "Set COUNTY_CODE=${TENANT_LOWER} in api/.env and add logo at assets/tenants/${TENANT_LOWER}/logo.png"
