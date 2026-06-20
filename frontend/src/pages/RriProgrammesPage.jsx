import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import {
  Add as AddIcon,
  Link as LinkIcon,
  Refresh as RefreshIcon,
  Visibility as ViewDetailsIcon,
} from '@mui/icons-material';
import { DataGrid } from '@mui/x-data-grid';
import apiService from '../api';
import rriService from '../api/rriService';
import { ROUTES } from '../configs/appConfig';
import RriProgrammeSitesSection, { emptyRriSite, RRI_AUTOCOMPLETE_PROPS } from '../components/RriProgrammeSitesSection';
import Header from './dashboard/Header';

const DELIVERY_MODES = [
  { value: 'internal', label: 'Internal (no contractor)' },
  { value: 'mixed', label: 'Mixed' },
  { value: 'contracted', label: 'Contracted' },
];

const emptyForm = {
  name: '',
  description: '',
  sector: '',
  sites: [emptyRriSite()],
  targetBeneficiaries: '',
  status: 'active',
  deliveryMode: 'internal',
};

function formatNumber(value) {
  return Number(value || 0).toLocaleString('en-KE');
}

export default function RriProgrammesPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [rows, setRows] = useState([]);
  const [dashboard, setDashboard] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [linkDialog, setLinkDialog] = useState({ open: false, programme: null, project: null });
  const [projects, setProjects] = useState([]);
  const [sectorOptions, setSectorOptions] = useState([]);
  const [loadingSectors, setLoadingSectors] = useState(false);
  const [geoOptions, setGeoOptions] = useState({ subcounties: [] });
  const [geoLoading, setGeoLoading] = useState({ subcounties: false });
  const [contextMenu, setContextMenu] = useState(null);
  const [selectedProgrammeForContextMenu, setSelectedProgrammeForContextMenu] = useState(null);
  const dataGridRef = useRef(null);

  const programmeDetailPath = useCallback((programmeId) => (
    ROUTES.RRI_PROGRAMME_DETAIL.replace(':programmeId', String(programmeId))
  ), []);

  const handleOpenProgramme = useCallback((programmeId) => {
    if (programmeId != null && programmeId !== '') {
      navigate(programmeDetailPath(programmeId));
    }
  }, [navigate, programmeDetailPath]);

  const handleRowContextMenu = useCallback((event) => {
    event.preventDefault();
    event.stopPropagation();

    const rowElement = event.target.closest('.MuiDataGrid-row');
    if (!rowElement) return;

    let rowId = rowElement.getAttribute('data-id')
      || rowElement.getAttribute('data-row-id')
      || rowElement.id?.replace('MuiDataGrid-row-', '');

    if (!rowId) {
      const allRows = Array.from(rowElement.parentElement?.querySelectorAll('.MuiDataGrid-row') || []);
      const rowIndex = allRows.indexOf(rowElement);
      if (rowIndex >= 0 && rows[rowIndex]) {
        setContextMenu({ mouseX: event.clientX + 2, mouseY: event.clientY - 6 });
        setSelectedProgrammeForContextMenu(rows[rowIndex]);
        return;
      }
      return;
    }

    const row = rows.find((item) => String(item.programmeId) === String(rowId));
    if (row) {
      setContextMenu({ mouseX: event.clientX + 2, mouseY: event.clientY - 6 });
      setSelectedProgrammeForContextMenu(row);
    }
  }, [rows]);

  const handleContextMenuClose = useCallback(() => {
    setContextMenu(null);
    setSelectedProgrammeForContextMenu(null);
  }, []);

  useEffect(() => {
    const gridContainer = dataGridRef.current;
    if (!gridContainer) return undefined;

    const handleContextMenu = (event) => {
      const rowElement = event.target.closest('.MuiDataGrid-row');
      if (rowElement && !event.target.closest('.MuiDataGrid-columnHeader')) {
        handleRowContextMenu(event);
      }
    };

    gridContainer.addEventListener('contextmenu', handleContextMenu);
    return () => gridContainer.removeEventListener('contextmenu', handleContextMenu);
  }, [handleRowContextMenu]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [dashResult, listResult] = await Promise.allSettled([
        rriService.getDashboard(),
        rriService.listProgrammes(),
      ]);
      if (dashResult.status === 'fulfilled') {
        setDashboard(dashResult.value);
      }
      if (listResult.status === 'fulfilled') {
        setRows(listResult.value?.rows || []);
      }
      const failures = [dashResult, listResult].filter((r) => r.status === 'rejected');
      if (failures.length) {
        const first = failures[0];
        const msg = first.reason?.response?.data?.message || first.reason?.message;
        setError(msg || 'Failed to load RRI programmes.');
      }
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Failed to load RRI programmes.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    apiService.projects.getProjects({ limit: 500 }).then((data) => {
      setProjects(Array.isArray(data) ? data : []);
    }).catch(() => setProjects([]));
  }, []);

  useEffect(() => {
    if (!dialogOpen) return undefined;
    let cancelled = false;
    (async () => {
      setLoadingSectors(true);
      try {
        const sectors = await apiService.sectors.getAllSectors();
        const names = (Array.isArray(sectors) ? sectors : [])
          .map((item) => item?.sectorName || item?.name || item?.sector || '')
          .filter(Boolean);
        if (!cancelled) setSectorOptions([...new Set(names)].sort((a, b) => a.localeCompare(b)));
      } catch {
        if (!cancelled) setSectorOptions([]);
      } finally {
        if (!cancelled) setLoadingSectors(false);
      }
    })();
    return () => { cancelled = true; };
  }, [dialogOpen]);

  useEffect(() => {
    if (!dialogOpen) return undefined;
    let cancelled = false;
    (async () => {
      setGeoLoading((prev) => ({ ...prev, subcounties: true }));
      try {
        let list = [];
        if (typeof apiService.kenyaWards?.getCatalogSubcounties === 'function') {
          list = await apiService.kenyaWards.getCatalogSubcounties();
        }
        if (!Array.isArray(list) || list.length === 0) {
          list = await apiService.kenyaWards.getSubcounties();
        }
        if (!cancelled) {
          setGeoOptions((prev) => ({
            ...prev,
            subcounties: (Array.isArray(list) ? list : []).filter(Boolean),
          }));
        }
      } catch {
        if (!cancelled) setGeoOptions((prev) => ({ ...prev, subcounties: [] }));
      } finally {
        if (!cancelled) setGeoLoading((prev) => ({ ...prev, subcounties: false }));
      }
    })();
    return () => { cancelled = true; };
  }, [dialogOpen]);

  const projectOptions = useMemo(() => (
    projects.map((project) => ({
      id: project.id || project.project_id,
      label: project.projectName || project.name || `Project #${project.id || project.project_id}`,
      ward: project.wardNames || project.location?.ward || '',
      subcounty: project.subcountyNames || project.location?.subcounty || '',
    })).filter((item) => item.id != null)
  ), [projects]);

  const sectorAutocompleteOptions = useMemo(() => {
    const fromRows = rows.map((row) => row.sector).filter(Boolean);
    return [...new Set([...sectorOptions, ...fromRows])].sort((a, b) => a.localeCompare(b));
  }, [rows, sectorOptions]);

  const columns = useMemo(() => [
    { field: 'name', headerName: 'Programme', flex: 1.4, minWidth: 200 },
    { field: 'sector', headerName: 'Sector', flex: 1, minWidth: 140 },
    {
      field: 'coverageSummary',
      headerName: 'Coverage',
      flex: 1.1,
      minWidth: 160,
      valueGetter: (_, row) => row.coverageSummary || row.ward || '—',
      renderCell: (params) => {
        const count = Number(params.row.locationCount || 0);
        const summary = params.value || '—';
        return (
          <Box>
            <Typography variant="body2" noWrap>{summary}</Typography>
            {count > 1 && (
              <Typography variant="caption" color="text.secondary">{count} locations</Typography>
            )}
          </Box>
        );
      },
    },
    {
      field: 'deliveryMode',
      headerName: 'Delivery',
      width: 110,
      renderCell: (params) => (
        <Chip
          size="small"
          label={params.value === 'internal' ? 'Internal' : params.value || '—'}
          color={params.value === 'internal' ? 'success' : 'default'}
          variant="outlined"
        />
      ),
    },
    { field: 'linkedProjectCount', headerName: 'Projects', width: 90, type: 'number' },
    { field: 'locationCount', headerName: 'Locations', width: 95, type: 'number' },
    { field: 'siteCount', headerName: 'Project sites', width: 105, type: 'number' },
    { field: 'beneficiaryCount', headerName: 'Beneficiaries', width: 110, type: 'number' },
    {
      field: 'overallProgress',
      headerName: 'Progress',
      width: 100,
      valueGetter: (_, row) => row.overallProgress ?? row.avgProgress ?? 0,
      valueFormatter: (value) => `${Number(value || 0).toFixed(0)}%`,
    },
    {
      field: 'status',
      headerName: 'Status',
      width: 100,
      renderCell: (params) => (
        <Chip size="small" label={params.value || 'active'} color={params.value === 'active' ? 'primary' : 'default'} />
      ),
    },
    {
      field: 'actions',
      headerName: 'Actions',
      width: 170,
      sortable: false,
      renderCell: (params) => (
        <Stack direction="row" spacing={1}>
          <Button size="small" onClick={() => setLinkDialog({ open: true, programme: params.row, project: null })}>
            Link
          </Button>
          <Button size="small" onClick={() => navigate(programmeDetailPath(params.row.programmeId))}>
            View
          </Button>
        </Stack>
      ),
    },
  ], [navigate, programmeDetailPath]);

  const hasValidSites = useMemo(
    () => (form.sites || []).some((site) => String(site.subcounty || '').trim() || String(site.ward || '').trim()),
    [form.sites],
  );

  const handleCreate = async () => {
    setSaving(true);
    try {
      await rriService.createProgramme({
        name: form.name,
        description: form.description,
        sector: form.sector,
        sites: (form.sites || []).map((site) => ({
          siteName: site.siteName,
          subcounty: site.subcounty,
          ward: site.ward,
          targetBeneficiaries: site.targetBeneficiaries ? Number(site.targetBeneficiaries) : null,
          remarks: site.remarks,
        })),
        targetBeneficiaries: form.targetBeneficiaries ? Number(form.targetBeneficiaries) : null,
        status: form.status,
        deliveryMode: form.deliveryMode,
      });
      setDialogOpen(false);
      setForm(emptyForm);
      await load();
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Failed to create programme.');
    } finally {
      setSaving(false);
    }
  };

  const handleLink = async () => {
    if (!linkDialog.programme?.programmeId || !linkDialog.project?.id) return;
    setSaving(true);
    try {
      await rriService.linkProject(linkDialog.programme.programmeId, Number(linkDialog.project.id));
      setLinkDialog({ open: false, programme: null, project: null });
      await load();
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Failed to link project.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box>
      <Header
        title="RRI Programmes"
        subtitle="Internal delivery programmes with multi-site activities and beneficiary tracking"
      />

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      {dashboard && (
        <Grid container spacing={2} sx={{ mb: 2 }}>
          {[
            { label: 'Total programmes', value: dashboard.totalProgrammes },
            { label: 'Active', value: dashboard.activeProgrammes },
            { label: 'Internal delivery', value: dashboard.internalDelivery },
            { label: 'Target beneficiaries', value: dashboard.targetBeneficiaries },
          ].map((card) => (
            <Grid item xs={12} sm={6} md={3} key={card.label}>
              <Paper sx={{ p: 2 }}>
                <Typography variant="caption" color="text.secondary">{card.label}</Typography>
                <Typography variant="h5" fontWeight={700}>{formatNumber(card.value)}</Typography>
              </Paper>
            </Grid>
          ))}
        </Grid>
      )}

      <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => { setForm(emptyForm); setDialogOpen(true); }}>
          New RRI Programme
        </Button>
        <Button variant="outlined" startIcon={<RefreshIcon />} onClick={load} disabled={loading}>
          Refresh
        </Button>
      </Stack>

      <Paper sx={{ height: 560 }} ref={dataGridRef}>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
            <CircularProgress />
          </Box>
        ) : (
          <DataGrid
            rows={rows}
            columns={columns}
            getRowId={(row) => row.programmeId}
            disableRowSelectionOnClick
            onRowDoubleClick={(params, event) => {
              if (event?.target?.closest?.('[data-field="actions"]')) return;
              handleOpenProgramme(params?.row?.programmeId);
            }}
            pageSizeOptions={[10, 25, 50]}
            initialState={{ pagination: { paginationModel: { pageSize: 10 } } }}
            sx={{
              '& .MuiDataGrid-row': { cursor: 'pointer' },
            }}
          />
        )}
      </Paper>

      <Menu
        open={contextMenu !== null}
        onClose={handleContextMenuClose}
        anchorReference="anchorPosition"
        anchorPosition={
          contextMenu !== null
            ? { top: contextMenu.mouseY, left: contextMenu.mouseX }
            : undefined
        }
      >
        {selectedProgrammeForContextMenu && (
          <MenuItem onClick={() => {
            handleOpenProgramme(selectedProgrammeForContextMenu.programmeId);
            handleContextMenuClose();
          }}
          >
            <ListItemIcon><ViewDetailsIcon fontSize="small" /></ListItemIcon>
            <ListItemText>Open programme</ListItemText>
          </MenuItem>
        )}
        {selectedProgrammeForContextMenu && (
          <MenuItem onClick={() => {
            setLinkDialog({ open: true, programme: selectedProgrammeForContextMenu, project: null });
            handleContextMenuClose();
          }}
          >
            <ListItemIcon><LinkIcon fontSize="small" /></ListItemIcon>
            <ListItemText>Link project</ListItemText>
          </MenuItem>
        )}
      </Menu>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>New RRI Programme</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Programme name"
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              required
              fullWidth
            />
            <TextField
              label="Description"
              value={form.description}
              onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
              multiline
              minRows={2}
              fullWidth
            />
            <Autocomplete
              freeSolo
              {...RRI_AUTOCOMPLETE_PROPS}
              options={sectorAutocompleteOptions}
              value={form.sector || null}
              loading={loadingSectors}
              onChange={(_, value) => setForm((p) => ({ ...p, sector: value || '' }))}
              onInputChange={(_, value) => setForm((p) => ({ ...p, sector: value || '' }))}
              renderInput={(params) => (
                <TextField {...params} label="Sector" placeholder="Search or type sector" />
              )}
            />
            <RriProgrammeSitesSection
              sites={form.sites}
              onSitesChange={(sites) => setForm((p) => ({ ...p, sites }))}
              subcountyOptions={geoOptions.subcounties}
              loadingSubcounties={geoLoading.subcounties}
            />
            <TextField
              label="Programme target beneficiaries (optional total)"
              type="number"
              value={form.targetBeneficiaries}
              onChange={(e) => setForm((p) => ({ ...p, targetBeneficiaries: e.target.value }))}
              fullWidth
              helperText="Optional programme-wide total; you can also set per-location targets above"
            />
            <Autocomplete
              {...RRI_AUTOCOMPLETE_PROPS}
              options={DELIVERY_MODES}
              value={DELIVERY_MODES.find((m) => m.value === form.deliveryMode) || DELIVERY_MODES[0]}
              onChange={(_, value) => setForm((p) => ({ ...p, deliveryMode: value?.value || 'internal' }))}
              getOptionLabel={(option) => option?.label || ''}
              isOptionEqualToValue={(option, value) => option.value === value.value}
              renderInput={(params) => <TextField {...params} label="Delivery mode" />}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleCreate} disabled={saving || !form.name.trim() || !hasValidSites}>
            Create
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={linkDialog.open} onClose={() => setLinkDialog({ open: false, programme: null, project: null })} maxWidth="sm" fullWidth>
        <DialogTitle>Link project to {linkDialog.programme?.name}</DialogTitle>
        <DialogContent>
          <Autocomplete
            options={projectOptions}
            value={linkDialog.project}
            onChange={(_, value) => setLinkDialog((p) => ({ ...p, project: value }))}
            getOptionLabel={(option) => option?.label || ''}
            isOptionEqualToValue={(option, value) => String(option?.id) === String(value?.id)}
            renderOption={(props, option) => (
              <li {...props} key={option.id}>
                <Box>
                  <Typography variant="body2" fontWeight={600}>{option.label}</Typography>
                  {(option.subcounty || option.ward) && (
                    <Typography variant="caption" color="text.secondary">
                      {[option.subcounty, option.ward].filter(Boolean).join(' · ')}
                    </Typography>
                  )}
                </Box>
              </li>
            )}
            sx={{ mt: 1 }}
            renderInput={(params) => (
              <TextField {...params} label="Registry project" placeholder="Search project name" />
            )}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setLinkDialog({ open: false, programme: null, project: null })}>Cancel</Button>
          <Button variant="contained" onClick={handleLink} disabled={saving || !linkDialog.project?.id}>Link</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
