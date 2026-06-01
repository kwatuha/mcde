import React, { useMemo, useState, useEffect } from 'react';
import {
  Box,
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
  Alert,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
} from '@mui/material';
import {
  PieChart as PieChartIcon,
  AccountTree as AccountTreeIcon,
  FilterList as FilterIcon,
  TrendingUp as TrendingUpIcon,
  Assessment as AssessmentIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  DonutLarge as DonutLargeIcon,
  OpenInNew as OpenInNewIcon,
  ViewList as ViewListIcon,
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
  SECTOR_CHART_BUCKET_OTHER,
  SECTOR_CHART_BUCKET_UNSPECIFIED,
  buildSectorCanonicalLookup,
  buildSectorDisplayMap,
  labelForSectorRegistryBucket,
  rawRegistrySectorFromProject,
  sectorRegistryBucketKey,
} from '../utils/organizationChartLabels';
import { ROUTES } from '../configs/appConfig';
import SectorGapProjectsModal from '../components/SectorGapProjectsModal';
import { isVoidedProject, suggestPossibleRegistrySectors } from '../utils/sectorGapDrilldown';
import { useAuth } from '../context/AuthContext.jsx';
import { isSuperAdminUser } from '../utils/roleUtils';

const STATUS_COLORS = {
  Completed: '#16a34a',
  'In Progress': '#2563eb',
  Ongoing: '#2563eb',
  'Not started': '#9ca3af',
  'Not Started': '#9ca3af',
  Delayed: '#f97316',
  Stalled: '#f59e0b',
  'Under Procurement': '#9c27b0',
  Suspended: '#dc2626',
  Other: '#14b8a6',
};

const SECTOR_PIE_COLORS = [
  '#2563eb',
  '#16a34a',
  '#f97316',
  '#9c27b0',
  '#0ea5e9',
  '#ca8a04',
  '#64748b',
  '#dc2626',
  '#14b8a6',
  '#7c3aed',
];

const formatCurrency = (value) =>
  `KES ${((Number(value) || 0) / 1_000_000).toLocaleString('en-KE', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}M`;

function bucketKeyForProject(p, canonicalLookup) {
  return sectorRegistryBucketKey(rawRegistrySectorFromProject(p), canonicalLookup);
}

const ProjectBySectorDashboardPage = () => {
  const theme = useTheme();
  const colors = tokens(theme.palette.mode);
  const navigate = useNavigate();
  const { user } = useAuth();
  const [filters, setFilters] = useState({
    ministry: '',
    stateDepartment: '',
    agency: '',
    status: '',
    sectorBucket: '',
  });
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [sectors, setSectors] = useState([]);
  const [allProjects, setAllProjects] = useState([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [projectsError, setProjectsError] = useState('');
  const [sectorGapModal, setSectorGapModal] = useState(null);
  const [pendingSectorUpdate, setPendingSectorUpdate] = useState(null);
  const [updatingSector, setUpdatingSector] = useState(false);

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
        // Use the same project list as the registry (`GET /projects`) so `sector` and other columns
        // match `/projects/:id`. `GET /projects/organization-projects` can omit `sector`, which made
        // every row look "unspecified" in sector charts.
        const data = await projectService.projects.getProjects({ limit: 5000 });
        const rows = Array.isArray(data) ? data : [];
        const normalized = rows.map((p) => {
          const sectorText = rawRegistrySectorFromProject(p);
          const ministry = String(
            p.ministry ?? p.ministryName ?? p.departmentName ?? p.department ?? ''
          ).trim();
          const stateDepartment = String(
            p.stateDepartment ?? p.state_department ?? p.stateDepartmentName ?? ''
          ).trim();
          const agency = String(
            p.agency ?? p.agencyName ?? p.implementingAgency ?? p.implementing_agency ?? p.directorate ?? p.directorateName ?? ''
          ).trim();
          return {
            ...p,
            sector: sectorText,
            projectName: p.projectName || p.project_name || 'Untitled Project',
            Status: p.status || p.Status || 'Unknown',
            ministry,
            stateDepartment,
            agency,
            financialYear: p.financialYear || p.financialYearName || '',
            budget: Number(p.budget ?? p.costOfProject ?? p.allocatedBudget ?? 0),
            Paid: Number(p.Paid ?? p.paidOut ?? p.disbursedBudget ?? 0),
          };
        });
        setAllProjects(normalized);
      } catch (error) {
        console.error('Error fetching projects for sector dashboard:', error);
        setProjectsError(error?.response?.data?.message || error?.message || 'Failed to load projects.');
        setAllProjects([]);
      } finally {
        setLoadingProjects(false);
      }
    };
    fetchProjects();
  }, []);

  const sectorCanonicalLookup = useMemo(() => buildSectorCanonicalLookup(sectors), [sectors]);
  const sectorDisplayMap = useMemo(() => buildSectorDisplayMap(sectors), [sectors]);

  const allProjectsActive = useMemo(
    () => (Array.isArray(allProjects) ? allProjects.filter((p) => !isVoidedProject(p)) : []),
    [allProjects]
  );

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
    const hasAllMinistriesScope =
      superAdmin || normalized.some((s) => s.scopeType === 'ALL_MINISTRIES');
    const ministryScopes = normalized.filter((s) => s.scopeType === 'MINISTRY_ALL' && s.ministry);
    const stateDeptScopes = normalized.filter(
      (s) => s.scopeType === 'STATE_DEPARTMENT_ALL' && s.ministry && s.stateDepartment
    );

    if (hasAllMinistriesScope) {
      return { level: 'all', allowedMinistries: null, allowedPairs: null };
    }
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
      return allProjectsActive.filter((p) =>
        orgScopeMeta.allowedMinistries.has(String(p.ministry || '').trim().toLowerCase())
      );
    }
    if (orgScopeMeta.level === 'state_department') {
      return allProjectsActive.filter((p) => {
        const k = `${String(p.ministry || '').trim().toLowerCase()}|${String(
          p.stateDepartment || ''
        )
          .trim()
          .toLowerCase()}`;
        return orgScopeMeta.allowedPairs.has(k);
      });
    }
    return allProjectsActive;
  }, [allProjectsActive, orgScopeMeta]);

  const filteredProjects = useMemo(() => {
    return scopeBaseProjects.filter((p) => {
      if (filters.ministry && p.ministry !== filters.ministry) return false;
      if (filters.stateDepartment && p.stateDepartment !== filters.stateDepartment) return false;
      if (filters.agency && p.agency !== filters.agency) return false;
      if (filters.status) {
        const normalized = normalizeProjectStatus(p.Status || p.status || 'Unknown');
        if (normalized !== filters.status) return false;
      }
      if (filters.sectorBucket) {
        const bk = bucketKeyForProject(p, sectorCanonicalLookup);
        if (bk !== filters.sectorBucket) return false;
      }
      return true;
    });
  }, [scopeBaseProjects, filters, sectorCanonicalLookup]);

  const sectorGapRows = useMemo(() => {
    if (!sectorGapModal) return [];
    const target =
      sectorGapModal === 'unspecified' ? SECTOR_CHART_BUCKET_UNSPECIFIED : SECTOR_CHART_BUCKET_OTHER;
    return filteredProjects
      .filter((p) => bucketKeyForProject(p, sectorCanonicalLookup) === target)
      .map((p) => {
        let possibleMatches = [];
        try {
          possibleMatches = suggestPossibleRegistrySectors(p, sectors);
        } catch {
          possibleMatches = [];
        }
        return {
          id: p.id ?? p.project_id ?? `${p.projectName}|${p.Status}|${rawRegistrySectorFromProject(p)}`,
          projectName: p.projectName || p.project_name || 'Untitled Project',
          status: p.Status || p.status || '—',
          ministry: p.ministry || p.department || '—',
          stateDepartment: p.stateDepartment || p.state_department || p.directorate || '—',
          sectorText: rawRegistrySectorFromProject(p),
          possibleMatches,
        };
      });
  }, [sectorGapModal, filteredProjects, sectorCanonicalLookup, sectors]);

  const sectorAnalytics = useMemo(() => {
    const counts = new Map();
    const budgets = new Map();
    const statusBySector = new Map();

    filteredProjects.forEach((p) => {
      const bk = bucketKeyForProject(p, sectorCanonicalLookup);
      counts.set(bk, (counts.get(bk) || 0) + 1);
      const curB = budgets.get(bk) || { budget: 0, disbursed: 0 };
      curB.budget += p.budget || 0;
      curB.disbursed += p.Paid || 0;
      budgets.set(bk, curB);

      const st = normalizeProjectStatus(p.Status || p.status || 'Unknown');
      const key = `${bk}|${st}`;
      const row = statusBySector.get(key) || { bucketKey: bk, status: st, count: 0 };
      row.count += 1;
      statusBySector.set(key, row);
    });

    const label = (bk) => labelForSectorRegistryBucket(bk, sectorDisplayMap);

    const pieData = Array.from(counts.entries())
      .map(([bucketKey, value], i) => ({
        name: label(bucketKey),
        value,
        bucketKey,
        color: SECTOR_PIE_COLORS[i % SECTOR_PIE_COLORS.length],
      }))
      .sort((a, b) => b.value - a.value);

    const budgetBySector = Array.from(budgets.entries())
      .map(([bucketKey, row]) => ({
        name: label(bucketKey),
        bucketKey,
        budget: row.budget,
        disbursed: row.disbursed,
        absorption: row.budget > 0 ? Math.round((row.disbursed / row.budget) * 100) : 0,
      }))
      .sort((a, b) => b.budget - a.budget);

    const uniqueStatuses = Array.from(
      new Set(filteredProjects.map((p) => normalizeProjectStatus(p.Status || p.status || 'Unknown')))
    ).filter(Boolean);

    const stackedRows = Array.from(statusBySector.values()).reduce((acc, item) => {
      const displayName = label(item.bucketKey);
      const existing = acc.find((d) => d.bucketKey === item.bucketKey);
      if (existing) {
        existing[item.status] = item.count;
      } else {
        acc.push({ bucketKey: item.bucketKey, sectorDisplay: displayName, [item.status]: item.count });
      }
      return acc;
    }, []);

    const tableRows = Array.from(counts.entries())
      .map(([bucketKey, count]) => {
        const b = budgets.get(bucketKey) || { budget: 0, disbursed: 0 };
        const pct =
          filteredProjects.length > 0 ? ((count / filteredProjects.length) * 100).toFixed(1) : '0';
        const absorption = b.budget > 0 ? ((b.disbursed / b.budget) * 100).toFixed(1) : '0';
        return {
          bucketKey,
          label: label(bucketKey),
          count,
          pct,
          budget: b.budget,
          disbursed: b.disbursed,
          absorption,
        };
      })
      .sort((a, b) => b.count - a.count);

    const unspecified = counts.get(SECTOR_CHART_BUCKET_UNSPECIFIED) || 0;
    const otherRegistry = counts.get(SECTOR_CHART_BUCKET_OTHER) || 0;
    const registrySectorKeys = Array.from(counts.keys()).filter(
      (k) => k !== SECTOR_CHART_BUCKET_UNSPECIFIED && k !== SECTOR_CHART_BUCKET_OTHER
    );

    return {
      pieData,
      budgetBySector,
      stackedRows,
      uniqueStatuses,
      tableRows,
      unspecified,
      otherRegistry,
      registrySectorCount: registrySectorKeys.length,
    };
  }, [filteredProjects, sectorCanonicalLookup, sectorDisplayMap]);

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
  const uniqueStatuses = Array.from(
    new Set(scopeBaseProjects.map((p) => normalizeProjectStatus(p.Status || p.status || 'Unknown')))
  ).filter(Boolean);

  useEffect(() => {
    setFilters((prev) => {
      const next = { ...prev };
      if (!showMinistryFilter) next.ministry = '';
      if (!showStateDepartmentFilter) next.stateDepartment = '';
      if (showStateDepartmentFilter && next.stateDepartment) {
        const ok = uniqueStateDepartments.includes(next.stateDepartment);
        if (!ok) next.stateDepartment = '';
      }
      if (next.agency) {
        const ok = uniqueAgencies.includes(next.agency);
        if (!ok) next.agency = '';
      }
      const unchanged =
        next.ministry === prev.ministry &&
        next.stateDepartment === prev.stateDepartment &&
        next.agency === prev.agency &&
        next.status === prev.status &&
        next.sectorBucket === prev.sectorBucket;
      return unchanged ? prev : next;
    });
  }, [showMinistryFilter, showStateDepartmentFilter, uniqueStateDepartments, uniqueAgencies]);

  const sectorFilterOptions = useMemo(() => {
    const opts = [{ value: '', label: 'All sector buckets' }];
    (sectors || []).forEach((s) => {
      const name = (s.sectorName || s.name || '').trim();
      if (!name) return;
      const bk = sectorRegistryBucketKey(name, sectorCanonicalLookup);
      opts.push({ value: bk, label: labelForSectorRegistryBucket(bk, sectorDisplayMap) });
    });
    opts.push({
      value: SECTOR_CHART_BUCKET_UNSPECIFIED,
      label: labelForSectorRegistryBucket(SECTOR_CHART_BUCKET_UNSPECIFIED, sectorDisplayMap),
    });
    opts.push({
      value: SECTOR_CHART_BUCKET_OTHER,
      label: labelForSectorRegistryBucket(SECTOR_CHART_BUCKET_OTHER, sectorDisplayMap),
    });
    const seen = new Set();
    return opts.filter((o) => {
      if (seen.has(o.value)) return false;
      seen.add(o.value);
      return true;
    });
  }, [sectors, sectorCanonicalLookup, sectorDisplayMap]);

  const isLight = theme.palette.mode === 'light';
  const ui = {
    elevatedShadow: isLight
      ? '0 1px 6px rgba(0,0,0,0.06)'
      : '0 4px 20px rgba(0, 0, 0, 0.15), 0 -2px 10px rgba(0, 0, 0, 0.1)',
  };

  const totalInView = filteredProjects.length;

  const handlePossibleMatchClick = (row, match) => {
    if (!row || !match) return;
    setPendingSectorUpdate({
      projectId: row.id,
      projectName: row.projectName || 'Untitled Project',
      fromSector: row.sectorText || '',
      toSector: match.canonical,
    });
  };

  const handleConfirmSectorUpdate = async () => {
    if (!pendingSectorUpdate || !pendingSectorUpdate.projectId) return;
    setUpdatingSector(true);
    try {
      await projectService.projects.updateProject(pendingSectorUpdate.projectId, {
        sector: pendingSectorUpdate.toSector,
      });
      setAllProjects((prev) =>
        (prev || []).map((p) =>
          p.id === pendingSectorUpdate.projectId
            ? {
                ...p,
                sector: pendingSectorUpdate.toSector,
                Sector: pendingSectorUpdate.toSector,
                sector_name: pendingSectorUpdate.toSector,
                sectorName: pendingSectorUpdate.toSector,
              }
            : p
        )
      );
      setPendingSectorUpdate(null);
    } catch (error) {
      console.error('Error updating project sector from sector gap modal:', error);
      setProjectsError(error?.response?.data?.message || error?.message || 'Failed to update project sector.');
    } finally {
      setUpdatingSector(false);
    }
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
      <Box mb={2}>
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
              Project by Sector Dashboard
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', alignItems: 'center' }}>
            <Chip
              label="By status"
              size="small"
              onClick={() => navigate(ROUTES.PROJECT_BY_STATUS_DASHBOARD)}
              sx={{ bgcolor: colors.orange[600], color: 'white', fontWeight: 600, cursor: 'pointer' }}
            />
            <Chip
              label="Finance"
              size="small"
              onClick={() => navigate(ROUTES.FINANCE_DASHBOARD)}
              sx={{ bgcolor: colors.blueAccent[600], color: 'white', fontWeight: 600, cursor: 'pointer' }}
            />
            <Chip
              label="Summary"
              size="small"
              onClick={() => navigate(ROUTES.SYSTEM_DASHBOARD)}
              sx={{ bgcolor: colors.greenAccent[700], color: 'white', fontWeight: 600, cursor: 'pointer' }}
            />
            <Button
              size="small"
              variant="outlined"
              endIcon={<OpenInNewIcon sx={{ fontSize: 16 }} />}
              onClick={() => navigate(ROUTES.SECTORS)}
              sx={{ borderColor: colors.blueAccent[500], color: colors.blueAccent[500], fontSize: '0.75rem' }}
            >
              Sectors management
            </Button>
          </Box>
        </Box>

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
              '&:hover': { bgcolor: theme.palette.mode === 'dark' ? colors.primary[500] : 'rgba(0,0,0,0.02)' },
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
                  sx={{ height: 16, fontSize: '0.6rem', bgcolor: colors.blueAccent[600], color: 'white' }}
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
                      <MenuItem value="">All</MenuItem>
                      {uniqueMinistries.map((m) => (
                        <MenuItem key={m} value={m}>
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
                      <MenuItem value="">All</MenuItem>
                      {uniqueStateDepartments.map((d) => (
                        <MenuItem key={d} value={d}>
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
                    <MenuItem value="">All</MenuItem>
                    {uniqueAgencies.map((a) => (
                      <MenuItem key={a} value={a}>
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
                    <MenuItem value="">All</MenuItem>
                    {uniqueStatuses.map((s) => (
                      <MenuItem key={s} value={s}>
                        {s}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <FormControl size="small" sx={{ flex: 1, minWidth: 160 }}>
                  <InputLabel sx={{ fontSize: '0.75rem' }}>Sector bucket</InputLabel>
                  <Select
                    value={filters.sectorBucket}
                    label="Sector bucket"
                    onChange={(e) => setFilters({ ...filters, sectorBucket: e.target.value })}
                    sx={{ fontSize: '0.8rem', height: '32px' }}
                  >
                    {sectorFilterOptions.map((o) => (
                      <MenuItem key={o.value || 'all'} value={o.value}>
                        {o.label}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <Chip label={`${totalInView} projects`} size="small" sx={{ bgcolor: colors.blueAccent[600], color: 'white', fontSize: '0.7rem' }} />
              </Box>
            </CardContent>
          </Collapse>
        </Card>

        <Box
          sx={{
            display: 'flex',
            flexWrap: 'nowrap',
            gap: 1,
            overflowX: { xs: 'auto', md: 'visible' },
            pb: 1,
            mb: 1,
          }}
        >
          {[
            {
              title: 'In view',
              value: totalInView,
              sub: 'After filters',
              icon: AssessmentIcon,
              grad: ['#2563eb', '#3b82f6'],
              tooltip: 'Projects currently included after dashboard filters (ministry, state department, agency, status, sector bucket).',
            },
            {
              title: 'Registry sectors',
              value: sectorAnalytics.registrySectorCount,
              sub: 'Distinct matched',
              icon: AccountTreeIcon,
              grad: ['#16a34a', '#22c55e'],
              tooltip: 'How many different sector buckets match a name in Sectors Management.',
            },
            {
              title: 'Unspecified',
              value: sectorAnalytics.unspecified,
              sub: 'Missing sector',
              icon: DonutLargeIcon,
              grad: ['#64748b', '#94a3b8'],
              tooltip:
                'Non-voided projects with an empty free-text sector field. Click for a table (ministry, state department, suggestions from registry names). Use “Open project registry” if you still need the grid.',
              onOpenProjects: () => setSectorGapModal('unspecified'),
            },
            {
              title: 'Not in registry',
              value: sectorAnalytics.otherRegistry,
              sub: 'Non-matching sector text',
              icon: PieChartIcon,
              grad: ['#f97316', '#fb923c'],
              tooltip:
                'Non-voided projects whose sector text is set but does not match any sector name in Sectors Management. Click for details and suggested registry names (heuristic, not a DB join).',
              onOpenProjects: () => setSectorGapModal('other'),
            },
          ].map((kpi) => {
            const KpiIcon = kpi.icon;
            const interactive = typeof kpi.onOpenProjects === 'function';
            const card = (
              <Card
                sx={{
                  background: isLight
                    ? `linear-gradient(135deg, ${kpi.grad[0]} 0%, ${kpi.grad[1]} 100%)`
                    : `linear-gradient(135deg, ${colors.primary[500]}, ${colors.primary[600]})`,
                  color: isLight ? 'white' : 'inherit',
                  boxShadow: ui.elevatedShadow,
                  borderRadius: 2,
                  cursor: interactive ? 'pointer' : 'default',
                  outline: 0,
                  ...(interactive
                    ? {
                        '&:hover': { transform: 'translateY(-2px)', boxShadow: ui.elevatedShadow },
                      }
                    : {}),
                }}
              >
                <CardContent sx={{ py: 1, px: 1.25, '&:last-child': { pb: 1 } }}>
                  <Box display="flex" alignItems="center" gap={1}>
                    <KpiIcon sx={{ fontSize: 28, opacity: 0.95 }} />
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="caption" sx={{ fontWeight: 600, opacity: 0.9, fontSize: '0.65rem' }}>
                        {kpi.title}
                        {interactive ? (
                          <ViewListIcon sx={{ fontSize: 12, ml: 0.5, verticalAlign: 'middle', opacity: 0.85 }} />
                        ) : null}
                      </Typography>
                      <Typography variant="h5" sx={{ fontWeight: 800, lineHeight: 1.1 }}>
                        {kpi.value}
                      </Typography>
                      <Typography variant="caption" sx={{ opacity: 0.85, fontSize: '0.65rem' }}>
                        {kpi.sub}
                      </Typography>
                    </Box>
                  </Box>
                </CardContent>
              </Card>
            );
            return (
              <Box key={kpi.title} sx={{ flex: { xs: '0 0 auto', md: '1 1 0' }, minWidth: { xs: 140, md: 0 } }}>
                <Tooltip title={kpi.tooltip || ''} placement="top" arrow enterDelay={400}>
                  {interactive ? (
                    <Box
                      component="span"
                      display="block"
                      role="button"
                      tabIndex={0}
                      onClick={(e) => {
                        e.preventDefault();
                        kpi.onOpenProjects();
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          kpi.onOpenProjects();
                        }
                      }}
                      sx={{
                        outline: 0,
                        borderRadius: 2,
                        '&:focus-visible': {
                          boxShadow: `0 0 0 2px ${colors.blueAccent[400]}`,
                        },
                      }}
                    >
                      {card}
                    </Box>
                  ) : (
                    <Box component="span" display="block">
                      {card}
                    </Box>
                  )}
                </Tooltip>
              </Box>
            );
          })}
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

      <Box sx={{ display: 'flex', flexDirection: { xs: 'column', lg: 'row' }, gap: 1, mb: 1, alignItems: 'stretch' }}>
        <Box sx={{ width: { xs: '100%', lg: '32%' }, flexShrink: 0 }}>
          <Card
            sx={{
              borderRadius: 4,
              height: '100%',
              background: theme.palette.mode === 'dark'
                ? `linear-gradient(135deg, ${colors.primary[400]} 0%, ${colors.primary[500]} 100%)`
                : 'linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%)',
              border: `1px solid ${theme.palette.mode === 'dark' ? colors.blueAccent[700] : 'rgba(0,0,0,0.08)'}`,
            }}
          >
            <CardContent sx={{ p: 1.5, pb: 0.5 }}>
              <Box display="flex" alignItems="center" gap={1} mb={0.75}>
                <Box sx={{ p: 0.75, borderRadius: 1.5, background: `linear-gradient(135deg, ${colors.blueAccent[600]}, ${colors.blueAccent[400]})` }}>
                  <PieChartIcon sx={{ color: 'white', fontSize: 18 }} />
                </Box>
                <Box>
                  <Typography variant="subtitle1" sx={{ color: colors.grey[100], fontWeight: 700, fontSize: '1rem' }}>
                    Projects by sector
                  </Typography>
                </Box>
              </Box>
              <Box sx={{ height: 300 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={sectorAnalytics.pieData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={48}
                      outerRadius={88}
                      paddingAngle={2}
                      label={({ percent }) => (percent > 0.06 ? `${(percent * 100).toFixed(0)}%` : '')}
                      labelLine={false}
                    >
                      {sectorAnalytics.pieData.map((entry) => (
                        <Cell key={entry.bucketKey} fill={entry.color} stroke={theme.palette.mode === 'dark' ? colors.primary[500] : '#fff'} strokeWidth={2} />
                      ))}
                    </Pie>
                    <RechartsTooltip
                      contentStyle={{
                        background: theme.palette.mode === 'dark' ? colors.primary[500] : '#fff',
                        border: `1px solid ${colors.blueAccent[700]}`,
                        borderRadius: 8,
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: '0.7rem' }} iconType="circle" />
                  </PieChart>
                </ResponsiveContainer>
              </Box>
            </CardContent>
          </Card>
        </Box>

        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Card
            sx={{
              borderRadius: 4,
              height: '100%',
              background: theme.palette.mode === 'dark'
                ? `linear-gradient(135deg, ${colors.primary[400]} 0%, ${colors.primary[500]} 100%)`
                : 'linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%)',
              border: `1px solid ${theme.palette.mode === 'dark' ? colors.greenAccent[700] : 'rgba(0,0,0,0.08)'}`,
            }}
          >
            <CardContent sx={{ p: 1.5, pb: 0 }}>
              <Box display="flex" alignItems="center" gap={1} mb={0.5}>
                <Box sx={{ p: 0.75, borderRadius: 1.5, background: `linear-gradient(135deg, ${colors.greenAccent[600]}, ${colors.greenAccent[400]})` }}>
                  <TrendingUpIcon sx={{ color: 'white', fontSize: 18 }} />
                </Box>
                <Box>
                  <Typography variant="subtitle1" sx={{ color: colors.grey[100], fontWeight: 700, fontSize: '1rem' }}>
                    Budget by sector
                  </Typography>
                </Box>
              </Box>
              <Box sx={{ height: 300, width: '100%' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={sectorAnalytics.budgetBySector} margin={{ top: 8, right: 16, left: 8, bottom: 72 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={theme.palette.mode === 'dark' ? colors.grey[700] : colors.grey[300]} />
                    <XAxis
                      dataKey="name"
                      angle={-35}
                      textAnchor="end"
                      interval={0}
                      height={78}
                      tick={{ fill: colors.grey[300], fontSize: 9 }}
                    />
                    <YAxis tick={{ fill: colors.grey[300], fontSize: 10 }} tickFormatter={(v) => formatCurrency(v)} width={72} />
                    <RechartsTooltip formatter={(v) => formatCurrency(v)} />
                    <Legend wrapperStyle={{ fontSize: '0.7rem' }} />
                    <Bar dataKey="budget" name="Budget" fill={colors.blueAccent[500]} radius={[4, 4, 0, 0]} />
                    <Bar dataKey="disbursed" name="Paid" fill={colors.greenAccent[500]} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </Box>
            </CardContent>
          </Card>
        </Box>
      </Box>

      <Card
        sx={{
          borderRadius: 4,
          mb: 1.5,
          background: theme.palette.mode === 'dark'
            ? `linear-gradient(135deg, ${colors.primary[400]} 0%, ${colors.primary[500]} 100%)`
            : 'linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%)',
          border: `1px solid ${theme.palette.mode === 'dark' ? colors.blueAccent[700] : 'rgba(0,0,0,0.08)'}`,
        }}
      >
        <CardContent sx={{ p: 1.5, pb: 0.5 }}>
          <Box display="flex" alignItems="center" gap={1} mb={0.75}>
            <Box sx={{ p: 0.75, borderRadius: 1.5, background: `linear-gradient(135deg, ${colors.blueAccent[600]}, ${colors.blueAccent[400]})` }}>
              <AccountTreeIcon sx={{ color: 'white', fontSize: 18 }} />
            </Box>
            <Box>
              <Typography variant="subtitle1" sx={{ color: colors.grey[100], fontWeight: 700, fontSize: '1rem' }}>
                Status mix by sector
              </Typography>
            </Box>
          </Box>
          <Box sx={{ height: 340, width: '100%' }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={sectorAnalytics.stackedRows} margin={{ top: 8, right: 12, left: 0, bottom: 88 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={theme.palette.mode === 'dark' ? colors.grey[700] : colors.grey[300]} />
                <XAxis
                  dataKey="sectorDisplay"
                  angle={-40}
                  textAnchor="end"
                  height={100}
                  interval={0}
                  tick={{ fill: colors.grey[300], fontSize: 10 }}
                />
                <YAxis tick={{ fill: colors.grey[300], fontSize: 10 }} allowDecimals={false} />
                <RechartsTooltip />
                <Legend wrapperStyle={{ fontSize: '0.68rem' }} />
                {sectorAnalytics.uniqueStatuses.map((status, index) => (
                  <Bar
                    key={status}
                    dataKey={status}
                    stackId="a"
                    fill={STATUS_COLORS[status] || '#64748b'}
                    name={status}
                    radius={index === sectorAnalytics.uniqueStatuses.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </Box>
        </CardContent>
      </Card>

      <Card
        sx={{
          borderRadius: 4,
          background: theme.palette.mode === 'dark'
            ? `linear-gradient(135deg, ${colors.primary[400]} 0%, ${colors.primary[500]} 100%)`
            : 'linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%)',
          border: `1px solid ${theme.palette.mode === 'dark' ? colors.blueAccent[700] : 'rgba(0,0,0,0.08)'}`,
        }}
      >
        <CardContent sx={{ p: 1.5, pb: 0.5 }}>
          <Box display="flex" alignItems="center" gap={1} mb={0.75}>
            <AssessmentIcon sx={{ color: colors.blueAccent[500] }} />
            <Typography variant="subtitle1" sx={{ color: colors.grey[100], fontWeight: 700 }}>
              Sector summary
            </Typography>
          </Box>
          <TableContainer component={Paper} sx={{ bgcolor: 'transparent', boxShadow: 'none' }}>
            <Table size="small" sx={{ minWidth: 640 }}>
              <TableHead>
                <TableRow sx={{ '& th': { color: theme.palette.mode === 'dark' ? '#fff' : '#1f2937', fontWeight: 800 } }}>
                  <TableCell>Sector bucket</TableCell>
                  <TableCell align="right">Projects</TableCell>
                  <TableCell align="right">Share</TableCell>
                  <TableCell align="right">Budget</TableCell>
                  <TableCell align="right">Paid</TableCell>
                  <TableCell align="right">Absorption</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {sectorAnalytics.tableRows.map((row, index) => (
                  <TableRow
                    key={row.bucketKey}
                    hover
                    sx={{
                      backgroundColor:
                        index % 2 === 0
                          ? theme.palette.mode === 'dark'
                            ? 'rgba(255,255,255,0.03)'
                            : 'rgba(0,0,0,0.02)'
                          : 'transparent',
                    }}
                  >
                    <TableCell sx={{ fontWeight: 600 }}>{row.label}</TableCell>
                    <TableCell align="right">{row.count}</TableCell>
                    <TableCell align="right">{row.pct}%</TableCell>
                    <TableCell align="right">{formatCurrency(row.budget)}</TableCell>
                    <TableCell align="right">{formatCurrency(row.disbursed)}</TableCell>
                    <TableCell align="right">{row.absorption}%</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      <SectorGapProjectsModal
        open={sectorGapModal != null}
        onClose={() => setSectorGapModal(null)}
        title={
          sectorGapModal === 'unspecified'
            ? 'Unspecified sector (empty free text)'
            : sectorGapModal === 'other'
              ? 'Not in sector registry (non-matching free text)'
              : ''
        }
        subtitle={
          sectorGapModal
            ? '“Possible registry match” ranks sector names/aliases against this project’s sector text, title, ministry, and state department — for triage only.'
            : ''
        }
        rows={sectorGapRows}
        onSelectPossibleMatch={handlePossibleMatchClick}
        disablePossibleMatchActions={updatingSector}
        onOpenRegistry={
          sectorGapModal
            ? () => {
                const q = sectorGapModal === 'unspecified' ? 'unspecified' : 'other';
                navigate(`${ROUTES.PROJECTS}?sectorRegistry=${q}`);
                setSectorGapModal(null);
              }
            : undefined
        }
      />
      <Dialog
        open={pendingSectorUpdate != null}
        onClose={() => (updatingSector ? null : setPendingSectorUpdate(null))}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Confirm sector update</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {pendingSectorUpdate
              ? `Update "${pendingSectorUpdate.projectName}" sector from "${pendingSectorUpdate.fromSector || '(empty)'}" to "${pendingSectorUpdate.toSector}"?`
              : ''}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPendingSectorUpdate(null)} disabled={updatingSector}>
            Cancel
          </Button>
          <Button variant="contained" onClick={handleConfirmSectorUpdate} disabled={updatingSector}>
            {updatingSector ? 'Updating...' : 'Confirm update'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default ProjectBySectorDashboardPage;
