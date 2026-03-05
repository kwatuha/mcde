const express = require('express');
const router = express.Router();
const pool = require('../config/db');

/**
 * @route GET /api/sectors
 * @description Get all sectors that are not voided
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
                    name AS "sectorName",
                    description,
                    created_at AS "createdAt",
                    updated_at AS "updatedAt",
                    voided
                FROM sectors
                WHERE voided = false
                ORDER BY name
            `;
        } else {
            query = `
                SELECT 
                    id,
                    name AS sectorName,
                    description,
                    createdAt,
                    updatedAt,
                    voided
                FROM sectors
                WHERE voided = 0
                ORDER BY name
            `;
        }
        
        const result = await pool.query(query);
        const sectors = DB_TYPE === 'postgresql' ? (result.rows || result) : (Array.isArray(result) ? result[0] : result);
        
        res.status(200).json(Array.isArray(sectors) ? sectors : []);
    } catch (error) {
        console.error('Error fetching sectors:', error);
        res.status(500).json({ message: 'Error fetching sectors', error: error.message });
    }
});

/**
 * @route GET /api/sectors/:id
 * @description Get a single sector by ID
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
                    name AS "sectorName",
                    description,
                    created_at AS "createdAt",
                    updated_at AS "updatedAt",
                    voided
                FROM sectors
                WHERE id = $1 AND voided = false
            `;
        } else {
            query = `
                SELECT 
                    id,
                    name AS sectorName,
                    description,
                    createdAt,
                    updatedAt,
                    voided
                FROM sectors
                WHERE id = ? AND voided = 0
            `;
        }
        
        const result = await pool.query(query, [id]);
        const sector = DB_TYPE === 'postgresql' 
            ? (result.rows?.[0] || null)
            : (Array.isArray(result) ? result[0]?.[0] : result);
        
        if (sector) {
            res.status(200).json(sector);
        } else {
            res.status(404).json({ message: 'Sector not found' });
        }
    } catch (error) {
        console.error('Error fetching sector:', error);
        res.status(500).json({ message: 'Error fetching sector', error: error.message });
    }
});

/**
 * @route POST /api/sectors
 * @description Create a new sector
 * @access Private
 */
router.post('/', async (req, res) => {
    const DB_TYPE = process.env.DB_TYPE || 'postgresql';
    const { sectorName, description } = req.body;
    
    if (!sectorName || !sectorName.trim()) {
        return res.status(400).json({ message: 'Sector name is required' });
    }
    
    try {
        let query, params;
        if (DB_TYPE === 'postgresql') {
            query = `
                INSERT INTO sectors (name, description, voided)
                VALUES ($1, $2, false)
                RETURNING id, name AS "sectorName", description, created_at AS "createdAt", updated_at AS "updatedAt", voided
            `;
            params = [sectorName.trim(), description?.trim() || null];
        } else {
            query = `
                INSERT INTO sectors (name, description, voided)
                VALUES (?, ?, 0)
            `;
            params = [sectorName.trim(), description?.trim() || null];
        }
        
        const result = await pool.query(query, params);
        
        if (DB_TYPE === 'postgresql') {
            res.status(201).json({
                message: 'Sector created successfully',
                sector: result.rows[0]
            });
        } else {
            const newSector = {
                id: result.insertId,
                sectorName: sectorName.trim(),
                description: description?.trim() || null,
                voided: false
            };
            res.status(201).json({
                message: 'Sector created successfully',
                sector: newSector
            });
        }
    } catch (error) {
        console.error('Error creating sector:', error);
        
        // Handle duplicate key error
        if (error.code === '23505' || error.message.includes('duplicate') || error.message.includes('UNIQUE')) {
            return res.status(400).json({ message: 'A sector with this name already exists' });
        }
        
        res.status(500).json({ message: 'Error creating sector', error: error.message });
    }
});

/**
 * @route PUT /api/sectors/:id
 * @description Update an existing sector
 * @access Private
 */
router.put('/:id', async (req, res) => {
    const { id } = req.params;
    const DB_TYPE = process.env.DB_TYPE || 'postgresql';
    const { sectorName, description } = req.body;
    
    if (!sectorName || !sectorName.trim()) {
        return res.status(400).json({ message: 'Sector name is required' });
    }
    
    try {
        let query, params;
        if (DB_TYPE === 'postgresql') {
            query = `
                UPDATE sectors
                SET name = $1, description = $2, updated_at = CURRENT_TIMESTAMP
                WHERE id = $3 AND voided = false
                RETURNING id, name AS "sectorName", description, created_at AS "createdAt", updated_at AS "updatedAt", voided
            `;
            params = [sectorName.trim(), description?.trim() || null, id];
        } else {
            query = `
                UPDATE sectors
                SET name = ?, description = ?, updatedAt = CURRENT_TIMESTAMP
                WHERE id = ? AND voided = 0
            `;
            params = [sectorName.trim(), description?.trim() || null, id];
        }
        
        const result = await pool.query(query, params);
        
        if (DB_TYPE === 'postgresql') {
            if (result.rows.length === 0) {
                return res.status(404).json({ message: 'Sector not found' });
            }
            res.status(200).json({
                message: 'Sector updated successfully',
                sector: result.rows[0]
            });
        } else {
            if (result.affectedRows === 0) {
                return res.status(404).json({ message: 'Sector not found' });
            }
            // Fetch updated sector
            const [updated] = await pool.query(
                'SELECT id, name AS sectorName, description, createdAt, updatedAt, voided FROM sectors WHERE id = ?',
                [id]
            );
            res.status(200).json({
                message: 'Sector updated successfully',
                sector: updated[0]
            });
        }
    } catch (error) {
        console.error('Error updating sector:', error);
        
        // Handle duplicate key error
        if (error.code === '23505' || error.message.includes('duplicate') || error.message.includes('UNIQUE')) {
            return res.status(400).json({ message: 'A sector with this name already exists' });
        }
        
        res.status(500).json({ message: 'Error updating sector', error: error.message });
    }
});

/**
 * @route DELETE /api/sectors/:id
 * @description Soft delete a sector (set voided = true)
 * @access Private
 */
router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    const DB_TYPE = process.env.DB_TYPE || 'postgresql';
    
    try {
        let query;
        if (DB_TYPE === 'postgresql') {
            query = `
                UPDATE sectors
                SET voided = true, updated_at = CURRENT_TIMESTAMP
                WHERE id = $1 AND voided = false
                RETURNING id
            `;
        } else {
            query = `
                UPDATE sectors
                SET voided = 1, updatedAt = CURRENT_TIMESTAMP
                WHERE id = ? AND voided = 0
            `;
        }
        
        const result = await pool.query(query, [id]);
        
        const affectedRows = DB_TYPE === 'postgresql' ? result.rows.length : result.affectedRows;
        
        if (affectedRows === 0) {
            return res.status(404).json({ message: 'Sector not found' });
        }
        
        res.status(200).json({ message: 'Sector deleted successfully' });
    } catch (error) {
        console.error('Error deleting sector:', error);
        res.status(500).json({ message: 'Error deleting sector', error: error.message });
    }
});

module.exports = router;
