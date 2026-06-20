import axiosInstance from './axiosInstance';

const beneficiaryService = {
  getTypes: async () => {
    const { data } = await axiosInstance.get('/beneficiaries/types');
    return data;
  },

  getFilterOptions: async () => {
    const { data } = await axiosInstance.get('/beneficiaries/filter-options');
    return data;
  },

  list: async (filters, page, pageSize, orderBy, order) => {
    const { data } = await axiosInstance.post('/beneficiaries/filtered', {
      filters,
      page,
      pageSize,
      orderBy,
      order,
    });
    return data;
  },

  downloadTemplate: async () => {
    const { data } = await axiosInstance.get('/beneficiaries/template', { responseType: 'blob' });
    return data;
  },

  downloadKalamaRriSample: async () => {
    const { data } = await axiosInstance.get('/beneficiaries/import-sample/kalama-rri', { responseType: 'blob' });
    return data;
  },

  previewImport: async (formData) => {
    const { data } = await axiosInstance.post('/beneficiaries/import-data', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return data;
  },

  confirmImport: async (importData) => {
    const { data } = await axiosInstance.post('/beneficiaries/confirm-import-data', importData);
    return data;
  },

  create: async (payload) => {
    const { data } = await axiosInstance.post('/beneficiaries', payload);
    return data;
  },

  update: async (beneficiaryId, payload) => {
    const { data } = await axiosInstance.put(`/beneficiaries/${beneficiaryId}`, payload);
    return data;
  },

  getById: async (beneficiaryId) => {
    const { data } = await axiosInstance.get(`/beneficiaries/${beneficiaryId}`);
    return data;
  },

  delete: async (beneficiaryId) => {
    const { data } = await axiosInstance.delete(`/beneficiaries/${beneficiaryId}`);
    return data;
  },

  // Backward-compatible aliases used by legacy participantService callers
  getStudyParticipants: async (filters, page, pageSize, orderBy, order) => {
    return beneficiaryService.list(filters, page, pageSize, orderBy, order);
  },
  previewParticipantImport: async (formData) => beneficiaryService.previewImport(formData),
  confirmParticipantImport: async (importData) => beneficiaryService.confirmImport(importData),
  downloadParticipantTemplate: async () => beneficiaryService.downloadTemplate(),
};

export default beneficiaryService;
