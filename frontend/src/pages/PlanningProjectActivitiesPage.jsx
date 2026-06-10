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
  MenuItem,
  IconButton,
  Tooltip,
  Stack,
  Chip,
  useTheme,
} from '@mui/material';
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
const checkUserPrivilege = (user, privilegeName) =>
  user && Array.isArray(user.privileges) && user.privileges.includes(privilegeName);

export default function PlanningProjectActivitiesPage() {
  const theme = useTheme();
  const colors = tokens(theme.palette.mode);
  const { user, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [rows, setRows] = useState([]);
  const [indicators, setIndicators] = useState([]);

  const [dialog, setDialog] = useState({ open: false, editing: null });
  const [form, setForm] = useState({
    activityCode: '',
    activityName: '',
    indicatorId: '',
    description: '',
  });

  const canRead = checkUserPrivilege(user, 'strategic_plan.read_all');
  const canWrite =
    checkUserPrivilege(user, 'strategic_plan.create') || checkUserPrivilege(user, 'strategic_plan.update');

  const loadIndicators = useCallback(async () => {
    if (!canRead) return;
    const data = await apiService.planning.getIndicators();
    setIndicators(Array.isArray(data) ? data : []);
  }, [canRead]);

  const loadActivities = useCallback(async () => {
    if (!canRead) return;
    const data = await apiService.planning.getProjectActivities();
    setRows(Array.isArray(data) ? data : []);
  }, [canRead]);

  const loadAll = useCallback(async () => {
    if (authLoading) return;
    if (!canRead) {
      setLoading(false);
      setError(
        `You need the strategic_plan.read_all privilege to view planning project activities.`
      );
      return;
    }
    setLoading(true);
    setError('');
    try {
      await Promise.all([loadIndicators(), loadActivities()]);
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || 'Failed to load data.');
    } finally {
      setLoading(false);
    }
  }, [authLoading, canRead, loadIndicators, loadActivities]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const openCreate = () => {
    const firstId = indicators[0]?.id;
    setForm({
      activityCode: '',
      activityName: '',
      indicatorId: firstId != null ? String(firstId) : '',
      description: '',
    });
    setDialog({ open: true, editing: null });
  };

  const openEdit = (row) => {
    setForm({
      activityCode: row.activityCode || '',
      activityName: row.activityName || '',
      indicatorId: String(row.indicatorId ?? ''),
      description: row.description || '',
    });
    setDialog({ open: true, editing: row });
  };

  const save = async () => {
    if (!canWrite) return;
    setMessage('');
    setError('');
    const indicatorId = Number(form.indicatorId);
    if (!form.activityCode.trim() || !form.activityName.trim()) {
      setError('Activity code and activity name are required.');
      return;
    }
    if (!Number.isFinite(indicatorId)) {
      setError('Select a KPI / indicator.');
      return;
    }
    try {
      if (dialog.editing) {
        await apiService.planning.updateProjectActivity(dialog.editing.id, {
          activityCode: form.activityCode.trim(),
          activityName: form.activityName.trim(),
          description: form.description.trim() || null,
          indicatorId,
        });
        setMessage('Activity updated.');
      } else {
        await apiService.planning.createProjectActivity({
          activityCode: form.activityCode.trim(),
          activityName: form.activityName.trim(),
          description: form.description.trim() || null,
          indicatorId,
        });
        setMessage('Activity created.');
      }
      setDialog({ open: false, editing: null });
      await loadActivities();
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || 'Save failed.');
    }
  };

  const remove = async (row) => {
    if (!canWrite || !window.confirm(`Remove activity “${row.activityName}”?`)) return;
    setError('');
    try {
      await apiService.planning.deleteProjectActivity(row.id);
      setMessage('Activity removed.');
      await loadActivities();
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || 'Delete failed.');
    }
  };

  const isDark = theme.palette.mode === 'dark';

  const columns = [
    { field: 'activityCode', headerName: 'Activity Code', width: 160 },
    { field: 'activityName', headerName: 'Activity Name', flex: 1, minWidth: 220 },
    { field: 'description', headerName: 'Description / Verification Guidance', flex: 1.2, minWidth: 280 },
    {
      field: 'linkedProjectCount',
      headerName: 'Assigned Projects',
      width: 150,
      renderCell: (params) => {
        const count = Number(params.row?.linkedProjectCount ?? 0);
        return <Chip size="small" label={count} color={count > 0 ? 'primary' : 'default'} variant="outlined" />;
      },
    },
    { field: 'indicatorName', headerName: 'Indicator (KPI)', flex: 1, minWidth: 200 },
    {
      field: 'measurementTypeLabel',
      headerName: 'Measurement unit',
      width: 170,
      valueGetter: (value, row) =>
        row.measurementTypeLabel ||
        row.measurement_type_label ||
        row.measurementTypeCode ||
        row.measurement_type_code ||
        '—',
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
          title="Activity Catalogue"
          subtitle="Reusable standard activities linked to indicators. Project-specific dates, milestones, BQ items and status belong under Project Activity Assignments and the Implementation Plan."
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
              {!indicators.length && canRead && (
                <Alert severity="warning" sx={{ mb: 2 }}>
                  No indicators found. Add KPIs / indicators before creating activities.
                </Alert>
              )}
              <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 2 }}>
                <Box>
                  <Typography variant="h6" fontWeight={700}>
                    Standard activities
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Maintain the reusable activity master list here. Assign activities to specific projects from Project Activity Assignments or a project&apos;s Implementation Plan.
                  </Typography>
                </Box>
                {canWrite && (
                  <Button
                    variant="contained"
                    startIcon={<AddIcon />}
                    onClick={openCreate}
                    disabled={!indicators.length}
                  >
                    Add activity
                  </Button>
                )}
              </Stack>
              <Box sx={{ height: 560, width: '100%' }}>
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
        <DialogTitle>{dialog.editing ? 'Edit catalogue activity' : 'New catalogue activity'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Activity code"
              required
              fullWidth
              value={form.activityCode}
              onChange={(e) => setForm((p) => ({ ...p, activityCode: e.target.value }))}
              helperText="Unique code (e.g. ACT-001, road_km)."
            />
            <TextField
              label="Activity name"
              required
              fullWidth
              value={form.activityName}
              onChange={(e) => setForm((p) => ({ ...p, activityName: e.target.value }))}
            />
            <TextField
              select
              label="Indicator (KPI)"
              required
              fullWidth
              value={form.indicatorId}
              onChange={(e) => setForm((p) => ({ ...p, indicatorId: e.target.value }))}
            >
              {indicators.map((t) => (
                <MenuItem key={t.id} value={String(t.id)}>
                  {t.measurementTypeLabel
                    ? `${t.name} (${t.measurementTypeLabel})`
                    : t.name}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              label="Description"
              fullWidth
              multiline
              minRows={2}
              value={form.description}
              onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
              helperText="How this activity is counted or verified against the indicator."
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
