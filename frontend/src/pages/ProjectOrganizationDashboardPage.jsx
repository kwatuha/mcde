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
  FormControl,
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
import projectService from '../api/projectService';
import { useAuth } from '../context/AuthContext.jsx';
import { isAdmin } from '../utils/privilegeUtils.js';
import { tokens } from './dashboard/theme';

const LEVEL_OPTIONS = [
  { value: 'agency', label: 'Agency' },
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
  const { user, hasPrivilege } = useAuth();
  const [level, setLevel] = useState('agency');
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
      if (level === 'agency' && row.agency && row.agency !== 'All') {
        params.agency = row.agency;
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
            Understand distribution of projects across agencies, state departments, and ministries.
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
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.2} sx={{ mb: 2 }} useFlexGap flexWrap="wrap">
            <Chip
              icon={<AccountTreeIcon />}
              label={`${summary.orgCount} organizations`}
              sx={{ bgcolor: colors.blueAccent[700], color: colors.grey[100], fontWeight: 600 }}
            />
            <Chip
              label={`${summary.totalProjects.toLocaleString()} projects`}
              sx={{ bgcolor: colors.greenAccent[700], color: colors.grey[100], fontWeight: 600 }}
            />
            <Chip
              label={`Allocated: KES ${summary.totalAllocated.toLocaleString()}`}
              sx={{ bgcolor: colors.orange?.[700] || colors.yellowAccent[700], color: colors.grey[100], fontWeight: 600 }}
            />
            <Chip
              label={`Disbursed: KES ${summary.totalDisbursed.toLocaleString()}`}
              sx={{ bgcolor: colors.purple?.[700] || colors.blueAccent[800], color: colors.grey[100], fontWeight: 600 }}
            />
          </Stack>

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
                  <XAxis type="number" allowDecimals={false} stroke={theme.palette.mode === 'dark' ? colors.grey[300] : colors.grey[700]} />
                  <YAxis type="category" dataKey="name" width={320} tick={{ fontSize: 11, fill: theme.palette.mode === 'dark' ? colors.grey[200] : colors.grey[800] }} />
                  <Tooltip />
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

      <Dialog open={openProjectsModal} onClose={() => setOpenProjectsModal(false)} fullWidth maxWidth="lg">
        <DialogTitle sx={{ fontWeight: 700 }}>Projects: {selectedOrgLabel}</DialogTitle>
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
            <TableContainer sx={{ border: `1px solid ${theme.palette.divider}`, borderRadius: 1 }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>ID</TableCell>
                    <TableCell>Project Name</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Ministry</TableCell>
                    <TableCell>State Department</TableCell>
                    <TableCell>Agency</TableCell>
                    <TableCell align="right">Allocated (KES)</TableCell>
                    <TableCell align="right">Disbursed (KES)</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {selectedProjects.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>{p.id}</TableCell>
                      <TableCell>{p.projectName || '—'}</TableCell>
                      <TableCell>{p.status || '—'}</TableCell>
                      <TableCell>{p.ministry || '—'}</TableCell>
                      <TableCell>{p.stateDepartment || '—'}</TableCell>
                      <TableCell>{p.agency || '—'}</TableCell>
                      <TableCell align="right">{Number(p.allocatedBudget || 0).toLocaleString()}</TableCell>
                      <TableCell align="right">{Number(p.disbursedBudget || 0).toLocaleString()}</TableCell>
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

