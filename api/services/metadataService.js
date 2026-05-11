/**
 * Metadata Service
 * Provides cached name-to-ID mappings for departments, wards, subcounties, etc.
 * This service loads all metadata once and provides fast lookups during imports.
 */

const pool = require('../config/db');
const { sqlMachakosDepartmentPredicate } = require('../utils/metadataOrgScope');

// Normalize string for matching (same as in budgetContainerRoutes)
const normalizeStr = (v) => {
    if (typeof v !== 'string') return v;
    let normalized = v.trim();
    normalized = normalized.replace(/[''"`\u0027\u2018\u2019\u201A\u201B\u2032\u2035]/g, '');
    normalized = normalized.replace(/\s*\/\s*/g, '/');
    normalized = normalized.replace(/\s+/g, ' ');
    return normalized;
};

// Normalize alias for matching
const normalizeAlias = (v) => {
    if (typeof v !== 'string') return v;
    return normalizeStr(v)
        .replace(/[&,]/g, '')
        .replace(/\s+/g, '')
        .toLowerCase();
};

/**
 * Load all metadata into name-to-ID mapping objects
 * @returns {Promise<Object>} Object with mappings for departments, wards, subcounties, etc.
 */
async function loadMetadataMappings() {
    const startTime = Date.now();
    
    try {
        // Fetch all metadata in parallel
        const orgPred = sqlMachakosDepartmentPredicate('d', 'm');
        const deptResult = await pool.query(`
            SELECT d."departmentId", d.name, d.alias
            FROM departments d
            LEFT JOIN ministries m ON m."ministryId" = d."ministryId"
            WHERE COALESCE(d.voided::text, '0') IN ('0', 'false', 'f')
              AND (${orgPred})
        `);
        const departments = deptResult.rows;

        const [wardsRes, subRes, fyRes, budgetRes] = await Promise.all([
            pool.query(
                `SELECT "wardId", name, "subcountyId" FROM wards WHERE COALESCE(voided, false) = false`
            ),
            pool.query(
                `SELECT "subcountyId", name FROM subcounties WHERE COALESCE(voided, false) = false`
            ),
            pool.query(
                `SELECT "finYearId", "finYearName" FROM financialyears WHERE COALESCE(voided, false) = false`
            ),
            pool.query(
                `SELECT "budgetId", "budgetName", "finYearId", "departmentId" FROM budgets WHERE COALESCE(voided, false) = false`
            ),
        ]);
        const wards = wardsRes.rows;
        const subcounties = subRes.rows;
        const financialYears = fyRes.rows;
        const budgets = budgetRes.rows;
        
        // Build name-to-ID maps with normalized keys
        const departmentMap = new Map(); // normalized name -> { departmentId, name }
        const departmentAliasMap = new Map(); // normalized alias -> { departmentId, name }
        
        departments.forEach(dept => {
            if (dept.name) {
                const normalized = normalizeStr(dept.name).toLowerCase();
                departmentMap.set(normalized, { departmentId: dept.departmentId, name: dept.name });
            }
            if (dept.alias) {
                const normalized = normalizeAlias(dept.alias);
                departmentAliasMap.set(normalized, { departmentId: dept.departmentId, name: dept.name });
                // Also add individual aliases if comma-separated
                dept.alias.split(',').forEach(alias => {
                    const normAlias = normalizeStr(alias.trim()).toLowerCase();
                    if (normAlias) {
                        departmentAliasMap.set(normAlias, { departmentId: dept.departmentId, name: dept.name });
                    }
                });
            }
        });
        
        const wardMap = new Map(); // normalized name -> { wardId, subcountyId, name }
        const wardWordSetMap = new Map(); // sorted word set -> { wardId, subcountyId, name }
        wards.forEach(ward => {
            if (ward.name) {
                const normalized = normalizeStr(ward.name).toLowerCase();
                const wardInfo = { 
                    wardId: ward.wardId, 
                    subcountyId: ward.subcountyId,
                    name: ward.name 
                };
                
                // Store exact normalized name
                wardMap.set(normalized, wardInfo);
                
                // Store variations with slash replaced by space
                const withSpace = normalized.replace(/\//g, ' ');
                if (withSpace !== normalized) {
                    wardMap.set(withSpace, wardInfo);
                }
                
                // Store variations with space replaced by slash
                const withSlash = normalized.replace(/\s+/g, '/');
                if (withSlash !== normalized && withSlash !== withSpace) {
                    wardMap.set(withSlash, wardInfo);
                }
                
                // Store word set (sorted words) for order-independent matching
                // This handles cases like "AWASI/ONJIKO" vs "ONJIKO AWASI"
                const words = normalized.split(/[\s\/]+/).filter(w => w.length > 0).sort().join(' ');
                if (words && words !== normalized) {
                    wardWordSetMap.set(words, wardInfo);
                }
                
                // For compound names with slash, also store individual parts
                // e.g., "AWASI/ONJIKO" -> also try "AWASI" and "ONJIKO" separately
                if (normalized.includes('/')) {
                    const parts = normalized.split('/').map(p => p.trim()).filter(p => p.length > 0);
                    parts.forEach(part => {
                        if (part && !wardMap.has(part)) {
                            // Only add if it's a meaningful part (not too short)
                            if (part.length >= 3) {
                                wardMap.set(part, wardInfo);
                            }
                        }
                    });
                }
            }
        });
        
        const subcountyMap = new Map(); // normalized name -> { subcountyId, name }
        const subcountyWordSetMap = new Map(); // sorted word set -> { subcountyId, name }
        subcounties.forEach(subcounty => {
            if (subcounty.name) {
                const normalized = normalizeStr(subcounty.name).toLowerCase();
                const subcountyInfo = { 
                    subcountyId: subcounty.subcountyId,
                    name: subcounty.name 
                };
                
                // Store exact normalized name
                subcountyMap.set(normalized, subcountyInfo);
                
                // Store variations with slash replaced by space
                const withSpace = normalized.replace(/\//g, ' ');
                if (withSpace !== normalized) {
                    subcountyMap.set(withSpace, subcountyInfo);
                }
                
                // Store variations with space replaced by slash
                const withSlash = normalized.replace(/\s+/g, '/');
                if (withSlash !== normalized && withSlash !== withSpace) {
                    subcountyMap.set(withSlash, subcountyInfo);
                }
                
                // Store word set (sorted words) for order-independent matching
                const words = normalized.split(/[\s\/]+/).filter(w => w.length > 0).sort().join(' ');
                if (words && words !== normalized) {
                    subcountyWordSetMap.set(words, subcountyInfo);
                }
            }
        });
        
        const financialYearMap = new Map(); // normalized name -> { finYearId, finYearName }
        financialYears.forEach(fy => {
            if (fy.finYearName) {
                const normalized = normalizeStr(fy.finYearName).toLowerCase();
                financialYearMap.set(normalized, { 
                    finYearId: fy.finYearId,
                    finYearName: fy.finYearName 
                });
            }
        });
        
        const budgetMap = new Map(); // normalized name -> { budgetId, finYearId, departmentId, budgetName }
        budgets.forEach(budget => {
            if (budget.budgetName) {
                const normalized = normalizeStr(budget.budgetName).toLowerCase();
                budgetMap.set(normalized, { 
                    budgetId: budget.budgetId,
                    finYearId: budget.finYearId,
                    departmentId: budget.departmentId,
                    budgetName: budget.budgetName 
                });
            }
        });
        
        const loadTime = Date.now() - startTime;
        console.log(`Metadata mappings loaded in ${loadTime}ms:`, {
            departments: departmentMap.size,
            wards: wardMap.size,
            subcounties: subcountyMap.size,
            financialYears: financialYearMap.size,
            budgets: budgetMap.size
        });
        
        return {
            departments: departmentMap,
            departmentAliases: departmentAliasMap,
            wards: wardMap,
            wardWordSets: wardWordSetMap,
            subcounties: subcountyMap,
            subcountyWordSets: subcountyWordSetMap,
            financialYears: financialYearMap,
            budgets: budgetMap
        };
    } catch (error) {
        console.error('Error loading metadata mappings:', error);
        throw error;
    }
}

/**
 * Get department ID by name (checks both name and alias)
 * @param {Map} departmentMap - Department name map
 * @param {Map} departmentAliasMap - Department alias map
 * @param {string} departmentName - Department name to look up
 * @returns {number|null} Department ID or null if not found
 */
function getDepartmentId(departmentMap, departmentAliasMap, departmentName) {
    if (!departmentName) return null;
    
    const normalized = normalizeStr(departmentName).toLowerCase();
    
    // Try name first
    if (departmentMap.has(normalized)) {
        return departmentMap.get(normalized).departmentId;
    }
    
    // Try alias
    const normalizedAlias = normalizeAlias(departmentName);
    if (departmentAliasMap.has(normalizedAlias)) {
        return departmentAliasMap.get(normalizedAlias).departmentId;
    }
    
    return null;
}

/**
 * Get ward ID and subcounty ID by ward name
 * Handles variations:
 * - Slash vs space: "AWASI/ONJIKO" vs "AWASI ONJIKO"
 * - Quote variations: "Nyalenda A" vs "Nyalenda 'A'" vs "Nyalenda \"A\""
 * - Word order: "AWASI/ONJIKO" vs "ONJIKO AWASI"
 * - Partial matches: "AWASI" or "ONJIKO" for "AWASI/ONJIKO"
 * @param {Map} wardMap - Ward name map
 * @param {Map} wardWordSetMap - Ward word set map (for order-independent matching)
 * @param {string} wardName - Ward name to look up
 * @returns {Object|null} { wardId, subcountyId, name } or null if not found
 */
function getWardInfo(wardMap, wardWordSetMap, wardName) {
    if (!wardName || wardName === 'unknown' || wardName === 'CountyWide') return null;
    
    // Normalize the input (removes quotes, normalizes spaces/slashes)
    let normalized = normalizeStr(wardName).toLowerCase();
    
    // Remove trailing "ward" suffix if present
    normalized = normalized.replace(/\s+ward\s*$/i, '').trim();
    
    // Try exact match first
    if (wardMap.has(normalized)) {
        return wardMap.get(normalized);
    }
    
    // Try with slash replaced by space
    const withSpace = normalized.replace(/\//g, ' ');
    if (withSpace !== normalized && wardMap.has(withSpace)) {
        return wardMap.get(withSpace);
    }
    
    // Try with space replaced by slash
    const withSlash = normalized.replace(/\s+/g, '/');
    if (withSlash !== normalized && withSlash !== withSpace && wardMap.has(withSlash)) {
        return wardMap.get(withSlash);
    }
    
    // Try word-order independent matching (sorted words)
    const words = normalized.split(/[\s\/]+/).filter(w => w.length > 0).sort().join(' ');
    if (words && wardWordSetMap && wardWordSetMap.has(words)) {
        return wardWordSetMap.get(words);
    }
    
    // For compound names, try matching individual parts
    // e.g., if user enters "AWASI" and database has "AWASI/ONJIKO"
    if (normalized.includes('/') || normalized.includes(' ')) {
        const parts = normalized.split(/[\s\/]+/).map(p => p.trim()).filter(p => p.length >= 3);
        for (const part of parts) {
            if (wardMap.has(part)) {
                const match = wardMap.get(part);
                // Verify this match contains the part (to avoid false positives)
                const matchNormalized = normalizeStr(match.name).toLowerCase();
                if (matchNormalized.includes(part) || part.includes(matchNormalized.split(/[\s\/]+/)[0])) {
                    return match;
                }
            }
        }
    }
    
    return null;
}

/**
 * Get subcounty ID by subcounty name
 * Handles variations:
 * - Slash vs space: "KISUMU CENTRAL" vs "KISUMU/CENTRAL"
 * - Word order: "KISUMU CENTRAL" vs "CENTRAL KISUMU"
 * @param {Map} subcountyMap - Subcounty name map
 * @param {Map} subcountyWordSetMap - Subcounty word set map (for order-independent matching)
 * @param {string} subcountyName - Subcounty name to look up
 * @returns {number|null} Subcounty ID or null if not found
 */
function getSubcountyId(subcountyMap, subcountyWordSetMap, subcountyName) {
    if (!subcountyName || subcountyName === 'unknown' || subcountyName === 'CountyWide') return null;
    
    // Normalize the input
    let normalized = normalizeStr(subcountyName).toLowerCase();
    
    // Try exact match first
    if (subcountyMap.has(normalized)) {
        return subcountyMap.get(normalized).subcountyId;
    }
    
    // Try with slash replaced by space
    const withSpace = normalized.replace(/\//g, ' ');
    if (withSpace !== normalized && subcountyMap.has(withSpace)) {
        return subcountyMap.get(withSpace).subcountyId;
    }
    
    // Try with space replaced by slash
    const withSlash = normalized.replace(/\s+/g, '/');
    if (withSlash !== normalized && withSlash !== withSpace && subcountyMap.has(withSlash)) {
        return subcountyMap.get(withSlash).subcountyId;
    }
    
    // Try word-order independent matching (sorted words)
    const words = normalized.split(/[\s\/]+/).filter(w => w.length > 0).sort().join(' ');
    if (words && subcountyWordSetMap && subcountyWordSetMap.has(words)) {
        return subcountyWordSetMap.get(words).subcountyId;
    }
    
    return null;
}

/**
 * Get budget info by budget name
 * @param {Map} budgetMap - Budget name map
 * @param {string} budgetName - Budget name to look up
 * @returns {Object|null} { budgetId, finYearId, departmentId, budgetName } or null if not found
 */
function getBudgetInfo(budgetMap, budgetName) {
    if (!budgetName) return null;
    
    const normalized = normalizeStr(budgetName).toLowerCase();
    if (budgetMap.has(normalized)) {
        return budgetMap.get(normalized);
    }
    
    return null;
}

module.exports = {
    loadMetadataMappings,
    getDepartmentId,
    getWardInfo,
    getSubcountyId,
    getBudgetInfo,
    normalizeStr,
    normalizeAlias
};
