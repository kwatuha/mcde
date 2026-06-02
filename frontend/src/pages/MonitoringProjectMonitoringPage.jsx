import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Snackbar,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  FileDownload as FileDownloadIcon,
  PictureAsPdf as PictureAsPdfIcon,
  Refresh as RefreshIcon,
  Search as SearchIcon,
  UploadFile as UploadFileIcon,
  Visibility as VisibilityIcon,
} from '@mui/icons-material';
import { DataGrid } from '@mui/x-data-grid';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import apiService from '../api';
import { useAuth } from '../context/AuthContext';

const emptyForm = {
  projectId: '',
  projectActivityCode: '',
  projectActivityName: '',
  projectIndicatorName: '',
  reportDate: new Date().toISOString().slice(0, 10),
  achievedValue: '',
  comment: '',
  recommendations: '',
  challenges: '',
  warningLevel: 'None',
  isRoutineObservation: true,
};

const stripHtml = (value) => String(value || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

const formatDate = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

const csvEscape = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;

const MonitoringProjectMonitoringPage = () => {
  const navigate = useNavigate();
  const { hasPrivilege } = useAuth();
  const canCreate = hasPrivilege('project_monitoring.create');
  const canUpdate = hasPrivilege('project_monitoring.update');
  const canDelete = hasPrivilege('project_monitoring.delete');

  const [rows, setRows] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(false);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [filters, setFilters] = useState({ startDate: '', endDate: '', search: '' });
  const [draftFilters, setDraftFilters] = useState({ startDate: '', endDate: '', search: '' });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [toast, setToast] = useState({ open: false, severity: 'success', message: '' });

  const showToast = (severity, message) => setToast({ open: true, severity, message });

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiService.projectMonitoring.getAllRecords(filters);
      setRows(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Failed to load project monitoring records:', error);
      showToast('error', error.response?.data?.message || 'Failed to load project monitoring records.');
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
      console.error('Failed to load projects:', error);
      showToast('error', 'Failed to load projects for the monitoring form.');
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

  const projectOptions = useMemo(() => projects.map((project) => ({
    id: project.id ?? project.projectId,
    label: project.projectName || project.name || `Project #${project.id ?? project.projectId}`,
    code: project.ProjectRefNum || project.projectCode || project.project_ref_num || '',
  })).filter((project) => project.id), [projects]);

  const totals = useMemo(() => {
    const achievedTotal = rows.reduce((sum, row) => sum + (Number(row.achievedValue) || 0), 0);
    const evidenceTotal = rows.reduce((sum, row) => sum + (Number(row.evidenceCount) || 0), 0);
    return { recordCount: rows.length, achievedTotal, evidenceTotal };
  }, [rows]);

  const openCreateDialog = () => {
    setEditingRecord(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEditDialog = (record) => {
    setEditingRecord(record);
    setForm({
      projectId: record.projectId || '',
      projectActivityCode: record.projectActivityCode || '',
      projectActivityName: record.projectActivityName || '',
      projectIndicatorName: record.projectIndicatorName || '',
      reportDate: record.reportDate ? new Date(record.reportDate).toISOString().slice(0, 10) : '',
      achievedValue: record.achievedValue ?? '',
      comment: stripHtml(record.remarks || record.comment),
      recommendations: record.recommendations || '',
      challenges: record.challenges || '',
      warningLevel: record.warningLevel || 'None',
      isRoutineObservation: record.isRoutineObservation !== false && record.isRoutineObservation !== 0,
    });
    setDialogOpen(true);
  };

  const closeDialog = () => {
    if (submitting) return;
    setDialogOpen(false);
    setEditingRecord(null);
    setForm(emptyForm);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!form.projectId) {
      showToast('error', 'Select a project before saving.');
      return;
    }
    if (!form.comment.trim()) {
      showToast('error', 'Remarks are required.');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        ...form,
        achievedValue: form.achievedValue === '' ? null : Number(form.achievedValue),
        comment: form.comment.trim(),
      };
      if (editingRecord) {
        await apiService.projectMonitoring.updateRecord(form.projectId, editingRecord.recordId, payload);
        showToast('success', 'Project monitoring record updated.');
      } else {
        await apiService.projectMonitoring.createRecord(form.projectId, payload);
        showToast('success', 'Project monitoring record added.');
      }
      closeDialog();
      fetchRows();
    } catch (error) {
      console.error('Failed to save project monitoring record:', error);
      showToast('error', error.response?.data?.message || 'Failed to save project monitoring record.');
    } finally {
      setSubmitting(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setSubmitting(true);
    try {
      await apiService.projectMonitoring.deleteRecord(deleteTarget.projectId, deleteTarget.recordId);
      setDeleteTarget(null);
      showToast('success', 'Project monitoring record deleted.');
      fetchRows();
    } catch (error) {
      console.error('Failed to delete project monitoring record:', error);
      showToast('error', error.response?.data?.message || 'Failed to delete project monitoring record.');
    } finally {
      setSubmitting(false);
    }
  };

  const exportCsv = () => {
    const headers = [
      '#',
      'Project Code',
      'Project Name',
      'Project Activity Code',
      'Project Activity Name',
      'Project Indicator Name',
      'Report Date',
      'Achieved Value',
      'Evidence',
      'Remarks',
      'Created By',
    ];
    const body = rows.map((row, index) => [
      index + 1,
      row.projectCode,
      row.projectName,
      row.projectActivityCode,
      row.projectActivityName,
      row.projectIndicatorName,
      formatDate(row.reportDate),
      row.achievedValue ?? '',
      row.evidenceCount ?? 0,
      stripHtml(row.remarks),
      row.createdBy,
    ]);
    const csv = [headers, ...body].map((line) => line.map(csvEscape).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `project-monitoring-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const exportPdf = () => {
    const doc = new jsPDF({ orientation: 'landscape' });
    doc.setFontSize(14);
    doc.text('County Government of Machakos', 14, 14);
    doc.setFontSize(11);
    doc.text('Project Monitoring List', 14, 22);
    autoTable(doc, {
      startY: 30,
      head: [[
        '#',
        'Project Code',
        'Project Name',
        'Activity Code',
        'Activity Name',
        'Indicator',
        'Report Date',
        'Achieved',
        'Evidence',
        'Remarks',
        'Created By',
      ]],
      body: rows.map((row, index) => [
        index + 1,
        row.projectCode || '',
        row.projectName || '',
        row.projectActivityCode || '',
        row.projectActivityName || '',
        row.projectIndicatorName || '',
        formatDate(row.reportDate),
        row.achievedValue ?? '',
        row.evidenceCount ?? 0,
        stripHtml(row.remarks),
        row.createdBy || '',
      ]),
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [0, 39, 76] },
      columnStyles: {
        2: { cellWidth: 40 },
        4: { cellWidth: 36 },
        5: { cellWidth: 36 },
        9: { cellWidth: 45 },
      },
    });
    doc.save(`project-monitoring-${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  const columns = useMemo(() => [
    { field: 'rowNumber', headerName: '#', width: 70, sortable: false },
    { field: 'projectCode', headerName: 'Project Code', width: 130 },
    { field: 'projectName', headerName: 'Project Name', minWidth: 220, flex: 1 },
    { field: 'projectActivityCode', headerName: 'Activity Code', width: 145 },
    { field: 'projectActivityName', headerName: 'Activity Name', minWidth: 190, flex: 0.8 },
    { field: 'projectIndicatorName', headerName: 'Indicator', minWidth: 190, flex: 0.8 },
    { field: 'reportDate', headerName: 'Report Date', width: 135, valueFormatter: (value) => formatDate(value) },
    {
      field: 'achievedValue',
      headerName: 'Achieved Value',
      width: 145,
      type: 'number',
      valueFormatter: (value) => value == null || value === '' ? '—' : Number(value).toLocaleString(),
    },
    {
      field: 'evidenceCount',
      headerName: 'Evidence',
      width: 115,
      renderCell: ({ value }) => (
        <Chip size="small" color={Number(value) > 0 ? 'primary' : 'default'} label={Number(value) || 0} />
      ),
    },
    {
      field: 'remarks',
      headerName: 'Remarks',
      minWidth: 230,
      flex: 1,
      valueGetter: (value) => stripHtml(value),
    },
    { field: 'createdBy', headerName: 'Created By', width: 170 },
    {
      field: 'actions',
      headerName: 'Action',
      width: 190,
      sortable: false,
      filterable: false,
      renderCell: ({ row }) => (
        <Stack direction="row" spacing={0.5}>
          <Tooltip title="View project">
            <IconButton size="small" color="primary" onClick={() => navigate(`/projects/${row.projectId}`)}>
              <VisibilityIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Upload evidence on project documents">
            <IconButton size="small" color="info" onClick={() => navigate(`/projects/${row.projectId}`)}>
              <UploadFileIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          {canUpdate && (
            <Tooltip title="Edit monitoring record">
              <IconButton size="small" color="warning" onClick={() => openEditDialog(row)}>
                <EditIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          {canDelete && (
            <Tooltip title="Delete monitoring record">
              <IconButton size="small" color="error" onClick={() => setDeleteTarget(row)}>
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
        </Stack>
      ),
    },
  ], [canDelete, canUpdate, navigate]);

  const gridRows = useMemo(() => rows.map((row, index) => ({
    ...row,
    id: row.recordId || `${row.projectId}-${index}`,
    rowNumber: index + 1,
  })), [rows]);

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      <Paper sx={{ p: 2.5, mb: 2, borderRadius: 2 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={2}>
          <Box>
            <Typography variant="h5" fontWeight={700}>Project Monitoring List</Typography>
            <Typography variant="body2" color="text.secondary">
              Track reported project activities, indicators, achieved values, evidence and remarks.
            </Typography>
          </Box>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <Button variant="contained" color="success" startIcon={<PictureAsPdfIcon />} onClick={exportPdf} disabled={!rows.length}>
              Export PDF
            </Button>
            <Button variant="contained" color="success" startIcon={<FileDownloadIcon />} onClick={exportCsv} disabled={!rows.length}>
              Export CSV
            </Button>
            {canCreate && (
              <Button variant="contained" startIcon={<AddIcon />} onClick={openCreateDialog}>
                Add Project Monitoring
              </Button>
            )}
          </Stack>
        </Stack>
      </Paper>

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ mb: 2 }}>
        <Paper sx={{ p: 2, flex: 1 }}>
          <Typography variant="caption" color="text.secondary">Monitoring Records</Typography>
          <Typography variant="h5" fontWeight={700}>{totals.recordCount.toLocaleString()}</Typography>
        </Paper>
        <Paper sx={{ p: 2, flex: 1 }}>
          <Typography variant="caption" color="text.secondary">Total Achieved Value</Typography>
          <Typography variant="h5" fontWeight={700}>{totals.achievedTotal.toLocaleString()}</Typography>
        </Paper>
        <Paper sx={{ p: 2, flex: 1 }}>
          <Typography variant="caption" color="text.secondary">Evidence Files</Typography>
          <Typography variant="h5" fontWeight={700}>{totals.evidenceTotal.toLocaleString()}</Typography>
        </Paper>
      </Stack>

      <Paper sx={{ p: 2, mb: 2, borderRadius: 2 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ md: 'flex-end' }}>
          <TextField
            label="Start Date"
            type="date"
            size="small"
            InputLabelProps={{ shrink: true }}
            value={draftFilters.startDate}
            onChange={(event) => setDraftFilters((prev) => ({ ...prev, startDate: event.target.value }))}
            sx={{ minWidth: 180 }}
          />
          <TextField
            label="End Date"
            type="date"
            size="small"
            InputLabelProps={{ shrink: true }}
            value={draftFilters.endDate}
            onChange={(event) => setDraftFilters((prev) => ({ ...prev, endDate: event.target.value }))}
            sx={{ minWidth: 180 }}
          />
          <TextField
            label="Search"
            size="small"
            value={draftFilters.search}
            onChange={(event) => setDraftFilters((prev) => ({ ...prev, search: event.target.value }))}
            placeholder="Search project, activity, indicator or remarks"
            sx={{ minWidth: { xs: '100%', md: 340 } }}
          />
          <Button variant="contained" startIcon={<SearchIcon />} onClick={() => setFilters(draftFilters)}>
            Search
          </Button>
          <Button variant="outlined" startIcon={<RefreshIcon />} onClick={() => {
            setDraftFilters({ startDate: '', endDate: '', search: '' });
            setFilters({ startDate: '', endDate: '', search: '' });
          }}>
            Reset
          </Button>
        </Stack>
      </Paper>

      <Paper sx={{ height: 650, borderRadius: 2 }}>
        <DataGrid
          rows={gridRows}
          columns={columns}
          loading={loading}
          disableRowSelectionOnClick
          pageSizeOptions={[10, 25, 50, 100]}
          initialState={{ pagination: { paginationModel: { pageSize: 10, page: 0 } } }}
          sx={{
            border: 0,
            '& .MuiDataGrid-columnHeaders': {
              bgcolor: '#00274c',
              color: 'white',
              fontWeight: 700,
            },
          }}
        />
      </Paper>

      <Dialog open={dialogOpen} onClose={closeDialog} fullWidth maxWidth="md">
        <DialogTitle>{editingRecord ? 'Edit Project Monitoring' : 'Add Project Monitoring'}</DialogTitle>
        <Box component="form" onSubmit={handleSubmit}>
          <DialogContent dividers>
            <Stack spacing={2}>
              <Autocomplete
                options={projectOptions}
                loading={projectsLoading}
                disabled={Boolean(editingRecord)}
                value={projectOptions.find((project) => String(project.id) === String(form.projectId)) || null}
                onChange={(_, option) => setForm((prev) => ({ ...prev, projectId: option?.id || '' }))}
                getOptionLabel={(option) => option?.code ? `${option.code} - ${option.label}` : option?.label || ''}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Project"
                    required
                    InputProps={{
                      ...params.InputProps,
                      endAdornment: (
                        <>
                          {projectsLoading ? <CircularProgress color="inherit" size={18} /> : null}
                          {params.InputProps.endAdornment}
                        </>
                      ),
                    }}
                  />
                )}
              />
              <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
                <TextField
                  label="Project Activity Code"
                  value={form.projectActivityCode}
                  onChange={(event) => setForm((prev) => ({ ...prev, projectActivityCode: event.target.value }))}
                  fullWidth
                />
                <TextField
                  label="Report Date"
                  type="date"
                  InputLabelProps={{ shrink: true }}
                  value={form.reportDate}
                  onChange={(event) => setForm((prev) => ({ ...prev, reportDate: event.target.value }))}
                  fullWidth
                />
              </Stack>
              <TextField
                label="Project Activity Name"
                value={form.projectActivityName}
                onChange={(event) => setForm((prev) => ({ ...prev, projectActivityName: event.target.value }))}
                fullWidth
              />
              <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
                <TextField
                  label="Project Indicator Name"
                  value={form.projectIndicatorName}
                  onChange={(event) => setForm((prev) => ({ ...prev, projectIndicatorName: event.target.value }))}
                  fullWidth
                />
                <TextField
                  label="Achieved Value"
                  type="number"
                  value={form.achievedValue}
                  onChange={(event) => setForm((prev) => ({ ...prev, achievedValue: event.target.value }))}
                  fullWidth
                />
              </Stack>
              <TextField
                label="Remarks"
                value={form.comment}
                onChange={(event) => setForm((prev) => ({ ...prev, comment: event.target.value }))}
                required
                multiline
                minRows={3}
                fullWidth
              />
              <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
                <TextField
                  label="Recommendations"
                  value={form.recommendations}
                  onChange={(event) => setForm((prev) => ({ ...prev, recommendations: event.target.value }))}
                  multiline
                  minRows={2}
                  fullWidth
                />
                <TextField
                  label="Challenges"
                  value={form.challenges}
                  onChange={(event) => setForm((prev) => ({ ...prev, challenges: event.target.value }))}
                  multiline
                  minRows={2}
                  fullWidth
                />
              </Stack>
              <FormControl sx={{ minWidth: 220 }}>
                <InputLabel id="warning-level-label">Risk / Warning Level</InputLabel>
                <Select
                  labelId="warning-level-label"
                  label="Risk / Warning Level"
                  value={form.warningLevel}
                  onChange={(event) => setForm((prev) => ({ ...prev, warningLevel: event.target.value }))}
                >
                  {['None', 'Low', 'Medium', 'High'].map((level) => (
                    <MenuItem key={level} value={level}>{level}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={closeDialog} disabled={submitting}>Cancel</Button>
            <Button type="submit" variant="contained" disabled={submitting}>
              {submitting ? 'Saving...' : 'Save'}
            </Button>
          </DialogActions>
        </Box>
      </Dialog>

      <Dialog open={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)}>
        <DialogTitle>Delete Project Monitoring Record?</DialogTitle>
        <DialogContent>
          <Typography>
            Do you want to delete this project monitoring record for {deleteTarget?.projectName || 'this project'}?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)} disabled={submitting}>No</Button>
          <Button color="error" variant="contained" onClick={confirmDelete} disabled={submitting}>Yes, Delete</Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={toast.open}
        autoHideDuration={3500}
        onClose={() => setToast((prev) => ({ ...prev, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert severity={toast.severity} onClose={() => setToast((prev) => ({ ...prev, open: false }))}>
          {toast.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default MonitoringProjectMonitoringPage;
