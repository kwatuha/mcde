import menuConfig from '../configs/menuConfig.json';
import { ROUTES } from '../configs/appConfig.js';
import { isSuperAdminUser } from './roleUtils.js';
import {
    isChiefPortalUser,
    isCoFinancePortalUser,
    isContractor,
    isEngineerPortalUser,
    isSectorMePortalUser,
    isSubCountyPortalUser,
    isVillagePortalUser,
    isWardPortalUser,
} from './privilegeUtils.js';
import { DEFAULT_POST_LOGIN_LANDING, normalizePostLoginPath } from './postLoginNavigation.js';

export function asVisibilitySet(values) {
  if (!Array.isArray(values) || values.length === 0) return null;
  const keys = values.map((v) => String(v || '').trim()).filter(Boolean);
  return keys.length > 0 ? new Set(keys) : null;
}

export function getUserUiProfile(user) {
  return user?.uiProfile || user?.ui_profile || null;
}

export function normalizeLandingPath(value) {
  if (value == null) return null;
  let path = String(value).trim();
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) {
    try {
      path = new URL(path).pathname;
    } catch {
      return null;
    }
  }
  if (!path.startsWith('/')) path = `/${path}`;
  const base = path.split('?')[0].split('#')[0];
  if (!base || base === '/') return null;
  return base;
}

export function getProfileLandingPath(user) {
  const profile = getUserUiProfile(user);
  return normalizeLandingPath(profile?.landingPath ?? profile?.landing_path);
}

export function resolvePostLoginPath(user) {
  if (isUiProfileBypassUser(user)) return DEFAULT_POST_LOGIN_LANDING;
  const fromProfile = getProfileLandingPath(user);
  if (fromProfile) return normalizePostLoginPath(fromProfile);
  if (isContractor(user)) return normalizePostLoginPath(ROUTES.CONTRACTOR_DASHBOARD);
  if (isEngineerPortalUser(user)) return normalizePostLoginPath(ROUTES.ENGINEER_WORKSPACE);
  if (isCoFinancePortalUser(user)) return normalizePostLoginPath(ROUTES.CO_FINANCE_WORKSPACE);
  if (isVillagePortalUser(user)) return normalizePostLoginPath(ROUTES.VILLAGE_WORKSPACE);
  if (isWardPortalUser(user)) return normalizePostLoginPath(ROUTES.WARD_WORKSPACE);
  if (isSubCountyPortalUser(user)) return normalizePostLoginPath(ROUTES.SUBCOUNTY_WORKSPACE);
  if (isChiefPortalUser(user)) return normalizePostLoginPath(ROUTES.CHIEF_WORKSPACE);
  if (isSectorMePortalUser(user)) return normalizePostLoginPath(ROUTES.SECTOR_ME_WORKSPACE);
  return DEFAULT_POST_LOGIN_LANDING;
}

export function getProfileMenuVisibilitySet(user) {
  const profile = getUserUiProfile(user);
  return asVisibilitySet(profile?.visibleMenuKeys || profile?.visible_menu_keys);
}

export function getProfileTabVisibilitySet(user) {
  const profile = getUserUiProfile(user);
  const raw = profile?.visibleTabKeys || profile?.visible_tab_keys || [];
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const keys = raw
    .map((key) => String(key || '').trim())
    .filter((key) => key.startsWith('projectDetails:'))
    .map((key) => key.replace(/^projectDetails:/, ''));
  return keys.length ? new Set(keys) : null;
}

export function isExplicitUiProfile(user) {
  if (isUiProfileBypassUser(user)) return false;
  const profile = getUserUiProfile(user);
  if (!profile) return false;
  const name = String(profile.name || '').trim().toLowerCase();
  if (!name) return false;
  return name !== 'default';
}

export function hasRestrictiveMenuProfile(user) {
  if (isUiProfileBypassUser(user)) return false;
  if (getProfileMenuVisibilitySet(user)) return true;
  return isExplicitUiProfile(user);
}

export function hasRestrictiveTabProfile(user) {
  return Boolean(getProfileTabVisibilitySet(user));
}

/** Only super admins bypass UI profile navigation restrictions. */
export function isUiProfileBypassUser(user) {
  return isSuperAdminUser(user);
}

const categoryVisibilityKey = (category) => `category:${category.id}`;

const submenuVisibilityKeys = (category, submenu) => [
  submenu.route ? `route:${submenu.route}` : null,
  `menu:${category.id}:${submenu.route || submenu.title || submenu.to || ''}`,
].filter(Boolean);

export function applyUiProfileToMenuCategories(categories, user) {
  if (isUiProfileBypassUser(user)) return categories;

  const visibleKeys = getProfileMenuVisibilitySet(user);
  if (!visibleKeys) {
    // Named profiles (e.g. CountyEngineer) restrict navigation even before menu keys are saved.
    if (hasRestrictiveMenuProfile(user)) return [];
    return categories;
  }

  return categories
    .map((category) => {
      const categoryAllowed = visibleKeys.has(categoryVisibilityKey(category));
      const submenus = (category.submenus || []).filter((submenu) => {
        if (categoryAllowed) return true;
        return submenuVisibilityKeys(category, submenu).some((key) => visibleKeys.has(key));
      });
      return { ...category, submenus };
    })
    .filter((category) => (category.submenus || []).length > 0);
}

function normalizePath(pathname) {
  return String(pathname || '').split('?')[0].split('#')[0];
}

export function submenuPath(submenu) {
  const route = submenu?.route && ROUTES[submenu.route] ? ROUTES[submenu.route] : submenu?.to;
  if (!route) return '';
  return normalizePath(route);
}

export function isPathAllowedByVisibleMenu(pathname, visibleCategories) {
  const base = normalizePath(pathname);
  if (!base) return true;
  for (const category of visibleCategories || []) {
    for (const submenu of category.submenus || []) {
      const subPath = submenuPath(submenu);
      if (!subPath) continue;
      if (base === subPath || base.startsWith(`${subPath}/`)) return true;
    }
  }
  return false;
}

const ALWAYS_ALLOWED_PATH_PREFIXES = [
  ROUTES.LOGIN,
  ROUTES.FORCE_PASSWORD_CHANGE,
  ROUTES.HOME,
  ROUTES.MOBILE_APP_DOWNLOAD,
  ROUTES.HELP_SUPPORT,
  ROUTES.CONTRACTOR_DASHBOARD,
  ROUTES.ENGINEER_WORKSPACE,
  ROUTES.CO_FINANCE_WORKSPACE,
  ROUTES.VILLAGE_WORKSPACE,
  ROUTES.WARD_WORKSPACE,
  ROUTES.SUBCOUNTY_WORKSPACE,
  ROUTES.CHIEF_WORKSPACE,
  ROUTES.SECTOR_ME_WORKSPACE,
  ROUTES.VILLAGE_MONITORING_WORKFLOW,
  '/help',
  '/profile',
].map(normalizePath).filter(Boolean);

export function isAlwaysAllowedUiProfilePath(pathname, user = null) {
  const base = normalizePath(pathname);
  if (ALWAYS_ALLOWED_PATH_PREFIXES.some(
    (prefix) => base === prefix || base.startsWith(`${prefix}/`)
  )) {
    return true;
  }
  const landing = user ? getProfileLandingPath(user) : null;
  if (landing && (base === landing || base.startsWith(`${landing}/`))) {
    return true;
  }
  return false;
}

/** Contractor portal root and nested pages (payments, photos, project files). */
export function isContractorPortalPath(pathname) {
  const base = normalizePath(pathname);
  const root = normalizePath(ROUTES.CONTRACTOR_DASHBOARD);
  if (!root) return false;
  return base === root || base.startsWith(`${root}/`);
}

export function isCoFinancePortalPath(pathname) {
  const base = normalizePath(pathname);
  const root = normalizePath(ROUTES.CO_FINANCE_WORKSPACE);
  if (!root) return false;
  return base === root || base.startsWith(`${root}/`);
}

export function isVillagePortalPath(pathname) {
  const base = normalizePath(pathname);
  const root = normalizePath(ROUTES.VILLAGE_WORKSPACE);
  if (!root) return false;
  return base === root || base.startsWith(`${root}/`);
}

export function isWardPortalPath(pathname) {
  const base = normalizePath(pathname);
  const root = normalizePath(ROUTES.WARD_WORKSPACE);
  if (!root) return false;
  return base === root || base.startsWith(`${root}/`);
}

export function isSubCountyPortalPath(pathname) {
  const base = normalizePath(pathname);
  const root = normalizePath(ROUTES.SUBCOUNTY_WORKSPACE);
  if (!root) return false;
  return base === root || base.startsWith(`${root}/`);
}

export function isChiefPortalPath(pathname) {
  const base = normalizePath(pathname);
  const root = normalizePath(ROUTES.CHIEF_WORKSPACE);
  if (!root) return false;
  return base === root || base.startsWith(`${root}/`);
}

export function isSectorMePortalPath(pathname) {
  const base = normalizePath(pathname);
  const root = normalizePath(ROUTES.SECTOR_ME_WORKSPACE);
  if (!root) return false;
  return base === root || base.startsWith(`${root}/`);
}

/** Village M&E workspace routes plus project detail and monitoring pages used during field work. */
export function isVillageWorkflowPath(pathname) {
  const base = normalizePath(pathname);
  if (isVillagePortalPath(pathname)) return true;
  if (/^\/projects\/\d+/.test(base)) return true;
  const villageWorkflow = normalizePath(ROUTES.VILLAGE_MONITORING_WORKFLOW);
  if (villageWorkflow && (base === villageWorkflow || base.startsWith(`${villageWorkflow}/`))) {
    return true;
  }
  const monitoringVisits = normalizePath(ROUTES.MONITORING_PROJECT_MONITORING);
  if (monitoringVisits && (base === monitoringVisits || base.startsWith(`${monitoringVisits}/`))) {
    return true;
  }
  const projectDocs = normalizePath(ROUTES.PROJECT_DOCUMENTS_BY_PROJECT);
  if (projectDocs && (base === projectDocs || base.startsWith(`${projectDocs}/`))) {
    return true;
  }
  const projects = normalizePath(ROUTES.PROJECTS);
  if (projects && (base === projects || base.startsWith(`${projects}/`))) {
    return true;
  }
  const projectUpdates = normalizePath(ROUTES.PROJECT_UPDATES);
  if (projectUpdates && (base === projectUpdates || base.startsWith(`${projectUpdates}/`))) {
    return true;
  }
  const rriProgrammes = normalizePath(ROUTES.RRI_PROGRAMMES);
  if (rriProgrammes && (base === rriProgrammes || base.startsWith(`${rriProgrammes}/`))) {
    return true;
  }
  return false;
}

/** Ward M&E workspace routes plus monitoring workflow and ward-scoped project pages. */
export function isWardWorkflowPath(pathname) {
  const base = normalizePath(pathname);
  if (isWardPortalPath(pathname)) return true;
  if (/^\/projects\/\d+/.test(base)) return true;
  const villageWorkflow = normalizePath(ROUTES.VILLAGE_MONITORING_WORKFLOW);
  if (villageWorkflow && (base === villageWorkflow || base.startsWith(`${villageWorkflow}/`))) {
    return true;
  }
  const monitoringVisits = normalizePath(ROUTES.MONITORING_PROJECT_MONITORING);
  if (monitoringVisits && (base === monitoringVisits || base.startsWith(`${monitoringVisits}/`))) {
    return true;
  }
  const projectDocs = normalizePath(ROUTES.PROJECT_DOCUMENTS_BY_PROJECT);
  if (projectDocs && (base === projectDocs || base.startsWith(`${projectDocs}/`))) {
    return true;
  }
  const projects = normalizePath(ROUTES.PROJECTS);
  if (projects && (base === projects || base.startsWith(`${projects}/`))) {
    return true;
  }
  const projectUpdates = normalizePath(ROUTES.PROJECT_UPDATES);
  if (projectUpdates && (base === projectUpdates || base.startsWith(`${projectUpdates}/`))) {
    return true;
  }
  const rriProgrammes = normalizePath(ROUTES.RRI_PROGRAMMES);
  if (rriProgrammes && (base === rriProgrammes || base.startsWith(`${rriProgrammes}/`))) {
    return true;
  }
  return false;
}

/** Sub-county M&E workspace routes plus monitoring workflow and sub-county-scoped project pages. */
export function isSubCountyWorkflowPath(pathname) {
  const base = normalizePath(pathname);
  if (isSubCountyPortalPath(pathname)) return true;
  if (/^\/projects\/\d+/.test(base)) return true;
  const villageWorkflow = normalizePath(ROUTES.VILLAGE_MONITORING_WORKFLOW);
  if (villageWorkflow && (base === villageWorkflow || base.startsWith(`${villageWorkflow}/`))) {
    return true;
  }
  const monitoringVisits = normalizePath(ROUTES.MONITORING_PROJECT_MONITORING);
  if (monitoringVisits && (base === monitoringVisits || base.startsWith(`${monitoringVisits}/`))) {
    return true;
  }
  const projectDocs = normalizePath(ROUTES.PROJECT_DOCUMENTS_BY_PROJECT);
  if (projectDocs && (base === projectDocs || base.startsWith(`${projectDocs}/`))) {
    return true;
  }
  const projects = normalizePath(ROUTES.PROJECTS);
  if (projects && (base === projects || base.startsWith(`${projects}/`))) {
    return true;
  }
  const projectUpdates = normalizePath(ROUTES.PROJECT_UPDATES);
  if (projectUpdates && (base === projectUpdates || base.startsWith(`${projectUpdates}/`))) {
    return true;
  }
  const rriProgrammes = normalizePath(ROUTES.RRI_PROGRAMMES);
  if (rriProgrammes && (base === rriProgrammes || base.startsWith(`${rriProgrammes}/`))) {
    return true;
  }
  return false;
}

/** Department chief M&E workspace routes plus monitoring workflow and department-scoped project pages. */
export function isChiefWorkflowPath(pathname) {
  const base = normalizePath(pathname);
  if (isChiefPortalPath(pathname)) return true;
  if (/^\/projects\/\d+/.test(base)) return true;
  const villageWorkflow = normalizePath(ROUTES.VILLAGE_MONITORING_WORKFLOW);
  if (villageWorkflow && (base === villageWorkflow || base.startsWith(`${villageWorkflow}/`))) {
    return true;
  }
  const monitoringVisits = normalizePath(ROUTES.MONITORING_PROJECT_MONITORING);
  if (monitoringVisits && (base === monitoringVisits || base.startsWith(`${monitoringVisits}/`))) {
    return true;
  }
  const projectDocs = normalizePath(ROUTES.PROJECT_DOCUMENTS_BY_PROJECT);
  if (projectDocs && (base === projectDocs || base.startsWith(`${projectDocs}/`))) {
    return true;
  }
  const projects = normalizePath(ROUTES.PROJECTS);
  if (projects && (base === projects || base.startsWith(`${projects}/`))) {
    return true;
  }
  const projectUpdates = normalizePath(ROUTES.PROJECT_UPDATES);
  if (projectUpdates && (base === projectUpdates || base.startsWith(`${projectUpdates}/`))) {
    return true;
  }
  const publicApproval = normalizePath(ROUTES.PUBLIC_APPROVAL);
  if (publicApproval && (base === publicApproval || base.startsWith(`${publicApproval}/`))) {
    return true;
  }
  return false;
}

/** Sector M&E champion workspace routes plus monitoring workflow and sector-scoped project pages. */
export function isSectorMeWorkflowPath(pathname) {
  const base = normalizePath(pathname);
  if (isSectorMePortalPath(pathname)) return true;
  if (/^\/projects\/\d+/.test(base)) return true;
  const villageWorkflow = normalizePath(ROUTES.VILLAGE_MONITORING_WORKFLOW);
  if (villageWorkflow && (base === villageWorkflow || base.startsWith(`${villageWorkflow}/`))) {
    return true;
  }
  const monitoringVisits = normalizePath(ROUTES.MONITORING_PROJECT_MONITORING);
  if (monitoringVisits && (base === monitoringVisits || base.startsWith(`${monitoringVisits}/`))) {
    return true;
  }
  const projectDocs = normalizePath(ROUTES.PROJECT_DOCUMENTS_BY_PROJECT);
  if (projectDocs && (base === projectDocs || base.startsWith(`${projectDocs}/`))) {
    return true;
  }
  const projects = normalizePath(ROUTES.PROJECTS);
  if (projects && (base === projects || base.startsWith(`${projects}/`))) {
    return true;
  }
  const projectUpdates = normalizePath(ROUTES.PROJECT_UPDATES);
  if (projectUpdates && (base === projectUpdates || base.startsWith(`${projectUpdates}/`))) {
    return true;
  }
  return false;
}

/** Co-finance workspace routes plus finance and project detail pages used during review. */
export function isCoFinanceWorkflowPath(pathname) {
  const base = normalizePath(pathname);
  if (isCoFinancePortalPath(pathname)) return true;
  if (/^\/projects\/\d+/.test(base)) return true;
  const financeCerts = normalizePath(ROUTES.FINANCE_PAYMENT_CERTIFICATES);
  if (financeCerts && (base === financeCerts || base.startsWith(`${financeCerts}/`))) {
    return true;
  }
  const paymentList = normalizePath(ROUTES.FINANCE_PAYMENT_LIST);
  if (paymentList && (base === paymentList || base.startsWith(`${paymentList}/`))) {
    return true;
  }
  const budgetMgmt = normalizePath(ROUTES.BUDGET_MANAGEMENT);
  if (budgetMgmt && (base === budgetMgmt || base.startsWith(`${budgetMgmt}/`))) {
    return true;
  }
  const workflowApprovals = normalizePath(ROUTES.WORKFLOW_APPROVALS);
  if (workflowApprovals && (base === workflowApprovals || base.startsWith(`${workflowApprovals}/`))) {
    return true;
  }
  return false;
}

/** Engineer workspace root and nested pages (projects, payments, certificates). */
export function isEngineerPortalPath(pathname) {
  const base = normalizePath(pathname);
  const root = normalizePath(ROUTES.ENGINEER_WORKSPACE);
  if (!root) return false;
  return base === root || base.startsWith(`${root}/`);
}

/**
 * Routes engineers open from the workspace (project detail tabs, finance certificates).
 * Without this, restrictive UI profiles redirect back to /engineer-workspace.
 */
export function isEngineerWorkflowPath(pathname) {
  const base = normalizePath(pathname);
  if (isEngineerPortalPath(pathname)) return true;
  if (/^\/projects\/\d+/.test(base)) return true;
  const financeCerts = normalizePath(ROUTES.FINANCE_PAYMENT_CERTIFICATES);
  if (financeCerts && (base === financeCerts || base.startsWith(`${financeCerts}/`))) {
    return true;
  }
  return false;
}

export function getFirstVisibleMenuPath(visibleCategories, user = null) {
  for (const category of visibleCategories || []) {
    for (const submenu of category.submenus || []) {
      const path = submenuPath(submenu);
      if (path) return path;
    }
  }
  const landing = user ? getProfileLandingPath(user) : null;
  if (landing) return landing;
  return ROUTES.HOME;
}

export function canAccessRouteKeyByUiProfile(user, routeKey) {
  if (!routeKey || isUiProfileBypassUser(user)) return true;
  if (!hasRestrictiveMenuProfile(user)) return true;
  const visibleKeys = getProfileMenuVisibilitySet(user);
  if (!visibleKeys) return false;
  if (visibleKeys.has(`route:${routeKey}`)) return true;
  for (const category of menuConfig.menuCategories || []) {
    if (!visibleKeys.has(categoryVisibilityKey(category))) continue;
    if ((category.submenus || []).some((submenu) => submenu.route === routeKey)) return true;
  }
  return false;
}

export function buildMenuRouteKeyIndex() {
  const map = new Map();
  for (const category of menuConfig.menuCategories || []) {
    for (const submenu of category.submenus || []) {
      const path = submenuPath(submenu);
      if (submenu.route && path) map.set(path, submenu.route);
    }
  }
  return map;
}
