const express = require('express');
const router = express.Router();
const multer = require('multer'); // Import multer for file uploads
const path = require('path');
const pool = require('../config/db'); // Import the database connection pool
const { assertMilestonePhaseGate } = require('../services/projectFileChecklistService');

// --- Multer Configuration for file uploads ---
// Define storage for uploaded files
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        // Set the destination folder for uploaded files
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        // Generate a unique filename by adding a timestamp
        cb(null, `${Date.now()}-${file.originalname}`);
    }
});

// Create the multer middleware
const upload = multer({ storage: storage });

// --- Milestone Management API Calls (project_milestones) ---
const DB_TYPE = process.env.DB_TYPE || 'mysql';
const isPostgres = DB_TYPE === 'postgresql';

const rowsFromResult = (result) => {
    if (Array.isArray(result)) return result[0] || [];
    return result?.rows || [];
};

const normalizeDate = (value) => {
    if (!value) return null;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value).slice(0, 10);
    return d.toISOString().slice(0, 10);
};

const normalizeMilestonePayload = (body = {}) => {
    const milestoneName = String(body.milestoneName || body.projectActivityName || body.project_activity_name || body.projectIndicatorName || '').trim();
    const description = body.description != null
        ? String(body.description).trim()
        : (body.remarks != null ? String(body.remarks).trim() : null);
    const dueDate = body.dueDate || body.milestoneDate || body.milestone_date || null;
    const progress = body.progress !== undefined && body.progress !== '' ? Number(body.progress) : (
        body.milestoneValue !== undefined && body.milestoneValue !== '' ? Number(body.milestoneValue) : 0
    );
    return {
        projectId: body.projectId || body.project_id,
        milestoneName: milestoneName || 'Project milestone',
        description,
        dueDate: normalizeDate(dueDate),
        completed: Boolean(body.completed),
        completedDate: body.completed || body.completed === 1 ? normalizeDate(body.completedDate) || new Date().toISOString().slice(0, 10) : null,
        sequenceOrder: body.sequenceOrder === '' || body.sequenceOrder == null ? null : Number(body.sequenceOrder),
        progress: Number.isFinite(progress) ? progress : 0,
        weight: body.weight === '' || body.weight == null ? 1 : Number(body.weight),
        status: body.status || (body.completed ? 'completed' : 'pending'),
        projectActivityCode: body.projectActivityCode || body.project_activity_code || null,
        projectActivityName: body.projectActivityName || body.project_activity_name || milestoneName || null,
        projectIndicatorName: body.projectIndicatorName || body.project_indicator_name || null,
        milestoneValue: body.milestoneValue === '' || body.milestoneValue == null ? null : Number(body.milestoneValue),
        milestonePeriod: body.milestonePeriod || body.milestone_period || null,
        milestoneSource: body.milestoneSource || body.milestone_source || null,
        remarks: body.remarks != null ? String(body.remarks).trim() : description,
    };
};

const isMilestoneCompleting = (payload) => {
    if (payload.completed) return true;
    const status = String(payload.status || '').toLowerCase();
    if (status === 'completed' || status === 'complete') return true;
    return Number(payload.progress) >= 100;
};

const runSafeDdl = async (sql) => {
    try {
        await pool.query(sql);
    } catch (err) {
        const code = String(err?.code || '');
        const msg = String(err?.message || '').toLowerCase();
        if (code === '42P07' || code === '42710' || code === '23505' || code === 'ER_DUP_FIELDNAME' || msg.includes('duplicate column')) return;
        throw err;
    }
};

async function ensureMilestoneCimesColumns() {
    if (isPostgres) {
        await runSafeDdl(`ALTER TABLE project_milestones ADD COLUMN IF NOT EXISTS activity_code TEXT NULL`);
        await runSafeDdl(`ALTER TABLE project_milestones ADD COLUMN IF NOT EXISTS activity_name TEXT NULL`);
        await runSafeDdl(`ALTER TABLE project_milestones ADD COLUMN IF NOT EXISTS indicator_name TEXT NULL`);
        await runSafeDdl(`ALTER TABLE project_milestones ADD COLUMN IF NOT EXISTS milestone_value NUMERIC NULL`);
        await runSafeDdl(`ALTER TABLE project_milestones ADD COLUMN IF NOT EXISTS milestone_period TEXT NULL`);
        await runSafeDdl(`ALTER TABLE project_milestones ADD COLUMN IF NOT EXISTS milestone_source TEXT NULL`);
        await runSafeDdl(`ALTER TABLE project_milestones ADD COLUMN IF NOT EXISTS remarks TEXT NULL`);
        return;
    }
    await runSafeDdl(`ALTER TABLE project_milestones ADD COLUMN activityCode VARCHAR(128) NULL`);
    await runSafeDdl(`ALTER TABLE project_milestones ADD COLUMN activityName VARCHAR(512) NULL`);
    await runSafeDdl(`ALTER TABLE project_milestones ADD COLUMN indicatorName VARCHAR(512) NULL`);
    await runSafeDdl(`ALTER TABLE project_milestones ADD COLUMN milestoneValue DECIMAL(18,2) NULL`);
    await runSafeDdl(`ALTER TABLE project_milestones ADD COLUMN milestonePeriod VARCHAR(128) NULL`);
    await runSafeDdl(`ALTER TABLE project_milestones ADD COLUMN milestoneSource VARCHAR(512) NULL`);
    await runSafeDdl(`ALTER TABLE project_milestones ADD COLUMN remarks TEXT NULL`);
}

/**
 * @route GET /api/milestones
 * @description Get all active milestones from the project_milestones table.
 * @access Private (protected by middleware)
 */
router.get('/', async (req, res) => {
    try {
        await ensureMilestoneCimesColumns();
        const { startDate, endDate, search } = req.query || {};
        if (isPostgres) {
            const params = [];
            const pushParam = (value) => {
                params.push(value);
                return `$${params.length}`;
            };
            const where = ['COALESCE(m.voided, false) = false', 'COALESCE(p.voided, false) = false'];
            if (startDate) where.push(`m.due_date >= ${pushParam(startDate)}`);
            if (endDate) where.push(`m.due_date <= ${pushParam(endDate)}`);
            if (search) {
                const ph = pushParam(`%${String(search).trim()}%`);
                where.push(`(
                    p.name ILIKE ${ph}
                    OR COALESCE(p.data_sources->>'project_ref_num', '') ILIKE ${ph}
                    OR COALESCE(m.activity_code, '') ILIKE ${ph}
                    OR COALESCE(m.activity_name, m.milestone_name, '') ILIKE ${ph}
                    OR COALESCE(m.indicator_name, '') ILIKE ${ph}
                    OR COALESCE(m.remarks, m.description, '') ILIKE ${ph}
                )`);
            }
            const rows = rowsFromResult(await pool.query(
                `SELECT
                    m.milestone_id AS "milestoneId",
                    m.project_id AS "projectId",
                    COALESCE(NULLIF(p.data_sources->>'project_ref_num', ''), 'ADP-' || LPAD(p.project_id::text, 3, '0')) AS "projectCode",
                    p.name AS "projectName",
                    COALESCE(NULLIF(m.activity_code, ''), 'ACT-' || LPAD(COALESCE(m.sequence_order, m.milestone_id)::text, 3, '0')) AS "projectActivityCode",
                    COALESCE(NULLIF(m.activity_name, ''), m.milestone_name) AS "projectActivityName",
                    NULLIF(m.indicator_name, '') AS "projectIndicatorName",
                    COALESCE(m.milestone_value, m.progress) AS "milestoneValue",
                    NULLIF(m.milestone_period, '') AS "milestonePeriod",
                    m.due_date AS "milestoneDate",
                    NULLIF(m.milestone_source, '') AS "milestoneSource",
                    COALESCE(NULLIF(m.remarks, ''), m.description) AS remarks,
                    m.milestone_name AS "milestoneName",
                    m.description,
                    m.due_date AS "dueDate",
                    m.completed,
                    m.completed_date AS "completedDate",
                    m.sequence_order AS "sequenceOrder",
                    m.progress,
                    m.weight,
                    m.status,
                    m.created_at AS "createdAt",
                    m.updated_at AS "updatedAt"
                 FROM project_milestones m
                 INNER JOIN projects p ON p.project_id = m.project_id
                 WHERE ${where.join(' AND ')}
                 ORDER BY m.due_date DESC NULLS LAST, p.name ASC, m.sequence_order ASC NULLS LAST, m.milestone_id DESC`,
                params
            ));
            return res.status(200).json(rows);
        }
        const params = [];
        const where = ['COALESCE(m.voided, 0) = 0', 'COALESCE(p.voided, 0) = 0'];
        if (startDate) {
            where.push('m.dueDate >= ?');
            params.push(startDate);
        }
        if (endDate) {
            where.push('m.dueDate <= ?');
            params.push(endDate);
        }
        if (search) {
            const token = `%${String(search).trim()}%`;
            where.push(`(
                p.projectName LIKE ?
                OR COALESCE(p.ProjectRefNum, '') LIKE ?
                OR COALESCE(m.activityCode, '') LIKE ?
                OR COALESCE(m.activityName, m.milestoneName, '') LIKE ?
                OR COALESCE(m.indicatorName, '') LIKE ?
                OR COALESCE(m.remarks, m.description, '') LIKE ?
            )`);
            params.push(token, token, token, token, token, token);
        }
        const rows = rowsFromResult(await pool.query(
            `SELECT
                m.milestoneId,
                m.projectId,
                COALESCE(NULLIF(p.ProjectRefNum, ''), CONCAT('ADP-', LPAD(p.id, 3, '0'))) AS projectCode,
                p.projectName,
                COALESCE(NULLIF(m.activityCode, ''), CONCAT('ACT-', LPAD(COALESCE(m.sequenceOrder, m.milestoneId), 3, '0'))) AS projectActivityCode,
                COALESCE(NULLIF(m.activityName, ''), m.milestoneName) AS projectActivityName,
                NULLIF(m.indicatorName, '') AS projectIndicatorName,
                COALESCE(m.milestoneValue, m.progress) AS milestoneValue,
                NULLIF(m.milestonePeriod, '') AS milestonePeriod,
                m.dueDate AS milestoneDate,
                NULLIF(m.milestoneSource, '') AS milestoneSource,
                COALESCE(NULLIF(m.remarks, ''), m.description) AS remarks,
                m.milestoneName,
                m.description,
                m.dueDate,
                m.completed,
                m.completedDate,
                m.sequenceOrder,
                m.progress,
                m.weight,
                m.status,
                m.createdAt,
                m.updatedAt
             FROM project_milestones m
             INNER JOIN projects p ON p.id = m.projectId
             WHERE ${where.join(' AND ')}
             ORDER BY m.dueDate DESC, p.projectName ASC, m.sequenceOrder ASC, m.milestoneId DESC`,
            params
        ));
        res.status(200).json(rows);
    } catch (error) {
        console.error('Error fetching all milestones:', error);
        res.status(500).json({ message: 'Error fetching all milestones', error: error.message });
    }
});

/**
 * @route GET /api/milestones/project/:projectId
 * @description Get all active milestones for a specific project.
 * @access Private (protected by middleware)
 */
router.get('/project/:projectId', async (req, res) => {
    const { projectId } = req.params;
    try {
        const DB_TYPE = process.env.DB_TYPE || 'mysql';
        let query, params;
        
        if (DB_TYPE === 'postgresql') {
            // PostgreSQL uses $1, $2 placeholders and snake_case column names
            query = 'SELECT * FROM project_milestones WHERE project_id = $1 AND voided = false ORDER BY sequence_order';
            params = [projectId];
        } else {
            // MySQL uses ? placeholders and camelCase column names
            query = 'SELECT * FROM project_milestones WHERE projectId = ? AND voided = 0 ORDER BY sequenceOrder';
            params = [projectId];
        }
        
        const result = await pool.execute(query, params);
        const rows = DB_TYPE === 'postgresql' ? (result.rows || result) : (Array.isArray(result) ? result[0] : result);
        const milestones = Array.isArray(rows) ? rows : [rows];
        
        res.status(200).json(milestones);
    } catch (error) {
        // SCOPE_DOWN / cleanup safety: some deployments may not have milestones tables yet.
        // In that case, return an empty list so the UI can still load project details.
        const pgMissingTable = error?.code === '42P01'; // undefined_table
        const mysqlMissingTable = error?.code === 'ER_NO_SUCH_TABLE';
        const msg = String(error?.message || '');
        const looksLikeMissing =
            pgMissingTable ||
            mysqlMissingTable ||
            msg.toLowerCase().includes('does not exist') ||
            msg.toLowerCase().includes('no such table') ||
            msg.toLowerCase().includes('project_milestones');

        if (looksLikeMissing) {
            console.warn(`Milestones table missing; returning [] for project ${projectId}`, {
                code: error?.code,
                message: error?.message,
            });
            return res.status(200).json([]);
        }

        console.error(`Error fetching milestones for project ${projectId}:`, error);
        return res.status(500).json({ message: `Error fetching milestones for project ${projectId}`, error: error.message });
    }
});

/**
 * @route GET /api/milestones/:milestoneId
 * @description Get a single active milestone by milestoneId.
 * @access Private (protected by middleware)
 */
router.get('/:milestoneId', async (req, res) => {
    const { milestoneId } = req.params;
    try {
        const [rows] = await pool.query('SELECT * FROM project_milestones WHERE milestoneId = ? AND voided = 0', [milestoneId]);
        if (rows.length > 0) {
            res.status(200).json(rows[0]);
        } else {
            res.status(404).json({ message: 'Milestone not found' });
        }
    } catch (error) {
        console.error('Error fetching milestone:', error);
        res.status(500).json({ message: 'Error fetching milestone', error: error.message });
    }
});

/**
 * @route POST /api/milestones
 * @description Create a new milestone.
 * @access Private (requires authentication and privilege)
 */
router.post('/', async (req, res) => {
    // TODO: Get userId from authenticated user (e.g., req.user.userId)
    const userId = 1; // Placeholder for now
    const payload = normalizeMilestonePayload(req.body);

    if (!payload.projectId || !payload.milestoneName || !payload.dueDate) {
        return res.status(400).json({ message: 'Missing required fields: projectId, milestoneName, dueDate' });
    }

    try {
        if (isMilestoneCompleting(payload)) {
            await assertMilestonePhaseGate(
                Number(payload.projectId),
                payload.milestoneName,
                req.user?.id ?? req.user?.userId ?? null
            );
        }
        await ensureMilestoneCimesColumns();
        if (isPostgres) {
            const result = await pool.query(
                `INSERT INTO project_milestones (
                    project_id, milestone_name, description, due_date, completed, completed_date,
                    sequence_order, progress, weight, status, user_id, created_at, updated_at, voided,
                    activity_code, activity_name, indicator_name, milestone_value, milestone_period, milestone_source, remarks
                )
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW(),NOW(),false,$12,$13,$14,$15,$16,$17,$18)
                RETURNING
                    milestone_id AS "milestoneId",
                    project_id AS "projectId",
                    milestone_name AS "milestoneName",
                    description,
                    due_date AS "dueDate",
                    completed,
                    completed_date AS "completedDate",
                    sequence_order AS "sequenceOrder",
                    progress,
                    weight,
                    status,
                    activity_code AS "projectActivityCode",
                    activity_name AS "projectActivityName",
                    indicator_name AS "projectIndicatorName",
                    milestone_value AS "milestoneValue",
                    milestone_period AS "milestonePeriod",
                    milestone_source AS "milestoneSource",
                    remarks,
                    created_at AS "createdAt",
                    updated_at AS "updatedAt"`,
                [
                    Number(payload.projectId),
                    payload.milestoneName,
                    payload.description,
                    payload.dueDate,
                    payload.completed,
                    payload.completedDate,
                    payload.sequenceOrder,
                    payload.progress,
                    payload.weight,
                    payload.status,
                    userId,
                    payload.projectActivityCode,
                    payload.projectActivityName,
                    payload.projectIndicatorName,
                    payload.milestoneValue,
                    payload.milestonePeriod,
                    payload.milestoneSource,
                    payload.remarks,
                ]
            );
            return res.status(201).json(result.rows?.[0]);
        }
        const newMilestone = {
            projectId: payload.projectId,
            milestoneName: payload.milestoneName,
            description: payload.description,
            dueDate: payload.dueDate,
            completed: payload.completed ? 1 : 0,
            completedDate: payload.completedDate,
            sequenceOrder: payload.sequenceOrder,
            progress: payload.progress,
            weight: payload.weight,
            status: payload.status,
            activityCode: payload.projectActivityCode,
            activityName: payload.projectActivityName,
            indicatorName: payload.projectIndicatorName,
            milestoneValue: payload.milestoneValue,
            milestonePeriod: payload.milestonePeriod,
            milestoneSource: payload.milestoneSource,
            remarks: payload.remarks,
            userId,
            createdAt: new Date(),
            updatedAt: new Date(),
            voided: 0,
        };
        const [result] = await pool.query('INSERT INTO project_milestones SET ?', newMilestone);
        const [rows] = await pool.query('SELECT * FROM project_milestones WHERE milestoneId = ?', [result.insertId]);
        
        // NEW: Recalculate and update the project's overall progress
        const [milestones] = await pool.query('SELECT progress, weight FROM project_milestones WHERE projectId = ? AND voided = 0', [payload.projectId]);
        
        const totalWeightedProgress = milestones.reduce((sum, m) => sum + (m.progress * m.weight), 0);
        const totalWeight = milestones.reduce((sum, m) => sum + m.weight, 0);
        
        const overallProgress = totalWeight > 0 ? (totalWeightedProgress / totalWeight) : 0;
        
        await pool.query('UPDATE projects SET overallProgress = ? WHERE id = ?', [overallProgress, payload.projectId]);

        res.status(201).json(rows[0]);
    } catch (error) {
        console.error('Error creating milestone:', error);
        res.status(500).json({ message: 'Error creating milestone', error: error.message });
    }
});

/**
 * @route PUT /api/milestones/:milestoneId
 * @description Update an existing milestone.
 * @access Private (requires authentication and privilege)
 */
router.put('/:milestoneId', async (req, res) => {
    const { milestoneId } = req.params;
    const payload = normalizeMilestonePayload(req.body);

    try {
        if (isMilestoneCompleting(payload)) {
            await assertMilestonePhaseGate(
                Number(payload.projectId),
                payload.milestoneName,
                req.user?.id ?? req.user?.userId ?? null
            );
        }
        await ensureMilestoneCimesColumns();
        if (isPostgres) {
            const result = await pool.query(
                `UPDATE project_milestones
                 SET project_id = $1,
                     milestone_name = $2,
                     description = $3,
                     due_date = $4,
                     completed = $5,
                     completed_date = $6,
                     sequence_order = $7,
                     progress = $8,
                     weight = $9,
                     status = $10,
                     activity_code = $11,
                     activity_name = $12,
                     indicator_name = $13,
                     milestone_value = $14,
                     milestone_period = $15,
                     milestone_source = $16,
                     remarks = $17,
                     updated_at = NOW()
                 WHERE milestone_id = $18 AND COALESCE(voided, false) = false
                 RETURNING
                    milestone_id AS "milestoneId",
                    project_id AS "projectId",
                    milestone_name AS "milestoneName",
                    description,
                    due_date AS "dueDate",
                    completed,
                    completed_date AS "completedDate",
                    sequence_order AS "sequenceOrder",
                    progress,
                    weight,
                    status,
                    activity_code AS "projectActivityCode",
                    activity_name AS "projectActivityName",
                    indicator_name AS "projectIndicatorName",
                    milestone_value AS "milestoneValue",
                    milestone_period AS "milestonePeriod",
                    milestone_source AS "milestoneSource",
                    remarks,
                    created_at AS "createdAt",
                    updated_at AS "updatedAt"`,
                [
                    Number(payload.projectId),
                    payload.milestoneName,
                    payload.description,
                    payload.dueDate,
                    payload.completed,
                    payload.completedDate,
                    payload.sequenceOrder,
                    payload.progress,
                    payload.weight,
                    payload.status,
                    payload.projectActivityCode,
                    payload.projectActivityName,
                    payload.projectIndicatorName,
                    payload.milestoneValue,
                    payload.milestonePeriod,
                    payload.milestoneSource,
                    payload.remarks,
                    Number(milestoneId),
                ]
            );
            if (!result.rowCount) return res.status(404).json({ message: 'Milestone not found or already deleted' });
            return res.status(200).json(result.rows?.[0]);
        }
        const updatedFields = {
            projectId: payload.projectId,
            milestoneName: payload.milestoneName,
            description: payload.description,
            dueDate: payload.dueDate,
            completed: payload.completed ? 1 : 0,
            completedDate: payload.completedDate,
            sequenceOrder: payload.sequenceOrder,
            progress: payload.progress,
            weight: payload.weight,
            status: payload.status,
            activityCode: payload.projectActivityCode,
            activityName: payload.projectActivityName,
            indicatorName: payload.projectIndicatorName,
            milestoneValue: payload.milestoneValue,
            milestonePeriod: payload.milestonePeriod,
            milestoneSource: payload.milestoneSource,
            remarks: payload.remarks,
            updatedAt: new Date(),
        };
        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();
            
            const [result] = await connection.query('UPDATE project_milestones SET ? WHERE milestoneId = ? AND voided = 0', [updatedFields, milestoneId]);
            
            if (result.affectedRows > 0) {
                // NEW: Calculate and update project's overall progress
                const [milestones] = await connection.query('SELECT progress, weight FROM project_milestones WHERE projectId = ? AND voided = 0', [payload.projectId]);
                
                const totalWeightedProgress = milestones.reduce((sum, m) => sum + (m.progress * m.weight), 0);
                const totalWeight = milestones.reduce((sum, m) => sum + m.weight, 0);
                
                const overallProgress = totalWeight > 0 ? (totalWeightedProgress / totalWeight) : 0;
                
                await connection.query('UPDATE projects SET overallProgress = ? WHERE id = ?', [overallProgress, payload.projectId]);

                await connection.commit();

                const [rows] = await connection.query('SELECT * FROM project_milestones WHERE milestoneId = ?', [milestoneId]);
                res.status(200).json(rows[0]);
            } else {
                await connection.rollback();
                res.status(404).json({ message: 'Milestone not found or already deleted' });
            }
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    } catch (error) {
        console.error('Error updating milestone:', error);
        res.status(500).json({ message: 'Error updating milestone', error: error.message });
    }
});

/**
 * @route DELETE /api/milestones/:milestoneId
 * @description Soft delete a milestone.
 * @access Private (requires authentication and privilege)
 */
router.delete('/:milestoneId', async (req, res) => {
    const { milestoneId } = req.params;
    // TODO: Get userId from authenticated user (e.g., req.user.userId)
    const userId = 1; // Placeholder for now

    try {
        if (isPostgres) {
            const result = await pool.query(
                `UPDATE project_milestones
                 SET voided = true, voided_by = $1, updated_at = NOW()
                 WHERE milestone_id = $2 AND COALESCE(voided, false) = false`,
                [userId, Number(milestoneId)]
            );
            if (!result.rowCount) return res.status(404).json({ message: 'Milestone not found or already deleted' });
            return res.status(200).json({ message: 'Milestone soft-deleted successfully' });
        }
        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();

            const [result] = await connection.query(
                'UPDATE project_milestones SET voided = 1, voidedBy = ? WHERE milestoneId = ? AND voided = 0',
                [userId, milestoneId]
            );

            if (result.affectedRows === 0) {
                await connection.rollback();
                return res.status(404).json({ message: 'Milestone not found or already deleted' });
            }

            // NEW: Recalculate and update the project's overall progress after deleting
            const [deletedMilestoneRows] = await connection.query('SELECT projectId FROM project_milestones WHERE milestoneId = ?', [milestoneId]);
            const projectId = deletedMilestoneRows[0]?.projectId;

            if (projectId) {
                const [milestones] = await connection.query('SELECT progress, weight FROM project_milestones WHERE projectId = ? AND voided = 0', [projectId]);
                
                const totalWeightedProgress = milestones.reduce((sum, m) => sum + (m.progress * m.weight), 0);
                const totalWeight = milestones.reduce((sum, m) => sum + m.weight, 0);
                
                const overallProgress = totalWeight > 0 ? (totalWeightedProgress / totalWeight) : 0;
                
                await connection.query('UPDATE projects SET overallProgress = ? WHERE id = ?', [overallProgress, projectId]);
            }

            await connection.commit();
            res.status(200).json({ message: 'Milestone soft-deleted successfully' });

        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    } catch (error) {
        console.error('Error deleting milestone:', error);
        res.status(500).json({ message: 'Error deleting milestone', error: error.message });
    }
});

// ------------------------------------------------
// --- Milestone Attachments API Calls ---
// ------------------------------------------------

/**
 * @route GET /api/milestones/:milestoneId/attachments
 * @description Get all active attachments for a specific milestone.
 * @access Private
 */
router.get('/:milestoneId/attachments', async (req, res) => {
    const { milestoneId } = req.params;
    try {
        const [rows] = await pool.query(
            'SELECT * FROM milestone_attachments WHERE milestoneId = ? AND voided = 0',
            [milestoneId]
        );
        res.status(200).json(rows);
    } catch (error) {
        console.error(`Error fetching attachments for milestone ${milestoneId}:`, error);
        res.status(500).json({ message: `Error fetching attachments for milestone ${milestoneId}`, error: error.message });
    }
});

/**
 * @route POST /api/milestones/:milestoneId/attachments
 * @description Upload a new attachment for a milestone.
 * @access Private
 */
router.post('/:milestoneId/attachments', upload.single('file'), async (req, res) => {
    const { milestoneId } = req.params;
    const file = req.file;

    // TODO: Get userId from authenticated user
    const userId = 1;
    const description = req.body.description || `Attachment for milestone ${milestoneId}`;

    if (!file) {
        return res.status(400).json({ message: 'No file uploaded.' });
    }

    try {
        const newAttachment = {
            milestoneId,
            fileName: file.originalname,
            filePath: file.path, // Save the path provided by multer
            fileType: file.mimetype,
            fileSize: file.size,
            description,
            userId,
            createdAt: new Date(),
            updatedAt: new Date(),
            voided: 0
        };

        const [result] = await pool.query('INSERT INTO milestone_attachments SET ?', newAttachment);
        const [rows] = await pool.query('SELECT * FROM milestone_attachments WHERE attachmentId = ?', [result.insertId]);
        res.status(201).json(rows[0]);
    } catch (error) {
        console.error('Error uploading attachment:', error);
        res.status(500).json({ message: 'Error uploading attachment', error: error.message });
    }
});

/**
 * @route DELETE /api/milestones/attachments/:attachmentId
 * @description Soft delete a milestone attachment.
 * @access Private
 */
router.delete('/attachments/:attachmentId', async (req, res) => {
    const { attachmentId } = req.params;
    // TODO: Get userId from authenticated user
    const userId = 1;

    try {
        const [result] = await pool.query(
            'UPDATE milestone_attachments SET voided = 1, voidedBy = ? WHERE attachmentId = ? AND voided = 0',
            [userId, attachmentId]
        );
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Attachment not found or already deleted' });
        }
        res.status(200).json({ message: 'Attachment soft-deleted successfully' });
    } catch (error) {
        console.error('Error deleting attachment:', error);
        res.status(500).json({ message: 'Error deleting attachment', error: error.message });
    }
});

module.exports = router;