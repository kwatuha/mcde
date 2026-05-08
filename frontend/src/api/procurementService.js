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
};

export default procurementService;
