// Dashboard Configuration Service
// This service handles database-driven dashboard configuration

import axiosInstance from '../api/axiosInstance';

class DashboardConfigService {
  // Get dashboard configuration for a specific role
  async getRoleDashboardConfig(roleName) {
    try {
      console.log(`Making request to: /dashboard/config/role/${roleName}`);
      const response = await axiosInstance.get(`/dashboard/config/role/${roleName}`);
      console.log(`Response received:`, response.data);
      return response.data;
    } catch (error) {
      console.error('Error fetching role dashboard config:', error);
      console.error('Error details:', error.response?.data || error.message);
      throw error;
    }
  }

  // Get dashboard configuration for a specific user (includes role + user preferences)
  async getUserDashboardConfig(userId) {
    try {
      const response = await axiosInstance.get(`/dashboard/config/user/${userId}`);
      return response.data;
    } catch (error) {
      console.error('Error fetching user dashboard config:', error);
      throw error;
    }
  }

  // Get all available dashboard components
  async getAvailableComponents() {
    try {
      const response = await axiosInstance.get('/dashboard/admin/components');
      return response.data;
    } catch (error) {
      console.error('Error fetching available components:', error);
      // Return empty array if API fails
      return [];
    }
  }

  // Get all available dashboard tabs
  async getAvailableTabs() {
    try {
      const response = await axiosInstance.get('/dashboard/admin/tabs');
      return response.data;
    } catch (error) {
      console.error('Error fetching available tabs:', error);
      // Return empty array if API fails
      return [];
    }
  }

  // Get all roles from roles table
  async getRoles() {
    try {
      const response = await axiosInstance.get('/users/roles');
      return response.data;
    } catch (error) {
      console.error('Error fetching roles from database:', error);
      // Return empty array if API fails
      return [];
    }
  }

  // Get all available permissions
  async getAvailablePermissions() {
    try {
      const response = await axiosInstance.get('/dashboard/admin/permissions');
      return response.data;
    } catch (error) {
      console.error('Error fetching available permissions:', error);
      // Return empty array if API fails
      return [];
    }
  }

  // Create a new component
  async createComponent(componentData) {
    try {
      const response = await axiosInstance.post('/dashboard/admin/components', componentData);
      return response.data;
    } catch (error) {
      console.error('Error creating component:', error);
      throw error;
    }
  }

  // Create a new tab
  async createTab(tabData) {
    try {
      const response = await axiosInstance.post('/dashboard/admin/tabs', tabData);
      return response.data;
    } catch (error) {
      console.error('Error creating tab:', error);
      throw error;
    }
  }

  // Update role dashboard configuration
  async updateRoleDashboardConfig(roleName, configData) {
    try {
      const response = await axiosInstance.put(`/dashboard/admin/roles/${roleName}`, configData);
      return response.data;
    } catch (error) {
      console.error('Error updating role dashboard config:', error);
      throw error;
    }
  }

  // Get user's dashboard permissions
  async getUserDashboardPermissions(userId) {
    try {
      const response = await axiosInstance.get(`/dashboard/permissions/user/${userId}`);
      return response.data;
    } catch (error) {
      console.error('Error fetching user permissions:', error);
      throw error;
    }
  }

  // Update user dashboard preferences
  async updateUserDashboardPreferences(userId, preferences) {
    try {
      const response = await axiosInstance.put(`/dashboard/preferences/user/${userId}`, preferences);
      return response.data;
    } catch (error) {
      console.error('Error updating user preferences:', error);
      throw error;
    }
  }

  // Check if user can access a specific component
  async canAccessComponent(userId, componentKey) {
    try {
      const response = await axiosInstance.get(`/dashboard/permissions/component/${userId}/${componentKey}`);
      return response.data.canAccess;
    } catch (error) {
      console.error('Error checking component access:', error);
      return false;
    }
  }

  // Check if user can access a specific tab
  async canAccessTab(userId, tabKey) {
    try {
      const response = await axiosInstance.get(`/dashboard/permissions/tab/${userId}/${tabKey}`);
      return response.data.canAccess;
    } catch (error) {
      console.error('Error checking tab access:', error);
      return false;
    }
  }

  // Get dashboard layout for a user (formatted for frontend)
  async getDashboardLayout(userId) {
    try {
      const response = await axiosInstance.get(`/dashboard/layout/${userId}`);
      return response.data;
    } catch (error) {
      console.error('Error fetching dashboard layout:', error);
      throw error;
    }
  }

  // Admin functions for managing dashboard configuration
  async createDashboardComponent(componentData) {
    try {
      const response = await axiosInstance.post('/dashboard/admin/components', componentData);
      return response.data;
    } catch (error) {
      console.error('Error creating dashboard component:', error);
      throw error;
    }
  }

  async updateDashboardComponent(componentKey, componentData) {
    try {
      const response = await axiosInstance.put(`/dashboard/admin/components/${componentKey}`, componentData);
      return response.data;
    } catch (error) {
      console.error('Error updating dashboard component:', error);
      throw error;
    }
  }

  async deleteDashboardComponent(componentKey) {
    try {
      const response = await axiosInstance.delete(`/dashboard/admin/components/${componentKey}`);
      return response.data;
    } catch (error) {
      console.error('Error deleting dashboard component:', error);
      throw error;
    }
  }

  async updateRoleDashboardConfig(roleName, configData) {
    try {
      const response = await axiosInstance.put(`/dashboard/admin/roles/${roleName}`, configData);
      return response.data;
    } catch (error) {
      console.error('Error updating role dashboard config:', error);
      throw error;
    }
  }

  async updateRolePermissions(roleName, permissions) {
    try {
      const response = await axiosInstance.put(`/dashboard/admin/roles/${roleName}/permissions`, permissions);
      return response.data;
    } catch (error) {
      console.error('Error updating role permissions:', error);
      throw error;
    }
  }
}

export default new DashboardConfigService();
