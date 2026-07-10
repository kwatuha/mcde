import axiosInstance from './axiosInstance';

const clientProjectImportService = {
  listBatches: async () => {
    const response = await axiosInstance.get('/client-project-import/batches');
    return response.data?.batches || [];
  },

  getSummary: async (batch) => {
    const response = await axiosInstance.get(`/client-project-import/batches/${encodeURIComponent(batch)}/summary`);
    return response.data;
  },

  listRows: async (batch, params = {}) => {
    const response = await axiosInstance.get(`/client-project-import/batches/${encodeURIComponent(batch)}/rows`, { params });
    return response.data;
  },

  exportExcel: async (batch, params = {}) => {
    const response = await axiosInstance.get(`/client-project-import/batches/${encodeURIComponent(batch)}/export`, {
      params,
      responseType: 'blob',
    });
    return response;
  },

  getInsertReadyCount: async (batch) => {
    const response = await axiosInstance.get(`/client-project-import/batches/${encodeURIComponent(batch)}/insert-ready-count`);
    return response.data?.count ?? 0;
  },

  applyInsert: async (batch, payload = {}) => {
    const response = await axiosInstance.post(
      `/client-project-import/batches/${encodeURIComponent(batch)}/apply-insert`,
      payload,
      { timeout: 600000 },
    );
    return response.data;
  },

  listDemoProjects: async (params = {}) => {
    const response = await axiosInstance.get('/client-project-import/demo-projects', { params });
    return response.data;
  },

  getDemoSummary: async () => {
    const response = await axiosInstance.get('/client-project-import/demo-projects/summary');
    return response.data;
  },

  voidDemoProjects: async (payload = {}) => {
    const response = await axiosInstance.post('/client-project-import/demo-projects/void', payload, {
      timeout: 600000,
    });
    return response.data;
  },

  refreshMetadata: async (batch) => {
    const response = await axiosInstance.post(
      `/client-project-import/batches/${encodeURIComponent(batch)}/refresh-metadata`,
    );
    return response.data;
  },

  listMetadataSuggestions: async (batch) => {
    const response = await axiosInstance.get(
      `/client-project-import/batches/${encodeURIComponent(batch)}/metadata-suggestions`,
    );
    return response.data;
  },

  saveMetadataResolutions: async (batch, resolutions) => {
    const response = await axiosInstance.post(
      `/client-project-import/batches/${encodeURIComponent(batch)}/metadata-resolutions`,
      { resolutions },
    );
    return response.data;
  },
};

export default clientProjectImportService;
