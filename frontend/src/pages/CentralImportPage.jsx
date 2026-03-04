import React, { useState, useRef, useMemo, useEffect } from 'react';
import {
  Box, Typography, Button, Paper, CircularProgress, Alert, Snackbar, TextField,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Grid,
  FormControl, InputLabel, Select, MenuItem, FormHelperText, Card, CardContent,
  CardActions, Chip, Divider, Accordion, AccordionSummary, AccordionDetails,
  List, ListItem, ListItemText, ListItemIcon, Stepper, Step, StepLabel, StepContent
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import AddCircleIcon from '@mui/icons-material/AddCircle';
import WarningIcon from '@mui/icons-material/Warning';
import ErrorIcon from '@mui/icons-material/Error';
import { 
  CloudUpload as CloudUploadIcon, 
  Download as DownloadIcon, 
  Cancel as CancelIcon, 
  Add as AddIcon,
  Business as BusinessIcon,
  Assessment as AssessmentIcon,
  Map as MapIcon,
  AccountTree as AccountTreeIcon,
  CalendarToday as CalendarTodayIcon,
  AccountBalance as AccountBalanceIcon
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import apiService from '../api';
import { useAuth } from '../context/AuthContext.jsx';
import * as XLSX from 'xlsx';
// Removed client-side metadata caching - always use server-side check

/**
 * Helper function to check if the user has a specific privilege.
 */
const checkUserPrivilege = (user, privilegeName) => {
  return user && user.privileges && Array.isArray(user.privileges) && user.privileges.includes(privilegeName);
};

// Import type configurations
const IMPORT_TYPES = [
  {
    id: 'projects',
    name: 'Projects',
    description: 'Import project data including milestones, activities, and budgets',
    icon: <BusinessIcon />,
    privilege: 'project.create',
    endpoint: '/projects/import-data',
    templateEndpoint: '/projects/template',
    color: 'primary'
  },
  // Strategic Plans - Hidden
  // {
  //   id: 'strategic-plans',
  //   name: 'Strategic Plans',
  //   description: 'Import CIDP strategic plans, programs, and subprograms',
  //   icon: <AssessmentIcon />,
  //   privilege: 'strategic_plan.import',
  //   endpoint: '/strategy/import-cidp',
  //   templateEndpoint: '/strategy/template',
  //   color: 'secondary'
  // },
  // Map Data - Hidden for now
  // {
  //   id: 'map-data',
  //   name: 'Map Data',
  //   description: 'Import geographic data for projects and resources',
  //   icon: <MapIcon />,
  //   privilege: 'maps.import',
  //   endpoint: '/maps/import-data',
  //   templateEndpoint: '/maps/template',
  //   color: 'success'
  // },
  // Participants - Hidden
  // {
  //   id: 'participants',
  //   name: 'Participants',
  //   description: 'Import participant and stakeholder data',
  //   icon: <AccountTreeIcon />,
  //   privilege: 'participants.create',
  //   endpoint: '/participants/import-data',
  //   templateEndpoint: '/participants/template',
  //   color: 'warning'
  // },
  // Comprehensive Project Details - Hidden
  // {
  //   id: 'comprehensive-projects',
  //   name: 'Comprehensive Project Details',
  //   description: 'Import complete project data including strategic plans, programs, sub-programs, workplans, activities, milestones, and budgets',
  //   icon: <BusinessIcon />,
  //   privilege: 'project.create',
  //   endpoint: '/comprehensive-projects/preview',
  //   templateEndpoint: '/comprehensive-projects/template',
  //   color: 'info'
  // },
  // Budgets - Hidden for now
  // {
  //   id: 'budgets',
  //   name: 'Budgets',
  //   description: 'Import budget items including projects, departments, wards, and subcounties',
  //   icon: <AccountBalanceIcon />,
  //   privilege: 'budget.create',
  //   endpoint: '/budgets/import-data',
  //   templateEndpoint: '/budgets/template',
  //   color: 'success'
  // }
];

// Optional static template paths (served from backend api/templates/)
const STATIC_TEMPLATE_PATHS = {
  projects: '/api/templates/projects_import_template.xlsx',
};

// Expected column headers for each template type (used for client-side fallback generation)
const TEMPLATE_HEADERS = {
  // Canonical headers for Projects as requested
  projects: [
    'projectName',
    'ProjectDescription',
    'Status',
    'budget',
    'Disbursed',
    'financialYear',
    'department',
    'County',
    'Constituency',
    'ward',
    'Contracted',
    'StartDate',
    'EndDate',
    'sector',
    'agency'
  ],
  'strategic-plans': [
    'Plan Name', 'Plan Code', 'Program', 'Subprogram', 'Objective', 'Outcome', 'Output',
    'Indicator', 'Baseline', 'Target', 'Year', 'Budget (KES)', 'Department'
  ],
  'map-data': [
    'Entity Type', 'Entity Name', 'Project Code', 'Latitude', 'Longitude', 'Geometry Type',
    'GeoJSON', 'Description', 'County', 'Sub-County', 'Ward'
  ],
  participants: [
    'Individual ID', 'First Name', 'Last Name', 'Gender', 'Date of Birth', 'Phone', 'Email',
    'County', 'Sub-County', 'Ward', 'Village', 'Enrollment Date', 'Notes'
  ]
};

// Optional: header variants shown in a second row to guide users
const TEMPLATE_HEADER_VARIANTS = {
  projects: {
    projectName: ['Project Name', 'Name', 'Title'],
    ProjectDescription: ['Description', 'Project Description', 'Details'],
    Status: ['Project Status', 'Current Status'],
    budget: ['Budget', 'Estimated Cost', 'Budget (KES)'],
    Disbursed: ['Disbursed', 'Amount Disbursed', 'Disbursed Amount', 'Amount Paid', 'Expenditure', 'amountPaid'],
    financialYear: ['FY', 'Financial Year', 'Year'],
    department: ['Department', 'Implementing Department', 'Directorate'],
    County: ['County', 'County Name'],
    Constituency: ['Constituency', 'Constituency Name'],
    ward: ['Ward', 'Ward Name'],
    Contracted: ['Is Contracted', 'Contracted?', 'Contract Status'],
    StartDate: ['Start Date', 'Project Start Date', 'Commencement Date'],
    EndDate: ['End Date', 'Project End Date', 'Completion Date']
  }
};

function CentralImportPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [selectedImportType, setSelectedImportType] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
  const [importReport, setImportReport] = useState(null);
  const [previewData, setPreviewData] = useState(null);
  const [parsedHeaders, setParsedHeaders] = useState([]);
  const [fullParsedData, setFullParsedData] = useState([]);
  const [mappingSummary, setMappingSummary] = useState(null);
  const [showMappingPreview, setShowMappingPreview] = useState(false);
  
  const fileInputRef = useRef(null);

  const currentImportType = IMPORT_TYPES.find(type => type.id === selectedImportType);

  // Calculate current step for the import process
  const getCurrentStep = () => {
    if (!selectedImportType) return 0;
    if (!selectedFile) return 1;
    if (!previewData) return 2;
    if ((currentImportType?.id === 'projects' || currentImportType?.id === 'budgets') && mappingSummary && !showMappingPreview) return 3;
    if ((currentImportType?.id === 'projects' || currentImportType?.id === 'budgets') && showMappingPreview) return 4;
    return 3; // Ready to confirm
  };

  const currentStep = getCurrentStep();

  const handleImportTypeChange = (event) => {
    const typeId = event.target.value;
    setSelectedImportType(typeId);
    // Reset all data when changing import type
    setSelectedFile(null);
    setImportReport(null);
    setPreviewData(null);
    setParsedHeaders([]);
    setFullParsedData([]);
    setMappingSummary(null);
    setShowMappingPreview(false);
  };


  const handleFileChange = (event) => {
    setSelectedFile(event.target.files[0]);
    setImportReport(null);
    setPreviewData(null);
    setParsedHeaders([]);
    setFullParsedData([]);
    setMappingSummary(null);
    setShowMappingPreview(false);
  };

  const handleUploadForPreview = async () => {
    if (!currentImportType) {
      setSnackbar({ open: true, message: 'Please select an import type first.', severity: 'warning' });
      return;
    }

    if (!checkUserPrivilege(user, currentImportType.privilege)) {
      setSnackbar({ open: true, message: `You do not have permission to import ${currentImportType.name.toLowerCase()}.`, severity: 'error' });
      return;
    }

    if (!selectedFile) {
      setSnackbar({ open: true, message: 'Please select a file to import.', severity: 'warning' });
      return;
    }

    setLoading(true);
    setSnackbar({ open: true, message: 'Parsing file for preview...', severity: 'info' });
    setImportReport(null);
    setPreviewData(null);
    setParsedHeaders([]);
    setFullParsedData([]);
    setMappingSummary(null);
    setShowMappingPreview(false);

    const formData = new FormData();
    // Use backend-expected field names per import type
    const fileFieldName = currentImportType.id === 'strategic-plans' ? 'importFile' : 'file';
    formData.append(fileFieldName, selectedFile);

    try {
      let response;
      
      // Route to appropriate API based on import type
      switch (currentImportType.id) {
        case 'projects':
          response = await apiService.projects.previewProjectImport(formData);
          break;
        case 'strategic-plans':
          response = await apiService.strategy.previewStrategicPlanData(formData);
          break;
        case 'map-data':
          response = await apiService.projectMaps.previewMapDataImport(formData);
          break;
        case 'participants':
          response = await apiService.participants.previewParticipantImport(formData);
          break;
        case 'comprehensive-projects':
          response = await apiService.comprehensiveProjects.previewComprehensiveImport(formData);
          break;
        case 'budgets':
          response = await apiService.budgets.previewBudgetImport(formData);
          break;
        default:
          throw new Error('Unknown import type');
      }

      setSnackbar({ open: true, message: response.message, severity: 'success' });
      setPreviewData(response.previewData);
      // Use mapped keys from preview objects to display correct columns
      const derivedHeaders = Array.isArray(response.previewData) && response.previewData.length > 0
        ? Object.keys(response.previewData[0])
        : (response.headers || []);
      setParsedHeaders(derivedHeaders);
      // For budget imports, fullData is not sent to prevent memory issues
      // We'll need to re-parse or use previewData only for metadata check
      // Store preview data as fullData for now (will be limited)
      setFullParsedData(response.fullData || response.previewData);
      setImportReport({
        success: true,
        message: response.message,
        details: {
          unrecognizedHeaders: response.unrecognizedHeaders || [],
        }
      });


      // Deduplicate case-insensitive duplicates in mapping summary
      // Keeps the first occurrence of each case-insensitive match
      const deduplicateCaseInsensitive = (arr) => {
        const seen = new Map(); // Map of lowercase -> first occurrence
        arr.forEach(item => {
          const lower = String(item).toLowerCase().trim();
          if (!seen.has(lower)) {
            seen.set(lower, item);
          }
        });
        return Array.from(seen.values());
      };

      // Automatically check metadata for projects and budget imports after preview
      // This helps users review metadata before confirming import
      if (currentImportType.id === 'budgets' && selectedFile) {
        try {
          console.log(`Automatically checking metadata for ${currentImportType.id} import...`);
          const metadataFormData = new FormData();
          metadataFormData.append('file', selectedFile);
          
          const mappingResponse = currentImportType.id === 'projects'
            ? await apiService.projects.checkMetadataMapping(metadataFormData)
            : await apiService.budgets.checkMetadataMapping(metadataFormData);
          
          if (mappingResponse && mappingResponse.success && mappingResponse.mappingSummary) {
            const mappingSummary = mappingResponse.mappingSummary;
            const deduplicatedSummary = {
              ...mappingSummary,
              budgets: {
                existing: deduplicateCaseInsensitive(mappingSummary.budgets?.existing || []),
                new: deduplicateCaseInsensitive(mappingSummary.budgets?.new || []),
                unmatched: deduplicateCaseInsensitive(mappingSummary.budgets?.unmatched || [])
              },
              departments: {
                existing: deduplicateCaseInsensitive(mappingSummary.departments?.existing || []),
                new: deduplicateCaseInsensitive(mappingSummary.departments?.new || []),
                unmatched: deduplicateCaseInsensitive(mappingSummary.departments?.unmatched || [])
              },
              subcounties: {
                existing: deduplicateCaseInsensitive(mappingSummary.subcounties?.existing || []),
                new: deduplicateCaseInsensitive(mappingSummary.subcounties?.new || []),
                unmatched: deduplicateCaseInsensitive(mappingSummary.subcounties?.unmatched || [])
              },
              wards: {
                existing: deduplicateCaseInsensitive(mappingSummary.wards?.existing || []),
                new: deduplicateCaseInsensitive(mappingSummary.wards?.new || []),
                unmatched: deduplicateCaseInsensitive(mappingSummary.wards?.unmatched || [])
              },
              financialYears: {
                existing: deduplicateCaseInsensitive(mappingSummary.financialYears?.existing || []),
                new: deduplicateCaseInsensitive(mappingSummary.financialYears?.new || []),
                unmatched: deduplicateCaseInsensitive(mappingSummary.financialYears?.unmatched || [])
              },
              counties: mappingSummary.counties ? {
                existing: deduplicateCaseInsensitive(mappingSummary.counties?.existing || []),
                new: deduplicateCaseInsensitive(mappingSummary.counties?.new || []),
                unmatched: deduplicateCaseInsensitive(mappingSummary.counties?.unmatched || [])
              } : undefined,
              constituencies: mappingSummary.constituencies ? {
                existing: deduplicateCaseInsensitive(mappingSummary.constituencies?.existing || []),
                new: deduplicateCaseInsensitive(mappingSummary.constituencies?.new || []),
                unmatched: deduplicateCaseInsensitive(mappingSummary.constituencies?.unmatched || [])
              } : undefined,
              kenyaWards: mappingSummary.kenyaWards ? {
                existing: deduplicateCaseInsensitive(mappingSummary.kenyaWards?.existing || []),
                new: deduplicateCaseInsensitive(mappingSummary.kenyaWards?.new || []),
                unmatched: deduplicateCaseInsensitive(mappingSummary.kenyaWards?.unmatched || [])
              } : undefined,
              implementingAgencies: mappingSummary.implementingAgencies ? {
                existing: deduplicateCaseInsensitive(mappingSummary.implementingAgencies?.existing || []),
                new: deduplicateCaseInsensitive(mappingSummary.implementingAgencies?.new || []),
                unmatched: deduplicateCaseInsensitive(mappingSummary.implementingAgencies?.unmatched || [])
              } : undefined,
              duplicateProjectNames: mappingSummary.duplicateProjectNames || []
            };

            setMappingSummary(deduplicatedSummary);
            // Automatically show mapping preview for projects and budgets
            setShowMappingPreview(true);
            setSnackbar({ 
              open: true, 
              message: 'Preview completed. Please review metadata mapping before confirming import.', 
              severity: 'info' 
            });
          }
        } catch (mappingErr) {
          console.error('Automatic metadata mapping check error:', mappingErr);
          // Don't block preview if metadata check fails, just log it
          // User can still manually trigger metadata check if needed
        }
      }

    } catch (err) {
      console.error('File parsing error:', err);
      setSnackbar({ open: true, message: err.response?.data?.message || 'Failed to parse file for preview.', severity: 'error' });
      setImportReport({ success: false, message: err.response?.data?.message || 'Failed to parse file for preview.' });
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmImport = async () => {
    if (!currentImportType) {
      setSnackbar({ open: true, message: 'Please select an import type first.', severity: 'warning' });
      return;
    }

    if (!checkUserPrivilege(user, currentImportType.privilege)) {
      setSnackbar({ open: true, message: `You do not have permission to confirm ${currentImportType.name.toLowerCase()} import.`, severity: 'error' });
      return;
    }

    // For budget imports, we need to re-upload the file since fullData is not sent in preview
    if (currentImportType.id === 'budgets') {
      if (!selectedFile) {
        setSnackbar({ open: true, message: 'Please select and preview the file again before confirming import.', severity: 'warning' });
        return;
      }
      // Re-upload the file for confirmation (it will be processed on the server)
      setSnackbar({ open: true, message: 'Re-uploading file for import confirmation...', severity: 'info' });
      // We'll handle this in the confirm endpoint by re-processing the file
    }

    if (!fullParsedData || fullParsedData.length === 0) {
      setSnackbar({ open: true, message: 'No data to confirm import. Please preview the file first.', severity: 'warning' });
      return;
    }

    setLoading(true);
    setSnackbar({ open: true, message: 'Confirming import and saving data...', severity: 'info' });
    setImportReport(null);

    try {
      let response;
      
      // Route to appropriate API based on import type
      switch (currentImportType.id) {
        case 'projects':
          response = await apiService.projects.confirmProjectImport({ dataToImport: fullParsedData });
          break;
        case 'strategic-plans':
          response = await apiService.strategy.confirmStrategicPlanImport({ dataToImport: fullParsedData });
          break;
        case 'map-data':
          response = await apiService.projectMaps.confirmMapDataImport({ dataToImport: fullParsedData });
          break;
        case 'participants':
          response = await apiService.participants.confirmParticipantImport({ dataToImport: fullParsedData });
          break;
        case 'comprehensive-projects':
          response = await apiService.comprehensiveProjects.confirmComprehensiveImport({ dataToImport: fullParsedData });
          break;
        case 'budgets':
          // For budgets, always re-upload the file since preview doesn't send fullData (only previewData with 10 rows)
          // This ensures all rows are imported, not just the preview
          // The backend will extract the budget name from the file and look up the budgetId
          if (!selectedFile) {
            throw new Error('File is required for budget import. Please select and preview the file again.');
          }
          // Re-upload file for import (backend will parse the full file and extract budget from it)
          const confirmFormData = new FormData();
          confirmFormData.append('file', selectedFile);
          response = await apiService.budgets.confirmBudgetImport(confirmFormData);
          break;
        default:
          throw new Error('Unknown import type');
      }

      setSnackbar({ open: true, message: response.message, severity: 'success' });
      setImportReport(response);
      setSelectedFile(null);
      setPreviewData(null);
      setParsedHeaders([]);
      setFullParsedData([]);
      
      // Navigate back to appropriate page after successful import
      setTimeout(() => {
        switch (currentImportType.id) {
          case 'projects':
            navigate('/projects');
            break;
          case 'strategic-plans':
            navigate('/strategic-planning');
            break;
          case 'map-data':
            navigate('/maps');
            break;
          case 'participants':
            navigate('/participants');
            break;
          case 'comprehensive-projects':
            navigate('/projects');
            break;
          case 'budgets':
            navigate('/budgets');
            break;
          default:
            navigate('/dashboard');
        }
      }, 2000);

    } catch (err) {
      console.error('Import confirmation error:', err);
      console.error('Error response:', err.response?.data);
      const errorMessage = err.response?.data?.message || err.message || 'Failed to confirm import.';
      const errorDetails = err.response?.data?.details || (err.response?.data?.errors ? { errors: err.response.data.errors } : null);
      
      // Log error details for debugging
      if (errorDetails?.errors) {
        console.error('Import errors:', errorDetails.errors);
      }
      
      setSnackbar({ 
        open: true, 
        message: errorMessage, 
        severity: 'error',
        autoHideDuration: errorDetails?.errors?.length > 0 ? 10000 : 6000 // Show longer if there are detailed errors
      });
      setImportReport({ 
        success: false, 
        message: errorMessage,
        details: errorDetails
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCancelImport = () => {
    setSelectedFile(null);
    setPreviewData(null);
    setParsedHeaders([]);
    setFullParsedData([]);
    setImportReport(null);
    setMappingSummary(null);
    setShowMappingPreview(false);
    setSnackbar({ open: true, message: 'Import process cancelled.', severity: 'info' });
  };

  const handleDownloadTemplate = async () => {
    if (!currentImportType) {
      setSnackbar({ open: true, message: 'Please select an import type first.', severity: 'warning' });
      return;
    }

    setLoading(true);
    try {
      let response;
      
      // Route to appropriate template endpoint
      switch (currentImportType.id) {
        case 'projects':
          response = await apiService.projects.downloadProjectTemplate();
          break;
        case 'strategic-plans':
          response = await apiService.strategy.downloadStrategicPlanTemplate();
          break;
        case 'map-data':
          response = await apiService.projectMaps.downloadMapDataTemplate();
          break;
        case 'participants':
          response = await apiService.participants.downloadParticipantTemplate();
          break;
        case 'comprehensive-projects':
          response = await apiService.comprehensiveProjects.downloadComprehensiveTemplate();
          break;
        case 'budgets':
          response = await apiService.budgets.downloadBudgetTemplate();
          break;
        default:
          throw new Error('Unknown import type');
      }

      // Create a blob URL and a link to download the file
      const blob = new Blob([response], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${currentImportType.name.toLowerCase().replace(' ', '_')}_import_template.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      setSnackbar({ open: true, message: 'Template downloaded successfully!', severity: 'success' });
    } catch (error) {
      // Fallback 1: Check for a static template under frontend public/templates
      try {
        const staticPath = STATIC_TEMPLATE_PATHS[currentImportType.id];
        if (staticPath) {
          const res = await fetch(staticPath);
          if (!res.ok) throw new Error('Static template not found');
          const blob = await res.blob();
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `${currentImportType.name.toLowerCase().replace(' ', '_')}_import_template.xlsx`;
          document.body.appendChild(a);
          a.click();
          a.remove();
          window.URL.revokeObjectURL(url);
          setSnackbar({ open: true, message: 'Template downloaded from static assets.', severity: 'success' });
          return;
        }
      } catch (staticErr) {
        // proceed to fallback generation
      }

      // Fallback 2: generate a header-only template client-side if server/static template is unavailable
      try {
        const headers = TEMPLATE_HEADERS[currentImportType.id] || [];
        if (headers.length === 0) throw new Error('No fallback headers defined for this import type.');
        // Build a second row with variants where available
        let data = [headers];
        const variantsMap = (TEMPLATE_HEADER_VARIANTS[currentImportType.id] || {});
        const variantRow = headers.map((h) => {
          const variants = variantsMap[h];
          return variants && variants.length ? `Variants: ${variants.join(' | ')}` : '';
        });
        if (variantRow.some((cell) => cell)) {
          data.push(variantRow);
        }

        const worksheet = XLSX.utils.aoa_to_sheet(data);
        // Optional: Freeze top row
        worksheet['!freeze'] = { xSplit: 0, ySplit: 1 };
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Template');
        const wbout = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
        const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${currentImportType.name.toLowerCase().replace(' ', '_')}_import_template.xlsx`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
        setSnackbar({ open: true, message: 'Template generated with expected headers.', severity: 'success' });
      } catch (fallbackError) {
        setSnackbar({ open: true, message: 'Failed to download or generate template.', severity: 'error' });
        console.error('Template download/generation error:', error, fallbackError);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCheckMetadata = async () => {
    if (!currentImportType || currentImportType.id !== 'budgets') {
      return;
    }

    // For budget imports, we need the file to check all rows (not just preview)
    if (!selectedFile) {
      setSnackbar({ open: true, message: 'Please select and preview the file first before checking metadata.', severity: 'warning' });
      return;
    }

    setLoading(true);
    setSnackbar({ open: true, message: 'Checking metadata mappings from file...', severity: 'info' });

    try {
      // For budget imports, re-upload the file so server can parse ALL rows (not just 10 preview rows)
      // The metadata check endpoint now accepts file uploads and will parse the full file
      const formData = new FormData();
      formData.append('file', selectedFile);
      
      console.log('Uploading file for complete metadata check (all rows)');
      const startTime = Date.now();
      
      // Upload file directly to metadata check endpoint (it will parse the full file)
      const mappingResponse = await apiService.budgets.checkMetadataMapping(formData);
      const checkTime = Date.now() - startTime;
      console.log(`Server-side metadata check completed in ${checkTime}ms`);
      
      if (mappingResponse && mappingResponse.success && mappingResponse.mappingSummary) {
        const mappingSummary = mappingResponse.mappingSummary;
        // Deduplicate case-insensitive duplicates
        const deduplicateCaseInsensitive = (arr) => {
          const seen = new Map();
          arr.forEach(item => {
            const lower = String(item).toLowerCase().trim();
            if (!seen.has(lower)) {
              seen.set(lower, item);
              }
            });
            return Array.from(seen.values());
          };

          const deduplicatedSummary = {
            ...mappingSummary,
            budgets: {
              existing: deduplicateCaseInsensitive(mappingSummary.budgets?.existing || []),
              new: deduplicateCaseInsensitive(mappingSummary.budgets?.new || []),
              unmatched: deduplicateCaseInsensitive(mappingSummary.budgets?.unmatched || [])
            },
            departments: {
              existing: deduplicateCaseInsensitive(mappingSummary.departments?.existing || []),
              new: deduplicateCaseInsensitive(mappingSummary.departments?.new || []),
              unmatched: deduplicateCaseInsensitive(mappingSummary.departments?.unmatched || [])
            },
            subcounties: {
              existing: deduplicateCaseInsensitive(mappingSummary.subcounties?.existing || []),
              new: deduplicateCaseInsensitive(mappingSummary.subcounties?.new || []),
              unmatched: deduplicateCaseInsensitive(mappingSummary.subcounties?.unmatched || [])
            },
            wards: {
              existing: deduplicateCaseInsensitive(mappingSummary.wards?.existing || []),
              new: deduplicateCaseInsensitive(mappingSummary.wards?.new || []),
              unmatched: deduplicateCaseInsensitive(mappingSummary.wards?.unmatched || [])
            },
            financialYears: {
              existing: deduplicateCaseInsensitive(mappingSummary.financialYears?.existing || []),
              new: deduplicateCaseInsensitive(mappingSummary.financialYears?.new || []),
              unmatched: deduplicateCaseInsensitive(mappingSummary.financialYears?.unmatched || [])
            },
            duplicateProjectNames: mappingSummary.duplicateProjectNames || []
          };

        setMappingSummary(deduplicatedSummary);
        setShowMappingPreview(true);
        setSnackbar({ open: true, message: 'Metadata check completed successfully.', severity: 'success' });
      } else {
        console.warn('Budget import: Metadata mapping check returned unsuccessful or missing mappingSummary:', mappingResponse);
        setSnackbar({ open: true, message: 'Metadata check completed but no summary was returned.', severity: 'warning' });
      }
    } catch (mappingErr) {
      console.error('Budget metadata mapping check error:', mappingErr);
      console.error('Budget metadata mapping check error details:', mappingErr.response?.data || mappingErr.message);
      setSnackbar({ 
        open: true, 
        message: `Metadata check failed: ${mappingErr.response?.data?.message || mappingErr.message || 'Unknown error'}. Please try again.`, 
        severity: 'error' 
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCloseSnackbar = (event, reason) => {
    if (reason === 'clickaway') return;
    setSnackbar({ ...snackbar, open: false });
  };
  
  const isUploadButtonDisabled = !selectedFile || loading || !currentImportType || !checkUserPrivilege(user, currentImportType.privilege);

  return (
    <Box sx={{ p: 2 }}>
      <Typography variant="h5" gutterBottom sx={{ mb: 0.5 }}>Central Data Import Hub</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Choose the type of data you want to import and upload your Excel file
      </Typography>

      {/* Import Type Selection */}
      <Paper elevation={2} sx={{ p: 1.5, borderRadius: '8px', mb: 2 }}>
        <Typography variant="body2" fontWeight={600} gutterBottom sx={{ mb: 1, fontSize: '0.9rem' }}>Select Import Type</Typography>
        <FormControl fullWidth size="small" sx={{ mb: selectedImportType ? 1 : 0 }}>
          <InputLabel>Import Type</InputLabel>
          <Select
            value={selectedImportType}
            onChange={handleImportTypeChange}
            label="Import Type"
          >
            {IMPORT_TYPES.map((type) => (
              <MenuItem key={type.id} value={type.id}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Box sx={{ fontSize: '1.1rem' }}>{type.icon}</Box>
                  <Box>
                    <Typography variant="body2" sx={{ fontSize: '0.875rem' }}>{type.name}</Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
                      {type.description}
                    </Typography>
                  </Box>
                </Box>
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        {/* Compact Import Type Info */}
        {selectedImportType && (
          <Box sx={{ 
            mt: 1, 
            p: 1, 
            bgcolor: 'action.hover', 
            borderRadius: 1,
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            flexWrap: 'wrap'
          }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
              <Box sx={{ fontSize: '1rem', color: 'primary.main' }}>{currentImportType.icon}</Box>
              <Typography variant="body2" fontWeight={600} sx={{ fontSize: '0.85rem' }}>
                {currentImportType.name}
              </Typography>
            </Box>
            <Chip 
              label={currentImportType.privilege} 
              color={currentImportType.color} 
              size="small"
              sx={{ height: 20, fontSize: '0.65rem', '& .MuiChip-label': { px: 0.75 } }}
            />
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.75rem', ml: 'auto' }}>
              {currentImportType.description}
            </Typography>
          </Box>
        )}
      </Paper>

      {/* File Upload Section */}
      {selectedImportType && (
        <Paper elevation={2} sx={{ p: 2, borderRadius: '8px' }}>
          <Typography variant="subtitle1" fontWeight={600} gutterBottom sx={{ mb: 1.5 }}>Upload Excel File (.xlsx)</Typography>
          
          <Grid container spacing={1.5} alignItems="center">
            <Grid item xs={12} sm={4} md={3}>
              <Button
                variant="outlined"
                startIcon={<DownloadIcon />}
                onClick={handleDownloadTemplate}
                fullWidth
                disabled={loading}
              >
                Download Template
              </Button>
            </Grid>
            
            <Grid item xs={12} sm={8} md={6}>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <input
                  type="file"
                  accept="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
                  onChange={handleFileChange}
                  style={{ display: 'none' }}
                  id="file-upload-input"
                  ref={fileInputRef}
                />
                <TextField
                  fullWidth
                  size="small"
                  value={selectedFile ? selectedFile.name : ''}
                  placeholder="No file selected"
                  InputProps={{
                    readOnly: true,
                    endAdornment: (
                      <Button 
                        component="label" 
                        htmlFor="file-upload-input" 
                        variant="text" 
                        startIcon={<AddIcon />}
                        sx={{ whiteSpace: 'nowrap' }}
                      >
                        Choose File
                      </Button>
                    ),
                  }}
                />
              </Box>
            </Grid>
            
            <Grid item xs={12} md={3}>
              {!previewData && (
                <Button
                  variant="contained"
                  startIcon={<CloudUploadIcon />}
                  onClick={handleUploadForPreview}
                  disabled={isUploadButtonDisabled}
                  fullWidth
                >
                  {loading ? <CircularProgress size={24} color="inherit" /> : 'Upload & Preview'}
                </Button>
              )}

              {previewData && (
                <Button
                  variant="outlined"
                  color="error"
                  startIcon={<CancelIcon />}
                  onClick={handleCancelImport}
                  disabled={loading}
                  fullWidth
                >
                  Cancel
                </Button>
              )}
            </Grid>
          </Grid>
          
          {/* Data Preview Section */}
          {previewData && previewData.length > 0 && (
            <Box sx={{ mt: 2 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                <Typography variant="subtitle1" fontWeight={600}>Data Preview (First {previewData.length} Rows)</Typography>
                {currentImportType?.id === 'budgets' && !mappingSummary && (
                  <Button
                    variant="outlined"
                    color="primary"
                    startIcon={<AssessmentIcon />}
                    onClick={handleCheckMetadata}
                    disabled={loading}
                    size="small"
                  >
                    {loading ? 'Checking...' : 'Check Metadata'}
                  </Button>
                )}
              </Box>
              <TableContainer component={Paper} elevation={1} sx={{ maxHeight: 300, overflow: 'auto', mb: 2 }}>
                <Table stickyHeader size="small">
                  <TableHead>
                    <TableRow>
                      {parsedHeaders.map((header, index) => (
                        <TableCell key={index} sx={{ fontWeight: 'bold', backgroundColor: '#e0e0e0', fontSize: '0.75rem' }}>
                          {header}
                        </TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {previewData.map((row, rowIndex) => (
                      <TableRow key={rowIndex}>
                        {parsedHeaders.map((header, colIndex) => (
                          <TableCell key={`${rowIndex}-${colIndex}`} sx={{ fontSize: '0.75rem' }}>
                            {String(row[header] || '')}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
              {importReport && importReport.details && importReport.details.unrecognizedHeaders && importReport.details.unrecognizedHeaders.length > 0 && (
                <Alert severity="warning" sx={{ mb: 2 }}>
                  <Typography variant="caption" sx={{ fontSize: '0.8rem' }}>
                    Warning: The following headers were found but are not recognized: {importReport.details.unrecognizedHeaders.join(', ')}. Data in these columns will be ignored.
                  </Typography>
                </Alert>
              )}
            </Box>
          )}

          {/* Metadata Mapping Preview - For Projects and Budgets - Now Prominently Displayed */}
          {(currentImportType?.id === 'projects' || currentImportType?.id === 'budgets') && mappingSummary && (
            <Box sx={{ mt: 2 }}>
              <Paper 
                elevation={3} 
                sx={{ 
                  p: 2, 
                  borderRadius: '8px', 
                  border: '2px solid', 
                  borderColor: 'primary.main',
                  background: 'linear-gradient(180deg, rgba(102, 126, 234, 0.05) 0%, rgba(255, 255, 255, 1) 100%)'
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Box sx={{ 
                      p: 0.75, 
                      borderRadius: 1.5, 
                      bgcolor: 'primary.main', 
                      color: 'white',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                      <AssessmentIcon fontSize="small" />
                    </Box>
                    <Box>
                      <Typography variant="subtitle1" fontWeight={700} sx={{ fontSize: '1rem' }}>
                        Metadata Mapping Preview
                      </Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
                        ⚠️ Required: Review this before confirming import
                      </Typography>
                    </Box>
                  </Box>
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={() => setShowMappingPreview(!showMappingPreview)}
                    startIcon={<AssessmentIcon />}
                  >
                    {showMappingPreview ? 'Hide Details' : 'Show Details'}
                  </Button>
                </Box>
                
                {showMappingPreview ? (
                  <>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5, fontSize: '0.85rem' }}>
                      Review how your data will be mapped to existing metadata. Items marked as "Need to be Created" will be skipped during import if not created first.
                    </Typography>
                    <Alert severity="info" sx={{ mb: 1.5, py: 0.75 }}>
                      <Typography variant="body2" sx={{ fontSize: '0.85rem' }}>
                        <strong>Note:</strong> The system checks both names and aliases when matching metadata (case-insensitive). 
                        Items not found will be skipped during import. Please create missing metadata in the Metadata Management section before proceeding.
                      </Typography>
                    </Alert>

                <Grid container spacing={1.5}>
                  {/* Budgets and Financial Years - Only for Budget Import */}
                  {currentImportType?.id === 'budgets' && mappingSummary.budgets && (
                    <>
                      <Grid item xs={12} md={6}>
                        <Card variant="outlined" sx={{ '& .MuiCardContent-root': { py: 1.5, '&:last-child': { pb: 1.5 } } }}>
                          <CardContent>
                            <Typography variant="body2" fontWeight={600} gutterBottom sx={{ fontSize: '0.875rem' }}>
                              Budgets ({mappingSummary.budgets.existing.length + mappingSummary.budgets.new.length})
                            </Typography>
                            {mappingSummary.budgets.existing.length > 0 && (
                              <Box sx={{ mb: 0.75 }}>
                                <Typography variant="caption" color="success.main" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, fontSize: '0.75rem' }}>
                                  <CheckCircleIcon fontSize="small" /> {mappingSummary.budgets.existing.length} Existing
                                </Typography>
                                <List dense sx={{ py: 0 }}>
                                  {mappingSummary.budgets.existing.map((budget, idx) => (
                                    <ListItem key={idx} sx={{ py: 0, px: 0.5 }}>
                                      <ListItemIcon sx={{ minWidth: 20 }}>
                                        <CheckCircleIcon fontSize="small" color="success" />
                                      </ListItemIcon>
                                      <ListItemText primary={budget} primaryTypographyProps={{ variant: 'caption', sx: { fontSize: '0.75rem' } }} />
                                    </ListItem>
                                  ))}
                                </List>
                              </Box>
                            )}
                            {mappingSummary.budgets.new.length > 0 && (
                              <Box>
                                <Typography variant="caption" color="warning.main" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, fontSize: '0.75rem' }}>
                                  <AddCircleIcon fontSize="small" /> {mappingSummary.budgets.new.length} Need to be Created
                                </Typography>
                                <List dense sx={{ py: 0 }}>
                                  {mappingSummary.budgets.new.map((budget, idx) => (
                                    <ListItem key={idx} sx={{ py: 0, px: 0.5 }}>
                                      <ListItemIcon sx={{ minWidth: 20 }}>
                                        <AddCircleIcon fontSize="small" color="warning" />
                                      </ListItemIcon>
                                      <ListItemText primary={budget} primaryTypographyProps={{ variant: 'caption', sx: { fontSize: '0.75rem' } }} />
                                    </ListItem>
                                  ))}
                                </List>
                              </Box>
                            )}
                          </CardContent>
                        </Card>
                      </Grid>
                      
                      {/* Financial Years - Next to Budgets for Budget Import */}
                      {mappingSummary.financialYears && (
                        <Grid item xs={12} md={6}>
                          <Card variant="outlined" sx={{ '& .MuiCardContent-root': { py: 1.5, '&:last-child': { pb: 1.5 } } }}>
                            <CardContent>
                              <Typography variant="body2" fontWeight={600} gutterBottom sx={{ fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                <CalendarTodayIcon fontSize="small" />
                                Financial Years ({mappingSummary.financialYears?.existing.length + mappingSummary.financialYears?.new.length || 0})
                              </Typography>
                              {mappingSummary.financialYears?.existing.length > 0 && (
                                <Box sx={{ mb: 0.75 }}>
                                  <Typography variant="caption" color="success.main" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, fontSize: '0.75rem' }}>
                                    <CheckCircleIcon fontSize="small" /> {mappingSummary.financialYears.existing.length} Existing
                                  </Typography>
                                  <List dense sx={{ py: 0 }}>
                                    {mappingSummary.financialYears.existing.map((fy, idx) => (
                                      <ListItem key={idx} sx={{ py: 0, px: 0.5 }}>
                                        <ListItemIcon sx={{ minWidth: 20 }}>
                                          <CheckCircleIcon fontSize="small" color="success" />
                                        </ListItemIcon>
                                        <ListItemText primary={fy} primaryTypographyProps={{ variant: 'caption', sx: { fontSize: '0.75rem' } }} />
                                      </ListItem>
                                    ))}
                                  </List>
                                </Box>
                              )}
                              {mappingSummary.financialYears?.new.length > 0 && (
                                <Box>
                                  <Typography variant="caption" color="warning.main" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, fontSize: '0.75rem' }}>
                                    <AddCircleIcon fontSize="small" /> {mappingSummary.financialYears.new.length} Need to be Created
                                  </Typography>
                                  <List dense sx={{ py: 0 }}>
                                    {mappingSummary.financialYears.new.map((fy, idx) => (
                                      <ListItem key={idx} sx={{ py: 0, px: 0.5 }}>
                                        <ListItemIcon sx={{ minWidth: 20 }}>
                                          <AddCircleIcon fontSize="small" color="warning" />
                                        </ListItemIcon>
                                        <ListItemText primary={fy} primaryTypographyProps={{ variant: 'caption', sx: { fontSize: '0.75rem' } }} />
                                      </ListItem>
                                    ))}
                                  </List>
                                </Box>
                              )}
                            </CardContent>
                          </Card>
                        </Grid>
                      )}
                    </>
                  )}

                  {/* Departments */}
                  <Grid item xs={12} md={6}>
                    <Card variant="outlined" sx={{ '& .MuiCardContent-root': { py: 1.5, '&:last-child': { pb: 1.5 } } }}>
                      <CardContent>
                        <Typography variant="body2" fontWeight={600} gutterBottom sx={{ fontSize: '0.875rem' }}>
                          Departments ({mappingSummary.departments.existing.length + mappingSummary.departments.new.length})
                        </Typography>
                        {mappingSummary.departments.existing.length > 0 && (
                          <Box sx={{ mb: 0.75 }}>
                            <Typography variant="caption" color="success.main" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, fontSize: '0.75rem', mb: 0.5 }}>
                              <CheckCircleIcon fontSize="small" /> {mappingSummary.departments.existing.length} Existing
                            </Typography>
                            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(2, 1fr)' }, gap: 0.5 }}>
                              {mappingSummary.departments.existing.map((dept, idx) => (
                                <Box key={idx} sx={{ display: 'flex', alignItems: 'center', gap: 0.5, py: 0.25 }}>
                                  <CheckCircleIcon fontSize="small" color="success" sx={{ fontSize: '0.875rem' }} />
                                  <Typography variant="caption" sx={{ fontSize: '0.75rem' }}>{dept}</Typography>
                                </Box>
                              ))}
                            </Box>
                          </Box>
                        )}
                        {mappingSummary.departments.new.length > 0 && (
                          <Box>
                            <Typography variant="caption" color="warning.main" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, fontSize: '0.75rem', mb: 0.5 }}>
                              <AddCircleIcon fontSize="small" /> {mappingSummary.departments.new.length} Need to be Created
                            </Typography>
                            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(2, 1fr)' }, gap: 0.5 }}>
                              {mappingSummary.departments.new.map((dept, idx) => (
                                <Box key={idx} sx={{ display: 'flex', alignItems: 'center', gap: 0.5, py: 0.25 }}>
                                  <AddCircleIcon fontSize="small" color="warning" sx={{ fontSize: '0.875rem' }} />
                                  <Typography variant="caption" sx={{ fontSize: '0.75rem' }}>{dept}</Typography>
                                </Box>
                              ))}
                            </Box>
                          </Box>
                        )}
                      </CardContent>
                    </Card>
                  </Grid>

                  {/* Directorates (Sections) - Removed from template preview */}

                  {/* Sub-counties */}
                  <Grid item xs={12} md={6}>
                    <Card variant="outlined" sx={{ '& .MuiCardContent-root': { py: 1.5, '&:last-child': { pb: 1.5 } } }}>
                      <CardContent>
                        <Typography variant="body2" fontWeight={600} gutterBottom sx={{ fontSize: '0.875rem' }}>
                          Sub-counties ({mappingSummary.subcounties.existing.length + mappingSummary.subcounties.new.length})
                        </Typography>
                        {mappingSummary.subcounties.existing.length > 0 && (
                          <Box sx={{ mb: 0.75 }}>
                            <Typography variant="caption" color="success.main" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, fontSize: '0.75rem', mb: 0.5 }}>
                              <CheckCircleIcon fontSize="small" /> {mappingSummary.subcounties.existing.length} Existing
                            </Typography>
                            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)' }, gap: 0.5 }}>
                              {mappingSummary.subcounties.existing.map((sc, idx) => (
                                <Box key={idx} sx={{ display: 'flex', alignItems: 'center', gap: 0.5, py: 0.25 }}>
                                  <CheckCircleIcon fontSize="small" color="success" sx={{ fontSize: '0.875rem' }} />
                                  <Typography variant="caption" sx={{ fontSize: '0.75rem' }}>{sc}</Typography>
                                </Box>
                              ))}
                            </Box>
                          </Box>
                        )}
                        {mappingSummary.subcounties.new.length > 0 && (
                          <Box>
                            <Typography variant="caption" color="warning.main" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, fontSize: '0.75rem', mb: 0.5 }}>
                              <AddCircleIcon fontSize="small" /> {mappingSummary.subcounties.new.length} Need to be Created
                            </Typography>
                            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)' }, gap: 0.5 }}>
                              {mappingSummary.subcounties.new.map((sc, idx) => (
                                <Box key={idx} sx={{ display: 'flex', alignItems: 'center', gap: 0.5, py: 0.25 }}>
                                  <AddCircleIcon fontSize="small" color="warning" sx={{ fontSize: '0.875rem' }} />
                                  <Typography variant="caption" sx={{ fontSize: '0.75rem' }}>{sc}</Typography>
                                </Box>
                              ))}
                            </Box>
                          </Box>
                        )}
                      </CardContent>
                    </Card>
                  </Grid>

                  {/* Wards */}
                  <Grid item xs={12} md={6}>
                    <Card variant="outlined" sx={{ '& .MuiCardContent-root': { py: 1.5, '&:last-child': { pb: 1.5 } } }}>
                      <CardContent>
                        <Typography variant="body2" fontWeight={600} gutterBottom sx={{ fontSize: '0.875rem' }}>
                          Wards ({mappingSummary.wards.existing.length + mappingSummary.wards.new.length})
                        </Typography>
                        {mappingSummary.wards.existing.length > 0 && (
                          <Box sx={{ mb: 0.75 }}>
                            <Typography variant="caption" color="success.main" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, fontSize: '0.75rem', mb: 0.5 }}>
                              <CheckCircleIcon fontSize="small" /> {mappingSummary.wards.existing.length} Existing
                            </Typography>
                            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)' }, gap: 0.5 }}>
                              {mappingSummary.wards.existing.map((ward, idx) => (
                                <Box key={idx} sx={{ display: 'flex', alignItems: 'center', gap: 0.5, py: 0.25 }}>
                                  <CheckCircleIcon fontSize="small" color="success" sx={{ fontSize: '0.875rem' }} />
                                  <Typography variant="caption" sx={{ fontSize: '0.75rem' }}>{ward}</Typography>
                                </Box>
                              ))}
                            </Box>
                          </Box>
                        )}
                        {mappingSummary.wards.new.length > 0 && (
                          <Box>
                            <Typography variant="caption" color="warning.main" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, fontSize: '0.75rem', mb: 0.5 }}>
                              <AddCircleIcon fontSize="small" /> {mappingSummary.wards.new.length} Need to be Created
                            </Typography>
                            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)' }, gap: 0.5 }}>
                              {mappingSummary.wards.new.map((ward, idx) => (
                                <Box key={idx} sx={{ display: 'flex', alignItems: 'center', gap: 0.5, py: 0.25 }}>
                                  <AddCircleIcon fontSize="small" color="warning" sx={{ fontSize: '0.875rem' }} />
                                  <Typography variant="caption" sx={{ fontSize: '0.75rem' }}>{ward}</Typography>
                                </Box>
                              ))}
                            </Box>
                          </Box>
                        )}
                      </CardContent>
                    </Card>
                  </Grid>

                  {/* Financial Years - Only for Projects Import (for Budgets, it's shown next to Budgets above) */}
                  {currentImportType?.id === 'projects' && mappingSummary.financialYears && (
                    <Grid item xs={12} md={6}>
                      <Card variant="outlined" sx={{ '& .MuiCardContent-root': { py: 1.5, '&:last-child': { pb: 1.5 } } }}>
                        <CardContent>
                          <Typography variant="body2" fontWeight={600} gutterBottom sx={{ fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <CalendarTodayIcon fontSize="small" />
                            Financial Years ({mappingSummary.financialYears?.existing.length + mappingSummary.financialYears?.new.length || 0})
                          </Typography>
                          {mappingSummary.financialYears?.existing.length > 0 && (
                            <Box sx={{ mb: 0.75 }}>
                              <Typography variant="caption" color="success.main" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, fontSize: '0.75rem' }}>
                                <CheckCircleIcon fontSize="small" /> {mappingSummary.financialYears.existing.length} Existing
                              </Typography>
                              <List dense sx={{ py: 0 }}>
                                {mappingSummary.financialYears.existing.map((fy, idx) => (
                                  <ListItem key={idx} sx={{ py: 0, px: 0.5 }}>
                                    <ListItemIcon sx={{ minWidth: 20 }}>
                                      <CheckCircleIcon fontSize="small" color="success" />
                                    </ListItemIcon>
                                    <ListItemText primary={fy} primaryTypographyProps={{ variant: 'caption', sx: { fontSize: '0.75rem' } }} />
                                  </ListItem>
                                ))}
                              </List>
                            </Box>
                          )}
                          {mappingSummary.financialYears?.new.length > 0 && (
                            <Box>
                              <Typography variant="caption" color="warning.main" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, fontSize: '0.75rem' }}>
                                <AddCircleIcon fontSize="small" /> {mappingSummary.financialYears.new.length} Need to be Created
                              </Typography>
                              <List dense sx={{ py: 0 }}>
                                {mappingSummary.financialYears.new.map((fy, idx) => (
                                  <ListItem key={idx} sx={{ py: 0, px: 0.5 }}>
                                    <ListItemIcon sx={{ minWidth: 20 }}>
                                      <AddCircleIcon fontSize="small" color="warning" />
                                    </ListItemIcon>
                                    <ListItemText primary={fy} primaryTypographyProps={{ variant: 'caption', sx: { fontSize: '0.75rem' } }} />
                                  </ListItem>
                                ))}
                              </List>
                            </Box>
                          )}
                          {(!mappingSummary.financialYears || (mappingSummary.financialYears.existing.length === 0 && mappingSummary.financialYears.new.length === 0)) && (
                            <Typography variant="caption" color="text.secondary" sx={{ fontStyle: 'italic', fontSize: '0.75rem' }}>
                              No financial years found in import data
                            </Typography>
                          )}
                        </CardContent>
                      </Card>
                    </Grid>
                  )}

                  {/* Counties - Only for Projects Import */}
                  {currentImportType?.id === 'projects' && mappingSummary.counties && (
                    <Grid item xs={12} md={6}>
                      <Card variant="outlined" sx={{ '& .MuiCardContent-root': { py: 1.5, '&:last-child': { pb: 1.5 } } }}>
                        <CardContent>
                          <Typography variant="body2" fontWeight={600} gutterBottom sx={{ fontSize: '0.875rem' }}>
                            Counties ({mappingSummary.counties.existing.length + mappingSummary.counties.unmatched.length})
                          </Typography>
                          {mappingSummary.counties.existing.length > 0 && (
                            <Box sx={{ mb: 0.75 }}>
                              <Typography variant="caption" color="success.main" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, fontSize: '0.75rem', mb: 0.5 }}>
                                <CheckCircleIcon fontSize="small" /> {mappingSummary.counties.existing.length} Matched in Kenya Wards
                              </Typography>
                              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(2, 1fr)' }, gap: 0.5 }}>
                                {mappingSummary.counties.existing.map((county, idx) => (
                                  <Box key={idx} sx={{ display: 'flex', alignItems: 'center', gap: 0.5, py: 0.25 }}>
                                    <CheckCircleIcon fontSize="small" color="success" sx={{ fontSize: '0.875rem' }} />
                                    <Typography variant="caption" sx={{ fontSize: '0.75rem' }}>{county}</Typography>
                                  </Box>
                                ))}
                              </Box>
                            </Box>
                          )}
                          {mappingSummary.counties.unmatched.length > 0 && (
                            <Box>
                              <Typography variant="caption" color="error.main" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, fontSize: '0.75rem', mb: 0.5 }}>
                                <ErrorIcon fontSize="small" /> {mappingSummary.counties.unmatched.length} Not Found in Kenya Wards
                              </Typography>
                              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(2, 1fr)' }, gap: 0.5 }}>
                                {mappingSummary.counties.unmatched.map((county, idx) => (
                                  <Box key={idx} sx={{ display: 'flex', alignItems: 'center', gap: 0.5, py: 0.25 }}>
                                    <ErrorIcon fontSize="small" color="error" sx={{ fontSize: '0.875rem' }} />
                                    <Typography variant="caption" sx={{ fontSize: '0.75rem' }}>{county}</Typography>
                                  </Box>
                                ))}
                              </Box>
                            </Box>
                          )}
                        </CardContent>
                      </Card>
                    </Grid>
                  )}

                  {/* Constituencies - Only for Projects Import */}
                  {currentImportType?.id === 'projects' && mappingSummary.constituencies && (
                    <Grid item xs={12} md={6}>
                      <Card variant="outlined" sx={{ '& .MuiCardContent-root': { py: 1.5, '&:last-child': { pb: 1.5 } } }}>
                        <CardContent>
                          <Typography variant="body2" fontWeight={600} gutterBottom sx={{ fontSize: '0.875rem' }}>
                            Constituencies ({mappingSummary.constituencies.existing.length + mappingSummary.constituencies.unmatched.length})
                          </Typography>
                          {mappingSummary.constituencies.existing.length > 0 && (
                            <Box sx={{ mb: 0.75 }}>
                              <Typography variant="caption" color="success.main" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, fontSize: '0.75rem', mb: 0.5 }}>
                                <CheckCircleIcon fontSize="small" /> {mappingSummary.constituencies.existing.length} Matched in Kenya Wards
                              </Typography>
                              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(2, 1fr)' }, gap: 0.5 }}>
                                {mappingSummary.constituencies.existing.map((constituency, idx) => (
                                  <Box key={idx} sx={{ display: 'flex', alignItems: 'center', gap: 0.5, py: 0.25 }}>
                                    <CheckCircleIcon fontSize="small" color="success" sx={{ fontSize: '0.875rem' }} />
                                    <Typography variant="caption" sx={{ fontSize: '0.75rem' }}>{constituency}</Typography>
                                  </Box>
                                ))}
                              </Box>
                            </Box>
                          )}
                          {mappingSummary.constituencies.unmatched.length > 0 && (
                            <Box>
                              <Typography variant="caption" color="error.main" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, fontSize: '0.75rem', mb: 0.5 }}>
                                <ErrorIcon fontSize="small" /> {mappingSummary.constituencies.unmatched.length} Not Found in Kenya Wards
                              </Typography>
                              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(2, 1fr)' }, gap: 0.5 }}>
                                {mappingSummary.constituencies.unmatched.map((constituency, idx) => (
                                  <Box key={idx} sx={{ display: 'flex', alignItems: 'center', gap: 0.5, py: 0.25 }}>
                                    <ErrorIcon fontSize="small" color="error" sx={{ fontSize: '0.875rem' }} />
                                    <Typography variant="caption" sx={{ fontSize: '0.75rem' }}>{constituency}</Typography>
                                  </Box>
                                ))}
                              </Box>
                            </Box>
                          )}
                        </CardContent>
                      </Card>
                    </Grid>
                  )}

                  {/* Kenya Wards - Only for Projects Import */}
                  {currentImportType?.id === 'projects' && mappingSummary.kenyaWards && (
                    <Grid item xs={12} md={6}>
                      <Card variant="outlined" sx={{ '& .MuiCardContent-root': { py: 1.5, '&:last-child': { pb: 1.5 } } }}>
                        <CardContent>
                          <Typography variant="body2" fontWeight={600} gutterBottom sx={{ fontSize: '0.875rem' }}>
                            Kenya Wards ({mappingSummary.kenyaWards.existing.length + mappingSummary.kenyaWards.unmatched.length})
                          </Typography>
                          {mappingSummary.kenyaWards.existing.length > 0 && (
                            <Box sx={{ mb: 0.75 }}>
                              <Typography variant="caption" color="success.main" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, fontSize: '0.75rem', mb: 0.5 }}>
                                <CheckCircleIcon fontSize="small" /> {mappingSummary.kenyaWards.existing.length} Matched
                              </Typography>
                              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)' }, gap: 0.5 }}>
                                {mappingSummary.kenyaWards.existing.map((ward, idx) => (
                                  <Box key={idx} sx={{ display: 'flex', alignItems: 'center', gap: 0.5, py: 0.25 }}>
                                    <CheckCircleIcon fontSize="small" color="success" sx={{ fontSize: '0.875rem' }} />
                                    <Typography variant="caption" sx={{ fontSize: '0.75rem' }}>{ward}</Typography>
                                  </Box>
                                ))}
                              </Box>
                            </Box>
                          )}
                          {mappingSummary.kenyaWards.unmatched.length > 0 && (
                            <Box>
                              <Typography variant="caption" color="error.main" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, fontSize: '0.75rem', mb: 0.5 }}>
                                <ErrorIcon fontSize="small" /> {mappingSummary.kenyaWards.unmatched.length} Not Found
                              </Typography>
                              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)' }, gap: 0.5 }}>
                                {mappingSummary.kenyaWards.unmatched.map((ward, idx) => (
                                  <Box key={idx} sx={{ display: 'flex', alignItems: 'center', gap: 0.5, py: 0.25 }}>
                                    <ErrorIcon fontSize="small" color="error" sx={{ fontSize: '0.875rem' }} />
                                    <Typography variant="caption" sx={{ fontSize: '0.75rem' }}>{ward}</Typography>
                                  </Box>
                                ))}
                              </Box>
                            </Box>
                          )}
                        </CardContent>
                      </Card>
                    </Grid>
                  )}

                  {/* Implementing Agencies - Only for Projects Import */}
                  {currentImportType?.id === 'projects' && mappingSummary.implementingAgencies && (
                    <Grid item xs={12} md={6}>
                      <Card variant="outlined" sx={{ '& .MuiCardContent-root': { py: 1.5, '&:last-child': { pb: 1.5 } } }}>
                        <CardContent>
                          <Typography variant="body2" fontWeight={600} gutterBottom sx={{ fontSize: '0.875rem' }}>
                            Implementing Agencies ({mappingSummary.implementingAgencies.existing.length + mappingSummary.implementingAgencies.unmatched.length})
                          </Typography>
                          {mappingSummary.implementingAgencies.existing.length > 0 && (
                            <Box sx={{ mb: 0.75 }}>
                              <Typography variant="caption" color="success.main" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, fontSize: '0.75rem', mb: 0.5 }}>
                                <CheckCircleIcon fontSize="small" /> {mappingSummary.implementingAgencies.existing.length} Matched in Agencies
                              </Typography>
                              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(2, 1fr)' }, gap: 0.5 }}>
                                {mappingSummary.implementingAgencies.existing.map((agency, idx) => (
                                  <Box key={idx} sx={{ display: 'flex', alignItems: 'center', gap: 0.5, py: 0.25 }}>
                                    <CheckCircleIcon fontSize="small" color="success" sx={{ fontSize: '0.875rem' }} />
                                    <Typography variant="caption" sx={{ fontSize: '0.75rem' }}>{agency}</Typography>
                                  </Box>
                                ))}
                              </Box>
                            </Box>
                          )}
                          {mappingSummary.implementingAgencies.unmatched.length > 0 && (
                            <Box>
                              <Typography variant="caption" color="error.main" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, fontSize: '0.75rem', mb: 0.5 }}>
                                <ErrorIcon fontSize="small" /> {mappingSummary.implementingAgencies.unmatched.length} Not Found in Agencies
                              </Typography>
                              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(2, 1fr)' }, gap: 0.5 }}>
                                {mappingSummary.implementingAgencies.unmatched.map((agency, idx) => (
                                  <Box key={idx} sx={{ display: 'flex', alignItems: 'center', gap: 0.5, py: 0.25 }}>
                                    <ErrorIcon fontSize="small" color="error" sx={{ fontSize: '0.875rem' }} />
                                    <Typography variant="caption" sx={{ fontSize: '0.75rem' }}>{agency}</Typography>
                                  </Box>
                                ))}
                              </Box>
                            </Box>
                          )}
                        </CardContent>
                      </Card>
                    </Grid>
                  )}
                </Grid>

                {/* Warnings for duplicate project names - Only for Budget imports */}
                {currentImportType?.id === 'budgets' && mappingSummary.duplicateProjectNames && mappingSummary.duplicateProjectNames.length > 0 && (
                  <Alert severity="warning" sx={{ mt: 1.5, py: 1 }}>
                    <Typography variant="body2" fontWeight={600} gutterBottom sx={{ fontSize: '0.875rem' }}>
                      <WarningIcon sx={{ verticalAlign: 'middle', mr: 0.5, fontSize: '1rem' }} />
                      Warning: {mappingSummary.duplicateProjectNames.length} duplicate project name(s) found
                    </Typography>
                    <Typography variant="body2" sx={{ fontSize: '0.85rem', mb: 1 }}>
                      The following project names appear multiple times in your file. Each occurrence will be imported as a separate budget item.
                    </Typography>
                    <Box component="ul" sx={{ mt: 0.75, mb: 0, pl: 2 }}>
                      {mappingSummary.duplicateProjectNames.slice(0, 10).map((dup, idx) => (
                        <li key={idx}>
                          <Typography variant="caption" sx={{ fontSize: '0.8rem', fontWeight: 600 }}>
                            "{dup.projectName}" appears {dup.occurrences} time(s) in rows: {dup.rows.map(r => r.rowNumber).join(', ')}
                          </Typography>
                        </li>
                      ))}
                      {mappingSummary.duplicateProjectNames.length > 10 && (
                        <li>
                          <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.8rem' }}>
                            ... and {mappingSummary.duplicateProjectNames.length - 10} more duplicate project name(s)
                          </Typography>
                        </li>
                      )}
                    </Box>
                    <Typography variant="caption" sx={{ mt: 0.75, display: 'block', fontSize: '0.75rem' }}>
                      If these are the same project, consider consolidating them. If they are different projects, ensure they have unique names.
                    </Typography>
                  </Alert>
                )}

                {/* Warnings for unmatched metadata */}
                {mappingSummary.rowsWithUnmatchedMetadata.length > 0 && (
                  <Alert severity="warning" sx={{ mt: 1.5, py: 1 }}>
                    <Typography variant="body2" fontWeight={600} gutterBottom sx={{ fontSize: '0.875rem' }}>
                      <WarningIcon sx={{ verticalAlign: 'middle', mr: 0.5, fontSize: '1rem' }} />
                      Warning: {mappingSummary.rowsWithUnmatchedMetadata.length} row(s) contain metadata that cannot be matched
                    </Typography>
                    <Box component="ul" sx={{ mt: 0.75, mb: 0, pl: 2 }}>
                      {mappingSummary.rowsWithUnmatchedMetadata.slice(0, 10).map((row, idx) => (
                        <li key={idx}>
                          <Typography variant="caption" sx={{ fontSize: '0.8rem' }}>
                            Row {row.rowNumber} ({row.projectName}): {row.unmatched.join(', ')}
                          </Typography>
                        </li>
                      ))}
                      {mappingSummary.rowsWithUnmatchedMetadata.length > 10 && (
                        <li>
                          <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.8rem' }}>
                            ... and {mappingSummary.rowsWithUnmatchedMetadata.length - 10} more
                          </Typography>
                        </li>
                      )}
                    </Box>
                    <Typography variant="caption" sx={{ mt: 0.75, display: 'block', fontSize: '0.75rem' }}>
                      These rows will be imported, but the unmatched metadata will not be linked. Please ensure metadata names match exactly.
                    </Typography>
                  </Alert>
                )}

                  </>
                ) : (
                  <Box>
                    <Alert severity="warning" sx={{ mb: 1.5, py: 1 }}>
                      <Typography variant="body2" fontWeight={600} sx={{ fontSize: '0.85rem', mb: 0.5 }}>
                        ⚠️ Review Required Before Import
                      </Typography>
                      <Typography variant="body2" sx={{ fontSize: '0.85rem' }}>
                        Please click "Show Details" above to review the metadata mapping. This step is required before you can confirm the import.
                      </Typography>
                    </Alert>
                    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 1 }}>
                      <Chip 
                        label={`${mappingSummary.departments?.existing.length || 0} Existing Departments`} 
                        color="success" 
                        size="small"
                        sx={{ fontSize: '0.7rem' }}
                      />
                      {/* Directorates chips - Removed from template preview */}
                      {mappingSummary.departments?.new.length > 0 && (
                        <Chip 
                          label={`${mappingSummary.departments.new.length} New Departments`} 
                          color="warning" 
                          size="small"
                          sx={{ fontSize: '0.7rem' }}
                        />
                      )}
                      {/* Directorates new chip - Removed from template preview */}
                    </Box>
                  </Box>
                )}
              </Paper>
            </Box>
          )}

          {/* Import Confirmation Section - Appears after preview and metadata review */}
          {previewData && (
            <Box sx={{ 
              mt: 2, 
              p: 2, 
              bgcolor: 'action.hover', 
              borderRadius: 2, 
              border: '2px solid', 
              borderColor: ((currentImportType?.id === 'budgets') && mappingSummary && !showMappingPreview) ? 'warning.main' : 'success.main'
            }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2 }}>
                <Box sx={{ flex: 1 }}>
                  <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 0.5 }}>
                    Ready to Import
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.85rem' }}>
                    {((currentImportType?.id === 'budgets') && mappingSummary && !showMappingPreview)
                      ? '⚠️ Please review the Metadata Mapping Preview above before confirming the import.'
                      : 'Review the preview above and confirm to proceed with the import.'}
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <Button
                    variant="contained"
                    color="primary"
                    size="large"
                    startIcon={<CheckCircleIcon />}
                    onClick={handleConfirmImport}
                    disabled={
                      loading || 
                      !checkUserPrivilege(user, currentImportType.privilege) ||
                      ((currentImportType?.id === 'budgets') && mappingSummary && !showMappingPreview)
                    }
                    sx={{ minWidth: 160 }}
                  >
                    {loading ? (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <CircularProgress size={20} color="inherit" />
                        <Typography>Importing...</Typography>
                      </Box>
                    ) : (
                      'Confirm Import'
                    )}
                  </Button>
                  <Button
                    variant="outlined"
                    color="error"
                    size="large"
                    startIcon={<CancelIcon />}
                    onClick={handleCancelImport}
                    disabled={loading}
                  >
                    Cancel
                  </Button>
                </Box>
              </Box>
            </Box>
          )}

          {importReport && (
            <Box sx={{ mt: 2, p: 1.5, border: '1px solid', borderColor: importReport.success ? 'success.main' : 'error.main', borderRadius: '8px' }}>
              <Typography variant="subtitle1" fontWeight={600} color={importReport.success ? 'success.main' : 'error.main'} sx={{ mb: 0.5 }}>
                Import Report: {importReport.success ? 'Success' : 'Failed'}
              </Typography>
              <Typography variant="body2" sx={{ fontSize: '0.875rem' }}>{importReport.message}</Typography>
              {importReport.details && (
                <Box sx={{ mt: 2 }}>
                  {importReport.details.errors && Array.isArray(importReport.details.errors) && importReport.details.errors.length > 0 && (
                    <Box sx={{ mt: 1 }}>
                      <Typography variant="body2" fontWeight="bold" color="error.main">
                        Errors ({importReport.details.errorCount || importReport.details.errors.length} of {importReport.details.totalRows || 'unknown'} rows):
                      </Typography>
                      <Box component="ul" sx={{ pl: 2, mt: 1, maxHeight: '300px', overflow: 'auto' }}>
                        {importReport.details.errors.map((error, idx) => (
                          <li key={idx}>
                            <Typography variant="body2" component="span">{error}</Typography>
                          </li>
                        ))}
                      </Box>
                    </Box>
                  )}
                  {importReport.details.error && (
                    <Box sx={{ mt: 1 }}>
                      <Typography variant="body2" fontWeight="bold" color="error.main">Error Details:</Typography>
                      <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.8rem', mt: 0.5 }}>
                        {importReport.details.error}
                      </Typography>
                    </Box>
                  )}
                  {!importReport.details.errors && !importReport.details.error && (
                    <Box sx={{ mt: 1 }}>
                      <Typography variant="body2" color="text.secondary">
                        Check the browser console for more details.
                      </Typography>
                    </Box>
                  )}
                  {importReport.details.projectsCreated !== undefined && (
                    <Box sx={{ mt: 1 }}>
                      <Typography variant="body2">Projects Created: {importReport.details.projectsCreated}</Typography>
                      <Typography variant="body2">Projects Updated: {importReport.details.projectsUpdated}</Typography>
                      <Typography variant="body2">Links Created: {importReport.details.linksCreated}</Typography>
                    </Box>
                  )}
                  {importReport.details && !importReport.details.errors && !importReport.details.error && importReport.details.projectsCreated === undefined && (
                    <Box sx={{ mt: 1 }}>
                      <Typography variant="body2">Details:</Typography>
                      <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontSize: '0.8rem' }}>
                        {JSON.stringify(importReport.details, null, 2)}
                      </pre>
                    </Box>
                  )}
                </Box>
              )}
            </Box>
          )}

        </Paper>
      )}

      <Snackbar open={snackbar.open} autoHideDuration={6000} onClose={handleCloseSnackbar}>
        <Alert onClose={handleCloseSnackbar} severity={snackbar.severity} sx={{ width: '100%' }}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}

export default CentralImportPage;

