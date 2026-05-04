/**
 * Append-only audit trail for security-sensitive and operational events.
 * Failures are logged only — callers must not await for correctness of the main transaction.
 */
const pool = require('../config/db');

let schemaEnsured = false;
let schemaEnsurePromise = null;

/** Canonical action names (string constants for reporting / filters). */
const AUDIT_ACTIONS = {
    AUTH_LOGIN_OTP_SENT: 'auth.login_otp_sent',
    AUTH_LOGIN_OTP_VERIFIED: 'auth.login_otp_verified',
    USER_INITIAL_CREDENTIALS_EMAIL_SENT: 'user.initial_credentials_email_sent',
    PROJECT_CREATE: 'project.create',
    PROJECT_UPDATE: 'project.update',
    PROJECT_DELETE: 'project.delete',
    DOCUMENT_UPLOAD: 'document.upload',
    DOCUMENT_UPDATE: 'document.update',
    DOCUMENT_DELETE: 'document.delete',
    CERTIFICATE_UPLOAD: 'certificate.upload',
    CERTIFICATE_CREATE: 'certificate.create',
    CERTIFICATE_UPDATE: 'certificate.update',
    CERTIFICATE_DELETE: 'certificate.delete',
    INSPECTION_CREATE: 'inspection.create',
    INSPECTION_UPDATE: 'inspection.update',
    INSPECTION_FILES_UPLOAD: 'inspection.files_upload',
};

async function ensureAuditTrailSchema() {
    if (schemaEnsured) return;
    if (schemaEnsurePromise) return schemaEnsurePromise;
    schemaEnsurePromise = (async () => {
        const DB_TYPE = (process.env.DB_TYPE || '').trim().toLowerCase();
        const isPg = DB_TYPE === 'postgresql' || DB_TYPE === 'postgres' || DB_TYPE === '';
        if (!isPg) {
            console.warn('[audit_trail] Skipping DDL: audit_trail is only auto-created for PostgreSQL.');
            schemaEnsured = true;
            return;
        }
        await pool.query(`
            CREATE TABLE IF NOT EXISTS audit_trail (
                id BIGSERIAL PRIMARY KEY,
                occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                action VARCHAR(128) NOT NULL,
                entity_type VARCHAR(64) NULL,
                entity_id VARCHAR(128) NULL,
                actor_user_id INTEGER NULL,
                actor_username VARCHAR(255) NULL,
                ip_address VARCHAR(64) NULL,
                user_agent TEXT NULL,
                detail JSONB NULL
            )
        `);
        await pool.query('CREATE INDEX IF NOT EXISTS idx_audit_trail_occurred ON audit_trail (occurred_at DESC)');
        await pool.query('CREATE INDEX IF NOT EXISTS idx_audit_trail_action ON audit_trail (action)');
        await pool.query('CREATE INDEX IF NOT EXISTS idx_audit_trail_entity ON audit_trail (entity_type, entity_id)');
        schemaEnsured = true;
    })();
    return schemaEnsurePromise;
}

function clientIp(req) {
    if (!req) return null;
    const xf = req.headers && req.headers['x-forwarded-for'];
    if (xf) {
        const first = String(xf).split(',')[0].trim();
        return first || null;
    }
    return req.ip || (req.socket && req.socket.remoteAddress) || null;
}

function actorFromReq(req) {
    if (!req || !req.user) return { userId: null, username: null };
    const u = req.user;
    const userId = u.id ?? u.userId ?? u.userid ?? u.actualUserId ?? null;
    const username = u.username || u.userName || null;
    return {
        userId: userId != null && Number.isFinite(Number(userId)) ? Number(userId) : null,
        username: username != null ? String(username).slice(0, 255) : null,
    };
}

function sanitizeDetail(obj) {
    if (obj == null) return null;
    try {
        return JSON.parse(
            JSON.stringify(obj, (k, v) => {
                if (typeof v === 'string' && v.length > 4000) return `${v.slice(0, 4000)}…`;
                return v;
            })
        );
    } catch {
        return {};
    }
}

/**
 * @param {object} opts
 * @param {import('express').Request} [opts.req]
 * @param {string} opts.action — use AUDIT_ACTIONS.*
 * @param {string} [opts.entityType]
 * @param {string|number} [opts.entityId]
 * @param {object} [opts.details] — no secrets or OTP values
 * @param {number} [opts.actorUserId] — overrides req.user
 * @param {string} [opts.actorUsername]
 */
async function recordAudit(opts = {}) {
    const {
        req,
        action,
        entityType = null,
        entityId = null,
        details = null,
        actorUserId: actorOverride = undefined,
        actorUsername: usernameOverride = undefined,
    } = opts;
    if (!action || typeof action !== 'string') return;

    try {
        await ensureAuditTrailSchema();
        const DB_TYPE = (process.env.DB_TYPE || '').trim().toLowerCase();
        const isPg = DB_TYPE === 'postgresql' || DB_TYPE === 'postgres' || DB_TYPE === '';
        if (!isPg) return;

        const fromReq = actorFromReq(req);
        const actorUserId = actorOverride !== undefined ? actorOverride : fromReq.userId;
        const actorUsername = usernameOverride !== undefined ? usernameOverride : fromReq.username;
        const ip = clientIp(req);
        const ua = req && req.headers && req.headers['user-agent'] ? String(req.headers['user-agent']).slice(0, 4000) : null;
        const eid = entityId != null ? String(entityId).slice(0, 128) : null;
        const et = entityType != null ? String(entityType).slice(0, 64) : null;
        const det = sanitizeDetail(details);

        await pool.query(
            `INSERT INTO audit_trail (action, entity_type, entity_id, actor_user_id, actor_username, ip_address, user_agent, detail)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
            [
                action.slice(0, 128),
                et,
                eid,
                actorUserId,
                actorUsername != null ? String(actorUsername).slice(0, 255) : null,
                ip != null ? String(ip).slice(0, 64) : null,
                ua,
                det != null ? JSON.stringify(det) : null,
            ]
        );
    } catch (e) {
        console.warn('[audit_trail] record failed:', e.message);
    }
}

module.exports = {
    AUDIT_ACTIONS,
    recordAudit,
    ensureAuditTrailSchema,
};
