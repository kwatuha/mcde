const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { resolveKenyaWardSubcounty, deriveKenyaWardSubcounty } = require('../utils/deriveKenyaWardSubcounty');
const multer = require('multer');
let csv;
try {
    // csv-parser is used for CSV imports; wrap in try/catch so missing module doesn't crash the app
    // If it's not installed in the container, import endpoints will return a helpful error
    // instead of bringing down the whole API.
    // Install with: npm install csv-parser --save
    // or add it to package.json dependencies and rebuild the Docker image.
    csv = require('csv-parser');
} catch (err) {
    console.warn('csv-parser module not found. Kenya wards CSV import endpoints will be disabled until it is installed.');
}
const fs = require('fs');
const path = require('path');

/** When non-empty, list/read endpoints only return wards whose county matches (ILIKE). Unset defaults to Machakos; set to empty string to show all counties. */
const WARDS_COUNTY_SCOPE = process.env.WARDS_COUNTY_SCOPE !== undefined
    ? String(process.env.WARDS_COUNTY_SCOPE).trim()
    : 'Machakos';

/** Cached: whether public.kenya_wards has subcounty column (migration applied). */
let kenyaWardsSubcountyColumnExists = null;

async function getKenyaWardsSubcountyColumnExists() {
    if (kenyaWardsSubcountyColumnExists !== null) {
        return kenyaWardsSubcountyColumnExists;
    }
    const r = await pool.query(`
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'kenya_wards'
          AND column_name = 'subcounty'
        LIMIT 1
    `);
    kenyaWardsSubcountyColumnExists = r.rows.length > 0;
    return kenyaWardsSubcountyColumnExists;
}

function rowWithSubcounty(row, hasDbColumn) {
    const derived = deriveKenyaWardSubcounty({
        iebcWardName: row.iebc_ward_name,
        division: row.division,
        county: row.county,
    });
    if (hasDbColumn) {
        const existing = row.subcounty != null && String(row.subcounty).trim() !== '';
        if (existing) return row;
        return { ...row, subcounty: derived };
    }
    return { ...row, subcounty: derived };
}

function normalizeName(value) {
    return String(value || '').trim();
}

function preferredSubcounty(row) {
    return normalizeName(row?.subcounty || row?.constituency || row?.division);
}

async function cascadeWardGeography(client, previousWard, updatedWard) {
    const oldWardName = normalizeName(previousWard?.iebc_ward_name);
    const nextWardName = normalizeName(updatedWard?.iebc_ward_name || previousWard?.iebc_ward_name);
    const nextSubcounty = preferredSubcounty(updatedWard) || preferredSubcounty(previousWard);
    const nextCounty = normalizeName(updatedWard?.county || previousWard?.county);

    if (!oldWardName || !nextWardName) {
        return { projectsUpdated: 0, projectSitesUpdated: 0 };
    }

    const projectsResult = await client.query(
        `
        UPDATE projects
        SET location = jsonb_set(
                jsonb_set(
                    jsonb_set(COALESCE(location, '{}'::jsonb), '{ward}', to_jsonb($2::text), true),
                    '{constituency}', to_jsonb($3::text),
                    true
                ),
                '{county}', to_jsonb($4::text),
                true
            )
        WHERE COALESCE(voided, false) = false
          AND location IS NOT NULL
          AND LOWER(TRIM(location->>'ward')) = LOWER(TRIM($1))
        `,
        [oldWardName, nextWardName, nextSubcounty, nextCounty]
    );

    const projectSitesResult = await client.query(
        `
        UPDATE project_sites
        SET ward = $2,
            constituency = $3,
            county = $4
        WHERE LOWER(TRIM(COALESCE(ward, ''))) = LOWER(TRIM($1))
        `,
        [oldWardName, nextWardName, nextSubcounty, nextCounty]
    ).catch(() => ({ rowCount: 0 }));

    return {
        projectsUpdated: projectsResult.rowCount || 0,
        projectSitesUpdated: projectSitesResult.rowCount || 0,
    };
}

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
 * @route GET /api/kenya-wards
 * @description Get all Kenya wards (paginated)
 * @query {number} page - Page number (default: 1)
 * @query {number} limit - Items per page (default: 50)
 * @query {string} search - Search term for ward name, province, district, or division
 */
router.get('/', async (req, res) => {
    try {
        // Check if table exists
        const tableCheck = await pool.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name = 'kenya_wards'
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
                message: 'kenya_wards table does not exist. Please run the migration script to create it.'
            });
        }

        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        const offset = (page - 1) * limit;
        const search = req.query.search || '';

        const hasSubcountyCol = await getKenyaWardsSubcountyColumnExists();
        const wardSelectList = hasSubcountyCol
            ? `id, iebc_ward_name, count, province, district, division, county, constituency, subcounty, pcode, status, no, shape_type, status_1, created_at, updated_at`
            : `id, iebc_ward_name, count, province, district, division, county, constituency, pcode, status, no, shape_type, status_1, created_at, updated_at`;

        let query = `
            SELECT ${wardSelectList}
            FROM kenya_wards
            WHERE voided = false
        `;
        const params = [];

        if (WARDS_COUNTY_SCOPE) {
            query += ` AND county ILIKE $${params.length + 1}`;
            params.push(`%${WARDS_COUNTY_SCOPE}%`);
        }

        if (search) {
            const subcountySearch = hasSubcountyCol
                ? ` OR
                subcounty ILIKE $${params.length + 1}`
                : '';
            query += ` AND (
                iebc_ward_name ILIKE $${params.length + 1} OR
                province ILIKE $${params.length + 1} OR
                district ILIKE $${params.length + 1} OR
                division ILIKE $${params.length + 1} OR
                county ILIKE $${params.length + 1} OR
                constituency ILIKE $${params.length + 1}${subcountySearch} OR
                pcode ILIKE $${params.length + 1}
            )`;
            params.push(`%${search}%`);
        }

        const orderByGeo = hasSubcountyCol
            ? `province, district, subcounty, division, iebc_ward_name`
            : `province, district, division, iebc_ward_name`;
        query += ` ORDER BY ${orderByGeo} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
        params.push(limit, offset);

        // Get total count for pagination
        let countQuery = 'SELECT COUNT(*) as total FROM kenya_wards WHERE voided = false';
        const countParams = [];
        if (WARDS_COUNTY_SCOPE) {
            countQuery += ` AND county ILIKE $${countParams.length + 1}`;
            countParams.push(`%${WARDS_COUNTY_SCOPE}%`);
        }
        if (search) {
            const subcountyCountSearch = hasSubcountyCol
                ? ` OR
                subcounty ILIKE $${countParams.length + 1}`
                : '';
            countQuery += ` AND (
                iebc_ward_name ILIKE $${countParams.length + 1} OR
                province ILIKE $${countParams.length + 1} OR
                district ILIKE $${countParams.length + 1} OR
                division ILIKE $${countParams.length + 1} OR
                county ILIKE $${countParams.length + 1} OR
                constituency ILIKE $${countParams.length + 1}${subcountyCountSearch} OR
                pcode ILIKE $${countParams.length + 1}
            )`;
            countParams.push(`%${search}%`);
        }

        const [result, countResult] = await Promise.all([
            pool.query(query, params),
            pool.query(countQuery, countParams)
        ]);

        const total = parseInt(countResult.rows[0]?.total || 0);
        const totalPages = Math.ceil(total / limit);

        const data = result.rows.map((row) => rowWithSubcounty(row, hasSubcountyCol));

        res.status(200).json({
            data,
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
        console.error('Error fetching Kenya wards:', error);
        res.status(500).json({ message: 'Error fetching Kenya wards', error: error.message });
    }
});

/**
 * @route GET /api/kenya-wards/counties
 * @description Get distinct counties from kenya_wards table
 */
router.get('/counties', async (req, res) => {
    try {
        const scopeClause = WARDS_COUNTY_SCOPE
            ? ' AND county ILIKE $1'
            : '';
        const scopeParams = WARDS_COUNTY_SCOPE ? [`%${WARDS_COUNTY_SCOPE}%`] : [];
        const result = await pool.query(`
            SELECT DISTINCT county
            FROM kenya_wards
            WHERE voided = false AND county IS NOT NULL AND county != ''
            ${scopeClause}
            ORDER BY county ASC
        `, scopeParams);
        
        const counties = result.rows.map(row => row.county).filter(Boolean);
        res.status(200).json({ data: counties });
    } catch (error) {
        console.error('Error fetching counties:', error);
        res.status(500).json({ message: 'Error fetching counties', error: error.message });
    }
});

/**
 * @route GET /api/kenya-wards/constituencies
 * @description Get distinct constituencies for a given county
 * @query {string} county - County name to filter constituencies
 */
router.get('/constituencies', async (req, res) => {
    try {
        const { county } = req.query;

        if (!WARDS_COUNTY_SCOPE && !county) {
            return res.status(400).json({ message: 'County parameter is required' });
        }

        const params = [];
        let countyFilter = '';
        if (WARDS_COUNTY_SCOPE) {
            countyFilter = ` AND county ILIKE $${params.length + 1}`;
            params.push(`%${WARDS_COUNTY_SCOPE}%`);
        } else {
            countyFilter = ` AND county = $${params.length + 1}`;
            params.push(county);
        }

        const result = await pool.query(`
            SELECT DISTINCT constituency
            FROM kenya_wards
            WHERE voided = false 
                ${countyFilter}
                AND constituency IS NOT NULL 
                AND constituency != ''
            ORDER BY constituency ASC
        `, params);
        
        const constituencies = result.rows.map(row => row.constituency).filter(Boolean);
        res.status(200).json({ data: constituencies });
    } catch (error) {
        console.error('Error fetching constituencies:', error);
        res.status(500).json({ message: 'Error fetching constituencies', error: error.message });
    }
});

/**
 * @route GET /api/kenya-wards/wards
 * @description Get distinct wards for a given constituency
 * @query {string} constituency - Constituency name to filter wards
 */
router.get('/wards', async (req, res) => {
    try {
        const { constituency } = req.query;
        
        if (!constituency) {
            return res.status(400).json({ message: 'Constituency parameter is required' });
        }

        const wardParams = [constituency];
        let countyClause = '';
        if (WARDS_COUNTY_SCOPE) {
            countyClause = ` AND county ILIKE $2`;
            wardParams.push(`%${WARDS_COUNTY_SCOPE}%`);
        }

        const result = await pool.query(`
            SELECT DISTINCT id, iebc_ward_name, pcode
            FROM kenya_wards
            WHERE voided = false 
                AND constituency = $1 
                ${countyClause}
                AND iebc_ward_name IS NOT NULL 
                AND iebc_ward_name != ''
            ORDER BY iebc_ward_name ASC
        `, wardParams);
        
        const wards = result.rows.map(row => ({
            id: row.id,
            name: row.iebc_ward_name,
            pcode: row.pcode
        }));
        res.status(200).json({ data: wards });
    } catch (error) {
        console.error('Error fetching wards:', error);
        res.status(500).json({ message: 'Error fetching wards', error: error.message });
    }
});

/**
 * @route GET /api/kenya-wards/subcounties
 * @description Distinct sub-county labels for the configured county scope (from subcounty column, or division if column missing)
 */
router.get('/subcounties', async (req, res) => {
    try {
        const county = req.query.county != null ? String(req.query.county).trim() : '';
        const hasSub = await getKenyaWardsSubcountyColumnExists();
        const params = [];
        let countyClause = '';
        if (WARDS_COUNTY_SCOPE) {
            countyClause = ` AND county ILIKE $${params.length + 1}`;
            params.push(`%${WARDS_COUNTY_SCOPE}%`);
        } else if (county) {
            countyClause = ` AND county ILIKE $${params.length + 1}`;
            params.push(`%${county}%`);
        }

        const selectList = hasSub
            ? 'iebc_ward_name, division, county, subcounty'
            : 'iebc_ward_name, division, county';
        const result = await pool.query(
            `SELECT ${selectList}
            FROM kenya_wards
            WHERE voided = false
            ${countyClause}
            ORDER BY county ASC, division ASC, iebc_ward_name ASC`,
            params
        );

        const names = [...new Set(
            result.rows
                .map((row) => rowWithSubcounty(row, hasSub).subcounty)
                .map((name) => (name ? String(name).trim() : ''))
                .filter(Boolean)
        )].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
        res.status(200).json({ data: names });
    } catch (error) {
        console.error('Error fetching sub-counties:', error);
        res.status(500).json({ message: 'Error fetching sub-counties', error: error.message });
    }
});

/**
 * @route GET /api/kenya-wards/wards-by-subcounty
 * @description Wards in county scope, optionally filtered by sub-county (cascading from subcounty pickers)
 * @query {string} subcounty - When set, only wards in that sub-county; when omitted or empty, all wards in scope
 */
router.get('/wards-by-subcounty', async (req, res) => {
    try {
        const subcounty = req.query.subcounty != null ? String(req.query.subcounty).trim() : '';
        const county = req.query.county != null ? String(req.query.county).trim() : '';
        const hasSub = await getKenyaWardsSubcountyColumnExists();

        const params = [];
        let countyClause = '';
        if (WARDS_COUNTY_SCOPE) {
            params.push(`%${WARDS_COUNTY_SCOPE}%`);
            countyClause = ` AND county ILIKE $${params.length}`;
        } else if (county) {
            params.push(`%${county}%`);
            countyClause = ` AND county ILIKE $${params.length}`;
        }

        const selectList = hasSub
            ? 'id, iebc_ward_name, division, county, subcounty, pcode'
            : 'id, iebc_ward_name, division, county, pcode';
        const result = await pool.query(
            `SELECT ${selectList}
            FROM kenya_wards
            WHERE voided = false
              AND iebc_ward_name IS NOT NULL
              AND TRIM(iebc_ward_name) <> ''
            ${countyClause}
            ORDER BY iebc_ward_name ASC`,
            params
        );

        const seen = new Set();
        const wards = [];
        result.rows
            .map((row) => rowWithSubcounty(row, hasSub))
            .filter((row) => {
                if (!subcounty) return true;
                return String(row.subcounty || '').trim().toLowerCase() === subcounty.toLowerCase();
            })
            .forEach((row) => {
                const name = String(row.iebc_ward_name || '').trim();
                if (!name) return;
                const key = `${name.toLowerCase()}__${row.pcode || ''}`;
                if (seen.has(key)) return;
                seen.add(key);
                wards.push({
                    id: row.id,
                    name,
                    pcode: row.pcode,
                });
            });
        res.status(200).json({ data: wards });
    } catch (error) {
        console.error('Error fetching wards by sub-county:', error);
        res.status(500).json({ message: 'Error fetching wards by sub-county', error: error.message });
    }
});

/**
 * @route GET /api/kenya-wards/:id
 * @description Get a single ward by ID
 */
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const idParams = [id];
        let countyClause = '';
        if (WARDS_COUNTY_SCOPE) {
            countyClause = ' AND county ILIKE $2';
            idParams.push(`%${WARDS_COUNTY_SCOPE}%`);
        }
        const hasSubcountyCol = await getKenyaWardsSubcountyColumnExists();
        const wardSelectList = hasSubcountyCol
            ? `id, iebc_ward_name, count, province, district, division, county, constituency, subcounty, pcode, status, no, shape_type, status_1, created_at, updated_at`
            : `id, iebc_ward_name, count, province, district, division, county, constituency, pcode, status, no, shape_type, status_1, created_at, updated_at`;
        const result = await pool.query(
            `SELECT ${wardSelectList}
            FROM kenya_wards
            WHERE id = $1 AND voided = false${countyClause}`,
            idParams
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Ward not found' });
        }

        res.status(200).json(rowWithSubcounty(result.rows[0], hasSubcountyCol));
    } catch (error) {
        console.error('Error fetching ward:', error);
        res.status(500).json({ message: 'Error fetching ward', error: error.message });
    }
});

/**
 * @route POST /api/kenya-wards
 * @description Create a new ward
 */
router.post('/', async (req, res) => {
    try {
        const {
            iebc_ward_name,
            count,
            province,
            district,
            division,
            county,
            constituency,
            subcounty,
            pcode,
            status,
            no,
            shape_type,
            status_1
        } = req.body;

        if (!iebc_ward_name) {
            return res.status(400).json({ message: 'IEBC ward name is required' });
        }

        const scopedCounty = county || WARDS_COUNTY_SCOPE || null;
        const resolvedSubcounty = resolveKenyaWardSubcounty({
            iebcWardName: iebc_ward_name,
            division,
            county: scopedCounty,
            district,
            subcounty,
        });

        // Check if pcode already exists (if provided)
        if (pcode) {
            const existing = await pool.query(
                'SELECT id FROM kenya_wards WHERE pcode = $1 AND voided = false',
                [pcode]
            );
            if (existing.rows.length > 0) {
                return res.status(400).json({ message: 'Ward with this PCODE already exists' });
            }
        }

        const hasSubcountyCol = await getKenyaWardsSubcountyColumnExists();
        let result;
        if (hasSubcountyCol) {
            result = await pool.query(
                `INSERT INTO kenya_wards (
                    iebc_ward_name, count, province, district, division, county, constituency, subcounty,
                    pcode, status, no, shape_type, status_1
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
                RETURNING id, iebc_ward_name, count, province, district, division, county, constituency,
                          subcounty, pcode, status, no, shape_type, status_1, created_at, updated_at`,
                [iebc_ward_name, count || null, province || null, district || null, division || null,
                    scopedCounty, constituency || null, resolvedSubcounty, pcode || null, status || null, no || null,
                    shape_type || null, status_1 || null]
            );
        } else {
            result = await pool.query(
                `INSERT INTO kenya_wards (
                    iebc_ward_name, count, province, district, division, county, constituency,
                    pcode, status, no, shape_type, status_1
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
                RETURNING id, iebc_ward_name, count, province, district, division, county, constituency,
                          pcode, status, no, shape_type, status_1, created_at, updated_at`,
                [iebc_ward_name, count || null, province || null, district || null, division || null,
                    scopedCounty, constituency || null, pcode || null, status || null, no || null,
                    shape_type || null, status_1 || null]
            );
        }

        res.status(201).json({
            message: 'Ward created successfully',
            data: rowWithSubcounty(result.rows[0], hasSubcountyCol)
        });
    } catch (error) {
        console.error('Error creating ward:', error);
        res.status(500).json({ message: 'Error creating ward', error: error.message });
    }
});

/**
 * @route PUT /api/kenya-wards/:id
 * @description Update an existing ward
 */
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const {
            iebc_ward_name,
            count,
            province,
            district,
            division,
            county,
            constituency,
            subcounty,
            pcode,
            status,
            no,
            shape_type,
            status_1,
            cascadeProjectLocations
        } = req.body;

        const resolvedSubcounty = resolveKenyaWardSubcounty({
            iebcWardName: iebc_ward_name,
            division,
            county,
            district,
            subcounty,
        });

        const existingParams = [id];
        let existingCounty = '';
        if (WARDS_COUNTY_SCOPE) {
            existingCounty = ' AND county ILIKE $2';
            existingParams.push(`%${WARDS_COUNTY_SCOPE}%`);
        }
        const hasSubcountyCol = await getKenyaWardsSubcountyColumnExists();
        const existingSelectList = hasSubcountyCol
            ? `id, iebc_ward_name, count, province, district, division, county, constituency, subcounty,
               pcode, status, no, shape_type, status_1, created_at, updated_at`
            : `id, iebc_ward_name, count, province, district, division, county, constituency,
               pcode, status, no, shape_type, status_1, created_at, updated_at`;
        const existing = await pool.query(
            `SELECT ${existingSelectList} FROM kenya_wards WHERE id = $1 AND voided = false${existingCounty}`,
            existingParams
        );

        if (existing.rows.length === 0) {
            return res.status(404).json({ message: 'Ward not found' });
        }

        // Check if pcode already exists for another ward (if provided)
        if (pcode) {
            const pcodeCheck = await pool.query(
                `SELECT id FROM kenya_wards WHERE pcode = $1 AND id != $2 AND voided = false${WARDS_COUNTY_SCOPE ? ' AND county ILIKE $3' : ''}`,
                WARDS_COUNTY_SCOPE ? [pcode, id, `%${WARDS_COUNTY_SCOPE}%`] : [pcode, id]
            );
            if (pcodeCheck.rows.length > 0) {
                return res.status(400).json({ message: 'Ward with this PCODE already exists' });
            }
        }

        const previousWard = rowWithSubcounty(existing.rows[0], hasSubcountyCol);
        let result;
        if (hasSubcountyCol) {
            const updateParams = [iebc_ward_name, count || null, province || null, district || null, division || null,
                county || null, constituency || null, pcode || null, status || null, no || null,
                shape_type || null, status_1 || null, resolvedSubcounty, id];
            let updateCounty = '';
            if (WARDS_COUNTY_SCOPE) {
                updateCounty = ' AND county ILIKE $15';
                updateParams.push(`%${WARDS_COUNTY_SCOPE}%`);
            }
            result = await pool.query(
                `UPDATE kenya_wards SET
                    iebc_ward_name = COALESCE($1, iebc_ward_name),
                    count = $2,
                    province = $3,
                    district = $4,
                    division = $5,
                    county = $6,
                    constituency = $7,
                    pcode = $8,
                    status = $9,
                    no = $10,
                    shape_type = $11,
                    status_1 = $12,
                    subcounty = $13,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $14 AND voided = false${updateCounty}
                RETURNING id, iebc_ward_name, count, province, district, division, county, constituency,
                          subcounty, pcode, status, no, shape_type, status_1, created_at, updated_at`,
                updateParams
            );
        } else {
            const updateParams = [iebc_ward_name, count || null, province || null, district || null, division || null,
                county || null, constituency || null, pcode || null, status || null, no || null,
                shape_type || null, status_1 || null, id];
            let updateCounty = '';
            if (WARDS_COUNTY_SCOPE) {
                updateCounty = ' AND county ILIKE $14';
                updateParams.push(`%${WARDS_COUNTY_SCOPE}%`);
            }
            result = await pool.query(
                `UPDATE kenya_wards SET
                    iebc_ward_name = COALESCE($1, iebc_ward_name),
                    count = $2,
                    province = $3,
                    district = $4,
                    division = $5,
                    county = $6,
                    constituency = $7,
                    pcode = $8,
                    status = $9,
                    no = $10,
                    shape_type = $11,
                    status_1 = $12,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $13 AND voided = false${updateCounty}
                RETURNING id, iebc_ward_name, count, province, district, division, county, constituency,
                          pcode, status, no, shape_type, status_1, created_at, updated_at`,
                updateParams
            );
        }

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Ward not found' });
        }

        const updatedWard = rowWithSubcounty(result.rows[0], hasSubcountyCol);
        const cascadeSummary = cascadeProjectLocations
            ? await cascadeWardGeography(pool, previousWard, updatedWard)
            : { projectsUpdated: 0, projectSitesUpdated: 0 };

        res.status(200).json({
            message: 'Ward updated successfully',
            data: updatedWard,
            cascade: cascadeSummary
        });
    } catch (error) {
        console.error('Error updating ward:', error);
        res.status(500).json({ message: 'Error updating ward', error: error.message });
    }
});

/**
 * @route DELETE /api/kenya-wards/:id
 * @description Soft delete a ward
 */
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const delParams = [id];
        let delCounty = '';
        if (WARDS_COUNTY_SCOPE) {
            delCounty = ' AND county ILIKE $2';
            delParams.push(`%${WARDS_COUNTY_SCOPE}%`);
        }
        const result = await pool.query(
            `UPDATE kenya_wards SET voided = true, updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND voided = false${delCounty} RETURNING id`,
            delParams
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Ward not found' });
        }

        res.status(200).json({ message: 'Ward deleted successfully' });
    } catch (error) {
        console.error('Error deleting ward:', error);
        res.status(500).json({ message: 'Error deleting ward', error: error.message });
    }
});

/**
 * @route POST /api/kenya-wards/import
 * @description Import wards from CSV file
 */
router.post('/import', upload.single('file'), async (req, res) => {
    // If csv-parser is not available, fail fast with a clear message
    if (!csv) {
        return res.status(500).json({
            message: 'CSV import is not available on this server. Please install csv-parser and rebuild the API container.'
        });
    }

    const filePath = req.file?.path;
    
    if (!filePath) {
        return res.status(400).json({ message: 'No file uploaded' });
    }

    const wards = [];
    let errors = [];
    let successCount = 0;
    let skipCount = 0;

    try {
        // Read and parse CSV file
        await new Promise((resolve, reject) => {
            fs.createReadStream(filePath)
                .pipe(csv({
                    headers: ['IEBC_WARDS', 'COUNT', 'FIRST_PROV', 'FIRST_DIST', 'FIRST_DIVI', 'PCODE', 'STATUS', 'NO', 'SHAPE_1', 'STATUS_1'],
                    skipEmptyLines: true,
                    skipLinesWithError: true
                }))
                .on('data', (row) => {
                    // Clean and validate data - map CSV headers to database columns
                    const ward = {
                        iebc_ward_name: row.IEBC_WARDS?.trim() || null,
                        count: row.COUNT ? parseInt(row.COUNT) : null,
                        province: row.FIRST_PROV?.trim() || null,
                        district: row.FIRST_DIST?.trim() || null,
                        division: row.FIRST_DIVI?.trim() || null,
                        pcode: row.PCODE?.trim() || null,
                        status: row.STATUS?.trim() || null,
                        no: row.NO ? parseInt(row.NO) : null,
                        shape_type: row.SHAPE_1?.trim() || null,
                        status_1: row.STATUS_1?.trim() || null
                    };

                    if (ward.iebc_ward_name) {
                        ward.subcounty = resolveKenyaWardSubcounty({
                            iebcWardName: ward.iebc_ward_name,
                            division: ward.division,
                            county: ward.county,
                            district: ward.district,
                            subcounty: null,
                        });
                        wards.push(ward);
                    }
                })
                .on('end', resolve)
                .on('error', reject);
        });

        if (wards.length === 0) {
            // Clean up uploaded file
            fs.unlinkSync(filePath);
            return res.status(400).json({ message: 'No valid wards found in CSV file' });
        }

        const hasSubcountyColImport = await getKenyaWardsSubcountyColumnExists();

        // Import wards in batches
        const batchSize = 100;
        for (let i = 0; i < wards.length; i += batchSize) {
            const batch = wards.slice(i, i + batchSize);
            
            for (const ward of batch) {
                try {
                    // Check if ward with same pcode already exists
                    if (ward.pcode) {
                        const existing = await pool.query(
                            'SELECT id FROM kenya_wards WHERE pcode = $1 AND voided = false',
                            [ward.pcode]
                        );
                        if (existing.rows.length > 0) {
                            skipCount++;
                            continue;
                        }
                    }

                    // Insert ward
                    if (hasSubcountyColImport) {
                        await pool.query(
                            `INSERT INTO kenya_wards (
                                iebc_ward_name, count, province, district, division, 
                                pcode, status, no, shape_type, status_1, subcounty
                            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                            ON CONFLICT (pcode) DO NOTHING`,
                            [
                                ward.iebc_ward_name, ward.count, ward.province, ward.district, ward.division,
                                ward.pcode, ward.status, ward.no, ward.shape_type, ward.status_1,
                                ward.subcounty,
                            ]
                        );
                    } else {
                        await pool.query(
                            `INSERT INTO kenya_wards (
                                iebc_ward_name, count, province, district, division, 
                                pcode, status, no, shape_type, status_1
                            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                            ON CONFLICT (pcode) DO NOTHING`,
                            [
                                ward.iebc_ward_name, ward.count, ward.province, ward.district, ward.division,
                                ward.pcode, ward.status, ward.no, ward.shape_type, ward.status_1,
                            ]
                        );
                    }
                    successCount++;
                } catch (error) {
                    errors.push({
                        ward: ward.iebc_ward_name,
                        error: error.message
                    });
                }
            }
        }

        // Clean up uploaded file
        fs.unlinkSync(filePath);

        res.status(200).json({
            message: 'Import completed',
            summary: {
                total: wards.length,
                success: successCount,
                skipped: skipCount,
                errors: errors.length
            },
            errors: errors.slice(0, 10) // Return first 10 errors
        });
    } catch (error) {
        // Clean up uploaded file on error
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
        console.error('Error importing wards:', error);
        res.status(500).json({ message: 'Error importing wards', error: error.message });
    }
});

/**
 * @route POST /api/kenya-wards/import-from-path
 * @description Import wards from a file path (for server-side imports)
 */
router.post('/import-from-path', async (req, res) => {
    // If csv-parser is not available, fail fast with a clear message
    if (!csv) {
        return res.status(500).json({
            message: 'CSV import is not available on this server. Please install csv-parser and rebuild the API container.'
        });
    }

    const { filePath } = req.body;

    if (!filePath) {
        return res.status(400).json({ message: 'File path is required' });
    }

    if (!fs.existsSync(filePath)) {
        return res.status(400).json({ message: 'File not found' });
    }

    const wards = [];
    let errors = [];
    let successCount = 0;
    let skipCount = 0;

    try {
        // Read and parse CSV file
        await new Promise((resolve, reject) => {
            fs.createReadStream(filePath)
                .pipe(csv({
                    headers: ['IEBC_WARDS', 'COUNT', 'FIRST_PROV', 'FIRST_DIST', 'FIRST_DIVI', 'PCODE', 'STATUS', 'NO', 'SHAPE_1', 'STATUS_1'],
                    skipEmptyLines: true,
                    skipLinesWithError: true
                }))
                .on('data', (row) => {
                    // Clean and validate data - map CSV headers to database columns
                    const ward = {
                        iebc_ward_name: row.IEBC_WARDS?.trim() || null,
                        count: row.COUNT ? parseInt(row.COUNT) : null,
                        province: row.FIRST_PROV?.trim() || null,
                        district: row.FIRST_DIST?.trim() || null,
                        division: row.FIRST_DIVI?.trim() || null,
                        pcode: row.PCODE?.trim() || null,
                        status: row.STATUS?.trim() || null,
                        no: row.NO ? parseInt(row.NO) : null,
                        shape_type: row.SHAPE_1?.trim() || null,
                        status_1: row.STATUS_1?.trim() || null
                    };

                    if (ward.iebc_ward_name) {
                        ward.subcounty = resolveKenyaWardSubcounty({
                            iebcWardName: ward.iebc_ward_name,
                            division: ward.division,
                            county: ward.county,
                            district: ward.district,
                            subcounty: null,
                        });
                        wards.push(ward);
                    }
                })
                .on('end', resolve)
                .on('error', reject);
        });

        if (wards.length === 0) {
            return res.status(400).json({ message: 'No valid wards found in CSV file' });
        }

        const hasSubcountyColPathImport = await getKenyaWardsSubcountyColumnExists();

        // Import wards in batches
        const batchSize = 100;
        for (let i = 0; i < wards.length; i += batchSize) {
            const batch = wards.slice(i, i + batchSize);
            
            for (const ward of batch) {
                try {
                    if (ward.pcode) {
                        const existing = await pool.query(
                            'SELECT id FROM kenya_wards WHERE pcode = $1 AND voided = false',
                            [ward.pcode]
                        );
                        if (existing.rows.length > 0) {
                            skipCount++;
                            continue;
                        }
                    }

                    if (hasSubcountyColPathImport) {
                        await pool.query(
                            `INSERT INTO kenya_wards (
                                iebc_ward_name, count, province, district, division, 
                                pcode, status, no, shape_type, status_1, subcounty
                            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                            ON CONFLICT (pcode) DO NOTHING`,
                            [
                                ward.iebc_ward_name, ward.count, ward.province, ward.district, ward.division,
                                ward.pcode, ward.status, ward.no, ward.shape_type, ward.status_1,
                                ward.subcounty,
                            ]
                        );
                    } else {
                        await pool.query(
                            `INSERT INTO kenya_wards (
                                iebc_ward_name, count, province, district, division, 
                                pcode, status, no, shape_type, status_1
                            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                            ON CONFLICT (pcode) DO NOTHING`,
                            [
                                ward.iebc_ward_name, ward.count, ward.province, ward.district, ward.division,
                                ward.pcode, ward.status, ward.no, ward.shape_type, ward.status_1,
                            ]
                        );
                    }
                    successCount++;
                } catch (error) {
                    errors.push({
                        ward: ward.iebc_ward_name,
                        error: error.message
                    });
                }
            }
        }

        res.status(200).json({
            message: 'Import completed',
            summary: {
                total: wards.length,
                success: successCount,
                skipped: skipCount,
                errors: errors.length
            },
            errors: errors.slice(0, 10)
        });
    } catch (error) {
        console.error('Error importing wards:', error);
        res.status(500).json({ message: 'Error importing wards', error: error.message });
    }
});

module.exports = router;
