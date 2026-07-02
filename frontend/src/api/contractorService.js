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
  downloadImportTemplate: async () => {
    const { data, headers } = await axiosInstance.get('/contractors/import-template', {
      responseType: 'blob',
    });
    const cd = headers?.['content-disposition'] || '';
    const match = cd.match(/filename="?([^"]+)"?/i);
    return { blob: data, fileName: match?.[1] || 'contractor_import_template.xlsx' };
  },
  previewImport: async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    const { data } = await axiosInstance.post('/contractors/import/preview', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return data;
  },
  confirmImport: async (rows) => {
    const { data } = await axiosInstance.post('/contractors/import/confirm', { rows });
    return data;
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
  createPaymentRequest: async (contractorId, payload) => {
    const response = await axiosInstance.post(`/contractors/${contractorId}/payment-requests`, payload);
    return response.data;
  },
  getMyProfile: async () => {
    const response = await axiosInstance.get('/contractors/me/profile');
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

  getProjectFileChecklist: async (contractorId, projectId) => {
    const response = await axiosInstance.get(
      `/contractors/${contractorId}/projects/${projectId}/file-checklist`
    );
    return response.data;
  },
  uploadChecklistDocument: async (contractorId, projectId, itemId, formData) => {
    const response = await axiosInstance.post(
      `/contractors/${contractorId}/projects/${projectId}/file-checklist/items/${itemId}/upload`,
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } }
    );
    return response.data;
  },
  
  // linkToUser removed: contractor_users table no longer exists
};

export default contractorService;