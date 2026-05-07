import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box,
  Typography,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  CircularProgress,
  Alert,
  Chip,
  OutlinedInput,
  IconButton,
  Snackbar,
  Stack,
  ListSubheader,
  Tooltip,
} from '@mui/material';
import { Close as CloseIcon } from '@mui/icons-material';
import apiService from '../api';
import { useAuth } from '../context/AuthContext';

const GENERAL_STAGE_KEY = '__general__';

const stageLabel = (key) => (key === GENERAL_STAGE_KEY ? 'General / uncategorized' : key);

const AssignContractorModal = ({ open, onClose, project }) => {
  const { hasPrivilege } = useAuth();
  const canManageAssignments =
    hasPrivilege('projects.assign_contractor') ||
    hasPrivilege('project.update') ||
    hasPrivilege('admin.access');

  const [allContractors, setAllContractors] = useState([]);
  const [assignedContractors, setAssignedContractors] = useState([]);
  const [selectedContractors, setSelectedContractors] = useState([]);
  const [bqItems, setBqItems] = useState([]);
  const [selectedBqItemIds, setSelectedBqItemIds] = useState([]);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });

  const bqGroups = useMemo(() => {
    const map = new Map();
    for (const it of bqItems) {
      const raw = (it.milestoneName || '').trim();
      const key = raw || GENERAL_STAGE_KEY;
      if (!map.has(key)) {
        map.set(key, { key, label: stageLabel(key), items: [] });
      }
      map.get(key).items.push(it);
    }
    const groups = [...map.values()];
    groups.forEach((g) => {
      g.items.sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0));
    });
    groups.sort((a, b) => String(a.label).localeCompare(String(b.label)));
    return groups;
  }, [bqItems]);

  const fetchContractorData = useCallback(async () => {
    const pid = Number(project?.id ?? project?.projectId ?? project?.project_id);
    if (!Number.isFinite(pid)) {
      setLoading(false);
      return;
    }
    if (!canManageAssignments) {
      setError('You do not have permission to manage contractor assignments for this project.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const [all, assigned, bqData] = await Promise.all([
        apiService.contractors.getAllContractors(),
        apiService.projects.getContractors(pid),
        apiService.bq.getItems(pid).catch(() => []),
      ]);
      setAllContractors(all);
      const rows = Array.isArray(assigned) ? assigned : [];
      const assignedIds = rows.map((c) => Number(c.contractorId)).filter(Number.isFinite);
      setAssignedContractors(assignedIds);
      setSelectedContractors([...assignedIds]);

      const bqList = Array.isArray(bqData) ? bqData : [];
      setBqItems(bqList);

      const union = new Set();
      rows.forEach((c) => {
        (c.bqItemIds || []).forEach((id) => {
          const n = Number(id);
          if (Number.isFinite(n)) union.add(n);
        });
      });
      setSelectedBqItemIds([...union]);
    } catch (err) {
      console.error('Error fetching contractor data:', err);
      setError('Failed to load contractors. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [project, canManageAssignments]);

  useEffect(() => {
    if (open) {
      fetchContractorData();
    }
  }, [open, fetchContractorData]);

  const handleContractorChange = (e) => {
    const { value } = e.target;
    const raw = typeof value === 'string' ? value.split(',') : value;
    setSelectedContractors(raw.map((v) => Number(v)).filter(Number.isFinite));
  };

  const handleBqChange = (e) => {
    const { value } = e.target;
    const raw = typeof value === 'string' ? value.split(',') : value;
    setSelectedBqItemIds(raw.map((v) => Number(v)).filter(Number.isFinite));
  };

  const addStageItemIds = (ids) => {
    setSelectedBqItemIds((prev) => [...new Set([...prev, ...ids])]);
  };

  const toggleStage = (group) => {
    const ids = group.items.map((i) => Number(i.itemId)).filter(Number.isFinite);
    const allSelected = ids.length > 0 && ids.every((id) => selectedBqItemIds.includes(id));
    if (allSelected) {
      setSelectedBqItemIds((prev) => prev.filter((id) => !ids.includes(id)));
    } else {
      addStageItemIds(ids);
    }
  };

  const selectAllBq = () => {
    const ids = bqItems.map((i) => Number(i.itemId)).filter(Number.isFinite);
    setSelectedBqItemIds(ids);
  };

  const clearBq = () => setSelectedBqItemIds([]);

  const handleFormSubmit = async () => {
    if (!canManageAssignments) {
      setSnackbar({ open: true, message: 'Permission denied to assign contractors.', severity: 'error' });
      return;
    }
    const pid = Number(project?.id ?? project?.projectId ?? project?.project_id);
    if (!Number.isFinite(pid)) {
      setSnackbar({ open: true, message: 'Invalid project — cannot save assignments.', severity: 'error' });
      return;
    }
    setSubmitting(true);
    setError(null);

    const contractorsToRemove = assignedContractors.filter((id) => !selectedContractors.includes(id));

    try {
      const removeResults = await Promise.allSettled(
        contractorsToRemove.map((contractorId) => apiService.projects.removeContractor(pid, contractorId))
      );
      const removeFails = removeResults.filter((r) => r.status === 'rejected');
      if (removeFails.length > 0) {
        const detail = removeFails
          .map((r) => r.reason?.response?.data?.message || r.reason?.message || 'Request failed')
          .join(' ');
        setError(detail || 'Failed to remove some contractor assignments.');
        setSnackbar({ open: true, message: 'Could not update all contractor assignments.', severity: 'error' });
        return;
      }

      const syncResults = await Promise.allSettled(
        selectedContractors.map((contractorId) =>
          apiService.projects.assignContractor(pid, contractorId, { bqItemIds: selectedBqItemIds })
        )
      );
      const syncFails = syncResults.filter((r) => r.status === 'rejected');
      if (syncFails.length > 0) {
        const detail = syncFails
          .map((r) => r.reason?.response?.data?.message || r.reason?.message || 'Request failed')
          .join(' ');
        setError(detail || 'Failed to save BQ scope for some contractors.');
        setSnackbar({ open: true, message: 'Could not save all contractor / BQ assignments.', severity: 'error' });
        return;
      }

      setSnackbar({ open: true, message: 'Contractor and BQ assignments updated.', severity: 'success' });
      onClose();
    } catch (err) {
      console.error('Submission Error:', err);
      setError(err?.response?.data?.message || err?.message || 'Failed to update assignments. Please try again.');
      setSnackbar({ open: true, message: 'Failed to update assignments.', severity: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleCloseSnackbar = (event, reason) => {
    if (reason === 'clickaway') return;
    setSnackbar({ ...snackbar, open: false });
  };

  const displayTitle = project?.projectName || project?.name || 'Project';

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle sx={{ pr: 6 }}>
        <Typography variant="h6" component="span" sx={{ display: 'block', fontWeight: 700 }}>
          Assign contractors &amp; BQ scope
        </Typography>
        <Typography variant="body1" sx={{ mt: 1, fontWeight: 600, lineHeight: 1.35 }}>
          {displayTitle}
        </Typography>
        {project?.subtitle ? (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {project.subtitle}
          </Typography>
        ) : null}
        <IconButton aria-label="close" onClick={onClose} sx={{ position: 'absolute', right: 8, top: 8 }}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        {loading ? (
          <Box display="flex" justifyContent="center" py={4}>
            <CircularProgress />
          </Box>
        ) : (
          <Stack spacing={2.5}>
            {error && (
              <Alert severity="error" onClose={() => setError(null)}>
                {error}
              </Alert>
            )}
            <Typography variant="body2" color="text.secondary">
              Selected contractors are linked to this project. Choose Bill of Quantities (BQ) lines/stages to scope
              their work (e.g. for certificates and payments). The same BQ selection is applied to every contractor you
              keep selected below—assign contractors one at a time if they need different scopes.
            </Typography>

            <FormControl fullWidth>
              <InputLabel id="contractor-select-label">Contractors</InputLabel>
              <Select
                labelId="contractor-select-label"
                multiple
                value={selectedContractors}
                onChange={handleContractorChange}
                input={<OutlinedInput label="Contractors" />}
                renderValue={(selected) => (
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                    {selected.map((id) => {
                      const contractor = allContractors.find((c) => Number(c.contractorId) === Number(id));
                      return <Chip key={id} size="small" label={contractor?.companyName || `ID: ${id}`} />;
                    })}
                  </Box>
                )}
              >
                {allContractors.map((contractor) => (
                  <MenuItem key={contractor.contractorId} value={Number(contractor.contractorId)}>
                    {contractor.companyName}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            {bqItems.length === 0 ? (
              <Alert severity="info">
                No BQ line items for this project yet. Add them under the project <strong>BQ</strong> tab, then return
                here to link activities to contractors.
              </Alert>
            ) : (
              <>
                <Box>
                  <Typography variant="subtitle2" sx={{ mb: 1 }}>
                    Stages (milestones) — quick add
                  </Typography>
                  <Stack direction="row" flexWrap="wrap" gap={0.75} useFlexGap>
                    {bqGroups.map((g) => {
                      const ids = g.items.map((i) => Number(i.itemId));
                      const allOn =
                        ids.length > 0 && ids.every((id) => selectedBqItemIds.includes(id));
                      return (
                        <Chip
                          key={g.key}
                          label={g.label}
                          size="small"
                          color={allOn ? 'primary' : 'default'}
                          variant={allOn ? 'filled' : 'outlined'}
                          onClick={() => toggleStage(g)}
                        />
                      );
                    })}
                    <Chip label="All activities" size="small" onClick={selectAllBq} variant="outlined" />
                    <Chip label="Clear BQ" size="small" onClick={clearBq} variant="outlined" />
                  </Stack>
                </Box>

                <FormControl fullWidth>
                  <InputLabel id="bq-select-label">BQ activities (multi-select)</InputLabel>
                  <Select
                    labelId="bq-select-label"
                    multiple
                    value={selectedBqItemIds}
                    onChange={handleBqChange}
                    input={<OutlinedInput label="BQ activities (multi-select)" />}
                    renderValue={(selected) => (
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                        {selected.map((id) => {
                          const it = bqItems.find((x) => Number(x.itemId) === Number(id));
                          const stage = (it?.milestoneName || '').trim() || 'General';
                          const label = it ? `${stage}: ${it.activityName}` : `ID ${id}`;
                          return <Chip key={id} size="small" label={label} />;
                        })}
                      </Box>
                    )}
                    MenuProps={{ PaperProps: { style: { maxHeight: 360 } } }}
                  >
                    {bqGroups.flatMap((g) => [
                      <ListSubheader key={`h-${g.key}`} sx={{ lineHeight: '32px', fontWeight: 700 }}>
                        {g.label}
                      </ListSubheader>,
                      ...g.items.map((it) => {
                        const tip =
                          it.budgetAmount != null && it.budgetAmount !== ''
                            ? `Budget: ${it.budgetAmount}`
                            : '';
                        const row = <span>{it.activityName}</span>;
                        return (
                          <MenuItem key={it.itemId} value={Number(it.itemId)}>
                            {tip ? (
                              <Tooltip title={tip} arrow placement="right">
                                {row}
                              </Tooltip>
                            ) : (
                              row
                            )}
                          </MenuItem>
                        );
                      }),
                    ])}
                  </Select>
                </FormControl>
              </>
            )}
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} variant="outlined">
          Cancel
        </Button>
        <Button onClick={handleFormSubmit} variant="contained" disabled={submitting || loading}>
          {submitting ? <CircularProgress size={24} /> : 'Save assignments'}
        </Button>
      </DialogActions>
      <Snackbar open={snackbar.open} autoHideDuration={6000} onClose={handleCloseSnackbar}>
        <Alert onClose={handleCloseSnackbar} severity={snackbar.severity} sx={{ width: '100%' }}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Dialog>
  );
};

export default AssignContractorModal;
