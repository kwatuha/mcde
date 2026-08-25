const express = require('express');
const pool = require('../config/db');
const privilege = require('../middleware/privilegeMiddleware');
const {
  ensureImpactSchema,
  normalizeResultLevel,
} = require('../services/impactOutcomesService');

const router = express.Router();
const DB_TYPE = process.env.DB_TYPE || 'mysql';
const isPostgres = DB_TYPE === 'postgresql';

const canAccess = privilege(['project.read_all', 'project.update'], { anyOf: true });
const canWrite = privilege(['project.update'], { anyOf: true });

let ensured = false;
async function ensureTable() {
  if (ensured) return;
  if (isPostgres) {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS project_evaluations (
        id BIGSERIAL PRIMARY KEY,
        project_id BIGINT NOT NULL,
        evaluation_date DATE NULL,
        project_code TEXT NULL,
        project_name TEXT NULL,
        activity_code TEXT NULL,
        activity_name TEXT NULL,
        indicator_name TEXT NULL,
        milestone_value NUMERIC NULL,
        baseline_value NUMERIC NULL,
        achieved_value NUMERIC NULL,
        performance_score NUMERIC NULL,
        voided BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_project_evaluations_project ON project_evaluations(project_id)`);
    await pool.query(`ALTER TABLE project_evaluations ADD COLUMN IF NOT EXISTS evaluation_date DATE NULL`);
    await pool.query(`ALTER TABLE project_evaluations ADD COLUMN IF NOT EXISTS baseline_value NUMERIC NULL`);
    await ensureImpactSchema();
  } else {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS project_evaluations (
        id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        project_id BIGINT NOT NULL,
        evaluation_date DATE NULL,
        project_code VARCHAR(128) NULL,
        project_name VARCHAR(512) NULL,
        activity_code VARCHAR(128) NULL,
        activity_name VARCHAR(512) NULL,
        indicator_name VARCHAR(512) NULL,
        milestone_value DECIMAL(18,2) NULL,
        baseline_value DECIMAL(18,2) NULL,
        achieved_value DECIMAL(18,2) NULL,
        performance_score DECIMAL(8,2) NULL,
        voided TINYINT(1) NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_project_evaluations_project (project_id)
      )
    `);
    try {
      await pool.query(`ALTER TABLE project_evaluations ADD COLUMN evaluation_date DATE NULL`);
    } catch (e) {
      const msg = String(e?.message || '').toLowerCase();
      const code = String(e?.code || '');
      if (!msg.includes('duplicate column') && code !== 'ER_DUP_FIELDNAME') throw e;
    }
    try {
      await pool.query(`ALTER TABLE project_evaluations ADD COLUMN baseline_value DECIMAL(18,2) NULL`);
    } catch (e) {
      const msg = String(e?.message || '').toLowerCase();
      const code = String(e?.code || '');
      if (!msg.includes('duplicate column') && code !== 'ER_DUP_FIELDNAME') throw e;
    }
  }
  ensured = true;
}

function toNumOrNull(v) {
  if (v === '' || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function evalSelectCols() {
  return `id, project_id AS "projectId",
                evaluation_date AS "evaluationDate",
                project_code AS "projectCode", project_name AS "projectName",
                activity_code AS "activityCode", activity_name AS "activityName",
                indicator_name AS "indicatorName", milestone_value AS "milestoneValue",
                baseline_value AS "baselineValue",
                achieved_value AS "achievedValue", performance_score AS "performanceScore",
                reporting_period AS "reportingPeriod",
                result_level AS "resultLevel",
                remarks,
                created_at AS "createdAt", updated_at AS "updatedAt"`;
}

function evalSelectColsMysql() {
  return `id, project_id AS projectId,
              evaluation_date AS evaluationDate,
              project_code AS projectCode, project_name AS projectName,
              activity_code AS activityCode, activity_name AS activityName,
              indicator_name AS indicatorName, milestone_value AS milestoneValue,
              baseline_value AS baselineValue,
              achieved_value AS achievedValue, performance_score AS performanceScore,
              reporting_period AS reportingPeriod,
              result_level AS resultLevel,
              remarks,
              created_at AS createdAt, updated_at AS updatedAt`;
}

function buildPayload(body) {
  return {
    projectCode: body.projectCode ?? body.project_code ?? null,
    projectName: body.projectName ?? body.project_name ?? null,
    activityCode: body.activityCode ?? body.activity_code ?? null,
    activityName: body.activityName ?? body.activity_name ?? null,
    indicatorName: body.indicatorName ?? body.indicator_name ?? null,
    evaluationDate: body.evaluationDate ?? body.evaluation_date ?? null,
    milestoneValue: toNumOrNull(body.milestoneValue ?? body.milestone_value),
    baselineValue: toNumOrNull(body.baselineValue ?? body.baseline_value),
    achievedValue: toNumOrNull(body.achievedValue ?? body.achieved_value),
    performanceScore: toNumOrNull(body.performanceScore ?? body.performance_score),
    reportingPeriod: body.reportingPeriod ?? body.reporting_period ?? null,
    resultLevel: normalizeResultLevel(body.resultLevel ?? body.result_level, 'output'),
    remarks: body.remarks != null ? String(body.remarks) : null,
  };
}

router.use(async (_req, res, next) => {
  try {
    await ensureTable();
    next();
  } catch (e) {
    res.status(500).json({ message: e?.message || 'Failed to initialize project evaluation storage.' });
  }
});

router.get('/evaluation', canAccess, async (req, res) => {
  const projectId = Number(req.query.projectId);
  if (!Number.isFinite(projectId)) return res.status(400).json({ message: 'projectId query parameter is required.' });
  try {
    if (isPostgres) {
      const r = await pool.query(
        `SELECT ${evalSelectCols()}
         FROM project_evaluations
         WHERE project_id = $1 AND voided = false
         ORDER BY created_at ASC`,
        [projectId]
      );
      return res.json(r.rows || []);
    }
    const [rows] = await pool.query(
      `SELECT ${evalSelectColsMysql()}
       FROM project_evaluations
       WHERE project_id = ? AND voided = 0
       ORDER BY created_at ASC`,
      [projectId]
    );
    res.json(rows || []);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

router.post('/evaluation', canWrite, async (req, res) => {
  const projectId = Number(req.body.projectId ?? req.body.project_id);
  if (!Number.isFinite(projectId)) return res.status(400).json({ message: 'projectId is required.' });
  const payload = buildPayload(req.body);
  try {
    if (isPostgres) {
      const r = await pool.query(
        `INSERT INTO project_evaluations
         (project_id, evaluation_date, project_code, project_name, activity_code, activity_name, indicator_name,
          milestone_value, baseline_value, achieved_value, performance_score, reporting_period, result_level, remarks)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
         RETURNING ${evalSelectCols()}`,
        [
          projectId,
          payload.evaluationDate,
          payload.projectCode,
          payload.projectName,
          payload.activityCode,
          payload.activityName,
          payload.indicatorName,
          payload.milestoneValue,
          payload.baselineValue,
          payload.achievedValue,
          payload.performanceScore,
          payload.reportingPeriod,
          payload.resultLevel,
          payload.remarks,
        ]
      );
      return res.status(201).json(r.rows?.[0]);
    }
    const [ins] = await pool.query(
      `INSERT INTO project_evaluations
       (project_id, evaluation_date, project_code, project_name, activity_code, activity_name, indicator_name,
        milestone_value, baseline_value, achieved_value, performance_score, reporting_period, result_level, remarks)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        projectId,
        payload.evaluationDate,
        payload.projectCode,
        payload.projectName,
        payload.activityCode,
        payload.activityName,
        payload.indicatorName,
        payload.milestoneValue,
        payload.baselineValue,
        payload.achievedValue,
        payload.performanceScore,
        payload.reportingPeriod,
        payload.resultLevel,
        payload.remarks,
      ]
    );
    const [rows] = await pool.query(
      `SELECT ${evalSelectColsMysql()}
       FROM project_evaluations WHERE id = ?`,
      [ins.insertId]
    );
    res.status(201).json(rows?.[0]);
  } catch (e) {
    res.status(500).json({ message: e.message || 'Failed to save project evaluation row.' });
  }
});

router.put('/evaluation/:id', canWrite, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid id.' });
  const payload = buildPayload(req.body);
  try {
    if (isPostgres) {
      const r = await pool.query(
        `UPDATE project_evaluations
         SET project_code = $1, project_name = $2, activity_code = $3, activity_name = $4,
             indicator_name = $5, evaluation_date = $6, milestone_value = $7, baseline_value = $8,
             achieved_value = $9, performance_score = $10, reporting_period = $11, result_level = $12,
             remarks = $13, updated_at = NOW()
         WHERE id = $14 AND voided = false
         RETURNING ${evalSelectCols()}`,
        [
          payload.projectCode,
          payload.projectName,
          payload.activityCode,
          payload.activityName,
          payload.indicatorName,
          payload.evaluationDate,
          payload.milestoneValue,
          payload.baselineValue,
          payload.achievedValue,
          payload.performanceScore,
          payload.reportingPeriod,
          payload.resultLevel,
          payload.remarks,
          id,
        ]
      );
      if (!r.rowCount) return res.status(404).json({ message: 'Evaluation row not found.' });
      return res.json(r.rows[0]);
    }
    const [u] = await pool.query(
      `UPDATE project_evaluations
       SET project_code = ?, project_name = ?, activity_code = ?, activity_name = ?,
           indicator_name = ?, evaluation_date = ?, milestone_value = ?, baseline_value = ?,
           achieved_value = ?, performance_score = ?, reporting_period = ?, result_level = ?,
           remarks = ?, updated_at = NOW()
       WHERE id = ? AND voided = 0`,
      [
        payload.projectCode,
        payload.projectName,
        payload.activityCode,
        payload.activityName,
        payload.indicatorName,
        payload.evaluationDate,
        payload.milestoneValue,
        payload.baselineValue,
        payload.achievedValue,
        payload.performanceScore,
        payload.reportingPeriod,
        payload.resultLevel,
        payload.remarks,
        id,
      ]
    );
    if (!u.affectedRows) return res.status(404).json({ message: 'Evaluation row not found.' });
    const [rows] = await pool.query(
      `SELECT ${evalSelectColsMysql()} FROM project_evaluations WHERE id = ?`,
      [id]
    );
    res.json(rows?.[0]);
  } catch (e) {
    res.status(500).json({ message: e.message || 'Failed to update project evaluation row.' });
  }
});

router.delete('/evaluation/:id', canWrite, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid id.' });
  try {
    if (isPostgres) {
      const r = await pool.query(
        `UPDATE project_evaluations SET voided = true, updated_at = NOW() WHERE id = $1 AND voided = false RETURNING id`,
        [id]
      );
      if (!r.rowCount) return res.status(404).json({ message: 'Evaluation row not found.' });
      return res.json({ ok: true });
    }
    const [u] = await pool.query(
      `UPDATE project_evaluations SET voided = 1, updated_at = NOW() WHERE id = ? AND voided = 0`,
      [id]
    );
    if (!u.affectedRows) return res.status(404).json({ message: 'Evaluation row not found.' });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ message: e.message || 'Failed to delete project evaluation row.' });
  }
});

module.exports = router;
