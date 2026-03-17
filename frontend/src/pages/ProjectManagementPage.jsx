import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Menu, MenuItem, ListItemIcon, Checkbox, ListItemText, Box, Typography, Button, CircularProgress, IconButton,
  Snackbar, Alert, Stack, useTheme, Tooltip, Grid, Card, CardContent, TextField, InputAdornment, Chip,
  Dialog, DialogTitle, DialogContent, DialogActions, LinearProgress, ToggleButton, ToggleButtonGroup, Collapse,
} from '@mui/material';
import { DataGrid } from "@mui/x-data-grid";
import { getThemedDataGridSx } from '../utils/dataGridTheme';
import {
  Add as AddIcon, Edit as EditIcon, Delete as DeleteIcon, Visibility as ViewDetailsIcon, FilterList as FilterListIcon, BarChart as GanttChartIcon,
  ArrowForward as ArrowForwardIcon, ArrowBack as ArrowBackIcon, Settings as SettingsIcon, Category as CategoryIcon,
  GroupAdd as GroupAddIcon, FileDownload as FileDownloadIcon, PictureAsPdf as PictureAsPdfIcon,
  Assignment as AssignmentIcon, AttachMoney as MoneyIcon, CheckCircle as CheckCircleIcon, 
  HourglassEmpty as HourglassIcon, AccountBalance as ContractedIcon, Payment as PaidIcon,
  Search as SearchIcon, Clear as ClearIcon, PlayArrow as PlayArrowIcon, Pause as PauseIcon,
  Warning as WarningIcon, Cancel as CancelIcon, Schedule as ScheduleIcon, CheckCircleOutline as CheckCircleOutlineIcon,
  MoreVert as MoreVertIcon, LocationOn as LocationOnIcon, Refresh as RefreshIcon, Download as DownloadIcon,
  ExpandMore as ExpandMoreIcon, ExpandLess as ExpandLessIcon
} from '@mui/icons-material';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
// Import autoTable directly (jspdf-autotable v5+ requires direct import)
import autoTable from 'jspdf-autotable';

import { useAuth } from '../context/AuthContext.jsx';
import { checkUserPrivilege, currencyFormatter, getProjectStatusBackgroundColor, getProjectStatusTextColor, formatStatus } from '../utils/tableHelpers';
import { normalizeProjectStatus } from '../utils/projectStatusNormalizer';
import projectTableColumnsConfig from '../configs/projectTableConfig';
import apiService from '../api';
import { tokens } from "./dashboard/theme"; // Import tokens for color styling

// Import our new, compact components and hooks
import Header from "./dashboard/Header"; // Import Header component
import ProjectFormDialog from '../components/ProjectFormDialog';
import useProjectData from '../hooks/useProjectData';
import useTableSort from '../hooks/useTableSort';
import useTableScrollShadows from '../hooks/useTableScrollShadows';
import AssignContractorModal from '../components/AssignContractorModal.jsx';
import ProjectSitesModal from '../components/ProjectSitesModal';
import ProjectJobsModal from '../components/ProjectJobsModal';

function ProjectManagementPage() {
  const { user, loading: authLoading, hasPrivilege } = useAuth();
  const navigate = useNavigate();
  const theme = useTheme();
  const colors = tokens(theme.palette.mode); // Initialize colors
  const isLight = theme.palette.mode === 'light';
  const ui = {
    headerBg: isLight ? colors.blueAccent[100] : colors.blueAccent[700],
    headerText: isLight ? colors.blueAccent[900] : '#fff',
    bodyBg: isLight ? theme.palette.background.paper : colors.primary[400],
    border: isLight ? theme.palette.grey[300] : colors.blueAccent[700],
    footerBg: isLight ? theme.palette.grey[50] : colors.blueAccent[700],
    actionIcon: isLight ? theme.palette.text.primary : colors.grey[100],
    danger: isLight ? theme.palette.error.main : colors.redAccent[500],
    primaryOutline: isLight ? theme.palette.primary.main : colors.blueAccent[500],
    primaryOutlineHoverBg: isLight ? theme.palette.action.hover : colors.blueAccent[700],
    elevatedShadow: isLight ? '0 1px 6px rgba(0,0,0,0.06)' : '0 4px 20px rgba(0, 0, 0, 0.15), 0 -2px 10px rgba(0, 0, 0, 0.1)'
  };

  // Custom hook for data fetching and global state
  // Pass empty filterState since we're using DataGrid filters and global search instead
  // Use useMemo to create a stable empty object to prevent infinite re-renders
  const emptyFilterState = useMemo(() => ({}), []);
  const {
    projects, loading, error, snackbar,
    setSnackbar, allMetadata, fetchProjects,
  } = useProjectData(user, authLoading, emptyFilterState);

  // State to track if all projects are loaded (vs initial limited load)
  const [allProjectsLoaded, setAllProjectsLoaded] = useState(false);
  const [loadingAll, setLoadingAll] = useState(false);

  // Handler to load all projects
  const handleLoadAllProjects = async () => {
    setLoadingAll(true);
    try {
      await fetchProjects(true); // Pass true to load all
      setAllProjectsLoaded(true);
      setSnackbar({ open: true, message: 'All projects loaded successfully', severity: 'success' });
    } catch (err) {
      setSnackbar({ open: true, message: 'Failed to load all projects', severity: 'error' });
    } finally {
      setLoadingAll(false);
    }
  };

  // Handler to refresh projects
  const handleRefresh = async () => {
    setAllProjectsLoaded(false);
    await fetchProjects(false); // Reload with limit
  };

  // Ensure column visibility model respects config defaults
  useEffect(() => {
    // Check if any columns from config are missing from visibility model
    const currentModel = { ...columnVisibilityModel };
    let needsUpdate = false;
    
    projectTableColumnsConfig.forEach(col => {
      // If column is not in the model, add it based on config
      if (!currentModel.hasOwnProperty(col.id)) {
        currentModel[col.id] = col.show !== false;
        needsUpdate = true;
      }
      // If column has show: false in config but is visible in model, hide it (unless user explicitly saved it)
      // We'll respect saved preferences, but ensure new columns follow config
    });
    
    // Always ensure actions column is visible
    if (currentModel['actions'] !== true) {
      currentModel['actions'] = true;
      needsUpdate = true;
    }
    
    if (needsUpdate) {
      setColumnVisibilityModel(currentModel);
      localStorage.setItem('projectTableColumnVisibility', JSON.stringify(currentModel));
    }
  }, []); // Only run once on mount

  // State for global search (must be declared before filteredProjects)
  const [searchQuery, setSearchQuery] = useState('');

  // Filter projects based on search query
  const filteredProjects = useMemo(() => {
    if (!searchQuery.trim()) {
      return projects || [];
    }

    const query = searchQuery.toLowerCase().trim();
    return (projects || []).filter(project => {
      // Search in multiple fields
      const searchableFields = [
        project.projectName || '',
        project.id?.toString() || '',
        project.departmentName || '',
        project.departmentAlias || '',
        project.financialYearName || '',
        project.programName || '',
        project.subProgramName || '',
        project.countyNames || '',
        project.constituencyNames || '',
        project.subcountyNames || '',
        project.wardNames || '',
        project.directorate || '',
        project.sectionName || '',
        project.principalInvestigator || '',
        project.pi_firstName || '',
        project.status || '',
        project.description || '',
        project.overallProgress?.toString() || '',
        `${project.overallProgress || 0}%`,
      ];

      return searchableFields.some(field => 
        field.toLowerCase().includes(query)
      );
    });
  }, [projects, searchQuery]);

  // Custom hook for table sorting
  const { order, orderBy, handleRequestSort, sortedData: sortedProjects } = useTableSort(
    filteredProjects || [],
    undefined,
    { orderBy: 'id', order: 'desc' } // Newer projects (higher id) on top
  );

  // Custom hook for table scroll shadows (no longer needed for DataGrid)
  const { tableContainerRef, showLeftShadow, showRightShadow, handleScrollRight, handleScrollLeft } = useTableScrollShadows(projects || []);

  // States for column visibility and menu
  const [columnVisibilityModel, setColumnVisibilityModel] = useState(() => {
    // Default columns: Project Name, Status, Budget, Progress, Sites, Jobs, Actions (fits without horizontal scroll)
    const defaultVisibleColumns = [
      'projectName',
      'status',
      'costOfProject', // Budget
      'overallProgress', // Progress
      'coverageCount', // Sites
      'jobsCount', // Jobs
      'actions', // Always visible
    ];
    
    // Create default visibility - only show specified columns
    const defaultVisibility = {};
    projectTableColumnsConfig.forEach(col => {
      defaultVisibility[col.id] = defaultVisibleColumns.includes(col.id);
    });
    // Always show actions column
    defaultVisibility['actions'] = true;
    
    // Try to load saved preferences from localStorage
    const savedVisibility = localStorage.getItem('projectTableColumnVisibility');
    if (savedVisibility) {
      try {
        const saved = JSON.parse(savedVisibility);
        // Merge saved preferences with defaults
        const merged = { ...defaultVisibility };
        // Apply saved preferences for columns that exist in the config
        projectTableColumnsConfig.forEach(col => {
          if (saved.hasOwnProperty(col.id)) {
            merged[col.id] = saved[col.id]; // Use saved preference
          }
        });
        // Always ensure actions column is visible
        merged['actions'] = true;
        return merged;
      } catch (e) {
        console.error("Failed to parse saved column visibility from localStorage", e);
        // Return defaults if parsing fails
        return defaultVisibility;
      }
    }
    
    // Return defaults if no saved preferences
    return defaultVisibility;
  });

  // Dialog state for create/edit
  const [openFormDialog, setOpenFormDialog] = useState(false);
  const [currentProject, setCurrentProject] = useState(null);
  
  // State for delete confirmation dialog
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState(null);
  
  /* SCOPE_DOWN: contractors/contractor_users tables removed. Re-enable when restoring for wider market. */
  const [openAssignModal, setOpenAssignModal] = useState(false);
  const [selectedProjectForAssignment, setSelectedProjectForAssignment] = useState(null);
  
  // State for Project Sites modal
  const [openSitesModal, setOpenSitesModal] = useState(false);
  const [selectedProjectForSites, setSelectedProjectForSites] = useState(null);
  
  // State for Project Jobs modal
  const [openJobsModal, setOpenJobsModal] = useState(false);
  const [selectedProjectForJobs, setSelectedProjectForJobs] = useState(null);
  
  // State for context menu
  const [contextMenu, setContextMenu] = useState(null);
  const [selectedProjectForContextMenu, setSelectedProjectForContextMenu] = useState(null);
  
  // State for pagination
  // Default page size ~10 keeps grid inside viewport (no page scroll); row height ~36px + header/footer ~96px
  const [paginationModel, setPaginationModel] = useState({
    pageSize: 10,
    page: 0,
  });

  // State for DataGrid filter model (column filters)
  const [filterModel, setFilterModel] = useState({ items: [] });

  // State for toggling between progress and status view
  const [distributionView, setDistributionView] = useState('status'); // 'progress' or 'status'

  // State for Status Overview collapse
  const [statusOverviewExpanded, setStatusOverviewExpanded] = useState(false);

  // State for action menu
  const [actionMenuAnchor, setActionMenuAnchor] = useState(null);
  
  // State for row action menu (for DataGrid)
  const [rowActionMenuAnchor, setRowActionMenuAnchor] = useState(null);
  const [selectedRow, setSelectedRow] = useState(null);

  // Handler to filter by progress percentage
  const handleProgressFilter = useCallback((progressValue) => {
    // Check if the same filter is already active, if so, clear it
    const currentFilter = filterModel.items?.find(item => item.field === 'overallProgress');
    if (currentFilter && parseFloat(currentFilter.value) === progressValue) {
      // Clear the filter
      setFilterModel({ items: [] });
    } else {
      // Set the filter - ensure value is a number
      setFilterModel({
        items: [
          {
            id: 'overallProgress',
            field: 'overallProgress',
            operator: '=',
            value: progressValue, // Keep as number for numeric comparison
          }
        ]
      });
    }
  }, [filterModel]);

  // Handler to filter by normalized status
  const handleStatusFilter = useCallback(async (normalizedStatus) => {
    // Check if we're already filtering by this normalized status
    // Check if any of the current status filters match this normalized status
    const currentStatusFilters = filterModel.items?.filter(item => item.field === 'status') || [];
    const isCurrentlyFiltered = currentStatusFilters.length > 0 && 
      currentStatusFilters.some(filterItem => {
        // Check if this filter's value normalizes to the selected normalized status
        return normalizeProjectStatus(filterItem.value) === normalizedStatus;
      });
    
    if (isCurrentlyFiltered) {
      // Clear the filter
      setFilterModel({ items: [] });
    } else {
      // Find all original statuses that normalize to this status
      const matchingStatuses = [];
      
      // For "Other" status, fetch all status counts to get all possible statuses
      // This ensures we include statuses that might not be in the currently loaded projects
      if (normalizedStatus === 'Other') {
        try {
          const statusCounts = await apiService.analytics.getProjectStatusCounts();
          if (statusCounts && Array.isArray(statusCounts)) {
            statusCounts.forEach(item => {
              if (item.status && normalizeProjectStatus(item.status) === 'Other') {
                if (!matchingStatuses.includes(item.status)) {
                  matchingStatuses.push(item.status);
                }
              }
            });
          }
        } catch (error) {
          console.error('Error fetching status counts for Other filter:', error);
          // Fallback to using currently loaded projects
          if (projects && projects.length > 0) {
            projects.forEach(p => {
              if (p.status && normalizeProjectStatus(p.status) === 'Other') {
                if (!matchingStatuses.includes(p.status)) {
                  matchingStatuses.push(p.status);
                }
              }
            });
          }
        }
      } else {
        // For other statuses, use currently loaded projects
        if (projects && projects.length > 0) {
          projects.forEach(p => {
            if (p.status && normalizeProjectStatus(p.status) === normalizedStatus) {
              if (!matchingStatuses.includes(p.status)) {
                matchingStatuses.push(p.status);
              }
            }
          });
        }
      }

      // If we have matching statuses, create filters for each
      // Note: DataGrid doesn't support OR filters directly, so we'll filter in dataGridFilteredProjects
      // For now, we'll store the normalized status in a custom filter item
      if (matchingStatuses.length > 0) {
        setFilterModel({
          items: matchingStatuses.map((status, idx) => ({
            id: `status-${idx}`,
            field: 'status',
            operator: 'equals',
            value: status,
          }))
        });
      }
    }
  }, [filterModel, projects]);
  
  // State for export loading
  const [exportingExcel, setExportingExcel] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  
  // Calculate optimal height based on page size
  const calculateGridHeight = () => {
    const rowHeight = 36; // Compact DataGrid row height
    const headerHeight = 40; // Compact column header height
    const footerHeight = 40; // Compact pagination footer height
    const padding = 16; // Reduced padding
    
    const totalHeight = headerHeight + (paginationModel.pageSize * rowHeight) + footerHeight + padding;
    return Math.max(totalHeight, 320); // Minimum height of 320px
  };

  // Format currency in millions for KPI cards
  const formatCurrencyInMillions = (amount) => {
    if (!amount || isNaN(amount) || amount === 0) return 'KES 0M';
    const millions = amount / 1000000;
    // Format with 1-2 decimal places, removing trailing zeros
    const formatted = millions.toFixed(2).replace(/\.?0+$/, '');
    return `KES ${formatted}M`;
  };

  // Apply DataGrid column filters to filtered projects
  const dataGridFilteredProjects = useMemo(() => {
    if (!filteredProjects || filteredProjects.length === 0) {
      return [];
    }

    // If no column filters are applied, return filteredProjects as-is
    if (!filterModel.items || filterModel.items.length === 0) {
      return filteredProjects;
    }

    // Helper function to check if a filter matches
    const checkFilterMatch = (projectValue, operator, value, field) => {
      if (value === null || value === undefined || value === '') {
        return true; // Empty filter means no filter
      }

      // Handle numeric fields differently
      if (field === 'overallProgress' || field === 'costOfProject' || field === 'paidOut' || field === 'Contracted' || field === 'id') {
        const numValue = parseFloat(value);
        if (isNaN(numValue)) {
          return false;
        }
        
        // Handle null/undefined project values
        let numProjectValue;
        if (projectValue === null || projectValue === undefined || projectValue === '') {
          // For overallProgress, treat null/undefined as 0
          numProjectValue = 0;
        } else {
          numProjectValue = parseFloat(projectValue);
          if (isNaN(numProjectValue)) {
            // If parsing fails, try to handle it
            if (field === 'overallProgress') {
              numProjectValue = 0; // Default to 0 for invalid overallProgress
            } else {
              return false;
            }
          }
        }
        
        // For overallProgress, ensure we're comparing integers (0, 25, 50, 75, 100)
        if (field === 'overallProgress') {
          numProjectValue = Math.round(numProjectValue);
          const roundedValue = Math.round(numValue);
          const matches = numProjectValue === roundedValue;
          
          // For overallProgress, only use equality operator
          if (operator === '=' || operator === 'equals') {
            return matches;
          }
          // For other operators, use the rounded values
          switch (operator) {
            case '>':
              return numProjectValue > roundedValue;
            case '<':
              return numProjectValue < roundedValue;
            case '>=':
              return numProjectValue >= roundedValue;
            case '<=':
              return numProjectValue <= roundedValue;
            default:
              return matches;
          }
        }
        
        // For other numeric fields, use standard comparison
        switch (operator) {
          case '=':
          case 'equals':
            return numProjectValue === numValue;
          case '>':
            return numProjectValue > numValue;
          case '<':
            return numProjectValue < numValue;
          case '>=':
            return numProjectValue >= numValue;
          case '<=':
            return numProjectValue <= numValue;
          default:
            return numProjectValue === numValue;
        }
      }

      const filterValue = String(value).toLowerCase();
      const projectValueStr = projectValue ? String(projectValue).toLowerCase() : '';

      switch (operator) {
        case '=':
        case 'equals':
          return projectValueStr === filterValue;
        case 'contains':
          return projectValueStr.includes(filterValue);
        case 'startsWith':
          return projectValueStr.startsWith(filterValue);
        case 'endsWith':
          return projectValueStr.endsWith(filterValue);
        case 'is':
          return projectValueStr === filterValue;
        case 'isNot':
          return projectValueStr !== filterValue;
        case 'isEmpty':
          return !projectValue || projectValueStr === '';
        case 'isNotEmpty':
          return projectValue && projectValueStr !== '';
        default:
          return projectValueStr.includes(filterValue);
      }
    };

    // Apply column filters
    const filtered = filteredProjects.filter(project => {
      // Group filters by field to handle OR logic for status filters
      const filtersByField = {};
      filterModel.items.forEach(filterItem => {
        if (!filtersByField[filterItem.field]) {
          filtersByField[filterItem.field] = [];
        }
        filtersByField[filterItem.field].push(filterItem);
      });

      // Check each field group
      return Object.keys(filtersByField).every(field => {
        const fieldFilters = filtersByField[field];
        // For status field with multiple values, use OR logic
        if (field === 'status' && fieldFilters.length > 1) {
          return fieldFilters.some(filterItem => {
            const { operator, value } = filterItem;
            const projectValue = project[field];
            return checkFilterMatch(projectValue, operator, value, field);
          });
        }
        // For other fields or single status filter, use AND logic
        return fieldFilters.every(filterItem => {
          const { operator, value } = filterItem;
          const projectValue = project[field];
          return checkFilterMatch(projectValue, operator, value, field);
        });
      });
    });
    
    // Debug logging
    if (filterModel.items?.some(item => item.field === 'overallProgress')) {
      console.log('Filtered results:', {
        totalProjects: filteredProjects.length,
        filteredCount: filtered.length,
        filterModel: filterModel.items,
        sampleProject: filtered[0]
      });
    }
    
    return filtered;
  }, [filteredProjects, filterModel]);

  // Calculate summary statistics from filtered projects (respects search and column filters)
  const summaryStats = useMemo(() => {
    const projectsToUse = dataGridFilteredProjects;
    
    if (!projectsToUse || projectsToUse.length === 0) {
      return {
        totalProjects: 0,
        totalBudget: 0,
        completedProjects: 0,
        inProgressProjects: 0,
        totalPaidOut: 0,
        totalSites: 0,
        totalJobs: 0,
        completionRate: 0,
        progressStats: {
          notStarted: 0,
          quarter: 0,
          halfway: 0,
          threeQuarter: 0,
          completed: 0
        },
      };
    }

    const totalBudget = projectsToUse.reduce((sum, p) => {
      const cost = parseFloat(p.costOfProject) || 0;
      return sum + cost;
    }, 0);

    const totalPaidOut = projectsToUse.reduce((sum, p) => {
      const paid = parseFloat(p.paidOut) || 0;
      return sum + paid;
    }, 0);

    const totalSites = projectsToUse.reduce((sum, p) => {
      const sites = parseInt(p.coverageCount) || 0;
      return sum + sites;
    }, 0);

    const totalJobs = projectsToUse.reduce((sum, p) => {
      const jobs = parseInt(p.jobsCount) || 0;
      return sum + jobs;
    }, 0);

    // Use normalized status for accurate categorization
    const completedProjects = projectsToUse.filter(p => {
      const normalized = normalizeProjectStatus(p.status);
      return normalized === 'Completed';
    }).length;

    const inProgressProjects = projectsToUse.filter(p => {
      const normalized = normalizeProjectStatus(p.status);
      return normalized === 'Ongoing';
    }).length;

    const completionRate = projectsToUse.length > 0 
      ? Math.round((completedProjects / projectsToUse.length) * 100) 
      : 0;

    // Calculate progress-based statistics
    const progressStats = {
      notStarted: 0,      // 0%
      quarter: 0,         // 25%
      halfway: 0,         // 50%
      threeQuarter: 0,    // 75%
      completed: 0        // 100%
    };

    projectsToUse.forEach(p => {
      const progress = p.overallProgress != null ? parseFloat(p.overallProgress) || 0 : 0;
      if (progress === 0) {
        progressStats.notStarted++;
      } else if (progress === 25) {
        progressStats.quarter++;
      } else if (progress === 50) {
        progressStats.halfway++;
      } else if (progress === 75) {
        progressStats.threeQuarter++;
      } else if (progress === 100) {
        progressStats.completed++;
      }
    });

    // Calculate normalized status statistics
    const statusStats = {
      'Completed': 0,
      'Ongoing': 0,
      'Not started': 0,
      'Stalled': 0,
      'Under Procurement': 0,
      'Suspended': 0,
      'Other': 0
    };

    projectsToUse.forEach(p => {
      const normalized = normalizeProjectStatus(p.status);
      if (statusStats.hasOwnProperty(normalized)) {
        statusStats[normalized]++;
      } else {
        statusStats['Other']++;
      }
    });

    return {
      totalProjects: projectsToUse.length,
      totalBudget,
      completedProjects,
      inProgressProjects,
      totalPaidOut,
      totalSites,
      totalJobs,
      completionRate,
      progressStats,
      statusStats,
    };
  }, [dataGridFilteredProjects]);

  const handleOpenFormDialog = async (project = null) => {
    if (project && !checkUserPrivilege(user, 'project.update')) {
      setSnackbar({ open: true, message: 'You do not have permission to edit projects.', severity: 'error' });
      return;
    }
    if (!project && !checkUserPrivilege(user, 'project.create')) {
      setSnackbar({ open: true, message: 'You do not have permission to create projects.', severity: 'error' });
      return;
    }
    
    // If editing, fetch full project details to ensure all fields (especially finYearId) are available
    if (project && project.id) {
      try {
        const fullProjectData = await apiService.projects.getProjectById(project.id);
        setCurrentProject(fullProjectData);
        // Wait a tick to ensure state is set before opening dialog
        setTimeout(() => {
          setOpenFormDialog(true);
        }, 0);
      } catch (error) {
        console.error('Error fetching full project details:', error);
        // Fallback to using the row data if fetch fails
        setCurrentProject(project);
        setTimeout(() => {
          setOpenFormDialog(true);
        }, 0);
      }
    } else {
      setCurrentProject(null);
      setOpenFormDialog(true);
    }
  };

  const handleCloseFormDialog = () => {
    setOpenFormDialog(false);
    setCurrentProject(null);
  };

  /* SCOPE_DOWN: Assign Contractor - contractors table removed. Re-enable when restoring. */
  const handleOpenAssignModal = (project) => {
      setSelectedProjectForAssignment(project);
      setOpenAssignModal(true);
  };
  const handleCloseAssignModal = () => {
      setOpenAssignModal(false);
      setSelectedProjectForAssignment(null);
      fetchProjects();
  };

  const handleFormSuccess = () => {
    handleCloseFormDialog();
    fetchProjects(); // Re-fetch projects to refresh the table
  };

  const handleDeleteProject = (project) => {
    if (!checkUserPrivilege(user, 'project.delete')) {
      setSnackbar({ open: true, message: 'You do not have permission to delete projects.', severity: 'error' });
      return;
    }
    setProjectToDelete(project);
    setDeleteConfirmOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!projectToDelete) return;
    
    try {
      await apiService.projects.deleteProject(projectToDelete.id);
      setSnackbar({ open: true, message: 'Project deleted successfully!', severity: 'success' });
      setDeleteConfirmOpen(false);
      setProjectToDelete(null);
      fetchProjects();
    } catch (err) {
      setSnackbar({ open: true, message: err.response?.data?.message || 'Failed to delete project.', severity: 'error' });
      setDeleteConfirmOpen(false);
      setProjectToDelete(null);
    }
  };

  const handleViewDetails = useCallback((projectId) => {
    if (projectId) {
      navigate(`/projects/${projectId}`);
    }
  }, [navigate]);

  const handleViewGanttChart = useCallback((projectId) => {
    if (projectId) {
      navigate(`/projects/${projectId}/gantt-chart`);
    }
  }, [navigate]);

  const handleViewKdspDetails = useCallback((projectId) => {
    if (projectId) {
      navigate(`/projects/${projectId}/kdsp-details`);
    }
  }, [navigate]);

  // Ref for DataGrid container
  const dataGridRef = useRef(null);

  // Context menu handlers
  const handleRowContextMenu = useCallback((event) => {
    event.preventDefault();
    event.stopPropagation();
    
    // Find the row element from the event target
    const rowElement = event.target.closest('.MuiDataGrid-row');
    if (!rowElement) return;
    
    // Try multiple methods to get the row ID
    let rowId = rowElement.getAttribute('data-id') || 
                rowElement.getAttribute('data-row-id') ||
                rowElement.id?.replace('MuiDataGrid-row-', '');
    
    // If still no ID, try to get it from the first cell
    if (!rowId) {
      const firstCell = rowElement.querySelector('.MuiDataGrid-cell[data-field]');
      if (firstCell) {
        // Try to extract from cell data
        const cellData = firstCell.getAttribute('data-value');
        if (cellData) {
          rowId = cellData;
        }
      }
    }
    
    if (!rowId) {
      // Last resort: try to find row by index
      const allRows = Array.from(rowElement.parentElement?.querySelectorAll('.MuiDataGrid-row') || []);
      const rowIndex = allRows.indexOf(rowElement);
      if (rowIndex >= 0 && dataGridFilteredProjects[rowIndex]) {
        const row = dataGridFilteredProjects[rowIndex];
        setContextMenu({
          mouseX: event.clientX + 2,
          mouseY: event.clientY - 6,
        });
        setSelectedProjectForContextMenu(row);
        return;
      }
      return;
    }
    
    // Find the corresponding row data
    const row = dataGridFilteredProjects.find(p => {
      const id = p.id?.toString();
      return id === rowId || id === rowId.toString();
    });
    
    if (row) {
      setContextMenu({
        mouseX: event.clientX + 2,
        mouseY: event.clientY - 6,
      });
      setSelectedProjectForContextMenu(row);
    }
  }, [dataGridFilteredProjects]);

  // Add event listener to DataGrid container for context menu
  useEffect(() => {
    const gridContainer = dataGridRef.current;
    if (!gridContainer) return;

    const handleContextMenu = (event) => {
      // Only handle if clicking on a row (not on header or other elements)
      const rowElement = event.target.closest('.MuiDataGrid-row');
      if (rowElement && !event.target.closest('.MuiDataGrid-columnHeader')) {
        handleRowContextMenu(event);
      }
    };

    gridContainer.addEventListener('contextmenu', handleContextMenu);
    return () => {
      gridContainer.removeEventListener('contextmenu', handleContextMenu);
    };
  }, [handleRowContextMenu]);

  const handleContextMenuClose = useCallback(() => {
    setContextMenu(null);
    setSelectedProjectForContextMenu(null);
  }, []);

  const handleCloseSnackbar = (event, reason) => { if (reason === 'clickaway') return; setSnackbar({ ...snackbar, open: false }); };

  const handleExportToExcel = () => {
    setExportingExcel(true);
    try {
      // Get visible columns, excluding actions column
      const visibleColumns = columns.filter(col => 
        columnVisibilityModel[col.field] !== false && col.field !== 'actions'
      );
      
      // Prepare data for export (use dataGridFilteredProjects to include search and column filters including progress)
      const projectsToExport = dataGridFilteredProjects;
      const dataToExport = projectsToExport.map((project, index) => {
        const row = {};
        visibleColumns.forEach(col => {
          if (col.field === 'rowNumber') {
            // Use index + 1 for row numbering
            row[col.headerName] = index + 1;
          } else {
            // Get the value using valueGetter if available, otherwise use the field directly
            let value = project[col.field];
            
            // For exports, use full department name instead of alias
            if (col.field === 'departmentName') {
              value = project.departmentName || 'N/A';
            } else if (col.valueGetter) {
              try {
                value = col.valueGetter({ row: project, value: project[col.field] });
              } catch (e) {
                // If valueGetter fails, use direct value
                value = project[col.field];
              }
            }
            // Format the value for display
            if (value === null || value === undefined || value === '') {
              value = 'N/A';
            } else if (col.field === 'costOfProject' || col.field === 'paidOut' || col.field === 'Contracted') {
              // Format currency values
              if (!isNaN(parseFloat(value))) {
                value = parseFloat(value);
              }
            } else if (col.field === 'startDate' || col.field === 'endDate') {
              // Format dates
              if (value) {
                value = new Date(value).toLocaleDateString();
              }
            } else if (col.field === 'overallProgress') {
              // Format progress as percentage
              const progressValue = value != null ? parseFloat(value) || 0 : 0;
              value = `${Math.min(100, Math.max(0, progressValue)).toFixed(0)}%`;
            }
            row[col.headerName] = value;
          }
        });
        return row;
      });

      // Create workbook and worksheet
      const worksheet = XLSX.utils.json_to_sheet(dataToExport);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Projects");
      
      // Generate filename with current date
      const dateStr = new Date().toISOString().split('T')[0];
      const hasFilters = searchQuery || (filterModel.items && filterModel.items.length > 0);
      const filename = hasFilters 
        ? `projects_export_filtered_${dateStr}.xlsx`
        : `projects_export_${dateStr}.xlsx`;
      
      // Write file
      XLSX.writeFile(workbook, filename);
      setSnackbar({ 
        open: true, 
        message: `Exported ${projectsToExport.length} project${projectsToExport.length !== 1 ? 's' : ''} to Excel successfully!`, 
        severity: 'success' 
      });
    } catch (err) {
      console.error('Error exporting to Excel:', err);
      setSnackbar({ open: true, message: 'Failed to export to Excel. Please try again.', severity: 'error' });
    } finally {
      setExportingExcel(false);
    }
  };

  const handleExportToPDF = () => {
    setExportingPdf(true);
    try {
      // Get visible columns (excluding actions)
      const visibleColumns = columns.filter(col => 
        columnVisibilityModel[col.field] !== false && col.field !== 'actions'
      );
      
      // Prepare headers
      const headers = visibleColumns.map(col => col.headerName);
      
      // Prepare data rows (use dataGridFilteredProjects to include search and column filters including progress)
      const projectsToExport = dataGridFilteredProjects;
      const dataRows = projectsToExport.map((project, index) => {
        return visibleColumns.map(col => {
          if (col.field === 'rowNumber') {
            return index + 1;
          }
          
          // Get the value using valueGetter if available, otherwise use the field directly
          let value = project[col.field];
          
          // For exports, use full department name instead of alias
          if (col.field === 'departmentName') {
            value = project.departmentName || 'N/A';
          } else if (col.valueGetter) {
            try {
              value = col.valueGetter({ row: project, value: project[col.field] });
            } catch (e) {
              value = project[col.field];
            }
          }
          
          // Format the value for display
          if (value === null || value === undefined || value === '') {
            return 'N/A';
          } else if (col.field === 'costOfProject' || col.field === 'paidOut' || col.field === 'Contracted') {
            // Format currency values
            if (!isNaN(parseFloat(value))) {
              return currencyFormatter.format(parseFloat(value));
            }
            return String(value);
          } else if (col.field === 'startDate' || col.field === 'endDate') {
            // Format dates
            if (value) {
              return new Date(value).toLocaleDateString();
            }
            return 'N/A';
          } else if (col.field === 'overallProgress') {
            // Format progress as percentage
            const progressValue = value != null ? parseFloat(value) || 0 : 0;
            return `${Math.min(100, Math.max(0, progressValue)).toFixed(0)}%`;
          }
          
          return String(value);
        });
      });
      
      // Create PDF - use the same pattern as other report components
      const doc = new jsPDF('landscape', 'pt', 'a4');
      
      // Use autoTable directly (jspdf-autotable v5+ requires passing doc as first parameter)
      autoTable(doc, {
        head: [headers],
        body: dataRows,
        startY: 20,
        styles: { 
          fontSize: 8, 
          cellPadding: 2,
          overflow: 'linebreak',
          halign: 'left'
        },
        headStyles: { 
          fillColor: [41, 128, 185], 
          textColor: 255, 
          fontStyle: 'bold' 
        },
        alternateRowStyles: { fillColor: [245, 245, 245] },
        margin: { top: 20, left: 40, right: 40 },
      });
      
      // Generate filename with current date
      const dateStr = new Date().toISOString().split('T')[0];
      const hasFilters = searchQuery || (filterModel.items && filterModel.items.length > 0);
      const filename = hasFilters 
        ? `projects_export_filtered_${dateStr}.pdf`
        : `projects_export_${dateStr}.pdf`;
      
      // Save PDF
      doc.save(filename);
      setSnackbar({ 
        open: true, 
        message: `Exported ${projectsToExport.length} project${projectsToExport.length !== 1 ? 's' : ''} to PDF successfully!`, 
        severity: 'success' 
      });
    } catch (err) {
      console.error('Error exporting to PDF:', err);
      setSnackbar({ open: true, message: err.message || 'Failed to export to PDF. Please try again.', severity: 'error' });
    } finally {
      setExportingPdf(false);
    }
  };

  const handleResetColumns = () => {
    // Default columns: Project Name, Status, Budget, Progress, Sites, Jobs, Actions
    const defaultVisibleColumns = [
      'projectName',
      'status',
      'costOfProject', // Budget
      'overallProgress', // Progress
      'coverageCount', // Sites
      'jobsCount', // Jobs
      'actions', // Always visible
    ];
    
    const defaultVisibility = {};
    projectTableColumnsConfig.forEach(col => {
      defaultVisibility[col.id] = defaultVisibleColumns.includes(col.id);
    });
    // Always show actions column
    defaultVisibility['actions'] = true;
    setColumnVisibilityModel(defaultVisibility);
    localStorage.setItem('projectTableColumnVisibility', JSON.stringify(defaultVisibility));
    setSnackbar({ open: true, message: 'Columns reset to defaults', severity: 'info' });
  };

  if (authLoading) return <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '80vh' }}><CircularProgress /><Typography sx={{ ml: 2 }}>Loading authentication data...</Typography></Box>;

  // Define columns for DataGrid
  const columns = projectTableColumnsConfig.map((col, index) => {
    const dataGridColumn = {
      field: col.id, // Use col.id directly as the field name
      headerName: col.label,
      flex: col.flex,
      width: col.width,
      minWidth: col.minWidth,
      sortable: col.sortable,
      sticky: col.sticky, // Preserve sticky property
    };

    switch (col.id) {
      case 'rowNumber':
        dataGridColumn.valueGetter = (params) => {
          if (!params) return '';
          // Use the row's position in the filtered data array
          const rowIndex = filteredProjects.findIndex(project => project.id === params.id);
          return rowIndex !== -1 ? rowIndex + 1 : '';
        };
        dataGridColumn.renderCell = (params) => {
          if (!params) return '';
          // Use the row's position in the filtered data array
          const rowIndex = filteredProjects.findIndex(project => project.id === params.id);
          return rowIndex !== -1 ? rowIndex + 1 : '';
        };
        dataGridColumn.sortable = false;
        dataGridColumn.filterable = false;
        break;
      
      case 'projectName':
        dataGridColumn.renderCell = (params) => {
          if (!params || !params.value) return 'N/A';
          return (
            <Box
              sx={{
                width: '100%',
                minHeight: '36px',
                display: 'flex',
                alignItems: 'flex-start',
                py: 0.75,
                px: 0.75,
                maxWidth: '100%',
                boxSizing: 'border-box',
                overflow: 'visible',
              }}
            >
              <Typography
                variant="body2"
                sx={{
                  whiteSpace: 'normal',
                  wordWrap: 'break-word',
                  overflowWrap: 'break-word',
                  wordBreak: 'break-word',
                  hyphens: 'auto',
                  lineHeight: 1.4,
                  fontSize: '0.8125rem', // Compact font size (13px)
                  width: '100%',
                  maxWidth: '100%',
                  overflow: 'visible',
                  textOverflow: 'clip',
                  display: 'block',
                }}
              >
                {params.value}
              </Typography>
            </Box>
          );
        };
        dataGridColumn.cellClassName = 'project-name-cell';
        // Set a fixed width to allow proper wrapping
        if (!dataGridColumn.width) {
          dataGridColumn.width = 250; // Set a reasonable width for wrapping
        }
        dataGridColumn.flex = 0; // Prevent flex from interfering with wrapping
        break;
      case 'status':
        dataGridColumn.renderCell = (params) => {
          if (!params || !params.value) return null;
          
          const status = params.value;
          const normalizedStatus = status?.toLowerCase() || '';
          
          // Get status icon based on status
          const getStatusIcon = () => {
            if (normalizedStatus.includes('completed') || normalizedStatus.includes('closed')) {
              return <CheckCircleIcon sx={{ fontSize: 16 }} />;
            } else if (normalizedStatus.includes('progress') || normalizedStatus.includes('ongoing') || normalizedStatus.includes('initiated')) {
              return <PlayArrowIcon sx={{ fontSize: 16 }} />;
            } else if (normalizedStatus.includes('hold') || normalizedStatus.includes('paused')) {
              return <PauseIcon sx={{ fontSize: 16 }} />;
            } else if (normalizedStatus.includes('risk') || normalizedStatus.includes('at risk')) {
              return <WarningIcon sx={{ fontSize: 16 }} />;
            } else if (normalizedStatus.includes('cancelled') || normalizedStatus.includes('canceled')) {
              return <CancelIcon sx={{ fontSize: 16 }} />;
            } else if (normalizedStatus.includes('stalled') || normalizedStatus.includes('delayed')) {
              return <ScheduleIcon sx={{ fontSize: 16 }} />;
            } else if (normalizedStatus.includes('planning') || normalizedStatus.includes('not started')) {
              return <ScheduleIcon sx={{ fontSize: 16 }} />;
            }
            return <CheckCircleOutlineIcon sx={{ fontSize: 16 }} />;
          };
          
          const bgColor = getProjectStatusBackgroundColor(status);
          const textColor = getProjectStatusTextColor(status);
          
          return (
            <Chip
              icon={getStatusIcon()}
              label={formatStatus(status)}
              size="small"
              sx={{
                backgroundColor: bgColor,
                color: textColor,
                fontWeight: 600,
                fontSize: '0.75rem',
                height: '26px',
                minWidth: '100px',
                '& .MuiChip-icon': {
                  color: textColor,
                  marginLeft: '6px',
                },
                '& .MuiChip-label': {
                  paddingLeft: '4px',
                  paddingRight: '8px',
                },
                boxShadow: isLight 
                  ? '0 2px 4px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.08)' 
                  : '0 2px 6px rgba(0,0,0,0.3), 0 1px 3px rgba(0,0,0,0.2)',
                border: `1px solid ${isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.15)'}`,
                borderRadius: '6px',
                transition: 'all 0.2s ease-in-out',
                cursor: 'default',
                '&:hover': {
                  transform: 'translateY(-1px)',
                  boxShadow: isLight 
                    ? '0 4px 8px rgba(0,0,0,0.15), 0 2px 4px rgba(0,0,0,0.1)' 
                    : '0 4px 10px rgba(0,0,0,0.4), 0 2px 6px rgba(0,0,0,0.3)',
                  borderColor: isLight ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.2)',
                }
              }}
            />
          );
        };
        break;
      case 'coverageCount':
        dataGridColumn.width = 120;
        dataGridColumn.minWidth = 120;
        dataGridColumn.renderCell = (params) => {
          if (!params || params.value === null || params.value === undefined) {
            return (
              <Chip
                label="0"
                size="small"
                sx={{
                  backgroundColor: isLight ? theme.palette.grey[100] : colors.grey[700],
                  color: isLight ? theme.palette.text.secondary : colors.grey[300],
                  border: isLight ? `1px solid ${theme.palette.grey[200]}` : 'none',
                  cursor: 'not-allowed',
                }}
              />
            );
          }
          
          const count = parseInt(params.value) || 0;
          
          return (
            <Chip
              label={count}
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                if (count > 0) {
                  setSelectedProjectForSites({
                    id: params.row.id,
                    name: params.row.projectName || 'Project',
                  });
                  setOpenSitesModal(true);
                }
              }}
              sx={{
                backgroundColor: count > 0
                  ? (isLight ? 'rgba(25, 118, 210, 0.08)' : colors.blueAccent[700])
                  : (isLight ? theme.palette.grey[100] : colors.grey[700]),
                color: count > 0
                  ? (isLight ? theme.palette.primary.main : colors.blueAccent[100])
                  : (isLight ? theme.palette.text.secondary : colors.grey[300]),
                border: isLight ? `1px solid ${count > 0 ? 'rgba(25, 118, 210, 0.2)' : theme.palette.grey[200]}` : 'none',
                cursor: count > 0 ? 'pointer' : 'not-allowed',
                fontWeight: 600,
                fontSize: '0.75rem',
                height: '26px',
                '&:hover': count > 0 ? {
                  backgroundColor: isLight ? 'rgba(25, 118, 210, 0.14)' : colors.blueAccent[600],
                } : {},
                transition: 'background-color 0.2s ease',
              }}
            />
          );
        };
        break;
      case 'jobsCount':
        dataGridColumn.width = 120;
        dataGridColumn.minWidth = 120;
        dataGridColumn.renderCell = (params) => {
          if (!params || params.value === null || params.value === undefined) {
            return (
              <Chip
                label="0"
                size="small"
                sx={{
                  backgroundColor: isLight ? theme.palette.grey[100] : colors.grey[700],
                  color: isLight ? theme.palette.text.secondary : colors.grey[300],
                  border: isLight ? `1px solid ${theme.palette.grey[200]}` : 'none',
                  cursor: 'default',
                }}
              />
            );
          }

          const count = parseInt(params.value) || 0;

          return (
            <Chip
              label={count}
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                if (count > 0) {
                  setSelectedProjectForJobs({
                    id: params.row.id,
                    name: params.row.projectName || 'Project',
                  });
                  setOpenJobsModal(true);
                }
              }}
              sx={{
                backgroundColor: count > 0
                  ? (isLight ? 'rgba(76, 175, 80, 0.1)' : colors.greenAccent[700])
                  : (isLight ? theme.palette.grey[100] : colors.grey[700]),
                color: count > 0
                  ? (isLight ? theme.palette.success.main : colors.greenAccent[100])
                  : (isLight ? theme.palette.text.secondary : colors.grey[300]),
                border: isLight ? `1px solid ${count > 0 ? 'rgba(76, 175, 80, 0.25)' : theme.palette.grey[200]}` : 'none',
                cursor: count > 0 ? 'pointer' : 'default',
                fontWeight: 600,
                fontSize: '0.75rem',
                height: '26px',
                '&:hover': count > 0 ? {
                  backgroundColor: isLight ? 'rgba(76, 175, 80, 0.16)' : colors.greenAccent[600],
                } : {},
                transition: 'background-color 0.2s ease',
              }}
            />
          );
        };
        break;
      case 'costOfProject':
        dataGridColumn.width = 150; // Ensure fixed width
        dataGridColumn.minWidth = 150;
        dataGridColumn.renderCell = (params) => {
          if (!params) return 'N/A';
          return !isNaN(parseFloat(params.value)) ? currencyFormatter.format(parseFloat(params.value)) : 'N/A';
        };
        break;
      case 'paidOut':
        dataGridColumn.renderCell = (params) => {
          if (!params) return 'N/A';
          return !isNaN(parseFloat(params.value)) ? currencyFormatter.format(parseFloat(params.value)) : 'N/A';
        };
        break;
      case 'startDate':
      case 'endDate':
        dataGridColumn.renderCell = (params) => {
          if (!params) return 'N/A';
          return params.value ? new Date(params.value).toLocaleDateString() : 'N/A';
        };
        break;
      case 'directorate':
        dataGridColumn.valueGetter = (params) => {
          if (!params || !params.row) return '';
          // Use directorate if available, otherwise fall back to section
          return params.row.directorate || params.row.section || params.row.sectionName || '';
        };
        dataGridColumn.renderCell = (params) => {
          if (!params || !params.row) return 'N/A';
          const value = params.row.directorate || params.row.section || params.row.sectionName;
          return value || 'N/A';
        };
        break;
      case 'Contracted':
        dataGridColumn.valueGetter = (params) => {
          return params?.row?.Contracted || '';
        };
        dataGridColumn.renderCell = (params) => {
          if (!params || !params.row) return 'N/A';
          const value = params.row.Contracted;
          if (value === null || value === undefined) return 'N/A';
          // Format as currency if it's a number
          if (!isNaN(parseFloat(value))) {
            return currencyFormatter.format(parseFloat(value));
          }
          return value || 'N/A';
        };
        break;
      case 'overallProgress':
        dataGridColumn.type = 'number';
        dataGridColumn.filterable = true;
        dataGridColumn.width = 160; // Ensure fixed width
        dataGridColumn.minWidth = 160;
        dataGridColumn.valueGetter = (params) => {
          if (!params || !params.row) return 0;
          const progress = params.row.overallProgress;
          return progress != null ? parseFloat(progress) || 0 : 0;
        };
        dataGridColumn.renderCell = (params) => {
          if (!params || !params.row) return 'N/A';
          const progress = params.row.overallProgress;
          const progressValue = progress != null ? parseFloat(progress) || 0 : 0;
          const clampedProgress = Math.min(100, Math.max(0, progressValue));
          
          return (
            <Box sx={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: 0.5, 
              width: '100%',
              maxWidth: '100%',
              height: '100%',
              py: 0.5,
              px: 0.5,
              boxSizing: 'border-box'
            }}>
              <Box sx={{ flexGrow: 1, minWidth: 40, maxWidth: 60, flexShrink: 1 }}>
                <LinearProgress
                  variant="determinate"
                  value={clampedProgress}
                  sx={{
                    height: 6,
                    borderRadius: 3,
                    backgroundColor: isLight ? colors.grey[200] : colors.grey[700],
                    '& .MuiLinearProgress-bar': {
                      borderRadius: 3,
                      backgroundColor: clampedProgress === 100 
                        ? (isLight ? colors.greenAccent[600] : colors.greenAccent[500])
                        : (isLight ? colors.blueAccent[600] : colors.blueAccent[500])
                    }
                  }}
                />
              </Box>
              <Typography 
                variant="body2" 
                sx={{ 
                  minWidth: 35,
                  maxWidth: 40,
                  textAlign: 'right',
                  fontSize: '0.8125rem',
                  fontWeight: 600,
                  color: isLight ? '#000000' : '#ffffff',
                  lineHeight: 1.2,
                  flexShrink: 0,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }}
              >
                {clampedProgress.toFixed(0)}%
              </Typography>
            </Box>
          );
        };
        break;
      case 'departmentName':
        dataGridColumn.valueGetter = (params) => {
          // Show alias in table if available, otherwise fall back to name
          return params?.row?.departmentAlias || params?.row?.departmentName || '';
        };
        dataGridColumn.renderCell = (params) => {
          // Show alias in table if available, otherwise fall back to name
          const value = params?.row?.departmentAlias || params?.row?.departmentName;
          return value || 'N/A';
        };
        break;
      case 'financialYearName':
        dataGridColumn.valueGetter = (params) => {
          return params?.row?.financialYearName || '';
        };
        dataGridColumn.renderCell = (params) => {
          const value = params?.row?.financialYearName;
          return value || 'N/A';
        };
        break;
      case 'subcountyNames':
        dataGridColumn.valueGetter = (params) => {
          return params?.row?.subcountyNames || '';
        };
        dataGridColumn.renderCell = (params) => {
          const value = params?.row?.subcountyNames;
          return value || 'N/A';
        };
        break;
      case 'wardNames':
        dataGridColumn.valueGetter = (params) => {
          return params?.row?.wardNames || '';
        };
        dataGridColumn.renderCell = (params) => {
          const value = params?.row?.wardNames;
          return value || 'N/A';
        };
        break;
      case 'countyNames':
        dataGridColumn.valueGetter = (params) => {
          return params?.row?.countyNames || '';
        };
        dataGridColumn.renderCell = (params) => {
          const value = params?.row?.countyNames;
          return value || 'N/A';
        };
        break;
      case 'constituencyNames':
        dataGridColumn.valueGetter = (params) => {
          return params?.row?.constituencyNames || '';
        };
        dataGridColumn.renderCell = (params) => {
          const value = params?.row?.constituencyNames;
          return value || 'N/A';
        };
        break;
      case 'principalInvestigator':
        dataGridColumn.valueGetter = (params) => {
          if (!params || !params.row) return 'N/A';
          return params.row.pi_firstName || params.row.principalInvestigator || 'N/A';
        };
        break;
      case 'actions':
        dataGridColumn.renderCell = (params) => {
          if (!params) return null;
          if (!params.row) return null;
          return (
            <Box
              display="flex"
              alignItems="center"
              justifyContent="center"
              sx={{
                width: '100%',
                height: '100%',
                minHeight: '40px',
                py: 0.5,
                px: 0.5,
                boxSizing: 'border-box',
              }}
            >
              <Tooltip title="Actions">
                <IconButton
                  size="small"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setRowActionMenuAnchor(e.currentTarget);
                    setSelectedRow(params.row);
                  }}
                  sx={{
                    padding: '4px',
                    color: 'text.secondary',
                    '&:hover': {
                      backgroundColor: (theme) => theme.palette.action.hover,
                    },
                  }}
                >
                  <MoreVertIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Box>
          );
        };
        // Use default header (headerName from config: "Actions") so the label always shows
        dataGridColumn.sortable = false;
        dataGridColumn.filterable = false;
        dataGridColumn.headerAlign = 'center';
        dataGridColumn.align = 'center';
        // Width must fit header label "Action" so it doesn’t disappear when grid reflows
        dataGridColumn.width = 80;
        dataGridColumn.minWidth = 72;
        break;
      default:
        dataGridColumn.valueGetter = (params) => {
          if (!params) return 'N/A';
          return params.value || 'N/A';
        };
        break;
    }
    return dataGridColumn;
  });

  return (
    <Box sx={{ m: 1 }}>
      {/* Compact header row for better space utilization */}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: 1,
          flexWrap: 'wrap',
          gap: 1,
          p: 1,
          borderRadius: 2,
          background: isLight 
            ? 'linear-gradient(to right, rgba(33, 150, 243, 0.04), rgba(33, 150, 243, 0.02))'
            : `linear-gradient(to right, ${colors.primary[500]}25, ${colors.primary[500]}15)`,
          border: `1px solid ${isLight ? 'rgba(33, 150, 243, 0.1)' : colors.blueAccent[700]}`,
          boxShadow: isLight 
            ? '0 1px 6px rgba(0,0,0,0.05)'
            : '0 1px 10px rgba(0,0,0,0.2)',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
          <Header title="PROJECTS" subtitle="Registry of Projects" />
          {/* Compact Total Projects Badge - Integrated into header */}
          {!loading && !error && projects && projects.length > 0 && (
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                px: 1,
                py: 0.4,
                borderRadius: 2,
                background: isLight 
                  ? 'linear-gradient(135deg, #2196f3 0%, #42a5f5 100%)'
                  : `linear-gradient(135deg, ${colors.blueAccent[800]}, ${colors.blueAccent[700]})`,
                color: 'white',
                borderTop: `2px solid ${isLight ? '#1976d2' : colors.blueAccent[500]}`,
                boxShadow: ui.elevatedShadow,
                transition: 'all 0.2s ease-in-out',
                '&:hover': {
                  transform: 'translateY(-1px)',
                  boxShadow: isLight ? '0 4px 12px rgba(33, 150, 243, 0.3)' : '0 4px 16px rgba(0, 0, 0, 0.25)',
                }
              }}
            >
              <Typography variant="h6" sx={{ color: '#fff', fontWeight: 'bold', fontSize: '1rem', lineHeight: 1 }}>
                {summaryStats.totalProjects.toLocaleString()}
              </Typography>
            </Box>
          )}
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          {/* Action Buttons */}
          <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
            <Tooltip title="Refresh projects" arrow>
              <IconButton 
                size="small"
                onClick={handleRefresh}
                disabled={loading}
                sx={{ 
                  color: isLight ? colors.blueAccent[700] : colors.blueAccent[300],
                  border: `1px solid ${isLight ? colors.blueAccent[300] : colors.blueAccent[600]}`,
                  '&:hover': { 
                    backgroundColor: isLight ? colors.blueAccent[50] : colors.blueAccent[700],
                  },
                  '&:disabled': {
                    borderColor: isLight ? theme.palette.action.disabled : colors.grey[700],
                    color: isLight ? theme.palette.action.disabled : colors.grey[500]
                  },
                  width: 32,
                  height: 32,
                }}
              >
                {loading ? <CircularProgress size={16} color="inherit" /> : <RefreshIcon sx={{ fontSize: 18 }} />}
              </IconButton>
            </Tooltip>
            {!allProjectsLoaded && projects.length >= 100 && (
              <Tooltip title="Load all projects" arrow>
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={loadingAll ? <CircularProgress size={14} color="inherit" /> : <DownloadIcon sx={{ fontSize: 16 }} />}
                  onClick={handleLoadAllProjects}
                  disabled={loadingAll || loading}
                  sx={{
                    color: isLight ? colors.blueAccent[700] : colors.blueAccent[300],
                    borderColor: isLight ? colors.blueAccent[300] : colors.blueAccent[600],
                    '&:hover': {
                      backgroundColor: isLight ? colors.blueAccent[50] : colors.blueAccent[700],
                      borderColor: isLight ? colors.blueAccent[500] : colors.blueAccent[400]
                    },
                    fontSize: '0.7rem',
                    py: 0.3,
                    px: 1
                  }}
                >
                  {loadingAll ? 'Loading...' : 'Load All'}
                </Button>
              </Tooltip>
            )}
            {checkUserPrivilege(user, 'project.create') && (
              <Button 
                variant="contained" 
                size="small" 
                startIcon={<AddIcon sx={{ fontSize: 16 }} />} 
                onClick={() => handleOpenFormDialog()}
                sx={{ backgroundColor: isLight ? theme.palette.success.main : colors.greenAccent[600], '&:hover': { backgroundColor: isLight ? theme.palette.success.dark : colors.greenAccent[700] }, color: '#fff', fontSize: '0.75rem', py: 0.4, px: 1.25 }}
              >
                Add New Project
              </Button>
            )}
            {filteredProjects && filteredProjects.length > 0 && (
              <>
                <Tooltip title={exportingExcel ? 'Exporting...' : 'Export to Excel'} arrow>
                  <IconButton 
                    size="small"
                    onClick={handleExportToExcel}
                    disabled={exportingExcel || exportingPdf || loading}
                    sx={{ 
                      color: isLight ? '#276E4B' : colors.greenAccent[500], 
                      border: `1px solid ${isLight ? '#276E4B' : colors.greenAccent[500]}`,
                      '&:hover': { 
                        backgroundColor: isLight ? '#E8F5E9' : colors.greenAccent[600], 
                        borderColor: isLight ? '#276E4B' : colors.greenAccent[400] 
                      },
                      '&:disabled': {
                        borderColor: isLight ? theme.palette.action.disabled : colors.grey[700],
                        color: isLight ? theme.palette.action.disabled : colors.grey[500]
                      },
                      width: 32,
                      height: 32,
                    }}
                  >
                    {exportingExcel ? <CircularProgress size={16} color="inherit" /> : <FileDownloadIcon sx={{ fontSize: 18 }} />}
                  </IconButton>
                </Tooltip>
                <Tooltip title={exportingPdf ? 'Generating PDF...' : 'Export to PDF'} arrow>
                  <IconButton 
                    size="small"
                    onClick={handleExportToPDF}
                    disabled={exportingExcel || exportingPdf || loading}
                    sx={{ 
                      color: isLight ? '#E11D48' : colors.redAccent[500], 
                      border: `1px solid ${isLight ? '#E11D48' : colors.redAccent[500]}`,
                      '&:hover': { 
                        backgroundColor: isLight ? '#FFEBEE' : colors.redAccent[600], 
                        borderColor: isLight ? '#E11D48' : colors.redAccent[400] 
                      },
                      '&:disabled': {
                        borderColor: isLight ? theme.palette.action.disabled : colors.grey[700],
                        color: isLight ? theme.palette.action.disabled : colors.grey[500]
                      },
                      width: 32,
                      height: 32,
                    }}
                  >
                    {exportingPdf ? <CircularProgress size={16} color="inherit" /> : <PictureAsPdfIcon sx={{ fontSize: 18 }} />}
                  </IconButton>
                </Tooltip>
              </>
            )}
          </Stack>
          {/* Global Search Bar */}
          <TextField
            placeholder="Search projects..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            variant="outlined"
            size="small"
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon sx={{ color: isLight ? colors.grey[600] : colors.grey[300], fontSize: 18 }} />
                </InputAdornment>
              ),
              endAdornment: searchQuery && (
                <InputAdornment position="end">
                  <IconButton
                    onClick={() => setSearchQuery('')}
                    edge="end"
                    size="small"
                    sx={{ color: isLight ? colors.grey[600] : colors.grey[300] }}
                  >
                    <ClearIcon fontSize="small" />
                  </IconButton>
                </InputAdornment>
              ),
            }}
            sx={{
              width: { xs: '100%', sm: '200px', md: '250px' },
              '& .MuiOutlinedInput-root': {
                backgroundColor: isLight ? theme.palette.background.paper : colors.primary[500],
                borderRadius: '6px',
                height: '32px',
                '&:hover': {
                  backgroundColor: isLight ? theme.palette.action.hover : colors.primary[600],
                },
                '&.Mui-focused': {
                  backgroundColor: isLight ? theme.palette.background.paper : colors.primary[500],
                  boxShadow: `0 0 0 2px ${colors.blueAccent[500]}40`,
                },
              },
              '& .MuiOutlinedInput-input': {
                color: isLight ? theme.palette.text.primary : colors.grey[100],
                py: 0.75,
                fontSize: '0.875rem',
              },
            }}
          />
          {(searchQuery || (filterModel.items && filterModel.items.length > 0)) && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}>
              <Chip
                label={`${dataGridFilteredProjects.length} project${dataGridFilteredProjects.length !== 1 ? 's' : ''} found`}
                size="small"
                sx={{
                  backgroundColor: colors.blueAccent[500],
                  color: '#fff',
                  fontWeight: 600,
                  fontSize: '0.7rem',
                }}
              />
              {dataGridFilteredProjects.length !== projects.length && (
                <Chip
                  label={`Filtered from ${projects.length} total`}
                  size="small"
                  variant="outlined"
                  sx={{
                    borderColor: colors.blueAccent[500],
                    color: isLight ? colors.blueAccent[700] : colors.blueAccent[300],
                    fontSize: '0.7rem',
                  }}
                />
              )}
            </Box>
          )}
        </Box>
      </Box>

      {/* Status Overview – compact when collapsed to save vertical space */}
      {!loading && !error && projects && projects.length > 0 && (
        <Box
          sx={{
            mb: statusOverviewExpanded ? 1 : 0.25,
            mt: 0.5,
            p: statusOverviewExpanded ? 1.5 : 0,
            borderRadius: 2,
            background: isLight 
              ? 'linear-gradient(to bottom, rgba(33, 150, 243, 0.03), rgba(33, 150, 243, 0.06))'
              : `linear-gradient(to bottom, ${colors.primary[500]}20, ${colors.primary[600]}25)`,
            border: `1px solid ${isLight ? 'rgba(33, 150, 243, 0.12)' : colors.blueAccent[700]}`,
            boxShadow: isLight 
              ? '0 2px 12px rgba(0,0,0,0.06)'
              : '0 2px 16px rgba(0,0,0,0.25)',
            transition: 'all 0.2s ease',
          }}
        >
          {/* Collapsible header – minimal height when collapsed */}
          <Box>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                cursor: 'pointer',
                py: 0.35,
                px: 0.75,
                borderRadius: 1,
                transition: 'all 0.2s ease',
                '&:hover': {
                  backgroundColor: isLight ? colors.grey[50] : colors.primary[600],
                }
              }}
              onClick={() => setStatusOverviewExpanded(!statusOverviewExpanded)}
            >
              <Typography
                variant="caption"
                sx={{
                  color: isLight ? colors.grey[600] : colors.grey[400],
                  fontWeight: 600,
                  fontSize: '0.65rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                }}
              >
                Status Overview
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                {statusOverviewExpanded && (
                  <ToggleButtonGroup
                    value={distributionView}
                    exclusive
                    onChange={(e, newView) => {
                      if (newView !== null) {
                        setDistributionView(newView);
                        setFilterModel({ items: [] });
                      }
                    }}
                    size="small"
                    onClick={(e) => e.stopPropagation()}
                    sx={{
                      '& .MuiToggleButton-root': {
                        px: 2,
                        py: 0.75,
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        border: `1px solid ${isLight ? colors.grey[300] : colors.grey[600]}`,
                        color: isLight ? colors.grey[700] : colors.grey[300],
                        transition: 'all 0.2s ease',
                        '&.Mui-selected': {
                          backgroundColor: colors.blueAccent[500],
                          color: '#fff',
                          borderColor: colors.blueAccent[500],
                          boxShadow: `0 2px 8px ${colors.blueAccent[500]}40`,
                          '&:hover': {
                            backgroundColor: colors.blueAccent[600],
                          },
                        },
                        '&:hover': {
                          backgroundColor: isLight ? colors.grey[100] : colors.grey[700],
                          transform: 'translateY(-1px)',
                        },
                      },
                    }}
                  >
                    <ToggleButton value="progress">Progress</ToggleButton>
                    <ToggleButton value="status">Status</ToggleButton>
                  </ToggleButtonGroup>
                )}
                {statusOverviewExpanded ? (
                  <ExpandLessIcon sx={{ fontSize: 20, color: isLight ? colors.grey[600] : colors.grey[400] }} />
                ) : (
                  <ExpandMoreIcon sx={{ fontSize: 20, color: isLight ? colors.grey[600] : colors.grey[400] }} />
                )}
              </Box>
            </Box>
            <Collapse in={statusOverviewExpanded}>
              {/* Distribution Cards - Enhanced Scrollable Container */}
          <Box sx={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: 0.75, 
            overflowX: 'auto', 
            pb: 1,
            px: 0.5,
            '&::-webkit-scrollbar': { 
              height: '8px',
            }, 
            '&::-webkit-scrollbar-track': { 
              background: isLight ? colors.grey[100] : colors.primary[600], 
              borderRadius: '4px',
              margin: '0 8px',
            }, 
            '&::-webkit-scrollbar-thumb': { 
              background: isLight ? colors.grey[400] : colors.grey[600], 
              borderRadius: '4px',
              '&:hover': { 
                background: isLight ? colors.grey[500] : colors.grey[500] 
              } 
            } 
          }}>
            <Grid container spacing={0.5} sx={{ display: 'flex', flexWrap: 'nowrap', flex: 1 }}>

          {/* Progress View */}
          {distributionView === 'progress' && (
            <>
              <Grid item sx={{ minWidth: { xs: '125px', sm: '145px', md: '165px' }, flex: '0 0 auto' }}>
            <Card 
              onClick={() => handleProgressFilter(0)}
              sx={{ 
                height: '100%',
                background: isLight 
                  ? 'linear-gradient(135deg, #9e9e9e 0%, #bdbdbd 100%)'
                  : `linear-gradient(135deg, ${colors.grey[800]}, ${colors.grey[700]})`,
                color: isLight ? 'white' : 'inherit',
                borderTop: `2px solid ${isLight ? '#616161' : colors.grey[500]}`,
                border: filterModel.items?.find(item => item.field === 'overallProgress' && item.value === 0) 
                  ? `2px solid ${isLight ? '#000000' : '#ffffff'}` 
                  : 'none',
                boxShadow: ui.elevatedShadow,
                transition: 'transform 0.2s ease-in-out',
                cursor: 'pointer',
                '&:hover': {
                  transform: 'translateY(-2px)',
                  boxShadow: isLight ? '0 4px 12px rgba(158, 158, 158, 0.3)' : '0 4px 16px rgba(0, 0, 0, 0.25)',
                }
              }}
            >
                  <CardContent sx={{ p: 0.75, '&:last-child': { pb: 0.75 }, pt: 0.75 }}>
                    <Box display="flex" alignItems="center" justifyContent="space-between" mb={0.25}>
                      <Typography variant="caption" sx={{ color: isLight ? 'rgba(255, 255, 255, 0.9)' : colors.grey[100], fontWeight: 600, fontSize: '0.65rem' }}>
                        0% - Not Started
                      </Typography>
                      <ScheduleIcon sx={{ color: isLight ? 'rgba(255, 255, 255, 0.9)' : colors.grey[400], fontSize: 14 }} />
                    </Box>
                    <Typography variant="h5" sx={{ color: isLight ? '#ffffff' : '#fff', fontWeight: 'bold', fontSize: '1rem', mb: 0, lineHeight: 1.1 }}>
                      {summaryStats.progressStats?.notStarted || 0}
                    </Typography>
                    <Typography variant="caption" sx={{ color: isLight ? 'rgba(255, 255, 255, 0.8)' : colors.grey[300], fontWeight: 400, fontSize: '0.6rem', mt: 0.125 }}>
                      {summaryStats.totalProjects > 0 
                        ? Math.round((summaryStats.progressStats?.notStarted || 0) / summaryStats.totalProjects * 100) 
                        : 0}%
                    </Typography>
                  </CardContent>
            </Card>
          </Grid>

          <Grid item sx={{ minWidth: { xs: '140px', sm: '160px', md: '180px' }, flex: '0 0 auto' }}>
            <Card 
              onClick={() => handleProgressFilter(25)}
              sx={{ 
                height: '100%',
                background: isLight 
                  ? 'linear-gradient(135deg, #ff9800 0%, #ffb74d 100%)'
                  : `linear-gradient(135deg, ${colors.orange?.[800] || colors.yellowAccent[800]}, ${colors.orange?.[700] || colors.yellowAccent[700]})`,
                color: isLight ? 'white' : 'inherit',
                borderTop: `2px solid ${isLight ? '#f57c00' : colors.orange?.[500] || colors.yellowAccent[500]}`,
                border: filterModel.items?.find(item => item.field === 'overallProgress' && item.value === 25) 
                  ? `2px solid ${isLight ? '#000000' : '#ffffff'}` 
                  : 'none',
                boxShadow: ui.elevatedShadow,
                transition: 'transform 0.2s ease-in-out',
                cursor: 'pointer',
                '&:hover': {
                  transform: 'translateY(-2px)',
                  boxShadow: isLight ? '0 4px 12px rgba(255, 152, 0, 0.3)' : '0 4px 16px rgba(0, 0, 0, 0.25)',
                }
              }}
            >
                  <CardContent sx={{ p: 0.75, '&:last-child': { pb: 0.75 }, pt: 0.75 }}>
                    <Box display="flex" alignItems="center" justifyContent="space-between" mb={0.25}>
                      <Typography variant="caption" sx={{ color: isLight ? 'rgba(255, 255, 255, 0.9)' : colors.grey[100], fontWeight: 600, fontSize: '0.65rem' }}>
                        25% - Quarter
                      </Typography>
                      <PlayArrowIcon sx={{ color: isLight ? 'rgba(255, 255, 255, 0.9)' : colors.orange?.[400] || colors.yellowAccent[400], fontSize: 14 }} />
                    </Box>
                    <Typography variant="h5" sx={{ color: isLight ? '#ffffff' : '#fff', fontWeight: 'bold', fontSize: '1rem', mb: 0, lineHeight: 1.1 }}>
                      {summaryStats.progressStats?.quarter || 0}
                    </Typography>
                    <Typography variant="caption" sx={{ color: isLight ? 'rgba(255, 255, 255, 0.8)' : colors.grey[300], fontWeight: 400, fontSize: '0.6rem', mt: 0.125 }}>
                      {summaryStats.totalProjects > 0 
                        ? Math.round((summaryStats.progressStats?.quarter || 0) / summaryStats.totalProjects * 100) 
                        : 0}%
                    </Typography>
                  </CardContent>
            </Card>
          </Grid>

          <Grid item sx={{ minWidth: { xs: '140px', sm: '160px', md: '180px' }, flex: '0 0 auto' }}>
            <Card 
              onClick={() => handleProgressFilter(50)}
              sx={{ 
                height: '100%',
                background: isLight 
                  ? 'linear-gradient(135deg, #2196f3 0%, #42a5f5 100%)'
                  : `linear-gradient(135deg, ${colors.blueAccent[800]}, ${colors.blueAccent[700]})`,
                color: isLight ? 'white' : 'inherit',
                borderTop: `2px solid ${isLight ? '#1976d2' : colors.blueAccent[500]}`,
                border: filterModel.items?.find(item => item.field === 'overallProgress' && item.value === 50) 
                  ? `2px solid ${isLight ? '#000000' : '#ffffff'}` 
                  : 'none',
                boxShadow: ui.elevatedShadow,
                transition: 'transform 0.2s ease-in-out',
                cursor: 'pointer',
                '&:hover': {
                  transform: 'translateY(-2px)',
                  boxShadow: isLight ? '0 4px 12px rgba(33, 150, 243, 0.3)' : '0 4px 16px rgba(0, 0, 0, 0.25)',
                }
              }}
            >
                  <CardContent sx={{ p: 0.75, '&:last-child': { pb: 0.75 }, pt: 0.75 }}>
                    <Box display="flex" alignItems="center" justifyContent="space-between" mb={0.25}>
                      <Typography variant="caption" sx={{ color: isLight ? 'rgba(255, 255, 255, 0.9)' : colors.grey[100], fontWeight: 600, fontSize: '0.65rem' }}>
                        50% - Halfway
                      </Typography>
                      <HourglassIcon sx={{ color: isLight ? 'rgba(255, 255, 255, 0.9)' : colors.blueAccent[500], fontSize: 14 }} />
                    </Box>
                    <Typography variant="h5" sx={{ color: isLight ? '#ffffff' : '#fff', fontWeight: 'bold', fontSize: '1rem', mb: 0, lineHeight: 1.1 }}>
                      {summaryStats.progressStats?.halfway || 0}
                    </Typography>
                    <Typography variant="caption" sx={{ color: isLight ? 'rgba(255, 255, 255, 0.8)' : colors.grey[300], fontWeight: 400, fontSize: '0.6rem', mt: 0.125 }}>
                      {summaryStats.totalProjects > 0 
                        ? Math.round((summaryStats.progressStats?.halfway || 0) / summaryStats.totalProjects * 100) 
                        : 0}%
                    </Typography>
                  </CardContent>
            </Card>
          </Grid>

          <Grid item sx={{ minWidth: { xs: '140px', sm: '160px', md: '180px' }, flex: '0 0 auto' }}>
            <Card 
              onClick={() => handleProgressFilter(75)}
              sx={{ 
                height: '100%',
                background: isLight 
                  ? 'linear-gradient(135deg, #9c27b0 0%, #ba68c8 100%)'
                  : `linear-gradient(135deg, ${colors.purple?.[800] || colors.blueAccent[800]}, ${colors.purple?.[700] || colors.blueAccent[700]})`,
                color: isLight ? 'white' : 'inherit',
                borderTop: `2px solid ${isLight ? '#7b1fa2' : colors.purple?.[500] || colors.blueAccent[500]}`,
                border: filterModel.items?.find(item => item.field === 'overallProgress' && item.value === 75) 
                  ? `2px solid ${isLight ? '#000000' : '#ffffff'}` 
                  : 'none',
                boxShadow: ui.elevatedShadow,
                transition: 'transform 0.2s ease-in-out',
                cursor: 'pointer',
                '&:hover': {
                  transform: 'translateY(-2px)',
                  boxShadow: isLight ? '0 4px 12px rgba(156, 39, 176, 0.3)' : '0 4px 16px rgba(0, 0, 0, 0.25)',
                }
              }}
            >
                  <CardContent sx={{ p: 0.75, '&:last-child': { pb: 0.75 }, pt: 0.75 }}>
                    <Box display="flex" alignItems="center" justifyContent="space-between" mb={0.25}>
                      <Typography variant="caption" sx={{ color: isLight ? 'rgba(255, 255, 255, 0.9)' : colors.grey[100], fontWeight: 600, fontSize: '0.65rem' }}>
                        75% - Nearly Complete
                      </Typography>
                      <CheckCircleOutlineIcon sx={{ color: isLight ? 'rgba(255, 255, 255, 0.9)' : colors.purple?.[400] || colors.blueAccent[400], fontSize: 14 }} />
                    </Box>
                    <Typography variant="h5" sx={{ color: isLight ? '#ffffff' : '#fff', fontWeight: 'bold', fontSize: '1rem', mb: 0, lineHeight: 1.1 }}>
                      {summaryStats.progressStats?.threeQuarter || 0}
                    </Typography>
                    <Typography variant="caption" sx={{ color: isLight ? 'rgba(255, 255, 255, 0.8)' : colors.grey[300], fontWeight: 400, fontSize: '0.6rem', mt: 0.125 }}>
                      {summaryStats.totalProjects > 0 
                        ? Math.round((summaryStats.progressStats?.threeQuarter || 0) / summaryStats.totalProjects * 100) 
                        : 0}%
                    </Typography>
                  </CardContent>
            </Card>
          </Grid>

          <Grid item sx={{ minWidth: { xs: '140px', sm: '160px', md: '180px' }, flex: '0 0 auto' }}>
            <Card 
              onClick={() => handleProgressFilter(100)}
              sx={{ 
                height: '100%',
                background: isLight 
                  ? 'linear-gradient(135deg, #4caf50 0%, #81c784 100%)'
                  : `linear-gradient(135deg, ${colors.greenAccent[800]}, ${colors.greenAccent[700]})`,
                color: isLight ? 'white' : 'inherit',
                borderTop: `2px solid ${isLight ? '#388e3c' : colors.greenAccent[500]}`,
                border: filterModel.items?.find(item => item.field === 'overallProgress' && item.value === 100) 
                  ? `2px solid ${isLight ? '#000000' : '#ffffff'}` 
                  : 'none',
                boxShadow: ui.elevatedShadow,
                transition: 'transform 0.2s ease-in-out',
                cursor: 'pointer',
                '&:hover': {
                  transform: 'translateY(-2px)',
                  boxShadow: isLight ? '0 4px 12px rgba(76, 175, 80, 0.3)' : '0 4px 16px rgba(0, 0, 0, 0.25)',
                }
              }}
            >
                  <CardContent sx={{ p: 0.75, '&:last-child': { pb: 0.75 }, pt: 0.75 }}>
                    <Box display="flex" alignItems="center" justifyContent="space-between" mb={0.25}>
                      <Typography variant="caption" sx={{ color: isLight ? 'rgba(255, 255, 255, 0.9)' : colors.grey[100], fontWeight: 600, fontSize: '0.65rem' }}>
                        100% - Completed
                      </Typography>
                      <CheckCircleIcon sx={{ color: isLight ? 'rgba(255, 255, 255, 0.9)' : colors.greenAccent[500], fontSize: 14 }} />
                    </Box>
                    <Typography variant="h5" sx={{ color: isLight ? '#ffffff' : '#fff', fontWeight: 'bold', fontSize: '1rem', mb: 0, lineHeight: 1.1 }}>
                      {summaryStats.progressStats?.completed || 0}
                    </Typography>
                    <Typography variant="caption" sx={{ color: isLight ? 'rgba(255, 255, 255, 0.8)' : colors.grey[300], fontWeight: 400, fontSize: '0.6rem', mt: 0.125 }}>
                      {summaryStats.totalProjects > 0 
                        ? Math.round((summaryStats.progressStats?.completed || 0) / summaryStats.totalProjects * 100) 
                        : 0}%
                    </Typography>
                  </CardContent>
            </Card>
          </Grid>
            </>
          )}

          {/* Status Distribution View */}
          {distributionView === 'status' && (
            <>
              {/* Completed */}
              <Grid item sx={{ minWidth: { xs: '110px', sm: '130px', md: '145px' }, flex: '0 0 auto' }}>
                <Card 
                  onClick={() => handleStatusFilter('Completed')}
                  sx={{ 
                    height: '100%',
                    background: isLight 
                      ? 'linear-gradient(135deg, #4caf50 0%, #81c784 100%)'
                      : `linear-gradient(135deg, ${colors.greenAccent[800]}, ${colors.greenAccent[700]})`,
                    color: isLight ? 'white' : 'inherit',
                    borderTop: `2px solid ${isLight ? '#388e3c' : colors.greenAccent[500]}`,
                    border: filterModel.items?.some(item => item.field === 'status' && normalizeProjectStatus(item.value) === 'Completed')
                      ? `2px solid ${isLight ? '#000000' : '#ffffff'}` 
                      : 'none',
                    boxShadow: ui.elevatedShadow,
                    transition: 'all 0.2s ease-in-out',
                    cursor: 'pointer',
                    borderRadius: '8px',
                    '&:hover': {
                      transform: 'translateY(-2px) scale(1.02)',
                      boxShadow: isLight ? '0 4px 12px rgba(76, 175, 80, 0.3)' : '0 4px 16px rgba(0, 0, 0, 0.25)',
                    }
                  }}
                >
                  <CardContent sx={{ p: 0.75, '&:last-child': { pb: 0.75 }, pt: 0.75 }}>
                    <Box display="flex" alignItems="center" justifyContent="space-between" mb={0.25}>
                      <Typography variant="caption" sx={{ color: isLight ? 'rgba(255, 255, 255, 0.9)' : colors.grey[100], fontWeight: 600, fontSize: '0.65rem' }}>
                        Completed
                      </Typography>
                      <CheckCircleIcon sx={{ color: isLight ? 'rgba(255, 255, 255, 0.9)' : colors.greenAccent[500], fontSize: 14 }} />
                    </Box>
                    <Typography variant="h5" sx={{ color: isLight ? '#ffffff' : '#fff', fontWeight: 'bold', fontSize: '1rem', mb: 0, lineHeight: 1.1 }}>
                      {summaryStats.statusStats?.['Completed'] || 0}
                    </Typography>
                    <Typography variant="caption" sx={{ color: isLight ? 'rgba(255, 255, 255, 0.8)' : colors.grey[300], fontWeight: 400, fontSize: '0.6rem', mt: 0.125 }}>
                      {summaryStats.totalProjects > 0 
                        ? Math.round((summaryStats.statusStats?.['Completed'] || 0) / summaryStats.totalProjects * 100) 
                        : 0}%
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>

              {/* Ongoing */}
              <Grid item sx={{ minWidth: { xs: '110px', sm: '130px', md: '145px' }, flex: '0 0 auto' }}>
                <Card 
                  onClick={() => handleStatusFilter('Ongoing')}
                  sx={{ 
                    height: '100%',
                    background: isLight 
                      ? 'linear-gradient(135deg, #2196f3 0%, #42a5f5 100%)'
                      : `linear-gradient(135deg, ${colors.blueAccent[800]}, ${colors.blueAccent[700]})`,
                    color: isLight ? 'white' : 'inherit',
                    borderTop: `2px solid ${isLight ? '#1976d2' : colors.blueAccent[500]}`,
                    border: filterModel.items?.some(item => item.field === 'status' && normalizeProjectStatus(item.value) === 'Ongoing')
                      ? `2px solid ${isLight ? '#000000' : '#ffffff'}` 
                      : 'none',
                    boxShadow: ui.elevatedShadow,
                    transition: 'all 0.2s ease-in-out',
                    cursor: 'pointer',
                    borderRadius: '8px',
                    '&:hover': {
                      transform: 'translateY(-2px) scale(1.02)',
                      boxShadow: isLight ? '0 4px 12px rgba(33, 150, 243, 0.3)' : '0 4px 16px rgba(0, 0, 0, 0.25)',
                    }
                  }}
                >
                  <CardContent sx={{ p: 0.75, '&:last-child': { pb: 0.75 }, pt: 0.75 }}>
                    <Box display="flex" alignItems="center" justifyContent="space-between" mb={0.25}>
                      <Typography variant="caption" sx={{ color: isLight ? 'rgba(255, 255, 255, 0.9)' : colors.grey[100], fontWeight: 600, fontSize: '0.65rem' }}>
                        Ongoing
                      </Typography>
                      <PlayArrowIcon sx={{ color: isLight ? 'rgba(255, 255, 255, 0.9)' : colors.blueAccent[500], fontSize: 14 }} />
                    </Box>
                    <Typography variant="h5" sx={{ color: isLight ? '#ffffff' : '#fff', fontWeight: 'bold', fontSize: '1rem', mb: 0, lineHeight: 1.1 }}>
                      {summaryStats.statusStats?.['Ongoing'] || 0}
                    </Typography>
                    <Typography variant="caption" sx={{ color: isLight ? 'rgba(255, 255, 255, 0.8)' : colors.grey[300], fontWeight: 400, fontSize: '0.6rem', mt: 0.125 }}>
                      {summaryStats.totalProjects > 0 
                        ? Math.round((summaryStats.statusStats?.['Ongoing'] || 0) / summaryStats.totalProjects * 100) 
                        : 0}%
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>

              {/* Not started */}
              <Grid item sx={{ minWidth: { xs: '110px', sm: '130px', md: '145px' }, flex: '0 0 auto' }}>
                <Card 
                  onClick={() => handleStatusFilter('Not started')}
                  sx={{ 
                    height: '100%',
                    background: isLight 
                      ? 'linear-gradient(135deg, #9e9e9e 0%, #bdbdbd 100%)'
                      : `linear-gradient(135deg, ${colors.grey[800]}, ${colors.grey[700]})`,
                    color: isLight ? 'white' : 'inherit',
                    borderTop: `2px solid ${isLight ? '#616161' : colors.grey[500]}`,
                    border: filterModel.items?.some(item => item.field === 'status' && normalizeProjectStatus(item.value) === 'Not started')
                      ? `2px solid ${isLight ? '#000000' : '#ffffff'}` 
                      : 'none',
                    boxShadow: ui.elevatedShadow,
                    transition: 'all 0.2s ease-in-out',
                    cursor: 'pointer',
                    borderRadius: '8px',
                    '&:hover': {
                      transform: 'translateY(-2px) scale(1.02)',
                      boxShadow: isLight ? '0 4px 12px rgba(158, 158, 158, 0.3)' : '0 4px 16px rgba(0, 0, 0, 0.25)',
                    }
                  }}
                >
                  <CardContent sx={{ p: 0.75, '&:last-child': { pb: 0.75 }, pt: 0.75 }}>
                    <Box display="flex" alignItems="center" justifyContent="space-between" mb={0.25}>
                      <Typography variant="caption" sx={{ color: isLight ? 'rgba(255, 255, 255, 0.9)' : colors.grey[100], fontWeight: 600, fontSize: '0.65rem' }}>
                        Not Started
                      </Typography>
                      <ScheduleIcon sx={{ color: isLight ? 'rgba(255, 255, 255, 0.9)' : colors.grey[400], fontSize: 14 }} />
                    </Box>
                    <Typography variant="h5" sx={{ color: isLight ? '#ffffff' : '#fff', fontWeight: 'bold', fontSize: '1rem', mb: 0, lineHeight: 1.1 }}>
                      {summaryStats.statusStats?.['Not started'] || 0}
                    </Typography>
                    <Typography variant="caption" sx={{ color: isLight ? 'rgba(255, 255, 255, 0.8)' : colors.grey[300], fontWeight: 400, fontSize: '0.6rem', mt: 0.125 }}>
                      {summaryStats.totalProjects > 0 
                        ? Math.round((summaryStats.statusStats?.['Not started'] || 0) / summaryStats.totalProjects * 100) 
                        : 0}%
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>

              {/* Stalled */}
              <Grid item sx={{ minWidth: { xs: '110px', sm: '130px', md: '145px' }, flex: '0 0 auto' }}>
                <Card 
                  onClick={() => handleStatusFilter('Stalled')}
                  sx={{ 
                    height: '100%',
                    background: isLight 
                      ? 'linear-gradient(135deg, #ff9800 0%, #ffb74d 100%)'
                      : `linear-gradient(135deg, ${colors.orange?.[800] || colors.yellowAccent[800]}, ${colors.orange?.[700] || colors.yellowAccent[700]})`,
                    color: isLight ? 'white' : 'inherit',
                    borderTop: `2px solid ${isLight ? '#f57c00' : colors.orange?.[500] || colors.yellowAccent[500]}`,
                    border: filterModel.items?.some(item => item.field === 'status' && normalizeProjectStatus(item.value) === 'Stalled')
                      ? `2px solid ${isLight ? '#000000' : '#ffffff'}` 
                      : 'none',
                    boxShadow: ui.elevatedShadow,
                    transition: 'all 0.2s ease-in-out',
                    cursor: 'pointer',
                    borderRadius: '8px',
                    '&:hover': {
                      transform: 'translateY(-2px) scale(1.02)',
                      boxShadow: isLight ? '0 4px 12px rgba(255, 152, 0, 0.3)' : '0 4px 16px rgba(0, 0, 0, 0.25)',
                    }
                  }}
                >
                  <CardContent sx={{ p: 0.75, '&:last-child': { pb: 0.75 }, pt: 0.75 }}>
                    <Box display="flex" alignItems="center" justifyContent="space-between" mb={0.25}>
                      <Typography variant="caption" sx={{ color: isLight ? 'rgba(255, 255, 255, 0.9)' : colors.grey[100], fontWeight: 600, fontSize: '0.65rem' }}>
                        Stalled
                      </Typography>
                      <PauseIcon sx={{ color: isLight ? 'rgba(255, 255, 255, 0.9)' : colors.orange?.[400] || colors.yellowAccent[400], fontSize: 14 }} />
                    </Box>
                    <Typography variant="h5" sx={{ color: isLight ? '#ffffff' : '#fff', fontWeight: 'bold', fontSize: '1rem', mb: 0, lineHeight: 1.1 }}>
                      {summaryStats.statusStats?.['Stalled'] || 0}
                    </Typography>
                    <Typography variant="caption" sx={{ color: isLight ? 'rgba(255, 255, 255, 0.8)' : colors.grey[300], fontWeight: 400, fontSize: '0.6rem', mt: 0.125 }}>
                      {summaryStats.totalProjects > 0 
                        ? Math.round((summaryStats.statusStats?.['Stalled'] || 0) / summaryStats.totalProjects * 100) 
                        : 0}%
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>

              {/* Under Procurement */}
              <Grid item sx={{ minWidth: { xs: '110px', sm: '130px', md: '145px' }, flex: '0 0 auto' }}>
                <Card 
                  onClick={() => handleStatusFilter('Under Procurement')}
                  sx={{ 
                    height: '100%',
                    background: isLight 
                      ? 'linear-gradient(135deg, #9c27b0 0%, #ba68c8 100%)'
                      : `linear-gradient(135deg, ${colors.purple?.[800] || colors.blueAccent[800]}, ${colors.purple?.[700] || colors.blueAccent[700]})`,
                    color: isLight ? 'white' : 'inherit',
                    borderTop: `2px solid ${isLight ? '#7b1fa2' : colors.purple?.[500] || colors.blueAccent[500]}`,
                    border: filterModel.items?.some(item => item.field === 'status' && normalizeProjectStatus(item.value) === 'Under Procurement')
                      ? `2px solid ${isLight ? '#000000' : '#ffffff'}` 
                      : 'none',
                    boxShadow: ui.elevatedShadow,
                    transition: 'all 0.2s ease-in-out',
                    cursor: 'pointer',
                    borderRadius: '8px',
                    '&:hover': {
                      transform: 'translateY(-2px) scale(1.02)',
                      boxShadow: isLight ? '0 4px 12px rgba(156, 39, 176, 0.3)' : '0 4px 16px rgba(0, 0, 0, 0.25)',
                    }
                  }}
                >
                  <CardContent sx={{ p: 0.75, '&:last-child': { pb: 0.75 }, pt: 0.75 }}>
                    <Box display="flex" alignItems="center" justifyContent="space-between" mb={0.25}>
                      <Typography variant="caption" sx={{ color: isLight ? 'rgba(255, 255, 255, 0.9)' : colors.grey[100], fontWeight: 600, fontSize: '0.65rem' }}>
                        Under Procurement
                      </Typography>
                      <HourglassIcon sx={{ color: isLight ? 'rgba(255, 255, 255, 0.9)' : colors.purple?.[400] || colors.blueAccent[400], fontSize: 14 }} />
                    </Box>
                    <Typography variant="h5" sx={{ color: isLight ? '#ffffff' : '#fff', fontWeight: 'bold', fontSize: '1rem', mb: 0, lineHeight: 1.1 }}>
                      {summaryStats.statusStats?.['Under Procurement'] || 0}
                    </Typography>
                    <Typography variant="caption" sx={{ color: isLight ? 'rgba(255, 255, 255, 0.8)' : colors.grey[300], fontWeight: 400, fontSize: '0.6rem', mt: 0.125 }}>
                      {summaryStats.totalProjects > 0 
                        ? Math.round((summaryStats.statusStats?.['Under Procurement'] || 0) / summaryStats.totalProjects * 100) 
                        : 0}%
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>

              {/* Suspended */}
              <Grid item sx={{ minWidth: { xs: '110px', sm: '130px', md: '145px' }, flex: '0 0 auto' }}>
                <Card 
                  onClick={() => handleStatusFilter('Suspended')}
                  sx={{ 
                    height: '100%',
                    background: isLight 
                      ? 'linear-gradient(135deg, #f44336 0%, #e57373 100%)'
                      : `linear-gradient(135deg, ${colors.redAccent[800]}, ${colors.redAccent[700]})`,
                    color: isLight ? 'white' : 'inherit',
                    borderTop: `2px solid ${isLight ? '#d32f2f' : colors.redAccent[500]}`,
                    border: filterModel.items?.some(item => item.field === 'status' && normalizeProjectStatus(item.value) === 'Suspended')
                      ? `2px solid ${isLight ? '#000000' : '#ffffff'}` 
                      : 'none',
                    boxShadow: ui.elevatedShadow,
                    transition: 'all 0.2s ease-in-out',
                    cursor: 'pointer',
                    borderRadius: '8px',
                    '&:hover': {
                      transform: 'translateY(-2px) scale(1.02)',
                      boxShadow: isLight ? '0 4px 12px rgba(244, 67, 54, 0.3)' : '0 4px 16px rgba(0, 0, 0, 0.25)',
                    }
                  }}
                >
                  <CardContent sx={{ p: 0.75, '&:last-child': { pb: 0.75 }, pt: 0.75 }}>
                    <Box display="flex" alignItems="center" justifyContent="space-between" mb={0.25}>
                      <Typography variant="caption" sx={{ color: isLight ? 'rgba(255, 255, 255, 0.9)' : colors.grey[100], fontWeight: 600, fontSize: '0.65rem' }}>
                        Suspended
                      </Typography>
                      <CancelIcon sx={{ color: isLight ? 'rgba(255, 255, 255, 0.9)' : colors.redAccent[500], fontSize: 14 }} />
                    </Box>
                    <Typography variant="h5" sx={{ color: isLight ? '#ffffff' : '#fff', fontWeight: 'bold', fontSize: '1rem', mb: 0, lineHeight: 1.1 }}>
                      {summaryStats.statusStats?.['Suspended'] || 0}
                    </Typography>
                    <Typography variant="caption" sx={{ color: isLight ? 'rgba(255, 255, 255, 0.8)' : colors.grey[300], fontWeight: 400, fontSize: '0.6rem', mt: 0.125 }}>
                      {summaryStats.totalProjects > 0 
                        ? Math.round((summaryStats.statusStats?.['Suspended'] || 0) / summaryStats.totalProjects * 100) 
                        : 0}%
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>

              {/* Other */}
              <Grid item sx={{ minWidth: { xs: '110px', sm: '130px', md: '145px' }, flex: '0 0 auto' }}>
                <Card 
                  onClick={() => handleStatusFilter('Other')}
                  sx={{ 
                    height: '100%',
                    background: isLight 
                      ? 'linear-gradient(135deg, #FF1493 0%, #FF69B4 100%)'
                      : `linear-gradient(135deg, #C71585, #FF1493)`,
                    color: isLight ? 'white' : 'inherit',
                    borderTop: `2px solid ${isLight ? '#DC143C' : '#FF1493'}`,
                    border: filterModel.items?.some(item => item.field === 'status' && normalizeProjectStatus(item.value) === 'Other')
                      ? `2px solid ${isLight ? '#000000' : '#ffffff'}` 
                      : 'none',
                    boxShadow: ui.elevatedShadow,
                    transition: 'all 0.2s ease-in-out',
                    cursor: 'pointer',
                    borderRadius: '8px',
                    '&:hover': {
                      transform: 'translateY(-2px) scale(1.02)',
                      boxShadow: isLight ? '0 4px 12px rgba(255, 20, 147, 0.4)' : '0 4px 16px rgba(255, 20, 147, 0.3)',
                    }
                  }}
                >
                  <CardContent sx={{ p: 0.75, '&:last-child': { pb: 0.75 }, pt: 0.75 }}>
                    <Box display="flex" alignItems="center" justifyContent="space-between" mb={0.25}>
                      <Typography variant="caption" sx={{ color: isLight ? 'rgba(255, 255, 255, 0.9)' : colors.grey[100], fontWeight: 600, fontSize: '0.65rem' }}>
                        Other
                      </Typography>
                      <WarningIcon sx={{ color: isLight ? 'rgba(255, 255, 255, 0.9)' : colors.grey[400], fontSize: 14 }} />
                    </Box>
                    <Typography variant="h5" sx={{ color: isLight ? '#ffffff' : '#fff', fontWeight: 'bold', fontSize: '1rem', mb: 0, lineHeight: 1.1 }}>
                      {summaryStats.statusStats?.['Other'] || 0}
                    </Typography>
                    <Typography variant="caption" sx={{ color: isLight ? 'rgba(255, 255, 255, 0.8)' : colors.grey[300], fontWeight: 400, fontSize: '0.6rem', mt: 0.125 }}>
                      {summaryStats.totalProjects > 0 
                        ? Math.round((summaryStats.statusStats?.['Other'] || 0) / summaryStats.totalProjects * 100) 
                        : 0}%
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            </>
          )}
            </Grid>
          </Box>
            </Collapse>
          </Box>
        </Box>
      )}

      {loading && (<Box display="flex" justifyContent="center" alignItems="center" height="200px"><CircularProgress /><Typography sx={{ ml: 2 }}>Loading projects...</Typography></Box>)}
      {error && (<Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>)}
      {!loading && !error && projects.length === 0 && checkUserPrivilege(user, 'project.read_all') && (<Alert severity="info" sx={{ mt: 2 }}>No projects found. Use the search bar or column filters to find projects, or add a new project.</Alert>)}
      {!loading && !error && projects.length === 0 && !checkUserPrivilege(user, 'project.read_all') && (<Alert severity="warning" sx={{ mt: 2 }}>You do not have the necessary permissions to view any projects.</Alert>)}
      {!loading && !error && projects.length > 0 && searchQuery && filteredProjects.length === 0 && (
        <Alert severity="info" sx={{ mt: 2 }}>
          No projects match your search query "{searchQuery}". Try different keywords or clear the search.
        </Alert>
      )}
      {!loading && !error && projects.length > 0 && filterModel.items?.length > 0 && dataGridFilteredProjects?.length === 0 && (
        <Alert severity="info" sx={{ mt: 2 }}>
          No projects match the current filter. Try adjusting your filters or clear them to see all projects.
        </Alert>
      )}

      
      {!loading && !error && projects.length > 0 && columns && columns.length > 0 && (
        <Box
          ref={dataGridRef}
            sx={{
              mt: 0.5,
              backgroundColor: ui.bodyBg,
              borderRadius: '8px',
              overflow: 'hidden',
              boxShadow: ui.elevatedShadow,
              border: `1px solid ${ui.border}`,
              width: '100%',
              ...getThemedDataGridSx(theme, colors, { _stickyHeaderTop: 74 }),
              '& .MuiDataGrid-columnHeaders': {
                minHeight: '40px !important',
                maxHeight: '40px !important',
                fontSize: '0.8125rem', // Compact header font
                '& .MuiDataGrid-columnHeaderTitle': {
                  fontSize: '0.8125rem',
                  fontWeight: 600,
                },
              },
              // Ensure Actions column header has same background as other headers (no white strip)
              '& .MuiDataGrid-columnHeader[data-field="actions"]': {
                backgroundColor: `${theme.palette.mode === 'light' ? 'rgba(25, 118, 210, 0.04)' : colors.blueAccent[800]} !important`,
              },
              '& .MuiDataGrid-columnHeader[data-field="actions"] .MuiDataGrid-columnHeaderTitleContainer': {
                backgroundColor: 'inherit !important',
                overflow: 'visible',
                paddingRight: 8,
              },
              // Ensure Actions column cells are properly aligned
              '& .MuiDataGrid-cell[data-field="actions"]': {
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '4px !important',
              },
              '& .MuiDataGrid-footerContainer': {
                minHeight: '40px !important',
                maxHeight: '40px !important',
                fontSize: '0.8125rem',
                color: `${theme.palette.text.primary} !important`,
              },
              '& .MuiDataGrid-footerContainer .MuiTablePagination-selectLabel, & .MuiDataGrid-footerContainer .MuiTablePagination-displayedRows': {
                color: `${theme.palette.text.primary} !important`,
              },
              '& .MuiDataGrid-footerContainer .MuiTablePagination-select': {
                color: `${theme.palette.text.primary} !important`,
              },
            }}
        >
          <DataGrid
            rows={dataGridFilteredProjects || []}
            columns={columns}
            getRowId={(row) => row?.id || Math.random()}
            getRowHeight={(params) => {
              // Calculate row height based on project name length (compact)
              const projectName = params.row?.projectName || '';
              const lineHeight = 18; // Compact line height in pixels
              const padding = 12; // Reduced top and bottom padding
              const minHeight = 36; // Compact minimum height
              const estimatedLines = Math.ceil(projectName.length / 50); // Rough estimate: ~50 chars per line
              const calculatedHeight = Math.max(minHeight, (estimatedLines * lineHeight) + padding);
              return calculatedHeight;
            }}
            columnVisibilityModel={{
              ...columnVisibilityModel,
              actions: true, // Always show actions column
            }}
            onColumnVisibilityModelChange={(newModel) => {
              // Ensure actions column is always visible
              const updatedModel = { ...newModel, actions: true };
              setColumnVisibilityModel(updatedModel);
              localStorage.setItem('projectTableColumnVisibility', JSON.stringify(updatedModel));
            }}
            // Don't pass filterModel to DataGrid - we handle filtering ourselves in dataGridFilteredProjects
            // filterModel={filterModel}
            // onFilterModelChange={setFilterModel}
            disableColumnFilter={true}
            disableColumnMenu={false}
            paginationModel={paginationModel}
            onPaginationModelChange={setPaginationModel}
            initialState={{
              sorting: {
                sortModel: [{ field: orderBy, sort: order }],
              },
            }}
            pageSizeOptions={[10, 15, 25, 50, 100]}
            disableRowSelectionOnClick
            checkboxSelection={false}
            disableColumnSelector={false}
            disableDensitySelector={false}
            autoHeight
            sx={{
              width: '100%',
              '& .project-name-cell': {
                whiteSpace: 'normal !important',
                wordWrap: 'break-word !important',
                overflowWrap: 'break-word !important',
                wordBreak: 'break-word !important',
                paddingTop: '6px !important',
                paddingBottom: '6px !important',
                minHeight: '36px !important',
                display: 'flex !important',
                alignItems: 'flex-start !important',
                overflow: 'visible !important',
                textOverflow: 'clip !important',
                boxSizing: 'border-box !important',
                position: 'relative !important',
                zIndex: 'auto !important',
                '& .MuiDataGrid-cellContent': {
                  overflow: 'visible !important',
                  textOverflow: 'clip !important',
                  whiteSpace: 'normal !important',
                  wordWrap: 'break-word !important',
                  wordBreak: 'break-word !important',
                  position: 'relative !important',
                  zIndex: 'auto !important',
                },
                '&:hover': {
                  overflow: 'visible !important',
                  zIndex: 'auto !important',
                  '& .MuiDataGrid-cellContent': {
                    overflow: 'visible !important',
                    zIndex: 'auto !important',
                  }
                }
              },
              '& .MuiDataGrid-row': {
                maxHeight: 'none !important',
                '& .MuiDataGrid-cell': {
                  maxHeight: 'none !important',
                  overflow: 'visible !important',
                },
                '&:hover .MuiDataGrid-cell': {
                  overflow: 'visible !important',
                  zIndex: 'auto !important',
                },
                '&:hover .project-name-cell': {
                  overflow: 'visible !important',
                  zIndex: 'auto !important',
                  '& .MuiDataGrid-cellContent': {
                    overflow: 'visible !important',
                    zIndex: 'auto !important',
                  }
                }
              },
              '& .MuiDataGrid-cell': {
                display: 'flex',
                alignItems: 'center',
                paddingTop: '4px',
                paddingBottom: '4px',
                paddingLeft: '8px',
                paddingRight: '8px',
                fontSize: '0.8125rem', // Compact font size (13px)
                overflow: 'visible !important',
                position: 'relative',
                zIndex: 'auto',
                '&.project-name-cell': {
                  alignItems: 'flex-start',
                  overflow: 'visible !important',
                  zIndex: 'auto',
                },
                '&:hover': {
                  overflow: 'visible !important',
                  zIndex: 'auto !important',
                }
              },
              '& .MuiDataGrid-cellContent': {
                overflow: 'visible !important',
                textOverflow: 'clip',
                whiteSpace: 'normal',
                width: '100%',
                maxWidth: '100%',
                wordWrap: 'break-word',
                wordBreak: 'break-word',
                position: 'relative',
                zIndex: 'auto',
              },
              '& .project-name-cell .MuiDataGrid-cellContent': {
                overflow: 'visible !important',
                textOverflow: 'clip !important',
                whiteSpace: 'normal !important',
                wordWrap: 'break-word !important',
                wordBreak: 'break-word !important',
                width: '100% !important',
                maxWidth: '100% !important',
              },
              '& .MuiDataGrid-virtualScrollerContent': {
                '& .MuiDataGrid-row': {
                  overflow: 'visible !important',
                  position: 'relative',
                  '& .MuiDataGrid-cell': {
                    overflow: 'visible !important',
                    position: 'relative',
                    '&:hover': {
                      overflow: 'visible !important',
                    }
                  },
                  '&:hover': {
                    overflow: 'visible !important',
                    '& .MuiDataGrid-cell': {
                      overflow: 'visible !important',
                    }
                  }
                }
              }
            }}
          />
        </Box>
      )}

      <ProjectFormDialog
        open={openFormDialog}
        handleClose={handleCloseFormDialog}
        currentProject={currentProject}
        onFormSuccess={handleFormSuccess}
        setSnackbar={setSnackbar}
        allMetadata={allMetadata || {}}
        user={user}
      />
      
      {/* SCOPE_DOWN: contractors/contractor_users tables removed. Re-enable when restoring for wider market. */}
      {false && (
        <AssignContractorModal
          open={openAssignModal}
          onClose={handleCloseAssignModal}
          project={selectedProjectForAssignment}
        />
      )}
      
      {/* Project Sites Modal */}
      <ProjectSitesModal
        open={openSitesModal}
        onClose={() => {
          setOpenSitesModal(false);
          setSelectedProjectForSites(null);
        }}
        projectId={selectedProjectForSites?.id}
        projectName={selectedProjectForSites?.name}
      />

      {/* Project Jobs Modal */}
      <ProjectJobsModal
        open={openJobsModal}
        onClose={() => {
          setOpenJobsModal(false);
          setSelectedProjectForJobs(null);
        }}
        projectId={selectedProjectForJobs?.id}
        projectName={selectedProjectForJobs?.name}
      />

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteConfirmOpen} onClose={() => setDeleteConfirmOpen(false)}>
        <DialogTitle sx={{ backgroundColor: 'error.main', color: 'white' }}>
          Confirm Deletion
        </DialogTitle>
        <DialogContent dividers sx={{ pt: 2 }}>
          <Typography>
            Are you sure you want to delete "{projectToDelete?.projectName || 'this project'}"? This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConfirmOpen(false)} color="primary" variant="outlined">
            Cancel
          </Button>
          <Button onClick={handleDeleteConfirm} color="error" variant="contained">
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      {/* Context Menu for Row Actions */}
      <Menu
        open={contextMenu !== null}
        onClose={handleContextMenuClose}
        anchorReference="anchorPosition"
        anchorPosition={
          contextMenu !== null
            ? { top: contextMenu.mouseY, left: contextMenu.mouseX }
            : undefined
        }
      >
        {selectedProjectForContextMenu && checkUserPrivilege(user, 'project.update') && (
          <MenuItem onClick={() => {
            handleOpenFormDialog(selectedProjectForContextMenu);
            handleContextMenuClose();
          }}>
            <ListItemIcon><EditIcon fontSize="small" /></ListItemIcon>
            <ListItemText>Edit Project</ListItemText>
          </MenuItem>
        )}
        {selectedProjectForContextMenu && checkUserPrivilege(user, 'project.delete') && (
          <MenuItem onClick={() => {
            handleDeleteProject(selectedProjectForContextMenu);
            handleContextMenuClose();
          }}>
            <ListItemIcon><DeleteIcon fontSize="small" /></ListItemIcon>
            <ListItemText>Delete Project</ListItemText>
          </MenuItem>
        )}
        {selectedProjectForContextMenu && (
          <MenuItem onClick={() => {
            handleViewDetails(selectedProjectForContextMenu.id);
            handleContextMenuClose();
          }}>
            <ListItemIcon><ViewDetailsIcon fontSize="small" /></ListItemIcon>
            <ListItemText>View Details</ListItemText>
          </MenuItem>
        )}
      </Menu>

      {/* Row Action Menu */}
      <Menu
        anchorEl={rowActionMenuAnchor}
        open={Boolean(rowActionMenuAnchor)}
        onClose={() => {
          setRowActionMenuAnchor(null);
          setSelectedRow(null);
        }}
        anchorOrigin={{
          vertical: 'bottom',
          horizontal: 'right',
        }}
        transformOrigin={{
          vertical: 'top',
          horizontal: 'right',
        }}
        transitionDuration={0}
      >
        {selectedRow && checkUserPrivilege(user, 'project.update') && (
          <MenuItem 
            onClick={() => {
              handleOpenFormDialog(selectedRow);
              setRowActionMenuAnchor(null);
              setSelectedRow(null);
            }}
          >
            <ListItemIcon>
              <EditIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>Edit</ListItemText>
          </MenuItem>
        )}
        {selectedRow && checkUserPrivilege(user, 'project.delete') && (
          <MenuItem 
            onClick={() => {
              handleDeleteProject(selectedRow);
              setRowActionMenuAnchor(null);
              setSelectedRow(null);
            }}
          >
            <ListItemIcon>
              <DeleteIcon fontSize="small" sx={{ color: ui.danger }} />
            </ListItemIcon>
            <ListItemText>Delete</ListItemText>
          </MenuItem>
        )}
        {selectedRow && (
          <MenuItem onClick={() => {
            const projectId = selectedRow.id ?? selectedRow.project_id ?? selectedRow.projectId;
            if (projectId) handleViewDetails(projectId);
            setRowActionMenuAnchor(null);
            setSelectedRow(null);
          }}>
            <ListItemIcon>
              <ViewDetailsIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>View Details</ListItemText>
          </MenuItem>
        )}
      </Menu>

      <Snackbar open={snackbar.open} autoHideDuration={6000} onClose={handleCloseSnackbar}>
        <Alert onClose={handleCloseSnackbar} severity={snackbar.severity}>{snackbar.message}</Alert>
      </Snackbar>
    </Box>
  );
}

export default ProjectManagementPage;