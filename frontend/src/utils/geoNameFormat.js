const SPECIAL_COMPARE_KEYS = new Set(['', 'unspecified', 'other', 'na', 'n/a']);

export function normalizeGeoCompareKey(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

export function formatGeoDisplayName(value, fallback = 'Unspecified') {
  const text = String(value ?? '').trim();
  if (!text) return fallback;

  const compareKey = normalizeGeoCompareKey(text);
  if (SPECIAL_COMPARE_KEYS.has(compareKey)) {
    if (compareKey === 'other') return 'Other';
    return fallback;
  }

  return text
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export const GEO_DIMENSION_KEYS = ['subcounty', 'ward', 'sublocation', 'village'];

export function isGeoDimensionKey(key) {
  return GEO_DIMENSION_KEYS.includes(key);
}
