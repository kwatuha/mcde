#!/usr/bin/env node
/**
 * Export list of tables from the configured database to an Excel file.
 * Uses api/.env by default. Use .envGov (revised_gov_db) by running with USE_ENVGOV=1 or --gov.
 *
 * Usage:
 *   node api/scripts/export_database_tables.js           # uses api/.env (government_projects)
 *   node api/scripts/export_database_tables.js --gov     # uses .envGov (revised_gov_db)
 *   USE_ENVGOV=1 node api/scripts/export_database_tables.js
 */

const path = require('path');
const fs = require('fs');
const { Pool } = require('pg');
const XLSX = require('xlsx');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const API_ENV = path.join(PROJECT_ROOT, 'api', '.env');
const ENVGOV = path.join(PROJECT_ROOT, '.envGov');

const useGov = process.argv.includes('--gov') || process.env.USE_ENVGOV === '1';
const envPath = useGov ? ENVGOV : API_ENV;

if (!fs.existsSync(envPath)) {
  console.error('Env file not found:', envPath);
  process.exit(1);
}

// Load env manually (dotenv loads .env from cwd; we need a specific file)
const envContent = fs.readFileSync(envPath, 'utf8');
envContent.split('\n').forEach((line) => {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
  if (m) {
    const key = m[1];
    let val = m[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'")))
      val = val.slice(1, -1);
    process.env[key] = val;
  }
});

const pool = new Pool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

const TABLE_LIST_SQL = `
  SELECT
    table_schema AS "Schema",
    table_name   AS "Table Name",
    table_type   AS "Type"
  FROM information_schema.tables
  WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
  ORDER BY table_schema, table_name;
`;

async function main() {
  const dbName = process.env.DB_NAME || 'unknown';
  console.log('Database:', dbName, useGov ? '(from .envGov)' : '(from api/.env)');

  const client = await pool.connect();
  try {
    const res = await client.query(TABLE_LIST_SQL);
    const rows = res.rows;

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Tables');

    const outName = useGov ? 'database_tables_revised_gov_db.xlsx' : 'database_tables_government_projects.xlsx';
    const outPath = path.join(PROJECT_ROOT, outName);
    XLSX.writeFile(wb, outPath);

    console.log('Written', rows.length, 'tables to', outPath);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err.message || err);
  if (useGov && (err.code === '3D000' || err.message?.includes('does not exist') || err.message?.includes('connection'))) {
    console.error('\nrevised_gov_db may not exist yet. Create it and the gov_local_user with:');
    console.error('  sudo -u postgres env POSTGRES_USER=postgres ./setup_revised_gov_db.sh');
    console.error('Or if you have the postgres password:');
    console.error('  POSTGRES_USER=postgres POSTGRES_PASSWORD=yourpass ./setup_revised_gov_db.sh');
  }
  process.exit(1);
});
