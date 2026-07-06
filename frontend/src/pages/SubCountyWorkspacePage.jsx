import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
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
import MapIcon from '@mui/icons-material/Map';
import RefreshIcon from '@mui/icons-material/Refresh';
import FactCheckIcon from '@mui/icons-material/FactCheck';
import ListAltIcon from '@mui/icons-material/ListAlt';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import DescriptionIcon from '@mui/icons-material/Description';
import GroupsIcon from '@mui/icons-material/Groups';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ROUTES } from '../configs/appConfig';
import villageMonitoringService from '../api/villageMonitoringService';
import { useAuth } from '../context/AuthContext';
import { canSubCountyReviewMonitoringReports } from '../utils/privilegeUtils';
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
  { id: 'subcounty', label: 'Sub-county review', queue: 'subcounty' },
  { id: 'all', label: 'All reports', queue: 'all' },
];

export default function SubCountyWorkspacePage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [summary, setSummary] = useState(null);
  const reportTab = REPORT_TABS.some((t) => t.id === searchParams.get('tab'))
    ? searchParams.get('tab')
    : 'subcounty';

  const setReportTab = (id) => {
    setSearchParams({ tab: id }, { replace: true });
  };

  const canSubCountyReview = canSubCountyReviewMonitoringReports(user);

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

  const subcountyQueue = summary?.myQueue ?? summary?.subcountyQueue ?? 0;
  const activeTab = REPORT_TABS.find((t) => t.id === reportTab) || REPORT_TABS[0];

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1400, mx: 'auto' }}>
      <Stack direction="row" alignItems="flex-start" justifyContent="space-between" spacing={2} sx={{ mb: 3 }}>
        <Box>
          <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 0.5 }}>
            <MapIcon sx={{ color: '#6a1b9a', fontSize: 32 }} />
            <Typography variant="h5" sx={{ fontWeight: 800 }}>
              Sub-County M&E Workspace
            </Typography>
          </Stack>
          <Typography variant="body2" color="text.secondary">
            Review ward-forwarded monitoring reports — add comments and return to ward for correction, or forward to the chief officer when satisfied.
          </Typography>
        </Box>
        <Tooltip title="Refresh summary">
          <IconButton onClick={load} disabled={loading} aria-label="Refresh workspace">
            <RefreshIcon />
          </IconButton>
        </Tooltip>
      </Stack>

      {!canSubCountyReview ? (
        <Alert severity="warning" sx={{ mb: 2 }}>
          Your account does not have sub-county review privileges. Ask ICT to assign the Sub-County Administrator role or{' '}
          <code>monitoring_report.subcounty_review</code>.
        </Alert>
      ) : null}

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
          label="Awaiting sub-county action"
          value={subcountyQueue}
          sublabel="Forwarded from ward — review only"
          color="#6a1b9a"
        />
        <SummaryCard
          label="With ward"
          value={summary?.wardQueue ?? '—'}
          sublabel="Pending ward or returned for revision"
          color="#ed6c02"
        />
        <SummaryCard
          label="With chief officer"
          value={summary?.chiefQueue ?? '—'}
          sublabel="Forwarded from sub-county"
          color="#1565c0"
        />
        <SummaryCard
          label="Approved"
          value={summary?.approved ?? '—'}
          sublabel="Published after chief sign-off"
          color="#2e7d32"
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
          title="Sub-county review queue"
          description="Reports forwarded by ward administrators — return with comments or forward to chief."
          icon={FactCheckIcon}
          color="#6a1b9a"
          onClick={() => setReportTab('subcounty')}
        />
        <QuickActionCard
          title="All reports"
          description="Every monitoring report in your sub-county scope across all workflow stages."
          icon={ListAltIcon}
          color="#455a64"
          onClick={() => setReportTab('all')}
        />
        <QuickActionCard
          title="Sub-county projects"
          description="Open projects in your sub-county to verify site evidence."
          icon={FolderOpenIcon}
          color="#00838f"
          onClick={() => navigate(ROUTES.PROJECTS)}
        />
        <QuickActionCard
          title="Project documents"
          description="Review progress photos and documents for sub-county projects."
          icon={DescriptionIcon}
          color="#607d8b"
          onClick={() => navigate(ROUTES.PROJECT_DOCUMENTS_BY_PROJECT)}
        />
        <QuickActionCard
          title="RRI programmes"
          description="View rapid response programmes covering your sub-county or linked local projects."
          icon={GroupsIcon}
          color="#5e35b1"
          onClick={() => navigate(ROUTES.RRI_PROGRAMMES)}
        />
      </Box>

      {subcountyQueue > 0 && reportTab !== 'subcounty' ? (
        <Alert severity="info" sx={{ mb: 2 }} action={(
          <Typography
            component="button"
            type="button"
            onClick={() => setReportTab('subcounty')}
            sx={{ border: 0, background: 'none', cursor: 'pointer', textDecoration: 'underline', color: 'inherit', font: 'inherit' }}
          >
            Open review queue
          </Typography>
        )}
        >
          {subcountyQueue} report{subcountyQueue !== 1 ? 's' : ''} awaiting sub-county review.
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
                tab.id === 'subcounty'
                  ? `${tab.label}${subcountyQueue ? ` (${subcountyQueue})` : ''}`
                  : tab.label
              }
            />
          ))}
        </Tabs>
        <VillageMonitoringWorkflowPage
          embedded
          key={activeTab.queue}
          initialQueue={activeTab.queue}
          homeRoute={ROUTES.SUBCOUNTY_WORKSPACE}
        />
      </Paper>
    </Box>
  );
}
