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
import projectService from '../api/projectService';

const formatCurrency = (value) =>
  `KES ${((Number(value) || 0) / 1_000_000).toLocaleString('en-KE', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}M`;

const formatCurrencyAxisTick = (value) => {
  const numeric = Number(value) || 0;
  if (numeric >= 1_000_000_000) {
    return `KES ${(numeric / 1_000_000_000).toFixed(1)}B`;
  }
  if (numeric >= 1_000_000) {
    return `KES ${(numeric / 1_000_000).toFixed(0)}M`;
  }
  if (numeric >= 1_000) {
    return `KES ${(numeric / 1_000).toFixed(0)}K`;
  }
  return `KES ${numeric.toFixed(0)}`;
};

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
  const [allProjects, setAllProjects] = useState([]);

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

  useEffect(() => {
    const fetchProjects = async () => {
      try {
        const data = await projectService.analytics.getProjectsForOrganization({ limit: 5000 });
        const rows = Array.isArray(data) ? data : [];
        const normalized = rows.map((p) => ({
          ...p,
          projectName: p.projectName || p.project_name || 'Untitled Project',
          department: p.department || p.departmentName || p.ministry || '',
          directorate: p.directorate || p.directorateName || p.agency || '',
          financialYear: p.financialYear || p.financialYearName || '',
          budgetSource: p.budgetSource || p.source || 'Unknown',
          sector: p.sector || p.categoryName || p.department || p.ministry || 'Unknown',
          budget: Number(p.budget ?? p.costOfProject ?? p.allocatedBudget ?? 0),
          Disbursed: Number(p.Disbursed ?? p.paidOut ?? p.disbursedBudget ?? 0),
        }));
        setAllProjects(normalized);
      } catch (error) {
        console.error('Error fetching finance dashboard projects:', error);
        setAllProjects([]);
      }
    };
    fetchProjects();
  }, []);

  const filteredProjects = useMemo(() => {
    return allProjects.filter((p) => {
      if (filters.department && p.department !== filters.department) return false;
      if (filters.directorate && p.directorate !== filters.directorate) return false;
      if (filters.financialYear && p.financialYear !== filters.financialYear) return false;
      if (filters.budgetSource && p.budgetSource !== filters.budgetSource) return false;
      return true;
    });
  }, [allProjects, filters]);

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

  const isLight = theme.palette.mode === 'light';
  const ui = {
    elevatedShadow: isLight
      ? '0 1px 6px rgba(0,0,0,0.06)'
      : '0 4px 20px rgba(0, 0, 0, 0.15), 0 -2px 10px rgba(0, 0, 0, 0.1)',
  };

  const animTotalBudget = useCountUp(Math.round(financialData.totalBudget || 0));
  const animTotalDisbursed = useCountUp(Math.round(financialData.totalDisbursed || 0));
  const animAbsorption = useCountUp(financialData.overallAbsorption || 0);
  const animUnderCount = useCountUp(financialData.underAbsorbing.length);

  const filteredProjectCount = filteredProjects.length;
  const disbursedSharePct =
    financialData.totalBudget > 0
      ? Math.round((financialData.totalDisbursed / financialData.totalBudget) * 100)
      : 0;

  const uniqueDepartments = Array.from(new Set(allProjects.map((p) => p.department))).filter(Boolean);
  const uniqueDirectorates = Array.from(new Set(allProjects.map((p) => p.directorate))).filter(Boolean);
  const uniqueFinancialYears = Array.from(new Set(allProjects.map((p) => p.financialYear))).filter(Boolean);
  const uniqueBudgetSources = Array.from(new Set(allProjects.map((p) => p.budgetSource))).filter(Boolean);

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
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, mb: 1.5, flexWrap: 'wrap' }}>
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
              borderColor: colors.blueAccent[500],
              color: colors.blueAccent[500],
              fontSize: '0.8rem',
              py: 0.5,
              px: 1.5,
              minWidth: 'auto',
              '&:hover': {
                borderColor: colors.blueAccent[400],
                bgcolor: `${colors.blueAccent[600]}20`,
              },
            }}
          >
            Summary Statistics
          </Button>
        </Box>

        {/* Filters - Collapsible at Top (aligned with Project By Status) */}
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
              <Box
                sx={{
                  display: 'flex',
                  flexDirection: { xs: 'column', sm: 'row' },
                  alignItems: { xs: 'stretch', sm: 'center' },
                  gap: 1,
                  width: '100%',
                  minWidth: 0,
                }}
              >
                <FormControl
                  size="small"
                  fullWidth
                  sx={{
                    flex: { xs: 'none', sm: '1 1 0%' },
                    minWidth: { sm: 0 },
                  }}
                >
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
                  <FormControl
                    size="small"
                    fullWidth
                    sx={{
                      flex: { xs: 'none', sm: '1 1 0%' },
                      minWidth: { sm: 0 },
                    }}
                  >
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
                <FormControl
                  size="small"
                  fullWidth
                  sx={{
                    flex: { xs: 'none', sm: '1 1 0%' },
                    minWidth: { sm: 0 },
                  }}
                >
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
                <FormControl
                  size="small"
                  fullWidth
                  sx={{
                    flex: { xs: 'none', sm: '1 1 0%' },
                    minWidth: { sm: 0 },
                  }}
                >
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
                <Chip
                  label={`${filteredProjectCount} projects`}
                  size="small"
                  sx={{
                    flexShrink: 0,
                    alignSelf: { xs: 'flex-start', sm: 'center' },
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

        {/* KPI row: equal-width columns on sm+, horizontal scroll on narrow screens */}
        <Box
          sx={{
            mb: 1,
            mt: 1,
            width: '100%',
            display: 'flex',
            flexWrap: 'nowrap',
            gap: 1,
            pb: 1,
            overflowX: { xs: 'auto', sm: 'hidden' },
            boxSizing: 'border-box',
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
          <Box
            sx={{
              flex: { xs: '0 0 auto', sm: '1 1 0%' },
              minWidth: { xs: 160, sm: 0 },
              maxWidth: { sm: '100%' },
              display: 'flex',
              flexDirection: 'column',
              minHeight: 0,
            }}
          >
              <Card
                sx={{
                  flex: 1,
                  width: '100%',
                  minHeight: '100%',
                  background: isLight
                    ? 'linear-gradient(135deg, #2196f3 0%, #42a5f5 100%)'
                    : `linear-gradient(135deg, ${colors.blueAccent[800]}, ${colors.blueAccent[700]})`,
                  color: isLight ? 'white' : 'inherit',
                  borderTop: `2px solid ${isLight ? '#1976d2' : colors.blueAccent[500]}`,
                  boxShadow: ui.elevatedShadow,
                  transition: 'all 0.2s ease-in-out',
                  borderRadius: '8px',
                  '&:hover': {
                    transform: 'translateY(-2px)',
                    boxShadow: isLight ? '0 4px 12px rgba(33, 150, 243, 0.3)' : '0 4px 16px rgba(0, 0, 0, 0.25)',
                  },
                }}
              >
                <CardContent sx={{ p: 0.75, '&:last-child': { pb: 0.75 }, pt: 0.75 }}>
                  <Box display="flex" alignItems="center" gap={0.75}>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="caption" sx={{ color: isLight ? 'rgba(255, 255, 255, 0.9)' : colors.grey[100], fontWeight: 600, fontSize: '0.65rem', display: 'block' }}>
                        Total Budget
                      </Typography>
                      <Typography
                        variant="h5"
                        sx={{
                          color: isLight ? '#ffffff' : '#fff',
                          fontWeight: 800,
                          fontSize: { xs: '0.95rem', sm: '1.15rem', md: '1.35rem' },
                          mb: 0,
                          lineHeight: 1.15,
                        }}
                      >
                        {formatCurrency(animTotalBudget)}
                      </Typography>
                      <Typography variant="caption" component="div" sx={{ color: isLight ? 'rgba(255, 255, 255, 0.9)' : colors.grey[300], fontWeight: 600, fontSize: '1.1rem', mt: 0.125, lineHeight: 1.2 }}>
                        {filteredProjectCount} project{filteredProjectCount !== 1 ? 's' : ''}
                      </Typography>
                    </Box>
                    <AccountBalanceIcon sx={{ color: isLight ? 'rgba(255, 255, 255, 0.9)' : colors.blueAccent[500], fontSize: '2rem', flexShrink: 0 }} />
                  </Box>
                </CardContent>
              </Card>
          </Box>

          <Box
            sx={{
              flex: { xs: '0 0 auto', sm: '1 1 0%' },
              minWidth: { xs: 160, sm: 0 },
              maxWidth: { sm: '100%' },
              display: 'flex',
              flexDirection: 'column',
              minHeight: 0,
            }}
          >
              <Card
                sx={{
                  flex: 1,
                  width: '100%',
                  minHeight: '100%',
                  background: isLight
                    ? 'linear-gradient(135deg, #4caf50 0%, #81c784 100%)'
                    : `linear-gradient(135deg, ${colors.greenAccent[800]}, ${colors.greenAccent[700]})`,
                  color: isLight ? 'white' : 'inherit',
                  borderTop: `2px solid ${isLight ? '#388e3c' : colors.greenAccent[500]}`,
                  boxShadow: ui.elevatedShadow,
                  transition: 'all 0.2s ease-in-out',
                  borderRadius: '8px',
                  '&:hover': {
                    transform: 'translateY(-2px)',
                    boxShadow: isLight ? '0 4px 12px rgba(76, 175, 80, 0.3)' : '0 4px 16px rgba(0, 0, 0, 0.25)',
                  },
                }}
              >
                <CardContent sx={{ p: 0.75, '&:last-child': { pb: 0.75 }, pt: 0.75 }}>
                  <Box display="flex" alignItems="center" gap={0.75}>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="caption" sx={{ color: isLight ? 'rgba(255, 255, 255, 0.9)' : colors.grey[100], fontWeight: 600, fontSize: '0.65rem', display: 'block' }}>
                        Total Disbursed
                      </Typography>
                      <Typography
                        variant="h5"
                        sx={{
                          color: isLight ? '#ffffff' : '#fff',
                          fontWeight: 800,
                          fontSize: { xs: '0.95rem', sm: '1.15rem', md: '1.35rem' },
                          mb: 0,
                          lineHeight: 1.15,
                        }}
                      >
                        {formatCurrency(animTotalDisbursed)}
                      </Typography>
                      <Typography variant="caption" component="div" sx={{ color: isLight ? 'rgba(255, 255, 255, 0.9)' : colors.grey[300], fontWeight: 600, fontSize: '1.1rem', mt: 0.125, lineHeight: 1.2 }}>
                        {disbursedSharePct}% of budget
                      </Typography>
                    </Box>
                    <AttachMoneyIcon sx={{ color: isLight ? 'rgba(255, 255, 255, 0.9)' : colors.greenAccent[500], fontSize: '2rem', flexShrink: 0 }} />
                  </Box>
                </CardContent>
              </Card>
          </Box>

          <Box
            sx={{
              flex: { xs: '0 0 auto', sm: '1 1 0%' },
              minWidth: { xs: 160, sm: 0 },
              maxWidth: { sm: '100%' },
              display: 'flex',
              flexDirection: 'column',
              minHeight: 0,
            }}
          >
              <Card
                sx={{
                  flex: 1,
                  width: '100%',
                  minHeight: '100%',
                  background: isLight
                    ? 'linear-gradient(135deg, #ff9800 0%, #ffb74d 100%)'
                    : `linear-gradient(135deg, ${colors.yellowAccent[800]}, ${colors.yellowAccent[700]})`,
                  color: isLight ? 'white' : 'inherit',
                  borderTop: `2px solid ${isLight ? '#f57c00' : colors.yellowAccent[500]}`,
                  boxShadow: ui.elevatedShadow,
                  transition: 'all 0.2s ease-in-out',
                  borderRadius: '8px',
                  '&:hover': {
                    transform: 'translateY(-2px)',
                    boxShadow: isLight ? '0 4px 12px rgba(255, 152, 0, 0.3)' : '0 4px 16px rgba(0, 0, 0, 0.25)',
                  },
                }}
              >
                <CardContent sx={{ p: 0.75, '&:last-child': { pb: 0.75 }, pt: 0.75 }}>
                  <Box display="flex" alignItems="flex-start" gap={0.75}>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="caption" sx={{ color: isLight ? 'rgba(255, 255, 255, 0.9)' : colors.grey[100], fontWeight: 600, fontSize: '0.65rem', display: 'block' }}>
                        Overall Disbursement
                      </Typography>
                      <Typography variant="h5" sx={{ color: isLight ? '#ffffff' : '#fff', fontWeight: 800, fontSize: '2rem', mb: 0.25, lineHeight: 1.15 }}>
                        {animAbsorption}%
                      </Typography>
                      <LinearProgress
                        variant="determinate"
                        value={financialData.overallAbsorption}
                        sx={{
                          height: 5,
                          borderRadius: 8,
                          mb: 0.5,
                          bgcolor: isLight ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.2)',
                          '& .MuiLinearProgress-bar': {
                            borderRadius: 8,
                            background:
                              financialData.overallAbsorption >= 80
                                ? `linear-gradient(90deg, ${colors.greenAccent[500]}, ${colors.greenAccent[300]})`
                                : financialData.overallAbsorption >= 50
                                  ? `linear-gradient(90deg, #fff, rgba(255,255,255,0.85))`
                                  : `linear-gradient(90deg, ${colors.redAccent[500]}, ${colors.redAccent[300]})`,
                          },
                        }}
                      />
                      <Typography variant="caption" component="div" sx={{ color: isLight ? 'rgba(255, 255, 255, 0.9)' : colors.grey[300], fontWeight: 600, fontSize: '1.1rem', lineHeight: 1.2 }}>
                        Disbursed vs budgeted
                      </Typography>
                    </Box>
                    <TrendingUpIcon sx={{ color: isLight ? 'rgba(255, 255, 255, 0.9)' : colors.yellowAccent[400], fontSize: '2rem', flexShrink: 0, mt: 0.25 }} />
                  </Box>
                </CardContent>
              </Card>
          </Box>

          <Box
            sx={{
              flex: { xs: '0 0 auto', sm: '1 1 0%' },
              minWidth: { xs: 160, sm: 0 },
              maxWidth: { sm: '100%' },
              display: 'flex',
              flexDirection: 'column',
              minHeight: 0,
            }}
          >
              <Card
                sx={{
                  flex: 1,
                  width: '100%',
                  minHeight: '100%',
                  background: isLight
                    ? 'linear-gradient(135deg, #f44336 0%, #e57373 100%)'
                    : `linear-gradient(135deg, ${colors.redAccent[800]}, ${colors.redAccent[700]})`,
                  color: isLight ? 'white' : 'inherit',
                  borderTop: `2px solid ${isLight ? '#d32f2f' : colors.redAccent[500]}`,
                  boxShadow: ui.elevatedShadow,
                  transition: 'all 0.2s ease-in-out',
                  borderRadius: '8px',
                  '&:hover': {
                    transform: 'translateY(-2px)',
                    boxShadow: isLight ? '0 4px 12px rgba(244, 67, 54, 0.3)' : '0 4px 16px rgba(0, 0, 0, 0.25)',
                  },
                }}
              >
                <CardContent sx={{ p: 0.75, '&:last-child': { pb: 0.75 }, pt: 0.75 }}>
                  <Box display="flex" alignItems="center" gap={0.75}>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="caption" sx={{ color: isLight ? 'rgba(255, 255, 255, 0.9)' : colors.grey[100], fontWeight: 600, fontSize: '0.65rem', display: 'block' }}>
                        Under-Disbursed
                      </Typography>
                      <Typography variant="h5" sx={{ color: isLight ? '#ffffff' : '#fff', fontWeight: 800, fontSize: '2rem', mb: 0, lineHeight: 1.15 }}>
                        {animUnderCount}
                      </Typography>
                      <Typography variant="caption" component="div" sx={{ color: isLight ? 'rgba(255, 255, 255, 0.9)' : colors.grey[300], fontWeight: 600, fontSize: '1.1rem', mt: 0.125, lineHeight: 1.2 }}>
                        Below 70% disbursement
                      </Typography>
                    </Box>
                    <TrendingDownIcon sx={{ color: isLight ? 'rgba(255, 255, 255, 0.9)' : colors.redAccent[400], fontSize: '2rem', flexShrink: 0 }} />
                  </Box>
                </CardContent>
              </Card>
          </Box>
        </Box>
      </Box>

      {/* Top charts: equal half-width row, full bleed (md+) */}
      <Box
        sx={{
          display: 'flex',
          flexDirection: { xs: 'column', md: 'row' },
          gap: 2.5,
          width: '100%',
          maxWidth: '100%',
          mb: 2.5,
          boxSizing: 'border-box',
        }}
      >
        <Box
          sx={{
            flex: { xs: '1 1 auto', md: '1 1 0%' },
            minWidth: 0,
            width: { xs: '100%' },
          }}
        >
          <Card
            sx={{
              borderRadius: 4,
              width: '100%',
              height: '100%',
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
            <CardContent sx={{ p: 1.5, pb: 0.5, border: 0, outline: 0, boxShadow: 'none', '&:last-child': { pb: 0.5 } }}>
              <Box display="flex" alignItems="center" gap={1} mb={0.75}>
                <Box
                  sx={{
                    p: 0.75,
                    borderRadius: 1.5,
                    background: `linear-gradient(135deg, ${colors.greenAccent[600]}, ${colors.greenAccent[400]})`,
                  }}
                >
                  <AssessmentIcon sx={{ color: 'white', fontSize: 18 }} />
                </Box>
                <Box>
                  <Typography variant="subtitle1" sx={{ color: colors.grey[100], fontWeight: 700, fontSize: '1rem' }}>
                    Disbursement by Sector
                  </Typography>
                  <Typography variant="caption" sx={{ color: colors.grey[400], fontSize: '0.7rem' }}>
                    Budget vs. disbursed by sector
                  </Typography>
                </Box>
              </Box>
              <Box sx={{ height: 320, mt: 0, position: 'relative' }}>
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
                    <YAxis
                      tick={{ fill: colors.grey[300], fontSize: 11 }}
                      tickFormatter={formatCurrencyAxisTick}
                      width={90}
                    />
                    <RechartsTooltip
                      formatter={(value) => formatCurrency(value)}
                      contentStyle={{
                        background: theme.palette.mode === 'dark' ? colors.primary[500] : '#ffffff',
                        border: `1px solid ${colors.blueAccent[700]}`,
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
        </Box>

        <Box
          sx={{
            flex: { xs: '1 1 auto', md: '1 1 0%' },
            minWidth: 0,
            width: { xs: '100%' },
          }}
        >
          <Card
            sx={{
              borderRadius: 4,
              width: '100%',
              height: '100%',
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
            <CardContent sx={{ p: 1.5, pb: 0.5, border: 0, outline: 0, boxShadow: 'none', '&:last-child': { pb: 0.5 } }}>
              <Box display="flex" alignItems="center" gap={1} mb={0.75}>
                <Box
                  sx={{
                    p: 0.75,
                    borderRadius: 1.5,
                    background: `linear-gradient(135deg, ${colors.blueAccent[600]}, ${colors.blueAccent[400]})`,
                  }}
                >
                  <TrendingUpIcon sx={{ color: 'white', fontSize: 18 }} />
                </Box>
                <Box>
                  <Typography variant="subtitle1" sx={{ color: colors.grey[100], fontWeight: 700, fontSize: '1rem' }}>
                    Disbursement by Financial Year
                  </Typography>
                  <Typography variant="caption" sx={{ color: colors.grey[400], fontSize: '0.7rem' }}>
                    Trend across financial years
                  </Typography>
                </Box>
              </Box>
              <Box sx={{ height: 320, mt: 0, position: 'relative' }}>
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
                    <YAxis
                      tick={{ fill: colors.grey[300], fontSize: 11 }}
                      tickFormatter={formatCurrencyAxisTick}
                      width={90}
                    />
                    <RechartsTooltip
                      formatter={(value) => formatCurrency(value)}
                      contentStyle={{
                        background: theme.palette.mode === 'dark' ? colors.primary[500] : '#ffffff',
                        border: `1px solid ${colors.blueAccent[700]}`,
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
        </Box>
      </Box>

      <Grid container spacing={2.5} sx={{ width: '100%', maxWidth: '100%', boxSizing: 'border-box' }}>
        {/* Budget Source Analysis */}
        <Grid item xs={12} sx={{ width: '100%', maxWidth: '100%' }}>
          <Card
            sx={{
              width: '100%',
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
            <CardContent sx={{ p: 1.5, pb: 0.5, border: 0, outline: 0, boxShadow: 'none', '&:last-child': { pb: 0.5 } }}>
              <Box display="flex" alignItems="center" gap={1} mb={0.75}>
                <Box
                  sx={{
                    p: 0.75,
                    borderRadius: 1.5,
                    background: `linear-gradient(135deg, ${colors.blueAccent[600]}, ${colors.blueAccent[400]})`,
                  }}
                >
                  <BusinessIcon sx={{ color: 'white', fontSize: 18 }} />
                </Box>
                <Box>
                  <Typography variant="subtitle1" sx={{ color: colors.grey[100], fontWeight: 700, fontSize: '1rem' }}>
                    Budget Source Analysis
                  </Typography>
                  <Typography variant="caption" sx={{ color: colors.grey[400], fontSize: '0.7rem' }}>
                    Funding source breakdown
                  </Typography>
                </Box>
              </Box>
              <Box sx={{ mt: 0.5 }}>
                <TableContainer
                  sx={{
                    width: '100%',
                    maxHeight: 320,
                    border: 0,
                    borderRadius: '8px',
                  }}
                >
                  <Table size="small" stickyHeader sx={{ width: '100%' }}>
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
        <Grid item xs={12} sx={{ width: '100%', maxWidth: '100%' }}>
          <Card
            sx={{
              width: '100%',
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
            <CardContent sx={{ p: 1.5, pb: 0.5, border: 0, outline: 0, boxShadow: 'none', '&:last-child': { pb: 0.5 } }}>
              <Box display="flex" alignItems="center" gap={1} mb={0.75}>
                <Box
                  sx={{
                    p: 0.75,
                    borderRadius: 1.5,
                    background: `linear-gradient(135deg, ${colors.redAccent[600]}, ${colors.redAccent[400]})`,
                  }}
                >
                  <TrendingDownIcon sx={{ color: 'white', fontSize: 18 }} />
                </Box>
                <Box>
                  <Typography variant="subtitle1" sx={{ color: colors.grey[100], fontWeight: 700, fontSize: '1rem' }}>
                    Under-Disbursed Projects
                  </Typography>
                  <Typography variant="caption" sx={{ color: colors.grey[400], fontSize: '0.7rem' }}>
                    Projects with disbursement below 70%
                  </Typography>
                </Box>
              </Box>
              <Box sx={{ mt: 0.5 }}>
                {financialData.underAbsorbing.length === 0 ? (
                  <Typography variant="body2" sx={{ color: colors.grey[300], py: 2 }}>
                    No under-disbursed projects for the selected filters.
                  </Typography>
                ) : (
                  <TableContainer
                    sx={{
                      width: '100%',
                      maxHeight: 320,
                      border: 0,
                      borderRadius: '8px',
                    }}
                  >
                    <Table size="small" stickyHeader sx={{ width: '100%' }}>
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
                            <TableCell sx={{ whiteSpace: 'normal', wordBreak: 'break-word' }}>
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
