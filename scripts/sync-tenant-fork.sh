#!/usr/bin/env bash
#
# Pull latest upstream features into an existing tenant fork.
# Same preserve rules as bootstrap-tenant-fork.sh but without --delete on first pass
# for safety; uses rsync --delete after backup restore pattern.
#
# Usage (from tenant fork directory or with explicit paths):
#   ./scripts/sync-tenant-fork.sh moald /home/dev/dev/moald
#   UPSTREAM=/home/dev/dev/machakos ./scripts/sync-tenant-fork.sh kisumu /home/dev/dev/kisumu
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
exec "$ROOT/scripts/bootstrap-tenant-fork.sh" "$@"
