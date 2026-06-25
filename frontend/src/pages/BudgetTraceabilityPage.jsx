import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Button, Chip, CircularProgress, MenuItem, Paper, Stack, TextField, Typography,
} from '@mui/material';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import { DataGrid } from '@mui/x-data-grid';
import { Link as RouterLink } from 'react-router-dom';
import axiosInstance from '../api/axiosInstance';
import budgetService from '../api/budgetService';
import Header from './dashboard/Header';
import { formatCurrency } from '../utils/helpers';
import {
  BUDGET_TRACEABILITY_EXPORT_COLUMNS,
  buildBudgetTraceabilitySummaryRows,
  exportBudgetTraceabilityExcel,
  exportBudgetTraceabilityPdf,
} from '../utils/budgetTraceabilityExport';

export default function BudgetTraceabilityPage() {
  const [budgets, setBudgets] = useState([]);
  const [selectedBudgetId, setSelectedBudgetId] = useState('');
  const [loading, setLoading] = useState(true);
  const [exportingExcel, setExportingExcel] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [error, setError] = useState('');
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState({});

  useEffect(() => {
    budgetService.getBudgetContainers?.()
      .then((data) => {
        const list = Array.isArray(data) ? data : (data?.budgets || []);
        setBudgets(list);
      })
      .catch(() => setBudgets([]));
  }, []);

  const selectedBudgetLabel = useMemo(() => {
    if (!selectedBudgetId) return 'All budgets';
    const match = budgets.find(
      (budget) => String(budget.budgetId || budget.budgetid) === String(selectedBudgetId)
    );
    return match?.budgetName || match?.budgetname || `Budget #${selectedBudgetId}`;
  }, [budgets, selectedBudgetId]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = selectedBudgetId ? { budgetId: selectedBudgetId } : {};
      const { data } = await axiosInstance.get('/budgets/traceability', { params });
      setRows(data?.rows || []);
      setSummary(data?.summary || {});
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Failed to load budget traceability.');
    } finally {
      setLoading(false);
    }
  }, [selectedBudgetId]);

  useEffect(() => {
    load();
  }, [load]);

  const summaryExportRows = useMemo(
    () => buildBudgetTraceabilitySummaryRows({ selectedBudgetLabel, summary, rows }),
    [selectedBudgetLabel, summary, rows]
  );

  const handleExportExcel = () => {
    setExportingExcel(true);
    try {
      exportBudgetTraceabilityExcel({
        subtitle: selectedBudgetLabel,
        summaryRows: summaryExportRows,
        columns: BUDGET_TRACEABILITY_EXPORT_COLUMNS,
        rows,
      });
    } finally {
      setExportingExcel(false);
    }
  };

  const handleExportPdf = async () => {
    setExportingPdf(true);
    try {
      await exportBudgetTraceabilityPdf({
        subtitle: selectedBudgetLabel,
        summaryRows: summaryExportRows,
        columns: BUDGET_TRACEABILITY_EXPORT_COLUMNS,
        rows,
      });
    } catch (err) {
      setError(err?.message || 'Failed to export budget traceability PDF.');
    } finally {
      setExportingPdf(false);
    }
  };

  const columns = useMemo(() => [
    { field: 'budgetName', headerName: 'Budget', flex: 1, minWidth: 160 },
    { field: 'adpProgrammeName', headerName: 'ADP programme', flex: 1, minWidth: 160 },
    { field: 'adpProjectName', headerName: 'ADP row', flex: 1.1, minWidth: 180 },
    {
      field: 'registryProjectName',
      headerName: 'Registry project',
      flex: 1.1,
      minWidth: 180,
      renderCell: (params) => (
        params.row.registryProjectId ? (
          <RouterLink to={`/projects/${params.row.registryProjectId}`} style={{ textDecoration: 'none' }}>
            {params.value || `Project #${params.row.registryProjectId}`}
          </RouterLink>
        ) : '—'
      ),
    },
    {
      field: 'budgetItemAmount',
      headerName: 'Budget item',
      width: 130,
      valueFormatter: (value) => formatCurrency(value),
    },
    {
      field: 'projectBudget',
      headerName: 'Project budget',
      width: 130,
      valueFormatter: (value) => formatCurrency(value),
    },
    {
      field: 'projectPaid',
      headerName: 'Paid',
      width: 120,
      valueFormatter: (value) => formatCurrency(value),
    },
    {
      field: 'projectProgress',
      headerName: 'Progress',
      width: 100,
      valueFormatter: (value) => `${Number(value || 0).toFixed(1)}%`,
    },
  ], []);

  return (
    <Box>
      <Header
        title="Budget → Project Traceability"
        subtitle="Follow budget items through ADP rows to linked registry projects, paid amounts, and progress"
      />

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} sx={{ mb: 2 }} alignItems={{ md: 'center' }}>
        <TextField
          select
          size="small"
          label="Department budget"
          value={selectedBudgetId}
          onChange={(e) => setSelectedBudgetId(e.target.value)}
          sx={{ minWidth: 280 }}
        >
          <MenuItem value="">All budgets</MenuItem>
          {budgets.map((budget) => (
            <MenuItem key={budget.budgetId || budget.budgetid} value={String(budget.budgetId || budget.budgetid)}>
              {budget.budgetName || budget.budgetname}
            </MenuItem>
          ))}
        </TextField>
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ flex: 1 }}>
          <Chip label={`Items: ${summary.items ?? rows.length}`} />
          <Chip label={`Linked projects: ${summary.linkedRegistryProjects ?? 0}`} color="primary" variant="outlined" />
          <Chip label={`Budget items total: ${formatCurrency(summary.totalBudgetItems)}`} variant="outlined" />
          <Chip label={`Paid: ${formatCurrency(summary.totalProjectPaid)}`} color="success" variant="outlined" />
        </Stack>
        <Stack direction="row" spacing={1}>
          <Button
            variant="outlined"
            startIcon={exportingExcel ? <CircularProgress size={18} /> : <FileDownloadIcon />}
            onClick={handleExportExcel}
            disabled={loading || exportingExcel || rows.length === 0}
          >
            Excel
          </Button>
          <Button
            variant="outlined"
            startIcon={exportingPdf ? <CircularProgress size={18} /> : <PictureAsPdfIcon />}
            onClick={handleExportPdf}
            disabled={loading || exportingPdf || rows.length === 0}
          >
            PDF
          </Button>
        </Stack>
      </Stack>

      {!loading && !error && (summary.linkedRegistryProjects ?? 0) <= 1 && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Most budget items are not yet linked to registry projects. Link ADP rows in Budget Management
          or accept ADP link suggestions to populate the full traceability chain.
        </Alert>
      )}

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Paper sx={{ height: 620 }}>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
            <CircularProgress />
          </Box>
        ) : (
          <DataGrid
            rows={rows.map((row, index) => ({ id: row.itemId || index, ...row }))}
            columns={columns}
            disableRowSelectionOnClick
            pageSizeOptions={[10, 25, 50, 100]}
            initialState={{ pagination: { paginationModel: { pageSize: 15 } } }}
          />
        )}
      </Paper>
    </Box>
  );
}
