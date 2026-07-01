/**
 * Project escalation signals API.
 */
const express = require('express');
const router = express.Router();
const privilege = require('../middleware/privilegeMiddleware');
const engine = require('../services/projectEscalationEngine');

const canRead = privilege(['project.read', 'project.read_all', 'project.update', 'document.read_all'], { anyOf: true });
const canManage = privilege(['project.update', 'project.read_all', 'approval_levels.update'], { anyOf: true });

router.use(async (req, res, next) => {
  try {
    await engine.ensureReady();
    next();
  } catch (e) {
    console.error('projectEscalation ensureReady:', e);
    res.status(500).json({ message: 'Escalation engine initialization failed', error: e.message });
  }
});

router.get('/rules', canRead, async (req, res) => {
  try {
    const rules = await engine.listRules();
    res.json(rules);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

router.put('/rules/:code', canManage, async (req, res) => {
  try {
    const rule = await engine.updateRule(req.params.code, req.body || {}, req.user?.id ?? req.user?.userId);
    res.json(rule);
  } catch (e) {
    res.status(e.statusCode || 500).json({ message: e.message });
  }
});

router.get('/settings/notifications', canManage, async (req, res) => {
  try {
    const settings = await engine.getNotificationSettings();
    res.json(settings);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

router.put('/settings/notifications', canManage, async (req, res) => {
  try {
    const settings = await engine.updateNotificationSettings(
      req.body || {},
      req.user?.id ?? req.user?.userId
    );
    res.json(settings);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

router.get('/summary', canRead, async (req, res) => {
  try {
    const summary = await engine.getSignalSummary(req.user);
    res.json(summary);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

router.get('/signals', canRead, async (req, res) => {
  try {
    const signals = await engine.listSignals(req.user, {
      projectId: req.query.projectId,
      severity: req.query.severity,
      minLevel: req.query.minLevel,
      ruleCode: req.query.ruleCode,
      department: req.query.department,
      status: req.query.status,
      includeResolved: req.query.includeResolved === 'true',
      limit: req.query.limit,
    });
    res.json(signals);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

router.get('/signals/:id', canRead, async (req, res) => {
  try {
    const sig = await engine.getSignalById(Number(req.params.id), req.user);
    if (!sig) return res.status(404).json({ message: 'Signal not found.' });
    res.json(sig);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

router.post('/signals/:id/acknowledge', canManage, async (req, res) => {
  try {
    const sig = await engine.acknowledgeSignal(Number(req.params.id), req.user, req.body?.comment);
    res.json(sig);
  } catch (e) {
    res.status(e.statusCode || 500).json({ message: e.message });
  }
});

router.post('/signals/:id/resolve', canManage, async (req, res) => {
  try {
    const sig = await engine.resolveSignal(Number(req.params.id), req.user, req.body?.comment);
    res.json(sig);
  } catch (e) {
    res.status(e.statusCode || 500).json({ message: e.message });
  }
});

router.post('/evaluate', canManage, async (req, res) => {
  try {
    const result = await engine.runMonitorCycle();
    res.json(result);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

module.exports = router;
