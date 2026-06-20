import {
  exportPlanningProgressExcel,
  exportPlanningProgressPdf,
  formatCurrency,
  formatNumber,
  formatPercent,
} from './planningProgressExport';

export const BUDGET_TRACEABILITY_EXPORT_COLUMNS = [
  { field: 'budgetName', header: 'Budget', width: 28 },
  { field: 'adpProgrammeName', header: 'ADP programme', width: 30 },
  { field: 'adpProjectName', header: 'ADP row', width: 34 },
  { field: 'registryProjectName', header: 'Registry project', width: 34 },
  { field: 'registryProjectId', header: 'Project ID', width: 10, format: (v) => (v ? formatNumber(v) : '—') },
  { field: 'budgetItemAmount', header: 'Budget item', width: 16, format: (v) => formatCurrency(v) },
  { field: 'projectBudget', header: 'Project budget', width: 16, format: (v) => formatCurrency(v) },
  { field: 'projectPaid', header: 'Paid', width: 14, format: (v) => formatCurrency(v) },
  { field: 'projectProgress', header: 'Progress', width: 12, format: (v) => formatPercent(v) },
];

export function buildBudgetTraceabilitySummaryRows({ selectedBudgetLabel, summary, rows }) {
  const linked = rows.filter((row) => row.registryProjectId);
  return [
    { label: 'Budget filter', value: selectedBudgetLabel || 'All budgets' },
    { label: 'Budget items', value: formatNumber(summary.items ?? rows.length) },
    { label: 'Linked registry projects', value: formatNumber(summary.linkedRegistryProjects ?? linked.length) },
    { label: 'Budget items total', value: formatCurrency(summary.totalBudgetItems) },
    { label: 'Registry project budget (sum)', value: formatCurrency(summary.totalProjectBudget) },
    { label: 'Paid (sum)', value: formatCurrency(summary.totalProjectPaid) },
  ];
}

export function exportBudgetTraceabilityExcel(options) {
  return exportPlanningProgressExcel({
    filenamePrefix: 'budget-project-traceability',
    sheetName: 'Traceability',
    summarySheetName: 'Summary',
    title: 'Budget → Project Traceability',
    ...options,
  });
}

export async function exportBudgetTraceabilityPdf(options) {
  return exportPlanningProgressPdf({
    filenamePrefix: 'budget-project-traceability',
    reportTitle: 'Budget → Project Traceability Report',
    ...options,
  });
}

export { formatCurrency, formatNumber, formatPercent };
