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
};

export default planningService;
