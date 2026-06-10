import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import {
  Close as CloseIcon,
  Monitor as MonitorIcon,
  Save as SaveIcon,
} from '@mui/icons-material';
import apiService from '../api';
import { useAuth } from '../context/AuthContext';

const warningLevels = ['None', 'Low', 'Medium', 'High'];

const defaultForm = () => ({
  projectActivityCode: '',
  projectActivityName: '',
  projectIndicatorName: '',
  reportDate: new Date().toISOString().slice(0, 10),
  achievedValue: '',
  comment: '',
  recommendations: '',
  challenges: '',
  warningLevel: 'None',
  isRoutineObservation: true,
});

const toDateInput = (value) => {
  if (!value) return new Date().toISOString().slice(0, 10);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return date.toISOString().slice(0, 10);
};

const getActivityKey = (activity) =>
  `${activity?.activityCode || activity?.activity_code || ''}::${activity?.activityName || activity?.activity_name || ''}`;

export default function ProjectMonitoringDialog({
  open,
  onClose,
  projectId,
  editRecord = null,
  onEditComplete,
  onSaved,
}) {
  const { hasPrivilege } = useAuth();
  const [form, setForm] = useState(defaultForm);
  const [assignedActivities, setAssignedActivities] = useState([]);
  const [loadingActivities, setLoadingActivities] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const isEditing = Boolean(editRecord);

  const canSave = isEditing
    ? hasPrivilege('project_monitoring.update')
    : hasPrivilege('project_monitoring.create');

  const selectedActivity = useMemo(() => {
    const formKey = `${form.projectActivityCode || ''}::${form.projectActivityName || ''}`;
    return assignedActivities.find((activity) => getActivityKey(activity) === formKey) || null;
  }, [assignedActivities, form.projectActivityCode, form.projectActivityName]);

  const loadAssignedActivities = useCallback(async () => {
    if (!open || !projectId) return;
    setLoadingActivities(true);
    try {
      const rows = await apiService.projects.getPlanningCatalogActivityLinks(projectId);
      setAssignedActivities(Array.isArray(rows) ? rows : []);
    } catch (err) {
      setAssignedActivities([]);
      setError(err?.response?.data?.message || 'Failed to load assigned project activities.');
    } finally {
      setLoadingActivities(false);
    }
  }, [open, projectId]);

  useEffect(() => {
    if (!open) return;
    setError('');
    if (editRecord) {
      setForm({
        projectActivityCode: editRecord.projectActivityCode || editRecord.activityCode || '',
        projectActivityName: editRecord.projectActivityName || editRecord.activityName || '',
        projectIndicatorName: editRecord.projectIndicatorName || editRecord.indicatorName || '',
        reportDate: toDateInput(editRecord.reportDate || editRecord.observationDate || editRecord.createdAt),
        achievedValue: editRecord.achievedValue ?? '',
        comment: editRecord.comment || editRecord.remarks || '',
        recommendations: editRecord.recommendations || '',
        challenges: editRecord.challenges || '',
        warningLevel: editRecord.warningLevel || 'None',
        isRoutineObservation:
          editRecord.isRoutineObservation !== false &&
          editRecord.isRoutineObservation !== 0 &&
          editRecord.isRoutineObservation !== '0',
      });
    } else {
      setForm(defaultForm());
    }
  }, [editRecord, open]);

  useEffect(() => {
    loadAssignedActivities();
  }, [loadAssignedActivities]);

  const handleChange = (field) => (event) => {
    const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleActivityChange = (_, activity) => {
    setForm((prev) => ({
      ...prev,
      projectActivityCode: activity?.activityCode || activity?.activity_code || '',
      projectActivityName: activity?.activityName || activity?.activity_name || '',
      projectIndicatorName: activity?.indicatorName || activity?.indicator_name || '',
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!projectId) {
      setError('Project is required before saving monitoring evidence.');
      return;
    }
    if (!canSave) {
      setError(isEditing ? "You don't have permission to update records." : "You don't have permission to create records.");
      return;
    }
    if (!String(form.comment || '').trim()) {
      setError('Observation / remarks are required.');
      return;
    }

    setSubmitting(true);
    setError('');
    const payload = {
      ...form,
      comment: String(form.comment).trim(),
      achievedValue: form.achievedValue === '' ? null : Number(form.achievedValue),
      isRoutineObservation: form.isRoutineObservation,
    };

    try {
      if (isEditing && editRecord) {
        await apiService.projectMonitoring.updateRecord(projectId, editRecord.recordId, payload);
        onEditComplete?.();
      } else {
        await apiService.projectMonitoring.createRecord(projectId, payload);
      }
      onSaved?.();
      onClose?.();
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Failed to save monitoring record.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onClose={submitting ? undefined : onClose} fullWidth maxWidth="md">
      <DialogTitle
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 2,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <MonitorIcon color="primary" />
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              {isEditing ? 'Edit Monitoring Evidence' : 'Add Monitoring Evidence'}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Link field observations to the project implementation plan activity and indicator.
            </Typography>
          </Box>
        </Box>
        <IconButton onClick={onClose} disabled={submitting} aria-label="Close monitoring dialog">
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <Box component="form" onSubmit={handleSubmit}>
        <DialogContent dividers>
          <Stack spacing={2}>
            {error && <Alert severity="error" onClose={() => setError('')}>{error}</Alert>}
            {!canSave && (
              <Alert severity="warning">
                Your role can view monitoring records but cannot {isEditing ? 'update' : 'create'} them.
              </Alert>
            )}
            <Alert severity="info">
              Select an assigned activity where possible. The activity code and indicator are used by monitoring,
              evaluation, and reports to reconcile progress against the implementation plan.
            </Alert>

            <Autocomplete
              options={assignedActivities}
              loading={loadingActivities}
              value={selectedActivity}
              onChange={handleActivityChange}
              getOptionLabel={(option) => {
                const code = option?.activityCode || option?.activity_code || '';
                const name = option?.activityName || option?.activity_name || '';
                return code ? `${code} - ${name}` : name;
              }}
              isOptionEqualToValue={(option, value) => getActivityKey(option) === getActivityKey(value)}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Implementation Plan Activity"
                  placeholder="Select an assigned activity"
                  helperText={
                    assignedActivities.length
                      ? 'Choosing an activity auto-fills the code, name, and indicator.'
                      : 'No assigned activities found. You can still enter monitoring details manually.'
                  }
                  InputProps={{
                    ...params.InputProps,
                    endAdornment: (
                      <>
                        {loadingActivities ? <CircularProgress color="inherit" size={18} /> : null}
                        {params.InputProps.endAdornment}
                      </>
                    ),
                  }}
                />
              )}
            />

            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
              <TextField
                label="Activity Code"
                value={form.projectActivityCode}
                onChange={handleChange('projectActivityCode')}
                fullWidth
              />
              <TextField
                label="Report Date"
                type="date"
                value={form.reportDate}
                onChange={handleChange('reportDate')}
                InputLabelProps={{ shrink: true }}
                fullWidth
              />
            </Stack>

            <TextField
              label="Activity Name"
              value={form.projectActivityName}
              onChange={handleChange('projectActivityName')}
              fullWidth
            />

            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
              <TextField
                label="Indicator"
                value={form.projectIndicatorName}
                onChange={handleChange('projectIndicatorName')}
                fullWidth
              />
              <TextField
                label="Achieved Value"
                type="number"
                value={form.achievedValue}
                onChange={handleChange('achievedValue')}
                fullWidth
              />
            </Stack>

            <TextField
              label="Observation / Remarks"
              value={form.comment}
              onChange={handleChange('comment')}
              required
              multiline
              minRows={3}
              fullWidth
            />

            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
              <TextField
                label="Recommendations"
                value={form.recommendations}
                onChange={handleChange('recommendations')}
                multiline
                minRows={2}
                fullWidth
              />
              <TextField
                label="Challenges"
                value={form.challenges}
                onChange={handleChange('challenges')}
                multiline
                minRows={2}
                fullWidth
              />
            </Stack>

            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ md: 'center' }}>
              <TextField
                select
                label="Warning Level"
                value={form.warningLevel}
                onChange={handleChange('warningLevel')}
                sx={{ minWidth: 220 }}
              >
                {warningLevels.map((level) => (
                  <MenuItem key={level} value={level}>
                    {level}
                  </MenuItem>
                ))}
              </TextField>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={form.isRoutineObservation}
                    onChange={handleChange('isRoutineObservation')}
                  />
                }
                label="Routine observation"
              />
            </Stack>
          </Stack>
        </DialogContent>

        <DialogActions>
          <Button onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="contained"
            startIcon={submitting ? <CircularProgress size={18} color="inherit" /> : <SaveIcon />}
            disabled={submitting || !canSave}
          >
            {isEditing ? 'Update Record' : 'Save Record'}
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}
