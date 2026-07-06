const express = require('express');
const XLSX = require('xlsx');
const router = express.Router();
const privilege = require('../middleware/privilegeMiddleware');
const staging = require('../services/clientProjectImportStagingService');

const canRead = privilege(['project.update', 'project.read_all'], { anyOf: true });

router.get('/batches', canRead, async (req, res) => {
  try {
    const batches = await staging.listBatches();
    res.json({ batches });
  } catch (error) {
    res.status(500).json({ message: 'Failed to list import batches.', error: error.message });
  }
});

router.get('/batches/:batch/summary', canRead, async (req, res) => {
  try {
    const batch = String(req.params.batch || '').trim();
    if (!batch) return res.status(400).json({ message: 'Batch id is required.' });
    const summary = await staging.summarizeBatch(batch);
    const total = summary.reduce((sum, row) => sum + Number(row.count || 0), 0);
    if (!total) return res.status(404).json({ message: 'Import batch not found.' });
    res.json({ batch, total, actions: summary });
  } catch (error) {
    res.status(500).json({ message: 'Failed to load batch summary.', error: error.message });
  }
});

router.get('/batches/:batch/rows', canRead, async (req, res) => {
  try {
    const batch = String(req.params.batch || '').trim();
    if (!batch) return res.status(400).json({ message: 'Batch id is required.' });
    const result = await staging.listStagingRows(batch, {
      proposedAction: req.query.proposedAction || req.query.action || '',
      search: req.query.search || '',
      matchedOnly: req.query.matchedOnly === 'true' || req.query.matchedOnly === '1',
      limit: req.query.limit,
      offset: req.query.offset,
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ message: 'Failed to list staging rows.', error: error.message });
  }
});

router.get('/batches/:batch/export', canRead, async (req, res) => {
  try {
    const batch = String(req.params.batch || '').trim();
    if (!batch) return res.status(400).json({ message: 'Batch id is required.' });
    const rows = await staging.listAllStagingRowsForExport(batch, {
      proposedAction: req.query.proposedAction || req.query.action || '',
      search: req.query.search || '',
      matchedOnly: req.query.matchedOnly === 'true' || req.query.matchedOnly === '1',
    });
    if (!rows.length) return res.status(404).json({ message: 'No staging rows match the current filters.' });

    const sheetRows = rows.map((row) => ({
      'Source row': row.sourceRowNo,
      'Project name': row.projectName,
      'Sub-county': row.subCountyNorm || row.subCountyRaw || '',
      Ward: row.wardNorm || row.wardRaw || '',
      'Sub-location': row.subLocationNorm || row.subLocationRaw || '',
      Department: row.departmentNorm || row.departmentRaw || '',
      Impact: row.impactRaw || '',
      'Payment status (raw)': row.paymentStatusRaw || '',
      'Payment status (norm)': row.paymentStatusNorm || '',
      'Location scope': row.locationScope,
      'Remarks amount': row.remarksAmount ?? '',
      'Remarks status text': row.remarksStatusText || '',
      'Duplicate count in file': row.duplicateCountInFile,
      'Match project ID': row.matchProjectId ?? '',
      'Match project name': row.matchProjectName || '',
      'Match score': row.matchScore ?? '',
      'Match method': row.matchMethod || '',
      'Match is test project': row.matchIsTestProject ? 'Yes' : 'No',
      'Proposed action': row.proposedAction,
      'Review notes': row.reviewNotes || '',
    }));

    const worksheet = XLSX.utils.json_to_sheet(sheetRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Staging review');
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    const safeBatch = batch.replace(/[^\w.-]+/g, '_').slice(0, 60);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="client-project-staging-${safeBatch}.xlsx"`);
    res.send(buffer);
  } catch (error) {
    res.status(500).json({ message: 'Failed to export staging rows.', error: error.message });
  }
});

module.exports = router;
