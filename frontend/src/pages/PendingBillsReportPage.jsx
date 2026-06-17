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
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import reportsService from '../api/reportsService';
import { useAIPageContext } from '../context/AIPageContext.jsx';
import { drawCountyOfficialHeader, getCountyLogoDataUrl } from '../utils/countyOfficialPdfHeader';

const STATUS_OPTIONS = ['', 'Not Started', 'Initiated', 'In Progress', 'Completed', 'At Risk', 'Delayed', 'Stalled', 'On Hold'];

export default function PendingBillsReportPage() {
  const { setAIPageContext, clearAIPageContext } = useAIPageContext();
  const [filters, setFilters] = useState({
    department: '',
    status: '',
    projectName: '',
    minPendingAmount: '',
    maxPendingAmount: '',
    includeZeroPending: 'false',
    limit: 500,
  });
  const [departments, setDepartments] = useState([]);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await reportsService.getPendingBillsReport({
        ...filters,
        minPendingAmount: filters.minPendingAmount === '' ? undefined : Number(filters.minPendingAmount),
        maxPendingAmount: filters.maxPendingAmount === '' ? undefined : Number(filters.maxPendingAmount),
      });
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || 'Failed to load pending bills report.');
      setRows([]);
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

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, r) => {
        acc.contract += Number(r.contractSum || 0);
        acc.paid += Number(r.amountPaid || 0);
        acc.pending += Number(r.pendingBill || 0);
        return acc;
      },
      { contract: 0, paid: 0, pending: 0 }
    );
  }, [rows]);

  useEffect(() => {
    setAIPageContext({
      pageType: 'pending-bills-report',
      filters,
      screenSummary: {
        projects: rows.length,
        totalContract: totals.contract,
        totalPaid: totals.paid,
        totalPending: totals.pending,
      },
    });
    return () => clearAIPageContext();
  }, [filters, rows.length, totals, setAIPageContext, clearAIPageContext]);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const { blob, fileName } = await reportsService.downloadPendingBillsReport({
        ...filters,
        minPendingAmount: filters.minPendingAmount === '' ? undefined : Number(filters.minPendingAmount),
        maxPendingAmount: filters.maxPendingAmount === '' ? undefined : Number(filters.maxPendingAmount),
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName || 'pending-bills-report.xlsx';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || 'Failed to download pending bills report.');
    } finally {
      setDownloading(false);
    }
  };

  const handleExportPdf = async () => {
    setExportingPdf(true);
    try {
      const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
      const logoDataUrl = await getCountyLogoDataUrl();
      let y = drawCountyOfficialHeader(doc, {
        unit: 'pt',
        logoDataUrl,
        title: 'Pending Bills Report',
        departmentName: filters.department || '',
      });
      const activeFilters = Object.entries(filters)
        .filter(([, value]) => String(value ?? '').trim() !== '' && value !== 500)
        .map(([key, value]) => `${key}: ${value}`)
        .join(', ');

      doc.setFontSize(9);
      doc.text(`Generated: ${new Date().toLocaleString()} | Filters: ${activeFilters || 'All scoped records'}`, 40, y);
      y += 16;

      autoTable(doc, {
        startY: y,
        head: [['Rows', 'Contract Sum', 'Paid', 'Pending']],
        body: [[
          rows.length.toLocaleString(),
          totals.contract.toLocaleString(),
          totals.paid.toLocaleString(),
          totals.pending.toLocaleString(),
        ]],
        styles: { fontSize: 8, cellPadding: 4 },
        headStyles: { fillColor: [22, 96, 136] },
      });

      autoTable(doc, {
        startY: doc.lastAutoTable.finalY + 16,
        head: [['Project', 'Department', 'Status', 'Contract', 'Paid', 'Pending', 'Certificates', 'Last Certificate']],
        body: rows.map((r) => [
          r.projectName || '-',
          r.department || '-',
          r.status || '-',
          Number(r.contractSum || 0).toLocaleString(),
          Number(r.amountPaid || 0).toLocaleString(),
          Number(r.pendingBill || 0).toLocaleString(),
          Number(r.certificatesGenerated || 0).toLocaleString(),
          r.lastCertificateDate ? String(r.lastCertificateDate).slice(0, 10) : '-',
        ]),
        styles: { fontSize: 7, cellPadding: 3, overflow: 'linebreak' },
        headStyles: { fillColor: [22, 96, 136] },
        columnStyles: {
          3: { halign: 'right' },
          4: { halign: 'right' },
          5: { halign: 'right' },
          6: { halign: 'right' },
        },
        margin: { top: 40, left: 40, right: 40 },
      });

      doc.save(`pending-bills-report-${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (e) {
      setError(e?.message || 'Failed to export pending bills report PDF.');
    } finally {
      setExportingPdf(false);
    }
  };

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      <Paper sx={{ p: { xs: 2, md: 3 } }}>
        <Typography variant="h5" sx={{ fontWeight: 700, mb: 0.5 }}>
          Pending Bills Report
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Filter projects with unpaid balances and export the report as PDF or Excel.
        </Typography>

        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        <Grid container spacing={1.5} sx={{ mb: 2 }}>
          <Grid item xs={12} md={3}>
            <TextField
              select
              fullWidth
              size="small"
              sx={{ minWidth: 180 }}
              label="Department"
              value={filters.department}
              onChange={(e) => setFilters((p) => ({ ...p, department: e.target.value }))}
            >
              <MenuItem value="">All</MenuItem>
              {departments.map((d) => <MenuItem key={d} value={d}>{d}</MenuItem>)}
            </TextField>
          </Grid>
          <Grid item xs={12} md={2}>
            <TextField
              select
              fullWidth
              size="small"
              sx={{ minWidth: 160 }}
              label="Status"
              value={filters.status}
              onChange={(e) => setFilters((p) => ({ ...p, status: e.target.value }))}
            >
              {STATUS_OPTIONS.map((s) => <MenuItem key={s || 'all'} value={s}>{s || 'All'}</MenuItem>)}
            </TextField>
          </Grid>
          <Grid item xs={12} md={3}>
            <TextField
              fullWidth
              size="small"
              label="Project name contains"
              value={filters.projectName}
              onChange={(e) => setFilters((p) => ({ ...p, projectName: e.target.value }))}
            />
          </Grid>
          <Grid item xs={12} md={2}>
            <TextField
              fullWidth
              size="small"
              type="number"
              label="Min pending"
              value={filters.minPendingAmount}
              onChange={(e) => setFilters((p) => ({ ...p, minPendingAmount: e.target.value }))}
            />
          </Grid>
          <Grid item xs={12} md={2}>
            <TextField
              fullWidth
              size="small"
              type="number"
              label="Max pending"
              value={filters.maxPendingAmount}
              onChange={(e) => setFilters((p) => ({ ...p, maxPendingAmount: e.target.value }))}
            />
          </Grid>
          <Grid item xs={12} md={2}>
            <TextField
              select
              fullWidth
              size="small"
              sx={{ minWidth: 160 }}
              label="Include cleared"
              value={filters.includeZeroPending}
              onChange={(e) => setFilters((p) => ({ ...p, includeZeroPending: e.target.value }))}
            >
              <MenuItem value="false">No</MenuItem>
              <MenuItem value="true">Yes</MenuItem>
            </TextField>
          </Grid>
          <Grid item xs={12} md={2}>
            <TextField
              fullWidth
              size="small"
              type="number"
              label="Max rows"
              value={filters.limit}
              onChange={(e) => setFilters((p) => ({ ...p, limit: Number(e.target.value || 500) }))}
            />
          </Grid>
          <Grid item xs={12} md={8}>
            <Stack direction="row" spacing={1}>
              <Button variant="contained" onClick={load} disabled={loading}>
                {loading ? 'Loading...' : 'Apply filters'}
              </Button>
              <Button
                variant="outlined"
                startIcon={<DownloadIcon />}
                onClick={handleDownload}
                disabled={downloading || exportingPdf}
              >
                {downloading ? 'Preparing...' : 'Download Excel'}
              </Button>
              <Button
                variant="contained"
                startIcon={<PictureAsPdfIcon />}
                onClick={handleExportPdf}
                disabled={loading || rows.length === 0 || downloading || exportingPdf}
              >
                {exportingPdf ? 'Preparing...' : 'Export PDF'}
              </Button>
            </Stack>
          </Grid>
        </Grid>

        <Alert severity="info" sx={{ mb: 2 }}>
          Rows: {rows.length} | Contract Sum: {totals.contract.toLocaleString()} | Paid: {totals.paid.toLocaleString()} | Pending: {totals.pending.toLocaleString()}
        </Alert>

        <Paper variant="outlined">
          {loading ? (
            <Box sx={{ p: 3, textAlign: 'center' }}>
              <CircularProgress size={22} />
            </Box>
          ) : (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Project</TableCell>
                  <TableCell>Department</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell align="right">Contract</TableCell>
                  <TableCell align="right">Paid</TableCell>
                  <TableCell align="right">Pending</TableCell>
                  <TableCell align="right">Certificates</TableCell>
                  <TableCell>Last Certificate</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={`${r.projectId}-${r.projectName}`}>
                    <TableCell>{r.projectName || '-'}</TableCell>
                    <TableCell>{r.department || '-'}</TableCell>
                    <TableCell>{r.status || '-'}</TableCell>
                    <TableCell align="right">{Number(r.contractSum || 0).toLocaleString()}</TableCell>
                    <TableCell align="right">{Number(r.amountPaid || 0).toLocaleString()}</TableCell>
                    <TableCell align="right">{Number(r.pendingBill || 0).toLocaleString()}</TableCell>
                    <TableCell align="right">{Number(r.certificatesGenerated || 0)}</TableCell>
                    <TableCell>{r.lastCertificateDate ? String(r.lastCertificateDate).slice(0, 10) : '-'}</TableCell>
                  </TableRow>
                ))}
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} align="center">No rows match your filters.</TableCell>
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

