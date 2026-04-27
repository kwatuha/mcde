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
  Alert,
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
import { normalizeProjectStatus } from '../utils/projectStatusNormalizer';
import {
  buildSectorCanonicalLookup,
  buildSectorDisplayMap,
  labelForSectorRegistryBucket,
  rawRegistrySectorFromProject,
  sectorRegistryBucketKey,
} from '../utils/organizationChartLabels';
import { ROUTES } from '../configs/appConfig';
import { useAuth } from '../context/AuthContext.jsx';
import { isSuperAdminUser } from '../utils/roleUtils';

const STATUS_COLORS = {
  'Completed': '#16a34a',
  'In Progress': '#2563eb',
  'Ongoing': '#2563eb',
  'Not Started': '#9ca3af',
  'Delayed': '#f97316',
  'Stalled': '#f59e0b',
  'Under Procurement': '#9c27b0',
  'Suspended': '#dc2626',
  'Other': '#14b8a6',
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
  'Other': AssessmentIcon,
};

const formatCurrency = (value) =>
  `KES ${((Number(value) || 0) / 1_000_000).toLocaleString('en-KE', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}M`;

const STATUS_COUNT_UP_MS = 500;

/** Animates displayed integer from 0 to `endValue` over `durationMs` when `endValue` changes. */
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

const ProjectByStatusDashboardPage = () => {
  const theme = useTheme();
  const colors = tokens(theme.palette.mode);
  const navigate = useNavigate();
  const { user } = useAuth();
  const [filters, setFilters] = useState({
    ministry: '',
    stateDepartment: '',
    agency: '',
    status: '',
  });
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [sectors, setSectors] = useState([]);
  const [allProjects, setAllProjects] = useState([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [projectsError, setProjectsError] = useState('');

  useEffect(() => {
    const loadSectors = async () => {
      try {
        const sectorRows = await sectorsService.getAllSectors();
        setSectors(sectorRows || []);
      } catch (error) {
        console.error('Error fetching sectors:', error);
      }
    };
    loadSectors();
  }, []);

  useEffect(() => {
    const fetchProjects = async () => {
      try {
        setLoadingProjects(true);
        setProjectsError('');
        const data = await projectService.analytics.getProjectsForOrganization({ limit: 5000 });
        const rows = Array.isArray(data) ? data : [];
        const normalized = rows.map((p) => ({
          ...p,
          projectName: p.projectName || p.project_name || 'Untitled Project',
          status: p.status || p.Status || 'Unknown',
          ministry: String(p.ministry ?? p.ministryName ?? p.departmentName ?? p.department ?? '').trim(),
          stateDepartment: String(p.stateDepartment ?? p.state_department ?? p.stateDepartmentName ?? '').trim(),
          agency: String(
            p.agency ?? p.agencyName ?? p.implementingAgency ?? p.implementing_agency ?? p.directorate ?? p.directorateName ?? ''
          ).trim(),
          financialYear: p.financialYear || p.financialYearName || '',
          budget: Number(p.budget ?? p.costOfProject ?? p.allocatedBudget ?? 0),
          Disbursed: Number(p.Disbursed ?? p.paidOut ?? p.disbursedBudget ?? 0),
        }));
        setAllProjects(normalized);
      } catch (error) {
        console.error('Error fetching projects for status dashboard:', error);
        setProjectsError(error?.response?.data?.message || error?.message || 'Failed to load projects from database.');
        setAllProjects([]);
      } finally {
        setLoadingProjects(false);
      }
    };
    fetchProjects();
  }, []);

  const orgScopeMeta = useMemo(() => {
    const scopes = Array.isArray(user?.organizationScopes) ? user.organizationScopes : [];
    const normalized = scopes
      .map((s) => ({
        scopeType: String(s?.scopeType || s?.scope_type || '').trim().toUpperCase(),
        ministry: String(s?.ministry || '').trim(),
        stateDepartment: String(s?.stateDepartment || s?.state_department || '').trim(),
      }))
      .filter((s) => s.scopeType);
    const superAdmin = isSuperAdminUser(user);
    const hasAllMinistriesScope = superAdmin || normalized.some((s) => s.scopeType === 'ALL_MINISTRIES');
    const ministryScopes = normalized.filter((s) => s.scopeType === 'MINISTRY_ALL' && s.ministry);
    const stateDeptScopes = normalized.filter((s) => s.scopeType === 'STATE_DEPARTMENT_ALL' && s.ministry && s.stateDepartment);
    if (hasAllMinistriesScope) return { level: 'all', allowedMinistries: null, allowedPairs: null };
    if (ministryScopes.length > 0) {
      return {
        level: 'ministry',
        allowedMinistries: new Set(ministryScopes.map((s) => s.ministry.toLowerCase())),
        allowedPairs: null,
      };
    }
    if (stateDeptScopes.length > 0) {
      return {
        level: 'state_department',
        allowedMinistries: null,
        allowedPairs: new Set(
          stateDeptScopes.map((s) => `${s.ministry.toLowerCase()}|${s.stateDepartment.toLowerCase()}`)
        ),
      };
    }
    return { level: 'all', allowedMinistries: null, allowedPairs: null };
  }, [user]);

  const scopeBaseProjects = useMemo(() => {
    if (orgScopeMeta.level === 'ministry') {
      return allProjects.filter((p) =>
        orgScopeMeta.allowedMinistries.has(String(p.ministry || '').trim().toLowerCase())
      );
    }
    if (orgScopeMeta.level === 'state_department') {
      return allProjects.filter((p) => {
        const k = `${String(p.ministry || '').trim().toLowerCase()}|${String(p.stateDepartment || '').trim().toLowerCase()}`;
        return orgScopeMeta.allowedPairs.has(k);
      });
    }
    return allProjects;
  }, [allProjects, orgScopeMeta]);

  const filteredProjects = useMemo(() => {
    return scopeBaseProjects.filter((p) => {
      if (filters.ministry && p.ministry !== filters.ministry) return false;
      if (filters.stateDepartment && p.stateDepartment !== filters.stateDepartment) return false;
      if (filters.agency && p.agency !== filters.agency) return false;
      if (filters.status) {
        const normalized = normalizeProjectStatus(p.Status || p.status || 'Unknown');
        if (normalized !== filters.status) return false;
      }
      return true;
    });
  }, [scopeBaseProjects, filters]);

  const showMinistryFilter = orgScopeMeta.level === 'all';
  const showStateDepartmentFilter = orgScopeMeta.level === 'all' || orgScopeMeta.level === 'ministry';
  const uniqueMinistries = Array.from(new Set(scopeBaseProjects.map((p) => p.ministry))).filter(Boolean);
  const uniqueStateDepartments = Array.from(
    new Set(
      scopeBaseProjects
        .filter((p) => !filters.ministry || p.ministry === filters.ministry)
        .map((p) => p.stateDepartment)
    )
  ).filter(Boolean);
  const uniqueAgencies = Array.from(
    new Set(
      scopeBaseProjects
        .filter((p) => !filters.ministry || p.ministry === filters.ministry)
        .filter((p) => !filters.stateDepartment || p.stateDepartment === filters.stateDepartment)
        .map((p) => p.agency)
    )
  ).filter(Boolean);

  useEffect(() => {
    setFilters((prev) => {
      const next = { ...prev };
      if (!showMinistryFilter) next.ministry = '';
      if (!showStateDepartmentFilter) next.stateDepartment = '';
      if (showStateDepartmentFilter && next.stateDepartment && !uniqueStateDepartments.includes(next.stateDepartment)) {
        next.stateDepartment = '';
      }
      if (next.agency && !uniqueAgencies.includes(next.agency)) {
        next.agency = '';
      }
      const unchanged =
        next.ministry === prev.ministry &&
        next.stateDepartment === prev.stateDepartment &&
        next.agency === prev.agency &&
        next.status === prev.status;
      return unchanged ? prev : next;
    });
  }, [showMinistryFilter, showStateDepartmentFilter, uniqueStateDepartments, uniqueAgencies]);

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

    const sectorDisplayMap = buildSectorDisplayMap(sectors);
    const sectorCanonicalLookup = buildSectorCanonicalLookup(sectors);

    // Status by Sector — only `sector` from the project; must match Sectors Management (case-insensitive) or bucketed
    const statusBySector = new Map();
    filteredProjects.forEach((p) => {
      const bucketKey = sectorRegistryBucketKey(rawRegistrySectorFromProject(p), sectorCanonicalLookup);
      const status = normalizeProjectStatus(p.Status || p.status || 'Unknown');
      const key = `${bucketKey}|${status}`;
      const current = statusBySector.get(key) || { sector: bucketKey, status, count: 0 };
      current.count += 1;
      statusBySector.set(key, current);
    });

    const sectorStatusChart = Array.from(statusBySector.values())
      .reduce((acc, item) => {
        const displayName = labelForSectorRegistryBucket(item.sector, sectorDisplayMap);
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

  // Use normalized statuses to avoid duplicates like "In Progress" and "Ongoing"
  const uniqueStatuses = Array.from(
    new Set(scopeBaseProjects.map((p) => normalizeProjectStatus(p.Status || p.status || 'Unknown')))
  ).filter(Boolean);

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
    } else if (statusLower.includes('other')) {
      return isLight
        ? 'linear-gradient(135deg, #14b8a6 0%, #2dd4bf 100%)'
        : `linear-gradient(135deg, ${colors.greenAccent[800]}, ${colors.greenAccent[700]})`;
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
    } else if (statusLower.includes('other')) {
      return isLight ? '#0f766e' : colors.greenAccent[500];
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

  const countCompleted = useCountUp(statusStats['Completed'] || 0);
  const countOngoing = useCountUp(statusStats['Ongoing'] || 0);
  const countNotStarted = useCountUp(statusStats['Not started'] || 0);
  const countStalled = useCountUp(statusStats['Stalled'] || 0);
  const countUnderProcurement = useCountUp(statusStats['Under Procurement'] || 0);
  const countSuspended = useCountUp(statusStats['Suspended'] || 0);

  // Handler to open Registry of Projects with the selected KPI status.
  const handleStatusClick = (status) => {
    const params = new URLSearchParams();
    params.set('status', status);
    navigate(`${ROUTES.PROJECTS}?${params.toString()}`);
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
          <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', alignItems: 'center' }}>
            <Chip
              label="By sector"
              size="small"
              onClick={() => navigate(ROUTES.PROJECT_BY_SECTOR_DASHBOARD)}
              sx={{ bgcolor: colors.purple[600], color: 'white', fontWeight: 600, cursor: 'pointer' }}
            />
            <Chip
              label="Summary"
              size="small"
              onClick={() => navigate(ROUTES.SYSTEM_DASHBOARD)}
              sx={{ bgcolor: colors.greenAccent[700], color: 'white', fontWeight: 600, cursor: 'pointer' }}
            />
            <Chip
              label="Finance"
              size="small"
              onClick={() => navigate(ROUTES.FINANCE_DASHBOARD)}
              sx={{ bgcolor: colors.blueAccent[600], color: 'white', fontWeight: 600, cursor: 'pointer' }}
            />
          </Box>
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
                {showMinistryFilter && (
                  <FormControl size="small" sx={{ flex: 1, minWidth: 140 }}>
                    <InputLabel sx={{ fontSize: '0.75rem' }}>Ministry</InputLabel>
                    <Select
                      value={filters.ministry}
                      label="Ministry"
                      onChange={(e) => setFilters({ ...filters, ministry: e.target.value, stateDepartment: '', agency: '' })}
                      sx={{ fontSize: '0.8rem', height: '32px' }}
                    >
                      <MenuItem value="" sx={{ fontSize: '0.8rem' }}>All Ministries</MenuItem>
                      {uniqueMinistries.map((m) => (
                        <MenuItem key={m} value={m} sx={{ fontSize: '0.8rem' }}>
                          {m}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                )}
                {showStateDepartmentFilter && (
                  <FormControl size="small" sx={{ flex: 1, minWidth: 140 }}>
                    <InputLabel sx={{ fontSize: '0.75rem' }}>State Department</InputLabel>
                    <Select
                      value={filters.stateDepartment}
                      label="State Department"
                      onChange={(e) => setFilters({ ...filters, stateDepartment: e.target.value, agency: '' })}
                      sx={{ fontSize: '0.8rem', height: '32px' }}
                    >
                      <MenuItem value="" sx={{ fontSize: '0.8rem' }}>All State Departments</MenuItem>
                      {uniqueStateDepartments.map((d) => (
                        <MenuItem key={d} value={d} sx={{ fontSize: '0.8rem' }}>
                          {d}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                )}
                <FormControl size="small" sx={{ flex: 1, minWidth: 140 }}>
                  <InputLabel sx={{ fontSize: '0.75rem' }}>Agency</InputLabel>
                  <Select
                    value={filters.agency}
                    label="Agency"
                    onChange={(e) => setFilters({ ...filters, agency: e.target.value })}
                    sx={{ fontSize: '0.8rem', height: '32px' }}
                  >
                    <MenuItem value="" sx={{ fontSize: '0.8rem' }}>All Agencies</MenuItem>
                    {uniqueAgencies.map((a) => (
                      <MenuItem key={a} value={a} sx={{ fontSize: '0.8rem' }}>
                        {a}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <FormControl size="small" sx={{ flex: 1, minWidth: 140 }}>
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
            <Grid item sx={{ minWidth: { xs: '110px', sm: '130px', md: '145px' }, flex: '1 1 0', maxWidth: { md: 'none' } }}>
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
                    transform: 'translateY(-2px)',
                    boxShadow: isLight ? '0 4px 12px rgba(76, 175, 80, 0.3)' : '0 4px 16px rgba(0, 0, 0, 0.25)',
                  }
                }}
              >
                <CardContent sx={{ p: 0.75, '&:last-child': { pb: 0.75 }, pt: 0.75 }}>
                  <Box display="flex" alignItems="center" gap={0.75}>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="caption" sx={{ color: isLight ? 'rgba(255, 255, 255, 0.9)' : colors.grey[100], fontWeight: 600, fontSize: '0.65rem', display: 'block' }}>
                        Completed
                      </Typography>
                      <Typography variant="h5" sx={{ color: isLight ? '#ffffff' : '#fff', fontWeight: 800, fontSize: '2rem', mb: 0, lineHeight: 1.15 }}>
                        {countCompleted}
                      </Typography>
                      <Typography variant="caption" component="div" sx={{ color: isLight ? 'rgba(255, 255, 255, 0.9)' : colors.grey[300], fontWeight: 600, fontSize: '1.1rem', mt: 0.125, lineHeight: 1.2 }}>
                        {statusStats.totalProjects > 0 
                          ? Math.round((countCompleted / statusStats.totalProjects) * 100) 
                          : 0}%
                      </Typography>
                    </Box>
                    <CheckCircleIcon sx={{ color: isLight ? 'rgba(255, 255, 255, 0.9)' : colors.greenAccent[500], fontSize: '2rem', flexShrink: 0 }} />
                  </Box>
                </CardContent>
              </Card>
            </Grid>

            {/* Ongoing */}
            <Grid item sx={{ minWidth: { xs: '110px', sm: '130px', md: '145px' }, flex: '1 1 0', maxWidth: { md: 'none' } }}>
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
                    transform: 'translateY(-2px)',
                    boxShadow: isLight ? '0 4px 12px rgba(33, 150, 243, 0.3)' : '0 4px 16px rgba(0, 0, 0, 0.25)',
                  }
                }}
              >
                <CardContent sx={{ p: 0.75, '&:last-child': { pb: 0.75 }, pt: 0.75 }}>
                  <Box display="flex" alignItems="center" gap={0.75}>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="caption" sx={{ color: isLight ? 'rgba(255, 255, 255, 0.9)' : colors.grey[100], fontWeight: 600, fontSize: '0.65rem', display: 'block' }}>
                        Ongoing
                      </Typography>
                      <Typography variant="h5" sx={{ color: isLight ? '#ffffff' : '#fff', fontWeight: 800, fontSize: '2rem', mb: 0, lineHeight: 1.15 }}>
                        {countOngoing}
                      </Typography>
                      <Typography variant="caption" component="div" sx={{ color: isLight ? 'rgba(255, 255, 255, 0.9)' : colors.grey[300], fontWeight: 600, fontSize: '1.1rem', mt: 0.125, lineHeight: 1.2 }}>
                        {statusStats.totalProjects > 0 
                          ? Math.round((countOngoing / statusStats.totalProjects) * 100) 
                          : 0}%
                      </Typography>
                    </Box>
                    <PlayArrowIcon sx={{ color: isLight ? 'rgba(255, 255, 255, 0.9)' : colors.blueAccent[500], fontSize: '2rem', flexShrink: 0 }} />
                  </Box>
                </CardContent>
              </Card>
            </Grid>

            {/* Not started */}
            <Grid item sx={{ minWidth: { xs: '110px', sm: '130px', md: '145px' }, flex: '1 1 0', maxWidth: { md: 'none' } }}>
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
                    transform: 'translateY(-2px)',
                    boxShadow: isLight ? '0 4px 12px rgba(158, 158, 158, 0.3)' : '0 4px 16px rgba(0, 0, 0, 0.25)',
                  }
                }}
              >
                <CardContent sx={{ p: 0.75, '&:last-child': { pb: 0.75 }, pt: 0.75 }}>
                  <Box display="flex" alignItems="center" gap={0.75}>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="caption" sx={{ color: isLight ? 'rgba(255, 255, 255, 0.9)' : colors.grey[100], fontWeight: 600, fontSize: '0.65rem', display: 'block' }}>
                        Not Started
                      </Typography>
                      <Typography variant="h5" sx={{ color: isLight ? '#ffffff' : '#fff', fontWeight: 800, fontSize: '2rem', mb: 0, lineHeight: 1.15 }}>
                        {countNotStarted}
                      </Typography>
                      <Typography variant="caption" component="div" sx={{ color: isLight ? 'rgba(255, 255, 255, 0.9)' : colors.grey[300], fontWeight: 600, fontSize: '1.1rem', mt: 0.125, lineHeight: 1.2 }}>
                        {statusStats.totalProjects > 0 
                          ? Math.round((countNotStarted / statusStats.totalProjects) * 100) 
                          : 0}%
                      </Typography>
                    </Box>
                    <ScheduleIcon sx={{ color: isLight ? 'rgba(255, 255, 255, 0.9)' : colors.grey[400], fontSize: '2rem', flexShrink: 0 }} />
                  </Box>
                </CardContent>
              </Card>
            </Grid>

            {/* Stalled */}
            <Grid item sx={{ minWidth: { xs: '110px', sm: '130px', md: '145px' }, flex: '1 1 0', maxWidth: { md: 'none' } }}>
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
                    transform: 'translateY(-2px)',
                    boxShadow: isLight ? '0 4px 12px rgba(255, 152, 0, 0.3)' : '0 4px 16px rgba(0, 0, 0, 0.25)',
                  }
                }}
              >
                <CardContent sx={{ p: 0.75, '&:last-child': { pb: 0.75 }, pt: 0.75 }}>
                  <Box display="flex" alignItems="center" gap={0.75}>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="caption" sx={{ color: isLight ? 'rgba(255, 255, 255, 0.9)' : colors.grey[100], fontWeight: 600, fontSize: '0.65rem', display: 'block' }}>
                        Stalled
                      </Typography>
                      <Typography variant="h5" sx={{ color: isLight ? '#ffffff' : '#fff', fontWeight: 800, fontSize: '2rem', mb: 0, lineHeight: 1.15 }}>
                        {countStalled}
                      </Typography>
                      <Typography variant="caption" component="div" sx={{ color: isLight ? 'rgba(255, 255, 255, 0.9)' : colors.grey[300], fontWeight: 600, fontSize: '1.1rem', mt: 0.125, lineHeight: 1.2 }}>
                        {statusStats.totalProjects > 0 
                          ? Math.round((countStalled / statusStats.totalProjects) * 100) 
                          : 0}%
                      </Typography>
                    </Box>
                    <PauseIcon sx={{ color: isLight ? 'rgba(255, 255, 255, 0.9)' : colors.yellowAccent[400], fontSize: '2rem', flexShrink: 0 }} />
                  </Box>
                </CardContent>
              </Card>
            </Grid>

            {/* Under Procurement */}
            {statusStats['Under Procurement'] > 0 && (
              <Grid item sx={{ minWidth: { xs: '110px', sm: '130px', md: '145px' }, flex: '1 1 0', maxWidth: { md: 'none' } }}>
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
                      transform: 'translateY(-2px)',
                      boxShadow: isLight ? '0 4px 12px rgba(156, 39, 176, 0.3)' : '0 4px 16px rgba(0, 0, 0, 0.25)',
                    }
                  }}
                >
                  <CardContent sx={{ p: 0.75, '&:last-child': { pb: 0.75 }, pt: 0.75 }}>
                    <Box display="flex" alignItems="center" gap={0.75}>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography variant="caption" sx={{ color: isLight ? 'rgba(255, 255, 255, 0.9)' : colors.grey[100], fontWeight: 600, fontSize: '0.65rem', display: 'block' }}>
                          Under Procurement
                        </Typography>
                        <Typography variant="h5" sx={{ color: isLight ? '#ffffff' : '#fff', fontWeight: 800, fontSize: '2rem', mb: 0, lineHeight: 1.15 }}>
                          {countUnderProcurement}
                        </Typography>
                        <Typography variant="caption" component="div" sx={{ color: isLight ? 'rgba(255, 255, 255, 0.9)' : colors.grey[300], fontWeight: 600, fontSize: '1.1rem', mt: 0.125, lineHeight: 1.2 }}>
                          {statusStats.totalProjects > 0 
                            ? Math.round((countUnderProcurement / statusStats.totalProjects) * 100) 
                            : 0}%
                        </Typography>
                      </Box>
                      <HourglassIcon sx={{ color: isLight ? 'rgba(255, 255, 255, 0.9)' : colors.blueAccent[400], fontSize: '2rem', flexShrink: 0 }} />
                    </Box>
                  </CardContent>
                </Card>
              </Grid>
            )}

            {/* Suspended */}
            {statusStats['Suspended'] > 0 && (
              <Grid item sx={{ minWidth: { xs: '110px', sm: '130px', md: '145px' }, flex: '1 1 0', maxWidth: { md: 'none' } }}>
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
                      transform: 'translateY(-2px)',
                      boxShadow: isLight ? '0 4px 12px rgba(244, 67, 54, 0.3)' : '0 4px 16px rgba(0, 0, 0, 0.25)',
                    }
                  }}
                >
                  <CardContent sx={{ p: 0.75, '&:last-child': { pb: 0.75 }, pt: 0.75 }}>
                    <Box display="flex" alignItems="center" gap={0.75}>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography variant="caption" sx={{ color: isLight ? 'rgba(255, 255, 255, 0.9)' : colors.grey[100], fontWeight: 600, fontSize: '0.65rem', display: 'block' }}>
                          Suspended
                        </Typography>
                        <Typography variant="h5" sx={{ color: isLight ? '#ffffff' : '#fff', fontWeight: 800, fontSize: '2rem', mb: 0, lineHeight: 1.15 }}>
                          {countSuspended}
                        </Typography>
                        <Typography variant="caption" component="div" sx={{ color: isLight ? 'rgba(255, 255, 255, 0.9)' : colors.grey[300], fontWeight: 600, fontSize: '1.1rem', mt: 0.125, lineHeight: 1.2 }}>
                          {statusStats.totalProjects > 0 
                            ? Math.round((countSuspended / statusStats.totalProjects) * 100) 
                            : 0}%
                        </Typography>
                      </Box>
                      <PauseIcon sx={{ color: isLight ? 'rgba(255, 255, 255, 0.9)' : colors.redAccent[400], fontSize: '2rem', flexShrink: 0 }} />
                    </Box>
                  </CardContent>
                </Card>
              </Grid>
            )}
          </Grid>
        </Box>
      </Box>

      {loadingProjects && (
        <Box sx={{ mb: 2 }}>
          <LinearProgress />
        </Box>
      )}

      {!loadingProjects && projectsError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {projectsError}
        </Alert>
      )}

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
            <CardContent sx={{ p: 1.5, pb: 0.5, border: 0, outline: 0, boxShadow: 'none', '&:last-child': { pb: 0.5 } }}>
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
      <Box sx={{ width: '100%', mt: '1.5rem' }}>
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
                <Box sx={{ p: 0.75, borderRadius: 1.5, background: `linear-gradient(135deg, ${colors.blueAccent[600]}, ${colors.blueAccent[400]})` }}>
                  <AssessmentIcon sx={{ color: 'white', fontSize: 18 }} />
                </Box>
                <Box>
                  <Typography variant="subtitle1" sx={{ color: colors.grey[100], fontWeight: 700, fontSize: '1rem' }}>
                    Status Summary Table
                  </Typography>
                  <Typography variant="caption" sx={{ color: colors.grey[400], fontSize: '0.7rem' }}>
                    Detailed breakdown by status
                  </Typography>
                </Box>
              </Box>
              <TableContainer component={Paper} sx={{ bgcolor: 'transparent', boxShadow: 'none', borderRadius: 2, overflow: 'hidden', border: 0 }}>
                <Table sx={{ minWidth: 650 }}>
                  <TableHead>
                    <TableRow sx={{ '& th': { color: theme.palette.mode === 'dark' ? '#ffffff' : '#1f2937', fontWeight: 800 } }}>
                      <TableCell>Status</TableCell>
                      <TableCell align="right">Projects</TableCell>
                      <TableCell align="right">Percentage</TableCell>
                      <TableCell align="right">Budget</TableCell>
                      <TableCell align="right">Disbursed</TableCell>
                      <TableCell align="right">Disbursement</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {statusData.statusChart.map((status, index) => (
                      <TableRow
                        key={status.name}
                        hover
                        onClick={() => handleStatusClick(status.name)}
                        sx={{
                          backgroundColor: index % 2 === 0 ? (theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)') : 'transparent',
                          cursor: 'pointer',
                        }}
                      >
                        <TableCell>
                          <Chip
                            label={status.name}
                            size="small"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleStatusClick(status.name);
                            }}
                            sx={{
                              bgcolor: status.color,
                              color: 'white',
                              fontWeight: 700,
                              cursor: 'pointer',
                            }}
                          />
                        </TableCell>
                        <TableCell align="right">{status.count}</TableCell>
                        <TableCell align="right">{status.percentage}%</TableCell>
                        <TableCell align="right">{formatCurrency(status.budget)}</TableCell>
                        <TableCell align="right">{formatCurrency(status.disbursed)}</TableCell>
                        <TableCell align="right">{status.absorptionRate}%</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </CardContent>
          </Card>
      </Box>

    </Box>
  );
};

export default ProjectByStatusDashboardPage;