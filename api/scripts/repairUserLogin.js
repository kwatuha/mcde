#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Diagnose and repair login for a user (password hash, must_change_password, OTP).
 *
 * Usage:
 *   node api/scripts/repairUserLogin.js --username=akwatuha
 *   node api/scripts/repairUserLogin.js --username=akwatuha --password='NewPass123' --apply
 *   node api/scripts/repairUserLogin.js --username=akwatuha --clear-policy --disable-otp --apply
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const pool = require('../config/db');
const { resolveDbType } = require('../config/db');
const { hashPassword, verifyPassword } = require('../utils/passwordVerification');
const { setMustChangePassword, getMustChangePassword } = require('../services/passwordPolicyService');
const { normalizeRoleForCompare } = require('../utils/roleUtils');
const orgScope = require('../services/organizationScopeService');

function parseArgs(argv) {
  const args = {
    username: '',
    password: '',
    apply: false,
    clearPolicy: false,
    disableOtp: false,
    help: false,
  };
  for (const arg of argv) {
    if (arg === '--apply') args.apply = true;
    else if (arg === '--clear-policy') args.clearPolicy = true;
    else if (arg === '--disable-otp') args.disableOtp = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else if (arg.startsWith('--username=')) args.username = arg.slice('--username='.length).trim();
    else if (arg.startsWith('--password=')) args.password = arg.slice('--password='.length);
  }
  return args;
}

function printHelp() {
  console.log(`
Diagnose / repair user login (PostgreSQL).

  node api/scripts/repairUserLogin.js --username=akwatuha
  node api/scripts/repairUserLogin.js --username=akwatuha --password='NewPass123' --apply
  node api/scripts/repairUserLogin.js --username=akwatuha --clear-policy --disable-otp --apply

Options:
  --username=NAME   Required. Case-insensitive username match.
  --password=TEXT   Set a new bcrypt password (requires --apply).
  --clear-policy    Clear must_change_password flag (requires --apply).
  --disable-otp     Turn off login OTP for this user (requires --apply).
  --apply           Write changes. Without this, dry-run diagnostics only.
`);
}

async function fetchUserDiagnostics(username) {
  const key = String(username || '').trim().toLowerCase();
  const userRes = await pool.query(
    `
    SELECT
      u.userid,
      u.username,
      u.email,
      u.voided,
      u.isactive,
      u.otp_enabled,
      u.otp_channel,
      u.roleid,
      r.name AS role_name,
      length(COALESCE(u.passwordhash, '')) AS passwordhash_len,
      left(COALESCE(u.passwordhash, ''), 7) AS passwordhash_prefix,
      (u.passwordhash ~ '^\\$2[aby]\\$') AS looks_like_bcrypt
    FROM users u
    LEFT JOIN roles r ON r.roleid = u.roleid
    WHERE lower(trim(u.username)) = $1
    ORDER BY u.voided ASC, u.userid ASC
    `,
    [key]
  );
  return userRes.rows || [];
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.username) {
    printHelp();
    process.exit(args.help ? 0 : 1);
  }

  if (resolveDbType() !== 'postgresql') {
    console.error('This script requires PostgreSQL (DB_TYPE=postgresql).');
    process.exit(1);
  }

  const rows = await fetchUserDiagnostics(args.username);
  if (!rows.length) {
    console.error(`No user found for username: ${args.username}`);
    process.exit(1);
  }

  console.log(`Found ${rows.length} row(s) for username "${args.username}":\n`);
  for (const row of rows) {
    console.log(JSON.stringify(row, null, 2));
  }

  const active = rows.filter((r) => r.voided !== true);
  if (active.length > 1) {
    console.warn('\nWARNING: Multiple non-voided accounts share this username. Login may be ambiguous.');
  }
  const user = active[0] || rows[0];
  const userId = user.userid;

  const mustChange = await getMustChangePassword(userId).catch(() => false);
  let orgScopes = [];
  let projectScopes = [];
  try {
    orgScopes = await orgScope.fetchOrganizationScopesForUser(userId);
    projectScopes = await orgScope.fetchProjectScopesForUser(userId);
  } catch (_) {
    /* ignore */
  }

  const privRes = await pool.query(
    `
    SELECT p.privilegename
    FROM role_privileges rp
    JOIN privileges p ON p.privilegeid = rp.privilegeid
    WHERE rp.roleid = $1 AND COALESCE(rp.voided, false) = false AND COALESCE(p.voided, false) = false
    ORDER BY p.privilegename
    `,
    [user.roleid]
  );
  const privileges = (privRes.rows || []).map((r) => r.privilegename);

  console.log('\n--- Login readiness ---');
  console.log('DB_TYPE (resolved):', resolveDbType());
  console.log('User ID:', userId);
  console.log('Role:', user.role_name, `(id ${user.roleid})`);
  console.log('voided:', user.voided, '| isactive:', user.isactive);
  console.log('must_change_password:', mustChange);
  console.log('otp_enabled:', user.otp_enabled);
  console.log('password hash:', user.looks_like_bcrypt ? 'bcrypt OK' : 'NOT bcrypt — login will fail until reset');
  console.log('org scopes:', orgScopes.length, '| project scopes:', projectScopes.length);
  console.log('privileges:', privileges.slice(0, 8).join(', ') + (privileges.length > 8 ? ', ...' : ''));

  const roleNorm = normalizeRoleForCompare(user.role_name);
  const adminLike = roleNorm.includes('admin') || user.roleid === 1
    || privileges.includes('admin.access')
    || privileges.includes('organization.scope_bypass');
  if (!adminLike && orgScopes.length === 0 && projectScopes.length === 0) {
    console.warn('\nBLOCKER: No org/project scope and not admin-like — login returns 403 after password check.');
  }
  if (user.otp_enabled) {
    console.warn('\nNOTE: OTP is enabled. Login requires email/SMS unless OTP is disabled or mail is configured.');
  }
  if (mustChange) {
    console.warn('\nNOTE: must_change_password is true — user will be sent to force password change after login.');
  }

  if (!args.apply) {
    console.log('\nDry-run only. Re-run with --apply to make changes.');
    if (!args.password && !args.clearPolicy && !args.disableOtp) {
      console.log('Example repair:');
      console.log(`  node api/scripts/repairUserLogin.js --username=${args.username} --password='YourNewPass' --clear-policy --disable-otp --apply`);
    }
    return;
  }

  if (args.password) {
    if (String(args.password).length < 6) {
      console.error('Password must be at least 6 characters.');
      process.exit(1);
    }
    const passwordHash = await hashPassword(args.password);
    await pool.query(
      'UPDATE users SET passwordhash = $1, updatedat = CURRENT_TIMESTAMP WHERE userid = $2',
      [passwordHash, userId]
    );
    console.log('\nApplied: password hash updated.');
  }

  if (args.clearPolicy || args.password) {
    await setMustChangePassword(userId, false, 'repair_script');
    console.log('Applied: must_change_password cleared.');
  }

  if (args.disableOtp) {
    await pool.query(
      'UPDATE users SET otp_enabled = false, updatedat = CURRENT_TIMESTAMP WHERE userid = $1',
      [userId]
    );
    console.log('Applied: otp_enabled set to false.');
  }

  if (args.password) {
    const verify = await pool.query('SELECT passwordhash FROM users WHERE userid = $1', [userId]);
    const hash = verify.rows?.[0]?.passwordhash;
    const ok = hash && (await verifyPassword(args.password, hash)).ok;
    console.log('Verify new password against DB:', ok ? 'OK' : 'FAILED');
  }

  console.log('\nDone. User should sign in with the password set above (not an older one).');
}

main().catch((err) => {
  console.error('Repair failed:', err.message);
  process.exit(1);
});
