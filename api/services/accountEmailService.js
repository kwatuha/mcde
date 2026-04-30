const nodemailer = require('nodemailer');

let transporter = null;

function getRequiredEnv(name) {
    const value = process.env[name];
    return value && String(value).trim() !== '' ? String(value).trim() : null;
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

    transporter = nodemailer.createTransport({
        host,
        port: parseInt(portRaw, 10),
        secure,
        auth: { user, pass },
    });
    return transporter;
}

function canSendEmail() {
    return Boolean(getTransporter());
}

function getLoginUrl() {
    return process.env.APP_LOGIN_URL || process.env.APP_FRONTEND_URL || 'http://localhost:5178/login';
}

function getFromAddress() {
    return process.env.SMTP_FROM || process.env.SMTP_USER || 'no-reply@example.com';
}

async function sendInitialCredentialsEmail({ email, fullName, username, oneTimePassword }) {
    const tx = getTransporter();
    if (!tx) throw new Error('SMTP is not configured.');
    if (!email) return false;

    const loginUrl = getLoginUrl();
    await tx.sendMail({
        from: getFromAddress(),
        to: email,
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

async function sendPasswordResetEmail({ email, fullName, username, oneTimePassword }) {
    const tx = getTransporter();
    if (!tx) throw new Error('SMTP is not configured.');
    if (!email) return false;

    const loginUrl = getLoginUrl();
    await tx.sendMail({
        from: getFromAddress(),
        to: email,
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

module.exports = {
    canSendEmail,
    sendInitialCredentialsEmail,
    sendPasswordResetEmail,
};
