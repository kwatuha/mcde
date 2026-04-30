const express = require('express');
const pool = require('../config/db');

const router = express.Router();

function isSuperAdmin(req) {
    const role = String(req.user?.roleName || req.user?.role || '').trim().toLowerCase();
    return role === 'super admin';
}

async function ensureFundingTables() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS funding_sources (
            source_id SERIAL PRIMARY KEY,
            source_name TEXT NOT NULL UNIQUE,
            description TEXT NULL,
            active BOOLEAN NOT NULL DEFAULT TRUE,
            created_by INTEGER NULL,
            created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS project_funding_entries (
            entry_id SERIAL PRIMARY KEY,
            project_id INTEGER NOT NULL,
            source_id INTEGER NOT NULL REFERENCES funding_sources(source_id),
            amount NUMERIC(18,2) NOT NULL DEFAULT 0,
            stage TEXT NULL,
            notes TEXT NULL,
            created_by INTEGER NULL,
            created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
            voided BOOLEAN NOT NULL DEFAULT FALSE
        )
    `);
}

router.get('/funding-sources', async (req, res) => {
    try {
        await ensureFundingTables();
        const result = await pool.query(
            `SELECT source_id AS "sourceId", source_name AS "sourceName", description, active, created_at AS "createdAt", updated_at AS "updatedAt"
             FROM funding_sources
             WHERE active = true
             ORDER BY source_name`
        );
        return res.status(200).json(result.rows || []);
    } catch (err) {
        console.error('Error fetching funding sources:', err);
        return res.status(500).json({ error: 'Failed to fetch funding sources.', details: err.message });
    }
});

router.post('/funding-sources', async (req, res) => {
    if (!isSuperAdmin(req)) {
        return res.status(403).json({ error: 'Only Super Admin can add funding sources.' });
    }
    const sourceName = String(req.body?.sourceName || '').trim();
    const description = String(req.body?.description || '').trim();
    if (!sourceName) return res.status(400).json({ error: 'sourceName is required.' });

    try {
        await ensureFundingTables();
        const createdBy = req.user?.id ?? req.user?.userId ?? null;
        const result = await pool.query(
            `INSERT INTO funding_sources (source_name, description, active, created_by, created_at, updated_at)
             VALUES ($1, $2, true, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
             RETURNING source_id AS "sourceId", source_name AS "sourceName", description, active`,
            [sourceName, description || null, createdBy]
        );
        return res.status(201).json(result.rows?.[0]);
    } catch (err) {
        console.error('Error creating funding source:', err);
        if (String(err.code) === '23505') {
            return res.status(400).json({ error: 'Funding source already exists.' });
        }
        return res.status(500).json({ error: 'Failed to create funding source.', details: err.message });
    }
});

router.get('/:projectId/funding-entries', async (req, res) => {
    const projectId = parseInt(String(req.params.projectId), 10);
    if (!Number.isFinite(projectId)) return res.status(400).json({ error: 'Invalid project id.' });
    try {
        await ensureFundingTables();
        const result = await pool.query(
            `SELECT
                pfe.entry_id AS "entryId",
                pfe.project_id AS "projectId",
                pfe.source_id AS "sourceId",
                fs.source_name AS "sourceName",
                pfe.amount,
                pfe.stage,
                pfe.notes,
                pfe.created_at AS "createdAt",
                pfe.updated_at AS "updatedAt"
             FROM project_funding_entries pfe
             JOIN funding_sources fs ON fs.source_id = pfe.source_id
             WHERE pfe.project_id = $1 AND COALESCE(pfe.voided, false) = false
             ORDER BY pfe.entry_id DESC`,
            [projectId]
        );
        return res.status(200).json(result.rows || []);
    } catch (err) {
        console.error('Error fetching project funding entries:', err);
        return res.status(500).json({ error: 'Failed to fetch project funding entries.', details: err.message });
    }
});

router.post('/:projectId/funding-entries', async (req, res) => {
    const projectId = parseInt(String(req.params.projectId), 10);
    const sourceId = parseInt(String(req.body?.sourceId), 10);
    const amount = Number(req.body?.amount || 0);
    const stage = String(req.body?.stage || '').trim();
    const notes = String(req.body?.notes || '').trim();
    if (!Number.isFinite(projectId) || !Number.isFinite(sourceId)) {
        return res.status(400).json({ error: 'Invalid project/source id.' });
    }
    if (!Number.isFinite(amount) || amount < 0) {
        return res.status(400).json({ error: 'Amount must be a non-negative number.' });
    }
    try {
        await ensureFundingTables();
        const createdBy = req.user?.id ?? req.user?.userId ?? null;
        const result = await pool.query(
            `INSERT INTO project_funding_entries (project_id, source_id, amount, stage, notes, created_by, created_at, updated_at, voided)
             VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, false)
             RETURNING entry_id AS "entryId"`,
            [projectId, sourceId, amount, stage || null, notes || null, createdBy]
        );
        return res.status(201).json({ entryId: result.rows?.[0]?.entryId });
    } catch (err) {
        console.error('Error creating project funding entry:', err);
        return res.status(500).json({ error: 'Failed to create funding entry.', details: err.message });
    }
});

module.exports = router;
