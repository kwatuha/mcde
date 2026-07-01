const express = require('express');
const router = express.Router();
const privilege = require('../middleware/privilegeMiddleware');
const workflow = require('../services/villageMonitoringWorkflowService');

const canRead = privilege(['monitoring_report.read', 'project.read', 'project.read_all'], { anyOf: true });
const canCreate = privilege(['monitoring_report.create', 'monitoring_report.submit'], { anyOf: true });
const canWard = privilege(['monitoring_report.ward_review', 'project.update'], { anyOf: true });
const canSubcounty = privilege(['monitoring_report.subcounty_review', 'project.update'], { anyOf: true });
const canChief = privilege(['monitoring_report.chief_approve', 'public_content.approve'], { anyOf: true });

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
      ? await workflow.getSubmissionDetail(req.params.id, req.user)
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

router.put('/reports/:id', canCreate, async (req, res) => {
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

module.exports = router;
