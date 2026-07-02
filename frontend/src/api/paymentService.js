import axiosInstance from './axiosInstance';

/**
 * @file API service for Payment Request related calls.
 * @description This service handles CRUD operations for payment requests and their associated resources.
 */

const paymentService = {
  // --- Payment Request API Calls (project_payment_requests) ---

  /**
   * Fetches all payment requests for a specific project.
   * @param {number} projectId - The ID of the project.
   * @returns {Promise<Array>} A promise that resolves to an array of payment requests.
   */
  getRequestsForProject: async (projectId) => {
    const response = await axiosInstance.get(`/payment-requests/project/${projectId}`);
    return response.data;
  },

  /**
   * Submits a new payment request.
   * @param {object} requestData - The data for the new payment request.
   * @returns {Promise<object>} A promise that resolves to the new request's ID.
   */
  createRequest: async (requestData) => {
    const response = await axiosInstance.post('/payment-requests', requestData);
    return response.data;
  },

  /**
   * Records an approval action (Approve, Reject, etc.) for a payment request.
   * @param {number} requestId - The ID of the request to update.
   * @param {object} actionData - An object with the approval action, notes, and an optional assigned user ID.
   * @returns {Promise<object>} A promise that resolves to a success message.
   */
  recordApprovalAction: async (requestId, actionData) => {
    const response = await axiosInstance.put(`/payment-requests/${requestId}/action`, actionData);
    return response.data;
  },

  /**
   * Updates the status of a payment request.
   * @param {number} requestId - The ID of the request to update.
   * @param {object} statusData - An object with the new status.
   * @returns {Promise<object>} A promise that resolves to a success message.
   */
  updateStatus: async (requestId, statusData) => {
    const response = await axiosInstance.put(`/payment-requests/${requestId}/status`, statusData);
    return response.data;
  },

  /**
   * Fetches a single payment request with all its related details by its ID.
   * @param {number} requestId - The ID of the request to fetch.
   * @returns {Promise<object>} A promise that resolves to the request data.
   */
  getRequestById: async (requestId) => {
    const response = await axiosInstance.get(`/payment-requests/request/${requestId}`);
    return response.data;
  },

  /**
   * Fetches the approval history for a specific payment request.
   * @param {number} requestId - The ID of the request.
   * @returns {Promise<Array>} A promise that resolves to an array of history objects.
   */
  getPaymentApprovalHistory: async (requestId) => {
    const response = await axiosInstance.get(`/payment-requests/${requestId}/history`);
    return response.data;
  },
  
  /**
   * Fetches all defined approval levels.
   * @returns {Promise<Array>} A promise that resolves to an array of approval level objects.
   */
  getApprovalLevels: async () => {
    const response = await axiosInstance.get(`/approval-levels`);
    return response.data;
  },

  // --- Payment Request Milestone API Calls (payment_request_milestones) ---
  createMilestoneRecord: async (milestoneData) => {
    const response = await axiosInstance.post('/payment-requests/milestones', milestoneData);
    return response.data;
  },
  updateMilestoneRecord: async (milestoneId, milestoneData) => {
    const response = await axiosInstance.put(`/payment-requests/milestones/${milestoneId}`, milestoneData);
    return response.data;
  },
  deleteMilestoneRecord: async (milestoneId) => {
    const response = await axiosInstance.delete(`/payment-requests/milestones/${milestoneId}`);
    return response.data;
  },

  // --- Payment Details API Calls (payment_details) ---
  createPaymentDetails: async (requestId, paymentDetails) => {
    const response = await axiosInstance.post(`/payment-requests/${requestId}/payment-details`, paymentDetails);
    return response.data;
  },
  
  getPaymentDetails: async (requestId) => {
    const response = await axiosInstance.get(`/payment-requests/${requestId}/payment-details`);
    return response.data;
  },

  // --- Document API Calls (project_documents) ---
  createDocument: async (documentData) => {
    const response = await axiosInstance.post('/documents', documentData);
    return response.data;
  },
  updateDocument: async (documentId, documentData) => {
    const response = await axiosInstance.put(`/documents/${documentId}`, documentData);
    return response.data;
  },
  deleteDocument: async (documentId) => {
    const response = await axiosInstance.delete(`/documents/${documentId}`);
    return response.data;
  },
};

export default paymentService;