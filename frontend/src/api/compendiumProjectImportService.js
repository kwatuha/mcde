import axiosInstance from './axiosInstance';

const compendiumProjectImportService = {
  listBatches: async () => {
    const response = await axiosInstance.get('/compendium-project-import/batches');
    return response.data?.batches || [];
  },

  getSummary: async (batch) => {
    const response = await axiosInstance.get(`/compendium-project-import/batches/${encodeURIComponent(batch)}/summary`);
    return response.data;
  },

  listRows: async (batch, params = {}) => {
    const response = await axiosInstance.get(`/compendium-project-import/batches/${encodeURIComponent(batch)}/rows`, { params });
    return response.data;
  },

  exportExcel: async (batch, params = {}) => {
    const response = await axiosInstance.get(`/compendium-project-import/batches/${encodeURIComponent(batch)}/export`, {
      params,
      responseType: 'blob',
    });
    return response;
  },

  getInsertReadyCount: async (batch) => {
    const response = await axiosInstance.get(`/compendium-project-import/batches/${encodeURIComponent(batch)}/insert-ready-count`);
    return response.data?.count ?? 0;
  },

  applyInsert: async (batch, payload = {}) => {
    const response = await axiosInstance.post(
      `/compendium-project-import/batches/${encodeURIComponent(batch)}/apply-insert`,
      payload,
      { timeout: 600000 },
    );
    return response.data;
  },
};

export default compendiumProjectImportService;
