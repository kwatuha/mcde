const express = require('express');
const router = express.Router();
const {
  runQuery,
  formatTimestamp,
  insertRecord,
  updateRecord,
  deleteRecord,
} = require('../utils/kdspDbHelpers');

router.get('/:projectId/stakeholders', async (req, res) => {
  const { projectId } = req.params;
  try {
    const rows = await runQuery(
      'SELECT * FROM project_stakeholders WHERE "projectId" = ? ORDER BY "stakeholderId"',
      [projectId]
    );
    res.status(200).json(rows);
  } catch (error) {
    console.error('Error fetching stakeholders:', error);
    res.status(500).json({ message: 'Error fetching stakeholders', error: error.message });
  }
});

router.post('/:projectId/stakeholders', async (req, res) => {
  const { projectId } = req.params;
  const clientData = req.body;

  const newStakeholder = {
    projectId: Number(projectId),
    stakeholderName: clientData.stakeholderName || null,
    levelInfluence: clientData.levelInfluence || null,
    engagementStrategy: clientData.engagementStrategy || null,
  };

  try {
    const result = await insertRecord('project_stakeholders', newStakeholder, 'stakeholderId');
    newStakeholder.stakeholderId = result.insertId;
    res.status(201).json(newStakeholder);
  } catch (error) {
    console.error('Error creating stakeholder:', error);
    res.status(500).json({ message: 'Error creating stakeholder', error: error.message });
  }
});

router.put('/stakeholders/:stakeholderId', async (req, res) => {
  const { stakeholderId } = req.params;
  const clientData = req.body;

  const updatedFields = {
    stakeholderName: clientData.stakeholderName || null,
    levelInfluence: clientData.levelInfluence || null,
    engagementStrategy: clientData.engagementStrategy || null,
    updatedAt: formatTimestamp(new Date()),
  };

  try {
    const result = await updateRecord('project_stakeholders', updatedFields, 'stakeholderId', stakeholderId);
    if (result.affectedRows > 0) {
      const rows = await runQuery(
        'SELECT * FROM project_stakeholders WHERE "stakeholderId" = ?',
        [stakeholderId]
      );
      res.status(200).json(rows[0]);
    } else {
      res.status(404).json({ message: 'Stakeholder not found.' });
    }
  } catch (error) {
    console.error('Error updating stakeholder:', error);
    res.status(500).json({ message: 'Error updating stakeholder', error: error.message });
  }
});

router.delete('/stakeholders/:stakeholderId', async (req, res) => {
  const { stakeholderId } = req.params;
  try {
    const result = await deleteRecord('project_stakeholders', 'stakeholderId', stakeholderId);
    if (result.affectedRows > 0) {
      res.status(204).send();
    } else {
      res.status(404).json({ message: 'Stakeholder not found.' });
    }
  } catch (error) {
    console.error('Error deleting stakeholder:', error);
    res.status(500).json({ message: 'Error deleting stakeholder', error: error.message });
  }
});

module.exports = router;
