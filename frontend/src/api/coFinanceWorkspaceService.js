import axiosInstance from './axiosInstance';

const coFinanceWorkspaceService = {
  getWorkspace: async (params = {}) => {
    const { data } = await axiosInstance.get('/co-finance/workspace', { params });
    return data;
  },
};

export default coFinanceWorkspaceService;
