/**
 * JS fingerprint for state department names — mirrors api/utils/orgNameNormalize.js.
 */
export function stateDepartmentComparableKey(value) {
  let s = String(value || '').trim().toLowerCase();
  if (!s) return '';
  s = s.replace(/^state\s+department\s+(of|for)\s+/i, '');
  s = s.replace(/(?:\s*\([^)]*\))+\s*$/g, '');
  s = s.replace(/&/g, ' ');
  s = s.replace(/\b(the|and|of|for)\b/gi, '');
  s = s.replace(/\s*\([^)]*\)\s*/g, '');
  s = s.replace(/[^a-z0-9]+/g, '');
  return s;
}

/** Dedupe display labels; keep registry/catalog names over project free-text variants. */
export function dedupeDepartmentNameList(names, { prefer = new Set() } = {}) {
  const byKey = new Map();
  for (const raw of names || []) {
    const name = String(raw || '').trim();
    if (!name) continue;
    const key = stateDepartmentComparableKey(name);
    if (!key) continue;
    const isPreferred = prefer.has(name) || [...prefer].some((p) => stateDepartmentComparableKey(p) === key);
    const prev = byKey.get(key);
    if (
      !prev
      || (isPreferred && !prev.preferred)
      || (isPreferred === prev.preferred && name.length < prev.name.length)
    ) {
      byKey.set(key, { name, preferred: isPreferred });
    }
  }
  return [...byKey.values()]
    .map((e) => e.name)
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}
