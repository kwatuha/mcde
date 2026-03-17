// src/routes/metadata/programRoutes.js

const express = require('express');
const router = express.Router();
const pool = require('../../config/db'); // Correct path for the new folder structure

const DB_TYPE = process.env.DB_TYPE || 'mysql';

// Helper to get voided condition
const getVoidedCondition = () => DB_TYPE === 'postgresql' ? 'voided = false' : 'voided = 0';

// Helper to quote column names for PostgreSQL
const quoteColumn = (col) => DB_TYPE === 'postgresql' ? `"${col}"` : col;

// --- Programs CRUD ---

/**
 * @route GET /api/metadata/programs/
 * @description Get all programs that are not soft-deleted.
 * @access Public (can be protected by middleware)
 */
/* SCOPE_DOWN: programs table may be removed. Return [] on error so /projects page still loads. Re-enable normal response when restoring. */
router.get('/', async (req, res) => {
    try {
        const query = DB_TYPE === 'postgresql'
            ? `SELECT "programId", programme, "createdAt", "updatedAt", "userId" FROM programs WHERE ${getVoidedCondition()}`
            : `SELECT programId, programme, createdAt, updatedAt, userId FROM programs WHERE ${getVoidedCondition()}`;
        
        const result = await pool.query(query);
        const rows = DB_TYPE === 'postgresql' ? result.rows : result[0];
        res.status(200).json(rows);
    } catch (error) {
        console.warn('Programs fetch failed (table may be removed for scope-down):', error.message);
        res.status(200).json([]);
    }
});

/**
 * @route POST /api/metadata/programs/
 * @description Create a new program.
 * @access Private (requires authentication and privilege)
 */
router.post('/', async (req, res) => {
    // TODO: Get userId from authenticated user (e.g., req.user.userId)
    const userId = 1; // Placeholder for now
    const { programme, remarks } = req.body;

    if (!programme) {
        return res.status(400).json({ message: 'Missing required field: programme' });
    }

    try {
        const query = DB_TYPE === 'postgresql'
            ? `INSERT INTO programs (programme, remarks, "userId") VALUES ($1, $2, $3) RETURNING "programId"`
            : 'INSERT INTO programs (programme, remarks, userId) VALUES (?, ?, ?)';
        
        const result = await pool.query(query, [programme, remarks, userId]);
        const programId = DB_TYPE === 'postgresql' 
            ? result.rows[0].programId 
            : result.insertId || result[0].insertId;
        
        res.status(201).json({ message: 'Program created successfully', programId });
    } catch (error) {
        console.error('Error creating program:', error);
        res.status(500).json({ message: 'Error creating program', error: error.message });
    }
});

/**
 * @route PUT /api/metadata/programs/:programId
 * @description Update an existing program by programId.
 * @access Private (requires authentication and privilege)
 */
router.put('/:programId', async (req, res) => {
    const { programId } = req.params;
    const { programme, remarks } = req.body;

    try {
        const query = DB_TYPE === 'postgresql'
            ? `UPDATE programs SET programme = $1, remarks = $2, "updatedAt" = CURRENT_TIMESTAMP WHERE "programId" = $3 AND ${getVoidedCondition()}`
            : `UPDATE programs SET programme = ?, remarks = ?, updatedAt = CURRENT_TIMESTAMP WHERE programId = ? AND ${getVoidedCondition()}`;
        
        const result = await pool.query(query, [programme, remarks, programId]);
        const affectedRows = DB_TYPE === 'postgresql' ? result.rowCount : (result.affectedRows || result[0].affectedRows);
        
        if (affectedRows === 0) {
            return res.status(404).json({ message: 'Program not found or already deleted' });
        }
        res.status(200).json({ message: 'Program updated successfully' });
    } catch (error) {
        console.error('Error updating program:', error);
        res.status(500).json({ message: 'Error updating program', error: error.message });
    }
});

/**
 * @route DELETE /api/metadata/programs/:programId
 * @description Soft delete a program by programId.
 * @access Private (requires authentication and privilege)
 */
router.delete('/:programId', async (req, res) => {
    const { programId } = req.params;
    // TODO: Get userId from authenticated user (e.g., req.user.userId)
    const userId = 1; // Placeholder for now

    try {
        const voidedValue = DB_TYPE === 'postgresql' ? 'true' : '1';
        const query = DB_TYPE === 'postgresql'
            ? `UPDATE programs SET voided = ${voidedValue}, "voidedBy" = $1 WHERE "programId" = $2 AND ${getVoidedCondition()}`
            : `UPDATE programs SET voided = ${voidedValue}, voidedBy = ? WHERE programId = ? AND ${getVoidedCondition()}`;
        
        const result = await pool.query(query, [userId, programId]);
        const affectedRows = DB_TYPE === 'postgresql' ? result.rowCount : (result.affectedRows || result[0].affectedRows);
        
        if (affectedRows === 0) {
            return res.status(404).json({ message: 'Program not found or already deleted' });
        }
        res.status(200).json({ message: 'Program soft-deleted successfully' });
    } catch (error) {
        console.error('Error deleting program:', error);
        res.status(500).json({ message: 'Error deleting program', error: error.message });
    }
});


// --- Sub-Programs CRUD ---

/**
 * @route GET /api/metadata/programs/:programId/subprograms
 * @description Get all sub-programs belonging to a specific program.
 * @access Public (can be protected by middleware)
 */
/* SCOPE_DOWN: subprograms table may be removed. Return [] on error. */
router.get('/:programId/subprograms', async (req, res) => {
    const { programId } = req.params;
    try {
        const [rows] = await pool.query(
            'SELECT subProgramId, subProgramme FROM subprograms WHERE programId = ? AND voided = 0',
            [programId]
        );
        res.status(200).json(rows);
    } catch (error) {
        console.warn(`Subprograms fetch failed for program ${programId} (table may be removed for scope-down):`, error.message);
        res.status(200).json([]);
    }
});

/**
 * @route POST /api/metadata/programs/subprograms
 * @description Create a new sub-program.
 * @access Private (requires authentication and privilege)
 */
router.post('/subprograms', async (req, res) => {
    // TODO: Get userId from authenticated user (e.g., req.user.userId)
    const userId = 1; // Placeholder for now
    const { programId, subProgramme, remarks } = req.body;

    if (!programId || !subProgramme) {
        return res.status(400).json({ message: 'Missing required fields: programId, subProgramme' });
    }

    try {
        const [result] = await pool.query(
            'INSERT INTO subprograms (programId, subProgramme, remarks, userId) VALUES (?, ?, ?, ?)',
            [programId, subProgramme, remarks, userId]
        );
        res.status(201).json({ message: 'Sub-program created successfully', subProgramId: result.insertId });
    } catch (error) {
        console.error('Error creating sub-program:', error);
        res.status(500).json({ message: 'Error creating sub-program', error: error.message });
    }
});

/**
 * @route PUT /api/metadata/programs/subprograms/:subProgramId
 * @description Update an existing sub-program by subProgramId.
 * @access Private (requires authentication and privilege)
 */
router.put('/subprograms/:subProgramId', async (req, res) => {
    const { subProgramId } = req.params;
    const { programId, subProgramme, remarks } = req.body;

    try {
        const [result] = await pool.query(
            'UPDATE subprograms SET programId = ?, subProgramme = ?, remarks = ?, updatedAt = CURRENT_TIMESTAMP WHERE subProgramId = ? AND voided = 0',
            [programId, subProgramme, remarks, subProgramId]
        );
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Sub-program not found or already deleted' });
        }
        res.status(200).json({ message: 'Sub-program updated successfully' });
    } catch (error) {
        console.error('Error updating sub-program:', error);
        res.status(500).json({ message: 'Error updating sub-program', error: error.message });
    }
});

/**
 * @route DELETE /api/metadata/programs/subprograms/:subProgramId
 * @description Soft delete a sub-program by subProgramId.
 * @access Private (requires authentication and privilege)
 */
router.delete('/subprograms/:subProgramId', async (req, res) => {
    const { subProgramId } = req.params;
    // TODO: Get userId from authenticated user (e.g., req.user.userId)
    const userId = 1; // Placeholder for now

    try {
        const [result] = await pool.query(
            'UPDATE subprograms SET voided = 1, voidedBy = ? WHERE subProgramId = ? AND voided = 0',
            [userId, subProgramId]
        );
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Sub-program not found or already deleted' });
        }
        res.status(200).json({ message: 'Sub-program soft-deleted successfully' });
    } catch (error) {
        console.error('Error deleting sub-program:', error);
        res.status(500).json({ message: 'Error deleting sub-program', error: error.message });
    }
});

module.exports = router;