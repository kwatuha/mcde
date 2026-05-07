const express = require('express');
const pool = require('../config/db');

const router = express.Router();
const DB_TYPE = process.env.DB_TYPE || 'postgresql';
const isPostgres = DB_TYPE === 'postgresql';

async function ensurePartnersTable() {
  if (isPostgres) {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS project_partners (
        partner_id SERIAL PRIMARY KEY,
        partner_name TEXT NOT NULL,
        support_types JSONB NOT NULL DEFAULT '[]'::jsonb,
        organization_type TEXT NULL,
        contact_person TEXT NULL,
        email TEXT NULL,
        phone TEXT NULL,
        notes TEXT NULL,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_by INTEGER NULL,
        created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        voided BOOLEAN NOT NULL DEFAULT FALSE
      )
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_project_partners_name
      ON project_partners (LOWER(partner_name))
      WHERE COALESCE(voided, false) = false
    `);
  } else {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS project_partners (
        partner_id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        partner_name VARCHAR(512) NOT NULL,
        support_types JSON NOT NULL,
        organization_type VARCHAR(255) NULL,
        contact_person VARCHAR(255) NULL,
        email VARCHAR(255) NULL,
        phone VARCHAR(128) NULL,
        notes TEXT NULL,
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        created_by BIGINT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        voided TINYINT(1) NOT NULL DEFAULT 0,
        INDEX idx_project_partners_name (partner_name)
      )
    `);
  }
}

function userIdFromReq(req) {
  return req.user?.id ?? req.user?.userId ?? null;
}

function rowToPartner(row) {
  const supportTypes =
    Array.isArray(row.support_types)
      ? row.support_types
      : typeof row.support_types === 'string'
      ? (() => {
          try {
            const parsed = JSON.parse(row.support_types);
            return Array.isArray(parsed) ? parsed : [];
          } catch {
            return [];
          }
        })()
      : [];
  return {
    partnerId: row.partner_id,
    partnerName: row.partner_name,
    supportTypes,
    organizationType: row.organization_type,
    contactPerson: row.contact_person,
    email: row.email,
    phone: row.phone,
    notes: row.notes,
    isActive: isPostgres ? row.is_active : !!row.is_active,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

router.get('/', async (_req, res) => {
  try {
    await ensurePartnersTable();
    const q = await pool.query(
      isPostgres
        ? `
          SELECT *
          FROM project_partners
          WHERE COALESCE(voided, false) = false
          ORDER BY LOWER(partner_name) ASC, partner_id ASC
          LIMIT 1000
          `
        : `
          SELECT *
          FROM project_partners
          WHERE IFNULL(voided, 0) = 0
          ORDER BY partner_name ASC, partner_id ASC
          LIMIT 1000
          `
    );
    const rows = isPostgres ? q.rows || [] : Array.isArray(q) ? q[0] || [] : q.rows || [];
    return res.json(rows.map(rowToPartner));
  } catch (e) {
    return res.status(500).json({ message: 'Failed to list partners.', details: e.message });
  }
});

router.post('/', async (req, res) => {
  try {
    await ensurePartnersTable();
    const partnerName = String(req.body?.partnerName || '').trim();
    const supportTypes = Array.isArray(req.body?.supportTypes)
      ? req.body.supportTypes.map((x) => String(x || '').trim()).filter(Boolean)
      : [];
    if (!partnerName) return res.status(400).json({ message: 'partnerName is required.' });
    if (isPostgres) {
      const q = await pool.query(
        `
        INSERT INTO project_partners
          (partner_name, support_types, organization_type, contact_person, email, phone, notes, is_active, created_by, created_at, updated_at, voided)
        VALUES ($1, $2::jsonb, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, false)
        RETURNING *
        `,
        [
          partnerName,
          JSON.stringify(supportTypes),
          req.body?.organizationType ? String(req.body.organizationType).trim() : null,
          req.body?.contactPerson ? String(req.body.contactPerson).trim() : null,
          req.body?.email ? String(req.body.email).trim() : null,
          req.body?.phone ? String(req.body.phone).trim() : null,
          req.body?.notes ? String(req.body.notes).trim() : null,
          req.body?.isActive !== undefined ? !!req.body.isActive : true,
          userIdFromReq(req),
        ]
      );
      return res.status(201).json(rowToPartner(q.rows[0]));
    }
    const ins = await pool.query(
      `
      INSERT INTO project_partners
        (partner_name, support_types, organization_type, contact_person, email, phone, notes, is_active, created_by, created_at, updated_at, voided)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0)
      `,
      [
        partnerName,
        JSON.stringify(supportTypes),
        req.body?.organizationType ? String(req.body.organizationType).trim() : null,
        req.body?.contactPerson ? String(req.body.contactPerson).trim() : null,
        req.body?.email ? String(req.body.email).trim() : null,
        req.body?.phone ? String(req.body.phone).trim() : null,
        req.body?.notes ? String(req.body.notes).trim() : null,
        req.body?.isActive !== undefined ? (req.body.isActive ? 1 : 0) : 1,
        userIdFromReq(req),
      ]
    );
    const partnerId = ins.insertId || (Array.isArray(ins) ? ins[0]?.insertId : null);
    const sel = await pool.query(`SELECT * FROM project_partners WHERE partner_id = ?`, [partnerId]);
    const row = Array.isArray(sel) ? sel[0]?.[0] : sel.rows?.[0];
    return res.status(201).json(rowToPartner(row));
  } catch (e) {
    return res.status(500).json({ message: 'Failed to create partner.', details: e.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    await ensurePartnersTable();
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid partner id.' });
    const cur = await pool.query(
      isPostgres
        ? `SELECT * FROM project_partners WHERE partner_id = $1 AND COALESCE(voided, false) = false`
        : `SELECT * FROM project_partners WHERE partner_id = ? AND IFNULL(voided, 0) = 0`,
      [id]
    );
    const existing = isPostgres ? cur.rows?.[0] : Array.isArray(cur) ? cur[0]?.[0] : cur.rows?.[0];
    if (!existing) return res.status(404).json({ message: 'Partner not found.' });

    const partnerName = req.body?.partnerName != null ? String(req.body.partnerName).trim() : existing.partner_name;
    if (!partnerName) return res.status(400).json({ message: 'partnerName is required.' });
    const supportTypes =
      req.body?.supportTypes !== undefined
        ? (Array.isArray(req.body.supportTypes) ? req.body.supportTypes : [])
            .map((x) => String(x || '').trim())
            .filter(Boolean)
        : Array.isArray(existing.support_types)
        ? existing.support_types
        : [];

    if (isPostgres) {
      const q = await pool.query(
        `
        UPDATE project_partners
        SET partner_name = $1,
            support_types = $2::jsonb,
            organization_type = $3,
            contact_person = $4,
            email = $5,
            phone = $6,
            notes = $7,
            is_active = $8,
            updated_at = CURRENT_TIMESTAMP
        WHERE partner_id = $9 AND COALESCE(voided, false) = false
        RETURNING *
        `,
        [
          partnerName,
          JSON.stringify(supportTypes),
          req.body?.organizationType !== undefined ? (req.body.organizationType ? String(req.body.organizationType).trim() : null) : existing.organization_type,
          req.body?.contactPerson !== undefined ? (req.body.contactPerson ? String(req.body.contactPerson).trim() : null) : existing.contact_person,
          req.body?.email !== undefined ? (req.body.email ? String(req.body.email).trim() : null) : existing.email,
          req.body?.phone !== undefined ? (req.body.phone ? String(req.body.phone).trim() : null) : existing.phone,
          req.body?.notes !== undefined ? (req.body.notes ? String(req.body.notes).trim() : null) : existing.notes,
          req.body?.isActive !== undefined ? !!req.body.isActive : existing.is_active,
          id,
        ]
      );
      return res.json(rowToPartner(q.rows[0]));
    }
    await pool.query(
      `
      UPDATE project_partners
      SET partner_name = ?,
          support_types = ?,
          organization_type = ?,
          contact_person = ?,
          email = ?,
          phone = ?,
          notes = ?,
          is_active = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE partner_id = ? AND IFNULL(voided, 0) = 0
      `,
      [
        partnerName,
        JSON.stringify(supportTypes),
        req.body?.organizationType !== undefined ? (req.body.organizationType ? String(req.body.organizationType).trim() : null) : existing.organization_type,
        req.body?.contactPerson !== undefined ? (req.body.contactPerson ? String(req.body.contactPerson).trim() : null) : existing.contact_person,
        req.body?.email !== undefined ? (req.body.email ? String(req.body.email).trim() : null) : existing.email,
        req.body?.phone !== undefined ? (req.body.phone ? String(req.body.phone).trim() : null) : existing.phone,
        req.body?.notes !== undefined ? (req.body.notes ? String(req.body.notes).trim() : null) : existing.notes,
        req.body?.isActive !== undefined ? (req.body.isActive ? 1 : 0) : existing.is_active ? 1 : 0,
        id,
      ]
    );
    const sel = await pool.query(`SELECT * FROM project_partners WHERE partner_id = ?`, [id]);
    const row = Array.isArray(sel) ? sel[0]?.[0] : sel.rows?.[0];
    return res.json(rowToPartner(row));
  } catch (e) {
    return res.status(500).json({ message: 'Failed to update partner.', details: e.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await ensurePartnersTable();
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid partner id.' });
    const q = await pool.query(
      isPostgres
        ? `
          UPDATE project_partners
          SET voided = true, updated_at = CURRENT_TIMESTAMP
          WHERE partner_id = $1 AND COALESCE(voided, false) = false
          RETURNING partner_id
          `
        : `
          UPDATE project_partners
          SET voided = 1, updated_at = CURRENT_TIMESTAMP
          WHERE partner_id = ? AND IFNULL(voided, 0) = 0
          `,
      [id]
    );
    const affected = isPostgres ? (q.rows?.length || 0) : q.affectedRows || (Array.isArray(q) ? q[0]?.affectedRows || 0 : 0);
    if (!affected) return res.status(404).json({ message: 'Partner not found.' });
    return res.json({ ok: true, partnerId: id });
  } catch (e) {
    return res.status(500).json({ message: 'Failed to delete partner.', details: e.message });
  }
});

module.exports = router;
