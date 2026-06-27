/**
 * Login OTP (email and/or SMS): schema bootstrap, challenge storage, verification.
 *
 * Per-user switch (turn off for dev, on for production-style auth):
 * - PostgreSQL: `users.otp_enabled` BOOLEAN NOT NULL DEFAULT false
 * - MySQL:      `users.otpEnabled` TINYINT(1) NOT NULL DEFAULT 0
 *
 * Delivery channel (`otp_channel` / `otpChannel`): email | sms | both
 *
 * When enabled, after a correct password the API sends a 6-digit numeric code;
 * `POST /auth/login/verify-otp` completes sign-in. Codes are stored hashed in `login_otp_challenges`.
 */
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { sendLoginOtpEmail } = require('./accountEmailService');
const { sendLoginOtpSms, maskPhone } = require('./advantaSmsService');

const VALID_OTP_CHANNELS = new Set(['email', 'sms', 'both']);

let schemaEnsured = false;
let schemaEnsurePromise = null;

async function ensureLoginOtpSchema(pool) {
    if (schemaEnsured) return;
    if (schemaEnsurePromise) return schemaEnsurePromise;
    schemaEnsurePromise = (async () => {
        const DB_TYPE = process.env.DB_TYPE || 'mysql';
        if (DB_TYPE === 'postgresql') {
            await pool.query(
                'ALTER TABLE users ADD COLUMN IF NOT EXISTS otp_enabled BOOLEAN NOT NULL DEFAULT false'
            );
            await pool.query(
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS otp_channel VARCHAR(16) NOT NULL DEFAULT 'email'"
            );
            await pool.query(`
                CREATE TABLE IF NOT EXISTS login_otp_challenges (
                    id VARCHAR(36) PRIMARY KEY,
                    user_id INTEGER NOT NULL,
                    otp_hash TEXT NOT NULL,
                    expires_at TIMESTAMPTZ NOT NULL
                )
            `);
            await pool.query(
                'CREATE INDEX IF NOT EXISTS idx_login_otp_challenges_expires ON login_otp_challenges (expires_at)'
            );
            await pool.query(
                'CREATE INDEX IF NOT EXISTS idx_login_otp_challenges_user ON login_otp_challenges (user_id)'
            );
        } else {
            try {
                await pool.query(
                    'ALTER TABLE users ADD COLUMN otpEnabled TINYINT(1) NOT NULL DEFAULT 0'
                );
            } catch (e) {
                if (e.code !== 'ER_DUP_FIELDNAME') {
                    console.warn('[loginOtp] users.otpEnabled column:', e.message);
                }
            }
            try {
                await pool.query(
                    "ALTER TABLE users ADD COLUMN otpChannel VARCHAR(16) NOT NULL DEFAULT 'email'"
                );
            } catch (e) {
                if (e.code !== 'ER_DUP_FIELDNAME') {
                    console.warn('[loginOtp] users.otpChannel column:', e.message);
                }
            }
            await pool.query(`
                CREATE TABLE IF NOT EXISTS login_otp_challenges (
                    id VARCHAR(36) NOT NULL PRIMARY KEY,
                    userId INT NOT NULL,
                    otpHash VARCHAR(255) NOT NULL,
                    expiresAt DATETIME NOT NULL,
                    INDEX idx_login_otp_user (userId),
                    INDEX idx_login_otp_expires (expiresAt)
                )
            `);
        }
        schemaEnsured = true;
    })();
    return schemaEnsurePromise;
}

function generateSixDigitOtp() {
    return String(Math.floor(100000 + Math.random() * 900000));
}

function normalizeOtpChannel(value) {
    const v = String(value || 'email').trim().toLowerCase();
    return VALID_OTP_CHANNELS.has(v) ? v : 'email';
}

function readOtpChannel(userRow) {
    const raw = userRow?.otpChannel ?? userRow?.otp_channel ?? 'email';
    return normalizeOtpChannel(raw);
}

function buildOtpDeliveryMessage(channel, { maskedPhone }) {
    if (channel === 'sms') {
        return `A verification code was sent to your phone (${maskedPhone || 'on file'}). Each sign-in sends a new code — use only the most recent one.`;
    }
    if (channel === 'both') {
        return `A verification code was sent to your email and phone (${maskedPhone || 'on file'}). Use only the code from your most recent sign-in attempt.`;
    }
    return 'A verification code was sent to your email. Each password sign-in sends a new code and invalidates older ones — use only the code from your most recent email.';
}

/**
 * @returns {{ challengeId: string, otpChannel: string, maskedPhone: string|null, message: string }}
 */
async function createLoginOtpChallenge(pool, {
    userId,
    email,
    username,
    firstName,
    lastName,
    phoneNumber,
    otpChannel = 'email',
}) {
    await ensureLoginOtpSchema(pool);
    const DB_TYPE = process.env.DB_TYPE || 'mysql';
    const channel = normalizeOtpChannel(otpChannel);
    const sendEmail = channel === 'email' || channel === 'both';
    const sendSms = channel === 'sms' || channel === 'both';
    const plain = generateSixDigitOtp();
    const otpHash = await bcrypt.hash(plain, await bcrypt.genSalt(8));
    const id = crypto.randomUUID();
    const expires = new Date(Date.now() + 10 * 60 * 1000);

    if (DB_TYPE === 'postgresql') {
        await pool.query('DELETE FROM login_otp_challenges WHERE user_id = $1', [userId]);
        await pool.query(
            'INSERT INTO login_otp_challenges (id, user_id, otp_hash, expires_at) VALUES ($1, $2, $3, $4)',
            [id, userId, otpHash, expires.toISOString()]
        );
    } else {
        await pool.query('DELETE FROM login_otp_challenges WHERE userId = ?', [userId]);
        await pool.query(
            'INSERT INTO login_otp_challenges (id, userId, otpHash, expiresAt) VALUES (?, ?, ?, ?)',
            [id, userId, otpHash, expires]
        );
    }

    const fullName = [firstName, lastName].filter(Boolean).join(' ').trim();
    const errors = [];

    if (sendEmail) {
        try {
            await sendLoginOtpEmail({ email, username, fullName, code: plain });
        } catch (e) {
            errors.push(`email: ${e.message}`);
        }
    }
    if (sendSms) {
        try {
            await sendLoginOtpSms({ mobile: phoneNumber, code: plain, username });
        } catch (e) {
            console.error('[loginOtp] SMS delivery failed:', e.message, e.advantaResponse || '');
            errors.push(`sms: ${e.message}`);
        }
    }

    if (errors.length > 0) {
        if ((sendEmail && !sendSms) || (sendSms && !sendEmail) || errors.length >= 2) {
            throw new Error(errors.join('; '));
        }
        console.warn('[loginOtp] partial delivery failure:', errors.join('; '));
    }

    const maskedPhone = phoneNumber ? maskPhone(phoneNumber) : null;
    return {
        challengeId: id,
        otpChannel: channel,
        maskedPhone,
        message: buildOtpDeliveryMessage(channel, { maskedPhone }),
    };
}

/**
 * @returns {{ ok: boolean, userId?: number, error?: string }}
 */
async function verifyLoginOtpChallenge(pool, challengeId, plainCode) {
    await ensureLoginOtpSchema(pool);
    const DB_TYPE = process.env.DB_TYPE || 'mysql';
    const id = String(challengeId || '').trim();
    // Accept pasted text like "Your code: 123456" or "123 456" (email clients add noise).
    const digitsOnly = String(plainCode || '').replace(/\D/g, '');
    if (!id || digitsOnly.length !== 6) {
        return { ok: false, error: 'Enter the 6-digit verification code (exactly 6 numbers).' };
    }
    const code = digitsOnly;

    let row;
    if (DB_TYPE === 'postgresql') {
        const r = await pool.query(
            'SELECT user_id, otp_hash, expires_at FROM login_otp_challenges WHERE id = $1 LIMIT 1',
            [id]
        );
        row = r.rows?.[0];
    } else {
        const r = await pool.query(
            'SELECT userId AS user_id, otpHash AS otp_hash, expiresAt AS expires_at FROM login_otp_challenges WHERE id = ? LIMIT 1',
            [id]
        );
        const rows = Array.isArray(r) ? r[0] : r;
        row = Array.isArray(rows) ? rows[0] : rows;
    }

    if (!row) {
        return { ok: false, error: 'Code expired or invalid. Request a new sign-in.' };
    }

    const exp = row.expires_at ? new Date(row.expires_at) : null;
    if (!exp || Number.isNaN(exp.getTime()) || exp.getTime() < Date.now()) {
        await pool.query(
            DB_TYPE === 'postgresql'
                ? 'DELETE FROM login_otp_challenges WHERE id = $1'
                : 'DELETE FROM login_otp_challenges WHERE id = ?',
            [id]
        );
        return { ok: false, error: 'Code expired. Sign in again with your password.' };
    }

    const storedHash = row.otp_hash || row.otpHash;
    if (!storedHash || typeof storedHash !== 'string') {
        return { ok: false, error: 'Code expired or invalid. Request a new sign-in.' };
    }

    const match = await bcrypt.compare(code, storedHash);
    if (!match) {
        return { ok: false, error: 'Incorrect code.' };
    }

    await pool.query(
        DB_TYPE === 'postgresql'
            ? 'DELETE FROM login_otp_challenges WHERE id = $1'
            : 'DELETE FROM login_otp_challenges WHERE id = ?',
        [id]
    );

    return { ok: true, userId: Number(row.user_id) };
}

function parseOtpEnabledFlag(raw) {
    if (raw === true || raw === 1 || raw === '1') return true;
    if (raw === false || raw === 0 || raw === '0' || raw == null) return false;
    const normalized = String(raw).trim().toLowerCase();
    if (normalized === 'true' || normalized === 't' || normalized === 'yes') return true;
    if (normalized === 'false' || normalized === 'f' || normalized === 'no' || normalized === '') {
        return false;
    }
    return false;
}

function readOtpEnabledFlag(userRow, dbType = process.env.DB_TYPE || 'mysql') {
    if (!userRow) return false;
    const raw =
        dbType === 'postgresql'
            ? userRow.otp_enabled ?? userRow.otpEnabled
            : userRow.otpEnabled ?? userRow.otp_enabled;
    return parseOtpEnabledFlag(raw);
}

async function fetchUserOtpEnabledFromDb(pool, userId, dbType = process.env.DB_TYPE || 'mysql') {
    const uid = parseInt(String(userId), 10);
    if (!Number.isFinite(uid)) return false;
    if (dbType === 'postgresql') {
        const r = await pool.query('SELECT otp_enabled FROM users WHERE userid = $1 LIMIT 1', [uid]);
        return parseOtpEnabledFlag(r.rows?.[0]?.otp_enabled);
    }
    const r = await pool.query('SELECT otpEnabled FROM users WHERE userId = ? LIMIT 1', [uid]);
    const row = Array.isArray(r) ? r[0]?.[0] : r.rows?.[0];
    return parseOtpEnabledFlag(row?.otpEnabled);
}

function shouldBypassLoginOtpForMobileCollector(clientApp, userAgent = '') {
    const app = String(clientApp || '').trim().toLowerCase();
    if (app === 'machakos-collector') return true;
    const ua = String(userAgent || '').toLowerCase();
    // React Native Android (axios/okhttp) — already-installed collector APKs before clientApp was added
    if (ua.includes('machakos-collector')) return true;
    if (ua.includes('okhttp') && !ua.includes('mozilla')) return true;
    return false;
}

function mobileCollectorBypassEnabled() {
    return String(process.env.MOBILE_COLLECTOR_BYPASS_LOGIN_OTP ?? 'true').toLowerCase() !== 'false';
}

module.exports = {
    ensureLoginOtpSchema,
    createLoginOtpChallenge,
    verifyLoginOtpChallenge,
    parseOtpEnabledFlag,
    readOtpEnabledFlag,
    fetchUserOtpEnabledFromDb,
    shouldBypassLoginOtpForMobileCollector,
    mobileCollectorBypassEnabled,
    readOtpChannel,
    normalizeOtpChannel,
};
