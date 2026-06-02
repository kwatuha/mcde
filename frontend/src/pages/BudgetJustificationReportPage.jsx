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
import DescriptionIcon from '@mui/icons-material/Description';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import reportsService from '../api/reportsService';
import { drawCountyOfficialHeader, getCountyLogoDataUrl, getCountyOfficialName } from '../utils/countyOfficialPdfHeader';

const STATUS_OPTIONS = ['', 'Not Started', 'Initiated', 'In Progress', 'Completed', 'At Risk', 'Delayed', 'Stalled', 'On Hold'];

const formatMoney = (value) => `KES ${Number(value || 0).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const downloadBlob = (blob, fileName) => {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
};

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
  const [exportingDoc, setExportingDoc] = useState(false);
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
    setError('');
    try {
      const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
      const logoDataUrl = await getCountyLogoDataUrl();
      const y = drawCountyOfficialHeader(doc, {
        unit: 'pt',
        margin: 40,
        logoDataUrl,
        title: 'Budget Estimates Justification Within Ceilings',
      });

      doc.setFontSize(8);
      doc.text(`Generated: ${new Date().toLocaleString('en-KE')}`, 40, y);
      doc.text(totalsLine, 40, y + 12);

      autoTable(doc, {
        startY: y + 26,
        head: [['Project', 'Department', 'Status', 'Budget', 'Paid', 'Pending', 'Remarks']],
        body: rows.map((r) => [
          r.projectName || '-',
          r.department || '-',
          r.status || '-',
          formatMoney(r.budgetAmount),
          formatMoney(r.paidAmount),
          formatMoney(r.pendingAmount),
          r.justificationHint || '-',
        ]),
        theme: 'grid',
        styles: { fontSize: 8, cellPadding: 4, overflow: 'linebreak' },
        headStyles: { fillColor: [10, 45, 104], textColor: 255, fontStyle: 'bold' },
        margin: { left: 40, right: 40 },
        columnStyles: {
          0: { cellWidth: 155 },
          1: { cellWidth: 120 },
          3: { halign: 'right' },
          4: { halign: 'right' },
          5: { halign: 'right' },
          6: { cellWidth: 180 },
        },
      });

      doc.save(`budget-justification-${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || 'Failed to download budget justification report.');
    } finally {
      setDownloading(false);
    }
  };

  const handleExportDoc = async () => {
    setExportingDoc(true);
    setError('');
    try {
      const logoDataUrl = await getCountyLogoDataUrl();
      const generatedAt = new Date().toLocaleString('en-KE');
      const countyName = getCountyOfficialName();
      const tableRows = rows.map((r, index) => `
        <tr>
          <td class="center">${index + 1}</td>
          <td>${escapeHtml(r.projectName || '-')}</td>
          <td>${escapeHtml(r.department || '-')}</td>
          <td>${escapeHtml(r.status || '-')}</td>
          <td class="money">${escapeHtml(formatMoney(r.budgetAmount))}</td>
          <td class="money">${escapeHtml(formatMoney(r.paidAmount))}</td>
          <td class="money">${escapeHtml(formatMoney(r.pendingAmount))}</td>
          <td>${escapeHtml(r.justificationHint || '-')}</td>
        </tr>
      `).join('');
      const html = `
        <!doctype html>
        <html>
          <head>
            <meta charset="utf-8" />
            <title>Budget Justification Report</title>
            <style>
              @page { size: A4 landscape; margin: 18mm 14mm; }
              body { font-family: Arial, Helvetica, sans-serif; color: #111827; font-size: 10pt; }
              .header { text-align: center; margin-bottom: 14px; }
              .logo { width: 72px; height: 72px; object-fit: contain; margin-bottom: 8px; }
              .header h1, .header h2, .header h3 { margin: 3px 0; text-transform: uppercase; }
              .header h1 { font-size: 12pt; }
              .header h2 { font-size: 13pt; }
              .header h3 { font-size: 12pt; }
              .rule { border-top: 1px solid #9ca3af; margin-top: 10px; }
              .meta { margin: 12px 0; font-size: 9pt; color: #374151; }
              .summary { width: 100%; border-collapse: collapse; margin: 8px 0 14px; }
              .summary td { border: 1px solid #cbd5e1; padding: 6px; }
              .summary .label { background: #e8f1fb; font-weight: bold; }
              table.report { width: 100%; border-collapse: collapse; table-layout: fixed; }
              table.report th { background: #0a2d68; color: white; padding: 6px; border: 1px solid #0a2d68; font-size: 8.5pt; }
              table.report td { padding: 6px; border: 1px solid #cbd5e1; vertical-align: top; font-size: 8.5pt; }
              .center { text-align: center; }
              .money { text-align: right; white-space: nowrap; }
            </style>
          </head>
          <body>
            <div class="header">
              ${logoDataUrl ? `<img class="logo" src="${logoDataUrl}" alt="County logo" />` : ''}
              <h1>Republic of Kenya</h1>
              <h2>${escapeHtml(countyName || 'County Government')}</h2>
              <h3>Budget Estimates Justification Within Ceilings</h3>
              <div class="rule"></div>
            </div>
            <div class="meta">Generated: ${escapeHtml(generatedAt)}<br />${escapeHtml(totalsLine)}</div>
            <table class="summary">
              <tr>
                <td class="label">Projects</td><td>${escapeHtml(summary.count)}</td>
                <td class="label">Total Budget</td><td>${escapeHtml(formatMoney(summary.totalBudget))}</td>
              </tr>
              <tr>
                <td class="label">Total Paid</td><td>${escapeHtml(formatMoney(summary.totalPaid))}</td>
                <td class="label">Pending / Variance</td><td>${escapeHtml(formatMoney(summary.totalPending))}</td>
              </tr>
            </table>
            <table class="report">
              <thead>
                <tr>
                  <th style="width: 4%;">#</th>
                  <th style="width: 20%;">Project</th>
                  <th style="width: 14%;">Department</th>
                  <th style="width: 10%;">Status</th>
                  <th style="width: 12%;">Budget</th>
                  <th style="width: 12%;">Paid</th>
                  <th style="width: 12%;">Pending</th>
                  <th style="width: 16%;">Remarks</th>
                </tr>
              </thead>
              <tbody>
                ${tableRows || '<tr><td colspan="8" class="center">No projects match your filters.</td></tr>'}
              </tbody>
            </table>
          </body>
        </html>
      `;
      const blob = new Blob(['\ufeff', html], { type: 'application/msword;charset=utf-8' });
      downloadBlob(blob, `budget-justification-${new Date().toISOString().slice(0, 10)}.doc`);
    } catch (e) {
      setError(e?.message || 'Failed to export budget justification report to DOC.');
    } finally {
      setExportingDoc(false);
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
              <Button variant="outlined" startIcon={<DescriptionIcon />} onClick={handleExportDoc} disabled={exportingDoc}>
                {exportingDoc ? 'Preparing...' : 'Export DOC'}
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
                  <TableCell>Remarks</TableCell>
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

