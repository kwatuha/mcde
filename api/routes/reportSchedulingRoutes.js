const express = require('express');
const pool = require('../config/db');
const {
  ensureReportSchedulingTables,
  computeNextRunAt,
  executeSchedule,
} = require('../services/reportSchedulingService');

const router = express.Router();
const ALLOWED_REPORT_TYPES = new Set([
  'monitoring_visits_summary',
  'monitoring_visits_by_template',
  'monitoring_visits_by_project',
]);
const ALLOWED_FREQUENCIES = new Set(['daily', 'weekly', 'monthly']);
const ALLOWED_REPORT_FORMATS = new Set(['csv', 'pdf']);

function userIdFromReq(req) {
  return req.user?.id ?? req.user?.userId ?? null;
}

function rowToSchedule(row) {
  return {
    scheduleId: row.schedule_id,
    name: row.name,
    reportType: row.report_type,
    frequency: row.frequency,
    dayOfWeek: row.day_of_week,
    dayOfMonth: row.day_of_month,
    timeOfDay: row.time_of_day,
    reportFormat: row.report_format || 'csv',
    recipientUserIds: row.recipient_user_ids || [],
    filters: row.filters || {},
    isActive: row.is_active,
    nextRunAt: row.next_run_at,
    lastRunAt: row.last_run_at,
    lastSuccessAt: row.last_success_at,
    lastError: row.last_error,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizePayload(body = {}) {
  const reportType = String(body.reportType || '').trim();
  const frequency = String(body.frequency || 'weekly').trim().toLowerCase();
  const name = String(body.name || '').trim();
  const dayOfWeek = body.dayOfWeek != null ? Number(body.dayOfWeek) : null;
  const dayOfMonth = body.dayOfMonth != null ? Number(body.dayOfMonth) : null;
  const timeOfDay = String(body.timeOfDay || '08:00').trim();
  const reportFormat = String(body.reportFormat || 'csv').trim().toLowerCase();
  const recipientUserIds = Array.isArray(body.recipientUserIds)
    ? body.recipientUserIds.map((x) => Number(x)).filter((x) => Number.isFinite(x))
    : [];
  const filters = body.filters && typeof body.filters === 'object' ? body.filters : {};
  const isActive = body.isActive !== undefined ? !!body.isActive : true;
  return {
    name,
    reportType,
    frequency,
    dayOfWeek: Number.isFinite(dayOfWeek) ? dayOfWeek : null,
    dayOfMonth: Number.isFinite(dayOfMonth) ? dayOfMonth : null,
    timeOfDay,
    reportFormat,
    recipientUserIds,
    filters,
    isActive,
  };
}

router.get('/', async (_req, res) => {
  try {
    await ensureReportSchedulingTables();
    const q = await pool.query(
      `
      SELECT *
      FROM report_schedules
      WHERE COALESCE(voided, false) = false
      ORDER BY created_at DESC, schedule_id DESC
      LIMIT 500
      `
    );
    return res.json((q.rows || []).map(rowToSchedule));
  } catch (e) {
    return res.status(500).json({ message: 'Failed to list report schedules.', details: e.message });
  }
});

router.post('/', async (req, res) => {
  try {
    await ensureReportSchedulingTables();
    const payload = normalizePayload(req.body || {});
    if (!payload.name) return res.status(400).json({ message: 'name is required.' });
    if (!ALLOWED_REPORT_TYPES.has(payload.reportType)) {
      return res.status(400).json({ message: `Unsupported reportType. Allowed: ${[...ALLOWED_REPORT_TYPES].join(', ')}` });
    }
    if (!ALLOWED_FREQUENCIES.has(payload.frequency)) {
      return res.status(400).json({ message: `Unsupported frequency. Allowed: ${[...ALLOWED_FREQUENCIES].join(', ')}` });
    }
    if (!ALLOWED_REPORT_FORMATS.has(payload.reportFormat)) {
      return res.status(400).json({ message: `Unsupported reportFormat. Allowed: ${[...ALLOWED_REPORT_FORMATS].join(', ')}` });
    }
    if (!payload.recipientUserIds.length) return res.status(400).json({ message: 'Select at least one recipient user.' });
    const nextRunAt = computeNextRunAt(payload, new Date());
    const createdBy = userIdFromReq(req);
    const q = await pool.query(
      `
      INSERT INTO report_schedules
        (name, report_type, frequency, day_of_week, day_of_month, time_of_day, report_format,
         recipient_user_ids, filters, is_active, next_run_at, created_by, created_at, updated_at, voided)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10, $11, $12, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, false)
      RETURNING *
      `,
      [
        payload.name,
        payload.reportType,
        payload.frequency,
        payload.dayOfWeek,
        payload.dayOfMonth,
        payload.timeOfDay,
        payload.reportFormat,
        JSON.stringify(payload.recipientUserIds),
        JSON.stringify(payload.filters || {}),
        payload.isActive,
        nextRunAt,
        createdBy,
      ]
    );
    return res.status(201).json(rowToSchedule(q.rows[0]));
  } catch (e) {
    return res.status(500).json({ message: 'Failed to create report schedule.', details: e.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    await ensureReportSchedulingTables();
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid schedule id.' });
    const cur = await pool.query(
      `SELECT * FROM report_schedules WHERE schedule_id = $1 AND COALESCE(voided, false) = false`,
      [id]
    );
    const existing = cur.rows?.[0];
    if (!existing) return res.status(404).json({ message: 'Schedule not found.' });

    const incoming = normalizePayload(req.body || {});
    const payload = {
      name: incoming.name || existing.name,
      reportType: incoming.reportType || existing.report_type,
      frequency: incoming.frequency || existing.frequency,
      dayOfWeek: incoming.dayOfWeek != null ? incoming.dayOfWeek : existing.day_of_week,
      dayOfMonth: incoming.dayOfMonth != null ? incoming.dayOfMonth : existing.day_of_month,
      timeOfDay: incoming.timeOfDay || existing.time_of_day,
      reportFormat: incoming.reportFormat || existing.report_format || 'csv',
      recipientUserIds: incoming.recipientUserIds.length ? incoming.recipientUserIds : existing.recipient_user_ids || [],
      filters: Object.keys(incoming.filters || {}).length ? incoming.filters : existing.filters || {},
      isActive: req.body?.isActive !== undefined ? !!req.body.isActive : existing.is_active,
    };
    if (!ALLOWED_REPORT_TYPES.has(payload.reportType)) {
      return res.status(400).json({ message: `Unsupported reportType. Allowed: ${[...ALLOWED_REPORT_TYPES].join(', ')}` });
    }
    if (!ALLOWED_FREQUENCIES.has(payload.frequency)) {
      return res.status(400).json({ message: `Unsupported frequency. Allowed: ${[...ALLOWED_FREQUENCIES].join(', ')}` });
    }
    if (!ALLOWED_REPORT_FORMATS.has(payload.reportFormat)) {
      return res.status(400).json({ message: `Unsupported reportFormat. Allowed: ${[...ALLOWED_REPORT_FORMATS].join(', ')}` });
    }
    if (!payload.recipientUserIds.length) return res.status(400).json({ message: 'Select at least one recipient user.' });

    const nextRunAt = computeNextRunAt(payload, new Date());
    const q = await pool.query(
      `
      UPDATE report_schedules
      SET name = $1,
          report_type = $2,
          frequency = $3,
          day_of_week = $4,
          day_of_month = $5,
          time_of_day = $6,
          report_format = $7,
          recipient_user_ids = $8::jsonb,
          filters = $9::jsonb,
          is_active = $10,
          next_run_at = $11,
          updated_at = CURRENT_TIMESTAMP
      WHERE schedule_id = $12 AND COALESCE(voided, false) = false
      RETURNING *
      `,
      [
        payload.name,
        payload.reportType,
        payload.frequency,
        payload.dayOfWeek,
        payload.dayOfMonth,
        payload.timeOfDay,
        payload.reportFormat,
        JSON.stringify(payload.recipientUserIds),
        JSON.stringify(payload.filters || {}),
        payload.isActive,
        nextRunAt,
        id,
      ]
    );
    return res.json(rowToSchedule(q.rows[0]));
  } catch (e) {
    return res.status(500).json({ message: 'Failed to update report schedule.', details: e.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await ensureReportSchedulingTables();
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid schedule id.' });
    const q = await pool.query(
      `
      UPDATE report_schedules
      SET voided = true, is_active = false, updated_at = CURRENT_TIMESTAMP
      WHERE schedule_id = $1 AND COALESCE(voided, false) = false
      RETURNING schedule_id
      `,
      [id]
    );
    if (!q.rows?.[0]) return res.status(404).json({ message: 'Schedule not found.' });
    return res.json({ ok: true, scheduleId: id });
  } catch (e) {
    return res.status(500).json({ message: 'Failed to delete report schedule.', details: e.message });
  }
});

router.post('/:id/run-now', async (req, res) => {
  try {
    await ensureReportSchedulingTables();
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid schedule id.' });
    const q = await pool.query(
      `
      SELECT *
      FROM report_schedules
      WHERE schedule_id = $1 AND COALESCE(voided, false) = false
      `,
      [id]
    );
    const row = q.rows?.[0];
    if (!row) return res.status(404).json({ message: 'Schedule not found.' });
    await executeSchedule(row, { manual: true });
    return res.json({ ok: true, scheduleId: id, message: 'Run triggered.' });
  } catch (e) {
    return res.status(500).json({ message: 'Failed to run report schedule.', details: e.message });
  }
});

router.get('/:id/runs', async (req, res) => {
  try {
    await ensureReportSchedulingTables();
    const id = Number(req.params.id);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));
    if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid schedule id.' });
    const q = await pool.query(
      `
      SELECT run_id, schedule_id, run_status, detail, created_at
      FROM report_schedule_runs
      WHERE schedule_id = $1
      ORDER BY created_at DESC, run_id DESC
      LIMIT $2
      `,
      [id, limit]
    );
    return res.json(
      (q.rows || []).map((r) => ({
        runId: r.run_id,
        scheduleId: r.schedule_id,
        runStatus: r.run_status,
        detail: r.detail || {},
        createdAt: r.created_at,
      }))
    );
  } catch (e) {
    return res.status(500).json({ message: 'Failed to fetch run details.', details: e.message });
  }
});

module.exports = router;
