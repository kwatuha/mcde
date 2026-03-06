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

  getUserById: async (userId) => {
    try {
      const response = await axiosInstance.get(`/users/users/${userId}`);
      return response.data;
    } catch (error) {
      console.error(`Error fetching user with ID ${userId}:`, error);
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
      console.error('Error response:', error.response?.data);
      throw error;
    }
  },

  updateRole: async (roleId, roleData) => {
    try {
      const response = await axiosInstance.put(`/users/roles/${roleId}`, roleData);
      return response.data;
    } catch (error) {
      console.error(`Error updating role with ID ${roleId}:`, error);
      throw error;
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
      const response = await axiosInstance.post('/users/privileges', privilegeData);
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
  getRolePrivileges: async () => {
    try {
      const response = await axiosInstance.get('/users/role_privileges');
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
      const response = await axiosInstance.post('/users/role_privileges', { role_id: roleId, privilege_id: privilegeId });
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
};

export default userService;
