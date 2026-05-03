#!/usr/bin/env node
/**
 * Creates public."project_documents" on PostgreSQL if it is missing.
 *
 * Loads api/.env first, then uses the same pool as api/config/db.js
 * (including optional DATABASE_URL).
 *
 * Usage:
 *   cd /home/dev/dev/machakos/api && node scripts/ensureProjectDocumentsTable.js
 */
const path = require('path');
const fs = require('fs');

// Load api/.env before db.js so credentials match the API regardless of shell cwd.
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const sqlPath = path.join(__dirname, '..', 'migrations', 'postgres_create_project_documents.sql');
const flagSqlPath = path.join(__dirname, '..', 'migrations', 'add_project_documents_is_flagged.sql');

function printAuthHelp(err) {
  if (err && err.code !== '28P01') return;
  const user = process.env.DB_USER || '(from DATABASE_URL)';
  console.error(`
PostgreSQL rejected the password (code 28P01).

Fix credentials used by the API — same as api/.env:

  • DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD
  or a single  DATABASE_URL  (postgresql://USER:PASSWORD@HOST:PORT/DBNAME)

Checklist:
  1. Password matches the Postgres role (reset in psql: ALTER ROLE "gov_local_user" PASSWORD '...';)
  2. No stray spaces/quotes in .env (use DB_PASSWORD=secret not DB_PASSWORD=" secret ")
  3. If the app connects successfully but this script failed, run from api/ so paths resolve:
     cd /home/dev/dev/machakos/api && node scripts/ensureProjectDocumentsTable.js

Test login (no password shown):
  PGPASSWORD='your-password' psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c 'SELECT 1'
`);
}

async function main() {
  const sql = fs.readFileSync(sqlPath, 'utf8');
  const pool = require('../config/db');
  try {
    await pool.query(sql);
    console.log('OK: project_documents table ensured (created if missing).');
    if (fs.existsSync(flagSqlPath)) {
      await pool.query(fs.readFileSync(flagSqlPath, 'utf8'));
      console.log('OK: project_documents isFlagged column ensured (if migration present).');
    }
  } catch (err) {
    printAuthHelp(err);
    throw err;
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
