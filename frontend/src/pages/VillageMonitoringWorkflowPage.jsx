import { useCallback, useEffect, useMemo, useState } from 'react';
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
  List,
  ListItem,
  ListItemText,
  MenuItem,
  Paper,
  Snackbar,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import {
  CheckCircle as ApproveIcon,
  History as HistoryIcon,
  Refresh as RefreshIcon,
  Replay as ReturnIcon,
  Send as SendIcon,
  Visibility as ViewIcon,
} from '@mui/icons-material';
import { DataGrid } from '@mui/x-data-grid';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import villageMonitoringService from '../api/villageMonitoringService';
import ChecklistFormFields from '../components/ChecklistFormFields';

const STATUS_COLORS = {
  draft: 'default',
  pending_ward: 'info',
  pending_subcounty: 'warning',
  returned_to_ward: 'error',
  pending_chief: 'secondary',
  approved: 'success',
};

const PROGRESS_OPTIONS = ['on_track', 'delayed', 'stalled', 'completed'];

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('en-KE', { year: 'numeric', month: 'short', day: '2-digit' });
}

function statusLabel(status) {
  return String(status || 'draft').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatChangedValue(value) {
  if (value == null || value === '') return '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function formatChangedFields(changedFields) {
  if (!changedFields || typeof changedFields !== 'object') return null;
  const lines = [];
  for (const [key, val] of Object.entries(changedFields)) {
    const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
    if (val && typeof val === 'object' && 'from' in val && 'to' in val) {
      lines.push(`${label}: ${formatChangedValue(val.from)} → ${formatChangedValue(val.to)}`);
    } else {
      lines.push(`${label}: ${formatChangedValue(val)}`);
    }
  }
  return lines.length ? lines.join('\n') : null;
}

const ACTION_LABELS = {
  created: 'Draft created',
  updated: 'Updated',
  ward_revised: 'Ward revision',
  submitted_to_ward: 'Submitted to ward',
  forwarded_to_subcounty: 'Forwarded to sub-county',
  resubmitted_to_subcounty: 'Resubmitted to sub-county',
  returned_to_ward: 'Returned to ward',
  forwarded_to_chief: 'Forwarded to chief officer',
  chief_approved: 'Chief approved — published',
};

export default function VillageMonitoringWorkflowPage() {
  const { hasPrivilege } = useAuth();
  const [searchParams] = useSearchParams();
  const projectIdFilter = searchParams.get('projectId') || '';
  const queueParam = searchParams.get('queue') || '';
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
  const [queue, setQueue] = useState('');
  const [selected, setSelected] = useState(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState([]);
  const [actionOpen, setActionOpen] = useState(false);
  const [actionType, setActionType] = useState('');
  const [comment, setComment] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [editProgress, setEditProgress] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [progressFilter, setProgressFilter] = useState('');
  const [batchSubmitting, setBatchSubmitting] = useState(false);

  const canVillage = hasPrivilege('monitoring_report.submit') || hasPrivilege('monitoring_report.create');
  const canWard = hasPrivilege('monitoring_report.ward_review');
  const canSubcounty = hasPrivilege('monitoring_report.subcounty_review');
  const canChief = hasPrivilege('monitoring_report.chief_approve');

  const defaultQueue = useMemo(() => {
    if (canChief) return 'chief';
    if (canSubcounty) return 'subcounty';
    if (canWard) return 'ward';
    if (canVillage) return 'village';
    return '';
  }, [canChief, canSubcounty, canWard, canVillage]);

  const activeQueue = queue || queueParam || defaultQueue;

  const filteredRows = useMemo(() => {
    if (!progressFilter) return rows;
    if (progressFilter === 'attention') {
      return rows.filter((r) => ['stalled', 'delayed'].includes(r.progressStatus));
    }
    return rows.filter((r) => r.progressStatus === progressFilter);
  }, [rows, progressFilter]);

  const draftRowsInView = useMemo(
    () => filteredRows.filter((r) => r.workflowStatus === 'draft'),
    [filteredRows]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const filters = activeQueue ? { queue: activeQueue } : {};
      if (projectIdFilter) filters.projectId = projectIdFilter;
      const data = await villageMonitoringService.listReports(filters);
      setRows(data?.rows || []);
      try {
        const sum = await villageMonitoringService.getSummary();
        setSummary(sum);
      } catch {
        setSummary(null);
      }
    } catch (e) {
      setError(e?.response?.data?.message || e.message || 'Failed to load monitoring reports.');
    } finally {
      setLoading(false);
    }
  }, [activeQueue, projectIdFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const openHistory = async (row) => {
    setSelected(row);
    setHistoryOpen(true);
    try {
      const data = await villageMonitoringService.getHistory(row.submissionId);
      setHistory(data?.actions || []);
    } catch {
      setHistory([]);
    }
  };

  const openDetail = async (row) => {
    setSelected(row);
    setDetailOpen(true);
    setDetailLoading(true);
    try {
      const data = await villageMonitoringService.getReport(row.submissionId, { detail: true });
      setDetail(data);
    } catch {
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const progressLabel = (value) => {
    const map = { on_track: 'On track', delayed: 'Delayed', stalled: 'Stalled', completed: 'Completed' };
    return map[value] || statusLabel(value);
  };

  const runAction = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      const id = selected.submissionId;
      if (actionType === 'submit') await villageMonitoringService.submitToWard(id);
      else if (actionType === 'forward_subcounty') await villageMonitoringService.forwardToSubcounty(id, comment);
      else if (actionType === 'return_ward') await villageMonitoringService.returnToWard(id, comment);
      else if (actionType === 'forward_chief') await villageMonitoringService.forwardToChief(id, comment);
      else if (actionType === 'approve') await villageMonitoringService.approve(id, comment);
      setActionOpen(false);
      setComment('');
      setSnackbar({ open: true, message: 'Action completed.', severity: 'success' });
      await load();
    } catch (e) {
      setSnackbar({
        open: true,
        message: e?.response?.data?.message || e.message || 'Action failed.',
        severity: 'error',
      });
    } finally {
      setBusy(false);
    }
  };

  const submitAllDrafts = async () => {
    setBatchSubmitting(true);
    try {
      const result = await villageMonitoringService.submitAllDrafts();
      const submitted = result?.submitted?.length || 0;
      const failed = result?.failed?.length || 0;
      if (submitted > 0 && failed === 0) {
        setSnackbar({ open: true, message: `${submitted} draft(s) submitted to ward.`, severity: 'success' });
      } else if (submitted > 0 && failed > 0) {
        setSnackbar({
          open: true,
          message: `${submitted} submitted, ${failed} failed (missing progress status or other errors).`,
          severity: 'warning',
        });
      } else if (failed > 0) {
        setSnackbar({
          open: true,
          message: result.failed[0]?.message || 'No drafts could be submitted.',
          severity: 'error',
        });
      } else {
        setSnackbar({ open: true, message: 'No draft reports to submit.', severity: 'info' });
      }
      await load();
    } catch (e) {
      setSnackbar({
        open: true,
        message: e?.response?.data?.message || e.message || 'Batch submit failed.',
        severity: 'error',
      });
    } finally {
      setBatchSubmitting(false);
    }
  };

  const saveEdit = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      await villageMonitoringService.updateReport(selected.submissionId, {
        title: editTitle,
        progressStatus: editProgress,
      });
      setEditOpen(false);
      setSnackbar({ open: true, message: 'Report updated.', severity: 'success' });
      await load();
    } catch (e) {
      setSnackbar({
        open: true,
        message: e?.response?.data?.message || e.message || 'Update failed.',
        severity: 'error',
      });
    } finally {
      setBusy(false);
    }
  };

  const columns = useMemo(() => [
    { field: 'submissionId', headerName: 'ID', width: 70 },
    { field: 'projectName', headerName: 'Project', flex: 1.2, minWidth: 160 },
    { field: 'village', headerName: 'Village', width: 120 },
    { field: 'ward', headerName: 'Ward', width: 110 },
    {
      field: 'progressStatus',
      headerName: 'Progress',
      width: 110,
      valueFormatter: (v) => progressLabel(v),
    },
    {
      field: 'workflowStatus',
      headerName: 'Workflow',
      width: 140,
      renderCell: (p) => (
        <Chip size="small" label={statusLabel(p.value)} color={STATUS_COLORS[p.value] || 'default'} />
      ),
    },
    { field: 'visitDate', headerName: 'Visit', width: 110 },
    { field: 'updatedAt', headerName: 'Updated', width: 150, valueFormatter: (v) => formatDate(v) },
    {
      field: 'actions',
      headerName: 'Actions',
      width: 380,
      sortable: false,
      renderCell: (p) => {
        const row = p.row;
        const st = row.workflowStatus;
        return (
          <Stack direction="row" spacing={0.5} flexWrap="wrap">
            <Button size="small" startIcon={<ViewIcon />} onClick={() => openDetail(row)}>View</Button>
            <Button size="small" startIcon={<HistoryIcon />} onClick={() => openHistory(row)}>History</Button>
            {canVillage && st === 'draft' && (
              <>
                <Button size="small" onClick={() => {
                  setSelected(row);
                  setEditTitle(row.title || '');
                  setEditProgress(row.progressStatus || '');
                  setEditOpen(true);
                }}>Edit</Button>
                <Button size="small" startIcon={<SendIcon />} onClick={() => {
                  setSelected(row);
                  setActionType('submit');
                  setActionOpen(true);
                }}>Submit</Button>
              </>
            )}
            {canWard && ['pending_ward', 'returned_to_ward'].includes(st) && (
              <>
                <Button size="small" onClick={() => {
                  setSelected(row);
                  setEditTitle(row.title || '');
                  setEditProgress(row.progressStatus || '');
                  setEditOpen(true);
                }}>Revise</Button>
                <Button size="small" startIcon={<SendIcon />} onClick={() => {
                  setSelected(row);
                  setActionType('forward_subcounty');
                  setActionOpen(true);
                }}>Forward</Button>
              </>
            )}
            {canSubcounty && st === 'pending_subcounty' && (
              <>
                <Button size="small" color="warning" startIcon={<ReturnIcon />} onClick={() => {
                  setSelected(row);
                  setActionType('return_ward');
                  setActionOpen(true);
                }}>Return</Button>
                <Button size="small" startIcon={<SendIcon />} onClick={() => {
                  setSelected(row);
                  setActionType('forward_chief');
                  setActionOpen(true);
                }}>To Chief</Button>
              </>
            )}
            {canChief && st === 'pending_chief' && (
              <Button size="small" color="success" startIcon={<ApproveIcon />} onClick={() => {
                setSelected(row);
                setActionType('approve');
                setActionOpen(true);
              }}>Approve</Button>
            )}
          </Stack>
        );
      },
    },
  ], [canVillage, canWard, canSubcounty, canChief]);

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'center' }} mb={2} spacing={2}>
        <Box>
          <Typography variant="h5" fontWeight={600}>Village monitoring workflow</Typography>
          <Typography variant="body2" color="text.secondary">
            Village → Ward (revise & track) → Sub-county (return/forward) → Chief Officer → public project
          </Typography>
        </Box>
        <Stack direction="row" spacing={1} flexWrap="wrap">
          <TextField select size="small" label="Queue" value={activeQueue} onChange={(e) => setQueue(e.target.value)} sx={{ minWidth: 160 }}>
            {canVillage && <MenuItem value="village">My drafts</MenuItem>}
            {canWard && <MenuItem value="ward">Ward review</MenuItem>}
            {canSubcounty && <MenuItem value="subcounty">Sub-county review</MenuItem>}
            {canChief && <MenuItem value="chief">Chief approval</MenuItem>}
            <MenuItem value="">All accessible</MenuItem>
          </TextField>
          <TextField select size="small" label="Progress" value={progressFilter} onChange={(e) => setProgressFilter(e.target.value)} sx={{ minWidth: 150 }}>
            <MenuItem value="">All</MenuItem>
            <MenuItem value="attention">Stalled / delayed</MenuItem>
            {PROGRESS_OPTIONS.map((o) => <MenuItem key={o} value={o}>{progressLabel(o)}</MenuItem>)}
          </TextField>
          {canVillage && draftRowsInView.length > 1 && (
            <Button
              variant="contained"
              startIcon={<SendIcon />}
              onClick={submitAllDrafts}
              disabled={batchSubmitting}
            >
              {batchSubmitting ? 'Submitting…' : `Submit ${draftRowsInView.length} drafts`}
            </Button>
          )}
          <Button startIcon={<RefreshIcon />} variant="outlined" onClick={load}>Refresh</Button>
        </Stack>
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {projectIdFilter && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Showing visits for project #{projectIdFilter}.{' '}
          <RouterLink to="/monitoring/village-workflow">Clear filter</RouterLink>
        </Alert>
      )}

      {summary?.myQueue > 0 && (
        <Alert severity={summary.returnedToWard > 0 ? 'warning' : 'info'} sx={{ mb: 2 }}>
          {summary.returnedToWard > 0
            ? `${summary.myQueue} report(s) need your action (${summary.returnedToWard} returned for ward revision).`
            : `${summary.myQueue} report(s) in your queue awaiting action.`}
        </Alert>
      )}

      {summary && (
        <Stack direction="row" spacing={1} flexWrap="wrap" mb={2}>
          {summary.draft > 0 && (
            <Chip label={`${summary.draft} draft${summary.draft > 1 ? 's' : ''}`} size="small" />
          )}
          {summary.wardQueue > 0 && (
            <Chip label={`${summary.wardQueue} ward queue`} size="small" color="info" />
          )}
          {summary.returnedToWard > 0 && (
            <Chip label={`${summary.returnedToWard} returned`} size="small" color="error" variant="outlined" />
          )}
          {summary.subcountyQueue > 0 && (
            <Chip label={`${summary.subcountyQueue} sub-county`} size="small" color="warning" />
          )}
          {summary.chiefQueue > 0 && (
            <Chip label={`${summary.chiefQueue} chief`} size="small" color="secondary" />
          )}
          {summary.approved > 0 && (
            <Chip label={`${summary.approved} published`} size="small" color="success" variant="outlined" />
          )}
        </Stack>
      )}

      <Paper sx={{ height: 560 }}>
        {loading ? (
          <Box display="flex" justifyContent="center" alignItems="center" height="100%">
            <CircularProgress />
          </Box>
        ) : (
          <DataGrid
            rows={filteredRows}
            columns={columns}
            getRowId={(r) => r.submissionId}
            disableRowSelectionOnClick
            pageSizeOptions={[10, 25, 50]}
            initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
          />
        )}
      </Paper>

      <Dialog open={detailOpen} onClose={() => setDetailOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>
          Monitoring report #{selected?.submissionId}
          {detail?.title ? ` — ${detail.title}` : ''}
        </DialogTitle>
        <DialogContent dividers>
          {detailLoading ? (
            <Box display="flex" justifyContent="center" py={4}><CircularProgress /></Box>
          ) : detail ? (
            <Stack spacing={2}>
              <Stack direction="row" spacing={1} flexWrap="wrap">
                <Chip size="small" label={statusLabel(detail.workflowStatus)} color={STATUS_COLORS[detail.workflowStatus] || 'default'} />
                {detail.progressStatus && (
                  <Chip
                    size="small"
                    label={progressLabel(detail.progressStatus)}
                    color={detail.progressStatus === 'stalled' ? 'error' : detail.progressStatus === 'delayed' ? 'warning' : 'default'}
                  />
                )}
              </Stack>
              <Typography variant="body2" color="text.secondary">
                {detail.projectName} · {detail.village || '—'}, {detail.ward || '—'} · Visit {detail.visitDate || '—'}
              </Typography>
              {detail.reviewComment && (
                <Alert severity="info">Latest review comment: {detail.reviewComment}</Alert>
              )}
              {detail.structure?.sections?.length > 0 && (
                <ChecklistFormFields
                  structure={detail.structure}
                  value={detail.answers || {}}
                  onChange={() => {}}
                  disabled
                  projectId={detail.projectId}
                />
              )}
              {detail.projectId && (
                <Button
                  component={RouterLink}
                  to={`/projects/${detail.projectId}`}
                  variant="outlined"
                  size="small"
                >
                  Open project
                </Button>
              )}
            </Stack>
          ) : (
            <Typography color="text.secondary">Could not load report details.</Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDetailOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={historyOpen} onClose={() => setHistoryOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>Change history — report #{selected?.submissionId}</DialogTitle>
        <DialogContent>
          <List dense>
            {history.map((a) => (
              <ListItem key={a.actionId} alignItems="flex-start">
                <ListItemText
                  primary={`${ACTION_LABELS[a.actionType] || a.actionType} — ${a.actorName || 'System'}`}
                  secondary={(
                    <>
                      <Typography variant="caption" display="block">{formatDate(a.createdAt)}</Typography>
                      {a.comment && <Typography variant="body2">{a.comment}</Typography>}
                      {a.changedFields && Object.keys(a.changedFields).length > 0 && (
                        <Typography variant="caption" component="pre" sx={{ mt: 1, whiteSpace: 'pre-wrap' }}>
                          {formatChangedFields(a.changedFields)}
                        </Typography>
                      )}
                    </>
                  )}
                />
              </ListItem>
            ))}
            {!history.length && <ListItem><ListItemText primary="No actions recorded yet." /></ListItem>}
          </List>
        </DialogContent>
        <DialogActions><Button onClick={() => setHistoryOpen(false)}>Close</Button></DialogActions>
      </Dialog>

      <Dialog open={editOpen} onClose={() => setEditOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Revise monitoring report</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField label="Title" fullWidth value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
            <TextField select label="Progress status" fullWidth value={editProgress} onChange={(e) => setEditProgress(e.target.value)}>
              {PROGRESS_OPTIONS.map((o) => <MenuItem key={o} value={o}>{statusLabel(o)}</MenuItem>)}
            </TextField>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={saveEdit} disabled={busy}>{busy ? 'Saving…' : 'Save'}</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={actionOpen} onClose={() => setActionOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          {actionType === 'submit' && 'Submit to Ward Administrator'}
          {actionType === 'forward_subcounty' && 'Forward to Sub-County Administrator'}
          {actionType === 'return_ward' && 'Return to Ward Administrator'}
          {actionType === 'forward_chief' && 'Forward to Chief Officer'}
          {actionType === 'approve' && 'Final approval & publish project'}
        </DialogTitle>
        <DialogContent>
          {actionType !== 'submit' && (
            <TextField
              label={actionType === 'return_ward' ? 'Comment (required)' : 'Comment (optional)'}
              fullWidth
              multiline
              minRows={3}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              sx={{ mt: 1 }}
            />
          )}
          {actionType === 'approve' && (
            <Alert severity="info" sx={{ mt: 2 }}>
              Approving will mark the linked project as publicly visible on the citizen dashboard.
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setActionOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={runAction}
            disabled={busy || (actionType === 'return_ward' && !comment.trim())}
          >
            {busy ? 'Working…' : 'Confirm'}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={snackbar.open} autoHideDuration={6000} onClose={() => setSnackbar((s) => ({ ...s, open: false }))}>
        <Alert severity={snackbar.severity} onClose={() => setSnackbar((s) => ({ ...s, open: false }))}>{snackbar.message}</Alert>
      </Snackbar>
    </Box>
  );
}
