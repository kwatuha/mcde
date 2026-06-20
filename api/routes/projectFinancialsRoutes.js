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

router.get('/:projectId/financials', async (req, res) => {
  const { projectId } = req.params;
  try {
    const rows = await runQuery(
      'SELECT * FROM project_financials WHERE "projectId" = ?',
      [projectId]
    );
    if (rows.length > 0) {
      res.status(200).json(rows[0]);
    } else {
      res.status(404).json({ message: 'Financial information not found for this project.' });
    }
  } catch (error) {
    console.error('Error fetching financial information:', error);
    res.status(500).json({ message: 'Error fetching financial information', error: error.message });
  }
});

router.post('/:projectId/financials', async (req, res) => {
  const { projectId } = req.params;
  const clientData = req.body;

  try {
    const existing = await runQuery(
      'SELECT "financialsId" FROM project_financials WHERE "projectId" = ?',
      [projectId]
    );
    if (existing.length > 0) {
      return res.status(409).json({ message: 'Financial information already exists for this project. Use PUT to update.' });
    }

    const newFinancials = {
      projectId: Number(projectId),
      capitalCostConsultancy: clientData.capitalCostConsultancy || null,
      capitalCostLandAcquisition: clientData.capitalCostLandAcquisition || null,
      capitalCostSitePrep: clientData.capitalCostSitePrep || null,
      capitalCostConstruction: clientData.capitalCostConstruction || null,
      capitalCostPlantEquipment: clientData.capitalCostPlantEquipment || null,
      capitalCostFixturesFittings: clientData.capitalCostFixturesFittings || null,
      capitalCostOther: clientData.capitalCostOther || null,
      recurrentCostLabor: clientData.recurrentCostLabor || null,
      recurrentCostOperating: clientData.recurrentCostOperating || null,
      recurrentCostMaintenance: clientData.recurrentCostMaintenance || null,
      recurrentCostOther: clientData.recurrentCostOther || null,
      proposedSourceFinancing: clientData.proposedSourceFinancing || null,
      costImplicationsRelatedProjects: clientData.costImplicationsRelatedProjects || null,
      landExpropriationRequired: formatBooleanForDb(clientData.landExpropriationRequired),
      landExpropriationExpenses: clientData.landExpropriationExpenses || null,
      compensationRequired: formatBooleanForDb(clientData.compensationRequired),
      otherAttendantCosts: clientData.otherAttendantCosts || null,
    };

    const result = await insertRecord('project_financials', newFinancials, 'financialsId');
    newFinancials.financialsId = result.insertId;
    res.status(201).json(newFinancials);
  } catch (error) {
    console.error('Error creating financial information:', error);
    res.status(500).json({ message: 'Error creating financial information', error: error.message });
  }
});

router.put('/financials/:financialsId', async (req, res) => {
  const { financialsId } = req.params;
  const clientData = req.body;

  const updatedFields = {
    capitalCostConsultancy: clientData.capitalCostConsultancy || null,
    capitalCostLandAcquisition: clientData.capitalCostLandAcquisition || null,
    capitalCostSitePrep: clientData.capitalCostSitePrep || null,
    capitalCostConstruction: clientData.capitalCostConstruction || null,
    capitalCostPlantEquipment: clientData.capitalCostPlantEquipment || null,
    capitalCostFixturesFittings: clientData.capitalCostFixturesFittings || null,
    capitalCostOther: clientData.capitalCostOther || null,
    recurrentCostLabor: clientData.recurrentCostLabor || null,
    recurrentCostOperating: clientData.recurrentCostOperating || null,
    recurrentCostMaintenance: clientData.recurrentCostMaintenance || null,
    recurrentCostOther: clientData.recurrentCostOther || null,
    proposedSourceFinancing: clientData.proposedSourceFinancing || null,
    costImplicationsRelatedProjects: clientData.costImplicationsRelatedProjects || null,
    landExpropriationRequired: formatBooleanForDb(clientData.landExpropriationRequired),
    landExpropriationExpenses: clientData.landExpropriationExpenses || null,
    compensationRequired: formatBooleanForDb(clientData.compensationRequired),
    otherAttendantCosts: clientData.otherAttendantCosts || null,
    updatedAt: formatTimestamp(new Date()),
  };

  try {
    const result = await updateRecord('project_financials', updatedFields, 'financialsId', financialsId);
    if (result.affectedRows > 0) {
      const rows = await runQuery(
        'SELECT * FROM project_financials WHERE "financialsId" = ?',
        [financialsId]
      );
      res.status(200).json(rows[0]);
    } else {
      res.status(404).json({ message: 'Financial information not found.' });
    }
  } catch (error) {
    console.error('Error updating financial information:', error);
    res.status(500).json({ message: 'Error updating financial information', error: error.message });
  }
});

router.delete('/financials/:financialsId', async (req, res) => {
  const { financialsId } = req.params;
  try {
    const result = await deleteRecord('project_financials', 'financialsId', financialsId);
    if (result.affectedRows > 0) {
      res.status(204).send();
    } else {
      res.status(404).json({ message: 'Financial information not found.' });
    }
  } catch (error) {
    console.error('Error deleting financial information:', error);
    res.status(500).json({ message: 'Error deleting financial information', error: error.message });
  }
});

module.exports = router;
