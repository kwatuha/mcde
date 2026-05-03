/**
 * Shared presentation for project / payment certificate approval workflow (API fields from finance-list & project list).
 */

export function workflowChipProps(doc) {
  const w = String(doc.approvalWorkflowStatus ?? doc.approval_workflow_status ?? '').toLowerCase();
  if (w === 'approved') return { label: 'Approved', color: 'success' };
  if (w === 'rejected') return { label: 'Rejected', color: 'error' };
  if (w === 'pending') return { label: 'In approval', color: 'warning' };
  return { label: 'Not sent', color: 'default' };
}

export function workflowDetailLine(doc) {
  const w = String(doc.approvalWorkflowStatus ?? doc.approval_workflow_status ?? '').toLowerCase();
  if (w === 'approved') return 'All workflow steps are complete.';
  if (w === 'rejected') return 'This certificate was rejected in the approval workflow.';
  if (w === 'pending') {
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
  if (doc.applicationStatus) {
    return `Application status on file: ${doc.applicationStatus}. Submit for approval using the approval actions when a workflow is configured.`;
  }
  return 'No approval workflow has been submitted for this certificate yet.';
}
