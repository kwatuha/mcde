import { jsPDF } from 'jspdf';
import {
  drawCountyOfficialHeader,
  getCountyLogoDataUrl,
  getCountyOfficialName,
} from './countyOfficialPdfHeader';
import { formatFeedbackEvaluationForPdf } from '../constants/evaluationQuestions';

const COL = {
  ink: [33, 37, 41],
  muted: [90, 98, 104],
  rule: [222, 226, 230],
};

/**
 * @param {import('jspdf').jsPDF} doc
 * @param {number} margin
 * @param {number} pageWidth
 */
function drawFooterGeneratedDate(doc, margin, pageWidth, formatDate) {
  const pageHeight = doc.internal.pageSize.getHeight();
  const generated = formatDate(new Date().toISOString());
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8);
  doc.setTextColor(...COL.muted);
  doc.text(`Generated ${generated}`, margin, pageHeight - 10);
  doc.setTextColor(...COL.ink);
}

/**
 * Append one feedback record (improved typography, section rules, spacing).
 * @param {import('jspdf').jsPDF} doc
 * @param {object} feedback
 * @param {(s: string) => string} formatDate
 * @param {{ slimHeader?: boolean; reportTitle?: string; recordIndex?: number; recordTotal?: number; logoDataUrl?: string | null }} [opts]
 */
function appendFeedbackOfficialContent(doc, feedback, formatDate, opts = {}) {
  const margin = 18;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const maxWidth = pageWidth - margin * 2;
  let y = margin;
  const bodyLine = 5.2;
  const sectionGap = 8;
  const labelSize = 8.5;
  const valueSize = 10.5;
  const { slimHeader = false, reportTitle, recordIndex, recordTotal, logoDataUrl = null } = opts;

  const ensureSpace = (needed) => {
    if (y + needed > pageHeight - 22) {
      drawFooterGeneratedDate(doc, margin, pageWidth, formatDate);
      doc.addPage();
      y = margin;
    }
  };

  const hr = () => {
    ensureSpace(4);
    doc.setDrawColor(...COL.rule);
    doc.setLineWidth(0.35);
    doc.line(margin, y, pageWidth - margin, y);
    y += sectionGap;
  };

  const writeBanner = () => {
    const idx =
      slimHeader && recordIndex != null && recordTotal != null ? ` (${recordIndex + 1} of ${recordTotal})` : '';
    y = drawCountyOfficialHeader(doc, {
      unit: 'mm',
      startY: y,
      margin,
      logoDataUrl,
      title: slimHeader
        ? `Citizen Feedback - Reference #${feedback.id}${idx}`
        : 'Official County Feedback Record',
    });
    if (slimHeader && reportTitle) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8.5);
      doc.setTextColor(...COL.muted);
      doc.text(String(reportTitle), margin, y);
      y += 6;
      doc.setTextColor(...COL.ink);
    }
  };

  const writeField = (label, value) => {
    const text = value == null || String(value).trim() === '' ? '—' : String(value);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(labelSize);
    doc.setTextColor(...COL.muted);
    const labelLines = doc.splitTextToSize(label.toUpperCase(), maxWidth);
    ensureSpace(labelLines.length * 4 + 6);
    doc.text(labelLines, margin, y);
    y += labelLines.length * 4 + 2;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(valueSize);
    doc.setTextColor(...COL.ink);
    const valueLines = doc.splitTextToSize(text, maxWidth);
    for (let i = 0; i < valueLines.length; i++) {
      ensureSpace(bodyLine + 1);
      doc.text(valueLines[i], margin, y);
      y += bodyLine;
    }
    y += 5;
  };

  writeBanner();

  writeField('Issuing office', getCountyOfficialName());
  writeField('Feedback ID', `#${feedback.id}`);
  writeField('Submitted', formatDate(feedback.created_at));
  if (feedback.project_name) {
    writeField('Related project', feedback.project_name);
  }
  writeField(
    'Citizen contact',
    [feedback.name, feedback.email, feedback.phone].filter(Boolean).join('\n') || 'Anonymous'
  );
  writeField('Subject', feedback.subject || '—');
  hr();
  writeField('Citizen message', feedback.message || '—');
  const evaluationText = formatFeedbackEvaluationForPdf(feedback);
  if (evaluationText) {
    hr();
    writeField('Citizen evaluation (ratings & open responses)', evaluationText);
  }
  hr();
  writeField(
    'Official county response',
    (feedback.admin_response || '').trim() || '(Not yet recorded — awaiting official response)'
  );
  if (feedback.responded_at) {
    writeField('Response recorded', formatDate(feedback.responded_at));
  }
  if (feedback.responded_by != null && feedback.responded_by !== '') {
    writeField('Recorded by (user id)', String(feedback.responded_by));
  }

  drawFooterGeneratedDate(doc, margin, pageWidth, formatDate);
}

function drawExportCover(doc, reportTitle, itemCount, formatDate, logoDataUrl) {
  const margin = 22;
  const pageWidth = doc.internal.pageSize.getWidth();

  let y = drawCountyOfficialHeader(doc, {
    unit: 'mm',
    startY: 12,
    margin,
    logoDataUrl,
    title: 'Citizen Feedback Export',
  });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...COL.ink);
  doc.text(`Report: ${reportTitle || 'Export'}`, margin, y);
  y += 7;
  doc.text(`Items included: ${itemCount}`, margin, y);
  y += 7;
  doc.setTextColor(...COL.ink);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Compiled: ${formatDate(new Date().toISOString())}`, margin, y);
  drawFooterGeneratedDate(doc, margin, pageWidth, formatDate);
}

/**
 * Single feedback — one file.
 */
export async function downloadFeedbackOfficialResponsePdf(feedback, formatDate) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const logoDataUrl = await getCountyLogoDataUrl();
  appendFeedbackOfficialContent(doc, feedback, formatDate, { slimHeader: false, logoDataUrl });
  doc.save(`feedback-official-response-${feedback.id}.pdf`);
}

/**
 * All items currently shown in a modal — cover + one page per feedback.
 */
export async function downloadFeedbackListOfficialPdf(items, formatDate, reportTitle) {
  if (!items?.length) return;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const logoDataUrl = await getCountyLogoDataUrl();
  drawExportCover(doc, reportTitle, items.length, formatDate, logoDataUrl);
  items.forEach((feedback, index) => {
    doc.addPage();
    appendFeedbackOfficialContent(doc, feedback, formatDate, {
      slimHeader: true,
      reportTitle: reportTitle || 'Export',
      recordIndex: index,
      recordTotal: items.length,
      logoDataUrl,
    });
  });
  const slug = String(reportTitle || 'export')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase() || 'export';
  doc.save(`feedback-export-${slug}.pdf`);
}
