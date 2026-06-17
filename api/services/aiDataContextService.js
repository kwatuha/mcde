const pool = require('../config/db');
const orgScope = require('./organizationScopeService');
const { isSuperAdminRequester } = require('../utils/roleUtils');

const MAX_CONTEXT_CHARS = Number(process.env.OPENAI_DATA_CONTEXT_MAX_CHARS || 12000);

const getScopeUserId = (user) => user?.id ?? user?.userId ?? user?.userid ?? user?.actualUserId ?? null;

const statusExpr = (alias = 'p') => `COALESCE(NULLIF(TRIM(${alias}.progress->>'status'), ''), 'Other')`;
const budgetExpr = (alias = 'p') => `CASE WHEN (${alias}.budget->>'allocated_amount_kes') ~ '^[0-9]+(\\.[0-9]+){0,1}$' THEN (${alias}.budget->>'allocated_amount_kes')::numeric ELSE 0 END`;
const paidExpr = (alias = 'p') => `CASE WHEN (${alias}.budget->>'disbursed_amount_kes') ~ '^[0-9]+(\\.[0-9]+){0,1}$' THEN (${alias}.budget->>'disbursed_amount_kes')::numeric ELSE 0 END`;
const progressExpr = (alias = 'p') => `CASE WHEN (${alias}.progress->>'percentage_complete') ~ '^[0-9]+(\\.[0-9]+){0,1}$' THEN (${alias}.progress->>'percentage_complete')::numeric ELSE NULL END`;

function cleanText(value) {
    return String(value || '').trim();
}

function pageEntity(context = {}) {
    return context?.page && typeof context.page === 'object' ? context.page : context;
}

function latestUserMessage(messages = []) {
    return [...(Array.isArray(messages) ? messages : [])]
        .reverse()
        .find((message) => message?.role === 'user')?.content || '';
}

function detectNeedsData(question, context = {}) {
    const page = pageEntity(context);
    if (page.projectId || page.budgetId || page.adpPlanId) return true;
    const text = `${question} ${context?.path || ''} ${context?.title || ''} ${page.pageType || ''}`.toLowerCase();
    return /\b(project|projects|status|budget|paid|payment|finance|pending|bill|cidp|adp|programme|program|subprogram|ward|subcounty|sub-county|sublocation|village|dashboard|report|milestone|procurement|contract|stalled|ongoing|completed|implementation|absorption|monitoring|gap|attention|summarize|summary|how many|which|compare|linkage|linked|unbudgeted)\b/.test(text);
}

function detectStatus(question) {
    const text = question.toLowerCase();
    if (/\bcompleted|complete\b/.test(text)) return 'completed';
    if (/\bongoing|on-going|on going|progress\b/.test(text)) return 'ongoing';
    if (/\bstalled|delayed|stuck\b/.test(text)) return 'stalled';
    if (/\bprocurement|tender\b/.test(text)) return 'procurement';
    if (/\bsuspended\b/.test(text)) return 'suspended';
    if (/\bnot started|not-started|unstarted|to be initiated\b/.test(text)) return 'not started';
    return '';
}

function detectIntents(question, context = {}) {
    const page = pageEntity(context);
    const text = `${question} ${context?.path || ''}`.toLowerCase();
    const intents = new Set(['projects']);

    if (page.projectId || /\/projects\/\d+/.test(text)) intents.add('projectDetail');
    if (page.budgetId || /\bbudget|container|wishlist\b/.test(text)) intents.add('budget');
    if (page.adpPlanId || /\badp|annual development|wishlist\b/.test(text)) intents.add('adp');
    if (/\bcidp|programme|program|subprogram|linkage\b/.test(text)) intents.add('cidp');
    if (/\bmonitor|stalled|attention|risk|warning|challenge\b/.test(text)) intents.add('monitoring');
    if (/\bward|subcounty|sub-county|sublocation|village|location|regional\b/.test(text)) intents.add('location');
    if (/\bpaid|payment|finance|absorption|disbursed\b/.test(text)) intents.add('finance');

    return [...intents];
}

function extractSearchTerms(question) {
    const stop = new Set([
        'show', 'list', 'give', 'tell', 'summarize', 'summary', 'explain', 'what', 'which', 'are', 'the', 'for', 'and',
        'with', 'about', 'projects', 'project', 'status', 'budget', 'paid', 'finance', 'report', 'dashboard', 'in', 'my',
        'ward', 'subcounty', 'sub', 'county', 'cidp', 'adp', 'ongoing', 'completed', 'stalled', 'this', 'current',
    ]);
    return question
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, ' ')
        .split(/\s+/)
        .map((part) => part.trim())
        .filter((part) => part.length >= 4 && !stop.has(part))
        .slice(0, 4);
}

async function userHasProjectScopeContext(userId) {
    const uid = parseInt(String(userId), 10);
    if (!Number.isFinite(uid)) return false;
    try {
        const [scopeRowsResult, profileResult] = await Promise.all([
            orgScope.fetchOrganizationScopesForUser(uid),
            pool.query(
                `SELECT agency_id, ministry, state_department
                 FROM users
                 WHERE userid = $1 AND COALESCE(voided, false) = false
                 LIMIT 1`,
                [uid]
            ),
        ]);
        if ((scopeRowsResult || []).length > 0) return true;
        if (await orgScope.userHasProjectAccessScopeContext(uid)) return true;
        const profile = profileResult?.rows?.[0];
        return Boolean(
            profile &&
            (
                profile.agency_id !== null ||
                cleanText(profile.ministry) ||
                cleanText(profile.state_department)
            )
        );
    } catch (error) {
        console.warn('[ai_data_context] scope profile lookup failed:', error.message);
        return false;
    }
}

async function addProjectScopeWhere(user, where, params, alias = 'p') {
    const authUserId = getScopeUserId(user);
    const authPrivileges = user?.privileges || [];
    if (!authUserId) {
        where.push('FALSE');
        return;
    }
    if (isSuperAdminRequester(user) || orgScope.userHasOrganizationBypass(authPrivileges)) return;
    if (!(await orgScope.organizationScopeTableExists())) {
        where.push('FALSE');
        return;
    }
    const hasProjectScopes = await orgScope.userHasProjectAccessScopeContext(authUserId);
    if (!hasProjectScopes && !(await userHasProjectScopeContext(authUserId))) return;

    let nextIndex = params.length + 1;
    const rawScopeFragment = hasProjectScopes
        ? orgScope.buildExplicitProjectScopeFragment(alias)
        : orgScope.buildProjectListScopeFragment(alias);
    const scopeParams = hasProjectScopes
        ? orgScope.explicitProjectScopeParams(authUserId)
        : orgScope.projectScopeParamTriple(authUserId);
    const scopeFragment = rawScopeFragment.replace(/\?/g, () => `$${nextIndex++}`);
    where.push(scopeFragment);
    params.push(...scopeParams);
}

async function scopedWhere(user, alias = 'p') {
    const where = [`COALESCE(${alias}.voided, false) = false`];
    const params = [];
    await addProjectScopeWhere(user, where, params, alias);
    return { where, params };
}

async function getProjectSummary(user) {
    const { where, params } = await scopedWhere(user);
    const result = await pool.query(
        `
        SELECT
            COUNT(*)::int AS "totalProjects",
            COALESCE(SUM(${budgetExpr('p')}), 0)::numeric AS "totalBudget",
            COALESCE(SUM(${paidExpr('p')}), 0)::numeric AS "totalPaid",
            AVG(${progressExpr('p')})::numeric AS "averageProgress"
        FROM projects p
        WHERE ${where.join(' AND ')}
        `,
        params
    );
    return result.rows?.[0] || {};
}

async function getStatusBreakdown(user) {
    const { where, params } = await scopedWhere(user);
    const result = await pool.query(
        `
        SELECT
            ${statusExpr('p')} AS status,
            COUNT(*)::int AS count,
            COALESCE(SUM(${budgetExpr('p')}), 0)::numeric AS budget,
            COALESCE(SUM(${paidExpr('p')}), 0)::numeric AS paid
        FROM projects p
        WHERE ${where.join(' AND ')}
        GROUP BY ${statusExpr('p')}
        ORDER BY count DESC, status ASC
        LIMIT 12
        `,
        params
    );
    return result.rows || [];
}

async function getMatchingProjects(user, question) {
    const { where, params } = await scopedWhere(user);
    const status = detectStatus(question);
    if (status) {
        params.push(`%${status}%`);
        where.push(`LOWER(${statusExpr('p')}) LIKE $${params.length}`);
    }
    const terms = extractSearchTerms(question);
    terms.forEach((term) => {
        params.push(`%${term}%`);
        where.push(`(
            LOWER(COALESCE(p.name, '')) LIKE $${params.length}
            OR LOWER(COALESCE(p.state_department, '')) LIKE $${params.length}
            OR LOWER(COALESCE(p.location->>'ward', '')) LIKE $${params.length}
            OR LOWER(COALESCE(p.location->>'subcounty', '')) LIKE $${params.length}
            OR LOWER(COALESCE(p.location->>'sublocation', '')) LIKE $${params.length}
            OR LOWER(COALESCE(p.location->>'village', '')) LIKE $${params.length}
        )`);
    });
    params.push(10);
    const result = await pool.query(
        `
        SELECT
            p.project_id AS "projectId",
            p.name AS "projectName",
            ${statusExpr('p')} AS status,
            COALESCE(NULLIF(TRIM(p.state_department), ''), 'Unassigned') AS department,
            COALESCE(NULLIF(TRIM(p.location->>'subcounty'), ''), '') AS subcounty,
            COALESCE(NULLIF(TRIM(p.location->>'ward'), ''), '') AS ward,
            COALESCE(NULLIF(TRIM(p.location->>'sublocation'), ''), '') AS sublocation,
            COALESCE(NULLIF(TRIM(p.location->>'village'), ''), '') AS village,
            ${budgetExpr('p')} AS budget,
            ${paidExpr('p')} AS paid,
            ${progressExpr('p')} AS progress
        FROM projects p
        WHERE ${where.join(' AND ')}
        ORDER BY ${budgetExpr('p')} DESC NULLS LAST, p.project_id DESC
        LIMIT $${params.length}
        `,
        params
    );
    return result.rows || [];
}

async function getStalledProjects(user) {
    const { where, params } = await scopedWhere(user);
    params.push('%stall%');
    where.push(`LOWER(${statusExpr('p')}) LIKE $${params.length}`);
    params.push(8);
    const result = await pool.query(
        `
        SELECT
            p.project_id AS "projectId",
            p.name AS "projectName",
            ${statusExpr('p')} AS status,
            COALESCE(NULLIF(TRIM(p.location->>'ward'), ''), 'Unknown ward') AS ward,
            ${budgetExpr('p')} AS budget,
            ${progressExpr('p')} AS progress
        FROM projects p
        WHERE ${where.join(' AND ')}
        ORDER BY ${budgetExpr('p')} DESC NULLS LAST
        LIMIT $${params.length}
        `,
        params
    );
    return result.rows || [];
}

async function getLocationBreakdown(user) {
    const { where, params } = await scopedWhere(user);
    const result = await pool.query(
        `
        SELECT
            COALESCE(NULLIF(TRIM(p.location->>'subcounty'), ''), 'Unspecified subcounty') AS subcounty,
            COALESCE(NULLIF(TRIM(p.location->>'ward'), ''), 'Unspecified ward') AS ward,
            COUNT(*)::int AS count,
            COALESCE(SUM(${budgetExpr('p')}), 0)::numeric AS budget
        FROM projects p
        WHERE ${where.join(' AND ')}
        GROUP BY subcounty, ward
        ORDER BY count DESC, budget DESC
        LIMIT 10
        `,
        params
    );
    return result.rows || [];
}

async function getProjectDetail(user, projectId) {
    const id = parseInt(String(projectId), 10);
    if (!Number.isFinite(id)) return null;
    const { where, params } = await scopedWhere(user);
    params.push(id);
    where.push(`p.project_id = $${params.length}`);

    const result = await pool.query(
        `
        SELECT
            p.project_id AS "projectId",
            p.name AS "projectName",
            ${statusExpr('p')} AS status,
            COALESCE(NULLIF(TRIM(p.state_department), ''), 'Unassigned') AS department,
            COALESCE(NULLIF(TRIM(p.sector), ''), '') AS sector,
            COALESCE(NULLIF(TRIM(p.location->>'subcounty'), ''), '') AS subcounty,
            COALESCE(NULLIF(TRIM(p.location->>'ward'), ''), '') AS ward,
            COALESCE(NULLIF(TRIM(p.location->>'sublocation'), ''), '') AS sublocation,
            COALESCE(NULLIF(TRIM(p.location->>'village'), ''), '') AS village,
            ${budgetExpr('p')} AS budget,
            ${paidExpr('p')} AS paid,
            ${progressExpr('p')} AS progress,
            COALESCE(NULLIF(TRIM(p.notes->>'program_id'), ''), '') AS cidpProgramId,
            COALESCE(NULLIF(TRIM(p.notes->>'subprogram_id'), ''), '') AS cidpSubprogramId
        FROM projects p
        WHERE ${where.join(' AND ')}
        LIMIT 1
        `,
        params
    );
    const project = result.rows?.[0];
    if (!project) return null;

    const [cidpLink, adpLink, monitoring] = await Promise.all([
        pool.query(
            `
            SELECT
                COALESCE(pr.programme, pr."programName") AS programme,
                COALESCE(sp."subProgramme", sp."subProgramName") AS subprogramme
            FROM programs pr
            LEFT JOIN subprograms sp ON sp."subProgramId" = CASE
                WHEN $2 ~ '^[0-9]+$' THEN $2::bigint ELSE NULL END
            WHERE pr."programId" = CASE WHEN $1 ~ '^[0-9]+$' THEN $1::bigint ELSE NULL END
            LIMIT 1
            `,
            [String(project.cidpProgramId || ''), String(project.cidpSubprogramId || '')]
        ).then((r) => r.rows?.[0] || null).catch(() => null),
        pool.query(
            `
            SELECT
                adpp.project_name AS "adpProjectName",
                adpg.sector_name AS "sectorName",
                adpg.programme_name AS "programmeName",
                adpp.plan_status AS "planStatus",
                adpp.estimated_cost AS "estimatedCost"
            FROM adp_project_links l
            INNER JOIN adp_projects adpp ON adpp.id = l.adp_project_id AND COALESCE(adpp.voided, false) = false
            LEFT JOIN adp_programmes adpg ON adpg.id = adpp.adp_programme_id
            WHERE l.project_id = $1 AND COALESCE(l.voided, false) = false
            ORDER BY l.id DESC
            LIMIT 1
            `,
            [id]
        ).then((r) => r.rows?.[0] || null).catch(() => null),
        pool.query(
            `
            SELECT
                m.comment,
                m.warning_level AS "warningLevel",
                COALESCE(m.observation_date, m.created_at::date) AS "observationDate"
            FROM project_monitoring_records m
            WHERE m.project_id = $1 AND COALESCE(m.voided, false) = false
            ORDER BY COALESCE(m.observation_date, m.created_at::date) DESC NULLS LAST, m.record_id DESC
            LIMIT 3
            `,
            [id]
        ).then((r) => r.rows || []).catch(() => []),
    ]);

    return { ...project, cidpLink, adpLink, monitoring };
}

async function getCidpSummary(user) {
    const { where, params } = await scopedWhere(user);
    const summaryResult = await pool.query(
        `
        SELECT
            COUNT(*)::int AS "totalProjects",
            COUNT(*) FILTER (WHERE (p.notes->>'program_id') ~ '^[0-9]+$')::int AS "linkedToProgramme",
            COUNT(*) FILTER (WHERE (p.notes->>'subprogram_id') ~ '^[0-9]+$')::int AS "linkedToSubprogramme"
        FROM projects p
        WHERE ${where.join(' AND ')}
        `,
        params
    );
    const topResult = await pool.query(
        `
        SELECT
            COALESCE(cidp_pr.programme, cidp_pr."programName", 'Unlinked') AS programme,
            COALESCE(cidp_sp."subProgramme", cidp_sp."subProgramName", 'No subprogramme') AS subprogramme,
            COUNT(*)::int AS count
        FROM projects p
        LEFT JOIN programs cidp_pr
          ON cidp_pr."programId" = CASE WHEN (p.notes->>'program_id') ~ '^[0-9]+$' THEN (p.notes->>'program_id')::bigint ELSE NULL END
         AND COALESCE(cidp_pr.voided, false) = false
        LEFT JOIN subprograms cidp_sp
          ON cidp_sp."subProgramId" = CASE WHEN (p.notes->>'subprogram_id') ~ '^[0-9]+$' THEN (p.notes->>'subprogram_id')::bigint ELSE NULL END
         AND COALESCE(cidp_sp.voided, false) = false
        WHERE ${where.join(' AND ')}
        GROUP BY programme, subprogramme
        ORDER BY count DESC
        LIMIT 8
        `,
        params
    );
    return {
        summary: summaryResult.rows?.[0] || {},
        topLinkages: topResult.rows || [],
    };
}

async function getAdpSummary(user, adpPlanId = null) {
    const params = [];
    const where = ['COALESCE(ap.voided, false) = false', 'COALESCE(adpp.voided, false) = false'];
    if (adpPlanId) {
        params.push(Number(adpPlanId));
        where.push(`ap.id = $${params.length}`);
    }

    const projectScopeWhere = ['COALESCE(p.voided, false) = false'];
    await addProjectScopeWhere(user, projectScopeWhere, params, 'p');
    const projectScopeSql = projectScopeWhere.join(' AND ');

    const result = await pool.query(
        `
        WITH scoped_linked_projects AS (
            SELECT
                l.adp_project_id,
                COUNT(DISTINCT p.project_id)::int AS linked_project_count,
                COALESCE(SUM(${budgetExpr('p')}), 0)::numeric AS actual_budget,
                COALESCE(SUM(${paidExpr('p')}), 0)::numeric AS actual_paid
            FROM adp_project_links l
            INNER JOIN projects p ON p.project_id = l.project_id
            WHERE COALESCE(l.voided, false) = false
              AND ${projectScopeSql}
            GROUP BY l.adp_project_id
        ),
        budgeted_adp_projects AS (
            SELECT
                bi.adpprojectid AS adp_project_id,
                COUNT(DISTINCT bi.budgetid)::int AS budget_count,
                COALESCE(SUM(COALESCE(bi.amount, adpp.estimated_cost, 0)), 0)::numeric AS budgeted_amount
            FROM budget_items bi
            INNER JOIN budgets b ON b.budgetid = bi.budgetid AND COALESCE(b.voided, false) = false
            INNER JOIN adp_projects adpp ON adpp.id = bi.adpprojectid AND COALESCE(adpp.voided, false) = false
            WHERE bi.adpprojectid IS NOT NULL
              AND COALESCE(bi.voided, false) = false
            GROUP BY bi.adpprojectid
        )
        SELECT
            ap.adp_name AS "adpName",
            ap.financial_year AS "financialYear",
            COUNT(DISTINCT adpp.id)::int AS "plannedProjects",
            COALESCE(SUM(adpp.estimated_cost), 0)::numeric AS "plannedBudget",
            COUNT(DISTINCT adpp.id) FILTER (WHERE bap.budget_count > 0)::int AS "budgetedAdpProjects",
            COALESCE(SUM(bap.budgeted_amount), 0)::numeric AS "budgetedAmount",
            COALESCE(SUM(slp.linked_project_count), 0)::int AS "linkedProjects",
            COUNT(DISTINCT adpp.id) FILTER (WHERE slp.linked_project_count > 0)::int AS "linkedAdpProjects",
            COALESCE(SUM(slp.actual_budget), 0)::numeric AS "actualBudget",
            COALESCE(SUM(slp.actual_paid), 0)::numeric AS "actualPaid"
        FROM adp_plans ap
        LEFT JOIN adp_projects adpp ON adpp.adp_plan_id = ap.id AND COALESCE(adpp.voided, false) = false
        LEFT JOIN scoped_linked_projects slp ON slp.adp_project_id = adpp.id
        LEFT JOIN budgeted_adp_projects bap ON bap.adp_project_id = adpp.id
        WHERE ${where.join(' AND ')}
        GROUP BY ap.adp_name, ap.financial_year
        `,
        params
    );
    return result.rows?.[0] || null;
}

async function getAdpGaps(user, adpPlanId = null) {
    const params = [];
    const where = ['COALESCE(ap.voided, false) = false', 'COALESCE(adpp.voided, false) = false'];
    if (adpPlanId) {
        params.push(Number(adpPlanId));
        where.push(`ap.id = $${params.length}`);
    }
    params.push(8);
    const result = await pool.query(
        `
        WITH budgeted AS (
            SELECT DISTINCT bi.adpprojectid AS adp_project_id
            FROM budget_items bi
            WHERE bi.adpprojectid IS NOT NULL AND COALESCE(bi.voided, false) = false
        ),
        linked AS (
            SELECT DISTINCT l.adp_project_id
            FROM adp_project_links l
            WHERE COALESCE(l.voided, false) = false
        )
        SELECT
            adpp.id,
            adpp.project_name AS "projectName",
            adpg.sector_name AS "sectorName",
            adpp.estimated_cost AS "estimatedCost",
            adpp.plan_status AS "planStatus",
            CASE WHEN b.adp_project_id IS NULL THEN true ELSE false END AS "notBudgeted",
            CASE WHEN l.adp_project_id IS NULL THEN true ELSE false END AS "notLinked"
        FROM adp_projects adpp
        INNER JOIN adp_plans ap ON ap.id = adpp.adp_plan_id
        LEFT JOIN adp_programmes adpg ON adpg.id = adpp.adp_programme_id
        LEFT JOIN budgeted b ON b.adp_project_id = adpp.id
        LEFT JOIN linked l ON l.adp_project_id = adpp.id
        WHERE ${where.join(' AND ')}
          AND (b.adp_project_id IS NULL OR l.adp_project_id IS NULL)
        ORDER BY adpp.estimated_cost DESC NULLS LAST, adpp.id DESC
        LIMIT $${params.length}
        `,
        params
    );
    return result.rows || [];
}

async function getBudgetDetail(budgetId) {
    const id = parseInt(String(budgetId), 10);
    if (!Number.isFinite(id)) return null;
    const result = await pool.query(
        `
        SELECT
            b.budgetid AS "budgetId",
            b.budgetname AS "budgetName",
            b.status,
            b.totalamount AS "totalAmount",
            b.adpplanid AS "adpPlanId",
            ap.adp_name AS "adpPlanName",
            ap.financial_year AS "financialYear",
            fy.name AS "finYearName",
            d.name AS "departmentName",
            COUNT(bi.itemid) FILTER (WHERE COALESCE(bi.voided, false) = false)::int AS "itemCount",
            COUNT(bi.itemid) FILTER (WHERE COALESCE(bi.voided, false) = false AND bi.adpprojectid IS NOT NULL)::int AS "adpItemCount",
            COALESCE(SUM(CASE WHEN COALESCE(bi.voided, false) = false THEN bi.amount ELSE 0 END), 0)::numeric AS "itemsTotal"
        FROM budgets b
        LEFT JOIN adp_plans ap ON ap.id = b.adpplanid
        LEFT JOIN financial_years fy ON fy.financialyearid = b.finyearid
        LEFT JOIN departments d ON d.departmentid = b.departmentid
        LEFT JOIN budget_items bi ON bi.budgetid = b.budgetid
        WHERE b.budgetid = $1 AND COALESCE(b.voided, false) = false
        GROUP BY b.budgetid, b.budgetname, b.status, b.totalamount, b.adpplanid, ap.adp_name, ap.financial_year, fy.name, d.name
        LIMIT 1
        `,
        [id]
    );
    return result.rows?.[0] || null;
}

async function getMonitoringHighlights(user) {
    const { where, params } = await scopedWhere(user, 'p');
    params.push(6);
    const result = await pool.query(
        `
        SELECT
            p.project_id AS "projectId",
            p.name AS "projectName",
            m.warning_level AS "warningLevel",
            LEFT(COALESCE(m.comment, ''), 180) AS comment,
            COALESCE(m.observation_date, m.created_at::date) AS "observationDate"
        FROM project_monitoring_records m
        INNER JOIN projects p ON p.project_id = m.project_id
        WHERE COALESCE(m.voided, false) = false
          AND ${where.join(' AND ')}
          AND (
            LOWER(COALESCE(m.warning_level, '')) IN ('high', 'medium')
            OR LOWER(${statusExpr('p')}) LIKE '%stall%'
          )
        ORDER BY COALESCE(m.observation_date, m.created_at::date) DESC NULLS LAST
        LIMIT $${params.length}
        `,
        params
    );
    return result.rows || [];
}

function money(value) {
    return Number(value || 0).toLocaleString('en-KE', { maximumFractionDigits: 0 });
}

function formatPageContext(context = {}) {
    const page = pageEntity(context);
    const lines = [];
    if (!Object.keys(page).length) return '';

    lines.push('CURRENT PAGE CONTEXT:');
    if (page.pageType) lines.push(`- Page type: ${page.pageType}`);
    if (page.projectId) {
        lines.push(`- Active project ID: ${page.projectId}`);
        if (page.projectName) lines.push(`- Project name: ${page.projectName}`);
        if (page.status) lines.push(`- Project status: ${page.status}`);
        if (page.department) lines.push(`- Department: ${page.department}`);
        if (page.ward || page.subcounty) {
            lines.push(`- Location: ${[page.subcounty, page.ward, page.sublocation, page.village].filter(Boolean).join(' > ') || 'not set'}`);
        }
        if (page.budget != null) lines.push(`- Project budget: KES ${money(page.budget)}`);
        if (page.paid != null) lines.push(`- Project paid: KES ${money(page.paid)}`);
        if (page.progress != null) lines.push(`- Progress: ${Number(page.progress).toFixed(1)}%`);
        if (page.cidpProgramme) lines.push(`- CIDP programme: ${page.cidpProgramme}`);
        if (page.adpProjectName) lines.push(`- Linked ADP project: ${page.adpProjectName}`);
    }
    if (page.budgetId) {
        lines.push(`- Active budget ID: ${page.budgetId}`);
        if (page.budgetName) lines.push(`- Budget name: ${page.budgetName}`);
        if (page.finYearName) lines.push(`- Financial year: ${page.finYearName}`);
        if (page.adpPlanName) lines.push(`- Linked ADP plan: ${page.adpPlanName}`);
        if (page.itemCount != null) lines.push(`- Budget items: ${page.itemCount}`);
        if (page.totalAmount != null) lines.push(`- Budget total: KES ${money(page.totalAmount)}`);
    }
    if (page.adpPlanId || page.adpPlanName) {
        if (page.adpPlanId) lines.push(`- Active ADP plan ID: ${page.adpPlanId}`);
        if (page.adpPlanName) lines.push(`- ADP plan: ${page.adpPlanName}`);
        if (page.adpFinancialYear) lines.push(`- ADP financial year: ${page.adpFinancialYear}`);
        if (page.summary) {
            const s = page.summary;
            lines.push(`- ADP KPI snapshot: ${s.plannedProjects || 0} planned; ${s.budgetedAdpProjects || 0} budgeted; ${s.linkedProjects || 0} linked registry projects.`);
        }
    }
    if (page.screenSummary && typeof page.screenSummary === 'object') {
        const parts = Object.entries(page.screenSummary)
            .filter(([, value]) => value != null && value !== '')
            .map(([key, value]) => {
                const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, (char) => char.toUpperCase());
                if (typeof value === 'number' && /budget|paid|pending|amount|cost|total|contract/i.test(key)) {
                    return `${label}: KES ${money(value)}`;
                }
                return `${label}: ${value}`;
            });
        if (parts.length) lines.push(`- Screen snapshot: ${parts.join('; ')}.`);
    }
    if (page.filters && typeof page.filters === 'object') {
        const active = Object.entries(page.filters)
            .filter(([, value]) => String(value ?? '').trim() !== '')
            .map(([key, value]) => `${key}=${value}`);
        if (active.length) lines.push(`- Active filters: ${active.join(', ')}.`);
    }
    return lines.join('\n');
}

function formatDataContext(context) {
    const lines = [
        'Retrieved live system data (restricted to the logged-in user scope):',
    ];
    if (context.pageContextText) {
        lines.push(context.pageContextText);
    }
    if (context.projectSummary) {
        const s = context.projectSummary;
        lines.push(`- Project summary: ${s.totalProjects || 0} projects; budget KES ${money(s.totalBudget)}; paid KES ${money(s.totalPaid)}; average progress ${Number(s.averageProgress || 0).toFixed(1)}%.`);
    }
    if (context.statusBreakdown?.length) {
        lines.push('- Status breakdown:');
        context.statusBreakdown.forEach((row) => {
            lines.push(`  - ${row.status}: ${row.count} projects; budget KES ${money(row.budget)}; paid KES ${money(row.paid)}.`);
        });
    }
    if (context.stalledProjects?.length) {
        lines.push('- Stalled / at-risk projects:');
        context.stalledProjects.forEach((p) => {
            lines.push(`  - #${p.projectId} ${p.projectName}; ${p.status}; ${p.ward}; budget KES ${money(p.budget)}.`);
        });
    }
    if (context.locationBreakdown?.length) {
        lines.push('- Location breakdown:');
        context.locationBreakdown.forEach((row) => {
            lines.push(`  - ${row.subcounty} / ${row.ward}: ${row.count} projects; budget KES ${money(row.budget)}.`);
        });
    }
    if (context.matchingProjects?.length) {
        lines.push('- Top matching projects (limited to 10):');
        context.matchingProjects.forEach((p) => {
            const location = [p.subcounty, p.ward, p.sublocation, p.village].filter(Boolean).join(' > ');
            lines.push(`  - #${p.projectId} ${p.projectName}; status ${p.status}; department ${p.department}; ${location || 'location not set'}; budget KES ${money(p.budget)}; paid KES ${money(p.paid)}; progress ${p.progress == null ? 'N/A' : `${Number(p.progress).toFixed(1)}%`}.`);
        });
    }
    if (context.projectDetail) {
        const p = context.projectDetail;
        const location = [p.subcounty, p.ward, p.sublocation, p.village].filter(Boolean).join(' > ');
        lines.push(`- Active project detail: #${p.projectId} ${p.projectName}; status ${p.status}; department ${p.department}; ${location || 'location not set'}; budget KES ${money(p.budget)}; paid KES ${money(p.paid)}; progress ${p.progress == null ? 'N/A' : `${Number(p.progress).toFixed(1)}%`}.`);
        if (p.cidpLink?.programme) lines.push(`  - CIDP link: ${p.cidpLink.programme}${p.cidpLink.subprogramme ? ` / ${p.cidpLink.subprogramme}` : ''}.`);
        if (p.adpLink?.adpProjectName) lines.push(`  - ADP link: ${p.adpLink.adpProjectName} (${p.adpLink.sectorName || 'sector n/a'}); status ${p.adpLink.planStatus || 'n/a'}; cost KES ${money(p.adpLink.estimatedCost)}.`);
        if (p.monitoring?.length) {
            lines.push('  - Recent monitoring notes:');
            p.monitoring.forEach((m) => {
                lines.push(`    - ${m.observationDate || 'n/a'} [${m.warningLevel || 'n/a'}]: ${m.comment || 'No comment'}.`);
            });
        }
    }
    if (context.cidpSummary) {
        const s = context.cidpSummary.summary || {};
        lines.push(`- CIDP linkage: ${s.linkedToProgramme || 0}/${s.totalProjects || 0} projects linked to programmes; ${s.linkedToSubprogramme || 0}/${s.totalProjects || 0} linked to subprogrammes.`);
        if (context.cidpSummary.topLinkages?.length) {
            lines.push('- Top CIDP linkages:');
            context.cidpSummary.topLinkages.forEach((row) => {
                lines.push(`  - ${row.programme} / ${row.subprogramme}: ${row.count} projects.`);
            });
        }
    }
    if (context.adpSummary) {
        const s = context.adpSummary;
        lines.push(`- ADP summary (${s.adpName || 'plan'} ${s.financialYear || ''}): ${s.plannedProjects || 0} planned projects; planned budget KES ${money(s.plannedBudget)}; ${s.budgetedAdpProjects || 0} budgeted; budgeted amount KES ${money(s.budgetedAmount)}; ${s.linkedAdpProjects || 0} linked to registry; actual budget KES ${money(s.actualBudget)}; paid KES ${money(s.actualPaid)}.`);
    }
    if (context.adpGaps?.length) {
        lines.push('- ADP implementation gaps (not budgeted and/or not linked):');
        context.adpGaps.forEach((row) => {
            const flags = [
                row.notBudgeted ? 'not budgeted' : null,
                row.notLinked ? 'not linked' : null,
            ].filter(Boolean).join(', ');
            lines.push(`  - ${row.projectName} (${row.sectorName || 'sector n/a'}); KES ${money(row.estimatedCost)}; ${flags}.`);
        });
    }
    if (context.budgetDetail) {
        const b = context.budgetDetail;
        lines.push(`- Budget detail: ${b.budgetName}; status ${b.status || 'n/a'}; FY ${b.finYearName || 'n/a'}; department ${b.departmentName || 'n/a'}; ${b.itemCount || 0} items (${b.adpItemCount || 0} from ADP); total KES ${money(b.itemsTotal || b.totalAmount)}; linked ADP plan ${b.adpPlanName || 'none'}.`);
    }
    if (context.monitoringHighlights?.length) {
        lines.push('- Monitoring highlights:');
        context.monitoringHighlights.forEach((row) => {
            lines.push(`  - #${row.projectId} ${row.projectName}; warning ${row.warningLevel || 'n/a'}; ${row.observationDate || 'n/a'}: ${row.comment || 'No comment'}.`);
        });
    }
    return lines.join('\n').slice(0, MAX_CONTEXT_CHARS);
}

async function buildAiDataContext({ user, messages, context }) {
    const question = latestUserMessage(messages);
    const page = pageEntity(context);
    const pageContextText = formatPageContext(context);
    const intents = detectIntents(question, context);

    if (!detectNeedsData(question, context) && !pageContextText) {
        return { used: false, text: '', sources: [] };
    }

    try {
        const adpPlanId = page.adpPlanId || page.summary?.adpPlanId || null;
        const tasks = {
            projectSummary: getProjectSummary(user),
            statusBreakdown: getStatusBreakdown(user),
            matchingProjects: getMatchingProjects(user, question),
        };

        if (intents.includes('projectDetail') && page.projectId) {
            tasks.projectDetail = getProjectDetail(user, page.projectId);
        }
        if (intents.includes('monitoring') || intents.includes('projects')) {
            tasks.stalledProjects = getStalledProjects(user);
            tasks.monitoringHighlights = getMonitoringHighlights(user);
        }
        if (intents.includes('location')) {
            tasks.locationBreakdown = getLocationBreakdown(user);
        }
        if (intents.includes('cidp') || intents.includes('adp')) {
            tasks.cidpSummary = getCidpSummary(user);
        }
        if (intents.includes('adp') || intents.includes('budget')) {
            tasks.adpSummary = getAdpSummary(user, adpPlanId);
            tasks.adpGaps = getAdpGaps(user, adpPlanId);
        }
        if (intents.includes('budget') && page.budgetId) {
            tasks.budgetDetail = getBudgetDetail(page.budgetId);
        }

        const entries = await Promise.all(
            Object.entries(tasks).map(async ([key, promise]) => [key, await promise])
        );
        const data = Object.fromEntries(entries);
        data.pageContextText = pageContextText;
        const text = formatDataContext(data);
        const sources = Object.keys(data).filter((key) => {
            const value = data[key];
            if (key === 'pageContextText') return Boolean(value);
            if (Array.isArray(value)) return value.length > 0;
            if (value && typeof value === 'object') return Object.keys(value).length > 0;
            return Boolean(value);
        });

        return { used: sources.length > 0, text, sources };
    } catch (error) {
        console.warn('[ai_data_context] retrieval failed:', error.message);
        return {
            used: false,
            text: 'Live data retrieval failed for this question. Answer using only general system guidance and ask the user to try again if they need live figures.',
            error: error.message,
            sources: [],
        };
    }
}

module.exports = {
    buildAiDataContext,
};
