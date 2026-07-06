const PDFDocument = require('pdfkit');
const { drawPdfkitOfficialHeader } = require('../utils/countyLogo');

function formatDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('en-KE');
  } catch {
    return String(iso);
  }
}

function severityLabel(s) {
  return String(s || 'medium').toUpperCase();
}

async function generateEscalationsReportPdf(signals = [], meta = {}) {
  const generatedAt = new Date().toLocaleString('en-KE');
  const filterSummary = meta.filterSummary || 'All open escalations in scope';

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40, layout: 'landscape' });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    drawPdfkitOfficialHeader(doc, {
      title: 'Project Escalations Report',
      subtitle: `Generated: ${generatedAt}  |  Filter: ${filterSummary}  |  Total signals: ${signals.length}`,
    });
    doc.moveDown(0.4);

    const cols = [
      { label: '#', width: 28 },
      { label: 'Project', width: 120 },
      { label: 'Title', width: 130 },
      { label: 'Severity', width: 52 },
      { label: 'Level', width: 32 },
      { label: 'Status', width: 58 },
      { label: 'Assigned to', width: 90 },
      { label: 'Department', width: 80 },
      { label: 'Detected', width: 88 },
    ];
    const startX = doc.page.margins.left;
    let y = doc.y;

    const drawHeader = () => {
      doc.font('Helvetica-Bold').fontSize(8);
      let x = startX;
      for (const col of cols) {
        doc.text(col.label, x, y, { width: col.width, lineBreak: false });
        x += col.width + 4;
      }
      y += 14;
      doc.moveTo(startX, y).lineTo(doc.page.width - doc.page.margins.right, y).stroke('#cccccc');
      y += 4;
    };

    drawHeader();
    doc.font('Helvetica').fontSize(7);

    signals.forEach((sig, idx) => {
      if (y > doc.page.height - doc.page.margins.bottom - 24) {
        doc.addPage({ layout: 'landscape' });
        y = doc.page.margins.top;
        drawHeader();
        doc.font('Helvetica').fontSize(7);
      }
      const row = [
        String(idx + 1),
        sig.projectName || `#${sig.projectId}`,
        sig.title || '—',
        severityLabel(sig.severity),
        `L${sig.escalationLevel || 1}`,
        sig.status || '—',
        sig.assignedToName || 'Unassigned',
        sig.department || '—',
        formatDate(sig.detectedAt),
      ];
      let x = startX;
      let rowHeight = 12;
      for (let i = 0; i < cols.length; i += 1) {
        const h = doc.heightOfString(row[i], { width: cols[i].width });
        rowHeight = Math.max(rowHeight, h + 2);
      }
      for (let i = 0; i < cols.length; i += 1) {
        doc.text(row[i], x, y, { width: cols[i].width, lineBreak: true });
        x += cols[i].width + 4;
      }
      y += rowHeight + 2;
    });

    doc.font('Helvetica-Oblique').fontSize(7).text(
      'Report generated from E-CIMES project escalation signals. Assignments and status reflect export time.',
      startX,
      doc.page.height - doc.page.margins.bottom - 16,
      { align: 'center', width: doc.page.width - doc.page.margins.left - doc.page.margins.right }
    );
    doc.end();
  });
}

module.exports = {
  generateEscalationsReportPdf,
};
