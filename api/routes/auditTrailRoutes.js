/**
 * Admin-only read API for audit_trail (PostgreSQL).
 */
const express = require('express');
const pool = require('../config/db');
const { isAdminLikeRequester } = require('../utils/roleUtils');
const { ensureAuditTrailSchema } = require('../services/auditTrailService');

const router = express.Router();

function sanitizeToken(s, maxLen) {
    return String(s ?? '')
        .trim()
        .slice(0, maxLen)
        .replace(/%/g, '');
}

/**
 * GET /api/audit-trail
 * Query: limit (1–200, default 50), offset (default 0),
 *        action (substring match), entityType, entityId (exact),
 *        actorUsername (substring), from, to (ISO date, occurred_at range)
 */
router.get('/', async (req, res) => {
    if (!isAdminLikeRequester(req.user)) {
        return res.status(403).json({ error: 'Admin access required to view audit trail.' });
    }

    const DB_TYPE = (process.env.DB_TYPE || '').trim().toLowerCase();
    const isPg = DB_TYPE === 'postgresql' || DB_TYPE === 'postgres' || DB_TYPE === '';
    if (!isPg) {
        return res.status(501).json({ error: 'Audit trail listing is only available when using PostgreSQL.' });
    }

    try {
        await ensureAuditTrailSchema();
    } catch (e) {
        console.warn('[audit-trail] ensure schema:', e.message);
        return res.status(500).json({ error: 'Could not ensure audit trail table.', details: e.message });
    }

    const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit || '50'), 10) || 50));
    const offset = Math.max(0, parseInt(String(req.query.offset || '0'), 10) || 0);

    const actionQ = sanitizeToken(req.query.action, 128);
    const entityType = sanitizeToken(req.query.entityType, 64);
    const entityId = sanitizeToken(req.query.entityId, 128);
    const actorUsername = sanitizeToken(req.query.actorUsername, 255);
    const from = sanitizeToken(req.query.from, 32);
    const to = sanitizeToken(req.query.to, 32);

    const where = [];
    const params = [];
    let n = 1;

    if (actionQ) {
        where.push(`action ILIKE $${n++}`);
        params.push(`%${actionQ}%`);
    }
    if (entityType) {
        where.push(`entity_type = $${n++}`);
        params.push(entityType);
    }
    if (entityId) {
        where.push(`entity_id = $${n++}`);
        params.push(entityId);
    }
    if (actorUsername) {
        where.push(`actor_username ILIKE $${n++}`);
        params.push(`%${actorUsername}%`);
    }
    if (from) {
        where.push(`occurred_at >= $${n++}::timestamptz`);
        params.push(from);
    }
    if (to) {
        where.push(`occurred_at < ($${n++}::timestamptz + interval '1 day')`);
        params.push(to);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const countSql = `SELECT COUNT(*)::bigint AS c FROM audit_trail ${whereSql}`;
    const listSql = `
        SELECT
            id,
            occurred_at AS "occurredAt",
            action,
            entity_type AS "entityType",
            entity_id AS "entityId",
            actor_user_id AS "actorUserId",
            actor_username AS "actorUsername",
            ip_address AS "ipAddress",
            user_agent AS "userAgent",
            detail
        FROM audit_trail
        ${whereSql}
        ORDER BY occurred_at DESC, id DESC
        LIMIT $${n} OFFSET $${n + 1}
    `;

    try {
        const countResult = await pool.query(countSql, params);
        const total = Number(countResult.rows?.[0]?.c || 0);
        const listParams = [...params, limit, offset];
        const listResult = await pool.query(listSql, listParams);
        return res.json({
            items: listResult.rows || [],
            total,
            limit,
            offset,
        });
    } catch (err) {
        console.error('[audit-trail] list error:', err);
        return res.status(500).json({ error: 'Failed to load audit trail.', details: err.message });
    }
});

module.exports = router;
