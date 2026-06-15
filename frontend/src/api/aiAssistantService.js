import axiosInstance from './axiosInstance';

const aiAssistantService = {
  getStatus: async () => {
    const response = await axiosInstance.get('/ai-assistant/status');
    return response.data;
  },

  sendMessage: async ({ messages, context }) => {
    const response = await axiosInstance.post('/ai-assistant/chat', {
      messages,
      context,
    });
    return response.data;
  },

  getUsage: async (filters = {}) => {
    const response = await axiosInstance.get('/ai-assistant/usage', { params: filters });
    return response.data;
  },

  generateReport: async ({ prompt, reportType, output, context }) => {
    const response = await axiosInstance.post('/ai-assistant/report', {
      prompt,
      reportType,
      output,
      context,
    }, {
      responseType: 'blob',
    });
    return response;
  },
};

export default aiAssistantService;
