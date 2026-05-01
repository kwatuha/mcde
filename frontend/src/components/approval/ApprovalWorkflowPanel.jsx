import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Button, Typography, TextField, Stack, Alert, CircularProgress, Chip, Divider,
} from '@mui/material';
import apiService from '../../api';
import { checkUserPrivilege } from '../../utils/helpers';

/**
 * Loads / drives generic approval workflow for a given entity (e.g. annual_workplan).
 */
function ApprovalWorkflowPanel({ entityType, entityId, user, onChanged, compact }) {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [detail, setDetail] = useState(null);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!entityType || entityId == null) return;
    setLoading(true);
    setErr(null);
    try {
      const d = await apiService.approvalWorkflow.getByEntity(entityType, entityId);
      setDetail(d);
    } catch (e) {
      if (e.response?.status === 404) setDetail(null);
      else setErr(e.response?.data?.message || e.message || 'Failed to load workflow');
    } finally {
      setLoading(false);
    }
  }, [entityType, entityId]);

  useEffect(() => {
    load();
  }, [load]);

  const canStart =
    checkUserPrivilege(user, 'workplan.update') ||
    checkUserPrivilege(user, 'strategic_plan.update') ||
    checkUserPrivilege(user, 'subprogram.update') ||
    checkUserPrivilege(user, 'approval_levels.update');

  const currentPending = detail?.steps?.find((s) => s.status === 'pending');
  const adminBypass = checkUserPrivilege(user, 'approval_levels.update');
  const userRoleId = user?.roleId != null ? Number(user.roleId) : null;
  const canAct =
    currentPending &&
    (adminBypass ||
      (currentPending.role_id != null && userRoleId === Number(currentPending.role_id)));

  const handleStart = async () => {
    setBusy(true);
    try {
      await apiService.approvalWorkflow.startRequest({ entityType, entityId });
      await load();
      onChanged?.();
    } catch (e) {
      setErr(e.response?.data?.message || e.message);
    } finally {
      setBusy(false);
    }
  };

  const handleApprove = async () => {
    const rid = detail?.request?.request_id ?? detail?.request?.requestId;
    if (!rid) return;
    setBusy(true);
    try {
      await apiService.approvalWorkflow.approve(rid, comment);
      setComment('');
      await load();
      onChanged?.();
    } catch (e) {
      setErr(e.response?.data?.message || e.message);
    } finally {
      setBusy(false);
    }
  };

  const handleReject = async () => {
    const rid = detail?.request?.request_id ?? detail?.request?.requestId;
    if (!rid) return;
    setBusy(true);
    try {
      await apiService.approvalWorkflow.reject(rid, comment);
      setComment('');
      await load();
      onChanged?.();
    } catch (e) {
      setErr(e.response?.data?.message || e.message);
    } finally {
      setBusy(false);
    }
  };

  if (!entityType || entityId == null) return null;
  if (loading) {
    return (
      <Box sx={{ py: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
        <CircularProgress size={22} />
        <Typography variant="caption" color="text.secondary">Loading approval…</Typography>
      </Box>
    );
  }

  const rid = detail?.request?.request_id ?? detail?.request?.requestId;

  return (
    <Box
      sx={{
        mt: compact ? 1 : 2,
        p: compact ? 1 : 2,
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 1,
        bgcolor: 'action.hover',
      }}
    >
      <Typography variant="subtitle2" fontWeight={700} gutterBottom>
        Approval workflow
      </Typography>
      {err && (
        <Alert severity="error" sx={{ mb: 1 }} onClose={() => setErr(null)}>
          {err}
        </Alert>
      )}
      {!detail ? (
        <>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            No active approval request for this item.
          </Typography>
          {canStart && (
            <Button size="small" variant="contained" disabled={busy} onClick={handleStart}>
              Submit for approval
            </Button>
          )}
        </>
      ) : (
        <>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }} flexWrap="wrap" useFlexGap>
            <Chip
              size="small"
              label={`Status: ${detail.request.status}`}
              color={
                detail.request.status === 'approved'
                  ? 'success'
                  : detail.request.status === 'rejected'
                    ? 'error'
                    : 'warning'
              }
            />
            <Chip size="small" variant="outlined" label={`Request #${rid}`} />
          </Stack>
          {(detail.steps || []).map((s) => (
            <Typography key={s.instance_id} variant="caption" display="block" color="text.secondary">
              Step {s.step_order} ({s.step_name || '—'}): {s.status}
              {s.due_at ? ` · due ${new Date(s.due_at).toLocaleString()}` : ''}
            </Typography>
          ))}
          <Divider sx={{ my: 1 }} />
          {detail.request.status === 'pending' && canAct && (
            <>
              <TextField
                size="small"
                fullWidth
                multiline
                minRows={2}
                label="Comment (optional)"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                sx={{ mb: 1 }}
              />
              <Stack direction="row" spacing={1}>
                <Button size="small" color="success" variant="contained" disabled={busy} onClick={handleApprove}>
                  Approve
                </Button>
                <Button size="small" color="error" variant="outlined" disabled={busy} onClick={handleReject}>
                  Reject
                </Button>
              </Stack>
            </>
          )}
          {detail.request.status === 'pending' && !canAct && currentPending && (
            <Typography variant="caption" color="text.secondary">
              Only users with the assigned role (or admins) can approve this step.
            </Typography>
          )}
        </>
      )}
    </Box>
  );
}

export default ApprovalWorkflowPanel;
