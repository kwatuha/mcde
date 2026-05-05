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
    if (!form.activityName.trim()) {
      setError('Activity name is required.');
      return;
    }
    if (!Number.isFinite(indicatorId)) {
      setError('Select a KPI / indicator.');
      return;
    }
    try {
      if (dialog.editing) {
        await apiService.planning.updateProjectActivity(dialog.editing.id, {
          activityName: form.activityName.trim(),
          description: form.description.trim() || null,
          indicatorId,
        });
        setMessage('Activity updated.');
      } else {
        if (!form.activityCode.trim()) {
          setError('Activity code is required.');
          return;
        }
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
    { field: 'activityCode', headerName: 'Activity code', width: 140 },
    { field: 'activityName', headerName: 'Activity name', flex: 1, minWidth: 180 },
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
    { field: 'description', headerName: 'Description', flex: 1.2, minWidth: 220 },
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
          title="Planning — Project activities"
          subtitle="Measurable activities tied to KPIs / indicators (for projects and M&E)"
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
                Define activities with a short code and link each to an indicator so progress can be measured consistently.
                Create KPIs / indicators first under{' '}
                <MuiLink component={Link} to={ROUTES.PLANNING_INDICATORS}>
                  Indicators & KPIs
                </MuiLink>
                . Later, projects can reference these activities when you attach delivery to indicators. For a standard
                risk register (code, name, description), use{' '}
                <MuiLink component={Link} to={ROUTES.PLANNING_PROJECT_RISKS} fontWeight={600}>
                  Project Risks
                </MuiLink>
                . To attach catalog activities to a live project, use the Projects menu{' '}
                <MuiLink component={Link} to={ROUTES.PROJECT_PLANNING_ACTIVITY_LINKS} fontWeight={600}>
                  Project Activities
                </MuiLink>{' '}
                screen.
              </Alert>
              {!indicators.length && canRead && (
                <Alert severity="warning" sx={{ mb: 2 }}>
                  No indicators found. Add KPIs / indicators before creating activities.
                </Alert>
              )}
              <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 2 }}>
                <Box>
                  <Typography variant="h6" fontWeight={700}>
                    Activity catalog
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Activity code (unique), name, linked indicator (with its measurement unit), and optional description.
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
        <DialogTitle>{dialog.editing ? 'Edit project activity' : 'New project activity'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {!dialog.editing && (
              <TextField
                label="Activity code"
                required
                fullWidth
                value={form.activityCode}
                onChange={(e) => setForm((p) => ({ ...p, activityCode: e.target.value }))}
                helperText="Unique code (e.g. latrine_install, road_km). Stored lowercase."
              />
            )}
            {dialog.editing && (
              <TextField label="Activity code" fullWidth value={form.activityCode} disabled />
            )}
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
