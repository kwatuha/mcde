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
import GavelIcon from '@mui/icons-material/Gavel';
import RefreshIcon from '@mui/icons-material/Refresh';
import FactCheckIcon from '@mui/icons-material/FactCheck';
import ListAltIcon from '@mui/icons-material/ListAlt';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import DescriptionIcon from '@mui/icons-material/Description';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ROUTES } from '../configs/appConfig';
import villageMonitoringService from '../api/villageMonitoringService';
import { useAuth } from '../context/AuthContext';
import { canChiefApproveMonitoringReports } from '../utils/privilegeUtils';
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
  { id: 'chief', label: 'Chief approval', queue: 'chief' },
  { id: 'all', label: 'All reports', queue: 'all' },
];

export default function ChiefWorkspacePage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [summary, setSummary] = useState(null);
  const reportTab = REPORT_TABS.some((t) => t.id === searchParams.get('tab'))
    ? searchParams.get('tab')
    : 'chief';

  const setReportTab = (id) => {
    setSearchParams({ tab: id }, { replace: true });
  };

  const canChiefApprove = canChiefApproveMonitoringReports(user);

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

  const chiefQueue = summary?.myQueue ?? summary?.chiefQueue ?? 0;
  const activeTab = REPORT_TABS.find((t) => t.id === reportTab) || REPORT_TABS[0];

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1400, mx: 'auto' }}>
      <Stack direction="row" alignItems="flex-start" justifyContent="space-between" spacing={2} sx={{ mb: 3 }}>
        <Box>
          <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 0.5 }}>
            <GavelIcon sx={{ color: '#1565c0', fontSize: 32 }} />
            <Typography variant="h5" sx={{ fontWeight: 800 }}>
              Department Chief M&E Workspace
            </Typography>
          </Stack>
          <Typography variant="body2" color="text.secondary">
            Final department-level review of monitoring reports forwarded from sub-county — approve to publish projects to the citizen dashboard.
          </Typography>
        </Box>
        <Tooltip title="Refresh summary">
          <IconButton onClick={load} disabled={loading} aria-label="Refresh workspace">
            <RefreshIcon />
          </IconButton>
        </Tooltip>
      </Stack>

      {!canChiefApprove ? (
        <Alert severity="warning" sx={{ mb: 2 }}>
          Your account does not have chief approval privileges. Ask ICT to assign the Department Chief Officer role or{' '}
          <code>monitoring_report.chief_approve</code>.
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
          label="Awaiting chief approval"
          value={chiefQueue}
          sublabel="Department-scoped — review only"
          color="#1565c0"
        />
        <SummaryCard
          label="With sub-county"
          value={summary?.subcountyQueue ?? '—'}
          sublabel="Still in sub-county review"
          color="#6a1b9a"
        />
        <SummaryCard
          label="Published"
          value={summary?.approved ?? '—'}
          sublabel="Approved and visible to citizens"
          color="#2e7d32"
        />
        <SummaryCard
          label="Ward queue"
          value={summary?.wardQueue ?? '—'}
          sublabel="Earlier workflow stages in your scope"
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
          title="Chief approval queue"
          description="Reports forwarded from sub-county — read-only review, then approve and publish."
          icon={FactCheckIcon}
          color="#1565c0"
          onClick={() => setReportTab('chief')}
        />
        <QuickActionCard
          title="All reports"
          description="Every monitoring report in your department scope across all workflow stages."
          icon={ListAltIcon}
          color="#455a64"
          onClick={() => setReportTab('all')}
        />
        <QuickActionCard
          title="Department projects"
          description="Open projects in your department to verify evidence before final approval."
          icon={FolderOpenIcon}
          color="#00838f"
          onClick={() => navigate(ROUTES.PROJECTS)}
        />
        <QuickActionCard
          title="Project documents"
          description="Review progress photos and documents for department projects."
          icon={DescriptionIcon}
          color="#607d8b"
          onClick={() => navigate(ROUTES.PROJECT_DOCUMENTS_BY_PROJECT)}
        />
      </Box>

      {chiefQueue > 0 && reportTab !== 'chief' ? (
        <Alert severity="info" sx={{ mb: 2 }} action={(
          <Typography
            component="button"
            type="button"
            onClick={() => setReportTab('chief')}
            sx={{ border: 0, background: 'none', cursor: 'pointer', textDecoration: 'underline', color: 'inherit', font: 'inherit' }}
          >
            Open approval queue
          </Typography>
        )}
        >
          {chiefQueue} report{chiefQueue !== 1 ? 's' : ''} awaiting chief officer approval.
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
          homeRoute={ROUTES.CHIEF_WORKSPACE}
        />
      </Paper>
    </Box>
  );
}
