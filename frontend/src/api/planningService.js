import axiosInstance from './axiosInstance';

const base = '/planning';

const planningService = {
  getCidpPillars: async () => {
    const { data } = await axiosInstance.get(`${base}/cidp-pillars`);
    return data;
  },
  createCidpPillar: async (payload) => {
    const { data } = await axiosInstance.post(`${base}/cidp-pillars`, payload);
    return data;
  },
  updateCidpPillar: async (id, payload) => {
    const { data } = await axiosInstance.put(`${base}/cidp-pillars/${id}`, payload);
    return data;
  },
  deleteCidpPillar: async (id) => {
    const { data } = await axiosInstance.delete(`${base}/cidp-pillars/${id}`);
    return data;
  },
  getCidpPeriods: async () => {
    const { data } = await axiosInstance.get(`${base}/cidp-periods`);
    return data;
  },
  createCidpPeriod: async (payload) => {
    const { data } = await axiosInstance.post(`${base}/cidp-periods`, payload);
    return data;
  },
  updateCidpPeriod: async (id, payload) => {
    const { data } = await axiosInstance.put(`${base}/cidp-periods/${id}`, payload);
    return data;
  },
  deleteCidpPeriod: async (id) => {
    const { data } = await axiosInstance.delete(`${base}/cidp-periods/${id}`);
    return data;
  },
  getAdpPeriods: async () => {
    const { data } = await axiosInstance.get(`${base}/adp-periods`);
    return data;
  },
  createAdpPeriod: async (payload) => {
    const { data } = await axiosInstance.post(`${base}/adp-periods`, payload);
    return data;
  },
  updateAdpPeriod: async (id, payload) => {
    const { data } = await axiosInstance.put(`${base}/adp-periods/${id}`, payload);
    return data;
  },
  deleteAdpPeriod: async (id) => {
    const { data } = await axiosInstance.delete(`${base}/adp-periods/${id}`);
    return data;
  },
  getProgrammes: async () => {
    const { data } = await axiosInstance.get(`${base}/programmes`);
    return data;
  },
  createProgramme: async (payload) => {
    const { data } = await axiosInstance.post(`${base}/programmes`, payload);
    return data;
  },
  updateProgramme: async (id, payload) => {
    const { data } = await axiosInstance.put(`${base}/programmes/${id}`, payload);
    return data;
  },
  deleteProgramme: async (id) => {
    const { data } = await axiosInstance.delete(`${base}/programmes/${id}`);
    return data;
  },
  getPlanningSectors: async () => {
    const { data } = await axiosInstance.get(`${base}/sectors`);
    return data;
  },
  getBudgetAllocations: async (params = {}) => {
    const { data } = await axiosInstance.get(`${base}/budget-allocations`, { params });
    return data;
  },
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
