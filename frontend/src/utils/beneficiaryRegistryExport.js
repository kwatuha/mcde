import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { drawCountyOfficialHeader, getCountyLogoDataUrl } from './countyOfficialPdfHeader';

export const BENEFICIARY_EXPORT_COLUMNS = [
  { field: 'registryCode', header: 'Registry code', width: 16 },
  { field: 'beneficiaryTypeLabel', header: 'Type', width: 14 },
  { field: 'displayName', header: 'Name', width: 28 },
  { field: 'gender', header: 'Gender', width: 10 },
  { field: 'age', header: 'Age', width: 8 },
  { field: 'groupType', header: 'Group type', width: 16 },
  { field: 'memberCount', header: 'Members', width: 10 },
  { field: 'county', header: 'County', width: 14 },
  { field: 'subCounty', header: 'Sub-County', width: 16 },
  { field: 'ward', header: 'Ward', width: 16 },
  { field: 'phone', header: 'Phone', width: 14 },
  { field: 'projectId', header: 'Project ID', width: 12 },
  { field: 'rriProgrammeId', header: 'RRI Programme', width: 14 },
  { field: 'sector', header: 'Sector', width: 16 },
  { field: 'notes', header: 'Notes', width: 24 },
];

function cellValue(row, field) {
  if (field === 'beneficiaryTypeLabel') {
    return row.beneficiaryTypeLabel || row.beneficiaryType || '';
  }
  const value = row[field];
  return value === null || value === undefined || value === '' ? '—' : String(value);
}

export function exportBeneficiaryRegistryExcel({ rows, summaryRows = [] }) {
  const exportRows = rows.map((row) => {
    const mapped = {};
    BENEFICIARY_EXPORT_COLUMNS.forEach((col) => {
      mapped[col.header] = cellValue(row, col.field);
    });
    return mapped;
  });

  const worksheet = XLSX.utils.json_to_sheet(exportRows);
  worksheet['!cols'] = BENEFICIARY_EXPORT_COLUMNS.map((col) => ({ wch: col.width || 16 }));

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Beneficiaries');

  const summaryAoA = [
    ['Beneficiary Registry Export'],
    [],
    ...summaryRows.map((item) => [item.label, item.value]),
  ];
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(summaryAoA), 'Summary');

  XLSX.writeFile(workbook, `beneficiary-registry-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export async function exportBeneficiaryRegistryPdf({ rows, summaryRows = [], subtitle = '' }) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const logoDataUrl = await getCountyLogoDataUrl();
  let y = drawCountyOfficialHeader(doc, {
    unit: 'pt',
    logoDataUrl,
    title: 'Beneficiary Registry',
  });
  doc.setFontSize(9);
  doc.text(`Generated: ${new Date().toLocaleString('en-KE')}${subtitle ? ` | ${subtitle}` : ''}`, 40, y);
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
    head: [BENEFICIARY_EXPORT_COLUMNS.map((col) => col.header)],
    body: rows.map((row) => BENEFICIARY_EXPORT_COLUMNS.map((col) => cellValue(row, col.field))),
    styles: { fontSize: 7, cellPadding: 3, overflow: 'linebreak' },
    headStyles: { fillColor: [22, 96, 136] },
    margin: { top: 40, left: 24, right: 24 },
  });

  doc.save(`beneficiary-registry-${new Date().toISOString().slice(0, 10)}.pdf`);
}
