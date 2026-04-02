import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Box,
  Container,
  Typography,
  Button,
  Grid,
  Card,
  CardContent,
  Avatar,
  useTheme,
  useMediaQuery,
  Paper,
  Chip,
  LinearProgress,
  CircularProgress,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Divider,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Badge,
} from '@mui/material';
import {
  Dashboard as DashboardIcon,
  Assignment as ProjectsIcon,
  Assessment as ReportsIcon,
  People as PeopleIcon,
  CloudUpload as ImportIcon,
  TrendingUp as AnalyticsIcon,
  CheckCircle as CheckIcon,
  CheckCircle as CheckCircleIcon,
  Warning as WarningIcon,
  Schedule as ScheduleIcon,
  ArrowForward as ArrowForwardIcon,
  Refresh as RefreshIcon,
  Notifications as NotificationsIcon,
  Event as EventIcon,
  PieChart as PieChartIcon,
  Business as BusinessIcon,
  Apartment as ApartmentIcon,
  PersonAdd as PersonAddIcon,
  PendingActions as PendingActionsIcon,
  AssignmentInd as AssignmentIndIcon,
  NotificationsActive as NotificationsActiveIcon,
  PlayArrow as PlayArrowIcon,
  Pause as PauseIcon,
  HourglassEmpty as HourglassIcon,
  Close as CloseIcon,
  ListAlt as RegistryIcon,
} from '@mui/icons-material';
import { useAuth } from '../context/AuthContext';
import { ROUTES } from '../configs/appConfig';
import logo from '../assets/logo.png';
import apiService from '../api';
import useDashboardData from '../hooks/useDashboardData';
import { normalizeProjectStatus } from '../utils/projectStatusNormalizer';
import { tokens } from './dashboard/theme';
import { isAdmin } from '../utils/privilegeUtils.js';

const HomePage = () => {
  const theme = useTheme();
  const navigate = useNavigate();
  const { user, hasPrivilege } = useAuth();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  
  const {
    dashboardData = { loading: false, metrics: {}, recentActivity: [] },
    refreshing,
    refreshDashboard,
  } = useDashboardData();

  // Memoize permission checks to prevent unnecessary re-renders
  const canApproveUsers = React.useMemo(() => {
    if (!user) return false;
    return isAdmin(user) || hasPrivilege('user.update') || hasPrivilege('user.approve');
  }, [user?.roleName, user?.privileges, hasPrivilege]);

  const canManageProjects = React.useMemo(() => {
    if (!user) return false;
    return isAdmin(user) || hasPrivilege('project.read') || hasPrivilege('project.update');
  }, [user?.roleName, user?.privileges, hasPrivilege]);

  const [projectStats, setProjectStats] = useState({
    total: 0,
    active: 0,
    completed: 0,
    pending: 0,
    loading: true,
  });

  // Cache full project list once so we don't refetch it in multiple effects
  const [allProjects, setAllProjects] = useState([]);

  const [recentProjects, setRecentProjects] = useState([]);
  const [loadingProjects, setLoadingProjects] = useState(true);

  // Notifications and pending approvals
  const [pendingUsers, setPendingUsers] = useState([]);
  const [pendingProjects, setPendingProjects] = useState([]);
  const [recentUserApprovals, setRecentUserApprovals] = useState([]);
  const [projectsPendingReview, setProjectsPendingReview] = useState([]);
  const [loadingNotifications, setLoadingNotifications] = useState(false);

  // Modal state for status projects
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState(null);
  const [statusProjects, setStatusProjects] = useState([]);
  const [loadingStatusProjects, setLoadingStatusProjects] = useState(false);

  // Fetch project statistics - optimized to use stats API first
  useEffect(() => {
    const fetchProjectStats = async () => {
      try {
        setLoadingProjects(true);
        
        // Try to get stats from public API first (much faster than fetching all projects)
        let statsOverview = null;
        try {
          statsOverview = await apiService.public.getStatsOverview();
        } catch (err) {
          // Silently fail and try authenticated endpoint
        }
        
        // If we have stats, use them and only fetch recent projects
        if (statsOverview && statsOverview.total_projects) {
          const stats = {
            total: statsOverview.total_projects || 0,
            active: statsOverview.ongoing_projects || 0,
            completed: statsOverview.completed_projects || 0,
            pending: (statsOverview.not_started_projects || 0) + 
                     (statsOverview.under_procurement_projects || 0) + 
                     (statsOverview.stalled_projects || 0),
          };
          setProjectStats({ ...stats, loading: false });
          
          // Fetch only recent projects (limit to 10 for performance)
          try {
            const response = await apiService.projects.getProjects({ limit: 10, sortBy: 'updatedAt', sortOrder: 'desc' });
            let projects = [];
            if (Array.isArray(response)) {
              projects = response;
            } else if (response?.projects) {
              projects = response.projects;
            } else if (response?.data) {
              projects = response.data;
            }
            
            // Calculate status stats
            const statusStatsCalc = {
              'Completed': 0,
              'Ongoing': 0,
              'Not started': 0,
              'Stalled': 0,
              'Under Procurement': 0,
              'Suspended': 0,
              'Other': 0,
            };
            projects.forEach(p => {
              const normalized = normalizeProjectStatus(p.status);
              if (statusStatsCalc.hasOwnProperty(normalized)) {
                statusStatsCalc[normalized]++;
              } else {
                statusStatsCalc['Other']++;
              }
            });
            
            const recent = projects
              .filter(p => p?.id)
              .sort((a, b) => {
                const dateA = new Date(a?.updatedAt || a?.createdAt || a?.startDate || a?.start_date || 0);
                const dateB = new Date(b?.updatedAt || b?.createdAt || b?.startDate || b?.start_date || 0);
                return dateB - dateA;
              })
              .slice(0, 5)
              .map(p => ({
                id: p.id,
                projectName: p.projectName || p.project_name || 'Untitled Project',
                status: p.status || 'Unknown',
                createdAt: p.createdAt,
                startDate: p.startDate || p.start_date,
              }));
            setRecentProjects(recent);
            setAllProjects(projects); // Store all projects for status stats
          } catch (err) {
            setRecentProjects([]);
            setAllProjects([]);
          }
          return;
        }
        
        // Fallback: Get project list for status statistics (fetch more for accuracy)
        let response;
        try {
          response = await apiService.projects.getProjects({ limit: 500 }); // Fetch more projects for accurate status stats
        } catch (authErr) {
          try {
            const publicData = await apiService.public.getProjects({ limit: 50 });
            response = publicData.projects || publicData;
          } catch (pubErr) {
            throw authErr; // Use original error
          }
        }
        
        // Handle different response formats
        let projects = [];
        if (Array.isArray(response)) {
          projects = response;
        } else if (response?.projects) {
          projects = response.projects;
        } else if (response?.data) {
          projects = response.data;
        }
        
        if (projects.length === 0) {
          setProjectStats({ total: 0, active: 0, completed: 0, pending: 0, loading: false });
          setAllProjects([]);
          setRecentProjects([]);
          return;
        }
        
        // Helper function to normalize status
        const normalizeStatus = (status) => {
          if (!status) return '';
          return status.toLowerCase().trim();
        };
        
        // Count projects by status category
        const activeProjects = projects.filter(p => {
          const status = normalizeStatus(p?.status);
          return (status.includes('ongoing') && !status.includes('completed')) || 
                 status.includes('progress') || 
                 status === 'in progress' ||
                 status === 'on-going';
        });
        
        const completedProjects = projects.filter(p => {
          const status = normalizeStatus(p?.status);
          return status === 'completed' || 
                 status === 'complete' || 
                 (status.includes('completed') && !status.includes('ongoing')) ||
                 status.includes('final phase');
        });
        
        const pendingProjects = projects.filter(p => {
          const status = normalizeStatus(p?.status);
          return status === 'initiated' || 
                 status === 'pending' || 
                 status === 'not started' ||
                 status.includes('pending') || 
                 status.includes('initiated') ||
                 status === 'stalled' ||
                 status === 'delayed' ||
                 status.includes('tender') ||
                 status.includes('mobilizing');
        });
        
        const stats = {
          total: projects.length,
          active: activeProjects.length,
          completed: completedProjects.length,
          pending: pendingProjects.length,
        };
        
        setProjectStats({ ...stats, loading: false });
        setAllProjects(projects);
        
        // Get recent projects (last 5)
        const recent = projects
          .filter(p => p?.id)
          .sort((a, b) => {
            const dateA = new Date(a?.updatedAt || a?.createdAt || a?.startDate || a?.start_date || 0);
            const dateB = new Date(b?.updatedAt || b?.createdAt || b?.startDate || b?.start_date || 0);
            return dateB - dateA;
          })
          .slice(0, 5)
          .map(p => ({
            id: p.id,
            projectName: p.projectName || p.project_name || 'Untitled Project',
            status: p.status || 'Unknown',
            createdAt: p.createdAt,
            startDate: p.startDate || p.start_date,
          }));
        
        setRecentProjects(recent);
      } catch (error) {
        console.error('Error fetching project stats:', error);
        setProjectStats({ total: 0, active: 0, completed: 0, pending: 0, loading: false });
        setRecentProjects([]);
        setAllProjects([]);
      } finally {
        setLoadingProjects(false);
      }
    };

    fetchProjectStats();
  }, []);

  // Fetch notifications and pending approvals based on user role
  useEffect(() => {
    let isMounted = true;
    
    const fetchNotifications = async () => {
      if (!user) {
        if (isMounted) {
          setPendingUsers([]);
          setPendingProjects([]);
          setRecentUserApprovals([]);
          setProjectsPendingReview([]);
          setLoadingNotifications(false);
        }
        return;
      }
      
      if (isMounted) {
        setLoadingNotifications(true);
      }

      try {
        const promises = [];

        // Fetch pending users if user has approval privileges
        if (canApproveUsers) {
          promises.push(
            apiService.users.getPendingUsers().catch(err => {
              console.error('Error fetching pending users:', err);
              return [];
            })
          );
        } else {
          promises.push(Promise.resolve([]));
        }

        // Fetch pending projects (projects needing approval)
        if (canManageProjects) {
          promises.push(
            apiService.projects.getProjects({ 
              status: 'Pending Approval',
              limit: 10 
            }).catch(err => {
              console.error('Error fetching pending projects:', err);
              return [];
            })
          );
          // Fetch projects pending review
          promises.push(
            apiService.projects.getProjects({ 
              status: 'Pending Review',
              limit: 10 
            }).catch(err => {
              console.error('Error fetching projects pending review:', err);
              return [];
            })
          );
        } else {
          promises.push(Promise.resolve([]));
          promises.push(Promise.resolve([]));
        }
        
        // Fetch recent user approvals
        if (canApproveUsers) {
          promises.push(
            apiService.users.getApprovedUsersSummary({ 
              limit: 5
            }).catch(err => {
              console.error('Error fetching recent user approvals:', err);
              return [];
            })
          );
        } else {
          promises.push(Promise.resolve([]));
        }

        const [usersData, projectsPendingApprovalData, projectsPendingReviewData, recentApprovalsData] = await Promise.all(promises);
        
        if (!isMounted) return;
        
        setPendingUsers(Array.isArray(usersData) ? usersData : []);
        
        // Handle pending approval projects
        let pendingApprovalProjects = [];
        if (Array.isArray(projectsPendingApprovalData)) {
          pendingApprovalProjects = projectsPendingApprovalData;
        } else if (projectsPendingApprovalData?.projects) {
          pendingApprovalProjects = projectsPendingApprovalData.projects;
        } else if (projectsPendingApprovalData?.data) {
          pendingApprovalProjects = projectsPendingApprovalData.data;
        }
        
        // Filter for projects that need approval
        const pending = pendingApprovalProjects.filter(p => {
          const status = (p.status || p.Status || '').toLowerCase();
          return status.includes('pending approval') || 
                 status === 'pending approval' ||
                 (p.approved_for_public === false || p.approved_for_public === 0);
        });
        
        setPendingProjects(pending.slice(0, 5));
        
        // Handle pending review projects
        let pendingReviewProjects = [];
        if (Array.isArray(projectsPendingReviewData)) {
          pendingReviewProjects = projectsPendingReviewData;
        } else if (projectsPendingReviewData?.projects) {
          pendingReviewProjects = projectsPendingReviewData.projects;
        } else if (projectsPendingReviewData?.data) {
          pendingReviewProjects = projectsPendingReviewData.data;
        }
        
        // Filter for projects that need review
        const review = pendingReviewProjects.filter(p => {
          const status = (p.status || p.Status || '').toLowerCase();
          return status.includes('pending review') || 
                 status.includes('under review') ||
                 status === 'pending review';
        });
        
        setProjectsPendingReview(review.slice(0, 5));
        
        // Handle recent user approvals
        let recentApprovals = [];
        if (Array.isArray(recentApprovalsData)) {
          recentApprovals = recentApprovalsData;
        } else if (recentApprovalsData?.users) {
          recentApprovals = recentApprovalsData.users;
        } else if (recentApprovalsData?.data) {
          recentApprovals = recentApprovalsData.data;
        }
        
        setRecentUserApprovals(recentApprovals.slice(0, 5));
      } catch (error) {
        console.error('Error fetching notifications:', error);
        if (isMounted) {
          setPendingUsers([]);
          setPendingProjects([]);
          setRecentUserApprovals([]);
          setProjectsPendingReview([]);
        }
      } finally {
        if (isMounted) {
          setLoadingNotifications(false);
        }
      }
    };

    fetchNotifications();

    return () => {
      isMounted = false;
    };
  }, [user?.userId, canApproveUsers, canManageProjects]);




  // Prepare notification items - Always show the three sections
  const notificationItems = [];
  
  // Pending User Approvals (show first)
  if (canApproveUsers) {
    notificationItems.push({
      type: 'pending-user-approvals',
      title: 'Pending User Approvals',
      count: pendingUsers.length,
      icon: <PersonAddIcon />,
      color: '#f44336',
      route: `${ROUTES.USER_MANAGEMENT}?pending=true`,
      description: pendingUsers.length > 0
        ? `${pendingUsers.length} user${pendingUsers.length > 1 ? 's' : ''} waiting for approval`
        : 'No pending user approvals',
    });
  }

  // Recent User Approvals
  if (canApproveUsers) {
    notificationItems.push({
      type: 'recent-approvals',
      title: 'Recent User Approvals',
      count: recentUserApprovals.length,
      icon: <CheckCircleIcon />,
      color: '#4caf50',
      route: ROUTES.USER_MANAGEMENT,
      description: recentUserApprovals.length > 0 
        ? `${recentUserApprovals.length} user${recentUserApprovals.length > 1 ? 's' : ''} recently approved`
        : 'No recent approvals',
    });
  }
  
  // Projects Pending Approval
  if (canManageProjects) {
    notificationItems.push({
      type: 'projects-pending-approval',
      title: 'Projects Pending Approval',
      count: pendingProjects.length,
      icon: <PendingActionsIcon />,
      color: '#ff9800',
      route: ROUTES.PROJECTS,
      description: pendingProjects.length > 0
        ? `${pendingProjects.length} project${pendingProjects.length > 1 ? 's' : ''} waiting for approval`
        : 'No projects pending approval',
    });
  }
  
  // Projects Pending Review
  if (canManageProjects) {
    notificationItems.push({
      type: 'projects-pending-review',
      title: 'Projects Pending Review',
      count: projectsPendingReview.length,
      icon: <AssignmentIndIcon />,
      color: '#2196f3',
      route: ROUTES.PROJECTS,
      description: projectsPendingReview.length > 0
        ? `${projectsPendingReview.length} project${projectsPendingReview.length > 1 ? 's' : ''} under review`
        : 'No projects pending review',
    });
  }

  const metrics = dashboardData?.metrics || {};
  const recentActivity = dashboardData?.recentActivity || [];
  
  // Calculate status statistics from allProjects
  const colors = tokens(theme.palette.mode);
  const isLight = theme.palette.mode === 'light';
  const ui = {
    elevatedShadow: isLight ? '0 1px 6px rgba(0,0,0,0.06)' : '0 4px 20px rgba(0, 0, 0, 0.15), 0 -2px 10px rgba(0, 0, 0, 0.1)'
  };

  const statusStats = useMemo(() => {
    if (!allProjects || allProjects.length === 0) {
      return {
        'Completed': 0,
        'Ongoing': 0,
        'Not started': 0,
        'Stalled': 0,
        'Under Procurement': 0,
        'Suspended': 0,
        'Other': 0,
        totalProjects: 0
      };
    }

    const stats = {
      'Completed': 0,
      'Ongoing': 0,
      'Not started': 0,
      'Stalled': 0,
      'Under Procurement': 0,
      'Suspended': 0,
      'Other': 0,
      totalProjects: allProjects.length
    };

    allProjects.forEach(p => {
      const normalized = normalizeProjectStatus(p.status);
      if (stats.hasOwnProperty(normalized)) {
        stats[normalized]++;
      } else {
        stats['Other']++;
      }
    });

    return stats;
  }, [allProjects]);

  // Handler to open modal with projects for a specific status
  const handleStatusClick = async (status) => {
    setSelectedStatus(status);
    setStatusModalOpen(true);
    setLoadingStatusProjects(true);
    
    try {
      // Fetch all projects with this status
      const response = await apiService.projects.getProjects({ 
        limit: 1000 // Get a large number to show all projects
      });
      
      let projects = [];
      if (Array.isArray(response)) {
        projects = response;
      } else if (response?.projects) {
        projects = response.projects;
      } else if (response?.data) {
        projects = response.data;
      }
      
      // Filter projects by normalized status
      const filtered = projects.filter(p => {
        const normalized = normalizeProjectStatus(p.status);
        return normalized === status;
      });
      
      setStatusProjects(filtered);
    } catch (error) {
      console.error('Error fetching status projects:', error);
      setStatusProjects([]);
    } finally {
      setLoadingStatusProjects(false);
    }
  };

  // Calculate metrics from actual project data
  const actualMetrics = {
    totalProjects: projectStats.total || 0,
    activeProjects: projectStats.active || 0,
    completedProjects: projectStats.completed || 0,
    pendingApprovals: 0, // Payment requests feature removed
    budgetUtilization: metrics.budgetUtilization || 0,
    teamMembers: metrics.teamMembers || 0,
  };

  return (
    <Box
      sx={{
        minHeight: 'calc(100vh - 48px)',
        background: 'linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%)',
        py: { xs: 1, md: 1.5 },
      }}
    >
      <Container maxWidth="xl">
        {/* Header Section - Subtle */}
        <Paper
          elevation={0}
          sx={{
            p: { xs: 0.75, md: 1 },
            mb: 1,
            borderRadius: 1.5,
            background: 'transparent',
            border: '1px solid',
            borderColor: 'divider',
            bgcolor: 'background.paper',
          }}
        >
          <Box display="flex" justifyContent="space-between" alignItems="center" gap={1.5}>
            <Box flex={1}>
              <Box display="flex" alignItems="center" gap={1} mb={0.25}>
                <Typography variant="subtitle2" sx={{ fontWeight: 600, fontSize: { xs: '0.875rem', md: '0.9375rem' }, color: 'text.primary' }}>
                  Welcome back, {user?.username || 'User'}
                </Typography>
                <Chip
                  label={user?.roleName || 'User'}
                  size="small"
                  sx={{
                    bgcolor: 'primary.main',
                    color: 'white',
                    fontWeight: '500',
                    fontSize: '0.7rem',
                    height: '20px',
                  }}
                />
              </Box>
              <Typography 
                variant="caption" 
                sx={{ 
                  color: 'text.secondary',
                  fontSize: { xs: '0.7rem', md: '0.75rem' },
                  fontWeight: 400,
                }}
              >
                Here's what's happening in your system today
              </Typography>
            </Box>
            <IconButton
              onClick={refreshDashboard}
              disabled={refreshing}
              size="small"
              sx={{
                color: 'text.secondary',
                width: { xs: 28, md: 32 },
                height: { xs: 28, md: 32 },
                '&:hover': { 
                  bgcolor: 'action.hover',
                  transform: 'rotate(180deg)',
                },
                transition: 'all 0.3s ease-in-out',
              }}
            >
              <RefreshIcon sx={{ fontSize: { xs: 16, md: 18 } }} />
            </IconButton>
          </Box>
        </Paper>

        {/* Status Overview Cards - Matching Project Management Page */}
        <Box
          sx={{
            mb: 2,
            overflowX: 'auto',
            '&::-webkit-scrollbar': {
              height: '8px',
            },
            '&::-webkit-scrollbar-track': {
              background: isLight ? colors.grey[100] : colors.grey[800],
              borderRadius: '4px',
            },
            '&::-webkit-scrollbar-thumb': {
              background: isLight ? colors.grey[400] : colors.grey[600],
              borderRadius: '4px',
              '&:hover': {
                background: isLight ? colors.grey[500] : colors.grey[500],
              },
            },
          }}
        >
          <Grid container spacing={1} sx={{ display: 'flex', flexWrap: 'nowrap', pb: 1 }}>
            {/* Completed */}
            <Grid item sx={{ minWidth: { xs: '110px', sm: '130px', md: '145px' }, flex: '0 0 auto' }}>
              <Card 
                onClick={() => handleStatusClick('Completed')}
                sx={{ 
                  height: '100%',
                  background: isLight 
                    ? 'linear-gradient(135deg, #4caf50 0%, #81c784 100%)'
                    : `linear-gradient(135deg, ${colors.greenAccent[800]}, ${colors.greenAccent[700]})`,
                  color: isLight ? 'white' : 'inherit',
                  borderTop: `2px solid ${isLight ? '#388e3c' : colors.greenAccent[500]}`,
                  boxShadow: ui.elevatedShadow,
                  transition: 'all 0.2s ease-in-out',
                  cursor: 'pointer',
                  borderRadius: '8px',
                  '&:hover': {
                    transform: 'translateY(-2px) scale(1.02)',
                    boxShadow: isLight ? '0 4px 12px rgba(76, 175, 80, 0.3)' : '0 4px 16px rgba(0, 0, 0, 0.25)',
                  }
                }}
              >
                <CardContent sx={{ p: 0.75, '&:last-child': { pb: 0.75 }, pt: 0.75 }}>
                  <Box display="flex" alignItems="center" justifyContent="space-between" mb={0.25}>
                    <Typography variant="caption" sx={{ color: isLight ? 'rgba(255, 255, 255, 0.9)' : colors.grey[100], fontWeight: 600, fontSize: '0.65rem' }}>
                      Completed
                    </Typography>
                    <CheckCircleIcon sx={{ color: isLight ? 'rgba(255, 255, 255, 0.9)' : colors.greenAccent[500], fontSize: 14 }} />
                  </Box>
                  <Typography variant="h5" sx={{ color: isLight ? '#ffffff' : '#fff', fontWeight: 'bold', fontSize: '1rem', mb: 0, lineHeight: 1.1 }}>
                    {loadingProjects ? <CircularProgress size={16} sx={{ color: 'white' }} /> : statusStats['Completed'] || 0}
                  </Typography>
                  <Typography variant="caption" sx={{ color: isLight ? 'rgba(255, 255, 255, 0.8)' : colors.grey[300], fontWeight: 400, fontSize: '0.6rem', mt: 0.125 }}>
                    {statusStats.totalProjects > 0 
                      ? Math.round((statusStats['Completed'] || 0) / statusStats.totalProjects * 100) 
                      : 0}%
                  </Typography>
                </CardContent>
              </Card>
            </Grid>

            {/* Ongoing */}
            <Grid item sx={{ minWidth: { xs: '110px', sm: '130px', md: '145px' }, flex: '0 0 auto' }}>
              <Card 
                onClick={() => handleStatusClick('Ongoing')}
                sx={{ 
                  height: '100%',
                  background: isLight 
                    ? 'linear-gradient(135deg, #2196f3 0%, #42a5f5 100%)'
                    : `linear-gradient(135deg, ${colors.blueAccent[800]}, ${colors.blueAccent[700]})`,
                  color: isLight ? 'white' : 'inherit',
                  borderTop: `2px solid ${isLight ? '#1976d2' : colors.blueAccent[500]}`,
                  boxShadow: ui.elevatedShadow,
                  transition: 'all 0.2s ease-in-out',
                  cursor: 'pointer',
                  borderRadius: '8px',
                  '&:hover': {
                    transform: 'translateY(-2px) scale(1.02)',
                    boxShadow: isLight ? '0 4px 12px rgba(33, 150, 243, 0.3)' : '0 4px 16px rgba(0, 0, 0, 0.25)',
                  }
                }}
              >
                <CardContent sx={{ p: 0.75, '&:last-child': { pb: 0.75 }, pt: 0.75 }}>
                  <Box display="flex" alignItems="center" justifyContent="space-between" mb={0.25}>
                    <Typography variant="caption" sx={{ color: isLight ? 'rgba(255, 255, 255, 0.9)' : colors.grey[100], fontWeight: 600, fontSize: '0.65rem' }}>
                      Ongoing
                    </Typography>
                    <PlayArrowIcon sx={{ color: isLight ? 'rgba(255, 255, 255, 0.9)' : colors.blueAccent[500], fontSize: 14 }} />
                  </Box>
                  <Typography variant="h5" sx={{ color: isLight ? '#ffffff' : '#fff', fontWeight: 'bold', fontSize: '1rem', mb: 0, lineHeight: 1.1 }}>
                    {loadingProjects ? <CircularProgress size={16} sx={{ color: 'white' }} /> : statusStats['Ongoing'] || 0}
                  </Typography>
                  <Typography variant="caption" sx={{ color: isLight ? 'rgba(255, 255, 255, 0.8)' : colors.grey[300], fontWeight: 400, fontSize: '0.6rem', mt: 0.125 }}>
                    {statusStats.totalProjects > 0 
                      ? Math.round((statusStats['Ongoing'] || 0) / statusStats.totalProjects * 100) 
                      : 0}%
                  </Typography>
                </CardContent>
              </Card>
            </Grid>

            {/* Not started */}
            <Grid item sx={{ minWidth: { xs: '110px', sm: '130px', md: '145px' }, flex: '0 0 auto' }}>
              <Card 
                onClick={() => handleStatusClick('Not started')}
                sx={{ 
                  height: '100%',
                  background: isLight 
                    ? 'linear-gradient(135deg, #9e9e9e 0%, #bdbdbd 100%)'
                    : `linear-gradient(135deg, ${colors.grey[800]}, ${colors.grey[700]})`,
                  color: isLight ? 'white' : 'inherit',
                  borderTop: `2px solid ${isLight ? '#616161' : colors.grey[500]}`,
                  boxShadow: ui.elevatedShadow,
                  transition: 'all 0.2s ease-in-out',
                  cursor: 'pointer',
                  borderRadius: '8px',
                  '&:hover': {
                    transform: 'translateY(-2px) scale(1.02)',
                    boxShadow: isLight ? '0 4px 12px rgba(158, 158, 158, 0.3)' : '0 4px 16px rgba(0, 0, 0, 0.25)',
                  }
                }}
              >
                <CardContent sx={{ p: 0.75, '&:last-child': { pb: 0.75 }, pt: 0.75 }}>
                  <Box display="flex" alignItems="center" justifyContent="space-between" mb={0.25}>
                    <Typography variant="caption" sx={{ color: isLight ? 'rgba(255, 255, 255, 0.9)' : colors.grey[100], fontWeight: 600, fontSize: '0.65rem' }}>
                      Not Started
                    </Typography>
                    <ScheduleIcon sx={{ color: isLight ? 'rgba(255, 255, 255, 0.9)' : colors.grey[400], fontSize: 14 }} />
                  </Box>
                  <Typography variant="h5" sx={{ color: isLight ? '#ffffff' : '#fff', fontWeight: 'bold', fontSize: '1rem', mb: 0, lineHeight: 1.1 }}>
                    {loadingProjects ? <CircularProgress size={16} sx={{ color: 'white' }} /> : statusStats['Not started'] || 0}
                  </Typography>
                  <Typography variant="caption" sx={{ color: isLight ? 'rgba(255, 255, 255, 0.8)' : colors.grey[300], fontWeight: 400, fontSize: '0.6rem', mt: 0.125 }}>
                    {statusStats.totalProjects > 0 
                      ? Math.round((statusStats['Not started'] || 0) / statusStats.totalProjects * 100) 
                      : 0}%
                  </Typography>
                </CardContent>
              </Card>
            </Grid>

            {/* Stalled */}
            <Grid item sx={{ minWidth: { xs: '110px', sm: '130px', md: '145px' }, flex: '0 0 auto' }}>
              <Card 
                onClick={() => handleStatusClick('Stalled')}
                sx={{ 
                  height: '100%',
                  background: isLight 
                    ? 'linear-gradient(135deg, #ff9800 0%, #ffb74d 100%)'
                    : `linear-gradient(135deg, ${colors.orange?.[800] || colors.yellowAccent[800]}, ${colors.orange?.[700] || colors.yellowAccent[700]})`,
                  color: isLight ? 'white' : 'inherit',
                  borderTop: `2px solid ${isLight ? '#f57c00' : colors.orange?.[500] || colors.yellowAccent[500]}`,
                  boxShadow: ui.elevatedShadow,
                  transition: 'all 0.2s ease-in-out',
                  cursor: 'pointer',
                  borderRadius: '8px',
                  '&:hover': {
                    transform: 'translateY(-2px) scale(1.02)',
                    boxShadow: isLight ? '0 4px 12px rgba(255, 152, 0, 0.3)' : '0 4px 16px rgba(0, 0, 0, 0.25)',
                  }
                }}
              >
                <CardContent sx={{ p: 0.75, '&:last-child': { pb: 0.75 }, pt: 0.75 }}>
                  <Box display="flex" alignItems="center" justifyContent="space-between" mb={0.25}>
                    <Typography variant="caption" sx={{ color: isLight ? 'rgba(255, 255, 255, 0.9)' : colors.grey[100], fontWeight: 600, fontSize: '0.65rem' }}>
                      Stalled
                    </Typography>
                    <PauseIcon sx={{ color: isLight ? 'rgba(255, 255, 255, 0.9)' : colors.orange?.[400] || colors.yellowAccent[400], fontSize: 14 }} />
                  </Box>
                  <Typography variant="h5" sx={{ color: isLight ? '#ffffff' : '#fff', fontWeight: 'bold', fontSize: '1rem', mb: 0, lineHeight: 1.1 }}>
                    {loadingProjects ? <CircularProgress size={16} sx={{ color: 'white' }} /> : statusStats['Stalled'] || 0}
                  </Typography>
                  <Typography variant="caption" sx={{ color: isLight ? 'rgba(255, 255, 255, 0.8)' : colors.grey[300], fontWeight: 400, fontSize: '0.6rem', mt: 0.125 }}>
                    {statusStats.totalProjects > 0 
                      ? Math.round((statusStats['Stalled'] || 0) / statusStats.totalProjects * 100) 
                      : 0}%
                  </Typography>
                </CardContent>
              </Card>
            </Grid>

            {/* Under Procurement */}
            <Grid item sx={{ minWidth: { xs: '110px', sm: '130px', md: '145px' }, flex: '0 0 auto' }}>
              <Card 
                onClick={() => handleStatusClick('Under Procurement')}
                sx={{ 
                  height: '100%',
                  background: isLight 
                    ? 'linear-gradient(135deg, #9c27b0 0%, #ba68c8 100%)'
                    : `linear-gradient(135deg, ${colors.purple?.[800] || colors.blueAccent[800]}, ${colors.purple?.[700] || colors.blueAccent[700]})`,
                  color: isLight ? 'white' : 'inherit',
                  borderTop: `2px solid ${isLight ? '#7b1fa2' : colors.purple?.[500] || colors.blueAccent[500]}`,
                  boxShadow: ui.elevatedShadow,
                  transition: 'all 0.2s ease-in-out',
                  cursor: 'pointer',
                  borderRadius: '8px',
                  '&:hover': {
                    transform: 'translateY(-2px) scale(1.02)',
                    boxShadow: isLight ? '0 4px 12px rgba(156, 39, 176, 0.3)' : '0 4px 16px rgba(0, 0, 0, 0.25)',
                  }
                }}
              >
                <CardContent sx={{ p: 0.75, '&:last-child': { pb: 0.75 }, pt: 0.75 }}>
                  <Box display="flex" alignItems="center" justifyContent="space-between" mb={0.25}>
                    <Typography variant="caption" sx={{ color: isLight ? 'rgba(255, 255, 255, 0.9)' : colors.grey[100], fontWeight: 600, fontSize: '0.65rem' }}>
                      Under Procurement
                    </Typography>
                    <HourglassIcon sx={{ color: isLight ? 'rgba(255, 255, 255, 0.9)' : colors.purple?.[400] || colors.blueAccent[400], fontSize: 14 }} />
                  </Box>
                  <Typography variant="h5" sx={{ color: isLight ? '#ffffff' : '#fff', fontWeight: 'bold', fontSize: '1rem', mb: 0, lineHeight: 1.1 }}>
                    {loadingProjects ? <CircularProgress size={16} sx={{ color: 'white' }} /> : statusStats['Under Procurement'] || 0}
                  </Typography>
                  <Typography variant="caption" sx={{ color: isLight ? 'rgba(255, 255, 255, 0.8)' : colors.grey[300], fontWeight: 400, fontSize: '0.6rem', mt: 0.125 }}>
                    {statusStats.totalProjects > 0 
                      ? Math.round((statusStats['Under Procurement'] || 0) / statusStats.totalProjects * 100) 
                      : 0}%
                  </Typography>
                </CardContent>
              </Card>
            </Grid>

            {/* Suspended */}
            <Grid item sx={{ minWidth: { xs: '110px', sm: '130px', md: '145px' }, flex: '0 0 auto' }}>
              <Card 
                onClick={() => handleStatusClick('Suspended')}
                sx={{ 
                  height: '100%',
                  background: isLight 
                    ? 'linear-gradient(135deg, #f44336 0%, #e57373 100%)'
                    : `linear-gradient(135deg, ${colors.redAccent[800]}, ${colors.redAccent[700]})`,
                  color: isLight ? 'white' : 'inherit',
                  borderTop: `2px solid ${isLight ? '#d32f2f' : colors.redAccent[500]}`,
                  boxShadow: ui.elevatedShadow,
                  transition: 'all 0.2s ease-in-out',
                  cursor: 'pointer',
                  borderRadius: '8px',
                  '&:hover': {
                    transform: 'translateY(-2px) scale(1.02)',
                    boxShadow: isLight ? '0 4px 12px rgba(244, 67, 54, 0.3)' : '0 4px 16px rgba(0, 0, 0, 0.25)',
                  }
                }}
              >
                <CardContent sx={{ p: 0.75, '&:last-child': { pb: 0.75 }, pt: 0.75 }}>
                  <Box display="flex" alignItems="center" justifyContent="space-between" mb={0.25}>
                    <Typography variant="caption" sx={{ color: isLight ? 'rgba(255, 255, 255, 0.9)' : colors.grey[100], fontWeight: 600, fontSize: '0.65rem' }}>
                      Suspended
                    </Typography>
                    <WarningIcon sx={{ color: isLight ? 'rgba(255, 255, 255, 0.9)' : colors.redAccent[500], fontSize: 14 }} />
                  </Box>
                  <Typography variant="h5" sx={{ color: isLight ? '#ffffff' : '#fff', fontWeight: 'bold', fontSize: '1rem', mb: 0, lineHeight: 1.1 }}>
                    {loadingProjects ? <CircularProgress size={16} sx={{ color: 'white' }} /> : statusStats['Suspended'] || 0}
                  </Typography>
                  <Typography variant="caption" sx={{ color: isLight ? 'rgba(255, 255, 255, 0.8)' : colors.grey[300], fontWeight: 400, fontSize: '0.6rem', mt: 0.125 }}>
                    {statusStats.totalProjects > 0 
                      ? Math.round((statusStats['Suspended'] || 0) / statusStats.totalProjects * 100) 
                      : 0}%
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </Box>

        {/* Main Content Grid - Better Space Utilization */}
        <Grid container spacing={2}>
          {/* Notifications & Pending Approvals - Left Column */}
          <Grid item xs={12} md={4}>
            <Card 
              elevation={0} 
              sx={{ 
                borderRadius: 2, 
                height: '100%',
                transition: 'all 0.3s ease',
                background: theme.palette.mode === 'dark'
                  ? `linear-gradient(135deg, ${colors.orange[800]}15 0%, ${colors.yellowAccent[800]}15 50%, ${colors.orange[700]}15 100%)`
                  : `linear-gradient(135deg, ${colors.orange[50]} 0%, ${colors.yellowAccent[50]} 50%, ${colors.orange[100]} 100%)`,
                border: `1px solid ${theme.palette.mode === 'dark' ? colors.orange[700] + '40' : colors.orange[200]}`,
                position: 'relative',
                overflow: 'hidden',
                '&::before': {
                  content: '""',
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  height: '4px',
                  background: `linear-gradient(90deg, ${colors.orange[500]}, ${colors.yellowAccent[500]}, ${colors.orange[500]})`,
                },
                '&:hover': {
                  boxShadow: `0 8px 24px ${colors.orange[500]}25`,
                  transform: 'translateY(-2px)',
                }
              }}
            >
              <CardContent sx={{ p: 2, position: 'relative', zIndex: 1 }}>
                <Box display="flex" alignItems="center" gap={1} mb={1.5}>
                  <Box sx={{ 
                    p: 0.75, 
                    borderRadius: 1, 
                    background: `linear-gradient(135deg, ${colors.orange[500]}, ${colors.yellowAccent[500]})`,
                    color: 'white', 
                    display: 'flex', 
                    alignItems: 'center',
                    boxShadow: `0 2px 8px ${colors.orange[500]}40`,
                  }}>
                    <NotificationsActiveIcon sx={{ fontSize: 20 }} />
                  </Box>
                  <Typography variant="h6" sx={{ fontWeight: 'bold', fontSize: '1rem', color: 'text.primary' }}>
                    Notifications & Approvals
                  </Typography>
                </Box>
                {loadingNotifications ? (
                  <Box display="flex" justifyContent="center" p={2}>
                    <CircularProgress size={24} />
                  </Box>
                ) : (
                  <Box>
                    {notificationItems.map((item, index) => (
                      <Card
                        key={index}
                        elevation={0}
                        sx={{
                          mb: 1.5,
                          borderRadius: 1.5,
                          border: '1px solid',
                          borderColor: item.count > 0 ? `${item.color}40` : 'divider',
                          bgcolor: item.count > 0 ? `${item.color}08` : 'transparent',
                          cursor: item.route ? 'pointer' : 'default',
                          transition: 'all 0.3s ease',
                          '&:hover': item.route ? {
                            transform: 'translateX(4px)',
                            boxShadow: `0 2px 8px ${item.color}30`,
                          } : {},
                        }}
                        onClick={() => item.route && navigate(item.route)}
                      >
                        <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                          <Box display="flex" alignItems="center" gap={1.5}>
                            <Box
                              sx={{
                                p: 1,
                                borderRadius: 1,
                                bgcolor: item.count > 0 ? `${item.color}20` : 'action.disabledBackground',
                                color: item.count > 0 ? item.color : 'text.disabled',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}
                            >
                              {item.icon}
                            </Box>
                            <Box flex={1}>
                              <Box display="flex" alignItems="center" gap={1} mb={0.5}>
                                <Typography variant="subtitle2" sx={{ fontWeight: 600, fontSize: '0.875rem' }}>
                                  {item.title}
                                </Typography>
                                {item.count > 0 && (
                                  <Badge
                                    badgeContent={item.count}
                                    color="error"
                                    sx={{
                                      '& .MuiBadge-badge': {
                                        fontSize: '0.7rem',
                                        minWidth: '18px',
                                        height: '18px',
                                        borderRadius: '9px',
                                      },
                                    }}
                                  />
                                )}
                              </Box>
                              <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.75rem' }}>
                                {item.description}
                              </Typography>
                            </Box>
                            {item.route && (
                              <ArrowForwardIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
                            )}
                          </Box>
                        </CardContent>
                      </Card>
                    ))}
                    
                    {/* Additional quick actions if no pending items */}
                    {notificationItems.length === 1 && notificationItems[0].count === 0 && (
                      <Box mt={2}>
                        <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.75rem', display: 'block', mb: 1 }}>
                          Quick Actions:
                        </Typography>
                        <Grid container spacing={1}>
                          <Grid item xs={6}>
                            <Button
                              fullWidth
                              variant="outlined"
                              size="small"
                              startIcon={<ProjectsIcon />}
                              onClick={() => navigate(ROUTES.PROJECTS)}
                              sx={{ textTransform: 'none', fontSize: '0.75rem' }}
                            >
                              Projects
                            </Button>
                          </Grid>
                          <Grid item xs={6}>
                            <Button
                              fullWidth
                              variant="outlined"
                              size="small"
                              startIcon={<ReportsIcon />}
                              onClick={() => navigate(ROUTES.REPORTS)}
                              sx={{ textTransform: 'none', fontSize: '0.75rem' }}
                            >
                              Reports
                            </Button>
                          </Grid>
                        </Grid>
                      </Box>
                    )}
                  </Box>
                )}
              </CardContent>
            </Card>
          </Grid>

          {/* Recent Projects */}
          <Grid item xs={12} md={4}>
            <Card 
              elevation={0} 
              sx={{ 
                borderRadius: 2, 
                height: '100%',
                transition: 'all 0.3s ease',
                background: theme.palette.mode === 'dark'
                  ? `linear-gradient(135deg, ${colors.blueAccent[800]}20 0%, ${colors.blueAccent[700]}20 50%, ${colors.blueAccent[900]}20 100%)`
                  : `linear-gradient(135deg, ${colors.blueAccent[50]} 0%, ${colors.blueAccent[100]} 50%, ${colors.blueAccent[50]} 100%)`,
                border: `1px solid ${theme.palette.mode === 'dark' ? colors.blueAccent[700] + '40' : colors.blueAccent[200]}`,
                position: 'relative',
                overflow: 'hidden',
                '&::before': {
                  content: '""',
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  height: '4px',
                  background: `linear-gradient(90deg, ${colors.blueAccent[500]}, ${colors.blueAccent[400]}, ${colors.blueAccent[500]})`,
                },
                '&:hover': {
                  boxShadow: `0 8px 24px ${colors.blueAccent[500]}25`,
                  transform: 'translateY(-2px)',
                }
              }}
            >
              <CardContent sx={{ p: 2, position: 'relative', zIndex: 1 }}>
                <Box display="flex" justifyContent="space-between" alignItems="center" mb={1.5}>
                  <Box display="flex" alignItems="center" gap={1}>
                    <Box sx={{ 
                      p: 0.75, 
                      borderRadius: 1, 
                      background: `linear-gradient(135deg, ${colors.blueAccent[500]}, ${colors.blueAccent[400]})`,
                      color: 'white', 
                      display: 'flex', 
                      alignItems: 'center',
                      boxShadow: `0 2px 8px ${colors.blueAccent[500]}40`,
                    }}>
                      <ProjectsIcon sx={{ fontSize: 18 }} />
                    </Box>
                    <Typography variant="h6" sx={{ fontWeight: 'bold', fontSize: '1rem', color: 'text.primary' }}>
                      Recent Projects
                    </Typography>
                  </Box>
                  <Button
                    size="small"
                    endIcon={<ArrowForwardIcon />}
                    onClick={() => navigate(ROUTES.PROJECTS)}
                    sx={{ 
                      textTransform: 'none',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      minWidth: 'auto',
                      px: 1,
                    }}
                  >
                    View All
                  </Button>
                </Box>
                {loadingProjects ? (
                  <Box display="flex" justifyContent="center" p={2}>
                    <CircularProgress size={24} />
                  </Box>
                ) : recentProjects.length > 0 ? (
                  <List sx={{ p: 0 }}>
                    {recentProjects.map((project, index) => (
                      <React.Fragment key={project.id || index}>
                        <ListItem
                          button
                          onClick={() => navigate(`${ROUTES.PROJECTS}/${project.id}`)}
                          sx={{
                            borderRadius: 1,
                            mb: 0.5,
                            px: 1,
                            py: 0.75,
                            '&:hover': {
                              bgcolor: 'action.hover',
                            },
                          }}
                        >
                          <ListItemIcon sx={{ minWidth: 36 }}>
                            <ProjectsIcon sx={{ color: '#1976d2', fontSize: 18 }} />
                          </ListItemIcon>
                          <ListItemText
                            primary={project.projectName || 'Untitled Project'}
                            secondary={project.status || 'Unknown Status'}
                            primaryTypographyProps={{
                              variant: 'body2',
                              fontWeight: 600,
                              fontSize: '0.875rem',
                            }}
                            secondaryTypographyProps={{
                              variant: 'caption',
                              fontSize: '0.75rem',
                            }}
                          />
                        </ListItem>
                        {index < recentProjects.length - 1 && <Divider sx={{ mx: 1 }} />}
                      </React.Fragment>
                    ))}
                  </List>
                ) : (
                  <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 3 }}>
                    No recent projects
                  </Typography>
                )}
              </CardContent>
            </Card>
          </Grid>

          {/* Quick Actions */}
          <Grid item xs={12} md={4}>
                <Card 
                  elevation={0} 
                  sx={{ 
                    borderRadius: 2, 
                    height: '100%',
                    transition: 'all 0.3s ease',
                    background: theme.palette.mode === 'dark'
                      ? `linear-gradient(135deg, ${colors.greenAccent[800]}20 0%, ${colors.blueAccent[800]}20 50%, ${colors.greenAccent[700]}20 100%)`
                      : `linear-gradient(135deg, ${colors.greenAccent[50]} 0%, ${colors.blueAccent[50]} 50%, ${colors.greenAccent[100]} 100%)`,
                    border: `1px solid ${theme.palette.mode === 'dark' ? colors.greenAccent[700] + '40' : colors.greenAccent[200]}`,
                    position: 'relative',
                    overflow: 'hidden',
                    '&::before': {
                      content: '""',
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      right: 0,
                      height: '4px',
                      background: `linear-gradient(90deg, ${colors.greenAccent[500]}, ${colors.blueAccent[500]}, ${colors.greenAccent[500]})`,
                    },
                    '&:hover': {
                      boxShadow: `0 8px 24px ${colors.greenAccent[500]}25`,
                      transform: 'translateY(-2px)',
                    }
                  }}
                >
                  <CardContent sx={{ p: 1.5, position: 'relative', zIndex: 1 }}>
                    <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
                      <Box display="flex" alignItems="center" gap={1}>
                        <Box sx={{ 
                          p: 0.5, 
                          borderRadius: 1, 
                          background: `linear-gradient(135deg, ${colors.greenAccent[500]}, ${colors.blueAccent[500]})`,
                          color: 'white', 
                          display: 'flex', 
                          alignItems: 'center',
                          boxShadow: `0 2px 8px ${colors.greenAccent[500]}40`,
                        }}>
                          <AnalyticsIcon sx={{ fontSize: 16 }} />
                        </Box>
                        <Typography variant="h6" sx={{ fontWeight: 'bold', fontSize: '0.9rem', color: 'text.primary' }}>
                          Quick Actions
                        </Typography>
                      </Box>
                    </Box>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                      {/* Approve Users */}
                      {canApproveUsers && (
                        <Button
                          fullWidth
                          variant="outlined"
                          startIcon={<CheckCircleIcon />}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            navigate(ROUTES.USER_MANAGEMENT, { replace: false });
                          }}
                          sx={{
                            textTransform: 'none',
                            justifyContent: 'flex-start',
                            p: 1,
                            borderRadius: 1.5,
                            borderColor: colors.greenAccent[500],
                            color: colors.greenAccent[600],
                            bgcolor: theme.palette.mode === 'dark' ? colors.greenAccent[900] + '20' : colors.greenAccent[50],
                            minHeight: 40,
                            '&:hover': {
                              background: `linear-gradient(135deg, ${colors.greenAccent[500]}, ${colors.greenAccent[400]})`,
                              color: 'white',
                              borderColor: colors.greenAccent[500],
                              boxShadow: `0 4px 12px ${colors.greenAccent[500]}30`,
                              transform: 'translateX(4px)',
                            },
                          }}
                        >
                          <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.875rem' }}>
                            Approve Users
                          </Typography>
                        </Button>
                      )}

                      {/* Approve Projects */}
                      {canManageProjects && (
                        <Button
                          fullWidth
                          variant="outlined"
                          startIcon={<PendingActionsIcon />}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            navigate(ROUTES.PUBLIC_APPROVAL, { replace: false });
                          }}
                          sx={{
                            textTransform: 'none',
                            justifyContent: 'flex-start',
                            p: 1,
                            borderRadius: 1.5,
                            borderColor: colors.blueAccent[500],
                            color: colors.blueAccent[600],
                            bgcolor: theme.palette.mode === 'dark' ? colors.blueAccent[900] + '20' : colors.blueAccent[50],
                            minHeight: 40,
                            '&:hover': {
                              background: `linear-gradient(135deg, ${colors.blueAccent[500]}, ${colors.blueAccent[400]})`,
                              color: 'white',
                              borderColor: colors.blueAccent[500],
                              boxShadow: `0 4px 12px ${colors.blueAccent[500]}30`,
                              transform: 'translateX(4px)',
                            },
                          }}
                        >
                          <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.875rem' }}>
                            Approve Projects
                          </Typography>
                        </Button>
                      )}

                      {/* Project Registry */}
                      <Button
                        fullWidth
                        variant="outlined"
                        startIcon={<RegistryIcon />}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          navigate(ROUTES.PROJECTS, { replace: false });
                        }}
                        sx={{
                          textTransform: 'none',
                          justifyContent: 'flex-start',
                          p: 1,
                          borderRadius: 1.5,
                          borderColor: colors.greenAccent[500],
                          color: colors.greenAccent[600],
                          bgcolor: theme.palette.mode === 'dark' ? colors.greenAccent[900] + '20' : colors.greenAccent[50],
                          minHeight: 40,
                          '&:hover': {
                            background: `linear-gradient(135deg, ${colors.greenAccent[500]}, ${colors.greenAccent[400]})`,
                            color: 'white',
                            borderColor: colors.greenAccent[500],
                            boxShadow: `0 4px 12px ${colors.greenAccent[500]}30`,
                            transform: 'translateX(4px)',
                          },
                        }}
                      >
                        <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.875rem' }}>
                          Project Registry
                        </Typography>
                      </Button>

                      {/* Upload Projects */}
                      {canManageProjects && (
                        <Button
                          fullWidth
                          variant="outlined"
                          startIcon={<ImportIcon />}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            navigate(ROUTES.CENTRAL_IMPORT, { replace: false });
                          }}
                          sx={{
                            textTransform: 'none',
                            justifyContent: 'flex-start',
                            p: 1,
                            borderRadius: 1.5,
                            borderColor: colors.purple[500],
                            color: colors.purple[600],
                            bgcolor: theme.palette.mode === 'dark' ? colors.purple[900] + '20' : colors.purple[50],
                            minHeight: 40,
                            '&:hover': {
                              background: `linear-gradient(135deg, ${colors.purple[500]}, ${colors.purple[400]})`,
                              color: 'white',
                              borderColor: colors.purple[500],
                              boxShadow: `0 4px 12px ${colors.purple[500]}30`,
                              transform: 'translateX(4px)',
                            },
                          }}
                        >
                          <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.875rem' }}>
                            Upload Projects
                          </Typography>
                        </Button>
                      )}
                    </Box>
                  </CardContent>
                </Card>
          </Grid>
        </Grid>

        {/* Status Projects Modal */}
        <Dialog
          open={statusModalOpen}
          onClose={() => setStatusModalOpen(false)}
          maxWidth="lg"
          fullWidth
          PaperProps={{
            sx: {
              borderRadius: 2,
              maxHeight: '90vh',
            }
          }}
        >
          <DialogTitle>
            <Box display="flex" justifyContent="space-between" alignItems="center">
              <Typography variant="h6" sx={{ fontWeight: 'bold' }}>
                Projects - {selectedStatus}
              </Typography>
              <IconButton
                onClick={() => setStatusModalOpen(false)}
                size="small"
                sx={{ color: 'text.secondary' }}
              >
                <CloseIcon />
              </IconButton>
            </Box>
          </DialogTitle>
          <DialogContent dividers>
            {loadingStatusProjects ? (
              <Box display="flex" justifyContent="center" p={4}>
                <CircularProgress />
              </Box>
            ) : statusProjects.length === 0 ? (
              <Box textAlign="center" p={4}>
                <Typography variant="body2" color="text.secondary">
                  No projects found with status "{selectedStatus}"
                </Typography>
              </Box>
            ) : (
              <TableContainer sx={{ maxHeight: '60vh' }}>
                <Table stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 'bold' }}>Project Name</TableCell>
                      <TableCell sx={{ fontWeight: 'bold' }}>Status</TableCell>
                      <TableCell sx={{ fontWeight: 'bold' }}>Department</TableCell>
                      <TableCell sx={{ fontWeight: 'bold' }}>Directorate</TableCell>
                      <TableCell sx={{ fontWeight: 'bold' }}>Budget</TableCell>
                      <TableCell sx={{ fontWeight: 'bold' }}>Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {statusProjects.map((project) => (
                      <TableRow key={project.id} hover>
                        <TableCell>
                          <Typography variant="body2" sx={{ fontWeight: 500 }}>
                            {project.projectName || project.project_name || 'Untitled Project'}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={project.status || 'Unknown'}
                            size="small"
                            sx={{
                              bgcolor: isLight 
                                ? (project.status?.toLowerCase().includes('completed') ? '#4caf50' :
                                   project.status?.toLowerCase().includes('ongoing') ? '#2196f3' :
                                   project.status?.toLowerCase().includes('stalled') ? '#ff9800' :
                                   '#9e9e9e')
                                : colors.blueAccent[700],
                              color: 'white',
                              fontSize: '0.7rem',
                            }}
                          />
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2">
                            {project.departmentName || project.department_name || 'N/A'}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2">
                            {project.directorateName || project.directorate_name || 'N/A'}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2">
                            {project.costOfProject || project.cost_of_project 
                              ? `KES ${parseFloat(project.costOfProject || project.cost_of_project).toLocaleString()}`
                              : 'N/A'}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Button
                            size="small"
                            variant="outlined"
                            onClick={() => {
                              setStatusModalOpen(false);
                              navigate(`${ROUTES.PROJECTS}/${project.id}`);
                            }}
                            sx={{ textTransform: 'none', fontSize: '0.75rem' }}
                          >
                            View Details
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </DialogContent>
          <DialogActions sx={{ p: 2 }}>
            <Button
              onClick={() => {
                setStatusModalOpen(false);
                navigate(`${ROUTES.PROJECTS}?status=${selectedStatus}`);
              }}
              variant="contained"
              sx={{ textTransform: 'none' }}
            >
              View All in Projects Page
            </Button>
            <Button
              onClick={() => setStatusModalOpen(false)}
              variant="outlined"
              sx={{ textTransform: 'none' }}
            >
              Close
            </Button>
          </DialogActions>
        </Dialog>

      </Container>
    </Box>
  );
};

export default HomePage;
