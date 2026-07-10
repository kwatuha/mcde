const {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  WidthType,
} = require('docx');
const { buildDocxOfficialHeaderParagraphs, getCountyOfficialName } = require('../utils/countyLogo');
const { multiSelectValues } = require('./checklistAnswerUtils');

function text(value, fallback = '—') {
  if (value === undefined || value === null || value === '') return fallback;
  return String(value).replace(/\s+/g, ' ').trim() || fallback;
}

function progressLabel(value) {
  const labels = {
    on_track: 'On track',
    delayed: 'Delayed',
    stalled: 'Stalled',
    completed: 'Completed',
  };
  return labels[value] || text(value);
}

function workflowLabel(value) {
  return text(value, 'Draft').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function photoList(raw) {
  if (!raw || typeof raw !== 'object') return [];
  if (Array.isArray(raw.photos)) return raw.photos;
  if (Array.isArray(raw)) return raw;
  return [];
}

function formatAnswerDisplay(item, raw) {
  if (raw === undefined || raw === null || raw === '') return '—';
  const type = item?.type || 'text';

  if (type === 'multi_select') {
    const values = multiSelectValues(raw);
    if (!values.length) return '—';
    return values.join(', ');
  }
  if (type === 'yes_no') {
    return raw === 'yes' || raw === true ? 'Yes' : raw === 'no' || raw === false ? 'No' : text(raw);
  }
  if (type === 'progress_status') return progressLabel(raw);
  if (type === 'photo') {
    const photos = photoList(raw);
    if (!photos.length) return '—';
    return photos
      .map((p) => {
        const name = p.fileName || 'Photo';
        const geo = p.lat != null && p.lng != null
          ? ` (${Number(p.lat).toFixed(5)}, ${Number(p.lng).toFixed(5)})`
          : '';
        return `${name}${geo}`;
      })
      .join('; ');
  }
  if (type === 'location') {
    if (typeof raw !== 'object') return '—';
    const lat = Number(raw.lat);
    const lng = Number(raw.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return '—';
    const acc = raw.accuracy != null ? ` ±${Math.round(Number(raw.accuracy))}m` : '';
    return `${lat.toFixed(6)}, ${lng.toFixed(6)}${acc}`;
  }
  if (type === 'area_location') {
    if (!raw || typeof raw !== 'object') return '—';
    const parts = [raw.subcounty, raw.ward, raw.sublocation, raw.village].filter(Boolean);
    return parts.length ? parts.join(' → ') : '—';
  }
  if (type === 'user') {
    if (typeof raw === 'object') {
      return text(raw.displayName || raw.username || raw.email || (raw.userId != null ? `User #${raw.userId}` : ''), '—');
    }
    return text(raw);
  }
  if (type === 'project_milestones' || type === 'project_bq_items' || type === 'indicator') {
    if (Array.isArray(raw)) {
      if (!raw.length) return '—';
      return raw.map((e) => (typeof e === 'object' ? e.label || `#${e.id}` : String(e))).join('; ');
    }
    if (raw && typeof raw === 'object' && (raw.label || raw.id != null)) {
      return raw.label || `#${raw.id}`;
    }
  }
  if (Array.isArray(raw)) return raw.join(', ');
  if (typeof raw === 'object') return JSON.stringify(raw);
  return text(raw);
}

function bodyParagraph(content, options = {}) {
  return new Paragraph({
    heading: options.heading,
    spacing: { before: options.before || 0, after: options.after ?? 120 },
    children: [
      new TextRun({
        text: text(content, ''),
        bold: !!options.bold,
        italics: !!options.italics,
        size: options.size || 22,
        color: options.color,
      }),
    ],
  });
}

function answerCell(content, options = {}) {
  return new TableCell({
    width: options.width ? { size: options.width, type: WidthType.PERCENTAGE } : undefined,
    shading: options.shading ? { fill: options.shading } : undefined,
    margins: { top: 80, bottom: 80, left: 100, right: 100 },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
      bottom: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
      left: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
      right: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
    },
    children: [
      new Paragraph({
        spacing: { after: 0 },
        children: [
          new TextRun({
            text: text(content),
            bold: !!options.bold,
            size: options.size || 20,
            color: options.color,
          }),
        ],
      }),
    ],
  });
}

function buildSectionTable(section, answers = {}) {
  const items = (section.items || []).filter((item) => item?.id);
  if (!items.length) return null;

  const rows = [
    new TableRow({
      tableHeader: true,
      children: [
        answerCell('Checklist item', { bold: true, color: 'FFFFFF', shading: '1F4E79', width: 38 }),
        answerCell('Response', { bold: true, color: 'FFFFFF', shading: '1F4E79', width: 62 }),
      ],
    }),
    ...items.map((item) => new TableRow({
      children: [
        answerCell(item.label || item.id, { width: 38 }),
        answerCell(formatAnswerDisplay(item, answers[item.id]), { width: 62 }),
      ],
    })),
  ];

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
    rows,
  });
}

function buildMonitoringReportDocx(report = {}) {
  const generatedAt = new Date().toLocaleString('en-KE', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  const locationLine = [
    report.village,
    report.sublocation,
    report.ward,
    report.subcounty,
  ].filter(Boolean).join(', ');

  const children = [
    ...buildDocxOfficialHeaderParagraphs('VILLAGE FIELD MONITORING REPORT', [
      report.projectName || `Project #${report.projectId || '—'}`,
      locationLine || 'Location not recorded',
      report.visitDate ? `Visit date: ${report.visitDate}` : null,
      `Generated: ${generatedAt}`,
    ]),
    bodyParagraph('Report summary', { heading: HeadingLevel.HEADING_1, bold: true, size: 26, after: 160 }),
    bodyParagraph(`Report title: ${report.title || 'Monitoring visit'}`),
    bodyParagraph(`Project: ${report.projectName || '—'}`),
    bodyParagraph(`Physical progress status: ${progressLabel(report.progressStatus)}`),
    bodyParagraph(`Workflow status: ${workflowLabel(report.workflowStatus)}`),
    bodyParagraph(`Prepared by: ${report.createdByName || 'Village monitoring officer'}`),
    report.villageSubmittedAt
      ? bodyParagraph(`Submitted to ward: ${new Date(report.villageSubmittedAt).toLocaleString('en-KE')}`)
      : null,
    report.reviewComment
      ? bodyParagraph(`Latest review comment: ${report.reviewComment}`, { italics: true })
      : null,
    bodyParagraph(
      'The checklist responses below were captured in E-CIMES. Ward administrators may download this document, refine the narrative offline, and upload the edited Word file for the official record.',
      { italics: true, color: '666666', after: 200 }
    ),
  ].filter(Boolean);

  for (const section of report.structure?.sections || []) {
    children.push(
      bodyParagraph(section.title || 'Section', { heading: HeadingLevel.HEADING_2, bold: true, size: 24, before: 160, after: 120 })
    );
    const table = buildSectionTable(section, report.answers || {});
    if (table) children.push(table);
    else children.push(bodyParagraph('No responses recorded in this section.', { italics: true }));
  }

  if (Array.isArray(report.attachments) && report.attachments.length) {
    children.push(
      bodyParagraph('Attachments', { heading: HeadingLevel.HEADING_2, bold: true, size: 24, before: 200, after: 120 }),
      bodyParagraph(
        report.attachments
          .map((a) => `${a.fileName || 'File'}${a.itemId ? ` (${a.itemId})` : ''}`)
          .join('; ')
      )
    );
  }

  children.push(
    bodyParagraph('', { after: 240 }),
    bodyParagraph(`Document generated from ${getCountyOfficialName()} E-CIMES monitoring workflow.`, {
      italics: true,
      color: '666666',
      size: 18,
    })
  );

  const doc = new Document({
    sections: [{ properties: {}, children }],
  });

  return Packer.toBuffer(doc);
}

function buildExportFilename(report = {}) {
  const project = text(report.projectName, 'project').replace(/[^a-zA-Z0-9-_]+/g, '-').slice(0, 40);
  const id = report.submissionId || 'report';
  return `monitoring-report-${id}-${project}.docx`.replace(/-+/g, '-');
}

module.exports = {
  buildMonitoringReportDocx,
  buildExportFilename,
  formatAnswerDisplay,
};
