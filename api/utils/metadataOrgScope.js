/**
 * Optional scope for /api/metadata/departments and related lists.
 * Machakos installation: only rows tied to county seed (remarks / parent ministry).
 *
 * METADATA_ORG_SCOPE:
 *   - unset — defaults to machakos (county catalog only; this app’s default)
 *   - "all" or "" — no extra filter (national / mixed catalog)
 *   - "machakos" — departments where remarks ILIKE '%machakos_county%' OR parent ministry is
 *     "Machakos County Executive"; sections only under those departments.
 */
/** If env var is unset, default to Machakos. Explicit `all` or empty string = no filter. */
const rawScope = process.env.METADATA_ORG_SCOPE;
const METADATA_ORG_SCOPE = rawScope === undefined
    ? 'machakos'
    : String(rawScope).trim().toLowerCase();

function isMachakosMetadataScope() {
    return METADATA_ORG_SCOPE !== '' && METADATA_ORG_SCOPE !== 'all';
}

/**
 * SQL boolean expression (no leading AND) for filtering `departments` alias `deptAlias`
 * with ministries join alias `ministryAlias` (LEFT JOIN so ministry may be null).
 */
function sqlMachakosDepartmentPredicate(deptAlias = 'd', ministryAlias = 'm') {
    if (!isMachakosMetadataScope()) {
        return 'TRUE';
    }
    return `(
        COALESCE(${deptAlias}.remarks, '') ILIKE '%machakos_county%'
        OR (${ministryAlias}."ministryId" IS NOT NULL AND ${ministryAlias}.name = 'Machakos County Executive')
    )`;
}

/**
 * County org departments for metadata import / resolution — same scope as
 * GET /api/metadata/departments (Departments & Sections in Settings).
 */
async function fetchOrgDepartmentCatalogRows(pool) {
    const DB_TYPE = process.env.DB_TYPE || 'mysql';

    if (DB_TYPE === 'postgresql') {
        const { rows: colRows } = await pool.query(
            `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'departments'`
        );
        const cols = new Set(colRows.map((r) => r.column_name));

        if (cols.has('department_id')) {
            if (isMachakosMetadataScope()) {
                return [];
            }
            const result = await pool.query(`
                SELECT d.name, ''::text AS alias
                FROM departments d
                WHERE COALESCE(d.voided::text, '0') IN ('0', 'false', 'f')
                ORDER BY d.name
            `);
            return result.rows || [];
        }

        const orgPred = sqlMachakosDepartmentPredicate('d', 'm');
        const result = await pool.query(`
            SELECT d.name, d.alias
            FROM departments d
            LEFT JOIN ministries m ON m."ministryId" = d."ministryId"
            WHERE COALESCE(d.voided::text, '0') IN ('0', 'false', 'f')
              AND (${orgPred})
            ORDER BY d.name
        `);
        return result.rows || [];
    }

    if (isMachakosMetadataScope()) {
        const result = await pool.query(`
            SELECT d.name, d.alias
            FROM departments d
            LEFT JOIN ministries m ON m.ministryId = d.ministryId
            WHERE d.voided = 0
              AND (
                COALESCE(d.remarks, '') LIKE '%machakos_county%'
                OR (m.ministryId IS NOT NULL AND m.name = 'Machakos County Executive')
              )
            ORDER BY d.name
        `);
        const rows = Array.isArray(result) ? result[0] : result;
        return rows || [];
    }

    const result = await pool.query(
        'SELECT name, alias FROM departments WHERE voided = 0 ORDER BY name'
    );
    const rows = Array.isArray(result) ? result[0] : result;
    return rows || [];
}

module.exports = {
    METADATA_ORG_SCOPE,
    isMachakosMetadataScope,
    sqlMachakosDepartmentPredicate,
    fetchOrgDepartmentCatalogRows,
};
