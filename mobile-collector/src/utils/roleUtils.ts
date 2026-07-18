import { AuthUser } from '../services/api';

/** Roles that get the executive briefing experience (not field collection). */
const EXECUTIVE_ROLE_NAMES = new Set([
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

const ADMIN_ROLE_NAMES = new Set([
  'admin',
  'mda_ict_admin',
  'super_admin',
  'super_administrator',
  'superadmin',
  'administrator',
  'ict_admin',
]);

export function normalizeRoleName(role?: string | null): string {
  return String(role || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}

export type AppMode = 'executive' | 'field';

export function getAppMode(user: AuthUser | null | undefined): AppMode {
  const role = normalizeRoleName(user?.roleName);
  if (!role) return 'field';
  if (ADMIN_ROLE_NAMES.has(role) || EXECUTIVE_ROLE_NAMES.has(role)) {
    return 'executive';
  }
  return 'field';
}

export function isExecutiveUser(user: AuthUser | null | undefined): boolean {
  return getAppMode(user) === 'executive';
}

export function displayRoleLabel(role?: string | null): string {
  const raw = String(role || '').trim();
  if (!raw) return 'User';
  return raw
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
