const express = require('express');
const router = express.Router();
const multer = require('multer');
const ExcelJS = require('exceljs');
const XLSX = require('xlsx');
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
async function getTableColumns(tableName) {
    try {
        if (isPostgres) {
            const q = await pool.query(
                `SELECT column_name
                   FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = $1`,
                [tableName]
            );
            return new Set((rowsOf(q) || []).map((r) => String(r.column_name || '').trim()).filter(Boolean));
        }
        const q = await pool.query(`SHOW COLUMNS FROM ${tableName}`);
        const cols = rowsOf(q) || [];
        return new Set(cols.map((c) => String(c.Field || '').trim()).filter(Boolean));
    } catch (_) {
        return new Set();
    }
}
async function ensureContractorsTable() {
    const hasContractors = await tableExists('contractors');
    if (hasContractors) {
        if (isPostgres) {
            await pool.query(`ALTER TABLE contractors ADD COLUMN IF NOT EXISTS "contractorTypeId" INTEGER NULL`);
        } else {
            try { await pool.query(`ALTER TABLE contractors ADD COLUMN contractorTypeId INT NULL`); } catch (_) {}
        }
        return 'contractors';
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
        await pool.query(`ALTER TABLE contractors ADD COLUMN IF NOT EXISTS "contractorTypeId" INTEGER NULL`);
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
        try {
            await pool.query(`ALTER TABLE contractors ADD COLUMN contractorTypeId INT NULL`);
        } catch (_) {
            // column may already exist
        }
    }
    return 'contractors';
}
async function ensureContractorTypesTable() {
    if (isPostgres) {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS contractor_types (
                contractor_type_id SERIAL PRIMARY KEY,
                name VARCHAR(120) NOT NULL UNIQUE,
                description TEXT NULL,
                voided BOOLEAN NOT NULL DEFAULT false,
                created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
            )
        `);
    } else {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS contractor_types (
                contractor_type_id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(120) NOT NULL UNIQUE,
                description TEXT NULL,
                voided TINYINT(1) NOT NULL DEFAULT 0,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);
    }
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
const excelUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 4 * 1024 * 1024 },
});

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^(?:07\d{8}|\+2547\d{8})$/;

function normHeaderKey(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
}

function pickRowValue(row, aliases) {
    if (!row || typeof row !== 'object') return '';
    const keys = Object.keys(row);
    const normalized = new Map(keys.map((k) => [normHeaderKey(k), row[k]]));
    for (const alias of aliases) {
        const hit = normalized.get(normHeaderKey(alias));
        if (hit !== undefined && hit !== null && String(hit).trim() !== '') {
            return String(hit).trim();
        }
    }
    return '';
}

function sheetRowsFromWorkbook(workbook, preferredNames = []) {
    const names = workbook.SheetNames || [];
    for (const preferred of preferredNames) {
        const hit = names.find((n) => normHeaderKey(n) === normHeaderKey(preferred));
        if (hit) {
            return { sheetName: hit, rows: XLSX.utils.sheet_to_json(workbook.Sheets[hit], { defval: '' }) };
        }
    }
    if (!names.length) return { sheetName: '', rows: [] };
    const sheetName = names[0];
    return { sheetName, rows: XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' }) };
}

async function fetchContractorTypeOptions() {
    await ensureContractorTypesTable();
    if (isPostgres) {
        const result = await pool.query(
            `SELECT contractor_type_id AS "contractorTypeId", name
             FROM contractor_types
             WHERE COALESCE(voided, false) = false
             ORDER BY name ASC`
        );
        return rowsOf(result);
    }
    const result = await pool.query(
        `SELECT contractor_type_id AS contractorTypeId, name
         FROM contractor_types
         WHERE voided = 0
         ORDER BY name ASC`
    );
    return rowsOf(result);
}

function resolveContractorTypeId(typeName, typeOptions) {
    const raw = String(typeName || '').trim();
    if (!raw) return { contractorTypeId: null, contractorTypeName: '' };
    const hit = (typeOptions || []).find((t) => normHeaderKey(t.name) === normHeaderKey(raw));
    if (!hit) {
        return { contractorTypeId: null, contractorTypeName: raw, unknownType: true };
    }
    return {
        contractorTypeId: hit.contractorTypeId,
        contractorTypeName: hit.name,
        unknownType: false,
    };
}

async function fetchExistingContractorEmails() {
    await ensureContractorsTable();
    const rows = await queryRowsFallbackTables(
        [
            () => `SELECT LOWER(TRIM(email)) AS email FROM contractors WHERE COALESCE(voided, false) = false`,
            () => `SELECT LOWER(TRIM(email)) AS email FROM contractors WHERE COALESCE(voided, 0) = 0`,
        ],
        []
    );
    return new Set((rows || []).map((r) => String(r.email || '').trim()).filter(Boolean));
}

function parseContractorImportRow(row, rowNumber, typeOptions, existingEmails, seenEmails) {
    const companyName = pickRowValue(row, ['company_name', 'company name', 'company', 'name', 'firm']);
    const contactPerson = pickRowValue(row, ['contact_person', 'contact person', 'contact', 'contact_name']);
    const email = pickRowValue(row, ['email', 'email_address', 'e-mail']).toLowerCase();
    const phone = pickRowValue(row, ['phone', 'phone_number', 'mobile', 'telephone']);
    const contractorType = pickRowValue(row, ['contractor_type', 'contractor type', 'type', 'category']);
    const messages = [];

    if (!companyName && !email && !contactPerson && !phone && !contractorType) {
        return null;
    }

    if (!companyName) messages.push('Company name is required.');
    if (!email) messages.push('Email is required.');
    else if (!EMAIL_REGEX.test(email)) messages.push('Email format is invalid.');

    if (phone && !PHONE_REGEX.test(phone)) {
        messages.push('Phone should be 07XXXXXXXX or +2547XXXXXXXX.');
    }

    const typeResolved = resolveContractorTypeId(contractorType, typeOptions);
    if (typeResolved.unknownType) {
        messages.push(`Unknown contractor type "${typeResolved.contractorTypeName}". Leave blank or use a type from the template.`);
    }

    let status = 'will_create';
    if (messages.some((m) => m.includes('required') || m.includes('invalid') || m.includes('Unknown'))) {
        status = 'error';
    } else if (seenEmails.has(email)) {
        status = 'duplicate_file';
        messages.push('Duplicate email in this file.');
    } else if (existingEmails.has(email)) {
        status = 'duplicate_skip';
        messages.push('A contractor with this email already exists.');
    }

    if (email) seenEmails.add(email);

    return {
        rowNumber,
        companyName,
        contactPerson,
        email,
        phone: phone || '',
        contractorType: typeResolved.contractorTypeName || contractorType,
        contractorTypeId: typeResolved.contractorTypeId,
        status,
        messages,
    };
}

function parseContractorExcelBuffer(buffer) {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const { sheetName, rows } = sheetRowsFromWorkbook(workbook, ['contractors', 'contractor', 'sheet1']);
    const parsedRows = [];
    const errors = [];
    if (!rows.length) {
        errors.push('No data rows found. Use the Contractors sheet in the import template.');
    }
    return { sheetName, rows: parsedRows, rawRows: rows, errors };
}

async function buildContractorImportPreview(buffer) {
    const typeOptions = await fetchContractorTypeOptions();
    const existingEmails = await fetchExistingContractorEmails();
    const seenEmails = new Set();
    const parsed = parseContractorExcelBuffer(buffer);
    const previewRows = [];

    parsed.rawRows.forEach((row, index) => {
        const rowNumber = index + 2;
        const item = parseContractorImportRow(row, rowNumber, typeOptions, existingEmails, seenEmails);
        if (item) previewRows.push(item);
    });

    if (!previewRows.length && !parsed.errors.length) {
        parsed.errors.push('No contractor rows found in the uploaded file.');
    }

    const validRows = previewRows
        .filter((r) => r.status === 'will_create')
        .map(({ companyName, contactPerson, email, phone, contractorTypeId }) => ({
            companyName,
            contactPerson,
            email,
            phone: phone || null,
            contractorTypeId: contractorTypeId || null,
        }));

    return {
        sheetName: parsed.sheetName,
        rows: previewRows,
        validRows,
        errors: parsed.errors,
        typeOptions,
        wouldCreate: validRows.length,
        skippedDuplicates: previewRows.filter((r) => r.status === 'duplicate_skip' || r.status === 'duplicate_file').length,
        errorCount: previewRows.filter((r) => r.status === 'error').length,
    };
}

async function insertImportedContractor(row) {
    const activeTable = await ensureContractorsTable();
    const { companyName, contactPerson, email, phone, contractorTypeId } = row;
    if (isPostgres) {
        const result = await pool.query(
            `INSERT INTO ${activeTable} ("companyName", "contactPerson", email, phone, "contractorTypeId", voided)
             VALUES ($1, $2, $3, $4, $5, false)
             RETURNING "contractorId"`,
            [companyName, contactPerson || null, email, phone || null, contractorTypeId || null]
        );
        return rowsOf(result)?.[0]?.contractorId || null;
    }
    const result = await pool.query(
        `INSERT INTO ${activeTable} (companyName, contactPerson, email, phone, contractorTypeId) VALUES (?, ?, ?, ?, ?)`,
        [companyName, contactPerson || null, email, phone || null, contractorTypeId || null]
    );
    return metaOf(result).insertId || null;
}

// --- Contractor Excel import (routes before /:contractorId) ---
router.get('/import-template', async (_req, res) => {
    try {
        const typeOptions = await fetchContractorTypeOptions();
        const workbook = new ExcelJS.Workbook();
        const contractors = workbook.addWorksheet('Contractors');
        contractors.columns = [
            { header: 'company_name', key: 'company_name', width: 32 },
            { header: 'contact_person', key: 'contact_person', width: 24 },
            { header: 'email', key: 'email', width: 28 },
            { header: 'phone', key: 'phone', width: 18 },
            { header: 'contractor_type', key: 'contractor_type', width: 22 },
        ];
        const sampleType = typeOptions[0]?.name || 'General';
        contractors.addRow({
            company_name: 'Example Contractors Ltd',
            contact_person: 'Jane Doe',
            email: 'jane.doe@example.com',
            phone: '0712345678',
            contractor_type: sampleType,
        });

        const typesSheet = workbook.addWorksheet('Contractor Types');
        typesSheet.columns = [
            { header: 'contractor_type', key: 'contractor_type', width: 28 },
            { header: 'description', key: 'description', width: 36 },
        ];
        if (typeOptions.length) {
            typeOptions.forEach((t) => typesSheet.addRow({ contractor_type: t.name, description: '' }));
        } else {
            typesSheet.addRow({ contractor_type: 'General', description: 'Add types under Contractor Types settings' });
        }

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename="contractor_import_template.xlsx"');
        await workbook.xlsx.write(res);
        return res.end();
    } catch (error) {
        console.error('Error generating contractor import template:', error);
        return res.status(500).json({ message: 'Error generating contractor import template', error: error.message });
    }
});

router.post('/import/preview', excelUpload.single('file'), async (req, res) => {
    if (!req.file?.buffer) return res.status(400).json({ message: 'Excel file is required.' });
    try {
        const preview = await buildContractorImportPreview(req.file.buffer);
        return res.status(200).json(preview);
    } catch (error) {
        console.error('Error previewing contractor import:', error);
        return res.status(500).json({ message: 'Error previewing contractor import', error: error.message });
    }
});

router.post('/import/confirm', async (req, res) => {
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
    if (!rows.length) {
        return res.status(400).json({ message: 'No contractor rows provided for import.' });
    }

    const existingEmails = await fetchExistingContractorEmails();
    const created = [];
    const skipped = [];
    const failed = [];

    for (const row of rows) {
        const companyName = String(row?.companyName || '').trim();
        const email = String(row?.email || '').trim().toLowerCase();
        const contactPerson = row?.contactPerson != null ? String(row.contactPerson).trim() : '';
        const phone = row?.phone != null ? String(row.phone).trim() : '';
        const contractorTypeId = row?.contractorTypeId != null && row.contractorTypeId !== ''
            ? Number(row.contractorTypeId)
            : null;

        if (!companyName || !email) {
            failed.push({ email, reason: 'Company name and email are required.' });
            continue;
        }
        if (!EMAIL_REGEX.test(email)) {
            failed.push({ email, reason: 'Invalid email format.' });
            continue;
        }
        if (existingEmails.has(email)) {
            skipped.push({ email, reason: 'Duplicate email.' });
            continue;
        }

        try {
            const contractorId = await insertImportedContractor({
                companyName,
                contactPerson: contactPerson || null,
                email,
                phone: phone || null,
                contractorTypeId: Number.isFinite(contractorTypeId) ? contractorTypeId : null,
            });
            existingEmails.add(email);
            created.push({ contractorId, email, companyName });
        } catch (error) {
            failed.push({ email, reason: error.message || 'Insert failed.' });
        }
    }

    return res.status(200).json({
        message: `Imported ${created.length} contractor(s).`,
        createdCount: created.length,
        skippedCount: skipped.length,
        failedCount: failed.length,
        created,
        skipped,
        failed,
    });
});

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
        await ensureContractorsTable();
        await ensureContractorTypesTable();
        const hasContractors = await tableExists('contractors');
        if (!hasContractors) {
            return res.status(200).json([]);
        }
        const rows = await queryRowsFallbackTables(
            [
                () =>
                    isPostgres
                        ? `SELECT "contractorId", "companyName", "contactPerson", email, phone, "contractorTypeId"
                           FROM contractors WHERE COALESCE(voided, 0) = 0 ORDER BY "companyName" ASC`
                        : `SELECT contractorId, companyName, contactPerson, email, phone, contractorTypeId
                           FROM contractors WHERE voided = 0 ORDER BY companyName ASC`,
                () =>
                    isPostgres
                        ? `SELECT "contractorId", "companyName", "contactPerson", email, phone, "contractorTypeId"
                           FROM contractors ORDER BY "companyName" ASC`
                        : `SELECT contractorId, companyName, contactPerson, email, phone, contractorTypeId
                           FROM contractors ORDER BY companyName ASC`,
                () =>
                    isPostgres
                        ? `SELECT c."contractorId", c."companyName", c."contactPerson", c.email, c.phone,
                                  c."contractorTypeId", ct.name AS "contractorTypeName",
                                  'contractors'::text AS "sourceTable"
                           FROM contractors c
                           LEFT JOIN contractor_types ct ON ct.contractor_type_id = c."contractorTypeId" AND COALESCE(ct.voided, false) = false
                           WHERE COALESCE(c.voided, false) = false ORDER BY c."companyName" ASC`
                        : `SELECT c.contractorId, c.companyName, c.contactPerson, c.email, c.phone,
                                  c.contractorTypeId, ct.name AS contractorTypeName,
                                  'contractors' AS sourceTable
                           FROM contractors c
                           LEFT JOIN contractor_types ct ON ct.contractor_type_id = c.contractorTypeId AND ct.voided = 0
                           WHERE c.voided = 0 ORDER BY c.companyName ASC`,
                () =>
                    isPostgres
                        ? `SELECT "contractorId", "companyName", "contactPerson", email, phone, "contractorTypeId"
                           FROM contractors WHERE COALESCE(voided, 0) = 0 ORDER BY "companyName" ASC`
                        : `SELECT contractorId, companyName, contactPerson, email, phone, contractorTypeId
                           FROM contractors WHERE voided = 0 ORDER BY companyName ASC`,
                () => `SELECT * FROM contractors`,
            ],
            []
        );
        const normalized = rows.map((r) => ({
            contractorId: rowVal(r, 'contractorId', 'contractor_id', 'id'),
            companyName: rowVal(r, 'companyName', 'company_name', 'name') || '',
            contactPerson: rowVal(r, 'contactPerson', 'contact_person') || '',
            email: rowVal(r, 'email') || '',
            phone: rowVal(r, 'phone') || '',
            contractorTypeId: rowVal(r, 'contractorTypeId', 'contractor_type_id'),
            contractorTypeName: rowVal(r, 'contractorTypeName', 'contractor_type_name') || '',
            sourceTable: rowVal(r, 'sourceTable', 'source_table') || '',
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
    const { companyName, contactPerson, email, phone, userId, contractorTypeId } = req.body;
    if (!companyName || !email) {
        return res.status(400).json({ message: 'Company name and email are required.' });
    }
    try {
        const activeTable = await ensureContractorsTable();
        let insertedId = null;
        if (isPostgres) {
            const tryQueries = [
                () => `INSERT INTO ${activeTable} ("companyName", "contactPerson", email, phone, "userId", "contractorTypeId", voided)
                       VALUES ($1, $2, $3, $4, $5, $6, false)
                       RETURNING "contractorId"`,
            ];
            let lastErr = null;
            for (const getSql of tryQueries) {
                try {
                    const result = await pool.query(getSql(), [companyName, contactPerson, email, phone, userId || null, contractorTypeId || null]);
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
                `INSERT INTO ${activeTable} (companyName, contactPerson, email, phone, userId, contractorTypeId) VALUES (?, ?, ?, ?, ?, ?)`,
                [companyName, contactPerson, email, phone, userId, contractorTypeId || null]
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
        const normalizeNullableInt = (value) => {
            if (value === '' || value == null) return null;
            const n = Number(value);
            return Number.isFinite(n) ? n : null;
        };
        let affected = 0;
        if (isPostgres) {
            const sourceTable = String(updatedFields.__sourceTable || '').trim();
            const tableNames = sourceTable === 'contractors'
                ? [sourceTable]
                : ['contractors'];
            const keyMap = [
                { payload: 'companyName', cols: ['companyName', 'company_name', 'companyname', 'name'] },
                { payload: 'contactPerson', cols: ['contactPerson', 'contact_person', 'contactperson'] },
                { payload: 'email', cols: ['email', 'email_address', 'emailaddress'] },
                { payload: 'phone', cols: ['phone', 'phone_number', 'phonenumber', 'mobile'] },
                { payload: 'userId', cols: ['userId', 'user_id', 'userid'], normalize: normalizeNullableInt },
                { payload: 'contractorTypeId', cols: ['contractorTypeId', 'contractor_type_id', 'contractortypeid'], normalize: normalizeNullableInt },
            ];
            for (const tableName of tableNames) {
                if (affected > 0) break;
                const exists = await tableExists(tableName);
                if (!exists) continue;
                const cols = await getTableColumns(tableName);
                if (!cols.size) continue;

                const idCol = ['contractorId', 'contractorid', 'contractor_id', 'id'].find((c) => cols.has(c));
                const companyCol = ['companyName', 'company_name', 'companyname', 'name'].find((c) => cols.has(c));
                const emailCol = ['email', 'email_address', 'emailaddress'].find((c) => cols.has(c));
                if (!idCol && !(companyCol && emailCol)) continue;

                const setParts = [];
                const params = [];
                for (const mapping of keyMap) {
                    if (updatedFields[mapping.payload] === undefined) continue;
                    const col = mapping.cols.find((c) => cols.has(c));
                    if (!col) continue;
                    let v = updatedFields[mapping.payload];
                    if (typeof mapping.normalize === 'function') v = mapping.normalize(v);
                    params.push(v);
                    setParts.push(`"${col}" = $${params.length}`);
                }
                if (!setParts.length) continue;

                // Prefer ID match; if no hit, fallback to original natural key.
                if (idCol) {
                    const idParams = [...params, String(contractorId)];
                    const idSql = `UPDATE ${tableName} SET ${setParts.join(', ')} WHERE "${idCol}"::text = $${idParams.length}`;
                    const idRes = await pool.query(idSql, idParams);
                    affected = metaOf(idRes).rowCount || 0;
                    if (affected > 0) break;
                }

                if (companyCol && emailCol) {
                    const matchCompanyName = String(updatedFields.__matchCompanyName ?? updatedFields.companyName ?? '').trim();
                    const matchEmail = String(updatedFields.__matchEmail ?? updatedFields.email ?? '').trim().toLowerCase();
                    if (matchCompanyName && matchEmail) {
                        const nkParams = [...params, matchCompanyName, matchEmail];
                        const nkSql =
                            `UPDATE ${tableName} SET ${setParts.join(', ')}
                             WHERE LOWER(TRIM("${companyCol}"::text)) = LOWER(TRIM($${nkParams.length - 1}))
                               AND LOWER(TRIM("${emailCol}"::text)) = $${nkParams.length}`;
                        const nkRes = await pool.query(nkSql, nkParams);
                        affected = metaOf(nkRes).rowCount || 0;
                        if (affected > 0) break;
                    }
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

// --- Contractor Types registry ---
router.get('/types', async (_req, res) => {
    try {
        await ensureContractorTypesTable();
        if (isPostgres) {
            const result = await pool.query(
                `SELECT contractor_type_id AS "contractorTypeId", name, description
                 FROM contractor_types
                 WHERE COALESCE(voided, false) = false
                 ORDER BY name ASC`
            );
            return res.status(200).json(rowsOf(result));
        }
        const result = await pool.query(
            `SELECT contractor_type_id AS contractorTypeId, name, description
             FROM contractor_types WHERE voided = 0 ORDER BY name ASC`
        );
        return res.status(200).json(rowsOf(result));
    } catch (error) {
        console.error('Error fetching contractor types:', error);
        return res.status(500).json({ message: 'Error fetching contractor types', error: error.message });
    }
});

router.post('/types', async (req, res) => {
    try {
        await ensureContractorTypesTable();
        const name = String(req.body?.name || '').trim();
        const description = req.body?.description != null ? String(req.body.description) : null;
        if (!name) return res.status(400).json({ message: 'Type name is required.' });
        if (isPostgres) {
            const result = await pool.query(
                `INSERT INTO contractor_types (name, description, voided) VALUES ($1, $2, false)
                 RETURNING contractor_type_id AS "contractorTypeId"`,
                [name, description]
            );
            return res.status(201).json({ contractorTypeId: rowsOf(result)?.[0]?.contractorTypeId, name, description });
        }
        const result = await pool.query(
            `INSERT INTO contractor_types (name, description, voided) VALUES (?, ?, 0)`,
            [name, description]
        );
        return res.status(201).json({ contractorTypeId: metaOf(result).insertId, name, description });
    } catch (error) {
        console.error('Error creating contractor type:', error);
        return res.status(500).json({ message: 'Error creating contractor type', error: error.message });
    }
});

router.put('/types/:contractorTypeId', async (req, res) => {
    try {
        await ensureContractorTypesTable();
        const id = Number(req.params.contractorTypeId);
        const name = req.body?.name != null ? String(req.body.name).trim() : undefined;
        const description = req.body?.description != null ? String(req.body.description) : undefined;
        if (name === '') return res.status(400).json({ message: 'Type name cannot be empty.' });
        if (isPostgres) {
            const sets = [];
            const params = [];
            if (name !== undefined) { params.push(name); sets.push(`name = $${params.length}`); }
            if (description !== undefined) { params.push(description); sets.push(`description = $${params.length}`); }
            if (!sets.length) return res.status(400).json({ message: 'No fields provided for update.' });
            params.push(id);
            const upd = await pool.query(
                `UPDATE contractor_types SET ${sets.join(', ')} WHERE contractor_type_id = $${params.length} AND COALESCE(voided, false) = false`,
                params
            );
            if (!(metaOf(upd).rowCount > 0)) return res.status(404).json({ message: 'Contractor type not found.' });
            return res.status(200).json({ message: 'Contractor type updated.' });
        }
        const payload = {};
        if (name !== undefined) payload.name = name;
        if (description !== undefined) payload.description = description;
        if (!Object.keys(payload).length) return res.status(400).json({ message: 'No fields provided for update.' });
        const upd = await pool.query(`UPDATE contractor_types SET ? WHERE contractor_type_id = ? AND voided = 0`, [payload, id]);
        if (!(metaOf(upd).affectedRows > 0)) return res.status(404).json({ message: 'Contractor type not found.' });
        return res.status(200).json({ message: 'Contractor type updated.' });
    } catch (error) {
        console.error('Error updating contractor type:', error);
        return res.status(500).json({ message: 'Error updating contractor type', error: error.message });
    }
});

router.delete('/types/:contractorTypeId', async (req, res) => {
    try {
        await ensureContractorTypesTable();
        const id = Number(req.params.contractorTypeId);
        if (isPostgres) {
            const upd = await pool.query(`UPDATE contractor_types SET voided = true WHERE contractor_type_id = $1`, [id]);
            if (!(metaOf(upd).rowCount > 0)) return res.status(404).json({ message: 'Contractor type not found.' });
            return res.status(200).json({ message: 'Contractor type deleted.' });
        }
        const upd = await pool.query(`UPDATE contractor_types SET voided = 1 WHERE contractor_type_id = ?`, [id]);
        if (!(metaOf(upd).affectedRows > 0)) return res.status(404).json({ message: 'Contractor type not found.' });
        return res.status(200).json({ message: 'Contractor type deleted.' });
    } catch (error) {
        console.error('Error deleting contractor type:', error);
        return res.status(500).json({ message: 'Error deleting contractor type', error: error.message });
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
