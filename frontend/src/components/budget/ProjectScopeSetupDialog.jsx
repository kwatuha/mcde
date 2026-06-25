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
  LinearProgress,
  Radio,
  RadioGroup,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import ArchitectureIcon from '@mui/icons-material/Architecture';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import CategoryIcon from '@mui/icons-material/Category';
import EditNoteIcon from '@mui/icons-material/EditNote';
import DownloadIcon from '@mui/icons-material/Download';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { Link as RouterLink } from 'react-router-dom';
import procurementService from '../../api/procurementService';
import { formatCurrency } from '../../utils/helpers';

const SOURCE_OPTIONS = [
  { value: 'template', label: 'From project type', icon: CategoryIcon },
  { value: 'excel', label: 'Import Excel', icon: UploadFileIcon },
  { value: 'manual', label: 'Enter manually', icon: EditNoteIcon },
];

function scopeStatusChip(status) {
  const map = {
    none: { label: 'No scope', color: 'default' },
    draft: { label: 'Draft scope', color: 'warning' },
    planned: { label: 'Planned baseline', color: 'success' },
  };
  return map[status] || map.none;
}

export default function ProjectScopeSetupDialog({
  open,
  onClose,
  item,
  onSuccess,
}) {
  const projectId = item?.registryProjectId;
  const [source, setSource] = useState('template');
  const [scopeStatus, setScopeStatus] = useState(null);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const [templatePreview, setTemplatePreview] = useState(null);
  const [loadingTemplatePreview, setLoadingTemplatePreview] = useState(false);

  const [excelFile, setExcelFile] = useState(null);
  const [excelPreview, setExcelPreview] = useState(null);
  const [loadingExcelPreview, setLoadingExcelPreview] = useState(false);
  const [scaleToBudget, setScaleToBudget] = useState(true);
  const [confirmOverBudget, setConfirmOverBudget] = useState(false);
  const [lockBaseline, setLockBaseline] = useState(true);

  const loadStatus = useCallback(async () => {
    if (!projectId) return;
    setLoadingStatus(true);
    try {
      const data = await procurementService.getProjectScopeStatus(projectId);
      setScopeStatus(data);
    } catch {
      setScopeStatus(null);
    } finally {
      setLoadingStatus(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (!open || !projectId) return;
    setSource('template');
    setError('');
    setTemplatePreview(null);
    setExcelFile(null);
    setExcelPreview(null);
    setScaleToBudget(true);
    setConfirmOverBudget(false);
    setLockBaseline(true);
    loadStatus();
  }, [open, projectId, loadStatus]);

  const allocatedAmount = useMemo(() => {
    return Number(scopeStatus?.allocatedAmount || item?.amount || 0);
  }, [scopeStatus, item]);

  const loadTemplatePreview = useCallback(async () => {
    if (!projectId) return;
    setLoadingTemplatePreview(true);
    setError('');
    try {
      const preview = await procurementService.previewProjectScope(projectId);
      setTemplatePreview(preview);
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Failed to preview project type scope.');
      setTemplatePreview(null);
    } finally {
      setLoadingTemplatePreview(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (!open || source !== 'template' || !projectId) return;
    loadTemplatePreview();
  }, [open, source, projectId, loadTemplatePreview]);

  const handleExcelSelect = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !projectId) return;
    setExcelFile(file);
    setExcelPreview(null);
    setConfirmOverBudget(false);
    setLoadingExcelPreview(true);
    setError('');
    try {
      const preview = await procurementService.previewScopeImport(projectId, file, { scaleToBudget });
      setExcelPreview(preview);
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Failed to preview Excel import.');
    } finally {
      setLoadingExcelPreview(false);
    }
  };

  useEffect(() => {
    if (!excelFile || !projectId) return;
    let cancelled = false;
    (async () => {
      setLoadingExcelPreview(true);
      try {
        const preview = await procurementService.previewScopeImport(projectId, excelFile, { scaleToBudget });
        if (!cancelled) {
          setExcelPreview(preview);
          setConfirmOverBudget(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err?.response?.data?.message || err?.message || 'Failed to preview Excel import.');
        }
      } finally {
        if (!cancelled) setLoadingExcelPreview(false);
      }
    })();
    return () => { cancelled = true; };
  }, [scaleToBudget, excelFile, projectId]);

  const handleDownloadTemplate = async () => {
    try {
      const { blob, fileName } = await procurementService.downloadScopeImportTemplate();
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

  const handleApplyTemplate = async () => {
    if (!projectId) return;
    setSubmitting(true);
    setError('');
    try {
      const result = await procurementService.prepareProjectScope(projectId, { lockBaseline });
      onSuccess?.(result);
      onClose?.();
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Failed to apply project type scope.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmExcel = async () => {
    if (!projectId || !excelPreview) return;
    if (excelPreview.overBudget && !confirmOverBudget) {
      setError('Imported total exceeds allocated amount. Scale to budget or confirm to proceed.');
      return;
    }
    if (excelPreview.errors?.length) {
      setError('Fix Excel validation errors before importing.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const result = await procurementService.confirmScopeImport(projectId, {
        milestones: excelPreview.milestones,
        bqItems: excelPreview.bqItems,
        scaleToBudget,
        confirmOverBudget: confirmOverBudget || undefined,
        lockBaseline,
      });
      onSuccess?.(result);
      onClose?.();
    } catch (err) {
      const code = err?.response?.data?.code;
      if (code === 'OVER_BUDGET') setConfirmOverBudget(false);
      setError(err?.response?.data?.message || err?.message || 'Failed to import scope from Excel.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleLockOnly = async () => {
    if (!projectId) return;
    setSubmitting(true);
    setError('');
    try {
      const result = await procurementService.lockProjectScope(projectId);
      onSuccess?.(result);
      onClose?.();
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Failed to lock scope baseline.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!item) return null;

  const statusMeta = scopeStatusChip(scopeStatus?.scopeStatus || item?.scopeStatus);
  const templateMilestones = templatePreview?.preparedScope?.milestones || [];
  const templateBqItems = templatePreview?.preparedScope?.bqItems || [];
  const templateWouldCreate = templateMilestones.filter((m) => m.status === 'will_create').length
    + templateBqItems.filter((b) => b.status === 'will_create').length;

  const canSubmitTemplate = source === 'template' && templateWouldCreate > 0;
  const canSubmitExcel = source === 'excel' && excelPreview && !excelPreview.errors?.length
    && (!excelPreview.overBudget || confirmOverBudget);
  const canLockExisting = scopeStatus?.scopeStatus === 'draft'
    && (scopeStatus?.milestoneCount > 0 || scopeStatus?.bqItemCount > 0);

  return (
    <Dialog open={open} onClose={submitting ? undefined : onClose} fullWidth maxWidth="md">
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <ArchitectureIcon color="primary" />
        Setup project scope &amp; costs
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Alert severity="info">
            Define milestones and bill-of-quantities (BQ) for this registry project before procurement.
          </Alert>

          <Box>
            <Typography variant="subtitle2" color="text.secondary">Registry project</Typography>
            <Typography variant="body1" fontWeight={600}>
              {item.registryProjectName || `Project #${projectId}`}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Budget line: {item.projectName || '—'}
              {item.budgetName ? ` · ${item.budgetName}` : ''}
            </Typography>
          </Box>

          {loadingStatus && <LinearProgress />}

          {scopeStatus && (
            <Box sx={{ p: 2, borderRadius: 1, border: 1, borderColor: 'divider', bgcolor: 'action.hover' }}>
              <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                <Chip size="small" label={statusMeta.label} color={statusMeta.color} />
                <Chip size="small" variant="outlined" label={`${scopeStatus.milestoneCount || 0} milestones`} />
                <Chip size="small" variant="outlined" label={`${scopeStatus.bqItemCount || 0} BQ lines`} />
                <Chip
                  size="small"
                  variant="outlined"
                  label={`BQ total ${formatCurrency(Number(scopeStatus.bqBudgetAmount || 0))}`}
                />
              </Stack>
              <Typography variant="body2" sx={{ mt: 1 }}>
                Allocated: <strong>{formatCurrency(allocatedAmount)}</strong>
                {scopeStatus.overBudget && (
                  <Typography component="span" color="error.main" sx={{ ml: 1 }}>
                    (over allocated amount)
                  </Typography>
                )}
              </Typography>
            </Box>
          )}

          <Box>
            <Typography variant="subtitle2" fontWeight={700} gutterBottom>How do you want to build scope?</Typography>
            <RadioGroup row value={source} onChange={(e) => setSource(e.target.value)}>
              {SOURCE_OPTIONS.map((opt) => (
                <FormControlLabel
                  key={opt.value}
                  value={opt.value}
                  control={<Radio size="small" />}
                  label={opt.label}
                />
              ))}
            </RadioGroup>
          </Box>

          {source === 'template' && (
            <Box>
              {loadingTemplatePreview && <LinearProgress sx={{ mb: 1 }} />}
              {templatePreview && (
                <Stack spacing={1}>
                  <Typography variant="body2">
                    Project type: <strong>{templatePreview.categoryName || 'Not set'}</strong>
                  </Typography>
                  {!templatePreview.categoryName && (
                    <Alert severity="warning">
                      Set a project type on the registry project first, or use Excel import instead.
                    </Alert>
                  )}
                  <Typography variant="body2" color="text.secondary">
                    {templateWouldCreate > 0
                      ? `Will create ${templateWouldCreate} new milestone/BQ line(s). Existing lines are left unchanged.`
                      : 'No new lines to create from the project type (already applied or no templates).'}
                  </Typography>
                  {templateWouldCreate > 0 && (
                    <TableContainer sx={{ maxHeight: 220 }}>
                      <Table size="small" stickyHeader>
                        <TableHead>
                          <TableRow>
                            <TableCell>Type</TableCell>
                            <TableCell>Name</TableCell>
                            <TableCell>Status</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {templateMilestones.filter((m) => m.status === 'will_create').slice(0, 8).map((m) => (
                            <TableRow key={`m-${m.name}`}>
                              <TableCell>Milestone</TableCell>
                              <TableCell>{m.name}</TableCell>
                              <TableCell><Chip size="small" label="new" color="primary" /></TableCell>
                            </TableRow>
                          ))}
                          {templateBqItems.filter((b) => b.status === 'will_create').slice(0, 8).map((b) => (
                            <TableRow key={`b-${b.activityName}-${b.milestoneName}`}>
                              <TableCell>BQ</TableCell>
                              <TableCell>{b.activityName}{b.milestoneName ? ` (${b.milestoneName})` : ''}</TableCell>
                              <TableCell><Chip size="small" label="new" color="primary" /></TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  )}
                </Stack>
              )}
            </Box>
          )}

          {source === 'excel' && (
            <Box>
              <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
                <Button size="small" variant="outlined" startIcon={<DownloadIcon />} onClick={handleDownloadTemplate}>
                  Download template
                </Button>
                <Button size="small" variant="contained" component="label" startIcon={<UploadFileIcon />}>
                  Choose Excel file
                  <input type="file" hidden accept=".xlsx,.xls" onChange={handleExcelSelect} />
                </Button>
              </Stack>
              <FormControlLabel
                control={(
                  <Checkbox
                    size="small"
                    checked={scaleToBudget}
                    onChange={(e) => setScaleToBudget(e.target.checked)}
                  />
                )}
                label="Scale imported BQ amounts to project allocated amount"
              />
              {loadingExcelPreview && <LinearProgress sx={{ my: 1 }} />}
              {excelFile && (
                <Typography variant="caption" color="text.secondary" display="block">
                  File: {excelFile.name}
                </Typography>
              )}
              {excelPreview?.errors?.length > 0 && (
                <Alert severity="error" sx={{ mt: 1 }}>
                  {excelPreview.errors.map((msg) => <div key={msg}>{msg}</div>)}
                </Alert>
              )}
              {excelPreview && !excelPreview.errors?.length && (
                <Alert severity={excelPreview.overBudget ? 'warning' : 'success'} sx={{ mt: 1 }}>
                  Import total: <strong>{formatCurrency(Number(excelPreview.importTotal || 0))}</strong>
                  {excelPreview.scaled ? ' (scaled to allocation)' : ''}
                  {' · '}
                  {excelPreview.milestones?.length || 0} milestone(s), {excelPreview.bqItems?.length || 0} BQ line(s)
                </Alert>
              )}
              {excelPreview?.overBudget && (
                <Alert severity="warning" icon={<WarningAmberIcon />} sx={{ mt: 1 }}>
                  Import exceeds allocated amount ({formatCurrency(allocatedAmount)}).
                  <FormControlLabel
                    sx={{ mt: 0.5, display: 'flex' }}
                    control={(
                      <Checkbox
                        size="small"
                        checked={confirmOverBudget}
                        onChange={(e) => setConfirmOverBudget(e.target.checked)}
                      />
                    )}
                    label="Proceed anyway (over budget)"
                  />
                </Alert>
              )}
            </Box>
          )}

          {source === 'manual' && (
            <Alert severity="info">
              Add milestones and BQ lines directly on the project details page under the BQ tab, then return here to lock the planned baseline.
              {' '}
              <Button
                component={RouterLink}
                to={`/projects/${projectId}`}
                size="small"
                variant="text"
                onClick={onClose}
              >
                Open project
              </Button>
            </Alert>
          )}

          <FormControlLabel
            control={(
              <Checkbox
                size="small"
                checked={lockBaseline}
                onChange={(e) => setLockBaseline(e.target.checked)}
              />
            )}
            label="Lock as planned baseline after applying (recommended before tendering)"
          />

          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} disabled={submitting}>Cancel</Button>
        {canLockExisting && source === 'manual' && (
          <Button variant="outlined" onClick={handleLockOnly} disabled={submitting}>
            Lock baseline
          </Button>
        )}
        {source === 'template' && (
          <Button
            variant="contained"
            onClick={handleApplyTemplate}
            disabled={submitting || !canSubmitTemplate}
            startIcon={submitting ? <CircularProgress size={18} color="inherit" /> : <CategoryIcon />}
          >
            Apply project type
          </Button>
        )}
        {source === 'excel' && (
          <Button
            variant="contained"
            onClick={handleConfirmExcel}
            disabled={submitting || !canSubmitExcel}
            startIcon={submitting ? <CircularProgress size={18} color="inherit" /> : <UploadFileIcon />}
          >
            Import scope
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
