import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  CircularProgress,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
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
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import TableViewIcon from '@mui/icons-material/TableView';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import { useNavigate } from 'react-router-dom';
import apiService from '../api';
import { ROUTES } from '../configs/appConfig';
import { useAuth } from '../context/AuthContext.jsx';
import * as XLSX from 'xlsx';

function formatWhen(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return String(iso);
  }
}

function actionLabel(action) {
  switch (action) {
    case 'detected':
      return 'Detected';
    case 'acknowledged':
      return 'Acknowledged';
    case 'resolved':
      return 'Resolved';
    case 'assigned':
      return 'Assigned';
    case 'escalated':
      return 'Escalated';
    default:
      return action || 'Action';
  }
}

function getResolutionComment(row) {
  if (row?.resolutionComment) return row.resolutionComment;
  const actions = Array.isArray(row?.actions) ? row.actions : [];
  const resolved = [...actions].reverse().find((a) => a.action === 'resolved');
  return resolved?.comment || null;
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

function triggerBlobDownload(response, fallbackName) {
  const blob = response?.data instanceof Blob ? response.data : new Blob([response?.data || '']);
  const disposition = response?.headers?.['content-disposition'] || '';
  const match = disposition.match(/filename="?([^"]+)"?/i);
  const filename = match?.[1] || fallbackName;
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function normalizeUsers(raw) {
  const rows = Array.isArray(raw?.users) ? raw.users : Array.isArray(raw) ? raw : [];
  return rows
    .map((u) => {
      const userId = u.userId ?? u.id ?? u.userid;
      const fullName =
        u.fullName ||
        [u.firstName, u.lastName].filter(Boolean).join(' ').trim() ||
        u.username ||
        u.email ||
        `User #${userId}`;
      return { userId, fullName, email: u.email || '' };
    })
    .filter((u) => u.userId != null)
    .sort((a, b) => a.fullName.localeCompare(b.fullName));
}

const ProjectEscalationsPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const myUserId = user?.userId ?? user?.id ?? user?.userid ?? null;

  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [resolveConfirm, setResolveConfirm] = useState(null);
  const [resolveComment, setResolveComment] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [expandedDetail, setExpandedDetail] = useState(null);
  const [users, setUsers] = useState([]);
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignTarget, setAssignTarget] = useState(null);
  const [assignUserId, setAssignUserId] = useState('');
  const [assignComment, setAssignComment] = useState('');
  const [assignError, setAssignError] = useState(null);
  const [exportingPdf, setExportingPdf] = useState(false);

  const [filters, setFilters] = useState({
    status: '',
    severity: '',
    assignment: 'all',
    includeResolved: false,
  });

  const listParams = useMemo(() => {
    const params = { limit: 200 };
    if (filters.status) params.status = filters.status;
    if (filters.severity) params.severity = filters.severity;
    if (filters.includeResolved) params.includeResolved = true;
    if (filters.assignment === 'mine') params.assignedToMe = true;
    if (filters.assignment === 'unassigned') params.unassigned = true;
    return params;
  }, [filters]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [signals, sum] = await Promise.all([
        apiService.projectEscalations.listSignals(listParams),
        apiService.projectEscalations.getSummary(),
      ]);
      setRows(Array.isArray(signals) ? signals : []);
      setSummary(sum || null);
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || 'Failed to load escalations');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [listParams]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = apiService.users?.getUsers
          ? await apiService.users.getUsers()
          : [];
        if (!cancelled) setUsers(normalizeUsers(raw));
      } catch {
        if (!cancelled) setUsers([]);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const loadDetail = async (signalId) => {
    try {
      const detail = await apiService.projectEscalations.getSignal(signalId);
      setExpandedDetail(detail);
    } catch {
      setExpandedDetail(null);
    }
  };

  const toggleExpand = async (signalId) => {
    if (expandedId === signalId) {
      setExpandedId(null);
      setExpandedDetail(null);
      return;
    }
    setExpandedId(signalId);
    setExpandedDetail(null);
    await loadDetail(signalId);
  };

  const handleAcknowledge = async (signalId) => {
    setBusyId(signalId);
    setError(null);
    setSuccessMessage(null);
    try {
      await apiService.projectEscalations.acknowledge(signalId, 'Acknowledged from escalations inbox');
      await load();
      if (expandedId === signalId) await loadDetail(signalId);
      setSuccessMessage('Escalation acknowledged.');
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || 'Acknowledge failed');
    } finally {
      setBusyId(null);
    }
  };

  const confirmResolve = (row) => {
    setResolveComment('');
    setResolveConfirm(row);
  };

  const closeResolveDialog = () => {
    setResolveConfirm(null);
    setResolveComment('');
  };

  const handleResolve = async () => {
    const signalId = resolveConfirm?.signalId;
    const comment = resolveComment.trim();
    if (!signalId) return;
    if (!comment) {
      setError('Please enter a reason for resolving this escalation.');
      return;
    }
    setBusyId(signalId);
    setError(null);
    setSuccessMessage(null);
    try {
      await apiService.projectEscalations.resolve(signalId, comment);
      closeResolveDialog();
      await load();
      if (expandedId === signalId) {
        setExpandedId(null);
        setExpandedDetail(null);
      }
      setSuccessMessage(
        'Escalation resolved. It was removed from the active list — use History → Include resolved or Status → Resolved to view it again.'
      );
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || 'Resolve failed');
    } finally {
      setBusyId(null);
    }
  };

  const openAssign = (row) => {
    setAssignTarget(row);
    setAssignUserId(row.assignedToUserId ? String(row.assignedToUserId) : '');
    setAssignComment('');
    setAssignError(null);
    setAssignOpen(true);
  };

  const submitAssign = async () => {
    if (!assignTarget) return;
    setBusyId(assignTarget.signalId);
    setAssignError(null);
    try {
      await apiService.projectEscalations.assign(
        assignTarget.signalId,
        assignUserId ? Number(assignUserId) : null,
        assignComment || undefined
      );
      setAssignOpen(false);
      setAssignTarget(null);
      await load();
      if (expandedId === assignTarget.signalId) await loadDetail(assignTarget.signalId);
    } catch (e) {
      const msg = e?.response?.data?.message || e?.message || 'Assign failed';
      setAssignError(msg);
      setError(msg);
    } finally {
      setBusyId(null);
    }
  };

  const downloadPdf = async () => {
    setExportingPdf(true);
    setError(null);
    try {
      const response = await apiService.projectEscalations.exportPdf(listParams);
      triggerBlobDownload(response, 'project-escalations.pdf');
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || 'PDF export failed');
    } finally {
      setExportingPdf(false);
    }
  };

  const downloadExcel = () => {
    if (!rows.length) {
      setError('No escalations to export for the current filters.');
      return;
    }
    const sheetRows = rows.map((row, idx) => ({
      '#': idx + 1,
      'Project ID': row.projectId,
      Project: row.projectName,
      Signal: row.title,
      Rule: row.ruleName || row.ruleCode,
      Category: row.category || '',
      Severity: row.severity,
      Level: row.escalationLevel,
      Status: row.status,
      'Resolved by': row.resolvedByName || '',
      'Resolved at': row.resolvedAt ? formatWhen(row.resolvedAt) : '',
      'Resolution comment': getResolutionComment(row) || '',
      'Assigned to': row.assignedToName || 'Unassigned',
      Department: row.department || '',
      Section: row.section || '',
      Ward: row.ward || '',
      'Financial year': row.financialYear || '',
      Detected: formatWhen(row.detectedAt),
      Message: row.message || '',
    }));
    const worksheet = XLSX.utils.json_to_sheet(sheetRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Escalations');
    XLSX.writeFile(workbook, `project-escalations-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const selectedAssignee = users.find((u) => String(u.userId) === String(assignUserId)) || null;

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1400, mx: 'auto' }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ sm: 'center' }} justifyContent="space-between" sx={{ mb: 2, gap: 1 }}>
          <Box>
            <Typography variant="h5" fontWeight={700}>
              Project escalations
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              Open signals across projects — assign follow-up, acknowledge, resolve, or export reports.
            </Typography>
          </Box>
          <Stack direction="row" spacing={1} flexWrap="wrap">
            <Tooltip title="Refresh">
              <IconButton onClick={load} disabled={loading} aria-label="Refresh">
                <RefreshIcon />
              </IconButton>
            </Tooltip>
            <Button variant="outlined" startIcon={<TableViewIcon />} onClick={downloadExcel} disabled={loading || rows.length === 0}>
              Download Excel
            </Button>
            <Button variant="contained" startIcon={<PictureAsPdfIcon />} onClick={downloadPdf} disabled={exportingPdf || loading}>
              {exportingPdf ? 'Exporting…' : 'Download PDF'}
            </Button>
          </Stack>
        </Stack>

        {summary && (
          <Stack direction="row" spacing={1} sx={{ mb: 2, flexWrap: 'wrap' }}>
            <Chip label={`${summary.total ?? 0} open`} color="default" />
            <Chip label={`${summary.critical ?? 0} critical`} color="error" variant="outlined" />
            <Chip label={`${summary.high ?? 0} high`} color="warning" variant="outlined" />
            <Chip label={`${summary.level3Plus ?? 0} level 3+`} variant="outlined" />
          </Stack>
        )}

        <Paper sx={{ p: 2, mb: 2 }}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
            <FormControl size="small" sx={{ minWidth: 140 }}>
              <InputLabel>Status</InputLabel>
              <Select
                label="Status"
                value={filters.status}
                onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
              >
                <MenuItem value="">Open + acknowledged</MenuItem>
                <MenuItem value="open">Open only</MenuItem>
                <MenuItem value="acknowledged">Acknowledged</MenuItem>
                <MenuItem value="resolved">Resolved</MenuItem>
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 140 }}>
              <InputLabel>Severity</InputLabel>
              <Select
                label="Severity"
                value={filters.severity}
                onChange={(e) => setFilters((f) => ({ ...f, severity: e.target.value }))}
              >
                <MenuItem value="">All</MenuItem>
                <MenuItem value="critical">Critical</MenuItem>
                <MenuItem value="high">High</MenuItem>
                <MenuItem value="medium">Medium</MenuItem>
                <MenuItem value="low">Low</MenuItem>
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 160 }}>
              <InputLabel>Assignment</InputLabel>
              <Select
                label="Assignment"
                value={filters.assignment}
                onChange={(e) => setFilters((f) => ({ ...f, assignment: e.target.value }))}
              >
                <MenuItem value="all">All</MenuItem>
                <MenuItem value="mine">Assigned to me</MenuItem>
                <MenuItem value="unassigned">Unassigned</MenuItem>
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 160 }}>
              <InputLabel>History</InputLabel>
              <Select
                label="History"
                value={filters.includeResolved ? 'yes' : 'no'}
                onChange={(e) => setFilters((f) => ({ ...f, includeResolved: e.target.value === 'yes' }))}
              >
                <MenuItem value="no">Active only</MenuItem>
                <MenuItem value="yes">Include resolved</MenuItem>
              </Select>
            </FormControl>
          </Stack>
          {!filters.includeResolved && filters.status !== 'resolved' && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>
              Resolved escalations leave the active list. Use <strong>Status → Resolved</strong> or{' '}
              <strong>History → Include resolved</strong> to view resolution comments.
            </Typography>
          )}
        </Paper>

        {successMessage && (
          <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccessMessage(null)}>
            {successMessage}
          </Alert>
        )}

        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
            <CircularProgress />
          </Box>
        ) : rows.length === 0 ? (
          <Paper sx={{ p: 3 }}>
            <Typography>No escalations match the current filters.</Typography>
          </Paper>
        ) : (
          <TableContainer component={Paper}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell width={40} />
                  <TableCell>Project</TableCell>
                  <TableCell>Signal</TableCell>
                  <TableCell>Severity</TableCell>
                  <TableCell>Level</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Resolution</TableCell>
                  <TableCell>Assigned to</TableCell>
                  <TableCell>Department</TableCell>
                  <TableCell>Detected</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((row) => (
                  <React.Fragment key={row.signalId}>
                    <TableRow hover selected={expandedId === row.signalId}>
                      <TableCell>
                        <IconButton size="small" onClick={() => toggleExpand(row.signalId)} aria-label="Expand">
                          {expandedId === row.signalId ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                        </IconButton>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" fontWeight={600}>{row.projectName}</Typography>
                        <Typography variant="caption" color="text.secondary">#{row.projectId}</Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" fontWeight={600}>{row.title}</Typography>
                        <Typography variant="caption" color="text.secondary">{row.ruleName || row.ruleCode}</Typography>
                      </TableCell>
                      <TableCell>
                        <Chip size="small" label={String(row.severity || '').toUpperCase()} color={severityColor(row.severity)} />
                      </TableCell>
                      <TableCell>L{row.escalationLevel || 1}</TableCell>
                      <TableCell>{row.status}</TableCell>
                      <TableCell sx={{ maxWidth: 260 }}>
                        {row.status === 'resolved' ? (
                          <>
                            <Typography variant="body2">
                              {getResolutionComment(row) || (
                                <Box component="span" sx={{ fontStyle: 'italic', color: 'text.secondary' }}>
                                  No comment recorded
                                </Box>
                              )}
                            </Typography>
                            {(row.resolvedByName || row.resolvedAt) && (
                              <Typography variant="caption" color="text.secondary" display="block">
                                {[row.resolvedByName, row.resolvedAt ? formatWhen(row.resolvedAt) : '']
                                  .filter(Boolean)
                                  .join(' · ')}
                              </Typography>
                            )}
                          </>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell>
                        {row.assignedToName || (
                          <Typography variant="body2" color="text.secondary">Unassigned</Typography>
                        )}
                        {row.assignedToUserId === myUserId && (
                          <Chip size="small" label="You" color="primary" sx={{ ml: 0.5 }} />
                        )}
                      </TableCell>
                      <TableCell>{row.department || '—'}</TableCell>
                      <TableCell>{formatWhen(row.detectedAt)}</TableCell>
                      <TableCell align="right">
                        <Stack direction="row" spacing={0.5} justifyContent="flex-end" flexWrap="wrap">
                          <Button size="small" onClick={() => navigate(`${ROUTES.PROJECTS}/${row.projectId}`)}>
                            Project
                          </Button>
                          <Button size="small" startIcon={<PersonAddIcon />} onClick={() => openAssign(row)}>
                            Assign
                          </Button>
                          {row.status === 'open' && (
                            <Button size="small" disabled={busyId === row.signalId} onClick={() => handleAcknowledge(row.signalId)}>
                              Ack
                            </Button>
                          )}
                          {row.status !== 'resolved' && (
                            <Tooltip title="Mark as handled and remove from the active escalations list">
                              <Button
                                size="small"
                                variant="outlined"
                                disabled={busyId === row.signalId}
                                onClick={() => confirmResolve(row)}
                              >
                                Resolve
                              </Button>
                            </Tooltip>
                          )}
                        </Stack>
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell colSpan={11} sx={{ py: 0, borderBottom: expandedId === row.signalId ? undefined : 0 }}>
                        <Collapse in={expandedId === row.signalId} timeout="auto" unmountOnExit>
                          <Box sx={{ py: 2, px: 1 }}>
                            {!expandedDetail ? (
                              <CircularProgress size={24} />
                            ) : (
                              <Stack spacing={1.5}>
                                {expandedDetail.status === 'resolved' && (
                                  <Alert severity="success" sx={{ alignItems: 'flex-start' }}>
                                    <Typography variant="subtitle2" gutterBottom>
                                      Resolution
                                    </Typography>
                                    <Typography variant="body2">
                                      {getResolutionComment(expandedDetail) || 'No comment recorded'}
                                    </Typography>
                                    {(expandedDetail.resolvedByName || expandedDetail.resolvedAt) && (
                                      <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
                                        {[expandedDetail.resolvedByName, expandedDetail.resolvedAt ? formatWhen(expandedDetail.resolvedAt) : '']
                                          .filter(Boolean)
                                          .join(' · ')}
                                      </Typography>
                                    )}
                                  </Alert>
                                )}
                                <Typography variant="body2">{expandedDetail.message}</Typography>
                                <Typography variant="caption" color="text.secondary">
                                  Ward: {expandedDetail.ward || '—'} · Section: {expandedDetail.section || '—'} · FY: {expandedDetail.financialYear || '—'}
                                </Typography>
                                {Array.isArray(expandedDetail.actions) && expandedDetail.actions.length > 0 && (
                                  <Box>
                                    <Typography variant="subtitle2" gutterBottom>Activity log</Typography>
                                    {expandedDetail.actions.map((a) => (
                                      <Typography key={a.actionId || a.action_id} variant="body2" display="block" sx={{ mb: 0.5 }}>
                                        <Typography component="span" variant="caption" color="text.secondary">
                                          {formatWhen(a.createdAt || a.created_at)}
                                        </Typography>
                                        {' — '}
                                        <Typography component="span" variant="body2" fontWeight={a.action === 'resolved' ? 600 : 400}>
                                          {actionLabel(a.action)}
                                        </Typography>
                                        {(a.actorName || a.actor_name) && (
                                          <Typography component="span" variant="body2" color="text.secondary">
                                            {` by ${a.actorName || a.actor_name}`}
                                          </Typography>
                                        )}
                                        {a.comment && (
                                          <Typography component="span" variant="body2" display="block" sx={{ pl: 2, mt: 0.25 }}>
                                            {a.comment}
                                          </Typography>
                                        )}
                                      </Typography>
                                    ))}
                                  </Box>
                                )}
                                <Button size="small" startIcon={<OpenInNewIcon />} sx={{ alignSelf: 'flex-start' }} onClick={() => navigate(`${ROUTES.PROJECTS}/${row.projectId}`)}>
                                  Open project details
                                </Button>
                              </Stack>
                            )}
                          </Box>
                        </Collapse>
                      </TableCell>
                    </TableRow>
                  </React.Fragment>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}

      <Dialog open={assignOpen} onClose={() => setAssignOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Assign escalation</DialogTitle>
        <DialogContent>
          {assignError && (
            <Alert severity="error" sx={{ mb: 2 }} onClose={() => setAssignError(null)}>
              {assignError}
            </Alert>
          )}
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {assignTarget?.title} — {assignTarget?.projectName}
          </Typography>
          <Autocomplete
            options={users}
            value={selectedAssignee}
            onChange={(_, val) => setAssignUserId(val ? String(val.userId) : '')}
            getOptionLabel={(opt) => `${opt.fullName}${opt.email ? ` (${opt.email})` : ''}`}
            isOptionEqualToValue={(opt, val) => String(opt.userId) === String(val.userId)}
            renderInput={(params) => <TextField {...params} label="Assign to user" placeholder="Search staff…" />}
            sx={{ mb: 2 }}
          />
          <TextField
            label="Comment (optional)"
            fullWidth
            multiline
            minRows={2}
            value={assignComment}
            onChange={(e) => setAssignComment(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAssignOpen(false)}>Cancel</Button>
          <Button
            variant="outlined"
            onClick={() => { setAssignUserId(''); submitAssign(); }}
            disabled={busyId != null}
          >
            Clear assignment
          </Button>
          <Button variant="contained" onClick={submitAssign} disabled={!assignUserId || busyId != null}>
            Assign
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(resolveConfirm)} onClose={closeResolveDialog} maxWidth="sm" fullWidth>
        <DialogTitle>Resolve escalation</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 1 }}>
            <strong>{resolveConfirm?.title}</strong>
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {resolveConfirm?.projectName}
          </Typography>
          <Typography variant="body2" sx={{ mb: 2 }}>
            This marks the issue as handled and closes the escalation. It will disappear from the active list
            (open and acknowledged). You can still find it later under <strong>Status → Resolved</strong> or{' '}
            <strong>History → Include resolved</strong>.
          </Typography>
          <TextField
            label="Reason for resolution"
            placeholder="e.g. Contractor submitted missing documents; issue verified on site"
            fullWidth
            required
            multiline
            minRows={3}
            autoFocus
            value={resolveComment}
            onChange={(e) => setResolveComment(e.target.value)}
            helperText="Required — recorded in the escalation activity log"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={closeResolveDialog}>Cancel</Button>
          <Button
            variant="contained"
            color="primary"
            onClick={handleResolve}
            disabled={busyId != null || !resolveComment.trim()}
          >
            Resolve
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default ProjectEscalationsPage;
