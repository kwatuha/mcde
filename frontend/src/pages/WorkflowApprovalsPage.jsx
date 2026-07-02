import React, { useCallback, useEffect, useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Button,
  CircularProgress,
  Alert,
  Stack,
  Chip,
  Collapse,
  IconButton,
  Tooltip,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { useNavigate } from 'react-router-dom';
import apiService from '../api';
import { useAuth } from '../context/AuthContext.jsx';
import ApprovalWorkflowPanel from '../components/approval/ApprovalWorkflowPanel.jsx';
import {
  resolveWorkflowNavigationPath,
  workflowEntityTypeLabel,
} from '../utils/workflowNavigation';
import { checkUserPrivilege } from '../utils/helpers';
import { isAdmin } from '../utils/privilegeUtils.js';

function formatDue(dueAt) {
  if (!dueAt) return '—';
  try {
    return new Date(dueAt).toLocaleString();
  } catch {
    return String(dueAt);
  }
}

function WorkflowApprovalsPage() {
  const { user, hasPrivilege } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedKey, setExpandedKey] = useState(null);

  const canSeeAll = isAdmin(user)
    || hasPrivilege('approval_levels.read')
    || hasPrivilege('approval_levels.update')
    || checkUserPrivilege(user, 'admin.access');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiService.approvalWorkflow.listPendingForMe();
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || 'Failed to load workflow approvals');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggleExpand = (key) => {
    setExpandedKey((prev) => (prev === key ? null : key));
  };

  const openItem = (row) => {
    const path = resolveWorkflowNavigationPath(row);
    if (path?.startsWith('/')) navigate(path);
    else if (path) window.location.href = path;
  };

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1200, mx: 'auto' }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
        <Box>
          <Typography variant="h5" fontWeight={700}>
            Workflow approvals
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {canSeeAll
              ? 'Pending approval steps across the system (admin / approval-levels view).'
              : 'Items waiting for your role in multi-step workflows.'}
          </Typography>
        </Box>
        <Tooltip title="Refresh">
          <IconButton onClick={load} disabled={loading} aria-label="Refresh workflow approvals">
            <RefreshIcon />
          </IconButton>
        </Tooltip>
      </Stack>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress />
        </Box>
      ) : rows.length === 0 ? (
        <Paper sx={{ p: 3 }}>
          <Typography variant="body1" gutterBottom>
            No pending workflow steps.
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Contractor payment requests, certificates, and annual work plans appear here after they enter an approval workflow.
            If you expect items, confirm a contractor has submitted a request and that workflow definitions are seeded.
          </Typography>
        </Paper>
      ) : (
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell width={48} />
                <TableCell>Type</TableCell>
                <TableCell>Reference</TableCell>
                <TableCell>Step</TableCell>
                <TableCell>Due</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row) => {
                const requestId = row.request_id ?? row.requestId;
                const entityType = row.entity_type ?? row.entityType;
                const entityId = row.entity_id ?? row.entityId;
                const stepName = row.step_name ?? row.stepName;
                const stepOrder = row.step_order ?? row.stepOrder;
                const rowKey = `${requestId}-${row.instance_id ?? stepOrder}`;
                const expanded = expandedKey === rowKey;

                return (
                  <React.Fragment key={rowKey}>
                    <TableRow hover>
                      <TableCell>
                        <IconButton size="small" onClick={() => toggleExpand(rowKey)} aria-label={expanded ? 'Collapse' : 'Expand'}>
                          {expanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                        </IconButton>
                      </TableCell>
                      <TableCell>
                        <Chip size="small" label={workflowEntityTypeLabel(entityType)} />
                      </TableCell>
                      <TableCell>#{entityId}</TableCell>
                      <TableCell>{stepName || `Step ${stepOrder}`}</TableCell>
                      <TableCell>{formatDue(row.due_at ?? row.dueAt)}</TableCell>
                      <TableCell align="right">
                        <Button
                          size="small"
                          endIcon={<OpenInNewIcon />}
                          onClick={() => openItem(row)}
                          sx={{ textTransform: 'none', mr: 1 }}
                        >
                          Open
                        </Button>
                        <Button
                          size="small"
                          variant="outlined"
                          onClick={() => toggleExpand(rowKey)}
                          sx={{ textTransform: 'none' }}
                        >
                          Review
                        </Button>
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell colSpan={6} sx={{ py: 0, borderBottom: expanded ? undefined : 'none' }}>
                        <Collapse in={expanded} timeout="auto" unmountOnExit>
                          <Box sx={{ py: 2, px: 1 }}>
                            <ApprovalWorkflowPanel
                              entityType={entityType}
                              entityId={entityId}
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

export default WorkflowApprovalsPage;
