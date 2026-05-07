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

  listReportSchedules: async () => {
    const response = await axiosInstance.get('/report-schedules');
    return response.data;
  },

  createReportSchedule: async (body) => {
    const response = await axiosInstance.post('/report-schedules', body);
    return response.data;
  },

  updateReportSchedule: async (id, body) => {
    const response = await axiosInstance.put(`/report-schedules/${id}`, body);
    return response.data;
  },

  deleteReportSchedule: async (id) => {
    const response = await axiosInstance.delete(`/report-schedules/${id}`);
    return response.data;
  },

  runReportScheduleNow: async (id) => {
    const response = await axiosInstance.post(`/report-schedules/${id}/run-now`);
    return response.data;
  },

  listReportScheduleRuns: async (id, opts = {}) => {
    const params = {};
    if (opts.limit != null) params.limit = opts.limit;
    const response = await axiosInstance.get(`/report-schedules/${id}/runs`, { params });
    return response.data;
  },
};

export default dataCollectionService;
