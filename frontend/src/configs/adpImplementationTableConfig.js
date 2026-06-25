export const ADP_COLUMN_STORAGE_KEY = 'adpImplementationColumnVisibility';

export const adpImplementationColumns = [
  { id: 'projectName', label: 'ADP Project', minWidth: 260, show: true, exportHeader: 'ADP Project' },
  { id: 'sectorName', label: 'Sector', minWidth: 140, show: true, exportHeader: 'Sector' },
  { id: 'programmeName', label: 'Programme', minWidth: 160, show: true, exportHeader: 'Programme' },
  { id: 'subprogrammeName', label: 'Subprogramme', minWidth: 160, show: false, exportHeader: 'Subprogramme' },
  { id: 'locationText', label: 'Location', minWidth: 180, show: true, exportHeader: 'Location' },
  { id: 'ward', label: 'Ward', minWidth: 120, show: false, exportHeader: 'Ward' },
  { id: 'sublocation', label: 'Sublocation', minWidth: 130, show: false, exportHeader: 'Sublocation' },
  { id: 'village', label: 'Village', minWidth: 120, show: false, exportHeader: 'Village' },
  { id: 'planStatus', label: 'Status', minWidth: 110, show: true, exportHeader: 'Status' },
  { id: 'priorityLevel', label: 'Priority', minWidth: 130, show: true, exportHeader: 'Priority' },
  { id: 'estimatedCost', label: 'ADP Cost', minWidth: 110, align: 'right', show: true, exportHeader: 'ADP Cost', numeric: true },
  { id: 'budgetedAmount', label: 'Budgeted', minWidth: 110, align: 'right', show: true, exportHeader: 'Budgeted Amount', numeric: true },
  { id: 'budgetCount', label: 'Budget Count', minWidth: 100, align: 'right', show: false, exportHeader: 'Budget Count', numeric: true },
  { id: 'linkedProjectCount', label: 'Linked Projects', minWidth: 110, align: 'right', show: true, exportHeader: 'Linked Projects', numeric: true },
  { id: 'actualBudget', label: 'Actual Budget', minWidth: 110, align: 'right', show: true, exportHeader: 'Actual Budget', numeric: true },
  { id: 'actualPaid', label: 'Paid', minWidth: 100, align: 'right', show: true, exportHeader: 'Paid', numeric: true },
  { id: 'activityDescription', label: 'Activity / Output', minWidth: 200, show: false, exportHeader: 'Activity / Output' },
  { id: 'performanceIndicator', label: 'Performance Indicator', minWidth: 180, show: false, exportHeader: 'Performance Indicator' },
  { id: 'target', label: 'Target', minWidth: 120, show: false, exportHeader: 'Target' },
  { id: 'fundingSource', label: 'Funding Source', minWidth: 140, show: false, exportHeader: 'Funding Source' },
  { id: 'timeframe', label: 'Timeframe', minWidth: 110, show: false, exportHeader: 'Timeframe' },
  { id: 'implementingAgency', label: 'Implementing Agency', minWidth: 160, show: false, exportHeader: 'Implementing Agency' },
  { id: 'actions', label: 'Actions', minWidth: 90, align: 'center', show: true, alwaysVisible: true, exportHeader: null },
];

export function buildDefaultColumnVisibility(columns = adpImplementationColumns) {
  const model = {};
  columns.forEach((col) => {
    model[col.id] = col.alwaysVisible ? true : col.show !== false;
  });
  return model;
}

export function loadColumnVisibility(columns = adpImplementationColumns) {
  const model = buildDefaultColumnVisibility(columns);
  try {
    const saved = localStorage.getItem(ADP_COLUMN_STORAGE_KEY);
    if (!saved) return model;
    const parsed = JSON.parse(saved);
    columns.forEach((col) => {
      if (col.alwaysVisible) {
        model[col.id] = true;
      } else if (typeof parsed[col.id] === 'boolean') {
        model[col.id] = parsed[col.id];
      }
    });
  } catch {
    // ignore invalid saved preferences
  }
  return model;
}

export function getLocationSummary(row) {
  return row.locationText || [row.ward, row.sublocation, row.village].filter(Boolean).join(' / ') || 'County wide';
}

export function getPriorityLabel(level) {
  if (level === 'high') return 'High — budget & link';
  if (level === 'medium') return 'Medium — partial';
  return 'Ready';
}

export function getExportValue(col, row) {
  switch (col.id) {
    case 'projectName':
      return row.projectName || '';
    case 'sectorName':
      return row.sectorName || 'Unspecified';
    case 'programmeName':
      return row.programmeName || '';
    case 'subprogrammeName':
      return row.subprogrammeName || '';
    case 'locationText':
      return getLocationSummary(row);
    case 'ward':
      return row.ward || '';
    case 'sublocation':
      return row.sublocation || '';
    case 'village':
      return row.village || '';
    case 'planStatus':
      return row.planStatus || 'Unspecified';
    case 'priorityLevel':
      return getPriorityLabel(row.priorityLevel);
    case 'estimatedCost':
      return Number(row.estimatedCost || 0);
    case 'budgetedAmount':
      return Number(row.budgetedAmount || 0);
    case 'budgetCount':
      return Number(row.budgetCount || 0);
    case 'linkedProjectCount':
      return Number(row.linkedProjectCount || 0);
    case 'actualBudget':
      return Number(row.actualBudget || 0);
    case 'actualPaid':
      return Number(row.actualPaid || 0);
    case 'activityDescription':
      return row.activityDescription || '';
    case 'performanceIndicator':
      return row.performanceIndicator || '';
    case 'target':
      return row.target || '';
    case 'fundingSource':
      return row.fundingSource || '';
    case 'timeframe':
      return row.timeframe || '';
    case 'implementingAgency':
      return row.implementingAgency || '';
    default:
      return '';
  }
}
