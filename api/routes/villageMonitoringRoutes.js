const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const router = express.Router();
const privilege = require('../middleware/privilegeMiddleware');
const workflow = require('../services/villageMonitoringWorkflowService');

const canRead = privilege(['monitoring_report.read', 'project.read', 'project.read_all'], { anyOf: true });
const canCreate = privilege(['monitoring_report.create', 'monitoring_report.submit'], { anyOf: true });
const canWard = privilege(['monitoring_report.ward_review', 'project.update'], { anyOf: true });
const canSubcounty = privilege(['monitoring_report.subcounty_review', 'project.update'], { anyOf: true });
const canChief = privilege(['monitoring_report.chief_approve', 'public_content.approve'], { anyOf: true });

const uploadsRoot = path.join(__dirname, '..', '..', 'uploads', 'monitoring-reports');
if (!fs.existsSync(uploadsRoot)) {
  fs.mkdirSync(uploadsRoot, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(uploadsRoot, String(req.params.id || 'draft'));
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '');
    const base = path.basename(file.originalname || 'monitoring-report', ext).replace(/[^a-zA-Z0-9-_]/g, '_');
    cb(null, `${Date.now()}-${base}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Only PDF or Word documents are allowed for formatted monitoring reports.'));
  },
});

router.use(async (req, res, next) => {
  try {
    await workflow.ensureMonitoringWorkflowSchema();
    next();
  } catch (e) {
    res.status(500).json({ message: 'Monitoring workflow schema initialization failed.', error: e.message });
  }
});

router.get('/summary', canRead, async (req, res) => {
  try {
    const summary = await workflow.getWorkflowSummary(req.user);
    res.json(summary);
  } catch (e) {
    res.status(e.statusCode || 500).json({ message: e.message });
  }
});

router.post('/reports', canCreate, async (req, res) => {
  try {
    const report = await workflow.createDraftReport(req.user, req.body || {});
    res.status(201).json(report);
  } catch (e) {
    res.status(e.statusCode || 500).json({ message: e.message });
  }
});

router.get('/reports', canRead, async (req, res) => {
  try {
    const rows = await workflow.listSubmissions(req.user, req.query || {});
    res.json({ rows });
  } catch (e) {
    res.status(e.statusCode || 500).json({ message: e.message });
  }
});

router.get('/reports/:id', canRead, async (req, res) => {
  try {
    const detail = req.query.detail === 'true'
      ? await workflow.getSubmissionDetailWithFormattedReport(req.params.id, req.user)
      : await workflow.getSubmissionById(req.params.id, req.user);
    if (!detail) return res.status(404).json({ message: 'Monitoring report not found.' });
    res.json(detail);
  } catch (e) {
    res.status(e.statusCode || 500).json({ message: e.message });
  }
});

router.get('/reports/:id/history', canRead, async (req, res) => {
  try {
    const actions = await workflow.listActions(req.params.id, req.user);
    res.json({ actions });
  } catch (e) {
    res.status(e.statusCode || 500).json({ message: e.message });
  }
});

router.put('/reports/:id', privilege(['monitoring_report.create', 'monitoring_report.submit', 'monitoring_report.ward_review'], { anyOf: true }), async (req, res) => {
  try {
    const report = await workflow.updateSubmission(req.params.id, req.user, req.body || {});
    res.json(report);
  } catch (e) {
    res.status(e.statusCode || 500).json({ message: e.message });
  }
});

router.post('/reports/submit-drafts', canCreate, async (req, res) => {
  try {
    const result = await workflow.submitAllDrafts(req.user);
    res.json(result);
  } catch (e) {
    res.status(e.statusCode || 500).json({ message: e.message });
  }
});

router.post('/reports/:id/submit', canCreate, async (req, res) => {
  try {
    const report = await workflow.submitFromVillage(req.params.id, req.user);
    res.json(report);
  } catch (e) {
    res.status(e.statusCode || 500).json({ message: e.message });
  }
});

router.post('/reports/:id/forward-subcounty', canWard, async (req, res) => {
  try {
    const report = await workflow.forwardToSubcounty(req.params.id, req.user, req.body?.comment);
    res.json(report);
  } catch (e) {
    res.status(e.statusCode || 500).json({ message: e.message });
  }
});

router.post('/reports/:id/return-ward', canSubcounty, async (req, res) => {
  try {
    const report = await workflow.returnToWard(req.params.id, req.user, req.body?.comment);
    res.json(report);
  } catch (e) {
    res.status(e.statusCode || 500).json({ message: e.message });
  }
});

router.post('/reports/:id/forward-chief', canSubcounty, async (req, res) => {
  try {
    const report = await workflow.forwardToChief(req.params.id, req.user, req.body?.comment);
    res.json(report);
  } catch (e) {
    res.status(e.statusCode || 500).json({ message: e.message });
  }
});

router.post('/reports/:id/approve', canChief, async (req, res) => {
  try {
    const report = await workflow.approveByChief(req.params.id, req.user, req.body?.comment);
    res.json(report);
  } catch (e) {
    res.status(e.statusCode || 500).json({ message: e.message });
  }
});

router.get('/reports/:id/export-word', canRead, async (req, res) => {
  try {
    const { buffer, filename } = await workflow.exportReportWord(req.params.id, req.user);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (e) {
    res.status(e.statusCode || 500).json({ message: e.message || 'Failed to export monitoring report.' });
  }
});

router.post('/reports/:id/formatted-report', canWard, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'Formatted report file is required.' });
    const report = await workflow.attachFormattedReport(req.params.id, req.user, {
      fileName: req.file.originalname,
      filePath: req.file.path,
      mimeType: req.file.mimetype,
      fileSize: req.file.size,
    });
    res.json(report);
  } catch (e) {
    res.status(e.statusCode || 500).json({ message: e.message || 'Failed to upload formatted monitoring report.' });
  }
});

router.get('/reports/:id/formatted-report', canRead, async (req, res) => {
  try {
    const meta = await workflow.getFormattedReportDownloadMeta(req.params.id, req.user);
    if (!meta?.filePath || !fs.existsSync(meta.filePath)) {
      return res.status(404).json({ message: 'Uploaded formatted report file not found on disk.' });
    }
    res.setHeader('Content-Type', meta.mimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${meta.fileName || 'monitoring-report.docx'}"`);
    return res.sendFile(path.resolve(meta.filePath));
  } catch (e) {
    res.status(e.statusCode || 500).json({ message: e.message || 'Failed to download formatted monitoring report.' });
  }
});

module.exports = router;
