import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  FormHelperText,
  InputLabel,
  MenuItem,
  Select,
  Snackbar,
  Stack,
  Switch,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import { DataGrid } from '@mui/x-data-grid';
import {
  Edit as EditIcon,
  PlayArrow as PlayArrowIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material';
import { useAuth } from '../context/AuthContext.jsx';
import apiService from '../api';

const SEVERITY_OPTIONS = ['low', 'medium', 'high', 'critical'];

const ProjectEscalationRulesPage = () => {
  const { hasPrivilege } = useAuth();
  const canManage = hasPrivilege('project.update') || hasPrivilege('approval_levels.update');

  const [tab, setTab] = useState(0);
  const [rules, setRules] = useState([]);
  const [roles, setRoles] = useState([]);
  const [notificationSettings, setNotificationSettings] = useState({
    emailEnabled: false,
    notifyOnNewSignal: true,
    notifyOnEscalation: true,
    minSeverity: 'medium',
    roleIds: [],
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  const [error, setError] = useState(null);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });

  const [editOpen, setEditOpen] = useState(false);
  const [editRule, setEditRule] = useState(null);
  const [conditionJsonText, setConditionJsonText] = useState('{}');
  const [ladderJsonText, setLadderJsonText] = useState('{}');
  const [formErrors, setFormErrors] = useState({});

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [rulesData, rolesData] = await Promise.all([
        apiService.projectEscalations.listRules(),
        apiService.users.getRoles(),
      ]);
      setRules(Array.isArray(rulesData) ? rulesData : []);
      setRoles(Array.isArray(rolesData) ? rolesData : []);

      if (canManage) {
        const settings = await apiService.projectEscalations.getNotificationSettings();
        setNotificationSettings(settings || {});
      }
    } catch (e) {
      setError(e?.response?.data?.message || e.message || 'Failed to load escalation rules.');
    } finally {
      setLoading(false);
    }
  }, [canManage]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const openEditDialog = (rule) => {
    setEditRule({
      ...rule,
      severityDefault: rule.severityDefault || 'medium',
      escalationLevelDefault: rule.escalationLevelDefault ?? 1,
      cooldownHours: rule.cooldownHours ?? 72,
      isActive: rule.isActive !== false,
    });
    setConditionJsonText(JSON.stringify(rule.conditionJson || {}, null, 2));
    setLadderJsonText(JSON.stringify(rule.escalationLadderJson || {}, null, 2));
    setFormErrors({});
    setEditOpen(true);
  };

  const handleSaveRule = async () => {
    if (!editRule) return;
    let conditionJson;
    let escalationLadderJson;
    try {
      conditionJson = JSON.parse(conditionJsonText);
      escalationLadderJson = JSON.parse(ladderJsonText);
    } catch {
      setFormErrors({ json: 'Condition and ladder JSON must be valid.' });
      return;
    }

    setSaving(true);
    try {
      const updated = await apiService.projectEscalations.updateRule(editRule.code, {
        name: editRule.name,
        category: editRule.category,
        severityDefault: editRule.severityDefault,
        escalationLevelDefault: Number(editRule.escalationLevelDefault),
        cooldownHours: Number(editRule.cooldownHours),
        isActive: editRule.isActive,
        conditionJson,
        escalationLadderJson,
      });
      setRules((prev) => prev.map((r) => (r.code === updated.code ? updated : r)));
      setEditOpen(false);
      setSnackbar({ open: true, message: 'Rule updated.', severity: 'success' });
    } catch (e) {
      setSnackbar({
        open: true,
        message: e?.response?.data?.message || e.message || 'Failed to save rule.',
        severity: 'error',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveNotifications = async () => {
    setSaving(true);
    try {
      const saved = await apiService.projectEscalations.updateNotificationSettings(notificationSettings);
      setNotificationSettings(saved);
      setSnackbar({ open: true, message: 'Notification settings saved.', severity: 'success' });
    } catch (e) {
      setSnackbar({
        open: true,
        message: e?.response?.data?.message || e.message || 'Failed to save notification settings.',
        severity: 'error',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleEvaluateNow = async () => {
    setEvaluating(true);
    try {
      const result = await apiService.projectEscalations.evaluateNow();
      const created = result?.evaluation?.created ?? 0;
      const updated = result?.evaluation?.updated ?? 0;
      const escalated = result?.escalation?.escalated ?? 0;
      setSnackbar({
        open: true,
        message: `Evaluation complete: ${created} new, ${updated} updated, ${escalated} escalated.`,
        severity: 'success',
      });
    } catch (e) {
      setSnackbar({
        open: true,
        message: e?.response?.data?.message || e.message || 'Evaluation failed.',
        severity: 'error',
      });
    } finally {
      setEvaluating(false);
    }
  };

  const columns = useMemo(() => [
    { field: 'code', headerName: 'Code', flex: 1.2, minWidth: 160 },
    { field: 'name', headerName: 'Name', flex: 1.5, minWidth: 200 },
    { field: 'category', headerName: 'Category', width: 120 },
    {
      field: 'severityDefault',
      headerName: 'Default severity',
      width: 130,
      renderCell: (params) => (
        <Chip size="small" label={params.value} color={params.value === 'high' || params.value === 'critical' ? 'error' : 'default'} />
      ),
    },
    { field: 'escalationLevelDefault', headerName: 'Start level', width: 100 },
    { field: 'cooldownHours', headerName: 'Cooldown (h)', width: 110 },
    {
      field: 'isActive',
      headerName: 'Active',
      width: 90,
      renderCell: (params) => (
        <Chip size="small" label={params.value ? 'Yes' : 'No'} color={params.value ? 'success' : 'default'} variant="outlined" />
      ),
    },
    {
      field: 'actions',
      headerName: 'Actions',
      width: 100,
      sortable: false,
      renderCell: (params) => (
        canManage ? (
          <Button size="small" startIcon={<EditIcon />} onClick={() => openEditDialog(params.row)}>
            Edit
          </Button>
        ) : null
      ),
    },
  ], [canManage]);

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight={320}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'center' }} spacing={2} mb={2}>
        <Box>
          <Typography variant="h5" fontWeight={600}>Project escalation rules</Typography>
          <Typography variant="body2" color="text.secondary">
            Configure detection thresholds, SLA ladders, and optional email notifications.
          </Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          <Button startIcon={<RefreshIcon />} onClick={loadData} variant="outlined">Refresh</Button>
          {canManage && (
            <Button
              startIcon={evaluating ? <CircularProgress size={18} color="inherit" /> : <PlayArrowIcon />}
              onClick={handleEvaluateNow}
              variant="contained"
              disabled={evaluating}
            >
              Run evaluation
            </Button>
          )}
        </Stack>
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label="Rules" />
        {canManage && <Tab label="Email notifications" />}
      </Tabs>

      {tab === 0 && (
        <Box sx={{ height: 560, width: '100%' }}>
          <DataGrid
            rows={rules}
            columns={columns}
            getRowId={(row) => row.code}
            disableRowSelectionOnClick
            pageSizeOptions={[10, 25, 50]}
            initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
          />
        </Box>
      )}

      {tab === 1 && canManage && (
        <Stack spacing={3} maxWidth={640}>
          <Alert severity="info">
            Emails require SMTP configuration on the server. Set <code>PROJECT_ESCALATION_EMAIL_ENABLED=false</code> to disable globally.
          </Alert>
          <FormControlLabel
            control={(
              <Switch
                checked={Boolean(notificationSettings.emailEnabled)}
                onChange={(e) => setNotificationSettings((s) => ({ ...s, emailEnabled: e.target.checked }))}
              />
            )}
            label="Enable email notifications"
          />
          <FormControlLabel
            control={(
              <Switch
                checked={Boolean(notificationSettings.notifyOnNewSignal)}
                onChange={(e) => setNotificationSettings((s) => ({ ...s, notifyOnNewSignal: e.target.checked }))}
              />
            )}
            label="Notify when a new signal is detected"
          />
          <FormControlLabel
            control={(
              <Switch
                checked={Boolean(notificationSettings.notifyOnEscalation)}
                onChange={(e) => setNotificationSettings((s) => ({ ...s, notifyOnEscalation: e.target.checked }))}
              />
            )}
            label="Notify when a signal auto-escalates"
          />
          <FormControl fullWidth>
            <InputLabel>Minimum severity</InputLabel>
            <Select
              label="Minimum severity"
              value={notificationSettings.minSeverity || 'medium'}
              onChange={(e) => setNotificationSettings((s) => ({ ...s, minSeverity: e.target.value }))}
            >
              {SEVERITY_OPTIONS.map((s) => (
                <MenuItem key={s} value={s}>{s}</MenuItem>
              ))}
            </Select>
            <FormHelperText>Only signals at or above this severity trigger emails.</FormHelperText>
          </FormControl>
          <FormControl fullWidth>
            <InputLabel>Notify roles</InputLabel>
            <Select
              multiple
              label="Notify roles"
              value={notificationSettings.roleIds || []}
              onChange={(e) => setNotificationSettings((s) => ({ ...s, roleIds: e.target.value }))}
              renderValue={(selected) => selected.map((id) => roles.find((r) => (r.roleId ?? r.roleid ?? r.id) === id)?.roleName || id).join(', ')}
            >
              {roles.map((role) => {
                const id = role.roleId ?? role.roleid ?? role.id;
                return (
                  <MenuItem key={id} value={id}>
                    {role.roleName || role.rolename || role.name}
                  </MenuItem>
                );
              })}
            </Select>
            <FormHelperText>Active users in selected roles receive escalation emails.</FormHelperText>
          </FormControl>
          <Button variant="contained" onClick={handleSaveNotifications} disabled={saving}>
            {saving ? 'Saving…' : 'Save notification settings'}
          </Button>
        </Stack>
      )}

      <Dialog open={editOpen} onClose={() => setEditOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>Edit rule: {editRule?.code}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Name"
              fullWidth
              value={editRule?.name || ''}
              onChange={(e) => setEditRule((r) => ({ ...r, name: e.target.value }))}
            />
            <TextField
              label="Category"
              fullWidth
              value={editRule?.category || ''}
              onChange={(e) => setEditRule((r) => ({ ...r, category: e.target.value }))}
            />
            <FormControl fullWidth>
              <InputLabel>Default severity</InputLabel>
              <Select
                label="Default severity"
                value={editRule?.severityDefault || 'medium'}
                onChange={(e) => setEditRule((r) => ({ ...r, severityDefault: e.target.value }))}
              >
                {SEVERITY_OPTIONS.map((s) => (
                  <MenuItem key={s} value={s}>{s}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              label="Starting escalation level"
              type="number"
              fullWidth
              value={editRule?.escalationLevelDefault ?? 1}
              onChange={(e) => setEditRule((r) => ({ ...r, escalationLevelDefault: e.target.value }))}
            />
            <TextField
              label="Cooldown (hours)"
              type="number"
              fullWidth
              value={editRule?.cooldownHours ?? 72}
              onChange={(e) => setEditRule((r) => ({ ...r, cooldownHours: e.target.value }))}
            />
            <FormControlLabel
              control={(
                <Switch
                  checked={Boolean(editRule?.isActive)}
                  onChange={(e) => setEditRule((r) => ({ ...r, isActive: e.target.checked }))}
                />
              )}
              label="Rule active"
            />
            <TextField
              label="Condition JSON"
              fullWidth
              multiline
              minRows={4}
              value={conditionJsonText}
              onChange={(e) => setConditionJsonText(e.target.value)}
              helperText="Thresholds vary by rule (e.g. thresholdDays, minRiskLevel, earlyFraction)."
            />
            <TextField
              label="Escalation ladder JSON"
              fullWidth
              multiline
              minRows={3}
              value={ladderJsonText}
              onChange={(e) => setLadderJsonText(e.target.value)}
              helperText='Example: {"slaDaysPerLevel":[7,14,30],"maxLevel":3}'
            />
            {formErrors.json && <FormHelperText error>{formErrors.json}</FormHelperText>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditOpen(false)}>Cancel</Button>
          <Button onClick={handleSaveRule} variant="contained" disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
      >
        <Alert severity={snackbar.severity} onClose={() => setSnackbar((s) => ({ ...s, open: false }))}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default ProjectEscalationRulesPage;
