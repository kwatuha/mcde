import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom';
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
  IconButton,
  LinearProgress,
  MenuItem,
  Paper,
  Stack,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon,
  Download as DownloadIcon,
  Groups as GroupsIcon,
  LinkOff as LinkOffIcon,
  OpenInNew as OpenInNewIcon,
  Refresh as RefreshIcon,
  Save as SaveIcon,
} from '@mui/icons-material';
import { DataGrid } from '@mui/x-data-grid';
import apiService from '../api';
import rriService from '../api/rriService';
import { ROUTES } from '../configs/appConfig';
import Header from './dashboard/Header';

const SITE_STATUSES = ['Not Started', 'Ongoing', 'Completed', 'Stalled', 'Suspended'];

function formatNumber(value) {
  return Number(value || 0).toLocaleString('en-KE');
}

function ProgressBar({ value, label }) {
  const pct = Math.min(100, Math.max(0, Number(value || 0)));
  return (
    <Box>
      {label && (
        <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.5 }}>
          <Typography variant="caption" color="text.secondary">{label}</Typography>
          <Typography variant="caption" fontWeight={600}>{pct.toFixed(0)}%</Typography>
        </Stack>
      )}
      <LinearProgress variant="determinate" value={pct} sx={{ height: 8, borderRadius: 1 }} />
    </Box>
  );
}

function SummaryCard({ label, value, helper }) {
  return (
    <Paper sx={{ p: 2, height: '100%' }}>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Typography variant="h5" fontWeight={700}>{value}</Typography>
      {helper && <Typography variant="caption" color="text.secondary">{helper}</Typography>}
    </Paper>
  );
}

export default function RriProgrammeDetailPage() {
  const { programmeId } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState(0);
  const [data, setData] = useState(null);
  const [beneficiaries, setBeneficiaries] = useState({ rows: [], totalCount: 0, registryAvailable: true });
  const [siteDrafts, setSiteDrafts] = useState({});
  const [savingSiteId, setSavingSiteId] = useState(null);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [projects, setProjects] = useState([]);
  const [linkProject, setLinkProject] = useState(null);
  const [linking, setLinking] = useState(false);
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [detail, ben] = await Promise.all([
        rriService.getProgramme(programmeId),
        rriService.getBeneficiaries(programmeId, { limit: 25 }),
      ]);
      setData(detail);
      setBeneficiaries(ben);
      const drafts = {};
      (detail.sites || []).forEach((site) => {
        drafts[site.siteId] = {
          statusNorm: site.statusNorm || 'Not Started',
          percentComplete: site.percentComplete ?? 0,
          remarks: site.remarks || '',
        };
      });
      setSiteDrafts(drafts);
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Failed to load programme.');
    } finally {
      setLoading(false);
    }
  }, [programmeId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!linkDialogOpen) return;
    apiService.projects.getProjects({ limit: 500 }).then((list) => {
      setProjects(Array.isArray(list) ? list : []);
    }).catch(() => setProjects([]));
  }, [linkDialogOpen]);

  const programme = data?.programme;
  const monitoring = data?.monitoring;
  const linkedProjects = data?.projects || [];
  const sites = data?.sites || [];

  const projectOptions = useMemo(() => (
    projects.map((project) => ({
      id: project.id || project.project_id,
      label: project.projectName || project.name || `Project #${project.id || project.project_id}`,
    })).filter((item) => item.id != null)
  ), [projects]);

  const handleSiteDraftChange = (siteId, field, value) => {
    setSiteDrafts((prev) => ({
      ...prev,
      [siteId]: { ...prev[siteId], [field]: value },
    }));
  };

  const handleSaveSite = async (siteId) => {
    const draft = siteDrafts[siteId];
    if (!draft) return;
    setSavingSiteId(siteId);
    try {
      await rriService.updateSiteProgress(programmeId, siteId, {
        statusNorm: draft.statusNorm,
        percentComplete: Number(draft.percentComplete) || 0,
        remarks: draft.remarks,
      });
      await load();
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Failed to save location progress.');
    } finally {
      setSavingSiteId(null);
    }
  };

  const handleLinkProject = async () => {
    if (!linkProject?.id) return;
    setLinking(true);
    try {
      await rriService.linkProject(programmeId, Number(linkProject.id));
      setLinkDialogOpen(false);
      setLinkProject(null);
      await load();
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Failed to link project.');
    } finally {
      setLinking(false);
    }
  };

  const handleUnlinkProject = useCallback(async (projectId) => {
    try {
      await rriService.unlinkProject(programmeId, projectId);
      await load();
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Failed to unlink project.');
    }
  }, [programmeId, load]);

  const handleDownloadBeneficiaryTemplate = async () => {
    setDownloadingTemplate(true);
    setError('');
    try {
      const data = await rriService.downloadBeneficiaryImportTemplate(programmeId);
      const blob = new Blob([data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `beneficiary-import-rri-programme-${programmeId}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Failed to download beneficiary import template.');
    } finally {
      setDownloadingTemplate(false);
    }
  };

  const siteColumns = useMemo(() => [
    {
      field: 'label',
      headerName: 'Location',
      flex: 1.2,
      minWidth: 180,
      valueGetter: (_, row) => row.siteName || [row.subcounty, row.ward].filter(Boolean).join(' · ') || '—',
    },
    { field: 'subcounty', headerName: 'Sub-county', flex: 0.9, minWidth: 120 },
    { field: 'ward', headerName: 'Ward', flex: 0.9, minWidth: 120 },
    {
      field: 'statusNorm',
      headerName: 'Status',
      width: 150,
      sortable: false,
      renderCell: (params) => (
        <TextField
          select
          size="small"
          value={siteDrafts[params.row.siteId]?.statusNorm || 'Not Started'}
          onChange={(e) => handleSiteDraftChange(params.row.siteId, 'statusNorm', e.target.value)}
          sx={{ minWidth: 130 }}
        >
          {SITE_STATUSES.map((status) => (
            <MenuItem key={status} value={status}>{status}</MenuItem>
          ))}
        </TextField>
      ),
    },
    {
      field: 'percentComplete',
      headerName: 'Progress %',
      width: 110,
      sortable: false,
      renderCell: (params) => (
        <TextField
          size="small"
          type="number"
          inputProps={{ min: 0, max: 100, step: 1 }}
          value={siteDrafts[params.row.siteId]?.percentComplete ?? 0}
          onChange={(e) => handleSiteDraftChange(params.row.siteId, 'percentComplete', e.target.value)}
          sx={{ width: 88 }}
        />
      ),
    },
    {
      field: 'targetBeneficiaries',
      headerName: 'Target',
      width: 90,
      type: 'number',
    },
    {
      field: 'actions',
      headerName: '',
      width: 70,
      sortable: false,
      renderCell: (params) => (
        <Tooltip title="Save progress">
          <span>
            <IconButton
              size="small"
              color="primary"
              disabled={savingSiteId === params.row.siteId}
              onClick={() => handleSaveSite(params.row.siteId)}
            >
              {savingSiteId === params.row.siteId ? <CircularProgress size={18} /> : <SaveIcon fontSize="small" />}
            </IconButton>
          </span>
        </Tooltip>
      ),
    },
  ], [siteDrafts, savingSiteId]);

  const projectColumns = useMemo(() => [
    { field: 'projectName', headerName: 'Project', flex: 1.4, minWidth: 200 },
    { field: 'ward', headerName: 'Ward', width: 120 },
    {
      field: 'overallProgress',
      headerName: 'Progress',
      width: 100,
      valueFormatter: (value) => `${Number(value || 0).toFixed(0)}%`,
    },
    { field: 'siteCount', headerName: 'Sites', width: 80, type: 'number' },
    { field: 'beneficiaryCount', headerName: 'Beneficiaries', width: 110, type: 'number' },
    {
      field: 'status',
      headerName: 'Status',
      width: 120,
      renderCell: (params) => (
        <Chip size="small" label={params.value || '—'} variant="outlined" />
      ),
    },
    {
      field: 'actions',
      headerName: 'Actions',
      width: 220,
      sortable: false,
      renderCell: (params) => (
        <Stack direction="row" spacing={0.5}>
          <Button
            size="small"
            component={RouterLink}
            to={ROUTES.PROJECT_DETAILS.replace(':projectId', params.row.projectId)}
            endIcon={<OpenInNewIcon sx={{ fontSize: 14 }} />}
          >
            Project
          </Button>
          <Button
            size="small"
            component={RouterLink}
            to={`${ROUTES.MONITORING_PROJECT_MONITORING}?projectId=${params.row.projectId}`}
          >
            Monitor
          </Button>
          <IconButton size="small" color="error" onClick={() => handleUnlinkProject(params.row.projectId)}>
            <LinkOffIcon fontSize="small" />
          </IconButton>
        </Stack>
      ),
    },
  ], [handleUnlinkProject]);

  const beneficiaryColumns = useMemo(() => [
    { field: 'registryCode', headerName: 'Code', width: 110 },
    {
      field: 'beneficiaryType',
      headerName: 'Type',
      width: 110,
      renderCell: (params) => (
        <Chip size="small" label={params.row.beneficiaryTypeLabel || params.value} variant="outlined" />
      ),
    },
    { field: 'displayName', headerName: 'Name', flex: 1, minWidth: 160 },
    { field: 'gender', headerName: 'Gender', width: 90 },
    { field: 'age', headerName: 'Age', width: 70, type: 'number' },
    { field: 'memberCount', headerName: 'Members', width: 90, type: 'number' },
    { field: 'subCounty', headerName: 'Sub-county', flex: 1, minWidth: 120 },
    { field: 'ward', headerName: 'Ward', flex: 1, minWidth: 120 },
    {
      field: 'source',
      headerName: 'Source',
      width: 100,
      renderCell: (params) => (
        <Chip
          size="small"
          label={params.value === 'direct' ? 'RRI' : 'Project'}
          color={params.value === 'direct' ? 'primary' : 'default'}
          variant="outlined"
        />
      ),
    },
    { field: 'projectId', headerName: 'Project ID', width: 100 },
  ], []);

  if (loading && !programme) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!programme) {
    return (
      <Box>
        <Alert severity="error">{error || 'Programme not found.'}</Alert>
        <Button startIcon={<ArrowBackIcon />} sx={{ mt: 2 }} onClick={() => navigate(ROUTES.RRI_PROGRAMMES)}>
          Back to programmes
        </Button>
      </Box>
    );
  }

  const targetBen = Number(monitoring?.targetBeneficiaries || programme.targetBeneficiaries || 0);
  const actualBen = Number(monitoring?.beneficiaryCount || programme.beneficiaryCount || 0);

  return (
    <Box>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate(ROUTES.RRI_PROGRAMMES)}>
          Programmes
        </Button>
        <Button startIcon={<RefreshIcon />} onClick={load} disabled={loading}>Refresh</Button>
      </Stack>

      <Header
        title={programme.name}
        subtitle={programme.description || 'RRI programme monitoring hub'}
      />

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      <Stack direction="row" spacing={1} sx={{ mb: 2, flexWrap: 'wrap' }}>
        <Chip label={programme.sector || 'No sector'} variant="outlined" />
        <Chip label={programme.deliveryMode === 'internal' ? 'Internal delivery' : programme.deliveryMode} color="success" variant="outlined" />
        <Chip label={programme.status || 'active'} color="primary" />
        {programme.coverageSummary && (
          <Chip icon={<GroupsIcon />} label={programme.coverageSummary} variant="outlined" />
        )}
      </Stack>

      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={3}>
          <SummaryCard
            label="Overall progress"
            value={`${Number(monitoring?.overallProgress || programme.overallProgress || 0).toFixed(0)}%`}
            helper="Blend of coverage locations and linked projects"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <SummaryCard
            label="Coverage progress"
            value={`${Number(monitoring?.coverageAvgProgress || programme.coverageAvgProgress || 0).toFixed(0)}%`}
            helper={`${programme.locationCount || sites.length} location(s)`}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <SummaryCard
            label="Linked projects"
            value={formatNumber(monitoring?.linkedProjectCount || linkedProjects.length)}
            helper={`Avg ${Number(monitoring?.projectAvgProgress || programme.avgProgress || 0).toFixed(0)}% · ${monitoring?.registrySiteCount || 0} registry sites`}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <SummaryCard
            label="Beneficiaries"
            value={formatNumber(actualBen)}
            helper={targetBen > 0 ? `${Math.round((actualBen / targetBen) * 100)}% of ${formatNumber(targetBen)} target` : 'Set programme target on create'}
          />
        </Grid>
      </Grid>

      <Paper sx={{ p: 2, mb: 3 }}>
        <ProgressBar value={monitoring?.overallProgress || programme.overallProgress} label="Programme delivery" />
        <Stack direction="row" spacing={3} sx={{ mt: 2 }}>
          <Box sx={{ flex: 1 }}>
            <ProgressBar value={monitoring?.coverageAvgProgress || programme.coverageAvgProgress} label="Coverage locations" />
          </Box>
          <Box sx={{ flex: 1 }}>
            <ProgressBar value={monitoring?.projectAvgProgress || programme.avgProgress} label="Linked registry projects" />
          </Box>
        </Stack>
      </Paper>

      <Paper sx={{ mb: 2 }}>
        <Tabs value={tab} onChange={(_, value) => setTab(value)} sx={{ px: 2, borderBottom: 1, borderColor: 'divider' }}>
          <Tab label={`Coverage (${sites.length})`} />
          <Tab label={`Linked projects (${linkedProjects.length})`} />
          <Tab label={`Beneficiaries (${beneficiaries.totalCount})`} />
        </Tabs>

        {tab === 0 && (
          <Box sx={{ p: 2 }}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Track delivery progress for each programme coverage location. Update status and % complete, then save each row.
            </Typography>
            <DataGrid
              rows={sites}
              columns={siteColumns}
              getRowId={(row) => row.siteId}
              autoHeight
              disableRowSelectionOnClick
              hideFooter={sites.length <= 10}
              pageSizeOptions={[10, 25]}
              initialState={{ pagination: { paginationModel: { pageSize: 10 } } }}
            />
          </Box>
        )}

        {tab === 1 && (
          <Box sx={{ p: 2 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
              <Typography variant="body2" color="text.secondary">
                Link registry projects to roll up site progress, monitoring visits, and beneficiaries.
              </Typography>
              <Button variant="contained" onClick={() => setLinkDialogOpen(true)}>Link project</Button>
            </Stack>
            <DataGrid
              rows={linkedProjects}
              columns={projectColumns}
              getRowId={(row) => row.projectId}
              autoHeight
              disableRowSelectionOnClick
              hideFooter={linkedProjects.length <= 10}
              pageSizeOptions={[10, 25]}
              initialState={{ pagination: { paginationModel: { pageSize: 10 } } }}
            />
          </Box>
        )}

        {tab === 2 && (
          <Box sx={{ p: 2 }}>
            {!beneficiaries.registryAvailable && (
              <Alert severity="warning" sx={{ mb: 2 }}>
                Beneficiary registry table is not available yet. Run the RRI monitoring migration to enable `studyparticipants`.
              </Alert>
            )}
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }} flexWrap="wrap" useFlexGap>
              <Typography variant="body2" color="text.secondary">
                Individuals linked directly to this RRI programme or via linked registry projects.
              </Typography>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap justifyContent="flex-end">
                <Button
                  variant="outlined"
                  startIcon={downloadingTemplate ? <CircularProgress size={16} /> : <DownloadIcon />}
                  onClick={handleDownloadBeneficiaryTemplate}
                  disabled={downloadingTemplate}
                >
                  {downloadingTemplate ? 'Preparing…' : 'Download import template'}
                </Button>
                {beneficiaries.registryAvailable && (
                  <Button
                    component={RouterLink}
                    to={`${ROUTES.BENEFICIARY_REGISTRY}?rriProgrammeId=${programmeId}`}
                    endIcon={<OpenInNewIcon />}
                  >
                    Open full registry
                  </Button>
                )}
              </Stack>
            </Stack>
            <DataGrid
              rows={beneficiaries.rows}
              columns={beneficiaryColumns}
              getRowId={(row) => row.beneficiaryId || row.individualId}
              autoHeight
              disableRowSelectionOnClick
              hideFooter={beneficiaries.rows.length <= 10}
              pageSizeOptions={[10, 25]}
              initialState={{ pagination: { paginationModel: { pageSize: 10 } } }}
            />
            {beneficiaries.totalCount > beneficiaries.rows.length && (
              <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                Showing {beneficiaries.rows.length} of {beneficiaries.totalCount}. Import more via Data → Import Data with Project ID or RRI programme ID.
              </Typography>
            )}
          </Box>
        )}
      </Paper>

      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>Monitoring shortcuts</Typography>
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          <Button component={RouterLink} to={ROUTES.MONITORING_PROJECT_MONITORING} variant="outlined" size="small">
            Monitoring visits
          </Button>
          <Button component={RouterLink} to={ROUTES.PROJECT_STATUS} variant="outlined" size="small">
            Project status
          </Button>
          <Button component={RouterLink} to="/monitoring/pmc-ward-reports" variant="outlined" size="small">
            PMC ward reports
          </Button>
          <Button component={RouterLink} to={ROUTES.BENEFICIARY_REGISTRY} variant="outlined" size="small">
            Beneficiary registry
          </Button>
        </Stack>
        {linkedProjects.length > 0 && (
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
            For detailed M&E, open a linked project above — sites, contractors, and monitoring records live on the project record.
          </Typography>
        )}
      </Paper>

      <Dialog open={linkDialogOpen} onClose={() => setLinkDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Link registry project</DialogTitle>
        <DialogContent>
          <Autocomplete
            options={projectOptions}
            value={linkProject}
            onChange={(_, value) => setLinkProject(value)}
            getOptionLabel={(option) => option?.label || ''}
            isOptionEqualToValue={(option, value) => String(option?.id) === String(value?.id)}
            sx={{ mt: 1, minWidth: 220, width: '100%' }}
            renderInput={(params) => (
              <TextField {...params} label="Registry project" placeholder="Search project name" />
            )}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setLinkDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleLinkProject} disabled={linking || !linkProject?.id}>
            Link
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
