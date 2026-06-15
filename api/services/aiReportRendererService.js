const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const {
    BorderStyle,
    Document,
    HeadingLevel,
    Packer,
    Paragraph,
    Table,
    TableCell,
    TableRow,
    TextRun,
    WidthType,
} = require('docx');

const CREATOR = 'Machakos County Monitoring and Evaluation System';

function text(value) {
    return String(value ?? '').trim();
}

function generatedDate() {
    return new Date().toLocaleString('en-KE', { timeZone: 'Africa/Nairobi' });
}

function logoPath() {
    const candidates = [
        process.env.COUNTY_LOGO_PATH,
        path.join(__dirname, '../../frontend/src/assets/gpris.png'),
        path.join(process.cwd(), '../frontend/src/assets/gpris.png'),
        path.join(process.cwd(), 'frontend/src/assets/gpris.png'),
    ].filter(Boolean);
    return candidates.find((candidate) => {
        try {
            return fs.existsSync(candidate);
        } catch {
            return false;
        }
    }) || null;
}

function docxParagraph(content, options = {}) {
    return new Paragraph({
        text: content,
        heading: options.heading,
        spacing: { after: options.after ?? 160 },
        bullet: options.bullet ? { level: 0 } : undefined,
        children: options.children,
    });
}

function docxTextRun(content, options = {}) {
    return new TextRun({
        text: content,
        bold: options.bold,
        italics: options.italics,
        size: options.size,
        color: options.color,
    });
}

function docxTable(reportTable) {
    const headers = reportTable.headers || [];
    const rows = reportTable.rows || [];
    const border = { style: BorderStyle.SINGLE, size: 1, color: 'D1D5DB' };
    return new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
            new TableRow({
                tableHeader: true,
                children: headers.map((header) => new TableCell({
                    shading: { fill: '1F4E79' },
                    borders: { top: border, bottom: border, left: border, right: border },
                    children: [new Paragraph({ children: [docxTextRun(text(header), { bold: true, color: 'FFFFFF' })] })],
                })),
            }),
            ...rows.map((row) => new TableRow({
                children: headers.map((_, index) => new TableCell({
                    borders: { top: border, bottom: border, left: border, right: border },
                    children: [new Paragraph(text(row[index] ?? ''))],
                })),
            })),
        ],
    });
}

async function renderReportDocx(report) {
    const children = [
        new Paragraph({
            heading: HeadingLevel.TITLE,
            spacing: { after: 80 },
            children: [docxTextRun(text(report.title || 'AI Generated Report'), { bold: true, size: 34, color: '1F4E79' })],
        }),
        new Paragraph({
            spacing: { after: 220 },
            children: [docxTextRun(text(report.subtitle || 'Machakos County Monitoring and Evaluation System'), { italics: true, color: '666666' })],
        }),
        docxParagraph(`Generated: ${generatedDate()}`, { after: 260 }),
    ];

    if (report.executiveSummary) {
        children.push(docxParagraph('Executive Summary', { heading: HeadingLevel.HEADING_1 }));
        children.push(docxParagraph(report.executiveSummary));
    }

    (report.sections || []).forEach((section) => {
        children.push(docxParagraph(text(section.heading || 'Section'), { heading: HeadingLevel.HEADING_1 }));
        (section.paragraphs || []).forEach((paragraph) => children.push(docxParagraph(text(paragraph))));
        (section.bullets || []).forEach((bullet) => children.push(docxParagraph(text(bullet), { bullet: true })));
    });

    (report.tables || []).forEach((table) => {
        children.push(docxParagraph(text(table.title || 'Table'), { heading: HeadingLevel.HEADING_2, after: 80 }));
        children.push(docxTable(table));
        children.push(docxParagraph(''));
    });

    if (report.recommendations?.length) {
        children.push(docxParagraph('Recommendations', { heading: HeadingLevel.HEADING_1 }));
        report.recommendations.forEach((recommendation) => children.push(docxParagraph(text(recommendation), { bullet: true })));
    }

    if (report.conclusion) {
        children.push(docxParagraph('Conclusion', { heading: HeadingLevel.HEADING_1 }));
        children.push(docxParagraph(report.conclusion));
    }

    children.push(docxParagraph('Note: AI-generated content is advisory and should be reviewed before official submission.', { after: 0 }));

    const doc = new Document({
        creator: CREATOR,
        title: report.title || 'AI Generated Report',
        description: 'AI generated structured report',
        sections: [{ children }],
    });

    return Packer.toBuffer(doc);
}

function writePdfHeader(doc, report) {
    const lp = logoPath();
    if (lp) {
        try {
            doc.image(lp, 40, 28, { width: 48 });
        } catch {
            // Ignore logo rendering errors; continue with text header.
        }
    }
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#111827').text('COUNTY GOVERNMENT OF MACHAKOS', 96, 34);
    doc.font('Helvetica').fontSize(8).fillColor('#4B5563').text('Monitoring and Evaluation System', 96, 49);
    doc.moveTo(40, 86).lineTo(doc.page.width - 40, 86).strokeColor('#1F4E79').lineWidth(1).stroke();
    doc.font('Helvetica-Bold').fontSize(16).fillColor('#1F4E79').text(text(report.title || 'AI Generated Report'), 40, 104, { align: 'center' });
    doc.font('Helvetica').fontSize(9).fillColor('#4B5563').text(text(report.subtitle || 'Machakos County Monitoring and Evaluation System'), 40, 126, { align: 'center' });
    doc.fontSize(8).text(`Generated: ${generatedDate()}`, 40, 142, { align: 'center' });
    doc.moveDown(2);
}

function ensurePdfSpace(doc, needed = 80) {
    if (doc.y + needed > doc.page.height - 50) {
        doc.addPage();
    }
}

function pdfHeading(doc, heading, level = 1) {
    ensurePdfSpace(doc, 40);
    doc.moveDown(0.6);
    doc.font('Helvetica-Bold').fontSize(level === 1 ? 12 : 10).fillColor(level === 1 ? '#1F4E79' : '#365F91').text(text(heading));
    doc.moveDown(0.3);
}

function pdfParagraph(doc, paragraph) {
    ensurePdfSpace(doc, 45);
    doc.font('Helvetica').fontSize(9).fillColor('#111827').text(text(paragraph), { align: 'justify', lineGap: 2 });
    doc.moveDown(0.45);
}

function pdfBullets(doc, bullets = []) {
    bullets.forEach((bullet) => {
        ensurePdfSpace(doc, 28);
        doc.font('Helvetica').fontSize(9).fillColor('#111827').text(`• ${text(bullet)}`, { indent: 14, lineGap: 1 });
    });
    if (bullets.length) doc.moveDown(0.4);
}

function pdfTable(doc, table) {
    const headers = table.headers || [];
    const rows = table.rows || [];
    if (!headers.length) return;
    pdfHeading(doc, table.title || 'Table', 2);
    const pageWidth = doc.page.width - 80;
    const colWidth = pageWidth / headers.length;
    const drawRow = (cells, isHeader = false) => {
        ensurePdfSpace(doc, 24);
        const y = doc.y;
        cells.forEach((cell, index) => {
            const x = 40 + (index * colWidth);
            doc.rect(x, y, colWidth, 22).fillAndStroke(isHeader ? '#1F4E79' : '#FFFFFF', '#D1D5DB');
            doc.fillColor(isHeader ? '#FFFFFF' : '#111827')
                .font(isHeader ? 'Helvetica-Bold' : 'Helvetica')
                .fontSize(7.5)
                .text(text(cell), x + 4, y + 5, { width: colWidth - 8, height: 14, ellipsis: true });
        });
        doc.y = y + 22;
    };
    drawRow(headers, true);
    rows.slice(0, 35).forEach((row) => drawRow(headers.map((_, index) => row[index] ?? ''), false));
    doc.moveDown(0.8);
}

async function renderReportPdf(report) {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true });
        const chunks = [];
        doc.on('data', (chunk) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        writePdfHeader(doc, report);
        doc.y = 170;

        if (report.executiveSummary) {
            pdfHeading(doc, 'Executive Summary');
            pdfParagraph(doc, report.executiveSummary);
        }

        (report.sections || []).forEach((section) => {
            pdfHeading(doc, section.heading || 'Section');
            (section.paragraphs || []).forEach((paragraph) => pdfParagraph(doc, paragraph));
            pdfBullets(doc, section.bullets || []);
        });

        (report.tables || []).forEach((table) => pdfTable(doc, table));

        if (report.recommendations?.length) {
            pdfHeading(doc, 'Recommendations');
            pdfBullets(doc, report.recommendations);
        }

        if (report.conclusion) {
            pdfHeading(doc, 'Conclusion');
            pdfParagraph(doc, report.conclusion);
        }

        doc.moveDown();
        doc.font('Helvetica-Oblique').fontSize(8).fillColor('#6B7280')
            .text('AI-generated content is advisory and should be reviewed before official submission.');
        doc.end();
    });
}

function safeFileName(value, extension) {
    const base = text(value || 'ai-generated-report')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80) || 'ai-generated-report';
    return `${base}.${extension}`;
}

module.exports = {
    renderReportDocx,
    renderReportPdf,
    safeFileName,
};
