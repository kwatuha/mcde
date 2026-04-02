const express = require('express');
const router = express.Router();
const db = require('../config/db');
const auth = require('../middleware/authenticate');
const privilege = require('../middleware/privilegeMiddleware');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

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
    const [rows] = await db.query(
        'SELECT 1 FROM project_contractor_assignments WHERE contractorId = ? AND projectId = ?',
        [contractorId, projectId]
    );
    return rows.length > 0;
}


// @route   POST /api/documents
// @desc    Upload documents and photos for a project.
// @access  Private (e.g., requires 'document.create' privilege)
router.post('/', auth, privilege(['document.create']), upload.array('documents'), async (req, res) => {
    // FIX: Destructure new field 'originalFileName' from the request body
    const { projectId, milestoneId, requestId, documentType, documentCategory, description, status, progressPercentage, originalFileName } = req.body;
    const userId = req.user.id;
    const files = req.files;

    if (!files || files.length === 0 || !projectId || !documentType || !documentCategory || !status) {
        return res.status(400).json({ message: 'Missing files or required fields: projectId, documentType, documentCategory, and status.' });
    }

    let connection;
    try {
        connection = await db.getConnection();
        await connection.beginTransaction();

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
            
            return [
                projectId, 
                milestoneId || null, 
                requestId || null,
                documentType, 
                documentCategory, 
                documentPathForDb, 
                originalFileName || null, // FIX: Use the originalFileName
                description || null,
                userId, 
                0, // isProjectCover
                0, // voided
                new Date(), // createdAt
                new Date(),  // updatedAt
                status,
                progressPercentage || null
            ];
        }));

        await connection.query(
            // FIX: Add originalFileName to the SQL query
            `INSERT INTO project_documents (projectId, milestoneId, requestId, documentType, documentCategory, documentPath, originalFileName, description, userId, isProjectCover, voided, createdAt, updatedAt, status, progressPercentage) VALUES ?`,
            [documentValues]
        );
        
        await connection.commit();
        res.status(201).json({ message: 'Documents uploaded successfully.' });

    } catch (error) {
        if (connection) await connection.rollback();
        console.error('Error uploading documents:', error);
        res.status(500).json({ message: 'Error uploading documents', error: error.message });
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
        const [rows] = await connection.query('SELECT * FROM project_documents WHERE projectId = ? AND voided = 0', [projectId]);
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
                'UPDATE project_documents SET displayOrder = ? WHERE id = ?',
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
        const [doc] = await connection.query('SELECT projectId FROM project_documents WHERE id = ? AND voided = 0', [documentId]);
        if (doc.length === 0) {
            await connection.rollback();
            return res.status(404).json({ message: 'Document not found.' });
        }
        const projectId = doc[0].projectId;

        // Reset the cover status for all other photos for this project
        await connection.query('UPDATE project_documents SET isProjectCover = 0 WHERE projectId = ?', [projectId]);

        // Set the specified document as the new project cover
        await connection.query('UPDATE project_documents SET isProjectCover = 1 WHERE id = ?', [documentId]);
        
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
    const { description } = req.body;
    let connection;

    if (!description) {
        return res.status(400).json({ message: 'Description is required for updating the document.' });
    }

    try {
        connection = await db.getConnection();
        await connection.query(
            'UPDATE project_documents SET description = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?',
            [description, documentId]
        );
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
            'UPDATE project_documents SET voided = 1, updatedAt = CURRENT_TIMESTAMP WHERE id = ?',
            [documentId]
        );
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

    let connection;
    try {
        connection = await db.getConnection();

        // Check the projectId associated with the milestone
        const [milestoneRows] = await connection.query(
            'SELECT projectId FROM project_milestones WHERE milestoneId = ?',
            [milestoneId]
        );
        if (milestoneRows.length === 0) {
            return res.status(404).json({ message: 'Milestone not found.' });
        }
        const projectId = milestoneRows[0].projectId;

        const hasReadPrivilege = privileges.includes('document.read_all');
        const isAssignedContractor = contractorId && await isContractorAssignedToProject(contractorId, projectId);

        if (!hasReadPrivilege && !isAssignedContractor) {
            return res.status(403).json({ message: 'Access denied. You do not have the necessary privileges to perform this action.' });
        }

        const [rows] = await connection.query('SELECT * FROM project_documents WHERE milestoneId = ? AND voided = 0', [milestoneId]);
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
            UPDATE project_documents
            SET approved_for_public = ?,
                approval_notes = ?,
                approved_by = ?,
                approved_at = ?
            WHERE id = ? AND voided = 0
        `;

        const [result] = await db.query(query, [
            approved_for_public ? 1 : 0,
            approval_notes || null,
            approved_by || req.user.id,
            approvedAtFormatted,
            documentId
        ]);

        if (result.affectedRows === 0) {
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
