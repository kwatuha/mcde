/** Shared DataGrid / export helpers for programme impact rollups. */

export function impactValue(row, key) {
  return row?.impact?.[key] ?? null;
}

export function formatImpactPercent(value) {
  if (value == null || value === '') return '—';
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return `${n.toFixed(1)}%`;
}

export function formatImpactRatio(realized, total) {
  const r = Number(realized || 0);
  const t = Number(total || 0);
  if (!t) return '—';
  return `${r}/${t}`;
}

/** Extra export columns for CIDP/ADP progress workbooks. */
export const IMPACT_EXPORT_COLUMNS = [
  {
    field: 'impactAchievementPercent',
    header: 'Outcome ach. %',
    width: 12,
    format: (v, row) => formatImpactPercent(v ?? impactValue(row, 'achievementPercent')),
  },
  {
    field: 'impactOutcomeLines',
    header: 'Outcome lines',
    width: 12,
    format: (v, row) => Number((v ?? impactValue(row, 'outcomeLines')) || 0),
  },
  {
    field: 'impactBeneficiaries',
    header: 'Benefit realized',
    width: 14,
    format: (v, row) =>
      formatImpactRatio(
        v ?? impactValue(row, 'beneficiariesBenefitRealized'),
        impactValue(row, 'beneficiaries')
      ),
  },
  {
    field: 'impactCommunity',
    header: 'Community benefit yes',
    width: 14,
    format: (v, row) =>
      formatImpactRatio(
        v ?? impactValue(row, 'communityBenefitYes'),
        impactValue(row, 'communityVisits')
      ),
  },
];

/** DataGrid columns for programme impact scorecard. */
export function impactDataGridColumns() {
  return [
    {
      field: 'impactAchievementPercent',
      headerName: 'Outcome ach. %',
      width: 120,
      valueGetter: (_v, row) => impactValue(row, 'achievementPercent'),
      valueFormatter: (value) => formatImpactPercent(value),
    },
    {
      field: 'impactOutcomeLines',
      headerName: 'Outcome lines',
      width: 110,
      type: 'number',
      valueGetter: (_v, row) => Number(impactValue(row, 'outcomeLines') || 0),
    },
    {
      field: 'impactBeneficiaries',
      headerName: 'Benefit realized',
      width: 130,
      valueGetter: (_v, row) =>
        formatImpactRatio(impactValue(row, 'beneficiariesBenefitRealized'), impactValue(row, 'beneficiaries')),
    },
    {
      field: 'impactCommunity',
      headerName: 'Community benefit',
      width: 140,
      valueGetter: (_v, row) =>
        formatImpactRatio(impactValue(row, 'communityBenefitYes'), impactValue(row, 'communityVisits')),
    },
  ];
}

export function summarizeImpactRows(rows = []) {
  const list = Array.isArray(rows) ? rows : [];
  let outcomeLines = 0;
  let evaluationLines = 0;
  let beneficiaries = 0;
  let beneficiariesBenefitRealized = 0;
  let communityVisits = 0;
  let communityBenefitYes = 0;
  let achWeighted = 0;
  let achWeight = 0;
  for (const row of list) {
    const impact = row?.impact || {};
    outcomeLines += Number(impact.outcomeLines || 0);
    evaluationLines += Number(impact.evaluationLines || 0);
    beneficiaries += Number(impact.beneficiaries || 0);
    beneficiariesBenefitRealized += Number(impact.beneficiariesBenefitRealized || 0);
    communityVisits += Number(impact.communityVisits || 0);
    communityBenefitYes += Number(impact.communityBenefitYes || 0);
    const ach = impact.achievementPercent;
    const lines = Number(impact.evaluationLines || 0);
    if (ach != null && Number.isFinite(Number(ach)) && lines > 0) {
      achWeighted += Number(ach) * lines;
      achWeight += lines;
    }
  }
  return {
    outcomeLines,
    evaluationLines,
    beneficiaries,
    beneficiariesBenefitRealized,
    communityVisits,
    communityBenefitYes,
    achievementPercent: achWeight > 0 ? Math.round((achWeighted / achWeight) * 10) / 10 : null,
  };
}
