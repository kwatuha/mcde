// src/routes/annualWorkPlanRoutes.js
const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const DB_TYPE = process.env.DB_TYPE || 'mysql';
const isPostgres = DB_TYPE === 'postgresql';
let workPlanTableEnsured = false;
let workPlanEnsurePromise = null;
const rowsFromResult = (result) => (isPostgres ? (result?.rows || []) : (Array.isArray(result) ? (result[0] || []) : []));
const affectedRowsFromResult = (result) => (isPostgres ? Number(result?.rowCount || 0) : Number(result?.[0]?.affectedRows || 0));

async function ensureWorkPlanTable() {
    if (workPlanTableEnsured) return;

    if (isPostgres) {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS annual_workplans (
                "workplanId" BIGSERIAL PRIMARY KEY,
                "subProgramId" BIGINT NULL,
                "workplanName" TEXT NULL,
                "financialYear" TEXT NULL,
                "workplanDescription" TEXT NULL,
                "totalBudget" NUMERIC(18,2) NULL,
                "approvalStatus" TEXT NULL,
                "actualExpenditure" NUMERIC(18,2) NULL,
                "performanceScore" NUMERIC(10,2) NULL,
                challenges TEXT NULL,
                lessons TEXT NULL,
                recommendations TEXT NULL,
                remarks TEXT NULL,
                voided BOOLEAN NOT NULL DEFAULT FALSE,
                "userId" BIGINT NULL,
                "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        `);
    } else {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS annual_workplans (
                workplanId BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
                subProgramId BIGINT NULL,
                workplanName VARCHAR(255) NULL,
                financialYear VARCHAR(255) NULL,
                workplanDescription TEXT NULL,
                totalBudget DECIMAL(18,2) NULL,
                approvalStatus VARCHAR(50) NULL,
                actualExpenditure DECIMAL(18,2) NULL,
                performanceScore DECIMAL(10,2) NULL,
                challenges TEXT NULL,
                lessons TEXT NULL,
                recommendations TEXT NULL,
                remarks TEXT NULL,
                voided TINYINT(1) NOT NULL DEFAULT 0,
                userId BIGINT NULL,
                createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);
    }

    workPlanTableEnsured = true;
}

router.use(async (req, res, next) => {
    try {
        if (!workPlanEnsurePromise) {
            workPlanEnsurePromise = ensureWorkPlanTable();
        }
        await workPlanEnsurePromise;
        next();
    } catch (error) {
        workPlanEnsurePromise = null;
        console.error('Error ensuring annual_workplans table:', error);
        res.status(500).json({ message: 'Failed to initialize work plans table', error: error.message });
    }
});

// --- Helper Function: Format Date for MySQL DATETIME column ---
const formatToMySQLDateTime = (date) => {
    if (!date) return null;
    const d = new Date(date);
    if (isNaN(d.getTime())) {
        console.warn('Invalid date provided to formatToMySQLDateTime:', date);
        return null;
    }
    const year = d.getFullYear();
    const month = (d.getMonth() + 1).toString().padStart(2, '0');
    const day = d.getDate().toString().padStart(2, '0');
    const hours = d.getHours().toString().padStart(2, '0');
    const minutes = d.getMinutes().toString().padStart(2, '0');
    const seconds = d.getSeconds().toString().padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
};

// GET all work plans for a specific subprogram
router.get('/by-subprogram/:subProgramId', async (req, res) => {
    const { subProgramId } = req.params;
    try {
        const result = await pool.query(
            `SELECT * FROM annual_workplans WHERE ${isPostgres ? '"subProgramId"' : 'subProgramId'} = ? AND voided = ${isPostgres ? 'false' : '0'}`,
            [subProgramId]
        );
        const rows = rowsFromResult(result);
        res.status(200).json(rows);
    } catch (error) {
        console.error('Error fetching work plans:', error);
        res.status(500).json({ message: 'Error fetching work plans', error: error.message });
    }
});

// GET a single work plan by ID
router.get('/:workplanId', async (req, res) => {
    const { workplanId } = req.params;
    try {
        const result = await pool.query(
            `SELECT * FROM annual_workplans WHERE ${isPostgres ? '"workplanId"' : 'workplanId'} = ? AND voided = ${isPostgres ? 'false' : '0'}`,
            [workplanId]
        );
        const rows = rowsFromResult(result);
        if (rows.length > 0) {
            res.status(200).json(rows[0]);
        } else {
            res.status(404).json({ message: 'Work plan not found' });
        }
    } catch (error) {
        console.error('Error fetching work plan:', error);
        res.status(500).json({ message: 'Error fetching work plan', error: error.message });
    }
});

// POST a new work plan
router.post('/', async (req, res) => {
    const newWorkPlan = {
        ...req.body,
        voided: isPostgres ? false : 0,
        createdAt: formatToMySQLDateTime(new Date()),
        updatedAt: formatToMySQLDateTime(new Date()),
    };
    try {
        if (isPostgres) {
            const result = await pool.query(
                'INSERT INTO annual_workplans ("subProgramId", "workplanName", "financialYear", "workplanDescription", "totalBudget", "approvalStatus", "actualExpenditure", "performanceScore", challenges, lessons, recommendations, remarks, voided, "createdAt", "updatedAt") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING "workplanId"',
                [
                    newWorkPlan.subProgramId || null,
                    newWorkPlan.workplanName || null,
                    newWorkPlan.financialYear || null,
                    newWorkPlan.workplanDescription || null,
                    newWorkPlan.totalBudget || null,
                    newWorkPlan.approvalStatus || null,
                    newWorkPlan.actualExpenditure || null,
                    newWorkPlan.performanceScore || null,
                    newWorkPlan.challenges || null,
                    newWorkPlan.lessons || null,
                    newWorkPlan.recommendations || null,
                    newWorkPlan.remarks || null,
                    false,
                    newWorkPlan.createdAt,
                    newWorkPlan.updatedAt,
                ]
            );
            const created = rowsFromResult(result)[0] || {};
            res.status(201).json({ ...newWorkPlan, workplanId: created.workplanId });
            return;
        }

        const [result] = await pool.query('INSERT INTO annual_workplans SET ?', newWorkPlan);
        res.status(201).json({ ...newWorkPlan, workplanId: result.insertId });
    } catch (error) {
        console.error('Error creating work plan:', error);
        res.status(500).json({ message: 'Error creating work plan', error: error.message });
    }
});

// PUT an existing work plan
router.put('/:workplanId', async (req, res) => {
    const { workplanId } = req.params;
    const updatedFields = {
        ...req.body,
        updatedAt: formatToMySQLDateTime(new Date()),
        // CORRECTED: Ensure createdAt is in the right format for the update
        createdAt: req.body.createdAt ? formatToMySQLDateTime(req.body.createdAt) : undefined,
    };
    delete updatedFields.workplanId;
    delete updatedFields.voided;
    try {
        if (isPostgres) {
            const result = await pool.query(
                'UPDATE annual_workplans SET "workplanName" = ?, "financialYear" = ?, "workplanDescription" = ?, "totalBudget" = ?, "approvalStatus" = ?, "actualExpenditure" = ?, "performanceScore" = ?, challenges = ?, lessons = ?, recommendations = ?, remarks = ?, "updatedAt" = ? WHERE "workplanId" = ?',
                [
                    updatedFields.workplanName || null,
                    updatedFields.financialYear || null,
                    updatedFields.workplanDescription || null,
                    updatedFields.totalBudget || null,
                    updatedFields.approvalStatus || null,
                    updatedFields.actualExpenditure || null,
                    updatedFields.performanceScore || null,
                    updatedFields.challenges || null,
                    updatedFields.lessons || null,
                    updatedFields.recommendations || null,
                    updatedFields.remarks || null,
                    updatedFields.updatedAt,
                    workplanId
                ]
            );
            if (affectedRowsFromResult(result) > 0) {
                const getResult = await pool.query('SELECT * FROM annual_workplans WHERE "workplanId" = ?', [workplanId]);
                const rows = rowsFromResult(getResult);
                res.status(200).json(rows[0]);
            } else {
                res.status(404).json({ message: 'Work plan not found' });
            }
            return;
        }

        const [result] = await pool.query('UPDATE annual_workplans SET ? WHERE workplanId = ?', [updatedFields, workplanId]);
        if (result.affectedRows > 0) {
            const [rows] = await pool.query('SELECT * FROM annual_workplans WHERE workplanId = ?', [workplanId]);
            res.status(200).json(rows[0]);
        } else {
            res.status(404).json({ message: 'Work plan not found' });
        }
    } catch (error) {
        console.error('Error updating work plan:', error);
        res.status(500).json({ message: 'Error updating work plan', error: error.message });
    }
});

// DELETE a work plan (soft delete)
router.delete('/:workplanId', async (req, res) => {
    const { workplanId } = req.params;
    try {
        const result = await pool.query(
            `UPDATE annual_workplans SET voided = ${isPostgres ? 'true' : '1'} WHERE ${isPostgres ? '"workplanId"' : 'workplanId'} = ?`,
            [workplanId]
        );
        if (affectedRowsFromResult(result) > 0) {
            res.status(204).send();
        } else {
            res.status(404).json({ message: 'Work plan not found' });
        }
    } catch (error) {
        console.error('Error soft-deleting work plan:', error);
        res.status(500).json({ message: 'Error soft-deleting work plan', error: error.message });
    }
});

module.exports = router;