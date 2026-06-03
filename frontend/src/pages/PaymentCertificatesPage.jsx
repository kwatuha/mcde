import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box,
  Typography,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  List,
  ListItem,
  Link as MuiLink,
  CircularProgress,
  Alert,
  Button,
  Chip,
  Stack,
  IconButton,
  Tooltip,
  FormControlLabel,
  Switch,
  Collapse,
  Paper,
  TextField,
  InputAdornment,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import DescriptionIcon from '@mui/icons-material/Description';
import DownloadIcon from '@mui/icons-material/Download';
import FactCheckIcon from '@mui/icons-material/FactCheck';
import RefreshIcon from '@mui/icons-material/Refresh';
import SearchIcon from '@mui/icons-material/Search';
import { Link, useSearchParams } from 'react-router-dom';
import apiService from '../api';
import { useAuth } from '../context/AuthContext.jsx';
import ApprovalWorkflowPanel from '../components/approval/ApprovalWorkflowPanel.jsx';
import { workflowChipProps, workflowDetailLine } from '../utils/certificateWorkflowDisplay.js';

const CERTIFICATE_APPROVAL_ENTITY = 'project_certificate';

async function extractApiErrorMessage(err) {
  if (err == null) return 'Request failed';
  if (typeof err === 'string') return err;
  if (typeof err === 'object' && err.message) return String(err.message);
  if (typeof Blob !== 'undefined' && err instanceof Blob) {
    const t = await err.text();
    try {
      const j = JSON.parse(t);
      return j.message || t;
    } catch {
      return t || 'Request failed';
    }
  }
  return String(err?.message || err);
}

function rowMatchesApprovalFilter(row, approvalStatus) {
  if (!approvalStatus) return true;
  const target = String(approvalStatus).trim().toLowerCase();
  if (target === 'all') return true;
  const w = String(row.approvalWorkflowStatus || '').trim().toLowerCase();
  if (target === 'pending' || target === 'in_progress' || target === 'inapproval') return w === 'pending';
  if (target === 'approved' || target === 'complete') return w === 'approved';
  if (target === 'rejected') return w === 'rejected';
  if (target === 'none' || target === 'no_workflow' || target === 'not_started') return !w;
  return true;
}

export default function PaymentCertificatesPage() {
  const { user, hasPrivilege } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const canView = hasPrivilege && hasPrivilege('document.read_all');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [downloadingId, setDownloadingId] = useState(null);
  const [workflowOpenForId, setWorkflowOpenForId] = useState(null);
  const [searchText, setSearchText] = useState('');

  const focusCertificate = searchParams.get('focusCertificate') || searchParams.get('certificateId');
  const approvalStatusRaw = searchParams.get('approvalStatus') || '';
  const approvalStatus = approvalStatusRaw.trim();
  /** From dashboard “Open a pending step” — API returns only certs whose current pending step uses this user’s role. */
  const pendingMeFilter =
    searchParams.get('pendingMe') === '1' ||
    searchParams.get('pendingMe') === 'true' ||
    String(searchParams.get('pendingMe') || '').toLowerCase() === 'yes';

  const load = useCallback(async () => {
    if (!canView) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await apiService.certificates.getFinanceList({ pendingMe: pendingMeFilter });
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      const d = e.response?.data;
      setError(
        [d?.message, d?.error].filter(Boolean).join(': ') ||
          e.message ||
          'Failed to load'
      );
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [canView, pendingMeFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const filteredRows = useMemo(() => {
    const a = approvalStatus.toLowerCase();
    const q = searchText.trim().toLowerCase();
    return rows
      .filter((r) => (a && a !== 'all' ? rowMatchesApprovalFilter(r, approvalStatus) : true))
      .filter((r) => {
        if (!q) return true;
        return [
          r.projectName,
          r.certNumber,
          r.certType,
          r.certSubType,
          r.originalFileName,
          r.approvalWorkflowStatus,
          r.applicationStatus,
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(q));
      });
  }, [rows, approvalStatus, searchText]);

  const stats = useMemo(() => {
    const pending = rows.filter((r) => String(r.approvalWorkflowStatus || '').toLowerCase() === 'pending').length;
    const approved = rows.filter((r) => String(r.approvalWorkflowStatus || '').toLowerCase() === 'approved').length;
    const rejected = rows.filter((r) => String(r.approvalWorkflowStatus || '').toLowerCase() === 'rejected').length;
    const projectIds = new Set(rows.map((r) => r.projectId).filter((value) => value !== undefined && value !== null));
    return { total: rows.length, pending, approved, rejected, projects: projectIds.size };
  }, [rows]);

  const groups = useMemo(() => {
    const map = new Map();
    for (const row of filteredRows) {
      const pid = row.projectId;
      const name = row.projectName || `Project #${pid}`;
      if (!map.has(pid)) map.set(pid, { projectId: pid, projectName: name, documents: [] });
      map.get(pid).documents.push(row);
    }
    return [...map.values()].sort((a, b) =>
      String(a.projectName || '').localeCompare(String(b.projectName || ''), undefined, { sensitivity: 'base' })
    );
  }, [filteredRows]);

  useEffect(() => {
    if (!focusCertificate || loading) return;
    const fid = String(focusCertificate);
    const t = window.setTimeout(() => {
      document.getElementById(`finance-cert-${fid}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 150);
    return () => window.clearTimeout(t);
  }, [focusCertificate, loading, groups]);

  useEffect(() => {
    if (!focusCertificate || loading || rows.length === 0) return;
    const fid = String(focusCertificate);
    const row = rows.find((r) => String(r.id ?? r.certificateId) === fid);
    if (row && String(row.approvalWorkflowStatus || '').toLowerCase() === 'pending') {
      setWorkflowOpenForId(fid);
    }
  }, [focusCertificate, loading, rows]);

  const certificateFilePath = (doc) => doc.documentPath || doc.path || doc.document_path;
  const hasCertificateFile = (doc) => Boolean(String(certificateFilePath(doc) || '').trim());

  const setApprovalFilter = (status) => {
    const next = new URLSearchParams(searchParams);
    if (status) next.set('approvalStatus', status);
    else next.delete('approvalStatus');
    setSearchParams(next, { replace: true });
  };

  const handleDownload = async (doc) => {
    const id = doc.id ?? doc.certificateId;
    if (id == null) return;
    if (!hasCertificateFile(doc)) {
      setError('This certificate has no file path on the server (e.g. draft not uploaded yet).');
      return;
    }
    setDownloadingId(id);
    setError(null);
    try {
      const blob = await apiService.certificates.download(id);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download =
        doc.originalFileName || doc.fileName || doc.certNumber || `certificate-${id}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (e) {
      const msg = await extractApiErrorMessage(e);
      setError(msg || 'Download failed');
      console.error(e);
    } finally {
      setDownloadingId(null);
    }
  };

  const handleOpenInNewTab = async (doc) => {
    const id = doc.id ?? doc.certificateId;
    if (id == null) return;
    if (!hasCertificateFile(doc)) {
      setError('This certificate has no file path on the server (e.g. draft not uploaded yet).');
      return;
    }
    setDownloadingId(id);
    setError(null);
    try {
      const blob = await apiService.certificates.download(id);
      const mime =
        blob.type && blob.type !== 'application/octet-stream'
          ? blob.type
          : String(doc.originalFileName || doc.fileName || '').toLowerCase().endsWith('.pdf')
            ? 'application/pdf'
            : blob.type || 'application/octet-stream';
      const typed = new Blob([blob], { type: mime });
      const url = window.URL.createObjectURL(typed);
      const w = window.open(url, '_blank', 'noopener,noreferrer');
      if (!w) setError('Pop-up blocked — allow pop-ups for this site, or use Download.');
      window.setTimeout(() => window.URL.revokeObjectURL(url), 120_000);
    } catch (e) {
      const msg = await extractApiErrorMessage(e);
      setError(msg || 'Could not open file');
      console.error(e);
    } finally {
      setDownloadingId(null);
    }
  };

  if (!canView) {
    return (
      <Box sx={{ p: 2 }}>
        <Alert severity="warning">You do not have permission to view payment certificates.</Alert>
      </Box>
    );
  }

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 240 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1180, mx: 'auto' }}>
      <Paper
        elevation={0}
        sx={{
          p: { xs: 2.25, md: 3 },
          mb: 2,
          borderRadius: 3,
          border: '1px solid',
          borderColor: 'divider',
          boxShadow: '0 8px 24px rgba(15, 23, 42, 0.06)',
        }}
      >
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          spacing={2.5}
          justifyContent="space-between"
          alignItems={{ xs: 'stretch', md: 'flex-start' }}
          sx={{ mb: 2 }}
        >
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="h5" sx={{ fontWeight: 800, mb: 0.5 }}>
              Payment certificates
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 820, lineHeight: 1.6 }}>
              {pendingMeFilter
                ? 'Showing certificates whose current approval step is waiting for your role.'
                : 'All payment certificates you can access. Use workflow actions to approve, reject, or track progress.'}
            </Typography>
          </Box>
          <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" justifyContent={{ xs: 'flex-start', md: 'flex-end' }}>
            <Button variant="outlined" startIcon={<RefreshIcon />} onClick={load} disabled={loading}>
              Refresh
            </Button>
          </Stack>
        </Stack>

        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mb: 2 }}>
          <Chip label={`${stats.total} certificates`} />
          <Chip label={`${stats.projects} projects`} variant="outlined" />
          <Chip label={`${stats.pending} pending`} color={stats.pending ? 'warning' : 'default'} variant={stats.pending ? 'filled' : 'outlined'} />
          <Chip label={`${stats.approved} approved`} color="success" variant="outlined" />
          <Chip label={`${stats.rejected} rejected`} color="error" variant="outlined" />
        </Stack>

        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ xs: 'stretch', md: 'center' }}>
          <TextField
            fullWidth
            size="small"
            label="Search certificates"
            placeholder="Project, certificate number, file name..."
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon color="action" />
                </InputAdornment>
              ),
            }}
          />
          <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ flexShrink: 0 }}>
            {[
              ['', 'All'],
              ['pending', 'Pending'],
              ['approved', 'Approved'],
              ['rejected', 'Rejected'],
              ['none', 'No workflow'],
            ].map(([value, label]) => (
              <Chip
                key={label}
                label={label}
                clickable
                color={(approvalStatus || '') === value || (!approvalStatus && !value) ? 'primary' : 'default'}
                variant={(approvalStatus || '') === value || (!approvalStatus && !value) ? 'filled' : 'outlined'}
                onClick={() => setApprovalFilter(value)}
              />
            ))}
          </Stack>
        </Stack>

        <FormControlLabel
          sx={{ mt: 1.5, alignItems: 'flex-start', ml: 0 }}
          control={
            <Switch
              checked={pendingMeFilter}
              onChange={(_, checked) => {
                const next = new URLSearchParams(searchParams);
                if (checked) next.set('pendingMe', '1');
                else next.delete('pendingMe');
                setSearchParams(next, { replace: true });
              }}
              color="primary"
            />
          }
          label={
            <Box>
              <Typography variant="body2">Only certificates waiting for my approval step</Typography>
              <Typography variant="caption" color="text.secondary" display="block">
                Matches the dashboard pending list. Off = full finance list for your role.
              </Typography>
            </Box>
          }
        />
      </Paper>

      {(focusCertificate || approvalStatus || pendingMeFilter) && (
        <Alert severity="info" sx={{ mb: 2 }}>
          {pendingMeFilter && (
            <Typography variant="body2" component="span" display="block">
              Filter: <strong>pending for my role</strong> (server-side).
            </Typography>
          )}
          {approvalStatus && (
            <Typography variant="body2" component="span" display="block">
              Filter: workflow status = <strong>{approvalStatus}</strong>
            </Typography>
          )}
          {focusCertificate && (
            <Typography variant="body2" component="span" display="block">
              Focus: certificate id <strong>{focusCertificate}</strong> (highlighted below when present).
            </Typography>
          )}
        </Alert>
      )}

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} action={<Button onClick={load}>Retry</Button>}>
          {error}
        </Alert>
      )}

      {!error && groups.length === 0 && (
        <Alert severity="info">
          {rows.length > 0 && (focusCertificate || (approvalStatus && approvalStatus.toLowerCase() !== 'all'))
            ? 'No certificates match the current URL filters. Clear query parameters or widen the approval filter.'
            : rows.length === 0 && pendingMeFilter
              ? 'No certificates are waiting for your approval step right now. Turn off “Only certificates waiting for my approval step” above to see the full list, or confirm your user has a role id that matches the workflow step.'
              : 'No payment certificates found.'}
        </Alert>
      )}

      {groups.map((g) => (
        <Accordion
          key={g.projectId}
          defaultExpanded
          disableGutters
          sx={{
            mb: 1.25,
            borderRadius: 2,
            border: '1px solid',
            borderColor: 'divider',
            overflow: 'hidden',
            '&:before': { display: 'none' },
          }}
        >
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', pr: 1 }}>
              <Box sx={{ minWidth: 0 }}>
                <Typography fontWeight={700} noWrap>{g.projectName}</Typography>
                <Typography variant="caption" color="text.secondary">
                  {g.documents.length} certificate{g.documents.length === 1 ? '' : 's'}
                </Typography>
              </Box>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ flexShrink: 0 }}>
                <Chip size="small" label={g.documents.length} />
                <MuiLink
                  component={Link}
                  to={`/projects/${g.projectId}`}
                  variant="body2"
                  onClick={(e) => e.stopPropagation()}
                >
                  Open project
                </MuiLink>
              </Stack>
            </Box>
          </AccordionSummary>
          <AccordionDetails sx={{ pt: 0 }}>
            <List dense disablePadding>
              {g.documents.map((doc) => {
                const wf = workflowChipProps(doc);
                const title =
                  [doc.certNumber && `#${doc.certNumber}`, doc.certType].filter(Boolean).join(' · ') ||
                  doc.originalFileName ||
                  `Certificate #${doc.id}`;
                const requestDate =
                  doc.createdAt || doc.requestDate
                    ? new Date(doc.createdAt || doc.requestDate).toLocaleDateString(undefined, {
                        dateStyle: 'medium',
                      })
                    : null;
                const award = doc.awardDate
                  ? new Date(doc.awardDate).toLocaleDateString(undefined, { dateStyle: 'medium' })
                  : null;
                const id = doc.id ?? doc.certificateId;
                const isFocused = focusCertificate != null && String(focusCertificate) === String(id);

                return (
                  <ListItem
                    id={`finance-cert-${id}`}
                    key={id}
                    alignItems="flex-start"
                    disableGutters
                    sx={{
                      py: 1.25,
                      px: 0.5,
                      flexDirection: 'column',
                      alignItems: 'stretch',
                      borderBottom: '1px solid',
                      borderColor: 'divider',
                      bgcolor: isFocused ? 'action.selected' : undefined,
                      outline: isFocused ? '2px solid' : undefined,
                      outlineColor: isFocused ? 'primary.main' : undefined,
                      outlineOffset: isFocused ? 0 : undefined,
                    }}
                  >
                    <Stack direction="row" spacing={1} alignItems="flex-start">
                      <DescriptionIcon sx={{ mt: 0.25, color: 'text.secondary', fontSize: 22, flexShrink: 0 }} />
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography variant="subtitle2" fontWeight={600} sx={{ lineHeight: 1.3 }}>
                          {title}
                        </Typography>
                        {doc.certSubType ? (
                          <Typography variant="caption" color="text.secondary" display="block">
                            {doc.certSubType}
                          </Typography>
                        ) : null}
                        <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap sx={{ mt: 0.75 }}>
                          <Chip size="small" {...wf} />
                          {doc.applicationStatus ? (
                            <Chip
                              size="small"
                              variant="outlined"
                              label={`Tab: ${doc.applicationStatus}`}
                            />
                          ) : null}
                          {doc.progressStatus ? (
                            <Chip size="small" variant="outlined" label={String(doc.progressStatus)} />
                          ) : null}
                          {requestDate ? (
                            <Chip size="small" variant="outlined" label={`Requested ${requestDate}`} />
                          ) : null}
                          {award ? (
                            <Chip size="small" variant="outlined" label={`Award ${award}`} />
                          ) : null}
                        </Stack>
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
                          {workflowDetailLine(doc)}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
                          File: {doc.originalFileName || '—'}
                        </Typography>
                        <Stack direction="row" spacing={1} sx={{ mt: 1 }} alignItems="center" flexWrap="wrap" useFlexGap>
                          <Tooltip title={hasCertificateFile(doc) ? 'Open in a new tab (uses your login)' : 'No file on record'}>
                            <span>
                              <Button
                                size="small"
                                variant="outlined"
                                disabled={!hasCertificateFile(doc) || downloadingId === id}
                                onClick={() => handleOpenInNewTab(doc)}
                              >
                                Open file
                              </Button>
                            </span>
                          </Tooltip>
                          <Tooltip title={hasCertificateFile(doc) ? 'Download with session' : 'No file on record'}>
                            <span>
                              <IconButton
                                size="small"
                                color="primary"
                                disabled={!hasCertificateFile(doc) || downloadingId === id}
                                onClick={() => handleDownload(doc)}
                                aria-label="Download certificate"
                              >
                                {downloadingId === id ? (
                                  <CircularProgress size={18} />
                                ) : (
                                  <DownloadIcon fontSize="small" />
                                )}
                              </IconButton>
                            </span>
                          </Tooltip>
                          <Tooltip
                            title={
                              workflowOpenForId === id
                                ? 'Hide approval actions'
                                : 'Approve, reject, or view workflow status'
                            }
                          >
                            <IconButton
                              size="small"
                              color={workflowOpenForId === id ? 'primary' : 'default'}
                              onClick={() => setWorkflowOpenForId(workflowOpenForId === id ? null : id)}
                              aria-expanded={workflowOpenForId === id}
                              aria-label="Certificate approval workflow"
                            >
                              <FactCheckIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </Stack>
                        <Collapse in={workflowOpenForId === id} timeout="auto" unmountOnExit>
                          <Box sx={{ mt: 1.5, pl: 0.5 }}>
                            {user ? (
                              <ApprovalWorkflowPanel
                                entityType={CERTIFICATE_APPROVAL_ENTITY}
                                entityId={String(id)}
                                user={user}
                                compact
                                onChanged={() => load()}
                              />
                            ) : (
                              <Typography variant="caption" color="text.secondary">
                                Sign in to use approval actions.
                              </Typography>
                            )}
                          </Box>
                        </Collapse>
                      </Box>
                    </Stack>
                  </ListItem>
                );
              })}
            </List>
          </AccordionDetails>
        </Accordion>
      ))}
    </Box>
  );
}
