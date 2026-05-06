import axiosInstance from './axiosInstance';

const base = '/planning';

const planningService = {
  getMeasurementTypes: async () => {
    const { data } = await axiosInstance.get(`${base}/measurement-types`);
    return data;
  },
  createMeasurementType: async (payload) => {
    const { data } = await axiosInstance.post(`${base}/measurement-types`, payload);
    return data;
  },
  updateMeasurementType: async (id, payload) => {
    const { data } = await axiosInstance.put(`${base}/measurement-types/${id}`, payload);
    return data;
  },
  deleteMeasurementType: async (id) => {
    const { data } = await axiosInstance.delete(`${base}/measurement-types/${id}`);
    return data;
  },
  getIndicators: async () => {
    const { data } = await axiosInstance.get(`${base}/indicators`);
    return data;
  },
  createIndicator: async (payload) => {
    const { data } = await axiosInstance.post(`${base}/indicators`, payload);
    return data;
  },
  updateIndicator: async (id, payload) => {
    const { data } = await axiosInstance.put(`${base}/indicators/${id}`, payload);
    return data;
  },
  deleteIndicator: async (id) => {
    const { data } = await axiosInstance.delete(`${base}/indicators/${id}`);
    return data;
  },
  getProjectActivities: async () => {
    const { data } = await axiosInstance.get(`${base}/project-activities`);
    return data;
  },
  createProjectActivity: async (payload) => {
    const { data } = await axiosInstance.post(`${base}/project-activities`, payload);
    return data;
  },
  updateProjectActivity: async (id, payload) => {
    const { data } = await axiosInstance.put(`${base}/project-activities/${id}`, payload);
    return data;
  },
  deleteProjectActivity: async (id) => {
    const { data } = await axiosInstance.delete(`${base}/project-activities/${id}`);
    return data;
  },
  getProjectRisks: async () => {
    const { data } = await axiosInstance.get(`${base}/project-risks`);
    return data;
  },
  createProjectRisk: async (payload) => {
    const { data } = await axiosInstance.post(`${base}/project-risks`, payload);
    return data;
  },
  updateProjectRisk: async (id, payload) => {
    const { data } = await axiosInstance.put(`${base}/project-risks/${id}`, payload);
    return data;
  },
  deleteProjectRisk: async (id) => {
    const { data } = await axiosInstance.delete(`${base}/project-risks/${id}`);
    return data;
  },
  getReportingFrequencies: async () => {
    const { data } = await axiosInstance.get(`${base}/reporting-frequencies`);
    return data;
  },
  createReportingFrequency: async (payload) => {
    const { data } = await axiosInstance.post(`${base}/reporting-frequencies`, payload);
    return data;
  },
  updateReportingFrequency: async (id, payload) => {
    const { data } = await axiosInstance.put(`${base}/reporting-frequencies/${id}`, payload);
    return data;
  },
  deleteReportingFrequency: async (id) => {
    const { data } = await axiosInstance.delete(`${base}/reporting-frequencies/${id}`);
    return data;
  },
};

export default planningService;
