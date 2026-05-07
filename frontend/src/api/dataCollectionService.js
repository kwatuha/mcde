import axiosInstance from './axiosInstance';

const dataCollectionService = {
  listTemplates: async (opts = {}) => {
    const params = {};
    if (opts.category) params.category = opts.category;
    if (opts.activeOnly === false) params.active = 'false';
    const response = await axiosInstance.get('/data-collection/templates', { params });
    return response.data;
  },

  getTemplate: async (id) => {
    const response = await axiosInstance.get(`/data-collection/templates/${id}`);
    return response.data;
  },

  createTemplate: async (body) => {
    const response = await axiosInstance.post('/data-collection/templates', body);
    return response.data;
  },

  updateTemplate: async (id, body) => {
    const response = await axiosInstance.put(`/data-collection/templates/${id}`, body);
    return response.data;
  },

  deleteTemplate: async (id) => {
    const response = await axiosInstance.delete(`/data-collection/templates/${id}`);
    return response.data;
  },

  listSubmissions: async (opts = {}) => {
    const params = {};
    if (opts.projectId != null) params.projectId = opts.projectId;
    const response = await axiosInstance.get('/data-collection/submissions', { params });
    return response.data;
  },

  getSubmission: async (id) => {
    const response = await axiosInstance.get(`/data-collection/submissions/${id}`);
    return response.data;
  },

  createSubmission: async (body) => {
    const response = await axiosInstance.post('/data-collection/submissions', body);
    return response.data;
  },

  updateSubmission: async (id, body) => {
    const response = await axiosInstance.put(`/data-collection/submissions/${id}`, body);
    return response.data;
  },
};

export default dataCollectionService;
