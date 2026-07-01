import axiosInstance from './axiosInstance';

const dataCollectionService = {
  listTemplates: async (opts = {}) => {
    const params = {};
    if (opts.category) params.category = opts.category;
    if (opts.activeOnly === false) params.active = 'false';
    if (opts.manage) params.manage = 'true';
    const response = await axiosInstance.get('/data-collection/templates', { params });
    return response.data;
  },

  getTemplate: async (id, opts = {}) => {
    const params = {};
    if (opts.manage) params.manage = 'true';
    const response = await axiosInstance.get(`/data-collection/templates/${id}`, { params });
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

  getProjectFieldOptions: async (projectId, source, opts = {}) => {
    const params = { projectId, source };
    if (opts.subjectType) params.subjectType = opts.subjectType;
    if (opts.rriProgrammeId != null) params.rriProgrammeId = opts.rriProgrammeId;
    const response = await axiosInstance.get('/data-collection/project-field-options', { params });
    return response.data;
  },

  getFieldOptions: async ({ source, subjectType = 'project', projectId, rriProgrammeId } = {}) => {
    const params = { source, subjectType };
    if (projectId != null) params.projectId = projectId;
    if (rriProgrammeId != null) params.rriProgrammeId = rriProgrammeId;
    const response = await axiosInstance.get('/data-collection/field-options', { params });
    return response.data;
  },

  listSubmissions: async (opts = {}) => {
    const params = {};
    if (opts.projectId != null) params.projectId = opts.projectId;
    if (opts.rriProgrammeId != null) params.rriProgrammeId = opts.rriProgrammeId;
    if (opts.subjectType) params.subjectType = opts.subjectType;
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

  uploadAttachment: async (file, meta = {}) => {
    const form = new FormData();
    form.append('file', file);
    if (meta.itemId) form.append('itemId', String(meta.itemId));
    if (meta.lat != null && meta.lat !== '') form.append('lat', String(meta.lat));
    if (meta.lng != null && meta.lng !== '') form.append('lng', String(meta.lng));
    if (meta.accuracy != null && meta.accuracy !== '') form.append('accuracy', String(meta.accuracy));
    if (meta.capturedAt) form.append('capturedAt', String(meta.capturedAt));
    const response = await axiosInstance.post('/data-collection/attachments', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
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
