import { jsPDF } from 'jspdf';

const countyName = () => import.meta.env.VITE_CERT_COUNTY_NAME || 'County Government';

const COL = {
  ink: [33, 37, 41],
  muted: [90, 98, 104],
  rule: [222, 226, 230],
  banner: [241, 243, 245],
  bannerBorder: [200, 206, 212],
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
 * @param {{ slimHeader?: boolean; reportTitle?: string; recordIndex?: number; recordTotal?: number }} [opts]
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
  const { slimHeader = false, reportTitle, recordIndex, recordTotal } = opts;

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
    const h = slimHeader ? 26 : 34;
    ensureSpace(h + 6);
    doc.setFillColor(...COL.banner);
    doc.setDrawColor(...COL.bannerBorder);
    doc.setLineWidth(0.5);
    doc.roundedRect(margin, y, maxWidth, h, 1.5, 1.5, 'FD');
    let ty = y + (slimHeader ? 8 : 10);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(slimHeader ? 12 : 14);
    doc.setTextColor(...COL.ink);
    if (slimHeader) {
      const idx =
        recordIndex != null && recordTotal != null ? ` (${recordIndex + 1} of ${recordTotal})` : '';
      doc.text(`Citizen feedback — Reference #${feedback.id}${idx}`, margin + 4, ty);
      ty += 6;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(...COL.muted);
      if (reportTitle) {
        doc.text(String(reportTitle), margin + 4, ty);
      }
    } else {
      doc.text('Official county feedback record', margin + 4, ty);
      ty += 7;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(...COL.muted);
      doc.text(countyName(), margin + 4, ty);
    }
    doc.setTextColor(...COL.ink);
    y += h + 10;
    hr();
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

  writeField('Issuing office', countyName());
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

function drawExportCover(doc, reportTitle, itemCount, formatDate) {
  const margin = 22;
  const pageWidth = doc.internal.pageSize.getWidth();

  let y = 40;
  doc.setFillColor(...COL.banner);
  doc.setDrawColor(...COL.bannerBorder);
  doc.roundedRect(margin, y - 8, pageWidth - margin * 2, 52, 2, 2, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(...COL.ink);
  doc.text('Citizen feedback export', margin + 6, y + 10);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(...COL.muted);
  doc.text(countyName(), margin + 6, y + 22);
  doc.setFontSize(10);
  doc.text(`Report: ${reportTitle || 'Export'}`, margin + 6, y + 32);
  doc.text(`Items included: ${itemCount}`, margin + 6, y + 40);
  y += 58;
  doc.setTextColor(...COL.ink);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Compiled: ${formatDate(new Date().toISOString())}`, margin, y);
  drawFooterGeneratedDate(doc, margin, pageWidth, formatDate);
}

/**
 * Single feedback — one file.
 */
export function downloadFeedbackOfficialResponsePdf(feedback, formatDate) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  appendFeedbackOfficialContent(doc, feedback, formatDate, { slimHeader: false });
  doc.save(`feedback-official-response-${feedback.id}.pdf`);
}

/**
 * All items currently shown in a modal — cover + one page per feedback.
 */
export function downloadFeedbackListOfficialPdf(items, formatDate, reportTitle) {
  if (!items?.length) return;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  drawExportCover(doc, reportTitle, items.length, formatDate);
  items.forEach((feedback, index) => {
    doc.addPage();
    appendFeedbackOfficialContent(doc, feedback, formatDate, {
      slimHeader: true,
      reportTitle: reportTitle || 'Export',
      recordIndex: index,
      recordTotal: items.length,
    });
  });
  const slug = String(reportTitle || 'export')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase() || 'export';
  doc.save(`feedback-export-${slug}.pdf`);
}
