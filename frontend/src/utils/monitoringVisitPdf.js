import { jsPDF } from 'jspdf';
import { drawCountyOfficialHeader, getCountyLogoDataUrl } from './countyOfficialPdfHeader';

const COL = {
  ink: [33, 37, 41],
  muted: [90, 98, 104],
  rule: [222, 226, 230],
};

function normalizeAnswer(item, value) {
  if (value === null || value === undefined || value === '') return '—';
  if (item?.type === 'yes_no') {
    if (value === 'yes') return 'Yes';
    if (value === 'no') return 'No';
  }
  if (item?.type === 'photo') {
    const photos = Array.isArray(value?.photos) ? value.photos : [];
    if (!photos.length) return '—';
    return photos
      .map((p) => {
        const name = p.fileName || 'Photo';
        const geo = p.lat != null && p.lng != null ? ` (${Number(p.lat).toFixed(5)}, ${Number(p.lng).toFixed(5)})` : '';
        return `${name}${geo}`;
      })
      .join('; ');
  }
  if (item?.type === 'location') {
    if (typeof value !== 'object') return '—';
    const lat = Number(value.lat);
    const lng = Number(value.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return '—';
    const acc = value.accuracy != null ? ` ±${Math.round(Number(value.accuracy))}m` : '';
    return `${lat.toFixed(6)}, ${lng.toFixed(6)}${acc}`;
  }
  if (Array.isArray(value)) return value.join(', ') || '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export async function downloadMonitoringVisitPdf({ submission, template, projectName }) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const margin = 16;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const maxWidth = pageWidth - margin * 2;
  let y = drawCountyOfficialHeader(doc, {
    unit: 'mm',
    startY: 12,
    margin,
    logoDataUrl: await getCountyLogoDataUrl(),
    title: 'Standalone Monitoring Visit',
  });

  const ensureSpace = (needed) => {
    if (y + needed > pageHeight - 15) {
      doc.addPage();
      y = margin;
    }
  };

  const writeLabelValue = (label, value) => {
    const content = value == null || String(value).trim() === '' ? '—' : String(value);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(...COL.muted);
    const labelLines = doc.splitTextToSize(label.toUpperCase(), maxWidth);
    ensureSpace(labelLines.length * 4 + 4);
    doc.text(labelLines, margin, y);
    y += labelLines.length * 4;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10.5);
    doc.setTextColor(...COL.ink);
    const lines = doc.splitTextToSize(content, maxWidth);
    lines.forEach((line) => {
      ensureSpace(5);
      doc.text(line, margin, y);
      y += 5;
    });
    y += 3;
  };

  const hr = () => {
    ensureSpace(4);
    doc.setDrawColor(...COL.rule);
    doc.setLineWidth(0.35);
    doc.line(margin, y, pageWidth - margin, y);
    y += 6;
  };

  writeLabelValue('Project', projectName || (submission?.projectId != null ? `Project #${submission.projectId}` : '—'));
  writeLabelValue('Visit date', submission?.visitDate ? String(submission.visitDate).slice(0, 10) : '—');
  writeLabelValue('Checklist template', template?.name || submission?.templateName || '—');
  writeLabelValue('Visit title', submission?.title || '—');
  writeLabelValue('Submission ID', submission?.submissionId != null ? String(submission.submissionId) : '—');
  writeLabelValue('Last updated', submission?.updatedAt || submission?.createdAt || '—');
  hr();

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...COL.ink);
  doc.text('Checklist responses', margin, y);
  y += 7;

  const sections = Array.isArray(template?.structure?.sections) ? template.structure.sections : [];
  if (!sections.length) {
    writeLabelValue('Notes', 'Template sections are not available for rendering.');
  } else {
    sections.forEach((section, sIdx) => {
      const items = Array.isArray(section?.items) ? section.items : [];
      ensureSpace(8);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(...COL.ink);
      doc.text(`${sIdx + 1}. ${section?.title || `Section ${sIdx + 1}`}`, margin, y);
      y += 5;

      if (!items.length) {
        writeLabelValue('Section note', 'No checklist items in this section.');
      } else {
        items.forEach((item, iIdx) => {
          const key = item?.id;
          const value = key ? submission?.answers?.[key] : undefined;
          writeLabelValue(`${sIdx + 1}.${iIdx + 1} ${item?.label || key || 'Question'}`, normalizeAnswer(item, value));
        });
      }
      hr();
    });
  }

  const fileName = `monitoring-visit-${submission?.submissionId || 'record'}.pdf`;
  doc.save(fileName);
}
