import axiosInstance from './axiosInstance';

const base = '/rri';

const rriService = {
  getDashboard: async () => {
    const { data } = await axiosInstance.get(`${base}/dashboard`);
    return data;
  },

  listProgrammes: async (filters = {}) => {
    const { data } = await axiosInstance.get(base, { params: filters });
    return data;
  },

  getProgramme: async (programmeId) => {
    const { data } = await axiosInstance.get(`${base}/${programmeId}`);
    return data;
  },

  createProgramme: async (payload) => {
    const { data } = await axiosInstance.post(base, payload);
    return data;
  },

  updateProgramme: async (programmeId, payload) => {
    const { data } = await axiosInstance.put(`${base}/${programmeId}`, payload);
    return data;
  },

  linkProject: async (programmeId, projectId, notes = '') => {
    const { data } = await axiosInstance.post(`${base}/${programmeId}/projects`, { projectId, notes });
    return data;
  },

  unlinkProject: async (programmeId, projectId) => {
    const { data } = await axiosInstance.delete(`${base}/${programmeId}/projects/${projectId}`);
    return data;
  },

  updateSiteProgress: async (programmeId, siteId, payload) => {
    const { data } = await axiosInstance.patch(`${base}/${programmeId}/sites/${siteId}`, payload);
    return data;
  },

  getBeneficiaries: async (programmeId, params = {}) => {
    const { data } = await axiosInstance.get(`${base}/${programmeId}/beneficiaries`, { params });
    return data;
  },

  downloadBeneficiaryImportTemplate: async (programmeId) => {
    const { data } = await axiosInstance.get(`${base}/${programmeId}/beneficiary-import-template`, { responseType: 'blob' });
    return data;
  },

  deleteProgramme: async (programmeId) => {
    const { data } = await axiosInstance.delete(`${base}/${programmeId}`);
    return data;
  },
};

export default rriService;
