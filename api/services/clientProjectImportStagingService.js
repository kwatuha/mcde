const pool = require('../config/db');

const DEFAULT_BATCH = 'machakos-county-projectz-v1';
const DEFAULT_SOURCE = 'Machakos_County_projectz.xlsx';

const STD_SUBCOUNTIES = [
  'machakos', 'mavoko', 'yatta', 'matungulu', 'mwala',
  'masinga', 'kangundo', 'kathiani', 'kalama',
];

const COUNTY_WIDE_MARKERS = [
  'all', 'all wards', 'all sub counties', 'all sub-counties',
  'across the county', 'county main registry', 'county wide', 'countywide',
];

const PAYMENT_STATUS_MAP = {
  complete: 'Completed',
  completed: 'Completed',
  done: 'Completed',
  'fully paid': 'Completed',
  paid: 'Ongoing',
  'payment done': 'Completed',
  installed: 'Completed',
  commissioned: 'Completed',
  'project complete. handing over done.': 'Completed',
  'completed and handed over': 'Completed',
  'on going': 'Ongoing',
  ongoing: 'Ongoing',
  stalled: 'Stalled',
  'not paid': 'Not Started',
  'not payable': 'Cancelled',
};

const TEST_PROJECT_MARKERS = [
  'ward access road improvement',
  'ecde classroom construction',
  'health dispensary upgrade',
  'market drainage and paving',
  'borehole drilling and water kiosk',
  'solar street lighting installation',
  'cattle dip rehabilitation',
  'ward sports ground',
  'community ict hub',
  'maternity wing expansion',
  'solid waste collection',
  'public toilet and ablution',
  'smallholder irrigation scheme',
  'youth vocational training workshop',
  'bus park and stage',
  'ward office and service',
  'primary school sanitation upgrade',
  'rainwater harvesting infrastructure',
  'public health laboratory renovation',
  'footbridge construction',
  'sample gis',
  'escalation demo',
  'nimes',
  'test project',
  'demo project',
];

const DEPARTMENT_ALIASES = {
  'roads & transport': 'Roads & Transport',
  'roads and transport': 'Roads & Transport',
  'energy & electrification': 'Energy & Electrification',
  'water & irrigation': 'Water & Irrigation',
  'agriculture and food security': 'Agriculture and Food Security',
  ' agriculture and food security': 'Agriculture and Food Security',
  'livestock and fisheries development': 'Livestock and Fisheries Development',
  'lands & physical planning': 'Lands & Physical Planning',
  'climate change': 'Climate Change',
  'trade, industrialization & innovation': 'Trade, Industrialization & Innovation',
  'youth & sports': 'Youth & Sports',
  'education and ecde services': 'Education and ECDE Services',
  'ict & infrastructure': 'ICT & Infrastructure',
  'public works': 'Public Works',
  'tourism': 'Tourism',
  'public service': 'Public Service',
  'environment & natural resources': 'Environment & Natural Resources',
  'county administration & decentralized units': 'County Administration & Decentralized Units',
  'digital economy': 'Digital Economy',
  'sanitation': 'Sanitation',
  'vocational & skills training': 'Vocational & Skills Training',
  'sme': 'SME',
  'health': 'Health',
};

function cleanText(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .replace(/\n+/g, ' ')
    .trim();
}

function normKey(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function titleCaseWords(value) {
  return cleanText(value)
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

function normalizeSubcounty(raw) {
  const text = cleanText(raw);
  if (!text) return { norm: null, scope: 'missing' };

  const key = normKey(text);
  if (COUNTY_WIDE_MARKERS.includes(key)) {
    return { norm: null, scope: 'county_wide' };
  }
  if (key.includes('/') || key.includes(',') || key.includes('&') || key.includes(' and ')) {
    return { norm: null, scope: 'multi' };
  }

  for (const sc of STD_SUBCOUNTIES) {
    if (key === sc) return { norm: titleCaseWords(sc), scope: 'single' };
  }
  for (const sc of STD_SUBCOUNTIES) {
    if (key.startsWith(`${sc} `) || key.endsWith(` ${sc}`) || key.includes(` ${sc} `)) {
      return { norm: titleCaseWords(sc), scope: 'multi' };
    }
  }
  if (key.includes('machakos town') || key.includes('machakos central') || key === 'central mjini') {
    return { norm: 'Machakos', scope: 'single' };
  }
  return { norm: titleCaseWords(text), scope: 'unknown' };
}

function normalizeWard(raw) {
  const text = cleanText(raw);
  if (!text) return null;
  const aliases = {
    athiriver: 'Athi River',
    'athi river': 'Athi River',
    kinanie: 'Kinanie',
    mutituni: 'Mutituni',
    wamunyu: 'Wamunyu',
    ekalakala: 'Ekalakala',
  };
  const key = normKey(text);
  if (aliases[key]) return aliases[key];
  return titleCaseWords(text);
}

function normalizeDepartment(raw) {
  const text = cleanText(raw);
  if (!text) return null;
  const key = normKey(text);
  return DEPARTMENT_ALIASES[key] || titleCaseWords(text);
}

function normalizePaymentStatus(raw) {
  const text = cleanText(raw);
  if (!text) return null;
  const key = text.toLowerCase();
  if (PAYMENT_STATUS_MAP[key]) return PAYMENT_STATUS_MAP[key];
  if (/complete|done|paid|install|commission|handover/i.test(text)) return 'Completed';
  if (/ongoing|progress|awaiting|post hoisted/i.test(text)) return 'Ongoing';
  if (/stall/i.test(text)) return 'Stalled';
  if (/not paid|unpaid/i.test(text)) return 'Not Started';
  return 'review';
}

function parseRemarks(raw) {
  const text = cleanText(raw);
  if (!text) return { amount: null, statusText: null };
  const numeric = text.replace(/,/g, '');
  if (/^-?\d+(\.\d+)?$/.test(numeric)) {
    return { amount: Number(numeric), statusText: null };
  }
  if (/complete|ongoing|stalled|percent|launched|handover|handed/i.test(text)) {
    return { amount: null, statusText: text };
  }
  return { amount: null, statusText: text };
}

function buildMatchKey({ projectName, wardNorm, subcountyNorm, departmentNorm }) {
  return [normKey(projectName), normKey(wardNorm), normKey(subcountyNorm), normKey(departmentNorm)]
    .filter(Boolean)
    .join('|');
}

function buildDuplicateGroupKey({ projectName, wardNorm }) {
  return `${normKey(projectName)}|${normKey(wardNorm)}`;
}

function isTestProjectName(name) {
  const key = normKey(name);
  return TEST_PROJECT_MARKERS.some((m) => key.includes(normKey(m)));
}

function ratio(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const longer = a.length >= b.length ? a : b;
  const shorter = a.length >= b.length ? b : a;
  if (!longer.length) return 1;
  if (longer.includes(shorter) && shorter.length / longer.length >= 0.85) {
    return shorter.length / longer.length;
  }
  let matches = 0;
  const aTokens = new Set(a.split(' '));
  for (const t of b.split(' ')) {
    if (aTokens.has(t)) matches += 1;
  }
  const denom = Math.max(aTokens.size, b.split(' ').length);
  return denom ? matches / denom : 0;
}

async function ensureStagingSchema() {
  const DB_TYPE = process.env.DB_TYPE || 'postgresql';
  if (DB_TYPE !== 'postgresql') {
    throw new Error('client_project_import_staging requires PostgreSQL.');
  }
  await pool.query(`
    CREATE TABLE IF NOT EXISTS client_project_import_staging (
      id BIGSERIAL PRIMARY KEY,
      import_batch TEXT NOT NULL,
      source_file TEXT NOT NULL,
      source_row_no INTEGER NOT NULL,
      project_name TEXT NOT NULL,
      sub_county_raw TEXT NULL,
      ward_raw TEXT NULL,
      sub_location_raw TEXT NULL,
      department_raw TEXT NULL,
      impact_raw TEXT NULL,
      payment_status_raw TEXT NULL,
      remarks_raw TEXT NULL,
      sub_county_norm TEXT NULL,
      ward_norm TEXT NULL,
      sub_location_norm TEXT NULL,
      department_norm TEXT NULL,
      payment_status_norm TEXT NULL,
      location_scope TEXT NOT NULL DEFAULT 'single',
      remarks_amount NUMERIC(18, 2) NULL,
      remarks_status_text TEXT NULL,
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
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (import_batch, source_row_no)
    )
  `);
}

function normalizeStagingRow(row, sourceFile, importBatch) {
  const projectName = cleanText(row.projectName);
  const subCountyRaw = cleanText(row.subCounty);
  const wardRaw = cleanText(row.ward);
  const subLocationRaw = cleanText(row.subLocation);
  const departmentRaw = cleanText(row.department);
  const impactRaw = cleanText(row.impact);
  const paymentStatusRaw = cleanText(row.paymentStatus);
  const remarksRaw = cleanText(row.remarks);

  const subcounty = normalizeSubcounty(subCountyRaw);
  const wardNorm = normalizeWard(wardRaw);
  const subLocationNorm = subLocationRaw ? titleCaseWords(subLocationRaw) : null;
  const departmentNorm = normalizeDepartment(departmentRaw);
  const paymentStatusNorm = normalizePaymentStatus(paymentStatusRaw);
  const remarks = parseRemarks(remarksRaw);

  const locationScope = subcounty.scope === 'single' && !wardNorm && subcounty.norm
    ? 'single_missing_ward'
    : subcounty.scope;

  const matchKey = buildMatchKey({
    projectName,
    wardNorm,
    subcountyNorm: subcounty.norm,
    departmentNorm,
  });
  const duplicateGroupKey = buildDuplicateGroupKey({ projectName, wardNorm });

  const notes = [];
  if (!paymentStatusRaw) notes.push('payment_status_missing');
  if (paymentStatusNorm === 'review') notes.push('payment_status_unmapped');
  if (locationScope === 'multi' || locationScope === 'county_wide') notes.push(`location_${locationScope}`);
  if (locationScope === 'unknown') notes.push('subcounty_unrecognized');
  if (remarks.amount != null) notes.push('remarks_has_amount');
  if (remarks.statusText) notes.push('remarks_has_status_text');

  return {
    importBatch,
    sourceFile,
    sourceRowNo: row.sourceRowNo,
    projectName,
    subCountyRaw: subCountyRaw || null,
    wardRaw: wardRaw || null,
    subLocationRaw: subLocationRaw || null,
    departmentRaw: departmentRaw || null,
    impactRaw: impactRaw || null,
    paymentStatusRaw: paymentStatusRaw || null,
    remarksRaw: remarksRaw || null,
    subCountyNorm: subcounty.norm,
    wardNorm,
    subLocationNorm,
    departmentNorm,
    paymentStatusNorm,
    locationScope,
    remarksAmount: remarks.amount,
    remarksStatusText: remarks.statusText,
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

async function fetchExistingProjects() {
  const result = await pool.query(`
    SELECT
      p.project_id AS id,
      p.name,
      NULLIF(TRIM(p.location->>'subcounty'), '') AS subcounty,
      NULLIF(TRIM(p.location->>'ward'), '') AS ward,
      NULLIF(TRIM(p.state_department), '') AS department,
      COALESCE(p.voided, false) AS voided
    FROM projects p
    ORDER BY p.project_id ASC
  `);
  return (result.rows || []).map((row) => ({
    id: Number(row.id),
    name: cleanText(row.name),
    subcounty: cleanText(row.subcounty),
    ward: cleanText(row.ward),
    department: cleanText(row.department),
    voided: row.voided === true,
    normName: normKey(row.name),
    normWard: normKey(row.ward),
    normSubcounty: normKey(row.subcounty),
    isTest: isTestProjectName(row.name),
  }));
}

function scoreMatch(stagingRow, project) {
  if (!stagingRow.projectName || !project.name) return null;

  const nameKey = normKey(stagingRow.projectName);
  const exactName = nameKey === project.normName;
  const nameScore = ratio(nameKey, project.normName);

  const wardKey = normKey(stagingRow.wardNorm);
  const subcountyKey = normKey(stagingRow.subCountyNorm);
  const wardMatch = wardKey && project.normWard && wardKey === project.normWard;
  const subcountyMatch = subcountyKey && project.normSubcounty && subcountyKey === project.normSubcounty;

  if (exactName && wardMatch && subcountyMatch) {
    return { score: 1, method: 'exact_name_ward_subcounty' };
  }
  if (exactName && wardMatch) {
    return { score: 0.98, method: 'exact_name_ward' };
  }
  if (exactName && subcountyMatch && !wardKey) {
    return { score: 0.9, method: 'exact_name_subcounty_no_ward' };
  }
  if (nameScore >= 0.92 && wardMatch) {
    return { score: nameScore, method: 'fuzzy_name_ward' };
  }
  if (exactName && !wardKey && !subcountyKey) {
    return { score: 0.75, method: 'exact_name_only' };
  }
  return null;
}

function applyMatching(stagingRows, existingProjects) {
  const activeProjects = existingProjects.filter((p) => !p.voided);
  const usedProjectIds = new Set();

  for (const row of stagingRows) {
    let best = null;
    for (const project of activeProjects) {
      const scored = scoreMatch(row, project);
      if (!scored) continue;
      if (!best || scored.score > best.score) {
        best = { project, ...scored };
      }
    }

    if (best && best.score >= 0.98 && !usedProjectIds.has(best.project.id)) {
      row.matchProjectId = best.project.id;
      row.matchProjectName = best.project.name;
      row.matchScore = best.score;
      row.matchMethod = best.method;
      row.matchIsTestProject = best.project.isTest;
      row.proposedAction = best.project.isTest ? 'update_test_slot' : 'update';
      usedProjectIds.add(best.project.id);
      continue;
    }

    if (best && best.score >= 0.9) {
      row.matchProjectId = best.project.id;
      row.matchProjectName = best.project.name;
      row.matchScore = best.score;
      row.matchMethod = best.method;
      row.matchIsTestProject = best.project.isTest;
      row.proposedAction = 'review';
      row.reviewNotes = [row.reviewNotes, `possible_match_${best.method}`].filter(Boolean).join('; ');
      continue;
    }

    if (best && best.score >= 0.75) {
      row.matchProjectId = best.project.id;
      row.matchProjectName = best.project.name;
      row.matchScore = best.score;
      row.matchMethod = best.method;
      row.matchIsTestProject = best.project.isTest;
      row.proposedAction = 'review';
      row.reviewNotes = [row.reviewNotes, `weak_match_${best.method}`].filter(Boolean).join('; ');
      continue;
    }

    row.proposedAction = 'insert';
    row.reviewNotes = [row.reviewNotes, 'no_project_match'].filter(Boolean).join('; ');
  }

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
    if (row.locationScope === 'multi' || row.locationScope === 'county_wide') {
      if (row.proposedAction === 'insert') row.proposedAction = 'review';
    }
  }

  return stagingRows;
}

async function replaceStagingBatch(importBatch, rows) {
  await ensureStagingSchema();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM client_project_import_staging WHERE import_batch = $1', [importBatch]);
    for (const row of rows) {
      await client.query(
        `
        INSERT INTO client_project_import_staging (
          import_batch, source_file, source_row_no,
          project_name, sub_county_raw, ward_raw, sub_location_raw, department_raw,
          impact_raw, payment_status_raw, remarks_raw,
          sub_county_norm, ward_norm, sub_location_norm, department_norm, payment_status_norm,
          location_scope, remarks_amount, remarks_status_text,
          match_key, duplicate_group_key, duplicate_count_in_file,
          match_project_id, match_project_name, match_score, match_method, match_is_test_project,
          proposed_action, review_notes
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29
        )
        `,
        [
          row.importBatch, row.sourceFile, row.sourceRowNo,
          row.projectName, row.subCountyRaw, row.wardRaw, row.subLocationRaw, row.departmentRaw,
          row.impactRaw, row.paymentStatusRaw, row.remarksRaw,
          row.subCountyNorm, row.wardNorm, row.subLocationNorm, row.departmentNorm, row.paymentStatusNorm,
          row.locationScope, row.remarksAmount, row.remarksStatusText,
          row.matchKey, row.duplicateGroupKey, row.duplicateCountInFile,
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
    SELECT
      proposed_action,
      COUNT(*)::int AS count
    FROM client_project_import_staging
    WHERE import_batch = $1
    GROUP BY proposed_action
    ORDER BY count DESC
    `,
    [importBatch]
  );
  return result.rows || [];
}

function mapStagingRow(row) {
  return {
    id: row.id,
    importBatch: row.import_batch,
    sourceFile: row.source_file,
    sourceRowNo: row.source_row_no,
    projectName: row.project_name,
    subCountyRaw: row.sub_county_raw,
    wardRaw: row.ward_raw,
    subLocationRaw: row.sub_location_raw,
    departmentRaw: row.department_raw,
    impactRaw: row.impact_raw,
    paymentStatusRaw: row.payment_status_raw,
    remarksRaw: row.remarks_raw,
    subCountyNorm: row.sub_county_norm,
    wardNorm: row.ward_norm,
    subLocationNorm: row.sub_location_norm,
    departmentNorm: row.department_norm,
    paymentStatusNorm: row.payment_status_norm,
    locationScope: row.location_scope,
    remarksAmount: row.remarks_amount != null ? Number(row.remarks_amount) : null,
    remarksStatusText: row.remarks_status_text,
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
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
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
      COUNT(*) FILTER (WHERE proposed_action = 'update')::int AS "updateCount",
      COUNT(*) FILTER (WHERE proposed_action = 'update_test_slot')::int AS "updateTestCount",
      COUNT(*) FILTER (WHERE proposed_action = 'insert')::int AS "insertCount",
      COUNT(*) FILTER (WHERE proposed_action = 'review')::int AS "reviewCount",
      COUNT(*) FILTER (WHERE match_project_id IS NOT NULL)::int AS "matchedCount"
    FROM client_project_import_staging
    GROUP BY import_batch
    ORDER BY MAX(updated_at) DESC
    `
  );
  return result.rows || [];
}

async function listStagingRows(importBatch, opts = {}) {
  await ensureStagingSchema();
  const where = ['import_batch = $1'];
  const params = [importBatch];

  if (opts.proposedAction) {
    params.push(String(opts.proposedAction));
    where.push(`proposed_action = $${params.length}`);
  }
  if (opts.matchedOnly === true) {
    where.push('match_project_id IS NOT NULL');
  }
  if (opts.search) {
    params.push(`%${cleanText(opts.search)}%`);
    where.push(`(
      project_name ILIKE $${params.length}
      OR COALESCE(ward_norm, '') ILIKE $${params.length}
      OR COALESCE(sub_county_norm, '') ILIKE $${params.length}
      OR COALESCE(match_project_name, '') ILIKE $${params.length}
    )`);
  }

  const countResult = await pool.query(
    `SELECT COUNT(*)::int AS total FROM client_project_import_staging WHERE ${where.join(' AND ')}`,
    params
  );
  const total = countResult.rows?.[0]?.total ?? 0;

  const limit = Math.min(Math.max(Number(opts.limit) || 100, 1), 500);
  const offset = Math.max(Number(opts.offset) || 0, 0);
  params.push(limit, offset);

  const result = await pool.query(
    `
    SELECT *
    FROM client_project_import_staging
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
  const where = ['import_batch = $1'];
  const params = [importBatch];

  if (opts.proposedAction) {
    params.push(String(opts.proposedAction));
    where.push(`proposed_action = $${params.length}`);
  }
  if (opts.matchedOnly === true) {
    where.push('match_project_id IS NOT NULL');
  }
  if (opts.search) {
    params.push(`%${cleanText(opts.search)}%`);
    where.push(`(
      project_name ILIKE $${params.length}
      OR COALESCE(ward_norm, '') ILIKE $${params.length}
      OR COALESCE(sub_county_norm, '') ILIKE $${params.length}
      OR COALESCE(match_project_name, '') ILIKE $${params.length}
    )`);
  }

  const result = await pool.query(
    `
    SELECT *
    FROM client_project_import_staging
    WHERE ${where.join(' AND ')}
    ORDER BY source_row_no ASC
    `,
    params
  );
  return (result.rows || []).map(mapStagingRow);
}

async function loadStagingFromReviewCsv(filePath, opts = {}) {
  const fs = require('fs');
  const csv = require('csv-parser');
  const importBatch = opts.batch || DEFAULT_BATCH;
  const sourceFile = opts.source || DEFAULT_SOURCE;
  const rematch = opts.rematch === true;

  if (!fs.existsSync(filePath)) {
    throw new Error(`CSV not found: ${filePath}`);
  }

  const records = await new Promise((resolve, reject) => {
    const rows = [];
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (row) => rows.push(row))
      .on('end', () => resolve(rows))
      .on('error', reject);
  });

  let stagingRows = records
    .map((record) => {
      const projectName = cleanText(record.project_name);
      if (!projectName) return null;

      const subCountyNorm = cleanText(record.sub_county_norm) || null;
      const wardNorm = cleanText(record.ward_norm) || null;
      const subLocationNorm = cleanText(record.sub_location_norm) || null;
      const departmentNorm = cleanText(record.department_norm) || null;
      const paymentStatusRaw = cleanText(record.payment_status_raw) || null;
      const paymentStatusNorm = cleanText(record.payment_status_norm) || null;
      const locationScope = cleanText(record.location_scope) || 'single';
      const remarksAmountRaw = cleanText(record.remarks_amount);
      const remarksAmount = remarksAmountRaw && /^-?\d+(\.\d+)?$/.test(remarksAmountRaw.replace(/,/g, ''))
        ? Number(remarksAmountRaw.replace(/,/g, ''))
        : null;
      const remarksStatusText = cleanText(record.remarks_status_text) || null;
      const duplicateCountInFile = Number(record.duplicate_count_in_file) || 1;
      const matchProjectIdRaw = cleanText(record.match_project_id);
      const matchProjectId = matchProjectIdRaw && Number.isFinite(Number(matchProjectIdRaw))
        ? Number(matchProjectIdRaw)
        : null;
      const matchScoreRaw = cleanText(record.match_score);
      const matchScore = matchScoreRaw && Number.isFinite(Number(matchScoreRaw))
        ? Number(matchScoreRaw)
        : null;
      const matchIsTestProject = String(record.match_is_test_project || '').toLowerCase() === 'true';
      const proposedAction = cleanText(record.proposed_action) || 'review';
      const reviewNotes = cleanText(record.review_notes) || null;
      const sourceRowNo = Number(record.source_row_no) || 0;

      const matchKey = buildMatchKey({
        projectName,
        wardNorm,
        subcountyNorm: subCountyNorm,
        departmentNorm,
      });
      const duplicateGroupKey = buildDuplicateGroupKey({ projectName, wardNorm });

      return {
        importBatch,
        sourceFile,
        sourceRowNo,
        projectName,
        subCountyRaw: subCountyNorm,
        wardRaw: wardNorm,
        subLocationRaw: subLocationNorm,
        departmentRaw: departmentNorm,
        impactRaw: null,
        paymentStatusRaw,
        remarksRaw: remarksStatusText || (remarksAmount != null ? String(remarksAmount) : null),
        subCountyNorm,
        wardNorm,
        subLocationNorm,
        departmentNorm,
        paymentStatusNorm,
        locationScope,
        remarksAmount,
        remarksStatusText,
        matchKey,
        duplicateGroupKey,
        duplicateCountInFile,
        matchProjectId,
        matchProjectName: cleanText(record.match_project_name) || null,
        matchScore,
        matchMethod: cleanText(record.match_method) || null,
        matchIsTestProject,
        proposedAction,
        reviewNotes,
      };
    })
    .filter(Boolean);

  if (rematch && stagingRows.length) {
    const existing = await fetchExistingProjects();
    stagingRows = applyMatching(stagingRows, existing);
  }

  return stagingRows;
}

module.exports = {
  DEFAULT_BATCH,
  DEFAULT_SOURCE,
  cleanText,
  normKey,
  normalizeStagingRow,
  applyMatching,
  fetchExistingProjects,
  replaceStagingBatch,
  summarizeBatch,
  listBatches,
  listStagingRows,
  listAllStagingRowsForExport,
  mapStagingRow,
  ensureStagingSchema,
  isTestProjectName,
  loadStagingFromReviewCsv,
};
