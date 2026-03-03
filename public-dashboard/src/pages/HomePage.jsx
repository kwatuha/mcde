import React, { useState, useEffect } from 'react';
import {
  Container,
  Grid,
  Typography,
  Box,
  Button,
  Paper,
  CircularProgress,
  Alert,
  Card,
  CardContent,
  Divider,
  Avatar,
  Chip
} from '@mui/material';
import {
  CheckCircle,
  Construction,
  HourglassEmpty,
  ShoppingCart,
  Warning,
  Assessment,
  Dashboard,
  Business,
  LocationOn,
  PhotoLibrary,
  Feedback,
  ArrowForward,
  TrendingUp,
  Engineering,
  Public,
  MoreHoriz
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import StatCard from '../components/StatCard';
import ProjectsModal from '../components/ProjectsModal';
import { getOverviewStats } from '../services/publicApi';

const HomePage = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalConfig, setModalConfig] = useState({ filterType: '', filterValue: '', title: '' });

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      setLoading(true);
      const data = await getOverviewStats();
      setStats(data);
      setError(null);
    } catch (err) {
      console.error('Error fetching stats:', err);
      setError('Failed to load statistics. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="80vh">
        <CircularProgress size={60} />
      </Box>
    );
  }

  if (error) {
    return (
      <Container maxWidth="lg" sx={{ mt: 4 }}>
        <Alert severity="error" onClose={() => setError(null)}>
          {error}
        </Alert>
      </Container>
    );
  }

  const handleCardClick = (status, title) => {
    setModalConfig({
      filterType: status === 'all' ? '' : 'status',
      filterValue: status === 'all' ? '' : status,
      title: title
    });
    setModalOpen(true);
  };

  const statsCards = [
    {
      title: 'All Projects',
      count: stats?.total_projects || 0,
      budget: stats?.total_budget || 0,
      color: '#1976d2',
      icon: Assessment,
      onClick: () => handleCardClick('all', 'All Projects')
    },
    {
      title: 'Completed Projects',
      count: stats?.completed_projects || 0,
      budget: stats?.completed_budget || 0,
      color: '#4caf50',
      icon: CheckCircle,
      onClick: () => handleCardClick('Completed', 'Completed Projects')
    },
    {
      title: 'Ongoing Projects',
      count: stats?.ongoing_projects || 0,
      budget: stats?.ongoing_budget || 0,
      color: '#2196f3',
      icon: Construction,
      onClick: () => handleCardClick('Ongoing', 'Ongoing Projects')
    },
    {
      title: 'Not Started Projects',
      count: stats?.not_started_projects || 0,
      budget: stats?.not_started_budget || 0,
      color: '#ff9800',
      icon: HourglassEmpty,
      onClick: () => handleCardClick('Not Started', 'Not Started Projects')
    },
    {
      title: 'Under Procurement Projects',
      count: stats?.under_procurement_projects || 0,
      budget: stats?.under_procurement_budget || 0,
      color: '#9c27b0',
      icon: ShoppingCart,
      onClick: () => handleCardClick('Under Procurement', 'Under Procurement Projects')
    },
    {
      title: 'Stalled Projects',
      count: stats?.stalled_projects || 0,
      budget: stats?.stalled_budget || 0,
      color: '#f44336',
      icon: Warning,
      onClick: () => handleCardClick('Stalled', 'Stalled Projects')
    },
    {
      title: 'Other Projects',
      count: stats?.other_projects || 0,
      budget: stats?.other_budget || 0,
      color: '#9e9e9e',
      icon: MoreHoriz,
      onClick: () => handleCardClick('Other', 'Other Projects')
    }
  ];

  return (
    <Box>
      {/* Logo and Header Section */}
      <Box
        sx={{
          background: 'linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%)',
          py: 3,
          borderBottom: '2px solid #dee2e6',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
        }}
      >
        <Container maxWidth="lg">
          <Grid container spacing={0} sx={{ py: 2 }} alignItems="center">
            {/* Logo Container */}
            <Grid item xs={12} md={3} sx={{ display: 'flex', justifyContent: { xs: 'center', md: 'flex-end' }, pr: { md: 2 } }}>
            </Grid>
            
            {/* Text Container */}
            <Grid item xs={12} md={9}>
              <Box 
                textAlign={{ xs: 'center', md: 'left' }}
                sx={{ 
                  display: 'flex', 
                  flexDirection: 'column', 
                  justifyContent: 'center',
                  height: '100%'
                }}
              >
                <Typography 
                  variant="h3" 
                  fontWeight={700} 
                  sx={{ 
                    margin: 0, 
                    mb: 1,
                    lineHeight: 1.1,
                    background: 'linear-gradient(135deg, #1976d2 0%, #42a5f5 50%, #64b5f6 100%)',
                    backgroundClip: 'text',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    letterSpacing: '-0.02em',
                    fontSize: { xs: '2rem', md: '2.5rem' }
                  }}
                >
                  CivicChat
                </Typography>
                <Typography 
                  variant="h5" 
                  color="#64748b" 
                  sx={{ 
                    fontWeight: 500, 
                    margin: 0, 
                    mb: 1,
                    lineHeight: 1.2,
                    letterSpacing: '0.05em',
                    textTransform: 'uppercase',
                    fontSize: { xs: '0.875rem', md: '1rem' }
                  }}
                >
                  CivicChat Portal
                </Typography>
                <Typography 
                  variant="body1" 
                  color="#6c757d" 
                  sx={{ 
                    margin: 0, 
                    opacity: 0.8,
                    lineHeight: 1.3
                  }}
                >
                  Empowering Transparency • Building Communities • Delivering Results
                </Typography>
              </Box>
            </Grid>
          </Grid>
        </Container>
      </Box>

      {/* Hero Section with Road Construction Photo */}
      <Box
        sx={{
          position: 'relative',
          background: 'linear-gradient(135deg, #1976d2 0%, #1565c0 100%)',
          color: 'white',
          py: 8,
          mb: 6,
          overflow: 'hidden'
        }}
      >
        {/* Background Pattern */}
        <Box
          sx={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'url("data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cpath d=\'M0 0h60v60H0z\' fill=\'none\'/%3E%3Cpath d=\'M30 30a15 15 0 1 0 30 0 15 15 0 1 0-30 0\' fill=\'%23fff\' opacity=\'0.05\'/%3E%3C/svg%3E")',
            opacity: 0.1
          }}
        />
        
        <Container maxWidth="lg" sx={{ position: 'relative', zIndex: 1 }}>
          <Grid container spacing={4} alignItems="center">
            <Grid item xs={12} md={6}>
              <Typography variant="h3" fontWeight="bold" gutterBottom>
                Building Together
          </Typography>
              <Typography variant="h5" sx={{ mb: 2, opacity: 0.9, fontWeight: 600 }}>
                Infrastructure Development in Progress
          </Typography>
              <Typography variant="h6" sx={{ mb: 4, opacity: 0.8 }}>
            A Unified Platform For Transparency And Accountability
          </Typography>
              <Box display="flex" gap={2} flexWrap="wrap" sx={{ mb: 3 }}>
            <Button
              variant="contained"
              size="large"
              onClick={() => navigate('/dashboard')}
              sx={{
                backgroundColor: 'white',
                color: '#1976d2',
                    px: 4,
                    py: 1.5,
                    fontSize: '1.1rem',
                    fontWeight: 'bold',
                    borderRadius: 3,
                    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                '&:hover': {
                      backgroundColor: '#f5f5f5',
                      transform: 'translateY(-2px)',
                      boxShadow: '0 6px 16px rgba(0,0,0,0.2)'
                    },
                    transition: 'all 0.3s ease'
              }}
            >
              View Dashboard
            </Button>
            <Button
              variant="outlined"
              size="large"
              onClick={() => navigate('/projects')}
              sx={{
                borderColor: 'white',
                color: 'white',
                    px: 4,
                    py: 1.5,
                    fontSize: '1.1rem',
                    fontWeight: 'bold',
                    borderRadius: 3,
                    borderWidth: 2,
                '&:hover': {
                  borderColor: 'white',
                      backgroundColor: 'rgba(255, 255, 255, 0.1)',
                      transform: 'translateY(-2px)',
                      boxShadow: '0 6px 16px rgba(0,0,0,0.2)'
                    },
                    transition: 'all 0.3s ease'
              }}
            >
              Browse Projects
            </Button>
          </Box>
              <Box display="flex" gap={4} flexWrap="wrap" sx={{ mt: 2 }}>
                <Box display="flex" alignItems="center" gap={1}>
                  <CheckCircle sx={{ color: '#4caf50', fontSize: 20 }} />
                  <Typography variant="body2" color="white" sx={{ opacity: 0.9 }}>
                    Real-time Project Tracking
                  </Typography>
                </Box>
                <Box display="flex" alignItems="center" gap={1}>
                  <Public sx={{ color: '#4caf50', fontSize: 20 }} />
                  <Typography variant="body2" color="white" sx={{ opacity: 0.9 }}>
                    Public Transparency
                  </Typography>
                </Box>
                <Box display="flex" alignItems="center" gap={1}>
                  <TrendingUp sx={{ color: '#4caf50', fontSize: 20 }} />
                  <Typography variant="body2" color="white" sx={{ opacity: 0.9 }}>
                    Progress Monitoring
                  </Typography>
                </Box>
              </Box>
            </Grid>
            
            <Grid item xs={12} md={6}>
              <Paper
                elevation={8}
                sx={{
                  borderRadius: 3,
                  overflow: 'hidden',
                  position: 'relative'
                }}
              >
                <Box
                  sx={{
                    background: 'linear-gradient(45deg, #ff6b35, #f7931e)',
                    p: 3,
                    color: 'white',
                    textAlign: 'center'
                  }}
                >
                  <Typography variant="h5" fontWeight="bold" sx={{ mb: 1 }}>
                    Wells-Walgudha Road Project
                  </Typography>
                  <Chip
                    label="29.1% Complete"
                    sx={{
                      backgroundColor: 'rgba(255, 255, 255, 0.2)',
                      color: 'white',
                      fontWeight: 'bold',
                      fontSize: '0.9rem',
                      px: 2,
                      py: 0.5
                    }}
                  />
                </Box>
                <Box
                  sx={{
                    height: 450,
                    backgroundImage: 'url("/images/wells-walgudha-road.jpg")',
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    backgroundRepeat: 'no-repeat',
                    display: 'flex',
                    alignItems: 'flex-end',
                    justifyContent: 'center',
                    pb: 3,
                    borderRadius: 2,
                    overflow: 'hidden',
                    position: 'relative',
                    '&::before': {
                      content: '""',
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      background: 'linear-gradient(to bottom, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0.3) 100%)',
                      zIndex: 1
                    }
                  }}
                >
                  <Box
                    sx={{
                      backgroundColor: 'rgba(0, 0, 0, 0.8)',
                      color: 'white',
                      px: 3,
                      py: 2,
                      borderRadius: 3,
                      textAlign: 'center',
                      position: 'relative',
                      zIndex: 2,
                      backdropFilter: 'blur(10px)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      maxWidth: '95%',
                      mx: 'auto'
                    }}
                  >
                    <Typography variant="body1" fontWeight="bold" gutterBottom>
                      Infrastructure Development in Progress
                    </Typography>
                    <Typography variant="body2" sx={{ opacity: 0.9 }}>
                      Connecting Communities • Building Futures
                    </Typography>
                  </Box>
                </Box>
              </Paper>
            </Grid>
          </Grid>
        </Container>
      </Box>

      {/* Featured Project Section */}
      <Container maxWidth="lg" sx={{ mb: 8 }}>
        <Typography variant="h4" fontWeight="bold" gutterBottom align="center" sx={{ mb: 4 }}>
          Featured Project
        </Typography>
        
        <Paper
          elevation={6}
          sx={{
            borderRadius: 4,
            overflow: 'hidden',
            background: 'linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%)',
            border: '1px solid #e9ecef'
          }}
        >
          <Grid container>
            <Grid item xs={12} md={6}>
              <Box sx={{ p: 4 }}>
                <Box display="flex" alignItems="center" gap={2} mb={3}>
                  <Engineering sx={{ fontSize: 40, color: '#1976d2' }} />
                  <Box>
                    <Typography variant="h5" fontWeight="bold" color="#2c3e50">
                      Wells-Walgudha Road
                    </Typography>
                    <Typography variant="body1" color="#6c757d">
                      Infrastructure Development Project
                    </Typography>
                  </Box>
                </Box>
                
                <Typography variant="body1" color="text.secondary" paragraph>
                  This critical infrastructure project aims to improve connectivity between Wells and Walgudha areas, 
                  enhancing transportation efficiency and supporting local economic development.
                </Typography>
                
                <Grid container spacing={2} sx={{ mb: 3 }}>
                  <Grid item xs={6}>
                    <Box textAlign="center" p={2} sx={{ backgroundColor: '#e3f2fd', borderRadius: 2 }}>
                      <Typography variant="h6" fontWeight="bold" color="#1976d2">
                        29.1%
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Completion
                      </Typography>
                    </Box>
                  </Grid>
                  <Grid item xs={6}>
                    <Box textAlign="center" p={2} sx={{ backgroundColor: '#f3e5f5', borderRadius: 2 }}>
                      <Typography variant="h6" fontWeight="bold" color="#9c27b0">
                        Ongoing
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Status
                      </Typography>
                    </Box>
                  </Grid>
                </Grid>
                
                <Box display="flex" gap={2} flexWrap="wrap">
                  <Chip
                    icon={<TrendingUp />}
                    label="Infrastructure"
                    color="primary"
                    variant="outlined"
                  />
                  <Chip
                    icon={<Public />}
                    label="Public Works"
                    color="secondary"
                    variant="outlined"
                  />
                  <Chip
                    icon={<LocationOn />}
                    label="Wells-Walgudha"
                    color="default"
                    variant="outlined"
                  />
                </Box>
              </Box>
            </Grid>
            
            <Grid item xs={12} md={6}>
              <Box
                sx={{
                  height: { xs: 400, md: '100%' },
                  backgroundImage: 'url("/images/wells-walgudha-road.jpg")',
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                  backgroundRepeat: 'no-repeat',
                  position: 'relative',
                  display: 'flex',
                  alignItems: 'flex-end',
                  justifyContent: 'center',
                  pb: 4,
                  borderRadius: 3,
                  overflow: 'hidden',
                  '&::before': {
                    content: '""',
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'linear-gradient(to bottom, rgba(0,0,0,0.2) 0%, rgba(0,0,0,0.6) 100%)',
                    zIndex: 1
                  }
                }}
              >
                <Box
                  sx={{
                    backgroundColor: 'rgba(0, 0, 0, 0.85)',
                    color: 'white',
                    px: 4,
                    py: 3,
                    borderRadius: 4,
                    textAlign: 'center',
                    position: 'relative',
                    zIndex: 2,
                    backdropFilter: 'blur(15px)',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                    maxWidth: '95%',
                    mx: 'auto',
                    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)'
                  }}
                >
                  <Typography variant="h5" fontWeight="bold" gutterBottom>
                    Wells-Walgudha Road Progress
                  </Typography>
                  <Typography variant="body1" sx={{ opacity: 0.9, mb: 1 }}>
                    Sub-base layer processing • Km 0+560-0+750
                  </Typography>
                  <Typography variant="body1" sx={{ opacity: 0.9 }}>
                    GCS base layer and priming • Km 0+030-0+180
                  </Typography>
                </Box>
              </Box>
            </Grid>
          </Grid>
        </Paper>
      </Container>

      {/* Project Gallery Section */}
      <Container maxWidth="lg" sx={{ mb: 8 }}>
        <Typography variant="h4" fontWeight="bold" gutterBottom align="center" sx={{ mb: 4 }}>
          Project Gallery
        </Typography>
        <Typography variant="body1" color="text.secondary" align="center" sx={{ mb: 4 }}>
          See the progress and leadership involvement in our infrastructure development projects
        </Typography>
        
        <Grid container spacing={3}>
          <Grid item xs={12} sm={6} md={3}>
            <Card
              elevation={4}
              sx={{
                borderRadius: 3,
                overflow: 'hidden',
                transition: 'all 0.3s ease',
                '&:hover': {
                  transform: 'translateY(-8px)',
                  boxShadow: 8
                }
              }}
            >
              <Box
                sx={{
                  height: 250,
                  backgroundImage: 'url("images/governor_coming_out_of_road_machine.jpg")',
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                  position: 'relative',
                  '&::before': {
                    content: '""',
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'linear-gradient(to bottom, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0.4) 100%)',
                    zIndex: 1
                  }
                }}
              >
                <Box
                  sx={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    p: 2,
                    zIndex: 2
                  }}
                >
                  <Typography variant="body2" color="white" fontWeight="bold">
                    Governor Inspecting Road Equipment
                  </Typography>
                </Box>
              </Box>
            </Card>
          </Grid>
          
          <Grid item xs={12} sm={6} md={3}>
            <Card
              elevation={4}
              sx={{
                borderRadius: 3,
                overflow: 'hidden',
                transition: 'all 0.3s ease',
                '&:hover': {
                  transform: 'translateY(-8px)',
                  boxShadow: 8
                }
              }}
            >
              <Box
                sx={{
                  height: 250,
                  backgroundImage: 'url("images/governor_driving_road_equipment.jpg")',
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                  position: 'relative',
                  '&::before': {
                    content: '""',
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'linear-gradient(to bottom, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0.4) 100%)',
                    zIndex: 1
                  }
                }}
              >
                <Box
                  sx={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    p: 2,
                    zIndex: 2
                  }}
                >
                  <Typography variant="body2" color="white" fontWeight="bold">
                    Hands-On Leadership
                  </Typography>
                </Box>
              </Box>
            </Card>
          </Grid>
          
          <Grid item xs={12} sm={6} md={3}>
            <Card
              elevation={4}
              sx={{
                borderRadius: 3,
                overflow: 'hidden',
                transition: 'all 0.3s ease',
                '&:hover': {
                  transform: 'translateY(-8px)',
                  boxShadow: 8
                }
              }}
            >
              <Box
                sx={{
                  height: 250,
                  backgroundImage: 'url("images/governor_greeting.jpg")',
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                  position: 'relative',
                  '&::before': {
                    content: '""',
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'linear-gradient(to bottom, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0.4) 100%)',
                    zIndex: 1
                  }
                }}
              >
                <Box
                  sx={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    p: 2,
                    zIndex: 2
                  }}
                >
                  <Typography variant="body2" color="white" fontWeight="bold">
                    Community Engagement
                  </Typography>
                </Box>
              </Box>
            </Card>
          </Grid>
          
          <Grid item xs={12} sm={6} md={3}>
            <Card
              elevation={4}
              sx={{
                borderRadius: 3,
                overflow: 'hidden',
                transition: 'all 0.3s ease',
                '&:hover': {
                  transform: 'translateY(-8px)',
                  boxShadow: 8
                }
              }}
            >
              <Box
                sx={{
                  height: 250,
                  backgroundImage: 'url("images/wells-walgudha-road.jpg")',
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                  position: 'relative',
                  '&::before': {
                    content: '""',
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'linear-gradient(to bottom, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0.4) 100%)',
                    zIndex: 1
                  }
                }}
              >
                <Box
                  sx={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    p: 2,
                    zIndex: 2
                  }}
                >
                  <Typography variant="body2" color="white" fontWeight="bold">
                    Wells-Walgudha Road Progress
                  </Typography>
                </Box>
              </Box>
            </Card>
          </Grid>
        </Grid>
      </Container>

      {/* Key Features Section */}
      <Container maxWidth="lg" sx={{ mb: 8 }}>
        <Typography variant="h4" fontWeight="bold" gutterBottom align="center" sx={{ mb: 2 }}>
          Why Choose Our Platform?
        </Typography>
        <Typography variant="body1" color="text.secondary" align="center" sx={{ mb: 6 }}>
          Experience the future of transparent and accountable project management
        </Typography>
        
        <Grid container spacing={4}>
          <Grid item xs={12} md={4}>
            <Card
              elevation={3}
              sx={{
                p: 3,
                height: '100%',
                textAlign: 'center',
                borderRadius: 3,
                transition: 'all 0.3s ease',
                '&:hover': {
                  transform: 'translateY(-8px)',
                  boxShadow: 6
                }
              }}
            >
              <Box
                sx={{
                  width: 80,
                  height: 80,
                  borderRadius: '50%',
                  backgroundColor: '#e3f2fd',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  mx: 'auto',
                  mb: 3
                }}
              >
                <Dashboard sx={{ fontSize: 40, color: '#1976d2' }} />
              </Box>
              <Typography variant="h6" fontWeight="bold" gutterBottom>
                Real-Time Dashboard
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Monitor project progress, budgets, and timelines with live updates and comprehensive analytics.
              </Typography>
            </Card>
          </Grid>
          
          <Grid item xs={12} md={4}>
            <Card
              elevation={3}
              sx={{
                p: 3,
                height: '100%',
                textAlign: 'center',
                borderRadius: 3,
                transition: 'all 0.3s ease',
                '&:hover': {
                  transform: 'translateY(-8px)',
                  boxShadow: 6
                }
              }}
            >
              <Box
                sx={{
                  width: 80,
                  height: 80,
                  borderRadius: '50%',
                  backgroundColor: '#f3e5f5',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  mx: 'auto',
                  mb: 3
                }}
              >
                <Public sx={{ fontSize: 40, color: '#9c27b0' }} />
              </Box>
              <Typography variant="h6" fontWeight="bold" gutterBottom>
                Public Transparency
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Citizens can track projects, submit proposals, and provide feedback for better governance.
              </Typography>
            </Card>
          </Grid>
          
          <Grid item xs={12} md={4}>
            <Card
              elevation={3}
              sx={{
                p: 3,
                height: '100%',
                textAlign: 'center',
                borderRadius: 3,
                transition: 'all 0.3s ease',
                '&:hover': {
                  transform: 'translateY(-8px)',
                  boxShadow: 6
                }
              }}
            >
              <Box
                sx={{
                  width: 80,
                  height: 80,
                  borderRadius: '50%',
                  backgroundColor: '#e8f5e8',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  mx: 'auto',
                  mb: 3
                }}
              >
                <TrendingUp sx={{ fontSize: 40, color: '#4caf50' }} />
              </Box>
              <Typography variant="h6" fontWeight="bold" gutterBottom>
                Performance Analytics
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Detailed insights into project performance, budget utilization, and completion rates.
              </Typography>
            </Card>
          </Grid>
        </Grid>
      </Container>

      {/* Quick Stats Section */}
      <Container maxWidth="lg" sx={{ mb: 8 }}>
        <Typography variant="h4" fontWeight="bold" gutterBottom align="center" sx={{ mb: 4 }}>
          Quick Stats
        </Typography>
        
        <Grid container spacing={3}>
          {statsCards.map((card, index) => (
            <Grid item xs={12} sm={6} md={4} key={index}>
              <StatCard {...card} />
            </Grid>
          ))}
        </Grid>
      </Container>

      {/* Detailed Dashboard Promo */}
      <Container maxWidth="lg" sx={{ mb: 6 }}>
        <Paper
          elevation={4}
          sx={{
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            color: 'white',
            p: 4,
            borderRadius: 3,
            position: 'relative',
            overflow: 'hidden',
            '&::before': {
              content: '""',
              position: 'absolute',
              top: 0,
              right: 0,
              width: '40%',
              height: '100%',
              background: 'url("data:image/svg+xml,%3Csvg width=\'100\' height=\'100\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cpath d=\'M0 0h100v100H0z\' fill=\'none\'/%3E%3Cpath d=\'M20 50a30 30 0 1 0 60 0 30 30 0 1 0-60 0\' fill=\'%23fff\' opacity=\'0.05\'/%3E%3C/svg%3E")',
              opacity: 0.1
            }
          }}
        >
          <Box sx={{ position: 'relative', zIndex: 1 }}>
            <Box display="flex" alignItems="center" gap={2} mb={2}>
              <Dashboard sx={{ fontSize: 48 }} />
              <Typography variant="h4" fontWeight="bold">
                Explore Detailed Analytics
              </Typography>
            </Box>
            <Typography variant="h6" sx={{ mb: 3, opacity: 0.95 }}>
              View comprehensive department and regional breakdowns of all county projects
            </Typography>
            <Grid container spacing={2} sx={{ mb: 3 }}>
              <Grid item xs={12} sm={4}>
                <Box display="flex" alignItems="center" gap={1}>
                  <Business />
                  <Typography variant="body1">Department Summaries</Typography>
                </Box>
              </Grid>
              <Grid item xs={12} sm={4}>
                <Box display="flex" alignItems="center" gap={1}>
                  <LocationOn />
                  <Typography variant="body1">Sub-County Distribution</Typography>
                </Box>
              </Grid>
              <Grid item xs={12} sm={4}>
                <Box display="flex" alignItems="center" gap={1}>
                  <Assessment />
                  <Typography variant="body1">Interactive Tables</Typography>
                </Box>
              </Grid>
            </Grid>
            <Button
              variant="contained"
              size="large"
              endIcon={<ArrowForward />}
              onClick={() => navigate('/dashboard')}
              sx={{
                backgroundColor: 'white',
                color: '#667eea',
                fontWeight: 'bold',
                '&:hover': {
                  backgroundColor: '#f5f5f5',
                  transform: 'translateX(4px)',
                  transition: 'all 0.3s ease'
                }
              }}
            >
              View Full Dashboard
            </Button>
          </Box>
        </Paper>
      </Container>

      {/* About Section */}
      <Box sx={{ backgroundColor: '#f5f5f5', py: 6, mb: 6 }}>
        <Container maxWidth="lg">
          <Typography variant="h4" fontWeight="bold" gutterBottom align="center" sx={{ mb: 4 }}>
            Platform Features
          </Typography>
          <Grid container spacing={4}>
            <Grid item xs={12} md={4}>
              <Card elevation={2} sx={{ height: '100%', transition: 'all 0.3s', '&:hover': { transform: 'translateY(-8px)', boxShadow: 6 } }}>
                <CardContent sx={{ textAlign: 'center', p: 3 }}>
                  <Assessment sx={{ fontSize: 60, color: '#1976d2', mb: 2 }} />
                  <Typography variant="h6" fontWeight="bold" gutterBottom>
                    Transparency
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Track all county projects in real-time with complete transparency and open access to project information.
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            
            <Grid item xs={12} md={4}>
              <Card elevation={2} sx={{ height: '100%', transition: 'all 0.3s', '&:hover': { transform: 'translateY(-8px)', boxShadow: 6 } }}>
                <CardContent sx={{ textAlign: 'center', p: 3 }}>
                  <CheckCircle sx={{ fontSize: 60, color: '#4caf50', mb: 2 }} />
                  <Typography variant="h6" fontWeight="bold" gutterBottom>
                    Accountability
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Monitor project progress, budgets, and completion status to ensure accountability at every level.
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            
            <Grid item xs={12} md={4}>
              <Card elevation={2} sx={{ height: '100%', transition: 'all 0.3s', '&:hover': { transform: 'translateY(-8px)', boxShadow: 6 } }}>
                <CardContent sx={{ textAlign: 'center', p: 3 }}>
                  <Construction sx={{ fontSize: 60, color: '#ff9800', mb: 2 }} />
                  <Typography variant="h6" fontWeight="bold" gutterBottom>
                    Efficiency
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Streamlined project management and tracking system for improved efficiency and better outcomes.
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </Container>
      </Box>

      {/* Quick Links Section */}
      <Container maxWidth="lg" sx={{ mb: 8 }}>
        <Typography variant="h4" fontWeight="bold" gutterBottom align="center" sx={{ mb: 4 }}>
          Quick Access
        </Typography>
        <Grid container spacing={3}>
          <Grid item xs={12} sm={6} md={3}>
            <Paper
              elevation={3}
              sx={{
                p: 3,
                textAlign: 'center',
                cursor: 'pointer',
                transition: 'all 0.3s',
                '&:hover': {
                  transform: 'translateY(-8px)',
                  boxShadow: 6,
                  backgroundColor: '#f8f9fa'
                }
              }}
              onClick={() => navigate('/dashboard')}
            >
              <Dashboard sx={{ fontSize: 48, color: '#1976d2', mb: 2 }} />
              <Typography variant="h6" fontWeight="bold" gutterBottom>
                Dashboard
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Department & regional analytics
              </Typography>
            </Paper>
          </Grid>

          <Grid item xs={12} sm={6} md={3}>
            <Paper
              elevation={3}
              sx={{
                p: 3,
                textAlign: 'center',
                cursor: 'pointer',
                transition: 'all 0.3s',
                '&:hover': {
                  transform: 'translateY(-8px)',
                  boxShadow: 6,
                  backgroundColor: '#f8f9fa'
                }
              }}
              onClick={() => navigate('/projects')}
            >
              <PhotoLibrary sx={{ fontSize: 48, color: '#4caf50', mb: 2 }} />
              <Typography variant="h6" fontWeight="bold" gutterBottom>
                Projects Gallery
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Browse all projects with photos
              </Typography>
            </Paper>
          </Grid>

          <Grid item xs={12} sm={6} md={3}>
            <Paper
              elevation={3}
              sx={{
                p: 3,
                textAlign: 'center',
                cursor: 'pointer',
                transition: 'all 0.3s',
                '&:hover': {
                  transform: 'translateY(-8px)',
                  boxShadow: 6,
                  backgroundColor: '#f8f9fa'
                }
              }}
              onClick={() => navigate('/public-feedback')}
            >
              <Feedback sx={{ fontSize: 48, color: '#9c27b0', mb: 2 }} />
              <Typography variant="h6" fontWeight="bold" gutterBottom>
                View Feedback
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Read citizen feedback & responses
              </Typography>
            </Paper>
          </Grid>

          <Grid item xs={12} sm={6} md={3}>
            <Paper
              elevation={3}
              sx={{
                p: 3,
                textAlign: 'center',
                cursor: 'pointer',
                transition: 'all 0.3s',
                '&:hover': {
                  transform: 'translateY(-8px)',
                  boxShadow: 6,
                  backgroundColor: '#f8f9fa'
                }
              }}
              onClick={() => navigate('/feedback')}
            >
              <Warning sx={{ fontSize: 48, color: '#ff9800', mb: 2 }} />
              <Typography variant="h6" fontWeight="bold" gutterBottom>
                Submit Feedback
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Share your thoughts on projects
              </Typography>
            </Paper>
          </Grid>
        </Grid>
      </Container>

      {/* Call to Action */}
      <Container maxWidth="md" sx={{ mb: 8, textAlign: 'center' }}>
        <Typography variant="h4" fontWeight="bold" gutterBottom>
          Have Feedback or Questions?
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
          We value your input. Share your feedback or ask questions about any project.
        </Typography>
        <Button
          variant="contained"
          size="large"
          onClick={() => navigate('/feedback')}
        >
          Submit Feedback
        </Button>
      </Container>

      {/* Projects Modal */}
      <ProjectsModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        filterType={modalConfig.filterType}
        filterValue={modalConfig.filterValue}
        title={modalConfig.title}
      />
    </Box>
  );
};

export default HomePage;