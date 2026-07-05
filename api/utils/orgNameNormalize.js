/**
 * JS fingerprint for state department names — mirrors stateDeptComparableExpr in userRoutes.js
 * so dropdowns dedupe "Lands & Economic Planning" vs "Lands And Economic Planning".
 */
function stateDepartmentComparableKey(value) {
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

/**
 * Merge department labels; prefer registry rows (with id) over free-text project values.
 * @param {Array<{ departmentName?: string, name?: string, id?: number|null, alias?: string, _source?: string }>} rows
 */
function dedupeDepartmentOptions(rows) {
  const byKey = new Map();
  const rank = (row) => {
    if (row.id != null && row.id !== '') return 0;
    if (row._source === 'registry') return 1;
    if (row._source === 'catalog') return 2;
    return 3;
  };
  for (const row of rows || []) {
    const name = String(row.departmentName || row.name || '').trim();
    if (!name) continue;
    const key = stateDepartmentComparableKey(name);
    if (!key) continue;
    const entry = {
      id: row.id ?? null,
      departmentName: name,
      alias: row.alias || '',
      _source: row._source || (row.id != null ? 'registry' : 'unknown'),
    };
    const prev = byKey.get(key);
    if (!prev || rank(entry) < rank(prev) || (rank(entry) === rank(prev) && name.length < prev.departmentName.length)) {
      byKey.set(key, entry);
    }
  }
  return [...byKey.values()]
    .map(({ _source, ...rest }) => rest)
    .sort((a, b) => a.departmentName.localeCompare(b.departmentName, undefined, { sensitivity: 'base' }));
}

module.exports = {
  stateDepartmentComparableKey,
  dedupeDepartmentOptions,
};
