/**
 * Planning indicators & measurement types (CIDP / M&E support).
 */
const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const privilege = require('../middleware/privilegeMiddleware');

const DB_TYPE = process.env.DB_TYPE || 'mysql';
const isPostgres = DB_TYPE === 'postgresql';

const rowsFromResult = (result) =>
  isPostgres ? result?.rows || [] : Array.isArray(result) ? result[0] || [] : [];
const firstRow = (result) => rowsFromResult(result)[0] || null;

const canRead = privilege(['strategic_plan.read_all']);
const canWrite = privilege(['strategic_plan.create', 'strategic_plan.update'], { anyOf: true });

let tablesEnsured = false;

async function ensureTables() {
  if (tablesEnsured) return;
  const runSafe = async (sql) => {
    try {
      await pool.query(sql);
    } catch (e) {
      const code = String(e?.code || '');
      if (code === '42P07' || code === '42710' || code === '23505' || code === 'ER_TABLE_EXISTS_ERROR') return;
      throw e;
    }
  };

  if (isPostgres) {
    await runSafe(`
      CREATE TABLE IF NOT EXISTS planning_measurement_types (
        id BIGSERIAL PRIMARY KEY,
        code TEXT NOT NULL,
        label TEXT NOT NULL,
        description TEXT NULL,
        voided BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_planning_mt_code UNIQUE (code)
      )
    `);
    await runSafe(`
      CREATE TABLE IF NOT EXISTS planning_indicators (
        id BIGSERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NULL,
        measurement_type_id BIGINT NOT NULL REFERENCES planning_measurement_types(id),
        voided BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
  } else {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS planning_measurement_types (
        id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        code VARCHAR(64) NOT NULL,
        label VARCHAR(255) NOT NULL,
        description TEXT NULL,
        voided TINYINT(1) NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_planning_mt_code (code)
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS planning_indicators (
        id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT NULL,
        measurement_type_id BIGINT NOT NULL,
        voided TINYINT(1) NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_planning_ind_mt FOREIGN KEY (measurement_type_id) REFERENCES planning_measurement_types(id)
      )
    `);
  }

  const seedDefaults = async () => {
    // General M&E types + sub-program "Unit of measure" options (codes match `subprograms.unitOfMeasure`).
    const defaults = [
      ['number', 'Number', 'Whole or decimal counts or amounts'],
      ['ratio', 'Ratio', 'Relationship between two quantities'],
      ['text', 'Text', 'Qualitative or narrative measure'],
      ['index', 'Index', 'Composite score or index value'],
      ['%', 'Percentage (%)', 'Share or completion rate as a percent'],
      ['count', 'Count', 'Discrete count of people, items, or events'],
      ['length', 'Length (m)', 'Linear distance in metres'],
      ['area', 'Area (m²)', 'Surface area in square metres'],
      ['volume', 'Volume (m³)', 'Volume in cubic metres'],
      ['weight', 'Weight (kg)', 'Mass in kilograms'],
      ['time', 'Time (days)', 'Duration in days'],
      ['currency', 'Currency (KES)', 'Monetary value in Kenyan shillings'],
      ['units', 'Units', 'Generic countable units'],
      ['stalls', 'Stalls', 'Market or trading stalls'],
      ['beds', 'Beds', 'Hospital or facility beds'],
      ['rooms', 'Rooms', 'Rooms or similar spaces'],
      ['classrooms', 'Classrooms', 'Teaching classrooms'],
      ['kilometers', 'Kilometers (km)', 'Road or distance in km'],
      ['meters', 'Meters (m)', 'Linear distance in metres'],
      ['hectares', 'Hectares', 'Land area in hectares'],
      ['acres', 'Acres', 'Land area in acres'],
    ];
    for (const [code, label, description] of defaults) {
      if (isPostgres) {
        await pool.query(
          `INSERT INTO planning_measurement_types (code, label, description)
           VALUES ($1, $2, $3)
           ON CONFLICT (code) DO NOTHING`,
          [code, label, description]
        );
      } else {
        await pool.query(
          `INSERT IGNORE INTO planning_measurement_types (code, label, description) VALUES (?, ?, ?)`,
          [code, label, description]
        );
      }
    }
  };
  await seedDefaults();
  tablesEnsured = true;
}

router.use(async (req, res, next) => {
  try {
    await ensureTables();
    next();
  } catch (e) {
    console.error('planning indicators ensureTables:', e);
    res.status(500).json({ message: 'Planning indicators storage init failed', error: e.message });
  }
});

router.get('/measurement-types', canRead, async (req, res) => {
  try {
    if (isPostgres) {
      const r = await pool.query(
        `SELECT id, code, label, description, voided, created_at AS "createdAt", updated_at AS "updatedAt"
         FROM planning_measurement_types WHERE voided = false ORDER BY label ASC`
      );
      return res.json(r.rows || []);
    }
    const [rows] = await pool.query(
      `SELECT id, code, label, description, voided, created_at AS createdAt, updated_at AS updatedAt
       FROM planning_measurement_types WHERE voided = 0 ORDER BY label ASC`
    );
    res.json(rows || []);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

router.post('/measurement-types', canWrite, async (req, res) => {
  const code = String(req.body.code || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
  const label = String(req.body.label || '').trim();
  const description = req.body.description != null ? String(req.body.description).trim() : null;
  if (!code || !label) return res.status(400).json({ message: 'code and label are required.' });
  try {
    if (isPostgres) {
      const r = await pool.query(
        `INSERT INTO planning_measurement_types (code, label, description)
         VALUES ($1, $2, $3)
         RETURNING id, code, label, description, voided, created_at AS "createdAt", updated_at AS "updatedAt"`,
        [code, label, description]
      );
      return res.status(201).json(r.rows?.[0]);
    }
    const [ins] = await pool.query(
      `INSERT INTO planning_measurement_types (code, label, description) VALUES (?,?,?)`,
      [code, label, description]
    );
    const [rows] = await pool.query(
      `SELECT id, code, label, description, voided, created_at AS createdAt, updated_at AS updatedAt
       FROM planning_measurement_types WHERE id = ?`,
      [ins.insertId]
    );
    res.status(201).json(rows?.[0]);
  } catch (e) {
    if (String(e.message).includes('unique') || String(e.code) === '23505') {
      return res.status(409).json({ message: 'A measurement type with this code already exists.' });
    }
    res.status(500).json({ message: e.message });
  }
});

router.put('/measurement-types/:id', canWrite, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid id.' });
  const label = String(req.body.label || '').trim();
  const description = req.body.description != null ? String(req.body.description).trim() : null;
  if (!label) return res.status(400).json({ message: 'label is required.' });
  try {
    if (isPostgres) {
      const r = await pool.query(
        `UPDATE planning_measurement_types SET label = $1, description = $2, updated_at = NOW()
         WHERE id = $3 AND voided = false
         RETURNING id, code, label, description, voided, created_at AS "createdAt", updated_at AS "updatedAt"`,
        [label, description, id]
      );
      if (!r.rowCount) return res.status(404).json({ message: 'Not found.' });
      return res.json(r.rows[0]);
    }
    const [u] = await pool.query(
      `UPDATE planning_measurement_types SET label = ?, description = ?, updated_at = NOW() WHERE id = ? AND voided = 0`,
      [label, description, id]
    );
    if (!u.affectedRows) return res.status(404).json({ message: 'Not found.' });
    const [rows] = await pool.query(
      `SELECT id, code, label, description, voided, created_at AS createdAt, updated_at AS updatedAt FROM planning_measurement_types WHERE id = ?`,
      [id]
    );
    res.json(rows?.[0]);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

router.delete('/measurement-types/:id', canWrite, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid id.' });
  try {
    if (isPostgres) {
      const r = await pool.query(`UPDATE planning_measurement_types SET voided = true, updated_at = NOW() WHERE id = $1`, [id]);
      if (!r.rowCount) return res.status(404).json({ message: 'Not found.' });
    } else {
      const [u] = await pool.query(`UPDATE planning_measurement_types SET voided = 1, updated_at = NOW() WHERE id = ?`, [id]);
      if (!u.affectedRows) return res.status(404).json({ message: 'Not found.' });
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

router.get('/indicators', canRead, async (req, res) => {
  try {
    if (isPostgres) {
      const r = await pool.query(
        `SELECT i.id, i.name, i.description, i.measurement_type_id AS "measurementTypeId",
                mt.code AS "measurementTypeCode", mt.label AS "measurementTypeLabel",
                i.voided, i.created_at AS "createdAt", i.updated_at AS "updatedAt"
         FROM planning_indicators i
         INNER JOIN planning_measurement_types mt ON mt.id = i.measurement_type_id AND mt.voided = false
         WHERE i.voided = false
         ORDER BY i.name ASC`
      );
      return res.json(r.rows || []);
    }
    const [rows] = await pool.query(
      `SELECT i.id, i.name, i.description, i.measurement_type_id AS measurementTypeId,
              mt.code AS measurementTypeCode, mt.label AS measurementTypeLabel,
              i.voided, i.created_at AS createdAt, i.updated_at AS updatedAt
       FROM planning_indicators i
       INNER JOIN planning_measurement_types mt ON mt.id = i.measurement_type_id AND mt.voided = 0
       WHERE i.voided = 0
       ORDER BY i.name ASC`
    );
    res.json(rows || []);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

router.post('/indicators', canWrite, async (req, res) => {
  const name = String(req.body.name || '').trim();
  const description = req.body.description != null ? String(req.body.description).trim() : null;
  const measurementTypeId = Number(req.body.measurementTypeId ?? req.body.measurement_type_id);
  if (!name) return res.status(400).json({ message: 'name is required.' });
  if (!Number.isFinite(measurementTypeId)) return res.status(400).json({ message: 'measurementTypeId is required.' });
  try {
    if (isPostgres) {
      const r = await pool.query(
        `INSERT INTO planning_indicators (name, description, measurement_type_id)
         VALUES ($1, $2, $3)
         RETURNING id, name, description, measurement_type_id AS "measurementTypeId", voided, created_at AS "createdAt", updated_at AS "updatedAt"`,
        [name, description, measurementTypeId]
      );
      const row = r.rows?.[0];
      const mt = firstRow(
        await pool.query(`SELECT code AS "measurementTypeCode", label AS "measurementTypeLabel" FROM planning_measurement_types WHERE id = $1`, [
          measurementTypeId,
        ])
      );
      return res.status(201).json({ ...row, ...mt });
    }
    const [ins] = await pool.query(
      `INSERT INTO planning_indicators (name, description, measurement_type_id) VALUES (?,?,?)`,
      [name, description, measurementTypeId]
    );
    const [rows] = await pool.query(
      `SELECT i.id, i.name, i.description, i.measurement_type_id AS measurementTypeId,
              mt.code AS measurementTypeCode, mt.label AS measurementTypeLabel,
              i.voided, i.created_at AS createdAt, i.updated_at AS updatedAt
       FROM planning_indicators i
       INNER JOIN planning_measurement_types mt ON mt.id = i.measurement_type_id
       WHERE i.id = ?`,
      [ins.insertId]
    );
    res.status(201).json(rows?.[0]);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

router.put('/indicators/:id', canWrite, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid id.' });
  const name = String(req.body.name || '').trim();
  const description = req.body.description != null ? String(req.body.description).trim() : null;
  const measurementTypeId = Number(req.body.measurementTypeId ?? req.body.measurement_type_id);
  if (!name) return res.status(400).json({ message: 'name is required.' });
  if (!Number.isFinite(measurementTypeId)) return res.status(400).json({ message: 'measurementTypeId is required.' });
  try {
    if (isPostgres) {
      const r = await pool.query(
        `UPDATE planning_indicators SET name = $1, description = $2, measurement_type_id = $3, updated_at = NOW()
         WHERE id = $4 AND voided = false
         RETURNING id, name, description, measurement_type_id AS "measurementTypeId", voided, created_at AS "createdAt", updated_at AS "updatedAt"`,
        [name, description, measurementTypeId, id]
      );
      if (!r.rowCount) return res.status(404).json({ message: 'Not found.' });
      const mt = firstRow(
        await pool.query(`SELECT code AS "measurementTypeCode", label AS "measurementTypeLabel" FROM planning_measurement_types WHERE id = $1`, [
          measurementTypeId,
        ])
      );
      return res.json({ ...r.rows[0], ...mt });
    }
    const [u] = await pool.query(
      `UPDATE planning_indicators SET name = ?, description = ?, measurement_type_id = ?, updated_at = NOW() WHERE id = ? AND voided = 0`,
      [name, description, measurementTypeId, id]
    );
    if (!u.affectedRows) return res.status(404).json({ message: 'Not found.' });
    const [rows] = await pool.query(
      `SELECT i.id, i.name, i.description, i.measurement_type_id AS measurementTypeId,
              mt.code AS measurementTypeCode, mt.label AS measurementTypeLabel,
              i.voided, i.created_at AS createdAt, i.updated_at AS updatedAt
       FROM planning_indicators i
       INNER JOIN planning_measurement_types mt ON mt.id = i.measurement_type_id
       WHERE i.id = ?`,
      [id]
    );
    res.json(rows?.[0]);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

router.delete('/indicators/:id', canWrite, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid id.' });
  try {
    if (isPostgres) {
      const r = await pool.query(`UPDATE planning_indicators SET voided = true, updated_at = NOW() WHERE id = $1`, [id]);
      if (!r.rowCount) return res.status(404).json({ message: 'Not found.' });
    } else {
      const [u] = await pool.query(`UPDATE planning_indicators SET voided = 1, updated_at = NOW() WHERE id = ?`, [id]);
      if (!u.affectedRows) return res.status(404).json({ message: 'Not found.' });
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

module.exports = router;
