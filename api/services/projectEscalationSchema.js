const pool = require('../config/db');

const DEFAULT_RULES = [
  {
    code: 'milestone_start_overdue',
    name: 'Milestone start overdue',
    category: 'schedule',
    severity_default: 'medium',
    escalation_level_default: 1,
    cooldown_hours: 72,
    condition_json: { thresholdDays: 7 },
    escalation_ladder_json: { slaDaysPerLevel: [7, 14, 30], maxLevel: 3 },
  },
  {
    code: 'project_completion_overdue',
    name: 'Project completion overdue',
    category: 'schedule',
    severity_default: 'high',
    escalation_level_default: 1,
    cooldown_hours: 72,
    condition_json: { thresholdDays: 0 },
    escalation_ladder_json: { slaDaysPerLevel: [14, 30, 45], maxLevel: 4 },
  },
  {
    code: 'open_planning_risk',
    name: 'Open planning risk on project',
    category: 'risk',
    severity_default: 'medium',
    escalation_level_default: 1,
    cooldown_hours: 168,
    condition_json: {},
    escalation_ladder_json: { slaDaysPerLevel: [14, 30], maxLevel: 2 },
  },
  {
    code: 'absorption_progress_mismatch',
    name: 'High disbursement, low physical progress',
    category: 'finance',
    severity_default: 'high',
    escalation_level_default: 2,
    cooldown_hours: 72,
    condition_json: { minAbsorptionPct: 50, maxProgressPct: 40 },
    escalation_ladder_json: { slaDaysPerLevel: [7, 14], maxLevel: 3 },
  },
  {
    code: 'low_evaluation_score',
    name: 'Below-standard evaluation score',
    category: 'quality',
    severity_default: 'medium',
    escalation_level_default: 2,
    cooldown_hours: 168,
    condition_json: { maxScore: 50 },
    escalation_ladder_json: { slaDaysPerLevel: [14, 30], maxLevel: 3 },
  },
  {
    code: 'inspection_warning',
    name: 'Inspection warnings recorded',
    category: 'quality',
    severity_default: 'medium',
    escalation_level_default: 1,
    cooldown_hours: 72,
    condition_json: {},
    escalation_ladder_json: { slaDaysPerLevel: [7, 14], maxLevel: 3 },
  },
  {
    code: 'monitoring_stale',
    name: 'No recent monitoring visit',
    category: 'monitoring',
    severity_default: 'low',
    escalation_level_default: 1,
    cooldown_hours: 168,
    condition_json: { staleDays: 30 },
    escalation_ladder_json: { slaDaysPerLevel: [14, 30], maxLevel: 2 },
  },
  {
    code: 'status_attention',
    name: 'Project status needs attention',
    category: 'delivery',
    severity_default: 'medium',
    escalation_level_default: 1,
    cooldown_hours: 72,
    condition_json: {},
    escalation_ladder_json: { slaDaysPerLevel: [7, 14, 30], maxLevel: 3 },
  },
  {
    code: 'milestone_due_overdue',
    name: 'Milestone due date passed',
    category: 'schedule',
    severity_default: 'high',
    escalation_level_default: 1,
    cooldown_hours: 72,
    condition_json: { thresholdDays: 0 },
    escalation_ladder_json: { slaDaysPerLevel: [7, 14, 30], maxLevel: 3 },
  },
  {
    code: 'activity_end_overdue',
    name: 'Linked activity end date passed',
    category: 'schedule',
    severity_default: 'medium',
    escalation_level_default: 1,
    cooldown_hours: 72,
    condition_json: { thresholdDays: 0 },
    escalation_ladder_json: { slaDaysPerLevel: [7, 14], maxLevel: 2 },
  },
  {
    code: 'quotation_front_load',
    name: 'Quotation front-load risk',
    category: 'finance',
    severity_default: 'high',
    escalation_level_default: 2,
    cooldown_hours: 168,
    condition_json: { minRiskLevel: 'medium', earlyFraction: 0.33 },
    escalation_ladder_json: { slaDaysPerLevel: [7, 14, 30], maxLevel: 3 },
  },
];

async function ensureProjectEscalationTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS escalation_rules (
      rule_id BIGSERIAL PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'general',
      severity_default TEXT NOT NULL DEFAULT 'medium',
      escalation_level_default INTEGER NOT NULL DEFAULT 1,
      condition_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      escalation_ladder_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      cooldown_hours INTEGER NOT NULL DEFAULT 72,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS project_signals (
      signal_id BIGSERIAL PRIMARY KEY,
      project_id BIGINT NOT NULL,
      rule_code TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'medium',
      escalation_level INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'open',
      title TEXT NOT NULL,
      message TEXT NULL,
      evidence_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      acknowledged_at TIMESTAMPTZ NULL,
      acknowledged_by BIGINT NULL,
      resolved_at TIMESTAMPTZ NULL,
      resolved_by BIGINT NULL,
      escalated_at TIMESTAMPTZ NULL,
      department TEXT NULL,
      section TEXT NULL,
      ward TEXT NULL,
      financial_year TEXT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Partial unique: only one open signal per project+rule (resolved signals can coexist historically)
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_project_signals_open
    ON project_signals (project_id, rule_code)
    WHERE status IN ('open', 'acknowledged')
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS signal_actions (
      action_id BIGSERIAL PRIMARY KEY,
      signal_id BIGINT NOT NULL REFERENCES project_signals(signal_id) ON DELETE CASCADE,
      action TEXT NOT NULL,
      comment TEXT NULL,
      actor_id BIGINT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`CREATE INDEX IF NOT EXISTS idx_project_signals_project ON project_signals(project_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_project_signals_status ON project_signals(status)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_project_signals_severity ON project_signals(severity)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_project_signals_level ON project_signals(escalation_level)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_project_signals_detected ON project_signals(detected_at DESC)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_signal_actions_signal ON signal_actions(signal_id)`);

  for (const rule of DEFAULT_RULES) {
    await pool.query(
      `
      INSERT INTO escalation_rules
        (code, name, category, severity_default, escalation_level_default,
         condition_json, escalation_ladder_json, cooldown_hours, is_active)
      VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, TRUE)
      ON CONFLICT (code) DO NOTHING
      `,
      [
        rule.code,
        rule.name,
        rule.category,
        rule.severity_default,
        rule.escalation_level_default,
        JSON.stringify(rule.condition_json || {}),
        JSON.stringify(rule.escalation_ladder_json || {}),
        rule.cooldown_hours,
      ]
    );
  }
}

module.exports = {
  DEFAULT_RULES,
  ensureProjectEscalationTables,
};
