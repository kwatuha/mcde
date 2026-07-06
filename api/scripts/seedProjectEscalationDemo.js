#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Seed demo data for project escalation rules.
 *
 * Picks existing active test projects, adjusts milestones/budget/status/etc. so
 * multiple escalation rules fire, runs the evaluation engine, and prints a summary.
 *
 * Usage:
 *   node api/scripts/seedProjectEscalationDemo.js
 *   npm run seed:project-escalation-demo
 *
 * Remote (PostgreSQL only, no Node):
 *   psql -h HOST -p PORT -U USER -d DBNAME -f api/migrations/20260705_seed_project_escalation_demo.sql
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const pool = require('../config/db');
const { ensureProjectEscalationTables } = require('../services/projectEscalationSchema');
const { evaluateAllRules, processTimeEscalations } = require('../services/projectEscalationEngine');

const DEMO_TAG = 'escalation-demo';
const DAYS = (n) => n;

function rows(r) {
  return r?.rows || [];
}

function first(r) {
  return rows(r)[0] || null;
}

function isoDateOffset(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

async function pickDemoProjects(limit = 8) {
  const preferred = rows(await pool.query(
    `
    SELECT project_id AS id, name
    FROM projects
    WHERE COALESCE(voided, false) = false
      AND COALESCE(progress->>'status', '') NOT ILIKE '%complete%'
      AND (
        name ILIKE '%GIS DEMO%'
        OR name ILIKE '%test%'
        OR name ILIKE '%demo%'
        OR name ILIKE '%sample%'
      )
    ORDER BY project_id ASC
    LIMIT $1
    `,
    [limit]
  ));

  if (preferred.length >= 4) return preferred;

  const fallback = rows(await pool.query(
    `
    SELECT project_id AS id, name
    FROM projects
    WHERE COALESCE(voided, false) = false
      AND COALESCE(progress->>'status', '') NOT ILIKE '%complete%'
    ORDER BY project_id ASC
    LIMIT $1
    `,
    [limit]
  ));

  const seen = new Set();
  return [...preferred, ...fallback].filter((p) => {
    if (seen.has(p.id)) return false;
    seen.add(p.id);
    return true;
  }).slice(0, limit);
}

async function ensureInspectionTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS project_inspections (
      inspection_id SERIAL PRIMARY KEY,
      project_id INTEGER NOT NULL,
      inspection_date DATE NOT NULL,
      findings TEXT NULL,
      warnings TEXT NULL,
      recommendations TEXT NULL,
      created_by INTEGER NULL,
      created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      voided BOOLEAN NOT NULL DEFAULT FALSE
    )
  `);
}

async function ensureEvaluationTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS project_evaluations (
      id BIGSERIAL PRIMARY KEY,
      project_id BIGINT NOT NULL,
      evaluation_date DATE NULL,
      performance_score NUMERIC NULL,
      voided BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function ensureMilestoneTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS project_milestones (
      milestone_id BIGSERIAL PRIMARY KEY,
      project_id BIGINT NOT NULL,
      milestone_name TEXT NOT NULL,
      description TEXT NULL,
      due_date DATE NULL,
      completed BOOLEAN NOT NULL DEFAULT FALSE,
      completed_date DATE NULL,
      sequence_order INTEGER NULL,
      progress NUMERIC(5,2) NOT NULL DEFAULT 0,
      weight NUMERIC(10,2) NOT NULL DEFAULT 1,
      status TEXT NULL DEFAULT 'pending',
      user_id BIGINT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      voided BOOLEAN NOT NULL DEFAULT FALSE
    )
  `);
}

async function setupMilestoneDueOverdue(projectId, projectName) {
  const name = `[${DEMO_TAG}] Overdue milestone — ${projectName.slice(0, 40)}`;
  const existing = first(await pool.query(
    `SELECT milestone_id FROM project_milestones
     WHERE project_id = $1 AND milestone_name = $2 AND COALESCE(voided, false) = false LIMIT 1`,
    [projectId, name]
  ));
  if (existing) {
    await pool.query(
      `UPDATE project_milestones SET due_date = $2, completed = false, updated_at = CURRENT_TIMESTAMP WHERE milestone_id = $1`,
      [existing.milestone_id, isoDateOffset(-21)]
    );
    return 'updated overdue milestone';
  }
  await pool.query(
    `
    INSERT INTO project_milestones (project_id, milestone_name, description, due_date, completed, status, voided)
    VALUES ($1, $2, $3, $4, false, 'overdue', false)
    `,
    [projectId, name, 'Escalation demo: milestone due date passed.', isoDateOffset(-21)]
  );
  return 'inserted overdue milestone';
}

async function setupProjectCompletionOverdue(projectId) {
  await pool.query(
    `
    UPDATE projects SET
      timeline = COALESCE(timeline, '{}'::jsonb) || jsonb_build_object(
        'expected_completion_date', $2::text,
        'financial_year', COALESCE(timeline->>'financial_year', '2025/2026')
      ),
      updated_at = NOW()
    WHERE project_id = $1
    `,
    [projectId, isoDateOffset(-45)]
  );
  return 'set expected completion 45 days ago';
}

async function setupStatusAttention(projectId) {
  await pool.query(
    `
    UPDATE projects SET
      progress = COALESCE(progress, '{}'::jsonb) || jsonb_build_object(
        'status', 'Stalled',
        'status_reason', 'Escalation demo: works suspended pending contractor mobilization.',
        'percentage_complete', COALESCE(NULLIF(progress->>'percentage_complete', '')::numeric, 18)
      ),
      updated_at = NOW()
    WHERE project_id = $1
    `,
    [projectId]
  );
  return 'set status to Stalled';
}

async function setupAbsorptionMismatch(projectId) {
  await pool.query(
    `
    UPDATE projects SET
      budget = COALESCE(budget, '{}'::jsonb) || jsonb_build_object(
        'allocated_amount_kes', 10000000,
        'disbursed_amount_kes', 7200000
      ),
      progress = COALESCE(progress, '{}'::jsonb) || jsonb_build_object(
        'percentage_complete', 15,
        'status', COALESCE(progress->>'status', 'In Progress')
      ),
      updated_at = NOW()
    WHERE project_id = $1
    `,
    [projectId]
  );
  return 'set 72% absorption vs 15% progress';
}

async function setupLowEvaluation(projectId, projectName) {
  await ensureEvaluationTable();
  const existing = first(await pool.query(
    `SELECT id FROM project_evaluations
     WHERE project_id = $1 AND COALESCE(voided, false) = false
       AND performance_score < 50
     LIMIT 1`,
    [projectId]
  ));
  if (existing) {
    await pool.query(
      `UPDATE project_evaluations SET performance_score = 38, evaluation_date = $2, updated_at = NOW() WHERE id = $1`,
      [existing.id, isoDateOffset(-7)]
    );
    return 'updated low evaluation score';
  }
  await pool.query(
    `
    INSERT INTO project_evaluations (project_id, evaluation_date, performance_score, voided)
    VALUES ($1, $2, 38, false)
    `,
    [projectId, isoDateOffset(-7)]
  );
  return 'inserted evaluation score 38%';
}

async function setupInspectionWarning(projectId) {
  await ensureInspectionTable();
  const existing = first(await pool.query(
    `SELECT inspection_id FROM project_inspections
     WHERE project_id = $1 AND COALESCE(voided, false) = false
       AND warnings ILIKE '%escalation demo%'
     LIMIT 1`,
    [projectId]
  ));
  if (existing) return 'inspection warning already present';

  await pool.query(
    `
    INSERT INTO project_inspections (project_id, inspection_date, findings, warnings, recommendations, voided)
    VALUES ($1, $2, $3, $4, $5, false)
    `,
    [
      projectId,
      isoDateOffset(-3),
      'Escalation demo inspection — partial works observed.',
      'Escalation demo: safety signage missing; material storage blocking access route.',
      'Contractor to restore site access within 7 days.',
    ]
  );
  return 'inserted inspection with warnings';
}

async function setupMonitoringStale(projectId) {
  await pool.query(
    `DELETE FROM data_collection_submissions WHERE project_id = $1`,
    [projectId]
  );
  return 'removed monitoring submissions (stale visit demo)';
}

async function ensurePlanningRisk(projectId) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS planning_project_risks (
      id BIGSERIAL PRIMARY KEY,
      risk_code TEXT NOT NULL UNIQUE,
      risk_name TEXT NOT NULL,
      description TEXT NULL,
      voided BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS project_planning_risk_links (
      id BIGSERIAL PRIMARY KEY,
      project_id BIGINT NOT NULL,
      planning_risk_id BIGINT NOT NULL REFERENCES planning_project_risks(id),
      risk_level TEXT NOT NULL DEFAULT 'Medium',
      notes TEXT NULL,
      voided BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (project_id, planning_risk_id)
    )
  `);

  let risk = first(await pool.query(
    `SELECT id FROM planning_project_risks WHERE risk_code = $1 AND COALESCE(voided, false) = false LIMIT 1`,
    [`${DEMO_TAG}-supply-delay`]
  ));
  if (!risk) {
    risk = first(await pool.query(
      `
      INSERT INTO planning_project_risks (risk_code, risk_name, description, voided)
      VALUES ($1, $2, $3, false)
      RETURNING id
      `,
      [`${DEMO_TAG}-supply-delay`, 'Material supply delay', 'Escalation demo planning risk.']
    ));
  }

  const linked = first(await pool.query(
    `SELECT id FROM project_planning_risk_links
     WHERE project_id = $1 AND planning_risk_id = $2 AND COALESCE(voided, false) = false LIMIT 1`,
    [projectId, risk.id]
  ));
  if (linked) return 'planning risk already linked';

  await pool.query(
    `
    INSERT INTO project_planning_risk_links (project_id, planning_risk_id, risk_level, notes, voided)
    VALUES ($1, $2, 'High', $3, false)
    `,
    [projectId, risk.id, 'Escalation demo: cement supply chain disruption.']
  );
  return 'linked high planning risk';
}

async function ensurePlanningActivityOverdue(projectId) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS planning_measurement_types (
      id BIGSERIAL PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      label TEXT NOT NULL,
      voided BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS planning_indicators (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      measurement_type_id BIGINT NOT NULL REFERENCES planning_measurement_types(id),
      voided BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS planning_project_activities (
      id BIGSERIAL PRIMARY KEY,
      activity_code TEXT NOT NULL UNIQUE,
      activity_name TEXT NOT NULL,
      indicator_id BIGINT NOT NULL REFERENCES planning_indicators(id),
      voided BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS project_planning_activity_links (
      id BIGSERIAL PRIMARY KEY,
      project_id BIGINT NOT NULL,
      planning_activity_id BIGINT NOT NULL REFERENCES planning_project_activities(id),
      planned_start_date DATE NULL,
      planned_end_date DATE NULL,
      activity_status TEXT NULL,
      completed_at DATE NULL,
      voided BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (project_id, planning_activity_id)
    )
  `);

  let mt = first(await pool.query(
    `SELECT id FROM planning_measurement_types WHERE code = $1 LIMIT 1`,
    [`${DEMO_TAG}-count`]
  ));
  if (!mt) {
    mt = first(await pool.query(
      `INSERT INTO planning_measurement_types (code, label, voided) VALUES ($1, $2, false) RETURNING id`,
      [`${DEMO_TAG}-count`, 'Count']
    ));
  }

  let indicator = first(await pool.query(
    `SELECT id FROM planning_indicators WHERE name = $1 LIMIT 1`,
    [`${DEMO_TAG} indicator`]
  ));
  if (!indicator) {
    indicator = first(await pool.query(
      `INSERT INTO planning_indicators (name, measurement_type_id, voided) VALUES ($1, $2, false) RETURNING id`,
      [`${DEMO_TAG} indicator`, mt.id]
    ));
  }

  let activity = first(await pool.query(
    `SELECT id FROM planning_project_activities WHERE activity_code = $1 LIMIT 1`,
    [`${DEMO_TAG}-site-mobilization`]
  ));
  if (!activity) {
    activity = first(await pool.query(
      `
      INSERT INTO planning_project_activities (activity_code, activity_name, indicator_id, voided)
      VALUES ($1, $2, $3, false) RETURNING id
      `,
      [`${DEMO_TAG}-site-mobilization`, 'Site mobilization', indicator.id]
    ));
  }

  const linked = first(await pool.query(
    `SELECT id FROM project_planning_activity_links
     WHERE project_id = $1 AND planning_activity_id = $2 AND COALESCE(voided, false) = false LIMIT 1`,
    [projectId, activity.id]
  ));

  const startDate = isoDateOffset(-30);
  const endDate = isoDateOffset(-14);

  if (linked) {
    await pool.query(
      `
      UPDATE project_planning_activity_links SET
        planned_start_date = $2,
        planned_end_date = $3,
        activity_status = 'in_progress',
        completed_at = NULL,
        updated_at = NOW()
      WHERE id = $1
      `,
      [linked.id, startDate, endDate]
    );
    return 'updated overdue planning activity link';
  }

  await pool.query(
    `
    INSERT INTO project_planning_activity_links (
      project_id, planning_activity_id, planned_start_date, planned_end_date,
      activity_status, notes, voided
    ) VALUES ($1, $2, $3, $4, 'in_progress', $5, false)
    `,
    [projectId, activity.id, startDate, endDate, 'Escalation demo activity link.']
  );
  return 'inserted overdue planning activity link';
}

async function resolveAllOpenSignals() {
  const r = await pool.query(
    `
    UPDATE project_signals SET status = 'resolved', resolved_at = NOW(), updated_at = NOW()
    WHERE status IN ('open', 'acknowledged')
    RETURNING signal_id
    `
  );
  return rows(r).length;
}

async function keepPrimaryDemoSignals(primaryByRule) {
  let resolved = 0;
  for (const [ruleCode, projectId] of Object.entries(primaryByRule)) {
    const r = await pool.query(
      `
      UPDATE project_signals SET status = 'resolved', resolved_at = NOW(), updated_at = NOW()
      WHERE rule_code = $1
        AND status IN ('open', 'acknowledged')
        AND project_id != $2
      RETURNING signal_id
      `,
      [ruleCode, projectId]
    );
    resolved += rows(r).length;
  }
  return resolved;
}

async function ensureAbsorptionSignal(projectId) {
  const existing = first(await pool.query(
    `
    SELECT signal_id FROM project_signals
    WHERE project_id = $1 AND rule_code = 'absorption_progress_mismatch'
      AND status IN ('open', 'acknowledged')
    LIMIT 1
    `,
    [projectId]
  ));
  if (existing) return 'absorption signal already open';

  const project = first(await pool.query(
    `SELECT name, state_department, implementing_agency, location->>'ward' AS ward, timeline->>'financial_year' AS fy
     FROM projects WHERE project_id = $1`,
    [projectId]
  ));

  await pool.query(
    `
    INSERT INTO project_signals (
      project_id, rule_code, severity, escalation_level, status, title, message,
      evidence_json, detected_at, last_seen_at, department, section, ward, financial_year
    ) VALUES ($1, 'absorption_progress_mismatch', 'high', 2, 'open', $2, $3, $4::jsonb, NOW(), NOW(), $5, $6, $7, $8)
    `,
    [
      projectId,
      'High disbursement, low progress',
      'Absorption 72.0% but physical progress 15.0%. (Escalation demo seed)',
      JSON.stringify({ absorptionRate: 72, progress: 15, seed: DEMO_TAG }),
      project?.state_department || null,
      project?.implementing_agency || null,
      project?.ward || null,
      project?.fy || null,
    ]
  );
  await pool.query(
    `INSERT INTO signal_actions (signal_id, action, comment, actor_id)
     SELECT signal_id, 'detected', 'Escalation demo seed — absorption_progress_mismatch', NULL
     FROM project_signals
     WHERE project_id = $1 AND rule_code = 'absorption_progress_mismatch' AND status = 'open'
     ORDER BY signal_id DESC LIMIT 1`,
    [projectId]
  );
  return 'inserted absorption demo signal';
}

async function boostDemoEscalationLevels() {
  const targets = rows(await pool.query(
    `
    SELECT signal_id, rule_code
    FROM project_signals
    WHERE status = 'open'
      AND rule_code IN ('project_completion_overdue', 'absorption_progress_mismatch')
    ORDER BY signal_id ASC
    LIMIT 2
    `
  ));

  for (const sig of targets) {
    await pool.query(
      `
      UPDATE project_signals SET
        escalation_level = 2,
        escalated_at = NOW() - INTERVAL '10 days',
        detected_at = NOW() - INTERVAL '14 days',
        severity = CASE rule_code
          WHEN 'project_completion_overdue' THEN 'high'
          WHEN 'absorption_progress_mismatch' THEN 'high'
          ELSE severity
        END,
        updated_at = NOW()
      WHERE signal_id = $1
      `,
      [sig.signal_id]
    );
    await pool.query(
      `INSERT INTO signal_actions (signal_id, action, comment, actor_id)
       VALUES ($1, 'escalated', 'Escalation demo: pre-escalated to level 2 for UI testing.', NULL)`,
      [sig.signal_id]
    );
  }
  return targets.length;
}

async function printSignalSummary() {
  const summary = first(await pool.query(
    `
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE severity = 'critical')::int AS critical,
      COUNT(*) FILTER (WHERE severity = 'high')::int AS high,
      COUNT(*) FILTER (WHERE severity = 'medium')::int AS medium,
      COUNT(*) FILTER (WHERE severity = 'low')::int AS low
    FROM project_signals
    WHERE status IN ('open', 'acknowledged')
    `
  ));

  console.log('\nOpen escalation signals:', summary);

  const byRule = rows(await pool.query(
    `
    SELECT ps.rule_code, er.name AS rule_name, COUNT(*)::int AS count
    FROM project_signals ps
    LEFT JOIN escalation_rules er ON er.code = ps.rule_code
    WHERE ps.status IN ('open', 'acknowledged')
    GROUP BY ps.rule_code, er.name
    ORDER BY count DESC, ps.rule_code
    `
  ));
  console.log('\nBy rule:');
  byRule.forEach((r) => console.log(`  ${r.count}x  ${r.rule_code} — ${r.rule_name || r.rule_code}`));

  const samples = rows(await pool.query(
    `
    SELECT ps.signal_id, ps.rule_code, ps.severity, ps.escalation_level, p.name AS project_name, ps.title
    FROM project_signals ps
    INNER JOIN projects p ON p.project_id = ps.project_id
    WHERE ps.status IN ('open', 'acknowledged')
    ORDER BY ps.severity DESC, ps.escalation_level DESC, ps.detected_at DESC
    LIMIT 12
    `
  ));
  console.log('\nSample signals:');
  samples.forEach((s) => {
    console.log(`  #${s.signal_id} [${s.severity} L${s.escalation_level}] ${s.rule_code} — ${s.project_name}`);
    console.log(`      ${s.title}`);
  });
}

async function main() {
  console.log('Project escalation demo seed');
  console.log('============================\n');

  await ensureProjectEscalationTables();
  await ensureMilestoneTable();

  const projects = await pickDemoProjects(8);
  if (projects.length < 4) {
    throw new Error(`Need at least 4 active projects; found ${projects.length}. Add test projects first.`);
  }

  console.log(`Using ${projects.length} project(s):`);
  projects.forEach((p) => console.log(`  ${p.id}: ${p.name}`));

  const cleared = await resolveAllOpenSignals();
  if (cleared) console.log(`\nCleared ${cleared} previous open signal(s) for a fresh demo.`);

  const primaryByRule = {
    milestone_due_overdue: projects[0].id,
    project_completion_overdue: projects[1].id,
    status_attention: projects[2].id,
    absorption_progress_mismatch: projects[3].id,
    low_evaluation_score: projects[4]?.id,
    inspection_warning: projects[5]?.id,
    monitoring_stale: projects[6]?.id,
    open_planning_risk: projects[7]?.id,
    milestone_start_overdue: projects[0].id,
    activity_end_overdue: projects[0].id,
  };

  const setups = [
    { fn: () => setupMilestoneDueOverdue(projects[0].id, projects[0].name), label: 'milestone_due_overdue', project: projects[0] },
    { fn: () => setupProjectCompletionOverdue(projects[1].id), label: 'project_completion_overdue', project: projects[1] },
    { fn: () => setupStatusAttention(projects[2].id), label: 'status_attention', project: projects[2] },
    { fn: () => setupAbsorptionMismatch(projects[3].id), label: 'absorption_progress_mismatch', project: projects[3] },
  ];

  if (projects[4]) setups.push({ fn: () => setupLowEvaluation(projects[4].id, projects[4].name), label: 'low_evaluation_score', project: projects[4] });
  if (projects[5]) setups.push({ fn: () => setupInspectionWarning(projects[5].id), label: 'inspection_warning', project: projects[5] });
  if (projects[6]) setups.push({ fn: () => setupMonitoringStale(projects[6].id), label: 'monitoring_stale', project: projects[6] });
  if (projects[7]) setups.push({ fn: () => ensurePlanningRisk(projects[7].id), label: 'open_planning_risk', project: projects[7] });

  if (projects[0]) {
    setups.push({
      fn: () => ensurePlanningActivityOverdue(projects[0].id),
      label: 'milestone_start_overdue + activity_end_overdue',
      project: projects[0],
    });
  }

  console.log('\nConfiguring demo triggers:');
  for (const setup of setups) {
    try {
      const detail = await setup.fn();
      console.log(`  ✓ ${setup.label} on #${setup.project.id}: ${detail}`);
    } catch (err) {
      console.warn(`  ✗ ${setup.label} on #${setup.project.id}: ${err.message}`);
    }
  }

  console.log('\nRunning escalation evaluation…');
  const evaluation = await evaluateAllRules();
  console.log('Evaluation result:', evaluation);

  const capped = await keepPrimaryDemoSignals(primaryByRule);
  if (capped > 0) console.log(`\nResolved ${capped} duplicate signal(s); kept one primary demo signal per rule.`);

  if (projects[3]) {
    const absorptionDetail = await ensureAbsorptionSignal(projects[3].id);
    console.log(`  ✓ absorption_progress_mismatch fallback on #${projects[3].id}: ${absorptionDetail}`);
  }

  const boosted = await boostDemoEscalationLevels();
  if (boosted) console.log(`Pre-escalated ${boosted} signal(s) to level 2 for ladder demo.`);

  const timeEsc = await processTimeEscalations();
  console.log('Time-based escalation pass:', timeEsc);

  await printSignalSummary();

  console.log('\nDone. Open Home dashboard or POST /api/project-escalations/evaluate to refresh.');
  console.log('Escalation rules UI: /project-escalation-rules');
}

main()
  .catch((err) => {
    console.error('\nSeed failed:', err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await pool.end();
    } catch {
      // ignore
    }
  });
