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
    await runSafe(`
      CREATE TABLE IF NOT EXISTS planning_project_activities (
        id BIGSERIAL PRIMARY KEY,
        activity_code TEXT NOT NULL,
        activity_name TEXT NOT NULL,
        indicator_id BIGINT NOT NULL REFERENCES planning_indicators(id),
        description TEXT NULL,
        voided BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_planning_proj_act_code UNIQUE (activity_code)
      )
    `);
    await runSafe(
      `CREATE INDEX IF NOT EXISTS idx_planning_proj_act_indicator ON planning_project_activities(indicator_id)`
    );
    await runSafe(`
      CREATE TABLE IF NOT EXISTS planning_project_risks (
        id BIGSERIAL PRIMARY KEY,
        risk_code TEXT NOT NULL,
        risk_name TEXT NOT NULL,
        description TEXT NULL,
        voided BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_planning_proj_risk_code UNIQUE (risk_code)
      )
    `);
    await runSafe(`
      CREATE TABLE IF NOT EXISTS project_planning_activity_links (
        id BIGSERIAL PRIMARY KEY,
        project_id BIGINT NOT NULL,
        planning_activity_id BIGINT NOT NULL REFERENCES planning_project_activities(id),
        notes TEXT NULL,
        voided BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_proj_plan_act_link UNIQUE (project_id, planning_activity_id)
      )
    `);
    await runSafe(
      `CREATE INDEX IF NOT EXISTS idx_ppactlink_project ON project_planning_activity_links(project_id)`
    );
    await runSafe(`
      CREATE TABLE IF NOT EXISTS project_planning_risk_links (
        id BIGSERIAL PRIMARY KEY,
        project_id BIGINT NOT NULL,
        planning_risk_id BIGINT NOT NULL REFERENCES planning_project_risks(id),
        notes TEXT NULL,
        voided BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_proj_plan_risk_link UNIQUE (project_id, planning_risk_id)
      )
    `);
    await runSafe(`CREATE INDEX IF NOT EXISTS idx_pprisklink_project ON project_planning_risk_links(project_id)`);
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
    await pool.query(`
      CREATE TABLE IF NOT EXISTS planning_project_activities (
        id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        activity_code VARCHAR(128) NOT NULL,
        activity_name VARCHAR(512) NOT NULL,
        indicator_id BIGINT NOT NULL,
        description TEXT NULL,
        voided TINYINT(1) NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_planning_proj_act_code (activity_code),
        CONSTRAINT fk_planning_proj_act_ind FOREIGN KEY (indicator_id) REFERENCES planning_indicators(id)
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS planning_project_risks (
        id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        risk_code VARCHAR(128) NOT NULL,
        risk_name VARCHAR(512) NOT NULL,
        description TEXT NULL,
        voided TINYINT(1) NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_planning_proj_risk_code (risk_code)
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS project_planning_activity_links (
        id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        project_id BIGINT NOT NULL,
        planning_activity_id BIGINT NOT NULL,
        notes TEXT NULL,
        voided TINYINT(1) NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_proj_plan_act_link (project_id, planning_activity_id),
        CONSTRAINT fk_ppactlink_act FOREIGN KEY (planning_activity_id) REFERENCES planning_project_activities(id)
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS project_planning_risk_links (
        id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        project_id BIGINT NOT NULL,
        planning_risk_id BIGINT NOT NULL,
        notes TEXT NULL,
        voided TINYINT(1) NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_proj_plan_risk_link (project_id, planning_risk_id),
        CONSTRAINT fk_pprisklink_risk FOREIGN KEY (planning_risk_id) REFERENCES planning_project_risks(id)
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

/** Catalog of measurable project activities, each linked to a KPI / indicator (for M&E and future project linking). */
router.get('/project-activities', canRead, async (req, res) => {
  try {
    if (isPostgres) {
      const r = await pool.query(
        `SELECT a.id, a.activity_code AS "activityCode", a.activity_name AS "activityName",
                a.indicator_id AS "indicatorId", a.description, a.voided,
                a.created_at AS "createdAt", a.updated_at AS "updatedAt",
                i.name AS "indicatorName",
                mt.code AS "measurementTypeCode", mt.label AS "measurementTypeLabel"
         FROM planning_project_activities a
         INNER JOIN planning_indicators i ON i.id = a.indicator_id AND i.voided = false
         INNER JOIN planning_measurement_types mt ON mt.id = i.measurement_type_id AND mt.voided = false
         WHERE a.voided = false
         ORDER BY a.activity_code ASC`
      );
      return res.json(r.rows || []);
    }
    const [rows] = await pool.query(
      `SELECT a.id, a.activity_code AS activityCode, a.activity_name AS activityName,
              a.indicator_id AS indicatorId, a.description, a.voided,
              a.created_at AS createdAt, a.updated_at AS updatedAt,
              i.name AS indicatorName,
              mt.code AS measurementTypeCode, mt.label AS measurementTypeLabel
       FROM planning_project_activities a
       INNER JOIN planning_indicators i ON i.id = a.indicator_id AND i.voided = 0
       INNER JOIN planning_measurement_types mt ON mt.id = i.measurement_type_id AND mt.voided = 0
       WHERE a.voided = 0
       ORDER BY a.activity_code ASC`
    );
    res.json(rows || []);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

router.post('/project-activities', canWrite, async (req, res) => {
  const activityCode = String(req.body.activityCode || req.body.activity_code || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
  const activityName = String(req.body.activityName || req.body.activity_name || '').trim();
  const description = req.body.description != null ? String(req.body.description).trim() : null;
  const indicatorId = Number(req.body.indicatorId ?? req.body.indicator_id);
  if (!activityCode || !activityName) return res.status(400).json({ message: 'activityCode and activityName are required.' });
  if (!Number.isFinite(indicatorId)) return res.status(400).json({ message: 'indicatorId is required.' });
  try {
    if (isPostgres) {
      const r = await pool.query(
        `INSERT INTO planning_project_activities (activity_code, activity_name, indicator_id, description)
         VALUES ($1, $2, $3, $4)
         RETURNING id, activity_code AS "activityCode", activity_name AS "activityName",
                   indicator_id AS "indicatorId", description, voided, created_at AS "createdAt", updated_at AS "updatedAt"`,
        [activityCode, activityName, indicatorId, description]
      );
      const row = r.rows?.[0];
      const ind = firstRow(
        await pool.query(
          `SELECT i.name AS "indicatorName", mt.code AS "measurementTypeCode", mt.label AS "measurementTypeLabel"
           FROM planning_indicators i
           INNER JOIN planning_measurement_types mt ON mt.id = i.measurement_type_id AND mt.voided = false
           WHERE i.id = $1 AND i.voided = false`,
          [indicatorId]
        )
      );
      return res.status(201).json({ ...row, ...ind });
    }
    const [ins] = await pool.query(
      `INSERT INTO planning_project_activities (activity_code, activity_name, indicator_id, description) VALUES (?,?,?,?)`,
      [activityCode, activityName, indicatorId, description]
    );
    const [rows] = await pool.query(
      `SELECT a.id, a.activity_code AS activityCode, a.activity_name AS activityName,
              a.indicator_id AS indicatorId, a.description, a.voided,
              a.created_at AS createdAt, a.updated_at AS updatedAt,
              i.name AS indicatorName,
              mt.code AS measurementTypeCode, mt.label AS measurementTypeLabel
       FROM planning_project_activities a
       INNER JOIN planning_indicators i ON i.id = a.indicator_id
       INNER JOIN planning_measurement_types mt ON mt.id = i.measurement_type_id AND mt.voided = 0
       WHERE a.id = ?`,
      [ins.insertId]
    );
    res.status(201).json(rows?.[0]);
  } catch (e) {
    if (String(e.message).includes('unique') || String(e.code) === '23505') {
      return res.status(409).json({ message: 'An activity with this code already exists.' });
    }
    if (String(e.message).includes('foreign key') || String(e.code) === '23503') {
      return res.status(400).json({ message: 'Invalid indicator or indicator is not available.' });
    }
    res.status(500).json({ message: e.message });
  }
});

router.put('/project-activities/:id', canWrite, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid id.' });
  const activityName = String(req.body.activityName || req.body.activity_name || '').trim();
  const description = req.body.description != null ? String(req.body.description).trim() : null;
  const indicatorId = Number(req.body.indicatorId ?? req.body.indicator_id);
  if (!activityName) return res.status(400).json({ message: 'activityName is required.' });
  if (!Number.isFinite(indicatorId)) return res.status(400).json({ message: 'indicatorId is required.' });
  try {
    if (isPostgres) {
      const r = await pool.query(
        `UPDATE planning_project_activities
         SET activity_name = $1, indicator_id = $2, description = $3, updated_at = NOW()
         WHERE id = $4 AND voided = false
         RETURNING id, activity_code AS "activityCode", activity_name AS "activityName",
                   indicator_id AS "indicatorId", description, voided, created_at AS "createdAt", updated_at AS "updatedAt"`,
        [activityName, indicatorId, description, id]
      );
      if (!r.rowCount) return res.status(404).json({ message: 'Not found.' });
      const ind = firstRow(
        await pool.query(
          `SELECT i.name AS "indicatorName", mt.code AS "measurementTypeCode", mt.label AS "measurementTypeLabel"
           FROM planning_indicators i
           INNER JOIN planning_measurement_types mt ON mt.id = i.measurement_type_id AND mt.voided = false
           WHERE i.id = $1 AND i.voided = false`,
          [indicatorId]
        )
      );
      return res.json({ ...r.rows[0], ...ind });
    }
    const [u] = await pool.query(
      `UPDATE planning_project_activities SET activity_name = ?, indicator_id = ?, description = ?, updated_at = NOW() WHERE id = ? AND voided = 0`,
      [activityName, indicatorId, description, id]
    );
    if (!u.affectedRows) return res.status(404).json({ message: 'Not found.' });
    const [rows] = await pool.query(
      `SELECT a.id, a.activity_code AS activityCode, a.activity_name AS activityName,
              a.indicator_id AS indicatorId, a.description, a.voided,
              a.created_at AS createdAt, a.updated_at AS updatedAt,
              i.name AS indicatorName,
              mt.code AS measurementTypeCode, mt.label AS measurementTypeLabel
       FROM planning_project_activities a
       INNER JOIN planning_indicators i ON i.id = a.indicator_id
       INNER JOIN planning_measurement_types mt ON mt.id = i.measurement_type_id AND mt.voided = 0
       WHERE a.id = ?`,
      [id]
    );
    res.json(rows?.[0]);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

router.delete('/project-activities/:id', canWrite, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid id.' });
  try {
    if (isPostgres) {
      const r = await pool.query(`UPDATE planning_project_activities SET voided = true, updated_at = NOW() WHERE id = $1`, [id]);
      if (!r.rowCount) return res.status(404).json({ message: 'Not found.' });
    } else {
      const [u] = await pool.query(`UPDATE planning_project_activities SET voided = 1, updated_at = NOW() WHERE id = ?`, [id]);
      if (!u.affectedRows) return res.status(404).json({ message: 'Not found.' });
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

/** Standard project risk register (code, name, description). */
router.get('/project-risks', canRead, async (req, res) => {
  try {
    if (isPostgres) {
      const r = await pool.query(
        `SELECT id, risk_code AS "riskCode", risk_name AS "riskName", description, voided,
                created_at AS "createdAt", updated_at AS "updatedAt"
         FROM planning_project_risks
         WHERE voided = false
         ORDER BY risk_code ASC`
      );
      return res.json(r.rows || []);
    }
    const [rows] = await pool.query(
      `SELECT id, risk_code AS riskCode, risk_name AS riskName, description, voided,
              created_at AS createdAt, updated_at AS updatedAt
       FROM planning_project_risks
       WHERE voided = 0
       ORDER BY risk_code ASC`
    );
    res.json(rows || []);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

router.post('/project-risks', canWrite, async (req, res) => {
  const riskCode = String(req.body.riskCode || req.body.risk_code || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
  const riskName = String(req.body.riskName || req.body.risk_name || '').trim();
  const description = req.body.description != null ? String(req.body.description).trim() : null;
  if (!riskCode || !riskName) return res.status(400).json({ message: 'riskCode and riskName are required.' });
  try {
    if (isPostgres) {
      const r = await pool.query(
        `INSERT INTO planning_project_risks (risk_code, risk_name, description)
         VALUES ($1, $2, $3)
         RETURNING id, risk_code AS "riskCode", risk_name AS "riskName", description, voided,
                   created_at AS "createdAt", updated_at AS "updatedAt"`,
        [riskCode, riskName, description]
      );
      return res.status(201).json(r.rows?.[0]);
    }
    const [ins] = await pool.query(
      `INSERT INTO planning_project_risks (risk_code, risk_name, description) VALUES (?,?,?)`,
      [riskCode, riskName, description]
    );
    const [rows] = await pool.query(
      `SELECT id, risk_code AS riskCode, risk_name AS riskName, description, voided,
              created_at AS createdAt, updated_at AS updatedAt
       FROM planning_project_risks WHERE id = ?`,
      [ins.insertId]
    );
    res.status(201).json(rows?.[0]);
  } catch (e) {
    if (String(e.message).includes('unique') || String(e.code) === '23505') {
      return res.status(409).json({ message: 'A risk with this code already exists.' });
    }
    res.status(500).json({ message: e.message });
  }
});

router.put('/project-risks/:id', canWrite, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid id.' });
  const riskName = String(req.body.riskName || req.body.risk_name || '').trim();
  const description = req.body.description != null ? String(req.body.description).trim() : null;
  if (!riskName) return res.status(400).json({ message: 'riskName is required.' });
  try {
    if (isPostgres) {
      const r = await pool.query(
        `UPDATE planning_project_risks
         SET risk_name = $1, description = $2, updated_at = NOW()
         WHERE id = $3 AND voided = false
         RETURNING id, risk_code AS "riskCode", risk_name AS "riskName", description, voided,
                   created_at AS "createdAt", updated_at AS "updatedAt"`,
        [riskName, description, id]
      );
      if (!r.rowCount) return res.status(404).json({ message: 'Not found.' });
      return res.json(r.rows[0]);
    }
    const [u] = await pool.query(
      `UPDATE planning_project_risks SET risk_name = ?, description = ?, updated_at = NOW() WHERE id = ? AND voided = 0`,
      [riskName, description, id]
    );
    if (!u.affectedRows) return res.status(404).json({ message: 'Not found.' });
    const [rows] = await pool.query(
      `SELECT id, risk_code AS riskCode, risk_name AS riskName, description, voided,
              created_at AS createdAt, updated_at AS updatedAt
       FROM planning_project_risks WHERE id = ?`,
      [id]
    );
    res.json(rows?.[0]);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

router.delete('/project-risks/:id', canWrite, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid id.' });
  try {
    if (isPostgres) {
      const r = await pool.query(`UPDATE planning_project_risks SET voided = true, updated_at = NOW() WHERE id = $1`, [id]);
      if (!r.rowCount) return res.status(404).json({ message: 'Not found.' });
    } else {
      const [u] = await pool.query(`UPDATE planning_project_risks SET voided = 1, updated_at = NOW() WHERE id = ?`, [id]);
      if (!u.affectedRows) return res.status(404).json({ message: 'Not found.' });
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

router.ensurePlanningIndicatorTables = ensureTables;
module.exports = router;
