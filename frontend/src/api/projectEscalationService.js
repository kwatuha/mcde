import axiosInstance from './axiosInstance';

const projectEscalationService = {
  listRules: async () => {
    const response = await axiosInstance.get('/project-escalations/rules');
    return response.data;
  },

  getSummary: async () => {
    const response = await axiosInstance.get('/project-escalations/summary');
    return response.data;
  },

  listSignals: async (opts = {}) => {
    const response = await axiosInstance.get('/project-escalations/signals', { params: opts });
    return response.data;
  },

  getSignal: async (id) => {
    const response = await axiosInstance.get(`/project-escalations/signals/${id}`);
    return response.data;
  },

  acknowledge: async (id, comment) => {
    const response = await axiosInstance.post(`/project-escalations/signals/${id}/acknowledge`, { comment });
    return response.data;
  },

  resolve: async (id, comment) => {
    const response = await axiosInstance.post(`/project-escalations/signals/${id}/resolve`, { comment });
    return response.data;
  },

  updateRule: async (code, payload) => {
    const response = await axiosInstance.put(`/project-escalations/rules/${encodeURIComponent(code)}`, payload);
    return response.data;
  },

  getNotificationSettings: async () => {
    const response = await axiosInstance.get('/project-escalations/settings/notifications');
    return response.data;
  },

  updateNotificationSettings: async (payload) => {
    const response = await axiosInstance.put('/project-escalations/settings/notifications', payload);
    return response.data;
  },

  evaluateNow: async () => {
    const response = await axiosInstance.post('/project-escalations/evaluate');
    return response.data;
  },
};

export default projectEscalationService;
