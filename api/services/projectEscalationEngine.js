/**
 * Project escalation engine — evaluates rules, stores signals, escalates by SLA.
 */
const pool = require('../config/db');
const orgScope = require('./organizationScopeService');
const { isAdminLikeRequester } = require('../utils/roleUtils');
const { ensureProjectEscalationTables } = require('./projectEscalationSchema');
const { evaluateFrontLoadHits } = require('./procurementFrontLoadService');
const escalationNotify = require('./projectEscalationNotificationService');

let ready = false;
let monitorTimer = null;
let monitorBusy = false;

const ALLOCATED_EXPR = `
  CASE WHEN (p.budget->>'allocated_amount_kes') ~ '^[0-9]+(\\.[0-9]+)?$'
    THEN (p.budget->>'allocated_amount_kes')::numeric ELSE 0 END`;
const DISBURSED_EXPR = `
  CASE WHEN (p.budget->>'disbursed_amount_kes') ~ '^[0-9]+(\\.[0-9]+)?$'
    THEN (p.budget->>'disbursed_amount_kes')::numeric ELSE 0 END`;
const PROGRESS_EXPR = `
  CASE WHEN (p.progress->>'percentage_complete') ~ '^[0-9]+(\\.[0-9]+)?$'
    THEN (p.progress->>'percentage_complete')::numeric ELSE 0 END`;

function rows(r) {
  return r?.rows || [];
}

function first(r) {
  return rows(r)[0] || null;
}

function getUserId(user) {
  return user?.id ?? user?.userId ?? user?.actualUserId ?? null;
}

async function ensureReady() {
  if (ready) return;
  await ensureProjectEscalationTables();
  ready = true;
}

async function addProjectScope(user, where, params, alias = 'p') {
  const userId = getUserId(user);
  if (!userId || isAdminLikeRequester(user) || !(await orgScope.organizationScopeTableExists())) {
    return;
  }
  const hasCtx = await orgScope.userHasProjectAccessScopeContext(userId);
  const fragment = hasCtx
    ? orgScope.buildExplicitProjectScopeFragment(alias)
    : orgScope.buildProjectListScopeFragment(alias);
  const scopeParams = hasCtx
    ? orgScope.explicitProjectScopeParams(userId)
    : orgScope.projectScopeParamTriple(userId);
  let idx = params.length + 1;
  const pgFragment = fragment.replace(/\?/g, () => `$${idx++}`);
  where.push(pgFragment);
  params.push(...scopeParams);
}

function projectContextSelect(alias = 'p') {
  return `
    ${alias}.project_id AS "projectId",
    ${alias}.name AS "projectName",
    COALESCE(NULLIF(TRIM(${alias}.state_department), ''), 'Unassigned') AS department,
    COALESCE(NULLIF(TRIM(${alias}.implementing_agency), ''), 'Unassigned') AS section,
    COALESCE(NULLIF(TRIM(${alias}.location->>'ward'), ''), 'Unspecified') AS ward,
    COALESCE(NULLIF(TRIM(${alias}.timeline->>'financial_year'), ''), '') AS "financialYear"
  `;
}

const ACTIVE_PROJECT_FILTER = `
  COALESCE(p.voided, false) = false
  AND COALESCE(p.progress->>'status', '') NOT ILIKE '%complete%'
`;

async function loadActiveRules() {
  const r = await pool.query(
    `SELECT * FROM escalation_rules WHERE is_active = TRUE ORDER BY rule_id ASC`
  );
  return rows(r);
}

async function upsertSignal(hit, rule) {
  const now = new Date();
  const evidence = hit.evidence || {};
  const title = hit.title || rule.name;
  const message = hit.message || '';
  const severity = hit.severity || rule.severity_default || 'medium';
  const level = hit.escalationLevel ?? rule.escalation_level_default ?? 1;

  const existing = first(
    await pool.query(
      `
      SELECT signal_id, status, escalation_level, detected_at
      FROM project_signals
      WHERE project_id = $1 AND rule_code = $2 AND status IN ('open', 'acknowledged')
      LIMIT 1
      `,
      [hit.projectId, rule.code]
    )
  );

  if (existing) {
    await pool.query(
      `
      UPDATE project_signals SET
        severity = $1,
        title = $2,
        message = $3,
        evidence_json = $4::jsonb,
        last_seen_at = $5,
        department = $6,
        section = $7,
        ward = $8,
        financial_year = $9,
        updated_at = $5
      WHERE signal_id = $10
      `,
      [
        severity,
        title,
        message,
        JSON.stringify(evidence),
        now,
        hit.department || null,
        hit.section || null,
        hit.ward || null,
        hit.financialYear || null,
        existing.signal_id,
      ]
    );
    return { updated: true, signalId: existing.signal_id };
  }

  const ins = await pool.query(
    `
    INSERT INTO project_signals (
      project_id, rule_code, severity, escalation_level, status, title, message,
      evidence_json, detected_at, last_seen_at, department, section, ward, financial_year,
      created_at, updated_at
    ) VALUES ($1, $2, $3, $4, 'open', $5, $6, $7::jsonb, $8, $8, $9, $10, $11, $12, $8, $8)
    RETURNING signal_id
    `,
    [
      hit.projectId,
      rule.code,
      severity,
      level,
      title,
      message,
      JSON.stringify(evidence),
      now,
      hit.department || null,
      hit.section || null,
      hit.ward || null,
      hit.financialYear || null,
    ]
  );
  const signalId = first(ins)?.signal_id;
  if (signalId) {
    await pool.query(
      `INSERT INTO signal_actions (signal_id, action, comment, actor_id) VALUES ($1, 'detected', $2, NULL)`,
      [signalId, `Rule ${rule.code} triggered`]
    );
    const projectRow = first(
      await pool.query(`SELECT name FROM projects WHERE project_id = $1 LIMIT 1`, [hit.projectId])
    );
    escalationNotify.notifyNewSignal({
      signalId,
      projectName: projectRow?.name,
      ruleName: rule.name,
      severity,
      title,
      message,
    }).catch((e) => console.error('escalation notify (new signal):', e.message));
  }
  return { created: true, signalId };
}

async function autoResolveStale(ruleCode, activeProjectIds) {
  if (!activeProjectIds.length) {
    await pool.query(
      `
      UPDATE project_signals SET status = 'resolved', resolved_at = NOW(), updated_at = NOW()
      WHERE rule_code = $1 AND status IN ('open', 'acknowledged')
      `,
      [ruleCode]
    );
    return;
  }
  await pool.query(
    `
    UPDATE project_signals SET status = 'resolved', resolved_at = NOW(), updated_at = NOW()
    WHERE rule_code = $1 AND status IN ('open', 'acknowledged')
      AND NOT (project_id = ANY($2::bigint[]))
    `,
    [ruleCode, activeProjectIds]
  );
}

const EVALUATORS = {
  async milestone_start_overdue(rule) {
    const threshold = Number(rule.condition_json?.thresholdDays ?? 7);
    const r = await pool.query(
      `
      SELECT DISTINCT ON (p.project_id)
        ${projectContextSelect('p')},
        l.planned_start_date AS "plannedStartDate",
        (CURRENT_DATE - l.planned_start_date) AS "daysOverdue",
        l.id AS "activityLinkId"
      FROM projects p
      INNER JOIN project_planning_activity_links l ON l.project_id = p.project_id
        AND COALESCE(l.voided, false) = false
      WHERE ${ACTIVE_PROJECT_FILTER}
        AND l.planned_start_date IS NOT NULL
        AND l.completed_at IS NULL
        AND COALESCE(l.activity_status, '') NOT ILIKE '%complete%'
        AND l.planned_start_date < CURRENT_DATE - ($1::int || ' days')::interval
      ORDER BY p.project_id, l.planned_start_date ASC
      `,
      [threshold]
    );
    return rows(r).map((row) => ({
      projectId: row.projectId,
      department: row.department,
      section: row.section,
      ward: row.ward,
      financialYear: row.financialYear,
      severity: Number(row.daysOverdue) >= 30 ? 'high' : 'medium',
      title: 'Milestone start overdue',
      message: `Planned activity start was ${row.daysOverdue} day(s) ago (${row.plannedStartDate}).`,
      evidence: {
        plannedStartDate: row.plannedStartDate,
        daysOverdue: Number(row.daysOverdue),
        activityLinkId: row.activityLinkId,
      },
    }));
  },

  async milestone_due_overdue(rule) {
    const threshold = Number(rule.condition_json?.thresholdDays ?? 0);
    const r = await pool.query(
      `
      SELECT DISTINCT ON (p.project_id)
        ${projectContextSelect('p')},
        m.milestone_id AS "milestoneId",
        m.milestone_name AS "milestoneName",
        m.due_date AS "dueDate",
        (CURRENT_DATE - m.due_date) AS "daysOverdue"
      FROM projects p
      INNER JOIN project_milestones m ON m.project_id = p.project_id AND COALESCE(m.voided, false) = false
      WHERE ${ACTIVE_PROJECT_FILTER}
        AND m.completed = false
        AND m.due_date IS NOT NULL
        AND m.due_date < CURRENT_DATE - ($1::int || ' days')::interval
      ORDER BY p.project_id, m.due_date ASC
      `,
      [threshold]
    );
    return rows(r).map((row) => ({
      projectId: row.projectId,
      department: row.department,
      section: row.section,
      ward: row.ward,
      financialYear: row.financialYear,
      severity: Number(row.daysOverdue) >= 21 ? 'high' : 'medium',
      title: 'Milestone due date passed',
      message: `Milestone "${row.milestoneName}" is ${row.daysOverdue} day(s) overdue.`,
      evidence: {
        milestoneId: row.milestoneId,
        milestoneName: row.milestoneName,
        dueDate: row.dueDate,
        daysOverdue: Number(row.daysOverdue),
      },
    }));
  },

  async activity_end_overdue(rule) {
    const threshold = Number(rule.condition_json?.thresholdDays ?? 0);
    const r = await pool.query(
      `
      SELECT DISTINCT ON (p.project_id)
        ${projectContextSelect('p')},
        l.planned_end_date AS "plannedEndDate",
        (CURRENT_DATE - l.planned_end_date) AS "daysOverdue",
        l.id AS "activityLinkId"
      FROM projects p
      INNER JOIN project_planning_activity_links l ON l.project_id = p.project_id
        AND COALESCE(l.voided, false) = false
      WHERE ${ACTIVE_PROJECT_FILTER}
        AND l.planned_end_date IS NOT NULL
        AND l.completed_at IS NULL
        AND COALESCE(l.activity_status, '') NOT ILIKE '%complete%'
        AND l.planned_end_date < CURRENT_DATE - ($1::int || ' days')::interval
      ORDER BY p.project_id, l.planned_end_date ASC
      `,
      [threshold]
    );
    return rows(r).map((row) => ({
      projectId: row.projectId,
      department: row.department,
      section: row.section,
      ward: row.ward,
      financialYear: row.financialYear,
      severity: Number(row.daysOverdue) >= 30 ? 'high' : 'medium',
      title: 'Activity end date passed',
      message: `Linked activity end date was ${row.daysOverdue} day(s) ago.`,
      evidence: {
        plannedEndDate: row.plannedEndDate,
        daysOverdue: Number(row.daysOverdue),
        activityLinkId: row.activityLinkId,
      },
    }));
  },

  async project_completion_overdue(rule) {
    const threshold = Number(rule.condition_json?.thresholdDays ?? 0);
    const r = await pool.query(
      `
      SELECT
        ${projectContextSelect('p')},
        (p.timeline->>'expected_completion_date')::date AS "expectedCompletionDate",
        (CURRENT_DATE - (p.timeline->>'expected_completion_date')::date) AS "daysOverdue"
      FROM projects p
      WHERE ${ACTIVE_PROJECT_FILTER}
        AND (p.timeline->>'expected_completion_date') ~ '^\\d{4}-\\d{2}-\\d{2}$'
        AND (p.timeline->>'expected_completion_date')::date < CURRENT_DATE - ($1::int || ' days')::interval
      `,
      [threshold]
    );
    return rows(r).map((row) => ({
      projectId: row.projectId,
      department: row.department,
      section: row.section,
      ward: row.ward,
      financialYear: row.financialYear,
      severity: Number(row.daysOverdue) >= 60 ? 'critical' : 'high',
      title: 'Project completion overdue',
      message: `Expected completion date passed ${row.daysOverdue} day(s) ago.`,
      evidence: {
        expectedCompletionDate: row.expectedCompletionDate,
        daysOverdue: Number(row.daysOverdue),
      },
    }));
  },

  async open_planning_risk(rule) {
    const r = await pool.query(
      `
      SELECT DISTINCT ON (p.project_id)
        ${projectContextSelect('p')},
        rl.id AS "riskLinkId",
        rl.risk_level AS "riskLevel",
        pr.risk_name AS "riskName"
      FROM projects p
      INNER JOIN project_planning_risk_links rl ON rl.project_id = p.project_id AND COALESCE(rl.voided, false) = false
      LEFT JOIN planning_project_risks pr ON pr.id = rl.planning_risk_id
      WHERE ${ACTIVE_PROJECT_FILTER}
      ORDER BY p.project_id, rl.risk_level DESC NULLS LAST
      `
    );
    return rows(r).map((row) => ({
      projectId: row.projectId,
      department: row.department,
      section: row.section,
      ward: row.ward,
      financialYear: row.financialYear,
      severity: String(row.riskLevel || '').toLowerCase().includes('high') ? 'high' : 'medium',
      title: 'Open planning risk',
      message: `Risk linked: ${row.riskName || 'Unnamed risk'} (${row.riskLevel || 'Medium'}).`,
      evidence: {
        riskLinkId: row.riskLinkId,
        riskName: row.riskName,
        riskLevel: row.riskLevel,
      },
    }));
  },

  async absorption_progress_mismatch(rule) {
    const minAbs = Number(rule.condition_json?.minAbsorptionPct ?? 50);
    const maxProg = Number(rule.condition_json?.maxProgressPct ?? 40);
    const r = await pool.query(
      `
      SELECT
        ${projectContextSelect('p')},
        ${PROGRESS_EXPR} AS progress,
        CASE WHEN ${ALLOCATED_EXPR} > 0 THEN (${DISBURSED_EXPR} / ${ALLOCATED_EXPR}) * 100 ELSE 0 END AS "absorptionRate"
      FROM projects p
      WHERE ${ACTIVE_PROJECT_FILTER}
        AND ${ALLOCATED_EXPR} > 0
        AND (${DISBURSED_EXPR} / ${ALLOCATED_EXPR}) * 100 >= $1
        AND ${PROGRESS_EXPR} < $2
      `,
      [minAbs, maxProg]
    );
    return rows(r).map((row) => ({
      projectId: row.projectId,
      department: row.department,
      section: row.section,
      ward: row.ward,
      financialYear: row.financialYear,
      severity: Number(row.absorptionRate) >= 75 ? 'critical' : 'high',
      title: 'High disbursement, low progress',
      message: `Absorption ${Number(row.absorptionRate).toFixed(1)}% but physical progress ${Number(row.progress).toFixed(1)}%.`,
      evidence: {
        absorptionRate: Number(row.absorptionRate),
        progress: Number(row.progress),
      },
    }));
  },

  async low_evaluation_score(rule) {
    const maxScore = Number(rule.condition_json?.maxScore ?? 50);
    const r = await pool.query(
      `
      SELECT DISTINCT ON (p.project_id)
        ${projectContextSelect('p')},
        e.id AS "evaluationId",
        e.performance_score AS "performanceScore",
        e.evaluation_date AS "evaluationDate"
      FROM projects p
      INNER JOIN project_evaluations e ON e.project_id = p.project_id AND COALESCE(e.voided, false) = false
      WHERE ${ACTIVE_PROJECT_FILTER}
        AND e.performance_score IS NOT NULL
        AND e.performance_score < $1
      ORDER BY p.project_id, e.evaluation_date DESC NULLS LAST
      `,
      [maxScore]
    );
    return rows(r).map((row) => ({
      projectId: row.projectId,
      department: row.department,
      section: row.section,
      ward: row.ward,
      financialYear: row.financialYear,
      severity: Number(row.performanceScore) < 30 ? 'high' : 'medium',
      title: 'Below-standard evaluation',
      message: `Latest evaluation score ${Number(row.performanceScore).toFixed(1)}% is below threshold.`,
      evidence: {
        evaluationId: row.evaluationId,
        performanceScore: Number(row.performanceScore),
        evaluationDate: row.evaluationDate,
      },
    }));
  },

  async inspection_warning(rule) {
    const r = await pool.query(
      `
      SELECT DISTINCT ON (p.project_id)
        ${projectContextSelect('p')},
        i.inspection_id AS "inspectionId",
        i.inspection_date AS "inspectionDate",
        LEFT(i.warnings, 200) AS "warningsPreview"
      FROM projects p
      INNER JOIN project_inspections i ON i.project_id = p.project_id AND COALESCE(i.voided, false) = false
      WHERE ${ACTIVE_PROJECT_FILTER}
        AND NULLIF(TRIM(i.warnings), '') IS NOT NULL
      ORDER BY p.project_id, i.inspection_date DESC NULLS LAST
      `
    );
    return rows(r).map((row) => ({
      projectId: row.projectId,
      department: row.department,
      section: row.section,
      ward: row.ward,
      financialYear: row.financialYear,
      severity: 'medium',
      title: 'Inspection warnings recorded',
      message: row.warningsPreview || 'Inspection contains warnings.',
      evidence: {
        inspectionId: row.inspectionId,
        inspectionDate: row.inspectionDate,
        warningsPreview: row.warningsPreview,
      },
    }));
  },

  async monitoring_stale(rule) {
    const staleDays = Number(rule.condition_json?.staleDays ?? 30);
    const r = await pool.query(
      `
      SELECT
        ${projectContextSelect('p')},
        MAX(s.created_at) AS "lastVisitAt"
      FROM projects p
      LEFT JOIN data_collection_submissions s ON s.project_id = p.project_id AND COALESCE(s.voided, false) = false
      WHERE ${ACTIVE_PROJECT_FILTER}
      GROUP BY p.project_id, p.name, p.state_department, p.implementing_agency, p.location, p.timeline
      HAVING MAX(s.created_at) IS NULL
         OR MAX(s.created_at) < NOW() - ($1::int || ' days')::interval
      `,
      [staleDays]
    );
    return rows(r).map((row) => ({
      projectId: row.projectId,
      department: row.department,
      section: row.section,
      ward: row.ward,
      financialYear: row.financialYear,
      severity: 'low',
      title: 'No recent monitoring visit',
      message: row.lastVisitAt
        ? `Last monitoring submission was over ${staleDays} days ago.`
        : `No monitoring submissions recorded for this active project.`,
      evidence: {
        lastVisitAt: row.lastVisitAt,
        staleDays,
      },
    }));
  },

  async status_attention(rule) {
    const r = await pool.query(
      `
      SELECT
        ${projectContextSelect('p')},
        COALESCE(p.progress->>'status', 'Unknown') AS status,
        ${PROGRESS_EXPR} AS progress,
        NULLIF(p.progress->>'status_reason', '') AS "statusReason"
      FROM projects p
      WHERE ${ACTIVE_PROJECT_FILTER}
        AND COALESCE(p.progress->>'status', '') ~* '(stalled|delay|suspend|cancel|terminat|risk|at risk)'
      `
    );
    return rows(r).map((row) => ({
      projectId: row.projectId,
      department: row.department,
      section: row.section,
      ward: row.ward,
      financialYear: row.financialYear,
      severity: /stalled|cancel|terminat/i.test(row.status) ? 'high' : 'medium',
      title: 'Project status needs attention',
      message: `Status "${row.status}"${row.statusReason ? `: ${row.statusReason}` : ''}.`,
      evidence: {
        status: row.status,
        progress: Number(row.progress),
        statusReason: row.statusReason,
      },
    }));
  },

  async quotation_front_load(rule) {
    return evaluateFrontLoadHits(rule);
  },
};

async function evaluateAllRules() {
  await ensureReady();
  const rules = await loadActiveRules();
  const summary = { evaluated: 0, created: 0, updated: 0, resolved: 0, errors: [] };

  for (const rule of rules) {
    const evaluator = EVALUATORS[rule.code];
    if (!evaluator) continue;
    try {
      const hits = await evaluator(rule);
      const activeIds = [];
      for (const hit of hits) {
        const result = await upsertSignal(hit, rule);
        activeIds.push(hit.projectId);
        if (result.created) summary.created += 1;
        if (result.updated) summary.updated += 1;
      }
      await autoResolveStale(rule.code, activeIds);
      summary.evaluated += 1;
    } catch (err) {
      summary.errors.push({ rule: rule.code, message: err.message });
    }
  }

  const resolved = await pool.query(
    `
    UPDATE project_signals ps SET status = 'resolved', resolved_at = NOW(), updated_at = NOW()
    WHERE ps.status IN ('open', 'acknowledged')
      AND NOT EXISTS (
        SELECT 1 FROM escalation_rules er
        WHERE er.code = ps.rule_code AND er.is_active = TRUE
      )
    RETURNING signal_id
    `
  );
  summary.resolved += rows(resolved).length;

  return summary;
}

async function processTimeEscalations() {
  await ensureReady();
  const rules = await loadActiveRules();
  const ruleMap = Object.fromEntries(rules.map((r) => [r.code, r]));
  const openSignals = rows(
    await pool.query(
      `
      SELECT signal_id, rule_code, escalation_level, status, detected_at, acknowledged_at, escalated_at
      FROM project_signals
      WHERE status IN ('open', 'acknowledged')
      `
    )
  );

  let escalated = 0;
  const now = Date.now();

  for (const sig of openSignals) {
    const rule = ruleMap[sig.rule_code];
    if (!rule) continue;
    const ladder = rule.escalation_ladder_json || {};
    const slaDays = Array.isArray(ladder.slaDaysPerLevel) ? ladder.slaDaysPerLevel : [7, 14, 30];
    const maxLevel = Number(ladder.maxLevel ?? slaDays.length + 1);
    if (sig.escalation_level >= maxLevel) continue;

    const anchor = sig.acknowledged_at || sig.escalated_at || sig.detected_at;
    const anchorMs = anchor ? new Date(anchor).getTime() : now;
    const daysSince = (now - anchorMs) / 86400000;
    const slaForLevel = slaDays[Math.max(0, sig.escalation_level - 1)] ?? 7;

    if (daysSince < slaForLevel) continue;

    const newLevel = sig.escalation_level + 1;
    await pool.query(
      `
      UPDATE project_signals SET
        escalation_level = $1,
        escalated_at = NOW(),
        updated_at = NOW(),
        severity = CASE
          WHEN severity = 'low' AND $1 >= 2 THEN 'medium'
          WHEN severity = 'medium' AND $1 >= 3 THEN 'high'
          ELSE severity
        END
      WHERE signal_id = $2
      `,
      [newLevel, sig.signal_id]
    );
    await pool.query(
      `INSERT INTO signal_actions (signal_id, action, comment, actor_id) VALUES ($1, 'escalated', $2, NULL)`,
      [sig.signal_id, `Auto-escalated to level ${newLevel} after ${slaForLevel} day SLA`]
    );
    const detail = first(
      await pool.query(
        `SELECT ps.title, ps.severity, ps.rule_code, p.name AS "projectName", er.name AS "ruleName"
         FROM project_signals ps
         INNER JOIN projects p ON p.project_id = ps.project_id
         LEFT JOIN escalation_rules er ON er.code = ps.rule_code
         WHERE ps.signal_id = $1`,
        [sig.signal_id]
      )
    );
    escalationNotify.notifyEscalation({
      signalId: sig.signal_id,
      projectName: detail?.projectName,
      ruleName: detail?.ruleName || sig.rule_code,
      severity: detail?.severity,
      escalationLevel: newLevel,
      title: detail?.title,
    }).catch((e) => console.error('escalation notify (escalated):', e.message));
    escalated += 1;
  }

  return { escalated };
}

function mapSignalRow(row) {
  return {
    signalId: row.signal_id,
    projectId: row.project_id,
    projectName: row.projectName,
    ruleCode: row.rule_code,
    ruleName: row.ruleName,
    category: row.category,
    severity: row.severity,
    escalationLevel: row.escalation_level,
    status: row.status,
    title: row.title,
    message: row.message,
    evidence: row.evidence_json,
    detectedAt: row.detected_at,
    lastSeenAt: row.last_seen_at,
    acknowledgedAt: row.acknowledged_at,
    resolvedAt: row.resolved_at,
    escalatedAt: row.escalated_at,
    department: row.department,
    section: row.section,
    ward: row.ward,
    financialYear: row.financial_year,
  };
}

async function listSignals(user, opts = {}) {
  await ensureReady();
  const where = [`ps.status IN ('open', 'acknowledged')`];
  const params = [];

  if (opts.status) {
    params.push(opts.status);
    where[0] = `ps.status = $${params.length}`;
  } else if (opts.includeResolved) {
    where[0] = `ps.status IN ('open', 'acknowledged', 'resolved')`;
  }

  if (opts.projectId != null) {
    params.push(Number(opts.projectId));
    where.push(`ps.project_id = $${params.length}`);
  }
  if (opts.severity) {
    params.push(opts.severity);
    where.push(`ps.severity = $${params.length}`);
  }
  if (opts.minLevel != null) {
    params.push(Number(opts.minLevel));
    where.push(`ps.escalation_level >= $${params.length}`);
  }
  if (opts.ruleCode) {
    params.push(opts.ruleCode);
    where.push(`ps.rule_code = $${params.length}`);
  }
  if (opts.department) {
    params.push(`%${opts.department}%`);
    where.push(`ps.department ILIKE $${params.length}`);
  }

  await addProjectScope(user, where, params, 'p');

  const limit = Math.min(Math.max(Number(opts.limit) || 50, 1), 500);
  params.push(limit);

  const r = await pool.query(
    `
    SELECT ps.*, p.name AS "projectName", er.name AS "ruleName", er.category
    FROM project_signals ps
    INNER JOIN projects p ON p.project_id = ps.project_id
    LEFT JOIN escalation_rules er ON er.code = ps.rule_code
    WHERE ${where.join(' AND ')}
    ORDER BY
      CASE ps.severity
        WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4
      END,
      ps.escalation_level DESC,
      ps.detected_at DESC
    LIMIT $${params.length}
    `,
    params
  );
  return rows(r).map(mapSignalRow);
}

async function getSignalSummary(user) {
  await ensureReady();
  const where = [`ps.status IN ('open', 'acknowledged')`];
  const params = [];
  await addProjectScope(user, where, params, 'p');

  const r = await pool.query(
    `
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE ps.severity = 'critical')::int AS critical,
      COUNT(*) FILTER (WHERE ps.severity = 'high')::int AS high,
      COUNT(*) FILTER (WHERE ps.severity = 'medium')::int AS medium,
      COUNT(*) FILTER (WHERE ps.severity = 'low')::int AS low,
      COUNT(*) FILTER (WHERE ps.escalation_level >= 3)::int AS "level3Plus"
    FROM project_signals ps
    INNER JOIN projects p ON p.project_id = ps.project_id
    WHERE ${where.join(' AND ')}
    `,
    params
  );
  return first(r) || { total: 0, critical: 0, high: 0, medium: 0, low: 0, level3Plus: 0 };
}

async function getSignalById(signalId, user) {
  await ensureReady();
  const where = ['ps.signal_id = $1'];
  const params = [signalId];
  await addProjectScope(user, where, params, 'p');
  const row = first(
    await pool.query(
      `
      SELECT ps.*, p.name AS "projectName", er.name AS "ruleName", er.category
      FROM project_signals ps
      INNER JOIN projects p ON p.project_id = ps.project_id
      LEFT JOIN escalation_rules er ON er.code = ps.rule_code
      WHERE ${where.join(' AND ')}
      `,
      params
    )
  );
  if (!row) return null;

  const actions = rows(
    await pool.query(
      `SELECT * FROM signal_actions WHERE signal_id = $1 ORDER BY created_at ASC`,
      [signalId]
    )
  );
  return { ...mapSignalRow(row), actions };
}

async function acknowledgeSignal(signalId, user, comment) {
  const userId = getUserId(user);
  const sig = await getSignalById(signalId, user);
  if (!sig) {
    const err = new Error('Signal not found or access denied.');
    err.statusCode = 404;
    throw err;
  }
  await pool.query(
    `
    UPDATE project_signals SET status = 'acknowledged', acknowledged_at = NOW(), acknowledged_by = $1, updated_at = NOW()
    WHERE signal_id = $2
    `,
    [userId, signalId]
  );
  await pool.query(
    `INSERT INTO signal_actions (signal_id, action, comment, actor_id) VALUES ($1, 'acknowledged', $2, $3)`,
    [signalId, comment || null, userId]
  );
  return getSignalById(signalId, user);
}

async function resolveSignal(signalId, user, comment) {
  const userId = getUserId(user);
  const sig = await getSignalById(signalId, user);
  if (!sig) {
    const err = new Error('Signal not found or access denied.');
    err.statusCode = 404;
    throw err;
  }
  await pool.query(
    `
    UPDATE project_signals SET status = 'resolved', resolved_at = NOW(), resolved_by = $1, updated_at = NOW()
    WHERE signal_id = $2
    `,
    [userId, signalId]
  );
  await pool.query(
    `INSERT INTO signal_actions (signal_id, action, comment, actor_id) VALUES ($1, 'resolved', $2, $3)`,
    [signalId, comment || null, userId]
  );
  return getSignalById(signalId, user);
}

function mapRuleRow(row) {
  if (!row) return null;
  return {
    ruleId: row.rule_id,
    code: row.code,
    name: row.name,
    category: row.category,
    severityDefault: row.severity_default,
    escalationLevelDefault: row.escalation_level_default,
    conditionJson: row.condition_json || {},
    escalationLadderJson: row.escalation_ladder_json || {},
    cooldownHours: row.cooldown_hours,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function listRules() {
  await ensureReady();
  const r = await pool.query(`SELECT * FROM escalation_rules ORDER BY category, name`);
  return rows(r).map(mapRuleRow);
}

async function updateRule(code, payload = {}, userId = null) {
  await ensureReady();
  const existing = first(await pool.query(`SELECT * FROM escalation_rules WHERE code = $1`, [code]));
  if (!existing) {
    const err = new Error('Rule not found.');
    err.statusCode = 404;
    throw err;
  }

  const fields = [];
  const params = [];
  const set = (col, val) => {
    params.push(val);
    fields.push(`${col} = $${params.length}`);
  };

  if (payload.name != null) set('name', String(payload.name).trim());
  if (payload.category != null) set('category', String(payload.category).trim());
  if (payload.severityDefault != null) set('severity_default', String(payload.severityDefault).trim());
  if (payload.escalationLevelDefault != null) set('escalation_level_default', Number(payload.escalationLevelDefault));
  if (payload.cooldownHours != null) set('cooldown_hours', Number(payload.cooldownHours));
  if (payload.isActive != null) set('is_active', Boolean(payload.isActive));
  if (payload.conditionJson != null) {
    params.push(JSON.stringify(payload.conditionJson));
    fields.push(`condition_json = $${params.length}::jsonb`);
  }
  if (payload.escalationLadderJson != null) {
    params.push(JSON.stringify(payload.escalationLadderJson));
    fields.push(`escalation_ladder_json = $${params.length}::jsonb`);
  }

  if (!fields.length) return mapRuleRow(existing);

  set('updated_at', new Date());
  params.push(code);
  const updated = first(
    await pool.query(
      `UPDATE escalation_rules SET ${fields.join(', ')} WHERE code = $${params.length} RETURNING *`,
      params
    )
  );
  return mapRuleRow(updated);
}

async function getNotificationSettings() {
  await ensureReady();
  return escalationNotify.getNotificationSettings();
}

async function updateNotificationSettings(payload, userId = null) {
  await ensureReady();
  return escalationNotify.updateNotificationSettings(payload, userId);
}

async function runMonitorCycle() {
  if (monitorBusy) return { skipped: true };
  monitorBusy = true;
  try {
    const evaluation = await evaluateAllRules();
    const escalation = await processTimeEscalations();
    return { evaluation, escalation };
  } finally {
    monitorBusy = false;
  }
}

function startProjectEscalationMonitor() {
  if (monitorTimer) return;
  const intervalMsRaw = Number(process.env.PROJECT_ESCALATION_MONITOR_INTERVAL_MS || 3600000);
  const intervalMs = Number.isFinite(intervalMsRaw) && intervalMsRaw >= 60000 ? intervalMsRaw : 3600000;
  monitorTimer = setInterval(() => {
    runMonitorCycle().catch((e) => console.error('project escalation monitor failed:', e));
  }, intervalMs);
  runMonitorCycle().catch((e) => console.error('project escalation monitor startup failed:', e));
}

function stopProjectEscalationMonitor() {
  if (monitorTimer) clearInterval(monitorTimer);
  monitorTimer = null;
}

module.exports = {
  ensureReady,
  evaluateAllRules,
  processTimeEscalations,
  runMonitorCycle,
  startProjectEscalationMonitor,
  stopProjectEscalationMonitor,
  listSignals,
  getSignalSummary,
  getSignalById,
  acknowledgeSignal,
  resolveSignal,
  listRules,
  updateRule,
  getNotificationSettings,
  updateNotificationSettings,
};
