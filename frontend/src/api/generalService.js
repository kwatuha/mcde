// src/api/generalService.js
import axiosInstance from './axiosInstance';

/**
 * @file API service for General Attachments & SMS related calls.
 * @description Handles CRUD operations for general attachments and sent SMS statuses.
 */

const generalService = {
  // --- Attachments (attachments) ---
  getAttachments: async () => {
    try {
      const response = await axiosInstance.get('/general/attachments');
      return response.data;
    } catch (error) {
      console.error('Error fetching attachments:', error);
      throw error;
    }
  },

  getAttachmentById: async (attachmentId) => {
    try {
      const response = await axiosInstance.get(`/general/attachments/${attachmentId}`);
      return response.data;
    } catch (error) {
      console.error(`Error fetching attachment with ID ${attachmentId}:`, error);
      throw error;
    }
  },

  createAttachment: async (attachmentData) => {
    try {
      const response = await axiosInstance.post('/general/attachments', attachmentData);
      return response.data;
    } catch (error) {
      console.error('Error creating attachment:', error);
      throw error;
    }
  },

  updateAttachment: async (attachmentId, attachmentData) => {
    try {
      const response = await axiosInstance.put(`/general/attachments/${attachmentId}`, attachmentData);
      return response.data;
    } catch (error) {
      console.error(`Error updating attachment with ID ${attachmentId}:`, error);
      throw error;
    }
  },

  deleteAttachment: async (attachmentId) => {
    try {
      const response = await axiosInstance.delete(`/general/attachments/${attachmentId}`);
      return response.data;
    } catch (error) {
      console.error(`Error deleting attachment with ID ${attachmentId}:`, error);
      throw error;
    }
  },

  // --- Sent SMS Status (sentsmsstatus) ---
  getSentSmsStatuses: async () => {
    try {
      const response = await axiosInstance.get('/general/sent_sms_status');
      return response.data;
    } catch (error) {
      console.error('Error fetching sent SMS statuses:', error);
      throw error;
    }
  },

  getSentSmsStatusById: async (statusId) => {
    try {
      const response = await axiosInstance.get(`/general/sent_sms_status/${statusId}`);
      return response.data;
    } catch (error) {
      console.error(`Error fetching sent SMS status with ID ${statusId}:`, error);
      throw error;
    }
  },

  createSentSmsStatus: async (smsStatusData) => {
    try {
      const response = await axiosInstance.post('/general/sent_sms_status', smsStatusData);
      return response.data;
    } catch (error) {
      console.error('Error creating sent SMS status:', error);
      throw error;
    }
  },

  updateSentSmsStatus: async (statusId, smsStatusData) => {
    try {
      const response = await axiosInstance.put(`/general/sent_sms_status/${statusId}`, smsStatusData);
      return response.data;
    } catch (error) {
      console.error(`Error updating sent SMS status with ID ${statusId}:`, error);
      throw error;
    }
  },

  deleteSentSmsStatus: async (statusId) => {
    try {
      const response = await axiosInstance.delete(`/general/sent_sms_status/${statusId}`);
      return response.data;
    } catch (error) {
      console.error(`Error deleting sent SMS status with ID ${statusId}:`, error);
      throw error;
    }
  },
};

export default generalService;
