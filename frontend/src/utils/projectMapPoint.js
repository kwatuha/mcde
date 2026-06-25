import { normalizeWardKey } from './projectWardKey';

const toNumber = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
};

/** First non-empty coordinate pair from common project location fields. */
export function getProjectMapPoint(project) {
  const candidates = [
    [project?.latitude, project?.longitude],
    [project?.lat, project?.lng],
    [project?.geoLat, project?.geoLon],
    [project?.location?.geocoordinates?.lat, project?.location?.geocoordinates?.lng],
    [project?.location?.latitude, project?.location?.longitude],
  ];
  for (const [latValue, lngValue] of candidates) {
    const lat = Number(latValue);
    const lng = Number(lngValue);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  }
  return null;
}

export function getProjectSubcountyLabel(project) {
  return String(
    project?.subcountyNames ||
      project?.subCounty ||
      project?.SubCounty ||
      project?.subcounty ||
      project?.location?.subcounty ||
      ''
  )
    .split(',')[0]
    .trim();
}

export function getProjectWardLabel(project) {
  return String(
    project?.wardNames ||
      project?.wardName ||
      project?.ward ||
      project?.location?.ward ||
      ''
  )
    .split(',')[0]
    .trim();
}

export function normalizeSubcountyKey(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[/_-]+/g, ' ')
    .replace(/\s+/g, ' ');
}

export function normalizeDepartmentKey(value) {
  return String(value || '').trim().toLowerCase();
}

export function getProjectDepartmentLabel(project) {
  return String(
    project?.departmentName ||
      project?.stateDepartment ||
      project?.state_department ||
      project?.ministry ||
      ''
  ).trim();
}

export function getProjectSectorLabel(project) {
  return String(project?.sector || project?.categoryName || '').trim();
}

export function getProjectFinancialYearLabel(project) {
  return String(project?.financialYearName || project?.financialYear || '').trim();
}

export function projectMatchesWardFilter(project, wardKey) {
  if (!wardKey) return true;
  const label = getProjectWardLabel(project);
  return normalizeWardKey(label) === wardKey;
}

export function projectMatchesSubcountyFilter(project, subcountyKey) {
  if (!subcountyKey) return true;
  const raw = String(project?.subcountyNames || project?.subcounty || '').trim();
  if (!raw) return false;
  return raw
    .split(',')
    .map((part) => normalizeSubcountyKey(part))
    .includes(subcountyKey);
}

export function computeBoundsFromPoints(points) {
  if (!Array.isArray(points) || points.length === 0) return null;
  let minLat = Infinity;
  let minLng = Infinity;
  let maxLat = -Infinity;
  let maxLng = -Infinity;
  points.forEach(({ lat, lng }) => {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    minLat = Math.min(minLat, lat);
    minLng = Math.min(minLng, lng);
    maxLat = Math.max(maxLat, lat);
    maxLng = Math.max(maxLng, lng);
  });
  if (!Number.isFinite(minLat)) return null;
  return { minLat, minLng, maxLat, maxLng };
}

export function boundsCenter(bounds) {
  if (!bounds) return null;
  return {
    lat: (bounds.minLat + bounds.maxLat) / 2,
    lng: (bounds.minLng + bounds.maxLng) / 2,
  };
}

export function estimateZoomFromBounds(bounds) {
  if (!bounds) return 9;
  const latDiff = Math.abs(bounds.maxLat - bounds.minLat);
  const lngDiff = Math.abs(bounds.maxLng - bounds.minLng);
  const span = Math.max(latDiff, lngDiff);
  if (span > 2) return 8;
  if (span > 0.8) return 9;
  if (span > 0.35) return 10;
  if (span > 0.12) return 11;
  if (span > 0.04) return 12;
  if (span > 0.015) return 13;
  return 14;
}

export function toMoney(value) {
  return toNumber(value).toLocaleString('en-KE');
}
