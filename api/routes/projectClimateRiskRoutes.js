const express = require('express');
const router = express.Router();
const {
  runQuery,
  formatTimestamp,
  insertRecord,
  updateRecord,
  deleteRecord,
} = require('../utils/kdspDbHelpers');

router.get('/:projectId/climate-risk', async (req, res) => {
  const { projectId } = req.params;
  try {
    const rows = await runQuery(
      'SELECT * FROM project_climate_risk WHERE "projectId" = ? ORDER BY "climateRiskId"',
      [projectId]
    );
    res.status(200).json(rows);
  } catch (error) {
    console.error('Error fetching climate risks:', error);
    res.status(500).json({ message: 'Error fetching climate risks', error: error.message });
  }
});

router.post('/:projectId/climate-risk', async (req, res) => {
  const { projectId } = req.params;
  const clientData = req.body;

  try {
    const existing = await runQuery(
      'SELECT "climateRiskId" FROM project_climate_risk WHERE "projectId" = ? AND "hazardName" = ?',
      [projectId, clientData.hazardName]
    );
    if (existing.length > 0) {
      return res.status(409).json({
        message: `Climate risk for '${clientData.hazardName}' already exists for this project. Use PUT to update.`,
      });
    }

    const newClimateRisk = {
      projectId: Number(projectId),
      hazardName: clientData.hazardName || null,
      hazardExposure: clientData.hazardExposure || null,
      vulnerability: clientData.vulnerability || null,
      riskLevel: clientData.riskLevel || null,
      riskReductionStrategies: clientData.riskReductionStrategies || null,
      riskReductionCosts: clientData.riskReductionCosts || null,
      resourcesRequired: clientData.resourcesRequired || null,
    };

    const result = await insertRecord('project_climate_risk', newClimateRisk, 'climateRiskId');
    newClimateRisk.climateRiskId = result.insertId;
    res.status(201).json(newClimateRisk);
  } catch (error) {
    console.error('Error creating climate risk:', error);
    res.status(500).json({ message: 'Error creating climate risk', error: error.message });
  }
});

router.put('/climate-risk/:climateRiskId', async (req, res) => {
  const { climateRiskId } = req.params;
  const clientData = req.body;

  const updatedFields = {
    hazardName: clientData.hazardName || null,
    hazardExposure: clientData.hazardExposure || null,
    vulnerability: clientData.vulnerability || null,
    riskLevel: clientData.riskLevel || null,
    riskReductionStrategies: clientData.riskReductionStrategies || null,
    riskReductionCosts: clientData.riskReductionCosts || null,
    resourcesRequired: clientData.resourcesRequired || null,
    updatedAt: formatTimestamp(new Date()),
  };

  try {
    const result = await updateRecord('project_climate_risk', updatedFields, 'climateRiskId', climateRiskId);
    if (result.affectedRows > 0) {
      const rows = await runQuery(
        'SELECT * FROM project_climate_risk WHERE "climateRiskId" = ?',
        [climateRiskId]
      );
      res.status(200).json(rows[0]);
    } else {
      res.status(404).json({ message: 'Climate risk not found.' });
    }
  } catch (error) {
    console.error('Error updating climate risk:', error);
    res.status(500).json({ message: 'Error updating climate risk', error: error.message });
  }
});

router.delete('/climate-risk/:climateRiskId', async (req, res) => {
  const { climateRiskId } = req.params;
  try {
    const result = await deleteRecord('project_climate_risk', 'climateRiskId', climateRiskId);
    if (result.affectedRows > 0) {
      res.status(204).send();
    } else {
      res.status(404).json({ message: 'Climate risk not found.' });
    }
  } catch (error) {
    console.error('Error deleting climate risk:', error);
    res.status(500).json({ message: 'Error deleting climate risk', error: error.message });
  }
});

module.exports = router;
