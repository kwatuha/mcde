import axiosInstance from './axiosInstance';

const myTasksService = {
  list: async (opts = {}) => {
    const { data } = await axiosInstance.get('/my-tasks', { params: opts });
    return data;
  },
};

export default myTasksService;
