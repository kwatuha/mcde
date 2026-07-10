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
];

/**
 * True when the user should see mobile collector download prompts and menu entries.
 * Mirrors access to data collection / monitoring field workflows.
 */
export function canAccessMobileCollectorDownload(user, hasPrivilege = null) {
  if (!user) return false;
  if (isAdmin(user)) return true;
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
