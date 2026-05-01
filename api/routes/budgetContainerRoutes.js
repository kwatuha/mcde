const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const pool = require('../config/db');
const auth = require('../middleware/authenticate');
const privilege = require('../middleware/privilegeMiddleware');
const multer = require('multer');
const xlsx = require('xlsx');
const DB_TYPE = process.env.DB_TYPE || 'mysql';
const isPostgres = DB_TYPE === 'postgresql';

let budgetTablesEnsured = false;
const rowsFromResult = (result) => (isPostgres ? (result?.rows || []) : (Array.isArray(result) ? (result[0] || []) : []));
const firstRow = (result) => rowsFromResult(result)[0] || null;

async function ensureBudgetTables() {
    if (budgetTablesEnsured) return;

    const runSafeDdl = async (sql) => {
        try {
            await pool.query(sql);
        } catch (err) {
            const code = String(err?.code || '');
            // Ignore create races/duplicate objects and continue.
            if (code === '42P07' || code === '42710' || code === '23505') return;
            throw err;
        }
    };

    if (isPostgres) {
        await runSafeDdl(`
            CREATE TABLE IF NOT EXISTS budgets (
                budgetId BIGSERIAL PRIMARY KEY,
                budgetName TEXT NOT NULL,
                budgetType TEXT NOT NULL DEFAULT 'Draft',
                isCombined INTEGER NOT NULL DEFAULT 0,
                parentBudgetId BIGINT NULL,
                finYearId BIGINT NOT NULL,
                departmentId BIGINT NULL,
                description TEXT NULL,
                totalAmount NUMERIC(18,2) NOT NULL DEFAULT 0,
                status TEXT NOT NULL DEFAULT 'Draft',
                isFrozen INTEGER NOT NULL DEFAULT 0,
                requiresApprovalForChanges INTEGER NOT NULL DEFAULT 1,
                approvedBy BIGINT NULL,
                approvedAt TIMESTAMP NULL,
                rejectedBy BIGINT NULL,
                rejectedAt TIMESTAMP NULL,
                rejectionReason TEXT NULL,
                userId BIGINT NULL,
                createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                voided BOOLEAN NOT NULL DEFAULT FALSE
            )
        `);

        await runSafeDdl(`
            CREATE TABLE IF NOT EXISTS budget_items (
                itemId BIGSERIAL PRIMARY KEY,
                budgetId BIGINT NOT NULL,
                projectId BIGINT NOT NULL,
                amount NUMERIC(18,2) NULL,
                remarks TEXT NULL,
                addedAfterApproval INTEGER NOT NULL DEFAULT 0,
                changeRequestId BIGINT NULL,
                userId BIGINT NULL,
                createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                voided BOOLEAN NOT NULL DEFAULT FALSE
            )
        `);
    } else {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS budgets (
                budgetId BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
                budgetName VARCHAR(255) NOT NULL,
                budgetType VARCHAR(100) NOT NULL DEFAULT 'Draft',
                isCombined TINYINT(1) NOT NULL DEFAULT 0,
                parentBudgetId BIGINT NULL,
                finYearId BIGINT NOT NULL,
                departmentId BIGINT NULL,
                description TEXT NULL,
                totalAmount DECIMAL(18,2) NOT NULL DEFAULT 0,
                status VARCHAR(100) NOT NULL DEFAULT 'Draft',
                isFrozen TINYINT(1) NOT NULL DEFAULT 0,
                requiresApprovalForChanges TINYINT(1) NOT NULL DEFAULT 1,
                approvedBy BIGINT NULL,
                approvedAt DATETIME NULL,
                rejectedBy BIGINT NULL,
                rejectedAt DATETIME NULL,
                rejectionReason TEXT NULL,
                userId BIGINT NULL,
                createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                voided TINYINT(1) NOT NULL DEFAULT 0
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS budget_items (
                itemId BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
                budgetId BIGINT NOT NULL,
                projectId BIGINT NOT NULL,
                amount DECIMAL(18,2) NULL,
                remarks TEXT NULL,
                addedAfterApproval TINYINT(1) NOT NULL DEFAULT 0,
                changeRequestId BIGINT NULL,
                userId BIGINT NULL,
                createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                voided TINYINT(1) NOT NULL DEFAULT 0
            )
        `);
    }

    budgetTablesEnsured = true;
}

/**
 * ============================================
 * BUDGET CONTAINERS ROUTES
 * ============================================
 */

/**
 * @route GET /api/budgets/containers
 * @description Get all budget containers with optional filters
 * @access Private
 */
router.get('/containers', async (req, res) => {
    try {
        await ensureBudgetTables();
        console.log('=== GET /api/budgets/containers called ===');
        console.log('Query params:', req.query);
        console.log('Request URL:', req.url);
        console.log('Request path:', req.path);
        const { 
            finYearId, 
            departmentId, 
            status,
            budgetType,
            page = 1,
            limit = 50,
            search
        } = req.query;

        let whereConditions = [isPostgres ? 'COALESCE(b.voided, false) = false' : 'b.voided = 0'];
        const queryParams = [];
        const offset = (page - 1) * limit;

        if (finYearId) {
            whereConditions.push(isPostgres ? 'b.finyearid = ?' : 'b.finYearId = ?');
            queryParams.push(finYearId);
        }

        if (departmentId) {
            whereConditions.push(isPostgres ? 'b.departmentid = ?' : 'b.departmentId = ?');
            queryParams.push(departmentId);
        }

        if (status) {
            whereConditions.push('b.status = ?');
            queryParams.push(status);
        }

        if (budgetType) {
            whereConditions.push(isPostgres ? 'b.budgettype = ?' : 'b.budgetType = ?');
            queryParams.push(budgetType);
        }

        if (search) {
            whereConditions.push(isPostgres ? '(b.budgetname ILIKE ? OR b.description ILIKE ?)' : '(b.budgetName LIKE ? OR b.description LIKE ?)');
            queryParams.push(`%${search}%`, `%${search}%`);
        }

        const whereClause = whereConditions.join(' AND ');

        // Get total count
        const countQuery = `
            SELECT COUNT(*) as total
            FROM budgets b
            WHERE ${whereClause}
        `;
        const countResult = await pool.query(countQuery, queryParams);
        const total = Number(firstRow(countResult)?.total || 0);

        // Get budgets with related data
        const query = isPostgres
            ? `
            SELECT
                b.budgetid AS "budgetId",
                b.budgetname AS "budgetName",
                b.budgettype AS "budgetType",
                b.iscombined AS "isCombined",
                b.parentbudgetid AS "parentBudgetId",
                b.finyearid AS "finYearId",
                b.departmentid AS "departmentId",
                b.description,
                b.totalamount AS "totalAmount",
                b.status,
                b.isfrozen AS "isFrozen",
                b.requiresapprovalforchanges AS "requiresApprovalForChanges",
                b.approvedby AS "approvedBy",
                b.approvedat AS "approvedAt",
                b.rejectedby AS "rejectedBy",
                b.rejectedat AS "rejectedAt",
                b.rejectionreason AS "rejectionReason",
                b.userid AS "userId",
                b.createdat AS "createdAt",
                b.updatedat AS "updatedAt",
                fy."finYearName" AS "finYearName",
                d.name AS "departmentName",
                0 AS "itemCount"
            FROM budgets b
            LEFT JOIN financialyears fy ON b.finyearid = fy."finYearId"
            LEFT JOIN departments d ON b.departmentid = d."departmentId"
            WHERE ${whereClause}
            ORDER BY b.createdat DESC
            LIMIT ? OFFSET ?
        `
            : `
            SELECT 
                b.budgetId,
                b.budgetName,
                b.budgetType,
                b.isCombined,
                b.parentBudgetId,
                b.finYearId,
                b.departmentId,
                b.description,
                b.totalAmount,
                b.status,
                b.isFrozen,
                b.requiresApprovalForChanges,
                b.approvedBy,
                b.approvedAt,
                b.rejectedBy,
                b.rejectedAt,
                b.rejectionReason,
                b.userId,
                b.createdAt,
                b.updatedAt,
                fy.finYearName,
                d.name as departmentName,
                u.firstName as createdByFirstName,
                u.lastName as createdByLastName,
                approver.firstName as approvedByFirstName,
                approver.lastName as approvedByLastName,
                (SELECT COUNT(*) FROM projects WHERE budgetId = b.budgetId AND voided = 0) as itemCount
            FROM budgets b
            LEFT JOIN financialyears fy ON b.finYearId = fy.finYearId
            LEFT JOIN departments d ON b.departmentId = d.departmentId
            LEFT JOIN users u ON b.userId = u.userId
            LEFT JOIN users approver ON b.approvedBy = approver.userId
            WHERE ${whereClause}
            ORDER BY b.createdAt DESC
            LIMIT ? OFFSET ?
        `;
        
        queryParams.push(parseInt(limit), offset);
        
        console.log('Executing query with params:', queryParams);
        console.log('Query:', query);
        const budgetsResult = await pool.query(query, queryParams);
        const budgets = rowsFromResult(budgetsResult);
        console.log('Query executed successfully');

        console.log('Found budgets:', budgets.length);
        console.log('Total count:', total);

        res.json({
            budgets,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                totalPages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error('Error fetching budget containers:', error);
        console.error('Error stack:', error.stack);
        res.status(500).json({ 
            message: 'Error fetching budget containers', 
            error: error.message,
            details: error.stack 
        });
    }
});

/**
 * @route GET /api/budgets/containers/:budgetId
 * @description Get a single budget container with all items
 * @access Private
 */
router.get('/containers/:budgetId', auth, async (req, res) => {
    try {
        const { budgetId } = req.params;

        // Get budget container
        const budgetQuery = `
            SELECT 
                b.*,
                fy.finYearName,
                d.name as departmentName,
                u.firstName as createdByFirstName,
                u.lastName as createdByLastName,
                approver.firstName as approvedByFirstName,
                approver.lastName as approvedByLastName
            FROM budgets b
            LEFT JOIN financialyears fy ON b.finYearId = fy.finYearId
            LEFT JOIN departments d ON b.departmentId = d.departmentId
            LEFT JOIN users u ON b.userId = u.userId
            LEFT JOIN users approver ON b.approvedBy = approver.userId
            WHERE b.budgetId = ? AND b.voided = 0
        `;

        const [budgets] = await pool.query(budgetQuery, [budgetId]);

        if (budgets.length === 0) {
            return res.status(404).json({ message: 'Budget container not found' });
        }

        const budget = budgets[0];

        // Get budget items directly from projects using budgetId
        // We no longer rely on budget_items for viewing - only projects with this budgetId
        const itemsQuery = `
            SELECT 
                p.id as projectId,
                p.projectName,
                p.costOfProject as amount,
                p.status as projectStatus,
                p.departmentId,
                p.finYearId,
                p.budgetId,
                p.createdAt,
                p.updatedAt,
                d.name as departmentName,
                sc.name as subcountyName,
                w.name as wardName,
                u.firstName as createdByFirstName,
                u.lastName as createdByLastName,
                bi.itemId,
                bi.remarks,
                bi.addedAfterApproval,
                bi.changeRequestId
            FROM projects p
            LEFT JOIN departments d ON p.departmentId = d.departmentId
            LEFT JOIN project_subcounties psc ON p.id = psc.projectId
            LEFT JOIN subcounties sc ON psc.subcountyId = sc.subcountyId
            LEFT JOIN project_wards pw ON p.id = pw.projectId
            LEFT JOIN wards w ON pw.wardId = w.wardId
            LEFT JOIN users u ON p.userId = u.userId
            LEFT JOIN budget_items bi ON p.id = bi.projectId AND bi.budgetId = ? AND bi.voided = 0
            WHERE p.budgetId = ? AND p.voided = 0
            ORDER BY p.createdAt DESC
        `;

        const [items] = await pool.query(itemsQuery, [budgetId, budgetId]);

        // Get pending change requests
        const changesQuery = `
            SELECT 
                bc.*,
                u.firstName as requestedByFirstName,
                u.lastName as requestedByLastName,
                reviewer.firstName as reviewedByFirstName,
                reviewer.lastName as reviewedByLastName
            FROM budget_changes bc
            LEFT JOIN users u ON bc.requestedBy = u.userId
            LEFT JOIN users reviewer ON bc.reviewedBy = reviewer.userId
            WHERE bc.budgetId = ? AND bc.voided = 0 AND bc.status = 'Pending Approval'
            ORDER BY bc.requestedAt DESC
        `;

        const [changes] = await pool.query(changesQuery, [budgetId]);

        res.json({
            ...budget,
            items,
            pendingChanges: changes
        });
    } catch (error) {
        console.error('Error fetching budget container:', error);
        res.status(500).json({ message: 'Error fetching budget container', error: error.message });
    }
});

/**
 * @route POST /api/budgets/containers
 * @description Create a new budget container
 * @access Private
 */
router.post('/containers', auth, async (req, res) => {
    try {
        await ensureBudgetTables();
        const {
            budgetName,
            budgetType = 'Draft',
            finYearId,
            departmentId,
            description,
            requiresApprovalForChanges = true
        } = req.body;

        // Validation
        if (!budgetName || !finYearId) {
            return res.status(400).json({ 
                message: 'Missing required fields: budgetName and finYearId are required' 
            });
        }

        const userId = req.user?.userId || 1;

        const query = `
            INSERT INTO budgets 
            (budgetName, budgetType, finYearId, departmentId, description, requiresApprovalForChanges, userId)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ${isPostgres ? 'RETURNING budgetId' : ''}
        `;

        const result = await pool.query(query, [
            budgetName,
            budgetType,
            finYearId,
            departmentId || null,
            description || null,
            requiresApprovalForChanges ? 1 : 0,
            userId
        ]);

        // Fetch the created budget
        const insertId = isPostgres
            ? firstRow(result)?.budgetid || firstRow(result)?.budgetId
            : result?.[0]?.insertId;
        const createdBudgetResult = await pool.query('SELECT * FROM budgets WHERE budgetId = ?', [insertId]);
        const createdBudget = firstRow(createdBudgetResult);

        res.status(201).json({
            message: 'Budget container created successfully',
            budget: createdBudget
        });
    } catch (error) {
        console.error('Error creating budget container:', error);
        console.error('Error details:', {
            code: error.code,
            sqlMessage: error.sqlMessage,
            sqlState: error.sqlState,
            stack: error.stack
        });
        res.status(500).json({ 
            message: 'Error creating budget container', 
            error: error.message,
            details: error.sqlMessage || error.code || 'Unknown database error',
            hint: error.code === 'ER_NO_SUCH_TABLE' ? 'The budgets table does not exist. Please create it first.' : null
        });
    }
});

/**
 * @route PUT /api/budgets/containers/:budgetId
 * @description Update a budget container
 * @access Private
 */
router.put('/containers/:budgetId', auth, privilege(['budget.update']), async (req, res) => {
    try {
        const { budgetId } = req.params;
        const {
            budgetName,
            budgetType,
            finYearId,
            departmentId,
            description,
            requiresApprovalForChanges
        } = req.body;

        // Check if budget exists
        const [existing] = await pool.query(
            'SELECT * FROM budgets WHERE budgetId = ? AND voided = 0',
            [budgetId]
        );

        if (existing.length === 0) {
            return res.status(404).json({ message: 'Budget container not found' });
        }

        const budget = existing[0];

        // If budget is approved and frozen, check if changes require approval
        if (budget.status === 'Approved' && budget.isFrozen && budget.requiresApprovalForChanges) {
            return res.status(400).json({ 
                message: 'This budget is approved and frozen. Changes must be requested through the change request process.' 
            });
        }

        // Build update query dynamically
        const updates = [];
        const values = [];

        if (budgetName !== undefined) {
            updates.push('budgetName = ?');
            values.push(budgetName);
        }
        if (budgetType !== undefined) {
            updates.push('budgetType = ?');
            values.push(budgetType);
        }
        if (finYearId !== undefined) {
            updates.push('finYearId = ?');
            values.push(finYearId);
        }
        if (departmentId !== undefined) {
            updates.push('departmentId = ?');
            values.push(departmentId || null);
        }
        if (description !== undefined) {
            updates.push('description = ?');
            values.push(description || null);
        }
        if (requiresApprovalForChanges !== undefined) {
            updates.push('requiresApprovalForChanges = ?');
            values.push(requiresApprovalForChanges ? 1 : 0);
        }

        if (updates.length === 0) {
            return res.status(400).json({ message: 'No fields to update' });
        }

        values.push(budgetId);

        const query = `
            UPDATE budgets 
            SET ${updates.join(', ')}, updatedAt = CURRENT_TIMESTAMP
            WHERE budgetId = ? AND voided = 0
        `;

        await pool.query(query, values);

        // Fetch updated budget
        const [updated] = await pool.query(
            'SELECT * FROM budgets WHERE budgetId = ?',
            [budgetId]
        );

        res.json({
            message: 'Budget container updated successfully',
            budget: updated[0]
        });
    } catch (error) {
        console.error('Error updating budget container:', error);
        res.status(500).json({ message: 'Error updating budget container', error: error.message });
    }
});

/**
 * @route POST /api/budgets/containers/:budgetId/approve
 * @description Approve a budget container
 * @access Private
 */
router.post('/containers/:budgetId/approve', auth, privilege(['budget.approve']), async (req, res) => {
    try {
        const { budgetId } = req.params;
        const userId = req.user?.userId || 1;

        const [budget] = await pool.query(
            'SELECT * FROM budgets WHERE budgetId = ? AND voided = 0',
            [budgetId]
        );

        if (budget.length === 0) {
            return res.status(404).json({ message: 'Budget container not found' });
        }

        if (budget[0].status === 'Approved') {
            return res.status(400).json({ message: 'Budget is already approved' });
        }

        await pool.query(
            `UPDATE budgets 
             SET status = 'Approved', 
                 approvedBy = ?, 
                 approvedAt = NOW(),
                 isFrozen = 1,
                 updatedAt = CURRENT_TIMESTAMP
             WHERE budgetId = ?`,
            [userId, budgetId]
        );

        // Log approval as a change
        await pool.query(
            `INSERT INTO budget_changes 
             (budgetId, changeType, changeReason, status, requestedBy, reviewedBy, reviewedAt, userId)
             VALUES (?, 'Budget Approved', 'Budget approved by authorized user', 'Approved', ?, ?, NOW(), ?)`,
            [budgetId, userId, userId, userId]
        );

        res.json({ message: 'Budget approved successfully' });
    } catch (error) {
        console.error('Error approving budget:', error);
        console.error('Error details:', {
            code: error.code,
            sqlMessage: error.sqlMessage,
            sqlState: error.sqlState,
            stack: error.stack
        });
        res.status(500).json({ 
            message: 'Error approving budget', 
            error: error.message,
            details: error.sqlMessage || error.code || 'Unknown database error'
        });
    }
});

/**
 * @route POST /api/budgets/containers/:budgetId/reject
 * @description Reject a budget container
 * @access Private
 */
router.post('/containers/:budgetId/reject', auth, privilege(['budget.approve']), async (req, res) => {
    try {
        const { budgetId } = req.params;
        const { rejectionReason } = req.body;
        const userId = req.user?.userId || 1;

        if (!rejectionReason) {
            return res.status(400).json({ message: 'Rejection reason is required' });
        }

        const [budget] = await pool.query(
            'SELECT * FROM budgets WHERE budgetId = ? AND voided = 0',
            [budgetId]
        );

        if (budget.length === 0) {
            return res.status(404).json({ message: 'Budget container not found' });
        }

        await pool.query(
            `UPDATE budgets 
             SET status = 'Rejected', 
                 rejectedBy = ?, 
                 rejectedAt = NOW(),
                 rejectionReason = ?,
                 updatedAt = CURRENT_TIMESTAMP
             WHERE budgetId = ?`,
            [userId, rejectionReason, budgetId]
        );

        res.json({ message: 'Budget rejected successfully' });
    } catch (error) {
        console.error('Error rejecting budget:', error);
        res.status(500).json({ message: 'Error rejecting budget', error: error.message });
    }
});

/**
 * ============================================
 * BUDGET ITEMS ROUTES
 * ============================================
 */

/**
 * @route GET /api/budgets/containers/:budgetId/items
 * @description Get all items in a budget container
 * @access Private
 */
router.get('/containers/:budgetId/items', auth, async (req, res) => {
    try {
        const { budgetId } = req.params;

        // Query projects directly using budgetId, with optional budget_items metadata
        const query = `
            SELECT 
                p.id as projectId,
                p.projectName,
                p.costOfProject as amount,
                p.status,
                p.departmentId,
                p.budgetId,
                p.createdAt,
                p.updatedAt,
                d.name as departmentName,
                sc.name as subcountyName,
                w.name as wardName,
                bi.itemId,
                bi.remarks,
                bi.addedAfterApproval,
                bi.changeRequestId,
                bi.userId,
                u.firstName as createdByFirstName,
                u.lastName as createdByLastName
            FROM projects p
            LEFT JOIN departments d ON p.departmentId = d.departmentId
            LEFT JOIN project_subcounties psc ON p.id = psc.projectId
            LEFT JOIN subcounties sc ON psc.subcountyId = sc.subcountyId
            LEFT JOIN project_wards pw ON p.id = pw.projectId
            LEFT JOIN wards w ON pw.wardId = w.wardId
            LEFT JOIN budget_items bi ON p.id = bi.projectId AND bi.budgetId = ? AND bi.voided = 0
            LEFT JOIN users u ON COALESCE(bi.userId, p.userId) = u.userId
            WHERE p.budgetId = ? AND p.voided = 0
            ORDER BY p.createdAt DESC
        `;

        const [items] = await pool.query(query, [budgetId, budgetId]);

        res.json({ items });
    } catch (error) {
        console.error('Error fetching budget items:', error);
        res.status(500).json({ message: 'Error fetching budget items', error: error.message });
    }
});

/**
 * @route POST /api/budgets/containers/:budgetId/items
 * @description Add an item to a budget container
 * @access Private
 */
router.post('/containers/:budgetId/items', auth, privilege(['budget.update']), async (req, res) => {
    try {
        const { budgetId } = req.params;
        const {
            projectId,
            projectName,
            departmentId,
            subcountyId,
            wardId,
            amount,
            remarks,
            changeReason
        } = req.body;

        // Validation
        // Note: amount is now stored in projects.costOfProject, not in budget_items
        if (!projectName || !departmentId || !amount || amount <= 0) {
            return res.status(400).json({ 
                message: 'Missing required fields: projectName, departmentId, and amount (must be > 0) are required' 
            });
        }

        // Check if budget exists
        const [budget] = await pool.query(
            'SELECT * FROM budgets WHERE budgetId = ? AND voided = 0',
            [budgetId]
        );

        if (budget.length === 0) {
            return res.status(404).json({ message: 'Budget container not found' });
        }

        const budgetData = budget[0];
        const userId = req.user?.userId || 1;

        // Get or create project - amount goes into costOfProject
        let finalProjectId = projectId;
        if (!finalProjectId) {
            // Check if project exists by name
            const [existingProjects] = await pool.query(
                'SELECT id FROM projects WHERE voided = 0 AND projectName = ? LIMIT 1',
                [projectName]
            );

            if (existingProjects.length > 0) {
                finalProjectId = existingProjects[0].id;
                // Update costOfProject if the new amount is higher, always set status to 'Under Procurement' for budget imports, and update budgetId to current budget
                await pool.query(
                    'UPDATE projects SET costOfProject = GREATEST(COALESCE(costOfProject, 0), ?), status = ?, budgetId = ? WHERE id = ?',
                    [amount, 'Under Procurement', budgetId, finalProjectId]
                );
            } else {
                // Create new project with amount in costOfProject
                const [projectResult] = await pool.query(
                    'INSERT INTO projects (projectName, departmentId, finYearId, costOfProject, status, budgetId, userId) VALUES (?, ?, ?, ?, ?, ?, ?)',
                    [projectName, departmentId, budgetData.finYearId, amount, 'Under Procurement', budgetId, userId]
                );
                finalProjectId = projectResult.insertId;
            }
        } else {
            // Update existing project's costOfProject if amount is provided, always set status to 'Under Procurement' for budget imports, and update budgetId to current budget
            await pool.query(
                'UPDATE projects SET costOfProject = GREATEST(COALESCE(costOfProject, 0), ?), status = ?, budgetId = ? WHERE id = ?',
                [amount, 'Under Procurement', budgetId, finalProjectId]
            );
        }

        // Link project to locations via junction tables
        if (wardId) {
            const [existingWardLink] = await pool.query(
                'SELECT * FROM project_wards WHERE projectId = ? AND wardId = ?',
                [finalProjectId, wardId]
            );
            if (existingWardLink.length === 0) {
                await pool.query(
                    'INSERT INTO project_wards (projectId, wardId) VALUES (?, ?)',
                    [finalProjectId, wardId]
                );
            }
        }

        if (subcountyId) {
            const [existingSubcountyLink] = await pool.query(
                'SELECT * FROM project_subcounties WHERE projectId = ? AND subcountyId = ?',
                [finalProjectId, subcountyId]
            );
            if (existingSubcountyLink.length === 0) {
                await pool.query(
                    'INSERT INTO project_subcounties (projectId, subcountyId) VALUES (?, ?)',
                    [finalProjectId, subcountyId]
                );
            }
        }

        // Check if budget is approved and frozen - requires change request
        if (budgetData.status === 'Approved' && budgetData.isFrozen && budgetData.requiresApprovalForChanges) {
            if (!changeReason) {
                return res.status(400).json({ 
                    message: 'Change reason is required when adding items to an approved and frozen budget' 
                });
            }

            // Create change request instead of directly adding
            const changeQuery = `
                INSERT INTO budget_changes 
                (budgetId, changeType, changeReason, status, requestedBy, newValue)
                VALUES (?, 'Item Added', ?, 'Pending Approval', ?, ?)
            `;

            // Note: projectName, departmentId, subcountyId, wardId, amount are removed - get these from the project instead
            const newValue = JSON.stringify({
                projectId: finalProjectId || null,
                remarks: remarks || null
            });

            const [changeResult] = await pool.query(changeQuery, [
                budgetId,
                changeReason,
                userId,
                newValue
            ]);

            return res.status(202).json({
                message: 'Item addition request created and pending approval',
                changeRequestId: changeResult.insertId
            });
        }

        // Directly add item if budget is not approved/frozen
        // Note: projectName, departmentId, subcountyId, wardId, amount are removed - get these from the project instead
        // Amount is stored in projects.costOfProject
        const itemQuery = `
            INSERT INTO budget_items 
            (budgetId, projectId, remarks, userId)
            VALUES (?, ?, ?, ?)
        `;

        const [result] = await pool.query(itemQuery, [
            budgetId,
            finalProjectId,
            remarks || null,
            userId
        ]);

        // Check if added after approval
        const addedAfterApproval = budgetData.status === 'Approved' ? 1 : 0;

        if (addedAfterApproval) {
            await pool.query(
                'UPDATE budget_items SET addedAfterApproval = 1 WHERE itemId = ?',
                [result.insertId]
            );
        }

        res.status(201).json({
            message: 'Budget item added successfully',
            itemId: result.insertId
        });
    } catch (error) {
        console.error('Error adding budget item:', error);
        res.status(500).json({ message: 'Error adding budget item', error: error.message });
    }
});

/**
 * @route PUT /api/budgets/items/:itemId
 * @description Update a budget item
 * @access Private
 */
router.put('/items/:itemId', auth, privilege(['budget.update']), async (req, res) => {
    try {
        const { itemId } = req.params;
        const {
            projectId,
            projectName,
            departmentId,
            subcountyId,
            wardId,
            amount,
            remarks,
            changeReason
        } = req.body;

        // Get item and budget info
        const [items] = await pool.query(
            `SELECT 
                bi.itemId,
                bi.budgetId,
                bi.projectId,
                bi.remarks,
                bi.addedAfterApproval,
                bi.changeRequestId,
                bi.userId,
                bi.voided,
                bi.voidedBy,
                bi.voidedAt,
                bi.createdAt,
                bi.updatedAt,
                p.projectName,
                p.costOfProject as amount,
                p.status as projectStatus,
                b.status as budgetStatus,
                b.isFrozen,
                b.requiresApprovalForChanges 
             FROM budget_items bi
             INNER JOIN budgets b ON bi.budgetId = b.budgetId
             LEFT JOIN projects p ON bi.projectId = p.id
             WHERE bi.itemId = ? AND bi.voided = 0`,
            [itemId]
        );

        if (items.length === 0) {
            return res.status(404).json({ message: 'Budget item not found' });
        }

        const item = items[0];
        const budget = {
            status: items[0].budgetStatus,
            isFrozen: items[0].isFrozen,
            requiresApprovalForChanges: items[0].requiresApprovalForChanges
        };

        const userId = req.user?.userId || 1;

        // Check if budget is approved and frozen - requires change request
        if (budget.status === 'Approved' && budget.isFrozen && budget.requiresApprovalForChanges) {
            if (!changeReason) {
                return res.status(400).json({ 
                    message: 'Change reason is required when modifying items in an approved and frozen budget' 
                });
            }

            // Create change request
            // Note: projectName, departmentId, subcountyId, wardId, amount are removed - get these from the project instead
            const oldValue = JSON.stringify({
                projectId: item.projectId || null,
                remarks: item.remarks || null
            });

            const newValue = JSON.stringify({
                projectId: projectId !== undefined ? (projectId || null) : item.projectId || null,
                remarks: remarks !== undefined ? (remarks || null) : item.remarks || null
            });

            const changeQuery = `
                INSERT INTO budget_changes 
                (budgetId, itemId, changeType, changeReason, status, requestedBy, oldValue, newValue)
                VALUES (?, ?, 'Item Modified', ?, 'Pending Approval', ?, ?, ?)
            `;

            const [changeResult] = await pool.query(changeQuery, [
                item.budgetId,
                itemId,
                changeReason,
                userId,
                oldValue,
                newValue
            ]);

            return res.status(202).json({
                message: 'Item modification request created and pending approval',
                changeRequestId: changeResult.insertId
            });
        }

        // Directly update if budget is not approved/frozen
        // Note: projectName, departmentId, subcountyId, wardId, amount are removed - update these on the project instead
        const updates = [];
        const values = [];

        if (projectId !== undefined) {
            updates.push('projectId = ?');
            values.push(projectId || null);
        }
        if (remarks !== undefined) {
            updates.push('remarks = ?');
            values.push(remarks || null);
        }
        
        // If amount is provided, update the project's costOfProject, always set status to 'Under Procurement' for budget imports, and update budgetId
        const finalProjectIdForUpdate = projectId !== undefined ? projectId : item.projectId;
        if (amount !== undefined && amount > 0 && finalProjectIdForUpdate) {
            await pool.query(
                'UPDATE projects SET costOfProject = GREATEST(COALESCE(costOfProject, 0), ?), status = ?, budgetId = ? WHERE id = ?',
                [amount, 'Under Procurement', item.budgetId, finalProjectIdForUpdate]
            );
        }

        if (updates.length === 0) {
            return res.status(400).json({ message: 'No fields to update' });
        }

        values.push(itemId);

        const query = `
            UPDATE budget_items 
            SET ${updates.join(', ')}, updatedAt = CURRENT_TIMESTAMP
            WHERE itemId = ? AND voided = 0
        `;

        await pool.query(query, values);

        res.json({ message: 'Budget item updated successfully' });
    } catch (error) {
        console.error('Error updating budget item:', error);
        res.status(500).json({ message: 'Error updating budget item', error: error.message });
    }
});

/**
 * @route DELETE /api/budgets/items/:itemId
 * @description Remove a budget item
 * @access Private
 */
router.delete('/items/:itemId', auth, privilege(['budget.update']), async (req, res) => {
    try {
        const { itemId } = req.params;
        const { changeReason } = req.body;
        const userId = req.user?.userId || 1;

        // Get item and budget info
        const [items] = await pool.query(
            `SELECT 
                bi.itemId,
                bi.budgetId,
                bi.projectId,
                bi.remarks,
                bi.addedAfterApproval,
                bi.changeRequestId,
                bi.userId,
                bi.voided,
                bi.voidedBy,
                bi.voidedAt,
                bi.createdAt,
                bi.updatedAt,
                p.projectName,
                p.costOfProject as amount,
                p.status as projectStatus,
                b.status as budgetStatus,
                b.isFrozen,
                b.requiresApprovalForChanges 
             FROM budget_items bi
             INNER JOIN budgets b ON bi.budgetId = b.budgetId
             LEFT JOIN projects p ON bi.projectId = p.id
             WHERE bi.itemId = ? AND bi.voided = 0`,
            [itemId]
        );

        if (items.length === 0) {
            return res.status(404).json({ message: 'Budget item not found' });
        }

        const item = items[0];
        const budget = {
            status: items[0].budgetStatus,
            isFrozen: items[0].isFrozen,
            requiresApprovalForChanges: items[0].requiresApprovalForChanges
        };

        // Check if budget is approved and frozen - requires change request
        if (budget.status === 'Approved' && budget.isFrozen && budget.requiresApprovalForChanges) {
            if (!changeReason) {
                return res.status(400).json({ 
                    message: 'Change reason is required when removing items from an approved and frozen budget' 
                });
            }

            // Create change request
            // Note: projectName, departmentId, amount are removed - get these from the project instead
            const oldValue = JSON.stringify({
                projectId: item.projectId || null
            });

            const changeQuery = `
                INSERT INTO budget_changes 
                (budgetId, itemId, changeType, changeReason, status, requestedBy, oldValue)
                VALUES (?, ?, 'Item Removed', ?, 'Pending Approval', ?, ?)
            `;

            const [changeResult] = await pool.query(changeQuery, [
                item.budgetId,
                itemId,
                changeReason,
                userId,
                oldValue
            ]);

            return res.status(202).json({
                message: 'Item removal request created and pending approval',
                changeRequestId: changeResult.insertId
            });
        }

        // Soft delete item
        await pool.query(
            'UPDATE budget_items SET voided = 1, voidedBy = ?, voidedAt = NOW() WHERE itemId = ?',
            [userId, itemId]
        );

        res.json({ message: 'Budget item removed successfully' });
    } catch (error) {
        console.error('Error removing budget item:', error);
        res.status(500).json({ message: 'Error removing budget item', error: error.message });
    }
});

/**
 * ============================================
 * CHANGE REQUESTS ROUTES
 * ============================================
 */

/**
 * @route GET /api/budgets/containers/:budgetId/changes
 * @description Get change history for a budget
 * @access Private
 */
router.get('/containers/:budgetId/changes', auth, async (req, res) => {
    try {
        const { budgetId } = req.params;
        const { status } = req.query;

        let whereClause = 'bc.budgetId = ? AND bc.voided = 0';
        const params = [budgetId];

        if (status) {
            whereClause += ' AND bc.status = ?';
            params.push(status);
        }

        const query = `
            SELECT 
                bc.*,
                u.firstName as requestedByFirstName,
                u.lastName as requestedByLastName,
                reviewer.firstName as reviewedByFirstName,
                reviewer.lastName as reviewedByLastName,
                p.projectName as itemProjectName
            FROM budget_changes bc
            LEFT JOIN users u ON bc.requestedBy = u.userId
            LEFT JOIN users reviewer ON bc.reviewedBy = reviewer.userId
            LEFT JOIN budget_items bi ON bc.itemId = bi.itemId
            LEFT JOIN projects p ON bi.projectId = p.id
            WHERE ${whereClause}
            ORDER BY bc.requestedAt DESC
        `;

        const [changes] = await pool.query(query, params);

        res.json({ changes });
    } catch (error) {
        console.error('Error fetching budget changes:', error);
        res.status(500).json({ message: 'Error fetching budget changes', error: error.message });
    }
});

/**
 * @route PUT /api/budgets/changes/:changeId/approve
 * @description Approve a change request
 * @access Private
 */
router.put('/changes/:changeId/approve', auth, privilege(['budget.approve']), async (req, res) => {
    try {
        const { changeId } = req.params;
        const { reviewNotes } = req.body;
        const userId = req.user?.userId || 1;

        // Get change request
        const [changes] = await pool.query(
            'SELECT * FROM budget_changes WHERE changeId = ? AND voided = 0',
            [changeId]
        );

        if (changes.length === 0) {
            return res.status(404).json({ message: 'Change request not found' });
        }

        const change = changes[0];

        if (change.status !== 'Pending Approval') {
            return res.status(400).json({ message: 'Change request is not pending approval' });
        }

        // Apply the change based on change type
        if (change.changeType === 'Item Added') {
            const newValue = JSON.parse(change.newValue);
            // Note: projectName, departmentId, subcountyId, wardId, amount are removed - get these from the project instead
            await pool.query(
                `INSERT INTO budget_items 
                 (budgetId, projectId, remarks, addedAfterApproval, changeRequestId, userId)
                 VALUES (?, ?, ?, 1, ?, ?)`,
                [
                    change.budgetId,
                    newValue.projectId || null,
                    newValue.remarks || null,
                    changeId,
                    change.requestedBy
                ]
            );
        } else if (change.changeType === 'Item Modified') {
            const newValue = JSON.parse(change.newValue);
            // Note: projectName, departmentId, subcountyId, wardId, amount are removed - get these from the project instead
            await pool.query(
                `UPDATE budget_items 
                 SET projectId = ?, remarks = ?, changeRequestId = ?
                 WHERE itemId = ?`,
                [
                    newValue.projectId || null,
                    newValue.remarks || null,
                    changeId,
                    change.itemId
                ]
            );
        } else if (change.changeType === 'Item Removed') {
            await pool.query(
                'UPDATE budget_items SET voided = 1, voidedBy = ?, voidedAt = NOW(), changeRequestId = ? WHERE itemId = ?',
                [userId, changeId, change.itemId]
            );
        }

        // Update change request status
        await pool.query(
            `UPDATE budget_changes 
             SET status = 'Approved', reviewedBy = ?, reviewedAt = NOW(), reviewNotes = ?
             WHERE changeId = ?`,
            [userId, reviewNotes || null, changeId]
        );

        res.json({ message: 'Change request approved and applied successfully' });
    } catch (error) {
        console.error('Error approving change request:', error);
        res.status(500).json({ message: 'Error approving change request', error: error.message });
    }
});

/**
 * @route PUT /api/budgets/changes/:changeId/reject
 * @description Reject a change request
 * @access Private
 */
router.put('/changes/:changeId/reject', auth, privilege(['budget.approve']), async (req, res) => {
    try {
        const { changeId } = req.params;
        const { reviewNotes } = req.body;
        const userId = req.user?.userId || 1;

        if (!reviewNotes) {
            return res.status(400).json({ message: 'Review notes are required when rejecting a change request' });
        }

        const [changes] = await pool.query(
            'SELECT * FROM budget_changes WHERE changeId = ? AND voided = 0',
            [changeId]
        );

        if (changes.length === 0) {
            return res.status(404).json({ message: 'Change request not found' });
        }

        if (changes[0].status !== 'Pending Approval') {
            return res.status(400).json({ message: 'Change request is not pending approval' });
        }

        await pool.query(
            `UPDATE budget_changes 
             SET status = 'Rejected', reviewedBy = ?, reviewedAt = NOW(), reviewNotes = ?
             WHERE changeId = ?`,
            [userId, reviewNotes, changeId]
        );

        res.json({ message: 'Change request rejected successfully' });
    } catch (error) {
        console.error('Error rejecting change request:', error);
        res.status(500).json({ message: 'Error rejecting change request', error: error.message });
    }
});

/**
 * ============================================
 * COMBINED BUDGETS ROUTES
 * ============================================
 */

/**
 * @route POST /api/budgets/containers/combined
 * @description Create a new combined budget container
 * @access Private
 */
router.post('/containers/combined', auth, privilege(['budget.create']), async (req, res) => {
    try {
        const {
            budgetName,
            finYearId,
            description,
            containerIds = [] // Array of budget IDs to combine
        } = req.body;

        // Validation
        if (!budgetName || !finYearId) {
            return res.status(400).json({ 
                message: 'Missing required fields: budgetName and finYearId are required' 
            });
        }

        if (!Array.isArray(containerIds) || containerIds.length === 0) {
            return res.status(400).json({ 
                message: 'At least one container must be selected to create a combined budget' 
            });
        }

        const userId = req.user?.userId || 1;

        // Verify all containers exist and are not already part of another combined budget
        const placeholders = containerIds.map(() => '?').join(',');
        const [containers] = await pool.query(
            `SELECT budgetId, budgetName, departmentId, status, isCombined, parentBudgetId 
             FROM budgets 
             WHERE budgetId IN (${placeholders}) AND voided = 0`,
            containerIds
        );

        if (containers.length !== containerIds.length) {
            return res.status(400).json({ 
                message: 'One or more selected containers do not exist or have been deleted' 
            });
        }

        // Check if any container is already part of a combined budget
        const alreadyCombined = containers.filter(c => c.isCombined === 1 || c.parentBudgetId);
        if (alreadyCombined.length > 0) {
            return res.status(400).json({ 
                message: `The following containers are already part of a combined budget: ${alreadyCombined.map(c => c.budgetName).join(', ')}` 
            });
        }

        // Create the combined budget container
        const query = `
            INSERT INTO budgets 
            (budgetName, budgetType, isCombined, finYearId, description, userId)
            VALUES (?, 'Combined', 1, ?, ?, ?)
        `;

        const [result] = await pool.query(query, [
            budgetName,
            finYearId,
            description || null,
            userId
        ]);

        const combinedBudgetId = result.insertId;

        // Link containers to the combined budget
        const combinationQueries = containerIds.map((containerId, index) => {
            return pool.query(
                `INSERT INTO budget_combinations 
                 (combinedBudgetId, containerBudgetId, displayOrder, userId)
                 VALUES (?, ?, ?, ?)`,
                [combinedBudgetId, containerId, index, userId]
            );
        });

        await Promise.all(combinationQueries);

        // Calculate total amount from all containers
        const [totalResult] = await pool.query(
            `SELECT COALESCE(SUM(totalAmount), 0) as total
             FROM budgets
             WHERE budgetId IN (${placeholders}) AND voided = 0`,
            containerIds
        );

        const totalAmount = totalResult[0].total || 0;

        // Update the combined budget's total amount
        await pool.query(
            'UPDATE budgets SET totalAmount = ? WHERE budgetId = ?',
            [totalAmount, combinedBudgetId]
        );

        // Fetch the created combined budget
        const [createdBudget] = await pool.query(
            `SELECT b.*, fy.finYearName, d.name as departmentName
             FROM budgets b
             LEFT JOIN financialyears fy ON b.finYearId = fy.finYearId
             LEFT JOIN departments d ON b.departmentId = d.departmentId
             WHERE b.budgetId = ?`,
            [combinedBudgetId]
        );

        res.status(201).json({
            message: 'Combined budget created successfully',
            budget: createdBudget[0],
            totalAmount,
            containerCount: containerIds.length
        });
    } catch (error) {
        console.error('Error creating combined budget:', error);
        res.status(500).json({ 
            message: 'Error creating combined budget', 
            error: error.message,
            details: error.sqlMessage || error.code
        });
    }
});

/**
 * @route GET /api/budgets/containers/:budgetId/combined
 * @description Get a combined budget with all its containers and subtotals
 * @access Private
 */
router.get('/containers/:budgetId/combined', auth, async (req, res) => {
    try {
        const { budgetId } = req.params;

        // Get the combined budget
        const [combinedBudget] = await pool.query(
            `SELECT b.*, fy.finYearName, d.name as departmentName
             FROM budgets b
             LEFT JOIN financialyears fy ON b.finYearId = fy.finYearId
             LEFT JOIN departments d ON b.departmentId = d.departmentId
             WHERE b.budgetId = ? AND b.voided = 0`,
            [budgetId]
        );

        if (combinedBudget.length === 0) {
            return res.status(404).json({ message: 'Combined budget not found' });
        }

        if (combinedBudget[0].isCombined !== 1) {
            return res.status(400).json({ message: 'This is not a combined budget' });
        }

        // Get all containers in this combined budget
        const [containers] = await pool.query(
            `SELECT 
                b.budgetId,
                b.budgetName,
                b.totalAmount,
                b.status,
                b.isFrozen,
                b.description,
                d.name as departmentName,
                d.departmentId,
                bc.displayOrder,
                (SELECT COUNT(*) FROM projects WHERE budgetId = b.budgetId AND voided = 0) as itemCount
             FROM budget_combinations bc
             INNER JOIN budgets b ON bc.containerBudgetId = b.budgetId
             LEFT JOIN departments d ON b.departmentId = d.departmentId
             WHERE bc.combinedBudgetId = ? AND b.voided = 0
             ORDER BY bc.displayOrder ASC, b.budgetName ASC`,
            [budgetId]
        );

        // Get all items from all containers, grouped by container
        const containerItems = [];
        console.log(`Found ${containers.length} containers in combined budget ${budgetId}`);
        
        for (const container of containers) {
            console.log(`Fetching items for container ${container.budgetId} (${container.budgetName})`);
            
            // Query projects directly using budgetId (primary source), with optional budget_items metadata
            const [itemCountCheck] = await pool.query(
                `SELECT COUNT(*) as count FROM projects WHERE budgetId = ? AND voided = 0`,
                [container.budgetId]
            );
            console.log(`Container ${container.budgetId} has ${itemCountCheck[0].count} projects in database`);
            
            const [items] = await pool.query(
                `SELECT 
                    p.id as projectId,
                    p.projectName,
                    p.costOfProject as amount,
                    p.status,
                    p.departmentId,
                    p.budgetId,
                    p.createdAt,
                    p.updatedAt,
                    d.name as departmentName,
                    sc.name as subcountyName,
                    w.name as wardName,
                    bi.itemId,
                    bi.remarks,
                    bi.addedAfterApproval,
                    bi.changeRequestId,
                    bi.userId
                 FROM projects p
                 LEFT JOIN departments d ON p.departmentId = d.departmentId
                 LEFT JOIN project_subcounties psc ON p.id = psc.projectId
                 LEFT JOIN subcounties sc ON psc.subcountyId = sc.subcountyId
                 LEFT JOIN project_wards pw ON p.id = pw.projectId
                 LEFT JOIN wards w ON pw.wardId = w.wardId
                 LEFT JOIN budget_items bi ON p.id = bi.projectId AND bi.budgetId = ? AND bi.voided = 0
                 WHERE p.budgetId = ? AND p.voided = 0
                 ORDER BY p.createdAt DESC`,
                [container.budgetId, container.budgetId]
            );

            console.log(`Container ${container.budgetId} query returned ${items.length} items after joins`);
            if (items.length > 0) {
                console.log(`First item sample:`, JSON.stringify(items[0], null, 2));
            }
            if (items.length > 0) {
                console.log(`Sample item from container ${container.budgetId}:`, JSON.stringify(items[0], null, 2));
            }
            
            // Ensure items is always an array
            const itemsArray = Array.isArray(items) ? items : [];
            
            console.log(`Container ${container.budgetId} (${container.budgetName}):`, {
                itemCount: itemsArray.length,
                items: itemsArray,
                rawItems: items
            });
            
            containerItems.push({
                container: container,
                items: itemsArray
            });
        }
        
        console.log(`Total containerItems array length: ${containerItems.length}`);
        const totalItemsCount = containerItems.reduce((sum, ci) => sum + (ci.items?.length || 0), 0);
        console.log(`Total items across all containers: ${totalItemsCount}`);
        
        if (containerItems.length > 0) {
            console.log(`Sample containerItems[0] structure:`, JSON.stringify({
                container: {
                    budgetId: containerItems[0].container?.budgetId,
                    budgetName: containerItems[0].container?.budgetName,
                    itemCount: containerItems[0].container?.itemCount
                },
                itemsLength: containerItems[0].items?.length,
                firstItem: containerItems[0].items?.[0] || null
            }, null, 2));
        }
        
        // Log full response structure
        console.log('Full response structure:', {
            hasCombinedBudget: !!combinedBudget[0],
            containersCount: containers.length,
            containerItemsCount: containerItems.length,
            totalItems: totalItemsCount
        });

        // Calculate grand total
        const grandTotal = containers.reduce((sum, c) => sum + (parseFloat(c.totalAmount) || 0), 0);

        res.json({
            combinedBudget: combinedBudget[0],
            containers: containers,
            containerItems: containerItems,
            grandTotal: grandTotal,
            containerCount: containers.length,
            totalItems: containerItems.reduce((sum, ci) => sum + ci.items.length, 0)
        });
    } catch (error) {
        console.error('Error fetching combined budget:', error);
        res.status(500).json({ message: 'Error fetching combined budget', error: error.message });
    }
});

/**
 * @route POST /api/budgets/containers/:budgetId/combined/add
 * @description Add a container to an existing combined budget
 * @access Private
 */
router.post('/containers/:budgetId/combined/add', auth, privilege(['budget.update']), async (req, res) => {
    try {
        const { budgetId } = req.params;
        const { containerId } = req.body;
        const userId = req.user?.userId || 1;

        if (!containerId) {
            return res.status(400).json({ message: 'containerId is required' });
        }

        // Verify combined budget exists
        const [combinedBudget] = await pool.query(
            'SELECT * FROM budgets WHERE budgetId = ? AND isCombined = 1 AND voided = 0',
            [budgetId]
        );

        if (combinedBudget.length === 0) {
            return res.status(404).json({ message: 'Combined budget not found' });
        }

        // Verify container exists and is not already combined
        const [container] = await pool.query(
            'SELECT * FROM budgets WHERE budgetId = ? AND voided = 0',
            [containerId]
        );

        if (container.length === 0) {
            return res.status(404).json({ message: 'Container not found' });
        }

        if (container[0].isCombined === 1 || container[0].parentBudgetId) {
            return res.status(400).json({ message: 'This container is already part of a combined budget' });
        }

        // Get current max display order
        const [maxOrder] = await pool.query(
            'SELECT COALESCE(MAX(displayOrder), -1) as maxOrder FROM budget_combinations WHERE combinedBudgetId = ?',
            [budgetId]
        );

        const nextOrder = (maxOrder[0].maxOrder || 0) + 1;

        // Add container to combined budget
        await pool.query(
            `INSERT INTO budget_combinations 
             (combinedBudgetId, containerBudgetId, displayOrder, userId)
             VALUES (?, ?, ?, ?)`,
            [budgetId, containerId, nextOrder, userId]
        );

        // Recalculate total amount
        const [containers] = await pool.query(
            `SELECT budgetId FROM budget_combinations WHERE combinedBudgetId = ?`,
            [budgetId]
        );

        const containerIds = containers.map(c => c.budgetId);
        const placeholders = containerIds.map(() => '?').join(',');
        const [totalResult] = await pool.query(
            `SELECT COALESCE(SUM(totalAmount), 0) as total
             FROM budgets
             WHERE budgetId IN (${placeholders}) AND voided = 0`,
            containerIds
        );

        await pool.query(
            'UPDATE budgets SET totalAmount = ? WHERE budgetId = ?',
            [totalResult[0].total || 0, budgetId]
        );

        res.json({ message: 'Container added to combined budget successfully' });
    } catch (error) {
        console.error('Error adding container to combined budget:', error);
        res.status(500).json({ message: 'Error adding container', error: error.message });
    }
});

/**
 * @route DELETE /api/budgets/containers/:budgetId/combined/:containerId
 * @description Remove a container from a combined budget
 * @access Private
 */
router.delete('/containers/:budgetId/combined/:containerId', auth, privilege(['budget.update']), async (req, res) => {
    try {
        const { budgetId, containerId } = req.params;

        // Remove container from combined budget
        await pool.query(
            'DELETE FROM budget_combinations WHERE combinedBudgetId = ? AND containerBudgetId = ?',
            [budgetId, containerId]
        );

        // Recalculate total amount
        const [containers] = await pool.query(
            `SELECT budgetId FROM budget_combinations WHERE combinedBudgetId = ?`,
            [budgetId]
        );

        if (containers.length === 0) {
            // No containers left, update total to 0
            await pool.query(
                'UPDATE budgets SET totalAmount = 0 WHERE budgetId = ?',
                [budgetId]
            );
        } else {
            const containerIds = containers.map(c => c.budgetId);
            const placeholders = containerIds.map(() => '?').join(',');
            const [totalResult] = await pool.query(
                `SELECT COALESCE(SUM(totalAmount), 0) as total
                 FROM budgets
                 WHERE budgetId IN (${placeholders}) AND voided = 0`,
                containerIds
            );

            await pool.query(
                'UPDATE budgets SET totalAmount = ? WHERE budgetId = ?',
                [totalResult[0].total || 0, budgetId]
            );
        }

        res.json({ message: 'Container removed from combined budget successfully' });
    } catch (error) {
        console.error('Error removing container from combined budget:', error);
        res.status(500).json({ message: 'Error removing container', error: error.message });
    }
});

/**
 * ============================================
 * BUDGET IMPORT ROUTES
 * ============================================
 */

// Configure multer for file uploads
const upload = multer({ 
    dest: 'uploads/temp/',
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Normalize string for matching
const normalizeStr = (v) => {
    if (typeof v !== 'string') return v;
    let normalized = v.trim();
    normalized = normalized.replace(/[''"`\u0027\u2018\u2019\u201A\u201B\u2032\u2035]/g, '');
    normalized = normalized.replace(/\s*\/\s*/g, '/');
    normalized = normalized.replace(/\s+/g, ' ');
    return normalized;
};

// Check if a value represents "CountyWide" (handles various formats)
const isCountyWide = (v) => {
    if (!v || typeof v !== 'string') return false;
    const normalized = normalizeStr(v).toLowerCase();
    const countyWideVariations = [
        'countywide',
        'county-wide',
        'all wards',
        'all ward',
        'all subcounties',
        'all subcounty'
    ];
    return countyWideVariations.includes(normalized);
};

/**
 * @route POST /api/budgets/import-data
 * @description Preview budget data from uploaded file
 * @access Private
 */
router.post('/import-data', upload.single('file'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ success: false, message: 'No file uploaded.' });
    }
    const filePath = req.file.path;
    try {
        const workbook = xlsx.readFile(filePath, { cellDates: true });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const rawData = xlsx.utils.sheet_to_json(worksheet, { header: 1 });

        if (rawData.length < 2) {
            fs.unlink(filePath, () => {});
            return res.status(400).json({ success: false, message: 'Uploaded Excel file is empty or has no data rows.' });
        }

        const headers = rawData[0];
        if (!headers || !Array.isArray(headers) || headers.length === 0) {
            fs.unlink(filePath, () => {});
            return res.status(400).json({ success: false, message: 'Uploaded Excel file has no headers or invalid format.' });
        }

        const dataRows = rawData.slice(1).filter(row => {
            if (!row || !Array.isArray(row)) return false;
            return row.some(cell => cell !== undefined && cell !== null && cell !== '');
        });

        // Map headers to canonical names
        const headerMap = {
            'BudgetName': 'budgetName',
            'Budget Name': 'budgetName',
            'Department': 'department',
            'db_department': 'dbDepartment',
            'Project Name': 'projectName',
            'projectName': 'projectName',
            'ward': 'ward',
            'Ward': 'ward',
            'Amount': 'amount',
            'amount': 'amount',
            'db_subcounty': 'dbSubcounty',
            'db_ward': 'dbWard'
        };
        
        const mapRow = (headers, row) => {
            const obj = {};
            for (let i = 0; i < headers.length; i++) {
                const rawHeader = headers[i];
                if (rawHeader === undefined || rawHeader === null) continue;
                const canonical = headerMap[rawHeader] || rawHeader;
                let value = row[i];
                if (value === undefined || value === null) {
                    value = null;
                } else if (value === '') {
                    value = null;
                }
                obj[canonical] = value;
            }
            return obj;
        };
        
        const fullData = dataRows.map(r => {
                try {
                    return mapRow(headers, r);
                } catch (err) {
                console.error('Error mapping row:', err, 'Row:', r);
                    return null;
                }
            }).filter(row => {
                if (!row) return false;
            const projectName = (row.projectName || '').toString().trim();
            return projectName && projectName.length >= 3;
        });

        if (fullData.length === 0) {
            fs.unlink(filePath, () => {});
            return res.status(400).json({ 
                success: false, 
                message: 'No valid data rows found. Please ensure your file has at least one row with a Project Name (minimum 3 characters).',
                headers: headers,
                sampleRow: dataRows[0] || null
            });
        }

        const previewLimit = 10;
        const previewData = fullData.slice(0, previewLimit);

        // Validate metadata
        const validationErrors = [];
        const budgetNames = new Set();
        const wards = new Set();
        const subcounties = new Set();

        fullData.forEach((row, index) => {
            try {
                if (row.budgetName) budgetNames.add(normalizeStr(String(row.budgetName)));
                if (row.dbWard && row.dbWard !== 'unknown' && row.dbWard !== 'CountyWide') {
                    wards.add(normalizeStr(String(row.dbWard)));
                }
                if (row.dbSubcounty && row.dbSubcounty !== 'unknown' && row.dbSubcounty !== 'CountyWide') {
                    subcounties.add(normalizeStr(String(row.dbSubcounty)));
                }
            } catch (err) {
                console.error(`Error processing row ${index}:`, err);
            }
        });

        // Check if budget names exist
        if (budgetNames.size > 0) {
            const budgetNameList = Array.from(budgetNames);
            const placeholders = budgetNameList.map(() => '?').join(',');
            const [budgetRows] = await pool.query(
                `SELECT budgetId, budgetName FROM budgets WHERE voided = 0 AND budgetName IN (${placeholders})`,
                budgetNameList
            );
            const existingBudgets = new Set(budgetRows.map(b => normalizeStr(b.budgetName)));
            budgetNames.forEach(budgetName => {
                if (!existingBudgets.has(normalizeStr(budgetName))) {
                    validationErrors.push({
                        type: 'budget',
                        value: budgetName,
                        message: `Budget "${budgetName}" not found in system`
                    });
                }
            });
        }

        // Check if wards exist
        if (wards.size > 0) {
            const wardList = Array.from(wards);
            const placeholders = wardList.map(() => '?').join(',');
            const [wardRows] = await pool.query(
                `SELECT wardId, name FROM wards WHERE voided = 0 AND name IN (${placeholders})`,
                wardList
            );
            const existingWards = new Set(wardRows.map(w => normalizeStr(w.name)));
            wards.forEach(ward => {
                if (!existingWards.has(normalizeStr(ward))) {
                    validationErrors.push({
                        type: 'ward',
                        value: ward,
                        message: `Ward "${ward}" not found in system`
                    });
                }
            });
        }

        // Check if subcounties exist
        if (subcounties.size > 0) {
            const subcountyList = Array.from(subcounties);
            const placeholders = subcountyList.map(() => '?').join(',');
            const [subcountyRows] = await pool.query(
                `SELECT subcountyId, name FROM subcounties WHERE voided = 0 AND name IN (${placeholders})`,
                subcountyList
            );
            const existingSubcounties = new Set(subcountyRows.map(s => normalizeStr(s.name)));
            subcounties.forEach(subcounty => {
                if (!existingSubcounties.has(normalizeStr(subcounty))) {
                    validationErrors.push({
                        type: 'subcounty',
                        value: subcounty,
                        message: `Subcounty "${subcounty}" not found in system`
                    });
                }
            });
        }

        fs.unlink(filePath, () => {});
        return res.status(200).json({
            success: true,
            message: `File parsed successfully. Review ${previewData.length} of ${fullData.length} rows.${validationErrors.length > 0 ? ` ${validationErrors.length} validation warning(s).` : ''}`,
            previewData,
            headers,
            fullData,
            validationErrors: validationErrors.length > 0 ? validationErrors : undefined
        });
    } catch (err) {
        if (fs.existsSync(filePath)) {
            fs.unlink(filePath, () => {});
        }
        console.error('Budget import preview error:', err);
        console.error('Error stack:', err.stack);
            return res.status(500).json({ 
                success: false, 
                message: `File parsing failed: ${err.message}`,
                error: process.env.NODE_ENV === 'development' ? err.stack : undefined
            });
    }
});

/**
 * @route POST /api/budgets/check-metadata-mapping
 * @description Check metadata mappings for budget import data (departments, wards, subcounties, financial years, budgets)
 * @access Private
 * Accepts either:
 *   - FormData with 'file' field (for file upload)
 *   - JSON body with 'dataToImport' array
 */
router.post('/check-metadata-mapping', upload.single('file'), async (req, res) => {
    const overallStart = Date.now();
    console.log('=== POST /api/budgets/check-metadata-mapping called ===');
    let dataToImport = req.body?.dataToImport;
    let filePath = req.file?.path;
    
    // If no data provided but file uploaded, parse the file
    if ((!dataToImport || !Array.isArray(dataToImport) || dataToImport.length === 0) && filePath) {
        try {
            console.log('No dataToImport provided, parsing uploaded file for metadata check');
            const workbook = xlsx.readFile(filePath, { 
                cellDates: true,
                cellNF: false,
                cellStyles: false
            });
            const sheetName = workbook.SheetNames[0];
            let worksheet = workbook.Sheets[sheetName];
            
            const rawData = xlsx.utils.sheet_to_json(worksheet, { 
                header: 1,
                defval: null,
                raw: false
            });
            
            if (rawData.length < 2) {
                fs.unlink(filePath, () => {});
                return res.status(400).json({ success: false, message: 'Uploaded Excel file is empty or has no data rows.' });
            }
            
            const headers = rawData[0];
            const dataRows = rawData.slice(1).filter(row => {
                if (!row || !Array.isArray(row)) return false;
                return row.some(cell => cell !== undefined && cell !== null && cell !== '');
            });
            
            // Map headers to canonical names (same as in confirm-import-data)
            const headerMap = {
                'budgetname': 'budgetName',
                'budget name': 'budgetName',
                'budget': 'budgetName',
                'department': 'department',
                'db_department': 'dbDepartment',
                'project name': 'projectName',
                'projectname': 'projectName',
                'ward': 'ward',
                'amount': 'amount',
                'db_subcounty': 'dbSubcounty',
                'db_ward': 'dbWard',
                'subcounty': 'subcounty',
                'sub-county': 'subcounty',
                'sub county': 'subcounty',
                'fin_year': 'finYear',
                'finYear': 'finYear',
                'financial year': 'finYear',
                'financialYear': 'finYear'
            };
            
            const normalizeHeader = (header) => {
                if (!header || typeof header !== 'string') return '';
                return header.trim().toLowerCase();
            };
            
            const mapRow = (headers, row) => {
                const obj = {};
                for (let i = 0; i < headers.length; i++) {
                    const rawHeader = headers[i];
                    if (rawHeader === undefined || rawHeader === null) continue;
                    const normalizedHeader = normalizeHeader(rawHeader);
                    const canonical = headerMap[normalizedHeader] || normalizedHeader;
                    let value = row[i];
                    if (value === undefined || value === null) value = '';
                    obj[canonical] = value;
                    obj[rawHeader] = value; // Keep original header name too
                }
                return obj;
            };
            
            dataToImport = dataRows.map(row => mapRow(headers, row)).filter(row => {
                if (!row) return false;
                const projectName = (row.projectName || row['Project Name'] || '').toString().trim();
                return projectName && projectName.length >= 3;
            });
            
            // Clean up file after parsing
            fs.unlink(filePath, () => {});
            filePath = null;
            console.log(`Parsed ${dataToImport.length} rows from uploaded file`);
        } catch (parseErr) {
            if (filePath && fs.existsSync(filePath)) {
                fs.unlink(filePath, () => {});
            }
            console.error('Error parsing file in check-metadata-mapping:', parseErr);
            return res.status(400).json({ success: false, message: `Failed to parse uploaded file: ${parseErr.message}` });
        }
    }
    
    console.log('Data to import length:', dataToImport?.length || 0);
    
    if (!dataToImport || !Array.isArray(dataToImport) || dataToImport.length === 0) {
        console.error('No data provided for metadata mapping check');
        return res.status(400).json({ success: false, message: 'No data provided for metadata mapping check.' });
    }

    // Use metadataService for lookups
    const metadataService = require('../services/metadataService');
    
    const mappingSummary = {
        departments: { existing: [], new: [], unmatched: [] },
        wards: { existing: [], new: [], unmatched: [] },
        subcounties: { existing: [], new: [], unmatched: [] },
        financialYears: { existing: [], new: [], unmatched: [] },
        budgets: { existing: [], new: [], unmatched: [] },
        totalRows: dataToImport.length,
        rowsWithUnmatchedMetadata: []
    };

    try {
        // Load metadata mappings
        const metadata = await metadataService.loadMetadataMappings();
        
        // Collect unique values from all rows
        const uniqueDepartments = new Set();
        const uniqueWards = new Set();
        const uniqueSubcounties = new Set();
        const uniqueFinancialYears = new Set();
        const uniqueBudgets = new Set();

        dataToImport.forEach((row, index) => {
            const projectName = (row.projectName || row['Project Name'] || '').toString().trim();
            if (!projectName || projectName.length < 3) {
                return; // Skip this row
            }
            
            const dept = normalizeStr(row.department || row.dbDepartment || row.Department);
            const ward = normalizeStr(row.ward || row.dbWard || row.Ward || row['Ward Name']);
            const subcounty = normalizeStr(row.subcounty || row.dbSubcounty || row['Sub County'] || row.Subcounty || row['sub-county']);
            const finYear = normalizeStr(row.finYear || row.financialYear || row['Financial Year'] || row.fin_year);
            const budget = normalizeStr(row.budgetName || row.budget || row.Budget || row['Budget Name']);

            if (dept) uniqueDepartments.add(dept);
            if (ward) uniqueWards.add(ward);
            if (subcounty) uniqueSubcounties.add(subcounty);
            if (finYear) uniqueFinancialYears.add(finYear);
            if (budget) uniqueBudgets.add(budget);
        });

        // Check departments
        if (uniqueDepartments.size > 0) {
            const deptList = Array.from(uniqueDepartments);
            deptList.forEach(dept => {
                const deptId = metadataService.getDepartmentId(metadata.departments, metadata.departmentAliases, dept);
                if (deptId) {
                    mappingSummary.departments.existing.push(dept);
                } else {
                    // Unmatched departments are potential new ones
                    mappingSummary.departments.new.push(dept);
                    mappingSummary.departments.unmatched.push(dept);
                }
            });
        }

        // Check wards
        if (uniqueWards.size > 0) {
            const wardList = Array.from(uniqueWards);
            wardList.forEach(ward => {
                // Skip CountyWide as it's a special case
                if (isCountyWide(ward)) {
                    mappingSummary.wards.existing.push(ward);
                    return;
                }
                const wardInfo = metadataService.getWardInfo(metadata.wards, metadata.wardWordSets, ward);
                if (wardInfo && wardInfo.wardId) {
                    mappingSummary.wards.existing.push(ward);
                } else {
                    // Unmatched wards are potential new ones
                    mappingSummary.wards.new.push(ward);
                    mappingSummary.wards.unmatched.push(ward);
                }
            });
        }

        // Check subcounties
        if (uniqueSubcounties.size > 0) {
            const subcountyList = Array.from(uniqueSubcounties);
            subcountyList.forEach(subcounty => {
                // Skip CountyWide as it's a special case
                if (isCountyWide(subcounty)) {
                    mappingSummary.subcounties.existing.push(subcounty);
                    return;
                }
                const subcountyId = metadataService.getSubcountyId(metadata.subcounties, metadata.subcountyWordSets, subcounty);
                if (subcountyId) {
                    mappingSummary.subcounties.existing.push(subcounty);
                } else {
                    // Unmatched subcounties are potential new ones
                    mappingSummary.subcounties.new.push(subcounty);
                    mappingSummary.subcounties.unmatched.push(subcounty);
                }
            });
        }

        // Check financial years
        if (uniqueFinancialYears.size > 0) {
            const finYearList = Array.from(uniqueFinancialYears);
            const existingFinYears = new Set(metadata.financialYears.keys());
            finYearList.forEach(finYear => {
                const normalized = normalizeStr(finYear).toLowerCase();
                if (existingFinYears.has(normalized)) {
                    mappingSummary.financialYears.existing.push(finYear);
                } else {
                    // Unmatched financial years are potential new ones
                    mappingSummary.financialYears.new.push(finYear);
                    mappingSummary.financialYears.unmatched.push(finYear);
                }
            });
        }

        // Check budgets
        if (uniqueBudgets.size > 0) {
            const budgetList = Array.from(uniqueBudgets);
            const [budgetRows] = await pool.query(
                'SELECT budgetName FROM budgets WHERE voided = 0'
            );
            const existingBudgets = new Set(budgetRows.map(b => normalizeStr(b.budgetName).toLowerCase()));
            budgetList.forEach(budget => {
                const normalized = normalizeStr(budget).toLowerCase();
                if (existingBudgets.has(normalized)) {
                    mappingSummary.budgets.existing.push(budget);
                } else {
                    // Unmatched budgets are potential new ones
                    mappingSummary.budgets.new.push(budget);
                    mappingSummary.budgets.unmatched.push(budget);
                }
            });
        }

        const overallTime = Date.now() - overallStart;
        console.log(`Metadata mapping check completed in ${overallTime}ms`);

        res.json({
            success: true,
            mappingSummary
        });
    } catch (error) {
        console.error('Error checking metadata mapping:', error);
        res.status(500).json({
            success: false,
            message: 'Error checking metadata mapping',
            error: error.message
        });
    }
});

/**
 * @route POST /api/budgets/confirm-import-data
 * @description Confirm and import budget data
 * @access Private
 * Accepts either:
 *   - FormData with 'file' field (for file upload)
 *   - JSON body with 'dataToImport' array
 */
router.post('/confirm-import-data', upload.single('file'), async (req, res) => {
    let dataToImport = [];
    let filePath = null;

    // Handle file upload
    if (req.file) {
        filePath = req.file.path;
        try {
            const workbook = xlsx.readFile(filePath, { cellDates: true });
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const rawData = xlsx.utils.sheet_to_json(worksheet, { header: 1 });

            if (rawData.length < 2) {
                if (filePath && fs.existsSync(filePath)) {
                    fs.unlink(filePath, () => {});
                }
                return res.status(400).json({ success: false, message: 'Uploaded Excel file is empty or has no data rows.' });
            }

            const headers = rawData[0];
            if (!headers || !Array.isArray(headers) || headers.length === 0) {
                if (filePath && fs.existsSync(filePath)) {
                    fs.unlink(filePath, () => {});
                }
                return res.status(400).json({ success: false, message: 'Uploaded Excel file has no headers or invalid format.' });
            }
            
            // Log headers for debugging
            console.log('File headers found:', headers);
            console.log('Header count:', headers.length);

            const dataRows = rawData.slice(1).filter(row => {
                if (!row || !Array.isArray(row)) return false;
                return row.some(cell => cell !== undefined && cell !== null && cell !== '');
            });

            // Map headers to canonical names (case-insensitive, trim whitespace)
            const headerMap = {
                'budgetname': 'budgetName',
                'budget name': 'budgetName',
                'department': 'department',
                'db_department': 'dbDepartment',
                'project name': 'projectName',
                'projectname': 'projectName',
                'ward': 'ward',
                'amount': 'amount',
                'db_subcounty': 'dbSubcounty',
                'db_ward': 'dbWard'
            };

            // Normalize header for matching (lowercase, trim)
            const normalizeHeader = (header) => {
                if (!header || typeof header !== 'string') return '';
                return header.trim().toLowerCase();
            };

            const mapRow = (headers, row) => {
                const obj = {};
                for (let i = 0; i < headers.length; i++) {
                    const rawHeader = headers[i];
                    if (rawHeader === undefined || rawHeader === null) continue;
                    const normalizedHeader = normalizeHeader(rawHeader);
                    const canonical = headerMap[normalizedHeader] || normalizedHeader;
                    let value = row[i];
                    if (value === undefined || value === null) value = '';
                    // Also store original header name for fallback
                    obj[canonical] = value;
                    obj[rawHeader] = value; // Keep original header name too
                }
                return obj;
            };

            dataToImport = dataRows.map(row => mapRow(headers, row));
        } catch (fileError) {
            if (filePath && fs.existsSync(filePath)) {
                fs.unlink(filePath, () => {});
            }
            console.error('Error parsing file:', fileError);
            return res.status(400).json({ 
                success: false, 
                message: `Error parsing file: ${fileError.message}` 
            });
        }
    } else {
        // Fall back to dataToImport from body
        dataToImport = req.body?.dataToImport || [];
    }

    if (!dataToImport || !Array.isArray(dataToImport) || dataToImport.length === 0) {
        if (filePath && fs.existsSync(filePath)) {
            fs.unlink(filePath, () => {});
        }
        return res.status(400).json({ success: false, message: 'No data provided for import.' });
    }

    const userId = req.user?.userId || 1; // Get from authenticated user
    
    // Extract budgetId from the file (budget name is in the file)
    let budgetId = null;
    if (dataToImport && dataToImport.length > 0) {
        // Get unique budget names from the file
        const budgetNames = new Set();
        dataToImport.forEach(row => {
            const budgetName = normalizeStr(
                row.budgetName || row.budget || row.Budget || row['Budget Name'] || row['budget name'] || ''
            );
            if (budgetName) {
                budgetNames.add(budgetName);
            }
        });
        
        if (budgetNames.size > 0) {
            // Get all budgets from database for matching
            const [budgetRows] = await pool.query(
                'SELECT budgetId, budgetName FROM budgets WHERE voided = 0'
            );
            
            // Find matching budgets (case-insensitive)
            const matchingBudgets = [];
            budgetNames.forEach(budgetName => {
                const normalizedBudgetName = normalizeStr(budgetName).toLowerCase();
                const match = budgetRows.find(b => 
                    normalizeStr(b.budgetName).toLowerCase() === normalizedBudgetName
                );
                if (match) {
                    matchingBudgets.push({ name: budgetName, id: match.budgetId, dbName: match.budgetName });
                }
            });
            
            if (matchingBudgets.length === 1) {
                // Exactly one matching budget found - use it
                budgetId = matchingBudgets[0].id;
                console.log(`Extracted budget "${matchingBudgets[0].dbName}" (ID: ${budgetId}) from file`);
            } else if (matchingBudgets.length > 1) {
                // Multiple budgets found - use the first one (most common approach)
                // Count occurrences to find the most common one
                const budgetCounts = new Map();
                dataToImport.forEach(row => {
                    const budgetName = normalizeStr(
                        row.budgetName || row.budget || row.Budget || row['Budget Name'] || row['budget name'] || ''
                    );
                    if (budgetName) {
                        budgetCounts.set(budgetName, (budgetCounts.get(budgetName) || 0) + 1);
                    }
                });
                
                // Find the most common matching budget
                let mostCommon = matchingBudgets[0];
                let maxCount = budgetCounts.get(mostCommon.name) || 0;
                matchingBudgets.forEach(b => {
                    const count = budgetCounts.get(b.name) || 0;
                    if (count > maxCount) {
                        mostCommon = b;
                        maxCount = count;
                    }
                });
                
                budgetId = mostCommon.id;
                console.log(`Multiple budgets found in file. Using most common: "${mostCommon.dbName}" (ID: ${budgetId})`);
            } else {
                // No matching budgets found
                const budgetNamesList = Array.from(budgetNames).join(', ');
                if (filePath && fs.existsSync(filePath)) {
                    fs.unlink(filePath, () => {});
                }
                return res.status(400).json({ 
                    success: false, 
                    message: `Budget(s) "${budgetNamesList}" not found in the system. Please ensure the budget name in the file matches an existing budget container.` 
                });
            }
        }
    }
    
    if (!budgetId) {
        if (filePath && fs.existsSync(filePath)) {
            fs.unlink(filePath, () => {});
        }
        return res.status(400).json({ 
            success: false, 
            message: 'No budget name found in the file. Please ensure the file contains a "budget" or "budgetName" column with a valid budget name.' 
        });
    }

    let connection;
    const summary = {
        totalRows: dataToImport.length,
        itemsCreated: 0,
        itemsSkipped: 0,
        errors: []
    };

    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();

        // Get budget container info once (outside the loop)
        const [budgetRows] = await connection.query(
            'SELECT budgetId, finYearId, departmentId, budgetName FROM budgets WHERE voided = 0 AND budgetId = ? LIMIT 1',
            [budgetId]
        );

        if (budgetRows.length === 0) {
            await connection.rollback();
            connection.release();
            if (filePath && fs.existsSync(filePath)) {
                fs.unlink(filePath, () => {});
            }
            return res.status(400).json({ success: false, message: `Budget with ID ${budgetId} not found.` });
        }

        const budgetInfo = budgetRows[0];

        // If budget is missing departmentId or finYearId, try to extract from the file
        let finalDepartmentId = budgetInfo.departmentId;
        let finalFinYearId = budgetInfo.finYearId;

        if (!finalDepartmentId || !finalFinYearId) {
            console.log(`Budget "${budgetInfo.budgetName}" is missing departmentId or finYearId. Attempting to extract from file...`);
            
            // Load metadata service
            const metadataService = require('../services/metadataService');
            const metadata = await metadataService.loadMetadataMappings();
            
            // Try to extract department and financial year from the first few rows
            let extractedDepartmentName = null;
            let extractedFinYearName = null;
            
            for (let j = 0; j < Math.min(10, dataToImport.length); j++) {
                const sampleRow = dataToImport[j] || {};
                
                // Try to find department
                if (!extractedDepartmentName) {
                    const deptName = normalizeStr(
                        sampleRow.department || sampleRow.Department || sampleRow['Department'] || 
                        sampleRow.dbDepartment || sampleRow.db_department || ''
                    );
                    if (deptName) {
                        const deptId = metadataService.getDepartmentId(metadata.departments, metadata.departmentAliases, deptName);
                        if (deptId) {
                            extractedDepartmentName = deptName;
                            finalDepartmentId = deptId;
                            console.log(`Extracted department "${deptName}" (ID: ${deptId}) from file`);
                        }
                    }
                }
                
                // Try to find financial year
                if (!extractedFinYearName) {
                    const fyName = normalizeStr(
                        sampleRow.financialYear || sampleRow.FinancialYear || sampleRow['Financial Year'] || 
                        sampleRow.finYear || sampleRow.FinYear || sampleRow.ADP || sampleRow.Year || ''
                    );
                    if (fyName) {
                        // Normalize financial year name using the same logic as metadataService
                        // Remove FY prefix, normalize separators, handle concatenated years
                        let normalizedFY = normalizeStr(fyName).toLowerCase();
                        
                        // Check for concatenated years like "20232024"
                        const concatenatedMatch = normalizedFY.match(/^(\d{4})(\d{4})$/);
                        if (concatenatedMatch) {
                            const year1 = concatenatedMatch[1];
                            const year2 = concatenatedMatch[2];
                            const y1 = parseInt(year1, 10);
                            const y2 = parseInt(year2, 10);
                            if (y1 >= 1900 && y1 <= 2100 && y2 >= 1900 && y2 <= 2100 && y2 === y1 + 1) {
                                normalizedFY = `${year1}/${year2}`;
                            }
                        }
                        
                        // Remove FY prefix (with optional space)
                        normalizedFY = normalizedFY.replace(/^fy\s*/i, '');
                        // Normalize all separators (space, dash) to slash
                        normalizedFY = normalizedFY.replace(/[\s\-]/g, '/');
                        // Remove any extra slashes
                        normalizedFY = normalizedFY.replace(/\/+/g, '/').trim();
                        
                        // Find matching financial year (exact match first, then partial)
                        if (metadata.financialYears.has(normalizedFY)) {
                            const fyInfo = metadata.financialYears.get(normalizedFY);
                            finalFinYearId = fyInfo.finYearId;
                            extractedFinYearName = fyName;
                            console.log(`Extracted financial year "${fyName}" (ID: ${finalFinYearId}) from file`);
                        } else {
                            // Try partial match
                            for (const [key, value] of metadata.financialYears.entries()) {
                                if (key.includes(normalizedFY) || normalizedFY.includes(key)) {
                                    finalFinYearId = value.finYearId;
                                    extractedFinYearName = fyName;
                                    console.log(`Extracted financial year "${fyName}" (ID: ${finalFinYearId}) from file (partial match: "${key}")`);
                                    break;
                                }
                            }
                        }
                    }
                }
                
                // If we found both, we can break early
                if (finalDepartmentId && finalFinYearId) {
                    break;
                }
            }
            
            // If we successfully extracted values, optionally update the budget container
            if (finalDepartmentId && finalFinYearId && (!budgetInfo.departmentId || !budgetInfo.finYearId)) {
                console.log(`Updating budget container "${budgetInfo.budgetName}" with extracted values: departmentId=${finalDepartmentId}, finYearId=${finalFinYearId}`);
                await connection.query(
                    'UPDATE budgets SET departmentId = COALESCE(departmentId, ?), finYearId = COALESCE(finYearId, ?) WHERE budgetId = ?',
                    [finalDepartmentId, finalFinYearId, budgetId]
                );
            }
        }

        // Final validation - fail only if we still don't have the required fields
        if (!finalDepartmentId || !finalFinYearId) {
            await connection.rollback();
            connection.release();
            if (filePath && fs.existsSync(filePath)) {
                fs.unlink(filePath, () => {});
            }
            return res.status(400).json({ 
                success: false, 
                message: `Budget "${budgetInfo.budgetName}" is missing required fields: departmentId or finYearId. Could not extract from file. Please ensure the file contains department and financial year columns, or update the budget container manually.` 
            });
        }
        
        // Use the final values (either from budget container or extracted from file)
        budgetInfo.departmentId = finalDepartmentId;
        budgetInfo.finYearId = finalFinYearId;

        for (let i = 0; i < dataToImport.length; i++) {
            const row = dataToImport[i] || {};
            try {
                // Helper function to find field value by trying multiple key variations
                const findField = (possibleKeys, defaultValue = '') => {
                    for (const key of possibleKeys) {
                        if (row[key] !== undefined && row[key] !== null && row[key] !== '') {
                            return String(row[key]).trim();
                        }
                    }
                    // Try case-insensitive search through all keys
                    const rowKeys = Object.keys(row);
                    for (const key of possibleKeys) {
                        const lowerKey = key.toLowerCase();
                        const foundKey = rowKeys.find(k => k.toLowerCase() === lowerKey);
                        if (foundKey && row[foundKey] !== undefined && row[foundKey] !== null && row[foundKey] !== '') {
                            return String(row[foundKey]).trim();
                        }
                    }
                    return defaultValue;
                };

                // Try multiple possible field names (case-insensitive)
                // Note: budgetName is not required from the file since we use the selected budget container
                const projectName = normalizeStr(
                    findField(['projectName', 'Project Name', 'project name', 'PROJECTNAME', 'project_name', 'PROJECT_NAME'])
                );
                const amountStr = findField(['amount', 'Amount', 'AMOUNT', 'AMOUNT_', 'Amount_']);
                const amount = parseFloat(amountStr) || 0;
                const dbWard = normalizeStr(
                    findField(['dbWard', 'db_ward', 'DB_WARD', 'ward', 'Ward', 'WARD'])
                );
                const dbSubcounty = normalizeStr(
                    findField(['dbSubcounty', 'db_subcounty', 'DB_SUBCOUNTY', 'subcounty', 'Subcounty', 'SUBCOUNTY'])
                );
                
                // Debug logging for first few rows
                if (i < 3) {
                    console.log(`Row ${i + 2} data:`, {
                        budgetId,
                        projectName,
                        amount,
                        amountStr,
                        dbWard,
                        dbSubcounty,
                        rowKeys: Object.keys(row),
                        rowSample: JSON.stringify(row, null, 2)
                    });
                }

                if (!projectName || !amount || amount <= 0) {
                    summary.itemsSkipped++;
                    const missingFields = [];
                    if (!projectName) missingFields.push('projectName');
                    if (!amount || amount <= 0) missingFields.push('amount');
                    
                    summary.errors.push({
                        row: i + 2,
                        message: `Missing required fields: ${missingFields.join(', ')}`,
                        foundFields: Object.keys(row).filter(k => row[k] !== undefined && row[k] !== null && row[k] !== ''),
                        sampleData: {
                            projectName: projectName || 'NOT FOUND',
                            amount: amount || 'NOT FOUND'
                        }
                    });
                    continue;
                }

                // Get or create project
                let projectId = null;
                const [projectRows] = await connection.query(
                    'SELECT id FROM projects WHERE voided = 0 AND projectName = ? LIMIT 1',
                    [projectName]
                );

                if (projectRows.length > 0) {
                    projectId = projectRows[0].id;
                    // Update costOfProject if the new amount is higher, always set status to 'Under Procurement' for budget imports, and update budgetId to current budget
                    await connection.query(
                        'UPDATE projects SET costOfProject = GREATEST(COALESCE(costOfProject, 0), ?), status = ?, budgetId = ? WHERE id = ?',
                        [amount, 'Under Procurement', budgetId, projectId]
                    );
                } else {
                    // Create project if it doesn't exist
                    const [projectResult] = await connection.query(
                        'INSERT INTO projects (projectName, departmentId, finYearId, costOfProject, status, budgetId, userId) VALUES (?, ?, ?, ?, ?, ?, ?)',
                        [projectName, budgetInfo.departmentId, budgetInfo.finYearId, amount, 'Under Procurement', budgetId, userId]
                    );
                    projectId = projectResult.insertId;
                }

                // Get ward and subcounty IDs for linking to project
                let wardId = null;
                let subcountyId = null;

                // Check for CountyWide first (handles various formats)
                const isWardCountyWide = dbWard && isCountyWide(dbWard);
                const isSubcountyCountyWide = dbSubcounty && isCountyWide(dbSubcounty);

                if (isWardCountyWide || isSubcountyCountyWide) {
                    // CountyWide has specific IDs: wardId = 38, subcountyId = 9
                    wardId = 38;
                    subcountyId = 9;
                    console.log(`Row ${i + 2}: Detected CountyWide - setting wardId=38, subcountyId=9`);
                } else {
                    // Look up regular ward
                    if (dbWard && dbWard !== 'unknown') {
                        const [wardRows] = await connection.query(
                            'SELECT wardId, subcountyId FROM wards WHERE voided = 0 AND name = ? LIMIT 1',
                            [dbWard]
                        );
                        if (wardRows.length > 0) {
                            wardId = wardRows[0].wardId;
                            subcountyId = wardRows[0].subcountyId;
                        }
                    }

                    // Look up regular subcounty (if not already set from ward)
                    if (dbSubcounty && dbSubcounty !== 'unknown' && !subcountyId) {
                        const [subcountyRows] = await connection.query(
                            'SELECT subcountyId FROM subcounties WHERE voided = 0 AND name = ? LIMIT 1',
                            [dbSubcounty]
                        );
                        if (subcountyRows.length > 0) {
                            subcountyId = subcountyRows[0].subcountyId;
                        }
                    }
                }

                // Link project to locations via junction tables
                if (wardId) {
                    const [existingWardLink] = await connection.query(
                        'SELECT * FROM project_wards WHERE projectId = ? AND wardId = ?',
                        [projectId, wardId]
                    );
                    if (existingWardLink.length === 0) {
                        await connection.query(
                            'INSERT INTO project_wards (projectId, wardId) VALUES (?, ?)',
                            [projectId, wardId]
                        );
                    }
                }

                if (subcountyId) {
                    const [existingSubcountyLink] = await connection.query(
                        'SELECT * FROM project_subcounties WHERE projectId = ? AND subcountyId = ?',
                        [projectId, subcountyId]
                    );
                    if (existingSubcountyLink.length === 0) {
                        await connection.query(
                            'INSERT INTO project_subcounties (projectId, subcountyId) VALUES (?, ?)',
                            [projectId, subcountyId]
                        );
                    }
                }

                // Create budget item for tracking (optional - projects can also be queried directly via budgetId)
                // This allows tracking of addedAfterApproval, changeRequestId, remarks, etc.
                try {
                    await connection.query(
                        'INSERT INTO budget_items (budgetId, projectId, userId) VALUES (?, ?, ?)',
                        [budgetId, projectId, userId]
                    );
                } catch (itemError) {
                    // If budget item creation fails (e.g., duplicate), log but don't fail the import
                    // Projects are already created/updated with budgetId, so they can be queried directly
                    console.warn(`Could not create budget item for project ${projectId} in budget ${budgetId}:`, itemError.message);
                }

                summary.itemsCreated++;
            } catch (rowError) {
                summary.itemsSkipped++;
                summary.errors.push({
                    row: i + 2,
                    message: rowError.message || 'Error processing row'
                });
            }
        }

        await connection.commit();
        
        // Clean up uploaded file
        if (filePath && fs.existsSync(filePath)) {
            fs.unlink(filePath, () => {});
        }
        
        res.status(200).json({
            success: true,
            message: `Import completed. ${summary.itemsCreated} items created, ${summary.itemsSkipped} skipped.`,
            summary
        });
    } catch (error) {
        if (connection) await connection.rollback();
        console.error('Budget import error:', error);
        
        // Clean up uploaded file on error
        if (filePath && fs.existsSync(filePath)) {
            fs.unlink(filePath, () => {});
        }
        
        res.status(500).json({ success: false, message: `Import failed: ${error.message}` });
    } finally {
        if (connection) connection.release();
    }
});

/**
 * @route GET /api/budgets/template
 * @description Download budget import template
 * @access Private
 */
router.get('/template', async (req, res) => {
    try {
        const templatePath = path.resolve(__dirname, '..', 'templates', 'budget_import_template.xlsx');
        if (!fs.existsSync(templatePath)) {
            return res.status(404).json({ message: 'Budget template not found on server' });
        }
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename="budget_import_template.xlsx"');
        return res.sendFile(templatePath);
    } catch (err) {
        console.error('Error serving budget template:', err);
        return res.status(500).json({ message: 'Failed to serve budget template' });
    }
});

module.exports = router;

/**
 * @route GET /api/budgets/template
 * @description Download budget import template
 * @access Private
 */
router.get('/template', async (req, res) => {
    try {
        const templatePath = path.resolve(__dirname, '..', 'templates', 'budget_import_template.xlsx');
        if (!fs.existsSync(templatePath)) {
            return res.status(404).json({ message: 'Budget template not found on server' });
        }
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename="budget_import_template.xlsx"');
        return res.sendFile(templatePath);
    } catch (err) {
        console.error('Error serving budget template:', err);
        return res.status(500).json({ message: 'Failed to serve budget template' });
    }
});

module.exports = router;


