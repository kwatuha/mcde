// src/api/kenyaWardsService.js
import axiosInstance from './axiosInstance';

/**
 * @file API service for Kenya Wards related calls.
 * @description Handles fetching counties, constituencies, and wards from kenya_wards table.
 */

const kenyaWardsService = {
  /**
   * Get all distinct counties from kenya_wards table
   * @returns {Promise<Array<string>>} Array of county names
   */
  getCounties: async () => {
    try {
      const response = await axiosInstance.get('/kenya-wards/counties');
      return response.data.data || [];
    } catch (error) {
      console.error('Error fetching counties:', error);
      throw error;
    }
  },

  /**
   * Get distinct constituencies for a given county
   * @param {string} county - County name
   * @returns {Promise<Array<string>>} Array of constituency names
   */
  getConstituenciesByCounty: async (county) => {
    try {
      const response = await axiosInstance.get('/kenya-wards/constituencies', {
        params: county ? { county } : {},
      });
      return response.data.data || [];
    } catch (error) {
      console.error('Error fetching constituencies:', error);
      throw error;
    }
  },

  /**
   * Get distinct wards for a given constituency
   * @param {string} constituency - Constituency name
   * @returns {Promise<Array<{id: number, name: string, pcode: string}>>} Array of ward objects
   */
  getWardsByConstituency: async (constituency) => {
    try {
      if (!constituency) {
        return [];
      }
      const response = await axiosInstance.get('/kenya-wards/wards', {
        params: { constituency }
      });
      return response.data.data || [];
    } catch (error) {
      console.error('Error fetching wards:', error);
      throw error;
    }
  },

  /**
   * Distinct sub-counties for the API county scope (kenya_wards reference).
   * @param {string|null|undefined} county - Optional county name when county scope is disabled.
   * @returns {Promise<string[]>}
   */
  getSubcounties: async (county) => {
    try {
      const params = {};
      const c = county != null ? String(county).trim() : '';
      if (c) params.county = c;
      const response = await axiosInstance.get('/kenya-wards/subcounties', { params });
      return response.data.data || [];
    } catch (error) {
      console.error('Error fetching sub-counties:', error);
      throw error;
    }
  },

  /**
   * Wards in scope; pass subcounty to restrict to that sub-county (cascading dropdowns).
   * @param {string|null|undefined} subcounty - Empty/null = all wards in county scope
   * @returns {Promise<Array<{ id: number, name: string, pcode: string }>>}
   */
  getWardsBySubcounty: async (subcounty) => {
    try {
      const params = {};
      const s = subcounty != null ? String(subcounty).trim() : '';
      if (s) params.subcounty = s;
      const response = await axiosInstance.get('/kenya-wards/wards-by-subcounty', { params });
      return response.data.data || [];
    } catch (error) {
      console.error('Error fetching wards by sub-county:', error);
      throw error;
    }
  },
};

export default kenyaWardsService;
