import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  Grid,
  IconButton,
  Paper,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
  useTheme,
} from '@mui/material';
import {
  Add as AddIcon,
  AccountTree as AccountTreeIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  TrackChanges as TrackChangesIcon,
} from '@mui/icons-material';
import { DataGrid } from '@mui/x-data-grid';
import apiService from '../api';
import { useAuth } from '../context/AuthContext.jsx';
import Header from './dashboard/Header';
import { tokens } from './dashboard/theme';

const emptyObjective = () => ({
  objectiveName: '',
  sectorCode: '',
  sectorName: '',
  programmeName: '',
  programmePeriod: '',
  sdgCode: '',
  sdgName: '',
  adpProjectCount: 0,
  sampleProjects: [],
});

const emptyPillar = () => ({
  pillarCode: '',
  pillarName: '',
  cidpPeriod: '',
  description: '',
  active: true,
  objectives: [emptyObjective()],
});

const checkUserPrivilege = (user, privilegeName) =>
  user && Array.isArray(user.privileges) && user.privileges.includes(privilegeName);

function formatList(items) {
  return Array.from(new Set((items || []).filter(Boolean))).join(', ');
}

export default function CidpPillarsPage() {
  const theme = useTheme();
  const colors = tokens(theme.palette.mode);
  const isDark = theme.palette.mode === 'dark';
  const { user, loading: authLoading } = useAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');
  const [dialog, setDialog] = useState({ open: false, editing: null });
  const [form, setForm] = useState(emptyPillar());

  const canRead = checkUserPrivilege(user, 'strategic_plan.read_all');
  const canWrite =
    checkUserPrivilege(user, 'strategic_plan.create') || checkUserPrivilege(user, 'strategic_plan.update');

  const loadRows = useCallback(async () => {
    if (authLoading) return;
    if (!canRead) {
      setLoading(false);
      setError('You need the strategic_plan.read_all privilege to view CIDP pillars.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const data = await apiService.planning.getCidpPillars();
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || 'Failed to load CIDP pillars.');
    } finally {
      setLoading(false);
    }
  }, [authLoading, canRead]);

  useEffect(() => {
    loadRows();
  }, [loadRows]);

  const summary = useMemo(() => {
    const objectives = rows.flatMap((row) => row.objectives || []);
    return {
      pillars: rows.length,
      objectives: objectives.length,
      sectors: new Set(objectives.map((item) => item.sectorName).filter(Boolean)).size,
      projects: objectives.reduce((sum, item) => sum + (Number(item.adpProjectCount) || 0), 0),
    };
  }, [rows]);

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((row) => {
      const objectives = row.objectives || [];
      return [
        row.pillarCode,
        row.pillarName,
        row.cidpPeriod,
        row.description,
        ...objectives.flatMap((item) => [
          item.objectiveName,
          item.sectorCode,
          item.sectorName,
          item.programmeName,
          item.sdgCode,
          item.sdgName,
          ...(item.sampleProjects || []),
        ]),
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term));
    });
  }, [rows, search]);

  const openCreate = () => {
    setForm(emptyPillar());
    setDialog({ open: true, editing: null });
  };

  const openEdit = (row) => {
    setForm({
      pillarCode: row.pillarCode || '',
      pillarName: row.pillarName || '',
      cidpPeriod: row.cidpPeriod || '',
      description: row.description || '',
      active: row.active !== false,
      objectives: (row.objectives || []).length ? row.objectives.map((item) => ({ ...item })) : [emptyObjective()],
    });
    setDialog({ open: true, editing: row });
  };

  const updateForm = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const updateObjective = (index, field, value) => {
    setForm((prev) => ({
      ...prev,
      objectives: prev.objectives.map((item, idx) => (idx === index ? { ...item, [field]: value } : item)),
    }));
  };

  const addObjective = () => {
    setForm((prev) => ({ ...prev, objectives: [...prev.objectives, emptyObjective()] }));
  };

  const removeObjective = (index) => {
    setForm((prev) => ({
      ...prev,
      objectives: prev.objectives.length > 1 ? prev.objectives.filter((_, idx) => idx !== index) : [emptyObjective()],
    }));
  };

  const save = async () => {
    setError('');
    setMessage('');
    if (!canWrite) return;
    if (!form.pillarName.trim()) {
      setError('Pillar name is required.');
      return;
    }
    if (!dialog.editing && !form.pillarCode.trim()) {
      setError('Pillar code is required.');
      return;
    }
    const invalidObjective = form.objectives.some((item) => !item.objectiveName.trim());
    if (invalidObjective) {
      setError('Each objective must have an objective name.');
      return;
    }
    const payload = {
      ...form,
      objectives: form.objectives.map((item) => ({
        ...item,
        adpProjectCount: Number(item.adpProjectCount) || 0,
        sampleProjects: Array.isArray(item.sampleProjects)
          ? item.sampleProjects
          : String(item.sampleProjects || '')
              .split('\n')
              .map((value) => value.trim())
              .filter(Boolean),
      })),
    };
    try {
      if (dialog.editing) {
        await apiService.planning.updateCidpPillar(dialog.editing.id, payload);
        setMessage('CIDP pillar updated.');
      } else {
        await apiService.planning.createCidpPillar(payload);
        setMessage('CIDP pillar created.');
      }
      setDialog({ open: false, editing: null });
      await loadRows();
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || 'Save failed.');
    }
  };

  const remove = async (row) => {
    if (!canWrite || !window.confirm(`Remove CIDP pillar "${row.pillarName}"?`)) return;
    setError('');
    setMessage('');
    try {
      await apiService.planning.deleteCidpPillar(row.id);
      setMessage('CIDP pillar removed.');
      await loadRows();
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || 'Delete failed.');
    }
  };

  const columns = [
    { field: 'pillarCode', headerName: 'Code', width: 120 },
    {
      field: 'pillarName',
      headerName: 'CIDP Pillar',
      flex: 1,
      minWidth: 220,
      renderCell: (params) => <Typography fontWeight={700}>{params.row.pillarName}</Typography>,
    },
    { field: 'cidpPeriod', headerName: 'CIDP Period', width: 170 },
    {
      field: 'objectives',
      headerName: 'Objectives',
      flex: 1.4,
      minWidth: 280,
      sortable: false,
      renderCell: (params) => (
        <Stack spacing={0.5} sx={{ py: 1 }}>
          {(params.row.objectives || []).map((item) => (
            <Box key={`${params.row.id}-${item.id || item.objectiveName}`}>
              <Typography variant="body2" fontWeight={600}>
                {item.objectiveName}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {formatList([item.sectorName, item.programmeName, item.sdgName])}
              </Typography>
            </Box>
          ))}
        </Stack>
      ),
    },
    {
      field: 'adpProjectCount',
      headerName: 'ADP Projects',
      width: 130,
      valueGetter: (value, row) =>
        (row.objectives || []).reduce((sum, item) => sum + (Number(item.adpProjectCount) || 0), 0),
    },
    {
      field: 'active',
      headerName: 'Status',
      width: 120,
      renderCell: (params) => (
        <Chip size="small" color={params.row.active ? 'success' : 'default'} label={params.row.active ? 'Active' : 'Inactive'} />
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
    <Box sx={{ minHeight: '100vh', bgcolor: isDark ? colors.primary[500] : theme.palette.background.default }}>
      <Box sx={{ px: { xs: 1.5, sm: 2 }, py: 1.5, borderBottom: 1, borderColor: 'divider' }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={1.5}>
          <Header title="CIDP Pillars" subtitle="Pillars, objectives, sectors, programmes, SDGs, and ADP project examples" />
          {canWrite && (
            <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate} sx={{ alignSelf: { xs: 'stretch', sm: 'center' } }}>
              Add Pillar
            </Button>
          )}
        </Stack>
      </Box>

      <Box sx={{ p: { xs: 1.5, md: 2.5 } }}>
        <Grid container spacing={2} sx={{ mb: 2 }}>
          {[
            ['CIDP Pillars', summary.pillars, <AccountTreeIcon />],
            ['Objectives', summary.objectives, <TrackChangesIcon />],
            ['Linked Sectors', summary.sectors, <AccountTreeIcon />],
            ['ADP Project Examples', summary.projects, <TrackChangesIcon />],
          ].map(([label, value, icon]) => (
            <Grid item xs={12} sm={6} md={3} key={label}>
              <Card>
                <CardContent>
                  <Stack direction="row" spacing={1.5} alignItems="center">
                    <Box sx={{ color: 'primary.main' }}>{icon}</Box>
                    <Box>
                      <Typography variant="body2" color="text.secondary">
                        {label}
                      </Typography>
                      <Typography variant="h5" fontWeight={800}>
                        {value}
                      </Typography>
                    </Box>
                  </Stack>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>

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

        <Paper sx={{ p: 2 }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={1.5} sx={{ mb: 2 }}>
            <TextField
              size="small"
              label="Search pillars, objectives, sectors, programmes, SDGs"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              sx={{ minWidth: { xs: '100%', sm: 420 } }}
            />
            <Typography variant="body2" color="text.secondary" sx={{ alignSelf: 'center' }}>
              Seeded from CIMES ADP Projects export
            </Typography>
          </Stack>
          {loading ? (
            <Stack alignItems="center" sx={{ py: 8 }}>
              <CircularProgress />
            </Stack>
          ) : (
            <DataGrid
              autoHeight
              rows={filteredRows}
              columns={columns}
              disableRowSelectionOnClick
              getRowHeight={() => 'auto'}
              initialState={{ pagination: { paginationModel: { pageSize: 10 } } }}
              pageSizeOptions={[10, 25, 50]}
            />
          )}
        </Paper>
      </Box>

      <Dialog open={dialog.open} maxWidth="md" fullWidth onClose={() => setDialog({ open: false, editing: null })}>
        <DialogTitle>{dialog.editing ? 'Edit CIDP Pillar' : 'Add CIDP Pillar'}</DialogTitle>
        <DialogContent dividers>
          <Grid container spacing={2} sx={{ mt: 0 }}>
            <Grid item xs={12} md={4}>
              <TextField
                label="Pillar code"
                value={form.pillarCode}
                onChange={(event) => updateForm('pillarCode', event.target.value)}
                disabled={Boolean(dialog.editing)}
                fullWidth
                required
              />
            </Grid>
            <Grid item xs={12} md={5}>
              <TextField
                label="CIDP Pillar Name"
                value={form.pillarName}
                onChange={(event) => updateForm('pillarName', event.target.value)}
                fullWidth
                required
              />
            </Grid>
            <Grid item xs={12} md={3}>
              <TextField
                label="CIDP Period"
                value={form.cidpPeriod}
                onChange={(event) => updateForm('cidpPeriod', event.target.value)}
                fullWidth
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                label="Description"
                value={form.description}
                onChange={(event) => updateForm('description', event.target.value)}
                fullWidth
                multiline
                minRows={2}
              />
            </Grid>
            <Grid item xs={12}>
              <FormControlLabel
                control={<Switch checked={form.active} onChange={(event) => updateForm('active', event.target.checked)} />}
                label="Active"
              />
            </Grid>
          </Grid>

          <Divider sx={{ my: 2 }} />
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}>
            <Typography variant="h6">Objectives and Linkages</Typography>
            <Button startIcon={<AddIcon />} onClick={addObjective}>
              Add Objective
            </Button>
          </Stack>

          <Stack spacing={2}>
            {form.objectives.map((objective, index) => (
              <Paper key={objective.id || index} variant="outlined" sx={{ p: 2 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}>
                  <Typography fontWeight={700}>Objective {index + 1}</Typography>
                  <IconButton color="error" size="small" onClick={() => removeObjective(index)}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Stack>
                <Grid container spacing={2}>
                  <Grid item xs={12}>
                    <TextField
                      label="CIDP Objective Name"
                      value={objective.objectiveName}
                      onChange={(event) => updateObjective(index, 'objectiveName', event.target.value)}
                      fullWidth
                      required
                    />
                  </Grid>
                  <Grid item xs={12} md={3}>
                    <TextField
                      label="Sector Code"
                      value={objective.sectorCode}
                      onChange={(event) => updateObjective(index, 'sectorCode', event.target.value)}
                      fullWidth
                    />
                  </Grid>
                  <Grid item xs={12} md={9}>
                    <TextField
                      label="Sector Name"
                      value={objective.sectorName}
                      onChange={(event) => updateObjective(index, 'sectorName', event.target.value)}
                      fullWidth
                    />
                  </Grid>
                  <Grid item xs={12} md={8}>
                    <TextField
                      label="Programme Name"
                      value={objective.programmeName}
                      onChange={(event) => updateObjective(index, 'programmeName', event.target.value)}
                      fullWidth
                    />
                  </Grid>
                  <Grid item xs={12} md={4}>
                    <TextField
                      label="Programme Period"
                      value={objective.programmePeriod}
                      onChange={(event) => updateObjective(index, 'programmePeriod', event.target.value)}
                      fullWidth
                    />
                  </Grid>
                  <Grid item xs={12} md={3}>
                    <TextField
                      label="SDG Code"
                      value={objective.sdgCode}
                      onChange={(event) => updateObjective(index, 'sdgCode', event.target.value)}
                      fullWidth
                    />
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <TextField
                      label="SDG Name"
                      value={objective.sdgName}
                      onChange={(event) => updateObjective(index, 'sdgName', event.target.value)}
                      fullWidth
                    />
                  </Grid>
                  <Grid item xs={12} md={3}>
                    <TextField
                      label="ADP Project Count"
                      type="number"
                      value={objective.adpProjectCount}
                      onChange={(event) => updateObjective(index, 'adpProjectCount', event.target.value)}
                      fullWidth
                    />
                  </Grid>
                  <Grid item xs={12}>
                    <TextField
                      label="Sample ADP Projects"
                      helperText="Enter one project per line."
                      value={(objective.sampleProjects || []).join('\n')}
                      onChange={(event) =>
                        updateObjective(
                          index,
                          'sampleProjects',
                          event.target.value
                            .split('\n')
                            .map((value) => value.trim())
                            .filter(Boolean)
                        )
                      }
                      fullWidth
                      multiline
                      minRows={3}
                    />
                  </Grid>
                </Grid>
              </Paper>
            ))}
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
