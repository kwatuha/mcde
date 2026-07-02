const fs = require('fs');
const path = require('path');
const pool = require('../config/db');
const contractorPayment = require('./contractorPaymentService');

const TEMPLATE_JSON = path.join(__dirname, '../data/project-file-checklist-template-v1.json');

const PROCUREMENT_STAGE_ITEM_KEYS = {
    'needs identification': ['inception_scoping_report'],
    'requisition approved': ['inception_scoping_report'],
    'tender published': ['advert'],
    'bidder registry': ['bidder_tender_documents'],
    'bidder pre-qualification': ['bidder_tender_documents'],
    'bid evaluation': ['opening_reports_minutes', 'evaluation_reports_minutes', 'bidder_tender_documents'],
    'award decision': ['award_letter'],
    'contract signing': ['contract_priced_boq', 'agreement', 'acceptance_letter'],
};

const CERTIFICATE_TYPE_ITEM_KEYS = [
    { match: /interim/i, keys: ['interim_payment_certificates'] },
    { match: /retention/i, keys: ['retention_payment_certificate'] },
    { match: /complet|substantial|final/i, keys: ['completion_certificates', 'taking_over_certificate'] },
];

const PHASE_GATES = [
    {
        key: 'pre_commencement',
        label: 'Pre-Commencement clearance',
        categoryKey: 'pre_commencement',
        minPct: 100,
        milestonePatterns: [],
    },
    {
        key: 'site_handover',
        label: 'Site handover readiness',
        categoryKey: 'site_handover',
        minPct: 100,
        milestonePatterns: [/handover/i, /possession/i],
    },
    {
        key: 'commencement',
        label: 'Commencement allowed',
        categoryKeys: ['pre_commencement', 'site_handover'],
        minPct: 100,
        requiredItemKeys: ['order_to_commence'],
        milestonePatterns: [/commence/i, /site start/i, /order to commence/i],
    },
];

let schemaReady = false;

async function ensureSchema() {
    if (schemaReady) return;
    const migrations = [
        path.join(__dirname, '../migrations/20260708_project_file_checklist.sql'),
        path.join(__dirname, '../migrations/20260709_project_file_checklist_phase2.sql'),
    ];
    for (const migrationPath of migrations) {
        if (!fs.existsSync(migrationPath)) continue;
        const sql = fs.readFileSync(migrationPath, 'utf8');
        try {
            await pool.query(sql);
        } catch (err) {
            console.error(`projectFileChecklist migration failed (${path.basename(migrationPath)}):`, err.message);
            throw err;
        }
    }
    if (!(await tableExists('project_file_checklist_items'))) {
        const err = new Error('project_file_checklist_items table was not created. Run scripts/run-july-2026-migrations.sh');
        err.statusCode = 500;
        throw err;
    }
    schemaReady = true;
}

async function tableExists(tableName) {
    const result = await pool.query(
        `SELECT 1 FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = $1 LIMIT 1`,
        [tableName]
    );
    return Boolean(result.rows?.length);
}

async function seedTemplateIfNeeded() {
    const active = await pool.query(
        `SELECT id FROM project_file_checklist_templates WHERE is_active = true ORDER BY id DESC LIMIT 1`
    );
    if (active.rows?.length) {
        await syncContractorUploadableFlags(active.rows[0].id);
        return active.rows[0].id;
    }

    const raw = JSON.parse(fs.readFileSync(TEMPLATE_JSON, 'utf8'));
    const insertTemplate = await pool.query(
        `INSERT INTO project_file_checklist_templates (version, name, is_active, effective_from)
         VALUES ($1, $2, true, CURRENT_DATE)
         RETURNING id`,
        [raw.version, raw.name]
    );
    const templateId = insertTemplate.rows[0].id;
    let sortOrder = 0;
    for (const category of raw.categories || []) {
        for (const item of category.items || []) {
            sortOrder += 1;
            await pool.query(
                `INSERT INTO project_file_checklist_template_items (
                    template_id, category_key, category_label, category_sort_order,
                    item_key, item_label, sort_order, is_required, allows_multiple,
                    suggested_document_type, help_text, contractor_uploadable
                ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
                [
                    templateId,
                    category.key,
                    category.label,
                    category.sortOrder || 0,
                    item.key,
                    item.label,
                    sortOrder,
                    item.required !== false,
                    Boolean(item.allowsMultiple),
                    item.suggestedDocumentType || null,
                    item.helpText || null,
                    Boolean(item.contractorUploadable),
                ]
            );
        }
    }
    return templateId;
}

async function syncContractorUploadableFlags(templateId) {
    const raw = JSON.parse(fs.readFileSync(TEMPLATE_JSON, 'utf8'));
    const uploadableKeys = new Set();
    for (const category of raw.categories || []) {
        for (const item of category.items || []) {
            if (item.contractorUploadable) uploadableKeys.add(item.key);
        }
    }
    if (!uploadableKeys.size) return;
    await pool.query(
        `UPDATE project_file_checklist_template_items
         SET contractor_uploadable = (item_key = ANY($2::text[]))
         WHERE template_id = $1`,
        [templateId, [...uploadableKeys]]
    );
}

async function getActiveTemplateId() {
    await ensureSchema();
    return seedTemplateIfNeeded();
}

async function projectExists(projectId) {
    const result = await pool.query(
        `SELECT project_id, name FROM projects
         WHERE project_id = $1 AND COALESCE(voided, false) = false LIMIT 1`,
        [projectId]
    );
    return result.rows?.[0] || null;
}

async function ensureProjectItems(projectId, userId = null) {
    const templateId = await getActiveTemplateId();
    await pool.query(
        `INSERT INTO project_file_checklist_items (project_id, template_item_id, status, updated_by)
         SELECT $1, ti.id, 'missing', $2
         FROM project_file_checklist_template_items ti
         WHERE ti.template_id = $3
         ON CONFLICT (project_id, template_item_id) DO NOTHING`,
        [projectId, userId, templateId]
    );
}

async function getItemsByKey(projectId) {
    const result = await pool.query(
        `SELECT pci.id, ti.item_key, ti.suggested_document_type, ti.allows_multiple
         FROM project_file_checklist_items pci
         INNER JOIN project_file_checklist_template_items ti ON ti.id = pci.template_item_id
         WHERE pci.project_id = $1`,
        [projectId]
    );
    const byKey = new Map();
    for (const row of result.rows || []) {
        if (!byKey.has(row.item_key)) byKey.set(row.item_key, []);
        byKey.get(row.item_key).push(row);
    }
    return byKey;
}

async function linkSource(projectId, checklistItemId, sourceType, sourceId, userId = null) {
    await pool.query(
        `INSERT INTO project_file_checklist_links (checklist_item_id, source_type, source_id, linked_by)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (checklist_item_id, source_type, source_id) DO NOTHING`,
        [checklistItemId, sourceType, sourceId, userId]
    );
    await pool.query(
        `UPDATE project_file_checklist_items
         SET status = 'uploaded', updated_by = $2, updated_at = NOW()
         WHERE id = $1 AND status = 'missing'`,
        [checklistItemId, userId]
    );
}

async function linkItemsByKeys(projectId, itemKeys, sourceType, sourceId, userId = null) {
    const byKey = await getItemsByKey(projectId);
    for (const key of itemKeys) {
        const rows = byKey.get(key) || [];
        for (const row of rows) {
            await linkSource(projectId, row.id, sourceType, sourceId, userId);
        }
    }
}

async function autoLinkDocuments(projectId, userId = null) {
    const docs = await pool.query(
        `SELECT id, "documentType" FROM project_documents
         WHERE "projectId" = $1 AND COALESCE(voided, false) = false`,
        [projectId]
    );
    const byKey = await getItemsByKey(projectId);
    for (const doc of docs.rows || []) {
        const docType = String(doc.documentType || '').toLowerCase();
        for (const [, rows] of byKey) {
            for (const row of rows) {
                if (row.suggested_document_type
                    && String(row.suggested_document_type).toLowerCase() === docType) {
                    await linkSource(projectId, row.id, 'project_document', doc.id, userId);
                }
            }
        }
    }
}

async function autoLinkProcurementAttachments(projectId, userId = null) {
    if (!(await tableExists('procurement_attachments'))) return;
    const attachments = await pool.query(
        `SELECT id, stage, title, file_name
         FROM procurement_attachments
         WHERE project_id = $1 AND COALESCE(voided, false) = false`,
        [projectId]
    );
    for (const att of attachments.rows || []) {
        const stage = String(att.stage || '').toLowerCase().trim();
        const keys = PROCUREMENT_STAGE_ITEM_KEYS[stage] || [];
        if (keys.length) {
            await linkItemsByKeys(projectId, keys, 'procurement_attachment', att.id, userId);
        }
        const title = `${att.title || ''} ${att.file_name || ''}`.toLowerCase();
        if (/opening|minute/.test(title)) {
            await linkItemsByKeys(projectId, ['opening_reports_minutes'], 'procurement_attachment', att.id, userId);
        }
        if (/evaluation|tender/.test(title)) {
            await linkItemsByKeys(projectId, ['evaluation_reports_minutes', 'bidder_tender_documents'], 'procurement_attachment', att.id, userId);
        }
    }
}

async function autoLinkCertificates(projectId, userId = null) {
    if (!(await tableExists('projectcertificate'))) return;
    const certs = await pool.query(
        `SELECT "certificateId", "certType", "certSubType", "fileName", path
         FROM projectcertificate
         WHERE "projectId" = $1 AND COALESCE(voided, false) = false`,
        [projectId]
    );
    for (const cert of certs.rows || []) {
        const label = `${cert.certType || ''} ${cert.certSubType || ''} ${cert.fileName || ''}`;
        for (const rule of CERTIFICATE_TYPE_ITEM_KEYS) {
            if (rule.match.test(label)) {
                await linkItemsByKeys(projectId, rule.keys, 'certificate', cert.certificateId, userId);
            }
        }
    }
}

async function autoLinkAll(projectId, userId = null) {
    await autoLinkDocuments(projectId, userId);
    await autoLinkProcurementAttachments(projectId, userId);
    await autoLinkCertificates(projectId, userId);
}

function buildProgress(rows) {
    const required = rows.filter((r) => r.isRequired && r.status !== 'not_applicable' && r.status !== 'waived');
    const satisfied = required.filter((r) => r.status === 'uploaded' || (r.linkCount || 0) > 0);
    const categories = {};
    rows.forEach((row) => {
        if (!categories[row.categoryKey]) {
            categories[row.categoryKey] = {
                key: row.categoryKey,
                label: row.categoryLabel,
                sortOrder: row.categorySortOrder,
                total: 0,
                required: 0,
                satisfied: 0,
            };
        }
        const cat = categories[row.categoryKey];
        cat.total += 1;
        if (row.isRequired && !['not_applicable', 'waived'].includes(row.status)) {
            cat.required += 1;
            if (row.status === 'uploaded' || (row.linkCount || 0) > 0) cat.satisfied += 1;
        }
    });
    return {
        totalItems: rows.length,
        requiredItems: required.length,
        satisfiedRequired: satisfied.length,
        completionPct: required.length
            ? Math.round((satisfied.length / required.length) * 100)
            : 100,
        categories: Object.values(categories).sort((a, b) => a.sortOrder - b.sortOrder),
    };
}

function categoryPct(progress, categoryKey) {
    const cat = (progress.categories || []).find((c) => c.key === categoryKey);
    if (!cat || !cat.required) return 100;
    return Math.round((cat.satisfied / cat.required) * 100);
}

function itemSatisfied(item) {
    return item.status === 'uploaded'
        || (item.linkCount || 0) > 0
        || item.status === 'not_applicable'
        || item.status === 'waived';
}

function buildPhaseGates(checklist) {
    const items = (checklist.categories || []).flatMap((c) => c.items || []);
    const progress = checklist.progress || {};

    return PHASE_GATES.map((gate) => {
        let passed = true;
        let message = 'Requirements met.';

        if (gate.categoryKey) {
            const pct = categoryPct(progress, gate.categoryKey);
            passed = pct >= (gate.minPct || 100);
            if (!passed) {
                message = `${gate.label} is ${pct}% complete (${gate.minPct}% required).`;
            }
        }

        if (gate.categoryKeys?.length) {
            const failing = gate.categoryKeys.filter((key) => categoryPct(progress, key) < (gate.minPct || 100));
            if (failing.length) {
                passed = false;
                message = `Complete categories: ${failing.join(', ').replace(/_/g, ' ')}.`;
            }
        }

        if (gate.requiredItemKeys?.length) {
            const missing = gate.requiredItemKeys.filter((key) => {
                const item = items.find((i) => i.itemKey === key);
                return item && !itemSatisfied(item);
            });
            if (missing.length) {
                passed = false;
                message = `Missing required items: ${missing.join(', ').replace(/_/g, ' ')}.`;
            }
        }

        return {
            key: gate.key,
            label: gate.label,
            passed,
            message,
            minPct: gate.minPct || 100,
            milestonePatterns: gate.milestonePatterns || [],
        };
    });
}

async function assertMilestonePhaseGate(projectId, milestoneName, userId = null) {
    const checklist = await getProjectChecklist(projectId, { autoLink: true, userId });
    const gates = buildPhaseGates(checklist);
    const name = String(milestoneName || '').toLowerCase();
    for (const gate of gates) {
        const relevant = (gate.milestonePatterns || []).some((re) => re.test(name));
        if (relevant && !gate.passed) {
            const err = new Error(`Phase gate blocked: ${gate.message}`);
            err.statusCode = 409;
            err.phaseGate = gate;
            throw err;
        }
    }
}

async function fetchLinksForItems(itemIds) {
    if (!itemIds.length) return [];
    const hasProcurement = await tableExists('procurement_attachments');
    const hasCerts = await tableExists('projectcertificate');

    const procurementJoin = hasProcurement
        ? `LEFT JOIN procurement_attachments pa
            ON pa.id = l.source_id AND l.source_type = 'procurement_attachment'`
        : '';
    const certJoin = hasCerts
        ? `LEFT JOIN projectcertificate c
            ON c."certificateId" = l.source_id AND l.source_type = 'certificate'`
        : '';

    const result = await pool.query(
        `SELECT
            l.id AS "linkId",
            l.checklist_item_id AS "itemId",
            l.source_type AS "sourceType",
            l.source_id AS "sourceId",
            l.linked_at AS "linkedAt",
            d."documentType" AS "documentType",
            d."documentCategory" AS "documentCategory",
            COALESCE(d."originalFileName", ${hasProcurement ? 'pa.file_name' : 'NULL'}, ${hasCerts ? 'c."fileName"' : 'NULL'}) AS "originalFileName",
            COALESCE(d."documentPath", ${hasProcurement ? 'pa.file_path' : 'NULL'}, ${hasCerts ? 'c.path' : 'NULL'}) AS "documentPath",
            COALESCE(d.description, ${hasProcurement ? 'pa.title' : 'NULL'}, ${hasCerts ? 'c."certType"' : 'NULL'}) AS description,
            ${hasProcurement ? 'pa.stage AS "procurementStage"' : 'NULL AS "procurementStage"'}
         FROM project_file_checklist_links l
         LEFT JOIN project_documents d ON d.id = l.source_id AND l.source_type = 'project_document'
         ${procurementJoin}
         ${certJoin}
         WHERE l.checklist_item_id = ANY($1::int[])
         ORDER BY l.linked_at DESC`,
        [itemIds]
    );
    return result.rows || [];
}

async function getProjectChecklist(projectId, { autoLink = true, userId = null, contractorOnly = false } = {}) {
    const project = await projectExists(projectId);
    if (!project) {
        const err = new Error('Project not found.');
        err.statusCode = 404;
        throw err;
    }
    await ensureProjectItems(projectId, userId);
    if (autoLink) await autoLinkAll(projectId, userId);

    const contractorFilter = contractorOnly ? 'AND ti.contractor_uploadable = true' : '';

    const result = await pool.query(
        `SELECT
            pci.id AS "itemId",
            pci.project_id AS "projectId",
            pci.status,
            pci.notes,
            pci.waived_reason AS "waivedReason",
            pci.waived_at AS "waivedAt",
            ti.id AS "templateItemId",
            ti.category_key AS "categoryKey",
            ti.category_label AS "categoryLabel",
            ti.category_sort_order AS "categorySortOrder",
            ti.item_key AS "itemKey",
            ti.item_label AS "itemLabel",
            ti.sort_order AS "sortOrder",
            ti.is_required AS "isRequired",
            ti.allows_multiple AS "allowsMultiple",
            ti.suggested_document_type AS "suggestedDocumentType",
            ti.contractor_uploadable AS "contractorUploadable",
            ti.help_text AS "helpText",
            COALESCE(lc.cnt, 0)::int AS "linkCount"
         FROM project_file_checklist_items pci
         INNER JOIN project_file_checklist_template_items ti ON ti.id = pci.template_item_id
         LEFT JOIN (
            SELECT checklist_item_id, COUNT(*)::int AS cnt
            FROM project_file_checklist_links
            GROUP BY checklist_item_id
         ) lc ON lc.checklist_item_id = pci.id
         WHERE pci.project_id = $1 ${contractorFilter}
         ORDER BY ti.category_sort_order, ti.sort_order`,
        [projectId]
    );

    const itemIds = result.rows.map((r) => r.itemId);
    const links = await fetchLinksForItems(itemIds);
    const linksByItem = links.reduce((acc, link) => {
        if (!acc[link.itemId]) acc[link.itemId] = [];
        acc[link.itemId].push(link);
        return acc;
    }, {});

    const items = result.rows.map((row) => ({
        ...row,
        links: linksByItem[row.itemId] || [],
        status: (linksByItem[row.itemId]?.length && row.status === 'missing') ? 'uploaded' : row.status,
        linkCount: linksByItem[row.itemId]?.length || row.linkCount || 0,
    }));

    const categoriesMap = new Map();
    items.forEach((item) => {
        if (!categoriesMap.has(item.categoryKey)) {
            categoriesMap.set(item.categoryKey, {
                key: item.categoryKey,
                label: item.categoryLabel,
                sortOrder: item.categorySortOrder,
                items: [],
            });
        }
        categoriesMap.get(item.categoryKey).items.push(item);
    });

    const progress = buildProgress(items);
    const payload = {
        projectId,
        projectName: project.name,
        progress,
        categories: [...categoriesMap.values()].sort((a, b) => a.sortOrder - b.sortOrder),
    };
    payload.phaseGates = buildPhaseGates(payload);
    return payload;
}

async function updateItemStatus(projectId, itemId, payload, userId) {
    const { status, notes, waivedReason } = payload;
    const allowed = ['missing', 'uploaded', 'not_applicable', 'waived'];
    if (!allowed.includes(status)) {
        const err = new Error('Invalid status.');
        err.statusCode = 400;
        throw err;
    }
    if ((status === 'waived' || status === 'not_applicable') && !String(waivedReason || notes || '').trim()) {
        const err = new Error('Reason is required when marking an item N/A or waived.');
        err.statusCode = 400;
        throw err;
    }

    const result = await pool.query(
        `UPDATE project_file_checklist_items pci
         SET status = $3,
             notes = $4,
             waived_reason = CASE WHEN $3 IN ('waived', 'not_applicable') THEN $5 ELSE NULL END,
             waived_by = CASE WHEN $3 IN ('waived', 'not_applicable') THEN $6 ELSE NULL END,
             waived_at = CASE WHEN $3 IN ('waived', 'not_applicable') THEN NOW() ELSE NULL END,
             updated_by = $6,
             updated_at = NOW()
         WHERE pci.id = $1 AND pci.project_id = $2
         RETURNING id`,
        [itemId, projectId, status, notes || null, waivedReason || notes || null, userId]
    );
    if (!result.rows?.length) {
        const err = new Error('Checklist item not found.');
        err.statusCode = 404;
        throw err;
    }
    return getProjectChecklist(projectId, { autoLink: false, userId });
}

async function linkDocument(projectId, itemId, documentId, userId) {
    const doc = await pool.query(
        `SELECT id FROM project_documents
         WHERE id = $1 AND "projectId" = $2 AND COALESCE(voided, false) = false`,
        [documentId, projectId]
    );
    if (!doc.rows?.length) {
        const err = new Error('Document not found for this project.');
        err.statusCode = 404;
        throw err;
    }
    const item = await pool.query(
        `SELECT pci.id, ti.contractor_uploadable
         FROM project_file_checklist_items pci
         INNER JOIN project_file_checklist_template_items ti ON ti.id = pci.template_item_id
         WHERE pci.id = $1 AND pci.project_id = $2`,
        [itemId, projectId]
    );
    if (!item.rows?.length) {
        const err = new Error('Checklist item not found.');
        err.statusCode = 404;
        throw err;
    }
    await linkSource(projectId, itemId, 'project_document', documentId, userId);
    return getProjectChecklist(projectId, { autoLink: false, userId });
}

async function unlinkDocument(projectId, linkId, userId) {
    const link = await pool.query(
        `SELECT l.id, l.checklist_item_id AS "itemId", l.source_type AS "sourceType"
         FROM project_file_checklist_links l
         INNER JOIN project_file_checklist_items pci ON pci.id = l.checklist_item_id
         WHERE l.id = $1 AND pci.project_id = $2`,
        [linkId, projectId]
    );
    if (!link.rows?.length) {
        const err = new Error('Link not found.');
        err.statusCode = 404;
        throw err;
    }
    const itemId = link.rows[0].itemId;
    await pool.query(`DELETE FROM project_file_checklist_links WHERE id = $1`, [linkId]);

    const remaining = await pool.query(
        `SELECT COUNT(*)::int AS cnt FROM project_file_checklist_links WHERE checklist_item_id = $1`,
        [itemId]
    );
    if ((remaining.rows[0]?.cnt || 0) === 0) {
        await pool.query(
            `UPDATE project_file_checklist_items
             SET status = 'missing', updated_by = $2, updated_at = NOW()
             WHERE id = $1 AND status = 'uploaded'`,
            [itemId, userId]
        );
    }
    return getProjectChecklist(projectId, { autoLink: false, userId });
}

async function assertContractorItemAccess(contractorId, projectId, itemId) {
    const assigned = await contractorPayment.isContractorAssignedToProject(contractorId, projectId);
    if (!assigned) {
        const err = new Error('Contractor is not assigned to this project.');
        err.statusCode = 403;
        throw err;
    }
    const item = await pool.query(
        `SELECT pci.id, ti.contractor_uploadable
         FROM project_file_checklist_items pci
         INNER JOIN project_file_checklist_template_items ti ON ti.id = pci.template_item_id
         WHERE pci.id = $1 AND pci.project_id = $2 AND ti.contractor_uploadable = true`,
        [itemId, projectId]
    );
    if (!item.rows?.length) {
        const err = new Error('This checklist item is not available for contractor upload.');
        err.statusCode = 403;
        throw err;
    }
}

async function getBulkChecklistSummaries(projectIds) {
    if (!Array.isArray(projectIds) || projectIds.length === 0) return {};
    await ensureSchema();
    if (!(await tableExists('project_file_checklist_items'))) {
        return {};
    }
    const ids = [...new Set(projectIds.map((id) => Number(id)).filter((id) => Number.isFinite(id)))];
    if (!ids.length) return {};

    const result = await pool.query(
        `SELECT
            pci.project_id AS "projectId",
            COUNT(*) FILTER (
                WHERE ti.is_required = true
                  AND pci.status NOT IN ('not_applicable', 'waived')
            )::int AS "requiredItems",
            COUNT(*) FILTER (
                WHERE ti.is_required = true
                  AND pci.status NOT IN ('not_applicable', 'waived')
                  AND (
                    pci.status = 'uploaded'
                    OR EXISTS (
                        SELECT 1 FROM project_file_checklist_links l
                        WHERE l.checklist_item_id = pci.id
                    )
                  )
            )::int AS "satisfiedRequired"
         FROM project_file_checklist_items pci
         INNER JOIN project_file_checklist_template_items ti ON ti.id = pci.template_item_id
         WHERE pci.project_id = ANY($1::int[])
         GROUP BY pci.project_id`,
        [ids]
    );

    const map = {};
    for (const row of result.rows || []) {
        const required = Number(row.requiredItems || 0);
        const satisfied = Number(row.satisfiedRequired || 0);
        map[row.projectId] = {
            requiredItems: required,
            satisfiedRequired: satisfied,
            completionPct: required > 0 ? Math.round((satisfied / required) * 100) : 100,
        };
    }
    return map;
}

module.exports = {
    ensureSchema,
    getProjectChecklist,
    getBulkChecklistSummaries,
    updateItemStatus,
    linkDocument,
    unlinkDocument,
    assertMilestonePhaseGate,
    assertContractorItemAccess,
    linkSource,
};
