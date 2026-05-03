import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Box,
  Container,
  Typography,
  Paper,
  Tabs,
  Tab,
  CircularProgress,
  Alert,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Chip,
  IconButton,
  Tooltip,
  Stack,
  useTheme,
  Grid,
  Card,
  CardMedia,
  CardContent,
  CardActions,
  LinearProgress,
  InputAdornment,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Divider
} from '@mui/material';
import {
  CheckCircle as CheckCircleIcon,
  Cancel as CancelIcon,
  Visibility as VisibilityIcon,
  Public as PublicIcon,
  Edit as EditIcon,
  Info as InfoIcon,
  PhotoLibrary as PhotoLibraryIcon,
  CloudUpload as CloudUploadIcon,
  Search as SearchIcon,
  Close as CloseIcon,
  TrendingUp as TrendingUpIcon,
  Clear as ClearIcon
} from '@mui/icons-material';
import { DataGrid } from '@mui/x-data-grid';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import axiosInstance from '../api/axiosInstance';
import { isAdmin } from '../utils/privilegeUtils.js';

const PublicApprovalManagementPage = () => {
  const theme = useTheme();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, hasPrivilege } = useAuth();
  const [activeTab, setActiveTab] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  
  // Data states
  const [projects, setProjects] = useState([]);
  const [countyProjects, setCountyProjects] = useState([]);
  const [citizenProposals, setCitizenProposals] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  
  // Dialog states
  const [approvalDialogOpen, setApprovalDialogOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [approvalNotes, setApprovalNotes] = useState('');
  const [approvalAction, setApprovalAction] = useState(null); // 'approve', 'reject', or 'request_revision'
  
  // Photo management states
  const [photoModalOpen, setPhotoModalOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [photosLoading, setPhotosLoading] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoDescription, setPhotoDescription] = useState('');
  const photoFileInputRef = useRef(null);

  // Progress update states
  const [progressModalOpen, setProgressModalOpen] = useState(false);
  const [selectedProjectForProgress, setSelectedProjectForProgress] = useState(null);
  const [selectedProgress, setSelectedProgress] = useState(0);
  const [updatingProgress, setUpdatingProgress] = useState(false);

  // Filter and search states
  const [globalSearch, setGlobalSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [approvalStatusFilter, setApprovalStatusFilter] = useState('');
  const [ministryFilter, setMinistryFilter] = useState('');
  const [stateDepartmentFilter, setStateDepartmentFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  
  // Bulk selection state
  const [selectedRows, setSelectedRows] = useState([]);
  const [bulkActionLoading, setBulkActionLoading] = useState(false);
  
  // Metadata for filters
  const [departments, setDepartments] = useState([]);
  const [categories, setCategories] = useState([]);
  const [statuses, setStatuses] = useState([]);

  useEffect(() => {
    fetchAllData();
    fetchFilterMetadata();
  }, []);

  // Deep links from Personal Dashboard (e.g. ?approval=pending | ?approval=revision)
  useEffect(() => {
    const approval = searchParams.get('approval');
    if (approval === 'pending' || approval === 'revision' || approval === 'approved') {
      setApprovalStatusFilter(approval);
    }
  }, [searchParams]);

  const fetchFilterMetadata = async () => {
    try {
      // Fetch departments
      const deptResponse = await axiosInstance.get('/metadata/departments');
      const deptData = Array.isArray(deptResponse.data) ? deptResponse.data : [];
      setDepartments(deptData);

      // Extract unique statuses from projects
      const statusSet = new Set();
      projects.forEach(p => p.status && statusSet.add(p.status));
      countyProjects.forEach(p => p.status && statusSet.add(p.status));
      citizenProposals.forEach(p => p.status && statusSet.add(p.status));
      announcements.forEach(p => p.status && statusSet.add(p.status));
      setStatuses(Array.from(statusSet).sort());

      // Extract unique categories
      const categorySet = new Set();
      projects.forEach(p => p.categoryName && categorySet.add(p.categoryName));
      countyProjects.forEach(p => p.category && categorySet.add(p.category));
      citizenProposals.forEach(p => p.category && categorySet.add(p.category));
      announcements.forEach(p => p.category && categorySet.add(p.category));
      setCategories(Array.from(categorySet).sort());
    } catch (err) {
      console.error('Error fetching filter metadata:', err);
    }
  };

  useEffect(() => {
    // Update metadata when data changes
    if (projects.length > 0 || countyProjects.length > 0 || citizenProposals.length > 0 || announcements.length > 0) {
      fetchFilterMetadata();
    }
  }, [projects, countyProjects, citizenProposals, announcements]);

  const fetchAllData = async () => {
    setLoading(true);
    setError(null);
    try {
      // Only fetch projects for now - other tabs are temporarily disabled
      const projectsRes = await axiosInstance.get('/projects');
      
      // Handle different response structures
      const projectsData = Array.isArray(projectsRes.data?.projects) 
        ? projectsRes.data.projects 
        : Array.isArray(projectsRes.data) 
          ? projectsRes.data 
          : [];
      
      console.log('Fetched projects data:', { 
        projects: projectsData.length
      });
      console.log('Projects data sample:', projectsData.slice(0, 2));
      console.log('Projects response structure:', {
        hasProjects: !!projectsRes.data?.projects,
        isArray: Array.isArray(projectsRes.data),
        dataType: typeof projectsRes.data,
        keys: projectsRes.data ? Object.keys(projectsRes.data) : []
      });
      
      // Normalize approval and revision fields to be 0 or 1 (handle null/undefined/boolean/number)
      const normalizeApproval = (items) => {
        return items.map(item => {
          // Handle approved_for_public - convert boolean, null, undefined, string to 0 or 1
          let approvedForPublic = item.approved_for_public;
          if (approvedForPublic === null || approvedForPublic === undefined || approvedForPublic === '') {
            approvedForPublic = 0;
          } else if (typeof approvedForPublic === 'boolean') {
            approvedForPublic = approvedForPublic ? 1 : 0;
          } else if (typeof approvedForPublic === 'string') {
            approvedForPublic = (approvedForPublic === '1' || approvedForPublic === 'true') ? 1 : 0;
          } else {
            // Handle number (0, 1, or any other number)
            approvedForPublic = approvedForPublic ? 1 : 0;
          }
          
          // Handle revision_requested - convert boolean, null, undefined, string to 0 or 1
          let revisionRequested = item.revision_requested;
          if (revisionRequested === null || revisionRequested === undefined || revisionRequested === '') {
            revisionRequested = 0;
          } else if (typeof revisionRequested === 'boolean') {
            revisionRequested = revisionRequested ? 1 : 0;
          } else if (typeof revisionRequested === 'string') {
            revisionRequested = (revisionRequested === '1' || revisionRequested === 'true') ? 1 : 0;
          } else {
            // Handle number (0, 1, or any other number)
            revisionRequested = revisionRequested ? 1 : 0;
          }
          
          return {
            ...item,
            approved_for_public: approvedForPublic,
            revision_requested: revisionRequested
          };
        });
      };
      
      setProjects(normalizeApproval(projectsData));
      // Set empty arrays for other tabs (temporarily disabled)
      setCountyProjects([]);
      setCitizenProposals([]);
      setAnnouncements([]);
    } catch (err) {
      console.error('Error fetching data:', err);
      console.error('Error response:', err.response);
      console.error('Error response data:', err.response?.data);
      const errorMessage = err.response?.data?.message || err.response?.data?.error || err.message || 'Failed to load data. Please try again.';
      setError(errorMessage);
      // Set empty arrays on error to prevent further issues
      setProjects([]);
      setCountyProjects([]);
      setCitizenProposals([]);
      setAnnouncements([]);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenApprovalDialog = (item, action, type) => {
    setSelectedItem({ ...item, type });
    setApprovalAction(action);
    setApprovalNotes('');
    setApprovalDialogOpen(true);
  };

  const handleCloseApprovalDialog = () => {
    setApprovalDialogOpen(false);
    setSelectedItem(null);
    setApprovalNotes('');
    setApprovalAction(null);
  };

  const handleOpenPhotoModal = async (project) => {
    setSelectedProject(project);
    setPhotoModalOpen(true);
    await fetchProjectPhotos(project.id);
  };

  const handleClosePhotoModal = () => {
    setPhotoModalOpen(false);
    setSelectedProject(null);
    setPhotos([]);
    setPhotoDescription('');
    if (photoFileInputRef.current) {
      photoFileInputRef.current.value = '';
    }
  };

  const normalizeProgressToValidValue = (progress) => {
    if (progress === null || progress === undefined) return 0;
    const validValues = [0, 25, 50, 75, 100];
    // If it's already a valid value, return it
    if (validValues.includes(progress)) return progress;
    // Otherwise, round to nearest valid value
    const numProgress = parseInt(progress) || 0;
    return validValues.reduce((prev, curr) => 
      Math.abs(curr - numProgress) < Math.abs(prev - numProgress) ? curr : prev
    );
  };

  const handleOpenProgressModal = (project) => {
    setSelectedProjectForProgress(project);
    const currentProgress = project.overallProgress || 0;
    // Normalize to nearest valid value for the dropdown
    const normalizedProgress = normalizeProgressToValidValue(currentProgress);
    setSelectedProgress(normalizedProgress);
    setProgressModalOpen(true);
  };

  const handleCloseProgressModal = () => {
    setProgressModalOpen(false);
    setSelectedProjectForProgress(null);
    setSelectedProgress(0);
  };

  const handleUpdateProgress = async () => {
    if (!selectedProjectForProgress) return;

    setUpdatingProgress(true);
    setError(null);
    try {
      console.log('Updating progress:', {
        projectId: selectedProjectForProgress.id,
        projectName: selectedProjectForProgress.projectName,
        currentProgress: selectedProjectForProgress.overallProgress,
        newProgress: selectedProgress
      });
      
      const response = await axiosInstance.put(`/projects/${selectedProjectForProgress.id}/progress`, {
        overallProgress: selectedProgress
      });
      
      console.log('Progress update response:', response.data);
      setSuccess(`Project progress updated to ${selectedProgress}%`);
      handleCloseProgressModal();
      fetchAllData(); // Refresh the projects list
    } catch (err) {
      console.error('Error updating progress:', err);
      setError(err.response?.data?.error || 'Failed to update project progress');
    } finally {
      setUpdatingProgress(false);
    }
  };

  // Helper function to get API base URL for image serving
  // In production, API is on port 3000, frontend can be on port 8080 (nginx) or 5174 (public dashboard)
  const getApiBaseUrl = () => {
    // Check if we have an explicit API URL in env
    const apiUrl = import.meta.env.VITE_API_URL;
    if (apiUrl && !apiUrl.startsWith('/') && apiUrl.includes('://')) {
      // Full URL provided (e.g., http://165.22.227.234:3000/api)
      return apiUrl.replace('/api', '').replace('/public', '');
    }
    // In production, API is on port 3000
    // Frontend can be accessed via:
    // - Port 8080 (nginx proxy for main app)
    // - Port 5174 (public dashboard)
    // Both need to use port 3000 for API/image requests
    const origin = window.location.origin;
    if (origin.includes(':8080') || origin.includes(':5174')) {
      // Production: replace frontend port with 3000 for API
      return origin.replace(/:8080|:5174/, ':3000');
    }
    // Development or same origin (localhost)
    return window.location.origin;
  };

  const fetchProjectPhotos = async (projectId) => {
    setPhotosLoading(true);
    setError(null);
    try {
      const response = await axiosInstance.get(`/projects/${projectId}/photos`);
      const photosData = response.data || [];
      console.log('Fetched photos:', photosData.length, 'photos for project', projectId);
      console.log('All photos data:', photosData);
      if (photosData.length > 0) {
        console.log('First photo filePath:', photosData[0].filePath);
        // Test URL construction
        const apiBaseUrl = getApiBaseUrl();
        const testPath = photosData[0].filePath;
        let testUrl = '';
        if (testPath.startsWith('uploads/')) {
          testUrl = `${apiBaseUrl}/${testPath}`;
        } else {
          testUrl = `${apiBaseUrl}/uploads/${testPath}`;
        }
        console.log('Constructed test URL:', testUrl, 'API Base URL:', apiBaseUrl);
      }
      setPhotos(photosData);
    } catch (err) {
      console.error('Error fetching photos:', err);
      setError(err.response?.data?.message || 'Failed to load photos');
      setPhotos([]);
    } finally {
      setPhotosLoading(false);
    }
  };

  const handleApprovePhoto = async (photoId, approved) => {
    try {
      await axiosInstance.put(`/project_photos/${photoId}/approval`, {
        approved_for_public: approved,
        approved_by: user?.userId,
        approved_at: new Date().toISOString()
      });
      setSuccess(`Photo ${approved ? 'approved' : 'revoked'} successfully!`);
      await fetchProjectPhotos(selectedProject.id);
    } catch (err) {
      console.error('Error updating photo approval:', err);
      setError(err.response?.data?.error || 'Failed to update photo approval');
    }
  };

  const handleUploadPhoto = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Please select an image file');
      return;
    }

    setUploadingPhoto(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('description', photoDescription.trim() || `Photo for ${selectedProject.projectName}`);

      await axiosInstance.post(`/projects/${selectedProject.id}/photos`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      setSuccess('Photo uploaded successfully!');
      setPhotoDescription('');
      await fetchProjectPhotos(selectedProject.id);
      if (photoFileInputRef.current) {
        photoFileInputRef.current.value = '';
      }
    } catch (err) {
      console.error('Error uploading photo:', err);
      setError(err.response?.data?.message || 'Failed to upload photo');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleApproveReject = async () => {
    if (!selectedItem) return;
    
    setLoading(true);
    setError(null);
    try {
      const endpoint = getEndpointForType(selectedItem.type);
      const isApproved = approvalAction === 'approve';
      const isRevisionRequest = approvalAction === 'request_revision';
      
      // Use the correct endpoint format
      const approvalEndpoint = endpoint === '/citizen-proposals' 
        ? `/citizen-proposals/${selectedItem.id}/approval`
        : endpoint === '/projects'
        ? `/projects/${selectedItem.id}/approval`
        : `${endpoint}/${selectedItem.id}/approval`;
      
      const requestData = isRevisionRequest ? {
        revision_requested: true,
        revision_notes: approvalNotes,
        revision_requested_by: user?.userId,
        revision_requested_at: new Date().toISOString(),
        approved_for_public: false // Reset approval when revision is requested
      } : {
        approved_for_public: isApproved,
        approval_notes: approvalNotes,
        approved_by: user?.userId,
        approved_at: new Date().toISOString(),
        revision_requested: false // Clear revision request if approving/rejecting
      };
      
      const response = await axiosInstance.put(approvalEndpoint, requestData);
      
      const actionText = isRevisionRequest 
        ? 'revision requested' 
        : isApproved 
          ? 'approved' 
          : 'rejected';
      setSuccess(`${selectedItem.type} ${actionText} successfully!`);
      handleCloseApprovalDialog();
      // Refresh data but preserve filters (filters are in state, so they persist)
      await fetchAllData();
    } catch (err) {
      console.error('Error updating approval:', err);
      setError(err.response?.data?.error || 'Failed to update approval status.');
    } finally {
      setLoading(false);
    }
  };

  // Bulk approval handler
  const handleBulkApprove = async (action) => {
    if (selectedRows.length === 0) {
      setError(`Please select at least one item to ${action === 'approve' ? 'approve' : 'revoke'}`);
      return;
    }

    // Filter selected rows to only include items that can be processed
    const itemsToProcess = filterData.filter(item => {
      if (selectedRows.includes(item.id)) {
        if (action === 'approve') {
          // Only approve items that are not already approved
          return !(item.approved_for_public === 1 || item.approved_for_public === true);
        } else if (action === 'revoke') {
          // Only revoke items that are approved
          return (item.approved_for_public === 1 || item.approved_for_public === true);
        }
        return true;
      }
      return false;
    });

    if (itemsToProcess.length === 0) {
      const actionText = action === 'approve' ? 'approval' : 'revocation';
      const statusText = action === 'approve' ? 'approved' : 'not approved';
      setError(`No items available for ${actionText}. Selected items may already be ${statusText}.`);
      return;
    }

    setBulkActionLoading(true);
    setError(null);

    try {
      // Get the type based on active tab
      const itemType = getTypeFromActiveTab();
      const promises = itemsToProcess.map(item => {
        const endpoint = getEndpointForType(itemType);
        const approvalEndpoint = endpoint === '/citizen-proposals' 
          ? `/citizen-proposals/${item.id}/approval`
          : endpoint === '/projects'
          ? `/projects/${item.id}/approval`
          : `${endpoint}/${item.id}/approval`;
        
        const requestData = {
          approved_for_public: action === 'approve',
          approval_notes: `Bulk ${action === 'approve' ? 'approved' : 'revoked'} by ${user?.username || user?.email || 'admin'}`,
          approved_by: user?.userId,
          approved_at: new Date().toISOString(),
          revision_requested: false
        };

        return axiosInstance.put(approvalEndpoint, requestData);
      });

      await Promise.all(promises);
      const actionText = action === 'approve' ? 'approved' : 'revoked';
      setSuccess(`${itemsToProcess.length} item(s) ${actionText} successfully!`);
      setSelectedRows([]); // Clear selection
      // Refresh data but preserve filters (filters are in state, so they persist)
      await fetchAllData();
    } catch (err) {
      console.error('Error in bulk approval:', err);
      const actionText = action === 'approve' ? 'approve' : 'revoke';
      setError(err.response?.data?.error || `Failed to ${actionText} items. Some items may have been processed.`);
    } finally {
      setBulkActionLoading(false);
    }
  };

  // Helper to get type from active tab
  const getTypeFromActiveTab = () => {
    switch (activeTab) {
      case 0:
        return 'project';
      case 1:
        return 'county_project';
      case 2:
        return 'citizen_proposal';
      case 3:
        return 'announcement';
      default:
        return 'project';
    }
  };

  const getEndpointForType = (type) => {
    switch (type) {
      case 'project':
        return '/projects';
      case 'county_project':
        return '/county-proposed-projects';
      case 'citizen_proposal':
        return '/citizen-proposals';
      case 'announcement':
        return '/project-announcements';
      default:
        return '';
    }
  };

  const getApprovalStatusChip = (item) => {
    // Handle both boolean and numeric (0/1) values from database
    const isApproved = item.approved_for_public === 1 || item.approved_for_public === true;
    const needsRevision = item.revision_requested === 1 || item.revision_requested === true;
    
    if (isApproved) {
      return (
        <Chip 
          label="Approved" 
          color="success" 
          size="small" 
          icon={<CheckCircleIcon sx={{ fontSize: 14 }} />}
          sx={{ 
            height: 22, 
            fontSize: '0.7rem',
            fontWeight: 600,
            '& .MuiChip-icon': { fontSize: 14 }
          }} 
        />
      );
    }
    if (needsRevision) {
      return (
        <Chip 
          label="Revision" 
          color="warning" 
          size="small" 
          icon={<CancelIcon sx={{ fontSize: 14 }} />}
          sx={{ 
            height: 22, 
            fontSize: '0.7rem',
            fontWeight: 600,
            '& .MuiChip-icon': { fontSize: 14 }
          }} 
        />
      );
    }
    return (
      <Chip 
        label="Pending" 
        color="default" 
        size="small" 
        sx={{ 
          height: 22, 
          fontSize: '0.7rem',
          fontWeight: 500,
          backgroundColor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'
        }} 
      />
    );
  };

  // Helper to get status chip color
  const getStatusChip = (status) => {
    if (!status) return null;
    const statusLower = status.toLowerCase();
    let color = 'default';
    if (statusLower.includes('completed') || statusLower.includes('complete')) {
      color = 'success';
    } else if (statusLower.includes('ongoing') || statusLower.includes('progress')) {
      color = 'primary';
    } else if (statusLower.includes('stalled') || statusLower.includes('delayed')) {
      color = 'error';
    } else if (statusLower.includes('not started') || statusLower.includes('pending')) {
      color = 'warning';
    }
    return (
      <Chip 
        label={status} 
        color={color} 
        size="small" 
        sx={{ 
          height: 22, 
          fontSize: '0.7rem',
          fontWeight: 500,
          '& .MuiChip-label': { px: 1 }
        }} 
      />
    );
  };

  // Projects columns (for Projects Gallery)
  const projectsColumns = [
    { 
      field: 'id', 
      headerName: 'ID', 
      width: 70,
      headerAlign: 'center',
      align: 'center',
      renderCell: (params) => (
        <Typography variant="body2" sx={{ fontSize: '0.85rem', fontWeight: 600, color: 'text.secondary' }}>
          {params.value}
        </Typography>
      )
    },
    { 
      field: 'projectName', 
      headerName: 'Project Name', 
      flex: 2, 
      minWidth: 200,
      renderCell: (params) => (
        <Typography 
          variant="body2" 
          sx={{ 
            fontSize: '0.9rem',
            fontWeight: 500,
            color: 'text.primary',
            whiteSpace: 'normal',
            wordBreak: 'break-word',
            lineHeight: 1.4
          }}
        >
          {params.value}
        </Typography>
      )
    },
    { 
      field: 'status', 
      headerName: 'Status', 
      width: 120,
      renderCell: (params) => getStatusChip(params.value)
    },
    { 
      field: 'ministry', 
      headerName: 'Ministry', 
      width: 140,
      renderCell: (params) => (
        <Typography 
          variant="caption" 
          sx={{ 
            fontSize: '0.8rem', 
            color: 'text.secondary',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }}
          title={params.value || params.row.departmentName}
        >
          {params.value || params.row.departmentName || '-'}
        </Typography>
      )
    },
    { 
      field: 'stateDepartment', 
      headerName: 'State Department', 
      width: 140,
      renderCell: (params) => (
        <Typography 
          variant="caption" 
          sx={{ 
            fontSize: '0.8rem', 
            color: 'text.secondary',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }}
          title={params.value}
        >
          {params.value || '-'}
        </Typography>
      )
    },
    {
      field: 'approved_for_public',
      headerName: 'Public',
      width: 100,
      headerAlign: 'center',
      align: 'center',
      renderCell: (params) => getApprovalStatusChip(params.row)
    },
    {
      field: 'actions',
      headerName: 'Actions',
      width: 180,
      sortable: false,
      headerAlign: 'center',
      align: 'center',
      renderCell: (params) => {
        const isApproved = params.row.approved_for_public === 1 || params.row.approved_for_public === true;
        const needsRevision = params.row.revision_requested === 1 || params.row.revision_requested === true;
        return (
          <Stack direction="row" spacing={0.25} sx={{ justifyContent: 'center' }}>
            {!isApproved && (
              <>
                <Tooltip title="Approve">
                  <IconButton
                    color="success"
                    size="small"
                    onClick={() => handleOpenApprovalDialog(params.row, 'approve', 'project')}
                    sx={{ 
                      p: 0.5,
                      '&:hover': {
                        backgroundColor: 'rgba(76, 175, 80, 0.1)',
                        transform: 'scale(1.1)'
                      },
                      transition: 'all 0.2s ease'
                    }}
                  >
                    <CheckCircleIcon sx={{ fontSize: 18 }} />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Request Revision">
                  <IconButton
                    color="warning"
                    size="small"
                    onClick={() => handleOpenApprovalDialog(params.row, 'request_revision', 'project')}
                    sx={{ 
                      p: 0.5,
                      '&:hover': {
                        backgroundColor: 'rgba(255, 152, 0, 0.1)',
                        transform: 'scale(1.1)'
                      },
                      transition: 'all 0.2s ease'
                    }}
                  >
                    <EditIcon sx={{ fontSize: 18 }} />
                  </IconButton>
                </Tooltip>
              </>
            )}
            {isApproved && (
              <Tooltip title="Revoke">
                <IconButton
                  color="error"
                  size="small"
                  onClick={() => handleOpenApprovalDialog(params.row, 'reject', 'project')}
                  sx={{ 
                    p: 0.5,
                    '&:hover': {
                      backgroundColor: 'rgba(244, 67, 54, 0.1)',
                      transform: 'scale(1.1)'
                    },
                    transition: 'all 0.2s ease'
                  }}
                >
                  <CancelIcon sx={{ fontSize: 18 }} />
                </IconButton>
              </Tooltip>
            )}
            {(isApproved || needsRevision) && (
              <Tooltip title={isApproved ? "View Approval Notes" : "View Revision Notes"}>
                <IconButton
                  color="info"
                  size="small"
                  onClick={() => handleOpenApprovalDialog(params.row, isApproved ? 'view_approval' : 'view_revision', 'project')}
                  sx={{ 
                    p: 0.5,
                    '&:hover': {
                      backgroundColor: 'rgba(33, 150, 243, 0.1)',
                      transform: 'scale(1.1)'
                    },
                    transition: 'all 0.2s ease'
                  }}
                >
                  <InfoIcon sx={{ fontSize: 18 }} />
                </IconButton>
              </Tooltip>
            )}
            <Tooltip title="Photos">
              <IconButton
                color="primary"
                size="small"
                onClick={() => handleOpenPhotoModal(params.row)}
                sx={{ 
                  p: 0.5,
                  '&:hover': {
                    backgroundColor: 'rgba(25, 118, 210, 0.1)',
                    transform: 'scale(1.1)'
                  },
                  transition: 'all 0.2s ease'
                }}
              >
                <PhotoLibraryIcon sx={{ fontSize: 18 }} />
              </IconButton>
            </Tooltip>
            <Tooltip title="Progress">
              <IconButton
                color="secondary"
                size="small"
                onClick={() => handleOpenProgressModal(params.row)}
                sx={{ 
                  p: 0.5,
                  '&:hover': {
                    backgroundColor: 'rgba(156, 39, 176, 0.1)',
                    transform: 'scale(1.1)'
                  },
                  transition: 'all 0.2s ease'
                }}
              >
                <TrendingUpIcon sx={{ fontSize: 18 }} />
              </IconButton>
            </Tooltip>
            <Tooltip title="View">
              <IconButton
                color="info"
                size="small"
                onClick={() => navigate(`/projects/${params.row.id}`)}
                sx={{ 
                  p: 0.5,
                  '&:hover': {
                    backgroundColor: 'rgba(33, 150, 243, 0.1)',
                    transform: 'scale(1.1)'
                  },
                  transition: 'all 0.2s ease'
                }}
              >
                <VisibilityIcon sx={{ fontSize: 18 }} />
              </IconButton>
            </Tooltip>
          </Stack>
        );
      }
    }
  ];

  // County Projects columns
  const countyProjectsColumns = [
    { 
      field: 'id', 
      headerName: 'ID', 
      width: 70,
      headerAlign: 'center',
      align: 'center',
      renderCell: (params) => (
        <Typography variant="body2" sx={{ fontSize: '0.85rem', fontWeight: 600, color: 'text.secondary' }}>
          {params.value}
        </Typography>
      )
    },
    { 
      field: 'title', 
      headerName: 'Title', 
      flex: 2, 
      minWidth: 300,
      renderCell: (params) => (
        <Typography 
          variant="body2" 
          sx={{ 
            fontSize: '0.9rem',
            fontWeight: 500,
            color: 'text.primary',
            whiteSpace: 'normal',
            wordBreak: 'break-word',
            lineHeight: 1.4
          }}
        >
          {params.value}
        </Typography>
      )
    },
    { 
      field: 'category', 
      headerName: 'Category', 
      width: 130,
      renderCell: (params) => (
        <Typography variant="caption" sx={{ fontSize: '0.8rem', color: 'text.secondary' }}>
          {params.value || '-'}
        </Typography>
      )
    },
    { 
      field: 'status', 
      headerName: 'Status', 
      width: 140,
      renderCell: (params) => getStatusChip(params.value)
    },
    {
      field: 'approved_for_public',
      headerName: 'Public',
      width: 120,
      headerAlign: 'center',
      align: 'center',
      renderCell: (params) => getApprovalStatusChip(params.row)
    },
    {
      field: 'actions',
      headerName: 'Actions',
      width: 160,
      sortable: false,
      headerAlign: 'center',
      align: 'center',
      renderCell: (params) => {
        const isApproved = params.row.approved_for_public === 1 || params.row.approved_for_public === true;
        const needsRevision = params.row.revision_requested === 1 || params.row.revision_requested === true;
        return (
          <Stack direction="row" spacing={0.25} sx={{ justifyContent: 'center' }}>
            {!isApproved && (
              <>
                <Tooltip title="Approve">
                  <IconButton
                    color="success"
                    size="small"
                    onClick={() => handleOpenApprovalDialog(params.row, 'approve', 'county_project')}
                    sx={{ 
                      p: 0.5,
                      '&:hover': {
                        backgroundColor: 'rgba(76, 175, 80, 0.1)',
                        transform: 'scale(1.1)'
                      },
                      transition: 'all 0.2s ease'
                    }}
                  >
                    <CheckCircleIcon sx={{ fontSize: 18 }} />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Request Revision">
                  <IconButton
                    color="warning"
                    size="small"
                    onClick={() => handleOpenApprovalDialog(params.row, 'request_revision', 'county_project')}
                    sx={{ 
                      p: 0.5,
                      '&:hover': {
                        backgroundColor: 'rgba(255, 152, 0, 0.1)',
                        transform: 'scale(1.1)'
                      },
                      transition: 'all 0.2s ease'
                    }}
                  >
                    <EditIcon sx={{ fontSize: 18 }} />
                  </IconButton>
                </Tooltip>
              </>
            )}
            {isApproved && (
              <Tooltip title="Revoke">
                <IconButton
                  color="error"
                  size="small"
                  onClick={() => handleOpenApprovalDialog(params.row, 'reject', 'county_project')}
                  sx={{ 
                    p: 0.5,
                    '&:hover': {
                      backgroundColor: 'rgba(244, 67, 54, 0.1)',
                      transform: 'scale(1.1)'
                    },
                    transition: 'all 0.2s ease'
                  }}
                >
                  <CancelIcon sx={{ fontSize: 18 }} />
                </IconButton>
              </Tooltip>
            )}
            {(isApproved || needsRevision) && (
              <Tooltip title={isApproved ? "View Approval Notes" : "View Revision Notes"}>
                <IconButton
                  color="info"
                  size="small"
                  onClick={() => handleOpenApprovalDialog(params.row, isApproved ? 'view_approval' : 'view_revision', 'county_project')}
                  sx={{ 
                    p: 0.5,
                    '&:hover': {
                      backgroundColor: 'rgba(33, 150, 243, 0.1)',
                      transform: 'scale(1.1)'
                    },
                    transition: 'all 0.2s ease'
                  }}
                >
                  <InfoIcon sx={{ fontSize: 18 }} />
                </IconButton>
              </Tooltip>
            )}
          </Stack>
        );
      }
    }
  ];

  // Citizen Proposals columns
  const citizenProposalsColumns = [
    { 
      field: 'id', 
      headerName: 'ID', 
      width: 70,
      headerAlign: 'center',
      align: 'center',
      renderCell: (params) => (
        <Typography variant="body2" sx={{ fontSize: '0.85rem', fontWeight: 600, color: 'text.secondary' }}>
          {params.value}
        </Typography>
      )
    },
    { 
      field: 'title', 
      headerName: 'Title', 
      flex: 2, 
      minWidth: 300,
      renderCell: (params) => (
        <Typography 
          variant="body2" 
          sx={{ 
            fontSize: '0.9rem',
            fontWeight: 500,
            color: 'text.primary',
            whiteSpace: 'normal',
            wordBreak: 'break-word',
            lineHeight: 1.4
          }}
        >
          {params.value}
        </Typography>
      )
    },
    { 
      field: 'category', 
      headerName: 'Category', 
      width: 130,
      renderCell: (params) => (
        <Typography variant="caption" sx={{ fontSize: '0.8rem', color: 'text.secondary' }}>
          {params.value || '-'}
        </Typography>
      )
    },
    { 
      field: 'proposer_name', 
      headerName: 'Proposer', 
      width: 140,
      renderCell: (params) => (
        <Typography variant="caption" sx={{ fontSize: '0.8rem', color: 'text.secondary' }}>
          {params.value || '-'}
        </Typography>
      )
    },
    { 
      field: 'status', 
      headerName: 'Status', 
      width: 140,
      renderCell: (params) => getStatusChip(params.value)
    },
    {
      field: 'approved_for_public',
      headerName: 'Public',
      width: 120,
      headerAlign: 'center',
      align: 'center',
      renderCell: (params) => getApprovalStatusChip(params.row)
    },
    {
      field: 'actions',
      headerName: 'Actions',
      width: 160,
      sortable: false,
      headerAlign: 'center',
      align: 'center',
      renderCell: (params) => {
        const isApproved = params.row.approved_for_public === 1 || params.row.approved_for_public === true;
        const needsRevision = params.row.revision_requested === 1 || params.row.revision_requested === true;
        return (
          <Stack direction="row" spacing={0.25} sx={{ justifyContent: 'center' }}>
            {!isApproved && (
              <>
                <Tooltip title="Approve">
                  <IconButton
                    color="success"
                    size="small"
                    onClick={() => handleOpenApprovalDialog(params.row, 'approve', 'citizen_proposal')}
                    sx={{ 
                      p: 0.5,
                      '&:hover': {
                        backgroundColor: 'rgba(76, 175, 80, 0.1)',
                        transform: 'scale(1.1)'
                      },
                      transition: 'all 0.2s ease'
                    }}
                  >
                    <CheckCircleIcon sx={{ fontSize: 18 }} />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Request Revision">
                  <IconButton
                    color="warning"
                    size="small"
                    onClick={() => handleOpenApprovalDialog(params.row, 'request_revision', 'citizen_proposal')}
                    sx={{ 
                      p: 0.5,
                      '&:hover': {
                        backgroundColor: 'rgba(255, 152, 0, 0.1)',
                        transform: 'scale(1.1)'
                      },
                      transition: 'all 0.2s ease'
                    }}
                  >
                    <EditIcon sx={{ fontSize: 18 }} />
                  </IconButton>
                </Tooltip>
              </>
            )}
            {isApproved && (
              <Tooltip title="Revoke">
                <IconButton
                  color="error"
                  size="small"
                  onClick={() => handleOpenApprovalDialog(params.row, 'reject', 'citizen_proposal')}
                  sx={{ 
                    p: 0.5,
                    '&:hover': {
                      backgroundColor: 'rgba(244, 67, 54, 0.1)',
                      transform: 'scale(1.1)'
                    },
                    transition: 'all 0.2s ease'
                  }}
                >
                  <CancelIcon sx={{ fontSize: 18 }} />
                </IconButton>
              </Tooltip>
            )}
            {needsRevision && (
              <Tooltip title="Revision Notes">
                <IconButton
                  color="info"
                  size="small"
                  onClick={() => handleOpenApprovalDialog(params.row, 'view_revision', 'citizen_proposal')}
                  sx={{ 
                    p: 0.5,
                    '&:hover': {
                      backgroundColor: 'rgba(33, 150, 243, 0.1)',
                      transform: 'scale(1.1)'
                    },
                    transition: 'all 0.2s ease'
                  }}
                >
                  <InfoIcon sx={{ fontSize: 18 }} />
                </IconButton>
              </Tooltip>
            )}
          </Stack>
        );
      }
    }
  ];

  // Announcements columns
  const announcementsColumns = [
    { 
      field: 'id', 
      headerName: 'ID', 
      width: 70,
      headerAlign: 'center',
      align: 'center',
      renderCell: (params) => (
        <Typography variant="body2" sx={{ fontSize: '0.85rem', fontWeight: 600, color: 'text.secondary' }}>
          {params.value}
        </Typography>
      )
    },
    { 
      field: 'title', 
      headerName: 'Title', 
      flex: 2, 
      minWidth: 300,
      renderCell: (params) => (
        <Typography 
          variant="body2" 
          sx={{ 
            fontSize: '0.9rem',
            fontWeight: 500,
            color: 'text.primary',
            whiteSpace: 'normal',
            wordBreak: 'break-word',
            lineHeight: 1.4
          }}
        >
          {params.value}
        </Typography>
      )
    },
    { 
      field: 'category', 
      headerName: 'Category', 
      width: 130,
      renderCell: (params) => (
        <Typography variant="caption" sx={{ fontSize: '0.8rem', color: 'text.secondary' }}>
          {params.value || '-'}
        </Typography>
      )
    },
    { 
      field: 'date', 
      headerName: 'Date', 
      width: 110,
      renderCell: (params) => (
        <Typography variant="caption" sx={{ fontSize: '0.8rem', color: 'text.secondary' }}>
          {params.value ? new Date(params.value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '-'}
        </Typography>
      )
    },
    { 
      field: 'status', 
      headerName: 'Status', 
      width: 140,
      renderCell: (params) => getStatusChip(params.value)
    },
    {
      field: 'approved_for_public',
      headerName: 'Public',
      width: 120,
      headerAlign: 'center',
      align: 'center',
      renderCell: (params) => getApprovalStatusChip(params.row)
    },
    {
      field: 'actions',
      headerName: 'Actions',
      width: 160,
      sortable: false,
      headerAlign: 'center',
      align: 'center',
      renderCell: (params) => {
        const isApproved = params.row.approved_for_public === 1 || params.row.approved_for_public === true;
        const needsRevision = params.row.revision_requested === 1 || params.row.revision_requested === true;
        return (
          <Stack direction="row" spacing={0.25} sx={{ justifyContent: 'center' }}>
            {!isApproved && (
              <>
                <Tooltip title="Approve">
                  <IconButton
                    color="success"
                    size="small"
                    onClick={() => handleOpenApprovalDialog(params.row, 'approve', 'announcement')}
                    sx={{ 
                      p: 0.5,
                      '&:hover': {
                        backgroundColor: 'rgba(76, 175, 80, 0.1)',
                        transform: 'scale(1.1)'
                      },
                      transition: 'all 0.2s ease'
                    }}
                  >
                    <CheckCircleIcon sx={{ fontSize: 18 }} />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Request Revision">
                  <IconButton
                    color="warning"
                    size="small"
                    onClick={() => handleOpenApprovalDialog(params.row, 'request_revision', 'announcement')}
                    sx={{ 
                      p: 0.5,
                      '&:hover': {
                        backgroundColor: 'rgba(255, 152, 0, 0.1)',
                        transform: 'scale(1.1)'
                      },
                      transition: 'all 0.2s ease'
                    }}
                  >
                    <EditIcon sx={{ fontSize: 18 }} />
                  </IconButton>
                </Tooltip>
              </>
            )}
            {isApproved && (
              <Tooltip title="Revoke">
                <IconButton
                  color="error"
                  size="small"
                  onClick={() => handleOpenApprovalDialog(params.row, 'reject', 'announcement')}
                  sx={{ 
                    p: 0.5,
                    '&:hover': {
                      backgroundColor: 'rgba(244, 67, 54, 0.1)',
                      transform: 'scale(1.1)'
                    },
                    transition: 'all 0.2s ease'
                  }}
                >
                  <CancelIcon sx={{ fontSize: 18 }} />
                </IconButton>
              </Tooltip>
            )}
            {needsRevision && (
              <Tooltip title="Revision Notes">
                <IconButton
                  color="info"
                  size="small"
                  onClick={() => handleOpenApprovalDialog(params.row, 'view_revision', 'announcement')}
                  sx={{ 
                    p: 0.5,
                    '&:hover': {
                      backgroundColor: 'rgba(33, 150, 243, 0.1)',
                      transform: 'scale(1.1)'
                    },
                    transition: 'all 0.2s ease'
                  }}
                >
                  <InfoIcon sx={{ fontSize: 18 }} />
                </IconButton>
              </Tooltip>
            )}
          </Stack>
        );
      }
    }
  ];

  // Filter data based on search and filters - only Projects tab is enabled
  const filterData = useMemo(() => {
    // Only use projects data since other tabs are temporarily disabled
    let data = projects;

    // Apply global search
    if (globalSearch.trim()) {
      const query = globalSearch.toLowerCase().trim();
      data = data.filter(item => {
        const searchableFields = [
          item.projectName || item.title || '',
          item.id?.toString() || '',
          item.description || '',
          item.ministry || item.departmentName || item.department || '',
          item.stateDepartment || item.state_department || '',
          item.categoryName || item.category || '',
          item.status || '',
          item.proposer_name || '',
        ];
        return searchableFields.some(field => 
          field.toLowerCase().includes(query)
        );
      });
    }

    // Apply status filter
    if (statusFilter) {
      data = data.filter(item => item.status === statusFilter);
    }

    // Apply approval status filter
    if (approvalStatusFilter) {
      if (approvalStatusFilter === 'approved') {
        data = data.filter(item => item.approved_for_public === 1 || item.approved_for_public === true);
      } else if (approvalStatusFilter === 'pending') {
        data = data.filter(item => 
          (item.approved_for_public === 0 || item.approved_for_public === false) &&
          (item.revision_requested === 0 || item.revision_requested === false)
        );
      } else if (approvalStatusFilter === 'revision') {
        data = data.filter(item => item.revision_requested === 1 || item.revision_requested === true);
      }
    }

    // Apply ministry filter
    if (ministryFilter) {
      data = data.filter(item => {
        const ministryName = item.ministry || item.departmentName || item.department || '';
        return ministryName === ministryFilter;
      });
    }

    // Apply state department filter
    if (stateDepartmentFilter) {
      data = data.filter(item => {
        const stateDeptName = item.stateDepartment || item.state_department || '';
        return stateDeptName === stateDepartmentFilter;
      });
    }

    // Apply category filter
    if (categoryFilter) {
      data = data.filter(item => {
        const catName = item.categoryName || item.category || '';
        return catName === categoryFilter;
      });
    }

    return data;
  }, [projects, globalSearch, statusFilter, approvalStatusFilter, ministryFilter, stateDepartmentFilter, categoryFilter]);

  const getCurrentData = () => {
    // Only Projects tab is enabled - other tabs temporarily disabled
    return { data: filterData, columns: projectsColumns, title: 'Projects (Gallery)' };
  };

  const currentData = getCurrentData();

  const hasActiveFilters = globalSearch.trim() || statusFilter || approvalStatusFilter || ministryFilter || stateDepartmentFilter || categoryFilter;

  const handleClearFilters = () => {
    setGlobalSearch('');
    setStatusFilter('');
    setApprovalStatusFilter('');
    setMinistryFilter('');
    setStateDepartmentFilter('');
    setCategoryFilter('');
  };

  if (!hasPrivilege('public_content.approve') && !isAdmin(user)) {
    return (
      <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
        <Alert severity="error">You don't have permission to access this page.</Alert>
      </Container>
    );
  }

  return (
    <Container maxWidth="xl" sx={{ mt: 2, mb: 2 }}>
      <Box sx={{ mb: 1.5 }}>
        <Typography variant="h5" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
          <PublicIcon sx={{ fontSize: 24 }} />
          Public Content Approval
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Review and approve content for public viewing on the public-facing website
        </Typography>
      </Box>

      {error && (
        <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 1.5, py: 0.5 }}>
          {error}
        </Alert>
      )}

      {success && (
        <Alert severity="success" onClose={() => setSuccess(null)} sx={{ mb: 1.5, py: 0.5 }}>
          {success}
        </Alert>
      )}

      <Paper 
        sx={{ 
          width: '100%',
          boxShadow: theme.palette.mode === 'dark' 
            ? '0 2px 8px rgba(0,0,0,0.3)' 
            : '0 2px 8px rgba(0,0,0,0.08)',
          borderRadius: 2,
          overflow: 'hidden'
        }}
      >
        <Tabs
          value={0}
          onChange={(e, newValue) => {
            // Only allow Projects tab (index 0) - other tabs temporarily disabled
            if (newValue === 0) {
              setActiveTab(newValue);
              setSelectedRows([]);
            }
          }}
          sx={{ 
            borderBottom: 1, 
            borderColor: 'divider', 
            minHeight: 40,
            backgroundColor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.02)' : '#fafafa',
            '& .MuiTab-root': {
              textTransform: 'none',
              fontWeight: 500,
              minHeight: 40,
              '&.Mui-selected': {
                color: theme.palette.primary.main,
                fontWeight: 600,
              }
            }
          }}
          variant="scrollable"
          scrollButtons="auto"
        >
          <Tab 
            label={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <span style={{ fontSize: '0.875rem' }}>Projects</span>
                <Chip 
                  label={hasActiveFilters ? filterData.length : projects.length} 
                  size="small" 
                  color={hasActiveFilters ? "primary" : "default"}
                  sx={{ height: '18px', fontSize: '0.65rem', minWidth: '24px' }}
                />
              </Box>
            }
            sx={{ minHeight: 40, py: 1 }}
          />
          {/* Temporarily disabled tabs - uncomment when needed */}
          {/* <Tab 
            label={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <span style={{ fontSize: '0.875rem' }}>County</span>
                <Chip 
                  label={activeTab === 1 && hasActiveFilters ? filterData.length : countyProjects.length} 
                  size="small" 
                  color={activeTab === 1 && hasActiveFilters ? "primary" : "default"}
                  sx={{ height: '18px', fontSize: '0.65rem', minWidth: '24px' }}
                />
              </Box>
            }
            sx={{ minHeight: 40, py: 1 }}
            disabled
          />
          <Tab 
            label={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <span style={{ fontSize: '0.875rem' }}>Proposals</span>
                <Chip 
                  label={activeTab === 2 && hasActiveFilters ? filterData.length : citizenProposals.length} 
                  size="small" 
                  color={activeTab === 2 && hasActiveFilters ? "primary" : "default"}
                  sx={{ height: '18px', fontSize: '0.65rem', minWidth: '24px' }}
                />
              </Box>
            }
            sx={{ minHeight: 40, py: 1 }}
            disabled
          />
          <Tab 
            label={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <span style={{ fontSize: '0.875rem' }}>Announcements</span>
                <Chip 
                  label={activeTab === 3 && hasActiveFilters ? filterData.length : announcements.length} 
                  size="small" 
                  color={activeTab === 3 && hasActiveFilters ? "primary" : "default"}
                  sx={{ height: '18px', fontSize: '0.65rem', minWidth: '24px' }}
                />
              </Box>
            }
            sx={{ minHeight: 40, py: 1 }}
            disabled
          /> */}
        </Tabs>

        <Box sx={{ p: 2 }}>
          {/* Global Search and Filters - Only show for Projects tab (activeTab === 0) */}
          {activeTab === 0 && (
            <Paper 
              elevation={1}
              sx={{ 
                mb: 1.5, 
                borderRadius: 2, 
                p: 0.75
              }}
            >
              <Grid container spacing={0.75} alignItems="center">
                {/* Global Search */}
                <Grid item xs={12} sm={6} md={3}>
                  <TextField
                    fullWidth
                    size="small"
                    placeholder="Search projects..."
                    value={globalSearch}
                    onChange={(e) => setGlobalSearch(e.target.value)}
                    sx={{ 
                      '& .MuiOutlinedInput-root': { 
                        height: '32px',
                        fontSize: '0.8125rem'
                      } 
                    }}
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start">
                          <SearchIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
                        </InputAdornment>
                      ),
                      endAdornment: globalSearch && (
                        <InputAdornment position="end">
                          <IconButton
                            size="small"
                            onClick={() => setGlobalSearch('')}
                            edge="end"
                            sx={{ fontSize: 14 }}
                          >
                            <ClearIcon sx={{ fontSize: 14 }} />
                          </IconButton>
                        </InputAdornment>
                      ),
                    }}
                  />
                </Grid>

                {/* Approval Status Filter */}
                <Grid item xs={6} sm={3} md={2}>
                  <FormControl fullWidth size="small" sx={{ minWidth: 120 }}>
                    <InputLabel id="approval-status-label" sx={{ fontSize: '0.8125rem' }}>Approval</InputLabel>
                    <Select
                      labelId="approval-status-label"
                      value={approvalStatusFilter}
                      onChange={(e) => setApprovalStatusFilter(e.target.value)}
                      label="Approval"
                      sx={{ 
                        height: '32px', 
                        fontSize: '0.8125rem',
                        '& .MuiSelect-select': {
                          py: 0.5
                        }
                      }}
                    >
                      <MenuItem value="" sx={{ fontSize: '0.8125rem' }}>All</MenuItem>
                      <MenuItem value="pending" sx={{ fontSize: '0.8125rem' }}>Pending</MenuItem>
                      <MenuItem value="approved" sx={{ fontSize: '0.8125rem' }}>Approved</MenuItem>
                      <MenuItem value="revision" sx={{ fontSize: '0.8125rem' }}>Revision</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>

                {/* Status Filter */}
                <Grid item xs={6} sm={3} md={2}>
                  <FormControl fullWidth size="small" sx={{ minWidth: 120 }}>
                    <InputLabel id="status-label" sx={{ fontSize: '0.8125rem' }}>Status</InputLabel>
                    <Select
                      labelId="status-label"
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value)}
                      label="Status"
                      sx={{ 
                        height: '32px', 
                        fontSize: '0.8125rem',
                        '& .MuiSelect-select': {
                          py: 0.5
                        }
                      }}
                      disabled={statuses.length === 0}
                    >
                      <MenuItem value="" sx={{ fontSize: '0.8125rem' }}>All</MenuItem>
                      {statuses.map(status => (
                        <MenuItem key={status} value={status} sx={{ fontSize: '0.8125rem' }}>{status}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>

                {/* Ministry Filter */}
                <Grid item xs={6} sm={3} md={2}>
                  <FormControl fullWidth size="small" sx={{ minWidth: 140 }}>
                    <InputLabel id="ministry-label" sx={{ fontSize: '0.8125rem' }}>Ministry</InputLabel>
                    <Select
                      labelId="ministry-label"
                      value={ministryFilter}
                      onChange={(e) => setMinistryFilter(e.target.value)}
                      label="Ministry"
                      sx={{ 
                        height: '32px', 
                        fontSize: '0.8125rem',
                        '& .MuiSelect-select': {
                          py: 0.5
                        }
                      }}
                      disabled={departments.length === 0}
                    >
                      <MenuItem value="" sx={{ fontSize: '0.8125rem' }}>All</MenuItem>
                      {departments.map(dept => (
                        <MenuItem key={dept.departmentId || dept.id} value={dept.name || dept.departmentName} sx={{ fontSize: '0.8125rem' }}>
                          {dept.name || dept.departmentName}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>

                {/* State Department Filter */}
                <Grid item xs={6} sm={3} md={2}>
                  <FormControl fullWidth size="small" sx={{ minWidth: 140 }}>
                    <InputLabel id="state-department-label" sx={{ fontSize: '0.8125rem' }}>State Department</InputLabel>
                    <Select
                      labelId="state-department-label"
                      value={stateDepartmentFilter}
                      onChange={(e) => setStateDepartmentFilter(e.target.value)}
                      label="State Department"
                      sx={{ 
                        height: '32px', 
                        fontSize: '0.8125rem',
                        '& .MuiSelect-select': {
                          py: 0.5
                        }
                      }}
                    >
                      <MenuItem value="" sx={{ fontSize: '0.8125rem' }}>All</MenuItem>
                      {Array.from(new Set(projects.map(p => p.stateDepartment || p.state_department).filter(Boolean))).sort().map(stateDept => (
                        <MenuItem key={stateDept} value={stateDept} sx={{ fontSize: '0.8125rem' }}>
                          {stateDept}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>

                {/* Category Filter */}
                <Grid item xs={6} sm={3} md={2}>
                  <FormControl fullWidth size="small" sx={{ minWidth: 120 }}>
                    <InputLabel id="category-label" sx={{ fontSize: '0.8125rem' }}>Category</InputLabel>
                    <Select
                      labelId="category-label"
                      value={categoryFilter}
                      onChange={(e) => setCategoryFilter(e.target.value)}
                      label="Category"
                      sx={{ 
                        height: '32px', 
                        fontSize: '0.8125rem',
                        '& .MuiSelect-select': {
                          py: 0.5
                        }
                      }}
                      disabled={categories.length === 0}
                    >
                      <MenuItem value="" sx={{ fontSize: '0.8125rem' }}>All</MenuItem>
                      {categories.map(cat => (
                        <MenuItem key={cat} value={cat} sx={{ fontSize: '0.8125rem' }}>{cat}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>

                {/* Clear Filters Button */}
                <Grid item xs={12} sm={6} md={1} sx={{ display: 'flex', justifyContent: { xs: 'flex-end', md: 'center' } }}>
                  <IconButton
                    onClick={handleClearFilters}
                    disabled={!hasActiveFilters}
                    size="small"
                    sx={{
                      backgroundColor: hasActiveFilters ? 'error.light' : 'grey.200',
                      color: hasActiveFilters ? 'white' : 'grey.500',
                      height: '32px',
                      width: '32px',
                      '&:hover': {
                        backgroundColor: hasActiveFilters ? 'error.main' : 'grey.300'
                      }
                    }}
                  >
                    <ClearIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                </Grid>
              </Grid>

              {/* Active Filters & Results count */}
              {hasActiveFilters && (
                <Box sx={{ mt: 1.5, pt: 1, borderTop: `1px solid ${theme.palette.divider}`, display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
                  <Typography variant="caption" sx={{ fontSize: '0.75rem', fontWeight: 500, color: 'text.secondary', mr: 0.5 }}>
                    Active:
                  </Typography>
                  {globalSearch && (
                    <Chip
                      label={`Search: "${globalSearch}"`}
                      size="small"
                      onDelete={() => setGlobalSearch('')}
                      sx={{ 
                        height: 24, 
                        fontSize: '0.7rem',
                        fontWeight: 500,
                        '& .MuiChip-deleteIcon': { fontSize: 14 }
                      }}
                    />
                  )}
                  {approvalStatusFilter && (
                    <Chip
                      label={`Approval: ${approvalStatusFilter}`}
                      size="small"
                      onDelete={() => setApprovalStatusFilter('')}
                      sx={{ 
                        height: 24, 
                        fontSize: '0.7rem',
                        fontWeight: 500,
                        '& .MuiChip-deleteIcon': { fontSize: 14 }
                      }}
                    />
                  )}
                  {statusFilter && (
                    <Chip
                      label={`Status: ${statusFilter}`}
                      size="small"
                      onDelete={() => setStatusFilter('')}
                      sx={{ 
                        height: 24, 
                        fontSize: '0.7rem',
                        fontWeight: 500,
                        '& .MuiChip-deleteIcon': { fontSize: 14 }
                      }}
                    />
                  )}
                  {ministryFilter && (
                    <Chip
                      label={`Ministry: ${ministryFilter}`}
                      size="small"
                      onDelete={() => setMinistryFilter('')}
                      sx={{ 
                        height: 24, 
                        fontSize: '0.7rem',
                        fontWeight: 500,
                        '& .MuiChip-deleteIcon': { fontSize: 14 }
                      }}
                    />
                  )}
                  {stateDepartmentFilter && (
                    <Chip
                      label={`State Dept: ${stateDepartmentFilter}`}
                      size="small"
                      onDelete={() => setStateDepartmentFilter('')}
                      sx={{ 
                        height: 24, 
                        fontSize: '0.7rem',
                        fontWeight: 500,
                        '& .MuiChip-deleteIcon': { fontSize: 14 }
                      }}
                    />
                  )}
                  {categoryFilter && (
                    <Chip
                      label={`Category: ${categoryFilter}`}
                      size="small"
                      onDelete={() => setCategoryFilter('')}
                      sx={{ 
                        height: 24, 
                        fontSize: '0.7rem',
                        fontWeight: 500,
                        '& .MuiChip-deleteIcon': { fontSize: 14 }
                      }}
                    />
                  )}
                  <Chip
                    label={`${filterData.length} result${filterData.length !== 1 ? 's' : ''}`}
                    color="primary"
                    size="small"
                    sx={{ 
                      height: 24, 
                      fontSize: '0.7rem', 
                      fontWeight: 600,
                      ml: 'auto'
                    }}
                  />
                </Box>
              )}
            </Paper>
          )}

            <>
              {/* Bulk Actions Toolbar */}
              <Paper 
                elevation={selectedRows.length > 0 ? 2 : 0}
                sx={{ 
                  p: 1, 
                  mb: 1.5,
                  backgroundColor: selectedRows.length > 0 
                    ? (theme.palette.mode === 'dark' ? 'rgba(25, 118, 210, 0.15)' : 'rgba(25, 118, 210, 0.08)')
                    : 'transparent',
                  borderRadius: 1,
                  border: selectedRows.length > 0 ? `2px solid ${theme.palette.primary.main}` : `1px solid ${theme.palette.divider}`,
                  transition: 'all 0.2s ease'
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    {selectedRows.length > 0 ? (
                      <>
                        <CheckCircleIcon color="primary" sx={{ fontSize: 20 }} />
                        <Button
                          variant="outlined"
                          size="small"
                          onClick={() => {
                            const allIds = filterData.map(item => item.id);
                            setSelectedRows(allIds);
                          }}
                          sx={{ minWidth: 'auto', px: 1.5, fontSize: '0.75rem' }}
                        >
                          {selectedRows.length} selected
                        </Button>
                      </>
                    ) : (
                      <>
                        <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.875rem' }}>
                          Select items using checkboxes to perform bulk actions
                        </Typography>
                        <Button
                          variant="outlined"
                          size="small"
                          onClick={() => {
                            const allIds = filterData.map(item => item.id);
                            setSelectedRows(allIds);
                          }}
                          sx={{ minWidth: 'auto', px: 1.5, fontSize: '0.75rem' }}
                        >
                          Select All ({filterData.length})
                        </Button>
                      </>
                    )}
                  </Box>
                  {selectedRows.length > 0 && (
                    <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                      <Button
                        variant="contained"
                        color="success"
                        startIcon={<CheckCircleIcon sx={{ fontSize: 16 }} />}
                        onClick={() => handleBulkApprove('approve')}
                        disabled={bulkActionLoading}
                        size="small"
                        sx={{ minWidth: 'auto', px: 1.5, fontWeight: 600 }}
                      >
                        {bulkActionLoading ? <CircularProgress size={14} /> : 'Approve Selected'}
                      </Button>
                      <Button
                        variant="contained"
                        color="error"
                        startIcon={<CancelIcon sx={{ fontSize: 16 }} />}
                        onClick={() => handleBulkApprove('revoke')}
                        disabled={bulkActionLoading}
                        size="small"
                        sx={{ minWidth: 'auto', px: 1.5, fontWeight: 600 }}
                      >
                        {bulkActionLoading ? <CircularProgress size={14} /> : 'Revoke Selected'}
                      </Button>
                      <Button
                        variant="outlined"
                        color="secondary"
                        startIcon={<ClearIcon sx={{ fontSize: 16 }} />}
                        onClick={() => setSelectedRows([])}
                        disabled={bulkActionLoading}
                        size="small"
                        sx={{ minWidth: 'auto', px: 1 }}
                      >
                        Clear
                      </Button>
                    </Box>
                  )}
                </Box>
              </Paper>

              {loading ? (
                <Box display="flex" justifyContent="center" alignItems="center" minHeight={300}>
                  <CircularProgress size={24} />
                </Box>
              ) : (
                <Box sx={{ height: 500, width: '100%' }}>
                  {Array.isArray(currentData.data) && currentData.data.length > 0 ? (
                    <DataGrid
                      rows={currentData.data}
                      columns={currentData.columns}
                      getRowId={(row) => row.id}
                      pageSize={10}
                      rowsPerPageOptions={[10, 25, 50]}
                      checkboxSelection
                      onSelectionModelChange={(newSelection) => {
                        setSelectedRows(newSelection);
                      }}
                      selectionModel={selectedRows}
                      disableSelectionOnClick={false}
                      sx={{
                        border: 'none',
                        '& .MuiDataGrid-cell': {
                          borderBottom: `1px solid ${theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'}`,
                          py: 1,
                          fontSize: '0.875rem',
                          display: 'flex',
                          alignItems: 'center',
                          '&[data-field="projectName"], &[data-field="title"]': {
                            alignItems: 'flex-start',
                            py: 1.5,
                            whiteSpace: 'normal',
                            wordBreak: 'break-word',
                          }
                        },
                        '& .MuiDataGrid-columnHeaders': {
                          minHeight: '48px !important',
                          maxHeight: '48px !important',
                          backgroundColor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.06)' : '#f5f7fa',
                          borderBottom: `2px solid ${theme.palette.primary.main}`,
                          '& .MuiDataGrid-columnHeaderTitle': {
                            fontWeight: 600,
                            fontSize: '0.85rem',
                          }
                        },
                        '& .MuiDataGrid-columnHeader': {
                          py: 1,
                          fontSize: '0.85rem',
                          fontWeight: 600,
                          color: theme.palette.text.primary,
                          '&:focus': {
                            outline: 'none',
                          },
                          '&:focus-within': {
                            outline: 'none',
                          }
                        },
                        '& .MuiDataGrid-row': {
                          minHeight: '48px !important',
                          transition: 'background-color 0.2s ease',
                          '&:hover': {
                            backgroundColor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.04)' : 'rgba(25, 118, 210, 0.04)',
                            cursor: 'pointer',
                          },
                          '&.Mui-selected': {
                            backgroundColor: theme.palette.mode === 'dark' ? 'rgba(25, 118, 210, 0.25)' : 'rgba(25, 118, 210, 0.1)',
                            '&:hover': {
                              backgroundColor: theme.palette.mode === 'dark' ? 'rgba(25, 118, 210, 0.3)' : 'rgba(25, 118, 210, 0.15)',
                            },
                          },
                        },
                        '& .MuiDataGrid-footerContainer': {
                          borderTop: `2px solid ${theme.palette.divider}`,
                          minHeight: '52px',
                          backgroundColor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.02)' : '#fafafa',
                        },
                        '& .MuiDataGrid-checkboxInput': {
                          color: theme.palette.primary.main,
                          '&.Mui-checked': {
                            color: theme.palette.primary.main,
                          }
                        },
                        '& .MuiDataGrid-cell:focus': {
                          outline: 'none',
                        },
                        '& .MuiDataGrid-cell:focus-within': {
                          outline: 'none',
                        }
                      }}
                    />
                  ) : (
                    <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
                      <Typography variant="body2" color="text.secondary">
                        No {currentData.title.toLowerCase()} found
                      </Typography>
                    </Box>
                  )}
                </Box>
              )}
            </>
        </Box>
      </Paper>

      {/* Approval Dialog */}
      <Dialog open={approvalDialogOpen} onClose={handleCloseApprovalDialog} maxWidth="sm" fullWidth>
        <DialogTitle>
          {approvalAction === 'approve' 
            ? 'Approve for Public Viewing' 
            : approvalAction === 'request_revision'
            ? 'Request Revision'
            : approvalAction === 'view_revision'
            ? 'Revision Request Details'
            : approvalAction === 'view_approval'
            ? 'Approval Details'
            : 'Revoke Public Approval'}
        </DialogTitle>
        <DialogContent>
          {selectedItem && (
            <Box>
              <Typography variant="subtitle2" gutterBottom>
                {selectedItem.title || selectedItem.projectName}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                {selectedItem.description?.substring(0, 100) || selectedItem.projectDescription?.substring(0, 100)}...
              </Typography>
              
              {/* Display existing approval notes if item is approved or viewing approval */}
              {(approvalAction === 'view_approval' || (selectedItem.approved_for_public && selectedItem.approval_notes)) && (
                <Alert severity="success" sx={{ mb: 2 }}>
                  <Typography variant="subtitle2" gutterBottom>
                    Approval Notes
                  </Typography>
                  <Typography variant="body2">
                    {selectedItem.approval_notes || 'No approval notes provided.'}
                  </Typography>
                  {selectedItem.approved_at && (
                    <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                      Approved on: {new Date(selectedItem.approved_at).toLocaleString()}
                      {selectedItem.approved_by && selectedItem.approved_by > 0 && ` by User ID: ${selectedItem.approved_by}`}
                    </Typography>
                  )}
                </Alert>
              )}
              
              {/* Display revision notes if revision was requested or viewing revision */}
              {(approvalAction === 'view_revision' || (selectedItem.revision_requested && selectedItem.revision_notes)) && (
                <Alert severity="warning" sx={{ mb: 2 }}>
                  <Typography variant="subtitle2" gutterBottom>
                    Revision Requested
                  </Typography>
                  <Typography variant="body2">
                    {selectedItem.revision_notes || 'No revision notes provided.'}
                  </Typography>
                  {selectedItem.revision_requested_at && (
                    <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                      Requested on: {new Date(selectedItem.revision_requested_at).toLocaleString()}
                      {selectedItem.revision_requested_by && selectedItem.revision_requested_by > 0 && ` by User ID: ${selectedItem.revision_requested_by}`}
                    </Typography>
                  )}
                </Alert>
              )}
              
              {(approvalAction === 'approve' || approvalAction === 'reject' || approvalAction === 'request_revision') && (
                <TextField
                  fullWidth
                  multiline
                  rows={approvalAction === 'request_revision' ? 6 : 4}
                  label={
                    approvalAction === 'request_revision' 
                      ? 'Revision Notes (Required) - Describe what needs to be changed'
                      : 'Notes (Optional)'
                  }
                  value={approvalNotes}
                  onChange={(e) => setApprovalNotes(e.target.value)}
                  placeholder={
                    approvalAction === 'request_revision'
                      ? 'Please specify what changes are needed. For example: "Please update the project photo" or "The description needs more details about..."'
                      : 'Add any notes about this approval decision...'
                  }
                  required={approvalAction === 'request_revision'}
                  sx={{ mt: 2 }}
                />
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseApprovalDialog}>
            {(approvalAction === 'view_revision' || approvalAction === 'view_approval') ? 'Close' : 'Cancel'}
          </Button>
          {approvalAction !== 'view_revision' && approvalAction !== 'view_approval' && (
            <Button
              onClick={handleApproveReject}
              variant="contained"
              color={
                approvalAction === 'approve' 
                  ? 'success' 
                  : approvalAction === 'request_revision'
                  ? 'warning'
                  : 'error'
              }
              disabled={loading || (approvalAction === 'request_revision' && !approvalNotes.trim())}
            >
              {approvalAction === 'approve' 
                ? 'Approve' 
                : approvalAction === 'request_revision'
                ? 'Request Revision'
                : 'Revoke'}
            </Button>
          )}
        </DialogActions>
      </Dialog>

      {/* Photo Management Modal */}
      <Dialog 
        open={photoModalOpen} 
        onClose={handleClosePhotoModal} 
        maxWidth="lg" 
        fullWidth
        PaperProps={{ sx: { minHeight: '60vh' } }}
      >
        <DialogTitle>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h6">
              Manage Photos - {selectedProject?.projectName}
            </Typography>
            <Box>
              <input
                ref={photoFileInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={handleUploadPhoto}
              />
              <Button
                variant="contained"
                startIcon={<CloudUploadIcon />}
                onClick={() => photoFileInputRef.current?.click()}
                disabled={uploadingPhoto}
                size="small"
              >
                Upload Photo
              </Button>
            </Box>
          </Box>
        </DialogTitle>
        <DialogContent>
          <Box sx={{ mb: 2 }}>
            <TextField
              fullWidth
              size="small"
              label="Photo Description (Optional)"
              placeholder="Enter a brief description for the photo..."
              value={photoDescription}
              onChange={(e) => setPhotoDescription(e.target.value)}
              multiline
              rows={2}
              helperText="This description will be saved with the photo"
            />
          </Box>
          {photosLoading ? (
            <Box display="flex" justifyContent="center" alignItems="center" minHeight={200}>
              <CircularProgress />
            </Box>
          ) : photos.length === 0 ? (
            <Box textAlign="center" py={4}>
              <PhotoLibraryIcon sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
              <Typography variant="body1" color="text.secondary">
                No photos available for this project
              </Typography>
              <Button
                variant="outlined"
                startIcon={<CloudUploadIcon />}
                onClick={() => photoFileInputRef.current?.click()}
                sx={{ mt: 2 }}
              >
                Upload First Photo
              </Button>
            </Box>
          ) : (
            <Grid container spacing={2} sx={{ mt: 1 }}>
              {photos.map((photo) => {
                const isApproved = photo.approved_for_public === 1 || photo.approved_for_public === true;
                
                // Construct photo URL - static files are served from API server
                // In production, API is on port 3000, frontend is on port 8080 via nginx
                // File paths in DB are like: "uploads/project-photos/filename.jpg"
                const apiBaseUrl = getApiBaseUrl();
                let photoUrl = photo.filePath || '';
                if (!photoUrl) {
                  photoUrl = '';
                } else if (photoUrl.startsWith('http://') || photoUrl.startsWith('https://')) {
                  // Already a full URL
                  photoUrl = photoUrl;
                } else if (photoUrl.startsWith('/uploads/')) {
                  // Already has /uploads/ prefix
                  photoUrl = `${apiBaseUrl}${photoUrl}`;
                } else if (photoUrl.startsWith('uploads/')) {
                  // Has uploads/ prefix but missing leading slash
                  photoUrl = `${apiBaseUrl}/${photoUrl}`;
                } else if (photoUrl.startsWith('/')) {
                  // Absolute path from root
                  photoUrl = `${apiBaseUrl}${photoUrl}`;
                } else {
                  // Relative path - add /uploads/ prefix
                  photoUrl = `${apiBaseUrl}/uploads/${photoUrl}`;
                }
                
                console.log('Photo URL constructed:', photoUrl, 'from filePath:', photo.filePath);
                
                return (
                  <Grid item xs={12} sm={6} md={4} key={photo.photoId}>
                    <Card>
                      <Box sx={{ height: 200, position: 'relative', backgroundColor: 'grey.200', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                        {photoUrl ? (
                          <CardMedia
                            component="img"
                            height="200"
                            image={photoUrl}
                            alt={photo.description || photo.fileName}
                            sx={{ 
                              objectFit: 'cover',
                              width: '100%',
                              height: '100%',
                              cursor: 'pointer'
                            }}
                            onError={(e) => {
                              console.error('Failed to load image:', {
                                photoUrl,
                                filePath: photo.filePath,
                                photoId: photo.photoId,
                                projectId: photo.projectId
                              });
                              e.target.style.display = 'none';
                              // Show placeholder on error
                              const placeholder = e.target.parentElement.querySelector('.photo-placeholder');
                              if (placeholder) placeholder.style.display = 'flex';
                            }}
                            onLoad={() => {
                              console.log('Image loaded successfully:', photoUrl);
                            }}
                          />
                        ) : null}
                        <Box 
                          className="photo-placeholder"
                          sx={{ 
                            display: photoUrl ? 'none' : 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            textAlign: 'center',
                            p: 2,
                            position: 'absolute',
                            width: '100%',
                            height: '100%'
                          }}
                        >
                          <PhotoLibraryIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 1 }} />
                          <Typography variant="caption" color="text.secondary">
                            No image available
                          </Typography>
                        </Box>
                      </Box>
                      <CardContent>
                        <Typography variant="subtitle2" noWrap title={photo.fileName}>
                          {photo.fileName}
                        </Typography>
                        {photo.description && (
                          <Typography variant="caption" color="text.secondary" sx={{ 
                            display: '-webkit-box',
                            mt: 0.5,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical'
                          }} title={photo.description}>
                            {photo.description}
                          </Typography>
                        )}
                        {!photo.description && (
                          <Typography variant="caption" color="text.disabled" sx={{ fontStyle: 'italic' }}>
                            No description
                          </Typography>
                        )}
                        <Box sx={{ mt: 1 }}>
                          {isApproved ? (
                            <Chip label="Approved" color="success" size="small" icon={<CheckCircleIcon />} />
                          ) : (
                            <Chip label="Pending" color="warning" size="small" />
                          )}
                          {photo.isDefault && (
                            <Chip label="Default" color="primary" size="small" sx={{ ml: 1 }} />
                          )}
                        </Box>
                      </CardContent>
                      <CardActions>
                        <Button
                          size="small"
                          color={isApproved ? "error" : "success"}
                          startIcon={isApproved ? <CancelIcon /> : <CheckCircleIcon />}
                          onClick={() => handleApprovePhoto(photo.photoId, !isApproved)}
                        >
                          {isApproved ? 'Revoke' : 'Approve'}
                        </Button>
                      </CardActions>
                    </Card>
                  </Grid>
                );
              })}
            </Grid>
          )}
          {uploadingPhoto && (
            <Box sx={{ mt: 2 }}>
              <LinearProgress />
              <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                Uploading photo...
              </Typography>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClosePhotoModal}>Close</Button>
        </DialogActions>
      </Dialog>


      {/* Progress Update Modal */}
      <Dialog
        open={progressModalOpen}
        onClose={handleCloseProgressModal}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          Update Project Progress - {selectedProjectForProgress?.projectName}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ mt: 2 }}>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              Current Progress: {selectedProjectForProgress?.overallProgress != null ? `${selectedProjectForProgress.overallProgress}%` : 'Not set (0%)'}
            </Typography>
            <FormControl fullWidth sx={{ mt: 3 }}>
              <InputLabel>Select Progress Stage</InputLabel>
              <Select
                value={selectedProgress}
                onChange={(e) => setSelectedProgress(parseInt(e.target.value))}
                label="Select Progress Stage"
              >
                <MenuItem value={0}>0% - Not Started</MenuItem>
                <MenuItem value={25}>25% - In Progress</MenuItem>
                <MenuItem value={50}>50% - Halfway</MenuItem>
                <MenuItem value={75}>75% - Nearly Complete</MenuItem>
                <MenuItem value={100}>100% - Completed</MenuItem>
              </Select>
            </FormControl>
            {selectedProgress !== (selectedProjectForProgress?.overallProgress || 0) && (
              <Alert severity="info" sx={{ mt: 2 }}>
                Progress will be updated from {selectedProjectForProgress?.overallProgress || 0}% to {selectedProgress}%
              </Alert>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseProgressModal} disabled={updatingProgress}>
            Cancel
          </Button>
          <Button
            onClick={handleUpdateProgress}
            variant="contained"
            color="primary"
            disabled={updatingProgress || selectedProgress === (selectedProjectForProgress?.overallProgress || 0)}
          >
            {updatingProgress ? <CircularProgress size={20} /> : 'Update Progress'}
          </Button>
        </DialogActions>
      </Dialog>

    </Container>
  );
};

export default PublicApprovalManagementPage;

