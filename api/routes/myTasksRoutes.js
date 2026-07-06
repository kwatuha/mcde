/**
 * My Tasks — pending items assigned to or awaiting the logged-in user.
 */
const express = require('express');
const router = express.Router();
const myTasksService = require('../services/myTasksService');

router.get('/', async (req, res) => {
  try {
    const result = await myTasksService.listMyTasks(req.user, {
      limit: req.query.limit,
      includeWorkflow: req.query.includeWorkflow !== 'false',
      includeEscalations: req.query.includeEscalations !== 'false',
    });
    res.json(result);
  } catch (e) {
    console.error('GET /my-tasks:', e);
    res.status(500).json({ message: e.message || 'Failed to load tasks' });
  }
});

module.exports = router;
