import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Grid,
  LinearProgress,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
  useTheme,
} from '@mui/material';
import {
  Assessment as AssessmentIcon,
  Business as BusinessIcon,
  Insights as InsightsIcon,
  OpenInNew as OpenInNewIcon,
  Public as PublicIcon,
  Refresh as RefreshIcon,
  ReportProblem as ReportProblemIcon,
} from '@mui/icons-material';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useNavigate } from 'react-router-dom';
import reportsService from '../api/reportsService';
import { ROUTES } from '../configs/appConfig';
import { tokens } from './dashboard/theme';

const PERIOD_OPTIONS = [
  { code: '', name: 'All periods' },
  { code: 'Q1', name: 'Q1: Jul - Sep' },
  { code: 'Q2', name: 'Q2: Oct - Dec' },
  { code: 'Q3', name: 'Q3: Jan - Mar' },
  { code: 'Q4', name: 'Q4: Apr - Jun' },
  { code: 'H1', name: 'Half year: Jul - Dec' },
  { code: 'H2', name: 'Half year: Jan - Jun' },
  { code: 'ANNUAL', name: 'Annual: Jul - Jun' },
];

const emptyOptions = {
  departments: [],
  sections: [],
  statuses: [],
  subCounties: [],
  wards: [],
  financialYears: [],
  periods: PERIOD_OPTIONS,
};

const numberValue = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
};

const asRows = (value) => (Array.isArray(value) ? value : []);

const cleanFilters = (filters) =>
  Object.fromEntries(
    Object.entries(filters).filter(([, value]) => value !== '' && value !== null && value !== undefined)
  );

const fmtNumber = (value, digits = 0) =>
  numberValue(value).toLocaleString('en-KE', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });

const fmtMoney = (value) => {
  const numeric = numberValue(value);
  if (Math.abs(numeric) >= 1_000_000_000) return `KES ${(numeric / 1_000_000_000).toFixed(2)}B`;
  if (Math.abs(numeric) >= 1_000_000) return `KES ${(numeric / 1_000_000).toFixed(2)}M`;
  if (Math.abs(numeric) >= 1_000) return `KES ${(numeric / 1_000).toFixed(0)}K`;
  return `KES ${numeric.toLocaleString('en-KE')}`;
};

const fmtPct = (value, digits = 1) => `${fmtNumber(value, digits)}%`;

const clampPct = (value) => Math.max(0, Math.min(100, numberValue(value)));

const pctFromTotals = (achieved, target) => {
  const targetValue = numberValue(target);
  if (targetValue <= 0) return 0;
  return (numberValue(achieved) / targetValue) * 100;
};

const uniqueCount = (rows, key, excluded = new Set(['', 'Unspecified', 'Unassigned'])) => {
  const values = rows
    .map((row) => String(row[key] || '').trim())
    .filter((value) => value && !excluded.has(value));
  return new Set(values).size;
};

const chartPalette = ['#2563eb', '#16a34a', '#f97316', '#7c3aed', '#0891b2', '#dc2626', '#65a30d', '#9333ea'];
const filterSelectSx = { minWidth: { xs: '100%', sm: 160 } };

function MetricCard({ title, value, subtitle, icon, color = '#2563eb' }) {
  return (
    <Card
      elevation={0}
      sx={{
        height: '100%',
        borderRadius: '8px',
        bgcolor: color,
        color: '#fff',
        borderTop: '2px solid rgba(255,255,255,0.42)',
        boxShadow: `0 1px 6px ${color}24`,
        transition: 'all 0.2s ease-in-out',
        overflow: 'hidden',
        '&:hover': {
          transform: 'translateY(-2px)',
          boxShadow: `0 4px 12px ${color}33`,
        },
      }}
    >
      <CardContent sx={{ p: 0.75, pt: 0.75, '&:last-child': { pb: 0.75 } }}>
        <Stack direction="row" spacing={0.75} alignItems="center">
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.9)', fontWeight: 700, fontSize: '0.65rem', display: 'block' }} noWrap title={title}>
              {title}
            </Typography>
            <Typography variant="h5" sx={{ color: '#fff', fontWeight: 800, fontSize: '1.75rem', lineHeight: 1.1 }} noWrap title={String(value)}>
              {value}
            </Typography>
            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.88)', display: 'block', mt: 0.125, fontSize: '0.68rem', fontWeight: 600 }} noWrap title={subtitle}>
              {subtitle}
            </Typography>
          </Box>
          <Box sx={{ color: 'rgba(255,255,255,0.9)', fontSize: '2rem', display: 'flex', flexShrink: 0 }}>
            {icon}
          </Box>
        </Stack>
      </CardContent>
    </Card>
  );
}

function SignalCard({ label, value, detail, color = '#2563eb' }) {
  return (
    <Paper
      variant="outlined"
      sx={{
        p: 1.1,
        borderRadius: 2,
        height: '100%',
        borderLeft: `4px solid ${color}`,
        bgcolor: `${color}0D`,
      }}
    >
      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 800, textTransform: 'uppercase', fontSize: '0.65rem' }}>
        {label}
      </Typography>
      <Typography variant="body1" sx={{ fontWeight: 900, lineHeight: 1.15 }} noWrap title={String(value)}>
        {value}
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }} noWrap title={detail}>
        {detail}
      </Typography>
    </Paper>
  );
}

function ChartCard({ title, subtitle, icon, action, children, height = 280 }) {
  return (
    <Paper
      variant="outlined"
      sx={{
        p: { xs: 1.15, md: 1.35 },
        borderRadius: 2.5,
        height: '100%',
        bgcolor: 'background.paper',
      }}
    >
      <Stack direction="row" spacing={1} alignItems="flex-start" justifyContent="space-between" sx={{ mb: 0.8 }}>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0 }}>
          <Box
            sx={{
              width: 30,
              height: 30,
              borderRadius: 1.5,
              display: 'grid',
              placeItems: 'center',
              bgcolor: 'primary.main',
              color: '#fff',
              flexShrink: 0,
            }}
          >
            {icon}
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 900, lineHeight: 1.2 }} noWrap title={title}>
              {title}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.68rem' }} noWrap title={subtitle}>
              {subtitle}
            </Typography>
          </Box>
        </Stack>
        {action}
      </Stack>
      <Box sx={{ height }}>{children}</Box>
    </Paper>
  );
}

function EmptyState({ message = 'No data for the selected filters.' }) {
  return (
    <Box sx={{ height: '100%', minHeight: 180, display: 'grid', placeItems: 'center', textAlign: 'center', px: 2 }}>
      <Typography variant="body2" color="text.secondary">
        {message}
      </Typography>
    </Box>
  );
}

export default function OperationsDashboardPage() {
  const theme = useTheme();
  const colors = tokens(theme.palette.mode);
  const navigate = useNavigate();
  const [filters, setFilters] = useState({
    financialYear: '',
    period: '',
    department: '',
    status: '',
    subCounty: '',
  });
  const [options, setOptions] = useState(emptyOptions);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [error, setError] = useState('');

  const params = useMemo(() => cleanFilters(filters), [filters]);

  const loadOptions = useCallback(async () => {
    setOptionsLoading(true);
    try {
      const result = await reportsService.getCountyOperationsFilterOptions();
      setOptions({
        ...emptyOptions,
        ...(result || {}),
        departments: Array.isArray(result?.departments) ? result.departments : [],
        statuses: Array.isArray(result?.statuses) ? result.statuses : [],
        subCounties: Array.isArray(result?.subCounties) ? result.subCounties : [],
        financialYears: Array.isArray(result?.financialYears) ? result.financialYears : [],
        periods: Array.isArray(result?.periods) && result.periods.length ? result.periods : PERIOD_OPTIONS,
      });
    } catch (e) {
      console.error('Failed to load operations dashboard filters:', e);
      setOptions(emptyOptions);
    } finally {
      setOptionsLoading(false);
    }
  }, []);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await reportsService.getCountyOperationsReport(params);
      setData(result || {});
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || 'Failed to load operations dashboard.');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [params]);

  useEffect(() => {
    loadOptions();
  }, [loadOptions]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const summary = data?.summary || {};
  const departmentRows = asRows(data?.departmentRows);
  const regionalRows = asRows(data?.regionalRows);
  const periodRows = asRows(data?.periodRows);
  const activityRows = asRows(data?.activityRows);
  const indicatorRegionRows = asRows(data?.indicatorRegionRows);
  const indicatorDepartmentWardRows = asRows(data?.indicatorDepartmentWardRows);
  const evaluationRows = asRows(data?.evaluationRows);
  const attentionRows = asRows(data?.attentionRows);

  const dashboard = useMemo(() => {
    const targetTotal = activityRows.reduce((sum, row) => sum + numberValue(row.targetValue), 0);
    const achievedTotal = activityRows.reduce((sum, row) => sum + numberValue(row.achievedValue), 0);
    const indicatorAchievement = pctFromTotals(achievedTotal, targetTotal);

    const departmentMap = new Map();
    departmentRows.forEach((row) => {
      const key = row.department || 'Unassigned';
      const current = departmentMap.get(key) || {
        name: key,
        projects: 0,
        progressWeighted: 0,
        scoreWeighted: 0,
        activities: 0,
        evaluations: 0,
        attention: 0,
        allocated: 0,
        disbursed: 0,
      };
      const projects = numberValue(row.projectCount);
      current.projects += projects;
      current.progressWeighted += numberValue(row.averageProgress) * projects;
      current.scoreWeighted += numberValue(row.averagePerformanceScore) * projects;
      current.activities += numberValue(row.linkedActivityCount);
      current.evaluations += numberValue(row.evaluationCount);
      current.attention += numberValue(row.attentionProjects);
      current.allocated += numberValue(row.allocatedBudget);
      current.disbursed += numberValue(row.disbursedBudget);
      departmentMap.set(key, current);
    });
    const departmentPerformance = Array.from(departmentMap.values())
      .map((row) => ({
        ...row,
        progress: row.projects > 0 ? row.progressWeighted / row.projects : 0,
        score: row.projects > 0 ? row.scoreWeighted / row.projects : 0,
        absorption: pctFromTotals(row.disbursed, row.allocated),
        attentionRate: row.projects > 0 ? (row.attention / row.projects) * 100 : 0,
      }))
      .sort((a, b) => b.projects - a.projects)
      .slice(0, 8);

    const deptKpiMap = new Map();
    indicatorDepartmentWardRows.forEach((row) => {
      const key = row.department || 'Unassigned';
      const current = deptKpiMap.get(key) || { name: key, target: 0, achieved: 0, projects: 0, count: 0 };
      current.target += numberValue(row.targetValue);
      current.achieved += numberValue(row.achievedValue);
      current.projects += numberValue(row.projectCount);
      current.count += 1;
      deptKpiMap.set(key, current);
    });
    const deptKpis = Array.from(deptKpiMap.values())
      .map((row) => ({
        ...row,
        achievement: pctFromTotals(row.achieved, row.target),
      }))
      .sort((a, b) => b.achievement - a.achievement)
      .slice(0, 8);

    const periodTrend = periodRows
      .map((row) => ({
        name: `${row.financialYear || 'FY'} ${row.period || ''}`.trim(),
        projects: numberValue(row.projectCount),
        progress: numberValue(row.averageProgress),
        absorption: pctFromTotals(row.disbursedBudget, row.allocatedBudget),
        attention: numberValue(row.attentionProjects),
      }))
      .reverse();

    const kpiWatchlist = [...indicatorDepartmentWardRows, ...indicatorRegionRows]
      .map((row) => ({
        label: row.indicatorName || 'Unnamed indicator',
        group: row.department || row.subCounty || 'Unspecified',
        ward: row.ward || '',
        target: numberValue(row.targetValue),
        achieved: numberValue(row.achievedValue),
        achievement: row.achievementRate == null ? pctFromTotals(row.achievedValue, row.targetValue) : numberValue(row.achievementRate),
        projects: numberValue(row.projectCount),
      }))
      .filter((row) => row.target > 0 && row.achievement < 80)
      .sort((a, b) => a.achievement - b.achievement)
      .slice(0, 6);

    const topKpis = [...indicatorDepartmentWardRows]
      .map((row) => ({
        label: row.indicatorName || 'Unnamed indicator',
        group: row.department || 'Unassigned',
        achievement: row.achievementRate == null ? pctFromTotals(row.achievedValue, row.targetValue) : numberValue(row.achievementRate),
        target: numberValue(row.targetValue),
        achieved: numberValue(row.achievedValue),
      }))
      .filter((row) => row.target > 0)
      .sort((a, b) => b.achievement - a.achievement)
      .slice(0, 5);

    const projectCount = numberValue(summary.projectCount);
    const completedProjects = numberValue(summary.completedProjects);
    const attentionProjects = numberValue(summary.attentionProjects);
    const evaluatedProjects = new Set(evaluationRows.map((row) => row.projectId).filter(Boolean)).size;
    const activityProjects = new Set(activityRows.map((row) => row.projectId).filter(Boolean)).size;
    const topDepartment = departmentPerformance[0] || null;
    const riskDepartment = [...departmentPerformance].sort((a, b) => b.attentionRate - a.attentionRate)[0] || null;
    const weakestKpi = kpiWatchlist[0] || null;

    return {
      targetTotal,
      achievedTotal,
      indicatorAchievement,
      completionRate: projectCount > 0 ? (completedProjects / projectCount) * 100 : 0,
      attentionRate: projectCount > 0 ? (attentionProjects / projectCount) * 100 : 0,
      evaluationCoverage: projectCount > 0 ? (evaluatedProjects / projectCount) * 100 : 0,
      activityCoverage: projectCount > 0 ? (activityProjects / projectCount) * 100 : 0,
      departmentPerformance,
      deptKpis,
      periodTrend,
      kpiWatchlist,
      topKpis,
      topDepartment,
      riskDepartment,
      weakestKpi,
      subCountyCount: uniqueCount(regionalRows, 'subCounty'),
      wardCount: uniqueCount(regionalRows, 'ward'),
    };
  }, [activityRows, departmentRows, evaluationRows, indicatorDepartmentWardRows, indicatorRegionRows, periodRows, regionalRows, summary]);

  const resetFilters = () => {
    setFilters({ financialYear: '', period: '', department: '', status: '', subCounty: '' });
  };

  const activeFilterCount = Object.values(filters).filter(Boolean).length;

  return (
    <Box
      sx={{
        p: { xs: 1.25, md: 2 },
        minHeight: '100vh',
        background:
          theme.palette.mode === 'dark'
            ? `linear-gradient(135deg, ${colors.primary[900]} 0%, ${colors.primary[800]} 100%)`
            : 'linear-gradient(135deg, #f8fafc 0%, #eef2f7 100%)',
      }}
    >
      <Paper
        elevation={0}
        sx={{
          p: { xs: 1.35, md: 1.65 },
          mb: 1.5,
          borderRadius: 3,
          border: '1px solid',
          borderColor: 'divider',
          background: 'linear-gradient(135deg, rgba(37,99,235,0.10), rgba(22,163,74,0.08), rgba(255,255,255,0.90))',
        }}
      >
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.25} alignItems={{ xs: 'stretch', md: 'flex-start' }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mb: 0.45 }} flexWrap="wrap" useFlexGap>
              <Chip size="small" color="primary" label="Live from County Operations Report" />
              {activeFilterCount ? <Chip size="small" label={`${activeFilterCount} active filter${activeFilterCount === 1 ? '' : 's'}`} /> : null}
            </Stack>
            <Typography variant="h5" sx={{ fontWeight: 950, letterSpacing: '-0.03em', fontSize: { xs: '1.25rem', md: '1.55rem' } }}>
              County Operational Dashboard
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ mt: 0.35, display: 'block', maxWidth: 860, lineHeight: 1.45 }}>
              Executive view of departmental performance, regional KPI achievement, activity progress, evaluations,
              budget absorption, and projects that need operational attention.
            </Typography>
          </Box>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap justifyContent={{ xs: 'flex-start', md: 'flex-end' }}>
            <Button variant="outlined" startIcon={<RefreshIcon />} onClick={loadDashboard} disabled={loading}>
              Refresh
            </Button>
            <Button
              variant="contained"
              endIcon={<OpenInNewIcon />}
              onClick={() => navigate(ROUTES.COUNTY_OPERATIONS_REPORT)}
            >
              Detailed report
            </Button>
          </Stack>
        </Stack>

        <Grid container spacing={1} alignItems="center" sx={{ mt: 1.25 }}>
          <Grid item xs={12} sm={6} md={2}>
            <TextField
              select
              fullWidth
              size="small"
              sx={filterSelectSx}
              label="Financial year"
              value={filters.financialYear}
              onChange={(event) => setFilters((prev) => ({ ...prev, financialYear: event.target.value }))}
            >
              <MenuItem value="">All years</MenuItem>
              {options.financialYears.map((item) => (
                <MenuItem key={item} value={item}>
                  {item}
                </MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid item xs={12} sm={6} md={2}>
            <TextField
              select
              fullWidth
              size="small"
              sx={filterSelectSx}
              label="Period"
              value={filters.period}
              onChange={(event) => setFilters((prev) => ({ ...prev, period: event.target.value }))}
            >
              {(options.periods.length ? options.periods : PERIOD_OPTIONS).map((item) => (
                <MenuItem key={item.code || 'all'} value={item.code}>
                  {item.name}
                </MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid item xs={12} sm={6} md={2}>
            <TextField
              select
              fullWidth
              size="small"
              sx={filterSelectSx}
              label="Department"
              value={filters.department}
              onChange={(event) => setFilters((prev) => ({ ...prev, department: event.target.value }))}
            >
              <MenuItem value="">All scoped departments</MenuItem>
              {options.departments.map((item) => (
                <MenuItem key={item} value={item}>
                  {item}
                </MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid item xs={12} sm={6} md={2}>
            <TextField
              select
              fullWidth
              size="small"
              sx={filterSelectSx}
              label="Sub-county"
              value={filters.subCounty}
              onChange={(event) => setFilters((prev) => ({ ...prev, subCounty: event.target.value }))}
            >
              <MenuItem value="">All sub-counties</MenuItem>
              {options.subCounties.map((item) => (
                <MenuItem key={item} value={item}>
                  {item}
                </MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid item xs={12} sm={6} md={2}>
            <TextField
              select
              fullWidth
              size="small"
              sx={filterSelectSx}
              label="Status"
              value={filters.status}
              onChange={(event) => setFilters((prev) => ({ ...prev, status: event.target.value }))}
            >
              <MenuItem value="">All statuses</MenuItem>
              {options.statuses.map((item) => (
                <MenuItem key={item} value={item}>
                  {item}
                </MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid item xs={12} sm={6} md={2}>
            <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap alignItems="center">
              <Button size="small" variant="text" onClick={resetFilters} disabled={!activeFilterCount}>
                Reset
              </Button>
              {optionsLoading ? <Chip size="small" icon={<CircularProgress size={14} />} label="Loading filter options" /> : null}
              {loading ? <Chip size="small" icon={<CircularProgress size={14} />} label="Updating dashboard" /> : null}
            </Stack>
          </Grid>
        </Grid>
      </Paper>

      {error ? <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert> : null}
      {!loading && data && numberValue(summary.projectCount) === 0 ? (
        <Alert severity="warning" sx={{ mb: 2 }}>
          No scoped projects were found for the selected filters. Clear filters or confirm the user&apos;s organization access.
        </Alert>
      ) : null}

      <Box
        sx={{
          display: 'flex',
          gap: 1,
          mb: 1.25,
          width: '100%',
          overflowX: { xs: 'auto', lg: 'visible' },
          pb: { xs: 0.5, lg: 0 },
        }}
      >
        <Box sx={{ flex: { xs: '0 0 185px', lg: '1 1 0' }, minWidth: 0 }}>
          <MetricCard
            title="Projects"
            value={fmtNumber(summary.projectCount)}
            subtitle={`${fmtNumber(summary.departmentCount)} departments · ${fmtNumber(summary.sectionCount)} sections`}
            icon={<BusinessIcon fontSize="small" />}
            color="#2563eb"
          />
        </Box>
        <Box sx={{ flex: { xs: '0 0 185px', lg: '1 1 0' }, minWidth: 0 }}>
          <MetricCard
            title="KPI Achievement"
            value={fmtPct(dashboard.indicatorAchievement)}
            subtitle={`${fmtNumber(dashboard.achievedTotal, 1)} achieved of ${fmtNumber(dashboard.targetTotal, 1)} target`}
            icon={<InsightsIcon fontSize="small" />}
            color="#7c3aed"
            progress={dashboard.indicatorAchievement}
          />
        </Box>
        <Box sx={{ flex: { xs: '0 0 185px', lg: '1 1 0' }, minWidth: 0 }}>
          <MetricCard
            title="Absorption"
            value={fmtPct(summary.absorptionRate)}
            subtitle={`${fmtMoney(summary.disbursedBudget)} paid of ${fmtMoney(summary.allocatedBudget)}`}
            icon={<AssessmentIcon fontSize="small" />}
            color="#0891b2"
            progress={summary.absorptionRate}
          />
        </Box>
        <Box sx={{ flex: { xs: '0 0 185px', lg: '1 1 0' }, minWidth: 0 }}>
          <MetricCard
            title="Regional Coverage"
            value={`${fmtNumber(dashboard.subCountyCount)} / ${fmtNumber(dashboard.wardCount)}`}
            subtitle="Sub-counties / wards represented"
            icon={<PublicIcon fontSize="small" />}
            color="#f97316"
          />
        </Box>
        <Box sx={{ flex: { xs: '0 0 185px', lg: '1 1 0' }, minWidth: 0 }}>
          <MetricCard
            title="Needs Attention"
            value={fmtNumber(summary.attentionProjects)}
            subtitle={`${fmtNumber(summary.completedProjects)} completed projects`}
            icon={<ReportProblemIcon fontSize="small" />}
            color="#dc2626"
          />
        </Box>
      </Box>

      <Box
        sx={{
          display: 'flex',
          gap: 1,
          mb: 1.5,
          width: '100%',
          flexDirection: { xs: 'column', md: 'row' },
        }}
      >
        <Box sx={{ flex: '1 1 0', minWidth: 0 }}>
          <SignalCard
            label="Completion health"
            value={fmtPct(dashboard.completionRate)}
            detail={`${fmtNumber(summary.completedProjects)} of ${fmtNumber(summary.projectCount)} projects complete`}
            color="#16a34a"
          />
        </Box>
        <Box sx={{ flex: '1 1 0', minWidth: 0 }}>
          <SignalCard
            label="M&E coverage"
            value={fmtPct(dashboard.evaluationCoverage)}
            detail={`${fmtNumber(evaluationRows.length)} evaluations · ${fmtPct(dashboard.activityCoverage)} activity coverage`}
            color="#7c3aed"
          />
        </Box>
        <Box sx={{ flex: '1 1 0', minWidth: 0 }}>
          <SignalCard
            label="Weakest KPI"
            value={dashboard.weakestKpi ? dashboard.weakestKpi.label : 'No KPI risk'}
            detail={dashboard.weakestKpi ? `${fmtPct(dashboard.weakestKpi.achievement)} achievement · ${dashboard.weakestKpi.group}` : 'No KPI below threshold'}
            color="#f97316"
          />
        </Box>
        <Box sx={{ flex: '1 1 0', minWidth: 0 }}>
          <SignalCard
            label="Highest attention load"
            value={dashboard.riskDepartment ? dashboard.riskDepartment.name : 'No risk'}
            detail={dashboard.riskDepartment ? `${fmtPct(dashboard.riskDepartment.attentionRate)} attention rate · ${fmtNumber(dashboard.riskDepartment.attention)} projects` : 'No attention projects'}
            color="#dc2626"
          />
        </Box>
      </Box>

      <Stack spacing={1.5} sx={{ width: '100%' }}>
        <Box
          sx={{
            display: 'flex',
            flexDirection: { xs: 'column', lg: 'row' },
            gap: 1.5,
            width: '100%',
            alignItems: 'stretch',
          }}
        >
        <Box sx={{ flex: { xs: '1 1 auto', lg: '1 1 0' }, minWidth: 0 }}>
          <ChartCard
            title="Departmental Performance"
            subtitle="Projects, progress, M&E score and attention load by department/unit"
            icon={<BusinessIcon fontSize="small" />}
            height={300}
          >
            {dashboard.departmentPerformance.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={dashboard.departmentPerformance} margin={{ top: 6, right: 6, left: -18, bottom: 52 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={theme.palette.divider} />
                  <XAxis dataKey="name" angle={-28} textAnchor="end" height={64} interval={0} tick={{ fontSize: 10 }} />
                  <YAxis yAxisId="left" tick={{ fontSize: 10 }} />
                  <YAxis yAxisId="right" orientation="right" domain={[0, 100]} tick={{ fontSize: 10 }} />
                  <RechartsTooltip formatter={(value, name) => (name === 'Projects' || name === 'Attention' ? fmtNumber(value) : fmtPct(value))} />
                  <Legend />
                  <Bar yAxisId="left" dataKey="projects" name="Projects" fill="#2563eb" radius={[4, 4, 0, 0]} />
                  <Bar yAxisId="left" dataKey="attention" name="Attention" fill="#dc2626" radius={[4, 4, 0, 0]} />
                  <Line yAxisId="right" type="monotone" dataKey="progress" name="Progress" stroke="#16a34a" strokeWidth={2} dot={{ r: 3 }} />
                  <Line yAxisId="right" type="monotone" dataKey="score" name="M&E score" stroke="#7c3aed" strokeWidth={2} dot={{ r: 3 }} />
                </ComposedChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState />
            )}
          </ChartCard>
        </Box>

        <Box sx={{ width: { xs: '100%', lg: '32%' }, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <Paper variant="outlined" sx={{ p: 1.35, borderRadius: 2.5, height: '100%' }}>
            <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
              <Box>
                <Typography variant="subtitle2" sx={{ fontWeight: 900, lineHeight: 1.2 }}>
                  KPI Watchlist
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Below 80% achievement
                </Typography>
              </Box>
              <Chip size="small" color="warning" label={fmtNumber(dashboard.kpiWatchlist.length)} />
            </Stack>
            {dashboard.kpiWatchlist.length ? (
              <Stack spacing={0.75}>
                {dashboard.kpiWatchlist.map((row, index) => (
                  <Paper key={`${row.label}-${row.group}-${index}`} variant="outlined" sx={{ p: 1, borderRadius: 2 }}>
                    <Stack direction="row" justifyContent="space-between" spacing={1} alignItems="flex-start">
                      <Box sx={{ minWidth: 0 }}>
                        <Typography variant="body2" sx={{ fontWeight: 800 }} noWrap title={row.label}>
                          {row.label}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" noWrap title={`${row.group}${row.ward ? ` · ${row.ward}` : ''}`}>
                          {row.group}{row.ward ? ` · ${row.ward}` : ''}
                        </Typography>
                      </Box>
                      <Chip
                        size="small"
                        label={fmtPct(row.achievement)}
                        color={row.achievement < 50 ? 'error' : 'warning'}
                        sx={{ fontWeight: 800, flexShrink: 0 }}
                      />
                    </Stack>
                    <LinearProgress
                      variant="determinate"
                      value={clampPct(row.achievement)}
                      sx={{ mt: 0.7, height: 5, borderRadius: 99 }}
                      color={row.achievement < 50 ? 'error' : 'warning'}
                    />
                  </Paper>
                ))}
              </Stack>
            ) : (
              <EmptyState message="No under-performing KPI rows for the selected filters." />
            )}
          </Paper>
        </Box>
        </Box>

        <Box
          sx={{
            display: 'flex',
            flexDirection: { xs: 'column', lg: 'row' },
            gap: 1.5,
            width: '100%',
            alignItems: 'stretch',
          }}
        >
        <Box sx={{ flex: { xs: '1 1 auto', lg: '1 1 0' }, minWidth: 0 }}>
          <ChartCard
            title="Department KPI Delivery"
            subtitle="Indicator achievement aggregated by department"
            icon={<InsightsIcon fontSize="small" />}
            height={280}
          >
            {dashboard.deptKpis.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dashboard.deptKpis} margin={{ top: 6, right: 6, left: -18, bottom: 54 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={theme.palette.divider} />
                  <XAxis dataKey="name" angle={-28} textAnchor="end" interval={0} height={66} tick={{ fontSize: 10 }} />
                  <YAxis tickFormatter={(value) => `${value}%`} domain={[0, 100]} tick={{ fontSize: 10 }} />
                  <RechartsTooltip formatter={(value) => fmtPct(value)} />
                  <Bar dataKey="achievement" name="Achievement" fill="#7c3aed" radius={[5, 5, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState />
            )}
          </ChartCard>
        </Box>

        <Box sx={{ width: { xs: '100%', lg: '40%' }, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <ChartCard
            title="Financial Year Period Trend"
            subtitle="Progress and absorption across July-June reporting periods"
            icon={<AssessmentIcon fontSize="small" />}
            height={280}
          >
            {dashboard.periodTrend.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={dashboard.periodTrend} margin={{ top: 6, right: 14, left: -14, bottom: 38 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={theme.palette.divider} />
                  <XAxis dataKey="name" angle={-22} textAnchor="end" height={48} tick={{ fontSize: 10 }} />
                  <YAxis domain={[0, 100]} tickFormatter={(value) => `${value}%`} tick={{ fontSize: 10 }} />
                  <RechartsTooltip formatter={(value, name) => (name === 'Projects' || name === 'Attention' ? fmtNumber(value) : fmtPct(value))} />
                  <Legend />
                  <Line type="monotone" dataKey="progress" name="Progress" stroke="#16a34a" strokeWidth={3} dot={{ r: 4 }} />
                  <Line type="monotone" dataKey="absorption" name="Absorption" stroke="#2563eb" strokeWidth={3} dot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState />
            )}
          </ChartCard>
        </Box>
        </Box>

        <Box sx={{ width: '100%', minWidth: 0 }}>
          <Paper variant="outlined" sx={{ p: 1.35, borderRadius: 2.5 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 900, mb: 0.25 }}>
              Operational Attention Projects
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Projects flagged by status risk, delay, or low absorption/progress
            </Typography>
            <TableContainer sx={{ mt: 1, maxHeight: 300, overflowX: 'hidden' }}>
              <Table size="small" stickyHeader sx={{ tableLayout: 'fixed', width: '100%' }}>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 800, width: '48%' }}>Project</TableCell>
                    <TableCell sx={{ fontWeight: 800, width: '28%' }}>Department</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 800, width: '12%' }}>Progress</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 800, width: '12%' }}>Absorption</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {attentionRows.slice(0, 8).map((row) => (
                    <TableRow
                      key={row.projectId}
                      hover
                      sx={{ cursor: 'pointer' }}
                      onClick={() => navigate(`${ROUTES.PROJECTS}/${row.projectId}`)}
                    >
                      <TableCell sx={{ minWidth: 0 }}>
                        <Typography variant="body2" fontWeight={800} noWrap title={row.projectName}>
                          {row.projectName}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" noWrap title={row.statusReason || row.latestUpdateSummary || row.status}>
                          {row.statusReason || row.latestUpdateSummary || row.status || 'Needs follow-up'}
                        </Typography>
                      </TableCell>
                      <TableCell sx={{ minWidth: 0 }}>
                        <Typography variant="body2" noWrap title={row.department || 'Unassigned'}>
                          {row.department || 'Unassigned'}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">{fmtPct(row.progress)}</TableCell>
                      <TableCell align="right">{fmtPct(row.absorptionRate)}</TableCell>
                    </TableRow>
                  ))}
                  {!attentionRows.length ? (
                    <TableRow>
                      <TableCell colSpan={4}>
                        <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
                          No projects currently need attention for the selected filters.
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </Box>

        <Box sx={{ width: '100%', minWidth: 0 }}>
          <Paper variant="outlined" sx={{ p: 1.35, borderRadius: 2.5 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 900, mb: 0.25 }}>
              Strongest KPI Delivery
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Department indicator rows with the highest achievement rate
            </Typography>
            <Stack spacing={0.85} sx={{ mt: 1 }}>
              {dashboard.topKpis.map((row, index) => (
                <Stack key={`${row.label}-${row.group}-${index}`} direction="row" spacing={1.5} alignItems="center">
                  <Box
                    sx={{
                      width: 28,
                      height: 28,
                      borderRadius: 1.5,
                      display: 'grid',
                      placeItems: 'center',
                      bgcolor: chartPalette[index % chartPalette.length],
                      color: '#fff',
                      fontWeight: 900,
                    }}
                  >
                    {index + 1}
                  </Box>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" fontWeight={800} noWrap title={row.label}>
                      {row.label}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" noWrap title={row.group}>
                      {row.group} · {fmtNumber(row.achieved, 1)} achieved / {fmtNumber(row.target, 1)} target
                    </Typography>
                  </Box>
                  <Chip size="small" color="success" label={fmtPct(row.achievement)} sx={{ fontWeight: 800 }} />
                </Stack>
              ))}
              {!dashboard.topKpis.length ? <EmptyState message="No KPI delivery rows available for the selected filters." /> : null}
            </Stack>
          </Paper>
        </Box>
      </Stack>

      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mt: 2 }}>
        <Chip size="small" label={`${fmtNumber(activityRows.length)} linked activities`} />
        <Chip size="small" label={`${fmtNumber(evaluationRows.length)} evaluations`} />
        <Chip size="small" label={`${fmtNumber(indicatorDepartmentWardRows.length)} department KPI rows`} />
      </Stack>
    </Box>
  );
}
