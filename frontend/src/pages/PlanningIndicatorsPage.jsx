import React, { useCallback, useEffect, useState } from 'react';
import {
  Box,
  Typography,
  Button,
  Paper,
  List,
  ListItemButton,
  ListItemText,
  Divider,
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
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Straighten as StraightenIcon,
  Flag as FlagIcon,
} from '@mui/icons-material';
import { DataGrid } from '@mui/x-data-grid';
import { useSearchParams, Link } from 'react-router-dom';
import apiService from '../api';
import { ROUTES } from '../configs/appConfig';
import { useAuth } from '../context/AuthContext.jsx';
import Header from './dashboard/Header';
import { tokens } from './dashboard/theme';

const checkUserPrivilege = (user, privilegeName) =>
  user && Array.isArray(user.privileges) && user.privileges.includes(privilegeName);

const SECTIONS = [
  {
    id: 'measurement-types',
    label: 'Measurement types',
    icon: StraightenIcon,
    description: 'Units and scales for KPIs and indicators (%, count, area, …).',
  },
  {
    id: 'indicators',
    label: 'Indicators & KPIs',
    icon: FlagIcon,
    description: 'Named KPIs and indicators for targets and reporting; each uses one measurement type.',
  },
];

function PlanningIndicatorsPage() {
  const theme = useTheme();
  const colors = tokens(theme.palette.mode);
  const { user, loading: authLoading } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const sectionParam = searchParams.get('section');
  const section =
    sectionParam === 'measurement-types' || sectionParam === 'indicators' ? sectionParam : 'indicators';

  const setSection = useCallback(
    (id) => {
      if (id === 'indicators') {
        setSearchParams({}, { replace: true });
      } else {
        setSearchParams({ section: id }, { replace: true });
      }
    },
    [setSearchParams]
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [measurementTypes, setMeasurementTypes] = useState([]);
  const [indicators, setIndicators] = useState([]);

  const canRead = checkUserPrivilege(user, 'strategic_plan.read_all');
  const canWrite =
    checkUserPrivilege(user, 'strategic_plan.create') || checkUserPrivilege(user, 'strategic_plan.update');

  const loadMeasurementTypes = useCallback(async () => {
    if (!canRead) return;
    const data = await apiService.planning.getMeasurementTypes();
    setMeasurementTypes(Array.isArray(data) ? data : []);
  }, [canRead]);

  const loadIndicators = useCallback(async () => {
    if (!canRead) return;
    const data = await apiService.planning.getIndicators();
    setIndicators(Array.isArray(data) ? data : []);
  }, [canRead]);

  const loadAll = useCallback(async () => {
    if (authLoading) return;
    if (!canRead) {
      setLoading(false);
      setError(
        `You need the strategic_plan.read_all privilege to view planning KPIs, indicators, and measurement types.`
      );
      return;
    }
    setLoading(true);
    setError('');
    try {
      await Promise.all([loadMeasurementTypes(), loadIndicators()]);
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || 'Failed to load planning data.');
    } finally {
      setLoading(false);
    }
  }, [authLoading, canRead, loadMeasurementTypes, loadIndicators]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    const p = searchParams.get('section');
    if (p != null && p !== '' && p !== 'measurement-types' && p !== 'indicators') {
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const [mtDialog, setMtDialog] = useState({ open: false, editing: null });
  const [mtForm, setMtForm] = useState({ code: '', label: '', description: '' });

  const [indDialog, setIndDialog] = useState({ open: false, editing: null });
  const [indForm, setIndForm] = useState({ name: '', description: '', measurementTypeId: '' });

  const openCreateMt = () => {
    setMtForm({ code: '', label: '', description: '' });
    setMtDialog({ open: true, editing: null });
  };
  const openEditMt = (row) => {
    setMtForm({
      code: row.code,
      label: row.label,
      description: row.description || '',
    });
    setMtDialog({ open: true, editing: row });
  };
  const saveMt = async () => {
    if (!canWrite) return;
    setMessage('');
    setError('');
    try {
      if (mtDialog.editing) {
        await apiService.planning.updateMeasurementType(mtDialog.editing.id, {
          label: mtForm.label,
          description: mtForm.description || null,
        });
        setMessage('Measurement type updated.');
      } else {
        await apiService.planning.createMeasurementType({
          code: mtForm.code,
          label: mtForm.label,
          description: mtForm.description || null,
        });
        setMessage('Measurement type created.');
      }
      setMtDialog({ open: false, editing: null });
      await loadMeasurementTypes();
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || 'Save failed.');
    }
  };
  const deleteMt = async (row) => {
    if (
      !canWrite ||
      !window.confirm(
        `Remove measurement type “${row.label}”? KPIs or indicators using it should be reassigned first.`
      )
    )
      return;
    setError('');
    try {
      await apiService.planning.deleteMeasurementType(row.id);
      setMessage('Measurement type removed.');
      await loadMeasurementTypes();
      await loadIndicators();
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || 'Delete failed.');
    }
  };

  const openCreateInd = () => {
    const firstId = measurementTypes[0]?.id;
    setIndForm({ name: '', description: '', measurementTypeId: firstId != null ? String(firstId) : '' });
    setIndDialog({ open: true, editing: null });
  };
  const openEditInd = (row) => {
    setIndForm({
      name: row.name,
      description: row.description || '',
      measurementTypeId: String(row.measurementTypeId ?? row.measurement_type_id ?? ''),
    });
    setIndDialog({ open: true, editing: row });
  };
  const saveInd = async () => {
    if (!canWrite) return;
    setMessage('');
    setError('');
    const measurementTypeId = Number(indForm.measurementTypeId);
    if (!indForm.name.trim()) {
      setError('A name is required for this KPI or indicator.');
      return;
    }
    if (!Number.isFinite(measurementTypeId)) {
      setError('Select a measurement type.');
      return;
    }
    try {
      if (indDialog.editing) {
        await apiService.planning.updateIndicator(indDialog.editing.id, {
          name: indForm.name.trim(),
          description: indForm.description.trim() || null,
          measurementTypeId,
        });
        setMessage('KPI / indicator updated.');
      } else {
        await apiService.planning.createIndicator({
          name: indForm.name.trim(),
          description: indForm.description.trim() || null,
          measurementTypeId,
        });
        setMessage('KPI / indicator created.');
      }
      setIndDialog({ open: false, editing: null });
      await loadIndicators();
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || 'Save failed.');
    }
  };
  const deleteInd = async (row) => {
    if (!canWrite || !window.confirm(`Remove KPI / indicator “${row.name}”?`)) return;
    setError('');
    try {
      await apiService.planning.deleteIndicator(row.id);
      setMessage('KPI / indicator removed.');
      await loadIndicators();
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || 'Delete failed.');
    }
  };

  const activeMeta = SECTIONS.find((s) => s.id === section);

  const mtColumns = [
    { field: 'code', headerName: 'Code', width: 120 },
    { field: 'label', headerName: 'Label', flex: 1, minWidth: 160 },
    { field: 'description', headerName: 'Description', flex: 1.5, minWidth: 200 },
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
                <IconButton size="small" onClick={() => openEditMt(params.row)}>
                  <EditIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title="Remove">
                <IconButton size="small" color="error" onClick={() => deleteMt(params.row)}>
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </>
          )}
        </Stack>
      ),
    },
  ];

  const indColumns = [
    { field: 'name', headerName: 'KPI / indicator', flex: 1, minWidth: 200 },
    { field: 'measurementTypeLabel', headerName: 'Measurement type', width: 180 },
    { field: 'description', headerName: 'Description', flex: 1.2, minWidth: 200 },
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
                <IconButton size="small" onClick={() => openEditInd(params.row)}>
                  <EditIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title="Remove">
                <IconButton size="small" color="error" onClick={() => deleteInd(params.row)}>
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </>
          )}
        </Stack>
      ),
    },
  ];

  const isDark = theme.palette.mode === 'dark';

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
          title="Planning — Indicators & KPIs"
          subtitle="Define KPIs, indicators, and measurement types for planning and reporting"
        />
      </Box>
      <Box sx={{ display: 'flex', flex: 1, minHeight: 'calc(100vh - 64px)' }}>
        <Paper
          elevation={0}
          sx={{
            width: 280,
            flexShrink: 0,
            borderRight: 1,
            borderColor: 'divider',
            borderRadius: 0,
            bgcolor: theme.palette.mode === 'dark' ? colors.primary[400] : theme.palette.background.paper,
            pt: 2,
            px: 1,
          }}
        >
          <Typography variant="overline" sx={{ px: 1.5, color: 'text.secondary', letterSpacing: 0.08 }}>
            KPIs & indicators
          </Typography>
          <List dense sx={{ mt: 0.5 }}>
            {SECTIONS.map((s) => {
              const Icon = s.icon;
              const selected = section === s.id;
              return (
                <ListItemButton
                  key={s.id}
                  selected={selected}
                  onClick={() => setSection(s.id)}
                  sx={{ borderRadius: 1, mb: 0.5, alignItems: 'flex-start' }}
                >
                  <Icon sx={{ mr: 1.25, mt: 0.35, fontSize: 22, opacity: selected ? 1 : 0.75 }} />
                  <ListItemText
                    primary={s.label}
                    secondary={s.description}
                    primaryTypographyProps={{ fontWeight: selected ? 700 : 500, fontSize: '0.95rem' }}
                    secondaryTypographyProps={{ variant: 'caption', sx: { display: 'block', mt: 0.25 } }}
                  />
                </ListItemButton>
              );
            })}
          </List>
          <Divider sx={{ my: 1 }} />
          <Typography variant="caption" color="text.secondary" sx={{ px: 1.5, display: 'block' }}>
            Codes are stored on sub-programs (unit of measure) and on this KPI / indicator catalog. Defaults include common KPI
            units (%, count, area, …) plus general types (number, ratio, text, index). Add or edit types here; sub-program forms
            load this list automatically.
          </Typography>
        </Paper>

        <Box sx={{ flex: 1, p: 2, overflow: 'auto' }}>
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
                <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 2 }}>
                  <Box>
                    <Typography variant="h6" fontWeight={700}>
                      {activeMeta?.label}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {activeMeta?.description}
                    </Typography>
                  </Box>
                  {canWrite && section === 'measurement-types' && (
                    <Button variant="contained" startIcon={<AddIcon />} onClick={openCreateMt}>
                      Add type
                    </Button>
                  )}
                  {canWrite && section === 'indicators' && (
                    <Button variant="contained" startIcon={<AddIcon />} onClick={openCreateInd} disabled={!measurementTypes.length}>
                      Add KPI / indicator
                    </Button>
                  )}
                </Stack>

                {section === 'measurement-types' && (
                  <Box sx={{ height: 480, width: '100%' }}>
                    <DataGrid
                      rows={measurementTypes}
                      columns={mtColumns}
                      getRowId={(r) => r.id}
                      disableRowSelectionOnClick
                      pageSizeOptions={[10, 25]}
                      initialState={{ pagination: { paginationModel: { pageSize: 10 } } }}
                    />
                  </Box>
                )}

                {section === 'indicators' && (
                  <>
                    <Alert severity="info" sx={{ mb: 2 }}>
                      For delivery lines that should roll up to these KPIs, maintain the{' '}
                      <MuiLink component={Link} to={ROUTES.PLANNING_PROJECT_ACTIVITIES} fontWeight={600}>
                        Project Activities
                      </MuiLink>{' '}
                      catalog (activity code, name, linked indicator). Projects can reference those activities later for
                      measurable outcomes. Maintain reusable{' '}
                      <MuiLink component={Link} to={ROUTES.PLANNING_PROJECT_RISKS} fontWeight={600}>
                        Project Risks
                      </MuiLink>{' '}
                      alongside this catalog.
                    </Alert>
                    <Box sx={{ height: 480, width: '100%' }}>
                      <DataGrid
                        rows={indicators}
                        columns={indColumns}
                        getRowId={(r) => r.id}
                        disableRowSelectionOnClick
                        pageSizeOptions={[10, 25]}
                        initialState={{ pagination: { paginationModel: { pageSize: 10 } } }}
                      />
                    </Box>
                  </>
                )}
              </>
            )}
          </Paper>
        </Box>
      </Box>

      <Dialog open={mtDialog.open} onClose={() => setMtDialog({ open: false, editing: null })} fullWidth maxWidth="sm">
        <DialogTitle>{mtDialog.editing ? 'Edit measurement type' : 'New measurement type'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {!mtDialog.editing && (
              <TextField
                label="Code"
                required
                fullWidth
                helperText="Lowercase, unique (e.g. headcount, km)."
                value={mtForm.code}
                onChange={(e) => setMtForm((p) => ({ ...p, code: e.target.value }))}
                disabled={!!mtDialog.editing}
              />
            )}
            <TextField label="Label" required fullWidth value={mtForm.label} onChange={(e) => setMtForm((p) => ({ ...p, label: e.target.value }))} />
            <TextField
              label="Description"
              fullWidth
              multiline
              minRows={2}
              value={mtForm.description}
              onChange={(e) => setMtForm((p) => ({ ...p, description: e.target.value }))}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setMtDialog({ open: false, editing: null })}>Cancel</Button>
          <Button variant="contained" onClick={saveMt} disabled={!canWrite || (!mtDialog.editing && !mtForm.code.trim()) || !mtForm.label.trim()}>
            Save
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={indDialog.open} onClose={() => setIndDialog({ open: false, editing: null })} fullWidth maxWidth="sm">
        <DialogTitle>{indDialog.editing ? 'Edit KPI / indicator' : 'New KPI / indicator'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="KPI or indicator name"
              required
              fullWidth
              value={indForm.name}
              onChange={(e) => setIndForm((p) => ({ ...p, name: e.target.value }))}
              helperText="Use the same wording you want in CIDP and reports."
            />
            <TextField
              select
              label="Measurement type"
              required
              fullWidth
              value={indForm.measurementTypeId}
              onChange={(e) => setIndForm((p) => ({ ...p, measurementTypeId: e.target.value }))}
            >
              {measurementTypes.map((t) => (
                <MenuItem key={t.id} value={String(t.id)}>
                  {t.label} ({t.code})
                </MenuItem>
              ))}
            </TextField>
            <TextField
              label="Description"
              fullWidth
              multiline
              minRows={2}
              value={indForm.description}
              onChange={(e) => setIndForm((p) => ({ ...p, description: e.target.value }))}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setIndDialog({ open: false, editing: null })}>Cancel</Button>
          <Button variant="contained" onClick={saveInd} disabled={!canWrite}>
            Save
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default PlanningIndicatorsPage;
