// src/api/kdspIIService.js
import axiosInstance from './axiosInstance';

const kdspIIService = {
  // Project Concept Note CRUD
  getProjectConceptNote: async (projectId) => {
    try {
      const response = await axiosInstance.get(`/projects/${projectId}/concept-notes`);
      return response.data;
    } catch (error) {
      console.error('Error fetching project concept note:', error);
      throw error;
    }
  },
  createProjectConceptNote: async (projectId, data) => {
    try {
      const response = await axiosInstance.post(`/projects/${projectId}/concept-notes`, data);
      return response.data;
    } catch (error) {
      console.error('Error creating project concept note:', error);
      throw error;
    }
  },
  updateProjectConceptNote: async (conceptNoteId, data) => {
    try {
      const response = await axiosInstance.put(`/projects/concept-notes/${conceptNoteId}`, data);
      return response.data;
    } catch (error) {
      console.error('Error updating project concept note:', error);
      throw error;
    }
  },
  deleteProjectConceptNote: async (conceptNoteId) => {
    try {
      const response = await axiosInstance.delete(`/projects/concept-notes/${conceptNoteId}`);
      return response.data;
    } catch (error) {
      console.error('Error deleting project concept note:', error);
      throw error;
    }
  },
  // Project Needs Assessment CRUD
  getProjectNeedsAssessment: async (projectId) => {
    try {
      const response = await axiosInstance.get(`/projects/${projectId}/needs-assessment`);
      return response.data;
    } catch (error) {
      console.error('Error fetching project needs assessment:', error);
      throw error;
    }
  },
  createProjectNeedsAssessment: async (projectId, data) => {
    try {
      const response = await axiosInstance.post(`/projects/${projectId}/needs-assessment`, data);
      return response.data;
    } catch (error) {
      console.error('Error creating project needs assessment:', error);
      throw error;
    }
  },
  updateProjectNeedsAssessment: async (needsAssessmentId, data) => {
    try {
      const response = await axiosInstance.put(`/projects/needs-assessment/${needsAssessmentId}`, data);
      return response.data;
    } catch (error) {
      console.error('Error updating project needs assessment:', error);
      throw error;
    }
  },
  deleteProjectNeedsAssessment: async (needsAssessmentId) => {
    try {
      const response = await axiosInstance.delete(`/projects/needs-assessment/${needsAssessmentId}`);
      return response.data;
    } catch (error) {
      console.error('Error deleting project needs assessment:', error);
      throw error;
    }
  },
  // Project Financials CRUD
  getProjectFinancials: async (projectId) => {
    try {
      const response = await axiosInstance.get(`/projects/${projectId}/financials`);
      return response.data;
    } catch (error) {
      console.error('Error fetching project financials:', error);
      throw error;
    }
  },
  createProjectFinancials: async (projectId, data) => {
    try {
      const response = await axiosInstance.post(`/projects/${projectId}/financials`, data);
      return response.data;
    } catch (error) {
      console.error('Error creating project financials:', error);
      throw error;
    }
  },
  updateProjectFinancials: async (financialsId, data) => {
    try {
      const response = await axiosInstance.put(`/projects/financials/${financialsId}`, data);
      return response.data;
    } catch (error) {
      console.error('Error updating project financials:', error);
      throw error;
    }
  },
  deleteProjectFinancials: async (financialsId) => {
    try {
      const response = await axiosInstance.delete(`/projects/financials/${financialsId}`);
      return response.data;
    } catch (error) {
      console.error('Error deleting project financials:', error);
      throw error;
    }
  },
  // Project FY Breakdown CRUD
  getProjectFyBreakdown: async (projectId) => {
    try {
      const response = await axiosInstance.get(`/projects/${projectId}/fy-breakdown`);
      return response.data;
    } catch (error) {
      console.error('Error fetching project FY breakdown:', error);
      throw error;
    }
  },
  createProjectFyBreakdown: async (projectId, data) => {
    try {
      const response = await axiosInstance.post(`/projects/${projectId}/fy-breakdown`, data);
      return response.data;
    } catch (error) {
      console.error('Error creating project FY breakdown:', error);
      throw error;
    }
  },
  updateProjectFyBreakdown: async (fyBreakdownId, data) => {
    try {
      const response = await axiosInstance.put(`/projects/fy-breakdown/${fyBreakdownId}`, data);
      return response.data;
    } catch (error) {
      console.error('Error updating project FY breakdown:', error);
      throw error;
    }
  },
  deleteProjectFyBreakdown: async (fyBreakdownId) => {
    try {
      const response = await axiosInstance.delete(`/projects/fy-breakdown/${fyBreakdownId}`);
      return response.data;
    } catch (error) {
      console.error('Error deleting project FY breakdown:', error);
      throw error;
    }
  },
  // Project Sustainability CRUD
  getProjectSustainability: async (projectId) => {
    try {
      const response = await axiosInstance.get(`/projects/${projectId}/sustainability`);
      return response.data;
    } catch (error) {
      console.error('Error fetching project sustainability:', error);
      throw error;
    }
  },
  createProjectSustainability: async (projectId, data) => {
    try {
      const response = await axiosInstance.post(`/projects/${projectId}/sustainability`, data);
      return response.data;
    } catch (error) {
      console.error('Error creating project sustainability:', error);
      throw error;
    }
  },
  updateProjectSustainability: async (sustainabilityId, data) => {
    try {
      const response = await axiosInstance.put(`/projects/sustainability/${sustainabilityId}`, data);
      return response.data;
    } catch (error) {
      console.error('Error updating project sustainability:', error);
      throw error;
    }
  },
  deleteProjectSustainability: async (sustainabilityId) => {
    try {
      const response = await axiosInstance.delete(`/projects/sustainability/${sustainabilityId}`);
      return response.data;
    } catch (error) {
      console.error('Error deleting project sustainability:', error);
      throw error;
    }
  },
  // Project Implementation Plan CRUD
  getProjectImplementationPlan: async (projectId) => {
    try {
      const response = await axiosInstance.get(`/projects/${projectId}/implementation-plan`);
      return response.data;
    } catch (error) {
      console.error('Error fetching project implementation plan:', error);
      throw error;
    }
  },
  createProjectImplementationPlan: async (projectId, data) => {
    try {
      const response = await axiosInstance.post(`/projects/${projectId}/implementation-plan`, data);
      return response.data;
    } catch (error) {
      console.error('Error creating project implementation plan:', error);
      throw error;
    }
  },
  updateProjectImplementationPlan: async (planId, data) => {
    try {
      const response = await axiosInstance.put(`/projects/implementation-plan/${planId}`, data);
      return response.data;
    } catch (error) {
      console.error('Error updating project implementation plan:', error);
      throw error;
    }
  },
  deleteProjectImplementationPlan: async (planId) => {
    try {
      const response = await axiosInstance.delete(`/projects/implementation-plan/${planId}`);
      return response.data;
    } catch (error) {
      console.error('Error deleting project implementation plan:', error);
      throw error;
    }
  },
  // Project M&E CRUD
  getProjectMAndE: async (projectId) => {
    try {
      const response = await axiosInstance.get(`/projects/${projectId}/m-and-e`);
      return response.data;
    } catch (error) {
      console.error('Error fetching project M&E:', error);
      throw error;
    }
  },
  createProjectMAndE: async (projectId, data) => {
    try {
      const response = await axiosInstance.post(`/projects/${projectId}/m-and-e`, data);
      return response.data;
    } catch (error) {
      console.error('Error creating project M&E:', error);
      throw error;
    }
  },
  updateProjectMAndE: async (mAndEId, data) => {
    try {
      const response = await axiosInstance.put(`/projects/m-and-e/${mAndEId}`, data);
      return response.data;
    } catch (error) {
      console.error('Error updating project M&E:', error);
      throw error;
    }
  },
  deleteProjectMAndE: async (mAndEId) => {
    try {
      const response = await axiosInstance.delete(`/projects/m-and-e/${mAndEId}`);
      return response.data;
    } catch (error) {
      console.error('Error deleting project M&E:', error);
      throw error;
    }
  },
  // Project Risks CRUD
  getProjectRisks: async (projectId) => {
    try {
      const response = await axiosInstance.get(`/projects/${projectId}/risks`);
      return response.data;
    } catch (error) {
      console.error('Error fetching project risks:', error);
      throw error;
    }
  },
  createProjectRisk: async (projectId, data) => {
    try {
      const response = await axiosInstance.post(`/projects/${projectId}/risks`, data);
      return response.data;
    } catch (error) {
      console.error('Error creating project risk:', error);
      throw error;
    }
  },
  updateProjectRisk: async (riskId, data) => {
    try {
      const response = await axiosInstance.put(`/projects/risks/${riskId}`, data);
      return response.data;
    } catch (error) {
      console.error('Error updating project risk:', error);
      throw error;
    }
  },
  deleteProjectRisk: async (riskId) => {
    try {
      const response = await axiosInstance.delete(`/projects/risks/${riskId}`);
      return response.data;
    } catch (error) {
      console.error('Error deleting project risk:', error);
      throw error;
    }
  },
  // Project Stakeholders CRUD
  getProjectStakeholders: async (projectId) => {
    try {
      const response = await axiosInstance.get(`/projects/${projectId}/stakeholders`);
      return response.data;
    } catch (error) {
      console.error('Error fetching project stakeholders:', error);
      throw error;
    }
  },
  createProjectStakeholder: async (projectId, data) => {
    try {
      const response = await axiosInstance.post(`/projects/${projectId}/stakeholders`, data);
      return response.data;
    } catch (error) {
      console.error('Error creating project stakeholder:', error);
      throw error;
    }
  },
  updateProjectStakeholder: async (stakeholderId, data) => {
    try {
      const response = await axiosInstance.put(`/projects/stakeholders/${stakeholderId}`, data);
      return response.data;
    } catch (error) {
      console.error('Error updating project stakeholder:', error);
      throw error;
    }
  },
  deleteProjectStakeholder: async (stakeholderId) => {
    try {
      const response = await axiosInstance.delete(`/projects/stakeholders/${stakeholderId}`);
      return response.data;
    } catch (error) {
      console.error('Error deleting project stakeholder:', error);
      throw error;
    }
  },
  // Project Readiness CRUD
  getProjectReadiness: async (projectId) => {
    try {
      const response = await axiosInstance.get(`/projects/${projectId}/readiness`);
      return response.data;
    } catch (error) {
      console.error('Error fetching project readiness:', error);
      throw error;
    }
  },
  createProjectReadiness: async (projectId, data) => {
    try {
      const response = await axiosInstance.post(`/projects/${projectId}/readiness`, data);
      return response.data;
    } catch (error) {
      console.error('Error creating project readiness:', error);
      throw error;
    }
  },
  updateProjectReadiness: async (readinessId, data) => {
    try {
      const response = await axiosInstance.put(`/projects/readiness/${readinessId}`, data);
      return response.data;
    } catch (error) {
      console.error('Error updating project readiness:', error);
      throw error;
    }
  },
  deleteProjectReadiness: async (readinessId) => {
    try {
      const response = await axiosInstance.delete(`/projects/readiness/${readinessId}`);
      return response.data;
    } catch (error) {
      console.error('Error deleting project readiness:', error);
      throw error;
    }
  },
  // Project Hazard Assessment CRUD
  getProjectHazardAssessment: async (projectId) => {
    try {
      const response = await axiosInstance.get(`/projects/${projectId}/hazard-assessment`);
      return response.data;
    } catch (error) {
      console.error('Error fetching project hazard assessment:', error);
      throw error;
    }
  },
  createProjectHazardAssessment: async (projectId, data) => {
    try {
      const response = await axiosInstance.post(`/projects/${projectId}/hazard-assessment`, data);
      return response.data;
    } catch (error) {
      console.error('Error creating project hazard assessment:', error);
      throw error;
    }
  },
  updateProjectHazardAssessment: async (hazardId, data) => {
    try {
      const response = await axiosInstance.put(`/projects/hazard-assessment/${hazardId}`, data);
      return response.data;
    } catch (error) {
      console.error('Error updating project hazard assessment:', error);
      throw error;
    }
  },
  deleteProjectHazardAssessment: async (hazardId) => {
    try {
      const response = await axiosInstance.delete(`/projects/hazard-assessment/${hazardId}`);
      return response.data;
    } catch (error) {
      console.error('Error deleting project hazard assessment:', error);
      throw error;
    }
  },
  // Project Climate Risk CRUD
  getProjectClimateRisk: async (projectId) => {
    try {
      const response = await axiosInstance.get(`/projects/${projectId}/climate-risk`);
      return response.data;
    } catch (error) {
      console.error('Error fetching project climate risk:', error);
      throw error;
    }
  },
  createProjectClimateRisk: async (projectId, data) => {
    try {
      const response = await axiosInstance.post(`/projects/${projectId}/climate-risk`, data);
      return response.data;
    } catch (error) {
      console.error('Error creating project climate risk:', error);
      throw error;
    }
  },
  updateProjectClimateRisk: async (climateRiskId, data) => {
    try {
      const response = await axiosInstance.put(`/projects/climate-risk/${climateRiskId}`, data);
      return response.data;
    } catch (error) {
      console.error('Error updating project climate risk:', error);
      throw error;
    }
  },
  deleteProjectClimateRisk: async (climateRiskId) => {
    try {
      const response = await axiosInstance.delete(`/projects/climate-risk/${climateRiskId}`);
      return response.data;
    } catch (error) {
      console.error('Error deleting project climate risk:', error);
      throw error;
    }
  },
  // Project ESOHSG Screening CRUD
  getProjectEsohsgScreening: async (projectId) => {
    try {
      const response = await axiosInstance.get(`/projects/${projectId}/esohsg-screening`);
      return response.data;
    } catch (error) {
      console.error('Error fetching project ESOHSG screening:', error);
      throw error;
    }
  },
  createProjectEsohsgScreening: async (projectId, data) => {
    try {
      const response = await axiosInstance.post(`/projects/${projectId}/esohsg-screening`, data);
      return response.data;
    } catch (error) {
      console.error('Error creating project ESOHSG screening:', error);
      throw error;
    }
  },
  updateProjectEsohsgScreening: async (screeningId, data) => {
    try {
      const response = await axiosInstance.put(`/projects/esohsg-screening/${screeningId}`, data);
      return response.data;
    } catch (error) {
      console.error('Error updating project ESOHSG screening:', error);
      throw error;
    }
  },
  deleteProjectEsohsgScreening: async (screeningId) => {
    try {
      const response = await axiosInstance.delete(`/projects/esohsg-screening/${screeningId}`);
      return response.data;
    } catch (error) {
      console.error('Error deleting project ESOHSG screening:', error);
      throw error;
    }
  },
  // Project PDF download
  downloadProjectPdf: async (projectId) => {
    try {
      const response = await axiosInstance.get(`/projects/${projectId}/export-pdf`, {
        responseType: 'blob',
      });
      return response.data;
    } catch (error) {
      console.error('Error downloading project PDF:', error);
      throw error;
    }
  },
  downloadProjectDocx: async (projectId) => {
    try {
      const response = await axiosInstance.get(`/projects/${projectId}/export-docx`, {
        responseType: 'blob',
      });
      return response.data;
    } catch (error) {
      console.error('Error downloading project Word document:', error);
      throw error;
    }
  },
};

export default kdspIIService;
