import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const text = (v) => (v == null ? '' : String(v));

const pick = (obj, keys, fallback = '') => {
  for (const k of keys) {
    if (obj[k] != null && obj[k] !== '') return obj[k];
  }
  return fallback;
};

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

function toYear(v) {
  const t = text(v);
  if (!t) return 'Unspecified';
  if (/^\d{4}$/.test(t)) return t;
  const d = new Date(t);
  if (!Number.isNaN(d.getTime())) return String(d.getFullYear());
  const m = t.match(/(20\d{2}|19\d{2})/);
  return m ? m[1] : 'Unspecified';
}

function splitNames(v) {
  const t = text(v);
  if (!t) return [];
  if (t.includes('|')) return t.split('|').map((x) => x.trim()).filter(Boolean);
  if (t.includes(',')) return t.split(',').map((x) => x.trim()).filter(Boolean);
  return [t.trim()].filter(Boolean);
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
    const year = toYear(pick(r, ['finYearName', 'financialYear', 'startDate', 'createdAt'], 'Unspecified'));
    const y = yearly.get(year) || { completed: 0, ongoing: 0, terminated: 0, under: 0, other: 0, budget: 0 };
    if (status === 'Completed') y.completed += 1;
    else if (status === 'In Progress' || status === 'Stalled') y.ongoing += 1;
    else if (status === 'Terminated') y.terminated += 1;
    else if (status === 'Under Procurement') y.under += 1;
    else y.other += 1;
    y.budget += budget;
    yearly.set(year, y);

    const subs = splitNames(pick(r, ['subCountyNames', 'subCountyName', 'subcounty', 'subCounty'], 'Unspecified'));
    const wards = splitNames(pick(r, ['wardNames', 'wardName', 'ward'], 'Unspecified'));
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

  const statusRows = ['Stalled', 'In Progress', 'Completed', 'Terminated', 'Under Procurement', 'Other'].map((k) => [k, statusCounts.get(k) || 0]);
  const yearlyRows = [...yearly.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([year, v]) => [year, v.completed, v.ongoing, v.terminated, v.under, v.other, v.completed + v.ongoing + v.terminated + v.under + v.other, Number(v.budget.toFixed(2))]);
  const covSub = [...subCoverage.entries()].sort((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0])).map(([n, v]) => [n, v.count, Number(v.budget.toFixed(2))]);
  const covWard = [...wardCoverage.entries()].sort((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0])).map(([n, v]) => [n, v.count, Number(v.budget.toFixed(2))]);
  return { statusRows, yearlyRows, covSub, covWard };
}

export function exportMEReportExcel(rows) {
  const wb = XLSX.utils.book_new();
  const { statusRows, yearlyRows, covSub, covWard } = buildSummaryTables(rows);

  const projectsAoa = [
    ['Project Name', 'Reference', 'Status', 'Start Date', 'End Date', 'Budget', 'Paid Out', 'Directorate', 'Sub-Counties', 'Wards'],
    ...rows.map((r) => [
      pick(r, ['projectName', 'name']),
      pick(r, ['projectRefNum', 'ProjectRefNum', 'projectCode']),
      pick(r, ['status', 'projectStatus', 'project_status']),
      pick(r, ['startDate']),
      pick(r, ['endDate']),
      num(pick(r, ['costOfProject', 'allocatedBudget', 'allocated_amount_kes'])),
      num(pick(r, ['paidOut', 'disbursed_amount_kes', 'amountPaid'])),
      pick(r, ['directorate', 'departmentName', 'ministry']),
      pick(r, ['subCountyNames', 'subCountyName']),
      pick(r, ['wardNames', 'wardName']),
    ]),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(projectsAoa), 'Projects');

  const summaryAoa = [['Indicator', 'Value'], ...statusRows, ['Total', statusRows.reduce((s, r) => s + num(r[1]), 0)]];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryAoa), 'Summary');

  const yearlyAoa = [['Year', 'Completed', 'Ongoing', 'Terminated', 'Under Procurement', 'Other', 'Total', 'Budget (Ksh)'], ...yearlyRows];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(yearlyAoa), 'yearly');

  const coverageAoa = [
    ['Coverage by Sub-County'],
    ['Name', 'Projects', 'Budget (Ksh)'],
    ...covSub,
    [],
    ['Coverage by Ward'],
    ['Name', 'Projects', 'Budget (Ksh)'],
    ...covWard,
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(coverageAoa), 'coverage');

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
