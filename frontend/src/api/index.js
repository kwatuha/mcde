import axios from 'axios';
import axiosInstance from './axiosInstance';
import authService from './authService';
import userService from './userService';
import projectService from './projectService';
import organizationService from './organizationService';
import strategyService from './strategyService';
import participantService from './participantService';
import generalService from './generalService';
import dashboardService from './dashboardService';
import metaDataService from './metaDataService';
import kdspIIService from './kdspIIService';
import hrService from './hrService';
import paymentService from './paymentService';
import projectWorkFlowService from './projectWorkFlowService';
import approvalService from './approvalService';
import approvalWorkflowService from './approvalWorkflowService';
import contractorService from './contractorService'; 
import reportsService from './reportsService';
import budgetService from './budgetService';
import kenyaWardsService from './kenyaWardsService';
import agenciesService from './agenciesService';
import sectorsService from './sectorsService';
import planningService from './planningService';
import auditTrailService from './auditTrailService';

// Public API service (no authentication required)
const publicApiService = {
  getStatsOverview: async (filters = {}) => {
    try {
      const response = await axiosInstance.get('/public/stats/overview', { params: filters });
      return response.data;
    } catch (error) {
      // Non-blocking for authenticated dashboards; keep as warning.
      console.warn("Failed to fetch public stats overview:", error);
      throw error;
    }
  },
  getProjects: async (filters = {}) => {
    try {
      const response = await axiosInstance.get('/public/projects', { params: filters });
      return response.data;
    } catch (error) {
      console.error("Failed to fetch public projects:", error);
      throw error;
    }
  },
  getSubCountyStats: async (filters = {}) => {
    try {
      const response = await axiosInstance.get('/public/stats/by-subcounty', { params: filters });
      return response.data;
    } catch (error) {
      console.error("Failed to fetch sub-county stats:", error);
      throw error;
    }
  },
  getDepartmentStats: async (filters = {}) => {
    try {
      const response = await axiosInstance.get('/public/stats/by-department', { params: filters });
      return response.data;
    } catch (error) {
      console.error("Failed to fetch department stats:", error);
      throw error;
    }
  },
}; // 👈 Import the new service

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';
export const FILE_SERVER_BASE_URL = import.meta.env.VITE_FILE_SERVER_BASE_URL || '/api';

const apiService = {
  ...projectService,
  kdspIIService,
  auth: authService,
  users: userService,
  organization: organizationService,
  strategy: strategyService,
  participants: participantService,
  general: generalService,
  dashboard: dashboardService,
  metadata: metaDataService,
  hr: hrService,
  paymentRequests: paymentService,
  workflow: projectWorkFlowService,
  approval: approvalService,
  approvalWorkflow: approvalWorkflowService,
  contractors: contractorService,
  reports: reportsService, // 👈 Mount the reportsService here
  budgets: budgetService, // 👈 Mount the budgetService here
  public: publicApiService, // 👈 Mount the publicApiService here
  kenyaWards: kenyaWardsService, // 👈 Mount the kenyaWardsService here
  agencies: agenciesService, // 👈 Mount the agenciesService here
  sectors: sectorsService, // 👈 Mount the sectorsService here
  planning: planningService,
  auditTrail: auditTrailService,
};

export { axiosInstance };

export default apiService;