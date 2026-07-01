const pool = require('../config/db');
const approvalWorkflowEngine = require('./approvalWorkflowEngine');

const DB_TYPE = process.env.DB_TYPE || 'postgresql';
const isPostgres = DB_TYPE === 'postgresql';

const rowsOf = (result) => {
    if (Array.isArray(result)) return result[0] || [];
    return result?.rows || [];
};

async function ensurePaymentRequestsTable() {
    if (!isPostgres) return;
    await pool.query(`
        CREATE TABLE IF NOT EXISTS project_payment_requests (
            "requestId" SERIAL PRIMARY KEY,
            "projectId" INTEGER NOT NULL,
            "contractorId" INTEGER NOT NULL,
            amount NUMERIC(14, 2) NOT NULL,
            description TEXT NOT NULL,
            "invoiceNumber" VARCHAR(120) NULL,
            "currentApprovalLevelId" INTEGER NULL,
            "paymentStatusId" INTEGER NULL,
            "submittedAt" TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
            voided BOOLEAN NOT NULL DEFAULT false,
            "approvedByUserId" INTEGER NULL,
            "approvalDate" TIMESTAMP WITHOUT TIME ZONE NULL,
            "rejectionReason" TEXT NULL,
            comments TEXT NULL,
            "userId" INTEGER NULL,
            "createdAt" TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
            "updatedAt" TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
        )
    `);
    await pool.query(`
        CREATE TABLE IF NOT EXISTS payment_approval_history (
            "historyId" SERIAL PRIMARY KEY,
            "requestId" INTEGER NOT NULL,
            action VARCHAR(80) NOT NULL,
            "actionByUserId" INTEGER NULL,
            notes TEXT NULL,
            "createdAt" TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
        )
    `);
}

async function isContractorAssignedToProject(contractorId, projectId) {
    const cid = parseInt(String(contractorId), 10);
    const pid = parseInt(String(projectId), 10);
    if (!Number.isFinite(cid) || !Number.isFinite(pid)) return false;

    if (isPostgres) {
        const result = await pool.query(
            `SELECT 1 FROM project_contractor_assignments
             WHERE "contractorId" = $1 AND "projectId" = $2
               AND COALESCE(voided, false) = false
             LIMIT 1`,
            [cid, pid]
        );
        return rowsOf(result).length > 0;
    }

    const result = await pool.query(
        `SELECT 1 FROM project_contractor_assignments
         WHERE contractorId = ? AND projectId = ? AND (voided IS NULL OR voided = 0)
         LIMIT 1`,
        [cid, pid]
    );
    return rowsOf(result).length > 0;
}

async function listPaymentRequestsForContractor(contractorId) {
    await ensurePaymentRequestsTable();
    await approvalWorkflowEngine.ensureReady();
    const cid = parseInt(String(contractorId), 10);
    if (!Number.isFinite(cid)) return [];

    if (isPostgres) {
        const result = await pool.query(
            `WITH latest_ar AS (
                SELECT DISTINCT ON (entity_id) entity_id, request_id, status
                FROM approval_requests
                WHERE entity_type = 'payment_request'
                ORDER BY entity_id, request_id DESC
             )
             SELECT
                pr."requestId",
                pr."projectId",
                pr."contractorId",
                pr.amount,
                pr.description,
                pr."invoiceNumber",
                pr."submittedAt",
                pr."paymentStatusId",
                pr.comments,
                p.name AS "projectName",
                lar.status AS "approvalWorkflowStatus",
                lar.request_id AS "approvalRequestId"
             FROM project_payment_requests pr
             LEFT JOIN projects p ON p.project_id = pr."projectId"
             LEFT JOIN latest_ar lar ON lar.entity_id = pr."requestId"::text
             WHERE pr."contractorId" = $1 AND COALESCE(pr.voided, false) = false
             ORDER BY pr."submittedAt" DESC NULLS LAST, pr."requestId" DESC`,
            [cid]
        );
        return rowsOf(result);
    }

    const result = await pool.query(
        `SELECT pr.*, p.projectName
         FROM project_payment_requests pr
         LEFT JOIN projects p ON p.id = pr.projectId
         WHERE pr.contractorId = ? AND pr.voided = 0
         ORDER BY pr.submittedAt DESC`,
        [cid]
    );
    return rowsOf(result);
}

async function createPaymentRequest({
    contractorId,
    projectId,
    amount,
    description,
    invoiceNumber,
    userId,
}) {
    await ensurePaymentRequestsTable();
    await approvalWorkflowEngine.ensureReady();

    const cid = parseInt(String(contractorId), 10);
    const pid = parseInt(String(projectId), 10);
    const amt = Number(amount);
    const desc = String(description || '').trim();
    const uid = userId != null ? parseInt(String(userId), 10) : null;

    if (!Number.isFinite(cid) || !Number.isFinite(pid)) {
        const err = new Error('Invalid contractor or project.');
        err.statusCode = 400;
        throw err;
    }
    if (!Number.isFinite(amt) || amt <= 0) {
        const err = new Error('Amount must be greater than zero.');
        err.statusCode = 400;
        throw err;
    }
    if (!desc) {
        const err = new Error('Description is required.');
        err.statusCode = 400;
        throw err;
    }

    const assigned = await isContractorAssignedToProject(cid, pid);
    if (!assigned) {
        const err = new Error('You are not assigned to this project.');
        err.statusCode = 403;
        throw err;
    }

    let requestId;
    const now = new Date();

    if (isPostgres) {
        const insertRes = await pool.query(
            `INSERT INTO project_payment_requests (
                "projectId", "contractorId", amount, description, "invoiceNumber",
                "paymentStatusId", "userId", "submittedAt", "createdAt", "updatedAt", voided
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8, $8, false)
             RETURNING "requestId"`,
            [pid, cid, amt, desc, invoiceNumber || null, 1, Number.isFinite(uid) ? uid : null, now]
        );
        requestId = rowsOf(insertRes)[0]?.requestId;
        await pool.query(
            `INSERT INTO payment_approval_history ("requestId", action, "actionByUserId", notes)
             VALUES ($1, $2, $3, $4)`,
            [requestId, 'Submitted', Number.isFinite(uid) ? uid : null, 'Payment request submitted by contractor.']
        );
    } else {
        const insertRes = await pool.query(
            `INSERT INTO project_payment_requests SET ?`,
            [{
                projectId: pid,
                contractorId: cid,
                amount: amt,
                description: desc,
                invoiceNumber: invoiceNumber || null,
                paymentStatusId: 1,
                userId: Number.isFinite(uid) ? uid : null,
                submittedAt: now,
                voided: 0,
            }]
        );
        requestId = insertRes?.insertId || rowsOf(insertRes)[0]?.insertId;
        await pool.query(
            `INSERT INTO payment_approval_history SET ?`,
            [{
                requestId,
                action: 'Submitted',
                actionByUserId: Number.isFinite(uid) ? uid : null,
                notes: 'Payment request submitted by contractor.',
            }]
        );
    }

    let workflow = null;
    try {
        const existingDef = await approvalWorkflowEngine.getActiveDefinitionForEntityType('payment_request');
        if (!existingDef) {
            await approvalWorkflowEngine.seedPaymentRequestExample();
        }
        workflow = await approvalWorkflowEngine.startRequest({
            entityType: 'payment_request',
            entityId: String(requestId),
            submittedBy: Number.isFinite(uid) ? uid : null,
            payloadSnapshot: {
                contractorId: cid,
                projectId: pid,
                amount: amt,
                description: desc,
                invoiceNumber: invoiceNumber || null,
            },
        });
    } catch (workflowErr) {
        console.warn('Payment request workflow start:', workflowErr.message);
    }

    return {
        requestId,
        message: 'Payment request submitted successfully.',
        workflowStatus: workflow?.status || 'pending',
        approvalRequestId: workflow?.request_id || workflow?.requestId || null,
    };
}

module.exports = {
    ensurePaymentRequestsTable,
    isContractorAssignedToProject,
    listPaymentRequestsForContractor,
    createPaymentRequest,
};
