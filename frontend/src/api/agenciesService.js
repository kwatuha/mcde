// src/api/agenciesService.js
import axiosInstance from './axiosInstance';

/**
 * @file API service for Agencies related calls.
 * @description Handles fetching agencies from agencies table.
 */

const agenciesService = {
  /**
   * Get all agencies (paginated)
   * @param {Object} params - Query parameters (page, limit, search)
   * @returns {Promise<Object>} Object with data and pagination info
   */
  getAgencies: async (params = {}) => {
    try {
      const response = await axiosInstance.get('/agencies', { params });
      return response.data;
    } catch (error) {
      console.error('Error fetching agencies:', error);
      throw error;
    }
  },

  /**
   * Get all agencies for dropdown (no pagination, limited to 1000)
   * @param {string} search - Optional search term
   * @returns {Promise<Array>} Array of agency objects
   */
  getAllAgencies: async (search = '') => {
    try {
      const response = await axiosInstance.get('/agencies', {
        params: {
          limit: 1000,
          page: 1,
          search
        }
      });
      return response.data.data || [];
    } catch (error) {
      console.error('Error fetching all agencies:', error);
      throw error;
    }
  },

  /**
   * Get a single agency by ID
   * @param {number} id - Agency ID
   * @returns {Promise<Object>} Agency object
   */
  getAgencyById: async (id) => {
    try {
      const response = await axiosInstance.get(`/agencies/${id}`);
      return response.data;
    } catch (error) {
      console.error('Error fetching agency:', error);
      throw error;
    }
  },
};

export default agenciesService;
