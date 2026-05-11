/**
 * Shared ministries → departments → sections tree for auth UI, public register, and /ministries.
 * When METADATA_ORG_SCOPE is county (default machakos), departments/sections use metadataOrgScope filter.
 */
const pool = require('../config/db');
const { sqlMachakosDepartmentPredicate, isMachakosMetadataScope } = require('./metadataOrgScope');

/**
 * @param {object} [opts]
 * @param {boolean} [opts.withSections=false]
 * @returns {Promise<Array<object>>} ministries with nested `departments` (and optional `sections` per department)
 */
async function fetchMinistryDepartmentTree({ withSections = false } = {}) {
    const DB_TYPE = process.env.DB_TYPE || 'postgresql';
    if (DB_TYPE !== 'postgresql') {
        return [];
    }
    const orgPred = sqlMachakosDepartmentPredicate('d', 'm');
    const mr = await pool.query(
        `SELECT "ministryId", name, alias, voided, "createdAt", "updatedAt", "userId"
         FROM ministries
         WHERE COALESCE(voided, false) = false
         ORDER BY name`
    );
    const ministries = mr.rows || [];
    const dr = await pool.query(
        `SELECT d."departmentId", d.name, d.alias, d."ministryId", d.voided, d."createdAt", d."updatedAt"
         FROM departments d
         LEFT JOIN ministries m ON m."ministryId" = d."ministryId"
         WHERE COALESCE(d.voided, false) = false
           AND (${orgPred})
         ORDER BY d.name`
    );
    const depts = dr.rows || [];
    let sectionsByDept = new Map();
    if (withSections) {
        const sr = await pool.query(
            `SELECT s."sectionId", s.name, s.alias, s."departmentId", s.voided, s."createdAt", s."updatedAt"
             FROM sections s
             INNER JOIN departments d ON d."departmentId" = s."departmentId"
             LEFT JOIN ministries m ON m."ministryId" = d."ministryId"
             WHERE COALESCE(s.voided, false) = false
               AND (${orgPred})
             ORDER BY s.name`
        );
        const sections = sr.rows || [];
        sectionsByDept = sections.reduce((acc, section) => {
            const depId = section.departmentId;
            if (depId == null) return acc;
            if (!acc.has(depId)) acc.set(depId, []);
            acc.get(depId).push(section);
            return acc;
        }, new Map());
    }
    const byMin = new Map();
    ministries.forEach((m) => byMin.set(m.ministryId, { ...m, departments: [] }));
    depts.forEach((d) => {
        if (d.ministryId != null && byMin.has(d.ministryId)) {
            const deptPayload = withSections
                ? { ...d, sections: sectionsByDept.get(d.departmentId) || [] }
                : d;
            byMin.get(d.ministryId).departments.push(deptPayload);
        }
    });
    const rows = Array.from(byMin.values());
    /* County scope: omit cabinet rows with no in-scope departments (avoids national ministries in UI). */
    if (isMachakosMetadataScope()) {
        return rows.filter((m) => Array.isArray(m.departments) && m.departments.length > 0);
    }
    return rows;
}

module.exports = { fetchMinistryDepartmentTree };
