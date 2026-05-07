const express = require('express');
const router = express.Router();
const multer = require('multer');
const pool = require('../config/db');
const DB_TYPE = process.env.DB_TYPE || 'postgresql';
const isPostgres = DB_TYPE === 'postgresql';
const rowsOf = (result) => {
    if (Array.isArray(result)) return result[0] || [];
    if (result && Array.isArray(result.rows)) return result.rows;
    return [];
};
const metaOf = (result) => {
    if (Array.isArray(result)) return result[1] || {};
    return result || {};
};
const isMissingRelation = (error) => {
    const msg = String(error?.message || '').toLowerCase();
    return msg.includes('relation') && msg.includes('does not exist');
};
const isMissingColumn = (error) => {
    const msg = String(error?.message || '').toLowerCase();
    return msg.includes('column') && msg.includes('does not exist');
};
const isOperatorTypeMismatch = (error) => {
    const msg = String(error?.message || '').toLowerCase();
    return msg.includes('operator does not exist') || msg.includes('cannot be matched');
};
const shouldTryNextFallback = (error) =>
    isMissingRelation(error) || isMissingColumn(error) || isOperatorTypeMismatch(error);
async function queryRowsFallbackTables(sqlBuilders, params) {
    let lastError = null;
    for (const buildSql of sqlBuilders) {
        try {
            const res = await pool.query(buildSql(), params);
            return rowsOf(res);
        } catch (error) {
            lastError = error;
            if (!shouldTryNextFallback(error)) throw error;
        }
    }
    throw lastError || new Error('No contractor table variant available.');
}
async function tableExists(tableName) {
    try {
        if (isPostgres) {
            const q = await pool.query(
                `SELECT 1
                   FROM information_schema.tables
                  WHERE table_schema = 'public' AND table_name = $1
                  LIMIT 1`,
                [tableName]
            );
            return rowsOf(q).length > 0;
        }
        const q = await pool.query('SHOW TABLES LIKE ?', [tableName]);
        return rowsOf(q).length > 0;
    } catch (_) {
        return false;
    }
}
async function ensureContractorsTable() {
    const hasContractors = await tableExists('contractors');
    const hasKemriContractors = await tableExists('kemri_contractors');
    if (hasContractors || hasKemriContractors) {
        return hasContractors ? 'contractors' : 'kemri_contractors';
    }

    if (isPostgres) {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS contractors (
                "contractorId" SERIAL PRIMARY KEY,
                "companyName" VARCHAR(255) NOT NULL,
                "contactPerson" VARCHAR(255) NULL,
                email VARCHAR(255) NOT NULL,
                phone VARCHAR(100) NULL,
                "userId" INTEGER NULL,
                voided BOOLEAN NOT NULL DEFAULT false,
                "createdAt" TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
                "updatedAt" TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
            )
        `);
    } else {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS contractors (
                contractorId INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
                companyName VARCHAR(255) NOT NULL,
                contactPerson VARCHAR(255) NULL,
                email VARCHAR(255) NOT NULL,
                phone VARCHAR(100) NULL,
                userId INT NULL,
                voided TINYINT(1) NOT NULL DEFAULT 0,
                createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);
    }
    return 'contractors';
}
const rowVal = (row, ...keys) => {
    for (const key of keys) {
        if (row && row[key] !== undefined) return row[key];
    }
    return null;
};

// Multer storage for documents/photos
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/documents/');
    },
    filename: (req, file, cb) => {
        cb(null, `${Date.now()}-${file.originalname}`);
    }
});
const upload = multer({ storage: storage });

// --- Get Projects assigned to a Contractor ---
/**
 * @route GET /api/contractors/:contractorId/projects
 * @description Get all projects assigned to a specific contractor using the join table.
 * @access Private (contractor only)
 */
router.get('/:contractorId/projects', async (req, res) => {
    const { contractorId } = req.params;
    try {
        const DB_TYPE = process.env.DB_TYPE || 'mysql';
        
        let query;
        let queryParams = [contractorId];
        
        if (DB_TYPE === 'postgresql') {
            // PostgreSQL: Extract approval fields from JSONB
            query = `
                SELECT 
                    p.project_id AS id,
                    p.name AS "projectName",
                    p.description AS "projectDescription",
                    p.implementing_agency AS directorate,
                    (p.timeline->>'start_date')::date AS "startDate",
                    (p.timeline->>'expected_completion_date')::date AS "endDate",
                    (p.budget->>'allocated_amount_kes')::numeric AS "costOfProject",
                    (p.budget->>'disbursed_amount_kes')::numeric AS "paidOut",
                    p.progress->>'status' AS status,
                    p.created_at AS "createdAt",
                    p.updated_at AS "updatedAt",
                    (p.is_public->>'approved')::boolean AS approved_for_public,
                    (p.is_public->>'approved_by')::integer AS approved_by,
                    (p.is_public->>'approved_at')::timestamp AS approved_at,
                    p.is_public->>'approval_notes' AS approval_notes,
                    (p.is_public->>'revision_requested')::boolean AS revision_requested,
                    p.is_public->>'revision_notes' AS revision_notes,
                    (p.is_public->>'revision_requested_by')::integer AS revision_requested_by,
                    (p.is_public->>'revision_requested_at')::timestamp AS revision_requested_at,
                    (p.is_public->>'revision_submitted_at')::timestamp AS revision_submitted_at
                FROM projects p
                JOIN project_contractor_assignments pca ON p.project_id = pca."projectId"
                WHERE pca."contractorId" = $1 AND (pca.voided IS NULL OR pca.voided = false) AND p.voided = false
            `;
        } else {
            // MySQL: Direct column access
            query = `
                SELECT 
                    p.id,
                    p.projectName,
                    p.projectDescription,
                    p.directorate,
                    p.startDate,
                    p.endDate,
                    p.costOfProject,
                    p.paidOut,
                    p.status,
                    p.createdAt,
                    p.updatedAt,
                    p.approved_for_public,
                    p.approved_by,
                    p.approved_at,
                    p.approval_notes,
                    p.revision_requested,
                    p.revision_notes,
                    p.revision_requested_by,
                    p.revision_requested_at,
                    p.revision_submitted_at
                FROM projects p
                JOIN project_contractor_assignments pca ON p.id = pca.projectId
                WHERE pca.contractorId = ? AND (pca.voided IS NULL OR pca.voided = 0) AND p.voided = 0
            `;
        }
        
        const result = await pool.query(query, queryParams);
        const rows = DB_TYPE === 'postgresql' ? (result.rows || result) : (Array.isArray(result) ? result[0] : result);
        
        res.status(200).json(rows);
    } catch (error) {
        console.error('Error fetching contractor projects:', error);
        res.status(500).json({ message: 'Error fetching contractor projects', error: error.message });
    }
});

// --- Get Payment Requests by a Contractor ---
/**
 * @route GET /api/contractors/:contractorId/payment-requests
 * @description Get all payment requests submitted by a specific contractor.
 * @access Private (contractor only)
 */
router.get('/:contractorId/payment-requests', async (req, res) => {
    const { contractorId } = req.params;
    try {
        const [rows] = await pool.query(
            'SELECT * FROM project_payment_requests WHERE contractorId = ? AND voided = 0 ORDER BY submittedAt DESC',
            [contractorId]
        );
        res.status(200).json(rows);
    } catch (error) {
        console.error('Error fetching contractor payment requests:', error);
        res.status(500).json({ message: 'Error fetching contractor payment requests', error: error.message });
    }
});

// --- Get Photos by a Contractor ---
/**
 * @route GET /api/contractors/:contractorId/photos
 * @description Get all photos uploaded by a specific contractor from the `project_documents` table.
 * @access Private (contractor only)
 */
router.get('/:contractorId/photos', async (req, res) => {
    const { contractorId } = req.params;
    try {
        const [rows] = await pool.query(
            `SELECT
                id AS photoId,
                projectId,
                documentPath AS filePath,
                description AS caption,
                status,
                createdAt AS submittedAt
             FROM project_documents
             WHERE userId = ? AND documentType = 'photo' AND voided = 0
             ORDER BY createdAt DESC`,
            [contractorId] // Assuming userId in documents table corresponds to contractorId
        );
        res.status(200).json(rows);
    } catch (error) {
        console.error('Error fetching contractor photos:', error);
        res.status(500).json({ message: 'Error fetching contractor photos', error: error.message });
    }
});

// --- Photo Upload Route ---
/**
 * @route POST /api/contractors/:contractorId/photos
 * @description A contractor uploads a new photo, which is stored in the `project_documents` table.
 * @access Private (contractor only)
 */
router.post('/:contractorId/photos', upload.single('file'), async (req, res) => {
    const { contractorId } = req.params;
    const { projectId, caption } = req.body;
    const file = req.file;
    if (!file || !projectId) {
        return res.status(400).json({ message: 'File and projectId are required.' });
    }
    const newDocument = {
        projectId,
        documentType: 'photo',
        documentCategory: 'general',
        documentPath: file.path,
        description: caption || `Photo submitted by contractor ${contractorId}`,
        userId: contractorId,
        status: 'pending_review',
        voided: 0,
    };
    try {
        const [result] = await pool.query('INSERT INTO project_documents SET ?', newDocument);
        res.status(201).json({ message: 'Photo uploaded successfully', photoId: result.insertId });
    } catch (error) {
        console.error('Error uploading contractor photo:', error);
        res.status(500).json({ message: 'Error uploading contractor photo', error: error.message });
    }
});

// --- Get All Contractors ---
/**
 * @route GET /api/contractors
 * @description Get all active contractors.
 * @access Private (admin only)
 */
router.get('/', async (req, res) => {
    try {
        const [hasContractors, hasKemriContractors] = await Promise.all([
            tableExists('contractors'),
            tableExists('kemri_contractors'),
        ]);
        if (!hasContractors && !hasKemriContractors) {
            return res.status(200).json([]);
        }
        const rows = await queryRowsFallbackTables(
            [
                () =>
                    isPostgres
                        ? `SELECT "contractorId", "companyName", "contactPerson", email, phone
                           FROM contractors WHERE COALESCE(voided, false) = false ORDER BY "companyName" ASC`
                        : `SELECT contractorId, companyName, contactPerson, email, phone
                           FROM contractors WHERE voided = 0 ORDER BY companyName ASC`,
                () =>
                    isPostgres
                        ? `SELECT "contractorId", "companyName", "contactPerson", email, phone
                           FROM contractors WHERE COALESCE(voided, 0) = 0 ORDER BY "companyName" ASC`
                        : `SELECT contractorId, companyName, contactPerson, email, phone
                           FROM contractors WHERE voided = 0 ORDER BY companyName ASC`,
                () =>
                    isPostgres
                        ? `SELECT "contractorId", "companyName", "contactPerson", email, phone
                           FROM contractors ORDER BY "companyName" ASC`
                        : `SELECT contractorId, companyName, contactPerson, email, phone
                           FROM contractors ORDER BY companyName ASC`,
                () =>
                    isPostgres
                        ? `SELECT "contractorId", "companyName", "contactPerson", email, phone
                           FROM kemri_contractors WHERE COALESCE(voided, false) = false ORDER BY "companyName" ASC`
                        : `SELECT contractorId, companyName, contactPerson, email, phone
                           FROM kemri_contractors WHERE voided = 0 ORDER BY companyName ASC`,
                () =>
                    isPostgres
                        ? `SELECT "contractorId", "companyName", "contactPerson", email, phone
                           FROM kemri_contractors WHERE COALESCE(voided, 0) = 0 ORDER BY "companyName" ASC`
                        : `SELECT contractorId, companyName, contactPerson, email, phone
                           FROM kemri_contractors WHERE voided = 0 ORDER BY companyName ASC`,
                () =>
                    isPostgres
                        ? `SELECT * FROM contractors`
                        : `SELECT * FROM contractors`,
                () =>
                    isPostgres
                        ? `SELECT * FROM kemri_contractors`
                        : `SELECT * FROM kemri_contractors`,
            ],
            []
        );
        const normalized = rows.map((r) => ({
            contractorId: rowVal(r, 'contractorId', 'contractor_id', 'id'),
            companyName: rowVal(r, 'companyName', 'company_name', 'name') || '',
            contactPerson: rowVal(r, 'contactPerson', 'contact_person') || '',
            email: rowVal(r, 'email') || '',
            phone: rowVal(r, 'phone') || '',
        }));
        res.status(200).json(normalized);
    } catch (error) {
        console.error('Error fetching contractors:', error);
        res.status(500).json({ message: 'Error fetching contractors', error: error.message });
    }
});

// --- Create New Contractor ---
/**
 * @route POST /api/contractors
 * @description Creates a new contractor record.
 * @access Private (admin only)
 */
router.post('/', async (req, res) => {
    const { companyName, contactPerson, email, phone, userId } = req.body;
    if (!companyName || !email) {
        return res.status(400).json({ message: 'Company name and email are required.' });
    }
    try {
        const activeTable = await ensureContractorsTable();
        let insertedId = null;
        if (isPostgres) {
            const tryQueries = [
                () => `INSERT INTO ${activeTable} ("companyName", "contactPerson", email, phone, "userId", voided)
                       VALUES ($1, $2, $3, $4, $5, false)
                       RETURNING "contractorId"`,
            ];
            let lastErr = null;
            for (const getSql of tryQueries) {
                try {
                    const result = await pool.query(getSql(), [companyName, contactPerson, email, phone, userId || null]);
                    insertedId = rowsOf(result)?.[0]?.contractorId || null;
                    break;
                } catch (e) {
                    lastErr = e;
                    if (!isMissingRelation(e)) throw e;
                }
            }
            if (!insertedId && lastErr) throw lastErr;
        } else {
            const result = await pool.query(
                `INSERT INTO ${activeTable} (companyName, contactPerson, email, phone, userId) VALUES (?, ?, ?, ?, ?)`,
                [companyName, contactPerson, email, phone, userId]
            );
            insertedId = metaOf(result).insertId || null;
        }
        res.status(201).json({ 
            message: 'Contractor created successfully', 
            contractorId: insertedId
        });
    } catch (error) {
        console.error('Error creating contractor:', error);
        res.status(500).json({ message: 'Error creating contractor', error: error.message });
    }
});

// --- Update Contractor ---
/**
 * @route PUT /api/contractors/:contractorId
 * @description Updates an existing contractor's details.
 * @access Private (admin only)
 */
router.put('/:contractorId', async (req, res) => {
    const { contractorId } = req.params;
    const updatedFields = req.body;
    
    // Check if there are any fields to update
    if (Object.keys(updatedFields).length === 0) {
        return res.status(400).json({ message: 'No fields provided for update.' });
    }

    try {
        let affected = 0;
        if (isPostgres) {
            const fields = [];
            const params = [];
            const push = (col, val) => {
                params.push(val);
                fields.push(`"${col}" = $${params.length}`);
            };
            if (updatedFields.companyName !== undefined) push('companyName', updatedFields.companyName);
            if (updatedFields.contactPerson !== undefined) push('contactPerson', updatedFields.contactPerson);
            if (updatedFields.email !== undefined) push('email', updatedFields.email);
            if (updatedFields.phone !== undefined) push('phone', updatedFields.phone);
            if (updatedFields.userId !== undefined) push('userId', updatedFields.userId);
            if (!fields.length) return res.status(400).json({ message: 'No supported fields provided for update.' });
            params.push(Number(contractorId));
            const whereParam = `$${params.length}`;
            const tryQueries = [
                `UPDATE contractors SET ${fields.join(', ')} WHERE "contractorId" = ${whereParam}`,
                `UPDATE kemri_contractors SET ${fields.join(', ')} WHERE "contractorId" = ${whereParam}`,
            ];
            for (const sql of tryQueries) {
                try {
                    const result = await pool.query(sql, params);
                    const meta = metaOf(result);
                    affected = meta.rowCount || meta.affectedRows || 0;
                    if (affected > 0) break;
                } catch (e) {
                    if (!isMissingRelation(e)) throw e;
                }
            }
        } else {
            const result = await pool.query(
                'UPDATE contractors SET ? WHERE contractorId = ?',
                [updatedFields, contractorId]
            );
            affected = metaOf(result).affectedRows || 0;
        }
        if (!affected) return res.status(404).json({ message: 'Contractor not found.' });
        res.status(200).json({ message: 'Contractor updated successfully.' });
    } catch (error) {
        console.error('Error updating contractor:', error);
        res.status(500).json({ message: 'Error updating contractor', error: error.message });
    }
});

// --- Soft Delete Contractor ---
/**
 * @route PUT /api/contractors/:contractorId/void
 * @description Soft-deletes a contractor by setting the 'voided' flag to 1.
 * @access Private (admin only)
 */
router.delete('/:contractorId', async (req, res) => {
    const { contractorId } = req.params;
    try {
        let affected = 0;
        if (isPostgres) {
            const tryQueries = [
                `UPDATE contractors SET voided = true WHERE "contractorId" = $1`,
                `UPDATE kemri_contractors SET voided = true WHERE "contractorId" = $1`,
            ];
            for (const sql of tryQueries) {
                try {
                    const result = await pool.query(sql, [Number(contractorId)]);
                    const meta = metaOf(result);
                    affected = meta.rowCount || meta.affectedRows || 0;
                    if (affected > 0) break;
                } catch (e) {
                    if (!isMissingRelation(e)) throw e;
                }
            }
        } else {
            const result = await pool.query(
                'UPDATE contractors SET voided = 1 WHERE contractorId = ?',
                [contractorId]
            );
            affected = metaOf(result).affectedRows || 0;
        }
        if (!affected) return res.status(404).json({ message: 'Contractor not found.' });
        res.status(200).json({ message: 'Contractor voided successfully.' });
    } catch (error) {
        console.error('Error voiding contractor:', error);
        res.status(500).json({ message: 'Error voiding contractor', error: error.message });
    }
});
module.exports = router;
