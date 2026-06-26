const express = require('express');
const pool = require('../config/db');
const privilege = require('../middleware/privilegeMiddleware');
const orgScope = require('../services/organizationScopeService');
const { isAdminLikeRequester } = require('../utils/roleUtils');

const router = express.Router();
const DB_TYPE = process.env.DB_TYPE || 'mysql';
const isPostgres = DB_TYPE === 'postgresql';
const canRead = privilege(['project.read_all', 'strategic_plan.read_all'], { anyOf: true });

const getScopeUserId = (user) => user?.id ?? user?.userId ?? user?.actualUserId ?? null;

const hasProjectScopeBypass = (user) => (
  isAdminLikeRequester(user) || orgScope.userHasOrganizationBypass(user?.privileges || [])
);

async function appendProjectScopeFilter(req, filters, params, projectAlias = 'p') {
  const authUserId = getScopeUserId(req.user);
  if (!authUserId) {
    filters.push('FALSE');
    return;
  }
  if (hasProjectScopeBypass(req.user)) return;
  if (!(await orgScope.organizationScopeTableExists())) {
    filters.push('FALSE');
    return;
  }

  const hasProjectScopes = await orgScope.userHasProjectAccessScopeContext(authUserId);
  const rawFragment = hasProjectScopes
    ? orgScope.buildExplicitProjectScopeFragment(projectAlias)
    : orgScope.buildProjectListScopeFragment(projectAlias);
  const scopeParams = hasProjectScopes
    ? orgScope.explicitProjectScopeParams(authUserId)
    : orgScope.projectScopeParamTriple(authUserId);

  let nextIndex = params.length + 1;
  const scopeFragment = rawFragment.replace(/\?/g, () => `$${nextIndex++}`);
  filters.push(scopeFragment);
  params.push(...scopeParams);
}

function requirePostgres(req, res, next) {
  if (!isPostgres) {
    return res.status(501).json({ message: 'Accountability dashboards require PostgreSQL.' });
  }
  next();
}

router.use(requirePostgres);

router.get('/ward-accountability', canRead, async (req, res) => {
  try {
    const subcounty = String(req.query.subcounty || '').trim();
    const params = [];
    const filters = [];
    if (subcounty) {
      params.push(`%${subcounty.toLowerCase()}%`);
      filters.push(`lower(COALESCE(p.location->>'subcounty', '')) LIKE $${params.length}`);
    }
    await appendProjectScopeFilter(req, filters, params, 'p');
    const scopeSql = filters.length ? `AND ${filters.map((f) => `(${f})`).join(' AND ')}` : '';

    const wardProjects = await pool.query(
      `
      WITH ward_rows AS (
        SELECT
          COALESCE(NULLIF(TRIM(p.location->>'ward'), ''), 'Unassigned') AS ward,
          COALESCE(NULLIF(TRIM(p.location->>'subcounty'), ''), 'Unassigned') AS subcounty,
          p.project_id,
          COALESCE(NULLIF(BTRIM(p.budget->>'allocated_amount_kes'), ''), '0')::numeric AS budget_amount,
          COALESCE(NULLIF(BTRIM(p.budget->>'disbursed_amount_kes'), ''), '0')::numeric AS paid_amount,
          COALESCE(NULLIF(BTRIM(p.progress->>'percentage_complete'), ''), '0')::numeric AS progress_pct
        FROM projects p
        WHERE COALESCE(p.voided, false) = false
          ${scopeSql}
      )
      SELECT
        ward,
        subcounty,
        COUNT(DISTINCT project_id)::int AS projects,
        COALESCE(SUM(budget_amount), 0)::numeric AS total_budget,
        COALESCE(SUM(paid_amount), 0)::numeric AS total_paid,
        ROUND(COALESCE(AVG(progress_pct), 0), 1)::numeric AS avg_progress
      FROM ward_rows
      GROUP BY ward, subcounty
      ORDER BY subcounty ASC, projects DESC, ward ASC
      `,
      params
    );

    let pmcRows = { rows: [] };
    try {
      pmcRows = await pool.query(
        `
        SELECT
          COALESCE(NULLIF(TRIM(ward), ''), 'Unassigned') AS ward,
          COALESCE(NULLIF(TRIM(subcounty), ''), 'Unassigned') AS subcounty,
          COUNT(*)::int AS reports,
          COUNT(*) FILTER (WHERE lower(COALESCE(status, '')) IN ('approved', 'submitted'))::int AS active_reports
        FROM pmc_ward_reports
        WHERE COALESCE(voided, false) = false
        GROUP BY ward, subcounty
        `
      );
    } catch {
      pmcRows = { rows: [] };
    }

    const pmcByWard = new Map(
      (pmcRows.rows || []).map((row) => [`${row.subcounty}::${row.ward}`, row])
    );

    const rows = (wardProjects.rows || []).map((row) => {
      const pmc = pmcByWard.get(`${row.subcounty}::${row.ward}`) || {};
      return {
        ward: row.ward,
        subcounty: row.subcounty,
        projects: row.projects,
        totalBudget: row.total_budget,
        totalPaid: row.total_paid,
        avgProgress: row.avg_progress,
        pmcReports: pmc.reports || 0,
        activePmcReports: pmc.active_reports || 0,
      };
    });

    res.json({
      subcounty: subcounty || null,
      rows,
      summary: {
        wards: rows.length,
        projects: rows.reduce((sum, row) => sum + Number(row.projects || 0), 0),
        totalBudget: rows.reduce((sum, row) => sum + Number(row.totalBudget || 0), 0),
        pmcReports: rows.reduce((sum, row) => sum + Number(row.pmcReports || 0), 0),
      },
    });
  } catch (error) {
    console.error('Ward accountability failed:', error);
    res.status(500).json({ message: 'Failed to load ward accountability.', error: error.message });
  }
});

router.get('/county-planning-overview', canRead, async (req, res) => {
  try {
    const [cidp, adp, rri] = await Promise.all([
      pool.query(`
        SELECT COUNT(*)::int AS programmes,
               COALESCE(SUM(linked), 0)::int AS linked_projects
        FROM (
          SELECT pr."programId",
                 COUNT(DISTINCT p.project_id)::int AS linked
          FROM cidp_programmes pr
          LEFT JOIN projects p ON COALESCE(p.voided, false) = false
            AND (
              (p.notes->>'program_id') ~ '^[0-9]+$' AND (p.notes->>'program_id')::int = pr."programId"
              OR (p.notes->>'subprogram_id') ~ '^[0-9]+$' AND (p.notes->>'subprogram_id')::int = pr."programId"
            )
          GROUP BY pr."programId"
        ) x
      `).catch(() => ({ rows: [{ programmes: 0, linked_projects: 0 }] })),
      pool.query(`
        SELECT COUNT(DISTINCT adpg.id)::int AS programmes,
               COUNT(DISTINCT l.project_id)::int AS linked_projects
        FROM adp_programmes adpg
        INNER JOIN adp_plans ap ON ap.id = adpg.adp_plan_id AND COALESCE(ap.voided, false) = false
        LEFT JOIN adp_projects adpp ON adpp.adp_programme_id = adpg.id AND COALESCE(adpp.voided, false) = false
        LEFT JOIN adp_project_links l ON l.adp_project_id = adpp.id AND COALESCE(l.voided, false) = false
        WHERE COALESCE(adpg.voided, false) = false
      `).catch(() => ({ rows: [{ programmes: 0, linked_projects: 0 }] })),
      pool.query(`
        SELECT COUNT(*)::int AS programmes,
               COUNT(DISTINCT rpl.project_id)::int AS linked_projects
        FROM rri_programmes rp
        LEFT JOIN rri_programme_project_links rpl ON rpl.rri_programme_id = rp.id
        WHERE COALESCE(rp.voided, false) = false
      `).catch(() => ({ rows: [{ programmes: 0, linked_projects: 0 }] })),
    ]);

    res.json({
      domains: [
        {
          key: 'cidp',
          label: 'CIDP Programmes',
          programmes: cidp.rows[0]?.programmes || 0,
          linkedProjects: cidp.rows[0]?.linked_projects || 0,
          route: '/planning/cidp-programme-progress',
        },
        {
          key: 'adp',
          label: 'ADP Programmes',
          programmes: adp.rows[0]?.programmes || 0,
          linkedProjects: adp.rows[0]?.linked_projects || 0,
          route: '/planning/adp-programme-progress',
        },
        {
          key: 'rri',
          label: 'RRI Programmes',
          programmes: rri.rows[0]?.programmes || 0,
          linkedProjects: rri.rows[0]?.linked_projects || 0,
          route: '/planning/rri-programmes',
        },
      ],
    });
  } catch (error) {
    console.error('County planning overview failed:', error);
    res.status(500).json({ message: 'Failed to load county planning overview.', error: error.message });
  }
});

module.exports = router;
