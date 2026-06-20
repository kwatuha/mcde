const express = require('express');
const router = express.Router();
const {
  runQuery,
  formatTimestamp,
  formatBooleanForDb,
  insertRecord,
  updateRecord,
  deleteRecord,
} = require('../utils/kdspDbHelpers');

router.get('/:projectId/hazard-assessment', async (req, res) => {
  const { projectId } = req.params;
  try {
    const rows = await runQuery(
      'SELECT * FROM project_hazard_assessment WHERE "projectId" = ? ORDER BY "hazardId"',
      [projectId]
    );
    res.status(200).json(rows);
  } catch (error) {
    console.error('Error fetching hazard assessments:', error);
    res.status(500).json({ message: 'Error fetching hazard assessments', error: error.message });
  }
});

router.post('/:projectId/hazard-assessment', async (req, res) => {
  const { projectId } = req.params;
  const clientData = req.body;

  try {
    const existing = await runQuery(
      'SELECT "hazardId" FROM project_hazard_assessment WHERE "projectId" = ? AND "hazardName" = ?',
      [projectId, clientData.hazardName]
    );
    if (existing.length > 0) {
      return res.status(409).json({
        message: `Hazard assessment for '${clientData.hazardName}' already exists for this project. Use PUT to update.`,
      });
    }

    const newHazardAssessment = {
      projectId: Number(projectId),
      hazardName: clientData.hazardName || null,
      question: clientData.question || null,
      answerYesNo: formatBooleanForDb(clientData.answerYesNo),
      remarks: clientData.remarks || null,
    };

    const result = await insertRecord('project_hazard_assessment', newHazardAssessment, 'hazardId');
    newHazardAssessment.hazardId = result.insertId;
    res.status(201).json(newHazardAssessment);
  } catch (error) {
    console.error('Error creating hazard assessment:', error);
    res.status(500).json({ message: 'Error creating hazard assessment', error: error.message });
  }
});

router.put('/hazard-assessment/:hazardId', async (req, res) => {
  const { hazardId } = req.params;
  const clientData = req.body;

  const updatedFields = {
    hazardName: clientData.hazardName || null,
    question: clientData.question || null,
    answerYesNo: formatBooleanForDb(clientData.answerYesNo),
    remarks: clientData.remarks || null,
    updatedAt: formatTimestamp(new Date()),
  };

  try {
    const result = await updateRecord('project_hazard_assessment', updatedFields, 'hazardId', hazardId);
    if (result.affectedRows > 0) {
      const rows = await runQuery(
        'SELECT * FROM project_hazard_assessment WHERE "hazardId" = ?',
        [hazardId]
      );
      res.status(200).json(rows[0]);
    } else {
      res.status(404).json({ message: 'Hazard assessment not found.' });
    }
  } catch (error) {
    console.error('Error updating hazard assessment:', error);
    res.status(500).json({ message: 'Error updating hazard assessment', error: error.message });
  }
});

router.delete('/hazard-assessment/:hazardId', async (req, res) => {
  const { hazardId } = req.params;
  try {
    const result = await deleteRecord('project_hazard_assessment', 'hazardId', hazardId);
    if (result.affectedRows > 0) {
      res.status(204).send();
    } else {
      res.status(404).json({ message: 'Hazard assessment not found.' });
    }
  } catch (error) {
    console.error('Error deleting hazard assessment:', error);
    res.status(500).json({ message: 'Error deleting hazard assessment', error: error.message });
  }
});

module.exports = router;
