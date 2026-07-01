/**
 * Village monitoring workflow: Village → Ward (edit+track) → Subcounty (return/forward) → Chief → public.
 */
const pool = require('../config/db');
const orgScope = require('./organizationScopeService');
const { isSuperAdminRequester } = require('../utils/roleUtils');
const notify = require('./monitoringWorkflowNotifyService');

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

async function ensureMonitoringWorkflowSchema() {
  if (schemaEnsured) return;
  if (!isPostgres) throw new Error('Village monitoring workflow requires PostgreSQL.');

  const migration = require('fs').readFileSync(
    require('path').join(__dirname, '../migrations/20260703_village_monitoring_workflow.sql'),
    'utf8'
  );
  await pool.query(migration);
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
  await addProjectScopeWhere(user, where, params, 'p');
  const row = first(await pool.query(`${submissionSelectSql} WHERE ${where.join(' AND ')}`, params));
  return mapSubmissionRow(row);
}

function queueFilterForUser(user, queue) {
  if (queue) return queue;
  if (isChiefOfficerLike(user)) return 'chief';
  if (isSubCountyAdminLike(user)) return 'subcounty';
  if (isWardAdminLike(user)) return 'ward';
  if (isVillageAdminLike(user)) return 'village';
  return 'all';
}

function statusesForQueue(queue) {
  switch (queue) {
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

  await addProjectScopeWhere(user, where, params, 'p');

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
  await addProjectScopeWhere(user, where, params, 'p');
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
  if (isChiefOfficerLike(user)) myQueue = chiefQueue;
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
    structure: tplRow?.structure || { sections: [] },
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

  const before = {
    title: submission.title,
    progressStatus: submission.progressStatus,
    answers: submission.answers,
  };
  const nextAnswers = payload.answers != null ? payload.answers : submission.answers;
  const nextTitle = payload.title != null ? cleanText(payload.title) || null : submission.title;
  const nextProgress = payload.progressStatus != null ? cleanText(payload.progressStatus) || null : submission.progressStatus;

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

  const after = { title: nextTitle, progressStatus: nextProgress, answers: nextAnswers };
  const changedFields = diffFields(before, after, ['title', 'progressStatus', 'answers']);

  await logAction(submissionId, {
    actionType: canWardEdit ? 'ward_revised' : 'updated',
    fromStatus: status,
    toStatus: status,
    actorUserId: userId,
    comment: canWardEdit ? 'Ward administrator revised the monitoring report.' : 'Report updated.',
    changedFields,
  });

  return getSubmissionById(submissionId, user);
}

async function submitFromVillage(submissionId, user) {
  const submission = await getSubmissionById(submissionId, user);
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
  assertProgressStatusForSubmit(submission);

  const userId = getUserId(user);
  await pool.query(
    `
    UPDATE data_collection_submissions SET
      workflow_status = $2,
      village_submitted_by = $3,
      village_submitted_at = NOW(),
      review_comment = NULL,
      updated_at = CURRENT_TIMESTAMP
    WHERE submission_id = $1
    `,
    [Number(submissionId), WORKFLOW_STATUS.PENDING_WARD, userId]
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
  return updated;
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

async function submitAllDrafts(user) {
  const drafts = await listSubmissions(user, { workflowStatus: WORKFLOW_STATUS.DRAFT, limit: 200 });
  const submitted = [];
  const failed = [];
  for (const draft of drafts) {
    try {
      assertProgressStatusForSubmit(draft);
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

module.exports = {
  WORKFLOW_STATUS,
  ensureMonitoringWorkflowSchema,
  initSubmissionWorkflow,
  listSubmissions,
  getSubmissionById,
  getSubmissionDetail,
  getWorkflowSummary,
  listActions,
  updateSubmission,
  submitFromVillage,
  submitAllDrafts,
  forwardToSubcounty,
  returnToWard,
  forwardToChief,
  approveByChief,
  isVillageAdminLike,
  isWardAdminLike,
  isSubCountyAdminLike,
  isChiefOfficerLike,
};
