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

export default function PlanningProjectRisksPage() {
  const theme = useTheme();
  const colors = tokens(theme.palette.mode);
  const { user, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [rows, setRows] = useState([]);

  const [dialog, setDialog] = useState({ open: false, editing: null });
  const [form, setForm] = useState({
    riskCode: '',
    riskName: '',
    description: '',
  });

  const canRead = checkUserPrivilege(user, 'strategic_plan.read_all');
  const canWrite =
    checkUserPrivilege(user, 'strategic_plan.create') || checkUserPrivilege(user, 'strategic_plan.update');

  const loadRisks = useCallback(async () => {
    if (!canRead) return;
    const data = await apiService.planning.getProjectRisks();
    setRows(Array.isArray(data) ? data : []);
  }, [canRead]);

  const loadAll = useCallback(async () => {
    if (authLoading) return;
    if (!canRead) {
      setLoading(false);
      setError(`You need the strategic_plan.read_all privilege to view planning project risks.`);
      return;
    }
    setLoading(true);
    setError('');
    try {
      await loadRisks();
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || 'Failed to load data.');
    } finally {
      setLoading(false);
    }
  }, [authLoading, canRead, loadRisks]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const openCreate = () => {
    setForm({ riskCode: '', riskName: '', description: '' });
    setDialog({ open: true, editing: null });
  };

  const openEdit = (row) => {
    setForm({
      riskCode: row.riskCode || '',
      riskName: row.riskName || '',
      description: row.description || '',
    });
    setDialog({ open: true, editing: row });
  };

  const save = async () => {
    if (!canWrite) return;
    setMessage('');
    setError('');
    if (!form.riskName.trim()) {
      setError('Risk name is required.');
      return;
    }
    try {
      if (dialog.editing) {
        await apiService.planning.updateProjectRisk(dialog.editing.id, {
          riskName: form.riskName.trim(),
          description: form.description.trim() || null,
        });
        setMessage('Risk updated.');
      } else {
        if (!form.riskCode.trim()) {
          setError('Risk code is required.');
          return;
        }
        await apiService.planning.createProjectRisk({
          riskCode: form.riskCode.trim(),
          riskName: form.riskName.trim(),
          description: form.description.trim() || null,
        });
        setMessage('Risk created.');
      }
      setDialog({ open: false, editing: null });
      await loadRisks();
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || 'Save failed.');
    }
  };

  const remove = async (row) => {
    if (!canWrite || !window.confirm(`Remove risk “${row.riskName}”?`)) return;
    setError('');
    try {
      await apiService.planning.deleteProjectRisk(row.id);
      setMessage('Risk removed.');
      await loadRisks();
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || 'Delete failed.');
    }
  };

  const isDark = theme.palette.mode === 'dark';

  const columns = [
    { field: 'riskCode', headerName: 'Risk code', width: 160 },
    { field: 'riskName', headerName: 'Risk name', flex: 1, minWidth: 200 },
    { field: 'description', headerName: 'Description', flex: 1.2, minWidth: 260 },
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
          title="Planning — Project risks"
          subtitle="Standard risk register for consistent identification across projects"
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
                Maintain a reusable catalog of risks (short code, title, and description). For measurable delivery lines
                tied to KPIs, use{' '}
                <MuiLink component={Link} to={ROUTES.PLANNING_PROJECT_ACTIVITIES} fontWeight={600}>
                  Project Activities
                </MuiLink>
                . To attach catalog risks to a live project, use the Projects menu{' '}
                <MuiLink component={Link} to={ROUTES.PROJECT_PLANNING_RISK_LINKS} fontWeight={600}>
                  Project Risks
                </MuiLink>{' '}
                screen.
              </Alert>
              <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 2 }}>
                <Box>
                  <Typography variant="h6" fontWeight={700}>
                    Risk catalog
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Risk code (unique), risk name, and optional description.
                  </Typography>
                </Box>
                {canWrite && (
                  <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
                    Add risk
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
        <DialogTitle>{dialog.editing ? 'Edit project risk' : 'New project risk'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {!dialog.editing && (
              <TextField
                label="Risk code"
                required
                fullWidth
                value={form.riskCode}
                onChange={(e) => setForm((p) => ({ ...p, riskCode: e.target.value }))}
                helperText="Unique code (e.g. funding_delay, scope_creep). Stored lowercase."
              />
            )}
            {dialog.editing && <TextField label="Risk code" fullWidth value={form.riskCode} disabled />}
            <TextField
              label="Risk name"
              required
              fullWidth
              value={form.riskName}
              onChange={(e) => setForm((p) => ({ ...p, riskName: e.target.value }))}
            />
            <TextField
              label="Description"
              fullWidth
              multiline
              minRows={2}
              value={form.description}
              onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
              helperText="Nature of the risk, typical triggers, or mitigation notes."
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
