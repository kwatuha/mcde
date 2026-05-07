import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const text = (v) => (v == null ? '' : String(v));

function pick(obj, keys, fallback = '') {
  const keyList = Array.isArray(keys) ? keys : [keys];
  for (const k of keyList) {
    if (obj[k] != null && obj[k] !== '') return obj[k];
  }
  return fallback;
}

/** Display labels for PDF / simple tables */
export function normalizeStatus(raw) {
  const s = text(raw).trim().toLowerCase();
  if (!s) return 'Other';
  if (s.includes('complete')) return 'Completed';
  if (s.includes('progress') || s.includes('ongoing') || s.includes('active')) return 'In Progress';
  if (s.includes('procure')) return 'Under Procurement';
  if (s.includes('terminate') || s.includes('cancel')) return 'Terminated';
  if (s.includes('stalled') || s.includes('delay') || s.includes('risk') || s.includes('hold')) return 'Stalled';
  return 'Other';
}

/** Internal buckets aligned with imes `normalizeStatus` */
function normalizeStatusMEKey(raw) {
  const value = text(raw).trim().toLowerCase();
  if (!value) return 'other';
  if (value.includes('stalled')) return 'stalled';
  if (value.includes('terminate')) return 'terminated';
  if (value.includes('procurement')) return 'under_procurement';
  if (value.includes('progress') || value.includes('ongoing')) return 'in_progress';
  if (value.includes('completed') || value.includes('closed')) return 'completed';
  return 'other';
}

function formatDateForExcel(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function numberOrBlank(value) {
  if (value === null || value === undefined || value === '') return '';
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : '';
}

function computeProgress(project) {
  const explicitProgress = Number(pick(project, ['overallProgress', 'progress']));
  if (Number.isFinite(explicitProgress) && explicitProgress > 0) {
    return explicitProgress;
  }
  switch (normalizeStatusMEKey(pick(project, ['status', 'projectStatus', 'project_status']))) {
    case 'completed':
      return 100;
    case 'in_progress':
      return 50;
    case 'stalled':
      return 0;
    default:
      return '';
  }
}

function composeGeoLocation(project) {
  const coords = [];
  const ward = pick(project, ['wardCoordinates', 'ward_coordinates']);
  const sub = pick(project, ['subCountyCoordinates', 'sub_county_coordinates']);
  if (ward) coords.push(ward);
  if (sub) coords.push(sub);
  return coords.join(' | ');
}

const COL_COUNT = 46;

const PROJECT_HEADERS = [
  '#',
  'Project Name',
  'Project Description',
  'Objective',
  'Expected Output',
  'Project Reference No.',
  'Sub-Programme / Category',
  'Sub-County(ies)',
  'Ward(s)',
  'Geolocation (lat, lon)',
  'Programme',
  'Department / Directorate',
  'Section',
  'Financial Year (approval)',
  'Start Date',
  'End Date',
  'Actual Project Completion Date',
  'Cost of Project (Ksh)',
  'Approved Project Cost (Ksh)',
  'Funds Available in Year (Ksh)',
  'Proposed Source of Financing',
  '—',
  '—',
  '—',
  'Amount Disbursed (Ksh)',
  'Absorption Rate (%)',
  'Amount Disbursed — cumulative (Ksh)',
  '—',
  'Project Balance (Ksh)',
  'Project Status',
  'Overall Progress (%)',
  'Stalled — Progress (%)',
  'Stalled — Reason',
  '—',
  '—',
  '—',
  'Stalled — Action (Complete)',
  'Status Remarks (stalled / other)',
  '—',
  '—',
  '—',
  '—',
  'Status Reason / Remarks',
  '—',
  '—',
];

function buildMERow(project, index) {
  const normalizedStatus = normalizeStatusMEKey(pick(project, ['status', 'projectStatus', 'project_status']));
  const progress = computeProgress(project);
  const costOfProject = numberOrBlank(
    pick(project, ['costOfProject', 'allocatedBudget', 'allocated_amount_kes', 'projectCost'])
  );
  const approvedProjectCost = numberOrBlank(
    pick(project, ['approvedProjectCost', 'costOfProject', 'allocatedBudget', 'allocated_amount_kes'])
  );
  const disbursedAmount = numberOrBlank(
    pick(project, ['paidOut', 'disbursed_amount_kes', 'amountPaid'])
  );
  const currentYearFunds = numberOrBlank(
    pick(project, ['fundsAvailableInYear', 'costOfProject', 'allocatedBudget', 'allocated_amount_kes'])
  );
  const projectBalance =
    approvedProjectCost !== '' && disbursedAmount !== ''
      ? Number(approvedProjectCost) - Number(disbursedAmount)
      : '';

  const core = [
    index + 1,
    pick(project, ['projectName', 'name']),
    pick(project, ['projectDescription', 'description']),
    pick(project, ['objective']),
    pick(project, ['expectedOutput', 'expected_output']),
    pick(project, ['projectRefNum', 'ProjectRefNum', 'projectCode']),
    pick(project, ['subProgramName', 'categoryName', 'projectType']),
    pick(project, ['subCountyNames', 'subCountyName', 'subcounty', 'subCounty']),
    pick(project, ['wardNames', 'wardName', 'ward']),
    composeGeoLocation(project),
    pick(project, ['programName', 'programme']),
    pick(project, ['departmentName', 'directorate', 'ministry']),
    pick(project, ['sectionName', 'section', 'directorate', 'departmentName']),
    pick(project, ['finYearName', 'financialYear', 'fin_year']),
    formatDateForExcel(pick(project, ['startDate'])),
    formatDateForExcel(pick(project, ['endDate'])),
    '',
    costOfProject,
    approvedProjectCost,
    currentYearFunds,
    pick(project, ['proposedSourceFinancing', 'fundingSource']),
    '',
    '',
    '',
    disbursedAmount,
    approvedProjectCost !== '' && disbursedAmount !== '' && Number(approvedProjectCost) !== 0
      ? Number(((Number(disbursedAmount) / Number(approvedProjectCost)) * 100).toFixed(2))
      : '',
    disbursedAmount,
    '',
    projectBalance !== '' ? Number(projectBalance.toFixed(2)) : '',
    pick(project, ['status', 'projectStatus', 'project_status']),
    progress,
    normalizedStatus === 'stalled' ? progress : '',
    normalizedStatus === 'stalled' ? pick(project, ['statusReason', 'status_reason', 'delayReason']) : '',
    '',
    '',
    '',
    '',
    normalizedStatus === 'stalled' ? 'Complete' : '',
    ['stalled', 'other'].includes(normalizedStatus)
      ? pick(project, ['statusReason', 'status_reason', 'delayReason'])
      : '',
    '',
    '',
    '',
    '',
    pick(project, ['statusReason', 'status_reason', 'delayReason']),
  ];

  while (core.length < COL_COUNT) core.push('');
  return core.slice(0, COL_COUNT);
}

function splitGroupedNames(value) {
  const t = text(value);
  if (!t) return [];
  if (t.includes('|')) return t.split('|').map((x) => x.trim()).filter(Boolean);
  return t
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildMESummary(projects) {
  return projects.reduce(
    (summary, project) => {
      const status = normalizeStatusMEKey(pick(project, ['status', 'projectStatus', 'project_status']));
      if (status === 'stalled') summary.stalled += 1;
      else if (status === 'in_progress') summary.inProgress += 1;
      else if (status === 'completed') summary.completed += 1;
      else if (status === 'terminated') summary.terminated += 1;
      else if (status === 'under_procurement') summary.underProcurement += 1;
      else summary.other += 1;
      return summary;
    },
    { stalled: 0, inProgress: 0, completed: 0, terminated: 0, underProcurement: 0, other: 0 }
  );
}

function buildYearlySummary(projects) {
  const yearlyMap = new Map();

  projects.forEach((project) => {
    const yearKey =
      pick(project, ['finYearName', 'financialYear']) ||
      (pick(project, ['startDate']) ? String(new Date(pick(project, ['startDate'])).getFullYear()) : 'Unspecified');

    if (!yearlyMap.has(yearKey)) {
      yearlyMap.set(yearKey, {
        label: yearKey,
        completed: 0,
        ongoing: 0,
        terminated: 0,
        underProcurement: 0,
        other: 0,
        totalBudget: 0,
      });
    }

    const entry = yearlyMap.get(yearKey);
    entry.totalBudget += Number(pick(project, ['costOfProject', 'allocatedBudget', 'allocated_amount_kes'])) || 0;
    const status = normalizeStatusMEKey(pick(project, ['status', 'projectStatus', 'project_status']));
    if (status === 'completed') entry.completed += 1;
    else if (status === 'in_progress' || status === 'stalled') entry.ongoing += 1;
    else if (status === 'terminated') entry.terminated += 1;
    else if (status === 'under_procurement') entry.underProcurement += 1;
    else entry.other += 1;
  });

  return [...yearlyMap.values()].sort((a, b) => a.label.localeCompare(b.label));
}

function buildCoverageSummary(projects, fieldKeys) {
  const coverageMap = new Map();

  projects.forEach((project) => {
    const raw = pick(project, fieldKeys);
    const names = splitGroupedNames(raw);
    const budget = Number(pick(project, ['costOfProject', 'allocatedBudget', 'allocated_amount_kes'])) || 0;

    if (!names.length) {
      const key = 'Unspecified';
      if (!coverageMap.has(key)) {
        coverageMap.set(key, { name: key, projectCount: 0, totalBudget: 0 });
      }
      const unspecifiedEntry = coverageMap.get(key);
      unspecifiedEntry.projectCount += 1;
      unspecifiedEntry.totalBudget += budget;
      return;
    }

    names.forEach((name) => {
      if (!coverageMap.has(name)) {
        coverageMap.set(name, { name, projectCount: 0, totalBudget: 0 });
      }
      const entry = coverageMap.get(name);
      entry.projectCount += 1;
      entry.totalBudget += budget;
    });
  });

  return [...coverageMap.values()].sort((a, b) => {
    if (b.projectCount !== a.projectCount) return b.projectCount - a.projectCount;
    return a.name.localeCompare(b.name);
  });
}

const ME_BORDER_THIN = { style: 'thin', color: { argb: 'FFB4B4B4' } };
const ME_HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2F5496' } };
const ME_HEADER_FONT = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
const ME_SUBTITLE_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD6DCE4' } };
const ME_SUBTITLE_FONT = { bold: true, color: { argb: 'FF1F3864' }, size: 12 };
const ME_TOTAL_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFB4C7E7' } };
const ME_ZEBRA_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8F9FB' } };

function meBorderAll(cell) {
  cell.border = {
    top: ME_BORDER_THIN,
    left: ME_BORDER_THIN,
    bottom: ME_BORDER_THIN,
    right: ME_BORDER_THIN,
  };
}

function styleHeaderRow(worksheet, rowNumber, fromCol, toCol) {
  for (let col = fromCol; col <= toCol; col += 1) {
    const cell = worksheet.getRow(rowNumber).getCell(col);
    cell.fill = ME_HEADER_FILL;
    cell.font = ME_HEADER_FONT;
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    meBorderAll(cell);
  }
}

function styleDataRow(worksheet, rowNumber, fromCol, toCol, zebra) {
  const fill = zebra ? ME_ZEBRA_FILL : undefined;
  for (let col = fromCol; col <= toCol; col += 1) {
    const cell = worksheet.getRow(rowNumber).getCell(col);
    if (fill) cell.fill = fill;
    cell.alignment = { vertical: 'middle', horizontal: col === fromCol ? 'left' : 'right' };
    meBorderAll(cell);
  }
}

function styleTotalRow(worksheet, rowNumber, fromCol, toCol) {
  for (let col = fromCol; col <= toCol; col += 1) {
    const cell = worksheet.getRow(rowNumber).getCell(col);
    cell.fill = ME_TOTAL_FILL;
    cell.font = { bold: true };
    cell.alignment = { vertical: 'middle', horizontal: col === fromCol ? 'left' : 'right' };
    meBorderAll(cell);
  }
}

function styleSummaryStatusBlock(worksheet) {
  worksheet.getCell('C4').font = { bold: true, size: 12 };
  worksheet.getCell('C4').fill = ME_SUBTITLE_FILL;
  worksheet.getCell('C4').alignment = { horizontal: 'center' };

  for (let r = 5; r <= 11; r += 1) {
    for (let c = 2; c <= 3; c += 1) {
      const cell = worksheet.getRow(r).getCell(c);
      meBorderAll(cell);
      if (r <= 10) {
        cell.alignment = { vertical: 'middle', horizontal: c === 2 ? 'left' : 'right' };
        if (r % 2 === 0) cell.fill = ME_ZEBRA_FILL;
      }
    }
  }
  const totalCellB = worksheet.getCell('B11');
  const totalCellC = worksheet.getCell('C11');
  totalCellB.font = { bold: true };
  totalCellC.font = { bold: true };
  totalCellB.fill = ME_TOTAL_FILL;
  totalCellC.fill = ME_TOTAL_FILL;
  worksheet.getColumn(2).width = 28;
  worksheet.getColumn(3).width = 14;
}

function writeYearlySheet(worksheet, yearlySummary) {
  worksheet.getCell('B2').value = 'Year';
  worksheet.getCell('C2').value = 'Completed';
  worksheet.getCell('D2').value = 'Ongoing';
  worksheet.getCell('E2').value = 'Terminated';
  worksheet.getCell('F2').value = 'Under Procurement';
  worksheet.getCell('G2').value = 'Other';
  worksheet.getCell('H2').value = 'Total';
  worksheet.getCell('I2').value = 'Budget (Ksh)';
  styleHeaderRow(worksheet, 2, 2, 9);

  let sumCompleted = 0;
  let sumOngoing = 0;
  let sumTerminated = 0;
  let sumUnder = 0;
  let sumOther = 0;
  let sumBudget = 0;

  yearlySummary.forEach((item, index) => {
    const row = 3 + index;
    const rowTotal =
      item.completed + item.ongoing + item.terminated + item.underProcurement + item.other;

    sumCompleted += item.completed;
    sumOngoing += item.ongoing;
    sumTerminated += item.terminated;
    sumUnder += item.underProcurement;
    sumOther += item.other;
    sumBudget += item.totalBudget;

    worksheet.getCell(`B${row}`).value = item.label;
    worksheet.getCell(`C${row}`).value = item.completed;
    worksheet.getCell(`D${row}`).value = item.ongoing;
    worksheet.getCell(`E${row}`).value = item.terminated;
    worksheet.getCell(`F${row}`).value = item.underProcurement;
    worksheet.getCell(`G${row}`).value = item.other;
    worksheet.getCell(`H${row}`).value = rowTotal;
    worksheet.getCell(`I${row}`).value = item.totalBudget;
    worksheet.getCell(`I${row}`).numFmt = '#,##0';

    styleDataRow(worksheet, row, 2, 9, index % 2 === 1);
  });

  const totalRow = 3 + yearlySummary.length;
  const grandTotalProjects = sumCompleted + sumOngoing + sumTerminated + sumUnder + sumOther;

  worksheet.getCell(`B${totalRow}`).value = 'Total';
  worksheet.getCell(`C${totalRow}`).value = sumCompleted;
  worksheet.getCell(`D${totalRow}`).value = sumOngoing;
  worksheet.getCell(`E${totalRow}`).value = sumTerminated;
  worksheet.getCell(`F${totalRow}`).value = sumUnder;
  worksheet.getCell(`G${totalRow}`).value = sumOther;
  worksheet.getCell(`H${totalRow}`).value = grandTotalProjects;
  worksheet.getCell(`I${totalRow}`).value = sumBudget;
  worksheet.getCell(`I${totalRow}`).numFmt = '#,##0';

  styleTotalRow(worksheet, totalRow, 2, 9);

  worksheet.getColumn(2).width = 22;
  worksheet.getColumn(9).width = 18;
  worksheet.views = [{ state: 'frozen', ySplit: 2 }];
}

function writeCoverageSheet(worksheet, subCountyCoverage, wardCoverage) {
  let row = 1;
  worksheet.getCell(`B${row}`).value = 'Coverage by Sub-County';
  worksheet.getCell(`B${row}`).font = ME_SUBTITLE_FONT;
  worksheet.getCell(`B${row}`).fill = ME_SUBTITLE_FILL;
  row += 1;

  worksheet.getCell(`B${row}`).value = 'Name';
  worksheet.getCell(`C${row}`).value = 'Projects';
  worksheet.getCell(`D${row}`).value = 'Budget (Ksh)';
  styleHeaderRow(worksheet, row, 2, 4);
  row += 1;

  let sumProjects = 0;
  let sumBudget = 0;

  subCountyCoverage.forEach((item, index) => {
    worksheet.getCell(`B${row}`).value = item.name;
    worksheet.getCell(`C${row}`).value = item.projectCount;
    worksheet.getCell(`D${row}`).value = item.totalBudget;
    worksheet.getCell(`D${row}`).numFmt = '#,##0';
    sumProjects += item.projectCount;
    sumBudget += item.totalBudget;
    styleDataRow(worksheet, row, 2, 4, index % 2 === 1);
    row += 1;
  });

  worksheet.getCell(`B${row}`).value = 'Sub-county total';
  worksheet.getCell(`C${row}`).value = sumProjects;
  worksheet.getCell(`D${row}`).value = sumBudget;
  worksheet.getCell(`D${row}`).numFmt = '#,##0';
  styleTotalRow(worksheet, row, 2, 4);
  row += 2;

  worksheet.getCell(`B${row}`).value = 'Coverage by Ward';
  worksheet.getCell(`B${row}`).font = ME_SUBTITLE_FONT;
  worksheet.getCell(`B${row}`).fill = ME_SUBTITLE_FILL;
  row += 1;

  worksheet.getCell(`B${row}`).value = 'Name';
  worksheet.getCell(`C${row}`).value = 'Projects';
  worksheet.getCell(`D${row}`).value = 'Budget (Ksh)';
  styleHeaderRow(worksheet, row, 2, 4);
  row += 1;

  let wardSumProjects = 0;
  let wardSumBudget = 0;

  wardCoverage.forEach((item, index) => {
    worksheet.getCell(`B${row}`).value = item.name;
    worksheet.getCell(`C${row}`).value = item.projectCount;
    worksheet.getCell(`D${row}`).value = item.totalBudget;
    worksheet.getCell(`D${row}`).numFmt = '#,##0';
    wardSumProjects += item.projectCount;
    wardSumBudget += item.totalBudget;
    styleDataRow(worksheet, row, 2, 4, index % 2 === 1);
    row += 1;
  });

  worksheet.getCell(`B${row}`).value = 'Ward total';
  worksheet.getCell(`C${row}`).value = wardSumProjects;
  worksheet.getCell(`D${row}`).value = wardSumBudget;
  worksheet.getCell(`D${row}`).numFmt = '#,##0';
  styleTotalRow(worksheet, row, 2, 4);

  worksheet.getColumn(2).width = 36;
  worksheet.getColumn(3).width = 12;
  worksheet.getColumn(4).width = 18;
}

const MONEY_COLS_1BASE = new Set([18, 19, 20, 25, 27, 29]);

function populateProjectsSheet(wb, rows) {
  const sheet = wb.addWorksheet('Projects');
  sheet.mergeCells(1, 1, 1, COL_COUNT);
  const title = sheet.getCell(1, 1);
  title.value = 'County projects — monitoring & evaluation register';
  title.font = { bold: true, size: 14, color: { argb: 'FF1F3864' } };
  title.alignment = { vertical: 'middle', horizontal: 'center' };
  title.fill = ME_SUBTITLE_FILL;

  const headerRow = sheet.getRow(2);
  PROJECT_HEADERS.forEach((h, i) => {
    headerRow.getCell(i + 1).value = h;
  });
  styleHeaderRow(sheet, 2, 1, COL_COUNT);

  rows.forEach((project, idx) => {
    const r = sheet.addRow(buildMERow(project, idx));
    const excelRow = r.number;
    const zebra = idx % 2 === 1;
    for (let c = 1; c <= COL_COUNT; c += 1) {
      const cell = sheet.getRow(excelRow).getCell(c);
      if (zebra) cell.fill = ME_ZEBRA_FILL;
      const isNumber = typeof cell.value === 'number';
      cell.alignment = {
        vertical: 'middle',
        horizontal: isNumber ? 'right' : 'left',
        wrapText: [3, 4, 5, 9].includes(c),
      };
      meBorderAll(cell);
      if (MONEY_COLS_1BASE.has(c) && isNumber) {
        cell.numFmt = '#,##0.00';
      }
      if (c === 26 && isNumber) {
        cell.numFmt = '0.00';
      }
    }
  });

  sheet.getColumn(2).width = 42;
  sheet.getColumn(3).width = 36;
  sheet.getColumn(4).width = 28;
  sheet.getColumn(5).width = 28;
  sheet.getColumn(9).width = 28;
  sheet.views = [{ state: 'frozen', ySplit: 2 }];
}

function populateSummarySheet(wb, rows) {
  const sheet = wb.addWorksheet('Summary');
  sheet.mergeCells('B2:C2');
  sheet.getCell('B2').value = 'Project counts by status';
  sheet.getCell('B2').font = ME_SUBTITLE_FONT;
  sheet.getCell('B2').fill = ME_SUBTITLE_FILL;
  sheet.getCell('B2').alignment = { horizontal: 'center' };

  sheet.getCell('B4').value = 'Indicator';
  sheet.getCell('C4').value = 'No. of projects';

  const summary = buildMESummary(rows);
  const lines = [
    ['Stalled', summary.stalled],
    ['In Progress', summary.inProgress],
    ['Completed', summary.completed],
    ['Terminated', summary.terminated],
    ['Under Procurement', summary.underProcurement],
    ['Other', summary.other],
  ];

  lines.forEach(([label, val], i) => {
    sheet.getCell(`B${5 + i}`).value = label;
    sheet.getCell(`C${5 + i}`).value = val;
  });

  const total =
    summary.stalled +
    summary.inProgress +
    summary.completed +
    summary.terminated +
    summary.underProcurement +
    summary.other;
  sheet.getCell('B11').value = 'Total';
  sheet.getCell('C11').value = total;

  styleSummaryStatusBlock(sheet);
}

export function buildSummaryTables(rows) {
  const statusCounts = new Map();
  const yearly = new Map();
  const subCoverage = new Map();
  const wardCoverage = new Map();

  rows.forEach((r) => {
    const status = normalizeStatus(pick(r, ['status', 'projectStatus', 'project_status'], 'Other'));
    statusCounts.set(status, (statusCounts.get(status) || 0) + 1);

    const budget = num(pick(r, ['costOfProject', 'allocatedBudget', 'allocated_amount_kes', 'projectCost'], 0));
    const year = (() => {
      const t = text(
        pick(r, ['finYearName', 'financialYear', 'startDate', 'createdAt'], 'Unspecified')
      );
      if (!t) return 'Unspecified';
      if (/^\d{4}$/.test(t)) return t;
      const d = new Date(t);
      if (!Number.isNaN(d.getTime())) return String(d.getFullYear());
      const m = t.match(/(20\d{2}|19\d{2})/);
      return m ? m[1] : 'Unspecified';
    })();
    const y = yearly.get(year) || { completed: 0, ongoing: 0, terminated: 0, under: 0, other: 0, budget: 0 };
    if (status === 'Completed') y.completed += 1;
    else if (status === 'In Progress' || status === 'Stalled') y.ongoing += 1;
    else if (status === 'Terminated') y.terminated += 1;
    else if (status === 'Under Procurement') y.under += 1;
    else y.other += 1;
    y.budget += budget;
    yearly.set(year, y);

    const subs = splitGroupedNames(pick(r, ['subCountyNames', 'subCountyName', 'subcounty', 'subCounty'], 'Unspecified'));
    const wards = splitGroupedNames(pick(r, ['wardNames', 'wardName', 'ward'], 'Unspecified'));
    (subs.length ? subs : ['Unspecified']).forEach((name) => {
      const e = subCoverage.get(name) || { count: 0, budget: 0 };
      e.count += 1;
      e.budget += budget;
      subCoverage.set(name, e);
    });
    (wards.length ? wards : ['Unspecified']).forEach((name) => {
      const e = wardCoverage.get(name) || { count: 0, budget: 0 };
      e.count += 1;
      e.budget += budget;
      wardCoverage.set(name, e);
    });
  });

  const statusRows = ['Stalled', 'In Progress', 'Completed', 'Terminated', 'Under Procurement', 'Other'].map(
    (k) => [k, statusCounts.get(k) || 0]
  );
  const yearlyRows = [...yearly.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([year, v]) => [
      year,
      v.completed,
      v.ongoing,
      v.terminated,
      v.under,
      v.other,
      v.completed + v.ongoing + v.terminated + v.under + v.other,
      Number(v.budget.toFixed(2)),
    ]);
  const covSub = [...subCoverage.entries()]
    .sort((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0]))
    .map(([n, v]) => [n, v.count, Number(v.budget.toFixed(2))]);
  const covWard = [...wardCoverage.entries()]
    .sort((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0]))
    .map(([n, v]) => [n, v.count, Number(v.budget.toFixed(2))]);
  return { statusRows, yearlyRows, covSub, covWard };
}

/** Multi-sheet workbook (xlsx-only; no ExcelJS dependency). */
export async function exportMEReportExcel(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const wb = XLSX.utils.book_new();

  const projectsAoa = [
    PROJECT_HEADERS,
    ...list.map((project, idx) => buildMERow(project, idx)),
  ];
  const wsProjects = XLSX.utils.aoa_to_sheet(projectsAoa);
  wsProjects['!cols'] = PROJECT_HEADERS.map((_, i) => {
    if (i === 1) return { wch: 42 };
    if (i === 2) return { wch: 36 };
    if (i === 3 || i === 4) return { wch: 28 };
    if (i === 8) return { wch: 28 };
    return { wch: 16 };
  });
  XLSX.utils.book_append_sheet(wb, wsProjects, 'Projects');

  const summary = buildMESummary(list);
  const summaryRows = [
    ['Indicator', 'No. of projects'],
    ['Stalled', summary.stalled],
    ['In Progress', summary.inProgress],
    ['Completed', summary.completed],
    ['Terminated', summary.terminated],
    ['Under Procurement', summary.underProcurement],
    ['Other', summary.other],
    ['Total', summary.stalled + summary.inProgress + summary.completed + summary.terminated + summary.underProcurement + summary.other],
  ];
  const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
  wsSummary['!cols'] = [{ wch: 28 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');

  const yearly = buildYearlySummary(list);
  const yearlyAoa = [
    ['Year', 'Completed', 'Ongoing', 'Terminated', 'Under Procurement', 'Other', 'Total', 'Budget (Ksh)'],
    ...yearly.map((y) => [
      y.label,
      y.completed,
      y.ongoing,
      y.terminated,
      y.underProcurement,
      y.other,
      y.completed + y.ongoing + y.terminated + y.underProcurement + y.other,
      Number(y.totalBudget || 0),
    ]),
  ];
  const wsYearly = XLSX.utils.aoa_to_sheet(yearlyAoa);
  wsYearly['!cols'] = [{ wch: 22 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 18 }, { wch: 10 }, { wch: 10 }, { wch: 18 }];
  XLSX.utils.book_append_sheet(wb, wsYearly, 'yearly');

  const covSub = buildCoverageSummary(list, ['subCountyNames', 'subCountyName', 'subcounty', 'subCounty']);
  const covWard = buildCoverageSummary(list, ['wardNames', 'wardName', 'ward']);
  const coverageAoa = [
    ['Coverage by Sub-County'],
    ['Name', 'Projects', 'Budget (Ksh)'],
    ...covSub.map((r) => [r.name, r.projectCount, Number(r.totalBudget || 0)]),
    [],
    ['Coverage by Ward'],
    ['Name', 'Projects', 'Budget (Ksh)'],
    ...covWard.map((r) => [r.name, r.projectCount, Number(r.totalBudget || 0)]),
  ];
  const wsCoverage = XLSX.utils.aoa_to_sheet(coverageAoa);
  wsCoverage['!cols'] = [{ wch: 36 }, { wch: 12 }, { wch: 18 }];
  XLSX.utils.book_append_sheet(wb, wsCoverage, 'coverage');

  const fileName = `me_report_${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(wb, fileName);
}

export function exportMESummaryPdf(rows) {
  const { statusRows, yearlyRows, covSub, covWard } = buildSummaryTables(rows);
  const doc = new jsPDF('landscape', 'pt', 'a4');
  doc.setFontSize(14);
  doc.text('M&E Report - Summary, yearly & coverage', 36, 30);
  doc.setFontSize(9);
  doc.text(`Generated: ${new Date().toLocaleString()}`, 36, 46);

  autoTable(doc, {
    head: [['Indicator', 'Value']],
    body: [...statusRows, ['Total', statusRows.reduce((s, r) => s + num(r[1]), 0)]],
    startY: 62,
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: [41, 128, 185], textColor: 255 },
  });

  autoTable(doc, {
    head: [['Year', 'Completed', 'Ongoing', 'Terminated', 'Under Procurement', 'Other', 'Total', 'Budget (Ksh)']],
    body: yearlyRows.map((r) => r.map((v) => text(v))),
    startY: (doc.lastAutoTable?.finalY || 80) + 18,
    styles: { fontSize: 7, cellPadding: 2 },
    headStyles: { fillColor: [41, 128, 185], textColor: 255 },
  });

  autoTable(doc, {
    head: [['Sub-County', 'Projects', 'Budget (Ksh)']],
    body: covSub.map((r) => r.map((v) => text(v))),
    startY: (doc.lastAutoTable?.finalY || 140) + 18,
    styles: { fontSize: 7, cellPadding: 2 },
    headStyles: { fillColor: [70, 100, 140], textColor: 255 },
  });

  autoTable(doc, {
    head: [['Ward', 'Projects', 'Budget (Ksh)']],
    body: covWard.map((r) => r.map((v) => text(v))),
    startY: (doc.lastAutoTable?.finalY || 200) + 18,
    styles: { fontSize: 7, cellPadding: 2 },
    headStyles: { fillColor: [70, 100, 140], textColor: 255 },
  });

  doc.save(`me_report_summary_${new Date().toISOString().slice(0, 10)}.pdf`);
}
