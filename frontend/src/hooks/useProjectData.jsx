import { useState, useEffect, useCallback } from 'react';
import apiService from '../api';
import { checkUserPrivilege } from '../utils/tableHelpers';

const useProjectData = (user, authLoading, filterState) => {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });

  const [allMetadata, setAllMetadata] = useState({
    departments: [],
    sections: [],
    financialYears: [],
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
      setError("You do not have 'project.read_all' privilege to view projects.");
      return;
    }
    
    if (!user.privileges || !Array.isArray(user.privileges)) {
      console.warn('useProjectData: User object missing privileges array', { user });
      setProjects([]);
      setLoading(false);
      setError("You do not have 'project.read_all' privilege to view projects. Please log out and log back in to refresh your token.");
      return;
    }
    
    if (!checkUserPrivilege(user, 'project.read_all')) {
      console.warn('useProjectData: User does not have project.read_all privilege', {
        username: user.username,
        privilegesCount: user.privileges.length,
        hasPrivilege: user.privileges.includes('project.read_all'),
        firstFewPrivileges: user.privileges.slice(0, 10)
      });
      setProjects([]);
      setLoading(false);
      setError("You do not have 'project.read_all' privilege to view projects. Please log out and log back in to refresh your token.");
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
      setProjects(data);
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
        departments, financialYears, programs, counties, projectCategories
      ] = await Promise.all([
        apiService.metadata.departments.getAllDepartments(),
        apiService.metadata.financialYears.getAllFinancialYears(),
        apiService.metadata.programs.getAllPrograms().catch(() => []),
        apiService.metadata.counties.getAllCounties(),
        apiService.metadata.projectCategories.getAllCategories().catch(err => {
          console.error('Error fetching project categories:', err);
          return [];
        }),
      ]);

      const newMetadata = { departments, financialYears, programs, counties, projectCategories };

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
      setAllMetadata(prev => ({ ...prev, departments: prev.departments || [], financialYears: prev.financialYears || [], programs: prev.programs || [], counties: prev.counties || [], projectCategories: prev.projectCategories || [], sections: [], subPrograms: [] }));
    }
  }, [authLoading, user, filterState]);

  useEffect(() => {
    if (!authLoading && user) {
        fetchProjects(false); // Initial load with limit (100 projects)
        fetchAllMetadata();
    }
  }, [authLoading, user, fetchProjects, fetchAllMetadata]);

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