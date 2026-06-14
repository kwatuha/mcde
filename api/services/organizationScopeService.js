const pool = require('../config/db');

const SCOPE_TYPES = Object.freeze({
    AGENCY: 'AGENCY',
    MINISTRY_ALL: 'MINISTRY_ALL',
    STATE_DEPARTMENT_ALL: 'STATE_DEPARTMENT_ALL',
});

const PROJECT_SCOPE_TYPES = Object.freeze({
    ALL_DEPARTMENTS: 'ALL_DEPARTMENTS',
    SECTOR: 'SECTOR',
    DEPARTMENT: 'DEPARTMENT',
    SUBCOUNTY: 'SUBCOUNTY',
    WARD: 'WARD',
});

const BYPASS_PRIVILEGE = 'organization.scope_bypass';

let _tableExistsCache = null;
let _tableCheckedAt = 0;
const TABLE_CACHE_MS = 60_000;
let _scopeSchemaReady = false;

async function ensureScopeSchema() {
    const DB_TYPE = process.env.DB_TYPE || 'postgresql';
    if (DB_TYPE !== 'postgresql' || _scopeSchemaReady) return;

    await pool.query(`
        CREATE TABLE IF NOT EXISTS user_organization_scope (
            id BIGSERIAL PRIMARY KEY,
            user_id BIGINT NOT NULL,
            scope_type TEXT NOT NULL,
            agency_id BIGINT NULL,
            ministry TEXT NULL,
            state_department TEXT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS idx_user_org_scope_user ON user_organization_scope (user_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_user_org_scope_type ON user_organization_scope (scope_type)');

    await pool.query(`
        CREATE TABLE IF NOT EXISTS user_project_scopes (
            id BIGSERIAL PRIMARY KEY,
            user_id BIGINT NOT NULL,
            scope_type TEXT NOT NULL CHECK (scope_type IN ('ALL_DEPARTMENTS', 'SECTOR', 'DEPARTMENT', 'SUBCOUNTY', 'WARD')),
            scope_value TEXT NOT NULL,
            scope_ref_id BIGINT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            voided BOOLEAN NOT NULL DEFAULT FALSE
        )
    `);
    await pool.query(`
        DO $$
        DECLARE
            c record;
        BEGIN
            FOR c IN
                SELECT conname
                FROM pg_constraint
                WHERE conrelid = 'user_project_scopes'::regclass
                  AND contype = 'c'
                  AND pg_get_constraintdef(oid) ILIKE '%scope_type%'
            LOOP
                EXECUTE format('ALTER TABLE user_project_scopes DROP CONSTRAINT %I', c.conname);
            END LOOP;
            ALTER TABLE user_project_scopes
                ADD CONSTRAINT user_project_scopes_scope_type_check
                CHECK (scope_type IN ('ALL_DEPARTMENTS', 'SECTOR', 'DEPARTMENT', 'SUBCOUNTY', 'WARD'));
        END $$;
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS idx_user_project_scopes_user ON user_project_scopes (user_id) WHERE voided = false');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_user_project_scopes_type_value ON user_project_scopes (scope_type, lower(trim(scope_value))) WHERE voided = false');

    await pool.query(`
        CREATE TABLE IF NOT EXISTS department_sector_mappings (
            id BIGSERIAL PRIMARY KEY,
            department_id BIGINT NULL,
            department_name TEXT NULL,
            sector_id BIGINT NULL,
            sector_name TEXT NOT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            voided BOOLEAN NOT NULL DEFAULT FALSE
        )
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS idx_dept_sector_mappings_sector ON department_sector_mappings (lower(trim(sector_name))) WHERE voided = false');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_dept_sector_mappings_department ON department_sector_mappings (lower(trim(department_name))) WHERE voided = false');

    _scopeSchemaReady = true;
    _tableExistsCache = true;
    _tableCheckedAt = Date.now();
}

async function organizationScopeTableExists() {
    const now = Date.now();
    if (_tableExistsCache !== null && now - _tableCheckedAt < TABLE_CACHE_MS) {
        return _tableExistsCache;
    }
    const DB_TYPE = process.env.DB_TYPE || 'postgresql';
    try {
        if (DB_TYPE === 'postgresql') {
            await ensureScopeSchema();
            const r = await pool.query(`
                SELECT EXISTS (
                    SELECT 1 FROM information_schema.tables
                    WHERE table_schema = 'public' AND table_name = 'user_organization_scope'
                ) AS ex
            `);
            _tableExistsCache = r.rows[0]?.ex === true;
        } else {
            _tableExistsCache = false;
        }
    } catch {
        _tableExistsCache = false;
    }
    _tableCheckedAt = now;
    return _tableExistsCache;
}

function userHasOrganizationBypass(privileges) {
    if (!Array.isArray(privileges)) return false;
    return privileges.includes(BYPASS_PRIVILEGE);
}

function normalizeProjectScopeInput(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const scopeType = String(raw.scopeType || raw.scope_type || '').trim().toUpperCase();
    if (!Object.values(PROJECT_SCOPE_TYPES).includes(scopeType)) return null;
    const scopeValue = scopeType === PROJECT_SCOPE_TYPES.ALL_DEPARTMENTS
        ? '*'
        : String(raw.scopeValue || raw.scope_value || raw.value || raw.name || '').trim();
    if (!scopeValue) return null;
    const rawRefId = raw.scopeRefId ?? raw.scope_ref_id ?? raw.refId ?? raw.id ?? null;
    const scopeRefId = rawRefId === null || rawRefId === undefined || rawRefId === ''
        ? null
        : parseInt(String(rawRefId), 10);
    return {
        scopeType,
        scopeValue,
        scopeRefId: Number.isFinite(scopeRefId) ? scopeRefId : null,
    };
}

function normalizeDepartmentSectorMappingInput(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const departmentName = String(raw.departmentName || raw.department_name || '').trim();
    const sectorName = String(raw.sectorName || raw.sector_name || '').trim();
    if (!departmentName || !sectorName) return null;
    const departmentIdRaw = raw.departmentId ?? raw.department_id ?? null;
    const sectorIdRaw = raw.sectorId ?? raw.sector_id ?? null;
    const departmentId = departmentIdRaw === null || departmentIdRaw === undefined || departmentIdRaw === ''
        ? null
        : parseInt(String(departmentIdRaw), 10);
    const sectorId = sectorIdRaw === null || sectorIdRaw === undefined || sectorIdRaw === ''
        ? null
        : parseInt(String(sectorIdRaw), 10);
    return {
        departmentId: Number.isFinite(departmentId) ? departmentId : null,
        departmentName,
        sectorId: Number.isFinite(sectorId) ? sectorId : null,
        sectorName,
    };
}

function normalizeScopeInput(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const scopeType = String(raw.scopeType || raw.scope_type || '').trim().toUpperCase();
    if (!scopeType) return null;

    // UI uses ALL_MINISTRIES for county-wide access. Store it as MINISTRY_ALL('*')
    // because older scope filters already treat * / all as unrestricted.
    if (scopeType === 'ALL_MINISTRIES') {
        return { scopeType: SCOPE_TYPES.MINISTRY_ALL, agencyId: null, ministry: '*', stateDepartment: null };
    }
    if (!Object.values(SCOPE_TYPES).includes(scopeType)) return null;

    if (scopeType === SCOPE_TYPES.AGENCY) {
        const agencyId = raw.agencyId ?? raw.agency_id;
        const n = parseInt(String(agencyId), 10);
        if (!Number.isFinite(n)) return null;
        return { scopeType: SCOPE_TYPES.AGENCY, agencyId: n, ministry: null, stateDepartment: null };
    }
    if (scopeType === SCOPE_TYPES.MINISTRY_ALL) {
        const ministry = (raw.ministry || '').trim();
        if (!ministry) return null;
        return { scopeType: SCOPE_TYPES.MINISTRY_ALL, agencyId: null, ministry, stateDepartment: null };
    }
    const ministry = (raw.ministry || '').trim();
    const stateDepartment = (raw.stateDepartment || raw.state_department || '').trim();
    if (!ministry || !stateDepartment) return null;
    return {
        scopeType: SCOPE_TYPES.STATE_DEPARTMENT_ALL,
        agencyId: null,
        ministry,
        stateDepartment,
    };
}

/**
 * @param {number} userId
 * @returns {Promise<Array>}
 */
async function fetchOrganizationScopesForUser(userId) {
    if (!(await organizationScopeTableExists())) return [];
    const uid = parseInt(String(userId), 10);
    if (!Number.isFinite(uid)) return [];

    const result = await pool.query(
        `
        SELECT
            s.id,
            CASE
                WHEN s.scope_type = 'MINISTRY_ALL' AND LOWER(TRIM(COALESCE(s.ministry, ''))) IN ('*', 'all')
                    THEN 'ALL_MINISTRIES'
                ELSE s.scope_type
            END AS "scopeType",
            s.agency_id AS "agencyId",
            s.ministry,
            s.state_department AS "stateDepartment",
            ag.agency_name AS "agencyName"
        FROM user_organization_scope s
        LEFT JOIN agencies ag ON s.agency_id = ag.id
        WHERE s.user_id = $1
        ORDER BY s.id
        `,
        [uid]
    );
    return result.rows || [];
}

async function fetchProjectScopesForUser(userId) {
    if (!(await organizationScopeTableExists())) return [];
    const uid = parseInt(String(userId), 10);
    if (!Number.isFinite(uid)) return [];

    const result = await pool.query(
        `
        SELECT
            id,
            user_id AS "userId",
            scope_type AS "scopeType",
            scope_value AS "scopeValue",
            scope_ref_id AS "scopeRefId",
            created_at AS "createdAt",
            updated_at AS "updatedAt"
        FROM user_project_scopes
        WHERE user_id = $1
          AND COALESCE(voided, false) = false
        ORDER BY scope_type, scope_value, id
        `,
        [uid]
    );
    return result.rows || [];
}

async function fetchProjectScopesForUsers(userIds) {
    if (!(await organizationScopeTableExists())) return new Map();
    const ids = [...new Set(userIds)]
        .map((id) => parseInt(String(id), 10))
        .filter((n) => Number.isFinite(n));
    if (ids.length === 0) return new Map();

    const result = await pool.query(
        `
        SELECT
            id,
            user_id AS "userId",
            scope_type AS "scopeType",
            scope_value AS "scopeValue",
            scope_ref_id AS "scopeRefId",
            created_at AS "createdAt",
            updated_at AS "updatedAt"
        FROM user_project_scopes
        WHERE user_id = ANY($1::int[])
          AND COALESCE(voided, false) = false
        ORDER BY user_id, scope_type, scope_value, id
        `,
        [ids]
    );

    const map = new Map();
    for (const row of result.rows || []) {
        const uid = parseInt(String(row.userId), 10);
        if (!map.has(uid)) map.set(uid, []);
        map.get(uid).push(row);
    }
    return map;
}

/**
 * Load organization scopes for many users in one query (for user list / search).
 * @param {Array<string|number>} userIds
 * @returns {Promise<Map<number, Array>>} userId -> scopes (same shape as fetchOrganizationScopesForUser items)
 */
async function fetchOrganizationScopesForUsers(userIds) {
    if (!(await organizationScopeTableExists())) return new Map();
    const ids = [...new Set(userIds)]
        .map((id) => parseInt(String(id), 10))
        .filter((n) => Number.isFinite(n));
    if (ids.length === 0) return new Map();

    const result = await pool.query(
        `
        SELECT
            s.user_id AS "userId",
            s.id,
            CASE
                WHEN s.scope_type = 'MINISTRY_ALL' AND LOWER(TRIM(COALESCE(s.ministry, ''))) IN ('*', 'all')
                    THEN 'ALL_MINISTRIES'
                ELSE s.scope_type
            END AS "scopeType",
            s.agency_id AS "agencyId",
            s.ministry,
            s.state_department AS "stateDepartment",
            ag.agency_name AS "agencyName"
        FROM user_organization_scope s
        LEFT JOIN agencies ag ON s.agency_id = ag.id
        WHERE s.user_id = ANY($1::int[])
        ORDER BY s.user_id, s.id
        `,
        [ids]
    );

    const map = new Map();
    for (const row of result.rows || []) {
        const uid = parseInt(String(row.userId), 10);
        const item = {
            id: row.id,
            scopeType: row.scopeType,
            agencyId: row.agencyId,
            ministry: row.ministry,
            stateDepartment: row.stateDepartment,
            agencyName: row.agencyName,
        };
        if (!map.has(uid)) map.set(uid, []);
        map.get(uid).push(item);
    }
    return map;
}

/**
 * Replace all scope rows for a user (transaction uses same pool queries sequentially).
 */
async function replaceUserOrganizationScopes(userId, scopesPayload) {
    if (!(await organizationScopeTableExists())) return;
    const uid = parseInt(String(userId), 10);
    if (!Number.isFinite(uid)) throw new Error('Invalid user id');

    const normalized = [];
    if (Array.isArray(scopesPayload)) {
        for (const row of scopesPayload) {
            const n = normalizeScopeInput(row);
            if (n) normalized.push(n);
        }
    }
    if (Array.isArray(scopesPayload) && scopesPayload.length > 0 && normalized.length === 0) {
        throw new Error('No valid organization access rows were provided.');
    }

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        await conn.query('DELETE FROM user_organization_scope WHERE user_id = $1', [uid]);
        for (const s of normalized) {
            if (s.scopeType === SCOPE_TYPES.AGENCY) {
                await conn.query(
                    `INSERT INTO user_organization_scope (user_id, scope_type, agency_id, ministry, state_department)
                     VALUES ($1, $2, $3, NULL, NULL)`,
                    [uid, SCOPE_TYPES.AGENCY, s.agencyId]
                );
            } else if (s.scopeType === SCOPE_TYPES.MINISTRY_ALL) {
                await conn.query(
                    `INSERT INTO user_organization_scope (user_id, scope_type, agency_id, ministry, state_department)
                     VALUES ($1, $2, NULL, $3, NULL)`,
                    [uid, SCOPE_TYPES.MINISTRY_ALL, s.ministry]
                );
            } else {
                await conn.query(
                    `INSERT INTO user_organization_scope (user_id, scope_type, agency_id, ministry, state_department)
                     VALUES ($1, $2, NULL, $3, $4)`,
                    [uid, SCOPE_TYPES.STATE_DEPARTMENT_ALL, s.ministry, s.stateDepartment]
                );
            }
        }
        await conn.commit();
    } catch (e) {
        try {
            await conn.rollback();
        } catch (rbErr) {
            console.warn('organizationScope rollback:', rbErr.message);
        }
        throw e;
    } finally {
        conn.release();
    }
}

async function replaceUserProjectScopes(userId, scopesPayload) {
    await ensureScopeSchema();
    const uid = parseInt(String(userId), 10);
    if (!Number.isFinite(uid)) throw new Error('Invalid user id');

    const normalized = [];
    if (Array.isArray(scopesPayload)) {
        for (const row of scopesPayload) {
            const n = normalizeProjectScopeInput(row);
            if (n) normalized.push(n);
        }
    }
    if (Array.isArray(scopesPayload) && scopesPayload.length > 0 && normalized.length === 0) {
        throw new Error('No valid project access rows were provided.');
    }

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        await conn.query('UPDATE user_project_scopes SET voided = true, updated_at = CURRENT_TIMESTAMP WHERE user_id = $1', [uid]);
        for (const s of normalized) {
            await conn.query(
                `INSERT INTO user_project_scopes (user_id, scope_type, scope_value, scope_ref_id)
                 VALUES ($1, $2, $3, $4)`,
                [uid, s.scopeType, s.scopeValue, s.scopeRefId]
            );
        }
        await conn.commit();
    } catch (e) {
        try {
            await conn.rollback();
        } catch (rbErr) {
            console.warn('projectScope rollback:', rbErr.message);
        }
        throw e;
    } finally {
        conn.release();
    }
}

async function userHasProjectAccessScopeContext(userId) {
    if (!(await organizationScopeTableExists())) return false;
    const uid = parseInt(String(userId), 10);
    if (!Number.isFinite(uid)) return false;
    const result = await pool.query(
        `
        SELECT EXISTS (
            SELECT 1 FROM user_project_scopes
            WHERE user_id = $1 AND COALESCE(voided, false) = false
        ) AS ex
        `,
        [uid]
    );
    return result.rows?.[0]?.ex === true;
}

async function fetchDepartmentSectorMappings() {
    await ensureScopeSchema();
    const result = await pool.query(
        `
        SELECT
            id,
            department_id AS "departmentId",
            department_name AS "departmentName",
            sector_id AS "sectorId",
            sector_name AS "sectorName",
            created_at AS "createdAt",
            updated_at AS "updatedAt"
        FROM department_sector_mappings
        WHERE COALESCE(voided, false) = false
        ORDER BY sector_name, department_name, id
        `
    );
    return result.rows || [];
}

async function replaceDepartmentSectorMappings(mappingsPayload) {
    await ensureScopeSchema();
    const normalized = [];
    if (Array.isArray(mappingsPayload)) {
        for (const row of mappingsPayload) {
            const n = normalizeDepartmentSectorMappingInput(row);
            if (n) normalized.push(n);
        }
    }
    if (Array.isArray(mappingsPayload) && mappingsPayload.length > 0 && normalized.length === 0) {
        throw new Error('No valid department-sector mappings were provided.');
    }

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        await conn.query('UPDATE department_sector_mappings SET voided = true, updated_at = CURRENT_TIMESTAMP WHERE COALESCE(voided, false) = false');
        for (const row of normalized) {
            await conn.query(
                `INSERT INTO department_sector_mappings (department_id, department_name, sector_id, sector_name)
                 VALUES ($1, $2, $3, $4)`,
                [row.departmentId, row.departmentName, row.sectorId, row.sectorName]
            );
        }
        await conn.commit();
    } catch (e) {
        try {
            await conn.rollback();
        } catch (rbErr) {
            console.warn('departmentSectorMapping rollback:', rbErr.message);
        }
        throw e;
    } finally {
        conn.release();
    }
}

/**
 * When a user is created with a home agency only, mirror it as an AGENCY scope row.
 */
async function ensureDefaultAgencyScope(userId, agencyId) {
    if (!(await organizationScopeTableExists())) return;
    const uid = parseInt(String(userId), 10);
    const aid = parseInt(String(agencyId), 10);
    if (!Number.isFinite(uid) || !Number.isFinite(aid)) return;

    const existing = await pool.query(
        'SELECT 1 FROM user_organization_scope WHERE user_id = $1 LIMIT 1',
        [uid]
    );
    if ((existing.rows || []).length > 0) return;

    await pool.query(
        `INSERT INTO user_organization_scope (user_id, scope_type, agency_id, ministry, state_department)
         VALUES ($1, $2, $3, NULL, NULL)`,
        [uid, SCOPE_TYPES.AGENCY, aid]
    );
}

/**
 * Create initial user_organization_scope row(s) from users.agency_id, ministry, state_department
 * when the user has no scopes yet (registration approval, admin create, or legacy backfill).
 * Priority: STATE_DEPARTMENT_ALL > AGENCY > MINISTRY_ALL.
 * This default keeps most users scoped at state-department level without manual scope assignment.
 *
 * @param {number|string} userId
 * @param {{ onlyIfEmpty?: boolean }} options onlyIfEmpty defaults true — do not insert if user already has any scope row.
 * @returns {Promise<{ ok: boolean, reason?: string, scopeType?: string }>}
 */
async function syncOrganizationScopesFromUserProfile(userId, options = {}) {
    const onlyIfEmpty = options.onlyIfEmpty !== false;
    if (!(await organizationScopeTableExists())) {
        return { ok: false, reason: 'no_scope_table' };
    }
    const uid = parseInt(String(userId), 10);
    if (!Number.isFinite(uid)) {
        return { ok: false, reason: 'invalid_user_id' };
    }

    if (onlyIfEmpty) {
        const existing = await pool.query(
            'SELECT 1 FROM user_organization_scope WHERE user_id = $1 LIMIT 1',
            [uid]
        );
        if ((existing.rows || []).length > 0) {
            return { ok: false, reason: 'already_has_scopes' };
        }
    }

    const ur = await pool.query(
        `SELECT agency_id AS "agencyId", ministry, state_department AS "stateDepartment"
         FROM users WHERE userid = $1 AND COALESCE(voided, false) = false`,
        [uid]
    );
    const row = ur.rows?.[0];
    if (!row) {
        return { ok: false, reason: 'user_not_found' };
    }

    const aid = row.agencyId != null ? parseInt(String(row.agencyId), 10) : NaN;
    const ministry = (row.ministry != null ? String(row.ministry) : '').trim();
    const stateDepartment = (row.stateDepartment != null ? String(row.stateDepartment) : '').trim();

    if (ministry && stateDepartment) {
        await pool.query(
            `INSERT INTO user_organization_scope (user_id, scope_type, agency_id, ministry, state_department)
             VALUES ($1, $2, NULL, $3, $4)`,
            [uid, SCOPE_TYPES.STATE_DEPARTMENT_ALL, ministry, stateDepartment]
        );
        return { ok: true, scopeType: SCOPE_TYPES.STATE_DEPARTMENT_ALL };
    }
    if (Number.isFinite(aid)) {
        await pool.query(
            `INSERT INTO user_organization_scope (user_id, scope_type, agency_id, ministry, state_department)
             VALUES ($1, $2, $3, NULL, NULL)`,
            [uid, SCOPE_TYPES.AGENCY, aid]
        );
        return { ok: true, scopeType: SCOPE_TYPES.AGENCY };
    }
    if (ministry) {
        await pool.query(
            `INSERT INTO user_organization_scope (user_id, scope_type, agency_id, ministry, state_department)
             VALUES ($1, $2, NULL, $3, NULL)`,
            [uid, SCOPE_TYPES.MINISTRY_ALL, ministry]
        );
        return { ok: true, scopeType: SCOPE_TYPES.MINISTRY_ALL };
    }
    return { ok: false, reason: 'no_org_fields_on_user' };
}

/**
 * PostgreSQL: explicit project access predicate for projects alias `p`.
 * Uses one placeholder ? for userId.
 */
function buildExplicitProjectScopeFragment(projectAlias = 'p') {
    const pa = projectAlias;
    return `EXISTS (
            SELECT 1
            FROM user_project_scopes ps
            WHERE ps.user_id = ?
              AND COALESCE(ps.voided, false) = false
              AND (
                    (
                        ps.scope_type = 'ALL_DEPARTMENTS'
                    )
                    OR (
                        ps.scope_type = 'SECTOR'
                        AND (
                            LOWER(TRIM(COALESCE(${pa}.sector, ''))) = LOWER(TRIM(COALESCE(ps.scope_value, '')))
                            OR EXISTS (
                                SELECT 1
                                FROM department_sector_mappings dsm
                                WHERE COALESCE(dsm.voided, false) = false
                                  AND (
                                        (ps.scope_ref_id IS NOT NULL AND dsm.sector_id = ps.scope_ref_id)
                                        OR LOWER(TRIM(COALESCE(dsm.sector_name, ''))) = LOWER(TRIM(COALESCE(ps.scope_value, '')))
                                  )
                                  AND (
                                        LOWER(TRIM(COALESCE(${pa}.state_department, ''))) = LOWER(TRIM(COALESCE(dsm.department_name, '')))
                                        OR LOWER(TRIM(COALESCE(${pa}.implementing_agency, ''))) = LOWER(TRIM(COALESCE(dsm.department_name, '')))
                                  )
                            )
                        )
                    )
                    OR (
                        ps.scope_type = 'DEPARTMENT'
                        AND (
                            LOWER(TRIM(COALESCE(${pa}.state_department, ''))) = LOWER(TRIM(COALESCE(ps.scope_value, '')))
                            OR LOWER(TRIM(COALESCE(${pa}.implementing_agency, ''))) = LOWER(TRIM(COALESCE(ps.scope_value, '')))
                        )
                    )
                    OR (
                        ps.scope_type = 'SUBCOUNTY'
                        AND (
                            regexp_replace(LOWER(TRIM(COALESCE(NULLIF(TRIM(${pa}.location->>'subcounty'), ''), NULLIF(TRIM(${pa}.location->>'constituency'), ''), ''))), '[^a-z0-9]+', '', 'g')
                                = regexp_replace(LOWER(TRIM(COALESCE(ps.scope_value, ''))), '[^a-z0-9]+', '', 'g')
                            OR EXISTS (
                                SELECT 1
                                FROM kenya_wards kw
                                WHERE COALESCE(kw.voided, false) = false
                                  AND NULLIF(TRIM(COALESCE(${pa}.location->>'ward', '')), '') IS NOT NULL
                                  AND regexp_replace(LOWER(TRIM(kw.iebc_ward_name)), '[^a-z0-9]+', '', 'g')
                                      = regexp_replace(LOWER(TRIM(COALESCE(${pa}.location->>'ward', ''))), '[^a-z0-9]+', '', 'g')
                                  AND regexp_replace(LOWER(TRIM(COALESCE(NULLIF(TRIM(kw.subcounty), ''), NULLIF(TRIM(kw.division), '')))), '[^a-z0-9]+', '', 'g')
                                      = regexp_replace(LOWER(TRIM(COALESCE(ps.scope_value, ''))), '[^a-z0-9]+', '', 'g')
                            )
                        )
                    )
                    OR (
                        ps.scope_type = 'WARD'
                        AND regexp_replace(LOWER(TRIM(COALESCE(${pa}.location->>'ward', ''))), '[^a-z0-9]+', '', 'g')
                            = regexp_replace(LOWER(TRIM(COALESCE(ps.scope_value, ''))), '[^a-z0-9]+', '', 'g')
                    )
              )
        )`;
}

/**
 * PostgreSQL: AND (... scope predicate ...) for projects alias `p`.
 * Uses six placeholders ? for the same userId (pool.execute converts to $n):
 * project scope rows, project-scope override guard, organization scope rows,
 * project-scope override guard, no-org fallback check, and user profile fallback.
 */
function buildProjectListScopeFragment(projectAlias = 'p') {
    const pa = projectAlias;
    return `(
        ${buildExplicitProjectScopeFragment(pa)}
        OR
        (
            NOT EXISTS (
                SELECT 1
                FROM user_project_scopes ps_org_guard
                WHERE ps_org_guard.user_id = ?
                  AND COALESCE(ps_org_guard.voided, false) = false
            )
            AND EXISTS (
                SELECT 1 FROM user_organization_scope s
                LEFT JOIN agencies ag ON s.agency_id = ag.id AND COALESCE(ag.voided, false) = false
                WHERE s.user_id = ?
                AND (
                (s.scope_type = 'AGENCY' AND ag.id IS NOT NULL
                    AND (
                        LOWER(TRIM(COALESCE(${pa}.implementing_agency, ''))) = LOWER(TRIM(COALESCE(ag.agency_name, '')))
                        OR (
                            NULLIF(TRIM(COALESCE(${pa}.implementing_agency, '')), '') IS NULL
                            AND NULLIF(TRIM(COALESCE(ag.ministry, '')), '') IS NOT NULL
                            AND NULLIF(TRIM(COALESCE(ag.state_department, '')), '') IS NOT NULL
                            AND LOWER(TRIM(COALESCE(${pa}.ministry, ''))) = LOWER(TRIM(COALESCE(ag.ministry, '')))
                            AND LOWER(TRIM(COALESCE(${pa}.state_department, ''))) = LOWER(TRIM(COALESCE(ag.state_department, '')))
                        )
                    ))
                OR (s.scope_type = 'MINISTRY_ALL'
                    AND (
                        LOWER(TRIM(COALESCE(s.ministry, ''))) IN ('*', 'all')
                        OR (
                            NULLIF(TRIM(COALESCE(s.ministry, '')), '') IS NOT NULL
                            AND NULLIF(TRIM(COALESCE(${pa}.ministry, '')), '') IS NOT NULL
                            AND
                            (
                                LOWER(TRIM(COALESCE(${pa}.ministry, ''))) = LOWER(TRIM(COALESCE(s.ministry, '')))
                                OR regexp_replace(
                                    regexp_replace(
                                        regexp_replace(LOWER(TRIM(COALESCE(${pa}.ministry, ''))), '^ministry\\s+of\\s+', '', 'g'),
                                        '\\s*\\([^)]*\\)\\s*',
                                        '',
                                        'g'
                                    ),
                                    '\\m(and|the)\\M',
                                    '',
                                    'g'
                                ) = regexp_replace(
                                    regexp_replace(
                                        regexp_replace(LOWER(TRIM(COALESCE(s.ministry, ''))), '^ministry\\s+of\\s+', '', 'g'),
                                        '\\s*\\([^)]*\\)\\s*',
                                        '',
                                        'g'
                                    ),
                                    '\\m(and|the)\\M',
                                    '',
                                    'g'
                                )
                                OR regexp_replace(
                                    regexp_replace(
                                        regexp_replace(
                                            regexp_replace(LOWER(TRIM(COALESCE(${pa}.ministry, ''))), '^ministry\\s+of\\s+', '', 'g'),
                                            '\\s*\\([^)]*\\)\\s*',
                                            '',
                                            'g'
                                        ),
                                        '\\m(and|the)\\M',
                                        '',
                                        'g'
                                    ),
                                    '[^a-z0-9]+',
                                    '',
                                    'g'
                                ) LIKE '%' || regexp_replace(
                                    regexp_replace(
                                        regexp_replace(
                                            regexp_replace(LOWER(TRIM(COALESCE(s.ministry, ''))), '^ministry\\s+of\\s+', '', 'g'),
                                            '\\s*\\([^)]*\\)\\s*',
                                            '',
                                            'g'
                                        ),
                                        '\\m(and|the)\\M',
                                        '',
                                        'g'
                                    ),
                                    '[^a-z0-9]+',
                                    '',
                                    'g'
                                ) || '%'
                            )
                        )
                        OR (
                            -- County project data stores the parent as "Machakos County Executive";
                            -- allow a national/county ministry scope to match meaningful department/directorate tokens.
                            NULLIF(TRIM(COALESCE(s.ministry, '')), '') IS NOT NULL
                            AND EXISTS (
                                SELECT 1
                                FROM regexp_split_to_table(
                                    regexp_replace(LOWER(TRIM(COALESCE(s.ministry, ''))), '[^a-z0-9]+', ' ', 'g'),
                                    '\\s+'
                                ) AS scope_token(token)
                                WHERE LENGTH(scope_token.token) >= 3
                                  AND scope_token.token NOT IN (
                                      'and', 'the', 'for', 'of', 'state', 'department', 'ministry',
                                      'county', 'government', 'development', 'services', 'service',
                                      'planning', 'management', 'administration'
                                  )
                                  AND (
                                      regexp_replace(LOWER(TRIM(COALESCE(${pa}.state_department, ''))), '[^a-z0-9]+', ' ', 'g')
                                          LIKE '%' || scope_token.token || '%'
                                      OR regexp_replace(LOWER(TRIM(COALESCE(${pa}.implementing_agency, ''))), '[^a-z0-9]+', ' ', 'g')
                                          LIKE '%' || scope_token.token || '%'
                                  )
                            )
                        )
                        OR EXISTS (
                            SELECT 1
                            FROM ministries m
                            WHERE COALESCE(m.voided, false) = false
                              AND (
                                    -- scope ministry resolves to this canonical ministry (name/alias token/normalized)
                                    LOWER(TRIM(COALESCE(s.ministry, ''))) = LOWER(TRIM(COALESCE(m.name, '')))
                                    OR EXISTS (
                                        SELECT 1
                                        FROM unnest(string_to_array(COALESCE(m.alias, ''), ',')) AS ma(token)
                                        WHERE LOWER(TRIM(COALESCE(s.ministry, ''))) = LOWER(TRIM(COALESCE(ma.token, '')))
                                    )
                                    OR regexp_replace(LOWER(TRIM(COALESCE(s.ministry, ''))), '[^a-z0-9]+', '', 'g')
                                       = regexp_replace(LOWER(TRIM(COALESCE(m.name, ''))), '[^a-z0-9]+', '', 'g')
                                    OR regexp_replace(
                                        regexp_replace(
                                            regexp_replace(LOWER(TRIM(COALESCE(s.ministry, ''))), '^ministry\\s+of\\s+', '', 'g'),
                                            '\\s*\\([^)]*\\)\\s*',
                                            '',
                                            'g'
                                        ),
                                        '\\m(and|the)\\M',
                                        '',
                                        'g'
                                    ) = regexp_replace(
                                        regexp_replace(LOWER(TRIM(COALESCE(m.name, ''))), '^ministry\\s+of\\s+', '', 'g'),
                                    '[^a-z0-9]+',
                                    '',
                                    'g'
                                )
                            )
                              AND (
                                    -- project ministry resolves to same canonical ministry (name/alias token/normalized)
                                    LOWER(TRIM(COALESCE(${pa}.ministry, ''))) = LOWER(TRIM(COALESCE(m.name, '')))
                                    OR EXISTS (
                                        SELECT 1
                                        FROM unnest(string_to_array(COALESCE(m.alias, ''), ',')) AS mb(token)
                                        WHERE LOWER(TRIM(COALESCE(${pa}.ministry, ''))) = LOWER(TRIM(COALESCE(mb.token, '')))
                                    )
                                    OR regexp_replace(LOWER(TRIM(COALESCE(${pa}.ministry, ''))), '[^a-z0-9]+', '', 'g')
                                       = regexp_replace(LOWER(TRIM(COALESCE(m.name, ''))), '[^a-z0-9]+', '', 'g')
                                    OR regexp_replace(
                                        regexp_replace(
                                            regexp_replace(LOWER(TRIM(COALESCE(${pa}.ministry, ''))), '^ministry\\s+of\\s+', '', 'g'),
                                            '\\s*\\([^)]*\\)\\s*',
                                            '',
                                            'g'
                                        ),
                                        '\\m(and|the)\\M',
                                        '',
                                        'g'
                                    ) = regexp_replace(
                                        regexp_replace(LOWER(TRIM(COALESCE(m.name, ''))), '^ministry\\s+of\\s+', '', 'g'),
                                        '\\m(and|the)\\M',
                                        '',
                                        'g'
                                    )
                                    OR regexp_replace(
                                        regexp_replace(
                                            regexp_replace(LOWER(TRIM(COALESCE(${pa}.ministry, ''))), '^ministry\\s+of\\s+', '', 'g'),
                                            '\\s*\\([^)]*\\)\\s*',
                                            '',
                                            'g'
                                        ),
                                        '[^a-z0-9]+',
                                        '',
                                        'g'
                                    ) = regexp_replace(
                                        regexp_replace(LOWER(TRIM(COALESCE(m.name, ''))), '^ministry\\s+of\\s+', '', 'g'),
                                        '[^a-z0-9]+',
                                        '',
                                        'g'
                                    )
                              )
                        )
                    ))
                OR (s.scope_type = 'ALL_MINISTRIES')
                OR (s.scope_type = 'STATE_DEPARTMENT_ALL'
                    AND (
                        (
                            NULLIF(TRIM(COALESCE(s.ministry, '')), '') IS NOT NULL
                            AND NULLIF(TRIM(COALESCE(s.state_department, '')), '') IS NOT NULL
                            AND NULLIF(TRIM(COALESCE(${pa}.ministry, '')), '') IS NOT NULL
                            AND NULLIF(TRIM(COALESCE(${pa}.state_department, '')), '') IS NOT NULL
                            AND
                            LOWER(TRIM(COALESCE(${pa}.ministry, ''))) = LOWER(TRIM(COALESCE(s.ministry, '')))
                            AND LOWER(TRIM(COALESCE(${pa}.state_department, ''))) = LOWER(TRIM(COALESCE(s.state_department, '')))
                        )
                        OR (
                            NULLIF(TRIM(COALESCE(s.state_department, '')), '') IS NOT NULL
                            AND NULLIF(TRIM(COALESCE(${pa}.ministry, '')), '') IS NOT NULL
                            AND LOWER(TRIM(COALESCE(${pa}.ministry, ''))) = LOWER(TRIM(COALESCE(s.state_department, '')))
                        )
                        OR EXISTS (
                            SELECT 1
                            FROM ministries scope_m
                            JOIN departments scope_d
                              ON scope_d."ministryId" = scope_m."ministryId"
                             AND COALESCE(scope_d.voided, false) = false
                            WHERE COALESCE(scope_m.voided, false) = false
                              AND (
                                    LOWER(TRIM(COALESCE(s.ministry, ''))) = LOWER(TRIM(COALESCE(scope_m.name, '')))
                                    OR EXISTS (
                                        SELECT 1
                                        FROM unnest(string_to_array(COALESCE(scope_m.alias, ''), ',')) AS scope_ma(token)
                                        WHERE LOWER(TRIM(COALESCE(s.ministry, ''))) = LOWER(TRIM(COALESCE(scope_ma.token, '')))
                                    )
                                    OR regexp_replace(LOWER(TRIM(COALESCE(s.ministry, ''))), '[^a-z0-9]+', '', 'g')
                                       = regexp_replace(LOWER(TRIM(COALESCE(scope_m.name, ''))), '[^a-z0-9]+', '', 'g')
                              )
                              AND (
                                    LOWER(TRIM(COALESCE(s.state_department, ''))) = LOWER(TRIM(COALESCE(scope_d.name, '')))
                                    OR EXISTS (
                                        SELECT 1
                                        FROM unnest(string_to_array(COALESCE(scope_d.alias, ''), ',')) AS scope_da(token)
                                        WHERE LOWER(TRIM(COALESCE(s.state_department, ''))) = LOWER(TRIM(COALESCE(scope_da.token, '')))
                                    )
                                    OR regexp_replace(LOWER(TRIM(COALESCE(s.state_department, ''))), '[^a-z0-9]+', '', 'g')
                                       = regexp_replace(LOWER(TRIM(COALESCE(scope_d.name, ''))), '[^a-z0-9]+', '', 'g')
                              )
                              AND (
                                    LOWER(TRIM(COALESCE(${pa}.ministry, ''))) = LOWER(TRIM(COALESCE(scope_d.name, '')))
                                    OR EXISTS (
                                        SELECT 1
                                        FROM unnest(string_to_array(COALESCE(scope_d.alias, ''), ',')) AS proj_da(token)
                                        WHERE LOWER(TRIM(COALESCE(${pa}.ministry, ''))) = LOWER(TRIM(COALESCE(proj_da.token, '')))
                                    )
                                    OR regexp_replace(LOWER(TRIM(COALESCE(${pa}.ministry, ''))), '[^a-z0-9]+', '', 'g')
                                       = regexp_replace(LOWER(TRIM(COALESCE(scope_d.name, ''))), '[^a-z0-9]+', '', 'g')
                              )
                        )
                        OR (
                            NULLIF(TRIM(COALESCE(s.ministry, '')), '') IS NOT NULL
                            AND NULLIF(TRIM(COALESCE(s.state_department, '')), '') IS NOT NULL
                            AND NULLIF(TRIM(COALESCE(${pa}.state_department, '')), '') IS NOT NULL
                            AND (
                                NULLIF(TRIM(COALESCE(${pa}.ministry, '')), '') IS NULL
                                OR LOWER(TRIM(COALESCE(${pa}.ministry, ''))) = LOWER(TRIM(COALESCE(s.ministry, '')))
                                OR regexp_replace(
                                    regexp_replace(
                                        regexp_replace(LOWER(TRIM(COALESCE(${pa}.ministry, ''))), '^ministry\\s+of\\s+', '', 'g'),
                                        '\\s*\\([^)]*\\)\\s*',
                                        '',
                                        'g'
                                    ),
                                    '\\m(and|the)\\M',
                                    '',
                                    'g'
                                ) = regexp_replace(
                                    regexp_replace(
                                        regexp_replace(LOWER(TRIM(COALESCE(s.ministry, ''))), '^ministry\\s+of\\s+', '', 'g'),
                                        '\\s*\\([^)]*\\)\\s*',
                                        '',
                                        'g'
                                    ),
                                    '\\m(and|the)\\M',
                                    '',
                                    'g'
                                )
                                OR regexp_replace(
                                    regexp_replace(
                                        regexp_replace(
                                            regexp_replace(LOWER(TRIM(COALESCE(${pa}.ministry, ''))), '^ministry\\s+of\\s+', '', 'g'),
                                            '\\s*\\([^)]*\\)\\s*',
                                            '',
                                            'g'
                                        ),
                                        '\\m(and|the)\\M',
                                        '',
                                        'g'
                                    ),
                                    '[^a-z0-9]+',
                                    '',
                                    'g'
                                ) LIKE '%' || regexp_replace(
                                    regexp_replace(
                                        regexp_replace(
                                            regexp_replace(LOWER(TRIM(COALESCE(s.ministry, ''))), '^ministry\\s+of\\s+', '', 'g'),
                                            '\\s*\\([^)]*\\)\\s*',
                                            '',
                                            'g'
                                        ),
                                        '\\m(and|the)\\M',
                                        '',
                                        'g'
                                    ),
                                    '[^a-z0-9]+',
                                    '',
                                    'g'
                                ) || '%'
                            )
                            AND (
                                LOWER(TRIM(COALESCE(${pa}.state_department, ''))) = LOWER(TRIM(COALESCE(s.state_department, '')))
                                OR regexp_replace(
                                    regexp_replace(
                                        regexp_replace(LOWER(TRIM(COALESCE(${pa}.state_department, ''))), '^state\\s+department\\s+of\\s+', '', 'g'),
                                        '\\s*\\([^)]*\\)\\s*',
                                        '',
                                        'g'
                                    ),
                                    '\\m(and|the)\\M',
                                    '',
                                    'g'
                                ) = regexp_replace(
                                    regexp_replace(
                                        regexp_replace(LOWER(TRIM(COALESCE(s.state_department, ''))), '^state\\s+department\\s+of\\s+', '', 'g'),
                                        '\\s*\\([^)]*\\)\\s*',
                                        '',
                                        'g'
                                    ),
                                    '\\m(and|the)\\M',
                                    '',
                                    'g'
                                )
                                OR regexp_replace(
                                    regexp_replace(
                                        regexp_replace(
                                            regexp_replace(LOWER(TRIM(COALESCE(${pa}.state_department, ''))), '^state\\s+department\\s+of\\s+', '', 'g'),
                                            '\\s*\\([^)]*\\)\\s*',
                                            '',
                                            'g'
                                        ),
                                        '\\m(and|the)\\M',
                                        '',
                                        'g'
                                    ),
                                    '[^a-z0-9]+',
                                    '',
                                    'g'
                                ) LIKE '%' || regexp_replace(
                                    regexp_replace(
                                        regexp_replace(
                                            regexp_replace(LOWER(TRIM(COALESCE(s.state_department, ''))), '^state\\s+department\\s+of\\s+', '', 'g'),
                                            '\\s*\\([^)]*\\)\\s*',
                                            '',
                                            'g'
                                        ),
                                        '\\m(and|the)\\M',
                                        '',
                                        'g'
                                    ),
                                    '[^a-z0-9]+',
                                    '',
                                    'g'
                                ) || '%'
                            )
                        )
                        OR (
                            -- Match county directorates/department names even when the user scope uses
                            -- a shorter national-style state department name.
                            NULLIF(TRIM(COALESCE(s.state_department, '')), '') IS NOT NULL
                            AND EXISTS (
                                SELECT 1
                                FROM regexp_split_to_table(
                                    regexp_replace(LOWER(TRIM(COALESCE(s.state_department, ''))), '[^a-z0-9]+', ' ', 'g'),
                                    '\\s+'
                                ) AS scope_token(token)
                                WHERE LENGTH(scope_token.token) >= 3
                                  AND scope_token.token NOT IN (
                                      'and', 'the', 'for', 'of', 'state', 'department', 'ministry',
                                      'county', 'government', 'development', 'services', 'service',
                                      'directorate', 'planning', 'management', 'administration'
                                  )
                                  AND (
                                      regexp_replace(LOWER(TRIM(COALESCE(${pa}.state_department, ''))), '[^a-z0-9]+', ' ', 'g')
                                          LIKE '%' || scope_token.token || '%'
                                      OR regexp_replace(LOWER(TRIM(COALESCE(${pa}.implementing_agency, ''))), '[^a-z0-9]+', ' ', 'g')
                                          LIKE '%' || scope_token.token || '%'
                                  )
                            )
                        )
                        OR EXISTS (
                            SELECT 1
                            FROM ministries m
                            JOIN departments d ON d."ministryId" = m."ministryId" AND COALESCE(d.voided, false) = false
                            WHERE COALESCE(m.voided, false) = false
                              AND (
                                    LOWER(TRIM(COALESCE(s.ministry, ''))) = LOWER(TRIM(COALESCE(m.name, '')))
                                    OR EXISTS (
                                        SELECT 1
                                        FROM unnest(string_to_array(COALESCE(m.alias, ''), ',')) AS ma(token)
                                        WHERE LOWER(TRIM(COALESCE(s.ministry, ''))) = LOWER(TRIM(COALESCE(ma.token, '')))
                                    )
                                    OR regexp_replace(LOWER(TRIM(COALESCE(s.ministry, ''))), '[^a-z0-9]+', '', 'g')
                                       = regexp_replace(LOWER(TRIM(COALESCE(m.name, ''))), '[^a-z0-9]+', '', 'g')
                                    OR regexp_replace(
                                        regexp_replace(
                                            regexp_replace(LOWER(TRIM(COALESCE(s.ministry, ''))), '^ministry\\s+of\\s+', '', 'g'),
                                            '\\s*\\([^)]*\\)\\s*',
                                            '',
                                            'g'
                                        ),
                                        '\\m(and|the)\\M',
                                        '',
                                        'g'
                                    ) = regexp_replace(
                                        regexp_replace(
                                            regexp_replace(LOWER(TRIM(COALESCE(m.name, ''))), '^ministry\\s+of\\s+', '', 'g'),
                                            '\\s*\\([^)]*\\)\\s*',
                                            '',
                                            'g'
                                        ),
                                        '\\m(and|the)\\M',
                                        '',
                                        'g'
                                    )
                                    OR regexp_replace(
                                        regexp_replace(
                                            regexp_replace(
                                                regexp_replace(LOWER(TRIM(COALESCE(s.ministry, ''))), '^ministry\\s+of\\s+', '', 'g'),
                                                '\\s*\\([^)]*\\)\\s*',
                                                '',
                                                'g'
                                            ),
                                            '\\m(and|the)\\M',
                                            '',
                                            'g'
                                        ),
                                        '[^a-z0-9]+',
                                        '',
                                        'g'
                                    ) LIKE '%' || regexp_replace(
                                        regexp_replace(
                                            regexp_replace(
                                                regexp_replace(LOWER(TRIM(COALESCE(m.name, ''))), '^ministry\\s+of\\s+', '', 'g'),
                                                '\\s*\\([^)]*\\)\\s*',
                                                '',
                                                'g'
                                            ),
                                            '\\m(and|the)\\M',
                                            '',
                                            'g'
                                        ),
                                        '[^a-z0-9]+',
                                        '',
                                        'g'
                                    ) || '%'
                              )
                              AND (
                                    LOWER(TRIM(COALESCE(s.state_department, ''))) = LOWER(TRIM(COALESCE(d.name, '')))
                                    OR EXISTS (
                                        SELECT 1
                                        FROM unnest(string_to_array(COALESCE(d.alias, ''), ',')) AS da(token)
                                        WHERE LOWER(TRIM(COALESCE(s.state_department, ''))) = LOWER(TRIM(COALESCE(da.token, '')))
                                    )
                                    OR regexp_replace(LOWER(TRIM(COALESCE(s.state_department, ''))), '[^a-z0-9]+', '', 'g')
                                       = regexp_replace(LOWER(TRIM(COALESCE(d.name, ''))), '[^a-z0-9]+', '', 'g')
                                    OR regexp_replace(
                                        regexp_replace(
                                            regexp_replace(LOWER(TRIM(COALESCE(s.state_department, ''))), '^state\\s+department\\s+of\\s+', '', 'g'),
                                            '\\s*\\([^)]*\\)\\s*',
                                            '',
                                            'g'
                                        ),
                                        '\\m(and|the)\\M',
                                        '',
                                        'g'
                                    ) = regexp_replace(
                                        regexp_replace(
                                            regexp_replace(LOWER(TRIM(COALESCE(d.name, ''))), '^state\\s+department\\s+of\\s+', '', 'g'),
                                            '\\s*\\([^)]*\\)\\s*',
                                            '',
                                            'g'
                                        ),
                                        '\\m(and|the)\\M',
                                        '',
                                        'g'
                                    )
                                    OR regexp_replace(
                                        regexp_replace(
                                            regexp_replace(
                                                regexp_replace(LOWER(TRIM(COALESCE(s.state_department, ''))), '^state\\s+department\\s+of\\s+', '', 'g'),
                                                '\\s*\\([^)]*\\)\\s*',
                                                '',
                                                'g'
                                            ),
                                            '\\m(and|the)\\M',
                                            '',
                                            'g'
                                        ),
                                        '[^a-z0-9]+',
                                        '',
                                        'g'
                                    ) LIKE '%' || regexp_replace(
                                        regexp_replace(
                                            regexp_replace(
                                                regexp_replace(LOWER(TRIM(COALESCE(d.name, ''))), '^state\\s+department\\s+of\\s+', '', 'g'),
                                                '\\s*\\([^)]*\\)\\s*',
                                                '',
                                                'g'
                                            ),
                                            '\\m(and|the)\\M',
                                            '',
                                            'g'
                                        ),
                                        '[^a-z0-9]+',
                                        '',
                                        'g'
                                    ) || '%'
                              )
                              AND (
                                    (
                                        NULLIF(TRIM(COALESCE(${pa}.ministry, '')), '') IS NOT NULL
                                        AND (
                                            LOWER(TRIM(COALESCE(${pa}.ministry, ''))) = LOWER(TRIM(COALESCE(m.name, '')))
                                            OR EXISTS (
                                                SELECT 1
                                                FROM unnest(string_to_array(COALESCE(m.alias, ''), ',')) AS mb(token)
                                                WHERE LOWER(TRIM(COALESCE(${pa}.ministry, ''))) = LOWER(TRIM(COALESCE(mb.token, '')))
                                            )
                                            OR regexp_replace(LOWER(TRIM(COALESCE(${pa}.ministry, ''))), '[^a-z0-9]+', '', 'g')
                                               = regexp_replace(LOWER(TRIM(COALESCE(m.name, ''))), '[^a-z0-9]+', '', 'g')
                                            OR regexp_replace(
                                                regexp_replace(
                                                    regexp_replace(LOWER(TRIM(COALESCE(${pa}.ministry, ''))), '^ministry\\s+of\\s+', '', 'g'),
                                                    '\\s*\\([^)]*\\)\\s*',
                                                    '',
                                                    'g'
                                                ),
                                                '\\m(and|the)\\M',
                                                '',
                                                'g'
                                            ) = regexp_replace(
                                                regexp_replace(
                                                    regexp_replace(LOWER(TRIM(COALESCE(m.name, ''))), '^ministry\\s+of\\s+', '', 'g'),
                                                    '\\s*\\([^)]*\\)\\s*',
                                                    '',
                                                    'g'
                                                ),
                                                '\\m(and|the)\\M',
                                                '',
                                                'g'
                                            )
                                            OR regexp_replace(
                                                regexp_replace(
                                                    regexp_replace(
                                                        regexp_replace(LOWER(TRIM(COALESCE(${pa}.ministry, ''))), '^ministry\\s+of\\s+', '', 'g'),
                                                        '\\s*\\([^)]*\\)\\s*',
                                                        '',
                                                        'g'
                                                    ),
                                                    '\\m(and|the)\\M',
                                                    '',
                                                    'g'
                                                ),
                                                '[^a-z0-9]+',
                                                '',
                                                'g'
                                            ) LIKE '%' || regexp_replace(
                                                regexp_replace(
                                                    regexp_replace(
                                                        regexp_replace(LOWER(TRIM(COALESCE(m.name, ''))), '^ministry\\s+of\\s+', '', 'g'),
                                                        '\\s*\\([^)]*\\)\\s*',
                                                        '',
                                                        'g'
                                                    ),
                                                    '\\m(and|the)\\M',
                                                    '',
                                                    'g'
                                                ),
                                                '[^a-z0-9]+',
                                                '',
                                                'g'
                                            ) || '%'
                                        )
                                    )
                                    OR (
                                        NULLIF(TRIM(COALESCE(${pa}.ministry, '')), '') IS NULL
                                        AND NULLIF(TRIM(COALESCE(${pa}.state_department, '')), '') IS NOT NULL
                                    )
                              )
                              AND (
                                    LOWER(TRIM(COALESCE(${pa}.state_department, ''))) = LOWER(TRIM(COALESCE(d.name, '')))
                                    OR EXISTS (
                                        SELECT 1
                                        FROM unnest(string_to_array(COALESCE(d.alias, ''), ',')) AS db(token)
                                        WHERE LOWER(TRIM(COALESCE(${pa}.state_department, ''))) = LOWER(TRIM(COALESCE(db.token, '')))
                                    )
                                    OR regexp_replace(LOWER(TRIM(COALESCE(${pa}.state_department, ''))), '[^a-z0-9]+', '', 'g')
                                       = regexp_replace(LOWER(TRIM(COALESCE(d.name, ''))), '[^a-z0-9]+', '', 'g')
                                    OR regexp_replace(
                                        regexp_replace(
                                            regexp_replace(LOWER(TRIM(COALESCE(${pa}.state_department, ''))), '^state\\s+department\\s+of\\s+', '', 'g'),
                                            '\\s*\\([^)]*\\)\\s*',
                                            '',
                                            'g'
                                        ),
                                        '\\m(and|the)\\M',
                                        '',
                                        'g'
                                    ) LIKE '%' || regexp_replace(
                                        regexp_replace(
                                            regexp_replace(LOWER(TRIM(COALESCE(d.name, ''))), '^state\\s+department\\s+of\\s+', '', 'g'),
                                            '\\s*\\([^)]*\\)\\s*',
                                            '',
                                            'g'
                                        ),
                                        '\\m(and|the)\\M',
                                        '',
                                        'g'
                                    ) || '%'
                              )
                        )
                    ))
                )
            )
        )
        OR (
            NOT EXISTS (
                SELECT 1
                FROM user_project_scopes ps_profile_guard
                WHERE ps_profile_guard.user_id = ?
                  AND COALESCE(ps_profile_guard.voided, false) = false
            )
            AND
            NOT EXISTS (
                SELECT 1
                FROM user_organization_scope s0
                LEFT JOIN agencies ag0 ON s0.agency_id = ag0.id AND COALESCE(ag0.voided, false) = false
                WHERE s0.user_id = ?
                  AND (
                        (LOWER(TRIM(COALESCE(s0.scope_type, ''))) = 'agency' AND ag0.id IS NOT NULL)
                        OR (
                            LOWER(TRIM(COALESCE(s0.scope_type, ''))) = 'ministry_all'
                            AND (
                                LOWER(TRIM(COALESCE(s0.ministry, ''))) IN ('*', 'all')
                                OR EXISTS (
                                    SELECT 1
                                    FROM ministries m0
                                    WHERE COALESCE(m0.voided, false) = false
                                      AND (
                                            LOWER(TRIM(COALESCE(s0.ministry, ''))) = LOWER(TRIM(COALESCE(m0.name, '')))
                                            OR LOWER(TRIM(COALESCE(s0.ministry, ''))) = LOWER(TRIM(COALESCE(m0.alias, '')))
                                      )
                                )
                            )
                        )
                        OR (
                            LOWER(TRIM(COALESCE(s0.scope_type, ''))) = 'state_department_all'
                            AND EXISTS (
                                SELECT 1
                                FROM ministries m0
                                JOIN departments d0 ON d0."ministryId" = m0."ministryId" AND COALESCE(d0.voided, false) = false
                                WHERE COALESCE(m0.voided, false) = false
                                  AND (
                                        LOWER(TRIM(COALESCE(s0.ministry, ''))) = LOWER(TRIM(COALESCE(m0.name, '')))
                                        OR EXISTS (
                                            SELECT 1
                                            FROM unnest(string_to_array(COALESCE(m0.alias, ''), ',')) AS m0a(token)
                                            WHERE LOWER(TRIM(COALESCE(s0.ministry, ''))) = LOWER(TRIM(COALESCE(m0a.token, '')))
                                        )
                                        OR regexp_replace(LOWER(TRIM(COALESCE(s0.ministry, ''))), '[^a-z0-9]+', '', 'g')
                                           = regexp_replace(LOWER(TRIM(COALESCE(m0.name, ''))), '[^a-z0-9]+', '', 'g')
                                        OR regexp_replace(
                                            regexp_replace(
                                                regexp_replace(LOWER(TRIM(COALESCE(s0.ministry, ''))), '^ministry\\s+of\\s+', '', 'g'),
                                                '\\s*\\([^)]*\\)\\s*',
                                                '',
                                                'g'
                                            ),
                                            '\\m(and|the)\\M',
                                            '',
                                            'g'
                                        ) LIKE '%' || regexp_replace(
                                            regexp_replace(
                                                regexp_replace(LOWER(TRIM(COALESCE(m0.name, ''))), '^ministry\\s+of\\s+', '', 'g'),
                                                '\\s*\\([^)]*\\)\\s*',
                                                '',
                                                'g'
                                            ),
                                            '\\m(and|the)\\M',
                                            '',
                                            'g'
                                        ) || '%'
                                  )
                                  AND (
                                        LOWER(TRIM(COALESCE(s0.state_department, ''))) = LOWER(TRIM(COALESCE(d0.name, '')))
                                        OR EXISTS (
                                            SELECT 1
                                            FROM unnest(string_to_array(COALESCE(d0.alias, ''), ',')) AS d0a(token)
                                            WHERE LOWER(TRIM(COALESCE(s0.state_department, ''))) = LOWER(TRIM(COALESCE(d0a.token, '')))
                                        )
                                        OR regexp_replace(LOWER(TRIM(COALESCE(s0.state_department, ''))), '[^a-z0-9]+', '', 'g')
                                           = regexp_replace(LOWER(TRIM(COALESCE(d0.name, ''))), '[^a-z0-9]+', '', 'g')
                                        OR regexp_replace(
                                            regexp_replace(
                                                regexp_replace(LOWER(TRIM(COALESCE(s0.state_department, ''))), '^state\\s+department\\s+of\\s+', '', 'g'),
                                                '\\s*\\([^)]*\\)\\s*',
                                                '',
                                                'g'
                                            ),
                                            '\\m(and|the)\\M',
                                            '',
                                            'g'
                                        ) LIKE '%' || regexp_replace(
                                            regexp_replace(
                                                regexp_replace(LOWER(TRIM(COALESCE(d0.name, ''))), '^state\\s+department\\s+of\\s+', '', 'g'),
                                                '\\s*\\([^)]*\\)\\s*',
                                                '',
                                                'g'
                                            ),
                                            '\\m(and|the)\\M',
                                            '',
                                            'g'
                                        ) || '%'
                                  )
                            )
                        )
                        OR LOWER(TRIM(COALESCE(s0.scope_type, ''))) = 'all_ministries'
                  )
            )
            AND EXISTS (
                SELECT 1
                FROM users u
                LEFT JOIN agencies ag ON u.agency_id = ag.id AND COALESCE(ag.voided, false) = false
                WHERE u.userid = ?
                  AND COALESCE(u.voided, false) = false
                  AND (
                        (
                            NULLIF(TRIM(COALESCE(u.ministry, '')), '') IS NOT NULL
                            AND NULLIF(TRIM(COALESCE(u.state_department, '')), '') IS NOT NULL
                            AND (
                                LOWER(TRIM(COALESCE(${pa}.ministry, ''))) = LOWER(TRIM(COALESCE(u.ministry, '')))
                                OR regexp_replace(
                                    regexp_replace(
                                        regexp_replace(LOWER(TRIM(COALESCE(${pa}.ministry, ''))), '^ministry\\s+of\\s+', '', 'g'),
                                        '\\s*\\([^)]*\\)\\s*',
                                        '',
                                        'g'
                                    ),
                                    '\\m(and|the)\\M',
                                    '',
                                    'g'
                                ) = regexp_replace(
                                    regexp_replace(
                                        regexp_replace(LOWER(TRIM(COALESCE(u.ministry, ''))), '^ministry\\s+of\\s+', '', 'g'),
                                        '\\s*\\([^)]*\\)\\s*',
                                        '',
                                        'g'
                                    ),
                                    '\\m(and|the)\\M',
                                    '',
                                    'g'
                                )
                                OR regexp_replace(
                                    regexp_replace(
                                        regexp_replace(
                                            regexp_replace(LOWER(TRIM(COALESCE(${pa}.ministry, ''))), '^ministry\\s+of\\s+', '', 'g'),
                                            '\\s*\\([^)]*\\)\\s*',
                                            '',
                                            'g'
                                        ),
                                        '\\m(and|the)\\M',
                                        '',
                                        'g'
                                    ),
                                    '[^a-z0-9]+',
                                    '',
                                    'g'
                                ) LIKE '%' || regexp_replace(
                                    regexp_replace(
                                        regexp_replace(
                                            regexp_replace(LOWER(TRIM(COALESCE(u.ministry, ''))), '^ministry\\s+of\\s+', '', 'g'),
                                            '\\s*\\([^)]*\\)\\s*',
                                            '',
                                            'g'
                                        ),
                                        '\\m(and|the)\\M',
                                        '',
                                        'g'
                                    ),
                                    '[^a-z0-9]+',
                                    '',
                                    'g'
                                ) || '%'
                            )
                            AND (
                                LOWER(TRIM(COALESCE(${pa}.state_department, ''))) = LOWER(TRIM(COALESCE(u.state_department, '')))
                                OR regexp_replace(
                                    regexp_replace(
                                        regexp_replace(LOWER(TRIM(COALESCE(${pa}.state_department, ''))), '^state\\s+department\\s+(of|for)\\s+', '', 'g'),
                                        '\\s*\\([^)]*\\)\\s*',
                                        '',
                                        'g'
                                    ),
                                    '\\m(and|the)\\M',
                                    '',
                                    'g'
                                ) = regexp_replace(
                                    regexp_replace(
                                        regexp_replace(LOWER(TRIM(COALESCE(u.state_department, ''))), '^state\\s+department\\s+(of|for)\\s+', '', 'g'),
                                        '\\s*\\([^)]*\\)\\s*',
                                        '',
                                        'g'
                                    ),
                                    '\\m(and|the)\\M',
                                    '',
                                    'g'
                                )
                                OR regexp_replace(
                                    regexp_replace(
                                        regexp_replace(
                                            regexp_replace(LOWER(TRIM(COALESCE(${pa}.state_department, ''))), '^state\\s+department\\s+(of|for)\\s+', '', 'g'),
                                            '\\s*\\([^)]*\\)\\s*',
                                            '',
                                            'g'
                                        ),
                                        '\\m(and|the)\\M',
                                        '',
                                        'g'
                                    ),
                                    '[^a-z0-9]+',
                                    '',
                                    'g'
                                ) LIKE '%' || regexp_replace(
                                    regexp_replace(
                                        regexp_replace(
                                            regexp_replace(LOWER(TRIM(COALESCE(u.state_department, ''))), '^state\\s+department\\s+(of|for)\\s+', '', 'g'),
                                            '\\s*\\([^)]*\\)\\s*',
                                            '',
                                            'g'
                                        ),
                                        '\\m(and|the)\\M',
                                        '',
                                        'g'
                                    ),
                                    '[^a-z0-9]+',
                                    '',
                                    'g'
                                ) || '%'
                                OR EXISTS (
                                    SELECT 1
                                    FROM ministries mu
                                    JOIN departments du ON du."ministryId" = mu."ministryId" AND COALESCE(du.voided, false) = false
                                    WHERE COALESCE(mu.voided, false) = false
                                      AND (
                                            LOWER(TRIM(COALESCE(u.ministry, ''))) = LOWER(TRIM(COALESCE(mu.name, '')))
                                            OR EXISTS (
                                                SELECT 1
                                                FROM unnest(string_to_array(COALESCE(mu.alias, ''), ',')) AS mua(token)
                                                WHERE LOWER(TRIM(COALESCE(u.ministry, ''))) = LOWER(TRIM(COALESCE(mua.token, '')))
                                            )
                                            OR regexp_replace(LOWER(TRIM(COALESCE(u.ministry, ''))), '[^a-z0-9]+', '', 'g')
                                               = regexp_replace(LOWER(TRIM(COALESCE(mu.name, ''))), '[^a-z0-9]+', '', 'g')
                                      )
                                      AND (
                                            LOWER(TRIM(COALESCE(u.state_department, ''))) = LOWER(TRIM(COALESCE(du.name, '')))
                                            OR EXISTS (
                                                SELECT 1
                                                FROM unnest(string_to_array(COALESCE(du.alias, ''), ',')) AS dua(token)
                                                WHERE LOWER(TRIM(COALESCE(u.state_department, ''))) = LOWER(TRIM(COALESCE(dua.token, '')))
                                            )
                                            OR regexp_replace(LOWER(TRIM(COALESCE(u.state_department, ''))), '[^a-z0-9]+', '', 'g')
                                               = regexp_replace(LOWER(TRIM(COALESCE(du.name, ''))), '[^a-z0-9]+', '', 'g')
                                      )
                                      AND (
                                            LOWER(TRIM(COALESCE(${pa}.ministry, ''))) = LOWER(TRIM(COALESCE(mu.name, '')))
                                            OR EXISTS (
                                                SELECT 1
                                                FROM unnest(string_to_array(COALESCE(mu.alias, ''), ',')) AS mub(token)
                                                WHERE LOWER(TRIM(COALESCE(${pa}.ministry, ''))) = LOWER(TRIM(COALESCE(mub.token, '')))
                                            )
                                            OR regexp_replace(LOWER(TRIM(COALESCE(${pa}.ministry, ''))), '[^a-z0-9]+', '', 'g')
                                               = regexp_replace(LOWER(TRIM(COALESCE(mu.name, ''))), '[^a-z0-9]+', '', 'g')
                                      )
                                      AND (
                                            LOWER(TRIM(COALESCE(${pa}.state_department, ''))) = LOWER(TRIM(COALESCE(du.name, '')))
                                            OR EXISTS (
                                                SELECT 1
                                                FROM unnest(string_to_array(COALESCE(du.alias, ''), ',')) AS dub(token)
                                                WHERE LOWER(TRIM(COALESCE(${pa}.state_department, ''))) = LOWER(TRIM(COALESCE(dub.token, '')))
                                            )
                                            OR regexp_replace(LOWER(TRIM(COALESCE(${pa}.state_department, ''))), '[^a-z0-9]+', '', 'g')
                                               = regexp_replace(LOWER(TRIM(COALESCE(du.name, ''))), '[^a-z0-9]+', '', 'g')
                                      )
                                )
                            )
                        )
                        OR (
                            -- Users without explicit scope rows should still be limited by
                            -- their profile department. County project data often stores that
                            -- department as a longer department/section name.
                            NULLIF(TRIM(COALESCE(u.state_department, '')), '') IS NOT NULL
                            AND EXISTS (
                                SELECT 1
                                FROM regexp_split_to_table(
                                    regexp_replace(LOWER(TRIM(COALESCE(u.state_department, ''))), '[^a-z0-9]+', ' ', 'g'),
                                    '\\s+'
                                ) AS profile_dept_token(token)
                                WHERE LENGTH(profile_dept_token.token) >= 3
                                  AND profile_dept_token.token NOT IN (
                                      'and', 'the', 'for', 'of', 'state', 'department', 'ministry',
                                      'county', 'government', 'development', 'services', 'service',
                                      'directorate', 'planning', 'management', 'administration'
                                  )
                                  AND (
                                      regexp_replace(LOWER(TRIM(COALESCE(${pa}.state_department, ''))), '[^a-z0-9]+', ' ', 'g')
                                          LIKE '%' || profile_dept_token.token || '%'
                                      OR regexp_replace(LOWER(TRIM(COALESCE(${pa}.implementing_agency, ''))), '[^a-z0-9]+', ' ', 'g')
                                          LIKE '%' || profile_dept_token.token || '%'
                                  )
                            )
                        )
                        OR (
                            NULLIF(TRIM(COALESCE(u.ministry, '')), '') IS NOT NULL
                            AND NULLIF(TRIM(COALESCE(u.state_department, '')), '') IS NULL
                            AND (
                                LOWER(TRIM(COALESCE(${pa}.ministry, ''))) = LOWER(TRIM(COALESCE(u.ministry, '')))
                                OR regexp_replace(
                                    regexp_replace(
                                        regexp_replace(LOWER(TRIM(COALESCE(${pa}.ministry, ''))), '^ministry\\s+of\\s+', '', 'g'),
                                        '\\s*\\([^)]*\\)\\s*',
                                        '',
                                        'g'
                                    ),
                                    '\\m(and|the)\\M',
                                    '',
                                    'g'
                                ) = regexp_replace(
                                    regexp_replace(
                                        regexp_replace(LOWER(TRIM(COALESCE(u.ministry, ''))), '^ministry\\s+of\\s+', '', 'g'),
                                        '\\s*\\([^)]*\\)\\s*',
                                        '',
                                        'g'
                                    ),
                                    '\\m(and|the)\\M',
                                    '',
                                    'g'
                                )
                                OR regexp_replace(
                                    regexp_replace(
                                        regexp_replace(
                                            regexp_replace(LOWER(TRIM(COALESCE(${pa}.ministry, ''))), '^ministry\\s+of\\s+', '', 'g'),
                                            '\\s*\\([^)]*\\)\\s*',
                                            '',
                                            'g'
                                        ),
                                        '\\m(and|the)\\M',
                                        '',
                                        'g'
                                    ),
                                    '[^a-z0-9]+',
                                    '',
                                    'g'
                                ) LIKE '%' || regexp_replace(
                                    regexp_replace(
                                        regexp_replace(
                                            regexp_replace(LOWER(TRIM(COALESCE(u.ministry, ''))), '^ministry\\s+of\\s+', '', 'g'),
                                            '\\s*\\([^)]*\\)\\s*',
                                            '',
                                            'g'
                                        ),
                                        '\\m(and|the)\\M',
                                        '',
                                        'g'
                                    ),
                                    '[^a-z0-9]+',
                                    '',
                                    'g'
                                ) || '%'
                                OR EXISTS (
                                    SELECT 1
                                    FROM ministries mu
                                    WHERE COALESCE(mu.voided, false) = false
                                      AND (
                                            LOWER(TRIM(COALESCE(u.ministry, ''))) = LOWER(TRIM(COALESCE(mu.name, '')))
                                            OR EXISTS (
                                                SELECT 1
                                                FROM unnest(string_to_array(COALESCE(mu.alias, ''), ',')) AS mua(token)
                                                WHERE LOWER(TRIM(COALESCE(u.ministry, ''))) = LOWER(TRIM(COALESCE(mua.token, '')))
                                            )
                                            OR regexp_replace(LOWER(TRIM(COALESCE(u.ministry, ''))), '[^a-z0-9]+', '', 'g')
                                               = regexp_replace(LOWER(TRIM(COALESCE(mu.name, ''))), '[^a-z0-9]+', '', 'g')
                                      )
                                      AND (
                                            LOWER(TRIM(COALESCE(${pa}.ministry, ''))) = LOWER(TRIM(COALESCE(mu.name, '')))
                                            OR EXISTS (
                                                SELECT 1
                                                FROM unnest(string_to_array(COALESCE(mu.alias, ''), ',')) AS mub(token)
                                                WHERE LOWER(TRIM(COALESCE(${pa}.ministry, ''))) = LOWER(TRIM(COALESCE(mub.token, '')))
                                            )
                                            OR regexp_replace(LOWER(TRIM(COALESCE(${pa}.ministry, ''))), '[^a-z0-9]+', '', 'g')
                                               = regexp_replace(LOWER(TRIM(COALESCE(mu.name, ''))), '[^a-z0-9]+', '', 'g')
                                      )
                                )
                            )
                        )
                        OR (
                            ag.id IS NOT NULL
                            AND (
                                LOWER(TRIM(COALESCE(${pa}.implementing_agency, ''))) = LOWER(TRIM(COALESCE(ag.agency_name, '')))
                                OR (
                                    NULLIF(TRIM(COALESCE(${pa}.implementing_agency, '')), '') IS NULL
                                    AND NULLIF(TRIM(COALESCE(ag.ministry, '')), '') IS NOT NULL
                                    AND NULLIF(TRIM(COALESCE(ag.state_department, '')), '') IS NOT NULL
                                    AND LOWER(TRIM(COALESCE(${pa}.ministry, ''))) = LOWER(TRIM(COALESCE(ag.ministry, '')))
                                    AND LOWER(TRIM(COALESCE(${pa}.state_department, ''))) = LOWER(TRIM(COALESCE(ag.state_department, '')))
                                )
                            )
                        )
                  )
            )
        )
    )`;
}

function projectScopeParamTriple(userId) {
    const uid = parseInt(String(userId), 10);
    return [uid, uid, uid, uid, uid, uid];
}

function explicitProjectScopeParams(userId) {
    const uid = parseInt(String(userId), 10);
    return [uid];
}

/**
 * Append to `WHERE p.project_id = $1 AND p.voided = false` for single-project fetch.
 */
function appendSingleProjectScopeWhereClause(baseQuery) {
    const frag = buildProjectListScopeFragment('p');
    let n = 2;
    const fragPg = frag.replace(/\?/g, () => `$${n++}`);
    return baseQuery.replace(
        /WHERE\s+p\.project_id\s*=\s*\$1\s+AND\s+p\.voided\s*=\s*false/i,
        `WHERE p.project_id = $1 AND p.voided = false AND ${fragPg}`
    );
}

function singleProjectScopeParams(projectId, userId) {
    const pid = parseInt(String(projectId), 10);
    const uid = parseInt(String(userId), 10);
    return [pid, uid, uid, uid, uid, uid, uid];
}

/**
 * Agencies list: restrict rows to those visible to the user.
 * Uses ? ? ? for user id three times; plug into existing $-style query by converting via pool.execute.
 */
function buildAgenciesScopeFragment() {
    return `(
        EXISTS (
            SELECT 1 FROM user_organization_scope s
            WHERE s.user_id = ?
            AND (
                (s.scope_type = 'AGENCY' AND s.agency_id = agencies.id)
                OR (s.scope_type = 'MINISTRY_ALL'
                    AND (
                        LOWER(TRIM(COALESCE(s.ministry, ''))) IN ('*', 'all')
                        OR TRIM(COALESCE(agencies.ministry, '')) = TRIM(COALESCE(s.ministry, ''))
                    ))
                OR (s.scope_type = 'ALL_MINISTRIES')
                OR (s.scope_type = 'STATE_DEPARTMENT_ALL'
                    AND TRIM(COALESCE(agencies.ministry, '')) = TRIM(COALESCE(s.ministry, ''))
                    AND TRIM(COALESCE(agencies.state_department, '')) = TRIM(COALESCE(s.state_department, '')))
            )
        )
        OR (
            NOT EXISTS (
                SELECT 1
                FROM user_organization_scope s0
                LEFT JOIN agencies ag0 ON s0.agency_id = ag0.id AND COALESCE(ag0.voided, false) = false
                WHERE s0.user_id = ?
                  AND (
                        (LOWER(TRIM(COALESCE(s0.scope_type, ''))) = 'agency' AND ag0.id IS NOT NULL)
                        OR LOWER(TRIM(COALESCE(s0.scope_type, ''))) IN ('ministry_all', 'state_department_all', 'all_ministries')
                  )
            )
            AND EXISTS (
                SELECT 1 FROM users u
                WHERE u.userid = ? AND COALESCE(u.voided, false) = false
                AND u.agency_id = agencies.id
            )
        )
    )`;
}

module.exports = {
    SCOPE_TYPES,
    PROJECT_SCOPE_TYPES,
    BYPASS_PRIVILEGE,
    ensureScopeSchema,
    organizationScopeTableExists,
    userHasOrganizationBypass,
    normalizeScopeInput,
    normalizeProjectScopeInput,
    normalizeDepartmentSectorMappingInput,
    fetchOrganizationScopesForUser,
    fetchOrganizationScopesForUsers,
    fetchProjectScopesForUser,
    fetchProjectScopesForUsers,
    replaceUserOrganizationScopes,
    replaceUserProjectScopes,
    userHasProjectAccessScopeContext,
    fetchDepartmentSectorMappings,
    replaceDepartmentSectorMappings,
    ensureDefaultAgencyScope,
    syncOrganizationScopesFromUserProfile,
    buildProjectListScopeFragment,
    buildExplicitProjectScopeFragment,
    projectScopeParamTriple,
    explicitProjectScopeParams,
    appendSingleProjectScopeWhereClause,
    singleProjectScopeParams,
    buildAgenciesScopeFragment,
};
