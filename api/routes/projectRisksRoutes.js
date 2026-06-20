const express = require('express');
const router = express.Router();
const {
  runQuery,
  formatTimestamp,
  insertRecord,
  updateRecord,
  deleteRecord,
} = require('../utils/kdspDbHelpers');

router.get('/:projectId/risks', async (req, res) => {
  const { projectId } = req.params;
  try {
    const rows = await runQuery(
      'SELECT * FROM project_risks WHERE "projectId" = ? ORDER BY "riskId"',
      [projectId]
    );
    res.status(200).json(rows);
  } catch (error) {
    console.error('Error fetching risks:', error);
    res.status(500).json({ message: 'Error fetching risks', error: error.message });
  }
});

router.post('/:projectId/risks', async (req, res) => {
  const { projectId } = req.params;
  const clientData = req.body;

  const newRisk = {
    projectId: Number(projectId),
    riskDescription: clientData.riskDescription || null,
    likelihood: clientData.likelihood || null,
    impact: clientData.impact || null,
    mitigationStrategy: clientData.mitigationStrategy || null,
  };

  try {
    const result = await insertRecord('project_risks', newRisk, 'riskId');
    newRisk.riskId = result.insertId;
    res.status(201).json(newRisk);
  } catch (error) {
    console.error('Error creating risk:', error);
    res.status(500).json({ message: 'Error creating risk', error: error.message });
  }
});

router.put('/risks/:riskId', async (req, res) => {
  const { riskId } = req.params;
  const clientData = req.body;

  const updatedFields = {
    riskDescription: clientData.riskDescription || null,
    likelihood: clientData.likelihood || null,
    impact: clientData.impact || null,
    mitigationStrategy: clientData.mitigationStrategy || null,
    updatedAt: formatTimestamp(new Date()),
  };

  try {
    const result = await updateRecord('project_risks', updatedFields, 'riskId', riskId);
    if (result.affectedRows > 0) {
      const rows = await runQuery('SELECT * FROM project_risks WHERE "riskId" = ?', [riskId]);
      res.status(200).json(rows[0]);
    } else {
      res.status(404).json({ message: 'Risk not found.' });
    }
  } catch (error) {
    console.error('Error updating risk:', error);
    res.status(500).json({ message: 'Error updating risk', error: error.message });
  }
});

router.delete('/risks/:riskId', async (req, res) => {
  const { riskId } = req.params;
  try {
    const result = await deleteRecord('project_risks', 'riskId', riskId);
    if (result.affectedRows > 0) {
      res.status(204).send();
    } else {
      res.status(404).json({ message: 'Risk not found.' });
    }
  } catch (error) {
    console.error('Error deleting risk:', error);
    res.status(500).json({ message: 'Error deleting risk', error: error.message });
  }
});

module.exports = router;
