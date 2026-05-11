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

module.exports = {
    METADATA_ORG_SCOPE,
    isMachakosMetadataScope,
    sqlMachakosDepartmentPredicate,
};
