// src/hooks/useProjectCategoryData.jsx

import { useState, useEffect, useCallback } from 'react';
import apiService from '../api';
import { useAuth } from '../context/AuthContext.jsx';

/**
 * Custom hook to fetch and manage data for project categories and their milestones.
 * It fetches all categories and then fetches the milestones for each category,
 * combining them into a single, comprehensive state.
 * * @returns {{
 * projectCategories: Array,
 * loading: boolean,
 * setLoading: Function,
 * snackbar: { open: boolean, message: string, severity: string },
 * setSnackbar: Function,
 * fetchCategoriesAndMilestones: Function,
 * }}
 */
const useProjectCategoryData = () => {
  const { hasPrivilege } = useAuth();
  const [projectCategories, setProjectCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });

  const fetchCategoriesAndMilestones = useCallback(async () => {
    setLoading(true);
    try {
      console.log('useProjectCategoryData: Starting fetchCategoriesAndMilestones');
      console.log('useProjectCategoryData: hasPrivilege check:', hasPrivilege('projectcategory.read_all'));
      
      if (!hasPrivilege('projectcategory.read_all')) {
        console.warn('useProjectCategoryData: Permission denied to view project categories');
        setProjectCategories([]);
        setSnackbar({ open: true, message: "Permission denied to view project categories.", severity: 'error' });
        return;
      }
      
      console.log('useProjectCategoryData: Calling getAllCategories...');
      const categoriesData = await apiService.metadata.projectCategories.getAllCategories();
      console.log('useProjectCategoryData: Received categories data:', categoriesData);
      console.log('useProjectCategoryData: Number of categories:', categoriesData?.length || 0);
      
      if (!categoriesData || categoriesData.length === 0) {
        console.warn('useProjectCategoryData: No categories returned from API');
        setProjectCategories([]);
        return;
      }
      
      console.log('useProjectCategoryData: Fetching milestones and BQ templates for each category...');
      const categoriesWithMilestones = await Promise.all(
        categoriesData.map(async (category) => {
          console.log(`useProjectCategoryData: Fetching milestones for category ${category.categoryId} (${category.categoryName})`);
          try {
            const [milestonesData, bqTemplatesData] = await Promise.all([
              apiService.metadata.projectCategories.getMilestonesByCategory(category.categoryId),
              apiService.metadata.projectCategories.getBqTemplatesByCategory(category.categoryId).catch(() => []),
            ]);
            console.log(`useProjectCategoryData: Category ${category.categoryId} has ${milestonesData?.length || 0} milestones`);
            return { ...category, milestones: milestonesData || [], bqTemplates: bqTemplatesData || [] };
          } catch (milestoneError) {
            console.error(`useProjectCategoryData: Error fetching milestones for category ${category.categoryId}:`, milestoneError);
            return { ...category, milestones: [], bqTemplates: [] };
          }
        })
      );
      
      console.log('useProjectCategoryData: Final categories with milestones:', categoriesWithMilestones);
      setProjectCategories(categoriesWithMilestones);
    } catch (error) {
      console.error('useProjectCategoryData: Error fetching project category data:', error);
      console.error('useProjectCategoryData: Error details:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status
      });
      setSnackbar({ open: true, message: 'Failed to fetch categories and milestones.', severity: 'error' });
      setProjectCategories([]);
    } finally {
      setLoading(false);
    }
  }, [hasPrivilege]);

  useEffect(() => {
    fetchCategoriesAndMilestones();
  }, [fetchCategoriesAndMilestones]);

  return {
    projectCategories,
    loading,
    setLoading,
    snackbar,
    setSnackbar,
    fetchCategoriesAndMilestones,
  };
};

export default useProjectCategoryData;
