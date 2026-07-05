const SPECIAL_COMPARE_KEYS = new Set(['', 'unspecified', 'other', 'na', 'n/a']);

function normalizeGeoCompareKey(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function formatGeoDisplayName(value, fallback = 'Unspecified') {
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

module.exports = {
  normalizeGeoCompareKey,
  formatGeoDisplayName,
};
