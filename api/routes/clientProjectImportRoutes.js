const express = require('express');
const XLSX = require('xlsx');
const router = express.Router();
const privilege = require('../middleware/privilegeMiddleware');
const staging = require('../services/clientProjectImportStagingService');
const applyService = require('../services/clientProjectImportApplyService');
const demoDataService = require('../services/clientProjectDemoDataService');
const metadataResolution = require('../services/clientMetadataResolutionService');

const canRead = privilege(['project.update', 'project.read_all'], { anyOf: true });
const canApply = privilege(['project.update', 'project.create'], { anyOf: true });
const canVoidDemo = privilege(['project.update'], { anyOf: true });

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
      notAppliedOnly: req.query.notAppliedOnly === 'true' || req.query.notAppliedOnly === '1',
      appliedOnly: req.query.appliedOnly === 'true' || req.query.appliedOnly === '1',
      appliedWithMetadataIssuesOnly:
        req.query.appliedWithMetadataIssuesOnly === 'true' || req.query.appliedWithMetadataIssuesOnly === '1',
      metadataIssuesOnly: req.query.metadataIssuesOnly === 'true' || req.query.metadataIssuesOnly === '1',
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
      notAppliedOnly: req.query.notAppliedOnly === 'true' || req.query.notAppliedOnly === '1',
      appliedOnly: req.query.appliedOnly === 'true' || req.query.appliedOnly === '1',
      appliedWithMetadataIssuesOnly:
        req.query.appliedWithMetadataIssuesOnly === 'true' || req.query.appliedWithMetadataIssuesOnly === '1',
      metadataIssuesOnly: req.query.metadataIssuesOnly === 'true' || req.query.metadataIssuesOnly === '1',
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
      'Applied project ID': row.appliedProjectId ?? '',
      'Applied at': row.appliedAt || '',
      'Metadata remarks': row.metadataRemarksLabel || row.metadataRemarks || '',
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
    res.status(500).json({ message: 'Failed to create projects from staging.', error: error.message });
  }
});

router.post('/batches/:batch/refresh-metadata', canApply, async (req, res) => {
  try {
    const batch = String(req.params.batch || '').trim();
    if (!batch) return res.status(400).json({ message: 'Batch id is required.' });
    const result = await staging.refreshMetadataRemarksForBatch(batch);
    res.json({ batch, ...result });
  } catch (error) {
    res.status(500).json({ message: 'Failed to refresh metadata remarks.', error: error.message });
  }
});

router.get('/batches/:batch/metadata-suggestions', canRead, async (req, res) => {
  try {
    const batch = String(req.params.batch || '').trim();
    if (!batch) return res.status(400).json({ message: 'Batch id is required.' });
    const result = await metadataResolution.listMetadataSuggestions(batch);
    res.json(result);
  } catch (error) {
    console.error('Failed to load metadata suggestions:', error);
    res.status(500).json({
      message: error.message || 'Failed to load metadata suggestions.',
      error: error.message,
    });
  }
});

router.post('/batches/:batch/metadata-resolutions', canApply, async (req, res) => {
  try {
    const batch = String(req.params.batch || '').trim();
    if (!batch) return res.status(400).json({ message: 'Batch id is required.' });

    const resolutions = Array.isArray(req.body?.resolutions) ? req.body.resolutions : [];
    if (!resolutions.length) {
      return res.status(400).json({ message: 'At least one resolution is required.' });
    }

    const userId = req.user?.id || req.user?.userId || req.user?.actualUserId;
    if (!userId) return res.status(401).json({ message: 'Authentication required.' });

    const result = await metadataResolution.saveResolutions(batch, resolutions, Number(userId));
    res.json({ batch, ...result });
  } catch (error) {
    res.status(400).json({ message: error.message || 'Failed to save metadata resolutions.' });
  }
});

router.get('/demo-projects/summary', canRead, async (req, res) => {
  try {
    const summary = await demoDataService.summarizeDemoProjects();
    res.json(summary);
  } catch (error) {
    res.status(500).json({ message: 'Failed to summarize demo projects.', error: error.message });
  }
});

router.get('/demo-projects', canRead, async (req, res) => {
  try {
    const result = await demoDataService.listDemoProjects({
      search: req.query.search || '',
      reason: req.query.reason || '',
      limit: req.query.limit,
      offset: req.query.offset,
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ message: 'Failed to list demo projects.', error: error.message });
  }
});

router.post('/demo-projects/void', canVoidDemo, async (req, res) => {
  try {
    const projectIds = Array.isArray(req.body?.projectIds)
      ? req.body.projectIds.map((id) => Number(id)).filter(Number.isFinite)
      : [];
    const voidAllDemo = req.body?.voidAllDemo === true;

    if (!voidAllDemo && !projectIds.length) {
      return res.status(400).json({ message: 'Select at least one demo project or use voidAllDemo.' });
    }

    const result = await demoDataService.voidDemoProjects({
      projectIds,
      voidAllDemo,
      search: req.body?.search || '',
      reason: req.body?.reason || '',
    });

    res.json({
      ...result,
      voidedCount: result.voided.length,
      skippedCount: result.skipped.length,
      errorCount: result.errors.length,
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to void demo projects.', error: error.message });
  }
});

module.exports = router;
