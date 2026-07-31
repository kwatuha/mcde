import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Card,
  CardActionArea,
  CircularProgress,
  IconButton,
  Paper,
  Stack,
  Tab,
  Tabs,
  Tooltip,
  Typography,
} from '@mui/material';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import RefreshIcon from '@mui/icons-material/Refresh';
import FactCheckIcon from '@mui/icons-material/FactCheck';
import ChecklistIcon from '@mui/icons-material/Checklist';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import DescriptionIcon from '@mui/icons-material/Description';
import PhotoCameraIcon from '@mui/icons-material/PhotoCamera';
import GroupsIcon from '@mui/icons-material/Groups';
import { ROUTES } from '../configs/appConfig';
import MobileAppWorkspaceQuickAction from '../components/MobileAppWorkspaceQuickAction';
import villageMonitoringService from '../api/villageMonitoringService';
import VillageMonitoringWorkflowPage from './VillageMonitoringWorkflowPage';
import ProjectsByDepartmentSummary from '../components/ProjectsByDepartmentSummary';

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
  { id: 'drafts', label: 'My drafts', queue: 'village' },
  { id: 'all', label: 'All reports', queue: 'all' },
];

export default function VillageWorkspacePage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [summary, setSummary] = useState(null);
  const reportTab = REPORT_TABS.some((t) => t.id === searchParams.get('tab'))
    ? searchParams.get('tab')
    : 'drafts';

  const setReportTab = (id) => {
    setSearchParams({ tab: id }, { replace: true });
  };

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

  const draftCount = summary?.draft ?? summary?.myQueue ?? 0;
  const activeTab = REPORT_TABS.find((t) => t.id === reportTab) || REPORT_TABS[0];

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1400, mx: 'auto' }}>
      <Stack direction="row" alignItems="flex-start" justifyContent="space-between" spacing={2} sx={{ mb: 3 }}>
        <Box>
          <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 0.5 }}>
            <LocationOnIcon sx={{ color: '#2e7d32', fontSize: 32 }} />
            <Typography variant="h5" sx={{ fontWeight: 800 }}>
              Village M&E Workspace
            </Typography>
          </Stack>
          <Typography variant="body2" color="text.secondary">
            Record monitoring findings, complete the checklist, and submit reports to the ward administrator for review.
          </Typography>
        </Box>
        <Tooltip title="Refresh">
          <IconButton onClick={load} disabled={loading} aria-label="Refresh workspace">
            <RefreshIcon />
          </IconButton>
        </Tooltip>
      </Stack>

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
          label="Draft reports"
          value={draftCount}
          sublabel="Complete checklist, then submit to ward"
          color="#1565c0"
        />
        <SummaryCard
          label="With ward"
          value={summary?.wardQueue ?? '—'}
          sublabel="Pending ward review"
          color="#ed6c02"
        />
        <SummaryCard
          label="Approved"
          value={summary?.approved ?? '—'}
          sublabel="Published to county records"
          color="#2e7d32"
        />
        <SummaryCard
          label="Returned"
          value={summary?.returnedToWard ?? '—'}
          sublabel="Sent back for revision"
          color="#c62828"
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
          title="My draft reports"
          description="Open drafts, fill the checklist, set progress status, and submit to ward."
          icon={FactCheckIcon}
          color="#1565c0"
          onClick={() => setReportTab('drafts')}
        />
        <QuickActionCard
          title="Monitoring visits"
          description="Record field visits, indicators, and routine observations for assigned projects."
          icon={ChecklistIcon}
          color="#6a1b9a"
          onClick={() => navigate(ROUTES.MONITORING_PROJECT_MONITORING)}
        />
        <QuickActionCard
          title="My projects"
          description="Open projects in your village / sublocation scope to upload evidence on the Sites tab."
          icon={FolderOpenIcon}
          color="#00838f"
          onClick={() => navigate(ROUTES.PROJECTS)}
        />
        <QuickActionCard
          title="Project documents"
          description="Upload and manage progress photos, PDFs, and other project files."
          icon={DescriptionIcon}
          color="#455a64"
          onClick={() => navigate(ROUTES.PROJECT_DOCUMENTS_BY_PROJECT)}
        />
        <QuickActionCard
          title="Progress photos"
          description="Upload photos from the project Sites tab after opening a project from the registry."
          icon={PhotoCameraIcon}
          color="#2e7d32"
          onClick={() => navigate(`${ROUTES.PROJECTS}?hint=photos`)}
        />
        <QuickActionCard
          title="RRI programmes"
          description="View rapid response programmes covering your village or linked local projects."
          icon={GroupsIcon}
          color="#5e35b1"
          onClick={() => navigate(ROUTES.RRI_PROGRAMMES)}
        />
        <MobileAppWorkspaceQuickAction />
      </Box>

      <ProjectsByDepartmentSummary sx={{ mb: 3 }} />

      {draftCount > 0 && reportTab !== 'drafts' ? (
        <Alert
          severity="info"
          sx={{ mb: 2 }}
          action={(
            <Button color="inherit" size="small" onClick={() => setReportTab('drafts')}>
              Open drafts
            </Button>
          )}
        >
          {draftCount} monitoring report{draftCount !== 1 ? 's' : ''} in draft — submit to ward when the checklist and progress status are complete.
        </Alert>
      ) : null}

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
                tab.id === 'drafts' && draftCount
                  ? `${tab.label} (${draftCount})`
                  : tab.label
              }
            />
          ))}
        </Tabs>
        <VillageMonitoringWorkflowPage
          embedded
          key={activeTab.queue}
          initialQueue={activeTab.queue}
          homeRoute={ROUTES.VILLAGE_WORKSPACE}
        />
      </Paper>
    </Box>
  );
}
