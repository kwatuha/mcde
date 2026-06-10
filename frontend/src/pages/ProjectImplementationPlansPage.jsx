import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Grid,
  InputAdornment,
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
} from '@mui/material';
import {
  AccountTree as AccountTreeIcon,
  Assessment as AssessmentIcon,
  FactCheck as FactCheckIcon,
  Search as SearchIcon,
  Visibility as VisibilityIcon,
} from '@mui/icons-material';
import projectService from '../api/projectService';
import { ROUTES } from '../configs/appConfig';

const getProjectId = (project) => project?.id || project?.projectId || project?.project_id;

const getProjectName = (project) => (
  project?.projectName
  || project?.name
  || project?.project_name
  || `Project #${getProjectId(project) || 'N/A'}`
);

const formatCurrency = (value) => {
  const amount = Number(value || 0);
  return `KES ${amount.toLocaleString('en-KE', { maximumFractionDigits: 0 })}`;
};

const getProjectBudget = (project) => (
  project?.costOfProject
  ?? project?.cost_of_project
  ?? project?.allocatedAmountKes
  ?? project?.allocated_amount_kes
  ?? project?.totalBudget
  ?? project?.budget
  ?? project?.approvedBudget
  ?? 0
);

const normalizeProjectList = (response) => {
  if (Array.isArray(response)) return response;
  if (Array.isArray(response?.projects)) return response.projects;
  if (Array.isArray(response?.data)) return response.data;
  if (Array.isArray(response?.rows)) return response.rows;
  return [];
};

const getReadinessItems = (project) => {
  const hasDates = Boolean(project?.startDate || project?.start_date) && Boolean(project?.endDate || project?.end_date);
  const hasBudget = Number(getProjectBudget(project)) > 0;
  const hasLocation = Boolean(project?.subcountyNames || project?.subcounty || project?.wardNames || project?.ward);
  const hasDepartment = Boolean(project?.departmentName || project?.departmentAlias || project?.directorate);
  const hasStatus = Boolean(project?.status || project?.projectStatus);

  return [
    { label: 'Dates', ready: hasDates },
    { label: 'Budget', ready: hasBudget },
    { label: 'Location', ready: hasLocation },
    { label: 'Department', ready: hasDepartment },
    { label: 'Status', ready: hasStatus },
  ];
};

const ProjectImplementationPlansPage = () => {
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function loadProjects() {
      setLoading(true);
      setError('');
      try {
        const response = await projectService.projects.getProjects({ limit: 5000 });
        if (!cancelled) {
          setProjects(normalizeProjectList(response));
        }
      } catch (err) {
        if (!cancelled) {
          setError(err?.response?.data?.message || err?.message || 'Failed to load implementation plans.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadProjects();
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredProjects = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter((project) => {
      const haystack = [
        getProjectName(project),
        project?.departmentName,
        project?.departmentAlias,
        project?.directorate,
        project?.status,
        project?.projectStatus,
        project?.subcountyNames,
        project?.wardNames,
        project?.financialYear,
        project?.financialYearName,
      ].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(q);
    });
  }, [projects, search]);

  const readinessSummary = useMemo(() => {
    const rows = filteredProjects.map((project) => {
      const items = getReadinessItems(project);
      const ready = items.filter((item) => item.ready).length;
      return { ready, total: items.length };
    });
    const complete = rows.filter((row) => row.ready === row.total).length;
    const partial = rows.filter((row) => row.ready > 0 && row.ready < row.total).length;
    const missing = rows.filter((row) => row.ready === 0).length;
    return { complete, partial, missing };
  }, [filteredProjects]);

  const openImplementationPlan = (projectId) => {
    navigate(`/projects/${projectId}?tab=implementation-plan`);
  };

  if (loading) {
    return (
      <Box sx={{ py: 6, display: 'flex', justifyContent: 'center' }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} justifyContent="space-between" sx={{ mb: 2 }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 800, display: 'flex', alignItems: 'center', gap: 1 }}>
            <AccountTreeIcon color="primary" />
            Implementation Plans
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, maxWidth: 920 }}>
            Cross-project workbench for checking whether each project has enough structure to support implementation:
            activities, schedule, milestones, BQ, monitoring evidence, risks, and evaluation.
          </Typography>
        </Box>
        <Button
          variant="outlined"
          startIcon={<FactCheckIcon />}
          onClick={() => navigate(ROUTES.PROJECT_EVALUATION)}
        >
          Evaluation Workbench
        </Button>
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid item xs={12} md={4}>
          <Card
            variant="outlined"
            onClick={() => navigate(`${ROUTES.PROJECTS}?implementationReadiness=complete`)}
            sx={{ cursor: 'pointer', '&:hover': { boxShadow: 3 } }}
          >
            <CardContent>
              <Typography variant="overline" color="text.secondary">Complete basics</Typography>
              <Typography variant="h4" sx={{ fontWeight: 800 }}>{readinessSummary.complete}</Typography>
              <Typography variant="caption" color="text.secondary">Click to view in Projects Registry</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={4}>
          <Card
            variant="outlined"
            onClick={() => navigate(`${ROUTES.PROJECTS}?implementationReadiness=partial`)}
            sx={{ cursor: 'pointer', '&:hover': { boxShadow: 3 } }}
          >
            <CardContent>
              <Typography variant="overline" color="text.secondary">Partially ready</Typography>
              <Typography variant="h4" sx={{ fontWeight: 800 }}>{readinessSummary.partial}</Typography>
              <Typography variant="caption" color="text.secondary">Click to view in Projects Registry</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={4}>
          <Card
            variant="outlined"
            onClick={() => navigate(`${ROUTES.PROJECTS}?implementationReadiness=missing`)}
            sx={{ cursor: 'pointer', '&:hover': { boxShadow: 3 } }}
          >
            <CardContent>
              <Typography variant="overline" color="text.secondary">Needs setup</Typography>
              <Typography variant="h4" sx={{ fontWeight: 800 }}>{readinessSummary.missing}</Typography>
              <Typography variant="caption" color="text.secondary">Click to view in Projects Registry</Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <TextField
          fullWidth
          size="small"
          label="Search implementation plans"
          placeholder="Search by project, department, status, location, or financial year"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon />
              </InputAdornment>
            ),
          }}
        />
      </Paper>

      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell><strong>Project</strong></TableCell>
              <TableCell><strong>Department</strong></TableCell>
              <TableCell><strong>FY</strong></TableCell>
              <TableCell><strong>Status</strong></TableCell>
              <TableCell><strong>Budget</strong></TableCell>
              <TableCell><strong>Implementation Readiness</strong></TableCell>
              <TableCell align="right"><strong>Actions</strong></TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredProjects.map((project) => {
              const projectId = getProjectId(project);
              const readinessItems = getReadinessItems(project);
              const readyCount = readinessItems.filter((item) => item.ready).length;
              const totalBudget = getProjectBudget(project);
              return (
                <TableRow key={projectId || getProjectName(project)} hover>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>
                      {getProjectName(project)}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {project?.subcountyNames || project?.wardNames || project?.subcounty || 'Location not set'}
                    </Typography>
                  </TableCell>
                  <TableCell>{project?.departmentAlias || project?.departmentName || project?.directorate || 'N/A'}</TableCell>
                  <TableCell>{project?.financialYear || project?.financialYearName || 'N/A'}</TableCell>
                  <TableCell>{project?.status || project?.projectStatus || 'N/A'}</TableCell>
                  <TableCell>{formatCurrency(totalBudget)}</TableCell>
                  <TableCell>
                    <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
                      <Chip
                        size="small"
                        color={readyCount === readinessItems.length ? 'success' : readyCount > 0 ? 'warning' : 'default'}
                        label={`${readyCount}/${readinessItems.length} basics`}
                      />
                      {readinessItems.map((item) => (
                        <Chip
                          key={item.label}
                          size="small"
                          variant={item.ready ? 'filled' : 'outlined'}
                          color={item.ready ? 'success' : 'default'}
                          label={item.label}
                        />
                      ))}
                    </Stack>
                  </TableCell>
                  <TableCell align="right">
                    <Stack direction="row" spacing={1} justifyContent="flex-end">
                      <Button
                        size="small"
                        variant="contained"
                        startIcon={<VisibilityIcon />}
                        disabled={!projectId}
                        onClick={() => openImplementationPlan(projectId)}
                      >
                        Open Plan
                      </Button>
                      <Button
                        size="small"
                        variant="outlined"
                        startIcon={<AssessmentIcon />}
                        disabled={!projectId}
                        onClick={() => navigate(`${ROUTES.PROJECT_EVALUATION}?projectId=${encodeURIComponent(projectId)}`)}
                      >
                        Evaluate
                      </Button>
                    </Stack>
                  </TableCell>
                </TableRow>
              );
            })}
            {filteredProjects.length === 0 && (
              <TableRow>
                <TableCell colSpan={7}>
                  <Alert severity="info">No projects match the current search.</Alert>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
};

export default ProjectImplementationPlansPage;
