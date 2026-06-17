import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import DeleteIcon from '@mui/icons-material/Delete';
import DownloadIcon from '@mui/icons-material/Download';
import EditIcon from '@mui/icons-material/Edit';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import RefreshIcon from '@mui/icons-material/Refresh';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import apiService from '../api';
import { useAIPageContext } from '../context/AIPageContext.jsx';
import { drawCountyOfficialHeader, getCountyLogoDataUrl } from '../utils/countyOfficialPdfHeader';

function formatNumber(value) {
  return Number(value || 0).toLocaleString();
}

function formatCurrency(value) {
  return Number(value || 0).toLocaleString('en-KE', { maximumFractionDigits: 2 });
}

function KpiCard({ title, value, helper }) {
  return (
    <Card variant="outlined" sx={{ height: '100%' }}>
      <CardContent sx={{ p: 1.1, '&:last-child': { pb: 1.1 } }}>
        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 800, lineHeight: 1 }}>
          {title}
        </Typography>
        <Typography variant="h6" sx={{ fontWeight: 900, lineHeight: 1.2, mt: 0.25 }}>
          {value}
        </Typography>
        {helper && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.15 }}>
            {helper}
          </Typography>
        )}
      </CardContent>
    </Card>
  );
}

const emptyProjectForm = {
  projectName: '',
  sectorName: '',
  programmeName: '',
  subprogrammeName: '',
  locationText: '',
  ward: '',
  sublocation: '',
  village: '',
  activityDescription: '',
  estimatedCost: '',
  fundingSource: '',
  timeframe: '',
  performanceIndicator: '',
  target: '',
  planStatus: '',
  implementingAgency: '',
};

export default function ADPImplementationPage() {
  const navigate = useNavigate();
  const [plans, setPlans] = useState([]);
  const [selectedPlanCode, setSelectedPlanCode] = useState('');
  const [summary, setSummary] = useState({});
  const [rows, setRows] = useState([]);
  const [filters, setFilters] = useState({ search: '', sector: '', status: '' });
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [editingRow, setEditingRow] = useState(null);
  const [deleteRow, setDeleteRow] = useState(null);
  const [projectForm, setProjectForm] = useState(emptyProjectForm);
  const [formErrors, setFormErrors] = useState({});
  const { setAIPageContext, clearAIPageContext } = useAIPageContext();

  const selectedPlan = useMemo(
    () => plans.find((plan) => plan.adpCode === selectedPlanCode) || plans[0] || null,
    [plans, selectedPlanCode]
  );

  const sectorOptions = useMemo(() => {
    const values = new Set(rows.map((row) => row.sectorName).filter(Boolean));
    return [...values].sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const statusOptions = useMemo(() => {
    const values = new Set(rows.map((row) => row.planStatus).filter(Boolean));
    return [...values].sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const exportRows = useMemo(() => rows.map((row, index) => ({
    '#': index + 1,
    'ADP Project': row.projectName || '',
    Sector: row.sectorName || 'Unspecified',
    Programme: row.programmeName || '',
    Subprogramme: row.subprogrammeName || '',
    Location: row.locationText || [row.ward, row.sublocation, row.village].filter(Boolean).join(' / ') || 'County wide',
    Status: row.planStatus || 'Unspecified',
    'Performance Indicator': row.performanceIndicator || '',
    Target: row.target || '',
    'ADP Cost': Number(row.estimatedCost || 0),
    'Budgeted Amount': Number(row.budgetedAmount || 0),
    'Budget Count': Number(row.budgetCount || 0),
    'Linked Projects': Number(row.linkedProjectCount || 0),
    'Actual Budget': Number(row.actualBudget || 0),
    Paid: Number(row.actualPaid || 0),
  })), [rows]);

  const loadPlans = useCallback(async () => {
    const data = await apiService.adp.getPlans();
    const nextPlans = Array.isArray(data) ? data : [];
    setPlans(nextPlans);
    setSelectedPlanCode((prev) => prev || nextPlans[0]?.adpCode || '');
  }, []);

  const loadReport = useCallback(async () => {
    if (!selectedPlan?.adpCode) return;
    setLoading(true);
    setError('');
    try {
      const params = {
        adpCode: selectedPlan.adpCode,
        ...Object.fromEntries(Object.entries(filters).filter(([, value]) => String(value || '').trim())),
      };
      const [summaryData, projectData] = await Promise.all([
        apiService.adp.getSummary({ adpCode: selectedPlan.adpCode }),
        apiService.adp.getProjects(params),
      ]);
      setSummary(summaryData || {});
      setRows(Array.isArray(projectData?.rows) ? projectData.rows : []);
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || 'Failed to load ADP implementation report.');
      setRows([]);
      setSummary({});
    } finally {
      setLoading(false);
    }
  }, [filters, selectedPlan]);

  useEffect(() => {
    loadPlans().catch((e) => setError(e?.response?.data?.message || e?.message || 'Failed to load ADP plans.'));
  }, [loadPlans]);

  useEffect(() => {
    setAIPageContext({
      pageType: 'adp-implementation',
      adpPlanId: selectedPlan?.id,
      adpPlanName: selectedPlan?.adpName,
      adpFinancialYear: selectedPlan?.financialYear,
      adpPlanCode: selectedPlan?.adpCode,
      summary: {
        adpPlanId: selectedPlan?.id,
        plannedProjects: summary.plannedProjects,
        budgetedAdpProjects: summary.budgetedAdpProjects,
        linkedProjects: summary.linkedProjects,
        plannedBudget: summary.plannedBudget,
        budgetedAmount: summary.budgetedAmount,
        actualBudget: summary.actualBudget,
        actualPaid: summary.actualPaid,
      },
      filters,
    });
    return () => clearAIPageContext();
  }, [selectedPlan, summary, filters, setAIPageContext, clearAIPageContext]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  const handleGenerateSuggestions = async () => {
    if (!selectedPlan?.id) return;
    setGenerating(true);
    setError('');
    setMessage('');
    try {
      const result = await apiService.adp.generateSuggestions(selectedPlan.id);
      setMessage(`Generated or refreshed ${formatNumber(result?.insertedOrUpdated || 0)} ADP link suggestions.`);
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || 'Failed to generate ADP link suggestions.');
    } finally {
      setGenerating(false);
    }
  };

  const handleOpenEdit = (row) => {
    setEditingRow(row);
    setProjectForm({
      projectName: row.projectName || '',
      sectorName: row.sectorName || '',
      programmeName: row.programmeName || '',
      subprogrammeName: row.subprogrammeName || '',
      locationText: row.locationText || '',
      ward: row.ward || '',
      sublocation: row.sublocation || '',
      village: row.village || '',
      activityDescription: row.activityDescription || '',
      estimatedCost: row.estimatedCost ?? '',
      fundingSource: row.fundingSource || '',
      timeframe: row.timeframe || '',
      performanceIndicator: row.performanceIndicator || '',
      target: row.target || '',
      planStatus: row.planStatus || '',
      implementingAgency: row.implementingAgency || '',
    });
    setFormErrors({});
    setError('');
    setMessage('');
  };

  const handleCloseEdit = () => {
    setEditingRow(null);
    setProjectForm(emptyProjectForm);
    setFormErrors({});
  };

  const handleProjectFormChange = (field, value) => {
    setProjectForm((prev) => ({ ...prev, [field]: value }));
    if (formErrors[field]) {
      setFormErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  };

  const handleSaveProject = async () => {
    const nextErrors = {};
    if (!String(projectForm.projectName || '').trim()) {
      nextErrors.projectName = 'Project name is required.';
    }
    if (projectForm.estimatedCost !== '' && Number.isNaN(Number(projectForm.estimatedCost))) {
      nextErrors.estimatedCost = 'Estimated cost must be a number.';
    }
    setFormErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0 || !editingRow?.id) return;

    setSaving(true);
    setError('');
    setMessage('');
    try {
      await apiService.adp.updateProject(editingRow.id, {
        ...projectForm,
        estimatedCost: projectForm.estimatedCost === '' ? null : Number(projectForm.estimatedCost),
      });
      setMessage('ADP project updated successfully.');
      handleCloseEdit();
      await loadReport();
      await loadPlans();
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || 'Failed to update ADP project.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteProject = async () => {
    if (!deleteRow?.id) return;

    setSaving(true);
    setError('');
    setMessage('');
    try {
      await apiService.adp.deleteProject(deleteRow.id);
      setMessage('ADP project deleted successfully.');
      setDeleteRow(null);
      await loadReport();
      await loadPlans();
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || 'Failed to delete ADP project.');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateBudgetFromAdp = () => {
    if (!selectedPlan?.id) return;
    navigate(`/budget-management?mode=adp&adpPlanId=${selectedPlan.id}`);
  };

  const handleExportExcel = () => {
    const worksheet = XLSX.utils.json_to_sheet(exportRows);
    worksheet['!cols'] = [
      { wch: 6 },
      { wch: 34 },
      { wch: 28 },
      { wch: 30 },
      { wch: 28 },
      { wch: 24 },
      { wch: 14 },
      { wch: 34 },
      { wch: 14 },
      { wch: 16 },
      { wch: 18 },
      { wch: 12 },
      { wch: 15 },
      { wch: 16 },
      { wch: 16 },
    ];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'ADP Implementation');
    const summarySheet = XLSX.utils.aoa_to_sheet([
      ['ADP Implementation Summary'],
      ['Plan', selectedPlan?.adpName || ''],
      ['Financial Year', selectedPlan?.financialYear || ''],
      ['Planned Projects', Number(summary.plannedProjects || 0)],
      ['Budgeted ADP Projects', Number(summary.budgetedAdpProjects || 0)],
      ['Linked Registry Projects', Number(summary.linkedProjects || 0)],
      ['ADP Planned Budget', Number(summary.plannedBudget || 0)],
      ['Budgeted Amount', Number(summary.budgetedAmount || 0)],
      ['Actual Budget', Number(summary.actualBudget || 0)],
      ['Paid', Number(summary.actualPaid || 0)],
    ]);
    XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary');
    XLSX.writeFile(workbook, `adp-implementation-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const handleExportPdf = async () => {
    setExportingPdf(true);
    setError('');
    try {
      const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
      const logoDataUrl = await getCountyLogoDataUrl();
      let y = drawCountyOfficialHeader(doc, {
        unit: 'pt',
        logoDataUrl,
        title: 'ADP Implementation Report',
      });
      doc.setFontSize(9);
      doc.text(`Generated: ${new Date().toLocaleString()} | Plan: ${selectedPlan?.financialYear || ''} ${selectedPlan?.adpName || ''}`, 40, y);
      y += 16;

      autoTable(doc, {
        startY: y,
        head: [['Planned Projects', 'Budgeted ADP Rows', 'Linked Projects', 'Planned Budget', 'Budgeted Amount', 'Actual Budget', 'Paid']],
        body: [[
          formatNumber(summary.plannedProjects),
          formatNumber(summary.budgetedAdpProjects),
          formatNumber(summary.linkedProjects),
          `KES ${formatCurrency(summary.plannedBudget)}`,
          `KES ${formatCurrency(summary.budgetedAmount)}`,
          `KES ${formatCurrency(summary.actualBudget)}`,
          `KES ${formatCurrency(summary.actualPaid)}`,
        ]],
        styles: { fontSize: 8, cellPadding: 4 },
        headStyles: { fillColor: [22, 96, 136] },
      });

      autoTable(doc, {
        startY: doc.lastAutoTable.finalY + 12,
        head: [['ADP Project', 'Sector', 'Programme', 'Location', 'Status', 'ADP Cost', 'Budgeted', 'Linked', 'Actual Budget', 'Paid']],
        body: rows.map((row) => [
          row.projectName || '',
          row.sectorName || 'Unspecified',
          row.programmeName || '',
          row.locationText || [row.ward, row.sublocation, row.village].filter(Boolean).join(' / ') || 'County wide',
          row.planStatus || 'Unspecified',
          formatCurrency(row.estimatedCost),
          formatCurrency(row.budgetedAmount),
          formatNumber(row.linkedProjectCount),
          formatCurrency(row.actualBudget),
          formatCurrency(row.actualPaid),
        ]),
        styles: { fontSize: 6.5, cellPadding: 3, overflow: 'linebreak' },
        headStyles: { fillColor: [22, 96, 136] },
        columnStyles: {
          0: { cellWidth: 130 },
          1: { cellWidth: 105 },
          2: { cellWidth: 105 },
          3: { cellWidth: 90 },
          4: { cellWidth: 55 },
          5: { halign: 'right', cellWidth: 65 },
          6: { halign: 'right', cellWidth: 65 },
          7: { halign: 'right', cellWidth: 45 },
          8: { halign: 'right', cellWidth: 65 },
          9: { halign: 'right', cellWidth: 65 },
        },
        margin: { top: 40, left: 30, right: 30 },
      });

      doc.save(`adp-implementation-${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (e) {
      setError(e?.message || 'Failed to export ADP implementation PDF.');
    } finally {
      setExportingPdf(false);
    }
  };

  return (
    <Box sx={{ p: { xs: 1.5, md: 2 } }}>
      <Paper sx={{ p: { xs: 1.5, md: 2 } }}>
        <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={1} sx={{ mb: 1 }}>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="h6" sx={{ fontWeight: 900, lineHeight: 1.15 }}>
              ADP Implementation
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
              Annual plan priorities linked to registry projects, budgets, payments, and delivery status.
            </Typography>
          </Box>
          <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap justifyContent={{ xs: 'flex-start', md: 'flex-end' }}>
            <Button
              size="small"
              variant="contained"
              onClick={handleCreateBudgetFromAdp}
              disabled={!selectedPlan?.id}
            >
              Create Budget From ADP
            </Button>
            <Button
              size="small"
              variant="outlined"
              startIcon={<AutoFixHighIcon />}
              onClick={handleGenerateSuggestions}
              disabled={!selectedPlan?.id || generating}
            >
              {generating ? 'Generating...' : 'Generate Link Suggestions'}
            </Button>
            <Button size="small" variant="outlined" startIcon={<DownloadIcon />} onClick={handleExportExcel} disabled={loading || rows.length === 0}>
              Excel
            </Button>
            <Button size="small" variant="outlined" startIcon={<PictureAsPdfIcon />} onClick={handleExportPdf} disabled={loading || exportingPdf || rows.length === 0}>
              {exportingPdf ? 'Exporting...' : 'PDF'}
            </Button>
            <Button size="small" variant="contained" startIcon={<RefreshIcon />} onClick={loadReport} disabled={loading}>
              Refresh
            </Button>
          </Stack>
        </Stack>

        {error && <Alert severity="error" sx={{ mb: 1.5 }}>{error}</Alert>}
        {message && <Alert severity="success" sx={{ mb: 1.5 }}>{message}</Alert>}

        <Grid container spacing={1} alignItems="center" sx={{ mb: 1 }}>
          <Grid item xs={12} sm={6} md={3}>
            <TextField
              select
              fullWidth
              size="small"
              sx={{ minWidth: 220 }}
              label="ADP Plan"
              value={selectedPlan?.adpCode || ''}
              onChange={(event) => setSelectedPlanCode(event.target.value)}
            >
              {plans.map((plan) => (
                <MenuItem key={plan.id} value={plan.adpCode}>
                  {plan.financialYear} - {plan.adpName}
                </MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <TextField
              fullWidth
              size="small"
              sx={{ minWidth: 180 }}
              label="Search project"
              value={filters.search}
              onChange={(event) => setFilters((prev) => ({ ...prev, search: event.target.value }))}
            />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <TextField
              select
              fullWidth
              size="small"
              sx={{ minWidth: 190 }}
              label="Sector"
              value={filters.sector}
              onChange={(event) => setFilters((prev) => ({ ...prev, sector: event.target.value }))}
            >
              <MenuItem value="">All sectors</MenuItem>
              {sectorOptions.map((sector) => <MenuItem key={sector} value={sector}>{sector}</MenuItem>)}
            </TextField>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <TextField
              select
              fullWidth
              size="small"
              sx={{ minWidth: 160 }}
              label="ADP Status"
              value={filters.status}
              onChange={(event) => setFilters((prev) => ({ ...prev, status: event.target.value }))}
            >
              <MenuItem value="">All statuses</MenuItem>
              {statusOptions.map((status) => <MenuItem key={status} value={status}>{status}</MenuItem>)}
            </TextField>
          </Grid>
        </Grid>

        <Grid container spacing={1} sx={{ mb: 1.25 }}>
          <Grid item xs={6} sm={2.4}>
            <KpiCard title="ADP Planned Projects" value={formatNumber(summary.plannedProjects)} helper="Priorities extracted from the ADP." />
          </Grid>
          <Grid item xs={6} sm={2.4}>
            <KpiCard title="Budgeted ADP Rows" value={formatNumber(summary.budgetedAdpProjects)} helper={`KES ${formatCurrency(summary.budgetedAmount)} budgeted.`} />
          </Grid>
          <Grid item xs={6} sm={2.4}>
            <KpiCard title="Linked Registry Projects" value={formatNumber(summary.linkedProjects)} helper={`${formatNumber(summary.linkedAdpProjects)} ADP rows have at least one link.`} />
          </Grid>
          <Grid item xs={6} sm={2.4}>
            <KpiCard title="ADP Planned Budget" value={`KES ${formatCurrency(summary.plannedBudget)}`} helper="Based on ADP estimated costs." />
          </Grid>
          <Grid item xs={6} sm={2.4}>
            <KpiCard title="Actual Paid" value={`KES ${formatCurrency(summary.actualPaid)}`} helper={`Actual budget: KES ${formatCurrency(summary.actualBudget)}`} />
          </Grid>
        </Grid>

        {loading ? (
          <Stack direction="row" spacing={1} alignItems="center" sx={{ py: 4 }}>
            <CircularProgress size={22} />
            <Typography>Loading ADP implementation report...</Typography>
          </Stack>
        ) : (
          <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: '70vh' }}>
            <Table stickyHeader size="small">
              <TableHead>
                <TableRow>
                  <TableCell>ADP Project</TableCell>
                  <TableCell>Sector / Programme</TableCell>
                  <TableCell>Location</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell align="right">ADP Cost</TableCell>
                  <TableCell align="right">Budgeted</TableCell>
                  <TableCell align="right">Linked Projects</TableCell>
                  <TableCell align="right">Actual Budget</TableCell>
                  <TableCell align="right">Paid</TableCell>
                  <TableCell align="center">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id} hover>
                    <TableCell sx={{ minWidth: 260 }}>
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>{row.projectName}</Typography>
                      <Typography variant="caption" color="text.secondary">{row.performanceIndicator || row.activityDescription || 'No indicator captured yet'}</Typography>
                    </TableCell>
                    <TableCell sx={{ minWidth: 220 }}>
                      <Typography variant="body2">{row.sectorName || 'Unspecified'}</Typography>
                      <Typography variant="caption" color="text.secondary">{[row.programmeName, row.subprogrammeName].filter(Boolean).join(' / ')}</Typography>
                    </TableCell>
                    <TableCell>{row.locationText || [row.ward, row.sublocation, row.village].filter(Boolean).join(' / ') || 'County wide'}</TableCell>
                    <TableCell>
                      <Chip size="small" label={row.planStatus || 'Unspecified'} color={String(row.planStatus || '').toLowerCase().includes('ongoing') ? 'warning' : 'default'} />
                    </TableCell>
                    <TableCell align="right">{formatCurrency(row.estimatedCost)}</TableCell>
                    <TableCell align="right">{formatCurrency(row.budgetedAmount)}</TableCell>
                    <TableCell align="right">{formatNumber(row.linkedProjectCount)}</TableCell>
                    <TableCell align="right">{formatCurrency(row.actualBudget)}</TableCell>
                    <TableCell align="right">{formatCurrency(row.actualPaid)}</TableCell>
                    <TableCell align="center">
                      <Stack direction="row" spacing={0.5} justifyContent="center">
                        <Tooltip title="Edit ADP row">
                          <IconButton size="small" color="primary" onClick={() => handleOpenEdit(row)}>
                            <EditIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Delete ADP row">
                          <IconButton size="small" color="error" onClick={() => setDeleteRow(row)}>
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))}
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={10}>
                      <Alert severity="info">No ADP projects found yet. Import reviewed ADP project rows to activate this report.</Alert>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        )}

        <Dialog open={Boolean(editingRow)} onClose={saving ? undefined : handleCloseEdit} fullWidth maxWidth="md">
          <DialogTitle>Edit ADP Project</DialogTitle>
          <DialogContent dividers>
            <Grid container spacing={1.5} sx={{ pt: 0.5 }}>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  size="small"
                  label="ADP Project"
                  value={projectForm.projectName}
                  onChange={(event) => handleProjectFormChange('projectName', event.target.value)}
                  error={Boolean(formErrors.projectName)}
                  helperText={formErrors.projectName}
                  required
                />
              </Grid>
              <Grid item xs={12} md={4}>
                <TextField
                  fullWidth
                  size="small"
                  label="Sector"
                  value={projectForm.sectorName}
                  onChange={(event) => handleProjectFormChange('sectorName', event.target.value)}
                />
              </Grid>
              <Grid item xs={12} md={4}>
                <TextField
                  fullWidth
                  size="small"
                  label="Programme"
                  value={projectForm.programmeName}
                  onChange={(event) => handleProjectFormChange('programmeName', event.target.value)}
                />
              </Grid>
              <Grid item xs={12} md={4}>
                <TextField
                  fullWidth
                  size="small"
                  label="Subprogramme"
                  value={projectForm.subprogrammeName}
                  onChange={(event) => handleProjectFormChange('subprogrammeName', event.target.value)}
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  size="small"
                  label="Location"
                  value={projectForm.locationText}
                  onChange={(event) => handleProjectFormChange('locationText', event.target.value)}
                />
              </Grid>
              <Grid item xs={12} md={4}>
                <TextField
                  fullWidth
                  size="small"
                  label="Ward"
                  value={projectForm.ward}
                  onChange={(event) => handleProjectFormChange('ward', event.target.value)}
                />
              </Grid>
              <Grid item xs={12} md={4}>
                <TextField
                  fullWidth
                  size="small"
                  label="Sublocation"
                  value={projectForm.sublocation}
                  onChange={(event) => handleProjectFormChange('sublocation', event.target.value)}
                />
              </Grid>
              <Grid item xs={12} md={4}>
                <TextField
                  fullWidth
                  size="small"
                  label="Village"
                  value={projectForm.village}
                  onChange={(event) => handleProjectFormChange('village', event.target.value)}
                />
              </Grid>
              <Grid item xs={12} md={4}>
                <TextField
                  fullWidth
                  size="small"
                  label="ADP Cost"
                  type="number"
                  value={projectForm.estimatedCost}
                  onChange={(event) => handleProjectFormChange('estimatedCost', event.target.value)}
                  error={Boolean(formErrors.estimatedCost)}
                  helperText={formErrors.estimatedCost}
                />
              </Grid>
              <Grid item xs={12} md={4}>
                <TextField
                  fullWidth
                  size="small"
                  label="Status"
                  value={projectForm.planStatus}
                  onChange={(event) => handleProjectFormChange('planStatus', event.target.value)}
                />
              </Grid>
              <Grid item xs={12} md={4}>
                <TextField
                  fullWidth
                  size="small"
                  label="Timeframe"
                  value={projectForm.timeframe}
                  onChange={(event) => handleProjectFormChange('timeframe', event.target.value)}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  size="small"
                  label="Funding Source"
                  value={projectForm.fundingSource}
                  onChange={(event) => handleProjectFormChange('fundingSource', event.target.value)}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  size="small"
                  label="Implementing Agency"
                  value={projectForm.implementingAgency}
                  onChange={(event) => handleProjectFormChange('implementingAgency', event.target.value)}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  size="small"
                  label="Performance Indicator"
                  value={projectForm.performanceIndicator}
                  onChange={(event) => handleProjectFormChange('performanceIndicator', event.target.value)}
                  multiline
                  minRows={2}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  size="small"
                  label="Target"
                  value={projectForm.target}
                  onChange={(event) => handleProjectFormChange('target', event.target.value)}
                  multiline
                  minRows={2}
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  size="small"
                  label="Activity Description"
                  value={projectForm.activityDescription}
                  onChange={(event) => handleProjectFormChange('activityDescription', event.target.value)}
                  multiline
                  minRows={2}
                />
              </Grid>
            </Grid>
          </DialogContent>
          <DialogActions>
            <Button onClick={handleCloseEdit} disabled={saving}>Cancel</Button>
            <Button variant="contained" onClick={handleSaveProject} disabled={saving}>
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogActions>
        </Dialog>

        <Dialog open={Boolean(deleteRow)} onClose={() => (saving ? null : setDeleteRow(null))} fullWidth maxWidth="xs">
          <DialogTitle>Delete ADP Project</DialogTitle>
          <DialogContent dividers>
            <Typography variant="body2" sx={{ mb: 1 }}>
              Delete this ADP row from the implementation report?
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 700 }}>
              {deleteRow?.projectName}
            </Typography>
            <Alert severity="warning" sx={{ mt: 2 }}>
              Rows already linked to budget items or project registry links must be unlinked before deletion.
            </Alert>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDeleteRow(null)} disabled={saving}>Cancel</Button>
            <Button color="error" variant="contained" onClick={handleDeleteProject} disabled={saving}>
              {saving ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogActions>
        </Dialog>
      </Paper>
    </Box>
  );
}
