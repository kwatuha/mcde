const pool = require('../config/db');

const DB_TYPE = process.env.DB_TYPE || 'mysql';
const isPostgres = DB_TYPE === 'postgresql';

const RESULT_LEVELS = new Set(['output', 'outcome', 'impact']);
const OUTCOME_STATUSES = new Set([
  'enrolled',
  'receiving_benefit',
  'benefit_realized',
  'no_benefit',
  'exited',
  'unknown',
]);

let schemaEnsured = false;

async function ensureImpactSchema() {
  if (!isPostgres || schemaEnsured) return;
  await pool.query(`ALTER TABLE planning_indicators ADD COLUMN IF NOT EXISTS result_level TEXT NULL`);
  await pool.query(`ALTER TABLE project_evaluations ADD COLUMN IF NOT EXISTS reporting_period TEXT NULL`);
  await pool.query(`ALTER TABLE project_evaluations ADD COLUMN IF NOT EXISTS result_level TEXT NULL`);
  await pool.query(`ALTER TABLE project_evaluations ADD COLUMN IF NOT EXISTS remarks TEXT NULL`);
  await pool.query(`ALTER TABLE beneficiaries ADD COLUMN IF NOT EXISTS outcome_status TEXT NULL`);
  await pool.query(`ALTER TABLE beneficiaries ADD COLUMN IF NOT EXISTS outcome_notes TEXT NULL`);
  await pool.query(`ALTER TABLE beneficiaries ADD COLUMN IF NOT EXISTS outcome_updated_at TIMESTAMPTZ NULL`);
  schemaEnsured = true;
}

function normalizeResultLevel(value, fallback = 'output') {
  const v = String(value || '').trim().toLowerCase();
  if (RESULT_LEVELS.has(v)) return v;
  return fallback;
}

function normalizeOutcomeStatus(value) {
  const v = String(value || '').trim().toLowerCase();
  if (!v) return null;
  if (OUTCOME_STATUSES.has(v)) return v;
  return 'unknown';
}

function emptyImpactSummary() {
  return {
    evaluationLines: 0,
    outcomeLines: 0,
    projectsWithEvaluations: 0,
    avgPerformanceScore: null,
    avgOutcomeScore: null,
    targetSum: 0,
    achievedSum: 0,
    achievementPercent: null,
    beneficiaries: 0,
    beneficiariesBenefitRealized: 0,
    communityVisits: 0,
    communityBenefitYes: 0,
    communityAccessImprovedYes: 0,
    communityAvgSentimentSupportive: null,
  };
}

/**
 * Aggregate evaluation + beneficiary + visit impact signals for a set of project IDs.
 * @param {number[]} projectIds
 */
async function summarizeImpactForProjects(projectIds = []) {
  await ensureImpactSchema();
  const ids = [...new Set((projectIds || []).map(Number).filter(Number.isFinite))];
  if (!ids.length || !isPostgres) return emptyImpactSummary();

  const [evalResult, beneficiaryResult, visitResult] = await Promise.all([
    pool.query(
      `
      SELECT
        COUNT(*)::int AS evaluation_lines,
        COUNT(*) FILTER (
          WHERE lower(COALESCE(result_level, 'output')) IN ('outcome', 'impact')
        )::int AS outcome_lines,
        COUNT(DISTINCT project_id)::int AS projects_with_evaluations,
        ROUND(AVG(performance_score)::numeric, 1) AS avg_performance_score,
        ROUND(
          AVG(performance_score) FILTER (
            WHERE lower(COALESCE(result_level, 'output')) IN ('outcome', 'impact')
          )::numeric,
          1
        ) AS avg_outcome_score,
        COALESCE(SUM(milestone_value), 0)::numeric AS target_sum,
        COALESCE(SUM(achieved_value), 0)::numeric AS achieved_sum
      FROM project_evaluations
      WHERE COALESCE(voided, false) = false
        AND project_id = ANY($1::bigint[])
      `,
      [ids]
    ).catch(() => ({ rows: [{}] })),
    pool.query(
      `
      SELECT
        COUNT(*)::int AS beneficiaries,
        COUNT(*) FILTER (
          WHERE lower(COALESCE(outcome_status, '')) = 'benefit_realized'
        )::int AS beneficiaries_benefit_realized
      FROM beneficiaries
      WHERE COALESCE(voided, false) = false
        AND project_id = ANY($1::bigint[])
      `,
      [ids]
    ).catch(() => ({ rows: [{}] })),
    pool.query(
      `
      SELECT
        COUNT(*)::int AS community_visits,
        COUNT(*) FILTER (
          WHERE lower(COALESCE(answers->'community_benefit_realized'->>'value', answers->>'community_benefit_realized', '')) IN ('yes', 'true')
             OR lower(COALESCE(answers->>'community_benefit_realized', '')) = 'yes'
        )::int AS community_benefit_yes,
        COUNT(*) FILTER (
          WHERE lower(COALESCE(answers->>'community_access_improved', '')) = 'yes'
        )::int AS community_access_improved_yes
      FROM data_collection_submissions
      WHERE COALESCE(voided, false) = false
        AND project_id = ANY($1::bigint[])
        AND (
          answers ? 'community_benefit_realized'
          OR answers ? 'community_access_improved'
          OR answers ? 'community_sentiment'
        )
      `,
      [ids]
    ).catch(() => ({ rows: [{}] })),
  ]);

  const ev = evalResult.rows?.[0] || {};
  const ben = beneficiaryResult.rows?.[0] || {};
  const vis = visitResult.rows?.[0] || {};
  const targetSum = Number(ev.target_sum || 0);
  const achievedSum = Number(ev.achieved_sum || 0);

  return {
    evaluationLines: Number(ev.evaluation_lines || 0),
    outcomeLines: Number(ev.outcome_lines || 0),
    projectsWithEvaluations: Number(ev.projects_with_evaluations || 0),
    avgPerformanceScore: ev.avg_performance_score != null ? Number(ev.avg_performance_score) : null,
    avgOutcomeScore: ev.avg_outcome_score != null ? Number(ev.avg_outcome_score) : null,
    targetSum,
    achievedSum,
    achievementPercent: targetSum > 0 ? Math.round((achievedSum / targetSum) * 1000) / 10 : null,
    beneficiaries: Number(ben.beneficiaries || 0),
    beneficiariesBenefitRealized: Number(ben.beneficiaries_benefit_realized || 0),
    communityVisits: Number(vis.community_visits || 0),
    communityBenefitYes: Number(vis.community_benefit_yes || 0),
    communityAccessImprovedYes: Number(vis.community_access_improved_yes || 0),
  };
}

/**
 * Map programmeId -> impact summary given rows of { key, projectId }.
 * @param {Array<{ key: string|number, projectId: number }>} links
 */
async function summarizeImpactByGroup(links = []) {
  await ensureImpactSchema();
  const groups = new Map();
  for (const link of links) {
    const key = link?.key;
    const projectId = Number(link?.projectId);
    if (key == null || !Number.isFinite(projectId)) continue;
    if (!groups.has(String(key))) groups.set(String(key), []);
    groups.get(String(key)).push(projectId);
  }

  const out = {};
  await Promise.all(
    [...groups.entries()].map(async ([key, projectIds]) => {
      out[key] = await summarizeImpactForProjects(projectIds);
    })
  );
  return out;
}

module.exports = {
  RESULT_LEVELS: [...RESULT_LEVELS],
  OUTCOME_STATUSES: [...OUTCOME_STATUSES],
  ensureImpactSchema,
  normalizeResultLevel,
  normalizeOutcomeStatus,
  emptyImpactSummary,
  summarizeImpactForProjects,
  summarizeImpactByGroup,
};
