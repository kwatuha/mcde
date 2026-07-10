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
  Autocomplete,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import RefreshIcon from '@mui/icons-material/Refresh';
import ManageSearchIcon from '@mui/icons-material/ManageSearch';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import { DataGrid } from '@mui/x-data-grid';
import apiService from '../api';
import { ROUTES } from '../configs/appConfig';
import Header from './dashboard/Header';
import { usePersistedDataGridColumnWidths } from '../hooks/usePersistedDataGridColumnWidths';
import { formatMetadataResolutionSaveMessage } from '../components/import/ImportMetadataResolutionsPanel';

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

const METADATA_ISSUE_LABELS = {
  meta_missing_subcounty: 'Sub-county missing',
  meta_unresolved_subcounty: 'Sub-county not in catalog',
  meta_missing_ward: 'Ward missing',
  meta_unresolved_ward: 'Ward not in catalog',
  meta_missing_department: 'Department missing',
  meta_unresolved_department: 'Department not in catalog',
};

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

function resolutionKey(item) {
  return `${item.fieldType}:${item.sourceKey}`;
}

function formatScore(value) {
  if (value == null || Number.isNaN(Number(value))) return '—';
  return `${Math.round(Number(value) * 100)}%`;
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
  const [metadataIssuesOnly, setMetadataIssuesOnly] = useState(false);
  const [refreshingMetadata, setRefreshingMetadata] = useState(false);
  const [paginationModel, setPaginationModel] = useState({ page: 0, pageSize: 50 });
  const [rowSelectionModel, setRowSelectionModel] = useState(emptyRowSelection);
  const [confirmApply, setConfirmApply] = useState(null);
  const [applyResult, setApplyResult] = useState(null);
  const [activeTab, setActiveTab] = useState('staging');
  const [metadataSuggestions, setMetadataSuggestions] = useState([]);
  const [metadataCatalogs, setMetadataCatalogs] = useState({ subcounty: [], ward: [], department: [] });
  const [metadataSummary, setMetadataSummary] = useState(null);
  const [metadataLoading, setMetadataLoading] = useState(false);
  const [savingResolutions, setSavingResolutions] = useState(false);
  const [resolutionDrafts, setResolutionDrafts] = useState({});
  const { onColumnWidthChange: onMetadataColumnWidthChange, getWidth: getMetadataColumnWidth } = usePersistedDataGridColumnWidths('compendium-import-metadata-resolution-columns');

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
          metadataIssuesOnly: metadataIssuesOnly || undefined,
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
  }, [batch, actionFilter, fundingFilter, search, matchedOnly, notAppliedOnly, metadataIssuesOnly, paginationModel.page, paginationModel.pageSize]);

  const loadMetadataSuggestions = useCallback(async () => {
    if (!batch) {
      setMetadataSuggestions([]);
      setMetadataSummary(null);
      setMetadataCatalogs({ subcounty: [], ward: [], department: [] });
      setMetadataLoading(false);
      return;
    }
    setMetadataLoading(true);
    setError('');
    try {
      const data = await apiService.compendiumProjectImport.listMetadataSuggestions(batch);
      setMetadataSuggestions(data.suggestions || []);
      setMetadataSummary(data);
      setMetadataCatalogs(data.catalogs || { subcounty: [], ward: [], department: [] });
      setResolutionDrafts({});
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || 'Failed to load metadata suggestions.');
      setMetadataSuggestions([]);
      setMetadataSummary(null);
    } finally {
      setMetadataLoading(false);
    }
  }, [batch]);

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
    if (activeTab === 'metadata') loadMetadataSuggestions();
  }, [activeTab, loadMetadataSuggestions]);

  useEffect(() => {
    setRowSelectionModel(emptyRowSelection());
  }, [batch, actionFilter, fundingFilter, search, matchedOnly, notAppliedOnly, metadataIssuesOnly, paginationModel.page, paginationModel.pageSize]);

  const selectedBatchMeta = useMemo(
    () => batches.find((b) => b.importBatch === batch) || null,
    [batches, batch],
  );

  const insertReadyCount = selectedBatchMeta?.insertReadyCount ?? 0;
  const notAppliedCount = selectedBatchMeta?.notAppliedCount ?? 0;
  const metadataIssuesCount = selectedBatchMeta?.metadataIssuesCount ?? 0;
  const metadataScannedCount = selectedBatchMeta?.metadataScannedCount ?? 0;
  const needsMetadataScan = Boolean(selectedBatchMeta?.rowCount) && metadataScannedCount === 0;
  const metadataTabCount = metadataSummary?.unresolvedCount ?? metadataIssuesCount;
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
        metadataIssuesOnly: metadataIssuesOnly || undefined,
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

  const handleRefreshMetadata = async () => {
    if (!batch) return;
    setRefreshingMetadata(true);
    setError('');
    setSuccessMessage('');
    try {
      const result = await apiService.compendiumProjectImport.refreshMetadata(batch);
      setSuccessMessage(`Metadata check updated: ${result.withIssues?.toLocaleString() ?? 0} of ${result.total?.toLocaleString() ?? 0} rows have unresolved catalog fields.`);
      await Promise.all([loadBatches(), activeTab === 'staging' ? loadData() : Promise.resolve(), activeTab === 'metadata' ? loadMetadataSuggestions() : Promise.resolve()]);
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || 'Failed to refresh metadata remarks.');
    } finally {
      setRefreshingMetadata(false);
    }
  };

  const pendingResolutionCount = useMemo(() => (
    metadataSuggestions.filter((item) => {
      const key = resolutionKey(item);
      const draft = resolutionDrafts[key];
      const nextValue = draft !== undefined ? draft : item.resolvedValue;
      return nextValue && nextValue !== item.resolvedValue;
    }).length
  ), [metadataSuggestions, resolutionDrafts]);

  const handleAcceptAllSuggestions = () => {
    const next = {};
    metadataSuggestions.forEach((item) => {
      if (!item.isResolved && item.suggestedValue) {
        next[resolutionKey(item)] = item.suggestedValue;
      }
    });
    setResolutionDrafts((current) => ({ ...current, ...next }));
  };

  const handleSaveResolutions = async () => {
    if (!batch) return;
    const resolutions = metadataSuggestions
      .map((item) => {
        const key = resolutionKey(item);
        const draft = resolutionDrafts[key];
        const resolvedValue = draft !== undefined ? draft : '';
        if (!resolvedValue || resolvedValue === item.resolvedValue) return null;
        return {
          fieldType: item.fieldType,
          sourceKey: item.sourceKey,
          foundValue: item.foundValue,
          resolvedValue,
        };
      })
      .filter(Boolean);

    if (!resolutions.length) {
      setError('Choose at least one catalog match to save.');
      return;
    }

    setSavingResolutions(true);
    setError('');
    setSuccessMessage('');
    try {
      const result = await apiService.compendiumProjectImport.saveMetadataResolutions(batch, resolutions);
      setSuccessMessage(formatMetadataResolutionSaveMessage(result));
      await Promise.all([loadBatches(), loadMetadataSuggestions(), activeTab === 'staging' ? loadData() : Promise.resolve()]);
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || 'Failed to save metadata resolutions.');
    } finally {
      setSavingResolutions(false);
    }
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
      field: 'metadataRemarks',
      headerName: 'Metadata remarks',
      flex: 1.2,
      minWidth: 240,
      renderCell: (params) => {
        const codes = String(params.value || '').split(';').filter(Boolean);
        if (!codes.length) {
          return <Typography variant="body2" color="text.secondary">—</Typography>;
        }
        return (
          <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap', py: 0.5 }}>
            {codes.map((code) => (
              <Chip
                key={code}
                size="small"
                color="warning"
                variant="outlined"
                label={METADATA_ISSUE_LABELS[code] || code}
              />
            ))}
          </Stack>
        );
      },
    },
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

  const metadataRows = useMemo(
    () => metadataSuggestions.map((item) => {
      const key = resolutionKey(item);
      const draft = resolutionDrafts[key];
      const draftValue = draft !== undefined ? draft : (item.resolvedValue || '');
      return {
        id: key,
        ...item,
        draftValue,
        catalogOptions: metadataCatalogs[item.fieldType] || [],
        hasPendingChange: Boolean(draftValue && draftValue !== item.resolvedValue),
      };
    }),
    [metadataSuggestions, resolutionDrafts, metadataCatalogs],
  );

  const metadataColumns = useMemo(() => [
    {
      field: 'fieldLabel',
      headerName: 'Field',
      width: getMetadataColumnWidth('fieldLabel'),
      minWidth: 72,
    },
    {
      field: 'foundValue',
      headerName: 'Found in import',
      width: getMetadataColumnWidth('foundValue'),
      minWidth: 100,
      renderCell: (params) => (
        params.value
          ? <Typography variant="body2" noWrap>{params.value}</Typography>
          : <Typography variant="body2" color="text.secondary">(missing)</Typography>
      ),
    },
    {
      field: 'suggestedValue',
      headerName: 'Suggested match',
      width: getMetadataColumnWidth('suggestedValue'),
      minWidth: 120,
      sortable: false,
      renderCell: (params) => {
        const item = params.row;
        if (!item.suggestedValue) return '—';
        return (
          <Stack direction="row" spacing={0.5} alignItems="center" sx={{ minWidth: 0, width: '100%' }}>
            <Typography variant="body2" noWrap sx={{ flex: 1, minWidth: 0 }}>{item.suggestedValue}</Typography>
            <Chip size="small" label={formatScore(item.suggestedScore)} variant="outlined" />
            {!item.isResolved && (
              <Button
                size="small"
                onClick={() => setResolutionDrafts((current) => ({
                  ...current,
                  [resolutionKey(item)]: item.suggestedValue,
                }))}
              >
                Use
              </Button>
            )}
          </Stack>
        );
      },
    },
    {
      field: 'rowCount',
      headerName: 'Rows',
      width: getMetadataColumnWidth('rowCount'),
      minWidth: 56,
      type: 'number',
      align: 'right',
      headerAlign: 'right',
      valueFormatter: (value) => (value != null ? Number(value).toLocaleString() : '0'),
    },
    {
      field: 'resolveTo',
      headerName: 'Resolve to',
      width: getMetadataColumnWidth('resolveTo'),
      minWidth: 160,
      sortable: false,
      renderCell: (params) => {
        const item = params.row;
        const key = resolutionKey(item);
        return (
          <Autocomplete
            size="small"
            fullWidth
            options={item.catalogOptions || []}
            value={item.draftValue || null}
            onChange={(_event, value) => {
              setResolutionDrafts((current) => ({
                ...current,
                [key]: value || '',
              }));
            }}
            renderInput={(autocompleteParams) => (
              <TextField {...autocompleteParams} placeholder="Choose catalog value" />
            )}
            sx={{ minWidth: 0 }}
          />
        );
      },
    },
    {
      field: 'status',
      headerName: 'Status',
      width: getMetadataColumnWidth('status'),
      minWidth: 88,
      sortable: false,
      renderCell: (params) => {
        const item = params.row;
        if (item.hasPendingChange) {
          return <Chip size="small" color="info" label="Pending save" />;
        }
        if (item.isResolved) {
          return <Chip size="small" color="success" label="Resolved" />;
        }
        return <Chip size="small" color="warning" variant="outlined" label="Unresolved" />;
      },
    },
  ], [getMetadataColumnWidth]);

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

      {batch && selectedBatchMeta?.rowCount > 0 && activeTab === 'staging' && (
        <Alert
          severity={needsMetadataScan ? 'info' : metadataIssuesCount > 0 ? 'warning' : 'success'}
          sx={{ mb: 2 }}
          action={(
            <Button
              color="inherit"
              size="small"
              variant="outlined"
              startIcon={refreshingMetadata ? <CircularProgress size={16} color="inherit" /> : <ManageSearchIcon />}
              onClick={handleRefreshMetadata}
              disabled={refreshingMetadata}
            >
              {refreshingMetadata ? 'Scanning…' : 'Scan metadata'}
            </Button>
          )}
        >
          {needsMetadataScan ? (
            <>
              <strong>Metadata scan not run yet.</strong>
              {' '}
              Scan sub-county, ward, and department values against system catalogs to flag rows that may need review before import.
            </>
          ) : metadataIssuesCount > 0 ? (
            <>
              <strong>{metadataIssuesCount.toLocaleString()} rows</strong>
              {' '}
              have unresolved sub-county, ward, or department metadata. Use the
              {' '}
              <strong>Metadata issues</strong>
              {' '}
              filter below to review them.
            </>
          ) : (
            <>
              Metadata scan complete — all
              {' '}
              {metadataScannedCount.toLocaleString()}
              {' '}
              rows matched system catalogs for sub-county, ward, and department.
            </>
          )}
        </Alert>
      )}

      <Paper sx={{ mb: 2 }}>
        <Tabs
          value={activeTab}
          onChange={(_event, value) => setActiveTab(value)}
          sx={{ px: 2 }}
        >
          <Tab value="staging" label="Compendium staging" />
          <Tab
            value="metadata"
            label={`Metadata resolutions${metadataTabCount ? ` (${metadataTabCount})` : ''}`}
          />
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

          <Chip
            label={`Metadata issues (${metadataIssuesCount.toLocaleString()})`}
            color={metadataIssuesOnly ? 'warning' : 'default'}
            onClick={() => {
              setMetadataIssuesOnly((v) => !v);
              setPaginationModel((p) => ({ ...p, page: 0 }));
            }}
            clickable
            variant={metadataIssuesOnly ? 'filled' : 'outlined'}
          />

          <Button variant="outlined" startIcon={<RefreshIcon />} onClick={loadData} disabled={loading}>
            Refresh
          </Button>
          <Button
            variant="outlined"
            startIcon={refreshingMetadata ? <CircularProgress size={18} /> : <ManageSearchIcon />}
            onClick={handleRefreshMetadata}
            disabled={!batch || refreshingMetadata}
          >
            {refreshingMetadata ? 'Scanning…' : 'Scan metadata'}
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
            · Metadata issues {metadataIssuesCount.toLocaleString()}
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
        </>
      )}

      {activeTab === 'metadata' && (
        <Paper sx={{ p: 2, mb: 2 }}>
          <Stack spacing={2}>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ md: 'center' }}>
              <FormControl size="small" sx={{ minWidth: 280 }}>
                <InputLabel>Import batch</InputLabel>
                <Select
                  label="Import batch"
                  value={batch}
                  onChange={(e) => setBatch(e.target.value)}
                >
                  {batches.map((b) => (
                    <MenuItem key={b.importBatch} value={b.importBatch}>
                      {b.importBatch} ({b.rowCount} rows)
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              <Button
                variant="outlined"
                startIcon={metadataLoading ? <CircularProgress size={18} /> : <RefreshIcon />}
                onClick={loadMetadataSuggestions}
                disabled={!batch || metadataLoading}
              >
                Refresh
              </Button>
              <Button
                variant="outlined"
                startIcon={refreshingMetadata ? <CircularProgress size={18} /> : <ManageSearchIcon />}
                onClick={handleRefreshMetadata}
                disabled={!batch || refreshingMetadata}
              >
                {refreshingMetadata ? 'Scanning…' : 'Scan metadata'}
              </Button>
              <Button
                variant="outlined"
                onClick={handleAcceptAllSuggestions}
                disabled={!metadataSuggestions.some((item) => !item.isResolved && item.suggestedValue)}
              >
                Accept all suggestions
              </Button>
              <Button
                variant="contained"
                onClick={handleSaveResolutions}
                disabled={!batch || savingResolutions || pendingResolutionCount === 0}
              >
                {savingResolutions ? 'Saving…' : `Save resolutions (${pendingResolutionCount})`}
              </Button>
            </Stack>

            {needsMetadataScan ? (
              <Alert severity="info">
                Run <strong>Scan metadata</strong> first so unresolved sub-county, ward, and department values appear here for review.
              </Alert>
            ) : (
              <Typography variant="body2" color="text.secondary">
                Map imported values to system catalog entries. Saved resolutions update staging rows, sync linked projects that were already created from this batch, and clear matching metadata issues.
                {' '}
                {metadataSummary
                  ? `${metadataSummary.unresolvedCount?.toLocaleString() ?? 0} unresolved, ${metadataSummary.resolvedCount?.toLocaleString() ?? 0} resolved.`
                  : ''}
              </Typography>
            )}

            <Paper sx={{ height: 520 }}>
              <DataGrid
                rows={metadataRows}
                columns={metadataColumns}
                loading={metadataLoading}
                disableRowSelectionOnClick
                density="compact"
                pageSizeOptions={[25, 50, 100]}
                initialState={{ pagination: { paginationModel: { pageSize: 50, page: 0 } } }}
                onColumnWidthChange={onMetadataColumnWidthChange}
                getRowClassName={(params) => (
                  params.row.hasPendingChange ? 'metadata-resolution-pending' : ''
                )}
                localeText={{
                  noRowsLabel: needsMetadataScan
                    ? 'Scan metadata to list values that need catalog mapping.'
                    : 'No unresolved metadata values found for this batch.',
                }}
                sx={{
                  border: 0,
                  '& .MuiDataGrid-columnSeparator': {
                    opacity: 1,
                  },
                  '& .metadata-resolution-pending': {
                    backgroundColor: 'action.hover',
                  },
                }}
              />
            </Paper>
          </Stack>
        </Paper>
      )}

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
