const express = require('express');
const pool = require('../config/db');

const router = express.Router();

const DEFAULT_COUNTY_SCOPE = process.env.WARDS_COUNTY_SCOPE !== undefined
  ? String(process.env.WARDS_COUNTY_SCOPE || '').trim()
  : (process.env.DEFAULT_PROJECT_COUNTY || 'Machakos');

function clean(value) {
  return String(value ?? '').trim();
}

function normKeyPart(value) {
  return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function normalizedKey(row) {
  return [row.subcounty, row.ward, row.sublocation, row.village].map(normKeyPart).join('|');
}

function normSql(expr) {
  return `regexp_replace(lower(trim(COALESCE(${expr}, ''))), '[^a-z0-9]+', '', 'g')`;
}

async function catalogExists() {
  const result = await pool.query(`SELECT to_regclass('public.machakos_sublocation_villages') AS table_name`);
  return Boolean(result.rows?.[0]?.table_name);
}

function addCountyScope(where, params, queryCounty) {
  const county = DEFAULT_COUNTY_SCOPE && DEFAULT_COUNTY_SCOPE.toLowerCase() !== 'all'
    ? DEFAULT_COUNTY_SCOPE
    : clean(queryCounty);
  if (!county) return;
  params.push(`%${county}%`);
  where.push(`county ILIKE $${params.length}`);
}

function addNormFilter(where, params, column, value) {
  const text = clean(value);
  if (!text) return;
  params.push(text);
  where.push(`${normSql(column)} = ${normSql(`$${params.length}`)}`);
}

function buildCatalogPayload(body = {}) {
  const payload = {
    county: clean(body.county) || (DEFAULT_COUNTY_SCOPE && DEFAULT_COUNTY_SCOPE.toLowerCase() !== 'all' ? DEFAULT_COUNTY_SCOPE : 'Machakos'),
    subcounty: clean(body.subcounty),
    ward: clean(body.ward),
    sublocation: clean(body.sublocation),
    village: clean(body.village),
  };
  payload.normalizedKey = normalizedKey(payload);
  return payload;
}

function validateCatalogPayload(payload) {
  const errors = {};
  if (!payload.subcounty) errors.subcounty = 'Sub-county is required.';
  if (!payload.ward) errors.ward = 'Ward is required.';
  if (!payload.sublocation) errors.sublocation = 'Sublocation is required.';
  if (!payload.village) errors.village = 'Village is required.';
  return errors;
}

async function cascadeProjectLocations(client, oldRow, nextRow) {
  const result = await client.query(
    `
    UPDATE projects
    SET location = COALESCE(location, '{}'::jsonb) || jsonb_build_object(
      'county', $5,
      'subcounty', $6,
      'ward', $7,
      'sublocation', $8,
      'village', $9
    ),
    updated_at = CURRENT_TIMESTAMP
    WHERE COALESCE(voided, false) = false
      AND ${normSql("COALESCE(NULLIF(TRIM(location->>'subcounty'), ''), NULLIF(TRIM(location->>'constituency'), ''))")} = ${normSql('$1')}
      AND ${normSql("location->>'ward'")} = ${normSql('$2')}
      AND ${normSql("location->>'sublocation'")} = ${normSql('$3')}
      AND ${normSql("location->>'village'")} = ${normSql('$4')}
    `,
    [
      oldRow.subcounty,
      oldRow.ward,
      oldRow.sublocation,
      oldRow.village,
      nextRow.county,
      nextRow.subcounty,
      nextRow.ward,
      nextRow.sublocation,
      nextRow.village,
    ]
  );
  return result.rowCount || 0;
}

async function distinctValues(req, res, options) {
  try {
    if (!(await catalogExists())) {
      return res.status(200).json({ data: [], message: 'machakos_sublocation_villages table is not available. Run the sublocation/village migration and import script.' });
    }
    const params = [];
    const where = ['COALESCE(voided, false) = false'];
    addCountyScope(where, params, req.query.county);
    (options.parentFilters || []).forEach(([column, key]) => addNormFilter(where, params, column, req.query[key]));

    const result = await pool.query(
      `
      SELECT DISTINCT NULLIF(TRIM(${options.column}), '') AS name
      FROM machakos_sublocation_villages
      WHERE ${where.join(' AND ')}
        AND NULLIF(TRIM(${options.column}), '') IS NOT NULL
      ORDER BY name ASC
      `,
      params
    );
    return res.status(200).json({ data: (result.rows || []).map((row) => row.name).filter(Boolean) });
  } catch (error) {
    console.error(`Error fetching geography ${options.label}:`, error);
    return res.status(500).json({ message: `Error fetching ${options.label}`, error: error.message });
  }
}

router.get('/subcounties', (req, res) => distinctValues(req, res, {
  label: 'sub-counties',
  column: 'subcounty',
}));

router.get('/wards', (req, res) => distinctValues(req, res, {
  label: 'wards',
  column: 'ward',
  parentFilters: [['subcounty', 'subcounty']],
}));

router.get('/sublocations', (req, res) => distinctValues(req, res, {
  label: 'sublocations',
  column: 'sublocation',
  parentFilters: [['subcounty', 'subcounty'], ['ward', 'ward']],
}));

router.get('/villages', (req, res) => distinctValues(req, res, {
  label: 'villages',
  column: 'village',
  parentFilters: [['subcounty', 'subcounty'], ['ward', 'ward'], ['sublocation', 'sublocation']],
}));

router.get('/hierarchy', async (req, res) => {
  try {
    if (!(await catalogExists())) {
      return res.status(200).json({ data: [], message: 'machakos_sublocation_villages table is not available. Run the sublocation/village migration and import script.' });
    }
    const params = [];
    const where = ['COALESCE(voided, false) = false'];
    addCountyScope(where, params, req.query.county);
    addNormFilter(where, params, 'subcounty', req.query.subcounty);
    addNormFilter(where, params, 'ward', req.query.ward);
    addNormFilter(where, params, 'sublocation', req.query.sublocation);
    addNormFilter(where, params, 'village', req.query.village);

    const result = await pool.query(
      `
      SELECT id, county, subcounty, ward, sublocation, village
      FROM machakos_sublocation_villages
      WHERE ${where.join(' AND ')}
      ORDER BY subcounty ASC, ward ASC, sublocation ASC, village ASC
      LIMIT 5000
      `,
      params
    );
    return res.status(200).json({ data: result.rows || [] });
  } catch (error) {
    console.error('Error fetching geography hierarchy:', error);
    return res.status(500).json({ message: 'Error fetching geography hierarchy', error: error.message });
  }
});

router.get('/catalog', async (req, res) => {
  try {
    if (!(await catalogExists())) {
      return res.status(200).json({
        data: [],
        pagination: { page: 1, limit: 50, total: 0, totalPages: 0 },
        message: 'machakos_sublocation_villages table is not available. Run the sublocation/village migration and import script.',
      });
    }

    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 500);
    const offset = (page - 1) * limit;
    const params = [];
    const where = ['COALESCE(voided, false) = false'];
    addCountyScope(where, params, req.query.county);
    addNormFilter(where, params, 'subcounty', req.query.subcounty);
    addNormFilter(where, params, 'ward', req.query.ward);
    addNormFilter(where, params, 'sublocation', req.query.sublocation);
    addNormFilter(where, params, 'village', req.query.village);

    const search = clean(req.query.search);
    if (search) {
      params.push(`%${search}%`);
      const p = `$${params.length}`;
      where.push(`(
        subcounty ILIKE ${p}
        OR ward ILIKE ${p}
        OR sublocation ILIKE ${p}
        OR village ILIKE ${p}
      )`);
    }

    const whereSql = where.join(' AND ');
    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total FROM machakos_sublocation_villages WHERE ${whereSql}`,
      params
    );
    params.push(limit, offset);
    const result = await pool.query(
      `
      SELECT id, county, subcounty, ward, sublocation, village, source_row_no, normalized_key, created_at, updated_at
      FROM machakos_sublocation_villages
      WHERE ${whereSql}
      ORDER BY subcounty ASC, ward ASC, sublocation ASC, village ASC
      LIMIT $${params.length - 1} OFFSET $${params.length}
      `,
      params
    );
    const total = countResult.rows?.[0]?.total || 0;
    return res.status(200).json({
      data: result.rows || [],
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Error fetching geography catalog:', error);
    return res.status(500).json({ message: 'Error fetching geography catalog', error: error.message });
  }
});

router.post('/catalog', async (req, res) => {
  const payload = buildCatalogPayload(req.body);
  const errors = validateCatalogPayload(payload);
  if (Object.keys(errors).length) {
    return res.status(400).json({ message: 'Please correct the highlighted fields.', errors });
  }

  try {
    if (!(await catalogExists())) {
      return res.status(400).json({ message: 'machakos_sublocation_villages table is not available. Run the migration first.' });
    }

    const duplicate = await pool.query(
      `SELECT id FROM machakos_sublocation_villages WHERE normalized_key = $1 AND COALESCE(voided, false) = false LIMIT 1`,
      [payload.normalizedKey]
    );
    if (duplicate.rows?.length) {
      return res.status(409).json({ message: 'This sublocation/village path already exists.' });
    }

    const result = await pool.query(
      `
      INSERT INTO machakos_sublocation_villages (
        county, subcounty, ward, sublocation, village, normalized_key, voided, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, false, CURRENT_TIMESTAMP)
      RETURNING id, county, subcounty, ward, sublocation, village, source_row_no, normalized_key, created_at, updated_at
      `,
      [payload.county, payload.subcounty, payload.ward, payload.sublocation, payload.village, payload.normalizedKey]
    );
    return res.status(201).json({ data: result.rows[0], message: 'Sublocation/village created successfully.' });
  } catch (error) {
    console.error('Error creating geography catalog row:', error);
    return res.status(500).json({ message: 'Error creating sublocation/village', error: error.message });
  }
});

router.put('/catalog/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid catalog row id.' });

  const payload = buildCatalogPayload(req.body);
  const errors = validateCatalogPayload(payload);
  if (Object.keys(errors).length) {
    return res.status(400).json({ message: 'Please correct the highlighted fields.', errors });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const current = await client.query(
      `SELECT * FROM machakos_sublocation_villages WHERE id = $1 AND COALESCE(voided, false) = false FOR UPDATE`,
      [id]
    );
    if (!current.rows?.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Sublocation/village row not found.' });
    }

    const duplicate = await client.query(
      `SELECT id FROM machakos_sublocation_villages WHERE id <> $1 AND normalized_key = $2 AND COALESCE(voided, false) = false LIMIT 1`,
      [id, payload.normalizedKey]
    );
    if (duplicate.rows?.length) {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'This sublocation/village path already exists.' });
    }

    const result = await client.query(
      `
      UPDATE machakos_sublocation_villages
      SET county = $2,
          subcounty = $3,
          ward = $4,
          sublocation = $5,
          village = $6,
          normalized_key = $7,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING id, county, subcounty, ward, sublocation, village, source_row_no, normalized_key, created_at, updated_at
      `,
      [id, payload.county, payload.subcounty, payload.ward, payload.sublocation, payload.village, payload.normalizedKey]
    );

    let projectsUpdated = 0;
    if (req.body?.cascadeProjectLocations === true) {
      projectsUpdated = await cascadeProjectLocations(client, current.rows[0], payload);
    }

    await client.query('COMMIT');
    return res.status(200).json({
      data: result.rows[0],
      cascade: { projectsUpdated },
      message: 'Sublocation/village updated successfully.',
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error updating geography catalog row:', error);
    return res.status(500).json({ message: 'Error updating sublocation/village', error: error.message });
  } finally {
    client.release();
  }
});

router.delete('/catalog/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid catalog row id.' });

  try {
    const result = await pool.query(
      `
      UPDATE machakos_sublocation_villages
      SET voided = true, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND COALESCE(voided, false) = false
      RETURNING id
      `,
      [id]
    );
    if (!result.rows?.length) return res.status(404).json({ message: 'Sublocation/village row not found.' });
    return res.status(200).json({ message: 'Sublocation/village deleted successfully.' });
  } catch (error) {
    console.error('Error deleting geography catalog row:', error);
    return res.status(500).json({ message: 'Error deleting sublocation/village', error: error.message });
  }
});

module.exports = router;
