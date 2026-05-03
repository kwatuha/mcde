import { ROUTES } from '../configs/appConfig';

const CERTIFICATE_ENTITY_TYPES = new Set(['project_certificate', 'payment_certificate', 'certificate']);
const FINANCE_CERT_PATH = String(ROUTES.FINANCE_PAYMENT_CERTIFICATES).split('?')[0];

/**
 * Dashboard “pending for me” links should open finance with pendingMe=1 so the list is
 * restricted to certificates whose current pending step is assigned to this user’s role.
 */
export function appendPendingMeForFinanceCertificatePath(path, entityTypeNorm) {
  const et = entityTypeNorm != null ? String(entityTypeNorm).trim().toLowerCase().replace(/-/g, '_') : '';
  if (!path || !CERTIFICATE_ENTITY_TYPES.has(et)) return path;
  const str = String(path).trim();
  if (!str.startsWith(FINANCE_CERT_PATH)) return path;
  const qStart = str.indexOf('?');
  const q = qStart >= 0 ? str.slice(qStart + 1) : '';
  const sp = new URLSearchParams(q);
  if (!sp.has('pendingMe')) sp.set('pendingMe', '1');
  return `${FINANCE_CERT_PATH}?${sp.toString()}`;
}

/** Normalize DB/API entity type strings for routing (snake_case, lower). */
function normalizeEntityTypeString(entityType) {
  if (entityType == null || entityType === '') return '';
  return String(entityType).trim().toLowerCase().replace(/-/g, '_');
}

/** Read entity type from a pending-me row (snake_case or camelCase API). */
export function workflowRowEntityType(row) {
  return normalizeEntityTypeString(row?.entity_type ?? row?.entityType);
}

/**
 * Fallback routes when `link_template` is not set on the workflow definition.
 */
export function getPathForWorkflowEntity(entityType, entityId) {
  const id = entityId != null ? String(entityId) : '';
  const et = normalizeEntityTypeString(entityType);
  switch (et) {
    case 'annual_workplan':
      return `${ROUTES.STRATEGIC_PLANNING}?focusWorkplan=${encodeURIComponent(id)}`;
    case 'payment_request':
      return `${ROUTES.PROJECTS}?focusPaymentRequest=${encodeURIComponent(id)}`;
    case 'project_certificate':
    case 'payment_certificate':
    case 'certificate':
      return `${ROUTES.FINANCE_PAYMENT_CERTIFICATES}?pendingMe=1&focusCertificate=${encodeURIComponent(id)}`;
    default:
      return ROUTES.STRATEGIC_PLANNING;
  }
}

export function workflowEntityTypeLabel(entityType) {
  if (!entityType) return 'Item';
  return String(entityType).replace(/_/g, ' ');
}

/**
 * Resolve `approval_workflow_definitions.link_template` from a pending-me row (or any row
 * with `link_template`, `entity_type`, `entity_id`, `request_id`).
 *
 * Template rules:
 * - Must be a same-app path: starts with `/`, no `http(s)://`, no `//`.
 * - Placeholders: `{{entity_id}}`, `{{request_id}}` (case-insensitive, optional spaces inside braces).
 * - If the template is missing, invalid, or still contains `{{` after substitution, falls back to {@link getPathForWorkflowEntity}.
 */
export function resolveWorkflowNavigationPath(row) {
  const entityId = row?.entity_id ?? row?.entityId;
  const entityTypeNorm = workflowRowEntityType(row);
  const entityTypeForFallback = entityTypeNorm || (row?.entity_type ?? row?.entityType);

  let raw = row?.link_template != null ? String(row.link_template).trim() : '';
  if (!raw) {
    return getPathForWorkflowEntity(entityTypeForFallback, entityId);
  }
  // Allow paths saved without a leading slash (e.g. finance/payment-certificates?…)
  if (!raw.startsWith('/') && !/^https?:\/\//i.test(raw) && !raw.startsWith('//')) {
    raw = `/${raw}`;
  }
  if (!raw.startsWith('/') || /^https?:\/\//i.test(raw) || raw.startsWith('//')) {
    return getPathForWorkflowEntity(entityTypeForFallback, entityId);
  }

  const entityIdStr = entityId != null ? String(entityId) : '';
  const requestId = row?.request_id != null ? String(row.request_id) : row?.requestId != null ? String(row.requestId) : '';

  let out = raw;
  out = out.replace(/\{\{\s*entity_id\s*\}\}/gi, encodeURIComponent(entityIdStr));
  out = out.replace(/\{\{\s*request_id\s*\}\}/gi, encodeURIComponent(requestId));

  if (/\{\{/.test(out)) {
    return getPathForWorkflowEntity(entityTypeForFallback, entityId);
  }
  if (!out.startsWith('/')) {
    return getPathForWorkflowEntity(entityTypeForFallback, entityId);
  }
  return appendPendingMeForFinanceCertificatePath(out, entityTypeNorm);
}
