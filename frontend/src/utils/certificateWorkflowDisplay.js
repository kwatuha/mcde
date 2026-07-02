/**
 * Shared presentation for project / payment certificate approval workflow (API fields from finance-list & project list).
 */

export function workflowChipProps(doc) {
  const w = String(
    doc == null
      ? ''
      : typeof doc === 'string'
        ? doc
        : doc.approvalWorkflowStatus ?? doc.approval_workflow_status ?? ''
  ).toLowerCase();
  if (w === 'approved') return { label: 'Approved', color: 'success' };
  if (w === 'rejected') return { label: 'Rejected', color: 'error' };
  if (w === 'pending') return { label: 'In approval', color: 'warning' };
  return { label: 'Not sent', color: 'default' };
}

export function workflowDetailLine(doc) {
  if (doc == null) {
    return 'No approval workflow has been submitted for this certificate yet.';
  }
  const w = String(
    typeof doc === 'string'
      ? doc
      : doc.approvalWorkflowStatus ?? doc.approval_workflow_status ?? ''
  ).toLowerCase();
  if (w === 'approved') return 'All workflow steps are complete.';
  if (w === 'rejected') return 'This certificate was rejected in the approval workflow.';
  if (w === 'pending') {
    if (typeof doc === 'string') {
      return 'Awaiting action on the current approval step.';
    }
    const total = Number(doc.approvalTotalSteps ?? doc.approval_total_steps) || 0;
    const ord =
      doc.approvalCurrentStepOrder != null
        ? Number(doc.approvalCurrentStepOrder)
        : doc.approval_current_step_order != null
          ? Number(doc.approval_current_step_order)
          : null;
    const name = doc.approvalCurrentStepName
      ? String(doc.approvalCurrentStepName)
      : doc.approval_current_step_name
        ? String(doc.approval_current_step_name)
        : 'Current review';
    if (total > 0 && ord != null && !Number.isNaN(ord)) {
      return `Step ${ord} of ${total}: ${name}`;
    }
    return 'Awaiting action on the current approval step.';
  }
  if (typeof doc === 'object' && doc.applicationStatus) {
    return `Application status on file: ${doc.applicationStatus}. Submit for approval using the approval actions when a workflow is configured.`;
  }
  return 'No approval workflow has been submitted for this certificate yet.';
}

function pickField(doc, camel, snake) {
  if (doc == null || typeof doc !== 'string' && typeof doc !== 'object') return null;
  if (typeof doc === 'string') return null;
  const value = doc[camel] ?? doc[snake];
  if (value == null || value === '') return null;
  return value;
}

export function formatPreviousApprovalSummary(doc) {
  const roleName = pickField(doc, 'previousStepRoleName', 'previous_step_role_name');
  const stepName = pickField(doc, 'previousStepName', 'previous_step_name');
  const approverName = pickField(doc, 'previousStepApproverName', 'previous_step_approver_name');
  const approvedAt = pickField(doc, 'previousStepApprovedAt', 'previous_step_approved_at');

  if (!roleName && !stepName && !approverName) return null;

  const label = roleName || stepName || 'Previous reviewer';
  const who = approverName ? ` by ${approverName}` : '';
  const when = approvedAt
    ? ` on ${new Date(approvedAt).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })}`
    : '';

  return `${label}${who}${when}`;
}

export function isResidentEngineerPriorApproval(doc) {
  const hay = [
    pickField(doc, 'previousStepRoleName', 'previous_step_role_name'),
    pickField(doc, 'previousStepName', 'previous_step_name'),
  ].filter(Boolean).join(' ').toLowerCase();
  return hay.includes('resident') && hay.includes('engineer');
}

export function isAwaitingMyApprovalStep(doc) {
  const status = String(
    doc?.approvalWorkflowStatus ?? doc?.approval_workflow_status ?? ''
  ).toLowerCase();
  return status === 'pending'
    && Number(doc?.approvalCurrentStepOrder ?? doc?.approval_current_step_order) > 0;
}
