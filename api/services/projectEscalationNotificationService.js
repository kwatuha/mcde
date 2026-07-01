/**
 * Optional email notifications for project escalation signals.
 */
const pool = require('../config/db');
const { canSendEmail, sendWorkflowNotificationEmail } = require('./accountEmailService');

const SETTINGS_KEY = 'project_escalation_notifications';

const DEFAULT_SETTINGS = {
  emailEnabled: false,
  notifyOnNewSignal: true,
  notifyOnEscalation: true,
  minSeverity: 'medium',
  roleIds: [],
};

const SEVERITY_RANK = { low: 1, medium: 2, high: 3, critical: 4 };

function rows(r) {
  return r?.rows || [];
}

function first(r) {
  return rows(r)[0] || null;
}

function parseSettings(raw) {
  if (!raw) return { ...DEFAULT_SETTINGS };
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      roleIds: Array.isArray(parsed.roleIds)
        ? parsed.roleIds.map((id) => Number(id)).filter((id) => Number.isFinite(id))
        : [],
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

async function ensureSettingsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS system_settings (
      setting_key TEXT PRIMARY KEY,
      setting_value TEXT NOT NULL,
      updated_by BIGINT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function getNotificationSettings() {
  await ensureSettingsTable();
  const row = first(
    await pool.query(`SELECT setting_value FROM system_settings WHERE setting_key = $1 LIMIT 1`, [SETTINGS_KEY])
  );
  return parseSettings(row?.setting_value);
}

async function updateNotificationSettings(payload, userId = null) {
  await ensureSettingsTable();
  const current = await getNotificationSettings();
  const next = {
    ...current,
    ...payload,
    roleIds: Array.isArray(payload?.roleIds)
      ? payload.roleIds.map((id) => Number(id)).filter((id) => Number.isFinite(id))
      : current.roleIds,
  };
  await pool.query(
    `
    INSERT INTO system_settings (setting_key, setting_value, updated_by, updated_at)
    VALUES ($1, $2, $3, NOW())
    ON CONFLICT (setting_key) DO UPDATE SET
      setting_value = EXCLUDED.setting_value,
      updated_by = EXCLUDED.updated_by,
      updated_at = NOW()
    `,
    [SETTINGS_KEY, JSON.stringify(next), userId]
  );
  return next;
}

function emailGloballyEnabled() {
  return String(process.env.PROJECT_ESCALATION_EMAIL_ENABLED || 'true').toLowerCase() !== 'false';
}

function meetsMinSeverity(severity, minSeverity) {
  const sev = String(severity || 'medium').toLowerCase();
  const min = String(minSeverity || 'medium').toLowerCase();
  return (SEVERITY_RANK[sev] || 2) >= (SEVERITY_RANK[min] || 2);
}

async function listActiveUsersByRoleId(roleId) {
  const rid = Number(roleId);
  if (!Number.isFinite(rid)) return [];
  return rows(
    await pool.query(
      `SELECT userid AS "userId", email, firstname AS "firstName", lastname AS "lastName"
       FROM users
       WHERE roleid = $1
         AND COALESCE(voided, false) = false
         AND COALESCE(isactive, true) = true
         AND email IS NOT NULL
         AND TRIM(email) <> ''`,
      [rid]
    )
  );
}

async function sendToRoles(roleIds, { subject, text }) {
  if (!canSendEmail()) {
    return { attempted: 0, sent: 0, failed: [{ error: 'SMTP is not configured on the server.' }] };
  }
  const uniqueRoleIds = [...new Set((roleIds || []).map((id) => Number(id)).filter((id) => Number.isFinite(id)))];
  let attempted = 0;
  let sent = 0;
  const failed = [];
  const seenEmails = new Set();

  for (const roleId of uniqueRoleIds) {
    const recipients = await listActiveUsersByRoleId(roleId);
    for (const r of recipients) {
      const email = String(r.email || '').trim().toLowerCase();
      if (!email || seenEmails.has(email)) continue;
      seenEmails.add(email);
      attempted += 1;
      try {
        await sendWorkflowNotificationEmail({ to: r.email, subject, text });
        sent += 1;
      } catch (e) {
        failed.push({ userId: r.userId, email: r.email, error: e.message });
      }
    }
  }
  return { attempted, sent, failed };
}

async function shouldNotify({ onNew, onEscalate, severity }) {
  if (!emailGloballyEnabled() || !canSendEmail()) return null;
  const settings = await getNotificationSettings();
  if (!settings.emailEnabled) return null;
  if (!settings.roleIds.length) return null;
  if (!meetsMinSeverity(severity, settings.minSeverity)) return null;
  if (onNew && !settings.notifyOnNewSignal) return null;
  if (onEscalate && !settings.notifyOnEscalation) return null;
  return settings;
}

async function notifyNewSignal({ signalId, projectName, ruleName, severity, title, message }) {
  const settings = await shouldNotify({ onNew: true, severity });
  if (!settings) return { skipped: true };

  const subject = `[Project alert] ${title || ruleName || 'New escalation signal'}`;
  const text = [
    'Hello,',
    '',
    'A new project escalation signal was detected.',
    `Project: ${projectName || 'Unknown'}`,
    `Rule: ${ruleName || '—'}`,
    `Severity: ${severity || 'medium'}`,
    `Title: ${title || '—'}`,
    message ? `Details: ${message}` : null,
    signalId ? `Signal ID: ${signalId}` : null,
    '',
    'Please review it in the E-CIMES operations dashboard.',
  ].filter(Boolean).join('\n');

  return sendToRoles(settings.roleIds, { subject, text });
}

async function notifyEscalation({ signalId, projectName, ruleName, severity, escalationLevel, title }) {
  const settings = await shouldNotify({ onEscalate: true, severity });
  if (!settings) return { skipped: true };

  const subject = `[Project escalated] ${title || ruleName || 'Escalation level increased'}`;
  const text = [
    'Hello,',
    '',
    'A project escalation signal has been auto-escalated after SLA breach.',
    `Project: ${projectName || 'Unknown'}`,
    `Rule: ${ruleName || '—'}`,
    `Severity: ${severity || 'medium'}`,
    `Escalation level: ${escalationLevel}`,
    signalId ? `Signal ID: ${signalId}` : null,
    '',
    'Please review and act on it as soon as possible.',
  ].filter(Boolean).join('\n');

  return sendToRoles(settings.roleIds, { subject, text });
}

module.exports = {
  getNotificationSettings,
  updateNotificationSettings,
  notifyNewSignal,
  notifyEscalation,
  emailGloballyEnabled,
};
