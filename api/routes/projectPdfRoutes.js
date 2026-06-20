const express = require('express');
const router = express.Router();
const {
  exportInceptionPdf,
  exportInceptionDocx,
} = require('../services/kdspInceptionExportService');
const { resolveCountyLogoPath } = require('../utils/countyLogo');

async function sendExport(res, result, contentType) {
  if (!result) {
    return res.status(404).json({ message: 'Project not found.' });
  }
  const logoPath = resolveCountyLogoPath();
  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
  res.setHeader('X-County-Logo', logoPath ? 'loaded' : 'missing');
  return res.send(result.buffer);
}

router.get('/:projectId/export-pdf', async (req, res) => {
  try {
    const result = await exportInceptionPdf(req.params.projectId);
    await sendExport(res, result, 'application/pdf');
  } catch (error) {
    console.error('Error generating PDF report:', error);
    if (!res.headersSent) {
      res.status(500).json({ message: 'Failed to generate PDF report.', error: error.message });
    }
  }
});

router.get('/:projectId/export-docx', async (req, res) => {
  try {
    const result = await exportInceptionDocx(req.params.projectId);
    await sendExport(
      res,
      result,
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    );
  } catch (error) {
    console.error('Error generating Word report:', error);
    if (!res.headersSent) {
      res.status(500).json({ message: 'Failed to generate Word report.', error: error.message });
    }
  }
});

module.exports = router;
