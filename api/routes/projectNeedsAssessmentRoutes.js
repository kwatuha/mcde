const express = require('express');
const router = express.Router();
const {
  runQuery,
  formatTimestamp,
  insertRecord,
  updateRecord,
  deleteRecord,
} = require('../utils/kdspDbHelpers');

router.get('/:projectId/needs-assessment', async (req, res) => {
  const { projectId } = req.params;
  try {
    const rows = await runQuery(
      'SELECT * FROM project_needs_assessment WHERE "projectId" = ?',
      [projectId]
    );
    if (rows.length > 0) {
      res.status(200).json(rows[0]);
    } else {
      res.status(404).json({ message: 'Needs assessment not found for this project.' });
    }
  } catch (error) {
    console.error('Error fetching needs assessment:', error);
    res.status(500).json({ message: 'Error fetching needs assessment', error: error.message });
  }
});

router.post('/:projectId/needs-assessment', async (req, res) => {
  const { projectId } = req.params;
  const clientData = req.body;

  try {
    const existing = await runQuery(
      'SELECT "needsAssessmentId" FROM project_needs_assessment WHERE "projectId" = ?',
      [projectId]
    );
    if (existing.length > 0) {
      return res.status(409).json({ message: 'Needs assessment already exists for this project. Use PUT to update.' });
    }

    const newNeedsAssessment = {
      projectId: Number(projectId),
      targetBeneficiaries: clientData.targetBeneficiaries || null,
      estimateEndUsers: clientData.estimateEndUsers || null,
      physicalDemandCompletion: clientData.physicalDemandCompletion || null,
      proposedPhysicalCapacity: clientData.proposedPhysicalCapacity || null,
      mainBenefitsAsset: clientData.mainBenefitsAsset || null,
      significantExternalBenefitsNegativeEffects: clientData.significantExternalBenefitsNegativeEffects || null,
      significantDifferencesBenefitsAlternatives: clientData.significantDifferencesBenefitsAlternatives || null,
    };

    const result = await insertRecord('project_needs_assessment', newNeedsAssessment, 'needsAssessmentId');
    newNeedsAssessment.needsAssessmentId = result.insertId;
    res.status(201).json(newNeedsAssessment);
  } catch (error) {
    console.error('Error creating needs assessment:', error);
    res.status(500).json({ message: 'Error creating needs assessment', error: error.message });
  }
});

router.put('/needs-assessment/:needsAssessmentId', async (req, res) => {
  const { needsAssessmentId } = req.params;
  const clientData = req.body;

  const updatedFields = {
    targetBeneficiaries: clientData.targetBeneficiaries || null,
    estimateEndUsers: clientData.estimateEndUsers || null,
    physicalDemandCompletion: clientData.physicalDemandCompletion || null,
    proposedPhysicalCapacity: clientData.proposedPhysicalCapacity || null,
    mainBenefitsAsset: clientData.mainBenefitsAsset || null,
    significantExternalBenefitsNegativeEffects: clientData.significantExternalBenefitsNegativeEffects || null,
    significantDifferencesBenefitsAlternatives: clientData.significantDifferencesBenefitsAlternatives || null,
    updatedAt: formatTimestamp(new Date()),
  };

  try {
    const result = await updateRecord('project_needs_assessment', updatedFields, 'needsAssessmentId', needsAssessmentId);
    if (result.affectedRows > 0) {
      const rows = await runQuery(
        'SELECT * FROM project_needs_assessment WHERE "needsAssessmentId" = ?',
        [needsAssessmentId]
      );
      res.status(200).json(rows[0]);
    } else {
      res.status(404).json({ message: 'Needs assessment not found.' });
    }
  } catch (error) {
    console.error('Error updating needs assessment:', error);
    res.status(500).json({ message: 'Error updating needs assessment', error: error.message });
  }
});

router.delete('/needs-assessment/:needsAssessmentId', async (req, res) => {
  const { needsAssessmentId } = req.params;
  try {
    const result = await deleteRecord('project_needs_assessment', 'needsAssessmentId', needsAssessmentId);
    if (result.affectedRows > 0) {
      res.status(204).send();
    } else {
      res.status(404).json({ message: 'Needs assessment not found.' });
    }
  } catch (error) {
    console.error('Error deleting needs assessment:', error);
    res.status(500).json({ message: 'Error deleting needs assessment', error: error.message });
  }
});

module.exports = router;
