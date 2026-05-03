/**
 * Generic approval workflow HTTP API.
 */
const express = require('express');
const router = express.Router();
const privilege = require('../middleware/privilegeMiddleware');
const engine = require('../services/approvalWorkflowEngine');

const canConfigure = privilege(['approval_levels.read']);
const canMutateDefinitions = privilege(['approval_levels.create', 'approval_levels.update'], { anyOf: true });
const canProcessSla = privilege(['approval_levels.update']);

const canStartRequest = privilege(
  [
    'workplan.update',
    'strategic_plan.update',
    'subprogram.update',
    'approval_levels.update',
    'payment_request.update',
    'document.create',
    'project.update',
    'project.create',
  ],
  { anyOf: true }
);

router.use(async (req, res, next) => {
  try {
    await engine.ensureReady();
    next();
  } catch (e) {
    console.error('approvalWorkflow ensureReady:', e);
    res.status(500).json({ message: 'Approval workflow initialization failed', error: e.message });
  }
});

router.get('/definitions', canConfigure, async (req, res) => {
  try {
    const { entityType } = req.query;
    const rows = await engine.listDefinitions(entityType || null);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

router.get('/definitions/:definitionId', canConfigure, async (req, res) => {
  try {
    const row = await engine.getDefinitionById(req.params.definitionId);
    if (!row) return res.status(404).json({ message: 'Definition not found' });
    res.json(row);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

router.put('/definitions/:definitionId', privilege(['approval_levels.create', 'approval_levels.update'], { anyOf: true }), async (req, res) => {
  try {
    const out = await engine.updateDefinition(req.params.definitionId, req.body);
    res.json(out);
  } catch (e) {
    const code = e.statusCode || 500;
    res.status(code).json({ message: e.message });
  }
});

router.post('/definitions', privilege(['approval_levels.create', 'approval_levels.update'], { anyOf: true }), async (req, res) => {
  try {
    const { entity_type, code, version, name, active, steps, link_template } = req.body;
    if (!entity_type) return res.status(400).json({ message: 'entity_type is required' });
    const out = await engine.createDefinition({
      entity_type,
      code: code || 'default',
      version: version || 1,
      name,
      active: active !== false,
      steps: Array.isArray(steps) ? steps : [],
      link_template: link_template != null ? String(link_template) : null,
    });
    res.status(201).json(out);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

router.post('/seed/annual-workplan', privilege(['approval_levels.create']), async (req, res) => {
  try {
    const out = await engine.seedAnnualWorkplanExample();
    res.json(out);
  } catch (e) {
    const code = e.statusCode || 500;
    res.status(code).json({ message: e.message });
  }
});

/** Example generic workflow for project payment requests (`entity_type` = payment_request, `entity_id` = request id). */
router.post('/seed/payment-request', privilege(['approval_levels.create']), async (req, res) => {
  try {
    const out = await engine.seedPaymentRequestExample();
    res.json(out);
  } catch (e) {
    const code = e.statusCode || 500;
    res.status(code).json({ message: e.message });
  }
});

router.post('/requests/start', canStartRequest, async (req, res) => {
  try {
    const { entityType, entityId, definitionId, payloadSnapshot } = req.body;
    if (!entityType || entityId === undefined || entityId === null) {
      return res.status(400).json({ message: 'entityType and entityId are required' });
    }
    const detail = await engine.startRequest({
      entityType,
      entityId,
      definitionId: definitionId || null,
      submittedBy: req.user?.id ?? null,
      payloadSnapshot: payloadSnapshot || null,
    });
    res.status(201).json(detail);
  } catch (e) {
    const code = e.statusCode || 500;
    res.status(code).json({ message: e.message });
  }
});

router.get('/requests/pending-me', async (req, res) => {
  try {
    const rows = await engine.listPendingForUser(req.user);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

router.get('/requests/by-entity/:entityType/:entityId', async (req, res) => {
  try {
    const detail = await engine.getRequestByEntity(req.params.entityType, req.params.entityId);
    if (!detail) return res.status(404).json({ message: 'No approval request for this item' });
    res.json(detail);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

router.get('/requests/:requestId', async (req, res) => {
  try {
    const detail = await engine.getRequestDetail(req.params.requestId);
    if (!detail) return res.status(404).json({ message: 'Request not found' });
    res.json(detail);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

router.post('/requests/:requestId/approve', async (req, res) => {
  try {
    const detail = await engine.approveStep({
      requestId: req.params.requestId,
      user: req.user,
      comment: req.body?.comment,
    });
    res.json(detail);
  } catch (e) {
    const code = e.statusCode || 500;
    res.status(code).json({ message: e.message });
  }
});

router.post('/requests/:requestId/reject', async (req, res) => {
  try {
    const detail = await engine.rejectStep({
      requestId: req.params.requestId,
      user: req.user,
      comment: req.body?.comment,
    });
    res.json(detail);
  } catch (e) {
    const code = e.statusCode || 500;
    res.status(code).json({ message: e.message });
  }
});

router.post('/sla/process', canProcessSla, async (req, res) => {
  try {
    const out = await engine.processSlaEscalations();
    res.json(out);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

router.get('/definitions/active/:entityType', canConfigure, async (req, res) => {
  try {
    const def = await engine.getActiveDefinitionForEntityType(req.params.entityType, req.query.code || 'default');
    if (!def) return res.status(404).json({ message: 'No active definition' });
    res.json(def);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

module.exports = router;
