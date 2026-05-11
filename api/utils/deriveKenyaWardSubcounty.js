/**
 * Derive sub-county label from IEBC ward attributes.
 * IEBC reference CSV maps FIRST_DIVI to our `division` column; for Machakos County that
 * field aligns with administrative sub-units. Canonical names follow common Kenya / county
 * usage (e.g. Central → Machakos town area, Athi River → Mavoko).
 *
 * @param {{ iebcWardName?: string|null, division?: string|null, county?: string|null }} row
 * @returns {string|null}
 */
function normKey(s) {
    return String(s || '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ');
}

/** Machakos: division (FIRST_DIVI) → common sub-county label */
const MACHAKOS_DIVISION_TO_SUBCOUNTY = {
    central: 'Machakos',
    'athi river': 'Mavoko',
};

/**
 * Ward-level overrides where the CSV division label differs from the usual sub-county name.
 * Keys are normalized IEBC ward names.
 */
const MACHAKOS_WARD_SUBCOUNTY = {
    // Syokimau / Mlolongo area is within Mavoko sub-county (CRA / county structure).
    'syokimau/mlolongo': 'Mavoko',
};

function deriveKenyaWardSubcounty({ iebcWardName, division, county }) {
    const div = String(division || '').trim();
    if (!div) return null;

    const countyKey = normKey(county);
    const isMachakos = countyKey.includes('machakos');

    const wardKey = normKey(iebcWardName);
    if (isMachakos && wardKey && MACHAKOS_WARD_SUBCOUNTY[wardKey]) {
        return MACHAKOS_WARD_SUBCOUNTY[wardKey];
    }

    const divKey = normKey(div);
    if (isMachakos && MACHAKOS_DIVISION_TO_SUBCOUNTY[divKey]) {
        return MACHAKOS_DIVISION_TO_SUBCOUNTY[divKey];
    }

    return div;
}

function resolveKenyaWardSubcounty({ iebcWardName, division, county, district, subcounty }) {
    const manual = String(subcounty || '').trim();
    if (manual) return manual;
    return deriveKenyaWardSubcounty({
        iebcWardName,
        division,
        county: county || district,
    });
}

module.exports = {
    deriveKenyaWardSubcounty,
    resolveKenyaWardSubcounty,
};
