import React, { useMemo, useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Collapse,
  IconButton,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import FactCheckIcon from '@mui/icons-material/FactCheck';
import RefreshIcon from '@mui/icons-material/Refresh';
import { useAuth } from '../../context/AuthContext.jsx';
import ApprovalWorkflowPanel from '../../components/approval/ApprovalWorkflowPanel.jsx';
import { ROUTES } from '../../configs/appConfig';
import {
  formatPreviousApprovalSummary,
  isResidentEngineerPriorApproval,
  workflowDetailLine,
} from '../../utils/certificateWorkflowDisplay.js';
import { WORKSPACE_ROUTES, workflowChip } from './residentEngineerWorkspaceShared';
import { useEngineerWorkspaceData } from './useEngineerWorkspaceData';
import { canApprovePaymentCertificates, canViewPaymentCertificates } from '../../utils/privilegeUtils.js';

function certificateLabel(row) {
  return [row.certType, row.certSubType].filter(Boolean).join(' · ')
    || row.fileName
    || `Cert #${row.certificateId}`;
}

function PriorApprovalCell({ row }) {
  const summary = formatPreviousApprovalSummary(row);
  if (!summary) {
    return (
      <Typography variant="body2" color="text.secondary">
        —
      </Typography>
    );
  }

  const isResident = isResidentEngineerPriorApproval(row);

  return (
    <Stack spacing={0.5}>
      {isResident ? (
        <Chip
          size="small"
          color="success"
          variant="outlined"
          label="Resident Engineer approved"
          sx={{ alignSelf: 'flex-start', fontWeight: 700 }}
        />
      ) : (
        <Chip
          size="small"
          color="info"
          variant="outlined"
          label="Prior step approved"
          sx={{ alignSelf: 'flex-start' }}
        />
      )}
      <Typography variant="body2" sx={{ fontWeight: isResident ? 600 : 500 }}>
        {summary}
      </Typography>
    </Stack>
  );
}

export default function ResidentEngineerCertificatesPage() {
  const { user, hasPrivilege } = useAuth();
  const navigate = useNavigate();
  const { loading, error, load, certificates, pendingCerts, summary } = useEngineerWorkspaceData({
    include: 'certificates,workflow',
  });
  const [expandedCertId, setExpandedCertId] = useState(null);
  const canViewCerts = canViewPaymentCertificates(hasPrivilege);
  const canApproveCerts = canApprovePaymentCertificates(hasPrivilege);

  const sortedCertificates = useMemo(() => (
    [...certificates].sort((a, b) => {
      const score = (row) => {
        let value = 0;
        if (String(row.approvalWorkflowStatus || '').toLowerCase() === 'pending') value += 4;
        if (isResidentEngineerPriorApproval(row)) value += 2;
        if (formatPreviousApprovalSummary(row)) value += 1;
        return value;
      };
      return score(b) - score(a);
    })
  ), [certificates]);

  const residentApprovedCount = summary.residentEngineerApprovedPending
    ?? sortedCertificates.filter(isResidentEngineerPriorApproval).length;
  const priorApprovedCount = summary.certificatesWithPriorApproval
    ?? sortedCertificates.filter((row) => Boolean(formatPreviousApprovalSummary(row))).length;

  const openApprovePanel = (certificateId) => {
    setExpandedCertId(certificateId);
  };

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1400, mx: 'auto' }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={() => navigate(WORKSPACE_ROUTES.overview)}
          size="small"
        >
          Workspace
        </Button>
        <Tooltip title="Refresh">
          <IconButton onClick={() => load()} disabled={loading} aria-label="Refresh certificates">
            <RefreshIcon />
          </IconButton>
        </Tooltip>
      </Stack>

      <Typography variant="h5" sx={{ fontWeight: 800, mb: 0.5 }}>Payment certificates</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        First approval step (Resident Engineer). Approve here before the Chief Engineer and Co-Finance review.
      </Typography>

      {error ? <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert> : null}

      {!loading && !canViewCerts ? (
        <Alert severity="warning" sx={{ mb: 2 }}>
          Your role is missing payment certificate privileges. Ask ICT to add{' '}
          <code>payment_request.read_all</code>, <code>payment_request.update</code>, and{' '}
          <code>document.read_all</code> to the Resident Engineer role, then log in again.
        </Alert>
      ) : null}

      {!loading && canViewCerts && sortedCertificates.length === 0 ? (
        <Alert severity="info" sx={{ mb: 2 }}>
          No certificates are waiting at your Resident Engineer approval step. New certificates appear here when
          submitted for workflow step 1.
        </Alert>
      ) : null}

      {!loading && summary.outOfScopePendingCertificates > 0 ? (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {summary.outOfScopePendingCertificates} certificate workflow step
          {summary.outOfScopePendingCertificates !== 1 ? 's are' : ' is'} assigned to your role on projects outside
          your access scope. Ask an administrator to assign those projects, or open the county finance certificates
          register if you have county-wide access.
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

      {!loading && pendingCerts.length > 0 && sortedCertificates.length === 0 && !(summary.outOfScopePendingCertificates > 0) ? (
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

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      ) : (
        <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell />
                <TableCell>Certificate</TableCell>
                <TableCell>Project</TableCell>
                <TableCell>Resident / prior approval</TableCell>
                <TableCell>Your step</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {sortedCertificates.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6}>
                    <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
                      No payment certificates are waiting for your approval step in your project scope.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : sortedCertificates.map((row) => {
                const expanded = expandedCertId === row.certificateId;
                const priorSummary = formatPreviousApprovalSummary(row);
                const isResidentApproved = isResidentEngineerPriorApproval(row);
                const highlightRow = isResidentApproved
                  || (String(row.approvalWorkflowStatus || '').toLowerCase() === 'pending' && priorSummary);

                return (
                  <React.Fragment key={row.certificateId}>
                    <TableRow
                      hover
                      sx={highlightRow ? {
                        bgcolor: isResidentApproved ? 'warning.50' : 'action.hover',
                        borderLeft: '4px solid',
                        borderLeftColor: isResidentApproved ? 'warning.main' : 'info.main',
                      } : undefined}
                    >
                      <TableCell width={40}>
                        {canApproveCerts ? (
                          <IconButton size="small" onClick={() => setExpandedCertId(expanded ? null : row.certificateId)}>
                            {expanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                          </IconButton>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <Typography sx={{ fontWeight: 600 }}>
                          {certificateLabel(row)}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">{row.certNumber || '—'}</Typography>
                      </TableCell>
                      <TableCell>{row.projectName || `Project #${row.projectId}`}</TableCell>
                      <TableCell>
                        <PriorApprovalCell row={row} />
                      </TableCell>
                      <TableCell>
                        <Tooltip title={workflowDetailLine(row)} placement="top">
                          <span>
                            {workflowChip(row.approvalWorkflowStatus)}
                          </span>
                        </Tooltip>
                        {row.approvalCurrentStepName ? (
                          <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
                            {row.approvalCurrentStepName}
                          </Typography>
                        ) : null}
                      </TableCell>
                      <TableCell align="right">
                        <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                          {canApproveCerts && String(row.approvalWorkflowStatus || '').toLowerCase() === 'pending' ? (
                            <Button
                              size="small"
                              variant="contained"
                              color={isResidentApproved ? 'warning' : 'primary'}
                              onClick={() => openApprovePanel(row.certificateId)}
                              sx={{ textTransform: 'none' }}
                            >
                              Review &amp; approve
                            </Button>
                          ) : null}
                          <Button
                            size="small"
                            onClick={() => navigate(`${ROUTES.FINANCE_PAYMENT_CERTIFICATES}?pendingMe=1&focusCertificate=${row.certificateId}`)}
                            sx={{ textTransform: 'none' }}
                          >
                            Open
                          </Button>
                        </Stack>
                      </TableCell>
                    </TableRow>
                    {canApproveCerts ? (
                      <TableRow>
                        <TableCell colSpan={6} sx={{ py: 0, borderBottom: expanded ? undefined : 'none' }}>
                          <Collapse in={expanded} unmountOnExit>
                            <Box sx={{ py: 2, px: 1 }}>
                              {priorSummary ? (
                                <Alert severity={isResidentApproved ? 'warning' : 'info'} sx={{ mb: 2 }}>
                                  Prior approval: {priorSummary}. Complete your step below.
                                </Alert>
                              ) : null}
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
      )}
    </Box>
  );
}
