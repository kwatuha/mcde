import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  LinearProgress,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import { DataGrid } from '@mui/x-data-grid';
import apiService from '../api';
import Header from './dashboard/Header';
import {
  exportPlanningProgressExcel,
  exportPlanningProgressPdf,
  formatCurrency,
  formatNumber,
  formatPercent,
} from '../utils/planningProgressExport';

const EXPORT_COLUMNS = [
  { field: 'sectorName', header: 'Sector', width: 28 },
  { field: 'programmeName', header: 'Programme', width: 34 },
  { field: 'subprogrammeName', header: 'Sub-programme', width: 28 },
  { field: 'adpProjects', header: 'ADP rows', width: 10, format: (v) => formatNumber(v) },
  { field: 'linkedAdpProjects', header: 'Linked ADP', width: 12, format: (v) => formatNumber(v) },
  { field: 'linkedRegistryProjects', header: 'Registry projects', width: 14, format: (v) => formatNumber(v) },
  { field: 'linkagePercent', header: 'Linkage %', width: 12, format: (v) => formatPercent(v) },
  { field: 'avgProgress', header: 'Avg progress', width: 12, format: (v) => formatPercent(v) },
  { field: 'stalledProjects', header: 'Stalled', width: 10, format: (v) => formatNumber(v) },
  { field: 'plannedBudget', header: 'ADP planned', width: 16, format: (v) => formatCurrency(v) },
  { field: 'projectBudget', header: 'Project budget', width: 16, format: (v) => formatCurrency(v) },
];

export default function AdpProgrammeProgressPage() {
  const [plans, setPlans] = useState([]);
  const [selectedPlanCode, setSelectedPlanCode] = useState('');
  const [loading, setLoading] = useState(true);
  const [exportingExcel, setExportingExcel] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [error, setError] = useState('');
  const [rows, setRows] = useState([]);

  const selectedPlan = useMemo(
    () => plans.find((plan) => plan.adpCode === selectedPlanCode) || plans[0] || null,
    [plans, selectedPlanCode]
  );

  useEffect(() => {
    apiService.adp.getPlans()
      .then((data) => {
        const list = Array.isArray(data) ? data : [];
        setPlans(list);
        if (list[0]?.adpCode) setSelectedPlanCode(list[0].adpCode);
      })
      .catch(() => setPlans([]));
  }, []);

  const load = useCallback(async () => {
    if (!selectedPlan?.adpCode) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const data = await apiService.adp.getProgrammeProgress({ adpCode: selectedPlan.adpCode });
      setRows(data?.rows || []);
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Failed to load ADP programme progress.');
    } finally {
      setLoading(false);
    }
  }, [selectedPlan?.adpCode]);

  useEffect(() => {
    load();
  }, [load]);

  const summary = useMemo(() => {
    const withActivity = rows.filter((row) => Number(row.adpProjects || 0) > 0);
    return {
      programmes: rows.length,
      programmesWithActivity: withActivity.length,
      adpProjects: rows.reduce((sum, row) => sum + Number(row.adpProjects || 0), 0),
      linkedRegistryProjects: rows.reduce((sum, row) => sum + Number(row.linkedRegistryProjects || 0), 0),
      plannedBudget: rows.reduce((sum, row) => sum + Number(row.plannedBudget || 0), 0),
      projectBudget: rows.reduce((sum, row) => sum + Number(row.projectBudget || 0), 0),
      stalledProjects: rows.reduce((sum, row) => sum + Number(row.stalledProjects || 0), 0),
    };
  }, [rows]);

  const exportRows = useMemo(
    () => rows.filter((row) => Number(row.adpProjects || 0) > 0 || Number(row.linkedRegistryProjects || 0) > 0),
    [rows]
  );

  const summaryExportRows = useMemo(() => [
    { label: 'Plan', value: selectedPlan ? `${selectedPlan.financialYear} — ${selectedPlan.adpName}` : '—' },
    { label: 'Programmes', value: formatNumber(summary.programmes) },
    { label: 'Programmes with ADP rows', value: formatNumber(summary.programmesWithActivity) },
    { label: 'ADP planned rows', value: formatNumber(summary.adpProjects) },
    { label: 'Linked registry projects', value: formatNumber(summary.linkedRegistryProjects) },
    { label: 'ADP planned budget', value: formatCurrency(summary.plannedBudget) },
    { label: 'Registry project budget', value: formatCurrency(summary.projectBudget) },
    { label: 'Stalled / slow links', value: formatNumber(summary.stalledProjects) },
  ], [selectedPlan, summary]);

  const handleExportExcel = () => {
    setExportingExcel(true);
    try {
      exportPlanningProgressExcel({
        filenamePrefix: 'adp-programme-progress',
        sheetName: 'ADP Progress',
        title: 'ADP Programme Progress',
        subtitle: selectedPlan ? `${selectedPlan.financialYear} — ${selectedPlan.adpName}` : '',
        summaryRows: summaryExportRows,
        columns: EXPORT_COLUMNS,
        rows: exportRows,
      });
    } finally {
      setExportingExcel(false);
    }
  };

  const handleExportPdf = async () => {
    setExportingPdf(true);
    try {
      await exportPlanningProgressPdf({
        filenamePrefix: 'adp-programme-progress',
        reportTitle: 'ADP Programme Progress Report',
        subtitle: selectedPlan ? `${selectedPlan.financialYear} — ${selectedPlan.adpName}` : '',
        summaryRows: summaryExportRows,
        columns: EXPORT_COLUMNS,
        rows: exportRows,
      });
    } catch (err) {
      setError(err?.message || 'Failed to export ADP programme progress PDF.');
    } finally {
      setExportingPdf(false);
    }
  };

  const columns = useMemo(() => [
    { field: 'sectorName', headerName: 'Sector', flex: 1, minWidth: 180 },
    { field: 'programmeName', headerName: 'Programme', flex: 1.2, minWidth: 200 },
    { field: 'subprogrammeName', headerName: 'Sub-programme', flex: 1, minWidth: 160 },
    { field: 'adpProjects', headerName: 'ADP rows', width: 90, type: 'number' },
    { field: 'linkedRegistryProjects', headerName: 'Linked', width: 90, type: 'number' },
    {
      field: 'linkagePercent',
      headerName: 'Linkage %',
      width: 130,
      renderCell: (params) => (
        <Stack spacing={0.5} sx={{ width: '100%', py: 1 }}>
          <Typography variant="caption">{Number(params.value || 0).toFixed(1)}%</Typography>
          <LinearProgress variant="determinate" value={Math.min(100, Number(params.value || 0))} />
        </Stack>
      ),
    },
    {
      field: 'avgProgress',
      headerName: 'Avg progress',
      width: 110,
      valueFormatter: (value) => `${Number(value || 0).toFixed(1)}%`,
    },
    { field: 'stalledProjects', headerName: 'Stalled', width: 90, type: 'number' },
    {
      field: 'plannedBudget',
      headerName: 'ADP planned',
      width: 130,
      valueFormatter: (value) => formatCurrency(value),
    },
    {
      field: 'projectBudget',
      headerName: 'Project budget',
      width: 130,
      valueFormatter: (value) => formatCurrency(value),
    },
  ], []);

  return (
    <Box>
      <Header
        title="ADP Programme Progress"
        subtitle="Annual plan programme roll-up of ADP rows, registry linkages, budgets, and delivery progress"
      />

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} sx={{ mb: 2 }} alignItems={{ md: 'center' }}>
        <TextField
          select
          size="small"
          label="ADP Plan"
          value={selectedPlan?.adpCode || ''}
          onChange={(event) => setSelectedPlanCode(event.target.value)}
          sx={{ minWidth: 280 }}
        >
          {plans.map((plan) => (
            <MenuItem key={plan.id || plan.adpCode} value={plan.adpCode}>
              {plan.financialYear} — {plan.adpName}
            </MenuItem>
          ))}
        </TextField>
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ flex: 1 }}>
          <Chip label={`Programmes: ${summary.programmes}`} />
          <Chip label={`With ADP rows: ${summary.programmesWithActivity}`} variant="outlined" />
          <Chip label={`Linked projects: ${summary.linkedRegistryProjects}`} color="primary" variant="outlined" />
          <Chip label={`Project budget: ${formatCurrency(summary.projectBudget)}`} color="success" variant="outlined" />
        </Stack>
        <Stack direction="row" spacing={1}>
          <Button
            variant="outlined"
            startIcon={exportingExcel ? <CircularProgress size={18} /> : <FileDownloadIcon />}
            onClick={handleExportExcel}
            disabled={loading || exportingExcel || exportRows.length === 0}
          >
            Excel
          </Button>
          <Button
            variant="outlined"
            startIcon={exportingPdf ? <CircularProgress size={18} /> : <PictureAsPdfIcon />}
            onClick={handleExportPdf}
            disabled={loading || exportingPdf || exportRows.length === 0}
          >
            PDF
          </Button>
        </Stack>
      </Stack>

      {!loading && !error && summary.linkedRegistryProjects === 0 && (
        <Alert severity="info" sx={{ mb: 2 }}>
          No registry projects are linked to ADP rows yet. Link projects from Project Details → ADP,
          or run the sample ADP linkage seed for demo data.
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
            rows={rows.filter((row) => Number(row.adpProjects || 0) > 0 || Number(row.linkedRegistryProjects || 0) > 0)}
            columns={columns}
            getRowId={(row) => row.programmeId}
            disableRowSelectionOnClick
            pageSizeOptions={[10, 25, 50, 100]}
            initialState={{ pagination: { paginationModel: { pageSize: 15 } } }}
          />
        )}
      </Paper>
    </Box>
  );
}
