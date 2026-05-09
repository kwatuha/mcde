#!/usr/bin/env node
/**
 * Export roles, privileges, and role_privileges (no users) for diffing or applying on another DB.
 *
 * Does NOT export user rows — only RBAC tables used by user management.
 *
 * Usage (from repo root, after npm install in api/):
 *   ./scripts/export-roles-privileges.sh report
 *   ./scripts/export-roles-privileges.sh export-sql /tmp/rbac-from-local.sql
 *   ./scripts/export-roles-privileges.sh export-json /tmp/rbac-snapshot.json
 *
 * Apply on remote (PostgreSQL):
 *   PGPASSWORD=... psql -h REMOTE -U USER -d DB -v ON_ERROR_STOP=1 -f /tmp/rbac-from-local.sql
 *
 * Env: same as api (DATABASE_URL or DB_HOST, DB_USER, DB_PASSWORD, DB_NAME, DB_PORT).
 * DB_TYPE=postgresql | mysql (default: postgresql)
 *
 * For export-sql --dialect=mysql, generated statements match MySQL/MariaDB column names.
 */

const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', 'api', '.env') });

function requireApi(pkg) {
  try {
    return require(path.join(__dirname, '..', 'api', 'node_modules', pkg));
  } catch {
    return require(pkg);
  }
}

const { Pool } = requireApi('pg');

const DB_TYPE = (process.env.DB_TYPE || 'postgresql').toLowerCase();
const isPostgres = DB_TYPE === 'postgresql' || DB_TYPE === 'postgres';

function escapePgString(s) {
  if (s == null || s === undefined) return '';
  return String(s).replace(/'/g, "''");
}

function escapeMysqlString(s) {
  if (s == null || s === undefined) return '';
  return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function createPgPool() {
  if (process.env.DATABASE_URL) {
    return new Pool({ connectionString: process.env.DATABASE_URL });
  }
  return new Pool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: Number(process.env.DB_PORT || 5432),
  });
}

async function createMysqlPool() {
  const mysql = requireApi('mysql2/promise');
  return mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: Number(process.env.DB_PORT || 3306),
    waitForConnections: true,
    connectionLimit: 4,
  });
}

async function fetchSnapshotPg(pool) {
  const roles = (
    await pool.query(
      `SELECT roleid AS id, name, description, voided
       FROM roles
       ORDER BY LOWER(TRIM(name))`
    )
  ).rows;

  const privileges = (
    await pool.query(
      `SELECT privilegeid AS id, privilegename AS name, description, voided
       FROM privileges
       ORDER BY LOWER(TRIM(privilegename))`
    )
  ).rows;

  const pairs = (
    await pool.query(
      `SELECT LOWER(TRIM(r.name)) AS role_key,
              r.name AS role_name,
              LOWER(TRIM(p.privilegename)) AS privilege_key,
              p.privilegename AS privilege_name
       FROM role_privileges rp
       JOIN roles r ON r.roleid = rp.roleid
       JOIN privileges p ON p.privilegeid = rp.privilegeid
       WHERE COALESCE(rp.voided, false) = false
         AND COALESCE(r.voided, false) = false
         AND COALESCE(p.voided, false) = false
       ORDER BY LOWER(TRIM(r.name)), LOWER(TRIM(p.privilegename))`
    )
  ).rows;

  return { roles, privileges, pairs };
}

async function fetchSnapshotMysql(pool) {
  let roles;
  try {
    const [r] = await pool.query(
      `SELECT roleId AS id, roleName AS name, description, COALESCE(voided, 0) AS voided
       FROM roles
       ORDER BY LOWER(TRIM(roleName))`
    );
    roles = r;
  } catch {
    const [r] = await pool.query(
      `SELECT roleId AS id, roleName AS name, description, 0 AS voided
       FROM roles
       ORDER BY LOWER(TRIM(roleName))`
    );
    roles = r;
  }

  let privileges;
  try {
    const [p] = await pool.query(
      `SELECT privilegeId AS id, privilegeName AS name, description, COALESCE(voided, 0) AS voided
       FROM privileges
       ORDER BY LOWER(TRIM(privilegeName))`
    );
    privileges = p;
  } catch {
    const [p] = await pool.query(
      `SELECT privilegeId AS id, privilegeName AS name, description, 0 AS voided
       FROM privileges
       ORDER BY LOWER(TRIM(privilegeName))`
    );
    privileges = p;
  }

  let pairs;
  try {
    const [rows] = await pool.query(
      `SELECT LOWER(TRIM(r.roleName)) AS role_key,
              r.roleName AS role_name,
              LOWER(TRIM(p.privilegeName)) AS privilege_key,
              p.privilegeName AS privilege_name
       FROM role_privileges rp
       JOIN roles r ON r.roleId = rp.roleId
       JOIN privileges p ON p.privilegeId = rp.privilegeId
       WHERE COALESCE(rp.voided, 0) = 0
         AND COALESCE(r.voided, 0) = 0
         AND COALESCE(p.voided, 0) = 0
       ORDER BY LOWER(TRIM(r.roleName)), LOWER(TRIM(p.privilegeName))`
    );
    pairs = rows;
  } catch {
    const [rows] = await pool.query(
      `SELECT LOWER(TRIM(r.roleName)) AS role_key,
              r.roleName AS role_name,
              LOWER(TRIM(p.privilegeName)) AS privilege_key,
              p.privilegeName AS privilege_name
       FROM role_privileges rp
       JOIN roles r ON r.roleId = rp.roleId
       JOIN privileges p ON p.privilegeId = rp.privilegeId
       ORDER BY LOWER(TRIM(r.roleName)), LOWER(TRIM(p.privilegeName))`
    );
    pairs = rows;
  }

  return { roles, privileges, pairs };
}

function report(snapshot) {
  const activeRoles = snapshot.roles.filter((r) => !r.voided);
  const activePriv = snapshot.privileges.filter((p) => !p.voided);

  console.log('=== Roles (active) ===');
  for (const r of activeRoles) {
    console.log(`${r.id}\t${r.name}\t${(r.description || '').replace(/\s+/g, ' ').slice(0, 120)}`);
  }
  console.log(`\nTotal active roles: ${activeRoles.length}`);

  console.log('\n=== Privileges (active) ===');
  for (const p of activePriv) {
    console.log(`${p.id}\t${p.name}`);
  }
  console.log(`\nTotal active privileges: ${activePriv.length}`);

  console.log('\n=== Role -> privilege (active assignments) ===');
  for (const row of snapshot.pairs) {
    console.log(`${row.role_name}\t${row.privilege_name}`);
  }
  console.log(`\nTotal assignments: ${snapshot.pairs.length}`);
}

function exportJson(snapshot, outPath) {
  const payload = {
    exportedAt: new Date().toISOString(),
    dbType: isPostgres ? 'postgresql' : 'mysql',
    roles: snapshot.roles.filter((r) => !r.voided).map((r) => ({
      name: r.name,
      description: r.description,
    })),
    privileges: snapshot.privileges.filter((p) => !p.voided).map((p) => ({
      name: p.name,
      description: p.description,
    })),
    rolePrivileges: snapshot.pairs.map((row) => ({
      role: row.role_name,
      privilege: row.privilege_name,
    })),
  };
  fs.writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  console.error(`Wrote ${outPath}`);
}

function exportSqlPostgresql(snapshot) {
  const lines = [];
  lines.push('-- Sync roles / privileges / role_privileges from export (no users).');
  lines.push('-- Idempotent on PostgreSQL: inserts missing rows by name; revives voided role_privileges.');
  lines.push('BEGIN;');
  lines.push('');

  for (const r of snapshot.roles) {
    if (r.voided) continue;
    const n = escapePgString(r.name);
    const d = escapePgString(r.description || '');
    lines.push(`INSERT INTO roles (name, description, createdat, updatedat, voided)`);
    lines.push(`SELECT '${n}', NULLIF('${d}', '')::text, NOW(), NOW(), false`);
    lines.push(`WHERE NOT EXISTS (`);
    lines.push(`  SELECT 1 FROM roles x`);
    lines.push(`  WHERE COALESCE(x.voided, false) = false`);
    lines.push(`    AND LOWER(TRIM(x.name)) = LOWER(TRIM('${n}'))`);
    lines.push(`);`);
    lines.push('');
  }

  for (const p of snapshot.privileges) {
    if (p.voided) continue;
    const n = escapePgString(p.name);
    const d = escapePgString(p.description || '');
    lines.push(`INSERT INTO privileges (privilegename, description, createdat, updatedat, voided)`);
    lines.push(`SELECT '${n}', NULLIF('${d}', '')::text, NOW(), NOW(), false`);
    lines.push(`WHERE NOT EXISTS (`);
    lines.push(`  SELECT 1 FROM privileges x`);
    lines.push(`  WHERE COALESCE(x.voided, false) = false`);
    lines.push(`    AND LOWER(TRIM(x.privilegename)) = LOWER(TRIM('${n}'))`);
    lines.push(`);`);
    lines.push('');
  }

  for (const row of snapshot.pairs) {
    const rn = escapePgString(row.role_name);
    const pn = escapePgString(row.privilege_name);
    lines.push(`UPDATE role_privileges rp`);
    lines.push(`SET voided = false, updatedat = NOW()`);
    lines.push(`FROM roles r, privileges p`);
    lines.push(`WHERE rp.roleid = r.roleid AND rp.privilegeid = p.privilegeid`);
    lines.push(`  AND LOWER(TRIM(r.name)) = LOWER(TRIM('${rn}'))`);
    lines.push(`  AND LOWER(TRIM(p.privilegename)) = LOWER(TRIM('${pn}'))`);
    lines.push(`  AND COALESCE(r.voided, false) = false`);
    lines.push(`  AND COALESCE(p.voided, false) = false`);
    lines.push(`  AND COALESCE(rp.voided, false) = true;`);
    lines.push('');
    lines.push(`INSERT INTO role_privileges (roleid, privilegeid, createdat, updatedat, voided)`);
    lines.push(`SELECT r.roleid, p.privilegeid, NOW(), NOW(), false`);
    lines.push(`FROM roles r`);
    lines.push(
      `JOIN privileges p ON LOWER(TRIM(p.privilegename)) = LOWER(TRIM('${pn}')) AND COALESCE(p.voided, false) = false`
    );
    lines.push(`WHERE LOWER(TRIM(r.name)) = LOWER(TRIM('${rn}'))`);
    lines.push(`  AND COALESCE(r.voided, false) = false`);
    lines.push(`  AND NOT EXISTS (`);
    lines.push(`    SELECT 1 FROM role_privileges rp2`);
    lines.push(`    WHERE rp2.roleid = r.roleid AND rp2.privilegeid = p.privilegeid`);
    lines.push(`      AND COALESCE(rp2.voided, false) = false`);
    lines.push(`  );`);
    lines.push('');
  }

  lines.push('COMMIT;');
  return lines.join('\n');
}

function exportSqlMysql(snapshot) {
  const lines = [];
  lines.push('-- Sync roles / privileges / role_privileges from export (no users).');
  lines.push('-- Idempotent on MySQL/MariaDB.');
  lines.push('START TRANSACTION;');
  lines.push('');

  for (const r of snapshot.roles) {
    if (r.voided) continue;
    const n = escapeMysqlString(r.name);
    const d = escapeMysqlString(r.description || '');
    lines.push(`INSERT INTO roles (roleName, description, createdAt, updatedAt)`);
    lines.push(`SELECT '${n}', NULLIF('${d}', ''), NOW(), NOW()`);
    lines.push(`WHERE NOT EXISTS (`);
    lines.push(`  SELECT 1 FROM roles x WHERE LOWER(TRIM(x.roleName)) = LOWER(TRIM('${n}'))`);
    lines.push(`);`);
    lines.push('');
  }

  for (const p of snapshot.privileges) {
    if (p.voided) continue;
    const n = escapeMysqlString(p.name);
    const d = escapeMysqlString(p.description || '');
    lines.push(`INSERT INTO privileges (privilegeName, description, createdAt, updatedAt)`);
    lines.push(`SELECT '${n}', NULLIF('${d}', ''), NOW(), NOW()`);
    lines.push(`WHERE NOT EXISTS (`);
    lines.push(`  SELECT 1 FROM privileges x WHERE LOWER(TRIM(x.privilegeName)) = LOWER(TRIM('${n}'))`);
    lines.push(`);`);
    lines.push('');
  }

  for (const row of snapshot.pairs) {
    const rn = escapeMysqlString(row.role_name);
    const pn = escapeMysqlString(row.privilege_name);
    lines.push(
      `INSERT INTO role_privileges (roleId, privilegeId, createdAt)\n` +
        `SELECT r.roleId, p.privilegeId, NOW()\n` +
        `FROM roles r\n` +
        `JOIN privileges p ON LOWER(TRIM(p.privilegeName)) = LOWER(TRIM('${pn}'))\n` +
        `WHERE LOWER(TRIM(r.roleName)) = LOWER(TRIM('${rn}'))\n` +
        `  AND NOT EXISTS (\n` +
        `    SELECT 1 FROM role_privileges rp2\n` +
        `    WHERE rp2.roleId = r.roleId AND rp2.privilegeId = p.privilegeId\n` +
        `  );`
    );
    lines.push('');
  }

  lines.push('COMMIT;');
  return lines.join('\n');
}

function parseArgs(argv) {
  const out = { cmd: null, path: null, dialect: null };
  const rest = [];
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a.startsWith('--dialect=')) {
      out.dialect = a.slice('--dialect='.length).toLowerCase();
    } else if (!out.cmd) {
      out.cmd = a;
    } else if (!out.path) {
      out.path = a;
    } else {
      rest.push(a);
    }
  }
  return out;
}

async function main() {
  const { cmd, path: outPath, dialect } = parseArgs(process.argv);
  if (!cmd || ['help', '-h', '--help'].includes(cmd)) {
    console.log(`Usage:
  node scripts/export-roles-privileges.js report
  node scripts/export-roles-privileges.js export-sql <file.sql> [--dialect=postgresql|mysql]
  node scripts/export-roles-privileges.js export-json <file.json>

Environment: DATABASE_URL or DB_HOST, DB_USER, DB_PASSWORD, DB_NAME, DB_PORT
DB_TYPE=postgresql (default) or mysql

export-sql --dialect defaults to DB_TYPE. Use --dialect=mysql when source is PG but target is MySQL (rare).`);
    process.exit(cmd ? 0 : 1);
  }

  let pool;
  let snapshot;

  if (isPostgres) {
    pool = createPgPool();
    try {
      snapshot = await fetchSnapshotPg(pool);
    } finally {
      await pool.end();
    }
  } else {
    pool = await createMysqlPool();
    try {
      snapshot = await fetchSnapshotMysql(pool);
    } finally {
      await pool.end();
    }
  }

  if (cmd === 'report') {
    report(snapshot);
    return;
  }

  const sqlDialect =
    dialect || (isPostgres ? 'postgresql' : 'mysql');

  if (cmd === 'export-json') {
    if (!outPath) {
      console.error('export-json requires output path');
      process.exit(1);
    }
    exportJson(snapshot, outPath);
    return;
  }

  if (cmd === 'export-sql') {
    if (!outPath) {
      console.error('export-sql requires output path');
      process.exit(1);
    }
    const body =
      sqlDialect === 'mysql' ? exportSqlMysql(snapshot) : exportSqlPostgresql(snapshot);
    fs.writeFileSync(outPath, `${body}\n`, 'utf8');
    console.error(`Wrote ${outPath} (${sqlDialect})`);
    return;
  }

  console.error(`Unknown command: ${cmd}`);
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
