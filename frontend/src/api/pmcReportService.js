import axiosInstance from './axiosInstance';

const pmcReportService = {
  list: async (filters = {}) => {
    const response = await axiosInstance.get('/pmc-reports', { params: filters });
    return response.data;
  },

  getById: async (reportId) => {
    const response = await axiosInstance.get(`/pmc-reports/${reportId}`);
    return response.data;
  },

  create: async (payload) => {
    const response = await axiosInstance.post('/pmc-reports', payload);
    return response.data;
  },

  update: async (reportId, payload) => {
    const response = await axiosInstance.put(`/pmc-reports/${reportId}`, payload);
    return response.data;
  },

  uploadSignedFile: async (reportId, file) => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await axiosInstance.post(`/pmc-reports/${reportId}/upload`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  submit: async (reportId) => {
    const response = await axiosInstance.post(`/pmc-reports/${reportId}/submit`);
    return response.data;
  },

  approve: async (reportId, comment = '') => {
    const response = await axiosInstance.post(`/pmc-reports/${reportId}/approve`, { comment });
    return response.data;
  },

  returnReport: async (reportId, comment) => {
    const response = await axiosInstance.post(`/pmc-reports/${reportId}/return`, { comment });
    return response.data;
  },

  remove: async (reportId) => {
    const response = await axiosInstance.delete(`/pmc-reports/${reportId}`);
    return response.data;
  },

  downloadSignedFile: async (reportId) => {
    const response = await axiosInstance.get(`/pmc-reports/${reportId}/file`, {
      responseType: 'blob',
    });
    return response;
  },
};

export default pmcReportService;
