import axiosInstance from './axiosInstance';

/**
 * @file API service for managing approval hierarchies and levels.
 * @description This service handles CRUD operations for the multi-stage approval workflow.
 */
const approvalService = {

  // --- Approval Levels API Calls (payment_approval_levels) ---

  /**
   * Fetches all defined approval levels.
   * @returns {Promise<Array>} A promise that resolves to an array of approval level objects.
   */
  getApprovalLevels: async () => {
    const response = await axiosInstance.get('/approval-levels');
    return response.data;
  },

  /**
   * Creates a new approval level.
   * @param {object} levelData - An object containing levelName, roleId, and approvalOrder.
   * @returns {Promise<object>} A promise that resolves to the new level's ID.
   */
  createApprovalLevel: async (levelData) => {
    const response = await axiosInstance.post('/approval-levels', levelData);
    return response.data;
  },

  /**
   * Updates an existing approval level.
   * @param {number} levelId - The ID of the approval level to update.
   * @param {object} levelData - The updated level data.
   * @returns {Promise<object>} A promise that resolves to a success message.
   */
  updateApprovalLevel: async (levelId, levelData) => {
    const response = await axiosInstance.put(`/approval-levels/${levelId}`, levelData);
    return response.data;
  },

  /**
   * Deletes an approval level.
   * @param {number} levelId - The ID of the level to delete.
   * @returns {Promise<object>} A promise that resolves to a success message.
   */
  deleteApprovalLevel: async (levelId) => {
    const response = await axiosInstance.delete(`/approval-levels/${levelId}`);
    return response.data;
  },
  
  // --- Payment Status Definitions API Calls (payment_status_definitions) ---

  /**
   * Fetches all defined payment status definitions.
   * @returns {Promise<Array>} A promise that resolves to an array of status definition objects.
   */
  getPaymentStatusDefinitions: async () => {
    const response = await axiosInstance.get('/payment-status');
    return response.data;
  },

  /**
   * Creates a new payment status definition.
   * @param {object} statusData - An object containing statusName and an optional description.
   * @returns {Promise<object>} A promise that resolves to the new status ID.
   */
  createPaymentStatusDefinition: async (statusData) => {
    const response = await axiosInstance.post('/payment-status', statusData);
    return response.data;
  },

  /**
   * Updates an existing payment status definition.
   * @param {number} statusId - The ID of the status to update.
   * @param {object} statusData - The updated status data.
   * @returns {Promise<object>} A promise that resolves to a success message.
   */
  updatePaymentStatusDefinition: async (statusId, statusData) => {
    const response = await axiosInstance.put(`/payment-status/${statusId}`, statusData);
    return response.data;
  },

  /**
   * Deletes a payment status definition.
   * @param {number} statusId - The ID of the status to delete.
   * @returns {Promise<object>} A promise that resolves to a success message.
   */
  deletePaymentStatusDefinition: async (statusId) => {
    const response = await axiosInstance.delete(`/payment-status/${statusId}`);
    return response.data;
  },
};

export default approvalService;