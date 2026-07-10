const pool = require('../config/db');
const { resolveKenyaWardSubcounty } = require('../utils/deriveKenyaWardSubcounty');
const { fetchOrgDepartmentCatalogRows } = require('../utils/metadataOrgScope');
const { normKey, cleanText } = require('./importStagingTextUtils');

const MACHAKOS_SUBCOUNTIES = [
  'machakos', 'mavoko', 'yatta', 'matungulu', 'mwala',
  'masinga', 'kangundo', 'kathiani', 'kalama',
];

const METADATA_ISSUE_LABELS = {
  meta_missing_subcounty: 'Sub-county missing',
  meta_unresolved_subcounty: 'Sub-county not in catalog',
  meta_missing_ward: 'Ward missing',
  meta_unresolved_ward: 'Ward not in catalog',
  meta_missing_department: 'Department missing',
  meta_unresolved_department: 'Department not in catalog',
};

let catalogCache = null;
let catalogCacheAt = 0;
const CACHE_MS = 5 * 60 * 1000;

function addNormKeys(set, value) {
  const key = normKey(value);
  if (!key) return;
  set.add(key);
  key.split(' ').filter((t) => t.length > 2).forEach((t) => set.add(t));
}

function matchesCatalog(value, keySet) {
  if (!value) return false;
  const key = normKey(value);
  if (!key) return false;
  if (keySet.has(key)) return true;

  for (const candidate of keySet) {
    if (candidate === key) return true;
    if (candidate.length >= 4 && key.length >= 4) {
      if (candidate.includes(key) || key.includes(candidate)) {
        const ratio = Math.min(candidate.length, key.length) / Math.max(candidate.length, key.length);
        if (ratio >= 0.88) return true;
      }
    }
  }
  return false;
}

async function loadMetadataCatalogs() {
  const now = Date.now();
  if (catalogCache && now - catalogCacheAt < CACHE_MS) return catalogCache;

  const countyScope = process.env.WARDS_COUNTY_SCOPE !== undefined
    ? String(process.env.WARDS_COUNTY_SCOPE).trim()
    : 'Machakos';

  const departmentKeys = new Set();
  const subcountyKeys = new Set();
  const wardKeys = new Set();

  MACHAKOS_SUBCOUNTIES.forEach((sc) => addNormKeys(subcountyKeys, sc));

  const deptRows = await fetchOrgDepartmentCatalogRows(pool);
  for (const row of deptRows) {
    addNormKeys(departmentKeys, row.name);
    if (row.alias) {
      String(row.alias).split(',').forEach((part) => addNormKeys(departmentKeys, part));
    }
  }

  const wardParams = [];
  let countyClause = '';
  if (countyScope) {
    countyClause = ' AND county ILIKE $1';
    wardParams.push(`%${countyScope}%`);
  }
  const wardResult = await pool.query(
    `
    SELECT iebc_ward_name, division, county, subcounty
    FROM kenya_wards
    WHERE COALESCE(voided, false) = false
    ${countyClause}
    `,
    wardParams
  );
  for (const row of wardResult.rows || []) {
    addNormKeys(wardKeys, row.iebc_ward_name);
    const subcounty = resolveKenyaWardSubcounty({
      iebcWardName: row.iebc_ward_name,
      division: row.division,
      county: row.county,
      subcounty: row.subcounty,
    });
    addNormKeys(subcountyKeys, subcounty);
    addNormKeys(subcountyKeys, row.division);
    addNormKeys(subcountyKeys, row.subcounty);
  }

  catalogCache = { departmentKeys, subcountyKeys, wardKeys };
  catalogCacheAt = now;
  return catalogCache;
}

function similarityScore(a, b) {
  const ka = normKey(a);
  const kb = normKey(b);
  if (!ka || !kb) return 0;
  if (ka === kb) return 1;
  if (ka.includes(kb) || kb.includes(ka)) {
    return Math.min(ka.length, kb.length) / Math.max(ka.length, kb.length);
  }
  const ta = new Set(ka.split(' ').filter(Boolean));
  const tb = new Set(kb.split(' ').filter(Boolean));
  let inter = 0;
  for (const t of ta) {
    if (tb.has(t)) inter += 1;
  }
  const union = new Set([...ta, ...tb]).size;
  return union ? inter / union : 0;
}

function suggestCatalogMatches(value, names, limit = 5) {
  const scored = (names || [])
    .map((name) => ({ name, score: similarityScore(value, name) }))
    .filter((item) => item.score >= 0.35)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  return scored.slice(0, limit);
}

function titleCaseSubcounty(value) {
  return cleanText(value)
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

async function loadMetadataCatalogEntries() {
  const countyScope = process.env.WARDS_COUNTY_SCOPE !== undefined
    ? String(process.env.WARDS_COUNTY_SCOPE).trim()
    : 'Machakos';

  const deptRows = await fetchOrgDepartmentCatalogRows(pool);

  const wardParams = [];
  let countyClause = '';
  if (countyScope) {
    countyClause = ' AND county ILIKE $1';
    wardParams.push(`%${countyScope}%`);
  }
  const wardResult = await pool.query(
    `
    SELECT iebc_ward_name, division, county, subcounty
    FROM kenya_wards
    WHERE COALESCE(voided, false) = false
    ${countyClause}
    ORDER BY iebc_ward_name ASC
    `,
    wardParams
  );

  const departments = [];
  const departmentSeen = new Set();
  for (const row of deptRows) {
    const name = cleanText(row.name);
    if (!name) continue;
    const key = normKey(name);
    if (departmentSeen.has(key)) continue;
    departmentSeen.add(key);
    departments.push({ name });
  }

  const wards = [];
  const wardSeen = new Set();
  const subcountySeen = new Set();
  const subcounties = [];

  MACHAKOS_SUBCOUNTIES.forEach((sc) => {
    const name = titleCaseSubcounty(sc);
    const key = normKey(name);
    if (!subcountySeen.has(key)) {
      subcountySeen.add(key);
      subcounties.push({ name });
    }
  });

  for (const row of wardResult.rows || []) {
    const wardName = cleanText(row.iebc_ward_name);
    if (wardName) {
      const wardKey = normKey(wardName);
      if (!wardSeen.has(wardKey)) {
        wardSeen.add(wardKey);
        const subcounty = resolveKenyaWardSubcounty({
          iebcWardName: row.iebc_ward_name,
          division: row.division,
          county: row.county,
          subcounty: row.subcounty,
        });
        wards.push({ name: wardName, subcounty: subcounty || null });
      }
    }

    const subcounty = resolveKenyaWardSubcounty({
      iebcWardName: row.iebc_ward_name,
      division: row.division,
      county: row.county,
      subcounty: row.subcounty,
    });
    const subcountyName = titleCaseSubcounty(subcounty || row.division || row.subcounty || '');
    if (subcountyName) {
      const subcountyKey = normKey(subcountyName);
      if (!subcountySeen.has(subcountyKey)) {
        subcountySeen.add(subcountyKey);
        subcounties.push({ name: subcountyName });
      }
    }
  }

  subcounties.sort((a, b) => a.name.localeCompare(b.name));

  return { departments, subcounties, wards };
}

function resolveFieldValue(fieldType, norm, raw, resolutionMap) {
  const sourceKey = normKey(norm || raw || '') || '__empty__';
  const resolved = resolutionMap?.[`${fieldType}:${sourceKey}`];
  if (resolved) return resolved;
  return norm || raw || null;
}

function buildMetadataRemarks(row, catalogs, resolutionMap = {}) {
  const codes = [];
  const labels = [];

  const subcountyValue = resolveFieldValue('subcounty', row.subCountyNorm, row.subCountyRaw, resolutionMap);
  const wardValue = resolveFieldValue('ward', row.wardNorm, row.wardRaw, resolutionMap);
  const departmentValue = resolveFieldValue('department', row.departmentNorm, row.departmentRaw, resolutionMap);

  const hasSubcounty = cleanText(row.subCountyRaw) || Boolean(resolutionMap[`subcounty:${normKey(row.subCountyNorm || row.subCountyRaw || '') || '__empty__'}`]);
  const hasWard = cleanText(row.wardRaw) || Boolean(resolutionMap[`ward:${normKey(row.wardNorm || row.wardRaw || '') || '__empty__'}`]);
  const hasDepartment = cleanText(row.departmentRaw) || Boolean(resolutionMap[`department:${normKey(row.departmentNorm || row.departmentRaw || '') || '__empty__'}`]);

  if (!hasSubcounty) {
    codes.push('meta_missing_subcounty');
    labels.push(METADATA_ISSUE_LABELS.meta_missing_subcounty);
  } else if (!matchesCatalog(subcountyValue, catalogs.subcountyKeys)) {
    codes.push('meta_unresolved_subcounty');
    labels.push(`${METADATA_ISSUE_LABELS.meta_unresolved_subcounty}${subcountyValue ? ` (${subcountyValue})` : ''}`);
  }

  if (!hasWard) {
    codes.push('meta_missing_ward');
    labels.push(METADATA_ISSUE_LABELS.meta_missing_ward);
  } else if (!matchesCatalog(wardValue, catalogs.wardKeys)) {
    codes.push('meta_unresolved_ward');
    labels.push(`${METADATA_ISSUE_LABELS.meta_unresolved_ward}${wardValue ? ` (${wardValue})` : ''}`);
  }

  if (!hasDepartment) {
    codes.push('meta_missing_department');
    labels.push(METADATA_ISSUE_LABELS.meta_missing_department);
  } else if (!matchesCatalog(departmentValue, catalogs.departmentKeys)) {
    codes.push('meta_unresolved_department');
    labels.push(`${METADATA_ISSUE_LABELS.meta_unresolved_department}${departmentValue ? ` (${departmentValue})` : ''}`);
  }

  return {
    codes: codes.length ? codes.join(';') : null,
    labels: labels.length ? labels.join('; ') : null,
  };
}

function formatMetadataRemarksForDisplay(codes) {
  if (!codes) return null;
  return String(codes)
    .split(';')
    .filter(Boolean)
    .map((code) => METADATA_ISSUE_LABELS[code] || code)
    .join('; ');
}

module.exports = {
  METADATA_ISSUE_LABELS,
  loadMetadataCatalogs,
  loadMetadataCatalogEntries,
  buildMetadataRemarks,
  formatMetadataRemarksForDisplay,
  matchesCatalog,
  suggestCatalogMatches,
  similarityScore,
  resolveFieldValue,
};
