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
            source_id INTEGER NULL REFERENCES funding_sources(source_id),
            partner_id INTEGER NULL,
            amount NUMERIC(18,2) NOT NULL DEFAULT 0,
            stage TEXT NULL,
            notes TEXT NULL,
            created_by INTEGER NULL,
            created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
            voided BOOLEAN NOT NULL DEFAULT FALSE
        )
    `);

    await pool.query(`
        ALTER TABLE funding_sources
        ADD COLUMN IF NOT EXISTS partner_id INTEGER NULL
    `);

    await pool.query(`
        ALTER TABLE project_funding_entries
        ADD COLUMN IF NOT EXISTS partner_id INTEGER NULL
    `);

    await pool.query(`
        ALTER TABLE project_funding_entries
        ALTER COLUMN source_id DROP NOT NULL
    `);
}

router.get('/funding-sources', async (req, res) => {
    try {
        await ensureFundingTables();
        const result = await pool.query(
            `SELECT
                fs.source_id AS "sourceId",
                fs.source_name AS "sourceName",
                fs.description,
                fs.active,
                fs.partner_id AS "partnerId",
                pp.partner_name AS "partnerName",
                fs.created_at AS "createdAt",
                fs.updated_at AS "updatedAt"
             FROM funding_sources fs
             LEFT JOIN project_partners pp ON pp.partner_id = fs.partner_id AND COALESCE(pp.voided, false) = false
             WHERE active = true
             ORDER BY fs.source_name`
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
    const partnerId = req.body?.partnerId != null ? parseInt(String(req.body.partnerId), 10) : null;
    if (!sourceName) return res.status(400).json({ error: 'sourceName is required.' });
    if (req.body?.partnerId != null && !Number.isFinite(partnerId)) {
        return res.status(400).json({ error: 'Invalid partnerId.' });
    }

    try {
        await ensureFundingTables();
        const createdBy = req.user?.id ?? req.user?.userId ?? null;
        const result = await pool.query(
            `INSERT INTO funding_sources (source_name, description, partner_id, active, created_by, created_at, updated_at)
             VALUES ($1, $2, $3, true, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
             RETURNING source_id AS "sourceId", source_name AS "sourceName", description, active, partner_id AS "partnerId"`,
            [sourceName, description || null, Number.isFinite(partnerId) ? partnerId : null, createdBy]
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
                pfe.partner_id AS "partnerId",
                pp.partner_name AS "partnerName",
                pfe.amount,
                pfe.stage,
                pfe.notes,
                pfe.created_at AS "createdAt",
                pfe.updated_at AS "updatedAt"
             FROM project_funding_entries pfe
             LEFT JOIN funding_sources fs ON fs.source_id = pfe.source_id
             LEFT JOIN project_partners pp ON pp.partner_id = COALESCE(pfe.partner_id, fs.partner_id) AND COALESCE(pp.voided, false) = false
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
    const sourceId = req.body?.sourceId != null && req.body?.sourceId !== '' ? parseInt(String(req.body?.sourceId), 10) : null;
    const partnerId = req.body?.partnerId != null && req.body?.partnerId !== '' ? parseInt(String(req.body?.partnerId), 10) : null;
    const amount = Number(req.body?.amount || 0);
    const stage = String(req.body?.stage || '').trim();
    const notes = String(req.body?.notes || '').trim();
    if (!Number.isFinite(projectId)) {
        return res.status(400).json({ error: 'Invalid project id.' });
    }
    if (!Number.isFinite(sourceId) && !Number.isFinite(partnerId)) {
        return res.status(400).json({ error: 'Either partnerId or sourceId is required.' });
    }
    if (!Number.isFinite(amount) || amount < 0) {
        return res.status(400).json({ error: 'Amount must be a non-negative number.' });
    }
    try {
        await ensureFundingTables();
        const projectBudgetResult = await pool.query(
            `
            SELECT
                CASE
                    WHEN p.costOfProject IS NOT NULL THEN p.costOfProject::numeric
                    WHEN (p.budget->>'allocated_amount_kes') ~ '^[0-9]+(\\.[0-9]+){0,1}$'
                        THEN (p.budget->>'allocated_amount_kes')::numeric
                    ELSE NULL
                END AS "projectBudget"
            FROM projects p
            WHERE p.project_id = $1 AND COALESCE(p.voided, false) = false
            LIMIT 1
            `,
            [projectId]
        );
        const projectBudget = Number(projectBudgetResult.rows?.[0]?.projectBudget);
        if (!projectBudgetResult.rows?.length) {
            return res.status(404).json({ error: 'Project not found.' });
        }

        const currentTotalResult = await pool.query(
            `
            SELECT COALESCE(SUM(amount), 0) AS "currentTotal"
            FROM project_funding_entries
            WHERE project_id = $1 AND COALESCE(voided, false) = false
            `,
            [projectId]
        );
        const currentTotal = Number(currentTotalResult.rows?.[0]?.currentTotal || 0);
        const projectedTotal = currentTotal + amount;
        if (Number.isFinite(projectBudget) && projectedTotal > projectBudget) {
            return res.status(400).json({
                error: 'Funding total would exceed project budget.',
                projectBudget,
                currentFundingTotal: currentTotal,
                attemptedAmount: amount,
                projectedFundingTotal: projectedTotal,
            });
        }

        const createdBy = req.user?.id ?? req.user?.userId ?? null;
        const result = await pool.query(
            `INSERT INTO project_funding_entries (project_id, source_id, partner_id, amount, stage, notes, created_by, created_at, updated_at, voided)
             VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, false)
             RETURNING entry_id AS "entryId"`,
            [
                projectId,
                Number.isFinite(sourceId) ? sourceId : null,
                Number.isFinite(partnerId) ? partnerId : null,
                amount,
                stage || null,
                notes || null,
                createdBy,
            ]
        );
        return res.status(201).json({ entryId: result.rows?.[0]?.entryId });
    } catch (err) {
        console.error('Error creating project funding entry:', err);
        return res.status(500).json({ error: 'Failed to create funding entry.', details: err.message });
    }
});

module.exports = router;
