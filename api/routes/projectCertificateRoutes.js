const express = require('express');
const router = express.Router();
const pool = require('../config/db'); // Import the database connection pool
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const baseUploadDir = path.join(__dirname, '..', '..', 'uploads', 'projects');
if (!fs.existsSync(baseUploadDir)) {
    fs.mkdirSync(baseUploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const projectId = req.body.projectId || 'unknown';
        const dir = path.join(baseUploadDir, String(projectId), 'certificates');
        fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname || '');
        cb(null, `${crypto.randomUUID()}${ext}`);
    },
});
const upload = multer({ storage });
const DB_TYPE = process.env.DB_TYPE || 'mysql';
const isPostgres = DB_TYPE === 'postgresql';

const ensurePostgresTable = async () => {
    if (!isPostgres) return;
    await pool.query(`
        CREATE TABLE IF NOT EXISTS projectcertificate (
            "certificateId" SERIAL PRIMARY KEY,
            "projectId" INTEGER NOT NULL,
            "statusId" INTEGER NULL,
            "requestDate" TIMESTAMP NULL,
            "awardDate" TIMESTAMP NULL,
            "progressStatus" TEXT NULL,
            "applicationStatus" TEXT NULL,
            "certType" TEXT NULL,
            "certSubType" TEXT NULL,
            "certNumber" TEXT NULL,
            path TEXT NULL,
            "fileName" TEXT NULL,
            "approvedBy" TEXT NULL,
            "requesterRemarks" TEXT NULL,
            "approverRemarks" TEXT NULL,
            "certificateData" JSONB NULL,
            "uploadSource" TEXT NULL,
            voided BOOLEAN DEFAULT FALSE,
            "voidedBy" TEXT NULL
        )
    `);
    await pool.query(`
        ALTER TABLE projectcertificate
        ADD COLUMN IF NOT EXISTS "certificateData" JSONB NULL
    `);
    await pool.query(`
        ALTER TABLE projectcertificate
        ADD COLUMN IF NOT EXISTS "uploadSource" TEXT NULL
    `);
};

const queryRows = async (sql, params = []) => {
    const result = await pool.query(sql, params);
    if (Array.isArray(result)) return result[0] || [];
    return result?.rows || [];
};

// --- CRUD Operations for Project Certificates (projectcertificate) ---

/**
 * @route GET /api/projects/project_certificates
 * @description Get all project certificates.
 */
router.get('/', async (req, res) => {
    try {
        if (isPostgres) await ensurePostgresTable();
        const rows = await queryRows('SELECT * FROM projectcertificate');
        res.status(200).json(rows);
    } catch (error) {
        console.error('Error fetching project certificates:', error);
        res.status(500).json({ message: 'Error fetching project certificates', error: error.message });
    }
});

/**
 * @route GET /api/projects/project_certificates/project/:projectId
 * @description Get certificates for one project.
 */
router.get('/project/:projectId', async (req, res) => {
    const { projectId } = req.params;
    try {
        if (isPostgres) await ensurePostgresTable();
        const rows = await queryRows(
            isPostgres
                ? 'SELECT * FROM projectcertificate WHERE "projectId" = $1 AND COALESCE(voided, false) = false ORDER BY "requestDate" DESC, "certificateId" DESC'
                : 'SELECT * FROM projectcertificate WHERE projectId = ? AND (voided IS NULL OR voided = 0) ORDER BY requestDate DESC, certificateId DESC',
            [projectId]
        );
        res.status(200).json(rows);
    } catch (error) {
        console.error('Error fetching project certificates by project:', error);
        res.status(500).json({ message: 'Error fetching project certificates', error: error.message });
    }
});

/**
 * @route GET /api/projects/project_certificates/:id
 * @description Get a single project certificate by ID.
 */
router.get('/:id', async (req, res) => {
    const { id } = req.params;
    try {
        if (isPostgres) await ensurePostgresTable();
        const rows = await queryRows(
            isPostgres
                ? 'SELECT * FROM projectcertificate WHERE "certificateId" = $1'
                : 'SELECT * FROM projectcertificate WHERE certificateId = ?',
            [id]
        );
        if (rows.length > 0) {
            res.status(200).json(rows[0]);
        } else {
            res.status(404).json({ message: 'Project certificate not found' });
        }
    } catch (error) {
        console.error('Error fetching project certificate:', error);
        res.status(500).json({ message: 'Error fetching project certificate', error: error.message });
    }
});

/**
 * @route POST /api/projects/project_certificates/upload
 * @description Upload certificate file and create certificate record.
 */
router.post('/upload', upload.single('document'), async (req, res) => {
    const {
        projectId,
        statusId = null,
        requestDate = null,
        awardDate = null,
        progressStatus = null,
        applicationStatus = 'pending',
        certType = null,
        certSubType = null,
        certNumber = null,
        approvedBy = null,
        requesterRemarks = null,
        approverRemarks = null,
        certificateData = null,
        uploadSource = null,
    } = req.body;

    if (!projectId) {
        return res.status(400).json({ message: 'projectId is required.' });
    }
    if (!req.file) {
        return res.status(400).json({ message: 'Certificate file is required.' });
    }

    const relativePath = path.relative(path.join(__dirname, '..', '..'), req.file.path).replace(/\\/g, '/');
    const payload = {
        projectId,
        statusId,
        requestDate: requestDate || null,
        awardDate: awardDate || null,
        progressStatus,
        applicationStatus,
        certType,
        certSubType,
        certNumber,
        path: relativePath,
        approvedBy,
        requesterRemarks,
        approverRemarks,
        certificateData: certificateData || null,
        uploadSource: uploadSource || null,
        voided: 0,
        voidedBy: null,
    };

    try {
        if (isPostgres) await ensurePostgresTable();
        let certificateId;
        if (isPostgres) {
            const insertRes = await pool.query(
                `INSERT INTO projectcertificate (
                    "projectId","statusId","requestDate","awardDate","progressStatus","applicationStatus",
                    "certType","certSubType","certNumber",path,"fileName","approvedBy","requesterRemarks",
                    "approverRemarks","certificateData","uploadSource",voided,"voidedBy"
                ) VALUES (
                    $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb,$16,$17,$18
                ) RETURNING "certificateId"`,
                [
                    Number(projectId),
                    statusId ? Number(statusId) : null,
                    requestDate || null,
                    awardDate || null,
                    progressStatus,
                    applicationStatus,
                    certType,
                    certSubType,
                    certNumber,
                    relativePath,
                    req.file.originalname || null,
                    approvedBy,
                    requesterRemarks,
                    approverRemarks,
                    certificateData ? String(certificateData) : null,
                    uploadSource || null,
                    false,
                    null,
                ]
            );
            certificateId = insertRes.rows?.[0]?.certificateId;
        } else {
            const [result] = await pool.query('INSERT INTO projectcertificate SET ?', payload);
            certificateId = result.insertId;
        }
        res.status(201).json({
            certificateId,
            ...payload,
            fileName: req.file.originalname,
        });
    } catch (error) {
        console.error('Error uploading project certificate:', error);
        res.status(500).json({ message: 'Error uploading project certificate', error: error.message });
    }
});

/**
 * @route POST /api/projects/project_certificates
 * @description Create a new project certificate.
 */
router.post('/', async (req, res) => {
    const newCertificate = {
        certificateId: req.body.certificateId || `pcert${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        voided: false,
        voidedBy: null,
        ...req.body
    };
    try {
        const [result] = await pool.query('INSERT INTO projectcertificate SET ?', newCertificate);
        if (result.insertId) {
            newCertificate.certificateId = result.insertId;
        }
        res.status(201).json(newCertificate);
    } catch (error) {
        console.error('Error creating project certificate:', error);
        res.status(500).json({ message: 'Error creating project certificate', error: error.message });
    }
});

/**
 * @route GET /api/projects/project_certificates/:id/download
 * @description Download a certificate attachment.
 */
router.get('/:id/download', async (req, res) => {
    const { id } = req.params;
    try {
        if (isPostgres) await ensurePostgresTable();
        const rows = await queryRows(
            isPostgres
                ? 'SELECT * FROM projectcertificate WHERE "certificateId" = $1'
                : 'SELECT * FROM projectcertificate WHERE certificateId = ?',
            [id]
        );
        if (!rows.length) {
            return res.status(404).json({ message: 'Project certificate not found' });
        }

        const cert = rows[0];
        if (!cert.path) {
            return res.status(404).json({ message: 'Certificate file not found' });
        }

        const fullPath = path.join(__dirname, '..', '..', cert.path);
        if (!fs.existsSync(fullPath)) {
            return res.status(404).json({ message: 'Certificate file missing on server' });
        }

        const fallbackName = cert.certNumber ? `${cert.certNumber}` : `certificate-${id}`;
        return res.download(fullPath, path.basename(fullPath) || fallbackName);
    } catch (error) {
        console.error('Error downloading project certificate:', error);
        res.status(500).json({ message: 'Error downloading project certificate', error: error.message });
    }
});

/**
 * @route PUT /api/projects/project_certificates/:id
 * @description Update an existing project certificate.
 */
router.put('/:id', async (req, res) => {
    const { id } = req.params;
    const updatedFields = { ...req.body };
    try {
        const [result] = await pool.query('UPDATE projectcertificate SET ? WHERE certificateId = ?', [updatedFields, id]);
        if (result.affectedRows > 0) {
            const [rows] = await pool.query('SELECT * FROM projectcertificate WHERE certificateId = ?', [id]);
            res.status(200).json(rows[0]);
        } else {
            res.status(404).json({ message: 'Project certificate not found' });
        }
    } catch (error) {
        console.error('Error updating project certificate:', error);
        res.status(500).json({ message: 'Error updating project certificate', error: error.message });
    }
});

/**
 * @route DELETE /api/projects/project_certificates/:id
 * @description Delete a project certificate.
 */
router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    try {
        if (isPostgres) await ensurePostgresTable();
        const rows = await queryRows(
            isPostgres
                ? 'SELECT path FROM projectcertificate WHERE "certificateId" = $1'
                : 'SELECT path FROM projectcertificate WHERE certificateId = ?',
            [id]
        );
        let deleted = false;
        if (isPostgres) {
            const result = await pool.query('DELETE FROM projectcertificate WHERE "certificateId" = $1', [id]);
            deleted = (result.rowCount || 0) > 0;
        } else {
            const [result] = await pool.query('DELETE FROM projectcertificate WHERE certificateId = ?', [id]);
            deleted = result.affectedRows > 0;
        }
        if (deleted) {
            const certPath = rows?.[0]?.path;
            if (certPath) {
                const fullPath = path.join(__dirname, '..', '..', certPath);
                if (fs.existsSync(fullPath)) {
                    fs.unlinkSync(fullPath);
                }
            }
            res.status(204).send();
        } else {
            res.status(404).json({ message: 'Project certificate not found' });
        }
    } catch (error) {
        console.error('Error deleting project certificate:', error);
        res.status(500).json({ message: 'Error deleting project certificate', error: error.message });
    }
});

module.exports = router;
