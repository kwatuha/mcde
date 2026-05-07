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
};

export default procurementService;
