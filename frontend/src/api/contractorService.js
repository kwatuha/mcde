// src/api/contractorService.js
import axiosInstance from './axiosInstance';

/**
 * @file API service for Contractor Management related calls.
 * @description This service handles all operations for contractors, including their assigned projects,
 * photos, and payment requests.
 */

const contractorService = {
  // --- Contractor Management API Calls (contractors) ---
  getAllContractors: async () => {
    const response = await axiosInstance.get('/contractors');
    return response.data;
  },
  getContractorById: async (contractorId) => {
    const response = await axiosInstance.get(`/contractors/${contractorId}`);
    return response.data;
  },
  createContractor: async (contractorData) => {
    const response = await axiosInstance.post('/contractors', contractorData);
    return response.data;
  },
  updateContractor: async (contractorId, contractorData) => {
    const response = await axiosInstance.put(`/contractors/${contractorId}`, contractorData);
    return response.data;
  },
  deleteContractor: async (contractorId) => {
    const response = await axiosInstance.delete(`/contractors/${contractorId}`);
    return response.data;
  },
  getContractorTypes: async () => {
    const response = await axiosInstance.get('/contractors/types');
    return response.data;
  },
  createContractorType: async (payload) => {
    const response = await axiosInstance.post('/contractors/types', payload);
    return response.data;
  },
  updateContractorType: async (contractorTypeId, payload) => {
    const response = await axiosInstance.put(`/contractors/types/${contractorTypeId}`, payload);
    return response.data;
  },
  deleteContractorType: async (contractorTypeId) => {
    const response = await axiosInstance.delete(`/contractors/types/${contractorTypeId}`);
    return response.data;
  },
  
  // --- Project, Payment, and Photo Retrieval for a Contractor ---
  getProjectsByContractor: async (contractorId) => {
    const response = await axiosInstance.get(`/contractors/${contractorId}/projects`);
    return response.data;
  },
  getPaymentRequestsByContractor: async (contractorId) => {
    const response = await axiosInstance.get(`/contractors/${contractorId}/payment-requests`);
    return response.data;
  },
  getPhotosByContractor: async (contractorId) => {
    const response = await axiosInstance.get(`/contractors/${contractorId}/photos`);
    return response.data;
  },
  
  // --- Photo Upload for Contractor Dashboard ---
  uploadPhoto: async (contractorId, formData) => {
    const response = await axiosInstance.post(`/contractors/${contractorId}/photos`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },
  
  // linkToUser removed: contractor_users table no longer exists
};

export default contractorService;