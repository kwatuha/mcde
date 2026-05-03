/**
 * Email OTP for login: schema bootstrap, challenge storage, verification.
 *
 * Per-user switch (turn off for dev, on for production-style auth):
 * - PostgreSQL: `users.otp_enabled` BOOLEAN NOT NULL DEFAULT false
 * - MySQL:      `users.otpEnabled` TINYINT(1) NOT NULL DEFAULT 0
 *
 * When enabled, after a correct password the API emails a 6-digit numeric code;
 * `POST /auth/login/verify-otp` completes sign-in. Codes are stored hashed in `login_otp_challenges`.
 */
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { sendLoginOtpEmail } = require('./accountEmailService');

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

/**
 * @returns {{ challengeId: string }}
 */
async function createLoginOtpChallenge(pool, { userId, email, username, firstName, lastName }) {
    await ensureLoginOtpSchema(pool);
    const DB_TYPE = process.env.DB_TYPE || 'mysql';
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

    await sendLoginOtpEmail({
        email,
        username,
        fullName: [firstName, lastName].filter(Boolean).join(' ').trim(),
        code: plain,
    });

    return { challengeId: id };
}

/**
 * @returns {{ ok: boolean, userId?: number, error?: string }}
 */
async function verifyLoginOtpChallenge(pool, challengeId, plainCode) {
    await ensureLoginOtpSchema(pool);
    const DB_TYPE = process.env.DB_TYPE || 'mysql';
    const id = String(challengeId || '').trim();
    const code = String(plainCode || '').trim();
    if (!id || !/^\d{6}$/.test(code)) {
        return { ok: false, error: 'Invalid code format.' };
    }

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

    const match = await bcrypt.compare(code, row.otp_hash);
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

function readOtpEnabledFlag(userRow) {
    const raw =
        userRow.otpEnabled !== undefined && userRow.otpEnabled !== null
            ? userRow.otpEnabled
            : userRow.otp_enabled;
    return raw === true || raw === 1 || raw === '1';
}

module.exports = {
    ensureLoginOtpSchema,
    createLoginOtpChallenge,
    verifyLoginOtpChallenge,
    readOtpEnabledFlag,
};
