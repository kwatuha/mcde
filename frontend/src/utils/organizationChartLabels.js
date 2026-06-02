/**
 * Chart axis / legend labels for organization reference data.
 * Uses a non-empty trimmed alias when present; otherwise the canonical name.
 */

/** Internal bucket keys for sector charts (must not collide with real sector names). */
export const SECTOR_CHART_BUCKET_UNSPECIFIED = '__CHART_SECTOR_UNSPECIFIED__';
export const SECTOR_CHART_BUCKET_OTHER = '__CHART_SECTOR_OTHER__';

export function displayNameFromAlias(alias, canonicalName) {
  const canonical =
    canonicalName == null || canonicalName === '' ? 'Unknown' : String(canonicalName);
  if (alias == null || alias === '') return canonical;
  const trimmed = String(alias).trim();
  return trimmed ? trimmed : canonical;
}

/** Map canonical sector name -> label for charts (alias when set). */
export function buildSectorDisplayMap(sectors) {
  const map = new Map();
  (sectors || []).forEach((sector) => {
    const sectorName = sector.sectorName || sector.name;
    if (sectorName == null || String(sectorName).trim() === '') return;
    const key = String(sectorName).trim();
    map.set(key, displayNameFromAlias(sector.alias, key));
  });
  return map;
}

/**
 * Lowercased trim -> canonical sector name as stored in Sectors Management (first match wins).
 */
export function buildSectorCanonicalLookup(sectors) {
  const map = new Map();
  const addKey = (value, canonical) => {
    if (value == null || String(value).trim() === '') return;
    const norm = String(value).trim().toLowerCase();
    if (!map.has(norm)) map.set(norm, canonical);
  };
  const addAliasKeys = (alias, canonical) => {
    if (alias == null || String(alias).trim() === '') return;
    addKey(alias, canonical);
    String(alias)
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)
      .forEach((part) => addKey(part, canonical));
  };
  (sectors || []).forEach((sector) => {
    const sectorName = sector.sectorName || sector.name;
    if (sectorName == null || String(sectorName).trim() === '') return;
    const canonical = String(sectorName).trim();
    addKey(canonical, canonical);
    addAliasKeys(sector.alias, canonical);
    (sector.subSectors || []).forEach((subSector) => {
      addKey(subSector.subSectorName || subSector.name, canonical);
      addAliasKeys(subSector.alias, canonical);
    });
  });
  return map;
}

/**
 * Raw `sector` string from a project row (API). No fallback to category / directorate / ministry.
 * Different list endpoints use different keys (`sector`, `sector_name`, etc.).
 */
export function rawRegistrySectorFromProject(project) {
  if (!project || typeof project !== 'object') return '';
  const v =
    project.sector ??
    project.Sector ??
    project.sector_name ??
    project.sectorName ??
    project.sector_text ??
    project.project_sector;
  if (v == null || v === '') return '';
  return String(v).trim();
}

/**
 * Bucket key for sector charts: registry canonical name, unspecified, or other.
 */
export function sectorRegistryBucketKey(rawSectorFromProject, canonicalLookup) {
  const trimmed = rawSectorFromProject == null ? '' : String(rawSectorFromProject).trim();
  if (!trimmed) return SECTOR_CHART_BUCKET_UNSPECIFIED;
  const canon = canonicalLookup.get(trimmed.toLowerCase());
  if (canon) return canon;
  return SECTOR_CHART_BUCKET_OTHER;
}

/** X-axis / legend label for a sector-chart bucket key. */
export function labelForSectorRegistryBucket(bucketKey, sectorDisplayMap) {
  if (bucketKey === SECTOR_CHART_BUCKET_UNSPECIFIED) return 'Unspecified sector';
  if (bucketKey === SECTOR_CHART_BUCKET_OTHER) return 'Not in sector registry';
  return sectorDisplayMap.get(bucketKey) ?? bucketKey;
}

/**
 * From GET /ministries?withDepartments=1: ministry { name, alias, departments: [{ name, alias }] }.
 * State department keys are unique by name (same as management UI lists).
 */
export function buildMinistryAndStateDepartmentDisplayMaps(ministriesTree) {
  const ministryMap = new Map();
  const stateDeptMap = new Map();
  (ministriesTree || []).forEach((m) => {
    const mName = m?.name;
    if (mName != null && String(mName).trim() !== '') {
      const key = String(mName).trim();
      ministryMap.set(key, displayNameFromAlias(m.alias, key));
    }
    (m.departments || []).forEach((d) => {
      const dName = d?.name;
      if (dName != null && String(dName).trim() !== '') {
        const key = String(dName).trim();
        stateDeptMap.set(key, displayNameFromAlias(d.alias, key));
      }
    });
  });
  return { ministryMap, stateDeptMap };
}

/**
 * Bucket keys for "by sector" charts may fall back to ministry / state department text from imports.
 * Prefer a configured sector name when it matches; else ministry; else state department.
 * @deprecated Prefer sectorRegistryBucketKey + labelForSectorRegistryBucket for sector-only charts.
 */
export function resolveSectorBucketChartLabel(rawKey, sectorDisplayMap, ministryMap, stateDeptMap) {
  const key = rawKey == null || String(rawKey).trim() === '' ? 'Unknown' : String(rawKey).trim();
  if (key === 'Unknown') return key;
  if (sectorDisplayMap.has(key)) return sectorDisplayMap.get(key);
  if (ministryMap.has(key)) return ministryMap.get(key);
  if (stateDeptMap.has(key)) return stateDeptMap.get(key);
  return key;
}
