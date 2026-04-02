import React, { useMemo, useState, useEffect } from 'react';
import {
  Box,
  Grid,
  Card,
  CardContent,
  Typography,
  Chip,
  LinearProgress,
  useTheme,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Collapse,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
} from '@mui/material';
import {
  AttachMoney as AttachMoneyIcon,
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  AccountBalance as AccountBalanceIcon,
  Refresh as RefreshIcon,
  Business as BusinessIcon,
  Assessment as AssessmentIcon,
  FilterList as FilterIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
} from '@mui/icons-material';
import {
  ResponsiveContainer,
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
import sectorsService from '../api/sectorsService';

// Sample financial data
const SAMPLE_PROJECTS = [
  {
    projectName: 'Level 4 Hospital Upgrade',
    budget: 120_000_000,
    Disbursed: 72_000_000,
    financialYear: '2024/2025',
    department: 'Health',
    sector: 'Health',
    budgetSource: 'County Revenue',
    absorptionRate: 60,
  },
  {
    projectName: 'Market Sheds Construction',
    budget: 30_000_000,
    Disbursed: 0,
    financialYear: '2024/2025',
    department: 'Trade',
    sector: 'Trade',
    budgetSource: 'CDF',
    absorptionRate: 0,
  },
  {
    projectName: 'Rural Water Pan Program',
    budget: 55_000_000,
    Disbursed: 40_000_000,
    financialYear: '2023/2024',
    department: 'Water',
    sector: 'Water',
    budgetSource: 'National Government',
    absorptionRate: 73,
  },
  {
    projectName: 'ECDE Classrooms',
    budget: 18_000_000,
    Disbursed: 18_000_000,
    financialYear: '2022/2023',
    department: 'Education',
    sector: 'Education',
    budgetSource: 'County Revenue',
    absorptionRate: 100,
  },
  {
    projectName: 'Road Tarmacking - Kitui Town',
    budget: 85_000_000,
    Disbursed: 45_000_000,
    financialYear: '2024/2025',
    department: 'Infrastructure',
    sector: 'Infrastructure',
    budgetSource: 'National Government',
    absorptionRate: 53,
  },
  {
    projectName: 'Agricultural Extension Services',
    budget: 25_000_000,
    Disbursed: 15_000_000,
    financialYear: '2024/2025',
    department: 'Agriculture',
    sector: 'Agriculture',
    budgetSource: 'County Revenue',
    absorptionRate: 60,
  },
];

const formatCurrency = (value) =>
  new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency: 'KES',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value || 0);

const FinanceDashboardPage = () => {
  const theme = useTheme();
  const colors = tokens(theme.palette.mode);
  const navigate = useNavigate();
  const [filters, setFilters] = useState({
    department: '',
    directorate: '',
    financialYear: '',
    budgetSource: '',
  });
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [sectors, setSectors] = useState([]);

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
      if (filters.budgetSource && p.budgetSource !== filters.budgetSource) return false;
      return true;
    });
  }, [filters]);

  const financialData = useMemo(() => {
    const totalBudget = filteredProjects.reduce((sum, p) => sum + (p.budget || 0), 0);
    const totalDisbursed = filteredProjects.reduce((sum, p) => sum + (p.Disbursed || 0), 0);
    const overallAbsorption = totalBudget > 0 ? Math.round((totalDisbursed / totalBudget) * 100) : 0;

    // Create a map of sector names to aliases
    const sectorAliasMap = new Map();
    sectors.forEach((sector) => {
      const sectorName = sector.sectorName || sector.name;
      const alias = sector.alias || sectorName;
      if (sectorName) {
        sectorAliasMap.set(sectorName, alias);
      }
    });

    // Disbursement by Sector
    const sectorMap = new Map();
    filteredProjects.forEach((p) => {
      // Try to get sector from various possible fields
      const sectorName = p.sector || p.categoryName || p.department || 'Unknown';
      const current = sectorMap.get(sectorName) || { sector: sectorName, budget: 0, disbursed: 0 };
      current.budget += p.budget || 0;
      current.disbursed += p.Disbursed || 0;
      sectorMap.set(sectorName, current);
    });
    const sectorChart = Array.from(sectorMap.values()).map((row) => {
      // Use alias if available, otherwise use sector name
      const displayName = sectorAliasMap.get(row.sector) || row.sector;
      return {
        name: displayName,
        sector: row.sector,
        budget: row.budget,
        disbursed: row.disbursed,
        absorption: row.budget > 0 ? Math.round((row.disbursed / row.budget) * 100) : 0,
      };
    });

    // Disbursement by Financial Year
    const fyMap = new Map();
    filteredProjects.forEach((p) => {
      const key = p.financialYear || 'Unknown';
      const current = fyMap.get(key) || { fy: key, budget: 0, disbursed: 0 };
      current.budget += p.budget || 0;
      current.disbursed += p.Disbursed || 0;
      fyMap.set(key, current);
    });
    const fyChart = Array.from(fyMap.values())
      .sort((a, b) => a.fy.localeCompare(b.fy))
      .map((row) => ({
        name: row.fy,
        budget: row.budget,
        disbursed: row.disbursed,
        absorption: row.budget > 0 ? Math.round((row.disbursed / row.budget) * 100) : 0,
      }));

    // Budget Source Analysis
    const sourceMap = new Map();
    filteredProjects.forEach((p) => {
      const key = p.budgetSource || 'Unknown';
      const current = sourceMap.get(key) || { source: key, budget: 0, disbursed: 0 };
      current.budget += p.budget || 0;
      current.disbursed += p.Disbursed || 0;
      sourceMap.set(key, current);
    });
    const sourceChart = Array.from(sourceMap.values()).map((row) => ({
      name: row.source,
      budget: row.budget,
      disbursed: row.disbursed,
      absorption: row.budget > 0 ? Math.round((row.disbursed / row.budget) * 100) : 0,
      color: row.source === 'County Revenue' ? '#3b82f6' : row.source === 'National Government' ? '#22c55e' : '#f97316',
    }));

    // Top Under-Disbursed Projects
    const underAbsorbing = filteredProjects.filter((p) => {
      const rate = p.budget > 0 ? (p.Disbursed / p.budget) * 100 : 0;
      return rate < 70;
    })
      .sort((a, b) => {
        const rateA = a.budget > 0 ? (a.Disbursed / a.budget) * 100 : 0;
        const rateB = b.budget > 0 ? (b.Disbursed / b.budget) * 100 : 0;
        return rateA - rateB;
      })
      .slice(0, 5)
      .map((p) => ({
        name: p.projectName,
        absorption: p.budget > 0 ? Math.round((p.Disbursed / p.budget) * 100) : 0,
        budget: p.budget,
        disbursed: p.Disbursed,
      }));

    return {
      totalBudget,
      totalDisbursed,
      overallAbsorption,
      sectorChart,
      fyChart,
      sourceChart,
      underAbsorbing,
    };
  }, [filteredProjects, sectors]);

  const uniqueDepartments = Array.from(new Set(SAMPLE_PROJECTS.map((p) => p.department))).filter(Boolean);
  const uniqueDirectorates = Array.from(new Set(SAMPLE_PROJECTS.map((p) => p.directorate))).filter(Boolean);
  const uniqueFinancialYears = Array.from(new Set(SAMPLE_PROJECTS.map((p) => p.financialYear))).filter(Boolean);
  const uniqueBudgetSources = Array.from(new Set(SAMPLE_PROJECTS.map((p) => p.budgetSource))).filter(Boolean);

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
              background: `linear-gradient(180deg, ${colors.yellowAccent[500]}, ${colors.greenAccent[500]})`,
              borderRadius: 1.5,
              mt: 0.25,
            }}
          />
          <Box sx={{ flex: 1 }}>
            <Typography
              variant="h5"
              sx={{
                fontWeight: 800,
                background: `linear-gradient(135deg, ${colors.yellowAccent[500]}, ${colors.greenAccent[500]})`,
                backgroundClip: 'text',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                letterSpacing: '-0.02em',
                fontSize: { xs: '1.1rem', md: '1.35rem' },
                lineHeight: 1.2,
              }}
            >
              Finance Dashboard
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
              Financial performance analysis: Track budget allocation, disbursement rates, funding sources, and identify under-performing projects.
            </Typography>
          </Box>
          <Button
            variant="outlined"
            size="small"
            startIcon={<RefreshIcon sx={{ fontSize: 16 }} />}
            onClick={() => navigate('/summary-statistics')}
            sx={{
              borderColor: colors.yellowAccent[500],
              color: colors.yellowAccent[500],
              fontSize: '0.8rem',
              py: 0.5,
              px: 1.5,
              minWidth: 'auto',
              '&:hover': {
                borderColor: colors.yellowAccent[400],
                bgcolor: colors.yellowAccent[600] + '20',
              },
            }}
          >
            Summary Statistics
          </Button>
        </Box>

        {/* Filters - Collapsible at Top */}
        <Card
          sx={{
            borderRadius: '8px',
            bgcolor: theme.palette.mode === 'dark' ? colors.primary[400] : '#ffffff',
            mb: 1,
            border: `1px solid ${theme.palette.mode === 'dark' ? colors.yellowAccent[700] : 'rgba(0,0,0,0.08)'}`,
            boxShadow: `0 1px 4px ${colors.yellowAccent[500]}10`,
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
              <FilterIcon sx={{ color: colors.yellowAccent[500], fontSize: 14 }} />
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
                    bgcolor: colors.yellowAccent[600],
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
                {uniqueDirectorates.length > 0 && (
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
                )}
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
                <FormControl size="small" sx={{ minWidth: 140 }}>
                  <InputLabel sx={{ fontSize: '0.75rem' }}>Budget Source</InputLabel>
                  <Select
                    value={filters.budgetSource}
                    label="Budget Source"
                    onChange={(e) => setFilters({ ...filters, budgetSource: e.target.value })}
                    sx={{ fontSize: '0.8rem', height: '32px' }}
                  >
                    <MenuItem value="" sx={{ fontSize: '0.8rem' }}>All Sources</MenuItem>
                    {uniqueBudgetSources.map((source) => (
                      <MenuItem key={source} value={source} sx={{ fontSize: '0.8rem' }}>
                        {source}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Box>
            </CardContent>
          </Collapse>
        </Card>
      </Box>

      {/* Financial KPIs */}
      <Grid container spacing={1.5} mb={2}>
        <Grid item xs={12} sm={6} md={3}>
          <Card
            sx={{
              borderRadius: '8px',
              background: theme.palette.mode === 'dark'
                ? `linear-gradient(135deg, ${colors.primary[400]} 0%, ${colors.primary[500]} 100%)`
                : 'linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%)',
              border: `1px solid ${theme.palette.mode === 'dark' ? colors.blueAccent[700] : 'rgba(0,0,0,0.08)'}`,
              boxShadow: theme.palette.mode === 'dark'
                ? '0 4px 16px rgba(0,0,0,0.3)'
                : '0 2px 12px rgba(0,0,0,0.06)',
              transition: 'all 0.3s ease',
              '&:hover': {
                transform: 'translateY(-2px)',
                boxShadow: theme.palette.mode === 'dark'
                  ? '0 8px 24px rgba(104, 112, 250, 0.25)'
                  : '0 4px 20px rgba(0,0,0,0.1)',
              },
              '&::before': {
                content: '""',
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                height: '4px',
                background: `linear-gradient(90deg, ${colors.blueAccent[500]}, ${colors.blueAccent[300]})`,
              },
              position: 'relative',
              height: '100%',
            }}
          >
            <CardContent sx={{ p: 1.5 }}>
              <Box display="flex" alignItems="center" justifyContent="space-between" mb={1}>
                <Typography
                  variant="subtitle2"
                  sx={{
                    color: colors.grey[300],
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    fontSize: '0.65rem',
                    letterSpacing: '0.5px',
                  }}
                >
                  Total Budget
                </Typography>
                <Box
                  sx={{
                    p: 0.75,
                    borderRadius: 1.5,
                    background: `linear-gradient(135deg, ${colors.blueAccent[600]}, ${colors.blueAccent[400]})`,
                    boxShadow: `0 2px 8px ${colors.blueAccent[700]}40`,
                  }}
                >
                  <AccountBalanceIcon sx={{ color: 'white', fontSize: 18 }} />
                </Box>
              </Box>
              <Typography
                variant="h6"
                sx={{
                  color: colors.grey[100],
                  fontWeight: 800,
                  mb: 0.25,
                  fontSize: { xs: '1rem', md: '1.25rem' },
                  lineHeight: 1.2,
                }}
              >
                {formatCurrency(financialData.totalBudget)}
              </Typography>
              <Typography
                variant="caption"
                sx={{
                  color: colors.grey[400],
                  fontSize: '0.7rem',
                }}
              >
                Across all projects
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card
            sx={{
              borderRadius: '8px',
              background: theme.palette.mode === 'dark'
                ? `linear-gradient(135deg, ${colors.primary[400]} 0%, ${colors.primary[500]} 100%)`
                : 'linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%)',
              border: `1px solid ${theme.palette.mode === 'dark' ? colors.blueAccent[700] : 'rgba(0,0,0,0.08)'}`,
              boxShadow: theme.palette.mode === 'dark'
                ? '0 8px 32px rgba(0,0,0,0.4)'
                : '0 4px 20px rgba(0,0,0,0.08)',
              transition: 'all 0.3s ease',
              '&:hover': {
                transform: 'translateY(-2px)',
                boxShadow: theme.palette.mode === 'dark'
                  ? '0 12px 40px rgba(104, 112, 250, 0.3)'
                  : '0 8px 30px rgba(0,0,0,0.12)',
              },
              '&::before': {
                content: '""',
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                height: '4px',
                background: `linear-gradient(90deg, ${colors.blueAccent[500]}, ${colors.blueAccent[300]})`,
              },
              position: 'relative',
              height: '100%',
            }}
          >
            <CardContent sx={{ p: 1.5 }}>
              <Box display="flex" alignItems="center" justifyContent="space-between" mb={1}>
                <Typography
                  variant="subtitle2"
                  sx={{
                    color: colors.grey[300],
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    fontSize: '0.65rem',
                    letterSpacing: '0.5px',
                  }}
                >
                  Total Disbursed
                </Typography>
                <Box
                  sx={{
                    p: 0.75,
                    borderRadius: 1.5,
                    background: `linear-gradient(135deg, ${colors.blueAccent[600]}, ${colors.blueAccent[400]})`,
                    boxShadow: `0 2px 8px ${colors.blueAccent[700]}40`,
                  }}
                >
                  <AttachMoneyIcon sx={{ color: 'white', fontSize: 18 }} />
                </Box>
              </Box>
              <Typography
                variant="h6"
                sx={{
                  color: colors.grey[100],
                  fontWeight: 800,
                  mb: 0.25,
                  fontSize: { xs: '1rem', md: '1.25rem' },
                  lineHeight: 1.2,
                }}
              >
                {formatCurrency(financialData.totalDisbursed)}
              </Typography>
              <Typography
                variant="caption"
                sx={{
                  color: colors.grey[400],
                  fontSize: '0.7rem',
                }}
              >
                Amount paid out
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card
            sx={{
              borderRadius: '8px',
              background: theme.palette.mode === 'dark'
                ? `linear-gradient(135deg, ${colors.primary[400]} 0%, ${colors.primary[500]} 100%)`
                : 'linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%)',
              border: `1px solid ${theme.palette.mode === 'dark' ? colors.blueAccent[700] : 'rgba(0,0,0,0.08)'}`,
              boxShadow: theme.palette.mode === 'dark'
                ? '0 8px 32px rgba(0,0,0,0.4)'
                : '0 4px 20px rgba(0,0,0,0.08)',
              transition: 'all 0.3s ease',
              '&:hover': {
                transform: 'translateY(-2px)',
                boxShadow: theme.palette.mode === 'dark'
                  ? '0 12px 40px rgba(104, 112, 250, 0.3)'
                  : '0 8px 30px rgba(0,0,0,0.12)',
              },
              '&::before': {
                content: '""',
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                height: '4px',
                background: `linear-gradient(90deg, ${colors.blueAccent[500]}, ${colors.blueAccent[300]})`,
              },
              position: 'relative',
              height: '100%',
            }}
          >
            <CardContent sx={{ p: 1.5 }}>
              <Box display="flex" alignItems="center" justifyContent="space-between" mb={1}>
                <Typography
                  variant="subtitle2"
                  sx={{
                    color: colors.grey[300],
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    fontSize: '0.65rem',
                    letterSpacing: '0.5px',
                  }}
                >
                  Overall Disbursement
                </Typography>
                <Box
                  sx={{
                    p: 0.75,
                    borderRadius: 1.5,
                    background: `linear-gradient(135deg, ${colors.blueAccent[600]}, ${colors.blueAccent[400]})`,
                    boxShadow: `0 2px 8px ${colors.blueAccent[700]}40`,
                  }}
                >
                  <TrendingUpIcon sx={{ color: 'white', fontSize: 18 }} />
                </Box>
              </Box>
              <Typography
                variant="h5"
                sx={{
                  color: colors.grey[100],
                  fontWeight: 800,
                  mb: 0.75,
                  fontSize: { xs: '1.25rem', md: '1.5rem' },
                  lineHeight: 1.2,
                }}
              >
                {financialData.overallAbsorption}%
              </Typography>
              <LinearProgress
                variant="determinate"
                value={financialData.overallAbsorption}
                sx={{
                  height: 6,
                  borderRadius: 8,
                  bgcolor: colors.primary[300],
                  mb: 0.5,
                  '& .MuiLinearProgress-bar': {
                    borderRadius: 8,
                    background:
                      financialData.overallAbsorption >= 80
                        ? `linear-gradient(90deg, ${colors.greenAccent[500]}, ${colors.greenAccent[300]})`
                        : financialData.overallAbsorption >= 50
                        ? `linear-gradient(90deg, ${colors.yellowAccent[500]}, ${colors.yellowAccent[300]})`
                        : `linear-gradient(90deg, ${colors.redAccent[500]}, ${colors.redAccent[300]})`,
                    boxShadow: `0 2px 6px ${financialData.overallAbsorption >= 80 ? colors.greenAccent[600] : financialData.overallAbsorption >= 50 ? colors.yellowAccent[600] : colors.redAccent[600]}40`,
                  },
                }}
              />
              <Typography
                variant="caption"
                sx={{
                  color: colors.grey[400],
                  fontSize: '0.7rem',
                }}
              >
                Disbursed vs. budgeted
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card
            sx={{
              borderRadius: '8px',
              background: theme.palette.mode === 'dark'
                ? `linear-gradient(135deg, ${colors.primary[400]} 0%, ${colors.primary[500]} 100%)`
                : 'linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%)',
              border: `1px solid ${theme.palette.mode === 'dark' ? colors.blueAccent[700] : 'rgba(0,0,0,0.08)'}`,
              boxShadow: theme.palette.mode === 'dark'
                ? '0 8px 32px rgba(0,0,0,0.4)'
                : '0 4px 20px rgba(0,0,0,0.08)',
              transition: 'all 0.3s ease',
              '&:hover': {
                transform: 'translateY(-2px)',
                boxShadow: theme.palette.mode === 'dark'
                  ? '0 12px 40px rgba(104, 112, 250, 0.3)'
                  : '0 8px 30px rgba(0,0,0,0.12)',
              },
              '&::before': {
                content: '""',
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                height: '4px',
                background: `linear-gradient(90deg, ${colors.blueAccent[500]}, ${colors.blueAccent[300]})`,
              },
              position: 'relative',
              height: '100%',
            }}
          >
            <CardContent sx={{ p: 1.5 }}>
              <Box display="flex" alignItems="center" justifyContent="space-between" mb={1}>
                <Typography
                  variant="subtitle2"
                  sx={{
                    color: colors.grey[300],
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    fontSize: '0.65rem',
                    letterSpacing: '0.5px',
                  }}
                >
                  Under-Disbursed
                </Typography>
                <Box
                  sx={{
                    p: 0.75,
                    borderRadius: 1.5,
                    background: `linear-gradient(135deg, ${colors.blueAccent[600]}, ${colors.blueAccent[400]})`,
                    boxShadow: `0 2px 8px ${colors.blueAccent[700]}40`,
                  }}
                >
                  <TrendingDownIcon sx={{ color: 'white', fontSize: 18 }} />
                </Box>
              </Box>
              <Typography
                variant="h5"
                sx={{
                  color: colors.grey[100],
                  fontWeight: 800,
                  mb: 0.25,
                  fontSize: { xs: '1.25rem', md: '1.5rem' },
                  lineHeight: 1.2,
                }}
              >
                {financialData.underAbsorbing.length}
              </Typography>
              <Typography
                variant="caption"
                sx={{
                  color: colors.grey[400],
                  fontSize: '0.7rem',
                }}
              >
                Projects below 70% disbursement
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Charts Grid */}
      <Grid container spacing={2.5}>
        {/* Disbursement by Sector */}
        <Grid item xs={12} md={6}>
          <Card
            sx={{
              borderRadius: '8px',
              background: theme.palette.mode === 'dark'
                ? `linear-gradient(135deg, ${colors.primary[400]} 0%, ${colors.primary[500]} 100%)`
                : 'linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%)',
              border: `1px solid ${theme.palette.mode === 'dark' ? colors.greenAccent[700] : 'rgba(0,0,0,0.08)'}`,
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
                    Disbursement by Sector
                  </Typography>
                  <Typography
                    variant="caption"
                    sx={{
                      color: colors.grey[400],
                      fontSize: '0.75rem',
                    }}
                  >
                    Budget vs. disbursed by sector
                  </Typography>
                </Box>
              </Box>
              <Box sx={{ height: 320, mt: 1 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={financialData.sectorChart} margin={{ top: 10, right: 10, left: -20, bottom: 50 }}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke={theme.palette.mode === 'dark' ? colors.grey[700] : colors.grey[300]}
                    />
                    <XAxis
                      dataKey="name"
                      angle={-30}
                      textAnchor="end"
                      interval={0}
                      height={70}
                      tick={{ fill: colors.grey[300], fontSize: 11 }}
                    />
                    <YAxis tick={{ fill: colors.grey[300], fontSize: 11 }} />
                    <RechartsTooltip
                      formatter={(value) => formatCurrency(value)}
                      contentStyle={{
                        background: theme.palette.mode === 'dark' ? colors.primary[500] : '#ffffff',
                        border: `1px solid ${colors.greenAccent[700]}`,
                        borderRadius: 8,
                        padding: '8px 12px',
                      }}
                    />
                    <Legend />
                    <Bar dataKey="budget" name="Budget" fill={colors.blueAccent[500]} radius={[4, 4, 0, 0]} />
                    <Bar dataKey="disbursed" name="Disbursed" fill={colors.greenAccent[500]} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Disbursement by Financial Year */}
        <Grid item xs={12} md={6}>
          <Card
            sx={{
              borderRadius: '8px',
              background: theme.palette.mode === 'dark'
                ? `linear-gradient(135deg, ${colors.primary[400]} 0%, ${colors.primary[500]} 100%)`
                : 'linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%)',
              border: `1px solid ${theme.palette.mode === 'dark' ? colors.yellowAccent[700] : 'rgba(0,0,0,0.08)'}`,
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
            <CardContent sx={{ p: 3 }}>
              <Box display="flex" alignItems="center" gap={1} mb={2}>
                <Box
                  sx={{
                    p: 1,
                    borderRadius: 1.5,
                    background: `linear-gradient(135deg, ${colors.yellowAccent[600]}, ${colors.yellowAccent[400]})`,
                  }}
                >
                  <TrendingUpIcon sx={{ color: 'white', fontSize: 20 }} />
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
                    Disbursement by Financial Year
                  </Typography>
                  <Typography
                    variant="caption"
                    sx={{
                      color: colors.grey[400],
                      fontSize: '0.75rem',
                    }}
                  >
                    Trend across financial years
                  </Typography>
                </Box>
              </Box>
              <Box sx={{ height: 320, mt: 1 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={financialData.fyChart} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
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
                      formatter={(value) => formatCurrency(value)}
                      contentStyle={{
                        background: theme.palette.mode === 'dark' ? colors.primary[500] : '#ffffff',
                        border: `1px solid ${colors.yellowAccent[700]}`,
                        borderRadius: 8,
                        padding: '8px 12px',
                      }}
                    />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="budget"
                      name="Budget"
                      stroke={colors.blueAccent[500]}
                      strokeWidth={2}
                      dot={{ fill: colors.blueAccent[500], r: 4 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="disbursed"
                      name="Disbursed"
                      stroke={colors.greenAccent[500]}
                      strokeWidth={2}
                      dot={{ fill: colors.greenAccent[500], r: 4 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Budget Source Analysis */}
        <Grid item xs={12} md={6}>
          <Card
            sx={{
              borderRadius: '8px',
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
            <CardContent sx={{ p: 3 }}>
              <Box display="flex" alignItems="center" gap={1} mb={2}>
                <Box
                  sx={{
                    p: 1,
                    borderRadius: 1.5,
                    background: `linear-gradient(135deg, ${colors.blueAccent[600]}, ${colors.blueAccent[400]})`,
                  }}
                >
                  <BusinessIcon sx={{ color: 'white', fontSize: 20 }} />
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
                    Budget Source Analysis
                  </Typography>
                  <Typography
                    variant="caption"
                    sx={{
                      color: colors.grey[400],
                      fontSize: '0.75rem',
                    }}
                  >
                    Funding source breakdown
                  </Typography>
                </Box>
              </Box>
              <Box sx={{ mt: 1 }}>
                <TableContainer
                  sx={{
                    maxHeight: 320,
                    border: `1px solid ${theme.palette.mode === 'dark' ? colors.grey[700] : colors.grey[300]}`,
                    borderRadius: '8px',
                  }}
                >
                  <Table size="small" stickyHeader>
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 700 }}>
                          Source
                        </TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700 }}>
                          Allocated
                        </TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700 }}>
                          Disbursed
                        </TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700 }}>
                          Disbursement
                        </TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700 }}>
                          Share
                        </TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {[...financialData.sourceChart]
                        .sort((a, b) => (b.budget || 0) - (a.budget || 0))
                        .map((row, index) => {
                          const share = financialData.totalBudget > 0 ? Math.round(((row.budget || 0) / financialData.totalBudget) * 100) : 0;
                          return (
                            <TableRow
                              key={`${row.name}-${index}`}
                              sx={{
                                '&:nth-of-type(odd)': {
                                  bgcolor: theme.palette.mode === 'dark' ? `${colors.primary[500]}44` : '#f9fafb',
                                },
                              }}
                            >
                              <TableCell sx={{ color: colors.grey[100], fontWeight: 600 }}>
                                {row.name}
                              </TableCell>
                              <TableCell align="right" sx={{ color: colors.grey[100] }}>
                                {formatCurrency(row.budget)}
                              </TableCell>
                              <TableCell align="right" sx={{ color: colors.grey[100] }}>
                                {formatCurrency(row.disbursed)}
                              </TableCell>
                              <TableCell align="right">
                                <Chip
                                  size="small"
                                  label={`${row.absorption}%`}
                                  sx={{
                                    bgcolor: row.absorption >= 70 ? colors.greenAccent[600] : colors.orange[600],
                                    color: 'white',
                                    fontWeight: 700,
                                    minWidth: 62,
                                  }}
                                />
                              </TableCell>
                              <TableCell align="right" sx={{ color: colors.grey[100], fontWeight: 600 }}>
                                {share}%
                              </TableCell>
                            </TableRow>
                          );
                        })}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Top Under-Disbursed Projects */}
        <Grid item xs={12} md={6}>
          <Card
            sx={{
              borderRadius: '8px',
              background: theme.palette.mode === 'dark'
                ? `linear-gradient(135deg, ${colors.primary[400]} 0%, ${colors.primary[500]} 100%)`
                : 'linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%)',
              border: `1px solid ${theme.palette.mode === 'dark' ? colors.redAccent[700] : 'rgba(0,0,0,0.08)'}`,
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
            <CardContent sx={{ p: 3 }}>
              <Box display="flex" alignItems="center" gap={1} mb={2}>
                <Box
                  sx={{
                    p: 1,
                    borderRadius: 1.5,
                    background: `linear-gradient(135deg, ${colors.redAccent[600]}, ${colors.redAccent[400]})`,
                  }}
                >
                  <TrendingDownIcon sx={{ color: 'white', fontSize: 20 }} />
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
                    Under-Disbursed Projects
                  </Typography>
                  <Typography
                    variant="caption"
                    sx={{
                      color: colors.grey[400],
                      fontSize: '0.75rem',
                    }}
                  >
                    Projects with disbursement below 70%
                  </Typography>
                </Box>
              </Box>
              <Box sx={{ mt: 1 }}>
                {financialData.underAbsorbing.length === 0 ? (
                  <Typography variant="body2" sx={{ color: colors.grey[300], py: 2 }}>
                    No under-disbursed projects for the selected filters.
                  </Typography>
                ) : (
                  <TableContainer
                    sx={{
                      maxHeight: 320,
                      border: `1px solid ${theme.palette.mode === 'dark' ? colors.grey[700] : colors.grey[300]}`,
                      borderRadius: '8px',
                    }}
                  >
                    <Table size="small" stickyHeader>
                      <TableHead>
                        <TableRow>
                          <TableCell sx={{ fontWeight: 700 }}>Project</TableCell>
                          <TableCell align="right" sx={{ fontWeight: 700 }}>Disbursement</TableCell>
                          <TableCell align="right" sx={{ fontWeight: 700 }}>Allocated</TableCell>
                          <TableCell align="right" sx={{ fontWeight: 700 }}>Disbursed</TableCell>
                          <TableCell align="right" sx={{ fontWeight: 700 }}>Gap</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {financialData.underAbsorbing.map((row) => (
                          <TableRow key={row.name} hover>
                            <TableCell sx={{ maxWidth: 280, whiteSpace: 'normal', wordBreak: 'break-word' }}>
                              {row.name}
                            </TableCell>
                            <TableCell align="right">
                              <Chip
                                size="small"
                                label={`${row.absorption}%`}
                                sx={{
                                  bgcolor: row.absorption < 40 ? colors.redAccent[700] : colors.yellowAccent[700],
                                  color: '#fff',
                                  fontWeight: 700,
                                  minWidth: 60,
                                }}
                              />
                            </TableCell>
                            <TableCell align="right">{formatCurrency(row.budget)}</TableCell>
                            <TableCell align="right">{formatCurrency(row.disbursed)}</TableCell>
                            <TableCell align="right">{formatCurrency(Math.max(0, (row.budget || 0) - (row.disbursed || 0)))}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                )}
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
};

export default FinanceDashboardPage;
