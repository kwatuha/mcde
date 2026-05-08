const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

const DB_TYPE = process.env.DB_TYPE || 'postgresql';
const isPostgres = DB_TYPE === 'postgresql';

/** Default workflow stage labels (seed once into procurement_stages). Matches legacy Procurement UI. */
const PROCUREMENT_STAGE_SEED_LABELS = [
  'Needs Identification',
  'Requisition Approved',
  'Tender Published',
  'Bid Evaluation',
  'Award Decision',
  'Contract Signing',
  'Purchase Order Issued',
];

const rowsOf = (result) => {
  if (Array.isArray(result)) return result[0] || [];
  if (result && Array.isArray(result.rows)) return result.rows;
  return [];
};
const isSchemaError = (error) => {
  const msg = String(error?.message || '').toLowerCase();
  return (
    (msg.includes('relation') && msg.includes('does not exist')) ||
    (msg.includes('column') && msg.includes('does not exist')) ||
    msg.includes('operator does not exist') ||
    msg.includes('invalid input syntax')
  );
};

let procurementSchemaEnsured = false;
const uploadsDir = path.join(__dirname, '..', '..', 'uploads', 'documents');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadsDir),
    filename: (_req, file, cb) => cb(null, `${Date.now()}-${String(file.originalname || 'file').replace(/\s+/g, '_')}`),
  }),
});

async function ensureProcurementWorkflowTable() {
  if (isPostgres) {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS project_procurement_workflow (
        id BIGSERIAL PRIMARY KEY,
        project_id BIGINT NOT NULL,
        stage VARCHAR(100) NOT NULL,
        decision VARCHAR(100) NULL,
        notes TEXT NULL,
        actor_id BIGINT NULL,
        created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
        voided BOOLEAN NOT NULL DEFAULT FALSE
      )
    `);
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_project_procurement_workflow_project
       ON project_procurement_workflow(project_id)`
    );
  } else {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS project_procurement_workflow (
        id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        project_id BIGINT NOT NULL,
        stage VARCHAR(100) NOT NULL,
        decision VARCHAR(100) NULL,
        notes TEXT NULL,
        actor_id BIGINT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        voided TINYINT(1) NOT NULL DEFAULT 0,
        INDEX idx_project_procurement_workflow_project (project_id)
      )
    `);
  }
}

async function ensureProcurementStagesTable() {
  if (isPostgres) {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS procurement_stages (
        id BIGSERIAL PRIMARY KEY,
        label VARCHAR(200) NOT NULL,
        sort_order INT NOT NULL DEFAULT 0,
        active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
        voided BOOLEAN NOT NULL DEFAULT FALSE
      )
    `);
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_procurement_stages_sort
       ON procurement_stages (voided, active, sort_order)`
    );
  } else {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS procurement_stages (
        id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        label VARCHAR(200) NOT NULL,
        sort_order INT NOT NULL DEFAULT 0,
        active TINYINT(1) NOT NULL DEFAULT 1,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        voided TINYINT(1) NOT NULL DEFAULT 0,
        INDEX idx_procurement_stages_sort (voided, active, sort_order)
      )
    `);
  }
}

async function ensureProcurementAttachmentsTable() {
  if (isPostgres) {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS procurement_attachments (
        id BIGSERIAL PRIMARY KEY,
        project_id BIGINT NOT NULL,
        stage VARCHAR(200) NULL,
        file_name VARCHAR(255) NOT NULL,
        file_path TEXT NOT NULL,
        mime_type VARCHAR(120) NULL,
        file_size BIGINT NULL,
        title VARCHAR(255) NULL,
        notes TEXT NULL,
        uploaded_by BIGINT NULL,
        created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
        voided BOOLEAN NOT NULL DEFAULT FALSE
      )
    `);
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_procurement_attachments_project_stage
       ON procurement_attachments(project_id, stage, voided, created_at DESC)`
    );
  } else {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS procurement_attachments (
        id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        project_id BIGINT NOT NULL,
        stage VARCHAR(200) NULL,
        file_name VARCHAR(255) NOT NULL,
        file_path TEXT NOT NULL,
        mime_type VARCHAR(120) NULL,
        file_size BIGINT NULL,
        title VARCHAR(255) NULL,
        notes TEXT NULL,
        uploaded_by BIGINT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        voided TINYINT(1) NOT NULL DEFAULT 0,
        INDEX idx_procurement_attachments_project_stage (project_id, stage, voided, created_at)
      )
    `);
  }
}

async function ensureProcurementChecklistTable() {
  if (isPostgres) {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS procurement_checklist_items (
        id BIGSERIAL PRIMARY KEY,
        project_id BIGINT NOT NULL,
        stage VARCHAR(200) NULL,
        label VARCHAR(255) NOT NULL,
        notes TEXT NULL,
        completed BOOLEAN NOT NULL DEFAULT FALSE,
        completed_at TIMESTAMP WITHOUT TIME ZONE NULL,
        completed_by BIGINT NULL,
        created_by BIGINT NULL,
        created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
        voided BOOLEAN NOT NULL DEFAULT FALSE
      )
    `);
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_procurement_checklist_project_stage
       ON procurement_checklist_items(project_id, stage, voided, created_at DESC)`
    );
  } else {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS procurement_checklist_items (
        id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        project_id BIGINT NOT NULL,
        stage VARCHAR(200) NULL,
        label VARCHAR(255) NOT NULL,
        notes TEXT NULL,
        completed TINYINT(1) NOT NULL DEFAULT 0,
        completed_at DATETIME NULL,
        completed_by BIGINT NULL,
        created_by BIGINT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        voided TINYINT(1) NOT NULL DEFAULT 0,
        INDEX idx_procurement_checklist_project_stage (project_id, stage, voided, created_at)
      )
    `);
  }
}

async function seedProcurementStagesIfNeeded() {
  let ord = 0;
  for (const label of PROCUREMENT_STAGE_SEED_LABELS) {
    const trimmed = String(label || '').trim();
    if (!trimmed) continue;
    if (isPostgres) {
      await pool.query(
        `INSERT INTO procurement_stages (label, sort_order, active, voided, created_at, updated_at)
         SELECT $1::varchar, $2::int, TRUE, FALSE, NOW(), NOW()
         WHERE NOT EXISTS (
           SELECT 1 FROM procurement_stages ps
           WHERE COALESCE(ps.voided, false) = false
             AND LOWER(TRIM(ps.label)) = LOWER(TRIM($1::varchar))
         )`,
        [trimmed, ord]
      );
    } else {
      const exists = await pool.query(
        `SELECT id FROM procurement_stages
         WHERE COALESCE(voided, 0) = 0 AND LOWER(TRIM(label)) = LOWER(?)
         LIMIT 1`,
        [trimmed]
      );
      if (!rowsOf(exists).length) {
        await pool.query(
          `INSERT INTO procurement_stages (label, sort_order, active, voided, created_at, updated_at)
           VALUES (?, ?, 1, 0, NOW(), NOW())`,
          [trimmed, ord]
        );
      }
    }
    ord += 1;
  }
}

async function ensureProcurementSchema() {
  if (procurementSchemaEnsured) return;
  await ensureProcurementWorkflowTable();
  await ensureProcurementStagesTable();
  await ensureProcurementAttachmentsTable();
  await ensureProcurementChecklistTable();
  await seedProcurementStagesIfNeeded();
  procurementSchemaEnsured = true;
}

async function isActiveProcurementStage(stageLabel) {
  const s = String(stageLabel || '').trim();
  if (!s) return false;
  const sql = isPostgres
    ? `SELECT 1 FROM procurement_stages
       WHERE COALESCE(voided, false) = false AND active = true AND label = $1 LIMIT 1`
    : `SELECT 1 FROM procurement_stages
       WHERE COALESCE(voided, 0) = 0 AND COALESCE(active, 0) = 1 AND label = ? LIMIT 1`;
  const r = await pool.query(sql, [s]);
  return rowsOf(r).length > 0;
}

async function duplicateStageLabel(label, excludeId) {
  const s = String(label || '').trim();
  if (!s) return false;
  const ex = excludeId != null && Number.isFinite(Number(excludeId)) ? Number(excludeId) : null;
  const sql =
    ex != null
      ? isPostgres
        ? `SELECT 1 FROM procurement_stages
           WHERE COALESCE(voided, false) = false AND LOWER(TRIM(label)) = LOWER(TRIM($1)) AND id <> $2 LIMIT 1`
        : `SELECT 1 FROM procurement_stages
           WHERE COALESCE(voided, 0) = 0 AND LOWER(TRIM(label)) = LOWER(?) AND id <> ? LIMIT 1`
      : isPostgres
        ? `SELECT 1 FROM procurement_stages
           WHERE COALESCE(voided, false) = false AND LOWER(TRIM(label)) = LOWER(TRIM($1)) LIMIT 1`
        : `SELECT 1 FROM procurement_stages
           WHERE COALESCE(voided, 0) = 0 AND LOWER(TRIM(label)) = LOWER(?) LIMIT 1`;
  const params = ex != null ? [s, ex] : [s];
  const r = await pool.query(sql, params);
  return rowsOf(r).length > 0;
}

function mapStageRow(row) {
  if (!row) return null;
  const active =
    row.active === true ||
    row.active === 1 ||
    row.active === '1' ||
    String(row.active).toLowerCase() === 'true';
  return {
    id: row.id,
    label: row.label,
    sortOrder: row.sort_order != null ? Number(row.sort_order) : 0,
    active,
    createdAt: row.created_at || row.createdAt,
    updatedAt: row.updated_at || row.updatedAt,
  };
}

router.get('/stages', async (req, res) => {
  try {
    await ensureProcurementSchema();
    const includeInactive =
      String(req.query.all || '').trim() === '1' || String(req.query.all || '').toLowerCase() === 'true';
    const sql = includeInactive
      ? isPostgres
        ? `SELECT id, label, sort_order, active, created_at, updated_at
           FROM procurement_stages WHERE COALESCE(voided, false) = false
           ORDER BY sort_order ASC, id ASC`
        : `SELECT id, label, sort_order, active, created_at, updated_at
           FROM procurement_stages WHERE COALESCE(voided, 0) = 0
           ORDER BY sort_order ASC, id ASC`
      : isPostgres
        ? `SELECT id, label, sort_order, active, created_at, updated_at
           FROM procurement_stages
           WHERE COALESCE(voided, false) = false AND COALESCE(active, true) = true
           ORDER BY sort_order ASC, id ASC`
        : `SELECT id, label, sort_order, active, created_at, updated_at
           FROM procurement_stages
           WHERE COALESCE(voided, 0) = 0 AND COALESCE(active, 1) = 1
           ORDER BY sort_order ASC, id ASC`;
    const result = await pool.query(sql);
    const rows = rowsOf(result).map(mapStageRow);
    return res.status(200).json(rows);
  } catch (error) {
    console.error('Error listing procurement stages:', error);
    return res.status(500).json({ message: 'Error listing procurement stages', error: error.message });
  }
});

router.post('/stages', async (req, res) => {
  try {
    await ensureProcurementSchema();
    const label = String(req.body?.label || '').trim();
    if (!label) return res.status(400).json({ message: 'label is required.' });
    if (await duplicateStageLabel(label, null)) {
      return res.status(409).json({ message: 'A stage with this label already exists.' });
    }
    let sortOrder = Number(req.body?.sort_order ?? req.body?.sortOrder);
    if (!Number.isFinite(sortOrder)) sortOrder = 0;
    const activeRaw = req.body?.active;
    const active =
      activeRaw === undefined || activeRaw === null ? true : Boolean(activeRaw === true || activeRaw === 1 || activeRaw === '1');

    if (isPostgres) {
      const result = await pool.query(
        `INSERT INTO procurement_stages (label, sort_order, active, voided, created_at, updated_at)
         VALUES ($1, $2, $3, false, NOW(), NOW())
         RETURNING id, label, sort_order, active, created_at, updated_at`,
        [label, sortOrder, active]
      );
      return res.status(201).json(mapStageRow(rowsOf(result)[0]));
    }
    const ins = await pool.query(
      `INSERT INTO procurement_stages (label, sort_order, active, voided, created_at, updated_at)
       VALUES (?, ?, ?, 0, NOW(), NOW())`,
      [label, sortOrder, active ? 1 : 0]
    );
    const insertId = ins?.insertId ?? ins?.[0]?.insertId;
    const sel = await pool.query(
      `SELECT id, label, sort_order, active, created_at, updated_at FROM procurement_stages WHERE id = ?`,
      [insertId]
    );
    return res.status(201).json(mapStageRow(rowsOf(sel)[0]));
  } catch (error) {
    console.error('Error creating procurement stage:', error);
    return res.status(500).json({ message: 'Error creating procurement stage', error: error.message });
  }
});

router.patch('/stages/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid stage id.' });
  try {
    await ensureProcurementSchema();
    const existing = await pool.query(
      isPostgres
        ? `SELECT id FROM procurement_stages WHERE id = $1 AND COALESCE(voided, false) = false`
        : `SELECT id FROM procurement_stages WHERE id = ? AND COALESCE(voided, 0) = 0`,
      [id]
    );
    if (!rowsOf(existing).length) return res.status(404).json({ message: 'Stage not found.' });

    const label =
      req.body?.label !== undefined ? String(req.body.label || '').trim() : undefined;
    if (label === '')
      return res.status(400).json({ message: 'label cannot be empty.' });
    if (label && (await duplicateStageLabel(label, id))) {
      return res.status(409).json({ message: 'A stage with this label already exists.' });
    }

    let sortOrder = req.body?.sort_order ?? req.body?.sortOrder;
    sortOrder = sortOrder !== undefined && sortOrder !== null ? Number(sortOrder) : undefined;

    let active = req.body?.active;
    if (active !== undefined && active !== null) {
      active = Boolean(active === true || active === 1 || active === '1');
    }

    if (isPostgres) {
      const sets = [];
      const vals = [];
      let i = 1;
      if (label !== undefined) {
        sets.push(`label = $${i++}`);
        vals.push(label);
      }
      if (sortOrder !== undefined && Number.isFinite(sortOrder)) {
        sets.push(`sort_order = $${i++}`);
        vals.push(sortOrder);
      }
      if (active !== undefined) {
        sets.push(`active = $${i++}`);
        vals.push(active);
      }
      if (!sets.length) return res.status(400).json({ message: 'No fields to update.' });
      sets.push('updated_at = NOW()');
      vals.push(id);
      const q = `UPDATE procurement_stages SET ${sets.join(', ')} WHERE id = $${i} AND COALESCE(voided, false) = false
                 RETURNING id, label, sort_order, active, created_at, updated_at`;
      const result = await pool.query(q, vals);
      return res.status(200).json(mapStageRow(rowsOf(result)[0]));
    }

    const sets = [];
    const vals = [];
    if (label !== undefined) {
      sets.push('label = ?');
      vals.push(label);
    }
    if (sortOrder !== undefined && Number.isFinite(sortOrder)) {
      sets.push('sort_order = ?');
      vals.push(sortOrder);
    }
    if (active !== undefined) {
      sets.push('active = ?');
      vals.push(active ? 1 : 0);
    }
    if (!sets.length) return res.status(400).json({ message: 'No fields to update.' });
    sets.push('updated_at = NOW()');
    vals.push(id);
    await pool.query(`UPDATE procurement_stages SET ${sets.join(', ')} WHERE id = ? AND COALESCE(voided, 0) = 0`, vals);
    const sel = await pool.query(
      `SELECT id, label, sort_order, active, created_at, updated_at FROM procurement_stages WHERE id = ?`,
      [id]
    );
    return res.status(200).json(mapStageRow(rowsOf(sel)[0]));
  } catch (error) {
    console.error('Error updating procurement stage:', error);
    return res.status(500).json({ message: 'Error updating procurement stage', error: error.message });
  }
});

router.delete('/stages/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid stage id.' });
  try {
    await ensureProcurementSchema();
    if (isPostgres) {
      const result = await pool.query(
        `UPDATE procurement_stages SET voided = true, updated_at = NOW()
         WHERE id = $1 AND COALESCE(voided, false) = false
         RETURNING id`,
        [id]
      );
      if (!rowsOf(result).length) return res.status(404).json({ message: 'Stage not found.' });
    } else {
      const upd = await pool.query(
        `UPDATE procurement_stages SET voided = 1, updated_at = NOW()
         WHERE id = ? AND COALESCE(voided, 0) = 0`,
        [id]
      );
      if (!upd?.affectedRows && !upd?.changedRows) {
        const check = await pool.query(`SELECT id FROM procurement_stages WHERE id = ?`, [id]);
        if (!rowsOf(check).length) return res.status(404).json({ message: 'Stage not found.' });
      }
    }
    return res.status(204).send();
  } catch (error) {
    console.error('Error removing procurement stage:', error);
    return res.status(500).json({ message: 'Error removing procurement stage', error: error.message });
  }
});

router.get('/projects', async (req, res) => {
  try {
    await ensureProcurementSchema();
    if (isPostgres) {
      const postgresQueries = [
        `
          SELECT
            p.project_id AS "projectId",
            p.name AS "projectName",
            COALESCE(p.progress->>'status', '') AS "projectStatus",
            p.implementing_agency AS "implementingAgency",
            COALESCE(
              CASE
                WHEN (p.budget->>'allocated_amount_kes') ~ '^[0-9]+(\\.[0-9]+)?$'
                  THEN (p.budget->>'allocated_amount_kes')::numeric
                ELSE 0
              END,
              0
            ) AS "budget",
            wf.stage AS "procurementStage",
            wf.decision AS "latestDecision",
            wf.updated_at AS "updatedAt"
          FROM projects p
          LEFT JOIN LATERAL (
            SELECT stage, decision, updated_at
            FROM project_procurement_workflow w
            WHERE w.project_id = p.project_id AND COALESCE(w.voided, false) = false
            ORDER BY w.updated_at DESC NULLS LAST, w.id DESC
            LIMIT 1
          ) wf ON true
          WHERE COALESCE(p.voided, false) = false
            AND LOWER(COALESCE(p.progress->>'status', '')) LIKE '%procurement%'
          ORDER BY p.updated_at DESC NULLS LAST
        `,
        `
          SELECT
            p.project_id AS "projectId",
            p.name AS "projectName",
            COALESCE(p.status, '') AS "projectStatus",
            p.implementing_agency AS "implementingAgency",
            0::numeric AS "budget",
            wf.stage AS "procurementStage",
            wf.decision AS "latestDecision",
            wf.updated_at AS "updatedAt"
          FROM projects p
          LEFT JOIN LATERAL (
            SELECT stage, decision, updated_at
            FROM project_procurement_workflow w
            WHERE w.project_id = p.project_id AND COALESCE(w.voided, false) = false
            ORDER BY w.updated_at DESC NULLS LAST, w.id DESC
            LIMIT 1
          ) wf ON true
          WHERE COALESCE(p.voided, false) = false
            AND LOWER(COALESCE(p.status, '')) LIKE '%procurement%'
          ORDER BY p.updated_at DESC NULLS LAST
        `,
        `
          SELECT
            p.id AS "projectId",
            p."projectName" AS "projectName",
            COALESCE(p.status, '') AS "projectStatus",
            p.directorate AS "implementingAgency",
            COALESCE(p."costOfProject", 0) AS "budget",
            wf.stage AS "procurementStage",
            wf.decision AS "latestDecision",
            wf.updated_at AS "updatedAt"
          FROM projects p
          LEFT JOIN LATERAL (
            SELECT stage, decision, updated_at
            FROM project_procurement_workflow w
            WHERE w.project_id = p.id AND COALESCE(w.voided, false) = false
            ORDER BY w.updated_at DESC NULLS LAST, w.id DESC
            LIMIT 1
          ) wf ON true
          WHERE COALESCE(p.voided, false) = false
            AND LOWER(COALESCE(p.status, '')) LIKE '%procurement%'
          ORDER BY p."updatedAt" DESC NULLS LAST
        `,
        `
          SELECT
            p.id AS "projectId",
            p."projectName" AS "projectName",
            COALESCE(p.status, '') AS "projectStatus",
            p.directorate AS "implementingAgency",
            COALESCE(p."costOfProject", 0) AS "budget",
            NULL::text AS "procurementStage",
            NULL::text AS "latestDecision",
            p."updatedAt" AS "updatedAt"
          FROM projects p
          WHERE COALESCE(p.voided, false) = false
            AND LOWER(COALESCE(p.status, '')) LIKE '%procurement%'
          ORDER BY p."updatedAt" DESC NULLS LAST
        `,
      ];

      let rows = null;
      let lastError = null;
      for (const sql of postgresQueries) {
        try {
          const result = await pool.query(sql);
          rows = rowsOf(result);
          break;
        } catch (e) {
          lastError = e;
          if (!isSchemaError(e)) throw e;
        }
      }
      if (!rows && lastError) {
        // Fail soft for missing/variant schemas.
        return res.status(200).json([]);
      }
      return res.status(200).json(rows || []);
    }

    const result = await pool.query(`
      SELECT
        p.id AS projectId,
        p.projectName,
        COALESCE(p.status, '') AS projectStatus,
        p.directorate AS implementingAgency,
        COALESCE(p.costOfProject, 0) AS budget,
        wf.stage AS procurementStage,
        wf.decision AS latestDecision,
        wf.updated_at AS updatedAt
      FROM projects p
      LEFT JOIN (
        SELECT w1.*
        FROM project_procurement_workflow w1
        INNER JOIN (
          SELECT project_id, MAX(updated_at) AS max_updated
          FROM project_procurement_workflow
          WHERE COALESCE(voided, 0) = 0
          GROUP BY project_id
        ) mx ON mx.project_id = w1.project_id AND mx.max_updated = w1.updated_at
      ) wf ON wf.project_id = p.id
      WHERE COALESCE(p.voided, 0) = 0
        AND LOWER(COALESCE(p.status, '')) LIKE '%procurement%'
      ORDER BY p.updatedAt DESC
    `);
    return res.status(200).json(rowsOf(result));
  } catch (error) {
    console.error('Error listing under-procurement projects:', error);
    return res.status(500).json({ message: 'Error listing under-procurement projects', error: error.message });
  }
});

router.get('/projects/:projectId/workflow', async (req, res) => {
  const projectId = Number(req.params.projectId);
  if (!Number.isFinite(projectId)) return res.status(400).json({ message: 'Invalid project id.' });
  try {
    await ensureProcurementSchema();
    const sql = isPostgres
      ? `SELECT id, project_id AS "projectId", stage, decision, notes, actor_id AS "actorId",
                created_at AS "createdAt", updated_at AS "updatedAt"
         FROM project_procurement_workflow
         WHERE project_id = $1 AND COALESCE(voided, false) = false
         ORDER BY updated_at DESC NULLS LAST, id DESC`
      : `SELECT id, project_id AS projectId, stage, decision, notes, actor_id AS actorId,
                created_at AS createdAt, updated_at AS updatedAt
         FROM project_procurement_workflow
         WHERE project_id = ? AND COALESCE(voided, 0) = 0
         ORDER BY updated_at DESC, id DESC`;
    const result = await pool.query(sql, [projectId]);
    return res.status(200).json(rowsOf(result));
  } catch (error) {
    console.error('Error loading procurement workflow:', error);
    return res.status(500).json({ message: 'Error loading procurement workflow', error: error.message });
  }
});

router.post('/projects/:projectId/workflow', async (req, res) => {
  const projectId = Number(req.params.projectId);
  if (!Number.isFinite(projectId)) return res.status(400).json({ message: 'Invalid project id.' });
  const stage = String(req.body?.stage || '').trim();
  const decision = req.body?.decision ? String(req.body.decision).trim() : null;
  const notes = req.body?.notes ? String(req.body.notes).trim() : null;
  const actorId = Number(req.user?.userId || req.user?.id || null) || null;
  if (!stage) return res.status(400).json({ message: 'stage is required.' });
  try {
    await ensureProcurementSchema();
    const stageAllowed = await isActiveProcurementStage(stage);
    if (!stageAllowed) {
      return res.status(400).json({
        message: 'Stage must be an active procurement stage from the catalog. Manage stages under Procurement → Procurement stages.',
      });
    }
    if (isPostgres) {
      const result = await pool.query(
        `INSERT INTO project_procurement_workflow
          (project_id, stage, decision, notes, actor_id, created_at, updated_at, voided)
         VALUES ($1, $2, $3, $4, $5, NOW(), NOW(), false)
         RETURNING id, project_id AS "projectId", stage, decision, notes, actor_id AS "actorId",
                   created_at AS "createdAt", updated_at AS "updatedAt"`,
        [projectId, stage, decision, notes, actorId]
      );
      return res.status(201).json(rowsOf(result)[0]);
    }
    const insert = await pool.query(
      `INSERT INTO project_procurement_workflow
       (project_id, stage, decision, notes, actor_id, created_at, updated_at, voided)
       VALUES (?, ?, ?, ?, ?, NOW(), NOW(), 0)`,
      [projectId, stage, decision, notes, actorId]
    );
    const insertId = insert?.insertId || insert?.[0]?.insertId;
    const selected = await pool.query(
      `SELECT id, project_id AS projectId, stage, decision, notes, actor_id AS actorId,
              created_at AS createdAt, updated_at AS updatedAt
       FROM project_procurement_workflow WHERE id = ?`,
      [insertId]
    );
    return res.status(201).json(rowsOf(selected)[0]);
  } catch (error) {
    console.error('Error adding procurement workflow step:', error);
    return res.status(500).json({ message: 'Error adding procurement workflow step', error: error.message });
  }
});

router.get('/projects/:projectId/attachments', async (req, res) => {
  const projectId = Number(req.params.projectId);
  if (!Number.isFinite(projectId)) return res.status(400).json({ message: 'Invalid project id.' });
  const stage = String(req.query?.stage || '').trim();
  try {
    await ensureProcurementSchema();
    const sql = isPostgres
      ? `SELECT id, project_id AS "projectId", stage, file_name AS "fileName", file_path AS "filePath",
                mime_type AS "mimeType", file_size AS "fileSize", title, notes,
                uploaded_by AS "uploadedBy", created_at AS "createdAt", updated_at AS "updatedAt"
         FROM procurement_attachments
         WHERE project_id = $1
           AND COALESCE(voided, false) = false
           AND ($2::text = '' OR COALESCE(stage, '') = $2::text)
         ORDER BY created_at DESC, id DESC`
      : `SELECT id, project_id AS projectId, stage, file_name AS fileName, file_path AS filePath,
                mime_type AS mimeType, file_size AS fileSize, title, notes,
                uploaded_by AS uploadedBy, created_at AS createdAt, updated_at AS updatedAt
         FROM procurement_attachments
         WHERE project_id = ?
           AND COALESCE(voided, 0) = 0
           AND (? = '' OR COALESCE(stage, '') = ?)
         ORDER BY created_at DESC, id DESC`;
    const params = isPostgres ? [projectId, stage] : [projectId, stage, stage];
    const result = await pool.query(sql, params);
    return res.status(200).json(rowsOf(result));
  } catch (error) {
    console.error('Error loading procurement attachments:', error);
    return res.status(500).json({ message: 'Error loading procurement attachments', error: error.message });
  }
});

router.post('/projects/:projectId/attachments', upload.single('file'), async (req, res) => {
  const projectId = Number(req.params.projectId);
  if (!Number.isFinite(projectId)) return res.status(400).json({ message: 'Invalid project id.' });
  if (!req.file) return res.status(400).json({ message: 'file is required.' });
  const stage = String(req.body?.stage || '').trim() || null;
  const title = String(req.body?.title || '').trim() || null;
  const notes = String(req.body?.notes || '').trim() || null;
  const uploadedBy = Number(req.user?.userId || req.user?.id || null) || null;
  const relPath = path.relative(path.join(__dirname, '..', '..'), req.file.path).replace(/\\/g, '/');
  try {
    await ensureProcurementSchema();
    if (isPostgres) {
      const result = await pool.query(
        `INSERT INTO procurement_attachments
          (project_id, stage, file_name, file_path, mime_type, file_size, title, notes, uploaded_by, created_at, updated_at, voided)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW(),NOW(),false)
         RETURNING id, project_id AS "projectId", stage, file_name AS "fileName", file_path AS "filePath",
                   mime_type AS "mimeType", file_size AS "fileSize", title, notes, uploaded_by AS "uploadedBy",
                   created_at AS "createdAt", updated_at AS "updatedAt"`,
        [projectId, stage, req.file.originalname, relPath, req.file.mimetype || null, req.file.size || null, title, notes, uploadedBy]
      );
      return res.status(201).json(rowsOf(result)[0]);
    }
    const ins = await pool.query(
      `INSERT INTO procurement_attachments
       (project_id, stage, file_name, file_path, mime_type, file_size, title, notes, uploaded_by, created_at, updated_at, voided)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW(), 0)`,
      [projectId, stage, req.file.originalname, relPath, req.file.mimetype || null, req.file.size || null, title, notes, uploadedBy]
    );
    const insertId = ins?.insertId || ins?.[0]?.insertId;
    const sel = await pool.query(
      `SELECT id, project_id AS projectId, stage, file_name AS fileName, file_path AS filePath,
              mime_type AS mimeType, file_size AS fileSize, title, notes, uploaded_by AS uploadedBy,
              created_at AS createdAt, updated_at AS updatedAt
       FROM procurement_attachments WHERE id = ?`,
      [insertId]
    );
    return res.status(201).json(rowsOf(sel)[0]);
  } catch (error) {
    console.error('Error saving procurement attachment:', error);
    return res.status(500).json({ message: 'Error saving procurement attachment', error: error.message });
  }
});

router.get('/projects/:projectId/checklist', async (req, res) => {
  const projectId = Number(req.params.projectId);
  if (!Number.isFinite(projectId)) return res.status(400).json({ message: 'Invalid project id.' });
  const stage = String(req.query?.stage || '').trim();
  try {
    await ensureProcurementSchema();
    const sql = isPostgres
      ? `SELECT id, project_id AS "projectId", stage, label, notes, completed,
                completed_at AS "completedAt", completed_by AS "completedBy",
                created_by AS "createdBy", created_at AS "createdAt", updated_at AS "updatedAt"
         FROM procurement_checklist_items
         WHERE project_id = $1
           AND COALESCE(voided, false) = false
           AND ($2::text = '' OR COALESCE(stage, '') = $2::text)
         ORDER BY created_at DESC, id DESC`
      : `SELECT id, project_id AS projectId, stage, label, notes, completed,
                completed_at AS completedAt, completed_by AS completedBy,
                created_by AS createdBy, created_at AS createdAt, updated_at AS updatedAt
         FROM procurement_checklist_items
         WHERE project_id = ?
           AND COALESCE(voided, 0) = 0
           AND (? = '' OR COALESCE(stage, '') = ?)
         ORDER BY created_at DESC, id DESC`;
    const params = isPostgres ? [projectId, stage] : [projectId, stage, stage];
    const result = await pool.query(sql, params);
    return res.status(200).json(rowsOf(result));
  } catch (error) {
    console.error('Error loading procurement checklist:', error);
    return res.status(500).json({ message: 'Error loading procurement checklist', error: error.message });
  }
});

router.post('/projects/:projectId/checklist', async (req, res) => {
  const projectId = Number(req.params.projectId);
  if (!Number.isFinite(projectId)) return res.status(400).json({ message: 'Invalid project id.' });
  const stage = String(req.body?.stage || '').trim() || null;
  const label = String(req.body?.label || '').trim();
  const notes = String(req.body?.notes || '').trim() || null;
  const createdBy = Number(req.user?.userId || req.user?.id || null) || null;
  if (!label) return res.status(400).json({ message: 'label is required.' });
  try {
    await ensureProcurementSchema();
    if (isPostgres) {
      const result = await pool.query(
        `INSERT INTO procurement_checklist_items
          (project_id, stage, label, notes, completed, created_by, created_at, updated_at, voided)
         VALUES ($1,$2,$3,$4,false,$5,NOW(),NOW(),false)
         RETURNING id, project_id AS "projectId", stage, label, notes, completed,
                   completed_at AS "completedAt", completed_by AS "completedBy",
                   created_by AS "createdBy", created_at AS "createdAt", updated_at AS "updatedAt"`,
        [projectId, stage, label, notes, createdBy]
      );
      return res.status(201).json(rowsOf(result)[0]);
    }
    const ins = await pool.query(
      `INSERT INTO procurement_checklist_items
       (project_id, stage, label, notes, completed, created_by, created_at, updated_at, voided)
       VALUES (?, ?, ?, ?, 0, ?, NOW(), NOW(), 0)`,
      [projectId, stage, label, notes, createdBy]
    );
    const insertId = ins?.insertId || ins?.[0]?.insertId;
    const sel = await pool.query(
      `SELECT id, project_id AS projectId, stage, label, notes, completed,
              completed_at AS completedAt, completed_by AS completedBy,
              created_by AS createdBy, created_at AS createdAt, updated_at AS updatedAt
       FROM procurement_checklist_items WHERE id = ?`,
      [insertId]
    );
    return res.status(201).json(rowsOf(sel)[0]);
  } catch (error) {
    console.error('Error adding checklist item:', error);
    return res.status(500).json({ message: 'Error adding checklist item', error: error.message });
  }
});

router.patch('/projects/:projectId/checklist/:itemId', async (req, res) => {
  const projectId = Number(req.params.projectId);
  const itemId = Number(req.params.itemId);
  if (!Number.isFinite(projectId) || !Number.isFinite(itemId)) return res.status(400).json({ message: 'Invalid ids.' });
  const completedBy = Number(req.user?.userId || req.user?.id || null) || null;
  const completedRaw = req.body?.completed;
  const completed = completedRaw === true || completedRaw === 1 || completedRaw === '1';
  const notes = req.body?.notes !== undefined ? String(req.body.notes || '').trim() : undefined;
  try {
    await ensureProcurementSchema();
    if (isPostgres) {
      const sets = ['completed = $1', 'updated_at = NOW()', completed ? 'completed_at = NOW()' : 'completed_at = NULL', 'completed_by = $2'];
      const params = [completed, completedBy];
      if (notes !== undefined) {
        params.push(notes || null);
        sets.push(`notes = $${params.length}`);
      }
      params.push(projectId, itemId);
      const result = await pool.query(
        `UPDATE procurement_checklist_items
         SET ${sets.join(', ')}
         WHERE project_id = $${params.length - 1} AND id = $${params.length} AND COALESCE(voided, false) = false
         RETURNING id, project_id AS "projectId", stage, label, notes, completed,
                   completed_at AS "completedAt", completed_by AS "completedBy",
                   created_by AS "createdBy", created_at AS "createdAt", updated_at AS "updatedAt"`,
        params
      );
      const row = rowsOf(result)[0];
      if (!row) return res.status(404).json({ message: 'Checklist item not found.' });
      return res.status(200).json(row);
    }
    const updates = ['completed = ?', 'updated_at = NOW()', completed ? 'completed_at = NOW()' : 'completed_at = NULL', 'completed_by = ?'];
    const params = [completed ? 1 : 0, completedBy];
    if (notes !== undefined) {
      updates.push('notes = ?');
      params.push(notes || null);
    }
    params.push(projectId, itemId);
    await pool.query(
      `UPDATE procurement_checklist_items
       SET ${updates.join(', ')}
       WHERE project_id = ? AND id = ? AND COALESCE(voided, 0) = 0`,
      params
    );
    const sel = await pool.query(
      `SELECT id, project_id AS projectId, stage, label, notes, completed,
              completed_at AS completedAt, completed_by AS completedBy,
              created_by AS createdBy, created_at AS createdAt, updated_at AS updatedAt
       FROM procurement_checklist_items WHERE project_id = ? AND id = ?`,
      [projectId, itemId]
    );
    const row = rowsOf(sel)[0];
    if (!row) return res.status(404).json({ message: 'Checklist item not found.' });
    return res.status(200).json(row);
  } catch (error) {
    console.error('Error updating checklist item:', error);
    return res.status(500).json({ message: 'Error updating checklist item', error: error.message });
  }
});

module.exports = router;
