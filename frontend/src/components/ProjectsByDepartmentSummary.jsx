import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Chip,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import accountabilityService from '../api/accountabilityService';
import { formatCurrency } from '../utils/helpers';

function compactCurrency(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return '—';
  if (Math.abs(n) >= 1_000_000) return `KES ${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `KES ${(n / 1_000).toFixed(0)}K`;
  return formatCurrency(n);
}

/**
 * Compact workspace panel: project counts rolled up by department (org-scoped).
 * Click a row to list projects in that department.
 */
export default function ProjectsByDepartmentSummary({ title = 'Projects by department', sx }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState({});

  const [modalOpen, setModalOpen] = useState(false);
  const [selectedDept, setSelectedDept] = useState(null);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [projectsError, setProjectsError] = useState('');
  const [projects, setProjects] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await accountabilityService.getProjectsByDepartmentSummary();
      setRows(data?.rows || []);
      setSummary(data?.summary || {});
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Failed to load department summary.');
      setRows([]);
      setSummary({});
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openDepartment = async (row) => {
    setSelectedDept(row);
    setModalOpen(true);
    setProjectsLoading(true);
    setProjectsError('');
    setProjects([]);
    try {
      const data = await accountabilityService.getProjectsByDepartment(
        row.departmentKey || row.department
      );
      setProjects(data?.projects || []);
    } catch (err) {
      setProjectsError(err?.response?.data?.message || err?.message || 'Failed to load projects.');
    } finally {
      setProjectsLoading(false);
    }
  };

  const closeModal = () => {
    setModalOpen(false);
    setSelectedDept(null);
    setProjects([]);
    setProjectsError('');
  };

  return (
    <>
      <Paper variant="outlined" sx={{ p: { xs: 1.5, md: 2 }, borderRadius: 2, ...sx }}>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          alignItems={{ sm: 'center' }}
          justifyContent="space-between"
          spacing={1}
          sx={{ mb: 1.5 }}
        >
          <Box>
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
              {title}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Which departments own projects in your scope — click a row for the project list.
            </Typography>
          </Box>
          {!loading && !error ? (
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              <Chip size="small" label={`Departments: ${summary.departments ?? rows.length}`} />
              <Chip size="small" variant="outlined" label={`Projects: ${summary.projects ?? 0}`} />
            </Stack>
          ) : null}
        </Stack>

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
            <CircularProgress size={28} />
          </Box>
        ) : error ? (
          <Alert severity="error">{error}</Alert>
        ) : rows.length === 0 ? (
          <Alert severity="info">No projects found in your current scope.</Alert>
        ) : (
          <TableContainer sx={{ maxHeight: 320 }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 700 }}>Department</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>Projects</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>Budget</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>Paid</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>Avg progress</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((row) => (
                  <TableRow
                    key={row.departmentKey || row.department}
                    hover
                    sx={{ cursor: 'pointer' }}
                    onClick={() => openDepartment(row)}
                  >
                    <TableCell>{row.department}</TableCell>
                    <TableCell align="right">{row.projects}</TableCell>
                    <TableCell align="right">{compactCurrency(row.totalBudget)}</TableCell>
                    <TableCell align="right">{compactCurrency(row.totalPaid)}</TableCell>
                    <TableCell align="right">{`${Number(row.avgProgress || 0).toFixed(1)}%`}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>

      <Dialog open={modalOpen} onClose={closeModal} fullWidth maxWidth="md">
        <DialogTitle sx={{ pr: 6 }}>
          {selectedDept?.department || 'Department'}
          <Typography variant="body2" color="text.secondary">
            {selectedDept?.projects ?? projects.length} project
            {(selectedDept?.projects ?? projects.length) === 1 ? '' : 's'} in your scope
          </Typography>
          <IconButton
            aria-label="Close"
            onClick={closeModal}
            sx={{ position: 'absolute', right: 8, top: 8 }}
          >
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          {projectsLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress size={28} />
            </Box>
          ) : projectsError ? (
            <Alert severity="error">{projectsError}</Alert>
          ) : projects.length === 0 ? (
            <Alert severity="info">No projects for this department in your scope.</Alert>
          ) : (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700 }}>Project</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>Progress</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Location</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }} width={48} />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {projects.map((project) => {
                    const location = [project.subcounty, project.ward].filter(Boolean).join(' · ');
                    return (
                      <TableRow
                        key={project.projectId}
                        hover
                        sx={{ cursor: 'pointer' }}
                        onClick={() => navigate(`/projects/${project.projectId}`)}
                      >
                        <TableCell>
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>
                            {project.projectName || `Project #${project.projectId}`}
                          </Typography>
                          {project.directorate ? (
                            <Typography variant="caption" color="text.secondary">
                              {project.directorate}
                            </Typography>
                          ) : null}
                        </TableCell>
                        <TableCell>{project.status || '—'}</TableCell>
                        <TableCell align="right">
                          {`${Number(project.progressPct || 0).toFixed(0)}%`}
                        </TableCell>
                        <TableCell>{location || '—'}</TableCell>
                        <TableCell align="right">
                          <IconButton
                            size="small"
                            aria-label={`Open ${project.projectName || 'project'}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/projects/${project.projectId}`);
                            }}
                          >
                            <OpenInNewIcon fontSize="small" />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
