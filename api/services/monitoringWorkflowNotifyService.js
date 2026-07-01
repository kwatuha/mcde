/**
 * Email notifications for village monitoring workflow transitions.
 */
const pool = require('../config/db');
const { canSendEmail, sendWorkflowNotificationEmail } = require('./accountEmailService');

function emailEnabled() {
  return String(process.env.MONITORING_WORKFLOW_EMAIL_ENABLED || 'true').toLowerCase() !== 'false';
}

function normalizeRole(name) {
  return String(name || '').trim().toLowerCase().replace(/[_-]+/g, ' ');
}

async function getRoleIdByName(roleName) {
  const r = await pool.query(
    `SELECT roleid FROM roles WHERE lower(trim(name)) = $1 AND COALESCE(voided, false) = false LIMIT 1`,
    [normalizeRole(roleName)]
  );
  return r.rows?.[0]?.roleid ?? null;
}

async function listActiveUsersByRoleId(roleId) {
  const rid = Number(roleId);
  if (!Number.isFinite(rid)) return [];
  const r = await pool.query(
    `SELECT userid AS "userId", email, firstname AS "firstName", lastname AS "lastName"
     FROM users
     WHERE roleid = $1
       AND COALESCE(voided, false) = false
       AND COALESCE(isactive, true) = true
       AND email IS NOT NULL
       AND TRIM(email) <> ''`,
    [rid]
  );
  return r.rows || [];
}

async function sendToRole(roleName, { subject, text }) {
  if (!emailEnabled() || !canSendEmail()) return { skipped: true };
  const roleId = await getRoleIdByName(roleName);
  if (!roleId) return { skipped: true, reason: 'role not found' };
  const recipients = await listActiveUsersByRoleId(roleId);
  let sent = 0;
  const failed = [];
  const seen = new Set();
  for (const u of recipients) {
    const email = String(u.email || '').trim().toLowerCase();
    if (!email || seen.has(email)) continue;
    seen.add(email);
    try {
      await sendWorkflowNotificationEmail({ to: u.email, subject, text });
      sent += 1;
    } catch (e) {
      failed.push({ email: u.email, error: e.message });
    }
  }
  return { sent, failed };
}

async function sendToUser(userId, { subject, text }) {
  if (!emailEnabled() || !canSendEmail()) return { skipped: true };
  const uid = Number(userId);
  if (!Number.isFinite(uid)) return { skipped: true };
  const r = await pool.query(
    `SELECT email FROM users WHERE userid = $1 AND COALESCE(voided, false) = false LIMIT 1`,
    [uid]
  );
  const email = r.rows?.[0]?.email;
  if (!email) return { skipped: true };
  try {
    await sendWorkflowNotificationEmail({ to: email, subject, text });
    return { sent: 1 };
  } catch (e) {
    return { sent: 0, failed: [{ email, error: e.message }] };
  }
}

function reportRef(report) {
  const project = report.projectName ? `${report.projectName} (#${report.projectId})` : `Project #${report.projectId}`;
  return `${report.title || 'Monitoring visit'} — ${project} — ${report.village || 'village n/a'}, ${report.ward || 'ward n/a'}`;
}

function progressLine(report) {
  if (!report.progressStatus) return '';
  const label = String(report.progressStatus).replace(/_/g, ' ');
  return `Progress status: ${label}`;
}

async function notifySubmittedToWard(report) {
  if (!report) return;
  const ref = reportRef(report);
  await sendToRole('Ward Administrator', {
    subject: `[Monitoring visit] Ward review needed — ${report.title || ref}`,
    text: [
      'Hello,',
      '',
      'A village monitoring visit has been submitted and needs your review.',
      `Report: ${ref}`,
      progressLine(report),
      `Visit date: ${report.visitDate || 'n/a'}`,
      '',
      'Open Monitoring → Village monitoring workflow to revise and forward to sub-county.',
    ].filter(Boolean).join('\n'),
  });
}

async function notifyForwardedToSubcounty(report) {
  if (!report) return;
  const ref = reportRef(report);
  await sendToRole('Sub-County Administrator', {
    subject: `[Monitoring visit] Sub-county review — ${report.title || ref}`,
    text: [
      'Hello,',
      '',
      'A monitoring report has been forwarded by the ward administrator.',
      `Report: ${ref}`,
      progressLine(report),
      report.reviewComment ? `Ward comment: ${report.reviewComment}` : null,
      '',
      'Open Monitoring → Village monitoring workflow to return to ward or forward to the Chief Officer.',
    ].filter(Boolean).join('\n'),
  });
}

async function notifyReturnedToWard(report) {
  if (!report) return;
  const ref = reportRef(report);
  const subject = `[Monitoring visit] Returned for revision — ${report.title || ref}`;
  const text = [
    'Hello,',
    '',
    'A monitoring report was returned by the Sub-County Administrator and needs revision.',
    `Report: ${ref}`,
    `Comment: ${report.reviewComment || 'No comment provided.'}`,
    '',
    'Open Monitoring → Village monitoring workflow to revise and resubmit.',
  ].join('\n');
  await sendToRole('Ward Administrator', { subject, text });
  if (report.createdBy) await sendToUser(report.createdBy, { subject, text });
}

async function notifyForwardedToChief(report) {
  if (!report) return;
  const ref = reportRef(report);
  await sendToRole('Department Chief Officer', {
    subject: `[Monitoring visit] Chief approval needed — ${report.title || ref}`,
    text: [
      'Hello,',
      '',
      'A monitoring report has been approved at sub-county level and awaits your final approval.',
      `Report: ${ref}`,
      progressLine(report),
      '',
      'Final approval will publish the linked project on the citizen dashboard.',
      'Open Monitoring → Village monitoring workflow.',
    ].filter(Boolean).join('\n'),
  });
}

async function notifyChiefApproved(report) {
  if (!report) return;
  const ref = reportRef(report);
  const subject = `[Monitoring visit] Approved & published — ${report.title || ref}`;
  const text = [
    'Hello,',
    '',
    'A monitoring report received final approval and the linked project is now publicly visible.',
    `Report: ${ref}`,
    '',
    'Thank you for your contribution to county monitoring.',
  ].join('\n');
  if (report.createdBy) await sendToUser(report.createdBy, { subject, text });
  await sendToRole('Ward Administrator', { subject, text });
}

module.exports = {
  notifySubmittedToWard,
  notifyForwardedToSubcounty,
  notifyReturnedToWard,
  notifyForwardedToChief,
  notifyChiefApproved,
};
