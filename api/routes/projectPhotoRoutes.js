const express = require('express');
const projectRouter = express.Router({ mergeParams: true });
const photoRouter = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const pool = require('../config/db');
const privilege = require('../middleware/privilegeMiddleware');

const DB_TYPE = process.env.DB_TYPE || 'postgresql';
const isPostgres = DB_TYPE === 'postgresql';

// Multer storage configuration for project photos
// Use absolute path to ensure files are saved correctly
const uploadsDir = path.join(__dirname, '..', 'uploads', 'project-photos');
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        // Ensure directory exists
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

const rowsOf = (result) => {
    if (Array.isArray(result)) return result[0] || [];
    return result?.rows || [];
};

const getAffectedRows = (result) => {
    if (Array.isArray(result)) return result[0]?.affectedRows || 0;
    return result?.rowCount || 0;
};

const getAuthUserId = (user) => user?.id || user?.userId || user?.userid || user?.actualUserId || 1;

let schemaReady = false;
const runOptionalDDL = async (sql) => {
    try {
        await pool.query(sql);
    } catch (err) {
        const code = String(err?.code || '');
        // Ignore duplicate object/table and insufficient privilege; migrations may be managed separately.
        if (code === '42P07' || code === '42710' || code === '23505' || code === '42501') {
            return;
        }
        throw err;
    }
};

const ensureProjectPhotoSchema = async () => {
    if (schemaReady) return;

    if (isPostgres) {
        await runOptionalDDL(`
            CREATE TABLE IF NOT EXISTS project_photos (
                "photoId" BIGSERIAL PRIMARY KEY,
                "projectId" INTEGER NOT NULL,
                "fileName" TEXT NOT NULL,
                "filePath" TEXT NOT NULL,
                "fileType" TEXT NULL,
                "fileSize" BIGINT NULL,
                description TEXT NULL,
                "isDefault" BOOLEAN NOT NULL DEFAULT false,
                "userId" INTEGER NULL,
                "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                voided BOOLEAN NOT NULL DEFAULT false,
                "voidedBy" INTEGER NULL,
                approved_for_public BOOLEAN NOT NULL DEFAULT false,
                approved_by INTEGER NULL,
                approved_at TIMESTAMP NULL,
                approval_notes TEXT NULL
            )
        `);
        await runOptionalDDL(`CREATE SEQUENCE IF NOT EXISTS project_photos_photo_id_seq`);
        await runOptionalDDL(`
            SELECT setval(
                'project_photos_photo_id_seq',
                GREATEST(COALESCE((SELECT MAX("photoId") FROM project_photos), 0) + 1, 1),
                false
            )
        `);
        await runOptionalDDL(`ALTER TABLE project_photos ALTER COLUMN "photoId" SET DEFAULT nextval('project_photos_photo_id_seq')`);
        await runOptionalDDL(`ALTER SEQUENCE project_photos_photo_id_seq OWNED BY project_photos."photoId"`);
        await runOptionalDDL(`ALTER TABLE project_photos ADD COLUMN IF NOT EXISTS approved_for_public BOOLEAN NOT NULL DEFAULT false`);
        await runOptionalDDL(`ALTER TABLE project_photos ADD COLUMN IF NOT EXISTS approved_by INTEGER NULL`);
        await runOptionalDDL(`ALTER TABLE project_photos ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP NULL`);
        await runOptionalDDL(`ALTER TABLE project_photos ADD COLUMN IF NOT EXISTS approval_notes TEXT NULL`);
        await runOptionalDDL(`ALTER TABLE project_photos ADD COLUMN IF NOT EXISTS "isDefault" BOOLEAN NOT NULL DEFAULT false`);
        await runOptionalDDL(`ALTER TABLE project_photos ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP`);
        await runOptionalDDL(`ALTER TABLE project_photos ADD COLUMN IF NOT EXISTS voided BOOLEAN NOT NULL DEFAULT false`);
        await runOptionalDDL(`ALTER TABLE project_photos ADD COLUMN IF NOT EXISTS "voidedBy" INTEGER NULL`);
    } else {
        await runOptionalDDL(`ALTER TABLE project_photos ADD COLUMN IF NOT EXISTS approved_for_public TINYINT(1) NOT NULL DEFAULT 0`);
        await runOptionalDDL(`ALTER TABLE project_photos ADD COLUMN IF NOT EXISTS approved_by INT NULL`);
        await runOptionalDDL(`ALTER TABLE project_photos ADD COLUMN IF NOT EXISTS approved_at DATETIME NULL`);
        await runOptionalDDL(`ALTER TABLE project_photos ADD COLUMN IF NOT EXISTS approval_notes TEXT NULL`);
    }

    schemaReady = true;
};

const projectPhotoSelectSql = () => isPostgres
    ? `SELECT
            "photoId" AS "photoId",
            "projectId" AS "projectId",
            "fileName" AS "fileName",
            "filePath" AS "filePath",
            "fileType" AS "fileType",
            "fileSize" AS "fileSize",
            description,
            "isDefault" AS "isDefault",
            "userId" AS "userId",
            "createdAt" AS "createdAt",
            "updatedAt" AS "updatedAt",
            voided,
            approved_for_public,
            approved_by,
            approved_at,
            approval_notes
       FROM project_photos`
    : `SELECT 
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
       FROM project_photos`;

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
        await ensureProjectPhotoSchema();
        const query = isPostgres
            ? `${projectPhotoSelectSql()} WHERE "projectId" = $1 AND COALESCE(voided, false) = false ORDER BY "createdAt" DESC`
            : `${projectPhotoSelectSql()} WHERE projectId = ? AND COALESCE(voided, 0) = 0 ORDER BY createdAt DESC`;
        const result = await pool.query(
            query,
            [projectId]
        );
        const rows = rowsOf(result);
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

    const userId = getAuthUserId(req.user);

    try {
        await ensureProjectPhotoSchema();
        // Store relative path for database (uploads/project-photos/filename.jpg)
        // This works with the static file serving at /uploads
        const relativePath = path.relative(path.join(__dirname, '..', 'uploads'), file.path);
        const dbFilePath = relativePath.replace(/\\/g, '/'); // Normalize path separators

        if (isPostgres) {
            const result = await pool.query(
                `INSERT INTO project_photos
                    ("projectId", "fileName", "filePath", "fileType", "fileSize", description, "userId", "createdAt", "updatedAt", voided)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,false)
                 RETURNING *`,
                [
                    parseInt(projectId, 10),
                    file.originalname,
                    dbFilePath,
                    file.mimetype,
                    file.size,
                    req.body.description || `Photo for project ${projectId}`,
                    userId,
                ]
            );
            return res.status(201).json(rowsOf(result)[0]);
        }

        const newPhoto = {
            projectId,
            fileName: file.originalname,
            filePath: dbFilePath,
            fileType: file.mimetype,
            fileSize: file.size,
            description: req.body.description || `Photo for project ${projectId}`,
            userId,
        };
        const result = await pool.query('INSERT INTO project_photos SET ?', newPhoto);
        const insertId = rowsOf(result)?.insertId || result?.insertId;
        const rows = rowsOf(await pool.query('SELECT * FROM project_photos WHERE photoId = ?', [insertId]));
        return res.status(201).json(rows[0]);
    } catch (error) {
        if (file?.path && fs.existsSync(file.path)) {
            fs.unlink(file.path, () => {});
        }
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

    try {
        await ensureProjectPhotoSchema();

        if (isPostgres) {
            const connection = await pool.getConnection();
            try {
                await connection.beginTransaction();
                const photoRows = rowsOf(await connection.query(
                    'SELECT "projectId" AS "projectId" FROM project_photos WHERE "photoId" = $1 AND COALESCE(voided, false) = false',
                    [photoId]
                ));
                if (photoRows.length === 0) {
                    await connection.rollback();
                    return res.status(404).json({ message: 'Photo not found.' });
                }
                const { projectId } = photoRows[0];

                await connection.query('UPDATE project_photos SET "isDefault" = false WHERE "projectId" = $1 AND "isDefault" = true', [projectId]);
                await connection.query('UPDATE project_photos SET "isDefault" = true, "updatedAt" = CURRENT_TIMESTAMP WHERE "photoId" = $1', [photoId]);

                await connection.commit();
                return res.status(200).json({ message: 'Default photo updated successfully.' });
            } catch (error) {
                await connection.rollback();
                throw error;
            } finally {
                connection.release();
            }
        }

        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();

            // 1. Get the projectId from the photo being set as default
            const photoRows = rowsOf(await connection.query('SELECT projectId FROM project_photos WHERE photoId = ? AND voided = 0', [photoId]));
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
            return res.status(200).json({ message: 'Default photo updated successfully.' });
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    } catch (error) {
        console.error('Error setting default project photo:', error);
        res.status(500).json({ message: 'Error setting default project photo', error: error.message });
    }
});

/**
 * @route DELETE /api/project_photos/:photoId
 * @description Soft-delete a project photo.
 * @access Private
 */
photoRouter.delete('/:photoId', async (req, res) => {
    const { photoId } = req.params;

    const userId = getAuthUserId(req.user);

    try {
        await ensureProjectPhotoSchema();
        const query = isPostgres
            ? 'UPDATE project_photos SET voided = true, "voidedBy" = $1, "updatedAt" = CURRENT_TIMESTAMP WHERE "photoId" = $2 AND COALESCE(voided, false) = false'
            : 'UPDATE project_photos SET voided = 1, voidedBy = ? WHERE photoId = ? AND voided = 0';
        const result = await pool.query(query, [userId, photoId]);
        if (getAffectedRows(result) === 0) {
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
        await ensureProjectPhotoSchema();
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

        const query = isPostgres
            ? `UPDATE project_photos
               SET approved_for_public = $1,
                   approval_notes = $2,
                   approved_by = $3,
                   approved_at = $4,
                   "updatedAt" = CURRENT_TIMESTAMP
               WHERE "photoId" = $5 AND COALESCE(voided, false) = false`
            : `UPDATE project_photos
               SET approved_for_public = ?,
                   approval_notes = ?,
                   approved_by = ?,
                   approved_at = ?
               WHERE photoId = ? AND voided = 0`;

        const result = await pool.query(query, [
            isPostgres ? Boolean(approved_for_public) : (approved_for_public ? 1 : 0),
            approval_notes || null,
            approved_by || getAuthUserId(req.user),
            approvedAtFormatted,
            photoId
        ]);

        if (getAffectedRows(result) === 0) {
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