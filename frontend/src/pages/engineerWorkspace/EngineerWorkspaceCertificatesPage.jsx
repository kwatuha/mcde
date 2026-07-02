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
import { ENGINEER_WORKSPACE_ROUTES, workflowChip } from './engineerWorkspaceShared';
import { useEngineerWorkspaceData } from './useEngineerWorkspaceData';

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

export default function EngineerWorkspaceCertificatesPage() {
  const { user, hasPrivilege } = useAuth();
  const navigate = useNavigate();
  const { loading, error, load, certificates, pendingCerts, summary } = useEngineerWorkspaceData();
  const [expandedCertId, setExpandedCertId] = useState(null);
  const canApproveCerts = hasPrivilege('document.read_all')
    || hasPrivilege('approval_levels.update')
    || hasPrivilege('payment_request.update');

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
          onClick={() => navigate(ENGINEER_WORKSPACE_ROUTES.overview)}
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

      <Typography variant="h5" sx={{ fontWeight: 800, mb: 0.5 }}>Certificates</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Payment certificates assigned to your approval step. Items approved by the Resident Engineer appear first.
      </Typography>

      {error ? <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert> : null}

      {!loading && residentApprovedCount > 0 ? (
        <Alert
          severity="warning"
          icon={<FactCheckIcon fontSize="inherit" />}
          sx={{ mb: 2 }}
          action={(
            <Button
              color="inherit"
              size="small"
              onClick={() => {
                const first = sortedCertificates.find(isResidentEngineerPriorApproval);
                if (first) openApprovePanel(first.certificateId);
              }}
            >
              Review first
            </Button>
          )}
        >
          <Typography variant="body2" sx={{ fontWeight: 700 }}>
            {residentApprovedCount} certificate{residentApprovedCount !== 1 ? 's' : ''} approved by the Resident Engineer
            {residentApprovedCount !== 1 ? ' are' : ' is'} waiting for your approval.
          </Typography>
          <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
            Expand a row or use Review &amp; approve to complete the Chief Engineer step.
          </Typography>
        </Alert>
      ) : null}

      {!loading && residentApprovedCount === 0 && priorApprovedCount > 0 ? (
        <Alert severity="info" sx={{ mb: 2 }}>
          {priorApprovedCount} certificate{priorApprovedCount !== 1 ? 's' : ''} passed an earlier approval step and
          {' '}
          {priorApprovedCount !== 1 ? 'are' : 'is'} waiting for your action.
        </Alert>
      ) : null}

      {!loading && pendingCerts.length > 0 ? (
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
