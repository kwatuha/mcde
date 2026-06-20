const express = require('express');
const router = express.Router();
const {
  runQuery,
  formatTimestamp,
  insertRecord,
  updateRecord,
  deleteRecord,
} = require('../utils/kdspDbHelpers');

/**
 * @route GET /api/projects/:projectId/concept-notes
 */
router.get('/:projectId/concept-notes', async (req, res) => {
  const { projectId } = req.params;
  try {
    const rows = await runQuery(
      'SELECT * FROM project_concept_notes WHERE "projectId" = ?',
      [projectId]
    );
    if (rows.length > 0) {
      res.status(200).json(rows[0]);
    } else {
      res.status(404).json({ message: 'Concept note not found for this project.' });
    }
  } catch (error) {
    console.error('Error fetching concept note:', error);
    res.status(500).json({ message: 'Error fetching concept note', error: error.message });
  }
});

/**
 * @route POST /api/projects/:projectId/concept-notes
 */
router.post('/:projectId/concept-notes', async (req, res) => {
  const { projectId } = req.params;
  const clientData = req.body;

  try {
    const existing = await runQuery(
      'SELECT "conceptNoteId" FROM project_concept_notes WHERE "projectId" = ?',
      [projectId]
    );
    if (existing.length > 0) {
      return res.status(409).json({ message: 'Concept note already exists for this project. Use PUT to update.' });
    }

    const newConceptNote = {
      projectId: Number(projectId),
      situationAnalysis: clientData.situationAnalysis || null,
      problemStatement: clientData.problemStatement || null,
      relevanceProjectIdea: clientData.relevanceProjectIdea || null,
      scopeOfProject: clientData.scopeOfProject || null,
      projectGoal: clientData.projectGoal || null,
      goalIndicator: clientData.goalIndicator || null,
      goalMeansVerification: clientData.goalMeansVerification || null,
      goalAssumptions: clientData.goalAssumptions || null,
    };

    const result = await insertRecord('project_concept_notes', newConceptNote, 'conceptNoteId');
    newConceptNote.conceptNoteId = result.insertId;
    res.status(201).json(newConceptNote);
  } catch (error) {
    console.error('Error creating concept note:', error);
    res.status(500).json({ message: 'Error creating concept note', error: error.message });
  }
});

/**
 * @route PUT /api/projects/concept-notes/:conceptNoteId
 */
router.put('/concept-notes/:conceptNoteId', async (req, res) => {
  const { conceptNoteId } = req.params;
  const clientData = req.body;

  const updatedFields = {
    situationAnalysis: clientData.situationAnalysis || null,
    problemStatement: clientData.problemStatement || null,
    relevanceProjectIdea: clientData.relevanceProjectIdea || null,
    scopeOfProject: clientData.scopeOfProject || null,
    projectGoal: clientData.projectGoal || null,
    goalIndicator: clientData.goalIndicator || null,
    goalMeansVerification: clientData.goalMeansVerification || null,
    goalAssumptions: clientData.goalAssumptions || null,
    updatedAt: formatTimestamp(new Date()),
  };

  try {
    const result = await updateRecord('project_concept_notes', updatedFields, 'conceptNoteId', conceptNoteId);
    if (result.affectedRows > 0) {
      const rows = await runQuery(
        'SELECT * FROM project_concept_notes WHERE "conceptNoteId" = ?',
        [conceptNoteId]
      );
      res.status(200).json(rows[0]);
    } else {
      res.status(404).json({ message: 'Concept note not found.' });
    }
  } catch (error) {
    console.error('Error updating concept note:', error);
    res.status(500).json({ message: 'Error updating concept note', error: error.message });
  }
});

/**
 * @route DELETE /api/projects/concept-notes/:conceptNoteId
 */
router.delete('/concept-notes/:conceptNoteId', async (req, res) => {
  const { conceptNoteId } = req.params;
  try {
    const result = await deleteRecord('project_concept_notes', 'conceptNoteId', conceptNoteId);
    if (result.affectedRows > 0) {
      res.status(204).send();
    } else {
      res.status(404).json({ message: 'Concept note not found.' });
    }
  } catch (error) {
    console.error('Error deleting concept note:', error);
    res.status(500).json({ message: 'Error deleting concept note', error: error.message });
  }
});

module.exports = router;
