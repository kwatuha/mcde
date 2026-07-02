const pool = require('../config/db');
const orgScope = require('./organizationScopeService');
const { isAdminLikeRequester } = require('../utils/roleUtils');
const checklistService = require('./projectFileChecklistService');
const approvalWorkflowEngine = require('./approvalWorkflowEngine');

const DB_TYPE = process.env.DB_TYPE || 'postgresql';
const isPostgres = DB_TYPE === 'postgresql';

const getScopeUserId = (user) => user?.id ?? user?.userId ?? user?.actualUserId ?? null;

const hasProjectScopeBypass = (user) => (
    isAdminLikeRequester(user) || orgScope.userHasOrganizationBypass(user?.privileges || [])
);

async function buildScopedProjectWhere(user, alias = 'p') {
    const userId = getScopeUserId(user);
    if (!userId || hasProjectScopeBypass(user) || !(await orgScope.organizationScopeTableExists())) {
        return { clause: '', params: [] };
    }
    const hasProjectScopeContext = await orgScope.userHasProjectAccessScopeContext(userId);
    const fragment = hasProjectScopeContext
        ? orgScope.buildExplicitProjectScopeFragment(alias)
        : orgScope.buildProjectListScopeFragment(alias);
    const params = hasProjectScopeContext
        ? orgScope.explicitProjectScopeParams(userId)
        : orgScope.projectScopeParamTriple(userId);
    return { clause: fragment, params };
}

async function fetchScopedProjects(user, { search = '', limit = 100 } = {}) {
    if (!isPostgres) return [];

    const { clause, params } = await buildScopedProjectWhere(user, 'p');
    const where = ['COALESCE(p.voided, false) = false'];
    const queryParams = [];
    let idx = 1;

    if (clause) {
        const scopeFragment = clause.replace(/\?/g, () => `$${idx++}`);
        where.push(scopeFragment);
        queryParams.push(...params);
    }

    const q = String(search || '').trim();
    if (q) {
        where.push(`(p.name ILIKE $${idx} OR p.data_sources->>'project_ref_num' ILIKE $${idx})`);
        queryParams.push(`%${q}%`);
        idx += 1;
    }

    const lim = Math.min(Math.max(Number(limit) || 100, 1), 200);
    queryParams.push(lim);

    const result = await pool.query(
        `SELECT
            p.project_id AS "projectId",
            p.name AS "projectName",
            p.progress->>'status' AS status,
            p.implementing_agency AS directorate,
            COALESCE(NULLIF(TRIM(p.state_department), ''), 'Unassigned') AS "departmentName",
            (SELECT COUNT(*)::int FROM project_milestones pm
             WHERE pm.project_id = p.project_id AND COALESCE(pm.voided, false) = false) AS "milestoneCount",
            (SELECT COUNT(*)::int FROM project_bq_items bq
             WHERE bq.project_id = p.project_id AND COALESCE(bq.voided, false) = false) AS "bqItemCount"
         FROM projects p
         WHERE ${where.join(' AND ')}
         ORDER BY p.updated_at DESC NULLS LAST, p.project_id DESC
         LIMIT $${idx}`,
        queryParams
    );
    return result.rows || [];
}

function scopeStatusFromCounts(row) {
    const milestoneCount = Number(row.milestoneCount || 0);
    const bqItemCount = Number(row.bqItemCount || 0);
    if (milestoneCount > 0 || bqItemCount > 0) return 'draft';
    return 'none';
}

async function fetchPaymentRequestsForWorkspace(projectIds) {
    if (!isPostgres || !projectIds.length) return [];
    await checklistService.ensureSchema();
    await approvalWorkflowEngine.ensureReady();

    const result = await pool.query(
        `WITH latest_ar AS (
            SELECT DISTINCT ON (entity_id) entity_id, request_id, status
            FROM approval_requests
            WHERE entity_type = 'payment_request'
            ORDER BY entity_id, request_id DESC
         )
         SELECT
            pr."requestId",
            pr."projectId",
            pr."contractorId",
            pr.amount,
            pr.description,
            pr."invoiceNumber",
            pr."submittedAt",
            pr.comments,
            p.name AS "projectName",
            c."companyName" AS "contractorName",
            lar.status AS "approvalWorkflowStatus",
            lar.request_id AS "approvalRequestId"
         FROM project_payment_requests pr
         LEFT JOIN projects p ON p.project_id = pr."projectId"
         LEFT JOIN contractors c ON c."contractorId" = pr."contractorId"
         LEFT JOIN latest_ar lar ON lar.entity_id = pr."requestId"::text
         WHERE COALESCE(pr.voided, false) = false
           AND pr."projectId" = ANY($1::int[])
         ORDER BY pr."submittedAt" DESC NULLS LAST, pr."requestId" DESC
         LIMIT 200`,
        [projectIds]
    );
    return result.rows || [];
}

async function fetchCertificatesForWorkspace(user, projectIds) {
    if (!isPostgres || !projectIds.length) return [];
    await approvalWorkflowEngine.ensureReady();

    const entityTypes = `('project_certificate','payment_certificate','certificate')`;
    const roleIdRaw = user?.roleId ?? user?.roleid;
    const roleId = roleIdRaw != null ? Number(roleIdRaw) : NaN;
    const canSeeAll = Array.isArray(user?.privileges)
        && (user.privileges.includes('approval_levels.update')
            || user.privileges.includes('approval_levels.read')
            || user.privileges.includes('admin.access'));

    let pendingFilter = '';
    const params = [projectIds];
    if (!canSeeAll && Number.isFinite(roleId) && roleId > 0) {
        pendingFilter = ` AND EXISTS (
            SELECT 1 FROM approval_requests ar
            INNER JOIN approval_step_instances si
              ON si.request_id = ar.request_id AND si.status = 'pending'
            WHERE ar.entity_type IN ${entityTypes}
              AND ar.entity_id = c."certificateId"::text
              AND ar.status = 'pending'
              AND si.role_id = $2
        )`;
        params.push(roleId);
    }

    const result = await pool.query(
        `SELECT
            c."certificateId",
            c."projectId",
            c."certType",
            c."certSubType",
            c."certNumber",
            c."fileName",
            c."requestDate",
            p.name AS "projectName",
            ar.status AS "approvalWorkflowStatus",
            ar.request_id AS "approvalRequestId",
            cur.step_name AS "approvalCurrentStepName",
            cur.step_order AS "approvalCurrentStepOrder",
            COALESCE(steps.total_steps, 0)::int AS "approvalTotalSteps",
            prev.step_name AS "previousStepName",
            prev.step_order AS "previousStepOrder",
            prev.approver_name AS "previousStepApproverName",
            prev.completed_at AS "previousStepApprovedAt",
            prev.role_name AS "previousStepRoleName"
         FROM projectcertificate c
         LEFT JOIN projects p ON p.project_id = c."projectId"
         LEFT JOIN LATERAL (
            SELECT r.status, r.request_id
            FROM approval_requests r
            WHERE r.entity_type IN ${entityTypes}
              AND r.entity_id = c."certificateId"::text
            ORDER BY r.request_id DESC
            LIMIT 1
         ) ar ON true
         LEFT JOIN LATERAL (
            SELECT si.step_name, si.step_order
            FROM approval_step_instances si
            WHERE si.request_id = ar.request_id AND si.status = 'pending'
            ORDER BY si.step_order ASC
            LIMIT 1
         ) cur ON ar.request_id IS NOT NULL
         LEFT JOIN LATERAL (
            SELECT
                si.step_name,
                si.step_order,
                si.completed_at,
                NULLIF(TRIM(CONCAT(COALESCE(u.firstname, ''), ' ', COALESCE(u.lastname, ''))), '') AS approver_name,
                r.name AS role_name
            FROM approval_step_instances si
            LEFT JOIN users u ON u.userid = si.completed_by
            LEFT JOIN roles r ON r.roleid = si.role_id
            WHERE si.request_id = ar.request_id AND si.status = 'approved'
            ORDER BY si.step_order DESC
            LIMIT 1
         ) prev ON ar.request_id IS NOT NULL
         LEFT JOIN LATERAL (
            SELECT COUNT(*)::int AS total_steps
            FROM approval_step_instances si
            WHERE si.request_id = ar.request_id
         ) steps ON ar.request_id IS NOT NULL
         WHERE COALESCE(c.voided, false) = false
           AND c."projectId" = ANY($1::int[])
           ${pendingFilter}
         ORDER BY c."requestDate" DESC NULLS LAST, c."certificateId" DESC
         LIMIT 200`,
        params
    );
    return result.rows || [];
}

function isResidentEngineerPriorStep(row) {
    const hay = [
        row?.previousStepRoleName,
        row?.previousStepName,
    ].filter(Boolean).join(' ').toLowerCase();
    return hay.includes('resident') && hay.includes('engineer');
}

function countCertificatesWithPriorApproval(certificates) {
    return (certificates || []).filter((row) => {
        const status = String(row.approvalWorkflowStatus || '').toLowerCase();
        if (status !== 'pending') return false;
        return Boolean(row.previousStepApproverName || row.previousStepRoleName || row.previousStepName);
    }).length;
}

function countResidentEngineerApprovedPending(certificates) {
    return (certificates || []).filter((row) => {
        const status = String(row.approvalWorkflowStatus || '').toLowerCase();
        return status === 'pending' && isResidentEngineerPriorStep(row);
    }).length;
}

async function fetchProgressPhotosForWorkspace(projectIds, { projectId, status } = {}) {
    if (!isPostgres || !projectIds.length) return [];

    const params = [projectIds];
    let idx = 2;
    const filters = [
        'pd."projectId" = ANY($1::int[])',
        `pd."documentType" = 'photo'`,
        `pd."documentCategory" = 'progress'`,
        'COALESCE(pd.voided, false) = false',
    ];

    if (projectId) {
        filters.push(`pd."projectId" = $${idx}`);
        params.push(Number(projectId));
        idx += 1;
    }

    const statusFilter = String(status || '').trim().toLowerCase();
    if (statusFilter === 'pending_review' || statusFilter === 'pending') {
        filters.push(`LOWER(COALESCE(pd.status, '')) IN ('pending_review', 'pending', 'submitted', '')`);
    } else if (statusFilter && statusFilter !== 'all') {
        filters.push(`LOWER(COALESCE(pd.status, '')) = $${idx}`);
        params.push(statusFilter);
        idx += 1;
    }

    const result = await pool.query(
        `SELECT
            pd.id AS "photoId",
            pd."projectId",
            p.name AS "projectName",
            pd."milestoneId",
            pm.milestone_name AS "milestoneName",
            pm.sequence_order AS "milestoneSequenceOrder",
            pd."documentPath" AS "filePath",
            pd."originalFileName",
            pd.description AS caption,
            pd.status,
            pd."createdAt" AS "submittedAt",
            c."companyName" AS "contractorName"
         FROM project_documents pd
         INNER JOIN projects p ON p.project_id = pd."projectId"
         LEFT JOIN project_milestones pm
           ON pm.milestone_id = pd."milestoneId"
          AND COALESCE(pm.voided, false) = false
         LEFT JOIN contractors c
           ON c."userId" = pd."userId"
          AND COALESCE(c.voided, false) = false
         WHERE ${filters.join(' AND ')}
         ORDER BY
            pd."projectId" ASC,
            COALESCE(pm.sequence_order, 2147483647) ASC,
            pd."createdAt" DESC
         LIMIT 500`,
        params
    );
    return result.rows || [];
}

async function fetchProgressPhotoSummary(projectIds) {
    if (!isPostgres || !projectIds.length) {
        return { totalPhotos: 0, pendingReview: 0 };
    }

    const result = await pool.query(
        `SELECT
            COUNT(*)::int AS "totalPhotos",
            COUNT(*) FILTER (
                WHERE LOWER(COALESCE(pd.status, '')) IN ('pending_review', 'pending', 'submitted', '')
                   OR pd.status IS NULL
            )::int AS "pendingReview"
         FROM project_documents pd
         WHERE pd."projectId" = ANY($1::int[])
           AND pd."documentType" = 'photo'
           AND pd."documentCategory" = 'progress'
           AND COALESCE(pd.voided, false) = false`,
        [projectIds]
    );
    const row = result.rows?.[0] || {};
    return {
        totalPhotos: Number(row.totalPhotos || 0),
        pendingReview: Number(row.pendingReview || 0),
    };
}

function countPendingProgressPhotos(photos) {
    return (photos || []).filter((row) => {
        const st = String(row.status || '').toLowerCase();
        return !st || st.includes('pending') || st.includes('review') || st.includes('submitted');
    }).length;
}

async function getEngineerProgressPhotos(user, options = {}) {
    const projects = await fetchScopedProjects(user, { limit: options.limit || 120 });
    const projectIds = projects.map((p) => p.projectId);
    const photos = await fetchProgressPhotosForWorkspace(projectIds, options);
    return {
        projects: projects.map((p) => ({ projectId: p.projectId, projectName: p.projectName })),
        photos,
        summary: {
            totalPhotos: photos.length,
            pendingReview: countPendingProgressPhotos(photos),
            projectCount: new Set(photos.map((p) => p.projectId)).size,
        },
    };
}

async function getEngineerWorkspace(user, options = {}) {
    await checklistService.ensureSchema();

    const projects = await fetchScopedProjects(user, options);
    const projectIds = projects.map((p) => p.projectId);

    const [checklistMap, paymentRequests, certificates, pendingWorkflow, progressPhotoSummary] = await Promise.all([
        checklistService.getBulkChecklistSummaries(projectIds),
        fetchPaymentRequestsForWorkspace(projectIds),
        fetchCertificatesForWorkspace(user, projectIds),
        approvalWorkflowEngine.listPendingForUser(user).catch(() => []),
        fetchProgressPhotoSummary(projectIds),
    ]);

    const projectsWithMeta = projects.map((p) => ({
        ...p,
        scopeStatus: scopeStatusFromCounts(p),
        fileCompliance: checklistMap[p.projectId] || {
            requiredItems: 0,
            satisfiedRequired: 0,
            completionPct: 0,
        },
    }));

    const paymentRequestsWithCompliance = paymentRequests.map((row) => ({
        ...row,
        fileCompliance: checklistMap[row.projectId] || {
            requiredItems: 0,
            satisfiedRequired: 0,
            completionPct: 0,
        },
    }));

    const pendingCertificates = (pendingWorkflow || []).filter((row) => {
        const et = String(row.entity_type || row.entityType || '').toLowerCase();
        return et === 'project_certificate' || et === 'payment_certificate' || et === 'certificate';
    });
    const pendingPaymentRequests = (pendingWorkflow || []).filter((row) => {
        const et = String(row.entity_type || row.entityType || '').toLowerCase();
        return et === 'payment_request';
    });

    return {
        projects: projectsWithMeta,
        paymentRequests: paymentRequestsWithCompliance,
        certificates,
        pendingWorkflow: {
            certificates: pendingCertificates,
            paymentRequests: pendingPaymentRequests,
            all: pendingWorkflow || [],
        },
        summary: {
            projectCount: projectsWithMeta.length,
            avgFileCompliancePct: projectsWithMeta.length
                ? Math.round(
                    projectsWithMeta.reduce((sum, p) => sum + (p.fileCompliance?.completionPct || 0), 0)
                        / projectsWithMeta.length
                )
                : 0,
            openPaymentRequests: paymentRequests.filter((r) => {
                const st = String(r.approvalWorkflowStatus || '').toLowerCase();
                return !st || st === 'pending';
            }).length,
            pendingCertificates: pendingCertificates.length,
            certificatesWithPriorApproval: countCertificatesWithPriorApproval(certificates),
            residentEngineerApprovedPending: countResidentEngineerApprovedPending(certificates),
            projectsWithoutScope: projectsWithMeta.filter((p) => p.scopeStatus === 'none').length,
            progressPhotos: progressPhotoSummary.totalPhotos,
            progressPhotosPendingReview: progressPhotoSummary.pendingReview,
        },
    };
}

module.exports = {
    getEngineerWorkspace,
    getEngineerProgressPhotos,
};
