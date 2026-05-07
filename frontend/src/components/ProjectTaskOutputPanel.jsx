import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
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
} from '@mui/material';
import projectService from '../api/projectService';

const SUBTASK_STATUSES = ['not_started', 'in_progress', 'completed', 'blocked'];
const OUTPUT_STATUSES = ['on_track', 'at_risk', 'delayed', 'completed'];

const prettyStatus = (value) => String(value || '').replace(/_/g, ' ');

const toNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

export default function ProjectTaskOutputPanel({ projectId }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tasks, setTasks] = useState([]);
  const [subtasksByTask, setSubtasksByTask] = useState({});
  const [outputs, setOutputs] = useState([]);
  const [creatingTask, setCreatingTask] = useState(false);
  const [taskForm, setTaskForm] = useState({ taskName: '', status: 'not_started', dueDate: '' });
  const [subtaskFormByTask, setSubtaskFormByTask] = useState({});
  const [outputForm, setOutputForm] = useState({
    outputName: '',
    unitOfMeasure: '',
    targetValue: '',
    achievedValue: '',
    reportingPeriod: '',
    status: 'on_track',
  });

  const load = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setError('');
    try {
      const [taskRows, outputRows] = await Promise.all([
        projectService.tasks.getTasksForProject(projectId),
        projectService.outputs.getForProject(projectId),
      ]);
      const taskList = Array.isArray(taskRows) ? taskRows : [];
      setTasks(taskList);
      setOutputs(Array.isArray(outputRows) ? outputRows : []);
      if (!taskList.length) {
        setSubtasksByTask({});
      } else {
        const subtaskRows = await Promise.all(
          taskList.map(async (t) => ({
            taskId: t.taskId,
            rows: await projectService.tasks.getSubtasksForTask(t.taskId),
          }))
        );
        const next = {};
        subtaskRows.forEach((entry) => {
          next[entry.taskId] = Array.isArray(entry.rows) ? entry.rows : [];
        });
        setSubtasksByTask(next);
      }
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || 'Failed to load task/output register.');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  const outputSummary = useMemo(() => {
    const total = outputs.length;
    const completed = outputs.filter((o) => String(o.status) === 'completed').length;
    const totalTarget = outputs.reduce((sum, o) => sum + toNumber(o.targetValue), 0);
    const totalAchieved = outputs.reduce((sum, o) => sum + toNumber(o.achievedValue), 0);
    const completionRate = totalTarget > 0 ? Math.min(100, (totalAchieved / totalTarget) * 100) : 0;
    return { total, completed, totalTarget, totalAchieved, completionRate };
  }, [outputs]);

  const handleCreateTask = async () => {
    if (!String(taskForm.taskName || '').trim()) return;
    setCreatingTask(true);
    try {
      await projectService.tasks.createTask({
        taskName: taskForm.taskName.trim(),
        status: taskForm.status,
        dueDate: taskForm.dueDate || null,
        projectId: Number(projectId),
      });
      setTaskForm({ taskName: '', status: 'not_started', dueDate: '' });
      await load();
    } finally {
      setCreatingTask(false);
    }
  };

  const handleCreateSubtask = async (taskId) => {
    const form = subtaskFormByTask[taskId] || { subtaskName: '', status: 'not_started', dueDate: '' };
    if (!String(form.subtaskName || '').trim()) return;
    await projectService.tasks.createSubtask(taskId, {
      subtaskName: form.subtaskName.trim(),
      status: form.status || 'not_started',
      dueDate: form.dueDate || null,
    });
    setSubtaskFormByTask((prev) => ({
      ...prev,
      [taskId]: { subtaskName: '', status: 'not_started', dueDate: '' },
    }));
    await load();
  };

  const handleCreateOutput = async () => {
    if (!String(outputForm.outputName || '').trim()) return;
    await projectService.outputs.createForProject(projectId, {
      outputName: outputForm.outputName.trim(),
      unitOfMeasure: outputForm.unitOfMeasure || null,
      targetValue: outputForm.targetValue || null,
      achievedValue: outputForm.achievedValue || null,
      reportingPeriod: outputForm.reportingPeriod || null,
      status: outputForm.status || 'on_track',
    });
    setOutputForm({
      outputName: '',
      unitOfMeasure: '',
      targetValue: '',
      achievedValue: '',
      reportingPeriod: '',
      status: 'on_track',
    });
    await load();
  };

  if (loading) {
    return (
      <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, mb: 2 }}>
        <Stack direction="row" spacing={1} alignItems="center">
          <CircularProgress size={20} />
          <Typography variant="body2">Loading task and output register...</Typography>
        </Stack>
      </Paper>
    );
  }

  return (
    <Stack spacing={2} sx={{ mb: 2 }}>
      {error && <Alert severity="error">{error}</Alert>}

      <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}>
          <Typography variant="subtitle1" fontWeight={700}>
            Subtasks Register
          </Typography>
          <Chip size="small" label={`Tasks: ${tasks.length}`} />
        </Stack>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} sx={{ mb: 1.5 }}>
          <TextField
            label="Task name"
            value={taskForm.taskName}
            onChange={(e) => setTaskForm((p) => ({ ...p, taskName: e.target.value }))}
            size="small"
            fullWidth
          />
          <TextField
            select
            label="Status"
            value={taskForm.status}
            onChange={(e) => setTaskForm((p) => ({ ...p, status: e.target.value }))}
            size="small"
            sx={{ minWidth: 180 }}
          >
            {SUBTASK_STATUSES.map((s) => (
              <MenuItem key={s} value={s}>
                {prettyStatus(s)}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            label="Due date"
            type="date"
            size="small"
            value={taskForm.dueDate}
            onChange={(e) => setTaskForm((p) => ({ ...p, dueDate: e.target.value }))}
            InputLabelProps={{ shrink: true }}
            sx={{ minWidth: 170 }}
          />
          <Button variant="contained" onClick={handleCreateTask} disabled={creatingTask}>
            Add Task
          </Button>
        </Stack>
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Task</TableCell>
                <TableCell>Task Status</TableCell>
                <TableCell>Subtasks</TableCell>
                <TableCell>Completion</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {tasks.map((task) => {
                const subtasks = subtasksByTask[task.taskId] || [];
                const done = subtasks.filter((s) => s.status === 'completed').length;
                const pct = subtasks.length ? Math.round((done / subtasks.length) * 100) : 0;
                const subtaskForm = subtaskFormByTask[task.taskId] || {
                  subtaskName: '',
                  status: 'not_started',
                  dueDate: '',
                };
                return (
                  <TableRow key={task.taskId}>
                    <TableCell>{task.taskName || '-'}</TableCell>
                    <TableCell>{prettyStatus(task.status || 'not_started')}</TableCell>
                    <TableCell>
                      <Stack spacing={0.5} sx={{ minWidth: 340 }}>
                        {subtasks.map((st) => (
                          <Typography key={st.subtaskId} variant="caption">
                            - {st.subtaskName} ({prettyStatus(st.status)})
                          </Typography>
                        ))}
                        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={0.5} sx={{ mt: 0.5 }}>
                          <TextField
                            placeholder="New subtask"
                            size="small"
                            value={subtaskForm.subtaskName}
                            onChange={(e) =>
                              setSubtaskFormByTask((prev) => ({
                                ...prev,
                                [task.taskId]: { ...subtaskForm, subtaskName: e.target.value },
                              }))
                            }
                          />
                          <TextField
                            select
                            size="small"
                            value={subtaskForm.status}
                            onChange={(e) =>
                              setSubtaskFormByTask((prev) => ({
                                ...prev,
                                [task.taskId]: { ...subtaskForm, status: e.target.value },
                              }))
                            }
                            sx={{ minWidth: 140 }}
                          >
                            {SUBTASK_STATUSES.map((s) => (
                              <MenuItem key={s} value={s}>
                                {prettyStatus(s)}
                              </MenuItem>
                            ))}
                          </TextField>
                          <Button variant="outlined" size="small" onClick={() => handleCreateSubtask(task.taskId)}>
                            Add
                          </Button>
                        </Stack>
                      </Stack>
                    </TableCell>
                    <TableCell>{pct}%</TableCell>
                  </TableRow>
                );
              })}
              {tasks.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} align="center">
                    No tasks yet. Add a task to start tracking subtasks.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}>
          <Typography variant="subtitle1" fontWeight={700}>
            Project Output Register
          </Typography>
          <Stack direction="row" spacing={1}>
            <Chip size="small" label={`Outputs: ${outputSummary.total}`} />
            <Chip size="small" color="success" label={`Completed: ${outputSummary.completed}`} />
            <Chip size="small" variant="outlined" label={`Progress: ${outputSummary.completionRate.toFixed(1)}%`} />
          </Stack>
        </Stack>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} sx={{ mb: 1.5 }}>
          <TextField
            label="Output name"
            value={outputForm.outputName}
            onChange={(e) => setOutputForm((p) => ({ ...p, outputName: e.target.value }))}
            size="small"
            fullWidth
          />
          <TextField
            label="Unit"
            value={outputForm.unitOfMeasure}
            onChange={(e) => setOutputForm((p) => ({ ...p, unitOfMeasure: e.target.value }))}
            size="small"
            sx={{ minWidth: 120 }}
          />
          <TextField
            label="Target"
            value={outputForm.targetValue}
            onChange={(e) => setOutputForm((p) => ({ ...p, targetValue: e.target.value }))}
            size="small"
            sx={{ minWidth: 100 }}
          />
          <TextField
            label="Achieved"
            value={outputForm.achievedValue}
            onChange={(e) => setOutputForm((p) => ({ ...p, achievedValue: e.target.value }))}
            size="small"
            sx={{ minWidth: 110 }}
          />
          <TextField
            label="Period"
            value={outputForm.reportingPeriod}
            onChange={(e) => setOutputForm((p) => ({ ...p, reportingPeriod: e.target.value }))}
            size="small"
            sx={{ minWidth: 120 }}
          />
          <TextField
            select
            label="Status"
            value={outputForm.status}
            onChange={(e) => setOutputForm((p) => ({ ...p, status: e.target.value }))}
            size="small"
            sx={{ minWidth: 140 }}
          >
            {OUTPUT_STATUSES.map((s) => (
              <MenuItem key={s} value={s}>
                {prettyStatus(s)}
              </MenuItem>
            ))}
          </TextField>
          <Button variant="contained" onClick={handleCreateOutput}>
            Add Output
          </Button>
        </Stack>
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Output</TableCell>
                <TableCell>Unit</TableCell>
                <TableCell align="right">Target</TableCell>
                <TableCell align="right">Achieved</TableCell>
                <TableCell align="right">% Achieved</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Reporting Period</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {outputs.map((row) => {
                const target = toNumber(row.targetValue);
                const achieved = toNumber(row.achievedValue);
                const achievedPct = target > 0 ? (achieved / target) * 100 : 0;
                return (
                  <TableRow key={row.outputId}>
                    <TableCell>{row.outputName}</TableCell>
                    <TableCell>{row.unitOfMeasure || '-'}</TableCell>
                    <TableCell align="right">{target.toLocaleString()}</TableCell>
                    <TableCell align="right">{achieved.toLocaleString()}</TableCell>
                    <TableCell align="right">{achievedPct.toFixed(1)}%</TableCell>
                    <TableCell>{prettyStatus(row.status)}</TableCell>
                    <TableCell>{row.reportingPeriod || '-'}</TableCell>
                  </TableRow>
                );
              })}
              {outputs.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} align="center">
                    No outputs recorded yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </Stack>
  );
}
