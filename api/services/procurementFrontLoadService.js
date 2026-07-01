/**
 * Shared procurement front-load analysis for quotation comparison and escalation rules.
 */
const pool = require('../config/db');

function rows(r) {
  return r?.rows || [];
}

function isSchemaError(error) {
  const code = error?.code || '';
  return code === '42P01' || code === '42703' || code === '42883';
}

function normalizeQuotationLineType(value) {
  const t = String(value || 'planned').trim().toLowerCase();
  return t === 'supplementary' || t === 'extra' ? 'supplementary' : 'planned';
}

function quotationLinesForComparison(quotedLines) {
  return (quotedLines || []).filter((row) => normalizeQuotationLineType(row.lineType) === 'planned');
}

function groupLinesByMilestone(lines, milestoneOrderMap) {
  const groups = new Map();
  for (const line of lines || []) {
    const name = String(line.milestoneName || line.milestone_name || 'General').trim() || 'General';
    const key = name.toLowerCase();
    if (!groups.has(key)) {
      groups.set(key, {
        milestoneName: name,
        sequenceOrder: milestoneOrderMap.get(key) ?? 9999,
        total: 0,
        lineCount: 0,
      });
    }
    const group = groups.get(key);
    const amount = Number(line.amount ?? line.budgetAmount ?? line.budget_amount ?? 0);
    group.total += Number.isFinite(amount) ? amount : 0;
    group.lineCount += 1;
  }
  return [...groups.values()].sort((a, b) => a.sequenceOrder - b.sequenceOrder || a.milestoneName.localeCompare(b.milestoneName));
}

function computeFrontLoadRisk(plannedGroups, quotedGroups, options = {}) {
  const plannedTotal = plannedGroups.reduce((sum, g) => sum + Number(g.total || 0), 0);
  const quotedTotal = quotedGroups.reduce((sum, g) => sum + Number(g.total || 0), 0);
  if (plannedTotal <= 0 || quotedTotal <= 0) {
    return {
      riskLevel: 'none',
      frontLoadIndex: 0,
      plannedEarlyPercent: 0,
      quotedEarlyPercent: 0,
      alerts: ['Insufficient planned or quoted totals for comparison.'],
    };
  }

  const earlyCount = Math.max(1, Math.ceil(plannedGroups.length * (options.earlyFraction || 0.33)));
  const plannedEarly = plannedGroups.slice(0, earlyCount).reduce((sum, g) => sum + Number(g.total || 0), 0);
  const quotedEarly = quotedGroups.slice(0, earlyCount).reduce((sum, g) => sum + Number(g.total || 0), 0);
  const plannedEarlyPercent = Number(((plannedEarly / plannedTotal) * 100).toFixed(2));
  const quotedEarlyPercent = Number(((quotedEarly / quotedTotal) * 100).toFixed(2));
  const frontLoadIndex = Number((quotedEarlyPercent - plannedEarlyPercent).toFixed(2));

  const alerts = [];
  let riskLevel = 'low';
  if (frontLoadIndex >= 20 || (quotedEarlyPercent >= 40 && plannedEarlyPercent < 15)) {
    riskLevel = 'high';
    alerts.push('Quoted amount is heavily front-loaded versus the planned baseline.');
  } else if (frontLoadIndex >= 10 || quotedEarlyPercent >= 30) {
    riskLevel = 'medium';
    alerts.push('Quoted distribution is more front-loaded than planned.');
  }
  if (quotedTotal > plannedTotal * 1.1) {
    alerts.push(`Quoted total exceeds planned by ${((quotedTotal / plannedTotal - 1) * 100).toFixed(1)}%.`);
    if (riskLevel === 'low') riskLevel = 'medium';
  }

  return {
    riskLevel,
    frontLoadIndex,
    plannedEarlyPercent,
    quotedEarlyPercent,
    earlyMilestoneCount: earlyCount,
    alerts,
  };
}

const RISK_RANK = { none: 0, low: 1, medium: 2, high: 3 };

function meetsMinRiskLevel(riskLevel, minRiskLevel) {
  const min = String(minRiskLevel || 'medium').toLowerCase();
  return (RISK_RANK[riskLevel] || 0) >= (RISK_RANK[min] || 2);
}

async function fetchPlannedBqLines(projectId) {
  const queries = [
    `SELECT
        id AS "plannedBqItemId",
        activity_name AS "activityName",
        milestone_name AS "milestoneName",
        budget_amount AS "budgetAmount",
        sort_order AS "sortOrder"
     FROM project_bq_items
     WHERE project_id = $1 AND COALESCE(voided, false) = false
     ORDER BY sort_order ASC NULLS LAST, id ASC`,
    `SELECT
        id AS "plannedBqItemId",
        activity_name AS "activityName",
        milestone_name AS "milestoneName",
        budget_amount AS "budgetAmount",
        sort_order AS "sortOrder"
     FROM project_bq_items
     WHERE project_id = $1
     ORDER BY sort_order ASC NULLS LAST, id ASC`,
  ];
  for (const sql of queries) {
    try {
      return rows(await pool.query(sql, [projectId]));
    } catch (error) {
      if (!isSchemaError(error)) throw error;
    }
  }
  return [];
}

async function fetchMilestoneSequenceMap(projectId) {
  const queries = [
    `SELECT milestone_name AS "milestoneName", COALESCE(sequence_order, 9999) AS "sequenceOrder"
     FROM project_milestones
     WHERE project_id = $1 AND COALESCE(voided, false) = false
     ORDER BY sequence_order ASC NULLS LAST, milestone_id ASC`,
    `SELECT milestone_name AS "milestoneName", COALESCE(sequence_order, 9999) AS "sequenceOrder"
     FROM project_milestones
     WHERE project_id = $1
     ORDER BY sequence_order ASC NULLS LAST, milestone_name ASC`,
  ];
  for (const sql of queries) {
    try {
      const map = new Map();
      rows(await pool.query(sql, [projectId])).forEach((row, index) => {
        const key = String(row.milestoneName || '').trim().toLowerCase();
        if (key && !map.has(key)) map.set(key, Number(row.sequenceOrder ?? index + 1));
      });
      return map;
    } catch (error) {
      if (!isSchemaError(error)) throw error;
    }
  }
  return new Map();
}

async function fetchQuotationById(projectId, quotationId) {
  try {
    const header = rows(await pool.query(
      `SELECT
          q.id AS "quotationId",
          q.project_id AS "projectId",
          q.status,
          q.title,
          q.supplier_name AS "supplierName",
          q.reference_no AS "referenceNo",
          q.total_amount AS "totalAmount"
       FROM procurement_quotations q
       WHERE q.id = $1 AND q.project_id = $2 AND COALESCE(q.voided, false) = false
       LIMIT 1`,
      [quotationId, projectId]
    ))[0];
    if (!header) return null;

    const lines = rows(await pool.query(
      `SELECT
          l.id AS "lineId",
          COALESCE(l.line_type, 'planned') AS "lineType",
          l.milestone_name AS "milestoneName",
          l.amount
       FROM procurement_quotation_lines l
       WHERE l.quotation_id = $1 AND COALESCE(l.voided, false) = false
       ORDER BY l.sort_order ASC NULLS LAST, l.id ASC`,
      [quotationId]
    ));
    return { ...header, lines };
  } catch (error) {
    if (isSchemaError(error)) return null;
    throw error;
  }
}

async function fetchLatestQuotationId(projectId) {
  try {
    const latest = rows(await pool.query(
      `SELECT id FROM procurement_quotations
       WHERE project_id = $1 AND COALESCE(voided, false) = false
       ORDER BY
         CASE status
           WHEN 'awarded' THEN 0
           WHEN 'submitted' THEN 1
           WHEN 'draft' THEN 2
           ELSE 3
         END,
         updated_at DESC NULLS LAST,
         id DESC
       LIMIT 1`,
      [projectId]
    ))[0];
    return latest?.id || null;
  } catch (error) {
    if (isSchemaError(error)) return null;
    throw error;
  }
}

async function evaluateFrontLoadForProject(projectId, rule = {}) {
  const condition = rule.condition_json || {};
  const earlyFraction = Number(condition.earlyFraction ?? 0.33);
  const minRiskLevel = condition.minRiskLevel || 'medium';

  const plannedLines = await fetchPlannedBqLines(projectId);
  const milestoneOrder = await fetchMilestoneSequenceMap(projectId);
  const quotationId = await fetchLatestQuotationId(projectId);
  if (!quotationId) return null;

  const quotation = await fetchQuotationById(projectId, quotationId);
  if (!quotation) return null;

  const plannedGroups = groupLinesByMilestone(
    plannedLines.map((row) => ({ milestoneName: row.milestoneName, amount: row.budgetAmount })),
    milestoneOrder
  );
  const plannedTotal = plannedGroups.reduce((sum, g) => sum + g.total, 0);
  const plannedQuoteLines = quotationLinesForComparison(quotation.lines || []);
  const quotedGroups = groupLinesByMilestone(
    plannedQuoteLines.map((row) => ({ milestoneName: row.milestoneName, amount: row.amount })),
    milestoneOrder
  );
  const plannedQuotedTotal = plannedQuoteLines.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  if (plannedTotal <= 0 || plannedQuotedTotal <= 0) return null;

  const frontLoad = computeFrontLoadRisk(plannedGroups, quotedGroups, { earlyFraction });
  if (!meetsMinRiskLevel(frontLoad.riskLevel, minRiskLevel)) return null;

  return {
    quotationId,
    quotationStatus: quotation.status,
    quotationTitle: quotation.title,
    supplierName: quotation.supplierName,
    frontLoad,
    plannedTotal,
    quotedTotal: plannedQuotedTotal,
  };
}

async function listProjectsWithQuotations() {
  try {
    return rows(await pool.query(
      `SELECT DISTINCT
          p.project_id AS "projectId",
          p.name AS "projectName",
          COALESCE(NULLIF(TRIM(p.state_department), ''), 'Unassigned') AS department,
          COALESCE(NULLIF(TRIM(p.implementing_agency), ''), 'Unassigned') AS section,
          COALESCE(NULLIF(TRIM(p.location->>'ward'), ''), 'Unspecified') AS ward,
          COALESCE(NULLIF(TRIM(p.timeline->>'financial_year'), ''), '') AS "financialYear"
       FROM projects p
       INNER JOIN procurement_quotations q ON q.project_id = p.project_id AND COALESCE(q.voided, false) = false
       WHERE COALESCE(p.voided, false) = false
         AND COALESCE(p.progress->>'status', '') NOT ILIKE '%complete%'
         AND q.status IN ('awarded', 'submitted', 'draft')
       ORDER BY p.project_id ASC`
    ));
  } catch (error) {
    if (isSchemaError(error)) return [];
    throw error;
  }
}

async function evaluateFrontLoadHits(rule) {
  const projects = await listProjectsWithQuotations();
  const hits = [];

  for (const project of projects) {
    try {
      const analysis = await evaluateFrontLoadForProject(project.projectId, rule);
      if (!analysis) continue;

      const { frontLoad } = analysis;
      hits.push({
        projectId: project.projectId,
        department: project.department,
        section: project.section,
        ward: project.ward,
        financialYear: project.financialYear,
        severity: frontLoad.riskLevel === 'high' ? 'high' : 'medium',
        title: 'Quotation front-load risk',
        message: `Quoted early-milestone share is ${frontLoad.quotedEarlyPercent}% vs planned ${frontLoad.plannedEarlyPercent}% (index ${frontLoad.frontLoadIndex}).`,
        evidence: {
          quotationId: analysis.quotationId,
          quotationStatus: analysis.quotationStatus,
          quotationTitle: analysis.quotationTitle,
          supplierName: analysis.supplierName,
          frontLoadIndex: frontLoad.frontLoadIndex,
          plannedEarlyPercent: frontLoad.plannedEarlyPercent,
          quotedEarlyPercent: frontLoad.quotedEarlyPercent,
          alerts: frontLoad.alerts,
        },
      });
    } catch (error) {
      if (!isSchemaError(error)) throw error;
    }
  }

  return hits;
}

module.exports = {
  computeFrontLoadRisk,
  groupLinesByMilestone,
  quotationLinesForComparison,
  normalizeQuotationLineType,
  evaluateFrontLoadForProject,
  evaluateFrontLoadHits,
};
