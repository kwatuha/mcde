const pool = require('../config/db');
const staging = require('./compendiumProjectImportStagingService');

const DEFAULT_PUBLIC_ENGAGEMENT = {
  approved_for_public: false,
  approved_by: null,
  approved_at: null,
  approval_notes: null,
  revision_requested: false,
  revision_notes: null,
  revision_requested_by: null,
  revision_requested_at: null,
  revision_submitted_at: null,
  feedback_enabled: true,
};

const DEFAULT_IS_PUBLIC = {
  approved: false,
  approved_by: null,
  approved_at: null,
  approval_notes: null,
  revision_requested: false,
  revision_notes: null,
  revision_requested_by: null,
  revision_requested_at: null,
  revision_submitted_at: null,
};

async function ensureAppliedColumns() {
  await staging.ensureStagingSchema();
}

function mapStatusToProgress(statusNorm) {
  const value = String(statusNorm || '').trim();
  if (!value || value === 'review') return 'Not Started';
  if (['Completed', 'Ongoing', 'Stalled', 'Not Started', 'Cancelled'].includes(value)) return value;
  return 'Not Started';
}

function buildProjectInsertParams(row, userId) {
  const status = mapStatusToProgress(row.projectStatusNorm);
  const timeline = JSON.stringify({
    start_date: null,
    expected_completion_date: null,
    financial_year: row.financialYearNorm || null,
  });
  const budget = JSON.stringify({
    allocated_amount_kes: row.approvedCostNorm != null ? Number(row.approvedCostNorm) : 0,
    disbursed_amount_kes: 0,
    contracted: null,
    budget_id: null,
    source: row.fundingClass === 'rri' ? 'RRI' : 'Development',
  });
  const progress = JSON.stringify({
    status,
    status_reason: row.projectStatusRaw || null,
    percentage_complete: status === 'Completed' ? 100 : 0,
    latest_update_summary: row.projectStatusRaw || null,
  });
  const notes = JSON.stringify({
    compendium_import_batch: row.importBatch,
    compendium_row_no: row.sourceRowNo,
    compendium_source_sheet: row.sourceSheet,
    funding_class: row.fundingClass || 'development',
  });
  const dataSources = JSON.stringify({
    compendium_import_batch: row.importBatch,
    compendium_row_no: row.sourceRowNo,
    compendium_source_sheet: row.sourceSheet,
    source_file: row.sourceFile,
    created_by_user_id: userId,
  });
  const location = JSON.stringify({
    county: 'Machakos',
    subcounty: row.subCountyNorm || null,
    constituency: row.subCountyNorm || null,
    ward: row.wardNorm || null,
    sublocation: row.subLocationNorm || null,
    village: null,
    geocoordinates: { lat: null, lng: null },
  });

  return [
    row.projectName,
    null,
    null,
    null,
    'Machakos County Executive',
    row.departmentNorm || null,
    null,
    timeline,
    budget,
    progress,
    notes,
    dataSources,
    JSON.stringify(DEFAULT_PUBLIC_ENGAGEMENT),
    location,
    JSON.stringify(DEFAULT_IS_PUBLIC),
  ];
}

async function insertProjectFromStagingRow(row, userId) {
  const params = buildProjectInsertParams(row, userId);
  const result = await pool.query(
    `
    INSERT INTO projects (
      name, description, implementing_agency, sector, ministry, state_department, category_id,
      timeline, budget, progress, notes, data_sources, public_engagement, location,
      is_public, created_at, updated_at, voided
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7,
      $8::jsonb, $9::jsonb, $10::jsonb, $11::jsonb, $12::jsonb, $13::jsonb, $14::jsonb, $15::jsonb,
      CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, false
    )
    RETURNING project_id
    `,
    params
  );
  return Number(result.rows[0].project_id);
}

async function markStagingRowApplied(stagingId, projectId) {
  await pool.query(
    `
    UPDATE compendium_project_import_staging
    SET applied_project_id = $1,
        applied_at = NOW(),
        updated_at = NOW(),
        review_notes = CASE
          WHEN review_notes IS NULL OR review_notes = '' THEN 'applied_as_new_project'
          WHEN review_notes LIKE '%applied_as_new_project%' THEN review_notes
          ELSE review_notes || '; applied_as_new_project'
        END
    WHERE id = $2
    `,
    [projectId, stagingId]
  );
}

async function fetchStagingRowsByIds(importBatch, stagingIds = []) {
  await ensureAppliedColumns();
  const ids = [...new Set(stagingIds.map((id) => Number(id)).filter(Number.isFinite))];
  if (!ids.length) return [];
  const result = await pool.query(
    `
    SELECT *
    FROM compendium_project_import_staging
    WHERE import_batch = $1 AND id = ANY($2::bigint[])
    ORDER BY source_row_no ASC
    `,
    [importBatch, ids]
  );
  return (result.rows || []).map(staging.mapStagingRow);
}

async function fetchInsertReadyRows(importBatch, opts = {}) {
  await ensureAppliedColumns();
  const { where, params } = staging.buildListWhere(importBatch, {
    ...opts,
    proposedAction: 'insert',
    notAppliedOnly: true,
  });
  const result = await pool.query(
    `
    SELECT *
    FROM compendium_project_import_staging
    WHERE ${where.join(' AND ')}
    ORDER BY source_row_no ASC
    `,
    params
  );
  return (result.rows || []).map(staging.mapStagingRow);
}

async function countInsertReadyRows(importBatch) {
  await ensureAppliedColumns();
  const result = await pool.query(
    `
    SELECT COUNT(*)::int AS count
    FROM compendium_project_import_staging
    WHERE import_batch = $1
      AND proposed_action = 'insert'
      AND applied_project_id IS NULL
    `,
    [importBatch]
  );
  return result.rows?.[0]?.count ?? 0;
}

async function applyInsertStagingRows(importBatch, opts = {}, userId) {
  await ensureAppliedColumns();

  let rows = [];
  if (opts.selectAllInsert === true) {
    rows = await fetchInsertReadyRows(importBatch, { search: opts.search, fundingClass: opts.fundingClass });
  } else {
    rows = await fetchStagingRowsByIds(importBatch, opts.stagingIds);
  }

  const summary = {
    requested: rows.length,
    created: [],
    skipped: [],
    errors: [],
  };

  for (const row of rows) {
    if (row.appliedProjectId) {
      summary.skipped.push({
        stagingId: row.id,
        sourceRowNo: row.sourceRowNo,
        reason: 'already_applied',
        projectId: row.appliedProjectId,
      });
      continue;
    }
    if (row.proposedAction !== 'insert') {
      summary.skipped.push({
        stagingId: row.id,
        sourceRowNo: row.sourceRowNo,
        reason: 'not_insert_action',
        proposedAction: row.proposedAction,
      });
      continue;
    }

    try {
      const projectId = await insertProjectFromStagingRow(row, userId);
      await markStagingRowApplied(row.id, projectId);
      summary.created.push({
        stagingId: row.id,
        sourceRowNo: row.sourceRowNo,
        projectId,
        projectName: row.projectName,
      });
    } catch (error) {
      summary.errors.push({
        stagingId: row.id,
        sourceRowNo: row.sourceRowNo,
        projectName: row.projectName,
        error: error.message,
      });
    }
  }

  summary.insertReadyRemaining = await countInsertReadyRows(importBatch);
  return summary;
}

module.exports = {
  applyInsertStagingRows,
  countInsertReadyRows,
  fetchInsertReadyRows,
  ensureAppliedColumns,
};
