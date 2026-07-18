import { checkUserPrivilege, isAdmin } from './privilegeUtils';

/** Privileges that gate web "Checklists & visits" / field collector workflows. */
export const DATA_COLLECTION_ACCESS_PERMISSIONS = [
  'project.read_all',
  'project.update',
  'monitoring_report.read',
  'monitoring_report.create',
  'monitoring_report.submit',
  'monitoring_report.ward_review',
  'monitoring_report.subcounty_review',
  'monitoring_report.chief_approve',
  'project_monitoring.read',
  'project_monitoring.create',
  'project_monitoring.update',
  'document.read_all',
];

const EXECUTIVE_MOBILE_ROLES = new Set([
  'executive_viewer',
  'executive_supervisor',
  'project_lead',
  'county_viewer',
  'department_chief_officer',
  'sector_me_champion',
  'co_finance_officer',
  'budget_reviewer',
  'finance_reviewer',
  'audit_reviewer',
]);

function normalizeRoleName(role) {
  return String(role || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}

/**
 * True when the user should see CIMES Mobile download prompts and menu entries.
 * Field collectors (data-collection privileges) and executive / oversight roles.
 */
export function canAccessMobileCollectorDownload(user, hasPrivilege = null) {
  if (!user) return false;
  if (isAdmin(user)) return true;
  const role = normalizeRoleName(user.roleName || user.role);
  if (EXECUTIVE_MOBILE_ROLES.has(role)) return true;
  const check = (privilege) => (
    typeof hasPrivilege === 'function'
      ? hasPrivilege(privilege)
      : checkUserPrivilege(user, privilege)
  );
  return DATA_COLLECTION_ACCESS_PERMISSIONS.some((privilege) => check(privilege));
}

export function isWorkspaceLandingPath(pathname) {
  const base = String(pathname || '').split('?')[0].split('#')[0];
  return /-workspace\/?$/.test(base) || base.endsWith('-workspace');
}
