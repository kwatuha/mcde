const pool = require('../config/db');
const orgScope = require('./organizationScopeService');
const { isSuperAdminRequester } = require('../utils/roleUtils');

const MAX_CONTEXT_CHARS = Number(process.env.OPENAI_DATA_CONTEXT_MAX_CHARS || 6000);

const getScopeUserId = (user) => user?.id ?? user?.userId ?? user?.userid ?? user?.actualUserId ?? null;

const statusExpr = (alias = 'p') => `COALESCE(NULLIF(TRIM(${alias}.progress->>'status'), ''), 'Other')`;
const budgetExpr = (alias = 'p') => `CASE WHEN (${alias}.budget->>'allocated_amount_kes') ~ '^[0-9]+(\\.[0-9]+){0,1}$' THEN (${alias}.budget->>'allocated_amount_kes')::numeric ELSE 0 END`;
const paidExpr = (alias = 'p') => `CASE WHEN (${alias}.budget->>'disbursed_amount_kes') ~ '^[0-9]+(\\.[0-9]+){0,1}$' THEN (${alias}.budget->>'disbursed_amount_kes')::numeric ELSE 0 END`;
const progressExpr = (alias = 'p') => `CASE WHEN (${alias}.progress->>'percentage_complete') ~ '^[0-9]+(\\.[0-9]+){0,1}$' THEN (${alias}.progress->>'percentage_complete')::numeric ELSE NULL END`;

function cleanText(value) {
    return String(value || '').trim();
}

function latestUserMessage(messages = []) {
    return [...(Array.isArray(messages) ? messages : [])]
        .reverse()
        .find((message) => message?.role === 'user')?.content || '';
}

function detectNeedsData(question, context = {}) {
    const text = `${question} ${context?.path || ''} ${context?.title || ''}`.toLowerCase();
    return /\b(project|projects|status|budget|paid|payment|finance|pending|bill|cidp|adp|programme|program|subprogram|subprogramme|ward|subcounty|sub-county|sublocation|village|dashboard|report|milestone|procurement|bq|contract|stalled|ongoing|completed|implementation)\b/.test(text);
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

function extractSearchTerms(question) {
    const stop = new Set([
        'show', 'list', 'give', 'tell', 'summarize', 'summary', 'explain', 'what', 'which', 'are', 'the', 'for', 'and',
        'with', 'about', 'projects', 'project', 'status', 'budget', 'paid', 'finance', 'report', 'dashboard', 'in', 'my',
        'ward', 'subcounty', 'sub', 'county', 'cidp', 'adp', 'ongoing', 'completed', 'stalled',
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

async function scopedWhere(user) {
    const where = ['COALESCE(p.voided, false) = false'];
    const params = [];
    await addProjectScopeWhere(user, where, params, 'p');
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

function money(value) {
    return Number(value || 0).toLocaleString('en-KE', { maximumFractionDigits: 0 });
}

function formatDataContext(context) {
    const lines = [
        'Retrieved live system data (already restricted to the logged-in user scope):',
    ];
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
    if (context.matchingProjects?.length) {
        lines.push('- Top matching projects (limited to 10):');
        context.matchingProjects.forEach((p) => {
            const location = [p.subcounty, p.ward, p.sublocation, p.village].filter(Boolean).join(' > ');
            lines.push(`  - #${p.projectId} ${p.projectName}; status ${p.status}; department ${p.department}; ${location || 'location not set'}; budget KES ${money(p.budget)}; paid KES ${money(p.paid)}; progress ${p.progress == null ? 'N/A' : `${Number(p.progress).toFixed(1)}%`}.`);
        });
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
    return lines.join('\n').slice(0, MAX_CONTEXT_CHARS);
}

async function buildAiDataContext({ user, messages, context }) {
    const question = latestUserMessage(messages);
    if (!detectNeedsData(question, context)) {
        return { used: false, text: '' };
    }
    try {
        const lower = question.toLowerCase();
        const wantsCidp = /\b(cidp|adp|programme|program|subprogram|subprogramme|linkage)\b/.test(lower);
        const [projectSummary, statusBreakdown, matchingProjects, cidpSummary] = await Promise.all([
            getProjectSummary(user),
            getStatusBreakdown(user),
            getMatchingProjects(user, question),
            wantsCidp ? getCidpSummary(user) : Promise.resolve(null),
        ]);
        const data = { projectSummary, statusBreakdown, matchingProjects, cidpSummary };
        const text = formatDataContext(data);
        return { used: true, text, sources: Object.keys(data).filter((key) => data[key]) };
    } catch (error) {
        console.warn('[ai_data_context] retrieval failed:', error.message);
        return {
            used: false,
            text: 'Live data retrieval failed for this question. Answer using only general system guidance and ask the user to try again if they need live figures.',
            error: error.message,
        };
    }
}

module.exports = {
    buildAiDataContext,
};
