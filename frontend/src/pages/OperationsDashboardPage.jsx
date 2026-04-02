import React, { useMemo, useState } from 'react';
import {
  Box,
  Grid,
  Card,
  CardContent,
  Typography,
  Chip,
  useTheme,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Button,
  Collapse,
  IconButton,
} from '@mui/material';
import {
  Assessment as AssessmentIcon,
  AccountTree as AccountTreeIcon,
  CalendarToday as CalendarIcon,
  FilterList as FilterIcon,
  Refresh as RefreshIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
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
} from 'recharts';
import { tokens } from './dashboard/theme';
import { useNavigate } from 'react-router-dom';

// Reuse sample data from SystemDashboardPage
const SAMPLE_PROJECTS = [
  {
    projectName: 'Level 4 Hospital Upgrade',
    Status: 'In Progress',
    budget: 120_000_000,
    Disbursed: 72_000_000,
    financialYear: '2024/2025',
    department: 'Health',
    directorate: 'Medical Services',
    County: 'Kitui',
    'sub-county': 'Kitui Central',
    Constituency: 'Kitui Central',
    ward: 'Miambani',
    percentageComplete: 60,
    StartDate: '2024-01-15',
    EndDate: '2025-06-30',
  },
  {
    projectName: 'Market Sheds Construction',
    Status: 'Not Started',
    budget: 30_000_000,
    Disbursed: 0,
    financialYear: '2024/2025',
    department: 'Trade',
    directorate: 'Trade & Commerce',
    County: 'Kitui',
    'sub-county': 'Kitui West',
    Constituency: 'Kitui West',
    ward: 'Kwa Mutonga',
    percentageComplete: 0,
    StartDate: '2025-02-01',
    EndDate: '2025-12-31',
  },
  {
    projectName: 'Rural Water Pan Program',
    Status: 'Ongoing',
    budget: 55_000_000,
    Disbursed: 40_000_000,
    financialYear: '2023/2024',
    department: 'Water',
    directorate: 'Water & Sanitation',
    County: 'Kitui',
    'sub-county': 'Kitui Rural',
    Constituency: 'Kitui Rural',
    ward: 'Kanyangi',
    percentageComplete: 73,
    StartDate: '2023-09-01',
    EndDate: '2024-09-30',
  },
  {
    projectName: 'ECDE Classrooms',
    Status: 'Completed',
    budget: 18_000_000,
    Disbursed: 18_000_000,
    financialYear: '2022/2023',
    department: 'Education',
    directorate: 'Early Childhood Development',
    County: 'Kitui',
    'sub-county': 'Kitui East',
    Constituency: 'Kitui East',
    ward: 'Zombe/Mwitika',
    percentageComplete: 100,
    StartDate: '2022-01-10',
    EndDate: '2023-03-30',
  },
  {
    projectName: 'Road Tarmacking - Kitui Town',
    Status: 'In Progress',
    budget: 85_000_000,
    Disbursed: 45_000_000,
    financialYear: '2024/2025',
    department: 'Infrastructure',
    directorate: 'Roads & Infrastructure',
    County: 'Kitui',
    'sub-county': 'Kitui Central',
    Constituency: 'Kitui Central',
    ward: 'Kitui Town',
    percentageComplete: 53,
    StartDate: '2024-03-01',
    EndDate: '2025-08-31',
  },
  {
    projectName: 'Agricultural Extension Services',
    Status: 'Ongoing',
    budget: 25_000_000,
    Disbursed: 15_000_000,
    financialYear: '2024/2025',
    department: 'Agriculture',
    directorate: 'Crop Development',
    County: 'Kitui',
    'sub-county': 'Kitui South',
    Constituency: 'Kitui South',
    ward: 'Kisasi',
    percentageComplete: 60,
    StartDate: '2024-06-01',
    EndDate: '2025-05-31',
  },
];

const STATUS_COLORS = {
  'Completed': '#16a34a',
  'In Progress': '#2563eb',
  'Ongoing': '#2563eb',
  'Not Started': '#9ca3af',
  'Delayed': '#f97316',
  'Stalled': '#dc2626',
};

const OperationsDashboardPage = () => {
  const theme = useTheme();
  const colors = tokens(theme.palette.mode);
  const navigate = useNavigate();
  const [filters, setFilters] = useState({
    department: '',
    directorate: '',
    financialYear: '',
    status: '',
  });
  const [filtersExpanded, setFiltersExpanded] = useState(false);

  const filteredProjects = useMemo(() => {
    return SAMPLE_PROJECTS.filter((p) => {
      if (filters.department && p.department !== filters.department) return false;
      if (filters.directorate && p.directorate !== filters.directorate) return false;
      if (filters.financialYear && p.financialYear !== filters.financialYear) return false;
      if (filters.status && p.Status !== filters.status) return false;
      return true;
    });
  }, [filters]);

  const chartData = useMemo(() => {
    // Projects by Sector (using department as sector for sample data)
    const sectorMap = new Map();
    filteredProjects.forEach((p) => {
      const key = p.department || 'Unknown';
      sectorMap.set(key, (sectorMap.get(key) || 0) + 1);
    });
    const sectorChart = Array.from(sectorMap.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([name, value]) => ({ name, value }));

    // Progress distribution - convert to pie chart format with colors
    const progressBands = [
      { name: '0-25%', min: 0, max: 25, count: 0, color: '#dc2626' },
      { name: '26-50%', min: 26, max: 50, count: 0, color: '#f97316' },
      { name: '51-75%', min: 51, max: 75, count: 0, color: '#2563eb' },
      { name: '76-100%', min: 76, max: 100, count: 0, color: '#16a34a' },
    ];
    filteredProjects.forEach((p) => {
      const progress = p.percentageComplete || 0;
      const band = progressBands.find((b) => progress >= b.min && progress <= b.max);
      if (band) band.count++;
    });
    const progressChart = progressBands
      .filter((b) => b.count > 0)
      .map((b) => ({ name: b.name, value: b.count, color: b.color }));

    // Timeline by Financial Year
    const fyMap = new Map();
    filteredProjects.forEach((p) => {
      const key = p.financialYear || 'Unknown';
      fyMap.set(key, (fyMap.get(key) || 0) + 1);
    });
    const fyChart = Array.from(fyMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([name, value]) => ({ name, value }));

    return {
      sectorChart,
      progressChart,
      fyChart,
    };
  }, [filteredProjects]);

  const uniqueDepartments = Array.from(new Set(SAMPLE_PROJECTS.map((p) => p.department))).filter(Boolean);
  const uniqueDirectorates = Array.from(new Set(SAMPLE_PROJECTS.map((p) => p.directorate))).filter(Boolean);
  const uniqueFinancialYears = Array.from(new Set(SAMPLE_PROJECTS.map((p) => p.financialYear))).filter(Boolean);
  const uniqueStatuses = Array.from(new Set(SAMPLE_PROJECTS.map((p) => p.Status))).filter(Boolean);

  return (
    <Box
      sx={{
        p: { xs: 1.5, md: 3 },
        background: theme.palette.mode === 'dark'
          ? `linear-gradient(135deg, ${colors.primary[900]} 0%, ${colors.primary[800]} 50%, ${colors.primary[900]} 100%)`
          : 'linear-gradient(135deg, #f5f7fa 0%, #e9ecef 100%)',
        minHeight: '100vh',
      }}
    >
      <Box mb={1.5}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, mb: 1.5 }}>
          <Box
            sx={{
              width: 3,
              height: 28,
              background: `linear-gradient(180deg, ${colors.blueAccent[500]}, ${colors.blueAccent[300]})`,
              borderRadius: 1.5,
              mt: 0.25,
            }}
          />
          <Box sx={{ flex: 1 }}>
            <Typography
              variant="h5"
              sx={{
                fontWeight: 800,
                background: `linear-gradient(135deg, ${colors.blueAccent[500]}, ${colors.blueAccent[300]})`,
                backgroundClip: 'text',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                letterSpacing: '-0.02em',
                fontSize: { xs: '1.1rem', md: '1.35rem' },
                lineHeight: 1.2,
              }}
            >
              Operations Dashboard
            </Typography>
            <Typography
              variant="body2"
              sx={{
                mt: 0.25,
                color: colors.grey[300],
                maxWidth: 720,
                fontSize: '0.8rem',
                lineHeight: 1.4,
              }}
            >
              Detailed project management view: Monitor status breakdown, organizational structure, geographic distribution, and implementation timelines.
            </Typography>
          </Box>
          <Button
            variant="outlined"
            size="small"
            startIcon={<RefreshIcon sx={{ fontSize: 16 }} />}
            onClick={() => navigate('/summary-statistics')}
            sx={{
              borderColor: colors.blueAccent[500],
              color: colors.blueAccent[500],
              fontSize: '0.8rem',
              py: 0.5,
              px: 1.5,
              minWidth: 'auto',
              '&:hover': {
                borderColor: colors.blueAccent[400],
                bgcolor: colors.blueAccent[600] + '20',
              },
            }}
          >
            Summary Statistics
          </Button>
        </Box>

        {/* Filters - Collapsible at Top */}
        <Card
          sx={{
            borderRadius: 2,
            bgcolor: theme.palette.mode === 'dark' ? colors.primary[400] : '#ffffff',
            mb: 1,
            border: `1px solid ${theme.palette.mode === 'dark' ? colors.blueAccent[700] : 'rgba(0,0,0,0.08)'}`,
            boxShadow: `0 1px 4px ${colors.blueAccent[500]}10`,
          }}
        >
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              p: 0.75,
              minHeight: 32,
              cursor: 'pointer',
              '&:hover': {
                bgcolor: theme.palette.mode === 'dark' ? colors.primary[500] : 'rgba(0,0,0,0.02)',
              },
            }}
            onClick={() => setFiltersExpanded(!filtersExpanded)}
          >
            <Box display="flex" alignItems="center" gap={0.5}>
              <FilterIcon sx={{ color: colors.blueAccent[500], fontSize: 14 }} />
              <Typography variant="caption" sx={{ color: colors.grey[100], fontWeight: 600, fontSize: '0.7rem' }}>
                Filters
              </Typography>
              {Object.values(filters).some((f) => f) && (
                <Chip
                  label={`${Object.values(filters).filter((f) => f).length} active`}
                  size="small"
                  sx={{
                    height: 16,
                    fontSize: '0.6rem',
                    bgcolor: colors.blueAccent[600],
                    color: 'white',
                    '& .MuiChip-label': {
                      px: 0.5,
                    },
                  }}
                />
              )}
            </Box>
            <IconButton size="small" sx={{ p: 0.25, width: 20, height: 20 }}>
              {filtersExpanded ? (
                <ExpandLessIcon sx={{ color: colors.grey[300], fontSize: 16 }} />
              ) : (
                <ExpandMoreIcon sx={{ color: colors.grey[300], fontSize: 16 }} />
              )}
            </IconButton>
          </Box>
          <Collapse in={filtersExpanded}>
            <CardContent sx={{ p: 1.5, pt: 0, '&:last-child': { pb: 1.5 } }}>
              <Box display="flex" alignItems="center" gap={1} flexWrap="wrap">
                <FormControl size="small" sx={{ minWidth: 120 }}>
                  <InputLabel sx={{ fontSize: '0.75rem' }}>Department</InputLabel>
                  <Select
                    value={filters.department}
                    label="Department"
                    onChange={(e) => setFilters({ ...filters, department: e.target.value })}
                    sx={{ fontSize: '0.8rem', height: '32px' }}
                  >
                    <MenuItem value="" sx={{ fontSize: '0.8rem' }}>All Departments</MenuItem>
                    {uniqueDepartments.map((dept) => (
                      <MenuItem key={dept} value={dept} sx={{ fontSize: '0.8rem' }}>
                        {dept}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <FormControl size="small" sx={{ minWidth: 120 }}>
                  <InputLabel sx={{ fontSize: '0.75rem' }}>Directorate</InputLabel>
                  <Select
                    value={filters.directorate}
                    label="Directorate"
                    onChange={(e) => setFilters({ ...filters, directorate: e.target.value })}
                    sx={{ fontSize: '0.8rem', height: '32px' }}
                  >
                    <MenuItem value="" sx={{ fontSize: '0.8rem' }}>All Directorates</MenuItem>
                    {uniqueDirectorates.map((dir) => (
                      <MenuItem key={dir} value={dir} sx={{ fontSize: '0.8rem' }}>
                        {dir}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <FormControl size="small" sx={{ minWidth: 120 }}>
                  <InputLabel sx={{ fontSize: '0.75rem' }}>Financial Year</InputLabel>
                  <Select
                    value={filters.financialYear}
                    label="Financial Year"
                    onChange={(e) => setFilters({ ...filters, financialYear: e.target.value })}
                    sx={{ fontSize: '0.8rem', height: '32px' }}
                  >
                    <MenuItem value="" sx={{ fontSize: '0.8rem' }}>All Years</MenuItem>
                    {uniqueFinancialYears.map((fy) => (
                      <MenuItem key={fy} value={fy} sx={{ fontSize: '0.8rem' }}>
                        {fy}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <FormControl size="small" sx={{ minWidth: 120 }}>
                  <InputLabel sx={{ fontSize: '0.75rem' }}>Status</InputLabel>
                  <Select
                    value={filters.status}
                    label="Status"
                    onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                    sx={{ fontSize: '0.8rem', height: '32px' }}
                  >
                    <MenuItem value="" sx={{ fontSize: '0.8rem' }}>All Statuses</MenuItem>
                    {uniqueStatuses.map((status) => (
                      <MenuItem key={status} value={status} sx={{ fontSize: '0.8rem' }}>
                        {status}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Box>
            </CardContent>
          </Collapse>
        </Card>
      </Box>

      {/* Charts Grid */}
      <Grid container spacing={1.5}>
        {/* Projects by Sector */}
        <Grid item xs={12} md={6}>
          <Card
            sx={{
              borderRadius: 2,
              background: theme.palette.mode === 'dark'
                ? `linear-gradient(135deg, ${colors.primary[400]} 0%, ${colors.primary[500]} 100%)`
                : 'linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%)',
              border: `1px solid ${theme.palette.mode === 'dark' ? colors.blueAccent[700] : 'rgba(0,0,0,0.08)'}`,
              boxShadow: theme.palette.mode === 'dark'
                ? '0 4px 16px rgba(0,0,0,0.3)'
                : '0 2px 12px rgba(0,0,0,0.06)',
              transition: 'all 0.3s ease',
              '&:hover': {
                boxShadow: theme.palette.mode === 'dark'
                  ? '0 8px 24px rgba(0,0,0,0.4)'
                  : '0 4px 20px rgba(0,0,0,0.1)',
                transform: 'translateY(-2px)',
              },
            }}
          >
            <CardContent sx={{ p: 2 }}>
              <Box display="flex" alignItems="center" gap={1} mb={1.5}>
                <Box
                  sx={{
                    p: 0.75,
                    borderRadius: 1.5,
                    background: `linear-gradient(135deg, ${colors.blueAccent[600]}, ${colors.blueAccent[400]})`,
                  }}
                >
                  <AccountTreeIcon sx={{ color: 'white', fontSize: 18 }} />
                </Box>
                <Box>
                  <Typography
                    variant="subtitle1"
                    sx={{
                      color: colors.grey[100],
                      fontWeight: 700,
                      fontSize: '1rem',
                    }}
                  >
                    Projects by Sector
                  </Typography>
                  <Typography
                    variant="caption"
                    sx={{
                      color: colors.grey[400],
                      fontSize: '0.7rem',
                    }}
                  >
                    Sector distribution breakdown
                  </Typography>
                </Box>
              </Box>
              <Box sx={{ height: 280, mt: 0.5 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData.sectorChart} margin={{ top: 10, right: 10, left: -20, bottom: 70 }}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke={theme.palette.mode === 'dark' ? colors.grey[700] : colors.grey[300]}
                    />
                    <XAxis
                      dataKey="name"
                      angle={-45}
                      textAnchor="end"
                      interval={0}
                      height={90}
                      tick={{ fill: colors.grey[300], fontSize: 10 }}
                    />
                    <YAxis tick={{ fill: colors.grey[300], fontSize: 11 }} />
                    <RechartsTooltip
                      contentStyle={{
                        background: theme.palette.mode === 'dark' ? colors.primary[500] : '#ffffff',
                        border: `1px solid ${colors.blueAccent[700]}`,
                        borderRadius: 8,
                        padding: '8px 12px',
                      }}
                    />
                    <Bar dataKey="value" fill={colors.blueAccent[500]} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Progress Distribution */}
        <Grid item xs={12} md={6}>
          <Card
            sx={{
              borderRadius: 2,
              background: theme.palette.mode === 'dark'
                ? `linear-gradient(135deg, ${colors.primary[400]} 0%, ${colors.primary[500]} 100%)`
                : 'linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%)',
              border: `1px solid ${theme.palette.mode === 'dark' ? colors.greenAccent[700] : 'rgba(0,0,0,0.08)'}`,
              boxShadow: theme.palette.mode === 'dark'
                ? '0 4px 16px rgba(0,0,0,0.3)'
                : '0 2px 12px rgba(0,0,0,0.06)',
              transition: 'all 0.3s ease',
              '&:hover': {
                boxShadow: theme.palette.mode === 'dark'
                  ? '0 8px 24px rgba(0,0,0,0.4)'
                  : '0 4px 20px rgba(0,0,0,0.1)',
                transform: 'translateY(-2px)',
              },
            }}
          >
            <CardContent sx={{ p: 3 }}>
              <Box display="flex" alignItems="center" gap={1} mb={2}>
                <Box
                  sx={{
                    p: 1,
                    borderRadius: 1.5,
                    background: `linear-gradient(135deg, ${colors.greenAccent[600]}, ${colors.greenAccent[400]})`,
                  }}
                >
                  <AssessmentIcon sx={{ color: 'white', fontSize: 20 }} />
                </Box>
                <Box>
                  <Typography
                    variant="subtitle1"
                    sx={{
                      color: colors.grey[100],
                      fontWeight: 700,
                      fontSize: '1.1rem',
                    }}
                  >
                    Progress Distribution
                  </Typography>
                  <Typography
                    variant="caption"
                    sx={{
                      color: colors.grey[400],
                      fontSize: '0.75rem',
                    }}
                  >
                    Projects by completion percentage bands
                  </Typography>
                </Box>
              </Box>
              <Box sx={{ height: 320, mt: 1 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={chartData.progressChart}
                      cx="50%"
                      cy="50%"
                      outerRadius={100}
                      innerRadius={40}
                      paddingAngle={3}
                      dataKey="value"
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      labelLine={false}
                    >
                      {chartData.progressChart.map((entry, index) => (
                        <Cell
                          key={`progress-${index}`}
                          fill={entry.color}
                          stroke={theme.palette.mode === 'dark' ? colors.primary[500] : '#ffffff'}
                          strokeWidth={2}
                        />
                      ))}
                    </Pie>
                    <RechartsTooltip
                      contentStyle={{
                        background: theme.palette.mode === 'dark' ? colors.primary[500] : '#ffffff',
                        border: `1px solid ${colors.greenAccent[700]}`,
                        borderRadius: 8,
                        padding: '8px 12px',
                      }}
                    />
                    <Legend
                      wrapperStyle={{ paddingTop: '20px' }}
                      iconType="circle"
                    />
                  </PieChart>
                </ResponsiveContainer>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Timeline by Financial Year */}
        <Grid item xs={12}>
          <Card
            sx={{
              borderRadius: 2,
              background: theme.palette.mode === 'dark'
                ? `linear-gradient(135deg, ${colors.primary[400]} 0%, ${colors.primary[500]} 100%)`
                : 'linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%)',
              border: `1px solid ${theme.palette.mode === 'dark' ? colors.yellowAccent[700] : 'rgba(0,0,0,0.08)'}`,
              boxShadow: theme.palette.mode === 'dark'
                ? '0 4px 16px rgba(0,0,0,0.3)'
                : '0 2px 12px rgba(0,0,0,0.06)',
              transition: 'all 0.3s ease',
              '&:hover': {
                boxShadow: theme.palette.mode === 'dark'
                  ? '0 8px 24px rgba(0,0,0,0.4)'
                  : '0 4px 20px rgba(0,0,0,0.1)',
                transform: 'translateY(-2px)',
              },
            }}
          >
            <CardContent sx={{ p: 3 }}>
              <Box display="flex" alignItems="center" gap={1} mb={2}>
                <Box
                  sx={{
                    p: 1,
                    borderRadius: 1.5,
                    background: `linear-gradient(135deg, ${colors.yellowAccent[600]}, ${colors.yellowAccent[400]})`,
                  }}
                >
                  <CalendarIcon sx={{ color: 'white', fontSize: 20 }} />
                </Box>
                <Box>
                  <Typography
                    variant="subtitle1"
                    sx={{
                      color: colors.grey[100],
                      fontWeight: 700,
                      fontSize: '1.1rem',
                    }}
                  >
                    Projects Timeline
                  </Typography>
                  <Typography
                    variant="caption"
                    sx={{
                      color: colors.grey[400],
                      fontSize: '0.75rem',
                    }}
                  >
                    Distribution across financial years
                  </Typography>
                </Box>
              </Box>
              <Box sx={{ height: 280, mt: 0.5 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData.fyChart} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke={theme.palette.mode === 'dark' ? colors.grey[700] : colors.grey[300]}
                    />
                    <XAxis
                      dataKey="name"
                      tick={{ fill: colors.grey[300], fontSize: 11 }}
                    />
                    <YAxis tick={{ fill: colors.grey[300], fontSize: 11 }} />
                    <RechartsTooltip
                      contentStyle={{
                        background: theme.palette.mode === 'dark' ? colors.primary[500] : '#ffffff',
                        border: `1px solid ${colors.yellowAccent[700]}`,
                        borderRadius: 8,
                        padding: '8px 12px',
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="value"
                      stroke={colors.yellowAccent[500]}
                      strokeWidth={3}
                      dot={{ fill: colors.yellowAccent[500], r: 5 }}
                      activeDot={{ r: 7 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
};

export default OperationsDashboardPage;
