import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
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
} from '@mui/material';
import {
  Dashboard as DashboardIcon,
  Assignment as ProjectsIcon,
  Assessment as ReportsIcon,
  Map as MapIcon,
  People as PeopleIcon,
  AccountTree as StrategicIcon,
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
  Gavel as ApprovalIcon,
  PieChart as PieChartIcon,
  Business as BusinessIcon,
  Apartment as ApartmentIcon,
} from '@mui/icons-material';
import { useAuth } from '../context/AuthContext';
import { ROUTES } from '../configs/appConfig';
import logo from '../assets/logo.png';
import apiService from '../api';
import useDashboardData from '../hooks/useDashboardData';
import BarChart from '../components/charts/BarChart';

const HomePage = () => {
  const theme = useTheme();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  
  const {
    dashboardData = { loading: false, metrics: {}, recentActivity: [] },
    refreshing,
    refreshDashboard,
  } = useDashboardData();

  const [projectStats, setProjectStats] = useState({
    total: 0,
    active: 0,
    completed: 0,
    pending: 0,
    loading: true,
  });

  const [recentProjects, setRecentProjects] = useState([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [upcomingMilestones, setUpcomingMilestones] = useState([]);
  const [loadingMilestones, setLoadingMilestones] = useState(false);
  const [pendingApprovals, setPendingApprovals] = useState([]);
  const [loadingApprovals, setLoadingApprovals] = useState(false);
  const [projectStatusData, setProjectStatusData] = useState([]);
  const [loadingStatusData, setLoadingStatusData] = useState(false);
  const [projectCategoryData, setProjectCategoryData] = useState([]);
  const [loadingCategoryData, setLoadingCategoryData] = useState(false);
  const [countyDistributionData, setCountyDistributionData] = useState([]);
  const [loadingCountyData, setLoadingCountyData] = useState(false);
  const [departmentDistributionData, setDepartmentDistributionData] = useState([]);
  const [loadingDepartmentData, setLoadingDepartmentData] = useState(false);

  // Fetch project statistics
  useEffect(() => {
    const fetchProjectStats = async () => {
      try {
        setLoadingProjects(true);
        console.log('Fetching project stats...');
        
        // Try to get stats from public API first (same as public dashboard)
        let statsOverview = null;
        try {
          statsOverview = await apiService.public.getStatsOverview();
          console.log('Public stats overview:', statsOverview);
        } catch (err) {
          console.warn('Could not fetch public stats, trying authenticated endpoint...', err.message);
        }
        
        // Get full project list from authenticated endpoint (or public as fallback)
        let response;
        try {
          // apiService.projects maps to the projects service; no nested .projects needed
          response = await apiService.projects.getProjects();
        } catch (authErr) {
          console.warn('Authenticated endpoint failed, trying public endpoint...', authErr.message);
          const publicData = await apiService.public.getProjects({ limit: 1000 });
          response = publicData.projects || publicData;
        }
        
        console.log('API Response:', response);
        console.log('Response type:', typeof response, 'Is array:', Array.isArray(response));
        
        // Handle different response formats
        let projects = [];
        if (Array.isArray(response)) {
          projects = response;
        } else if (response && Array.isArray(response.projects)) {
          projects = response.projects;
        } else if (response && response.data && Array.isArray(response.data)) {
          projects = response.data;
        } else if (response && typeof response === 'object') {
          // Try to extract array from object
          const keys = Object.keys(response);
          if (keys.length > 0 && Array.isArray(response[keys[0]])) {
            projects = response[keys[0]];
          }
        }
        
        console.log('Projects extracted:', projects.length, 'projects');
        if (projects.length > 0) {
          console.log('Sample project:', projects[0]);
          console.log('Sample project status:', projects[0]?.status);
          console.log('Sample project countyNames:', projects[0]?.countyNames);
          console.log('Sample project categoryName:', projects[0]?.categoryName);
          console.log('Sample project name fields:', {
            projectName: projects[0]?.projectName,
            project_name: projects[0]?.project_name,
            name: projects[0]?.name,
            title: projects[0]?.title
          });
        }
        
        if (projects.length === 0) {
          console.warn('⚠️ No projects returned from API. Full response:', response);
          console.warn('Response type:', typeof response);
          console.warn('Response keys:', response ? Object.keys(response) : 'null');
          console.warn('Is error response?', response?.message || response?.error);
          setProjectStats({ total: 0, active: 0, completed: 0, pending: 0, loading: false });
          setRecentProjects([]);
          return;
        }
        
        // Debug: Log status values
        const statuses = projects.map(p => p?.status).filter(Boolean);
        console.log('Unique statuses found:', [...new Set(statuses)]);
        
        // Helper function to normalize status
        const normalizeStatus = (status) => {
          if (!status) return '';
          return status.toLowerCase().trim();
        };
        
        // Count projects by status category - improved matching
        const activeProjects = projects.filter(p => {
          const status = normalizeStatus(p?.status);
          // Match: ongoing, in progress, phase X ongoing (but not completed)
          return (status.includes('ongoing') && !status.includes('completed')) || 
                 status.includes('progress') || 
                 status === 'in progress' ||
                 status === 'on-going';
        });
        
        const completedProjects = projects.filter(p => {
          const status = normalizeStatus(p?.status);
          // Match: completed, complete, phase X completed, final phase
          return status === 'completed' || 
                 status === 'complete' || 
                 (status.includes('completed') && !status.includes('ongoing')) ||
                 status.includes('final phase');
        });
        
        const pendingProjects = projects.filter(p => {
          const status = normalizeStatus(p?.status);
          // Match: initiated, pending, stalled, delayed, not started
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
        
        // Use public stats if available, otherwise calculate from projects
        let stats;
        if (statsOverview && statsOverview.total_projects) {
          // Use aggregated stats from public API (same as public dashboard - more reliable)
          stats = {
            total: statsOverview.total_projects || projects.length,
            active: statsOverview.ongoing_projects || activeProjects.length,
            completed: statsOverview.completed_projects || completedProjects.length,
            pending: (statsOverview.not_started_projects || 0) + 
                     (statsOverview.under_procurement_projects || 0) + 
                     (statsOverview.stalled_projects || 0) || 
                     pendingProjects.length,
          };
          console.log('✅ Using public stats overview (same as public dashboard):', stats);
        } else {
          // Calculate from project list
          stats = {
            total: projects.length,
            active: activeProjects.length,
            completed: completedProjects.length,
            pending: pendingProjects.length,
          };
          console.log('📊 Calculated stats from project list:', stats);
        }
        
        // Debug logging
        console.log('Status matching results:', {
          total: stats.total,
          active: stats.active,
          completed: stats.completed,
          pending: stats.pending,
          sampleStatuses: [...new Set(projects.map(p => p?.status).filter(Boolean))].slice(0, 10),
          usingPublicStats: !!statsOverview,
        });
        
        setProjectStats({ ...stats, loading: false });
        
        // Get recent projects (last 5) - sort by updatedAt or createdAt
        const recent = projects
          .filter(p => p?.id) // Only projects with IDs
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
        
        console.log('Recent projects:', recent.length);
        setRecentProjects(recent);
      } catch (error) {
        console.error('❌ Error fetching project stats:', error);
        console.error('Error details:', {
          message: error.message,
          response: error.response?.data,
          status: error.response?.status,
          statusText: error.response?.statusText,
          url: error.config?.url,
          method: error.config?.method
        });
        
        // If it's a 401, the user might not be authenticated
        if (error.response?.status === 401) {
          console.warn('⚠️ Authentication required - user may need to login');
        } else if (error.response?.status === 500) {
          console.error('⚠️ Server error - check API logs');
        } else if (!error.response) {
          console.error('⚠️ Network error - API might be unreachable');
        }
        
        setProjectStats({ total: 0, active: 0, completed: 0, pending: 0, loading: false });
        setRecentProjects([]);
      } finally {
        setLoadingProjects(false);
      }
    };

    fetchProjectStats();
  }, []);

  // Fetch upcoming milestones
  useEffect(() => {
    const fetchUpcomingMilestones = async () => {
      try {
        setLoadingMilestones(true);
        console.log('Fetching upcoming milestones...');
        const projects = await apiService.projects.getProjects() || [];
        const projectsArray = Array.isArray(projects) ? projects : [];
        console.log('Projects for milestones:', projectsArray.length);
        
        if (projectsArray.length === 0) {
          setUpcomingMilestones([]);
          return;
        }
        
        const allMilestones = [];
        
        // Fetch milestones for each project (limit to first 20 to avoid too many API calls)
        for (const project of projectsArray.slice(0, 20)) {
          try {
            if (!project?.id) continue;
            const milestones = await apiService.milestones.getMilestonesForProject(project.id) || [];
            if (Array.isArray(milestones) && milestones.length > 0) {
              allMilestones.push(...milestones.map(m => ({ 
                ...m, 
                projectName: project.projectName || 'Unknown Project', 
                projectId: project.id 
              })));
            }
          } catch (err) {
            // Skip projects without milestones - this is normal
            console.debug('No milestones for project:', project?.id);
          }
        }
        
        console.log('Total milestones found:', allMilestones.length);
        
        // Filter milestones due in next 14 days
        const now = new Date();
        const twoWeeksFromNow = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
        
        const upcoming = allMilestones
          .filter(m => {
            if (!m?.dueDate) return false;
            try {
              const dueDate = new Date(m.dueDate);
              if (isNaN(dueDate.getTime())) return false;
              const status = (m.status || '').toLowerCase();
              return dueDate >= now && dueDate <= twoWeeksFromNow && status !== 'completed';
            } catch {
              return false;
            }
          })
          .sort((a, b) => {
            try {
              return new Date(a.dueDate) - new Date(b.dueDate);
            } catch {
              return 0;
            }
          })
          .slice(0, 5);
        
        console.log('Upcoming milestones:', upcoming.length);
        setUpcomingMilestones(upcoming);
      } catch (error) {
        console.error('Error fetching upcoming milestones:', error);
        setUpcomingMilestones([]);
      } finally {
        setLoadingMilestones(false);
      }
    };

    // Only fetch if we have projects loaded
    if (projectStats.total > 0) {
      fetchUpcomingMilestones();
    }
  }, [projectStats.total]);

  // Fetch pending approvals (payment requests)
  useEffect(() => {
    const fetchPendingApprovals = async () => {
      try {
        setLoadingApprovals(true);
        console.log('Fetching pending approvals...');
        // Try to fetch payment requests with pending status
        const projects = await apiService.projects.getProjects() || [];
        const projectsArray = Array.isArray(projects) ? projects : [];
        console.log('Projects for approvals:', projectsArray.length);
        const pending = [];
        
        for (const project of projectsArray.slice(0, 10)) {
          try {
            if (!project?.id) continue;
            const requests = await apiService.paymentRequests.getRequestsForProject(project.id) || [];
            const requestsArray = Array.isArray(requests) ? requests : [];
            const pendingRequests = requestsArray.filter(r => {
              const status = (r?.status || '').toLowerCase();
              return status === 'pending' || status === 'submitted' || status === 'under_review' || status.includes('pending');
            });
            if (pendingRequests.length > 0) {
              pending.push(...pendingRequests.map(r => ({
                ...r,
                projectName: project.projectName || 'Unknown Project',
                projectId: project.id,
              })));
            }
          } catch (err) {
            // Skip if no payment requests
            console.debug('No payment requests for project:', project?.id, err.message);
          }
        }
        
        console.log('Pending approvals found:', pending.length);
        setPendingApprovals(pending.slice(0, 5));
      } catch (error) {
        console.error('Error fetching pending approvals:', error);
        setPendingApprovals([]);
      } finally {
        setLoadingApprovals(false);
      }
    };

    // Only fetch if we have projects loaded
    if (projectStats.total > 0) {
      fetchPendingApprovals();
    }
  }, [projectStats.total]);

  // Fetch project status distribution
  useEffect(() => {
    const fetchStatusDistribution = async () => {
      try {
        setLoadingStatusData(true);
        console.log('Fetching project status distribution...');
        // analytics is a top-level service on apiService
        const statusCounts = await apiService.analytics.getProjectStatusCounts() || [];
        console.log('Status counts fetched:', statusCounts);
        setProjectStatusData(Array.isArray(statusCounts) ? statusCounts : []);
      } catch (error) {
        console.error('Error fetching status distribution:', error);
        setProjectStatusData([]);
      } finally {
        setLoadingStatusData(false);
      }
    };

    fetchStatusDistribution();
  }, []);

  // Fetch project category distribution
  useEffect(() => {
    const fetchCategoryDistribution = async () => {
      try {
        setLoadingCategoryData(true);
        console.log('Fetching project category distribution...');
        const categoryData = await apiService.reports.getProjectCategorySummary() || [];
        const categoryArray = Array.isArray(categoryData) ? categoryData : [];
        console.log('Category data fetched:', categoryArray.length, 'categories');
        
        // Transform to chart-friendly format
        const formatted = categoryArray
          .filter(item => item.name && item.value > 0)
          .sort((a, b) => b.value - a.value)
          .slice(0, 10) // Top 10 categories
          .map(item => ({
            name: item.name || 'Uncategorized',
            count: item.value || 0,
          }));
        
        console.log('Formatted category data:', formatted);
        setProjectCategoryData(formatted);
      } catch (error) {
        console.error('❌ Error fetching category distribution:', error);
        console.error('Error details:', error.response?.data || error.message);
        setProjectCategoryData([]);
      } finally {
        setLoadingCategoryData(false);
      }
    };

    fetchCategoryDistribution();
  }, []);

  // Fetch sub-county distribution from public API
  useEffect(() => {
    const fetchSubCountyDistribution = async () => {
      try {
        setLoadingCountyData(true);
        console.log('Fetching sub-county distribution from public API...');
        const subCountyStats = await apiService.public.getSubCountyStats() || [];
        const statsArray = Array.isArray(subCountyStats) ? subCountyStats : [];
        console.log('Sub-county stats fetched:', statsArray.length, 'sub-counties');
        
        if (statsArray.length === 0) {
          setCountyDistributionData([]);
          return;
        }
        
        // Transform to chart-friendly format
        const formatted = statsArray
          .map(item => ({
            name: item.subcounty_name || 'Unassigned',
            count: item.project_count || 0,
          }))
          .filter(item => item.count > 0) // Only show sub-counties with projects
          .sort((a, b) => b.count - a.count)
          .slice(0, 10); // Top 10 sub-counties
        
        console.log('Sub-county distribution formatted:', formatted.length, 'sub-counties');
        console.log('Sample sub-county data:', formatted.slice(0, 3));
        setCountyDistributionData(formatted);
      } catch (error) {
        console.error('❌ Error fetching sub-county distribution:', error);
        console.error('Error details:', error.response?.data || error.message);
        setCountyDistributionData([]);
      } finally {
        setLoadingCountyData(false);
      }
    };

    // Fetch immediately (doesn't depend on projectStats)
    fetchSubCountyDistribution();
  }, []);

  // Fetch department distribution from public API
  useEffect(() => {
    const fetchDepartmentDistribution = async () => {
      try {
        setLoadingDepartmentData(true);
        console.log('Fetching department distribution from public API...');
        const departmentStats = await apiService.public.getDepartmentStats() || [];
        const statsArray = Array.isArray(departmentStats) ? departmentStats : [];
        console.log('Department stats fetched:', statsArray.length, 'departments');
        
        if (statsArray.length === 0) {
          setDepartmentDistributionData([]);
          return;
        }
        
        // Transform to chart-friendly format - use alias when available, fallback to full name
        const formatted = statsArray
          .map(item => ({
            name: item.departmentAlias || item.department_name || 'Unassigned',
            count: item.total_projects || 0,
          }))
          .filter(item => item.count > 0) // Only show departments with projects
          .sort((a, b) => b.count - a.count)
          .slice(0, 10); // Top 10 departments
        
        console.log('Department distribution formatted:', formatted.length, 'departments');
        console.log('Sample department data:', formatted.slice(0, 3));
        setDepartmentDistributionData(formatted);
      } catch (error) {
        console.error('❌ Error fetching department distribution:', error);
        console.error('Error details:', error.response?.data || error.message);
        setDepartmentDistributionData([]);
      } finally {
        setLoadingDepartmentData(false);
      }
    };

    // Fetch immediately (doesn't depend on projectStats)
    fetchDepartmentDistribution();
  }, []);

  const quickAccessItems = [
    { label: 'Projects', route: ROUTES.PROJECTS, icon: <ProjectsIcon />, color: '#1976d2' },
    { label: 'Dashboard', route: ROUTES.DASHBOARD, icon: <DashboardIcon />, color: '#9c27b0' },
    { label: 'Reports', route: ROUTES.REPORTS, icon: <ReportsIcon />, color: '#4caf50' },
    { label: 'GIS Maps', route: ROUTES.GIS_MAPPING, icon: <MapIcon />, color: '#ff9800' },
    { label: 'Strategic Planning', route: ROUTES.STRATEGIC_PLANNING, icon: <StrategicIcon />, color: '#f44336' },
    { label: 'Data Import', route: '/data-import', icon: <ImportIcon />, color: '#00bcd4' },
  ];

  const metrics = dashboardData?.metrics || {};
  const recentActivity = dashboardData?.recentActivity || [];
  
  // Calculate metrics from actual project data
  const actualMetrics = {
    totalProjects: projectStats.total || 0,
    activeProjects: projectStats.active || 0,
    completedProjects: projectStats.completed || 0,
    pendingApprovals: pendingApprovals.length || metrics.pendingApprovals || 0,
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

        {/* Key Metrics - Compact Design */}
        <Grid container spacing={1.5} sx={{ mb: 2 }}>
          <Grid item xs={6} sm={3}>
            <Card
              elevation={0}
              sx={{
                borderRadius: 1.5,
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                color: 'white',
                transition: 'all 0.3s ease',
                cursor: 'pointer',
                position: 'relative',
                overflow: 'hidden',
                '&:hover': {
                  transform: 'translateY(-2px)',
                  boxShadow: '0 4px 12px rgba(102, 126, 234, 0.3)',
                },
                '&::before': {
                  content: '""',
                  position: 'absolute',
                  top: -15,
                  right: -15,
                  width: '60px',
                  height: '60px',
                  background: 'rgba(255, 255, 255, 0.1)',
                  borderRadius: '50%',
                },
              }}
              onClick={() => navigate(ROUTES.PROJECTS)}
            >
              <CardContent sx={{ p: 1.25, position: 'relative', zIndex: 1, '&:last-child': { pb: 1.25 } }}>
                <Box display="flex" alignItems="center" gap={1} mb={0.75}>
                  <Box
                    sx={{
                      p: 0.75,
                      borderRadius: 1,
                      bgcolor: 'rgba(255, 255, 255, 0.2)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <ProjectsIcon sx={{ fontSize: 20, color: 'white' }} />
                  </Box>
                  <Box flex={1}>
                    <Typography variant="h5" sx={{ fontWeight: 'bold', color: 'white', fontSize: { xs: '1.25rem', sm: '1.5rem' }, lineHeight: 1.2 }}>
                      {loadingProjects ? <CircularProgress size={20} sx={{ color: 'white' }} /> : projectStats.total}
                    </Typography>
                    <Typography variant="caption" sx={{ color: 'rgba(255, 255, 255, 0.85)', fontWeight: 500, fontSize: '0.7rem', display: 'block', mt: 0.25 }}>
                      Total Projects
                    </Typography>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={6} sm={3}>
            <Card
              elevation={0}
              sx={{
                borderRadius: 1.5,
                background: 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)',
                color: 'white',
                transition: 'all 0.3s ease',
                cursor: 'pointer',
                position: 'relative',
                overflow: 'hidden',
                '&:hover': {
                  transform: 'translateY(-2px)',
                  boxShadow: '0 4px 12px rgba(17, 153, 142, 0.3)',
                },
                '&::before': {
                  content: '""',
                  position: 'absolute',
                  top: -15,
                  right: -15,
                  width: '60px',
                  height: '60px',
                  background: 'rgba(255, 255, 255, 0.1)',
                  borderRadius: '50%',
                },
              }}
              onClick={() => navigate(`${ROUTES.PROJECTS}?status=Ongoing`)}
            >
              <CardContent sx={{ p: 1.25, position: 'relative', zIndex: 1, '&:last-child': { pb: 1.25 } }}>
                <Box display="flex" alignItems="center" gap={1} mb={0.75}>
                  <Box
                    sx={{
                      p: 0.75,
                      borderRadius: 1,
                      bgcolor: 'rgba(255, 255, 255, 0.2)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <AnalyticsIcon sx={{ fontSize: 20, color: 'white' }} />
                  </Box>
                  <Box flex={1}>
                    <Typography variant="h5" sx={{ fontWeight: 'bold', color: 'white', fontSize: { xs: '1.25rem', sm: '1.5rem' }, lineHeight: 1.2 }}>
                      {loadingProjects ? <CircularProgress size={20} sx={{ color: 'white' }} /> : projectStats.active}
                    </Typography>
                    <Typography variant="caption" sx={{ color: 'rgba(255, 255, 255, 0.85)', fontWeight: 500, fontSize: '0.7rem', display: 'block', mt: 0.25 }}>
                      Active Projects
                    </Typography>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={6} sm={3}>
            <Card
              elevation={0}
              sx={{
                borderRadius: 1.5,
                background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
                color: 'white',
                transition: 'all 0.3s ease',
                cursor: 'pointer',
                position: 'relative',
                overflow: 'hidden',
                '&:hover': {
                  transform: 'translateY(-2px)',
                  boxShadow: '0 4px 12px rgba(245, 87, 108, 0.3)',
                },
                '&::before': {
                  content: '""',
                  position: 'absolute',
                  top: -15,
                  right: -15,
                  width: '60px',
                  height: '60px',
                  background: 'rgba(255, 255, 255, 0.1)',
                  borderRadius: '50%',
                },
              }}
              onClick={() => navigate(`${ROUTES.PROJECTS}?status=Completed`)}
            >
              <CardContent sx={{ p: 1.25, position: 'relative', zIndex: 1, '&:last-child': { pb: 1.25 } }}>
                <Box display="flex" alignItems="center" gap={1} mb={0.75}>
                  <Box
                    sx={{
                      p: 0.75,
                      borderRadius: 1,
                      bgcolor: 'rgba(255, 255, 255, 0.2)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <CheckCircleIcon sx={{ fontSize: 20, color: 'white' }} />
                  </Box>
                  <Box flex={1}>
                    <Typography variant="h5" sx={{ fontWeight: 'bold', color: 'white', fontSize: { xs: '1.25rem', sm: '1.5rem' }, lineHeight: 1.2 }}>
                      {loadingProjects ? <CircularProgress size={20} sx={{ color: 'white' }} /> : projectStats.completed}
                    </Typography>
                    <Typography variant="caption" sx={{ color: 'rgba(255, 255, 255, 0.85)', fontWeight: 500, fontSize: '0.7rem', display: 'block', mt: 0.25 }}>
                      Completed
                    </Typography>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={6} sm={3}>
            <Card
              elevation={0}
              sx={{
                borderRadius: 1.5,
                background: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
                color: 'white',
                transition: 'all 0.3s ease',
                cursor: 'pointer',
                position: 'relative',
                overflow: 'hidden',
                '&:hover': {
                  transform: 'translateY(-2px)',
                  boxShadow: '0 4px 12px rgba(250, 112, 154, 0.3)',
                },
                '&::before': {
                  content: '""',
                  position: 'absolute',
                  top: -15,
                  right: -15,
                  width: '60px',
                  height: '60px',
                  background: 'rgba(255, 255, 255, 0.1)',
                  borderRadius: '50%',
                },
              }}
            >
              <CardContent sx={{ p: 1.25, position: 'relative', zIndex: 1, '&:last-child': { pb: 1.25 } }}>
                <Box display="flex" alignItems="center" gap={1} mb={0.75}>
                  <Box
                    sx={{
                      p: 0.75,
                      borderRadius: 1,
                      bgcolor: 'rgba(255, 255, 255, 0.2)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <WarningIcon sx={{ fontSize: 20, color: 'white' }} />
                  </Box>
                  <Box flex={1}>
                    <Typography variant="h5" sx={{ fontWeight: 'bold', color: 'white', fontSize: { xs: '1.25rem', sm: '1.5rem' }, lineHeight: 1.2 }}>
                      {loadingProjects ? <CircularProgress size={20} sx={{ color: 'white' }} /> : projectStats.pending}
                    </Typography>
                    <Typography variant="caption" sx={{ color: 'rgba(255, 255, 255, 0.85)', fontWeight: 500, fontSize: '0.7rem', display: 'block', mt: 0.25 }}>
                      Pending
                    </Typography>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        {/* Main Content Grid - Better Space Utilization */}
        <Grid container spacing={2}>
          {/* Quick Access - Left Column */}
          <Grid item xs={12} md={6}>
            <Card 
              elevation={1} 
              sx={{ 
                borderRadius: 2, 
                height: '100%',
                transition: 'all 0.3s ease',
                border: '1px solid',
                borderColor: 'divider',
                '&:hover': {
                  boxShadow: 3,
                }
              }}
            >
              <CardContent sx={{ p: 2 }}>
                <Box display="flex" alignItems="center" gap={1} mb={1.5}>
                  <Box sx={{ p: 0.75, borderRadius: 1, bgcolor: 'primary.main', color: 'white', display: 'flex', alignItems: 'center' }}>
                    <DashboardIcon sx={{ fontSize: 20 }} />
                  </Box>
                  <Typography variant="h6" sx={{ fontWeight: 'bold', fontSize: '1rem' }}>
                    Quick Access
                  </Typography>
                </Box>
                <Grid container spacing={1.5}>
                  {quickAccessItems.map((item, index) => (
                    <Grid item xs={6} sm={4} key={index}>
                      <Button
                        fullWidth
                        variant="contained"
                        startIcon={item.icon}
                        onClick={() => navigate(item.route)}
                        size="small"
                        sx={{
                          p: 1.25,
                          borderRadius: 1.5,
                          bgcolor: item.color,
                          color: 'white',
                          textTransform: 'none',
                          justifyContent: 'flex-start',
                          fontWeight: 600,
                          fontSize: '0.8rem',
                          boxShadow: `0 2px 8px ${item.color}40`,
                          '&:hover': {
                            bgcolor: item.color,
                            transform: 'translateY(-2px)',
                            boxShadow: `0 4px 12px ${item.color}60`,
                          },
                          transition: 'all 0.3s ease',
                        }}
                      >
                        {item.label}
                      </Button>
                    </Grid>
                  ))}
                </Grid>
              </CardContent>
            </Card>
          </Grid>

          {/* Recent Projects */}
          <Grid item xs={12} md={4}>
            <Card 
              elevation={2} 
              sx={{ 
                borderRadius: 2, 
                height: '100%',
                transition: 'all 0.3s ease',
                '&:hover': {
                  boxShadow: 4,
                }
              }}
            >
              <CardContent sx={{ p: 1.25 }}>
                <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 'bold', fontSize: '0.875rem' }}>
                    Recent Projects
                  </Typography>
                  <Button
                    size="small"
                    endIcon={<ArrowForwardIcon />}
                    onClick={() => navigate(ROUTES.PROJECTS)}
                    sx={{ 
                      textTransform: 'none',
                      fontSize: '0.8rem',
                      fontWeight: 600,
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
                            '&:hover': {
                              bgcolor: 'action.hover',
                            },
                          }}
                        >
                          <ListItemIcon>
                            <ProjectsIcon sx={{ color: '#1976d2' }} />
                          </ListItemIcon>
                          <ListItemText
                            primary={project.projectName || 'Untitled Project'}
                            secondary={project.status || 'Unknown Status'}
                            primaryTypographyProps={{
                              variant: 'body2',
                              fontWeight: 600,
                            }}
                            secondaryTypographyProps={{
                              variant: 'caption',
                            }}
                          />
                        </ListItem>
                        {index < recentProjects.length - 1 && <Divider />}
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

          {/* Recent Activity & Notifications */}
          <Grid item xs={12} md={4}>
            <Card 
              elevation={2} 
              sx={{ 
                borderRadius: 2, 
                height: '100%',
                transition: 'all 0.3s ease',
                '&:hover': {
                  boxShadow: 4,
                }
              }}
            >
              <CardContent sx={{ p: 1.75 }}>
                <Box display="flex" justifyContent="space-between" alignItems="center" mb={2.5}>
                  <Typography variant="h6" sx={{ fontWeight: 'bold', fontSize: '1.15rem' }}>
                    Recent Activity
                  </Typography>
                  <NotificationsIcon sx={{ color: 'text.secondary', fontSize: 22 }} />
                </Box>
                {dashboardData.loading ? (
                  <Box display="flex" justifyContent="center" p={2}>
                    <CircularProgress size={24} />
                  </Box>
                ) : recentActivity.length > 0 ? (
                  <List sx={{ p: 0 }}>
                    {recentActivity.slice(0, 5).map((activity, index) => (
                      <React.Fragment key={activity.id || index}>
                        <ListItem sx={{ px: 0, py: 1 }}>
                          <ListItemIcon>
                            <ScheduleIcon sx={{ color: '#9c27b0', fontSize: 20 }} />
                          </ListItemIcon>
                          <ListItemText
                            primary={activity.action}
                            secondary={activity.time}
                            primaryTypographyProps={{
                              variant: 'body2',
                              fontWeight: 500,
                            }}
                            secondaryTypographyProps={{
                              variant: 'caption',
                              color: 'text.secondary',
                            }}
                          />
                        </ListItem>
                        {index < Math.min(recentActivity.length, 5) - 1 && <Divider />}
                      </React.Fragment>
                    ))}
                  </List>
                ) : (
                  <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 3 }}>
                    No recent activity
                  </Typography>
                )}
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        {/* New Sections Row */}
        <Grid container spacing={2} sx={{ mt: 1.5 }}>
          {/* Upcoming Milestones */}
          <Grid item xs={12} md={6}>
            <Card elevation={2} sx={{ borderRadius: 2, height: '100%' }}>
              <CardContent sx={{ p: 1.25 }}>
                <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
                  <Box display="flex" alignItems="center" gap={0.75}>
                    <EventIcon sx={{ color: '#ff9800', fontSize: 20 }} />
                    <Typography variant="subtitle1" sx={{ fontWeight: 'bold', fontSize: '0.875rem' }}>
                      Upcoming Milestones
                    </Typography>
                  </Box>
                  <Chip 
                    label={upcomingMilestones.length} 
                    size="small" 
                    sx={{ bgcolor: '#ff980015', color: '#ff9800', fontWeight: 'bold' }}
                  />
                </Box>
                {loadingMilestones ? (
                  <Box display="flex" justifyContent="center" p={3}>
                    <CircularProgress size={24} />
                  </Box>
                ) : upcomingMilestones.length > 0 ? (
                  <List sx={{ p: 0 }}>
                    {upcomingMilestones.map((milestone, index) => {
                      const dueDate = new Date(milestone.dueDate);
                      const daysUntil = Math.ceil((dueDate - new Date()) / (1000 * 60 * 60 * 24));
                      const isUrgent = daysUntil <= 3;
                      
                      return (
                        <React.Fragment key={milestone.milestoneId || index}>
                          <ListItem
                            button
                            onClick={() => navigate(`${ROUTES.PROJECTS}/${milestone.projectId}`)}
                            sx={{
                              borderRadius: 1,
                              mb: 0.5,
                              bgcolor: isUrgent ? '#fff3e015' : 'transparent',
                              '&:hover': {
                                bgcolor: isUrgent ? '#fff3e025' : 'action.hover',
                              },
                            }}
                          >
                            <ListItemIcon>
                              <ScheduleIcon sx={{ color: isUrgent ? '#f44336' : '#ff9800', fontSize: 20 }} />
                            </ListItemIcon>
                            <ListItemText
                              primary={
                                <Box display="flex" justifyContent="space-between" alignItems="center">
                                  <Typography variant="body2" sx={{ fontWeight: 600, flex: 1 }}>
                                    {milestone.milestoneName || 'Untitled Milestone'}
                                  </Typography>
                                  <Chip
                                    label={daysUntil === 0 ? 'Today' : `${daysUntil}d left`}
                                    size="small"
                                    sx={{
                                      bgcolor: isUrgent ? '#f4433615' : '#ff980015',
                                      color: isUrgent ? '#f44336' : '#ff9800',
                                      fontSize: '0.7rem',
                                      height: 20,
                                    }}
                                  />
                                </Box>
                              }
                              secondary={
                                <Typography variant="caption" color="text.secondary">
                                  {milestone.projectName} • {dueDate.toLocaleDateString()}
                                </Typography>
                              }
                            />
                          </ListItem>
                          {index < upcomingMilestones.length - 1 && <Divider />}
                        </React.Fragment>
                      );
                    })}
                  </List>
                ) : (
                  <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 3 }}>
                    No upcoming milestones in the next 14 days
                  </Typography>
                )}
              </CardContent>
            </Card>
          </Grid>

          {/* Pending Approvals */}
          <Grid item xs={12} md={6}>
            <Card elevation={2} sx={{ borderRadius: 2, height: '100%' }}>
              <CardContent sx={{ p: 1.25 }}>
                <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
                  <Box display="flex" alignItems="center" gap={0.75}>
                    <ApprovalIcon sx={{ color: '#9c27b0', fontSize: 20 }} />
                    <Typography variant="subtitle1" sx={{ fontWeight: 'bold', fontSize: '0.875rem' }}>
                      Pending Approvals
                    </Typography>
                  </Box>
                  <Chip 
                    label={pendingApprovals.length} 
                    size="small" 
                    sx={{ bgcolor: '#9c27b015', color: '#9c27b0', fontWeight: 'bold' }}
                  />
                </Box>
                {loadingApprovals ? (
                  <Box display="flex" justifyContent="center" p={3}>
                    <CircularProgress size={24} />
                  </Box>
                ) : pendingApprovals.length > 0 ? (
                  <List sx={{ p: 0 }}>
                    {pendingApprovals.map((approval, index) => (
                      <React.Fragment key={approval.requestId || index}>
                        <ListItem
                          button
                          onClick={() => navigate(`${ROUTES.PROJECTS}/${approval.projectId}`)}
                          sx={{
                            borderRadius: 1,
                            mb: 0.5,
                            '&:hover': {
                              bgcolor: 'action.hover',
                            },
                          }}
                        >
                          <ListItemIcon>
                            <ApprovalIcon sx={{ color: '#9c27b0', fontSize: 20 }} />
                          </ListItemIcon>
                          <ListItemText
                            primary={
                              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                Payment Request #{approval.requestId}
                              </Typography>
                            }
                            secondary={
                              <Typography variant="caption" color="text.secondary">
                                {approval.projectName} • {approval.status || 'Pending'}
                              </Typography>
                            }
                          />
                        </ListItem>
                        {index < pendingApprovals.length - 1 && <Divider />}
                      </React.Fragment>
                    ))}
                  </List>
                ) : (
                  <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 3 }}>
                    No pending approvals
                  </Typography>
                )}
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        {/* Project Distribution Charts */}
        <Grid container spacing={2} sx={{ mt: 1.5 }}>
          {/* Projects by Category */}
          <Grid item xs={12} md={4}>
            <Card elevation={1} sx={{ borderRadius: 2, border: '1px solid', borderColor: 'divider', height: '100%' }}>
              <CardContent sx={{ p: 2 }}>
                <Box display="flex" alignItems="center" gap={1} mb={1.5}>
                  <Box sx={{ p: 0.75, borderRadius: 1, bgcolor: '#1976d215', display: 'flex', alignItems: 'center' }}>
                    <ProjectsIcon sx={{ color: '#1976d2', fontSize: 20 }} />
                  </Box>
                  <Typography variant="h6" sx={{ fontWeight: 'bold', fontSize: '1rem' }}>
                    Projects by Category
                  </Typography>
                </Box>
                {loadingCategoryData ? (
                  <Box display="flex" justifyContent="center" p={3}>
                    <CircularProgress size={24} />
                  </Box>
                ) : projectCategoryData.length > 0 ? (
                  <BarChart
                    title=""
                    data={projectCategoryData}
                    xDataKey="name"
                    yDataKey="count"
                    yAxisLabel="Number of Projects"
                    horizontal={true}
                  />
                ) : (
                  <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 3 }}>
                    No category data available
                  </Typography>
                )}
              </CardContent>
            </Card>
          </Grid>

          {/* Projects by Sub-county */}
          <Grid item xs={12} md={4}>
            <Card elevation={1} sx={{ borderRadius: 2, border: '1px solid', borderColor: 'divider', height: '100%' }}>
              <CardContent sx={{ p: 2 }}>
                <Box display="flex" alignItems="center" gap={1} mb={1.5}>
                  <Box sx={{ p: 0.75, borderRadius: 1, bgcolor: '#4caf5015', display: 'flex', alignItems: 'center' }}>
                    <MapIcon sx={{ color: '#4caf50', fontSize: 20 }} />
                  </Box>
                  <Typography variant="h6" sx={{ fontWeight: 'bold', fontSize: '1rem' }}>
                    Projects by Sub-county
                  </Typography>
                </Box>
                {loadingCountyData ? (
                  <Box display="flex" justifyContent="center" p={3}>
                    <CircularProgress size={24} />
                  </Box>
                ) : countyDistributionData.length > 0 ? (
                  <BarChart
                    title=""
                    data={countyDistributionData}
                    xDataKey="name"
                    yDataKey="count"
                    yAxisLabel="Number of Projects"
                    horizontal={true}
                  />
                ) : (
                  <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 3 }}>
                    No sub-county data available
                  </Typography>
                )}
              </CardContent>
            </Card>
          </Grid>

          {/* Projects by Department */}
          <Grid item xs={12} md={4}>
            <Card elevation={1} sx={{ borderRadius: 2, border: '1px solid', borderColor: 'divider', height: '100%' }}>
              <CardContent sx={{ p: 2 }}>
                <Box display="flex" alignItems="center" gap={1} mb={1.5}>
                  <Box sx={{ p: 0.75, borderRadius: 1, bgcolor: '#ff980015', display: 'flex', alignItems: 'center' }}>
                    <BusinessIcon sx={{ color: '#ff9800', fontSize: 20 }} />
                  </Box>
                  <Typography variant="h6" sx={{ fontWeight: 'bold', fontSize: '1rem' }}>
                    Projects by Department
                  </Typography>
                </Box>
                {loadingDepartmentData ? (
                  <Box display="flex" justifyContent="center" p={3}>
                    <CircularProgress size={24} />
                  </Box>
                ) : departmentDistributionData.length > 0 ? (
                  <BarChart
                    title=""
                    data={departmentDistributionData}
                    xDataKey="name"
                    yDataKey="count"
                    yAxisLabel="Number of Projects"
                    horizontal={true}
                  />
                ) : (
                  <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 3 }}>
                    No department data available
                  </Typography>
                )}
              </CardContent>
            </Card>
          </Grid>

          {/* Project Status Distribution */}
          <Grid item xs={12}>
            <Card elevation={1} sx={{ borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
              <CardContent sx={{ p: 2 }}>
                <Box display="flex" alignItems="center" gap={1} mb={1.5}>
                  <Box sx={{ p: 0.75, borderRadius: 1, bgcolor: '#9c27b015', display: 'flex', alignItems: 'center' }}>
                    <PieChartIcon sx={{ color: '#9c27b0', fontSize: 20 }} />
                  </Box>
                  <Typography variant="h6" sx={{ fontWeight: 'bold', fontSize: '1rem' }}>
                    Project Status Distribution
                  </Typography>
                </Box>
                {loadingStatusData ? (
                  <Box display="flex" justifyContent="center" p={2}>
                    <CircularProgress size={24} />
                  </Box>
                ) : projectStatusData.length > 0 ? (
                  <Grid container spacing={2}>
                    {projectStatusData.map((status, index) => {
                      const total = projectStatusData.reduce((sum, s) => sum + s.count, 0);
                      const percentage = total > 0 ? ((status.count / total) * 100).toFixed(1) : 0;
                      const getStatusColor = (statusName) => {
                        const name = (statusName || '').toLowerCase();
                        if (name.includes('ongoing') || name.includes('progress')) return '#4caf50';
                        if (name.includes('completed')) return '#9c27b0';
                        if (name.includes('pending') || name.includes('initiated')) return '#ff9800';
                        if (name.includes('stalled') || name.includes('delayed')) return '#f44336';
                        return '#1976d2';
                      };
                      
                      return (
                        <Grid item xs={6} sm={4} md={3} key={index}>
                          <Box
                            sx={{
                              p: 1.5,
                              borderRadius: 2,
                              bgcolor: `${getStatusColor(status.status)}10`,
                              border: `1px solid ${getStatusColor(status.status)}30`,
                            }}
                          >
                            <Box display="flex" alignItems="center" gap={1} mb={1}>
                              <Box
                                sx={{
                                  width: 12,
                                  height: 12,
                                  borderRadius: '50%',
                                  bgcolor: getStatusColor(status.status),
                                }}
                              />
                              <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.875rem' }}>
                                {status.status || 'Unknown'}
                              </Typography>
                            </Box>
                            <Typography variant="h5" sx={{ fontWeight: 'bold', color: getStatusColor(status.status) }}>
                              {status.count}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {percentage}% of total
                            </Typography>
                          </Box>
                        </Grid>
                      );
                    })}
                  </Grid>
                ) : (
                  <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 3 }}>
                    No status data available
                  </Typography>
                )}
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        {/* System Overview Section */}
        <Grid container spacing={2} sx={{ mt: 1.5 }}>
          <Grid item xs={12} md={4}>
            <Card elevation={2} sx={{ borderRadius: 2 }}>
              <CardContent sx={{ p: 2 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 'bold', mb: 1, fontSize: '0.875rem' }}>
                  System Overview
                </Typography>
                <Grid container spacing={2}>
                  <Grid item xs={12}>
                    <Box>
                      <Typography variant="body2" color="text.secondary" gutterBottom sx={{ fontSize: '0.875rem' }}>
                        Budget Utilization
                      </Typography>
                      <Box display="flex" alignItems="center" gap={2}>
                        <LinearProgress
                          variant="determinate"
                          value={actualMetrics.budgetUtilization || 0}
                          sx={{ flexGrow: 1, height: 8, borderRadius: 1 }}
                        />
                        <Typography variant="body2" sx={{ fontWeight: 'bold', minWidth: 45, fontSize: '0.875rem' }}>
                          {actualMetrics.budgetUtilization || 0}%
                        </Typography>
                      </Box>
                    </Box>
                  </Grid>
                  <Grid item xs={6}>
                    <Box>
                      <Typography variant="body2" color="text.secondary" gutterBottom sx={{ fontSize: '0.875rem' }}>
                        Pending Approvals
                      </Typography>
                      <Typography variant="h5" sx={{ fontWeight: 'bold', color: '#ff9800' }}>
                        {actualMetrics.pendingApprovals || 0}
                      </Typography>
                    </Box>
                  </Grid>
                  <Grid item xs={6}>
                    <Box>
                      <Typography variant="body2" color="text.secondary" gutterBottom sx={{ fontSize: '0.875rem' }}>
                        Team Members
                      </Typography>
                      <Typography variant="h5" sx={{ fontWeight: 'bold', color: '#1976d2' }}>
                        {actualMetrics.teamMembers || 0}
                      </Typography>
                    </Box>
                  </Grid>
                </Grid>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </Container>
    </Box>
  );
};

export default HomePage;
