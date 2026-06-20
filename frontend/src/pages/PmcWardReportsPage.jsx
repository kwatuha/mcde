import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  List,
  ListItem,
  ListItemText,
  MenuItem,
  Paper,
  Snackbar,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  Add as AddIcon,
  CheckCircle as CheckCircleIcon,
  Delete as DeleteIcon,
  Download as DownloadIcon,
  Edit as EditIcon,
  Refresh as RefreshIcon,
  Replay as ReplayIcon,
  History as HistoryIcon,
  Send as SendIcon,
  UploadFile as UploadFileIcon,
  Visibility as VisibilityIcon,
} from '@mui/icons-material';
import { DataGrid } from '@mui/x-data-grid';
import apiService from '../api';
import pmcReportService from '../api/pmcReportService';
import { useAuth } from '../context/AuthContext';
import { useAIPageContext } from '../context/AIPageContext.jsx';
import Header from './dashboard/Header';

const STATUS_OPTIONS = ['', 'draft', 'submitted', 'returned', 'approved'];

const STATUS_COLORS = {
  draft: 'default',
  submitted: 'warning',
  returned: 'error',
  approved: 'success',
};

const emptyForm = {
  projectId: '',
  reportingPeriod: '',
  reportTitle: '',
  summary: '',
  progressNotes: '',
  challenges: '',
  recommendations: '',
  subcounty: '',
  ward: '',
};

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('en-KE', { year: 'numeric', month: 'short', day: '2-digit' });
}

function statusLabel(status) {
  return String(status || 'draft').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

const ACTION_LABELS = {
  created: 'Draft created',
  updated: 'Details updated',
  file_uploaded: 'Signed document uploaded',
  submitted: 'Submitted for review',
  resubmitted: 'Resubmitted for review',
  returned: 'Returned for revision',
  approved: 'Approved',
  deleted: 'Deleted',
};

const ACTION_COLORS = {
  created: 'default',
  updated: 'default',
  file_uploaded: 'info',
  submitted: 'warning',
  resubmitted: 'warning',
  returned: 'error',
  approved: 'success',
  deleted: 'default',
};

function actionLabel(actionType) {
  return ACTION_LABELS[actionType] || statusLabel(actionType);
}

export default function PmcWardReportsPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { hasPrivilege } = useAuth();
  const { setAIPageContext, clearAIPageContext } = useAIPageContext();

  const initialProjectId = searchParams.get('projectId') || '';
  const initialStatus = searchParams.get('status') || '';
  const [rows, setRows] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(false);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [filters, setFilters] = useState({
    status: initialStatus,
    search: '',
    subcounty: '',
    ward: '',
    projectId: initialProjectId,
  });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [editingRow, setEditingRow] = useState(null);
  const [reviewRow, setReviewRow] = useState(null);
  const [reviewComment, setReviewComment] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [signedFile, setSignedFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState({ open: false, severity: 'success', message: '' });
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyRow, setHistoryRow] = useState(null);
  const [historyActions, setHistoryActions] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const canCreate = hasPrivilege('pmc_report.create') || hasPrivilege('pmc_report.update') || hasPrivilege('project.update');
  const canSubmit = hasPrivilege('pmc_report.submit') || hasPrivilege('pmc_report.update');
  const canReview = hasPrivilege('pmc_report.review') || hasPrivilege('approval_levels.update');

  const showToast = (severity, message) => setToast({ open: true, severity, message });

  useEffect(() => {
    const projectId = searchParams.get('projectId') || '';
    const status = searchParams.get('status') || '';
    setFilters((prev) => (
      prev.projectId === projectId && prev.status === status
        ? prev
        : { ...prev, projectId, status }
    ));
  }, [searchParams]);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const data = await pmcReportService.list(filters);
      setRows(Array.isArray(data?.rows) ? data.rows : []);
    } catch (error) {
      showToast('error', error?.response?.data?.message || error?.message || 'Failed to load PMC reports.');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  const fetchProjects = useCallback(async () => {
    setProjectsLoading(true);
    try {
      const data = await apiService.projects.getProjects();
      const list = Array.isArray(data) ? data : (data?.projects || data?.rows || []);
      setProjects(list);
    } catch (error) {
      showToast('error', 'Failed to load projects.');
    } finally {
      setProjectsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const summary = useMemo(() => ({
    total: rows.length,
    draft: rows.filter((row) => row.status === 'draft').length,
    submitted: rows.filter((row) => row.status === 'submitted').length,
    returned: rows.filter((row) => row.status === 'returned').length,
    approved: rows.filter((row) => row.status === 'approved').length,
  }), [rows]);

  useEffect(() => {
    setAIPageContext({
      pageType: 'pmc-ward-reports',
      filters,
      screenSummary: summary,
    });
    return () => clearAIPageContext();
  }, [filters, summary, setAIPageContext, clearAIPageContext]);

  const projectOptions = useMemo(() => projects.map((project) => ({
    id: project.id ?? project.projectId,
    label: project.projectName || project.name || `Project #${project.id ?? project.projectId}`,
    subcounty: project.subcountyNames || project.subcounty || '',
    ward: project.wardNames || project.ward || '',
  })).filter((project) => project.id), [projects]);

  const openCreateDialog = () => {
    setEditingRow(null);
    setForm(emptyForm);
    setSignedFile(null);
    setDialogOpen(true);
  };

  const openEditDialog = (row) => {
    setEditingRow(row);
    setForm({
      projectId: row.projectId || '',
      reportingPeriod: row.reportingPeriod || '',
      reportTitle: row.reportTitle || '',
      summary: row.summary || '',
      progressNotes: row.progressNotes || '',
      challenges: row.challenges || '',
      recommendations: row.recommendations || '',
      subcounty: row.subcounty || '',
      ward: row.ward || '',
    });
    setSignedFile(null);
    setDialogOpen(true);
  };

  const closeDialog = () => {
    if (submitting) return;
    setDialogOpen(false);
    setEditingRow(null);
    setForm(emptyForm);
    setSignedFile(null);
  };

  const handleSave = async () => {
    if (!form.projectId || !form.reportingPeriod.trim() || !form.reportTitle.trim()) {
      showToast('error', 'Project, reporting period, and report title are required.');
      return;
    }
    setSubmitting(true);
    try {
      let saved;
      if (editingRow?.reportId) {
        saved = await pmcReportService.update(editingRow.reportId, form);
      } else {
        saved = await pmcReportService.create(form);
      }
      if (signedFile && saved?.reportId) {
        await pmcReportService.uploadSignedFile(saved.reportId, signedFile);
      }
      showToast('success', editingRow ? 'PMC report updated.' : 'PMC report draft created.');
      closeDialog();
      fetchRows();
    } catch (error) {
      showToast('error', error?.response?.data?.message || error?.message || 'Failed to save PMC report.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUploadForRow = async (row, file) => {
    if (!file || !row?.reportId) return;
    setSubmitting(true);
    try {
      await pmcReportService.uploadSignedFile(row.reportId, file);
      showToast('success', 'Signed report uploaded.');
      fetchRows();
    } catch (error) {
      showToast('error', error?.response?.data?.message || error?.message || 'Failed to upload signed report.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async (row) => {
    if (!row?.reportId) return;
    setSubmitting(true);
    try {
      await pmcReportService.submit(row.reportId);
      showToast('success', 'PMC report submitted to Sub-County Administrator.');
      fetchRows();
    } catch (error) {
      showToast('error', error?.response?.data?.message || error?.message || 'Failed to submit PMC report.');
    } finally {
      setSubmitting(false);
    }
  };

  const openReviewDialog = (row, mode) => {
    setReviewRow({ ...row, mode });
    setReviewComment('');
    setReviewOpen(true);
    loadHistory(row.reportId, false);
  };

  const loadHistory = useCallback(async (reportId, openDialog = true) => {
    if (!reportId) return;
    if (openDialog) {
      const row = rows.find((item) => item.reportId === reportId) || { reportId };
      setHistoryRow(row);
      setHistoryOpen(true);
    }
    setHistoryActions([]);
    setHistoryLoading(true);
    try {
      const data = await pmcReportService.getHistory(reportId);
      setHistoryActions(Array.isArray(data?.actions) ? data.actions : []);
    } catch (error) {
      setHistoryActions([]);
      if (openDialog) {
        showToast('error', error?.response?.data?.message || error?.message || 'Failed to load revision history.');
      }
    } finally {
      setHistoryLoading(false);
    }
  }, [rows]);

  const handleDownloadHistoryFile = async (reportId, action) => {
    if (!reportId || !action?.actionId) return;
    try {
      const response = await pmcReportService.downloadHistoryFile(reportId, action.actionId);
      const blob = new Blob([response.data], { type: response.headers['content-type'] || 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = action.signedFileName || `pmc-report-${reportId}-action-${action.actionId}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      showToast('error', error?.response?.data?.message || error?.message || 'Failed to download historical document.');
    }
  };

  const handleReview = async () => {
    if (!reviewRow?.reportId) return;
    setSubmitting(true);
    try {
      if (reviewRow.mode === 'approve') {
        await pmcReportService.approve(reviewRow.reportId, reviewComment);
        showToast('success', 'PMC report approved.');
      } else {
        if (!reviewComment.trim()) {
          showToast('error', 'A review comment is required when returning a report.');
          setSubmitting(false);
          return;
        }
        await pmcReportService.returnReport(reviewRow.reportId, reviewComment);
        showToast('success', 'PMC report returned to Ward Administrator.');
      }
      setReviewOpen(false);
      setReviewRow(null);
      setHistoryActions([]);
      fetchRows();
    } catch (error) {
      showToast('error', error?.response?.data?.message || error?.message || 'Review action failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (row) => {
    if (!row?.reportId) return;
    if (!window.confirm('Delete this PMC report draft?')) return;
    setSubmitting(true);
    try {
      await pmcReportService.remove(row.reportId);
      showToast('success', 'PMC report deleted.');
      fetchRows();
    } catch (error) {
      showToast('error', error?.response?.data?.message || error?.message || 'Failed to delete PMC report.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDownload = async (row) => {
    if (!row?.reportId) return;
    try {
      const response = await pmcReportService.downloadSignedFile(row.reportId);
      const blob = new Blob([response.data], { type: response.headers['content-type'] || 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = row.signedFileName || `pmc-report-${row.reportId}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      showToast('error', error?.response?.data?.message || error?.message || 'Failed to download signed report.');
    }
  };

  const columns = useMemo(() => [
    { field: 'reportTitle', headerName: 'Report', flex: 1.2, minWidth: 180 },
    { field: 'projectName', headerName: 'Project', flex: 1.2, minWidth: 180 },
    { field: 'reportingPeriod', headerName: 'Period', width: 110 },
    { field: 'ward', headerName: 'Ward', width: 130 },
    { field: 'subcounty', headerName: 'Sub-County', width: 140 },
    {
      field: 'status',
      headerName: 'Status',
      width: 120,
      renderCell: ({ value }) => (
        <Chip size="small" label={statusLabel(value)} color={STATUS_COLORS[value] || 'default'} />
      ),
    },
    {
      field: 'submittedAt',
      headerName: 'Submitted',
      width: 150,
      valueFormatter: (value) => formatDate(value),
    },
    {
      field: 'reviewComment',
      headerName: 'Latest comment',
      flex: 1,
      minWidth: 160,
      valueGetter: (_, row) => row.reviewComment || '',
      renderCell: ({ row }) => (
        row.reviewComment ? (
          <Typography variant="body2" sx={{ whiteSpace: 'normal', lineHeight: 1.3, py: 0.5 }}>
            {row.reviewComment}
          </Typography>
        ) : '—'
      ),
    },
    {
      field: 'actions',
      headerName: 'Actions',
      width: 320,
      sortable: false,
      filterable: false,
      renderCell: ({ row }) => (
        <Stack direction="row" spacing={0.5}>
          <Tooltip title="Revision history">
            <IconButton size="small" onClick={() => loadHistory(row.reportId)}>
              <HistoryIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="View project">
            <IconButton size="small" onClick={() => navigate(`/projects/${row.projectId}`)}>
              <VisibilityIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          {row.hasSignedFile ? (
            <Tooltip title="Download signed report">
              <IconButton size="small" onClick={() => handleDownload(row)}>
                <DownloadIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          ) : null}
          {['draft', 'returned'].includes(row.status) && canCreate ? (
            <Tooltip title="Edit">
              <IconButton size="small" onClick={() => openEditDialog(row)}>
                <EditIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          ) : null}
          {['draft', 'returned'].includes(row.status) && canCreate ? (
            <Tooltip title="Upload signed report">
              <IconButton
                size="small"
                component="label"
                disabled={submitting}
              >
                <UploadFileIcon fontSize="small" />
                <input
                  hidden
                  type="file"
                  accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = '';
                    if (file) handleUploadForRow(row, file);
                  }}
                />
              </IconButton>
            </Tooltip>
          ) : null}
          {['draft', 'returned'].includes(row.status) && canSubmit ? (
            <Tooltip title="Submit to Sub-County">
              <IconButton size="small" color="primary" onClick={() => handleSubmit(row)} disabled={!row.hasSignedFile || submitting}>
                <SendIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          ) : null}
          {row.status === 'submitted' && canReview ? (
            <>
              <Tooltip title="Approve">
                <IconButton size="small" color="success" onClick={() => openReviewDialog(row, 'approve')} disabled={submitting}>
                  <CheckCircleIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title="Return to Ward">
                <IconButton size="small" color="warning" onClick={() => openReviewDialog(row, 'return')} disabled={submitting}>
                  <ReplayIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </>
          ) : null}
          {['draft', 'returned'].includes(row.status) && canCreate ? (
            <Tooltip title="Delete">
              <IconButton size="small" color="error" onClick={() => handleDelete(row)} disabled={submitting}>
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          ) : null}
        </Stack>
      ),
    },
  ], [canCreate, canReview, canSubmit, loadHistory, navigate, submitting]);

  return (
    <Box m="20px">
      <Header
        title="PMC Ward Reports"
        subtitle="Ward Administrators upload signed PMC reports; Sub-County Administrators review and approve"
      />

      <Alert severity="info" sx={{ mb: 2 }}>
        Workflow: create a draft PMC report, upload the signed document, submit for review, then the Sub-County Administrator approves or returns it with comments.
      </Alert>

      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>
        <Chip label={`Total: ${summary.total}`} />
        <Chip label={`Draft: ${summary.draft}`} />
        <Chip label={`Submitted: ${summary.submitted}`} color="warning" variant="outlined" />
        <Chip label={`Returned: ${summary.returned}`} color="error" variant="outlined" />
        <Chip label={`Approved: ${summary.approved}`} color="success" variant="outlined" />
      </Stack>

      <Paper sx={{ p: 2, mb: 2 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ md: 'center' }}>
          <TextField
            select
            size="small"
            label="Status"
            value={filters.status}
            onChange={(event) => setFilters((prev) => ({ ...prev, status: event.target.value }))}
            sx={{ minWidth: 160 }}
          >
            {STATUS_OPTIONS.map((option) => (
              <MenuItem key={option || 'all'} value={option}>{option ? statusLabel(option) : 'All statuses'}</MenuItem>
            ))}
          </TextField>
          <TextField
            size="small"
            label="Search"
            value={filters.search}
            onChange={(event) => setFilters((prev) => ({ ...prev, search: event.target.value }))}
            sx={{ minWidth: 220, flex: 1 }}
          />
          <TextField
            size="small"
            label="Sub-County"
            value={filters.subcounty}
            onChange={(event) => setFilters((prev) => ({ ...prev, subcounty: event.target.value }))}
            sx={{ minWidth: 160 }}
          />
          <TextField
            size="small"
            label="Ward"
            value={filters.ward}
            onChange={(event) => setFilters((prev) => ({ ...prev, ward: event.target.value }))}
            sx={{ minWidth: 160 }}
          />
          {filters.projectId ? (
            <Chip
              label={`Project #${filters.projectId}`}
              onDelete={() => setFilters((prev) => ({ ...prev, projectId: '' }))}
              color="primary"
              variant="outlined"
            />
          ) : null}
          <Button variant="outlined" startIcon={<RefreshIcon />} onClick={fetchRows} disabled={loading}>
            Refresh
          </Button>
          {canCreate ? (
            <Button variant="contained" startIcon={<AddIcon />} onClick={openCreateDialog}>
              New PMC Report
            </Button>
          ) : null}
        </Stack>
      </Paper>

      <Paper sx={{ height: 560, width: '100%' }}>
        <DataGrid
          rows={rows}
          columns={columns}
          getRowId={(row) => row.reportId}
          loading={loading}
          disableRowSelectionOnClick
          pageSizeOptions={[10, 25, 50]}
          initialState={{ pagination: { paginationModel: { pageSize: 10 } } }}
        />
      </Paper>

      <Dialog open={dialogOpen} onClose={closeDialog} fullWidth maxWidth="md">
        <DialogTitle>{editingRow ? 'Edit PMC Ward Report' : 'New PMC Ward Report'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Autocomplete
              options={projectOptions}
              loading={projectsLoading}
              value={projectOptions.find((option) => String(option.id) === String(form.projectId)) || null}
              onChange={(_, option) => setForm((prev) => ({
                ...prev,
                projectId: option?.id || '',
                subcounty: option?.subcounty || prev.subcounty,
                ward: option?.ward || prev.ward,
              }))}
              getOptionLabel={(option) => option.label}
              renderInput={(params) => <TextField {...params} label="Project" required />}
              disabled={Boolean(editingRow)}
            />
            <TextField
              label="Reporting period"
              placeholder="e.g. 2026 Q1 or March 2026"
              value={form.reportingPeriod}
              onChange={(event) => setForm((prev) => ({ ...prev, reportingPeriod: event.target.value }))}
              required
              fullWidth
            />
            <TextField
              label="Report title"
              value={form.reportTitle}
              onChange={(event) => setForm((prev) => ({ ...prev, reportTitle: event.target.value }))}
              required
              fullWidth
            />
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
              <TextField label="Sub-County" value={form.subcounty} onChange={(event) => setForm((prev) => ({ ...prev, subcounty: event.target.value }))} fullWidth />
              <TextField label="Ward" value={form.ward} onChange={(event) => setForm((prev) => ({ ...prev, ward: event.target.value }))} fullWidth />
            </Stack>
            <TextField label="PMC summary" value={form.summary} onChange={(event) => setForm((prev) => ({ ...prev, summary: event.target.value }))} multiline minRows={3} fullWidth />
            <TextField label="Progress notes" value={form.progressNotes} onChange={(event) => setForm((prev) => ({ ...prev, progressNotes: event.target.value }))} multiline minRows={2} fullWidth />
            <TextField label="Challenges" value={form.challenges} onChange={(event) => setForm((prev) => ({ ...prev, challenges: event.target.value }))} multiline minRows={2} fullWidth />
            <TextField label="Recommendations" value={form.recommendations} onChange={(event) => setForm((prev) => ({ ...prev, recommendations: event.target.value }))} multiline minRows={2} fullWidth />
            <Button variant="outlined" component="label" startIcon={<UploadFileIcon />}>
              {signedFile ? signedFile.name : (editingRow?.hasSignedFile ? 'Replace signed report (PDF/Word/image)' : 'Upload signed report (PDF/Word/image)')}
              <input hidden type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" onChange={(event) => setSignedFile(event.target.files?.[0] || null)} />
            </Button>
            {editingRow?.hasSignedFile && !signedFile ? (
              <Typography variant="caption" color="text.secondary">
                Current file: {editingRow.signedFileName}
              </Typography>
            ) : null}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeDialog} disabled={submitting}>Cancel</Button>
          <Button variant="contained" onClick={handleSave} disabled={submitting}>
            {submitting ? <CircularProgress size={18} color="inherit" /> : 'Save draft'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={reviewOpen} onClose={() => !submitting && setReviewOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>{reviewRow?.mode === 'approve' ? 'Approve PMC Report' : 'Return PMC Report'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Typography variant="body2">
              {reviewRow?.reportTitle} — {reviewRow?.projectName} ({reviewRow?.ward || 'ward n/a'})
            </Typography>
            {historyActions.length > 0 ? (
              <Box>
                <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Revision history</Typography>
                <Paper variant="outlined" sx={{ maxHeight: 180, overflow: 'auto', p: 1 }}>
                  <List dense disablePadding>
                    {historyActions.slice(-5).map((action) => (
                      <ListItem key={action.actionId} disableGutters sx={{ py: 0.25 }}>
                        <ListItemText
                          primary={`${actionLabel(action.actionType)} · ${action.actorName || 'Unknown'}`}
                          secondary={[
                            formatDate(action.createdAt),
                            action.comment,
                          ].filter(Boolean).join(' — ')}
                          primaryTypographyProps={{ variant: 'caption', fontWeight: 600 }}
                          secondaryTypographyProps={{ variant: 'caption' }}
                        />
                      </ListItem>
                    ))}
                  </List>
                </Paper>
              </Box>
            ) : null}
            <TextField
              label={reviewRow?.mode === 'approve' ? 'Approval comment (optional)' : 'Return comment (required)'}
              value={reviewComment}
              onChange={(event) => setReviewComment(event.target.value)}
              multiline
              minRows={3}
              fullWidth
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setReviewOpen(false)} disabled={submitting}>Cancel</Button>
          <Button variant="contained" color={reviewRow?.mode === 'approve' ? 'success' : 'warning'} onClick={handleReview} disabled={submitting}>
            {submitting ? <CircularProgress size={18} color="inherit" /> : (reviewRow?.mode === 'approve' ? 'Approve' : 'Return to Ward')}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        fullWidth
        maxWidth="md"
      >
        <DialogTitle>
          Revision history
          {historyRow?.reportTitle ? ` — ${historyRow.reportTitle}` : ''}
        </DialogTitle>
        <DialogContent dividers>
          {historyLoading ? (
            <Stack direction="row" spacing={1} alignItems="center" sx={{ py: 2 }}>
              <CircularProgress size={20} />
              <Typography variant="body2">Loading revision history...</Typography>
            </Stack>
          ) : historyActions.length === 0 ? (
            <Typography variant="body2" color="text.secondary">No revision history recorded yet.</Typography>
          ) : (
            <Stack spacing={1.5}>
              {historyActions.map((action, index) => (
                <Paper key={action.actionId} variant="outlined" sx={{ p: 1.5 }}>
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} justifyContent="space-between" alignItems={{ sm: 'center' }}>
                    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                      <Chip
                        size="small"
                        label={actionLabel(action.actionType)}
                        color={ACTION_COLORS[action.actionType] || 'default'}
                      />
                      {action.fromStatus && action.toStatus && action.fromStatus !== action.toStatus ? (
                        <Typography variant="caption" color="text.secondary">
                          {statusLabel(action.fromStatus)} → {statusLabel(action.toStatus)}
                        </Typography>
                      ) : null}
                    </Stack>
                    <Typography variant="caption" color="text.secondary">
                      {formatDate(action.createdAt)}
                    </Typography>
                  </Stack>
                  <Typography variant="body2" sx={{ mt: 0.75 }}>
                    {action.actorName || 'Unknown user'}
                  </Typography>
                  {action.comment ? (
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, whiteSpace: 'pre-wrap' }}>
                      {action.comment}
                    </Typography>
                  ) : null}
                  {action.hasSignedFile ? (
                    <Button
                      size="small"
                      startIcon={<DownloadIcon />}
                      sx={{ mt: 1 }}
                      onClick={() => handleDownloadHistoryFile(historyRow?.reportId, action)}
                    >
                      {action.signedFileName || 'Download document'}
                    </Button>
                  ) : null}
                </Paper>
              ))}
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setHistoryOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={toast.open}
        autoHideDuration={5000}
        onClose={() => setToast((prev) => ({ ...prev, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={toast.severity} onClose={() => setToast((prev) => ({ ...prev, open: false }))}>
          {toast.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
