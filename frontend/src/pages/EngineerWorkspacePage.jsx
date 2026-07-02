import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Collapse,
  IconButton,
  LinearProgress,
  Paper,
  Stack,
  Tab,
  Tabs,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
  InputAdornment,
} from '@mui/material';
import EngineeringIcon from '@mui/icons-material/Engineering';
import RefreshIcon from '@mui/icons-material/Refresh';
import SearchIcon from '@mui/icons-material/Search';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import RequestQuoteIcon from '@mui/icons-material/RequestQuote';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import PaidIcon from '@mui/icons-material/Paid';
import FactCheckIcon from '@mui/icons-material/FactCheck';
import ArchitectureIcon from '@mui/icons-material/Architecture';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import { useAuth } from '../context/AuthContext.jsx';
import apiService from '../api';
import engineerWorkspaceService from '../api/engineerWorkspaceService';
import { ROUTES } from '../configs/appConfig';
import { formatCurrency } from '../utils/helpers';
import ProjectScopeSetupDialog from '../components/budget/ProjectScopeSetupDialog';
import ApprovalWorkflowPanel from '../components/approval/ApprovalWorkflowPanel.jsx';
import { workflowChipProps } from '../utils/certificateWorkflowDisplay.js';
import { brand } from '../theme/colorTokens';

function complianceColor(pct) {
  if (pct >= 100) return 'success';
  if (pct >= 70) return 'warning';
  return 'error';
}

function scopeChip(scopeStatus) {
  const map = {
    none: { label: 'No scope', color: 'default' },
    draft: { label: 'Scope draft', color: 'warning' },
    planned: { label: 'Baseline set', color: 'success' },
  };
  return map[scopeStatus] || map.none;
}

function workflowChip(status) {
  const props = workflowChipProps(status);
  return <Chip size="small" label={props.label} color={props.color} variant={props.variant || 'filled'} />;
}

function SummaryCard({ label, value, sublabel, color }) {
  return (
    <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, height: '100%' }}>
      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
        {label}
      </Typography>
      <Typography variant="h4" sx={{ fontWeight: 800, color: color || 'text.primary', my: 0.5 }}>
        {value}
      </Typography>
      {sublabel ? (
        <Typography variant="caption" color="text.secondary">{sublabel}</Typography>
      ) : null}
    </Paper>
  );
}

export default function EngineerWorkspacePage() {
  const { user, hasPrivilege } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState('projects');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);
  const [scopeItem, setScopeItem] = useState(null);
  const [expandedCertId, setExpandedCertId] = useState(null);
  const [expandedRequestId, setExpandedRequestId] = useState(null);

  const canSetupScope = hasPrivilege('project.update');
  const canApproveCerts = hasPrivilege('document.read_all')
    || hasPrivilege('approval_levels.update')
    || hasPrivilege('payment_request.update');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const payload = await engineerWorkspaceService.getWorkspace({
        search: search.trim() || undefined,
        limit: 120,
      });
      setData(payload);
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || 'Failed to load engineer workspace');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    load();
  }, [load]);

  const projects = data?.projects || [];
  const paymentRequests = data?.paymentRequests || [];
  const certificates = data?.certificates || [];
  const summary = data?.summary || {};

  const pendingCerts = useMemo(
    () => (data?.pendingWorkflow?.certificates || []),
    [data]
  );

  const projectTabLink = (projectId, tabKey) => `/projects/${projectId}?tab=${tabKey}`;

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1400, mx: 'auto' }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', sm: 'center' }} spacing={2} sx={{ mb: 2 }}>
        <Box>
          <Stack direction="row" spacing={1} alignItems="center">
            <EngineeringIcon sx={{ color: brand.main, fontSize: 32 }} />
            <Typography variant="h5" sx={{ fontWeight: 800 }}>Engineer Workspace</Typography>
          </Stack>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Project registry, file compliance, scope setup, BQ, contractor payment requests, and certificate approvals.
          </Typography>
        </Box>
        <Tooltip title="Refresh">
          <IconButton onClick={load} disabled={loading} aria-label="Refresh workspace">
            <RefreshIcon />
          </IconButton>
        </Tooltip>
      </Stack>

      {error ? <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert> : null}

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' }, gap: 1.5, mb: 2 }}>
        <SummaryCard label="Projects in scope" value={summary.projectCount ?? '—'} sublabel="Assigned / visible registry" color={brand.main} />
        <SummaryCard label="Avg file compliance" value={summary.avgFileCompliancePct != null ? `${summary.avgFileCompliancePct}%` : '—'} sublabel="Required checklist items" />
        <SummaryCard label="Open payment requests" value={summary.openPaymentRequests ?? '—'} sublabel="Contractor submissions" color="#ed6c02" />
        <SummaryCard label="Certs awaiting you" value={summary.pendingCertificates ?? '—'} sublabel="Workflow steps for your role" color="#2e7d32" />
      </Box>

      <Paper variant="outlined" sx={{ px: 2, pt: 1, mb: 2, borderRadius: 2 }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" scrollButtons="auto">
          <Tab value="projects" icon={<FolderOpenIcon />} iconPosition="start" label="Project registry" />
          <Tab value="payments" icon={<PaidIcon />} iconPosition="start" label={`Payment requests (${paymentRequests.length})`} />
          <Tab value="certificates" icon={<FactCheckIcon />} iconPosition="start" label={`Certificates (${certificates.length})`} />
        </Tabs>
      </Paper>

      <TextField
        size="small"
        placeholder="Search projects..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') load(); }}
        sx={{ mb: 2, maxWidth: 420 }}
        InputProps={{
          startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment>,
          endAdornment: (
            <InputAdornment position="end">
              <Button size="small" onClick={load}>Search</Button>
            </InputAdornment>
          ),
        }}
      />

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      ) : null}

      {!loading && tab === 'projects' ? (
        <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Project</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Scope</TableCell>
                <TableCell>File compliance</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {projects.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5}>
                    <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
                      No projects in your scope. Adjust search or confirm project access with your administrator.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : projects.map((row) => {
                const scope = scopeChip(row.scopeStatus);
                const pct = row.fileCompliance?.completionPct ?? 0;
                return (
                  <TableRow key={row.projectId} hover>
                    <TableCell>
                      <Typography sx={{ fontWeight: 700 }}>{row.projectName}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {row.departmentName || row.directorate || '—'}
                      </Typography>
                    </TableCell>
                    <TableCell>{row.status || '—'}</TableCell>
                    <TableCell>
                      <Chip size="small" label={scope.label} color={scope.color} />
                      <Typography variant="caption" display="block" color="text.secondary">
                        {row.milestoneCount || 0} milestones · {row.bqItemCount || 0} BQ lines
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ minWidth: 180 }}>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Typography variant="body2" sx={{ fontWeight: 700, minWidth: 38 }}>{pct}%</Typography>
                        <LinearProgress
                          variant="determinate"
                          value={pct}
                          color={complianceColor(pct)}
                          sx={{ flex: 1, height: 8, borderRadius: 1 }}
                        />
                      </Stack>
                      <Typography variant="caption" color="text.secondary">
                        {row.fileCompliance?.satisfiedRequired || 0}/{row.fileCompliance?.requiredItems || 0} required files
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Stack direction="row" spacing={0.5} justifyContent="flex-end" flexWrap="wrap">
                        <Button size="small" component={RouterLink} to={projectTabLink(row.projectId, 'overview')} sx={{ textTransform: 'none' }}>
                          Open
                        </Button>
                        <Button size="small" component={RouterLink} to={projectTabLink(row.projectId, 'bq')} startIcon={<RequestQuoteIcon />} sx={{ textTransform: 'none' }}>
                          BQ
                        </Button>
                        <Button size="small" component={RouterLink} to={projectTabLink(row.projectId, 'file-checklist')} startIcon={<UploadFileIcon />} sx={{ textTransform: 'none' }}>
                          Files
                        </Button>
                        {canSetupScope ? (
                          <Button
                            size="small"
                            startIcon={<ArchitectureIcon />}
                            onClick={() => setScopeItem({ registryProjectId: row.projectId, projectName: row.projectName })}
                            sx={{ textTransform: 'none' }}
                          >
                            Scope
                          </Button>
                        ) : null}
                      </Stack>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      ) : null}

      {!loading && tab === 'payments' ? (
        <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell />
                <TableCell>Contractor</TableCell>
                <TableCell>Project</TableCell>
                <TableCell>Amount</TableCell>
                <TableCell>Workflow</TableCell>
                <TableCell>File compliance</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {paymentRequests.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7}>
                    <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
                      No contractor payment requests in your project scope.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : paymentRequests.map((row) => {
                const pct = row.fileCompliance?.completionPct ?? 0;
                const expanded = expandedRequestId === row.requestId;
                return (
                  <React.Fragment key={row.requestId}>
                    <TableRow hover>
                      <TableCell width={40}>
                        <IconButton size="small" onClick={() => setExpandedRequestId(expanded ? null : row.requestId)}>
                          {expanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                        </IconButton>
                      </TableCell>
                      <TableCell>
                        <Typography sx={{ fontWeight: 600 }}>{row.contractorName || '—'}</Typography>
                        <Typography variant="caption" color="text.secondary">{row.invoiceNumber || 'No invoice #'}</Typography>
                      </TableCell>
                      <TableCell>{row.projectName || `Project #${row.projectId}`}</TableCell>
                      <TableCell>{formatCurrency(row.amount)}</TableCell>
                      <TableCell>{workflowChip(row.approvalWorkflowStatus)}</TableCell>
                      <TableCell>
                        <Chip size="small" label={`${pct}%`} color={complianceColor(pct)} />
                      </TableCell>
                      <TableCell align="right">
                        <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                          <Button
                            size="small"
                            onClick={() => navigate(projectTabLink(row.projectId, 'certificates'))}
                            sx={{ textTransform: 'none' }}
                          >
                            Certificates
                          </Button>
                          <Button
                            size="small"
                            onClick={() => navigate(projectTabLink(row.projectId, 'file-checklist'))}
                            sx={{ textTransform: 'none' }}
                          >
                            Files
                          </Button>
                        </Stack>
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell colSpan={7} sx={{ py: 0, borderBottom: expanded ? undefined : 'none' }}>
                        <Collapse in={expanded} unmountOnExit>
                          <Box sx={{ py: 2, px: 1 }}>
                            <Typography variant="body2" sx={{ mb: 1 }}>{row.description}</Typography>
                            <ApprovalWorkflowPanel
                              entityType="payment_request"
                              entityId={row.requestId}
                              user={user}
                              onChanged={load}
                            />
                          </Box>
                        </Collapse>
                      </TableCell>
                    </TableRow>
                  </React.Fragment>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      ) : null}

      {!loading && tab === 'certificates' ? (
        <>
          {pendingCerts.length > 0 ? (
            <Alert severity="info" sx={{ mb: 2 }}>
              {pendingCerts.length} certificate workflow step{pendingCerts.length !== 1 ? 's' : ''} assigned to your role.
              {' '}
              <Button
                size="small"
                component={RouterLink}
                to={`${ROUTES.FINANCE_PAYMENT_CERTIFICATES}?pendingMe=1`}
              >
                Open finance certificates
              </Button>
            </Alert>
          ) : null}
          <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell />
                  <TableCell>Certificate</TableCell>
                  <TableCell>Project</TableCell>
                  <TableCell>Workflow</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {certificates.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5}>
                      <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
                        No payment certificates in your project scope.
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : certificates.map((row) => {
                  const expanded = expandedCertId === row.certificateId;
                  return (
                    <React.Fragment key={row.certificateId}>
                      <TableRow hover>
                        <TableCell width={40}>
                          {canApproveCerts ? (
                            <IconButton size="small" onClick={() => setExpandedCertId(expanded ? null : row.certificateId)}>
                              {expanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                            </IconButton>
                          ) : null}
                        </TableCell>
                        <TableCell>
                          <Typography sx={{ fontWeight: 600 }}>
                            {[row.certType, row.certSubType].filter(Boolean).join(' · ') || row.fileName || `Cert #${row.certificateId}`}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">{row.certNumber || '—'}</Typography>
                        </TableCell>
                        <TableCell>{row.projectName || `Project #${row.projectId}`}</TableCell>
                        <TableCell>{workflowChip(row.approvalWorkflowStatus)}</TableCell>
                        <TableCell align="right">
                          <Button
                            size="small"
                            onClick={() => navigate(`${ROUTES.FINANCE_PAYMENT_CERTIFICATES}?focusCertificate=${row.certificateId}`)}
                            sx={{ textTransform: 'none' }}
                          >
                            Open
                          </Button>
                        </TableCell>
                      </TableRow>
                      {canApproveCerts ? (
                        <TableRow>
                          <TableCell colSpan={5} sx={{ py: 0, borderBottom: expanded ? undefined : 'none' }}>
                            <Collapse in={expanded} unmountOnExit>
                              <Box sx={{ py: 2, px: 1 }}>
                                <ApprovalWorkflowPanel
                                  entityType="project_certificate"
                                  entityId={row.certificateId}
                                  user={user}
                                  onChanged={load}
                                />
                              </Box>
                            </Collapse>
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </React.Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </>
      ) : null}

      <ProjectScopeSetupDialog
        open={Boolean(scopeItem)}
        onClose={() => setScopeItem(null)}
        item={scopeItem}
        onSuccess={() => {
          setScopeItem(null);
          load();
        }}
      />
    </Box>
  );
}
