import React, { useCallback, useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
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
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  Timeline as TimelineIcon,
} from '@mui/icons-material';
import projectService from '../api/projectService';

const defaultForm = {
  activityName: '',
  milestoneName: '',
  startDate: '',
  endDate: '',
  budgetAmount: '',
  progressPercent: '',
  completed: false,
  remarks: '',
  completionDate: '',
  sortOrder: '',
};

const formatAmountInput = (value) => {
  const raw = String(value ?? '').replace(/,/g, '').trim();
  if (!raw) return '';
  const [intPart, decimalPart] = raw.split('.');
  const formattedInt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return decimalPart !== undefined ? `${formattedInt}.${decimalPart}` : formattedInt;
};

const ProjectBQTab = ({ projectId, canModify = true }) => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [openDialog, setOpenDialog] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [form, setForm] = useState(defaultForm);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [openProgressDialog, setOpenProgressDialog] = useState(false);
  const [progressLoading, setProgressLoading] = useState(false);
  const [progressSaving, setProgressSaving] = useState(false);
  const [selectedProgressItem, setSelectedProgressItem] = useState(null);
  const [progressLogs, setProgressLogs] = useState([]);
  const [progressForm, setProgressForm] = useState({
    progressDate: new Date().toISOString().slice(0, 10),
    progressPercent: '',
    remarks: '',
  });

  const loadItems = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setError('');
    try {
      const data = await projectService.bq.getItems(projectId);
      setItems(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to load BQ items.');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  const totals = useMemo(() => {
    const totalBudget = items.reduce((sum, i) => sum + (Number(i.budgetAmount) || 0), 0);
    const avgProgress = items.length
      ? items.reduce((sum, i) => sum + (Number(i.progressPercent) || 0), 0) / items.length
      : 0;
    return { totalBudget, avgProgress };
  }, [items]);

  const openCreate = () => {
    setEditingItem(null);
    setForm(defaultForm);
    setOpenDialog(true);
  };

  const openEdit = (item) => {
    setEditingItem(item);
    setForm({
      activityName: item.activityName || '',
      milestoneName: item.milestoneName || '',
      startDate: item.startDate ? String(item.startDate).slice(0, 10) : '',
      endDate: item.endDate ? String(item.endDate).slice(0, 10) : '',
      budgetAmount: item.budgetAmount ?? '',
      progressPercent: item.progressPercent ?? '',
      completed: Boolean(item.completed),
      remarks: item.remarks || '',
      completionDate: item.completionDate ? String(item.completionDate).slice(0, 10) : '',
      sortOrder: item.sortOrder ?? '',
    });
    setOpenDialog(true);
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const payload = {
        ...form,
        budgetAmount: form.budgetAmount === '' ? null : Number(String(form.budgetAmount).replace(/,/g, '')),
        progressPercent: form.progressPercent === '' ? 0 : Number(form.progressPercent),
        completionDate: form.completionDate || null,
        sortOrder: form.sortOrder === '' ? 0 : Number(form.sortOrder),
      };
      if (editingItem?.itemId) {
        await projectService.bq.updateItem(projectId, editingItem.itemId, payload);
        setMessage('BQ item updated.');
      } else {
        await projectService.bq.createItem(projectId, payload);
        setMessage('BQ item added.');
      }
      setOpenDialog(false);
      setEditingItem(null);
      setForm(defaultForm);
      await loadItems();
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to save BQ item.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (itemId) => {
    if (!window.confirm('Delete this BQ item?')) return;
    setError('');
    setMessage('');
    try {
      await projectService.bq.deleteItem(projectId, itemId);
      setMessage('BQ item deleted.');
      await loadItems();
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to delete BQ item.');
    }
  };

  const openProgress = async (item) => {
    setSelectedProgressItem(item);
    setOpenProgressDialog(true);
    setProgressForm({
      progressDate: new Date().toISOString().slice(0, 10),
      progressPercent: item.progressPercent ?? '',
      remarks: '',
    });
    setProgressLoading(true);
    setError('');
    try {
      const logs = await projectService.bq.getProgressLogs(projectId, item.itemId);
      setProgressLogs(Array.isArray(logs) ? logs : []);
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to load progress history.');
      setProgressLogs([]);
    } finally {
      setProgressLoading(false);
    }
  };

  const submitProgress = async () => {
    if (!selectedProgressItem?.itemId) return;
    setProgressSaving(true);
    setError('');
    setMessage('');
    try {
      await projectService.bq.addProgressLog(projectId, selectedProgressItem.itemId, {
        progressDate: progressForm.progressDate,
        progressPercent: Number(progressForm.progressPercent),
        remarks: progressForm.remarks,
      });
      setMessage('Progress update saved.');
      const logs = await projectService.bq.getProgressLogs(projectId, selectedProgressItem.itemId);
      setProgressLogs(Array.isArray(logs) ? logs : []);
      await loadItems();
      setProgressForm((prev) => ({ ...prev, remarks: '' }));
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to save progress update.');
    } finally {
      setProgressSaving(false);
    }
  };

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 600 }}>Bill of Quantities (BQ)</Typography>
          <Typography variant="body2" color="text.secondary">
            Capture project activities/milestones, dates, budget amount and estimated completion percentage.
          </Typography>
        </Box>
        {canModify && (
          <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
            Add BQ Item
          </Button>
        )}
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {message && <Alert severity="success" sx={{ mb: 2 }}>{message}</Alert>}

      <Paper variant="outlined" sx={{ p: 1.5, mb: 2 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          <Typography variant="body2"><strong>Total Items:</strong> {items.length}</Typography>
          <Typography variant="body2"><strong>Total Budget:</strong> Ksh {totals.totalBudget.toLocaleString()}</Typography>
          <Typography variant="body2"><strong>Average Progress:</strong> {totals.avgProgress.toFixed(2)}%</Typography>
        </Stack>
      </Paper>

      <Paper variant="outlined">
        {loading ? (
          <Box sx={{ p: 4, textAlign: 'center' }}><CircularProgress size={24} /></Box>
        ) : items.length === 0 ? (
          <Box sx={{ p: 4, textAlign: 'center' }}>
            <Typography variant="body2" color="text.secondary">No BQ items added yet.</Typography>
          </Box>
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Activity / Milestone</TableCell>
                  <TableCell>Milestone Label</TableCell>
                  <TableCell>Start Date</TableCell>
                  <TableCell>End Date</TableCell>
                  <TableCell align="right">Budget (Ksh)</TableCell>
                  <TableCell align="right">% Complete</TableCell>
                  <TableCell>Completed</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.itemId}>
                    <TableCell>{item.activityName || '-'}</TableCell>
                    <TableCell>{item.milestoneName || '-'}</TableCell>
                    <TableCell>{item.startDate ? String(item.startDate).slice(0, 10) : '-'}</TableCell>
                    <TableCell>{item.endDate ? String(item.endDate).slice(0, 10) : '-'}</TableCell>
                    <TableCell align="right">{Number(item.budgetAmount || 0).toLocaleString()}</TableCell>
                    <TableCell align="right">{Number(item.progressPercent || 0).toFixed(2)}%</TableCell>
                    <TableCell>{item.completed ? 'Yes' : 'No'}</TableCell>
                    <TableCell align="right">
                      {canModify && (
                        <>
                          <Tooltip title="Update progress">
                            <IconButton size="small" color="primary" onClick={() => openProgress(item)}>
                              <TimelineIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Edit (progress/remarks only)">
                            <IconButton size="small" onClick={() => openEdit(item)}><EditIcon fontSize="small" /></IconButton>
                          </Tooltip>
                          <Tooltip title="Delete">
                            <IconButton size="small" color="error" onClick={() => handleDelete(item.itemId)}>
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>

      <Dialog open={openDialog} onClose={() => setOpenDialog(false)} fullWidth maxWidth="sm">
        <DialogTitle>{editingItem ? 'Edit BQ Item' : 'Add BQ Item'}</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} sx={{ mt: 1 }}>
            <TextField
              label="Activity / Milestone"
              value={form.activityName}
              onChange={(e) => setForm((p) => ({ ...p, activityName: e.target.value }))}
              required
              disabled={Boolean(editingItem)}
              fullWidth
            />
            <TextField
              label="Milestone Label"
              value={form.milestoneName}
              onChange={(e) => setForm((p) => ({ ...p, milestoneName: e.target.value }))}
              disabled={Boolean(editingItem)}
              fullWidth
            />
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
              <TextField
                label="Start Date"
                type="date"
                value={form.startDate}
                onChange={(e) => setForm((p) => ({ ...p, startDate: e.target.value }))}
                InputLabelProps={{ shrink: true }}
                disabled={Boolean(editingItem)}
                fullWidth
              />
              <TextField
                label="End Date"
                type="date"
                value={form.endDate}
                onChange={(e) => setForm((p) => ({ ...p, endDate: e.target.value }))}
                InputLabelProps={{ shrink: true }}
                disabled={Boolean(editingItem)}
                fullWidth
              />
            </Stack>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
              <TextField
                label="Budget Amount (Ksh)"
                value={formatAmountInput(form.budgetAmount)}
                onChange={(e) => {
                  const next = String(e.target.value || '').replace(/,/g, '');
                  if (next === '' || /^\d*(\.\d{0,2})?$/.test(next)) {
                    setForm((p) => ({ ...p, budgetAmount: next }));
                  }
                }}
                inputProps={{ inputMode: 'decimal' }}
                disabled={Boolean(editingItem)}
                fullWidth
              />
              <TextField
                label="Estimated % Complete"
                type="number"
                value={form.progressPercent}
                onChange={(e) => setForm((p) => ({ ...p, progressPercent: e.target.value }))}
                inputProps={{ min: 0, max: 100, step: '0.01' }}
                fullWidth
              />
            </Stack>
            <TextField
              label="Completion Date"
              type="date"
              value={form.completionDate}
              onChange={(e) => setForm((p) => ({ ...p, completionDate: e.target.value }))}
              InputLabelProps={{ shrink: true }}
              fullWidth
            />
            <TextField
              label="Sort Order"
              type="number"
              value={form.sortOrder}
              onChange={(e) => setForm((p) => ({ ...p, sortOrder: e.target.value }))}
              inputProps={{ min: 0 }}
              disabled={Boolean(editingItem)}
              fullWidth
            />
            <TextField
              label="Remarks"
              value={form.remarks}
              onChange={(e) => setForm((p) => ({ ...p, remarks: e.target.value }))}
              multiline
              minRows={3}
              fullWidth
            />
            <Box>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="checkbox"
                  checked={Boolean(form.completed)}
                  onChange={(e) => setForm((p) => ({ ...p, completed: e.target.checked }))}
                />
                Mark as completed
              </label>
            </Box>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenDialog(false)} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} variant="contained" disabled={saving}>
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={openProgressDialog} onClose={() => setOpenProgressDialog(false)} fullWidth maxWidth="md">
        <DialogTitle>
          Progress Tracking {selectedProgressItem ? `- ${selectedProgressItem.activityName}` : ''}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
              <TextField
                label="Progress Date"
                type="date"
                value={progressForm.progressDate}
                onChange={(e) => setProgressForm((p) => ({ ...p, progressDate: e.target.value }))}
                InputLabelProps={{ shrink: true }}
                fullWidth
              />
              <TextField
                label="% Complete"
                type="number"
                value={progressForm.progressPercent}
                onChange={(e) => setProgressForm((p) => ({ ...p, progressPercent: e.target.value }))}
                inputProps={{ min: 0, max: 100, step: '0.01' }}
                fullWidth
              />
            </Stack>
            <TextField
              label="Progress Remarks"
              value={progressForm.remarks}
              onChange={(e) => setProgressForm((p) => ({ ...p, remarks: e.target.value }))}
              multiline
              minRows={2}
              fullWidth
            />
            <Box>
              <Button variant="contained" onClick={submitProgress} disabled={progressSaving}>
                {progressSaving ? 'Saving...' : 'Add Progress Update'}
              </Button>
            </Box>

            <Paper variant="outlined">
              {progressLoading ? (
                <Box sx={{ p: 2, textAlign: 'center' }}><CircularProgress size={20} /></Box>
              ) : progressLogs.length === 0 ? (
                <Box sx={{ p: 2 }}>
                  <Typography variant="body2" color="text.secondary">No progress history yet.</Typography>
                </Box>
              ) : (
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Date</TableCell>
                        <TableCell align="right">% Complete</TableCell>
                        <TableCell>Remarks</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {progressLogs.map((log) => (
                        <TableRow key={log.id}>
                          <TableCell>{log.progressDate ? String(log.progressDate).slice(0, 10) : '-'}</TableCell>
                          <TableCell align="right">{Number(log.progressPercent || 0).toFixed(2)}%</TableCell>
                          <TableCell>{log.remarks || '-'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </Paper>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenProgressDialog(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

ProjectBQTab.propTypes = {
  projectId: PropTypes.oneOfType([PropTypes.number, PropTypes.string]).isRequired,
  canModify: PropTypes.bool,
};

export default ProjectBQTab;
