/**
 * CIDP linkage routes for project implementation tracking.
 *
 * Paths:
 *   GET   /api/projects/cidp/catalog
 *   GET   /api/projects/:projectId/cidp-link
 *   PUT   /api/projects/:projectId/cidp-link
 *   PATCH /api/projects/:projectId/cidp-link-suggestions/:suggestionId
 */
const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const privilege = require('../middleware/privilegeMiddleware');

const DB_TYPE = process.env.DB_TYPE || 'mysql';
const isPostgres = DB_TYPE === 'postgresql';
const CIDP_CODE = 'MACHAKOS-CIDP-2023-2027';

const canRead = privilege(['project.read_all', 'strategic_plan.read_all'], { anyOf: true });
const canWrite = privilege(['project.update', 'strategic_plan.update', 'strategic_plan.create'], { anyOf: true });

function requirePostgres(req, res, next) {
  if (!isPostgres) {
    return res.status(501).json({
      message: 'CIDP project linkage is currently available on PostgreSQL deployments only.',
    });
  }
  next();
}

function normalizeId(value) {
  const id = Number(value);
  return Number.isFinite(id) && id > 0 ? id : null;
}

async function assertProjectExists(projectId) {
  const r = await pool.query(
    'SELECT 1 FROM projects WHERE project_id = $1 AND COALESCE(voided, false) = false LIMIT 1',
    [projectId]
  );
  return (r.rowCount || 0) > 0;
}

async function getCurrentLink(projectId) {
  const r = await pool.query(
    `SELECT
       p.project_id AS "projectId",
       CASE WHEN (p.notes->>'program_id') ~ '^[0-9]+$' THEN (p.notes->>'program_id')::bigint ELSE NULL END AS "programId",
       CASE WHEN (p.notes->>'subprogram_id') ~ '^[0-9]+$' THEN (p.notes->>'subprogram_id')::bigint ELSE NULL END AS "subProgramId",
       pr."programCode" AS "programCode",
       COALESCE(pr.programme, pr."programName") AS "programme",
       pr.description AS "sectorName",
       spr."subProgramCode" AS "subProgramCode",
       COALESCE(spr."subProgramme", spr."subProgramName") AS "subProgramme",
       spr."keyOutcome" AS "subprogramSectorName",
       spr.kpi,
       spr."unitOfMeasure",
       spr.baseline,
       spr."yr1Targets",
       spr."yr2Targets",
       spr."yr3Targets",
       spr."yr4Targets",
       spr."yr5Targets",
       spr."yr1Budget",
       spr."yr2Budget",
       spr."yr3Budget",
       spr."yr4Budget",
       spr."yr5Budget",
       spr."totalBudget",
       src.source_pdf_page AS "sourcePdfPage",
       src.source_cidp_page AS "sourceCidpPage",
       src.raw_text AS "sourceText"
     FROM projects p
     LEFT JOIN programs pr
       ON pr."programId" = CASE WHEN (p.notes->>'program_id') ~ '^[0-9]+$' THEN (p.notes->>'program_id')::bigint ELSE NULL END
      AND COALESCE(pr.voided, false) = false
     LEFT JOIN subprograms spr
       ON spr."subProgramId" = CASE WHEN (p.notes->>'subprogram_id') ~ '^[0-9]+$' THEN (p.notes->>'subprogram_id')::bigint ELSE NULL END
      AND COALESCE(spr.voided, false) = false
     LEFT JOIN cidp_programme_sources src
       ON src.cidp_code = pr.cidpid
      AND src.programme_code = pr."programCode"
      AND COALESCE(src.subprogramme_code, '') = COALESCE(spr."subProgramCode", '')
      AND src.record_type = CASE WHEN spr."subProgramId" IS NULL THEN 'programme' ELSE 'subprogramme' END
     WHERE p.project_id = $1
     LIMIT 1`,
    [projectId]
  );
  return r.rows?.[0] || null;
}

async function getSuggestions(projectId) {
  const r = await pool.query(
    `SELECT
       s.id,
       s.project_id AS "projectId",
       s.cidp_code AS "cidpCode",
       s.program_id AS "programId",
       s.subprogram_id AS "subProgramId",
       s.confidence::float AS confidence,
       s.match_reason AS "matchReason",
       s.status,
       s.reviewed_by AS "reviewedBy",
       s.reviewed_at AS "reviewedAt",
       s.created_at AS "createdAt",
       s.updated_at AS "updatedAt",
       pr."programCode" AS "programCode",
       COALESCE(pr.programme, pr."programName") AS "programme",
       pr.description AS "sectorName",
       spr."subProgramCode" AS "subProgramCode",
       COALESCE(spr."subProgramme", spr."subProgramName") AS "subProgramme",
       spr.kpi,
       spr."unitOfMeasure",
       spr.baseline,
       spr."yr1Targets",
       spr."yr2Targets",
       spr."yr3Targets",
       spr."yr4Targets",
       spr."yr5Targets",
       spr."yr1Budget",
       spr."yr2Budget",
       spr."yr3Budget",
       spr."yr4Budget",
       spr."yr5Budget",
       spr."totalBudget",
       src.source_pdf_page AS "sourcePdfPage",
       src.source_cidp_page AS "sourceCidpPage",
       src.raw_text AS "sourceText"
     FROM cidp_project_link_suggestions s
     LEFT JOIN programs pr ON pr."programId" = s.program_id
     LEFT JOIN subprograms spr ON spr."subProgramId" = s.subprogram_id
     LEFT JOIN cidp_programme_sources src
       ON src.cidp_code = s.cidp_code
      AND src.programme_code = pr."programCode"
      AND COALESCE(src.subprogramme_code, '') = COALESCE(spr."subProgramCode", '')
      AND src.record_type = CASE WHEN spr."subProgramId" IS NULL THEN 'programme' ELSE 'subprogramme' END
     WHERE s.project_id = $1
       AND s.cidp_code = $2
     ORDER BY
       CASE s.status WHEN 'accepted' THEN 0 WHEN 'review_pending' THEN 1 ELSE 2 END,
       s.confidence DESC,
       s.id ASC`,
    [projectId, CIDP_CODE]
  );
  return r.rows || [];
}

async function validateProgramme(programId, subProgramId) {
  const programResult = await pool.query(
    `SELECT "programId", "programCode", COALESCE(programme, "programName") AS programme
     FROM programs
     WHERE "programId" = $1
       AND lower(COALESCE(cidpid, '')) = lower($2)
       AND COALESCE(voided, false) = false
     LIMIT 1`,
    [programId, CIDP_CODE]
  );
  const program = programResult.rows?.[0] || null;
  if (!program) return { ok: false, message: 'Select a valid CIDP programme.' };

  if (subProgramId == null) return { ok: true, program, subprogram: null };

  const subResult = await pool.query(
    `SELECT "subProgramId", "subProgramCode", COALESCE("subProgramme", "subProgramName") AS "subProgramme"
     FROM subprograms
     WHERE "subProgramId" = $1
       AND "programId" = $2
       AND COALESCE(voided, false) = false
     LIMIT 1`,
    [subProgramId, programId]
  );
  const subprogram = subResult.rows?.[0] || null;
  if (!subprogram) return { ok: false, message: 'Select a valid CIDP subprogramme for the selected programme.' };
  return { ok: true, program, subprogram };
}

router.get('/cidp/catalog', requirePostgres, canRead, async (req, res) => {
  try {
    const [programmesResult, subprogrammesResult] = await Promise.all([
      pool.query(
        `SELECT
           "programId" AS "programId",
           "programCode" AS "programCode",
           COALESCE(programme, "programName") AS programme,
           description AS "sectorName",
           objectives,
           outcomes,
           remarks
         FROM programs
         WHERE lower(COALESCE(cidpid, '')) = lower($1)
           AND COALESCE(voided, false) = false
         ORDER BY "programCode" ASC, COALESCE(programme, "programName") ASC`,
        [CIDP_CODE]
      ),
      pool.query(
        `SELECT
           sp."subProgramId" AS "subProgramId",
           sp."programId" AS "programId",
           sp."subProgramCode" AS "subProgramCode",
           COALESCE(sp."subProgramme", sp."subProgramName") AS "subProgramme",
           sp."keyOutcome" AS "sectorName",
           sp.kpi,
           sp."unitOfMeasure",
           sp.baseline,
           sp."yr1Targets",
           sp."yr2Targets",
           sp."yr3Targets",
           sp."yr4Targets",
           sp."yr5Targets",
           sp."yr1Budget",
           sp."yr2Budget",
           sp."yr3Budget",
           sp."yr4Budget",
           sp."yr5Budget",
           sp."totalBudget",
           sp.remarks
         FROM subprograms sp
         INNER JOIN programs p ON p."programId" = sp."programId"
         WHERE lower(COALESCE(p.cidpid, '')) = lower($1)
           AND COALESCE(p.voided, false) = false
           AND COALESCE(sp.voided, false) = false
         ORDER BY p."programCode" ASC, sp."subProgramCode" ASC`,
        [CIDP_CODE]
      ),
    ]);

    res.json({
      cidpCode: CIDP_CODE,
      programmes: programmesResult.rows || [],
      subprogrammes: subprogrammesResult.rows || [],
    });
  } catch (e) {
    console.error('CIDP catalog fetch failed:', e);
    res.status(500).json({ message: 'Failed to load CIDP catalog.', error: e.message });
  }
});

router.get('/:projectId/cidp-link', requirePostgres, canRead, async (req, res) => {
  const projectId = normalizeId(req.params.projectId);
  if (!projectId) return res.status(400).json({ message: 'Invalid project id.' });

  try {
    if (!(await assertProjectExists(projectId))) return res.status(404).json({ message: 'Project not found.' });
    const [currentLink, suggestions] = await Promise.all([
      getCurrentLink(projectId),
      getSuggestions(projectId),
    ]);
    res.json({ cidpCode: CIDP_CODE, currentLink, suggestions });
  } catch (e) {
    console.error('CIDP project link fetch failed:', e);
    res.status(500).json({ message: 'Failed to load CIDP project link.', error: e.message });
  }
});

router.put('/:projectId/cidp-link', requirePostgres, canWrite, async (req, res) => {
  const projectId = normalizeId(req.params.projectId);
  const programId = normalizeId(req.body.programId ?? req.body.program_id);
  const subProgramId = normalizeId(req.body.subProgramId ?? req.body.subprogram_id);
  const suggestionId = normalizeId(req.body.suggestionId ?? req.body.suggestion_id);

  if (!projectId) return res.status(400).json({ message: 'Invalid project id.' });
  if (!programId) return res.status(400).json({ message: 'programId is required.' });

  try {
    if (!(await assertProjectExists(projectId))) return res.status(404).json({ message: 'Project not found.' });

    const validation = await validateProgramme(programId, subProgramId);
    if (!validation.ok) return res.status(400).json({ message: validation.message });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE projects
         SET notes = jsonb_set(
               jsonb_set(COALESCE(notes, '{}'::jsonb), '{program_id}', to_jsonb($2::bigint), true),
               '{subprogram_id}', COALESCE(to_jsonb($3::bigint), 'null'::jsonb),
               true
             )
         WHERE project_id = $1`,
        [projectId, programId, subProgramId]
      );

      if (suggestionId) {
        const suggestionResult = await client.query(
          `UPDATE cidp_project_link_suggestions
           SET status = 'accepted',
               reviewed_at = CURRENT_TIMESTAMP,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $1
             AND project_id = $2
             AND cidp_code = $3
           RETURNING id`,
          [suggestionId, projectId, CIDP_CODE]
        );
        if (!suggestionResult.rowCount) {
          throw Object.assign(new Error('CIDP link suggestion not found.'), { statusCode: 404 });
        }
      }

      await client.query(
        `UPDATE cidp_project_link_suggestions
         SET status = 'rejected',
             updated_at = CURRENT_TIMESTAMP
         WHERE project_id = $1
           AND cidp_code = $2
           AND status = 'review_pending'
           AND (program_id <> $3 OR COALESCE(subprogram_id, 0) <> COALESCE($4::bigint, 0))`,
        [projectId, CIDP_CODE, programId, subProgramId]
      );

      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    const [currentLink, suggestions] = await Promise.all([
      getCurrentLink(projectId),
      getSuggestions(projectId),
    ]);
    res.json({ cidpCode: CIDP_CODE, currentLink, suggestions });
  } catch (e) {
    const status = e.statusCode || 500;
    console.error('CIDP project link update failed:', e);
    res.status(status).json({ message: e.message || 'Failed to update CIDP project link.' });
  }
});

router.patch('/:projectId/cidp-link-suggestions/:suggestionId', requirePostgres, canWrite, async (req, res) => {
  const projectId = normalizeId(req.params.projectId);
  const suggestionId = normalizeId(req.params.suggestionId);
  const status = String(req.body.status || '').trim();
  const allowedStatuses = new Set(['review_pending', 'accepted', 'rejected']);

  if (!projectId || !suggestionId) return res.status(400).json({ message: 'Invalid id.' });
  if (!allowedStatuses.has(status)) return res.status(400).json({ message: 'Invalid suggestion status.' });

  try {
    const r = await pool.query(
      `UPDATE cidp_project_link_suggestions
       SET status = $1,
           reviewed_at = CASE WHEN $1 IN ('accepted', 'rejected') THEN CURRENT_TIMESTAMP ELSE NULL END,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
         AND project_id = $3
         AND cidp_code = $4
       RETURNING id`,
      [status, suggestionId, projectId, CIDP_CODE]
    );
    if (!r.rowCount) return res.status(404).json({ message: 'CIDP link suggestion not found.' });
    const suggestions = await getSuggestions(projectId);
    res.json({ cidpCode: CIDP_CODE, suggestions });
  } catch (e) {
    console.error('CIDP suggestion status update failed:', e);
    res.status(500).json({ message: 'Failed to update CIDP suggestion status.', error: e.message });
  }
});

module.exports = router;
