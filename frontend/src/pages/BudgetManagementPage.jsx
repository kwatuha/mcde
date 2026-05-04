import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box, Typography, Button, TextField, Dialog, DialogTitle,
  DialogContent, DialogActions, CircularProgress, IconButton,
  Select, MenuItem, FormControl, InputLabel, Snackbar, Alert, 
  Stack, useTheme, Tooltip, Grid, Paper, Chip, Autocomplete,
  Tabs, Tab, Card, CardContent, Divider, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, Avatar,
  DialogContentText, Menu, ListItemIcon, ListItemText
} from '@mui/material';
import { DataGrid } from '@mui/x-data-grid';
import { 
  Add as AddIcon, 
  Edit as EditIcon, 
  Delete as DeleteIcon,
  AttachMoney as MoneyIcon,
  FilterList as FilterIcon,
  CheckCircle as CheckCircleIcon,
  Cancel as CancelIcon,
  Lock as LockIcon,
  LockOpen as LockOpenIcon,
  Visibility as ViewIcon,
  Approval as ApprovalIcon,
  AccountBalanceWallet as WalletIcon,
  PendingActions as PendingIcon,
  TrendingUp as TrendingUpIcon,
  FileDownload as FileDownloadIcon,
  PictureAsPdf as PictureAsPdfIcon,
  MoreVert as MoreVertIcon
} from '@mui/icons-material';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import budgetService from '../api/budgetService';
import metaDataService from '../api/metaDataService';
import projectService from '../api/projectService';
import { useAuth } from '../context/AuthContext.jsx';
import { tokens } from "../pages/dashboard/theme";
import { formatCurrency, formatToSentenceCase } from '../utils/helpers';

function BudgetManagementPage() {
  const { user, hasPrivilege } = useAuth();
  const theme = useTheme();
  const colors = tokens(theme.palette.mode);
  const isLight = theme.palette.mode === 'light';

  // Container-based state
  const [containers, setContainers] = useState([]);
  const [selectedContainer, setSelectedContainer] = useState(null);
  const [containerItems, setContainerItems] = useState([]);
  const [pendingChanges, setPendingChanges] = useState([]);
  const [activeTab, setActiveTab] = useState(0); // 0: Containers, 1: Container Details
  
  // Filter states for budget items
  const [itemFilters, setItemFilters] = useState({
    search: '',
    departmentId: '',
    subcountyId: '',
    wardId: ''
  });
  
  // Get unique values from containerItems for filter dropdowns
  const availableDepartments = useMemo(() => {
    if (!containerItems || containerItems.length === 0) return [];
    const unique = new Map();
    containerItems.forEach(item => {
      if (item.departmentId && item.departmentName) {
        unique.set(item.departmentId, { departmentId: item.departmentId, name: item.departmentName });
      }
    });
    return Array.from(unique.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [containerItems]);
  
  const availableSubcounties = useMemo(() => {
    if (!containerItems || containerItems.length === 0) return [];
    const unique = new Map();
    containerItems.forEach(item => {
      if (item.subcountyId && item.subcountyName) {
        unique.set(item.subcountyId, { subcountyId: item.subcountyId, name: item.subcountyName });
      }
    });
    return Array.from(unique.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [containerItems]);
  
  const availableWards = useMemo(() => {
    if (!containerItems || containerItems.length === 0) return [];
    const unique = new Map();
    containerItems.forEach(item => {
      // If subcounty filter is set, only show wards from that subcounty
      if (item.wardId && item.wardName) {
        if (!itemFilters.subcountyId || item.subcountyId === parseInt(itemFilters.subcountyId)) {
          unique.set(item.wardId, { wardId: item.wardId, name: item.wardName, subcountyId: item.subcountyId });
        }
      }
    });
    return Array.from(unique.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [containerItems, itemFilters.subcountyId]);
  
  // Filter budget items based on filters
  const filteredItems = useMemo(() => {
    if (!containerItems || containerItems.length === 0) return [];
    
    return containerItems.filter(item => {
      // Search filter (project name, department, subcounty, ward)
      if (itemFilters.search) {
        const searchLower = itemFilters.search.toLowerCase();
        const matchesSearch = 
          (item.projectName && item.projectName.toLowerCase().includes(searchLower)) ||
          (item.departmentName && item.departmentName.toLowerCase().includes(searchLower)) ||
          (item.subcountyName && item.subcountyName.toLowerCase().includes(searchLower)) ||
          (item.wardName && item.wardName.toLowerCase().includes(searchLower));
        if (!matchesSearch) return false;
      }
      
      // Department filter
      if (itemFilters.departmentId && item.departmentId !== parseInt(itemFilters.departmentId)) {
        return false;
      }
      
      // Subcounty filter
      if (itemFilters.subcountyId && item.subcountyId !== parseInt(itemFilters.subcountyId)) {
        return false;
      }
      
      // Ward filter
      if (itemFilters.wardId && item.wardId !== parseInt(itemFilters.wardId)) {
        return false;
      }
      
      return true;
    });
  }, [containerItems, itemFilters]);
  
  // Reset filters when container changes
  useEffect(() => {
    if (selectedContainer) {
      setItemFilters({ search: '', departmentId: '', subcountyId: '', wardId: '' });
    }
  }, [selectedContainer?.budgetId]);
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, totalPages: 0 });
  const [exportingExcel, setExportingExcel] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  
  // Filter states
  const [filters, setFilters] = useState({
    finYearId: '',
    departmentId: '',
    status: '',
    search: ''
  });

  // Metadata for dropdowns
  const [financialYears, setFinancialYears] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [subcounties, setSubcounties] = useState([]);
  const [wards, setWards] = useState([]);
  const [projects, setProjects] = useState([]);
  
  // Dialog States
  const [openDialog, setOpenDialog] = useState(false);
  const [openItemDialog, setOpenItemDialog] = useState(false);
  const [openChangeRequestDialog, setOpenChangeRequestDialog] = useState(false);
  const [currentBudget, setCurrentBudget] = useState(null);
  const [currentItem, setCurrentItem] = useState(null);
  const [currentChangeRequest, setCurrentChangeRequest] = useState(null);
  const [formData, setFormData] = useState({
    budgetName: '',
    finYearId: '',
    departmentId: '',
    description: '',
    requiresApprovalForChanges: true
  });
  const [itemFormData, setItemFormData] = useState({
    projectId: '',
    projectName: '',
    departmentId: '',
    subcountyId: '',
    wardId: '',
    amount: '',
    remarks: '',
    changeReason: ''
  });
  const [formErrors, setFormErrors] = useState({});
  const [itemFormErrors, setItemFormErrors] = useState({});

  // Delete Confirmation States
  const [openDeleteConfirmDialog, setOpenDeleteConfirmDialog] = useState(false);
  const [budgetToDeleteId, setBudgetToDeleteId] = useState(null);
  const [budgetToDeleteName, setBudgetToDeleteName] = useState('');
  
  // Approve Confirmation States
  const [openApproveDialog, setOpenApproveDialog] = useState(false);
  const [budgetToApprove, setBudgetToApprove] = useState(null);
  
  // Combined Budget States
  const [openCombinedBudgetDialog, setOpenCombinedBudgetDialog] = useState(false);
  const [combinedBudgetData, setCombinedBudgetData] = useState({
    budgetName: '',
    finYearId: '',
    description: '',
    selectedContainerIds: []
  });
  const [combinedBudgetView, setCombinedBudgetView] = useState(null); // Stores the combined budget view data

  // Row Action Menu States
  const [rowActionMenuAnchor, setRowActionMenuAnchor] = useState(null);
  const [selectedRow, setSelectedRow] = useState(null);
  
  // Context Menu States (Right-click)
  const [contextMenu, setContextMenu] = useState(null);
  const [selectedContainerForContextMenu, setSelectedContainerForContextMenu] = useState(null);

  // Fetch metadata
  const fetchMetadata = useCallback(async () => {
    try {
      const [fyResult, deptResult, subcountyResult] = await Promise.allSettled([
        metaDataService.financialYears.getAllFinancialYears(),
        metaDataService.departments.getAllDepartments(),
        metaDataService.subcounties.getAllSubcounties()
      ]);

      const fyData = fyResult.status === 'fulfilled' ? fyResult.value : [];
      const deptData = deptResult.status === 'fulfilled' ? deptResult.value : [];
      const subcountyData = subcountyResult.status === 'fulfilled' ? subcountyResult.value : [];
      
      // Deduplicate financial years by finYearName, keeping the most recent one
      const uniqueFinancialYears = (fyData || []).reduce((acc, fy) => {
        const existing = acc.find(item => 
          item.finYearName?.toLowerCase().trim() === fy.finYearName?.toLowerCase().trim()
        );
        if (!existing || (fy.finYearId > existing.finYearId)) {
          // Remove existing if found, then add new one
          if (existing) {
            const index = acc.indexOf(existing);
            acc.splice(index, 1);
          }
          acc.push(fy);
        }
        return acc;
      }, []);
      
      // Sort by startDate descending, then by finYearName
      uniqueFinancialYears.sort((a, b) => {
        if (a.startDate && b.startDate) {
          return new Date(b.startDate) - new Date(a.startDate);
        }
        if (a.startDate) return -1;
        if (b.startDate) return 1;
        return (b.finYearName || '').localeCompare(a.finYearName || '');
      });
      
      const normalizedDepartments = Array.isArray(deptData)
        ? deptData
        : (deptData?.rows || deptData?.data || deptData?.departments || []);
      const normalizedFinancialYears = Array.isArray(uniqueFinancialYears)
        ? uniqueFinancialYears
        : [];

      setFinancialYears(normalizedFinancialYears);
      setDepartments(normalizedDepartments);
      setSubcounties(subcountyData || []);

      // Keep FY dropdown usable even when other metadata endpoints fail.
      if (fyResult.status !== 'fulfilled') {
        console.warn('Financial years fetch failed:', fyResult.reason);
      }
      if (deptResult.status !== 'fulfilled') {
        console.warn('Departments fetch failed:', deptResult.reason);
      }
      if (subcountyResult.status !== 'fulfilled') {
        console.warn('Subcounties fetch failed:', subcountyResult.reason);
      }
    } catch (err) {
      console.error('Error fetching metadata:', err);
    }
  }, []);

  // Fetch projects for autocomplete
  const fetchProjects = useCallback(async () => {
    try {
      const data = await projectService.projects.getProjects({ limit: 1000 });
      setProjects(data.projects || data || []);
    } catch (err) {
      console.error('Error fetching projects:', err);
      // Don't block the page if projects fail - set empty array
      setProjects([]);
    }
  }, []);

  // Fetch wards when subcounty changes (for item form)
  useEffect(() => {
    if (itemFormData.subcountyId) {
      metaDataService.subcounties.getWardsBySubcounty(itemFormData.subcountyId)
        .then(data => setWards(data || []))
        .catch(err => {
          console.error('Error fetching wards:', err);
          setWards([]);
        });
    } else {
      setWards([]);
      setItemFormData(prev => ({ ...prev, wardId: '' }));
    }
  }, [itemFormData.subcountyId]);

  // Fetch budget containers
  const fetchContainers = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      const params = {
        page: pagination.page,
        limit: pagination.limit,
        ...Object.fromEntries(Object.entries(filters).filter(([_, v]) => v !== ''))
      };
      
      console.log('Fetching containers with params:', params);
      const startTime = Date.now();
      
      // Add timeout to prevent hanging (30 seconds)
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Request timeout after 30 seconds')), 30000)
      );
      
      const dataPromise = budgetService.getBudgetContainers(params);
      const data = await Promise.race([dataPromise, timeoutPromise]);
      const fetchTime = Date.now() - startTime;
      
      console.log(`Fetched budget containers data in ${fetchTime}ms:`, data);
      
      if (fetchTime > 5000) {
        console.warn(`⚠️ WARNING: Fetch took ${fetchTime}ms - this is slow`);
      }
      
      console.log('Data type:', typeof data);
      console.log('Is array?', Array.isArray(data));
      console.log('Data keys:', Object.keys(data || {}));
      console.log('Containers array:', data.budgets);
      console.log('Containers count:', data.budgets?.length || 0);
      console.log('Pagination:', data.pagination);
      
      // Handle different response structures
      let containersList = [];
      if (Array.isArray(data)) {
        containersList = data;
      } else if (data?.budgets && Array.isArray(data.budgets)) {
        containersList = data.budgets;
      } else if (data?.containers && Array.isArray(data.containers)) {
        containersList = data.containers;
      } else if (data && typeof data === 'object') {
        // Try to find any array property
        const arrayKey = Object.keys(data).find(key => Array.isArray(data[key]));
        if (arrayKey) {
          containersList = data[arrayKey];
        }
      }
      
      // Log if we couldn't find containers in expected structure
      if (containersList.length === 0 && data && !Array.isArray(data)) {
        console.warn('⚠️ No containers found in response. Response structure:', Object.keys(data));
        console.warn('Response data:', JSON.stringify(data, null, 2));
      }
      
      console.log('Final containers list to set:', containersList);
      console.log('Final containers count:', containersList.length);
      
      // Always set containers, even if empty - this ensures state is consistent
      const normalizedContainers = (containersList || []).map((row) => ({
        ...row,
        budgetId: row.budgetId ?? row.budgetid,
        budgetName: row.budgetName ?? row.budgetname,
        budgetType: row.budgetType ?? row.budgettype,
        isCombined: row.isCombined ?? row.iscombined,
        parentBudgetId: row.parentBudgetId ?? row.parentbudgetid,
        finYearId: row.finYearId ?? row.finyearid,
        departmentId: row.departmentId ?? row.departmentid,
        totalAmount: row.totalAmount ?? row.totalamount,
        isFrozen: row.isFrozen ?? row.isfrozen,
        requiresApprovalForChanges: row.requiresApprovalForChanges ?? row.requiresapprovalforchanges,
        createdAt: row.createdAt ?? row.createdat,
        updatedAt: row.updatedAt ?? row.updatedat,
        finYearName: row.finYearName ?? row.finyearname,
        departmentName: row.departmentName ?? row.departmentname,
        itemCount: row.itemCount ?? row.itemcount ?? 0,
      })).filter((row) => row.budgetId != null);

      setContainers(normalizedContainers);
      setPagination(prev => ({
        ...prev,
        total: data.pagination?.total || containersList.length || 0,
        totalPages: data.pagination?.totalPages || Math.ceil((containersList.length || 0) / pagination.limit)
      }));
      setError(null); // Clear any previous errors on success
      setLoading(false);
      console.log('✅ Successfully loaded containers. State updated.');
    } catch (err) {
      console.error('Error fetching budget containers:', err);
      console.error('Error type:', typeof err);
      console.error('Error keys:', Object.keys(err || {}));
      console.error('Error response:', err.response);
      console.error('Error details:', err.response?.data);
      console.error('Error status:', err.response?.status);
      console.error('Error message:', err.message);
      console.error('Full error:', JSON.stringify(err, null, 2));
      
      // Build a more detailed error message
      // Note: axios interceptor returns error.response.data, so err might be the data object itself
      let errorMessage = "Failed to load budget containers.";
      
      // Handle case where err is the response.data object (from axios interceptor)
      // The axios interceptor returns error.response.data, so err is the data object
      if (err && typeof err === 'object') {
        // Check for common error message fields
        if (err.message) {
          errorMessage = err.message;
        } else if (err.error) {
          errorMessage = err.error;
        } else if (err.msg) {
          errorMessage = err.msg;
        } else if (typeof err === 'string') {
          errorMessage = err;
        } else {
          // If it's an object but no clear message, stringify it
          errorMessage = JSON.stringify(err);
        }
      } 
      // Handle case where err is the full error object (shouldn't happen with axios interceptor, but just in case)
      else if (err.response?.data?.message) {
        errorMessage = err.response.data.message;
      } else if (err.response?.data?.error) {
        errorMessage = err.response.data.error;
      } else if (err.message) {
        errorMessage = err.message;
      }
      
      // Add status code if available
      if (err.response?.status) {
        errorMessage += ` (Status: ${err.response.status})`;
      } else if (err.status) {
        errorMessage += ` (Status: ${err.status})`;
      }
      
      setError(errorMessage);
      setContainers([]);
      setPagination(prev => ({ ...prev, total: 0, totalPages: 0 }));
      setLoading(false);
      console.error('❌ Failed to load containers. Error:', errorMessage);
    }
  }, [pagination.page, pagination.limit, filters]);

  // Fetch container details with items
  const fetchContainerDetails = useCallback(async (budgetId) => {
    try {
      const data = await budgetService.getBudgetContainer(budgetId);
      setSelectedContainer(data);
      setContainerItems(data.items || []);
      setPendingChanges(data.pendingChanges || []);
    } catch (err) {
      console.error('Error fetching container details:', err);
      setSnackbar({ 
        open: true, 
        message: err.response?.data?.message || 'Failed to load container details.', 
        severity: 'error' 
      });
    }
  }, []);

  useEffect(() => {
    fetchMetadata();
    fetchProjects();
  }, [fetchMetadata, fetchProjects]);

  useEffect(() => {
    console.log('🔄 useEffect triggered - calling fetchContainers');
    console.log('Current filters:', filters);
    console.log('Current pagination:', pagination);
    fetchContainers();
  }, [fetchContainers]);

  // Handlers
  const handleOpenCreateContainerDialog = () => {
    setCurrentBudget(null);
    setFormData({
      budgetName: '',
      finYearId: '',
      departmentId: '',
      description: '',
      requiresApprovalForChanges: true
    });
    setFormErrors({});
    setOpenDialog(true);
  };

  const handleOpenEditDialog = (container) => {
    setCurrentBudget(container);
    setFormData({
      budgetName: container.budgetName || '',
      finYearId: container.finYearId || '',
      departmentId: container.departmentId || '',
      description: container.description || '',
      requiresApprovalForChanges: container.requiresApprovalForChanges !== 0
    });
    setFormErrors({});
    setOpenDialog(true);
  };

  const handleViewContainer = async (container) => {
    console.log('handleViewContainer called with:', container);
    console.log('isCombined value:', container.isCombined, 'Type:', typeof container.isCombined);
    
    // Check if it's a combined budget (handle both number and boolean)
    if (container.isCombined === 1 || container.isCombined === true || container.budgetType === 'Combined') {
      console.log('Detected as combined budget, calling handleViewCombinedBudget');
      // Handle combined budget view
      await handleViewCombinedBudget(container.budgetId);
    } else {
      console.log('Detected as regular container, calling fetchContainerDetails');
      // Handle regular container view
      setSelectedContainer(container);
      setActiveTab(1);
      await fetchContainerDetails(container.budgetId);
    }
  };

  const handleCloseDialog = () => {
    setOpenDialog(false);
    setCurrentBudget(null);
    setFormErrors({});
  };

  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    // Clear error for this field
    if (formErrors[name]) {
      setFormErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[name];
        return newErrors;
      });
    }
  };

  const handleProjectSelect = (event, value) => {
    if (value) {
      setFormData(prev => ({
        ...prev,
        projectId: value.id,
        projectName: value.projectName || value.project_name || ''
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        projectId: '',
        projectName: ''
      }));
    }
  };

  const validateContainerForm = () => {
    let errors = {};
    if (!formData.budgetName?.trim()) errors.budgetName = 'Budget Name is required.';
    if (!formData.finYearId) errors.finYearId = 'Financial Year is required.';
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };
  
  const handleContainerSubmit = async () => {
    if (!validateContainerForm()) {
      setSnackbar({ open: true, message: 'Please correct the form errors.', severity: 'error' });
      return;
    }

    setLoading(true);
    try {
      const dataToSubmit = {
        budgetName: formData.budgetName,
        finYearId: formData.finYearId,
        departmentId: formData.departmentId || null,
        description: formData.description || null,
        requiresApprovalForChanges: formData.requiresApprovalForChanges !== false
      };

      if (currentBudget) {
        await budgetService.updateBudgetContainer(currentBudget.budgetId, dataToSubmit);
        setSnackbar({ open: true, message: 'Budget container updated successfully!', severity: 'success' });
      } else {
        await budgetService.createBudgetContainer(dataToSubmit);
        setSnackbar({ open: true, message: 'Budget container created successfully!', severity: 'success' });
        // Ensure newly created containers are visible in the main list.
        setActiveTab(0);
        setSelectedContainer(null);
        setFilters({
          finYearId: '',
          departmentId: '',
          status: '',
          search: ''
        });
      }
      handleCloseDialog();
      // Reset to first page and refresh
      setPagination(prev => ({ ...prev, page: 1 }));
      await fetchContainers();
    } catch (err) {
      console.error("Submit container error:", err);
      const errorMessage = err.response?.data?.message || err.response?.data?.error || err.message || 'Failed to save budget container.';
      const errorDetails = err.response?.data?.details;
      const errorHint = err.response?.data?.hint;
      const statusCode = err.response?.status;
      
      let userMessage = errorMessage;
      if (statusCode === 403) {
        userMessage = 'You do not have permission to create budget containers. Please contact an administrator.';
      } else if (statusCode === 401) {
        userMessage = 'Authentication required. Please log in again.';
      } else if (statusCode === 400) {
        userMessage = errorMessage; // Use the validation error message
      } else if (errorHint) {
        userMessage = `${errorMessage}\n\n${errorHint}`;
      } else if (errorDetails) {
        userMessage = `${errorMessage}\n\nDetails: ${errorDetails}`;
      }
      
      setSnackbar({ 
        open: true, 
        message: userMessage, 
        severity: 'error' 
      });
    } finally {
      setLoading(false);
    }
  };

  const handleOpenApproveDialog = (budgetId) => {
    const budget = containers.find(c => c.budgetId === budgetId);
    if (budget) {
      setBudgetToApprove(budget);
      setOpenApproveDialog(true);
    }
  };

  const handleCloseApproveDialog = () => {
    setOpenApproveDialog(false);
    setBudgetToApprove(null);
  };

  const handleApproveContainer = async () => {
    if (!budgetToApprove) return;

    setLoading(true);
    handleCloseApproveDialog();
    try {
      await budgetService.approveBudgetContainer(budgetToApprove.budgetId);
      setSnackbar({ open: true, message: 'Budget approved and locked successfully!', severity: 'success' });
      fetchContainers();
      if (selectedContainer?.budgetId === budgetToApprove.budgetId) {
        await fetchContainerDetails(budgetToApprove.budgetId);
      }
    } catch (err) {
      console.error("Approve container error:", err);
      console.error("Error response:", err.response);
      console.error("Error response data:", err.response?.data);
      const errorMessage = err.response?.data?.message || 
                          err.response?.data?.error || 
                          err.message || 
                          'Failed to approve budget. Please check the console for details.';
      setSnackbar({ 
        open: true, 
        message: errorMessage, 
        severity: 'error' 
      });
    } finally {
      setLoading(false);
    }
  };

  // Combined Budget Handlers
  const handleOpenCombinedBudgetDialog = () => {
    setCombinedBudgetData({
      budgetName: '',
      finYearId: '',
      description: '',
      selectedContainerIds: []
    });
    setOpenCombinedBudgetDialog(true);
  };

  const handleCloseCombinedBudgetDialog = () => {
    setOpenCombinedBudgetDialog(false);
    setCombinedBudgetData({
      budgetName: '',
      finYearId: '',
      description: '',
      selectedContainerIds: []
    });
  };

  const handleToggleContainerSelection = (budgetId) => {
    setCombinedBudgetData(prev => {
      const isSelected = prev.selectedContainerIds.includes(budgetId);
      return {
        ...prev,
        selectedContainerIds: isSelected
          ? prev.selectedContainerIds.filter(id => id !== budgetId)
          : [...prev.selectedContainerIds, budgetId]
      };
    });
  };

  const handleCreateCombinedBudget = async () => {
    if (!combinedBudgetData.budgetName || !combinedBudgetData.finYearId) {
      setSnackbar({ 
        open: true, 
        message: 'Budget name and financial year are required', 
        severity: 'error' 
      });
      return;
    }

    if (combinedBudgetData.selectedContainerIds.length === 0) {
      setSnackbar({ 
        open: true, 
        message: 'Please select at least one container to combine', 
        severity: 'error' 
      });
      return;
    }

    setLoading(true);
    try {
      await budgetService.createCombinedBudget({
        budgetName: combinedBudgetData.budgetName,
        finYearId: combinedBudgetData.finYearId,
        description: combinedBudgetData.description,
        containerIds: combinedBudgetData.selectedContainerIds
      });
      setSnackbar({ 
        open: true, 
        message: 'Combined budget created successfully!', 
        severity: 'success' 
      });
      handleCloseCombinedBudgetDialog();
      fetchContainers();
    } catch (err) {
      console.error("Create combined budget error:", err);
      setSnackbar({ 
        open: true, 
        message: err.response?.data?.message || err.message || 'Failed to create combined budget.', 
        severity: 'error' 
      });
    } finally {
      setLoading(false);
    }
  };

  const handleViewCombinedBudget = async (budgetId) => {
    setLoading(true);
    try {
      const data = await budgetService.getCombinedBudget(budgetId);
      console.log('Combined budget data received:', data);
      console.log('Container items:', data.containerItems);
      console.log('Total items count:', data.totalItems);
      
      // Ensure containerItems is an array
      if (!data.containerItems || !Array.isArray(data.containerItems)) {
        console.warn('containerItems is not an array:', data.containerItems);
        data.containerItems = [];
      }
      
      setCombinedBudgetView(data);
      setSelectedContainer({ budgetId, isCombined: true });
      setActiveTab(1);
    } catch (err) {
      console.error("Fetch combined budget error:", err);
      setSnackbar({ 
        open: true, 
        message: err.response?.data?.message || err.message || 'Failed to fetch combined budget.', 
        severity: 'error' 
      });
    } finally {
      setLoading(false);
    }
  };

  // Item Management Handlers
  const handleOpenAddItemDialog = () => {
    setCurrentItem(null);
    setItemFormData({
      projectId: '',
      projectName: '',
      departmentId: '',
      subcountyId: '',
      wardId: '',
      amount: '',
      remarks: '',
      changeReason: ''
    });
    setItemFormErrors({});
    setOpenItemDialog(true);
  };

  const handleOpenEditItemDialog = (item) => {
    setCurrentItem(item);
    setItemFormData({
      projectId: item.projectId || '',
      projectName: item.projectName || '',
      departmentId: item.departmentId || '',
      subcountyId: item.subcountyId || '',
      wardId: item.wardId || '',
      amount: item.amount || '',
      remarks: item.remarks || '',
      changeReason: ''
    });
    setItemFormErrors({});
    setOpenItemDialog(true);
  };

  const handleCloseItemDialog = () => {
    setOpenItemDialog(false);
    setCurrentItem(null);
    setItemFormData({
      projectId: '',
      projectName: '',
      departmentId: '',
      subcountyId: '',
      wardId: '',
      amount: '',
      remarks: '',
      changeReason: ''
    });
    setItemFormErrors({});
  };

  const handleItemFormChange = (e) => {
    const { name, value } = e.target;
    setItemFormData(prev => ({ ...prev, [name]: value }));
    if (itemFormErrors[name]) {
      setItemFormErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[name];
        return newErrors;
      });
    }
  };

  const handleProjectSelectForItem = (event, value) => {
    if (value) {
      setItemFormData(prev => ({
        ...prev,
        projectId: value.id,
        projectName: value.projectName || value.project_name || ''
      }));
    } else {
      setItemFormData(prev => ({
        ...prev,
        projectId: '',
        projectName: ''
      }));
    }
  };

  const validateItemForm = () => {
    let errors = {};
    if (!itemFormData.projectName?.trim()) errors.projectName = 'Project Name is required.';
    if (!itemFormData.departmentId) errors.departmentId = 'Department is required.';
    if (!itemFormData.amount || parseFloat(itemFormData.amount) <= 0) {
      errors.amount = 'Amount must be greater than 0.';
    }
    
    // If container is approved and frozen, change reason is required
    if (selectedContainer?.status === 'Approved' && selectedContainer?.isFrozen === 1) {
      if (!itemFormData.changeReason?.trim()) {
        errors.changeReason = 'Change reason is required for approved budgets.';
      }
    }
    
    setItemFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleItemSubmit = async () => {
    if (!validateItemForm()) {
      setSnackbar({ open: true, message: 'Please correct the form errors.', severity: 'error' });
      return;
    }

    setLoading(true);
    try {
      const dataToSubmit = {
        projectId: itemFormData.projectId || null,
        projectName: itemFormData.projectName,
        departmentId: itemFormData.departmentId,
        subcountyId: itemFormData.subcountyId || null,
        wardId: itemFormData.wardId || null,
        amount: parseFloat(itemFormData.amount),
        remarks: itemFormData.remarks || null,
        changeReason: itemFormData.changeReason || null
      };

      if (currentItem) {
        const result = await budgetService.updateBudgetItem(currentItem.itemId, dataToSubmit);
        if (result.message?.includes('pending approval')) {
          setSnackbar({ open: true, message: 'Change request created and pending approval!', severity: 'info' });
        } else {
          setSnackbar({ open: true, message: 'Budget item updated successfully!', severity: 'success' });
        }
      } else {
        const result = await budgetService.addBudgetItem(selectedContainer.budgetId, dataToSubmit);
        if (result.message?.includes('pending approval')) {
          setSnackbar({ open: true, message: 'Change request created and pending approval!', severity: 'info' });
        } else {
          setSnackbar({ open: true, message: 'Budget item added successfully!', severity: 'success' });
        }
      }
      handleCloseItemDialog();
      await fetchContainerDetails(selectedContainer.budgetId);
    } catch (err) {
      console.error("Submit item error:", err);
      setSnackbar({ 
        open: true, 
        message: err.response?.data?.message || err.message || 'Failed to save budget item.', 
        severity: 'error' 
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveItem = async (itemId) => {
    if (!window.confirm('Are you sure you want to remove this item from the budget?')) {
      return;
    }

    setLoading(true);
    try {
      const changeReason = selectedContainer?.status === 'Approved' && selectedContainer?.isFrozen === 1
        ? prompt('Change reason is required for approved budgets. Please provide a reason:')
        : null;
      
      if (selectedContainer?.status === 'Approved' && selectedContainer?.isFrozen === 1 && !changeReason) {
        setSnackbar({ open: true, message: 'Change reason is required.', severity: 'error' });
        setLoading(false);
        return;
      }

      const result = await budgetService.removeBudgetItem(itemId, changeReason);
      if (result.message?.includes('pending approval')) {
        setSnackbar({ open: true, message: 'Change request created and pending approval!', severity: 'info' });
      } else {
        setSnackbar({ open: true, message: 'Budget item removed successfully!', severity: 'success' });
      }
      await fetchContainerDetails(selectedContainer.budgetId);
    } catch (err) {
      console.error("Remove item error:", err);
      setSnackbar({ 
        open: true, 
        message: err.response?.data?.message || err.message || 'Failed to remove budget item.', 
        severity: 'error' 
      });
    } finally {
      setLoading(false);
    }
  };

  // Change Request Handlers
  const handleApproveChangeRequest = async (changeId) => {
    const reviewNotes = prompt('Enter review notes (optional):') || null;
    
    setLoading(true);
    try {
      await budgetService.approveChangeRequest(changeId, reviewNotes);
      setSnackbar({ open: true, message: 'Change request approved and applied successfully!', severity: 'success' });
      await fetchContainerDetails(selectedContainer.budgetId);
    } catch (err) {
      console.error("Approve change request error:", err);
      setSnackbar({ 
        open: true, 
        message: err.response?.data?.message || err.message || 'Failed to approve change request.', 
        severity: 'error' 
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRejectChangeRequest = async (changeId) => {
    const reviewNotes = prompt('Enter rejection reason (required):');
    if (!reviewNotes) {
      setSnackbar({ open: true, message: 'Rejection reason is required.', severity: 'error' });
      return;
    }

    setLoading(true);
    try {
      await budgetService.rejectChangeRequest(changeId, reviewNotes);
      setSnackbar({ open: true, message: 'Change request rejected successfully!', severity: 'success' });
      await fetchContainerDetails(selectedContainer.budgetId);
    } catch (err) {
      console.error("Reject change request error:", err);
      setSnackbar({ 
        open: true, 
        message: err.response?.data?.message || err.message || 'Failed to reject change request.', 
        severity: 'error' 
      });
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDeleteConfirmDialog = (budgetId, projectName) => {
    setBudgetToDeleteId(budgetId);
    setBudgetToDeleteName(projectName);
    setOpenDeleteConfirmDialog(true);
  };

  const handleCloseDeleteConfirmDialog = () => {
    setOpenDeleteConfirmDialog(false);
    setBudgetToDeleteId(null);
    setBudgetToDeleteName('');
  };

  const handleConfirmDelete = async () => {
    setLoading(true);
    handleCloseDeleteConfirmDialog();
    try {
      // Note: Container deletion would need to be implemented in the backend
      // For now, we'll show an error
      setSnackbar({ 
        open: true, 
        message: 'Container deletion not yet implemented. Use soft delete via voided flag.', 
        severity: 'warning' 
      });
      fetchContainers();
    } catch (err) {
      console.error("Delete container error:", err);
      setSnackbar({ 
        open: true, 
        message: err.response?.data?.message || err.message || 'Failed to delete budget container.', 
        severity: 'error' 
      });
    } finally {
      setLoading(false);
    }
  };
  
  const handleCloseSnackbar = (event, reason) => {
    if (reason === 'clickaway') {
      return;
    }
    setSnackbar({ ...snackbar, open: false });
  };

  // Export functions
  const handleExportItemsToExcel = () => {
    setExportingExcel(true);
    try {
      const headers = ['Project Name', 'Department', 'Subcounty', 'Ward', 'Amount (KES)', 'Remarks'];
      const dataRows = filteredItems.map(item => [
        formatToSentenceCase(item.projectName) || 'N/A',
        item.departmentName || 'N/A',
        formatToSentenceCase(item.subcountyName) || 'N/A',
        formatToSentenceCase(item.wardName) || 'N/A',
        item.amount || 0,
        item.remarks || ''
      ]);

      const ws = XLSX.utils.aoa_to_sheet([headers, ...dataRows]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Budget Items');
      
      // Auto-size columns
      const colWidths = headers.map((_, colIndex) => {
        const maxLength = Math.max(
          headers[colIndex].length,
          ...dataRows.map(row => String(row[colIndex] || '').length)
        );
        return { wch: Math.min(maxLength + 2, 50) };
      });
      ws['!cols'] = colWidths;

      const dateStr = new Date().toISOString().split('T')[0];
      const filename = `budget_items_${selectedContainer?.budgetName?.replace(/[^a-z0-9]/gi, '_') || 'export'}_${dateStr}.xlsx`;
      XLSX.writeFile(wb, filename);
      
      setSnackbar({ 
        open: true, 
        message: `Exported ${filteredItems.length} item(s) to Excel successfully!${filteredItems.length !== containerItems.length ? ` (filtered from ${containerItems.length})` : ''}`, 
        severity: 'success' 
      });
    } catch (err) {
      console.error('Error exporting to Excel:', err);
      setSnackbar({ open: true, message: 'Failed to export to Excel. Please try again.', severity: 'error' });
    } finally {
      setExportingExcel(false);
    }
  };

  const handleExportItemsToPDF = () => {
    setExportingPdf(true);
    try {
      const headers = ['Project Name', 'Department', 'Subcounty', 'Ward', 'Amount (KES)', 'Remarks'];
      const dataRows = filteredItems.map(item => [
        formatToSentenceCase(item.projectName) || 'N/A',
        item.departmentName || 'N/A',
        formatToSentenceCase(item.subcountyName) || 'N/A',
        formatToSentenceCase(item.wardName) || 'N/A',
        formatCurrency(item.amount || 0),
        item.remarks || ''
      ]);

      const doc = new jsPDF('landscape', 'pt', 'a4');
      
      // Calculate total amount for filtered items
      const filteredTotal = filteredItems.reduce((sum, item) => sum + (item.amount || 0), 0);
      
      // Add title
      doc.setFontSize(16);
      doc.setFont(undefined, 'bold');
      doc.text(selectedContainer?.budgetName || 'Budget Items', 40, 30);
      
      doc.setFontSize(10);
      doc.setFont(undefined, 'normal');
      doc.text(`Financial Year: ${selectedContainer?.finYearName || 'N/A'}`, 40, 50);
      doc.text(`Total Items: ${filteredItems.length}${filteredItems.length !== containerItems.length ? ` (filtered from ${containerItems.length})` : ''}`, 40, 65);
      doc.text(`Total Amount: ${formatCurrency(filteredTotal)}${filteredItems.length !== containerItems.length ? ` (filtered)` : ''}`, 40, 80);

      // Add table
      autoTable(doc, {
        head: [headers],
        body: dataRows,
        startY: 95,
        styles: { 
          fontSize: 8, 
          cellPadding: 3,
          overflow: 'linebreak',
          halign: 'left'
        },
        headStyles: { 
          fillColor: [41, 128, 185], 
          textColor: 255, 
          fontStyle: 'bold' 
        },
        columnStyles: {
          4: { halign: 'right' } // Right align amount column
        },
        alternateRowStyles: { fillColor: [245, 245, 245] },
        margin: { top: 95, left: 40, right: 40 },
      });

      const dateStr = new Date().toISOString().split('T')[0];
      const filename = `budget_items_${selectedContainer?.budgetName?.replace(/[^a-z0-9]/gi, '_') || 'export'}_${dateStr}.pdf`;
      doc.save(filename);
      
      setSnackbar({ 
        open: true, 
        message: `Exported ${filteredItems.length} item(s) to PDF successfully!${filteredItems.length !== containerItems.length ? ` (filtered from ${containerItems.length})` : ''}`, 
        severity: 'success' 
      });
    } catch (err) {
      console.error('Error exporting to PDF:', err);
      setSnackbar({ open: true, message: 'Failed to export to PDF. Please try again.', severity: 'error' });
    } finally {
      setExportingPdf(false);
    }
  };

  // Export functions for Combined Budget
  const handleExportCombinedBudgetToExcel = () => {
    setExportingExcel(true);
    try {
      if (!combinedBudgetView || !combinedBudgetView.containerItems) {
        setSnackbar({ open: true, message: 'No data to export', severity: 'warning' });
        return;
      }

      const allRows = [];
      const headers = ['Container', 'Project Name', 'Department', 'Subcounty', 'Ward', 'Amount (KES)', 'Remarks'];
      
      // Add header row
      allRows.push(headers);
      
      // Add items from each container
      combinedBudgetView.containerItems.forEach((containerData) => {
        const container = containerData.container;
        const items = containerData.items || [];
        
        if (items.length > 0) {
          items.forEach((item) => {
            allRows.push([
              formatToSentenceCase(container.budgetName) || 'N/A',
              formatToSentenceCase(item.projectName) || 'N/A',
              item.departmentName || 'N/A',
              formatToSentenceCase(item.subcountyName) || 'N/A',
              formatToSentenceCase(item.wardName) || 'N/A',
              item.amount || 0,
              item.remarks || ''
            ]);
          });
          
          // Add subtotal row for this container
          allRows.push([
            `${formatToSentenceCase(container.budgetName)} - Subtotal`,
            '',
            '',
            '',
            '',
            parseFloat(container.totalAmount) || 0,
            ''
          ]);
        }
      });
      
      // Add grand total row
      allRows.push([
        'GRAND TOTAL',
        '',
        '',
        '',
        '',
        combinedBudgetView.grandTotal || 0,
        ''
      ]);

      const ws = XLSX.utils.aoa_to_sheet(allRows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Combined Budget');
      
      // Auto-size columns
      const colWidths = headers.map((_, colIndex) => {
        const maxLength = Math.max(
          headers[colIndex].length,
          ...allRows.map(row => String(row[colIndex] || '').length)
        );
        return { wch: Math.min(maxLength + 2, 50) };
      });
      ws['!cols'] = colWidths;

      // Style subtotal and grand total rows
      const range = XLSX.utils.decode_range(ws['!ref']);
      allRows.forEach((row, rowIndex) => {
        if (row[0] && (row[0].includes('Subtotal') || row[0] === 'GRAND TOTAL')) {
          headers.forEach((_, colIndex) => {
            const cellAddress = XLSX.utils.encode_cell({ r: rowIndex + 1, c: colIndex });
            if (!ws[cellAddress]) return;
            ws[cellAddress].s = {
              font: { bold: true },
              fill: { fgColor: { rgb: colIndex === 5 ? 'FFE6E6E6' : 'FFFFFFFF' } }
            };
          });
        }
      });

      const dateStr = new Date().toISOString().split('T')[0];
      const filename = `combined_budget_${combinedBudgetView.combinedBudget.budgetName?.replace(/[^a-z0-9]/gi, '_') || 'export'}_${dateStr}.xlsx`;
      XLSX.writeFile(wb, filename);
      
      setSnackbar({ 
        open: true, 
        message: `Exported combined budget with ${combinedBudgetView.totalItems} item(s) to Excel successfully!`, 
        severity: 'success' 
      });
    } catch (err) {
      console.error('Error exporting combined budget to Excel:', err);
      setSnackbar({ open: true, message: 'Failed to export to Excel. Please try again.', severity: 'error' });
    } finally {
      setExportingExcel(false);
    }
  };

  const handleExportCombinedBudgetToPDF = () => {
    setExportingPdf(true);
    try {
      if (!combinedBudgetView || !combinedBudgetView.containerItems) {
        setSnackbar({ open: true, message: 'No data to export', severity: 'warning' });
        return;
      }

      const doc = new jsPDF('landscape', 'pt', 'a4');
      let startY = 40;
      
      // Add title
      doc.setFontSize(18);
      doc.setFont(undefined, 'bold');
      doc.text(combinedBudgetView.combinedBudget.budgetName || 'Combined Budget', 40, startY);
      
      startY += 25;
      doc.setFontSize(10);
      doc.setFont(undefined, 'normal');
      doc.text(`Financial Year: ${combinedBudgetView.combinedBudget.finYearName || 'N/A'}`, 40, startY);
      startY += 15;
      doc.text(`Containers: ${combinedBudgetView.containerCount || 0}`, 40, startY);
      startY += 15;
      doc.text(`Total Items: ${combinedBudgetView.totalItems || 0}`, 40, startY);
      startY += 15;
      doc.setFont(undefined, 'bold');
      doc.text(`Grand Total: ${formatCurrency(combinedBudgetView.grandTotal || 0)}`, 40, startY);
      startY += 25;

      // Process each container
      combinedBudgetView.containerItems.forEach((containerData, containerIndex) => {
        const container = containerData.container;
        const items = containerData.items || [];
        
        if (items.length > 0) {
          // Add container header
          if (startY > 650) {
            doc.addPage();
            startY = 40;
          }
          
          doc.setFontSize(12);
          doc.setFont(undefined, 'bold');
          doc.setTextColor(102, 126, 234);
          doc.text(`${formatToSentenceCase(container.budgetName)}`, 40, startY);
          startY += 15;
          
          doc.setFontSize(9);
          doc.setFont(undefined, 'normal');
          doc.setTextColor(0, 0, 0);
          doc.text(`${formatToSentenceCase(container.departmentName) || 'No Department'} • Subtotal: ${formatCurrency(parseFloat(container.totalAmount) || 0)}`, 40, startY);
          startY += 20;

          // Prepare table data for this container
          const headers = ['#', 'Project Name', 'Department', 'Subcounty', 'Ward', 'Amount (KES)'];
          const dataRows = items.map((item, itemIndex) => [
            itemIndex + 1,
            formatToSentenceCase(item.projectName) || 'N/A',
            item.departmentName || 'N/A',
            formatToSentenceCase(item.subcountyName) || 'N/A',
            formatToSentenceCase(item.wardName) || 'N/A',
            formatCurrency(item.amount || 0)
          ]);

          // Add subtotal row
          dataRows.push([
            '',
            `${formatToSentenceCase(container.budgetName)} - Subtotal`,
            '',
            '',
            '',
            formatCurrency(parseFloat(container.totalAmount) || 0)
          ]);

          // Add table
          autoTable(doc, {
            head: [headers],
            body: dataRows,
            startY: startY,
            styles: { 
              fontSize: 8, 
              cellPadding: 3,
              overflow: 'linebreak',
              halign: 'left'
            },
            headStyles: { 
              fillColor: [102, 126, 234], 
              textColor: 255, 
              fontStyle: 'bold' 
            },
            columnStyles: {
              0: { halign: 'center', cellWidth: 30 },
              5: { halign: 'right' }
            },
            alternateRowStyles: { fillColor: [245, 245, 245] },
            margin: { top: startY, left: 40, right: 40 },
            didDrawPage: (data) => {
              startY = data.cursor.y + 20;
            }
          });

          startY = doc.lastAutoTable.finalY + 20;
        }
      });

      // Add grand total
      if (startY > 650) {
        doc.addPage();
        startY = 40;
      }
      
      doc.setFontSize(14);
      doc.setFont(undefined, 'bold');
      doc.setTextColor(76, 175, 80);
      doc.text(`GRAND TOTAL: ${formatCurrency(combinedBudgetView.grandTotal || 0)}`, 40, startY);
      startY += 15;
      doc.setFontSize(10);
      doc.setFont(undefined, 'normal');
      doc.setTextColor(0, 0, 0);
      doc.text(`Combined total from ${combinedBudgetView.containerCount} container(s)`, 40, startY);

      const dateStr = new Date().toISOString().split('T')[0];
      const filename = `combined_budget_${combinedBudgetView.combinedBudget.budgetName?.replace(/[^a-z0-9]/gi, '_') || 'export'}_${dateStr}.pdf`;
      doc.save(filename);
      
      setSnackbar({ 
        open: true, 
        message: `Exported combined budget with ${combinedBudgetView.totalItems} item(s) to PDF successfully!`, 
        severity: 'success' 
      });
    } catch (err) {
      console.error('Error exporting combined budget to PDF:', err);
      setSnackbar({ open: true, message: 'Failed to export to PDF. Please try again.', severity: 'error' });
    } finally {
      setExportingPdf(false);
    }
  };

  const handleFilterChange = (name, value) => {
    console.log(`🔍 Filter changed: ${name} = "${value}"`);
    setFilters(prev => {
      const newFilters = { ...prev, [name]: value };
      console.log('New filters state:', newFilters);
      return newFilters;
    });
    setPagination(prev => ({ ...prev, page: 1 }));
    setError(null);
    // Note: fetchContainers will be called automatically via useEffect when filters change
  };

  const handleClearFilters = () => {
    console.log('Clearing filters and resetting pagination');
    setFilters({
      finYearId: '',
      departmentId: '',
      status: '',
      search: ''
    });
    setPagination(prev => ({ ...prev, page: 1, total: 0, totalPages: 0 }));
    setError(null);
    // Force refetch by setting loading to true - fetchContainers will be called via useEffect
    setLoading(true);
  };

  const getStatusColor = (status) => {
    const statusColors = {
      'Draft': 'default',
      'Pending': 'warning',
      'Approved': 'success',
      'Rejected': 'error',
      'Cancelled': 'default'
    };
    return statusColors[status] || 'default';
  };

  const containerColumns = [
    { 
      field: 'budgetId', 
      headerName: 'ID', 
      width: 70,
      headerAlign: 'center',
      align: 'center'
    },
    { 
      field: 'budgetName', 
      headerName: 'Budget Name', 
      flex: 2, 
      minWidth: 180,
      renderCell: (params) => (
        <Box display="flex" alignItems="center" gap={1}>
          <Typography variant="body2" fontWeight={600} noWrap>
            {params.row.budgetName || 'N/A'}
          </Typography>
          {params.row.isCombined === 1 && (
            <Chip 
              label="Combined" 
              size="small" 
              color="primary"
              sx={{ height: 20, fontSize: '0.65rem', fontWeight: 600 }}
            />
          )}
        </Box>
      )
    },
    { 
      field: 'finYearName', 
      headerName: 'Year', 
      flex: 1, 
      minWidth: 100 
    },
    { 
      field: 'departmentName', 
      headerName: 'Department', 
      flex: 1.5, 
      minWidth: 220,
      renderCell: (params) => (
        <Typography variant="body2" noWrap title={params.value || 'N/A'}>
          {params.value || 'N/A'}
        </Typography>
      )
    },
    { 
      field: 'totalAmount', 
      headerName: 'Amount', 
      flex: 1, 
      minWidth: 130,
      headerAlign: 'right',
      align: 'right',
      renderCell: (params) => (
        <Typography variant="body2" fontWeight={700} color="success.main">
          {formatCurrency(params.row.totalAmount || 0)}
        </Typography>
      )
    },
    { 
      field: 'itemCount', 
      headerName: 'Items', 
      width: 80,
      headerAlign: 'center',
      align: 'center',
      renderCell: (params) => (
        <Chip 
          label={params.row.itemCount || 0} 
          size="small" 
          sx={{ height: 24, fontSize: '0.75rem' }}
        />
      )
    },
    { 
      field: 'status', 
      headerName: 'Status', 
      width: 120,
      headerAlign: 'center',
      align: 'center',
      renderCell: (params) => (
        <Stack direction="row" spacing={0.5} alignItems="center" justifyContent="center">
          <Chip 
            label={params.row.status} 
            color={getStatusColor(params.row.status)}
            size="small"
            sx={{ height: 24, fontSize: '0.75rem' }}
          />
          {params.row.isFrozen === 1 && (
            <LockIcon fontSize="small" color="action" sx={{ fontSize: 16 }} />
          )}
        </Stack>
      )
    },
    {
      field: 'actions',
      headerName: 'Actions',
      width: 80,
      sortable: false,
      filterable: false,
      headerAlign: 'center',
      align: 'center',
      renderCell: (params) => {
        return (
          <Tooltip title="Actions">
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                setSelectedRow(params.row);
                setRowActionMenuAnchor(e.currentTarget);
              }}
              sx={{ color: 'text.secondary' }}
            >
              <MoreVertIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        );
      },
      renderHeader: () => (
        <Tooltip title="Actions">
          <IconButton
            size="small"
            sx={{ 
              color: 'inherit',
              padding: '4px',
              '&:hover': {
                backgroundColor: 'rgba(0, 0, 0, 0.04)',
              }
            }}
          >
            <MoreVertIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      ),
    },
  ];

  // Calculate summary statistics
  const summaryStats = useMemo(() => {
    if (!containers || containers.length === 0) {
      return {
        totalBudgets: 0,
        totalAmount: 0,
        totalItems: 0,
        approvedCount: 0,
        pendingCount: 0,
        draftCount: 0
      };
    }

    const totalBudgets = containers.length;
    const totalAmount = containers.reduce((sum, container) => {
      return sum + (parseFloat(container.totalAmount) || 0);
    }, 0);
    const totalItems = containers.reduce((sum, container) => {
      return sum + (parseInt(container.itemCount) || 0);
    }, 0);
    const approvedCount = containers.filter(c => c.status === 'Approved').length;
    const pendingCount = containers.filter(c => c.status === 'Pending' || c.status === 'Pending Approval').length;
    const draftCount = containers.filter(c => c.status === 'Draft').length;

    return {
      totalBudgets,
      totalAmount,
      totalItems,
      approvedCount,
      pendingCount,
      draftCount
    };
  }, [containers]);

  // Show loading only on initial load
  if (loading && containers.length === 0 && !error) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" height="80vh">
        <CircularProgress />
        <Typography sx={{ ml: 2 }}>Loading budget containers...</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 2 }}>
      {/* Compact Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <MoneyIcon sx={{ color: theme.palette.primary.main, fontSize: 32 }} />
          <Box>
            <Typography variant="h5" component="h1" sx={{ color: theme.palette.primary.main, fontWeight: 700, lineHeight: 1.2 }}>
              ADP-Budget
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>
              Manage containers & track approvals
            </Typography>
          </Box>
        </Box>
        <Stack direction="row" spacing={1}>
          <Button
            variant="contained"
            size="small"
            startIcon={<AddIcon />}
            onClick={handleOpenCreateContainerDialog}
            sx={{ 
              backgroundColor: '#16a34a', 
              '&:hover': { backgroundColor: '#15803d' }, 
              color: 'white', 
              fontWeight: 600, 
              borderRadius: '6px', 
              boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
              px: 2,
              py: 0.75
            }}
          >
            New Container
          </Button>
          <Button
            variant="outlined"
            size="small"
            startIcon={<MoneyIcon />}
            onClick={handleOpenCombinedBudgetDialog}
            sx={{ 
              borderColor: '#667eea',
              color: '#667eea',
              fontWeight: 600, 
              borderRadius: '6px', 
              px: 2,
              py: 0.75,
              '&:hover': {
                borderColor: '#5568d3',
                backgroundColor: '#667eea15'
              }
            }}
          >
            Combine Budgets
          </Button>
        </Stack>
      </Box>

      {/* Summary Statistics Cards — flex row + horizontal scroll (aligned with project-by-status-dashboard) */}
      {activeTab === 0 && containers.length > 0 && (
        <Box
          sx={{
            mb: 2,
            overflowX: 'auto',
            '&::-webkit-scrollbar': {
              height: '8px',
            },
            '&::-webkit-scrollbar-track': {
              background: isLight ? colors.grey[100] : colors.grey[800],
              borderRadius: '4px',
            },
            '&::-webkit-scrollbar-thumb': {
              background: isLight ? colors.grey[400] : colors.grey[600],
              borderRadius: '4px',
              '&:hover': {
                background: isLight ? colors.grey[500] : colors.grey[500],
              },
            },
          }}
        >
          <Grid container spacing={1} sx={{ display: 'flex', flexWrap: 'nowrap', pb: 1 }}>
            <Grid item sx={{ minWidth: { xs: '110px', sm: '130px', md: '145px' }, flex: '1 1 0', maxWidth: { md: 'none' } }}>
              <Card
                elevation={0}
                sx={{
                  height: '100%',
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  color: 'white',
                  border: 'none',
                  transition: 'transform 0.2s',
                  '&:hover': { transform: 'translateY(-2px)', boxShadow: 3 },
                }}
              >
                <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                  <Box display="flex" alignItems="center" justifyContent="space-between" mb={0.5}>
                    <Typography variant="caption" sx={{ opacity: 0.9, fontSize: '0.7rem', fontWeight: 600 }}>
                      Total Budgets
                    </Typography>
                    <WalletIcon sx={{ fontSize: 20, opacity: 0.8 }} />
                  </Box>
                  <Typography variant="h5" sx={{ fontWeight: 700, fontSize: '1.5rem', lineHeight: 1.2 }}>
                    {summaryStats.totalBudgets}
                  </Typography>
                  <Typography variant="caption" sx={{ opacity: 0.8, fontSize: '0.65rem' }}>
                    {summaryStats.totalItems} items
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item sx={{ minWidth: { xs: '110px', sm: '130px', md: '145px' }, flex: '1 1 0', maxWidth: { md: 'none' } }}>
              <Card
                elevation={0}
                sx={{
                  height: '100%',
                  background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
                  color: 'white',
                  border: 'none',
                  transition: 'transform 0.2s',
                  '&:hover': { transform: 'translateY(-2px)', boxShadow: 3 },
                }}
              >
                <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                  <Box display="flex" alignItems="center" justifyContent="space-between" mb={0.5}>
                    <Typography variant="caption" sx={{ opacity: 0.9, fontSize: '0.7rem', fontWeight: 600 }}>
                      Total Amount
                    </Typography>
                    <MoneyIcon sx={{ fontSize: 20, opacity: 0.8 }} />
                  </Box>
                  <Typography variant="h5" sx={{ fontWeight: 700, fontSize: '1.5rem', lineHeight: 1.2, wordBreak: 'break-word' }}>
                    {formatCurrency(summaryStats.totalAmount)}
                  </Typography>
                  <Typography variant="caption" sx={{ opacity: 0.8, fontSize: '0.65rem' }}>
                    All budgets
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item sx={{ minWidth: { xs: '110px', sm: '130px', md: '145px' }, flex: '1 1 0', maxWidth: { md: 'none' } }}>
              <Card
                elevation={0}
                sx={{
                  height: '100%',
                  background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
                  color: 'white',
                  border: 'none',
                  transition: 'transform 0.2s',
                  '&:hover': { transform: 'translateY(-2px)', boxShadow: 3 },
                }}
              >
                <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                  <Box display="flex" alignItems="center" justifyContent="space-between" mb={0.5}>
                    <Typography variant="caption" sx={{ opacity: 0.9, fontSize: '0.7rem', fontWeight: 600 }}>
                      Approved
                    </Typography>
                    <CheckCircleIcon sx={{ fontSize: 20, opacity: 0.8 }} />
                  </Box>
                  <Typography variant="h5" sx={{ fontWeight: 700, fontSize: '1.5rem', lineHeight: 1.2 }}>
                    {summaryStats.approvedCount}
                  </Typography>
                  <Typography variant="caption" sx={{ opacity: 0.8, fontSize: '0.65rem' }}>
                    {summaryStats.totalBudgets > 0 ? Math.round((summaryStats.approvedCount / summaryStats.totalBudgets) * 100) : 0}% of total
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item sx={{ minWidth: { xs: '110px', sm: '130px', md: '145px' }, flex: '1 1 0', maxWidth: { md: 'none' } }}>
              <Card
                elevation={0}
                sx={{
                  height: '100%',
                  background: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
                  color: 'white',
                  border: 'none',
                  transition: 'transform 0.2s',
                  '&:hover': { transform: 'translateY(-2px)', boxShadow: 3 },
                }}
              >
                <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                  <Box display="flex" alignItems="center" justifyContent="space-between" mb={0.5}>
                    <Typography variant="caption" sx={{ opacity: 0.9, fontSize: '0.7rem', fontWeight: 600 }}>
                      Pending
                    </Typography>
                    <PendingIcon sx={{ fontSize: 20, opacity: 0.8 }} />
                  </Box>
                  <Typography variant="h5" sx={{ fontWeight: 700, fontSize: '1.5rem', lineHeight: 1.2 }}>
                    {summaryStats.pendingCount}
                  </Typography>
                  <Typography variant="caption" sx={{ opacity: 0.8, fontSize: '0.65rem' }}>
                    Awaiting approval
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item sx={{ minWidth: { xs: '110px', sm: '130px', md: '145px' }, flex: '1 1 0', maxWidth: { md: 'none' } }}>
              <Card
                elevation={0}
                sx={{
                  height: '100%',
                  background: 'linear-gradient(135deg, #30cfd0 0%, #330867 100%)',
                  color: 'white',
                  border: 'none',
                  transition: 'transform 0.2s',
                  '&:hover': { transform: 'translateY(-2px)', boxShadow: 3 },
                }}
              >
                <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                  <Box display="flex" alignItems="center" justifyContent="space-between" mb={0.5}>
                    <Typography variant="caption" sx={{ opacity: 0.9, fontSize: '0.7rem', fontWeight: 600 }}>
                      Draft
                    </Typography>
                    <EditIcon sx={{ fontSize: 20, opacity: 0.8 }} />
                  </Box>
                  <Typography variant="h5" sx={{ fontWeight: 700, fontSize: '1.5rem', lineHeight: 1.2 }}>
                    {summaryStats.draftCount}
                  </Typography>
                  <Typography variant="caption" sx={{ opacity: 0.8, fontSize: '0.65rem' }}>
                    In progress
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </Box>
      )}

      {/* Compact Tabs */}
      <Paper elevation={0} sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}>
        <Tabs 
          value={activeTab} 
          onChange={(e, v) => setActiveTab(v)}
          sx={{ minHeight: 40 }}
        >
          <Tab 
            label="Containers" 
            icon={<MoneyIcon sx={{ fontSize: 18 }} />} 
            iconPosition="start"
            sx={{ minHeight: 40, py: 1, textTransform: 'none', fontWeight: 600 }}
          />
          {selectedContainer && (
            <Tab 
              label={selectedContainer.budgetName || 'Details'} 
              icon={<ViewIcon sx={{ fontSize: 18 }} />} 
              iconPosition="start"
              sx={{ minHeight: 40, py: 1, textTransform: 'none', fontWeight: 600 }}
            />
          )}
        </Tabs>
      </Paper>

      {activeTab === 0 && (
        <>

      {/* Compact Filters */}
      <Paper elevation={0} sx={{ p: 1.5, mb: 2, bgcolor: 'background.default', border: 1, borderColor: 'divider', borderRadius: 1 }}>
        <Grid container spacing={1.5} alignItems="center">
          <Grid item xs={12} sm={4} md={3}>
            <TextField
              fullWidth
              size="small"
              label="Search"
              value={filters.search}
              onChange={(e) => handleFilterChange('search', e.target.value)}
              placeholder="Budget name..."
              sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'background.paper' } }}
            />
          </Grid>
          <Grid item xs={6} sm={2.5} md={2}>
            <FormControl fullWidth size="small" sx={{ minWidth: 120, bgcolor: 'background.paper' }}>
              <InputLabel>Year</InputLabel>
              <Select
                value={filters.finYearId}
                label="Year"
                onChange={(e) => handleFilterChange('finYearId', e.target.value)}
              >
                <MenuItem value="">All</MenuItem>
                {financialYears.map((fy) => (
                  <MenuItem key={fy.finYearId} value={fy.finYearId}>
                    {fy.finYearName}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={6} sm={2.5} md={2}>
            <FormControl fullWidth size="small" sx={{ minWidth: 120, bgcolor: 'background.paper' }}>
              <InputLabel>Dept</InputLabel>
              <Select
                value={filters.departmentId}
                label="Dept"
                onChange={(e) => handleFilterChange('departmentId', e.target.value)}
              >
                <MenuItem value="">All</MenuItem>
                {departments.map((dept) => (
                  <MenuItem key={dept.departmentId} value={dept.departmentId}>
                    {dept.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={6} sm={2} md={1.5}>
            <FormControl fullWidth size="small" sx={{ minWidth: 100, bgcolor: 'background.paper' }}>
              <InputLabel>Status</InputLabel>
              <Select
                value={filters.status}
                label="Status"
                onChange={(e) => handleFilterChange('status', e.target.value)}
              >
                <MenuItem value="">All</MenuItem>
                <MenuItem value="Draft">Draft</MenuItem>
                <MenuItem value="Pending">Pending</MenuItem>
                <MenuItem value="Approved">Approved</MenuItem>
                <MenuItem value="Rejected">Rejected</MenuItem>
                <MenuItem value="Cancelled">Cancelled</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={6} sm={1} md={1}>
            <Button
              fullWidth
              variant="outlined"
              size="small"
              onClick={handleClearFilters}
              sx={{ height: '40px', minWidth: 'auto' }}
            >
              Clear
            </Button>
          </Grid>
        </Grid>
      </Paper>

          {/* Compact Containers Table */}
          <Paper elevation={0} sx={{ border: 1, borderColor: 'divider', borderRadius: 1, overflow: 'hidden' }}>
            <Box
              height="calc(100vh - 320px)"
              minHeight={400}
              sx={{
                "& .MuiDataGrid-root": {
                  border: "none",
                  fontFamily: theme.typography.fontFamily,
                },
                "& .MuiDataGrid-cell": {
                  borderBottom: "1px solid",
                  borderColor: "divider",
                  py: 1.5,
                  fontSize: '0.875rem',
                  '&:focus': {
                    outline: 'none',
                  },
                  '&:focus-within': {
                    outline: 'none',
                  },
                },
                "& .MuiDataGrid-columnHeaders": {
                  backgroundColor: theme.palette.mode === 'dark' 
                    ? 'rgba(102, 126, 234, 0.15)' 
                    : 'rgba(102, 126, 234, 0.08)',
                  borderBottom: "2px solid",
                  borderColor: theme.palette.primary.main,
                  fontWeight: 700,
                  fontSize: '0.875rem',
                  color: theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.9)' : 'rgba(0, 0, 0, 0.87)',
                  '& .MuiDataGrid-columnHeaderTitle': {
                    fontWeight: 700,
                  },
                },
                "& .MuiDataGrid-virtualScroller": {
                  backgroundColor: 'transparent',
                },
                "& .MuiDataGrid-footerContainer": {
                  borderTop: "2px solid",
                  borderColor: "divider",
                  backgroundColor: theme.palette.mode === 'dark' 
                    ? 'rgba(255, 255, 255, 0.02)' 
                    : 'rgba(0, 0, 0, 0.01)',
                  minHeight: '52px',
                },
                "& .MuiDataGrid-row": {
                  cursor: 'pointer',
                  transition: 'background-color 0.2s ease',
                  '&:hover': {
                    backgroundColor: theme.palette.mode === 'dark' 
                      ? 'rgba(102, 126, 234, 0.1)' 
                      : 'rgba(102, 126, 234, 0.05)',
                  },
                  '&.Mui-selected': {
                    backgroundColor: theme.palette.mode === 'dark'
                      ? 'rgba(102, 126, 234, 0.2)'
                      : 'rgba(102, 126, 234, 0.1)',
                    '&:hover': {
                      backgroundColor: theme.palette.mode === 'dark'
                        ? 'rgba(102, 126, 234, 0.25)'
                        : 'rgba(102, 126, 234, 0.15)',
                    },
                  },
                },
                "& .MuiDataGrid-iconButtonContainer": {
                  visibility: 'visible',
                },
                "& .MuiDataGrid-menuIcon": {
                  visibility: 'visible',
                },
              }}
            >
            {containers && containers.length > 0 ? (
              <DataGrid
                rows={containers}
                columns={containerColumns}
                getRowId={(row) => row.budgetId}
                paginationMode="server"
                rowCount={pagination.total}
                page={pagination.page - 1}
                pageSize={pagination.limit}
                onPageChange={(newPage) => setPagination(prev => ({ ...prev, page: newPage + 1 }))}
                onPageSizeChange={(newPageSize) => setPagination(prev => ({ ...prev, limit: newPageSize, page: 1 }))}
                rowsPerPageOptions={[25, 50, 100]}
                onRowContextMenu={(params, event) => {
                  event.preventDefault();
                  setSelectedContainerForContextMenu(params.row);
                  setContextMenu({
                    mouseX: event.clientX + 2,
                    mouseY: event.clientY - 6,
                  });
                }}
                sx={{
                  '& .MuiDataGrid-row': {
                    cursor: 'pointer',
                    '&:hover': {
                      backgroundColor: theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.04)',
                    },
                  },
                  '& .MuiDataGrid-cell': {
                    borderBottom: '1px solid',
                    borderColor: 'divider',
                  },
                  '& .MuiDataGrid-columnHeaders': {
                    backgroundColor: theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.02)',
                    fontWeight: 600,
                  },
                }}
              />
            ) : !loading ? (
              <Box display="flex" flexDirection="column" justifyContent="center" alignItems="center" height="100%" gap={1.5} p={4}>
                <MoneyIcon sx={{ fontSize: 48, color: 'text.secondary', opacity: 0.5 }} />
                <Typography variant="h6" color="text.secondary">No budget containers found</Typography>
                <Typography variant="body2" color="text.secondary" textAlign="center">
                  {error ? `Error: ${error}` : 'Create a new container to get started'}
                </Typography>
                {containers.length === 0 && pagination.total > 0 && (
                  <Box sx={{ mt: 1, textAlign: 'center' }}>
                    <Typography variant="caption" color="warning.main" display="block">
                      {pagination.total} container(s) may be filtered out. Try clearing filters.
                    </Typography>
                    <Button 
                      variant="outlined" 
                      size="small" 
                      onClick={() => {
                        setFilters({
                          finYearId: '',
                          departmentId: '',
                          status: '',
                          search: ''
                        });
                        setPagination(prev => ({ ...prev, page: 1 }));
                      }}
                      sx={{ mt: 1 }}
                    >
                      Clear All Filters
                    </Button>
                  </Box>
                )}
                {Object.values(filters).some(v => v !== '') && (
                  <Typography variant="caption" color="info.main" sx={{ mt: 1 }}>
                    Active filters: {Object.entries(filters).filter(([_, v]) => v !== '').map(([k, v]) => `${k}=${v}`).join(', ')}
                  </Typography>
                )}
              </Box>
            ) : null}
            </Box>
          </Paper>
        </>
      )}

      {/* Combined Budget View */}
      {activeTab === 1 && combinedBudgetView && (
        <Box>
          <Card elevation={0} sx={{ border: 1, borderColor: 'divider', mb: 2 }}>
            <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
              <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                <Box>
                  <Typography variant="h5" fontWeight={700} gutterBottom>
                    {combinedBudgetView.combinedBudget.budgetName}
                    <Chip label="Combined Budget" color="primary" size="small" sx={{ ml: 1.5, height: 24 }} />
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {combinedBudgetView.combinedBudget.finYearName} • {combinedBudgetView.containerCount} container(s) • {combinedBudgetView.totalItems} item(s)
                  </Typography>
                </Box>
                <Stack direction="row" spacing={1}>
                  <Button
                    variant="outlined"
                    size="small"
                    startIcon={<FileDownloadIcon />}
                    onClick={handleExportCombinedBudgetToExcel}
                    disabled={exportingExcel || !combinedBudgetView?.containerItems?.length}
                    sx={{ 
                      borderColor: colors.greenAccent[500],
                      color: colors.greenAccent[700],
                      '&:hover': {
                        borderColor: colors.greenAccent[600],
                        bgcolor: colors.greenAccent[50]
                      }
                    }}
                  >
                    {exportingExcel ? <CircularProgress size={16} /> : 'Excel'}
                  </Button>
                  <Button
                    variant="outlined"
                    size="small"
                    startIcon={<PictureAsPdfIcon />}
                    onClick={handleExportCombinedBudgetToPDF}
                    disabled={exportingPdf || !combinedBudgetView?.containerItems?.length}
                    sx={{ 
                      borderColor: colors.redAccent[500],
                      color: colors.redAccent[700],
                      '&:hover': {
                        borderColor: colors.redAccent[600],
                        bgcolor: colors.redAccent[50]
                      }
                    }}
                  >
                    {exportingPdf ? <CircularProgress size={16} /> : 'PDF'}
                  </Button>
                  <Button
                    variant="outlined"
                    size="small"
                    startIcon={<ViewIcon />}
                    onClick={() => {
                      setCombinedBudgetView(null);
                      setSelectedContainer(null);
                      setActiveTab(0);
                    }}
                  >
                    Back
                  </Button>
                </Stack>
              </Box>
              <Grid container spacing={2} mt={0.5}>
                <Grid item xs={12} sm={6} md={3}>
                  <Typography variant="caption" color="text.secondary" display="block">Financial Year</Typography>
                  <Typography variant="body2" fontWeight={600}>{combinedBudgetView.combinedBudget.finYearName || 'N/A'}</Typography>
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <Typography variant="caption" color="text.secondary" display="block">Containers</Typography>
                  <Typography variant="body2" fontWeight={600}>{combinedBudgetView.containerCount || 0}</Typography>
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <Typography variant="caption" color="text.secondary" display="block">Total Items</Typography>
                  <Typography variant="body2" fontWeight={600}>{combinedBudgetView.totalItems || 0}</Typography>
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <Typography variant="caption" color="text.secondary" display="block">Grand Total</Typography>
                  <Typography variant="body2" fontWeight={700} color="success.main" fontSize="1.1rem">
                    {formatCurrency(combinedBudgetView.grandTotal || 0)}
                  </Typography>
                </Grid>
              </Grid>
              {combinedBudgetView.combinedBudget.description && (
                <Box mt={1.5} pt={1.5} borderTop={1} borderColor="divider">
                  <Typography variant="caption" color="text.secondary" display="block" mb={0.5}>Description</Typography>
                  <Typography variant="body2">{combinedBudgetView.combinedBudget.description}</Typography>
                </Box>
              )}
            </CardContent>
          </Card>

          {/* Combined Budget Items by Container */}
          {(() => {
            console.log('=== Combined Budget View Debug ===');
            console.log('combinedBudgetView:', combinedBudgetView);
            console.log('containerItems:', combinedBudgetView.containerItems);
            console.log('Is array?', Array.isArray(combinedBudgetView.containerItems));
            console.log('Length:', combinedBudgetView.containerItems?.length);
            
            if (!combinedBudgetView.containerItems || !Array.isArray(combinedBudgetView.containerItems)) {
              console.warn('containerItems is not an array or is missing');
              return (
                <Card elevation={0} sx={{ border: 1, borderColor: 'divider', mb: 2 }}>
                  <CardContent sx={{ p: 3, textAlign: 'center' }}>
                    <Typography variant="body1" color="text.secondary">
                      No container data available
                    </Typography>
                  </CardContent>
                </Card>
              );
            }
            
            if (combinedBudgetView.containerItems.length === 0) {
              return (
                <Card elevation={0} sx={{ border: 1, borderColor: 'divider', mb: 2 }}>
                  <CardContent sx={{ p: 3, textAlign: 'center' }}>
                    <Typography variant="body1" color="text.secondary">
                      No containers found in this combined budget
                    </Typography>
                  </CardContent>
                </Card>
              );
            }
            
            return combinedBudgetView.containerItems
              .filter((containerData) => containerData && containerData.container) // Filter out invalid entries
              .map((containerData, containerIndex) => {
              const container = containerData.container;
              const items = Array.isArray(containerData.items) ? containerData.items : [];
              const containerTotal = parseFloat(container.totalAmount) || 0;
              
              console.log(`Rendering Container ${containerIndex}:`, {
                name: container.budgetName,
                id: container.budgetId,
                itemCount: items.length,
                items: items,
                hasItems: items.length > 0,
                containerData: containerData,
                containerItemCount: container.itemCount
              });
              
              // If items array is empty but container shows itemCount > 0, log a warning
              if (items.length === 0 && container.itemCount > 0) {
                console.warn(`⚠️ Container ${container.budgetName} (ID: ${container.budgetId}) shows ${container.itemCount} items in count but items array is empty!`);
                console.warn('Full containerData:', containerData);
              }
            
            return (
              <Card 
                key={container.budgetId} 
                elevation={0} 
                sx={{ 
                  border: 1, 
                  borderColor: 'divider', 
                  mb: 2,
                  borderLeft: `4px solid ${colors.blueAccent[500]}`,
                  borderRadius: 2,
                  overflow: 'hidden',
                  bgcolor: theme.palette.mode === 'dark' ? colors.primary[500] : 'white',
                  boxShadow: theme.palette.mode === 'dark' 
                    ? '0 2px 8px rgba(0,0,0,0.3)' 
                    : '0 2px 8px rgba(0,0,0,0.08)'
                }}
              >
                <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
                  <Box 
                    display="flex" 
                    justifyContent="space-between" 
                    alignItems="center" 
                    mb={2}
                    pb={1.5}
                    borderBottom={1}
                    borderColor="divider"
                  >
                    <Box>
                      <Typography variant="h6" fontWeight={700} gutterBottom sx={{ color: colors.blueAccent[700] }}>
                        {formatToSentenceCase(container.budgetName)}
                      </Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.813rem' }}>
                        {formatToSentenceCase(container.departmentName) || 'No Department'} • {container.itemCount || 0} item(s)
                      </Typography>
                    </Box>
                    <Box 
                      textAlign="right"
                      sx={{
                        bgcolor: theme.palette.mode === 'dark' ? colors.blueAccent[900] : colors.blueAccent[50],
                        px: 2,
                        py: 1,
                        borderRadius: 1,
                        border: `1px solid ${colors.blueAccent[200]}`
                      }}
                    >
                      <Typography variant="caption" color="text.secondary" display="block" sx={{ fontSize: '0.75rem', mb: 0.5 }}>
                        Subtotal
                      </Typography>
                      <Typography variant="h6" fontWeight={700} sx={{ color: colors.blueAccent[700], fontSize: '1.125rem' }}>
                        {formatCurrency(containerTotal)}
                      </Typography>
                    </Box>
                  </Box>
                  
                  {items.length > 0 ? (
                    <TableContainer sx={{ maxWidth: '100%', overflowX: 'auto' }}>
                      <Table size="small" sx={{ '& .MuiTableCell-root': { fontSize: '0.813rem', borderBottom: 'none' }, minWidth: 950 }}>
                        <TableHead>
                          <TableRow sx={{ 
                            bgcolor: theme.palette.mode === 'dark' ? colors.blueAccent[900] : colors.blueAccent[50],
                            '& .MuiTableCell-root': {
                              borderBottom: `2px solid ${colors.blueAccent[200]}`,
                              fontWeight: 700,
                              py: 1,
                              fontSize: '0.813rem',
                              color: theme.palette.mode === 'dark' ? colors.grey[100] : colors.blueAccent[800]
                            }
                          }}>
                            <TableCell sx={{ width: 50, textAlign: 'center' }}>#</TableCell>
                            <TableCell sx={{ minWidth: 200 }}>Project Name</TableCell>
                            <TableCell sx={{ minWidth: 170, maxWidth: 170 }}>Department</TableCell>
                            <TableCell sx={{ minWidth: 120 }}>Subcounty</TableCell>
                            <TableCell sx={{ minWidth: 120 }}>Ward</TableCell>
                            <TableCell align="right" sx={{ minWidth: 160, whiteSpace: 'nowrap' }}>Amount</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {items.map((item, itemIndex) => {
                            console.log(`Rendering item ${itemIndex}:`, item);
                            return (
                              <TableRow 
                                key={item.itemId} 
                                hover
                                sx={{ 
                                  bgcolor: 'transparent',
                                  '&:hover': { 
                                    bgcolor: theme.palette.mode === 'dark' 
                                      ? 'rgba(255, 255, 255, 0.03)' 
                                      : 'rgba(102, 126, 234, 0.05)',
                                    transition: 'background-color 0.2s'
                                  },
                                  transition: 'background-color 0.2s',
                                  '&:nth-of-type(even)': {
                                    bgcolor: theme.palette.mode === 'dark' 
                                      ? 'rgba(255, 255, 255, 0.01)' 
                                      : 'rgba(102, 126, 234, 0.02)'
                                  }
                                }}
                              >
                                <TableCell sx={{ py: 1, textAlign: 'center', fontWeight: 600, color: 'text.secondary', fontSize: '0.813rem' }}>
                                  {itemIndex + 1}
                                </TableCell>
                                <TableCell sx={{ py: 1, fontSize: '0.813rem', minWidth: 200 }}>{formatToSentenceCase(item.projectName) || 'N/A'}</TableCell>
                                <TableCell sx={{ py: 1, fontSize: '0.813rem', minWidth: 220, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={item.departmentName || 'N/A'}>
                                  {item.departmentName || 'N/A'}
                                </TableCell>
                                <TableCell sx={{ py: 1, fontSize: '0.813rem', minWidth: 120 }}>{formatToSentenceCase(item.subcountyName) || 'N/A'}</TableCell>
                                <TableCell sx={{ py: 1, fontSize: '0.813rem', minWidth: 120 }}>{formatToSentenceCase(item.wardName) || 'N/A'}</TableCell>
                                <TableCell sx={{ py: 1, align: 'right', fontWeight: 600, fontSize: '0.813rem', color: 'success.main' }}>
                                  {formatCurrency(item.amount || 0)}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                          <TableRow sx={{ 
                            bgcolor: theme.palette.mode === 'dark' 
                              ? 'rgba(102, 126, 234, 0.15)' 
                              : 'rgba(102, 126, 234, 0.08)',
                            '& .MuiTableCell-root': {
                              borderTop: `2px solid ${colors.blueAccent[200]}`,
                              borderBottom: 'none',
                              py: 1.5,
                              fontWeight: 700,
                              fontSize: '0.875rem',
                              bgcolor: 'transparent'
                            }
                          }}>
                            <TableCell colSpan={5} align="right" sx={{ color: theme.palette.mode === 'dark' ? colors.grey[200] : colors.blueAccent[700] }}>
                              Container Subtotal:
                            </TableCell>
                            <TableCell align="right" sx={{ color: colors.blueAccent[700], fontSize: '0.938rem', fontWeight: 800 }}>
                              {formatCurrency(containerTotal)}
                            </TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </TableContainer>
                  ) : (
                    <Typography variant="body2" color="text.secondary" textAlign="center" py={3}>
                      No items in this container
                    </Typography>
                  )}
                </CardContent>
              </Card>
            );
            });
          })()}

          {/* Grand Total Card */}
          <Card 
            elevation={2}
            sx={{ 
              border: 2, 
              borderColor: colors.greenAccent[500],
              bgcolor: theme.palette.mode === 'dark' ? colors.greenAccent[900] : colors.greenAccent[50],
              mt: 2
            }}
          >
            <CardContent sx={{ p: 3 }}>
              <Box display="flex" justifyContent="space-between" alignItems="center">
                <Typography variant="h5" fontWeight={700} color={colors.greenAccent[700]}>
                  Grand Total
                </Typography>
                <Typography variant="h4" fontWeight={700} color={colors.greenAccent[700]}>
                  {formatCurrency(combinedBudgetView.grandTotal || 0)}
                </Typography>
              </Box>
              <Typography variant="body2" color="text.secondary" mt={1}>
                Combined total from {combinedBudgetView.containerCount} container(s)
              </Typography>
            </CardContent>
          </Card>
        </Box>
      )}

      {/* Container Details View */}
      {activeTab === 1 && selectedContainer && !combinedBudgetView && (
        <Box>
          {/* Compact Container Details Header */}
          <Card elevation={0} sx={{ mb: 2, border: 1, borderColor: 'divider' }}>
            <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
              <Box display="flex" justifyContent="space-between" alignItems="start" mb={1.5}>
                <Box flex={1}>
                  <Typography variant="h6" fontWeight={700} gutterBottom>
                    {selectedContainer.budgetName}
                  </Typography>
                  <Stack direction="row" spacing={1} mt={0.5} flexWrap="wrap" gap={0.5}>
                    <Chip 
                      label={selectedContainer.status} 
                      color={getStatusColor(selectedContainer.status)}
                      size="small"
                      sx={{ height: 24, fontSize: '0.75rem' }}
                    />
                    {selectedContainer.isFrozen === 1 && (
                      <Chip 
                        icon={<LockIcon sx={{ fontSize: 14 }} />}
                        label="Locked" 
                        color="warning"
                        size="small"
                        sx={{ height: 24, fontSize: '0.75rem' }}
                      />
                    )}
                  </Stack>
                </Box>
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<ViewIcon />}
                  onClick={() => setActiveTab(0)}
                  sx={{ ml: 2 }}
                >
                  Back
                </Button>
              </Box>
              <Grid container spacing={2} mt={0.5}>
                <Grid item xs={6} sm={4}>
                  <Typography variant="caption" color="text.secondary" display="block">Financial Year</Typography>
                  <Typography variant="body2" fontWeight={600}>{selectedContainer.finYearName || 'N/A'}</Typography>
                </Grid>
                <Grid item xs={6} sm={4}>
                  <Typography variant="caption" color="text.secondary" display="block">Department</Typography>
                  <Typography variant="body2" fontWeight={600}>{selectedContainer.departmentName || 'N/A'}</Typography>
                </Grid>
                <Grid item xs={12} sm={4}>
                  <Typography variant="caption" color="text.secondary" display="block">Total Amount</Typography>
                  <Typography variant="body2" fontWeight={700} color="success.main">
                    {formatCurrency(selectedContainer.totalAmount || 0)}
                  </Typography>
                </Grid>
              </Grid>
              {selectedContainer.description && (
                <Box mt={1.5} pt={1.5} borderTop={1} borderColor="divider">
                  <Typography variant="caption" color="text.secondary" display="block" mb={0.5}>Description</Typography>
                  <Typography variant="body2">{selectedContainer.description}</Typography>
                </Box>
              )}
            </CardContent>
          </Card>

          {/* Compact Budget Items */}
          <Card elevation={0} sx={{ mb: 2, border: 1, borderColor: 'divider' }}>
            <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
              <Box display="flex" justifyContent="space-between" alignItems="center" mb={1.5}>
                <Typography variant="subtitle1" fontWeight={700}>
                  Budget Items <Chip label={filteredItems.length} size="small" sx={{ ml: 1, height: 20 }} />
                  {filteredItems.length !== containerItems.length && (
                    <Chip 
                      label={`of ${containerItems.length}`} 
                      size="small" 
                      variant="outlined"
                      sx={{ ml: 0.5, height: 20, fontSize: '0.7rem' }} 
                    />
                  )}
                </Typography>
                <Stack direction="row" spacing={1} alignItems="center">
                  {containerItems.length > 0 && (
                    <>
                      <Tooltip title="Export to Excel">
                        <IconButton
                          size="small"
                          onClick={handleExportItemsToExcel}
                          disabled={exportingExcel}
                          sx={{ 
                            border: 1, 
                            borderColor: 'divider',
                            '&:hover': { bgcolor: 'action.hover' }
                          }}
                        >
                          {exportingExcel ? (
                            <CircularProgress size={16} />
                          ) : (
                            <FileDownloadIcon fontSize="small" />
                          )}
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Export to PDF">
                        <IconButton
                          size="small"
                          onClick={handleExportItemsToPDF}
                          disabled={exportingPdf}
                          sx={{ 
                            border: 1, 
                            borderColor: 'divider',
                            '&:hover': { bgcolor: 'action.hover' }
                          }}
                        >
                          {exportingPdf ? (
                            <CircularProgress size={16} />
                          ) : (
                            <PictureAsPdfIcon fontSize="small" />
                          )}
                        </IconButton>
                      </Tooltip>
                    </>
                  )}
                  {/* Add Item button disabled - items should be imported only */}
                  <Chip 
                    icon={<LockIcon sx={{ fontSize: 14 }} />}
                    label="Items via Import Only" 
                    color="info"
                    size="small"
                    sx={{ height: 24 }}
                  />
                </Stack>
              </Box>
              
              {/* Filter Section */}
              <Box mb={2} sx={{ 
                p: 1.5, 
                bgcolor: theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.02)' : 'rgba(0, 0, 0, 0.02)',
                borderRadius: 1,
                border: 1,
                borderColor: 'divider'
              }}>
                <Grid container spacing={2} alignItems="center">
                  <Grid item xs={12} sm={6} md={3}>
                    <TextField
                      fullWidth
                      size="small"
                      placeholder="Search items..."
                      value={itemFilters.search}
                      onChange={(e) => setItemFilters({ ...itemFilters, search: e.target.value })}
                      InputProps={{
                        startAdornment: <FilterIcon sx={{ mr: 1, fontSize: 18, color: 'text.secondary' }} />
                      }}
                    />
                  </Grid>
                  <Grid item xs={12} sm={6} md={3}>
                    <FormControl fullWidth size="small" sx={{ minWidth: 150 }}>
                      <InputLabel>Department</InputLabel>
                      <Select
                        value={itemFilters.departmentId}
                        label="Department"
                        onChange={(e) => setItemFilters({ ...itemFilters, departmentId: e.target.value })}
                      >
                        <MenuItem value="">All Departments</MenuItem>
                        {availableDepartments.map((dept) => (
                          <MenuItem key={dept.departmentId} value={dept.departmentId}>
                            {dept.name}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid item xs={12} sm={6} md={3}>
                    <FormControl fullWidth size="small" sx={{ minWidth: 150 }}>
                      <InputLabel>Subcounty</InputLabel>
                      <Select
                        value={itemFilters.subcountyId}
                        label="Subcounty"
                        onChange={(e) => {
                          // Reset ward filter when subcounty changes
                          setItemFilters({ ...itemFilters, subcountyId: e.target.value, wardId: '' });
                        }}
                      >
                        <MenuItem value="">All Subcounties</MenuItem>
                        {availableSubcounties.map((sub) => (
                          <MenuItem key={sub.subcountyId} value={sub.subcountyId}>
                            {sub.name}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid item xs={12} sm={6} md={3}>
                    <FormControl fullWidth size="small" sx={{ minWidth: 150 }}>
                      <InputLabel>Ward</InputLabel>
                      <Select
                        value={itemFilters.wardId}
                        label="Ward"
                        onChange={(e) => setItemFilters({ ...itemFilters, wardId: e.target.value })}
                        disabled={!itemFilters.subcountyId && availableWards.length === 0}
                      >
                        <MenuItem value="">All Wards</MenuItem>
                        {availableWards.map((ward) => (
                          <MenuItem key={ward.wardId} value={ward.wardId}>
                            {ward.name}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Grid>
                  {(itemFilters.search || itemFilters.departmentId || itemFilters.subcountyId || itemFilters.wardId) && (
                    <Grid item xs={12}>
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={() => setItemFilters({ search: '', departmentId: '', subcountyId: '', wardId: '' })}
                        startIcon={<CancelIcon />}
                      >
                        Clear Filters
                      </Button>
                    </Grid>
                  )}
                </Grid>
              </Box>
              
              <TableContainer sx={{ maxWidth: '100%', overflowX: 'auto' }}>
                <Table size="small" sx={{ '& .MuiTableCell-root': { fontSize: '0.813rem' }, minWidth: 950 }}>
                  <TableHead>
                    <TableRow sx={{ bgcolor: 'action.hover' }}>
                      <TableCell sx={{ fontWeight: 700, py: 0.75, width: 50, textAlign: 'center', fontSize: '0.75rem' }}>#</TableCell>
                      <TableCell sx={{ fontWeight: 700, py: 0.75, fontSize: '0.813rem', minWidth: 200 }}>Project Name</TableCell>
                      <TableCell sx={{ fontWeight: 700, py: 0.75, fontSize: '0.813rem', minWidth: 220, whiteSpace: 'nowrap' }}>Department</TableCell>
                      <TableCell sx={{ fontWeight: 700, py: 0.75, fontSize: '0.813rem', minWidth: 120 }}>Subcounty</TableCell>
                      <TableCell sx={{ fontWeight: 700, py: 0.75, fontSize: '0.813rem', minWidth: 120 }}>Ward</TableCell>
                      <TableCell sx={{ fontWeight: 700, py: 0.75, fontSize: '0.813rem', minWidth: 150, whiteSpace: 'nowrap' }} align="right">Amount</TableCell>
                      <TableCell sx={{ fontWeight: 700, py: 0.75, fontSize: '0.813rem' }} align="center" width={90}>Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {filteredItems.length > 0 ? (
                      filteredItems.map((item, index) => (
                        <TableRow 
                          key={item.itemId} 
                          hover
                          sx={{ 
                            '&:nth-of-type(even)': { bgcolor: 'action.hover' },
                            '&:hover': { bgcolor: 'action.selected' }
                          }}
                        >
                          <TableCell sx={{ py: 0.75, textAlign: 'center', fontWeight: 600, color: 'text.secondary', fontSize: '0.813rem' }}>
                            {index + 1}
                          </TableCell>
                          <TableCell sx={{ py: 0.75, fontSize: '0.813rem', minWidth: 200 }}>{formatToSentenceCase(item.projectName) || 'N/A'}</TableCell>
                          <TableCell sx={{ py: 0.75, fontSize: '0.813rem', minWidth: 220, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={item.departmentName || 'N/A'}>
                            {item.departmentName || 'N/A'}
                          </TableCell>
                          <TableCell sx={{ py: 0.75, fontSize: '0.813rem', minWidth: 120 }}>{formatToSentenceCase(item.subcountyName) || 'N/A'}</TableCell>
                          <TableCell sx={{ py: 0.75, fontSize: '0.813rem', minWidth: 120 }}>{formatToSentenceCase(item.wardName) || 'N/A'}</TableCell>
                          <TableCell sx={{ py: 0.75, align: 'right', fontWeight: 600, fontSize: '0.813rem', color: 'success.main' }}>
                            {formatCurrency(item.amount || 0)}
                          </TableCell>
                          <TableCell sx={{ py: 0.5 }} align="center">
                            <Stack direction="row" spacing={1}>
                              {selectedContainer.status !== 'Approved' || selectedContainer.isFrozen !== 1 ? (
                                <>
                                  <Tooltip title="Edit">
                                    <IconButton 
                                      size="small" 
                                      color="primary"
                                      onClick={() => handleOpenEditItemDialog(item)}
                                    >
                                      <EditIcon fontSize="small" />
                                    </IconButton>
                                  </Tooltip>
                                  <Tooltip title="Remove">
                                    <IconButton 
                                      size="small" 
                                      color="error"
                                      onClick={() => handleRemoveItem(item.itemId)}
                                    >
                                      <DeleteIcon fontSize="small" />
                                    </IconButton>
                                  </Tooltip>
                                </>
                              ) : (
                                <Tooltip title="Use change request to modify">
                                  <IconButton size="small" disabled>
                                    <LockIcon fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                              )}
                            </Stack>
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={7} align="center" sx={{ py: 4 }}>
                          <Typography variant="body2" color="text.secondary">
                            No items in this budget container
                          </Typography>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </CardContent>
          </Card>

          {/* Compact Pending Change Requests */}
          {pendingChanges.length > 0 && (
            <Card elevation={0} sx={{ border: 1, borderColor: 'divider' }}>
              <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                <Typography variant="subtitle1" fontWeight={700} gutterBottom>
                  Pending Change Requests <Chip label={pendingChanges.length} size="small" sx={{ ml: 1, height: 20 }} />
                </Typography>
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 600, py: 1 }}>Type</TableCell>
                        <TableCell sx={{ fontWeight: 600, py: 1 }}>Reason</TableCell>
                        <TableCell sx={{ fontWeight: 600, py: 1 }}>Requested By</TableCell>
                        <TableCell sx={{ fontWeight: 600, py: 1 }}>Date</TableCell>
                        <TableCell sx={{ fontWeight: 600, py: 1 }} align="center" width={120}>Actions</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {pendingChanges.map((change) => (
                        <TableRow key={change.changeId} hover>
                          <TableCell sx={{ py: 1 }}>{change.changeType}</TableCell>
                          <TableCell sx={{ py: 1 }}>{change.changeReason}</TableCell>
                          <TableCell sx={{ py: 1 }}>
                            {change.requestedByFirstName} {change.requestedByLastName}
                          </TableCell>
                          <TableCell sx={{ py: 1 }}>{new Date(change.requestedAt).toLocaleDateString()}</TableCell>
                          <TableCell sx={{ py: 0.5 }} align="center">
                            {hasPrivilege?.('budget.approve') && change.status === 'Pending Approval' && (
                              <Stack direction="row" spacing={1}>
                                <Tooltip title="Approve">
                                  <IconButton 
                                    size="small" 
                                    color="success"
                                    onClick={() => handleApproveChangeRequest(change.changeId)}
                                  >
                                    <CheckCircleIcon fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                                <Tooltip title="Reject">
                                  <IconButton 
                                    size="small" 
                                    color="error"
                                    onClick={() => handleRejectChangeRequest(change.changeId)}
                                  >
                                    <CancelIcon fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                              </Stack>
                            )}
                            {change.status !== 'Pending Approval' && (
                              <Chip 
                                label={change.status} 
                                color={change.status === 'Approved' ? 'success' : 'error'}
                                size="small"
                              />
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </CardContent>
            </Card>
          )}
        </Box>
      )}

      {/* Create/Edit Container Dialog */}
      <Dialog open={openDialog} onClose={handleCloseDialog} fullWidth maxWidth="md">
        <DialogTitle sx={{ backgroundColor: theme.palette.primary.main, color: 'white', display: 'flex', alignItems: 'center', gap: 1 }}>
          <MoneyIcon />
          {currentBudget ? 'Edit Budget Container' : 'Create Budget Container'}
        </DialogTitle>
        <DialogContent dividers sx={{ backgroundColor: theme.palette.background.default, pt: 2 }}>
          <Grid container spacing={2}>
            <Grid item xs={12}>
              <TextField
                fullWidth
                margin="dense"
                name="budgetName"
                label="Budget Name *"
                value={formData.budgetName}
                onChange={handleFormChange}
                error={!!formErrors.budgetName}
                helperText={formErrors.budgetName || 'e.g., "2025/2026 Budget"'}
                required
              />
            </Grid>

            <Grid item xs={12} md={6}>
              <FormControl fullWidth margin="dense" error={!!formErrors.finYearId} sx={{ minWidth: 260 }}>
                <InputLabel>Financial Year *</InputLabel>
                <Select
                  name="finYearId"
                  label="Financial Year *"
                  value={formData.finYearId}
                  onChange={handleFormChange}
                >
                  {financialYears.length === 0 && (
                    <MenuItem value="" disabled>
                      No financial years available
                    </MenuItem>
                  )}
                  {financialYears.map((fy) => (
                    <MenuItem key={fy.finYearId} value={fy.finYearId}>
                      {fy.finYearName}
                    </MenuItem>
                  ))}
                </Select>
                {formErrors.finYearId && (
                  <Typography variant="caption" color="error" sx={{ mt: 0.5, ml: 1.75 }}>
                    {formErrors.finYearId}
                  </Typography>
                )}
              </FormControl>
            </Grid>

            <Grid item xs={12} md={6}>
              <FormControl fullWidth margin="dense" sx={{ minWidth: 260 }}>
                <InputLabel>Department</InputLabel>
                <Select
                  name="departmentId"
                  label="Department"
                  value={formData.departmentId}
                  onChange={handleFormChange}
                >
                  <MenuItem value="">None</MenuItem>
                  {departments.length === 0 && (
                    <MenuItem value="" disabled>
                      No departments available
                    </MenuItem>
                  )}
                  {departments.map((dept) => (
                    <MenuItem key={dept.departmentId} value={dept.departmentId}>
                      {dept.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>

            <Grid item xs={12}>
              <TextField
                fullWidth
                margin="dense"
                name="description"
                label="Description"
                multiline
                rows={3}
                value={formData.description}
                onChange={handleFormChange}
                placeholder="Budget description and notes..."
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions sx={{ padding: '16px 24px', borderTop: `1px solid ${theme.palette.divider}` }}>
          <Button onClick={handleCloseDialog} color="primary" variant="outlined">Cancel</Button>
          <Button onClick={handleContainerSubmit} color="primary" variant="contained" disabled={loading}>
            {loading ? <CircularProgress size={20} /> : (currentBudget ? 'Update Container' : 'Create Container')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={openDeleteConfirmDialog} onClose={handleCloseDeleteConfirmDialog}>
        <DialogTitle>Confirm Deletion</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete budget for "{budgetToDeleteName}"? This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDeleteConfirmDialog} color="primary" variant="outlined">Cancel</Button>
          <Button onClick={handleConfirmDelete} color="error" variant="contained">Delete</Button>
        </DialogActions>
      </Dialog>

      {/* Approve Budget Confirmation Dialog */}
      <Dialog 
        open={openApproveDialog} 
        onClose={handleCloseApproveDialog} 
        aria-labelledby="approve-dialog-title" 
        aria-describedby="approve-dialog-description"
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 3,
            bgcolor: theme.palette.mode === 'dark' ? colors.primary[400] : colors.grey[50],
            boxShadow: theme.palette.mode === 'dark' 
              ? '0 8px 32px rgba(0,0,0,0.4)' 
              : '0 8px 32px rgba(0,0,0,0.12)',
          }
        }}
      >
        <DialogTitle 
          id="approve-dialog-title"
          sx={{ 
            backgroundColor: colors.greenAccent[600],
            color: 'white',
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            py: 3
          }}
        >
          <Avatar sx={{ bgcolor: colors.greenAccent[700] }}>
            <CheckCircleIcon />
          </Avatar>
          <Box>
            <Typography variant="h6" fontWeight="bold">
              Approve Budget Container
            </Typography>
            <Typography variant="body2" sx={{ opacity: 0.9 }}>
              Approval action required
            </Typography>
          </Box>
        </DialogTitle>
        <DialogContent sx={{ py: 3, px: 3 }}>
          <DialogContentText 
            id="approve-dialog-description"
            sx={{ 
              color: theme.palette.mode === 'dark' ? colors.grey[100] : colors.grey[800],
              fontSize: '1.1rem',
              lineHeight: 1.6
            }}
          >
            Are you sure you want to approve the budget container{' '}
            <Box component="span" sx={{ fontWeight: 'bold', color: colors.greenAccent[500] }}>
              "{budgetToApprove?.budgetName || 'N/A'}"
            </Box>
            ?
          </DialogContentText>
          <Alert 
            severity="warning" 
            sx={{ 
              mt: 2,
              bgcolor: theme.palette.mode === 'dark' ? colors.orange[900] : colors.orange[50],
              color: theme.palette.mode === 'dark' ? colors.orange[100] : colors.orange[800],
              '& .MuiAlert-icon': {
                color: colors.orange[500]
              }
            }}
          >
            <Typography variant="body2" fontWeight="bold">
              Important: Budget will be locked
            </Typography>
            <Typography variant="body2" sx={{ mt: 1 }}>
              Once approved, this budget container will be locked and any modifications will require a change request that needs approval.
            </Typography>
          </Alert>
          {budgetToApprove && (
            <Box sx={{ mt: 2, p: 2, bgcolor: theme.palette.mode === 'dark' ? colors.primary[500] : colors.grey[100], borderRadius: 1 }}>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                <strong>Financial Year:</strong> {budgetToApprove.finYearName || 'N/A'}
              </Typography>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                <strong>Department:</strong> {budgetToApprove.departmentName || 'N/A'}
              </Typography>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                <strong>Total Amount:</strong> {formatCurrency(budgetToApprove.totalAmount || 0)}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                <strong>Items:</strong> {budgetToApprove.itemCount || 0}
              </Typography>
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2, gap: 1 }}>
          <Button 
            onClick={handleCloseApproveDialog} 
            variant="outlined"
            sx={{ 
              borderColor: colors.grey[500],
              color: theme.palette.mode === 'dark' ? colors.grey[100] : colors.grey[800],
              '&:hover': {
                borderColor: colors.grey[400],
                backgroundColor: theme.palette.mode === 'dark' ? colors.grey[700] : colors.grey[200]
              }
            }}
          >
            Cancel
          </Button>
          <Button 
            onClick={handleApproveContainer} 
            variant="contained"
            disabled={loading}
            sx={{
              backgroundColor: colors.greenAccent[600],
              '&:hover': {
                backgroundColor: colors.greenAccent[700]
              },
              fontWeight: 'bold'
            }}
            startIcon={<CheckCircleIcon />}
          >
            {loading ? <CircularProgress size={20} color="inherit" /> : 'Approve Budget'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Add/Edit Item Dialog */}
      <Dialog open={openItemDialog} onClose={handleCloseItemDialog} fullWidth maxWidth="md">
        <DialogTitle sx={{ backgroundColor: theme.palette.primary.main, color: 'white', display: 'flex', alignItems: 'center', gap: 1 }}>
          <MoneyIcon />
          {currentItem ? 'Edit Budget Item' : 'Add Budget Item'}
        </DialogTitle>
        <DialogContent dividers sx={{ backgroundColor: theme.palette.background.default, pt: 2 }}>
          {selectedContainer?.status === 'Approved' && selectedContainer?.isFrozen === 1 && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              This budget is approved and locked. Adding/modifying items will create a change request that requires approval.
            </Alert>
          )}
          <Grid container spacing={2}>
            <Grid item xs={12}>
              <Autocomplete
                options={projects}
                getOptionLabel={(option) => option.projectName || option.project_name || ''}
                value={projects.find(p => p.id === itemFormData.projectId) || null}
                onChange={handleProjectSelectForItem}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Link to Project (Optional)"
                    placeholder="Search and select a project..."
                    margin="dense"
                  />
                )}
              />
            </Grid>

            <Grid item xs={12}>
              <TextField
                fullWidth
                margin="dense"
                name="projectName"
                label="Project Name *"
                value={itemFormData.projectName}
                onChange={handleItemFormChange}
                error={!!itemFormErrors.projectName}
                helperText={itemFormErrors.projectName || 'Enter the project name for this budget item'}
                required
              />
            </Grid>

            <Grid item xs={12} md={6}>
              <FormControl fullWidth margin="dense" error={!!itemFormErrors.departmentId} sx={{ minWidth: 200 }}>
                <InputLabel>Department *</InputLabel>
                <Select
                  name="departmentId"
                  label="Department *"
                  value={itemFormData.departmentId}
                  onChange={handleItemFormChange}
                >
                  {departments.map((dept) => (
                    <MenuItem key={dept.departmentId} value={dept.departmentId}>
                      {dept.name}
                    </MenuItem>
                  ))}
                </Select>
                {itemFormErrors.departmentId && (
                  <Typography variant="caption" color="error" sx={{ mt: 0.5, ml: 1.75 }}>
                    {itemFormErrors.departmentId}
                  </Typography>
                )}
              </FormControl>
            </Grid>

            <Grid item xs={12} md={6}>
              <FormControl fullWidth margin="dense" sx={{ minWidth: 200 }}>
                <InputLabel>Subcounty</InputLabel>
                <Select
                  name="subcountyId"
                  label="Subcounty"
                  value={itemFormData.subcountyId}
                  onChange={handleItemFormChange}
                >
                  <MenuItem value="">None</MenuItem>
                  {subcounties.map((sc) => (
                    <MenuItem key={sc.subcountyId} value={sc.subcountyId}>
                      {sc.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>

            <Grid item xs={12} md={6}>
              <FormControl fullWidth margin="dense" disabled={!itemFormData.subcountyId} sx={{ minWidth: 200 }}>
                <InputLabel>Ward</InputLabel>
                <Select
                  name="wardId"
                  label="Ward"
                  value={itemFormData.wardId}
                  onChange={handleItemFormChange}
                >
                  <MenuItem value="">None</MenuItem>
                  {wards.map((ward) => (
                    <MenuItem key={ward.wardId} value={ward.wardId}>
                      {ward.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>

            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                margin="dense"
                name="amount"
                label="Amount (KES) *"
                type="number"
                value={itemFormData.amount}
                onChange={handleItemFormChange}
                error={!!itemFormErrors.amount}
                helperText={itemFormErrors.amount || 'Enter the budget amount'}
                required
                InputProps={{
                  startAdornment: <Typography sx={{ mr: 1 }}>KES</Typography>
                }}
              />
            </Grid>

            {(selectedContainer?.status === 'Approved' && selectedContainer?.isFrozen === 1) && (
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  margin="dense"
                  name="changeReason"
                  label="Change Reason *"
                  multiline
                  rows={2}
                  value={itemFormData.changeReason}
                  onChange={handleItemFormChange}
                  error={!!itemFormErrors.changeReason}
                  helperText={itemFormErrors.changeReason || 'Explain why this change is needed'}
                  required
                />
              </Grid>
            )}

            <Grid item xs={12}>
              <TextField
                fullWidth
                margin="dense"
                name="remarks"
                label="Remarks"
                multiline
                rows={3}
                value={itemFormData.remarks}
                onChange={handleItemFormChange}
                placeholder="Additional notes or remarks..."
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions sx={{ padding: '16px 24px', borderTop: `1px solid ${theme.palette.divider}` }}>
          <Button onClick={handleCloseItemDialog} color="primary" variant="outlined">Cancel</Button>
          <Button onClick={handleItemSubmit} color="primary" variant="contained" disabled={loading}>
            {loading ? <CircularProgress size={20} /> : (currentItem ? 'Update Item' : 'Add Item')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Create Combined Budget Dialog */}
      <Dialog 
        open={openCombinedBudgetDialog} 
        onClose={handleCloseCombinedBudgetDialog} 
        maxWidth="md"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 3,
            bgcolor: theme.palette.mode === 'dark' ? colors.primary[400] : colors.grey[50],
          }
        }}
      >
        <DialogTitle 
          sx={{ 
            backgroundColor: colors.blueAccent[600],
            color: 'white',
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            py: 2.5
          }}
        >
          <Avatar sx={{ bgcolor: colors.blueAccent[700] }}>
            <MoneyIcon />
          </Avatar>
          <Box>
            <Typography variant="h6" fontWeight="bold">
              Combine Budget Containers
            </Typography>
            <Typography variant="body2" sx={{ opacity: 0.9 }}>
              Create an organizational budget from multiple containers
            </Typography>
          </Box>
        </DialogTitle>
        <DialogContent sx={{ py: 3, px: 3 }}>
          <Grid container spacing={2}>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Combined Budget Name *"
                value={combinedBudgetData.budgetName}
                onChange={(e) => setCombinedBudgetData(prev => ({ ...prev, budgetName: e.target.value }))}
                placeholder="e.g., 2025/2026 Organizational Budget"
                required
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <FormControl fullWidth required sx={{ minWidth: 200 }}>
                <InputLabel>Financial Year *</InputLabel>
                <Select
                  value={combinedBudgetData.finYearId}
                  label="Financial Year *"
                  onChange={(e) => setCombinedBudgetData(prev => ({ ...prev, finYearId: e.target.value }))}
                >
                  {financialYears.map((fy) => (
                    <MenuItem key={fy.finYearId} value={fy.finYearId}>
                      {fy.finYearName}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Description"
                value={combinedBudgetData.description}
                onChange={(e) => setCombinedBudgetData(prev => ({ ...prev, description: e.target.value }))}
                multiline
                rows={2}
                placeholder="Description of the combined budget..."
              />
            </Grid>
            <Grid item xs={12}>
              <Typography variant="subtitle2" fontWeight={600} gutterBottom>
                Select Containers to Combine ({combinedBudgetData.selectedContainerIds.length} selected)
              </Typography>
              <Box 
                sx={{ 
                  maxHeight: 300, 
                  overflowY: 'auto', 
                  border: 1, 
                  borderColor: 'divider', 
                  borderRadius: 1,
                  p: 1,
                  bgcolor: theme.palette.mode === 'dark' ? colors.primary[500] : colors.grey[100]
                }}
              >
                {containers
                  .filter(c => c.isCombined !== 1 && !c.parentBudgetId && c.status !== 'Rejected')
                  .map((container) => (
                    <Box
                      key={container.budgetId}
                      onClick={() => handleToggleContainerSelection(container.budgetId)}
                      sx={{
                        p: 1.5,
                        mb: 1,
                        borderRadius: 1,
                        cursor: 'pointer',
                        bgcolor: combinedBudgetData.selectedContainerIds.includes(container.budgetId)
                          ? colors.blueAccent[600]
                          : theme.palette.mode === 'dark' ? colors.primary[600] : colors.grey[100],
                        color: combinedBudgetData.selectedContainerIds.includes(container.budgetId) 
                          ? 'white' 
                          : theme.palette.mode === 'dark' ? colors.grey[100] : colors.grey[800],
                        border: 1,
                        borderColor: combinedBudgetData.selectedContainerIds.includes(container.budgetId)
                          ? colors.blueAccent[600]
                          : 'divider',
                        '&:hover': {
                          bgcolor: combinedBudgetData.selectedContainerIds.includes(container.budgetId)
                            ? colors.blueAccent[700]
                            : theme.palette.mode === 'dark' ? colors.primary[700] : colors.grey[200],
                        },
                        transition: 'all 0.2s'
                      }}
                    >
                      <Box display="flex" justifyContent="space-between" alignItems="center">
                        <Box>
                          <Typography 
                            variant="body2" 
                            fontWeight={600}
                            sx={{
                              color: combinedBudgetData.selectedContainerIds.includes(container.budgetId) 
                                ? 'white' 
                                : theme.palette.mode === 'dark' ? colors.grey[100] : colors.grey[800],
                            }}
                          >
                            {container.budgetName}
                          </Typography>
                          <Typography 
                            variant="caption" 
                            sx={{ 
                              opacity: combinedBudgetData.selectedContainerIds.includes(container.budgetId) ? 0.9 : 0.8,
                              color: combinedBudgetData.selectedContainerIds.includes(container.budgetId) 
                                ? 'white' 
                                : theme.palette.mode === 'dark' ? colors.grey[300] : colors.grey[600],
                            }}
                          >
                            {container.departmentName || 'No Department'} • {formatCurrency(container.totalAmount || 0)}
                          </Typography>
                        </Box>
                        <CheckCircleIcon 
                          sx={{ 
                            fontSize: 20,
                            opacity: combinedBudgetData.selectedContainerIds.includes(container.budgetId) ? 1 : 0.3,
                            color: combinedBudgetData.selectedContainerIds.includes(container.budgetId) 
                              ? 'white' 
                              : theme.palette.mode === 'dark' ? colors.grey[400] : colors.grey[600],
                          }} 
                        />
                      </Box>
                    </Box>
                  ))}
                {containers.filter(c => c.isCombined !== 1 && !c.parentBudgetId && c.status !== 'Rejected').length === 0 && (
                  <Typography variant="body2" color="text.secondary" textAlign="center" p={2}>
                    No available containers to combine
                  </Typography>
                )}
              </Box>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2, gap: 1 }}>
          <Button 
            onClick={handleCloseCombinedBudgetDialog} 
            variant="outlined"
            sx={{ 
              borderColor: colors.grey[500],
              color: theme.palette.mode === 'dark' ? colors.grey[100] : colors.grey[800],
            }}
          >
            Cancel
          </Button>
          <Button 
            onClick={handleCreateCombinedBudget} 
            variant="contained"
            disabled={loading || combinedBudgetData.selectedContainerIds.length === 0}
            sx={{
              backgroundColor: colors.blueAccent[600],
              '&:hover': { backgroundColor: colors.blueAccent[700] },
              fontWeight: 'bold'
            }}
            startIcon={<MoneyIcon />}
          >
            {loading ? <CircularProgress size={20} color="inherit" /> : 'Create Combined Budget'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Row Action Menu (Three Dots) */}
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
      >
        {selectedRow && (() => {
          const isApproved = selectedRow.status === 'Approved';
          const isFrozen = selectedRow.isFrozen === 1;
          const canApprove = hasPrivilege?.('budget.approve') && !isApproved;
          const canUpdate = hasPrivilege?.('budget.update');
          
          return [
            <MenuItem key="view" onClick={() => {
              handleViewContainer(selectedRow);
              setRowActionMenuAnchor(null);
              setSelectedRow(null);
            }}>
              <ListItemIcon>
                <ViewIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText>View Details</ListItemText>
            </MenuItem>,
            <MenuItem 
              key="edit"
              onClick={() => {
                if (canUpdate && !isFrozen) {
                  handleOpenEditDialog(selectedRow);
                  setRowActionMenuAnchor(null);
                  setSelectedRow(null);
                }
              }}
              disabled={!canUpdate || isFrozen}
            >
              <ListItemIcon>
                <EditIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText>Edit</ListItemText>
            </MenuItem>,
            canApprove && (
              <MenuItem key="approve" onClick={() => {
                handleOpenApproveDialog(selectedRow.budgetId);
                setRowActionMenuAnchor(null);
                setSelectedRow(null);
              }}>
                <ListItemIcon>
                  <CheckCircleIcon fontSize="small" color="success" />
                </ListItemIcon>
                <ListItemText>Approve</ListItemText>
              </MenuItem>
            )
          ].filter(Boolean);
        })()}
      </Menu>

      {/* Context Menu (Right-click) */}
      <Menu
        open={contextMenu !== null}
        onClose={() => {
          setContextMenu(null);
          setSelectedContainerForContextMenu(null);
        }}
        anchorReference="anchorPosition"
        anchorPosition={
          contextMenu !== null
            ? { top: contextMenu.mouseY, left: contextMenu.mouseX }
            : undefined
        }
      >
        {selectedContainerForContextMenu && (() => {
          const isApproved = selectedContainerForContextMenu.status === 'Approved';
          const isFrozen = selectedContainerForContextMenu.isFrozen === 1;
          const canApprove = hasPrivilege?.('budget.approve') && !isApproved;
          const canUpdate = hasPrivilege?.('budget.update');
          
          return [
            <MenuItem key="view" onClick={() => {
              handleViewContainer(selectedContainerForContextMenu);
              setContextMenu(null);
              setSelectedContainerForContextMenu(null);
            }}>
              <ListItemIcon>
                <ViewIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText>View Details</ListItemText>
            </MenuItem>,
            canUpdate && !isFrozen && (
              <MenuItem key="edit" onClick={() => {
                handleOpenEditDialog(selectedContainerForContextMenu);
                setContextMenu(null);
                setSelectedContainerForContextMenu(null);
              }}>
                <ListItemIcon>
                  <EditIcon fontSize="small" />
                </ListItemIcon>
                <ListItemText>Edit</ListItemText>
              </MenuItem>
            ),
            canApprove && (
              <MenuItem key="approve" onClick={() => {
                handleOpenApproveDialog(selectedContainerForContextMenu.budgetId);
                setContextMenu(null);
                setSelectedContainerForContextMenu(null);
              }}>
                <ListItemIcon>
                  <CheckCircleIcon fontSize="small" color="success" />
                </ListItemIcon>
                <ListItemText>Approve</ListItemText>
              </MenuItem>
            )
          ].filter(Boolean);
        })()}
      </Menu>

      {/* Snackbar for notifications */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={handleCloseSnackbar}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert onClose={handleCloseSnackbar} severity={snackbar.severity} sx={{ width: '100%' }}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}

export default BudgetManagementPage;

