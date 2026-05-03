// src/api/authService.js
import axiosInstance from './axiosInstance';

/**
 * @file API service for authentication and user profile related calls.
 * @description Contains methods for user login and fetching user profile.
 * Note: These routes (/auth/login, /auth/profile) need to be implemented
 * in your backend's authentication module.
 */

const authService = {
  /**
   * Authenticates a user with username and password.
   * @param {string} username - The user's username.
   * @param {string} password - The user's password.
   * @returns {Promise<Object>} The response data from the login endpoint (e.g., token, user info).
   */
  login: async (username, password) => {
    try {
      const response = await axiosInstance.post('/auth/login', { username, password });
      return response.data;
    } catch (error) {
      // Invalid credentials are expected sometimes; keep console clean.
      if (error?.status !== 400) {
        console.error('Error during login:', error);
      }
      throw error;
    }
  },

  /** Second step after POST /auth/login returned otpRequired: true */
  verifyLoginOtp: async (challengeId, code) => {
    try {
      const response = await axiosInstance.post('/auth/login/verify-otp', { challengeId, code });
      return response.data;
    } catch (error) {
      console.error('Error during OTP verification:', error);
      throw error;
    }
  },

  /**
   * Fetches the profile of the currently authenticated user.
   * @returns {Promise<Object>} The user's profile data.
   */
  getUserProfile: async () => {
    try {
      const response = await axiosInstance.get('/auth/profile');
      return response.data;
    } catch (error) {
      console.error('Error fetching user profile:', error);
      throw error;
    }
  },

  /**
   * Changes the password for the authenticated user.
   * @param {Object} passwordData - Object containing currentPassword and newPassword
   * @param {string} passwordData.currentPassword - The user's current password
   * @param {string} passwordData.newPassword - The new password
   * @returns {Promise<Object>} The response data from the change password endpoint
   */
  changePassword: async (passwordData) => {
    try {
      const response = await axiosInstance.post('/auth/change-password', {
        currentPassword: passwordData.currentPassword,
        newPassword: passwordData.newPassword,
      });
      return response.data;
    } catch (error) {
      console.error('Error changing password:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
      });
      throw error;
    }
  },

  /**
   * Requests a forgot-password reset email.
   * @param {string} email - User email address
   * @returns {Promise<Object>}
   */
  forgotPassword: async (email) => {
    try {
      const response = await axiosInstance.post('/auth/forgot-password', { email });
      return response.data;
    } catch (error) {
      console.error('Error requesting password reset:', error);
      throw error;
    }
  },

  /**
   * Fetch client session policy (e.g., idle timeout).
   * @returns {Promise<{idleTimeoutMinutes:number, source?:string}>}
   */
  getSessionPolicy: async () => {
    try {
      const response = await axiosInstance.get('/auth/session-policy');
      return response.data;
    } catch (error) {
      console.error('Error fetching session policy:', error);
      throw error;
    }
  },

  /**
   * Update idle timeout session policy (admin/super admin only).
   * @param {number} idleTimeoutMinutes
   * @returns {Promise<Object>}
   */
  updateSessionPolicy: async (idleTimeoutMinutes) => {
    try {
      const response = await axiosInstance.put('/auth/session-policy', { idleTimeoutMinutes });
      return response.data;
    } catch (error) {
      console.error('Error updating session policy:', error);
      throw error;
    }
  },
};

export default authService;
