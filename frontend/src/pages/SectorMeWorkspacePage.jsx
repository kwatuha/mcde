import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Card,
  CardActionArea,
  Chip,
  CircularProgress,
  IconButton,
  Paper,
  Stack,
  Tab,
  Tabs,
  Tooltip,
  Typography,
} from '@mui/material';
import HubIcon from '@mui/icons-material/Hub';
import RefreshIcon from '@mui/icons-material/Refresh';
import FactCheckIcon from '@mui/icons-material/FactCheck';
import ListAltIcon from '@mui/icons-material/ListAlt';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import DescriptionIcon from '@mui/icons-material/Description';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ROUTES } from '../configs/appConfig';
import MobileAppWorkspaceQuickAction from '../components/MobileAppWorkspaceQuickAction';
import villageMonitoringService from '../api/villageMonitoringService';
import { useAuth } from '../context/AuthContext';
import { canSectorMeViewMonitoringReports } from '../utils/privilegeUtils';
import VillageMonitoringWorkflowPage from './VillageMonitoringWorkflowPage';

function SummaryCard({ label, value, sublabel, color }) {
  return (
    <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, height: '100%' }}>
      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
        {label}
      </Typography>
      <Typography variant="h4" sx={{ fontWeight: 800, color: color || 'text.primary', my: 0.5 }}>
        {value}
      </Typography>
      {sublabel ? (
        <Typography variant="caption" color="text.secondary">{sublabel}</Typography>
      ) : null}
    </Paper>
  );
}

function QuickActionCard({ title, description, icon: Icon, color, onClick }) {
  return (
    <Card
      elevation={0}
      sx={{
        height: '100%',
        borderRadius: 2.5,
        border: '1px solid',
        borderColor: 'divider',
        transition: 'box-shadow 0.2s, border-color 0.2s, transform 0.15s',
        '&:hover': {
          borderColor: color,
          boxShadow: `0 8px 24px ${color}22`,
          transform: 'translateY(-2px)',
        },
      }}
    >
      <CardActionArea onClick={onClick} sx={{ height: '100%', p: 2 }}>
        <Stack spacing={1.5} alignItems="flex-start">
          <Box
            sx={{
              width: 48,
              height: 48,
              borderRadius: 2,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              bgcolor: `${color}18`,
              color,
            }}
          >
            <Icon />
          </Box>
          <Box>
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
              {title}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {description}
            </Typography>
          </Box>
        </Stack>
      </CardActionArea>
    </Card>
  );
}

const REPORT_TABS = [
  { id: 'all', label: 'All reports', queue: 'all' },
  { id: 'chief', label: 'Pending chief approval', queue: 'chief' },
];

export default function SectorMeWorkspacePage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [summary, setSummary] = useState(null);
  const reportTab = REPORT_TABS.some((t) => t.id === searchParams.get('tab'))
    ? searchParams.get('tab')
    : 'all';

  const setReportTab = (id) => {
    setSearchParams({ tab: id }, { replace: true });
  };

  const canView = canSectorMeViewMonitoringReports(user);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await villageMonitoringService.getSummary();
      setSummary(data);
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || 'Failed to load workspace summary.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const chiefQueue = summary?.chiefQueue ?? 0;
  const activeTab = REPORT_TABS.find((t) => t.id === reportTab) || REPORT_TABS[0];

  const sectorLabels = useMemo(() => {
    const fromSummary = Array.isArray(summary?.sectorScopes) ? summary.sectorScopes : [];
    const fromUser = (user?.projectScopes || [])
      .filter((s) => String(s?.scopeType || s?.scope_type || '').toUpperCase() === 'SECTOR')
      .map((s) => String(s?.scopeValue || s?.scope_value || '').trim())
      .filter(Boolean);
    return [...new Set([...fromSummary, ...fromUser])];
  }, [summary?.sectorScopes, user?.projectScopes]);

  const mappedDepartments = useMemo(() => {
    const rows = Array.isArray(summary?.mappedDepartments) ? summary.mappedDepartments : [];
    return [...new Set(rows.map((d) => String(d || '').trim()).filter(Boolean))];
  }, [summary?.mappedDepartments]);

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1400, mx: 'auto' }}>
      <Stack direction="row" alignItems="flex-start" justifyContent="space-between" spacing={2} sx={{ mb: 3 }}>
        <Box>
          <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 0.5 }}>
            <HubIcon sx={{ color: '#00695c', fontSize: 32 }} />
            <Typography variant="h5" sx={{ fontWeight: 800 }}>
              Sector M&E Champions Workspace
            </Typography>
          </Stack>
          <Typography variant="body2" color="text.secondary">
            Oversight of monitoring reports for all departments mapped to your assigned sector(s). Read-only review across the sector portfolio.
          </Typography>
        </Box>
        <Tooltip title="Refresh summary">
          <IconButton onClick={load} disabled={loading} aria-label="Refresh workspace">
            <RefreshIcon />
          </IconButton>
        </Tooltip>
      </Stack>

      {!canView ? (
        <Alert severity="warning" sx={{ mb: 2 }}>
          Your account needs <code>monitoring_report.read</code> and a <strong>Sector</strong> project access scope.
          Ask ICT to assign the Sector M&E Champion role or UI profile.
        </Alert>
      ) : null}

      {sectorLabels.length > 0 ? (
        <Alert severity="info" sx={{ mb: 2 }}>
          <Typography variant="body2" component="div" sx={{ mb: mappedDepartments.length ? 1 : 0 }}>
            <strong>Sector scope:</strong>{' '}
            {sectorLabels.map((label) => (
              <Chip key={label} size="small" label={label} sx={{ mr: 0.5, mb: 0.5 }} />
            ))}
          </Typography>
          {mappedDepartments.length > 0 ? (
            <Typography variant="caption" color="text.secondary" component="div">
              Departments in scope: {mappedDepartments.join(' · ')}
            </Typography>
          ) : (
            <Typography variant="caption" color="text.secondary" component="div">
              Configure department-to-sector mappings under Sectors if department names are missing here.
            </Typography>
          )}
        </Alert>
      ) : (
        <Alert severity="warning" sx={{ mb: 2 }}>
          No sector project scope is assigned yet. In User Management, set <strong>Project access → Sector</strong> for this user.
        </Alert>
      )}

      {loading && !summary ? <CircularProgress size={28} sx={{ mb: 2 }} /> : null}
      {error ? <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert> : null}

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' },
          gap: 2,
          mb: 3,
        }}
      >
        <SummaryCard
          label="Published"
          value={summary?.approved ?? '—'}
          sublabel="Approved in your sector scope"
          color="#2e7d32"
        />
        <SummaryCard
          label="Pending chief approval"
          value={chiefQueue}
          sublabel="Forwarded from sub-county"
          color="#1565c0"
        />
        <SummaryCard
          label="With sub-county"
          value={summary?.subcountyQueue ?? '—'}
          sublabel="Under sub-county review"
          color="#6a1b9a"
        />
        <SummaryCard
          label="Ward queue"
          value={summary?.wardQueue ?? '—'}
          sublabel="Earlier workflow stages"
          color="#ed6c02"
        />
      </Box>

      <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        Quick actions
      </Typography>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: 'repeat(3, 1fr)' },
          gap: 2,
          mb: 3,
        }}
      >
        <QuickActionCard
          title="All sector reports"
          description="Every monitoring report for projects in your sector across all workflow stages."
          icon={ListAltIcon}
          color="#00695c"
          onClick={() => setReportTab('all')}
        />
        <QuickActionCard
          title="Pending chief approval"
          description="Reports awaiting department chief sign-off within your sector."
          icon={FactCheckIcon}
          color="#1565c0"
          onClick={() => setReportTab('chief')}
        />
        <QuickActionCard
          title="Sector projects"
          description="Open the project registry filtered by your sector access."
          icon={FolderOpenIcon}
          color="#00838f"
          onClick={() => navigate(ROUTES.PROJECTS)}
        />
        <QuickActionCard
          title="Project documents"
          description="Review progress photos and documents for sector projects."
          icon={DescriptionIcon}
          color="#607d8b"
          onClick={() => navigate(ROUTES.PROJECT_DOCUMENTS_BY_PROJECT)}
        />
        <MobileAppWorkspaceQuickAction />
      </Box>

      <Paper variant="outlined" sx={{ p: { xs: 1.5, md: 2 }, borderRadius: 2 }}>
        <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1 }}>
          Monitoring reports
        </Typography>
        <Tabs
          value={reportTab}
          onChange={(_, value) => setReportTab(value)}
          sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}
        >
          {REPORT_TABS.map((tab) => (
            <Tab
              key={tab.id}
              value={tab.id}
              label={
                tab.id === 'chief'
                  ? `${tab.label}${chiefQueue ? ` (${chiefQueue})` : ''}`
                  : tab.label
              }
            />
          ))}
        </Tabs>
        <VillageMonitoringWorkflowPage
          embedded
          key={activeTab.queue}
          initialQueue={activeTab.queue}
          homeRoute={ROUTES.SECTOR_ME_WORKSPACE}
        />
      </Paper>
    </Box>
  );
}
