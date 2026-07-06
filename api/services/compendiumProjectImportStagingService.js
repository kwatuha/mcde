const pool = require('../config/db');
const clientStaging = require('./clientProjectImportStagingService');

const {
  cleanText,
  normKey,
  applyMatching,
  fetchExistingProjects,
} = clientStaging;

const DEFAULT_BATCH = 'compendium-fy2022-2025-v1';
const DEFAULT_SOURCE = 'CombendiumOfProjects.xlsx';

const COMPENDIUM_DEPARTMENT_ALIASES = {
  'roads and transport': 'Roads & Transport',
  'water and irrigation': 'Water & Irrigation',
  'agriculture and food security': 'Agriculture and Food Security',
  'energy and electrification': 'Energy & Electrification',
  'education and ecde services': 'Education and ECDE Services',
  'housing and urban development': 'Lands & Physical Planning',
  'lands urban and housing': 'Lands & Physical Planning',
  'lands urban housing': 'Lands & Physical Planning',
  'ict infrastructure': 'ICT & Infrastructure',
  'ict & infrastructure': 'ICT & Infrastructure',
  'sanitation and sewerage': 'Sanitation',
  'sme development': 'SME',
  'livestock and fisheries development': 'Livestock and Fisheries Development',
  'gender youth sports': 'Youth & Sports',
  'finance and ict': 'ICT & Infrastructure',
  'finance ict': 'ICT & Infrastructure',
  'trade tourism': 'Tourism',
  'trade and tourism': 'Tourism',
  'county administration and decentralized units': 'County Administration & Decentralized Units',
  'devolution': 'County Administration & Decentralized Units',
};

function titleCaseWords(value) {
  return cleanText(value)
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

function normalizeCompendiumDepartment(raw) {
  const text = cleanText(raw);
  if (!text) return null;
  const key = normKey(text);
  if (COMPENDIUM_DEPARTMENT_ALIASES[key]) return COMPENDIUM_DEPARTMENT_ALIASES[key];
  const temp = clientStaging.normalizeStagingRow({
    sourceRowNo: 1,
    projectName: 'x',
    subCounty: '',
    ward: '',
    subLocation: '',
    department: text,
    impact: '',
    paymentStatus: '',
    remarks: '',
  }, 'batch', 'source');
  return temp.departmentNorm || titleCaseWords(text);
}

function normalizeFinancialYear(raw) {
  const text = cleanText(raw).replace(/^`+/, '').trim();
  if (!text) return null;
  const match = text.match(/(20\d{2})\s*[/\-]\s*(20\d{2})/);
  if (match) return `${match[1]}/${match[2]}`;
  return text;
}

function parseApprovedCost(raw) {
  const text = cleanText(raw).replace(/,/g, '');
  if (!text || text === '0') return null;
  if (/^-?\d+(\.\d+)?$/.test(text)) return Number(text);
  const numeric = text.match(/-?\d+(?:\.\d+)?/);
  return numeric ? Number(numeric[0]) : null;
}

function normalizeCompendiumStatus(raw) {
  const text = cleanText(raw);
  if (!text) return null;
  const key = text.toLowerCase();
  if (/^complete/.test(key) || key === 'completed' || key === 'done') return 'Completed';
  if (/ongoing|on going|progress|ipc\s*\d/i.test(text)) return 'Ongoing';
  if (/stall|abandon|hold/i.test(text)) return 'Stalled';
  if (/not started|pending/i.test(text)) return 'Not Started';
  if (/cancel/i.test(text)) return 'Cancelled';
  return 'review';
}

function inferFundingClass(projectName, departmentRaw) {
  const nameKey = normKey(projectName);
  const deptKey = normKey(departmentRaw);
  if (nameKey.startsWith('rri ') || nameKey.includes(' rri ') || deptKey.includes('rri')) return 'rri';
  return 'development';
}

function buildMatchKey(row) {
  return [
    normKey(row.projectName),
    normKey(row.wardNorm),
    normKey(row.subCountyNorm),
    normKey(row.departmentNorm),
  ].filter(Boolean).join('|');
}

function buildDuplicateGroupKey(row) {
  return `${normKey(row.projectName)}|${normKey(row.wardNorm)}`;
}

function normalizeCompendiumRow(row, sourceFile, importBatch) {
  const projectName = cleanText(row.projectName);
  const subCountyRaw = cleanText(row.subCounty);
  const wardRaw = cleanText(row.ward);
  const subLocationRaw = cleanText(row.subLocation);
  const departmentRaw = cleanText(row.department);

  const subcounty = normalizeSubcountyLocal(subCountyRaw);
  const wardNorm = normalizeWardLocal(wardRaw);
  const subLocationNorm = subLocationRaw ? titleCaseWords(subLocationRaw) : null;
  const departmentNorm = normalizeCompendiumDepartment(departmentRaw);
  const financialYearNorm = normalizeFinancialYear(row.financialYear);
  const approvedCostNorm = parseApprovedCost(row.approvedCost);
  const projectStatusNorm = normalizeCompendiumStatus(row.projectStatus);
  const fundingClass = inferFundingClass(projectName, departmentRaw);

  const locationScope = subcounty.scope === 'single' && !wardNorm && subcounty.norm
    ? 'single_missing_ward'
    : subcounty.scope;

  const matchKey = buildMatchKey({
    projectName,
    wardNorm,
    subCountyNorm: subcounty.norm,
    departmentNorm,
  });
  const duplicateGroupKey = buildDuplicateGroupKey({ projectName, wardNorm });

  const notes = [];
  if (!financialYearNorm) notes.push('financial_year_missing');
  if (approvedCostNorm == null) notes.push('approved_cost_missing');
  if (projectStatusNorm === 'review') notes.push('project_status_unmapped');
  if (locationScope === 'multi' || locationScope === 'county_wide') notes.push(`location_${locationScope}`);
  if (locationScope === 'unknown') notes.push('subcounty_unrecognized');
  if (fundingClass === 'rri') notes.push('funding_rri');

  return {
    importBatch,
    sourceFile,
    sourceSheet: cleanText(row.sourceSheet) || 'Combined',
    sourceRowNo: row.sourceRowNo,
    projectName,
    subCountyRaw: subCountyRaw || null,
    wardRaw: wardRaw || null,
    subLocationRaw: subLocationRaw || null,
    departmentRaw: departmentRaw || null,
    financialYearRaw: cleanText(row.financialYear) || null,
    approvedCostRaw: cleanText(row.approvedCost) || null,
    projectStatusRaw: cleanText(row.projectStatus) || null,
    subCountyNorm: subcounty.norm,
    wardNorm,
    subLocationNorm,
    departmentNorm,
    financialYearNorm,
    approvedCostNorm,
    projectStatusNorm,
    fundingClass,
    locationScope,
    matchKey,
    duplicateGroupKey,
    duplicateCountInFile: 1,
    matchProjectId: null,
    matchProjectName: null,
    matchScore: null,
    matchMethod: null,
    matchIsTestProject: false,
    proposedAction: 'review',
    reviewNotes: notes.length ? notes.join('; ') : null,
  };
}

function normalizeSubcountyLocal(raw) {
  const row = clientStaging.normalizeStagingRow({
    sourceRowNo: 1,
    projectName: 'x',
    subCounty: raw,
    ward: '',
    subLocation: '',
    department: '',
    impact: '',
    paymentStatus: '',
    remarks: '',
  }, 'batch', 'source');
  return {
    norm: row.subCountyNorm,
    scope: row.locationScope === 'single_missing_ward' ? 'single' : row.locationScope,
  };
}

function normalizeWardLocal(raw) {
  const row = clientStaging.normalizeStagingRow({
    sourceRowNo: 1,
    projectName: 'x',
    subCounty: '',
    ward: raw,
    subLocation: '',
    department: '',
    impact: '',
    paymentStatus: '',
    remarks: '',
  }, 'batch', 'source');
  return row.wardNorm;
}

async function ensureStagingSchema() {
  const DB_TYPE = process.env.DB_TYPE || 'postgresql';
  if (DB_TYPE !== 'postgresql') {
    throw new Error('compendium_project_import_staging requires PostgreSQL.');
  }
  await pool.query(`
    CREATE TABLE IF NOT EXISTS compendium_project_import_staging (
      id BIGSERIAL PRIMARY KEY,
      import_batch TEXT NOT NULL,
      source_file TEXT NOT NULL,
      source_sheet TEXT NOT NULL DEFAULT 'Combined',
      source_row_no INTEGER NOT NULL,
      project_name TEXT NOT NULL,
      sub_county_raw TEXT NULL,
      ward_raw TEXT NULL,
      sub_location_raw TEXT NULL,
      department_raw TEXT NULL,
      financial_year_raw TEXT NULL,
      approved_cost_raw TEXT NULL,
      project_status_raw TEXT NULL,
      sub_county_norm TEXT NULL,
      ward_norm TEXT NULL,
      sub_location_norm TEXT NULL,
      department_norm TEXT NULL,
      financial_year_norm TEXT NULL,
      approved_cost_norm NUMERIC(18, 2) NULL,
      project_status_norm TEXT NULL,
      funding_class TEXT NOT NULL DEFAULT 'development',
      location_scope TEXT NOT NULL DEFAULT 'single',
      match_key TEXT NOT NULL,
      duplicate_group_key TEXT NULL,
      duplicate_count_in_file INTEGER NOT NULL DEFAULT 1,
      match_project_id BIGINT NULL,
      match_project_name TEXT NULL,
      match_score NUMERIC(5, 4) NULL,
      match_method TEXT NULL,
      match_is_test_project BOOLEAN NOT NULL DEFAULT FALSE,
      proposed_action TEXT NOT NULL DEFAULT 'review',
      review_notes TEXT NULL,
      applied_project_id BIGINT NULL,
      applied_at TIMESTAMPTZ NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (import_batch, source_sheet, source_row_no)
    )
  `);
  await pool.query(`
    ALTER TABLE compendium_project_import_staging
      ADD COLUMN IF NOT EXISTS applied_project_id BIGINT NULL,
      ADD COLUMN IF NOT EXISTS applied_at TIMESTAMPTZ NULL
  `);
}

function mapStagingRow(row) {
  return {
    id: row.id,
    importBatch: row.import_batch,
    sourceFile: row.source_file,
    sourceSheet: row.source_sheet,
    sourceRowNo: row.source_row_no,
    projectName: row.project_name,
    subCountyRaw: row.sub_county_raw,
    wardRaw: row.ward_raw,
    subLocationRaw: row.sub_location_raw,
    departmentRaw: row.department_raw,
    financialYearRaw: row.financial_year_raw,
    approvedCostRaw: row.approved_cost_raw,
    projectStatusRaw: row.project_status_raw,
    subCountyNorm: row.sub_county_norm,
    wardNorm: row.ward_norm,
    subLocationNorm: row.sub_location_norm,
    departmentNorm: row.department_norm,
    financialYearNorm: row.financial_year_norm,
    approvedCostNorm: row.approved_cost_norm != null ? Number(row.approved_cost_norm) : null,
    projectStatusNorm: row.project_status_norm,
    fundingClass: row.funding_class,
    locationScope: row.location_scope,
    matchKey: row.match_key,
    duplicateGroupKey: row.duplicate_group_key,
    duplicateCountInFile: row.duplicate_count_in_file,
    matchProjectId: row.match_project_id,
    matchProjectName: row.match_project_name,
    matchScore: row.match_score != null ? Number(row.match_score) : null,
    matchMethod: row.match_method,
    matchIsTestProject: row.match_is_test_project === true,
    proposedAction: row.proposed_action,
    reviewNotes: row.review_notes,
    appliedProjectId: row.applied_project_id != null ? Number(row.applied_project_id) : null,
    appliedAt: row.applied_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toMatchingShape(row) {
  return {
    ...row,
    paymentStatusNorm: row.projectStatusNorm,
    remarksAmount: row.approvedCostNorm,
    remarksStatusText: null,
    impactRaw: null,
  };
}

async function replaceStagingBatch(importBatch, rows) {
  await ensureStagingSchema();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM compendium_project_import_staging WHERE import_batch = $1', [importBatch]);
    for (const row of rows) {
      await client.query(
        `
        INSERT INTO compendium_project_import_staging (
          import_batch, source_file, source_sheet, source_row_no,
          project_name, sub_county_raw, ward_raw, sub_location_raw, department_raw,
          financial_year_raw, approved_cost_raw, project_status_raw,
          sub_county_norm, ward_norm, sub_location_norm, department_norm,
          financial_year_norm, approved_cost_norm, project_status_norm, funding_class,
          location_scope, match_key, duplicate_group_key, duplicate_count_in_file,
          match_project_id, match_project_name, match_score, match_method, match_is_test_project,
          proposed_action, review_notes
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31
        )
        `,
        [
          row.importBatch, row.sourceFile, row.sourceSheet, row.sourceRowNo,
          row.projectName, row.subCountyRaw, row.wardRaw, row.subLocationRaw, row.departmentRaw,
          row.financialYearRaw, row.approvedCostRaw, row.projectStatusRaw,
          row.subCountyNorm, row.wardNorm, row.subLocationNorm, row.departmentNorm,
          row.financialYearNorm, row.approvedCostNorm, row.projectStatusNorm, row.fundingClass,
          row.locationScope, row.matchKey, row.duplicateGroupKey, row.duplicateCountInFile,
          row.matchProjectId, row.matchProjectName, row.matchScore, row.matchMethod, row.matchIsTestProject,
          row.proposedAction, row.reviewNotes,
        ]
      );
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function summarizeBatch(importBatch) {
  await ensureStagingSchema();
  const result = await pool.query(
    `
    SELECT proposed_action, COUNT(*)::int AS count
    FROM compendium_project_import_staging
    WHERE import_batch = $1
    GROUP BY proposed_action
    ORDER BY count DESC
    `,
    [importBatch]
  );
  return result.rows || [];
}

async function listBatches() {
  await ensureStagingSchema();
  const result = await pool.query(
    `
    SELECT
      import_batch AS "importBatch",
      MAX(source_file) AS "sourceFile",
      COUNT(*)::int AS "rowCount",
      MIN(created_at) AS "createdAt",
      MAX(updated_at) AS "updatedAt",
      COUNT(*) FILTER (WHERE proposed_action = 'insert')::int AS "insertCount",
      COUNT(*) FILTER (WHERE proposed_action = 'review')::int AS "reviewCount",
      COUNT(*) FILTER (WHERE match_project_id IS NOT NULL)::int AS "matchedCount",
      COUNT(*) FILTER (WHERE applied_project_id IS NOT NULL)::int AS "appliedCount",
      COUNT(*) FILTER (WHERE applied_project_id IS NULL)::int AS "notAppliedCount",
      COUNT(*) FILTER (WHERE proposed_action = 'insert' AND applied_project_id IS NULL)::int AS "insertReadyCount",
      COUNT(*) FILTER (WHERE funding_class = 'rri')::int AS "rriCount"
    FROM compendium_project_import_staging
    GROUP BY import_batch
    ORDER BY MAX(updated_at) DESC
    `
  );
  return result.rows || [];
}

function buildListWhere(importBatch, opts = {}) {
  const where = ['import_batch = $1'];
  const params = [importBatch];

  if (opts.proposedAction) {
    params.push(String(opts.proposedAction));
    where.push(`proposed_action = $${params.length}`);
  }
  if (opts.fundingClass) {
    params.push(String(opts.fundingClass));
    where.push(`funding_class = $${params.length}`);
  }
  if (opts.matchedOnly === true) {
    where.push('match_project_id IS NOT NULL');
  }
  if (opts.notAppliedOnly === true) {
    where.push('applied_project_id IS NULL');
  }
  if (opts.search) {
    params.push(`%${cleanText(opts.search)}%`);
    where.push(`(
      project_name ILIKE $${params.length}
      OR COALESCE(ward_norm, '') ILIKE $${params.length}
      OR COALESCE(sub_county_norm, '') ILIKE $${params.length}
      OR COALESCE(match_project_name, '') ILIKE $${params.length}
      OR COALESCE(financial_year_norm, '') ILIKE $${params.length}
    )`);
  }
  return { where, params };
}

async function listStagingRows(importBatch, opts = {}) {
  await ensureStagingSchema();
  const { where, params } = buildListWhere(importBatch, opts);

  const countResult = await pool.query(
    `SELECT COUNT(*)::int AS total FROM compendium_project_import_staging WHERE ${where.join(' AND ')}`,
    params
  );
  const total = countResult.rows?.[0]?.total ?? 0;

  const limit = Math.min(Math.max(Number(opts.limit) || 100, 1), 500);
  const offset = Math.max(Number(opts.offset) || 0, 0);
  params.push(limit, offset);

  const result = await pool.query(
    `
    SELECT *
    FROM compendium_project_import_staging
    WHERE ${where.join(' AND ')}
    ORDER BY source_row_no ASC
    LIMIT $${params.length - 1} OFFSET $${params.length}
    `,
    params
  );

  return {
    total,
    rows: (result.rows || []).map(mapStagingRow),
  };
}

async function listAllStagingRowsForExport(importBatch, opts = {}) {
  await ensureStagingSchema();
  const { where, params } = buildListWhere(importBatch, opts);
  const result = await pool.query(
    `
    SELECT *
    FROM compendium_project_import_staging
    WHERE ${where.join(' AND ')}
    ORDER BY source_row_no ASC
    `,
    params
  );
  return (result.rows || []).map(mapStagingRow);
}

async function stageRowsWithMatching(rows, importBatch, sourceFile) {
  let stagingRows = rows.map((row) => normalizeCompendiumRow(row, sourceFile, importBatch));
  const existing = await fetchExistingProjects();
  stagingRows = applyMatching(stagingRows.map(toMatchingShape), existing).map((matched, index) => ({
    ...stagingRows[index],
    matchProjectId: matched.matchProjectId,
    matchProjectName: matched.matchProjectName,
    matchScore: matched.matchScore,
    matchMethod: matched.matchMethod,
    matchIsTestProject: matched.matchIsTestProject,
    proposedAction: matched.proposedAction,
    reviewNotes: [stagingRows[index].reviewNotes, matched.reviewNotes].filter(Boolean).join('; ') || null,
    duplicateCountInFile: matched.duplicateCountInFile,
  }));

  const dupCounts = stagingRows.reduce((acc, row) => {
    acc[row.duplicateGroupKey] = (acc[row.duplicateGroupKey] || 0) + 1;
    return acc;
  }, {});
  for (const row of stagingRows) {
    row.duplicateCountInFile = dupCounts[row.duplicateGroupKey] || 1;
    if (row.duplicateCountInFile > 1) {
      row.reviewNotes = [row.reviewNotes, 'duplicate_name_ward_in_file'].filter(Boolean).join('; ');
      if (row.proposedAction === 'insert') row.proposedAction = 'review';
    }
  }
  return stagingRows;
}

module.exports = {
  DEFAULT_BATCH,
  DEFAULT_SOURCE,
  cleanText,
  normalizeCompendiumRow,
  stageRowsWithMatching,
  replaceStagingBatch,
  summarizeBatch,
  listBatches,
  listStagingRows,
  listAllStagingRowsForExport,
  mapStagingRow,
  ensureStagingSchema,
  buildListWhere,
};
