import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Chip,
  CircularProgress,
  Grid,
  LinearProgress,
  Paper,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  Typography,
} from '@mui/material';
import { LocationOn, Map as MapIcon } from '@mui/icons-material';
import projectService from '../api/projectService';
import { getProjectWardKey } from '../utils/projectWardKey';

const currency = (v) =>
  `KES ${Number(v || 0).toLocaleString('en-KE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const RegionalBreakdownDashboardPage = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState(0);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        // Use the same source as GIS dashboard so counts align.
        const data = await projectService.projects.getProjects();
        setRows(Array.isArray(data) ? data : []);
      } catch (e) {
        setError('Failed to load regional dashboard data.');
        setRows([]);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const normalized = useMemo(
    () =>
      rows.map((p) => ({
        constituency:
          String(
            p?.constituency ||
              p?.Constituency ||
              p?.constituencyName ||
              p?.constituency_name ||
              p?.constituencyNames ||
              ''
          ).trim() || 'Unspecified',
        ward: getProjectWardKey(p) || 'Unspecified',
        budget: Number(p?.costOfProject ?? p?.cost_of_project ?? p?.budget ?? 0) || 0,
        paid: Number(p?.paidOut ?? p?.paid_out ?? p?.Disbursed ?? 0) || 0,
      })),
    [rows]
  );

  const constituencyRows = useMemo(() => {
    const m = new Map();
    for (const r of normalized) {
      const current = m.get(r.constituency) || { constituency: r.constituency, projectCount: 0, totalBudget: 0, totalPaid: 0 };
      current.projectCount += 1;
      current.totalBudget += r.budget;
      current.totalPaid += r.paid;
      m.set(r.constituency, current);
    }
    return [...m.values()].sort((a, b) => b.projectCount - a.projectCount);
  }, [normalized]);

  const wardRows = useMemo(() => {
    const m = new Map();
    for (const r of normalized) {
      const key = `${r.constituency}__${r.ward}`;
      const current = m.get(key) || {
        constituency: r.constituency,
        ward: r.ward,
        projectCount: 0,
        totalBudget: 0,
        totalPaid: 0,
      };
      current.projectCount += 1;
      current.totalBudget += r.budget;
      current.totalPaid += r.paid;
      m.set(key, current);
    }
    return [...m.values()].sort((a, b) => b.projectCount - a.projectCount);
  }, [normalized]);

  const totals = useMemo(() => {
    const totalProjects = normalized.length;
    const totalBudget = normalized.reduce((sum, r) => sum + r.budget, 0);
    const totalPaid = normalized.reduce((sum, r) => sum + r.paid, 0);
    return {
      constituencies: constituencyRows.length,
      wards: wardRows.length,
      totalProjects,
      totalBudget,
      totalPaid,
    };
  }, [normalized, constituencyRows.length, wardRows.length]);

  const distributionInsights = useMemo(() => {
    const useWardScope = activeTab === 1;
    const scopeRows = useWardScope ? wardRows : constituencyRows;
    const scopeCount = Math.max(scopeRows.length, 1);
    const idealProjectsPerScope = totals.totalProjects / scopeCount;
    const idealBudgetPerScope = totals.totalBudget / scopeCount;

    const rows = scopeRows.map((c) => {
      const projectGap = idealProjectsPerScope - c.projectCount;
      const budgetGap = idealBudgetPerScope - c.totalBudget;
      const deficitPressure =
        Math.max(projectGap, 0) * 0.6 +
        (idealBudgetPerScope > 0 ? (Math.max(budgetGap, 0) / idealBudgetPerScope) * 100 * 0.4 : 0);
      const equityScore = Math.max(0, 100 - Math.abs(projectGap) * 12);
      const scopeLabel = useWardScope ? c.ward : c.constituency;
      return {
        ...c,
        scopeLabel,
        projectGap,
        budgetGap,
        deficitPressure,
        equityScore,
        recommendation:
          projectGap > 0.5 || budgetGap > 0
            ? 'Prioritize next allocation'
            : 'Maintain / monitor',
      };
    });

    const underServed = rows
      .filter((r) => r.projectGap > 0 || r.budgetGap > 0)
      .sort((a, b) => b.deficitPressure - a.deficitPressure)
      .slice(0, 5);

    return {
      scopeLabel: useWardScope ? 'ward' : 'constituency',
      scopeLabelPlural: useWardScope ? 'wards' : 'constituencies',
      idealProjectsPerScope,
      idealBudgetPerScope,
      averageEquityScore:
        rows.length > 0 ? rows.reduce((sum, r) => sum + r.equityScore, 0) / rows.length : 0,
      rows,
      underServed,
    };
  }, [activeTab, constituencyRows, wardRows, totals.totalProjects, totals.totalBudget]);

  const openRegistry = (row) => {
    if (!row) return;
    const params = new URLSearchParams();
    if (row.constituency && row.constituency !== 'Unspecified') {
      params.set('constituency', row.constituency);
    }
    if (row.ward && row.ward !== 'Unspecified') {
      params.set('ward', row.ward);
    }
    const q = params.toString();
    navigate(q ? `/projects?${q}` : '/projects');
  };

  return (
    <Box sx={{ p: { xs: 1, sm: 1.5 } }}>
      <Paper
        elevation={0}
        sx={{
          p: 2,
          mb: 1.5,
          borderRadius: 2,
          border: '1px solid',
          borderColor: 'divider',
          background: (theme) =>
            theme.palette.mode === 'dark'
              ? 'linear-gradient(145deg, rgba(30, 41, 59, 0.95) 0%, rgba(15, 23, 42, 0.95) 100%)'
              : 'linear-gradient(145deg, #ffffff 0%, #f1f5f9 100%)',
        }}
      >
        <Typography variant="h6" fontWeight={800} sx={{ fontSize: { xs: '1rem', sm: '1.15rem' } }}>
          Regional Breakdown Dashboard
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Constituency and ward performance from project records
        </Typography>
        <Box sx={{ mt: 1, display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
          <Chip size="small" label={`Constituencies: ${totals.constituencies}`} color="primary" variant="outlined" />
          <Chip size="small" label={`Wards: ${totals.wards}`} color="primary" variant="outlined" />
          <Chip size="small" label={`Projects: ${totals.totalProjects}`} color="primary" variant="outlined" />
        </Box>
      </Paper>

      <Paper sx={{ borderRadius: 2, border: '1px solid', borderColor: 'divider', overflow: 'hidden' }} elevation={0}>
        <Tabs
          value={activeTab}
          onChange={(_, next) => setActiveTab(next)}
          variant="fullWidth"
          sx={{
            borderBottom: 1,
            borderColor: 'divider',
            background: 'linear-gradient(to right, rgba(25, 118, 210, 0.05), transparent)',
            '& .MuiTab-root': {
              textTransform: 'none',
              fontWeight: 700,
              minHeight: 44,
            },
          }}
        >
          <Tab icon={<LocationOn sx={{ fontSize: 18 }} />} iconPosition="start" label="Constituency" />
          <Tab icon={<MapIcon sx={{ fontSize: 18 }} />} iconPosition="start" label="Ward" />
        </Tabs>

        <Box sx={{ p: 1.5, backgroundColor: 'background.default' }}>
          <Grid container spacing={1} sx={{ mb: 1.25 }}>
            <Grid item xs={12} md={6}>
              <Paper variant="outlined" sx={{ p: 1.1, borderRadius: 1.5 }}>
                <Box display="flex" justifyContent="space-between">
                  <Typography variant="caption" color="text.secondary">Total Budget</Typography>
                  <Typography variant="subtitle2" fontWeight={700}>{currency(totals.totalBudget)}</Typography>
                </Box>
              </Paper>
            </Grid>
            <Grid item xs={12} md={6}>
              <Paper variant="outlined" sx={{ p: 1.1, borderRadius: 1.5 }}>
                <Box display="flex" justifyContent="space-between">
                  <Typography variant="caption" color="text.secondary">Total Paid</Typography>
                  <Typography variant="subtitle2" fontWeight={700}>{currency(totals.totalPaid)}</Typography>
                </Box>
              </Paper>
            </Grid>
          </Grid>
          {loading ? (
            <Box sx={{ py: 4, display: 'flex', justifyContent: 'center' }}>
              <CircularProgress size={26} />
            </Box>
          ) : error ? (
            <Alert severity="error">{error}</Alert>
          ) : activeTab === 0 ? (
            <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 1.5 }}>
              <Table size="small">
                <TableHead sx={{ '& .MuiTableCell-root': { bgcolor: 'action.hover', fontWeight: 700 } }}>
                  <TableRow>
                    <TableCell>Constituency</TableCell>
                    <TableCell align="right">Projects</TableCell>
                    <TableCell align="right">Total Budget</TableCell>
                    <TableCell align="right">Total Paid</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {constituencyRows.map((r) => (
                    <TableRow
                      key={r.constituency}
                      hover
                      onClick={() => openRegistry(r)}
                      sx={{ cursor: 'pointer' }}
                    >
                      <TableCell>{r.constituency}</TableCell>
                      <TableCell align="right">{r.projectCount}</TableCell>
                      <TableCell align="right">{currency(r.totalBudget)}</TableCell>
                      <TableCell align="right">{currency(r.totalPaid)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          ) : (
            <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 1.5 }}>
              <Table size="small">
                <TableHead sx={{ '& .MuiTableCell-root': { bgcolor: 'action.hover', fontWeight: 700 } }}>
                  <TableRow>
                    <TableCell>Ward</TableCell>
                    <TableCell>Constituency</TableCell>
                    <TableCell align="right">Projects</TableCell>
                    <TableCell align="right">Total Budget</TableCell>
                    <TableCell align="right">Total Paid</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {wardRows.map((r) => (
                    <TableRow
                      key={`${r.constituency}-${r.ward}`}
                      hover
                      onClick={() => openRegistry(r)}
                      sx={{ cursor: 'pointer' }}
                    >
                      <TableCell>{r.ward}</TableCell>
                      <TableCell>{r.constituency}</TableCell>
                      <TableCell align="right">{r.projectCount}</TableCell>
                      <TableCell align="right">{currency(r.totalBudget)}</TableCell>
                      <TableCell align="right">{currency(r.totalPaid)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Box>
      </Paper>

      <Paper
        elevation={0}
        sx={{ mt: 1.5, p: 1.5, borderRadius: 2, border: '1px solid', borderColor: 'divider' }}
      >
        <Typography variant="subtitle1" fontWeight={800}>
          Distribution Insights
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Supports equitable programme/project distribution decisions.
        </Typography>
        <Grid container spacing={1} sx={{ mt: 0.5, mb: 1.25 }}>
          <Grid item xs={12} md={4}>
            <Paper variant="outlined" sx={{ p: 1, borderRadius: 1.5 }}>
              <Typography variant="caption" color="text.secondary">
                Ideal projects / {distributionInsights.scopeLabel}
              </Typography>
              <Typography variant="subtitle2" fontWeight={700}>
                {distributionInsights.idealProjectsPerScope.toFixed(1)}
              </Typography>
            </Paper>
          </Grid>
          <Grid item xs={12} md={4}>
            <Paper variant="outlined" sx={{ p: 1, borderRadius: 1.5 }}>
              <Typography variant="caption" color="text.secondary">
                Ideal budget / {distributionInsights.scopeLabel}
              </Typography>
              <Typography variant="subtitle2" fontWeight={700}>
                {currency(distributionInsights.idealBudgetPerScope)}
              </Typography>
            </Paper>
          </Grid>
          <Grid item xs={12} md={4}>
            <Paper variant="outlined" sx={{ p: 1, borderRadius: 1.5 }}>
              <Typography variant="caption" color="text.secondary">Average equity score</Typography>
              <Typography variant="subtitle2" fontWeight={700}>
                {distributionInsights.averageEquityScore.toFixed(1)}%
              </Typography>
              <LinearProgress
                variant="determinate"
                value={Math.max(0, Math.min(100, distributionInsights.averageEquityScore))}
                sx={{ mt: 0.5, height: 6, borderRadius: 999 }}
              />
            </Paper>
          </Grid>
        </Grid>

        <Typography variant="subtitle2" sx={{ mb: 0.6, fontWeight: 700 }}>
          Priority {distributionInsights.scopeLabelPlural[0].toUpperCase()}
          {distributionInsights.scopeLabelPlural.slice(1)} (Under-served)
        </Typography>
        <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 1.5 }}>
          <Table size="small">
            <TableHead sx={{ '& .MuiTableCell-root': { bgcolor: 'action.hover', fontWeight: 700 } }}>
              <TableRow>
                <TableCell>
                  {distributionInsights.scopeLabel[0].toUpperCase()}
                  {distributionInsights.scopeLabel.slice(1)}
                </TableCell>
                <TableCell align="right">Project Gap</TableCell>
                <TableCell align="right">Budget Gap</TableCell>
                <TableCell align="right">Deficit Pressure</TableCell>
                <TableCell>Recommendation</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {distributionInsights.underServed.map((r) => (
                <TableRow
                  key={`priority-${r.scopeLabel}-${r.constituency || 'na'}`}
                  hover
                  onClick={() => openRegistry(r)}
                  sx={{ cursor: 'pointer' }}
                >
                  <TableCell>{r.scopeLabel}</TableCell>
                  <TableCell align="right">{r.projectGap.toFixed(1)}</TableCell>
                  <TableCell align="right">{currency(Math.max(r.budgetGap, 0))}</TableCell>
                  <TableCell align="right">{r.deficitPressure.toFixed(1)}</TableCell>
                  <TableCell>{r.recommendation}</TableCell>
                </TableRow>
              ))}
              {distributionInsights.underServed.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} align="center">
                    No current {distributionInsights.scopeLabel} deficits detected.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </Box>
  );
};

export default RegionalBreakdownDashboardPage;
