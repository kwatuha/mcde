import { useState, useEffect, useCallback } from 'react';
import apiService from '../api';
import { DEFAULT_COUNTY } from '../configs/appConfig';
import { normalizeProjectStatus } from '../utils/projectStatusNormalizer';

const useProjectForm = (currentProject, allMetadata, onFormSuccess, setSnackbar) => {
  const [formData, setFormData] = useState({
    projectName: '', projectDescription: '', startDate: '', endDate: '',
    directorate: '', costOfProject: '', paidOut: '',
    objective: '', expectedOutput: '', expectedOutcome: '',
    status: 'Not started',
    overallProgress: '', // Progress JSONB: percentage_complete (0-100)
    ministry: '', stateDepartment: '', sector: '', // New fields replacing departmentId, sectionId, categoryId
    categoryId: '', // Project category/type - determines which site fields are shown
    countyIds: [], subcountyIds: [], wardIds: [],
    county: '', constituency: '', ward: '', // Free text fields for location
    sites: [], // Array of project sites for multilocation support - REQUIRED (at least one)
    // Additional JSONB fields from original database structure
    budgetSource: '', // Budget JSONB: source
    progressSummary: '', // Progress JSONB: latest_update_summary
    latitude: '', // Location JSONB: geocoordinates.lat
    longitude: '', // Location JSONB: geocoordinates.lng
    feedbackEnabled: true, // Public Engagement JSONB: feedback_enabled
    dataSources: [], // Data Sources JSONB: array of {type, links, retrieved_from, verification_status}
  });
  const [formErrors, setFormErrors] = useState({});
  const [loading, setLoading] = useState(false);

  const [formSections, setFormSections] = useState([]);
  const [formSubPrograms, setFormSubPrograms] = useState([]);
  const [formSubcounties, setFormSubcounties] = useState([]);
  const [formWards, setFormWards] = useState([]);
  const [missingFinancialYear, setMissingFinancialYear] = useState(null); // For financial years not in metadata

  const [initialAssociations, setInitialAssociations] = useState({
    // Junction IDs (county/subcounty/ward) are not used in the new flow; location comes from project_sites.
    countyIds: [],
    subcountyIds: [],
    wardIds: [],
    sites: [],
  });

  useEffect(() => {
    // Only run if we have a currentProject with an id (editing mode)
    // Use a more specific check to ensure we reload when project changes
    const projectId = currentProject?.id;
    
    if (projectId) {
      console.log('Loading project for editing:', currentProject, 'Project ID:', projectId);
      setLoading(true);
      const fetchAssociations = async () => {
        try {
          // In the new model we only care about project sites for location; legacy junction tables can be ignored.
          // Safely fetch sites with error handling
          let sites = [];
          if (apiService.projects && typeof apiService.projects.getProjectSites === 'function') {
            try {
              const sitesRes = await apiService.projects.getProjectSites(projectId);
              sites = sitesRes || [];
            } catch (err) {
              console.warn('Failed to fetch project sites:', err);
              sites = [];
            }
          } else {
            console.warn('getProjectSites is not available on apiService.projects');
          }

          const formDataToSet = {
            projectName: currentProject.projectName || '',
            projectDescription: currentProject.projectDescription || '',
            startDate: currentProject.startDate ? new Date(currentProject.startDate).toISOString().split('T')[0] : '',
            endDate: currentProject.endDate ? new Date(currentProject.endDate).toISOString().split('T')[0] : '',
            directorate: currentProject.directorate || '',
            costOfProject: currentProject.costOfProject || '',
            paidOut: currentProject.paidOut || '',
            objective: currentProject.objective || '',
            expectedOutput: currentProject.expectedOutput || '',
            expectedOutcome: currentProject.expectedOutcome || '',
            status: currentProject.status ? normalizeProjectStatus(currentProject.status) : 'Not started',
            overallProgress: currentProject.overallProgress !== undefined && currentProject.overallProgress !== null ? String(currentProject.overallProgress) : '',
            ministry: currentProject.ministry || '',
            stateDepartment: currentProject.stateDepartment || '',
            sector: currentProject.sector || '',
            categoryId: currentProject.categoryId ? String(currentProject.categoryId) : '',
            // Junction IDs are unused in this flow; leave arrays empty and rely on sites.
            countyIds: [],
            subcountyIds: [],
            wardIds: [],
            sites,
            // Location fields from location JSONB
            county: currentProject.county || '',
            constituency: currentProject.constituency || '',
            ward: currentProject.ward || '',
            // Additional JSONB fields
            budgetSource: currentProject.budgetSource || '',
            progressSummary: currentProject.progressSummary || '',
            latitude: currentProject.latitude || '',
            longitude: currentProject.longitude || '',
            feedbackEnabled: currentProject.feedbackEnabled !== undefined ? currentProject.feedbackEnabled : true,
            dataSources: currentProject.dataSources ? (Array.isArray(currentProject.dataSources) ? currentProject.dataSources : []) : [],
          };
          
          console.log('Form data to set:', formDataToSet);
          setFormData(formDataToSet);

          setInitialAssociations({ countyIds: [], subcountyIds: [], wardIds: [], sites });

        } catch (err) {
          setSnackbar({ open: true, message: 'Failed to load project associations for editing.', severity: 'error' });
          console.error("Error fetching project associations:", err);
        } finally {
          setLoading(false);
        }
      };
      fetchAssociations();
    } else if (!currentProject) {
      // Reset form when no project (new project mode)
      // For new projects, default to the configured default county (Kisumu)
      let defaultCountyIds = [];
      if (allMetadata?.counties) {
        // First try to find by countyId if specified in DEFAULT_COUNTY
        if (DEFAULT_COUNTY.countyId) {
          const countyById = allMetadata.counties.find(c => c.countyId === DEFAULT_COUNTY.countyId);
          if (countyById) {
            defaultCountyIds = [String(countyById.countyId)];
          }
        }
        // If not found by ID, find by name (case-insensitive, partial match)
        if (defaultCountyIds.length === 0 && DEFAULT_COUNTY.name) {
          const countyByName = allMetadata.counties.find(c => 
            c.name?.toLowerCase().includes(DEFAULT_COUNTY.name.toLowerCase())
          );
          if (countyByName) {
            defaultCountyIds = [String(countyByName.countyId)];
          }
        }
      }
      
      setFormData({
        projectName: '', projectDescription: '', startDate: '', endDate: '',
        directorate: '', costOfProject: '', paidOut: '',
        objective: '', expectedOutput: '', expectedOutcome: '',
        status: 'Not started',
        overallProgress: '',
        ministry: '', stateDepartment: '', sector: '',
        categoryId: '',
        countyIds: defaultCountyIds, // Default to configured default county (Kisumu)
        subcountyIds: [], wardIds: [],
        sites: [],
        // Additional JSONB fields (keep defaults stable for controlled inputs)
        budgetSource: '',
        progressSummary: '',
        latitude: '',
        longitude: '',
        feedbackEnabled: true,
        dataSources: [],
      });
      setInitialAssociations({ countyIds: defaultCountyIds, subcountyIds: [], wardIds: [], sites: [] });
      setLoading(false);
    }
  }, [currentProject?.id, setSnackbar, allMetadata]); // Use currentProject?.id to ensure it re-runs when project changes


  useEffect(() => {
    const fetchFormDropdowns = async () => {
        // Subcounty/ward dropdowns are no longer loaded from metadata in this flow.
        // Location is captured via project_sites (free-text county/constituency/ward on sites).
        setFormSubcounties([]);
        setFormWards([]);
    };

    fetchFormDropdowns();
  }, [formData.countyIds, formData.subcountyIds, allMetadata]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => {
        // Convert categoryId to string for consistency with dropdown values
        const processedValue = name === 'categoryId' ? String(value) : value;
        const newState = { ...prev, [name]: processedValue };

        // Clear subcounties and wards when counties change
        if (name === 'subcountyIds' && prev.subcountyIds[0] !== value[0]) { newState.wardIds = []; }

        return newState;
    });
  };

  const handleMultiSelectChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => {
        const newArrayValue = typeof value === 'string' ? value.split(',') : value;
        const newState = { ...prev, [name]: newArrayValue };
        
        // When counties change, clear subcounties and wards
        if (name === 'countyIds') {
            // Check if the selected counties have changed (not just order)
            const prevSet = new Set(prev.countyIds || []);
            const newSet = new Set(newArrayValue);
            const hasChanged = prevSet.size !== newSet.size || 
                !Array.from(newSet).every(id => prevSet.has(id));
            if (hasChanged) {
                newState.subcountyIds = [];
                newState.wardIds = [];
            }
        }
        // When subcounties change, clear wards
        if (name === 'subcountyIds') {
            const prevSet = new Set(prev.subcountyIds || []);
            const newSet = new Set(newArrayValue);
            const hasChanged = prevSet.size !== newSet.size || 
                !Array.from(newSet).every(id => prevSet.has(id));
            if (hasChanged) {
                newState.wardIds = [];
            }
        }
        
        return newState;
    });
  };

  const validateForm = () => {
    let errors = {};
    // Project name is required
    if (!formData.projectName || !formData.projectName.trim()) {
      errors.projectName = 'Project Name is required.';
    }
    // Project category is optional
    // Sites are no longer required during project creation - they will be added later on project details page
    // Validate date range only if both dates are provided
    if (formData.startDate && formData.endDate && new Date(formData.startDate) > new Date(formData.endDate)) {
      errors.date_range = 'End Date cannot be before Start Date.';
    }
    // Validate percentage complete (0-100)
    if (formData.overallProgress && formData.overallProgress !== '') {
      const percentage = parseFloat(formData.overallProgress);
      if (isNaN(percentage)) {
        errors.overallProgress = 'Percentage must be a valid number.';
      } else if (percentage < 0) {
        errors.overallProgress = 'Percentage cannot be less than 0.';
      } else if (percentage > 100) {
        errors.overallProgress = 'Percentage cannot exceed 100.';
      }
    }
    setFormErrors(errors);
    return { isValid: Object.keys(errors).length === 0, errors };
  };

  const synchronizeAssociations = useCallback(async (projectId, currentIds, newIds, addFn, removeFn) => {
    const idsToAdd = newIds.filter(id => !currentIds.includes(id));
    const idsToRemove = currentIds.filter(id => !newIds.includes(id));
    const addPromises = idsToAdd.map(id => addFn(projectId, id));
    const removePromises = idsToRemove.map(id => removeFn(projectId, id));
    await Promise.allSettled([...addPromises, ...removePromises]);
  }, []);

  const handleSubmit = useCallback(async () => {
    console.log('handleSubmit called');
    console.log('formData:', formData);
    
    const validationResult = validateForm();
    if (!validationResult.isValid) {
      console.log('Validation failed, errors:', validationResult.errors);
      // Show specific validation errors
      const errorMessages = Object.values(validationResult.errors).filter(msg => msg);
      const errorMessage = errorMessages.length > 0 
        ? `Please correct: ${errorMessages.join(', ')}`
        : 'Please correct the form errors.';
      setSnackbar({ open: true, message: errorMessage, severity: 'error' });
      return;
    }

    console.log('Validation passed, submitting...');
    setLoading(true);
    const dataToSubmit = { ...formData };
    
    // Note: Budget values are entered manually during project creation
    // Sites will be added later on the project details page
    // Note: Geographical coverage (counties) is optional and will default to Kisumu if not provided
    for (const key of ['costOfProject', 'paidOut']) {
      if (dataToSubmit[key] === '' || dataToSubmit[key] === null) { dataToSubmit[key] = null; } else if (typeof dataToSubmit[key] === 'string') { const parsed = parseFloat(dataToSubmit[key]); dataToSubmit[key] = isNaN(parsed) ? null : parsed; }
    }
    
    // Handle numeric conversions for additional fields
    for (const key of ['latitude', 'longitude']) {
      if (dataToSubmit[key] === '' || dataToSubmit[key] === null) { dataToSubmit[key] = null; } else if (typeof dataToSubmit[key] === 'string') { const parsed = parseFloat(dataToSubmit[key]); dataToSubmit[key] = isNaN(parsed) ? null : parsed; }
    }
    
    // Handle geographical coverage - convert to integers and filter invalid values
    let countyIdsToSave = (dataToSubmit.countyIds || []).map(id => parseInt(id, 10)).filter(id => !isNaN(id));
    const subcountyIdsToSave = (dataToSubmit.subcountyIds || []).map(id => parseInt(id, 10)).filter(id => !isNaN(id));
    const wardIdsToSave = (dataToSubmit.wardIds || []).map(id => parseInt(id, 10)).filter(id => !isNaN(id));
    
    // If no counties selected, default to the configured default county (Kisumu)
    // This ensures projects always have at least one county
    if (countyIdsToSave.length === 0 && allMetadata?.counties) {
      let defaultCounty = null;
      // First try to find by countyId if specified in DEFAULT_COUNTY
      if (DEFAULT_COUNTY.countyId) {
        defaultCounty = allMetadata.counties.find(c => c.countyId === DEFAULT_COUNTY.countyId);
      }
      // If not found by ID, find by name (case-insensitive, partial match)
      if (!defaultCounty && DEFAULT_COUNTY.name) {
        defaultCounty = allMetadata.counties.find(c => 
          c.name?.toLowerCase().includes(DEFAULT_COUNTY.name.toLowerCase())
        );
      }
      if (defaultCounty) {
        countyIdsToSave = [defaultCounty.countyId];
        console.log(`No counties selected, defaulting to ${DEFAULT_COUNTY.name} county:`, defaultCounty);
      }
    }
    
    // Convert categoryId to integer if present, otherwise set to null
    if (dataToSubmit.categoryId && dataToSubmit.categoryId !== '') {
      dataToSubmit.categoryId = parseInt(dataToSubmit.categoryId, 10) || null;
    } else {
      dataToSubmit.categoryId = null;
    }
    
    // Sites are no longer handled during project creation - they will be managed on project details page
    delete dataToSubmit.countyIds; delete dataToSubmit.subcountyIds; delete dataToSubmit.wardIds; delete dataToSubmit.sites;

    // Debug logging for sector, ministry, stateDepartment
    console.log('=== FORM SUBMISSION DEBUG ===');
    console.log('Sector value in formData:', formData.sector, 'in dataToSubmit:', dataToSubmit.sector);
    console.log('Ministry value in formData:', formData.ministry, 'in dataToSubmit:', dataToSubmit.ministry);
    console.log('StateDepartment value in formData:', formData.stateDepartment, 'in dataToSubmit:', dataToSubmit.stateDepartment);
    console.log('Full dataToSubmit keys:', Object.keys(dataToSubmit));
    console.log('Full dataToSubmit:', JSON.stringify(dataToSubmit, null, 2));

    let projectId = currentProject ? currentProject.id : null;

    try {
      if (currentProject) {
        await apiService.projects.updateProject(projectId, dataToSubmit);
        setSnackbar({ open: true, message: 'Project updated successfully!', severity: 'success' });
      } else {
        const createdProject = await apiService.projects.createProject(dataToSubmit);
        projectId = createdProject.id;
        setSnackbar({ open: true, message: 'Project created successfully!', severity: 'success' });
      }

      if (projectId) {
        await Promise.all([
          synchronizeAssociations(projectId, initialAssociations.countyIds.map(id => parseInt(id, 10)), countyIdsToSave, apiService.junctions.addProjectCounty, apiService.junctions.removeProjectCounty),
          synchronizeAssociations(projectId, initialAssociations.subcountyIds.map(id => parseInt(id, 10)), subcountyIdsToSave, apiService.junctions.addProjectSubcounty, apiService.junctions.removeProjectSubcounty),
          synchronizeAssociations(projectId, initialAssociations.wardIds.map(id => parseInt(id, 10)), wardIdsToSave, apiService.junctions.addProjectWard, apiService.junctions.removeProjectWard),
        ]);
      }
      onFormSuccess();
    } catch (err) {
      console.error("Submit project error:", err);
      console.error("Error response:", err.response?.data);
      console.error("Error message:", err.message);
      setSnackbar({ 
        open: true, 
        message: err.response?.data?.message || err.message || 'Failed to save project. Please check the console for details.', 
        severity: 'error' 
      });
    } finally {
      setLoading(false);
    }
  }, [formData, formErrors, currentProject, initialAssociations, onFormSuccess, setSnackbar, synchronizeAssociations, allMetadata]);

  const handleSitesChange = (sites) => {
    setFormData(prev => ({ ...prev, sites }));
  };

  return {
    formData, formErrors, loading, handleChange, handleMultiSelectChange, handleSubmit,
    formSubcounties, formWards,
  };
};

export default useProjectForm;
