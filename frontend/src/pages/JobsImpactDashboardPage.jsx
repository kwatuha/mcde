import React, { useMemo, useState, useEffect } from 'react';
import {
  Box,
  Grid,
  Card,
  CardContent,
  Typography,
  Chip,
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
  Work as WorkIcon,
  Group as GroupIcon,
  TrendingUp as TrendingUpIcon,
  LocationOn as LocationOnIcon,
  Refresh as RefreshIcon,
  People as PeopleIcon,
  Assessment as AssessmentIcon,
  FilterList as FilterIcon,
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
} from 'recharts';
import { tokens } from './dashboard/theme';
import { useNavigate } from 'react-router-dom';
import sectorsService from '../api/sectorsService';
import projectService from '../api/projectService';

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

const JobsImpactDashboardPage = () => {
  const theme = useTheme();
  const colors = tokens(theme.palette.mode);
  const navigate = useNavigate();
  const [filters, setFilters] = useState({
    department: '',
    project: '',
    sector: '',
    category: '',
  });
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [sectors, setSectors] = useState([]);
  const [jobsProjects, setJobsProjects] = useState([]);
  const [topProjects, setTopProjects] = useState([]);
  const [jobsSummary, setJobsSummary] = useState({
    totalJobs: 0, totalMale: 0, totalFemale: 0, totalDirectJobs: 0, totalIndirectJobs: 0,
  });
  const [jobsByCategory, setJobsByCategory] = useState([]);
  const [jobsBySector, setJobsBySector] = useState([]);
  const [loadingProjects, setLoadingProjects] = useState(false);

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
    const fetchSnapshot = async () => {
      try {
        const snapshot = await projectService.analytics.getJobsSnapshot();
        setJobsSummary(snapshot?.summary || {
          totalJobs: 0, totalMale: 0, totalFemale: 0, totalDirectJobs: 0, totalIndirectJobs: 0,
        });
        setJobsByCategory(Array.isArray(snapshot?.byCategory) ? snapshot.byCategory : []);
      } catch (error) {
        console.error('Error fetching jobs snapshot:', error);
      }
    };
    fetchSnapshot();
  }, []);

  useEffect(() => {
    const fetchTopProjects = async () => {
      setLoadingProjects(true);
      try {
        const projects = await projectService.analytics.getProjectsForOrganization({ limit: 5000 });
        setJobsProjects(Array.isArray(projects) ? projects : []);
      } catch (error) {
        console.error('Error fetching top projects:', error);
        setJobsProjects([]);
        setTopProjects([]);
        setJobsBySector([]);
      } finally {
        setLoadingProjects(false);
      }
    };
    fetchTopProjects();
  }, []);

  useEffect(() => {
    const list = Array.isArray(jobsProjects) ? jobsProjects : [];
    const filtered = list.filter((p) => {
      const projectName = String(p.projectName || p.name || '').trim();
      const sector = String(p.sector || p.categoryName || p.department || p.ministry || 'Unknown').trim();
      const category = String(p.categoryName || p.category || 'Uncategorized').trim();
      if (filters.project && projectName !== filters.project) return false;
      if (filters.sector && sector !== filters.sector) return false;
      if (filters.category && category !== filters.category) return false;
      return true;
    });

    const sortedProjects = filtered
      .filter((p) => Number(p.jobsCount || 0) > 0)
      .sort((a, b) => (Number(b.jobsCount) || 0) - (Number(a.jobsCount) || 0))
      .slice(0, 10);
    setTopProjects(sortedProjects);

    const sectorMap = new Map();
    filtered.forEach((p) => {
      const total = Number(p.jobsCount || 0);
      if (total <= 0) return;
      const direct = Number(p.directJobsCount || 0);
      const indirect = Number(p.indirectJobsCount || Math.max(0, total - direct));
      const sector = p.sector || p.categoryName || p.department || p.ministry || 'Unknown';
      const current = sectorMap.get(sector) || { sector, direct: 0, indirect: 0, total: 0 };
      current.direct += direct;
      current.indirect += indirect;
      current.total += total;
      sectorMap.set(sector, current);
    });
    setJobsBySector(Array.from(sectorMap.values()));
  }, [jobsProjects, filters.project, filters.sector, filters.category]);

  const chartData = useMemo(() => {
    // Direct vs Indirect comparison
    const directIndirectData = [
      { name: 'Direct Jobs', value: jobsSummary.totalDirectJobs || 0, color: colors.greenAccent[500] },
      { name: 'Indirect Jobs', value: jobsSummary.totalIndirectJobs || 0, color: colors.blueAccent[500] },
    ];

    // Gender distribution
    const genderData = [
      { name: 'Male', value: jobsSummary.totalMale || 0, color: colors.blueAccent[500] },
      { name: 'Female', value: jobsSummary.totalFemale || 0, color: colors.purpleAccent ? colors.purpleAccent[500] : colors.greenAccent[600] },
    ];

    // Jobs by category with direct/indirect breakdown
    const categoryChart = jobsByCategory.map((j, index) => ({
      name: j.name || 'Uncategorized',
      direct: Number(j.direct || 0),
      indirect: Number(j.indirect || 0),
      total: Number(j.value || 0),
      color: ['#3b82f6', '#22c55e', '#f97316'][index % 3],
    }));

    // Create a map of sector names to aliases
    const sectorAliasMap = new Map();
    sectors.forEach((sector) => {
      const sectorName = sector.sectorName || sector.name;
      const alias = sector.alias || sectorName;
      if (sectorName) {
        sectorAliasMap.set(sectorName, alias);
      }
    });

    // Jobs by Sector with aliases
    const sectorChart = jobsBySector.map((item) => {
      const displayName = sectorAliasMap.get(item.sector) || item.sectorDisplay || item.sector;
      return {
        sector: item.sector,
        sectorDisplay: displayName,
        direct: Number(item.direct || 0),
        indirect: Number(item.indirect || 0),
        total: Number(item.total || 0),
      };
    });

    return {
      directIndirectData,
      genderData,
      categoryChart,
      sectorChart,
    };
  }, [colors, sectors, jobsSummary, jobsByCategory, jobsBySector]);

  const isLight = theme.palette.mode === 'light';
  const ui = {
    elevatedShadow: isLight
      ? '0 1px 6px rgba(0,0,0,0.06)'
      : '0 4px 20px rgba(0, 0, 0, 0.15), 0 -2px 10px rgba(0, 0, 0, 0.1)',
  };

  const animTotalJobs = useCountUp(jobsSummary.totalJobs || 0);
  const animDirectJobs = useCountUp(jobsSummary.totalDirectJobs || 0);
  const animIndirectJobs = useCountUp(jobsSummary.totalIndirectJobs || 0);
  const femalePct =
    jobsSummary.totalJobs > 0
      ? Math.round((jobsSummary.totalFemale / jobsSummary.totalJobs) * 100)
      : 0;
  const animFemalePct = useCountUp(femalePct);
  const directSharePct =
    jobsSummary.totalJobs > 0
      ? Math.round((jobsSummary.totalDirectJobs / jobsSummary.totalJobs) * 100)
      : 0;
  const indirectSharePct =
    jobsSummary.totalJobs > 0
      ? Math.round((jobsSummary.totalIndirectJobs / jobsSummary.totalJobs) * 100)
      : 0;

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
              Jobs & Impact Dashboard
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
              Track employment creation: Monitor direct and indirect jobs, gender distribution, category breakdown, and geographic impact across projects.
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
                  <InputLabel sx={{ fontSize: '0.75rem' }}>Project</InputLabel>
                  <Select
                    value={filters.project}
                    label="Project"
                    onChange={(e) => setFilters({ ...filters, project: e.target.value })}
                    sx={{ fontSize: '0.8rem', height: '32px' }}
                  >
                    <MenuItem value="" sx={{ fontSize: '0.8rem' }}>All Projects</MenuItem>
                    {jobsProjects.map((p) => (
                      <MenuItem key={p.id || p.projectName} value={p.projectName || p.name || ''} sx={{ fontSize: '0.8rem' }}>
                        {p.projectName || p.name || 'Unnamed Project'}
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
                  <InputLabel sx={{ fontSize: '0.75rem' }}>Sector</InputLabel>
                  <Select
                    value={filters.sector || ''}
                    label="Sector"
                    onChange={(e) => setFilters({ ...filters, sector: e.target.value })}
                    sx={{ fontSize: '0.8rem', height: '32px' }}
                  >
                    <MenuItem value="" sx={{ fontSize: '0.8rem' }}>All Sectors</MenuItem>
                    {chartData.sectorChart.map((s) => (
                      <MenuItem key={s.sector} value={s.sector} sx={{ fontSize: '0.8rem' }}>
                        {s.sectorDisplay || s.sector}
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
                  <InputLabel sx={{ fontSize: '0.75rem' }}>Category</InputLabel>
                  <Select
                    value={filters.category}
                    label="Category"
                    onChange={(e) => setFilters({ ...filters, category: e.target.value })}
                    sx={{ fontSize: '0.8rem', height: '32px' }}
                  >
                    <MenuItem value="" sx={{ fontSize: '0.8rem' }}>All Categories</MenuItem>
                    {jobsByCategory.map((c) => (
                      <MenuItem key={c.name} value={c.name} sx={{ fontSize: '0.8rem' }}>
                        {c.name}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <Chip
                  label={`${jobsSummary.totalJobs || 0} jobs`}
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
                      Total Jobs
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
                      {animTotalJobs}
                    </Typography>
                    <Typography variant="caption" component="div" sx={{ color: isLight ? 'rgba(255, 255, 255, 0.9)' : colors.grey[300], fontWeight: 600, fontSize: '1.1rem', mt: 0.125, lineHeight: 1.2 }}>
                      Across all projects
                    </Typography>
                  </Box>
                  <WorkIcon sx={{ color: isLight ? 'rgba(255, 255, 255, 0.9)' : colors.blueAccent[500], fontSize: '2rem', flexShrink: 0 }} />
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
                      Direct Jobs
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
                      {animDirectJobs}
                    </Typography>
                    <Typography variant="caption" component="div" sx={{ color: isLight ? 'rgba(255, 255, 255, 0.9)' : colors.grey[300], fontWeight: 600, fontSize: '1.1rem', mt: 0.125, lineHeight: 1.2 }}>
                      {directSharePct}% of total
                    </Typography>
                  </Box>
                  <PeopleIcon sx={{ color: isLight ? 'rgba(255, 255, 255, 0.9)' : colors.greenAccent[500], fontSize: '2rem', flexShrink: 0 }} />
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
                <Box display="flex" alignItems="center" gap={0.75}>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="caption" sx={{ color: isLight ? 'rgba(255, 255, 255, 0.9)' : colors.grey[100], fontWeight: 600, fontSize: '0.65rem', display: 'block' }}>
                      Indirect Jobs
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
                      {animIndirectJobs}
                    </Typography>
                    <Typography variant="caption" component="div" sx={{ color: isLight ? 'rgba(255, 255, 255, 0.9)' : colors.grey[300], fontWeight: 600, fontSize: '1.1rem', mt: 0.125, lineHeight: 1.2 }}>
                      {indirectSharePct}% of total
                    </Typography>
                  </Box>
                  <TrendingUpIcon sx={{ color: isLight ? 'rgba(255, 255, 255, 0.9)' : colors.yellowAccent[400], fontSize: '2rem', flexShrink: 0 }} />
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
                      Female share
                    </Typography>
                    <Typography variant="h5" sx={{ color: isLight ? '#ffffff' : '#fff', fontWeight: 800, fontSize: '2rem', mb: 0, lineHeight: 1.15 }}>
                      {animFemalePct}%
                    </Typography>
                    <Typography variant="caption" component="div" sx={{ color: isLight ? 'rgba(255, 255, 255, 0.9)' : colors.grey[300], fontWeight: 600, fontSize: '1.1rem', mt: 0.125, lineHeight: 1.2 }}>
                      {jobsSummary.totalMale || 0}M : {jobsSummary.totalFemale || 0}F
                    </Typography>
                  </Box>
                  <GroupIcon sx={{ color: isLight ? 'rgba(255, 255, 255, 0.9)' : colors.redAccent[400], fontSize: '2rem', flexShrink: 0 }} />
                </Box>
              </CardContent>
            </Card>
          </Box>
        </Box>
      </Box>

      {/* Top charts: equal half-width row */}
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
        {/* Direct vs Indirect */}
        <Box sx={{ flex: { xs: '1 1 auto', md: '1 1 0%' }, minWidth: 0, width: { xs: '100%' } }}>
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
                  <WorkIcon sx={{ color: 'white', fontSize: 18 }} />
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
                    Direct vs Indirect Jobs
                  </Typography>
                  <Typography
                    variant="caption"
                    sx={{
                      color: colors.grey[400],
                      fontSize: '0.7rem',
                    }}
                  >
                    Employment type distribution
                  </Typography>
                </Box>
              </Box>
              <Box sx={{ height: 320, mt: 0, position: 'relative' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={chartData.directIndirectData}
                      cx="50%"
                      cy="50%"
                      outerRadius={100}
                      innerRadius={40}
                      paddingAngle={3}
                      dataKey="value"
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      labelLine={false}
                    >
                      {chartData.directIndirectData.map((entry, index) => (
                        <Cell
                          key={`direct-indirect-${index}`}
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
        </Box>

        {/* Gender Distribution */}
        <Box sx={{ flex: { xs: '1 1 auto', md: '1 1 0%' }, minWidth: 0, width: { xs: '100%' } }}>
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
                  <GroupIcon sx={{ color: 'white', fontSize: 18 }} />
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
                    Gender Distribution
                  </Typography>
                  <Typography
                    variant="caption"
                    sx={{
                      color: colors.grey[400],
                      fontSize: '0.7rem',
                    }}
                  >
                    Male vs Female employment
                  </Typography>
                </Box>
              </Box>
              <Box sx={{ height: 320, mt: 0, position: 'relative' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={chartData.genderData}
                      cx="50%"
                      cy="50%"
                      outerRadius={100}
                      innerRadius={40}
                      paddingAngle={3}
                      dataKey="value"
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      labelLine={false}
                    >
                      {chartData.genderData.map((entry, index) => (
                        <Cell
                          key={`gender-${index}`}
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
        </Box>
      </Box>

      <Grid container spacing={2.5} sx={{ width: '100%', maxWidth: '100%', boxSizing: 'border-box' }}>
        {/* Jobs by Category with Direct/Indirect */}
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
                  <WorkIcon sx={{ color: 'white', fontSize: 18 }} />
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
                    Jobs by Category
                  </Typography>
                  <Typography
                    variant="caption"
                    sx={{
                      color: colors.grey[400],
                      fontSize: '0.7rem',
                    }}
                  >
                    Direct and indirect breakdown by category
                  </Typography>
                </Box>
              </Box>
              <Box sx={{ height: 320, mt: 0, position: 'relative' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData.categoryChart} margin={{ top: 10, right: 10, left: -20, bottom: 40 }}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke={theme.palette.mode === 'dark' ? colors.grey[700] : colors.grey[300]}
                    />
                    <XAxis
                      dataKey="name"
                      angle={-20}
                      textAnchor="end"
                      interval={0}
                      height={60}
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
                    <Legend />
                    <Bar dataKey="direct" name="Direct Jobs" fill={colors.greenAccent[500]} radius={[4, 4, 0, 0]} />
                    <Bar dataKey="indirect" name="Indirect Jobs" fill={colors.blueAccent[500]} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Top Projects by Jobs - Grid View */}
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
                    background: `linear-gradient(135deg, ${colors.greenAccent[600]}, ${colors.greenAccent[400]})`,
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
                    Top 10 Projects by Jobs Created
                  </Typography>
                  <Typography
                    variant="caption"
                    sx={{
                      color: colors.grey[400],
                      fontSize: '0.7rem',
                    }}
                  >
                    Projects with the highest number of jobs created
                  </Typography>
                </Box>
              </Box>
              {loadingProjects ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 200 }}>
                  <Typography variant="body2" sx={{ color: colors.grey[400] }}>
                    Loading projects...
                  </Typography>
                </Box>
              ) : topProjects.length === 0 ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 200 }}>
                  <Typography variant="body2" sx={{ color: colors.grey[400] }}>
                    No projects with jobs found
                  </Typography>
                </Box>
              ) : (
                <TableContainer
                  sx={{
                    width: '100%',
                    maxHeight: 360,
                    border: 0,
                    borderRadius: '8px',
                  }}
                >
                  <Table size="small" stickyHeader sx={{ width: '100%' }}>
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 700, width: 70 }}>Rank</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Project</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700 }}>Jobs Created</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700 }}>Share</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {(() => {
                        const totalJobsAcrossTop = topProjects.reduce((sum, p) => sum + (Number(p.jobsCount) || 0), 0);
                        return topProjects.map((project, index) => {
                          const jobs = Number(project.jobsCount) || 0;
                          const share = totalJobsAcrossTop > 0 ? Math.round((jobs / totalJobsAcrossTop) * 100) : 0;
                          return (
                            <TableRow key={project.id || index} hover>
                              <TableCell>
                                <Chip
                                  label={`#${index + 1}`}
                                  size="small"
                                  sx={{
                                    bgcolor: colors.greenAccent[600],
                                    color: 'white',
                                    fontWeight: 700,
                                    minWidth: 40,
                                  }}
                                />
                              </TableCell>
                              <TableCell sx={{ maxWidth: 420, whiteSpace: 'normal', wordBreak: 'break-word', fontWeight: 600 }}>
                                {project.projectName || project.name || 'Unnamed Project'}
                              </TableCell>
                              <TableCell align="right" sx={{ fontWeight: 700, color: colors.greenAccent[500] }}>
                                {jobs}
                              </TableCell>
                              <TableCell align="right">
                                <Chip
                                  size="small"
                                  label={`${share}%`}
                                  sx={{
                                    bgcolor: colors.blueAccent[600],
                                    color: 'white',
                                    fontWeight: 700,
                                    minWidth: 56,
                                  }}
                                />
                              </TableCell>
                            </TableRow>
                          );
                        });
                      })()}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Jobs by Sector */}
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
                  <LocationOnIcon sx={{ color: 'white', fontSize: 18 }} />
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
                    Jobs by Sector
                  </Typography>
                  <Typography
                    variant="caption"
                    sx={{
                      color: colors.grey[400],
                      fontSize: '0.7rem',
                    }}
                  >
                    Jobs created by sector
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
                    overflowX: 'auto',
                  }}
                >
                  <Table size="small" stickyHeader sx={{ minWidth: 760, width: '100%' }}>
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 700, minWidth: 220 }}>Sector</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700, minWidth: 120 }}>Direct Jobs</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700, minWidth: 120 }}>Indirect Jobs</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700, minWidth: 100 }}>Total</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700, minWidth: 90 }}>Share</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {(() => {
                        const rows = [...(chartData.sectorChart || [])].sort((a, b) => (b.total || 0) - (a.total || 0));
                        const totalJobs = rows.reduce((sum, row) => sum + (row.total || 0), 0);
                        return rows.map((row) => {
                          const share = totalJobs > 0 ? Math.round(((row.total || 0) / totalJobs) * 100) : 0;
                          return (
                            <TableRow key={row.sector || row.sectorDisplay} hover>
                              <TableCell sx={{ fontWeight: 600, color: theme.palette.mode === 'dark' ? colors.grey[100] : '#1f2937' }}>
                                {row.sectorDisplay || row.sector || 'Unknown'}
                              </TableCell>
                              <TableCell align="right" sx={{ color: theme.palette.mode === 'dark' ? colors.greenAccent[400] : colors.greenAccent[700], fontWeight: 700 }}>
                                {row.direct || 0}
                              </TableCell>
                              <TableCell align="right" sx={{ color: theme.palette.mode === 'dark' ? colors.blueAccent[300] : colors.blueAccent[700], fontWeight: 700 }}>
                                {row.indirect || 0}
                              </TableCell>
                              <TableCell align="right" sx={{ fontWeight: 700, color: theme.palette.mode === 'dark' ? colors.grey[100] : '#1f2937' }}>
                                {row.total || 0}
                              </TableCell>
                              <TableCell align="right">
                                <Chip
                                  size="small"
                                  label={`${share}%`}
                                  sx={{
                                    bgcolor: colors.blueAccent[600],
                                    color: 'white',
                                    fontWeight: 700,
                                    minWidth: 56,
                                  }}
                                />
                              </TableCell>
                            </TableRow>
                          );
                        });
                      })()}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
};

export default JobsImpactDashboardPage;
