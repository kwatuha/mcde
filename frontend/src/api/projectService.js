// src/api/projectService.js
import axiosInstance from './axiosInstance';

/**
 * @file API service for Project Management related calls.
 * @description This service is organized to mirror the modular backend routes.
 * It handles CRUD operations and complex queries for all project-related resources.
 */

const projectService = {
  // --- Project Management API Calls (kemri_projects) ---
  projects: {
    /**
     * Fetches all projects with optional filtering.
     * @param {object} filters - An object containing key-value pairs for filtering.
     * e.g., { status: 'Ongoing', countyId: 1, projectName: 'Road' }
     * @returns {Promise<Array>} A promise that resolves to an array of projects.
     */
    getProjects: async (filters = {}) => {
      const queryString = new URLSearchParams(filters).toString();
      const url = queryString ? `/projects?${queryString}` : '/projects';
      const response = await axiosInstance.get(url);
      return response.data;
    },
    getProjectById: async (projectId) => {
      const response = await axiosInstance.get(`/projects/${projectId}`);
      return response.data;
    },
    createProject: async (projectData) => {
      const response = await axiosInstance.post('/projects', projectData);
      return response.data;
    },
    updateProject: async (projectId, projectData) => {
      const response = await axiosInstance.put(`/projects/${projectId}`, projectData);
      return response.data;
    },
    deleteProject: async (projectId) => {
      const response = await axiosInstance.delete(`/projects/${projectId}`);
      return response.data;
    },
    
    // NEW: Project Import API Calls
    previewProjectImport: async (formData) => {
      const response = await axiosInstance.post('/projects/import-data', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      return response.data;
    },
    checkMetadataMapping: async (importData) => {
      const isFormData = importData instanceof FormData;
      const config = isFormData ? {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 60000 // 60 seconds timeout for large file processing
      } : {
        timeout: 60000
      };
      const response = await axiosInstance.post('/projects/check-metadata-mapping', importData, config);
      return response.data;
    },
    confirmProjectImport: async (importData) => {
      const response = await axiosInstance.post('/projects/confirm-import-data', importData);
      return response.data;
    },
    downloadProjectTemplate: async () => {
      const response = await axiosInstance.get('/projects/template', {
        responseType: 'blob'
      });
      return response.data;
    },
    
    // NEW: Function to apply a milestone template to an existing project
    applyMilestoneTemplate: async (projectId) => {
        const response = await axiosInstance.post(`/projects/apply-template/${projectId}`);
        return response.data;
    },
    // NEW: Function to get contractors assigned to a project
    getContractors: async (projectId) => {
        const response = await axiosInstance.get(`/projects/${projectId}/contractors`);
        return response.data;
    },
    // NEW: Function to assign a contractor to a project
    assignContractor: async (projectId, contractorId) => {
        const response = await axiosInstance.post(`/projects/${projectId}/assign-contractor`, { contractorId });
        return response.data;
    },
    // NEW: Function to remove a contractor assignment from a project
    removeContractor: async (projectId, contractorId) => {
        const response = await axiosInstance.delete(`/projects/${projectId}/remove-contractor/${contractorId}`);
        return response.data;
    },
    /**
     * Fetches filtered map data for projects.
     * @param {object} filters - An object containing key-value pairs for filtering map data.
     * e.g., { countyId: 1, subcountyId: 5, projectType: 'Infrastracture' }
     * @returns {Promise<Object>} A promise that resolves to an object with project data and a bounding box.
     */
    getFilteredProjectMaps: async (filters = {}) => {
      const queryString = new URLSearchParams(filters).toString();
      const url = queryString ? `/projects/maps-data?${queryString}` : '/projects/maps-data';
      const response = await axiosInstance.get(url);
      return response.data;
    },
  },

  // --- Project Analytics API Calls ---
  analytics: {
    getProjectStatusCounts: async (filters = {}) => {
      const response = await axiosInstance.get('/projects/status-counts', { params: filters });
      return response.data;
    },
    getProjectsByDirectorateCounts: async (filters = {}) => {
      const response = await axiosInstance.get('/projects/directorate-counts', { params: filters });
      return response.data;
    },
    getProjectFundingOverview: async () => {
      const response = await axiosInstance.get('/projects/funding-overview');
      return response.data;
    },
    getProjectsByPICounts: async () => {
      const response = await axiosInstance.get('/projects/pi-counts');
      return response.data;
    },
    getParticipantsPerProject: async () => {
      const response = await axiosInstance.get('/projects/participants-per-project');
      return response.data;
    },
  },

  // --- Task Management API Calls (kemri_tasks) ---
  tasks: {
    getAllTasks: async () => {
      const response = await axiosInstance.get('/tasks');
      return response.data;
    },
    getTasksForProject: async (projectId) => {
      const response = await axiosInstance.get(`/tasks/project/${projectId}`);
      return response.data;
    },
    getTaskById: async (taskId) => {
      const response = await axiosInstance.get(`/tasks/${taskId}`);
      return response.data;
    },
    createTask: async (taskData) => {
      const response = await axiosInstance.post('/tasks', taskData);
      return response.data;
    },
    updateTask: async (taskId, taskData) => {
      const response = await axiosInstance.put(`/tasks/${taskId}`, taskData);
      return response.data;
    },
    deleteTask: async (taskId) => {
      const response = await axiosInstance.delete(`/tasks/${taskId}`);
      return response.data;
    },
  },

  // --- Milestone Management API Calls (kemri_project_milestones) ---
  milestones: {
    getAllMilestones: async () => {
      const response = await axiosInstance.get('/milestones');
      return response.data;
    },
    getMilestonesForProject: async (projectId) => {
      const response = await axiosInstance.get(`/milestones/project/${projectId}`);
      return response.data;
    },
    getMilestoneById: async (milestoneId) => {
      const response = await axiosInstance.get(`/milestones/${milestoneId}`);
      return response.data;
    },
    createMilestone: async (milestoneData) => {
      const response = await axiosInstance.post('/milestones', milestoneData);
      return response.data;
    },
    updateMilestone: async (milestoneId, milestoneData) => {
      const response = await axiosInstance.put(`/milestones/${milestoneId}`, milestoneData);
      return response.data;
    },
    deleteMilestone: async (milestoneId) => {
      const response = await axiosInstance.delete(`/milestones/${milestoneId}`);
      return response.data;
    },
  },
  
  // --- Project Maps API Calls ---
  projectMaps: {
      importMapData: async (payload) => {
          const response = await axiosInstance.post(`/projects/project_maps/import`, payload);
          return response.data;
      },
      previewMapDataImport: async (formData) => {
        const response = await axiosInstance.post('/maps/import-data', formData, {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        });
        return response.data;
      },
      confirmMapDataImport: async (importData) => {
        const response = await axiosInstance.post('/maps/confirm-import-data', importData);
        return response.data;
      },
      downloadMapDataTemplate: async () => {
        const response = await axiosInstance.get('/maps/template', {
          responseType: 'blob'
        });
        return response.data;
      },
      getProjectMap: async (projectId) => {
        const response = await axiosInstance.get(`/projects/project_maps/project/${projectId}`);
        return response.data;
      },
      updateProjectMap: async (projectId, mapData) => {
        const response = await axiosInstance.put(`/projects/project_maps/project/${projectId}`, { map: mapData });
        return response.data;
      },
  },
  
  // --- NEW: Consolidated Documents API Calls ---
  documents: {
    getDocumentsForProject: async (projectId) => {
      const response = await axiosInstance.get(`/projects/documents/project/${projectId}`);
      return response.data;
    },
    uploadDocument: async (documentData) => {
      const response = await axiosInstance.post(`/projects/documents`, documentData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      return response.data;
    },
    updateDocument: async (documentId, documentData) => {
      const response = await axiosInstance.put(`/projects/documents/${documentId}`, documentData);
      return response.data;
    },
    deleteDocument: async (documentId) => {
      const response = await axiosInstance.delete(`/projects/documents/${documentId}`);
      return response.data;
    },
    setProjectCoverPhoto: async (documentId) => {
      const response = await axiosInstance.put(`/projects/documents/cover/${documentId}`);
      return response.data;
    },
    // NEW: API call to reorder photos
    reorderPhotos: async (photos) => {
      const response = await axiosInstance.put(`/projects/documents/reorder`, { photos });
      return response.data;
    },
    // NEW: API call to resize a photo
    resizePhoto: async (documentId, sizeData) => {
      const response = await axiosInstance.put(`/projects/documents/resize/${documentId}`, sizeData);
      return response.data;
    },
     // New function to fetch documents by milestone
    getMilestoneDocuments: async (milestoneId) => {
        // FIX: Remove the leading '/api' from the URL
        const response = await axiosInstance.get(`/projects/documents/milestone/${milestoneId}`);
        return response.data;
    },
    // New function to approve/revoke document for public viewing
    updateDocumentApproval: async (documentId, approvalData) => {
        const response = await axiosInstance.put(`/documents/${documentId}/approval`, approvalData);
        return response.data;
    },
    // New function to get documents for a project (using the correct endpoint)
    getProjectDocuments: async (projectId) => {
        const response = await axiosInstance.get(`/projects/documents/project/${projectId}`);
        return response.data;
    },
    // New function to update document approval
    updateDocumentApproval: async (documentId, approvalData) => {
        const response = await axiosInstance.put(`/projects/documents/${documentId}/approval`, approvalData);
        return response.data;
    }
  },
  
  // --- NEW: Project Monitoring API Calls ---
  projectMonitoring: {
    getRecordsByProject: async (projectId) => {
      const response = await axiosInstance.get(`/projects/${projectId}/monitoring`);
      return response.data;
    },
    createRecord: async (projectId, recordData) => {
      const response = await axiosInstance.post(`/projects/${projectId}/monitoring`, recordData);
      return response.data;
    },
    updateRecord: async (projectId, recordId, recordData) => {
      const response = await axiosInstance.put(`/projects/${projectId}/monitoring/${recordId}`, recordData);
      return response.data;
    },
    deleteRecord: async (projectId, recordId) => {
      const response = await axiosInstance.delete(`/projects/${projectId}/monitoring/${recordId}`);
      return response.data;
    },
  },
  
  // --- NEW: Contractor Management API Calls ---
  contractors: {
    getAllContractors: async () => {
      const response = await axiosInstance.get('/contractors');
      return response.data;
    },
    getContractorById: async (contractorId) => {
      const response = await axiosInstance.get(`/contractors/${contractorId}`);
      return response.data;
    },
    createContractor: async (contractorData) => {
      const response = await axiosInstance.post('/contractors', contractorData);
      return response.data;
    },
    updateContractor: async (contractorId, contractorData) => {
      const response = await axiosInstance.put(`/contractors/${contractorId}`, contractorData);
      return response.data;
    },
    deleteContractor: async (contractorId) => {
      const response = await axiosInstance.delete(`/contractors/${contractorId}`);
      return response.data;
    },
    getProjectsByContractor: async (contractorId) => {
        const response = await axiosInstance.get(`/contractors/${contractorId}/projects`);
        return response.data;
    },
  },

  // --- Task Assignees API Calls (kemri_task_assignees) ---
  taskAssignees: {
    getAllTaskAssignees: async () => {
      const response = await axiosInstance.get('/task_assignees');
      return response.data;
    },
    getTaskAssigneesForTask: async (taskId) => {
      const response = await axiosInstance.get(`/task_assignees/by-task/${taskId}`);
      return response.data;
    },
    getTaskAssigneeById: async (taskAssigneeId) => {
      const response = await axiosInstance.get(`/task_assignees/${taskAssigneeId}`);
      return response.data;
    },
    createTaskAssignee: async (assigneeData) => {
      const response = await axiosInstance.post('/task_assignees', assigneeData);
      return response.data;
    },
    updateTaskAssignee: async (taskAssigneeId, assigneeData) => {
      const response = await axiosInstance.put(`/task_assignees/${taskAssigneeId}`, assigneeData);
      return response.data;
    },
    deleteTaskAssignee: async (taskAssigneeId) => {
      const response = await axiosInstance.delete(`/tasks/${taskAssigneeId}`);
      return response.data;
    },
  },

  // --- Project-Location Junction Table API Calls ---
  junctions: {
    getProjectCounties: async (projectId) => {
      const response = await axiosInstance.get(`/projects/${projectId}/counties`);
      return response.data;
    },
    addProjectCounty: async (projectId, countyId) => {
      const response = await axiosInstance.post(`/projects/${projectId}/counties`, { countyId });
      return response.data;
    },
    removeProjectCounty: async (projectId, countyId) => {
      const response = await axiosInstance.delete(`/projects/${projectId}/counties/${countyId}`);
      return response.data;
    },
    getProjectSubcounties: async (projectId) => {
      const response = await axiosInstance.get(`/projects/${projectId}/subcounties`);
      return response.data;
    },
    addProjectSubcounty: async (projectId, subcountyId) => {
      const response = await axiosInstance.post(`/projects/${projectId}/subcounties`, { subcountyId });
      return response.data;
    },
    removeProjectSubcounty: async (projectId, subcountyId) => {
      const response = await axiosInstance.delete(`/projects/${projectId}/subcounties/${subcountyId}`);
      return response.data;
    },
    getProjectWards: async (projectId) => {
      const response = await axiosInstance.get(`/projects/${projectId}/wards`);
      return response.data;
    },
    addProjectWard: async (projectId, wardId) => {
      const response = await axiosInstance.post(`/projects/${projectId}/wards`, { wardId });
      return response.data;
    },
    removeProjectWard: async (projectId, wardId) => {
      const response = await axiosInstance.delete(`/projects/${projectId}/wards/${wardId}`);
      return response.data;
    },
    
    // --- Project Sites API Calls ---
    getProjectSites: async (projectId) => {
      const response = await axiosInstance.get(`/projects/${projectId}/sites`);
      return response.data;
    },
    createProjectSite: async (projectId, siteData) => {
      const response = await axiosInstance.post(`/projects/${projectId}/sites`, siteData);
      return response.data;
    },
    updateProjectSite: async (projectId, siteId, siteData) => {
      const response = await axiosInstance.put(`/projects/${projectId}/sites/${siteId}`, siteData);
      return response.data;
    },
    deleteProjectSite: async (projectId, siteId) => {
      const response = await axiosInstance.delete(`/projects/${projectId}/sites/${siteId}`);
      return response.data;
    },

    // --- Project Site History API Calls ---
    getProjectSiteHistory: async (projectId, siteId) => {
      const response = await axiosInstance.get(`/projects/${projectId}/sites/${siteId}/history`);
      return response.data;
    },
    createProjectSiteHistory: async (projectId, siteId, data) => {
      const response = await axiosInstance.post(`/projects/${projectId}/sites/${siteId}/history`, data);
      return response.data;
    },

    // --- Project Jobs API Calls ---
    getProjectJobs: async (projectId) => {
      const response = await axiosInstance.get(`/projects/${projectId}/jobs`);
      return response.data;
    },
    createProjectJob: async (projectId, jobData) => {
      const response = await axiosInstance.post(`/projects/${projectId}/jobs`, jobData);
      return response.data;
    },
    updateProjectJob: async (projectId, jobId, jobData) => {
      const response = await axiosInstance.put(`/projects/${projectId}/jobs/${jobId}`, jobData);
      return response.data;
    },
    deleteProjectJob: async (projectId, jobId) => {
      const response = await axiosInstance.delete(`/projects/${projectId}/jobs/${jobId}`);
      return response.data;
    },
  },
  
  // Comprehensive Project Import
  comprehensiveProjects: {
    previewComprehensiveImport: async (formData) => {
      const response = await axiosInstance.post('/comprehensive-projects/preview', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      return response.data;
    },
    confirmComprehensiveImport: async (importData) => {
      const response = await axiosInstance.post('/comprehensive-projects/confirm-import', importData);
      return response.data;
    },
  },
};

export default projectService;
