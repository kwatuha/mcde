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

router.get('/:projectId/readiness', async (req, res) => {
  const { projectId } = req.params;
  try {
    const rows = await runQuery(
      'SELECT * FROM project_readiness WHERE "projectId" = ?',
      [projectId]
    );
    if (rows.length > 0) {
      res.status(200).json(rows[0]);
    } else {
      res.status(404).json({ message: 'Project readiness details not found for this project.' });
    }
  } catch (error) {
    console.error('Error fetching project readiness details:', error);
    res.status(500).json({ message: 'Error fetching project readiness details', error: error.message });
  }
});

router.post('/:projectId/readiness', async (req, res) => {
  const { projectId } = req.params;
  const clientData = req.body;

  try {
    const existing = await runQuery(
      'SELECT "readinessId" FROM project_readiness WHERE "projectId" = ?',
      [projectId]
    );
    if (existing.length > 0) {
      return res.status(409).json({ message: 'Project readiness details already exist for this project. Use PUT to update.' });
    }

    const newReadiness = {
      projectId: Number(projectId),
      designsPreparedApproved: formatBooleanForDb(clientData.designsPreparedApproved),
      landAcquiredSiteReady: formatBooleanForDb(clientData.landAcquiredSiteReady),
      regulatoryApprovalsObtained: formatBooleanForDb(clientData.regulatoryApprovalsObtained),
      governmentAgenciesInvolved: clientData.governmentAgenciesInvolved || null,
      consultationsUndertaken: formatBooleanForDb(clientData.consultationsUndertaken),
      canBePhasedScaledDown: formatBooleanForDb(clientData.canBePhasedScaledDown),
    };

    const result = await insertRecord('project_readiness', newReadiness, 'readinessId');
    newReadiness.readinessId = result.insertId;
    res.status(201).json(newReadiness);
  } catch (error) {
    console.error('Error creating project readiness details:', error);
    res.status(500).json({ message: 'Error creating project readiness details', error: error.message });
  }
});

router.put('/readiness/:readinessId', async (req, res) => {
  const { readinessId } = req.params;
  const clientData = req.body;

  const updatedFields = {
    designsPreparedApproved: formatBooleanForDb(clientData.designsPreparedApproved),
    landAcquiredSiteReady: formatBooleanForDb(clientData.landAcquiredSiteReady),
    regulatoryApprovalsObtained: formatBooleanForDb(clientData.regulatoryApprovalsObtained),
    governmentAgenciesInvolved: clientData.governmentAgenciesInvolved || null,
    consultationsUndertaken: formatBooleanForDb(clientData.consultationsUndertaken),
    canBePhasedScaledDown: formatBooleanForDb(clientData.canBePhasedScaledDown),
    updatedAt: formatTimestamp(new Date()),
  };

  try {
    const result = await updateRecord('project_readiness', updatedFields, 'readinessId', readinessId);
    if (result.affectedRows > 0) {
      const rows = await runQuery(
        'SELECT * FROM project_readiness WHERE "readinessId" = ?',
        [readinessId]
      );
      res.status(200).json(rows[0]);
    } else {
      res.status(404).json({ message: 'Project readiness details not found.' });
    }
  } catch (error) {
    console.error('Error updating project readiness details:', error);
    res.status(500).json({ message: 'Error updating project readiness details', error: error.message });
  }
});

router.delete('/readiness/:readinessId', async (req, res) => {
  const { readinessId } = req.params;
  try {
    const result = await deleteRecord('project_readiness', 'readinessId', readinessId);
    if (result.affectedRows > 0) {
      res.status(204).send();
    } else {
      res.status(404).json({ message: 'Project readiness details not found.' });
    }
  } catch (error) {
    console.error('Error deleting project readiness details:', error);
    res.status(500).json({ message: 'Error deleting project readiness details', error: error.message });
  }
});

module.exports = router;
