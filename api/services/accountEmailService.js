const nodemailer = require('nodemailer');
const { normalizeEmail } = require('../utils/emailNormalize');

let transporter = null;

/** Call after changing api/.env SMTP_* so the next send rebuilds nodemailer (otherwise old credentials are cached). */
function resetEmailTransporter() {
    transporter = null;
}

function getRequiredEnv(name) {
    const raw = process.env[name];
    if (raw == null || String(raw).trim() === '') return null;
    let v = String(raw).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
    }
    return v || null;
}

function getTransporter() {
    if (transporter) return transporter;

    const host = getRequiredEnv('SMTP_HOST');
    const portRaw = getRequiredEnv('SMTP_PORT');
    const user = getRequiredEnv('SMTP_USER');
    const pass = getRequiredEnv('SMTP_PASS');
    const secure = String(process.env.SMTP_SECURE || '').toLowerCase() === 'true';

    if (!host || !portRaw || !user || !pass) {
        return null;
    }

    const port = parseInt(portRaw, 10);
    const rejectUnauthorized =
        String(process.env.SMTP_TLS_REJECT_UNAUTHORIZED || 'true').toLowerCase() !== 'false';

    // Port 465 = implicit TLS (secure: true). Port 587 = STARTTLS (secure: false).
    // tls.servername helps when the cert CN/SAN is the mail host but clients connect oddly.
    transporter = nodemailer.createTransport({
        host,
        port,
        secure,
        auth: { user, pass },
        tls: {
            servername: host,
            minVersion: 'TLSv1.2',
            rejectUnauthorized,
        },
        connectionTimeout: 20000,
        greetingTimeout: 20000,
        socketTimeout: 60000,
        debug: String(process.env.SMTP_DEBUG || '').toLowerCase() === 'true',
        logger: String(process.env.SMTP_DEBUG || '').toLowerCase() === 'true',
    });
    return transporter;
}

function canSendEmail() {
    return Boolean(getTransporter());
}

/** Throws if TLS/auth handshake to SMTP_HOST fails (useful for diagnosing "sent" but no delivery). */
async function verifySmtpConnection() {
    const tx = getTransporter();
    if (!tx) throw new Error('SMTP is not configured (set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS).');
    await tx.verify();
}

function getLoginUrl() {
    return process.env.APP_LOGIN_URL || process.env.APP_FRONTEND_URL || 'http://localhost:5178/login';
}

function getFromAddress() {
    return process.env.SMTP_FROM || process.env.SMTP_USER || 'no-reply@example.com';
}

/** MAIL FROM / Return-Path alignment: many hosts require envelope sender = authenticated user. */
function getEnvelopeFrom() {
    return getRequiredEnv('SMTP_USER') || getFromAddress();
}

async function sendInitialCredentialsEmail({ email, fullName, username, oneTimePassword }) {
    const tx = getTransporter();
    if (!tx) throw new Error('SMTP is not configured.');
    if (!email) return false;

    const loginUrl = getLoginUrl();
    const from = getFromAddress();
    await tx.sendMail({
        from,
        to: email,
        envelope: { from: getEnvelopeFrom(), to: email },
        subject: 'Your MCME account has been created',
        text: `Hello ${fullName || username || 'User'},

Your account for MCME has been created.

Username: ${username}
One-time password: ${oneTimePassword}
Login link: ${loginUrl}

Please sign in and change your password immediately.`,
    });
    return true;
}

async function sendLoginOtpEmail({ email, fullName, username, code }) {
    const tx = getTransporter();
    if (!tx) throw new Error('SMTP is not configured.');
    if (!email) return false;

    const loginUrl = getLoginUrl();
    const from = getFromAddress();
    await tx.sendMail({
        from,
        to: email,
        envelope: { from: getEnvelopeFrom(), to: email },
        subject: 'Your sign-in verification code',
        text: `Hello ${fullName || username || 'User'},

Use this one-time code to complete your sign-in (valid for 10 minutes):

${code}

Username: ${username}

If you did not attempt to sign in, ignore this email and ensure your password is secure.

Login page: ${loginUrl}`,
    });
    return true;
}

async function sendPasswordResetEmail({ email, fullName, username, oneTimePassword }) {
    const tx = getTransporter();
    if (!tx) throw new Error('SMTP is not configured.');
    if (!email) return false;

    const loginUrl = getLoginUrl();
    const from = getFromAddress();
    await tx.sendMail({
        from,
        to: email,
        envelope: { from: getEnvelopeFrom(), to: email },
        subject: 'MCME password reset',
        text: `Hello ${fullName || username || 'User'},

A password reset was requested for your MCME account.

Username: ${username}
Temporary one-time password: ${oneTimePassword}
Login link: ${loginUrl}

Please sign in using the temporary password and change it immediately.
If you did not request this reset, contact support.`,
    });
    return true;
}

/** One-off connectivity check (e.g. `node scripts/sendSmtpTest.js you@example.com`). */
async function sendSmtpTestEmail(to) {
    const tx = getTransporter();
    if (!tx) throw new Error('SMTP is not configured (set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS).');
    const addr = String(to || '').trim();
    if (!addr) throw new Error('Recipient address is required.');
    const loginUrl = getLoginUrl();
    const from = getFromAddress();
    const info = await tx.sendMail({
        from,
        to: addr,
        envelope: { from: getEnvelopeFrom(), to: addr },
        subject: 'MCME SMTP test',
        text: `This is a manual SMTP connectivity test from the Machakos/MCME API.

If you received this, outbound mail from this server is working.

Login URL configured: ${loginUrl}
Sent at: ${new Date().toISOString()}`,
    });
    return { ok: true, messageId: info.messageId, response: info.response };
}

module.exports = {
    canSendEmail,
    resetEmailTransporter,
    verifySmtpConnection,
    sendInitialCredentialsEmail,
    sendLoginOtpEmail,
    sendPasswordResetEmail,
    sendSmtpTestEmail,
};
