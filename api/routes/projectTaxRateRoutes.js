const express = require('express');
const pool = require('../config/db');

const router = express.Router();

const DB_TYPE = process.env.DB_TYPE || 'mysql';
const isPostgres = DB_TYPE === 'postgresql';

const TAX_TYPES = ['vat', 'withholding_tax', 'retention'];

const runSafeDdl = async (sql) => {
  try {
    await pool.query(sql);
  } catch (err) {
    const code = String(err?.code || '');
    if (code === '42P07' || code === '42710' || code === '23505' || code === '42501') {
      return;
    }
    throw err;
  }
};

const ensureTable = async () => {
  if (isPostgres) {
    await runSafeDdl(`
      CREATE TABLE IF NOT EXISTS project_tax_rates (
        id BIGSERIAL PRIMARY KEY,
        tax_type TEXT NOT NULL,
        rate_percent NUMERIC(10, 4) NOT NULL,
        withholding_rate NUMERIC(10, 4) NOT NULL DEFAULT 0,
        effective_from DATE NOT NULL,
        effective_to DATE NULL,
        notes TEXT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        voided BOOLEAN NOT NULL DEFAULT FALSE
      )
    `);
    await runSafeDdl(`CREATE INDEX IF NOT EXISTS idx_project_tax_rates_type ON project_tax_rates (tax_type)`);
    await runSafeDdl(`CREATE INDEX IF NOT EXISTS idx_project_tax_rates_dates ON project_tax_rates (effective_from, effective_to)`);
    await runSafeDdl(`ALTER TABLE project_tax_rates ADD COLUMN IF NOT EXISTS withholding_rate NUMERIC(10, 4) NOT NULL DEFAULT 0`);
    return;
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS project_tax_rates (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      tax_type VARCHAR(50) NOT NULL,
      rate_percent DECIMAL(10, 4) NOT NULL,
      withholding_rate DECIMAL(10, 4) NOT NULL DEFAULT 0,
      effective_from DATE NOT NULL,
      effective_to DATE NULL,
      notes TEXT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      voided TINYINT(1) NOT NULL DEFAULT 0
    )
  `);

  try {
    await pool.query('ALTER TABLE project_tax_rates ADD COLUMN withholding_rate DECIMAL(10, 4) NOT NULL DEFAULT 0');
  } catch (err) {
    const code = String(err?.code || '');
    const errno = Number(err?.errno || 0);
    // Ignore duplicate-column errors during rolling upgrades.
    if (code !== 'ER_DUP_FIELDNAME' && errno !== 1060) {
      throw err;
    }
  }
};

const normalizeType = (value) => String(value || '').trim().toLowerCase();
const normalizeRate = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

const validatePayload = (body, { requireAll = true } = {}) => {
  const taxType = normalizeType(body.taxType);
  const ratePercent = normalizeRate(body.ratePercent);
  const withholdingRate = body.withholdingRate === undefined ? 0 : normalizeRate(body.withholdingRate);
  const effectiveFrom = body.effectiveFrom ? String(body.effectiveFrom) : '';
  const effectiveTo = body.effectiveTo ? String(body.effectiveTo) : null;
  const notes = body.notes ? String(body.notes) : null;

  if (requireAll) {
    if (!TAX_TYPES.includes(taxType)) return { error: 'Invalid taxType.' };
    if (ratePercent === null || ratePercent < 0) return { error: 'ratePercent must be a non-negative number.' };
    if (withholdingRate === null || withholdingRate < 0) return { error: 'withholdingRate must be a non-negative number.' };
    if (!effectiveFrom) return { error: 'effectiveFrom is required.' };
  } else {
    if (taxType && !TAX_TYPES.includes(taxType)) return { error: 'Invalid taxType.' };
    if (body.ratePercent !== undefined && (ratePercent === null || ratePercent < 0)) {
      return { error: 'ratePercent must be a non-negative number.' };
    }
    if (body.withholdingRate !== undefined && (withholdingRate === null || withholdingRate < 0)) {
      return { error: 'withholdingRate must be a non-negative number.' };
    }
  }

  if (effectiveFrom && effectiveTo && new Date(effectiveTo) < new Date(effectiveFrom)) {
    return { error: 'effectiveTo cannot be earlier than effectiveFrom.' };
  }

  return {
    taxType,
    ratePercent,
    withholdingRate,
    effectiveFrom,
    effectiveTo,
    notes,
  };
};

router.get('/', async (req, res) => {
  try {
    await ensureTable();
    const { taxType } = req.query;
    const typeFilter = normalizeType(taxType);
    if (isPostgres) {
      const values = [];
      let where = 'WHERE COALESCE(voided, false) = false';
      if (typeFilter) {
        values.push(typeFilter);
        where += ` AND tax_type = $${values.length}`;
      }
      const result = await pool.query(
        `SELECT * FROM project_tax_rates ${where} ORDER BY tax_type ASC, effective_from DESC, id DESC`,
        values
      );
      return res.status(200).json(result.rows || []);
    }
    const values = [];
    let where = 'WHERE (voided IS NULL OR voided = 0)';
    if (typeFilter) {
      where += ' AND tax_type = ?';
      values.push(typeFilter);
    }
    const [rows] = await pool.query(
      `SELECT * FROM project_tax_rates ${where} ORDER BY tax_type ASC, effective_from DESC, id DESC`,
      values
    );
    return res.status(200).json(rows || []);
  } catch (error) {
    console.error('Error fetching tax rates:', error);
    return res.status(500).json({ message: 'Failed to fetch tax rates.' });
  }
});

router.get('/active', async (req, res) => {
  try {
    await ensureTable();
    const onDate = req.query.onDate ? String(req.query.onDate) : new Date().toISOString().slice(0, 10);
    if (isPostgres) {
      const result = await pool.query(
        `
          SELECT DISTINCT ON (tax_type)
            id, tax_type, rate_percent, withholding_rate, effective_from, effective_to, notes
          FROM project_tax_rates
          WHERE COALESCE(voided, false) = false
            AND effective_from <= $1::date
            AND (effective_to IS NULL OR effective_to >= $1::date)
          ORDER BY tax_type, effective_from DESC, id DESC
        `,
        [onDate]
      );
      return res.status(200).json(result.rows || []);
    }
    const [rows] = await pool.query(
      `
        SELECT r1.*
        FROM project_tax_rates r1
        INNER JOIN (
          SELECT tax_type, MAX(effective_from) AS max_effective_from
          FROM project_tax_rates
          WHERE (voided IS NULL OR voided = 0)
            AND effective_from <= ?
            AND (effective_to IS NULL OR effective_to >= ?)
          GROUP BY tax_type
        ) latest ON latest.tax_type = r1.tax_type AND latest.max_effective_from = r1.effective_from
        WHERE (r1.voided IS NULL OR r1.voided = 0)
      `,
      [onDate, onDate]
    );
    return res.status(200).json(rows || []);
  } catch (error) {
    console.error('Error fetching active tax rates:', error);
    return res.status(500).json({ message: 'Failed to fetch active tax rates.' });
  }
});

router.post('/', async (req, res) => {
  try {
    await ensureTable();
    const parsed = validatePayload(req.body, { requireAll: true });
    if (parsed.error) return res.status(400).json({ message: parsed.error });

    const { taxType, ratePercent, withholdingRate, effectiveFrom, effectiveTo, notes } = parsed;
    if (isPostgres) {
      const result = await pool.query(
        `
          INSERT INTO project_tax_rates (tax_type, rate_percent, withholding_rate, effective_from, effective_to, notes)
          VALUES ($1, $2, $3, $4::date, $5::date, $6)
          RETURNING *
        `,
        [taxType, ratePercent, withholdingRate, effectiveFrom, effectiveTo, notes]
      );
      return res.status(201).json(result.rows?.[0] || null);
    }
    const [insertRes] = await pool.query(
      `
        INSERT INTO project_tax_rates (tax_type, rate_percent, withholding_rate, effective_from, effective_to, notes)
        VALUES (?, ?, ?, ?, ?, ?)
      `,
      [taxType, ratePercent, withholdingRate, effectiveFrom, effectiveTo, notes]
    );
    const [rows] = await pool.query('SELECT * FROM project_tax_rates WHERE id = ?', [insertRes.insertId]);
    return res.status(201).json(rows?.[0] || null);
  } catch (error) {
    console.error('Error creating tax rate:', error);
    return res.status(500).json({ message: 'Failed to create tax rate.' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    await ensureTable();
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid tax rate id.' });

    const parsed = validatePayload(req.body, { requireAll: false });
    if (parsed.error) return res.status(400).json({ message: parsed.error });

    const updates = [];
    const values = [];
    if (parsed.taxType) {
      updates.push('tax_type = ?');
      values.push(parsed.taxType);
    }
    if (parsed.ratePercent !== null && req.body.ratePercent !== undefined) {
      updates.push('rate_percent = ?');
      values.push(parsed.ratePercent);
    }
    if (parsed.withholdingRate !== null && req.body.withholdingRate !== undefined) {
      updates.push('withholding_rate = ?');
      values.push(parsed.withholdingRate);
    }
    if (parsed.effectiveFrom) {
      updates.push('effective_from = ?');
      values.push(parsed.effectiveFrom);
    }
    if (req.body.effectiveTo !== undefined) {
      updates.push('effective_to = ?');
      values.push(parsed.effectiveTo);
    }
    if (req.body.notes !== undefined) {
      updates.push('notes = ?');
      values.push(parsed.notes);
    }

    if (updates.length === 0) return res.status(400).json({ message: 'No fields provided for update.' });

    if (isPostgres) {
      const pgUpdates = [];
      const pgValues = [];
      let index = 1;
      if (parsed.taxType) { pgUpdates.push(`tax_type = $${index++}`); pgValues.push(parsed.taxType); }
      if (parsed.ratePercent !== null && req.body.ratePercent !== undefined) { pgUpdates.push(`rate_percent = $${index++}`); pgValues.push(parsed.ratePercent); }
      if (parsed.withholdingRate !== null && req.body.withholdingRate !== undefined) { pgUpdates.push(`withholding_rate = $${index++}`); pgValues.push(parsed.withholdingRate); }
      if (parsed.effectiveFrom) { pgUpdates.push(`effective_from = $${index++}::date`); pgValues.push(parsed.effectiveFrom); }
      if (req.body.effectiveTo !== undefined) { pgUpdates.push(`effective_to = $${index++}::date`); pgValues.push(parsed.effectiveTo); }
      if (req.body.notes !== undefined) { pgUpdates.push(`notes = $${index++}`); pgValues.push(parsed.notes); }
      pgUpdates.push('updated_at = CURRENT_TIMESTAMP');
      pgValues.push(id);
      const result = await pool.query(
        `UPDATE project_tax_rates SET ${pgUpdates.join(', ')} WHERE id = $${index} RETURNING *`,
        pgValues
      );
      if (!result.rows?.length) return res.status(404).json({ message: 'Tax rate not found.' });
      return res.status(200).json(result.rows[0]);
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);
    const [updateRes] = await pool.query(`UPDATE project_tax_rates SET ${updates.join(', ')} WHERE id = ?`, values);
    if (!updateRes.affectedRows) return res.status(404).json({ message: 'Tax rate not found.' });
    const [rows] = await pool.query('SELECT * FROM project_tax_rates WHERE id = ?', [id]);
    return res.status(200).json(rows?.[0] || null);
  } catch (error) {
    console.error('Error updating tax rate:', error);
    return res.status(500).json({ message: 'Failed to update tax rate.' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await ensureTable();
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid tax rate id.' });

    if (isPostgres) {
      const result = await pool.query(
        'UPDATE project_tax_rates SET voided = true, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
        [id]
      );
      if (!(result.rowCount > 0)) return res.status(404).json({ message: 'Tax rate not found.' });
      return res.status(204).send();
    }
    const [result] = await pool.query(
      'UPDATE project_tax_rates SET voided = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [id]
    );
    if (!result.affectedRows) return res.status(404).json({ message: 'Tax rate not found.' });
    return res.status(204).send();
  } catch (error) {
    console.error('Error deleting tax rate:', error);
    return res.status(500).json({ message: 'Failed to delete tax rate.' });
  }
});

module.exports = router;
