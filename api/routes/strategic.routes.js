const express = require('express');
const router = express.Router();
const pool = require('../config/db'); // Import the database connection pool
const multer = require('multer'); // Import multer
const path = require('path'); // Import path module for file paths
const fs = require('fs'); // Import fs module for file system operations (like deleting files)
const xlsx = require('xlsx'); // Import xlsx for Excel parsing
const PDFDocument = require('pdfkit'); // NEW: Import pdfkit for PDF generation

// --- Import new modular routes ---
const annualWorkPlanRoutes = require('./annualWorkPlanRoutes');
const activityRoutes = require('./activityRoutes');
const milestoneActivityRoutes = require('./milestoneActivityRoutes');
const DB_TYPE = process.env.DB_TYPE || 'mysql';
const isPostgres = DB_TYPE === 'postgresql';
let strategyTablesEnsured = false;
let strategyEnsurePromise = null;
const rowsFromResult = (result) => (isPostgres ? (result?.rows || []) : (Array.isArray(result) ? (result[0] || []) : []));
const firstRowFromResult = (result) => rowsFromResult(result)[0] || null;
const affectedRowsFromResult = (result) => (isPostgres ? Number(result?.rowCount || 0) : Number(result?.[0]?.affectedRows || 0));

async function ensureStrategyTables() {
    if (strategyTablesEnsured) return;

    const runSafeDdl = async (sql) => {
        try {
            await pool.query(sql);
        } catch (err) {
            const code = String(err?.code || '');
            if (code === '42P07' || code === '42710' || code === '23505') return;
            throw err;
        }
    };

    if (isPostgres) {
        await runSafeDdl(`
            CREATE TABLE IF NOT EXISTS strategicplans (
                id BIGSERIAL PRIMARY KEY,
                cidpid TEXT NULL,
                "cidpName" TEXT NULL,
                "startDate" TIMESTAMP NULL,
                "endDate" TIMESTAMP NULL,
                remarks TEXT NULL,
                voided BOOLEAN NOT NULL DEFAULT FALSE,
                "userId" BIGINT NULL,
                "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                "voidedBy" BIGINT NULL
            )
        `);

        await runSafeDdl(`
            CREATE TABLE IF NOT EXISTS programs (
                "programId" BIGSERIAL PRIMARY KEY,
                cidpid TEXT NULL,
                "programName" TEXT NULL,
                "programCode" TEXT NULL,
                remarks TEXT NULL,
                voided BOOLEAN NOT NULL DEFAULT FALSE,
                "userId" BIGINT NULL,
                "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await runSafeDdl(`
            CREATE TABLE IF NOT EXISTS subprograms (
                "subProgramId" BIGSERIAL PRIMARY KEY,
                "programId" BIGINT NULL,
                "subProgramName" TEXT NULL,
                "subProgramCode" TEXT NULL,
                remarks TEXT NULL,
                voided BOOLEAN NOT NULL DEFAULT FALSE,
                "userId" BIGINT NULL,
                "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await runSafeDdl(`ALTER TABLE programs ALTER COLUMN cidpid TYPE TEXT USING cidpid::text`);
        await runSafeDdl(`ALTER TABLE programs ADD COLUMN IF NOT EXISTS programme TEXT NULL`);
        await runSafeDdl(`ALTER TABLE programs ADD COLUMN IF NOT EXISTS description TEXT NULL`);
        await runSafeDdl(`ALTER TABLE programs ADD COLUMN IF NOT EXISTS "needsPriorities" TEXT NULL`);
        await runSafeDdl(`ALTER TABLE programs ADD COLUMN IF NOT EXISTS strategies TEXT NULL`);
        await runSafeDdl(`ALTER TABLE programs ADD COLUMN IF NOT EXISTS objectives TEXT NULL`);
        await runSafeDdl(`ALTER TABLE programs ADD COLUMN IF NOT EXISTS outcomes TEXT NULL`);
        await runSafeDdl(`ALTER TABLE subprograms ADD COLUMN IF NOT EXISTS "subProgramme" TEXT NULL`);
        await runSafeDdl(`ALTER TABLE subprograms ADD COLUMN IF NOT EXISTS "keyOutcome" TEXT NULL`);
        await runSafeDdl(`ALTER TABLE subprograms ADD COLUMN IF NOT EXISTS kpi TEXT NULL`);
        await runSafeDdl(`ALTER TABLE subprograms ADD COLUMN IF NOT EXISTS "unitOfMeasure" TEXT NULL`);
        await runSafeDdl(`ALTER TABLE subprograms ADD COLUMN IF NOT EXISTS baseline TEXT NULL`);
        await runSafeDdl(`ALTER TABLE subprograms ADD COLUMN IF NOT EXISTS "yr1Targets" TEXT NULL`);
        await runSafeDdl(`ALTER TABLE subprograms ADD COLUMN IF NOT EXISTS "yr2Targets" TEXT NULL`);
        await runSafeDdl(`ALTER TABLE subprograms ADD COLUMN IF NOT EXISTS "yr3Targets" TEXT NULL`);
        await runSafeDdl(`ALTER TABLE subprograms ADD COLUMN IF NOT EXISTS "yr4Targets" TEXT NULL`);
        await runSafeDdl(`ALTER TABLE subprograms ADD COLUMN IF NOT EXISTS "yr5Targets" TEXT NULL`);
        await runSafeDdl(`ALTER TABLE subprograms ADD COLUMN IF NOT EXISTS "yr1Budget" NUMERIC(18,2) NULL`);
        await runSafeDdl(`ALTER TABLE subprograms ADD COLUMN IF NOT EXISTS "yr2Budget" NUMERIC(18,2) NULL`);
        await runSafeDdl(`ALTER TABLE subprograms ADD COLUMN IF NOT EXISTS "yr3Budget" NUMERIC(18,2) NULL`);
        await runSafeDdl(`ALTER TABLE subprograms ADD COLUMN IF NOT EXISTS "yr4Budget" NUMERIC(18,2) NULL`);
        await runSafeDdl(`ALTER TABLE subprograms ADD COLUMN IF NOT EXISTS "yr5Budget" NUMERIC(18,2) NULL`);
        await runSafeDdl(`ALTER TABLE subprograms ADD COLUMN IF NOT EXISTS "totalBudget" NUMERIC(18,2) NULL`);
        await pool.query(`UPDATE subprograms SET "unitOfMeasure" = 'count' WHERE "unitOfMeasure" = 'counts'`);

        await runSafeDdl(`
            CREATE TABLE IF NOT EXISTS planningdocuments (
                "attachmentId" BIGSERIAL PRIMARY KEY,
                "fileName" TEXT NOT NULL,
                "filePath" TEXT NOT NULL,
                "fileType" TEXT NULL,
                "fileSize" BIGINT NULL,
                description TEXT NULL,
                "entityId" TEXT NULL,
                "entityType" TEXT NULL,
                "uploadedBy" BIGINT NULL,
                voided BOOLEAN NOT NULL DEFAULT FALSE,
                "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        `);
    } else {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS strategicplans (
                id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
                cidpid VARCHAR(255) NULL,
                cidpName VARCHAR(255) NULL,
                startDate DATETIME NULL,
                endDate DATETIME NULL,
                remarks TEXT NULL,
                voided TINYINT(1) NOT NULL DEFAULT 0,
                userId BIGINT NULL,
                createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                voidedBy BIGINT NULL
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS programs (
                programId BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
                cidpid BIGINT NULL,
                programName VARCHAR(255) NULL,
                programCode VARCHAR(100) NULL,
                remarks TEXT NULL,
                voided TINYINT(1) NOT NULL DEFAULT 0,
                userId BIGINT NULL,
                createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS subprograms (
                subProgramId BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
                programId BIGINT NULL,
                subProgramName VARCHAR(255) NULL,
                subProgramCode VARCHAR(100) NULL,
                remarks TEXT NULL,
                voided TINYINT(1) NOT NULL DEFAULT 0,
                userId BIGINT NULL,
                createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);
        await pool.query(`UPDATE subprograms SET unitOfMeasure = 'count' WHERE unitOfMeasure = 'counts'`);
    }

    strategyTablesEnsured = true;
}

router.use(async (req, res, next) => {
    try {
        if (!strategyEnsurePromise) {
            strategyEnsurePromise = ensureStrategyTables();
        }
        await strategyEnsurePromise;
        next();
    } catch (error) {
        strategyEnsurePromise = null;
        console.error('Error ensuring strategy tables:', error);
        res.status(500).json({ message: 'Failed to initialize strategic planning tables', error: error.message });
    }
});

// --- Helper Function: Format Date for MySQL DATETIME column ---
const formatToMySQLDateTime = (date) => {
    if (!date) return null;
    const d = new Date(date);
    if (isNaN(d.getTime())) {
        console.warn('Invalid date provided to formatToMySQLDateTime:', date);
        return null;
    }
    const year = d.getFullYear();
    const month = (d.getMonth() + 1).toString().padStart(2, '0');
    const day = d.getDate().toString().padStart(2, '0');
    const hours = d.getHours().toString().padStart(2, '0');
    const minutes = d.getMinutes().toString().padStart(2, '0');
    const seconds = d.getSeconds().toString().padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
};

// --- Multer Configuration for File Uploads ---
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        cb(null, `${Date.now()}-${file.originalname}`);
    }
});

const upload = multer({ storage: storage });

// --- Helper for PDF Table Generation ---
const drawTable = (doc, table, x, y, options = {}) => {
    const { addHeader = true, columnsSize = [], padding = 5 } = options;
    let currentY = y;
    
    if (addHeader) {
      doc.font('Helvetica-Bold').fontSize(10);
      let currentX = x;
      table.headers.forEach((header, index) => {
        doc.text(header, currentX, currentY, { width: columnsSize[index] - padding, align: 'center' });
        currentX += columnsSize[index];
      });
      doc.moveDown(0.5);
      currentY = doc.y;
    }

    doc.font('Helvetica').fontSize(10);
    table.rows.forEach(row => {
      let currentX = x;
      row.forEach((cell, index) => {
        doc.text(String(cell), currentX, currentY, { width: columnsSize[index] - padding, align: 'center' });
        currentX += columnsSize[index];
      });
      doc.moveDown(0.5);
      currentY = doc.y;
    });
};

// --- Helper for PDF Currency Formatting ---
const formatCurrencyForPdf = (value) => {
    const num = parseFloat(value);
    if (isNaN(num)) {
        return 'N/A';
    }
    return `KES ${num.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
};

// --- Mount the new routers for work plans and activities ---
router.use('/workplans', annualWorkPlanRoutes);
router.use('/activities', activityRoutes);
router.use('/milestone-activities', milestoneActivityRoutes);

// --- CRUD Operations for Strategic Plans (strategicplans) ---
router.get('/strategic_plans', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM strategicplans');
        const rows = rowsFromResult(result);
        res.status(200).json(rows);
    } catch (error) {
        console.error('Error fetching strategic plans:', error);
        res.status(500).json({ message: 'Error fetching strategic plans', error: error.message });
    }
});

router.get('/strategic_plans/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query('SELECT * FROM strategicplans WHERE id = ?', [id]);
        const rows = rowsFromResult(result);
        if (rows.length > 0) {
            res.status(200).json(rows[0]);
        } else {
            res.status(404).json({ message: 'Strategic plan not found' });
        }
    } catch (error) {
        console.error('Error fetching strategic plan:', error);
        res.status(500).json({ message: 'Error fetching strategic plan', error: error.message });
    }
});

router.post('/strategic_plans', async (req, res) => {
    const clientData = req.body;
    const now = new Date();
    const generatedPlanId = `CIDP-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;

    const newPlan = {
        startDate: formatToMySQLDateTime(clientData.startDate),
        endDate: formatToMySQLDateTime(clientData.endDate),
        ...clientData,
        cidpid: (clientData.cidpid || '').trim() || generatedPlanId,
        voided: isPostgres ? false : 0,
        createdAt: now,
        updatedAt: now,
    };
    delete newPlan.id;

    try {
        console.log('Inserting Strategic Plan:', newPlan);
        if (isPostgres) {
            const result = await pool.query(
                'INSERT INTO strategicplans (cidpid, "cidpName", "startDate", "endDate", voided, "createdAt", "updatedAt") VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id',
                [newPlan.cidpid, newPlan.cidpName, newPlan.startDate, newPlan.endDate, newPlan.voided, newPlan.createdAt, newPlan.updatedAt]
            );
            const insertedId = rowsFromResult(result)[0]?.id;
            res.status(201).json({ ...newPlan, id: insertedId });
            return;
        }

        const [result] = await pool.query('INSERT INTO strategicplans SET ?', newPlan);
        if (result.insertId) newPlan.id = result.insertId;
        res.status(201).json(newPlan);
    } catch (error) {
        console.error('Error creating strategic plan:', error);
        res.status(500).json({ message: 'Error creating strategic plan', error: error.message });
    }
});

router.put('/strategic_plans/:id', async (req, res) => {
    const { id } = req.params;
    const clientData = req.body;

    const updatedFields = {
        startDate: clientData.startDate ? formatToMySQLDateTime(clientData.startDate) : undefined,
        endDate: clientData.endDate ? formatToMySQLDateTime(clientData.endDate) : undefined,
        ...clientData,
        updatedAt: new Date(),
    };
    delete updatedFields.id;
    delete updatedFields.voided;
    delete updatedFields.createdAt;

    try {
        console.log(`Updating Strategic Plan ${id}:`, updatedFields);
        const [result] = await pool.query('UPDATE strategicplans SET ? WHERE id = ?', [updatedFields, id]);
        if (result.affectedRows > 0) {
            const [rows] = await pool.query('SELECT * FROM strategicplans WHERE id = ?', [id]);
            res.status(200).json(rows[0]);
        } else {
            res.status(404).json({ message: 'Strategic plan not found' });
        }
    } catch (error) {
        console.error('Error updating strategic plan:', error);
        res.status(500).json({ message: 'Error updating strategic plan', error: error.message });
    }
});

router.delete('/strategic_plans/:id', async (req, res) => {
    const { id } = req.params;
    try {
        console.log('Soft-deleting Strategic Plan:', id);
        const [result] = await pool.query('UPDATE strategicplans SET voided = 1 WHERE id = ?', [id]);
        if (result.affectedRows > 0) {
            res.status(204).send();
        } else {
            res.status(404).json({ message: 'Strategic plan not found' });
        }
    } catch (error) {
        console.error('Error soft-deleting strategic plan:', error);
        res.status(500).json({ message: 'Error soft-deleting strategic plan', error: error.message });
    }
});

// --- CRUD Operations for Programs (programs) ---
router.get('/programs', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT *,
            COALESCE(programme, "programName") AS programme
            FROM programs
            WHERE voided = ${isPostgres ? 'false' : '0'}
        `);
        const rows = rowsFromResult(result);
        res.status(200).json(rows);
    } catch (error) {
        console.error('Error fetching programs:', error);
        res.status(500).json({ message: 'Error fetching programs', error: error.message });
    }
});

router.get('/programs/by-plan/:planId', async (req, res) => {
    const { planId } = req.params;
    try {
        const result = await pool.query(`
            SELECT *,
            COALESCE(programme, "programName") AS programme
            FROM programs
            WHERE cidpid = ? AND voided = ${isPostgres ? 'false' : '0'}
        `, [planId]);
        const rows = rowsFromResult(result);
        res.status(200).json(rows);
    } catch (error) {
        console.error(`Error fetching programs for plan ${planId}:`, error);
        res.status(500).json({ message: `Error fetching programs for plan ${planId}`, error: error.message });
    }
});

router.get('/programs/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query(`SELECT * FROM programs WHERE "programId" = ? AND voided = ${isPostgres ? 'false' : '0'}`, [id]);
        const rows = rowsFromResult(result);
        if (rows.length > 0) {
            res.status(200).json(rows[0]);
        } else {
            res.status(404).json({ message: 'Program not found' });
        }
    } catch (error) {
        console.error('Error fetching program:', error);
        res.status(500).json({ message: 'Error fetching program', error: error.message });
    }
});

router.post('/programs', async (req, res) => {
    const clientData = req.body;
    const newProgram = {
        ...clientData,
        voided: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
    };
    delete newProgram.programId;

    try {
        console.log('Inserting Program:', newProgram);
        if (isPostgres) {
            const result = await pool.query(
                'INSERT INTO programs (cidpid, "programName", "programCode", programme, description, "needsPriorities", strategies, objectives, outcomes, remarks, voided, "createdAt", "updatedAt") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING "programId"',
                [
                    newProgram.cidpid,
                    newProgram.programme || null,
                    newProgram.programCode || null,
                    newProgram.programme || null,
                    newProgram.description || null,
                    newProgram.needsPriorities || null,
                    newProgram.strategies || null,
                    newProgram.objectives || null,
                    newProgram.outcomes || null,
                    newProgram.remarks || null,
                    false,
                    newProgram.createdAt,
                    newProgram.updatedAt
                ]
            );
            newProgram.programId = firstRowFromResult(result)?.programId;
        } else {
            const [result] = await pool.query('INSERT INTO programs SET ?', newProgram);
            if (result.insertId) {
                newProgram.programId = result.insertId;
            }
        }
        res.status(201).json(newProgram);
    } catch (error) {
        console.error('Error creating program:', error);
        res.status(500).json({ message: 'Error creating program', error: error.message });
    }
});

router.put('/programs/:id', async (req, res) => {
    const { id } = req.params;
    const clientData = req.body;
    const updatedFields = {
        ...clientData,
        updatedAt: new Date(),
    };
    delete updatedFields.programId;
    delete updatedFields.voided;
    delete updatedFields.createdAt;

    try {
        console.log(`Updating Program ${id}:`, updatedFields);
        if (isPostgres) {
            const result = await pool.query(
                'UPDATE programs SET "programName" = ?, "programCode" = ?, programme = ?, description = ?, "needsPriorities" = ?, strategies = ?, objectives = ?, outcomes = ?, remarks = ?, "updatedAt" = ? WHERE "programId" = ?',
                [
                    updatedFields.programme || null,
                    updatedFields.programCode || null,
                    updatedFields.programme || null,
                    updatedFields.description || null,
                    updatedFields.needsPriorities || null,
                    updatedFields.strategies || null,
                    updatedFields.objectives || null,
                    updatedFields.outcomes || null,
                    updatedFields.remarks || null,
                    updatedFields.updatedAt,
                    id
                ]
            );
            if (affectedRowsFromResult(result) > 0) {
                const getResult = await pool.query('SELECT * FROM programs WHERE "programId" = ?', [id]);
                res.status(200).json(firstRowFromResult(getResult));
            } else {
                res.status(404).json({ message: 'Program not found' });
            }
        } else {
            const [result] = await pool.query('UPDATE programs SET ? WHERE programId = ?', [updatedFields, id]);
            if (result.affectedRows > 0) {
                const [rows] = await pool.query('SELECT * FROM programs WHERE programId = ?', [id]);
                res.status(200).json(rows[0]);
            } else {
                res.status(404).json({ message: 'Program not found' });
            }
        }
    }
    catch (error) {
        console.error('Error updating program:', error);
        res.status(500).json({ message: 'Error updating program', error: error.message });
    }
});

router.delete('/programs/:id', async (req, res) => {
    const { id } = req.params;
    try {
        console.log('Soft-deleting Program:', id);
        const result = await pool.query(`UPDATE programs SET voided = ${isPostgres ? 'true' : '1'} WHERE ${isPostgres ? '"programId"' : 'programId'} = ?`, [id]);
        if (affectedRowsFromResult(result) > 0) {
            res.status(204).send();
        } else {
            res.status(404).json({ message: 'Program not found' });
        }
    } catch (error) {
        console.error('Error soft-deleting program:', error);
        res.status(500).json({ message: 'Error soft-deleting program', error: error.message });
    }
});

// --- CRUD Operations for Subprograms (subprograms) ---
router.get('/subprograms', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT *,
            COALESCE("subProgramme", "subProgramName") AS "subProgramme"
            FROM subprograms
            WHERE voided = ${isPostgres ? 'false' : '0'}
        `);
        const rows = rowsFromResult(result);
        res.status(200).json(rows);
    } catch (error) {
        console.error('Error fetching subprograms:', error);
        res.status(500).json({ message: 'Error fetching subprograms', error: error.message });
    }
});

router.get('/subprograms/by-program/:programId', async (req, res) => {
    const { programId } = req.params;
    try {
        const result = await pool.query(`
            SELECT *,
            COALESCE("subProgramme", "subProgramName") AS "subProgramme"
            FROM subprograms
            WHERE "programId" = ? AND voided = ${isPostgres ? 'false' : '0'}
        `, [programId]);
        const rows = rowsFromResult(result);
        res.status(200).json(rows);
    } catch (error) {
        console.error(`Error fetching subprograms for program ${programId}:`, error);
        res.status(500).json({ message: `Error fetching subprograms for program ${programId}`, error: error.message });
    }
});

router.get('/subprograms/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query(`SELECT * FROM subprograms WHERE "subProgramId" = ? AND voided = ${isPostgres ? 'false' : '0'}`, [id]);
        const rows = rowsFromResult(result);
        if (rows.length > 0) {
            res.status(200).json(rows[0]);
        } else {
            res.status(404).json({ message: 'Subprogram not found' });
        }
    } catch (error) {
        console.error('Error fetching subprogram:', error);
        res.status(500).json({ message: 'Error fetching subprogram', error: error.message });
    }
});

router.post('/subprograms', async (req, res) => {
    const clientData = req.body;
    const newSubprogram = {
        ...clientData,
        voided: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
    };
    delete newSubprogram.subProgramId;

    try {
        console.log('Inserting Subprogram:', newSubprogram);
        if (isPostgres) {
            const result = await pool.query(
                'INSERT INTO subprograms ("programId", "subProgramName", "subProgramCode", "subProgramme", "keyOutcome", kpi, "unitOfMeasure", baseline, "yr1Targets", "yr2Targets", "yr3Targets", "yr4Targets", "yr5Targets", "yr1Budget", "yr2Budget", "yr3Budget", "yr4Budget", "yr5Budget", "totalBudget", remarks, voided, "createdAt", "updatedAt") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING "subProgramId"',
                [
                    newSubprogram.programId || null,
                    newSubprogram.subProgramme || null,
                    newSubprogram.subProgramCode || null,
                    newSubprogram.subProgramme || null,
                    newSubprogram.keyOutcome || null,
                    newSubprogram.kpi || null,
                    newSubprogram.unitOfMeasure || null,
                    newSubprogram.baseline || null,
                    newSubprogram.yr1Targets || null,
                    newSubprogram.yr2Targets || null,
                    newSubprogram.yr3Targets || null,
                    newSubprogram.yr4Targets || null,
                    newSubprogram.yr5Targets || null,
                    newSubprogram.yr1Budget || null,
                    newSubprogram.yr2Budget || null,
                    newSubprogram.yr3Budget || null,
                    newSubprogram.yr4Budget || null,
                    newSubprogram.yr5Budget || null,
                    newSubprogram.totalBudget || null,
                    newSubprogram.remarks || null,
                    false,
                    newSubprogram.createdAt,
                    newSubprogram.updatedAt
                ]
            );
            newSubprogram.subProgramId = firstRowFromResult(result)?.subProgramId;
        } else {
            const [result] = await pool.query('INSERT INTO subprograms SET ?', newSubprogram);
            if (result.insertId) {
                newSubprogram.subProgramId = result.insertId;
            }
        }
        res.status(201).json(newSubprogram);
    } catch (error) {
        console.error('Error creating subprogram:', error);
        res.status(500).json({ message: 'Error creating subprogram', error: error.message });
    }
});

router.put('/subprograms/:id', async (req, res) => {
    const { id } = req.params;
    const clientData = req.body;
    const updatedFields = {
        ...clientData,
        updatedAt: new Date(),
    };
    delete updatedFields.subProgramId;
    delete updatedFields.voided;
    delete updatedFields.createdAt;

    try {
        console.log(`Updating Subprogram ${id}:`, updatedFields);
        if (isPostgres) {
            const result = await pool.query(
                'UPDATE subprograms SET "subProgramName" = ?, "subProgramCode" = ?, "subProgramme" = ?, "keyOutcome" = ?, kpi = ?, "unitOfMeasure" = ?, baseline = ?, "yr1Targets" = ?, "yr2Targets" = ?, "yr3Targets" = ?, "yr4Targets" = ?, "yr5Targets" = ?, "yr1Budget" = ?, "yr2Budget" = ?, "yr3Budget" = ?, "yr4Budget" = ?, "yr5Budget" = ?, "totalBudget" = ?, remarks = ?, "updatedAt" = ? WHERE "subProgramId" = ?',
                [
                    updatedFields.subProgramme || null,
                    updatedFields.subProgramCode || null,
                    updatedFields.subProgramme || null,
                    updatedFields.keyOutcome || null,
                    updatedFields.kpi || null,
                    updatedFields.unitOfMeasure || null,
                    updatedFields.baseline || null,
                    updatedFields.yr1Targets || null,
                    updatedFields.yr2Targets || null,
                    updatedFields.yr3Targets || null,
                    updatedFields.yr4Targets || null,
                    updatedFields.yr5Targets || null,
                    updatedFields.yr1Budget || null,
                    updatedFields.yr2Budget || null,
                    updatedFields.yr3Budget || null,
                    updatedFields.yr4Budget || null,
                    updatedFields.yr5Budget || null,
                    updatedFields.totalBudget || null,
                    updatedFields.remarks || null,
                    updatedFields.updatedAt,
                    id
                ]
            );
            if (affectedRowsFromResult(result) > 0) {
                const getResult = await pool.query('SELECT * FROM subprograms WHERE "subProgramId" = ?', [id]);
                res.status(200).json(firstRowFromResult(getResult));
            } else {
                res.status(404).json({ message: 'Subprogram not found' });
            }
        } else {
            const [result] = await pool.query('UPDATE subprograms SET ? WHERE subProgramId = ?', [updatedFields, id]);
            if (result.affectedRows > 0) {
                const [rows] = await pool.query('SELECT * FROM subprograms WHERE subProgramId = ?', [id]);
                res.status(200).json(rows[0]);
            } else {
                res.status(404).json({ message: 'Subprogram not found' });
            }
        }
    }
    catch (error) {
        console.error('Error updating subprogram:', error);
        res.status(500).json({ message: 'Error updating subprogram', error: error.message });
    }
});

router.delete('/subprograms/:id', async (req, res) => {
    const { id } = req.params;
    try {
        console.log('Soft-deleting Subprogram:', id);
        const result = await pool.query(`UPDATE subprograms SET voided = ${isPostgres ? 'true' : '1'} WHERE ${isPostgres ? '"subProgramId"' : 'subProgramId'} = ?`, [id]);
        if (affectedRowsFromResult(result) > 0) {
            res.status(204).send();
        } else {
            res.status(404).json({ message: 'Subprogram not found' });
        }
    } catch (error) {
        console.error('Error soft-deleting subprogram:', error);
        res.status(500).json({ message: 'Error soft-deleting subprogram', error: error.message });
    }
});


// --- CRUD Operations for Strategy Attachments (planningdocuments) ---
router.get('/attachments', async (req, res) => {
    try {
        const result = await pool.query(`SELECT * FROM planningdocuments WHERE voided = ${isPostgres ? 'false' : '0'}`);
        const rows = rowsFromResult(result);
        res.status(200).json(rows);
    } catch (error) {
        console.error('Error fetching strategic planning documents:', error);
        res.status(500).json({ message: 'Error fetching strategic planning documents', error: error.message });
    }
});

router.get('/attachments/by-entity/:entityType/:entityId', async (req, res) => {
    const { entityType, entityId } = req.params;
    try {
        const result = await pool.query(
            `SELECT * FROM planningdocuments WHERE "entityType" = ? AND "entityId" = ? AND voided = ${isPostgres ? 'false' : '0'}`,
            [entityType, entityId]
        );
        const rows = rowsFromResult(result);
        res.status(200).json(rows);
    } catch (error) {
        console.error(`Error fetching documents for entity ${entityType}:${entityId}:`, error);
        res.status(500).json({ message: `Error fetching documents for entity ${entityType}:${entityId}`, error: error.message });
    }
});

router.get('/attachments/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const [rows] = await pool.query('SELECT * FROM planningdocuments WHERE attachmentId = ? AND voided = 0', [id]);
        if (rows.length > 0) {
            res.status(200).json(rows[0]);
        } else {
            res.status(404).json({ message: 'Strategic planning document not found' });
        }
    } catch (error) {
        console.error('Error fetching strategic planning document:', error);
        res.status(500).json({ message: 'Error fetching strategic planning document', error: error.message });
    }
});

router.post('/attachments', upload.single('file'), async (req, res) => {
    const { fileName, fileType, fileSize, description, entityId, entityType, uploadedBy } = req.body;
    const filePath = req.file ? `/uploads/${req.file.filename}` : null;

    if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded.' });
    }
    if (!fileName) {
        return res.status(400).json({ message: 'File name is required.' });
    }

    const newAttachment = {
        fileName: fileName,
        filePath: filePath,
        fileType: fileType || req.file.mimetype,
        fileSize: fileSize || req.file.size,
        description: description,
        entityId: entityId,
        entityType: entityType,
        uploadedBy: uploadedBy || null,
        createdAt: formatToMySQLDateTime(new Date()),
        updatedAt: formatToMySQLDateTime(new Date()),
    };

    try {
        console.log('Inserting Strategic Planning Document:', newAttachment);
        const [result] = await pool.query('INSERT INTO planningdocuments SET ?', newAttachment);
        if (result.insertId) {
            newAttachment.attachmentId = result.insertId;
        }
        res.status(201).json(newAttachment);
    } catch (error) {
        console.error('Error creating strategic planning document:', error);
        res.status(500).json({ message: 'Error creating strategic planning document', error: error.message });
    }
});

router.put('/attachments/:id', async (req, res) => {
    const { id } = req.params;
    const clientData = req.body;
    const updatedFields = {
        updatedAt: formatToMySQLDateTime(new Date()),
        ...clientData
    };
    delete updatedFields.attachmentId;

    try {
        console.log(`Updating Strategic Planning Document ${id}:`, updatedFields);
        const [rows] = await pool.query('UPDATE planningdocuments SET ? WHERE attachmentId = ?', [updatedFields, id]);
        if (rows.affectedRows > 0) {
            const [updatedRow] = await pool.query('SELECT * FROM planningdocuments WHERE attachmentId = ?', [id]);
            res.status(200).json(updatedRow[0]);
        } else {
            res.status(404).json({ message: 'Strategic planning document not found' });
        }
    } catch (error) {
        console.error('Error updating strategic planning document:', error);
        res.status(500).json({ message: 'Error updating strategic planning document', error: error.message });
    }
});

router.delete('/attachments/:id', async (req, res) => {
    const { id } = req.params;
    try {
        console.log('Soft-deleting Strategic Plan Attachment:', id);
        const [rows] = await pool.query('SELECT filePath FROM planningdocuments WHERE attachmentId = ?', [id]);
        if (rows.length === 0) {
            return res.status(400).json({ message: 'Strategic planning document not found.' });
        }
        const filePathToDelete = rows[0].filePath;

        const [result] = await pool.query('UPDATE planningdocuments SET voided = 1 WHERE attachmentId = ?', [id]);
        if (result.affectedRows > 0) {
            if (filePathToDelete && filePathToDelete.startsWith('/uploads/')) {
                const absolutePath = path.join(__dirname, '..', filePathToDelete);
                fs.unlink(absolutePath, (err) => {
                    if (err) {
                        console.error('Error deleting physical file:', err);
                    } else {
                        console.log('Physical file deleted:', absolutePath);
                    }
                });
            }
            res.status(204).send();
        } else {
            res.status(404).json({ message: 'Strategic planning document not found' });
        }
    } catch (error) {
        console.error('Error soft-deleting strategic planning document:', error);
        res.status(500).json({ message: 'Error soft-deleting strategic planning document', error: error.message });
    }
});


// --- Route for Downloading Strategic Plan Template ---
router.get('/download-template', (req, res) => {
    const templateFilePath = path.join(__dirname, '..', 'templates', 'strategic_plan_template.xlsx');
    console.log('Attempting to send template from:', templateFilePath);

    res.download(templateFilePath, 'strategic_plan_template.xlsx', (err) => {
        if (err) {
            console.error('Error sending template file:', err);
            res.status(500).json({ message: 'Failed to download template file.', error: err.message });
        }
    });
});


// --- Header Maps (moved to global scope for access by both routes) ---
const combinedHeaderMap = {
    'plan_cidpid': 'Plan_CIDPID', 'plan cidpid': 'Plan_CIDPID', 'planid': 'Plan_CIDPID',
    'plan_name': 'Plan_Name', 'plan name': 'Plan_Name',
    'plan_startdate': 'Plan_StartDate', 'plan start date': 'Plan_StartDate', 'planstartdate': 'Plan_StartDate',
    'plan_enddate': 'Plan_EndDate', 'plan end date': 'Plan_EndDate', 'planenddate': 'Plan_EndDate',

    'program_name': 'Program_Name', 'program name': 'Program_Name', 'programname': 'Program_Name',
    'program_department': 'Program_Department', 'program department': 'Program_Department', 'programdepartment': 'Program_Department',
    'program_section': 'Program_Section', 'program section': 'Program_Section', 'programsection': 'Program_Section',
    'program_needspriorities': 'Program_NeedsPriorities', 'program needs priorities': 'Program_NeedsPriorities', 'programneedspriorities': 'Program_NeedsPriorities',
    'program_strategies': 'Program_Strategies', 'program strategies': 'Program_Strategies', 'programstrategies': 'Program_Strategies',
    'program_objectives': 'Program_Objectives', 'program objectives': 'Program_Objectives', 'programobjectives': 'Program_Objectives',
    'program_outcomes': 'Program_Outcomes', 'program outcomes': 'Program_Outcomes', 'programoutcomes': 'Program_Outcomes',
    'program_remarks': 'Program_Remarks', 'program remarks': 'Program_Remarks', 'programremarks': 'Program_Remarks',
    'key result area': 'Program_Name', 'kra': 'Program_Name', 'strategic objective': 'Program_Name',

    'subprogram_name': 'Subprogram_Name', 'subprogram name': 'Subprogram_Name', 'subprogramname': 'Subprogram_Name',
    'subprogram_keyoutcome': 'Subprogram_KeyOutcome', 'subprogram key outcome': 'Subprogram_KeyOutcome', 'subprogramkeyoutcome': 'Subprogram_KeyOutcome',
    'subprogram_kpi': 'Subprogram_KPI', 'subprogram kpi': 'Subprogram_KPI', 'subprogramkpi': 'Subprogram_KPI',
    'subprogram_baseline': 'Subprogram_Baseline', 'subprogram baseline': 'Subprogram_Baseline', 'subprogrambaseline': 'Subprogram_Baseline',
    'subprogram_yr1targets': 'Subprogram_Yr1Targets', 'subprogram yr1 targets': 'Subprogram_Yr1Targets', 'subprogramyr1targets': 'Subprogram_Yr1Targets',
    'subprogram_yr2targets': 'Subprogram_Yr2Targets', 'subprogram_yr3targets': 'Subprogram_Yr3Targets', 'subprogram_yr4targets': 'Subprogram_Yr4Targets', 'subprogram_yr5targets': 'Subprogram_Yr5Targets',
    'subprogram_yr1budget': 'Subprogram_Yr1Budget', 'subprogram_yr2budget': 'Subprogram_Yr2Budget', 'subprogram_yr3budget': 'Subprogram_Yr3Budget', 'subprogram_yr4budget': 'Subprogram_Yr4Budget', 'subprogram_yr5budget': 'Subprogram_Yr5Budget',
    'subprogram_totalbudget': 'Subprogram_TotalBudget', 'subprogram total budget': 'Subprogram_TotalBudget', 'subprogramtotalbudget': 'Subprogram_TotalBudget',
    'subprogram_remarks': 'Subprogram_Remarks', 'subprogram remarks': 'Subprogram_Remarks', 'subprogramremarks': 'Subprogram_Remarks',
    'initiative': 'Subprogram_Name', 'action plan': 'Subprogram_Name', 'project activity': 'Subprogram_Name',
    // NEW: Add mappings for Project, Work Plan, and Activity headers
    'workplan_name': 'Workplan_Name', 'work plan name': 'Workplan_Name',
    'workplan_financialyear': 'Workplan_FinancialYear', 'workplan financial year': 'Workplan_FinancialYear',
    'workplan_totalbudget': 'Workplan_TotalBudget', 'workplan total budget': 'Workplan_TotalBudget',
    'project_name': 'Project_Name', 'project name': 'Project_Name',
    'project_category': 'Project_Category', 'project category': 'Project_Category',
    'project_cost': 'Project_Cost', 'project cost': 'Project_Cost',
    'milestone_name': 'Milestone_Name', 'milestone name': 'Milestone_Name',
    'milestone_duedate': 'Milestone_DueDate', 'milestone due date': 'Milestone_DueDate',
    'activity_name': 'Activity_Name', 'activity name': 'Activity_Name',
    'activity_startdate': 'Activity_StartDate', 'activity start date': 'Activity_StartDate',
    'activity_enddate': 'Activity_EndDate', 'activity end date': 'Activity_EndDate',
    'activity_budgetallocated': 'Activity_BudgetAllocated', 'activity budget allocated': 'Activity_BudgetAllocated',
};


// --- Route for Previewing Strategic Plan Data from Excel ---
router.post('/import-cidp', upload.single('importFile'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ success: false, message: 'No file uploaded.' });
    }

    const filePath = req.file.path;

    try {
        const workbook = xlsx.readFile(filePath, { cellDates: true });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const rawData = xlsx.utils.sheet_to_json(worksheet, { header: 1 });

        if (rawData.length < 2) {
            fs.unlink(filePath, () => {});
            return res.status(400).json({ success: false, message: 'Uploaded Excel file is empty or has no data rows.' });
        }

        const headers = rawData[0];
        const dataRows = rawData.slice(1);

        const importSummary = {
            totalRows: dataRows.length,
            previewRows: [],
            unrecognizedHeaders: [],
            errors: []
        };

        const mapRowToObject = (rowArray) => {
            const obj = {};
            headers.forEach((rawHeader, index) => {
                const normalizedHeaderKey = String(rawHeader).toLowerCase().replace(/[^a-z0-9]/g, '');
                const targetHeader = combinedHeaderMap[normalizedHeaderKey] || rawHeader;
                if (!Object.values(combinedHeaderMap).includes(targetHeader) && !importSummary.unrecognizedHeaders.includes(rawHeader)) {
                    importSummary.unrecognizedHeaders.push(rawHeader);
                }
                let value = rowArray[index];
                if (value === '' || value === null || value === undefined) {
                    obj[targetHeader] = null;
                } else if (typeof value === 'number' && (targetHeader.includes('Targets') || targetHeader.includes('Budget') || targetHeader.includes('Cost'))) {
                    obj[targetHeader] = value;
                } else if (typeof value === 'object' && value instanceof Date) {
                    obj[targetHeader] = value.toISOString().split('T')[0];
                } else {
                    obj[targetHeader] = value;
                }
            });
            // NEW: Calculate Subprogram_TotalBudget for preview
            const yrlyBudgets = ['Subprogram_Yr1Budget', 'Subprogram_Yr2Budget', 'Subprogram_Yr3Budget', 'Subprogram_Yr4Budget', 'Subprogram_Yr5Budget'];
            const totalBudget = yrlyBudgets.reduce((sum, key) => sum + (parseFloat(obj[key]) || 0), 0);
            obj['Subprogram_TotalBudget'] = totalBudget;

            return obj;
        };

        const processedFullData = [];
        const previewLimit = 10;
        for (let i = 0; i < dataRows.length; i++) {
            const mappedRow = mapRowToObject(dataRows[i]);
            processedFullData.push(mappedRow);
            if (i < previewLimit) {
                importSummary.previewRows.push(mappedRow);
            }
        }
        fs.unlink(filePath, () => {});
        res.status(200).json({
            success: true,
            message: `File parsed successfully. Review ${importSummary.previewRows.length} of ${importSummary.totalRows} rows.`,
            previewData: importSummary.previewRows,
            headers: headers,
            fullData: processedFullData,
            unrecognizedHeaders: importSummary.unrecognizedHeaders,
        });

    } catch (error) {
        fs.unlink(filePath, () => {});
        console.error('Error during import preview process:', error);
        res.status(500).json({ success: false, message: `File parsing failed: ${error.message}` });
    } finally {}
});

router.post('/confirm-import-cidp', upload.none(), async (req, res) => {
    const { dataToImport } = req.body;
    if (!dataToImport || !Array.isArray(dataToImport) || dataToImport.length === 0) {
        return res.status(400).json({ success: false, message: 'No data provided for import confirmation.' });
    }

    let connection;
    const importSummary = {
        plansCreated: 0, plansUpdated: 0,
        programsCreated: 0, programsUpdated: 0,
        subprogramsCreated: 0, subprogramsUpdated: 0,
        projectsCreated: 0, projectsUpdated: 0,
        workplansCreated: 0, workplansUpdated: 0,
        activitiesCreated: 0, activitiesUpdated: 0,
        milestonesCreated: 0, milestonesUpdated: 0,
        errors: []
    };

    const processRowForDB = (row) => {
        const processedRow = {};
        for (const key in row) {
            if (Object.prototype.hasOwnProperty.call(row, key)) {
                let value = row[key];
                if (value === '' || value === null || value === undefined) {
                    processedRow[key] = null;
                } else if (typeof value === 'string' && (key.includes('Budget') || key.includes('Cost') || key.includes('Targets') || key.includes('Baseline'))) {
                    const numericValue = Number(String(value).replace(/,/g, ''));
                    processedRow[key] = isNaN(numericValue) ? null : numericValue;
                } else if (typeof value === 'string' && (key.includes('Date') || key.includes('StartDate') || key.includes('EndDate'))) {
                    processedRow[key] = value;
                } else {
                    processedRow[key] = value;
                }
            }
        }
        return processedRow;
    };
    
    // --- Helper Maps to cache existing records and avoid duplicates ---
    const planMap = new Map();
    const programMap = new Map();
    const subprogramMap = new Map();
    const projectMap = new Map();
    const workplanMap = new Map();
    const categoryMap = new Map();


    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();

        for (const row of dataToImport) {
            const processedRow = processRowForDB(row);
            
            // NEW: Skip empty rows
            if (!processedRow['Plan_CIDPID'] && !processedRow['Program_Name'] && !processedRow['Subprogram_Name'] && !processedRow['Project_Name']) {
                continue;
            }

            try {
                // --- 1. Strategic Plan ---
                let planId = null;
                let planCidpId = processedRow['Plan_CIDPID'];
                if (!planCidpId) { throw new Error('Plan_CIDPID is missing.'); }

                if (planMap.has(planCidpId)) {
                    planId = planMap.get(planCidpId);
                } else {
                    const [existingPlans] = await connection.query('SELECT id FROM strategicplans WHERE cidpid = ?', [planCidpId]);
                    if (existingPlans.length > 0) {
                        planId = existingPlans[0].id;
                        await connection.query('UPDATE strategicplans SET cidpName = ?, startDate = ?, endDate = ? WHERE id = ?', [processedRow['Plan_Name'], processedRow['Plan_StartDate'], processedRow['Plan_EndDate'], planId]);
                        importSummary.plansUpdated++;
                    } else {
                        const [insertResult] = await connection.query('INSERT INTO strategicplans SET cidpid = ?, cidpName = ?, startDate = ?, endDate = ?', [planCidpId, processedRow['Plan_Name'], processedRow['Plan_StartDate'], processedRow['Plan_EndDate']]);
                        planId = insertResult.insertId;
                        importSummary.plansCreated++;
                    }
                    planMap.set(planCidpId, planId);
                }

                // --- 2. Program ---
                let programId = null;
                let programName = processedRow['Program_Name'];
                if (!programName) { throw new Error('Program_Name is missing.'); }
                const programKey = `${planCidpId}-${programName}`;

                if (programMap.has(programKey)) {
                    programId = programMap.get(programKey);
                } else {
                    const [existingPrograms] = await connection.query('SELECT programId FROM programs WHERE programme = ? AND cidpid = ?', [programName, planCidpId]);
                    if (existingPrograms.length > 0) {
                        programId = existingPrograms[0].programId;
                        await connection.query('UPDATE programs SET needsPriorities = ?, strategies = ?, objectives = ?, outcomes = ?, remarks = ? WHERE programId = ?', [processedRow['Program_NeedsPriorities'], processedRow['Program_Strategies'], processedRow['Program_Objectives'], processedRow['Program_Outcomes'], processedRow['Program_Remarks'], programId]);
                        importSummary.programsUpdated++;
                    } else {
                        let departmentId = null;
                        if (processedRow['Program_Department']) {
                            const [deptRows] = await connection.query('SELECT departmentId FROM departments WHERE name = ?', [processedRow['Program_Department']]);
                            if (deptRows.length > 0) {
                                departmentId = deptRows[0].departmentId;
                            } else {
                                const [newDept] = await connection.query('INSERT INTO departments (name) VALUES (?)', [processedRow['Program_Department']]);
                                departmentId = newDept.insertId;
                            }
                        }
                        let sectionId = null;
                        if (processedRow['Program_Section'] && departmentId) {
                            const [secRows] = await connection.query('SELECT sectionId FROM sections WHERE name = ? AND departmentId = ?', [processedRow['Program_Section'], departmentId]);
                            if (secRows.length > 0) {
                                sectionId = secRows[0].sectionId;
                            } else {
                                const [newSec] = await connection.query('INSERT INTO sections (name, departmentId) VALUES (?, ?)', [processedRow['Program_Section'], departmentId]);
                                sectionId = newSec.insertId;
                            }
                        }
                        const [insertResult] = await connection.query('INSERT INTO programs SET cidpid = ?, programme = ?, departmentId = ?, sectionId = ?, needsPriorities = ?, strategies = ?, objectives = ?, outcomes = ?, remarks = ?', [planCidpId, programName, departmentId, sectionId, processedRow['Program_NeedsPriorities'], processedRow['Program_Strategies'], processedRow['Program_Objectives'], processedRow['Program_Outcomes'], processedRow['Program_Remarks']]);
                        programId = insertResult.insertId;
                        importSummary.programsCreated++;
                    }
                    programMap.set(programKey, programId);
                }

                // --- 3. Subprogram ---
                let subProgramId = null;
                let subprogramName = processedRow['Subprogram_Name'];
                if (!subprogramName) { throw new Error('Subprogram_Name is missing.'); }
                const subprogramKey = `${programId}-${subprogramName}`;

                if (subprogramMap.has(subprogramKey)) {
                    subProgramId = subprogramMap.get(subprogramKey);
                } else {
                    const [existingSubprograms] = await connection.query('SELECT subProgramId FROM subprograms WHERE subProgramme = ? AND programId = ?', [subprogramName, programId]);
                    
                    // NEW: Calculate total budget from yearly budgets
                    const yearlyBudgets = [
                      processedRow['Subprogram_Yr1Budget'],
                      processedRow['Subprogram_Yr2Budget'],
                      processedRow['Subprogram_Yr3Budget'],
                      processedRow['Subprogram_Yr4Budget'],
                      processedRow['Subprogram_Yr5Budget']
                    ];
                    const calculatedTotalBudget = yearlyBudgets.reduce((sum, budget) => sum + (parseFloat(budget) || 0), 0);

                    if (existingSubprograms.length > 0) {
                        subProgramId = existingSubprograms[0].subProgramId;
                        await connection.query(`UPDATE subprograms SET keyOutcome = ?, kpi = ?, baseline = ?, yr1Targets = ?, yr2Targets = ?, yr3Targets = ?, yr4Targets = ?, yr5Targets = ?, yr1Budget = ?, yr2Budget = ?, yr3Budget = ?, yr4Budget = ?, yr5Budget = ?, totalBudget = ?, remarks = ? WHERE subProgramId = ?`, [
                            processedRow['Subprogram_KeyOutcome'],
                            processedRow['Subprogram_KPI'],
                            processedRow['Subprogram_Baseline'],
                            processedRow['Subprogram_Yr1Targets'],
                            processedRow['Subprogram_Yr2Targets'],
                            processedRow['Subprogram_Yr3Targets'],
                            processedRow['Subprogram_Yr4Targets'],
                            processedRow['Subprogram_Yr5Targets'],
                            processedRow['Subprogram_Yr1Budget'],
                            processedRow['Subprogram_Yr2Budget'],
                            processedRow['Subprogram_Yr3Budget'],
                            processedRow['Subprogram_Yr4Budget'],
                            processedRow['Subprogram_Yr5Budget'],
                            calculatedTotalBudget, // Use calculated total budget
                            processedRow['Subprogram_Remarks'],
                            subProgramId
                        ]);
                        importSummary.subprogramsUpdated++;
                    } else {
                        const [insertResult] = await connection.query(`INSERT INTO subprograms SET programId = ?, subProgramme = ?, keyOutcome = ?, kpi = ?, baseline = ?, yr1Targets = ?, yr2Targets = ?, yr3Targets = ?, yr4Targets = ?, yr5Targets = ?, yr1Budget = ?, yr2Budget = ?, yr3Budget = ?, yr4Budget = ?, yr5Budget = ?, totalBudget = ?, remarks = ?, voided = 0`, [
                            programId,
                            subprogramName,
                            processedRow['Subprogram_KeyOutcome'],
                            processedRow['Subprogram_KPI'],
                            processedRow['Subprogram_Baseline'],
                            processedRow['Subprogram_Yr1Targets'],
                            processedRow['Subprogram_Yr2Targets'],
                            processedRow['Subprogram_Yr3Targets'],
                            processedRow['Subprogram_Yr4Targets'],
                            processedRow['Subprogram_Yr5Targets'],
                            processedRow['Subprogram_Yr1Budget'],
                            processedRow['Subprogram_Yr2Budget'],
                            processedRow['Subprogram_Yr3Budget'],
                            processedRow['Subprogram_Yr4Budget'],
                            processedRow['Subprogram_Yr5Budget'],
                            calculatedTotalBudget, // Use calculated total budget
                            processedRow['Subprogram_Remarks']
                        ]);
                        subProgramId = insertResult.insertId;
                        importSummary.subprogramsCreated++;
                    }
                    subprogramMap.set(subprogramKey, subProgramId);
                }

                // --- 4. Project Category ---
                let categoryId = null;
                let projectCategoryName = processedRow['Project_Category'];
                if (projectCategoryName) {
                    if (categoryMap.has(projectCategoryName)) {
                        categoryId = categoryMap.get(projectCategoryName);
                    } else {
                        const [existingCategory] = await connection.query('SELECT categoryId FROM project_milestone_implementations WHERE categoryName = ?', [projectCategoryName]);
                        if (existingCategory.length > 0) {
                            categoryId = existingCategory[0].categoryId;
                        } else {
                            const [insertResult] = await connection.query('INSERT INTO project_milestone_implementations SET categoryName = ?', [projectCategoryName]);
                            categoryId = insertResult.insertId;
                        }
                        categoryMap.set(projectCategoryName, categoryId);
                    }
                }

                // --- 5. Project ---
                let projectId = null;
                let projectName = processedRow['Project_Name'];
                if (projectName) {
                    const projectKey = `${subProgramId}-${projectName}`;
                    if (projectMap.has(projectKey)) {
                        projectId = projectMap.get(projectKey);
                    } else {
                        const [existingProject] = await connection.query('SELECT id FROM projects WHERE projectName = ? AND subProgramId = ?', [projectName, subProgramId]);
                        if (existingProject.length > 0) {
                            projectId = existingProject[0].id;
                            importSummary.projectsUpdated++;
                        } else {
                            const projectData = {
                                projectName: projectName,
                                subProgramId: subProgramId,
                                categoryId: categoryId,
                                costOfProject: processedRow['Project_Cost'],
                                projectDescription: null,
                                startDate: null, // Project dates are not in this template
                                endDate: null,
                                status: 'planning',
                            };
                            const [insertResult] = await connection.query('INSERT INTO projects SET ?', projectData);
                            projectId = insertResult.insertId;
                            importSummary.projectsCreated++;
                        }
                        projectMap.set(projectKey, projectId);
                    }
                }

                // --- 6. Workplan ---
                let workplanId = null;
                let workplanName = processedRow['Workplan_Name'];
                if (workplanName) {
                    const workplanKey = `${subProgramId}-${workplanName}`;
                    if (workplanMap.has(workplanKey)) {
                        workplanId = workplanMap.get(workplanKey);
                    } else {
                        const [existingWorkplan] = await connection.query('SELECT workplanId FROM annual_workplans WHERE workplanName = ? AND subProgramId = ?', [workplanName, subProgramId]);
                        if (existingWorkplan.length > 0) {
                            workplanId = existingWorkplan[0].workplanId;
                            await connection.query('UPDATE annual_workplans SET totalBudget = ? WHERE workplanId = ?', [processedRow['Workplan_TotalBudget'], workplanId]);
                            importSummary.workplansUpdated++;
                        } else {
                            const workplanData = {
                                subProgramId: subProgramId,
                                workplanName: workplanName,
                                financialYear: processedRow['Workplan_FinancialYear'],
                                totalBudget: processedRow['Workplan_TotalBudget'],
                                approvalStatus: 'draft',
                            };
                            const [insertResult] = await connection.query('INSERT INTO annual_workplans SET ?', workplanData);
                            workplanId = insertResult.insertId;
                            importSummary.workplansCreated++;
                        }
                        workplanMap.set(workplanKey, workplanId);
                    }
                }

                // --- 7. Milestone ---
                let milestoneName = processedRow['Milestone_Name'];
                if (milestoneName && projectId) {
                    const [existingMilestone] = await connection.query('SELECT milestoneId FROM project_milestones WHERE milestoneName = ? AND projectId = ?', [milestoneName, projectId]);
                    if (existingMilestone.length === 0) {
                        const milestoneData = {
                            projectId: projectId,
                            milestoneName: milestoneName,
                            dueDate: processedRow['Milestone_DueDate'] ? processedRow['Milestone_DueDate'] : null,
                            sequenceOrder: 1, // Defaulting for import
                            progress: 0,
                            weight: 1,
                        };
                        await connection.query('INSERT INTO project_milestones SET ?', milestoneData);
                        importSummary.milestonesCreated++;
                    } else {
                        importSummary.milestonesUpdated++; // Assume it was a duplicate and mark it as updated
                    }
                }

                // --- 8. Activity ---
                let activityName = processedRow['Activity_Name'];
                if (activityName && workplanId && projectId) {
                    const [existingActivity] = await connection.query('SELECT activityId FROM activities WHERE activityName = ? AND workplanId = ? AND projectId = ?', [activityName, workplanId, projectId]);
                    if (existingActivity.length > 0) {
                        importSummary.activitiesUpdated++;
                    } else {
                        const activityData = {
                            workplanId: workplanId,
                            projectId: projectId,
                            activityName: activityName,
                            startDate: processedRow['Activity_StartDate'],
                            endDate: processedRow['Activity_EndDate'],
                            budgetAllocated: processedRow['Activity_BudgetAllocated'],
                            activityStatus: 'not_started',
                            percentageComplete: 0,
                        };
                        const [insertResult] = await connection.query('INSERT INTO activities SET ?', activityData);
                        const newActivityId = insertResult.insertId;
                        importSummary.activitiesCreated++;
                        
                        // Link activity to milestone if present in row
                        if (milestoneName) {
                            const [milestoneRows] = await connection.query('SELECT milestoneId FROM project_milestones WHERE milestoneName = ? AND projectId = ?', [milestoneName, projectId]);
                            if (milestoneRows.length > 0) {
                                const milestoneId = milestoneRows[0].milestoneId;
                                await connection.query('INSERT INTO milestone_activities (milestoneId, activityId) VALUES (?, ?)', [milestoneId, newActivityId]);
                            }
                        }
                    }
                }

            } catch (rowError) {
                importSummary.errors.push(`Row ${dataToImport.indexOf(row) + 2}: ${rowError.message}`);
                console.error(`Error processing row during confirmation:`, row, rowError);
            }
        }

        if (importSummary.errors.length > 0) {
            await connection.rollback();
            return res.status(400).json({
                success: false,
                message: `Import completed with ${importSummary.errors.length} errors. All changes rolled back.`,
                details: importSummary.errors
            });
        }

        await connection.commit();

        res.status(200).json({
            success: true,
            message: 'Data imported successfully!',
            details: importSummary
        });

    } catch (error) {
        if (connection) {
            await connection.rollback();
        }
        console.error('Overall import confirmation failed:', error);
        res.status(500).json({ success: false, message: `Import confirmation failed: ${error.message}` });
    } finally {
        if (connection) {
            connection.release();
        }
    }
});


// --- NEW: PDF Download Methods ---
router.get('/strategic_plans/:planId/export-pdf', async (req, res) => {
    const { planId } = req.params;
    let connection;
    try {
        connection = await pool.getConnection();
        const [planRows] = await connection.query('SELECT * FROM strategicplans WHERE id = ?', [planId]);
        if (planRows.length === 0) {
            return res.status(404).json({ message: 'Strategic plan not found.' });
        }
        const plan = planRows[0];
        const [programs] = await connection.query('SELECT programId, programme, needsPriorities, strategies, objectives, outcomes, remarks FROM programs WHERE cidpid = ?', [plan.cidpid]);
        const subprogramPromises = programs.map(p =>
            connection.query('SELECT subProgramme, keyOutcome, kpi, baseline, yr1Targets, yr2Targets, yr3Targets, yr4Targets, yr5Targets, yr1Budget, yr2Budget, yr3Budget, yr4Budget, yr5Budget, totalBudget, remarks FROM subprograms WHERE programId = ?', [p.programId])
        );
        const subprogramResults = await Promise.all(subprogramPromises);
        programs.forEach((p, index) => {
            p.subprograms = subprogramResults[index][0];
        });

        const doc = new PDFDocument();
        const filename = `Strategic_Plan_Report_${plan.cidpName.replace(/\s/g, '_')}.pdf`;
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        doc.pipe(res);
        
        doc.fontSize(20).text(`Strategic Plan Report: ${plan.cidpName}`, { align: 'center' });
        doc.moveDown(0.5);
        doc.fontSize(14).text(`Plan ID: ${plan.cidpid}`);
        doc.fontSize(14).text(`Dates: ${plan.startDate} to ${plan.endDate}`);
        
        if (plan.strategicGoal) {
            doc.moveDown();
            doc.fontSize(16).text('Strategic Goal:', { underline: true });
            doc.moveDown(0.2);
            doc.fontSize(12).text(plan.strategicGoal);
        }
        doc.moveDown(1);
        if (programs && programs.length > 0) {
            doc.fontSize(16).text('Programs & Subprograms:', { underline: true });
            programs.forEach(p => {
                if (doc.y + 150 > doc.page.height - doc.page.margins.bottom) {
                    doc.addPage();
                }
                doc.moveDown(0.5);
                doc.fontSize(14).text(`- Program: ${p.programme}`);
                
                const addMultiLineText = (text, label, indent = 2) => {
                    if (text) {
                        doc.moveDown(0.2);
                        doc.fontSize(12).text(`${' '.repeat(indent)}- ${label}:`);
                        const bulletX = doc.page.margins.left + (indent * doc.fontSize() * 0.5) + (2 * doc.fontSize() * 0.5); 
                        const items = String(text).split('\n').filter(item => item.trim() !== '');
                        items.forEach(item => {
                            doc.text(`• ${item}`, bulletX, doc.y, { width: doc.page.width - bulletX - doc.page.margins.right });
                        });
                    } else {
                        doc.moveDown(0.2);
                        doc.fontSize(12).text(`${' '.repeat(indent)}- ${label}: N/A`);
                    }
                };
                addMultiLineText(p.needsPriorities, 'Needs & Priorities');
                addMultiLineText(p.strategies, 'Strategies');
                addMultiLineText(p.objectives, 'Objectives');
                addMultiLineText(p.outcomes, 'Outcomes');
                addMultiLineText(p.remarks, 'Remarks');
                
                if (p.subprograms && p.subprograms.length > 0) {
                    doc.moveDown(0.2);
                    doc.fontSize(12).text(`  - Subprograms:`);
                    p.subprograms.forEach((s, index) => {
                        doc.moveDown(0.5);
                        doc.fontSize(14).text(`    • Subprogram: ${s.subProgramme}`);
                        doc.fontSize(12).text(`      - KPI: ${s.kpi || 'N/A'}, Baseline: ${s.baseline || 'N/A'}`);
                        const totalBudget = parseFloat(s.totalBudget) || 0;
                        doc.fontSize(12).text(`      - Total Budget: ${formatCurrencyForPdf(s.totalBudget)}`);
                        
                        const budgetsTable = {
                            headers: ['Year 1', 'Year 2', 'Year 3', 'Year 4', 'Year 5'],
                            rows: [[
                                formatCurrencyForPdf(s.yr1Budget), 
                                formatCurrencyForPdf(s.yr2Budget), 
                                formatCurrencyForPdf(s.yr3Budget), 
                                formatCurrencyForPdf(s.yr4Budget), 
                                formatCurrencyForPdf(s.yr5Budget)
                            ]]
                        };
                        doc.moveDown(0.2);
                        doc.fontSize(8).text('      Yearly Budgets:');
                        const subprogramContentStartX = doc.x; 
                        drawTable(doc, budgetsTable, subprogramContentStartX, doc.y, { columnsSize: [70, 70, 70, 70, 70] });
                        doc.moveDown(0.1);
                        
                        const targetsTable = {
                            headers: ['Year 1', 'Year 2', 'Year 3', 'Year 4', 'Year 5'],
                            rows: [[s.yr1Targets || 'N/A', s.yr2Targets || 'N/A', s.yr3Targets || 'N/A', s.yr4Targets || 'N/A', s.yr5Targets || 'N/A']]
                        };
                        doc.moveDown(0.2);
                        doc.fontSize(8).text('      Yearly Targets:');
                        doc.x = subprogramContentStartX; 
                        drawTable(doc, targetsTable, doc.x, doc.y, { columnsSize: [70, 70, 70, 70, 70] });
                        
                        doc.x = doc.page.margins.left + (4 * doc.fontSize() * 0.5) + (2 * doc.fontSize() * 0.5); 
                        
                        addMultiLineText(s.keyOutcome, 'Key Outcome', 4);
                        addMultiLineText(s.remarks, 'Remarks', 4);

                        if (index < p.subprograms.length - 1) {
                            doc.moveDown(0.5);
                        }
                    });
                }
                doc.moveDown();
                doc.lineWidth(0.5).moveTo(doc.page.margins.left, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y).stroke();
                doc.moveDown();
            });
        } else {
            doc.fontSize(12).text('No programs associated with this plan.');
        }

        doc.end();
    } catch (error) {
        console.error('Error generating PDF report:', error);
        res.status(500).json({ message: 'Failed to generate PDF report.', error: error.message });
    } finally {
        if (connection) connection.release();
    }
});

router.get('/programs/:programId/export-pdf', async (req, res) => {
    const { programId } = req.params;
    let connection;

    try {
        connection = await pool.getConnection();

        // Fetch the program details
        const [programRows] = await connection.query('SELECT programId, programme, needsPriorities, strategies, objectives, outcomes, remarks FROM programs WHERE programId = ?', [programId]);
        if (programRows.length === 0) {
            return res.status(404).json({ message: 'Program not found.' });
        }
        const program = programRows[0];

        // Fetch subprograms, workplans, and activities
        const [subprograms] = await connection.query('SELECT subProgramme, subProgramId, keyOutcome, kpi, baseline, yr1Targets, yr2Targets, yr3Targets, yr4Targets, yr5Targets, yr1Budget, yr2Budget, yr3Budget, yr4Budget, yr5Budget, totalBudget, remarks FROM subprograms WHERE programId = ?', [programId]);
        
        const workplanPromises = subprograms.map(s => 
            connection.query('SELECT workplanId, workplanName, subProgramId, financialYear, workplanDescription, totalBudget, approvalStatus FROM annual_workplans WHERE subProgramId = ?', [s.subProgramId])
        );
        const workplanResults = await Promise.all(workplanPromises);
        
        subprograms.forEach((s, index) => {
            s.workplans = workplanResults[index][0];
        });

        const activityPromises = subprograms.flatMap(s => 
            s.workplans.map(wp => 
                connection.query('SELECT activityId, activityName, workplanId, projectId, responsibleOfficer, startDate, endDate, budgetAllocated, actualCost, percentageComplete, activityStatus FROM activities WHERE workplanId = ?', [wp.workplanId])
            )
        );
        const activityResults = await Promise.all(activityPromises);
        
        let activityIndex = 0;
        subprograms.forEach(s => {
            s.workplans.forEach(wp => {
                wp.activities = activityResults[activityIndex][0];
                activityIndex++;
            });
        });

        const doc = new PDFDocument({ margin: 50 });
        const filename = `Program_Report_${program.programme.replace(/\s/g, '_')}.pdf`;

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        
        doc.pipe(res);

        doc.fontSize(20).text(`Program Report: ${program.programme}`, { align: 'center' });
        doc.moveDown(1);
        
        doc.fontSize(16).text('Program Details:', { underline: true });
        doc.moveDown(0.5);
        
        const addMultiLineText = (text, label, indent = 0) => {
            if (text && text.trim() !== '') {
                doc.moveDown(0.3);
                doc.fontSize(12).text(`${' '.repeat(indent)}- ${label}:`);
                
                const indentPx = indent * 10;
                const bulletX = doc.page.margins.left + indentPx + 20;
                const maxWidth = doc.page.width - bulletX - doc.page.margins.right;
                
                const items = String(text).split('\n').filter(item => item.trim() !== '');
                items.forEach(item => {
                    if (item.trim()) {
                        if (doc.y > doc.page.height - 100) {
                            doc.addPage();
                        }
                        doc.text(`• ${item.trim()}`, bulletX, doc.y, { 
                            width: maxWidth,
                            align: 'left'
                        });
                        doc.moveDown(0.2);
                    }
                });
            } else {
                doc.moveDown(0.3);
                doc.fontSize(12).text(`${' '.repeat(indent)}- ${label}: N/A`);
            }
        };
        
        addMultiLineText(program.needsPriorities, 'Needs & Priorities');
        addMultiLineText(program.strategies, 'Strategies');
        addMultiLineText(program.objectives, 'Objectives');
        addMultiLineText(program.outcomes, 'Outcomes');
        addMultiLineText(program.remarks, 'Remarks');
        
        doc.moveDown(1);

        doc.fontSize(16).text('Associated Subprograms:', { underline: true });
        doc.moveDown(0.5);
        
        if (subprograms && subprograms.length > 0) {
            subprograms.forEach((s, index) => {
                if (doc.y > doc.page.height - 200) {
                    doc.addPage();
                }
                
                doc.moveDown(0.5);
                doc.fontSize(14).text(`${index + 1}. Subprogram: ${s.subProgramme}`);
                doc.fontSize(12);
                
                doc.text(`   KPI: ${s.kpi || 'N/A'}`);
                doc.text(`   Baseline: ${s.baseline || 'N/A'}`);
                doc.text(`   Total Budget: ${formatCurrencyForPdf(s.totalBudget)}`);
                
                addMultiLineText(s.keyOutcome, 'Key Outcome', 1);
                addMultiLineText(s.remarks, 'Remarks', 1);

                doc.moveDown(1);
                doc.fontSize(14).text('   - Annual Work Plans:', { underline: true });
                doc.moveDown(0.2);
                if (s.workplans && s.workplans.length > 0) {
                    s.workplans.forEach(wp => {
                        if (doc.y > doc.page.height - 150) {
                            doc.addPage();
                        }
                        doc.moveDown(0.5);
                        doc.fontSize(12).text(`     - Work Plan: ${wp.workplanName} (${wp.financialYear})`);
                        doc.fontSize(10).text(`       Status: ${wp.approvalStatus}, Total Budget: ${formatCurrencyForPdf(wp.totalBudget)}`);
                        if (wp.workplanDescription) {
                            doc.text(`       Description: ${wp.workplanDescription}`);
                        }

                        doc.moveDown(0.5);
                        doc.fontSize(12).text('       - Activities:', { underline: true });
                        doc.moveDown(0.2);
                        if (wp.activities && wp.activities.length > 0) {
                            const activitiesTable = {
                                headers: ['Name', 'Budget', 'Progress', 'Status'],
                                rows: wp.activities.map(a => [
                                    a.activityName || 'N/A',
                                    formatCurrencyForPdf(a.budgetAllocated),
                                    `${a.percentageComplete || 'N/A'}%`,
                                    a.activityStatus || 'N/A'
                                ])
                            };
                            const tableStartX = doc.page.margins.left + 50;
                            drawTable(doc, activitiesTable, tableStartX, doc.y, { columnsSize: [150, 80, 80, 80] });
                        } else {
                            doc.fontSize(10).text('         No activities found.');
                        }
                    });
                } else {
                    doc.fontSize(12).text('   No work plans associated with this subprogram.');
                }
                
                if (index < subprograms.length - 1) {
                    doc.moveDown(0.5);
                    doc.moveTo(doc.page.margins.left, doc.y)
                       .lineTo(doc.page.width - doc.page.margins.right, doc.y)
                       .stroke();
                    doc.moveDown(0.5);
                }
            });
        } else {
            doc.fontSize(12).text('No subprograms associated with this program.');
        }

        doc.end();

    } catch (error) {
        console.error('Error generating PDF report:', error);
        
        if (!res.headersSent) {
            res.status(500).json({ 
                message: 'Failed to generate PDF report.', 
                error: error.message 
            });
        }
    } finally {
        if (connection) {
            connection.release();
        }
    }
});


module.exports = router;
