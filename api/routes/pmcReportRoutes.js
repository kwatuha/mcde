const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const privilege = require('../middleware/privilegeMiddleware');
const pmcReportService = require('../services/pmcReportService');

const router = express.Router();

const canRead = privilege(['pmc_report.read', 'project.read_all'], { anyOf: true });
const canCreate = privilege(['pmc_report.create', 'pmc_report.update', 'project.update'], { anyOf: true });
const canSubmit = privilege(['pmc_report.submit', 'pmc_report.update', 'project.update'], { anyOf: true });
const canReview = privilege(['pmc_report.review', 'approval_levels.update', 'project.update'], { anyOf: true });

const uploadsRoot = path.join(__dirname, '..', '..', 'uploads', 'pmc-reports');
if (!fs.existsSync(uploadsRoot)) {
    fs.mkdirSync(uploadsRoot, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = path.join(uploadsRoot, String(req.params.reportId || 'draft'));
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname || '');
        const base = path.basename(file.originalname || 'signed-report', ext).replace(/[^a-zA-Z0-9-_]/g, '_');
        cb(null, `${Date.now()}-${base}${ext}`);
    },
});

const upload = multer({
    storage,
    limits: { fileSize: 15 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowed = [
            'application/pdf',
            'image/jpeg',
            'image/png',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        ];
        if (allowed.includes(file.mimetype)) cb(null, true);
        else cb(new Error('Only PDF, Word, JPEG, or PNG files are allowed for signed PMC reports.'));
    },
});

router.use(async (req, res, next) => {
    try {
        await pmcReportService.ensurePmcReportSchema();
        next();
    } catch (error) {
        res.status(500).json({ message: 'PMC report schema initialization failed.', error: error.message });
    }
});

router.get('/', canRead, async (req, res) => {
    try {
        const rows = await pmcReportService.listReports(req.user, req.query || {});
        res.json({ rows });
    } catch (error) {
        res.status(error.statusCode || 500).json({ message: error.message || 'Failed to list PMC reports.' });
    }
});

router.get('/:reportId/file', canRead, async (req, res) => {
    try {
        const meta = await pmcReportService.getReportFileMeta(req.params.reportId, req.user);
        if (!meta?.signedFilePath || !fs.existsSync(meta.signedFilePath)) {
            return res.status(404).json({ message: 'Signed document not found.' });
        }
        res.setHeader('Content-Type', meta.signedMimeType || 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename="${meta.signedFileName || 'pmc-report'}"`);
        return res.sendFile(path.resolve(meta.signedFilePath));
    } catch (error) {
        res.status(error.statusCode || 500).json({ message: error.message || 'Failed to download PMC report file.' });
    }
});

router.get('/:reportId', canRead, async (req, res) => {
    try {
        const report = await pmcReportService.getReportById(req.params.reportId, req.user);
        if (!report) return res.status(404).json({ message: 'PMC report not found.' });
        res.json(report);
    } catch (error) {
        res.status(error.statusCode || 500).json({ message: error.message || 'Failed to fetch PMC report.' });
    }
});

router.post('/', canCreate, async (req, res) => {
    try {
        const report = await pmcReportService.createReport(req.user, req.body || {});
        res.status(201).json(report);
    } catch (error) {
        res.status(error.statusCode || 500).json({ message: error.message || 'Failed to create PMC report.' });
    }
});

router.put('/:reportId', canCreate, async (req, res) => {
    try {
        const report = await pmcReportService.updateReport(req.params.reportId, req.user, req.body || {});
        res.json(report);
    } catch (error) {
        res.status(error.statusCode || 500).json({ message: error.message || 'Failed to update PMC report.' });
    }
});

router.post('/:reportId/upload', canCreate, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ message: 'Signed report file is required.' });
        const report = await pmcReportService.attachSignedFile(req.params.reportId, req.user, {
            fileName: req.file.originalname,
            filePath: req.file.path,
            mimeType: req.file.mimetype,
            fileSize: req.file.size,
        });
        res.json(report);
    } catch (error) {
        res.status(error.statusCode || 500).json({ message: error.message || 'Failed to upload signed PMC report.' });
    }
});

router.post('/:reportId/submit', canSubmit, async (req, res) => {
    try {
        const report = await pmcReportService.submitReport(req.params.reportId, req.user);
        res.json(report);
    } catch (error) {
        res.status(error.statusCode || 500).json({ message: error.message || 'Failed to submit PMC report.' });
    }
});

router.post('/:reportId/approve', canReview, async (req, res) => {
    try {
        const report = await pmcReportService.approveReport(req.params.reportId, req.user, req.body?.comment || '');
        res.json(report);
    } catch (error) {
        res.status(error.statusCode || 500).json({ message: error.message || 'Failed to approve PMC report.' });
    }
});

router.post('/:reportId/return', canReview, async (req, res) => {
    try {
        const report = await pmcReportService.returnReport(req.params.reportId, req.user, req.body?.comment || '');
        res.json(report);
    } catch (error) {
        res.status(error.statusCode || 500).json({ message: error.message || 'Failed to return PMC report.' });
    }
});

router.delete('/:reportId', canCreate, async (req, res) => {
    try {
        const result = await pmcReportService.voidReport(req.params.reportId, req.user);
        res.json(result);
    } catch (error) {
        res.status(error.statusCode || 500).json({ message: error.message || 'Failed to delete PMC report.' });
    }
});

module.exports = router;
