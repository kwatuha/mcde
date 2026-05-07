const pool = require('../config/db');
const { sendScheduledReportEmail, canSendEmail } = require('./accountEmailService');
const PDFDocument = require('pdfkit');

let schedulerTimer = null;
let schedulerBusy = false;

function parseTimeOfDay(v) {
  const raw = String(v || '08:00').trim();
  const m = raw.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  if (!m) return { hour: 8, minute: 0, normalized: '08:00' };
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  return { hour, minute, normalized: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}` };
}

function computeNextRunAt(schedule, from = new Date()) {
  const base = new Date(from);
  const { hour, minute } = parseTimeOfDay(schedule.timeOfDay || schedule.time_of_day);
  const freq = String(schedule.frequency || 'daily').toLowerCase();
  const next = new Date(base);
  next.setSeconds(0, 0);
  next.setHours(hour, minute, 0, 0);

  if (freq === 'daily') {
    if (next <= base) next.setDate(next.getDate() + 1);
    return next;
  }
  if (freq === 'weekly') {
    const day = Number.isFinite(Number(schedule.dayOfWeek ?? schedule.day_of_week))
      ? Number(schedule.dayOfWeek ?? schedule.day_of_week)
      : 1;
    const target = ((day % 7) + 7) % 7;
    const current = next.getDay();
    let delta = target - current;
    if (delta < 0 || (delta === 0 && next <= base)) delta += 7;
    next.setDate(next.getDate() + delta);
    return next;
  }
  const dayOfMonth = Math.min(31, Math.max(1, Number(schedule.dayOfMonth ?? schedule.day_of_month) || 1));
  next.setDate(dayOfMonth);
  if (next <= base) {
    next.setMonth(next.getMonth() + 1);
    next.setDate(dayOfMonth);
  }
  while (next.getDate() !== dayOfMonth) {
    next.setDate(next.getDate() - 1);
  }
  return next;
}

function csvEscape(value) {
  const text = value == null ? '' : String(value);
  if (!/[",\n]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

function rowsToCsv(headers, rows) {
  const lines = [headers.map(csvEscape).join(',')];
  for (const row of rows) {
    lines.push(row.map(csvEscape).join(','));
  }
  return `${lines.join('\n')}\n`;
}

function buildPdfBuffer({ title, headers, rows, subtitle }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(16).text(title || 'Scheduled Report', { align: 'left' });
    doc.moveDown(0.2);
    doc.fontSize(9).fillColor('#666').text(subtitle || `Generated at ${new Date().toISOString()}`);
    doc.moveDown(0.8).fillColor('#000');

    doc.fontSize(10).text(headers.join(' | '), { underline: true });
    doc.moveDown(0.4);
    rows.forEach((r) => {
      const line = r.map((x) => (x == null ? '' : String(x))).join(' | ');
      doc.fontSize(9).text(line, { lineGap: 1 });
    });

    doc.end();
  });
}

async function fetchMonitoringVisitRows(schedule) {
  const daysBackRaw = Number(schedule?.filters?.daysBack);
  const daysBack = Number.isFinite(daysBackRaw) && daysBackRaw > 0 ? Math.min(365, daysBackRaw) : 7;
  const q = await pool.query(
    `
    SELECT s.submission_id, s.visit_date, s.project_id, t.name AS template_name, s.title, s.updated_at
    FROM data_collection_submissions s
    JOIN data_collection_templates t ON t.template_id = s.template_id
    WHERE COALESCE(s.voided, false) = false
      AND COALESCE(s.updated_at, s.created_at) >= (CURRENT_TIMESTAMP - ($1::text || ' days')::interval)
    ORDER BY COALESCE(s.visit_date, CURRENT_DATE) DESC, s.submission_id DESC
    `,
    [String(daysBack)]
  );
  return {
    daysBack,
    rows: q.rows || [],
  };
}

async function generateReportDataset(schedule) {
  const type = String(schedule.reportType || schedule.report_type || '').trim();
  const { daysBack, rows: source } = await fetchMonitoringVisitRows(schedule);
  if (type === 'monitoring_visits_summary') {
    const headers = ['Submission ID', 'Visit Date', 'Project ID', 'Template', 'Title', 'Updated At'];
    const rows = source.map((r) => [
      r.submission_id,
      r.visit_date ? String(r.visit_date).slice(0, 10) : '',
      r.project_id ?? '',
      r.template_name || '',
      r.title || '',
      r.updated_at ? new Date(r.updated_at).toISOString() : '',
    ]);
    return { reportLabel: `Monitoring visits summary (${daysBack} days)`, headers, rows };
  }
  if (type === 'monitoring_visits_by_template') {
    const map = new Map();
    for (const r of source) {
      const key = r.template_name || 'Unknown template';
      map.set(key, (map.get(key) || 0) + 1);
    }
    const rows = [...map.entries()].sort((a, b) => b[1] - a[1]).map(([template, count]) => [template, count]);
    return {
      reportLabel: `Monitoring visits by template (${daysBack} days)`,
      headers: ['Template', 'Visits'],
      rows,
    };
  }
  if (type === 'monitoring_visits_by_project') {
    const map = new Map();
    for (const r of source) {
      const key = r.project_id == null ? 'Unassigned' : `Project #${r.project_id}`;
      map.set(key, (map.get(key) || 0) + 1);
    }
    const rows = [...map.entries()].sort((a, b) => b[1] - a[1]).map(([project, count]) => [project, count]);
    return {
      reportLabel: `Monitoring visits by project (${daysBack} days)`,
      headers: ['Project', 'Visits'],
      rows,
    };
  }
  throw new Error(`Unsupported report type: ${type}`);
}

async function generateReportArtifact(schedule) {
  const format = String(schedule.reportFormat || schedule.report_format || 'csv').trim().toLowerCase();
  const dataset = await generateReportDataset(schedule);
  if (format === 'pdf') {
    const content = await buildPdfBuffer({
      title: dataset.reportLabel,
      subtitle: `Generated at ${new Date().toISOString()}`,
      headers: dataset.headers,
      rows: dataset.rows,
    });
    return {
      fileName: `${dataset.reportLabel.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'scheduled-report'}.pdf`,
      contentType: 'application/pdf',
      content,
      rowCount: dataset.rows.length,
      format: 'pdf',
      reportLabel: dataset.reportLabel,
    };
  }
  const csv = rowsToCsv(dataset.headers, dataset.rows);
  return {
    fileName: `${dataset.reportLabel.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'scheduled-report'}.csv`,
    contentType: 'text/csv',
    content: csv,
    rowCount: dataset.rows.length,
    format: 'csv',
    reportLabel: dataset.reportLabel,
  };
}

async function generateMonitoringVisitsCsv(schedule) {
  const { daysBack, rows: source } = await fetchMonitoringVisitRows(schedule);
  const headers = ['Submission ID', 'Visit Date', 'Project ID', 'Template', 'Title', 'Updated At'];
  const rows = source.map((r) => [
    r.submission_id,
    r.visit_date ? String(r.visit_date).slice(0, 10) : '',
    r.project_id ?? '',
    r.template_name || '',
    r.title || '',
    r.updated_at ? new Date(r.updated_at).toISOString() : '',
  ]);
  const csv = rowsToCsv(headers, rows);
  const fileName = `monitoring-visits-${new Date().toISOString().slice(0, 10)}.csv`;
  return { fileName, contentType: 'text/csv', content: csv, rowCount: rows.length, daysBack };
}

async function resolveRecipients(recipientUserIds) {
  const ids = (Array.isArray(recipientUserIds) ? recipientUserIds : [])
    .map((x) => Number(x))
    .filter((x) => Number.isFinite(x));
  if (!ids.length) return [];
  const q = await pool.query(
    `
    SELECT userid, email, username, firstname, lastname
    FROM users
    WHERE userid = ANY($1::int[])
      AND COALESCE(voided, false) = false
      AND COALESCE(isactive, true) = true
      AND email IS NOT NULL
      AND TRIM(email) <> ''
    `,
    [ids]
  );
  return q.rows || [];
}

async function logRun(scheduleId, status, detail) {
  await pool.query(
    `
    INSERT INTO report_schedule_runs (schedule_id, run_status, detail, created_at)
    VALUES ($1, $2, $3::jsonb, CURRENT_TIMESTAMP)
    `,
    [scheduleId, status, JSON.stringify(detail || {})]
  );
}

async function executeSchedule(schedule, { manual = false } = {}) {
  const scheduleId = Number(schedule.scheduleId || schedule.schedule_id);
  try {
    const recipients = await resolveRecipients(schedule.recipientUserIds || schedule.recipient_user_ids);
    if (!recipients.length) throw new Error('No active recipients with email were found.');
    if (!canSendEmail()) throw new Error('SMTP is not configured on the server.');

    const artifact = await generateReportArtifact(schedule);
    const subject = `[Scheduled Report] ${schedule.name || 'Report'} - ${new Date().toISOString().slice(0, 10)}`;
    const text = [
      `Hello,`,
      ``,
      `Attached is the scheduled report "${schedule.name || 'Report'}".`,
      `Report type: ${schedule.reportType || schedule.report_type}`,
      `Format: ${artifact.format || schedule.reportFormat || schedule.report_format || 'csv'}`,
      `Generated at: ${new Date().toISOString()}`,
      `Rows: ${artifact.rowCount}`,
      ``,
      `This is an automated email.`,
    ].join('\n');

    let sent = 0;
    const sentRecipients = [];
    const failed = [];
    for (const r of recipients) {
      try {
        await sendScheduledReportEmail({
          to: r.email,
          subject,
          text,
          attachments: [{ filename: artifact.fileName, content: artifact.content, contentType: artifact.contentType }],
        });
        sent += 1;
        sentRecipients.push({ userId: r.userid, email: r.email });
      } catch (e) {
        failed.push({ userId: r.userid, email: r.email, error: e.message });
      }
    }
    const nextRunAt = computeNextRunAt(schedule, new Date());
    const status = failed.length ? (sent ? 'partial' : 'failed') : 'success';
    await pool.query(
      `
      UPDATE report_schedules
      SET last_run_at = CURRENT_TIMESTAMP,
          last_success_at = CASE WHEN $2 = 'success' OR $2 = 'partial' THEN CURRENT_TIMESTAMP ELSE last_success_at END,
          last_error = CASE WHEN $2 = 'failed' THEN $3 ELSE NULL END,
          next_run_at = $4,
          updated_at = CURRENT_TIMESTAMP
      WHERE schedule_id = $1
      `,
      [scheduleId, status, failed.length ? failed.map((x) => x.error).join('; ').slice(0, 2000) : null, nextRunAt]
    );
    await logRun(scheduleId, status, {
      manual,
      sent,
      sentRecipients,
      failedCount: failed.length,
      failed,
      reportType: schedule.reportType || schedule.report_type,
      reportFormat: artifact.format || schedule.reportFormat || schedule.report_format || 'csv',
      rowCount: artifact.rowCount,
    });
  } catch (e) {
    const nextRunAt = computeNextRunAt(schedule, new Date());
    await pool.query(
      `
      UPDATE report_schedules
      SET last_run_at = CURRENT_TIMESTAMP,
          last_error = $2,
          next_run_at = $3,
          updated_at = CURRENT_TIMESTAMP
      WHERE schedule_id = $1
      `,
      [scheduleId, String(e.message || e).slice(0, 2000), nextRunAt]
    );
    await logRun(scheduleId, 'failed', { manual, error: e.message });
  }
}

async function ensureReportSchedulingTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS report_schedules (
      schedule_id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      report_type TEXT NOT NULL,
      frequency TEXT NOT NULL DEFAULT 'weekly',
      day_of_week SMALLINT NULL,
      day_of_month SMALLINT NULL,
      time_of_day TEXT NOT NULL DEFAULT '08:00',
      report_format TEXT NOT NULL DEFAULT 'csv',
      recipient_user_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
      filters JSONB NOT NULL DEFAULT '{}'::jsonb,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      next_run_at TIMESTAMP WITHOUT TIME ZONE NULL,
      last_run_at TIMESTAMP WITHOUT TIME ZONE NULL,
      last_success_at TIMESTAMP WITHOUT TIME ZONE NULL,
      last_error TEXT NULL,
      created_by INTEGER NULL,
      created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      voided BOOLEAN NOT NULL DEFAULT FALSE
    )
  `);
  await pool.query(`
    ALTER TABLE report_schedules
    ADD COLUMN IF NOT EXISTS report_format TEXT NOT NULL DEFAULT 'csv'
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS report_schedule_runs (
      run_id SERIAL PRIMARY KEY,
      schedule_id INTEGER NOT NULL REFERENCES report_schedules(schedule_id) ON DELETE CASCADE,
      run_status TEXT NOT NULL,
      detail JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_report_schedules_due
    ON report_schedules (next_run_at)
    WHERE COALESCE(voided, false) = false AND COALESCE(is_active, true) = true
  `);
}

async function runDueSchedules() {
  if (schedulerBusy) return;
  schedulerBusy = true;
  try {
    await ensureReportSchedulingTables();
    const q = await pool.query(
      `
      SELECT *
      FROM report_schedules
      WHERE COALESCE(voided, false) = false
        AND COALESCE(is_active, true) = true
        AND next_run_at IS NOT NULL
        AND next_run_at <= CURRENT_TIMESTAMP
      ORDER BY next_run_at ASC
      LIMIT 20
      `
    );
    for (const row of q.rows || []) {
      await executeSchedule(row, { manual: false });
    }
  } catch (e) {
    console.error('report scheduler loop failed:', e);
  } finally {
    schedulerBusy = false;
  }
}

function startReportScheduler() {
  if (schedulerTimer) return;
  schedulerTimer = setInterval(runDueSchedules, 60 * 1000);
  runDueSchedules().catch(() => {});
}

function stopReportScheduler() {
  if (schedulerTimer) clearInterval(schedulerTimer);
  schedulerTimer = null;
}

module.exports = {
  ensureReportSchedulingTables,
  computeNextRunAt,
  executeSchedule,
  startReportScheduler,
  stopReportScheduler,
};
