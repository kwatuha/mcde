import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { drawCountyOfficialHeader, getCountyLogoDataUrl } from './countyOfficialPdfHeader';

function formatNumber(value) {
  return Number(value || 0).toLocaleString('en-KE', { maximumFractionDigits: 0 });
}

function formatCurrency(value) {
  return `KES ${Number(value || 0).toLocaleString('en-KE', { maximumFractionDigits: 0 })}`;
}

function formatPercent(value) {
  return `${Number(value || 0).toFixed(1)}%`;
}

export function exportPlanningProgressExcel({
  filenamePrefix,
  sheetName,
  summarySheetName = 'Summary',
  title,
  subtitle = '',
  summaryRows = [],
  columns = [],
  rows = [],
}) {
  const exportRows = rows.map((row) => {
    const mapped = {};
    columns.forEach((col) => {
      mapped[col.header] = col.format ? col.format(row[col.field], row) : (row[col.field] ?? '');
    });
    return mapped;
  });

  const worksheet = XLSX.utils.json_to_sheet(exportRows);
  worksheet['!cols'] = columns.map((col) => ({ wch: col.width || 16 }));

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

  const summaryAoA = [
    [title],
    ...(subtitle ? [[subtitle]] : []),
    [],
    ...summaryRows.map((item) => [item.label, item.value]),
  ];
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(summaryAoA), summarySheetName);

  XLSX.writeFile(workbook, `${filenamePrefix}-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export async function exportPlanningProgressPdf({
  filenamePrefix,
  reportTitle,
  subtitle = '',
  summaryRows = [],
  columns = [],
  rows = [],
}) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const logoDataUrl = await getCountyLogoDataUrl();
  let y = drawCountyOfficialHeader(doc, {
    unit: 'pt',
    logoDataUrl,
    title: reportTitle,
  });
  doc.setFontSize(9);
  doc.text(`Generated: ${new Date().toLocaleString()}${subtitle ? ` | ${subtitle}` : ''}`, 40, y);
  y += 16;

  if (summaryRows.length) {
    autoTable(doc, {
      startY: y,
      head: [['Metric', 'Value']],
      body: summaryRows.map((item) => [item.label, String(item.value)]),
      styles: { fontSize: 8, cellPadding: 4 },
      headStyles: { fillColor: [22, 96, 136] },
      margin: { left: 40, right: 40 },
    });
    y = doc.lastAutoTable.finalY + 12;
  }

  autoTable(doc, {
    startY: y,
    head: [columns.map((col) => col.header)],
    body: rows.map((row) => columns.map((col) => {
      const raw = col.format ? col.format(row[col.field], row) : row[col.field];
      return raw == null || raw === '' ? '—' : String(raw);
    })),
    styles: { fontSize: 7, cellPadding: 3, overflow: 'linebreak' },
    headStyles: { fillColor: [22, 96, 136] },
    margin: { top: 40, left: 30, right: 30 },
  });

  doc.save(`${filenamePrefix}-${new Date().toISOString().slice(0, 10)}.pdf`);
}

export { formatNumber, formatCurrency, formatPercent };
