import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Alert,
  Box,
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
  Tooltip,
  Typography,
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import RefreshIcon from '@mui/icons-material/Refresh';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
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

export default function ClientProjectImportReviewPage() {
  const [batches, setBatches] = useState([]);
  const [batch, setBatch] = useState('');
  const [summary, setSummary] = useState(null);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [matchedOnly, setMatchedOnly] = useState(false);
  const [paginationModel, setPaginationModel] = useState({ page: 0, pageSize: 50 });

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
  }, [batch, actionFilter, search, matchedOnly, paginationModel.page, paginationModel.pageSize]);

  useEffect(() => {
    loadBatches().catch((e) => {
      setError(e?.response?.data?.message || e?.message || 'Failed to load import batches.');
      setLoading(false);
    });
  }, [loadBatches]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const selectedBatchMeta = useMemo(
    () => batches.find((b) => b.importBatch === batch) || null,
    [batches, batch],
  );

  const handleExport = async () => {
    if (!batch) return;
    setExporting(true);
    setError('');
    try {
      const response = await apiService.clientProjectImport.exportExcel(batch, {
        proposedAction: actionFilter || undefined,
        search: search.trim() || undefined,
        matchedOnly: matchedOnly || undefined,
      });
      triggerBlobDownload(response, `client-project-staging-${batch}.xlsx`);
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || 'Excel export failed.');
    } finally {
      setExporting(false);
    }
  };

  const columns = useMemo(() => [
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

  return (
    <Box>
      <Header
        title="Client project import review"
        subtitle="Review staged county spreadsheet rows, proposed matches, and export to Excel before applying to live projects"
      />

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

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

        {selectedBatchMeta && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>
            Source: {selectedBatchMeta.sourceFile || '—'} · Staged {selectedBatchMeta.rowCount?.toLocaleString()} rows
            · Matched {selectedBatchMeta.matchedCount?.toLocaleString() ?? 0}
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
          disableRowSelectionOnClick
          density="compact"
        />
      </Paper>
    </Box>
  );
}
