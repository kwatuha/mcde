import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Typography, Button, Paper, Grid, CircularProgress, Alert,
  List, ListItem, ListItemText,
  Chip, Snackbar, Card, CardContent, Avatar, Stack, Divider
} from '@mui/material';
import {
  Visibility as VisibilityIcon,
  PendingActions as PendingActionsIcon,
  CheckCircle as CheckCircleIcon,
  RateReview as RateReviewIcon,
  Paid as PaidIcon,
  PhotoCamera as PhotoCameraIcon,
  FolderOpen as FolderOpenIcon,
  Business as BusinessIcon,
  Email as EmailIcon,
  Phone as PhoneIcon,
  Add as AddIcon,
} from '@mui/icons-material';
import { useAuth } from '../context/AuthContext.jsx';
import apiService from '../api';
import { formatCurrency } from '../utils/helpers';
import { brand } from '../theme/colorTokens';

const ContractorDashboard = () => {
  const navigate = useNavigate();
  const { user, authLoading } = useAuth();

  const contractorId = user?.contractorId;
  const profile = user?.contractorProfile;

  const [projects, setProjects] = useState([]);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });

  const fetchData = useCallback(async () => {
    if (!contractorId) {
      setLoading(false);
      return;
    }
    setLoading(true);
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
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load dashboard data.');
    } finally {
      setLoading(false);
    }
  }, [contractorId]);

  useEffect(() => {
    if (!authLoading && contractorId) fetchData();
    else if (!authLoading) setLoading(false);
  }, [fetchData, contractorId, authLoading]);

  const projectCategories = useMemo(() => {
    const toBool = (v) => v === true || v === 1 || v === '1' || String(v).toLowerCase() === 'true';
    return {
      pendingApproval: projects.filter((p) => !toBool(p.approved_for_public) && !toBool(p.revision_requested)),
      approved: projects.filter((p) => toBool(p.approved_for_public)),
      requestedForReview: projects.filter((p) => toBool(p.revision_requested)),
    };
  }, [projects]);

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

  const handleViewProjectDetails = (projectId) => navigate(`/projects/${projectId}`);

  if (authLoading || (loading && !error)) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!contractorId) {
    return (
      <Box sx={{ p: 3, maxWidth: 720, mx: 'auto' }}>
        <Alert severity="warning" sx={{ mb: 2 }}>
          Your user account is not linked to a contractor company record. An administrator must link your account
          under Contractor Management before you can view projects or request payments.
        </Alert>
        <Typography variant="body2" color="text.secondary">
          Signed in as <strong>{user?.email || user?.username}</strong> ({user?.roleName || 'Contractor'}).
        </Typography>
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">{error}</Alert>
      </Box>
    );
  }

  const companyName = profile?.companyName || 'Your company';
  const contactPerson = profile?.contactPerson || user?.firstName || user?.username || 'Contractor';

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1280, mx: 'auto' }}>
      <Paper
        elevation={0}
        sx={{
          p: { xs: 2.5, md: 3 },
          mb: 3,
          borderRadius: 3,
          background: `linear-gradient(135deg, ${brand.main} 0%, ${brand.dark} 100%)`,
          color: brand.onPrimary,
        }}
      >
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ md: 'center' }}>
          <Avatar
            sx={{
              width: 64,
              height: 64,
              bgcolor: 'rgba(255,255,255,0.2)',
              fontSize: 28,
              fontWeight: 700,
            }}
          >
            {companyName.charAt(0).toUpperCase()}
          </Avatar>
          <Box sx={{ flex: 1 }}>
            <Typography variant="h4" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
              {companyName}
            </Typography>
            <Typography variant="body1" sx={{ opacity: 0.92, mt: 0.5 }}>
              Welcome back, {contactPerson}
            </Typography>
            <Stack direction="row" flexWrap="wrap" gap={1} sx={{ mt: 1.5 }}>
              {profile?.contractorTypeName && (
                <Chip
                  size="small"
                  icon={<BusinessIcon sx={{ color: 'inherit !important' }} />}
                  label={profile.contractorTypeName}
                  sx={{ bgcolor: 'rgba(255,255,255,0.15)', color: '#fff' }}
                />
              )}
              {profile?.email && (
                <Chip
                  size="small"
                  icon={<EmailIcon sx={{ color: 'inherit !important' }} />}
                  label={profile.email}
                  sx={{ bgcolor: 'rgba(255,255,255,0.15)', color: '#fff' }}
                />
              )}
              {profile?.phone && (
                <Chip
                  size="small"
                  icon={<PhoneIcon sx={{ color: 'inherit !important' }} />}
                  label={profile.phone}
                  sx={{ bgcolor: 'rgba(255,255,255,0.15)', color: '#fff' }}
                />
              )}
            </Stack>
          </Box>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => navigate('/contractor-dashboard/payments')}
              sx={{ bgcolor: '#fff', color: brand.main, '&:hover': { bgcolor: brand.surface } }}
            >
              Request payment
            </Button>
            <Button
              variant="outlined"
              startIcon={<PhotoCameraIcon />}
              onClick={() => navigate('/contractor-dashboard/photos')}
              sx={{ borderColor: 'rgba(255,255,255,0.7)', color: '#fff', '&:hover': { borderColor: '#fff' } }}
            >
              Upload photos
            </Button>
            <Button
              variant="outlined"
              startIcon={<FolderOpenIcon />}
              onClick={() => navigate('/contractor-dashboard/project-files')}
              sx={{ borderColor: 'rgba(255,255,255,0.7)', color: '#fff', '&:hover': { borderColor: '#fff' } }}
            >
              Project files
            </Button>
          </Stack>
        </Stack>
      </Paper>

      <Grid container spacing={2} sx={{ mb: 3 }}>
        {[
          { label: 'Assigned projects', value: projects.length, color: brand.main },
          { label: 'Pending payments', value: paymentStats.pending, color: '#ed6c02' },
          { label: 'Approved payments', value: paymentStats.approved, color: '#2e7d32' },
          { label: 'Total requested', value: formatCurrency(paymentStats.totalRequested), color: brand.dark, isText: true },
        ].map((stat) => (
          <Grid item xs={6} md={3} key={stat.label}>
            <Card elevation={2} sx={{ borderRadius: 2, height: '100%' }}>
              <CardContent sx={{ textAlign: 'center', py: 2 }}>
                <Typography variant={stat.isText ? 'h6' : 'h4'} sx={{ fontWeight: 700, color: stat.color }}>
                  {stat.value}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {stat.label}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Grid container spacing={3}>
        <Grid item xs={12} md={5}>
          <Card elevation={2} sx={{ borderRadius: 2, height: '100%' }}>
            <CardContent>
              <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
                <Typography variant="h6" sx={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 1 }}>
                  <PaidIcon color="primary" /> Recent payment requests
                </Typography>
                <Button size="small" onClick={() => navigate('/contractor-dashboard/payments')}>
                  View all
                </Button>
              </Stack>
              <Divider sx={{ mb: 1 }} />
              {recentPayments.length === 0 ? (
                <Alert severity="info">No payment requests yet. Submit your first request from the Payments page.</Alert>
              ) : (
                <List dense>
                  {recentPayments.map((p) => (
                    <ListItem key={p.requestId || p.requestid} divider>
                      <ListItemText
                        primary={formatCurrency(p.amount)}
                        secondary={
                          <>
                            {p.projectName || `Project #${p.projectId}`}
                            <br />
                            <Chip
                              size="small"
                              label={p.approvalWorkflowStatus || 'Submitted'}
                              sx={{ mt: 0.5 }}
                              color={
                                String(p.approvalWorkflowStatus || '').toLowerCase().includes('approved')
                                  ? 'success'
                                  : 'warning'
                              }
                              variant="outlined"
                            />
                          </>
                        }
                      />
                    </ListItem>
                  ))}
                </List>
              )}
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={7}>
          <Card elevation={2} sx={{ borderRadius: 2, height: '100%' }}>
            <CardContent>
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>
                Project overview
              </Typography>
              <Grid container spacing={1}>
                {[
                  { label: 'Pending approval', count: projectCategories.pendingApproval.length, icon: PendingActionsIcon, color: '#ed6c02' },
                  { label: 'Approved', count: projectCategories.approved.length, icon: CheckCircleIcon, color: '#2e7d32' },
                  { label: 'Needs revision', count: projectCategories.requestedForReview.length, icon: RateReviewIcon, color: brand.main },
                ].map((item) => (
                  <Grid item xs={12} sm={4} key={item.label}>
                    <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2, textAlign: 'center' }}>
                      <item.icon sx={{ color: item.color, mb: 0.5 }} />
                      <Typography variant="h5" sx={{ fontWeight: 700 }}>{item.count}</Typography>
                      <Typography variant="caption" color="text.secondary">{item.label}</Typography>
                    </Paper>
                  </Grid>
                ))}
              </Grid>
            </CardContent>
          </Card>
        </Grid>

        {projectCategories.approved.length > 0 && (
          <Grid item xs={12}>
            <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>
              Active projects
            </Typography>
            <Grid container spacing={2}>
              {projectCategories.approved.slice(0, 6).map((proj) => (
                <Grid item xs={12} sm={6} md={4} key={proj.id}>
                  <Card elevation={1} sx={{ borderRadius: 2, borderLeft: `4px solid ${brand.main}` }}>
                    <CardContent>
                      <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                        {proj.projectName || proj.name || `Project #${proj.id}`}
                      </Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                        Status: {proj.status || 'Active'}
                      </Typography>
                      {proj.costOfProject != null && (
                        <Typography variant="caption" color="text.secondary" display="block">
                          Contract: {formatCurrency(proj.costOfProject)}
                        </Typography>
                      )}
                      <Button
                        size="small"
                        startIcon={<VisibilityIcon />}
                        onClick={() => handleViewProjectDetails(proj.id)}
                        sx={{ mt: 1 }}
                      >
                        View project
                      </Button>
                    </CardContent>
                  </Card>
                </Grid>
              ))}
            </Grid>
          </Grid>
        )}
      </Grid>

      <Snackbar open={snackbar.open} autoHideDuration={6000} onClose={() => setSnackbar((s) => ({ ...s, open: false }))}>
        <Alert severity={snackbar.severity}>{snackbar.message}</Alert>
      </Snackbar>
    </Box>
  );
};

export default ContractorDashboard;
