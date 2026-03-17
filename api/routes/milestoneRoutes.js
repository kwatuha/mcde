const express = require('express');
const router = express.Router();
const multer = require('multer'); // Import multer for file uploads
const path = require('path');
const pool = require('../config/db'); // Import the database connection pool

// --- Multer Configuration for file uploads ---
// Define storage for uploaded files
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        // Set the destination folder for uploaded files
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        // Generate a unique filename by adding a timestamp
        cb(null, `${Date.now()}-${file.originalname}`);
    }
});

// Create the multer middleware
const upload = multer({ storage: storage });

// --- Milestone Management API Calls (project_milestones) ---

/**
 * @route GET /api/milestones
 * @description Get all active milestones from the project_milestones table.
 * @access Private (protected by middleware)
 */
router.get('/', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM project_milestones WHERE voided = 0');
        res.status(200).json(rows);
    } catch (error) {
        console.error('Error fetching all milestones:', error);
        res.status(500).json({ message: 'Error fetching all milestones', error: error.message });
    }
});

/**
 * @route GET /api/milestones/project/:projectId
 * @description Get all active milestones for a specific project.
 * @access Private (protected by middleware)
 */
router.get('/project/:projectId', async (req, res) => {
    const { projectId } = req.params;
    try {
        const DB_TYPE = process.env.DB_TYPE || 'mysql';
        let query, params;
        
        if (DB_TYPE === 'postgresql') {
            // PostgreSQL uses $1, $2 placeholders and snake_case column names
            query = 'SELECT * FROM project_milestones WHERE project_id = $1 AND voided = false ORDER BY sequence_order';
            params = [projectId];
        } else {
            // MySQL uses ? placeholders and camelCase column names
            query = 'SELECT * FROM project_milestones WHERE projectId = ? AND voided = 0 ORDER BY sequenceOrder';
            params = [projectId];
        }
        
        const result = await pool.execute(query, params);
        const rows = DB_TYPE === 'postgresql' ? (result.rows || result) : (Array.isArray(result) ? result[0] : result);
        const milestones = Array.isArray(rows) ? rows : [rows];
        
        res.status(200).json(milestones);
    } catch (error) {
        // SCOPE_DOWN / cleanup safety: some deployments may not have milestones tables yet.
        // In that case, return an empty list so the UI can still load project details.
        const pgMissingTable = error?.code === '42P01'; // undefined_table
        const mysqlMissingTable = error?.code === 'ER_NO_SUCH_TABLE';
        const msg = String(error?.message || '');
        const looksLikeMissing =
            pgMissingTable ||
            mysqlMissingTable ||
            msg.toLowerCase().includes('does not exist') ||
            msg.toLowerCase().includes('no such table') ||
            msg.toLowerCase().includes('project_milestones');

        if (looksLikeMissing) {
            console.warn(`Milestones table missing; returning [] for project ${projectId}`, {
                code: error?.code,
                message: error?.message,
            });
            return res.status(200).json([]);
        }

        console.error(`Error fetching milestones for project ${projectId}:`, error);
        return res.status(500).json({ message: `Error fetching milestones for project ${projectId}`, error: error.message });
    }
});

/**
 * @route GET /api/milestones/:milestoneId
 * @description Get a single active milestone by milestoneId.
 * @access Private (protected by middleware)
 */
router.get('/:milestoneId', async (req, res) => {
    const { milestoneId } = req.params;
    try {
        const [rows] = await pool.query('SELECT * FROM project_milestones WHERE milestoneId = ? AND voided = 0', [milestoneId]);
        if (rows.length > 0) {
            res.status(200).json(rows[0]);
        } else {
            res.status(404).json({ message: 'Milestone not found' });
        }
    } catch (error) {
        console.error('Error fetching milestone:', error);
        res.status(500).json({ message: 'Error fetching milestone', error: error.message });
    }
});

/**
 * @route POST /api/milestones
 * @description Create a new milestone.
 * @access Private (requires authentication and privilege)
 */
router.post('/', async (req, res) => {
    // TODO: Get userId from authenticated user (e.g., req.user.userId)
    const userId = 1; // Placeholder for now
    const { projectId, milestoneName, description, dueDate, completed, completedDate, sequenceOrder, progress, weight } = req.body; // NEW: Added progress and weight
    
    // Ensure `completed` is a boolean, and `completedDate` is set if `completed` is true
    const isCompleted = completed ? 1 : 0;
    const completionDate = completed ? (completedDate || new Date()) : null;

    if (!projectId || !milestoneName || !dueDate) {
        return res.status(400).json({ message: 'Missing required fields: projectId, milestoneName, dueDate' });
    }
    
    const newMilestone = {
        projectId,
        milestoneName,
        description,
        dueDate,
        completed: isCompleted,
        completedDate: completionDate,
        sequenceOrder,
        progress, // NEW: Include progress
        weight, // NEW: Include weight
        userId,
        createdAt: new Date(),
        updatedAt: new Date(),
        voided: 0,
    };

    try {
        const [result] = await pool.query('INSERT INTO project_milestones SET ?', newMilestone);
        const [rows] = await pool.query('SELECT * FROM project_milestones WHERE milestoneId = ?', [result.insertId]);
        
        // NEW: Recalculate and update the project's overall progress
        const [milestones] = await pool.query('SELECT progress, weight FROM project_milestones WHERE projectId = ? AND voided = 0', [projectId]);
        
        const totalWeightedProgress = milestones.reduce((sum, m) => sum + (m.progress * m.weight), 0);
        const totalWeight = milestones.reduce((sum, m) => sum + m.weight, 0);
        
        const overallProgress = totalWeight > 0 ? (totalWeightedProgress / totalWeight) : 0;
        
        await pool.query('UPDATE projects SET overallProgress = ? WHERE id = ?', [overallProgress, projectId]);

        res.status(201).json(rows[0]);
    } catch (error) {
        console.error('Error creating milestone:', error);
        res.status(500).json({ message: 'Error creating milestone', error: error.message });
    }
});

/**
 * @route PUT /api/milestones/:milestoneId
 * @description Update an existing milestone.
 * @access Private (requires authentication and privilege)
 */
router.put('/:milestoneId', async (req, res) => {
    const { milestoneId } = req.params;
    const { projectId, milestoneName, description, dueDate, completed, completedDate, sequenceOrder, progress, weight } = req.body; // NEW: Added progress and weight
    
    const isCompleted = completed ? 1 : 0;
    const completionDate = completed ? (completedDate || new Date()) : null;
    
    const updatedFields = {
        milestoneName,
        description,
        dueDate,
        completed: isCompleted,
        completedDate: completionDate,
        sequenceOrder,
        progress: progress !== undefined ? parseFloat(progress) : undefined,
        weight: weight !== undefined ? parseFloat(weight) : undefined,
        updatedAt: new Date(),
    };

    try {
        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();
            
            const [result] = await connection.query('UPDATE project_milestones SET ? WHERE milestoneId = ? AND voided = 0', [updatedFields, milestoneId]);
            
            if (result.affectedRows > 0) {
                // NEW: Calculate and update project's overall progress
                const [milestones] = await connection.query('SELECT progress, weight FROM project_milestones WHERE projectId = ? AND voided = 0', [projectId]);
                
                const totalWeightedProgress = milestones.reduce((sum, m) => sum + (m.progress * m.weight), 0);
                const totalWeight = milestones.reduce((sum, m) => sum + m.weight, 0);
                
                const overallProgress = totalWeight > 0 ? (totalWeightedProgress / totalWeight) : 0;
                
                await connection.query('UPDATE projects SET overallProgress = ? WHERE id = ?', [overallProgress, projectId]);

                await connection.commit();

                const [rows] = await connection.query('SELECT * FROM project_milestones WHERE milestoneId = ?', [milestoneId]);
                res.status(200).json(rows[0]);
            } else {
                await connection.rollback();
                res.status(404).json({ message: 'Milestone not found or already deleted' });
            }
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    } catch (error) {
        console.error('Error updating milestone:', error);
        res.status(500).json({ message: 'Error updating milestone', error: error.message });
    }
});

/**
 * @route DELETE /api/milestones/:milestoneId
 * @description Soft delete a milestone.
 * @access Private (requires authentication and privilege)
 */
router.delete('/:milestoneId', async (req, res) => {
    const { milestoneId } = req.params;
    // TODO: Get userId from authenticated user (e.g., req.user.userId)
    const userId = 1; // Placeholder for now

    try {
        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();

            const [result] = await connection.query(
                'UPDATE project_milestones SET voided = 1, voidedBy = ? WHERE milestoneId = ? AND voided = 0',
                [userId, milestoneId]
            );

            if (result.affectedRows === 0) {
                await connection.rollback();
                return res.status(404).json({ message: 'Milestone not found or already deleted' });
            }

            // NEW: Recalculate and update the project's overall progress after deleting
            const [deletedMilestoneRows] = await connection.query('SELECT projectId FROM project_milestones WHERE milestoneId = ?', [milestoneId]);
            const projectId = deletedMilestoneRows[0]?.projectId;

            if (projectId) {
                const [milestones] = await connection.query('SELECT progress, weight FROM project_milestones WHERE projectId = ? AND voided = 0', [projectId]);
                
                const totalWeightedProgress = milestones.reduce((sum, m) => sum + (m.progress * m.weight), 0);
                const totalWeight = milestones.reduce((sum, m) => sum + m.weight, 0);
                
                const overallProgress = totalWeight > 0 ? (totalWeightedProgress / totalWeight) : 0;
                
                await connection.query('UPDATE projects SET overallProgress = ? WHERE id = ?', [overallProgress, projectId]);
            }

            await connection.commit();
            res.status(200).json({ message: 'Milestone soft-deleted successfully' });

        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    } catch (error) {
        console.error('Error deleting milestone:', error);
        res.status(500).json({ message: 'Error deleting milestone', error: error.message });
    }
});

// ------------------------------------------------
// --- Milestone Attachments API Calls ---
// ------------------------------------------------

/**
 * @route GET /api/milestones/:milestoneId/attachments
 * @description Get all active attachments for a specific milestone.
 * @access Private
 */
router.get('/:milestoneId/attachments', async (req, res) => {
    const { milestoneId } = req.params;
    try {
        const [rows] = await pool.query(
            'SELECT * FROM milestone_attachments WHERE milestoneId = ? AND voided = 0',
            [milestoneId]
        );
        res.status(200).json(rows);
    } catch (error) {
        console.error(`Error fetching attachments for milestone ${milestoneId}:`, error);
        res.status(500).json({ message: `Error fetching attachments for milestone ${milestoneId}`, error: error.message });
    }
});

/**
 * @route POST /api/milestones/:milestoneId/attachments
 * @description Upload a new attachment for a milestone.
 * @access Private
 */
router.post('/:milestoneId/attachments', upload.single('file'), async (req, res) => {
    const { milestoneId } = req.params;
    const file = req.file;

    // TODO: Get userId from authenticated user
    const userId = 1;
    const description = req.body.description || `Attachment for milestone ${milestoneId}`;

    if (!file) {
        return res.status(400).json({ message: 'No file uploaded.' });
    }

    try {
        const newAttachment = {
            milestoneId,
            fileName: file.originalname,
            filePath: file.path, // Save the path provided by multer
            fileType: file.mimetype,
            fileSize: file.size,
            description,
            userId,
            createdAt: new Date(),
            updatedAt: new Date(),
            voided: 0
        };

        const [result] = await pool.query('INSERT INTO milestone_attachments SET ?', newAttachment);
        const [rows] = await pool.query('SELECT * FROM milestone_attachments WHERE attachmentId = ?', [result.insertId]);
        res.status(201).json(rows[0]);
    } catch (error) {
        console.error('Error uploading attachment:', error);
        res.status(500).json({ message: 'Error uploading attachment', error: error.message });
    }
});

/**
 * @route DELETE /api/milestones/attachments/:attachmentId
 * @description Soft delete a milestone attachment.
 * @access Private
 */
router.delete('/attachments/:attachmentId', async (req, res) => {
    const { attachmentId } = req.params;
    // TODO: Get userId from authenticated user
    const userId = 1;

    try {
        const [result] = await pool.query(
            'UPDATE milestone_attachments SET voided = 1, voidedBy = ? WHERE attachmentId = ? AND voided = 0',
            [userId, attachmentId]
        );
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Attachment not found or already deleted' });
        }
        res.status(200).json({ message: 'Attachment soft-deleted successfully' });
    } catch (error) {
        console.error('Error deleting attachment:', error);
        res.status(500).json({ message: 'Error deleting attachment', error: error.message });
    }
});

module.exports = router;