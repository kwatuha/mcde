#!/usr/bin/env bash
# Check active mobile app release on a server (run ON the server or via ssh).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "==> Mobile app release diagnostic"
echo "    Path: $ROOT"
echo ""

if docker ps --format '{{.Names}}' | grep -qx machakosme_node_api; then
  echo "--- API container (machakosme_node_api) ---"
  docker exec machakosme_node_api node -e "
const pool = require('./config/db');
(async () => {
  const r = await pool.query(
    \"SELECT id, version, file_size, original_file_name, created_at, voided
     FROM mobile_app_releases ORDER BY id DESC LIMIT 5\"
  );
  console.log(JSON.stringify(r.rows, null, 2));
  const cur = await pool.query(
    \"SELECT version, file_size FROM mobile_app_releases
     WHERE voided = FALSE ORDER BY created_at DESC, id DESC LIMIT 1\"
  );
  console.log('ACTIVE:', JSON.stringify(cur.rows[0] || null));
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
" || true
  echo ""
  echo "--- Uploads in container ---"
  docker exec machakosme_node_api ls -lh /app/uploads/mobile-app/ 2>/dev/null | tail -10 || true
else
  echo "WARNING: machakosme_node_api container is not running."
fi

echo ""
echo "--- Host api/uploads/mobile-app ---"
ls -lh api/uploads/mobile-app/ 2>/dev/null | tail -10 || echo "(empty or missing)"
