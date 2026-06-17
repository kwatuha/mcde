const pool = require('../config/db');
const orgScope = require('./organizationScopeService');
const { isSuperAdminRequester } = require('../utils/roleUtils');
const { canSendEmail, sendWorkflowNotificationEmail } = require('./accountEmailService');

const DB_TYPE = process.env.DB_TYPE || 'postgresql';
const isPostgres = DB_TYPE === 'postgresql';

let schemaEnsured = false;

function getUserId(user) {
    const value = user?.id ?? user?.userId ?? user?.userid ?? user?.actualUserId ?? null;
    return value != null && Number.isFinite(Number(value)) ? Number(value) : null;
}

function cleanText(value) {
    return String(value || '').trim();
}

function normalizeRole(role) {
    return String(role || '').trim().toLowerCase().replace(/[_-]+/g, ' ');
}

function userHasPrivilege(user, privilege) {
    if (!privilege) return false;
    if (isSuperAdminRequester(user)) return true;
    return Array.isArray(user?.privileges) && user.privileges.includes(privilege);
}

function isWardAdminLike(user) {
    if (userHasPrivilege(user, 'pmc_report.submit')) return true;
    const role = normalizeRole(user?.roleName || user?.role);
    return role.includes('ward administrator') || role.includes('ward admin');
}

function isSubCountyAdminLike(user) {
    if (userHasPrivilege(user, 'pmc_report.review')) return true;
    const role = normalizeRole(user?.roleName || user?.role);
    return role.includes('sub county administrator') || role.includes('subcounty administrator') || role.includes('sub county admin');
}

async function ensurePmcReportSchema() {
    if (schemaEnsured) return;
    if (!isPostgres) {
        throw new Error('PMC ward reports require PostgreSQL.');
    }
    await pool.query(`
        CREATE TABLE IF NOT EXISTS pmc_ward_reports (
            report_id BIGSERIAL PRIMARY KEY,
            project_id BIGINT NOT NULL,
            reporting_period TEXT NOT NULL,
            report_title TEXT NOT NULL,
            summary TEXT NULL,
            progress_notes TEXT NULL,
            challenges TEXT NULL,
            recommendations TEXT NULL,
            subcounty TEXT NULL,
            ward TEXT NULL,
            status TEXT NOT NULL DEFAULT 'draft',
            signed_file_name TEXT NULL,
            signed_file_path TEXT NULL,
            signed_mime_type TEXT NULL,
            signed_file_size BIGINT NULL,
            created_by BIGINT NULL,
            submitted_by BIGINT NULL,
            submitted_at TIMESTAMPTZ NULL,
            reviewed_by BIGINT NULL,
            reviewed_at TIMESTAMPTZ NULL,
            review_comment TEXT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            voided BOOLEAN NOT NULL DEFAULT FALSE
        )
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS idx_pmc_ward_reports_project ON pmc_ward_reports (project_id) WHERE voided = false');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_pmc_ward_reports_status ON pmc_ward_reports (status) WHERE voided = false');
    schemaEnsured = true;
}

async function addProjectScopeWhere(user, where, params, alias = 'p') {
    const authUserId = getUserId(user);
    if (!authUserId) {
        where.push('FALSE');
        return;
    }
    if (isSuperAdminRequester(user) || orgScope.userHasOrganizationBypass(user?.privileges || [])) return;
    if (!(await orgScope.organizationScopeTableExists())) {
        where.push('FALSE');
        return;
    }
    const hasProjectScopes = await orgScope.userHasProjectAccessScopeContext(authUserId);
    if (!hasProjectScopes) return;

    let nextIndex = params.length + 1;
    const rawScopeFragment = orgScope.buildExplicitProjectScopeFragment(alias);
    const scopeParams = orgScope.explicitProjectScopeParams(authUserId);
    const scopeFragment = rawScopeFragment.replace(/\?/g, () => `$${nextIndex++}`);
    where.push(scopeFragment);
    params.push(...scopeParams);
}

async function fetchProjectLocation(projectId, user) {
    const id = Number(projectId);
    if (!Number.isFinite(id)) return null;
    const where = ['p.project_id = $1', 'COALESCE(p.voided, false) = false'];
    const params = [id];
    await addProjectScopeWhere(user, where, params, 'p');
    const result = await pool.query(
        `
        SELECT
            p.project_id AS "projectId",
            p.name AS "projectName",
            COALESCE(NULLIF(TRIM(p.location->>'subcounty'), ''), '') AS subcounty,
            COALESCE(NULLIF(TRIM(p.location->>'ward'), ''), '') AS ward
        FROM projects p
        WHERE ${where.join(' AND ')}
        LIMIT 1
        `,
        params
    );
    return result.rows?.[0] || null;
}

function mapReportRow(row) {
    if (!row) return null;
    return {
        reportId: row.reportId,
        projectId: row.projectId,
        projectName: row.projectName,
        projectCode: row.projectCode,
        reportingPeriod: row.reportingPeriod,
        reportTitle: row.reportTitle,
        summary: row.summary,
        progressNotes: row.progressNotes,
        challenges: row.challenges,
        recommendations: row.recommendations,
        subcounty: row.subcounty,
        ward: row.ward,
        status: row.status,
        signedFileName: row.signedFileName,
        hasSignedFile: Boolean(row.signedFileName),
        signedMimeType: row.signedMimeType,
        signedFileSize: row.signedFileSize,
        createdBy: row.createdBy,
        createdByName: row.createdByName,
        submittedBy: row.submittedBy,
        submittedByName: row.submittedByName,
        submittedAt: row.submittedAt,
        reviewedBy: row.reviewedBy,
        reviewedByName: row.reviewedByName,
        reviewedAt: row.reviewedAt,
        reviewComment: row.reviewComment,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
    };
}

const reportSelectSql = `
    SELECT
        r.report_id AS "reportId",
        r.project_id AS "projectId",
        p.name AS "projectName",
        COALESCE(NULLIF(p.data_sources->>'project_ref_num', ''), 'PRJ-' || LPAD(p.project_id::text, 4, '0')) AS "projectCode",
        r.reporting_period AS "reportingPeriod",
        r.report_title AS "reportTitle",
        r.summary,
        r.progress_notes AS "progressNotes",
        r.challenges,
        r.recommendations,
        r.subcounty,
        r.ward,
        r.status,
        r.signed_file_name AS "signedFileName",
        r.signed_mime_type AS "signedMimeType",
        r.signed_file_size AS "signedFileSize",
        r.created_by AS "createdBy",
        COALESCE(NULLIF(TRIM(CONCAT_WS(' ', cb.firstname, cb.lastname)), ''), cb.username, 'Unknown') AS "createdByName",
        r.submitted_by AS "submittedBy",
        COALESCE(NULLIF(TRIM(CONCAT_WS(' ', sb.firstname, sb.lastname)), ''), sb.username, NULL) AS "submittedByName",
        r.submitted_at AS "submittedAt",
        r.reviewed_by AS "reviewedBy",
        COALESCE(NULLIF(TRIM(CONCAT_WS(' ', rb.firstname, rb.lastname)), ''), rb.username, NULL) AS "reviewedByName",
        r.reviewed_at AS "reviewedAt",
        r.review_comment AS "reviewComment",
        r.created_at AS "createdAt",
        r.updated_at AS "updatedAt"
    FROM pmc_ward_reports r
    INNER JOIN projects p ON p.project_id = r.project_id
    LEFT JOIN users cb ON cb.userid = r.created_by
    LEFT JOIN users sb ON sb.userid = r.submitted_by
    LEFT JOIN users rb ON rb.userid = r.reviewed_by
`;

async function listReports(user, filters = {}) {
    await ensurePmcReportSchema();
    const params = [];
    const where = ['COALESCE(r.voided, false) = false', 'COALESCE(p.voided, false) = false'];

    if (filters.status) {
        params.push(String(filters.status));
        where.push(`r.status = $${params.length}`);
    }
    if (filters.projectId) {
        params.push(Number(filters.projectId));
        where.push(`r.project_id = $${params.length}`);
    }
    if (filters.subcounty) {
        params.push(`%${cleanText(filters.subcounty)}%`);
        where.push(`r.subcounty ILIKE $${params.length}`);
    }
    if (filters.ward) {
        params.push(`%${cleanText(filters.ward)}%`);
        where.push(`r.ward ILIKE $${params.length}`);
    }
    if (filters.search) {
        params.push(`%${cleanText(filters.search)}%`);
        where.push(`(
            p.name ILIKE $${params.length}
            OR r.report_title ILIKE $${params.length}
            OR COALESCE(r.summary, '') ILIKE $${params.length}
            OR COALESCE(r.ward, '') ILIKE $${params.length}
            OR COALESCE(r.subcounty, '') ILIKE $${params.length}
        )`);
    }

    await addProjectScopeWhere(user, where, params, 'p');

    params.push(Math.min(Number(filters.limit) || 500, 2000));
    const result = await pool.query(
        `
        ${reportSelectSql}
        WHERE ${where.join(' AND ')}
        ORDER BY COALESCE(r.submitted_at, r.updated_at, r.created_at) DESC NULLS LAST, r.report_id DESC
        LIMIT $${params.length}
        `,
        params
    );
    return (result.rows || []).map(mapReportRow);
}

async function getReportById(reportId, user) {
    await ensurePmcReportSchema();
    const id = Number(reportId);
    if (!Number.isFinite(id)) return null;
    const params = [id];
    const where = ['r.report_id = $1', 'COALESCE(r.voided, false) = false', 'COALESCE(p.voided, false) = false'];
    await addProjectScopeWhere(user, where, params, 'p');
    const result = await pool.query(
        `
        ${reportSelectSql}
        WHERE ${where.join(' AND ')}
        LIMIT 1
        `,
        params
    );
    return mapReportRow(result.rows?.[0]);
}

async function getReportFileMeta(reportId, user) {
    const report = await getReportById(reportId, user);
    if (!report) return null;
    const result = await pool.query(
        `SELECT signed_file_path AS "signedFilePath", signed_file_name AS "signedFileName", signed_mime_type AS "signedMimeType"
         FROM pmc_ward_reports WHERE report_id = $1 AND COALESCE(voided, false) = false`,
        [Number(reportId)]
    );
    return result.rows?.[0] || null;
}

async function createReport(user, payload = {}) {
    await ensurePmcReportSchema();
    const projectId = Number(payload.projectId);
    const reportingPeriod = cleanText(payload.reportingPeriod);
    const reportTitle = cleanText(payload.reportTitle);
    if (!Number.isFinite(projectId) || !reportingPeriod || !reportTitle) {
        const err = new Error('projectId, reportingPeriod, and reportTitle are required.');
        err.statusCode = 400;
        throw err;
    }

    const project = await fetchProjectLocation(projectId, user);
    if (!project) {
        const err = new Error('Project not found or not accessible.');
        err.statusCode = 404;
        throw err;
    }

    const userId = getUserId(user);
    const result = await pool.query(
        `
        INSERT INTO pmc_ward_reports (
            project_id, reporting_period, report_title, summary, progress_notes, challenges, recommendations,
            subcounty, ward, status, created_by, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'draft', $10, NOW(), NOW())
        RETURNING report_id
        `,
        [
            projectId,
            reportingPeriod,
            reportTitle,
            cleanText(payload.summary) || null,
            cleanText(payload.progressNotes) || null,
            cleanText(payload.challenges) || null,
            cleanText(payload.recommendations) || null,
            cleanText(payload.subcounty) || project.subcounty || null,
            cleanText(payload.ward) || project.ward || null,
            userId,
        ]
    );
    return getReportById(result.rows?.[0]?.report_id, user);
}

async function updateReport(reportId, user, payload = {}) {
    const report = await getReportById(reportId, user);
    if (!report) {
        const err = new Error('PMC report not found.');
        err.statusCode = 404;
        throw err;
    }
    if (!['draft', 'returned'].includes(report.status)) {
        const err = new Error('Only draft or returned reports can be edited.');
        err.statusCode = 400;
        throw err;
    }
    if (!userHasPrivilege(user, 'pmc_report.update') && !isWardAdminLike(user) && getUserId(user) !== report.createdBy) {
        const err = new Error('You are not allowed to edit this report.');
        err.statusCode = 403;
        throw err;
    }

    await pool.query(
        `
        UPDATE pmc_ward_reports
        SET reporting_period = COALESCE($2, reporting_period),
            report_title = COALESCE($3, report_title),
            summary = $4,
            progress_notes = $5,
            challenges = $6,
            recommendations = $7,
            subcounty = COALESCE($8, subcounty),
            ward = COALESCE($9, ward),
            updated_at = NOW()
        WHERE report_id = $1 AND COALESCE(voided, false) = false
        `,
        [
            Number(reportId),
            cleanText(payload.reportingPeriod) || null,
            cleanText(payload.reportTitle) || null,
            cleanText(payload.summary) || null,
            cleanText(payload.progressNotes) || null,
            cleanText(payload.challenges) || null,
            cleanText(payload.recommendations) || null,
            cleanText(payload.subcounty) || null,
            cleanText(payload.ward) || null,
        ]
    );
    return getReportById(reportId, user);
}

async function attachSignedFile(reportId, user, fileMeta = {}) {
    const report = await getReportById(reportId, user);
    if (!report) {
        const err = new Error('PMC report not found.');
        err.statusCode = 404;
        throw err;
    }
    if (!['draft', 'returned'].includes(report.status)) {
        const err = new Error('Signed documents can only be uploaded for draft or returned reports.');
        err.statusCode = 400;
        throw err;
    }

    await pool.query(
        `
        UPDATE pmc_ward_reports
        SET signed_file_name = $2,
            signed_file_path = $3,
            signed_mime_type = $4,
            signed_file_size = $5,
            updated_at = NOW()
        WHERE report_id = $1
        `,
        [
            Number(reportId),
            cleanText(fileMeta.fileName) || null,
            cleanText(fileMeta.filePath) || null,
            cleanText(fileMeta.mimeType) || null,
            fileMeta.fileSize != null ? Number(fileMeta.fileSize) : null,
        ]
    );
    return getReportById(reportId, user);
}

async function submitReport(reportId, user) {
    const report = await getReportById(reportId, user);
    if (!report) {
        const err = new Error('PMC report not found.');
        err.statusCode = 404;
        throw err;
    }
    if (!isWardAdminLike(user) && !userHasPrivilege(user, 'pmc_report.submit')) {
        const err = new Error('Only Ward Administrators can submit PMC reports.');
        err.statusCode = 403;
        throw err;
    }
    if (!['draft', 'returned'].includes(report.status)) {
        const err = new Error('Only draft or returned reports can be submitted.');
        err.statusCode = 400;
        throw err;
    }
    if (!report.hasSignedFile) {
        const err = new Error('Upload the signed PMC report document before submitting.');
        err.statusCode = 400;
        throw err;
    }

    const userId = getUserId(user);
    await pool.query(
        `
        UPDATE pmc_ward_reports
        SET status = 'submitted',
            submitted_by = $2,
            submitted_at = NOW(),
            reviewed_by = NULL,
            reviewed_at = NULL,
            review_comment = NULL,
            updated_at = NOW()
        WHERE report_id = $1
        `,
        [Number(reportId), userId]
    );
    const updated = await getReportById(reportId, user);
    notifyPmcSubmitted(updated).catch((error) => {
        console.warn('[pmc_report] submit notification error:', error.message);
    });
    return updated;
}

async function approveReport(reportId, user, comment = '') {
    const report = await getReportById(reportId, user);
    if (!report) {
        const err = new Error('PMC report not found.');
        err.statusCode = 404;
        throw err;
    }
    if (!isSubCountyAdminLike(user)) {
        const err = new Error('Only Sub-County Administrators can approve PMC reports.');
        err.statusCode = 403;
        throw err;
    }
    if (report.status !== 'submitted') {
        const err = new Error('Only submitted reports can be approved.');
        err.statusCode = 400;
        throw err;
    }

    const userId = getUserId(user);
    await pool.query(
        `
        UPDATE pmc_ward_reports
        SET status = 'approved',
            reviewed_by = $2,
            reviewed_at = NOW(),
            review_comment = $3,
            updated_at = NOW()
        WHERE report_id = $1
        `,
        [Number(reportId), userId, cleanText(comment) || null]
    );
    return getReportById(reportId, user);
}

async function returnReport(reportId, user, comment = '') {
    const report = await getReportById(reportId, user);
    if (!report) {
        const err = new Error('PMC report not found.');
        err.statusCode = 404;
        throw err;
    }
    if (!isSubCountyAdminLike(user)) {
        const err = new Error('Only Sub-County Administrators can return PMC reports.');
        err.statusCode = 403;
        throw err;
    }
    if (report.status !== 'submitted') {
        const err = new Error('Only submitted reports can be returned.');
        err.statusCode = 400;
        throw err;
    }
    if (!cleanText(comment)) {
        const err = new Error('A review comment is required when returning a report.');
        err.statusCode = 400;
        throw err;
    }

    const userId = getUserId(user);
    await pool.query(
        `
        UPDATE pmc_ward_reports
        SET status = 'returned',
            reviewed_by = $2,
            reviewed_at = NOW(),
            review_comment = $3,
            updated_at = NOW()
        WHERE report_id = $1
        `,
        [Number(reportId), userId, cleanText(comment)]
    );
    const updated = await getReportById(reportId, user);
    notifyPmcReturned(updated).catch((error) => {
        console.warn('[pmc_report] return notification error:', error.message);
    });
    return updated;
}

async function getRoleIdByName(roleName) {
    const result = await pool.query(
        `SELECT roleid FROM roles WHERE lower(trim(name)) = $1 AND COALESCE(voided, false) = false LIMIT 1`,
        [normalizeRole(roleName)]
    );
    return result.rows?.[0]?.roleid ?? null;
}

async function listActiveUsersByRoleId(roleId) {
    const rid = Number(roleId);
    if (!Number.isFinite(rid)) return [];
    const result = await pool.query(
        `SELECT userid AS "userId", email, firstname AS "firstName", lastname AS "lastName"
         FROM users
         WHERE roleid = $1
           AND COALESCE(voided, false) = false
           AND COALESCE(isactive, true) = true
           AND email IS NOT NULL
           AND TRIM(email) <> ''`,
        [rid]
    );
    return result.rows || [];
}

async function sendRoleNotificationEmails(roleId, { subject, text }) {
    if (!canSendEmail()) {
        return { attempted: 0, sent: 0, failed: [{ error: 'SMTP is not configured on the server.' }] };
    }
    const recipients = await listActiveUsersByRoleId(roleId);
    let sent = 0;
    const failed = [];
    for (const recipient of recipients) {
        try {
            await sendWorkflowNotificationEmail({ to: recipient.email, subject, text });
            sent += 1;
        } catch (error) {
            failed.push({ userId: recipient.userId, email: recipient.email, error: error.message });
        }
    }
    return { attempted: recipients.length, sent, failed };
}

async function sendUserNotificationEmail(userId, { subject, text }) {
    if (!canSendEmail() || !userId) {
        return { sent: 0, failed: [{ error: 'SMTP is not configured or user is missing.' }] };
    }
    const result = await pool.query(
        `SELECT email FROM users
         WHERE userid = $1 AND COALESCE(voided, false) = false
           AND COALESCE(isactive, true) = true
           AND email IS NOT NULL AND TRIM(email) <> ''
         LIMIT 1`,
        [Number(userId)]
    );
    const email = result.rows?.[0]?.email;
    if (!email) return { sent: 0, failed: [{ error: 'User email not found.' }] };
    try {
        await sendWorkflowNotificationEmail({ to: email, subject, text });
        return { sent: 1, failed: [] };
    } catch (error) {
        return { sent: 0, failed: [{ email, error: error.message }] };
    }
}

function buildPmcReportReference(report) {
    const project = report.projectName ? `${report.projectName} (#${report.projectId})` : `Project #${report.projectId}`;
    return `${report.reportTitle || 'PMC report'} — ${project} — ${report.ward || 'ward n/a'}, ${report.subcounty || 'sub-county n/a'}`;
}

async function notifyPmcSubmitted(report) {
    if (!report) return;
    const ref = buildPmcReportReference(report);
    const roleId = await getRoleIdByName('Sub-County Administrator');
    if (!roleId) return;
    const text = [
        'Hello,',
        '',
        'A signed PMC ward report has been submitted and is awaiting your review.',
        `Report: ${ref}`,
        `Reporting period: ${report.reportingPeriod || 'n/a'}`,
        `Submitted at: ${report.submittedAt ? new Date(report.submittedAt).toISOString() : new Date().toISOString()}`,
        '',
        'Please sign in to the M&E system and open Monitoring → PMC Ward Reports to approve or return it.',
    ].join('\n');
    const result = await sendRoleNotificationEmails(roleId, {
        subject: `[PMC Report Submitted] ${report.reportTitle || ref}`,
        text,
    });
    if (result.failed?.length) {
        console.warn('[pmc_report] submit notification failures:', result.failed);
    }
}

async function notifyPmcReturned(report) {
    if (!report) return;
    const ref = buildPmcReportReference(report);
    const text = [
        'Hello,',
        '',
        'Your PMC ward report has been returned by the Sub-County Administrator and needs revision.',
        `Report: ${ref}`,
        `Review comment: ${report.reviewComment || 'No comment provided.'}`,
        '',
        'Please sign in, update the report, re-upload the signed document if needed, and resubmit.',
    ].join('\n');
    const subject = `[PMC Report Returned] ${report.reportTitle || ref}`;
    const notifyUserIds = [report.createdBy, report.submittedBy].filter((id, index, arr) => id && arr.indexOf(id) === index);
    for (const userId of notifyUserIds) {
        const direct = await sendUserNotificationEmail(userId, { subject, text });
        if (direct.failed?.length) {
            console.warn('[pmc_report] return notification failure for user', userId, direct.failed);
        }
    }
    const wardRoleId = await getRoleIdByName('Ward Administrator');
    if (wardRoleId) {
        const roleResult = await sendRoleNotificationEmails(wardRoleId, { subject, text });
        if (roleResult.failed?.length) {
            console.warn('[pmc_report] return role notification failures:', roleResult.failed);
        }
    }
}

async function voidReport(reportId, user) {
    const report = await getReportById(reportId, user);
    if (!report) {
        const err = new Error('PMC report not found.');
        err.statusCode = 404;
        throw err;
    }
    if (!['draft', 'returned'].includes(report.status)) {
        const err = new Error('Only draft or returned reports can be deleted.');
        err.statusCode = 400;
        throw err;
    }
    await pool.query(
        `UPDATE pmc_ward_reports SET voided = true, updated_at = NOW() WHERE report_id = $1`,
        [Number(reportId)]
    );
    return { success: true };
}

module.exports = {
    ensurePmcReportSchema,
    listReports,
    getReportById,
    getReportFileMeta,
    createReport,
    updateReport,
    attachSignedFile,
    submitReport,
    approveReport,
    returnReport,
    voidReport,
    isWardAdminLike,
    isSubCountyAdminLike,
};
