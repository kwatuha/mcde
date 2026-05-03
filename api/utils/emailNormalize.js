/**
 * Normalize an email for storage, lookup, and SMTP "to" / envelope.
 * Trims whitespace, strips zero-width / BOM characters, lowercases (Gmail-safe; avoids duplicate accounts).
 */
function normalizeEmail(email) {
    let s = String(email ?? '').trim();
    if (!s) return '';
    s = s.replace(/[\u200B-\u200D\uFEFF]/g, '');
    return s.toLowerCase();
}

module.exports = { normalizeEmail };
