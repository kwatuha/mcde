/**
 * Village monitoring workflow: Village → Ward (edit+track) → Subcounty (return/forward) → Chief → public.
 */
const fs = require('fs');
const path = require('path');
const pool = require('../config/db');
const orgScope = require('./organizationScopeService');
const { isSuperAdminRequester } = require('../utils/roleUtils');
const notify = require('./monitoringWorkflowNotifyService');
const { ensureDataCollectionSubmissionsTable } = require('./dataCollectionSchema');
const { canUserAccessTemplate } = require('./dataCollectionAccessService');
const { extractProgressStatus, normalizeAnswersForDisplay } = require('./checklistAnswerUtils');
const {
  snapshotContent,
  diffSubmissionContent,
  computeWardChangesFromBaseline,
} = require('./monitoringChangeUtils');

const DB_TYPE = process.env.DB_TYPE || 'postgresql';
const isPostgres = DB_TYPE === 'postgresql';

const WORKFLOW_STATUS = {
  DRAFT: 'draft',
  PENDING_WARD: 'pending_ward',
  PENDING_SUBCOUNTY: 'pending_subcounty',
  RETURNED_TO_WARD: 'returned_to_ward',
  PENDING_CHIEF: 'pending_chief',
  APPROVED: 'approved',
};

const VALID_PROGRESS_STATUSES = new Set(['on_track', 'delayed', 'stalled', 'completed']);

function assertProgressStatusForSubmit(submission) {
  if (!VALID_PROGRESS_STATUSES.has(String(submission?.progressStatus || '').trim())) {
    const err = new Error('Physical progress status is required before submitting to the ward.');
    err.statusCode = 400;
    throw err;
  }
}
const VILLAGE_EDITABLE = new Set([WORKFLOW_STATUS.DRAFT]);
const WARD_EDITABLE = new Set([WORKFLOW_STATUS.PENDING_WARD, WORKFLOW_STATUS.RETURNED_TO_WARD]);

let schemaEnsured = false;

function rows(r) {
  return r?.rows || [];
}

function first(r) {
  return rows(r)[0] || null;
}

function getUserId(user) {
  const value = user?.id ?? user?.userId ?? user?.userid ?? null;
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

function isVillageAdminLike(user) {
  if (userHasPrivilege(user, 'monitoring_report.submit') || userHasPrivilege(user, 'monitoring_report.create')) return true;
  const role = normalizeRole(user?.roleName || user?.role);
  return role.includes('village administrator') || role.includes('village admin');
}

function isWardAdminLike(user) {
  if (userHasPrivilege(user, 'monitoring_report.ward_review')) return true;
  const role = normalizeRole(user?.roleName || user?.role);
  return role.includes('ward administrator') || role.includes('ward admin');
}

function isSubCountyAdminLike(user) {
  if (userHasPrivilege(user, 'monitoring_report.subcounty_review')) return true;
  const role = normalizeRole(user?.roleName || user?.role);
  return role.includes('sub county administrator') || role.includes('subcounty administrator');
}

function isChiefOfficerLike(user) {
  if (userHasPrivilege(user, 'monitoring_report.chief_approve')) return true;
  const role = normalizeRole(user?.roleName || user?.role);
  return role.includes('chief officer') || role.includes('department chief officer');
}

function getUiProfileLandingPath(user) {
  const profile = user?.uiProfile || user?.ui_profile || null;
  let path = String(profile?.landingPath ?? profile?.landing_path ?? '').trim();
  if (!path) return '';
  if (!path.startsWith('/')) path = `/${path}`;
  return path.split('?')[0].split('#')[0].toLowerCase();
}

/** Sector M&E champions: sector-scoped read-only monitoring oversight (not department chief approval). */
function isSectorMeChampionLike(user) {
  const landing = getUiProfileLandingPath(user);
  if (landing.startsWith('/sector-me-workspace')) return true;
  const role = normalizeRole(user?.roleName || user?.role);
  return (
    role.includes('sector m&e')
    || role.includes('sector me champion')
    || role.includes('sector champion')
    || role.includes('m&e champion')
  );
}

async function ensureMonitoringWorkflowSchema() {
  if (schemaEnsured) return;
  if (!isPostgres) throw new Error('Village monitoring workflow requires PostgreSQL.');

  const migration = require('fs').readFileSync(
    require('path').join(__dirname, '../migrations/20260703_village_monitoring_workflow.sql'),
    'utf8'
  );
  await pool.query(migration);
  await pool.query(`
    ALTER TABLE data_collection_submissions
      ADD COLUMN IF NOT EXISTS village_baseline JSONB NULL
  `);
  await pool.query(`
    ALTER TABLE data_collection_submissions
      ADD COLUMN IF NOT EXISTS formatted_report_file_name TEXT NULL,
      ADD COLUMN IF NOT EXISTS formatted_report_file_path TEXT NULL,
      ADD COLUMN IF NOT EXISTS formatted_report_mime_type TEXT NULL,
      ADD COLUMN IF NOT EXISTS formatted_report_file_size BIGINT NULL,
      ADD COLUMN IF NOT EXISTS formatted_report_uploaded_by BIGINT NULL,
      ADD COLUMN IF NOT EXISTS formatted_report_uploaded_at TIMESTAMPTZ NULL
  `);
  schemaEnsured = true;
}

async function logAction(submissionId, {
  actionType,
  fromStatus = null,
  toStatus = null,
  comment = null,
  actorUserId = null,
  changedFields = null,
} = {}) {
  const id = Number(submissionId);
  if (!Number.isFinite(id) || !actionType) return null;
  const changedJson = changedFields && typeof changedFields === 'object'
    ? JSON.stringify(changedFields)
    : '{}';
  const r = await pool.query(
    `
    INSERT INTO data_collection_submission_actions (
      submission_id, action_type, from_status, to_status, comment, actor_user_id, changed_fields, created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, NOW())
    RETURNING action_id
    `,
    [id, actionType, fromStatus, toStatus, cleanText(comment) || null, actorUserId, changedJson]
  );
  return r.rows?.[0]?.action_id ?? null;
}

function diffFields(before, after, fields) {
  const changes = {};
  for (const key of fields) {
    const a = before?.[key];
    const b = after?.[key];
    if (JSON.stringify(a) !== JSON.stringify(b)) {
      changes[key] = { from: a ?? null, to: b ?? null };
    }
  }
  return Object.keys(changes).length ? changes : null;
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
  const scopeRows = await orgScope.fetchOrganizationScopesForUser(authUserId);
  if (!hasProjectScopes && !(scopeRows || []).length) return;

  let nextIndex = params.length + 1;
  const rawFragment = hasProjectScopes
    ? orgScope.buildExplicitProjectScopeFragment(alias)
    : orgScope.buildProjectListScopeFragment(alias);
  const scopeFragment = rawFragment.replace(/\?/g, () => `$${nextIndex++}`);
  where.push(scopeFragment);
  params.push(...(hasProjectScopes
    ? orgScope.explicitProjectScopeParams(authUserId)
    : orgScope.projectScopeParamTriple(authUserId)));
}

async function fetchUserGeoScopeValues(userId, scopeType) {
  const r = await pool.query(
    `
    SELECT scope_value
    FROM user_project_scopes
    WHERE user_id = $1
      AND scope_type = $2
      AND COALESCE(voided, false) = false
    `,
    [userId, scopeType]
  );
  return (r.rows || []).map((row) => String(row.scope_value || '').trim()).filter(Boolean);
}

function normalizedGeoMatchSql(columnExpr, paramRef) {
  return `regexp_replace(LOWER(TRIM(COALESCE(${columnExpr}, ''))), '[^a-z0-9]+', '', 'g') = regexp_replace(LOWER(TRIM(COALESCE(${paramRef}::text, ''))), '[^a-z0-9]+', '', 'g')`;
}

/** Project scope for monitoring lists, with ward/sub-county fallback on submission geo columns. */
async function addMonitoringListScopeWhere(user, where, params, projectAlias = 'p', submissionAlias = 's') {
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
  const scopeRows = await orgScope.fetchOrganizationScopesForUser(authUserId);
  if (!hasProjectScopes && !(scopeRows || []).length) return;

  let nextIndex = params.length + 1;
  const rawFragment = hasProjectScopes
    ? orgScope.buildExplicitProjectScopeFragment(projectAlias)
    : orgScope.buildProjectListScopeFragment(projectAlias);
  const scopeFragment = rawFragment.replace(/\?/g, () => `$${nextIndex++}`);
  const scopeParams = hasProjectScopes
    ? orgScope.explicitProjectScopeParams(authUserId)
    : orgScope.projectScopeParamTriple(authUserId);
  params.push(...scopeParams);

  const geoOrParts = [];
  if (isWardAdminLike(user)) {
    const wards = await fetchUserGeoScopeValues(authUserId, 'WARD');
    for (const ward of wards) {
      params.push(ward);
      geoOrParts.push(normalizedGeoMatchSql(`${submissionAlias}.ward`, `$${params.length}`));
      params.push(ward);
      geoOrParts.push(normalizedGeoMatchSql(`${projectAlias}.location->>'ward'`, `$${params.length}`));
    }
  }
  if (isSubCountyAdminLike(user)) {
    const subcounties = await fetchUserGeoScopeValues(authUserId, 'SUBCOUNTY');
    for (const subcounty of subcounties) {
      params.push(subcounty);
      geoOrParts.push(normalizedGeoMatchSql(`${submissionAlias}.subcounty`, `$${params.length}`));
      params.push(subcounty);
      geoOrParts.push(
        normalizedGeoMatchSql(
          `NULLIF(TRIM(${projectAlias}.location->>'subcounty'), '')`,
          `$${params.length}`
        )
      );
    }
  }

  if (geoOrParts.length) {
    where.push(`(${scopeFragment} OR ${geoOrParts.join(' OR ')})`);
  } else {
    where.push(scopeFragment);
  }
}

async function fetchProjectGeo(projectId, user) {
  const id = Number(projectId);
  if (!Number.isFinite(id)) return null;
  const where = ['p.project_id = $1', 'COALESCE(p.voided, false) = false'];
  const params = [id];
  await addProjectScopeWhere(user, where, params, 'p');
  return first(await pool.query(
    `
    SELECT
      p.project_id AS "projectId",
      p.name AS "projectName",
      COALESCE(NULLIF(TRIM(p.location->>'subcounty'), ''), '') AS subcounty,
      COALESCE(NULLIF(TRIM(p.location->>'ward'), ''), '') AS ward,
      COALESCE(NULLIF(TRIM(p.location->>'sublocation'), ''), '') AS sublocation,
      COALESCE(NULLIF(TRIM(p.location->>'village'), ''), '') AS village
    FROM projects p
    WHERE ${where.join(' AND ')}
    LIMIT 1
    `,
    params
  ));
}

async function publishProjectToPublic(projectId, userId, notes) {
  await pool.query(
    `
    UPDATE projects SET
      is_public = COALESCE(is_public, '{}'::jsonb) || jsonb_build_object(
        'approved', true,
        'approved_by', to_jsonb($2::bigint),
        'approved_at', to_jsonb(NOW()::text),
        'approval_notes', to_jsonb($3::text),
        'revision_requested', false
      ),
      updated_at = NOW()
    WHERE project_id = $1 AND COALESCE(voided, false) = false
    `,
    [Number(projectId), userId, notes || 'Approved via village monitoring workflow']
  );
}

function mapSubmissionRow(row) {
  if (!row) return null;
  return {
    submissionId: row.submissionId,
    templateId: row.templateId,
    templateName: row.templateName,
    projectId: row.projectId,
    projectName: row.projectName,
    inspectionId: row.inspectionId,
    visitDate: row.visitDate,
    title: row.title,
    answers: row.answers,
    progressStatus: row.progressStatus,
    workflowStatus: row.workflowStatus,
    subcounty: row.subcounty,
    ward: row.ward,
    sublocation: row.sublocation,
    village: row.village,
    createdBy: row.createdBy,
    createdByName: row.createdByName,
    villageSubmittedBy: row.villageSubmittedBy,
    villageSubmittedAt: row.villageSubmittedAt,
    wardReviewedBy: row.wardReviewedBy,
    wardReviewedAt: row.wardReviewedAt,
    subcountyReviewedBy: row.subcountyReviewedBy,
    subcountyReviewedAt: row.subcountyReviewedAt,
    chiefReviewedBy: row.chiefReviewedBy,
    chiefReviewedAt: row.chiefReviewedAt,
    reviewComment: row.reviewComment,
    publishedToPublicAt: row.publishedToPublicAt,
    villageBaseline: row.villageBaseline ?? row.village_baseline ?? null,
    formattedReportFileName: row.formattedReportFileName,
    formattedReportMimeType: row.formattedReportMimeType,
    formattedReportFileSize: row.formattedReportFileSize,
    formattedReportUploadedAt: row.formattedReportUploadedAt,
    hasFormattedReport: Boolean(row.formattedReportFilePath),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

const submissionSelectSql = `
  SELECT
    s.submission_id AS "submissionId",
    s.template_id AS "templateId",
    t.name AS "templateName",
    s.project_id AS "projectId",
    p.name AS "projectName",
    s.inspection_id AS "inspectionId",
    s.visit_date AS "visitDate",
    s.title,
    s.answers,
    s.progress_status AS "progressStatus",
    s.workflow_status AS "workflowStatus",
    s.subcounty,
    s.ward,
    s.sublocation,
    s.village,
    s.created_by AS "createdBy",
    COALESCE(NULLIF(TRIM(CONCAT_WS(' ', cu.firstname, cu.lastname)), ''), cu.username) AS "createdByName",
    s.village_submitted_by AS "villageSubmittedBy",
    s.village_submitted_at AS "villageSubmittedAt",
    s.ward_reviewed_by AS "wardReviewedBy",
    s.ward_reviewed_at AS "wardReviewedAt",
    s.subcounty_reviewed_by AS "subcountyReviewedBy",
    s.subcounty_reviewed_at AS "subcountyReviewedAt",
    s.chief_reviewed_by AS "chiefReviewedBy",
    s.chief_reviewed_at AS "chiefReviewedAt",
    s.review_comment AS "reviewComment",
    s.published_to_public_at AS "publishedToPublicAt",
    s.village_baseline AS "villageBaseline",
    s.formatted_report_file_name AS "formattedReportFileName",
    s.formatted_report_file_path AS "formattedReportFilePath",
    s.formatted_report_mime_type AS "formattedReportMimeType",
    s.formatted_report_file_size AS "formattedReportFileSize",
    s.formatted_report_uploaded_at AS "formattedReportUploadedAt",
    s.created_at AS "createdAt",
    s.updated_at AS "updatedAt"
  FROM data_collection_submissions s
  LEFT JOIN data_collection_templates t ON t.template_id = s.template_id
  LEFT JOIN projects p ON p.project_id = s.project_id
  LEFT JOIN users cu ON cu.userid = s.created_by
`;

async function getSubmissionById(submissionId, user) {
  await ensureMonitoringWorkflowSchema();
  const where = ['s.submission_id = $1', 'COALESCE(s.voided, false) = false'];
  const params = [Number(submissionId)];
  await addMonitoringListScopeWhere(user, where, params, 'p');
  const row = first(await pool.query(`${submissionSelectSql} WHERE ${where.join(' AND ')}`, params));
  return mapSubmissionRow(row);
}

function queueFilterForUser(user, queue) {
  if (queue === 'all') return 'all';
  if (queue) return queue;
  if (isSectorMeChampionLike(user)) return 'all';
  if (isChiefOfficerLike(user)) return 'chief';
  if (isSubCountyAdminLike(user)) return 'subcounty';
  if (isWardAdminLike(user)) return 'ward';
  if (isVillageAdminLike(user)) return 'village';
  return 'all';
}

function statusesForQueue(queue) {
  switch (queue) {
    case 'all': return null;
    case 'village': return [WORKFLOW_STATUS.DRAFT];
    case 'ward': return [WORKFLOW_STATUS.PENDING_WARD, WORKFLOW_STATUS.RETURNED_TO_WARD];
    case 'subcounty': return [WORKFLOW_STATUS.PENDING_SUBCOUNTY];
    case 'chief': return [WORKFLOW_STATUS.PENDING_CHIEF];
    default: return null;
  }
}

async function listSubmissions(user, opts = {}) {
  await ensureMonitoringWorkflowSchema();
  const queue = queueFilterForUser(user, opts.queue);
  const statuses = statusesForQueue(queue);
  const where = ['COALESCE(s.voided, false) = false'];
  const params = [];

  if (opts.workflowStatus) {
    params.push(opts.workflowStatus);
    where.push(`s.workflow_status = $${params.length}`);
  } else if (statuses) {
    params.push(statuses);
    where.push(`s.workflow_status = ANY($${params.length}::text[])`);
  }

  if (opts.projectId != null) {
    params.push(Number(opts.projectId));
    where.push(`s.project_id = $${params.length}`);
  }

  await addMonitoringListScopeWhere(user, where, params, 'p');

  const limit = Math.min(Math.max(Number(opts.limit) || 100, 1), 500);
  params.push(limit);

  const r = await pool.query(
    `
    ${submissionSelectSql}
    WHERE ${where.join(' AND ')}
    ORDER BY s.updated_at DESC, s.submission_id DESC
    LIMIT $${params.length}
    `,
    params
  );
  return rows(r).map(mapSubmissionRow);
}

async function countByStatuses(user, statuses) {
  if (!statuses?.length) return 0;
  const where = ['COALESCE(s.voided, false) = false'];
  const params = [statuses];
  where.push(`s.workflow_status = ANY($${params.length}::text[])`);
  await addMonitoringListScopeWhere(user, where, params, 'p');
  const row = first(
    await pool.query(
      `
      SELECT COUNT(*)::int AS count
      FROM data_collection_submissions s
      LEFT JOIN projects p ON p.project_id = s.project_id
      WHERE ${where.join(' AND ')}
      `,
      params
    )
  );
  return Number(row?.count || 0);
}

async function getWorkflowSummary(user) {
  await ensureMonitoringWorkflowSchema();
  const [draft, wardQueue, subcountyQueue, chiefQueue, approved, returnedToWard] = await Promise.all([
    countByStatuses(user, [WORKFLOW_STATUS.DRAFT]),
    countByStatuses(user, [WORKFLOW_STATUS.PENDING_WARD, WORKFLOW_STATUS.RETURNED_TO_WARD]),
    countByStatuses(user, [WORKFLOW_STATUS.PENDING_SUBCOUNTY]),
    countByStatuses(user, [WORKFLOW_STATUS.PENDING_CHIEF]),
    countByStatuses(user, [WORKFLOW_STATUS.APPROVED]),
    countByStatuses(user, [WORKFLOW_STATUS.RETURNED_TO_WARD]),
  ]);

  let myQueue = 0;
  let sectorScopes = [];
  let mappedDepartments = [];
  if (isSectorMeChampionLike(user)) {
    const uid = getUserId(user);
    if (uid) {
      sectorScopes = await fetchUserGeoScopeValues(uid, 'SECTOR');
      if (sectorScopes.length) {
        const mappings = await orgScope.fetchDepartmentSectorMappings();
        const sectorKeys = new Set(sectorScopes.map((s) => s.toLowerCase()));
        mappedDepartments = [...new Set(
          mappings
            .filter((m) => sectorKeys.has(String(m.sectorName || '').trim().toLowerCase()))
            .map((m) => String(m.departmentName || '').trim())
            .filter(Boolean)
        )].sort((a, b) => a.localeCompare(b));
      }
    }
    myQueue = chiefQueue;
  } else if (isChiefOfficerLike(user)) myQueue = chiefQueue;
  else if (isSubCountyAdminLike(user)) myQueue = subcountyQueue;
  else if (isWardAdminLike(user)) myQueue = wardQueue;
  else if (isVillageAdminLike(user)) myQueue = draft;

  return {
    draft,
    wardQueue,
    subcountyQueue,
    chiefQueue,
    approved,
    returnedToWard,
    myQueue,
    sectorScopes,
    mappedDepartments,
    workspaceRole: isSectorMeChampionLike(user) ? 'sector_me' : null,
  };
}

async function getSubmissionDetail(submissionId, user) {
  const submission = await getSubmissionById(submissionId, user);
  if (!submission) return null;

  const tplRow = first(
    await pool.query(
      `SELECT structure FROM data_collection_templates WHERE template_id = $1 AND COALESCE(voided, false) = false`,
      [submission.templateId]
    )
  );
  const structure = tplRow?.structure || { sections: [] };
  const attachmentRows = rows(
    await pool.query(
      `
      SELECT file_id, item_id, file_name, file_path, mime_type, lat, lng, accuracy, captured_at
      FROM data_collection_attachments
      WHERE submission_id = $1
      ORDER BY file_id ASC
      `,
      [Number(submissionId)]
    )
  );

  return {
    ...submission,
    answers: normalizeAnswersForDisplay(structure, submission.answers),
    structure,
    villageBaseline: submission.villageBaseline || null,
    wardChangesFromVillage: computeWardChangesFromBaseline(
      submission.villageBaseline,
      submission,
      structure
    ),
    attachments: attachmentRows.map((a) => ({
      fileId: a.file_id,
      itemId: a.item_id,
      fileName: a.file_name,
      url: a.file_path,
      mimeType: a.mime_type,
      lat: a.lat,
      lng: a.lng,
      accuracy: a.accuracy,
      capturedAt: a.captured_at,
    })),
  };
}

async function getSubmissionDetailWithFormattedReport(submissionId, user) {
  let detail = await getSubmissionDetail(submissionId, user);
  if (!detail) return null;
  if (EXPORTABLE_STATUSES.has(detail.workflowStatus) && !detail.hasFormattedReport) {
    try {
      await generateAndStoreFormattedReport(submissionId, user, { skipIfExists: true });
      const refreshed = await getSubmissionById(submissionId, user);
      if (refreshed) detail = { ...detail, ...refreshed };
    } catch (e) {
      console.warn('[monitoring_workflow] formatted report backfill:', e.message);
    }
  }
  return detail;
}

async function listActions(submissionId, user) {
  const submission = await getSubmissionById(submissionId, user);
  if (!submission) {
    const err = new Error('Monitoring report not found.');
    err.statusCode = 404;
    throw err;
  }
  const r = await pool.query(
    `
    SELECT
      a.action_id AS "actionId",
      a.submission_id AS "submissionId",
      a.action_type AS "actionType",
      a.from_status AS "fromStatus",
      a.to_status AS "toStatus",
      a.comment,
      a.actor_user_id AS "actorUserId",
      COALESCE(NULLIF(TRIM(CONCAT_WS(' ', u.firstname, u.lastname)), ''), u.username, 'System') AS "actorName",
      a.changed_fields AS "changedFields",
      a.created_at AS "createdAt"
    FROM data_collection_submission_actions a
    LEFT JOIN users u ON u.userid = a.actor_user_id
    WHERE a.submission_id = $1
    ORDER BY a.created_at ASC, a.action_id ASC
    `,
    [Number(submissionId)]
  );
  return rows(r);
}

async function initSubmissionWorkflow(submissionId, { projectId, progressStatus, userId, user } = {}) {
  await ensureMonitoringWorkflowSchema();
  const geo = await fetchProjectGeo(projectId, user || { id: userId, privileges: ['organization.scope_bypass'] });
  await pool.query(
    `
    UPDATE data_collection_submissions SET
      workflow_status = COALESCE(workflow_status, 'draft'),
      progress_status = COALESCE($2, progress_status),
      subcounty = COALESCE($3, subcounty),
      ward = COALESCE($4, ward),
      sublocation = COALESCE($5, sublocation),
      village = COALESCE($6, village),
      updated_at = CURRENT_TIMESTAMP
    WHERE submission_id = $1
    `,
    [
      Number(submissionId),
      cleanText(progressStatus) || null,
      geo?.subcounty || null,
      geo?.ward || null,
      geo?.sublocation || null,
      geo?.village || null,
    ]
  );
  await logAction(submissionId, {
    actionType: 'created',
    fromStatus: null,
    toStatus: WORKFLOW_STATUS.DRAFT,
    actorUserId: userId,
    comment: 'Monitoring report draft created.',
  });
}

async function updateSubmission(submissionId, user, payload = {}) {
  const submission = await getSubmissionById(submissionId, user);
  if (!submission) {
    const err = new Error('Monitoring report not found.');
    err.statusCode = 404;
    throw err;
  }

  const status = submission.workflowStatus;
  const userId = getUserId(user);
  const canVillageEdit = VILLAGE_EDITABLE.has(status) && (isVillageAdminLike(user) || userId === submission.createdBy);
  const canWardEdit = WARD_EDITABLE.has(status) && isWardAdminLike(user);

  if (!canVillageEdit && !canWardEdit && !isSuperAdminRequester(user)) {
    const err = new Error('You are not allowed to edit this report at its current workflow stage.');
    err.statusCode = 403;
    throw err;
  }

  const before = snapshotContent(submission);
  const nextAnswers = payload.answers != null ? payload.answers : submission.answers;
  const nextTitle = payload.title != null ? cleanText(payload.title) || null : submission.title;
  const nextProgress = payload.progressStatus != null ? cleanText(payload.progressStatus) || null : submission.progressStatus;

  const tplRow = first(
    await pool.query(
      `SELECT structure FROM data_collection_templates WHERE template_id = $1 AND COALESCE(voided, false) = false`,
      [submission.templateId]
    )
  );
  const structure = tplRow?.structure || { sections: [] };

  await pool.query(
    `
    UPDATE data_collection_submissions SET
      title = $2,
      progress_status = $3,
      answers = $4::jsonb,
      updated_at = CURRENT_TIMESTAMP
    WHERE submission_id = $1
    `,
    [Number(submissionId), nextTitle, nextProgress, JSON.stringify(nextAnswers || {})]
  );

  const after = snapshotContent({ title: nextTitle, progressStatus: nextProgress, answers: nextAnswers });
  const changedFields = diffSubmissionContent(before, after, structure);

  await logAction(submissionId, {
    actionType: canWardEdit ? 'ward_revised' : 'updated',
    fromStatus: status,
    toStatus: status,
    actorUserId: userId,
    comment: canWardEdit ? 'Ward administrator revised the monitoring report.' : 'Report updated.',
    changedFields,
  });

  return getSubmissionDetail(submissionId, user);
}

async function syncProgressStatusFromAnswers(submissionId, submission = null) {
  const row = submission || await getSubmissionById(submissionId, { id: 0, privileges: ['organization.scope_bypass'] });
  if (!row) return null;
  if (VALID_PROGRESS_STATUSES.has(String(row.progressStatus || '').trim())) return row;

  const tplRow = first(
    await pool.query(
      `SELECT structure FROM data_collection_templates WHERE template_id = $1 AND COALESCE(voided, false) = false`,
      [row.templateId]
    )
  );
  const structure = tplRow?.structure || { sections: [] };
  const extracted = extractProgressStatus(structure, row.answers);
  if (!extracted) return row;

  await pool.query(
    `
    UPDATE data_collection_submissions SET
      progress_status = $2,
      updated_at = CURRENT_TIMESTAMP
    WHERE submission_id = $1
    `,
    [Number(submissionId), extracted]
  );
  return { ...row, progressStatus: extracted };
}

const FORMATTED_REPORTS_ROOT = path.join(__dirname, '..', '..', 'uploads', 'monitoring-reports');

async function storeGeneratedFormattedReport(submissionId, user, buffer, filename) {
  const submission = await getSubmissionById(submissionId, user);
  const dir = path.join(FORMATTED_REPORTS_ROOT, String(submissionId));
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const storedName = `${Date.now()}-${filename}`;
  const filePath = path.join(dir, storedName);
  fs.writeFileSync(filePath, buffer);

  await pool.query(
    `
    UPDATE data_collection_submissions SET
      formatted_report_file_name = $2,
      formatted_report_file_path = $3,
      formatted_report_mime_type = $4,
      formatted_report_file_size = $5,
      formatted_report_uploaded_by = $6,
      formatted_report_uploaded_at = NOW(),
      updated_at = CURRENT_TIMESTAMP
    WHERE submission_id = $1
    `,
    [
      Number(submissionId),
      filename,
      filePath,
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      buffer.length,
      getUserId(user),
    ]
  );

  await logAction(submissionId, {
    actionType: 'formatted_report_generated',
    fromStatus: submission?.workflowStatus || null,
    toStatus: submission?.workflowStatus || null,
    actorUserId: getUserId(user),
    comment: 'Formatted Word report generated from checklist.',
  });

  return filePath;
}

async function generateAndStoreFormattedReport(submissionId, user, { skipIfExists = false } = {}) {
  const submission = await getSubmissionById(submissionId, user);
  if (!submission) {
    const err = new Error('Monitoring report not found.');
    err.statusCode = 404;
    throw err;
  }
  if (skipIfExists && submission.hasFormattedReport) return submission;
  await assertExportableReport(submission);

  const detail = await getSubmissionDetail(submissionId, user);
  const { buildMonitoringReportDocx, buildExportFilename } = require('./monitoringReportExportService');
  const buffer = await buildMonitoringReportDocx(detail);
  const filename = buildExportFilename(detail);
  await storeGeneratedFormattedReport(submissionId, user, buffer, filename);
  return getSubmissionById(submissionId, user);
}

async function submitFromVillage(submissionId, user) {
  let submission = await getSubmissionById(submissionId, user);
  if (!submission) {
    const err = new Error('Monitoring report not found.');
    err.statusCode = 404;
    throw err;
  }
  if (!isVillageAdminLike(user) && getUserId(user) !== submission.createdBy) {
    const err = new Error('Only Village Administrators can submit reports to the ward.');
    err.statusCode = 403;
    throw err;
  }
  if (!VILLAGE_EDITABLE.has(submission.workflowStatus)) {
    const err = new Error('Only draft reports can be submitted to the ward.');
    err.statusCode = 400;
    throw err;
  }
  submission = await syncProgressStatusFromAnswers(submissionId, submission);
  assertProgressStatusForSubmit(submission);

  const userId = getUserId(user);
  const baseline = snapshotContent(submission);
  await pool.query(
    `
    UPDATE data_collection_submissions SET
      workflow_status = $2,
      village_submitted_by = $3,
      village_submitted_at = NOW(),
      village_baseline = $4::jsonb,
      review_comment = NULL,
      updated_at = CURRENT_TIMESTAMP
    WHERE submission_id = $1
    `,
    [Number(submissionId), WORKFLOW_STATUS.PENDING_WARD, userId, JSON.stringify(baseline)]
  );
  await logAction(submissionId, {
    actionType: 'submitted_to_ward',
    fromStatus: WORKFLOW_STATUS.DRAFT,
    toStatus: WORKFLOW_STATUS.PENDING_WARD,
    actorUserId: userId,
    comment: 'Submitted to Ward Administrator for review.',
  });
  const updated = await getSubmissionById(submissionId, user);
  notify.notifySubmittedToWard(updated).catch((e) => {
    console.warn('[monitoring_workflow] submit notify:', e.message);
  });
  try {
    await generateAndStoreFormattedReport(submissionId, user, { skipIfExists: true });
  } catch (e) {
    console.warn('[monitoring_workflow] formatted report generation:', e.message);
  }
  return getSubmissionById(submissionId, user);
}

async function forwardToSubcounty(submissionId, user, comment = '') {
  const submission = await getSubmissionById(submissionId, user);
  if (!submission) {
    const err = new Error('Monitoring report not found.');
    err.statusCode = 404;
    throw err;
  }
  if (!isWardAdminLike(user)) {
    const err = new Error('Only Ward Administrators can forward reports to sub-county.');
    err.statusCode = 403;
    throw err;
  }
  if (!WARD_EDITABLE.has(submission.workflowStatus)) {
    const err = new Error('Report must be pending ward review or returned from sub-county.');
    err.statusCode = 400;
    throw err;
  }

  const userId = getUserId(user);
  const fromStatus = submission.workflowStatus;

  const tplRow = first(
    await pool.query(
      `SELECT structure FROM data_collection_templates WHERE template_id = $1 AND COALESCE(voided, false) = false`,
      [submission.templateId]
    )
  );
  const structure = tplRow?.structure || { sections: [] };
  const wardChangesFromVillage = computeWardChangesFromBaseline(
    submission.villageBaseline,
    submission,
    structure
  );
  const forwardChangedFields = wardChangesFromVillage.length
    ? { wardChangesFromVillage }
    : null;

  await pool.query(
    `
    UPDATE data_collection_submissions SET
      workflow_status = $2,
      ward_reviewed_by = $3,
      ward_reviewed_at = NOW(),
      review_comment = $4,
      updated_at = CURRENT_TIMESTAMP
    WHERE submission_id = $1
    `,
    [Number(submissionId), WORKFLOW_STATUS.PENDING_SUBCOUNTY, userId, cleanText(comment) || null]
  );
  await logAction(submissionId, {
    actionType: fromStatus === WORKFLOW_STATUS.RETURNED_TO_WARD ? 'resubmitted_to_subcounty' : 'forwarded_to_subcounty',
    fromStatus,
    toStatus: WORKFLOW_STATUS.PENDING_SUBCOUNTY,
    actorUserId: userId,
    comment: cleanText(comment) || 'Forwarded to Sub-County Administrator.',
    changedFields: forwardChangedFields,
  });
  const updated = await getSubmissionById(submissionId, user);
  notify.notifyForwardedToSubcounty(updated).catch((e) => {
    console.warn('[monitoring_workflow] forward subcounty notify:', e.message);
  });
  return updated;
}

async function returnToWard(submissionId, user, comment) {
  const submission = await getSubmissionById(submissionId, user);
  if (!submission) {
    const err = new Error('Monitoring report not found.');
    err.statusCode = 404;
    throw err;
  }
  if (!isSubCountyAdminLike(user)) {
    const err = new Error('Only Sub-County Administrators can return reports to the ward.');
    err.statusCode = 403;
    throw err;
  }
  if (submission.workflowStatus !== WORKFLOW_STATUS.PENDING_SUBCOUNTY) {
    const err = new Error('Only reports pending sub-county review can be returned.');
    err.statusCode = 400;
    throw err;
  }
  if (!cleanText(comment)) {
    const err = new Error('A comment is required when returning a report to the ward.');
    err.statusCode = 400;
    throw err;
  }

  const userId = getUserId(user);
  await pool.query(
    `
    UPDATE data_collection_submissions SET
      workflow_status = $2,
      subcounty_reviewed_by = $3,
      subcounty_reviewed_at = NOW(),
      review_comment = $4,
      updated_at = CURRENT_TIMESTAMP
    WHERE submission_id = $1
    `,
    [Number(submissionId), WORKFLOW_STATUS.RETURNED_TO_WARD, userId, cleanText(comment)]
  );
  await logAction(submissionId, {
    actionType: 'returned_to_ward',
    fromStatus: WORKFLOW_STATUS.PENDING_SUBCOUNTY,
    toStatus: WORKFLOW_STATUS.RETURNED_TO_WARD,
    actorUserId: userId,
    comment: cleanText(comment),
  });
  const updated = await getSubmissionById(submissionId, user);
  notify.notifyReturnedToWard(updated).catch((e) => {
    console.warn('[monitoring_workflow] return notify:', e.message);
  });
  return updated;
}

async function forwardToChief(submissionId, user, comment = '') {
  const submission = await getSubmissionById(submissionId, user);
  if (!submission) {
    const err = new Error('Monitoring report not found.');
    err.statusCode = 404;
    throw err;
  }
  if (!isSubCountyAdminLike(user)) {
    const err = new Error('Only Sub-County Administrators can forward reports to the Chief Officer.');
    err.statusCode = 403;
    throw err;
  }
  if (submission.workflowStatus !== WORKFLOW_STATUS.PENDING_SUBCOUNTY) {
    const err = new Error('Only reports pending sub-county review can be forwarded.');
    err.statusCode = 400;
    throw err;
  }

  const userId = getUserId(user);
  await pool.query(
    `
    UPDATE data_collection_submissions SET
      workflow_status = $2,
      subcounty_reviewed_by = $3,
      subcounty_reviewed_at = NOW(),
      review_comment = $4,
      updated_at = CURRENT_TIMESTAMP
    WHERE submission_id = $1
    `,
    [Number(submissionId), WORKFLOW_STATUS.PENDING_CHIEF, userId, cleanText(comment) || null]
  );
  await logAction(submissionId, {
    actionType: 'forwarded_to_chief',
    fromStatus: WORKFLOW_STATUS.PENDING_SUBCOUNTY,
    toStatus: WORKFLOW_STATUS.PENDING_CHIEF,
    actorUserId: userId,
    comment: cleanText(comment) || 'Forwarded to Department Chief Officer.',
  });
  const updated = await getSubmissionById(submissionId, user);
  notify.notifyForwardedToChief(updated).catch((e) => {
    console.warn('[monitoring_workflow] forward chief notify:', e.message);
  });
  return updated;
}

async function approveByChief(submissionId, user, comment = '') {
  const submission = await getSubmissionById(submissionId, user);
  if (!submission) {
    const err = new Error('Monitoring report not found.');
    err.statusCode = 404;
    throw err;
  }
  if (!isChiefOfficerLike(user)) {
    const err = new Error('Only Department Chief Officers can give final approval.');
    err.statusCode = 403;
    throw err;
  }
  if (submission.workflowStatus !== WORKFLOW_STATUS.PENDING_CHIEF) {
    const err = new Error('Only reports pending chief officer review can be approved.');
    err.statusCode = 400;
    throw err;
  }

  const userId = getUserId(user);
  const approvalNotes = cleanText(comment) || 'Final approval via village monitoring workflow.';
  await pool.query(
    `
    UPDATE data_collection_submissions SET
      workflow_status = $2,
      chief_reviewed_by = $3,
      chief_reviewed_at = NOW(),
      review_comment = $4,
      published_to_public_at = NOW(),
      updated_at = CURRENT_TIMESTAMP
    WHERE submission_id = $1
    `,
    [Number(submissionId), WORKFLOW_STATUS.APPROVED, userId, approvalNotes]
  );
  if (submission.projectId) {
    await publishProjectToPublic(submission.projectId, userId, approvalNotes);
  }
  await logAction(submissionId, {
    actionType: 'chief_approved',
    fromStatus: WORKFLOW_STATUS.PENDING_CHIEF,
    toStatus: WORKFLOW_STATUS.APPROVED,
    actorUserId: userId,
    comment: approvalNotes,
  });
  const updated = await getSubmissionById(submissionId, user);
  notify.notifyChiefApproved(updated).catch((e) => {
    console.warn('[monitoring_workflow] chief approve notify:', e.message);
  });
  return updated;
}

function parseAllowedSubjectTypes(raw) {
  if (Array.isArray(raw) && raw.length) {
    const list = raw.map((v) => String(v).trim().toLowerCase()).filter((v) => v === 'project' || v === 'rri_programme');
    return list.length ? [...new Set(list)] : ['project'];
  }
  return ['project'];
}

function userContextFromUser(user) {
  const userId = getUserId(user);
  return {
    userId,
    roleId: user?.roleId ?? user?.roleid ?? null,
    isAdmin: isSuperAdminRequester(user),
    privileges: user?.privileges || [],
  };
}

async function resolveProjectTemplateId(user, templateId) {
  const tid = templateId != null ? parseInt(String(templateId), 10) : null;
  const ctx = userContextFromUser(user);
  if (Number.isFinite(tid)) {
    const tr = await pool.query(
      `
      SELECT template_id, allowed_subject_types
      FROM data_collection_templates
      WHERE template_id = $1 AND COALESCE(voided, false) = false AND COALESCE(is_active, true) = true
      `,
      [tid]
    );
    const row = tr.rows?.[0];
    if (!row) {
      const err = new Error('Checklist template not found or inactive.');
      err.statusCode = 404;
      throw err;
    }
    const allowed = parseAllowedSubjectTypes(row.allowed_subject_types);
    if (!allowed.includes('project')) {
      const err = new Error('Selected template does not support project monitoring visits.');
      err.statusCode = 400;
      throw err;
    }
    const pass = await canUserAccessTemplate(tid, ctx, false);
    if (!pass) {
      const err = new Error('You do not have access to the selected checklist template.');
      err.statusCode = 403;
      throw err;
    }
    return tid;
  }

  const preferVillageTemplate = isVillageAdminLike(user) || userHasPrivilege(user, 'monitoring_report.create');
  const r = await pool.query(
    `
    SELECT t.template_id
    FROM data_collection_templates t
    WHERE COALESCE(t.voided, false) = false AND COALESCE(t.is_active, true) = true
      AND (
        t.allowed_subject_types IS NULL
        OR t.allowed_subject_types @> '["project"]'::jsonb
        OR jsonb_array_length(COALESCE(t.allowed_subject_types, '[]'::jsonb)) = 0
      )
    ORDER BY
      CASE
        WHEN $1::boolean AND t.description ILIKE '%templateKey:village-admin-field-monitoring%' THEN 0
        ELSE 1
      END,
      t.name ASC,
      t.template_id ASC
    LIMIT 50
    `,
    [preferVillageTemplate]
  );
  for (const row of r.rows || []) {
    const pass = await canUserAccessTemplate(row.template_id, ctx, false);
    if (pass) return row.template_id;
  }
  const err = new Error('No monitoring checklist template is available for your account. Ask an administrator to grant access.');
  err.statusCode = 400;
  throw err;
}

async function createDraftReport(user, payload = {}) {
  await ensureMonitoringWorkflowSchema();
  await ensureDataCollectionSubmissionsTable();

  if (!isVillageAdminLike(user) && !userHasPrivilege(user, 'monitoring_report.create')) {
    const err = new Error('Only Village Administrators can create monitoring report drafts.');
    err.statusCode = 403;
    throw err;
  }

  const projectId = parseInt(String(payload.projectId), 10);
  if (!Number.isFinite(projectId)) {
    const err = new Error('projectId is required.');
    err.statusCode = 400;
    throw err;
  }

  const project = await fetchProjectGeo(projectId, user);
  if (!project) {
    const err = new Error('Project not found or outside your access scope.');
    err.statusCode = 404;
    throw err;
  }

  const templateId = await resolveProjectTemplateId(user, payload.templateId);
  const answers = payload.answers && typeof payload.answers === 'object' ? payload.answers : {};
  const visitDate = payload.visitDate ? String(payload.visitDate).slice(0, 10) : null;
  const title = payload.title != null ? cleanText(payload.title) || null : null;
  const userId = getUserId(user);

  const tplRow = first(await pool.query(
    `SELECT structure FROM data_collection_templates WHERE template_id = $1`,
    [templateId]
  ));
  const structure = tplRow?.structure || { sections: [] };
  const progressStatus = cleanText(payload.progressStatus)
    || extractProgressStatus(structure, answers)
    || null;

  const r = await pool.query(
    `
    INSERT INTO data_collection_submissions
      (template_id, subject_type, project_id, visit_date, title, answers, created_by, workflow_status, progress_status,
       subcounty, ward, sublocation, village, created_at, updated_at, voided)
    VALUES ($1, 'project', $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $10, $11, $12, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, false)
    RETURNING submission_id
    `,
    [
      templateId,
      projectId,
      visitDate,
      title,
      JSON.stringify(answers),
      userId,
      WORKFLOW_STATUS.DRAFT,
      progressStatus,
      project.subcounty || null,
      project.ward || null,
      project.sublocation || null,
      project.village || null,
    ]
  );
  const submissionId = r.rows?.[0]?.submission_id;
  if (!submissionId) {
    const err = new Error('Failed to create monitoring report draft.');
    err.statusCode = 500;
    throw err;
  }

  await logAction(submissionId, {
    actionType: 'created',
    fromStatus: null,
    toStatus: WORKFLOW_STATUS.DRAFT,
    actorUserId: userId,
    comment: 'Monitoring report draft created.',
  });

  return getSubmissionDetail(submissionId, user);
}

async function submitAllDrafts(user) {
  const drafts = await listSubmissions(user, { workflowStatus: WORKFLOW_STATUS.DRAFT, limit: 200 });
  const submitted = [];
  const failed = [];
  for (const draft of drafts) {
    try {
      const synced = await syncProgressStatusFromAnswers(draft.submissionId, draft);
      assertProgressStatusForSubmit(synced);
      const updated = await submitFromVillage(draft.submissionId, user);
      submitted.push(updated);
    } catch (e) {
      failed.push({
        submissionId: draft.submissionId,
        title: draft.title,
        message: e.message,
      });
    }
  }
  return { submitted, failed, total: drafts.length };
}

const EXPORTABLE_STATUSES = new Set([
  WORKFLOW_STATUS.PENDING_WARD,
  WORKFLOW_STATUS.PENDING_SUBCOUNTY,
  WORKFLOW_STATUS.RETURNED_TO_WARD,
  WORKFLOW_STATUS.PENDING_CHIEF,
  WORKFLOW_STATUS.APPROVED,
]);

async function assertExportableReport(submission) {
  if (!submission) {
    const err = new Error('Monitoring report not found.');
    err.statusCode = 404;
    throw err;
  }
  if (!EXPORTABLE_STATUSES.has(submission.workflowStatus)) {
    const err = new Error('Formatted reports are available after the village administrator submits to ward.');
    err.statusCode = 400;
    throw err;
  }
}

async function exportReportWord(submissionId, user) {
  const submission = await getSubmissionById(submissionId, user);
  await assertExportableReport(submission);
  const detail = await getSubmissionDetail(submissionId, user);
  const { buildMonitoringReportDocx, buildExportFilename } = require('./monitoringReportExportService');
  const buffer = await buildMonitoringReportDocx(detail);
  const filename = buildExportFilename(detail);
  if (!submission.hasFormattedReport) {
    try {
      await storeGeneratedFormattedReport(submissionId, user, buffer, filename);
    } catch (e) {
      console.warn('[monitoring_workflow] formatted report store on export:', e.message);
    }
  }
  return {
    buffer,
    filename,
  };
}

async function attachFormattedReport(submissionId, user, fileMeta = {}) {
  const submission = await getSubmissionById(submissionId, user);
  if (!submission) {
    const err = new Error('Monitoring report not found.');
    err.statusCode = 404;
    throw err;
  }
  if (!isWardAdminLike(user) && !userHasPrivilege(user, 'monitoring_report.ward_review')) {
    const err = new Error('Only Ward Administrators can upload formatted monitoring reports.');
    err.statusCode = 403;
    throw err;
  }
  const editable = new Set([WORKFLOW_STATUS.PENDING_WARD, WORKFLOW_STATUS.RETURNED_TO_WARD]);
  if (!editable.has(submission.workflowStatus)) {
    const err = new Error('Formatted reports can only be uploaded while the report is pending ward review or returned from sub-county.');
    err.statusCode = 400;
    throw err;
  }

  await pool.query(
    `
    UPDATE data_collection_submissions SET
      formatted_report_file_name = $2,
      formatted_report_file_path = $3,
      formatted_report_mime_type = $4,
      formatted_report_file_size = $5,
      formatted_report_uploaded_by = $6,
      formatted_report_uploaded_at = NOW(),
      updated_at = CURRENT_TIMESTAMP
    WHERE submission_id = $1
    `,
    [
      Number(submissionId),
      cleanText(fileMeta.fileName) || null,
      cleanText(fileMeta.filePath) || null,
      cleanText(fileMeta.mimeType) || null,
      fileMeta.fileSize != null ? Number(fileMeta.fileSize) : null,
      getUserId(user),
    ]
  );

  await logAction(submissionId, {
    actionType: 'formatted_report_uploaded',
    fromStatus: submission.workflowStatus,
    toStatus: submission.workflowStatus,
    actorUserId: getUserId(user),
    comment: submission.hasFormattedReport
      ? 'Revised formatted Word report uploaded.'
      : 'Formatted Word report uploaded for ward review record.',
  });

  return getSubmissionById(submissionId, user);
}

async function getFormattedReportDownloadMeta(submissionId, user, opts = {}) {
  const submission = await getSubmissionById(submissionId, user);
  if (!submission) {
    const err = new Error('Monitoring report not found.');
    err.statusCode = 404;
    throw err;
  }
  await assertExportableReport(submission);

  const row = first(await pool.query(
    `
    SELECT formatted_report_file_name AS "fileName",
           formatted_report_file_path AS "filePath",
           formatted_report_mime_type AS "mimeType"
    FROM data_collection_submissions
    WHERE submission_id = $1 AND COALESCE(voided, false) = false
    `,
    [Number(submissionId)]
  ));

  let latestActionType = null;
  try {
    const actionRows = await pool.query(
      `
      SELECT action_type AS "actionType"
      FROM data_collection_submission_actions
      WHERE submission_id = $1
        AND action_type IN ('formatted_report_generated', 'formatted_report_uploaded')
      ORDER BY action_id DESC
      LIMIT 1
      `,
      [Number(submissionId)]
    );
    latestActionType = actionRows.rows?.[0]?.actionType || null;
  } catch {
    latestActionType = null;
  }

  const wardUploaded = latestActionType === 'formatted_report_uploaded';
  const shouldRegenerate = !wardUploaded && (opts.preferLiveGenerated || opts.forceRegenerate || !row?.filePath);

  if (shouldRegenerate) {
    const exported = await exportReportWord(submissionId, user);
    try {
      await storeGeneratedFormattedReport(submissionId, user, exported.buffer, exported.filename);
    } catch (e) {
      console.warn('[monitoring_workflow] regenerate store on download:', e.message);
    }
    return {
      fileName: exported.filename,
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      buffer: exported.buffer,
      filePath: null,
    };
  }

  if (!row?.filePath) {
    const err = new Error('No formatted Word report has been uploaded for this monitoring visit yet.');
    err.statusCode = 404;
    throw err;
  }

  return {
    fileName: row.fileName || `monitoring-report-${submissionId}.docx`,
    filePath: row.filePath,
    mimeType: row.mimeType || 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  };
}

module.exports = {
  WORKFLOW_STATUS,
  ensureMonitoringWorkflowSchema,
  initSubmissionWorkflow,
  listSubmissions,
  getSubmissionById,
  getSubmissionDetail,
  getSubmissionDetailWithFormattedReport,
  getWorkflowSummary,
  listActions,
  updateSubmission,
  createDraftReport,
  submitFromVillage,
  submitAllDrafts,
  forwardToSubcounty,
  returnToWard,
  forwardToChief,
  approveByChief,
  exportReportWord,
  attachFormattedReport,
  getFormattedReportDownloadMeta,
  isVillageAdminLike,
  isWardAdminLike,
  isSubCountyAdminLike,
  isChiefOfficerLike,
};
