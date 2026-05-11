/**
 * CRUD for ministries (cabinet-level org units).
 * State departments remain in `departments` with ministryId FK.
 */
const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { fetchMinistryDepartmentTree } = require('../utils/ministryDepartmentTree');

const DB_TYPE = process.env.DB_TYPE || 'postgresql';

/**
 * GET /api/ministries
 * Optional ?withDepartments=1 — include departments per ministry (county-filtered when METADATA_ORG_SCOPE=machakos)
 * Optional ?withSections=1 — include directorates (sections) under each department
 */
router.get('/', async (req, res) => {
  const withDeps = req.query.withDepartments === '1' || req.query.withDepartments === 'true';
  const withSections = req.query.withSections === '1' || req.query.withSections === 'true';
  try {
    if (DB_TYPE !== 'postgresql') {
      return res.status(501).json({ message: 'Ministries API requires PostgreSQL' });
    }
    if (!withDeps) {
      const r = await pool.query(
        `SELECT "ministryId", name, alias, voided, "createdAt", "updatedAt", "userId"
         FROM ministries
         WHERE COALESCE(voided, false) = false
         ORDER BY name`
      );
      return res.json(r.rows || []);
    }
    const tree = await fetchMinistryDepartmentTree({ withSections: withSections && withDeps });
    return res.json(tree);
  } catch (e) {
    console.error('GET /ministries', e);
    res.status(500).json({ message: 'Failed to list ministries', error: e.message });
  }
});

/** GET /api/ministries/:ministryId */
router.get('/:ministryId', async (req, res) => {
  const { ministryId } = req.params;
  try {
    const r = await pool.query(
      `SELECT "ministryId", name, alias, voided, "createdAt", "updatedAt", "userId"
       FROM ministries WHERE "ministryId" = $1 AND voided = false`,
      [ministryId]
    );
    if (!r.rows?.length) return res.status(404).json({ message: 'Ministry not found' });
    res.json(r.rows[0]);
  } catch (e) {
    console.error('GET /ministries/:id', e);
    res.status(500).json({ message: 'Failed to load ministry', error: e.message });
  }
});

/** POST /api/ministries */
router.post('/', async (req, res) => {
  const { name, alias } = req.body;
  if (!name || !String(name).trim()) {
    return res.status(400).json({ message: 'name is required' });
  }
  try {
    const userId = req.user?.userId ?? req.user?.id ?? null;
    const r = await pool.query(
      `INSERT INTO ministries (name, alias, voided, "userId")
       VALUES ($1, $2, false, $3)
       RETURNING "ministryId", name, alias, voided, "createdAt", "updatedAt"`,
      [name.trim(), alias?.trim() || null, userId]
    );
    res.status(201).json(r.rows[0]);
  } catch (e) {
    console.error('POST /ministries', e);
    if (e.code === '23505') return res.status(409).json({ message: 'Ministry name already exists' });
    res.status(500).json({ message: 'Failed to create ministry', error: e.message });
  }
});

/** PUT /api/ministries/:ministryId */
router.put('/:ministryId', async (req, res) => {
  const { ministryId } = req.params;
  const { name, alias } = req.body;
  if (name !== undefined && !String(name).trim()) {
    return res.status(400).json({ message: 'name cannot be empty' });
  }
  const sets = [];
  const vals = [];
  if (name !== undefined) {
    vals.push(name.trim());
    sets.push(`name = $${vals.length}`);
  }
  if (alias !== undefined) {
    vals.push(alias?.trim() || null);
    sets.push(`alias = $${vals.length}`);
  }
  if (!sets.length) {
    return res.status(400).json({ message: 'Provide name and/or alias to update' });
  }
  vals.push(ministryId);
  try {
    const r = await pool.query(
      `UPDATE ministries SET ${sets.join(', ')}, "updatedAt" = CURRENT_TIMESTAMP
       WHERE "ministryId" = $${vals.length} AND voided = false
       RETURNING "ministryId", name, alias, voided, "createdAt", "updatedAt"`,
      vals
    );
    if (!r.rows?.length) return res.status(404).json({ message: 'Ministry not found' });
    res.json(r.rows[0]);
  } catch (e) {
    console.error('PUT /ministries', e);
    res.status(500).json({ message: 'Failed to update ministry', error: e.message });
  }
});

/** DELETE /api/ministries/:ministryId — soft delete */
router.delete('/:ministryId', async (req, res) => {
  const { ministryId } = req.params;
  const userId = req.user?.userId || req.user?.id || null;
  try {
    await pool.query(
      `UPDATE ministries SET voided = true, "voidedBy" = $1, "updatedAt" = CURRENT_TIMESTAMP
       WHERE "ministryId" = $2 AND voided = false`,
      [userId, ministryId]
    );
    await pool.query(
      `UPDATE departments SET "ministryId" = NULL WHERE "ministryId" = $1`,
      [ministryId]
    );
    res.json({ message: 'Ministry removed', ministryId: Number(ministryId) });
  } catch (e) {
    console.error('DELETE /ministries', e);
    res.status(500).json({ message: 'Failed to delete ministry', error: e.message });
  }
});

/**
 * POST /api/ministries/:ministryId/departments
 * Create a state department row linked to this ministry.
 */
router.post('/:ministryId/departments', async (req, res) => {
  const { ministryId } = req.params;
  const { name, alias } = req.body;
  if (!name || !String(name).trim()) {
    return res.status(400).json({ message: 'name is required' });
  }
  try {
    const check = await pool.query(
      `SELECT 1 FROM ministries WHERE "ministryId" = $1 AND voided = false`,
      [ministryId]
    );
    if (!check.rows?.length) return res.status(404).json({ message: 'Ministry not found' });

    const dup = await pool.query(
      `SELECT "departmentId" FROM departments WHERE LOWER(name) = LOWER($1) AND (voided IS NULL OR voided = false)`,
      [name.trim()]
    );
    if (dup.rows?.length) {
      return res.status(409).json({ message: 'A department with this name already exists' });
    }

    // Some environments may have slight schema drift on departments (e.g. missing userId column).
    // Build the INSERT dynamically to keep add-state-department working reliably.
    const colRes = await pool.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'departments'
    `);
    const colRows = colRes.rows || [];
    const colSet = new Set(colRows.map((r) => String(r.column_name)));
    const hasUserId = colSet.has('userId');
    const deptIdMeta = colRows.find((r) => String(r.column_name) === 'departmentId');
    const hasDeptIdDefault = !!String(deptIdMeta?.column_default || '').trim();

    const insertCols = ['name', 'alias', '"ministryId"', 'voided'];
    const insertVals = [name.trim(), alias?.trim() || name.trim(), ministryId, false];

    // Some databases have "departmentId" PK without default nextval; set it explicitly in that case.
    if (colSet.has('departmentId') && !hasDeptIdDefault) {
      const nextIdRes = await pool.query(
        `SELECT COALESCE(MAX("departmentId"), 0) + 1 AS "nextId" FROM departments`
      );
      const nextId = Number(nextIdRes.rows?.[0]?.nextId || 1);
      insertCols.unshift('"departmentId"');
      insertVals.unshift(nextId);
    }
    if (hasUserId) {
      insertCols.push('"userId"');
      insertVals.push(req.user?.userId || req.user?.id || null);
    }
    const placeholders = insertVals.map((_, i) => `$${i + 1}`).join(', ');

    let r;
    try {
      r = await pool.query(
        `INSERT INTO departments (${insertCols.join(', ')})
         VALUES (${placeholders})
         RETURNING "departmentId", name, alias, "ministryId"`,
        insertVals
      );
    } catch (retErr) {
      // Fallback for older schemas where RETURNING projected columns may differ.
      const ins = await pool.query(
        `INSERT INTO departments (${insertCols.join(', ')})
         VALUES (${placeholders})
         RETURNING *`,
        insertVals
      );
      r = {
        rows: [{
          departmentId: ins.rows?.[0]?.departmentId ?? ins.rows?.[0]?.departmentid ?? ins.rows?.[0]?.id,
          name: ins.rows?.[0]?.name,
          alias: ins.rows?.[0]?.alias,
          ministryId: ins.rows?.[0]?.ministryId ?? ins.rows?.[0]?.ministryid,
        }],
      };
    }
    res.status(201).json(r.rows?.[0] || null);
  } catch (e) {
    console.error('POST ministry department', e);
    res.status(500).json({
      message: 'Failed to create state department',
      error: e.message,
      code: e.code || null,
    });
  }
});

/**
 * PUT /api/ministries/:ministryId/departments/:departmentId
 * Update state department (name, alias); keeps link to ministry.
 */
router.put('/:ministryId/departments/:departmentId', async (req, res) => {
  const { ministryId, departmentId } = req.params;
  const { name, alias } = req.body;
  if (name !== undefined && !String(name).trim()) {
    return res.status(400).json({ message: 'name cannot be empty' });
  }
  const sets = [];
  const vals = [];
  if (name !== undefined) {
    vals.push(name.trim());
    sets.push(`name = $${vals.length}`);
  }
  if (alias !== undefined) {
    vals.push(alias?.trim() || null);
    sets.push(`alias = $${vals.length}`);
  }
  if (!sets.length) return res.status(400).json({ message: 'Provide name and/or alias' });
  const params = [...vals, departmentId, ministryId];
  const iDept = vals.length + 1;
  const iMin = vals.length + 2;
  try {
    const r = await pool.query(
      `UPDATE departments SET ${sets.join(', ')}, "updatedAt" = CURRENT_TIMESTAMP
       WHERE "departmentId" = $${iDept} AND "ministryId" = $${iMin} AND (voided IS NULL OR voided = false)
       RETURNING "departmentId", name, alias, "ministryId"`,
      params
    );
    if (!r.rows?.length) return res.status(404).json({ message: 'State department not found under this ministry' });
    res.json(r.rows[0]);
  } catch (e) {
    console.error('PUT ministry department', e);
    res.status(500).json({ message: 'Failed to update state department', error: e.message });
  }
});

/**
 * DELETE /api/ministries/:ministryId/departments/:departmentId — soft-delete department row
 */
router.delete('/:ministryId/departments/:departmentId', async (req, res) => {
  const { ministryId, departmentId } = req.params;
  const userId = req.user?.userId || req.user?.id || null;
  try {
    const r = await pool.query(
      `UPDATE departments SET voided = true, "voidedBy" = $1, "updatedAt" = CURRENT_TIMESTAMP
       WHERE "departmentId" = $2 AND "ministryId" = $3 AND (voided IS NULL OR voided = false)
       RETURNING "departmentId"`,
      [userId, departmentId, ministryId]
    );
    if (!r.rows?.length) return res.status(404).json({ message: 'Not found' });
    res.json({ message: 'State department removed', departmentId: Number(departmentId) });
  } catch (e) {
    console.error('DELETE ministry department', e);
    res.status(500).json({ message: 'Failed to delete state department', error: e.message });
  }
});

module.exports = router;
