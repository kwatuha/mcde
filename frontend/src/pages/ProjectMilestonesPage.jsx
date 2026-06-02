import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
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
  milestoneValue: '',
  milestonePeriod: 'QTR1',
  milestoneDate: '',
  milestoneSource: '',
  remarks: '',
  sequenceOrder: '',
  weight: 1,
  status: 'pending',
};

const PERIOD_OPTIONS = ['QTR1', 'QTR2', 'QTR3', 'QTR4', 'Annual'];

const stripHtml = (value) => String(value || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

const formatDate = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }).toUpperCase();
};

const csvEscape = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;

const ProjectMilestonesPage = () => {
  const navigate = useNavigate();
  const { hasPrivilege } = useAuth();
  const canCreate = hasPrivilege('project_milestone.create') || hasPrivilege('project.update') || hasPrivilege('project.create');
  const canUpdate = hasPrivilege('project_milestone.update') || hasPrivilege('project.update');
  const canDelete = hasPrivilege('project_milestone.delete') || hasPrivilege('project.delete') || hasPrivilege('project.update');

  const [rows, setRows] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(false);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [filters, setFilters] = useState({ startDate: '', endDate: '', search: '' });
  const [draftFilters, setDraftFilters] = useState({ startDate: '', endDate: '', search: '' });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRow, setEditingRow] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [toast, setToast] = useState({ open: false, severity: 'success', message: '' });

  const showToast = (severity, message) => setToast({ open: true, severity, message });

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiService.milestones.getAllMilestones(filters);
      setRows(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Failed to load project milestones:', error);
      showToast('error', error.response?.data?.message || 'Failed to load project milestones.');
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
      showToast('error', 'Failed to load projects for the milestone form.');
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

  const gridRows = useMemo(() => rows.map((row, index) => ({
    ...row,
    id: row.milestoneId || `${row.projectId}-${index}`,
    rowNumber: index + 1,
    remarksText: stripHtml(row.remarks || row.description),
  })), [rows]);

  const totals = useMemo(() => {
    const valueTotal = rows.reduce((sum, row) => sum + (Number(row.milestoneValue) || 0), 0);
    return { count: rows.length, valueTotal };
  }, [rows]);

  const openCreate = () => {
    setEditingRow(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (row) => {
    setEditingRow(row);
    setForm({
      projectId: row.projectId || '',
      projectActivityCode: row.projectActivityCode || '',
      projectActivityName: row.projectActivityName || row.milestoneName || '',
      projectIndicatorName: row.projectIndicatorName || '',
      milestoneValue: row.milestoneValue ?? row.progress ?? '',
      milestonePeriod: row.milestonePeriod || 'QTR1',
      milestoneDate: row.milestoneDate || row.dueDate ? new Date(row.milestoneDate || row.dueDate).toISOString().slice(0, 10) : '',
      milestoneSource: row.milestoneSource || '',
      remarks: stripHtml(row.remarks || row.description),
      sequenceOrder: row.sequenceOrder ?? '',
      weight: row.weight ?? 1,
      status: row.status || 'pending',
    });
    setDialogOpen(true);
  };

  const closeDialog = () => {
    if (submitting) return;
    setDialogOpen(false);
    setEditingRow(null);
    setForm(emptyForm);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!form.projectId) {
      showToast('error', 'Select a project before saving.');
      return;
    }
    if (!form.projectActivityName.trim()) {
      showToast('error', 'Project activity name is required.');
      return;
    }
    if (!form.milestoneDate) {
      showToast('error', 'Milestone date is required.');
      return;
    }

    const payload = {
      ...form,
      milestoneName: form.projectActivityName.trim(),
      dueDate: form.milestoneDate,
      description: form.remarks.trim() || null,
      milestoneValue: form.milestoneValue === '' ? null : Number(form.milestoneValue),
      progress: form.milestoneValue === '' ? 0 : Number(form.milestoneValue),
      sequenceOrder: form.sequenceOrder === '' ? null : Number(form.sequenceOrder),
      weight: form.weight === '' ? 1 : Number(form.weight),
    };

    setSubmitting(true);
    try {
      if (editingRow) {
        await apiService.milestones.updateMilestone(editingRow.milestoneId, payload);
        showToast('success', 'Project milestone updated.');
      } else {
        await apiService.milestones.createMilestone(payload);
        showToast('success', 'Project milestone added.');
      }
      closeDialog();
      fetchRows();
    } catch (error) {
      console.error('Failed to save project milestone:', error);
      showToast('error', error.response?.data?.message || 'Failed to save project milestone.');
    } finally {
      setSubmitting(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setSubmitting(true);
    try {
      await apiService.milestones.deleteMilestone(deleteTarget.milestoneId);
      setDeleteTarget(null);
      showToast('success', 'Project milestone deleted.');
      fetchRows();
    } catch (error) {
      console.error('Failed to delete project milestone:', error);
      showToast('error', error.response?.data?.message || 'Failed to delete project milestone.');
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
      'Milestone Value',
      'Milestone Period',
      'Milestone Date',
      'Milestone Source',
      'Remarks',
    ];
    const body = gridRows.map((row) => [
      row.rowNumber,
      row.projectCode,
      row.projectName,
      row.projectActivityCode,
      row.projectActivityName,
      row.projectIndicatorName,
      row.milestoneValue ?? '',
      row.milestonePeriod,
      formatDate(row.milestoneDate || row.dueDate),
      row.milestoneSource,
      row.remarksText,
    ]);
    const csv = [headers, ...body].map((line) => line.map(csvEscape).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `project-milestones-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const exportPdf = () => {
    const doc = new jsPDF({ orientation: 'landscape' });
    doc.setFontSize(14);
    doc.text('County Government of Machakos', 14, 14);
    doc.setFontSize(11);
    doc.text('Project Milestone List', 14, 22);
    autoTable(doc, {
      startY: 30,
      head: [[
        '#',
        'Project Code',
        'Project Name',
        'Activity Code',
        'Activity Name',
        'Indicator',
        'Value',
        'Period',
        'Date',
        'Source',
        'Remarks',
      ]],
      body: gridRows.map((row) => [
        row.rowNumber,
        row.projectCode || '',
        row.projectName || '',
        row.projectActivityCode || '',
        row.projectActivityName || '',
        row.projectIndicatorName || '',
        row.milestoneValue ?? '',
        row.milestonePeriod || '',
        formatDate(row.milestoneDate || row.dueDate),
        row.milestoneSource || '',
        row.remarksText || '',
      ]),
      styles: { fontSize: 7, cellPadding: 2, overflow: 'linebreak' },
      headStyles: { fillColor: [0, 39, 76] },
      columnStyles: {
        2: { cellWidth: 36 },
        4: { cellWidth: 36 },
        5: { cellWidth: 34 },
        10: { cellWidth: 44 },
      },
    });
    doc.save(`project-milestones-${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  const columns = useMemo(() => [
    { field: 'rowNumber', headerName: '#', width: 70, sortable: false },
    { field: 'projectCode', headerName: 'Project Code', width: 130 },
    { field: 'projectName', headerName: 'Project Name', minWidth: 210, flex: 1 },
    { field: 'projectActivityCode', headerName: 'Activity Code', width: 140 },
    { field: 'projectActivityName', headerName: 'Activity Name', minWidth: 190, flex: 0.8 },
    { field: 'projectIndicatorName', headerName: 'Indicator', minWidth: 190, flex: 0.8 },
    {
      field: 'milestoneValue',
      headerName: 'Milestone Value',
      width: 145,
      type: 'number',
      valueFormatter: (value) => value == null || value === '' ? '—' : Number(value).toLocaleString(),
    },
    { field: 'milestonePeriod', headerName: 'Milestone Period', width: 145 },
    { field: 'milestoneDate', headerName: 'Milestone Date', width: 140, valueFormatter: (value) => formatDate(value) },
    { field: 'milestoneSource', headerName: 'Milestone Source', minWidth: 180, flex: 0.7 },
    { field: 'remarksText', headerName: 'Remarks', minWidth: 220, flex: 1 },
    {
      field: 'actions',
      headerName: 'Action',
      width: 150,
      sortable: false,
      filterable: false,
      renderCell: ({ row }) => (
        <Stack direction="row" spacing={0.5}>
          <Tooltip title="View project">
            <IconButton size="small" color="primary" onClick={() => navigate(`/projects/${row.projectId}`)}>
              <VisibilityIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          {canUpdate && (
            <Tooltip title="Edit milestone">
              <IconButton size="small" color="warning" onClick={() => openEdit(row)}>
                <EditIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          {canDelete && (
            <Tooltip title="Delete milestone">
              <IconButton size="small" color="error" onClick={() => setDeleteTarget(row)}>
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
        </Stack>
      ),
    },
  ], [canDelete, canUpdate, navigate]);

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      <Paper sx={{ p: 2.5, mb: 2, borderRadius: 2 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={2}>
          <Box>
            <Typography variant="h5" fontWeight={700}>Project Milestone List</Typography>
            <Typography variant="body2" color="text.secondary">
              Manage project targets by activity, indicator, milestone value, period, source, and remarks.
            </Typography>
          </Box>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <Button variant="contained" color="success" startIcon={<PictureAsPdfIcon />} onClick={exportPdf} disabled={!gridRows.length}>
              Export PDF
            </Button>
            <Button variant="contained" color="success" startIcon={<FileDownloadIcon />} onClick={exportCsv} disabled={!gridRows.length}>
              Export CSV
            </Button>
            {canCreate && (
              <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
                Add Project Milestone
              </Button>
            )}
          </Stack>
        </Stack>
      </Paper>

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ mb: 2 }}>
        <Paper sx={{ p: 2, flex: 1 }}>
          <Typography variant="caption" color="text.secondary">Milestones</Typography>
          <Typography variant="h5" fontWeight={700}>{totals.count.toLocaleString()}</Typography>
        </Paper>
        <Paper sx={{ p: 2, flex: 1 }}>
          <Typography variant="caption" color="text.secondary">Total Milestone Value</Typography>
          <Typography variant="h5" fontWeight={700}>{totals.valueTotal.toLocaleString()}</Typography>
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
            placeholder="Search project, activity, indicator, source or remarks"
            sx={{ minWidth: { xs: '100%', md: 360 } }}
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
        <DialogTitle>{editingRow ? 'Edit Project Milestone' : 'Add Project Milestone'}</DialogTitle>
        <Box component="form" onSubmit={handleSubmit}>
          <DialogContent dividers>
            <Stack spacing={2}>
              <Autocomplete
                options={projectOptions}
                loading={projectsLoading}
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
                  label="Milestone Date"
                  type="date"
                  InputLabelProps={{ shrink: true }}
                  value={form.milestoneDate}
                  onChange={(event) => setForm((prev) => ({ ...prev, milestoneDate: event.target.value }))}
                  required
                  fullWidth
                />
              </Stack>
              <TextField
                label="Project Activity Name"
                value={form.projectActivityName}
                onChange={(event) => setForm((prev) => ({ ...prev, projectActivityName: event.target.value }))}
                required
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
                  label="Milestone Value"
                  type="number"
                  value={form.milestoneValue}
                  onChange={(event) => setForm((prev) => ({ ...prev, milestoneValue: event.target.value }))}
                  fullWidth
                />
              </Stack>
              <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
                <FormControl fullWidth sx={{ minWidth: 180 }}>
                  <InputLabel id="milestone-period-label">Milestone Period</InputLabel>
                  <Select
                    labelId="milestone-period-label"
                    label="Milestone Period"
                    value={form.milestonePeriod}
                    onChange={(event) => setForm((prev) => ({ ...prev, milestonePeriod: event.target.value }))}
                  >
                    {PERIOD_OPTIONS.map((period) => (
                      <MenuItem key={period} value={period}>{period}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <TextField
                  label="Milestone Source"
                  value={form.milestoneSource}
                  onChange={(event) => setForm((prev) => ({ ...prev, milestoneSource: event.target.value }))}
                  fullWidth
                />
              </Stack>
              <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
                <TextField
                  label="Sequence Order"
                  type="number"
                  value={form.sequenceOrder}
                  onChange={(event) => setForm((prev) => ({ ...prev, sequenceOrder: event.target.value }))}
                  fullWidth
                />
                <TextField
                  label="Weight"
                  type="number"
                  value={form.weight}
                  onChange={(event) => setForm((prev) => ({ ...prev, weight: event.target.value }))}
                  fullWidth
                />
              </Stack>
              <TextField
                label="Remarks"
                value={form.remarks}
                onChange={(event) => setForm((prev) => ({ ...prev, remarks: event.target.value }))}
                multiline
                minRows={3}
                fullWidth
              />
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
        <DialogTitle>Delete Project Milestone?</DialogTitle>
        <DialogContent>
          <Typography>
            Do you want to delete this project milestone for {deleteTarget?.projectName || 'this project'}?
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

export default ProjectMilestonesPage;
