import axiosInstance from './axiosInstance';

const base = '/approval-workflow';

const approvalWorkflowService = {
  listDefinitions: async (entityType) => {
    const params = entityType ? { entityType } : {};
    const { data } = await axiosInstance.get(`${base}/definitions`, { params });
    return data;
  },

  getDefinition: async (definitionId) => {
    const { data } = await axiosInstance.get(`${base}/definitions/${definitionId}`);
    return data;
  },

  getActiveDefinition: async (entityType, code = 'default') => {
    const { data } = await axiosInstance.get(`${base}/definitions/active/${entityType}`, {
      params: { code },
    });
    return data;
  },

  createDefinition: async (body) => {
    const { data } = await axiosInstance.post(`${base}/definitions`, body);
    return data;
  },

  seedAnnualWorkplan: async () => {
    const { data } = await axiosInstance.post(`${base}/seed/annual-workplan`);
    return data;
  },

  seedPaymentRequest: async () => {
    const { data } = await axiosInstance.post(`${base}/seed/payment-request`);
    return data;
  },

  startRequest: async (body) => {
    const { data } = await axiosInstance.post(`${base}/requests/start`, body);
    return data;
  },

  getByEntity: async (entityType, entityId) => {
    const { data } = await axiosInstance.get(`${base}/requests/by-entity/${entityType}/${entityId}`);
    return data;
  },

  getRequest: async (requestId) => {
    const { data } = await axiosInstance.get(`${base}/requests/${requestId}`);
    return data;
  },

  approve: async (requestId, comment) => {
    const { data } = await axiosInstance.post(`${base}/requests/${requestId}/approve`, { comment });
    return data;
  },

  reject: async (requestId, comment) => {
    const { data } = await axiosInstance.post(`${base}/requests/${requestId}/reject`, { comment });
    return data;
  },

  listPendingForMe: async () => {
    const { data } = await axiosInstance.get(`${base}/requests/pending-me`);
    return data;
  },

  processSla: async () => {
    const { data } = await axiosInstance.post(`${base}/sla/process`);
    return data;
  },
};

export default approvalWorkflowService;
