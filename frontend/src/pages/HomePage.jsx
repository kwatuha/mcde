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
  PieChart as PieChartIcon,
  Business as BusinessIcon,
  Apartment as ApartmentIcon,
} from '@mui/icons-material';
import { useAuth } from '../context/AuthContext';
import { ROUTES } from '../configs/appConfig';
import logo from '../assets/logo.png';
import apiService from '../api';
import useDashboardData from '../hooks/useDashboardData';

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

  // Cache full project list once so we don't refetch it in multiple effects
  const [allProjects, setAllProjects] = useState([]);

  const [recentProjects, setRecentProjects] = useState([]);
  const [loadingProjects, setLoadingProjects] = useState(true);

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
            
            const recent = projects.slice(0, 5).map(p => ({
              id: p.id,
              projectName: p.projectName || p.project_name || 'Untitled Project',
              status: p.status || 'Unknown',
              createdAt: p.createdAt,
              startDate: p.startDate || p.start_date,
            }));
            setRecentProjects(recent);
            setAllProjects(projects); // Store limited set for milestones
          } catch (err) {
            setRecentProjects([]);
            setAllProjects([]);
          }
          return;
        }
        
        // Fallback: Get limited project list only if stats API fails
        let response;
        try {
          response = await apiService.projects.getProjects({ limit: 50 }); // Limit to 50 instead of all
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



      </Container>
    </Box>
  );
};

export default HomePage;
