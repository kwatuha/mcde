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
  Grid,
  LinearProgress,
  Radio,
  RadioGroup,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import RocketLaunchIcon from '@mui/icons-material/RocketLaunch';
import LinkIcon from '@mui/icons-material/Link';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import budgetService from '../../api/budgetService';
import projectService from '../../api/projectService';
import { formatCurrency } from '../../utils/helpers';
import { getBudgetErrorMessage } from '../../utils/budgetErrors';

function BalanceStat({ label, value, color = 'text.primary' }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary" display="block">
        {label}
      </Typography>
      <Typography variant="body2" fontWeight={700} color={color}>
        {formatCurrency(Number(value || 0))}
      </Typography>
    </Box>
  );
}

function computeOverCommit(balance, amount) {
  const parsed = Number(amount);
  if (!Number.isFinite(parsed) || parsed <= 0 || !balance) {
    return { isOver: false, overItem: false, overAdp: false, afterItem: null, afterAdp: null };
  }
  const overItem = balance.item?.remaining != null && parsed > Number(balance.item.remaining) + 0.005;
  const overAdp = balance.adp?.allocated > 0
    && balance.adp?.remaining != null
    && parsed > Number(balance.adp.remaining) + 0.005;
  return {
    isOver: overItem || overAdp,
    overItem,
    overAdp,
    afterItem: balance.item?.remaining != null ? Number(balance.item.remaining) - parsed : null,
    afterAdp: balance.adp?.remaining != null ? Number(balance.adp.remaining) - parsed : null,
  };
}

export default function CreateRegistryProjectDialog({
  open,
  onClose,
  item,
  budgetLabel,
  onSuccess,
}) {
  const [mode, setMode] = useState('create');
  const [projectName, setProjectName] = useState('');
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [balance, setBalance] = useState(null);
  const [loadingBalance, setLoadingBalance] = useState(false);
  const [confirmOverCommit, setConfirmOverCommit] = useState(false);
  const [projectOptions, setProjectOptions] = useState([]);
  const [projectSearch, setProjectSearch] = useState('');
  const [selectedProject, setSelectedProject] = useState(null);
  const [loadingProjects, setLoadingProjects] = useState(false);

  const suggestedAmount = useMemo(() => {
    if (balance) {
      const caps = [
        balance.item?.remaining,
        balance.adp?.allocated > 0 ? balance.adp?.remaining : null,
      ].filter((value) => Number(value) > 0);
      if (caps.length > 0) {
        return String(Math.min(...caps.map(Number)));
      }
    }
    const fallback = Number(item?.amount || item?.adpEstimatedCost || item?.budgetAmount || 0);
    return fallback > 0 ? String(fallback) : '';
  }, [balance, item]);

  const loadBalance = useCallback(async (itemId) => {
    if (!itemId) return;
    setLoadingBalance(true);
    try {
      const data = await budgetService.getBudgetItemProcurementBalance(itemId);
      setBalance(data);
    } catch {
      setBalance(null);
    } finally {
      setLoadingBalance(false);
    }
  }, []);

  useEffect(() => {
    if (!open || !item?.itemId) return;
    setMode('create');
    setProjectName(item.projectName || '');
    setAmount('');
    setNotes('');
    setError('');
    setConfirmOverCommit(false);
    setSelectedProject(null);
    setProjectSearch('');
    setProjectOptions([]);
    setBalance(null);
    loadBalance(item.itemId);
  }, [open, item, loadBalance]);

  useEffect(() => {
    if (!open || !suggestedAmount) return;
    setAmount(suggestedAmount);
  }, [open, suggestedAmount]);

  const overCommit = useMemo(() => computeOverCommit(balance, amount), [balance, amount]);

  const loadProjects = useCallback(async (searchTerm) => {
    const term = String(searchTerm || '').trim();
    if (term.length < 2) {
      setProjectOptions([]);
      return;
    }
    setLoadingProjects(true);
    try {
      const data = await projectService.projects.getProjects({ projectName: term, limit: 20 });
      const list = Array.isArray(data) ? data : (data?.projects || data?.rows || []);
      setProjectOptions(list);
    } catch {
      setProjectOptions([]);
    } finally {
      setLoadingProjects(false);
    }
  }, []);

  useEffect(() => {
    if (!open || mode !== 'link') return undefined;
    const timer = setTimeout(() => loadProjects(projectSearch), 300);
    return () => clearTimeout(timer);
  }, [open, mode, projectSearch, loadProjects]);

  const handleSubmit = async () => {
    if (!item?.itemId) return;
    setError('');

    const parsedAmount = Number(amount);
    if (mode === 'create' || mode === 'link') {
      if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
        setError('Enter an allocated amount greater than zero.');
        return;
      }
    }

    if (overCommit.isOver && !confirmOverCommit) {
      setError('This amount exceeds the remaining vote or ADP balance. Reduce the amount or check the confirmation box to proceed.');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        notes: notes.trim() || undefined,
        amount: parsedAmount,
        confirmOverCommit: confirmOverCommit || undefined,
      };
      if (mode === 'link') {
        const linkId = selectedProject?.projectId || selectedProject?.id;
        if (!linkId) {
          setError('Select an existing registry project to link.');
          setSubmitting(false);
          return;
        }
        payload.linkExistingProjectId = linkId;
      } else {
        if (!projectName.trim()) {
          setError('Project name is required.');
          setSubmitting(false);
          return;
        }
        payload.projectName = projectName.trim();
      }

      const result = await budgetService.createRegistryProjectFromBudgetItem(item.itemId, payload);
      onSuccess?.(result);
      onClose?.();
    } catch (err) {
      const code = err?.response?.data?.code;
      if (code === 'OVER_COMMIT') {
        setBalance(err.response.data.balance || balance);
        setConfirmOverCommit(false);
      }
      setError(getBudgetErrorMessage(err, 'Failed to create registry project.'));
    } finally {
      setSubmitting(false);
    }
  };

  if (!item) return null;

  const itemCap = balance?.item?.allocated > 0
    ? Math.min(100, (Number(balance.item.committed || 0) / Number(balance.item.allocated)) * 100)
    : 0;
  const adpCap = balance?.adp?.allocated > 0
    ? Math.min(100, (Number(balance.adp.committed || 0) / Number(balance.adp.allocated)) * 100)
    : 0;

  return (
    <Dialog open={open} onClose={submitting ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <RocketLaunchIcon color="primary" />
        Create Registry Project
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Alert severity="info">
            Link this budget line to the project registry so procurement can consume the allocated amount.
            {budgetLabel ? ` Budget: ${budgetLabel}.` : ''}
          </Alert>

          <Box>
            <Typography variant="subtitle2" color="text.secondary">Budget item</Typography>
            <Typography variant="body1" fontWeight={600}>{item.projectName || 'Unnamed item'}</Typography>
            <Typography variant="body2" color="text.secondary">
              {item.departmentName || '—'}
              {item.subcountyName ? ` · ${item.subcountyName}` : ''}
              {item.wardName ? ` · ${item.wardName}` : ''}
            </Typography>
            {item.adpProjectId && (
              <Typography variant="caption" color="info.main" display="block" sx={{ mt: 0.5 }}>
                ADP project will be linked automatically.
              </Typography>
            )}
          </Box>

          {loadingBalance && <LinearProgress />}

          {balance && (
            <Box sx={{ p: 2, borderRadius: 1, border: 1, borderColor: 'divider', bgcolor: 'action.hover' }}>
              <Typography variant="subtitle2" fontWeight={700} gutterBottom>
                Vote / item balance
              </Typography>
              <Grid container spacing={2}>
                <Grid item xs={4}><BalanceStat label="Vote amount" value={balance.item?.allocated} /></Grid>
                <Grid item xs={4}><BalanceStat label="Committed" value={balance.item?.committed} /></Grid>
                <Grid item xs={4}>
                  <BalanceStat
                    label="Remaining"
                    value={balance.item?.remaining}
                    color={balance.item?.remaining > 0 ? 'success.main' : 'error.main'}
                  />
                </Grid>
              </Grid>
              {balance.item?.allocated > 0 && (
                <LinearProgress
                  variant="determinate"
                  value={itemCap}
                  sx={{ mt: 1.5, height: 6, borderRadius: 1 }}
                  color={itemCap >= 100 ? 'error' : 'primary'}
                />
              )}

              {balance.adp && (
                <Box sx={{ mt: 2 }}>
                  <Typography variant="subtitle2" fontWeight={700} gutterBottom>
                    ADP vote balance
                    {balance.adp.adpProjectName ? ` · ${balance.adp.adpProjectName}` : ''}
                  </Typography>
                  <Grid container spacing={2}>
                    <Grid item xs={4}><BalanceStat label="ADP estimate" value={balance.adp.allocated} /></Grid>
                    <Grid item xs={4}><BalanceStat label="Committed" value={balance.adp.committed} /></Grid>
                    <Grid item xs={4}>
                      <BalanceStat
                        label="Remaining"
                        value={balance.adp.remaining}
                        color={balance.adp.remaining > 0 ? 'success.main' : 'error.main'}
                      />
                    </Grid>
                  </Grid>
                  {balance.adp.allocated > 0 && (
                    <LinearProgress
                      variant="determinate"
                      value={adpCap}
                      sx={{ mt: 1.5, height: 6, borderRadius: 1 }}
                      color={adpCap >= 100 ? 'error' : 'secondary'}
                    />
                  )}
                </Box>
              )}
            </Box>
          )}

          <RadioGroup
            row
            value={mode}
            onChange={(event) => setMode(event.target.value)}
          >
            <FormControlLabel value="create" control={<Radio size="small" />} label="Create new project" />
            <FormControlLabel value="link" control={<Radio size="small" />} label="Link existing project" />
          </RadioGroup>

          {mode === 'create' ? (
            <TextField
              label="Registry project name"
              value={projectName}
              onChange={(event) => setProjectName(event.target.value)}
              fullWidth
              required
            />
          ) : (
            <Autocomplete
              options={projectOptions}
              loading={loadingProjects}
              value={selectedProject}
              onChange={(_, value) => setSelectedProject(value)}
              onInputChange={(_, value) => setProjectSearch(value)}
              getOptionLabel={(option) => {
                const id = option.projectId || option.id;
                const name = option.projectName || option.name || `Project #${id}`;
                const status = option.status || option.progress?.status;
                return status ? `${name} (${status})` : name;
              }}
              isOptionEqualToValue={(option, value) =>
                String(option.projectId || option.id) === String(value?.projectId || value?.id)
              }
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Search registry project"
                  placeholder="Type at least 2 characters"
                  InputProps={{
                    ...params.InputProps,
                    endAdornment: (
                      <>
                        {loadingProjects ? <CircularProgress color="inherit" size={18} /> : null}
                        {params.InputProps.endAdornment}
                      </>
                    ),
                  }}
                />
              )}
              noOptionsText={projectSearch.trim().length < 2 ? 'Type to search projects' : 'No matching projects'}
            />
          )}

          <TextField
            label="Allocated amount (KES)"
            type="number"
            value={amount}
            onChange={(event) => {
              setAmount(event.target.value);
              setConfirmOverCommit(false);
            }}
            fullWidth
            required
            inputProps={{ min: 0.01, step: 0.01 }}
            helperText={
              balance?.item?.remaining != null
                ? `Suggested max: ${formatCurrency(Number(balance.item.remaining))}${balance.adp?.allocated > 0 ? ` (ADP: ${formatCurrency(Number(balance.adp.remaining))})` : ''}`
                : undefined
            }
          />

          {overCommit.isOver && (
            <Alert severity="warning" icon={<WarningAmberIcon />}>
              This allocation exceeds the available balance.
              {overCommit.overItem && balance?.item?.remaining != null && (
                <> Vote remaining after: <strong>{formatCurrency(overCommit.afterItem)}</strong>.</>
              )}
              {overCommit.overAdp && balance?.adp?.remaining != null && (
                <> ADP remaining after: <strong>{formatCurrency(overCommit.afterAdp)}</strong>.</>
              )}
              <FormControlLabel
                sx={{ mt: 1, display: 'flex', alignItems: 'flex-start' }}
                control={(
                  <Checkbox
                    size="small"
                    checked={confirmOverCommit}
                    onChange={(event) => setConfirmOverCommit(event.target.checked)}
                  />
                )}
                label="I understand this over-commits the vote/ADP and want to proceed anyway."
              />
            </Alert>
          )}

          {!overCommit.isOver && Number(amount) > 0 && balance && (
            <Alert severity="success" variant="outlined">
              After this project: vote balance {formatCurrency(Math.max(0, Number(balance.item?.remaining || 0) - Number(amount)))}
              {balance.adp?.allocated > 0 && (
                <> · ADP balance {formatCurrency(Math.max(0, Number(balance.adp.remaining || 0) - Number(amount)))}</>
              )}
            </Alert>
          )}

          <TextField
            label="Link notes (optional)"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            fullWidth
            multiline
            minRows={2}
          />

          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} disabled={submitting}>Cancel</Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={submitting || (overCommit.isOver && !confirmOverCommit)}
          color={overCommit.isOver && confirmOverCommit ? 'warning' : 'primary'}
          startIcon={submitting ? <CircularProgress size={18} color="inherit" /> : (mode === 'link' ? <LinkIcon /> : <RocketLaunchIcon />)}
        >
          {mode === 'link' ? 'Link project' : 'Create project'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
