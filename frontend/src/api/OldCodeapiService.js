// src/api/apiService.js
import axios from 'axios';

const API_BASE_URL = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_URL)
  ? import.meta.env.VITE_API_URL
  : '/api';

// Create an Axios instance with base URL and default headers
const axiosInstance = axios.create({
    baseURL: API_BASE_URL,
    headers: {
        'Content-Type': 'application/json',
    },
});

// Request Interceptor: Adds x-auth-token to headers if available in localStorage
axiosInstance.interceptors.request.use(
    (config) => {
        const token = localStorage.getItem('jwtToken');
        if (token) {
            config.headers['x-auth-token'] = token;
        }
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

// Response Interceptor: Logs API errors and re-throws them for component-level handling
axiosInstance.interceptors.response.use(
    (response) => response, // If response is successful, just return it
    (error) => {
        console.error('API Response Error:', error.response || error.message);
        // If there's a response object (e.g., 4xx, 5xx errors), reject with its data
        // Otherwise, reject with a generic Error object
        return Promise.reject(error.response ? error.response.data : new Error(error.message));
    }
);

// Define the apiService object with all your API methods
const apiService = {
  // --- Authentication & User Profile ---
  login: async (username, password) => {
    try {
      const response = await axiosInstance.post('/login', { username, password });
      return response.data; // Return the entire response data, including the token
    } catch (error) {
      console.error('Error during login:', error);
      throw error; // Re-throw the error for the calling component to catch
    }
  },

  getUserProfile: async () => {
    try {
      const response = await axiosInstance.get('/user');
      return response.data;
    } catch (error) {
      console.error('Error fetching user profile:', error);
      throw error;
    }
  },

  // --- User Management API Calls (NEWLY ADDED) ---
  getUsers: async () => {
    try {
      const response = await axiosInstance.get('/users'); // Corresponds to GET /api/users
      return response.data;
    } catch (error) {
      console.error('Error fetching users:', error);
      throw error;
    }
  },

  registerUser: async (userData) => { // This is for admin to create users via POST /api/users
    try {
      const response = await axiosInstance.post('/users', userData); // Corresponds to POST /api/users
      return response.data;
    } catch (error) {
      console.error('Error registering user (admin):', error);
      throw error;
    }
  },

  updateUser: async (userId, userData) => {
    try {
      const response = await axiosInstance.put(`/users/${userId}`, userData); // Corresponds to PUT /api/users/:id
      return response.data;
    } catch (error) {
      console.error(`Error updating user with ID ${userId}:`, error);
      throw error;
    }
  },

  deleteUser: async (userId) => {
    try {
      const response = await axiosInstance.delete(`/users/${userId}`); // Corresponds to DELETE /api/users/:id
      return response.data;
    } catch (error) {
      console.error(`Error deleting user with ID ${userId}:`, error);
      throw error;
    }
  },

  // --- Dashboard Data Endpoints ---
  getFilterOptions: async () => {
    try {
      const response = await axiosInstance.get('/filters/options');
      return response.data;
    } catch (error) {
      console.error('Error fetching filter options:', error);
      throw error;
    }
  },

  getSummaryStatistics: async (filters) => {
    try {
      const response = await axiosInstance.post('/summary', { filters });
      return response.data;
    } catch (error) {
      console.error('Error fetching summary statistics:', error);
      throw error;
    }
  },

  getDemographicData: async (filters) => {
    try {
      const response = await axiosInstance.post('/demographics', { filters });
      return response.data;
    } catch (error) {
      console.error('Error fetching demographic data:', error);
      throw error;
    }
  },

  getDiseasePrevalenceData: async (filters) => {
    try {
      const response = await axiosInstance.post('/disease-prevalence', { filters });
      return response.data;
    } catch (error) {
      console.error('Error fetching disease prevalence data:', error);
      throw error;
    }
  },

  getHeatmapData: async (filters) => {
    try {
      const response = await axiosInstance.post('/heatmap-data', { filters });
      return response.data;
    } catch (error) {
      console.error('Error fetching heatmap data:', error);
      throw error;
    }
  },

  getParticipants: async (filters, page, pageSize, sortBy, sortOrder) => {
    try {
      const response = await axiosInstance.post('/participants', {
        filters,
        page,
        pageSize,
        sortBy,
        sortOrder,
      });
      return response.data;
    } catch (error) {
      console.error('Error fetching participants data:', error);
      throw error;
    }
  },

  exportToExcel: async (filters, excelHeadersMapping) => {
    try {
      const response = await axiosInstance.post('/export/excel', { filters, excelHeadersMapping }, {
        responseType: 'blob',
      });
      return response.data;
    } catch (error) {
      console.error('Error exporting to Excel:', error);
      throw error;
    }
  },

  exportToPdf: async (filters, tableHtml) => {
    try {
      const response = await axiosInstance.post('/export/pdf', { filters, tableHtml }, {
        responseType: 'blob',
      });
      return response.data;
    } catch (error) {
      console.error('Error exporting to PDF:', error);
      throw error;
    }
  },

  getHouseholdSizeData: async (filters) => {
    try {
      const response = await axiosInstance.post('/household-size-distribution', { filters });
      return response.data;
    } catch (error) {
      console.error('Error fetching household size data:', error);
      throw error;
    }
  },

  getHealthcareAccessData: async (filters) => {
    try {
      const response = await axiosInstance.post('/healthcare-access-distribution', { filters });
      return response.data;
    } catch (error) {
      console.error('Error fetching healthcare access data:', error);
      throw error;
    }
  },

  getWaterStorageData: async (filters) => {
    try {
      const response = await axiosInstance.post('/water-storage-distribution', { filters });
      return response.data;
    } catch (error)
    {
      console.error('Error fetching water storage data:', error);
      throw error;
    }
  },

  getClimatePerceptionData: async (filters) => {
    try {
      const response = await axiosInstance.post('/climate-perception-distribution', { filters });
      return response.data;
    } catch (error) {
      console.error('Error fetching climate perception data:', error);
      throw error;
    }
  },

  // --- Project Management API Calls (CRUD) ---
  getProjects: async () => {
    try {
      const response = await axiosInstance.get('/projects');
      return response.data;
    } catch (error) {
      console.error('Error fetching projects:', error);
      throw error;
    }
  },

  getProjectById: async (projectId) => {
    try {
      const response = await axiosInstance.get(`/projects/${projectId}`);
      return response.data;
    } catch (error) {
      console.error(`Error fetching project with ID ${projectId}:`, error);
      throw error;
    }
  },

  createProject: async (projectData) => {
    try {
      const response = await axiosInstance.post('/projects', projectData);
      return response.data;
    } catch (error) {
      console.error('Error creating project:', error);
      throw error;
    }
  },

  updateProject: async (projectId, projectData) => {
    try {
      const response = await axiosInstance.put(`/projects/${projectId}`, projectData);
      return response.data;
    }
    catch (error) {
      console.error(`Error updating project with ID ${projectId}:`, error);
      throw error;
    }
  },

  deleteProject: async (projectId) => {
    try {
      const response = await axiosInstance.delete(`/projects/${projectId}`);
      return response.data;
    } catch (error) {
      console.error(`Error deleting project with ID ${projectId}:`, error);
      throw error;
    }
  },

  // --- Project Analytical API Calls ---
  getProjectStatusCounts: async () => {
    try {
      const response = await axiosInstance.get('/projects/status-counts');
      return response.data;
    } catch (error) {
      console.error('Error fetching project status counts:', error);
      throw error;
    }
  },

  getProjectsByDirectorateCounts: async () => {
    try {
      const response = await axiosInstance.get('/projects/directorate-counts');
      return response.data;
    } catch (error) {
      console.error('Error fetching projects by directorate counts:', error);
      throw error;
    }
  },

  getProjectFundingOverview: async () => {
    try {
      const response = await axiosInstance.get('/projects/funding-overview');
      return response.data;
    } catch (error) {
      console.error('Error fetching project funding overview:', error);
      throw error;
    }
  },

  getProjectsByPICounts: async () => {
    try {
      const response = await axiosInstance.get('/projects/pi-counts');
      return response.data;
    } catch (error) {
      console.error('Error fetching projects by PI counts:', error);
      throw error;
    }
  },

  getParticipantsPerProject: async () => {
    try {
      const response = await axiosInstance.get('/projects/participants-per-project');
      return response.data;
    } catch (error) {
      console.error('Error fetching participants per project:', error);
      throw error;
    }
  },

  // --- Task Management API Calls ---
  getTasksByProjectId: async (projectId) => {
    try {
      const response = await axiosInstance.get(`/projects/${projectId}/tasks`);
      return response.data;
    } catch (error) {
      console.error(`Error fetching tasks for project ${projectId}:`, error);
      throw error;
    }
  },

  getTaskById: async (taskId) => {
    try {
      const response = await axiosInstance.get(`/tasks/${taskId}`);
      return response.data;
    } catch (error) {
      console.error(`Error fetching task with ID ${taskId}:`, error);
      throw error;
    }
  },

  createTask: async (projectId, taskData) => {
    try {
      const response = await axiosInstance.post(`/projects/${projectId}/tasks`, taskData);
      return response.data;
    } catch (error) {
      console.error(`Error creating task for project ${projectId}:`, error);
      throw error;
    }
  },

  updateTask: async (taskId, taskData) => {
    try {
      const response = await axiosInstance.put(`/tasks/${taskId}`, taskData);
      return response.data;
    } catch (error) {
      console.error(`Error updating task with ID ${taskId}:`, error);
      throw error;
    }
  },

  deleteTask: async (taskId) => {
    try {
      const response = await axiosInstance.delete(`/tasks/${taskId}`);
      return response.data;
    } catch (error) {
      console.error(`Error deleting task with ID ${taskId}:`, error);
      throw error;
    }
  },

  // --- Task Assignees API Calls ---
  assignStaffToTask: async (taskId, staffIds) => {
    try {
      const response = await axiosInstance.post(`/tasks/${taskId}/assignees`, { staffIds });
      return response.data;
    } catch (error) {
      console.error(`Error assigning staff to task ${taskId}:`, error);
      throw error;
    }
  },

  getTaskAssignees: async (taskId) => {
    try {
      const response = await axiosInstance.get(`/tasks/${taskId}/assignees`);
      return response.data;
    } catch (error) {
      console.error(`Error fetching assignees for task ${taskId}:`, error);
      throw error;
    }
  },

  removeStaffFromTask: async (taskId, staffId) => {
    try {
      const response = await axiosInstance.delete(`/tasks/${taskId}/assignees/${staffId}`);
      return response.data;
    } catch (error) {
      console.error(`Error removing staff ${staffId} from task ${taskId}:`, error);
      throw error;
    }
  },

  // --- Task Dependencies API Calls ---
  createTaskDependency: async (taskId, dependsOnTaskId) => {
    try {
      const response = await axiosInstance.post(`/tasks/${taskId}/dependencies`, { dependsOnTaskId });
      return response.data;
    } catch (error) {
      console.error(`Error creating dependency for task ${taskId} on ${dependsOnTaskId}:`, error);
      throw error;
    }
  },

  getTaskDependencies: async (taskId) => {
    try {
      const response = await axiosInstance.get(`/tasks/${taskId}/dependencies`);
      return response.data;
    } catch (error) {
      console.error(`Error fetching dependencies for task ${taskId}:`, error);
      throw error;
    }
  },

  deleteTaskDependency: async (taskId, dependsOnTaskId) => {
    try {
      const response = await axiosInstance.delete(`/tasks/${taskId}/dependencies/${dependsOnTaskId}`);
      return response.data;
    } catch (error) {
      console.error(`Error deleting dependency for task ${taskId} on ${dependsOnTaskId}:`, error);
      throw error;
    }
  },

  // --- Milestone Management API Calls ---
  getMilestonesByProjectId: async (projectId) => {
    try {
      const response = await axiosInstance.get(`/projects/${projectId}/milestones`);
      return response.data;
    } catch (error) {
      console.error(`Error fetching milestones for project ${projectId}:`, error);
      throw error;
    }
  },

  getMilestoneById: async (milestoneId) => {
    try {
      const response = await axiosInstance.get(`/milestones/${milestoneId}`);
      return response.data;
    } catch (error) {
      console.error(`Error fetching milestone with ID ${milestoneId}:`, error);
      throw error;
    }
  },

  createMilestone: async (projectId, milestoneData) => {
    try {
      const response = await axiosInstance.post(`/projects/${projectId}/milestones`, milestoneData);
      return response.data;
    } catch (error) {
      console.error(`Error creating milestone for project ${projectId}:`, error);
      throw error;
    }
  },

  updateMilestone: async (milestoneId, milestoneData) => {
    try {
      const response = await axiosInstance.put(`/milestones/${milestoneId}`, milestoneData);
      return response.data;
    } catch (error) {
      console.error(`Error updating milestone with ID ${milestoneId}:`, error);
      throw error;
    }
  },

  deleteMilestone: async (milestoneId) => {
    try {
      const response = await axiosInstance.delete(`/milestones/${milestoneId}`);
      return response.data;
    } catch (error) {
      console.error(`Error deleting milestone with ID ${milestoneId}:`, error);
      throw error;
    }
  },

  // --- Staff Management API Calls ---
  getStaff: async () => {
    try {
      const response = await axiosInstance.get('/staff');
      return response.data;
    } catch (error) {
      console.error('Error fetching staff list:', error);
      throw error;
    }
  },
};

export default apiService;
