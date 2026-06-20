const express = require('express');
const router = express.Router();
const {
  runQuery,
  formatTimestamp,
  insertRecord,
  updateRecord,
  deleteRecord,
} = require('../utils/kdspDbHelpers');

router.get('/:projectId/m-and-e', async (req, res) => {
  const { projectId } = req.params;
  try {
    const rows = await runQuery(
      'SELECT * FROM project_m_and_e WHERE "projectId" = ?',
      [projectId]
    );
    if (rows.length > 0) {
      res.status(200).json(rows[0]);
    } else {
      res.status(404).json({ message: 'M&E details not found for this project.' });
    }
  } catch (error) {
    console.error('Error fetching M&E details:', error);
    res.status(500).json({ message: 'Error fetching M&E details', error: error.message });
  }
});

router.post('/:projectId/m-and-e', async (req, res) => {
  const { projectId } = req.params;
  const clientData = req.body;

  try {
    const existing = await runQuery(
      'SELECT "mAndEId" FROM project_m_and_e WHERE "projectId" = ?',
      [projectId]
    );
    if (existing.length > 0) {
      return res.status(409).json({ message: 'M&E details already exist for this project. Use PUT to update.' });
    }

    const newMAndE = {
      projectId: Number(projectId),
      description: clientData.description || null,
      mechanismsInPlace: clientData.mechanismsInPlace || null,
      resourcesBudgetary: clientData.resourcesBudgetary || null,
      resourcesHuman: clientData.resourcesHuman || null,
      dataGatheringMethod: clientData.dataGatheringMethod || null,
      reportingChannels: clientData.reportingChannels || null,
      lessonsLearnedProcess: clientData.lessonsLearnedProcess || null,
    };

    const result = await insertRecord('project_m_and_e', newMAndE, 'mAndEId');
    newMAndE.mAndEId = result.insertId;
    res.status(201).json(newMAndE);
  } catch (error) {
    console.error('Error creating M&E details:', error);
    res.status(500).json({ message: 'Error creating M&E details', error: error.message });
  }
});

router.put('/m-and-e/:mAndEId', async (req, res) => {
  const { mAndEId } = req.params;
  const clientData = req.body;

  const updatedFields = {
    description: clientData.description || null,
    mechanismsInPlace: clientData.mechanismsInPlace || null,
    resourcesBudgetary: clientData.resourcesBudgetary || null,
    resourcesHuman: clientData.resourcesHuman || null,
    dataGatheringMethod: clientData.dataGatheringMethod || null,
    reportingChannels: clientData.reportingChannels || null,
    lessonsLearnedProcess: clientData.lessonsLearnedProcess || null,
    updatedAt: formatTimestamp(new Date()),
  };

  try {
    const result = await updateRecord('project_m_and_e', updatedFields, 'mAndEId', mAndEId);
    if (result.affectedRows > 0) {
      const rows = await runQuery(
        'SELECT * FROM project_m_and_e WHERE "mAndEId" = ?',
        [mAndEId]
      );
      res.status(200).json(rows[0]);
    } else {
      res.status(404).json({ message: 'M&E details not found.' });
    }
  } catch (error) {
    console.error('Error updating M&E details:', error);
    res.status(500).json({ message: 'Error updating M&E details', error: error.message });
  }
});

router.delete('/m-and-e/:mAndEId', async (req, res) => {
  const { mAndEId } = req.params;
  try {
    const result = await deleteRecord('project_m_and_e', 'mAndEId', mAndEId);
    if (result.affectedRows > 0) {
      res.status(204).send();
    } else {
      res.status(404).json({ message: 'M&E details not found.' });
    }
  } catch (error) {
    console.error('Error deleting M&E details:', error);
    res.status(500).json({ message: 'Error deleting M&E details', error: error.message });
  }
});

module.exports = router;
