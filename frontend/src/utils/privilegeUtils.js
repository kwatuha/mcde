/**
 * Privilege Utilities
 * Centralized privilege checking functions for the application
 */

const ADMIN_ROLE_IDS = new Set([1]);
const ADMIN_ROLE_NAMES = new Set([
  'admin',
  'mda_ict_admin',
  'super_admin',
  'super_administrator',
  'superadmin',
  'administrator',
  'ict_admin',
]);
const PROJECT_BY_SECTOR_ALLOWED_ROLES = new Set(['mda_ict_admin', 'super_admin']);

export const normalizeRoleName = (roleName) =>
  String(roleName || '').trim().toLowerCase().replace(/[\s-]+/g, '_');

/** Inline landing path read — avoid importing uiProfileUtils (pulls menuConfig on every page). */
function getEngineerWorkspaceLandingPath(user) {
  const profile = user?.uiProfile || user?.ui_profile || null;
  if (!profile) return null;
  let path = String(profile.landingPath ?? profile.landing_path ?? '').trim();
  if (!path) return null;
  if (!path.startsWith('/')) path = `/${path}`;
  const base = path.split('?')[0].split('#')[0];
  return base || null;
}

/**
 * Helper function to check if the user has a specific privilege.
 * @param {object | null} user - The user object from AuthContext.
 * @param {string} privilegeName - The name of the privilege to check.
 * @returns {boolean} True if the user has the privilege, false otherwise.
 */
export const checkUserPrivilege = (user, privilegeName) => {
  return user && user.privileges && Array.isArray(user.privileges) && user.privileges.includes(privilegeName);
};

/**
 * Whether the user may open project list/detail routes. Backend GET /api/projects and
 * GET /api/projects/:id enforce organization scope (PostgreSQL); the client must not
 * require project.read_all alone — many roles only have scoped access.
 */
export const canViewProjectsWithBackendScope = (user) => {
  if (!user) return false;
  // Backend enforces project list/detail scope. Frontend should not block
  // valid signed-in users when privileges payload is missing or stale.
  return true;
};

/**
 * Check if user has admin access
 * @param {object | null} user - The user object from AuthContext.
 * @returns {boolean} True if the user is an admin, false otherwise.
 */
export const isAdmin = (user) => {
  if (!user) return false;
  const roleId = Number(user.roleId ?? user.role_id);
  const normalizedRole = normalizeRoleName(user.roleName || user.role);
  return (
    (Number.isFinite(roleId) && ADMIN_ROLE_IDS.has(roleId)) ||
    ADMIN_ROLE_NAMES.has(normalizedRole) ||
    checkUserPrivilege(user, 'admin.access') ||
    checkUserPrivilege(user, 'organization.scope_bypass')
  );
};

/**
 * Check if user has contractor role
 * @param {object | null} user - The user object from AuthContext.
 * @returns {boolean} True if the user is a contractor, false otherwise.
 */
export const isContractor = (user) => {
  return normalizeRoleName(user?.roleName || user?.role) === 'contractor' || user?.contractorId;
};

function getCoFinanceWorkspaceLandingPath(user) {
  const profile = user?.uiProfile || user?.ui_profile || null;
  if (!profile) return null;
  let path = String(profile.landingPath ?? profile.landing_path ?? '').trim();
  if (!path) return null;
  if (!path.startsWith('/')) path = `/${path}`;
  const base = path.split('?')[0].split('#')[0];
  return base || null;
}

function getVillageWorkspaceLandingPath(user) {
  const profile = user?.uiProfile || user?.ui_profile || null;
  if (!profile) return null;
  let path = String(profile.landingPath ?? profile.landing_path ?? '').trim();
  if (!path) return null;
  if (!path.startsWith('/')) path = `/${path}`;
  const base = path.split('?')[0].split('#')[0];
  return base || null;
}

/**
 * County co-finance officers use the co-finance workspace (final certificate sign-off after engineers).
 */
export const isCoFinancePortalUser = (user) => {
  if (!user || isContractor(user)) return false;

  const normalizedRole = normalizeRoleName(user?.roleName || user?.role);
  const landing = getCoFinanceWorkspaceLandingPath(user);
  if (landing?.startsWith('/co-finance-workspace')) return true;
  if (
    normalizedRole.includes('co_finance')
    || normalizedRole.includes('cofinance')
    || normalizedRole.includes('county_finance')
  ) {
    return true;
  }

  if (isAdmin(user)) return false;
  return false;
};

function getWardWorkspaceLandingPath(user) {
  const profile = user?.uiProfile || user?.ui_profile || null;
  if (!profile) return null;
  let path = String(profile.landingPath ?? profile.landing_path ?? '').trim();
  if (!path) return null;
  if (!path.startsWith('/')) path = `/${path}`;
  const base = path.split('?')[0].split('#')[0];
  return base || null;
}

function getSubCountyWorkspaceLandingPath(user) {
  return getWardWorkspaceLandingPath(user);
}

function getChiefWorkspaceLandingPath(user) {
  return getWardWorkspaceLandingPath(user);
}

function getSectorMeWorkspaceLandingPath(user) {
  return getWardWorkspaceLandingPath(user);
}

/**
 * Village administrators use the village M&E workspace (sublocation monitoring).
 */
export const isVillagePortalUser = (user) => {
  if (!user || isContractor(user) || isCoFinancePortalUser(user)) return false;

  const wardLanding = getWardWorkspaceLandingPath(user);
  if (wardLanding?.startsWith('/ward-workspace')) return false;

  const subcountyLanding = getSubCountyWorkspaceLandingPath(user);
  if (subcountyLanding?.startsWith('/subcounty-workspace')) return false;

  const chiefLanding = getChiefWorkspaceLandingPath(user);
  if (chiefLanding?.startsWith('/chief-workspace')) return false;

  const sectorLanding = getSectorMeWorkspaceLandingPath(user);
  if (sectorLanding?.startsWith('/sector-me-workspace')) return false;

  const normalizedRole = normalizeRoleName(user?.roleName || user?.role);
  const landing = getVillageWorkspaceLandingPath(user);
  if (landing?.startsWith('/village-workspace')) return true;
  if (
    normalizedRole.includes('village_administrator')
    || normalizedRole.includes('village_admin')
  ) {
    return true;
  }

  if (isAdmin(user)) return false;
  return false;
};

/**
 * Ward administrators use the ward M&E workspace (monitoring report review).
 */
export const isWardPortalUser = (user) => {
  if (!user || isContractor(user) || isCoFinancePortalUser(user)) return false;

  const wardLanding = getWardWorkspaceLandingPath(user);
  if (wardLanding?.startsWith('/ward-workspace')) return true;

  const subcountyLanding = getSubCountyWorkspaceLandingPath(user);
  if (subcountyLanding?.startsWith('/subcounty-workspace')) return false;

  const chiefLanding = getChiefWorkspaceLandingPath(user);
  if (chiefLanding?.startsWith('/chief-workspace')) return false;

  const sectorLanding = getSectorMeWorkspaceLandingPath(user);
  if (sectorLanding?.startsWith('/sector-me-workspace')) return false;

  const villageLanding = getVillageWorkspaceLandingPath(user);
  if (villageLanding?.startsWith('/village-workspace')) return false;

  const normalizedRole = normalizeRoleName(user?.roleName || user?.role);
  if (
    normalizedRole.includes('ward_administrator')
    || normalizedRole.includes('ward_admin')
  ) {
    return true;
  }

  if (isAdmin(user)) return false;
  return false;
};

/**
 * Sub-county administrators use the sub-county M&E workspace (monitoring report review).
 */
export const isSubCountyPortalUser = (user) => {
  if (!user || isContractor(user) || isCoFinancePortalUser(user)) return false;

  const subcountyLanding = getSubCountyWorkspaceLandingPath(user);
  if (subcountyLanding?.startsWith('/subcounty-workspace')) return true;

  const chiefLanding = getChiefWorkspaceLandingPath(user);
  if (chiefLanding?.startsWith('/chief-workspace')) return false;

  const sectorLanding = getSectorMeWorkspaceLandingPath(user);
  if (sectorLanding?.startsWith('/sector-me-workspace')) return false;

  const villageLanding = getVillageWorkspaceLandingPath(user);
  if (villageLanding?.startsWith('/village-workspace')) return false;

  const wardLanding = getWardWorkspaceLandingPath(user);
  if (wardLanding?.startsWith('/ward-workspace')) return false;

  const normalizedRole = normalizeRoleName(user?.roleName || user?.role);
  if (
    normalizedRole.includes('sub_county_administrator')
    || normalizedRole.includes('subcounty_administrator')
    || normalizedRole.includes('sub_county_admin')
  ) {
    return true;
  }

  if (isAdmin(user)) return false;
  return false;
};

/**
 * Department chief officers use the chief M&E workspace (final monitoring approval).
 */
export const isChiefPortalUser = (user) => {
  if (!user || isContractor(user) || isCoFinancePortalUser(user)) return false;

  const sectorLanding = getSectorMeWorkspaceLandingPath(user);
  if (sectorLanding?.startsWith('/sector-me-workspace')) return false;

  const chiefLanding = getChiefWorkspaceLandingPath(user);
  if (chiefLanding?.startsWith('/chief-workspace')) return true;

  const villageLanding = getVillageWorkspaceLandingPath(user);
  if (villageLanding?.startsWith('/village-workspace')) return false;

  const wardLanding = getWardWorkspaceLandingPath(user);
  if (wardLanding?.startsWith('/ward-workspace')) return false;

  const subcountyLanding = getSubCountyWorkspaceLandingPath(user);
  if (subcountyLanding?.startsWith('/subcounty-workspace')) return false;

  const normalizedRole = normalizeRoleName(user?.roleName || user?.role);
  if (normalizedRole.includes('department_chief_officer')) return true;
  if (normalizedRole.includes('chief_officer') && !normalizedRole.includes('engineer')) return true;

  if (isAdmin(user)) return false;
  return false;
};

/**
 * Sector M&E champions use the sector workspace (cross-department monitoring oversight).
 */
export const isSectorMePortalUser = (user) => {
  if (!user || isContractor(user) || isCoFinancePortalUser(user)) return false;

  const sectorLanding = getSectorMeWorkspaceLandingPath(user);
  if (sectorLanding?.startsWith('/sector-me-workspace')) return true;

  const chiefLanding = getChiefWorkspaceLandingPath(user);
  if (chiefLanding?.startsWith('/chief-workspace')) return false;

  const villageLanding = getVillageWorkspaceLandingPath(user);
  if (villageLanding?.startsWith('/village-workspace')) return false;

  const wardLanding = getWardWorkspaceLandingPath(user);
  if (wardLanding?.startsWith('/ward-workspace')) return false;

  const subcountyLanding = getSubCountyWorkspaceLandingPath(user);
  if (subcountyLanding?.startsWith('/subcounty-workspace')) return false;

  const normalizedRole = normalizeRoleName(user?.roleName || user?.role);
  if (
    normalizedRole.includes('sector_m&e')
    || normalizedRole.includes('sector_me')
    || normalizedRole.includes('m&e_champion')
    || normalizedRole.includes('sector_champion')
  ) {
    return true;
  }

  if (isAdmin(user)) return false;
  return false;
};

/** Sector champions can read monitoring reports in sector scope (read-only oversight). */
export const canSectorMeViewMonitoringReports = (user) => {
  if (!user) return false;
  if (checkUserPrivilege(user, 'monitoring_report.read')) return true;
  return isSectorMePortalUser(user);
};

/** Ward can revise and forward village monitoring reports (mirrors backend isWardAdminLike). */
export const canWardReviewMonitoringReports = (user) => {
  if (!user) return false;
  if (checkUserPrivilege(user, 'monitoring_report.ward_review')) return true;
  return isWardPortalUser(user);
};

/** Village can create drafts and submit monitoring reports to ward (mirrors backend isVillageAdminLike). */
export const canVillageSubmitMonitoringReports = (user) => {
  if (!user) return false;
  if (
    checkUserPrivilege(user, 'monitoring_report.submit')
    || checkUserPrivilege(user, 'monitoring_report.create')
  ) {
    return true;
  }
  return isVillagePortalUser(user);
};

/** Sub-county can return or forward monitoring reports (mirrors backend isSubCountyAdminLike). */
export const canSubCountyReviewMonitoringReports = (user) => {
  if (!user) return false;
  if (checkUserPrivilege(user, 'monitoring_report.subcounty_review')) return true;
  return isSubCountyPortalUser(user);
};

/** Chief can approve monitoring reports and publish projects (mirrors backend isChiefOfficerLike). */
export const canChiefApproveMonitoringReports = (user) => {
  if (!user) return false;
  if (checkUserPrivilege(user, 'monitoring_report.chief_approve')) return true;
  return isChiefPortalUser(user);
};

/**
 * Resident / site / chief engineers use the engineer workspace sidebar (mirrors contractor portal).
 * UI profile landing path takes precedence so roles with the same profile get the same sidebar
 * even when the role name does not contain "engineer" or the user has broader privileges.
 */
export const isEngineerPortalUser = (user) => {
  if (!user || isContractor(user) || isCoFinancePortalUser(user) || isVillagePortalUser(user) || isWardPortalUser(user) || isSubCountyPortalUser(user) || isChiefPortalUser(user) || isSectorMePortalUser(user)) return false;

  const normalizedRole = normalizeRoleName(user?.roleName || user?.role);
  const landing = getEngineerWorkspaceLandingPath(user);
  if (landing?.startsWith('/engineer-workspace') || normalizedRole.includes('engineer')) {
    return true;
  }

  if (isAdmin(user)) return false;
  return false;
};

export const isMdaIctAdminOrSuperAdmin = (user) => {
  if (!user) return false;
  const normalizedRole = normalizeRoleName(user.roleName || user.role);
  return normalizedRole === 'mda_ict_admin' || normalizedRole === 'super_admin';
};

/**
 * Access rule for Project by Sector dashboard.
 * Intended audience: MDA ICT admins and Super admins.
 */
export const canAccessProjectBySectorDashboard = (user) => {
  if (!user) return false;
  const normalizedRole = normalizeRoleName(user.roleName || user.role);
  return PROJECT_BY_SECTOR_ALLOWED_ROLES.has(normalizedRole);
};

/**
 * Check multiple privileges (user must have ALL privileges)
 * @param {object | null} user - The user object from AuthContext.
 * @param {string[]} privilegeNames - Array of privilege names to check.
 * @returns {boolean} True if the user has all privileges, false otherwise.
 */
export const hasAllPrivileges = (user, privilegeNames) => {
  if (!user || !Array.isArray(privilegeNames)) return false;
  return privilegeNames.every(privilege => checkUserPrivilege(user, privilege));
};

/**
 * Check multiple privileges (user must have ANY of the privileges)
 * @param {object | null} user - The user object from AuthContext.
 * @param {string[]} privilegeNames - Array of privilege names to check.
 * @returns {boolean} True if the user has any of the privileges, false otherwise.
 */
export const hasAnyPrivilege = (user, privilegeNames) => {
  if (!user || !Array.isArray(privilegeNames)) return false;
  return privilegeNames.some(privilege => checkUserPrivilege(user, privilege));
};

/**
 * Get user's role name
 * @param {object | null} user - The user object from AuthContext.
 * @returns {string} User's role name or 'guest' if not authenticated.
 */
export const getUserRole = (user) => {
  return user?.roleName || 'guest';
};

/**
 * Check if user can access a specific route/page
 * @param {object | null} user - The user object from AuthContext.
 * @param {string} routeName - The route name to check access for.
 * @returns {boolean} True if the user can access the route, false otherwise.
 */
export const canAccessRoute = (user, routeName) => {
  const routePrivileges = {
    'admin': ['admin.access'],
    'user-management': ['user.read', 'admin.access'],
    'workflow-management': ['project_workflow.read', 'admin.access'],
    'approval-levels': ['approval_levels.read', 'admin.access'],
    'contractor-management': ['contractor.read', 'admin.access'],
    'hr-module': ['hr.access'],
    'strategic-planning': ['strategic_plan.read'],
    'metadata-management': ['metadata.read', 'admin.access'],
  };

  const requiredPrivileges = routePrivileges[routeName];
  if (!requiredPrivileges) return true; // No specific privileges required

  return hasAnyPrivilege(user, requiredPrivileges) || isAdmin(user);
};

/**
 * Format user display name
 * @param {object | null} user - The user object from AuthContext.
 * @returns {string} Formatted display name.
 */
export const getUserDisplayName = (user) => {
  if (!user) return 'Guest';
  
  const firstName = user.firstName || '';
  const lastName = user.lastName || '';
  const username = user.username || '';
  
  if (firstName && lastName) {
    return `${firstName} ${lastName}`;
  } else if (firstName) {
    return firstName;
  } else if (username) {
    return username;
  } else {
    return 'Unknown User';
  }
};

/**
 * Check if user can perform CRUD operations on a resource
 * @param {object | null} user - The user object from AuthContext.
 * @param {string} resource - The resource name (e.g., 'project', 'user', 'contractor').
 * @param {string} operation - The operation ('create', 'read', 'update', 'delete').
 * @returns {boolean} True if the user can perform the operation, false otherwise.
 */
export const canPerformOperation = (user, resource, operation) => {
  const privilegeName = `${resource}.${operation}`;
  return checkUserPrivilege(user, privilegeName) || isAdmin(user);
};

/**
 * Get user's accessible departments (for data filtering)
 * @param {object | null} user - The user object from AuthContext.
 * @returns {number[]} Array of department IDs the user can access.
 */
export const getUserDepartments = (user) => {
  // This would typically come from the user's assignments
  // For now, return empty array - this should be populated from the database
  return user?.departments || [];
};

/**
 * Get user's accessible wards (for data filtering)
 * @param {object | null} user - The user object from AuthContext.
 * @returns {number[]} Array of ward IDs the user can access.
 */
export const getUserWards = (user) => {
  // This would typically come from the user's assignments
  // For now, return empty array - this should be populated from the database
  return user?.wards || [];
};

/**
 * Get user's accessible projects (for data filtering)
 * @param {object | null} user - The user object from AuthContext.
 * @returns {number[]} Array of project IDs the user can access.
 */
export const getUserProjects = (user) => {
  // This would typically come from the user's assignments
  // For now, return empty array - this should be populated from the database
  return user?.projects || [];
};

export default {
  checkUserPrivilege,
  isAdmin,
  isContractor,
  isMdaIctAdminOrSuperAdmin,
  canAccessProjectBySectorDashboard,
  hasAllPrivileges,
  hasAnyPrivilege,
  getUserRole,
  canAccessRoute,
  getUserDisplayName,
  canPerformOperation,
  getUserDepartments,
  getUserWards,
  getUserProjects,
};
