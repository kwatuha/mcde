import React, { useMemo, useState, useEffect } from 'react';
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
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  LinearProgress,
  Collapse,
  IconButton,
  ToggleButton,
  ToggleButtonGroup,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  CircularProgress,
} from '@mui/material';
import {
  Assessment as AssessmentIcon,
  AccountTree as AccountTreeIcon,
  FilterList as FilterIcon,
  TrendingUp as TrendingUpIcon,
  CheckCircle as CheckCircleIcon,
  Schedule as ScheduleIcon,
  Warning as WarningIcon,
  Cancel as CancelIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  PlayArrow as PlayArrowIcon,
  Pause as PauseIcon,
  HourglassEmpty as HourglassIcon,
  CheckCircleOutline as CheckCircleOutlineIcon,
  Close as CloseIcon,
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
} from 'recharts';
import { tokens } from './dashboard/theme';
import { useNavigate } from 'react-router-dom';
import sectorsService from '../api/sectorsService';
import { normalizeProjectStatus } from '../utils/projectStatusNormalizer';
import { ROUTES } from '../configs/appConfig';

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
  {
    projectName: 'Health Center Construction',
    Status: 'Delayed',
    budget: 45_000_000,
    Disbursed: 20_000_000,
    financialYear: '2023/2024',
    department: 'Health',
    directorate: 'Medical Services',
    County: 'Kitui',
    'sub-county': 'Kitui Central',
    Constituency: 'Kitui Central',
    ward: 'Kitui Town',
    percentageComplete: 44,
    StartDate: '2023-06-01',
    EndDate: '2024-12-31',
  },
  {
    projectName: 'School Infrastructure Upgrade',
    Status: 'Stalled',
    budget: 60_000_000,
    Disbursed: 10_000_000,
    financialYear: '2022/2023',
    department: 'Education',
    directorate: 'Early Childhood Development',
    County: 'Kitui',
    'sub-county': 'Kitui East',
    Constituency: 'Kitui East',
    ward: 'Zombe/Mwitika',
    percentageComplete: 17,
    StartDate: '2022-03-01',
    EndDate: '2023-12-31',
  },
  {
    projectName: 'Procurement of Medical Equipment',
    Status: 'Under Procurement',
    budget: 95_000_000,
    Disbursed: 0,
    financialYear: '2024/2025',
    department: 'Health',
    directorate: 'Medical Services',
    County: 'Kitui',
    'sub-county': 'Kitui Central',
    Constituency: 'Kitui Central',
    ward: 'Kitui Town',
    percentageComplete: 0,
    StartDate: '2024-08-01',
    EndDate: '2025-03-31',
  },
  {
    projectName: 'Suspended Road Project',
    Status: 'Suspended',
    budget: 150_000_000,
    Disbursed: 30_000_000,
    financialYear: '2023/2024',
    department: 'Infrastructure',
    directorate: 'Roads & Infrastructure',
    County: 'Kitui',
    'sub-county': 'Kitui West',
    Constituency: 'Kitui West',
    ward: 'Kwa Mutonga',
    percentageComplete: 20,
    StartDate: '2023-01-15',
    EndDate: '2024-12-31',
  },
  {
    projectName: 'Additional Completed Project',
    Status: 'Completed',
    budget: 42_000_000,
    Disbursed: 42_000_000,
    financialYear: '2023/2024',
    department: 'Water',
    directorate: 'Water & Sanitation',
    County: 'Kitui',
    'sub-county': 'Kitui Rural',
    Constituency: 'Kitui Rural',
    ward: 'Kanyangi',
    percentageComplete: 100,
    StartDate: '2023-04-01',
    EndDate: '2024-02-28',
  },
  {
    projectName: 'Another Ongoing Project',
    Status: 'Ongoing',
    budget: 68_000_000,
    Disbursed: 35_000_000,
    financialYear: '2024/2025',
    department: 'Agriculture',
    directorate: 'Crop Development',
    County: 'Kitui',
    'sub-county': 'Kitui South',
    Constituency: 'Kitui South',
    ward: 'Kisasi',
    percentageComplete: 51,
    StartDate: '2024-05-15',
    EndDate: '2025-11-30',
  },
  {
    projectName: 'Procurement Phase 2',
    Status: 'Under Procurement',
    budget: 75_000_000,
    Disbursed: 0,
    financialYear: '2024/2025',
    department: 'Infrastructure',
    directorate: 'Roads & Infrastructure',
    County: 'Kitui',
    'sub-county': 'Kitui Central',
    Constituency: 'Kitui Central',
    ward: 'Kitui Town',
    percentageComplete: 0,
    StartDate: '2024-09-01',
    EndDate: '2025-06-30',
  },
  {
    projectName: 'Another Stalled Project',
    Status: 'Stalled',
    budget: 38_000_000,
    Disbursed: 8_000_000,
    financialYear: '2022/2023',
    department: 'Trade',
    directorate: 'Trade & Commerce',
    County: 'Kitui',
    'sub-county': 'Kitui West',
    Constituency: 'Kitui West',
    ward: 'Kwa Mutonga',
    percentageComplete: 21,
    StartDate: '2022-07-01',
    EndDate: '2023-12-31',
  },
];

const STATUS_COLORS = {
  'Completed': '#16a34a',
  'In Progress': '#2563eb',
  'Ongoing': '#2563eb',
  'Not Started': '#9ca3af',
  'Delayed': '#f97316',
  'Stalled': '#dc2626',
  'Under Procurement': '#9c27b0',
  'Suspended': '#f44336',
};


const STATUS_ICONS = {
  'Completed': CheckCircleIcon,
  'In Progress': ScheduleIcon,
  'Ongoing': ScheduleIcon,
  'Not Started': CancelIcon,
  'Delayed': WarningIcon,
  'Stalled': WarningIcon,
  'Under Procurement': HourglassIcon,
  'Suspended': PauseIcon,
};

const formatCurrency = (value) =>
  new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency: 'KES',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value || 0);

const ProjectByStatusDashboardPage = () => {
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
  const [sectors, setSectors] = useState([]);
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState(null);
  const [statusProjects, setStatusProjects] = useState([]);
  const [loadingStatusProjects, setLoadingStatusProjects] = useState(false);

  useEffect(() => {
    const fetchSectors = async () => {
      try {
        const data = await sectorsService.getAllSectors();
        setSectors(data || []);
      } catch (error) {
        console.error('Error fetching sectors:', error);
      }
    };
    fetchSectors();
  }, []);

  const filteredProjects = useMemo(() => {
    return SAMPLE_PROJECTS.filter((p) => {
      if (filters.department && p.department !== filters.department) return false;
      if (filters.directorate && p.directorate !== filters.directorate) return false;
      if (filters.financialYear && p.financialYear !== filters.financialYear) return false;
      if (filters.status && p.Status !== filters.status) return false;
      return true;
    });
  }, [filters]);

  const statusData = useMemo(() => {
    // Status distribution
    const statusMap = new Map();
    filteredProjects.forEach((p) => {
      const normalizedStatus = normalizeProjectStatus(p.Status || p.status || 'Unknown');
      const current = statusMap.get(normalizedStatus) || { name: normalizedStatus, count: 0, budget: 0, disbursed: 0, projects: [] };
      current.count += 1;
      current.budget += p.budget || 0;
      current.disbursed += p.Disbursed || 0;
      current.projects.push(p);
      statusMap.set(normalizedStatus, current);
    });

    const statusChart = Array.from(statusMap.values())
      .map((status) => ({
        ...status,
        color: STATUS_COLORS[status.name] || '#64748b',
        percentage: filteredProjects.length > 0 ? ((status.count / filteredProjects.length) * 100).toFixed(1) : 0,
        absorptionRate: status.budget > 0 ? ((status.disbursed / status.budget) * 100).toFixed(1) : 0,
      }))
      .sort((a, b) => b.count - a.count);

    // Create a map of sector names to aliases
    const sectorAliasMap = new Map();
    sectors.forEach((sector) => {
      const sectorName = sector.sectorName || sector.name;
      const alias = sector.alias || sectorName;
      if (sectorName) {
        sectorAliasMap.set(sectorName, alias);
      }
    });

    // Status by Sector
    const statusBySector = new Map();
    filteredProjects.forEach((p) => {
      // Try to get sector from various possible fields
      const sectorName = p.sector || p.categoryName || p.department || 'Unknown';
      const status = normalizeProjectStatus(p.Status || p.status || 'Unknown');
      const key = `${sectorName}|${status}`;
      const current = statusBySector.get(key) || { sector: sectorName, status, count: 0 };
      current.count += 1;
      statusBySector.set(key, current);
    });

    const sectorStatusChart = Array.from(statusBySector.values())
      .reduce((acc, item) => {
        // Use alias if available, otherwise use sector name
        const displayName = sectorAliasMap.get(item.sector) || item.sector;
        const existing = acc.find((d) => d.sector === item.sector);
        if (existing) {
          existing[item.status] = item.count;
        } else {
          acc.push({ sector: item.sector, sectorDisplay: displayName, [item.status]: item.count });
        }
        return acc;
      }, []);

    return {
      statusChart,
      sectorStatusChart,
    };
  }, [filteredProjects, sectors]);

  const uniqueDepartments = Array.from(new Set(SAMPLE_PROJECTS.map((p) => p.department))).filter(Boolean);
  const uniqueDirectorates = Array.from(new Set(SAMPLE_PROJECTS.map((p) => p.directorate))).filter(Boolean);
  const uniqueFinancialYears = Array.from(new Set(SAMPLE_PROJECTS.map((p) => p.financialYear))).filter(Boolean);
  // Use normalized statuses to avoid duplicates like "In Progress" and "Ongoing"
  const uniqueStatuses = Array.from(new Set(SAMPLE_PROJECTS.map((p) => normalizeProjectStatus(p.Status || p.status || 'Unknown')))).filter(Boolean);

  const totalProjects = filteredProjects.length;
  const totalBudget = filteredProjects.reduce((sum, p) => sum + (p.budget || 0), 0);
  const totalDisbursed = filteredProjects.reduce((sum, p) => sum + (p.Disbursed || 0), 0);
  const overallAbsorption = totalBudget > 0 ? ((totalDisbursed / totalBudget) * 100).toFixed(1) : 0;

  const isLight = theme.palette.mode === 'light';
  const ui = {
    elevatedShadow: isLight ? '0 1px 6px rgba(0,0,0,0.06)' : '0 4px 20px rgba(0, 0, 0, 0.15), 0 -2px 10px rgba(0, 0, 0, 0.1)'
  };

  // Helper functions for status styling
  const getStatusGradientColors = (status) => {
    const statusLower = (status || '').toLowerCase();
    if (statusLower.includes('completed')) {
      return isLight
        ? 'linear-gradient(135deg, #4caf50 0%, #81c784 100%)'
        : `linear-gradient(135deg, ${colors.greenAccent[800]}, ${colors.greenAccent[700]})`;
    } else if (statusLower.includes('ongoing') || statusLower.includes('in progress')) {
      return isLight
        ? 'linear-gradient(135deg, #2196f3 0%, #42a5f5 100%)'
        : `linear-gradient(135deg, ${colors.blueAccent[800]}, ${colors.blueAccent[700]})`;
    } else if (statusLower.includes('not started')) {
      return isLight
        ? 'linear-gradient(135deg, #9e9e9e 0%, #bdbdbd 100%)'
        : `linear-gradient(135deg, ${colors.grey[800]}, ${colors.grey[700]})`;
    } else if (statusLower.includes('stalled') || statusLower.includes('delayed')) {
      return isLight
        ? 'linear-gradient(135deg, #ff9800 0%, #ffb74d 100%)'
        : `linear-gradient(135deg, ${colors.yellowAccent[800]}, ${colors.yellowAccent[700]})`;
    }
    return isLight
      ? 'linear-gradient(135deg, #9e9e9e 0%, #bdbdbd 100%)'
      : `linear-gradient(135deg, ${colors.grey[800]}, ${colors.grey[700]})`;
  };

  const getStatusBorderColor = (status) => {
    const statusLower = (status || '').toLowerCase();
    if (statusLower.includes('completed')) {
      return isLight ? '#388e3c' : colors.greenAccent[500];
    } else if (statusLower.includes('ongoing') || statusLower.includes('in progress')) {
      return isLight ? '#1976d2' : colors.blueAccent[500];
    } else if (statusLower.includes('not started')) {
      return isLight ? '#616161' : colors.grey[500];
    } else if (statusLower.includes('stalled') || statusLower.includes('delayed')) {
      return isLight ? '#f57c00' : colors.yellowAccent[500];
    }
    return isLight ? '#616161' : colors.grey[500];
  };

  const getStatusIcon = (status) => {
    const statusLower = (status || '').toLowerCase();
    if (statusLower.includes('completed')) {
      return CheckCircleIcon;
    } else if (statusLower.includes('ongoing') || statusLower.includes('in progress')) {
      return PlayArrowIcon;
    } else if (statusLower.includes('not started')) {
      return ScheduleIcon;
    } else if (statusLower.includes('stalled')) {
      return PauseIcon;
    } else if (statusLower.includes('delayed')) {
      return WarningIcon;
    } else if (statusLower.includes('procurement')) {
      return HourglassIcon;
    } else if (statusLower.includes('suspended')) {
      return PauseIcon;
    }
    return AssessmentIcon;
  };

  // Calculate status stats from filtered projects
  const statusStats = useMemo(() => {
    const stats = {
      'Completed': 0,
      'Ongoing': 0,
      'Not started': 0,
      'Stalled': 0,
      'Under Procurement': 0,
      'Suspended': 0,
      'Other': 0,
      totalProjects: filteredProjects.length
    };

    filteredProjects.forEach(p => {
      const normalized = normalizeProjectStatus(p.Status || p.status || 'Unknown');
      if (stats.hasOwnProperty(normalized)) {
        stats[normalized]++;
      } else {
        stats['Other']++;
      }
    });

    return stats;
  }, [filteredProjects]);

  // Handler to open modal with projects for a specific status
  const handleStatusClick = (status) => {
    setSelectedStatus(status);
    setStatusModalOpen(true);
    setLoadingStatusProjects(true);
    
    // Filter projects by normalized status
    const filtered = filteredProjects.filter(p => {
      const normalized = normalizeProjectStatus(p.Status || p.status || 'Unknown');
      return normalized === status;
    });
    
    setStatusProjects(filtered);
    setLoadingStatusProjects(false);
  };

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
      <Box mb={3}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, mb: 1.5 }}>
          <Box
            sx={{
              width: 3,
              height: 28,
              background: `linear-gradient(180deg, ${colors.blueAccent[500]}, ${colors.greenAccent[500]})`,
              borderRadius: 1.5,
              mt: 0.25,
            }}
          />
          <Box sx={{ flex: 1 }}>
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
              Project By Status Dashboard
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
              Track project status distribution, trends, and breakdowns across departments, directorates, and geographic regions.
            </Typography>
          </Box>
          <Button
            variant="outlined"
            size="small"
            startIcon={<AssessmentIcon sx={{ fontSize: 16 }} />}
            onClick={() => navigate('/operations-dashboard')}
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
            Operations
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
                <FormControl size="small" sx={{ minWidth: 110 }}>
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
                <FormControl size="small" sx={{ minWidth: 100 }}>
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
                <Chip
                  label={`${filteredProjects.length} projects`}
                  size="small"
                  sx={{
                    bgcolor: colors.blueAccent[600],
                    color: 'white',
                    fontSize: '0.7rem',
                    height: '24px',
                  }}
                />
              </Box>
            </CardContent>
          </Collapse>
        </Card>

        {/* Status Overview Cards - Matching HomePage */}
        <Box
          sx={{
            mb: 1,
            mt: 1,
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
                    {statusStats['Completed'] || 0}
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
                    {statusStats['Ongoing'] || 0}
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
                    {statusStats['Not started'] || 0}
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
                    : `linear-gradient(135deg, ${colors.yellowAccent[800]}, ${colors.yellowAccent[700]})`,
                  color: isLight ? 'white' : 'inherit',
                  borderTop: `2px solid ${isLight ? '#f57c00' : colors.yellowAccent[500]}`,
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
                    <PauseIcon sx={{ color: isLight ? 'rgba(255, 255, 255, 0.9)' : colors.yellowAccent[400], fontSize: 14 }} />
                  </Box>
                  <Typography variant="h5" sx={{ color: isLight ? '#ffffff' : '#fff', fontWeight: 'bold', fontSize: '1rem', mb: 0, lineHeight: 1.1 }}>
                    {statusStats['Stalled'] || 0}
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
            {statusStats['Under Procurement'] > 0 && (
              <Grid item sx={{ minWidth: { xs: '110px', sm: '130px', md: '145px' }, flex: '0 0 auto' }}>
                <Card 
                  onClick={() => handleStatusClick('Under Procurement')}
                  sx={{ 
                    height: '100%',
                    background: isLight 
                      ? 'linear-gradient(135deg, #9c27b0 0%, #ba68c8 100%)'
                      : `linear-gradient(135deg, ${colors.blueAccent[800]}, ${colors.blueAccent[700]})`,
                    color: isLight ? 'white' : 'inherit',
                    borderTop: `2px solid ${isLight ? '#7b1fa2' : colors.blueAccent[500]}`,
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
                      <HourglassIcon sx={{ color: isLight ? 'rgba(255, 255, 255, 0.9)' : colors.blueAccent[400], fontSize: 14 }} />
                    </Box>
                    <Typography variant="h5" sx={{ color: isLight ? '#ffffff' : '#fff', fontWeight: 'bold', fontSize: '1rem', mb: 0, lineHeight: 1.1 }}>
                      {statusStats['Under Procurement'] || 0}
                    </Typography>
                    <Typography variant="caption" sx={{ color: isLight ? 'rgba(255, 255, 255, 0.8)' : colors.grey[300], fontWeight: 400, fontSize: '0.6rem', mt: 0.125 }}>
                      {statusStats.totalProjects > 0 
                        ? Math.round((statusStats['Under Procurement'] || 0) / statusStats.totalProjects * 100) 
                        : 0}%
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            )}

            {/* Suspended */}
            {statusStats['Suspended'] > 0 && (
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
                      <PauseIcon sx={{ color: isLight ? 'rgba(255, 255, 255, 0.9)' : colors.redAccent[400], fontSize: 14 }} />
                    </Box>
                    <Typography variant="h5" sx={{ color: isLight ? '#ffffff' : '#fff', fontWeight: 'bold', fontSize: '1rem', mb: 0, lineHeight: 1.1 }}>
                      {statusStats['Suspended'] || 0}
                    </Typography>
                    <Typography variant="caption" sx={{ color: isLight ? 'rgba(255, 255, 255, 0.8)' : colors.grey[300], fontWeight: 400, fontSize: '0.6rem', mt: 0.125 }}>
                      {statusStats.totalProjects > 0 
                        ? Math.round((statusStats['Suspended'] || 0) / statusStats.totalProjects * 100) 
                        : 0}%
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            )}
          </Grid>
        </Box>
      </Box>

      {/* Charts Row — explicit flex with calc widths to avoid MUI Grid constraints */}
      <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: 1, mb: 1, width: '100%', alignItems: 'stretch' }}>
        {/* Status Distribution Pie Chart — ~16% */}
        <Box sx={{ width: { xs: '100%', md: 'calc(25% - 8px)' }, flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
          <Card
            sx={{
              borderRadius: 4,
              background: theme.palette.mode === 'dark'
                ? `linear-gradient(135deg, ${colors.primary[400]} 0%, ${colors.primary[500]} 100%)`
                : 'linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%)',
              border: `1px solid ${theme.palette.mode === 'dark' ? colors.blueAccent[700] : 'rgba(0,0,0,0.08)'}`,
              boxShadow: theme.palette.mode === 'dark'
                ? '0 8px 32px rgba(0,0,0,0.4)'
                : '0 4px 20px rgba(0,0,0,0.08)',
              transition: 'all 0.3s ease',
              '&:hover': {
                boxShadow: theme.palette.mode === 'dark'
                  ? '0 12px 48px rgba(0,0,0,0.5)'
                  : '0 8px 32px rgba(0,0,0,0.12)',
                transform: 'translateY(-2px)',
              },
            }}
          >
            <CardContent sx={{ p: 1.5, pb: 0.5, '&:last-child': { pb: 0.5 } }}>
              <Box display="flex" alignItems="center" gap={1} mb={0.75}>
                <Box
                  sx={{
                    p: 0.75,
                    borderRadius: 1.5,
                    background: `linear-gradient(135deg, ${colors.blueAccent[600]}, ${colors.blueAccent[400]})`,
                  }}
                >
                  <AssessmentIcon sx={{ color: 'white', fontSize: 18 }} />
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
                    Status Distribution
                  </Typography>
                  <Typography
                    variant="caption"
                    sx={{
                      color: colors.grey[400],
                      fontSize: '0.7rem',
                    }}
                  >
                    Project count by status
                  </Typography>
                </Box>
              </Box>
              <Box sx={{ height: 320, mt: 0, position: 'relative' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart margin={{ top: 5, right: 5, bottom: 50, left: 5 }}>
                    <Pie
                      data={statusData.statusChart}
                      cx="50%"
                      cy="45%"
                      outerRadius={90}
                      innerRadius={35}
                      paddingAngle={2}
                      dataKey="count"
                      label={({ percent }) => percent > 0.05 ? `${(percent * 100).toFixed(0)}%` : ''}
                      labelLine={false}
                    >
                      {statusData.statusChart.map((entry, index) => (
                        <Cell
                          key={`status-${index}`}
                          fill={entry.color}
                          stroke={theme.palette.mode === 'dark' ? colors.primary[500] : '#ffffff'}
                          strokeWidth={2}
                        />
                      ))}
                    </Pie>
                    <RechartsTooltip
                      contentStyle={{
                        background: theme.palette.mode === 'dark' ? colors.primary[500] : '#ffffff',
                        border: `1px solid ${colors.blueAccent[700]}`,
                        borderRadius: 8,
                        padding: '8px 12px',
                      }}
                      formatter={(value, name, props) => [
                        `${value} projects (${statusStats.totalProjects > 0 ? ((value / statusStats.totalProjects) * 100).toFixed(1) : 0}%)`,
                        props.payload.name
                      ]}
                    />
                    <Legend
                      verticalAlign="bottom"
                      height={50}
                      iconType="circle"
                      wrapperStyle={{
                        paddingTop: '10px',
                        fontSize: '0.7rem',
                      }}
                      formatter={(value) => <span style={{ fontSize: '0.7rem' }}>{value}</span>}
                      iconSize={10}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </Box>
            </CardContent>
          </Card>
        </Box>

        {/* Status Comparison Bar Chart — ~66% */}
        <Box sx={{ flex: 1, minWidth: 0, maxWidth: { md: '45%' }, display: 'flex', flexDirection: 'column' }}>
          <Card
            sx={{
              borderRadius: 4,
              background: theme.palette.mode === 'dark'
                ? `linear-gradient(135deg, ${colors.primary[400]} 0%, ${colors.primary[500]} 100%)`
                : 'linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%)',
              border: `1px solid ${theme.palette.mode === 'dark' ? colors.greenAccent[700] : 'rgba(0,0,0,0.08)'}`,
              boxShadow: theme.palette.mode === 'dark'
                ? '0 8px 32px rgba(0,0,0,0.4)'
                : '0 4px 20px rgba(0,0,0,0.08)',
              transition: 'all 0.3s ease',
              width: '100%',
              height: '100%',
              '&:hover': {
                boxShadow: theme.palette.mode === 'dark'
                  ? '0 12px 48px rgba(0,0,0,0.5)'
                  : '0 8px 32px rgba(0,0,0,0.12)',
                transform: 'translateY(-2px)',
              },
            }}
          >
            <CardContent sx={{ p: 1.5, pb: 0, '&:last-child': { pb: 0 } }}>
              <Box display="flex" alignItems="center" gap={1} mb={0.5}>
                <Box
                  sx={{
                    p: 0.75,
                    borderRadius: 1.5,
                    background: `linear-gradient(135deg, ${colors.greenAccent[600]}, ${colors.greenAccent[400]})`,
                  }}
                >
                  <TrendingUpIcon sx={{ color: 'white', fontSize: 18 }} />
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
                    Status Comparison
                  </Typography>
                  <Typography
                    variant="caption"
                    sx={{
                      color: colors.grey[400],
                      fontSize: '0.7rem',
                    }}
                  >
                    Budget by status
                  </Typography>
                </Box>
              </Box>
              <Box sx={{ height: 320, mt: 0, mb: 0, width: "100%", overflow: "visible", px: 0 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={statusData.statusChart} margin={{ top: 5, right: 30, left: 20, bottom: 100 }}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke={theme.palette.mode === 'dark' ? colors.grey[700] : colors.grey[300]}
                    />
                    <XAxis
                      dataKey="name"
                      angle={-45}
                      textAnchor="end"
                      height={100}
                      interval={0}
                      tick={{ fill: colors.grey[300], fontSize: 8 }}
                      width={100}
                    />
                    <YAxis tick={{ fill: colors.grey[300], fontSize: 11 }} />
                    <RechartsTooltip
                      contentStyle={{
                        background: theme.palette.mode === 'dark' ? colors.primary[500] : '#ffffff',
                        border: `1px solid ${colors.greenAccent[700]}`,
                        borderRadius: 8,
                        padding: '8px 12px',
                      }}
                      formatter={(value) => formatCurrency(value)}
                    />
                    <Legend 
                      wrapperStyle={{ fontSize: '0.7rem', paddingTop: '5px' }}
                      iconSize={10}
                    />
                    <Bar dataKey="budget" name="Budget (KES)" radius={[4, 4, 0, 0]}>
                      {statusData.statusChart.map((entry, index) => (
                        <Cell key={`budget-bar-${index}`} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </Box>
            </CardContent>
          </Card>
        </Box>

        {/* Status by Sector — ~16% */}
        <Box sx={{ width: { xs: '100%', md: 'calc(30% - 8px)' }, flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
          <Card
            sx={{
              borderRadius: 4,
              background: theme.palette.mode === 'dark'
                ? `linear-gradient(135deg, ${colors.primary[400]} 0%, ${colors.primary[500]} 100%)`
                : 'linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%)',
              border: `1px solid ${theme.palette.mode === 'dark' ? colors.blueAccent[700] : 'rgba(0,0,0,0.08)'}`,
              boxShadow: theme.palette.mode === 'dark'
                ? '0 8px 32px rgba(0,0,0,0.4)'
                : '0 4px 20px rgba(0,0,0,0.08)',
            }}
          >
            <CardContent sx={{ p: 1.5, pb: 0.5, '&:last-child': { pb: 0.5 } }}>
              <Box display="flex" alignItems="center" gap={1} mb={0.75}>
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
                    Status by Sector
                  </Typography>
                  <Typography
                    variant="caption"
                    sx={{
                      color: colors.grey[400],
                      fontSize: '0.7rem',
                    }}
                  >
                    Project status breakdown across sectors
                  </Typography>
                </Box>
              </Box>
              <Box sx={{ height: 320, mt: 0 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={statusData.sectorStatusChart} margin={{ top: 5, right: 20, left: 0, bottom: 70 }}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke={theme.palette.mode === 'dark' ? colors.grey[700] : colors.grey[300]}
                    />
                    <XAxis
                      dataKey="sectorDisplay"
                      angle={-45}
                      textAnchor="end"
                      height={100}
                      tick={{ fill: colors.grey[300], fontSize: 11 }}
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
                    <Legend 
                      wrapperStyle={{ fontSize: '0.7rem' }}
                      iconSize={10}
                    />
                    {uniqueStatuses.map((status, index) => (
                      <Bar
                        key={status}
                        dataKey={status}
                        stackId="a"
                        fill={STATUS_COLORS[status] || '#64748b'}
                        name={status}
                        radius={index === uniqueStatuses.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                      />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </Box>
            </CardContent>
          </Card>
        </Box>
      </Box>

      {/* Detailed Status Table — full width */}
      <Box sx={{ width: '100%' }}>
          <Card
            sx={{
              borderRadius: 4,
              background: theme.palette.mode === 'dark'
                ? `linear-gradient(135deg, ${colors.primary[400]} 0%, ${colors.primary[500]} 100%)`
                : 'linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%)',
              border: `1px solid ${theme.palette.mode === 'dark' ? colors.blueAccent[700] : 'rgba(0,0,0,0.08)'}`,
              boxShadow: theme.palette.mode === 'dark'
                ? '0 8px 32px rgba(0,0,0,0.4)'
                : '0 4px 20px rgba(0,0,0,0.08)',
            }}
          >
            <CardContent sx={{ p: 1.5, pb: 0.5, '&:last-child': { pb: 0.5 } }}>
              <Box display="flex" alignItems="center" gap={1} mb={0.75}>
                <Box
                  sx={{
                    p: 0.75,
                    borderRadius: 1.5,
                    background: `linear-gradient(135deg, ${colors.blueAccent[600]}, ${colors.blueAccent[400]})`,
                  }}
                >
                  <AssessmentIcon sx={{ color: 'white', fontSize: 18 }} />
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
                    Status Summary Table
                  </Typography>
                  <Typography
                    variant="caption"
                    sx={{
                      color: colors.grey[400],
                      fontSize: '0.7rem',
                    }}
                  >
                    Detailed breakdown by status
                  </Typography>
                </Box>
              </Box>
              <TableContainer component={Paper} sx={{ bgcolor: 'transparent', boxShadow: 'none' }}>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ color: colors.grey[300], fontWeight: 700 }}>Status</TableCell>
                      <TableCell align="right" sx={{ color: colors.grey[300], fontWeight: 700 }}>Projects</TableCell>
                      <TableCell align="right" sx={{ color: colors.grey[300], fontWeight: 700 }}>Percentage</TableCell>
                      <TableCell align="right" sx={{ color: colors.grey[300], fontWeight: 700 }}>Budget</TableCell>
                      <TableCell align="right" sx={{ color: colors.grey[300], fontWeight: 700 }}>Disbursed</TableCell>
                      <TableCell align="right" sx={{ color: colors.grey[300], fontWeight: 700 }}>Absorption</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {statusData.statusChart.map((status) => (
                      <TableRow key={status.name} hover>
                        <TableCell>
                          <Chip
                            label={status.name}
                            size="small"
                            sx={{
                              bgcolor: status.color,
                              color: 'white',
                              fontWeight: 600,
                            }}
                          />
                        </TableCell>
                        <TableCell align="right" sx={{ color: colors.grey[100], fontWeight: 600 }}>
                          {status.count}
                        </TableCell>
                        <TableCell align="right" sx={{ color: colors.grey[300] }}>
                          {status.percentage}%
                        </TableCell>
                        <TableCell align="right" sx={{ color: colors.grey[300] }}>
                          {formatCurrency(status.budget)}
                        </TableCell>
                        <TableCell align="right" sx={{ color: colors.grey[300] }}>
                          {formatCurrency(status.disbursed)}
                        </TableCell>
                        <TableCell align="right" sx={{ color: colors.grey[300] }}>
                          {status.absorptionRate}%
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </CardContent>
          </Card>
      </Box>

      {/* Status Projects Modal - Enhanced Styling */}
      <Dialog
        open={statusModalOpen}
        onClose={() => setStatusModalOpen(false)}
        maxWidth="lg"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 3,
            maxHeight: '90vh',
            background: isLight 
              ? 'linear-gradient(to bottom, #ffffff, #f8f9fa)'
              : `linear-gradient(to bottom, ${colors.primary[500]}, ${colors.primary[600]})`,
            boxShadow: isLight 
              ? '0 8px 32px rgba(0,0,0,0.12)'
              : '0 8px 32px rgba(0,0,0,0.5)',
          }
        }}
      >
        <DialogTitle
          sx={{
            background: isLight 
              ? `linear-gradient(135deg, ${colors.blueAccent[50]}, ${colors.greenAccent[50]})`
              : `linear-gradient(135deg, ${colors.blueAccent[800]}, ${colors.greenAccent[800]})`,
            borderBottom: `2px solid ${isLight ? colors.blueAccent[200] : colors.blueAccent[600]}`,
            pb: 2,
          }}
        >
          <Box display="flex" justifyContent="space-between" alignItems="center">
            <Box display="flex" alignItems="center" gap={1.5}>
              <Box
                sx={{
                  p: 1,
                  borderRadius: 2,
                  background: isLight 
                    ? `linear-gradient(135deg, ${colors.blueAccent[500]}, ${colors.greenAccent[500]})`
                    : `linear-gradient(135deg, ${colors.blueAccent[600]}, ${colors.greenAccent[600]})`,
                  color: 'white',
                  display: 'flex',
                  alignItems: 'center',
                  boxShadow: `0 2px 8px ${colors.blueAccent[500]}40`,
                }}
              >
                <AssessmentIcon sx={{ fontSize: 20 }} />
              </Box>
              <Box>
                <Typography variant="h6" sx={{ fontWeight: 'bold', color: isLight ? colors.grey[900] : '#fff' }}>
                  Projects - {selectedStatus}
                </Typography>
                <Typography variant="caption" sx={{ color: isLight ? colors.grey[600] : colors.grey[300], fontSize: '0.75rem' }}>
                  {statusProjects.length} project{statusProjects.length !== 1 ? 's' : ''} found
                </Typography>
              </Box>
            </Box>
            <IconButton
              onClick={() => setStatusModalOpen(false)}
              size="small"
              sx={{ 
                color: isLight ? colors.grey[600] : colors.grey[300],
                '&:hover': {
                  bgcolor: isLight ? colors.grey[100] : colors.grey[700],
                }
              }}
            >
              <CloseIcon />
            </IconButton>
          </Box>
        </DialogTitle>
        <DialogContent dividers sx={{ p: 0 }}>
          {loadingStatusProjects ? (
            <Box display="flex" justifyContent="center" alignItems="center" p={6}>
              <CircularProgress size={40} />
            </Box>
          ) : statusProjects.length === 0 ? (
            <Box textAlign="center" p={6}>
              <AssessmentIcon sx={{ fontSize: 64, color: colors.grey[400], mb: 2 }} />
              <Typography variant="h6" color="text.secondary" sx={{ mb: 1 }}>
                No projects found
              </Typography>
              <Typography variant="body2" color="text.secondary">
                No projects found with status "{selectedStatus}"
              </Typography>
            </Box>
          ) : (
            <TableContainer sx={{ maxHeight: '60vh' }}>
              <Table stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ 
                      fontWeight: 700, 
                      bgcolor: isLight ? colors.grey[50] : colors.primary[600],
                      color: isLight ? colors.grey[900] : colors.grey[100],
                    }}>
                      Project Name
                    </TableCell>
                    <TableCell sx={{ 
                      fontWeight: 700, 
                      bgcolor: isLight ? colors.grey[50] : colors.primary[600],
                      color: isLight ? colors.grey[900] : colors.grey[100],
                    }}>
                      Status
                    </TableCell>
                    <TableCell sx={{ 
                      fontWeight: 700, 
                      bgcolor: isLight ? colors.grey[50] : colors.primary[600],
                      color: isLight ? colors.grey[900] : colors.grey[100],
                    }}>
                      Department
                    </TableCell>
                    <TableCell sx={{ 
                      fontWeight: 700, 
                      bgcolor: isLight ? colors.grey[50] : colors.primary[600],
                      color: isLight ? colors.grey[900] : colors.grey[100],
                    }}>
                      Directorate
                    </TableCell>
                    <TableCell sx={{ 
                      fontWeight: 700, 
                      bgcolor: isLight ? colors.grey[50] : colors.primary[600],
                      color: isLight ? colors.grey[900] : colors.grey[100],
                    }}>
                      Budget
                    </TableCell>
                    <TableCell sx={{ 
                      fontWeight: 700, 
                      bgcolor: isLight ? colors.grey[50] : colors.primary[600],
                      color: isLight ? colors.grey[900] : colors.grey[100],
                    }}>
                      Actions
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {statusProjects.map((project) => (
                    <TableRow 
                      key={project.id || project.projectName} 
                      hover
                      sx={{
                        '&:nth-of-type(even)': {
                          bgcolor: isLight ? colors.grey[25] : colors.primary[500],
                        },
                        '&:hover': {
                          bgcolor: isLight ? colors.blueAccent[50] : colors.blueAccent[800],
                        }
                      }}
                    >
                      <TableCell>
                        <Typography variant="body2" sx={{ fontWeight: 500 }}>
                          {project.projectName || project.project_name || 'Untitled Project'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={project.Status || project.status || 'Unknown'}
                          size="small"
                          sx={{
                            bgcolor: isLight 
                              ? (project.Status?.toLowerCase().includes('completed') ? '#4caf50' :
                                 project.Status?.toLowerCase().includes('ongoing') ? '#2196f3' :
                                 project.Status?.toLowerCase().includes('stalled') ? '#ff9800' :
                                 '#9e9e9e')
                              : colors.blueAccent[700],
                            color: 'white',
                            fontSize: '0.7rem',
                            fontWeight: 600,
                          }}
                        />
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">
                          {project.department || project.departmentName || project.department_name || 'N/A'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">
                          {project.directorate || project.directorateName || project.directorate_name || 'N/A'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontWeight: 500 }}>
                          {project.budget || project.costOfProject || project.cost_of_project 
                            ? formatCurrency(project.budget || project.costOfProject || project.cost_of_project)
                            : 'N/A'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Button
                          size="small"
                          variant="outlined"
                          onClick={() => {
                            setStatusModalOpen(false);
                            navigate(`${ROUTES.PROJECTS}/${project.id || project.projectName}`);
                          }}
                          sx={{ 
                            textTransform: 'none', 
                            fontSize: '0.75rem',
                            borderColor: colors.blueAccent[500],
                            color: colors.blueAccent[600],
                            '&:hover': {
                              bgcolor: colors.blueAccent[50],
                              borderColor: colors.blueAccent[600],
                            }
                          }}
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
        <DialogActions sx={{ 
          p: 2, 
          bgcolor: isLight ? colors.grey[50] : colors.primary[600],
          borderTop: `1px solid ${isLight ? colors.grey[200] : colors.grey[700]}`,
        }}>
          <Button
            onClick={() => {
              setStatusModalOpen(false);
              navigate(`${ROUTES.PROJECTS}?status=${encodeURIComponent(selectedStatus || '')}`);
            }}
            variant="contained"
            sx={{ 
              textTransform: 'none',
              bgcolor: colors.blueAccent[600],
              '&:hover': {
                bgcolor: colors.blueAccent[700],
              }
            }}
          >
            View All in Projects Page
          </Button>
          <Button
            onClick={() => setStatusModalOpen(false)}
            variant="outlined"
            sx={{ 
              textTransform: 'none',
              borderColor: colors.grey[400],
              color: colors.grey[700],
            }}
          >
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default ProjectByStatusDashboardPage;