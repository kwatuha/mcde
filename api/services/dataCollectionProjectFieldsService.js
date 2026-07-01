const pool = require('../config/db');

const PROJECT_FIELD_SOURCES = new Set(['project_milestones', 'project_bq_items', 'indicator']);
const SUBJECT_TYPES = new Set(['project', 'rri_programme']);

function isProjectFieldSource(source) {
  return PROJECT_FIELD_SOURCES.has(String(source || '').trim());
}

function normalizeSubjectType(value) {
  const v = String(value || 'project').trim().toLowerCase();
  return SUBJECT_TYPES.has(v) ? v : 'project';
}

async function fetchProjectIndicators(projectId) {
  const pid = parseInt(String(projectId), 10);
  if (!Number.isFinite(pid)) return [];
  const sql = `
    SELECT
      l.id AS "linkId",
      a.id AS "activityId",
      i.id AS "indicatorId",
      i.name AS "indicatorName",
      a.activity_code AS "activityCode",
      a.activity_name AS "activityName",
      mt.label AS "measurementTypeLabel",
      TRIM(CONCAT(i.name, ' — ', COALESCE(a.activity_name, a.activity_code, ''))) AS label
    FROM project_planning_activity_links l
    INNER JOIN planning_project_activities a ON a.id = l.planning_activity_id AND COALESCE(a.voided, false) = false
    INNER JOIN planning_indicators i ON i.id = a.indicator_id AND COALESCE(i.voided, false) = false
    LEFT JOIN planning_measurement_types mt ON mt.id = i.measurement_type_id AND COALESCE(mt.voided, false) = false
    WHERE l.project_id = $1 AND COALESCE(l.voided, false) = false
    ORDER BY a.activity_code ASC NULLS LAST, i.name ASC
  `;
  try {
    const r = await pool.query(sql, [pid]);
    return (r.rows || []).map((row) => ({
      id: Number(row.linkId),
      label: String(row.label || row.indicatorName || `Indicator #${row.indicatorId}`).trim(),
      indicatorId: Number(row.indicatorId),
      activityId: Number(row.activityId),
      indicatorName: row.indicatorName,
      activityCode: row.activityCode,
      activityName: row.activityName,
      measurementTypeLabel: row.measurementTypeLabel,
      meta: { type: 'indicator', scope: 'project' },
    }));
  } catch (e) {
    if (!/does not exist|relation/i.test(e.message || '')) throw e;
    return [];
  }
}

async function fetchRriProgrammeIndicators(rriProgrammeId) {
  const rid = parseInt(String(rriProgrammeId), 10);
  if (!Number.isFinite(rid)) return [];
  const sql = `
    SELECT DISTINCT ON (i.id, a.id)
      l.id AS "linkId",
      a.id AS "activityId",
      i.id AS "indicatorId",
      i.name AS "indicatorName",
      a.activity_code AS "activityCode",
      a.activity_name AS "activityName",
      mt.label AS "measurementTypeLabel",
      p.project_id AS "projectId",
      TRIM(CONCAT(i.name, ' — ', COALESCE(a.activity_name, a.activity_code, ''))) AS label
    FROM rri_programme_projects rpp
    INNER JOIN projects p ON p.project_id = rpp.project_id AND COALESCE(p.voided, false) = false
    INNER JOIN project_planning_activity_links l ON l.project_id = p.project_id AND COALESCE(l.voided, false) = false
    INNER JOIN planning_project_activities a ON a.id = l.planning_activity_id AND COALESCE(a.voided, false) = false
    INNER JOIN planning_indicators i ON i.id = a.indicator_id AND COALESCE(i.voided, false) = false
    LEFT JOIN planning_measurement_types mt ON mt.id = i.measurement_type_id AND COALESCE(mt.voided, false) = false
    WHERE rpp.rri_programme_id = $1 AND COALESCE(rpp.voided, false) = false
    ORDER BY i.id, a.id, a.activity_code ASC NULLS LAST
  `;
  try {
    const r = await pool.query(sql, [rid]);
    return (r.rows || []).map((row) => ({
      id: Number(row.linkId),
      label: String(row.label || row.indicatorName || `Indicator #${row.indicatorId}`).trim(),
      indicatorId: Number(row.indicatorId),
      activityId: Number(row.activityId),
      indicatorName: row.indicatorName,
      activityCode: row.activityCode,
      activityName: row.activityName,
      measurementTypeLabel: row.measurementTypeLabel,
      projectId: row.projectId != null ? Number(row.projectId) : null,
      meta: { type: 'indicator', scope: 'rri_programme' },
    }));
  } catch (e) {
    if (!/does not exist|relation/i.test(e.message || '')) throw e;
    return [];
  }
}

async function fetchProjectMilestones(projectId) {
  const pid = parseInt(String(projectId), 10);
  if (!Number.isFinite(pid)) return [];
  const queries = [
    `
    SELECT milestone_id AS id,
           milestone_name AS label,
           activity_name AS "activityName",
           COALESCE(sequence_order, 9999) AS "sortOrder"
    FROM project_milestones
    WHERE project_id = $1 AND COALESCE(voided, false) = false
    ORDER BY sequence_order ASC NULLS LAST, milestone_id ASC
    `,
    `
    SELECT milestone_id AS id,
           milestone_name AS label,
           activity_name AS "activityName",
           COALESCE(sequence_order, 9999) AS "sortOrder"
    FROM project_milestones
    WHERE project_id = $1
    ORDER BY sequence_order ASC NULLS LAST, milestone_id ASC
    `,
  ];
  for (const sql of queries) {
    try {
      const r = await pool.query(sql, [pid]);
      return (r.rows || []).map((row) => ({
        id: Number(row.id),
        label: String(row.label || row.activityName || `Milestone #${row.id}`).trim(),
        activityName: row.activityName || null,
        meta: { type: 'project_milestones' },
      }));
    } catch (e) {
      if (!/voided|does not exist|column/i.test(e.message || '')) throw e;
    }
  }
  return [];
}

async function fetchProjectBqItems(projectId) {
  const pid = parseInt(String(projectId), 10);
  if (!Number.isFinite(pid)) return [];
  const r = await pool.query(
    `
    SELECT id,
           activity_name AS label,
           milestone_name AS "milestoneName",
           unit_of_measure AS "unitOfMeasure",
           COALESCE(progress_percent, 0) AS "progressPercent",
           COALESCE(sort_order, 0) AS "sortOrder"
    FROM project_bq_items
    WHERE project_id = $1 AND COALESCE(voided, false) = false
    ORDER BY sort_order ASC NULLS LAST, id ASC
    `,
    [pid]
  );
  return (r.rows || []).map((row) => {
    const activity = String(row.label || '').trim();
    const milestone = String(row.milestoneName || '').trim();
    const label = milestone && activity ? `${milestone} — ${activity}` : activity || milestone || `BQ #${row.id}`;
    return {
      id: Number(row.id),
      label,
      milestoneName: row.milestoneName || null,
      unitOfMeasure: row.unitOfMeasure || null,
      progressPercent: row.progressPercent != null ? Number(row.progressPercent) : null,
      meta: { type: 'project_bq_items' },
    };
  });
}

async function fetchProjectFieldOptions(source, projectId) {
  if (!isProjectFieldSource(source)) {
    return { source, projectId, options: [] };
  }
  const options =
    source === 'project_milestones'
      ? await fetchProjectMilestones(projectId)
      : source === 'indicator'
        ? await fetchProjectIndicators(projectId)
        : await fetchProjectBqItems(projectId);
  return {
    source,
    subjectType: 'project',
    projectId: parseInt(String(projectId), 10),
    options,
  };
}

async function fetchFieldOptions({ source, subjectType, projectId, rriProgrammeId }) {
  const src = String(source || '').trim();
  if (!isProjectFieldSource(src)) {
    return { source: src, subjectType, options: [] };
  }
  const st = normalizeSubjectType(subjectType);
  if (src === 'indicator') {
    if (st === 'rri_programme') {
      const rid = parseInt(String(rriProgrammeId), 10);
      const options = Number.isFinite(rid) ? await fetchRriProgrammeIndicators(rid) : [];
      return { source: src, subjectType: st, rriProgrammeId: rid, options };
    }
    const pid = parseInt(String(projectId), 10);
    const options = Number.isFinite(pid) ? await fetchProjectIndicators(pid) : [];
    return { source: src, subjectType: 'project', projectId: pid, options };
  }
  if (st !== 'project') {
    return { source: src, subjectType: st, options: [] };
  }
  return fetchProjectFieldOptions(src, projectId);
}

module.exports = {
  PROJECT_FIELD_SOURCES,
  SUBJECT_TYPES,
  isProjectFieldSource,
  normalizeSubjectType,
  fetchFieldOptions,
  fetchProjectFieldOptions,
  fetchProjectMilestones,
  fetchProjectBqItems,
  fetchProjectIndicators,
  fetchRriProgrammeIndicators,
};
