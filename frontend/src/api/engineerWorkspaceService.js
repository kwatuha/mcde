import axiosInstance from './axiosInstance';

const engineerWorkspaceService = {
  getWorkspace: async (params = {}) => {
    const { data } = await axiosInstance.get('/engineer/workspace', { params });
    return data;
  },
  getProgressPhotos: async (params = {}) => {
    const { data } = await axiosInstance.get('/engineer/workspace/progress-photos', { params });
    return data;
  },
};

export default engineerWorkspaceService;
