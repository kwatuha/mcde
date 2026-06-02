import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Grid,
  LinearProgress,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import VisibilityIcon from '@mui/icons-material/Visibility';
import { DataGrid } from '@mui/x-data-grid';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import reportsService from '../api/reportsService';
import Header from './dashboard/Header';
import { drawCountyOfficialHeader, getCountyLogoDataUrl } from '../utils/countyOfficialPdfHeader';

const fmtCurrency = (value) =>
  `KES ${Number(value || 0).toLocaleString('en-KE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const fmtNumber = (value) => Number(value || 0).toLocaleString('en-KE');
const fmtPercent = (value) => `${Number(value || 0).toFixed(1)}%`;

function fmtDate(value) {
  if (!value) return 'Undated';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString('en-KE', { year: 'numeric', month: 'short', day: '2-digit' });
}

export default function PaymentListPage() {
  const navigate = useNavigate();
  const [filters, setFilters] = useState({
    startDate: '',
    endDate: '',
    search: '',
    department: '',
    source: '',
    limit: 5000,
  });
  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState({});
  const [options, setOptions] = useState({ departments: [], sources: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await reportsService.getPaymentList(filtersRef.current);
      setRows(Array.isArray(data?.rows) ? data.rows : []);
      setSummary(data?.summary || {});
      setOptions(data?.options || { departments: [], sources: [] });
    } catch (e) {
      setRows([]);
      setSummary({});
      setError(e?.response?.data?.message || e?.message || 'Failed to load payment list.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const byDepartment = useMemo(() => {
    const map = new Map();
    rows.forEach((row) => {
      const key = row.department || 'Unassigned';
      map.set(key, (map.get(key) || 0) + Number(row.amount || 0));
    });
    return [...map.entries()]
      .map(([department, amount]) => ({ department, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);
  }, [rows]);

  const maxDepartmentAmount = Math.max(...byDepartment.map((row) => row.amount), 0);

  const filterDescription = useMemo(() => {
    const parts = [];
    if (filters.startDate) parts.push(`From: ${filters.startDate}`);
    if (filters.endDate) parts.push(`To: ${filters.endDate}`);
    if (filters.department) parts.push(`Department: ${filters.department}`);
    if (filters.source) parts.push(`Source: ${filters.source}`);
    if (filters.search) parts.push(`Search: ${filters.search}`);
    return parts.length ? parts.join(' | ') : 'All payment records';
  }, [filters]);

  const summaryCards = useMemo(() => ([
    { label: 'Payment Rows', value: fmtNumber(summary.rowCount), sub: `${fmtNumber(summary.projectCount)} projects` },
    { label: 'Total Paid', value: fmtCurrency(summary.totalPaid), sub: `${fmtPercent(summary.absorptionPercentage)} absorption` },
    { label: 'Total Budget', value: fmtCurrency(summary.totalBudget), sub: `Contracted: ${fmtCurrency(summary.totalContracted)}` },
    { label: 'Funding Context', value: fmtCurrency(summary.totalFunding), sub: `${fmtPercent(summary.fundingCoveragePercentage)} coverage` },
    { label: 'Certified Amount', value: fmtCurrency(summary.totalCertified), sub: 'From payment certificates where available' },
  ]), [summary]);

  const exportRows = useMemo(() => rows.map((row) => ({
    'Payment Date': row.paymentDate || '',
    'Project Code': row.projectCode || '',
    'Project Name': row.projectName || '',
    Department: row.department || '',
    Status: row.status || '',
    Narration: row.narration || '',
    'Amount (KES)': Number(row.amount || 0),
    'Budget (KES)': Number(row.budgetAmount || 0),
    'Contracted (KES)': Number(row.contractedAmount || 0),
    'Project Paid Total (KES)': Number(row.paidAmount || 0),
    'Funding Context (KES)': Number(row.fundingAmount || 0),
    'Certified Amount (KES)': Number(row.certifiedAmount || 0),
    'Absorption %': Number(row.absorptionPercentage || 0),
    'Data Source': row.dataSource || '',
  })), [rows]);

  const handleFilterChange = (field, value) => {
    setFilters((previous) => ({ ...previous, [field]: value }));
  };

  const handleExportExcel = () => {
    setNotice('');
    setError('');
    try {
      const workbook = XLSX.utils.book_new();
      workbook.Props = {
        Title: 'Payment List',
        Subject: filterDescription,
        Author: 'Machakos Project Management System',
        CreatedDate: new Date(),
      };
      const summarySheet = XLSX.utils.aoa_to_sheet([
        ['PAYMENT LIST'],
        [`Generated: ${new Date().toLocaleString()}`],
        [`Filters: ${filterDescription}`],
        [],
        ['Metric', 'Value'],
        ['Payment rows', Number(summary.rowCount || 0)],
        ['Projects', Number(summary.projectCount || 0)],
        ['Total paid', Number(summary.totalPaid || 0)],
        ['Total budget', Number(summary.totalBudget || 0)],
        ['Total contracted', Number(summary.totalContracted || 0)],
        ['Funding context', Number(summary.totalFunding || 0)],
        ['Certified amount', Number(summary.totalCertified || 0)],
        ['Absorption %', Number(summary.absorptionPercentage || 0)],
      ]);
      summarySheet['!cols'] = [{ wch: 28 }, { wch: 42 }];
      XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary');

      const detailsSheet = XLSX.utils.json_to_sheet(exportRows);
      detailsSheet['!cols'] = Object.keys(exportRows[0] || { 'Payment Date': '' }).map((key) => ({
        wch: key.includes('Name') || key === 'Narration' ? 34 : 18,
      }));
      XLSX.utils.book_append_sheet(workbook, detailsSheet, 'Payment List');
      XLSX.writeFile(workbook, `payment-list-${new Date().toISOString().slice(0, 10)}.xlsx`);
      setNotice('Excel export generated.');
    } catch (e) {
      setError(e?.message || 'Excel export failed.');
    }
  };

  const handleExportPdf = async () => {
    setNotice('');
    setError('');
    try {
      const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
      const logo = await getCountyLogoDataUrl();
      let y = drawCountyOfficialHeader(doc, {
        title: 'Payment List',
        subtitle: filterDescription,
        logoDataUrl: logo,
        orientation: 'landscape',
      });
      autoTable(doc, {
        startY: y + 8,
        head: [['Metric', 'Value', 'Notes']],
        body: [
          ['Payment rows', fmtNumber(summary.rowCount), `${fmtNumber(summary.projectCount)} projects`],
          ['Total paid', fmtCurrency(summary.totalPaid), `${fmtPercent(summary.absorptionPercentage)} absorption`],
          ['Total budget', fmtCurrency(summary.totalBudget), `Contracted: ${fmtCurrency(summary.totalContracted)}`],
          ['Funding context', fmtCurrency(summary.totalFunding), `${fmtPercent(summary.fundingCoveragePercentage)} coverage`],
          ['Certified amount', fmtCurrency(summary.totalCertified), 'Where certificates exist'],
        ],
        theme: 'grid',
        styles: { fontSize: 8 },
        headStyles: { fillColor: [10, 45, 104] },
        margin: { left: 36, right: 36 },
      });
      y = doc.lastAutoTable.finalY + 14;
      autoTable(doc, {
        startY: y,
        head: [['Date', 'Code', 'Project', 'Department', 'Narration', 'Amount', 'Source']],
        body: rows.map((row) => [
          fmtDate(row.paymentDate),
          row.projectCode || '',
          row.projectName || '',
          row.department || '',
          row.narration || '',
          fmtCurrency(row.amount),
          row.dataSource || '',
        ]),
        theme: 'striped',
        styles: { fontSize: 7, cellPadding: 3 },
        headStyles: { fillColor: [10, 45, 104] },
        columnStyles: {
          2: { cellWidth: 150 },
          3: { cellWidth: 110 },
          4: { cellWidth: 170 },
          5: { halign: 'right' },
        },
        margin: { left: 36, right: 36 },
      });
      doc.save(`payment-list-${new Date().toISOString().slice(0, 10)}.pdf`);
      setNotice('PDF export generated.');
    } catch (e) {
      setError(e?.message || 'PDF export failed.');
    }
  };

  const columns = [
    {
      field: 'paymentDate',
      headerName: 'Payment Date',
      width: 130,
      valueFormatter: (value) => fmtDate(value),
    },
    { field: 'projectCode', headerName: 'Project Code', width: 130 },
    {
      field: 'projectName',
      headerName: 'Project Name',
      flex: 1,
      minWidth: 220,
      renderCell: (params) => (
        <Button
          size="small"
          variant="text"
          onClick={() => params.row.projectId && navigate(`/projects/${params.row.projectId}`)}
          sx={{ justifyContent: 'flex-start', textAlign: 'left' }}
        >
          {params.row.projectName || 'View project'}
        </Button>
      ),
    },
    { field: 'department', headerName: 'Department', width: 180 },
    {
      field: 'narration',
      headerName: 'Narration',
      flex: 1,
      minWidth: 240,
    },
    {
      field: 'amount',
      headerName: 'Amount (KES)',
      width: 150,
      align: 'right',
      headerAlign: 'right',
      valueFormatter: (value) => fmtCurrency(value).replace('KES ', ''),
    },
    {
      field: 'absorptionPercentage',
      headerName: 'Absorption',
      width: 130,
      valueFormatter: (value) => fmtPercent(value),
    },
    {
      field: 'dataSource',
      headerName: 'Source',
      width: 170,
      renderCell: (params) => <Chip size="small" label={params.value || 'Project paid amount'} />,
    },
    {
      field: 'actions',
      headerName: '',
      width: 70,
      sortable: false,
      renderCell: (params) => (
        <Button
          size="small"
          startIcon={<VisibilityIcon fontSize="small" />}
          onClick={() => params.row.projectId && navigate(`/projects/${params.row.projectId}`)}
          disabled={!params.row.projectId}
        >
          View
        </Button>
      ),
    },
  ];

  return (
    <Box sx={{ p: { xs: 1.5, md: 2.5 } }}>
      <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={1.5} sx={{ mb: 2 }}>
        <Header
          title="Payment List"
          subtitle="Payments contextualized with project budgets, funding sources, certificates, and absorption"
        />
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
          <Button variant="outlined" startIcon={<DownloadIcon />} onClick={handleExportExcel} disabled={!rows.length}>
            Export Excel
          </Button>
          <Button variant="outlined" startIcon={<PictureAsPdfIcon />} onClick={handleExportPdf} disabled={!rows.length}>
            Export PDF
          </Button>
        </Stack>
      </Stack>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}
      {notice && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setNotice('')}>
          {notice}
        </Alert>
      )}

      <Paper sx={{ p: 2, mb: 2 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} sm={6} md={2}>
            <TextField
              fullWidth
              size="small"
              type="date"
              label="Start Date"
              value={filters.startDate}
              onChange={(event) => handleFilterChange('startDate', event.target.value)}
              InputLabelProps={{ shrink: true }}
            />
          </Grid>
          <Grid item xs={12} sm={6} md={2}>
            <TextField
              fullWidth
              size="small"
              type="date"
              label="End Date"
              value={filters.endDate}
              onChange={(event) => handleFilterChange('endDate', event.target.value)}
              InputLabelProps={{ shrink: true }}
            />
          </Grid>
          <Grid item xs={12} sm={6} md={2.5}>
            <TextField
              fullWidth
              size="small"
              select
              label="Department"
              value={filters.department}
              onChange={(event) => handleFilterChange('department', event.target.value)}
              sx={{ minWidth: 180 }}
            >
              <MenuItem value="">All departments</MenuItem>
              {(options.departments || []).map((department) => (
                <MenuItem key={department} value={department}>
                  {department}
                </MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid item xs={12} sm={6} md={2}>
            <TextField
              fullWidth
              size="small"
              select
              label="Data Source"
              value={filters.source}
              onChange={(event) => handleFilterChange('source', event.target.value)}
              sx={{ minWidth: 170 }}
            >
              <MenuItem value="">All sources</MenuItem>
              {(options.sources || []).map((source) => (
                <MenuItem key={source} value={source}>
                  {source}
                </MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid item xs={12} sm={8} md={2.5}>
            <TextField
              fullWidth
              size="small"
              label="Search"
              placeholder="Project, code, narration..."
              value={filters.search}
              onChange={(event) => handleFilterChange('search', event.target.value)}
            />
          </Grid>
          <Grid item xs={12} sm={4} md={1}>
            <Button fullWidth variant="contained" onClick={load}>
              Apply
            </Button>
          </Grid>
        </Grid>
      </Paper>

      <Grid container spacing={2} sx={{ mb: 2 }}>
        {summaryCards.map((card) => (
          <Grid item xs={12} sm={6} md={2.4} key={card.label}>
            <Card sx={{ height: '100%' }}>
              <CardContent>
                <Typography variant="body2" color="text.secondary">
                  {card.label}
                </Typography>
                <Typography variant="h6" fontWeight={800}>
                  {card.value}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {card.sub}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid item xs={12} md={8}>
          <Paper sx={{ p: 2, height: '100%' }}>
            <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1 }}>
              Payment Concentration by Department
            </Typography>
            <Stack spacing={1.25}>
              {byDepartment.length ? byDepartment.map((item) => (
                <Box key={item.department}>
                  <Stack direction="row" justifyContent="space-between" spacing={2}>
                    <Typography variant="body2" noWrap>
                      {item.department}
                    </Typography>
                    <Typography variant="body2" fontWeight={700}>
                      {fmtCurrency(item.amount)}
                    </Typography>
                  </Stack>
                  <LinearProgress
                    variant="determinate"
                    value={maxDepartmentAmount ? (item.amount / maxDepartmentAmount) * 100 : 0}
                    sx={{ height: 8, borderRadius: 999, mt: 0.5 }}
                  />
                </Box>
              )) : (
                <Typography variant="body2" color="text.secondary">
                  No payment rows match the current filters.
                </Typography>
              )}
            </Stack>
          </Paper>
        </Grid>
        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 2, height: '100%' }}>
            <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1 }}>
              Data Context
            </Typography>
            <Typography variant="body2" color="text.secondary">
              This list uses actual payment rows where available. If no payment ledger rows exist, it uses the project
              registry paid amount so the report still reflects the financial tracking data already captured in project
              details, certificates, and funding source reports.
            </Typography>
          </Paper>
        </Grid>
      </Grid>

      <Paper sx={{ p: 2 }}>
        {loading ? (
          <Stack alignItems="center" sx={{ py: 8 }}>
            <CircularProgress />
          </Stack>
        ) : (
          <DataGrid
            autoHeight
            rows={rows}
            columns={columns}
            disableRowSelectionOnClick
            getRowHeight={() => 'auto'}
            initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
            pageSizeOptions={[10, 25, 50, 100]}
          />
        )}
      </Paper>
    </Box>
  );
}
