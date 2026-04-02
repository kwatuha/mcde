const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const orgScope = require('../services/organizationScopeService');
const privilege = require('../middleware/privilegeMiddleware');
const multer = require('multer');
let csv;
try {
    csv = require('csv-parser');
} catch (err) {
    console.warn('csv-parser module not found. Agencies CSV import endpoints will be disabled until it is installed.');
}
const fs = require('fs');
const path = require('path');

const getScopeUserId = (user) => user?.id ?? user?.userId ?? user?.actualUserId ?? null;

// Configure multer for file uploads
const upload = multer({ 
    dest: 'uploads/',
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
            cb(null, true);
        } else {
            cb(new Error('Only CSV files are allowed'), false);
        }
    }
});

/**
 * @route GET /api/agencies
 * @description Get all agencies (paginated)
 * @query {number} page - Page number (default: 1)
 * @query {number} limit - Items per page (default: 50)
 * @query {string} search - Search term for agency name, ministry, or state department
 */
router.get('/', async (req, res) => {
    try {
        // Check if table exists
        const tableCheck = await pool.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name = 'agencies'
            );
        `);
        
        if (!tableCheck.rows[0]?.exists) {
            return res.status(200).json({
                data: [],
                pagination: {
                    page: 1,
                    limit: 50,
                    total: 0,
                    totalPages: 0,
                    hasNext: false,
                    hasPrev: false
                },
                message: 'agencies table does not exist. Please run the migration script to create it.'
            });
        }

        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        const offset = (page - 1) * limit;
        const search = req.query.search || '';

        // Check if alias column exists
        let aliasColumnExists = false;
        try {
            const aliasCheck = await pool.query(`
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = 'agencies' AND column_name = 'alias'
            `);
            aliasColumnExists = aliasCheck.rows.length > 0;
        } catch (checkError) {
            console.warn('Could not check for alias column in agencies:', checkError.message);
            aliasColumnExists = false;
        }

        const scopeUserId = getScopeUserId(req.user);
        const scopePrivileges = req.user?.privileges || [];
        let agencyScopeSql = '';
        const agencyScopeParams = [];
        const isAdminLike = privilege.isAdminLike(req.user);
        if (scopeUserId && !isAdminLike && !orgScope.userHasOrganizationBypass(scopePrivileges) && await orgScope.organizationScopeTableExists()) {
            let scopeFrag = orgScope.buildAgenciesScopeFragment();
            let pnum = 1;
            scopeFrag = scopeFrag.replace(/\?/g, () => `$${pnum++}`);
            agencyScopeSql = ` AND ${scopeFrag}`;
            agencyScopeParams.push(...orgScope.projectScopeParamTriple(scopeUserId));
        }

        let query = `
            SELECT 
                id,
                ministry,
                state_department,
                agency_name,
                ${aliasColumnExists ? "COALESCE(alias, '') AS alias," : "'' AS alias,"}
                created_at,
                updated_at
            FROM agencies
            WHERE voided = false${agencyScopeSql}
        `;
        const params = [...agencyScopeParams];

        if (search) {
            const next = params.length + 1;
            const searchConditions = [
                `agency_name ILIKE $${next}`,
                `ministry ILIKE $${next}`,
                `state_department ILIKE $${next}`
            ];
            if (aliasColumnExists) {
                searchConditions.push(`alias ILIKE $${next}`);
            }
            query += ` AND (${searchConditions.join(' OR ')})`;
            params.push(`%${search}%`);
        }

        query += ` ORDER BY ministry, state_department, agency_name LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
        params.push(limit, offset);

        // Get total count for pagination
        let countQuery = 'SELECT COUNT(*) as total FROM agencies WHERE voided = false' + agencyScopeSql;
        const countParams = [...agencyScopeParams];
        if (search) {
            const next = countParams.length + 1;
            const searchConditions = [
                `agency_name ILIKE $${next}`,
                `ministry ILIKE $${next}`,
                `state_department ILIKE $${next}`
            ];
            if (aliasColumnExists) {
                searchConditions.push(`alias ILIKE $${next}`);
            }
            countQuery += ` AND (${searchConditions.join(' OR ')})`;
            countParams.push(`%${search}%`);
        }

        const [result, countResult] = await Promise.all([
            pool.query(query, params),
            pool.query(countQuery, countParams)
        ]);

        const total = parseInt(countResult.rows[0]?.total || 0);
        const totalPages = Math.ceil(total / limit);

        res.status(200).json({
            data: result.rows,
            pagination: {
                page,
                limit,
                total,
                totalPages,
                hasNext: page < totalPages,
                hasPrev: page > 1
            }
        });
    } catch (error) {
        console.error('Error fetching agencies:', error);
        res.status(500).json({ message: 'Error fetching agencies', error: error.message });
    }
});

/**
 * @route GET /api/agencies/:id
 * @description Get a single agency by ID
 */
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query(
            `SELECT 
                id,
                ministry,
                state_department,
                agency_name,
                COALESCE(alias, '') AS alias,
                created_at,
                updated_at
            FROM agencies
            WHERE id = $1 AND voided = false`,
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Agency not found' });
        }

        res.status(200).json(result.rows[0]);
    } catch (error) {
        console.error('Error fetching agency:', error);
        res.status(500).json({ message: 'Error fetching agency', error: error.message });
    }
});

/**
 * @route POST /api/agencies
 * @description Create a new agency
 */
router.post('/', async (req, res) => {
    try {
        const {
            ministry,
            state_department,
            agency_name,
            alias
        } = req.body;

        if (!agency_name) {
            return res.status(400).json({ message: 'Agency name is required' });
        }

        if (!ministry) {
            return res.status(400).json({ message: 'Ministry is required' });
        }

        if (!state_department) {
            return res.status(400).json({ message: 'State Department is required' });
        }

        // Check if alias column exists
        let aliasColumnExists = false;
        try {
            const checkResult = await pool.query(`
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = 'agencies' AND column_name = 'alias'
            `);
            aliasColumnExists = checkResult.rows.length > 0;
        } catch (checkError) {
            console.warn('Could not check for alias column in agencies, assuming it does not exist:', checkError.message);
            aliasColumnExists = false;
        }

        // Check if agency with same name already exists
        const existingCheck = await pool.query(
            'SELECT id FROM agencies WHERE agency_name = $1 AND voided = false',
            [agency_name]
        );

        if (existingCheck.rows.length > 0) {
            return res.status(400).json({ message: 'An agency with this name already exists' });
        }

        let query, params;
        if (aliasColumnExists) {
            query = `
                INSERT INTO agencies (
                    ministry, state_department, agency_name, alias
                ) VALUES ($1, $2, $3, $4)
                RETURNING id, ministry, state_department, agency_name, COALESCE(alias, '') AS alias, created_at, updated_at
            `;
            params = [ministry, state_department, agency_name, alias?.trim() || null];
        } else {
            query = `
                INSERT INTO agencies (
                    ministry, state_department, agency_name
                ) VALUES ($1, $2, $3)
                RETURNING id, ministry, state_department, agency_name, '' AS alias, created_at, updated_at
            `;
            params = [ministry, state_department, agency_name];
        }

        const result = await pool.query(query, params);

        res.status(201).json({
            message: 'Agency created successfully',
            data: result.rows[0]
        });
    } catch (error) {
        console.error('Error creating agency:', error);
        res.status(500).json({ message: 'Error creating agency', error: error.message });
    }
});

/**
 * @route PUT /api/agencies/:id
 * @description Update an existing agency
 */
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const {
            ministry,
            state_department,
            agency_name,
            alias
        } = req.body;

        if (!agency_name) {
            return res.status(400).json({ message: 'Agency name is required' });
        }

        if (!ministry) {
            return res.status(400).json({ message: 'Ministry is required' });
        }

        if (!state_department) {
            return res.status(400).json({ message: 'State Department is required' });
        }

        // Check if alias column exists
        let aliasColumnExists = false;
        try {
            const checkResult = await pool.query(`
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = 'agencies' AND column_name = 'alias'
            `);
            aliasColumnExists = checkResult.rows.length > 0;
        } catch (checkError) {
            console.warn('Could not check for alias column in agencies, assuming it does not exist:', checkError.message);
            aliasColumnExists = false;
        }

        // Check if agency exists
        const existingCheck = await pool.query(
            'SELECT id FROM agencies WHERE id = $1 AND voided = false',
            [id]
        );

        if (existingCheck.rows.length === 0) {
            return res.status(404).json({ message: 'Agency not found' });
        }

        // Check if another agency with same name exists
        const duplicateCheck = await pool.query(
            'SELECT id FROM agencies WHERE agency_name = $1 AND id != $2 AND voided = false',
            [agency_name, id]
        );

        if (duplicateCheck.rows.length > 0) {
            return res.status(400).json({ message: 'An agency with this name already exists' });
        }

        console.log(`[Agencies Update] Alias column exists: ${aliasColumnExists}, Alias value: "${alias}"`);
        
        let query, params;
        if (aliasColumnExists) {
            query = `
                UPDATE agencies 
                SET 
                    ministry = $1,
                    state_department = $2,
                    agency_name = $3,
                    alias = $4,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $5 AND voided = false
                RETURNING id, ministry, state_department, agency_name, COALESCE(alias, '') AS alias, created_at, updated_at
            `;
            params = [ministry, state_department, agency_name, alias?.trim() || null, id];
        } else {
            console.warn('[Agencies Update] Alias column does not exist, alias value will not be saved. Please run migration script.');
            query = `
                UPDATE agencies 
                SET 
                    ministry = $1,
                    state_department = $2,
                    agency_name = $3,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $4 AND voided = false
                RETURNING id, ministry, state_department, agency_name, '' AS alias, created_at, updated_at
            `;
            params = [ministry, state_department, agency_name, id];
        }

        console.log(`[Agencies Update] Executing query with params:`, params);
        const result = await pool.query(query, params);
        console.log(`[Agencies Update] Update result:`, result.rows?.[0] || result);

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Agency not found' });
        }

        res.status(200).json({
            message: 'Agency updated successfully',
            data: result.rows[0]
        });
    } catch (error) {
        console.error('Error updating agency:', error);
        res.status(500).json({ message: 'Error updating agency', error: error.message });
    }
});

/**
 * @route DELETE /api/agencies/:id
 * @description Soft delete an agency (set voided = true)
 */
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const result = await pool.query(
            `UPDATE agencies 
            SET voided = true, updated_at = CURRENT_TIMESTAMP
            WHERE id = $1 AND voided = false
            RETURNING id`,
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Agency not found' });
        }

        res.status(200).json({ message: 'Agency deleted successfully' });
    } catch (error) {
        console.error('Error deleting agency:', error);
        res.status(500).json({ message: 'Error deleting agency', error: error.message });
    }
});

/**
 * @route POST /api/agencies/import
 * @description Import agencies from uploaded CSV file
 */
router.post('/import', upload.single('file'), async (req, res) => {
    if (!csv) {
        return res.status(500).json({ 
            message: 'CSV import is not available. Please install csv-parser module.' 
        });
    }

    if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded' });
    }

    const filePath = req.file.path;
    const agencies = [];
    let imported = 0;
    let skipped = 0;
    let errors = [];

    try {
        await new Promise((resolve, reject) => {
            fs.createReadStream(filePath)
                .pipe(csv())
                .on('data', (row) => {
                    // Map CSV columns to database fields (handle BOM character)
                    const ministry = (row['Ministry'] || row['\ufeffMinistry'] || row['ministry'] || '').trim();
                    const stateDepartment = (row['State Department'] || row['state_department'] || '').trim();
                    const agencyName = (row['Agency / Institution'] || row['agency_name'] || '').trim();

                    if (agencyName && ministry && stateDepartment) {
                        agencies.push({
                            ministry,
                            state_department: stateDepartment,
                            agency_name: agencyName
                        });
                    }
                })
                .on('end', resolve)
                .on('error', reject);
        });

        // Get all existing agency names in one query
        const existingAgenciesResult = await pool.query(
            'SELECT agency_name FROM agencies WHERE voided = false'
        );
        const existingAgencyNames = new Set(
            existingAgenciesResult.rows.map(row => row.agency_name.toLowerCase().trim())
        );

        // Filter out agencies that already exist
        const agenciesToImport = agencies.filter(agency => {
            const agencyNameLower = agency.agency_name.toLowerCase().trim();
            if (existingAgencyNames.has(agencyNameLower)) {
                skipped++;
                return false;
            }
            existingAgencyNames.add(agencyNameLower); // Track duplicates within the import batch
            return true;
        });

        // Import agencies - process individually to handle errors gracefully
        for (const agency of agenciesToImport) {
            try {
                await pool.query(
                    'INSERT INTO agencies (ministry, state_department, agency_name) VALUES ($1, $2, $3)',
                    [agency.ministry, agency.state_department, agency.agency_name]
                );
                imported++;
            } catch (err) {
                // Check if it's a unique constraint violation (duplicate)
                if (err.code === '23505' || err.message.includes('duplicate') || err.message.includes('unique')) {
                    skipped++;
                } else {
                    errors.push(`Error importing ${agency.agency_name}: ${err.message}`);
                    console.error(`Error importing agency ${agency.agency_name}:`, err);
                }
            }
        }

        // Clean up uploaded file
        fs.unlinkSync(filePath);

        res.status(200).json({
            message: 'Import completed',
            imported,
            skipped,
            total: agencies.length,
            errors: errors.length > 0 ? errors : undefined
        });
    } catch (error) {
        // Clean up uploaded file on error
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
        console.error('Error importing agencies:', error);
        res.status(500).json({ 
            message: 'Error importing agencies', 
            error: error.message 
        });
    }
});

/**
 * @route POST /api/agencies/import-from-path
 * @description Import agencies from a file path on the server
 */
router.post('/import-from-path', async (req, res) => {
    if (!csv) {
        return res.status(500).json({ 
            message: 'CSV import is not available. Please install csv-parser module.' 
        });
    }

    const filePath = req.body.path || '/app/adp/agencies.csv';
    
    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ message: `File not found: ${filePath}` });
    }

    const agencies = [];
    let imported = 0;
    let skipped = 0;
    let errors = [];

    try {
        await new Promise((resolve, reject) => {
            fs.createReadStream(filePath)
                .pipe(csv())
                .on('data', (row) => {
                    // Map CSV columns to database fields (handle BOM character)
                    const ministry = (row['Ministry'] || row['\ufeffMinistry'] || row['ministry'] || '').trim();
                    const stateDepartment = (row['State Department'] || row['state_department'] || '').trim();
                    const agencyName = (row['Agency / Institution'] || row['agency_name'] || '').trim();

                    if (agencyName && ministry && stateDepartment) {
                        agencies.push({
                            ministry,
                            state_department: stateDepartment,
                            agency_name: agencyName
                        });
                    }
                })
                .on('end', resolve)
                .on('error', reject);
        });

        // Get all existing agency names in one query
        const existingAgenciesResult = await pool.query(
            'SELECT agency_name FROM agencies WHERE voided = false'
        );
        const existingAgencyNames = new Set(
            existingAgenciesResult.rows.map(row => row.agency_name.toLowerCase().trim())
        );

        // Filter out agencies that already exist
        const agenciesToImport = agencies.filter(agency => {
            const agencyNameLower = agency.agency_name.toLowerCase().trim();
            if (existingAgencyNames.has(agencyNameLower)) {
                skipped++;
                return false;
            }
            existingAgencyNames.add(agencyNameLower); // Track duplicates within the import batch
            return true;
        });

        // Import agencies - process individually to handle errors gracefully
        for (const agency of agenciesToImport) {
            try {
                await pool.query(
                    'INSERT INTO agencies (ministry, state_department, agency_name) VALUES ($1, $2, $3)',
                    [agency.ministry, agency.state_department, agency.agency_name]
                );
                imported++;
            } catch (err) {
                // Check if it's a unique constraint violation (duplicate)
                if (err.code === '23505' || err.message.includes('duplicate') || err.message.includes('unique')) {
                    skipped++;
                } else {
                    errors.push(`Error importing ${agency.agency_name}: ${err.message}`);
                    console.error(`Error importing agency ${agency.agency_name}:`, err);
                }
            }
        }

        res.status(200).json({
            message: 'Import completed',
            imported,
            skipped,
            total: agencies.length,
            errors: errors.length > 0 ? errors : undefined
        });
    } catch (error) {
        console.error('Error importing agencies:', error);
        res.status(500).json({ 
            message: 'Error importing agencies', 
            error: error.message 
        });
    }
});

/**
 * @route GET /api/agencies/export/all
 * @description Get all agencies for export (no pagination)
 */
router.get('/export/all', async (req, res) => {
    try {
        const search = req.query.search || '';
        
        let query = `
            SELECT 
                id,
                ministry,
                state_department,
                agency_name,
                created_at,
                updated_at
            FROM agencies
            WHERE voided = false
        `;
        const params = [];

        if (search) {
            query += ` AND (
                agency_name ILIKE $1 OR
                ministry ILIKE $1 OR
                state_department ILIKE $1
            )`;
            params.push(`%${search}%`);
        }

        query += ` ORDER BY ministry, state_department, agency_name`;

        const result = await pool.query(query, params);

        res.status(200).json({
            data: result.rows,
            total: result.rows.length
        });
    } catch (error) {
        console.error('Error fetching all agencies for export:', error);
        res.status(500).json({ message: 'Error fetching agencies for export', error: error.message });
    }
});

module.exports = router;
