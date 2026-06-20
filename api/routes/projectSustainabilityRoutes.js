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

router.get('/:projectId/sustainability', async (req, res) => {
  const { projectId } = req.params;
  try {
    const rows = await runQuery(
      'SELECT * FROM project_sustainability WHERE "projectId" = ?',
      [projectId]
    );
    if (rows.length > 0) {
      res.status(200).json(rows[0]);
    } else {
      res.status(404).json({ message: 'Sustainability details not found for this project.' });
    }
  } catch (error) {
    console.error('Error fetching sustainability details:', error);
    res.status(500).json({ message: 'Error fetching sustainability details', error: error.message });
  }
});

router.post('/:projectId/sustainability', async (req, res) => {
  const { projectId } = req.params;
  const clientData = req.body;

  try {
    const existing = await runQuery(
      'SELECT "sustainabilityId" FROM project_sustainability WHERE "projectId" = ?',
      [projectId]
    );
    if (existing.length > 0) {
      return res.status(409).json({ message: 'Sustainability details already exist for this project. Use PUT to update.' });
    }

    const newSustainability = {
      projectId: Number(projectId),
      description: clientData.description || null,
      owningOrganization: clientData.owningOrganization || null,
      hasAssetRegister: formatBooleanForDb(clientData.hasAssetRegister),
      technicalCapacityAdequacy: clientData.technicalCapacityAdequacy || null,
      managerialCapacityAdequacy: clientData.managerialCapacityAdequacy || null,
      financialCapacityAdequacy: clientData.financialCapacityAdequacy || null,
      avgAnnualPersonnelCost: clientData.avgAnnualPersonnelCost || null,
      annualOperationMaintenanceCost: clientData.annualOperationMaintenanceCost || null,
      otherOperatingCosts: clientData.otherOperatingCosts || null,
      revenueSources: clientData.revenueSources || null,
      operationalCostsCoveredByRevenue: formatBooleanForDb(clientData.operationalCostsCoveredByRevenue),
    };

    const result = await insertRecord('project_sustainability', newSustainability, 'sustainabilityId');
    newSustainability.sustainabilityId = result.insertId;
    res.status(201).json(newSustainability);
  } catch (error) {
    console.error('Error creating sustainability details:', error);
    res.status(500).json({ message: 'Error creating sustainability details', error: error.message });
  }
});

router.put('/sustainability/:sustainabilityId', async (req, res) => {
  const { sustainabilityId } = req.params;
  const clientData = req.body;

  const updatedFields = {
    description: clientData.description || null,
    owningOrganization: clientData.owningOrganization || null,
    hasAssetRegister: formatBooleanForDb(clientData.hasAssetRegister),
    technicalCapacityAdequacy: clientData.technicalCapacityAdequacy || null,
    managerialCapacityAdequacy: clientData.managerialCapacityAdequacy || null,
    financialCapacityAdequacy: clientData.financialCapacityAdequacy || null,
    avgAnnualPersonnelCost: clientData.avgAnnualPersonnelCost || null,
    annualOperationMaintenanceCost: clientData.annualOperationMaintenanceCost || null,
    otherOperatingCosts: clientData.otherOperatingCosts || null,
    revenueSources: clientData.revenueSources || null,
    operationalCostsCoveredByRevenue: formatBooleanForDb(clientData.operationalCostsCoveredByRevenue),
    updatedAt: formatTimestamp(new Date()),
  };

  try {
    const result = await updateRecord('project_sustainability', updatedFields, 'sustainabilityId', sustainabilityId);
    if (result.affectedRows > 0) {
      const rows = await runQuery(
        'SELECT * FROM project_sustainability WHERE "sustainabilityId" = ?',
        [sustainabilityId]
      );
      res.status(200).json(rows[0]);
    } else {
      res.status(404).json({ message: 'Sustainability details not found.' });
    }
  } catch (error) {
    console.error('Error updating sustainability details:', error);
    res.status(500).json({ message: 'Error updating sustainability details', error: error.message });
  }
});

router.delete('/sustainability/:sustainabilityId', async (req, res) => {
  const { sustainabilityId } = req.params;
  try {
    const result = await deleteRecord('project_sustainability', 'sustainabilityId', sustainabilityId);
    if (result.affectedRows > 0) {
      res.status(204).send();
    } else {
      res.status(404).json({ message: 'Sustainability details not found.' });
    }
  } catch (error) {
    console.error('Error deleting sustainability details:', error);
    res.status(500).json({ message: 'Error deleting sustainability details', error: error.message });
  }
});

module.exports = router;
