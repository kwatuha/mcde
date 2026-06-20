const express = require('express');
const multer = require('multer');
const path = require('path');
const XLSX = require('xlsx');
const registry = require('../services/beneficiaryRegistryService');
const { buildBeneficiaryImportWorkbook } = require('../services/beneficiaryTemplateService');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

function getUserId(user) {
  return Number(user?.id ?? user?.userId ?? user?.actualUserId) || null;
}

function parseWorkbook(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames.includes('Beneficiaries')
    ? 'Beneficiaries'
    : workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  return XLSX.utils.sheet_to_json(sheet, { defval: '' });
}

router.get('/types', async (req, res) => {
  try {
    res.json({ types: await registry.getTypes() });
  } catch (error) {
    res.status(500).json({ message: 'Failed to load beneficiary types.', error: error.message });
  }
});

router.get('/filter-options', async (req, res) => {
  try {
    res.json(await registry.getFilterOptions());
  } catch (error) {
    res.status(500).json({ message: 'Failed to load filter options.', error: error.message });
  }
});

router.post('/filtered', async (req, res) => {
  try {
    const { filters = {}, page = 1, pageSize = 25, orderBy = 'beneficiaryId', order = 'ASC' } = req.body || {};
    const result = await registry.listBeneficiaries(
      { ...filters, orderBy, order },
      { page, pageSize }
    );
    res.json({
      data: result.rows,
      totalCount: result.totalCount,
      page: result.page,
      pageSize: result.pageSize,
      totalPages: result.totalPages,
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to list beneficiaries.', error: error.message });
  }
});

router.get('/template', async (req, res) => {
  try {
    const workbook = await buildBeneficiaryImportWorkbook();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="beneficiaries_import_template.xlsx"');
    await workbook.xlsx.write(res);
    return res.end();
  } catch (error) {
    res.status(500).json({ message: 'Failed to generate import template.', error: error.message });
  }
});

router.get('/import-sample/kalama-rri', (req, res) => {
  const samplePath = path.join(__dirname, '../fixtures/import-samples/beneficiary-import-kalama-rri-2025-26.xlsx');
  res.download(samplePath, 'beneficiary-import-kalama-rri-2025-26.xlsx', (err) => {
    if (err && !res.headersSent) {
      res.status(404).json({ message: 'Kalama RRI beneficiary sample file not found on server.' });
    }
  });
});

router.post('/import-data', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'Import file is required.' });
    const rawRows = parseWorkbook(req.file.buffer);
    const result = await registry.previewImportRows(rawRows);
    res.json(registry.formatImportPreviewResponse(result));
  } catch (error) {
    res.status(500).json({ message: 'Failed to preview beneficiary import.', error: error.message });
  }
});

router.post('/confirm-import-data', async (req, res) => {
  try {
    const rows = Array.isArray(req.body?.dataToImport) ? req.body.dataToImport : [];
    if (!rows.length) return res.status(400).json({ message: 'No beneficiary rows supplied for import.' });
    const { inserted, updated, total } = await registry.confirmImportRows(rows, getUserId(req.user));
    res.json({
      success: true,
      message: `Imported ${total} beneficiary record(s).`,
      inserted,
      updated,
      total,
      details: {
        rowsProcessed: total,
        inserted,
        updated,
        total,
      },
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to import beneficiaries.', error: error.message });
  }
});

router.get('/:beneficiaryId', async (req, res) => {
  try {
    const row = await registry.getBeneficiaryById(Number(req.params.beneficiaryId));
    if (!row) return res.status(404).json({ message: 'Beneficiary not found.' });
    res.json(row);
  } catch (error) {
    res.status(500).json({ message: 'Failed to load beneficiary.', error: error.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const result = await registry.upsertBeneficiaryRecord(req.body, getUserId(req.user));
    res.status(result.updated ? 200 : 201).json(result);
  } catch (error) {
    res.status(400).json({ message: error.message || 'Failed to save beneficiary.' });
  }
});

router.put('/:beneficiaryId', async (req, res) => {
  try {
    const payload = {
      ...req.body,
      beneficiaryId: Number(req.params.beneficiaryId),
      registryCode: req.body.registryCode || req.body.registry_code,
    };
    const result = await registry.upsertBeneficiaryRecord(payload, getUserId(req.user));
    res.json(result);
  } catch (error) {
    res.status(400).json({ message: error.message || 'Failed to update beneficiary.' });
  }
});

router.delete('/:beneficiaryId', async (req, res) => {
  try {
    res.json(await registry.voidBeneficiary(Number(req.params.beneficiaryId)));
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete beneficiary.', error: error.message });
  }
});

module.exports = router;
