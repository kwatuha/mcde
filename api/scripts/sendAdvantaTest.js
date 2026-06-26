/**
 * Smoke-test Advanta QuickSMS using api/.env ADVANTA_* settings.
 *
 * Usage:
 *   node scripts/sendAdvantaTest.js balance
 *   node scripts/sendAdvantaTest.js send 0712345678 "Test message"
 *
 * Optional: ADVANTA_USE_OTP_ROUTE=false to hit sendsms/ instead of sendotp.
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const {
    isAdvantaConfigured,
    getAdvantaBalance,
    sendAdvantaSms,
    normalizeKenyaMobile,
    summarizeAdvantaSend,
} = require('../services/advantaSmsService');

function summarizeEnv() {
    const partnerId = (process.env.ADVANTA_PARTNER_ID || '').trim();
    const shortCode = (process.env.ADVANTA_SHORT_CODE || '').trim();
    const useOtp = String(process.env.ADVANTA_USE_OTP_ROUTE || 'true').toLowerCase() !== 'false';
    console.log('ADVANTA_PARTNER_ID=', JSON.stringify(partnerId));
    console.log('ADVANTA_SHORT_CODE=', JSON.stringify(shortCode));
    console.log('ADVANTA_USE_OTP_ROUTE=', useOtp ? 'sendotp' : 'sendsms');
    console.log('ADVANTA_API_KEY=', process.env.ADVANTA_API_KEY ? '(set)' : '(missing)');
}

(async () => {
    summarizeEnv();
    if (!isAdvantaConfigured()) {
        console.error('Advanta is not configured. Set ADVANTA_PARTNER_ID, ADVANTA_API_KEY, ADVANTA_SHORT_CODE in api/.env');
        process.exit(1);
    }

    const mode = (process.argv[2] || 'balance').toLowerCase();
    try {
        if (mode === 'balance') {
            const data = await getAdvantaBalance();
            console.log('Balance response:', JSON.stringify(data, null, 2));
            return;
        }
        if (mode === 'send') {
            const rawMobile = process.argv[3];
            const message = process.argv.slice(4).join(' ') || 'Machakos County SMS test';
            if (!rawMobile) {
                console.error('Usage: node scripts/sendAdvantaTest.js send 0712345678 "optional message"');
                process.exit(1);
            }
            const normalized = normalizeKenyaMobile(rawMobile);
            console.log('Sending to', normalized, '…');
            const data = await sendAdvantaSms({ mobile: rawMobile, message });
            console.log('Send OK:', JSON.stringify(summarizeAdvantaSend(data), null, 2));
            return;
        }
        console.error('Unknown mode. Use: balance | send');
        process.exit(1);
    } catch (e) {
        console.error('Advanta test failed:', e.message || e);
        if (e.advantaResponse) {
            console.error('API response:', JSON.stringify(e.advantaResponse, null, 2));
        }
        process.exit(1);
    }
})();
