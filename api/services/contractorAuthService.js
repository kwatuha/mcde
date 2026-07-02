const pool = require('../config/db');

const DB_TYPE = process.env.DB_TYPE || 'postgresql';
const isPostgres = DB_TYPE === 'postgresql';

const rowsOf = (result) => {
    if (Array.isArray(result)) return result[0] || [];
    return result?.rows || [];
};

function normalizeRoleName(roleName) {
    return String(roleName || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
}

function isContractorRole(roleName) {
    return normalizeRoleName(roleName) === 'contractor';
}

/**
 * Load contractor record linked to a user account (contractors.userId).
 * @returns {Promise<object|null>}
 */
async function fetchContractorProfileForUser(userId) {
    const uid = parseInt(String(userId), 10);
    if (!Number.isFinite(uid)) return null;

    try {
        if (isPostgres) {
            const result = await pool.query(
                `SELECT
                    c."contractorId",
                    c."companyName",
                    c."contactPerson",
                    c.email,
                    c.phone,
                    c."userId",
                    c."contractorTypeId",
                    ct.name AS "contractorTypeName"
                 FROM contractors c
                 LEFT JOIN contractor_types ct
                   ON ct.contractor_type_id = c."contractorTypeId"
                  AND COALESCE(ct.voided, false) = false
                 WHERE c."userId" = $1
                   AND COALESCE(c.voided, false) = false
                 ORDER BY c."contractorId" ASC
                 LIMIT 1`,
                [uid]
            );
            const row = rowsOf(result)[0];
            return row || null;
        }

        const result = await pool.query(
            `SELECT
                c.contractorId,
                c.companyName,
                c.contactPerson,
                c.email,
                c.phone,
                c.userId,
                c.contractorTypeId,
                ct.name AS contractorTypeName
             FROM contractors c
             LEFT JOIN contractor_types ct ON ct.contractor_type_id = c.contractorTypeId AND ct.voided = 0
             WHERE c.userId = ? AND c.voided = 0
             ORDER BY c.contractorId ASC
             LIMIT 1`,
            [uid]
        );
        const row = rowsOf(result)[0];
        return row || null;
    } catch (error) {
        console.warn('fetchContractorProfileForUser:', error.message);
        return null;
    }
}

async function fetchContractorIdForUser(userId) {
    const profile = await fetchContractorProfileForUser(userId);
    if (!profile) return null;
    return profile.contractorId ?? profile.contractorid ?? null;
}

/**
 * Enrich JWT/session user object with contractor fields.
 */
async function enrichUserWithContractor(user) {
    if (!user) return user;
    const userId = user.id || user.userId || user.actualUserId;
    const profile = await fetchContractorProfileForUser(userId);
    if (!profile) {
        return {
            ...user,
            contractorId: user.contractorId || null,
            contractorProfile: user.contractorProfile || null,
        };
    }
    const contractorId = profile.contractorId ?? profile.contractorid;
    return {
        ...user,
        contractorId,
        contractorProfile: {
            contractorId,
            companyName: profile.companyName || profile.companyname || '',
            contactPerson: profile.contactPerson || profile.contactperson || '',
            email: profile.email || '',
            phone: profile.phone || '',
            contractorTypeId: profile.contractorTypeId ?? profile.contractortypeid ?? null,
            contractorTypeName: profile.contractorTypeName || profile.contractortypename || '',
        },
    };
}

function isContractorLikeUser(user) {
    if (!user) return false;
    const roleName = user.roleName || user.role || '';
    const privileges = user.privileges || [];
    return isContractorRole(roleName)
        || privileges.includes('contractor.portal')
        || user.contractorId != null;
}

/**
 * True when caller may access data for the given contractor id.
 */
function callerCanAccessContractor(req, contractorId) {
    const privileges = req.user?.privileges || [];
    if (privileges.includes('admin.access') || privileges.includes('organization.scope_bypass')) {
        return true;
    }
    if (!isContractorLikeUser(req.user)) return true;
    const ownId = req.user?.contractorId;
    return ownId != null && Number(ownId) === Number(contractorId);
}

module.exports = {
    isContractorRole,
    isContractorLikeUser,
    fetchContractorProfileForUser,
    fetchContractorIdForUser,
    enrichUserWithContractor,
    callerCanAccessContractor,
};
