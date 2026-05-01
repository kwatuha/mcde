const express = require('express');
const router = express.Router();
const db = require('../config/db');
const auth = require('../middleware/authenticate');
const privilege = require('../middleware/privilegeMiddleware');

/** Normalize DB row keys so the React app always sees camelCase (levelId, …). */
function normalizeApprovalLevelRow(row) {
    if (!row || typeof row !== 'object') return row;
    return {
        levelId: row.levelId ?? row.levelid,
        levelName: row.levelName ?? row.levelname,
        roleId: row.roleId ?? row.roleid,
        approvalOrder: row.approvalOrder ?? row.approvalorder,
        workflowId: row.workflowId ?? row.workflowid ?? null,
    };
}

async function fetchApprovalLevelsRows() {
    try {
        const result = await db.query(
            `SELECT "levelId", "levelName", "roleId", "approvalOrder", "workflowId"
             FROM payment_approval_levels
             ORDER BY "approvalOrder" ASC`
        );
        return (result.rows || []).map(normalizeApprovalLevelRow);
    } catch (err) {
        // Quoted identifiers mismatch (e.g. all-lowercase columns) — fall back to SELECT *
        if (err.code !== '42703') throw err;
        const result = await db.query('SELECT * FROM payment_approval_levels');
        const rows = (result.rows || []).map(normalizeApprovalLevelRow);
        rows.sort((a, b) => Number(a.approvalOrder ?? 0) - Number(b.approvalOrder ?? 0));
        return rows;
    }
}

// --- Routes for payment_approval_levels (PostgreSQL; quoted camelCase columns per schema dumps) ---

// GET all approval levels
router.get('/', auth, privilege(['approval_levels.read']), async (req, res) => {
    try {
        const rows = await fetchApprovalLevelsRows();
        res.json(rows);
    } catch (error) {
        // undefined_table — DB never migrated; return empty list so the management page loads
        if (error.code === '42P01') {
            console.warn(
                '[approval-levels] Table payment_approval_levels is missing. Run: psql $DB -f api/migrations/create_payment_approval_levels_pg.sql'
            );
            return res.status(200).json([]);
        }
        res.status(500).json({ message: 'Failed to fetch approval levels', error: error.message });
    }
});

// POST a new approval level
router.post('/', auth, privilege(['approval_levels.create']), async (req, res) => {
    const { levelName, roleId, approvalOrder } = req.body;
    if (!levelName || !roleId || approvalOrder === undefined) {
        return res.status(400).json({ message: 'levelName, roleId, and approvalOrder are required.' });
    }
    try {
        const result = await db.query(
            `INSERT INTO payment_approval_levels ("levelName", "roleId", "approvalOrder")
             VALUES ($1, $2, $3)
             RETURNING "levelId"`,
            [levelName, roleId, approvalOrder]
        );
        const levelId = result.rows[0]?.levelId;
        res.status(201).json({ message: 'Approval level created successfully.', levelId });
    } catch (error) {
        res.status(500).json({ message: 'Failed to create approval level', error: error.message });
    }
});

// PUT to update an approval level
router.put('/:levelId', auth, privilege(['approval_levels.update']), async (req, res) => {
    const { levelId } = req.params;
    const { levelName, roleId, approvalOrder } = req.body;
    try {
        const result = await db.query(
            `UPDATE payment_approval_levels
             SET "levelName" = $1, "roleId" = $2, "approvalOrder" = $3
             WHERE "levelId" = $4`,
            [levelName, roleId, approvalOrder, levelId]
        );
        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'Approval level not found.' });
        }
        res.json({ message: 'Approval level updated successfully.' });
    } catch (error) {
        res.status(500).json({ message: 'Failed to update approval level', error: error.message });
    }
});

// DELETE an approval level
router.delete('/:levelId', auth, privilege(['approval_levels.delete']), async (req, res) => {
    const { levelId } = req.params;
    try {
        const result = await db.query('DELETE FROM payment_approval_levels WHERE "levelId" = $1', [levelId]);
        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'Approval level not found.' });
        }
        res.json({ message: 'Approval level deleted successfully.' });
    } catch (error) {
        res.status(500).json({ message: 'Failed to delete approval level', error: error.message });
    }
});

// --- Routes for payment_details ---

// GET a payment details record by requestId
router.get('/payment-details/:requestId', auth, privilege(['payment_details.read']), async (req, res) => {
    const { requestId } = req.params;
    try {
        const result = await db.query('SELECT * FROM payment_details WHERE "requestId" = $1', [requestId]);
        const rows = result.rows || [];
        if (rows.length === 0) {
            return res.status(404).json({ message: 'Payment details not found for this request.' });
        }
        res.json(rows[0]);
    } catch (error) {
        res.status(500).json({ message: 'Failed to fetch payment details', error: error.message });
    }
});

// POST to create a new payment details record
router.post('/payment-details', auth, privilege(['payment_details.create']), async (req, res) => {
    const { requestId, paymentMode, bankName, accountNumber, transactionId, notes, paidByUserId } = req.body;
    if (!requestId || !paymentMode || !paidByUserId) {
        return res.status(400).json({ message: 'Missing required fields.' });
    }
    try {
        const result = await db.query(
            `INSERT INTO payment_details (
                "requestId", "paymentMode", "bankName", "accountNumber", "transactionId", notes, "paidByUserId"
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING "detailId"`,
            [requestId, paymentMode, bankName || null, accountNumber || null, transactionId || null, notes || null, paidByUserId]
        );
        const detailId = result.rows[0]?.detailId;
        res.status(201).json({ message: 'Payment details created successfully.', detailId });
    } catch (error) {
        res.status(500).json({ message: 'Failed to create payment details', error: error.message });
    }
});

// PUT to update a payment details record
router.put('/payment-details/:requestId', auth, privilege(['payment_details.update']), async (req, res) => {
    const { requestId } = req.params;
    const { paymentMode, bankName, accountNumber, transactionId, notes } = req.body;
    try {
        const result = await db.query(
            `UPDATE payment_details
             SET "paymentMode" = $1, "bankName" = $2, "accountNumber" = $3, "transactionId" = $4, notes = $5
             WHERE "requestId" = $6`,
            [paymentMode, bankName, accountNumber, transactionId, notes, requestId]
        );
        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'Payment details not found.' });
        }
        res.json({ message: 'Payment details updated successfully.' });
    } catch (error) {
        res.status(500).json({ message: 'Failed to update payment details', error: error.message });
    }
});

// DELETE a payment details record
router.delete('/payment-details/:requestId', auth, privilege(['payment_details.delete']), async (req, res) => {
    const { requestId } = req.params;
    try {
        const result = await db.query('DELETE FROM payment_details WHERE "requestId" = $1', [requestId]);
        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'Payment details not found.' });
        }
        res.json({ message: 'Payment details deleted successfully.' });
    } catch (error) {
        res.status(500).json({ message: 'Failed to delete payment details', error: error.message });
    }
});

// --- Routes for payment_approval_history ---

// GET a payment approval history for a requestId
router.get('/history/:requestId', auth, privilege(['payment_request.read']), async (req, res) => {
    const { requestId } = req.params;
    try {
        const result = await db.query(
            'SELECT * FROM payment_approval_history WHERE "requestId" = $1 ORDER BY "actionDate" ASC',
            [requestId]
        );
        res.json(result.rows || []);
    } catch (error) {
        res.status(500).json({ message: 'Failed to fetch payment approval history', error: error.message });
    }
});

module.exports = router;
