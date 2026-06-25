import React, { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import apiService from '../../api';

const statusColor = {
  will_create: 'success',
  duplicate_skip: 'warning',
  duplicate_file: 'warning',
  error: 'error',
};

const statusLabel = {
  will_create: 'Will import',
  duplicate_skip: 'Exists',
  duplicate_file: 'Duplicate in file',
  error: 'Error',
};

function ContractorImportDialog({ open, onClose, onSuccess }) {
  const [excelFile, setExcelFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const resetState = () => {
    setExcelFile(null);
    setPreview(null);
    setLoadingPreview(false);
    setSubmitting(false);
    setError('');
  };

  const handleClose = () => {
    resetState();
    onClose?.();
  };

  const handleDownloadTemplate = async () => {
    setError('');
    try {
      const { blob, fileName } = await apiService.contractors.downloadImportTemplate();
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = fileName;
      anchor.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Failed to download template.');
    }
  };

  const handleFileSelect = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setExcelFile(file);
    setPreview(null);
    setLoadingPreview(true);
    setError('');
    try {
      const data = await apiService.contractors.previewImport(file);
      setPreview(data);
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Failed to preview Excel import.');
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleConfirm = async () => {
    if (!preview?.validRows?.length) {
      setError('No valid rows to import. Fix errors or remove duplicates first.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const result = await apiService.contractors.confirmImport(preview.validRows);
      onSuccess?.(result);
      handleClose();
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Failed to import contractors.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth="lg">
      <DialogTitle>Import Contractors from Excel</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Typography variant="body2" color="text.secondary">
            Download the template, fill in contractor details on the Contractors sheet, then upload the file.
            Company name and email are required. Contractor type must match a name from the Contractor Types sheet.
          </Typography>

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
            <Button variant="outlined" startIcon={<DownloadIcon />} onClick={handleDownloadTemplate}>
              Download template
            </Button>
            <Button variant="contained" component="label" startIcon={<UploadFileIcon />} disabled={loadingPreview}>
              {excelFile ? 'Choose another file' : 'Upload Excel file'}
              <input type="file" hidden accept=".xlsx,.xls" onChange={handleFileSelect} />
            </Button>
            {excelFile && (
              <Typography variant="body2" sx={{ alignSelf: 'center' }}>
                {excelFile.name}
              </Typography>
            )}
          </Stack>

          {loadingPreview && (
            <Box display="flex" alignItems="center" gap={1}>
              <CircularProgress size={20} />
              <Typography variant="body2">Parsing file…</Typography>
            </Box>
          )}

          {preview && (
            <Stack spacing={1}>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                <Chip label={`${preview.wouldCreate || 0} to import`} color="success" size="small" />
                <Chip label={`${preview.skippedDuplicates || 0} skipped`} color="warning" size="small" />
                <Chip label={`${preview.errorCount || 0} errors`} color="error" size="small" />
                {preview.sheetName && (
                  <Chip label={`Sheet: ${preview.sheetName}`} size="small" variant="outlined" />
                )}
              </Stack>

              {preview.errors?.length > 0 && (
                <Alert severity="error">
                  {preview.errors.map((msg) => (
                    <div key={msg}>{msg}</div>
                  ))}
                </Alert>
              )}

              {preview.rows?.length > 0 && (
                <TableContainer sx={{ maxHeight: 360 }}>
                  <Table size="small" stickyHeader>
                    <TableHead>
                      <TableRow>
                        <TableCell>Row</TableCell>
                        <TableCell>Company</TableCell>
                        <TableCell>Contact</TableCell>
                        <TableCell>Email</TableCell>
                        <TableCell>Phone</TableCell>
                        <TableCell>Type</TableCell>
                        <TableCell>Status</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {preview.rows.map((row) => (
                        <TableRow key={row.rowNumber}>
                          <TableCell>{row.rowNumber}</TableCell>
                          <TableCell>{row.companyName}</TableCell>
                          <TableCell>{row.contactPerson}</TableCell>
                          <TableCell>{row.email}</TableCell>
                          <TableCell>{row.phone}</TableCell>
                          <TableCell>{row.contractorType}</TableCell>
                          <TableCell>
                            <Chip
                              label={statusLabel[row.status] || row.status}
                              color={statusColor[row.status] || 'default'}
                              size="small"
                            />
                            {row.messages?.length > 0 && (
                              <Typography variant="caption" display="block" color="text.secondary">
                                {row.messages.join(' ')}
                              </Typography>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </Stack>
          )}

          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={submitting}>Cancel</Button>
        <Button
          variant="contained"
          onClick={handleConfirm}
          disabled={submitting || !preview?.validRows?.length}
        >
          {submitting ? 'Importing…' : `Import ${preview?.wouldCreate || 0} contractor(s)`}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default ContractorImportDialog;
