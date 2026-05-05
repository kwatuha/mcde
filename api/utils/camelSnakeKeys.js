/**
 * Convert PostgreSQL snake_case row keys to camelCase for API/frontend parity
 * (legacy HR module expected MySQL-style / mixed keys).
 */
function camelFromSnake(key) {
  if (!key || typeof key !== 'string') return key;
  return key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

function camelSnakeKeys(obj) {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map(camelSnakeKeys);
  if (obj instanceof Date) return obj;
  if (typeof obj !== 'object') return obj;
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    const nk = camelFromSnake(k);
    if (v !== null && typeof v === 'object' && !(v instanceof Date) && !Buffer.isBuffer(v)) {
      out[nk] = Array.isArray(v) ? v.map(camelSnakeKeys) : camelSnakeKeys(v);
    } else {
      out[nk] = v;
    }
  }
  if (out.assetCondition !== undefined && out.condition === undefined) {
    out.condition = out.assetCondition;
  }
  return out;
}

function mapRows(rows) {
  if (!rows || !Array.isArray(rows)) return rows;
  return rows.map(camelSnakeKeys);
}

module.exports = { camelFromSnake, camelSnakeKeys, mapRows };
