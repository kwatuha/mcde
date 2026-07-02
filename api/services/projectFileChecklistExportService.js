const PDFDocument = require('pdfkit');
const { getProjectChecklist } = require('./projectFileChecklistService');
const pool = require('../config/db');

async function loadProjectHeader(projectId) {
    const result = await pool.query(
        `SELECT project_id AS id, name AS "projectName",
                COALESCE(state_department, '') AS department,
                COALESCE(progress->>'status', '') AS status
         FROM projects
         WHERE project_id = $1 AND COALESCE(voided, false) = false
         LIMIT 1`,
        [projectId]
    );
    return result.rows?.[0] || { projectName: `Project #${projectId}` };
}

function statusLabel(item) {
    if (item.links?.length) return 'Uploaded';
    if (item.status === 'not_applicable') return 'N/A';
    if (item.status === 'waived') return 'Waived';
    return 'Missing';
}

async function generateFileChecklistAuditPdf(projectId, userId = null) {
    const [checklist, project] = await Promise.all([
        getProjectChecklist(projectId, { autoLink: true, userId }),
        loadProjectHeader(projectId),
    ]);

    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ size: 'A4', margin: 48 });
        const chunks = [];
        doc.on('data', (chunk) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        const progress = checklist.progress || {};
        doc.fontSize(16).font('Helvetica-Bold').text('Project File Readiness Audit Report', { align: 'center' });
        doc.moveDown(0.5);
        doc.fontSize(11).font('Helvetica');
        doc.text(`Project: ${project.projectName || projectId}`);
        doc.text(`Department: ${project.department || '—'}`);
        doc.text(`Status: ${project.status || '—'}`);
        doc.text(`Generated: ${new Date().toLocaleString('en-KE')}`);
        doc.moveDown();
        doc.font('Helvetica-Bold').text(
            `Overall completeness: ${progress.completionPct ?? 0}% (${progress.satisfiedRequired ?? 0}/${progress.requiredItems ?? 0} required items)`
        );
        doc.moveDown();

        for (const category of checklist.categories || []) {
            const catProgress = (progress.categories || []).find((c) => c.key === category.key);
            const pct = catProgress?.required
                ? Math.round(((catProgress.satisfied || 0) / catProgress.required) * 100)
                : 100;
            doc.font('Helvetica-Bold').fontSize(12).text(`${category.label} — ${pct}%`, { underline: true });
            doc.moveDown(0.3);
            doc.font('Helvetica').fontSize(9);

            for (const item of category.items || []) {
                const files = (item.links || [])
                    .map((l) => l.originalFileName || l.fileName || l.title || `#${l.sourceId}`)
                    .join('; ');
                doc.text(
                    `• [${statusLabel(item)}] ${item.itemLabel}${item.isRequired ? ' (required)' : ''}`
                );
                if (files) doc.text(`    Files: ${files}`, { indent: 12 });
                if (item.waivedReason) doc.text(`    Note: ${item.waivedReason}`, { indent: 12 });
            }
            doc.moveDown(0.6);
        }

        doc.font('Helvetica-Oblique').fontSize(8).text(
            'This report is generated from the E-CIMES Project File Checklist Guide and reflects linked documents at export time.',
            { align: 'center' }
        );
        doc.end();
    });
}

module.exports = {
    generateFileChecklistAuditPdf,
};
