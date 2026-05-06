const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { recordAudit, AUDIT_ACTIONS } = require('../services/auditTrailService');
const auth = require('../middleware/authenticate');
const privilege = require('../middleware/privilegeMiddleware');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

// Quoted identifiers: PostgreSQL schemas from postgres-schema-clean.sql use camelCase columns.
const T_PROJECT_DOCUMENTS = '"project_documents"';
const T_PROJECT_MILESTONES = '"project_milestones"';
const T_PROJECT_CONTRACTOR_ASSIGNMENTS = '"project_contractor_assignments"';
const T_PROJECTS = '"projects"';

const DB_TYPE = process.env.DB_TYPE || 'mysql';
const isPostgres = DB_TYPE === 'postgresql';

/** True when public.project_documents has isFlagged (migration applied). */
async function projectDocumentsHasIsFlaggedColumn(connection) {
    if (!isPostgres) return false;
    try {
        const { rows } = await connection.query(
            `SELECT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public'
                  AND table_name = 'project_documents'
                  AND column_name = 'isFlagged'
            ) AS col_exists`
        );
        return Boolean(rows[0]?.col_exists);
    } catch {
        return false;
    }
}

// Main upload directory for all project documents
const baseUploadDir = path.join(__dirname, '..', '..', 'uploads');

if (!fs.existsSync(baseUploadDir)) {
    try {
        fs.mkdirSync(baseUploadDir, { recursive: true });
        console.log(`Created base upload directory: ${baseUploadDir}`);
    } catch (error) {
        console.error(`Error creating base upload directory: ${baseUploadDir}`, error);
    }
}

// FIX: Refactored Multer storage to handle dynamic paths correctly.
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        // Use a temporary folder that's not tied to req.body
        const tempUploadDir = path.join(baseUploadDir, 'temp');
        if (!fs.existsSync(tempUploadDir)) {
            fs.mkdirSync(tempUploadDir, { recursive: true });
        }
        cb(null, tempUploadDir);
    },
    filename: (req, file, cb) => {
        const fileExtension = path.extname(file.originalname);
        cb(null, `${uuidv4()}${fileExtension}`);
    }
});

const upload = multer({ storage });


/**
 * Helper function to check if a contractor is assigned to a project.
 * @param {number} contractorId The ID of the contractor.
 * @param {number} projectId The ID of the project.
 * @returns {Promise<boolean>} True if the contractor is assigned, otherwise false.
 */
async function isContractorAssignedToProject(contractorId, projectId) {
    if (!contractorId || !projectId) return false;
    const result = await db.query(
        `SELECT 1 FROM ${T_PROJECT_CONTRACTOR_ASSIGNMENTS} WHERE "contractorId" = ? AND "projectId" = ?`,
        [contractorId, projectId]
    );
    return result.rows.length > 0;
}


// @route   POST /api/documents
// @desc    Upload documents and photos for a project.
// @access  Private (e.g., requires 'document.create' privilege)
router.post('/', auth, privilege(['document.create']), upload.array('documents'), async (req, res) => {
    // FIX: Destructure new field 'originalFileName' from the request body
    let {
        projectId,
        milestoneId,
        requestId,
        documentType,
        documentCategory,
        description,
        status,
        progressPercentage,
        originalFileName,
        isFlagged: isFlaggedBody,
    } = req.body;
    const authUserId = req.user?.id ?? req.user?.userId ?? req.user?.actualUserId;
    const userId = parseInt(String(authUserId), 10);
    const files = req.files;

    if (!Number.isFinite(userId)) {
        return res.status(400).json({ message: 'Invalid or missing user id on session. Please sign in again.' });
    }

    if (!files || files.length === 0 || !projectId || !documentType || !documentCategory || !status) {
        return res.status(400).json({ message: 'Missing files or required fields: projectId, documentType, documentCategory, and status.' });
    }

    projectId = parseInt(projectId, 10);
    if (Number.isNaN(projectId)) {
        return res.status(400).json({ message: 'Invalid projectId.' });
    }
    if (milestoneId !== undefined && milestoneId !== null && milestoneId !== '') {
        milestoneId = parseInt(milestoneId, 10);
        if (Number.isNaN(milestoneId)) milestoneId = null;
    } else {
        milestoneId = null;
    }
    if (requestId !== undefined && requestId !== null && requestId !== '') {
        requestId = parseInt(requestId, 10);
        if (Number.isNaN(requestId)) requestId = null;
    } else {
        requestId = null;
    }

    if (String(documentType).toLowerCase().trim() === 'payment_certificate') {
        return res.status(400).json({
            message:
                'Payment certificates are uploaded from the project Certificates tab, not from general documents.',
        });
    }

    const isWarningLetter = String(documentType).toLowerCase().trim() === 'warning_letter';
    const parseBoolLoose = (v) => {
        if (v === undefined || v === null || v === '') return null;
        if (v === true || v === 1) return true;
        if (v === false || v === 0) return false;
        const s = String(v).toLowerCase().trim();
        if (s === 'true' || s === '1' || s === 'yes') return true;
        if (s === 'false' || s === '0' || s === 'no') return false;
        return null;
    };
    const flagParsed = parseBoolLoose(isFlaggedBody);
    const isFlagged = flagParsed !== null ? flagParsed : isWarningLetter;

    let connection;
    try {
        connection = await db.getConnection();
        await connection.beginTransaction();

        const hasFlagCol = await projectDocumentsHasIsFlaggedColumn(connection);

        const documentValues = await Promise.all(files.map(async file => {
            const tempPath = file.path;
            
            const projectUploadDir = path.join(baseUploadDir, 'projects', projectId.toString());
            const finalUploadDir = path.join(projectUploadDir, documentCategory);

            if (!fs.existsSync(finalUploadDir)) {
                fs.mkdirSync(finalUploadDir, { recursive: true });
            }

            const finalFileName = `${uuidv4()}${path.extname(file.originalname)}`;
            const finalPath = path.join(finalUploadDir, finalFileName);
            
            fs.renameSync(tempPath, finalPath);

            const documentPathForDb = path.relative(path.join(__dirname, '..', '..'), finalPath).replace(/\\/g, '/');
            const storedOriginalName =
                (files.length === 1 && originalFileName) ? originalFileName : (file.originalname || originalFileName || null);

            const row = [
                projectId,
                milestoneId || null,
                requestId || null,
                documentType,
                documentCategory,
                documentPathForDb,
                storedOriginalName,
                description || null,
                userId,
                false,
                false,
                new Date(),
                new Date(),
                status,
                progressPercentage || null,
            ];
            if (hasFlagCol) {
                row.push(isFlagged);
            }
            return row;
        }));

        const maxIdResult = await connection.query(
            `SELECT COALESCE(MAX("id"), 0) AS max_id FROM ${T_PROJECT_DOCUMENTS}`
        );
        let nextId = Number(maxIdResult.rows[0]?.max_id ?? 0) + 1;

        const insertSqlWithFlag = `INSERT INTO ${T_PROJECT_DOCUMENTS} (
                "id", "projectId", "milestoneId", "requestId", "documentType", "documentCategory", "documentPath",
                "originalFileName", "description", "userId", "isProjectCover", "voided", "createdAt", "updatedAt", "status", "progressPercentage", "isFlagged"
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
        const insertSqlNoFlag = `INSERT INTO ${T_PROJECT_DOCUMENTS} (
                "id", "projectId", "milestoneId", "requestId", "documentType", "documentCategory", "documentPath",
                "originalFileName", "description", "userId", "isProjectCover", "voided", "createdAt", "updatedAt", "status", "progressPercentage"
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
        const insertSql = hasFlagCol ? insertSqlWithFlag : insertSqlNoFlag;

        for (const row of documentValues) {
            await connection.query(insertSql, [nextId++, ...row]);
        }
        
        await connection.commit();
        void recordAudit({
            req,
            action: AUDIT_ACTIONS.DOCUMENT_UPLOAD,
            entityType: 'project',
            entityId: String(projectId),
            details: {
                fileCount: files.length,
                documentType,
                documentCategory,
            },
        });
        res.status(201).json({ message: 'Documents uploaded successfully.' });

    } catch (error) {
        if (connection) await connection.rollback();
        console.error('Error uploading documents:', error);
        res.status(500).json({
            message: 'Error uploading documents',
            error: error.message,
            detail: error.detail || undefined,
            code: error.code || undefined,
        });
    } finally {
        if (req.files) {
            req.files.forEach(file => {
                if (fs.existsSync(file.path)) {
                    fs.unlinkSync(file.path);
                }
            });
        }
        if (connection) connection.release();
    }
});

// @route   GET /api/projects/documents/by-project
// @desc    All non-voided project documents with project name, for cross-project registry view
// @access  Private — document.read_all
router.get('/by-project', auth, privilege(['document.read_all']), async (req, res) => {
    let connection;
    try {
        connection = await db.getConnection();

        const run = async (sql, params = []) => {
            const result = await connection.query(sql, params);
            return result.rows;
        };

        let rows = null;
        const attempts = [];

        if (isPostgres) {
            // Machakos / JSONB projects: PK is project_id, title is name (see projectRoutes GET list).
            attempts.push({
                sql: `
                    SELECT d.*, p.name AS "projectDisplayName"
                    FROM ${T_PROJECT_DOCUMENTS} d
                    LEFT JOIN projects p ON p.project_id = d."projectId"
                    WHERE d."voided" = false
                    ORDER BY LOWER(COALESCE(p.name, '')), d."projectId", d."createdAt" DESC NULLS LAST
                `,
            });
            // Legacy quoted camelCase projects (postgres-schema-clean.sql): PK "id", "projectName".
            attempts.push({
                sql: `
                    SELECT d.*, p."projectName" AS "projectDisplayName"
                    FROM ${T_PROJECT_DOCUMENTS} d
                    LEFT JOIN ${T_PROJECTS} p ON p."id" = d."projectId"
                    WHERE d."voided" = false
                    ORDER BY LOWER(COALESCE(p."projectName", '')), d."projectId", d."createdAt" DESC NULLS LAST
                `,
            });
        }

        for (const { sql } of attempts) {
            try {
                rows = await run(sql);
                break;
            } catch (e) {
                console.warn('GET /by-project attempt failed:', e.message);
            }
        }

        if (!rows) {
            try {
                rows = await run(
                    `SELECT * FROM ${T_PROJECT_DOCUMENTS} WHERE "voided" = false ORDER BY "projectId", "createdAt" DESC NULLS LAST`
                );
            } catch (e) {
                console.warn('GET /by-project documents-only (quoted) failed:', e.message);
                rows = await run(
                    'SELECT * FROM project_documents WHERE voided = false ORDER BY projectid, createdat DESC'
                );
            }
        }

        res.json(rows);
    } catch (error) {
        console.error('Error fetching documents by project:', error);
        res.status(500).json({
            message: 'Error fetching documents by project',
            error: error.message,
            detail: error.detail || undefined,
            code: error.code || undefined,
        });
    } finally {
        if (connection) connection.release();
    }
});

// @route   GET /api/documents/project/:projectId
// @desc    Get all documents and photos for a specific project.
// @access  Private (e.g., requires 'document.read_all' or 'document.read_own' privilege)
// UPDATED: Replaced middleware with granular access check
router.get('/project/:projectId', auth, async (req, res) => {
    const { projectId } = req.params;
    const { contractorId, privileges } = req.user;

    const hasReadPrivilege = privileges.includes('document.read_all');
    const isAssignedContractor = contractorId && await isContractorAssignedToProject(contractorId, projectId);

    if (!hasReadPrivilege && !isAssignedContractor) {
        return res.status(403).json({ message: 'Access denied. You do not have the necessary privileges to perform this action.' });
    }

    let connection;
    try {
        connection = await db.getConnection();
        let rows;
        if (isPostgres) {
            // Order: milestone schedule (sequence_order), then document display order / age.
            const snakeJoinSql = `
                SELECT d.*, pm.milestone_name AS "milestoneDisplayName"
                 FROM ${T_PROJECT_DOCUMENTS} d
                 LEFT JOIN project_milestones pm
                   ON pm.milestone_id = d."milestoneId" AND pm.voided IS NOT TRUE
                 WHERE d."projectId" = ? AND d."voided" = false
                 ORDER BY
                   COALESCE(pm.sequence_order, 2147483647) ASC,
                   COALESCE(pm.milestone_id, 0) ASC,
                   COALESCE(d."displayOrder", 2147483647) ASC,
                   d."createdAt" ASC NULLS LAST,
                   d."id" ASC`;
            const legacyJoinSql = `
                SELECT d.*, pm."milestoneName" AS "milestoneDisplayName"
                 FROM ${T_PROJECT_DOCUMENTS} d
                 LEFT JOIN ${T_PROJECT_MILESTONES} pm
                   ON pm."milestoneId" = d."milestoneId" AND pm."voided" = false
                 WHERE d."projectId" = ? AND d."voided" = false
                 ORDER BY
                   COALESCE(pm."sequenceOrder", 2147483647) ASC,
                   COALESCE(pm."milestoneId", 0) ASC,
                   COALESCE(d."displayOrder", 2147483647) ASC,
                   d."createdAt" ASC NULLS LAST,
                   d."id" ASC`;
            try {
                const r = await connection.query(snakeJoinSql, [projectId]);
                rows = r.rows || [];
            } catch (e) {
                console.warn('project documents milestone join (snake_case) failed, trying legacy:', e.message);
                const r2 = await connection.query(legacyJoinSql, [projectId]);
                rows = r2.rows || [];
            }
        } else {
            const r = await connection.query(
                `SELECT d.*, pm.milestoneName AS milestoneDisplayName
                 FROM ${T_PROJECT_DOCUMENTS} d
                 LEFT JOIN project_milestones pm
                   ON pm.milestoneId = d.milestoneId AND pm.voided = 0
                 WHERE d."projectId" = ? AND d.voided = 0
                 ORDER BY
                   COALESCE(pm.sequenceOrder, 2147483647) ASC,
                   COALESCE(pm.milestoneId, 0) ASC,
                   COALESCE(d.displayOrder, 2147483647) ASC,
                   d.createdAt ASC,
                   d.id ASC`,
                [projectId]
            );
            rows = r.rows || [];
        }
        res.json(rows);
    } catch (error) {
        console.error('Error fetching project documents:', error);
        res.status(500).json({ message: 'Error fetching project documents', error: error.message });
    } finally {
        if (connection) connection.release();
    }
});

// NEW: @route PUT /api/documents/reorder
// @desc Updates the display order of documents
// @access Private (e.g., requires 'document.update' privilege)
router.put('/reorder', auth, privilege(['document.update']), async (req, res) => {
    const { photos } = req.body;
    let connection;

    if (!photos || !Array.isArray(photos) || photos.length === 0) {
        return res.status(400).json({ message: 'Invalid request body. Expected an array of photos.' });
    }

    try {
        connection = await db.getConnection();
        await connection.beginTransaction();

        const updatePromises = photos.map(photo => {
            return connection.query(
                `UPDATE ${T_PROJECT_DOCUMENTS} SET "displayOrder" = ? WHERE "id" = ?`,
                [photo.displayOrder, photo.id]
            );
        });

        await Promise.all(updatePromises);
        await connection.commit();
        res.status(200).json({ message: 'Photos reordered successfully.' });

    } catch (error) {
        if (connection) await connection.rollback();
        console.error('Error reordering photos:', error);
        res.status(500).json({ message: 'Error reordering photos', error: error.message });
    } finally {
        if (connection) connection.release();
    }
});


// @route   PUT /api/documents/cover/:documentId
// @desc    Sets a specific photo as the project cover.
// @access  Private (requires 'project.update' privilege)
router.put('/cover/:documentId', auth, privilege(['project.update']), async (req, res) => {
    const { documentId } = req.params;
    const userId = req.user.id;
    let connection;
    try {
        connection = await db.getConnection();
        await connection.beginTransaction();

        // Get the projectId of the document to update
        const docResult = await connection.query(
            `SELECT "projectId" FROM ${T_PROJECT_DOCUMENTS} WHERE "id" = ? AND "voided" = false`,
            [documentId]
        );
        const doc = docResult.rows;
        if (doc.length === 0) {
            await connection.rollback();
            return res.status(404).json({ message: 'Document not found.' });
        }
        const projectId = doc[0].projectId;

        // Reset the cover status for all other photos for this project
        await connection.query(
            `UPDATE ${T_PROJECT_DOCUMENTS} SET "isProjectCover" = false WHERE "projectId" = ?`,
            [projectId]
        );

        // Set the specified document as the new project cover
        await connection.query(
            `UPDATE ${T_PROJECT_DOCUMENTS} SET "isProjectCover" = true WHERE "id" = ?`,
            [documentId]
        );
        
        await connection.commit();
        res.status(200).json({ message: 'Project cover photo updated successfully.' });

    } catch (error) {
        if (connection) await connection.rollback();
        console.error('Error setting project cover photo:', error);
        res.status(500).json({ message: 'Error setting project cover photo', error: error.message });
    } finally {
        if (connection) connection.release();
    }
});


// @route   PUT /api/documents/:documentId
// @desc    Updates a document's details (e.g., description).
// @access  Private (requires 'document.update' privilege)
router.put('/:documentId', auth, privilege(['document.update']), async (req, res) => {
    const { documentId } = req.params;
    const { description, isFlagged } = req.body;
    let connection;

    const hasDescription = description !== undefined && description !== null && String(description).trim() !== '';
    const hasFlag = isFlagged !== undefined && isFlagged !== null;
    if (!hasDescription && !hasFlag) {
        return res.status(400).json({
            message: 'Provide at least one of: description (non-empty), isFlagged (boolean).',
        });
    }

    const flagBool =
        isFlagged === true ||
        isFlagged === 'true' ||
        isFlagged === 1 ||
        isFlagged === '1';

    try {
        connection = await db.getConnection();
        const hasFlagCol = await projectDocumentsHasIsFlaggedColumn(connection);
        if (hasFlag && !hasFlagCol) {
            connection.release();
            return res.status(400).json({
                message:
                    'Flagging is not available until the database has the isFlagged column. Apply api/migrations/add_project_documents_is_flagged.sql (or run node api/scripts/ensureProjectDocumentsTable.js), then retry.',
            });
        }
        const sets = ['"updatedAt" = CURRENT_TIMESTAMP'];
        const params = [];
        if (hasDescription) {
            sets.push('"description" = ?');
            params.push(String(description).trim());
        }
        if (hasFlag && hasFlagCol) {
            sets.push('"isFlagged" = ?');
            params.push(flagBool);
        }
        params.push(documentId);
        await connection.query(
            `UPDATE ${T_PROJECT_DOCUMENTS} SET ${sets.join(', ')} WHERE "id" = ? AND "voided" = false`,
            params
        );
        void recordAudit({
            req,
            action: AUDIT_ACTIONS.DOCUMENT_UPDATE,
            entityType: 'document',
            entityId: String(documentId),
            details: { hasDescription, hasFlag },
        });
        res.status(200).json({ message: 'Document updated successfully.' });
    } catch (error) {
        console.error('Error updating document:', error);
        res.status(500).json({ message: 'Error updating document', error: error.message });
    } finally {
        if (connection) connection.release();
    }
});


// @route   DELETE /api/documents/:documentId
// @desc    Performs a soft delete on a document.
// @access  Private (requires 'document.delete' privilege)
router.delete('/:documentId', auth, privilege(['document.delete']), async (req, res) => {
    const { documentId } = req.params;
    let connection;
    try {
        connection = await db.getConnection();
        await connection.query(
            `UPDATE ${T_PROJECT_DOCUMENTS} SET "voided" = true, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = ?`,
            [documentId]
        );
        void recordAudit({
            req,
            action: AUDIT_ACTIONS.DOCUMENT_DELETE,
            entityType: 'document',
            entityId: String(documentId),
            details: { soft: true },
        });
        res.status(200).json({ message: 'Document deleted successfully.' });
    } catch (error) {
        console.error('Error deleting document:', error);
        res.status(500).json({ message: 'Error deleting document', error: error.message });
    } finally {
        if (connection) connection.release();
    }
});

// @route   GET /api/documents/milestone/:milestoneId
// @desc    Get all documents and photos for a specific milestone.
// @access  Private (requires 'document.read_all' or 'document.read_own' privilege)
// UPDATED: Replaced middleware with granular access check
router.get('/milestone/:milestoneId', auth, async (req, res) => {
    const { milestoneId } = req.params;
    const { contractorId, privileges } = req.user;

    const milestoneIdNum = parseInt(String(milestoneId), 10);
    if (!Number.isFinite(milestoneIdNum)) {
        return res.status(400).json({ message: 'Invalid milestone id.' });
    }

    let connection;
    try {
        connection = await db.getConnection();

        // Resolve project for this milestone (PostgreSQL often uses snake_case; legacy may use quoted camelCase)
        let milestoneRows = [];
        if (isPostgres) {
            const attempts = [
                `SELECT project_id AS "projectId" FROM project_milestones WHERE milestone_id = ? AND voided = false`,
                `SELECT "projectId" FROM ${T_PROJECT_MILESTONES} WHERE "milestoneId" = ? AND "voided" = false`,
            ];
            for (const sql of attempts) {
                try {
                    const r = await connection.query(sql, [milestoneIdNum]);
                    milestoneRows = r.rows || [];
                    if (milestoneRows.length > 0) break;
                } catch (e) {
                    console.warn('Milestone project lookup attempt failed:', e.message);
                }
            }
        } else {
            const milestoneResult = await connection.query(
                'SELECT projectId FROM project_milestones WHERE milestoneId = ? AND voided = 0',
                [milestoneIdNum]
            );
            milestoneRows = milestoneResult.rows || [];
        }

        if (milestoneRows.length === 0) {
            return res.status(404).json({ message: 'Milestone not found.' });
        }
        const projectId = milestoneRows[0].projectId;

        const hasReadPrivilege = privileges.includes('document.read_all');
        const isAssignedContractor = contractorId && await isContractorAssignedToProject(contractorId, projectId);

        if (!hasReadPrivilege && !isAssignedContractor) {
            return res.status(403).json({ message: 'Access denied. You do not have the necessary privileges to perform this action.' });
        }

        const voidClause = isPostgres ? '"voided" = false' : '"voided" = 0';
        const orderClause = isPostgres
            ? `ORDER BY COALESCE("displayOrder", 2147483647) ASC, "createdAt" ASC NULLS LAST, "id" ASC`
            : `ORDER BY COALESCE(displayOrder, 2147483647) ASC, createdAt ASC, id ASC`;
        const { rows } = await connection.query(
            `SELECT * FROM ${T_PROJECT_DOCUMENTS} WHERE "milestoneId" = ? AND ${voidClause} ${orderClause}`,
            [milestoneIdNum]
        );
        res.json(rows);
    } catch (error) {
        console.error('Error fetching milestone documents:', error);
        res.status(500).json({ message: 'Error fetching milestone documents', error: error.message });
    } finally {
        if (connection) connection.release();
    }
});

// @route   PUT /api/documents/:documentId/approval
// @desc    Approve or revoke a document/photo for public viewing
// @access  Private (requires 'public_content.approve' privilege or admin role)
router.put('/:documentId/approval', auth, async (req, res) => {
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
        const { documentId } = req.params;
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
            UPDATE ${T_PROJECT_DOCUMENTS}
            SET approved_for_public = ?,
                approval_notes = ?,
                approved_by = ?,
                approved_at = ?
            WHERE "id" = ? AND "voided" = false
        `;

        const result = await db.query(query, [
            approved_for_public ? 1 : 0,
            approval_notes || null,
            approved_by || req.user.id,
            approvedAtFormatted,
            documentId
        ]);

        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Document not found' });
        }

        res.json({
            success: true,
            message: `Document ${approved_for_public ? 'approved' : 'revoked'} for public viewing`
        });
    } catch (error) {
        console.error('Error updating document approval:', error);
        res.status(500).json({ 
            error: 'Failed to update document approval status',
            details: error.message 
        });
    }
});

module.exports = router;
