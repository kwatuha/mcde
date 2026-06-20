const pool = require('../config/db');

function queryRows(result) {
  return result.rows || [];
}

async function runQuery(sql, params = []) {
  const result = await pool.query(sql, params);
  return queryRows(result);
}

/** Returns [] if table does not exist yet (e.g. before migration). */
async function runQueryOptional(sql, params = []) {
  try {
    return await runQuery(sql, params);
  } catch (error) {
    if (error.code === '42P01') {
      console.warn('KDSP table missing during optional query:', error.message);
      return [];
    }
    throw error;
  }
}

function formatTimestamp(date) {
  if (!date) return null;
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function formatBooleanForDb(value) {
  if (value === true || value === 1 || value === '1') return true;
  if (value === false || value === 0 || value === '0') return false;
  return null;
}

async function insertRecord(table, record, returningCol) {
  const entries = Object.entries(record);
  const cols = entries.map(([key]) => `"${key}"`);
  const placeholders = entries.map((_, index) => `$${index + 1}`);
  const values = entries.map(([, value]) => value);
  const sql = `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING "${returningCol}"`;
  const result = await pool.query(sql, values);
  return {
    insertId: result.rows[0][returningCol],
    affectedRows: result.rowCount || 0,
  };
}

async function updateRecord(table, fields, idCol, idVal) {
  const entries = Object.entries(fields);
  const setParts = entries.map(([key], index) => `"${key}" = $${index + 1}`);
  const values = entries.map(([, value]) => value);
  const sql = `UPDATE ${table} SET ${setParts.join(', ')} WHERE "${idCol}" = $${entries.length + 1}`;
  const result = await pool.query(sql, [...values, idVal]);
  return { affectedRows: result.rowCount || 0 };
}

async function deleteRecord(table, idCol, idVal) {
  const result = await pool.query(`DELETE FROM ${table} WHERE "${idCol}" = $1`, [idVal]);
  return { affectedRows: result.rowCount || 0 };
}

module.exports = {
  queryRows,
  runQuery,
  runQueryOptional,
  formatTimestamp,
  formatBooleanForDb,
  insertRecord,
  updateRecord,
  deleteRecord,
};
