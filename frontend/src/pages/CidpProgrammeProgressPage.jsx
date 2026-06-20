import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  LinearProgress,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import { DataGrid } from '@mui/x-data-grid';
import axiosInstance from '../api/axiosInstance';
import Header from './dashboard/Header';
import {
  exportPlanningProgressExcel,
  exportPlanningProgressPdf,
  formatCurrency,
  formatNumber,
  formatPercent,
} from '../utils/planningProgressExport';

const EXPORT_COLUMNS = [
  { field: 'programCode', header: 'Code', width: 10 },
  { field: 'programme', header: 'Programme', width: 34 },
  { field: 'sectorName', header: 'Sector', width: 24 },
  { field: 'totalProjects', header: 'Projects', width: 10, format: (v) => formatNumber(v) },
  { field: 'linkedProjects', header: 'Linked', width: 10, format: (v) => formatNumber(v) },
  { field: 'linkagePercent', header: 'Linkage %', width: 12, format: (v) => formatPercent(v) },
  { field: 'avgProgress', header: 'Avg progress', width: 12, format: (v) => formatPercent(v) },
  { field: 'stalledProjects', header: 'Stalled', width: 10, format: (v) => formatNumber(v) },
  { field: 'projectBudget', header: 'Project budget', width: 16, format: (v) => formatCurrency(v) },
  { field: 'cidpIndicativeBudget', header: 'CIDP indicative', width: 16, format: (v) => formatCurrency(v) },
];

export default function CidpProgrammeProgressPage() {
  const [loading, setLoading] = useState(true);
  const [exportingExcel, setExportingExcel] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [error, setError] = useState('');
  const [rows, setRows] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await axiosInstance.get('/projects/cidp/programme-progress');
      setRows(data?.rows || []);
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Failed to load CIDP programme progress.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const summary = useMemo(() => {
    const totalProjects = rows.reduce((sum, row) => sum + Number(row.totalProjects || 0), 0);
    const linkedProjects = rows.reduce((sum, row) => sum + Number(row.linkedProjects || 0), 0);
    const stalledProjects = rows.reduce((sum, row) => sum + Number(row.stalledProjects || 0), 0);
    const projectBudget = rows.reduce((sum, row) => sum + Number(row.projectBudget || row.totalBudget || 0), 0);
    const programmesWithProjects = rows.filter((row) => Number(row.totalProjects || 0) > 0).length;
    return {
      programmes: rows.length,
      programmesWithProjects,
      totalProjects,
      linkedProjects,
      linkagePercent: totalProjects > 0 ? Math.round((linkedProjects / totalProjects) * 100) : 0,
      stalledProjects,
      projectBudget,
    };
  }, [rows]);

  const exportRows = useMemo(
    () => rows.filter((row) => Number(row.totalProjects || 0) > 0),
    [rows]
  );

  const summaryExportRows = useMemo(() => [
    { label: 'CIDP', value: 'Machakos CIDP 2023–2027' },
    { label: 'Programmes', value: formatNumber(summary.programmes) },
    { label: 'Programmes with projects', value: formatNumber(summary.programmesWithProjects) },
    { label: 'Linked projects', value: formatNumber(summary.linkedProjects) },
    { label: 'Project budget total', value: formatCurrency(summary.projectBudget) },
    { label: 'Stalled / slow projects', value: formatNumber(summary.stalledProjects) },
  ], [summary]);

  const handleExportExcel = () => {
    setExportingExcel(true);
    try {
      exportPlanningProgressExcel({
        filenamePrefix: 'cidp-programme-progress',
        sheetName: 'CIDP Progress',
        title: 'CIDP Programme Progress',
        subtitle: 'Machakos CIDP 2023–2027',
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
        filenamePrefix: 'cidp-programme-progress',
        reportTitle: 'CIDP Programme Progress Report',
        subtitle: 'Machakos CIDP 2023–2027',
        summaryRows: summaryExportRows,
        columns: EXPORT_COLUMNS,
        rows: exportRows,
      });
    } catch (err) {
      setError(err?.message || 'Failed to export CIDP programme progress PDF.');
    } finally {
      setExportingPdf(false);
    }
  };

  const columns = useMemo(() => [
    { field: 'programCode', headerName: 'Code', width: 90 },
    { field: 'programme', headerName: 'CIDP Programme', flex: 1.4, minWidth: 220 },
    { field: 'sectorName', headerName: 'Sector', flex: 1, minWidth: 160 },
    { field: 'totalProjects', headerName: 'Projects', width: 90, type: 'number' },
    { field: 'linkedProjects', headerName: 'Linked', width: 90, type: 'number' },
    { field: 'unlinkedProjects', headerName: 'Unlinked', width: 100, type: 'number' },
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
      field: 'projectBudget',
      headerName: 'Project budget',
      width: 140,
      valueFormatter: (value) => formatCurrency(value),
    },
    {
      field: 'cidpIndicativeBudget',
      headerName: 'CIDP indicative',
      width: 140,
      valueFormatter: (value) => formatCurrency(value),
    },
  ], []);

  return (
    <Box>
      <Header
        title="CIDP Programme Progress"
        subtitle="Roll-up of linked project budgets and progress against CIDP programme catalogue"
      />

      {!loading && !error && summary.programmesWithProjects === 0 && (
        <Alert severity="info" sx={{ mb: 2 }}>
          No projects are linked to CIDP programmes yet. Link projects from Project Details → CIDP Implementation,
          or run the sample linkage seed to populate demo data.
        </Alert>
      )}

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} sx={{ mb: 2 }} alignItems={{ md: 'center' }}>
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ flex: 1 }}>
          <Chip label={`Programmes: ${summary.programmes}`} />
          <Chip label={`With projects: ${summary.programmesWithProjects}`} variant="outlined" />
          <Chip label={`Linked projects: ${summary.linkedProjects}`} color="primary" variant="outlined" />
          <Chip label={`Project budget: ${formatCurrency(summary.projectBudget)}`} color="success" variant="outlined" />
          <Chip label={`Stalled / slow: ${summary.stalledProjects}`} color="warning" variant="outlined" />
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

      <Paper sx={{ height: 620 }}>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
            <CircularProgress />
          </Box>
        ) : (
          <DataGrid
            rows={rows}
            columns={columns}
            getRowId={(row) => row.programId}
            disableRowSelectionOnClick
            pageSizeOptions={[10, 25, 50]}
            initialState={{ pagination: { paginationModel: { pageSize: 15 } } }}
          />
        )}
      </Paper>
    </Box>
  );
}
