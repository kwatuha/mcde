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
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import RefreshIcon from '@mui/icons-material/Refresh';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import PaidIcon from '@mui/icons-material/Paid';
import FactCheckIcon from '@mui/icons-material/FactCheck';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import HubIcon from '@mui/icons-material/Hub';
import { useAuth } from '../context/AuthContext.jsx';
import { ROUTES } from '../configs/appConfig';
import {
  CO_FINANCE_BRAND,
  CO_FINANCE_WORKSPACE_ROUTES,
  SummaryCard,
} from './coFinanceWorkspace/coFinanceWorkspaceShared';
import { useCoFinanceWorkspaceData } from './coFinanceWorkspace/useCoFinanceWorkspaceData';
import ProjectsByDepartmentSummary from '../components/ProjectsByDepartmentSummary';

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

export default function CoFinanceWorkspacePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const {
    loading,
    error,
    load,
    summary,
    projects,
    paymentRequests,
    certificates,
    pendingCerts,
    pendingPayments,
    pendingAll,
  } = useCoFinanceWorkspaceData({
    include: 'projects,payments,workflow,certCounts',
  });

  const quickActions = [
    {
      title: 'Payment certificates',
      description: (summary.chiefEngineerApprovedPending ?? 0) > 0
        ? `${summary.chiefEngineerApprovedPending} approved by Chief Engineer — awaiting county co-finance sign-off.`
        : 'Final payment certificate approval after engineer chain.',
      icon: FactCheckIcon,
      color: '#2e7d32',
      onClick: () => navigate(CO_FINANCE_WORKSPACE_ROUTES.certificates),
    },
    {
      title: 'Payment requests',
      description: 'Review contractor payment submissions and workflow steps.',
      icon: PaidIcon,
      color: '#ed6c02',
      onClick: () => navigate(CO_FINANCE_WORKSPACE_ROUTES.payments),
    },
    {
      title: 'Project registry',
      description: 'County-wide project oversight, file compliance, and certificates.',
      icon: FolderOpenIcon,
      color: CO_FINANCE_BRAND.main,
      onClick: () => navigate(CO_FINANCE_WORKSPACE_ROUTES.projects),
    },
    {
      title: 'County finance tools',
      description: 'Finance payment list, certificates register, and budget views.',
      icon: AttachMoneyIcon,
      color: '#1565c0',
      onClick: () => navigate(CO_FINANCE_WORKSPACE_ROUTES.finance),
    },
    {
      title: 'Workflow inbox',
      description: `${pendingAll.length} pending approval step${pendingAll.length !== 1 ? 's' : ''} assigned to your role.`,
      icon: HubIcon,
      color: '#6a1b9a',
      onClick: () => navigate(ROUTES.WORKFLOW_APPROVALS),
    },
  ];

  const displayName = [user?.firstName, user?.lastName].filter(Boolean).join(' ')
    || user?.username
    || user?.email
    || 'Co-Finance Officer';

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1280, mx: 'auto' }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', sm: 'center' }} spacing={2} sx={{ mb: 2 }}>
        <Box>
          <Stack direction="row" spacing={1} alignItems="center">
            <AccountBalanceIcon sx={{ color: CO_FINANCE_BRAND.main, fontSize: 32 }} />
            <Typography variant="h5" sx={{ fontWeight: 800 }}>Co-Finance Workspace</Typography>
          </Stack>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Welcome, {displayName}. Final finance review after Resident and Chief Engineer certificate approvals.
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

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(5, 1fr)' }, gap: 1.5, mb: 3 }}>
        <SummaryCard label="Certs awaiting you" value={summary.pendingCertificates ?? '—'} sublabel={(summary.chiefEngineerApprovedPending ?? 0) > 0 ? `${summary.chiefEngineerApprovedPending} after Chief Engineer` : 'Your workflow step'} color="#1565c0" />
        <SummaryCard label="Payment requests" value={summary.openPaymentRequests ?? '—'} sublabel="Open contractor submissions" color="#ed6c02" />
        <SummaryCard label="Projects visible" value={summary.projectCount ?? '—'} sublabel="County / assigned registry" color={CO_FINANCE_BRAND.main} />
        <SummaryCard label="Pending payments workflow" value={summary.pendingPaymentWorkflow ?? pendingPayments.length ?? '—'} sublabel="Assigned to your role" />
        <SummaryCard label="All pending steps" value={summary.pendingAllWorkflow ?? pendingAll.length ?? '—'} sublabel="Certificates + payments" color="#6a1b9a" />
      </Box>

      <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1.25 }}>
        Quick actions
      </Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: 'repeat(3, 1fr)' }, gap: 2, mb: 3 }}>
        {quickActions.map((action) => (
          <QuickActionCard key={action.title} {...action} />
        ))}
      </Box>

      <ProjectsByDepartmentSummary sx={{ mb: 3 }} />

      {!loading ? (
        <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5 }}>
            At a glance
          </Typography>
          <Stack spacing={1}>
            {(summary.chiefEngineerApprovedPending ?? 0) > 0 ? (
              <Alert severity="warning">
                {summary.chiefEngineerApprovedPending} payment certificate
                {summary.chiefEngineerApprovedPending !== 1 ? 's' : ''} approved by the Chief Engineer
                {summary.chiefEngineerApprovedPending !== 1 ? ' are' : ' is'} waiting for co-finance approval.
                {' '}
                <Button size="small" onClick={() => navigate(CO_FINANCE_WORKSPACE_ROUTES.certificates)}>
                  Review certificates
                </Button>
              </Alert>
            ) : null}
            {pendingCerts.length > 0 ? (
              <Alert severity="info">
                {pendingCerts.length} certificate workflow step{pendingCerts.length !== 1 ? 's' : ''} need your action.
              </Alert>
            ) : null}
            {pendingPayments.length > 0 ? (
              <Alert severity="info">
                {pendingPayments.length} payment request workflow step{pendingPayments.length !== 1 ? 's' : ''} need your action.
              </Alert>
            ) : null}
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
