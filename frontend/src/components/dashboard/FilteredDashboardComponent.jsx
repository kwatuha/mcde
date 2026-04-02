import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import dataAccessService from '../../services/dataAccessService';
import { isAdmin, normalizeRoleName } from '../../utils/privilegeUtils.js';

/**
 * Enhanced Dashboard Component with Dynamic Data Filtering
 * This component automatically applies user-specific data filters
 */
const FilteredDashboardComponent = ({ 
  componentKey, 
  children, 
  dataFetcher, 
  filterConfig = {},
  ...props 
}) => {
  const { user } = useAuth();
  const [filteredData, setFilteredData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Get user's data access configuration
  const getUserDataAccess = useCallback(async () => {
    try {
      const accessConfig = await dataAccessService.getUserDataAccess(user.id, componentKey);
      return accessConfig;
    } catch (err) {
      console.error('Error fetching user data access:', err);
      return null;
    }
  }, [user.id, componentKey]);

  // Apply dynamic filters based on user configuration
  const applyUserFilters = useCallback(async (rawData, accessConfig) => {
    if (!accessConfig || !rawData) return rawData;

    let filtered = rawData;

    // Apply department filter
    if (accessConfig.departmentFilter && accessConfig.userDepartments?.length > 0) {
      filtered = filtered.filter(item => 
        accessConfig.userDepartments.includes(item.departmentId) ||
        accessConfig.userDepartments.includes(item.department_id)
      );
    }

    // Apply ward filter
    if (accessConfig.wardFilter && accessConfig.userWards?.length > 0) {
      filtered = filtered.filter(item => 
        accessConfig.userWards.includes(item.wardId) ||
        accessConfig.userWards.includes(item.ward_id)
      );
    }

    // Apply project filter
    if (accessConfig.projectFilter && accessConfig.userProjects?.length > 0) {
      filtered = filtered.filter(item => 
        accessConfig.userProjects.includes(item.projectId) ||
        accessConfig.userProjects.includes(item.project_id) ||
        accessConfig.userProjects.includes(item.id)
      );
    }

    // Apply budget filter
    if (accessConfig.budgetFilter && accessConfig.budgetRange) {
      const { min, max } = accessConfig.budgetRange;
      filtered = filtered.filter(item => {
        const budget = item.budget || item.allocatedBudget || item.contractSum || 0;
        return budget >= min && budget <= max;
      });
    }

    // Apply status filter
    if (accessConfig.statusFilter && accessConfig.allowedStatuses?.length > 0) {
      filtered = filtered.filter(item => 
        accessConfig.allowedStatuses.includes(item.status) ||
        accessConfig.allowedStatuses.includes(item.projectStatus)
      );
    }

    // Apply custom filters
    if (accessConfig.customFilters) {
      for (const customFilter of accessConfig.customFilters) {
        filtered = applyCustomFilter(filtered, customFilter);
      }
    }

    return filtered;
  }, [user]); // Add user as dependency since it's used in applyCustomFilter

  // Apply custom filter logic
  const applyCustomFilter = (data, filter) => {
    switch (filter.type) {
      case 'date_range':
        return data.filter(item => {
          const itemDate = new Date(item.createdAt || item.startDate || item.date);
          const startDate = new Date(filter.startDate);
          const endDate = new Date(filter.endDate);
          return itemDate >= startDate && itemDate <= endDate;
        });
      
      case 'progress_threshold':
        return data.filter(item => {
          const progress = item.progress || item.completionPercentage || 0;
          return progress >= filter.minProgress && progress <= filter.maxProgress;
        });
      
      case 'user_role_specific':
        // Apply role-specific filtering logic
        return data.filter(item => {
          const roleName = normalizeRoleName(user.roleName || user.role);
          if (isAdmin(user)) return true;
          if (roleName === 'manager') return item.managerId === user.id;
          if (roleName === 'contractor') return item.contractorId === user.id;
          return false;
        });
      
      default:
        return data;
    }
  };

  // Fetch and filter data
  const fetchFilteredData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Get user's data access configuration
      const accessConfig = await getUserDataAccess();
      
      // Fetch raw data using provided data fetcher
      const rawData = await dataFetcher(user, accessConfig);
      
      // Apply user-specific filters inline to avoid dependency issues
      let filtered = rawData;
      if (accessConfig && rawData) {
        // Apply department filter
        if (accessConfig.departmentFilter && accessConfig.userDepartments?.length > 0) {
          filtered = filtered.filter(item => 
            accessConfig.userDepartments.includes(item.departmentId) ||
            accessConfig.userDepartments.includes(item.department_id)
          );
        }

        // Apply ward filter
        if (accessConfig.wardFilter && accessConfig.userWards?.length > 0) {
          filtered = filtered.filter(item => 
            accessConfig.userWards.includes(item.wardId) ||
            accessConfig.userWards.includes(item.ward_id)
          );
        }

        // Apply project filter
        if (accessConfig.projectFilter && accessConfig.userProjects?.length > 0) {
          filtered = filtered.filter(item => 
            accessConfig.userProjects.includes(item.projectId) ||
            accessConfig.userProjects.includes(item.project_id) ||
            accessConfig.userProjects.includes(item.id)
          );
        }

        // Apply budget filter
        if (accessConfig.budgetFilter && accessConfig.budgetRange) {
          const { min, max } = accessConfig.budgetRange;
          filtered = filtered.filter(item => {
            const budget = item.budget || item.allocatedBudget || item.contractSum || 0;
            return budget >= min && budget <= max;
          });
        }

        // Apply status filter
        if (accessConfig.statusFilter && accessConfig.allowedStatuses?.length > 0) {
          filtered = filtered.filter(item => 
            accessConfig.allowedStatuses.includes(item.status) ||
            accessConfig.allowedStatuses.includes(item.projectStatus)
          );
        }

        // Apply custom filters
        if (accessConfig.customFilters) {
          for (const customFilter of accessConfig.customFilters) {
            filtered = applyCustomFilter(filtered, customFilter);
          }
        }
      }
      
      setFilteredData(filtered);
    } catch (err) {
      console.error('Error fetching filtered data:', err);
      setError(err.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [user, dataFetcher, getUserDataAccess]);

  useEffect(() => {
    if (user?.id) {
      fetchFilteredData();
    }
  }, [user?.id, fetchFilteredData]);

  // Render children with filtered data
  return React.cloneElement(children, {
    data: filteredData,
    loading,
    error,
    user,
    onRefresh: fetchFilteredData,
    ...props
  });
};

export default FilteredDashboardComponent;
