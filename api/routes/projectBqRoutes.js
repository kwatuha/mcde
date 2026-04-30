const express = require('express');
const router = express.Router({ mergeParams: true });
const pool = require('../config/db');

const DB_TYPE = process.env.DB_TYPE || 'mysql';
const isPostgres = DB_TYPE === 'postgresql';

async function ensureTable() {
    const runSafeDdl = async (sql) => {
        try {
            await pool.query(sql);
        } catch (err) {
            const code = String(err?.code || '');
            // Ignore concurrent create/index races and continue.
            if (code === '42P07' || code === '42710' || code === '23505') {
                return;
            }
            throw err;
        }
    };

    if (isPostgres) {
        await runSafeDdl(`
            CREATE TABLE IF NOT EXISTS project_bq_items (
                id BIGSERIAL PRIMARY KEY,
                project_id BIGINT NOT NULL,
                activity_name TEXT NOT NULL,
                milestone_name TEXT NULL,
                start_date DATE NULL,
                end_date DATE NULL,
                budget_amount NUMERIC(18,2) NULL,
                progress_percent NUMERIC(5,2) NULL DEFAULT 0,
                remarks TEXT NULL,
                completed BOOLEAN NOT NULL DEFAULT FALSE,
                completion_date DATE NULL,
                sort_order INTEGER NULL DEFAULT 0,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                voided BOOLEAN NOT NULL DEFAULT FALSE
            )
        `);
        await runSafeDdl(`CREATE INDEX IF NOT EXISTS idx_project_bq_items_project ON project_bq_items (project_id)`);
        await runSafeDdl(`ALTER TABLE project_bq_items ADD COLUMN IF NOT EXISTS completion_date DATE NULL`);
        await runSafeDdl(`
            CREATE TABLE IF NOT EXISTS project_bq_progress_logs (
                id BIGSERIAL PRIMARY KEY,
                bq_item_id BIGINT NOT NULL REFERENCES project_bq_items(id) ON DELETE CASCADE,
                progress_date DATE NOT NULL,
                progress_percent NUMERIC(5,2) NOT NULL,
                remarks TEXT NULL,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        `);
        await runSafeDdl(`CREATE INDEX IF NOT EXISTS idx_bq_progress_logs_item_date ON project_bq_progress_logs (bq_item_id, progress_date DESC)`);
    } else {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS project_bq_items (
                id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
                project_id BIGINT NOT NULL,
                activity_name VARCHAR(255) NOT NULL,
                milestone_name VARCHAR(255) NULL,
                start_date DATE NULL,
                end_date DATE NULL,
                budget_amount DECIMAL(18,2) NULL,
                progress_percent DECIMAL(5,2) DEFAULT 0,
                remarks TEXT NULL,
                completed TINYINT(1) NOT NULL DEFAULT 0,
                completion_date DATE NULL,
                sort_order INT DEFAULT 0,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                voided TINYINT(1) NOT NULL DEFAULT 0,
                INDEX idx_project_bq_items_project (project_id)
            )
        `);
        await pool.query(`
            CREATE TABLE IF NOT EXISTS project_bq_progress_logs (
                id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
                bq_item_id BIGINT NOT NULL,
                progress_date DATE NOT NULL,
                progress_percent DECIMAL(5,2) NOT NULL,
                remarks TEXT NULL,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_bq_progress_logs_item_date (bq_item_id, progress_date)
            )
        `);
    }
}

function sanitizePayload(body = {}) {
    const activityName = String(body.activityName || body.activity_name || '').trim();
    const milestoneName = String(body.milestoneName || body.milestone_name || '').trim();
    const startDate = body.startDate || body.start_date || null;
    const endDate = body.endDate || body.end_date || null;
    const budgetAmountRaw = body.budgetAmount ?? body.budget_amount;
    const progressRaw = body.progressPercent ?? body.progress_percent ?? 0;
    const remarks = String(body.remarks || '').trim();
    const sortOrderRaw = body.sortOrder ?? body.sort_order ?? 0;
    const completed = Boolean(body.completed);
    const completionDate = body.completionDate || body.completion_date || null;

    const budgetAmount = budgetAmountRaw === '' || budgetAmountRaw === null || budgetAmountRaw === undefined
        ? null
        : Number(budgetAmountRaw);
    const progressPercent = Number(progressRaw);
    const sortOrder = Number(sortOrderRaw);

    if (!activityName) {
        return { error: 'Activity / milestone name is required.' };
    }
    if (!Number.isFinite(progressPercent) || progressPercent < 0 || progressPercent > 100) {
        return { error: 'Progress percent must be between 0 and 100.' };
    }
    if (budgetAmount !== null && !Number.isFinite(budgetAmount)) {
        return { error: 'Budget amount must be a valid number.' };
    }
    if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
        return { error: 'End date must be on or after start date.' };
    }

    return {
        value: {
            activityName,
            milestoneName: milestoneName || null,
            startDate,
            endDate,
            budgetAmount,
            progressPercent,
            remarks: remarks || null,
            completed,
            completionDate,
            sortOrder: Number.isFinite(sortOrder) ? sortOrder : 0,
        }
    };
}

router.get('/', async (req, res) => {
    const projectId = Number(req.params.projectId);
    if (!Number.isFinite(projectId)) {
        return res.status(400).json({ message: 'Invalid project id.' });
    }

    try {
        await ensureTable();
        let rows;
        if (isPostgres) {
            const result = await pool.query(
                `SELECT
                    id AS "itemId",
                    project_id AS "projectId",
                    activity_name AS "activityName",
                    milestone_name AS "milestoneName",
                    start_date AS "startDate",
                    end_date AS "endDate",
                    budget_amount AS "budgetAmount",
                    progress_percent AS "progressPercent",
                    remarks,
                    completed,
                    completion_date AS "completionDate",
                    sort_order AS "sortOrder",
                    created_at AS "createdAt",
                    updated_at AS "updatedAt"
                 FROM project_bq_items
                 WHERE project_id = $1 AND voided = false
                 ORDER BY sort_order ASC, id ASC`,
                [projectId]
            );
            rows = result.rows || [];
        } else {
            const [result] = await pool.query(
                `SELECT
                    id AS itemId,
                    project_id AS projectId,
                    activity_name AS activityName,
                    milestone_name AS milestoneName,
                    start_date AS startDate,
                    end_date AS endDate,
                    budget_amount AS budgetAmount,
                    progress_percent AS progressPercent,
                    remarks,
                    completed,
                    completion_date AS completionDate,
                    sort_order AS sortOrder,
                    created_at AS createdAt,
                    updated_at AS updatedAt
                 FROM project_bq_items
                 WHERE project_id = ? AND voided = 0
                 ORDER BY sort_order ASC, id ASC`,
                [projectId]
            );
            rows = result || [];
        }
        return res.status(200).json(rows);
    } catch (error) {
        console.error('Error loading BQ items:', error);
        return res.status(500).json({ message: 'Error loading BQ items', error: error.message });
    }
});

router.post('/', async (req, res) => {
    const projectId = Number(req.params.projectId);
    if (!Number.isFinite(projectId)) {
        return res.status(400).json({ message: 'Invalid project id.' });
    }

    const parsed = sanitizePayload(req.body);
    if (parsed.error) {
        return res.status(400).json({ message: parsed.error });
    }
    const p = parsed.value;

    try {
        await ensureTable();
        if (isPostgres) {
            const result = await pool.query(
                `INSERT INTO project_bq_items (
                    project_id, activity_name, milestone_name, start_date, end_date,
                    budget_amount, progress_percent, remarks, completed, completion_date, sort_order
                ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
                RETURNING
                    id AS "itemId",
                    project_id AS "projectId",
                    activity_name AS "activityName",
                    milestone_name AS "milestoneName",
                    start_date AS "startDate",
                    end_date AS "endDate",
                    budget_amount AS "budgetAmount",
                    progress_percent AS "progressPercent",
                    remarks,
                    completed,
                    completion_date AS "completionDate",
                    sort_order AS "sortOrder",
                    created_at AS "createdAt",
                    updated_at AS "updatedAt"`,
                [
                    projectId, p.activityName, p.milestoneName, p.startDate, p.endDate,
                    p.budgetAmount, p.progressPercent, p.remarks, p.completed, p.completionDate, p.sortOrder
                ]
            );
            return res.status(201).json(result.rows?.[0] || null);
        }

        const [insert] = await pool.query(
            `INSERT INTO project_bq_items (
                project_id, activity_name, milestone_name, start_date, end_date,
                budget_amount, progress_percent, remarks, completed, completion_date, sort_order
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
            [
                projectId, p.activityName, p.milestoneName, p.startDate, p.endDate,
                p.budgetAmount, p.progressPercent, p.remarks, p.completed ? 1 : 0, p.completionDate, p.sortOrder
            ]
        );
        const [rows] = await pool.query(
            `SELECT
                id AS itemId,
                project_id AS projectId,
                activity_name AS activityName,
                milestone_name AS milestoneName,
                start_date AS startDate,
                end_date AS endDate,
                budget_amount AS budgetAmount,
                progress_percent AS progressPercent,
                remarks,
                completed,
                completion_date AS completionDate,
                sort_order AS sortOrder,
                created_at AS createdAt,
                updated_at AS updatedAt
             FROM project_bq_items
             WHERE id = ?`,
            [insert.insertId]
        );
        return res.status(201).json(rows?.[0] || null);
    } catch (error) {
        console.error('Error creating BQ item:', error);
        return res.status(500).json({ message: 'Error creating BQ item', error: error.message });
    }
});

router.put('/:itemId', async (req, res) => {
    const projectId = Number(req.params.projectId);
    const itemId = Number(req.params.itemId);
    if (!Number.isFinite(projectId) || !Number.isFinite(itemId)) {
        return res.status(400).json({ message: 'Invalid project or item id.' });
    }

    const parsed = sanitizePayload(req.body);
    if (parsed.error) {
        return res.status(400).json({ message: parsed.error });
    }
    const p = parsed.value;

    try {
        await ensureTable();
        const completionDate = p.completed
            ? (p.completionDate || new Date().toISOString().slice(0, 10))
            : null;

        if (isPostgres) {
            const result = await pool.query(
                `UPDATE project_bq_items
                 SET progress_percent = $1, remarks = $2, completed = $3, completion_date = $4,
                     updated_at = CURRENT_TIMESTAMP
                 WHERE id = $5 AND project_id = $6 AND voided = false
                 RETURNING
                    id AS "itemId",
                    project_id AS "projectId",
                    activity_name AS "activityName",
                    milestone_name AS "milestoneName",
                    start_date AS "startDate",
                    end_date AS "endDate",
                    budget_amount AS "budgetAmount",
                    progress_percent AS "progressPercent",
                    remarks,
                    completed,
                    completion_date AS "completionDate",
                    sort_order AS "sortOrder",
                    created_at AS "createdAt",
                    updated_at AS "updatedAt"`,
                [
                    p.progressPercent, p.remarks, p.completed, completionDate, itemId, projectId
                ]
            );
            if ((result.rowCount || 0) === 0) {
                return res.status(404).json({ message: 'BQ item not found.' });
            }
            return res.status(200).json(result.rows?.[0] || null);
        }

        const [result] = await pool.query(
            `UPDATE project_bq_items
             SET progress_percent = ?, remarks = ?, completed = ?, completion_date = ?,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = ? AND project_id = ? AND voided = 0`,
            [
                p.progressPercent, p.remarks, p.completed ? 1 : 0, completionDate, itemId, projectId
            ]
        );
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'BQ item not found.' });
        }
        const [rows] = await pool.query(
            `SELECT
                id AS itemId,
                project_id AS projectId,
                activity_name AS activityName,
                milestone_name AS milestoneName,
                start_date AS startDate,
                end_date AS endDate,
                budget_amount AS budgetAmount,
                progress_percent AS progressPercent,
                remarks,
                completed,
                completion_date AS completionDate,
                sort_order AS sortOrder,
                created_at AS createdAt,
                updated_at AS updatedAt
             FROM project_bq_items
             WHERE id = ?`,
            [itemId]
        );
        return res.status(200).json(rows?.[0] || null);
    } catch (error) {
        console.error('Error updating BQ item:', error);
        return res.status(500).json({ message: 'Error updating BQ item', error: error.message });
    }
});

router.delete('/:itemId', async (req, res) => {
    const projectId = Number(req.params.projectId);
    const itemId = Number(req.params.itemId);
    if (!Number.isFinite(projectId) || !Number.isFinite(itemId)) {
        return res.status(400).json({ message: 'Invalid project or item id.' });
    }

    try {
        await ensureTable();
        if (isPostgres) {
            const result = await pool.query(
                `UPDATE project_bq_items
                 SET voided = true, updated_at = CURRENT_TIMESTAMP
                 WHERE id = $1 AND project_id = $2 AND voided = false`,
                [itemId, projectId]
            );
            if ((result.rowCount || 0) === 0) {
                return res.status(404).json({ message: 'BQ item not found.' });
            }
        } else {
            const [result] = await pool.query(
                `UPDATE project_bq_items
                 SET voided = 1, updated_at = CURRENT_TIMESTAMP
                 WHERE id = ? AND project_id = ? AND voided = 0`,
                [itemId, projectId]
            );
            if (result.affectedRows === 0) {
                return res.status(404).json({ message: 'BQ item not found.' });
            }
        }
        return res.status(200).json({ message: 'BQ item deleted.' });
    } catch (error) {
        console.error('Error deleting BQ item:', error);
        return res.status(500).json({ message: 'Error deleting BQ item', error: error.message });
    }
});

router.get('/:itemId/progress', async (req, res) => {
    const projectId = Number(req.params.projectId);
    const itemId = Number(req.params.itemId);
    if (!Number.isFinite(projectId) || !Number.isFinite(itemId)) {
        return res.status(400).json({ message: 'Invalid project or item id.' });
    }
    try {
        await ensureTable();
        if (isPostgres) {
            const itemCheck = await pool.query(
                'SELECT 1 FROM project_bq_items WHERE id = $1 AND project_id = $2 AND voided = false',
                [itemId, projectId]
            );
            if ((itemCheck.rowCount || 0) === 0) return res.status(404).json({ message: 'BQ item not found.' });
            const result = await pool.query(
                `SELECT id, progress_date AS "progressDate", progress_percent AS "progressPercent", remarks, created_at AS "createdAt"
                 FROM project_bq_progress_logs
                 WHERE bq_item_id = $1
                 ORDER BY progress_date DESC, id DESC`,
                [itemId]
            );
            return res.status(200).json(result.rows || []);
        }

        const [itemCheck] = await pool.query(
            'SELECT 1 FROM project_bq_items WHERE id = ? AND project_id = ? AND voided = 0',
            [itemId, projectId]
        );
        if (!itemCheck?.length) return res.status(404).json({ message: 'BQ item not found.' });
        const [rows] = await pool.query(
            `SELECT id, progress_date AS progressDate, progress_percent AS progressPercent, remarks, created_at AS createdAt
             FROM project_bq_progress_logs
             WHERE bq_item_id = ?
             ORDER BY progress_date DESC, id DESC`,
            [itemId]
        );
        return res.status(200).json(rows || []);
    } catch (error) {
        console.error('Error loading BQ progress logs:', error);
        return res.status(500).json({ message: 'Error loading BQ progress logs', error: error.message });
    }
});

router.post('/:itemId/progress', async (req, res) => {
    const projectId = Number(req.params.projectId);
    const itemId = Number(req.params.itemId);
    const progressDate = req.body.progressDate || req.body.progress_date;
    const progressPercent = Number(req.body.progressPercent ?? req.body.progress_percent);
    const remarks = req.body.remarks ? String(req.body.remarks).trim() : null;
    if (!Number.isFinite(projectId) || !Number.isFinite(itemId)) {
        return res.status(400).json({ message: 'Invalid project or item id.' });
    }
    if (!progressDate) {
        return res.status(400).json({ message: 'progressDate is required.' });
    }
    if (!Number.isFinite(progressPercent) || progressPercent < 0 || progressPercent > 100) {
        return res.status(400).json({ message: 'progressPercent must be between 0 and 100.' });
    }

    try {
        await ensureTable();
        if (isPostgres) {
            const itemCheck = await pool.query(
                'SELECT 1 FROM project_bq_items WHERE id = $1 AND project_id = $2 AND voided = false',
                [itemId, projectId]
            );
            if ((itemCheck.rowCount || 0) === 0) return res.status(404).json({ message: 'BQ item not found.' });

            const insert = await pool.query(
                `INSERT INTO project_bq_progress_logs (bq_item_id, progress_date, progress_percent, remarks)
                 VALUES ($1,$2,$3,$4)
                 RETURNING id, progress_date AS "progressDate", progress_percent AS "progressPercent", remarks, created_at AS "createdAt"`,
                [itemId, progressDate, progressPercent, remarks]
            );
            const completed = progressPercent >= 100;
            await pool.query(
                `UPDATE project_bq_items
                 SET progress_percent = $1,
                     completed = $2,
                     completion_date = CASE WHEN $2 = true THEN COALESCE(completion_date, $3::date) ELSE completion_date END,
                     updated_at = CURRENT_TIMESTAMP
                 WHERE id = $4 AND project_id = $5 AND voided = false`,
                [progressPercent, completed, progressDate, itemId, projectId]
            );
            return res.status(201).json(insert.rows?.[0] || null);
        }

        const [itemCheck] = await pool.query(
            'SELECT 1 FROM project_bq_items WHERE id = ? AND project_id = ? AND voided = 0',
            [itemId, projectId]
        );
        if (!itemCheck?.length) return res.status(404).json({ message: 'BQ item not found.' });

        const [insert] = await pool.query(
            `INSERT INTO project_bq_progress_logs (bq_item_id, progress_date, progress_percent, remarks)
             VALUES (?,?,?,?)`,
            [itemId, progressDate, progressPercent, remarks]
        );
        const completed = progressPercent >= 100 ? 1 : 0;
        await pool.query(
            `UPDATE project_bq_items
             SET progress_percent = ?, completed = ?, completion_date = IF(? = 1, COALESCE(completion_date, ?), completion_date), updated_at = CURRENT_TIMESTAMP
             WHERE id = ? AND project_id = ? AND voided = 0`,
            [progressPercent, completed, completed, progressDate, itemId, projectId]
        );
        const [rows] = await pool.query(
            `SELECT id, progress_date AS progressDate, progress_percent AS progressPercent, remarks, created_at AS createdAt
             FROM project_bq_progress_logs WHERE id = ?`,
            [insert.insertId]
        );
        return res.status(201).json(rows?.[0] || null);
    } catch (error) {
        console.error('Error creating BQ progress log:', error);
        return res.status(500).json({ message: 'Error creating BQ progress log', error: error.message });
    }
});

module.exports = router;
