import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box,
  Typography,
  Button,
  Paper,
  Alert,
  CircularProgress,
  Stack,
  Autocomplete,
  TextField,
  useTheme,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  Tooltip,
  Chip,
} from '@mui/material';
import { DataGrid, GridToolbar } from '@mui/x-data-grid';
import SaveAltIcon from '@mui/icons-material/SaveAlt';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import apiService from '../api';
import { useAuth } from '../context/AuthContext.jsx';
import Header from './dashboard/Header';
import { tokens } from './dashboard/theme';
import * as XLSX from 'xlsx';

const checkUserPrivilege = (user, privilegeName) =>
  user && Array.isArray(user.privileges) && user.privileges.includes(privilegeName);

const emptyForm = () => ({
  evaluationDate: '',
  projectCode: '',
  projectName: '',
  activityCode: '',
  activityName: '',
  indicatorName: '',
  milestoneValue: '',
  achievedValue: '',
  performanceScore: '',
});

let nextRowId = 1;
function newRow(overrides = {}) {
  return {
    id: nextRowId++,
    ...emptyForm(),
    ...overrides,
  };
}

function previewScore(milestoneValue, achievedValue, override) {
  if (override !== '' && override != null && String(override).trim() !== '') {
    const o = Number(override);
    if (Number.isFinite(o)) return `${o.toFixed(1)}%`;
  }
  const m = parseFloat(milestoneValue);
  const a = parseFloat(achievedValue);
  if (!Number.isFinite(m) || m === 0 || !Number.isFinite(a)) return '—';
  return `${((a / m) * 100).toFixed(1)}%`;
}

function previewScoreNumeric(milestoneValue, achievedValue, override) {
  if (override !== '' && override != null && String(override).trim() !== '') {
    const o = Number(override);
    if (Number.isFinite(o)) return o;
  }
  const m = parseFloat(milestoneValue);
  const a = parseFloat(achievedValue);
  if (!Number.isFinite(m) || m === 0 || !Number.isFinite(a)) return null;
  return (a / m) * 100;
}

function formatNumCell(v) {
  if (v === '' || v == null) return '—';
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  return n.toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 0 });
}

function projectToPrefill(project) {
  if (!project) return emptyForm();
  const code =
    project.ProjectRefNum ||
    project.projectRefNum ||
    project.data_sources?.project_ref_num ||
    (project.id != null ? `PRJ-${project.id}` : '');
  return {
    ...emptyForm(),
    projectCode: code ? String(code) : '',
    projectName: project.projectName || project.name || '',
  };
}

function getProjectId(p) {
  if (!p) return null;
  return p.projectId ?? p.project_id ?? p.id ?? null;
}

export default function ProjectEvaluationPage() {
  const theme = useTheme();
  const colors = tokens(theme.palette.mode);
  const { user, loading: authLoading } = useAuth();
  const [projects, setProjects] = useState([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [rows, setRows] = useState([]);
  const [selectedProject, setSelectedProject] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [lastPath, setLastPath] = useState('');

  const [rowDialog, setRowDialog] = useState({ open: false, editingId: null });
  const [form, setForm] = useState(emptyForm);

  const [planningActivities, setPlanningActivities] = useState([]);
  const [planningIndicators, setPlanningIndicators] = useState([]);
  const [linkedProjectActivities, setLinkedProjectActivities] = useState([]);
  const [loadingLinkedActivities, setLoadingLinkedActivities] = useState(false);
  const [loadingPlanningCatalog, setLoadingPlanningCatalog] = useState(false);
  const [planningCatalogError, setPlanningCatalogError] = useState('');

  const canAccess =
    checkUserPrivilege(user, 'project.read_all') || checkUserPrivilege(user, 'project.update');
  const canPlanningCatalog = checkUserPrivilege(user, 'strategic_plan.read_all');
  const selectedPid = useMemo(() => getProjectId(selectedProject), [selectedProject]);
  const [loadingEvaluations, setLoadingEvaluations] = useState(false);

  useEffect(() => {
    if (authLoading || !canAccess) {
      setLoadingProjects(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const data = await apiService.projects.getProjects();
        if (!cancelled) setProjects(Array.isArray(data) ? data : []);
      } catch (e) {
        if (!cancelled) setError(e?.response?.data?.message || e?.message || 'Failed to load projects.');
      } finally {
        if (!cancelled) setLoadingProjects(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, canAccess]);

  useEffect(() => {
    if (!canAccess || selectedPid == null) {
      setRows([]);
      return;
    }
    let cancelled = false;
    setLoadingEvaluations(true);
    setError('');
    (async () => {
      try {
        const data = await apiService.projects.getProjectEvaluations(selectedPid);
        if (!cancelled) setRows(Array.isArray(data) ? data : []);
      } catch (e) {
        if (!cancelled) {
          setRows([]);
          setError(e?.response?.data?.message || e?.message || 'Failed to load project evaluations.');
        }
      } finally {
        if (!cancelled) setLoadingEvaluations(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [canAccess, selectedPid]);

  useEffect(() => {
    if (authLoading || !canAccess || !canPlanningCatalog) {
      setPlanningActivities([]);
      setPlanningIndicators([]);
      return;
    }
    let cancelled = false;
    setLoadingPlanningCatalog(true);
    setPlanningCatalogError('');
    (async () => {
      try {
        const [acts, inds] = await Promise.all([
          apiService.planning.getProjectActivities(),
          apiService.planning.getIndicators(),
        ]);
        if (!cancelled) {
          setPlanningActivities(Array.isArray(acts) ? acts : []);
          setPlanningIndicators(Array.isArray(inds) ? inds : []);
        }
      } catch (e) {
        if (!cancelled) {
          setPlanningCatalogError(e?.response?.data?.message || e?.message || 'Failed to load planning catalog.');
          setPlanningActivities([]);
          setPlanningIndicators([]);
        }
      } finally {
        if (!cancelled) setLoadingPlanningCatalog(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, canAccess, canPlanningCatalog]);

  const selectedActivityOption = useMemo(() => {
    const sourceActivities =
      selectedPid != null && linkedProjectActivities.length > 0 ? linkedProjectActivities : planningActivities;
    const code = String(form.activityCode || '').trim();
    const name = String(form.activityName || '').trim();
    if (!code && !name) return null;
    return (
      sourceActivities.find(
        (a) =>
          String(a.activityCode || '').trim() === code && String(a.activityName || '').trim() === name
      ) || null
    );
  }, [planningActivities, linkedProjectActivities, form.activityCode, form.activityName, selectedPid]);

  const selectedIndicatorOption = useMemo(() => {
    const n = String(form.indicatorName || '').trim();
    if (!n) return null;
    return planningIndicators.find((i) => String(i.name || '').trim() === n) || null;
  }, [planningIndicators, form.indicatorName]);

  useEffect(() => {
    if (!canAccess || selectedPid == null) {
      setLinkedProjectActivities([]);
      return;
    }
    let cancelled = false;
    setLoadingLinkedActivities(true);
    (async () => {
      try {
        const rows = await apiService.projects.getPlanningCatalogActivityLinks(selectedPid);
        if (!cancelled) setLinkedProjectActivities(Array.isArray(rows) ? rows : []);
      } catch {
        if (!cancelled) setLinkedProjectActivities([]);
      } finally {
        if (!cancelled) setLoadingLinkedActivities(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [canAccess, selectedPid]);

  const openAddDialog = useCallback(() => {
    setError('');
    const base = selectedProject ? projectToPrefill(selectedProject) : emptyForm();
    setForm(base);
    setRowDialog({ open: true, editingId: null });
  }, [selectedProject]);

  const openEditDialog = useCallback((row) => {
    setError('');
    setForm({
      evaluationDate:
        row.evaluationDate == null || row.evaluationDate === ''
          ? ''
          : String(row.evaluationDate).slice(0, 10),
      projectCode: row.projectCode ?? '',
      projectName: row.projectName ?? '',
      activityCode: row.activityCode ?? '',
      activityName: row.activityName ?? '',
      indicatorName: row.indicatorName ?? '',
      milestoneValue: row.milestoneValue === '' || row.milestoneValue == null ? '' : String(row.milestoneValue),
      achievedValue: row.achievedValue === '' || row.achievedValue == null ? '' : String(row.achievedValue),
      performanceScore:
        row.performanceScore === '' || row.performanceScore == null ? '' : String(row.performanceScore),
    });
    setRowDialog({ open: true, editingId: row.id });
  }, []);

  const closeDialog = useCallback(() => {
    setRowDialog({ open: false, editingId: null });
    setForm(emptyForm());
  }, []);

  const saveDialog = useCallback(async () => {
    if (!canAccess || selectedPid == null) return;
    if (!form.evaluationDate) {
      setError('Evaluation date is required.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const payload = {
        projectId: selectedPid,
        evaluationDate: form.evaluationDate || null,
        projectCode: form.projectCode || null,
        projectName: form.projectName || null,
        activityCode: form.activityCode || null,
        activityName: form.activityName || null,
        indicatorName: form.indicatorName || null,
        milestoneValue: form.milestoneValue === '' ? null : Number(form.milestoneValue),
        achievedValue: form.achievedValue === '' ? null : Number(form.achievedValue),
        performanceScore: form.performanceScore === '' ? null : Number(form.performanceScore),
      };
      if (rowDialog.editingId != null) {
        await apiService.projects.updateProjectEvaluation(rowDialog.editingId, payload);
        setMessage('Evaluation line updated.');
      } else {
        await apiService.projects.createProjectEvaluation(payload);
        setMessage('Evaluation line saved.');
      }
      const data = await apiService.projects.getProjectEvaluations(selectedPid);
      setRows(Array.isArray(data) ? data : []);
      closeDialog();
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || 'Save failed.');
    } finally {
      setSaving(false);
    }
  }, [canAccess, selectedPid, rowDialog.editingId, form, closeDialog]);

  const removeRow = useCallback(async (row) => {
    if (!canAccess || selectedPid == null) return;
    if (!window.confirm(`Remove this evaluation line (${row.projectName || row.projectCode || 'row'})?`)) return;
    setSaving(true);
    setError('');
    try {
      await apiService.projects.deleteProjectEvaluation(row.id);
      const data = await apiService.projects.getProjectEvaluations(selectedPid);
      setRows(Array.isArray(data) ? data : []);
      setMessage('Evaluation line removed.');
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || 'Delete failed.');
    } finally {
      setSaving(false);
    }
  }, [canAccess, selectedPid]);

  const gridRows = useMemo(
    () => rows.map((r, i) => ({ ...r, _lineNo: i + 1 })),
    [rows]
  );

  const columns = useMemo(
    () => [
      {
        field: '_lineNo',
        headerName: '#',
        width: 56,
        minWidth: 56,
        sortable: false,
        filterable: false,
        align: 'center',
        headerAlign: 'center',
        type: 'number',
      },
      {
        field: 'evaluationDate',
        headerName: 'Date',
        minWidth: 120,
        flex: 0.55,
        renderCell: (p) => (
          <Typography variant="body2" sx={{ fontFamily: 'ui-monospace, monospace' }}>
            {p.value ? String(p.value).slice(0, 10) : '—'}
          </Typography>
        ),
      },
      {
        field: 'projectCode',
        headerName: 'Project code',
        minWidth: 118,
        flex: 0.65,
        renderCell: (p) => (
          <Typography variant="body2" sx={{ fontWeight: 600, fontFamily: 'ui-monospace, monospace' }}>
            {p.value || '—'}
          </Typography>
        ),
      },
      {
        field: 'activityCode',
        headerName: 'Activity code',
        minWidth: 110,
        flex: 0.55,
        renderCell: (p) => (
          <Typography variant="body2" sx={{ fontFamily: 'ui-monospace, monospace', fontSize: '0.8125rem' }}>
            {p.value || '—'}
          </Typography>
        ),
      },
      { field: 'activityName', headerName: 'Activity name', minWidth: 130, flex: 0.9 },
      { field: 'indicatorName', headerName: 'Indicator (KPI)', minWidth: 150, flex: 1 },
      {
        field: 'milestoneValue',
        headerName: 'Target',
        minWidth: 100,
        align: 'right',
        headerAlign: 'right',
        renderCell: (p) => (
          <Typography variant="body2" sx={{ fontVariantNumeric: 'tabular-nums', width: '100%', textAlign: 'right' }}>
            {formatNumCell(p.value)}
          </Typography>
        ),
      },
      {
        field: 'achievedValue',
        headerName: 'Achieved',
        minWidth: 100,
        align: 'right',
        headerAlign: 'right',
        renderCell: (p) => (
          <Typography variant="body2" sx={{ fontVariantNumeric: 'tabular-nums', width: '100%', textAlign: 'right' }}>
            {formatNumCell(p.value)}
          </Typography>
        ),
      },
      {
        field: 'performanceScore',
        headerName: 'Override %',
        minWidth: 96,
        align: 'right',
        headerAlign: 'right',
        renderCell: (p) => (
          <Typography variant="body2" sx={{ fontVariantNumeric: 'tabular-nums', width: '100%', textAlign: 'right' }}>
            {p.value === '' || p.value == null ? '—' : `${Number(p.value).toFixed(1)}%`}
          </Typography>
        ),
      },
      {
        field: '_preview',
        headerName: 'Performance',
        minWidth: 118,
        sortable: false,
        filterable: false,
        align: 'center',
        headerAlign: 'center',
        renderCell: (params) => {
          const label = previewScore(
            params.row.milestoneValue,
            params.row.achievedValue,
            params.row.performanceScore
          );
          if (label === '—') {
            return (
              <Typography variant="body2" color="text.secondary">
                —
              </Typography>
            );
          }
          const n = previewScoreNumeric(
            params.row.milestoneValue,
            params.row.achievedValue,
            params.row.performanceScore
          );
          let color = 'default';
          if (n != null) {
            if (n >= 100) color = 'success';
            else if (n >= 70) color = 'info';
            else if (n >= 40) color = 'warning';
            else color = 'error';
          }
          return <Chip size="small" label={label} color={color} variant={color === 'default' ? 'outlined' : 'filled'} />;
        },
      },
      {
        field: 'actions',
        headerName: 'Actions',
        width: 108,
        minWidth: 108,
        sortable: false,
        filterable: false,
        align: 'center',
        headerAlign: 'center',
        renderCell: (params) => (
          <Stack direction="row" spacing={0} justifyContent="center">
            <Tooltip title="Edit line">
              <IconButton size="small" onClick={() => openEditDialog(params.row)} aria-label="Edit row">
                <EditIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="Remove line">
              <IconButton size="small" color="error" onClick={() => removeRow(params.row)} aria-label="Remove row">
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Stack>
        ),
      },
    ],
    [openEditDialog, removeRow]
  );

  const handleExport = async () => {
    if (!canAccess || selectedPid == null || rows.length === 0) return;
    setError('');
    setMessage('');
    try {
      const aoa = [
        ['MACHAKOS COUNTY GOVERNMENT'],
        ['MONITORING & EVALUATION SYSTEM'],
        ['PROJECT EVALUATION'],
        [],
        ['#', 'EVALUATION DATE', 'PROJECT CODE', 'PROJECT NAME', 'PROJECT ACTIVITY CODE', 'PROJECT ACTIVITY NAME', 'PROJECT INDICATOR NAME', 'MILESTONE VALUE', 'ACHIEVED VALUE', 'PERFORMANCE SCORE [%]'],
      ];
      rows.forEach((r, i) => {
        const computed = previewScoreNumeric(r.milestoneValue, r.achievedValue, r.performanceScore);
        aoa.push([
          i + 1,
          r.evaluationDate ? String(r.evaluationDate).slice(0, 10) : '',
          r.projectCode || '',
          r.projectName || '',
          r.activityCode || '',
          r.activityName || '',
          r.indicatorName || '',
          r.milestoneValue ?? '',
          r.achievedValue ?? '',
          r.performanceScore ?? (computed == null ? '' : Number(computed.toFixed(1))),
        ]);
      });
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      ws['!cols'] = [
        { wch: 6 }, { wch: 14 }, { wch: 16 }, { wch: 30 }, { wch: 22 }, { wch: 30 }, { wch: 28 }, { wch: 16 }, { wch: 16 }, { wch: 20 },
      ];
      ws['!merges'] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: 9 } },
        { s: { r: 1, c: 0 }, e: { r: 1, c: 9 } },
        { s: { r: 2, c: 0 }, e: { r: 2, c: 9 } },
      ];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Project Evaluation');
      const safeName = String(selectedProject?.projectName || `Project-${selectedPid}`)
        .replace(/[^a-z0-9-_ ]/gi, '')
        .trim()
        .replace(/\s+/g, '_');
      XLSX.writeFile(wb, `${safeName || `Project-${selectedPid}`}_Project_Evaluation.xlsx`);
      setMessage(`Exported ${rows.length} row(s) to Excel.`);
      setLastPath('');
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || 'Export failed.');
    }
  };

  const isDark = theme.palette.mode === 'dark';

  if (authLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!canAccess) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="warning">
          You need <strong>project.read_all</strong> or <strong>project.update</strong> to use project evaluation
          export.
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
        <Header
          title="Project evaluation"
          subtitle="Capture project evaluation lines in the database and export a formatted Excel report"
        />
      </Box>
      <Box sx={{ p: 2, maxWidth: 1600, mx: 'auto' }}>
        <Paper sx={{ p: 2, borderRadius: 2 }}>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
              {error}
            </Alert>
          )}
          {message && (
            <Alert severity="success" sx={{ mb: 2 }} onClose={() => setMessage('')}>
              {message}
              {lastPath ? (
                <Typography component="span" variant="body2" sx={{ display: 'block', mt: 1, fontFamily: 'monospace' }}>
                  {lastPath}
                </Typography>
              ) : null}
            </Alert>
          )}
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 2 }} alignItems={{ sm: 'center' }}>
            <Autocomplete
              sx={{ minWidth: 280, flex: 1 }}
              options={projects}
              loading={loadingProjects}
              value={selectedProject}
              onChange={(_, v) => setSelectedProject(v)}
              getOptionLabel={(p) =>
                p ? `${p.projectName || p.name || 'Project'}${p.ProjectRefNum || p.projectRefNum ? ` (${p.ProjectRefNum || p.projectRefNum})` : p.id ? ` (#${p.id})` : ''}` : ''
              }
              renderInput={(params) => (
                <TextField {...params} label="Prefill for new row (optional)" placeholder="Search registry…" />
              )}
            />
            <Button
              startIcon={<AddIcon />}
              variant="outlined"
              onClick={openAddDialog}
              disabled={selectedPid == null}
            >
              Add row
            </Button>
            <Button
              startIcon={saving ? <CircularProgress size={18} color="inherit" /> : <SaveAltIcon />}
              variant="contained"
              onClick={handleExport}
              disabled={saving || rows.length === 0 || selectedPid == null}
            >
              Export to Excel
            </Button>
            <Chip
              label={`${rows.length} line${rows.length === 1 ? '' : 's'}`}
              size="small"
              variant="outlined"
              sx={{ fontWeight: 600 }}
            />
          </Stack>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
            Evaluation lines are now stored in the database for the selected project and available after refresh.
          </Typography>
          <Paper
            variant="outlined"
            sx={{
              width: '100%',
              borderRadius: 2,
              overflow: 'hidden',
              bgcolor: 'background.paper',
            }}
          >
            <Box sx={{ height: { xs: 440, md: 560 }, width: '100%' }}>
              <DataGrid
                rows={gridRows}
                columns={columns}
                loading={loadingEvaluations}
                getRowId={(r) => r.id}
                disableRowSelectionOnClick
                pageSizeOptions={[10, 25, 50, 100]}
                initialState={{
                  pagination: { paginationModel: { pageSize: 25 } },
                  pinnedColumns: { left: ['_lineNo'] },
                }}
                columnHeaderHeight={44}
                rowHeight={46}
                density="comfortable"
                slots={{
                  toolbar: GridToolbar,
                  noRowsOverlay: () => (
                    <Stack alignItems="center" justifyContent="center" sx={{ py: 8, px: 2, height: '100%' }} spacing={1}>
                      <Typography color="text.secondary" align="center">
                        No evaluation lines yet.
                      </Typography>
                      <Typography variant="body2" color="text.secondary" align="center">
                        {selectedPid == null
                          ? 'Select a project to load or add evaluation lines.'
                          : 'Click Add row to enter project, activity, indicator, and values — then export to Excel.'}
                      </Typography>
                    </Stack>
                  ),
                }}
                slotProps={{
                  toolbar: {
                    showQuickFilter: true,
                    quickFilterProps: { debounceMs: 350, placeholder: 'Search table…' },
                  },
                }}
                sx={{
                  border: 'none',
                  '& .MuiDataGrid-columnHeaders': {
                    bgcolor: (t) => (t.palette.mode === 'dark' ? 'rgba(255,255,255,0.06)' : t.palette.grey[100]),
                    fontWeight: 700,
                    fontSize: '0.75rem',
                    letterSpacing: '0.02em',
                    textTransform: 'uppercase',
                  },
                  '& .MuiDataGrid-columnHeaderTitle': { fontWeight: 700 },
                  '& .MuiDataGrid-cell': {
                    py: 0.5,
                    display: 'flex',
                    alignItems: 'center',
                  },
                  '& .MuiDataGrid-row:nth-of-type(even)': {
                    bgcolor: (t) => (t.palette.mode === 'dark' ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.015)'),
                  },
                  '& .MuiDataGrid-row:hover': {
                    bgcolor: (t) => (t.palette.mode === 'dark' ? 'rgba(144,202,249,0.08)' : 'rgba(25,118,210,0.06)'),
                  },
                  '& .MuiDataGrid-footerContainer': {
                    borderTop: 1,
                    borderColor: 'divider',
                  },
                  '& .MuiDataGrid-toolbarContainer': {
                    px: 1.5,
                    py: 1,
                    gap: 1,
                    flexWrap: 'wrap',
                    borderBottom: 1,
                    borderColor: 'divider',
                    bgcolor: (t) => (t.palette.mode === 'dark' ? 'rgba(0,0,0,0.2)' : t.palette.grey[50]),
                  },
                }}
              />
            </Box>
          </Paper>
        </Paper>
      </Box>

      <Dialog open={rowDialog.open} onClose={closeDialog} fullWidth maxWidth="sm">
        <DialogTitle>{rowDialog.editingId != null ? 'Edit evaluation line' : 'Add evaluation line'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Evaluation date"
              type="date"
              fullWidth
              required
              InputLabelProps={{ shrink: true }}
              value={form.evaluationDate}
              onChange={(e) => setForm((f) => ({ ...f, evaluationDate: e.target.value }))}
            />
            <TextField
              label="Project code"
              fullWidth
              value={form.projectCode}
              onChange={(e) => setForm((f) => ({ ...f, projectCode: e.target.value }))}
            />
            <TextField
              label="Project name"
              fullWidth
              value={form.projectName}
              onChange={(e) => setForm((f) => ({ ...f, projectName: e.target.value }))}
            />
            {canPlanningCatalog && !planningCatalogError ? (
              <>
                {selectedPid != null && linkedProjectActivities.length === 0 && !loadingLinkedActivities && (
                  <Alert severity="info" sx={{ py: 0.5 }}>
                    No activity links found for this project. Add links (with target) in{' '}
                    <strong>Projects — Activity links</strong> for better evaluation tracking.
                  </Alert>
                )}
                <Autocomplete
                  options={
                    selectedPid != null && linkedProjectActivities.length > 0
                      ? linkedProjectActivities
                      : planningActivities
                  }
                  loading={loadingPlanningCatalog || loadingLinkedActivities}
                  value={selectedActivityOption}
                  onChange={(_, activity) => {
                    if (!activity) {
                      setForm((f) => ({
                        ...f,
                        activityCode: '',
                        activityName: '',
                        milestoneValue: '',
                      }));
                      return;
                    }
                    setForm((f) => ({
                      ...f,
                      activityCode: activity.activityCode ?? '',
                      activityName: activity.activityName ?? '',
                      indicatorName: activity.indicatorName != null && String(activity.indicatorName).trim()
                        ? activity.indicatorName
                        : f.indicatorName,
                      milestoneValue:
                        activity.targetValue != null && String(activity.targetValue).trim() !== ''
                          ? String(activity.targetValue)
                          : f.milestoneValue,
                    }));
                  }}
                  isOptionEqualToValue={(a, b) => a?.id === b?.id}
                  getOptionLabel={(a) =>
                    a ? `${a.activityCode || ''} — ${a.activityName || ''}` : ''
                  }
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label="Project activity"
                      placeholder="Search activity code or name…"
                      helperText={
                        selectedPid != null && linkedProjectActivities.length > 0
                          ? 'Showing linked project activities; selecting one can prefill target from Activity links.'
                          : 'Showing planning catalog activities.'
                      }
                    />
                  )}
                />
                <Autocomplete
                  options={planningIndicators}
                  loading={loadingPlanningCatalog}
                  value={selectedIndicatorOption}
                  onChange={(_, ind) => {
                    setForm((f) => ({
                      ...f,
                      indicatorName: ind ? (ind.name ?? '') : '',
                    }));
                  }}
                  isOptionEqualToValue={(a, b) => a?.id === b?.id}
                  getOptionLabel={(i) => (i ? i.name || '' : '')}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label="Project indicator (KPI catalog)"
                      placeholder="Search indicator name…"
                    />
                  )}
                />
              </>
            ) : (
              <>
                {planningCatalogError ? (
                  <Alert severity="warning" sx={{ py: 0.5 }}>
                    {planningCatalogError} You can still type activity and indicator below.
                  </Alert>
                ) : (
                  <Alert severity="info" sx={{ py: 0.5 }}>
                    Add <strong>strategic_plan.read_all</strong> to your role to pick activities and indicators from
                    the Planning catalog.
                  </Alert>
                )}
                <TextField
                  label="Activity code"
                  fullWidth
                  value={form.activityCode}
                  onChange={(e) => setForm((f) => ({ ...f, activityCode: e.target.value }))}
                />
                <TextField
                  label="Activity name"
                  fullWidth
                  value={form.activityName}
                  onChange={(e) => setForm((f) => ({ ...f, activityName: e.target.value }))}
                />
                <TextField
                  label="Indicator name"
                  fullWidth
                  value={form.indicatorName}
                  onChange={(e) => setForm((f) => ({ ...f, indicatorName: e.target.value }))}
                />
              </>
            )}
            <TextField
              label="Milestone value (from linked activity target)"
              fullWidth
              value={form.milestoneValue}
              InputProps={{ readOnly: true }}
              disabled
              helperText="Managed in Projects — Activity links (Target)."
            />
            <TextField
              label="Achieved value"
              fullWidth
              value={form.achievedValue}
              onChange={(e) => setForm((f) => ({ ...f, achievedValue: e.target.value }))}
            />
            <TextField
              label="Performance score % (optional override)"
              fullWidth
              value={form.performanceScore}
              onChange={(e) => setForm((f) => ({ ...f, performanceScore: e.target.value }))}
              helperText="Leave blank to compute from milestone and achieved values on export."
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeDialog}>Cancel</Button>
          <Button variant="contained" onClick={saveDialog}>
            Save line
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
