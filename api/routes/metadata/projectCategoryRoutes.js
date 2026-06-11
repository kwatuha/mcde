// src/routes/metadata/projectCategoryRoutes.js

const express = require('express');
const router = express.Router();
const pool = require('../../config/db'); // Correct path for the new folder structure

async function runSafeDdl(sql) {
    try {
        await pool.query(sql);
    } catch (err) {
        const code = String(err?.code || '');
        const msg = String(err?.message || '').toLowerCase();
        if (
            code === '42P07' ||
            code === '42710' ||
            code === '23505' ||
            code === 'ER_DUP_FIELDNAME' ||
            msg.includes('duplicate column') ||
            msg.includes('already exists')
        ) {
            return;
        }
        throw err;
    }
}

async function ensureCategoryBqTemplateTable(DB_TYPE = process.env.DB_TYPE || 'mysql') {
    if (DB_TYPE === 'postgresql') {
        await runSafeDdl(`
            CREATE TABLE IF NOT EXISTS category_bq_templates (
                id BIGSERIAL PRIMARY KEY,
                category_id BIGINT NOT NULL,
                milestone_id BIGINT NULL,
                activity_name TEXT NOT NULL,
                description TEXT NULL,
                unit_of_measure TEXT NULL,
                quantity NUMERIC(18,4) NULL,
                unit_cost NUMERIC(18,2) NULL,
                budget_amount NUMERIC(18,2) NULL,
                sort_order INTEGER NOT NULL DEFAULT 0,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                voided BOOLEAN NOT NULL DEFAULT FALSE
            )
        `);
        await runSafeDdl(`CREATE INDEX IF NOT EXISTS idx_category_bq_templates_category ON category_bq_templates (category_id, voided, sort_order)`);
        return;
    }

    await runSafeDdl(`
        CREATE TABLE IF NOT EXISTS category_bq_templates (
            id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
            category_id BIGINT NOT NULL,
            milestone_id BIGINT NULL,
            activity_name VARCHAR(255) NOT NULL,
            description TEXT NULL,
            unit_of_measure VARCHAR(100) NULL,
            quantity DECIMAL(18,4) NULL,
            unit_cost DECIMAL(18,2) NULL,
            budget_amount DECIMAL(18,2) NULL,
            sort_order INT NOT NULL DEFAULT 0,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            voided TINYINT(1) NOT NULL DEFAULT 0,
            INDEX idx_category_bq_templates_category (category_id, voided, sort_order)
        )
    `);
}

function toNullableNumber(value) {
    if (value === '' || value === null || value === undefined) return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
}

function parseBqTemplatePayload(body = {}) {
    const activityName = String(body.activityName || body.activity_name || '').trim();
    const description = String(body.description || '').trim();
    const unitOfMeasure = String(body.unitOfMeasure || body.unit_of_measure || '').trim();
    const milestoneId = toNullableNumber(body.milestoneId ?? body.milestone_id);
    const quantity = toNullableNumber(body.quantity);
    const unitCost = toNullableNumber(body.unitCost ?? body.unit_cost);
    const budgetRaw = toNullableNumber(body.budgetAmount ?? body.budget_amount);
    const budgetAmount = budgetRaw !== null
        ? budgetRaw
        : (quantity !== null && unitCost !== null ? quantity * unitCost : null);
    const sortOrderRaw = toNullableNumber(body.sortOrder ?? body.sort_order);

    if (!activityName) {
        return { error: 'Activity name is required.' };
    }

    return {
        value: {
            activityName,
            description: description || null,
            unitOfMeasure: unitOfMeasure || null,
            milestoneId,
            quantity,
            unitCost,
            budgetAmount,
            sortOrder: sortOrderRaw !== null ? sortOrderRaw : 0,
        }
    };
}

// --- Project Categories CRUD ---

/**
 * @route GET /api/metadata/projectcategories/
 * @description Get all project categories that are not soft-deleted.
 * @access Public (can be protected by middleware)
 */
router.get('/', async (req, res) => {
    const DB_TYPE = process.env.DB_TYPE || 'mysql';
    console.log('GET /api/metadata/projectcategories - Request received');
    console.log('DB_TYPE:', DB_TYPE);
    
    try {
        let categories = [];
        if (DB_TYPE === 'postgresql') {
            const query = 'SELECT "categoryId", "categoryName", description, voided, "voidedBy" FROM categories WHERE (voided IS NULL OR voided = false) ORDER BY "categoryName"';
            console.log('PostgreSQL query:', query);
            const result = await pool.query(query);
            console.log('PostgreSQL query result:', result);
            console.log('PostgreSQL result.rows:', result.rows);
            categories = result.rows || [];
            console.log('PostgreSQL categories array:', categories);
        } else {
            const query = 'SELECT * FROM project_milestone_implementations WHERE voided = 0 ORDER BY categoryName';
            console.log('MySQL query:', query);
            const [rows] = await pool.query(query);
            console.log('MySQL rows:', rows);
            categories = rows || [];
            console.log('MySQL categories array:', categories);
        }
        console.log(`Fetched ${categories.length} project categories`);
        console.log('Categories to return:', JSON.stringify(categories, null, 2));
        res.status(200).json(categories);
    } catch (error) {
        console.error('Error fetching project categories:', error);
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);
        res.status(500).json({ message: 'Error fetching project categories', error: error.message });
    }
});

/**
 * @route GET /api/metadata/projectcategories/:categoryId
 * @description Get a single project category by ID.
 * @access Public (can be protected by middleware)
 */
router.get('/:categoryId', async (req, res) => {
    const DB_TYPE = process.env.DB_TYPE || 'mysql';
    const { categoryId } = req.params;
    try {
        if (DB_TYPE === 'postgresql') {
            const query = 'SELECT "categoryId", "categoryName", description, voided, "voidedBy" FROM categories WHERE "categoryId" = $1 AND (voided IS NULL OR voided = false)';
            const result = await pool.query(query, [categoryId]);
            if (result.rows.length > 0) {
                res.status(200).json(result.rows[0]);
            } else {
                res.status(404).json({ message: 'Project category not found' });
            }
        } else {
            const [rows] = await pool.query('SELECT * FROM project_milestone_implementations WHERE categoryId = ? AND voided = 0', [categoryId]);
            if (rows.length > 0) {
                res.status(200).json(rows[0]);
            } else {
                res.status(404).json({ message: 'Project category not found' });
            }
        }
    } catch (error) {
        console.error('Error fetching project category:', error);
        res.status(500).json({ message: 'Error fetching project category', error: error.message });
    }
});

/**
 * @route POST /api/metadata/projectcategories/
 * @description Create a new project category.
 * @access Private (requires authentication and privilege)
 */
router.post('/', async (req, res) => {
    const DB_TYPE = process.env.DB_TYPE || 'mysql';
    // TODO: Get userId from authenticated user (e.g., req.user.userId)
    const userId = 1; // Placeholder for now
    const { categoryName, description } = req.body;

    if (!categoryName) {
        return res.status(400).json({ message: 'Missing required field: categoryName' });
    }

    try {
        if (DB_TYPE === 'postgresql') {
            // Get the next categoryId (since there's no sequence)
            const maxIdResult = await pool.query('SELECT COALESCE(MAX("categoryId"), 0) + 1 AS next_id FROM categories');
            const nextCategoryId = maxIdResult.rows[0].next_id;
            
            const query = `
                INSERT INTO categories ("categoryId", "categoryName", description, voided) 
                VALUES ($1, $2, $3, false)
                RETURNING "categoryId"
            `;
            const result = await pool.query(query, [nextCategoryId, categoryName, description || null]);
            res.status(201).json({ message: 'Project category created successfully', categoryId: result.rows[0].categoryId });
        } else {
            const [result] = await pool.query(
                'INSERT INTO project_milestone_implementations (categoryName, description, userId) VALUES (?, ?, ?)',
                [categoryName, description, userId]
            );
            res.status(201).json({ message: 'Project category created successfully', categoryId: result.insertId });
        }
    } catch (error) {
        console.error('Error creating project category:', error);
        res.status(500).json({ message: 'Error creating project category', error: error.message });
    }
});

/**
 * @route PUT /api/metadata/projectcategories/:categoryId
 * @description Update an existing project category by ID.
 * @access Private (requires authentication and privilege)
 */
router.put('/:categoryId', async (req, res) => {
    const DB_TYPE = process.env.DB_TYPE || 'mysql';
    const { categoryId } = req.params;
    const { categoryName, description } = req.body;

    try {
        if (DB_TYPE === 'postgresql') {
            const query = `
                UPDATE categories 
                SET "categoryName" = $1, description = $2 
                WHERE "categoryId" = $3 AND (voided IS NULL OR voided = false)
            `;
            const result = await pool.query(query, [categoryName, description || null, categoryId]);
            if (result.rowCount === 0) {
                return res.status(404).json({ message: 'Project category not found or already deleted' });
            }
            res.status(200).json({ message: 'Project category updated successfully' });
        } else {
            const [result] = await pool.query(
                'UPDATE project_milestone_implementations SET categoryName = ?, description = ?, updatedAt = CURRENT_TIMESTAMP WHERE categoryId = ? AND voided = 0',
                [categoryName, description, categoryId]
            );
            if (result.affectedRows === 0) {
                return res.status(404).json({ message: 'Project category not found or already deleted' });
            }
            res.status(200).json({ message: 'Project category updated successfully' });
        }
    } catch (error) {
        console.error('Error updating project category:', error);
        res.status(500).json({ message: 'Error updating project category', error: error.message });
    }
});

/**
 * @route DELETE /api/metadata/projectcategories/:categoryId
 * @description Soft delete a project category by ID.
 * @access Private (requires authentication and privilege)
 */
router.delete('/:categoryId', async (req, res) => {
    const DB_TYPE = process.env.DB_TYPE || 'mysql';
    const { categoryId } = req.params;
    // TODO: Get userId from authenticated user (e.g., req.user.userId)
    const userId = 1; // Placeholder for now

    try {
        if (DB_TYPE === 'postgresql') {
            const query = `
                UPDATE categories 
                SET voided = true, "voidedBy" = $1 
                WHERE "categoryId" = $2 AND (voided IS NULL OR voided = false)
            `;
            const result = await pool.query(query, [userId?.toString() || null, categoryId]);
            if (result.rowCount === 0) {
                return res.status(404).json({ message: 'Project category not found or already deleted' });
            }
            res.status(200).json({ message: 'Project category soft-deleted successfully' });
        } else {
            const [result] = await pool.query(
                'UPDATE project_milestone_implementations SET voided = 1, voidedBy = ? WHERE categoryId = ? AND voided = 0',
                [userId, categoryId]
            );
            if (result.affectedRows === 0) {
                return res.status(404).json({ message: 'Project category not found or already deleted' });
            }
            res.status(200).json({ message: 'Project category soft-deleted successfully' });
        }
    } catch (error) {
        console.error('Error deleting project category:', error);
        res.status(500).json({ message: 'Error deleting project category', error: error.message });
    }
});

// --- Category Milestones CRUD (Templated Milestones) ---

/**
 * @route GET /api/metadata/projectcategories/:categoryId/milestones
 * @description Get all templated milestones for a specific category.
 * @access Public (can be protected by middleware)
 */
router.get('/:categoryId/milestones', async (req, res) => {
    const DB_TYPE = process.env.DB_TYPE || 'mysql';
    const { categoryId } = req.params;
    try {
        if (DB_TYPE === 'postgresql') {
            const query = `
                SELECT "milestoneId", "categoryId", "milestoneName", description, "sequenceOrder", "unit_of_measure", "achievement_value", "userId", voided, "createdAt", "updatedAt"
                FROM category_milestones 
                WHERE "categoryId" = $1 AND voided = false 
                ORDER BY "sequenceOrder"
            `;
            const result = await pool.query(query, [categoryId]);
            res.status(200).json(result.rows);
        } else {
            const [rows] = await pool.query(
                'SELECT * FROM category_milestones WHERE categoryId = ? AND voided = 0 ORDER BY sequenceOrder',
                [categoryId]
            );
            res.status(200).json(rows);
        }
    } catch (error) {
        console.error(`Error fetching milestones for category ${categoryId}:`, error);
        res.status(500).json({ message: 'Error fetching category milestones', error: error.message });
    }
});

/**
 * @route POST /api/metadata/projectcategories/:categoryId/milestones
 * @description Add a new templated milestone to a category.
 * @access Private (requires authentication and privilege)
 */
router.post('/:categoryId/milestones', async (req, res) => {
    const DB_TYPE = process.env.DB_TYPE || 'mysql';
    const { categoryId } = req.params;
    const { milestoneName, description, sequenceOrder, unitOfMeasure, achievementValue } = req.body;
    // TODO: Get userId from authenticated user (e.g., req.user.userId)
    const userId = 1; // Placeholder for now

    if (!milestoneName || !sequenceOrder) {
        return res.status(400).json({ message: 'Missing required fields: milestoneName, sequenceOrder' });
    }

    try {
        if (DB_TYPE === 'postgresql') {
            // Get the next milestoneId (since there's no sequence)
            const maxIdResult = await pool.query('SELECT COALESCE(MAX("milestoneId"), 0) + 1 AS next_id FROM category_milestones');
            const nextMilestoneId = maxIdResult.rows[0].next_id;
            
            const query = `
                INSERT INTO category_milestones ("milestoneId", "categoryId", "milestoneName", description, "sequenceOrder", "unit_of_measure", "achievement_value", "userId") 
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                RETURNING "milestoneId"
            `;
            const result = await pool.query(query, [nextMilestoneId, categoryId, milestoneName, description || null, sequenceOrder, unitOfMeasure || null, achievementValue ? parseFloat(achievementValue) : null, userId]);
            res.status(201).json({ message: 'Milestone template created successfully', milestoneId: result.rows[0].milestoneId });
        } else {
            const [result] = await pool.query(
                'INSERT INTO category_milestones (categoryId, milestoneName, description, sequenceOrder, unit_of_measure, achievement_value, userId) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [categoryId, milestoneName, description, sequenceOrder, unitOfMeasure || null, achievementValue ? parseFloat(achievementValue) : null, userId]
            );
            res.status(201).json({ message: 'Milestone template created successfully', milestoneId: result.insertId });
        }
    } catch (error) {
        console.error('Error creating milestone template:', error);
        res.status(500).json({ message: 'Error creating milestone template', error: error.message });
    }
});

/**
 * @route PUT /api/metadata/projectcategories/:categoryId/milestones/:milestoneId
 * @description Update a templated milestone.
 * @access Private (requires authentication and privilege)
 */
router.put('/:categoryId/milestones/:milestoneId', async (req, res) => {
    const DB_TYPE = process.env.DB_TYPE || 'mysql';
    const { milestoneId } = req.params;
    const { milestoneName, description, sequenceOrder, unitOfMeasure, achievementValue } = req.body;
    try {
        if (DB_TYPE === 'postgresql') {
            const query = `
                UPDATE category_milestones 
                SET "milestoneName" = $1, description = $2, "sequenceOrder" = $3, "unit_of_measure" = $4, "achievement_value" = $5, "updatedAt" = CURRENT_TIMESTAMP 
                WHERE "milestoneId" = $6 AND voided = false
            `;
            const result = await pool.query(query, [milestoneName, description || null, sequenceOrder, unitOfMeasure || null, achievementValue ? parseFloat(achievementValue) : null, milestoneId]);
            if (result.rowCount === 0) {
                return res.status(404).json({ message: 'Milestone template not found or already deleted' });
            }
            res.status(200).json({ message: 'Milestone template updated successfully' });
        } else {
            const [result] = await pool.query(
                'UPDATE category_milestones SET milestoneName = ?, description = ?, sequenceOrder = ?, unit_of_measure = ?, achievement_value = ?, updatedAt = CURRENT_TIMESTAMP WHERE milestoneId = ? AND voided = 0',
                [milestoneName, description, sequenceOrder, unitOfMeasure || null, achievementValue ? parseFloat(achievementValue) : null, milestoneId]
            );
            if (result.affectedRows === 0) {
                return res.status(404).json({ message: 'Milestone template not found or already deleted' });
            }
            res.status(200).json({ message: 'Milestone template updated successfully' });
        }
    } catch (error) {
        console.error('Error updating milestone template:', error);
        res.status(500).json({ message: 'Error updating milestone template', error: error.message });
    }
});

/**
 * @route DELETE /api/metadata/projectcategories/:categoryId/milestones/:milestoneId
 * @description Soft delete a templated milestone.
 * @access Private (requires authentication and privilege)
 */
router.delete('/:categoryId/milestones/:milestoneId', async (req, res) => {
    const DB_TYPE = process.env.DB_TYPE || 'mysql';
    const { milestoneId } = req.params;
    // TODO: Get userId from authenticated user (e.g., req.user.userId)
    const userId = 1; // Placeholder for now

    try {
        if (DB_TYPE === 'postgresql') {
            const result = await pool.query(
                'UPDATE category_milestones SET voided = true, "voidedBy" = $1, "updatedAt" = CURRENT_TIMESTAMP WHERE "milestoneId" = $2 AND voided = false',
                [String(userId), milestoneId]
            );
            if (result.rowCount === 0) {
                return res.status(404).json({ message: 'Milestone template not found or already deleted' });
            }
        } else {
            const [result] = await pool.query(
                'UPDATE category_milestones SET voided = 1, voidedBy = ? WHERE milestoneId = ? AND voided = 0',
                [userId, milestoneId]
            );
            if (result.affectedRows === 0) {
                return res.status(404).json({ message: 'Milestone template not found or already deleted' });
            }
        }
        res.status(200).json({ message: 'Milestone template soft-deleted successfully' });
    } catch (error) {
        console.error('Error deleting milestone template:', error);
        res.status(500).json({ message: 'Error deleting milestone template', error: error.message });
    }
});

// --- Category BQ Template CRUD ---

router.get('/:categoryId/bq-templates', async (req, res) => {
    const DB_TYPE = process.env.DB_TYPE || 'mysql';
    const { categoryId } = req.params;
    try {
        await ensureCategoryBqTemplateTable(DB_TYPE);
        if (DB_TYPE === 'postgresql') {
            const result = await pool.query(
                `SELECT
                    b.id AS "templateId",
                    b.category_id AS "categoryId",
                    b.milestone_id AS "milestoneId",
                    cm."milestoneName" AS "milestoneName",
                    b.activity_name AS "activityName",
                    b.description,
                    b.unit_of_measure AS "unitOfMeasure",
                    b.quantity,
                    b.unit_cost AS "unitCost",
                    b.budget_amount AS "budgetAmount",
                    b.sort_order AS "sortOrder",
                    b.created_at AS "createdAt",
                    b.updated_at AS "updatedAt"
                 FROM category_bq_templates b
                 LEFT JOIN category_milestones cm
                   ON cm."milestoneId" = b.milestone_id
                  AND COALESCE(cm.voided, false) = false
                 WHERE b.category_id = $1 AND COALESCE(b.voided, false) = false
                 ORDER BY b.sort_order ASC, b.id ASC`,
                [categoryId]
            );
            return res.status(200).json(result.rows || []);
        }

        const [rows] = await pool.query(
            `SELECT
                b.id AS templateId,
                b.category_id AS categoryId,
                b.milestone_id AS milestoneId,
                cm.milestoneName AS milestoneName,
                b.activity_name AS activityName,
                b.description,
                b.unit_of_measure AS unitOfMeasure,
                b.quantity,
                b.unit_cost AS unitCost,
                b.budget_amount AS budgetAmount,
                b.sort_order AS sortOrder,
                b.created_at AS createdAt,
                b.updated_at AS updatedAt
             FROM category_bq_templates b
             LEFT JOIN category_milestones cm
               ON cm.milestoneId = b.milestone_id
              AND COALESCE(cm.voided, 0) = 0
             WHERE b.category_id = ? AND COALESCE(b.voided, 0) = 0
             ORDER BY b.sort_order ASC, b.id ASC`,
            [categoryId]
        );
        return res.status(200).json(rows || []);
    } catch (error) {
        console.error(`Error fetching BQ templates for category ${categoryId}:`, error);
        return res.status(500).json({ message: 'Error fetching category BQ templates', error: error.message });
    }
});

router.post('/:categoryId/bq-templates', async (req, res) => {
    const DB_TYPE = process.env.DB_TYPE || 'mysql';
    const { categoryId } = req.params;
    const parsed = parseBqTemplatePayload(req.body);
    if (parsed.error) {
        return res.status(400).json({ message: parsed.error });
    }
    const p = parsed.value;

    try {
        await ensureCategoryBqTemplateTable(DB_TYPE);
        if (DB_TYPE === 'postgresql') {
            const result = await pool.query(
                `INSERT INTO category_bq_templates (
                    category_id, milestone_id, activity_name, description, unit_of_measure,
                    quantity, unit_cost, budget_amount, sort_order, created_at, updated_at, voided
                ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,false)
                RETURNING id AS "templateId"`,
                [categoryId, p.milestoneId, p.activityName, p.description, p.unitOfMeasure, p.quantity, p.unitCost, p.budgetAmount, p.sortOrder]
            );
            return res.status(201).json({ message: 'BQ template created successfully', templateId: result.rows?.[0]?.templateId });
        }

        const [result] = await pool.query(
            `INSERT INTO category_bq_templates (
                category_id, milestone_id, activity_name, description, unit_of_measure,
                quantity, unit_cost, budget_amount, sort_order
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [categoryId, p.milestoneId, p.activityName, p.description, p.unitOfMeasure, p.quantity, p.unitCost, p.budgetAmount, p.sortOrder]
        );
        return res.status(201).json({ message: 'BQ template created successfully', templateId: result.insertId });
    } catch (error) {
        console.error('Error creating BQ template:', error);
        return res.status(500).json({ message: 'Error creating BQ template', error: error.message });
    }
});

router.put('/:categoryId/bq-templates/:templateId', async (req, res) => {
    const DB_TYPE = process.env.DB_TYPE || 'mysql';
    const { categoryId, templateId } = req.params;
    const parsed = parseBqTemplatePayload(req.body);
    if (parsed.error) {
        return res.status(400).json({ message: parsed.error });
    }
    const p = parsed.value;

    try {
        await ensureCategoryBqTemplateTable(DB_TYPE);
        if (DB_TYPE === 'postgresql') {
            const result = await pool.query(
                `UPDATE category_bq_templates
                 SET milestone_id = $1,
                     activity_name = $2,
                     description = $3,
                     unit_of_measure = $4,
                     quantity = $5,
                     unit_cost = $6,
                     budget_amount = $7,
                     sort_order = $8,
                     updated_at = CURRENT_TIMESTAMP
                 WHERE id = $9 AND category_id = $10 AND COALESCE(voided, false) = false`,
                [p.milestoneId, p.activityName, p.description, p.unitOfMeasure, p.quantity, p.unitCost, p.budgetAmount, p.sortOrder, templateId, categoryId]
            );
            if (result.rowCount === 0) {
                return res.status(404).json({ message: 'BQ template not found or already deleted' });
            }
            return res.status(200).json({ message: 'BQ template updated successfully' });
        }

        const [result] = await pool.query(
            `UPDATE category_bq_templates
             SET milestone_id = ?, activity_name = ?, description = ?, unit_of_measure = ?,
                 quantity = ?, unit_cost = ?, budget_amount = ?, sort_order = ?, updated_at = CURRENT_TIMESTAMP
             WHERE id = ? AND category_id = ? AND COALESCE(voided, 0) = 0`,
            [p.milestoneId, p.activityName, p.description, p.unitOfMeasure, p.quantity, p.unitCost, p.budgetAmount, p.sortOrder, templateId, categoryId]
        );
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'BQ template not found or already deleted' });
        }
        return res.status(200).json({ message: 'BQ template updated successfully' });
    } catch (error) {
        console.error('Error updating BQ template:', error);
        return res.status(500).json({ message: 'Error updating BQ template', error: error.message });
    }
});

router.delete('/:categoryId/bq-templates/:templateId', async (req, res) => {
    const DB_TYPE = process.env.DB_TYPE || 'mysql';
    const { categoryId, templateId } = req.params;
    try {
        await ensureCategoryBqTemplateTable(DB_TYPE);
        if (DB_TYPE === 'postgresql') {
            const result = await pool.query(
                `UPDATE category_bq_templates
                 SET voided = true, updated_at = CURRENT_TIMESTAMP
                 WHERE id = $1 AND category_id = $2 AND COALESCE(voided, false) = false`,
                [templateId, categoryId]
            );
            if (result.rowCount === 0) {
                return res.status(404).json({ message: 'BQ template not found or already deleted' });
            }
            return res.status(200).json({ message: 'BQ template deleted successfully' });
        }

        const [result] = await pool.query(
            `UPDATE category_bq_templates
             SET voided = 1, updated_at = CURRENT_TIMESTAMP
             WHERE id = ? AND category_id = ? AND COALESCE(voided, 0) = 0`,
            [templateId, categoryId]
        );
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'BQ template not found or already deleted' });
        }
        return res.status(200).json({ message: 'BQ template deleted successfully' });
    } catch (error) {
        console.error('Error deleting BQ template:', error);
        return res.status(500).json({ message: 'Error deleting BQ template', error: error.message });
    }
});

module.exports = router;