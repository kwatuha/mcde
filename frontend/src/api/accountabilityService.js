import axiosInstance from './axiosInstance';

const accountabilityService = {
  getProjectsByDepartmentSummary: async () => {
    const { data } = await axiosInstance.get('/accountability/projects-by-department');
    return data;
  },

  getProjectsByDepartment: async (department) => {
    const { data } = await axiosInstance.get('/accountability/projects-by-department/projects', {
      params: { department },
    });
    return data;
  },
};

export default accountabilityService;
