import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Badge,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  FormGroup,
  Grid,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
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
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ThumbDownIcon from '@mui/icons-material/ThumbDown';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import ViewColumnIcon from '@mui/icons-material/ViewColumn';
import LinkIcon from '@mui/icons-material/Link';
import ListAltIcon from '@mui/icons-material/ListAlt';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import apiService from '../api';
import { ROUTES } from '../configs/appConfig';
import {
  ADP_COLUMN_STORAGE_KEY,
  adpImplementationColumns,
  buildDefaultColumnVisibility,
  getExportValue,
  getLocationSummary,
  getPriorityLabel,
  loadColumnVisibility,
} from '../configs/adpImplementationTableConfig';
import { useAIPageContext } from '../context/AIPageContext.jsx';
import { drawCountyOfficialHeader, getCountyLogoDataUrl } from '../utils/countyOfficialPdfHeader';

function formatNumber(value) {
  return Number(value || 0).toLocaleString();
}

function formatCurrency(value) {
  return Number(value || 0).toLocaleString('en-KE', { maximumFractionDigits: 2 });
}

function confidenceLabel(value) {
  const num = Number(value);
  return Number.isFinite(num) ? `${Math.round(num * 100)}%` : '—';
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
  const [filters, setFilters] = useState({ search: '', sector: '', status: '', ward: '', gap: '' });
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
  const [suggestionRows, setSuggestionRows] = useState([]);
  const [suggestionSummary, setSuggestionSummary] = useState({ review_pending: 0, accepted: 0, rejected: 0 });
  const [suggestionTotal, setSuggestionTotal] = useState(0);
  const [suggestionFilter, setSuggestionFilter] = useState('review_pending');
  const [suggestionLoading, setSuggestionLoading] = useState(false);
  const [suggestionActionId, setSuggestionActionId] = useState(null);
  const [activeMainTab, setActiveMainTab] = useState(0);
  const [columnVisibility, setColumnVisibility] = useState(() => loadColumnVisibility());
  const [columnDialogOpen, setColumnDialogOpen] = useState(false);
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

  const wardOptions = useMemo(() => {
    const values = new Set(rows.map((row) => row.ward).filter(Boolean));
    return [...values].sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const priorityCounts = useMemo(() => ({
    high: rows.filter((row) => row.priorityLevel === 'high').length,
    medium: rows.filter((row) => row.priorityLevel === 'medium').length,
    low: rows.filter((row) => row.priorityLevel === 'low').length,
    needsAction: rows.filter((row) => (row.budgetCount || 0) === 0 || (row.linkedProjectCount || 0) === 0).length,
  }), [rows]);

  const priorityColor = (level) => {
    if (level === 'high') return 'error';
    if (level === 'medium') return 'warning';
    return 'success';
  };

  const visibleColumns = useMemo(
    () => adpImplementationColumns.filter((col) => columnVisibility[col.id] !== false),
    [columnVisibility]
  );

  const exportableColumns = useMemo(
    () => visibleColumns.filter((col) => col.exportHeader),
    [visibleColumns]
  );

  const exportRows = useMemo(() => rows.map((row, index) => {
    const record = { '#': index + 1 };
    exportableColumns.forEach((col) => {
      record[col.exportHeader] = getExportValue(col, row);
    });
    return record;
  }), [rows, exportableColumns]);

  const handleColumnVisibilityChange = (columnId, checked) => {
    setColumnVisibility((prev) => {
      const next = { ...prev, [columnId]: checked, actions: true };
      try {
        localStorage.setItem(ADP_COLUMN_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore storage errors
      }
      return next;
    });
  };

  const handleResetColumns = () => {
    const defaults = buildDefaultColumnVisibility();
    setColumnVisibility(defaults);
    try {
      localStorage.setItem(ADP_COLUMN_STORAGE_KEY, JSON.stringify(defaults));
    } catch {
      // ignore storage errors
    }
    setMessage('ADP table columns reset to defaults.');
  };

  const renderAdpCell = (column, row) => {
    switch (column.id) {
      case 'projectName':
        return (
          <>
            <Typography variant="body2" sx={{ fontWeight: 700 }}>{row.projectName}</Typography>
            <Typography variant="caption" color="text.secondary">
              {row.performanceIndicator || row.activityDescription || 'No indicator captured yet'}
            </Typography>
          </>
        );
      case 'sectorName':
        return <Typography variant="body2">{row.sectorName || 'Unspecified'}</Typography>;
      case 'programmeName':
        return (
          <Typography variant="body2">
            {[row.programmeName, row.subprogrammeName].filter(Boolean).join(' / ') || '—'}
          </Typography>
        );
      case 'subprogrammeName':
        return row.subprogrammeName || '—';
      case 'locationText':
        return getLocationSummary(row);
      case 'ward':
        return row.ward || '—';
      case 'sublocation':
        return row.sublocation || '—';
      case 'village':
        return row.village || '—';
      case 'planStatus':
        return (
          <Chip
            size="small"
            label={row.planStatus || 'Unspecified'}
            color={String(row.planStatus || '').toLowerCase().includes('ongoing') ? 'warning' : 'default'}
          />
        );
      case 'priorityLevel':
        return (
          <Chip
            size="small"
            label={getPriorityLabel(row.priorityLevel)}
            color={priorityColor(row.priorityLevel)}
            variant="outlined"
          />
        );
      case 'estimatedCost':
        return formatCurrency(row.estimatedCost);
      case 'budgetedAmount':
        return formatCurrency(row.budgetedAmount);
      case 'budgetCount':
        return formatNumber(row.budgetCount);
      case 'linkedProjectCount':
        return formatNumber(row.linkedProjectCount);
      case 'actualBudget':
        return formatCurrency(row.actualBudget);
      case 'actualPaid':
        return formatCurrency(row.actualPaid);
      case 'activityDescription':
        return row.activityDescription || '—';
      case 'performanceIndicator':
        return row.performanceIndicator || '—';
      case 'target':
        return row.target || '—';
      case 'fundingSource':
        return row.fundingSource || '—';
      case 'timeframe':
        return row.timeframe || '—';
      case 'implementingAgency':
        return row.implementingAgency || '—';
      case 'actions':
        return (
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
        );
      default:
        return '—';
    }
  };

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

  const loadSuggestions = useCallback(async (status = suggestionFilter) => {
    if (!selectedPlan?.id) {
      setSuggestionRows([]);
      setSuggestionSummary({ review_pending: 0, accepted: 0, rejected: 0 });
      setSuggestionTotal(0);
      return;
    }
    setSuggestionLoading(true);
    try {
      const params = { limit: 100, offset: 0 };
      if (status) params.status = status;
      const data = await apiService.adp.getPlanLinkSuggestions(selectedPlan.id, params);
      setSuggestionRows(Array.isArray(data?.rows) ? data.rows : []);
      setSuggestionSummary(data?.summary || { review_pending: 0, accepted: 0, rejected: 0 });
      setSuggestionTotal(Number(data?.totalCount || 0));
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || 'Failed to load ADP link suggestions.');
      setSuggestionRows([]);
    } finally {
      setSuggestionLoading(false);
    }
  }, [selectedPlan, suggestionFilter]);

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

  useEffect(() => {
    loadSuggestions(suggestionFilter);
  }, [loadSuggestions, suggestionFilter, selectedPlan?.id]);

  const handleGenerateSuggestions = async () => {
    if (!selectedPlan?.id) return;
    setGenerating(true);
    setError('');
    setMessage('');
    try {
      const result = await apiService.adp.generateSuggestions(selectedPlan.id);
      const pending = Number(result?.pendingCount ?? result?.summary?.review_pending ?? 0);
      setMessage(
        `Generated or refreshed ${formatNumber(result?.insertedOrUpdated || 0)} ADP link suggestion pair(s). `
        + `${formatNumber(pending)} pending review — open the Link Suggestions tab (also on each project’s ADP Implementation Link dialog).`
      );
      setSuggestionFilter('review_pending');
      setActiveMainTab(1);
      await Promise.all([loadSuggestions('review_pending'), loadReport()]);
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || 'Failed to generate ADP link suggestions.');
    } finally {
      setGenerating(false);
    }
  };

  const handleAcceptSuggestion = async (suggestion) => {
    if (!suggestion?.projectId || !suggestion?.adpProjectId) return;
    setSuggestionActionId(suggestion.id);
    setError('');
    try {
      await apiService.adp.updateProjectLink(suggestion.projectId, {
        adpProjectId: suggestion.adpProjectId,
        suggestionId: suggestion.id,
      });
      setMessage(`Linked registry project to ADP row "${suggestion.adpProjectName}".`);
      await Promise.all([loadSuggestions(suggestionFilter), loadReport()]);
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || 'Failed to accept ADP link suggestion.');
    } finally {
      setSuggestionActionId(null);
    }
  };

  const handleRejectSuggestion = async (suggestionId) => {
    if (!suggestionId) return;
    setSuggestionActionId(suggestionId);
    setError('');
    try {
      await apiService.adp.updateSuggestionStatus(suggestionId, 'rejected');
      setMessage('ADP link suggestion rejected.');
      await loadSuggestions(suggestionFilter);
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || 'Failed to reject ADP link suggestion.');
    } finally {
      setSuggestionActionId(null);
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
    worksheet['!cols'] = [{ wch: 6 }, ...exportableColumns.map(() => ({ wch: 18 }))];
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
        head: [exportableColumns.map((col) => col.exportHeader)],
        body: rows.map((row) => exportableColumns.map((col) => {
          const value = getExportValue(col, row);
          if (col.numeric) return formatCurrency(value);
          return value;
        })),
        styles: { fontSize: 6.5, cellPadding: 3, overflow: 'linebreak' },
        headStyles: { fillColor: [22, 96, 136] },
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
          <Grid item xs={12} sm={6} md={3}>
            <TextField
              select
              fullWidth
              size="small"
              sx={{ minWidth: 150 }}
              label="Ward"
              value={filters.ward}
              onChange={(event) => setFilters((prev) => ({ ...prev, ward: event.target.value }))}
            >
              <MenuItem value="">All wards</MenuItem>
              {wardOptions.map((ward) => <MenuItem key={ward} value={ward}>{ward}</MenuItem>)}
            </TextField>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <TextField
              select
              fullWidth
              size="small"
              sx={{ minWidth: 190 }}
              label="Priority queue"
              value={filters.gap}
              onChange={(event) => setFilters((prev) => ({ ...prev, gap: event.target.value }))}
            >
              <MenuItem value="">All ADP rows</MenuItem>
              <MenuItem value="needs_action">Needs action (unbudgeted or unlinked)</MenuItem>
              <MenuItem value="unbudgeted">Unbudgeted only</MenuItem>
              <MenuItem value="unlinked">Not linked to registry</MenuItem>
              <MenuItem value="ready">Budgeted and linked</MenuItem>
            </TextField>
          </Grid>
        </Grid>

        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 1 }}>
          <Chip size="small" label={`Needs action: ${formatNumber(priorityCounts.needsAction)}`} color="error" variant="outlined" />
          <Chip size="small" label={`High priority: ${formatNumber(priorityCounts.high)}`} color="error" variant="outlined" />
          <Chip size="small" label={`Medium: ${formatNumber(priorityCounts.medium)}`} color="warning" variant="outlined" />
          <Chip size="small" label={`Ready: ${formatNumber(priorityCounts.low)}`} color="success" variant="outlined" />
        </Stack>

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

        <Paper variant="outlined" sx={{ mb: 1.5 }}>
          <Tabs
            value={activeMainTab}
            onChange={(_, value) => setActiveMainTab(value)}
            sx={{ px: 1, borderBottom: 1, borderColor: 'divider', minHeight: 42 }}
          >
            <Tab
              icon={<ListAltIcon sx={{ fontSize: 18 }} />}
              iconPosition="start"
              label={`ADP Items (${formatNumber(rows.length)})`}
              sx={{ minHeight: 42, textTransform: 'none', fontWeight: 700 }}
            />
            <Tab
              icon={(
                <Badge badgeContent={suggestionSummary.review_pending || 0} color="warning" max={999}>
                  <LinkIcon sx={{ fontSize: 18 }} />
                </Badge>
              )}
              iconPosition="start"
              label="Link Suggestions"
              sx={{ minHeight: 42, textTransform: 'none', fontWeight: 700 }}
            />
          </Tabs>

          {activeMainTab === 0 && (
            <Box sx={{ p: 1.5 }}>
              <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', sm: 'center' }} spacing={1} sx={{ mb: 1 }}>
                <Typography variant="body2" color="text.secondary">
                  {formatNumber(rows.length)} ADP row(s) shown. Use Manage Columns to fit the table on screen; exports use the same visible columns.
                </Typography>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<ViewColumnIcon />}
                  onClick={() => setColumnDialogOpen(true)}
                >
                  Manage Columns
                </Button>
              </Stack>

              {loading ? (
                <Stack direction="row" spacing={1} alignItems="center" sx={{ py: 4 }}>
                  <CircularProgress size={22} />
                  <Typography>Loading ADP implementation report...</Typography>
                </Stack>
              ) : (
                <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: '70vh' }}>
                  <Table stickyHeader size="small" sx={{ minWidth: visibleColumns.reduce((sum, col) => sum + col.minWidth, 0) }}>
                    <TableHead>
                      <TableRow>
                        {visibleColumns.map((column) => (
                          <TableCell
                            key={column.id}
                            align={column.align || 'left'}
                            sx={{ fontWeight: 700, minWidth: column.minWidth, whiteSpace: 'nowrap' }}
                          >
                            {column.label}
                          </TableCell>
                        ))}
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {rows.map((row) => (
                        <TableRow key={row.id} hover>
                          {visibleColumns.map((column) => (
                            <TableCell
                              key={`${row.id}-${column.id}`}
                              align={column.align || 'left'}
                              sx={{ minWidth: column.minWidth, verticalAlign: column.id === 'actions' ? 'middle' : 'top' }}
                            >
                              {renderAdpCell(column, row)}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                      {rows.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={Math.max(visibleColumns.length, 1)}>
                            <Alert severity="info">No ADP projects found yet. Import reviewed ADP project rows to activate this report.</Alert>
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </Box>
          )}

          {activeMainTab === 1 && (
            <Box sx={{ p: 1.5 }}>
              <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', md: 'center' }} spacing={1} sx={{ mb: 1 }}>
                <Box>
                  <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>Link Suggestions</Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                    Keyword matches between registry projects and ADP rows. Review here or on each project under Planning → ADP Implementation Link.
                  </Typography>
                </Box>
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap alignItems="center">
                  <Chip size="small" label={`Pending: ${formatNumber(suggestionSummary.review_pending)}`} color="warning" variant="outlined" />
                  <Chip size="small" label={`Accepted: ${formatNumber(suggestionSummary.accepted)}`} color="success" variant="outlined" />
                  <Chip size="small" label={`Rejected: ${formatNumber(suggestionSummary.rejected)}`} variant="outlined" />
                  <TextField
                    select
                    size="small"
                    label="Show"
                    value={suggestionFilter}
                    onChange={(event) => setSuggestionFilter(event.target.value)}
                    sx={{ minWidth: 160 }}
                  >
                    <MenuItem value="review_pending">Pending review</MenuItem>
                    <MenuItem value="accepted">Accepted</MenuItem>
                    <MenuItem value="rejected">Rejected</MenuItem>
                    <MenuItem value="">All statuses</MenuItem>
                  </TextField>
                  <Button size="small" variant="outlined" onClick={() => loadSuggestions(suggestionFilter)} disabled={suggestionLoading}>
                    Refresh
                  </Button>
                </Stack>
              </Stack>

              {suggestionLoading ? (
                <Stack direction="row" spacing={1} alignItems="center" sx={{ py: 2 }}>
                  <CircularProgress size={20} />
                  <Typography variant="body2">Loading link suggestions...</Typography>
                </Stack>
              ) : (
                <TableContainer sx={{ maxHeight: '70vh' }}>
                  <Table stickyHeader size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Registry Project</TableCell>
                        <TableCell>ADP Project</TableCell>
                        <TableCell>Match reason</TableCell>
                        <TableCell>Status</TableCell>
                        <TableCell align="right">Actions</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {suggestionRows.map((suggestion) => (
                        <TableRow key={suggestion.id} hover>
                          <TableCell sx={{ minWidth: 200 }}>
                            <Typography variant="body2" sx={{ fontWeight: 700 }}>{suggestion.projectName}</Typography>
                            <Typography variant="caption" color="text.secondary">Project ID {suggestion.projectId}</Typography>
                          </TableCell>
                          <TableCell sx={{ minWidth: 220 }}>
                            <Typography variant="body2" sx={{ fontWeight: 700 }}>{suggestion.adpProjectName}</Typography>
                            <Typography variant="caption" color="text.secondary">
                              {[suggestion.sectorName, suggestion.programmeName, suggestion.locationText || suggestion.ward].filter(Boolean).join(' | ')}
                            </Typography>
                          </TableCell>
                          <TableCell sx={{ minWidth: 200 }}>
                            <Typography variant="body2">{suggestion.matchReason}</Typography>
                            <Chip size="small" label={confidenceLabel(suggestion.confidence)} sx={{ mt: 0.5 }} />
                          </TableCell>
                          <TableCell>
                            <Chip size="small" label={suggestion.status} color={suggestion.status === 'accepted' ? 'success' : suggestion.status === 'review_pending' ? 'warning' : 'default'} />
                          </TableCell>
                          <TableCell align="right">
                            <Stack direction="row" spacing={0.5} justifyContent="flex-end" flexWrap="wrap" useFlexGap>
                              {suggestion.status === 'review_pending' && (
                                <>
                                  <Button
                                    size="small"
                                    startIcon={<CheckCircleIcon />}
                                    disabled={suggestionActionId === suggestion.id}
                                    onClick={() => handleAcceptSuggestion(suggestion)}
                                  >
                                    Accept
                                  </Button>
                                  <Button
                                    size="small"
                                    color="inherit"
                                    startIcon={<ThumbDownIcon />}
                                    disabled={suggestionActionId === suggestion.id}
                                    onClick={() => handleRejectSuggestion(suggestion.id)}
                                  >
                                    Reject
                                  </Button>
                                </>
                              )}
                              <Button
                                size="small"
                                component={RouterLink}
                                to={ROUTES.PROJECT_DETAILS.replace(':projectId', String(suggestion.projectId))}
                                endIcon={<OpenInNewIcon sx={{ fontSize: 14 }} />}
                              >
                                Project
                              </Button>
                            </Stack>
                          </TableCell>
                        </TableRow>
                      ))}
                      {suggestionRows.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={5}>
                            <Alert severity="info">
                              No link suggestions for this filter yet. Click <strong>Generate Link Suggestions</strong> to match registry projects to ADP rows by shared keywords (name, sector, location, indicators).
                            </Alert>
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
              {suggestionTotal > suggestionRows.length && (
                <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                  Showing {formatNumber(suggestionRows.length)} of {formatNumber(suggestionTotal)} suggestions. Use the status filter or open a registry project for its full suggestion list.
                </Typography>
              )}
            </Box>
          )}
        </Paper>

        <Dialog open={columnDialogOpen} onClose={() => setColumnDialogOpen(false)} maxWidth="sm" fullWidth>
          <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <ViewColumnIcon color="primary" />
            Manage ADP Table Columns
          </DialogTitle>
          <DialogContent dividers>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Choose which columns appear in the ADP items table and in Excel/PDF exports. Actions always stay visible.
            </Typography>
            <FormGroup>
              {adpImplementationColumns.filter((col) => !col.alwaysVisible).map((column) => (
                <FormControlLabel
                  key={column.id}
                  control={(
                    <Checkbox
                      checked={columnVisibility[column.id] !== false}
                      onChange={(event) => handleColumnVisibilityChange(column.id, event.target.checked)}
                    />
                  )}
                  label={column.label}
                />
              ))}
            </FormGroup>
          </DialogContent>
          <DialogActions>
            <Button onClick={handleResetColumns}>Reset defaults</Button>
            <Button variant="contained" onClick={() => setColumnDialogOpen(false)}>Done</Button>
          </DialogActions>
        </Dialog>

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
