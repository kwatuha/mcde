import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box,
  Paper,
  Alert,
  CircularProgress,
  TextField,
  Button,
  Stack,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Chip,
  MenuItem,
} from '@mui/material';
import { DataGrid } from '@mui/x-data-grid';
import Header from './dashboard/Header';
import { useAuth } from '../context/AuthContext';
import apiService from '../api';
import { getProjectStatusBackgroundColor, getProjectStatusTextColor } from '../utils/projectStatusColors';

const STATUS_OPTIONS = ['Not Started', 'Ongoing', 'Completed', 'Stalled', 'Under Procurement', 'Suspended', 'Other'];

export default function ProjectStatusPage() {
  const { hasPrivilege } = useAuth();
  const canRead = hasPrivilege && hasPrivilege('project.read_all');
  const canWrite = hasPrivilege && hasPrivilege('project.update');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState('');
  const [dialog, setDialog] = useState({ open: false, row: null });
  const [form, setForm] = useState({
    status: '',
    overallProgress: '',
    progressSummary: '',
    statusReason: '',
  });

  const loadProjects = useCallback(async () => {
    if (!canRead) {
      setLoading(false);
      setRows([]);
      setError('You need project.read_all privilege to view project status.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const data = await apiService.projects.getProjects({ limit: 5000 });
      const list = Array.isArray(data?.projects) ? data.projects : Array.isArray(data) ? data : [];
      setRows(list);
    } catch (e) {
      setRows([]);
      setError(e?.response?.data?.message || e?.message || 'Failed to load projects.');
    } finally {
      setLoading(false);
    }
  }, [canRead]);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const text = [
        r.projectName,
        r.name,
        r.status,
        r.statusReason,
        r.countyNames,
        r.wardNames,
        r.projectId,
        r.id,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return text.includes(q);
    });
  }, [rows, search]);

  const openEdit = (row) => {
    setForm({
      status: row.status || '',
      overallProgress: row.overallProgress != null ? String(row.overallProgress) : '',
      progressSummary: row.progressSummary || row.latestUpdateSummary || '',
      statusReason: row.statusReason || '',
    });
    setDialog({ open: true, row });
  };

  const save = async () => {
    if (!dialog.row || !canWrite) return;
    const projectId = dialog.row.projectId || dialog.row.id;
    if (!projectId) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      await apiService.projects.updateProject(projectId, {
        status: form.status || undefined,
        overallProgress: form.overallProgress === '' ? undefined : Number(form.overallProgress),
        progressSummary: form.progressSummary?.trim() || undefined,
        statusReason: form.statusReason?.trim() || undefined,
      });
      setMessage('Project status updated.');
      setDialog({ open: false, row: null });
      await loadProjects();
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || 'Failed to save status update.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box sx={{ p: 2 }}>
      <Header title="Project Status" subtitle="Manage overall project status, progress, and update summary" />

      <Paper sx={{ p: 2, mt: 1 }}>
        {error && (
          <Alert severity="error" sx={{ mb: 1 }} onClose={() => setError('')}>
            {error}
          </Alert>
        )}
        {message && (
          <Alert severity="success" sx={{ mb: 1 }} onClose={() => setMessage('')}>
            {message}
          </Alert>
        )}
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mb: 1.5 }}>
          <TextField
            size="small"
            fullWidth
            label="Search projects"
            placeholder="Project name, status, location…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </Stack>

        {loading ? (
          <Box sx={{ py: 6, display: 'flex', justifyContent: 'center' }}>
            <CircularProgress />
          </Box>
        ) : (
          <Box sx={{ height: 600, width: '100%' }}>
            <DataGrid
              rows={filteredRows}
              getRowId={(r) => r.projectId || r.id}
              columns={[
                {
                  field: 'projectName',
                  headerName: 'Project',
                  flex: 1.2,
                  minWidth: 220,
                  valueGetter: (_, row) => row.projectName || row.name || `Project ${row.projectId || row.id}`,
                },
                { field: 'countyNames', headerName: 'County', width: 140, valueGetter: (_, row) => row.countyNames || '—' },
                {
                  field: 'status',
                  headerName: 'Status',
                  width: 180,
                  renderCell: (params) =>
                    params.value ? (
                      <Chip
                        size="small"
                        label={params.value}
                        sx={{
                          backgroundColor: getProjectStatusBackgroundColor(params.value),
                          color: getProjectStatusTextColor(params.value),
                          fontWeight: 700,
                        }}
                      />
                    ) : (
                      '—'
                    ),
                },
                {
                  field: 'overallProgress',
                  headerName: 'Progress %',
                  width: 110,
                  valueGetter: (_, row) => (row.overallProgress != null ? Number(row.overallProgress).toFixed(1) : '—'),
                },
                {
                  field: 'progressSummary',
                  headerName: 'Summary',
                  flex: 1,
                  minWidth: 220,
                  valueGetter: (_, row) => row.progressSummary || row.latestUpdateSummary || '—',
                },
                {
                  field: 'actions',
                  headerName: '',
                  width: 140,
                  sortable: false,
                  renderCell: (params) => (
                    <Button size="small" variant="outlined" disabled={!canWrite} onClick={() => openEdit(params.row)}>
                      Edit status
                    </Button>
                  ),
                },
              ]}
              disableRowSelectionOnClick
              pageSizeOptions={[10, 25, 50]}
              initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
            />
          </Box>
        )}
      </Paper>

      <Dialog open={dialog.open} onClose={() => setDialog({ open: false, row: null })} fullWidth maxWidth="sm">
        <DialogTitle>Update project status</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} sx={{ mt: 1 }}>
            <TextField
              select
              label="Status"
              value={form.status}
              onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))}
            >
              {STATUS_OPTIONS.map((s) => (
                <MenuItem key={s} value={s}>
                  {s}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              label="Percentage complete"
              type="number"
              inputProps={{ min: 0, max: 100, step: 0.5 }}
              value={form.overallProgress}
              onChange={(e) => setForm((p) => ({ ...p, overallProgress: e.target.value }))}
            />
            <TextField
              label="Status reason"
              value={form.statusReason}
              onChange={(e) => setForm((p) => ({ ...p, statusReason: e.target.value }))}
              placeholder="Why status changed"
            />
            <TextField
              label="Latest update summary"
              multiline
              rows={4}
              value={form.progressSummary}
              onChange={(e) => setForm((p) => ({ ...p, progressSummary: e.target.value }))}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialog({ open: false, row: null })}>Cancel</Button>
          <Button variant="contained" onClick={save} disabled={!canWrite || saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
