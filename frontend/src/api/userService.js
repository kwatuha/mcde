// src/api/userService.js
import axiosInstance from './axiosInstance';

/**
 * @file API service for User & Access Management related calls.
 * @description Handles CRUD operations for users, roles, privileges, staff,
 * project roles, project staff assignments, and website public profiles.
 */

const userService = {
  // --- User Management API Calls (kemri_users) ---
  getUsers: async () => {
    try {
      const response = await axiosInstance.get('/users/users');
      return response.data;
    } catch (error) {
      console.error('Error fetching users:', error);
      throw error;
    }
  },

  /** Super Admin only: all active (non-voided) users for Excel export (no passwords). */
  getUsersForExcelExport: async () => {
    try {
      const response = await axiosInstance.get('/users/users/export/excel');
      return response.data;
    } catch (error) {
      console.error('Error fetching users for Excel export:', error);
      throw error;
    }
  },

  getUserById: async (userId) => {
    try {
      const response = await axiosInstance.get(`/users/users/${userId}`);
      return response.data;
    } catch (error) {
      console.error(`Error fetching user with ID ${userId}:`, error);
      throw error;
    }
  },

  checkUsernameAvailability: async (username, excludeUserId = null) => {
    try {
      const response = await axiosInstance.get('/users/users/check-username', {
        params: {
          username,
          ...(excludeUserId != null ? { excludeUserId } : {}),
        },
      });
      return response.data;
    } catch (error) {
      console.error('Error checking username availability:', error);
      throw error;
    }
  },

  createUser: async (userData) => {
    try {
      const response = await axiosInstance.post('/users/users', userData);
      return response.data;
    } catch (error) {
      console.error('Error creating user:', error);
      throw error;
    }
  },

  resendUserCredentials: async (userId) => {
    try {
      const response = await axiosInstance.post(`/users/users/${userId}/resend-credentials`);
      return response.data;
    } catch (error) {
      console.error(`Error resending credentials for user ID ${userId}:`, error);
      throw error;
    }
  },

  updateUser: async (userId, userData) => {
    try {
      const response = await axiosInstance.put(`/users/users/${userId}`, userData);
      return response.data;
    } catch (error) {
      console.error(`Error updating user with ID ${userId}:`, error);
      throw error;
    }
  },

  deleteUser: async (userId) => {
    try {
      const response = await axiosInstance.delete(`/users/users/${userId}`);
      return response.data;
    } catch (error) {
      console.error(`Error deleting user with ID ${userId}:`, error);
      throw error;
    }
  },

  getVoidedUsers: async () => {
    try {
      const response = await axiosInstance.get('/users/users/voided/list');
      return response.data;
    } catch (error) {
      console.error('Error fetching voided users:', error);
      throw error;
    }
  },

  restoreUser: async (userId) => {
    try {
      const response = await axiosInstance.put(`/users/users/${userId}/restore`);
      return response.data;
    } catch (error) {
      console.error(`Error restoring user with ID ${userId}:`, error);
      throw error;
    }
  },

  // --- Role Management API Calls (kemri_roles) ---
  getRoles: async () => {
    try {
      const response = await axiosInstance.get('/users/roles');
      return response.data;
    } catch (error) {
      console.error('Error fetching roles:', error);
      throw error;
    }
  },

  getRoleById: async (roleId) => {
    try {
      const response = await axiosInstance.get(`/users/roles/${roleId}`);
      return response.data;
    } catch (error) {
      console.error(`Error fetching role with ID ${roleId}:`, error);
      throw error;
    }
  },

  createRole: async (roleData) => {
    try {
      console.log('Creating role with data:', roleData);
      const response = await axiosInstance.post('/users/roles', roleData);
      console.log('Create role response:', response.data);
      if (!response.data) {
        throw new Error('No data returned from role creation');
      }
      return response.data;
    } catch (error) {
      console.error('Error creating role:', error);
      // The axios interceptor rejects with error.response.data directly, so error might be the data object
      // Check if error is a plain object with error/message properties (from interceptor)
      if (error && typeof error === 'object' && !error.response && (error.error || error.message)) {
        const errorMessage = error.error || error.message || 'Failed to create role';
        const customError = new Error(errorMessage);
        customError.originalError = error;
        // Preserve error property for easier access
        customError.error = error.error;
        throw customError;
      }
      // Standard axios error structure
      if (error.response) {
        const errorData = error.response.data;
        const errorMessage = errorData?.error || errorData?.message || error.message || 'Failed to create role';
        const customError = new Error(errorMessage);
        customError.response = error.response;
        customError.status = error.response.status;
        customError.error = errorData?.error;
        throw customError;
      } else if (error.request) {
        throw new Error('Network error: No response from server');
      } else {
        throw error;
      }
    }
  },

  updateRole: async (roleId, roleData) => {
    try {
      const response = await axiosInstance.put(`/users/roles/${roleId}`, roleData);
      return response.data;
    } catch (error) {
      // The axios interceptor rejects with error.response.data directly, so error might be the data object
      // Check if error is a plain object with error/message properties (from interceptor)
      if (error && typeof error === 'object' && !error.response && (error.error || error.message)) {
        const errorMessage = error.error || error.message || 'Failed to update role';
        const customError = new Error(errorMessage);
        customError.originalError = error;
        throw customError;
      }
      // Standard axios error structure
      if (error.response) {
        const errorData = error.response.data;
        const errorMessage = errorData?.error || errorData?.message || error.message || 'Failed to update role';
        const customError = new Error(errorMessage);
        customError.response = error.response;
        customError.status = error.response.status;
        throw customError;
      } else if (error.request) {
        throw new Error('Network error: No response from server');
      } else {
        throw error;
      }
    }
  },

  deleteRole: async (roleId) => {
    try {
      const response = await axiosInstance.delete(`/users/roles/${roleId}`);
      return response.data;
    } catch (error) {
      console.error(`Error deleting role with ID ${roleId}:`, error);
      throw error;
    }
  },

  // --- Privilege Management API Calls (kemri_privileges) ---
  getPrivileges: async () => {
    try {
      const response = await axiosInstance.get('/users/privileges');
      return response.data;
    } catch (error) {
      console.error('Error fetching privileges:', error);
      throw error;
    }
  },

  getPrivilegeById: async (privilegeId) => {
    try {
      const response = await axiosInstance.get(`/users/privileges/${privilegeId}`);
      return response.data;
    } catch (error) {
      console.error(`Error fetching privilege with ID ${privilegeId}:`, error);
      throw error;
    }
  },

  createPrivilege: async (privilegeData) => {
    try {
      const payload = {
        privilegeName: privilegeData?.privilegeName != null ? String(privilegeData.privilegeName).trim() : '',
        description:
          privilegeData?.description != null && String(privilegeData.description).trim() !== ''
            ? String(privilegeData.description).trim()
            : '',
      };
      const response = await axiosInstance.post('/users/privileges', payload, {
        headers: { 'Content-Type': 'application/json' },
      });
      if (!response.data) {
        throw new Error('No data returned from privilege creation');
      }
      return response.data;
    } catch (error) {
      // The axios interceptor rejects with error.response.data directly, so error might be the data object
      // Check if error is a plain object with error/message properties (from interceptor)
      if (error && typeof error === 'object' && !error.response && (error.error || error.message)) {
        const errorMessage = error.error || error.message || 'Failed to create privilege';
        const customError = new Error(errorMessage);
        customError.originalError = error;
        throw customError;
      }
      // Standard axios error structure
      if (error.response) {
        const errorData = error.response.data;
        const errorMessage = errorData?.error || errorData?.message || error.message || 'Failed to create privilege';
        const customError = new Error(errorMessage);
        customError.response = error.response;
        customError.status = error.response.status;
        throw customError;
      } else if (error.request) {
        throw new Error('Network error: No response from server');
      } else {
        throw error;
      }
    }
  },

  updatePrivilege: async (privilegeId, privilegeData) => {
    try {
      const response = await axiosInstance.put(`/users/privileges/${privilegeId}`, privilegeData);
      return response.data;
    } catch (error) {
      console.error(`Error updating privilege with ID ${privilegeId}:`, error);
      throw error;
    }
  },

  deletePrivilege: async (privilegeId) => {
    try {
      const response = await axiosInstance.delete(`/users/privileges/${privilegeId}`);
      return response.data;
    } catch (error) {
      console.error(`Error deleting privilege with ID ${privilegeId}:`, error);
      throw error;
    }
  },

  // --- Role Privilege Management API Calls (kemri_role_privileges) ---
  /** @param {string|number} [roleId] If set, only links for that role are returned (required for edit-role UI). */
  getRolePrivileges: async (roleId) => {
    try {
      const params = {};
      if (roleId != null && roleId !== '') {
        params.roleId = roleId;
      }
      const response = await axiosInstance.get('/users/role_privileges', { params });
      return response.data;
    } catch (error) {
      console.error('Error fetching role privileges:', error);
      throw error;
    }
  },

  getRolePrivilegeByIds: async (roleId, privilegeId) => {
    try {
      const response = await axiosInstance.get(`/users/role_privileges/${roleId}/${privilegeId}`);
      return response.data;
    } catch (error) {
      console.error(`Error fetching role privilege for Role ID ${roleId} and Privilege ID ${privilegeId}:`, error);
      throw error;
    }
  },

  createRolePrivilege: async (roleId, privilegeId) => {
    try {
      const response = await axiosInstance.post('/users/role_privileges', {
        roleId: Number(roleId),
        privilegeId: Number(privilegeId),
      });
      return response.data;
    } catch (error) {
      console.error('Error creating role privilege:', error);
      throw error;
    }
  },

  deleteRolePrivilege: async (roleId, privilegeId) => {
    try {
      const response = await axiosInstance.delete(`/users/role_privileges/${roleId}/${privilegeId}`);
      return response.data;
    } catch (error) {
      console.error(`Error deleting role privilege for Role ID ${roleId} and Privilege ID ${privilegeId}:`, error);
      throw error;
    }
  },

  // --- Staff Management API Calls (kemri_staff) ---
  getStaff: async () => {
    try {
      const response = await axiosInstance.get('/users/staff');
      return response.data;
    } catch (error) {
      console.error('Error fetching staff list:', error);
      throw error;
    }
  },

  getStaffById: async (staffId) => {
    try {
      const response = await axiosInstance.get(`/users/staff/${staffId}`);
      return response.data;
    } catch (error) {
      console.error(`Error fetching staff with ID ${staffId}:`, error);
      throw error;
    }
  },

  createStaff: async (staffData) => {
    try {
      const response = await axiosInstance.post('/users/staff', staffData);
      return response.data;
    } catch (error) {
      console.error('Error creating staff:', error);
      throw error;
    }
  },

  updateStaff: async (staffId, staffData) => {
    try {
      const response = await axiosInstance.put(`/users/staff/${staffId}`, staffData);
      return response.data;
    } catch (error) {
      console.error(`Error updating staff with ID ${staffId}:`, error);
      throw error;
    }
  },

  deleteStaff: async (staffId) => {
    try {
      const response = await axiosInstance.delete(`/users/staff/${staffId}`);
      return response.data;
    } catch (error) {
      console.error(`Error deleting staff with ID ${staffId}:`, error);
      throw error;
    }
  },

  // --- Project Role Management API Calls (kemri_project_roles) ---
  getProjectRoles: async () => {
    try {
      const response = await axiosInstance.get('/users/project_roles');
      return response.data;
    } catch (error) {
      console.error('Error fetching project roles:', error);
      throw error;
    }
  },

  getProjectRoleById: async (roleId) => {
    try {
      const response = await axiosInstance.get(`/users/project_roles/${roleId}`);
      return response.data;
    } catch (error) {
      console.error(`Error fetching project role with ID ${roleId}:`, error);
      throw error;
    }
  },

  createProjectRole: async (roleData) => {
    try {
      const response = await axiosInstance.post('/users/project_roles', roleData);
      return response.data;
    } catch (error) {
      console.error('Error creating project role:', error);
      throw error;
    }
  },

  updateProjectRole: async (roleId, roleData) => {
    try {
      const response = await axiosInstance.put(`/users/project_roles/${roleId}`, roleData);
      return response.data;
    } catch (error) {
      console.error(`Error updating project role with ID ${roleId}:`, error);
      throw error;
    }
  },

  deleteProjectRole: async (roleId) => {
    try {
      const response = await axiosInstance.delete(`/users/project_roles/${roleId}`);
      return response.data;
    } catch (error) {
      console.error(`Error deleting project role with ID ${roleId}:`, error);
      throw error;
    }
  },

  // --- Project Staff Assignment API Calls (kemri_project_staff_assignments) ---
  getProjectStaffAssignments: async () => {
    try {
      const response = await axiosInstance.get('/users/project_staff_assignments');
      return response.data;
    } catch (error) {
      console.error('Error fetching project staff assignments:', error);
      throw error;
    }
  },

  getProjectStaffAssignmentById: async (assignmentId) => {
    try {
      const response = await axiosInstance.get(`/users/project_staff_assignments/${assignmentId}`);
      return response.data;
    } catch (error) {
      console.error(`Error fetching project staff assignment with ID ${assignmentId}:`, error);
      throw error;
    }
  },

  createProjectStaffAssignment: async (assignmentData) => {
    try {
      const response = await axiosInstance.post('/users/project_staff_assignments', assignmentData);
      return response.data;
    } catch (error) {
      console.error('Error creating project staff assignment:', error);
      throw error;
    }
  },

  updateProjectStaffAssignment: async (assignmentId, assignmentData) => {
    try {
      const response = await axiosInstance.put(`/users/project_staff_assignments/${assignmentId}`, assignmentData);
      return response.data;
    } catch (error) {
      console.error(`Error updating project staff assignment with ID ${assignmentId}:`, error);
      throw error;
    }
  },

  deleteProjectStaffAssignment: async (assignmentId) => {
    try {
      const response = await axiosInstance.delete(`/users/project_staff_assignments/${assignmentId}`);
      return response.data;
    } catch (error) {
      console.error(`Error deleting project staff assignment with ID ${assignmentId}:`, error);
      throw error;
    }
  },

  // --- Website Public Profiles API Calls (kemri_websitepublicprofiles) ---
  getWebsitePublicProfiles: async () => {
    try {
      const response = await axiosInstance.get('/users/website_public_profiles');
      return response.data;
    } catch (error) {
      console.error('Error fetching website public profiles:', error);
      throw error;
    }
  },

  getWebsitePublicProfileById: async (profileId) => {
    try {
      const response = await axiosInstance.get(`/users/website_public_profiles/${profileId}`);
      return response.data;
    } catch (error) {
      console.error(`Error fetching website public profile with ID ${profileId}:`, error);
      throw error;
    }
  },

  createWebsitePublicProfile: async (profileData) => {
    try {
      const response = await axiosInstance.post('/users/website_public_profiles', profileData);
      return response.data;
    } catch (error) {
      console.error('Error creating website public profile:', error);
      throw error;
    }
  },

  updateWebsitePublicProfile: async (profileId, profileData) => {
    try {
      const response = await axiosInstance.put(`/users/website_public_profiles/${profileId}`, profileData);
      return response.data;
    } catch (error) {
      console.error(`Error updating website public profile with ID ${profileId}:`, error);
      throw error;
    }
  },

  deleteWebsitePublicProfile: async (profileId) => {
    try {
      const response = await axiosInstance.delete(`/users/website_public_profiles/${profileId}`);
      return response.data;
    } catch (error) {
      console.error(`Error deleting website public profile with ID ${profileId}:`, error);
      throw error;
    }
  },

  // --- User Approval Management API Calls ---
  getPendingUsers: async () => {
    try {
      const response = await axiosInstance.get('/users/pending');
      return response.data;
    } catch (error) {
      console.error('Error fetching pending users:', error);
      throw error;
    }
  },

  getApprovedUsersSummary: async (params = {}) => {
    try {
      const queryParams = new URLSearchParams();
      if (params.approvedBy) queryParams.append('approvedBy', params.approvedBy);
      if (params.startDate) queryParams.append('startDate', params.startDate);
      if (params.endDate) queryParams.append('endDate', params.endDate);
      
      const queryString = queryParams.toString();
      const url = `/users/approved/summary${queryString ? `?${queryString}` : ''}`;
      const response = await axiosInstance.get(url);
      return response.data;
    } catch (error) {
      console.error('Error fetching approved users summary:', error);
      throw error;
    }
  },

  /** Super Admin only: preview org integrity issues (users, scopes, projects vs ministries/departments). */
  getOrganizationIntegrityPreview: async (limit = 50) => {
    try {
      const response = await axiosInstance.get('/users/organization-integrity/preview', {
        params: { limit },
      });
      return response.data;
    } catch (error) {
      console.error('Error fetching organization integrity preview:', error);
      throw error;
    }
  },

  /** Super Admin only: dry-run or apply ministry/state_department reconciliation. */
  postOrganizationIntegrityReconcile: async ({ dryRun = true, limit = 50 } = {}) => {
    try {
      const response = await axiosInstance.post('/users/organization-integrity/reconcile', {
        dryRun,
        limit,
      });
      return response.data;
    } catch (error) {
      console.error('Error running organization integrity reconcile:', error);
      throw error;
    }
  },

  /** Super Admin: distinct misaligned ministry / state department strings with counts. */
  getOrganizationIntegrityMisalignedDistinct: async () => {
    try {
      const response = await axiosInstance.get('/users/organization-integrity/misaligned-distinct');
      return response.data;
    } catch (error) {
      console.error('Error loading organization integrity misaligned distinct:', error);
      throw error;
    }
  },

  /** Super Admin: apply manual ministry / state department string replacements. */
  postOrganizationIntegrityManualMap: async (body) => {
    try {
      const response = await axiosInstance.post('/users/organization-integrity/manual-map', body);
      return response.data;
    } catch (error) {
      console.error('Error applying organization integrity manual map:', error);
      throw error;
    }
  },
};

export default userService;
