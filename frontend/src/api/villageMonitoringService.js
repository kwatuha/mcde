import axiosInstance from './axiosInstance';

const villageMonitoringService = {
  createReport: async (payload) => {
    const response = await axiosInstance.post('/village-monitoring/reports', payload);
    return response.data;
  },

  listReports: async (filters = {}) => {
    const response = await axiosInstance.get('/village-monitoring/reports', { params: filters });
    return response.data;
  },

  getSummary: async () => {
    const response = await axiosInstance.get('/village-monitoring/summary');
    return response.data;
  },

  getReport: async (id, opts = {}) => {
    const response = await axiosInstance.get(`/village-monitoring/reports/${id}`, {
      params: opts.detail ? { detail: 'true' } : {},
    });
    return response.data;
  },

  getHistory: async (id) => {
    const response = await axiosInstance.get(`/village-monitoring/reports/${id}/history`);
    return response.data;
  },

  updateReport: async (id, payload) => {
    const response = await axiosInstance.put(`/village-monitoring/reports/${id}`, payload);
    return response.data;
  },

  submitToWard: async (id) => {
    const response = await axiosInstance.post(`/village-monitoring/reports/${id}/submit`);
    return response.data;
  },

  submitAllDrafts: async () => {
    const response = await axiosInstance.post('/village-monitoring/reports/submit-drafts');
    return response.data;
  },

  forwardToSubcounty: async (id, comment) => {
    const response = await axiosInstance.post(`/village-monitoring/reports/${id}/forward-subcounty`, { comment });
    return response.data;
  },

  returnToWard: async (id, comment) => {
    const response = await axiosInstance.post(`/village-monitoring/reports/${id}/return-ward`, { comment });
    return response.data;
  },

  forwardToChief: async (id, comment) => {
    const response = await axiosInstance.post(`/village-monitoring/reports/${id}/forward-chief`, { comment });
    return response.data;
  },

  approve: async (id, comment) => {
    const response = await axiosInstance.post(`/village-monitoring/reports/${id}/approve`, { comment });
    return response.data;
  },

  exportWordReport: async (id) => {
    const response = await axiosInstance.get(`/village-monitoring/reports/${id}/export-word`, {
      responseType: 'blob',
    });
    return response;
  },

  uploadFormattedReport: async (id, file) => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await axiosInstance.post(`/village-monitoring/reports/${id}/formatted-report`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  downloadFormattedReport: async (id) => {
    const response = await axiosInstance.get(`/village-monitoring/reports/${id}/formatted-report`, {
      responseType: 'blob',
    });
    return response;
  },
};

export default villageMonitoringService;
