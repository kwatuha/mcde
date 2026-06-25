import axiosInstance from './axiosInstance';

/**
 * Budget Service
 * Handles all API calls related to approved budgets
 */
class BudgetService {
  /**
   * Get all budgets with optional filters
   */
  async getBudgets(filters = {}) {
    try {
      const response = await axiosInstance.get('/budgets', { params: filters });
      return response.data;
    } catch (error) {
      console.error('Error fetching budgets:', error);
      throw error;
    }
  }

  /**
   * Get a single budget by ID
   */
  async getBudgetById(budgetId) {
    try {
      const response = await axiosInstance.get(`/budgets/${budgetId}`);
      return response.data;
    } catch (error) {
      console.error('Error fetching budget:', error);
      throw error;
    }
  }

  /**
   * Create a new budget
   */
  async createBudget(budgetData) {
    try {
      const response = await axiosInstance.post('/budgets', budgetData);
      return response.data;
    } catch (error) {
      console.error('Error creating budget:', error);
      throw error;
    }
  }

  /**
   * Update an existing budget
   */
  async updateBudget(budgetId, budgetData) {
    try {
      const response = await axiosInstance.put(`/budgets/${budgetId}`, budgetData);
      return response.data;
    } catch (error) {
      console.error('Error updating budget:', error);
      throw error;
    }
  }

  /**
   * Delete a budget (soft delete)
   */
  async deleteBudget(budgetId) {
    try {
      const response = await axiosInstance.delete(`/budgets/${budgetId}`);
      return response.data;
    } catch (error) {
      console.error('Error deleting budget:', error);
      throw error;
    }
  }

  /**
   * Get budget summary statistics
   */
  async getBudgetStats(filters = {}) {
    try {
      const response = await axiosInstance.get('/budgets/stats/summary', { params: filters });
      return response.data;
    } catch (error) {
      console.error('Error fetching budget stats:', error);
      throw error;
    }
  }

  // ============================================
  // BUDGET CONTAINER METHODS
  // ============================================

  /**
   * Get all budget containers with optional filters
   */
  async getBudgetContainers(filters = {}) {
    try {
      console.log('budgetService.getBudgetContainers called with filters:', filters);
      const response = await axiosInstance.get('/budgets/containers', { 
        params: filters,
        timeout: 60000 // 60 seconds timeout for budget containers
      });
      console.log('budgetService.getBudgetContainers response:', response);
      console.log('budgetService.getBudgetContainers response.data:', response.data);
      return response.data;
    } catch (error) {
      console.error('Error fetching budget containers in budgetService:', error);
      console.error('Error type:', typeof error);
      console.error('Error keys:', Object.keys(error || {}));
      console.error('Error message:', error?.message);
      console.error('Error response:', error?.response);
      // Re-throw the error so the component can handle it
      throw error;
    }
  }

  /**
   * Get a single budget container with all items
   */
  async getBudgetContainer(budgetId) {
    try {
      const response = await axiosInstance.get(`/budgets/containers/${budgetId}`);
      return response.data;
    } catch (error) {
      console.error('Error fetching budget container:', error);
      throw error;
    }
  }

  /**
   * Create a new budget container
   */
  async createBudgetContainer(containerData) {
    try {
      const response = await axiosInstance.post('/budgets/containers', containerData);
      return response.data;
    } catch (error) {
      console.error('Error creating budget container:', error);
      throw error;
    }
  }

  /**
   * Update a budget container
   */
  async updateBudgetContainer(budgetId, containerData) {
    try {
      const response = await axiosInstance.put(`/budgets/containers/${budgetId}`, containerData);
      return response.data;
    } catch (error) {
      console.error('Error updating budget container:', error);
      throw error;
    }
  }

  /**
   * Approve a budget container
   */
  async approveBudgetContainer(budgetId) {
    try {
      const response = await axiosInstance.post(`/budgets/containers/${budgetId}/approve`);
      return response.data;
    } catch (error) {
      console.error('Error approving budget container:', error);
      throw error;
    }
  }

  /**
   * Reject a budget container
   */
  async rejectBudgetContainer(budgetId, rejectionReason) {
    try {
      const response = await axiosInstance.post(`/budgets/containers/${budgetId}/reject`, {
        rejectionReason
      });
      return response.data;
    } catch (error) {
      console.error('Error rejecting budget container:', error);
      throw error;
    }
  }

  // ============================================
  // BUDGET ITEMS METHODS
  // ============================================

  /**
   * Get all items in a budget container
   */
  async getBudgetItems(budgetId) {
    try {
      const response = await axiosInstance.get(`/budgets/containers/${budgetId}/items`);
      return response.data;
    } catch (error) {
      console.error('Error fetching budget items:', error);
      throw error;
    }
  }

  /**
   * Add an item to a budget container
   */
  async addBudgetItem(budgetId, itemData) {
    try {
      const response = await axiosInstance.post(`/budgets/containers/${budgetId}/items`, itemData);
      return response.data;
    } catch (error) {
      console.error('Error adding budget item:', error);
      throw error;
    }
  }

  async getAdpWishlist(params = {}) {
    try {
      const response = await axiosInstance.get('/budgets/adp-wishlist', { params });
      return response.data;
    } catch (error) {
      console.error('Error fetching ADP wishlist:', error);
      throw error;
    }
  }

  async addAdpBudgetItems(budgetId, items, options = {}) {
    try {
      const response = await axiosInstance.post(`/budgets/containers/${budgetId}/adp-items`, {
        items,
        ...options
      });
      return response.data;
    } catch (error) {
      console.error('Error adding ADP budget items:', error);
      throw error;
    }
  }

  /**
   * Update a budget item
   */
  async updateBudgetItem(itemId, itemData) {
    try {
      const response = await axiosInstance.put(`/budgets/items/${itemId}`, itemData);
      return response.data;
    } catch (error) {
      console.error('Error updating budget item:', error);
      throw error;
    }
  }

  /**
   * Remove a budget item
   */
  async removeBudgetItem(itemId, changeReason = null) {
    try {
      const response = await axiosInstance.delete(`/budgets/items/${itemId}`, {
        data: { changeReason }
      });
      return response.data;
    } catch (error) {
      console.error('Error removing budget item:', error);
      throw error;
    }
  }

  // ============================================
  // CHANGE REQUESTS METHODS
  // ============================================

  /**
   * Get change history for a budget
   */
  async getBudgetChanges(budgetId, status = null) {
    try {
      const params = status ? { status } : {};
      const response = await axiosInstance.get(`/budgets/containers/${budgetId}/changes`, { params });
      return response.data;
    } catch (error) {
      console.error('Error fetching budget changes:', error);
      throw error;
    }
  }

  /**
   * Approve a change request
   */
  async approveChangeRequest(changeId, reviewNotes = null) {
    try {
      const response = await axiosInstance.put(`/budgets/changes/${changeId}/approve`, {
        reviewNotes
      });
      return response.data;
    } catch (error) {
      console.error('Error approving change request:', error);
      throw error;
    }
  }

  /**
   * Reject a change request
   */
  async rejectChangeRequest(changeId, reviewNotes) {
    try {
      const response = await axiosInstance.put(`/budgets/changes/${changeId}/reject`, {
        reviewNotes
      });
      return response.data;
    } catch (error) {
      console.error('Error rejecting change request:', error);
      throw error;
    }
  }

  // ============================================
  // COMBINED BUDGETS METHODS
  // ============================================

  /**
   * Create a new combined budget container
   */
  async createCombinedBudget(combinedBudgetData) {
    try {
      const response = await axiosInstance.post('/budgets/containers/combined', combinedBudgetData);
      return response.data;
    } catch (error) {
      console.error('Error creating combined budget:', error);
      throw error;
    }
  }

  /**
   * Get a combined budget with all containers and items
   */
  async getCombinedBudget(budgetId) {
    try {
      const response = await axiosInstance.get(`/budgets/containers/${budgetId}/combined`);
      console.log('getCombinedBudget response:', response);
      console.log('getCombinedBudget response.data:', response.data);
      console.log('containerItems in response:', response.data?.containerItems);
      console.log('containerItems length:', response.data?.containerItems?.length);
      if (response.data?.containerItems) {
        response.data.containerItems.forEach((ci, idx) => {
          console.log(`Container ${idx}:`, ci.container?.budgetName, 'Items:', ci.items?.length);
        });
      }
      return response.data;
    } catch (error) {
      console.error('Error fetching combined budget:', error);
      throw error;
    }
  }

  /**
   * Add a container to a combined budget
   */
  async addContainerToCombined(combinedBudgetId, containerId) {
    try {
      const response = await axiosInstance.post(`/budgets/containers/${combinedBudgetId}/combined/add`, {
        containerId
      });
      return response.data;
    } catch (error) {
      console.error('Error adding container to combined budget:', error);
      throw error;
    }
  }

  /**
   * Remove a container from a combined budget
   */
  async removeContainerFromCombined(combinedBudgetId, containerId) {
    try {
      const response = await axiosInstance.delete(`/budgets/containers/${combinedBudgetId}/combined/${containerId}`);
      return response.data;
    } catch (error) {
      console.error('Error removing container from combined budget:', error);
      throw error;
    }
  }

  /**
   * Preview budget import from uploaded file
   */
  async previewBudgetImport(formData) {
    try {
      const response = await axiosInstance.post('/budgets/import-data', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 60000 // 60 seconds timeout for large file processing
      });
      return response.data;
    } catch (error) {
      console.error('Error previewing budget import:', error);
      throw error;
    }
  }

  /**
   * Confirm and import budget data
   * Accepts either { dataToImport: [...] } or FormData with file
   */
  async confirmBudgetImport(importData) {
    try {
      const isFormData = importData instanceof FormData;
      const config = isFormData ? {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 120000 // 2 minutes for large file processing
      } : {
        timeout: 120000
      };
      const response = await axiosInstance.post('/budgets/confirm-import-data', importData, config);
      return response.data;
    } catch (error) {
      console.error('Error confirming budget import:', error);
      throw error;
    }
  }

  /**
   * Download budget import template
   */
  async downloadBudgetTemplate() {
    try {
      const response = await axiosInstance.get('/budgets/template', {
        responseType: 'blob'
      });
      return response.data;
    } catch (error) {
      console.error('Error downloading budget template:', error);
      throw error;
    }
  }

  /**
   * Check metadata mapping for budget import
   * Accepts either { dataToImport: [...] } or FormData with file
   */
  async checkMetadataMapping(importData) {
    try {
      const isFormData = importData instanceof FormData;
      const config = isFormData ? {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 60000 // 60 seconds timeout for large file metadata checking
      } : {
        timeout: 60000
      };
      
      const response = await axiosInstance.post('/budgets/check-metadata-mapping', importData, config);
      return response.data;
    } catch (error) {
      console.error('Error checking budget metadata mapping:', error);
      throw error;
    }
  }
  /**
   * Budget items awaiting registry project linkage (procurement intake)
   */
  async getProcurementQueue(filters = {}) {
    try {
      const response = await axiosInstance.get('/budgets/procurement-queue', { params: filters });
      return response.data;
    } catch (error) {
      console.error('Error fetching procurement queue:', error);
      throw error;
    }
  }

  /**
   * Remaining vote / ADP balance for a budget item before registry project creation
   */
  async getBudgetItemProcurementBalance(itemId) {
    try {
      const response = await axiosInstance.get(`/budgets/items/${itemId}/procurement-balance`);
      return response.data;
    } catch (error) {
      console.error('Error fetching procurement balance:', error);
      throw error;
    }
  }

  /**
   * Create or link a registry project from a budget item
   */
  async createRegistryProjectFromBudgetItem(itemId, payload = {}) {
    try {
      const response = await axiosInstance.post(`/budgets/items/${itemId}/create-registry-project`, payload);
      return response.data;
    } catch (error) {
      console.error('Error creating registry project from budget item:', error);
      throw error;
    }
  }
}

export default new BudgetService();







