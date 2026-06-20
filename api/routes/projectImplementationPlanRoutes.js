const express = require('express');
const router = express.Router();
const {
  runQuery,
  formatTimestamp,
  insertRecord,
  updateRecord,
  deleteRecord,
} = require('../utils/kdspDbHelpers');

router.get('/:projectId/implementation-plan', async (req, res) => {
  const { projectId } = req.params;
  try {
    const rows = await runQuery(
      'SELECT * FROM project_implementation_plan WHERE "projectId" = ?',
      [projectId]
    );
    if (rows.length > 0) {
      res.status(200).json(rows[0]);
    } else {
      res.status(404).json({ message: 'Implementation plan not found for this project.' });
    }
  } catch (error) {
    console.error('Error fetching implementation plan:', error);
    res.status(500).json({ message: 'Error fetching implementation plan', error: error.message });
  }
});

router.post('/:projectId/implementation-plan', async (req, res) => {
  const { projectId } = req.params;
  const clientData = req.body;

  try {
    const existing = await runQuery(
      'SELECT "planId" FROM project_implementation_plan WHERE "projectId" = ?',
      [projectId]
    );
    if (existing.length > 0) {
      return res.status(409).json({ message: 'Implementation plan already exists for this project. Use PUT to update.' });
    }

    const newImplementationPlan = {
      projectId: Number(projectId),
      description: clientData.description || null,
      keyPerformanceIndicators: clientData.keyPerformanceIndicators || null,
      responsiblePersons: clientData.responsiblePersons || null,
    };

    const result = await insertRecord('project_implementation_plan', newImplementationPlan, 'planId');
    newImplementationPlan.planId = result.insertId;
    res.status(201).json(newImplementationPlan);
  } catch (error) {
    console.error('Error creating implementation plan:', error);
    res.status(500).json({ message: 'Error creating implementation plan', error: error.message });
  }
});

router.put('/implementation-plan/:planId', async (req, res) => {
  const { planId } = req.params;
  const clientData = req.body;

  const updatedFields = {
    description: clientData.description || null,
    keyPerformanceIndicators: clientData.keyPerformanceIndicators || null,
    responsiblePersons: clientData.responsiblePersons || null,
    updatedAt: formatTimestamp(new Date()),
  };

  try {
    const result = await updateRecord('project_implementation_plan', updatedFields, 'planId', planId);
    if (result.affectedRows > 0) {
      const rows = await runQuery(
        'SELECT * FROM project_implementation_plan WHERE "planId" = ?',
        [planId]
      );
      res.status(200).json(rows[0]);
    } else {
      res.status(404).json({ message: 'Implementation plan not found.' });
    }
  } catch (error) {
    console.error('Error updating implementation plan:', error);
    res.status(500).json({ message: 'Error updating implementation plan', error: error.message });
  }
});

router.delete('/implementation-plan/:planId', async (req, res) => {
  const { planId } = req.params;
  try {
    const result = await deleteRecord('project_implementation_plan', 'planId', planId);
    if (result.affectedRows > 0) {
      res.status(204).send();
    } else {
      res.status(404).json({ message: 'Implementation plan not found.' });
    }
  } catch (error) {
    console.error('Error deleting implementation plan:', error);
    res.status(500).json({ message: 'Error deleting implementation plan', error: error.message });
  }
});

module.exports = router;
