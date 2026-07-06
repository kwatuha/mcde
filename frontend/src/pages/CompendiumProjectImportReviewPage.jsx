import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import RefreshIcon from '@mui/icons-material/Refresh';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import { DataGrid } from '@mui/x-data-grid';
import apiService from '../api';
import { ROUTES } from '../configs/appConfig';
import Header from './dashboard/Header';

const ACTION_COLORS = {
  update: 'success',
  update_test_slot: 'warning',
  insert: 'info',
  review: 'default',
};

function actionLabel(action) {
  switch (action) {
    case 'update': return 'Update existing';
    case 'update_test_slot': return 'Update test slot';
    case 'insert': return 'Insert new';
    case 'review': return 'Needs review';
    default: return action || '—';
  }
}

function fundingLabel(value) {
  if (value === 'rri') return 'RRI';
  if (value === 'development') return 'Development';
  return value || '—';
}

function formatCost(value) {
  if (value == null || value === '') return '—';
  const num = Number(value);
  if (!Number.isFinite(num)) return String(value);
  return num.toLocaleString('en-KE', { maximumFractionDigits: 0 });
}

function triggerBlobDownload(response, fallbackName) {
  const blob = response?.data instanceof Blob ? response.data : new Blob([response?.data || '']);
  const disposition = response?.headers?.['content-disposition'] || '';
  const match = disposition.match(/filename="?([^"]+)"?/i);
  const filename = match?.[1] || fallbackName;
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function isInsertSelectable(row) {
  return row.proposedAction === 'insert' && !row.appliedProjectId;
}

function emptyRowSelection() {
  return { type: 'include', ids: new Set() };
}

function selectedRowIds(model) {
  if (!model?.ids) return [];
  return [...model.ids];
}

export default function CompendiumProjectImportReviewPage() {
  const [batches, setBatches] = useState([]);
  const [batch, setBatch] = useState('');
  const [summary, setSummary] = useState(null);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [fundingFilter, setFundingFilter] = useState('');
  const [matchedOnly, setMatchedOnly] = useState(false);
  const [notAppliedOnly, setNotAppliedOnly] = useState(false);
  const [paginationModel, setPaginationModel] = useState({ page: 0, pageSize: 50 });
  const [rowSelectionModel, setRowSelectionModel] = useState(emptyRowSelection);
  const [confirmApply, setConfirmApply] = useState(null);
  const [applyResult, setApplyResult] = useState(null);

  const loadBatches = useCallback(async () => {
    const list = await apiService.compendiumProjectImport.listBatches();
    setBatches(list);
    if (!batch && list.length) setBatch(list[0].importBatch);
    return list;
  }, [batch]);

  const loadData = useCallback(async () => {
    if (!batch) {
      setRows([]);
      setTotal(0);
      setSummary(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const [summaryData, rowsData] = await Promise.all([
        apiService.compendiumProjectImport.getSummary(batch),
        apiService.compendiumProjectImport.listRows(batch, {
          proposedAction: actionFilter || undefined,
          fundingClass: fundingFilter || undefined,
          search: search.trim() || undefined,
          matchedOnly: matchedOnly || undefined,
          notAppliedOnly: notAppliedOnly || undefined,
          limit: paginationModel.pageSize,
          offset: paginationModel.page * paginationModel.pageSize,
        }),
      ]);
      setSummary(summaryData);
      setRows(rowsData.rows || []);
      setTotal(rowsData.total || 0);
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || 'Failed to load compendium staging data.');
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [batch, actionFilter, fundingFilter, search, matchedOnly, notAppliedOnly, paginationModel.page, paginationModel.pageSize]);

  useEffect(() => {
    loadBatches().catch((e) => {
      setError(e?.response?.data?.message || e?.message || 'Failed to load import batches.');
      setLoading(false);
    });
  }, [loadBatches]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    setRowSelectionModel(emptyRowSelection());
  }, [batch, actionFilter, fundingFilter, search, matchedOnly, notAppliedOnly, paginationModel.page, paginationModel.pageSize]);

  const selectedBatchMeta = useMemo(
    () => batches.find((b) => b.importBatch === batch) || null,
    [batches, batch],
  );

  const insertReadyCount = selectedBatchMeta?.insertReadyCount ?? 0;
  const notAppliedCount = selectedBatchMeta?.notAppliedCount ?? 0;
  const selectedInsertCount = useMemo(() => {
    const selectedIds = new Set(selectedRowIds(rowSelectionModel));
    return rows.filter((row) => selectedIds.has(row.id) && isInsertSelectable(row)).length;
  }, [rows, rowSelectionModel]);

  const handleExport = async () => {
    if (!batch) return;
    setExporting(true);
    setError('');
    try {
      const response = await apiService.compendiumProjectImport.exportExcel(batch, {
        proposedAction: actionFilter || undefined,
        fundingClass: fundingFilter || undefined,
        search: search.trim() || undefined,
        matchedOnly: matchedOnly || undefined,
        notAppliedOnly: notAppliedOnly || undefined,
      });
      triggerBlobDownload(response, `compendium-staging-${batch}.xlsx`);
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || 'Excel export failed.');
    } finally {
      setExporting(false);
    }
  };

  const runApply = async (payload) => {
    if (!batch) return;
    setApplying(true);
    setError('');
    setSuccessMessage('');
    setApplyResult(null);
    try {
      const result = await apiService.compendiumProjectImport.applyInsert(batch, payload);
      setApplyResult(result);
      const parts = [];
      if (result.createdCount) parts.push(`${result.createdCount} created`);
      if (result.skippedCount) parts.push(`${result.skippedCount} skipped`);
      if (result.errorCount) parts.push(`${result.errorCount} failed`);
      setSuccessMessage(parts.length ? parts.join(', ') : 'No rows were processed.');
      setRowSelectionModel(emptyRowSelection());
      await Promise.all([loadData(), loadBatches()]);
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || 'Failed to create projects from compendium staging.');
    } finally {
      setApplying(false);
      setConfirmApply(null);
    }
  };

  const handleApplySelected = () => {
    const stagingIds = selectedRowIds(rowSelectionModel).filter((id) => {
      const row = rows.find((r) => r.id === id);
      return row && isInsertSelectable(row);
    });
    if (!stagingIds.length) {
      setError('Select at least one row marked “Insert new” that has not been applied yet.');
      return;
    }
    setConfirmApply({ mode: 'selected', count: stagingIds.length, stagingIds });
  };

  const handleApplyAllReady = () => {
    if (!insertReadyCount) {
      setError('No insert-ready rows remain in this batch.');
      return;
    }
    setConfirmApply({ mode: 'all', count: insertReadyCount });
  };

  const columns = useMemo(() => [
    { field: 'sourceRowNo', headerName: '#', width: 70 },
    { field: 'projectName', headerName: 'Project', flex: 1.4, minWidth: 240 },
    { field: 'financialYearNorm', headerName: 'FY', width: 95 },
    {
      field: 'approvedCostNorm',
      headerName: 'Approved cost',
      width: 120,
      renderCell: (params) => (
        <Typography variant="body2">{formatCost(params.value)}</Typography>
      ),
    },
    {
      field: 'fundingClass',
      headerName: 'Funding',
      width: 110,
      renderCell: (params) => (
        <Chip
          size="small"
          label={fundingLabel(params.value)}
          color={params.value === 'rri' ? 'secondary' : 'default'}
          variant="outlined"
        />
      ),
    },
    { field: 'subCountyNorm', headerName: 'Sub-county', width: 110 },
    { field: 'wardNorm', headerName: 'Ward', width: 110 },
    { field: 'departmentNorm', headerName: 'Department', width: 150 },
    {
      field: 'projectStatusNorm',
      headerName: 'Status',
      width: 110,
      renderCell: (params) => (
        <Typography variant="caption">{params.value || params.row.projectStatusRaw || '—'}</Typography>
      ),
    },
    {
      field: 'proposedAction',
      headerName: 'Action',
      width: 130,
      renderCell: (params) => (
        <Chip
          size="small"
          label={actionLabel(params.value)}
          color={ACTION_COLORS[params.value] || 'default'}
          variant={params.value === 'review' ? 'outlined' : 'filled'}
        />
      ),
    },
    {
      field: 'appliedProjectId',
      headerName: 'Applied',
      width: 110,
      renderCell: (params) => {
        if (!params.value) return <Typography variant="body2" color="text.secondary">—</Typography>;
        return (
          <Button
            size="small"
            component={RouterLink}
            to={ROUTES.PROJECT_DETAILS.replace(':projectId', String(params.value))}
            endIcon={<OpenInNewIcon sx={{ fontSize: 14 }} />}
          >
            #{params.value}
          </Button>
        );
      },
    },
    {
      field: 'matchProjectName',
      headerName: 'Matched project',
      flex: 1,
      minWidth: 160,
      renderCell: (params) => {
        if (!params.row.matchProjectId) {
          return <Typography variant="body2" color="text.secondary">—</Typography>;
        }
        return (
          <Typography variant="body2" noWrap title={params.value || ''}>
            {params.value || `Project #${params.row.matchProjectId}`}
          </Typography>
        );
      },
    },
    {
      field: 'reviewNotes',
      headerName: 'Notes',
      flex: 1,
      minWidth: 140,
      renderCell: (params) => (
        <Tooltip title={params.value || ''}>
          <Typography variant="caption" noWrap>{params.value || '—'}</Typography>
        </Tooltip>
      ),
    },
  ], []);

  return (
    <Box>
      <Header
        title="Compendium project import review"
        subtitle="Review staged FY 2022/23–2024/25 compendium rows, financial year and approved cost, then bulk-create projects"
      />

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}
      {!loading && batches.length === 0 && (
        <Alert severity="info" sx={{ mb: 2 }}>
          No compendium import batches are loaded yet. On the server, copy the Excel file into the API container and run:
          {' '}
          <code>npm run stage:machakos-compendium-projects -- --apply --file=/tmp/CombendiumOfProjects.xlsx</code>
        </Alert>
      )}
      {successMessage && (
        <Alert severity={applyResult?.errorCount ? 'warning' : 'success'} sx={{ mb: 2 }} onClose={() => setSuccessMessage('')}>
          {successMessage}
          {applyResult?.errors?.length > 0 && (
            <Typography variant="caption" component="div" sx={{ mt: 1, display: 'block' }}>
              First error: row {applyResult.errors[0].sourceRowNo} — {applyResult.errors[0].error}
            </Typography>
          )}
        </Alert>
      )}

      <Paper sx={{ p: 2, mb: 2 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ md: 'center' }}>
          <FormControl size="small" sx={{ minWidth: 280 }}>
            <InputLabel>Import batch</InputLabel>
            <Select
              label="Import batch"
              value={batch}
              onChange={(e) => {
                setBatch(e.target.value);
                setPaginationModel((p) => ({ ...p, page: 0 }));
              }}
            >
              {batches.map((b) => (
                <MenuItem key={b.importBatch} value={b.importBatch}>
                  {b.importBatch} ({b.rowCount} rows)
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <TextField
            size="small"
            label="Search"
            placeholder="Project, ward, FY…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPaginationModel((p) => ({ ...p, page: 0 }));
            }}
            sx={{ minWidth: 220, flex: 1 }}
          />

          <FormControl size="small" sx={{ minWidth: 160 }}>
            <InputLabel>Proposed action</InputLabel>
            <Select
              label="Proposed action"
              value={actionFilter}
              onChange={(e) => {
                setActionFilter(e.target.value);
                setPaginationModel((p) => ({ ...p, page: 0 }));
              }}
            >
              <MenuItem value="">All</MenuItem>
              <MenuItem value="insert">Insert new</MenuItem>
              <MenuItem value="update">Update existing</MenuItem>
              <MenuItem value="review">Needs review</MenuItem>
            </Select>
          </FormControl>

          <FormControl size="small" sx={{ minWidth: 140 }}>
            <InputLabel>Funding</InputLabel>
            <Select
              label="Funding"
              value={fundingFilter}
              onChange={(e) => {
                setFundingFilter(e.target.value);
                setPaginationModel((p) => ({ ...p, page: 0 }));
              }}
            >
              <MenuItem value="">All</MenuItem>
              <MenuItem value="development">Development</MenuItem>
              <MenuItem value="rri">RRI</MenuItem>
            </Select>
          </FormControl>

          <Chip
            label={matchedOnly ? 'Matched only' : 'All rows'}
            color={matchedOnly ? 'primary' : 'default'}
            onClick={() => {
              setMatchedOnly((v) => !v);
              setPaginationModel((p) => ({ ...p, page: 0 }));
            }}
            clickable
            variant={matchedOnly ? 'filled' : 'outlined'}
          />

          <Chip
            label={`Not applied (${notAppliedCount.toLocaleString()})`}
            color={notAppliedOnly ? 'primary' : 'default'}
            onClick={() => {
              setNotAppliedOnly((v) => !v);
              setPaginationModel((p) => ({ ...p, page: 0 }));
            }}
            clickable
            variant={notAppliedOnly ? 'filled' : 'outlined'}
          />

          <Button variant="outlined" startIcon={<RefreshIcon />} onClick={loadData} disabled={loading}>
            Refresh
          </Button>
          <Button
            variant="contained"
            startIcon={exporting ? <CircularProgress size={18} color="inherit" /> : <DownloadIcon />}
            onClick={handleExport}
            disabled={!batch || exporting}
          >
            Export Excel
          </Button>
        </Stack>

        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mt: 2 }} alignItems={{ sm: 'center' }}>
          <Button
            variant="contained"
            color="success"
            startIcon={applying ? <CircularProgress size={18} color="inherit" /> : <AddCircleOutlineIcon />}
            onClick={handleApplySelected}
            disabled={!batch || applying || selectedInsertCount === 0}
          >
            Create selected ({selectedInsertCount})
          </Button>
          <Button
            variant="outlined"
            color="success"
            onClick={handleApplyAllReady}
            disabled={!batch || applying || insertReadyCount === 0}
          >
            Create all insert-ready ({insertReadyCount.toLocaleString()})
          </Button>
        </Stack>

        {selectedBatchMeta && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>
            Source: {selectedBatchMeta.sourceFile || '—'} · Staged {selectedBatchMeta.rowCount?.toLocaleString()} rows
            · RRI {selectedBatchMeta.rriCount?.toLocaleString() ?? 0}
            · Applied {selectedBatchMeta.appliedCount?.toLocaleString() ?? 0}
            · Not applied {notAppliedCount.toLocaleString()}
            · Insert-ready {insertReadyCount.toLocaleString()}
          </Typography>
        )}
      </Paper>

      {summary?.actions?.length > 0 && (
        <Stack direction="row" spacing={1} sx={{ mb: 2, flexWrap: 'wrap' }}>
          <Chip label={`${summary.total} total`} />
          {summary.actions.map((item) => (
            <Chip
              key={item.proposed_action}
              label={`${actionLabel(item.proposed_action)}: ${item.count}`}
              color={ACTION_COLORS[item.proposed_action] || 'default'}
              variant={actionFilter === item.proposed_action ? 'filled' : 'outlined'}
              onClick={() => {
                setActionFilter((current) => (current === item.proposed_action ? '' : item.proposed_action));
                setPaginationModel((p) => ({ ...p, page: 0 }));
              }}
              clickable
            />
          ))}
        </Stack>
      )}

      <Paper sx={{ height: 640 }}>
        <DataGrid
          rows={rows}
          columns={columns}
          getRowId={(row) => row.id}
          loading={loading}
          rowCount={total}
          paginationMode="server"
          paginationModel={paginationModel}
          onPaginationModelChange={setPaginationModel}
          pageSizeOptions={[25, 50, 100, 200]}
          checkboxSelection
          disableRowSelectionOnClick
          disableRowSelectionExcludeModel
          rowSelectionModel={rowSelectionModel}
          onRowSelectionModelChange={setRowSelectionModel}
          isRowSelectable={(params) => isInsertSelectable(params.row)}
          keepNonExistentRowsSelected
          density="compact"
        />
      </Paper>

      <Dialog open={Boolean(confirmApply)} onClose={() => !applying && setConfirmApply(null)}>
        <DialogTitle>
          {confirmApply?.mode === 'all' ? 'Create all insert-ready projects?' : 'Create selected projects?'}
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            {confirmApply?.mode === 'all'
              ? `This will create ${confirmApply.count.toLocaleString()} new project records from compendium staging rows marked “Insert new”. Financial year and approved cost will be saved on each project.`
              : `This will create ${confirmApply?.count ?? 0} new project record(s) from the selected compendium rows.`}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmApply(null)} disabled={applying}>Cancel</Button>
          <Button
            variant="contained"
            color="success"
            disabled={applying}
            onClick={() => {
              if (confirmApply?.mode === 'all') {
                runApply({
                  selectAllInsert: true,
                  search: search.trim() || undefined,
                  fundingClass: fundingFilter || undefined,
                });
              } else {
                runApply({ stagingIds: confirmApply?.stagingIds || [] });
              }
            }}
          >
            {applying ? 'Creating…' : 'Create projects'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
