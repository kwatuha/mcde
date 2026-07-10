import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Autocomplete,
  Button,
  Chip,
  CircularProgress,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import ManageSearchIcon from '@mui/icons-material/ManageSearch';
import { DataGrid } from '@mui/x-data-grid';
import { usePersistedDataGridColumnWidths } from '../../hooks/usePersistedDataGridColumnWidths';

function resolutionKey(item) {
  return `${item.fieldType}:${item.sourceKey}`;
}

function formatScore(value) {
  if (value == null || Number.isNaN(Number(value))) return '—';
  return `${Math.round(Number(value) * 100)}%`;
}

export function formatMetadataResolutionSaveMessage(result) {
  const parts = [
    `Saved ${result.saved?.toLocaleString() ?? 0} resolution(s)`,
    `updated ${result.updatedRows?.toLocaleString() ?? 0} staging row(s)`,
  ];
  const updatedProjects = Number(result.updatedProjects ?? 0);
  if (updatedProjects > 0) {
    parts.push(`synced ${updatedProjects.toLocaleString()} linked project(s)`);
  }
  return `${parts.join('; ')}. ${result.metadata?.withIssues?.toLocaleString() ?? 0} metadata issue(s) remain.`;
}

export default function ImportMetadataResolutionsPanel({
  batch,
  batches,
  onBatchChange,
  needsMetadataScan,
  metadataSummary,
  metadataIssuesCount = 0,
  columnStorageKey = 'import-metadata-resolution-columns',
  api,
  onError,
  onSuccess,
  onStatsRefresh,
}) {
  const [metadataSuggestions, setMetadataSuggestions] = useState([]);
  const [metadataCatalogs, setMetadataCatalogs] = useState({ subcounty: [], ward: [], department: [] });
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [refreshingMetadata, setRefreshingMetadata] = useState(false);
  const [savingResolutions, setSavingResolutions] = useState(false);
  const [resolutionDrafts, setResolutionDrafts] = useState({});
  const { onColumnWidthChange, getWidth } = usePersistedDataGridColumnWidths(columnStorageKey);

  const loadSuggestions = useCallback(async () => {
    if (!batch) {
      setMetadataSuggestions([]);
      setSummary(null);
      setMetadataCatalogs({ subcounty: [], ward: [], department: [] });
      setLoading(false);
      return;
    }
    setLoading(true);
    onError?.('');
    try {
      const data = await api.listMetadataSuggestions(batch);
      setMetadataSuggestions(data.suggestions || []);
      setSummary(data);
      setMetadataCatalogs(data.catalogs || { subcounty: [], ward: [], department: [] });
      setResolutionDrafts({});
    } catch (e) {
      onError?.(e?.response?.data?.message || e?.response?.data?.error || e?.message || 'Failed to load metadata suggestions.');
      setMetadataSuggestions([]);
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [api, batch, onError]);

  useEffect(() => {
    loadSuggestions();
  }, [loadSuggestions]);

  const handleRefreshMetadata = async () => {
    if (!batch) return;
    setRefreshingMetadata(true);
    onError?.('');
    onSuccess?.('');
    try {
      const result = await api.refreshMetadata(batch);
      onSuccess?.(`Metadata check updated: ${result.withIssues?.toLocaleString() ?? 0} of ${result.total?.toLocaleString() ?? 0} rows have unresolved catalog fields.`);
      await Promise.all([onStatsRefresh?.(), loadSuggestions()]);
    } catch (e) {
      onError?.(e?.response?.data?.message || e?.message || 'Failed to refresh metadata remarks.');
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
      onError?.('Choose at least one catalog match to save.');
      return;
    }

    setSavingResolutions(true);
    onError?.('');
    onSuccess?.('');
    try {
      const result = await api.saveMetadataResolutions(batch, resolutions);
      onSuccess?.(formatMetadataResolutionSaveMessage(result));
      await Promise.all([onStatsRefresh?.(), loadSuggestions()]);
    } catch (e) {
      onError?.(e?.response?.data?.message || e?.message || 'Failed to save metadata resolutions.');
    } finally {
      setSavingResolutions(false);
    }
  };

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
    { field: 'fieldLabel', headerName: 'Field', width: getWidth('fieldLabel'), minWidth: 72 },
    {
      field: 'foundValue',
      headerName: 'Found in import',
      width: getWidth('foundValue'),
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
      width: getWidth('suggestedValue'),
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
      width: getWidth('rowCount'),
      minWidth: 56,
      type: 'number',
      align: 'right',
      headerAlign: 'right',
      valueFormatter: (value) => (value != null ? Number(value).toLocaleString() : '0'),
    },
    {
      field: 'resolveTo',
      headerName: 'Resolve to',
      width: getWidth('resolveTo'),
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
      width: getWidth('status'),
      minWidth: 88,
      sortable: false,
      renderCell: (params) => {
        const item = params.row;
        if (item.hasPendingChange) return <Chip size="small" color="info" label="Pending save" />;
        if (item.isResolved) return <Chip size="small" color="success" label="Resolved" />;
        return <Chip size="small" color="warning" variant="outlined" label="Unresolved" />;
      },
    },
  ], [getWidth]);

  const unresolvedCount = summary?.unresolvedCount ?? metadataSummary?.unresolvedCount ?? metadataIssuesCount;

  return (
    <Paper sx={{ p: 2, mb: 2 }}>
      <Stack spacing={2}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ md: 'center' }}>
          <FormControl size="small" sx={{ minWidth: 280 }}>
            <InputLabel>Import batch</InputLabel>
            <Select label="Import batch" value={batch} onChange={(e) => onBatchChange?.(e.target.value)}>
              {batches.map((b) => (
                <MenuItem key={b.importBatch} value={b.importBatch}>
                  {b.importBatch} ({b.rowCount} rows)
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <Button
            variant="outlined"
            startIcon={loading ? <CircularProgress size={18} /> : <RefreshIcon />}
            onClick={loadSuggestions}
            disabled={!batch || loading}
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
            {summary
              ? `${summary.unresolvedCount?.toLocaleString() ?? 0} unresolved, ${summary.resolvedCount?.toLocaleString() ?? 0} resolved.`
              : `${unresolvedCount?.toLocaleString() ?? 0} unresolved.`}
          </Typography>
        )}

        <Paper sx={{ height: 520 }}>
          <DataGrid
            rows={metadataRows}
            columns={metadataColumns}
            loading={loading}
            disableRowSelectionOnClick
            density="compact"
            pageSizeOptions={[25, 50, 100]}
            initialState={{ pagination: { paginationModel: { pageSize: 50, page: 0 } } }}
            onColumnWidthChange={onColumnWidthChange}
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
              '& .MuiDataGrid-columnSeparator': { opacity: 1 },
              '& .metadata-resolution-pending': { backgroundColor: 'action.hover' },
            }}
          />
        </Paper>
      </Stack>
    </Paper>
  );
}
