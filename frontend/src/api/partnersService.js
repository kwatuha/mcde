import axiosInstance from './axiosInstance';

const partnersService = {
  listPartners: async () => {
    const response = await axiosInstance.get('/partners');
    return response.data;
  },
  createPartner: async (body) => {
    const response = await axiosInstance.post('/partners', body);
    return response.data;
  },
  updatePartner: async (id, body) => {
    const response = await axiosInstance.put(`/partners/${id}`, body);
    return response.data;
  },
  deletePartner: async (id) => {
    const response = await axiosInstance.delete(`/partners/${id}`);
    return response.data;
  },
};

export default partnersService;
