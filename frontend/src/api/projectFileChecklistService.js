import axiosInstance from './axiosInstance';

const projectFileChecklistService = {
  getChecklist: async (projectId) => {
    const response = await axiosInstance.get(`/projects/${projectId}/file-checklist`);
    return response.data;
  },
  updateItem: async (projectId, itemId, payload) => {
    const response = await axiosInstance.patch(
      `/projects/${projectId}/file-checklist/items/${itemId}`,
      payload
    );
    return response.data;
  },
  linkDocument: async (projectId, itemId, documentId) => {
    const response = await axiosInstance.post(
      `/projects/${projectId}/file-checklist/items/${itemId}/link`,
      { documentId }
    );
    return response.data;
  },
  unlinkDocument: async (projectId, linkId) => {
    const response = await axiosInstance.delete(
      `/projects/${projectId}/file-checklist/links/${linkId}`
    );
    return response.data;
  },
  downloadAuditPdf: async (projectId) => {
    const response = await axiosInstance.get(`/projects/${projectId}/file-checklist/audit-pdf`, {
      responseType: 'blob',
    });
    return response.data;
  },
};

export default projectFileChecklistService;
