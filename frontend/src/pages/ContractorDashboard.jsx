import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Avatar,
  Box,
  Button,
  Card,
  CardActionArea,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
  Grid,
  IconButton,
  LinearProgress,
  Paper,
  Snackbar,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  Add as AddIcon,
  Business as BusinessIcon,
  CheckCircle as CheckCircleIcon,
  Email as EmailIcon,
  FolderOpen as FolderOpenIcon,
  HelpOutline as HelpOutlineIcon,
  Paid as PaidIcon,
  PendingActions as PendingActionsIcon,
  Phone as PhoneIcon,
  PhotoCamera as PhotoCameraIcon,
  RateReview as RateReviewIcon,
  Refresh as RefreshIcon,
  UploadFile as UploadFileIcon,
} from '@mui/icons-material';
import { useAuth } from '../context/AuthContext.jsx';
import apiService from '../api';
import { formatCurrency } from '../utils/helpers';
import { brand } from '../theme/colorTokens';

function toBool(value) {
  return value === true || value === 1 || value === '1' || String(value).toLowerCase() === 'true';
}

function formatShortDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' });
}

function paymentStatusColor(status) {
  const s = String(status || '').toLowerCase();
  if (s.includes('approved') || s.includes('paid')) return 'success';
  if (s.includes('reject') || s.includes('declined')) return 'error';
  if (s.includes('pending') || s.includes('submitted')) return 'warning';
  return 'default';
}

function projectPublicStatus(project) {
  if (toBool(project.revision_requested)) {
    return { label: 'Revision requested', color: 'warning', icon: RateReviewIcon };
  }
  if (toBool(project.approved_for_public)) {
    return { label: 'Published', color: 'success', icon: CheckCircleIcon };
  }
  return { label: 'Pending review', color: 'default', icon: PendingActionsIcon };
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

function ContactDetail({ icon: Icon, label, value, href }) {
  const content = (
    <Stack direction="row" spacing={1.25} alignItems="center" sx={{ minWidth: 0 }}>
      <Box
        sx={{
          width: 32,
          height: 32,
          borderRadius: 1.25,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          bgcolor: `${brand.main}10`,
          color: brand.main,
          flexShrink: 0,
        }}
      >
        <Icon sx={{ fontSize: 17 }} />
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.2 }}>
          {label}
        </Typography>
        <Typography
          variant="body2"
          sx={{
            fontWeight: 600,
            color: 'text.primary',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {value}
        </Typography>
      </Box>
    </Stack>
  );

  if (!href) return content;

  return (
    <Box
      component="a"
      href={href}
      sx={{
        textDecoration: 'none',
        color: 'inherit',
        borderRadius: 1.5,
        px: 0.5,
        mx: -0.5,
        transition: 'background-color 0.15s',
        '&:hover': { bgcolor: `${brand.main}08` },
      }}
    >
      {content}
    </Box>
  );
}

function StatCard({ label, value, sublabel, color, icon: Icon }) {
  return (
    <Paper
      variant="outlined"
      sx={{
        p: 2,
        borderRadius: 2.5,
        height: '100%',
        borderLeft: `4px solid ${color}`,
      }}
    >
      <Stack direction="row" spacing={1.5} alignItems="flex-start">
        <Box sx={{ color, mt: 0.25 }}>
          <Icon fontSize="small" />
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h5" sx={{ fontWeight: 700, color, lineHeight: 1.2 }}>
            {value}
          </Typography>
          <Typography variant="body2" sx={{ fontWeight: 600, mt: 0.25 }}>
            {label}
          </Typography>
          {sublabel ? (
            <Typography variant="caption" color="text.secondary">
              {sublabel}
            </Typography>
          ) : null}
        </Box>
      </Stack>
    </Paper>
  );
}

const ContractorDashboard = () => {
  const navigate = useNavigate();
  const { user, authLoading } = useAuth();

  const contractorId = user?.contractorId;
  const profile = user?.contractorProfile;

  const [projects, setProjects] = useState([]);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });

  const fetchData = useCallback(async (isRefresh = false) => {
    if (!contractorId) {
      setLoading(false);
      return;
    }
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const [projectsData, paymentsData] = await Promise.all([
        apiService.contractors.getProjectsByContractor(contractorId),
        apiService.contractors.getPaymentRequestsByContractor(contractorId),
      ]);
      const normalizedProjects = Array.isArray(projectsData)
        ? projectsData
        : Array.isArray(projectsData?.projects)
          ? projectsData.projects
          : [];
      setProjects(normalizedProjects);
      setPayments(Array.isArray(paymentsData) ? paymentsData : []);
      if (isRefresh) {
        setSnackbar({ open: true, message: 'Dashboard updated.', severity: 'success' });
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load dashboard data.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [contractorId]);

  useEffect(() => {
    if (!authLoading && contractorId) fetchData();
    else if (!authLoading) setLoading(false);
  }, [fetchData, contractorId, authLoading]);

  const paymentStats = useMemo(() => {
    const pending = payments.filter((p) => {
      const s = String(p.approvalWorkflowStatus || p.approvalworkflowstatus || 'pending').toLowerCase();
      return s.includes('pending') || s === 'submitted';
    });
    const approved = payments.filter((p) =>
      String(p.approvalWorkflowStatus || p.approvalworkflowstatus || '').toLowerCase().includes('approved')
    );
    const totalRequested = payments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
    return { pending: pending.length, approved: approved.length, total: payments.length, totalRequested };
  }, [payments]);

  const recentPayments = useMemo(() => payments.slice(0, 5), [payments]);

  const sortedProjects = useMemo(() => {
    return [...projects].sort((a, b) => {
      const nameA = String(a.projectName || a.name || '').toLowerCase();
      const nameB = String(b.projectName || b.name || '').toLowerCase();
      return nameA.localeCompare(nameB);
    });
  }, [projects]);

  const goToPayments = (projectId) => {
    const suffix = projectId ? `?projectId=${projectId}` : '';
    navigate(`/contractor-dashboard/payments${suffix}`);
  };

  const goToPhotos = (projectId) => {
    const suffix = projectId ? `?projectId=${projectId}` : '';
    navigate(`/contractor-dashboard/photos${suffix}`);
  };

  const goToFiles = (projectId) => {
    const suffix = projectId ? `?projectId=${projectId}` : '';
    navigate(`/contractor-dashboard/project-files${suffix}`);
  };

  if (authLoading || (loading && !error)) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '60vh', gap: 2 }}>
        <CircularProgress />
        <Typography variant="body2" color="text.secondary">Loading your dashboard…</Typography>
      </Box>
    );
  }

  if (!contractorId) {
    return (
      <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 720, mx: 'auto' }}>
        <Paper variant="outlined" sx={{ p: 3, borderRadius: 3 }}>
          <Stack spacing={2}>
            <Typography variant="h5" sx={{ fontWeight: 700 }}>Account not linked yet</Typography>
            <Alert severity="warning">
              Your login is active, but it is not linked to a contractor company. Ask your county contact or
              administrator to link your account under <strong>Contractor Management</strong>.
            </Alert>
            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>What they need to do</Typography>
              <Stack component="ol" spacing={0.75} sx={{ pl: 2.5, m: 0 }}>
                <Typography component="li" variant="body2" color="text.secondary">Create or find your contractor company record.</Typography>
                <Typography component="li" variant="body2" color="text.secondary">Link it to your user account.</Typography>
                <Typography component="li" variant="body2" color="text.secondary">Assign you to the relevant project(s).</Typography>
              </Stack>
            </Box>
            <Typography variant="body2" color="text.secondary">
              Signed in as <strong>{user?.email || user?.username}</strong>
            </Typography>
          </Stack>
        </Paper>
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ p: 3, maxWidth: 720, mx: 'auto' }}>
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={() => fetchData()}>
              Retry
            </Button>
          }
        >
          {error}
        </Alert>
      </Box>
    );
  }

  const companyName = profile?.companyName || 'Your company';
  const contactPerson = profile?.contactPerson || user?.firstName || user?.username || 'Contractor';

  const quickActions = [
    {
      title: 'Request payment',
      description: 'Submit an invoice or interim payment for an assigned project.',
      icon: PaidIcon,
      color: brand.main,
      onClick: () => goToPayments(),
    },
    {
      title: 'Upload progress photos',
      description: 'Share site photos and captions for county review.',
      icon: PhotoCameraIcon,
      color: '#2e7d32',
      onClick: () => goToPhotos(),
    },
    {
      title: 'Submit project files',
      description: 'Upload required contract documents and compliance files.',
      icon: FolderOpenIcon,
      color: '#6a1b9a',
      onClick: () => goToFiles(),
    },
    {
      title: 'Track payment status',
      description: 'View all submitted requests and approval progress.',
      icon: UploadFileIcon,
      color: '#ed6c02',
      onClick: () => navigate('/contractor-dashboard/payments'),
    },
  ];

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1280, mx: 'auto' }}>
      {refreshing ? <LinearProgress sx={{ mb: 2, borderRadius: 1 }} /> : null}

      <Paper
        variant="outlined"
        sx={{
          mb: 2,
          borderRadius: 2.5,
          borderColor: 'divider',
          p: { xs: 1.75, md: 2 },
        }}
      >
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          spacing={{ xs: 1.5, md: 2 }}
          alignItems={{ md: 'center' }}
        >
          <Stack direction="row" spacing={1.5} alignItems="center" sx={{ flex: 1, minWidth: 0 }}>
            <Avatar
              sx={{
                width: 44,
                height: 44,
                bgcolor: `${brand.main}12`,
                color: brand.main,
                fontSize: 17,
                fontWeight: 700,
                flexShrink: 0,
                border: `2px solid ${brand.surfaceStrong}`,
              }}
            >
              {companyName.charAt(0).toUpperCase()}
            </Avatar>
            <Box sx={{ minWidth: 0 }}>
              <Stack direction="row" alignItems="center" flexWrap="wrap" useFlexGap gap={0.75}>
                <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.3 }}>
                  {companyName}
                </Typography>
                {profile?.contractorTypeName ? (
                  <Chip
                    size="small"
                    label={profile.contractorTypeName}
                    sx={{
                      height: 22,
                      fontSize: '0.7rem',
                      fontWeight: 600,
                      bgcolor: `${brand.main}10`,
                      color: brand.dark,
                      border: `1px solid ${brand.surfaceStrong}`,
                    }}
                  />
                ) : null}
              </Stack>
              <Typography variant="body2" sx={{ color: 'text.primary', mt: 0.25, fontWeight: 500 }}>
                {contactPerson}
              </Typography>
            </Box>
          </Stack>

          {(profile?.email || profile?.phone) ? (
            <>
              <Divider
                orientation="vertical"
                flexItem
                sx={{ display: { xs: 'none', md: 'block' }, borderColor: 'divider' }}
              />
              <Divider sx={{ display: { xs: 'block', md: 'none' } }} />
              <Stack
                direction={{ xs: 'column', sm: 'row' }}
                spacing={{ xs: 1.25, sm: 2.5 }}
                sx={{ flexShrink: 0 }}
              >
                {profile?.email ? (
                  <ContactDetail
                    icon={EmailIcon}
                    label="Email"
                    value={profile.email}
                    href={`mailto:${profile.email}`}
                  />
                ) : null}
                {profile?.phone ? (
                  <ContactDetail
                    icon={PhoneIcon}
                    label="Phone"
                    value={profile.phone}
                    href={`tel:${profile.phone}`}
                  />
                ) : null}
              </Stack>
            </>
          ) : null}

          <Tooltip title="Refresh dashboard">
            <IconButton
              size="small"
              onClick={() => fetchData(true)}
              disabled={refreshing}
              sx={{
                color: 'text.secondary',
                alignSelf: { xs: 'flex-end', md: 'center' },
                flexShrink: 0,
              }}
            >
              <RefreshIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>
      </Paper>

      <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1.25 }}>
        Quick actions
      </Typography>
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {quickActions.map((action) => (
          <Grid item xs={12} sm={6} md={3} key={action.title}>
            <QuickActionCard {...action} />
          </Grid>
        ))}
      </Grid>

      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            label="Assigned projects"
            value={projects.length}
            sublabel="Projects linked to your company"
            color={brand.main}
            icon={BusinessIcon}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            label="Pending payments"
            value={paymentStats.pending}
            sublabel="Awaiting county approval"
            color="#ed6c02"
            icon={PendingActionsIcon}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            label="Approved payments"
            value={paymentStats.approved}
            sublabel="Successfully processed"
            color="#2e7d32"
            icon={CheckCircleIcon}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            label="Total requested"
            value={formatCurrency(paymentStats.totalRequested)}
            sublabel={`${paymentStats.total} request(s) submitted`}
            color={brand.dark}
            icon={PaidIcon}
          />
        </Grid>
      </Grid>

      <Grid container spacing={3}>
        <Grid item xs={12} lg={7}>
          <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2.5, height: '100%' }}>
            <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
              <Typography variant="h6" sx={{ fontWeight: 700 }}>
                My projects
              </Typography>
              {projects.length > 0 ? (
                <Chip size="small" label={`${projects.length} assigned`} color="primary" variant="outlined" />
              ) : null}
            </Stack>

            {sortedProjects.length === 0 ? (
              <Alert severity="info" icon={<HelpOutlineIcon />}>
                <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>No projects assigned yet</Typography>
                <Typography variant="body2" sx={{ mt: 0.5 }}>
                  When the county assigns your company to a project, it will appear here with shortcuts to
                  submit payments, photos, and required files.
                </Typography>
              </Alert>
            ) : (
              <Stack spacing={1.5}>
                {sortedProjects.map((proj) => {
                  const projectId = proj.id || proj.projectId;
                  const publicStatus = projectPublicStatus(proj);
                  const StatusIcon = publicStatus.icon;
                  return (
                    <Paper
                      key={projectId}
                      variant="outlined"
                      sx={{
                        p: 2,
                        borderRadius: 2,
                        borderLeft: `4px solid ${brand.main}`,
                      }}
                    >
                      <Stack spacing={1.5}>
                        <Box>
                          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                              {proj.projectName || proj.name || `Project #${projectId}`}
                            </Typography>
                            <Chip
                              size="small"
                              icon={<StatusIcon sx={{ fontSize: '16px !important' }} />}
                              label={publicStatus.label}
                              color={publicStatus.color}
                              variant="outlined"
                            />
                            {proj.status ? (
                              <Chip size="small" label={proj.status} variant="outlined" />
                            ) : null}
                          </Stack>
                          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                            {proj.directorate || proj.projectDescription || 'County project'}
                          </Typography>
                          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mt: 1 }}>
                            <Typography variant="caption" color="text.secondary">
                              Start: {formatShortDate(proj.startDate)}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              End: {formatShortDate(proj.endDate)}
                            </Typography>
                            {proj.costOfProject != null ? (
                              <Typography variant="caption" color="text.secondary">
                                Contract: {formatCurrency(proj.costOfProject)}
                              </Typography>
                            ) : null}
                          </Stack>
                        </Box>
                        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} flexWrap="wrap" useFlexGap>
                          <Button
                            size="small"
                            variant="contained"
                            startIcon={<AddIcon />}
                            onClick={() => goToPayments(projectId)}
                          >
                            Request payment
                          </Button>
                          <Button
                            size="small"
                            variant="outlined"
                            startIcon={<PhotoCameraIcon />}
                            onClick={() => goToPhotos(projectId)}
                          >
                            Upload photos
                          </Button>
                          <Button
                            size="small"
                            variant="outlined"
                            startIcon={<FolderOpenIcon />}
                            onClick={() => goToFiles(projectId)}
                          >
                            Project files
                          </Button>
                        </Stack>
                      </Stack>
                    </Paper>
                  );
                })}
              </Stack>
            )}
          </Paper>
        </Grid>

        <Grid item xs={12} lg={5}>
          <Stack spacing={2} sx={{ height: '100%' }}>
            <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2.5 }}>
              <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
                <Typography variant="h6" sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
                  <PaidIcon color="primary" fontSize="small" />
                  Recent payments
                </Typography>
                <Button size="small" onClick={() => navigate('/contractor-dashboard/payments')}>
                  View all
                </Button>
              </Stack>
              <Divider sx={{ mb: 1.5 }} />
              {recentPayments.length === 0 ? (
                <Alert severity="info" sx={{ mb: 0 }}>
                  No payment requests yet. Use <strong>Request payment</strong> above to submit your first one.
                </Alert>
              ) : (
                <Stack spacing={1.25}>
                  {recentPayments.map((p) => (
                    <Paper key={p.requestId || p.requestid} variant="outlined" sx={{ p: 1.5, borderRadius: 1.5 }}>
                      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
                        <Box>
                          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                            {formatCurrency(p.amount)}
                          </Typography>
                          <Typography variant="body2" color="text.secondary">
                            {p.projectName || `Project #${p.projectId}`}
                          </Typography>
                          {p.description ? (
                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>
                              {p.description}
                            </Typography>
                          ) : null}
                        </Box>
                        <Chip
                          size="small"
                          label={p.approvalWorkflowStatus || 'Submitted'}
                          color={paymentStatusColor(p.approvalWorkflowStatus)}
                          variant="outlined"
                        />
                      </Stack>
                    </Paper>
                  ))}
                </Stack>
              )}
            </Paper>

            <Paper
              variant="outlined"
              sx={{
                p: 2.5,
                borderRadius: 2.5,
                bgcolor: brand.surface,
                borderColor: brand.surfaceStrong,
              }}
            >
              <Stack direction="row" spacing={1} alignItems="flex-start">
                <HelpOutlineIcon sx={{ color: brand.main, mt: 0.25 }} />
                <Box>
                  <Typography variant="subtitle1" sx={{ fontWeight: 700, color: brand.dark }}>
                    Need help?
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                    Use <strong>Request payment</strong> for invoices, <strong>Upload photos</strong> for site
                    progress, and <strong>Project files</strong> for contract documents required by the county.
                    Contact your county project officer if a project is missing from your list.
                  </Typography>
                </Box>
              </Stack>
            </Paper>
          </Stack>
        </Grid>
      </Grid>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={snackbar.severity} onClose={() => setSnackbar((s) => ({ ...s, open: false }))}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default ContractorDashboard;
