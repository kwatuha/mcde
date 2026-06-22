const pool = require('../config/db');

let schemaReady = false;

async function ensureCountyRoleSchema() {
    if (schemaReady) return;
    const DB_TYPE = process.env.DB_TYPE || 'postgresql';
    if (DB_TYPE !== 'postgresql') {
        schemaReady = true;
        return;
    }
    await pool.query(`
        CREATE TABLE IF NOT EXISTS county_position_role_map (
            id BIGSERIAL PRIMARY KEY,
            sort_order INT NOT NULL DEFAULT 0,
            responsibility TEXT NOT NULL,
            area TEXT NOT NULL,
            permission_pattern TEXT NOT NULL,
            base_role_name TEXT NOT NULL,
            default_scope_type TEXT NULL,
            default_scope_area TEXT NULL,
            ui_profile_name TEXT NULL,
            notes TEXT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            voided BOOLEAN NOT NULL DEFAULT FALSE
        )
    `);
    schemaReady = true;
}

async function fetchCountyPositionRoleMap() {
    const DB_TYPE = process.env.DB_TYPE || 'postgresql';
    if (DB_TYPE !== 'postgresql') return [];

    await ensureCountyRoleSchema();
    const result = await pool.query(`
        SELECT
            m.id,
            m.sort_order AS "sortOrder",
            m.responsibility,
            m.area,
            m.permission_pattern AS "permissionPattern",
            m.base_role_name AS "baseRoleName",
            m.default_scope_type AS "defaultScopeType",
            m.default_scope_area AS "defaultScopeArea",
            m.ui_profile_name AS "uiProfileName",
            m.notes,
            r.roleid AS "roleId",
            p.id AS "uiProfileId"
        FROM county_position_role_map m
        LEFT JOIN roles r
            ON lower(trim(r.name)) = lower(trim(m.base_role_name))
           AND COALESCE(r.voided, false) = false
        LEFT JOIN ui_profiles p
            ON lower(trim(p.name)) = lower(trim(m.ui_profile_name))
           AND COALESCE(p.voided, false) = false
        WHERE COALESCE(m.voided, false) = false
        ORDER BY m.sort_order, m.id
    `);
    return result.rows || [];
}

async function fetchCountyMunicipalities() {
    const DB_TYPE = process.env.DB_TYPE || 'postgresql';
    if (DB_TYPE !== 'postgresql') return [];
    await ensureCountyRoleSchema();
    try {
        const result = await pool.query(`
            SELECT id, name, subcounty AS "subcounty"
            FROM county_municipalities
            WHERE COALESCE(voided, false) = false
            ORDER BY name
        `);
        return result.rows || [];
    } catch {
        return [];
    }
}

module.exports = {
    ensureCountyRoleSchema,
    fetchCountyPositionRoleMap,
    fetchCountyMunicipalities,
};
