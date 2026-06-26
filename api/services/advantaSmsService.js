/**
 * Advanta Africa QuickSMS — https://quicksms.advantasms.com
 * API docs: https://www.advantasms.com/bulksms-api
 */
const ADVANTA_SEND_OTP_URL = 'https://quicksms.advantasms.com/api/services/sendotp';
const ADVANTA_SEND_SMS_URL = 'https://quicksms.advantasms.com/api/services/sendsms/';
const ADVANTA_GET_BALANCE_URL = 'https://quicksms.advantasms.com/api/services/getbalance/';

function isAdvantaConfigured() {
    return !!(
        String(process.env.ADVANTA_API_KEY || '').trim() &&
        String(process.env.ADVANTA_PARTNER_ID || '').trim() &&
        String(process.env.ADVANTA_SHORT_CODE || '').trim()
    );
}

/** Kenya mobile → 254XXXXXXXXX */
function normalizeKenyaMobile(mobile) {
    let digits = String(mobile || '').replace(/\D/g, '');
    if (!digits) return '';
    if (digits.startsWith('0')) digits = `254${digits.slice(1)}`;
    else if ((digits.startsWith('7') || digits.startsWith('1')) && digits.length === 9) digits = `254${digits}`;
  else if (digits.length === 10 && digits.startsWith('254')) {
    // already ok
  } else if (digits.length === 12 && digits.startsWith('254')) {
    // ok
  }
    return digits;
}

function isValidKenyaMobile(digits) {
    return /^254\d{9}$/.test(digits);
}

function maskPhone(mobile) {
    const digits = normalizeKenyaMobile(mobile);
    if (!digits || digits.length < 6) return '***';
    return `***${digits.slice(-3)}`;
}

/** Advanta nests per-recipient results under `responses`; docs typo `respose-code`. */
function advantaResponseItems(data) {
    if (!data || typeof data !== 'object') return [];
    if (Array.isArray(data.responses)) return data.responses;
    return [data];
}

function advantaItemCode(item) {
    return item?.['respose-code'] ?? item?.['response-code'] ?? item?.response_code ?? item?.responseCode;
}

function advantaItemDescription(item) {
    return (
        item?.['response-description'] ||
        item?.response_description ||
        item?.message ||
        item?.error ||
        ''
    );
}

function formatAdvantaFailure(data, httpStatus) {
    const items = advantaResponseItems(data);
    const failed = items.filter((item) => {
        const code = advantaItemCode(item);
        return code !== undefined && Number(code) !== 200;
    });
    const fromItems = failed.map(advantaItemDescription).filter(Boolean);
    if (fromItems.length) return fromItems.join('; ');
    const topCode = advantaItemCode(data);
    if (topCode !== undefined && Number(topCode) !== 200) {
        return advantaItemDescription(data) || `Advanta error ${topCode}`;
    }
    return data?.message || data?.error || `Advanta SMS HTTP ${httpStatus}`;
}

async function postAdvanta(url, body) {
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body),
    });
    const text = await res.text();
    let data;
    try {
        data = text ? JSON.parse(text) : {};
    } catch {
        data = { raw: text };
    }
    const items = advantaResponseItems(data);
    const hasItemCodes = items.some((item) => advantaItemCode(item) !== undefined);
    const failed = items.filter((item) => {
        const code = advantaItemCode(item);
        return code !== undefined && Number(code) !== 200;
    });
    if (!res.ok || failed.length > 0 || (hasItemCodes && items.length === 0)) {
        const msg = formatAdvantaFailure(data, res.status);
        const err = new Error(msg);
        err.advantaResponse = data;
        throw err;
    }
    return data;
}

function summarizeAdvantaSend(data) {
    return advantaResponseItems(data).map((item) => ({
        code: advantaItemCode(item),
        description: advantaItemDescription(item),
        mobile: item?.mobile,
        messageId: item?.messageid ?? item?.messageId,
    }));
}

/**
 * Send a transactional SMS (OTP route when available).
 */
async function sendAdvantaSms({ mobile, message }) {
    if (!isAdvantaConfigured()) {
        throw new Error('Advanta SMS is not configured (ADVANTA_API_KEY, ADVANTA_PARTNER_ID, ADVANTA_SHORT_CODE).');
    }
    const normalized = normalizeKenyaMobile(mobile);
    if (!isValidKenyaMobile(normalized)) {
        throw new Error('Invalid Kenya mobile number for SMS.');
    }
    const payload = {
        apikey: String(process.env.ADVANTA_API_KEY).trim(),
        partnerID: String(process.env.ADVANTA_PARTNER_ID).trim(),
        message: String(message || '').slice(0, 480),
        shortcode: String(process.env.ADVANTA_SHORT_CODE).trim(),
        mobile: normalized,
    };
    const useOtpRoute = String(process.env.ADVANTA_USE_OTP_ROUTE || 'true').toLowerCase() !== 'false';
    const url = useOtpRoute ? ADVANTA_SEND_OTP_URL : ADVANTA_SEND_SMS_URL;
    const data = await postAdvanta(url, payload);
    const summary = summarizeAdvantaSend(data);
    console.log('[advantaSms] sent', {
        route: useOtpRoute ? 'sendotp' : 'sendsms',
        mobile: normalized,
        shortcode: payload.shortcode,
        results: summary,
    });
    return data;
}

async function getAdvantaBalance() {
    if (!isAdvantaConfigured()) {
        throw new Error('Advanta SMS is not configured (ADVANTA_API_KEY, ADVANTA_PARTNER_ID, ADVANTA_SHORT_CODE).');
    }
    const payload = {
        apikey: String(process.env.ADVANTA_API_KEY).trim(),
        partnerID: String(process.env.ADVANTA_PARTNER_ID).trim(),
    };
    return postAdvanta(ADVANTA_GET_BALANCE_URL, payload);
}

async function sendLoginOtpSms({ mobile, code, username }) {
    const who = username ? ` for ${username}` : '';
    const message = `Machakos County sign-in code${who}: ${code}. Valid 10 min. Do not share.`;
    return sendAdvantaSms({ mobile, message });
}

module.exports = {
    isAdvantaConfigured,
    normalizeKenyaMobile,
    isValidKenyaMobile,
    maskPhone,
    sendAdvantaSms,
    sendLoginOtpSms,
    getAdvantaBalance,
    summarizeAdvantaSend,
};
