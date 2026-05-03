import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Button, Typography, TextField, Stack, Alert, CircularProgress, Chip, Divider,
} from '@mui/material';
import apiService from '../../api';
import { checkUserPrivilege } from '../../utils/helpers';
import { isAdmin } from '../../utils/privilegeUtils.js';

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
      if (e?.response?.status === 404) setDetail(null);
      else {
        const msg =
          (e && typeof e === 'object' && (e.message || e.error)) ||
          (typeof e === 'string' ? e : null) ||
          e?.response?.data?.message ||
          e?.message ||
          'Failed to load workflow';
        setErr(msg);
      }
    } finally {
      setLoading(false);
    }
  }, [entityType, entityId]);

  useEffect(() => {
    load();
  }, [load]);

  const canStart =
    isAdmin(user) ||
    checkUserPrivilege(user, 'workplan.update') ||
    checkUserPrivilege(user, 'strategic_plan.update') ||
    checkUserPrivilege(user, 'subprogram.update') ||
    checkUserPrivilege(user, 'payment_request.update') ||
    checkUserPrivilege(user, 'approval_levels.update') ||
    checkUserPrivilege(user, 'document.create') ||
    checkUserPrivilege(user, 'project.update') ||
    checkUserPrivilege(user, 'project.create');

  const currentPending = detail?.steps?.find((s) => s.status === 'pending');
  const adminBypass = checkUserPrivilege(user, 'approval_levels.update');
  const userRoleId =
    user?.roleId != null
      ? Number(user.roleId)
      : user?.roleid != null
        ? Number(user.roleid)
        : null;
  const stepRoleId = currentPending?.role_id ?? currentPending?.roleId;
  const canAct =
    currentPending &&
    (adminBypass || (stepRoleId != null && userRoleId != null && userRoleId === Number(stepRoleId)));

  const handleStart = async () => {
    setBusy(true);
    try {
      await apiService.approvalWorkflow.startRequest({ entityType, entityId });
      await load();
      onChanged?.();
    } catch (e) {
      const msg =
        (e && typeof e === 'object' && (e.message || e.error)) || (typeof e === 'string' ? e : null) || e?.message;
      setErr(msg || 'Submit failed');
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
      const msg =
        (e && typeof e === 'object' && (e.message || e.error)) || (typeof e === 'string' ? e : null) || e?.message;
      setErr(msg || 'Approve failed');
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
      const msg =
        (e && typeof e === 'object' && (e.message || e.error)) || (typeof e === 'string' ? e : null) || e?.message;
      setErr(msg || 'Reject failed');
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
            {canStart
              ? 'Not submitted yet. Use the button below once an active workflow exists for this certificate type (e.g. entity type project_certificate in Approvals & workflows).'
              : 'Not submitted yet. You need project create/update (or similar) rights to start approval, or ask someone who does.'}
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
          {(detail.steps || []).map((s) => {
            const iid = s.instance_id ?? s.instanceId;
            const isApproved = String(s.status || '').toLowerCase() === 'approved';
            const signerBit = isApproved
              ? ` · ${s.signerFullName || '—'}${s.stepApproverRoleName ? ` (${s.stepApproverRoleName})` : ''}${
                  s.completed_at ? ` · ${new Date(s.completed_at).toLocaleDateString()}` : ''
                }`
              : '';
            return (
              <Typography key={iid} variant="caption" display="block" color="text.secondary">
                Step {s.step_order} ({s.step_name || '—'}): {s.status}
                {signerBit}
                {s.due_at ? ` · due ${new Date(s.due_at).toLocaleString()}` : ''}
                {s.comment ? ` · note: ${s.comment}` : ''}
              </Typography>
            );
          })}
          {(detail.actions || []).length > 0 && (
            <>
              <Typography variant="caption" fontWeight={700} color="text.secondary" display="block" sx={{ mt: 1 }}>
                Activity log
              </Typography>
              {(detail.actions || []).map((a) => (
                <Typography
                  key={a.action_id ?? `${a.created_at}-${a.action_type}`}
                  variant="caption"
                  display="block"
                  color="text.secondary"
                  sx={{ pl: 0.5, borderLeft: '2px solid', borderColor: 'divider', ml: 0.25, mb: 0.25 }}
                >
                  {a.created_at ? new Date(a.created_at).toLocaleString() : '—'} · {a.action_type || '—'}
                  {a.comment ? ` — ${a.comment}` : ''}
                </Typography>
              ))}
            </>
          )}
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
