#!/usr/bin/env node
/**
 * One-off: for PostgreSQL users who have ministry / state_department / agency_id on `users`
 * but no rows in `user_organization_scope`, insert the appropriate initial scope
 * (same rules as syncOrganizationScopesFromUserProfile).
 *
 * Safe to re-run: only inserts when the user has zero scope rows.
 *
 * From repo root (with api/.env or DB_* in env):
 *   node scripts/migration/backfill-user-org-scopes-from-profile.js
 */

const path = require('path');
try {
    // Optional: if dotenv exists, load api/.env and then repo .env
    // Script still works when env vars are already exported in shell.
    // eslint-disable-next-line global-require
    const dotenv = require('dotenv');
    dotenv.config({ path: path.join(__dirname, '../../api/.env') });
    dotenv.config({ path: path.join(__dirname, '../../.env') });
} catch {
    // dotenv not available at repo root; rely on process.env
}

const pool = require('../../api/config/db');
const orgScope = require('../../api/services/organizationScopeService');

async function main() {
    if ((process.env.DB_TYPE || 'postgresql') !== 'postgresql') {
        console.log('This script is for PostgreSQL (DB_TYPE=postgresql). Skipping.');
        process.exit(0);
    }

    if (!(await orgScope.organizationScopeTableExists())) {
        console.log('Table user_organization_scope does not exist. Apply add-user-organization-scope.sql first.');
        process.exit(1);
    }

    const candidates = await pool.query(`
        SELECT u.userid
        FROM users u
        WHERE COALESCE(u.voided, false) = false
          AND NOT EXISTS (SELECT 1 FROM user_organization_scope s WHERE s.user_id = u.userid)
          AND (
              u.agency_id IS NOT NULL
              OR (NULLIF(TRIM(COALESCE(u.ministry, '')), '') IS NOT NULL
                  AND NULLIF(TRIM(COALESCE(u.state_department, '')), '') IS NOT NULL)
              OR NULLIF(TRIM(COALESCE(u.ministry, '')), '') IS NOT NULL
          )
        ORDER BY u.userid
    `);

    const rows = candidates.rows || [];
    console.log(`Candidates (no scopes yet, with org fields): ${rows.length}`);

    let inserted = 0;
    let skipped = 0;
    for (const { userid } of rows) {
        const r = await orgScope.syncOrganizationScopesFromUserProfile(userid, { onlyIfEmpty: true });
        if (r.ok) {
            inserted += 1;
            console.log(`  user ${userid}: inserted ${r.scopeType}`);
        } else {
            skipped += 1;
            if (r.reason !== 'already_has_scopes') {
                console.log(`  user ${userid}: skip (${r.reason})`);
            }
        }
    }

    console.log(`Done. Inserted: ${inserted}, skipped: ${skipped}.`);
    await pool.end();
    process.exit(0);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
