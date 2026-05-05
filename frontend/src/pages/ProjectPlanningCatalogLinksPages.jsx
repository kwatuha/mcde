import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
  Autocomplete,
  Link as MuiLink,
} from '@mui/material';
import { Link } from 'react-router-dom';
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  OpenInNew as OpenInNewIcon,
} from '@mui/icons-material';
import { DataGrid } from '@mui/x-data-grid';
import apiService from '../api';
import { useAuth } from '../context/AuthContext.jsx';
import Header from './dashboard/Header';
import { tokens } from './dashboard/theme';
import { ROUTES } from '../configs/appConfig';

function getProjectId(p) {
  if (p == null) return null;
  return p.project_id ?? p.projectId ?? p.id ?? null;
}

function getProjectDisplayName(p) {
  if (p == null) return 'Unknown project';
  return p.name || p.projectName || p.project_name || `Project ${getProjectId(p) ?? ''}`.trim();
}

function CatalogLinksPage({ kind }) {
  const isActivities = kind === 'activities';
  const theme = useTheme();
  const colors = tokens(theme.palette.mode);
  const { hasPrivilege, loading: authLoading } = useAuth();

  const canView =
    hasPrivilege &&
    (hasPrivilege('project.read_all') || hasPrivilege('strategic_plan.read_all'));
  const canEdit =
    hasPrivilege &&
    (hasPrivilege('project.update') ||
      hasPrivilege('strategic_plan.update') ||
      hasPrivilege('strategic_plan.create'));
  const canLoadCatalog = hasPrivilege && hasPrivilege('strategic_plan.read_all');

  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState(null);
  const [links, setLinks] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [loadingLinks, setLoadingLinks] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [addCatalogId, setAddCatalogId] = useState('');
  const [addNotes, setAddNotes] = useState('');

  const selectedPid = selectedProject ? getProjectId(selectedProject) : null;

  const loadProjects = useCallback(async () => {
    if (!canView) {
      setLoadingProjects(false);
      return;
    }
    setLoadingProjects(true);
    setError('');
    try {
      const data = await apiService.projects.getProjects({ limit: 5000 });
      const list = Array.isArray(data?.projects) ? data.projects : Array.isArray(data) ? data : [];
      const normalized = list.map((p) => ({ ...p })).filter((p) => getProjectId(p) != null);
      setProjects(normalized);
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || 'Failed to load projects.');
      setProjects([]);
    } finally {
      setLoadingProjects(false);
    }
  }, [canView]);

  const loadCatalog = useCallback(async () => {
    if (!canLoadCatalog) return;
    try {
      if (isActivities) {
        const data = await apiService.planning.getProjectActivities();
        setCatalog(Array.isArray(data) ? data : []);
      } else {
        const data = await apiService.planning.getProjectRisks();
        setCatalog(Array.isArray(data) ? data : []);
      }
    } catch {
      setCatalog([]);
    }
  }, [canLoadCatalog, isActivities]);

  const loadLinks = useCallback(async () => {
    if (!canView || selectedPid == null) {
      setLinks([]);
      return;
    }
    setLoadingLinks(true);
    setError('');
    try {
      if (isActivities) {
        const data = await apiService.projects.getPlanningCatalogActivityLinks(selectedPid);
        setLinks(Array.isArray(data) ? data : []);
      } else {
        const data = await apiService.projects.getPlanningCatalogRiskLinks(selectedPid);
        setLinks(Array.isArray(data) ? data : []);
      }
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || 'Failed to load links.');
      setLinks([]);
    } finally {
      setLoadingLinks(false);
    }
  }, [canView, selectedPid, isActivities]);

  useEffect(() => {
    if (!authLoading) loadProjects();
  }, [authLoading, loadProjects]);

  useEffect(() => {
    loadLinks();
  }, [loadLinks]);

  useEffect(() => {
    if (addOpen && canLoadCatalog) loadCatalog();
  }, [addOpen, canLoadCatalog, loadCatalog]);

  const linkedCatalogIds = useMemo(() => {
    const s = new Set();
    for (const row of links) {
      if (isActivities) {
        const id = row.planningActivityId ?? row.planning_activity_id;
        if (id != null) s.add(Number(id));
      } else {
        const id = row.planningRiskId ?? row.planning_risk_id;
        if (id != null) s.add(Number(id));
      }
    }
    return s;
  }, [links, isActivities]);

  const addChoices = useMemo(() => {
    return catalog.filter((c) => c.id != null && !linkedCatalogIds.has(Number(c.id)));
  }, [catalog, linkedCatalogIds]);

  useEffect(() => {
    if (!addOpen || !addChoices.length) return;
    if (!addChoices.some((c) => String(c.id) === addCatalogId)) {
      setAddCatalogId(String(addChoices[0].id));
    }
  }, [addOpen, addChoices, addCatalogId]);

  const openAdd = () => {
    setAddNotes('');
    const first = addChoices[0];
    setAddCatalogId(first ? String(first.id) : '');
    setAddOpen(true);
  };

  const saveAdd = async () => {
    if (!canEdit || selectedPid == null) return;
    const idNum = Number(addCatalogId);
    if (!Number.isFinite(idNum)) {
      setError(isActivities ? 'Select a catalog activity.' : 'Select a catalog risk.');
      return;
    }
    setMessage('');
    setError('');
    try {
      if (isActivities) {
        await apiService.projects.addPlanningCatalogActivityLink(selectedPid, {
          activityId: idNum,
          notes: addNotes.trim() || null,
        });
        setMessage('Activity linked to project.');
      } else {
        await apiService.projects.addPlanningCatalogRiskLink(selectedPid, {
          riskId: idNum,
          notes: addNotes.trim() || null,
        });
        setMessage('Risk linked to project.');
      }
      setAddOpen(false);
      await loadLinks();
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || 'Could not add link.');
    }
  };

  const removeLink = async (row) => {
    if (!canEdit || selectedPid == null) return;
    const label = isActivities ? row.activityName || row.activityCode : row.riskName || row.riskCode;
    if (!window.confirm(`Remove link to “${label}”?`)) return;
    setError('');
    try {
      if (isActivities) {
        await apiService.projects.removePlanningCatalogActivityLink(selectedPid, row.id);
      } else {
        await apiService.projects.removePlanningCatalogRiskLink(selectedPid, row.id);
      }
      setMessage('Link removed.');
      await loadLinks();
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || 'Remove failed.');
    }
  };

  const isDark = theme.palette.mode === 'dark';

  const activityColumns = [
    { field: 'activityCode', headerName: 'Activity code', width: 130 },
    { field: 'activityName', headerName: 'Activity name', flex: 1, minWidth: 160 },
    { field: 'indicatorName', headerName: 'Indicator', flex: 1, minWidth: 140 },
    {
      field: 'measurementTypeLabel',
      headerName: 'Unit',
      width: 120,
      valueGetter: (v, row) =>
        row.measurementTypeLabel || row.measurement_type_label || '—',
    },
    { field: 'notes', headerName: 'Notes', flex: 1, minWidth: 120 },
    {
      field: 'actions',
      headerName: '',
      width: 72,
      sortable: false,
      renderCell: (params) =>
        canEdit ? (
          <Tooltip title="Remove link">
            <IconButton size="small" color="error" onClick={() => removeLink(params.row)}>
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        ) : null,
    },
  ];

  const riskColumns = [
    { field: 'riskCode', headerName: 'Risk code', width: 130 },
    { field: 'riskName', headerName: 'Risk name', flex: 1, minWidth: 180 },
    {
      field: 'catalogDescription',
      headerName: 'Catalog description',
      flex: 1,
      minWidth: 200,
      valueGetter: (v, row) => row.catalogDescription || row.catalog_description || '—',
    },
    { field: 'notes', headerName: 'Notes', flex: 1, minWidth: 120 },
    {
      field: 'actions',
      headerName: '',
      width: 72,
      sortable: false,
      renderCell: (params) =>
        canEdit ? (
          <Tooltip title="Remove link">
            <IconButton size="small" color="error" onClick={() => removeLink(params.row)}>
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        ) : null,
    },
  ];

  const title = isActivities ? 'Projects — Activity links' : 'Projects — Risk links';
  const subtitle = isActivities
    ? 'Attach Planning catalog activities to each project'
    : 'Attach Planning catalog risks to each project';
  const planningRoute = isActivities ? ROUTES.PLANNING_PROJECT_ACTIVITIES : ROUTES.PLANNING_PROJECT_RISKS;
  const planningLabel = isActivities ? 'Planning — Project activities' : 'Planning — Project risks';

  if (!authLoading && !canView) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="warning">
          You need <strong>project.read_all</strong> or <strong>strategic_plan.read_all</strong> to use this page.
        </Alert>
      </Box>
    );
  }

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
        <Header title={title} subtitle={subtitle} />
      </Box>
      <Box sx={{ p: 2, maxWidth: 1400, mx: 'auto' }}>
        <Paper sx={{ p: 2, borderRadius: 2 }}>
          {loadingProjects ? (
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
                Choose a project, then link rows from the{' '}
                <MuiLink component={Link} to={planningRoute} fontWeight={600}>
                  {planningLabel}
                </MuiLink>{' '}
                catalog. This is separate from the Planning screens: here you associate catalog entries with a specific
                project.
              </Alert>
              {!canLoadCatalog && canView && (
                <Alert severity="warning" sx={{ mb: 2 }}>
                  Your role can view links but not load the Planning catalog. Add <strong>strategic_plan.read_all</strong>{' '}
                  to choose activities or risks to attach.
                </Alert>
              )}
              <Stack spacing={2} sx={{ mb: 2 }}>
                <Autocomplete
                  options={projects}
                  getOptionLabel={(o) => `${getProjectDisplayName(o)} (ID ${getProjectId(o)})`}
                  value={selectedProject}
                  onChange={(_, v) => setSelectedProject(v)}
                  renderInput={(params) => (
                    <TextField {...params} label="Project" placeholder="Search by name or ID" />
                  )}
                  sx={{ maxWidth: 720 }}
                />
                <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                  {selectedPid != null && (
                    <Button
                      component={Link}
                      to={`/projects/${selectedPid}`}
                      size="small"
                      variant="outlined"
                      endIcon={<OpenInNewIcon fontSize="small" />}
                    >
                      Open project
                    </Button>
                  )}
                  {canEdit && selectedPid != null && canLoadCatalog && (
                    <Button
                      variant="contained"
                      startIcon={<AddIcon />}
                      onClick={openAdd}
                    >
                      {isActivities ? 'Link activity' : 'Link risk'}
                    </Button>
                  )}
                </Stack>
              </Stack>
              {selectedPid == null ? (
                <Typography color="text.secondary">
                  Select a project to view linked {isActivities ? 'activities' : 'risks'}.
                </Typography>
              ) : loadingLinks ? (
                <Box sx={{ py: 4, display: 'flex', justifyContent: 'center' }}>
                  <CircularProgress size={32} />
                </Box>
              ) : (
                <Box sx={{ height: 460, width: '100%' }}>
                  <DataGrid
                    rows={links}
                    columns={isActivities ? activityColumns : riskColumns}
                    getRowId={(r) => r.id}
                    disableRowSelectionOnClick
                    pageSizeOptions={[10, 25]}
                    initialState={{ pagination: { paginationModel: { pageSize: 10 } } }}
                  />
                </Box>
              )}
            </>
          )}
        </Paper>
      </Box>

      <Dialog open={addOpen} onClose={() => setAddOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>{isActivities ? 'Link catalog activity' : 'Link catalog risk'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              select
              label={isActivities ? 'Catalog activity' : 'Catalog risk'}
              fullWidth
              required
              value={addCatalogId}
              onChange={(e) => setAddCatalogId(e.target.value)}
            >
              {addChoices.map((c) => (
                <MenuItem key={c.id} value={String(c.id)}>
                  {isActivities
                    ? `${c.activityCode || ''} — ${c.activityName || c.id}`
                    : `${c.riskCode || ''} — ${c.riskName || c.id}`}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              label="Notes (optional)"
              fullWidth
              multiline
              minRows={2}
              value={addNotes}
              onChange={(e) => setAddNotes(e.target.value)}
              helperText="Project-specific context for this link."
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={saveAdd} disabled={!canEdit || !addChoices.length}>
            Add
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export function ProjectPlanningActivityLinksPage() {
  return <CatalogLinksPage kind="activities" />;
}

export function ProjectPlanningRiskLinksPage() {
  return <CatalogLinksPage kind="risks" />;
}
