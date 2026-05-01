const express = require('express');
const router = express.Router();
const db = require('../config/db');
const auth = require('../middleware/authenticate');
const privilege = require('../middleware/privilegeMiddleware');

function normalizeStatusRow(row) {
    if (!row || typeof row !== 'object') return row;
    return {
        statusId: row.statusId ?? row.statusid,
        statusName: row.statusName ?? row.statusname,
        description: row.description ?? null,
    };
}

async function fetchStatusDefinitionRows() {
    try {
        const result = await db.query(
            `SELECT "statusId", "statusName", description
             FROM payment_status_definitions
             ORDER BY "statusId" ASC`
        );
        return (result.rows || []).map(normalizeStatusRow);
    } catch (err) {
        if (err.code !== '42703') throw err;
        const result = await db.query('SELECT * FROM payment_status_definitions');
        const rows = (result.rows || []).map(normalizeStatusRow);
        rows.sort((a, b) => Number(a.statusId ?? 0) - Number(b.statusId ?? 0));
        return rows;
    }
}

// --- Routes for payment_status_definitions (PostgreSQL) ---

// GET /api/payment-status
router.get('/', auth, privilege(['payment_status_definitions.read']), async (req, res) => {
    try {
        const rows = await fetchStatusDefinitionRows();
        res.json(rows);
    } catch (error) {
        if (error.code === '42P01') {
            console.warn(
                '[payment-status] Table payment_status_definitions is missing. Run: psql $DB -f api/migrations/create_payment_status_definitions_pg.sql'
            );
            return res.status(200).json([]);
        }
        res.status(500).json({ message: 'Failed to fetch payment status definitions', error: error.message });
    }
});

router.post('/', auth, privilege(['payment_status_definitions.create']), async (req, res) => {
    const { statusName, description } = req.body;
    if (!statusName) {
        return res.status(400).json({ message: 'Status name is required.' });
    }
    try {
        const result = await db.query(
            `INSERT INTO payment_status_definitions ("statusName", description)
             VALUES ($1, $2)
             RETURNING "statusId"`,
            [statusName, description ?? null]
        );
        const statusId = result.rows[0]?.statusId;
        res.status(201).json({ message: 'Payment status created successfully.', statusId });
    } catch (error) {
        res.status(500).json({ message: 'Failed to create payment status', error: error.message });
    }
});

router.put('/:statusId', auth, privilege(['payment_status_definitions.update']), async (req, res) => {
    const { statusId } = req.params;
    const { statusName, description } = req.body;
    try {
        const result = await db.query(
            `UPDATE payment_status_definitions
             SET "statusName" = $1, description = $2
             WHERE "statusId" = $3`,
            [statusName, description, statusId]
        );
        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'Payment status not found.' });
        }
        res.json({ message: 'Payment status updated successfully.' });
    } catch (error) {
        res.status(500).json({ message: 'Failed to update payment status', error: error.message });
    }
});

router.delete('/:statusId', auth, privilege(['payment_status_definitions.delete']), async (req, res) => {
    const { statusId } = req.params;
    try {
        const result = await db.query('DELETE FROM payment_status_definitions WHERE "statusId" = $1', [statusId]);
        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'Payment status not found.' });
        }
        res.json({ message: 'Payment status deleted successfully.' });
    } catch (error) {
        res.status(500).json({ message: 'Failed to delete payment status', error: error.message });
    }
});

module.exports = router;
