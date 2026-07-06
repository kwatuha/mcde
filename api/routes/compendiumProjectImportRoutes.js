const express = require('express');
const XLSX = require('xlsx');
const router = express.Router();
const privilege = require('../middleware/privilegeMiddleware');
const staging = require('../services/compendiumProjectImportStagingService');
const applyService = require('../services/compendiumProjectImportApplyService');

const canRead = privilege(['project.update', 'project.read_all'], { anyOf: true });
const canApply = privilege(['project.update', 'project.create'], { anyOf: true });

router.get('/batches', canRead, async (req, res) => {
  try {
    const batches = await staging.listBatches();
    res.json({ batches });
  } catch (error) {
    res.status(500).json({ message: 'Failed to list compendium import batches.', error: error.message });
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
      fundingClass: req.query.fundingClass || '',
      search: req.query.search || '',
      matchedOnly: req.query.matchedOnly === 'true' || req.query.matchedOnly === '1',
      notAppliedOnly: req.query.notAppliedOnly === 'true' || req.query.notAppliedOnly === '1',
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
      fundingClass: req.query.fundingClass || '',
      search: req.query.search || '',
      matchedOnly: req.query.matchedOnly === 'true' || req.query.matchedOnly === '1',
      notAppliedOnly: req.query.notAppliedOnly === 'true' || req.query.notAppliedOnly === '1',
    });
    if (!rows.length) return res.status(404).json({ message: 'No staging rows match the current filters.' });

    const sheetRows = rows.map((row) => ({
      'Source row': row.sourceRowNo,
      Sheet: row.sourceSheet,
      'Project name': row.projectName,
      'Sub-county': row.subCountyNorm || row.subCountyRaw || '',
      Ward: row.wardNorm || row.wardRaw || '',
      'Sub-location': row.subLocationNorm || row.subLocationRaw || '',
      Department: row.departmentNorm || row.departmentRaw || '',
      'Financial year': row.financialYearNorm || row.financialYearRaw || '',
      'Approved cost': row.approvedCostNorm ?? row.approvedCostRaw ?? '',
      'Funding class': row.fundingClass,
      'Project status': row.projectStatusNorm || row.projectStatusRaw || '',
      'Match project ID': row.matchProjectId ?? '',
      'Match project name': row.matchProjectName || '',
      'Match score': row.matchScore ?? '',
      'Proposed action': row.proposedAction,
      Applied: row.appliedProjectId ?? '',
      'Review notes': row.reviewNotes || '',
    }));

    const worksheet = XLSX.utils.json_to_sheet(sheetRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Compendium review');
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    const safeBatch = batch.replace(/[^\w.-]+/g, '_').slice(0, 60);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="compendium-staging-${safeBatch}.xlsx"`);
    res.send(buffer);
  } catch (error) {
    res.status(500).json({ message: 'Failed to export staging rows.', error: error.message });
  }
});

router.get('/batches/:batch/insert-ready-count', canRead, async (req, res) => {
  try {
    const batch = String(req.params.batch || '').trim();
    if (!batch) return res.status(400).json({ message: 'Batch id is required.' });
    const count = await applyService.countInsertReadyRows(batch);
    res.json({ batch, count });
  } catch (error) {
    res.status(500).json({ message: 'Failed to count insert-ready rows.', error: error.message });
  }
});

router.post('/batches/:batch/apply-insert', canApply, async (req, res) => {
  try {
    const batch = String(req.params.batch || '').trim();
    if (!batch) return res.status(400).json({ message: 'Batch id is required.' });

    const stagingIds = Array.isArray(req.body?.stagingIds)
      ? req.body.stagingIds.map((id) => Number(id)).filter(Number.isFinite)
      : [];
    const selectAllInsert = req.body?.selectAllInsert === true;

    if (!selectAllInsert && !stagingIds.length) {
      return res.status(400).json({ message: 'Select at least one staging row or use selectAllInsert.' });
    }

    const userId = req.user?.id || req.user?.userId || req.user?.actualUserId;
    if (!userId) return res.status(401).json({ message: 'Authentication required.' });

    const result = await applyService.applyInsertStagingRows(
      batch,
      {
        stagingIds,
        selectAllInsert,
        search: req.body?.search || '',
        fundingClass: req.body?.fundingClass || '',
      },
      Number(userId),
    );

    res.json({
      batch,
      ...result,
      createdCount: result.created.length,
      skippedCount: result.skipped.length,
      errorCount: result.errors.length,
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to create projects from compendium staging.', error: error.message });
  }
});

module.exports = router;
