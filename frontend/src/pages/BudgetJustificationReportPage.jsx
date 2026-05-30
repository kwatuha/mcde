import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Grid,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import reportsService from '../api/reportsService';

const STATUS_OPTIONS = ['', 'Not Started', 'Initiated', 'In Progress', 'Completed', 'At Risk', 'Delayed', 'Stalled', 'On Hold'];

export default function BudgetJustificationReportPage() {
  const [filters, setFilters] = useState({
    department: '',
    status: '',
    projectName: '',
    startDate: '',
    endDate: '',
    minBudget: '',
    maxBudget: '',
    minPendingAmount: '',
    maxPendingAmount: '',
    limit: 1000,
  });
  const [departments, setDepartments] = useState([]);
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState({ count: 0, totalBudget: 0, totalPaid: 0, totalPending: 0 });
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await reportsService.getBudgetJustificationReport({
        ...filters,
        minBudget: filters.minBudget === '' ? undefined : Number(filters.minBudget),
        maxBudget: filters.maxBudget === '' ? undefined : Number(filters.maxBudget),
        minPendingAmount: filters.minPendingAmount === '' ? undefined : Number(filters.minPendingAmount),
        maxPendingAmount: filters.maxPendingAmount === '' ? undefined : Number(filters.maxPendingAmount),
      });
      setRows(Array.isArray(data?.rows) ? data.rows : []);
      setSummary(data?.summary || { count: 0, totalBudget: 0, totalPaid: 0, totalPending: 0 });
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || 'Failed to load budget justification report.');
      setRows([]);
      setSummary({ count: 0, totalBudget: 0, totalPaid: 0, totalPending: 0 });
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    (async () => {
      try {
        const opts = await reportsService.getFilterOptions();
        const list = Array.isArray(opts?.departments) ? opts.departments : [];
        setDepartments(list.map((d) => d?.name).filter(Boolean));
      } catch {
        setDepartments([]);
      }
    })();
  }, []);

  const totalsLine = useMemo(
    () => `Rows: ${summary.count} | Budget: ${Number(summary.totalBudget || 0).toLocaleString()} | Paid: ${Number(summary.totalPaid || 0).toLocaleString()} | Pending: ${Number(summary.totalPending || 0).toLocaleString()}`,
    [summary]
  );

  const handleDownloadTemplate = async () => {
    setDownloading(true);
    try {
      const { blob, fileName } = await reportsService.downloadBudgetJustificationReport(filters);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName || 'budget-justification.pdf';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || 'Failed to download budget justification report.');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      <Paper sx={{ p: { xs: 2, md: 3 } }}>
        <Typography variant="h5" sx={{ fontWeight: 700, mb: 0.5 }}>
          Budget Justification
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Filter projects that need budget variance explanation and download a database-backed official justification PDF.
        </Typography>

        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        <Grid container spacing={1.5} sx={{ mb: 2 }}>
          <Grid item xs={12} md={3}>
            <TextField select fullWidth size="small" sx={{ minWidth: 180 }} label="Department" value={filters.department} onChange={(e) => setFilters((p) => ({ ...p, department: e.target.value }))}>
              <MenuItem value="">All</MenuItem>
              {departments.map((d) => <MenuItem key={d} value={d}>{d}</MenuItem>)}
            </TextField>
          </Grid>
          <Grid item xs={12} md={2}>
            <TextField select fullWidth size="small" sx={{ minWidth: 160 }} label="Status" value={filters.status} onChange={(e) => setFilters((p) => ({ ...p, status: e.target.value }))}>
              {STATUS_OPTIONS.map((s) => <MenuItem key={s || 'all'} value={s}>{s || 'All'}</MenuItem>)}
            </TextField>
          </Grid>
          <Grid item xs={12} md={3}>
            <TextField fullWidth size="small" label="Project name contains" value={filters.projectName} onChange={(e) => setFilters((p) => ({ ...p, projectName: e.target.value }))} />
          </Grid>
          <Grid item xs={12} md={2}>
            <TextField fullWidth size="small" label="Start date" type="date" value={filters.startDate} onChange={(e) => setFilters((p) => ({ ...p, startDate: e.target.value }))} InputLabelProps={{ shrink: true }} />
          </Grid>
          <Grid item xs={12} md={2}>
            <TextField fullWidth size="small" label="End date" type="date" value={filters.endDate} onChange={(e) => setFilters((p) => ({ ...p, endDate: e.target.value }))} InputLabelProps={{ shrink: true }} />
          </Grid>
          <Grid item xs={12} md={2}>
            <TextField fullWidth size="small" type="number" label="Min budget" value={filters.minBudget} onChange={(e) => setFilters((p) => ({ ...p, minBudget: e.target.value }))} />
          </Grid>
          <Grid item xs={12} md={2}>
            <TextField fullWidth size="small" type="number" label="Max budget" value={filters.maxBudget} onChange={(e) => setFilters((p) => ({ ...p, maxBudget: e.target.value }))} />
          </Grid>
          <Grid item xs={12} md={2}>
            <TextField fullWidth size="small" type="number" label="Min pending" value={filters.minPendingAmount} onChange={(e) => setFilters((p) => ({ ...p, minPendingAmount: e.target.value }))} />
          </Grid>
          <Grid item xs={12} md={2}>
            <TextField fullWidth size="small" type="number" label="Max pending" value={filters.maxPendingAmount} onChange={(e) => setFilters((p) => ({ ...p, maxPendingAmount: e.target.value }))} />
          </Grid>
          <Grid item xs={12} md={2}>
            <TextField fullWidth size="small" type="number" label="Max rows" value={filters.limit} onChange={(e) => setFilters((p) => ({ ...p, limit: Number(e.target.value || 1000) }))} />
          </Grid>
          <Grid item xs={12}>
            <Stack direction="row" spacing={1}>
              <Button variant="contained" onClick={load} disabled={loading}>
                {loading ? 'Loading...' : 'Apply filters'}
              </Button>
              <Button variant="outlined" startIcon={<DownloadIcon />} onClick={handleDownloadTemplate} disabled={downloading}>
                {downloading ? 'Preparing...' : 'Download Justification Report (PDF)'}
              </Button>
            </Stack>
          </Grid>
        </Grid>

        <Alert severity="info" sx={{ mb: 2 }}>{totalsLine}</Alert>

        <Paper variant="outlined">
          {loading ? (
            <Box sx={{ p: 3, textAlign: 'center' }}><CircularProgress size={22} /></Box>
          ) : (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Project</TableCell>
                  <TableCell>Department</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell align="right">Budget</TableCell>
                  <TableCell align="right">Paid</TableCell>
                  <TableCell align="right">Pending</TableCell>
                  <TableCell>Justification Hint</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={`${r.projectId}-${r.projectName}`}>
                    <TableCell>{r.projectName || '-'}</TableCell>
                    <TableCell>{r.department || '-'}</TableCell>
                    <TableCell>{r.status || '-'}</TableCell>
                    <TableCell align="right">{Number(r.budgetAmount || 0).toLocaleString()}</TableCell>
                    <TableCell align="right">{Number(r.paidAmount || 0).toLocaleString()}</TableCell>
                    <TableCell align="right">{Number(r.pendingAmount || 0).toLocaleString()}</TableCell>
                    <TableCell>{r.justificationHint || '-'}</TableCell>
                  </TableRow>
                ))}
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} align="center">No projects match your filters.</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </Paper>
      </Paper>
    </Box>
  );
}

