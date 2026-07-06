const pool = require('../config/db');
const { isTestProjectName, normKey } = require('./clientProjectImportStagingService');

const DEMO_KEYWORD_PATTERN = /\b(sample|demo|test|nimes)\b/;

function parseJsonField(value) {
  if (value == null) return null;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function mapProjectRow(row) {
  const location = parseJsonField(row.location) || {};
  const dataSources = parseJsonField(row.data_sources) || {};
  const progress = parseJsonField(row.progress) || {};
  return {
    id: Number(row.project_id),
    name: row.name,
    stateDepartment: row.state_department || null,
    subcounty: location.subcounty || null,
    ward: location.ward || null,
    status: progress.status || null,
    dataSources,
    createdAt: row.created_at,
  };
}

function isClientImportedProject(project) {
  return Boolean(project.dataSources?.client_import_batch || project.dataSources?.compendium_import_batch);
}

function classifyDemoReason(project) {
  if (isClientImportedProject(project)) return null;
  const key = normKey(project.name);
  const refNum = String(project.dataSources?.project_ref_num || '').toUpperCase();

  if (key.startsWith('gis demo') || refNum.startsWith('GIS-DEMO')) return 'gis_demo';
  if (key.includes('escalation demo')) return 'escalation_demo';
  if (key.includes('nimes')) return 'nimes_import';
  if (DEMO_KEYWORD_PATTERN.test(key)) return 'name_keyword';
  if (isTestProjectName(project.name)) return 'seed_template';
  return 'seed_template';
}

function isDemoProject(project) {
  if (isClientImportedProject(project)) return false;
  const key = normKey(project.name);
  const refNum = String(project.dataSources?.project_ref_num || '').toUpperCase();

  if (key.startsWith('gis demo') || refNum.startsWith('GIS-DEMO')) return true;
  if (key.includes('escalation demo')) return true;
  if (DEMO_KEYWORD_PATTERN.test(key)) return true;
  return isTestProjectName(project.name);
}

async function fetchActiveProjects() {
  const result = await pool.query(`
    SELECT project_id, name, state_department, location, progress, data_sources, created_at
    FROM projects
    WHERE COALESCE(voided, false) = false
    ORDER BY project_id ASC
  `);
  return (result.rows || []).map(mapProjectRow);
}

function filterDemoProjects(projects, opts = {}) {
  let rows = projects.filter(isDemoProject).map((row) => ({
    ...row,
    demoReason: classifyDemoReason(row),
  }));

  if (opts.search) {
    const query = normKey(opts.search);
    rows = rows.filter((row) => {
      const haystack = [
        row.name,
        row.stateDepartment,
        row.subcounty,
        row.ward,
        row.demoReason,
      ].map((part) => normKey(part)).join(' ');
      return haystack.includes(query);
    });
  }

  if (opts.reason) {
    rows = rows.filter((row) => row.demoReason === opts.reason);
  }

  return rows;
}

async function listDemoProjects(opts = {}) {
  const allDemo = filterDemoProjects(await fetchActiveProjects(), opts);
  const total = allDemo.length;
  const offset = Math.max(Number(opts.offset) || 0, 0);
  const limit = Math.min(Math.max(Number(opts.limit) || 50, 1), 500);

  return {
    total,
    rows: allDemo.slice(offset, offset + limit),
  };
}

async function summarizeDemoProjects() {
  const rows = filterDemoProjects(await fetchActiveProjects());
  const byReason = rows.reduce((acc, row) => {
    acc[row.demoReason] = (acc[row.demoReason] || 0) + 1;
    return acc;
  }, {});

  return {
    total: rows.length,
    reasons: Object.entries(byReason)
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count),
  };
}

async function fetchDemoProjectsByIds(projectIds = []) {
  const ids = [...new Set(projectIds.map((id) => Number(id)).filter(Number.isFinite))];
  if (!ids.length) return [];

  const result = await pool.query(
    `
    SELECT project_id, name, state_department, location, progress, data_sources, created_at
    FROM projects
    WHERE project_id = ANY($1::bigint[])
      AND COALESCE(voided, false) = false
    ORDER BY project_id ASC
    `,
    [ids]
  );

  return (result.rows || []).map(mapProjectRow).filter(isDemoProject).map((row) => ({
    ...row,
    demoReason: classifyDemoReason(row),
  }));
}

async function voidDemoProjects(opts = {}) {
  let rows = [];
  if (opts.voidAllDemo === true) {
    rows = filterDemoProjects(await fetchActiveProjects(), { search: opts.search, reason: opts.reason });
  } else {
    rows = await fetchDemoProjectsByIds(opts.projectIds);
  }

  const summary = {
    requested: rows.length,
    voided: [],
    skipped: [],
    errors: [],
  };

  for (const row of rows) {
    try {
      const result = await pool.query(
        `
        UPDATE projects
        SET voided = true, updated_at = CURRENT_TIMESTAMP
        WHERE project_id = $1 AND COALESCE(voided, false) = false
        RETURNING project_id
        `,
        [row.id]
      );
      if (!result.rowCount) {
        summary.skipped.push({ projectId: row.id, name: row.name, reason: 'already_voided' });
        continue;
      }
      summary.voided.push({ projectId: row.id, name: row.name, demoReason: row.demoReason });
    } catch (error) {
      summary.errors.push({ projectId: row.id, name: row.name, error: error.message });
    }
  }

  summary.demoRemaining = (await summarizeDemoProjects()).total;
  return summary;
}

module.exports = {
  listDemoProjects,
  summarizeDemoProjects,
  voidDemoProjects,
  isDemoProject,
  classifyDemoReason,
};
