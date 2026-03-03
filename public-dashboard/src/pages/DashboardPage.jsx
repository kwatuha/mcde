import React, { useState, useEffect } from 'react';
import {
  Container,
  Grid,
  Typography,
  Box,
  Paper,
  CircularProgress,
  Alert,
  Tabs,
  Tab,
  Divider,
  Card,
  CardContent,
  LinearProgress,
  Chip,
  List,
  ListItem,
  ListItemText,
  ListItemIcon
} from '@mui/material';
import {
  Assessment,
  Business,
  LocationOn,
  LocationCity,
  Dashboard as DashboardIcon,
  TrendingUp,
  TrendingDown,
  CheckCircle,
  Schedule,
  Warning,
  Star,
  BarChart as BarChartIcon,
  PieChart as PieChartIcon,
  Timeline,
  MoreHoriz
} from '@mui/icons-material';
import { useSearchParams } from 'react-router-dom';
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LineChart,
  Line
} from 'recharts';
import StatCard from '../components/StatCard';
import DepartmentSummaryTable from '../components/DepartmentSummaryTable';
import SubCountySummaryTable from '../components/SubCountySummaryTable';
import WardSummaryTable from '../components/WardSummaryTable';
import YearlyTrendsTable from '../components/YearlyTrendsTable';
import FilterBar from '../components/FilterBar';
import ProjectsModal from '../components/ProjectsModal';
import { getOverviewStats, getFinancialYears } from '../services/publicApi';
import { formatCurrency, getStatusColor } from '../utils/formatters';

// Chart colors - using normalized status colors for consistency
const getStatusColorForChart = (statusName) => {
  return getStatusColor(statusName);
};

const DashboardPage = () => {
  const [searchParams] = useSearchParams();
  const finYearFromUrl = searchParams.get('fy');
  
  const [stats, setStats] = useState(null);
  const [financialYears, setFinancialYears] = useState([]);
  const [selectedFinYear, setSelectedFinYear] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState(0);
  const [filters, setFilters] = useState({
    department: '',
    subcounty: '',
    ward: '',
    projectSearch: ''
  });

  // Modal states for clickable stats
  const [modalOpen, setModalOpen] = useState(false);
  const [modalFilterType, setModalFilterType] = useState('');
  const [modalFilterValue, setModalFilterValue] = useState('');
  const [modalTitle, setModalTitle] = useState('');

  useEffect(() => {
    fetchFinancialYears();
  }, []);

  useEffect(() => {
    // Fetch stats when selectedFinYear changes (including when it's null for "All")
    fetchStats();
  }, [selectedFinYear, filters]);

  const fetchFinancialYears = async () => {
    try {
      const data = await getFinancialYears();
      // Backend already filters to only return years with projects
      setFinancialYears(data || []);
      
      // Set initial financial year
      if (finYearFromUrl) {
        const fyFromUrl = data.find(fy => fy.id === parseInt(finYearFromUrl));
        setSelectedFinYear(fyFromUrl || null); // null means "All"
      } else {
        // Default to "All Financial Years" so users can see all projects
        // They can then select a specific year if needed (project counts are shown)
        setSelectedFinYear(null);
      }
    } catch (err) {
      console.error('Error fetching financial years:', err);
      setError('Failed to load financial years');
    }
  };

  const fetchStats = async () => {
    try {
      setLoading(true);
      // Pass null for finYearId when "All" is selected (selectedFinYear is null)
      const finYearId = selectedFinYear === null ? null : selectedFinYear?.id;
      const data = await getOverviewStats(finYearId, filters);
      setStats(data);
      setError(null);
    } catch (err) {
      console.error('Error fetching stats:', err);
      setError('Failed to load statistics');
    } finally {
      setLoading(false);
    }
  };

  const handleFinYearChange = (event, newValue) => {
    setSelectedFinYear(financialYears[newValue]);
  };

  const handleTabChange = (event, newValue) => {
    setActiveTab(newValue);
  };

  const handleFiltersChange = (newFilters) => {
    setFilters(newFilters);
  };

  // Handle clicking on statistics cards
  const handleStatClick = (filterType, filterValue, title) => {
    setModalFilterType(filterType);
    setModalFilterValue(filterValue);
    setModalTitle(title);
    setModalOpen(true);
  };

  // Handle closing the modal
  const handleCloseModal = () => {
    setModalOpen(false);
    setModalFilterType('');
    setModalFilterValue('');
    setModalTitle('');
  };

  if (loading && !stats) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="80vh">
        <CircularProgress size={60} />
      </Box>
    );
  }

  if (error && !stats) {
    return (
      <Container maxWidth="xl" sx={{ mt: 4 }}>
        <Alert severity="error">{error}</Alert>
      </Container>
    );
  }

  const statsCards = [
    {
      title: 'All Projects',
      count: stats?.total_projects || 0,
      budget: stats?.total_budget || 0,
      color: '#1976d2',
      icon: Assessment,
      onClick: () => handleStatClick('finYearId', selectedFinYear === null ? null : selectedFinYear?.id, 'All Projects')
    },
    {
      title: 'Completed Projects',
      count: stats?.completed_projects || 0,
      budget: stats?.completed_budget || 0,
      color: '#4caf50',
      icon: Assessment,
      onClick: () => handleStatClick('status', 'Completed', 'Completed Projects')
    },
    {
      title: 'Ongoing Projects',
      count: stats?.ongoing_projects || 0,
      budget: stats?.ongoing_budget || 0,
      color: '#2196f3',
      icon: Assessment,
      onClick: () => handleStatClick('status', 'Ongoing', 'Ongoing Projects')
    },
    {
      title: 'Stalled Projects',
      count: stats?.stalled_projects || 0,
      budget: stats?.stalled_budget || 0,
      color: '#f44336',
      icon: Warning,
      onClick: () => handleStatClick('status', 'Stalled', 'Stalled Projects')
    },
    {
      title: 'Not Started Projects',
      count: stats?.not_started_projects || 0,
      budget: stats?.not_started_budget || 0,
      color: '#ff9800',
      icon: Schedule,
      onClick: () => handleStatClick('status', 'Not Started', 'Not Started Projects')
    },
    {
      title: 'Under Procurement',
      count: stats?.under_procurement_projects || 0,
      budget: stats?.under_procurement_budget || 0,
      color: '#9c27b0',
      icon: Assessment,
      onClick: () => handleStatClick('status', 'Under Procurement', 'Under Procurement')
    },
    {
      title: 'Suspended Projects',
      count: stats?.suspended_projects || 0,
      budget: stats?.suspended_budget || 0,
      color: '#e00202',
      icon: Warning,
      onClick: () => handleStatClick('status', 'Suspended', 'Suspended Projects')
    },
    {
      title: 'Other Projects',
      count: stats?.other_projects || 0,
      budget: stats?.other_budget || 0,
      color: '#9e9e9e',
      icon: MoreHoriz,
      onClick: () => handleStatClick('status', 'Other', 'Other Projects')
    }
  ];

  return (
    <Container maxWidth="xl" sx={{ py: 1.5, background: 'linear-gradient(to bottom, rgba(25, 118, 210, 0.02), transparent)' }}>
      {/* Header */}
      <Box sx={{ mb: 1.5, pb: 1.5, borderBottom: '2px solid', borderColor: 'divider' }}>
        <Box display="flex" alignItems="center" gap={1.5} mb={0.5}>
          <Box sx={{ 
            p: 1, 
            borderRadius: 2, 
            background: 'linear-gradient(135deg, #1976d2 0%, #1565c0 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 12px rgba(25, 118, 210, 0.3)'
          }}>
            <DashboardIcon sx={{ fontSize: 28, color: 'white' }} />
          </Box>
          <Box>
            <Typography variant="h5" fontWeight="bold" sx={{ 
              fontSize: '1.4rem',
              background: 'linear-gradient(135deg, #1976d2 0%, #1565c0 100%)',
              backgroundClip: 'text',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              letterSpacing: '-0.02em'
            }}>
              CivicChat Portal - Public Dashboard
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.75rem', mt: 0.25 }}>
              Real-time project monitoring and analytics
            </Typography>
          </Box>
        </Box>
      </Box>

      {/* Enhanced Filter Bar */}
      <FilterBar
        financialYears={financialYears}
        selectedFinYear={selectedFinYear}
        onFinYearChange={setSelectedFinYear}
        onFiltersChange={handleFiltersChange}
        finYearId={selectedFinYear?.id}
      />

      {/* Selected Financial Year Title */}
      <Box sx={{ 
        mb: 2, 
        p: 1.5, 
        borderRadius: 2, 
        background: 'linear-gradient(135deg, rgba(25, 118, 210, 0.08) 0%, rgba(21, 101, 192, 0.05) 100%)',
        border: '1px solid',
        borderColor: 'primary.light',
        borderOpacity: 0.3
      }}>
        <Typography variant="subtitle1" fontWeight="bold" color="primary" sx={{ fontSize: '1rem' }}>
          {selectedFinYear ? `${selectedFinYear.name} FY` : 'All Financial Years'} Public Dashboard
        </Typography>
      </Box>

      {/* Quick Stats Section */}
      <Box sx={{ mb: 2.5 }}>
        <Box display="flex" alignItems="center" gap={1} mb={1}>
          <Box sx={{ 
            width: 4, 
            height: 24, 
            borderRadius: 1, 
            background: 'linear-gradient(135deg, #1976d2 0%, #1565c0 100%)' 
          }} />
          <Typography variant="h6" fontWeight="bold" sx={{ fontSize: '1.1rem', letterSpacing: '-0.01em' }}>
            Quick Stats
          </Typography>
        </Box>
        <Typography variant="caption" color="text.secondary" sx={{ mb: 1.5, display: 'block', fontSize: '0.75rem', ml: 2 }}>
          Click on any statistic card below to view detailed project information
        </Typography>
        <Box sx={{ 
          display: 'grid', 
          gridTemplateColumns: { 
            xs: '1fr', 
            sm: 'repeat(2, 1fr)', 
            md: 'repeat(5, 1fr)' 
          }, 
          gap: 1.25 
        }}>
          {statsCards.map((card, index) => (
            <StatCard key={index} {...card} />
          ))}
        </Box>
      </Box>

      {/* Analytics Dashboard Section */}
      <Box sx={{ mb: 2.5 }}>
        <Box display="flex" alignItems="center" gap={1} mb={1.5}>
          <Box sx={{ 
            width: 4, 
            height: 24, 
            borderRadius: 1, 
            background: 'linear-gradient(135deg, #1976d2 0%, #1565c0 100%)' 
          }} />
          <BarChartIcon sx={{ fontSize: 20, color: 'primary.main' }} />
          <Typography variant="h6" fontWeight="bold" sx={{ fontSize: '1.1rem', letterSpacing: '-0.01em' }}>
            Performance Analytics
          </Typography>
        </Box>
        
        <Grid container spacing={2}>
          {/* Project Completion Rate */}
          <Grid item xs={12} md={6}>
            <Card 
              elevation={0}
              sx={{
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 3,
                transition: 'all 0.3s ease',
                '&:hover': {
                  boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                  transform: 'translateY(-2px)'
                },
                background: 'linear-gradient(to bottom, rgba(76, 175, 80, 0.03), transparent)'
              }}
            >
              <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                <Box display="flex" alignItems="center" mb={1.5}>
                  <Box sx={{ 
                    p: 1, 
                    borderRadius: 2, 
                    background: 'linear-gradient(135deg, #4caf50 0%, #388e3c 100%)',
                    mr: 1.5,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    <CheckCircle sx={{ fontSize: 22, color: 'white' }} />
                  </Box>
                  <Typography variant="subtitle1" fontWeight="bold" sx={{ fontSize: '0.95rem' }}>
                    Project Completion Rate
                  </Typography>
                </Box>
                <Box sx={{ mb: 1.5 }}>
                  <Typography variant="h3" color="success.main" fontWeight="bold" sx={{ fontSize: '2rem', mb: 0.5 }}>
                    {stats && stats.total_projects > 0 ? Math.round((stats.completed_projects / stats.total_projects) * 100) : 0}%
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.8rem' }}>
                    {stats?.completed_projects || 0} of {stats?.total_projects || 0} projects completed
                  </Typography>
                </Box>
                <LinearProgress 
                  variant="determinate" 
                  value={stats && stats.total_projects > 0 ? (stats.completed_projects / stats.total_projects) * 100 : 0}
                  sx={{ 
                    height: 8, 
                    borderRadius: 4,
                    backgroundColor: 'rgba(76, 175, 80, 0.1)',
                    '& .MuiLinearProgress-bar': {
                      background: 'linear-gradient(90deg, #4caf50 0%, #66bb6a 100%)',
                      borderRadius: 4
                    }
                  }}
                />
              </CardContent>
            </Card>
          </Grid>

          {/* Budget Utilization */}
          <Grid item xs={12} md={6}>
            <Card 
              elevation={0}
              sx={{
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 3,
                transition: 'all 0.3s ease',
                '&:hover': {
                  boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                  transform: 'translateY(-2px)'
                },
                background: 'linear-gradient(to bottom, rgba(25, 118, 210, 0.03), transparent)'
              }}
            >
              <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                <Box display="flex" alignItems="center" mb={1.5}>
                  <Box sx={{ 
                    p: 1, 
                    borderRadius: 2, 
                    background: 'linear-gradient(135deg, #1976d2 0%, #1565c0 100%)',
                    mr: 1.5,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    <TrendingUp sx={{ fontSize: 22, color: 'white' }} />
                  </Box>
                  <Typography variant="subtitle1" fontWeight="bold" sx={{ fontSize: '0.95rem' }}>
                    Budget Utilization
                  </Typography>
                </Box>
                <Box sx={{ mb: 1.5 }}>
                  <Typography variant="h3" color="primary.main" fontWeight="bold" sx={{ fontSize: '2rem', mb: 0.5 }}>
                    {stats && stats.total_budget > 0 ? Math.round((stats.completed_budget / stats.total_budget) * 100) : 0}%
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.8rem' }}>
                    {formatCurrency(stats?.completed_budget || 0)} of {formatCurrency(stats?.total_budget || 0)}
                  </Typography>
                </Box>
                <LinearProgress 
                  variant="determinate" 
                  value={stats && stats.total_budget > 0 ? (stats.completed_budget / stats.total_budget) * 100 : 0}
                  sx={{ 
                    height: 8, 
                    borderRadius: 4,
                    backgroundColor: 'rgba(25, 118, 210, 0.1)',
                    '& .MuiLinearProgress-bar': {
                      background: 'linear-gradient(90deg, #1976d2 0%, #42a5f5 100%)',
                      borderRadius: 4
                    }
                  }}
                />
              </CardContent>
            </Card>
          </Grid>

          {/* Project Status Distribution */}
          <Grid item xs={12} md={6}>
            <Card 
              elevation={0}
              sx={{
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 3,
                transition: 'all 0.3s ease',
                '&:hover': {
                  boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                  transform: 'translateY(-2px)'
                },
                background: 'linear-gradient(to bottom, rgba(33, 150, 243, 0.03), transparent)'
              }}
            >
              <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                <Box display="flex" alignItems="center" mb={1.5}>
                  <Box sx={{ 
                    p: 1, 
                    borderRadius: 2, 
                    background: 'linear-gradient(135deg, #2196f3 0%, #1976d2 100%)',
                    mr: 1.5,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    <PieChartIcon sx={{ fontSize: 22, color: 'white' }} />
                  </Box>
                  <Typography variant="subtitle1" fontWeight="bold" sx={{ fontSize: '0.95rem' }}>
                    Project Status Distribution
                  </Typography>
                </Box>
                <List dense sx={{ py: 0 }}>
                  <ListItem sx={{ py: 0.5, px: 0 }}>
                    <ListItemIcon sx={{ minWidth: 32 }}>
                      <CheckCircle color="success" sx={{ fontSize: 18 }} />
                    </ListItemIcon>
                    <ListItemText 
                      primary="Completed" 
                      secondary={`${stats?.completed_projects || 0} projects`}
                      primaryTypographyProps={{ sx: { fontSize: '0.85rem' } }}
                      secondaryTypographyProps={{ sx: { fontSize: '0.7rem' } }}
                    />
                    <Chip 
                      label={`${stats && stats.total_projects > 0 ? Math.round((stats.completed_projects / stats.total_projects) * 100) : 0}%`}
                      color="success" 
                      size="small"
                      sx={{ height: 20, fontSize: '0.7rem' }}
                    />
                  </ListItem>
                  <ListItem sx={{ py: 0.5, px: 0 }}>
                    <ListItemIcon sx={{ minWidth: 32 }}>
                      <Schedule color="warning" sx={{ fontSize: 18 }} />
                    </ListItemIcon>
                    <ListItemText 
                      primary="Ongoing" 
                      secondary={`${stats?.ongoing_projects || 0} projects`}
                      primaryTypographyProps={{ sx: { fontSize: '0.85rem' } }}
                      secondaryTypographyProps={{ sx: { fontSize: '0.7rem' } }}
                    />
                    <Chip 
                      label={`${stats && stats.total_projects > 0 ? Math.round((stats.ongoing_projects / stats.total_projects) * 100) : 0}%`}
                      color="warning" 
                      size="small"
                      sx={{ height: 20, fontSize: '0.7rem' }}
                    />
                  </ListItem>
                  <ListItem sx={{ py: 0.5, px: 0 }}>
                    <ListItemIcon sx={{ minWidth: 32 }}>
                      <Warning color="error" sx={{ fontSize: 18 }} />
                    </ListItemIcon>
                    <ListItemText 
                      primary="Stalled" 
                      secondary={`${stats?.stalled_projects || 0} projects`}
                      primaryTypographyProps={{ sx: { fontSize: '0.85rem' } }}
                      secondaryTypographyProps={{ sx: { fontSize: '0.7rem' } }}
                    />
                    <Chip 
                      label={`${stats && stats.total_projects > 0 ? Math.round((stats.stalled_projects / stats.total_projects) * 100) : 0}%`}
                      color="error" 
                      size="small"
                      sx={{ height: 20, fontSize: '0.7rem' }}
                    />
                  </ListItem>
                </List>
              </CardContent>
            </Card>
          </Grid>

          {/* Performance Metrics */}
          <Grid item xs={12} md={6}>
            <Card 
              elevation={0}
              sx={{
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 3,
                transition: 'all 0.3s ease',
                '&:hover': {
                  boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                  transform: 'translateY(-2px)'
                },
                background: 'linear-gradient(to bottom, rgba(156, 39, 176, 0.03), transparent)'
              }}
            >
              <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                <Box display="flex" alignItems="center" mb={1.5}>
                  <Box sx={{ 
                    p: 1, 
                    borderRadius: 2, 
                    background: 'linear-gradient(135deg, #9c27b0 0%, #7b1fa2 100%)',
                    mr: 1.5,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    <Star sx={{ fontSize: 22, color: 'white' }} />
                  </Box>
                  <Typography variant="subtitle1" fontWeight="bold" sx={{ fontSize: '0.95rem' }}>
                    Performance Metrics
                  </Typography>
                </Box>
                <Grid container spacing={2}>
                  <Grid item xs={6}>
                    <Box 
                      textAlign="center" 
                      sx={{ 
                        p: 1.5, 
                        borderRadius: 2, 
                        background: 'linear-gradient(135deg, rgba(76, 175, 80, 0.08), rgba(76, 175, 80, 0.03))',
                        border: '1px solid',
                        borderColor: 'success.light',
                        borderOpacity: 0.3
                      }}
                    >
                      <Typography variant="h4" color="success.main" fontWeight="bold" sx={{ fontSize: '1.75rem', mb: 0.5 }}>
                        {stats && stats.total_projects > 0 ? Math.round((stats.completed_projects / stats.total_projects) * 100) : 0}%
                      </Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.75rem', fontWeight: 500 }}>
                        Success Rate
                      </Typography>
                    </Box>
                  </Grid>
                  <Grid item xs={6}>
                    <Box 
                      textAlign="center" 
                      sx={{ 
                        p: 1.5, 
                        borderRadius: 2, 
                        background: 'linear-gradient(135deg, rgba(25, 118, 210, 0.08), rgba(25, 118, 210, 0.03))',
                        border: '1px solid',
                        borderColor: 'primary.light',
                        borderOpacity: 0.3
                      }}
                    >
                      <Typography variant="h4" color="primary.main" fontWeight="bold" sx={{ fontSize: '1.75rem', mb: 0.5 }}>
                        {stats && stats.total_budget > 0 ? Math.round((stats.completed_budget / stats.total_budget) * 100) : 0}%
                      </Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.75rem', fontWeight: 500 }}>
                        Budget Efficiency
                      </Typography>
                    </Box>
                  </Grid>
                  <Grid item xs={6}>
                    <Box 
                      textAlign="center" 
                      sx={{ 
                        p: 1.5, 
                        borderRadius: 2, 
                        background: 'linear-gradient(135deg, rgba(33, 150, 243, 0.08), rgba(33, 150, 243, 0.03))',
                        border: '1px solid',
                        borderColor: 'info.light',
                        borderOpacity: 0.3
                      }}
                    >
                      <Typography variant="h4" color="info.main" fontWeight="bold" sx={{ fontSize: '1.75rem', mb: 0.5 }}>
                        {stats?.total_budget && stats?.total_projects > 0 ? formatCurrency(stats.total_budget / stats.total_projects) : 'N/A'}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.75rem', fontWeight: 500 }}>
                        Avg Project Value
                      </Typography>
                    </Box>
                  </Grid>
                  <Grid item xs={6}>
                    <Box 
                      textAlign="center" 
                      sx={{ 
                        p: 1.5, 
                        borderRadius: 2, 
                        background: 'linear-gradient(135deg, rgba(255, 152, 0, 0.08), rgba(255, 152, 0, 0.03))',
                        border: '1px solid',
                        borderColor: 'warning.light',
                        borderOpacity: 0.3
                      }}
                    >
                      <Typography variant="h4" color="warning.main" fontWeight="bold" sx={{ fontSize: '1.75rem', mb: 0.5 }}>
                        {stats?.total_projects || 0}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.75rem', fontWeight: 500 }}>
                        Total Projects
                      </Typography>
                    </Box>
                  </Grid>
                </Grid>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </Box>

      {/* Charts Section */}
      <Box sx={{ mb: 2.5 }}>
        <Box display="flex" alignItems="center" gap={1} mb={1.5}>
          <Box sx={{ 
            width: 4, 
            height: 24, 
            borderRadius: 1, 
            background: 'linear-gradient(135deg, #1976d2 0%, #1565c0 100%)' 
          }} />
          <Timeline sx={{ fontSize: 20, color: 'primary.main' }} />
          <Typography variant="h6" fontWeight="bold" sx={{ fontSize: '1.1rem', letterSpacing: '-0.01em' }}>
            Visual Analytics
          </Typography>
        </Box>
        
        <Grid container spacing={2}>
          {/* Project Status Pie Chart */}
          <Grid item xs={12} md={6}>
            <Card 
              elevation={0}
              sx={{
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 3,
                transition: 'all 0.3s ease',
                '&:hover': {
                  boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                  transform: 'translateY(-2px)'
                }
              }}
            >
              <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                <Typography variant="subtitle1" fontWeight="bold" gutterBottom sx={{ fontSize: '0.95rem', mb: 1.5 }}>
                  Project Status Distribution
                </Typography>
                <Box sx={{ height: 280 }}>
                  {stats ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={[
                            { name: 'Completed', value: stats.completed_projects || 0 },
                            { name: 'Ongoing', value: stats.ongoing_projects || 0 },
                            { name: 'Stalled', value: stats.stalled_projects || 0 },
                            { name: 'Not Started', value: stats.not_started_projects || 0 },
                            { name: 'Under Procurement', value: stats.under_procurement_projects || 0 },
                            { name: 'Suspended', value: stats.suspended_projects || 0 },
                            { name: 'Other', value: stats.other_projects || 0 }
                          ]}
                          cx="50%"
                          cy="50%"
                          label={false}
                          labelLine={false}
                          outerRadius={80}
                          fill="#8884d8"
                          dataKey="value"
                        >
                          {[
                            { name: 'Completed', value: stats.completed_projects || 0 },
                            { name: 'Ongoing', value: stats.ongoing_projects || 0 },
                            { name: 'Stalled', value: stats.stalled_projects || 0 },
                            { name: 'Not Started', value: stats.not_started_projects || 0 },
                            { name: 'Under Procurement', value: stats.under_procurement_projects || 0 },
                            { name: 'Suspended', value: stats.suspended_projects || 0 },
                            { name: 'Other', value: stats.other_projects || 0 }
                          ].map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={getStatusColorForChart(entry.name)} />
                          ))}
                        </Pie>
                        <Tooltip />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <Box sx={{ height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <CircularProgress />
                    </Box>
                  )}
                </Box>
              </CardContent>
            </Card>
          </Grid>

          {/* Budget Allocation Bar Chart */}
          <Grid item xs={12} md={6}>
            <Card 
              elevation={0}
              sx={{
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 3,
                transition: 'all 0.3s ease',
                '&:hover': {
                  boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                  transform: 'translateY(-2px)'
                }
              }}
            >
              <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                <Typography variant="subtitle1" fontWeight="bold" gutterBottom sx={{ fontSize: '0.95rem', mb: 1.5 }}>
                  Budget Allocation by Status
                </Typography>
                <Box sx={{ height: 280 }}>
                  {stats ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={[
                          { name: 'Completed', budget: stats.completed_budget || 0 },
                          { name: 'Ongoing', budget: stats.ongoing_budget || 0 },
                          { name: 'Stalled', budget: stats.stalled_budget || 0 },
                          { name: 'Not Started', budget: stats.not_started_budget || 0 },
                          { name: 'Under Procurement', budget: stats.under_procurement_budget || 0 },
                          { name: 'Suspended', budget: stats.suspended_budget || 0 },
                          { name: 'Other', budget: stats.other_budget || 0 }
                        ]}
                        margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} />
                        <YAxis 
                          tickFormatter={(value) => {
                            const millions = value / 1000000;
                            return `KES ${millions.toFixed(1)}M`;
                          }} 
                        />
                        <Tooltip formatter={(value) => [formatCurrency(value), 'Budget']} />
                        <Bar dataKey="budget">
                          {[
                            { name: 'Completed' },
                            { name: 'Ongoing' },
                            { name: 'Stalled' },
                            { name: 'Not Started' },
                            { name: 'Under Procurement' },
                            { name: 'Suspended' },
                            { name: 'Other' }
                          ].map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={getStatusColorForChart(entry.name)} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <Box sx={{ height: 250, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <CircularProgress size={24} />
                    </Box>
                  )}
                </Box>
              </CardContent>
            </Card>
          </Grid>

          {/* Project vs Budget Efficiency Chart */}
          <Grid item xs={12}>
            <Card 
              elevation={0}
              sx={{
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 3,
                transition: 'all 0.3s ease',
                '&:hover': {
                  boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                  transform: 'translateY(-2px)'
                }
              }}
            >
              <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                <Typography variant="subtitle1" fontWeight="bold" gutterBottom sx={{ fontSize: '0.95rem', mb: 1.5 }}>
                  Project Count vs Budget Efficiency
                </Typography>
                <Box sx={{ height: 280 }}>
                  {stats ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={[
                          { 
                            name: 'Completed', 
                            projects: stats.completed_projects || 0,
                            budgetPercent: stats.total_budget > 0 ? ((stats.completed_budget / stats.total_budget) * 100) : 0
                          },
                          { 
                            name: 'Ongoing', 
                            projects: stats.ongoing_projects || 0,
                            budgetPercent: stats.total_budget > 0 ? ((stats.ongoing_budget / stats.total_budget) * 100) : 0
                          },
                          { 
                            name: 'Stalled', 
                            projects: stats.stalled_projects || 0,
                            budgetPercent: stats.total_budget > 0 ? ((stats.stalled_budget / stats.total_budget) * 100) : 0
                          },
                          { 
                            name: 'Not Started', 
                            projects: stats.not_started_projects || 0,
                            budgetPercent: stats.total_budget > 0 ? ((stats.not_started_budget / stats.total_budget) * 100) : 0
                          },
                          { 
                            name: 'Under Procurement', 
                            projects: stats.under_procurement_projects || 0,
                            budgetPercent: stats.total_budget > 0 ? ((stats.under_procurement_budget / stats.total_budget) * 100) : 0
                          },
                          { 
                            name: 'Suspended', 
                            projects: stats.suspended_projects || 0,
                            budgetPercent: stats.total_budget > 0 ? ((stats.suspended_budget / stats.total_budget) * 100) : 0
                          },
                          { 
                            name: 'Other', 
                            projects: stats.other_projects || 0,
                            budgetPercent: stats.total_budget > 0 ? ((stats.other_budget / stats.total_budget) * 100) : 0
                          }
                        ]}
                        margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} />
                        <YAxis yAxisId="left" />
                        <YAxis yAxisId="right" orientation="right" />
                        <Tooltip />
                        <Legend />
                        <Bar yAxisId="left" dataKey="projects" name="Project Count">
                          {[
                            { name: 'Completed' },
                            { name: 'Ongoing' },
                            { name: 'Stalled' },
                            { name: 'Not Started' },
                            { name: 'Under Procurement' },
                            { name: 'Suspended' },
                            { name: 'Other' }
                          ].map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={getStatusColorForChart(entry.name)} />
                          ))}
                        </Bar>
                        <Bar yAxisId="right" dataKey="budgetPercent" fill="#82ca9d" name="Budget %" />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <Box sx={{ height: 280, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <CircularProgress size={24} />
                    </Box>
                  )}
                </Box>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </Box>

      <Divider sx={{ my: 2.5, borderWidth: 1 }} />

      {/* Detailed Breakdown Tabs */}
      <Paper 
        sx={{ 
          mb: 2, 
          borderRadius: 3,
          border: '1px solid',
          borderColor: 'divider',
          overflow: 'hidden'
        }} 
        elevation={0}
      >
        <Tabs
          value={activeTab}
          onChange={handleTabChange}
          variant="fullWidth"
          sx={{
            borderBottom: 1,
            borderColor: 'divider',
            background: 'linear-gradient(to right, rgba(25, 118, 210, 0.05), transparent)',
            minHeight: 48,
            '& .MuiTab-root': {
              fontWeight: 600,
              fontSize: '0.875rem',
              minHeight: 48,
              py: 1,
              textTransform: 'none',
              transition: 'all 0.3s ease',
              '&:hover': {
                background: 'rgba(25, 118, 210, 0.08)'
              },
              '&.Mui-selected': {
                color: 'primary.main',
                background: 'rgba(25, 118, 210, 0.12)'
              }
            },
            '& .MuiTabs-indicator': {
              height: 3,
              borderRadius: '3px 3px 0 0',
              background: 'linear-gradient(90deg, #1976d2 0%, #1565c0 100%)'
            }
          }}
        >
          <Tab icon={<Business sx={{ fontSize: 20 }} />} label="By Department" iconPosition="start" />
          <Tab icon={<LocationOn sx={{ fontSize: 20 }} />} label="By Sub-County" iconPosition="start" />
          <Tab icon={<LocationCity sx={{ fontSize: 20 }} />} label="By Ward" iconPosition="start" />
          <Tab icon={<TrendingUp sx={{ fontSize: 20 }} />} label="Yearly Trends" iconPosition="start" />
        </Tabs>

        <Box sx={{ p: 2, background: 'rgba(0,0,0,0.01)' }}>
          {activeTab === 0 && (
            <DepartmentSummaryTable finYearId={selectedFinYear === null ? null : selectedFinYear?.id} filters={filters} />
          )}
          {activeTab === 1 && (
            <SubCountySummaryTable finYearId={selectedFinYear === null ? null : selectedFinYear?.id} filters={filters} />
          )}
          {activeTab === 2 && (
            <WardSummaryTable finYearId={selectedFinYear === null ? null : selectedFinYear?.id} filters={filters} />
          )}
          {activeTab === 3 && (
            <YearlyTrendsTable filters={filters} />
          )}
        </Box>
      </Paper>

      {/* Footer Note */}
      <Paper
        elevation={0}
        sx={{
          p: 2,
          mt: 3,
          borderRadius: 3,
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          color: 'white',
          border: '1px solid rgba(255,255,255,0.2)',
          boxShadow: '0 8px 24px rgba(102, 126, 234, 0.3)',
          transition: 'all 0.3s ease',
          '&:hover': {
            boxShadow: '0 12px 32px rgba(102, 126, 234, 0.4)',
            transform: 'translateY(-2px)'
          }
        }}
      >
        <Typography variant="body2" textAlign="center" sx={{ fontSize: '0.875rem', fontWeight: 500 }}>
          For detailed project information and photos, visit the{' '}
          <strong style={{ fontWeight: 700, textDecoration: 'underline' }}>Projects Gallery</strong>
        </Typography>
      </Paper>

      {/* Projects Modal */}
      <ProjectsModal
        open={modalOpen}
        onClose={handleCloseModal}
        filterType={modalFilterType}
        filterValue={modalFilterValue}
        title={modalTitle}
      />
    </Container>
  );
};

export default DashboardPage;
