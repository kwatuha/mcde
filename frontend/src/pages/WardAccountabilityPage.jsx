import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Chip, CircularProgress, Paper, Stack, TextField, Typography,
} from '@mui/material';
import { DataGrid } from '@mui/x-data-grid';
import axiosInstance from '../api/axiosInstance';
import Header from './dashboard/Header';
import { formatCurrency } from '../utils/helpers';

export default function WardAccountabilityPage() {
  const [subcounty, setSubcounty] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = subcounty ? { subcounty } : {};
      const { data } = await axiosInstance.get('/accountability/ward-accountability', { params });
      setRows(data?.rows || []);
      setSummary(data?.summary || {});
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Failed to load ward accountability.');
    } finally {
      setLoading(false);
    }
  }, [subcounty]);

  useEffect(() => {
    load();
  }, [load]);

  const columns = useMemo(() => [
    { field: 'subcounty', headerName: 'Sub-county', flex: 1, minWidth: 140 },
    { field: 'ward', headerName: 'Ward', flex: 1, minWidth: 140 },
    { field: 'projects', headerName: 'Projects', width: 100, type: 'number' },
    {
      field: 'totalBudget',
      headerName: 'Budget',
      width: 130,
      valueFormatter: (value) => formatCurrency(value),
    },
    {
      field: 'totalPaid',
      headerName: 'Paid',
      width: 120,
      valueFormatter: (value) => formatCurrency(value),
    },
    {
      field: 'avgProgress',
      headerName: 'Avg progress',
      width: 110,
      valueFormatter: (value) => `${Number(value || 0).toFixed(1)}%`,
    },
    { field: 'pmcReports', headerName: 'PMC reports', width: 110, type: 'number' },
    { field: 'activePmcReports', headerName: 'Active PMC', width: 110, type: 'number' },
  ], []);

  return (
    <Box>
      <Header
        title="Ward Accountability Dashboard"
        subtitle="Ward-level project counts, budgets, progress, and PMC report activity"
      />

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} sx={{ mb: 2 }} alignItems={{ md: 'center' }}>
        <TextField
          size="small"
          label="Filter by sub-county"
          value={subcounty}
          onChange={(e) => setSubcounty(e.target.value)}
          placeholder="e.g. Machakos Town"
          sx={{ minWidth: 260 }}
        />
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          <Chip label={`Wards: ${summary.wards ?? rows.length}`} />
          <Chip label={`Projects: ${summary.projects ?? 0}`} variant="outlined" />
          <Chip label={`PMC reports: ${summary.pmcReports ?? 0}`} color="primary" variant="outlined" />
        </Stack>
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Paper sx={{ height: 620 }}>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
            <CircularProgress />
          </Box>
        ) : (
          <DataGrid
            rows={rows.map((row, index) => ({ id: `${row.subcounty}-${row.ward}-${index}`, ...row }))}
            columns={columns}
            disableRowSelectionOnClick
            pageSizeOptions={[10, 25, 50]}
            initialState={{ pagination: { paginationModel: { pageSize: 15 } } }}
          />
        )}
      </Paper>
    </Box>
  );
}
