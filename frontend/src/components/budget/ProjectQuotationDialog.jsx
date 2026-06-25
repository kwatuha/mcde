import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  LinearProgress,
  MenuItem,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import CompareArrowsIcon from '@mui/icons-material/CompareArrows';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import DownloadIcon from '@mui/icons-material/Download';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import procurementService from '../../api/procurementService';
import { formatCurrency } from '../../utils/helpers';

function riskMeta(level) {
  const map = {
    high: { label: 'High front-load risk', color: 'error' },
    medium: { label: 'Medium risk', color: 'warning' },
    low: { label: 'Low risk', color: 'success' },
    none: { label: 'No quote yet', color: 'default' },
  };
  return map[level] || map.none;
}

function lineTypeLabel(type) {
  const map = {
    planned: 'Planned BQ',
    provisional: 'Provisional sum',
    pc_sum: 'PC sum',
    extra: 'Additional',
  };
  return map[type] || type;
}

function parseNum(value) {
  if (value === '' || value == null) return null;
  const num = Number(String(value).replace(/,/g, ''));
  return Number.isFinite(num) ? num : null;
}

function computeQuotedAmount(row) {
  const amount = parseNum(row.quotedAmount);
  if (amount != null) return amount;
  const qty = parseNum(row.quotedQuantity);
  const unit = parseNum(row.quotedUnitCost);
  if (qty != null && unit != null) return qty * unit;
  return null;
}

export default function ProjectQuotationDialog({ open, onClose, item, onSuccess }) {
  const projectId = item?.registryProjectId;
  const [tab, setTab] = useState('enter');
  const [comparison, setComparison] = useState(null);
  const [entryLines, setEntryLines] = useState([]);
  const [extraLineTypes, setExtraLineTypes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingEntry, setLoadingEntry] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const [excelPreview, setExcelPreview] = useState(null);
  const [loadingExcel, setLoadingExcel] = useState(false);
  const [awardOnSave, setAwardOnSave] = useState(true);
  const [supplierName, setSupplierName] = useState('');
  const [referenceNo, setReferenceNo] = useState('');

  const loadComparison = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setError('');
    try {
      const data = await procurementService.getScopeComparison(projectId);
      setComparison(data);
    } catch (err) {
      const apiError = err?.response?.data?.error || err?.response?.data?.message;
      setError(apiError || err?.message || 'Failed to load comparison.');
      setComparison(null);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  const loadEntrySheet = useCallback(async () => {
    if (!projectId) return;
    setLoadingEntry(true);
    try {
      const sheet = await procurementService.getQuotationEntrySheet(projectId);
      setEntryLines(sheet?.lines || []);
      setExtraLineTypes(sheet?.extraLineTypes || []);
    } catch (err) {
      setEntryLines([]);
      setError(err?.response?.data?.message || err?.message || 'Failed to load planned BQ for quoting.');
    } finally {
      setLoadingEntry(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (!open || !projectId) return;
    setTab('enter');
    setExcelPreview(null);
    setSupplierName('');
    setReferenceNo('');
    setAwardOnSave(true);
    setError('');
    loadComparison();
    loadEntrySheet();
  }, [open, projectId, loadComparison, loadEntrySheet]);

  const risk = useMemo(
    () => riskMeta(comparison?.risk?.riskLevel || item?.quotationRiskLevel || 'none'),
    [comparison, item]
  );

  const entryTotal = useMemo(
    () => entryLines.reduce((sum, row) => sum + Number(computeQuotedAmount(row) || 0), 0),
    [entryLines]
  );

  const handleDownloadTemplate = async () => {
    if (!projectId) return;
    try {
      const { blob, fileName } = await procurementService.exportPlannedBqForQuoting(projectId);
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = fileName;
      anchor.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Failed to download quote template.');
    }
  };

  const updateEntryLine = (index, field, value) => {
    setEntryLines((prev) => prev.map((row, i) => (i === index ? { ...row, [field]: value } : row)));
  };

  const addExtraLine = (lineType = 'provisional') => {
    setEntryLines((prev) => [
      ...prev,
      {
        plannedBqItemId: null,
        lineType,
        milestoneName: lineType === 'pc_sum' ? 'PC sums' : 'Provisional sums',
        activityName: '',
        unitOfMeasure: 'lump sum',
        plannedAmount: null,
        quotedQuantity: 1,
        quotedUnitCost: '',
        quotedAmount: '',
        sortOrder: prev.length + 1,
      },
    ]);
  };

  const removeEntryLine = (index) => {
    setEntryLines((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSaveEntry = async () => {
    if (!projectId || !entryLines.length) return;
    setSubmitting(true);
    setError('');
    try {
      const result = await procurementService.confirmQuotationEntry(projectId, {
        lines: entryLines,
        supplierName: supplierName.trim() || undefined,
        referenceNo: referenceNo.trim() || undefined,
        awardQuotation: awardOnSave,
      });
      setComparison(result.comparison || null);
      onSuccess?.(result);
      setTab('compare');
      await loadEntrySheet();
    } catch (err) {
      const errors = err?.response?.data?.errors;
      setError(
        errors?.length
          ? errors.join(' ')
          : err?.response?.data?.message || err?.message || 'Failed to save quotation.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleExcelSelect = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !projectId) return;
    setLoadingExcel(true);
    setError('');
    try {
      const preview = await procurementService.previewQuotationImport(projectId, file);
      setExcelPreview(preview);
      setTab('import');
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Failed to preview quotation import.');
    } finally {
      setLoadingExcel(false);
    }
  };

  const handleConfirmImport = async () => {
    if (!projectId || !excelPreview?.lines?.length) return;
    if (excelPreview.errors?.length) {
      setError('Fix Excel validation errors before importing.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const result = await procurementService.confirmQuotationImport(projectId, {
        lines: excelPreview.lines,
        supplierName: supplierName.trim() || undefined,
        referenceNo: referenceNo.trim() || undefined,
        awardQuotation: awardOnSave,
      });
      setComparison(result.comparison || null);
      setExcelPreview(null);
      onSuccess?.(result);
      setTab('compare');
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Failed to import quotation.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAwardLatest = async () => {
    const quotationId = comparison?.quotation?.quotationId;
    if (!projectId || !quotationId) return;
    setSubmitting(true);
    setError('');
    try {
      const result = await procurementService.updateQuotation(projectId, quotationId, { status: 'awarded' });
      setComparison(result.comparison || null);
      onSuccess?.(result);
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Failed to award quotation.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!item) return null;

  const lineComparisons = comparison?.lineComparisons || [];
  const highVarianceLines = lineComparisons.filter(
    (row) => row.lineType === 'planned' && Number(row.variancePercent || 0) >= 25
  );

  return (
    <Dialog open={open} onClose={submitting ? undefined : onClose} fullWidth maxWidth="lg">
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <CompareArrowsIcon color="primary" />
        Contracted quotation vs planned
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Alert severity="info">
            Quote against the project&apos;s planned BQ: item names are fixed; enter quoted values only.
            Add provisional or PC sums at the bottom for allowances not in the baseline.
          </Alert>

          <Box>
            <Typography variant="body1" fontWeight={600}>
              {item.registryProjectName || `Project #${projectId}`}
            </Typography>
          </Box>

          {(loading || loadingEntry) && <LinearProgress />}

          {comparison && (
            <Box sx={{ p: 2, borderRadius: 1, border: 1, borderColor: 'divider', bgcolor: 'action.hover' }}>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                <Chip size="small" label={risk.label} color={risk.color} />
                <Chip size="small" variant="outlined" label={`Planned ${formatCurrency(Number(comparison.plannedTotal || 0))}`} />
                {comparison.hasQuotation && (
                  <Chip size="small" variant="outlined" label={`Quoted ${formatCurrency(Number(comparison.quotedTotal || 0))}`} />
                )}
              </Stack>
              {comparison.risk?.alerts?.length > 0 && (
                <Alert severity={comparison.risk.riskLevel === 'high' ? 'error' : 'warning'} sx={{ mt: 1.5 }} icon={<WarningAmberIcon />}>
                  {comparison.risk.alerts.map((alert) => <div key={alert}>{alert}</div>)}
                </Alert>
              )}
            </Box>
          )}

          <Tabs value={tab} onChange={(_, value) => setTab(value)}>
            <Tab value="enter" label="Enter quote" />
            <Tab value="compare" label="Comparison" />
            <Tab value="import" label="Import Excel" />
          </Tabs>

          {tab === 'enter' && (
            <Stack spacing={2}>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <TextField label="Supplier name" size="small" value={supplierName} onChange={(e) => setSupplierName(e.target.value)} fullWidth />
                <TextField label="Reference / tender no." size="small" value={referenceNo} onChange={(e) => setReferenceNo(e.target.value)} fullWidth />
              </Stack>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                <Button size="small" variant="outlined" startIcon={<DownloadIcon />} onClick={handleDownloadTemplate} disabled={!entryLines.length}>
                  Download project quote template
                </Button>
                <Button size="small" variant="outlined" startIcon={<AddIcon />} onClick={() => addExtraLine('provisional')}>
                  Add provisional sum
                </Button>
                <Button size="small" variant="outlined" startIcon={<AddIcon />} onClick={() => addExtraLine('pc_sum')}>
                  Add PC sum
                </Button>
              </Stack>
              {!entryLines.length && !loadingEntry && (
                <Alert severity="warning">No planned BQ lines. Use Setup scope on this project first.</Alert>
              )}
              <TableContainer sx={{ maxHeight: 360 }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell>Type</TableCell>
                      <TableCell>Milestone</TableCell>
                      <TableCell>Activity</TableCell>
                      <TableCell align="right">Planned</TableCell>
                      <TableCell align="right">Qty</TableCell>
                      <TableCell align="right">Unit cost</TableCell>
                      <TableCell align="right">Quoted amount</TableCell>
                      <TableCell width={40} />
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {entryLines.map((row, index) => {
                      const isPlanned = row.lineType === 'planned' && row.plannedBqItemId;
                      return (
                        <TableRow key={`${row.plannedBqItemId || 'extra'}-${index}`}>
                          <TableCell>
                            <Chip size="small" label={lineTypeLabel(row.lineType || 'planned')} variant="outlined" />
                          </TableCell>
                          <TableCell>
                            {isPlanned ? (
                              <Typography variant="body2">{row.milestoneName || '—'}</Typography>
                            ) : (
                              <TextField size="small" value={row.milestoneName || ''} onChange={(e) => updateEntryLine(index, 'milestoneName', e.target.value)} fullWidth />
                            )}
                          </TableCell>
                          <TableCell>
                            {isPlanned ? (
                              <Typography variant="body2" fontWeight={600}>{row.activityName}</Typography>
                            ) : (
                              <TextField size="small" value={row.activityName || ''} onChange={(e) => updateEntryLine(index, 'activityName', e.target.value)} placeholder="Description" fullWidth />
                            )}
                          </TableCell>
                          <TableCell align="right">
                            {row.plannedAmount != null ? formatCurrency(Number(row.plannedAmount)) : '—'}
                          </TableCell>
                          <TableCell align="right">
                            <TextField size="small" type="number" value={row.quotedQuantity ?? ''} onChange={(e) => updateEntryLine(index, 'quotedQuantity', e.target.value)} sx={{ width: 88 }} />
                          </TableCell>
                          <TableCell align="right">
                            <TextField size="small" type="number" value={row.quotedUnitCost ?? ''} onChange={(e) => updateEntryLine(index, 'quotedUnitCost', e.target.value)} sx={{ width: 110 }} />
                          </TableCell>
                          <TableCell align="right">
                            <TextField size="small" type="number" value={row.quotedAmount ?? ''} onChange={(e) => updateEntryLine(index, 'quotedAmount', e.target.value)} sx={{ width: 120 }} />
                          </TableCell>
                          <TableCell>
                            {!isPlanned && (
                              <Tooltip title="Remove line">
                                <IconButton size="small" onClick={() => removeEntryLine(index)}>
                                  <DeleteOutlineIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
              <Typography variant="body2" color="text.secondary">
                Entry total: <strong>{formatCurrency(entryTotal)}</strong>
              </Typography>
              <FormControlLabel
                control={<Checkbox size="small" checked={awardOnSave} onChange={(e) => setAwardOnSave(e.target.checked)} />}
                label="Mark as awarded contract when saving"
              />
            </Stack>
          )}

          {tab === 'compare' && comparison && (
            <Stack spacing={2}>
              {comparison.quotation?.status !== 'awarded' && comparison.hasQuotation && (
                <Button size="small" variant="contained" color="warning" onClick={handleAwardLatest} disabled={submitting}>
                  Mark as awarded contract
                </Button>
              )}
              <TableContainer sx={{ maxHeight: 300 }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell>Type</TableCell>
                      <TableCell>Milestone</TableCell>
                      <TableCell>Activity</TableCell>
                      <TableCell align="right">Planned</TableCell>
                      <TableCell align="right">Quoted</TableCell>
                      <TableCell align="right">Variance</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {lineComparisons.map((row) => (
                      <TableRow key={`${row.plannedBqItemId || row.activityName}-${row.lineType}`}>
                        <TableCell><Chip size="small" label={lineTypeLabel(row.lineType || 'planned')} variant="outlined" /></TableCell>
                        <TableCell>{row.milestoneName || '—'}</TableCell>
                        <TableCell>{row.activityName}</TableCell>
                        <TableCell align="right">{row.plannedAmount != null ? formatCurrency(Number(row.plannedAmount)) : '—'}</TableCell>
                        <TableCell align="right">{row.quotedAmount != null ? formatCurrency(Number(row.quotedAmount)) : '—'}</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 600, color: Number(row.variancePercent || 0) >= 25 ? 'error.main' : 'text.primary' }}>
                          {row.varianceAmount == null ? '—' : formatCurrency(Number(row.varianceAmount))}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
              {highVarianceLines.length > 0 && (
                <Alert severity="warning">
                  {highVarianceLines.length} planned line(s) quoted ≥25% above plan — review mobilization/foundation items.
                </Alert>
              )}
            </Stack>
          )}

          {tab === 'import' && (
            <Stack spacing={2}>
              <Alert severity="info">
                Use the project quote template (all planned BQ rows). Do not rename milestone or activity columns.
              </Alert>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                <Button size="small" variant="outlined" startIcon={<DownloadIcon />} onClick={handleDownloadTemplate}>
                  Download project quote template
                </Button>
                <Button size="small" variant="contained" component="label" startIcon={<UploadFileIcon />}>
                  Choose Excel file
                  <input type="file" hidden accept=".xlsx,.xls" onChange={handleExcelSelect} />
                </Button>
              </Stack>
              {loadingExcel && <LinearProgress />}
              {excelPreview?.errors?.length > 0 && (
                <Alert severity="error">{excelPreview.errors.map((msg) => <div key={msg}>{msg}</div>)}</Alert>
              )}
              {excelPreview?.warnings?.length > 0 && (
                <Alert severity="warning">{excelPreview.warnings.map((msg) => <div key={msg}>{msg}</div>)}</Alert>
              )}
              {excelPreview && !excelPreview.errors?.length && (
                <Alert severity="info">
                  Import total {formatCurrency(Number(excelPreview.importTotal || 0))}
                  {' · '}
                  {excelPreview.lines?.length || 0} line(s)
                </Alert>
              )}
            </Stack>
          )}

          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} disabled={submitting}>Close</Button>
        {tab === 'enter' && entryLines.length > 0 && (
          <Button variant="contained" onClick={handleSaveEntry} disabled={submitting}>
            Save quotation
          </Button>
        )}
        {tab === 'import' && excelPreview?.lines?.length > 0 && !excelPreview.errors?.length && (
          <Button variant="contained" onClick={handleConfirmImport} disabled={submitting}>
            Import quotation
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
