import { useState, useEffect, useCallback } from 'react';
import apiService from '../api';
import { canViewProjectsWithBackendScope } from '../utils/privilegeUtils.js';

const useProjectData = (user, authLoading, filterState, options = {}) => {
  const { fetchMetadata = true } = options;
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });

  const [allMetadata, setAllMetadata] = useState({
    departments: [],
    sections: [],
    financialYears: [],
    sectors: [],
    programs: [],
    subPrograms: [],
    counties: [],
    subcounties: [],
    wards: [],
    projectCategories: [],
  });

  const fetchProjects = useCallback(async (loadAll = false) => {
    setLoading(true);
    setError(null);
    
    // Debug: Log user and privileges for troubleshooting
    if (!user) {
      console.warn('useProjectData: No user object available');
      setProjects([]);
      setLoading(false);
      setError('You must be signed in to view projects.');
      return;
    }

    if (!canViewProjectsWithBackendScope(user)) {
      setProjects([]);
      setLoading(false);
      setError('You do not have permission to view projects. Please log out and sign in again if your access was updated.');
      return;
    }

    const filterParams = Object.fromEntries(
      Object.entries(filterState).filter(([key, value]) => value !== '' && value !== null)
    );

    // Add limit for initial load (default 100 projects for better performance)
    // If loadAll is true, don't add limit to fetch all projects
    if (!loadAll) {
      filterParams.limit = filterParams.limit || 100;
    }

    try {
      const data = await apiService.projects.getProjects(filterParams);
      setProjects(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Error fetching projects:", err);
      setProjects([]);
      setError(err.response?.data?.message || err.message || "Failed to load projects. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [user, filterState]);

  const fetchAllMetadata = useCallback(async () => {
    if (authLoading || !user) return;

    try {
      /* SCOPE_DOWN: programs/subprograms tables removed. Use empty arrays so page still loads. Re-enable when restoring. */
      const [
        departments, financialYears, sectors, programs, counties, projectCategories
      ] = await Promise.all([
        apiService.metadata.departments.getAllDepartments(),
        apiService.metadata.financialYears.getAllFinancialYears(),
        apiService.sectors.getAllSectors().catch(() => []),
        apiService.metadata.programs.getAllPrograms().catch(() => []),
        apiService.metadata.counties.getAllCounties(),
        apiService.metadata.projectCategories.getAllCategories().catch(err => {
          console.error('Error fetching project categories:', err);
          return [];
        }),
      ]);

      const newMetadata = { departments, financialYears, sectors, programs, counties, projectCategories };

      if (filterState.departmentId) {
        newMetadata.sections = await apiService.metadata.departments.getSectionsByDepartment(filterState.departmentId);
      }
      if (filterState.programId) {
        newMetadata.subPrograms = await apiService.metadata.programs.getSubProgramsByProgram(filterState.programId).catch(() => []);
      }
      
      setAllMetadata(newMetadata);

    } catch (err) {
      console.error("Error fetching metadata:", err);
      setSnackbar({ open: true, message: 'Failed to load some dropdown options.', severity: 'error' });
      /* SCOPE_DOWN: set safe fallback so /projects page still renders when metadata fails (e.g. missing tables). */
      setAllMetadata(prev => ({ ...prev, departments: prev.departments || [], financialYears: prev.financialYears || [], sectors: prev.sectors || [], programs: prev.programs || [], counties: prev.counties || [], projectCategories: prev.projectCategories || [], sections: [], subPrograms: [] }));
    }
  }, [authLoading, user, filterState]);

  useEffect(() => {
    if (!authLoading && user) {
        fetchProjects(false); // Initial load with limit (100 projects)
        if (fetchMetadata) {
          fetchAllMetadata();
        }
    }
  }, [authLoading, user, fetchProjects, fetchAllMetadata, fetchMetadata]);

  return {
    projects,
    loading,
    error,
    snackbar,
    setSnackbar,
    allMetadata,
    fetchProjects,
  };
};

export default useProjectData;