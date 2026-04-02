import { useState, useEffect, useCallback } from 'react';
import dashboardConfigService from '../services/dashboardConfigService';
import { isAdmin } from '../utils/privilegeUtils.js';

// Hook for database-driven dashboard configuration
export const useDatabaseDashboardConfig = (user) => {
  const [dashboardConfig, setDashboardConfig] = useState({
    loading: true,
    error: null,
    tabs: [],
    components: {},
    permissions: {},
    layout: null
  });

  const [refreshing, setRefreshing] = useState(false);

  // Fetch dashboard configuration for the user
  const fetchDashboardConfig = useCallback(async () => {
    if (!user?.id) return;

    try {
      setDashboardConfig(prev => ({ ...prev, loading: true, error: null }));

      // Fetch user's dashboard layout
      const layout = await dashboardConfigService.getDashboardLayout(user.id);
      
      // Fetch user's permissions
      const permissions = await dashboardConfigService.getUserDashboardPermissions(user.id);

      setDashboardConfig({
        loading: false,
        error: null,
        tabs: layout.tabs || [],
        components: layout.components || {},
        permissions: permissions || {},
        layout: layout
      });
    } catch (error) {
      console.error('Error fetching dashboard config:', error);
      
      // Fallback configuration for admin users when database config is not available
      if (isAdmin(user)) {
        console.log('Applying fallback admin dashboard configuration');
        const fallbackConfig = {
          loading: false,
          error: null,
          tabs: [
            {
              tab_key: 'overview',
              tab_name: 'Overview',
              tab_icon: 'Dashboard',
              tab_order: 1,
              components: [
                { component_key: 'kpi_card', component_name: 'KPI Metrics', component_type: 'card', component_order: 1 },
                { component_key: 'user_stats_card', component_name: 'User Statistics', component_type: 'card', component_order: 2 },
                { component_key: 'project_metrics_card', component_name: 'Project Metrics', component_type: 'card', component_order: 3 },
                { component_key: 'budget_overview_card', component_name: 'Budget Overview', component_type: 'card', component_order: 4 },
                { component_key: 'financial_summary_card', component_name: 'Financial Summary', component_type: 'card', component_order: 5 },
                { component_key: 'quick_actions_widget', component_name: 'Quick Actions', component_type: 'widget', component_order: 6 }
              ]
            },
            {
              tab_key: 'projects',
              tab_name: 'Projects',
              tab_icon: 'Assignment',
              tab_order: 2,
              components: [
                { component_key: 'projects_table', component_name: 'Projects Table', component_type: 'table', component_order: 1 },
                { component_key: 'project_tasks_card', component_name: 'Project Tasks', component_type: 'list', component_order: 2 },
                { component_key: 'project_activity_feed', component_name: 'Project Activity', component_type: 'list', component_order: 3 },
                { component_key: 'project_alerts_card', component_name: 'Project Alerts', component_type: 'list', component_order: 4 }
              ]
            },
            {
              tab_key: 'collaboration',
              tab_name: 'Collaboration',
              tab_icon: 'People',
              tab_order: 3,
              components: [
                { component_key: 'team_directory_card', component_name: 'Team Directory', component_type: 'list', component_order: 1 },
                { component_key: 'team_announcements_card', component_name: 'Team Announcements', component_type: 'list', component_order: 2 },
                { component_key: 'recent_conversations_card', component_name: 'Recent Conversations', component_type: 'list', component_order: 3 },
                { component_key: 'project_activity_feed', component_name: 'Project Activity', component_type: 'list', component_order: 4 },
                { component_key: 'active_users_card', component_name: 'Active Users', component_type: 'card', component_order: 5 }
              ]
            },
            {
              tab_key: 'reports',
              tab_name: 'Reports',
              tab_icon: 'Analytics',
              tab_order: 4,
              components: [
                { component_key: 'charts_dashboard', component_name: 'Analytics Dashboard', component_type: 'chart', component_order: 1 },
                { component_key: 'reports_overview', component_name: 'Reports Overview', component_type: 'card', component_order: 2 }
              ]
            },
            {
              tab_key: 'settings',
              tab_name: 'Settings',
              tab_icon: 'Settings',
              tab_order: 5,
              components: [
                { component_key: 'users_table', component_name: 'Users Table', component_type: 'table', component_order: 1 },
                { component_key: 'team_directory_card', component_name: 'Team Directory', component_type: 'list', component_order: 2 },
                { component_key: 'team_announcements_card', component_name: 'Team Announcements', component_type: 'list', component_order: 3 }
              ]
            }
          ],
          components: {},
          permissions: {
            view_all: true,
            edit_all: true,
            delete_all: true,
            create_all: true
          },
          layout: { fallback: true }
        };
        setDashboardConfig(fallbackConfig);
      } else {
        setDashboardConfig(prev => ({
          ...prev,
          loading: false,
          error: error.message || 'Failed to load dashboard configuration'
        }));
      }
    }
  }, [user?.id]);

  // Refresh dashboard configuration
  const refreshDashboardConfig = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetchDashboardConfig();
    } finally {
      setRefreshing(false);
    }
  }, [fetchDashboardConfig]);

  // Check if user can access a specific tab
  const canAccessTab = useCallback(async (tabKey) => {
    if (!user?.id) return false;
    
    try {
      return await dashboardConfigService.canAccessTab(user.id, tabKey);
    } catch (error) {
      console.error('Error checking tab access:', error);
      return false;
    }
  }, [user?.id]);

  // Check if user can access a specific component
  const canAccessComponent = useCallback(async (componentKey) => {
    if (!user?.id) return false;
    
    try {
      return await dashboardConfigService.canAccessComponent(user.id, componentKey);
    } catch (error) {
      console.error('Error checking component access:', error);
      return false;
    }
  }, [user?.id]);

  // Get components for a specific tab
  const getTabComponents = useCallback((tabKey) => {
    if (!dashboardConfig.components[tabKey]) return [];
    // Extract component keys from the component objects
    return dashboardConfig.components[tabKey].map(comp => comp.component_key) || [];
  }, [dashboardConfig.components]);

  // Get available tabs for the user
  const getAvailableTabs = useCallback(() => {
    return dashboardConfig.tabs || [];
  }, [dashboardConfig.tabs]);

  // Update user dashboard preferences
  const updateUserPreferences = useCallback(async (preferences) => {
    if (!user?.id) return false;
    
    try {
      await dashboardConfigService.updateUserDashboardPreferences(user.id, preferences);
      // Refresh the configuration after updating preferences
      await fetchDashboardConfig();
      return true;
    } catch (error) {
      console.error('Error updating user preferences:', error);
      return false;
    }
  }, [user?.id, fetchDashboardConfig]);

  // Load configuration when user changes
  useEffect(() => {
    if (user?.id) {
      fetchDashboardConfig();
    }
  }, [user?.id, fetchDashboardConfig]);

  return {
    // State
    dashboardConfig,
    refreshing,
    
    // Actions
    refreshDashboardConfig,
    updateUserPreferences,
    
    // Permission checks
    canAccessTab,
    canAccessComponent,
    
    // Data accessors
    getTabComponents,
    getAvailableTabs,
    
    // Computed properties
    isLoading: dashboardConfig.loading,
    hasError: !!dashboardConfig.error,
    error: dashboardConfig.error,
    tabs: dashboardConfig.tabs,
    components: dashboardConfig.components,
    permissions: dashboardConfig.permissions
  };
};

// Hook for managing dashboard components (admin only)
export const useDashboardComponentManagement = () => {
  const [components, setComponents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Fetch all available components
  const fetchComponents = useCallback(async () => {
    setLoading(true);
    try {
      const data = await dashboardConfigService.getAvailableComponents();
      setComponents(data);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Create new component
  const createComponent = useCallback(async (componentData) => {
    try {
      const newComponent = await dashboardConfigService.createDashboardComponent(componentData);
      setComponents(prev => [...prev, newComponent]);
      return newComponent;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }, []);

  // Update component
  const updateComponent = useCallback(async (componentKey, componentData) => {
    try {
      const updatedComponent = await dashboardConfigService.updateDashboardComponent(componentKey, componentData);
      setComponents(prev => prev.map(comp => 
        comp.component_key === componentKey ? updatedComponent : comp
      ));
      return updatedComponent;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }, []);

  // Delete component
  const deleteComponent = useCallback(async (componentKey) => {
    try {
      await dashboardConfigService.deleteDashboardComponent(componentKey);
      setComponents(prev => prev.filter(comp => comp.component_key !== componentKey));
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }, []);

  useEffect(() => {
    fetchComponents();
  }, [fetchComponents]);

  return {
    components,
    loading,
    error,
    fetchComponents,
    createComponent,
    updateComponent,
    deleteComponent
  };
};

// Hook for managing role dashboard configuration (admin only)
export const useRoleDashboardManagement = () => {
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Update role dashboard configuration
  const updateRoleConfig = useCallback(async (roleName, configData) => {
    try {
      const updatedConfig = await dashboardConfigService.updateRoleDashboardConfig(roleName, configData);
      return updatedConfig;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }, []);

  // Update role permissions
  const updateRolePermissions = useCallback(async (roleName, permissions) => {
    try {
      const updatedPermissions = await dashboardConfigService.updateRolePermissions(roleName, permissions);
      return updatedPermissions;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }, []);

  return {
    roles,
    loading,
    error,
    updateRoleConfig,
    updateRolePermissions
  };
};


