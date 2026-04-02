import React, { useState, useEffect, useMemo } from 'react';
import {
  Box,
  Grid,
  Card,
  CardContent,
  Typography,
  useTheme,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  IconButton,
  Collapse,
  Tabs,
  Tab,
  Chip,
  CircularProgress,
  Alert,
} from '@mui/material';
import {
  FilterList as FilterIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  Clear as ClearIcon,
  Assessment as AssessmentIcon,
} from '@mui/icons-material';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip as RechartsTooltip,
  Legend,
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  LineChart,
  Line,
  ComposedChart,
} from 'recharts';
import { tokens } from './dashboard/theme';
import apiService from '../api';
import { useAuth } from '../context/AuthContext';

const formatCurrency = (value) =>
  new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency: 'KES',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value || 0);

const STATUS_COLORS = {
  'In Progress': '#3b82f6',
  'Not Started': '#64748b',
  'Completed': '#10b981',
  'On Hold': '#f59e0b',
  'Cancelled': '#ef4444',
  'At Risk': '#f97316',
  'Stalled': '#dc2626',
  'Delayed': '#eab308',
  'Closed': '#6b7280',
  'Planning': '#8b5cf6',
  'Initiated': '#06b6d4',
  'Ongoing': '#3b82f6',
};

const ReportingDashboardPage = () => {
  const theme = useTheme();
  const colors = tokens(theme.palette.mode);
  const { user } = useAuth();
  
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [projects, setProjects] = useState([]);
  const [activeTab, setActiveTab] = useState(0);
  
  const [filters, setFilters] = useState({
    ministry: '',
    stateDepartment: '',
    constituency: '',
    ward: '',
    financialYear: '',
    status: '',
    projectType: '',
    fundingSource: '',
  });

  const [filterOptions, setFilterOptions] = useState({
    ministries: [],
    stateDepartments: [],
    constituencies: [],
    wards: [],
    financialYears: [],
    statuses: [],
    projectTypes: [],
    fundingSources: [],
  });

  // Fetch filter options
  useEffect(() => {
    const fetchFilterOptions = async () => {
      try {
        const [projectsData] = await Promise.all([
          apiService.projects.getProjects({ limit: 1000 }),
        ]);

        // Extract unique values from projects
        const ministries = [...new Set(projectsData.map(p => p.departmentName || p.ministry).filter(Boolean))].sort();
        const stateDepartments = [...new Set(projectsData.map(p => p.sectionName || p.stateDepartment).filter(Boolean))].sort();
        const constituencies = [...new Set(projectsData.map(p => p.constituency || p.constituencyNames).filter(Boolean))].sort();
        const wards = [...new Set(projectsData.map(p => p.ward || p.wardNames).filter(Boolean))].sort();
        const statuses = [...new Set(projectsData.map(p => p.status).filter(Boolean))].sort();
        const projectTypes = [...new Set(projectsData.map(p => p.categoryName || p.sector).filter(Boolean))].sort();
        const fundingSources = [...new Set(projectsData.map(p => p.budgetSource).filter(Boolean))].sort();

        // Fetch financial years from metadata
        let financialYears = [];
        try {
          financialYears = await apiService.metadata.financialYears.getAllFinancialYears();
          financialYears = financialYears.map(fy => fy.finYearName || fy.name).sort();
        } catch (err) {
          console.warn('Could not fetch financial years:', err);
        }

        setFilterOptions({
          ministries,
          stateDepartments,
          constituencies,
          wards,
          financialYears,
          statuses,
          projectTypes,
          fundingSources,
        });
      } catch (err) {
        console.error('Error fetching filter options:', err);
      }
    };

    fetchFilterOptions();
  }, []);

  // Fetch filtered projects
  useEffect(() => {
    const fetchProjects = async () => {
      if (!user) return;
      
      setLoading(true);
      setError(null);
      
      try {
        // Fetch all projects and filter client-side since API may not support all filters
        const data = await apiService.projects.getProjects({ limit: 5000 });
        setProjects(data || []);
      } catch (err) {
        console.error('Error fetching projects:', err);
        setError(err.message || 'Failed to load projects');
        setProjects([]);
      } finally {
        setLoading(false);
      }
    };

    fetchProjects();
  }, [user]);

  // Filter projects based on current filters
  const filteredProjects = useMemo(() => {
    return projects.filter((p) => {
      // Handle ministry/department (can be departmentName or ministry field)
      if (filters.ministry) {
        const projectMinistry = p.departmentName || p.ministry || '';
        if (projectMinistry !== filters.ministry) return false;
      }
      
      // Handle state department/section (can be sectionName or stateDepartment field)
      if (filters.stateDepartment) {
        const projectStateDept = p.sectionName || p.stateDepartment || '';
        if (projectStateDept !== filters.stateDepartment) return false;
      }
      
      // Handle constituency (can be constituency or constituencyNames field, or in location JSONB)
      if (filters.constituency) {
        const projectConstituency = p.constituency || p.constituencyNames || '';
        if (projectConstituency !== filters.constituency) return false;
      }
      
      // Handle ward (can be ward or wardNames field, or in location JSONB)
      if (filters.ward) {
        const projectWard = p.ward || p.wardNames || '';
        if (projectWard !== filters.ward) return false;
      }
      
      // Handle financial year
      if (filters.financialYear && p.financialYearName !== filters.financialYear) return false;
      
      // Handle status
      if (filters.status && p.status !== filters.status) return false;
      
      // Handle project type (can be categoryName or sector)
      if (filters.projectType) {
        const projectType = p.categoryName || p.sector || '';
        if (projectType !== filters.projectType) return false;
      }
      
      // Handle funding source
      if (filters.fundingSource && p.budgetSource !== filters.fundingSource) return false;
      
      return true;
    });
  }, [projects, filters]);

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const handleClearFilters = () => {
    setFilters({
      ministry: '',
      stateDepartment: '',
      constituency: '',
      ward: '',
      financialYear: '',
      status: '',
      projectType: '',
      fundingSource: '',
    });
  };

  const hasActiveFilters = Object.values(filters).some(v => v !== '');

  // Calculate chart data
  const chartData = useMemo(() => {
    // Project Status Distribution (Donut Chart)
    const statusDistribution = {};
    filteredProjects.forEach(p => {
      const status = p.status || 'Unknown';
      statusDistribution[status] = (statusDistribution[status] || 0) + 1;
    });

    const statusChartData = Object.entries(statusDistribution).map(([name, value]) => ({
      name,
      value,
      color: STATUS_COLORS[name] || '#64748b',
    }));

    // Project Progress by Ministry (Combination Chart)
    const ministryData = {};
    filteredProjects.forEach(p => {
      const ministry = p.departmentName || p.ministry || 'Unknown';
      if (!ministryData[ministry]) {
        ministryData[ministry] = {
          ministry,
          allocatedBudget: 0,
          contractSum: 0,
          paidAmount: 0,
          projectCount: 0,
          totalProgress: 0,
        };
      }
      const budget = parseFloat(p.costOfProject || 0);
      const paid = parseFloat(p.paidOut || 0);
      const progress = parseFloat(p.overallProgress || 0);
      
      ministryData[ministry].allocatedBudget += budget;
      ministryData[ministry].contractSum += budget * 0.8; // Estimate contract sum as 80% of budget
      ministryData[ministry].paidAmount += paid;
      ministryData[ministry].projectCount += 1;
      ministryData[ministry].totalProgress += progress;
    });

    const ministryChartData = Object.values(ministryData).map(m => ({
      ...m,
      percentCompleted: m.projectCount > 0 ? (m.totalProgress / m.projectCount).toFixed(1) : 0,
      percentContracted: m.allocatedBudget > 0 ? ((m.contractSum / m.allocatedBudget) * 100).toFixed(1) : 0,
      percentPaid: m.contractSum > 0 ? ((m.paidAmount / m.contractSum) * 100).toFixed(1) : 0,
      absorptionRate: m.allocatedBudget > 0 ? ((m.paidAmount / m.allocatedBudget) * 100).toFixed(1) : 0,
    })).sort((a, b) => b.allocatedBudget - a.allocatedBudget).slice(0, 10);

    // Project Types Distribution (Pie Chart)
    const typeDistribution = {};
    filteredProjects.forEach(p => {
      const type = p.categoryName || p.sector || 'Unknown';
      typeDistribution[type] = (typeDistribution[type] || 0) + 1;
    });

    const typeChartData = Object.entries(typeDistribution).map(([name, value]) => ({
      name,
      value,
    }));

    return {
      statusChartData,
      ministryChartData,
      typeChartData,
    };
  }, [filteredProjects]);

  const renderProjectSummaryTab = () => (
    <Grid container spacing={2.5}>
      {/* Project Status Donut Chart */}
      <Grid item xs={12} md={4}>
        <Card 
          sx={{ 
            height: '100%', 
            borderRadius: 2, 
            bgcolor: theme.palette.mode === 'dark' ? colors.primary[400] : '#ffffff',
            border: `1px solid ${theme.palette.mode === 'dark' ? colors.blueAccent[700] : 'rgba(0,0,0,0.08)'}`,
            boxShadow: `0 2px 8px ${colors.blueAccent[500]}10`,
            transition: 'all 0.2s ease',
            '&:hover': {
              boxShadow: `0 4px 16px ${colors.blueAccent[500]}20`,
              transform: 'translateY(-2px)',
            },
          }}
        >
          <CardContent sx={{ p: 2.5 }}>
            <Typography variant="h6" sx={{ mb: 2, fontWeight: 600, color: colors.grey[100], fontSize: '1rem' }}>
              Project Status
            </Typography>
            <ResponsiveContainer width="100%" height={320}>
              <PieChart>
                <Pie
                  data={chartData.statusChartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {chartData.statusChartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <RechartsTooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </Grid>

      {/* Project Progress by Ministry - Combination Chart */}
      <Grid item xs={12} md={5}>
        <Card 
          sx={{ 
            height: '100%', 
            borderRadius: 2, 
            bgcolor: theme.palette.mode === 'dark' ? colors.primary[400] : '#ffffff',
            border: `1px solid ${theme.palette.mode === 'dark' ? colors.blueAccent[700] : 'rgba(0,0,0,0.08)'}`,
            boxShadow: `0 2px 8px ${colors.blueAccent[500]}10`,
            transition: 'all 0.2s ease',
            '&:hover': {
              boxShadow: `0 4px 16px ${colors.blueAccent[500]}20`,
              transform: 'translateY(-2px)',
            },
          }}
        >
          <CardContent sx={{ p: 2.5 }}>
            <Typography variant="h6" sx={{ mb: 2, fontWeight: 600, color: colors.grey[100], fontSize: '1rem' }}>
              Project Progress in % | Stratified By Ministries
            </Typography>
            <ResponsiveContainer width="100%" height={320}>
              <ComposedChart data={chartData.ministryChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke={colors.grey[700]} />
                <XAxis 
                  dataKey="ministry" 
                  angle={-45}
                  textAnchor="end"
                  height={100}
                  tick={{ fontSize: 10, fill: colors.grey[300] }}
                />
                <YAxis 
                  yAxisId="left"
                  label={{ value: 'Budget / Contract Sum', angle: -90, position: 'insideLeft', fill: colors.grey[300] }}
                  tick={{ fill: colors.grey[300] }}
                />
                <YAxis 
                  yAxisId="right"
                  orientation="right"
                  label={{ value: '% Completed', angle: 90, position: 'insideRight', fill: colors.grey[300] }}
                  tick={{ fill: colors.grey[300] }}
                  domain={[0, 100]}
                />
                <RechartsTooltip 
                  formatter={(value, name) => {
                    if (name === 'allocatedBudget' || name === 'contractSum' || name === 'paidAmount') {
                      return formatCurrency(value);
                    }
                    return `${value}%`;
                  }}
                />
                <Legend />
                <Bar yAxisId="left" dataKey="allocatedBudget" fill="#f97316" name="Allocated Budget" />
                <Bar yAxisId="left" dataKey="contractSum" fill="#3b82f6" name="Contract Sum" />
                <Line 
                  yAxisId="right" 
                  type="monotone" 
                  dataKey="percentCompleted" 
                  stroke="#10b981" 
                  strokeWidth={2}
                  name="% Completed"
                  dot={{ r: 4 }}
                />
                <Line 
                  yAxisId="right" 
                  type="monotone" 
                  dataKey="percentContracted" 
                  stroke="#06b6d4" 
                  strokeWidth={2}
                  name="% of Budget Contracted"
                  dot={{ r: 4 }}
                />
                <Line 
                  yAxisId="right" 
                  type="monotone" 
                  dataKey="percentPaid" 
                  stroke="#8b5cf6" 
                  strokeWidth={2}
                  name="% of Contract Sum Paid"
                  dot={{ r: 4 }}
                />
                <Line 
                  yAxisId="right" 
                  type="monotone" 
                  dataKey="absorptionRate" 
                  stroke="#eab308" 
                  strokeWidth={2}
                  name="% Disbursement Rate"
                  dot={{ r: 4 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </Grid>

      {/* Project Types Pie Chart */}
      <Grid item xs={12} md={3}>
        <Card 
          sx={{ 
            height: '100%', 
            borderRadius: 2, 
            bgcolor: theme.palette.mode === 'dark' ? colors.primary[400] : '#ffffff',
            border: `1px solid ${theme.palette.mode === 'dark' ? colors.blueAccent[700] : 'rgba(0,0,0,0.08)'}`,
            boxShadow: `0 2px 8px ${colors.blueAccent[500]}10`,
            transition: 'all 0.2s ease',
            '&:hover': {
              boxShadow: `0 4px 16px ${colors.blueAccent[500]}20`,
              transform: 'translateY(-2px)',
            },
          }}
        >
          <CardContent sx={{ p: 2.5 }}>
            <Typography variant="h6" sx={{ mb: 2, fontWeight: 600, color: colors.grey[100], fontSize: '1rem' }}>
              Project Types
            </Typography>
            <ResponsiveContainer width="100%" height={320}>
              <PieChart>
                <Pie
                  data={chartData.typeChartData}
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  paddingAngle={2}
                  dataKey="value"
                  label={({ name, value }) => `${value}`}
                >
                  {chartData.typeChartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={Object.values(STATUS_COLORS)[index % Object.keys(STATUS_COLORS).length]} />
                  ))}
                </Pie>
                <RechartsTooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </Grid>
    </Grid>
  );

  const renderTabContent = () => {
    switch (activeTab) {
      case 0:
        return renderProjectSummaryTab();
      case 1:
        return <Box p={3}><Typography>Funding Source Summary - Coming Soon</Typography></Box>;
      case 2:
        return <Box p={3}><Typography>Ministry Summary - Coming Soon</Typography></Box>;
      case 3:
        return <Box p={3}><Typography>State Department Summary - Coming Soon</Typography></Box>;
      case 4:
        return <Box p={3}><Typography>Constituency Summary - Coming Soon</Typography></Box>;
      case 5:
        return <Box p={3}><Typography>Ward Summary - Coming Soon</Typography></Box>;
      case 6:
        return <Box p={3}><Typography>Yearly Trends - Coming Soon</Typography></Box>;
      default:
        return renderProjectSummaryTab();
    }
  };

  return (
    <Box sx={{ p: 3, bgcolor: colors.primary[500], minHeight: '100vh' }}>
      {/* Header */}
      <Box sx={{ mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
          <Box
            sx={{
              width: 4,
              height: 40,
              background: `linear-gradient(180deg, ${colors.blueAccent[500]}, ${colors.greenAccent[500]})`,
              borderRadius: 2,
            }}
          />
          <Box sx={{ flex: 1 }}>
            <Typography
              variant="h4"
              sx={{
                fontWeight: 800,
                background: `linear-gradient(135deg, ${colors.blueAccent[500]}, ${colors.greenAccent[500]})`,
                backgroundClip: 'text',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                fontSize: { xs: '1.5rem', md: '2rem' },
                mb: 0.5,
              }}
            >
              Reporting Dashboard
            </Typography>
            <Typography variant="body2" sx={{ color: colors.grey[300], fontSize: '0.9rem' }}>
              Comprehensive project reporting and analytics across ministries, state departments, and geographic regions
            </Typography>
          </Box>
        </Box>
        {filteredProjects.length > 0 && (
          <Box sx={{ mt: 2, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <Chip
              label={`${filteredProjects.length} Projects`}
              sx={{
                bgcolor: colors.blueAccent[600],
                color: 'white',
                fontWeight: 600,
              }}
            />
            <Chip
              label={formatCurrency(filteredProjects.reduce((sum, p) => sum + (parseFloat(p.costOfProject) || 0), 0))}
              sx={{
                bgcolor: colors.greenAccent[600],
                color: 'white',
                fontWeight: 600,
              }}
            />
          </Box>
        )}
      </Box>

      {/* Collapsible Filter Bar */}
      <Card
        sx={{
          mb: 2.5,
          borderRadius: 2,
          bgcolor: theme.palette.mode === 'dark' ? colors.primary[400] : '#ffffff',
          border: `1px solid ${theme.palette.mode === 'dark' ? colors.blueAccent[700] : 'rgba(0,0,0,0.08)'}`,
          boxShadow: `0 2px 8px ${colors.blueAccent[500]}15`,
        }}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            p: 1.5,
            bgcolor: theme.palette.mode === 'dark' ? colors.blueAccent[700] : colors.blueAccent[100],
            cursor: 'pointer',
            borderRadius: '8px 8px 0 0',
          }}
          onClick={() => setFiltersExpanded(!filtersExpanded)}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <FilterIcon sx={{ color: theme.palette.mode === 'dark' ? '#fff' : colors.blueAccent[900] }} />
            <Typography
              variant="subtitle1"
              sx={{
                fontWeight: 600,
                color: theme.palette.mode === 'dark' ? '#fff' : colors.blueAccent[900],
              }}
            >
              FILTER YOUR REPORT BY:
            </Typography>
            {hasActiveFilters && (
              <Chip
                label={`${Object.values(filters).filter(v => v !== '').length} active`}
                size="small"
                sx={{
                  bgcolor: theme.palette.mode === 'dark' ? colors.greenAccent[500] : colors.greenAccent[100],
                  color: theme.palette.mode === 'dark' ? '#fff' : colors.greenAccent[900],
                  fontSize: '0.7rem',
                  height: '20px',
                }}
              />
            )}
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {hasActiveFilters && (
              <IconButton
                size="small"
                onClick={(e) => {
                  e.stopPropagation();
                  handleClearFilters();
                }}
                sx={{
                  color: theme.palette.mode === 'dark' ? '#fff' : colors.blueAccent[900],
                  '&:hover': { bgcolor: 'rgba(0,0,0,0.1)' },
                }}
              >
                <ClearIcon fontSize="small" />
              </IconButton>
            )}
            {filtersExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
          </Box>
        </Box>

        <Collapse in={filtersExpanded}>
          <Box sx={{ p: 2 }}>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6} md={3}>
                <FormControl fullWidth size="small">
                  <InputLabel>Ministry</InputLabel>
                  <Select
                    value={filters.ministry}
                    label="Ministry"
                    onChange={(e) => handleFilterChange('ministry', e.target.value)}
                  >
                    <MenuItem value="">All Ministries</MenuItem>
                    {filterOptions.ministries.map((m) => (
                      <MenuItem key={m} value={m}>
                        {m}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <FormControl fullWidth size="small">
                  <InputLabel>State Department</InputLabel>
                  <Select
                    value={filters.stateDepartment}
                    label="State Department"
                    onChange={(e) => handleFilterChange('stateDepartment', e.target.value)}
                  >
                    <MenuItem value="">All State Departments</MenuItem>
                    {filterOptions.stateDepartments.map((sd) => (
                      <MenuItem key={sd} value={sd}>
                        {sd}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <FormControl fullWidth size="small">
                  <InputLabel>Constituency</InputLabel>
                  <Select
                    value={filters.constituency}
                    label="Constituency"
                    onChange={(e) => handleFilterChange('constituency', e.target.value)}
                  >
                    <MenuItem value="">All Constituencies</MenuItem>
                    {filterOptions.constituencies.map((c) => (
                      <MenuItem key={c} value={c}>
                        {c}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <FormControl fullWidth size="small">
                  <InputLabel>Ward</InputLabel>
                  <Select
                    value={filters.ward}
                    label="Ward"
                    onChange={(e) => handleFilterChange('ward', e.target.value)}
                  >
                    <MenuItem value="">All Wards</MenuItem>
                    {filterOptions.wards.map((w) => (
                      <MenuItem key={w} value={w}>
                        {w}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <FormControl fullWidth size="small">
                  <InputLabel>Financial Year</InputLabel>
                  <Select
                    value={filters.financialYear}
                    label="Financial Year"
                    onChange={(e) => handleFilterChange('financialYear', e.target.value)}
                  >
                    <MenuItem value="">All Years</MenuItem>
                    {filterOptions.financialYears.map((fy) => (
                      <MenuItem key={fy} value={fy}>
                        {fy}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <FormControl fullWidth size="small">
                  <InputLabel>Status</InputLabel>
                  <Select
                    value={filters.status}
                    label="Status"
                    onChange={(e) => handleFilterChange('status', e.target.value)}
                  >
                    <MenuItem value="">All Statuses</MenuItem>
                    {filterOptions.statuses.map((s) => (
                      <MenuItem key={s} value={s}>
                        {s}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <FormControl fullWidth size="small">
                  <InputLabel>Project Type</InputLabel>
                  <Select
                    value={filters.projectType}
                    label="Project Type"
                    onChange={(e) => handleFilterChange('projectType', e.target.value)}
                  >
                    <MenuItem value="">All Types</MenuItem>
                    {filterOptions.projectTypes.map((pt) => (
                      <MenuItem key={pt} value={pt}>
                        {pt}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <FormControl fullWidth size="small">
                  <InputLabel>Funding Source</InputLabel>
                  <Select
                    value={filters.fundingSource}
                    label="Funding Source"
                    onChange={(e) => handleFilterChange('fundingSource', e.target.value)}
                  >
                    <MenuItem value="">All Sources</MenuItem>
                    {filterOptions.fundingSources.map((fs) => (
                      <MenuItem key={fs} value={fs}>
                        {fs}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
            </Grid>
          </Box>
        </Collapse>
      </Card>

      {/* Tabs */}
      <Card
        sx={{
          mb: 2.5,
          borderRadius: 2,
          bgcolor: theme.palette.mode === 'dark' ? colors.primary[400] : '#ffffff',
          border: `1px solid ${theme.palette.mode === 'dark' ? colors.blueAccent[700] : 'rgba(0,0,0,0.08)'}`,
          boxShadow: `0 2px 8px ${colors.blueAccent[500]}15`,
        }}
      >
        <Tabs
          value={activeTab}
          onChange={(e, newValue) => setActiveTab(newValue)}
          sx={{
            borderBottom: `1px solid ${theme.palette.mode === 'dark' ? colors.blueAccent[700] : 'rgba(0,0,0,0.08)'}`,
            '& .MuiTab-root': {
              textTransform: 'none',
              fontWeight: 600,
              color: colors.grey[400],
              '&.Mui-selected': {
                color: colors.blueAccent[500],
              },
            },
            '& .MuiTabs-indicator': {
              bgcolor: colors.blueAccent[500],
            },
          }}
        >
          <Tab label="Project Summary" />
          <Tab label="Funding Source Summary" />
          <Tab label="Ministry Summary" />
          <Tab label="State Department Summary" />
          <Tab label="Constituency Summary" />
          <Tab label="Ward Summary" />
          <Tab label="Yearly Trends" />
        </Tabs>
      </Card>

      {/* Content */}
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
          <Box sx={{ textAlign: 'center' }}>
            <CircularProgress size={60} sx={{ mb: 2, color: colors.blueAccent[500] }} />
            <Typography variant="body2" sx={{ color: colors.grey[300] }}>
              Loading project data...
            </Typography>
          </Box>
        </Box>
      ) : error ? (
        <Alert 
          severity="error" 
          sx={{ 
            mb: 2,
            borderRadius: 2,
            bgcolor: theme.palette.mode === 'dark' ? colors.redAccent[900] : '#ffebee',
          }}
        >
          {error}
        </Alert>
      ) : filteredProjects.length === 0 ? (
        <Card
          sx={{
            p: 4,
            textAlign: 'center',
            borderRadius: 2,
            bgcolor: theme.palette.mode === 'dark' ? colors.primary[400] : '#ffffff',
            border: `1px solid ${theme.palette.mode === 'dark' ? colors.blueAccent[700] : 'rgba(0,0,0,0.08)'}`,
          }}
        >
          <Typography variant="h6" sx={{ mb: 1, color: colors.grey[300] }}>
            No Projects Found
          </Typography>
          <Typography variant="body2" sx={{ color: colors.grey[400] }}>
            Try adjusting your filters to see more results
          </Typography>
        </Card>
      ) : (
        <Box>
          {renderTabContent()}
        </Box>
      )}
    </Box>
  );
};

export default ReportingDashboardPage;
