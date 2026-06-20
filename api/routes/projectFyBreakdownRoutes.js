const express = require('express');
const router = express.Router();
const {
  runQuery,
  formatTimestamp,
  insertRecord,
  updateRecord,
  deleteRecord,
} = require('../utils/kdspDbHelpers');

router.get('/:projectId/fy-breakdown', async (req, res) => {
  const { projectId } = req.params;
  try {
    const rows = await runQuery(
      'SELECT * FROM project_fy_breakdown WHERE "projectId" = ? ORDER BY "financialYear"',
      [projectId]
    );
    res.status(200).json(rows);
  } catch (error) {
    console.error('Error fetching FY breakdown:', error);
    res.status(500).json({ message: 'Error fetching FY breakdown', error: error.message });
  }
});

router.post('/:projectId/fy-breakdown', async (req, res) => {
  const { projectId } = req.params;
  const clientData = req.body;

  try {
    const existing = await runQuery(
      'SELECT "fyBreakdownId" FROM project_fy_breakdown WHERE "projectId" = ? AND "financialYear" = ?',
      [projectId, clientData.financialYear]
    );
    if (existing.length > 0) {
      return res.status(409).json({
        message: `FY breakdown for ${clientData.financialYear} already exists for this project. Use PUT to update.`,
      });
    }

    const newFyBreakdown = {
      projectId: Number(projectId),
      financialYear: clientData.financialYear || null,
      totalCost: clientData.totalCost || null,
    };

    const result = await insertRecord('project_fy_breakdown', newFyBreakdown, 'fyBreakdownId');
    newFyBreakdown.fyBreakdownId = result.insertId;
    res.status(201).json(newFyBreakdown);
  } catch (error) {
    console.error('Error creating FY breakdown:', error);
    res.status(500).json({ message: 'Error creating FY breakdown', error: error.message });
  }
});

router.put('/fy-breakdown/:fyBreakdownId', async (req, res) => {
  const { fyBreakdownId } = req.params;
  const clientData = req.body;

  const updatedFields = {
    financialYear: clientData.financialYear || null,
    totalCost: clientData.totalCost || null,
    updatedAt: formatTimestamp(new Date()),
  };

  try {
    const result = await updateRecord('project_fy_breakdown', updatedFields, 'fyBreakdownId', fyBreakdownId);
    if (result.affectedRows > 0) {
      const rows = await runQuery(
        'SELECT * FROM project_fy_breakdown WHERE "fyBreakdownId" = ?',
        [fyBreakdownId]
      );
      res.status(200).json(rows[0]);
    } else {
      res.status(404).json({ message: 'FY breakdown not found.' });
    }
  } catch (error) {
    console.error('Error updating FY breakdown:', error);
    res.status(500).json({ message: 'Error updating FY breakdown', error: error.message });
  }
});

router.delete('/fy-breakdown/:fyBreakdownId', async (req, res) => {
  const { fyBreakdownId } = req.params;
  try {
    const result = await deleteRecord('project_fy_breakdown', 'fyBreakdownId', fyBreakdownId);
    if (result.affectedRows > 0) {
      res.status(204).send();
    } else {
      res.status(404).json({ message: 'FY breakdown not found.' });
    }
  } catch (error) {
    console.error('Error deleting FY breakdown:', error);
    res.status(500).json({ message: 'Error deleting FY breakdown', error: error.message });
  }
});

module.exports = router;
