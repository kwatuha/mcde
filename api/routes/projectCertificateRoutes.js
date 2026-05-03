const express = require('express');
const router = express.Router();
const pool = require('../config/db'); // Import the database connection pool
const auth = require('../middleware/authenticate');
const privilege = require('../middleware/privilegeMiddleware');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const approvalWorkflowEngine = require('../services/approvalWorkflowEngine');

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

/** Repo root (…/machakos), two levels above this routes file. */
const REPO_ROOT = path.join(__dirname, '..', '..');

/**
 * Resolve `projectcertificate.path` to an absolute path on disk.
 * Legacy rows often stored `/uploads/projects/...`; `path.join(REPO_ROOT, '/uploads/...')` ignores
 * REPO_ROOT on POSIX and points at filesystem `/uploads/...` (wrong). Strip leading slashes first.
 * Windows absolute paths (e.g. `D:\...`) are returned normalized when present.
 */
function resolveStoredCertificateFilePath(dbPath) {
    if (dbPath == null) return null;
    const trimmed = String(dbPath).trim();
    if (!trimmed) return null;
    const forward = trimmed.replace(/\\/g, '/');
    if (/^[a-zA-Z]:\//.test(forward)) {
        return path.normalize(trimmed);
    }
    const relative = forward.replace(/^\/+/, '');
    if (!relative) return null;
    return path.join(REPO_ROOT, relative);
}

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
        await approvalWorkflowEngine.ensureReady();
        if (isPostgres) await ensurePostgresTable();
        /** Same entity_id / entity_type mapping as finance-list and ApprovalWorkflowPanel. */
        const entityTypes = `('project_certificate','payment_certificate','certificate')`;
        const sql = isPostgres
            ? `WITH latest_ar AS (
                    SELECT DISTINCT ON (entity_id) entity_id, request_id, status
                    FROM approval_requests
                    WHERE entity_type IN ${entityTypes}
                    ORDER BY entity_id, request_id DESC
                  )
                  SELECT c.*,
                    lar.status AS "approvalWorkflowStatus",
                    lar.request_id AS "approvalRequestId",
                    (
                      SELECT si.step_name FROM approval_step_instances si
                      WHERE si.request_id = lar.request_id AND si.status = 'pending'
                      ORDER BY si.step_order ASC LIMIT 1
                    ) AS "approvalCurrentStepName",
                    (
                      SELECT si.step_order FROM approval_step_instances si
                      WHERE si.request_id = lar.request_id AND si.status = 'pending'
                      ORDER BY si.step_order ASC LIMIT 1
                    ) AS "approvalCurrentStepOrder",
                    (
                      SELECT COUNT(*)::int FROM approval_step_instances si
                      WHERE si.request_id = lar.request_id
                    ) AS "approvalTotalSteps"
                  FROM projectcertificate c
                  LEFT JOIN latest_ar lar ON lar.entity_id = c."certificateId"::text
                  WHERE c."projectId" = $1 AND COALESCE(c.voided, false) = false
                  ORDER BY c."requestDate" DESC NULLS LAST, c."certificateId" DESC`
            : `SELECT c.*,
                    (
                      SELECT ar.status FROM approval_requests ar
                      WHERE ar.entity_id = CAST(c.certificateId AS CHAR)
                        AND ar.entity_type IN ${entityTypes}
                      ORDER BY ar.request_id DESC LIMIT 1
                    ) AS approvalWorkflowStatus,
                    (
                      SELECT ar.request_id FROM approval_requests ar
                      WHERE ar.entity_id = CAST(c.certificateId AS CHAR)
                        AND ar.entity_type IN ${entityTypes}
                      ORDER BY ar.request_id DESC LIMIT 1
                    ) AS approvalRequestId,
                    (
                      SELECT si.step_name FROM approval_step_instances si
                      WHERE si.request_id = (
                        SELECT ar.request_id FROM approval_requests ar
                        WHERE ar.entity_id = CAST(c.certificateId AS CHAR)
                          AND ar.entity_type IN ${entityTypes}
                        ORDER BY ar.request_id DESC LIMIT 1
                      )
                      AND si.status = 'pending'
                      ORDER BY si.step_order ASC LIMIT 1
                    ) AS approvalCurrentStepName,
                    (
                      SELECT si.step_order FROM approval_step_instances si
                      WHERE si.request_id = (
                        SELECT ar.request_id FROM approval_requests ar
                        WHERE ar.entity_id = CAST(c.certificateId AS CHAR)
                          AND ar.entity_type IN ${entityTypes}
                        ORDER BY ar.request_id DESC LIMIT 1
                      )
                      AND si.status = 'pending'
                      ORDER BY si.step_order ASC LIMIT 1
                    ) AS approvalCurrentStepOrder,
                    (
                      SELECT COUNT(*) FROM approval_step_instances si
                      WHERE si.request_id = (
                        SELECT ar.request_id FROM approval_requests ar
                        WHERE ar.entity_id = CAST(c.certificateId AS CHAR)
                          AND ar.entity_type IN ${entityTypes}
                        ORDER BY ar.request_id DESC LIMIT 1
                      )
                    ) AS approvalTotalSteps
               FROM projectcertificate c
               WHERE c.projectId = ? AND (c.voided IS NULL OR c.voided = 0)
               ORDER BY c.requestDate DESC, c.certificateId DESC`;
        const rows = await queryRows(sql, [projectId]);
        res.status(200).json(rows);
    } catch (error) {
        console.error('Error fetching project certificates by project:', error);
        res.status(500).json({ message: 'Error fetching project certificates', error: error.message });
    }
});

/**
 * @route GET /api/projects/project_certificates/finance-list
 * @description All project certificates with project name (same records as the project Certificates tab).
 * @query pendingMe=1 — only rows where the current user's role matches the pending approval step (dashboard “pending for me”).
 * @access Private — document.read_all
 */
router.get('/finance-list', auth, privilege(['document.read_all']), async (req, res) => {
    try {
        await approvalWorkflowEngine.ensureReady();
        if (isPostgres) await ensurePostgresTable();
        /** entity_id on approval_requests matches certificateId as text (see generic workflow). */
        const entityTypes = `('project_certificate','payment_certificate','certificate')`;
        const pendingMe =
            req.query.pendingMe === '1' ||
            req.query.pendingMe === 'true' ||
            String(req.query.pendingMe || '').toLowerCase() === 'yes';
        const roleIdRaw = req.user?.roleId ?? req.user?.roleid;
        const roleId = roleIdRaw != null ? Number(roleIdRaw) : NaN;
        const applyPendingMe = pendingMe && Number.isFinite(roleId) && roleId > 0;
        if (pendingMe && !applyPendingMe) {
            console.warn(
                'finance-list: pendingMe was requested but user has no usable roleId; returning full list (re-login after role assignment).'
            );
        }

        const pendingFilterPg = applyPendingMe
            ? ` AND EXISTS (
                    SELECT 1 FROM approval_requests ar
                    INNER JOIN approval_step_instances si
                      ON si.request_id = ar.request_id AND si.status = 'pending'
                    WHERE ar.entity_type IN ${entityTypes}
                      AND ar.entity_id = c."certificateId"::text
                      AND ar.status = 'pending'
                      AND si.role_id = $1
                  )`
            : '';

        const pendingFilterMysql = applyPendingMe
            ? ` AND EXISTS (
                    SELECT 1 FROM approval_requests ar
                    INNER JOIN approval_step_instances si
                      ON si.request_id = ar.request_id AND si.status = 'pending'
                    WHERE ar.entity_type IN ${entityTypes}
                      AND ar.entity_id = CAST(c.certificateId AS CHAR)
                      AND ar.status = 'pending'
                      AND si.role_id = ?
                  )`
            : '';

        const sql = isPostgres
            ? `WITH latest_ar AS (
                    SELECT DISTINCT ON (entity_id) entity_id, request_id, status
                    FROM approval_requests
                    WHERE entity_type IN ${entityTypes}
                    ORDER BY entity_id, request_id DESC
                  )
                  SELECT c."certificateId" AS id,
                      c."projectId" AS "projectId",
                      p.name AS "projectName",
                      c.path AS "documentPath",
                      COALESCE(
                        NULLIF(TRIM(c."fileName"), ''),
                        NULLIF(TRIM(c."certNumber"), ''),
                        CONCAT('Certificate ', c."certificateId"::text)
                      ) AS "originalFileName",
                      c."requestDate" AS "createdAt",
                      c."certType" AS "certType",
                      c."certSubType" AS "certSubType",
                      c."certNumber" AS "certNumber",
                      c."applicationStatus" AS "applicationStatus",
                      c."progressStatus" AS "progressStatus",
                      c."awardDate" AS "awardDate",
                      lar.status AS "approvalWorkflowStatus",
                      lar.request_id AS "approvalRequestId",
                      (
                        SELECT si.step_name FROM approval_step_instances si
                        WHERE si.request_id = lar.request_id AND si.status = 'pending'
                        ORDER BY si.step_order ASC LIMIT 1
                      ) AS "approvalCurrentStepName",
                      (
                        SELECT si.step_order FROM approval_step_instances si
                        WHERE si.request_id = lar.request_id AND si.status = 'pending'
                        ORDER BY si.step_order ASC LIMIT 1
                      ) AS "approvalCurrentStepOrder",
                      (
                        SELECT COUNT(*)::int FROM approval_step_instances si
                        WHERE si.request_id = lar.request_id
                      ) AS "approvalTotalSteps"
               FROM projectcertificate c
               INNER JOIN projects p ON p.project_id = c."projectId"
               LEFT JOIN latest_ar lar ON lar.entity_id = c."certificateId"::text
               WHERE COALESCE(c.voided, false) = false
                 AND COALESCE(p.voided, false) = false
                 ${pendingFilterPg}
               ORDER BY p.name ASC NULLS LAST, c."requestDate" DESC NULLS LAST, c."certificateId" DESC`
            : `SELECT c.certificateId AS id,
                      c.projectId AS projectId,
                      p.projectName AS projectName,
                      c.path AS documentPath,
                      COALESCE(NULLIF(TRIM(c.certNumber), ''), CONCAT('Certificate #', c.certificateId)) AS originalFileName,
                      c.requestDate AS createdAt,
                      c.certType AS certType,
                      c.certSubType AS certSubType,
                      c.certNumber AS certNumber,
                      c.applicationStatus AS applicationStatus,
                      c.progressStatus AS progressStatus,
                      c.awardDate AS awardDate,
                      (
                        SELECT ar.status FROM approval_requests ar
                        WHERE ar.entity_id = CAST(c.certificateId AS CHAR)
                          AND ar.entity_type IN ${entityTypes}
                        ORDER BY ar.request_id DESC LIMIT 1
                      ) AS approvalWorkflowStatus,
                      (
                        SELECT ar.request_id FROM approval_requests ar
                        WHERE ar.entity_id = CAST(c.certificateId AS CHAR)
                          AND ar.entity_type IN ${entityTypes}
                        ORDER BY ar.request_id DESC LIMIT 1
                      ) AS approvalRequestId,
                      (
                        SELECT si.step_name FROM approval_step_instances si
                        WHERE si.request_id = (
                          SELECT ar.request_id FROM approval_requests ar
                          WHERE ar.entity_id = CAST(c.certificateId AS CHAR)
                            AND ar.entity_type IN ${entityTypes}
                          ORDER BY ar.request_id DESC LIMIT 1
                        )
                        AND si.status = 'pending'
                        ORDER BY si.step_order ASC LIMIT 1
                      ) AS approvalCurrentStepName,
                      (
                        SELECT si.step_order FROM approval_step_instances si
                        WHERE si.request_id = (
                          SELECT ar.request_id FROM approval_requests ar
                          WHERE ar.entity_id = CAST(c.certificateId AS CHAR)
                            AND ar.entity_type IN ${entityTypes}
                          ORDER BY ar.request_id DESC LIMIT 1
                        )
                        AND si.status = 'pending'
                        ORDER BY si.step_order ASC LIMIT 1
                      ) AS approvalCurrentStepOrder,
                      (
                        SELECT COUNT(*) FROM approval_step_instances si
                        WHERE si.request_id = (
                          SELECT ar.request_id FROM approval_requests ar
                          WHERE ar.entity_id = CAST(c.certificateId AS CHAR)
                            AND ar.entity_type IN ${entityTypes}
                          ORDER BY ar.request_id DESC LIMIT 1
                        )
                      ) AS approvalTotalSteps
               FROM projectcertificate c
               INNER JOIN kemri_projects p ON p.id = c.projectId
               WHERE (c.voided IS NULL OR c.voided = 0) AND (p.voided IS NULL OR p.voided = 0)
                 ${pendingFilterMysql}
               ORDER BY p.projectName ASC, c.requestDate DESC, c.certificateId DESC`;
        const params = applyPendingMe ? [roleId] : [];
        const rows = await queryRows(sql, params);
        res.status(200).json(Array.isArray(rows) ? rows : []);
    } catch (error) {
        console.error('Error fetching finance certificate list:', error);
        res.status(500).json({ message: 'Error fetching payment certificates', error: error.message });
    }
});

/**
 * @route GET /api/projects/project_certificates/:id/download
 * @description Download a certificate attachment (must be registered before `/:id` so Express does not treat "download" as an id).
 * @access Same as finance list — document.read_all (Bearer token required; not for anonymous hotlinking).
 */
router.get('/:id/download', privilege(['document.read_all']), async (req, res) => {
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
        const storedPath = cert.path ?? cert.Path;
        if (!storedPath) {
            return res.status(404).json({ message: 'Certificate file not found' });
        }

        const fullPath = resolveStoredCertificateFilePath(storedPath);
        if (!fullPath || !fs.existsSync(fullPath)) {
            console.warn(
                'Certificate download: file missing. certificateId=%s storedPath=%s resolved=%s',
                id,
                storedPath,
                fullPath || '(null)'
            );
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
            const certPath = rows?.[0]?.path ?? rows?.[0]?.Path;
            if (certPath) {
                const fullPath = resolveStoredCertificateFilePath(certPath);
                if (fullPath && fs.existsSync(fullPath)) {
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
