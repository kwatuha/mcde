// src/routes/metadata/financialYearRoutes.js

const express = require('express');
const router = express.Router();
const pool = require('../../config/db'); // Correct path for the new folder structure

/**
 * Normalize financial year name for comparison
 * Removes "FY" prefix (case-insensitive), trims whitespace, and converts to uppercase
 * Examples: "FY2025/2026" -> "2025/2026", "fy2024/2025" -> "2024/2025", " 2025/2026 " -> "2025/2026"
 */
function normalizeFinancialYearName(name) {
    if (!name) return '';
    // Remove "FY" prefix (case-insensitive) and trim whitespace
    let normalized = name.trim().replace(/^fy\s*/i, '');
    // Remove any leading/trailing whitespace and convert to uppercase for consistent comparison
    return normalized.trim().toUpperCase();
}

// --- Financial Years CRUD ---

/**
 * @route GET /api/metadata/financialyears/
 * @description Get all financial years that are not soft-deleted.
 * @access Public (can be protected by middleware)
 */
router.get('/', async (req, res) => {
    try {
        const DB_TYPE = process.env.DB_TYPE || 'mysql';
        const isPostgres = DB_TYPE === 'postgresql';
        let query;
        
        if (DB_TYPE === 'postgresql') {
            query = `
                SELECT 
                    "finYearId", 
                    "finYearName", 
                    "startDate", 
                    "endDate", 
                    "createdAt", 
                    "updatedAt", 
                    "userId" 
                FROM financialyears 
                WHERE (voided = false OR voided IS NULL)
                ORDER BY "startDate" DESC, "finYearName" DESC
            `;
        } else {
            query = `
                SELECT 
                    finYearId, 
                    finYearName, 
                    startDate, 
                    endDate, 
                    createdAt, 
                    updatedAt, 
                    userId 
                FROM financialyears 
                WHERE (voided = 0 OR voided IS NULL)
                ORDER BY startDate DESC, finYearName DESC
            `;
        }
        
        let result = await pool.query(query);
        let allRows = isPostgres ? (result.rows || []) : (Array.isArray(result) ? (result[0] || []) : (result || []));

        if (!allRows.length) {
            const now = new Date();
            const startYear = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
            const fyName = `${startYear}/${startYear + 1}`;
            const startDate = `${startYear}-07-01`;
            const endDate = `${startYear + 1}-06-30`;

            await pool.query(
                'INSERT INTO financialyears (finYearName, startDate, endDate, remarks, userId, voided) VALUES (?, ?, ?, ?, ?, ?)',
                [fyName, startDate, endDate, 'Auto-created default financial year for budget setup', 1, isPostgres ? false : 0]
            );

            result = await pool.query(query);
            allRows = isPostgres ? (result.rows || []) : (Array.isArray(result) ? (result[0] || []) : (result || []));
        }
        
        // Deduplicate by normalized finYearName, keeping the most recent one (highest finYearId)
        const seen = new Map();
        const uniqueRows = [];
        
        for (const row of allRows) {
            const normalized = normalizeFinancialYearName(row.finYearName);
            const existing = seen.get(normalized);
            
            if (!existing || row.finYearId > existing.finYearId) {
                // Remove old entry if it exists
                if (existing) {
                    const index = uniqueRows.findIndex(r => r.finYearId === existing.finYearId);
                    if (index !== -1) {
                        uniqueRows.splice(index, 1);
                    }
                }
                // Add new entry
                seen.set(normalized, row);
                uniqueRows.push(row);
            }
        }
        
        res.status(200).json(uniqueRows);
    } catch (error) {
        console.error('Error fetching financial years:', error);
        res.status(500).json({ message: 'Error fetching financial years', error: error.message });
    }
});

/**
 * @route GET /api/metadata/financialyears/:finYearId
 * @description Get a specific financial year by ID (including voided ones, for editing projects that reference them)
 * @access Public (can be protected by middleware)
 */
router.get('/:finYearId', async (req, res) => {
    const { finYearId } = req.params;
    if (isNaN(parseInt(finYearId))) {
        return res.status(400).json({ message: 'Invalid financial year ID' });
    }
    try {
        // Get financial year even if voided (projects might reference voided financial years)
        const [rows] = await pool.query(
            'SELECT finYearId, finYearName, startDate, endDate, createdAt, updatedAt, userId, voided FROM financialyears WHERE finYearId = ?',
            [finYearId]
        );
        if (rows.length > 0) {
            res.status(200).json(rows[0]);
        } else {
            res.status(404).json({ message: 'Financial year not found' });
        }
    } catch (error) {
        console.error('Error fetching financial year:', error);
        res.status(500).json({ message: 'Error fetching financial year', error: error.message });
    }
});

/**
 * @route POST /api/metadata/financialyears/
 * @description Create a new financial year.
 * @access Private (requires authentication and privilege)
 */
router.post('/', async (req, res) => {
    // TODO: Get userId from authenticated user (e.g., req.user.userId)
    const userId = 1; // Placeholder for now
    const { finYearName, startDate, endDate, remarks } = req.body;

    if (!finYearName || !startDate || !endDate) {
        return res.status(400).json({ message: 'Missing required fields: finYearName, startDate, endDate' });
    }

    try {
        // Normalize the input name for comparison
        const normalizedName = normalizeFinancialYearName(finYearName);
        
        // Get all financial years to check for normalized duplicates
        const [allFinancialYears] = await pool.query(
            'SELECT finYearId, finYearName, voided FROM financialyears'
        );
        
        // Check if any existing financial year has the same normalized name
        const duplicate = allFinancialYears.find(fy => {
            const existingNormalized = normalizeFinancialYearName(fy.finYearName);
            return existingNormalized === normalizedName;
        });

        if (duplicate) {
            const existingRecord = duplicate;
            if (existingRecord.voided === 0 || existingRecord.voided === null) {
                return res.status(409).json({ 
                    message: `Financial year "${finYearName}" is the same as existing "${existingRecord.finYearName}". Please use a different name.` 
                });
            } else {
                // If voided, we could restore it, but for now, return error
                return res.status(409).json({ 
                    message: `Financial year "${finYearName}" is the same as existing "${existingRecord.finYearName}" (voided). Please use a different name or restore the existing record.` 
                });
            }
        }

        // Insert new financial year - explicitly set voided = 0
        const [result] = await pool.query(
            'INSERT INTO financialyears (finYearName, startDate, endDate, remarks, userId, voided) VALUES (?, ?, ?, ?, ?, 0)',
            [finYearName, startDate, endDate, remarks, userId]
        );
        res.status(201).json({ message: 'Financial year created successfully', finYearId: result.insertId });
    } catch (error) {
        console.error('Error creating financial year:', error);
        
        // Handle duplicate key error (in case unique constraint exists)
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ 
                message: `Financial year "${finYearName}" already exists. Please use a different name.` 
            });
        }
        
        res.status(500).json({ message: 'Error creating financial year', error: error.message });
    }
});

/**
 * @route PUT /api/metadata/financialyears/:finYearId
 * @description Update an existing financial year by finYearId.
 * @access Private (requires authentication and privilege)
 */
router.put('/:finYearId', async (req, res) => {
    const { finYearId } = req.params;
    const { finYearName, startDate, endDate, remarks } = req.body;

    try {
        // Check if another financial year with this name already exists (excluding current record)
        if (finYearName) {
            // Normalize the input name for comparison
            const normalizedName = normalizeFinancialYearName(finYearName);
            
            // Get all financial years to check for normalized duplicates (excluding current record)
            const [allFinancialYears] = await pool.query(
                'SELECT finYearId, finYearName, voided FROM financialyears WHERE finYearId != ?',
                [finYearId]
            );
            
            // Check if any existing financial year has the same normalized name
            const duplicate = allFinancialYears.find(fy => {
                const existingNormalized = normalizeFinancialYearName(fy.finYearName);
                return existingNormalized === normalizedName;
            });

            if (duplicate) {
                const existingRecord = duplicate;
                if (existingRecord.voided === 0 || existingRecord.voided === null) {
                    return res.status(409).json({ 
                        message: `Financial year "${finYearName}" is the same as existing "${existingRecord.finYearName}". Please use a different name.` 
                    });
                }
            }
        }

        // Update financial year - explicitly ensure voided = 0 (in case it was NULL)
        const [result] = await pool.query(
            'UPDATE financialyears SET finYearName = ?, startDate = ?, endDate = ?, remarks = ?, voided = 0, updatedAt = CURRENT_TIMESTAMP WHERE finYearId = ? AND (voided = 0 OR voided IS NULL)',
            [finYearName, startDate, endDate, remarks, finYearId]
        );
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Financial year not found or already deleted' });
        }
        res.status(200).json({ message: 'Financial year updated successfully' });
    } catch (error) {
        console.error('Error updating financial year:', error);
        
        // Handle duplicate key error (in case unique constraint exists)
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ 
                message: `Financial year "${finYearName}" already exists. Please use a different name.` 
            });
        }
        
        res.status(500).json({ message: 'Error updating financial year', error: error.message });
    }
});

/**
 * @route DELETE /api/metadata/financialyears/:finYearId
 * @description Soft delete a financial year by finYearId.
 * @access Private (requires authentication and privilege)
 */
router.delete('/:finYearId', async (req, res) => {
    const { finYearId } = req.params;
    // TODO: Get userId from authenticated user (e.g., req.user.userId)
    const userId = 1; // Placeholder for now

    try {
        const [result] = await pool.query(
            'UPDATE financialyears SET voided = 1, voidedBy = ? WHERE finYearId = ? AND voided = 0',
            [userId, finYearId]
        );
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Financial year not found or already deleted' });
        }
        res.status(200).json({ message: 'Financial year soft-deleted successfully' });
    } catch (error) {
        console.error('Error deleting financial year:', error);
        res.status(500).json({ message: 'Error deleting financial year', error: error.message });
    }
});

module.exports = router;