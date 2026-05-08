// src/api/organizationService.js
import axiosInstance from './axiosInstance';

/**
 * @file API service for Organizational Structure & Reference Data related calls.
 * @description Handles CRUD operations for county departments, department sections,
 * subcounties, wards, categories, attachment types, financial years, and contractors.
 */

const organizationService = {
  // --- County Departments (countydepartments) ---
  getCountyDepartments: async () => {
    try {
      const response = await axiosInstance.get('/organization/county_departments');
      return response.data;
    } catch (error) {
      console.error('Error fetching county departments:', error);
      throw error;
    }
  },
  getCountyDepartmentById: async (departmentId) => {
    try {
      const response = await axiosInstance.get(`/organization/county_departments/${departmentId}`);
      return response.data;
    } catch (error) {
      console.error(`Error fetching county department with ID ${departmentId}:`, error);
      throw error;
    }
  },
  createCountyDepartment: async (departmentData) => {
    try {
      const response = await axiosInstance.post('/organization/county_departments', departmentData);
      return response.data;
    } catch (error) {
      console.error('Error creating county department:', error);
      throw error;
    }
  },
  updateCountyDepartment: async (departmentId, departmentData) => {
    try {
      const response = await axiosInstance.put(`/organization/county_departments/${departmentId}`, departmentData);
      return response.data;
    } catch (error) {
      console.error(`Error updating county department with ID ${departmentId}:`, error);
      throw error;
    }
  },
  deleteCountyDepartment: async (departmentId) => {
    try {
      const response = await axiosInstance.delete(`/organization/county_departments/${departmentId}`);
      return response.data;
    } catch (error) {
      console.error(`Error deleting county department with ID ${departmentId}:`, error);
      throw error;
    }
  },

  // --- Department Sections (departmentsections) ---
  getDepartmentSections: async () => {
    try {
      const response = await axiosInstance.get('/organization/department_sections');
      return response.data;
    } catch (error) {
      console.error('Error fetching department sections:', error);
      throw error;
    }
  },
  getDepartmentSectionById: async (sectionId) => {
    try {
      const response = await axiosInstance.get(`/organization/department_sections/${sectionId}`);
      return response.data;
    } catch (error) {
      console.error(`Error fetching department section with ID ${sectionId}:`, error);
      throw error;
    }
  },
  createDepartmentSection: async (sectionData) => {
    try {
      const response = await axiosInstance.post('/organization/department_sections', sectionData);
      return response.data;
    } catch (error) {
      console.error('Error creating department section:', error);
      throw error;
    }
  },
  updateDepartmentSection: async (sectionId, sectionData) => {
    try {
      const response = await axiosInstance.put(`/organization/department_sections/${sectionId}`, sectionData);
      return response.data;
    } catch (error) {
      console.error(`Error updating department section with ID ${sectionId}:`, error);
      throw error;
    }
  },
  deleteDepartmentSection: async (sectionId) => {
    try {
      const response = await axiosInstance.delete(`/organization/department_sections/${sectionId}`);
      return response.data;
    } catch (error) {
      console.error(`Error deleting department section with ID ${sectionId}:`, error);
      throw error;
    }
  },

  // --- Subcounties (subcounties) ---
  getSubcounties: async () => {
    try {
      const response = await axiosInstance.get('/organization/subcounties');
      return response.data;
    } catch (error) {
      console.error('Error fetching subcounties:', error);
      throw error;
    }
  },
  getSubcountyById: async (subcountyId) => {
    try {
      const response = await axiosInstance.get(`/organization/subcounties/${subcountyId}`);
      return response.data;
    } catch (error) {
      console.error(`Error fetching subcounty with ID ${subcountyId}:`, error);
      throw error;
    }
  },
  createSubcounty: async (subcountyData) => {
    try {
      const response = await axiosInstance.post('/organization/subcounties', subcountyData);
      return response.data;
    } catch (error) {
      console.error('Error creating subcounty:', error);
      throw error;
    }
  },
  updateSubcounty: async (subcountyId, subcountyData) => {
    try {
      const response = await axiosInstance.put(`/organization/subcounties/${subcountyId}`, subcountyData);
      return response.data;
    } catch (error) {
      console.error(`Error updating subcounty with ID ${subcountyId}:`, error);
      throw error;
    }
  },
  deleteSubcounty: async (subcountyId) => {
    try {
      const response = await axiosInstance.delete(`/organization/subcounties/${subcountyId}`);
      return response.data;
    } catch (error) {
      console.error(`Error deleting subcounty with ID ${subcountyId}:`, error);
      throw error;
    }
  },

  // --- Wards (wards) ---
  getWards: async () => {
    try {
      const response = await axiosInstance.get('/organization/wards');
      return response.data;
    } catch (error) {
      console.error('Error fetching wards:', error);
      throw error;
    }
  },
  getWardById: async (wardId) => {
    try {
      const response = await axiosInstance.get(`/organization/wards/${wardId}`);
      return response.data;
    } catch (error) {
      console.error(`Error fetching ward with ID ${wardId}:`, error);
      throw error;
    }
  },
  createWard: async (wardData) => {
    try {
      const response = await axiosInstance.post('/organization/wards', wardData);
      return response.data;
    } catch (error) {
      console.error('Error creating ward:', error);
      throw error;
    }
  },
  updateWard: async (wardId, wardData) => {
    try {
      const response = await axiosInstance.put(`/organization/wards/${wardId}`, wardData);
      return response.data;
    } catch (error) {
      console.error(`Error updating ward with ID ${wardId}:`, error);
      throw error;
    }
  },
  deleteWard: async (wardId) => {
    try {
      const response = await axiosInstance.delete(`/organization/wards/${wardId}`);
      return response.data;
    } catch (error) {
      console.error(`Error deleting ward with ID ${wardId}:`, error);
      throw error;
    }
  },

  // --- Categories (categories) ---
  getCategories: async () => {
    try {
      const response = await axiosInstance.get('/organization/categories');
      return response.data;
    } catch (error) {
      console.error('Error fetching categories:', error);
      throw error;
    }
  },
  getCategoryById: async (categoryId) => {
    try {
      const response = await axiosInstance.get(`/organization/categories/${categoryId}`);
      return response.data;
    } catch (error) {
      console.error(`Error fetching category with ID ${categoryId}:`, error);
      throw error;
    }
  },
  createCategory: async (categoryData) => {
    try {
      const response = await axiosInstance.post('/organization/categories', categoryData);
      return response.data;
    } catch (error) {
      console.error('Error creating category:', error);
      throw error;
    }
  },
  updateCategory: async (categoryId, categoryData) => {
    try {
      const response = await axiosInstance.put(`/organization/categories/${categoryId}`, categoryData);
      return response.data;
    } catch (error) {
      console.error(`Error updating category with ID ${categoryId}:`, error);
      throw error;
    }
  },
  deleteCategory: async (categoryId) => {
    try {
      const response = await axiosInstance.delete(`/organization/categories/${categoryId}`);
      return response.data;
    } catch (error) {
      console.error(`Error deleting category with ID ${categoryId}:`, error);
      throw error;
    }
  },

  // --- Attachment Types (attachmenttypes) ---
  getAttachmentTypes: async () => {
    try {
      const response = await axiosInstance.get('/organization/attachment_types');
      return response.data;
    } catch (error) {
      console.error('Error fetching attachment types:', error);
      throw error;
    }
  },
  getAttachmentTypeById: async (typeId) => {
    try {
      const response = await axiosInstance.get(`/organization/attachment_types/${typeId}`);
      return response.data;
    } catch (error) {
      console.error(`Error fetching attachment type with ID ${typeId}:`, error);
      throw error;
    }
  },
  createAttachmentType: async (typeData) => {
    try {
      const response = await axiosInstance.post('/organization/attachment_types', typeData);
      return response.data;
    } catch (error) {
      console.error('Error creating attachment type:', error);
      throw error;
    }
  },
  updateAttachmentType: async (typeId, typeData) => {
    try {
      const response = await axiosInstance.put(`/organization/attachment_types/${typeId}`, typeData);
      return response.data;
    } catch (error) {
      console.error(`Error updating attachment type with ID ${typeId}:`, error);
      throw error;
    }
  },
  deleteAttachmentType: async (typeId) => {
    try {
      const response = await axiosInstance.delete(`/organization/attachment_types/${typeId}`);
      return response.data;
    } catch (error) {
      console.error(`Error deleting attachment type with ID ${typeId}:`, error);
      throw error;
    }
  },

  // --- Financial Years (financialyears) ---
  getFinancialYears: async () => {
    try {
      const response = await axiosInstance.get('/organization/financial_years');
      return response.data;
    } catch (error) {
      console.error('Error fetching financial years:', error);
      throw error;
    }
  },
  getFinancialYearById: async (finYearId) => {
    try {
      const response = await axiosInstance.get(`/organization/financial_years/${finYearId}`);
      return response.data;
    } catch (error) {
      console.error(`Error fetching financial year with ID ${finYearId}:`, error);
      throw error;
    }
  },
  createFinancialYear: async (finYearData) => {
    try {
      const response = await axiosInstance.post('/organization/financial_years', finYearData);
      return response.data;
    } catch (error) {
      console.error('Error creating financial year:', error);
      throw error;
    }
  },
  updateFinancialYear: async (finYearId, finYearData) => {
    try {
      const response = await axiosInstance.put(`/organization/financial_years/${finYearId}`, finYearData);
      return response.data;
    } catch (error) {
      console.error(`Error updating financial year with ID ${finYearId}:`, error);
      throw error;
    }
  },
  deleteFinancialYear: async (finYearId) => {
    try {
      const response = await axiosInstance.delete(`/organization/financial_years/${finYearId}`);
      return response.data;
    } catch (error) {
      console.error(`Error deleting financial year with ID ${finYearId}:`, error);
      throw error;
    }
  },

  // --- Contractors (contractors) ---
  getContractors: async () => {
    try {
      const response = await axiosInstance.get('/organization/contractors');
      return response.data;
    } catch (error) {
      console.error('Error fetching contractors:', error);
      throw error;
    }
  },
  getContractorById: async (contractorId) => {
    try {
      const response = await axiosInstance.get(`/organization/contractors/${contractorId}`);
      return response.data;
    } catch (error) {
      console.error(`Error fetching contractor with ID ${contractorId}:`, error);
      throw error;
    }
  },
  createContractor: async (contractorData) => {
    try {
      const response = await axiosInstance.post('/organization/contractors', contractorData);
      return response.data;
    } catch (error) {
      console.error('Error creating contractor:', error);
      throw error;
    }
  },
  updateContractor: async (contractorId, contractorData) => {
    try {
      const response = await axiosInstance.put(`/organization/contractors/${contractorId}`, contractorData);
      return response.data;
    } catch (error) {
      console.error(`Error updating contractor with ID ${contractorId}:`, error);
      throw error;
    }
  },
  deleteContractor: async (contractorId) => {
    try {
      const response = await axiosInstance.delete(`/organization/contractors/${contractorId}`);
      return response.data;
    } catch (error) {
      console.error(`Error deleting contractor with ID ${contractorId}:`, error);
      throw error;
    }
  },
};

export default organizationService;
