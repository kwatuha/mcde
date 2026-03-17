#!/usr/bin/env bash
# Drops the 49 tables listed in clean_gov_database_v1.xlsx (Remove=Yes) from revised_gov_db.
# Tables are owned by postgres, so this must run as postgres.
# Run: sudo -u postgres bash run_drop_clean_tables.sh
# Or:  bash run_drop_clean_tables.sh   (if you have postgres password and pass it below)
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXCEL="${SCRIPT_DIR}/clean_gov_database_v1.xlsx"
# Use /tmp so postgres user can read it (no permission to read project dir)
SQL_FILE="/tmp/drop_clean_tables_revised_gov.sql"

if [[ ! -f "$EXCEL" ]]; then
  echo "Missing $EXCEL"
  exit 1
fi

# Generate DROP statements (requires node + xlsx from api)
echo "Generating DROP statements..."
(cd "${SCRIPT_DIR}/api" && node -e "
const XLSX = require('xlsx');
const path = require('path');
const data = XLSX.utils.sheet_to_json(
  XLSX.readFile(process.argv[1]).Sheets['Sheet1'],
  { header: 1 }
);
const tables = data.slice(1).filter(r => r[4] === 'Yes').map(r => r[2]);
const sql = tables.map(t => 'DROP TABLE IF EXISTS public.\"' + t + '\" CASCADE;').join('\n');
require('fs').writeFileSync(process.argv[2], sql);
console.log('Generated', tables.length, 'DROP statements');
" "$EXCEL" "$SQL_FILE")

echo "Dropping tables in revised_gov_db..."
sudo -u postgres psql -d revised_gov_db -v ON_ERROR_STOP=1 -f "$SQL_FILE"
rm -f "$SQL_FILE"
echo "Done. Remaining tables:"
sudo -u postgres psql -d revised_gov_db -t -c "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE';"
echo ""
echo "Table list:"
sudo -u postgres psql -d revised_gov_db -t -c "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name;"
