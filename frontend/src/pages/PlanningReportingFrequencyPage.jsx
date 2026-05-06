import React, { useCallback, useEffect, useState } from 'react';
import {
  Box,
  Typography,
  Button,
  Paper,
  Alert,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  IconButton,
  Tooltip,
  Stack,
  Switch,
  FormControlLabel,
  useTheme,
  Link as MuiLink,
} from '@mui/material';
import { Link } from 'react-router-dom';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
} from '@mui/icons-material';
import { DataGrid } from '@mui/x-data-grid';
import apiService from '../api';
import { useAuth } from '../context/AuthContext.jsx';
import Header from './dashboard/Header';
import { tokens } from './dashboard/theme';
import { ROUTES } from '../configs/appConfig';

const checkUserPrivilege = (user, privilegeName) =>
  user && Array.isArray(user.privileges) && user.privileges.includes(privilegeName);

export default function PlanningReportingFrequencyPage() {
  const theme = useTheme();
  const colors = tokens(theme.palette.mode);
  const { user, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [rows, setRows] = useState([]);

  const [dialog, setDialog] = useState({ open: false, editing: null });
  const [form, setForm] = useState({
    frequencyCode: '',
    frequencyName: '',
    description: '',
    active: true,
  });

  const canRead = checkUserPrivilege(user, 'strategic_plan.read_all');
  const canWrite =
    checkUserPrivilege(user, 'strategic_plan.create') || checkUserPrivilege(user, 'strategic_plan.update');

  const loadRows = useCallback(async () => {
    if (!canRead) return;
    const data = await apiService.planning.getReportingFrequencies();
    setRows(Array.isArray(data) ? data : []);
  }, [canRead]);

  const loadAll = useCallback(async () => {
    if (authLoading) return;
    if (!canRead) {
      setLoading(false);
      setError(
        `You need the strategic_plan.read_all privilege to view the reporting frequency catalog.`
      );
      return;
    }
    setLoading(true);
    setError('');
    try {
      await loadRows();
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || 'Failed to load data.');
    } finally {
      setLoading(false);
    }
  }, [authLoading, canRead, loadRows]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const openCreate = () => {
    setForm({
      frequencyCode: '',
      frequencyName: '',
      description: '',
      active: true,
    });
    setDialog({ open: true, editing: null });
  };

  const openEdit = (row) => {
    setForm({
      frequencyCode: row.frequencyCode || '',
      frequencyName: row.frequencyName || '',
      description: row.description || '',
      active: !!row.active,
    });
    setDialog({ open: true, editing: row });
  };

  const save = async () => {
    if (!canWrite) return;
    setMessage('');
    setError('');
    if (!form.frequencyName.trim()) {
      setError('Reporting frequency name is required.');
      return;
    }
    try {
      if (dialog.editing) {
        await apiService.planning.updateReportingFrequency(dialog.editing.id, {
          frequencyName: form.frequencyName.trim(),
          description: form.description.trim() || null,
          active: form.active,
        });
        setMessage('Reporting frequency updated.');
      } else {
        await apiService.planning.createReportingFrequency({
          frequencyCode: form.frequencyCode.trim() || undefined,
          frequencyName: form.frequencyName.trim(),
          description: form.description.trim() || null,
          active: form.active,
        });
        setMessage('Reporting frequency created.');
      }
      setDialog({ open: false, editing: null });
      await loadRows();
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || 'Save failed.');
    }
  };

  const remove = async (row) => {
    if (!canWrite || !window.confirm(`Remove “${row.frequencyName}”?`)) return;
    setError('');
    try {
      await apiService.planning.deleteReportingFrequency(row.id);
      setMessage('Reporting frequency removed.');
      await loadRows();
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || 'Delete failed.');
    }
  };

  const toggleActive = async (row, checked) => {
    if (!canWrite) return;
    setError('');
    try {
      await apiService.planning.updateReportingFrequency(row.id, {
        frequencyName: row.frequencyName,
        description: row.description ?? '',
        active: checked,
      });
      setMessage(checked ? 'Marked active.' : 'Marked inactive.');
      await loadRows();
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || 'Update failed.');
    }
  };

  const isDark = theme.palette.mode === 'dark';

  const columns = [
    { field: 'frequencyCode', headerName: 'Code', width: 130 },
    { field: 'frequencyName', headerName: 'Name', flex: 1, minWidth: 160 },
    { field: 'description', headerName: 'Description', flex: 1.2, minWidth: 200 },
    {
      field: 'active',
      headerName: 'Active',
      width: 110,
      sortable: false,
      renderCell: (params) => (
        <Tooltip title={params.row.active ? 'Active' : 'Inactive'}>
          <Switch
            size="small"
            checked={!!params.row.active}
            disabled={!canWrite}
            onChange={(_, v) => toggleActive(params.row, v)}
          />
        </Tooltip>
      ),
    },
    {
      field: 'actions',
      headerName: '',
      width: 100,
      sortable: false,
      renderCell: (params) => (
        <Stack direction="row" spacing={0}>
          {canWrite && (
            <>
              <Tooltip title="Edit">
                <IconButton size="small" onClick={() => openEdit(params.row)}>
                  <EditIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title="Remove">
                <IconButton size="small" color="error" onClick={() => remove(params.row)}>
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </>
          )}
        </Stack>
      ),
    },
  ];

  return (
    <Box
      sx={{
        minHeight: '100vh',
        bgcolor: isDark ? colors.primary[500] : theme.palette.background.default,
      }}
    >
      <Box
        sx={{
          px: { xs: 1.5, sm: 2 },
          py: 1.5,
          borderBottom: 1,
          borderColor: 'divider',
          bgcolor: isDark ? 'transparent' : theme.palette.background.paper,
        }}
      >
        <Header
          title="Planning — Reporting frequency"
          subtitle="Catalog of reporting cadences for indicators and milestones (aligned with legacy CIMES list)"
        />
      </Box>
      <Box sx={{ p: 2, maxWidth: 1400, mx: 'auto' }}>
        <Paper sx={{ p: 2, borderRadius: 2 }}>
          {loading ? (
            <Box sx={{ py: 6, display: 'flex', justifyContent: 'center' }}>
              <CircularProgress />
            </Box>
          ) : (
            <>
              {error && (
                <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
                  {error}
                </Alert>
              )}
              {message && (
                <Alert severity="success" sx={{ mb: 2 }} onClose={() => setMessage('')}>
                  {message}
                </Alert>
              )}
              <Alert severity="info" sx={{ mb: 2 }}>
                Default rows match the CIMES reporting frequency list (e.g. monthly, quarterly). Use this catalog when
                defining how often progress is reported. Related planning screens:{' '}
                <MuiLink component={Link} to={ROUTES.PLANNING_INDICATORS} fontWeight={600}>
                  Indicators &amp; KPIs
                </MuiLink>
                ,{' '}
                <MuiLink component={Link} to={ROUTES.PLANNING_PROJECT_ACTIVITIES} fontWeight={600}>
                  Project Activities
                </MuiLink>
                .
              </Alert>
              <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 2 }}>
                <Box>
                  <Typography variant="h6" fontWeight={700}>
                    Reporting frequency catalog
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Stable code (unique), display name, description, and active flag.
                  </Typography>
                </Box>
                {canWrite && (
                  <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
                    Add frequency
                  </Button>
                )}
              </Stack>
              <Box sx={{ height: 520, width: '100%' }}>
                <DataGrid
                  rows={rows}
                  columns={columns}
                  getRowId={(r) => r.id}
                  disableRowSelectionOnClick
                  pageSizeOptions={[10, 25]}
                  initialState={{ pagination: { paginationModel: { pageSize: 10 } } }}
                />
              </Box>
            </>
          )}
        </Paper>
      </Box>

      <Dialog open={dialog.open} onClose={() => setDialog({ open: false, editing: null })} fullWidth maxWidth="sm">
        <DialogTitle>{dialog.editing ? 'Edit reporting frequency' : 'New reporting frequency'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {!dialog.editing && (
              <TextField
                label="Code (optional)"
                fullWidth
                value={form.frequencyCode}
                onChange={(e) => setForm((p) => ({ ...p, frequencyCode: e.target.value }))}
                helperText="Leave blank to derive from the name (e.g. “End term” → end_term)."
              />
            )}
            {dialog.editing && <TextField label="Code" fullWidth value={form.frequencyCode} disabled />}
            <TextField
              label="Reporting frequency name"
              required
              fullWidth
              value={form.frequencyName}
              onChange={(e) => setForm((p) => ({ ...p, frequencyName: e.target.value }))}
            />
            <TextField
              label="Description"
              fullWidth
              multiline
              minRows={2}
              value={form.description}
              onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
            />
            <FormControlLabel
              control={
                <Switch
                  checked={form.active}
                  onChange={(_, v) => setForm((p) => ({ ...p, active: v }))}
                />
              }
              label="Active"
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialog({ open: false, editing: null })}>Cancel</Button>
          <Button variant="contained" onClick={save} disabled={!canWrite}>
            Save
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
