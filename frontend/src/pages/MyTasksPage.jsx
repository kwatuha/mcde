import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import WarningIcon from '@mui/icons-material/Warning';
import FactCheckIcon from '@mui/icons-material/FactCheck';
import { useNavigate } from 'react-router-dom';
import apiService from '../api';
import { ROUTES } from '../configs/appConfig';
import {
  resolveWorkflowNavigationPath,
  workflowEntityTypeLabel,
} from '../utils/workflowNavigation';

function formatWhen(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return String(iso);
  }
}

function taskTypeLabel(type) {
  switch (type) {
    case 'project_escalation':
      return 'Project escalation';
    case 'workflow_approval':
      return 'Workflow approval';
    default:
      return type || 'Task';
  }
}

function taskTypeIcon(type) {
  if (type === 'project_escalation') return <WarningIcon fontSize="small" />;
  return <FactCheckIcon fontSize="small" />;
}

function severityColor(severity) {
  switch (severity) {
    case 'critical':
      return 'error';
    case 'high':
      return 'warning';
    case 'medium':
      return 'info';
    case 'low':
      return 'success';
    default:
      return 'default';
  }
}

const MyTasksPage = () => {
  const navigate = useNavigate();
  const [summary, setSummary] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('all');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiService.myTasks.list();
      setSummary(data?.summary || null);
      setTasks(Array.isArray(data?.tasks) ? data.tasks : []);
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || 'Failed to load tasks');
      setTasks([]);
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    if (filter === 'all') return tasks;
    return tasks.filter((t) => t.taskType === filter);
  }, [tasks, filter]);

  const openTask = (task) => {
    if (task.taskType === 'project_escalation') {
      navigate(ROUTES.PROJECT_ESCALATIONS);
      return;
    }
    if (task.taskType === 'workflow_approval') {
      const path = resolveWorkflowNavigationPath(task.meta?.raw || task.meta || {});
      if (path?.startsWith('/')) navigate(path);
      else navigate(ROUTES.WORKFLOW_APPROVALS);
    }
  };

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1200, mx: 'auto' }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
        <Box>
          <Typography variant="h5" fontWeight={700}>
            My tasks
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Pending items assigned to you or waiting for your role — project escalations and workflow approvals.
          </Typography>
        </Box>
        <Tooltip title="Refresh">
          <IconButton onClick={load} disabled={loading} aria-label="Refresh tasks">
            <RefreshIcon />
          </IconButton>
        </Tooltip>
      </Stack>

      {summary && (
        <Stack direction="row" spacing={1} sx={{ mb: 2, flexWrap: 'wrap' }}>
          <Chip label={`${summary.total ?? 0} total pending`} />
          <Chip label={`${summary.projectEscalations ?? 0} escalations`} color="warning" variant="outlined" />
          <Chip label={`${summary.workflowApprovals ?? 0} workflow steps`} color="secondary" variant="outlined" />
        </Stack>
      )}

      <Paper sx={{ p: 2, mb: 2 }}>
        <FormControl size="small" sx={{ minWidth: 200 }}>
          <InputLabel>Filter</InputLabel>
          <Select label="Filter" value={filter} onChange={(e) => setFilter(e.target.value)}>
            <MenuItem value="all">All pending tasks</MenuItem>
            <MenuItem value="project_escalation">Project escalations only</MenuItem>
            <MenuItem value="workflow_approval">Workflow approvals only</MenuItem>
          </Select>
        </FormControl>
      </Paper>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress />
        </Box>
      ) : filtered.length === 0 ? (
        <Paper sx={{ p: 3 }}>
          <Typography variant="body1" gutterBottom>
            No pending tasks in your queue.
          </Typography>
          <Typography variant="body2" color="text.secondary">
            When someone assigns you a project escalation, or a workflow step matches your role, it will appear here.
            Assignments also trigger an email if the server mail settings are configured.
          </Typography>
        </Paper>
      ) : (
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Type</TableCell>
                <TableCell>Task</TableCell>
                <TableCell>Context</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Due / assigned</TableCell>
                <TableCell align="right">Action</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filtered.map((task) => (
                <TableRow key={task.taskId} hover>
                  <TableCell>
                    <Stack direction="row" spacing={0.5} alignItems="center">
                      {taskTypeIcon(task.taskType)}
                      <Typography variant="body2">{taskTypeLabel(task.taskType)}</Typography>
                    </Stack>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" fontWeight={600}>{task.title}</Typography>
                    {task.taskType === 'project_escalation' && task.severity && (
                      <Chip size="small" label={String(task.severity).toUpperCase()} color={severityColor(task.severity)} sx={{ mt: 0.5 }} />
                    )}
                    {task.taskType === 'workflow_approval' && task.meta?.entityType && (
                      <Chip size="small" label={workflowEntityTypeLabel(task.meta.entityType)} sx={{ mt: 0.5 }} />
                    )}
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">{task.subtitle}</Typography>
                    {task.department && (
                      <Typography variant="caption" color="text.secondary" display="block">{task.department}</Typography>
                    )}
                  </TableCell>
                  <TableCell>{task.status || 'pending'}</TableCell>
                  <TableCell>{formatWhen(task.dueAt || task.assignedAt || task.detectedAt)}</TableCell>
                  <TableCell align="right">
                    <Button size="small" endIcon={<OpenInNewIcon />} onClick={() => openTask(task)}>
                      Open
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
        <Button size="small" onClick={() => navigate(ROUTES.PROJECT_ESCALATIONS)}>
          All project escalations
        </Button>
        <Button size="small" onClick={() => navigate(ROUTES.WORKFLOW_APPROVALS)}>
          Workflow approvals inbox
        </Button>
      </Stack>
    </Box>
  );
};

export default MyTasksPage;
