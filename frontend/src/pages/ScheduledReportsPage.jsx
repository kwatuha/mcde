import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Autocomplete,
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Drawer,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import apiService from '../api';

const INITIAL_FORM = {
  name: 'Monitoring visits summary',
  reportType: 'monitoring_visits_summary',
  reportFormat: 'csv',
  frequency: 'weekly',
  dayOfWeek: 1,
  dayOfMonth: 1,
  timeOfDay: '08:00',
  recipientUserIds: [],
  daysBack: 7,
};

export default function ScheduledReportsPage() {
  const [users, setUsers] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [loadingSchedules, setLoadingSchedules] = useState(false);
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [scheduleEditingId, setScheduleEditingId] = useState(null);
  const [scheduleForm, setScheduleForm] = useState(INITIAL_FORM);
  const [runsDrawerOpen, setRunsDrawerOpen] = useState(false);
  const [selectedScheduleForRuns, setSelectedScheduleForRuns] = useState(null);
  const [scheduleRuns, setScheduleRuns] = useState([]);
  const [loadingScheduleRuns, setLoadingScheduleRuns] = useState(false);

  const usersById = useMemo(() => {
    const map = new Map();
    for (const u of users) {
      const id = Number(u?.userId ?? u?.userid ?? u?.id);
      if (Number.isFinite(id)) {
        const name = [u?.firstName ?? u?.firstname, u?.lastName ?? u?.lastname].filter(Boolean).join(' ').trim();
        map.set(id, name || u?.username || u?.email || `User #${id}`);
      }
    }
    return map;
  }, [users]);

  const loadSchedules = useCallback(async () => {
    setLoadingSchedules(true);
    try {
      const rows = await apiService.dataCollection.listReportSchedules();
      setSchedules(Array.isArray(rows) ? rows : []);
    } catch {
      setSchedules([]);
    } finally {
      setLoadingSchedules(false);
    }
  }, []);

  useEffect(() => {
    loadSchedules();
    (async () => {
      try {
        const rows = await apiService.users.getUsers();
        const list = Array.isArray(rows) ? rows : Array.isArray(rows?.users) ? rows.users : [];
        setUsers(list);
      } catch {
        setUsers([]);
      }
    })();
  }, [loadSchedules]);

  const createSchedule = async () => {
    if (!scheduleForm.recipientUserIds.length) {
      window.alert('Select at least one recipient user.');
      return;
    }
    setScheduleSaving(true);
    try {
      const payload = {
        name: scheduleForm.name.trim() || 'Monitoring visits summary',
        reportType: scheduleForm.reportType,
        reportFormat: scheduleForm.reportFormat || 'csv',
        frequency: scheduleForm.frequency,
        dayOfWeek: Number(scheduleForm.dayOfWeek),
        dayOfMonth: Number(scheduleForm.dayOfMonth),
        timeOfDay: scheduleForm.timeOfDay,
        recipientUserIds: scheduleForm.recipientUserIds,
        filters: { daysBack: Number(scheduleForm.daysBack) || 7 },
      };
      if (scheduleEditingId) {
        await apiService.dataCollection.updateReportSchedule(scheduleEditingId, payload);
      } else {
        await apiService.dataCollection.createReportSchedule(payload);
      }
      setScheduleEditingId(null);
      setScheduleForm(INITIAL_FORM);
      await loadSchedules();
    } catch (e) {
      window.alert(e?.response?.data?.message || e?.message || `Failed to ${scheduleEditingId ? 'update' : 'create'} schedule.`);
    } finally {
      setScheduleSaving(false);
    }
  };

  const runScheduleNow = async (id) => {
    try {
      await apiService.dataCollection.runReportScheduleNow(id);
      await loadSchedules();
    } catch (e) {
      window.alert(e?.response?.data?.message || e?.message || 'Failed to run schedule now.');
    }
  };

  const deleteSchedule = async (id) => {
    if (!window.confirm('Delete this report schedule?')) return;
    try {
      await apiService.dataCollection.deleteReportSchedule(id);
      await loadSchedules();
    } catch (e) {
      window.alert(e?.response?.data?.message || e?.message || 'Failed to delete schedule.');
    }
  };

  const editSchedule = (schedule) => {
    setScheduleEditingId(schedule.scheduleId);
    setScheduleForm({
      name: schedule.name || '',
      reportType: schedule.reportType || 'monitoring_visits_summary',
      reportFormat: schedule.reportFormat || 'csv',
      frequency: schedule.frequency || 'weekly',
      dayOfWeek: Number(schedule.dayOfWeek ?? 1),
      dayOfMonth: Number(schedule.dayOfMonth ?? 1),
      timeOfDay: schedule.timeOfDay || '08:00',
      recipientUserIds: Array.isArray(schedule.recipientUserIds) ? schedule.recipientUserIds.map(Number) : [],
      daysBack: Number(schedule?.filters?.daysBack) || 7,
    });
  };

  const toggleSchedule = async (schedule) => {
    try {
      await apiService.dataCollection.updateReportSchedule(schedule.scheduleId, { isActive: !schedule.isActive });
      await loadSchedules();
    } catch (e) {
      window.alert(e?.response?.data?.message || e?.message || 'Failed to toggle schedule.');
    }
  };

  const openRunDetailsDrawer = async (schedule) => {
    setSelectedScheduleForRuns(schedule);
    setRunsDrawerOpen(true);
    setLoadingScheduleRuns(true);
    try {
      const runs = await apiService.dataCollection.listReportScheduleRuns(schedule.scheduleId, { limit: 30 });
      setScheduleRuns(Array.isArray(runs) ? runs : []);
    } catch (e) {
      window.alert(e?.response?.data?.message || e?.message || 'Failed to load run details.');
      setScheduleRuns([]);
    } finally {
      setLoadingScheduleRuns(false);
    }
  };

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1200, mx: 'auto' }}>
      <Typography variant="h4" component="h1" gutterBottom sx={{ fontWeight: 700 }}>
        Scheduled reports
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Configure automated report generation and email delivery to selected users.
      </Typography>
      <Alert severity="info" sx={{ mb: 2 }}>
        This page is system-wide and supports future report schedules beyond data collection.
      </Alert>

      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Stack spacing={1.5}>
          <TextField size="small" label="Schedule name" value={scheduleForm.name} onChange={(e) => setScheduleForm((p) => ({ ...p, name: e.target.value }))} />
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
            <FormControl size="small" fullWidth>
              <InputLabel>Report type</InputLabel>
              <Select label="Report type" value={scheduleForm.reportType} onChange={(e) => setScheduleForm((p) => ({ ...p, reportType: e.target.value }))}>
                <MenuItem value="monitoring_visits_summary">Monitoring visits summary (detailed rows)</MenuItem>
                <MenuItem value="monitoring_visits_by_template">Monitoring visits by template</MenuItem>
                <MenuItem value="monitoring_visits_by_project">Monitoring visits by project</MenuItem>
              </Select>
            </FormControl>
            <FormControl size="small" fullWidth>
              <InputLabel>Format</InputLabel>
              <Select label="Format" value={scheduleForm.reportFormat} onChange={(e) => setScheduleForm((p) => ({ ...p, reportFormat: e.target.value }))}>
                <MenuItem value="csv">CSV</MenuItem>
                <MenuItem value="pdf">PDF</MenuItem>
              </Select>
            </FormControl>
          </Stack>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
            <FormControl size="small" fullWidth>
              <InputLabel>Frequency</InputLabel>
              <Select label="Frequency" value={scheduleForm.frequency} onChange={(e) => setScheduleForm((p) => ({ ...p, frequency: e.target.value }))}>
                <MenuItem value="daily">Daily</MenuItem>
                <MenuItem value="weekly">Weekly</MenuItem>
                <MenuItem value="monthly">Monthly</MenuItem>
              </Select>
            </FormControl>
            <TextField size="small" label="Time" type="time" value={scheduleForm.timeOfDay} onChange={(e) => setScheduleForm((p) => ({ ...p, timeOfDay: e.target.value }))} InputLabelProps={{ shrink: true }} fullWidth />
            {scheduleForm.frequency === 'weekly' && (
              <FormControl size="small" fullWidth>
                <InputLabel>Day of week</InputLabel>
                <Select label="Day of week" value={scheduleForm.dayOfWeek} onChange={(e) => setScheduleForm((p) => ({ ...p, dayOfWeek: Number(e.target.value) }))}>
                  <MenuItem value={0}>Sunday</MenuItem>
                  <MenuItem value={1}>Monday</MenuItem>
                  <MenuItem value={2}>Tuesday</MenuItem>
                  <MenuItem value={3}>Wednesday</MenuItem>
                  <MenuItem value={4}>Thursday</MenuItem>
                  <MenuItem value={5}>Friday</MenuItem>
                  <MenuItem value={6}>Saturday</MenuItem>
                </Select>
              </FormControl>
            )}
            {scheduleForm.frequency === 'monthly' && (
              <TextField size="small" label="Day of month" type="number" value={scheduleForm.dayOfMonth} onChange={(e) => setScheduleForm((p) => ({ ...p, dayOfMonth: Number(e.target.value) || 1 }))} inputProps={{ min: 1, max: 31 }} fullWidth />
            )}
          </Stack>
          <TextField size="small" label="Days back to include" type="number" value={scheduleForm.daysBack} onChange={(e) => setScheduleForm((p) => ({ ...p, daysBack: Number(e.target.value) || 7 }))} inputProps={{ min: 1, max: 365 }} />
          <FormControl size="small" fullWidth>
            <Autocomplete
              multiple
              options={users
                .map((u) => Number(u?.userId ?? u?.userid ?? u?.id))
                .filter((id) => Number.isFinite(id))}
              value={scheduleForm.recipientUserIds}
              onChange={(_, selected) =>
                setScheduleForm((p) => ({
                  ...p,
                  recipientUserIds: (Array.isArray(selected) ? selected : []).map(Number),
                }))
              }
              filterSelectedOptions
              getOptionLabel={(id) => usersById.get(Number(id)) || `User #${id}`}
              renderInput={(params) => <TextField {...params} size="small" label="Recipients (searchable)" />}
            />
          </FormControl>
          <Stack direction="row" justifyContent="flex-end">
            {scheduleEditingId ? (
              <Button variant="text" onClick={() => { setScheduleEditingId(null); setScheduleForm(INITIAL_FORM); }} sx={{ mr: 1 }}>
                Cancel edit
              </Button>
            ) : null}
            <Button variant="contained" onClick={createSchedule} disabled={scheduleSaving}>
              {scheduleSaving ? 'Saving…' : scheduleEditingId ? 'Update schedule' : 'Create schedule'}
            </Button>
          </Stack>
        </Stack>
      </Paper>

      {loadingSchedules ? (
        <Box sx={{ py: 2, display: 'flex', justifyContent: 'center' }}>
          <CircularProgress size={24} />
        </Box>
      ) : (
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Report</TableCell>
              <TableCell>Frequency</TableCell>
              <TableCell>Format</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Recipients</TableCell>
              <TableCell>Next run</TableCell>
              <TableCell>Last run</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {schedules.map((s) => (
              <TableRow key={s.scheduleId}>
                <TableCell>{s.name}</TableCell>
                <TableCell>{s.reportType || 'monitoring_visits_summary'}</TableCell>
                <TableCell>{s.frequency}</TableCell>
                <TableCell>{(s.reportFormat || 'csv').toUpperCase()}</TableCell>
                <TableCell>{s.isActive ? 'Active' : 'Paused'}</TableCell>
                <TableCell>{(Array.isArray(s.recipientUserIds) ? s.recipientUserIds : []).map((id) => usersById.get(Number(id)) || `User #${id}`).join(', ') || '—'}</TableCell>
                <TableCell>{s.nextRunAt ? new Date(s.nextRunAt).toLocaleString() : '—'}</TableCell>
                <TableCell>{s.lastRunAt ? new Date(s.lastRunAt).toLocaleString() : '—'}</TableCell>
                <TableCell align="right">
                  <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                    <Button size="small" onClick={() => editSchedule(s)}>Edit</Button>
                    <Button size="small" onClick={() => toggleSchedule(s)}>{s.isActive ? 'Pause' : 'Activate'}</Button>
                    <Button size="small" onClick={() => runScheduleNow(s.scheduleId)}>Run now</Button>
                    <Button size="small" onClick={() => openRunDetailsDrawer(s)}>Last run details</Button>
                    <Button size="small" color="error" onClick={() => deleteSchedule(s.scheduleId)}>Delete</Button>
                  </Stack>
                </TableCell>
              </TableRow>
            ))}
            {!schedules.length && (
              <TableRow>
                <TableCell colSpan={9} align="center">
                  <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
                    No schedules yet.
                  </Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      )}

      <Drawer anchor="right" open={runsDrawerOpen} onClose={() => { setRunsDrawerOpen(false); setSelectedScheduleForRuns(null); setScheduleRuns([]); }}>
        <Box sx={{ width: { xs: 360, md: 520 }, p: 2 }}>
          <Typography variant="h6" sx={{ mb: 1 }}>Last run details</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>{selectedScheduleForRuns?.name || 'Scheduled report'}</Typography>
          {loadingScheduleRuns ? (
            <Box sx={{ py: 3, display: 'flex', justifyContent: 'center' }}><CircularProgress size={24} /></Box>
          ) : !scheduleRuns.length ? (
            <Typography variant="body2" color="text.secondary">No run history yet.</Typography>
          ) : (
            <Stack spacing={1.5}>
              {scheduleRuns.map((run) => {
                const detail = run.detail && typeof run.detail === 'object' ? run.detail : {};
                const sentRecipients = Array.isArray(detail.sentRecipients) ? detail.sentRecipients : [];
                const failedRecipients = Array.isArray(detail.failed) ? detail.failed : [];
                return (
                  <Paper key={run.runId} variant="outlined" sx={{ p: 1.5 }}>
                    <Stack spacing={0.75}>
                      <Stack direction="row" justifyContent="space-between" alignItems="center">
                        <Typography variant="subtitle2" fontWeight={700}>{String(run.runStatus || 'unknown').toUpperCase()}</Typography>
                        <Typography variant="caption" color="text.secondary">{run.createdAt ? new Date(run.createdAt).toLocaleString() : '—'}</Typography>
                      </Stack>
                      <Typography variant="caption" color="text.secondary">
                        Type: {detail.reportType || selectedScheduleForRuns?.reportType || '—'} | Format: {String(detail.reportFormat || selectedScheduleForRuns?.reportFormat || 'csv').toUpperCase()} | Rows: {detail.rowCount ?? '—'}
                      </Typography>
                      <Typography variant="body2">Sent: {detail.sent ?? sentRecipients.length ?? 0}</Typography>
                      {!!sentRecipients.length && <Typography variant="caption" color="text.secondary">Recipients sent: {sentRecipients.map((r) => r.email || `User #${r.userId}`).join(', ')}</Typography>}
                      {!!failedRecipients.length && (
                        <Box>
                          <Typography variant="body2" color="error.main">Failed: {failedRecipients.length}</Typography>
                          <Typography variant="caption" color="text.secondary">{failedRecipients.map((f) => `${f.email || `User #${f.userId}`}${f.error ? ` (${f.error})` : ''}`).join('; ')}</Typography>
                        </Box>
                      )}
                      {detail.error && <Alert severity="error" sx={{ mt: 0.5 }}>{detail.error}</Alert>}
                    </Stack>
                  </Paper>
                );
              })}
            </Stack>
          )}
        </Box>
      </Drawer>
    </Box>
  );
}
