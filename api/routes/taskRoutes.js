// src/routes/taskRoutes.js
const express = require('express');
const router = express.Router();
const pool = require('../config/db'); // Import the database connection pool

// --- IMPORTANT: No camelToSnakeCase/snakeToCamelCase helpers are needed in this file ---
// Because your DB columns are already camelCase, and frontend sends camelCase.
const DB_TYPE = process.env.DB_TYPE || 'mysql';
const isPostgres = DB_TYPE === 'postgresql';
let enhancementTablesEnsured = false;
const getRows = (result) => {
    if (Array.isArray(result)) return result[0] || [];
    if (result && Array.isArray(result.rows)) return result.rows;
    return [];
};
const getMeta = (result) => {
    if (Array.isArray(result)) return result[1] || {};
    return result || {};
};
const isUndefinedColumnError = (error) => {
    const msg = String(error?.message || '').toLowerCase();
    return msg.includes('column') && (msg.includes('does not exist') || msg.includes('unknown column'));
};
const isDuplicateColumnError = (error) => {
    const msg = String(error?.message || '').toLowerCase();
    return error?.code === 'ER_DUP_FIELDNAME' || msg.includes('duplicate column');
};
const textOrNull = (value) => {
    if (value == null) return null;
    const text = String(value).trim();
    return text || null;
};
async function runOptionalDDL(sql) {
    try {
        await pool.query(sql);
    } catch (error) {
        if (!isDuplicateColumnError(error)) throw error;
    }
}
async function queryRowsWithFallback(queries, params) {
    let lastError = null;
    for (const sql of queries) {
        try {
            const result = await pool.query(sql, params);
            return getRows(result);
        } catch (error) {
            lastError = error;
            if (!isUndefinedColumnError(error)) throw error;
        }
    }
    throw lastError || new Error('All fallback queries failed.');
}

async function ensureEnhancementTables() {
    if (enhancementTablesEnsured) return;
    if (isPostgres) {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS task_subtasks (
                subtask_id BIGSERIAL PRIMARY KEY,
                task_id BIGINT NOT NULL,
                subtask_name TEXT NOT NULL,
                description TEXT NULL,
                status TEXT NOT NULL DEFAULT 'not_started',
                due_date DATE NULL,
                assignee_name TEXT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                voided BOOLEAN NOT NULL DEFAULT FALSE
            )
        `);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_task_subtasks_task_id ON task_subtasks (task_id)`);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS project_outputs (
                output_id BIGSERIAL PRIMARY KEY,
                project_id BIGINT NOT NULL,
                output_name TEXT NOT NULL,
                output_description TEXT NULL,
                unit_of_measure TEXT NULL,
                baseline_value NUMERIC(18,2) NULL,
                target_value NUMERIC(18,2) NULL,
                achieved_value NUMERIC(18,2) NULL,
                status TEXT NOT NULL DEFAULT 'on_track',
                reporting_period TEXT NULL,
                linked_bq_group TEXT NULL,
                linked_milestone TEXT NULL,
                evidence_source TEXT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                voided BOOLEAN NOT NULL DEFAULT FALSE
            )
        `);
        await pool.query(`ALTER TABLE project_outputs ADD COLUMN IF NOT EXISTS linked_bq_group TEXT NULL`);
        await pool.query(`ALTER TABLE project_outputs ADD COLUMN IF NOT EXISTS linked_milestone TEXT NULL`);
        await pool.query(`ALTER TABLE project_outputs ADD COLUMN IF NOT EXISTS evidence_source TEXT NULL`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_project_outputs_project_id ON project_outputs (project_id)`);
    } else {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS task_subtasks (
                subtaskId INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
                taskId INT NOT NULL,
                subtaskName VARCHAR(255) NOT NULL,
                description TEXT NULL,
                status VARCHAR(50) NOT NULL DEFAULT 'not_started',
                dueDate DATE NULL,
                assigneeName VARCHAR(255) NULL,
                createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                voided TINYINT(1) NOT NULL DEFAULT 0,
                INDEX idx_task_subtasks_taskId (taskId)
            )
        `);
        await pool.query(`
            CREATE TABLE IF NOT EXISTS project_outputs (
                outputId INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
                projectId INT NOT NULL,
                outputName VARCHAR(255) NOT NULL,
                outputDescription TEXT NULL,
                unitOfMeasure VARCHAR(100) NULL,
                baselineValue DECIMAL(18,2) NULL,
                targetValue DECIMAL(18,2) NULL,
                achievedValue DECIMAL(18,2) NULL,
                status VARCHAR(50) NOT NULL DEFAULT 'on_track',
                reportingPeriod VARCHAR(100) NULL,
                linkedBqGroup VARCHAR(255) NULL,
                linkedMilestone VARCHAR(255) NULL,
                evidenceSource VARCHAR(255) NULL,
                createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                voided TINYINT(1) NOT NULL DEFAULT 0,
                INDEX idx_project_outputs_projectId (projectId)
            )
        `);
        await runOptionalDDL(`ALTER TABLE project_outputs ADD COLUMN linkedBqGroup VARCHAR(255) NULL`);
        await runOptionalDDL(`ALTER TABLE project_outputs ADD COLUMN linkedMilestone VARCHAR(255) NULL`);
        await runOptionalDDL(`ALTER TABLE project_outputs ADD COLUMN evidenceSource VARCHAR(255) NULL`);
    }
    enhancementTablesEnsured = true;
}

/**
 * Ensure a lightweight `tasks` table exists for the subtasks/output UI.
 * This does not touch any legacy kemri_* tables.
 */
async function ensureTasksTable() {
    if (isPostgres) {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS tasks (
                task_id BIGSERIAL PRIMARY KEY,
                project_id BIGINT NULL,
                task_name TEXT NOT NULL,
                description TEXT NULL,
                status TEXT NOT NULL DEFAULT 'not_started',
                start_date DATE NULL,
                end_date DATE NULL,
                due_date DATE NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        `);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON tasks (project_id)`);
    } else {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS tasks (
                taskId INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
                projectId INT NULL,
                taskName VARCHAR(255) NOT NULL,
                description TEXT NULL,
                status VARCHAR(50) NOT NULL DEFAULT 'not_started',
                startDate DATE NULL,
                endDate DATE NULL,
                dueDate DATE NULL,
                createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);
    }
}

// --- Subtasks (linked to tasks) ---
router.get('/:taskId/subtasks', async (req, res) => {
    const { taskId } = req.params;
    try {
        await ensureEnhancementTables();
        if (isPostgres) {
            const result = await pool.query(
                `SELECT
                    subtask_id AS "subtaskId",
                    task_id AS "taskId",
                    subtask_name AS "subtaskName",
                    description,
                    status,
                    due_date AS "dueDate",
                    assignee_name AS "assigneeName",
                    created_at AS "createdAt",
                    updated_at AS "updatedAt"
                 FROM task_subtasks
                 WHERE task_id = $1 AND COALESCE(voided, false) = false
                 ORDER BY created_at DESC NULLS LAST, subtask_id DESC`,
                [Number(taskId)]
            );
            return res.status(200).json(result.rows || []);
        }
        const result = await pool.query(
            'SELECT * FROM task_subtasks WHERE taskId = ? AND voided = 0 ORDER BY createdAt DESC',
            [taskId]
        );
        const rows = getRows(result);
        return res.status(200).json(rows);
    } catch (error) {
        console.error(`Error fetching subtasks for task ${taskId}:`, error);
        res.status(500).json({ message: 'Error fetching subtasks', error: error.message });
    }
});

router.post('/:taskId/subtasks', async (req, res) => {
    const { taskId } = req.params;
    const payload = {
        taskId: Number(taskId),
        subtaskName: String(req.body?.subtaskName || '').trim(),
        description: req.body?.description ? String(req.body.description) : null,
        status: String(req.body?.status || 'not_started').trim() || 'not_started',
        dueDate: req.body?.dueDate || null,
        assigneeName: req.body?.assigneeName ? String(req.body.assigneeName) : null,
    };
    if (!payload.subtaskName) {
        return res.status(400).json({ message: 'subtaskName is required.' });
    }
    try {
        await ensureEnhancementTables();
        if (isPostgres) {
            const insertRes = await pool.query(
                `INSERT INTO task_subtasks
                    (task_id, subtask_name, description, status, due_date, assignee_name, voided)
                 VALUES ($1,$2,$3,$4,$5,$6,false)
                 RETURNING subtask_id AS "subtaskId"`,
                [
                    payload.taskId,
                    payload.subtaskName,
                    payload.description,
                    payload.status,
                    payload.dueDate || null,
                    payload.assigneeName,
                ]
            );
            const subtaskId = insertRes.rows?.[0]?.subtaskId;
            const selectRes = await pool.query(
                `SELECT
                    subtask_id AS "subtaskId",
                    task_id AS "taskId",
                    subtask_name AS "subtaskName",
                    description,
                    status,
                    due_date AS "dueDate",
                    assignee_name AS "assigneeName",
                    created_at AS "createdAt",
                    updated_at AS "updatedAt"
                 FROM task_subtasks
                 WHERE subtask_id = $1`,
                [subtaskId]
            );
            return res.status(201).json(selectRes.rows?.[0] || null);
        }
        const insertResult = await pool.query('INSERT INTO task_subtasks SET ?', payload);
        const insertMeta = getMeta(insertResult);
        const subtaskId = insertMeta.insertId || getRows(insertResult)?.[0]?.subtaskId;
        const selectResult = await pool.query('SELECT * FROM task_subtasks WHERE subtaskId = ?', [subtaskId]);
        const rows = getRows(selectResult);
        return res.status(201).json(rows?.[0] || null);
    } catch (error) {
        console.error(`Error creating subtask for task ${taskId}:`, error);
        res.status(500).json({ message: 'Error creating subtask', error: error.message });
    }
});

router.put('/subtasks/:subtaskId', async (req, res) => {
    const { subtaskId } = req.params;
    const payload = {
        subtaskName: req.body?.subtaskName != null ? String(req.body.subtaskName).trim() : undefined,
        description: req.body?.description != null ? String(req.body.description) : undefined,
        status: req.body?.status != null ? String(req.body.status).trim() : undefined,
        dueDate: req.body?.dueDate ?? undefined,
        assigneeName: req.body?.assigneeName != null ? String(req.body.assigneeName) : undefined,
        updatedAt: new Date(),
    };
    Object.keys(payload).forEach((key) => payload[key] === undefined && delete payload[key]);
    if (!Object.keys(payload).length) {
        return res.status(400).json({ message: 'No subtask fields provided for update.' });
    }
    try {
        await ensureEnhancementTables();
        if (isPostgres) {
            const allowed = {
                subtask_name: payload.subtaskName,
                description: payload.description,
                status: payload.status,
                due_date: payload.dueDate,
                assignee_name: payload.assigneeName,
                updated_at: new Date(),
            };
            Object.keys(allowed).forEach((k) => allowed[k] === undefined && delete allowed[k]);
            if (!Object.keys(allowed).length) {
                return res.status(400).json({ message: 'No subtask fields provided for update.' });
            }
            const keys = Object.keys(allowed);
            const sets = keys.map((k, idx) => `${k} = $${idx + 1}`);
            const values = keys.map((k) => allowed[k]);
            values.push(Number(subtaskId));
            const updateRes = await pool.query(
                `UPDATE task_subtasks SET ${sets.join(', ')}
                 WHERE subtask_id = $${values.length} AND COALESCE(voided, false) = false`,
                values
            );
            if (!(updateRes.rowCount > 0)) return res.status(404).json({ message: 'Subtask not found.' });
            const selectRes = await pool.query(
                `SELECT
                    subtask_id AS "subtaskId",
                    task_id AS "taskId",
                    subtask_name AS "subtaskName",
                    description,
                    status,
                    due_date AS "dueDate",
                    assignee_name AS "assigneeName",
                    created_at AS "createdAt",
                    updated_at AS "updatedAt"
                 FROM task_subtasks
                 WHERE subtask_id = $1`,
                [Number(subtaskId)]
            );
            return res.status(200).json(selectRes.rows?.[0] || null);
        }
        const updateResult = await pool.query('UPDATE task_subtasks SET ? WHERE subtaskId = ? AND voided = 0', [payload, subtaskId]);
        const updateMeta = getMeta(updateResult);
        if (!(updateMeta.affectedRows > 0 || updateMeta.rowCount > 0)) return res.status(404).json({ message: 'Subtask not found.' });
        const selectResult = await pool.query('SELECT * FROM task_subtasks WHERE subtaskId = ?', [subtaskId]);
        const rows = getRows(selectResult);
        return res.status(200).json(rows?.[0] || null);
    } catch (error) {
        console.error(`Error updating subtask ${subtaskId}:`, error);
        res.status(500).json({ message: 'Error updating subtask', error: error.message });
    }
});

router.delete('/subtasks/:subtaskId', async (req, res) => {
    const { subtaskId } = req.params;
    try {
        await ensureEnhancementTables();
        if (isPostgres) {
            const del = await pool.query(
                `UPDATE task_subtasks
                 SET voided = true, updated_at = NOW()
                 WHERE subtask_id = $1 AND COALESCE(voided, false) = false`,
                [Number(subtaskId)]
            );
            if (!(del.rowCount > 0)) return res.status(404).json({ message: 'Subtask not found.' });
            return res.status(204).send();
        }
        const deleteResult = await pool.query(
            'UPDATE task_subtasks SET voided = 1, updatedAt = ? WHERE subtaskId = ? AND voided = 0',
            [new Date(), subtaskId]
        );
        const deleteMeta = getMeta(deleteResult);
        if (!(deleteMeta.affectedRows > 0 || deleteMeta.rowCount > 0)) return res.status(404).json({ message: 'Subtask not found.' });
        return res.status(204).send();
    } catch (error) {
        console.error(`Error deleting subtask ${subtaskId}:`, error);
        res.status(500).json({ message: 'Error deleting subtask', error: error.message });
    }
});

// --- Project Outputs register ---
router.get('/project/:projectId/outputs', async (req, res) => {
    const { projectId } = req.params;
    try {
        await ensureEnhancementTables();
        if (isPostgres) {
            const result = await pool.query(
                `SELECT
                    output_id AS "outputId",
                    project_id AS "projectId",
                    output_name AS "outputName",
                    output_description AS "outputDescription",
                    unit_of_measure AS "unitOfMeasure",
                    baseline_value AS "baselineValue",
                    target_value AS "targetValue",
                    achieved_value AS "achievedValue",
                    status,
                    reporting_period AS "reportingPeriod",
                    linked_bq_group AS "linkedBqGroup",
                    linked_milestone AS "linkedMilestone",
                    evidence_source AS "evidenceSource",
                    created_at AS "createdAt",
                    updated_at AS "updatedAt"
                 FROM project_outputs
                 WHERE project_id = $1 AND COALESCE(voided, false) = false
                 ORDER BY created_at DESC NULLS LAST, output_id DESC`,
                [Number(projectId)]
            );
            return res.status(200).json(result.rows || []);
        }
        const result = await pool.query(
            'SELECT * FROM project_outputs WHERE projectId = ? AND voided = 0 ORDER BY createdAt DESC',
            [projectId]
        );
        const rows = getRows(result);
        return res.status(200).json(rows);
    } catch (error) {
        console.error(`Error fetching outputs for project ${projectId}:`, error);
        res.status(500).json({ message: 'Error fetching project outputs', error: error.message });
    }
});

router.post('/project/:projectId/outputs', async (req, res) => {
    const { projectId } = req.params;
    const payload = {
        projectId: Number(projectId),
        outputName: String(req.body?.outputName || '').trim(),
        outputDescription: req.body?.outputDescription ? String(req.body.outputDescription) : null,
        unitOfMeasure: req.body?.unitOfMeasure ? String(req.body.unitOfMeasure) : null,
        baselineValue: req.body?.baselineValue != null && req.body?.baselineValue !== '' ? Number(req.body.baselineValue) : null,
        targetValue: req.body?.targetValue != null && req.body?.targetValue !== '' ? Number(req.body.targetValue) : null,
        achievedValue: req.body?.achievedValue != null && req.body?.achievedValue !== '' ? Number(req.body.achievedValue) : null,
        status: String(req.body?.status || 'on_track').trim() || 'on_track',
        reportingPeriod: req.body?.reportingPeriod ? String(req.body.reportingPeriod) : null,
        linkedBqGroup: textOrNull(req.body?.linkedBqGroup),
        linkedMilestone: textOrNull(req.body?.linkedMilestone),
        evidenceSource: textOrNull(req.body?.evidenceSource),
    };
    if (!payload.outputName) return res.status(400).json({ message: 'outputName is required.' });
    try {
        await ensureEnhancementTables();
        if (isPostgres) {
            const insertRes = await pool.query(
                `INSERT INTO project_outputs
                    (project_id, output_name, output_description, unit_of_measure, baseline_value, target_value, achieved_value, status, reporting_period, linked_bq_group, linked_milestone, evidence_source, voided)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,false)
                 RETURNING output_id AS "outputId"`,
                [
                    payload.projectId,
                    payload.outputName,
                    payload.outputDescription,
                    payload.unitOfMeasure,
                    payload.baselineValue,
                    payload.targetValue,
                    payload.achievedValue,
                    payload.status,
                    payload.reportingPeriod,
                    payload.linkedBqGroup,
                    payload.linkedMilestone,
                    payload.evidenceSource,
                ]
            );
            const outputId = insertRes.rows?.[0]?.outputId;
            const selectRes = await pool.query(
                `SELECT
                    output_id AS "outputId",
                    project_id AS "projectId",
                    output_name AS "outputName",
                    output_description AS "outputDescription",
                    unit_of_measure AS "unitOfMeasure",
                    baseline_value AS "baselineValue",
                    target_value AS "targetValue",
                    achieved_value AS "achievedValue",
                    status,
                    reporting_period AS "reportingPeriod",
                    linked_bq_group AS "linkedBqGroup",
                    linked_milestone AS "linkedMilestone",
                    evidence_source AS "evidenceSource",
                    created_at AS "createdAt",
                    updated_at AS "updatedAt"
                 FROM project_outputs
                 WHERE output_id = $1`,
                [outputId]
            );
            return res.status(201).json(selectRes.rows?.[0] || null);
        }
        const insertResult = await pool.query('INSERT INTO project_outputs SET ?', payload);
        const insertMeta = getMeta(insertResult);
        const outputId = insertMeta.insertId || getRows(insertResult)?.[0]?.outputId;
        const selectResult = await pool.query('SELECT * FROM project_outputs WHERE outputId = ?', [outputId]);
        const rows = getRows(selectResult);
        return res.status(201).json(rows?.[0] || null);
    } catch (error) {
        console.error(`Error creating output for project ${projectId}:`, error);
        res.status(500).json({ message: 'Error creating project output', error: error.message });
    }
});

router.put('/outputs/:outputId', async (req, res) => {
    const { outputId } = req.params;
    const payload = {
        outputName: req.body?.outputName != null ? String(req.body.outputName).trim() : undefined,
        outputDescription: req.body?.outputDescription != null ? String(req.body.outputDescription) : undefined,
        unitOfMeasure: req.body?.unitOfMeasure != null ? String(req.body.unitOfMeasure) : undefined,
        baselineValue: req.body?.baselineValue != null && req.body?.baselineValue !== '' ? Number(req.body.baselineValue) : undefined,
        targetValue: req.body?.targetValue != null && req.body?.targetValue !== '' ? Number(req.body.targetValue) : undefined,
        achievedValue: req.body?.achievedValue != null && req.body?.achievedValue !== '' ? Number(req.body.achievedValue) : undefined,
        status: req.body?.status != null ? String(req.body.status).trim() : undefined,
        reportingPeriod: req.body?.reportingPeriod != null ? String(req.body.reportingPeriod) : undefined,
        linkedBqGroup: req.body?.linkedBqGroup !== undefined ? textOrNull(req.body.linkedBqGroup) : undefined,
        linkedMilestone: req.body?.linkedMilestone !== undefined ? textOrNull(req.body.linkedMilestone) : undefined,
        evidenceSource: req.body?.evidenceSource !== undefined ? textOrNull(req.body.evidenceSource) : undefined,
        updatedAt: new Date(),
    };
    Object.keys(payload).forEach((key) => payload[key] === undefined && delete payload[key]);
    if (!Object.keys(payload).length) return res.status(400).json({ message: 'No output fields provided for update.' });
    try {
        await ensureEnhancementTables();
        if (isPostgres) {
            const allowed = {
                output_name: payload.outputName,
                output_description: payload.outputDescription,
                unit_of_measure: payload.unitOfMeasure,
                baseline_value: payload.baselineValue,
                target_value: payload.targetValue,
                achieved_value: payload.achievedValue,
                status: payload.status,
                reporting_period: payload.reportingPeriod,
                linked_bq_group: payload.linkedBqGroup,
                linked_milestone: payload.linkedMilestone,
                evidence_source: payload.evidenceSource,
                updated_at: new Date(),
            };
            Object.keys(allowed).forEach((k) => allowed[k] === undefined && delete allowed[k]);
            if (!Object.keys(allowed).length) return res.status(400).json({ message: 'No output fields provided for update.' });
            const keys = Object.keys(allowed);
            const sets = keys.map((k, idx) => `${k} = $${idx + 1}`);
            const values = keys.map((k) => allowed[k]);
            values.push(Number(outputId));
            const upd = await pool.query(
                `UPDATE project_outputs
                 SET ${sets.join(', ')}
                 WHERE output_id = $${values.length} AND COALESCE(voided, false) = false`,
                values
            );
            if (!(upd.rowCount > 0)) return res.status(404).json({ message: 'Output not found.' });
            const selectRes = await pool.query(
                `SELECT
                    output_id AS "outputId",
                    project_id AS "projectId",
                    output_name AS "outputName",
                    output_description AS "outputDescription",
                    unit_of_measure AS "unitOfMeasure",
                    baseline_value AS "baselineValue",
                    target_value AS "targetValue",
                    achieved_value AS "achievedValue",
                    status,
                    reporting_period AS "reportingPeriod",
                    linked_bq_group AS "linkedBqGroup",
                    linked_milestone AS "linkedMilestone",
                    evidence_source AS "evidenceSource",
                    created_at AS "createdAt",
                    updated_at AS "updatedAt"
                 FROM project_outputs
                 WHERE output_id = $1`,
                [Number(outputId)]
            );
            return res.status(200).json(selectRes.rows?.[0] || null);
        }
        const updateResult = await pool.query('UPDATE project_outputs SET ? WHERE outputId = ? AND voided = 0', [payload, outputId]);
        const updateMeta = getMeta(updateResult);
        if (!(updateMeta.affectedRows > 0 || updateMeta.rowCount > 0)) return res.status(404).json({ message: 'Output not found.' });
        const selectResult = await pool.query('SELECT * FROM project_outputs WHERE outputId = ?', [outputId]);
        const rows = getRows(selectResult);
        return res.status(200).json(rows?.[0] || null);
    } catch (error) {
        console.error(`Error updating output ${outputId}:`, error);
        res.status(500).json({ message: 'Error updating project output', error: error.message });
    }
});

router.delete('/outputs/:outputId', async (req, res) => {
    const { outputId } = req.params;
    try {
        await ensureEnhancementTables();
        if (isPostgres) {
            const del = await pool.query(
                `UPDATE project_outputs
                 SET voided = true, updated_at = NOW()
                 WHERE output_id = $1 AND COALESCE(voided, false) = false`,
                [Number(outputId)]
            );
            if (!(del.rowCount > 0)) return res.status(404).json({ message: 'Output not found.' });
            return res.status(204).send();
        }
        const deleteResult = await pool.query(
            'UPDATE project_outputs SET voided = 1, updatedAt = ? WHERE outputId = ? AND voided = 0',
            [new Date(), outputId]
        );
        const deleteMeta = getMeta(deleteResult);
        if (!(deleteMeta.affectedRows > 0 || deleteMeta.rowCount > 0)) return res.status(404).json({ message: 'Output not found.' });
        return res.status(204).send();
    } catch (error) {
        console.error(`Error deleting output ${outputId}:`, error);
        res.status(500).json({ message: 'Error deleting project output', error: error.message });
    }
});

// GET all tasks (optional, if you need a route for all tasks regardless of project)
router.get('/', async (req, res) => {
    try {
        await ensureTasksTable();
        if (isPostgres) {
            const result = await pool.query(
                `SELECT
                    task_id AS "taskId",
                    project_id AS "projectId",
                    task_name AS "taskName",
                    description,
                    status,
                    start_date AS "startDate",
                    end_date AS "endDate",
                    due_date AS "dueDate",
                    created_at AS "createdAt",
                    updated_at AS "updatedAt"
                 FROM tasks
                 ORDER BY created_at DESC NULLS LAST, task_id DESC`
            );
            return res.status(200).json(result.rows || []);
        }
        const result = await pool.query('SELECT * FROM tasks');
        const rows = getRows(result);
        return res.status(200).json(rows); // Direct return, as DB columns are camelCase
    } catch (error) {
        console.error('Error fetching all tasks:', error);
        res.status(500).json({ message: 'Error fetching all tasks', error: error.message });
    }
});

// GET tasks for a specific project
router.get('/project/:projectId', async (req, res) => {
    const { projectId } = req.params; // projectId is camelCase from URL
    try {
        await ensureTasksTable();
        if (isPostgres) {
            const result = await pool.query(
                `SELECT
                    task_id AS "taskId",
                    project_id AS "projectId",
                    task_name AS "taskName",
                    description,
                    status,
                    start_date AS "startDate",
                    end_date AS "endDate",
                    due_date AS "dueDate",
                    created_at AS "createdAt",
                    updated_at AS "updatedAt"
                 FROM tasks
                 WHERE project_id = $1
                 ORDER BY created_at DESC NULLS LAST, task_id DESC`,
                [Number(projectId)]
            );
            return res.status(200).json(result.rows || []);
        }
        const rows = await queryRowsWithFallback(
            [
                'SELECT * FROM tasks WHERE projectId = ?',
                'SELECT * FROM tasks WHERE "projectId" = ?',
                'SELECT * FROM tasks WHERE project_id = ?',
            ],
            [projectId]
        );
        return res.status(200).json(rows); // Return directly
    } catch (error) {
        console.error(`Error fetching tasks for project ${projectId}:`, error);
        res.status(500).json({ message: `Error fetching tasks for project ${projectId}`, error: error.message });
    }
});

// GET a single task by taskId
router.get('/:taskId', async (req, res) => {
    const { taskId } = req.params; // taskId is camelCase from URL
    try {
        if (isPostgres) {
            const result = await pool.query(
                `SELECT
                    task_id AS "taskId",
                    project_id AS "projectId",
                    task_name AS "taskName",
                    description,
                    status,
                    start_date AS "startDate",
                    end_date AS "endDate",
                    due_date AS "dueDate",
                    created_at AS "createdAt",
                    updated_at AS "updatedAt"
                 FROM tasks
                 WHERE task_id = $1
                 LIMIT 1`,
                [Number(taskId)]
            );
            if (result.rows?.length) return res.status(200).json(result.rows[0]);
            return res.status(404).json({ message: 'Task not found' });
        }
        const rows = await queryRowsWithFallback(
            [
                'SELECT * FROM tasks WHERE taskId = ?',
                'SELECT * FROM tasks WHERE "taskId" = ?',
                'SELECT * FROM tasks WHERE task_id = ?',
            ],
            [taskId]
        );
        if (rows.length > 0) {
            res.status(200).json(rows[0]); // Return directly
        } else {
            res.status(404).json({ message: 'Task not found' });
        }
    } catch (error) {
        console.error('Error fetching task:', error);
        res.status(500).json({ message: 'Error fetching task', error: error.message });
    }
});

// POST new task
router.post('/', async (req, res) => {
    // req.body contains camelCase from frontend (taskName, startDate, endDate, dueDate, projectId, etc.)
    // It might also contain 'assignees' and 'dependencies' arrays which need to be removed for the main task table
    const clientData = { ...req.body }; // Create a shallow copy to modify

    // Remove assignees and dependencies arrays as they are handled by separate junction tables/routes
    delete clientData.assignees;
    delete clientData.dependencies;

    const newTask = {
        createdAt: new Date(), // Use 'createdAt' as per DB schema
        updatedAt: new Date(), // Use 'updatedAt' as per DB schema
        ...clientData // This now only includes simple columns for tasks
    };

    // Remove 'taskId' if client provides it and DB auto-increments
    delete newTask.taskId; 

    try {
        await ensureTasksTable();
        console.log('Inserting Task:', newTask); // Log data going to DB
        if (isPostgres) {
            const insertRes = await pool.query(
                `INSERT INTO tasks
                    (project_id, task_name, description, status, start_date, end_date, due_date)
                 VALUES ($1,$2,$3,$4,$5,$6,$7)
                 RETURNING task_id AS "taskId"`,
                [
                    newTask.projectId != null ? Number(newTask.projectId) : null,
                    String(newTask.taskName || '').trim(),
                    newTask.description != null ? String(newTask.description) : null,
                    String(newTask.status || 'not_started'),
                    newTask.startDate || null,
                    newTask.endDate || null,
                    newTask.dueDate || null,
                ]
            );
            const tid = insertRes.rows?.[0]?.taskId;
            const selectRes = await pool.query(
                `SELECT
                    task_id AS "taskId",
                    project_id AS "projectId",
                    task_name AS "taskName",
                    description,
                    status,
                    start_date AS "startDate",
                    end_date AS "endDate",
                    due_date AS "dueDate",
                    created_at AS "createdAt",
                    updated_at AS "updatedAt"
                 FROM tasks
                 WHERE task_id = $1`,
                [tid]
            );
            return res.status(201).json(selectRes.rows?.[0] || null);
        }
        const insertResult = await pool.query('INSERT INTO tasks SET ?', newTask);
        const insertMeta = getMeta(insertResult);
        if (insertMeta.insertId) {
            newTask.taskId = insertMeta.insertId;
        }
        return res.status(201).json(newTask); // Return the created task as camelCase
    } catch (error) {
        console.error('Error creating task:', error);
        res.status(500).json({ message: 'Error creating task', error: error.message });
    }
});

// PUT update task
router.put('/:taskId', async (req, res) => {
    const { taskId } = req.params; // taskId is camelCase from URL
    const clientData = { ...req.body }; // Create a shallow copy to modify

    // Remove assignees and dependencies arrays as they are handled by separate junction tables/routes
    delete clientData.assignees;
    delete clientData.dependencies;

    const updatedFields = {
        ...clientData,
        updatedAt: new Date() // Use 'updatedAt' as per DB schema
    };

    // Remove 'taskId' from the body to prevent attempting to update primary key
    delete updatedFields.taskId; 

    try {
        await ensureTasksTable();
        console.log(`Updating Task ${taskId}:`, updatedFields); // Log data going to DB
        if (isPostgres) {
            const allowed = {
                project_id: updatedFields.projectId != null ? Number(updatedFields.projectId) : undefined,
                task_name: updatedFields.taskName != null ? String(updatedFields.taskName).trim() : undefined,
                description: updatedFields.description != null ? String(updatedFields.description) : undefined,
                status: updatedFields.status != null ? String(updatedFields.status) : undefined,
                start_date: updatedFields.startDate ?? undefined,
                end_date: updatedFields.endDate ?? undefined,
                due_date: updatedFields.dueDate ?? undefined,
                updated_at: new Date(),
            };
            Object.keys(allowed).forEach((k) => allowed[k] === undefined && delete allowed[k]);
            if (!Object.keys(allowed).length) return res.status(400).json({ message: 'No task fields provided for update.' });
            const keys = Object.keys(allowed);
            const sets = keys.map((k, idx) => `${k} = $${idx + 1}`);
            const values = keys.map((k) => allowed[k]);
            values.push(Number(taskId));
            const upd = await pool.query(
                `UPDATE tasks SET ${sets.join(', ')} WHERE task_id = $${values.length}`,
                values
            );
            if (!(upd.rowCount > 0)) return res.status(404).json({ message: 'Task not found' });
            const selectRes = await pool.query(
                `SELECT
                    task_id AS "taskId",
                    project_id AS "projectId",
                    task_name AS "taskName",
                    description,
                    status,
                    start_date AS "startDate",
                    end_date AS "endDate",
                    due_date AS "dueDate",
                    created_at AS "createdAt",
                    updated_at AS "updatedAt"
                 FROM tasks
                 WHERE task_id = $1`,
                [Number(taskId)]
            );
            return res.status(200).json(selectRes.rows?.[0] || null);
        }
        const updateResult = await pool.query('UPDATE tasks SET ? WHERE taskId = ?', [updatedFields, taskId]);
        const updateMeta = getMeta(updateResult);
        if (updateMeta.affectedRows > 0 || updateMeta.rowCount > 0) {
            const selectResult = await pool.query('SELECT * FROM tasks WHERE taskId = ?', [taskId]);
            const rows = getRows(selectResult);
            return res.status(200).json(rows[0]);
        }
        return res.status(404).json({ message: 'Task not found' });
    } catch (error) {
        console.error('Error updating task:', error);
        res.status(500).json({ message: 'Error updating task', error: error.message });
    }
});

// DELETE task
router.delete('/:taskId', async (req, res) => {
    const { taskId } = req.params; // taskId is camelCase from URL
    try {
        await ensureTasksTable();
        if (isPostgres) {
            const del = await pool.query('DELETE FROM tasks WHERE task_id = $1', [Number(taskId)]);
            if (del.rowCount > 0) return res.status(204).send();
            return res.status(404).json({ message: 'Task not found' });
        }
        const deleteResult = await pool.query('DELETE FROM tasks WHERE taskId = ?', [taskId]);
        const deleteMeta = getMeta(deleteResult);
        if (deleteMeta.affectedRows > 0 || deleteMeta.rowCount > 0) return res.status(204).send();
        return res.status(404).json({ message: 'Task not found' });
    } catch (error) {
        console.error(`Error deleting task with ID ${taskId}:`, error);
        res.status(500).json({ message: `Error deleting task with ID ${taskId}`, error: error.message });
    }
});

module.exports = router;