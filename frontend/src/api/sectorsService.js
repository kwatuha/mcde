import axiosInstance from './axiosInstance';

const sectorsService = {
  /**
   * Get all sectors
   */
  getAllSectors: async () => {
    try {
      const response = await axiosInstance.get('/sectors');
      return response.data || [];
    } catch (error) {
      console.error('Error fetching sectors:', error);
      throw error;
    }
  },

  /**
   * Get a single sector by ID
   */
  getSectorById: async (id) => {
    try {
      const response = await axiosInstance.get(`/sectors/${id}`);
      return response.data;
    } catch (error) {
      console.error(`Error fetching sector ${id}:`, error);
      throw error;
    }
  },

  /**
   * Create a new sector
   */
  createSector: async (sectorData) => {
    try {
      const response = await axiosInstance.post('/sectors', sectorData);
      return response.data;
    } catch (error) {
      console.error('Error creating sector:', error);
      throw error;
    }
  },

  /**
   * Update an existing sector
   */
  updateSector: async (id, sectorData) => {
    try {
      const response = await axiosInstance.put(`/sectors/${id}`, sectorData);
      return response.data;
    } catch (error) {
      console.error(`Error updating sector ${id}:`, error);
      throw error;
    }
  },

  /**
   * Delete a sector (soft delete)
   */
  deleteSector: async (id) => {
    try {
      const response = await axiosInstance.delete(`/sectors/${id}`);
      return response.data;
    } catch (error) {
      console.error(`Error deleting sector ${id}:`, error);
      throw error;
    }
  },
};

export default sectorsService;
