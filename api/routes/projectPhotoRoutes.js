const express = require('express');
const projectRouter = express.Router({ mergeParams: true });
const photoRouter = express.Router();
const multer = require('multer');
const path = require('path');
const pool = require('../config/db');
const privilege = require('../middleware/privilegeMiddleware');

// Multer storage configuration for project photos
// Use absolute path to ensure files are saved correctly
const uploadsDir = path.join(__dirname, '..', 'uploads', 'project-photos');
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        // Ensure directory exists
        const fs = require('fs');
        if (!fs.existsSync(uploadsDir)) {
            fs.mkdirSync(uploadsDir, { recursive: true });
        }
        cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
        cb(null, `${Date.now()}-${file.originalname}`);
    }
});

const upload = multer({ storage: storage });

// ------------------------------------------------
// --- Routes using :projectId (mounted as a sub-router) ---
// ------------------------------------------------

/**
 * @route GET /api/projects/:projectId/photos
 * @description Get all active photos for a specific project.
 * @access Private
 */
projectRouter.get('/', async (req, res) => {
    const { projectId } = req.params;
    console.log('GET /api/projects/:projectId/photos - projectId:', projectId);
    try {
        if (!projectId) {
            return res.status(400).json({ message: 'Project ID is required' });
        }
        const [rows] = await pool.query(
            `SELECT 
                photoId,
                projectId,
                fileName,
                filePath,
                fileType,
                fileSize,
                description,
                isDefault,
                userId,
                createdAt,
                updatedAt,
                voided,
                approved_for_public,
                approved_by,
                approved_at,
                approval_notes
            FROM project_photos 
            WHERE projectId = ? AND voided = 0
            ORDER BY createdAt DESC`,
            [projectId]
        );
        console.log(`Found ${rows.length} photos for project ${projectId}`);
        res.status(200).json(rows);
    } catch (error) {
        console.error('Error fetching project photos:', error);
        res.status(500).json({ message: 'Error fetching project photos', error: error.message });
    }
});

/**
 * @route POST /api/projects/:projectId/photos
 * @description Upload a new photo for a project.
 * @access Private
 */
projectRouter.post('/', upload.single('file'), async (req, res) => {
    const { projectId } = req.params;
    const file = req.file;

    if (!file) {
        return res.status(400).json({ message: 'No file uploaded.' });
    }

    // TODO: Get userId from authenticated user (e.g., req.user.userId)
    const userId = 1;

    try {
        // Store relative path for database (uploads/project-photos/filename.jpg)
        // This works with the static file serving at /uploads
        const relativePath = path.relative(path.join(__dirname, '..', 'uploads'), file.path);
        const dbFilePath = relativePath.replace(/\\/g, '/'); // Normalize path separators
        
        const newPhoto = {
            projectId,
            fileName: file.originalname,
            filePath: dbFilePath, // Use relative path for database
            fileType: file.mimetype,
            fileSize: file.size,
            description: req.body.description || `Photo for project ${projectId}`,
            userId,
        };

        const [result] = await pool.query('INSERT INTO project_photos SET ?', newPhoto);
        const [rows] = await pool.query('SELECT * FROM project_photos WHERE photoId = ?', [result.insertId]);
        res.status(201).json(rows[0]);
    } catch (error) {
        console.error('Error uploading project photo:', error);
        res.status(500).json({ message: 'Error uploading project photo', error: error.message });
    }
});

// ------------------------------------------------
// --- Routes using :photoId (mounted separately) ---
// ------------------------------------------------

/**
 * @route PUT /api/project_photos/:photoId/default
 * @description Sets a photo as the default for its project.
 * @access Private
 */
photoRouter.put('/:photoId/default', async (req, res) => {
    const { photoId } = req.params;
console.log('dddddddddddddddddddddd',req)
    // TODO: Get userId from authenticated user
    const userId = 1;

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        // 1. Get the projectId from the photo being set as default
        const [photoRows] = await connection.query('SELECT projectId FROM project_photos WHERE photoId = ? AND voided = 0', [photoId]);
        if (photoRows.length === 0) {
            await connection.rollback();
            return res.status(404).json({ message: 'Photo not found.' });
        }
        const { projectId } = photoRows[0];

        // 2. Unset the current default photo for this project
        await connection.query('UPDATE project_photos SET isDefault = 0 WHERE projectId = ? AND isDefault = 1', [projectId]);

        // 3. Set the new photo as default
        await connection.query('UPDATE project_photos SET isDefault = 1 WHERE photoId = ?', [photoId]);

        // 4. Update the defaultPhotoId in the projects table
        await connection.query('UPDATE projects SET defaultPhotoId = ? WHERE id = ?', [photoId, projectId]);

        await connection.commit();
        res.status(200).json({ message: 'Default photo updated successfully.' });
    } catch (error) {
        await connection.rollback();
        console.error('Error setting default project photo:', error);
        res.status(500).json({ message: 'Error setting default project photo', error: error.message });
    } finally {
        connection.release();
    }
});

/**
 * @route DELETE /api/project_photos/:photoId
 * @description Soft-delete a project photo.
 * @access Private
 */
photoRouter.delete('/:photoId', async (req, res) => {
    const { photoId } = req.params;

    // TODO: Get userId from authenticated user
    const userId = 1;

    try {
        const [result] = await pool.query(
            'UPDATE project_photos SET voided = 1, voidedBy = ? WHERE photoId = ? AND voided = 0',
            [userId, photoId]
        );
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Photo not found or already deleted' });
        }
        res.status(200).json({ message: 'Project photo soft-deleted successfully' });
    } catch (error) {
        console.error('Error deleting project photo:', error);
        res.status(500).json({ message: 'Error deleting project photo', error: error.message });
    }
});

// Export both routers to be mounted in app.js
/**
 * @route PUT /api/project_photos/:photoId/approval
 * @description Approve or revoke a photo for public viewing
 * @access Protected - requires public_content.approve privilege or admin role
 */
photoRouter.put('/:photoId/approval', async (req, res) => {
    // Check if user is authenticated
    if (!req.user) {
        return res.status(401).json({ 
            error: 'Authentication required' 
        });
    }
    
    // Check if user is admin or has public_content.approve privilege
    const isAdmin = privilege.isAdminLike(req.user);
    const hasPrivilege = req.user?.privileges?.includes('public_content.approve');
    
    if (!isAdmin && !hasPrivilege) {
        return res.status(403).json({ 
            error: 'Access denied. You do not have the necessary privileges to perform this action.' 
        });
    }
    
    try {
        const { photoId } = req.params;
        const { 
            approved_for_public, 
            approval_notes, 
            approved_by, 
            approved_at
        } = req.body;

        // Convert ISO string to MySQL datetime format (YYYY-MM-DD HH:MM:SS)
        const approvedAt = approved_at ? new Date(approved_at) : new Date();
        const approvedAtFormatted = approvedAt.toISOString().slice(0, 19).replace('T', ' ');

        const query = `
            UPDATE project_photos
            SET approved_for_public = ?,
                approval_notes = ?,
                approved_by = ?,
                approved_at = ?
            WHERE photoId = ? AND voided = 0
        `;

        const [result] = await pool.query(query, [
            approved_for_public ? 1 : 0,
            approval_notes || null,
            approved_by || req.user.userId,
            approvedAtFormatted,
            photoId
        ]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Photo not found' });
        }

        res.json({
            success: true,
            message: `Photo ${approved_for_public ? 'approved' : 'revoked'} for public viewing`
        });
    } catch (error) {
        console.error('Error updating photo approval:', error);
        res.status(500).json({ 
            error: 'Failed to update photo approval status',
            details: error.message 
        });
    }
});

module.exports = { projectRouter, photoRouter };