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

function parseJsonFields(record) {
  if (!record) return record;
  ['worldBankStandards', 'goKPoliciesLaws', 'environmentalHealthSafetyImpacts', 'socialImpacts', 'publicParticipationConsultation']
    .forEach((field) => {
      if (record[field] && typeof record[field] === 'string') {
        try {
          record[field] = JSON.parse(record[field]);
        } catch {
          // leave as string
        }
      }
    });
  return record;
}

function stringifyJson(value) {
  if (value === null || value === undefined || value === '') return null;
  return typeof value === 'string' ? value : JSON.stringify(value);
}

router.get('/:projectId/esohsg-screening', async (req, res) => {
  const { projectId } = req.params;
  try {
    const rows = await runQuery(
      'SELECT * FROM project_esohsg_screening WHERE "projectId" = ?',
      [projectId]
    );
    if (rows.length > 0) {
      res.status(200).json(parseJsonFields(rows[0]));
    } else {
      res.status(404).json({ message: 'ESOHSG screening details not found for this project.' });
    }
  } catch (error) {
    console.error('Error fetching ESOHSG screening details:', error);
    res.status(500).json({ message: 'Error fetching ESOHSG screening details', error: error.message });
  }
});

router.post('/:projectId/esohsg-screening', async (req, res) => {
  const { projectId } = req.params;
  const clientData = req.body;

  try {
    const existing = await runQuery(
      'SELECT "screeningId" FROM project_esohsg_screening WHERE "projectId" = ?',
      [projectId]
    );
    if (existing.length > 0) {
      return res.status(409).json({ message: 'ESOHSG screening details already exist for this project. Use PUT to update.' });
    }

    const newScreening = {
      projectId: Number(projectId),
      emcaTriggers: formatBooleanForDb(clientData.emcaTriggers),
      emcaDescription: clientData.emcaDescription || null,
      worldBankSafeguardApplicable: formatBooleanForDb(clientData.worldBankSafeguardApplicable),
      worldBankStandards: stringifyJson(clientData.worldBankStandards),
      goKPoliciesApplicable: formatBooleanForDb(clientData.goKPoliciesApplicable),
      goKPoliciesLaws: stringifyJson(clientData.goKPoliciesLaws),
      environmentalHealthSafetyImpacts: stringifyJson(clientData.environmentalHealthSafetyImpacts),
      socialImpacts: stringifyJson(clientData.socialImpacts),
      publicParticipationConsultation: stringifyJson(clientData.publicParticipationConsultation),
      screeningResultOutcome: clientData.screeningResultOutcome || null,
      specialConditions: clientData.specialConditions || null,
      screeningUndertakenBy: clientData.screeningUndertakenBy || null,
      screeningDesignation: clientData.screeningDesignation || null,
    };

    const result = await insertRecord('project_esohsg_screening', newScreening, 'screeningId');
    newScreening.screeningId = result.insertId;
    res.status(201).json(parseJsonFields(newScreening));
  } catch (error) {
    console.error('Error creating ESOHSG screening details:', error);
    res.status(500).json({ message: 'Error creating ESOHSG screening details', error: error.message });
  }
});

router.put('/esohsg-screening/:screeningId', async (req, res) => {
  const { screeningId } = req.params;
  const clientData = req.body;

  const updatedFields = {
    emcaTriggers: formatBooleanForDb(clientData.emcaTriggers),
    emcaDescription: clientData.emcaDescription || null,
    worldBankSafeguardApplicable: formatBooleanForDb(clientData.worldBankSafeguardApplicable),
    worldBankStandards: stringifyJson(clientData.worldBankStandards),
    goKPoliciesApplicable: formatBooleanForDb(clientData.goKPoliciesApplicable),
    goKPoliciesLaws: stringifyJson(clientData.goKPoliciesLaws),
    environmentalHealthSafetyImpacts: stringifyJson(clientData.environmentalHealthSafetyImpacts),
    socialImpacts: stringifyJson(clientData.socialImpacts),
    publicParticipationConsultation: stringifyJson(clientData.publicParticipationConsultation),
    screeningResultOutcome: clientData.screeningResultOutcome || null,
    specialConditions: clientData.specialConditions || null,
    screeningUndertakenBy: clientData.screeningUndertakenBy || null,
    screeningDesignation: clientData.screeningDesignation || null,
    updatedAt: formatTimestamp(new Date()),
  };

  try {
    const result = await updateRecord('project_esohsg_screening', updatedFields, 'screeningId', screeningId);
    if (result.affectedRows > 0) {
      const rows = await runQuery(
        'SELECT * FROM project_esohsg_screening WHERE "screeningId" = ?',
        [screeningId]
      );
      res.status(200).json(parseJsonFields(rows[0]));
    } else {
      res.status(404).json({ message: 'ESOHSG screening details not found.' });
    }
  } catch (error) {
    console.error('Error updating ESOHSG screening details:', error);
    res.status(500).json({ message: 'Error updating ESOHSG screening details', error: error.message });
  }
});

router.delete('/esohsg-screening/:screeningId', async (req, res) => {
  const { screeningId } = req.params;
  try {
    const result = await deleteRecord('project_esohsg_screening', 'screeningId', screeningId);
    if (result.affectedRows > 0) {
      res.status(204).send();
    } else {
      res.status(404).json({ message: 'ESOHSG screening details not found.' });
    }
  } catch (error) {
    console.error('Error deleting ESOHSG screening details:', error);
    res.status(500).json({ message: 'Error deleting ESOHSG screening details', error: error.message });
  }
});

module.exports = router;
