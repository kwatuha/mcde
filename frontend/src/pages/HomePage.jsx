import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Box,
  Typography,
  Button,
  Grid,
  Card,
  CardContent,
  Avatar,
  useTheme,
  Chip,
  LinearProgress,
  CircularProgress,
  List,
  ListItem,
  ListItemButton,
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
  FactCheck as FactCheckIcon,
} from '@mui/icons-material';
import { useAuth } from '../context/AuthContext';
import { ROUTES } from '../configs/appConfig';
import logo from '../assets/logo.png';
import apiService from '../api';
import useDashboardData from '../hooks/useDashboardData';
import { normalizeProjectStatus } from '../utils/projectStatusNormalizer';
import { tokens } from './dashboard/theme';
import { isAdmin } from '../utils/privilegeUtils.js';
import { resolveWorkflowNavigationPath, workflowEntityTypeLabel } from '../utils/workflowNavigation';
import { getAccessCheckForAppPath } from '../utils/routeAccessHints.js';

/** Same KPI count animation as `FinanceDashboardPage`. */
const STATUS_COUNT_UP_MS = 500;

function useCountUp(endValue, durationMs = STATUS_COUNT_UP_MS) {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    const end = Math.max(0, Math.round(Number(endValue) || 0));
    if (end === 0) {
      setDisplay(0);
      return undefined;
    }

    setDisplay(0);
    const startTime = performance.now();
    let rafId;

    const tick = (now) => {
      const t = Math.min(1, (now - startTime) / durationMs);
      const eased = 1 - (1 - t) ** 3;
      setDisplay(Math.round(eased * end));
      if (t < 1) {
        rafId = requestAnimationFrame(tick);
      } else {
        setDisplay(end);
      }
    };

    rafId = requestAnimationFrame(tick);
    return () => {
      if (rafId != null) cancelAnimationFrame(rafId);
    };
  }, [endValue, durationMs]);

  return display;
}

const projectStatusKpiColumnSx = {
  flex: { xs: '0 0 auto', sm: '1 1 0%' },
  minWidth: { xs: 160, sm: 0 },
  maxWidth: { sm: '100%' },
  display: 'flex',
  flexDirection: 'column',
  minHeight: 0,
};

/** Metadata + theme hooks for home status KPIs (layout matches `FinanceDashboardPage` KPI row). */
const PROJECT_STATUS_KPI_DEFS = [
  {
    statusKey: 'Completed',
    title: 'Completed',
    Icon: CheckCircleIcon,
    iconColor: (c, L) => (L ? 'rgba(255, 255, 255, 0.9)' : c.greenAccent[500]),
    background: (c, L) =>
      L ? 'linear-gradient(135deg, #4caf50 0%, #81c784 100%)' : `linear-gradient(135deg, ${c.greenAccent[800]}, ${c.greenAccent[700]})`,
    borderTop: (c, L) => (L ? '#388e3c' : c.greenAccent[500]),
    hoverShadow: (L) => (L ? '0 4px 12px rgba(76, 175, 80, 0.3)' : '0 4px 16px rgba(0, 0, 0, 0.25)'),
  },
  {
    statusKey: 'Ongoing',
    title: 'Ongoing',
    Icon: PlayArrowIcon,
    iconColor: (c, L) => (L ? 'rgba(255, 255, 255, 0.9)' : c.blueAccent[500]),
    background: (c, L) =>
      L ? 'linear-gradient(135deg, #2196f3 0%, #42a5f5 100%)' : `linear-gradient(135deg, ${c.blueAccent[800]}, ${c.blueAccent[700]})`,
    borderTop: (c, L) => (L ? '#1976d2' : c.blueAccent[500]),
    hoverShadow: (L) => (L ? '0 4px 12px rgba(33, 150, 243, 0.3)' : '0 4px 16px rgba(0, 0, 0, 0.25)'),
  },
  {
    statusKey: 'Not started',
    title: 'Not Started',
    Icon: ScheduleIcon,
    iconColor: (c, L) => (L ? 'rgba(255, 255, 255, 0.9)' : c.grey[400]),
    background: (c, L) =>
      L ? 'linear-gradient(135deg, #9e9e9e 0%, #bdbdbd 100%)' : `linear-gradient(135deg, ${c.grey[800]}, ${c.grey[700]})`,
    borderTop: (c, L) => (L ? '#616161' : c.grey[500]),
    hoverShadow: (L) => (L ? '0 4px 12px rgba(158, 158, 158, 0.3)' : '0 4px 16px rgba(0, 0, 0, 0.25)'),
  },
  {
    statusKey: 'Stalled',
    title: 'Stalled',
    Icon: PauseIcon,
    iconColor: (c, L) => (L ? 'rgba(255, 255, 255, 0.9)' : c.orange?.[400] || c.yellowAccent[400]),
    background: (c, L) =>
      L
        ? 'linear-gradient(135deg, #ff9800 0%, #ffb74d 100%)'
        : `linear-gradient(135deg, ${c.orange?.[800] || c.yellowAccent[800]}, ${c.orange?.[700] || c.yellowAccent[700]})`,
    borderTop: (c, L) => (L ? '#f57c00' : c.orange?.[500] || c.yellowAccent[500]),
    hoverShadow: (L) => (L ? '0 4px 12px rgba(255, 152, 0, 0.3)' : '0 4px 16px rgba(0, 0, 0, 0.25)'),
  },
  {
    statusKey: 'Under Procurement',
    title: 'Under Procurement',
    Icon: HourglassIcon,
    iconColor: (c, L) => (L ? 'rgba(255, 255, 255, 0.9)' : c.purple?.[400] || c.blueAccent[400]),
    background: (c, L) =>
      L
        ? 'linear-gradient(135deg, #9c27b0 0%, #ba68c8 100%)'
        : `linear-gradient(135deg, ${c.purple?.[800] || c.blueAccent[800]}, ${c.purple?.[700] || c.blueAccent[700]})`,
    borderTop: (c, L) => (L ? '#7b1fa2' : c.purple?.[500] || c.blueAccent[500]),
    hoverShadow: (L) => (L ? '0 4px 12px rgba(156, 39, 176, 0.3)' : '0 4px 16px rgba(0, 0, 0, 0.25)'),
  },
  {
    statusKey: 'Suspended',
    title: 'Suspended',
    Icon: WarningIcon,
    iconColor: (c, L) => (L ? 'rgba(255, 255, 255, 0.9)' : c.redAccent[400]),
    background: (c, L) =>
      L ? 'linear-gradient(135deg, #f44336 0%, #e57373 100%)' : `linear-gradient(135deg, ${c.redAccent[800]}, ${c.redAccent[700]})`,
    borderTop: (c, L) => (L ? '#d32f2f' : c.redAccent[500]),
    hoverShadow: (L) => (L ? '0 4px 12px rgba(244, 67, 54, 0.3)' : '0 4px 16px rgba(0, 0, 0, 0.25)'),
  },
];

const HomePage = () => {
  const theme = useTheme();
  const navigate = useNavigate();
  const { user, hasPrivilege } = useAuth();

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
  const [projectsPendingReview, setProjectsPendingReview] = useState([]);
  /** Generic approval workflow rows where the current user's role matches the pending step (see GET /approval-workflow/requests/pending-me). */
  const [workflowPendingRows, setWorkflowPendingRows] = useState([]);
  /** Block navigation and show required privileges (e.g. finance list needs document.read_all). */
  const [workflowPathAccessModal, setWorkflowPathAccessModal] = useState({
    open: false,
    targetPath: '',
    title: '',
    detail: '',
    missing: [],
  });

  const navigateToWorkflowOrExplain = useCallback(
    (targetPath) => {
      const result = getAccessCheckForAppPath(targetPath, (p) => !!(hasPrivilege && hasPrivilege(p)));
      if (!result.ok) {
        setWorkflowPathAccessModal({
          open: true,
          targetPath,
          title: result.title || 'This destination needs more access',
          detail: result.detail || '',
          missing: result.missing || [],
        });
        return;
      }
      navigate(targetPath);
    },
    [navigate, hasPrivilege]
  );
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
            const response = await apiService.analytics.getProjectsForOrganization({ limit: 5000 });
            const projects = (Array.isArray(response) ? response : []).map((p) => ({
              ...p,
              status: p.status || p.Status || 'Unknown',
              projectName: p.projectName || p.project_name || 'Untitled Project',
            }));
            
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
              const normalized = normalizeProjectStatus(p.status || p.Status || 'Unknown');
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
              .slice(0, 3)
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
          response = await apiService.analytics.getProjectsForOrganization({ limit: 5000 }); // Stable endpoint for status stats
        } catch (authErr) {
          try {
            const publicData = await apiService.public.getProjects({ limit: 50 });
            response = publicData.projects || publicData;
          } catch (pubErr) {
            throw authErr; // Use original error
          }
        }
        
        // Handle different response formats
        const projects = (Array.isArray(response) ? response : []).map((p) => ({
          ...p,
          status: p.status || p.Status || 'Unknown',
          projectName: p.projectName || p.project_name || 'Untitled Project',
        }));
        
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
        
        // Get recent projects (latest 3 by activity date)
        const recent = projects
          .filter(p => p?.id)
          .sort((a, b) => {
            const dateA = new Date(a?.updatedAt || a?.createdAt || a?.startDate || a?.start_date || 0);
            const dateB = new Date(b?.updatedAt || b?.createdAt || b?.startDate || b?.start_date || 0);
            return dateB - dateA;
          })
          .slice(0, 3)
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
          setProjectsPendingReview([]);
          setWorkflowPendingRows([]);
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

        const [usersData, projectsPendingApprovalData, projectsPendingReviewData] = await Promise.all(promises);
        
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

        let wfRows = [];
        try {
          const wf = await apiService.approvalWorkflow.listPendingForMe();
          wfRows = Array.isArray(wf) ? wf : [];
        } catch (wfErr) {
          console.warn('Workflow pending list skipped:', wfErr?.response?.data?.message || wfErr.message);
          wfRows = [];
        }
        if (isMounted) setWorkflowPendingRows(wfRows);
      } catch (error) {
        console.error('Error fetching notifications:', error);
        if (isMounted) {
          setPendingUsers([]);
          setPendingProjects([]);
          setProjectsPendingReview([]);
          setWorkflowPendingRows([]);
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




  // Prepare notification cards (role-dependent)
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

  // Projects Pending Approval → Public Approval page, Approval filter: Pending
  if (canManageProjects) {
    notificationItems.push({
      type: 'projects-pending-approval',
      title: 'Projects Pending Approval',
      count: pendingProjects.length,
      icon: <PendingActionsIcon />,
      color: '#ff9800',
      route: `${ROUTES.PUBLIC_APPROVAL}?approval=pending`,
      description: pendingProjects.length > 0
        ? `${pendingProjects.length} project${pendingProjects.length > 1 ? 's' : ''} waiting for approval`
        : 'No projects pending approval',
    });
  }
  
  // Projects Pending Review → Public Approval page, Approval filter: Revision
  if (canManageProjects) {
    notificationItems.push({
      type: 'projects-pending-review',
      title: 'Projects Pending Review',
      count: projectsPendingReview.length,
      icon: <AssignmentIndIcon />,
      color: '#2196f3',
      route: `${ROUTES.PUBLIC_APPROVAL}?approval=revision`,
      description: projectsPendingReview.length > 0
        ? `${projectsPendingReview.length} project${projectsPendingReview.length > 1 ? 's' : ''} under review`
        : 'No projects pending review',
    });
  }

  if (user && workflowPendingRows.length > 0) {
    notificationItems.push({
      type: 'workflow-pending-steps',
      title: 'My workflow approvals',
      count: workflowPendingRows.length,
      icon: <FactCheckIcon />,
      color: '#5e35b1',
      // Card click opens the first pending item’s resolved URL (link_template or entity fallback), not CIDP.
      route: resolveWorkflowNavigationPath(workflowPendingRows[0]),
      description: `${workflowPendingRows.length} step${workflowPendingRows.length > 1 ? 's' : ''} waiting for your role (work plans, payment requests, certificates, etc.). Use the list below to open a specific item.`,
    });
  }

  const metrics = dashboardData?.metrics || {};
  const recentActivity = dashboardData?.recentActivity || [];
  
  // Calculate status statistics from allProjects
  const colors = tokens(theme.palette.mode);
  const isLight = theme.palette.mode === 'light';
  const ui = {
    elevatedShadow: isLight ? '0 1px 6px rgba(0,0,0,0.06)' : '0 4px 20px rgba(0, 0, 0, 0.15), 0 -2px 10px rgba(0, 0, 0, 0.1)',
  };

  const dashboardShellCardSx = {
    borderRadius: 4,
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    background:
      theme.palette.mode === 'dark'
        ? `linear-gradient(135deg, ${colors.primary[400]} 0%, ${colors.primary[500]} 100%)`
        : 'linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%)',
    border: `1px solid ${theme.palette.mode === 'dark' ? colors.blueAccent[700] : 'rgba(0,0,0,0.08)'}`,
    boxShadow:
      theme.palette.mode === 'dark'
        ? '0 8px 32px rgba(0,0,0,0.4)'
        : '0 4px 20px rgba(0,0,0,0.08)',
    transition: 'all 0.3s ease',
    '&:hover': {
      boxShadow:
        theme.palette.mode === 'dark'
          ? '0 12px 48px rgba(0,0,0,0.5)'
          : '0 8px 32px rgba(0,0,0,0.12)',
      transform: 'translateY(-2px)',
    },
  };

  const dashboardSectionTitleSx = {
    fontWeight: 700,
    fontSize: '0.95rem',
    color: colors.grey[100],
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
      const normalized = normalizeProjectStatus(p.status || p.Status || 'Unknown');
      if (stats.hasOwnProperty(normalized)) {
        stats[normalized]++;
      } else {
        stats['Other']++;
      }
    });

    return stats;
  }, [allProjects]);

  const animStatusCompleted = useCountUp(loadingProjects ? 0 : statusStats['Completed'] || 0);
  const animStatusOngoing = useCountUp(loadingProjects ? 0 : statusStats.Ongoing || 0);
  const animStatusNotStarted = useCountUp(loadingProjects ? 0 : statusStats['Not started'] || 0);
  const animStatusStalled = useCountUp(loadingProjects ? 0 : statusStats.Stalled || 0);
  const animStatusUnderProcurement = useCountUp(loadingProjects ? 0 : statusStats['Under Procurement'] || 0);
  const animStatusSuspended = useCountUp(loadingProjects ? 0 : statusStats.Suspended || 0);

  const statusCountAnimByKey = {
    Completed: animStatusCompleted,
    Ongoing: animStatusOngoing,
    'Not started': animStatusNotStarted,
    Stalled: animStatusStalled,
    'Under Procurement': animStatusUnderProcurement,
    Suspended: animStatusSuspended,
  };

  // Handler to open modal with projects for a specific status
  const handleStatusClick = async (status) => {
    setSelectedStatus(status);
    setStatusModalOpen(true);
    setLoadingStatusProjects(true);
    
    try {
      // Fetch all projects with this status
      const response = await apiService.analytics.getProjectsForOrganization({ limit: 5000 });
      const projects = (Array.isArray(response) ? response : []).map((p) => ({
        ...p,
        status: p.status || p.Status || 'Unknown',
      }));
      
      // Filter projects by normalized status
      const filtered = projects.filter(p => {
        const normalized = normalizeProjectStatus(p.status || p.Status || 'Unknown');
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
        width: {
          xs: `calc(100% + ${theme.spacing(1.5)})`,
          sm: `calc(100% + ${theme.spacing(2)})`,
          md: `calc(100% + ${theme.spacing(2.5)})`,
        },
        maxWidth: 'none',
        boxSizing: 'border-box',
        overflowX: 'hidden',
        mx: { xs: -0.75, sm: -1, md: -1.25 },
        px: 0,
        py: { xs: 1, sm: 1.25, md: 1.5 },
        background:
          theme.palette.mode === 'dark'
            ? `linear-gradient(135deg, ${colors.primary[900]} 0%, ${colors.primary[800]} 50%, ${colors.primary[900]} 100%)`
            : 'linear-gradient(135deg, #f5f7fa 0%, #e9ecef 100%)',
        minHeight: '100vh',
      }}
    >
      <Box
        sx={{
          width: '100%',
          maxWidth: '100%',
          boxSizing: 'border-box',
          px: { xs: 0.75, sm: 1, md: 1.25 },
          mb: 1.5,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, mb: 1, flexWrap: 'wrap' }}>
          <Box
            sx={{
              width: 3,
              height: 28,
              background: `linear-gradient(180deg, ${colors.blueAccent[500]}, ${colors.greenAccent[500]})`,
              borderRadius: 1.5,
              mt: 0.25,
            }}
          />
          <Box sx={{ flex: 1, minWidth: 200 }}>
            <Typography
              variant="h5"
              sx={{
                fontWeight: 800,
                background: `linear-gradient(135deg, ${colors.blueAccent[500]}, ${colors.greenAccent[500]})`,
                backgroundClip: 'text',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                letterSpacing: '-0.02em',
                fontSize: { xs: '1.1rem', md: '1.35rem' },
                lineHeight: 1.2,
              }}
            >
              Dashboard
            </Typography>
            <Typography
              variant="body2"
              sx={{ mt: 0.35, color: colors.grey[300], fontSize: '0.8rem', lineHeight: 1.4, maxWidth: 720 }}
            >
              Welcome back, <strong>{user?.username || 'User'}</strong>
              {user?.roleName ? ` · ${user.roleName}` : ''} — here&apos;s what&apos;s happening in your system today.
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
            <Chip
              label="Summary Statistics"
              size="small"
              onClick={() => navigate(ROUTES.SYSTEM_DASHBOARD)}
              sx={{
                bgcolor: colors.blueAccent[600],
                color: 'white',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '0.7rem',
                height: 24,
                '&:hover': { bgcolor: colors.blueAccent[700], transform: 'scale(1.05)' },
                transition: 'all 0.2s ease',
              }}
            />
            <Chip
              label="Project By Status"
              size="small"
              onClick={() => navigate(ROUTES.PROJECT_BY_STATUS_DASHBOARD)}
              sx={{
                bgcolor: colors.orange[600],
                color: 'white',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '0.7rem',
                height: 24,
                '&:hover': { bgcolor: colors.orange[700], transform: 'scale(1.05)' },
                transition: 'all 0.2s ease',
              }}
            />
            <Chip
              label="Finance"
              size="small"
              onClick={() => navigate(ROUTES.FINANCE_DASHBOARD)}
              sx={{
                bgcolor: colors.blueAccent[600],
                color: 'white',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '0.7rem',
                height: 24,
                '&:hover': { bgcolor: colors.blueAccent[700], transform: 'scale(1.05)' },
                transition: 'all 0.2s ease',
              }}
            />
            <Chip
              label="Jobs & Impact"
              size="small"
              onClick={() => navigate(ROUTES.JOBS_DASHBOARD)}
              sx={{
                bgcolor: colors.greenAccent[600],
                color: 'white',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '0.7rem',
                height: 24,
                '&:hover': { bgcolor: colors.greenAccent[700], transform: 'scale(1.05)' },
                transition: 'all 0.2s ease',
              }}
            />
            <IconButton
              onClick={refreshDashboard}
              disabled={refreshing}
              size="small"
              sx={{
                color: colors.grey[300],
                width: 36,
                height: 36,
                border: `1px solid ${theme.palette.mode === 'dark' ? colors.blueAccent[700] : 'rgba(0,0,0,0.12)'}`,
                '&:hover': {
                  bgcolor: theme.palette.mode === 'dark' ? colors.primary[500] : 'rgba(0,0,0,0.04)',
                  transform: 'rotate(180deg)',
                },
                transition: 'all 0.3s ease-in-out',
              }}
            >
              <RefreshIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </Box>
        </Box>
      </Box>

      {/* Project status KPIs — layout & motion match `FinanceDashboardPage` KPI row; click opens detail modal */}
      <Box
        sx={{
          mb: 1,
          mt: 1,
          width: '100%',
          display: 'flex',
          flexWrap: 'nowrap',
          gap: 1,
          pb: 1,
          px: '1rem',
          overflowX: { xs: 'auto', sm: 'hidden' },
          boxSizing: 'border-box',
          '&::-webkit-scrollbar': { height: '8px' },
          '&::-webkit-scrollbar-track': {
            background: isLight ? colors.grey[100] : colors.grey[800],
            borderRadius: '4px',
          },
          '&::-webkit-scrollbar-thumb': {
            background: isLight ? colors.grey[400] : colors.grey[600],
            borderRadius: '4px',
            '&:hover': { background: isLight ? colors.grey[500] : colors.grey[500] },
          },
        }}
      >
        {PROJECT_STATUS_KPI_DEFS.map((def) => {
          const { statusKey, title, Icon } = def;
          const count = statusStats[statusKey] || 0;
          const pct =
            statusStats.totalProjects > 0
              ? Math.round((count / statusStats.totalProjects) * 100)
              : 0;
          const animated = statusCountAnimByKey[statusKey];

          return (
            <Box key={statusKey} sx={projectStatusKpiColumnSx}>
              <Card
                role="button"
                tabIndex={0}
                onClick={() => handleStatusClick(statusKey)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleStatusClick(statusKey);
                  }
                }}
                sx={{
                  flex: 1,
                  width: '100%',
                  minHeight: '100%',
                  cursor: 'pointer',
                  background: def.background(colors, isLight),
                  color: isLight ? 'white' : 'inherit',
                  borderTop: `2px solid ${def.borderTop(colors, isLight)}`,
                  boxShadow: ui.elevatedShadow,
                  transition: 'all 0.2s ease-in-out',
                  borderRadius: '8px',
                  '&:hover': {
                    transform: 'translateY(-2px)',
                    boxShadow: def.hoverShadow(isLight),
                  },
                }}
              >
                <CardContent sx={{ p: 0.75, '&:last-child': { pb: 0.75 }, pt: 0.75 }}>
                  <Box display="flex" alignItems="center" gap={0.75}>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography
                        variant="caption"
                        sx={{
                          color: isLight ? 'rgba(255, 255, 255, 0.9)' : colors.grey[100],
                          fontWeight: 600,
                          fontSize: '0.65rem',
                          display: 'block',
                        }}
                      >
                        {title}
                      </Typography>
                      <Typography
                        variant="h5"
                        sx={{
                          color: isLight ? '#ffffff' : '#fff',
                          fontWeight: 800,
                          fontSize: '2rem',
                          mb: 0,
                          lineHeight: 1.15,
                          minHeight: loadingProjects ? 32 : undefined,
                          display: 'flex',
                          alignItems: 'center',
                        }}
                      >
                        {loadingProjects ? (
                          <CircularProgress size={22} sx={{ color: 'white' }} />
                        ) : (
                          animated
                        )}
                      </Typography>
                      <Typography
                        variant="caption"
                        component="div"
                        sx={{
                          color: isLight ? 'rgba(255, 255, 255, 0.9)' : colors.grey[300],
                          fontWeight: 600,
                          fontSize: '1.1rem',
                          mt: 0.125,
                          lineHeight: 1.2,
                        }}
                      >
                        {pct}%
                      </Typography>
                    </Box>
                    <Icon
                      sx={{
                        color: def.iconColor(colors, isLight),
                        fontSize: '2rem',
                        flexShrink: 0,
                      }}
                    />
                  </Box>
                </CardContent>
              </Card>
            </Box>
          );
        })}
      </Box>

        {/* Main content — summary-statistics card shell */}
        <Grid
          container
          rowSpacing={2.5}
          columnSpacing={{ xs: 1, sm: 1.5, md: 2 }}
          alignItems="stretch"
          sx={{
            mb: 2,
            width: '100%',
            maxWidth: '100%',
            boxSizing: 'border-box',
            mx: 0,
            px: '1rem',
          }}
        >
          {/* Notifications & Pending Approvals - Left Column */}
          <Grid size={{ xs: 12, md: 4 }} sx={{ display: 'flex', minWidth: 0 }}>
            <Card elevation={0} sx={{ ...dashboardShellCardSx, width: '100%', flex: 1 }}>
              <CardContent sx={{ p: 1.5, pb: 0.5, flex: 1, display: 'flex', flexDirection: 'column', '&:last-child': { pb: 0.5 } }}>
                <Box display="flex" alignItems="center" gap={1} mb={1.2}>
                  <Box
                    sx={{
                      p: 0.65,
                      borderRadius: 1,
                      background: `linear-gradient(135deg, ${colors.orange[500]}, ${colors.yellowAccent[500]})`,
                      color: 'white',
                      display: 'flex',
                      alignItems: 'center',
                      boxShadow: `0 2px 8px ${colors.orange[500]}40`,
                    }}
                  >
                    <NotificationsActiveIcon sx={{ fontSize: 20 }} />
                  </Box>
                  <Typography sx={dashboardSectionTitleSx}>Notifications & Approvals</Typography>
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
                        onClick={() => {
                          if (!item.route) return;
                          if (item.type === 'workflow-pending-steps') {
                            navigateToWorkflowOrExplain(item.route);
                          } else {
                            navigate(item.route);
                          }
                        }}
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

                    {workflowPendingRows.length > 0 && (
                      <Box sx={{ mt: 0.5 }}>
                        <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', display: 'block', mb: 0.5 }}>
                          Open a pending step
                        </Typography>
                        <List dense disablePadding sx={{ borderRadius: 1, border: '1px solid', borderColor: 'divider', overflow: 'hidden' }}>
                          {workflowPendingRows.slice(0, 8).map((row) => {
                            const rid = row.request_id ?? row.requestId;
                            const path = resolveWorkflowNavigationPath(row);
                            return (
                              <ListItemButton
                                key={`${rid}-${row.instance_id ?? row.step_order}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigateToWorkflowOrExplain(path);
                                }}
                                sx={{ py: 0.75 }}
                              >
                                <ListItemText
                                  primaryTypographyProps={{ variant: 'caption', fontWeight: 600 }}
                                  secondaryTypographyProps={{ variant: 'caption' }}
                                  primary={`${workflowEntityTypeLabel(row.entity_type)} · #${row.entity_id}`}
                                  secondary={row.step_name ? `${row.step_name}` : `Step ${row.step_order}`}
                                />
                              </ListItemButton>
                            );
                          })}
                        </List>
                        {workflowPendingRows.length > 8 && (
                          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                            +{workflowPendingRows.length - 8} more — each row above opens the link from that workflow definition.
                          </Typography>
                        )}
                      </Box>
                    )}
                    
                    {/* Additional quick actions if no pending items */}
                    {notificationItems.length === 1 && notificationItems[0].count === 0 && (
                      <Box mt={2}>
                        <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.75rem', display: 'block', mb: 1 }}>
                          Quick Actions:
                        </Typography>
                        <Grid container spacing={1}>
                          <Grid size={{ xs: 6 }}>
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
                          <Grid size={{ xs: 6 }}>
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
          <Grid size={{ xs: 12, md: 4 }} sx={{ display: 'flex', minWidth: 0 }}>
            <Card elevation={0} sx={{ ...dashboardShellCardSx, width: '100%', flex: 1 }}>
              <CardContent sx={{ p: 1.5, pb: 0.5, flex: 1, display: 'flex', flexDirection: 'column', '&:last-child': { pb: 0.5 } }}>
                <Box display="flex" justifyContent="space-between" alignItems="center" mb={1.2}>
                  <Box display="flex" alignItems="center" gap={1}>
                    <Box
                      sx={{
                        p: 0.65,
                        borderRadius: 1,
                        background: `linear-gradient(135deg, ${colors.blueAccent[500]}, ${colors.blueAccent[400]})`,
                        color: 'white',
                        display: 'flex',
                        alignItems: 'center',
                        boxShadow: `0 2px 8px ${colors.blueAccent[500]}40`,
                      }}
                    >
                      <ProjectsIcon sx={{ fontSize: 18 }} />
                    </Box>
                    <Typography sx={dashboardSectionTitleSx}>Recent Projects</Typography>
                  </Box>
                  <Button
                    size="small"
                    endIcon={<ArrowForwardIcon />}
                    onClick={() => navigate(ROUTES.PROJECTS)}
                    sx={{
                      textTransform: 'none',
                      fontSize: '0.72rem',
                      fontWeight: 600,
                      minWidth: 'auto',
                      px: 1,
                      color: colors.grey[300],
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
          <Grid size={{ xs: 12, md: 4 }} sx={{ display: 'flex', minWidth: 0 }}>
            <Card elevation={0} sx={{ ...dashboardShellCardSx, width: '100%', flex: 1 }}>
              <CardContent sx={{ p: 1.5, pb: 0.5, flex: 1, display: 'flex', flexDirection: 'column', '&:last-child': { pb: 0.5 } }}>
                <Box display="flex" justifyContent="space-between" alignItems="center" mb={1.2}>
                  <Box display="flex" alignItems="center" gap={1}>
                    <Box
                      sx={{
                        p: 0.65,
                        borderRadius: 1,
                        background: `linear-gradient(135deg, ${colors.greenAccent[500]}, ${colors.blueAccent[500]})`,
                        color: 'white',
                        display: 'flex',
                        alignItems: 'center',
                        boxShadow: `0 2px 8px ${colors.greenAccent[500]}40`,
                      }}
                    >
                      <AnalyticsIcon sx={{ fontSize: 16 }} />
                    </Box>
                    <Typography sx={dashboardSectionTitleSx}>Quick Actions</Typography>
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

        <Dialog
          open={workflowPathAccessModal.open}
          onClose={() => setWorkflowPathAccessModal((s) => ({ ...s, open: false }))}
          maxWidth="sm"
          fullWidth
        >
          <DialogTitle>Cannot open this workflow link yet</DialogTitle>
          <DialogContent>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
              {workflowPathAccessModal.title}
            </Typography>
            {workflowPathAccessModal.detail ? (
              <Typography variant="body2" sx={{ mb: 2 }}>
                {workflowPathAccessModal.detail}
              </Typography>
            ) : null}
            <Typography variant="subtitle2" sx={{ mb: 0.75 }}>
              Add these privileges to your role (then refresh or sign in again):
            </Typography>
            <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
              {(workflowPathAccessModal.missing || []).map((priv) => (
                <li key={priv}>
                  <Typography component="span" variant="body2" sx={{ fontFamily: 'monospace' }}>
                    {priv}
                  </Typography>
                </li>
              ))}
            </Box>
            {workflowPathAccessModal.targetPath ? (
              <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 2 }}>
                Target URL:{' '}
                <Box component="span" sx={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>
                  {workflowPathAccessModal.targetPath}
                </Box>
              </Typography>
            ) : null}
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setWorkflowPathAccessModal((s) => ({ ...s, open: false }))}>Close</Button>
          </DialogActions>
        </Dialog>
    </Box>
  );
};

export default HomePage;
