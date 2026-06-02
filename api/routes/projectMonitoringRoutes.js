const express = require('express');
// We use { mergeParams: true } because we need projectId from the parent router
const router = express.Router({ mergeParams: true });
const pool = require('../config/db'); // Import the database connection pool

// --- Project Monitoring Records API Calls (project_monitoring_records) ---
const DB_TYPE = process.env.DB_TYPE || 'mysql';
const isPostgres = DB_TYPE === 'postgresql';

const queryRows = async (sql, params = []) => {
    const result = await pool.query(sql, params);
    if (Array.isArray(result)) return result[0] || [];
    return result?.rows || [];
};

let monitoringEnsured = false;
async function ensureMonitoringTable() {
    if (monitoringEnsured) return;
    const runSafe = async (sql) => {
        try {
            await pool.query(sql);
        } catch (err) {
            const code = String(err?.code || '');
            const msg = String(err?.message || '').toLowerCase();
            if (code === '42P07' || code === '42710' || code === '23505' || code === 'ER_DUP_FIELDNAME' || msg.includes('duplicate column')) return;
            throw err;
        }
    };
    if (isPostgres) {
        await runSafe(`
            CREATE TABLE IF NOT EXISTS project_monitoring_records (
                record_id BIGSERIAL PRIMARY KEY,
                project_id BIGINT NOT NULL,
                comment TEXT NOT NULL,
                recommendations TEXT NULL,
                challenges TEXT NULL,
                activity_code TEXT NULL,
                activity_name TEXT NULL,
                indicator_name TEXT NULL,
                achieved_value NUMERIC NULL,
                warning_level TEXT NULL,
                is_routine_observation BOOLEAN NOT NULL DEFAULT TRUE,
                user_id BIGINT NULL,
                observation_date DATE NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NULL,
                voided BOOLEAN NOT NULL DEFAULT FALSE,
                voided_by BIGINT NULL
            )
        `);
        await runSafe(`ALTER TABLE project_monitoring_records ADD COLUMN IF NOT EXISTS activity_code TEXT NULL`);
        await runSafe(`ALTER TABLE project_monitoring_records ADD COLUMN IF NOT EXISTS activity_name TEXT NULL`);
        await runSafe(`ALTER TABLE project_monitoring_records ADD COLUMN IF NOT EXISTS indicator_name TEXT NULL`);
        await runSafe(`ALTER TABLE project_monitoring_records ADD COLUMN IF NOT EXISTS achieved_value NUMERIC NULL`);
        await runSafe(`CREATE INDEX IF NOT EXISTS idx_project_monitoring_records_project_id ON project_monitoring_records (project_id)`);
    } else {
        await runSafe(`ALTER TABLE project_monitoring_records ADD COLUMN activityCode VARCHAR(128) NULL`);
        await runSafe(`ALTER TABLE project_monitoring_records ADD COLUMN activityName VARCHAR(512) NULL`);
        await runSafe(`ALTER TABLE project_monitoring_records ADD COLUMN indicatorName VARCHAR(512) NULL`);
        await runSafe(`ALTER TABLE project_monitoring_records ADD COLUMN achievedValue DECIMAL(18,2) NULL`);
    }
    monitoringEnsured = true;
}

/**
 * @route POST /api/projects/:projectId/monitoring
 * @description Creates a new monitoring record for a project, including observations, recommendations, and challenges.
 * @access Private (requires authentication and privilege)
 */
router.post('/', async (req, res) => {
    const { projectId } = req.params;
    const {
        comment,
        recommendations,
        challenges,
        warningLevel,
        isRoutineObservation,
        projectActivityCode,
        projectActivityName,
        projectIndicatorName,
        achievedValue,
        reportDate,
    } = req.body;

    // TODO: Get userId from authenticated user (e.g., req.user.userId)
    const userId = 1; // Placeholder for now

    if (!projectId || !comment) {
        return res.status(400).json({ message: 'Missing required fields: projectId, comment' });
    }

    const newRecord = {
        projectId,
        comment,
        recommendations, // Added
        challenges, // Added
        activityCode: projectActivityCode || null,
        activityName: projectActivityName || null,
        indicatorName: projectIndicatorName || null,
        achievedValue: achievedValue === '' || achievedValue == null ? null : achievedValue,
        warningLevel: warningLevel || 'None',
        isRoutineObservation: isRoutineObservation || 1,
        observationDate: reportDate || null,
        userId,
        createdAt: new Date(),
        voided: 0,
    };

    try {
        await ensureMonitoringTable();
        if (isPostgres) {
            const insertRes = await pool.query(
                `INSERT INTO project_monitoring_records
                    (project_id, comment, recommendations, challenges, activity_code, activity_name, indicator_name, achieved_value, warning_level, is_routine_observation, observation_date, user_id, created_at, voided)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW(),false)
                 RETURNING record_id`,
                [
                    Number(projectId),
                    String(comment),
                    recommendations != null ? String(recommendations) : null,
                    challenges != null ? String(challenges) : null,
                    projectActivityCode != null ? String(projectActivityCode) : null,
                    projectActivityName != null ? String(projectActivityName) : null,
                    projectIndicatorName != null ? String(projectIndicatorName) : null,
                    achievedValue === '' || achievedValue == null ? null : Number(achievedValue),
                    warningLevel || 'None',
                    isRoutineObservation === false || isRoutineObservation === 0 || isRoutineObservation === '0' ? false : true,
                    reportDate || null,
                    userId != null ? Number(userId) : null,
                ]
            );
            const rid = insertRes.rows?.[0]?.record_id;
            const rows = await queryRows(
                `SELECT
                    record_id AS "recordId",
                    project_id AS "projectId",
                    comment,
                    recommendations,
                    challenges,
                    activity_code AS "projectActivityCode",
                    activity_name AS "projectActivityName",
                    indicator_name AS "projectIndicatorName",
                    achieved_value AS "achievedValue",
                    warning_level AS "warningLevel",
                    is_routine_observation AS "isRoutineObservation",
                    user_id AS "userId",
                    observation_date AS "observationDate",
                    created_at AS "createdAt",
                    updated_at AS "updatedAt",
                    voided,
                    voided_by AS "voidedBy"
                 FROM project_monitoring_records
                 WHERE record_id = $1`,
                [rid]
            );
            return res.status(201).json(rows?.[0] || null);
        }
        const [result] = await pool.query('INSERT INTO project_monitoring_records SET ?', newRecord);
        const [rows] = await pool.query('SELECT * FROM project_monitoring_records WHERE recordId = ?', [result.insertId]);
        return res.status(201).json(rows[0]);
    } catch (error) {
        console.error('Error creating project monitoring record:', error);
        res.status(500).json({ message: 'Error creating project monitoring record', error: error.message });
    }
});

// GET route remains the same as it uses 'SELECT *' and will fetch all columns automatically.
/**
 * @route GET /api/projects/:projectId/monitoring
 * @description Get all active monitoring records for a specific project.
 * @access Private (protected by middleware)
 */
router.get('/', async (req, res) => {
    const { projectId } = req.params;
    try {
        await ensureMonitoringTable();
        if (isPostgres) {
            const rows = await queryRows(
                `SELECT
                    record_id AS "recordId",
                    project_id AS "projectId",
                    comment,
                    recommendations,
                    challenges,
                    activity_code AS "projectActivityCode",
                    activity_name AS "projectActivityName",
                    indicator_name AS "projectIndicatorName",
                    achieved_value AS "achievedValue",
                    warning_level AS "warningLevel",
                    is_routine_observation AS "isRoutineObservation",
                    user_id AS "userId",
                    observation_date AS "observationDate",
                    created_at AS "createdAt",
                    updated_at AS "updatedAt",
                    voided,
                    voided_by AS "voidedBy"
                 FROM project_monitoring_records
                 WHERE project_id = $1 AND COALESCE(voided, false) = false
                 ORDER BY observation_date DESC NULLS LAST, created_at DESC NULLS LAST, record_id DESC`,
                [Number(projectId)]
            );
            return res.status(200).json(rows);
        }
        const [rows] = await pool.query(
            'SELECT * FROM project_monitoring_records WHERE projectId = ? AND voided = 0 ORDER BY observationDate DESC',
            [projectId]
        );
        return res.status(200).json(rows);
    } catch (error) {
        console.error('Error fetching project monitoring records:', error);
        res.status(500).json({ message: 'Error fetching project monitoring records', error: error.message });
    }
});

/**
 * @route PUT /api/projects/:projectId/monitoring/:recordId
 * @description Update an existing monitoring record.
 * @access Private (requires authentication and privilege)
 */
// CORRECTED: The path should be just '/:recordId' because the parent already provides '/:projectId/monitoring'
router.put('/:recordId', async (req, res) => {
    const { projectId, recordId } = req.params;
    const {
        comment,
        recommendations,
        challenges,
        warningLevel,
        isRoutineObservation,
        projectActivityCode,
        projectActivityName,
        projectIndicatorName,
        achievedValue,
        reportDate,
    } = req.body;

    // TODO: Get userId from authenticated user (e.g., req.user.userId)
    const userId = 1;

    const updatedFields = {
        comment,
        recommendations, // Added
        challenges, // Added
        activityCode: projectActivityCode || null,
        activityName: projectActivityName || null,
        indicatorName: projectIndicatorName || null,
        achievedValue: achievedValue === '' || achievedValue == null ? null : achievedValue,
        warningLevel,
        isRoutineObservation,
        observationDate: reportDate || null,
        updatedAt: new Date(),
    };

    try {
        await ensureMonitoringTable();
        if (isPostgres) {
            const upd = await pool.query(
                `UPDATE project_monitoring_records
                 SET comment = $1,
                     recommendations = $2,
                     challenges = $3,
                     activity_code = $4,
                     activity_name = $5,
                     indicator_name = $6,
                     achieved_value = $7,
                     warning_level = $8,
                     is_routine_observation = $9,
                     observation_date = $10,
                     updated_at = NOW()
                 WHERE record_id = $11 AND project_id = $12 AND COALESCE(voided, false) = false`,
                [
                    comment != null ? String(comment) : null,
                    recommendations != null ? String(recommendations) : null,
                    challenges != null ? String(challenges) : null,
                    projectActivityCode != null ? String(projectActivityCode) : null,
                    projectActivityName != null ? String(projectActivityName) : null,
                    projectIndicatorName != null ? String(projectIndicatorName) : null,
                    achievedValue === '' || achievedValue == null ? null : Number(achievedValue),
                    warningLevel != null ? String(warningLevel) : null,
                    isRoutineObservation === false || isRoutineObservation === 0 || isRoutineObservation === '0' ? false : true,
                    reportDate || null,
                    Number(recordId),
                    Number(projectId),
                ]
            );
            if (!(upd.rowCount > 0)) return res.status(404).json({ message: 'Monitoring record not found or already deleted' });
            const rows = await queryRows(
                `SELECT
                    record_id AS "recordId",
                    project_id AS "projectId",
                    comment,
                    recommendations,
                    challenges,
                    activity_code AS "projectActivityCode",
                    activity_name AS "projectActivityName",
                    indicator_name AS "projectIndicatorName",
                    achieved_value AS "achievedValue",
                    warning_level AS "warningLevel",
                    is_routine_observation AS "isRoutineObservation",
                    user_id AS "userId",
                    observation_date AS "observationDate",
                    created_at AS "createdAt",
                    updated_at AS "updatedAt",
                    voided,
                    voided_by AS "voidedBy"
                 FROM project_monitoring_records
                 WHERE record_id = $1`,
                [Number(recordId)]
            );
            return res.status(200).json(rows?.[0] || null);
        }
        const [result] = await pool.query(
            'UPDATE project_monitoring_records SET ? WHERE recordId = ? AND projectId = ? AND voided = 0',
            [updatedFields, recordId, projectId] // Added projectId for an extra layer of security
        );

        if (result.affectedRows > 0) {
            const [rows] = await pool.query('SELECT * FROM project_monitoring_records WHERE recordId = ?', [recordId]);
            return res.status(200).json(rows[0]);
        }
        return res.status(404).json({ message: 'Monitoring record not found or already deleted' });
    } catch (error) {
        console.error('Error updating project monitoring record:', error);
        res.status(500).json({ message: 'Error updating project monitoring record', error: error.message });
    }
});

/**
 * @route DELETE /api/projects/:projectId/monitoring/:recordId
 * @description Soft delete a monitoring record.
 * @access Private (requires authentication and privilege)
 */
// CORRECTED: The path should be just '/:recordId'
router.delete('/:recordId', async (req, res) => {
    const { projectId, recordId } = req.params;
    // TODO: Get userId from authenticated user (e.g., req.user.userId)
    const userId = 1;

    try {
        await ensureMonitoringTable();
        if (isPostgres) {
            const upd = await pool.query(
                `UPDATE project_monitoring_records
                 SET voided = true,
                     voided_by = $1,
                     updated_at = NOW()
                 WHERE record_id = $2 AND project_id = $3 AND COALESCE(voided, false) = false`,
                [userId != null ? Number(userId) : null, Number(recordId), Number(projectId)]
            );
            if (!(upd.rowCount > 0)) {
                return res.status(404).json({ message: 'Monitoring record not found or already deleted' });
            }
            return res.status(200).json({ message: 'Monitoring record soft-deleted successfully' });
        }
        const [result] = await pool.query(
            'UPDATE project_monitoring_records SET voided = 1, voidedBy = ? WHERE recordId = ? AND projectId = ? AND voided = 0',
            [userId, recordId, projectId] // Added projectId for security
        );
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Monitoring record not found or already deleted' });
        }
        return res.status(200).json({ message: 'Monitoring record soft-deleted successfully' });
    } catch (error) {
        console.error('Error deleting project monitoring record:', error);
        res.status(500).json({ message: 'Error deleting project monitoring record', error: error.message });
    }
});

module.exports = router;