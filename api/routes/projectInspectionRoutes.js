const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const pool = require('../config/db');
const { recordAudit, AUDIT_ACTIONS } = require('../services/auditTrailService');
const { ensureInspectionChecklistColumns } = require('../services/dataCollectionSchema');

const router = express.Router();

function validateChecklistAgainstTemplate(structure, answers) {
  if (!structure || !structure.sections) return [];
  const missing = [];
  for (const sec of structure.sections) {
    for (const it of sec.items || []) {
      if (!it.required) continue;
      const v = answers?.[it.id];
      const empty =
        v === undefined ||
        v === null ||
        (typeof v === 'string' && v.trim() === '') ||
        (it.type === 'yes_no' && v !== 'yes' && v !== 'no');
      if (empty) missing.push(it.label || it.id);
    }
  }
  return missing;
}

const uploadsRoot = path.join(__dirname, '..', '..', 'uploads', 'project-inspections');
if (!fs.existsSync(uploadsRoot)) {
    fs.mkdirSync(uploadsRoot, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const { projectId, inspectionId } = req.params;
        const dir = path.join(uploadsRoot, String(projectId), String(inspectionId));
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname || '');
        const base = path.basename(file.originalname || 'file', ext).replace(/[^a-zA-Z0-9-_]/g, '_');
        cb(null, `${Date.now()}-${base}${ext}`);
    },
});
const upload = multer({ storage });

async function ensureInspectionTables() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS project_inspections (
            inspection_id SERIAL PRIMARY KEY,
            project_id INTEGER NOT NULL,
            inspection_date DATE NOT NULL,
            findings TEXT NULL,
            warnings TEXT NULL,
            recommendations TEXT NULL,
            created_by INTEGER NULL,
            created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
            voided BOOLEAN NOT NULL DEFAULT FALSE
        )
    `);
    await pool.query(`ALTER TABLE project_inspections ADD COLUMN IF NOT EXISTS bq_item_id BIGINT NULL`);
    await pool.query(`ALTER TABLE project_inspections ADD COLUMN IF NOT EXISTS inspection_outcome TEXT NULL`);
    await pool.query(`
        CREATE TABLE IF NOT EXISTS project_inspection_bq_observations (
            observation_id SERIAL PRIMARY KEY,
            inspection_id INTEGER NOT NULL REFERENCES project_inspections(inspection_id) ON DELETE CASCADE,
            bq_item_id BIGINT NOT NULL,
            outcome TEXT NULL,
            observation TEXT NULL,
            recommendation TEXT NULL,
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS project_inspection_team_members (
            inspection_id INTEGER NOT NULL REFERENCES project_inspections(inspection_id) ON DELETE CASCADE,
            team_member_ref TEXT NOT NULL,
            created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (inspection_id, team_member_ref)
        )
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS project_inspection_files (
            file_id SERIAL PRIMARY KEY,
            inspection_id INTEGER NOT NULL REFERENCES project_inspections(inspection_id) ON DELETE CASCADE,
            file_category TEXT NOT NULL,
            file_name TEXT NOT NULL,
            file_path TEXT NOT NULL,
            mime_type TEXT NULL,
            file_size BIGINT NULL,
            created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    `);
    await pool.query(`ALTER TABLE project_inspections ADD COLUMN IF NOT EXISTS sign_off_status TEXT NULL`);
    await pool.query(`ALTER TABLE project_inspections ADD COLUMN IF NOT EXISTS signed_by_name TEXT NULL`);
    await pool.query(`ALTER TABLE project_inspections ADD COLUMN IF NOT EXISTS signed_by_role TEXT NULL`);
    await pool.query(`ALTER TABLE project_inspections ADD COLUMN IF NOT EXISTS signed_at TIMESTAMP WITHOUT TIME ZONE NULL`);
    await pool.query(`ALTER TABLE project_inspections ADD COLUMN IF NOT EXISTS sign_off_notes TEXT NULL`);
    await ensureInspectionChecklistColumns();
}

function normalizeInspectionOutcome(value) {
    const raw = String(value || '').trim().toLowerCase();
    if (raw === 'passed_with_issues' || raw === 'passed with issues') return 'passed_with_issues';
    if (raw === 'passed' || raw === 'pass') return 'passed';
    if (raw === 'failed' || raw === 'fail' || raw === 'defects_found' || raw === 'needs correction') return 'failed';
    return raw || null;
}

function inspectionOutcomeCompletesBq(outcome) {
    return outcome === 'passed' || outcome === 'passed_with_issues';
}

async function markLinkedBqItemComplete({ projectId, bqItemId, inspectionDate, createdBy, remarks }) {
    const itemId = Number(bqItemId);
    if (!Number.isFinite(itemId)) return;

    const completionDate = inspectionDate ? String(inspectionDate).slice(0, 10) : new Date().toISOString().slice(0, 10);
    const existingResult = await pool.query(
        `
        SELECT progress_percent, completed
        FROM project_bq_items
        WHERE id = $1
          AND project_id = $2
          AND COALESCE(voided, false) = false
        LIMIT 1
        `,
        [itemId, projectId]
    );
    const existing = existingResult.rows?.[0];
    if (!existing) return;
    const wasAlreadyComplete = Boolean(existing.completed) && Number(existing.progress_percent || 0) >= 100;

    const updateResult = await pool.query(
        `
        UPDATE project_bq_items
        SET progress_percent = 100,
            completed = true,
            completion_date = COALESCE(completion_date, $3::date),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
          AND project_id = $2
          AND COALESCE(voided, false) = false
        `,
        [itemId, projectId, completionDate]
    );
    if ((updateResult.rowCount || 0) === 0) return;
    if (wasAlreadyComplete) return;

    await pool.query(
        `
        INSERT INTO project_bq_progress_logs (bq_item_id, progress_date, progress_percent, remarks, created_by)
        VALUES ($1, $2::date, 100, $3, $4)
        `,
        [itemId, completionDate, remarks || 'Marked complete through inspection', createdBy || null]
    );
}

function normalizeBqObservations(value, fallback = {}) {
    const source = Array.isArray(value)
        ? value
        : fallback.bqItemId
            ? [fallback]
            : [];

    return source
        .map((row, index) => {
            const bqItemId = row?.bqItemId ?? row?.bq_item_id;
            const parsedBqItemId = Number(bqItemId);
            if (!Number.isFinite(parsedBqItemId)) return null;
            return {
                bqItemId: parsedBqItemId,
                outcome: normalizeInspectionOutcome(row?.outcome ?? row?.inspectionOutcome),
                observation: String(row?.observation || row?.findings || '').trim() || null,
                recommendation: String(row?.recommendation || row?.recommendations || '').trim() || null,
                sortOrder: Number.isFinite(Number(row?.sortOrder ?? row?.sort_order))
                    ? Number(row?.sortOrder ?? row?.sort_order)
                    : index,
            };
        })
        .filter(Boolean);
}

async function validateBqObservationItems(projectId, observations) {
    if (observations.length === 0) return;

    const itemIds = [...new Set(observations.map((row) => row.bqItemId))];
    const validResult = await pool.query(
        `
        SELECT id
        FROM project_bq_items
        WHERE project_id = $1
          AND id = ANY($2::bigint[])
          AND COALESCE(voided, false) = false
        `,
        [projectId, itemIds]
    );
    const validIds = new Set((validResult.rows || []).map((row) => Number(row.id)));
    const invalidIds = itemIds.filter((id) => !validIds.has(Number(id)));
    if (invalidIds.length > 0) {
        const err = new Error(`Invalid BQ item(s) for this project: ${invalidIds.join(', ')}`);
        err.statusCode = 400;
        throw err;
    }
}

async function saveBqObservations({ inspectionId, projectId, observations, inspectionDate, createdBy }) {
    await validateBqObservationItems(projectId, observations);
    await pool.query(
        `DELETE FROM project_inspection_bq_observations WHERE inspection_id = $1`,
        [inspectionId]
    );

    for (const observation of observations) {
        await pool.query(
            `
            INSERT INTO project_inspection_bq_observations
                (inspection_id, bq_item_id, outcome, observation, recommendation, sort_order, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            `,
            [
                inspectionId,
                observation.bqItemId,
                observation.outcome,
                observation.observation,
                observation.recommendation,
                observation.sortOrder,
            ]
        );

        if (inspectionOutcomeCompletesBq(observation.outcome)) {
            await markLinkedBqItemComplete({
                projectId,
                bqItemId: observation.bqItemId,
                inspectionDate,
                createdBy,
                remarks: `Inspection ${observation.outcome === 'passed_with_issues' ? 'passed with issues' : 'passed'} - item marked complete`,
            });
        }
    }
}

async function getInspectionsForProject(projectId) {
    const inspectionResult = await pool.query(
        `
        SELECT
            pi.inspection_id AS "inspectionId",
            pi.project_id AS "projectId",
            pi.inspection_date AS "inspectionDate",
            pi.findings,
            pi.warnings,
            pi.recommendations,
            pi.created_by AS "createdBy",
            pi.created_at AS "createdAt",
            pi.updated_at AS "updatedAt",
            pi.checklist_template_id AS "checklistTemplateId",
            pi.checklist_answers AS "checklistAnswers",
            pi.bq_item_id AS "bqItemId",
            pi.inspection_outcome AS "inspectionOutcome",
            pi.sign_off_status AS "signOffStatus",
            pi.signed_by_name AS "signedByName",
            pi.signed_by_role AS "signedByRole",
            pi.signed_at AS "signedAt",
            pi.sign_off_notes AS "signOffNotes",
            bq.activity_name AS "bqActivityName",
            bq.milestone_name AS "bqMilestoneName"
        FROM project_inspections pi
        LEFT JOIN project_bq_items bq
          ON bq.id = pi.bq_item_id
         AND bq.project_id = pi.project_id
         AND COALESCE(bq.voided, false) = false
        WHERE pi.project_id = $1
          AND COALESCE(pi.voided, false) = false
        ORDER BY pi.inspection_date DESC, pi.inspection_id DESC
        `,
        [projectId]
    );
    const inspections = inspectionResult.rows || [];
    if (inspections.length === 0) return [];

    const ids = inspections.map((r) => r.inspectionId);
    const teamResult = await pool.query(
        `
        SELECT inspection_id AS "inspectionId", team_member_ref AS "teamMemberRef"
        FROM project_inspection_team_members
        WHERE inspection_id = ANY($1::int[])
        `,
        [ids]
    );
    const fileResult = await pool.query(
        `
        SELECT
            file_id AS "fileId",
            inspection_id AS "inspectionId",
            file_category AS "fileCategory",
            file_name AS "fileName",
            file_path AS "filePath",
            mime_type AS "mimeType",
            file_size AS "fileSize",
            created_at AS "createdAt"
        FROM project_inspection_files
        WHERE inspection_id = ANY($1::int[])
        ORDER BY file_id DESC
        `,
        [ids]
    );
    const observationResult = await pool.query(
        `
        SELECT
            o.observation_id AS "observationId",
            o.inspection_id AS "inspectionId",
            o.bq_item_id AS "bqItemId",
            o.outcome,
            o.observation,
            o.recommendation,
            o.sort_order AS "sortOrder",
            bq.activity_name AS "bqActivityName",
            bq.milestone_name AS "bqMilestoneName",
            bq.progress_percent AS "progressPercent",
            bq.completed,
            bq.completion_date AS "completionDate"
        FROM project_inspection_bq_observations o
        LEFT JOIN project_bq_items bq
          ON bq.id = o.bq_item_id
         AND COALESCE(bq.voided, false) = false
        WHERE o.inspection_id = ANY($1::int[])
        ORDER BY o.inspection_id, o.sort_order, o.observation_id
        `,
        [ids]
    );

    const teamByInspection = new Map();
    for (const row of teamResult.rows || []) {
        const list = teamByInspection.get(row.inspectionId) || [];
        list.push(row.teamMemberRef);
        teamByInspection.set(row.inspectionId, list);
    }

    const filesByInspection = new Map();
    for (const row of fileResult.rows || []) {
        const list = filesByInspection.get(row.inspectionId) || [];
        list.push(row);
        filesByInspection.set(row.inspectionId, list);
    }

    const observationsByInspection = new Map();
    for (const row of observationResult.rows || []) {
        const list = observationsByInspection.get(row.inspectionId) || [];
        list.push(row);
        observationsByInspection.set(row.inspectionId, list);
    }

    return inspections.map((row) => ({
        ...row,
        teamMemberRefs: teamByInspection.get(row.inspectionId) || [],
        files: filesByInspection.get(row.inspectionId) || [],
        bqObservations: observationsByInspection.get(row.inspectionId) || (
            row.bqItemId
                ? [{
                    bqItemId: row.bqItemId,
                    outcome: row.inspectionOutcome,
                    observation: row.findings || null,
                    recommendation: row.recommendations || null,
                    bqActivityName: row.bqActivityName,
                    bqMilestoneName: row.bqMilestoneName,
                }]
                : []
        ),
    }));
}

router.get('/:projectId/inspections', async (req, res) => {
    const projectId = parseInt(String(req.params.projectId), 10);
    if (!Number.isFinite(projectId)) return res.status(400).json({ error: 'Invalid project id.' });

    try {
        await ensureInspectionTables();
        const rows = await getInspectionsForProject(projectId);
        return res.status(200).json(rows);
    } catch (err) {
        console.error('Error fetching inspections:', err);
        return res.status(500).json({ error: 'Failed to fetch inspections.', details: err.message });
    }
});

router.post('/:projectId/inspections', async (req, res) => {
    const projectId = parseInt(String(req.params.projectId), 10);
    const {
        inspectionDate,
        findings,
        warnings,
        recommendations,
        teamMemberRefs,
        checklistTemplateId,
        checklistAnswers,
        bqItemId,
        inspectionOutcome,
        bqObservations,
    } = req.body || {};
    if (!Number.isFinite(projectId)) return res.status(400).json({ error: 'Invalid project id.' });
    if (!inspectionDate) return res.status(400).json({ error: 'inspectionDate is required.' });

    try {
        await ensureInspectionTables();
        let ctId =
            checklistTemplateId != null ? parseInt(String(checklistTemplateId), 10) : null;
        let answersPayload = null;
        if (Number.isFinite(ctId)) {
            const tr = await pool.query(
                `
                SELECT structure FROM data_collection_templates
                WHERE template_id = $1 AND COALESCE(voided,false)=false AND COALESCE(is_active,true)=true
                `,
                [ctId]
            );
            const structure = tr.rows?.[0]?.structure;
            if (!structure) {
                return res.status(400).json({ error: 'Checklist template not found or inactive.' });
            }
            const ans = checklistAnswers && typeof checklistAnswers === 'object' ? checklistAnswers : {};
            const missing = validateChecklistAgainstTemplate(structure, ans);
            if (missing.length) {
                return res.status(400).json({
                    error: 'Required checklist items are missing.',
                    missing,
                });
            }
            answersPayload = JSON.stringify(ans);
        } else {
            ctId = null;
        }

        const createdBy = req.user?.id ?? req.user?.userId ?? null;
        const observations = normalizeBqObservations(bqObservations, { bqItemId, inspectionOutcome, observation: findings, recommendation: recommendations });
        const firstObservation = observations[0] || null;
        const linkedBqItemId = firstObservation?.bqItemId || null;
        const normalizedOutcome = firstObservation?.outcome || normalizeInspectionOutcome(inspectionOutcome);
        if (linkedBqItemId != null && !Number.isFinite(linkedBqItemId)) {
            return res.status(400).json({ error: 'Invalid linked BQ item.' });
        }
        await validateBqObservationItems(projectId, observations);
        const insertResult = await pool.query(
            `
            INSERT INTO project_inspections (
                project_id, inspection_date, findings, warnings, recommendations,
                checklist_template_id, checklist_answers, bq_item_id, inspection_outcome,
                created_by, created_at, updated_at, voided
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, false)
            RETURNING inspection_id AS "inspectionId"
            `,
            [
                projectId,
                inspectionDate,
                findings || null,
                warnings || null,
                recommendations || null,
                ctId,
                answersPayload,
                linkedBqItemId,
                normalizedOutcome,
                createdBy,
            ]
        );
        const inspectionId = insertResult.rows?.[0]?.inspectionId;
        await saveBqObservations({
            inspectionId,
            projectId,
            observations,
            inspectionDate,
            createdBy,
        });
        if (linkedBqItemId && observations.length === 0 && inspectionOutcomeCompletesBq(normalizedOutcome)) {
            await markLinkedBqItemComplete({
                projectId,
                bqItemId: linkedBqItemId,
                inspectionDate,
                createdBy,
                remarks: `Inspection ${normalizedOutcome === 'passed_with_issues' ? 'passed with issues' : 'passed'} - item marked complete`,
            });
        }
        if (Array.isArray(teamMemberRefs) && teamMemberRefs.length > 0) {
            for (const ref of teamMemberRefs) {
                const normalized = String(ref || '').trim();
                if (!normalized) continue;
                await pool.query(
                    `INSERT INTO project_inspection_team_members (inspection_id, team_member_ref) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
                    [inspectionId, normalized]
                );
            }
        }
        const rows = await getInspectionsForProject(projectId);
        const created = rows.find((r) => r.inspectionId === inspectionId);
        void recordAudit({
            req,
            action: AUDIT_ACTIONS.INSPECTION_CREATE,
            entityType: 'project',
            entityId: String(projectId),
            details: { inspectionId, inspectionDate, bqItemId: linkedBqItemId, inspectionOutcome: normalizedOutcome },
        });
        return res.status(201).json(created || { inspectionId });
    } catch (err) {
        console.error('Error creating inspection:', err);
        const status = err.statusCode || 500;
        return res.status(status).json({ error: status === 400 ? err.message : 'Failed to create inspection.', details: err.message });
    }
});

router.put('/:projectId/inspections/:inspectionId', async (req, res) => {
    const projectId = parseInt(String(req.params.projectId), 10);
    const inspectionId = parseInt(String(req.params.inspectionId), 10);
    const {
        inspectionDate,
        findings,
        warnings,
        recommendations,
        teamMemberRefs,
        checklistTemplateId,
        checklistAnswers,
        bqItemId,
        inspectionOutcome,
        bqObservations,
    } = req.body || {};
    if (!Number.isFinite(projectId) || !Number.isFinite(inspectionId)) return res.status(400).json({ error: 'Invalid ids.' });
    if (!inspectionDate) return res.status(400).json({ error: 'inspectionDate is required.' });

    try {
        await ensureInspectionTables();
        let ctId =
            checklistTemplateId !== undefined
                ? checklistTemplateId != null
                    ? parseInt(String(checklistTemplateId), 10)
                    : null
                : undefined;
        let answersPayload = undefined;
        if (ctId !== undefined) {
            if (Number.isFinite(ctId)) {
                const tr = await pool.query(
                    `
                    SELECT structure FROM data_collection_templates
                    WHERE template_id = $1 AND COALESCE(voided,false)=false AND COALESCE(is_active,true)=true
                    `,
                    [ctId]
                );
                const structure = tr.rows?.[0]?.structure;
                if (!structure) {
                    return res.status(400).json({ error: 'Checklist template not found or inactive.' });
                }
                const ans = checklistAnswers && typeof checklistAnswers === 'object' ? checklistAnswers : {};
                const missing = validateChecklistAgainstTemplate(structure, ans);
                if (missing.length) {
                    return res.status(400).json({
                        error: 'Required checklist items are missing.',
                        missing,
                    });
                }
                answersPayload = JSON.stringify(ans);
            } else {
                ctId = null;
                answersPayload = null;
            }
        }

        const sets = [
            'inspection_date = $1',
            'findings = $2',
            'warnings = $3',
            'recommendations = $4',
            'updated_at = CURRENT_TIMESTAMP',
        ];
        const params = [inspectionDate, findings || null, warnings || null, recommendations || null];
        let n = 5;
        const observations = bqObservations !== undefined
            ? normalizeBqObservations(bqObservations, { bqItemId, inspectionOutcome, observation: findings, recommendation: recommendations })
            : undefined;
        const firstObservation = Array.isArray(observations) ? observations[0] : null;
        const linkedBqItemId = observations !== undefined
            ? (firstObservation?.bqItemId || null)
            : bqItemId !== undefined
            ? (bqItemId != null && bqItemId !== '' ? Number(bqItemId) : null)
            : undefined;
        if (linkedBqItemId !== undefined && linkedBqItemId !== null && !Number.isFinite(linkedBqItemId)) {
            return res.status(400).json({ error: 'Invalid linked BQ item.' });
        }
        const normalizedOutcome = observations !== undefined
            ? (firstObservation?.outcome || null)
            : inspectionOutcome !== undefined
            ? normalizeInspectionOutcome(inspectionOutcome)
            : undefined;
        if (observations !== undefined) {
            await validateBqObservationItems(projectId, observations);
        }
        if (ctId !== undefined) {
            sets.push(`checklist_template_id = $${n}`);
            params.push(ctId);
            n += 1;
            sets.push(`checklist_answers = $${n}::jsonb`);
            params.push(answersPayload);
            n += 1;
        }
        if (linkedBqItemId !== undefined) {
            sets.push(`bq_item_id = $${n}`);
            params.push(linkedBqItemId);
            n += 1;
        }
        if (normalizedOutcome !== undefined) {
            sets.push(`inspection_outcome = $${n}`);
            params.push(normalizedOutcome);
            n += 1;
        }
        params.push(inspectionId, projectId);

        const updateResult = await pool.query(
            `
            UPDATE project_inspections
            SET ${sets.join(', ')}
            WHERE inspection_id = $${n}
              AND project_id = $${n + 1}
              AND COALESCE(voided, false) = false
            `,
            params
        );
        if ((updateResult.rowCount || 0) === 0) {
            return res.status(404).json({ error: 'Inspection not found.' });
        }
        if (observations !== undefined) {
            await saveBqObservations({
                inspectionId,
                projectId,
                observations,
                inspectionDate,
                createdBy: req.user?.id ?? req.user?.userId ?? null,
            });
        } else {
            const bqItemToComplete = linkedBqItemId !== undefined ? linkedBqItemId : null;
            if (bqItemToComplete && inspectionOutcomeCompletesBq(normalizedOutcome)) {
                await markLinkedBqItemComplete({
                    projectId,
                    bqItemId: bqItemToComplete,
                    inspectionDate,
                    createdBy: req.user?.id ?? req.user?.userId ?? null,
                    remarks: `Inspection ${normalizedOutcome === 'passed_with_issues' ? 'passed with issues' : 'passed'} - item marked complete`,
                });
            }
        }

        await pool.query(`DELETE FROM project_inspection_team_members WHERE inspection_id = $1`, [inspectionId]);
        if (Array.isArray(teamMemberRefs) && teamMemberRefs.length > 0) {
            for (const ref of teamMemberRefs) {
                const normalized = String(ref || '').trim();
                if (!normalized) continue;
                await pool.query(
                    `INSERT INTO project_inspection_team_members (inspection_id, team_member_ref) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
                    [inspectionId, normalized]
                );
            }
        }
        const rows = await getInspectionsForProject(projectId);
        const updated = rows.find((r) => r.inspectionId === inspectionId);
        void recordAudit({
            req,
            action: AUDIT_ACTIONS.INSPECTION_UPDATE,
            entityType: 'inspection',
            entityId: String(inspectionId),
            details: {
                projectId,
                inspectionDate,
                bqItemId: linkedBqItemId !== undefined ? linkedBqItemId : null,
                inspectionOutcome: normalizedOutcome,
                bqObservationCount: Array.isArray(observations) ? observations.length : undefined,
            },
        });
        return res.status(200).json(updated || { inspectionId });
    } catch (err) {
        console.error('Error updating inspection:', err);
        const status = err.statusCode || 500;
        return res.status(status).json({ error: status === 400 ? err.message : 'Failed to update inspection.', details: err.message });
    }
});

router.post('/:projectId/inspections/:inspectionId/files', upload.array('files'), async (req, res) => {
    const projectId = parseInt(String(req.params.projectId), 10);
    const inspectionId = parseInt(String(req.params.inspectionId), 10);
    const fileCategory = String(req.body?.fileCategory || 'document').toLowerCase() === 'photo' ? 'photo' : 'document';
    if (!Number.isFinite(projectId) || !Number.isFinite(inspectionId)) return res.status(400).json({ error: 'Invalid ids.' });
    if (!req.files || req.files.length === 0) return res.status(400).json({ error: 'No files uploaded.' });

    try {
        await ensureInspectionTables();
        const check = await pool.query(
            `SELECT inspection_id FROM project_inspections WHERE inspection_id = $1 AND project_id = $2 AND COALESCE(voided,false)=false LIMIT 1`,
            [inspectionId, projectId]
        );
        if (!check.rows?.[0]) return res.status(404).json({ error: 'Inspection not found.' });

        for (const f of req.files) {
            const relPath = path.relative(path.join(__dirname, '..', '..'), f.path).replace(/\\/g, '/');
            await pool.query(
                `
                INSERT INTO project_inspection_files
                    (inspection_id, file_category, file_name, file_path, mime_type, file_size, created_at)
                VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
                `,
                [inspectionId, fileCategory, f.originalname || f.filename, relPath, f.mimetype || null, f.size || null]
            );
        }

        const rows = await getInspectionsForProject(projectId);
        const updated = rows.find((r) => r.inspectionId === inspectionId);
        void recordAudit({
            req,
            action: AUDIT_ACTIONS.INSPECTION_FILES_UPLOAD,
            entityType: 'inspection',
            entityId: String(inspectionId),
            details: { projectId, fileCount: req.files.length, fileCategory },
        });
        return res.status(200).json(updated || { inspectionId });
    } catch (err) {
        console.error('Error uploading inspection files:', err);
        return res.status(500).json({ error: 'Failed to upload inspection files.', details: err.message });
    }
});

router.post('/:projectId/inspections/:inspectionId/sign-off', async (req, res) => {
    const projectId = parseInt(String(req.params.projectId), 10);
    const inspectionId = parseInt(String(req.params.inspectionId), 10);
    const { signedByName, signedByRole, signOffNotes, signOffStatus = 'approved' } = req.body || {};
    if (!Number.isFinite(projectId) || !Number.isFinite(inspectionId)) {
        return res.status(400).json({ error: 'Invalid project or inspection id.' });
    }
    if (!String(signedByName || '').trim()) {
        return res.status(400).json({ error: 'signedByName is required for sign-off.' });
    }

    try {
        await ensureInspectionTables();
        const check = await pool.query(
            `SELECT inspection_id FROM project_inspections
             WHERE inspection_id = $1 AND project_id = $2 AND COALESCE(voided, false) = false`,
            [inspectionId, projectId]
        );
        if (!check.rows?.[0]) return res.status(404).json({ error: 'Inspection not found.' });

        await pool.query(
            `
            UPDATE project_inspections
            SET sign_off_status = $1,
                signed_by_name = $2,
                signed_by_role = $3,
                sign_off_notes = $4,
                signed_at = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP
            WHERE inspection_id = $5
            `,
            [
                String(signOffStatus || 'approved').trim(),
                String(signedByName).trim(),
                String(signedByRole || '').trim() || null,
                String(signOffNotes || '').trim() || null,
                inspectionId,
            ]
        );

        const rows = await getInspectionsForProject(projectId);
        const updated = rows.find((r) => r.inspectionId === inspectionId);
        void recordAudit({
            req,
            action: AUDIT_ACTIONS.INSPECTION_UPDATE,
            entityType: 'inspection',
            entityId: String(inspectionId),
            details: { projectId, signOffStatus, signedByName },
        });
        return res.status(200).json(updated || { inspectionId, signOffStatus });
    } catch (err) {
        console.error('Inspection sign-off failed:', err);
        return res.status(500).json({ error: 'Failed to record inspection sign-off.', details: err.message });
    }
});

module.exports = router;
