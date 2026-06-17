import axiosInstance from './axiosInstance';

const adpService = {
  getPlans: async () => {
    const { data } = await axiosInstance.get('/adp/plans');
    return data;
  },

  getSummary: async (params = {}) => {
    const { data } = await axiosInstance.get('/adp/summary', { params });
    return data;
  },

  getProjects: async (params = {}) => {
    const { data } = await axiosInstance.get('/adp/projects', { params });
    return data;
  },

  updateProject: async (adpProjectId, payload) => {
    const { data } = await axiosInstance.put(`/adp/projects/${adpProjectId}`, payload);
    return data;
  },

  deleteProject: async (adpProjectId) => {
    const { data } = await axiosInstance.delete(`/adp/projects/${adpProjectId}`);
    return data;
  },

  getCatalog: async (params = {}) => {
    const { data } = await axiosInstance.get('/adp/catalog', { params });
    return data;
  },

  getProjectLink: async (projectId) => {
    const { data } = await axiosInstance.get(`/adp/project-links/${projectId}`);
    return data;
  },

  updateProjectLink: async (projectId, payload) => {
    const { data } = await axiosInstance.put(`/adp/project-links/${projectId}`, payload);
    return data;
  },

  updateSuggestionStatus: async (suggestionId, status) => {
    const { data } = await axiosInstance.patch(`/adp/project-link-suggestions/${suggestionId}`, { status });
    return data;
  },

  generateSuggestions: async (planId) => {
    const { data } = await axiosInstance.post(`/adp/plans/${planId}/generate-suggestions`);
    return data;
  },
};

export default adpService;
