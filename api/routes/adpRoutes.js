const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const privilege = require('../middleware/privilegeMiddleware');
const orgScope = require('../services/organizationScopeService');
const { isSuperAdminRequester } = require('../utils/roleUtils');

const DB_TYPE = process.env.DB_TYPE || 'mysql';
const isPostgres = DB_TYPE === 'postgresql';

const canRead = privilege(['project.read_all', 'strategic_plan.read_all'], { anyOf: true });
const canWrite = privilege(['project.update', 'strategic_plan.update', 'strategic_plan.create'], { anyOf: true });
const getScopeUserId = (user) => user?.id ?? user?.userId ?? user?.actualUserId ?? null;
const projectBudgetExpr = (alias = 'p') => `CASE WHEN (${alias}.budget->>'allocated_amount_kes') ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN (${alias}.budget->>'allocated_amount_kes')::numeric ELSE 0 END`;
const projectPaidExpr = (alias = 'p') => `CASE WHEN (${alias}.budget->>'disbursed_amount_kes') ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN (${alias}.budget->>'disbursed_amount_kes')::numeric ELSE 0 END`;

function requirePostgres(req, res, next) {
  if (!isPostgres) {
    return res.status(501).json({ message: 'ADP implementation tracking is available on PostgreSQL deployments only.' });
  }
  next();
}

function normalizeId(value) {
  const id = Number(value);
  return Number.isFinite(id) && id > 0 ? id : null;
}

async function addProjectScopeWhere(req, where, params, projectAlias = 'p') {
  const authUserId = getScopeUserId(req.user);
  const authPrivileges = req.user?.privileges || [];
  if (!authUserId) {
    where.push('FALSE');
    return;
  }
  if (isSuperAdminRequester(req.user) || orgScope.userHasOrganizationBypass(authPrivileges)) return;
  if (!(await orgScope.organizationScopeTableExists())) {
    where.push('FALSE');
    return;
  }
  const hasProjectScopes = await orgScope.userHasProjectAccessScopeContext(authUserId);
  if (!hasProjectScopes) return;

  let nextIndex = params.length + 1;
  const fragment = orgScope
    .buildExplicitProjectScopeFragment(projectAlias)
    .replace(/\?/g, () => `$${nextIndex++}`);
  where.push(fragment);
  params.push(...orgScope.explicitProjectScopeParams(authUserId));
}

function textOrNull(value) {
  const text = String(value ?? '').trim();
  return text || null;
}

function numericOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

async function resolveAdpProgrammeId(adpPlanId, payload) {
  const sectorName = textOrNull(payload.sectorName);
  const programmeName = textOrNull(payload.programmeName);
  const subprogrammeName = textOrNull(payload.subprogrammeName);

  if (!sectorName && !programmeName && !subprogrammeName) return null;

  const finalProgrammeName = programmeName || 'Unspecified Programme';
  const existing = await pool.query(
    `
    SELECT id
    FROM adp_programmes
    WHERE adp_plan_id = $1
      AND lower(trim(COALESCE(sector_name, ''))) = lower(trim(COALESCE($2, '')))
      AND lower(trim(COALESCE(programme_code, ''))) = ''
      AND lower(trim(programme_name)) = lower(trim($3))
      AND lower(trim(COALESCE(subprogramme_code, ''))) = ''
      AND lower(trim(COALESCE(subprogramme_name, ''))) = lower(trim(COALESCE($4, '')))
      AND COALESCE(voided, false) = false
    ORDER BY id
    LIMIT 1
    `,
    [adpPlanId, sectorName, finalProgrammeName, subprogrammeName]
  );

  if (existing.rows?.[0]?.id) return existing.rows[0].id;

  try {
    const created = await pool.query(
      `
      INSERT INTO adp_programmes (
        adp_plan_id,
        sector_name,
        programme_name,
        subprogramme_name,
        updated_at
      )
      VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
      RETURNING id
      `,
      [adpPlanId, sectorName, finalProgrammeName, subprogrammeName]
    );
    return created.rows?.[0]?.id || null;
  } catch (error) {
    if (error.code !== '23505') throw error;
    const retry = await pool.query(
      `
      SELECT id
      FROM adp_programmes
      WHERE adp_plan_id = $1
        AND lower(trim(COALESCE(sector_name, ''))) = lower(trim(COALESCE($2, '')))
        AND lower(trim(COALESCE(programme_code, ''))) = ''
        AND lower(trim(programme_name)) = lower(trim($3))
        AND lower(trim(COALESCE(subprogramme_code, ''))) = ''
        AND lower(trim(COALESCE(subprogramme_name, ''))) = lower(trim(COALESCE($4, '')))
        AND COALESCE(voided, false) = false
      ORDER BY id
      LIMIT 1
      `,
      [adpPlanId, sectorName, finalProgrammeName, subprogrammeName]
    );
    return retry.rows?.[0]?.id || null;
  }
}

async function fetchCurrentLink(projectId) {
  const result = await pool.query(
    `
    SELECT
      l.id AS "linkId",
      l.project_id AS "projectId",
      l.adp_project_id AS "adpProjectId",
      l.link_status AS "linkStatus",
      l.notes,
      ap.adp_code AS "adpCode",
      ap.adp_name AS "adpName",
      ap.financial_year AS "financialYear",
      adpp.project_name AS "adpProjectName",
      adpp.activity_description AS "activityDescription",
      adpp.location_text AS "locationText",
      adpp.ward,
      adpp.sublocation,
      adpp.village,
      adpp.estimated_cost AS "estimatedCost",
      adpp.timeframe,
      adpp.performance_indicator AS "performanceIndicator",
      adpp.target,
      adpp.plan_status AS "planStatus",
      adpp.implementing_agency AS "implementingAgency",
      adpg.sector_name AS "sectorName",
      adpg.programme_name AS "programmeName",
      adpg.subprogramme_name AS "subprogrammeName"
    FROM adp_project_links l
    INNER JOIN adp_projects adpp ON adpp.id = l.adp_project_id AND COALESCE(adpp.voided, false) = false
    INNER JOIN adp_plans ap ON ap.id = adpp.adp_plan_id AND COALESCE(ap.voided, false) = false
    LEFT JOIN adp_programmes adpg ON adpg.id = adpp.adp_programme_id AND COALESCE(adpg.voided, false) = false
    WHERE l.project_id = $1
      AND COALESCE(l.voided, false) = false
    ORDER BY l.updated_at DESC, l.id DESC
    LIMIT 1
    `,
    [projectId]
  );
  return result.rows?.[0] || null;
}

async function fetchSuggestions(projectId) {
  const result = await pool.query(
    `
    SELECT
      s.id,
      s.project_id AS "projectId",
      s.adp_project_id AS "adpProjectId",
      s.confidence::float AS confidence,
      s.match_reason AS "matchReason",
      s.status,
      s.reviewed_by AS "reviewedBy",
      s.reviewed_at AS "reviewedAt",
      s.created_at AS "createdAt",
      s.updated_at AS "updatedAt",
      ap.adp_code AS "adpCode",
      ap.adp_name AS "adpName",
      ap.financial_year AS "financialYear",
      adpp.project_name AS "adpProjectName",
      adpp.location_text AS "locationText",
      adpp.estimated_cost AS "estimatedCost",
      adpp.performance_indicator AS "performanceIndicator",
      adpp.target,
      adpp.plan_status AS "planStatus",
      adpg.sector_name AS "sectorName",
      adpg.programme_name AS "programmeName",
      adpg.subprogramme_name AS "subprogrammeName"
    FROM adp_project_link_suggestions s
    INNER JOIN adp_projects adpp ON adpp.id = s.adp_project_id
    INNER JOIN adp_plans ap ON ap.id = adpp.adp_plan_id
    LEFT JOIN adp_programmes adpg ON adpg.id = adpp.adp_programme_id
    WHERE s.project_id = $1
    ORDER BY
      CASE s.status WHEN 'accepted' THEN 0 WHEN 'review_pending' THEN 1 ELSE 2 END,
      s.confidence DESC,
      s.id ASC
    `,
    [projectId]
  );
  return result.rows || [];
}

router.use(requirePostgres);

router.get('/plans', canRead, async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT
        ap.id,
        ap.adp_code AS "adpCode",
        ap.adp_name AS "adpName",
        ap.financial_year AS "financialYear",
        ap.cidp_code AS "cidpCode",
        ap.source_document AS "sourceDocument",
        ap.start_date AS "startDate",
        ap.end_date AS "endDate",
        ap.active,
        COUNT(DISTINCT adpp.id)::int AS "plannedProjects",
        COALESCE(SUM(adpp.estimated_cost), 0)::numeric AS "plannedBudget"
      FROM adp_plans ap
      LEFT JOIN adp_projects adpp ON adpp.adp_plan_id = ap.id AND COALESCE(adpp.voided, false) = false
      WHERE COALESCE(ap.voided, false) = false
      GROUP BY ap.id
      ORDER BY ap.start_date DESC NULLS LAST, ap.id DESC
      `
    );
    res.json(result.rows || []);
  } catch (error) {
    console.error('ADP plans fetch failed:', error);
    res.status(500).json({ message: 'Failed to load ADP plans.', error: error.message });
  }
});

router.get('/summary', canRead, async (req, res) => {
  try {
    const where = ['COALESCE(ap.voided, false) = false'];
    const params = [];
    if (req.query.adpCode) {
      params.push(String(req.query.adpCode));
      where.push(`ap.adp_code = $${params.length}`);
    }
    const projectScopeWhere = ['COALESCE(p.voided, false) = false'];
    await addProjectScopeWhere(req, projectScopeWhere, params, 'p');
    const projectScopeSql = projectScopeWhere.join(' AND ');

    const result = await pool.query(
      `
      WITH scoped_linked_projects AS (
        SELECT
          l.adp_project_id,
          COUNT(DISTINCT p.project_id)::int AS linked_project_count,
          COALESCE(SUM(${projectBudgetExpr('p')}), 0)::numeric AS actual_budget,
          COALESCE(SUM(${projectPaidExpr('p')}), 0)::numeric AS actual_paid,
          COUNT(*) FILTER (
            WHERE lower(COALESCE(NULLIF(TRIM(p.progress->>'status'), ''), '')) LIKE '%complete%'
          )::int AS completed_projects
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
        COUNT(DISTINCT adpp.id)::int AS "plannedProjects",
        COALESCE(SUM(adpp.estimated_cost), 0)::numeric AS "plannedBudget",
        COUNT(DISTINCT adpp.id) FILTER (WHERE bap.budget_count > 0)::int AS "budgetedAdpProjects",
        COALESCE(SUM(bap.budgeted_amount), 0)::numeric AS "budgetedAmount",
        COALESCE(SUM(slp.linked_project_count), 0)::int AS "linkedProjects",
        COUNT(DISTINCT adpp.id) FILTER (WHERE slp.linked_project_count > 0)::int AS "linkedAdpProjects",
        COALESCE(SUM(slp.completed_projects), 0)::int AS "completedProjects",
        COALESCE(SUM(slp.actual_budget), 0)::numeric AS "actualBudget",
        COALESCE(SUM(slp.actual_paid), 0)::numeric AS "actualPaid"
      FROM adp_plans ap
      LEFT JOIN adp_projects adpp ON adpp.adp_plan_id = ap.id AND COALESCE(adpp.voided, false) = false
      LEFT JOIN scoped_linked_projects slp ON slp.adp_project_id = adpp.id
      LEFT JOIN budgeted_adp_projects bap ON bap.adp_project_id = adpp.id
      WHERE ${where.join(' AND ')}
      `,
      params
    );
    res.json(result.rows?.[0] || {});
  } catch (error) {
    console.error('ADP summary fetch failed:', error);
    res.status(500).json({ message: 'Failed to load ADP summary.', error: error.message });
  }
});

router.get('/projects', canRead, async (req, res) => {
  try {
    const where = ['COALESCE(ap.voided, false) = false', 'COALESCE(adpp.voided, false) = false'];
    const params = [];
    const addTextFilter = (expr, value) => {
      const text = textOrNull(value);
      if (!text) return;
      params.push(`%${text}%`);
      where.push(`${expr} ILIKE $${params.length}`);
    };
    if (req.query.adpCode) {
      params.push(String(req.query.adpCode));
      where.push(`ap.adp_code = $${params.length}`);
    }
    addTextFilter('adpg.sector_name', req.query.sector);
    addTextFilter('adpp.plan_status', req.query.status);
    addTextFilter('adpp.project_name', req.query.search);
    addTextFilter('adpp.location_text', req.query.location);

    const projectScopeWhere = ['COALESCE(p.voided, false) = false'];
    await addProjectScopeWhere(req, projectScopeWhere, params, 'p');
    const projectScopeSql = projectScopeWhere.join(' AND ');

    const result = await pool.query(
      `
      WITH scoped_linked_projects AS (
        SELECT
          l.adp_project_id,
          COUNT(DISTINCT p.project_id)::int AS linked_project_count,
          COALESCE(SUM(${projectBudgetExpr('p')}), 0)::numeric AS actual_budget,
          COALESCE(SUM(${projectPaidExpr('p')}), 0)::numeric AS actual_paid
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
        adpp.id,
        ap.adp_code AS "adpCode",
        ap.financial_year AS "financialYear",
        adpg.sector_name AS "sectorName",
        adpg.programme_name AS "programmeName",
        adpg.subprogramme_name AS "subprogrammeName",
        adpp.project_name AS "projectName",
        adpp.location_text AS "locationText",
        adpp.ward,
        adpp.sublocation,
        adpp.village,
        adpp.activity_description AS "activityDescription",
        adpp.estimated_cost AS "estimatedCost",
        adpp.funding_source AS "fundingSource",
        adpp.timeframe,
        adpp.performance_indicator AS "performanceIndicator",
        adpp.target,
        adpp.plan_status AS "planStatus",
        adpp.implementing_agency AS "implementingAgency",
        COALESCE(bap.budget_count, 0)::int AS "budgetCount",
        COALESCE(bap.budgeted_amount, 0)::numeric AS "budgetedAmount",
        COALESCE(slp.linked_project_count, 0)::int AS "linkedProjectCount",
        COALESCE(slp.actual_budget, 0)::numeric AS "actualBudget",
        COALESCE(slp.actual_paid, 0)::numeric AS "actualPaid"
      FROM adp_projects adpp
      INNER JOIN adp_plans ap ON ap.id = adpp.adp_plan_id
      LEFT JOIN adp_programmes adpg ON adpg.id = adpp.adp_programme_id AND COALESCE(adpg.voided, false) = false
      LEFT JOIN scoped_linked_projects slp ON slp.adp_project_id = adpp.id
      LEFT JOIN budgeted_adp_projects bap ON bap.adp_project_id = adpp.id
      WHERE ${where.join(' AND ')}
      ORDER BY adpg.sector_name ASC NULLS LAST, adpg.programme_name ASC NULLS LAST, adpp.project_name ASC
      LIMIT 5000
      `,
      params
    );
    res.json({ rows: result.rows || [] });
  } catch (error) {
    console.error('ADP projects fetch failed:', error);
    res.status(500).json({ message: 'Failed to load ADP projects.', error: error.message });
  }
});

router.put('/projects/:adpProjectId', canWrite, async (req, res) => {
  try {
    const adpProjectId = normalizeId(req.params.adpProjectId);
    if (!adpProjectId) return res.status(400).json({ message: 'Invalid ADP project id.' });

    const existing = await pool.query(
      `
      SELECT id, adp_plan_id
      FROM adp_projects
      WHERE id = $1 AND COALESCE(voided, false) = false
      `,
      [adpProjectId]
    );
    const current = existing.rows?.[0];
    if (!current) return res.status(404).json({ message: 'ADP project not found.' });

    const projectName = textOrNull(req.body.projectName);
    if (!projectName) return res.status(400).json({ message: 'ADP project name is required.' });

    const programmeId = await resolveAdpProgrammeId(current.adp_plan_id, req.body);
    const estimatedCost = numericOrNull(req.body.estimatedCost);

    const result = await pool.query(
      `
      UPDATE adp_projects
      SET
        adp_programme_id = $2,
        project_name = $3,
        location_text = $4,
        ward = $5,
        sublocation = $6,
        village = $7,
        activity_description = $8,
        estimated_cost = $9,
        funding_source = $10,
        timeframe = $11,
        performance_indicator = $12,
        target = $13,
        plan_status = $14,
        implementing_agency = $15,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND COALESCE(voided, false) = false
      RETURNING id
      `,
      [
        adpProjectId,
        programmeId,
        projectName,
        textOrNull(req.body.locationText),
        textOrNull(req.body.ward),
        textOrNull(req.body.sublocation),
        textOrNull(req.body.village),
        textOrNull(req.body.activityDescription),
        estimatedCost,
        textOrNull(req.body.fundingSource),
        textOrNull(req.body.timeframe),
        textOrNull(req.body.performanceIndicator),
        textOrNull(req.body.target),
        textOrNull(req.body.planStatus),
        textOrNull(req.body.implementingAgency),
      ]
    );

    if (!result.rows?.[0]) return res.status(404).json({ message: 'ADP project not found.' });
    res.json({ message: 'ADP project updated successfully.', id: adpProjectId });
  } catch (error) {
    console.error('ADP project update failed:', error);
    res.status(500).json({ message: 'Failed to update ADP project.', error: error.message });
  }
});

router.delete('/projects/:adpProjectId', canWrite, async (req, res) => {
  try {
    const adpProjectId = normalizeId(req.params.adpProjectId);
    if (!adpProjectId) return res.status(400).json({ message: 'Invalid ADP project id.' });

    const dependencyResult = await pool.query(
      `
      SELECT
        EXISTS (
          SELECT 1 FROM adp_project_links
          WHERE adp_project_id = $1 AND COALESCE(voided, false) = false
        ) AS has_links,
        EXISTS (
          SELECT 1 FROM budget_items
          WHERE adpprojectid = $1 AND COALESCE(voided, false) = false
        ) AS has_budget_items
      `,
      [adpProjectId]
    );
    const dependencies = dependencyResult.rows?.[0] || {};
    if (dependencies.has_links || dependencies.has_budget_items) {
      return res.status(409).json({
        message: 'This ADP row is already linked to projects or budget items. Remove those links/items before deleting it.',
        hasLinks: dependencies.has_links,
        hasBudgetItems: dependencies.has_budget_items,
      });
    }

    const result = await pool.query(
      `
      UPDATE adp_projects
      SET voided = true,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND COALESCE(voided, false) = false
      RETURNING id
      `,
      [adpProjectId]
    );

    if (!result.rows?.[0]) return res.status(404).json({ message: 'ADP project not found.' });

    await pool.query(
      `
      UPDATE adp_project_link_suggestions
      SET status = 'rejected',
          updated_at = CURRENT_TIMESTAMP
      WHERE adp_project_id = $1 AND status <> 'accepted'
      `,
      [adpProjectId]
    );

    res.json({ message: 'ADP project deleted successfully.', id: adpProjectId });
  } catch (error) {
    console.error('ADP project delete failed:', error);
    res.status(500).json({ message: 'Failed to delete ADP project.', error: error.message });
  }
});

router.get('/catalog', canRead, async (req, res) => {
  try {
    const params = [];
    const where = ['COALESCE(ap.voided, false) = false', 'COALESCE(adpp.voided, false) = false'];
    if (req.query.adpCode) {
      params.push(String(req.query.adpCode));
      where.push(`ap.adp_code = $${params.length}`);
    }
    const result = await pool.query(
      `
      SELECT
        adpp.id,
        ap.adp_code AS "adpCode",
        ap.financial_year AS "financialYear",
        adpp.project_name AS "projectName",
        adpp.location_text AS "locationText",
        adpp.estimated_cost AS "estimatedCost",
        adpp.performance_indicator AS "performanceIndicator",
        adpp.target,
        adpg.sector_name AS "sectorName",
        adpg.programme_name AS "programmeName",
        adpg.subprogramme_name AS "subprogrammeName"
      FROM adp_projects adpp
      INNER JOIN adp_plans ap ON ap.id = adpp.adp_plan_id
      LEFT JOIN adp_programmes adpg ON adpg.id = adpp.adp_programme_id
      WHERE ${where.join(' AND ')}
      ORDER BY ap.financial_year DESC, adpp.project_name ASC
      `,
      params
    );
    res.json({ projects: result.rows || [] });
  } catch (error) {
    console.error('ADP catalog fetch failed:', error);
    res.status(500).json({ message: 'Failed to load ADP catalog.', error: error.message });
  }
});

router.get('/project-links/:projectId', canRead, async (req, res) => {
  try {
    const projectId = normalizeId(req.params.projectId);
    if (!projectId) return res.status(400).json({ message: 'Invalid project id.' });
    const [currentLink, suggestions] = await Promise.all([
      fetchCurrentLink(projectId),
      fetchSuggestions(projectId),
    ]);
    res.json({ currentLink, suggestions });
  } catch (error) {
    console.error('ADP project link fetch failed:', error);
    res.status(500).json({ message: 'Failed to load ADP project link.', error: error.message });
  }
});

router.put('/project-links/:projectId', canWrite, async (req, res) => {
  const projectId = normalizeId(req.params.projectId);
  const adpProjectId = normalizeId(req.body?.adpProjectId);
  const suggestionId = normalizeId(req.body?.suggestionId);
  const actorId = getScopeUserId(req.user);
  if (!projectId || !adpProjectId) return res.status(400).json({ message: 'Project and ADP project are required.' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `
      INSERT INTO adp_project_links (project_id, adp_project_id, link_status, notes, created_by, voided, updated_at)
      VALUES ($1, $2, 'accepted', $3, $4, false, CURRENT_TIMESTAMP)
      ON CONFLICT (project_id, adp_project_id) WHERE voided = false
      DO UPDATE SET link_status = 'accepted',
                    notes = EXCLUDED.notes,
                    updated_at = CURRENT_TIMESTAMP
      `,
      [projectId, adpProjectId, textOrNull(req.body?.notes), actorId]
    );
    if (suggestionId) {
      await client.query(
        `
        UPDATE adp_project_link_suggestions
        SET status = 'accepted',
            reviewed_by = $1,
            reviewed_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
          AND project_id = $3
          AND adp_project_id = $4
        `,
        [actorId, suggestionId, projectId, adpProjectId]
      );
    }
    await client.query(
      `
      UPDATE adp_project_link_suggestions
      SET status = 'rejected',
          reviewed_by = COALESCE(reviewed_by, $1),
          reviewed_at = COALESCE(reviewed_at, CURRENT_TIMESTAMP),
          updated_at = CURRENT_TIMESTAMP
      WHERE project_id = $2
        AND adp_project_id <> $3
        AND status = 'review_pending'
      `,
      [actorId, projectId, adpProjectId]
    );
    await client.query('COMMIT');
    const [currentLink, suggestions] = await Promise.all([fetchCurrentLink(projectId), fetchSuggestions(projectId)]);
    res.json({ currentLink, suggestions });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('ADP project link update failed:', error);
    res.status(500).json({ message: 'Failed to update ADP project link.', error: error.message });
  } finally {
    client.release();
  }
});

router.patch('/project-link-suggestions/:suggestionId', canWrite, async (req, res) => {
  try {
    const suggestionId = normalizeId(req.params.suggestionId);
    const status = String(req.body?.status || '').trim();
    if (!suggestionId || !['accepted', 'rejected'].includes(status)) {
      return res.status(400).json({ message: 'Valid suggestion and status are required.' });
    }
    const actorId = getScopeUserId(req.user);
    const existing = await pool.query(
      'SELECT project_id, adp_project_id FROM adp_project_link_suggestions WHERE id = $1 LIMIT 1',
      [suggestionId]
    );
    const row = existing.rows?.[0];
    if (!row) return res.status(404).json({ message: 'ADP suggestion not found.' });
    if (status === 'accepted') {
      await pool.query(
        `
        INSERT INTO adp_project_links (project_id, adp_project_id, link_status, created_by, voided, updated_at)
        VALUES ($1, $2, 'accepted', $3, false, CURRENT_TIMESTAMP)
        ON CONFLICT (project_id, adp_project_id) WHERE voided = false
        DO UPDATE SET link_status = 'accepted', updated_at = CURRENT_TIMESTAMP
        `,
        [row.project_id, row.adp_project_id, actorId]
      );
    }
    await pool.query(
      `
      UPDATE adp_project_link_suggestions
      SET status = $1,
          reviewed_by = $2,
          reviewed_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $3
      `,
      [status, actorId, suggestionId]
    );
    const [currentLink, suggestions] = await Promise.all([
      fetchCurrentLink(row.project_id),
      fetchSuggestions(row.project_id),
    ]);
    res.json({ currentLink, suggestions });
  } catch (error) {
    console.error('ADP suggestion update failed:', error);
    res.status(500).json({ message: 'Failed to update ADP suggestion.', error: error.message });
  }
});

router.post('/plans/:planId/generate-suggestions', canWrite, async (req, res) => {
  try {
    const planId = normalizeId(req.params.planId);
    if (!planId) return res.status(400).json({ message: 'Invalid ADP plan id.' });
    const where = ['COALESCE(p.voided, false) = false'];
    const params = [planId];
    await addProjectScopeWhere(req, where, params, 'p');

    const result = await pool.query(
      `
      WITH adp_tokens AS (
        SELECT
          adpp.id AS adp_project_id,
          adpp.project_name,
          lower(concat_ws(' ',
            adpp.project_name,
            adpp.activity_description,
            adpp.performance_indicator,
            adpp.location_text,
            adpp.ward,
            adpp.sublocation,
            adpp.village,
            adpg.sector_name,
            adpg.programme_name,
            adpg.subprogramme_name
          )) AS adp_text,
          ARRAY(
            SELECT DISTINCT token
            FROM regexp_split_to_table(
              lower(regexp_replace(concat_ws(' ', adpp.project_name, adpp.activity_description, adpp.performance_indicator), '[^a-z0-9]+', ' ', 'g')),
              '\\s+'
            ) AS token
            WHERE length(token) >= 4
              AND token NOT IN ('county', 'machakos', 'project', 'programme', 'program', 'development', 'services', 'construction')
          ) AS tokens
        FROM adp_projects adpp
        LEFT JOIN adp_programmes adpg ON adpg.id = adpp.adp_programme_id
        WHERE adpp.adp_plan_id = $1
          AND COALESCE(adpp.voided, false) = false
      ),
      project_text AS (
        SELECT
          p.project_id,
          lower(concat_ws(' ',
            p.name,
            p.location::text,
            p.timeline::text,
            p.progress::text,
            p.budget::text,
            p.notes::text
          )) AS search_text
        FROM projects p
        WHERE ${where.join(' AND ')}
      ),
      matches AS (
        SELECT
          pt.project_id,
          at.adp_project_id,
          COUNT(token)::int AS matched_terms,
          string_agg(token, ', ' ORDER BY token) AS matched_keywords
        FROM project_text pt
        JOIN adp_tokens at ON true
        CROSS JOIN LATERAL unnest(at.tokens) AS token
        WHERE pt.search_text LIKE '%' || token || '%'
        GROUP BY pt.project_id, at.adp_project_id
        HAVING COUNT(token) >= 2
      )
      INSERT INTO adp_project_link_suggestions (
        project_id,
        adp_project_id,
        confidence,
        match_reason,
        status,
        updated_at
      )
      SELECT
        m.project_id,
        m.adp_project_id,
        LEAST(0.90, 0.40 + (m.matched_terms * 0.08))::numeric(5,2),
        concat('Matched ADP keywords: ', m.matched_keywords),
        'review_pending',
        CURRENT_TIMESTAMP
      FROM matches m
      ON CONFLICT (project_id, adp_project_id)
      DO UPDATE SET confidence = EXCLUDED.confidence,
                    match_reason = EXCLUDED.match_reason,
                    updated_at = CURRENT_TIMESTAMP
      RETURNING id
      `,
      params
    );
    res.json({ insertedOrUpdated: result.rowCount || 0 });
  } catch (error) {
    console.error('ADP suggestion generation failed:', error);
    res.status(500).json({ message: 'Failed to generate ADP link suggestions.', error: error.message });
  }
});

module.exports = router;
