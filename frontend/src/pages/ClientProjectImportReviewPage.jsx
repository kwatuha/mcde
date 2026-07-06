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
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import RefreshIcon from '@mui/icons-material/Refresh';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { DataGrid } from '@mui/x-data-grid';
import apiService from '../api';
import { ROUTES } from '../configs/appConfig';
import Header from './dashboard/Header';

const ACTION_COLORS = {
  update: 'success',
  update_test_slot: 'warning',
  insert: 'info',
  review: 'default',
  skip: 'default',
};

const DEMO_REASON_LABELS = {
  seed_template: 'Seed template',
  gis_demo: 'GIS demo',
  escalation_demo: 'Escalation demo',
  nimes_import: 'NIMES import',
  name_keyword: 'Name keyword',
};

function actionLabel(action) {
  switch (action) {
    case 'update':
      return 'Update existing';
    case 'update_test_slot':
      return 'Update test slot';
    case 'insert':
      return 'Insert new';
    case 'review':
      return 'Needs review';
    default:
      return action || '—';
  }
}

function demoReasonLabel(reason) {
  return DEMO_REASON_LABELS[reason] || reason || '—';
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

function selectedRowCount(model) {
  return model?.ids?.size ?? 0;
}

export default function ClientProjectImportReviewPage() {
  const [activeTab, setActiveTab] = useState('staging');

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
  const [matchedOnly, setMatchedOnly] = useState(false);
  const [notAppliedOnly, setNotAppliedOnly] = useState(false);
  const [paginationModel, setPaginationModel] = useState({ page: 0, pageSize: 50 });
  const [rowSelectionModel, setRowSelectionModel] = useState(emptyRowSelection);
  const [confirmApply, setConfirmApply] = useState(null);
  const [applyResult, setApplyResult] = useState(null);

  const [demoSummary, setDemoSummary] = useState(null);
  const [demoRows, setDemoRows] = useState([]);
  const [demoTotal, setDemoTotal] = useState(0);
  const [demoLoading, setDemoLoading] = useState(false);
  const [demoSearch, setDemoSearch] = useState('');
  const [demoReasonFilter, setDemoReasonFilter] = useState('');
  const [demoPaginationModel, setDemoPaginationModel] = useState({ page: 0, pageSize: 50 });
  const [demoSelectionModel, setDemoSelectionModel] = useState(emptyRowSelection);
  const [voiding, setVoiding] = useState(false);
  const [confirmVoid, setConfirmVoid] = useState(null);
  const [voidResult, setVoidResult] = useState(null);

  const loadBatches = useCallback(async () => {
    const list = await apiService.clientProjectImport.listBatches();
    setBatches(list);
    if (!batch && list.length) {
      setBatch(list[0].importBatch);
    }
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
        apiService.clientProjectImport.getSummary(batch),
        apiService.clientProjectImport.listRows(batch, {
          proposedAction: actionFilter || undefined,
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
      setError(e?.response?.data?.message || e?.message || 'Failed to load staging review data.');
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [batch, actionFilter, search, matchedOnly, notAppliedOnly, paginationModel.page, paginationModel.pageSize]);

  const loadDemoData = useCallback(async () => {
    setDemoLoading(true);
    setError('');
    try {
      const [summaryData, rowsData] = await Promise.all([
        apiService.clientProjectImport.getDemoSummary(),
        apiService.clientProjectImport.listDemoProjects({
          search: demoSearch.trim() || undefined,
          reason: demoReasonFilter || undefined,
          limit: demoPaginationModel.pageSize,
          offset: demoPaginationModel.page * demoPaginationModel.pageSize,
        }),
      ]);
      setDemoSummary(summaryData);
      setDemoRows(rowsData.rows || []);
      setDemoTotal(rowsData.total || 0);
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || 'Failed to load demo projects.');
      setDemoRows([]);
      setDemoTotal(0);
    } finally {
      setDemoLoading(false);
    }
  }, [demoSearch, demoReasonFilter, demoPaginationModel.page, demoPaginationModel.pageSize]);

  useEffect(() => {
    loadBatches().catch((e) => {
      setError(e?.response?.data?.message || e?.message || 'Failed to load import batches.');
      setLoading(false);
    });
  }, [loadBatches]);

  useEffect(() => {
    if (activeTab === 'staging') loadData();
  }, [activeTab, loadData]);

  useEffect(() => {
    if (activeTab === 'demo') loadDemoData();
  }, [activeTab, loadDemoData]);

  useEffect(() => {
    setRowSelectionModel(emptyRowSelection());
  }, [batch, actionFilter, search, matchedOnly, notAppliedOnly, paginationModel.page, paginationModel.pageSize]);

  useEffect(() => {
    setDemoSelectionModel(emptyRowSelection());
  }, [demoSearch, demoReasonFilter, demoPaginationModel.page, demoPaginationModel.pageSize]);

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
  const selectedDemoCount = selectedRowCount(demoSelectionModel);

  const handleExport = async () => {
    if (!batch) return;
    setExporting(true);
    setError('');
    try {
      const response = await apiService.clientProjectImport.exportExcel(batch, {
        proposedAction: actionFilter || undefined,
        search: search.trim() || undefined,
        matchedOnly: matchedOnly || undefined,
        notAppliedOnly: notAppliedOnly || undefined,
      });
      triggerBlobDownload(response, `client-project-staging-${batch}.xlsx`);
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
    setVoidResult(null);
    try {
      const result = await apiService.clientProjectImport.applyInsert(batch, payload);
      setApplyResult(result);
      const parts = [];
      if (result.createdCount) parts.push(`${result.createdCount} created`);
      if (result.skippedCount) parts.push(`${result.skippedCount} skipped`);
      if (result.errorCount) parts.push(`${result.errorCount} failed`);
      setSuccessMessage(parts.length ? parts.join(', ') : 'No rows were processed.');
      setRowSelectionModel(emptyRowSelection());
      await Promise.all([loadData(), loadBatches()]);
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || 'Failed to create projects from staging.');
    } finally {
      setApplying(false);
      setConfirmApply(null);
    }
  };

  const runVoid = async (payload) => {
    setVoiding(true);
    setError('');
    setSuccessMessage('');
    setVoidResult(null);
    setApplyResult(null);
    try {
      const result = await apiService.clientProjectImport.voidDemoProjects(payload);
      setVoidResult(result);
      const parts = [];
      if (result.voidedCount) parts.push(`${result.voidedCount} voided`);
      if (result.skippedCount) parts.push(`${result.skippedCount} skipped`);
      if (result.errorCount) parts.push(`${result.errorCount} failed`);
      setSuccessMessage(parts.length ? parts.join(', ') : 'No projects were voided.');
      setDemoSelectionModel(emptyRowSelection());
      await loadDemoData();
      if (activeTab === 'staging' && batch) {
        await Promise.all([loadData(), loadBatches()]);
      }
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || 'Failed to void demo projects.');
    } finally {
      setVoiding(false);
      setConfirmVoid(null);
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

  const handleVoidSelected = () => {
    if (!selectedDemoCount) {
      setError('Select at least one demo project to void.');
      return;
    }
    setConfirmVoid({ mode: 'selected', count: selectedDemoCount, projectIds: selectedRowIds(demoSelectionModel) });
  };

  const handleVoidAllDemo = () => {
    if (!demoTotal) {
      setError('No demo projects found.');
      return;
    }
    setConfirmVoid({ mode: 'all', count: demoTotal });
  };

  const stagingColumns = useMemo(() => [
    { field: 'sourceRowNo', headerName: '#', width: 70 },
    { field: 'projectName', headerName: 'Client project', flex: 1.4, minWidth: 240 },
    { field: 'subCountyNorm', headerName: 'Sub-county', width: 110 },
    { field: 'wardNorm', headerName: 'Ward', width: 110 },
    { field: 'departmentNorm', headerName: 'Department', width: 150 },
    {
      field: 'proposedAction',
      headerName: 'Proposed action',
      width: 150,
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
      width: 120,
      renderCell: (params) => {
        if (!params.value) {
          return <Typography variant="body2" color="text.secondary">—</Typography>;
        }
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
      minWidth: 180,
      renderCell: (params) => {
        if (!params.row.matchProjectId) {
          return <Typography variant="body2" color="text.secondary">—</Typography>;
        }
        return (
          <Stack spacing={0.25}>
            <Typography variant="body2" noWrap title={params.value || ''}>
              {params.value || `Project #${params.row.matchProjectId}`}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              ID {params.row.matchProjectId}
              {params.row.matchScore != null ? ` · ${Math.round(params.row.matchScore * 100)}%` : ''}
              {params.row.matchMethod ? ` · ${params.row.matchMethod}` : ''}
            </Typography>
          </Stack>
        );
      },
    },
    {
      field: 'matchIsTestProject',
      headerName: 'Test?',
      width: 70,
      renderCell: (params) => (
        params.value ? <Chip size="small" label="Test" color="warning" variant="outlined" /> : '—'
      ),
    },
    {
      field: 'reviewNotes',
      headerName: 'Review notes',
      flex: 1,
      minWidth: 180,
      renderCell: (params) => (
        <Tooltip title={params.value || ''}>
          <Typography variant="caption" noWrap>{params.value || '—'}</Typography>
        </Tooltip>
      ),
    },
    {
      field: 'actions',
      headerName: '',
      width: 90,
      sortable: false,
      renderCell: (params) => (
        params.row.matchProjectId ? (
          <Button
            size="small"
            component={RouterLink}
            to={ROUTES.PROJECT_DETAILS.replace(':projectId', String(params.row.matchProjectId))}
            endIcon={<OpenInNewIcon sx={{ fontSize: 14 }} />}
          >
            Open
          </Button>
        ) : null
      ),
    },
  ], []);

  const demoColumns = useMemo(() => [
    { field: 'id', headerName: 'ID', width: 80 },
    { field: 'name', headerName: 'Project name', flex: 1.5, minWidth: 260 },
    { field: 'stateDepartment', headerName: 'Department', width: 160 },
    { field: 'subcounty', headerName: 'Sub-county', width: 110 },
    { field: 'ward', headerName: 'Ward', width: 110 },
    { field: 'status', headerName: 'Status', width: 110 },
    {
      field: 'actions',
      headerName: '',
      width: 90,
      sortable: false,
      renderCell: (params) => (
        <Button
          size="small"
          component={RouterLink}
          to={ROUTES.PROJECT_DETAILS.replace(':projectId', String(params.row.id))}
          endIcon={<OpenInNewIcon sx={{ fontSize: 14 }} />}
        >
          Open
        </Button>
      ),
    },
  ], []);

  const handleTabChange = (_, value) => {
    setActiveTab(value);
    setError('');
    setSuccessMessage('');
    setApplyResult(null);
    setVoidResult(null);
  };

  return (
    <Box>
      <Header
        title="Client project import review"
        subtitle="Review staged client data, void demo/test projects, and bulk-create county projects without matching against sample data"
      />

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}
      {successMessage && (
        <Alert
          severity={(applyResult?.errorCount || voidResult?.errorCount) ? 'warning' : 'success'}
          sx={{ mb: 2 }}
          onClose={() => setSuccessMessage('')}
        >
          {successMessage}
          {applyResult?.errors?.length > 0 && (
            <Typography variant="caption" component="div" sx={{ mt: 1, display: 'block' }}>
              First error: row {applyResult.errors[0].sourceRowNo} — {applyResult.errors[0].error}
            </Typography>
          )}
          {voidResult?.errors?.length > 0 && (
            <Typography variant="caption" component="div" sx={{ mt: 1, display: 'block' }}>
              First error: #{voidResult.errors[0].projectId} — {voidResult.errors[0].error}
            </Typography>
          )}
        </Alert>
      )}

      <Paper sx={{ mb: 2 }}>
        <Tabs value={activeTab} onChange={handleTabChange} sx={{ px: 2 }}>
          <Tab value="staging" label="Client staging" />
          <Tab value="demo" label={`Demo / test data${demoSummary?.total ? ` (${demoSummary.total})` : ''}`} />
        </Tabs>
      </Paper>

      {activeTab === 'staging' && (
        <>
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
                placeholder="Project, ward, match name…"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPaginationModel((p) => ({ ...p, page: 0 }));
                }}
                sx={{ minWidth: 220, flex: 1 }}
              />

              <FormControl size="small" sx={{ minWidth: 180 }}>
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
                  <MenuItem value="update">Update existing</MenuItem>
                  <MenuItem value="update_test_slot">Update test slot</MenuItem>
                  <MenuItem value="insert">Insert new</MenuItem>
                  <MenuItem value="review">Needs review</MenuItem>
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
              <Typography variant="caption" color="text.secondary">
                Only rows with proposed action “Insert new” and not yet applied can be selected.
              </Typography>
            </Stack>

            {selectedBatchMeta && (
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>
                Source: {selectedBatchMeta.sourceFile || '—'} · Staged {selectedBatchMeta.rowCount?.toLocaleString()} rows
                · Matched {selectedBatchMeta.matchedCount?.toLocaleString() ?? 0}
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
              columns={stagingColumns}
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
        </>
      )}

      {activeTab === 'demo' && (
        <>
          <Paper sx={{ p: 2, mb: 2 }}>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ md: 'center' }}>
              <TextField
                size="small"
                label="Search"
                placeholder="Project name, ward, department…"
                value={demoSearch}
                onChange={(e) => {
                  setDemoSearch(e.target.value);
                  setDemoPaginationModel((p) => ({ ...p, page: 0 }));
                }}
                sx={{ minWidth: 240, flex: 1 }}
              />

              <FormControl size="small" sx={{ minWidth: 180 }}>
                <InputLabel>Demo type</InputLabel>
                <Select
                  label="Demo type"
                  value={demoReasonFilter}
                  onChange={(e) => {
                    setDemoReasonFilter(e.target.value);
                    setDemoPaginationModel((p) => ({ ...p, page: 0 }));
                  }}
                >
                  <MenuItem value="">All types</MenuItem>
                  {Object.entries(DEMO_REASON_LABELS).map(([value, label]) => (
                    <MenuItem key={value} value={value}>{label}</MenuItem>
                  ))}
                </Select>
              </FormControl>

              <Button variant="outlined" startIcon={<RefreshIcon />} onClick={loadDemoData} disabled={demoLoading}>
                Refresh
              </Button>
            </Stack>

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mt: 2 }} alignItems={{ sm: 'center' }}>
              <Button
                variant="contained"
                color="error"
                startIcon={voiding ? <CircularProgress size={18} color="inherit" /> : <DeleteOutlineIcon />}
                onClick={handleVoidSelected}
                disabled={voiding || selectedDemoCount === 0}
              >
                Void selected ({selectedDemoCount})
              </Button>
              <Button
                variant="outlined"
                color="error"
                onClick={handleVoidAllDemo}
                disabled={voiding || demoTotal === 0}
              >
                Void all demo ({demoTotal.toLocaleString()})
              </Button>
              <Typography variant="caption" color="text.secondary">
                Soft-deletes projects (sets voided). Only detected demo/test/sample projects appear here.
              </Typography>
            </Stack>

            {demoSummary && (
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>
                {demoSummary.total.toLocaleString()} active demo/test projects detected
              </Typography>
            )}
          </Paper>

          {demoSummary?.reasons?.length > 0 && (
            <Stack direction="row" spacing={1} sx={{ mb: 2, flexWrap: 'wrap' }}>
              <Chip label={`${demoSummary.total} total`} />
              {demoSummary.reasons.map((item) => (
                <Chip
                  key={item.reason}
                  label={`${demoReasonLabel(item.reason)}: ${item.count}`}
                  color="warning"
                  variant={demoReasonFilter === item.reason ? 'filled' : 'outlined'}
                  onClick={() => {
                    setDemoReasonFilter((current) => (current === item.reason ? '' : item.reason));
                    setDemoPaginationModel((p) => ({ ...p, page: 0 }));
                  }}
                  clickable
                />
              ))}
            </Stack>
          )}

          <Paper sx={{ height: 640 }}>
            <DataGrid
              rows={demoRows}
              columns={demoColumns}
              getRowId={(row) => row.id}
              loading={demoLoading}
              rowCount={demoTotal}
              paginationMode="server"
              paginationModel={demoPaginationModel}
              onPaginationModelChange={setDemoPaginationModel}
              pageSizeOptions={[25, 50, 100, 200]}
              checkboxSelection
              disableRowSelectionOnClick
              disableRowSelectionExcludeModel
              rowSelectionModel={demoSelectionModel}
              onRowSelectionModelChange={setDemoSelectionModel}
              keepNonExistentRowsSelected
              density="compact"
            />
          </Paper>
        </>
      )}

      <Dialog open={Boolean(confirmApply)} onClose={() => !applying && setConfirmApply(null)}>
        <DialogTitle>
          {confirmApply?.mode === 'all' ? 'Create all insert-ready projects?' : 'Create selected projects?'}
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            {confirmApply?.mode === 'all'
              ? `This will create ${confirmApply.count.toLocaleString()} new project records from staging rows marked “Insert new” that have not been applied yet. Existing matched projects will not be changed.`
              : `This will create ${confirmApply?.count ?? 0} new project record(s) from the selected staging rows.`}
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
                runApply({ selectAllInsert: true, search: search.trim() || undefined });
              } else {
                runApply({ stagingIds: confirmApply?.stagingIds || [] });
              }
            }}
          >
            {applying ? 'Creating…' : 'Create projects'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(confirmVoid)} onClose={() => !voiding && setConfirmVoid(null)}>
        <DialogTitle>
          {confirmVoid?.mode === 'all' ? 'Void all demo projects?' : 'Void selected demo projects?'}
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            {confirmVoid?.mode === 'all'
              ? `This will soft-delete ${confirmVoid.count.toLocaleString()} demo/test projects. They will no longer appear in active project lists or match against client import staging.`
              : `This will soft-delete ${confirmVoid?.count ?? 0} selected demo/test project(s).`}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmVoid(null)} disabled={voiding}>Cancel</Button>
          <Button
            variant="contained"
            color="error"
            disabled={voiding}
            onClick={() => {
              if (confirmVoid?.mode === 'all') {
                runVoid({
                  voidAllDemo: true,
                  search: demoSearch.trim() || undefined,
                  reason: demoReasonFilter || undefined,
                });
              } else {
                runVoid({ projectIds: confirmVoid?.projectIds || [] });
              }
            }}
          >
            {voiding ? 'Voiding…' : 'Void projects'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
