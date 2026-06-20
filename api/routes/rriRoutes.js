const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const privilege = require('../middleware/privilegeMiddleware');
const orgScope = require('../services/organizationScopeService');
const beneficiaryRegistry = require('../services/beneficiaryRegistryService');
const { isSuperAdminRequester } = require('../utils/roleUtils');

const DB_TYPE = process.env.DB_TYPE || 'mysql';
const isPostgres = DB_TYPE === 'postgresql';

const canRead = privilege(['rri.read', 'project.read_all', 'strategic_plan.read_all'], { anyOf: true });
const canWrite = privilege(['rri.create', 'rri.update', 'project.update'], { anyOf: true });
const canDelete = privilege(['rri.delete', 'project.update'], { anyOf: true });

function requirePostgres(req, res, next) {
  if (!isPostgres) {
    return res.status(501).json({ message: 'RRI programmes require PostgreSQL.' });
  }
  next();
}

function getUserId(user) {
  return Number(user?.id ?? user?.userId ?? user?.actualUserId) || null;
}

function textOrNull(value) {
  const text = String(value ?? '').trim();
  return text || null;
}

async function ensureSchema() {
  if (!isPostgres) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS rri_programmes (
      programme_id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NULL,
      sector TEXT NULL,
      subcounty TEXT NULL,
      ward TEXT NULL,
      target_beneficiaries INTEGER NULL,
      status TEXT NOT NULL DEFAULT 'active',
      delivery_mode TEXT NOT NULL DEFAULT 'internal',
      created_by BIGINT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      voided BOOLEAN NOT NULL DEFAULT FALSE
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS rri_programme_projects (
      id BIGSERIAL PRIMARY KEY,
      rri_programme_id BIGINT NOT NULL,
      project_id BIGINT NOT NULL,
      notes TEXT NULL,
      linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      linked_by BIGINT NULL,
      voided BOOLEAN NOT NULL DEFAULT FALSE,
      UNIQUE (rri_programme_id, project_id)
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS rri_programme_sites (
      site_id BIGSERIAL PRIMARY KEY,
      rri_programme_id BIGINT NOT NULL,
      site_name TEXT NULL,
      subcounty TEXT NULL,
      ward TEXT NULL,
      target_beneficiaries INTEGER NULL,
      status_norm TEXT NOT NULL DEFAULT 'Not Started',
      percent_complete NUMERIC(5, 2) NOT NULL DEFAULT 0,
      remarks TEXT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      voided BOOLEAN NOT NULL DEFAULT FALSE
    )
  `);
  await pool.query(`ALTER TABLE rri_programme_sites ADD COLUMN IF NOT EXISTS status_norm TEXT NOT NULL DEFAULT 'Not Started'`);
  await pool.query(`ALTER TABLE rri_programme_sites ADD COLUMN IF NOT EXISTS percent_complete NUMERIC(5, 2) NOT NULL DEFAULT 0`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS studyparticipants (
      "individualId" BIGSERIAL PRIMARY KEY,
      "householdId" TEXT NULL,
      county TEXT NULL,
      "subCounty" TEXT NULL,
      ward TEXT NULL,
      gender TEXT NULL,
      age INTEGER NULL,
      occupation TEXT NULL,
      "educationLevel" TEXT NULL,
      "projectId" BIGINT NULL,
      rri_programme_id BIGINT NULL,
      rri_site_id BIGINT NULL,
      notes TEXT NULL,
      voided BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`ALTER TABLE studyparticipants ADD COLUMN IF NOT EXISTS rri_programme_id BIGINT NULL`);
  await pool.query(`ALTER TABLE studyparticipants ADD COLUMN IF NOT EXISTS rri_site_id BIGINT NULL`);
  await pool.query(`ALTER TABLE studyparticipants ADD COLUMN IF NOT EXISTS ward TEXT NULL`);
  await pool.query(`ALTER TABLE studyparticipants ADD COLUMN IF NOT EXISTS notes TEXT NULL`);
  await pool.query(`ALTER TABLE studyparticipants ADD COLUMN IF NOT EXISTS voided BOOLEAN NOT NULL DEFAULT FALSE`);
}

const SITE_STATUSES = ['Not Started', 'Ongoing', 'Completed', 'Stalled', 'Suspended'];

function normalizePercent(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

function normalizeSiteStatus(value) {
  const text = textOrNull(value) || 'Not Started';
  return SITE_STATUSES.includes(text) ? text : 'Not Started';
}

function normalizeSitesInput(rawSites) {
  if (!Array.isArray(rawSites)) return [];
  return rawSites
    .map((site, index) => ({
      siteId: site?.siteId != null ? Number(site.siteId) : null,
      siteName: textOrNull(site?.siteName ?? site?.site_name),
      subcounty: textOrNull(site?.subcounty ?? site?.constituency),
      ward: textOrNull(site?.ward),
      targetBeneficiaries: site?.targetBeneficiaries != null
        ? Number(site.targetBeneficiaries) || null
        : (site?.target_beneficiaries != null ? Number(site.target_beneficiaries) || null : null),
      statusNorm: normalizeSiteStatus(site?.statusNorm ?? site?.status_norm),
      percentComplete: normalizePercent(site?.percentComplete ?? site?.percent_complete ?? 0),
      remarks: textOrNull(site?.remarks),
      sortOrder: Number.isFinite(Number(site?.sortOrder)) ? Number(site.sortOrder) : index,
    }))
    .filter((site) => site.subcounty || site.ward || site.siteName);
}

async function fetchProgrammeSites(programmeId) {
  const result = await pool.query(
    `
    SELECT
      site_id AS "siteId",
      site_name AS "siteName",
      subcounty,
      ward,
      target_beneficiaries AS "targetBeneficiaries",
      status_norm AS "statusNorm",
      percent_complete AS "percentComplete",
      remarks,
      sort_order AS "sortOrder"
    FROM rri_programme_sites
    WHERE rri_programme_id = $1
      AND COALESCE(voided, false) = false
    ORDER BY sort_order ASC, site_id ASC
    `,
    [programmeId]
  );
  return result.rows || [];
}

async function syncProgrammeSites(programmeId, sites) {
  const existing = await pool.query(
    `SELECT site_id FROM rri_programme_sites WHERE rri_programme_id = $1 AND COALESCE(voided, false) = false`,
    [programmeId]
  );
  const keepIds = new Set(sites.filter((s) => s.siteId).map((s) => s.siteId));
  const toVoid = (existing.rows || [])
    .map((row) => Number(row.site_id))
    .filter((id) => !keepIds.has(id));
  for (const siteId of toVoid) {
    await pool.query(
      `UPDATE rri_programme_sites SET voided = true, updated_at = NOW() WHERE site_id = $1 AND rri_programme_id = $2`,
      [siteId, programmeId]
    );
  }
  for (let i = 0; i < sites.length; i += 1) {
    const site = sites[i];
    if (site.siteId) {
      await pool.query(
        `
        UPDATE rri_programme_sites SET
          site_name = $3,
          subcounty = $4,
          ward = $5,
          target_beneficiaries = $6,
          status_norm = $7,
          percent_complete = $8,
          remarks = $9,
          sort_order = $10,
          updated_at = NOW(),
          voided = false
        WHERE site_id = $1 AND rri_programme_id = $2
        `,
        [
          site.siteId,
          programmeId,
          site.siteName,
          site.subcounty,
          site.ward,
          site.targetBeneficiaries,
          site.statusNorm,
          site.percentComplete,
          site.remarks,
          site.sortOrder ?? i,
        ]
      );
    } else {
      await pool.query(
        `
        INSERT INTO rri_programme_sites (
          rri_programme_id, site_name, subcounty, ward, target_beneficiaries,
          status_norm, percent_complete, remarks, sort_order
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `,
        [
          programmeId,
          site.siteName,
          site.subcounty,
          site.ward,
          site.targetBeneficiaries,
          site.statusNorm,
          site.percentComplete,
          site.remarks,
          site.sortOrder ?? i,
        ]
      );
    }
  }
}

async function replaceProgrammeSites(programmeId, sites) {
  await pool.query(
    `UPDATE rri_programme_sites SET voided = true, updated_at = NOW() WHERE rri_programme_id = $1`,
    [programmeId]
  );
  for (let i = 0; i < sites.length; i += 1) {
    const site = sites[i];
    await pool.query(
      `
      INSERT INTO rri_programme_sites (
        rri_programme_id, site_name, subcounty, ward, target_beneficiaries,
        status_norm, percent_complete, remarks, sort_order
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `,
      [
        programmeId,
        site.siteName,
        site.subcounty,
        site.ward,
        site.targetBeneficiaries,
        site.statusNorm || 'Not Started',
        site.percentComplete ?? 0,
        site.remarks,
        site.sortOrder ?? i,
      ]
    );
  }
}

function primaryLocationFromSites(sites) {
  const first = (sites || []).find((site) => site?.subcounty || site?.ward) || sites?.[0];
  return {
    subcounty: first?.subcounty || null,
    ward: first?.ward || null,
  };
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
  const fragment = (hasProjectScopes
    ? orgScope.buildExplicitProjectScopeFragment(alias)
    : orgScope.buildProjectListScopeFragment(alias)
  ).replace(/\?/g, () => `$${nextIndex++}`);
  where.push(fragment);
  params.push(...(hasProjectScopes
    ? orgScope.explicitProjectScopeParams(authUserId)
    : orgScope.projectScopeParamTriple(authUserId)));
}

async function beneficiariesTableExists() {
  return beneficiaryRegistry.tableExists();
}

async function buildProgrammeSelect() {
  const hasBeneficiaries = await beneficiariesTableExists();
  const beneficiaryCountExpr = hasBeneficiaries
    ? `(
      SELECT COALESCE(SUM(
        CASE WHEN b.beneficiary_type IN ('group', 'household', 'institution')
          THEN GREATEST(COALESCE(b.member_count, 1), 1) ELSE 1 END
      ), 0)::int
      FROM beneficiaries b
      WHERE COALESCE(b.voided, false) = false
        AND (
          b.rri_programme_id = rp.programme_id
          OR b.project_id IN (
            SELECT rpp.project_id
            FROM rri_programme_projects rpp
            WHERE rpp.rri_programme_id = rp.programme_id
              AND COALESCE(rpp.voided, false) = false
          )
        )
    )`
    : `(SELECT 0)`;
  const projectBeneficiaryJoin = '';

  return `
  SELECT
    rp.programme_id AS "programmeId",
    rp.name,
    rp.description,
    rp.sector,
    rp.subcounty,
    rp.ward,
    rp.target_beneficiaries AS "targetBeneficiaries",
    rp.status,
    rp.delivery_mode AS "deliveryMode",
    rp.created_by AS "createdBy",
    rp.created_at AS "createdAt",
    rp.updated_at AS "updatedAt",
    COALESCE(coverage.location_count, 0)::int AS "locationCount",
    coverage.coverage_summary AS "coverageSummary",
    COALESCE(coverage.coverage_avg_progress, 0)::numeric AS "coverageAvgProgress",
    COALESCE(stats.linked_projects, 0)::int AS "linkedProjectCount",
    COALESCE(stats.site_count, 0)::int AS "siteCount",
    COALESCE(${beneficiaryCountExpr}, 0)::int AS "beneficiaryCount",
    COALESCE(stats.total_budget, 0)::numeric AS "totalBudget",
    COALESCE(stats.avg_progress, 0)::numeric AS "avgProgress",
    COALESCE(
      CASE
        WHEN COALESCE(coverage.location_count, 0) > 0 AND COALESCE(stats.linked_projects, 0) > 0
          THEN (COALESCE(coverage.coverage_avg_progress, 0) + COALESCE(stats.avg_progress, 0)) / 2
        WHEN COALESCE(coverage.location_count, 0) > 0
          THEN COALESCE(coverage.coverage_avg_progress, 0)
        ELSE COALESCE(stats.avg_progress, 0)
      END,
      0
    )::numeric AS "overallProgress"
  FROM rri_programmes rp
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*)::int AS location_count,
      COALESCE(AVG(rps.percent_complete), 0) AS coverage_avg_progress,
      NULLIF(
        string_agg(
          DISTINCT NULLIF(trim(rps.ward), ''),
          ', ' ORDER BY NULLIF(trim(rps.ward), '')
        ),
        ''
      ) AS coverage_summary
    FROM rri_programme_sites rps
    WHERE rps.rri_programme_id = rp.programme_id
      AND COALESCE(rps.voided, false) = false
  ) coverage ON true
  LEFT JOIN LATERAL (
    SELECT
      COUNT(DISTINCT rpp.project_id)::int AS linked_projects,
      COUNT(DISTINCT ps.site_id)::int AS site_count,
      COALESCE(SUM(
        CASE WHEN (p.budget->>'allocated_amount_kes') ~ '^-?[0-9]+(\\.[0-9]+)?$'
        THEN (p.budget->>'allocated_amount_kes')::numeric ELSE 0 END
      ), 0) AS total_budget,
      COALESCE(AVG(
        CASE WHEN (p.progress->>'percentage_complete') ~ '^-?[0-9]+(\\.[0-9]+)?$'
        THEN (p.progress->>'percentage_complete')::numeric ELSE NULL END
      ), 0) AS avg_progress
    FROM rri_programme_projects rpp
    INNER JOIN projects p ON p.project_id = rpp.project_id AND COALESCE(p.voided, false) = false
    LEFT JOIN project_sites ps ON ps.project_id = p.project_id
    ${projectBeneficiaryJoin}
    WHERE rpp.rri_programme_id = rp.programme_id
      AND COALESCE(rpp.voided, false) = false
    GROUP BY rpp.rri_programme_id
  ) stats ON true
`;
}

async function buildProjectBeneficiarySubquery() {
  if (!(await beneficiariesTableExists())) {
    return `SELECT NULL::bigint AS project_id, 0::int AS beneficiary_count WHERE false`;
  }
  return `
    SELECT project_id, COALESCE(SUM(
      CASE WHEN beneficiary_type IN ('group', 'household', 'institution')
        THEN GREATEST(COALESCE(member_count, 1), 1) ELSE 1 END
    ), 0)::int AS beneficiary_count
    FROM beneficiaries
    WHERE COALESCE(voided, false) = false AND project_id IS NOT NULL
    GROUP BY project_id
  `;
}

router.use(requirePostgres);

router.get('/dashboard', canRead, async (req, res) => {
  try {
    await ensureSchema();
    const result = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE COALESCE(voided, false) = false)::int AS "totalProgrammes",
        COUNT(*) FILTER (WHERE status = 'active' AND COALESCE(voided, false) = false)::int AS "activeProgrammes",
        COUNT(*) FILTER (WHERE delivery_mode = 'internal' AND COALESCE(voided, false) = false)::int AS "internalDelivery",
        COALESCE(SUM(target_beneficiaries) FILTER (WHERE COALESCE(voided, false) = false), 0)::int AS "targetBeneficiaries"
      FROM rri_programmes
    `);
    res.json(result.rows?.[0] || {});
  } catch (error) {
    res.status(500).json({ message: 'Failed to load RRI dashboard.', error: error.message });
  }
});

router.get('/', canRead, async (req, res) => {
  try {
    await ensureSchema();
    const programmeSelect = await buildProgrammeSelect();
    const params = [];
    const where = ['COALESCE(rp.voided, false) = false'];
    if (req.query.status) {
      params.push(String(req.query.status));
      where.push(`rp.status = $${params.length}`);
    }
    if (req.query.ward) {
      params.push(`%${textOrNull(req.query.ward)}%`);
      where.push(`(
        rp.ward ILIKE $${params.length}
        OR EXISTS (
          SELECT 1
          FROM rri_programme_sites rps
          WHERE rps.rri_programme_id = rp.programme_id
            AND COALESCE(rps.voided, false) = false
            AND rps.ward ILIKE $${params.length}
        )
      )`);
    }
    if (req.query.search) {
      params.push(`%${textOrNull(req.query.search)}%`);
      where.push(`(rp.name ILIKE $${params.length} OR COALESCE(rp.description, '') ILIKE $${params.length})`);
    }
    const result = await pool.query(
      `${programmeSelect}
       WHERE ${where.join(' AND ')}
       ORDER BY rp.updated_at DESC, rp.programme_id DESC
       LIMIT 500`,
      params
    );
    res.json({ rows: result.rows || [] });
  } catch (error) {
    res.status(500).json({ message: 'Failed to list RRI programmes.', error: error.message });
  }
});

router.get('/:programmeId', canRead, async (req, res) => {
  try {
    await ensureSchema();
    const programmeId = Number(req.params.programmeId);
    const programmeSelect = await buildProgrammeSelect();
    const prog = await pool.query(
      `${programmeSelect} WHERE rp.programme_id = $1 AND COALESCE(rp.voided, false) = false LIMIT 1`,
      [programmeId]
    );
    if (!prog.rows?.[0]) return res.status(404).json({ message: 'RRI programme not found.' });

    const linksWhere = ['rpp.rri_programme_id = $1', 'COALESCE(rpp.voided, false) = false', 'COALESCE(p.voided, false) = false'];
    const linkParams = [programmeId];
    await addProjectScopeWhere(req.user, linksWhere, linkParams, 'p');

    const beneficiarySubquery = await buildProjectBeneficiarySubquery();
    const links = await pool.query(
      `
      SELECT
        rpp.id,
        rpp.project_id AS "projectId",
        p.name AS "projectName",
        p.progress->>'status' AS status,
        CASE WHEN (p.progress->>'percentage_complete') ~ '^-?[0-9]+(\\.[0-9]+)?$'
          THEN (p.progress->>'percentage_complete')::numeric ELSE NULL END AS "overallProgress",
        p.location->>'ward' AS ward,
        p.location->>'subcounty' AS subcounty,
        COALESCE(site_counts.site_count, 0)::int AS "siteCount",
        COALESCE(ben.beneficiary_count, 0)::int AS "beneficiaryCount"
      FROM rri_programme_projects rpp
      INNER JOIN projects p ON p.project_id = rpp.project_id
      LEFT JOIN (
        SELECT project_id, COUNT(*)::int AS site_count FROM project_sites GROUP BY project_id
      ) site_counts ON site_counts.project_id = p.project_id
      LEFT JOIN (
        ${beneficiarySubquery}
      ) ben ON ben.project_id = p.project_id
      WHERE ${linksWhere.join(' AND ')}
      ORDER BY p.name ASC
      `,
      linkParams
    );
    res.json({
      programme: prog.rows[0],
      projects: links.rows || [],
      sites: await fetchProgrammeSites(programmeId),
      monitoring: {
        coverageAvgProgress: Number(prog.rows[0]?.coverageAvgProgress || 0),
        projectAvgProgress: Number(prog.rows[0]?.avgProgress || 0),
        overallProgress: Number(prog.rows[0]?.overallProgress || 0),
        beneficiaryCount: Number(prog.rows[0]?.beneficiaryCount || 0),
        targetBeneficiaries: Number(prog.rows[0]?.targetBeneficiaries || 0),
        linkedProjectCount: Number(prog.rows[0]?.linkedProjectCount || 0),
        registrySiteCount: Number(prog.rows[0]?.siteCount || 0),
      },
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to load RRI programme.', error: error.message });
  }
});

router.patch('/:programmeId/sites/:siteId', canWrite, async (req, res) => {
  try {
    await ensureSchema();
    const programmeId = Number(req.params.programmeId);
    const siteId = Number(req.params.siteId);
    const result = await pool.query(
      `
      UPDATE rri_programme_sites SET
        status_norm = COALESCE($3, status_norm),
        percent_complete = COALESCE($4, percent_complete),
        remarks = COALESCE($5, remarks),
        updated_at = NOW()
      WHERE site_id = $1
        AND rri_programme_id = $2
        AND COALESCE(voided, false) = false
      RETURNING site_id AS "siteId"
      `,
      [
        siteId,
        programmeId,
        req.body?.statusNorm !== undefined ? normalizeSiteStatus(req.body.statusNorm) : null,
        req.body?.percentComplete !== undefined ? normalizePercent(req.body.percentComplete) : null,
        req.body?.remarks !== undefined ? textOrNull(req.body.remarks) : null,
      ]
    );
    if (!result.rows?.[0]) return res.status(404).json({ message: 'Coverage location not found.' });
    const sites = await fetchProgrammeSites(programmeId);
    res.json({ site: sites.find((s) => Number(s.siteId) === siteId) || null, sites });
  } catch (error) {
    res.status(500).json({ message: 'Failed to update coverage location.', error: error.message });
  }
});

router.get('/:programmeId/beneficiary-import-template', canRead, async (req, res) => {
  try {
    await ensureSchema();
    const programmeId = Number(req.params.programmeId);
    const { buildBeneficiaryImportWorkbook } = require('../services/beneficiaryTemplateService');
    const workbook = await buildBeneficiaryImportWorkbook({ rriProgrammeId: programmeId });
    const safeName = String(workbook.getWorksheet('Instructions')?.getCell(1, 1).value || `programme-${programmeId}`)
      .replace(/[^\w\s-]+/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .slice(0, 60) || `programme-${programmeId}`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="beneficiary-import-${safeName}.xlsx"`);
    await workbook.xlsx.write(res);
    return res.end();
  } catch (error) {
    const status = /not found/i.test(error.message) ? 404 : 500;
    res.status(status).json({ message: error.message || 'Failed to generate beneficiary import template.', error: error.message });
  }
});

router.get('/:programmeId/beneficiaries', canRead, async (req, res) => {
  try {
    await ensureSchema();
    const programmeId = Number(req.params.programmeId);
    const limit = Math.min(Number(req.query.limit) || 50, 500);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const result = await beneficiaryRegistry.listForProgramme(programmeId, limit, offset);
    res.json(result);
  } catch (error) {
    res.status(500).json({ message: 'Failed to load programme beneficiaries.', error: error.message });
  }
});

router.post('/', canWrite, async (req, res) => {
  try {
    await ensureSchema();
    const name = textOrNull(req.body?.name);
    if (!name) return res.status(400).json({ message: 'Programme name is required.' });
    const sites = normalizeSitesInput(req.body?.sites);
    const legacySubcounty = textOrNull(req.body?.subcounty);
    const legacyWard = textOrNull(req.body?.ward);
    if (!sites.length && !legacySubcounty && !legacyWard) {
      return res.status(400).json({ message: 'Add at least one coverage location (sub-county or ward).' });
    }
    const effectiveSites = sites.length
      ? sites
      : [{ subcounty: legacySubcounty, ward: legacyWard, sortOrder: 0 }];
    const primary = primaryLocationFromSites(effectiveSites);
    const result = await pool.query(
      `
      INSERT INTO rri_programmes (
        name, description, sector, subcounty, ward, target_beneficiaries, status, delivery_mode, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING programme_id AS "programmeId"
      `,
      [
        name,
        textOrNull(req.body?.description),
        textOrNull(req.body?.sector),
        primary.subcounty,
        primary.ward,
        req.body?.targetBeneficiaries != null ? Number(req.body.targetBeneficiaries) : null,
        textOrNull(req.body?.status) || 'active',
        textOrNull(req.body?.deliveryMode) || 'internal',
        getUserId(req.user),
      ]
    );
    const programmeId = result.rows?.[0]?.programmeId;
    await replaceProgrammeSites(programmeId, effectiveSites);
    const programmeSelect = await buildProgrammeSelect();
    const detail = await pool.query(
      `${programmeSelect} WHERE rp.programme_id = $1 LIMIT 1`,
      [programmeId]
    );
    res.status(201).json(detail.rows?.[0]);
  } catch (error) {
    res.status(500).json({ message: 'Failed to create RRI programme.', error: error.message });
  }
});

router.put('/:programmeId', canWrite, async (req, res) => {
  try {
    await ensureSchema();
    const programmeId = Number(req.params.programmeId);
    const sites = req.body?.sites !== undefined ? normalizeSitesInput(req.body.sites) : null;
    const primary = sites?.length ? primaryLocationFromSites(sites) : null;
    const result = await pool.query(
      `
      UPDATE rri_programmes SET
        name = COALESCE($2, name),
        description = COALESCE($3, description),
        sector = COALESCE($4, sector),
        subcounty = COALESCE($5, subcounty),
        ward = COALESCE($6, ward),
        target_beneficiaries = COALESCE($7, target_beneficiaries),
        status = COALESCE($8, status),
        delivery_mode = COALESCE($9, delivery_mode),
        updated_at = NOW()
      WHERE programme_id = $1 AND COALESCE(voided, false) = false
      RETURNING programme_id
      `,
      [
        programmeId,
        textOrNull(req.body?.name),
        req.body?.description !== undefined ? textOrNull(req.body.description) : null,
        req.body?.sector !== undefined ? textOrNull(req.body.sector) : null,
        sites !== null ? primary?.subcounty : (req.body?.subcounty !== undefined ? textOrNull(req.body.subcounty) : null),
        sites !== null ? primary?.ward : (req.body?.ward !== undefined ? textOrNull(req.body.ward) : null),
        req.body?.targetBeneficiaries !== undefined ? Number(req.body.targetBeneficiaries) || null : null,
        textOrNull(req.body?.status),
        textOrNull(req.body?.deliveryMode),
      ]
    );
    if (!result.rows?.[0]) return res.status(404).json({ message: 'RRI programme not found.' });
    if (sites !== null) {
      if (!sites.length) {
        return res.status(400).json({ message: 'Add at least one coverage location (sub-county or ward).' });
      }
      await syncProgrammeSites(programmeId, sites);
    }
    const programmeSelect = await buildProgrammeSelect();
    const detail = await pool.query(`${programmeSelect} WHERE rp.programme_id = $1 LIMIT 1`, [programmeId]);
    res.json(detail.rows?.[0]);
  } catch (error) {
    res.status(500).json({ message: 'Failed to update RRI programme.', error: error.message });
  }
});

router.post('/:programmeId/projects', canWrite, async (req, res) => {
  try {
    await ensureSchema();
    const programmeId = Number(req.params.programmeId);
    const projectId = Number(req.body?.projectId);
    if (!projectId) return res.status(400).json({ message: 'projectId is required.' });

    const exists = await pool.query(
      'SELECT 1 FROM projects WHERE project_id = $1 AND COALESCE(voided, false) = false',
      [projectId]
    );
    if (!exists.rows?.[0]) return res.status(404).json({ message: 'Project not found.' });

    await pool.query(
      `
      INSERT INTO rri_programme_projects (rri_programme_id, project_id, notes, linked_by)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (rri_programme_id, project_id) DO UPDATE SET
        voided = false,
        notes = COALESCE(EXCLUDED.notes, rri_programme_projects.notes),
        linked_by = EXCLUDED.linked_by,
        linked_at = NOW()
      `,
      [programmeId, projectId, textOrNull(req.body?.notes), getUserId(req.user)]
    );

    await pool.query(
      `UPDATE projects SET notes = COALESCE(notes, '{}'::jsonb) || '{"delivery_mode":"rri"}'::jsonb, updated_at = NOW()
       WHERE project_id = $1`,
      [projectId]
    );

    res.status(201).json({ programmeId, projectId, linked: true });
  } catch (error) {
    res.status(500).json({ message: 'Failed to link project to RRI programme.', error: error.message });
  }
});

router.delete('/:programmeId/projects/:projectId', canWrite, async (req, res) => {
  try {
    await ensureSchema();
    await pool.query(
      `UPDATE rri_programme_projects SET voided = true WHERE rri_programme_id = $1 AND project_id = $2`,
      [Number(req.params.programmeId), Number(req.params.projectId)]
    );
    res.json({ unlinked: true });
  } catch (error) {
    res.status(500).json({ message: 'Failed to unlink project.', error: error.message });
  }
});

router.delete('/:programmeId', canDelete, async (req, res) => {
  try {
    await ensureSchema();
    await pool.query(
      `UPDATE rri_programmes SET voided = true, updated_at = NOW() WHERE programme_id = $1`,
      [Number(req.params.programmeId)]
    );
    res.json({ deleted: true });
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete RRI programme.', error: error.message });
  }
});

module.exports = router;
