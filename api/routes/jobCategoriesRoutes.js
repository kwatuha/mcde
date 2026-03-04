const express = require('express');
const router = express.Router();
const pool = require('../config/db');

/**
 * @route GET /api/job-categories
 * @description Get all job categories that are not voided
 * @access Private
 */
router.get('/', async (req, res) => {
    const DB_TYPE = process.env.DB_TYPE || 'postgresql';
    
    try {
        let query;
        if (DB_TYPE === 'postgresql') {
            query = `
                SELECT 
                    id,
                    name AS "jobCategory",
                    description,
                    created_at AS "createdAt",
                    updated_at AS "updatedAt",
                    voided
                FROM job_categories
                WHERE voided = false
                ORDER BY name
            `;
        } else {
            query = `
                SELECT 
                    id,
                    name AS jobCategory,
                    description,
                    createdAt,
                    updatedAt,
                    voided
                FROM job_categories
                WHERE voided = 0
                ORDER BY name
            `;
        }
        
        const result = await pool.query(query);
        const categories = DB_TYPE === 'postgresql' ? (result.rows || result) : (Array.isArray(result) ? result[0] : result);
        
        res.status(200).json(Array.isArray(categories) ? categories : []);
    } catch (error) {
        console.error('Error fetching job categories:', error);
        res.status(500).json({ message: 'Error fetching job categories', error: error.message });
    }
});

/**
 * @route GET /api/job-categories/:id
 * @description Get a single job category by ID
 * @access Private
 */
router.get('/:id', async (req, res) => {
    const { id } = req.params;
    const DB_TYPE = process.env.DB_TYPE || 'postgresql';
    
    try {
        let query;
        if (DB_TYPE === 'postgresql') {
            query = `
                SELECT 
                    id,
                    name AS "jobCategory",
                    description,
                    created_at AS "createdAt",
                    updated_at AS "updatedAt",
                    voided
                FROM job_categories
                WHERE id = $1 AND voided = false
            `;
        } else {
            query = `
                SELECT 
                    id,
                    name AS jobCategory,
                    description,
                    createdAt,
                    updatedAt,
                    voided
                FROM job_categories
                WHERE id = ? AND voided = 0
            `;
        }
        
        const result = await pool.query(query, [id]);
        const category = DB_TYPE === 'postgresql' 
            ? (result.rows?.[0] || null)
            : (Array.isArray(result) ? result[0]?.[0] : result);
        
        if (category) {
            res.status(200).json(category);
        } else {
            res.status(404).json({ message: 'Job category not found' });
        }
    } catch (error) {
        console.error('Error fetching job category:', error);
        res.status(500).json({ message: 'Error fetching job category', error: error.message });
    }
});

/**
 * @route POST /api/job-categories
 * @description Create a new job category
 * @access Private
 */
router.post('/', async (req, res) => {
    const DB_TYPE = process.env.DB_TYPE || 'postgresql';
    const { jobCategory, description } = req.body;
    
    if (!jobCategory || !jobCategory.trim()) {
        return res.status(400).json({ message: 'Job category name is required' });
    }
    
    try {
        let query, params;
        if (DB_TYPE === 'postgresql') {
            query = `
                INSERT INTO job_categories (name, description, voided)
                VALUES ($1, $2, false)
                RETURNING id, name AS "jobCategory", description, created_at AS "createdAt", updated_at AS "updatedAt", voided
            `;
            params = [jobCategory.trim(), description?.trim() || null];
        } else {
            query = `
                INSERT INTO job_categories (name, description, voided)
                VALUES (?, ?, 0)
            `;
            params = [jobCategory.trim(), description?.trim() || null];
        }
        
        const result = await pool.query(query, params);
        
        if (DB_TYPE === 'postgresql') {
            res.status(201).json({
                message: 'Job category created successfully',
                category: result.rows[0]
            });
        } else {
            const newCategory = {
                id: result.insertId,
                jobCategory: jobCategory.trim(),
                description: description?.trim() || null,
                voided: false
            };
            res.status(201).json({
                message: 'Job category created successfully',
                category: newCategory
            });
        }
    } catch (error) {
        console.error('Error creating job category:', error);
        
        // Handle duplicate key error
        if (error.code === '23505' || error.message.includes('duplicate') || error.message.includes('UNIQUE')) {
            return res.status(400).json({ message: 'A job category with this name already exists' });
        }
        
        res.status(500).json({ message: 'Error creating job category', error: error.message });
    }
});

/**
 * @route PUT /api/job-categories/:id
 * @description Update an existing job category
 * @access Private
 */
router.put('/:id', async (req, res) => {
    const { id } = req.params;
    const DB_TYPE = process.env.DB_TYPE || 'postgresql';
    const { jobCategory, description } = req.body;
    
    if (!jobCategory || !jobCategory.trim()) {
        return res.status(400).json({ message: 'Job category name is required' });
    }
    
    try {
        let query, params;
        if (DB_TYPE === 'postgresql') {
            query = `
                UPDATE job_categories
                SET name = $1, description = $2, updated_at = CURRENT_TIMESTAMP
                WHERE id = $3 AND voided = false
                RETURNING id, name AS "jobCategory", description, created_at AS "createdAt", updated_at AS "updatedAt", voided
            `;
            params = [jobCategory.trim(), description?.trim() || null, id];
        } else {
            query = `
                UPDATE job_categories
                SET name = ?, description = ?, updatedAt = CURRENT_TIMESTAMP
                WHERE id = ? AND voided = 0
            `;
            params = [jobCategory.trim(), description?.trim() || null, id];
        }
        
        const result = await pool.query(query, params);
        
        if (DB_TYPE === 'postgresql') {
            if (result.rows.length === 0) {
                return res.status(404).json({ message: 'Job category not found' });
            }
            res.status(200).json({
                message: 'Job category updated successfully',
                category: result.rows[0]
            });
        } else {
            if (result.affectedRows === 0) {
                return res.status(404).json({ message: 'Job category not found' });
            }
            // Fetch updated category
            const [updated] = await pool.query(
                'SELECT id, name AS jobCategory, description, createdAt, updatedAt, voided FROM job_categories WHERE id = ?',
                [id]
            );
            res.status(200).json({
                message: 'Job category updated successfully',
                category: updated[0]
            });
        }
    } catch (error) {
        console.error('Error updating job category:', error);
        
        // Handle duplicate key error
        if (error.code === '23505' || error.message.includes('duplicate') || error.message.includes('UNIQUE')) {
            return res.status(400).json({ message: 'A job category with this name already exists' });
        }
        
        res.status(500).json({ message: 'Error updating job category', error: error.message });
    }
});

/**
 * @route DELETE /api/job-categories/:id
 * @description Soft delete a job category (set voided = true)
 * @access Private
 */
router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    const DB_TYPE = process.env.DB_TYPE || 'postgresql';
    
    try {
        let query;
        if (DB_TYPE === 'postgresql') {
            query = `
                UPDATE job_categories
                SET voided = true, updated_at = CURRENT_TIMESTAMP
                WHERE id = $1 AND voided = false
                RETURNING id
            `;
        } else {
            query = `
                UPDATE job_categories
                SET voided = 1, updatedAt = CURRENT_TIMESTAMP
                WHERE id = ? AND voided = 0
            `;
        }
        
        const result = await pool.query(query, [id]);
        
        const affectedRows = DB_TYPE === 'postgresql' ? result.rows.length : result.affectedRows;
        
        if (affectedRows === 0) {
            return res.status(404).json({ message: 'Job category not found' });
        }
        
        res.status(200).json({ message: 'Job category deleted successfully' });
    } catch (error) {
        console.error('Error deleting job category:', error);
        res.status(500).json({ message: 'Error deleting job category', error: error.message });
    }
});

module.exports = router;
