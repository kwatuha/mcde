/**
 * Aggregates pending work items for the logged-in user.
 */
const escalationEngine = require('./projectEscalationEngine');
const approvalWorkflowEngine = require('./approvalWorkflowEngine');

function getUserId(user) {
  const raw = user?.id ?? user?.userId ?? user?.actualUserId ?? null;
  if (raw == null || raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function mapEscalationTask(sig) {
  return {
    taskType: 'project_escalation',
    taskId: `escalation-${sig.signalId}`,
    sourceId: sig.signalId,
    title: sig.title || sig.ruleName || 'Project escalation',
    subtitle: sig.projectName || `Project #${sig.projectId}`,
    status: sig.status,
    severity: sig.severity,
    escalationLevel: sig.escalationLevel,
    projectId: sig.projectId,
    projectName: sig.projectName,
    department: sig.department,
    assignedAt: sig.assignedAt,
    detectedAt: sig.detectedAt,
    dueAt: null,
    linkPath: `/project-escalations?assignedToMe=true&signalId=${sig.signalId}`,
    meta: {
      ruleCode: sig.ruleCode,
      ruleName: sig.ruleName,
      message: sig.message,
    },
  };
}

function mapWorkflowTask(row) {
  const requestId = row.request_id ?? row.requestId;
  const entityType = row.entity_type ?? row.entityType;
  const entityId = row.entity_id ?? row.entityId;
  const stepName = row.step_name ?? row.stepName;
  const stepOrder = row.step_order ?? row.stepOrder;
  return {
    taskType: 'workflow_approval',
    taskId: `workflow-${requestId}-${row.instance_id ?? stepOrder}`,
    sourceId: requestId,
    title: stepName || `Approval step ${stepOrder}`,
    subtitle: `${String(entityType || 'item').replace(/_/g, ' ')} #${entityId}`,
    status: 'pending',
    severity: null,
    escalationLevel: null,
    projectId: null,
    projectName: null,
    department: null,
    assignedAt: row.created_at ?? row.createdAt ?? null,
    detectedAt: row.created_at ?? row.createdAt ?? null,
    dueAt: row.due_at ?? row.dueAt ?? null,
    linkPath: null,
    meta: {
      entityType,
      entityId,
      stepOrder,
      instanceId: row.instance_id ?? row.instanceId,
      linkTemplate: row.link_template ?? row.linkTemplate,
      raw: row,
    },
  };
}

async function listMyTasks(user, opts = {}) {
  const userId = getUserId(user);
  if (!userId) {
    return { summary: { total: 0, projectEscalations: 0, workflowApprovals: 0 }, tasks: [] };
  }

  const includeWorkflow = opts.includeWorkflow !== false;
  const includeEscalations = opts.includeEscalations !== false;

  const [escalations, workflowRows] = await Promise.all([
    includeEscalations
      ? escalationEngine.listSignals(user, { assignedToMe: true, limit: opts.limit || 100 })
      : Promise.resolve([]),
    includeWorkflow
      ? approvalWorkflowEngine.listPendingForUser(user).catch(() => [])
      : Promise.resolve([]),
  ]);

  const tasks = [
    ...escalations.map(mapEscalationTask),
    ...workflowRows.map(mapWorkflowTask),
  ].sort((a, b) => {
    const aTime = new Date(a.dueAt || a.assignedAt || a.detectedAt || 0).getTime();
    const bTime = new Date(b.dueAt || b.assignedAt || b.detectedAt || 0).getTime();
    return aTime - bTime;
  });

  return {
    summary: {
      total: tasks.length,
      projectEscalations: escalations.length,
      workflowApprovals: workflowRows.length,
    },
    tasks,
  };
}

module.exports = {
  listMyTasks,
};
