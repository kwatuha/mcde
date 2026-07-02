import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
import RefreshIcon from '@mui/icons-material/Refresh';
import { useAuth } from '../../context/AuthContext.jsx';
import ApprovalWorkflowPanel from '../../components/approval/ApprovalWorkflowPanel.jsx';
import { formatCurrency } from '../../utils/helpers';
import {
  complianceColor,
  ENGINEER_WORKSPACE_ROUTES,
  projectTabLink,
  workflowChip,
} from './engineerWorkspaceShared';
import { useEngineerWorkspaceData } from './useEngineerWorkspaceData';

export default function EngineerWorkspacePaymentsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { loading, error, load, paymentRequests } = useEngineerWorkspaceData();
  const [expandedRequestId, setExpandedRequestId] = useState(null);

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
          <IconButton onClick={() => load()} disabled={loading} aria-label="Refresh payment requests">
            <RefreshIcon />
          </IconButton>
        </Tooltip>
      </Stack>

      <Typography variant="h5" sx={{ fontWeight: 800, mb: 0.5 }}>Payment requests</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Contractor payment submissions in your project scope with inline approval workflow.
      </Typography>

      {error ? <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert> : null}

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
      )}
    </Box>
  );
}
