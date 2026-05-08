// src/api/participantService.js
import axiosInstance from './axiosInstance';

/**
 * @file API service for Participant & Study Data related calls.
 * @description Handles CRUD operations for study participants, now including pagination, sorting, and export.
 */

const participantService = {
  /**
   * @route POST /api/participants/study_participants/filtered
   * @description Get filtered, paginated, and sorted study participants from the studyparticipants table.
   * @param {Object} filters - Object containing filter criteria.
   * @param {number} page - The current page number (1-indexed).
   * @param {number} pageSize - The number of rows per page.
   * @param {string} orderBy - The column to sort by (camelCase).
   * @param {string} order - The sort order ('ASC' or 'DESC').
   * @returns {Promise<Object>} An object containing data array, totalCount, page, pageSize, totalPages.
   */
  getStudyParticipants: async (filters, page, pageSize, orderBy, order) => {
    try {
      const response = await axiosInstance.post('/participants/study_participants/filtered', {
        filters,
        page,
        pageSize,
        orderBy,
        order,
      });
      return response.data;
    } catch (error) {
      console.error('Error fetching study participants:', error);
      throw error;
    }
  },

  /**
   * @route GET /api/participants/study_participants/:individualId
   * @description Get a single study participant by individualId from the studyparticipants table.
   * @param {string|number} individualId - The ID of the individual participant.
   * @returns {Promise<Object>} The participant data.
   */
  getStudyParticipantById: async (individualId) => {
    try {
      const response = await axiosInstance.get(`/participants/study_participants/${individualId}`);
      return response.data;
    } catch (error) {
      console.error(`Error fetching study participant with ID ${individualId}:`, error);
      throw error;
    }
  },

  /**
   * @route POST /api/participants/study_participants
   * @description Create a new study participant in the studyparticipants table.
   * @param {Object} studyParticipantData - The data for the new participant.
   * @returns {Promise<Object>} The created participant data.
   */
  createStudyParticipant: async (studyParticipantData) => {
    try {
      const response = await axiosInstance.post('/participants/study_participants', studyParticipantData);
      return response.data;
    } catch (error) {
      console.error('Error creating study participant:', error);
      throw error;
    }
  },

  /**
   * @route PUT /api/participants/study_participants/:individualId
   * @description Update an existing study participant by individualId in the studyparticipants table.
   * @param {string|number} individualId - The ID of the individual participant to update.
   * @param {Object} studyParticipantData - The updated data for the participant.
   * @returns {Promise<Object>} The updated participant data.
   */
  updateStudyParticipant: async (individualId, studyParticipantData) => {
    try {
      const response = await axiosInstance.put(`/participants/study_participants/${individualId}`, studyParticipantData);
      return response.data;
    } catch (error) {
      console.error(`Error updating study participant with ID ${individualId}:`, error);
      throw error;
    }
  },

  /**
   * @route DELETE /api/participants/study_participants/:individualId
   * @description Delete a study participant by individualId from the studyparticipants table.
   * @param {string|number} individualId - The ID of the individual participant to delete.
   * @returns {Promise<Object>} The response from the delete operation.
   */
  deleteStudyParticipant: async (individualId) => {
    try {
      const response = await axiosInstance.delete(`/participants/study_participants/${individualId}`);
      return response.data;
    } catch (error) {
      console.error(`Error deleting study participant with ID ${individualId}:`, error);
      throw error;
    }
  },

  /**
   * @route POST /api/participants/study_participants/export/excel
   * @description Export filtered study participant data to an Excel file.
   * @param {Object} filters - Object containing filter criteria.
   * @param {Object} excelHeadersMapping - Mapping of data keys to Excel column headers.
   * @param {string} orderBy - The column to sort by (camelCase).
   * @param {string} order - The sort order ('ASC' or 'DESC').
   * @returns {Promise<Blob>} The Excel file as a Blob.
   */
  exportStudyParticipantsToExcel: async (filters, excelHeadersMapping, orderBy, order) => {
    try {
      const response = await axiosInstance.post('/participants/study_participants/export/excel', {
        filters,
        excelHeadersMapping,
        orderBy,
        order,
      }, {
        responseType: 'blob', // Important for file downloads
      });
      return response.data;
    } catch (error) {
      console.error('Error exporting study participants to Excel:', error);
      throw error;
    }
  },

  /**
   * @route POST /api/participants/study_participants/export/pdf
   * @description Export filtered study participant data (HTML table) to a PDF file.
   * @param {Object} filters - Object containing filter criteria.
   * @param {string} tableHtml - HTML string of the table to export.
   * @param {string} orderBy - The column to sort by (camelCase).
   * @param {string} order - The sort order ('ASC' or 'DESC').
   * @returns {Promise<Blob>} The PDF file as a Blob.
   */
  exportStudyParticipantsToPdf: async (filters, tableHtml, orderBy, order) => {
    try {
      const response = await axiosInstance.post('/participants/study_participants/export/pdf', {
        filters,
        tableHtml,
        orderBy,
        order,
      }, {
        responseType: 'blob', // Important for file downloads
      });
      return response.data;
    } catch (error) {
      console.error('Error exporting study participants to PDF:', error);
      throw error;
    }
  },

  // --- Import Methods ---
  previewParticipantImport: async (formData) => {
    try {
      const response = await axiosInstance.post('/participants/import-data', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      return response.data;
    } catch (error) {
      console.error('Error previewing participant data:', error);
      throw error;
    }
  },
  confirmParticipantImport: async (importData) => {
    try {
      const response = await axiosInstance.post('/participants/confirm-import-data', importData);
      return response.data;
    } catch (error) {
      console.error('Error confirming participant data import:', error);
      throw error;
    }
  },
  downloadParticipantTemplate: async () => {
    try {
      const response = await axiosInstance.get('/participants/template', {
        responseType: 'blob'
      });
      return response.data;
    } catch (error) {
      console.error('Error downloading participant template:', error);
      throw error;
    }
  },
};

export default participantService;
