import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Card,
  CardActionArea,
  CircularProgress,
  IconButton,
  LinearProgress,
  Paper,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import VerifiedIcon from '@mui/icons-material/Verified';
import RefreshIcon from '@mui/icons-material/Refresh';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import PaidIcon from '@mui/icons-material/Paid';
import FactCheckIcon from '@mui/icons-material/FactCheck';
import PhotoCameraIcon from '@mui/icons-material/PhotoCamera';
import { useAuth } from '../context/AuthContext.jsx';
import {
  WORKSPACE_BRAND,
  WORKSPACE_ROUTES,
  SummaryCard,
} from './chiefEngineerWorkspace/chiefEngineerWorkspaceShared';
import { useChiefEngineerWorkspaceData } from './chiefEngineerWorkspace/useChiefEngineerWorkspaceData';

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

export default function ChiefEngineerWorkspacePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { loading, error, load, summary, projects, paymentRequests, certificates, pendingCerts } = useChiefEngineerWorkspaceData({
    include: 'projects,payments,workflow,photos,certCounts',
  });

  const residentApprovedPending = summary.residentEngineerApprovedPending ?? 0;

  const quickActions = [
    {
      title: 'Payment certificates',
      description: residentApprovedPending > 0
        ? `${residentApprovedPending} approved by Resident Engineer — awaiting your sign-off.`
        : 'Second-step certificate approval after Resident Engineer.',
      icon: FactCheckIcon,
      color: WORKSPACE_BRAND.main,
      onClick: () => navigate(WORKSPACE_ROUTES.certificates),
    },
    {
      title: 'Project registry',
      description: 'Browse county projects in your scope.',
      icon: FolderOpenIcon,
      color: '#1565c0',
      onClick: () => navigate(WORKSPACE_ROUTES.projects),
    },
    {
      title: 'Payment requests',
      description: 'Review contractor payment submissions.',
      icon: PaidIcon,
      color: '#ed6c02',
      onClick: () => navigate(WORKSPACE_ROUTES.payments),
    },
    {
      title: 'Progress photos',
      description: 'Review contractor milestone photos.',
      icon: PhotoCameraIcon,
      color: '#2e7d32',
      onClick: () => navigate(WORKSPACE_ROUTES.progressPhotos),
    },
  ];

  const displayName = [user?.firstName, user?.lastName].filter(Boolean).join(' ')
    || user?.username
    || user?.email
    || 'Chief Engineer';

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1280, mx: 'auto' }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', sm: 'center' }} spacing={2} sx={{ mb: 2 }}>
        <Box>
          <Stack direction="row" spacing={1} alignItems="center">
            <VerifiedIcon sx={{ color: WORKSPACE_BRAND.main, fontSize: 32 }} />
            <Typography variant="h5" sx={{ fontWeight: 800 }}>Chief Engineer Workspace</Typography>
          </Stack>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Welcome, {displayName}. Second-step certificate approval after Resident Engineer, then forward to Co-Finance.
          </Typography>
        </Box>
        <Tooltip title="Refresh">
          <IconButton onClick={() => load()} disabled={loading} aria-label="Refresh workspace">
            <RefreshIcon />
          </IconButton>
        </Tooltip>
      </Stack>

      {error ? <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert> : null}
      {loading ? <LinearProgress sx={{ mb: 2, borderRadius: 1 }} /> : null}

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' }, gap: 1.5, mb: 3 }}>
        <SummaryCard
          label="Certs awaiting you"
          value={summary.pendingCertificates ?? '—'}
          sublabel={residentApprovedPending > 0 ? `${residentApprovedPending} after Resident Engineer` : 'Chief Engineer workflow step'}
          color={WORKSPACE_BRAND.main}
        />
        <SummaryCard label="Projects in scope" value={summary.projectCount ?? '—'} sublabel="County / assigned registry" color="#1565c0" />
        <SummaryCard label="Open payment requests" value={summary.openPaymentRequests ?? '—'} sublabel="Contractor submissions" color="#ed6c02" />
        <SummaryCard label="Progress photos" value={summary.progressPhotos ?? '—'} sublabel={`${summary.progressPhotosPendingReview ?? 0} pending review`} color="#2e7d32" />
      </Box>

      {residentApprovedPending > 0 ? (
        <Alert severity="warning" sx={{ mb: 2 }} action={(
          <Button color="inherit" size="small" onClick={() => navigate(WORKSPACE_ROUTES.certificates)}>
            Review certificates
          </Button>
        )}
        >
          {residentApprovedPending} payment certificate{residentApprovedPending !== 1 ? 's' : ''} approved by the Resident Engineer
          {residentApprovedPending !== 1 ? ' are' : ' is'} waiting for your Chief Engineer approval.
        </Alert>
      ) : null}

      <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1.25 }}>
        Quick actions
      </Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: 'repeat(4, 1fr)' }, gap: 2, mb: 3 }}>
        {quickActions.map((action) => (
          <QuickActionCard key={action.title} {...action} />
        ))}
      </Box>

      {!loading ? (
        <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5 }}>
            At a glance
          </Typography>
          <Stack spacing={1}>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Typography variant="body2" color="text.secondary">Certificates awaiting you</Typography>
              <Button size="small" onClick={() => navigate(WORKSPACE_ROUTES.certificates)}>
                {summary.pendingCertificates ?? pendingCerts.length ?? 0} awaiting approval
              </Button>
            </Stack>
            {summary.outOfScopePendingCertificates > 0 ? (
              <Alert severity="warning" sx={{ mt: 1 }}>
                {summary.outOfScopePendingCertificates} certificate workflow step
                {summary.outOfScopePendingCertificates !== 1 ? 's are' : ' is'} assigned to your role on projects
                outside your access scope. Ask an administrator to assign those projects.
              </Alert>
            ) : null}
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Typography variant="body2" color="text.secondary">Projects</Typography>
              <Button size="small" onClick={() => navigate(WORKSPACE_ROUTES.projects)}>
                {projects.length} project{projects.length !== 1 ? 's' : ''}
              </Button>
            </Stack>
          </Stack>
        </Paper>
      ) : (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress size={28} />
        </Box>
      )}
    </Box>
  );
}
