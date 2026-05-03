/**
 * Send a single plain-text test message using api/.env SMTP_* settings.
 * Usage: node scripts/sendSmtpTest.js [recipient@email.com]
 *
 * Optional: SMTP_DEBUG=true for nodemailer protocol logs.
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const {
    sendSmtpTestEmail,
    canSendEmail,
    resetEmailTransporter,
    verifySmtpConnection,
} = require('../services/accountEmailService');

const to = (process.argv[2] || '').trim() || 'alfayo.g7kenya@gmail.com';

function summarizeEnv() {
    const host = (process.env.SMTP_HOST || '').trim();
    const port = (process.env.SMTP_PORT || '').trim();
    const secure = String(process.env.SMTP_SECURE || '').toLowerCase() === 'true';
    const user = (process.env.SMTP_USER || '').trim();
    const from = (process.env.SMTP_FROM || process.env.SMTP_USER || '').trim();
    console.log('Using SMTP_HOST=', JSON.stringify(host), 'PORT=', port, 'SECURE=', secure);
    console.log('SMTP_USER=', JSON.stringify(user), 'SMTP_FROM=', JSON.stringify(from));
    if (String(port) === '465' && !secure) {
        console.warn('Warning: port 465 usually requires SMTP_SECURE=true (implicit TLS).');
    }
    if (String(port) === '587' && secure) {
        console.warn('Warning: port 587 usually uses SMTP_SECURE=false (STARTTLS).');
    }
}

(async () => {
    summarizeEnv();
    if (!canSendEmail()) {
        console.error('SMTP is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS in api/.env');
        process.exit(1);
    }
    resetEmailTransporter();
    try {
        console.log('Running transporter.verify() …');
        await verifySmtpConnection();
        console.log('verify: OK');
    } catch (e) {
        console.error('verify failed:', e.message || e);
        process.exit(1);
    }
    try {
        const info = await sendSmtpTestEmail(to);
        console.log('Sent test email to', to);
        if (info && info.messageId) console.log('messageId:', info.messageId);
        if (info && info.response) console.log('server response:', info.response);
        console.log(
            '\nIf verify/send succeeded but the inbox never shows mail, the server accepted the message',
            'but downstream delivery/filtering failed: enable SPF/DKIM for icskenya.co.ke, check cPanel Track Delivery,',
            'and try sending to the same @icskenya.co.ke address to rule out relay limits.'
        );
    } catch (e) {
        console.error('Send failed:', e.message || e);
        process.exit(1);
    }
})();
