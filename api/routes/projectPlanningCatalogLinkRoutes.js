/**
 * Links projects to Planning catalog entries (activities & standard risks).
 * Paths: /api/projects/:projectId/planning-catalog/activities|risks
 */
const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const privilege = require('../middleware/privilegeMiddleware');
const planningIndicatorsRouter = require('./planningIndicatorsRoutes');

const DB_TYPE = process.env.DB_TYPE || 'mysql';
const isPostgres = DB_TYPE === 'postgresql';

const rowsFromResult = (result) =>
  isPostgres ? result?.rows || [] : Array.isArray(result) ? result[0] || [] : [];

const canRead = privilege(['project.read_all', 'strategic_plan.read_all'], { anyOf: true });
const canWrite = privilege(
  ['project.update', 'strategic_plan.update', 'strategic_plan.create'],
  { anyOf: true }
);

async function ensureLinkTables() {
  if (typeof planningIndicatorsRouter.ensurePlanningIndicatorTables === 'function') {
    await planningIndicatorsRouter.ensurePlanningIndicatorTables();
  }
}

async function assertProjectExists(projectId) {
  const id = Number(projectId);
  if (!Number.isFinite(id)) return false;
  if (isPostgres) {
    const r = await pool.query(
      'SELECT 1 FROM projects WHERE project_id = $1 AND voided = false LIMIT 1',
      [id]
    );
    return (r.rowCount || 0) > 0;
  }
  const [rows] = await pool.query(
    'SELECT 1 FROM projects WHERE id = ? AND (voided IS NULL OR voided = 0) LIMIT 1',
    [id]
  );
  return Array.isArray(rows) && rows.length > 0;
}

router.use(async (req, res, next) => {
  try {
    await ensureLinkTables();
    next();
  } catch (e) {
    console.error('projectPlanningCatalogLinkRoutes ensure tables:', e);
    res.status(500).json({ message: 'Project planning link storage init failed', error: e.message });
  }
});

/** @route GET /api/projects/:projectId/planning-catalog/activities */
router.get('/:projectId/planning-catalog/activities', canRead, async (req, res) => {
  const projectId = Number(req.params.projectId);
  if (!Number.isFinite(projectId)) return res.status(400).json({ message: 'Invalid project id.' });
  try {
    if (!(await assertProjectExists(projectId))) {
      return res.status(404).json({ message: 'Project not found.' });
    }
    if (isPostgres) {
      const r = await pool.query(
        `SELECT l.id, l.project_id AS "projectId", l.planning_activity_id AS "planningActivityId",
                l.target_value AS "targetValue", l.notes, l.created_at AS "createdAt",
                a.activity_code AS "activityCode", a.activity_name AS "activityName",
                i.name AS "indicatorName",
                mt.label AS "measurementTypeLabel"
         FROM project_planning_activity_links l
         INNER JOIN planning_project_activities a ON a.id = l.planning_activity_id AND a.voided = false
         INNER JOIN planning_indicators i ON i.id = a.indicator_id AND i.voided = false
         LEFT JOIN planning_measurement_types mt ON mt.id = i.measurement_type_id AND mt.voided = false
         WHERE l.project_id = $1 AND l.voided = false
         ORDER BY a.activity_code ASC`,
        [projectId]
      );
      return res.json(r.rows || []);
    }
    const [rows] = await pool.query(
      `SELECT l.id, l.project_id AS projectId, l.planning_activity_id AS planningActivityId,
              l.target_value AS targetValue, l.notes, l.created_at AS createdAt,
              a.activity_code AS activityCode, a.activity_name AS activityName,
              i.name AS indicatorName,
              mt.label AS measurementTypeLabel
       FROM project_planning_activity_links l
       INNER JOIN planning_project_activities a ON a.id = l.planning_activity_id AND a.voided = 0
       INNER JOIN planning_indicators i ON i.id = a.indicator_id AND i.voided = 0
       LEFT JOIN planning_measurement_types mt ON mt.id = i.measurement_type_id AND mt.voided = 0
       WHERE l.project_id = ? AND l.voided = 0
       ORDER BY a.activity_code ASC`,
      [projectId]
    );
    res.json(rows || []);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

/** @route POST /api/projects/:projectId/planning-catalog/activities */
router.post('/:projectId/planning-catalog/activities', canWrite, async (req, res) => {
  const projectId = Number(req.params.projectId);
  if (!Number.isFinite(projectId)) return res.status(400).json({ message: 'Invalid project id.' });
  const activityId = Number(req.body.activityId ?? req.body.planningActivityId ?? req.body.planning_activity_id);
  const targetValueRaw = req.body.targetValue ?? req.body.target_value;
  const targetValue =
    targetValueRaw === '' || targetValueRaw == null ? null : Number(targetValueRaw);
  const notes = req.body.notes != null ? String(req.body.notes).trim() : null;
  if (!Number.isFinite(activityId)) return res.status(400).json({ message: 'activityId is required.' });
  if (targetValueRaw !== '' && targetValueRaw != null && !Number.isFinite(targetValue)) {
    return res.status(400).json({ message: 'targetValue must be numeric when provided.' });
  }
  try {
    if (!(await assertProjectExists(projectId))) {
      return res.status(404).json({ message: 'Project not found.' });
    }
    if (isPostgres) {
      const r = await pool.query(
        `INSERT INTO project_planning_activity_links (project_id, planning_activity_id, target_value, notes)
         VALUES ($1, $2, $3, $4)
         RETURNING id, project_id AS "projectId", planning_activity_id AS "planningActivityId",
                   target_value AS "targetValue", notes, voided, created_at AS "createdAt", updated_at AS "updatedAt"`,
        [projectId, activityId, targetValue, notes || null]
      );
      const row = r.rows?.[0];
      const detail = rowsFromResult(
        await pool.query(
          `SELECT l.id, l.project_id AS "projectId", l.planning_activity_id AS "planningActivityId",
                  l.target_value AS "targetValue", l.notes, l.created_at AS "createdAt",
                  a.activity_code AS "activityCode", a.activity_name AS "activityName",
                  i.name AS "indicatorName",
                  mt.label AS "measurementTypeLabel"
           FROM project_planning_activity_links l
           INNER JOIN planning_project_activities a ON a.id = l.planning_activity_id
           INNER JOIN planning_indicators i ON i.id = a.indicator_id
           LEFT JOIN planning_measurement_types mt ON mt.id = i.measurement_type_id AND mt.voided = false
           WHERE l.id = $1`,
          [row.id]
        )
      )[0];
      return res.status(201).json(detail || row);
    }
    const [ins] = await pool.query(
      `INSERT INTO project_planning_activity_links (project_id, planning_activity_id, target_value, notes) VALUES (?,?,?,?)`,
      [projectId, activityId, targetValue, notes || null]
    );
    const [rows] = await pool.query(
      `SELECT l.id, l.project_id AS projectId, l.planning_activity_id AS planningActivityId,
              l.target_value AS targetValue, l.notes, l.created_at AS createdAt,
              a.activity_code AS activityCode, a.activity_name AS activityName,
              i.name AS indicatorName,
              mt.label AS measurementTypeLabel
       FROM project_planning_activity_links l
       INNER JOIN planning_project_activities a ON a.id = l.planning_activity_id
       INNER JOIN planning_indicators i ON i.id = a.indicator_id
       LEFT JOIN planning_measurement_types mt ON mt.id = i.measurement_type_id AND mt.voided = 0
       WHERE l.id = ?`,
      [ins.insertId]
    );
    res.status(201).json(rows?.[0]);
  } catch (e) {
    if (String(e.message).includes('unique') || String(e.code) === '23505') {
      return res.status(409).json({ message: 'This activity is already linked to the project.' });
    }
    if (String(e.message).includes('foreign key') || String(e.code) === '23503') {
      return res.status(400).json({ message: 'Invalid or inactive catalog activity.' });
    }
    res.status(500).json({ message: e.message });
  }
});

/** @route DELETE /api/projects/:projectId/planning-catalog/activities/:linkId */
router.put('/:projectId/planning-catalog/activities/:linkId', canWrite, async (req, res) => {
  const projectId = Number(req.params.projectId);
  const linkId = Number(req.params.linkId);
  const targetValueRaw = req.body.targetValue ?? req.body.target_value;
  const targetValue =
    targetValueRaw === '' || targetValueRaw == null ? null : Number(targetValueRaw);
  const notes = req.body.notes != null ? String(req.body.notes).trim() : null;
  if (!Number.isFinite(projectId) || !Number.isFinite(linkId)) {
    return res.status(400).json({ message: 'Invalid id.' });
  }
  if (targetValueRaw !== '' && targetValueRaw != null && !Number.isFinite(targetValue)) {
    return res.status(400).json({ message: 'targetValue must be numeric when provided.' });
  }
  try {
    if (isPostgres) {
      const r = await pool.query(
        `UPDATE project_planning_activity_links
         SET target_value = $1, notes = $2, updated_at = NOW()
         WHERE id = $3 AND project_id = $4 AND voided = false
         RETURNING id`,
        [targetValue, notes, linkId, projectId]
      );
      if (!r.rowCount) return res.status(404).json({ message: 'Link not found.' });
      const detail = rowsFromResult(
        await pool.query(
          `SELECT l.id, l.project_id AS "projectId", l.planning_activity_id AS "planningActivityId",
                  l.target_value AS "targetValue", l.notes, l.created_at AS "createdAt",
                  a.activity_code AS "activityCode", a.activity_name AS "activityName",
                  i.name AS "indicatorName",
                  mt.label AS "measurementTypeLabel"
           FROM project_planning_activity_links l
           INNER JOIN planning_project_activities a ON a.id = l.planning_activity_id
           INNER JOIN planning_indicators i ON i.id = a.indicator_id
           LEFT JOIN planning_measurement_types mt ON mt.id = i.measurement_type_id AND mt.voided = false
           WHERE l.id = $1`,
          [linkId]
        )
      )[0];
      return res.json(detail || { ok: true });
    }
    const [u] = await pool.query(
      `UPDATE project_planning_activity_links
       SET target_value = ?, notes = ?, updated_at = NOW()
       WHERE id = ? AND project_id = ? AND voided = 0`,
      [targetValue, notes, linkId, projectId]
    );
    if (!u.affectedRows) return res.status(404).json({ message: 'Link not found.' });
    const [rows] = await pool.query(
      `SELECT l.id, l.project_id AS projectId, l.planning_activity_id AS planningActivityId,
              l.target_value AS targetValue, l.notes, l.created_at AS createdAt,
              a.activity_code AS activityCode, a.activity_name AS activityName,
              i.name AS indicatorName,
              mt.label AS measurementTypeLabel
       FROM project_planning_activity_links l
       INNER JOIN planning_project_activities a ON a.id = l.planning_activity_id
       INNER JOIN planning_indicators i ON i.id = a.indicator_id
       LEFT JOIN planning_measurement_types mt ON mt.id = i.measurement_type_id AND mt.voided = 0
       WHERE l.id = ?`,
      [linkId]
    );
    res.json(rows?.[0] || { ok: true });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

/** @route DELETE /api/projects/:projectId/planning-catalog/activities/:linkId */
router.delete('/:projectId/planning-catalog/activities/:linkId', canWrite, async (req, res) => {
  const projectId = Number(req.params.projectId);
  const linkId = Number(req.params.linkId);
  if (!Number.isFinite(projectId) || !Number.isFinite(linkId)) {
    return res.status(400).json({ message: 'Invalid id.' });
  }
  try {
    if (isPostgres) {
      const r = await pool.query(
        `UPDATE project_planning_activity_links SET voided = true, updated_at = NOW()
         WHERE id = $1 AND project_id = $2 AND voided = false`,
        [linkId, projectId]
      );
      if (!r.rowCount) return res.status(404).json({ message: 'Link not found.' });
    } else {
      const [u] = await pool.query(
        `UPDATE project_planning_activity_links SET voided = 1, updated_at = NOW() WHERE id = ? AND project_id = ? AND voided = 0`,
        [linkId, projectId]
      );
      if (!u.affectedRows) return res.status(404).json({ message: 'Link not found.' });
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

/** @route GET /api/projects/:projectId/planning-catalog/risks */
router.get('/:projectId/planning-catalog/risks', canRead, async (req, res) => {
  const projectId = Number(req.params.projectId);
  if (!Number.isFinite(projectId)) return res.status(400).json({ message: 'Invalid project id.' });
  try {
    if (!(await assertProjectExists(projectId))) {
      return res.status(404).json({ message: 'Project not found.' });
    }
    if (isPostgres) {
      const r = await pool.query(
        `SELECT l.id, l.project_id AS "projectId", l.planning_risk_id AS "planningRiskId",
                l.notes, l.created_at AS "createdAt",
                r.risk_code AS "riskCode", r.risk_name AS "riskName",
                r.description AS "catalogDescription"
         FROM project_planning_risk_links l
         INNER JOIN planning_project_risks r ON r.id = l.planning_risk_id AND r.voided = false
         WHERE l.project_id = $1 AND l.voided = false
         ORDER BY r.risk_code ASC`,
        [projectId]
      );
      return res.json(r.rows || []);
    }
    const [rows] = await pool.query(
      `SELECT l.id, l.project_id AS projectId, l.planning_risk_id AS planningRiskId,
              l.notes, l.created_at AS createdAt,
              r.risk_code AS riskCode, r.risk_name AS riskName,
              r.description AS catalogDescription
       FROM project_planning_risk_links l
       INNER JOIN planning_project_risks r ON r.id = l.planning_risk_id AND r.voided = 0
       WHERE l.project_id = ? AND l.voided = 0
       ORDER BY r.risk_code ASC`,
      [projectId]
    );
    res.json(rows || []);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

/** @route POST /api/projects/:projectId/planning-catalog/risks */
router.post('/:projectId/planning-catalog/risks', canWrite, async (req, res) => {
  const projectId = Number(req.params.projectId);
  if (!Number.isFinite(projectId)) return res.status(400).json({ message: 'Invalid project id.' });
  const riskId = Number(req.body.riskId ?? req.body.planningRiskId ?? req.body.planning_risk_id);
  const notes = req.body.notes != null ? String(req.body.notes).trim() : null;
  if (!Number.isFinite(riskId)) return res.status(400).json({ message: 'riskId is required.' });
  try {
    if (!(await assertProjectExists(projectId))) {
      return res.status(404).json({ message: 'Project not found.' });
    }
    if (isPostgres) {
      const r = await pool.query(
        `INSERT INTO project_planning_risk_links (project_id, planning_risk_id, notes)
         VALUES ($1, $2, $3)
         RETURNING id, project_id AS "projectId", planning_risk_id AS "planningRiskId",
                   notes, voided, created_at AS "createdAt", updated_at AS "updatedAt"`,
        [projectId, riskId, notes || null]
      );
      const row = r.rows?.[0];
      const detail = rowsFromResult(
        await pool.query(
          `SELECT l.id, l.project_id AS "projectId", l.planning_risk_id AS "planningRiskId",
                  l.notes, l.created_at AS "createdAt",
                  r.risk_code AS "riskCode", r.risk_name AS "riskName",
                  r.description AS "catalogDescription"
           FROM project_planning_risk_links l
           INNER JOIN planning_project_risks r ON r.id = l.planning_risk_id
           WHERE l.id = $1`,
          [row.id]
        )
      )[0];
      return res.status(201).json(detail || row);
    }
    const [ins] = await pool.query(
      `INSERT INTO project_planning_risk_links (project_id, planning_risk_id, notes) VALUES (?,?,?)`,
      [projectId, riskId, notes || null]
    );
    const [rows] = await pool.query(
      `SELECT l.id, l.project_id AS projectId, l.planning_risk_id AS planningRiskId,
              l.notes, l.created_at AS createdAt,
              r.risk_code AS riskCode, r.risk_name AS riskName,
              r.description AS catalogDescription
       FROM project_planning_risk_links l
       INNER JOIN planning_project_risks r ON r.id = l.planning_risk_id
       WHERE l.id = ?`,
      [ins.insertId]
    );
    res.status(201).json(rows?.[0]);
  } catch (e) {
    if (String(e.message).includes('unique') || String(e.code) === '23505') {
      return res.status(409).json({ message: 'This risk is already linked to the project.' });
    }
    if (String(e.message).includes('foreign key') || String(e.code) === '23503') {
      return res.status(400).json({ message: 'Invalid or inactive catalog risk.' });
    }
    res.status(500).json({ message: e.message });
  }
});

/** @route DELETE /api/projects/:projectId/planning-catalog/risks/:linkId */
router.delete('/:projectId/planning-catalog/risks/:linkId', canWrite, async (req, res) => {
  const projectId = Number(req.params.projectId);
  const linkId = Number(req.params.linkId);
  if (!Number.isFinite(projectId) || !Number.isFinite(linkId)) {
    return res.status(400).json({ message: 'Invalid id.' });
  }
  try {
    if (isPostgres) {
      const r = await pool.query(
        `UPDATE project_planning_risk_links SET voided = true, updated_at = NOW()
         WHERE id = $1 AND project_id = $2 AND voided = false`,
        [linkId, projectId]
      );
      if (!r.rowCount) return res.status(404).json({ message: 'Link not found.' });
    } else {
      const [u] = await pool.query(
        `UPDATE project_planning_risk_links SET voided = 1, updated_at = NOW() WHERE id = ? AND project_id = ? AND voided = 0`,
        [linkId, projectId]
      );
      if (!u.affectedRows) return res.status(404).json({ message: 'Link not found.' });
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

module.exports = router;
