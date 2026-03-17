#!/usr/bin/env node
/**
 * Drops tables listed in clean_gov_database_v1.xlsx (Remove=Yes) from revised_gov_db.
 * Uses .envGov (or api/.env if DB_NAME=revised_gov_db).
 */

const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');
const { Pool } = require('pg');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const EXCEL_PATH = path.join(PROJECT_ROOT, 'clean_gov_database_v1.xlsx');

// Load .envGov if exists and we're targeting revised_gov_db; else api/.env
const envGov = path.join(PROJECT_ROOT, '.envGov');
const apiEnv = path.join(PROJECT_ROOT, 'api', '.env');
const envPath = fs.existsSync(envGov) ? envGov : apiEnv;
if (!fs.existsSync(envPath)) {
  console.error('No .envGov or api/.env found');
  process.exit(1);
}
const envContent = fs.readFileSync(envPath, 'utf8');
envContent.split('\n').forEach((line) => {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
  if (m) {
    let val = m[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    process.env[m[1]] = val;
  }
});

const pool = new Pool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

async function main() {
  const wb = XLSX.readFile(EXCEL_PATH);
  const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });
  const tables = data.slice(1).filter((r) => r[4] === 'Yes').map((r) => r[2]);
  if (tables.length === 0) {
    console.log('No tables with Remove=Yes');
    return;
  }

  const client = await pool.connect();
  try {
    console.log('Dropping', tables.length, 'tables from', process.env.DB_NAME, '...');
    for (const table of tables) {
      try {
        await client.query(`DROP TABLE IF EXISTS public."${table}" CASCADE`);
        console.log('  Dropped:', table);
      } catch (err) {
        console.error('  Error dropping', table, ':', err.message);
      }
    }
    console.log('Done.');
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
