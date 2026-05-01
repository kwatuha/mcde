// src/api/metaDataService.js
import axiosInstance from './axiosInstance';

const metaDataService = {
  // --- Departments API Calls ---
  departments: {
    getAllDepartments: async () => {
      const response = await axiosInstance.get('/metadata/departments');
      return response.data;
    },
    getDepartmentById: async (departmentId) => {
      const response = await axiosInstance.get(`/metadata/departments/${departmentId}`);
      return response.data;
    },
    createDepartment: async (departmentData) => {
      const response = await axiosInstance.post('/metadata/departments', departmentData);
      return response.data;
    },
    updateDepartment: async (departmentId, departmentData) => {
      const response = await axiosInstance.put(`/metadata/departments/${departmentId}`, departmentData);
      return response.data;
    },
    deleteDepartment: async (departmentId) => {
      const response = await axiosInstance.delete(`/metadata/departments/${departmentId}`);
      return response.data;
    },
    getSectionsByDepartment: async (departmentId) => {
      const response = await axiosInstance.get(`/metadata/departments/${departmentId}/sections`);
      return response.data;
    },
  },

  // --- Sections API Calls ---
  sections: {
    getAllSections: async () => {
        const response = await axiosInstance.get('/metadata/sections');
        return response.data;
    },
    getSectionById: async (sectionId) => {
        const response = await axiosInstance.get(`/metadata/sections/${sectionId}`);
        return response.data;
    },
    createSection: async (sectionData) => {
      const response = await axiosInstance.post('/metadata/sections', sectionData);
      return response.data;
    },
    updateSection: async (sectionId, sectionData) => {
      const response = await axiosInstance.put(`/metadata/sections/${sectionId}`, sectionData);
      return response.data;
    },
    deleteSection: async (sectionId) => {
      const response = await axiosInstance.delete(`/metadata/sections/${sectionId}`);
      return response.data;
    },
  },

  // --- Financial Years API Calls ---
  financialYears: {
    getAllFinancialYears: async () => {
      const normalizeFinancialYears = (payload) => {
        const rows = Array.isArray(payload)
          ? payload
          : (payload?.rows || payload?.data || payload?.financialYears || []);

        return (rows || []).map((fy) => ({
          ...fy,
          finYearId: fy.finYearId ?? fy.finyearid ?? fy.id ?? fy.fin_year_id,
          finYearName: fy.finYearName ?? fy.finyearname ?? fy.name ?? fy.fin_year_name,
        })).filter((fy) => fy.finYearId && fy.finYearName);
      };

      // Primary endpoint used by most metadata pages.
      try {
        const response = await axiosInstance.get('/metadata/financialyears');
        const normalized = normalizeFinancialYears(response.data);
        if (normalized.length > 0) return normalized;
      } catch (error) {
        console.warn('Primary financialyears endpoint failed, trying fallback endpoint.', error);
      }

      // Fallback endpoint present in this codebase and often less restricted.
      try {
        const response = await axiosInstance.get('/financialyears');
        const normalized = normalizeFinancialYears(response.data);
        if (normalized.length > 0) return normalized;
      } catch (error) {
        console.warn('Fallback /financialyears endpoint failed, trying organization fallback.', error);
      }

      // Last fallback for environments exposing org routes.
      const response = await axiosInstance.get('/organization/financial_years');
      return normalizeFinancialYears(response.data);
    },
    getFinancialYearById: async (finYearId) => {
        const response = await axiosInstance.get(`/metadata/financialyears/${finYearId}`);
        return response.data;
    },
    createFinancialYear: async (financialYearData) => {
      const response = await axiosInstance.post('/metadata/financialyears', financialYearData);
      return response.data;
    },
    updateFinancialYear: async (finYearId, financialYearData) => {
      const response = await axiosInstance.put(`/metadata/financialyears/${finYearId}`, financialYearData);
      return response.data;
    },
    deleteFinancialYear: async (finYearId) => {
      const response = await axiosInstance.delete(`/metadata/financialyears/${finYearId}`);
      return response.data;
    },
  },

  // --- Programs API Calls ---
  programs: {
    getAllPrograms: async () => {
      const response = await axiosInstance.get('/metadata/programs');
      return response.data;
    },
    getProgramById: async (programId) => {
        const response = await axiosInstance.get(`/metadata/programs/${programId}`);
        return response.data;
    },
    createProgram: async (programData) => {
      const response = await axiosInstance.post('/metadata/programs', programData);
      return response.data;
    },
    updateProgram: async (programId, programData) => {
      const response = await axiosInstance.put(`/metadata/programs/${programId}`, programData);
      return response.data;
    },
    deleteProgram: async (programId) => {
      const response = await axiosInstance.delete(`/metadata/programs/${programId}`);
      return response.data;
    },
    getSubProgramsByProgram: async (programId) => {
      const response = await axiosInstance.get(`/metadata/programs/${programId}/subprograms`);
      return response.data;
    },
  },

  // --- Sub-Programs API Calls ---
  subprograms: {
    getAllSubprograms: async () => {
        const response = await axiosInstance.get('/metadata/subprograms');
        return response.data;
    },
    getSubprogramById: async (subProgramId) => {
        const response = await axiosInstance.get(`/metadata/subprograms/${subProgramId}`);
        return response.data;
    },
    createSubprogram: async (subprogramData) => {
        const response = await axiosInstance.post('/metadata/subprograms', subprogramData);
        return response.data;
    },
    updateSubprogram: async (subProgramId, subprogramData) => {
        const response = await axiosInstance.put(`/metadata/subprograms/${subProgramId}`, subprogramData);
        return response.data;
    },
    deleteSubprogram: async (subProgramId) => {
        const response = await axiosInstance.delete(`/metadata/subprograms/${subProgramId}`);
        return response.data;
    },
  },

  // --- Counties API Calls ---
  counties: {
    getAllCounties: async () => {
      const response = await axiosInstance.get('/metadata/counties');
      return response.data;
    },
    getCountyById: async (countyId) => {
      const response = await axiosInstance.get(`/metadata/counties/${countyId}`);
      return response.data;
    },
    createCounty: async (countyData) => {
      const response = await axiosInstance.post('/metadata/counties', countyData);
      return response.data;
    },
    updateCounty: async (countyId, countyData) => {
      const response = await axiosInstance.put(`/metadata/counties/${countyId}`, countyData);
      return response.data;
    },
    deleteCounty: async (countyId) => {
      const response = await axiosInstance.delete(`/metadata/counties/${countyId}`);
      return response.data;
    },
    getSubcountiesByCounty: async (countyId) => {
      const response = await axiosInstance.get(`/metadata/counties/${countyId}/subcounties`);
      return response.data;
    },
  },

  // --- Sub-Counties API Calls ---
  subcounties: {
    getAllSubcounties: async () => {
      const response = await axiosInstance.get('/metadata/subcounties');
      return response.data;
    },
    getSubcountyById: async (subcountyId) => {
      const response = await axiosInstance.get(`/metadata/subcounties/${subcountyId}`);
      return response.data;
    },
    createSubcounty: async (subcountyData) => {
      const response = await axiosInstance.post('/metadata/subcounties', subcountyData);
      return response.data;
    },
    updateSubcounty: async (subcountyId, subcountyData) => {
      const response = await axiosInstance.put(`/metadata/subcounties/${subcountyId}`, subcountyData);
      return response.data;
    },
    deleteSubcounty: async (subcountyId) => {
      const response = await axiosInstance.delete(`/metadata/subcounties/${subcountyId}`);
      return response.data;
    },
    getWardsBySubcounty: async (subcountyId) => {
      const response = await axiosInstance.get(`/metadata/subcounties/${subcountyId}/wards`);
      return response.data;
    },
  },

  // --- Wards API Calls ---
  wards: {
    getAllWards: async () => {
      const response = await axiosInstance.get('/metadata/wards');
      return response.data;
    },
    getWardById: async (wardId) => {
        const response = await axiosInstance.get(`/metadata/wards/${wardId}`);
        return response.data;
    },
    createWard: async (wardData) => {
      const response = await axiosInstance.post('/metadata/wards', wardData);
      return response.data;
    },
    updateWard: async (wardId, wardData) => {
      const response = await axiosInstance.put(`/metadata/wards/${wardId}`, wardData);
      return response.data;
    },
    deleteWard: async (wardId) => {
      const response = await axiosInstance.delete(`/metadata/wards/${wardId}`);
      return response.data;
    },
  },
  
  // --- Project Categories & Milestones API Calls ---
  projectCategories: {
    getAllCategories: async () => {
      try {
        console.log('Fetching project categories from /metadata/projectcategories');
        const response = await axiosInstance.get('/metadata/projectcategories');
        console.log('Project categories API response status:', response.status);
        console.log('Project categories API response data:', response.data);
        console.log('Project categories API response data type:', typeof response.data);
        console.log('Project categories API response data is array:', Array.isArray(response.data));
        // Ensure we return an array
        const categories = Array.isArray(response.data) ? response.data : [];
        console.log('Returning categories:', categories.length, 'items');
        return categories;
      } catch (error) {
        console.error('Error fetching project categories from API:', error);
        console.error('Error message:', error.message);
        console.error('Error response status:', error.response?.status);
        console.error('Error response data:', error.response?.data);
        console.error('Error response headers:', error.response?.headers);
        return []; // Return empty array on error
      }
    },
    getCategoryById: async (categoryId) => {
      const response = await axiosInstance.get(`/metadata/projectcategories/${categoryId}`);
      return response.data;
    },
    createCategory: async (categoryData) => {
      const response = await axiosInstance.post('/metadata/projectcategories', categoryData);
      return response.data;
    },
    updateCategory: async (categoryId, categoryData) => {
      const response = await axiosInstance.put(`/metadata/projectcategories/${categoryId}`, categoryData);
      return response.data;
    },
    deleteCategory: async (categoryId) => {
      const response = await axiosInstance.delete(`/metadata/projectcategories/${categoryId}`);
      return response.data;
    },

    // --- Templated Milestones ---
    getMilestonesByCategory: async (categoryId) => {
      const response = await axiosInstance.get(`/metadata/projectcategories/${categoryId}/milestones`);
      return response.data;
    },
    createMilestone: async (categoryId, milestoneData) => {
      const response = await axiosInstance.post(`/metadata/projectcategories/${categoryId}/milestones`, milestoneData);
      return response.data;
    },
    updateMilestone: async (categoryId, milestoneId, milestoneData) => {
      const response = await axiosInstance.put(`/metadata/projectcategories/${categoryId}/milestones/${milestoneId}`, milestoneData);
      return response.data;
    },
    deleteMilestone: async (categoryId, milestoneId) => {
      const response = await axiosInstance.delete(`/metadata/projectcategories/${categoryId}/milestones/${milestoneId}`);
      return response.data;
    },
  },
    
  // --- NEW: Master metadata function for reports dashboard ---
  getAllMetadata: async () => {
    try {
      const [
        departments,
        sections,
        financialYears,
        programs,
        subprograms,
        counties,
        subcounties,
        wards,
        projectCategories
      ] = await Promise.all([
        metaDataService.departments.getAllDepartments(),
        metaDataService.sections.getAllSections(),
        metaDataService.financialYears.getAllFinancialYears(),
        metaDataService.programs.getAllPrograms(),
        metaDataService.subprograms.getAllSubprograms(),
        metaDataService.counties.getAllCounties(),
        metaDataService.subcounties.getAllSubcounties(),
        metaDataService.wards.getAllWards(),
        metaDataService.projectCategories.getAllCategories(),
      ]);

      return {
        departments,
        sections,
        financialYears,
        programs,
        subprograms,
        counties,
        subcounties,
        wards,
        projectCategories
      };

    } catch (error) {
      console.error("Error fetching all metadata:", error);
      throw error;
    }
  },
  
  // --- NEW: Get lightweight metadata cache for import validation ---
  getImportCache: async () => {
    try {
      const response = await axiosInstance.get('/metadata/import-cache');
      return response.data;
    } catch (error) {
      console.error("Error fetching import metadata cache:", error);
      throw error;
    }
  },
};

export default metaDataService;