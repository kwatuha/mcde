// src/routes/taskRoutes.js
const express = require('express');
const router = express.Router();
const pool = require('../config/db'); // Import the database connection pool

// --- IMPORTANT: No camelToSnakeCase/snakeToCamelCase helpers are needed in this file ---
// Because your DB columns are already camelCase, and frontend sends camelCase.
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
            createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            voided TINYINT(1) NOT NULL DEFAULT 0,
            INDEX idx_project_outputs_projectId (projectId)
        )
    `);
    enhancementTablesEnsured = true;
}

// --- Subtasks (linked to tasks) ---
router.get('/:taskId/subtasks', async (req, res) => {
    const { taskId } = req.params;
    try {
        await ensureEnhancementTables();
        const result = await pool.query(
            'SELECT * FROM task_subtasks WHERE taskId = ? AND voided = 0 ORDER BY createdAt DESC',
            [taskId]
        );
        const rows = getRows(result);
        res.status(200).json(rows);
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
        const insertResult = await pool.query('INSERT INTO task_subtasks SET ?', payload);
        const insertMeta = getMeta(insertResult);
        const subtaskId = insertMeta.insertId || getRows(insertResult)?.[0]?.subtaskId;
        const selectResult = await pool.query('SELECT * FROM task_subtasks WHERE subtaskId = ?', [subtaskId]);
        const rows = getRows(selectResult);
        res.status(201).json(rows?.[0] || null);
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
        const updateResult = await pool.query('UPDATE task_subtasks SET ? WHERE subtaskId = ? AND voided = 0', [payload, subtaskId]);
        const updateMeta = getMeta(updateResult);
        if (!(updateMeta.affectedRows > 0 || updateMeta.rowCount > 0)) return res.status(404).json({ message: 'Subtask not found.' });
        const selectResult = await pool.query('SELECT * FROM task_subtasks WHERE subtaskId = ?', [subtaskId]);
        const rows = getRows(selectResult);
        res.status(200).json(rows?.[0] || null);
    } catch (error) {
        console.error(`Error updating subtask ${subtaskId}:`, error);
        res.status(500).json({ message: 'Error updating subtask', error: error.message });
    }
});

router.delete('/subtasks/:subtaskId', async (req, res) => {
    const { subtaskId } = req.params;
    try {
        await ensureEnhancementTables();
        const deleteResult = await pool.query(
            'UPDATE task_subtasks SET voided = 1, updatedAt = ? WHERE subtaskId = ? AND voided = 0',
            [new Date(), subtaskId]
        );
        const deleteMeta = getMeta(deleteResult);
        if (!(deleteMeta.affectedRows > 0 || deleteMeta.rowCount > 0)) return res.status(404).json({ message: 'Subtask not found.' });
        res.status(204).send();
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
        const result = await pool.query(
            'SELECT * FROM project_outputs WHERE projectId = ? AND voided = 0 ORDER BY createdAt DESC',
            [projectId]
        );
        const rows = getRows(result);
        res.status(200).json(rows);
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
    };
    if (!payload.outputName) return res.status(400).json({ message: 'outputName is required.' });
    try {
        await ensureEnhancementTables();
        const insertResult = await pool.query('INSERT INTO project_outputs SET ?', payload);
        const insertMeta = getMeta(insertResult);
        const outputId = insertMeta.insertId || getRows(insertResult)?.[0]?.outputId;
        const selectResult = await pool.query('SELECT * FROM project_outputs WHERE outputId = ?', [outputId]);
        const rows = getRows(selectResult);
        res.status(201).json(rows?.[0] || null);
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
        updatedAt: new Date(),
    };
    Object.keys(payload).forEach((key) => payload[key] === undefined && delete payload[key]);
    if (!Object.keys(payload).length) return res.status(400).json({ message: 'No output fields provided for update.' });
    try {
        await ensureEnhancementTables();
        const updateResult = await pool.query('UPDATE project_outputs SET ? WHERE outputId = ? AND voided = 0', [payload, outputId]);
        const updateMeta = getMeta(updateResult);
        if (!(updateMeta.affectedRows > 0 || updateMeta.rowCount > 0)) return res.status(404).json({ message: 'Output not found.' });
        const selectResult = await pool.query('SELECT * FROM project_outputs WHERE outputId = ?', [outputId]);
        const rows = getRows(selectResult);
        res.status(200).json(rows?.[0] || null);
    } catch (error) {
        console.error(`Error updating output ${outputId}:`, error);
        res.status(500).json({ message: 'Error updating project output', error: error.message });
    }
});

router.delete('/outputs/:outputId', async (req, res) => {
    const { outputId } = req.params;
    try {
        await ensureEnhancementTables();
        const deleteResult = await pool.query(
            'UPDATE project_outputs SET voided = 1, updatedAt = ? WHERE outputId = ? AND voided = 0',
            [new Date(), outputId]
        );
        const deleteMeta = getMeta(deleteResult);
        if (!(deleteMeta.affectedRows > 0 || deleteMeta.rowCount > 0)) return res.status(404).json({ message: 'Output not found.' });
        res.status(204).send();
    } catch (error) {
        console.error(`Error deleting output ${outputId}:`, error);
        res.status(500).json({ message: 'Error deleting project output', error: error.message });
    }
});

// GET all tasks (optional, if you need a route for all tasks regardless of project)
router.get('/', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM tasks');
        const rows = getRows(result);
        res.status(200).json(rows); // Direct return, as DB columns are camelCase
    } catch (error) {
        console.error('Error fetching all tasks:', error);
        res.status(500).json({ message: 'Error fetching all tasks', error: error.message });
    }
});

// GET tasks for a specific project
router.get('/project/:projectId', async (req, res) => {
    const { projectId } = req.params; // projectId is camelCase from URL
    try {
        const rows = await queryRowsWithFallback(
            [
                'SELECT * FROM tasks WHERE projectId = ?',
                'SELECT * FROM tasks WHERE "projectId" = ?',
                'SELECT * FROM tasks WHERE project_id = ?',
            ],
            [projectId]
        );
        res.status(200).json(rows); // Return directly
    } catch (error) {
        console.error(`Error fetching tasks for project ${projectId}:`, error);
        res.status(500).json({ message: `Error fetching tasks for project ${projectId}`, error: error.message });
    }
});

// GET a single task by taskId
router.get('/:taskId', async (req, res) => {
    const { taskId } = req.params; // taskId is camelCase from URL
    try {
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
        console.log('Inserting Task:', newTask); // Log data going to DB
        const insertResult = await pool.query('INSERT INTO tasks SET ?', newTask);
        const insertMeta = getMeta(insertResult);
        
        if (insertMeta.insertId) {
            newTask.taskId = insertMeta.insertId;
        }

        res.status(201).json(newTask); // Return the created task as camelCase
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
        console.log(`Updating Task ${taskId}:`, updatedFields); // Log data going to DB
        const updateResult = await pool.query('UPDATE tasks SET ? WHERE taskId = ?', [updatedFields, taskId]);
        const updateMeta = getMeta(updateResult);
        
        if (updateMeta.affectedRows > 0 || updateMeta.rowCount > 0) {
            const selectResult = await pool.query('SELECT * FROM tasks WHERE taskId = ?', [taskId]);
            const rows = getRows(selectResult);
            res.status(200).json(rows[0]);
        } else {
            res.status(404).json({ message: 'Task not found' });
        }
    } catch (error) {
        console.error('Error updating task:', error);
        res.status(500).json({ message: 'Error updating task', error: error.message });
    }
});

// DELETE task
router.delete('/:taskId', async (req, res) => {
    const { taskId } = req.params; // taskId is camelCase from URL
    try {
        const deleteResult = await pool.query('DELETE FROM tasks WHERE taskId = ?', [taskId]);
        const deleteMeta = getMeta(deleteResult);
        if (deleteMeta.affectedRows > 0 || deleteMeta.rowCount > 0) {
            res.status(204).send();
        } else {
            res.status(404).json({ message: 'Task not found' });
        }
    } catch (error) {
        console.error(`Error deleting task with ID ${taskId}:`, error);
        res.status(500).json({ message: `Error deleting task with ID ${taskId}`, error: error.message });
    }
});

module.exports = router;