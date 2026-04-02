/**
 * Privilege Utilities
 * Centralized privilege checking functions for the application
 */

const ADMIN_ROLE_IDS = new Set([1]);
const ADMIN_ROLE_NAMES = new Set(['admin', 'mda_ict_admin', 'super_admin', 'administrator', 'ict_admin']);

export const normalizeRoleName = (roleName) =>
  String(roleName || '').trim().toLowerCase().replace(/[\s-]+/g, '_');

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
