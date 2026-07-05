/**
 * Persisted SLA monitor settings for generic approval workflows.
 * Stored in system_settings; env vars remain fallbacks when not saved in the UI.
 */
const pool = require('../config/db');

const SETTINGS_KEY = 'approval_escalation_monitor';

const DEFAULT_WARNING_HOURS = 4;
const DEFAULT_MONITOR_INTERVAL_MS = 60000;
const MIN_MONITOR_INTERVAL_MS = 5000;
const MAX_WARNING_HOURS = 168;
const MAX_MONITOR_INTERVAL_MS = 3600000;

function rows(r) {
  return r?.rows || [];
}

function first(r) {
  return rows(r)[0] || null;
}

function envWarningHours() {
  const raw = Number(process.env.APPROVAL_ESCALATION_WARNING_HOURS);
  if (!Number.isFinite(raw) || raw <= 0) return null;
  return Math.min(Math.round(raw), MAX_WARNING_HOURS);
}

function envMonitorIntervalMs() {
  const raw = Number(process.env.APPROVAL_ESCALATION_MONITOR_INTERVAL_MS);
  if (!Number.isFinite(raw) || raw < MIN_MONITOR_INTERVAL_MS) return null;
  return Math.min(Math.round(raw), MAX_MONITOR_INTERVAL_MS);
}

function clampWarningHours(value) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_WARNING_HOURS;
  return Math.min(n, MAX_WARNING_HOURS);
}

function clampMonitorIntervalMs(value) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n) || n < MIN_MONITOR_INTERVAL_MS) return DEFAULT_MONITOR_INTERVAL_MS;
  return Math.min(n, MAX_MONITOR_INTERVAL_MS);
}

function parseStoredSettings(raw) {
  if (!raw) return null;
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      warningHours: clampWarningHours(parsed.warningHours),
      monitorIntervalMs: clampMonitorIntervalMs(parsed.monitorIntervalMs),
    };
  } catch {
    return null;
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

async function readStoredSettings() {
  await ensureSettingsTable();
  const row = first(
    await pool.query(`SELECT setting_value FROM system_settings WHERE setting_key = $1 LIMIT 1`, [SETTINGS_KEY])
  );
  return parseStoredSettings(row?.setting_value);
}

function resolveEffectiveSettings(stored) {
  const warningHours = stored?.warningHours ?? envWarningHours() ?? DEFAULT_WARNING_HOURS;
  const monitorIntervalMs = stored?.monitorIntervalMs ?? envMonitorIntervalMs() ?? DEFAULT_MONITOR_INTERVAL_MS;
  return {
    warningHours,
    monitorIntervalMs,
    monitorIntervalSeconds: Math.round(monitorIntervalMs / 1000),
    savedInDatabase: Boolean(stored),
    envWarningHours: envWarningHours(),
    envMonitorIntervalMs: envMonitorIntervalMs(),
  };
}

async function getSettings() {
  const stored = await readStoredSettings();
  return resolveEffectiveSettings(stored);
}

async function getWarningHours() {
  const { warningHours } = await getSettings();
  return warningHours;
}

async function getMonitorIntervalMs() {
  const { monitorIntervalMs } = await getSettings();
  return monitorIntervalMs;
}

async function updateSettings(payload, userId = null) {
  const current = await getSettings();
  const next = {
    warningHours: payload?.warningHours != null ? clampWarningHours(payload.warningHours) : current.warningHours,
    monitorIntervalMs:
      payload?.monitorIntervalMs != null
        ? clampMonitorIntervalMs(payload.monitorIntervalMs)
        : payload?.monitorIntervalSeconds != null
          ? clampMonitorIntervalMs(Number(payload.monitorIntervalSeconds) * 1000)
          : current.monitorIntervalMs,
  };

  await ensureSettingsTable();
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

  return resolveEffectiveSettings(next);
}

module.exports = {
  DEFAULT_WARNING_HOURS,
  DEFAULT_MONITOR_INTERVAL_MS,
  MIN_MONITOR_INTERVAL_MS,
  MAX_WARNING_HOURS,
  MAX_MONITOR_INTERVAL_MS,
  getSettings,
  getWarningHours,
  getMonitorIntervalMs,
  updateSettings,
};
