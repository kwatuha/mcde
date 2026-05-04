const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const pool = require('../config/db');
const { recordAudit, AUDIT_ACTIONS } = require('../services/auditTrailService');

const router = express.Router();

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
            pi.updated_at AS "updatedAt"
        FROM project_inspections pi
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

    return inspections.map((row) => ({
        ...row,
        teamMemberRefs: teamByInspection.get(row.inspectionId) || [],
        files: filesByInspection.get(row.inspectionId) || [],
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
    const { inspectionDate, findings, warnings, recommendations, teamMemberRefs } = req.body || {};
    if (!Number.isFinite(projectId)) return res.status(400).json({ error: 'Invalid project id.' });
    if (!inspectionDate) return res.status(400).json({ error: 'inspectionDate is required.' });

    try {
        await ensureInspectionTables();
        const createdBy = req.user?.id ?? req.user?.userId ?? null;
        const insertResult = await pool.query(
            `
            INSERT INTO project_inspections (project_id, inspection_date, findings, warnings, recommendations, created_by, created_at, updated_at, voided)
            VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, false)
            RETURNING inspection_id AS "inspectionId"
            `,
            [projectId, inspectionDate, findings || null, warnings || null, recommendations || null, createdBy]
        );
        const inspectionId = insertResult.rows?.[0]?.inspectionId;
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
            details: { inspectionId, inspectionDate },
        });
        return res.status(201).json(created || { inspectionId });
    } catch (err) {
        console.error('Error creating inspection:', err);
        return res.status(500).json({ error: 'Failed to create inspection.', details: err.message });
    }
});

router.put('/:projectId/inspections/:inspectionId', async (req, res) => {
    const projectId = parseInt(String(req.params.projectId), 10);
    const inspectionId = parseInt(String(req.params.inspectionId), 10);
    const { inspectionDate, findings, warnings, recommendations, teamMemberRefs } = req.body || {};
    if (!Number.isFinite(projectId) || !Number.isFinite(inspectionId)) return res.status(400).json({ error: 'Invalid ids.' });
    if (!inspectionDate) return res.status(400).json({ error: 'inspectionDate is required.' });

    try {
        await ensureInspectionTables();
        const updateResult = await pool.query(
            `
            UPDATE project_inspections
            SET inspection_date = $1,
                findings = $2,
                warnings = $3,
                recommendations = $4,
                updated_at = CURRENT_TIMESTAMP
            WHERE inspection_id = $5
              AND project_id = $6
              AND COALESCE(voided, false) = false
            `,
            [inspectionDate, findings || null, warnings || null, recommendations || null, inspectionId, projectId]
        );
        if ((updateResult.rowCount || 0) === 0) {
            return res.status(404).json({ error: 'Inspection not found.' });
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
            details: { projectId, inspectionDate },
        });
        return res.status(200).json(updated || { inspectionId });
    } catch (err) {
        console.error('Error updating inspection:', err);
        return res.status(500).json({ error: 'Failed to update inspection.', details: err.message });
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

module.exports = router;
