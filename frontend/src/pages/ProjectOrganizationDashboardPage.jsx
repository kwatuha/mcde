import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  Grid,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  useTheme,
} from '@mui/material';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import PaymentsIcon from '@mui/icons-material/Payments';
import projectService from '../api/projectService';
import { useAuth } from '../context/AuthContext.jsx';
import { isAdmin } from '../utils/privilegeUtils.js';
import { getProjectStatusBackgroundColor, getProjectStatusTextColor } from '../utils/projectStatusColors';
import { tokens } from './dashboard/theme';

const LEVEL_OPTIONS = [
  { value: 'state_department', label: 'State Department' },
  { value: 'ministry', label: 'Ministry' },
];

function getOrgLabel(row, level) {
  if (level === 'ministry') return row.ministry || 'Unassigned';
  if (level === 'state_department') return `${row.ministry || 'Unassigned'} / ${row.stateDepartment || 'Unassigned'}`;
  return row.agency || 'Unassigned';
}

export default function ProjectOrganizationDashboardPage() {
  const theme = useTheme();
  const colors = tokens(theme.palette.mode);
  const isLight = theme.palette.mode === 'light';
  const { user, hasPrivilege } = useAuth();
  const [level, setLevel] = useState('state_department');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [rows, setRows] = useState([]);
  const [openProjectsModal, setOpenProjectsModal] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalError, setModalError] = useState('');
  const [selectedOrgLabel, setSelectedOrgLabel] = useState('');
  const [selectedProjects, setSelectedProjects] = useState([]);

  const canAccess =
    isAdmin(user) ||
    hasPrivilege('organization.scope_bypass') ||
    hasPrivilege('project.read_all');

  useEffect(() => {
    if (!canAccess) return;
    const load = async () => {
      try {
        setLoading(true);
        setError('');
        const data = await projectService.analytics.getOrganizationDistribution({ level, limit: 250 });
        setRows(Array.isArray(data) ? data : []);
      } catch (err) {
        setError(err?.response?.data?.message || err?.message || 'Failed to load organization distribution.');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [canAccess, level]);

  const summary = useMemo(() => {
    const totalProjects = rows.reduce((sum, r) => sum + Number(r.projectCount || 0), 0);
    const totalAllocated = rows.reduce((sum, r) => sum + Number(r.allocatedBudget || 0), 0);
    const totalDisbursed = rows.reduce((sum, r) => sum + Number(r.disbursedBudget || 0), 0);
    return {
      orgCount: rows.length,
      totalProjects,
      totalAllocated,
      totalDisbursed,
    };
  }, [rows]);

  const chartData = useMemo(() => (
    rows.slice(0, 15).map((r) => ({
      name: getOrgLabel(r, level),
      projects: Number(r.projectCount || 0),
    }))
  ), [rows, level]);

  const formatKes = (value) => {
    const n = Number(value || 0);
    return `KES ${(n / 1_000_000).toLocaleString('en-KE', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    })}M`;
  };

  const handleOpenProjectsModal = async (row) => {
    const orgLabel = getOrgLabel(row, level);
    setSelectedOrgLabel(orgLabel);
    setOpenProjectsModal(true);
    setModalLoading(true);
    setModalError('');
    setSelectedProjects([]);
    try {
      const params = { limit: 500 };
      if (row.ministry && row.ministry !== 'All') params.ministry = row.ministry;
      if (level !== 'ministry' && row.stateDepartment && row.stateDepartment !== 'All') {
        params.stateDepartment = row.stateDepartment;
      }
      const data = await projectService.analytics.getProjectsForOrganization(params);
      setSelectedProjects(Array.isArray(data) ? data : []);
    } catch (err) {
      setModalError(err?.response?.data?.message || err?.message || 'Failed to load projects for this organization.');
    } finally {
      setModalLoading(false);
    }
  };

  if (!canAccess) {
    return (
      <Box sx={{ p: 2 }}>
        <Alert severity="warning">Access denied. This dashboard is available to super admin/admin users.</Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 2 }}>
      <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={1.5} sx={{ mb: 2 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700, color: colors.grey[100] }}>
            Projects by Organization
          </Typography>
          <Typography variant="body2" sx={{ color: colors.grey[300] }}>
            Understand distribution of projects across state departments and ministries.
          </Typography>
        </Box>
        <FormControl size="small" sx={{ minWidth: 220 }}>
          <InputLabel id="org-level-label">Group by</InputLabel>
          <Select
            labelId="org-level-label"
            value={level}
            label="Group by"
            onChange={(e) => setLevel(e.target.value)}
          >
            {LEVEL_OPTIONS.map((o) => (
              <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
            ))}
          </Select>
        </FormControl>
      </Stack>

      {loading ? (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <CircularProgress size={20} />
          <Typography>Loading organization distribution...</Typography>
        </Box>
      ) : error ? (
        <Alert severity="error">{error}</Alert>
      ) : (
        <>
          <Box
            sx={{
              mb: 2,
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
              <Grid item sx={{ minWidth: { xs: '110px', sm: '130px', md: '145px' }, flex: '1 1 0', maxWidth: { md: 'none' } }}>
                <Card
                  elevation={0}
                  sx={{
                    height: '100%',
                    background: `linear-gradient(135deg, ${colors.blueAccent[600]} 0%, ${colors.blueAccent[800]} 100%)`,
                    color: colors.grey[100],
                    border: 'none',
                    transition: 'transform 0.2s',
                    '&:hover': { transform: 'translateY(-2px)', boxShadow: 3 },
                  }}
                >
                  <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                    <Box display="flex" alignItems="center" justifyContent="space-between" mb={0.5}>
                      <Typography variant="caption" sx={{ opacity: 0.9, fontSize: '0.7rem', fontWeight: 600 }}>
                        Organizations
                      </Typography>
                      <AccountTreeIcon sx={{ fontSize: 20, opacity: 0.85 }} />
                    </Box>
                    <Typography variant="h5" sx={{ fontWeight: 700, fontSize: '1.5rem', lineHeight: 1.2 }}>
                      {summary.orgCount.toLocaleString()}
                    </Typography>
                    <Typography variant="caption" sx={{ opacity: 0.85, fontSize: '0.65rem' }}>
                      In this view
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
              <Grid item sx={{ minWidth: { xs: '110px', sm: '130px', md: '145px' }, flex: '1 1 0', maxWidth: { md: 'none' } }}>
                <Card
                  elevation={0}
                  sx={{
                    height: '100%',
                    background: `linear-gradient(135deg, ${colors.greenAccent[600]} 0%, ${colors.greenAccent[800]} 100%)`,
                    color: colors.grey[100],
                    border: 'none',
                    transition: 'transform 0.2s',
                    '&:hover': { transform: 'translateY(-2px)', boxShadow: 3 },
                  }}
                >
                  <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                    <Box display="flex" alignItems="center" justifyContent="space-between" mb={0.5}>
                      <Typography variant="caption" sx={{ opacity: 0.9, fontSize: '0.7rem', fontWeight: 600 }}>
                        Projects
                      </Typography>
                      <FolderOpenIcon sx={{ fontSize: 20, opacity: 0.85 }} />
                    </Box>
                    <Typography variant="h5" sx={{ fontWeight: 700, fontSize: '1.5rem', lineHeight: 1.2 }}>
                      {summary.totalProjects.toLocaleString()}
                    </Typography>
                    <Typography variant="caption" sx={{ opacity: 0.85, fontSize: '0.65rem' }}>
                      Across organizations
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
              <Grid item sx={{ minWidth: { xs: '110px', sm: '130px', md: '145px' }, flex: '1 1 0', maxWidth: { md: 'none' } }}>
                <Card
                  elevation={0}
                  sx={{
                    height: '100%',
                    background: theme.palette.mode === 'dark'
                      ? `linear-gradient(135deg, ${colors.orange?.[600] || colors.yellowAccent[600]} 0%, ${colors.orange?.[800] || colors.yellowAccent[800]} 100%)`
                      : 'linear-gradient(135deg, #fb923c 0%, #ea580c 100%)',
                    color: colors.grey[100],
                    border: 'none',
                    transition: 'transform 0.2s',
                    '&:hover': { transform: 'translateY(-2px)', boxShadow: 3 },
                  }}
                >
                  <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                    <Box display="flex" alignItems="center" justifyContent="space-between" mb={0.5}>
                      <Typography variant="caption" sx={{ opacity: 0.9, fontSize: '0.7rem', fontWeight: 600 }}>
                        Allocated
                      </Typography>
                      <AccountBalanceWalletIcon sx={{ fontSize: 20, opacity: 0.85 }} />
                    </Box>
                    <Typography variant="h5" sx={{ fontWeight: 700, fontSize: '1.25rem', lineHeight: 1.2, wordBreak: 'break-word' }}>
                      {formatKes(summary.totalAllocated)}
                    </Typography>
                    <Typography variant="caption" sx={{ opacity: 0.85, fontSize: '0.65rem' }}>
                      KES {summary.totalAllocated.toLocaleString()}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
              <Grid item sx={{ minWidth: { xs: '110px', sm: '130px', md: '145px' }, flex: '1 1 0', maxWidth: { md: 'none' } }}>
                <Card
                  elevation={0}
                  sx={{
                    height: '100%',
                    background: theme.palette.mode === 'dark'
                      ? `linear-gradient(135deg, ${colors.purple?.[600] || colors.blueAccent[600]} 0%, ${colors.purple?.[800] || colors.blueAccent[900]} 100%)`
                      : 'linear-gradient(135deg, #a855f7 0%, #7c3aed 100%)',
                    color: colors.grey[100],
                    border: 'none',
                    transition: 'transform 0.2s',
                    '&:hover': { transform: 'translateY(-2px)', boxShadow: 3 },
                  }}
                >
                  <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                    <Box display="flex" alignItems="center" justifyContent="space-between" mb={0.5}>
                      <Typography variant="caption" sx={{ opacity: 0.9, fontSize: '0.7rem', fontWeight: 600 }}>
                        Disbursed
                      </Typography>
                      <PaymentsIcon sx={{ fontSize: 20, opacity: 0.85 }} />
                    </Box>
                    <Typography variant="h5" sx={{ fontWeight: 700, fontSize: '1.25rem', lineHeight: 1.2, wordBreak: 'break-word' }}>
                      {formatKes(summary.totalDisbursed)}
                    </Typography>
                    <Typography variant="caption" sx={{ opacity: 0.85, fontSize: '0.65rem' }}>
                      KES {summary.totalDisbursed.toLocaleString()}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>
          </Box>

          <Card
            sx={{
              mb: 2,
              borderRadius: 3,
              background: theme.palette.mode === 'dark'
                ? `linear-gradient(135deg, ${colors.primary[400]} 0%, ${colors.primary[500]} 100%)`
                : 'linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%)',
              border: `1px solid ${theme.palette.mode === 'dark' ? colors.blueAccent[700] : 'rgba(0,0,0,0.08)'}`,
              boxShadow: theme.palette.mode === 'dark'
                ? '0 8px 32px rgba(0,0,0,0.35)'
                : '0 4px 20px rgba(0,0,0,0.08)',
            }}
          >
            <CardContent sx={{ height: 320 }}>
              <Typography sx={{ fontWeight: 700, mb: 1, color: colors.grey[100] }}>Top 15 organizations by project count</Typography>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} layout="vertical" margin={{ left: 20, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={theme.palette.mode === 'dark' ? colors.grey[700] : colors.grey[300]} />
                  <XAxis
                    type="number"
                    allowDecimals={false}
                    stroke={theme.palette.mode === 'dark' ? colors.grey[500] : colors.grey[600]}
                    tick={{
                      fontSize: 12,
                      fontWeight: 600,
                      fill: theme.palette.text.primary,
                    }}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={320}
                    stroke={theme.palette.mode === 'dark' ? colors.grey[500] : colors.grey[600]}
                    tick={{
                      fontSize: 12,
                      fontWeight: 600,
                      fill: theme.palette.text.primary,
                    }}
                  />
                  <Tooltip
                    contentStyle={{
                      fontWeight: 600,
                      borderRadius: 8,
                      border: `1px solid ${theme.palette.divider}`,
                      color: theme.palette.text.primary,
                    }}
                    labelStyle={{
                      fontWeight: 600,
                      color: theme.palette.text.primary,
                    }}
                    itemStyle={{ fontWeight: 600, color: theme.palette.text.secondary }}
                  />
                  <Bar dataKey="projects" fill={colors.blueAccent[500]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <TableContainer sx={{ border: `1px solid ${theme.palette.divider}`, borderRadius: 1.5, backgroundColor: theme.palette.mode === 'dark' ? colors.primary[500] : '#fff' }}>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ backgroundColor: theme.palette.mode === 'dark' ? colors.blueAccent[900] : colors.blueAccent[50] }}>
                  <TableCell sx={{ fontWeight: 700 }}>Organization</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>Projects</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>Allocated Budget (KES)</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>Disbursed Budget (KES)</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((r, idx) => (
                  <TableRow key={`${getOrgLabel(r, level)}-${idx}`}>
                    <TableCell>
                      <Button
                        variant="text"
                        onClick={() => handleOpenProjectsModal(r)}
                        sx={{ textTransform: 'none', p: 0, minWidth: 0, fontWeight: 700, color: colors.blueAccent[400] }}
                      >
                        {getOrgLabel(r, level)}
                      </Button>
                    </TableCell>
                    <TableCell align="right">{Number(r.projectCount || 0).toLocaleString()}</TableCell>
                    <TableCell align="right">{Number(r.allocatedBudget || 0).toLocaleString()}</TableCell>
                    <TableCell align="right">{Number(r.disbursedBudget || 0).toLocaleString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </>
      )}

      <Dialog open={openProjectsModal} onClose={() => setOpenProjectsModal(false)} fullWidth maxWidth="xl">
        <DialogTitle sx={{ fontWeight: 700, pb: 1 }}>
          Projects for Selected Organization
          <Typography variant="body2" sx={{ mt: 0.5, color: 'text.secondary', fontWeight: 500 }}>
            {selectedOrgLabel}
          </Typography>
        </DialogTitle>
        <Divider />
        <DialogContent dividers>
          {modalLoading ? (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 2 }}>
              <CircularProgress size={20} />
              <Typography>Loading projects...</Typography>
            </Box>
          ) : modalError ? (
            <Alert severity="error">{modalError}</Alert>
          ) : selectedProjects.length === 0 ? (
            <Alert severity="info">No projects found for this organization.</Alert>
          ) : (
            <TableContainer
              sx={{
                border: `1px solid ${theme.palette.divider}`,
                borderRadius: 1.5,
                maxHeight: 520,
                backgroundColor: theme.palette.background.paper,
              }}
            >
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700 }}>ID</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Project Name</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Ministry</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>State Department</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Agency</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>Allocated Budget</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>Disbursed Budget</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {selectedProjects.map((p, index) => (
                    <TableRow
                      key={p.id}
                      hover
                      sx={{
                        '&:nth-of-type(odd)': {
                          backgroundColor: theme.palette.mode === 'dark'
                            ? 'rgba(255,255,255,0.02)'
                            : 'rgba(0,0,0,0.015)',
                        },
                      }}
                    >
                      <TableCell>{p.id}</TableCell>
                      <TableCell sx={{ minWidth: 240, fontWeight: 600 }}>{p.projectName || '—'}</TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          label={p.status || 'Unknown'}
                          sx={{
                            fontWeight: 700,
                            backgroundColor: getProjectStatusBackgroundColor(p.status),
                            color: getProjectStatusTextColor(p.status),
                            border: `1px solid ${theme.palette.divider}`,
                          }}
                        />
                      </TableCell>
                      <TableCell>{p.ministry || '—'}</TableCell>
                      <TableCell>{p.stateDepartment || '—'}</TableCell>
                      <TableCell>{p.agency || '—'}</TableCell>
                      <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                        {formatKes(p.allocatedBudget)}
                      </TableCell>
                      <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                        {formatKes(p.disbursedBudget)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </DialogContent>
      </Dialog>
    </Box>
  );
}

