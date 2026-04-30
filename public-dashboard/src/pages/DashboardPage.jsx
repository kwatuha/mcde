import React, { useState, useEffect, useMemo } from 'react';
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

const CHART_TOOLTIP_SX = {
  borderRadius: 2,
  border: '1px solid rgba(15, 23, 42, 0.08)',
  boxShadow: '0 8px 24px rgba(15, 23, 42, 0.12)',
  fontSize: 12
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

  const statusPieData = useMemo(() => {
    if (!stats) return [];
    return [
      { name: 'Completed', value: stats.completed_projects || 0 },
      { name: 'Ongoing', value: stats.ongoing_projects || 0 },
      { name: 'Stalled', value: stats.stalled_projects || 0 },
      { name: 'Not Started', value: stats.not_started_projects || 0 },
      { name: 'Under Procurement', value: stats.under_procurement_projects || 0 },
      { name: 'Suspended', value: stats.suspended_projects || 0 },
      { name: 'Other', value: stats.other_projects || 0 }
    ].filter((d) => d.value > 0);
  }, [stats]);

  if (loading && !stats) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="80vh">
        <CircularProgress size={60} />
      </Box>
    );
  }

  if (error && !stats) {
    return (
      <Container maxWidth="lg" sx={{ mt: 4 }}>
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
    <Container maxWidth="lg" sx={{ py: { xs: 1.5, md: 2 }, px: { xs: 1.5, sm: 2 } }}>
      <Box
        sx={{
          mb: 1.25,
          p: { xs: 1.25, md: 1.5 },
          borderRadius: 2,
          border: '1px solid',
          borderColor: 'divider',
          background: (theme) =>
            theme.palette.mode === 'dark'
              ? 'linear-gradient(145deg, rgba(30, 41, 59, 0.9) 0%, rgba(15, 23, 42, 0.95) 100%)'
              : 'linear-gradient(145deg, #ffffff 0%, #f1f5f9 100%)',
          boxShadow: '0 1px 3px rgba(15, 23, 42, 0.06)',
        }}
      >
        <Box
          sx={{
            display: 'flex',
            flexDirection: { xs: 'column', md: 'row' },
            alignItems: { xs: 'flex-start', md: 'center' },
            justifyContent: 'space-between',
            gap: 1.25,
          }}
        >
          <Box display="flex" alignItems="center" gap={1.25} flex={1} minWidth={0}>
            <Box
              sx={{
                p: 0.85,
                borderRadius: 1.5,
                background: 'linear-gradient(135deg, #1976d2 0%, #0d47a1 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 14px rgba(25, 118, 210, 0.35)',
                flexShrink: 0,
              }}
            >
              <DashboardIcon sx={{ fontSize: 24, color: 'white' }} />
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <Typography
                variant="h6"
                fontWeight={800}
                sx={{
                  fontSize: { xs: '1.05rem', sm: '1.15rem' },
                  letterSpacing: '-0.02em',
                  lineHeight: 1.25,
                  color: 'text.primary',
                }}
              >
                Public dashboard
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.72rem', display: 'block', mt: 0.15 }}>
                County Government of Machakos · project monitoring
              </Typography>
            </Box>
          </Box>
          <Box
            sx={{
              px: 1.25,
              py: 0.65,
              borderRadius: 1.5,
              bgcolor: 'primary.main',
              color: 'primary.contrastText',
              alignSelf: { xs: 'stretch', md: 'center' },
              textAlign: { xs: 'center', md: 'left' },
            }}
          >
            <Typography variant="caption" sx={{ fontWeight: 700, fontSize: '0.65rem', opacity: 0.92, letterSpacing: 0.06, textTransform: 'uppercase' }}>
              Scope
            </Typography>
            <Typography variant="body2" fontWeight={700} sx={{ fontSize: '0.85rem', lineHeight: 1.2 }}>
              {selectedFinYear ? `${selectedFinYear.name}` : 'All financial years'}
            </Typography>
          </Box>
        </Box>
      </Box>

      <Box sx={{ mb: 1.25 }}>
        <FilterBar
          financialYears={financialYears}
          selectedFinYear={selectedFinYear}
          onFinYearChange={setSelectedFinYear}
          onFiltersChange={handleFiltersChange}
          finYearId={selectedFinYear?.id}
        />
      </Box>

      {/* KPI strip */}
      <Box sx={{ mb: 1.5 }}>
        <Box display="flex" alignItems="baseline" justifyContent="space-between" flexWrap="wrap" gap={0.75} mb={0.75}>
          <Box display="flex" alignItems="center" gap={0.75}>
            <Box
              sx={{
                width: 3,
                height: 18,
                borderRadius: 1,
                background: 'linear-gradient(180deg, #1976d2 0%, #1565c0 100%)',
              }}
            />
            <Typography variant="subtitle1" fontWeight={800} sx={{ fontSize: '0.95rem', letterSpacing: '-0.01em' }}>
              Key indicators
            </Typography>
          </Box>
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.68rem' }}>
            Click a card to open matching projects
          </Typography>
        </Box>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: {
              xs: 'repeat(2, minmax(0, 1fr))',
              sm: 'repeat(4, minmax(0, 1fr))',
            },
            gap: { xs: 0.75, sm: 1 },
          }}
        >
          {statsCards.map((card, index) => (
            <StatCard key={index} {...card} />
          ))}
        </Box>
      </Box>

      {/* Analytics Dashboard Section */}
      <Box sx={{ mb: 1.5 }}>
        <Box display="flex" alignItems="center" gap={0.75} mb={1}>
          <Box
            sx={{
              width: 3,
              height: 18,
              borderRadius: 1,
              background: 'linear-gradient(180deg, #1976d2 0%, #1565c0 100%)',
            }}
          />
          <BarChartIcon sx={{ fontSize: 18, color: 'primary.main' }} />
          <Typography variant="subtitle1" fontWeight={800} sx={{ fontSize: '0.95rem', letterSpacing: '-0.01em' }}>
            Performance snapshot
          </Typography>
        </Box>
        
        <Grid container spacing={1.25}>
          {/* Project Completion Rate */}
          <Grid item xs={12} md={6}>
            <Card 
              elevation={0}
              sx={{
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 2,
                height: '100%',
                transition: 'box-shadow 0.2s ease',
                '&:hover': {
                  boxShadow: '0 6px 18px rgba(15, 23, 42, 0.08)',
                },
                background: 'linear-gradient(165deg, rgba(76, 175, 80, 0.06) 0%, #fff 55%)'
              }}
            >
              <CardContent sx={{ p: 1.25, '&:last-child': { pb: 1.25 } }}>
                <Box display="flex" alignItems="center" mb={1}>
                  <Box sx={{ 
                    p: 0.65, 
                    borderRadius: 1.25, 
                    background: 'linear-gradient(135deg, #4caf50 0%, #2e7d32 100%)',
                    mr: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    <CheckCircle sx={{ fontSize: 18, color: 'white' }} />
                  </Box>
                  <Typography variant="subtitle2" fontWeight={800} sx={{ fontSize: '0.82rem' }}>
                    Completion rate
                  </Typography>
                </Box>
                <Box sx={{ mb: 1 }}>
                  <Typography variant="h4" color="success.main" fontWeight={800} sx={{ fontSize: '1.65rem', mb: 0.25, lineHeight: 1.1 }}>
                    {stats && stats.total_projects > 0 ? Math.round((stats.completed_projects / stats.total_projects) * 100) : 0}%
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.72rem' }}>
                    {stats?.completed_projects || 0} of {stats?.total_projects || 0} projects
                  </Typography>
                </Box>
                <LinearProgress 
                  variant="determinate" 
                  value={stats && stats.total_projects > 0 ? (stats.completed_projects / stats.total_projects) * 100 : 0}
                  sx={{ 
                    height: 6, 
                    borderRadius: 3,
                    backgroundColor: 'rgba(76, 175, 80, 0.12)',
                    '& .MuiLinearProgress-bar': {
                      background: 'linear-gradient(90deg, #43a047 0%, #66bb6a 100%)',
                      borderRadius: 3
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
                borderRadius: 2,
                height: '100%',
                transition: 'box-shadow 0.2s ease',
                '&:hover': {
                  boxShadow: '0 6px 18px rgba(15, 23, 42, 0.08)',
                },
                background: 'linear-gradient(165deg, rgba(25, 118, 210, 0.07) 0%, #fff 55%)'
              }}
            >
              <CardContent sx={{ p: 1.25, '&:last-child': { pb: 1.25 } }}>
                <Box display="flex" alignItems="center" mb={1}>
                  <Box sx={{ 
                    p: 0.65, 
                    borderRadius: 1.25, 
                    background: 'linear-gradient(135deg, #1976d2 0%, #0d47a1 100%)',
                    mr: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    <TrendingUp sx={{ fontSize: 18, color: 'white' }} />
                  </Box>
                  <Typography variant="subtitle2" fontWeight={800} sx={{ fontSize: '0.82rem' }}>
                    Budget to completed
                  </Typography>
                </Box>
                <Box sx={{ mb: 1 }}>
                  <Typography variant="h4" color="primary.main" fontWeight={800} sx={{ fontSize: '1.65rem', mb: 0.25, lineHeight: 1.1 }}>
                    {stats && stats.total_budget > 0 ? Math.round((stats.completed_budget / stats.total_budget) * 100) : 0}%
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.72rem', display: 'block', lineHeight: 1.35 }}>
                    {formatCurrency(stats?.completed_budget || 0)} of {formatCurrency(stats?.total_budget || 0)}
                  </Typography>
                </Box>
                <LinearProgress 
                  variant="determinate" 
                  value={stats && stats.total_budget > 0 ? (stats.completed_budget / stats.total_budget) * 100 : 0}
                  sx={{ 
                    height: 6, 
                    borderRadius: 3,
                    backgroundColor: 'rgba(25, 118, 210, 0.12)',
                    '& .MuiLinearProgress-bar': {
                      background: 'linear-gradient(90deg, #1565c0 0%, #42a5f5 100%)',
                      borderRadius: 3
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
                borderRadius: 2,
                height: '100%',
                transition: 'box-shadow 0.2s ease',
                '&:hover': {
                  boxShadow: '0 6px 18px rgba(15, 23, 42, 0.08)',
                },
                background: 'linear-gradient(165deg, rgba(33, 150, 243, 0.06) 0%, #fff 50%)'
              }}
            >
              <CardContent sx={{ p: 1.25, '&:last-child': { pb: 1.25 } }}>
                <Box display="flex" alignItems="center" mb={1}>
                  <Box sx={{ 
                    p: 0.65, 
                    borderRadius: 1.25, 
                    background: 'linear-gradient(135deg, #2196f3 0%, #1565c0 100%)',
                    mr: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    <PieChartIcon sx={{ fontSize: 18, color: 'white' }} />
                  </Box>
                  <Typography variant="subtitle2" fontWeight={800} sx={{ fontSize: '0.82rem' }}>
                    Status mix
                  </Typography>
                </Box>
                <List dense sx={{ py: 0 }}>
                  <ListItem sx={{ py: 0.35, px: 0 }}>
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
                  <ListItem sx={{ py: 0.35, px: 0 }}>
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
                  <ListItem sx={{ py: 0.35, px: 0 }}>
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
                borderRadius: 2,
                height: '100%',
                transition: 'box-shadow 0.2s ease',
                '&:hover': {
                  boxShadow: '0 6px 18px rgba(15, 23, 42, 0.08)',
                },
                background: 'linear-gradient(165deg, rgba(156, 39, 176, 0.06) 0%, #fff 50%)'
              }}
            >
              <CardContent sx={{ p: 1.25, '&:last-child': { pb: 1.25 } }}>
                <Box display="flex" alignItems="center" mb={1}>
                  <Box sx={{ 
                    p: 0.65, 
                    borderRadius: 1.25, 
                    background: 'linear-gradient(135deg, #9c27b0 0%, #6a1b9a 100%)',
                    mr: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    <Star sx={{ fontSize: 18, color: 'white' }} />
                  </Box>
                  <Typography variant="subtitle2" fontWeight={800} sx={{ fontSize: '0.82rem' }}>
                    At-a-glance metrics
                  </Typography>
                </Box>
                <Grid container spacing={1}>
                  <Grid item xs={6}>
                    <Box 
                      textAlign="center" 
                      sx={{ 
                        p: 1, 
                        borderRadius: 1.5, 
                        background: 'rgba(76, 175, 80, 0.08)',
                        border: '1px solid',
                        borderColor: 'success.light',
                        borderOpacity: 0.35
                      }}
                    >
                      <Typography variant="h5" color="success.main" fontWeight={800} sx={{ fontSize: '1.35rem', mb: 0.25, lineHeight: 1.1 }}>
                        {stats && stats.total_projects > 0 ? Math.round((stats.completed_projects / stats.total_projects) * 100) : 0}%
                      </Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.68rem', fontWeight: 600 }}>
                        Success rate
                      </Typography>
                    </Box>
                  </Grid>
                  <Grid item xs={6}>
                    <Box 
                      textAlign="center" 
                      sx={{ 
                        p: 1, 
                        borderRadius: 1.5, 
                        background: 'rgba(25, 118, 210, 0.08)',
                        border: '1px solid',
                        borderColor: 'primary.light',
                        borderOpacity: 0.35
                      }}
                    >
                      <Typography variant="h5" color="primary.main" fontWeight={800} sx={{ fontSize: '1.35rem', mb: 0.25, lineHeight: 1.1 }}>
                        {stats && stats.total_budget > 0 ? Math.round((stats.completed_budget / stats.total_budget) * 100) : 0}%
                      </Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.68rem', fontWeight: 600 }}>
                        Budget share done
                      </Typography>
                    </Box>
                  </Grid>
                  <Grid item xs={6}>
                    <Box 
                      textAlign="center" 
                      sx={{ 
                        p: 1, 
                        borderRadius: 1.5, 
                        background: 'rgba(33, 150, 243, 0.08)',
                        border: '1px solid',
                        borderColor: 'info.light',
                        borderOpacity: 0.35
                      }}
                    >
                      <Typography variant="h6" color="info.main" fontWeight={800} sx={{ fontSize: '0.95rem', mb: 0.25, lineHeight: 1.2 }}>
                        {stats?.total_budget && stats?.total_projects > 0 ? formatCurrency(stats.total_budget / stats.total_projects) : 'N/A'}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.68rem', fontWeight: 600 }}>
                        Avg project value
                      </Typography>
                    </Box>
                  </Grid>
                  <Grid item xs={6}>
                    <Box 
                      textAlign="center" 
                      sx={{ 
                        p: 1, 
                        borderRadius: 1.5, 
                        background: 'rgba(255, 152, 0, 0.08)',
                        border: '1px solid',
                        borderColor: 'warning.light',
                        borderOpacity: 0.35
                      }}
                    >
                      <Typography variant="h5" color="warning.main" fontWeight={800} sx={{ fontSize: '1.35rem', mb: 0.25, lineHeight: 1.1 }}>
                        {stats?.total_projects || 0}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.68rem', fontWeight: 600 }}>
                        Total projects
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
      <Box sx={{ mb: 1.5 }}>
        <Box display="flex" alignItems="center" gap={0.75} mb={1}>
          <Box
            sx={{
              width: 3,
              height: 18,
              borderRadius: 1,
              background: 'linear-gradient(180deg, #1976d2 0%, #1565c0 100%)',
            }}
          />
          <Timeline sx={{ fontSize: 18, color: 'primary.main' }} />
          <Typography variant="subtitle1" fontWeight={800} sx={{ fontSize: '0.95rem', letterSpacing: '-0.01em' }}>
            Charts
          </Typography>
        </Box>
        
        <Grid container spacing={1.25}>
          {/* Project Status Pie Chart */}
          <Grid item xs={12} md={6}>
            <Card 
              elevation={0}
              sx={{
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 2,
                height: '100%',
                transition: 'box-shadow 0.2s ease',
                '&:hover': {
                  boxShadow: '0 6px 18px rgba(15, 23, 42, 0.08)',
                },
              }}
            >
              <CardContent sx={{ p: 1.25, '&:last-child': { pb: 1 } }}>
                <Typography variant="subtitle2" fontWeight={800} sx={{ fontSize: '0.82rem', mb: 0.5 }}>
                  Projects by status
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.68rem', display: 'block', mb: 0.75 }}>
                  Non-zero segments only
                </Typography>
                <Box sx={{ height: 240 }}>
                  {stats ? (
                    statusPieData.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                          <Pie
                            data={statusPieData}
                            cx="50%"
                            cy="46%"
                            innerRadius={48}
                            outerRadius={72}
                            paddingAngle={2}
                            dataKey="value"
                            stroke="rgba(255,255,255,0.85)"
                            strokeWidth={1}
                          >
                            {statusPieData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={getStatusColorForChart(entry.name)} />
                            ))}
                          </Pie>
                          <Tooltip contentStyle={CHART_TOOLTIP_SX} formatter={(value, name) => [`${value} projects`, name]} />
                          <Legend
                            verticalAlign="bottom"
                            height={28}
                            wrapperStyle={{ fontSize: '11px', paddingTop: 4 }}
                            iconType="circle"
                            iconSize={8}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    ) : (
                      <Box sx={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Typography variant="caption" color="text.secondary">No project data for this view</Typography>
                      </Box>
                    )
                  ) : (
                    <Box sx={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <CircularProgress size={28} />
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
                borderRadius: 2,
                height: '100%',
                transition: 'box-shadow 0.2s ease',
                '&:hover': {
                  boxShadow: '0 6px 18px rgba(15, 23, 42, 0.08)',
                },
              }}
            >
              <CardContent sx={{ p: 1.25, '&:last-child': { pb: 1 } }}>
                <Typography variant="subtitle2" fontWeight={800} sx={{ fontSize: '0.82rem', mb: 0.5 }}>
                  Budget by status
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.68rem', display: 'block', mb: 0.75 }}>
                  Axis in millions KES
                </Typography>
                <Box sx={{ height: 240 }}>
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
                        margin={{ top: 8, right: 8, left: 4, bottom: 4 }}
                        barCategoryGap="18%"
                      >
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(15,23,42,0.08)" />
                        <XAxis
                          dataKey="name"
                          tick={{ fontSize: 10 }}
                          interval={0}
                          height={56}
                          tickLine={false}
                          axisLine={{ stroke: 'rgba(15,23,42,0.12)' }}
                        />
                        <YAxis
                          width={44}
                          tick={{ fontSize: 10 }}
                          tickLine={false}
                          axisLine={false}
                          tickFormatter={(value) => {
                            const millions = value / 1000000;
                            return `${millions.toFixed(0)}M`;
                          }} 
                        />
                        <Tooltip contentStyle={CHART_TOOLTIP_SX} formatter={(value) => [formatCurrency(value), 'Budget']} />
                        <Bar dataKey="budget" radius={[4, 4, 0, 0]} maxBarSize={36}>
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
                    <Box sx={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <CircularProgress size={28} />
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
                borderRadius: 2,
                transition: 'box-shadow 0.2s ease',
                '&:hover': {
                  boxShadow: '0 6px 18px rgba(15, 23, 42, 0.08)',
                },
              }}
            >
              <CardContent sx={{ p: 1.25, '&:last-child': { pb: 1 } }}>
                <Typography variant="subtitle2" fontWeight={800} sx={{ fontSize: '0.82rem', mb: 0.5 }}>
                  Projects vs budget share (%)
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.68rem', display: 'block', mb: 0.75 }}>
                  Left: count · Right: % of total budget
                </Typography>
                <Box sx={{ height: 220 }}>
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
                        margin={{ top: 8, right: 12, left: 4, bottom: 4 }}
                        barCategoryGap="16%"
                      >
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(15,23,42,0.08)" />
                        <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} height={52} tickLine={false} axisLine={{ stroke: 'rgba(15,23,42,0.12)' }} />
                        <YAxis yAxisId="left" width={32} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} allowDecimals={false} />
                        <YAxis yAxisId="right" orientation="right" width={36} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(v) => `${Math.round(v)}%`} domain={[0, 100]} />
                        <Tooltip contentStyle={CHART_TOOLTIP_SX} />
                        <Legend wrapperStyle={{ fontSize: '11px', paddingTop: 2 }} iconSize={8} />
                        <Bar yAxisId="left" dataKey="projects" name="Projects" radius={[3, 3, 0, 0]} maxBarSize={28}>
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
                        <Bar yAxisId="right" dataKey="budgetPercent" fill="#5c6bc0" name="Budget %" radius={[3, 3, 0, 0]} maxBarSize={28} opacity={0.85} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <Box sx={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <CircularProgress size={28} />
                    </Box>
                  )}
                </Box>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </Box>

      <Divider sx={{ my: 1.75 }} />

      {/* Detailed Breakdown Tabs */}
      <Paper 
        sx={{ 
          mb: 1.5, 
          borderRadius: 2,
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
            minHeight: 42,
            '& .MuiTab-root': {
              fontWeight: 600,
              fontSize: '0.8rem',
              minHeight: 42,
              py: 0.75,
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
          <Tab icon={<Business sx={{ fontSize: 18 }} />} label="By Department" iconPosition="start" />
          <Tab icon={<LocationOn sx={{ fontSize: 18 }} />} label="By Sub-County" iconPosition="start" />
          <Tab icon={<LocationCity sx={{ fontSize: 18 }} />} label="By Ward" iconPosition="start" />
          <Tab icon={<TrendingUp sx={{ fontSize: 18 }} />} label="Yearly Trends" iconPosition="start" />
        </Tabs>

        <Box sx={{ p: 1.25, pt: 1.5, background: 'rgba(0,0,0,0.02)' }}>
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
          p: 1.25,
          mt: 2,
          borderRadius: 2,
          background: 'linear-gradient(135deg, #5c6bc0 0%, #3949ab 100%)',
          color: 'white',
          border: '1px solid rgba(255,255,255,0.18)',
          boxShadow: '0 4px 16px rgba(57, 73, 171, 0.25)',
        }}
      >
        <Typography variant="body2" textAlign="center" sx={{ fontSize: '0.8rem', fontWeight: 500 }}>
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
