// src/hooks/useCrudOperations.jsx
import { useState } from 'react';
import apiService from '../api';
import { useAuth } from '../context/AuthContext.jsx';
import { checkUserPrivilege } from '../utils/helpers';

/**
 * A custom hook for handling CRUD operations and PDF downloads across different services.
 * It dynamically dispatches actions to the correct API service based on the resource type.
 *
 * @param {string} serviceType - The top-level service to use ('strategy' or 'kdsp').
 * @param {function} fetchDataCallback - A callback function to refresh data after a successful operation.
 * @param {function} setSnackbar - The state setter for displaying snackbar messages.
 */
const useCrudOperations = (serviceType, fetchDataCallback, setSnackbar) => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);

  const hasCrudPrivilege = (type, action) => {
    const directPrivilege = `${type}.${action}`;
    if (checkUserPrivilege(user, directPrivilege)) return true;

    // Strategic planning legacy privilege compatibility
    if (type === 'program' || type === 'subprogram') {
      if (checkUserPrivilege(user, `strategic_plan.${action}`)) return true;
    }
    if (type === 'attachment') {
      if (action === 'create' && (checkUserPrivilege(user, 'document.upload') || checkUserPrivilege(user, 'strategic_plan.create') || checkUserPrivilege(user, 'strategic_plan.update'))) {
        return true;
      }
      if (action === 'delete' && (checkUserPrivilege(user, 'document.delete') || checkUserPrivilege(user, 'strategic_plan.delete') || checkUserPrivilege(user, 'strategic_plan.update'))) {
        return true;
      }
    }
    return false;
  };

  // Maps a dialog type to the capitalized suffix used in the API method name.
  const apiMethodSuffixMap = {
    // KDSP Mappings
    conceptNote: 'ProjectConceptNote',
    needsAssessment: 'ProjectNeedsAssessment',
    financials: 'ProjectFinancials',
    fyBreakdown: 'ProjectFyBreakdown',
    sustainability: 'ProjectSustainability',
    implementationPlan: 'ProjectImplementationPlan',
    mAndE: 'ProjectMAndE',
    risks: 'ProjectRisk',
    stakeholders: 'ProjectStakeholder',
    readiness: 'ProjectReadiness',
    hazardAssessment: 'ProjectHazardAssessment',
    climateRisk: 'ProjectClimateRisk',
    esohsgScreening: 'ProjectEsohsgScreening',
    // Strategic Plan Mappings
    strategicPlan: 'StrategicPlan',
    program: 'Program',
    subprogram: 'Subprogram',
    attachment: 'PlanningDocument',
    // NEW MAPPINGS
    workplan: 'WorkPlan',
    activity: 'Activity',
    milestoneActivity: 'MilestoneActivity', // NEW: Mapping for the junction table
  };

  // Maps a dialog type to the key used to find the record's ID.
  const recordIdKeyMap = {
    // KDSP Mappings
    conceptNote: 'conceptNoteId',
    needsAssessment: 'needsAssessmentId',
    financials: 'financialsId',
    fyBreakdown: 'fyBreakdownId',
    sustainability: 'sustainabilityId',
    implementationPlan: 'planId',
    mAndE: 'mAndEId',
    risks: 'riskId',
    stakeholders: 'stakeholderId',
    readiness: 'readinessId',
    hazardAssessment: 'hazardId',
    climateRisk: 'climateRiskId',
    esohsgScreening: 'screeningId',
    // Strategic Plan Mappings
    strategicPlan: 'planId',
    program: 'programId',
    subprogram: 'subProgramId',
    attachment: 'attachmentId',
    // NEW MAPPINGS
    workplan: 'workplanId',
    activity: 'activityId',
    milestoneActivity: 'id', // Assuming your junction table has a generic 'id'
  };
  
  /**
   * CORRECTED: Retrieves the correct API service module based on the dialogType.
   * This is the fix for the 'createActivity not found' error.
   * @returns {object} The API service object or a nested module.
   */
  const getApiModule = (type) => {
    switch (type) {
        case 'workplan':
            return apiService.strategy.annualWorkPlans;
        case 'activity':
            return apiService.strategy.activities;
        case 'milestoneActivity':
            return apiService.strategy.milestoneActivities; // NEW: Added case for milestone activities
        default:
            return apiService.strategy;
    }
  };

  /**
   * Constructs the full API method name string.
   * @param {string} action - The action to perform ('create', 'update', 'delete').
   * @param {string} type - The type of resource (e.g., 'program', 'risks').
   * @returns {string} The full method name string (e.g., 'createProgram').
   */
  const getApiMethodName = (action, type) => {
    const suffix = apiMethodSuffixMap[type];
    if (!suffix) {
      throw new Error(`Invalid dialog type for API method: ${type}`);
    }
    return `${action}${suffix}`;
  };

  /**
   * Handles form submission for creating or updating a record.
   *
   * @param {string} dialogType - The type of resource being created/updated.
   * @param {object} currentRecord - The record being updated, or null for creation.
   * @param {object} formData - The data from the form.
   * @param {function} handleCloseDialog - Callback to close the dialog.
   * @param {string|number} parentId - The ID of the parent resource for a new record.
   */
  const handleSubmit = async (dialogType, currentRecord, formData, handleCloseDialog, parentId) => {
    setLoading(true);
    try {
      const isUpdate = !!currentRecord && !!currentRecord[recordIdKeyMap[dialogType]];
      const actionName = isUpdate ? 'update' : 'create';
      
      const apiModule = getApiModule(dialogType);
      const serviceMethodName = getApiMethodName(actionName, dialogType);

      let payload = { ...formData };
      let apiCallArgs = [];
      
      if (isUpdate) {
        const recordId = currentRecord[recordIdKeyMap[dialogType]];
        apiCallArgs = [recordId, payload];
      } else {
        if (dialogType === 'subprogram') {
            payload = { ...formData, programId: parentId };
        } else if (dialogType === 'program') {
            payload = { ...formData, cidpid: parentId };
        } else if (dialogType === 'workplan') {
            payload = { ...formData, subProgramId: parentId };
        } else if (dialogType === 'activity') {
            payload = { ...formData, workplanId: parentId };
        }
        apiCallArgs = [payload];
      }
      
      if (dialogType === 'attachment' && formData instanceof FormData) {
        if (!isUpdate) {
          formData.append('entityType', 'plan');
          formData.append('entityId', parentId);
        }
        apiCallArgs = [formData];
      }

      if (!hasCrudPrivilege(dialogType, actionName)) {
        setSnackbar({ open: true, message: `You don't have permission to ${actionName} this record.`, severity: 'error' });
        setLoading(false);
        return;
      }
      
      if (typeof apiModule?.[serviceMethodName] !== 'function') {
        const fullMethodPath = `${serviceType}Service.${serviceMethodName}`;
        console.error(`Critical Error: API method '${fullMethodPath}' not found or is not a function.`);
        setSnackbar({
          open: true,
          message: `Application error: Service method not found for ${dialogType}.`,
          severity: 'error'
        });
        setLoading(false);
        return;
      }
      
      console.log('Final Payload being sent:', payload);

      await apiModule[serviceMethodName](...apiCallArgs);

      setSnackbar({ open: true, message: `${dialogType.replace(/([A-Z])/g, ' $1').trim()} saved successfully!`, severity: 'success' });
      handleCloseDialog();
      fetchDataCallback();
    } catch (err) {
      console.error(`Error saving ${dialogType}:`, err);
      const errorMessage = err.message || `Failed to save ${dialogType}.`;
      setSnackbar({ open: true, message: errorMessage, severity: 'error' });
    } finally {
      setLoading(false);
    }
  };

  /**
   * Handles deleting a record.
   */
  const handleDelete = async (type, recordId) => {
    if (!hasCrudPrivilege(type, 'delete')) {
      setSnackbar({ open: true, message: `You don't have permission to delete this record.`, severity: 'error' });
      return;
    }
    if (!window.confirm('Are you sure you want to delete this record? This action cannot be undone.')) return;

    setLoading(true);
    try {
      const apiModule = getApiModule(type);
      const deleteMethodName = getApiMethodName('delete', type);

      if (typeof apiModule?.[deleteMethodName] !== 'function') {
        throw new Error(`API method '${deleteMethodName}' not found on service.`);
      }

      await apiModule[deleteMethodName](recordId);
      setSnackbar({ open: true, message: `${type.replace(/([A-Z])/g, ' $1').trim()} deleted successfully!`, severity: 'success' });
      fetchDataCallback();
    } catch (err) {
      console.error(`Error deleting ${type}:`, err);
      const errorMessage = err.message || `Failed to delete ${type}.`;
      setSnackbar({ open: true, message: errorMessage, severity: 'error' });
    } finally {
      setLoading(false);
    }
  };

  /**
   * Handles downloading a PDF report.
   */
  const handleDownloadPdf = async (type, name, id) => {
    if (!checkUserPrivilege(user, `kdsp_project_pdf.download`)) {
      setSnackbar({ open: true, message: `You don't have permission to download PDF reports.`, severity: 'error' });
      return;
    }
    setLoading(true);
    setSnackbar({ open: true, message: 'Generating PDF report, please wait...', severity: 'info' });
    try {
      const apiModule = getApiModule(type);
      let methodName;
      let idToDownload;

      if (type === 'strategic_plan_pdf') {
        methodName = 'downloadPlanPdf';
        idToDownload = id;
      } else if (type === 'program_pdf') {
        methodName = 'downloadProgramPdf';
        idToDownload = id;
      } else if (type === 'project_pdf') {
        methodName = 'downloadProjectPdf';
        idToDownload = id;
      } else {
        throw new Error(`Unknown PDF download type: ${type}`);
      }
      
      if (typeof apiModule?.[methodName] !== 'function') {
          throw new Error(`PDF download method '${methodName}' not found on service.`);
      }

      const response = await apiModule[methodName](idToDownload);
      const url = window.URL.createObjectURL(new Blob([response]));
      const link = document.createElement('a');
      link.href = url;
      const cleanName = name ? name.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_') : 'Document';
      link.setAttribute('download', `${cleanName}_${idToDownload}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
      window.URL.revokeObjectURL(url);
      setSnackbar({ open: true, message: 'PDF report downloaded successfully!', severity: 'success' });
    } catch (err) {
      console.error('Error downloading PDF:', err);
      const errorMessage = err.message || 'Failed to download PDF report. Please try again.';
      setSnackbar({ open: true, message: errorMessage, severity: 'error' });
    } finally {
      setLoading(false);
    }
  };

  return { loading, handleSubmit, handleDelete, handleDownloadPdf };
};

export default useCrudOperations;
