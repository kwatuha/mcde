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
    const queryParams = [...params];
    let idx = queryParams.length + 1;

    if (clause) where.push(clause.replace(/\?/g, () => `$${idx++}`));

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
            ar.request_id AS "approvalRequestId"
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
         WHERE COALESCE(c.voided, false) = false
           AND c."projectId" = ANY($1::int[])
           ${pendingFilter}
         ORDER BY c."requestDate" DESC NULLS LAST, c."certificateId" DESC
         LIMIT 200`,
        params
    );
    return result.rows || [];
}

async function getEngineerWorkspace(user, options = {}) {
    await checklistService.ensureSchema();

    const projects = await fetchScopedProjects(user, options);
    const projectIds = projects.map((p) => p.projectId);

    const [checklistMap, paymentRequests, certificates, pendingWorkflow] = await Promise.all([
        checklistService.getBulkChecklistSummaries(projectIds),
        fetchPaymentRequestsForWorkspace(projectIds),
        fetchCertificatesForWorkspace(user, projectIds),
        approvalWorkflowEngine.listPendingForUser(user).catch(() => []),
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
            projectsWithoutScope: projectsWithMeta.filter((p) => p.scopeStatus === 'none').length,
        },
    };
}

module.exports = {
    getEngineerWorkspace,
};
