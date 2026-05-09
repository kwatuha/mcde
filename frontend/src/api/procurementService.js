import axiosInstance from './axiosInstance';

const procurementService = {
  /** Active stages by default; pass `{ all: true }` for catalog admin (includes inactive). */
  listStages: async (params = {}) => {
    const { data } = await axiosInstance.get('/procurement/stages', { params });
    return data;
  },
  createStage: async (payload) => {
    const { data } = await axiosInstance.post('/procurement/stages', payload);
    return data;
  },
  updateStage: async (id, payload) => {
    const { data } = await axiosInstance.patch(`/procurement/stages/${id}`, payload);
    return data;
  },
  deleteStage: async (id) => {
    await axiosInstance.delete(`/procurement/stages/${id}`);
  },
  getUnderProcurementProjects: async () => {
    const { data } = await axiosInstance.get('/procurement/projects');
    return data;
  },
  getWorkflowHistory: async (projectId) => {
    const { data } = await axiosInstance.get(`/procurement/projects/${projectId}/workflow`);
    return data;
  },
  addWorkflowStep: async (projectId, payload) => {
    const { data } = await axiosInstance.post(`/procurement/projects/${projectId}/workflow`, payload);
    return data;
  },
  getAttachments: async (projectId, params = {}) => {
    const { data } = await axiosInstance.get(`/procurement/projects/${projectId}/attachments`, { params });
    return data;
  },
  uploadAttachment: async (projectId, formData) => {
    const { data } = await axiosInstance.post(`/procurement/projects/${projectId}/attachments`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return data;
  },
  getChecklist: async (projectId, params = {}) => {
    const { data } = await axiosInstance.get(`/procurement/projects/${projectId}/checklist`, { params });
    return data;
  },
  addChecklistItem: async (projectId, payload) => {
    const { data } = await axiosInstance.post(`/procurement/projects/${projectId}/checklist`, payload);
    return data;
  },
  updateChecklistItem: async (projectId, itemId, payload) => {
    const { data } = await axiosInstance.patch(`/procurement/projects/${projectId}/checklist/${itemId}`, payload);
    return data;
  },
  listTemplates: async (params = {}) => {
    const { data } = await axiosInstance.get('/procurement/templates', { params });
    return data;
  },
  createTemplate: async (payload) => {
    const { data } = await axiosInstance.post('/procurement/templates', payload);
    return data;
  },
  updateTemplate: async (id, payload) => {
    const { data } = await axiosInstance.patch(`/procurement/templates/${id}`, payload);
    return data;
  },
  listStageSubjects: async (projectId, stage, params = {}) => {
    const { data } = await axiosInstance.get(
      `/procurement/projects/${projectId}/stages/${encodeURIComponent(stage)}/subjects`,
      { params }
    );
    return data;
  },
  createStageSubject: async (projectId, stage, payload) => {
    const { data } = await axiosInstance.post(
      `/procurement/projects/${projectId}/stages/${encodeURIComponent(stage)}/subjects`,
      payload
    );
    return data;
  },
  getSubjectAssessment: async (subjectId) => {
    const { data } = await axiosInstance.get(`/procurement/subjects/${subjectId}/assessment`);
    return data;
  },
  saveSubjectAssessment: async (subjectId, payload) => {
    const { data } = await axiosInstance.put(`/procurement/subjects/${subjectId}/assessment`, payload);
    return data;
  },
  exportBidderEvaluation: async (projectId, stage, format = 'xlsx') => {
    const { data, headers } = await axiosInstance.get(
      `/procurement/projects/${projectId}/stages/${encodeURIComponent(stage)}/evaluation-export`,
      { params: { format }, responseType: 'blob' }
    );
    const cd = headers?.['content-disposition'] || '';
    const match = cd.match(/filename="?([^"]+)"?/i);
    return { blob: data, fileName: match?.[1] || `bidder-evaluation.${format}` };
  },
  exportComprehensiveWorkbook: async (params = {}) => {
    const { data, headers } = await axiosInstance.get('/procurement/export/comprehensive', {
      params,
      responseType: 'blob',
    });
    const cd = headers?.['content-disposition'] || '';
    const match = cd.match(/filename="?([^"]+)"?/i);
    return { blob: data, fileName: match?.[1] || 'procurement-comprehensive.xlsx' };
  },
  getOverview: async () => {
    const { data } = await axiosInstance.get('/procurement/overview');
    return data;
  },
};

export default procurementService;
