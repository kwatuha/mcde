/**
 * Planning indicators & measurement types (CIDP / M&E support).
 */
const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const privilege = require('../middleware/privilegeMiddleware');
const orgScope = require('../services/organizationScopeService');
const { isSuperAdminRequester } = require('../utils/roleUtils');

const DB_TYPE = process.env.DB_TYPE || 'mysql';
const isPostgres = DB_TYPE === 'postgresql';

function normalizeReportingFrequencyCode(explicitCode, frequencyName) {
  let c = String(explicitCode || '').trim().toLowerCase();
  if (c) return c.replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
  return String(frequencyName || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

const rowsFromResult = (result) =>
  isPostgres ? result?.rows || [] : Array.isArray(result) ? result[0] || [] : [];
const firstRow = (result) => rowsFromResult(result)[0] || null;
const getScopeUserId = (user) => user?.id ?? user?.userId ?? user?.actualUserId ?? null;

async function addProjectScopeWhere(req, filters, params, projectAlias = 'p', placeholderIndex = null) {
  if (!isPostgres) return placeholderIndex;
  const authUserId = getScopeUserId(req.user);
  const authPrivileges = req.user?.privileges || [];
  if (!authUserId) {
    filters.push('FALSE');
    return placeholderIndex;
  }
  if (isSuperAdminRequester(req.user) || orgScope.userHasOrganizationBypass(authPrivileges)) {
    return placeholderIndex;
  }
  if (!(await orgScope.organizationScopeTableExists())) {
    filters.push('FALSE');
    return placeholderIndex;
  }
  const hasProjectScopes = await orgScope.userHasProjectAccessScopeContext(authUserId);
  const numericPlaceholderIndex = Number(placeholderIndex);
  let i = (
    placeholderIndex !== null &&
    placeholderIndex !== undefined &&
    Number.isFinite(numericPlaceholderIndex) &&
    numericPlaceholderIndex > 0
  ) ? numericPlaceholderIndex : params.length + 1;
  const rawScopeFragment = hasProjectScopes
    ? orgScope.buildExplicitProjectScopeFragment(projectAlias)
    : orgScope.buildProjectListScopeFragment(projectAlias);
  const scopeParams = hasProjectScopes
    ? orgScope.explicitProjectScopeParams(authUserId)
    : orgScope.projectScopeParamTriple(authUserId);
  const scopeFragment = rawScopeFragment.replace(/\?/g, () => `$${i++}`);
  filters.push(scopeFragment);
  params.push(...scopeParams);
  return i;
}

const canRead = privilege(['strategic_plan.read_all']);
const canWrite = privilege(['strategic_plan.create', 'strategic_plan.update'], { anyOf: true });

const CIMES_PROJECT_ACTIVITY_SEED_ROWS = [
  {
    projectCode: 'ADP-001',
    projectName: 'ROAD REHABILITATION',
    activityCode: 'ACT-001',
    activityName: 'Road Grading',
    description: 'Grading and graveling works',
    startDate: '2024-03-01',
    endDate: '2024-08-30',
    status: 'COMPLETED',
    completedAt: '2026-02-01',
    targetValue: 1,
    baselineValue: 1,
    matchTerms: ['road', 'roads', 'access road'],
  },
  {
    projectCode: 'ADP-003',
    projectName: 'HEALTH FACILITY UPGRADE',
    activityCode: 'ACT-003',
    activityName: 'CLASSROOM CONSTRUCTION',
    description: 'BUILDING ECDE CLASSROOMS',
    startDate: '2024-02-01',
    endDate: '2024-09-30',
    status: 'COMPLETED',
    completedAt: null,
    targetValue: 1,
    baselineValue: 1,
    matchTerms: ['health', 'facility', 'hospital', 'clinic'],
  },
  {
    projectCode: 'ADP-004',
    projectName: 'ECDE Classroom Construction',
    activityCode: 'ACT-004',
    activityName: 'EQUIPMENT INSTALLATION',
    description: 'INSTALLATION OF HOSPITAL EQUIPMENT',
    startDate: '2024-05-01',
    endDate: '2024-07-30',
    status: 'COMPLETED',
    completedAt: null,
    targetValue: 1,
    baselineValue: 1,
    matchTerms: ['ecde', 'classroom', 'education', 'equipment'],
  },
  {
    projectCode: 'ADP-006',
    projectName: 'Street Lighting Project',
    activityCode: 'ACT-006',
    activityName: 'MARKET RENOVATION',
    description: 'RENOVATION WORKS',
    startDate: '2024-02-15',
    endDate: '2024-11-30',
    status: 'ONGOING',
    completedAt: null,
    targetValue: 1,
    baselineValue: 0,
    matchTerms: ['lighting', 'street', 'market'],
  },
  {
    projectCode: 'ADP-007',
    projectName: 'ICT Infrastructure',
    activityCode: 'ACT-007',
    activityName: 'Youth Training',
    description: 'Skills training sessions',
    startDate: '2024-01-10',
    endDate: '2024-12-15',
    status: 'PLANNED',
    completedAt: null,
    targetValue: 1,
    baselineValue: 1,
    matchTerms: ['ict', 'digital', 'fiber', 'fibre', 'youth'],
  },
  {
    projectCode: 'ADP-008',
    projectName: 'Drainage Improvement',
    activityCode: 'ACT-008',
    activityName: 'ICT Deployment',
    description: 'Network & system deployment',
    startDate: '2024-04-10',
    endDate: '2024-08-30',
    status: 'ONGOING',
    completedAt: null,
    targetValue: 1,
    baselineValue: 1,
    matchTerms: ['drainage', 'network', 'system'],
  },
  {
    projectCode: 'ADP-009',
    projectName: 'Youth Empowerment',
    activityCode: 'ACT-009',
    activityName: 'WASTE COLLECTION',
    description: 'SOLID WASTE COLLECTION SERVICES',
    startDate: '2024-01-01',
    endDate: '2024-12-31',
    status: 'ONGOING',
    completedAt: null,
    targetValue: 1,
    baselineValue: 1,
    matchTerms: ['youth', 'empowerment', 'waste'],
  },
  {
    projectCode: 'ADP-010',
    projectName: 'Solid Waste Management',
    activityCode: 'ACT-010',
    activityName: 'Climate Interventions',
    description: 'Tree planting & drainage',
    startDate: '2024-03-01',
    endDate: '2024-10-30',
    status: 'PLANNED',
    completedAt: null,
    targetValue: 1,
    baselineValue: 1,
    matchTerms: ['waste', 'climate', 'tree', 'environment', 'drainage'],
  },
];

const CIDP_PILLAR_SEED_ROWS = [
  {
    pillarCode: 'ECO_DEV',
    pillarName: 'ECONOMIC DEVELOPMENT',
    cidpPeriod: 'JUL/2020 - JUN/2026',
    description: 'Seeded from CIMES ADP project list. Focuses on productive sectors, food security, infrastructure, markets, ICT, youth empowerment, drainage, lighting, and waste management.',
    objectives: [
      {
        objectiveName: 'INCREASE AGRICULTURAL PRODUCTIVITY AND FOOD SECURITY',
        sectorCode: 'AGR',
        sectorName: 'AGRICULTURE, LIVESTOCK & FISHERIES',
        programmeName: 'AGRICULTURAL PRODUCTIVITY IMPROVEMENT PROGRAMME',
        programmePeriod: 'JUL/2020 - JUN/2026',
        sdgCode: 'SDG 2',
        sdgName: 'ZERO HUNGER',
        adpProjectCount: 9,
        sampleProjects: [
          'ROAD REHABILITATION',
          'WATER SUPPLY EXPANSION',
          'ECDE Classroom Construction',
          'Market Modernization',
          'Street Lighting Project',
          'ICT Infrastructure',
          'Drainage Improvement',
          'Youth Empowerment',
          'Solid Waste Management',
        ],
      },
    ],
  },
  {
    pillarCode: 'SOC_DEV',
    pillarName: 'SOCIAL DEVELOPMENT',
    cidpPeriod: 'JUL/2020 - JUN/2026',
    description: 'Seeded from CIMES ADP project list. Focuses on access to quality healthcare and social service outcomes.',
    objectives: [
      {
        objectiveName: 'IMPROVE ACCESS TO QUALITY HEALTHCARE',
        sectorCode: 'HLT',
        sectorName: 'HEALTH SERVICES',
        programmeName: 'MATERNAL & CHILD HEALTH PROGRAMME',
        programmePeriod: 'JUL/2020 - JUN/2026',
        sdgCode: 'SDG 3',
        sdgName: 'GOOD HEALTH AND WELL-BEING',
        adpProjectCount: 1,
        sampleProjects: ['HEALTH FACILITY UPGRADE'],
      },
    ],
  },
];

let tablesEnsured = false;

async function ensureTables() {
  if (tablesEnsured) return;
  const runSafe = async (sql) => {
    try {
      await pool.query(sql);
    } catch (e) {
      const code = String(e?.code || '');
      if (code === '42P07' || code === '42710' || code === '23505' || code === 'ER_TABLE_EXISTS_ERROR') return;
      throw e;
    }
  };

  if (isPostgres) {
    await runSafe(`
      CREATE TABLE IF NOT EXISTS planning_measurement_types (
        id BIGSERIAL PRIMARY KEY,
        code TEXT NOT NULL,
        label TEXT NOT NULL,
        description TEXT NULL,
        voided BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_planning_mt_code UNIQUE (code)
      )
    `);
    await runSafe(`
      CREATE TABLE IF NOT EXISTS planning_indicators (
        id BIGSERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NULL,
        measurement_type_id BIGINT NOT NULL REFERENCES planning_measurement_types(id),
        voided BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await runSafe(`
      CREATE TABLE IF NOT EXISTS planning_project_activities (
        id BIGSERIAL PRIMARY KEY,
        activity_code TEXT NOT NULL,
        activity_name TEXT NOT NULL,
        indicator_id BIGINT NOT NULL REFERENCES planning_indicators(id),
        description TEXT NULL,
        voided BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_planning_proj_act_code UNIQUE (activity_code)
      )
    `);
    await runSafe(
      `CREATE INDEX IF NOT EXISTS idx_planning_proj_act_indicator ON planning_project_activities(indicator_id)`
    );
    await runSafe(`
      CREATE TABLE IF NOT EXISTS planning_project_risks (
        id BIGSERIAL PRIMARY KEY,
        risk_code TEXT NOT NULL,
        risk_name TEXT NOT NULL,
        description TEXT NULL,
        voided BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_planning_proj_risk_code UNIQUE (risk_code)
      )
    `);
    await runSafe(`
      CREATE TABLE IF NOT EXISTS project_planning_activity_links (
        id BIGSERIAL PRIMARY KEY,
        project_id BIGINT NOT NULL,
        planning_activity_id BIGINT NOT NULL REFERENCES planning_project_activities(id),
        notes TEXT NULL,
        voided BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_proj_plan_act_link UNIQUE (project_id, planning_activity_id)
      )
    `);
    await runSafe(
      `CREATE INDEX IF NOT EXISTS idx_ppactlink_project ON project_planning_activity_links(project_id)`
    );
    await runSafe(`ALTER TABLE project_planning_activity_links ADD COLUMN IF NOT EXISTS target_value NUMERIC NULL`);
    await runSafe(`ALTER TABLE project_planning_activity_links ADD COLUMN IF NOT EXISTS baseline_value NUMERIC NULL`);
    await runSafe(`ALTER TABLE project_planning_activity_links ADD COLUMN IF NOT EXISTS planned_start_date DATE NULL`);
    await runSafe(`ALTER TABLE project_planning_activity_links ADD COLUMN IF NOT EXISTS planned_end_date DATE NULL`);
    await runSafe(`ALTER TABLE project_planning_activity_links ADD COLUMN IF NOT EXISTS activity_status TEXT NULL`);
    await runSafe(`ALTER TABLE project_planning_activity_links ADD COLUMN IF NOT EXISTS completed_at DATE NULL`);
    await runSafe(`ALTER TABLE project_planning_activity_links ADD COLUMN IF NOT EXISTS cimes_project_code TEXT NULL`);
    await runSafe(`ALTER TABLE project_planning_activity_links ADD COLUMN IF NOT EXISTS cimes_project_name TEXT NULL`);
    await runSafe(`ALTER TABLE project_planning_activity_links ADD COLUMN IF NOT EXISTS seed_source TEXT NULL`);
    await runSafe(`
      CREATE TABLE IF NOT EXISTS project_planning_risk_links (
        id BIGSERIAL PRIMARY KEY,
        project_id BIGINT NOT NULL,
        planning_risk_id BIGINT NOT NULL REFERENCES planning_project_risks(id),
        risk_level TEXT NOT NULL DEFAULT 'Medium',
        notes TEXT NULL,
        voided BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_proj_plan_risk_link UNIQUE (project_id, planning_risk_id)
      )
    `);
    await runSafe(`CREATE INDEX IF NOT EXISTS idx_pprisklink_project ON project_planning_risk_links(project_id)`);
    await runSafe(`ALTER TABLE project_planning_risk_links ADD COLUMN IF NOT EXISTS risk_level TEXT NOT NULL DEFAULT 'Medium'`);
    await runSafe(`
      CREATE TABLE IF NOT EXISTS planning_reporting_frequencies (
        id BIGSERIAL PRIMARY KEY,
        frequency_code TEXT NOT NULL,
        frequency_name TEXT NOT NULL,
        description TEXT NULL,
        active BOOLEAN NOT NULL DEFAULT TRUE,
        voided BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_planning_reporting_freq_code UNIQUE (frequency_code)
      )
    `);
    await runSafe(`
      CREATE TABLE IF NOT EXISTS planning_cidp_pillars (
        id BIGSERIAL PRIMARY KEY,
        pillar_code TEXT NOT NULL,
        pillar_name TEXT NOT NULL,
        cidp_period TEXT NULL,
        description TEXT NULL,
        active BOOLEAN NOT NULL DEFAULT TRUE,
        voided BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_planning_cidp_pillar_code UNIQUE (pillar_code)
      )
    `);
    await runSafe(`
      CREATE TABLE IF NOT EXISTS planning_cidp_pillar_objectives (
        id BIGSERIAL PRIMARY KEY,
        pillar_id BIGINT NOT NULL REFERENCES planning_cidp_pillars(id),
        objective_name TEXT NOT NULL,
        sector_code TEXT NULL,
        sector_name TEXT NULL,
        programme_name TEXT NULL,
        programme_period TEXT NULL,
        sdg_code TEXT NULL,
        sdg_name TEXT NULL,
        adp_project_count INTEGER NOT NULL DEFAULT 0,
        sample_projects TEXT NULL,
        voided BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await runSafe(
      `CREATE INDEX IF NOT EXISTS idx_planning_cidp_pillar_obj_pillar ON planning_cidp_pillar_objectives(pillar_id)`
    );
    await runSafe(`
      CREATE TABLE IF NOT EXISTS planning_cidp_periods (
        id BIGSERIAL PRIMARY KEY,
        period_name TEXT NOT NULL,
        start_date DATE NULL,
        end_date DATE NULL,
        active BOOLEAN NOT NULL DEFAULT TRUE,
        voided BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_planning_cidp_period_name UNIQUE (period_name)
      )
    `);
    await runSafe(`
      CREATE TABLE IF NOT EXISTS planning_adp_periods (
        id BIGSERIAL PRIMARY KEY,
        cidp_period_id BIGINT NULL REFERENCES planning_cidp_periods(id),
        cidp_period TEXT NULL,
        period_name TEXT NOT NULL,
        start_date DATE NULL,
        end_date DATE NULL,
        active BOOLEAN NOT NULL DEFAULT TRUE,
        voided BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_planning_adp_period_name UNIQUE (period_name)
      )
    `);
    await runSafe(`
      CREATE TABLE IF NOT EXISTS planning_programmes (
        id BIGSERIAL PRIMARY KEY,
        cidp_period TEXT NULL,
        pillar_name TEXT NULL,
        objective_name TEXT NULL,
        sector_code TEXT NULL,
        sector_name TEXT NULL,
        programme_name TEXT NOT NULL,
        programme_description TEXT NULL,
        sdg_code TEXT NULL,
        sdg_name TEXT NULL,
        programme_period TEXT NULL,
        active BOOLEAN NOT NULL DEFAULT TRUE,
        voided BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await runSafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_planning_programme_name
      ON planning_programmes (programme_name, COALESCE(sector_code, ''), COALESCE(sdg_code, ''))
      WHERE voided = FALSE
    `);
  } else {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS planning_measurement_types (
        id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        code VARCHAR(64) NOT NULL,
        label VARCHAR(255) NOT NULL,
        description TEXT NULL,
        voided TINYINT(1) NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_planning_mt_code (code)
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS planning_indicators (
        id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT NULL,
        measurement_type_id BIGINT NOT NULL,
        voided TINYINT(1) NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_planning_ind_mt FOREIGN KEY (measurement_type_id) REFERENCES planning_measurement_types(id)
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS planning_project_activities (
        id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        activity_code VARCHAR(128) NOT NULL,
        activity_name VARCHAR(512) NOT NULL,
        indicator_id BIGINT NOT NULL,
        description TEXT NULL,
        voided TINYINT(1) NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_planning_proj_act_code (activity_code),
        CONSTRAINT fk_planning_proj_act_ind FOREIGN KEY (indicator_id) REFERENCES planning_indicators(id)
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS planning_project_risks (
        id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        risk_code VARCHAR(128) NOT NULL,
        risk_name VARCHAR(512) NOT NULL,
        description TEXT NULL,
        voided TINYINT(1) NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_planning_proj_risk_code (risk_code)
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS project_planning_activity_links (
        id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        project_id BIGINT NOT NULL,
        planning_activity_id BIGINT NOT NULL,
        target_value DECIMAL(18,2) NULL,
        baseline_value DECIMAL(18,2) NULL,
        notes TEXT NULL,
        voided TINYINT(1) NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_proj_plan_act_link (project_id, planning_activity_id),
        CONSTRAINT fk_ppactlink_act FOREIGN KEY (planning_activity_id) REFERENCES planning_project_activities(id)
      )
    `);
    try {
      await pool.query(`ALTER TABLE project_planning_activity_links ADD COLUMN target_value DECIMAL(18,2) NULL`);
    } catch (e) {
      const msg = String(e?.message || '').toLowerCase();
      const code = String(e?.code || '');
      if (!msg.includes('duplicate column') && code !== 'ER_DUP_FIELDNAME') throw e;
    }
    try {
      await pool.query(`ALTER TABLE project_planning_activity_links ADD COLUMN baseline_value DECIMAL(18,2) NULL`);
    } catch (e) {
      const msg = String(e?.message || '').toLowerCase();
      const code = String(e?.code || '');
      if (!msg.includes('duplicate column') && code !== 'ER_DUP_FIELDNAME') throw e;
    }
    const addLinkColumn = async (sql) => {
      try {
        await pool.query(sql);
      } catch (e) {
        const msg = String(e?.message || '').toLowerCase();
        const code = String(e?.code || '');
        if (!msg.includes('duplicate column') && code !== 'ER_DUP_FIELDNAME') throw e;
      }
    };
    await addLinkColumn(`ALTER TABLE project_planning_activity_links ADD COLUMN planned_start_date DATE NULL`);
    await addLinkColumn(`ALTER TABLE project_planning_activity_links ADD COLUMN planned_end_date DATE NULL`);
    await addLinkColumn(`ALTER TABLE project_planning_activity_links ADD COLUMN activity_status VARCHAR(64) NULL`);
    await addLinkColumn(`ALTER TABLE project_planning_activity_links ADD COLUMN completed_at DATE NULL`);
    await addLinkColumn(`ALTER TABLE project_planning_activity_links ADD COLUMN cimes_project_code VARCHAR(128) NULL`);
    await addLinkColumn(`ALTER TABLE project_planning_activity_links ADD COLUMN cimes_project_name VARCHAR(512) NULL`);
    await addLinkColumn(`ALTER TABLE project_planning_activity_links ADD COLUMN seed_source VARCHAR(128) NULL`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS project_planning_risk_links (
        id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        project_id BIGINT NOT NULL,
        planning_risk_id BIGINT NOT NULL,
        risk_level VARCHAR(32) NOT NULL DEFAULT 'Medium',
        notes TEXT NULL,
        voided TINYINT(1) NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_proj_plan_risk_link (project_id, planning_risk_id),
        CONSTRAINT fk_pprisklink_risk FOREIGN KEY (planning_risk_id) REFERENCES planning_project_risks(id)
      )
    `);
    try {
      await pool.query(`ALTER TABLE project_planning_risk_links ADD COLUMN risk_level VARCHAR(32) NOT NULL DEFAULT 'Medium'`);
    } catch (e) {
      const msg = String(e?.message || '').toLowerCase();
      const code = String(e?.code || '');
      if (!msg.includes('duplicate column') && code !== 'ER_DUP_FIELDNAME') throw e;
    }
    await pool.query(`
      CREATE TABLE IF NOT EXISTS planning_reporting_frequencies (
        id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        frequency_code VARCHAR(128) NOT NULL,
        frequency_name VARCHAR(512) NOT NULL,
        description TEXT NULL,
        active TINYINT(1) NOT NULL DEFAULT 1,
        voided TINYINT(1) NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_planning_reporting_freq_code (frequency_code)
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS planning_cidp_pillars (
        id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        pillar_code VARCHAR(128) NOT NULL,
        pillar_name VARCHAR(512) NOT NULL,
        cidp_period VARCHAR(128) NULL,
        description TEXT NULL,
        active TINYINT(1) NOT NULL DEFAULT 1,
        voided TINYINT(1) NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_planning_cidp_pillar_code (pillar_code)
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS planning_cidp_pillar_objectives (
        id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        pillar_id BIGINT NOT NULL,
        objective_name VARCHAR(1024) NOT NULL,
        sector_code VARCHAR(128) NULL,
        sector_name VARCHAR(512) NULL,
        programme_name VARCHAR(1024) NULL,
        programme_period VARCHAR(128) NULL,
        sdg_code VARCHAR(128) NULL,
        sdg_name VARCHAR(512) NULL,
        adp_project_count INT NOT NULL DEFAULT 0,
        sample_projects TEXT NULL,
        voided TINYINT(1) NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_planning_cidp_pillar_obj_pillar (pillar_id),
        CONSTRAINT fk_planning_cidp_pillar_obj FOREIGN KEY (pillar_id) REFERENCES planning_cidp_pillars(id)
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS planning_cidp_periods (
        id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        period_name VARCHAR(128) NOT NULL,
        start_date DATE NULL,
        end_date DATE NULL,
        active TINYINT(1) NOT NULL DEFAULT 1,
        voided TINYINT(1) NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_planning_cidp_period_name (period_name)
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS planning_adp_periods (
        id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        cidp_period_id BIGINT NULL,
        cidp_period VARCHAR(128) NULL,
        period_name VARCHAR(128) NOT NULL,
        start_date DATE NULL,
        end_date DATE NULL,
        active TINYINT(1) NOT NULL DEFAULT 1,
        voided TINYINT(1) NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_planning_adp_period_name (period_name),
        CONSTRAINT fk_planning_adp_cidp_period FOREIGN KEY (cidp_period_id) REFERENCES planning_cidp_periods(id)
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS planning_programmes (
        id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        cidp_period VARCHAR(128) NULL,
        pillar_name VARCHAR(512) NULL,
        objective_name VARCHAR(1024) NULL,
        sector_code VARCHAR(128) NULL,
        sector_name VARCHAR(512) NULL,
        programme_name VARCHAR(1024) NOT NULL,
        programme_description TEXT NULL,
        sdg_code VARCHAR(128) NULL,
        sdg_name VARCHAR(512) NULL,
        programme_period VARCHAR(128) NULL,
        active TINYINT(1) NOT NULL DEFAULT 1,
        voided TINYINT(1) NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_planning_programme_name (programme_name(255), sector_code, sdg_code)
      )
    `);
  }

  const seedDefaults = async () => {
    // General M&E types + sub-program "Unit of measure" options (codes match `subprograms.unitOfMeasure`).
    const defaults = [
      ['number', 'Number', 'Whole or decimal counts or amounts'],
      ['ratio', 'Ratio', 'Relationship between two quantities'],
      ['text', 'Text', 'Qualitative or narrative measure'],
      ['index', 'Index', 'Composite score or index value'],
      ['%', 'Percentage (%)', 'Share or completion rate as a percent'],
      ['count', 'Count', 'Discrete count of people, items, or events'],
      ['length', 'Length (m)', 'Linear distance in metres'],
      ['area', 'Area (m²)', 'Surface area in square metres'],
      ['volume', 'Volume (m³)', 'Volume in cubic metres'],
      ['weight', 'Weight (kg)', 'Mass in kilograms'],
      ['time', 'Time (days)', 'Duration in days'],
      ['currency', 'Currency (KES)', 'Monetary value in Kenyan shillings'],
      ['units', 'Units', 'Generic countable units'],
      ['stalls', 'Stalls', 'Market or trading stalls'],
      ['beds', 'Beds', 'Hospital or facility beds'],
      ['rooms', 'Rooms', 'Rooms or similar spaces'],
      ['classrooms', 'Classrooms', 'Teaching classrooms'],
      ['kilometers', 'Kilometers (km)', 'Road or distance in km'],
      ['meters', 'Meters (m)', 'Linear distance in metres'],
      ['hectares', 'Hectares', 'Land area in hectares'],
      ['acres', 'Acres', 'Land area in acres'],
    ];
    for (const [code, label, description] of defaults) {
      if (isPostgres) {
        await pool.query(
          `INSERT INTO planning_measurement_types (code, label, description)
           VALUES ($1, $2, $3)
           ON CONFLICT (code) DO NOTHING`,
          [code, label, description]
        );
      } else {
        await pool.query(
          `INSERT IGNORE INTO planning_measurement_types (code, label, description) VALUES (?, ?, ?)`,
          [code, label, description]
        );
      }
    }
  };

  const seedReportingFrequencies = async () => {
    // Seeded from CIMES "Reporting Frequency List" (Machakos / legacy M&E catalog).
    const rows = [
      ['annually', 'ANNUALLY', 'ANNUALLY'],
      ['bi_annual', 'BI-ANNUAL', 'BI-ANNUAL'],
      ['end_term', 'END TERM', 'END TERM'],
      ['monthly', 'MONTHLY', 'MONTHLY'],
      ['quaterly', 'QUATERLY', 'QUATERLY'],
    ];
    for (const [code, name, desc] of rows) {
      if (isPostgres) {
        await pool.query(
          `INSERT INTO planning_reporting_frequencies (frequency_code, frequency_name, description, active)
           VALUES ($1, $2, $3, TRUE)
           ON CONFLICT (frequency_code) DO NOTHING`,
          [code, name, desc]
        );
      } else {
        await pool.query(
          `INSERT IGNORE INTO planning_reporting_frequencies (frequency_code, frequency_name, description, active) VALUES (?,?,?,1)`,
          [code, name, desc]
        );
      }
    }
  };

  const seedCidpPillars = async () => {
    for (const pillar of CIDP_PILLAR_SEED_ROWS) {
      let pillarId;
      if (isPostgres) {
        const inserted = await pool.query(
          `INSERT INTO planning_cidp_pillars (pillar_code, pillar_name, cidp_period, description, active)
           VALUES ($1, $2, $3, $4, TRUE)
           ON CONFLICT (pillar_code) DO UPDATE
             SET pillar_name = EXCLUDED.pillar_name,
                 cidp_period = EXCLUDED.cidp_period,
                 description = EXCLUDED.description,
                 active = TRUE,
                 voided = FALSE,
                 updated_at = NOW()
           RETURNING id`,
          [pillar.pillarCode, pillar.pillarName, pillar.cidpPeriod, pillar.description]
        );
        pillarId = inserted.rows?.[0]?.id;
      } else {
        await pool.query(
          `INSERT INTO planning_cidp_pillars (pillar_code, pillar_name, cidp_period, description, active)
           VALUES (?, ?, ?, ?, 1)
           ON DUPLICATE KEY UPDATE
             pillar_name = VALUES(pillar_name),
             cidp_period = VALUES(cidp_period),
             description = VALUES(description),
             active = 1,
             voided = 0`,
          [pillar.pillarCode, pillar.pillarName, pillar.cidpPeriod, pillar.description]
        );
        const [rows] = await pool.query(
          `SELECT id FROM planning_cidp_pillars WHERE pillar_code = ? LIMIT 1`,
          [pillar.pillarCode]
        );
        pillarId = rows?.[0]?.id;
      }

      if (!pillarId) continue;
      for (const objective of pillar.objectives || []) {
        const sampleProjects = JSON.stringify(objective.sampleProjects || []);
        if (isPostgres) {
          await pool.query(
            `INSERT INTO planning_cidp_pillar_objectives (
              pillar_id, objective_name, sector_code, sector_name, programme_name,
              programme_period, sdg_code, sdg_name, adp_project_count, sample_projects
            )
            SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9,$10
            WHERE NOT EXISTS (
              SELECT 1 FROM planning_cidp_pillar_objectives
              WHERE pillar_id = $1 AND lower(objective_name) = lower($2) AND COALESCE(voided, false) = false
            )`,
            [
              pillarId,
              objective.objectiveName,
              objective.sectorCode,
              objective.sectorName,
              objective.programmeName,
              objective.programmePeriod,
              objective.sdgCode,
              objective.sdgName,
              objective.adpProjectCount || 0,
              sampleProjects,
            ]
          );
        } else {
          const [existing] = await pool.query(
            `SELECT id FROM planning_cidp_pillar_objectives
             WHERE pillar_id = ? AND lower(objective_name) = lower(?) AND voided = 0 LIMIT 1`,
            [pillarId, objective.objectiveName]
          );
          if (!existing?.length) {
            await pool.query(
              `INSERT INTO planning_cidp_pillar_objectives (
                pillar_id, objective_name, sector_code, sector_name, programme_name,
                programme_period, sdg_code, sdg_name, adp_project_count, sample_projects
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                pillarId,
                objective.objectiveName,
                objective.sectorCode,
                objective.sectorName,
                objective.programmeName,
                objective.programmePeriod,
                objective.sdgCode,
                objective.sdgName,
                objective.adpProjectCount || 0,
                sampleProjects,
              ]
            );
          }
        }
      }
    }
  };

  const seedCimesPlanningCatalogs = async () => {
    const cidpRows = [
      ['JUL/2020 - JUN/2026', '2020-07-01', '2026-06-30'],
    ];
    for (const [periodName, startDate, endDate] of cidpRows) {
      if (isPostgres) {
        await pool.query(
          `INSERT INTO planning_cidp_periods (period_name, start_date, end_date, active)
           VALUES ($1, $2, $3, TRUE)
           ON CONFLICT (period_name) DO UPDATE
             SET start_date = EXCLUDED.start_date, end_date = EXCLUDED.end_date, active = TRUE, voided = FALSE, updated_at = NOW()`,
          [periodName, startDate, endDate]
        );
      } else {
        await pool.query(
          `INSERT INTO planning_cidp_periods (period_name, start_date, end_date, active)
           VALUES (?, ?, ?, 1)
           ON DUPLICATE KEY UPDATE start_date = VALUES(start_date), end_date = VALUES(end_date), active = 1, voided = 0`,
          [periodName, startDate, endDate]
        );
      }
    }

    let cidpPeriodId = null;
    if (isPostgres) {
      const r = await pool.query(`SELECT id FROM planning_cidp_periods WHERE period_name = $1 LIMIT 1`, ['JUL/2020 - JUN/2026']);
      cidpPeriodId = r.rows?.[0]?.id || null;
    } else {
      const [rows] = await pool.query(`SELECT id FROM planning_cidp_periods WHERE period_name = ? LIMIT 1`, ['JUL/2020 - JUN/2026']);
      cidpPeriodId = rows?.[0]?.id || null;
    }

    const adpRows = [
      ['JUL/2020 - JUN/2026', 'JUL/2020 - JUN/2021', '2020-07-01', '2021-06-30'],
    ];
    for (const [cidpPeriod, periodName, startDate, endDate] of adpRows) {
      if (isPostgres) {
        await pool.query(
          `INSERT INTO planning_adp_periods (cidp_period_id, cidp_period, period_name, start_date, end_date, active)
           VALUES ($1, $2, $3, $4, $5, TRUE)
           ON CONFLICT (period_name) DO UPDATE
             SET cidp_period_id = EXCLUDED.cidp_period_id, cidp_period = EXCLUDED.cidp_period,
                 start_date = EXCLUDED.start_date, end_date = EXCLUDED.end_date, active = TRUE, voided = FALSE, updated_at = NOW()`,
          [cidpPeriodId, cidpPeriod, periodName, startDate, endDate]
        );
      } else {
        await pool.query(
          `INSERT INTO planning_adp_periods (cidp_period_id, cidp_period, period_name, start_date, end_date, active)
           VALUES (?, ?, ?, ?, ?, 1)
           ON DUPLICATE KEY UPDATE cidp_period_id = VALUES(cidp_period_id), cidp_period = VALUES(cidp_period),
             start_date = VALUES(start_date), end_date = VALUES(end_date), active = 1, voided = 0`,
          [cidpPeriodId, cidpPeriod, periodName, startDate, endDate]
        );
      }
    }

    const programmeRows = [
      ['JUL/2020 - JUN/2026', 'ECONOMIC DEVELOPMENT', 'INCREASE AGRICULTURAL PRODUCTIVITY AND FOOD SECURITY', 'AGR', 'AGRICULTURE, LIVESTOCK & FISHERIES', 'AGRICULTURAL PRODUCTIVITY IMPROVEMENT PROGRAMME', 'AGRICULTURAL PRODUCTIVITY IMPROVEMENT PROGRAMME', 'SDG 2', 'ZERO HUNGER', 'JUL/2020 - JUN/2026'],
      ['JUL/2020 - JUN/2026', 'SOCIAL DEVELOPMENT', 'IMPROVE ACCESS TO QUALITY HEALTHCARE', 'HLT', 'HEALTH SERVICES', 'PRIMARY HEALTHCARE IMPROVEMENT PROGRAMME', 'PRIMARY HEALTHCARE IMPROVEMENT PROGRAMME', 'SDG 3', 'GOOD HEALTH AND WELL-BEING', 'JUL/2020 - JUN/2026'],
      ['JUL/2020 - JUN/2026', 'SOCIAL DEVELOPMENT', 'IMPROVE ACCESS TO QUALITY HEALTHCARE', 'HLT', 'HEALTH SERVICES', 'MATERNAL & CHILD HEALTH PROGRAMME', 'MATERNAL & CHILD HEALTH PROGRAMME', 'SDG 3', 'GOOD HEALTH AND WELL-BEING', 'JUL/2020 - JUN/2026'],
      ['JUL/2020 - JUN/2026', 'ECONOMIC DEVELOPMENT', 'INCREASE AGRICULTURAL PRODUCTIVITY AND FOOD SECURITY', 'AGR', 'AGRICULTURE, LIVESTOCK & FISHERIES', 'LIVESTOCK DEVELOPMENT PROGRAMME', 'LIVESTOCK DEVELOPMENT PROGRAMME', 'SDG 8', 'DECENT WORK AND ECONOMIC GROWTH', 'JUL/2020 - JUN/2026'],
      ['JUL/2020 - JUN/2026', 'ECONOMIC DEVELOPMENT', 'INCREASE AGRICULTURAL PRODUCTIVITY AND FOOD SECURITY', 'AGR', 'AGRICULTURE, LIVESTOCK & FISHERIES', 'AGRICULTURAL PRODUCTIVITY IMPROVEMENT PROGRAMME', 'AGRICULTURAL PRODUCTIVITY IMPROVEMENT PROGRAMME', 'SDG 1', 'NO POVERTY', 'JUL/2020 - JUN/2026'],
    ];
    for (const row of programmeRows) {
      if (isPostgres) {
        await pool.query(
          `INSERT INTO planning_programmes (
            cidp_period, pillar_name, objective_name, sector_code, sector_name, programme_name,
            programme_description, sdg_code, sdg_name, programme_period, active
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,TRUE)
          ON CONFLICT DO NOTHING`,
          row
        );
      } else {
        await pool.query(
          `INSERT IGNORE INTO planning_programmes (
            cidp_period, pillar_name, objective_name, sector_code, sector_name, programme_name,
            programme_description, sdg_code, sdg_name, programme_period, active
          ) VALUES (?,?,?,?,?,?,?,?,?,?,1)`,
          row
        );
      }
    }
  };

  const getMeasurementTypeId = async (code) => {
    if (isPostgres) {
      const r = await pool.query(
        `SELECT id FROM planning_measurement_types WHERE code = $1 AND voided = false LIMIT 1`,
        [code]
      );
      return r.rows?.[0]?.id || null;
    }
    const [rows] = await pool.query(
      `SELECT id FROM planning_measurement_types WHERE code = ? AND voided = 0 LIMIT 1`,
      [code]
    );
    return rows?.[0]?.id || null;
  };

  const ensureIndicator = async (name, measurementTypeId, description) => {
    if (isPostgres) {
      const existing = await pool.query(
        `SELECT id FROM planning_indicators WHERE lower(name) = lower($1) AND voided = false LIMIT 1`,
        [name]
      );
      if (existing.rows?.[0]?.id) return existing.rows[0].id;
      const inserted = await pool.query(
        `INSERT INTO planning_indicators (name, description, measurement_type_id)
         VALUES ($1, $2, $3)
         RETURNING id`,
        [name, description, measurementTypeId]
      );
      return inserted.rows?.[0]?.id || null;
    }
    const [existing] = await pool.query(
      `SELECT id FROM planning_indicators WHERE lower(name) = lower(?) AND voided = 0 LIMIT 1`,
      [name]
    );
    if (existing?.[0]?.id) return existing[0].id;
    const [inserted] = await pool.query(
      `INSERT INTO planning_indicators (name, description, measurement_type_id) VALUES (?, ?, ?)`,
      [name, description, measurementTypeId]
    );
    return inserted.insertId || null;
  };

  const ensureProjectActivity = async (row, indicatorId) => {
    if (isPostgres) {
      const inserted = await pool.query(
        `INSERT INTO planning_project_activities (activity_code, activity_name, indicator_id, description)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (activity_code) DO UPDATE
           SET activity_name = EXCLUDED.activity_name,
               indicator_id = EXCLUDED.indicator_id,
               description = EXCLUDED.description,
               voided = false,
               updated_at = NOW()
         RETURNING id`,
        [row.activityCode, row.activityName, indicatorId, row.description]
      );
      return inserted.rows?.[0]?.id || null;
    }
    await pool.query(
      `INSERT INTO planning_project_activities (activity_code, activity_name, indicator_id, description)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         activity_name = VALUES(activity_name),
         indicator_id = VALUES(indicator_id),
         description = VALUES(description),
         voided = 0`,
      [row.activityCode, row.activityName, indicatorId, row.description]
    );
    const [rows] = await pool.query(
      `SELECT id FROM planning_project_activities WHERE activity_code = ? LIMIT 1`,
      [row.activityCode]
    );
    return rows?.[0]?.id || null;
  };

  const findSampleProject = async (row, index) => {
    const terms = [...(row.matchTerms || []), row.projectName]
      .map((term) => String(term || '').trim())
      .filter(Boolean);
    for (const term of terms) {
      const like = `%${term}%`;
      if (isPostgres) {
        const r = await pool.query(
          `SELECT project_id AS id
           FROM projects
           WHERE voided = false
             AND (
               name ILIKE $1 OR COALESCE(description, '') ILIKE $1 OR COALESCE(sector, '') ILIKE $1
               OR COALESCE(ministry, '') ILIKE $1 OR COALESCE(state_department, '') ILIKE $1
               OR COALESCE(implementing_agency, '') ILIKE $1
             )
           ORDER BY project_id
           LIMIT 1`,
          [like]
        );
        if (r.rows?.[0]?.id) return r.rows[0].id;
      } else {
        const [rows] = await pool.query(
          `SELECT id
           FROM projects
           WHERE (voided IS NULL OR voided = 0)
             AND (
               projectName LIKE ? OR COALESCE(projectDescription, '') LIKE ? OR COALESCE(directorate, '') LIKE ?
             )
           ORDER BY id
           LIMIT 1`,
          [like, like, like]
        );
        if (rows?.[0]?.id) return rows[0].id;
      }
    }
    if (isPostgres) {
      const r = await pool.query(
        `SELECT project_id AS id
         FROM projects
         WHERE voided = false
         ORDER BY project_id
         OFFSET $1 LIMIT 1`,
        [index]
      );
      return r.rows?.[0]?.id || null;
    }
    const [rows] = await pool.query(
      `SELECT id FROM projects WHERE (voided IS NULL OR voided = 0) ORDER BY id LIMIT 1 OFFSET ?`,
      [index]
    );
    return rows?.[0]?.id || null;
  };

  const seedCimesProjectActivities = async () => {
    const countTypeId = await getMeasurementTypeId('count');
    if (!countTypeId) return;

    for (const [index, row] of CIMES_PROJECT_ACTIVITY_SEED_ROWS.entries()) {
      const indicatorId = await ensureIndicator(
        `${row.activityName} output`,
        countTypeId,
        `CIMES sample indicator for ${row.activityName}.`
      );
      if (!indicatorId) continue;

      const activityId = await ensureProjectActivity(row, indicatorId);
      const projectId = await findSampleProject(row, index);
      if (!activityId || !projectId) continue;

      const notes = `Seeded from CIMES Project Activities sample (${row.projectCode} - ${row.projectName}).`;
      if (isPostgres) {
        await pool.query(
          `INSERT INTO project_planning_activity_links (
            project_id, planning_activity_id, target_value, baseline_value, notes,
            planned_start_date, planned_end_date, activity_status, completed_at,
            cimes_project_code, cimes_project_name, seed_source
          )
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'cimes_project_activities')
          ON CONFLICT (project_id, planning_activity_id) DO UPDATE
            SET target_value = EXCLUDED.target_value,
                baseline_value = EXCLUDED.baseline_value,
                notes = EXCLUDED.notes,
                planned_start_date = EXCLUDED.planned_start_date,
                planned_end_date = EXCLUDED.planned_end_date,
                activity_status = EXCLUDED.activity_status,
                completed_at = EXCLUDED.completed_at,
                cimes_project_code = EXCLUDED.cimes_project_code,
                cimes_project_name = EXCLUDED.cimes_project_name,
                seed_source = EXCLUDED.seed_source,
                voided = false,
                updated_at = NOW()`,
          [
            projectId,
            activityId,
            row.targetValue,
            row.baselineValue,
            notes,
            row.startDate,
            row.endDate,
            row.status,
            row.completedAt,
            row.projectCode,
            row.projectName,
          ]
        );
      } else {
        await pool.query(
          `INSERT INTO project_planning_activity_links (
            project_id, planning_activity_id, target_value, baseline_value, notes,
            planned_start_date, planned_end_date, activity_status, completed_at,
            cimes_project_code, cimes_project_name, seed_source
          )
          VALUES (?,?,?,?,?,?,?,?,?,?,?,'cimes_project_activities')
          ON DUPLICATE KEY UPDATE
            target_value = VALUES(target_value),
            baseline_value = VALUES(baseline_value),
            notes = VALUES(notes),
            planned_start_date = VALUES(planned_start_date),
            planned_end_date = VALUES(planned_end_date),
            activity_status = VALUES(activity_status),
            completed_at = VALUES(completed_at),
            cimes_project_code = VALUES(cimes_project_code),
            cimes_project_name = VALUES(cimes_project_name),
            seed_source = VALUES(seed_source),
            voided = 0`,
          [
            projectId,
            activityId,
            row.targetValue,
            row.baselineValue,
            notes,
            row.startDate,
            row.endDate,
            row.status,
            row.completedAt,
            row.projectCode,
            row.projectName,
          ]
        );
      }
    }
  };

  await seedDefaults();
  await seedReportingFrequencies();
  await seedCidpPillars();
  await seedCimesPlanningCatalogs();
  await seedCimesProjectActivities();
  tablesEnsured = true;
}

router.use(async (req, res, next) => {
  try {
    await ensureTables();
    next();
  } catch (e) {
    console.error('planning indicators ensureTables:', e);
    res.status(500).json({ message: 'Planning indicators storage init failed', error: e.message });
  }
});

function parseSampleProjects(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return String(value)
      .split('\n')
      .map((item) => item.trim())
      .filter(Boolean);
  }
}

function normalizePillarObjectivePayload(row) {
  return {
    id: row.id || null,
    objectiveName: String(row.objectiveName || row.objective_name || '').trim(),
    sectorCode: String(row.sectorCode || row.sector_code || '').trim(),
    sectorName: String(row.sectorName || row.sector_name || '').trim(),
    programmeName: String(row.programmeName || row.programme_name || '').trim(),
    programmePeriod: String(row.programmePeriod || row.programme_period || '').trim(),
    sdgCode: String(row.sdgCode || row.sdg_code || '').trim(),
    sdgName: String(row.sdgName || row.sdg_name || '').trim(),
    adpProjectCount: Number(row.adpProjectCount ?? row.adp_project_count ?? 0) || 0,
    sampleProjects: Array.isArray(row.sampleProjects)
      ? row.sampleProjects.map((item) => String(item).trim()).filter(Boolean)
      : parseSampleProjects(row.sampleProjects || row.sample_projects),
  };
}

async function getCidpPillarsWithObjectives() {
  let pillars;
  let objectives;
  if (isPostgres) {
    pillars = rowsFromResult(
      await pool.query(
        `SELECT id, pillar_code AS "pillarCode", pillar_name AS "pillarName", cidp_period AS "cidpPeriod",
                description, active, voided, created_at AS "createdAt", updated_at AS "updatedAt"
         FROM planning_cidp_pillars
         WHERE voided = false
         ORDER BY pillar_name ASC`
      )
    );
    objectives = rowsFromResult(
      await pool.query(
        `SELECT id, pillar_id AS "pillarId", objective_name AS "objectiveName",
                sector_code AS "sectorCode", sector_name AS "sectorName",
                programme_name AS "programmeName", programme_period AS "programmePeriod",
                sdg_code AS "sdgCode", sdg_name AS "sdgName",
                adp_project_count AS "adpProjectCount", sample_projects AS "sampleProjects",
                voided, created_at AS "createdAt", updated_at AS "updatedAt"
         FROM planning_cidp_pillar_objectives
         WHERE voided = false
         ORDER BY objective_name ASC`
      )
    );
  } else {
    const [pillarRows] = await pool.query(
      `SELECT id, pillar_code AS pillarCode, pillar_name AS pillarName, cidp_period AS cidpPeriod,
              description, active, voided, created_at AS createdAt, updated_at AS updatedAt
       FROM planning_cidp_pillars
       WHERE voided = 0
       ORDER BY pillar_name ASC`
    );
    const [objectiveRows] = await pool.query(
      `SELECT id, pillar_id AS pillarId, objective_name AS objectiveName,
              sector_code AS sectorCode, sector_name AS sectorName,
              programme_name AS programmeName, programme_period AS programmePeriod,
              sdg_code AS sdgCode, sdg_name AS sdgName,
              adp_project_count AS adpProjectCount, sample_projects AS sampleProjects,
              voided, created_at AS createdAt, updated_at AS updatedAt
       FROM planning_cidp_pillar_objectives
       WHERE voided = 0
       ORDER BY objective_name ASC`
    );
    pillars = pillarRows || [];
    objectives = objectiveRows || [];
  }

  const byPillar = new Map();
  for (const objective of objectives || []) {
    const key = Number(objective.pillarId);
    if (!byPillar.has(key)) byPillar.set(key, []);
    byPillar.get(key).push({
      ...objective,
      sampleProjects: parseSampleProjects(objective.sampleProjects),
    });
  }
  return (pillars || []).map((pillar) => ({
    ...pillar,
    active: !!pillar.active,
    objectives: byPillar.get(Number(pillar.id)) || [],
  }));
}

async function syncPillarObjectives(pillarId, objectives) {
  if (!Array.isArray(objectives)) return;
  const normalized = objectives.map(normalizePillarObjectivePayload).filter((row) => row.objectiveName);
  const keptIds = normalized.map((row) => Number(row.id)).filter(Boolean);

  if (isPostgres) {
    await pool.query(
      `UPDATE planning_cidp_pillar_objectives
       SET voided = true, updated_at = NOW()
       WHERE pillar_id = $1
         AND voided = false
         AND (${keptIds.length ? 'id <> ALL($2::bigint[])' : 'true'})`,
      keptIds.length ? [pillarId, keptIds] : [pillarId]
    );
    for (const row of normalized) {
      const params = [
        pillarId,
        row.objectiveName,
        row.sectorCode || null,
        row.sectorName || null,
        row.programmeName || null,
        row.programmePeriod || null,
        row.sdgCode || null,
        row.sdgName || null,
        row.adpProjectCount,
        JSON.stringify(row.sampleProjects || []),
      ];
      if (row.id) {
        await pool.query(
          `UPDATE planning_cidp_pillar_objectives
           SET objective_name = $2, sector_code = $3, sector_name = $4, programme_name = $5,
               programme_period = $6, sdg_code = $7, sdg_name = $8, adp_project_count = $9,
               sample_projects = $10, voided = false, updated_at = NOW()
           WHERE id = $11 AND pillar_id = $1`,
          [...params, row.id]
        );
      } else {
        await pool.query(
          `INSERT INTO planning_cidp_pillar_objectives (
            pillar_id, objective_name, sector_code, sector_name, programme_name,
            programme_period, sdg_code, sdg_name, adp_project_count, sample_projects
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          params
        );
      }
    }
  } else {
    if (keptIds.length) {
      await pool.query(
        `UPDATE planning_cidp_pillar_objectives
         SET voided = 1, updated_at = NOW()
         WHERE pillar_id = ? AND voided = 0 AND id NOT IN (${keptIds.map(() => '?').join(',')})`,
        [pillarId, ...keptIds]
      );
    } else {
      await pool.query(
        `UPDATE planning_cidp_pillar_objectives SET voided = 1, updated_at = NOW() WHERE pillar_id = ? AND voided = 0`,
        [pillarId]
      );
    }
    for (const row of normalized) {
      const params = [
        row.objectiveName,
        row.sectorCode || null,
        row.sectorName || null,
        row.programmeName || null,
        row.programmePeriod || null,
        row.sdgCode || null,
        row.sdgName || null,
        row.adpProjectCount,
        JSON.stringify(row.sampleProjects || []),
      ];
      if (row.id) {
        await pool.query(
          `UPDATE planning_cidp_pillar_objectives
           SET objective_name = ?, sector_code = ?, sector_name = ?, programme_name = ?,
               programme_period = ?, sdg_code = ?, sdg_name = ?, adp_project_count = ?,
               sample_projects = ?, voided = 0, updated_at = NOW()
           WHERE id = ? AND pillar_id = ?`,
          [...params, row.id, pillarId]
        );
      } else {
        await pool.query(
          `INSERT INTO planning_cidp_pillar_objectives (
            objective_name, sector_code, sector_name, programme_name, programme_period,
            sdg_code, sdg_name, adp_project_count, sample_projects, pillar_id
          ) VALUES (?,?,?,?,?,?,?,?,?,?)`,
          [...params, pillarId]
        );
      }
    }
  }
}

router.get('/cidp-pillars', canRead, async (req, res) => {
  try {
    res.json(await getCidpPillarsWithObjectives());
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

router.post('/cidp-pillars', canWrite, async (req, res) => {
  const pillarCode = String(req.body.pillarCode || req.body.pillar_code || '').trim().toUpperCase().replace(/\s+/g, '_');
  const pillarName = String(req.body.pillarName || req.body.pillar_name || '').trim();
  const cidpPeriod = req.body.cidpPeriod != null ? String(req.body.cidpPeriod).trim() : null;
  const description = req.body.description != null ? String(req.body.description).trim() : null;
  const active = req.body.active === undefined ? true : Boolean(req.body.active);
  if (!pillarCode || !pillarName) return res.status(400).json({ message: 'pillarCode and pillarName are required.' });
  try {
    let pillarId;
    if (isPostgres) {
      const r = await pool.query(
        `INSERT INTO planning_cidp_pillars (pillar_code, pillar_name, cidp_period, description, active)
         VALUES ($1,$2,$3,$4,$5)
         RETURNING id`,
        [pillarCode, pillarName, cidpPeriod, description, active]
      );
      pillarId = r.rows?.[0]?.id;
    } else {
      const [ins] = await pool.query(
        `INSERT INTO planning_cidp_pillars (pillar_code, pillar_name, cidp_period, description, active)
         VALUES (?,?,?,?,?)`,
        [pillarCode, pillarName, cidpPeriod, description, active ? 1 : 0]
      );
      pillarId = ins.insertId;
    }
    await syncPillarObjectives(pillarId, req.body.objectives);
    const rows = await getCidpPillarsWithObjectives();
    res.status(201).json(rows.find((row) => Number(row.id) === Number(pillarId)));
  } catch (e) {
    if (String(e.message).includes('unique') || String(e.code) === '23505' || String(e.code) === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'A CIDP pillar with this code already exists.' });
    }
    res.status(500).json({ message: e.message });
  }
});

router.put('/cidp-pillars/:id', canWrite, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid id.' });
  const pillarName = String(req.body.pillarName || req.body.pillar_name || '').trim();
  const cidpPeriod = req.body.cidpPeriod != null ? String(req.body.cidpPeriod).trim() : null;
  const description = req.body.description != null ? String(req.body.description).trim() : null;
  const active = req.body.active === undefined ? true : Boolean(req.body.active);
  if (!pillarName) return res.status(400).json({ message: 'pillarName is required.' });
  try {
    if (isPostgres) {
      const r = await pool.query(
        `UPDATE planning_cidp_pillars
         SET pillar_name = $1, cidp_period = $2, description = $3, active = $4, updated_at = NOW()
         WHERE id = $5 AND voided = false`,
        [pillarName, cidpPeriod, description, active, id]
      );
      if (!r.rowCount) return res.status(404).json({ message: 'Not found.' });
    } else {
      const [u] = await pool.query(
        `UPDATE planning_cidp_pillars
         SET pillar_name = ?, cidp_period = ?, description = ?, active = ?, updated_at = NOW()
         WHERE id = ? AND voided = 0`,
        [pillarName, cidpPeriod, description, active ? 1 : 0, id]
      );
      if (!u.affectedRows) return res.status(404).json({ message: 'Not found.' });
    }
    await syncPillarObjectives(id, req.body.objectives);
    const rows = await getCidpPillarsWithObjectives();
    res.json(rows.find((row) => Number(row.id) === id));
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

router.delete('/cidp-pillars/:id', canWrite, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid id.' });
  try {
    if (isPostgres) {
      const r = await pool.query(`UPDATE planning_cidp_pillars SET voided = true, updated_at = NOW() WHERE id = $1`, [id]);
      if (!r.rowCount) return res.status(404).json({ message: 'Not found.' });
      await pool.query(`UPDATE planning_cidp_pillar_objectives SET voided = true, updated_at = NOW() WHERE pillar_id = $1`, [id]);
    } else {
      const [u] = await pool.query(`UPDATE planning_cidp_pillars SET voided = 1, updated_at = NOW() WHERE id = ?`, [id]);
      if (!u.affectedRows) return res.status(404).json({ message: 'Not found.' });
      await pool.query(`UPDATE planning_cidp_pillar_objectives SET voided = 1, updated_at = NOW() WHERE pillar_id = ?`, [id]);
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

function normalizeDateOnly(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function normalizePeriodPayload(body = {}) {
  return {
    periodName: String(body.periodName || body.period_name || body.name || '').trim(),
    cidpPeriodId: body.cidpPeriodId || body.cidp_period_id || null,
    cidpPeriod: body.cidpPeriod != null ? String(body.cidpPeriod).trim() : null,
    startDate: normalizeDateOnly(body.startDate || body.start_date),
    endDate: normalizeDateOnly(body.endDate || body.end_date),
    active: body.active === undefined ? true : Boolean(body.active),
  };
}

function normalizeProgrammePayload(body = {}) {
  return {
    cidpPeriod: body.cidpPeriod != null ? String(body.cidpPeriod).trim() : null,
    pillarName: body.pillarName != null ? String(body.pillarName).trim() : null,
    objectiveName: body.objectiveName != null ? String(body.objectiveName).trim() : null,
    sectorCode: body.sectorCode != null ? String(body.sectorCode).trim() : null,
    sectorName: body.sectorName != null ? String(body.sectorName).trim() : null,
    programmeName: String(body.programmeName || '').trim(),
    programmeDescription: body.programmeDescription != null ? String(body.programmeDescription).trim() : null,
    sdgCode: body.sdgCode != null ? String(body.sdgCode).trim() : null,
    sdgName: body.sdgName != null ? String(body.sdgName).trim() : null,
    programmePeriod: body.programmePeriod != null ? String(body.programmePeriod).trim() : null,
    active: body.active === undefined ? true : Boolean(body.active),
  };
}

router.get('/cidp-periods', canRead, async (req, res) => {
  try {
    const result = isPostgres
      ? await pool.query(`SELECT id, period_name AS "periodName", start_date AS "startDate", end_date AS "endDate", active, created_at AS "createdAt", updated_at AS "updatedAt" FROM planning_cidp_periods WHERE voided = false ORDER BY start_date DESC NULLS LAST, period_name`)
      : await pool.query(`SELECT id, period_name AS periodName, start_date AS startDate, end_date AS endDate, active, created_at AS createdAt, updated_at AS updatedAt FROM planning_cidp_periods WHERE voided = 0 ORDER BY start_date DESC, period_name`);
    res.json(rowsFromResult(result));
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

router.post('/cidp-periods', canWrite, async (req, res) => {
  const row = normalizePeriodPayload(req.body);
  if (!row.periodName) return res.status(400).json({ message: 'CIDP period is required.' });
  try {
    const result = isPostgres
      ? await pool.query(`INSERT INTO planning_cidp_periods (period_name, start_date, end_date, active) VALUES ($1,$2,$3,$4) RETURNING id`, [row.periodName, row.startDate, row.endDate, row.active])
      : await pool.query(`INSERT INTO planning_cidp_periods (period_name, start_date, end_date, active) VALUES (?,?,?,?)`, [row.periodName, row.startDate, row.endDate, row.active ? 1 : 0]);
    res.status(201).json({ id: isPostgres ? firstRow(result)?.id : result?.[0]?.insertId, ...row });
  } catch (e) {
    if (String(e.code) === '23505' || String(e.code) === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'CIDP period already exists.' });
    res.status(500).json({ message: e.message });
  }
});

router.put('/cidp-periods/:id', canWrite, async (req, res) => {
  const id = Number(req.params.id);
  const row = normalizePeriodPayload(req.body);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid id.' });
  if (!row.periodName) return res.status(400).json({ message: 'CIDP period is required.' });
  try {
    const result = isPostgres
      ? await pool.query(`UPDATE planning_cidp_periods SET period_name = $1, start_date = $2, end_date = $3, active = $4, updated_at = NOW() WHERE id = $5 AND voided = false`, [row.periodName, row.startDate, row.endDate, row.active, id])
      : await pool.query(`UPDATE planning_cidp_periods SET period_name = ?, start_date = ?, end_date = ?, active = ?, updated_at = NOW() WHERE id = ? AND voided = 0`, [row.periodName, row.startDate, row.endDate, row.active ? 1 : 0, id]);
    const affected = isPostgres ? result.rowCount : result?.[0]?.affectedRows;
    if (!affected) return res.status(404).json({ message: 'CIDP period not found.' });
    res.json({ id, ...row });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

router.delete('/cidp-periods/:id', canWrite, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid id.' });
  try {
    const result = isPostgres
      ? await pool.query(`UPDATE planning_cidp_periods SET voided = true, updated_at = NOW() WHERE id = $1 AND voided = false`, [id])
      : await pool.query(`UPDATE planning_cidp_periods SET voided = 1, updated_at = NOW() WHERE id = ? AND voided = 0`, [id]);
    const affected = isPostgres ? result.rowCount : result?.[0]?.affectedRows;
    if (!affected) return res.status(404).json({ message: 'CIDP period not found.' });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

router.get('/adp-periods', canRead, async (req, res) => {
  try {
    const result = isPostgres
      ? await pool.query(`SELECT id, cidp_period_id AS "cidpPeriodId", cidp_period AS "cidpPeriod", period_name AS "periodName", start_date AS "startDate", end_date AS "endDate", active, created_at AS "createdAt", updated_at AS "updatedAt" FROM planning_adp_periods WHERE voided = false ORDER BY start_date DESC NULLS LAST, period_name`)
      : await pool.query(`SELECT id, cidp_period_id AS cidpPeriodId, cidp_period AS cidpPeriod, period_name AS periodName, start_date AS startDate, end_date AS endDate, active, created_at AS createdAt, updated_at AS updatedAt FROM planning_adp_periods WHERE voided = 0 ORDER BY start_date DESC, period_name`);
    res.json(rowsFromResult(result));
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

router.post('/adp-periods', canWrite, async (req, res) => {
  const row = normalizePeriodPayload(req.body);
  if (!row.periodName) return res.status(400).json({ message: 'ADP period is required.' });
  try {
    const result = isPostgres
      ? await pool.query(`INSERT INTO planning_adp_periods (cidp_period_id, cidp_period, period_name, start_date, end_date, active) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`, [row.cidpPeriodId, row.cidpPeriod, row.periodName, row.startDate, row.endDate, row.active])
      : await pool.query(`INSERT INTO planning_adp_periods (cidp_period_id, cidp_period, period_name, start_date, end_date, active) VALUES (?,?,?,?,?,?)`, [row.cidpPeriodId, row.cidpPeriod, row.periodName, row.startDate, row.endDate, row.active ? 1 : 0]);
    res.status(201).json({ id: isPostgres ? firstRow(result)?.id : result?.[0]?.insertId, ...row });
  } catch (e) {
    if (String(e.code) === '23505' || String(e.code) === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'ADP period already exists.' });
    res.status(500).json({ message: e.message });
  }
});

router.put('/adp-periods/:id', canWrite, async (req, res) => {
  const id = Number(req.params.id);
  const row = normalizePeriodPayload(req.body);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid id.' });
  if (!row.periodName) return res.status(400).json({ message: 'ADP period is required.' });
  try {
    const result = isPostgres
      ? await pool.query(`UPDATE planning_adp_periods SET cidp_period_id = $1, cidp_period = $2, period_name = $3, start_date = $4, end_date = $5, active = $6, updated_at = NOW() WHERE id = $7 AND voided = false`, [row.cidpPeriodId, row.cidpPeriod, row.periodName, row.startDate, row.endDate, row.active, id])
      : await pool.query(`UPDATE planning_adp_periods SET cidp_period_id = ?, cidp_period = ?, period_name = ?, start_date = ?, end_date = ?, active = ?, updated_at = NOW() WHERE id = ? AND voided = 0`, [row.cidpPeriodId, row.cidpPeriod, row.periodName, row.startDate, row.endDate, row.active ? 1 : 0, id]);
    const affected = isPostgres ? result.rowCount : result?.[0]?.affectedRows;
    if (!affected) return res.status(404).json({ message: 'ADP period not found.' });
    res.json({ id, ...row });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

router.delete('/adp-periods/:id', canWrite, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid id.' });
  try {
    const result = isPostgres
      ? await pool.query(`UPDATE planning_adp_periods SET voided = true, updated_at = NOW() WHERE id = $1 AND voided = false`, [id])
      : await pool.query(`UPDATE planning_adp_periods SET voided = 1, updated_at = NOW() WHERE id = ? AND voided = 0`, [id]);
    const affected = isPostgres ? result.rowCount : result?.[0]?.affectedRows;
    if (!affected) return res.status(404).json({ message: 'ADP period not found.' });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

router.get('/programmes', canRead, async (req, res) => {
  try {
    const result = isPostgres
      ? await pool.query(`SELECT id, cidp_period AS "cidpPeriod", pillar_name AS "pillarName", objective_name AS "objectiveName", sector_code AS "sectorCode", sector_name AS "sectorName", programme_name AS "programmeName", programme_description AS "programmeDescription", sdg_code AS "sdgCode", sdg_name AS "sdgName", programme_period AS "programmePeriod", active, created_at AS "createdAt", updated_at AS "updatedAt" FROM planning_programmes WHERE voided = false ORDER BY programme_name`)
      : await pool.query(`SELECT id, cidp_period AS cidpPeriod, pillar_name AS pillarName, objective_name AS objectiveName, sector_code AS sectorCode, sector_name AS sectorName, programme_name AS programmeName, programme_description AS programmeDescription, sdg_code AS sdgCode, sdg_name AS sdgName, programme_period AS programmePeriod, active, created_at AS createdAt, updated_at AS updatedAt FROM planning_programmes WHERE voided = 0 ORDER BY programme_name`);
    res.json(rowsFromResult(result));
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

router.post('/programmes', canWrite, async (req, res) => {
  const row = normalizeProgrammePayload(req.body);
  if (!row.programmeName) return res.status(400).json({ message: 'Programme name is required.' });
  const params = [row.cidpPeriod, row.pillarName, row.objectiveName, row.sectorCode, row.sectorName, row.programmeName, row.programmeDescription, row.sdgCode, row.sdgName, row.programmePeriod, row.active];
  try {
    const result = isPostgres
      ? await pool.query(`INSERT INTO planning_programmes (cidp_period, pillar_name, objective_name, sector_code, sector_name, programme_name, programme_description, sdg_code, sdg_name, programme_period, active) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`, params)
      : await pool.query(`INSERT INTO planning_programmes (cidp_period, pillar_name, objective_name, sector_code, sector_name, programme_name, programme_description, sdg_code, sdg_name, programme_period, active) VALUES (?,?,?,?,?,?,?,?,?,?,?)`, params.map((v, i) => (i === 10 ? (v ? 1 : 0) : v)));
    res.status(201).json({ id: isPostgres ? firstRow(result)?.id : result?.[0]?.insertId, ...row });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

router.put('/programmes/:id', canWrite, async (req, res) => {
  const id = Number(req.params.id);
  const row = normalizeProgrammePayload(req.body);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid id.' });
  if (!row.programmeName) return res.status(400).json({ message: 'Programme name is required.' });
  const params = [row.cidpPeriod, row.pillarName, row.objectiveName, row.sectorCode, row.sectorName, row.programmeName, row.programmeDescription, row.sdgCode, row.sdgName, row.programmePeriod, row.active];
  try {
    const result = isPostgres
      ? await pool.query(`UPDATE planning_programmes SET cidp_period = $1, pillar_name = $2, objective_name = $3, sector_code = $4, sector_name = $5, programme_name = $6, programme_description = $7, sdg_code = $8, sdg_name = $9, programme_period = $10, active = $11, updated_at = NOW() WHERE id = $12 AND voided = false`, [...params, id])
      : await pool.query(`UPDATE planning_programmes SET cidp_period = ?, pillar_name = ?, objective_name = ?, sector_code = ?, sector_name = ?, programme_name = ?, programme_description = ?, sdg_code = ?, sdg_name = ?, programme_period = ?, active = ?, updated_at = NOW() WHERE id = ? AND voided = 0`, [...params.map((v, i) => (i === 10 ? (v ? 1 : 0) : v)), id]);
    const affected = isPostgres ? result.rowCount : result?.[0]?.affectedRows;
    if (!affected) return res.status(404).json({ message: 'Programme not found.' });
    res.json({ id, ...row });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

router.delete('/programmes/:id', canWrite, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid id.' });
  try {
    const result = isPostgres
      ? await pool.query(`UPDATE planning_programmes SET voided = true, updated_at = NOW() WHERE id = $1 AND voided = false`, [id])
      : await pool.query(`UPDATE planning_programmes SET voided = 1, updated_at = NOW() WHERE id = ? AND voided = 0`, [id]);
    const affected = isPostgres ? result.rowCount : result?.[0]?.affectedRows;
    if (!affected) return res.status(404).json({ message: 'Programme not found.' });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

router.get('/sectors', canRead, async (req, res) => {
  try {
    let sectorScopeJoin = '';
    const sectorParams = [];
    if (isPostgres) {
      const sectorScopeFilters = [];
      await addProjectScopeWhere(req, sectorScopeFilters, sectorParams, 'p');
      sectorScopeJoin = sectorScopeFilters.length ? ` AND ${sectorScopeFilters.join(' AND ')}` : '';
    }
    const result = isPostgres
      ? await pool.query(
          `SELECT s.id, COALESCE(s.alias, '') AS "sectorCode", s.name AS "sectorName", COALESCE(s.description, '') AS "sectorDescription",
             COUNT(p.*) FILTER (WHERE lower(COALESCE(p.status, '')) LIKE '%planning%')::int AS "planningCount",
             COUNT(p.*) FILTER (WHERE lower(COALESCE(p.status, '')) LIKE '%ongoing%' OR lower(COALESCE(p.status, '')) LIKE '%in progress%')::int AS "ongoingCount",
             COUNT(p.*) FILTER (WHERE lower(COALESCE(p.status, '')) LIKE '%stalled%')::int AS "stalledCount",
             COUNT(p.*) FILTER (WHERE lower(COALESCE(p.status, '')) LIKE '%terminated%' OR lower(COALESCE(p.status, '')) LIKE '%cancelled%')::int AS "terminatedCount",
             COUNT(p.*) FILTER (WHERE lower(COALESCE(p.status, '')) LIKE '%closed%' OR lower(COALESCE(p.status, '')) LIKE '%complete%')::int AS "closedCount",
             COUNT(p.*)::int AS "projectCount", TRUE AS active
           FROM sectors s
           LEFT JOIN projects p ON COALESCE(p.voided, false) = false AND (lower(COALESCE(p.sector, '')) = lower(s.name) OR lower(COALESCE(p.sector, '')) = lower(COALESCE(s.alias, '')))${sectorScopeJoin}
           WHERE COALESCE(s.voided, false) = false
           GROUP BY s.id, s.alias, s.name, s.description
           ORDER BY s.name`,
          sectorParams
        )
      : await pool.query(
          `SELECT s.id, COALESCE(s.alias, '') AS sectorCode, s.name AS sectorName, COALESCE(s.description, '') AS sectorDescription,
             SUM(CASE WHEN lower(COALESCE(p.status, '')) LIKE '%planning%' THEN 1 ELSE 0 END) AS planningCount,
             SUM(CASE WHEN lower(COALESCE(p.status, '')) LIKE '%ongoing%' OR lower(COALESCE(p.status, '')) LIKE '%in progress%' THEN 1 ELSE 0 END) AS ongoingCount,
             SUM(CASE WHEN lower(COALESCE(p.status, '')) LIKE '%stalled%' THEN 1 ELSE 0 END) AS stalledCount,
             SUM(CASE WHEN lower(COALESCE(p.status, '')) LIKE '%terminated%' OR lower(COALESCE(p.status, '')) LIKE '%cancelled%' THEN 1 ELSE 0 END) AS terminatedCount,
             SUM(CASE WHEN lower(COALESCE(p.status, '')) LIKE '%closed%' OR lower(COALESCE(p.status, '')) LIKE '%complete%' THEN 1 ELSE 0 END) AS closedCount,
             COUNT(p.project_id) AS projectCount, 1 AS active
           FROM sectors s
           LEFT JOIN projects p ON COALESCE(p.voided, 0) = 0 AND (lower(COALESCE(p.sector, '')) = lower(s.name) OR lower(COALESCE(p.sector, '')) = lower(COALESCE(s.alias, '')))
           WHERE COALESCE(s.voided, 0) = 0
           GROUP BY s.id, s.alias, s.name, s.description
           ORDER BY s.name`
        );
    res.json(rowsFromResult(result));
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

router.get('/budget-allocations', canRead, async (req, res) => {
  const { startDate, endDate, search } = req.query;
  const term = String(search || '').trim();

  try {
    if (isPostgres) {
      const filters = [`COALESCE(p.voided, false) = false`];
      const params = [];
      let i = 1;

      if (startDate) {
        filters.push(`COALESCE((p.is_public->>'approved_at')::timestamp, p.updated_at, p.created_at)::date >= $${i++}`);
        params.push(startDate);
      }
      if (endDate) {
        filters.push(`COALESCE((p.is_public->>'approved_at')::timestamp, p.updated_at, p.created_at)::date <= $${i++}`);
        params.push(endDate);
      }
      if (term) {
        filters.push(`(
          p.name ILIKE $${i} OR
          COALESCE(p.data_sources->>'project_ref_num', '') ILIKE $${i} OR
          COALESCE(p.data_sources->>'vote_code', '') ILIKE $${i} OR
          COALESCE(p.budget->>'source', '') ILIKE $${i}
        )`);
        params.push(`%${term}%`);
        i += 1;
      }
      i = await addProjectScopeWhere(req, filters, params, 'p', i);

      const result = await pool.query(
        `SELECT
           p.project_id AS id,
           COALESCE(NULLIF(p.data_sources->>'project_ref_num', ''), CONCAT('ADP-', LPAD(p.project_id::text, 3, '0'))) AS "projectCode",
           p.name AS "projectName",
           COALESCE(NULLIF(p.data_sources->>'vote_code', ''), NULLIF(p.data_sources->>'budget_vote_code', ''), '') AS "voteCode",
           COALESCE(NULLIF(p.budget->>'source', ''), NULLIF(p.data_sources->>'sponsor', ''), 'COUNTY GOVERNMENT') AS sponsor,
           COALESCE(NULLIF(p.data_sources->>'budget_remarks', ''), NULLIF(p.notes->>'objective', ''), CONCAT('Budget allocation for ', p.name)) AS remarks,
           CASE
             WHEN COALESCE(p.is_public->>'approved', 'false') = 'true' THEN 'APPROVED'
             WHEN NULLIF(p.budget->>'allocated_amount_kes', '') IS NOT NULL THEN 'APPROVED'
             ELSE 'DRAFT'
           END AS status,
           COALESCE(NULLIF(p.data_sources->>'budget_approved_by', ''), NULLIF(p.data_sources->>'approved_by_name', ''), '') AS "approvedBy",
           (p.is_public->>'approved_at')::timestamp AS "approvedAt",
           CASE
             WHEN (p.budget->>'allocated_amount_kes') ~ '^[0-9]+(\\.[0-9]+){0,1}$'
             THEN (p.budget->>'allocated_amount_kes')::numeric
             ELSE 0
           END AS "allocatedAmount"
         FROM projects p
         WHERE ${filters.join(' AND ')}
         ORDER BY "approvedAt" DESC NULLS LAST, p.updated_at DESC NULLS LAST, p.project_id DESC`,
        params
      );
      return res.json(rowsFromResult(result));
    }

    const filters = [`COALESCE(p.voided, 0) = 0`];
    const params = [];
    if (startDate) {
      filters.push(`DATE(COALESCE(p.approved_at, p.updatedAt, p.createdAt)) >= ?`);
      params.push(startDate);
    }
    if (endDate) {
      filters.push(`DATE(COALESCE(p.approved_at, p.updatedAt, p.createdAt)) <= ?`);
      params.push(endDate);
    }
    if (term) {
      filters.push(`(p.projectName LIKE ? OR p.project_ref_num LIKE ? OR p.budgetSource LIKE ?)`);
      params.push(`%${term}%`, `%${term}%`, `%${term}%`);
    }

    const result = await pool.query(
      `SELECT
         p.id,
         COALESCE(NULLIF(p.project_ref_num, ''), CONCAT('ADP-', LPAD(p.id, 3, '0'))) AS projectCode,
         p.projectName,
         COALESCE(p.voteCode, '') AS voteCode,
         COALESCE(NULLIF(p.budgetSource, ''), 'COUNTY GOVERNMENT') AS sponsor,
         COALESCE(p.remarks, CONCAT('Budget allocation for ', p.projectName)) AS remarks,
         CASE WHEN COALESCE(p.costOfProject, 0) > 0 THEN 'APPROVED' ELSE 'DRAFT' END AS status,
         '' AS approvedBy,
         p.approved_at AS approvedAt,
         COALESCE(p.costOfProject, 0) AS allocatedAmount
       FROM projects p
       WHERE ${filters.join(' AND ')}
       ORDER BY p.updatedAt DESC, p.id DESC`,
      params
    );
    res.json(rowsFromResult(result));
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

router.get('/measurement-types', canRead, async (req, res) => {
  try {
    if (isPostgres) {
      const r = await pool.query(
        `SELECT id, code, label, description, voided, created_at AS "createdAt", updated_at AS "updatedAt"
         FROM planning_measurement_types WHERE voided = false ORDER BY label ASC`
      );
      return res.json(r.rows || []);
    }
    const [rows] = await pool.query(
      `SELECT id, code, label, description, voided, created_at AS createdAt, updated_at AS updatedAt
       FROM planning_measurement_types WHERE voided = 0 ORDER BY label ASC`
    );
    res.json(rows || []);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

router.post('/measurement-types', canWrite, async (req, res) => {
  const code = String(req.body.code || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
  const label = String(req.body.label || '').trim();
  const description = req.body.description != null ? String(req.body.description).trim() : null;
  if (!code || !label) return res.status(400).json({ message: 'code and label are required.' });
  try {
    if (isPostgres) {
      const r = await pool.query(
        `INSERT INTO planning_measurement_types (code, label, description)
         VALUES ($1, $2, $3)
         RETURNING id, code, label, description, voided, created_at AS "createdAt", updated_at AS "updatedAt"`,
        [code, label, description]
      );
      return res.status(201).json(r.rows?.[0]);
    }
    const [ins] = await pool.query(
      `INSERT INTO planning_measurement_types (code, label, description) VALUES (?,?,?)`,
      [code, label, description]
    );
    const [rows] = await pool.query(
      `SELECT id, code, label, description, voided, created_at AS createdAt, updated_at AS updatedAt
       FROM planning_measurement_types WHERE id = ?`,
      [ins.insertId]
    );
    res.status(201).json(rows?.[0]);
  } catch (e) {
    if (String(e.message).includes('unique') || String(e.code) === '23505') {
      return res.status(409).json({ message: 'A measurement type with this code already exists.' });
    }
    res.status(500).json({ message: e.message });
  }
});

router.put('/measurement-types/:id', canWrite, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid id.' });
  const label = String(req.body.label || '').trim();
  const description = req.body.description != null ? String(req.body.description).trim() : null;
  if (!label) return res.status(400).json({ message: 'label is required.' });
  try {
    if (isPostgres) {
      const r = await pool.query(
        `UPDATE planning_measurement_types SET label = $1, description = $2, updated_at = NOW()
         WHERE id = $3 AND voided = false
         RETURNING id, code, label, description, voided, created_at AS "createdAt", updated_at AS "updatedAt"`,
        [label, description, id]
      );
      if (!r.rowCount) return res.status(404).json({ message: 'Not found.' });
      return res.json(r.rows[0]);
    }
    const [u] = await pool.query(
      `UPDATE planning_measurement_types SET label = ?, description = ?, updated_at = NOW() WHERE id = ? AND voided = 0`,
      [label, description, id]
    );
    if (!u.affectedRows) return res.status(404).json({ message: 'Not found.' });
    const [rows] = await pool.query(
      `SELECT id, code, label, description, voided, created_at AS createdAt, updated_at AS updatedAt FROM planning_measurement_types WHERE id = ?`,
      [id]
    );
    res.json(rows?.[0]);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

router.delete('/measurement-types/:id', canWrite, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid id.' });
  try {
    if (isPostgres) {
      const r = await pool.query(`UPDATE planning_measurement_types SET voided = true, updated_at = NOW() WHERE id = $1`, [id]);
      if (!r.rowCount) return res.status(404).json({ message: 'Not found.' });
    } else {
      const [u] = await pool.query(`UPDATE planning_measurement_types SET voided = 1, updated_at = NOW() WHERE id = ?`, [id]);
      if (!u.affectedRows) return res.status(404).json({ message: 'Not found.' });
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

router.get('/indicators', canRead, async (req, res) => {
  try {
    if (isPostgres) {
      const r = await pool.query(
        `SELECT i.id, i.name, i.description, i.measurement_type_id AS "measurementTypeId",
                mt.code AS "measurementTypeCode", mt.label AS "measurementTypeLabel",
                i.voided, i.created_at AS "createdAt", i.updated_at AS "updatedAt"
         FROM planning_indicators i
         INNER JOIN planning_measurement_types mt ON mt.id = i.measurement_type_id AND mt.voided = false
         WHERE i.voided = false
         ORDER BY i.name ASC`
      );
      return res.json(r.rows || []);
    }
    const [rows] = await pool.query(
      `SELECT i.id, i.name, i.description, i.measurement_type_id AS measurementTypeId,
              mt.code AS measurementTypeCode, mt.label AS measurementTypeLabel,
              i.voided, i.created_at AS createdAt, i.updated_at AS updatedAt
       FROM planning_indicators i
       INNER JOIN planning_measurement_types mt ON mt.id = i.measurement_type_id AND mt.voided = 0
       WHERE i.voided = 0
       ORDER BY i.name ASC`
    );
    res.json(rows || []);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

router.post('/indicators', canWrite, async (req, res) => {
  const name = String(req.body.name || '').trim();
  const description = req.body.description != null ? String(req.body.description).trim() : null;
  const measurementTypeId = Number(req.body.measurementTypeId ?? req.body.measurement_type_id);
  if (!name) return res.status(400).json({ message: 'name is required.' });
  if (!Number.isFinite(measurementTypeId)) return res.status(400).json({ message: 'measurementTypeId is required.' });
  try {
    if (isPostgres) {
      const r = await pool.query(
        `INSERT INTO planning_indicators (name, description, measurement_type_id)
         VALUES ($1, $2, $3)
         RETURNING id, name, description, measurement_type_id AS "measurementTypeId", voided, created_at AS "createdAt", updated_at AS "updatedAt"`,
        [name, description, measurementTypeId]
      );
      const row = r.rows?.[0];
      const mt = firstRow(
        await pool.query(`SELECT code AS "measurementTypeCode", label AS "measurementTypeLabel" FROM planning_measurement_types WHERE id = $1`, [
          measurementTypeId,
        ])
      );
      return res.status(201).json({ ...row, ...mt });
    }
    const [ins] = await pool.query(
      `INSERT INTO planning_indicators (name, description, measurement_type_id) VALUES (?,?,?)`,
      [name, description, measurementTypeId]
    );
    const [rows] = await pool.query(
      `SELECT i.id, i.name, i.description, i.measurement_type_id AS measurementTypeId,
              mt.code AS measurementTypeCode, mt.label AS measurementTypeLabel,
              i.voided, i.created_at AS createdAt, i.updated_at AS updatedAt
       FROM planning_indicators i
       INNER JOIN planning_measurement_types mt ON mt.id = i.measurement_type_id
       WHERE i.id = ?`,
      [ins.insertId]
    );
    res.status(201).json(rows?.[0]);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

router.put('/indicators/:id', canWrite, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid id.' });
  const name = String(req.body.name || '').trim();
  const description = req.body.description != null ? String(req.body.description).trim() : null;
  const measurementTypeId = Number(req.body.measurementTypeId ?? req.body.measurement_type_id);
  if (!name) return res.status(400).json({ message: 'name is required.' });
  if (!Number.isFinite(measurementTypeId)) return res.status(400).json({ message: 'measurementTypeId is required.' });
  try {
    if (isPostgres) {
      const r = await pool.query(
        `UPDATE planning_indicators SET name = $1, description = $2, measurement_type_id = $3, updated_at = NOW()
         WHERE id = $4 AND voided = false
         RETURNING id, name, description, measurement_type_id AS "measurementTypeId", voided, created_at AS "createdAt", updated_at AS "updatedAt"`,
        [name, description, measurementTypeId, id]
      );
      if (!r.rowCount) return res.status(404).json({ message: 'Not found.' });
      const mt = firstRow(
        await pool.query(`SELECT code AS "measurementTypeCode", label AS "measurementTypeLabel" FROM planning_measurement_types WHERE id = $1`, [
          measurementTypeId,
        ])
      );
      return res.json({ ...r.rows[0], ...mt });
    }
    const [u] = await pool.query(
      `UPDATE planning_indicators SET name = ?, description = ?, measurement_type_id = ?, updated_at = NOW() WHERE id = ? AND voided = 0`,
      [name, description, measurementTypeId, id]
    );
    if (!u.affectedRows) return res.status(404).json({ message: 'Not found.' });
    const [rows] = await pool.query(
      `SELECT i.id, i.name, i.description, i.measurement_type_id AS measurementTypeId,
              mt.code AS measurementTypeCode, mt.label AS measurementTypeLabel,
              i.voided, i.created_at AS createdAt, i.updated_at AS updatedAt
       FROM planning_indicators i
       INNER JOIN planning_measurement_types mt ON mt.id = i.measurement_type_id
       WHERE i.id = ?`,
      [id]
    );
    res.json(rows?.[0]);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

router.delete('/indicators/:id', canWrite, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid id.' });
  try {
    if (isPostgres) {
      const r = await pool.query(`UPDATE planning_indicators SET voided = true, updated_at = NOW() WHERE id = $1`, [id]);
      if (!r.rowCount) return res.status(404).json({ message: 'Not found.' });
    } else {
      const [u] = await pool.query(`UPDATE planning_indicators SET voided = 1, updated_at = NOW() WHERE id = ?`, [id]);
      if (!u.affectedRows) return res.status(404).json({ message: 'Not found.' });
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

/** Catalog of measurable project activities, each linked to a KPI / indicator (for M&E and future project linking). */
router.get('/project-activities', canRead, async (req, res) => {
  try {
    if (isPostgres) {
      const params = [];
      let i = 1;
      const linkSummaryScopeFilters = [];
      i = await addProjectScopeWhere(req, linkSummaryScopeFilters, params, 'p', i);
      const linkSummaryScopeSql = linkSummaryScopeFilters.length ? ` AND ${linkSummaryScopeFilters.join(' AND ')}` : '';
      const firstLinkScopeFilters = [];
      i = await addProjectScopeWhere(req, firstLinkScopeFilters, params, 'p', i);
      const firstLinkScopeSql = firstLinkScopeFilters.length ? ` AND ${firstLinkScopeFilters.join(' AND ')}` : '';
      const r = await pool.query(
        `SELECT a.id, a.activity_code AS "activityCode", a.activity_name AS "activityName",
                a.indicator_id AS "indicatorId", a.description, a.voided,
                a.created_at AS "createdAt", a.updated_at AS "updatedAt",
                i.name AS "indicatorName",
                mt.code AS "measurementTypeCode", mt.label AS "measurementTypeLabel",
                COALESCE(link_summary.link_count, 0) AS "linkedProjectCount",
                link_summary.indicator_count AS "indicatorCount",
                link_summary.baseline_count AS "baselineCount",
                link_summary.milestone_count AS "milestoneCount",
                first_link.project_id AS "sampleProjectId",
                COALESCE(first_link.project_code, '') AS "sampleProjectCode",
                COALESCE(first_link.project_name, '') AS "sampleProjectName",
                first_link.planned_start_date AS "startDate",
                first_link.planned_end_date AS "endDate",
                first_link.activity_status AS "status",
                first_link.completed_at AS "completedAt"
         FROM planning_project_activities a
         INNER JOIN planning_indicators i ON i.id = a.indicator_id AND i.voided = false
         INNER JOIN planning_measurement_types mt ON mt.id = i.measurement_type_id AND mt.voided = false
         LEFT JOIN LATERAL (
           SELECT
             COUNT(DISTINCT l.project_id)::int AS link_count,
             COUNT(DISTINCT l.project_id)::int AS indicator_count,
             COUNT(*) FILTER (WHERE l.baseline_value IS NOT NULL)::int AS baseline_count,
             COUNT(*) FILTER (WHERE l.target_value IS NOT NULL)::int AS milestone_count
           FROM project_planning_activity_links l
           INNER JOIN projects p ON p.project_id = l.project_id AND COALESCE(p.voided, false) = false
           WHERE l.planning_activity_id = a.id AND l.voided = false${linkSummaryScopeSql}
         ) link_summary ON true
         LEFT JOIN LATERAL (
           SELECT
             l.project_id,
             COALESCE(NULLIF(l.cimes_project_code, ''), p.data_sources->>'project_ref_num', 'PRJ-' || p.project_id::text) AS project_code,
             COALESCE(NULLIF(l.cimes_project_name, ''), p.name, 'Project ' || p.project_id::text) AS project_name,
             l.planned_start_date,
             l.planned_end_date,
             l.activity_status,
             l.completed_at
           FROM project_planning_activity_links l
           INNER JOIN projects p ON p.project_id = l.project_id AND COALESCE(p.voided, false) = false
           WHERE l.planning_activity_id = a.id AND l.voided = false${firstLinkScopeSql}
           ORDER BY CASE WHEN l.seed_source = 'cimes_project_activities' THEN 0 ELSE 1 END, l.id
           LIMIT 1
         ) first_link ON true
         WHERE a.voided = false
         ORDER BY a.activity_code ASC`,
        params
      );
      return res.json(r.rows || []);
    }
    const [rows] = await pool.query(
      `SELECT a.id, a.activity_code AS activityCode, a.activity_name AS activityName,
              a.indicator_id AS indicatorId, a.description, a.voided,
              a.created_at AS createdAt, a.updated_at AS updatedAt,
              i.name AS indicatorName,
              mt.code AS measurementTypeCode, mt.label AS measurementTypeLabel,
              COALESCE(link_summary.linkedProjectCount, 0) AS linkedProjectCount,
              link_summary.indicatorCount,
              link_summary.baselineCount,
              link_summary.milestoneCount,
              first_link.projectId AS sampleProjectId,
              COALESCE(first_link.projectCode, '') AS sampleProjectCode,
              COALESCE(first_link.projectName, '') AS sampleProjectName,
              first_link.startDate,
              first_link.endDate,
              first_link.status,
              first_link.completedAt
       FROM planning_project_activities a
       INNER JOIN planning_indicators i ON i.id = a.indicator_id AND i.voided = 0
       INNER JOIN planning_measurement_types mt ON mt.id = i.measurement_type_id AND mt.voided = 0
       LEFT JOIN (
         SELECT planning_activity_id,
                COUNT(DISTINCT project_id) AS linkedProjectCount,
                COUNT(DISTINCT project_id) AS indicatorCount,
                SUM(CASE WHEN baseline_value IS NOT NULL THEN 1 ELSE 0 END) AS baselineCount,
                SUM(CASE WHEN target_value IS NOT NULL THEN 1 ELSE 0 END) AS milestoneCount
         FROM project_planning_activity_links
         WHERE voided = 0
         GROUP BY planning_activity_id
       ) link_summary ON link_summary.planning_activity_id = a.id
       LEFT JOIN (
         SELECT l.planning_activity_id,
                l.project_id AS projectId,
                COALESCE(NULLIF(l.cimes_project_code, ''), p.ProjectRefNum, CONCAT('PRJ-', p.id)) AS projectCode,
                COALESCE(NULLIF(l.cimes_project_name, ''), p.projectName, CONCAT('Project ', p.id)) AS projectName,
                l.planned_start_date AS startDate,
                l.planned_end_date AS endDate,
                l.activity_status AS status,
                l.completed_at AS completedAt
         FROM project_planning_activity_links l
         LEFT JOIN projects p ON p.id = l.project_id
         WHERE l.voided = 0
       ) first_link ON first_link.planning_activity_id = a.id
       WHERE a.voided = 0
       ORDER BY a.activity_code ASC`
    );
    res.json(rows || []);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

router.post('/project-activities', canWrite, async (req, res) => {
  const activityCode = String(req.body.activityCode || req.body.activity_code || '')
    .trim()
    .replace(/\s+/g, '_');
  const activityName = String(req.body.activityName || req.body.activity_name || '').trim();
  const description = req.body.description != null ? String(req.body.description).trim() : null;
  const indicatorId = Number(req.body.indicatorId ?? req.body.indicator_id);
  if (!activityCode || !activityName) return res.status(400).json({ message: 'activityCode and activityName are required.' });
  if (!Number.isFinite(indicatorId)) return res.status(400).json({ message: 'indicatorId is required.' });
  try {
    if (isPostgres) {
      const r = await pool.query(
        `INSERT INTO planning_project_activities (activity_code, activity_name, indicator_id, description)
         VALUES ($1, $2, $3, $4)
         RETURNING id, activity_code AS "activityCode", activity_name AS "activityName",
                   indicator_id AS "indicatorId", description, voided, created_at AS "createdAt", updated_at AS "updatedAt"`,
        [activityCode, activityName, indicatorId, description]
      );
      const row = r.rows?.[0];
      const ind = firstRow(
        await pool.query(
          `SELECT i.name AS "indicatorName", mt.code AS "measurementTypeCode", mt.label AS "measurementTypeLabel"
           FROM planning_indicators i
           INNER JOIN planning_measurement_types mt ON mt.id = i.measurement_type_id AND mt.voided = false
           WHERE i.id = $1 AND i.voided = false`,
          [indicatorId]
        )
      );
      return res.status(201).json({ ...row, ...ind });
    }
    const [ins] = await pool.query(
      `INSERT INTO planning_project_activities (activity_code, activity_name, indicator_id, description) VALUES (?,?,?,?)`,
      [activityCode, activityName, indicatorId, description]
    );
    const [rows] = await pool.query(
      `SELECT a.id, a.activity_code AS activityCode, a.activity_name AS activityName,
              a.indicator_id AS indicatorId, a.description, a.voided,
              a.created_at AS createdAt, a.updated_at AS updatedAt,
              i.name AS indicatorName,
              mt.code AS measurementTypeCode, mt.label AS measurementTypeLabel
       FROM planning_project_activities a
       INNER JOIN planning_indicators i ON i.id = a.indicator_id
       INNER JOIN planning_measurement_types mt ON mt.id = i.measurement_type_id AND mt.voided = 0
       WHERE a.id = ?`,
      [ins.insertId]
    );
    res.status(201).json(rows?.[0]);
  } catch (e) {
    if (String(e.message).includes('unique') || String(e.code) === '23505') {
      return res.status(409).json({ message: 'An activity with this code already exists.' });
    }
    if (String(e.message).includes('foreign key') || String(e.code) === '23503') {
      return res.status(400).json({ message: 'Invalid indicator or indicator is not available.' });
    }
    res.status(500).json({ message: e.message });
  }
});

router.put('/project-activities/:id', canWrite, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid id.' });
  const activityCode = String(req.body.activityCode || req.body.activity_code || '')
    .trim()
    .replace(/\s+/g, '_');
  const activityName = String(req.body.activityName || req.body.activity_name || '').trim();
  const description = req.body.description != null ? String(req.body.description).trim() : null;
  const indicatorId = Number(req.body.indicatorId ?? req.body.indicator_id);
  if (!activityCode || !activityName) return res.status(400).json({ message: 'activityCode and activityName are required.' });
  if (!Number.isFinite(indicatorId)) return res.status(400).json({ message: 'indicatorId is required.' });
  try {
    if (isPostgres) {
      const r = await pool.query(
        `UPDATE planning_project_activities
         SET activity_code = $1, activity_name = $2, indicator_id = $3, description = $4, updated_at = NOW()
         WHERE id = $5 AND voided = false
         RETURNING id, activity_code AS "activityCode", activity_name AS "activityName",
                   indicator_id AS "indicatorId", description, voided, created_at AS "createdAt", updated_at AS "updatedAt"`,
        [activityCode, activityName, indicatorId, description, id]
      );
      if (!r.rowCount) return res.status(404).json({ message: 'Not found.' });
      const ind = firstRow(
        await pool.query(
          `SELECT i.name AS "indicatorName", mt.code AS "measurementTypeCode", mt.label AS "measurementTypeLabel"
           FROM planning_indicators i
           INNER JOIN planning_measurement_types mt ON mt.id = i.measurement_type_id AND mt.voided = false
           WHERE i.id = $1 AND i.voided = false`,
          [indicatorId]
        )
      );
      return res.json({ ...r.rows[0], ...ind });
    }
    const [u] = await pool.query(
      `UPDATE planning_project_activities SET activity_code = ?, activity_name = ?, indicator_id = ?, description = ?, updated_at = NOW() WHERE id = ? AND voided = 0`,
      [activityCode, activityName, indicatorId, description, id]
    );
    if (!u.affectedRows) return res.status(404).json({ message: 'Not found.' });
    const [rows] = await pool.query(
      `SELECT a.id, a.activity_code AS activityCode, a.activity_name AS activityName,
              a.indicator_id AS indicatorId, a.description, a.voided,
              a.created_at AS createdAt, a.updated_at AS updatedAt,
              i.name AS indicatorName,
              mt.code AS measurementTypeCode, mt.label AS measurementTypeLabel
       FROM planning_project_activities a
       INNER JOIN planning_indicators i ON i.id = a.indicator_id
       INNER JOIN planning_measurement_types mt ON mt.id = i.measurement_type_id AND mt.voided = 0
       WHERE a.id = ?`,
      [id]
    );
    res.json(rows?.[0]);
  } catch (e) {
    if (String(e.message).includes('unique') || String(e.code) === '23505' || String(e.code) === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'An activity with this code already exists.' });
    }
    if (String(e.message).includes('foreign key') || String(e.code) === '23503') {
      return res.status(400).json({ message: 'Invalid indicator or indicator is not available.' });
    }
    res.status(500).json({ message: e.message });
  }
});

router.delete('/project-activities/:id', canWrite, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid id.' });
  try {
    if (isPostgres) {
      const r = await pool.query(`UPDATE planning_project_activities SET voided = true, updated_at = NOW() WHERE id = $1`, [id]);
      if (!r.rowCount) return res.status(404).json({ message: 'Not found.' });
    } else {
      const [u] = await pool.query(`UPDATE planning_project_activities SET voided = 1, updated_at = NOW() WHERE id = ?`, [id]);
      if (!u.affectedRows) return res.status(404).json({ message: 'Not found.' });
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

/** Standard project risk register (code, name, description). */
router.get('/project-risks', canRead, async (req, res) => {
  try {
    if (isPostgres) {
      const r = await pool.query(
        `SELECT id, risk_code AS "riskCode", risk_name AS "riskName", description, voided,
                created_at AS "createdAt", updated_at AS "updatedAt"
         FROM planning_project_risks
         WHERE voided = false
         ORDER BY risk_code ASC`
      );
      return res.json(r.rows || []);
    }
    const [rows] = await pool.query(
      `SELECT id, risk_code AS riskCode, risk_name AS riskName, description, voided,
              created_at AS createdAt, updated_at AS updatedAt
       FROM planning_project_risks
       WHERE voided = 0
       ORDER BY risk_code ASC`
    );
    res.json(rows || []);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

router.post('/project-risks', canWrite, async (req, res) => {
  const riskCode = String(req.body.riskCode || req.body.risk_code || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
  const riskName = String(req.body.riskName || req.body.risk_name || '').trim();
  const description = req.body.description != null ? String(req.body.description).trim() : null;
  if (!riskCode || !riskName) return res.status(400).json({ message: 'riskCode and riskName are required.' });
  try {
    if (isPostgres) {
      const r = await pool.query(
        `INSERT INTO planning_project_risks (risk_code, risk_name, description)
         VALUES ($1, $2, $3)
         RETURNING id, risk_code AS "riskCode", risk_name AS "riskName", description, voided,
                   created_at AS "createdAt", updated_at AS "updatedAt"`,
        [riskCode, riskName, description]
      );
      return res.status(201).json(r.rows?.[0]);
    }
    const [ins] = await pool.query(
      `INSERT INTO planning_project_risks (risk_code, risk_name, description) VALUES (?,?,?)`,
      [riskCode, riskName, description]
    );
    const [rows] = await pool.query(
      `SELECT id, risk_code AS riskCode, risk_name AS riskName, description, voided,
              created_at AS createdAt, updated_at AS updatedAt
       FROM planning_project_risks WHERE id = ?`,
      [ins.insertId]
    );
    res.status(201).json(rows?.[0]);
  } catch (e) {
    if (String(e.message).includes('unique') || String(e.code) === '23505') {
      return res.status(409).json({ message: 'A risk with this code already exists.' });
    }
    res.status(500).json({ message: e.message });
  }
});

router.put('/project-risks/:id', canWrite, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid id.' });
  const riskCode = String(req.body.riskCode || req.body.risk_code || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
  const riskName = String(req.body.riskName || req.body.risk_name || '').trim();
  const description = req.body.description != null ? String(req.body.description).trim() : null;
  if (!riskCode || !riskName) return res.status(400).json({ message: 'riskCode and riskName are required.' });
  try {
    if (isPostgres) {
      const r = await pool.query(
        `UPDATE planning_project_risks
         SET risk_code = $1, risk_name = $2, description = $3, updated_at = NOW()
         WHERE id = $4 AND voided = false
         RETURNING id, risk_code AS "riskCode", risk_name AS "riskName", description, voided,
                   created_at AS "createdAt", updated_at AS "updatedAt"`,
        [riskCode, riskName, description, id]
      );
      if (!r.rowCount) return res.status(404).json({ message: 'Not found.' });
      return res.json(r.rows[0]);
    }
    const [u] = await pool.query(
      `UPDATE planning_project_risks SET risk_code = ?, risk_name = ?, description = ?, updated_at = NOW() WHERE id = ? AND voided = 0`,
      [riskCode, riskName, description, id]
    );
    if (!u.affectedRows) return res.status(404).json({ message: 'Not found.' });
    const [rows] = await pool.query(
      `SELECT id, risk_code AS riskCode, risk_name AS riskName, description, voided,
              created_at AS createdAt, updated_at AS updatedAt
       FROM planning_project_risks WHERE id = ?`,
      [id]
    );
    res.json(rows?.[0]);
  } catch (e) {
    if (String(e.message).includes('unique') || String(e.code) === '23505' || String(e.code) === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'A risk with this code already exists.' });
    }
    res.status(500).json({ message: e.message });
  }
});

router.delete('/project-risks/:id', canWrite, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid id.' });
  try {
    if (isPostgres) {
      const r = await pool.query(`UPDATE planning_project_risks SET voided = true, updated_at = NOW() WHERE id = $1`, [id]);
      if (!r.rowCount) return res.status(404).json({ message: 'Not found.' });
    } else {
      const [u] = await pool.query(`UPDATE planning_project_risks SET voided = 1, updated_at = NOW() WHERE id = ?`, [id]);
      if (!u.affectedRows) return res.status(404).json({ message: 'Not found.' });
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

/** Reporting cadence catalog (indicator / milestone reporting). */
router.get('/reporting-frequencies', canRead, async (req, res) => {
  try {
    if (isPostgres) {
      const r = await pool.query(
        `SELECT id, frequency_code AS "frequencyCode", frequency_name AS "frequencyName", description,
                active, voided, created_at AS "createdAt", updated_at AS "updatedAt"
         FROM planning_reporting_frequencies
         WHERE voided = false
         ORDER BY frequency_name ASC`
      );
      const rows = (r.rows || []).map((row) => ({ ...row, active: !!row.active }));
      return res.json(rows);
    }
    const [rows] = await pool.query(
      `SELECT id, frequency_code AS frequencyCode, frequency_name AS frequencyName, description,
              active, voided, created_at AS createdAt, updated_at AS updatedAt
       FROM planning_reporting_frequencies
       WHERE voided = 0
       ORDER BY frequency_name ASC`
    );
    res.json((rows || []).map((row) => ({ ...row, active: !!row.active })));
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

router.post('/reporting-frequencies', canWrite, async (req, res) => {
  const frequencyName = String(req.body.frequencyName || req.body.frequency_name || '').trim();
  const description = req.body.description != null ? String(req.body.description).trim() : null;
  const frequencyCode = normalizeReportingFrequencyCode(
    req.body.frequencyCode || req.body.frequency_code,
    frequencyName
  );
  const active = req.body.active === undefined ? true : Boolean(req.body.active);
  if (!frequencyName || !frequencyCode) {
    return res.status(400).json({ message: 'frequencyName is required (or provide a valid frequencyCode).' });
  }
  try {
    if (isPostgres) {
      const r = await pool.query(
        `INSERT INTO planning_reporting_frequencies (frequency_code, frequency_name, description, active)
         VALUES ($1, $2, $3, $4)
         RETURNING id, frequency_code AS "frequencyCode", frequency_name AS "frequencyName", description, active,
                   voided, created_at AS "createdAt", updated_at AS "updatedAt"`,
        [frequencyCode, frequencyName, description, active]
      );
      const row = r.rows?.[0];
      return res.status(201).json({ ...row, active: !!row?.active });
    }
    const [ins] = await pool.query(
      `INSERT INTO planning_reporting_frequencies (frequency_code, frequency_name, description, active) VALUES (?,?,?,?)`,
      [frequencyCode, frequencyName, description, active ? 1 : 0]
    );
    const [rows] = await pool.query(
      `SELECT id, frequency_code AS frequencyCode, frequency_name AS frequencyName, description, active,
              voided, created_at AS createdAt, updated_at AS updatedAt
       FROM planning_reporting_frequencies WHERE id = ?`,
      [ins.insertId]
    );
    const row = rows?.[0];
    res.status(201).json({ ...row, active: !!row?.active });
  } catch (e) {
    if (String(e.message).includes('unique') || String(e.code) === '23505') {
      return res.status(409).json({ message: 'A reporting frequency with this code already exists.' });
    }
    res.status(500).json({ message: e.message });
  }
});

router.put('/reporting-frequencies/:id', canWrite, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid id.' });
  const frequencyName = String(req.body.frequencyName || req.body.frequency_name || '').trim();
  const description = req.body.description != null ? String(req.body.description).trim() : null;
  const active =
    req.body.active === undefined || req.body.active === null ? undefined : Boolean(req.body.active);
  if (!frequencyName) return res.status(400).json({ message: 'frequencyName is required.' });
  try {
    if (isPostgres) {
      let sql = `UPDATE planning_reporting_frequencies
         SET frequency_name = $1, description = $2, updated_at = NOW()`;
      const params = [frequencyName, description];
      let n = 3;
      if (active !== undefined) {
        sql += `, active = $${n}`;
        params.push(active);
        n += 1;
      }
      sql += ` WHERE id = $${n} AND voided = false
         RETURNING id, frequency_code AS "frequencyCode", frequency_name AS "frequencyName", description, active,
                   voided, created_at AS "createdAt", updated_at AS "updatedAt"`;
      params.push(id);
      const r = await pool.query(sql, params);
      if (!r.rowCount) return res.status(404).json({ message: 'Not found.' });
      const row = r.rows[0];
      return res.json({ ...row, active: !!row.active });
    }
    let sql = `UPDATE planning_reporting_frequencies SET frequency_name = ?, description = ?, updated_at = NOW()`;
    const params = [frequencyName, description];
    if (active !== undefined) {
      sql += `, active = ?`;
      params.push(active ? 1 : 0);
    }
    sql += ` WHERE id = ? AND voided = 0`;
    params.push(id);
    const [u] = await pool.query(sql, params);
    if (!u.affectedRows) return res.status(404).json({ message: 'Not found.' });
    const [rows] = await pool.query(
      `SELECT id, frequency_code AS frequencyCode, frequency_name AS frequencyName, description, active,
              voided, created_at AS createdAt, updated_at AS updatedAt
       FROM planning_reporting_frequencies WHERE id = ?`,
      [id]
    );
    const row = rows?.[0];
    res.json({ ...row, active: !!row?.active });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

router.delete('/reporting-frequencies/:id', canWrite, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid id.' });
  try {
    if (isPostgres) {
      const r = await pool.query(
        `UPDATE planning_reporting_frequencies SET voided = true, updated_at = NOW() WHERE id = $1`,
        [id]
      );
      if (!r.rowCount) return res.status(404).json({ message: 'Not found.' });
    } else {
      const [u] = await pool.query(
        `UPDATE planning_reporting_frequencies SET voided = 1, updated_at = NOW() WHERE id = ?`,
        [id]
      );
      if (!u.affectedRows) return res.status(404).json({ message: 'Not found.' });
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

router.ensurePlanningIndicatorTables = ensureTables;
module.exports = router;
