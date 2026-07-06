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
};

export default clientProjectImportService;
