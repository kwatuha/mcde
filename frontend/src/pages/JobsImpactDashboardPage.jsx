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
  LineChart,
  Line,
} from 'recharts';
import { tokens } from './dashboard/theme';
import { useNavigate } from 'react-router-dom';
import sectorsService from '../api/sectorsService';
import projectService from '../api/projectService';

// Sample jobs data aligned with Direct/Indirect structure
const SAMPLE_JOBS_SUMMARY = {
  totalJobs: 186,
  totalMale: 104,
  totalFemale: 56,
  totalDirectJobs: 142,
  totalIndirectJobs: 44,
};

const SAMPLE_JOBS_BY_CATEGORY = [
  { category_name: 'Skilled Labour', jobs_count: 72, direct: 58, indirect: 14, male: 42, female: 30 },
  { category_name: 'Unskilled Labour', jobs_count: 86, direct: 64, indirect: 22, male: 48, female: 38 },
  { category_name: 'Supervisory / Technical', jobs_count: 28, direct: 20, indirect: 8, male: 14, female: 14 },
];

// Sample jobs by project
const SAMPLE_JOBS_BY_PROJECT = [
  { project: 'Level 4 Hospital Upgrade', direct: 45, indirect: 12, total: 57 },
  { project: 'Road Tarmacking', direct: 38, indirect: 15, total: 53 },
  { project: 'Rural Water Pan Program', direct: 32, indirect: 8, total: 40 },
  { project: 'Market Sheds Construction', direct: 18, indirect: 6, total: 24 },
  { project: 'ECDE Classrooms', direct: 9, indirect: 3, total: 12 },
];

// Sample jobs by sector
const SAMPLE_JOBS_BY_SECTOR = [
  { sector: 'Health', sectorDisplay: 'Health', direct: 45, indirect: 12, total: 57 },
  { sector: 'Infrastructure', sectorDisplay: 'Infrastructure', direct: 38, indirect: 15, total: 53 },
  { sector: 'Water', sectorDisplay: 'Water', direct: 32, indirect: 8, total: 40 },
  { sector: 'Trade', sectorDisplay: 'Trade', direct: 18, indirect: 6, total: 24 },
  { sector: 'Education', sectorDisplay: 'Education', direct: 9, indirect: 3, total: 12 },
  { sector: 'Agriculture', sectorDisplay: 'Agriculture', direct: 15, indirect: 3, total: 18 },
];

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
  const [topProjects, setTopProjects] = useState([]);
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
    const fetchTopProjects = async () => {
      setLoadingProjects(true);
      try {
        const projects = await projectService.projects.getProjects({});
        // Sort by jobsCount (descending) and take top 10
        const sortedProjects = (projects || [])
          .filter(p => p.jobsCount > 0)
          .sort((a, b) => (b.jobsCount || 0) - (a.jobsCount || 0))
          .slice(0, 10);
        setTopProjects(sortedProjects);
      } catch (error) {
        console.error('Error fetching top projects:', error);
        // Fallback to sample data if API fails
        setTopProjects(SAMPLE_JOBS_BY_PROJECT.map(p => ({
          projectName: p.project,
          jobsCount: p.total,
        })).slice(0, 10));
      } finally {
        setLoadingProjects(false);
      }
    };
    fetchTopProjects();
  }, []);

  const chartData = useMemo(() => {
    // Direct vs Indirect comparison
    const directIndirectData = [
      { name: 'Direct Jobs', value: SAMPLE_JOBS_SUMMARY.totalDirectJobs, color: colors.greenAccent[500] },
      { name: 'Indirect Jobs', value: SAMPLE_JOBS_SUMMARY.totalIndirectJobs, color: colors.blueAccent[500] },
    ];

    // Gender distribution
    const genderData = [
      { name: 'Male', value: SAMPLE_JOBS_SUMMARY.totalMale, color: colors.blueAccent[500] },
      { name: 'Female', value: SAMPLE_JOBS_SUMMARY.totalFemale, color: colors.purpleAccent ? colors.purpleAccent[500] : colors.greenAccent[600] },
    ];

    // Jobs by category with direct/indirect breakdown
    const categoryChart = SAMPLE_JOBS_BY_CATEGORY.map((j, index) => ({
      name: j.category_name,
      direct: j.direct,
      indirect: j.indirect,
      total: j.jobs_count,
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
    const sectorChart = SAMPLE_JOBS_BY_SECTOR.map((item) => {
      const displayName = sectorAliasMap.get(item.sector) || item.sectorDisplay || item.sector;
      return {
        sector: item.sector,
        sectorDisplay: displayName,
        direct: item.direct,
        indirect: item.indirect,
        total: item.total,
      };
    });

    return {
      directIndirectData,
      genderData,
      categoryChart,
      sectorChart,
    };
  }, [colors, sectors]);

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
              background: `linear-gradient(180deg, ${colors.greenAccent[500]}, ${colors.orange[500]})`,
              borderRadius: 1.5,
              mt: 0.25,
            }}
          />
          <Box sx={{ flex: 1 }}>
            <Typography
              variant="h5"
              sx={{
                fontWeight: 800,
                background: `linear-gradient(135deg, ${colors.greenAccent[500]}, ${colors.orange[500]})`,
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
              borderColor: colors.greenAccent[500],
              color: colors.greenAccent[500],
              fontSize: '0.8rem',
              py: 0.5,
              px: 1.5,
              minWidth: 'auto',
              '&:hover': {
                borderColor: colors.greenAccent[400],
                bgcolor: colors.greenAccent[600] + '20',
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
            border: `1px solid ${theme.palette.mode === 'dark' ? colors.greenAccent[700] : 'rgba(0,0,0,0.08)'}`,
            boxShadow: `0 1px 4px ${colors.greenAccent[500]}10`,
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
              <FilterIcon sx={{ color: colors.greenAccent[500], fontSize: 14 }} />
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
                    bgcolor: colors.greenAccent[600],
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
                  <InputLabel sx={{ fontSize: '0.75rem' }}>Project</InputLabel>
                  <Select
                    value={filters.project}
                    label="Project"
                    onChange={(e) => setFilters({ ...filters, project: e.target.value })}
                    sx={{ fontSize: '0.8rem', height: '32px' }}
                  >
                    <MenuItem value="" sx={{ fontSize: '0.8rem' }}>All Projects</MenuItem>
                    {topProjects.map((p) => (
                      <MenuItem key={p.id || p.projectName} value={p.projectName || p.name || ''} sx={{ fontSize: '0.8rem' }}>
                        {p.projectName || p.name || 'Unnamed Project'}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <FormControl size="small" sx={{ minWidth: 120 }}>
                  <InputLabel sx={{ fontSize: '0.75rem' }}>Sector</InputLabel>
                  <Select
                    value={filters.sector || ''}
                    label="Sector"
                    onChange={(e) => setFilters({ ...filters, sector: e.target.value })}
                    sx={{ fontSize: '0.8rem', height: '32px' }}
                  >
                    <MenuItem value="" sx={{ fontSize: '0.8rem' }}>All Sectors</MenuItem>
                    {SAMPLE_JOBS_BY_SECTOR.map((s) => (
                      <MenuItem key={s.sector} value={s.sector} sx={{ fontSize: '0.8rem' }}>
                        {s.sectorDisplay}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <FormControl size="small" sx={{ minWidth: 140 }}>
                  <InputLabel sx={{ fontSize: '0.75rem' }}>Category</InputLabel>
                  <Select
                    value={filters.category}
                    label="Category"
                    onChange={(e) => setFilters({ ...filters, category: e.target.value })}
                    sx={{ fontSize: '0.8rem', height: '32px' }}
                  >
                    <MenuItem value="" sx={{ fontSize: '0.8rem' }}>All Categories</MenuItem>
                    {SAMPLE_JOBS_BY_CATEGORY.map((c) => (
                      <MenuItem key={c.category_name} value={c.category_name} sx={{ fontSize: '0.8rem' }}>
                        {c.category_name}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Box>
            </CardContent>
          </Collapse>
        </Card>
      </Box>

      {/* Summary KPIs */}
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
                  Total Jobs
                </Typography>
                <Box
                  sx={{
                    p: 0.75,
                    borderRadius: 1.5,
                    background: `linear-gradient(135deg, ${colors.blueAccent[600]}, ${colors.blueAccent[400]})`,
                    boxShadow: `0 2px 8px ${colors.blueAccent[700]}40`,
                  }}
                >
                  <WorkIcon sx={{ color: 'white', fontSize: 18 }} />
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
                {SAMPLE_JOBS_SUMMARY.totalJobs}
              </Typography>
              <Typography
                variant="caption"
                sx={{
                  color: colors.grey[400],
                  fontSize: '0.7rem',
                }}
              >
                Created across all projects
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
                  Direct Jobs
                </Typography>
                <Box
                  sx={{
                    p: 0.75,
                    borderRadius: 1.5,
                    background: `linear-gradient(135deg, ${colors.blueAccent[600]}, ${colors.blueAccent[400]})`,
                    boxShadow: `0 2px 8px ${colors.blueAccent[700]}40`,
                  }}
                >
                  <PeopleIcon sx={{ color: 'white', fontSize: 18 }} />
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
                {SAMPLE_JOBS_SUMMARY.totalDirectJobs}
              </Typography>
              <Typography
                variant="caption"
                sx={{
                  color: colors.grey[400],
                  fontSize: '0.7rem',
                }}
              >
                {Math.round((SAMPLE_JOBS_SUMMARY.totalDirectJobs / SAMPLE_JOBS_SUMMARY.totalJobs) * 100)}% of total
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
                  Indirect Jobs
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
                  mb: 0.25,
                  fontSize: { xs: '1.25rem', md: '1.5rem' },
                  lineHeight: 1.2,
                }}
              >
                {SAMPLE_JOBS_SUMMARY.totalIndirectJobs}
              </Typography>
              <Typography
                variant="caption"
                sx={{
                  color: colors.grey[400],
                  fontSize: '0.7rem',
                }}
              >
                {Math.round((SAMPLE_JOBS_SUMMARY.totalIndirectJobs / SAMPLE_JOBS_SUMMARY.totalJobs) * 100)}% of total
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
                  Gender Ratio
                </Typography>
                <Box
                  sx={{
                    p: 0.75,
                    borderRadius: 1.5,
                    background: `linear-gradient(135deg, ${colors.blueAccent[600]}, ${colors.blueAccent[400]})`,
                    boxShadow: `0 2px 8px ${colors.blueAccent[700]}40`,
                  }}
                >
                  <GroupIcon sx={{ color: 'white', fontSize: 18 }} />
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
                {Math.round((SAMPLE_JOBS_SUMMARY.totalFemale / SAMPLE_JOBS_SUMMARY.totalJobs) * 100)}% Female
              </Typography>
              <Typography
                variant="caption"
                sx={{
                  color: colors.grey[400],
                  fontSize: '0.7rem',
                }}
              >
                {SAMPLE_JOBS_SUMMARY.totalMale}M : {SAMPLE_JOBS_SUMMARY.totalFemale}F
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Charts Grid */}
      <Grid container spacing={1.5}>
        {/* Direct vs Indirect */}
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
            <CardContent sx={{ p: 2 }}>
              <Box display="flex" alignItems="center" gap={1} mb={1.5}>
                <Box
                  sx={{
                    p: 0.75,
                    borderRadius: 1.5,
                    background: `linear-gradient(135deg, ${colors.greenAccent[600]}, ${colors.blueAccent[500]})`,
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
              <Box sx={{ height: 280, mt: 0.5 }}>
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

        {/* Gender Distribution */}
        <Grid item xs={12} md={6}>
          <Card
            sx={{
              borderRadius: '8px',
              background: theme.palette.mode === 'dark'
                ? `linear-gradient(135deg, ${colors.primary[400]} 0%, ${colors.primary[500]} 100%)`
                : 'linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%)',
              border: `1px solid ${theme.palette.mode === 'dark' ? (colors.purpleAccent?.[700] || colors.blueAccent[700]) : 'rgba(0,0,0,0.08)'}`,
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
                    background: `linear-gradient(135deg, ${colors.blueAccent[600]}, ${colors.purpleAccent ? colors.purpleAccent[500] : colors.greenAccent[600]})`,
                  }}
                >
                  <GroupIcon sx={{ color: 'white', fontSize: 20 }} />
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
                    Gender Distribution
                  </Typography>
                  <Typography
                    variant="caption"
                    sx={{
                      color: colors.grey[400],
                      fontSize: '0.75rem',
                    }}
                  >
                    Male vs Female employment
                  </Typography>
                </Box>
              </Box>
              <Box sx={{ height: 300, mt: 1 }}>
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
        </Grid>

        {/* Jobs by Category with Direct/Indirect */}
        <Grid item xs={12} md={6}>
          <Card
            sx={{
              borderRadius: '8px',
              background: theme.palette.mode === 'dark'
                ? `linear-gradient(135deg, ${colors.primary[400]} 0%, ${colors.primary[500]} 100%)`
                : 'linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%)',
              border: `1px solid ${theme.palette.mode === 'dark' ? colors.orange[700] : 'rgba(0,0,0,0.08)'}`,
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
                    background: `linear-gradient(135deg, ${colors.orange[600]}, ${colors.orange[400]})`,
                  }}
                >
                  <WorkIcon sx={{ color: 'white', fontSize: 20 }} />
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
                    Jobs by Category
                  </Typography>
                  <Typography
                    variant="caption"
                    sx={{
                      color: colors.grey[400],
                      fontSize: '0.75rem',
                    }}
                  >
                    Direct and indirect breakdown by category
                  </Typography>
                </Box>
              </Box>
              <Box sx={{ height: 300, mt: 1 }}>
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
                        border: `1px solid ${colors.orange[700]}`,
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
        <Grid item xs={12}>
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
                    Top 10 Projects by Jobs Created
                  </Typography>
                  <Typography
                    variant="caption"
                    sx={{
                      color: colors.grey[400],
                      fontSize: '0.75rem',
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
                    maxHeight: 360,
                    border: `1px solid ${theme.palette.mode === 'dark' ? colors.grey[700] : colors.grey[300]}`,
                    borderRadius: '8px',
                  }}
                >
                  <Table size="small" stickyHeader>
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

        {/* Jobs by Ward */}
        <Grid item xs={12}>
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
                  <LocationOnIcon sx={{ color: 'white', fontSize: 20 }} />
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
                    Jobs by Sector
                  </Typography>
                  <Typography
                    variant="caption"
                    sx={{
                      color: colors.grey[400],
                      fontSize: '0.75rem',
                    }}
                  >
                    Jobs created by sector
                  </Typography>
                </Box>
              </Box>
              <Box sx={{ mt: 1 }}>
                <TableContainer
                  sx={{
                    maxHeight: 320,
                    border: `1px solid ${theme.palette.mode === 'dark' ? colors.grey[700] : colors.grey[300]}`,
                    borderRadius: '8px',
                    overflowX: 'auto',
                  }}
                >
                  <Table size="small" stickyHeader sx={{ minWidth: 760 }}>
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
