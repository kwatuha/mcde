const express = require('express');
const router = express.Router();
const auth = require('../middleware/authenticate');
const privilege = require('../middleware/privilegeMiddleware');
const {
    getProjectChecklist,
    updateItemStatus,
    linkDocument,
    unlinkDocument,
    assertMilestonePhaseGate,
    assertContractorItemAccess,
    linkSource,
} = require('../services/projectFileChecklistService');
const { generateFileChecklistAuditPdf } = require('../services/projectFileChecklistExportService');
const contractorAuth = require('../services/contractorAuthService');
const contractorPayment = require('../services/contractorPaymentService');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const pool = require('../config/db');

const uploadDir = path.join(__dirname, '..', '..', 'uploads', 'documents');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({
    dest: path.join(__dirname, '..', '..', 'uploads', 'temp'),
});

function getUserId(req) {
    const value = req.user?.id ?? req.user?.userId ?? req.user?.actualUserId ?? null;
    return Number.isFinite(Number(value)) ? Number(value) : null;
}

function parseProjectId(req) {
    const projectId = Number(req.params.projectId);
    if (!Number.isFinite(projectId)) return null;
    return projectId;
}

router.get(
    '/projects/:projectId/file-checklist',
    auth,
    privilege(['project.file_checklist.read', 'project.read', 'document.read'], { anyOf: true }),
    async (req, res) => {
        try {
            const projectId = parseProjectId(req);
            if (!projectId) return res.status(400).json({ message: 'Invalid projectId.' });
            const data = await getProjectChecklist(projectId, { userId: getUserId(req) });
            return res.json(data);
        } catch (error) {
            const status = error.statusCode || 500;
            return res.status(status).json({ message: error.message || 'Failed to load file checklist.' });
        }
    }
);

router.get(
    '/projects/:projectId/file-checklist/audit-pdf',
    auth,
    privilege(['project.file_checklist.read', 'project.read', 'document.read'], { anyOf: true }),
    async (req, res) => {
        try {
            const projectId = parseProjectId(req);
            if (!projectId) return res.status(400).json({ message: 'Invalid projectId.' });
            const buffer = await generateFileChecklistAuditPdf(projectId, getUserId(req));
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader(
                'Content-Disposition',
                `attachment; filename="project-file-audit-${projectId}.pdf"`
            );
            return res.send(buffer);
        } catch (error) {
            const status = error.statusCode || 500;
            return res.status(status).json({ message: error.message || 'Failed to export audit PDF.' });
        }
    }
);

router.patch(
    '/projects/:projectId/file-checklist/items/:itemId',
    auth,
    privilege(['project.file_checklist.update', 'project.update', 'document.create'], { anyOf: true }),
    async (req, res) => {
        try {
            const projectId = parseProjectId(req);
            const itemId = Number(req.params.itemId);
            if (!projectId || !Number.isFinite(itemId)) {
                return res.status(400).json({ message: 'Invalid project or item id.' });
            }
            const status = String(req.body?.status || '').trim();
            if (['waived', 'not_applicable'].includes(status)) {
                const privileges = req.user?.privileges || [];
                const canWaive = privileges.some((p) =>
                    ['project.file_checklist.waive', 'project.update', 'admin'].includes(p)
                );
                if (!canWaive) {
                    return res.status(403).json({ message: 'You do not have permission to waive checklist items.' });
                }
            }
            const data = await updateItemStatus(
                projectId,
                itemId,
                {
                    status,
                    notes: req.body?.notes,
                    waivedReason: req.body?.waivedReason,
                },
                getUserId(req)
            );
            return res.json(data);
        } catch (error) {
            const status = error.statusCode || 500;
            return res.status(status).json({ message: error.message || 'Failed to update checklist item.' });
        }
    }
);

router.post(
    '/projects/:projectId/file-checklist/items/:itemId/link',
    auth,
    privilege(['project.file_checklist.update', 'document.create'], { anyOf: true }),
    async (req, res) => {
        try {
            const projectId = parseProjectId(req);
            const itemId = Number(req.params.itemId);
            const documentId = Number(req.body?.documentId);
            if (!projectId || !Number.isFinite(itemId) || !Number.isFinite(documentId)) {
                return res.status(400).json({ message: 'projectId, itemId, and documentId are required.' });
            }
            const data = await linkDocument(projectId, itemId, documentId, getUserId(req));
            return res.json(data);
        } catch (error) {
            const status = error.statusCode || 500;
            return res.status(status).json({ message: error.message || 'Failed to link document.' });
        }
    }
);

router.delete(
    '/projects/:projectId/file-checklist/links/:linkId',
    auth,
    privilege(['project.file_checklist.update', 'document.create'], { anyOf: true }),
    async (req, res) => {
        try {
            const projectId = parseProjectId(req);
            const linkId = Number(req.params.linkId);
            if (!projectId || !Number.isFinite(linkId)) {
                return res.status(400).json({ message: 'Invalid project or link id.' });
            }
            const data = await unlinkDocument(projectId, linkId, getUserId(req));
            return res.json(data);
        } catch (error) {
            const status = error.statusCode || 500;
            return res.status(status).json({ message: error.message || 'Failed to unlink document.' });
        }
    }
);

router.get(
    '/contractors/:contractorId/projects/:projectId/file-checklist',
    auth,
    privilege(['contractor.portal', 'payment_request.create'], { anyOf: true }),
    async (req, res) => {
        try {
            const contractorId = Number(req.params.contractorId);
            const projectId = Number(req.params.projectId);
            if (!contractorAuth.callerCanAccessContractor(req, contractorId)) {
                return res.status(403).json({ message: 'Access denied.' });
            }
            const assigned = await contractorPayment.isContractorAssignedToProject(contractorId, projectId);
            if (!assigned) {
                return res.status(403).json({ message: 'Contractor is not assigned to this project.' });
            }
            const data = await getProjectChecklist(projectId, {
                userId: getUserId(req),
                contractorOnly: true,
            });
            return res.json(data);
        } catch (error) {
            const status = error.statusCode || 500;
            return res.status(status).json({ message: error.message || 'Failed to load contractor checklist.' });
        }
    }
);

router.post(
    '/contractors/:contractorId/projects/:projectId/file-checklist/items/:itemId/upload',
    auth,
    privilege(['contractor.portal', 'document.create'], { anyOf: true }),
    upload.single('file'),
    async (req, res) => {
        try {
            const contractorId = Number(req.params.contractorId);
            const projectId = Number(req.params.projectId);
            const itemId = Number(req.params.itemId);
            const userId = getUserId(req);
            if (!contractorAuth.callerCanAccessContractor(req, contractorId)) {
                return res.status(403).json({ message: 'Access denied.' });
            }
            if (!req.file) {
                return res.status(400).json({ message: 'File is required.' });
            }
            await assertContractorItemAccess(contractorId, projectId, itemId);

            const itemMeta = await pool.query(
                `SELECT ti.suggested_document_type, ti.item_label
                 FROM project_file_checklist_items pci
                 INNER JOIN project_file_checklist_template_items ti ON ti.id = pci.template_item_id
                 WHERE pci.id = $1`,
                [itemId]
            );
            const documentType = itemMeta.rows?.[0]?.suggested_document_type || 'other';
            const description = req.body?.description || itemMeta.rows?.[0]?.item_label || 'Contractor checklist upload';
            const ext = path.extname(req.file.originalname || '');
            const finalName = `${uuidv4()}${ext}`;
            const finalPath = path.join(uploadDir, finalName);
            fs.renameSync(req.file.path, finalPath);
            const relativePath = path.relative(path.join(__dirname, '..', '..'), finalPath).replace(/\\/g, '/');

            const maxId = await pool.query(`SELECT COALESCE(MAX(id), 0) + 1 AS next_id FROM project_documents`);
            const nextId = maxId.rows[0].next_id;
            await pool.query(
                `INSERT INTO project_documents (
                    id, "projectId", "documentType", "documentCategory", "documentPath",
                    "originalFileName", description, "userId", "isProjectCover", voided,
                    "createdAt", "updatedAt", status
                ) VALUES ($1,$2,$3,'general',$4,$5,$6,$7,false,false,NOW(),NOW(),'pending_review')`,
                [nextId, projectId, documentType, relativePath, req.file.originalname, description, userId]
            );
            await linkSource(projectId, itemId, 'project_document', nextId, userId);
            const data = await getProjectChecklist(projectId, { autoLink: false, userId, contractorOnly: true });
            return res.status(201).json(data);
        } catch (error) {
            const status = error.statusCode || 500;
            return res.status(status).json({ message: error.message || 'Failed to upload checklist document.' });
        }
    }
);

module.exports = router;
