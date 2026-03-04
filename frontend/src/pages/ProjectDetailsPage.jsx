import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    Box, Typography, CircularProgress, Alert, Button, Paper,
    List, ListItem, ListItemText, IconButton,
    Stack, Chip, Snackbar, LinearProgress,
    Tooltip, Accordion, AccordionSummary, AccordionDetails, useTheme, Grid,
    Divider, Tabs, Tab, Card, CardContent, CardMedia, Link,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
    Dialog, DialogTitle, DialogContent, DialogActions, TextField, MenuItem,
    InputLabel, Select, FormControl, Menu, ListItemIcon
} from '@mui/material';
import {
    ArrowBack as ArrowBackIcon, Add as AddIcon, Edit as EditIcon,
    Delete as DeleteIcon, MoreVert as MoreVertIcon,
    Update as UpdateIcon,
    Attachment as AttachmentIcon,
    PhotoCamera as PhotoCameraIcon,
    Visibility as VisibilityIcon,
    Paid as PaidIcon,
    ExpandMore as ExpandMoreIcon,
    Flag as FlagIcon,
    Assessment as AssessmentIcon,
    AccountTree as AccountTreeIcon,
    Timeline as TimelineIcon,
    Info as InfoIcon,
    AttachMoney as MoneyIcon,
    TrendingUp as TrendingUpIcon,
    Schedule as ScheduleIcon,
    Warning as WarningIcon,
    Business as BusinessIcon,
    Phone as PhoneIcon,
    Email as EmailIcon,
    LocationOn as LocationOnIcon,
    Description as DescriptionIcon,
    People as PeopleIcon,
    CheckCircle as CheckCircleIcon,
    Upload as UploadIcon,
    Download as DownloadIcon,
    Print as PrintIcon,
    Group as GroupIcon,
    Public as PublicIcon,
    Cancel as CancelIcon,
    Pending as PendingIcon,
    Work as WorkIcon
} from '@mui/icons-material';
import apiService from '../api';
import { useAuth } from '../context/AuthContext.jsx';
import ProjectDocumentsAttachments from '../components/ProjectDocumentsAttachments';
import ProjectMapEditor from '../components/ProjectMapEditor';
import { getProjectStatusBackgroundColor, getProjectStatusTextColor } from '../utils/projectStatusColors';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { axiosInstance } from '../api';
import projectService from '../api/projectService';
import SiteUpdatesDialog from '../components/SiteUpdatesDialog';

// Helper function to map milestone activity status to project status colors
const getMilestoneStatusColors = (status) => {
    const statusMapping = {
        'completed': 'Completed',
        'in_progress': 'In Progress',
        'not_started': 'Initiated',
        'stalled': 'Stalled',
        'delayed': 'Delayed',
        'cancelled': 'Cancelled'
    };
    
    const mappedStatus = statusMapping[status] || status;
    return {
        backgroundColor: getProjectStatusBackgroundColor(mappedStatus),
        textColor: getProjectStatusTextColor(mappedStatus)
    };
};

// Helper function to get public approval status
const getPublicApprovalStatus = (project) => {
    if (!project) return null;
    
    const isApproved = project.approved_for_public === 1 || project.approved_for_public === true;
    const needsRevision = project.revision_requested === 1 || project.revision_requested === true;
    
    if (isApproved) {
        return {
            label: 'Public Approved',
            color: 'success',
            icon: <PublicIcon sx={{ fontSize: 14 }} />
        };
    }
    if (needsRevision) {
        return {
            label: 'Revision Required',
            color: 'warning',
            icon: <CancelIcon sx={{ fontSize: 14 }} />
        };
    }
    return {
        label: 'Pending Approval',
        color: 'default',
        icon: <PendingIcon sx={{ fontSize: 14 }} />
    };
};
import { tokens } from "./dashboard/theme"; // Import tokens for color styling
import MilestoneAttachments from '../components/MilestoneAttachments.jsx';
import ProjectMonitoringComponent from '../components/ProjectMonitoringComponent.jsx';
import ProjectManagerReviewPanel from '../components/ProjectManagerReviewPanel.jsx';
import AddEditActivityForm from '../components/modals/AddEditActivityForm';
import AddEditMilestoneModal from '../components/modals/AddEditMilestoneModal';
import PaymentRequestForm from '../components/PaymentRequestForm';
import PaymentRequestDocumentUploader from '../components/PaymentRequestDocumentUploader';
import ProjectGanttChart from '../components/ProjectGanttChart';

const checkUserPrivilege = (user, privilegeName) => {
    return user && user.privileges && Array.isArray(user.privileges) && user.privileges.includes(privilegeName);
};

const snakeToCamelCase = (obj) => {
    if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
        return obj;
    }
    if (Array.isArray(obj)) {
        return obj.map(v => snakeToCamelCase(v));
    }
    const newObj = {};
    for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
            const camelKey = key.replace(/_([a-z])/g, (g) => g[1].toUpperCase());
            newObj[camelKey] = snakeToCamelCase(obj[key]);
        }
    }
    return newObj;
};

// Helper function for currency formatting
const formatCurrency = (amount) => {
    // Current location is Nairobi, Nairobi County, Kenya.
    // So the currency symbol is KES.
    return `KES ${parseFloat(amount || 0).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

// Helper function for date formatting
const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    try {
        return new Date(dateString).toLocaleDateString('en-GB');
    } catch (e) {
        console.error('Invalid date string:', dateString);
        return 'Invalid Date';
    }
};

// NEW: Helper function for monitoring data formatting
const formatMonitoringDate = (dateString) => {
    if (!dateString) return 'N/A';
    try {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
            year: 'numeric', 
            month: 'long', 
            day: 'numeric',
            hour: '2-digit', 
            minute: '2-digit'
        });
    } catch (e) {
        console.error('Invalid date string:', dateString);
        return 'Invalid Date';
    }
};

// NEW: Helper function for warning level colors
const getWarningColor = (level) => {
    switch (level) {
        case 'High':
            return 'error';
        case 'Medium':
            return 'warning';
        case 'Low':
            return 'info';
        default:
            return 'success';
    }
};



function ProjectDetailsPage() {
    const { projectId } = useParams();
    const navigate = useNavigate();
    const { user, logout, authLoading } = useAuth();
    const theme = useTheme();
    const colors = tokens(theme.palette.mode); // Initialize colors
    const isLight = theme.palette.mode === 'light';

    const [project, setProject] = useState(null);
    const [milestones, setMilestones] = useState([]);
    const [staff, setStaff] = useState([]);
    const [projectCategory, setProjectCategory] = useState(null);
    const [applyingTemplate, setApplyingTemplate] = useState(false);
    const [milestoneActivities, setMilestoneActivities] = useState([]);

    const [projectWorkPlans, setProjectWorkPlans] = useState([]);
    const [loadingWorkPlans, setLoadingWorkPlans] = useState(false);

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });

    const [openMilestoneDialog, setOpenMilestoneDialog] = useState(false);
    const [currentMilestone, setCurrentMilestone] = useState(null);

    const [openAttachmentsModal, setOpenAttachmentsModal] = useState(false);
    const [milestoneToViewAttachments, setMilestoneToViewAttachments] = useState(null);
    const [openMonitoringModal, setOpenMonitoringModal] = useState(false);
    const [openReviewPanel, setOpenReviewPanel] = useState(false);
    const [openActivityDialog, setOpenActivityDialog] = useState(false);
    const [currentActivity, setCurrentActivity] = useState(null);
    const [activityFormData, setActivityFormData] = useState({
        activityName: '',
        activityDescription: '',
        responsibleOfficer: null,
        startDate: '',
        endDate: '',
        budgetAllocated: null,
        actualCost: null,
        percentageComplete: null,
        activityStatus: '',
        projectId: null,
        workplanId: null,
        milestoneIds: [],
        selectedWorkplanName: ''
    });

    const [expandedWorkPlan, setExpandedWorkPlan] = useState(false);
    const [paymentJustification, setPaymentJustification] = useState({
        totalBudget: 0,
        accomplishedActivities: [],
        accomplishedMilestones: []
    });

    const [openPaymentModal, setOpenPaymentModal] = useState(false);

    const [openDocumentUploader, setOpenDocumentUploader] = useState(false);
    const [selectedRequestId, setSelectedRequestId] = useState(null);
    
    // NEW: State for Access Control
    const [isAccessAllowed, setIsAccessAllowed] = useState(false);
    const [accessLoading, setAccessLoading] = useState(true);
    const [accessError, setAccessError] = useState(null);

    // NEW: State for Project Monitoring
    const [monitoringRecords, setMonitoringRecords] = useState([]);
    const [loadingMonitoring, setLoadingMonitoring] = useState(false);
    const [monitoringError, setMonitoringError] = useState(null);
    const [editingMonitoringRecord, setEditingMonitoringRecord] = useState(null);
    
    // NEW: State for Contractors
    const [projectContractors, setProjectContractors] = useState([]);
    const [loadingContractors, setLoadingContractors] = useState(false);
    const [contractorsError, setContractorsError] = useState(null);

    // NEW: State for Project Sites
    const [projectSites, setProjectSites] = useState([]);
    const [loadingSites, setLoadingSites] = useState(false);
    const [sitesError, setSitesError] = useState(null);
    const [siteFilters, setSiteFilters] = useState({
        location: '',
        status: '',
    });
    const [siteUpdatesDialogOpen, setSiteUpdatesDialogOpen] = useState(false);
    const [siteForUpdates, setSiteForUpdates] = useState(null);
    const [openSiteDialog, setOpenSiteDialog] = useState(false);
    const [editingSite, setEditingSite] = useState(null);
    const [siteFormData, setSiteFormData] = useState({
        siteName: '',
        county: '',
        constituency: '',
        ward: '',
        status: '',
        progress: '',
        approvedCost: '',
    });
    const [siteFormErrors, setSiteFormErrors] = useState({});

    // NEW: State for Project Jobs
    const [projectJobs, setProjectJobs] = useState([]);
    const [jobsSummary, setJobsSummary] = useState({
        totalJobs: 0,
        totalMale: 0,
        totalFemale: 0,
        totalYouth: 0,
    });
    const [loadingJobs, setLoadingJobs] = useState(false);
    const [jobsError, setJobsError] = useState(null);
    const [jobCategories, setJobCategories] = useState([]);
    const [loadingJobCategories, setLoadingJobCategories] = useState(false);
    const [jobFormData, setJobFormData] = useState({
        categoryId: '',
        jobsCount: '',
        maleCount: '',
        femaleCount: '',
        youthCount: '',
    });
    const [jobFormErrors, setJobFormErrors] = useState({});

    // Fetch job categories (for dropdown)
    const fetchJobCategories = useCallback(async () => {
        setLoadingJobCategories(true);
        try {
            const response = await axiosInstance.get('/job-categories');
            setJobCategories(Array.isArray(response.data) ? response.data : []);
        } catch (error) {
            console.error('Error fetching job categories:', error);
        } finally {
            setLoadingJobCategories(false);
        }
    }, []);

    // Fetch jobs for this project
    const fetchProjectJobs = useCallback(async () => {
        if (!projectId) return;
        setLoadingJobs(true);
        setJobsError(null);
        try {
            const data = await projectService.junctions.getProjectJobs(projectId);
            const summary = data?.summary || {};
            setJobsSummary({
                totalJobs: summary.totalJobs || 0,
                totalMale: summary.totalMale || 0,
                totalFemale: summary.totalFemale || 0,
                totalYouth: summary.totalYouth || 0,
            });
            setProjectJobs(Array.isArray(data?.jobs) ? data.jobs : []);
        } catch (error) {
            console.error('Error fetching project jobs:', error);
            setJobsError(error?.message || 'Failed to load project jobs');
        } finally {
            setLoadingJobs(false);
        }
    }, [projectId]);

    // NEW: State for Teams
    const [projectTeams, setProjectTeams] = useState([]);
    const [loadingTeams, setLoadingTeams] = useState(false);
    const [teamsError, setTeamsError] = useState(null);
    const [openTeamDialog, setOpenTeamDialog] = useState(false);
    const [editingTeam, setEditingTeam] = useState(null);
    const [rowActionMenuAnchor, setRowActionMenuAnchor] = useState(null);
    const [selectedRow, setSelectedRow] = useState(null);
    const [teamFormData, setTeamFormData] = useState({
        teamName: '',
        name: '',
        role: '',
        email: '',
        phone: '',
        dateAppointed: '',
        dateEnded: '',
        notes: ''
    });

    // NEW: State for Tabs and Photos
    const [activeTab, setActiveTab] = useState(0);
    const [projectPhotos, setProjectPhotos] = useState([]);
    const [loadingPhotos, setLoadingPhotos] = useState(false);

    // Load jobs & categories when Jobs tab is active
    useEffect(() => {
        if (activeTab === 2) { // Jobs tab index (0:Overview,1:Sites,2:Jobs,3:Teams,4:Timeline,5:Map)
            fetchJobCategories();
            fetchProjectJobs();
        }
    }, [activeTab, fetchJobCategories, fetchProjectJobs]);

    // NEW: Helper function to get warning level colors from theme
    const getWarningLevelColors = (level) => {
        switch (level) {
            case 'High':
                return {
                    backgroundColor: colors.redAccent[500],
                    textColor: colors.grey[100]
                };
            case 'Medium':
                return {
                    backgroundColor: colors.redAccent[400],
                    textColor: colors.grey[100]
                };
            case 'Low':
                return {
                    backgroundColor: colors.blueAccent[500],
                    textColor: colors.grey[100]
                };
            default:
                return {
                    backgroundColor: colors.greenAccent[500],
                    textColor: colors.grey[100]
                };
        }
    };

    const handleAccordionChange = (panel) => (event, isExpanded) => {
        setExpandedWorkPlan(isExpanded ? panel : false);
    };

    // NEW: Access Control Function
    const checkAccess = useCallback(async () => {
        setAccessLoading(true);
        setAccessError(null);

        // Wait for auth to finish loading
        if (authLoading) return;
        
        try {
            // Admins and privileged users can view any project
            if (checkUserPrivilege(user, 'project.read_all')) {
                setIsAccessAllowed(true);
            } else {
                // Contractors can only view their assigned projects
                if (user?.contractorId) {
                    const contractors = await apiService.projects.getContractors(projectId);
                    const isAssigned = contractors.some(c => c.contractorId === user.contractorId);
                    setIsAccessAllowed(isAssigned);
                    if (!isAssigned) {
                        setAccessError("You do not have access to this project.");
                    }
                } else {
                    // If not a privileged user or a contractor, deny access
                    setAccessError("You do not have the necessary privileges to view this project.");
                    setIsAccessAllowed(false);
                }
            }
        } catch (err) {
            console.error("Access check failed:", err);
            setAccessError("Failed to verify access to this project.");
            setIsAccessAllowed(false);
        } finally {
            setAccessLoading(false);
        }
    }, [projectId, user, authLoading]);

    // This effect runs the access check when auth state or projectId changes
    useEffect(() => {
        checkAccess();
    }, [checkAccess]);

    const fetchProjectDetails = useCallback(async () => {
        setLoading(true);
        setError(null);
        
        try {
            // This is the main data fetching logic, which now only runs after access is granted
            const projectData = await apiService.projects.getProjectById(projectId);
            setProject(projectData);

            const subProgramId = projectData.subProgramId;
            if (subProgramId) {
                setLoadingWorkPlans(true);
                try {
                    const workPlansData = await apiService.strategy.annualWorkPlans.getWorkPlansBySubprogramId(subProgramId);
                    setProjectWorkPlans(workPlansData);
                } catch (err) {
                    console.error("Error fetching work plans for subprogram:", err);
                    setProjectWorkPlans([]);
                } finally {
                    setLoadingWorkPlans(false);
                }
            }

            if (projectData.categoryId) {
                const categoryData = await apiService.metadata.projectCategories.getCategoryById(projectData.categoryId);
                setProjectCategory(categoryData);
            } else {
                setProjectCategory(null);
            }

            const milestonesData = await apiService.milestones.getMilestonesForProject(projectId);
            setMilestones(milestonesData);

            const milestoneActivitiesPromises = milestonesData.map(m =>
                apiService.strategy.milestoneActivities.getActivitiesByMilestoneId(m.milestoneId)
            );
            const milestoneActivitiesResults = (await Promise.all(milestoneActivitiesPromises)).flat();
            setMilestoneActivities(milestoneActivitiesResults);

            const rawStaffData = await apiService.users.getStaff();
            const camelCaseStaffData = rawStaffData.map(s => snakeToCamelCase(s));
            setStaff(camelCaseStaffData);

            // NEW: Fetch monitoring records
            await fetchMonitoringRecords();
            
            // NEW: Fetch contractors
            await fetchProjectContractors();
            
            // NEW: Fetch teams
            await fetchProjectTeams();
            
            // NEW: Fetch project sites
            await fetchProjectSites();

        } catch (err) {
            console.error('ProjectDetailsPage: Error fetching project details:', err);
            setError(err.message || 'Failed to load project details.');
            if (err.response && err.response.status === 401) {
                logout();
            }
        } finally {
            setLoading(false);
        }
    }, [projectId, logout, user]);

    // NEW: Function to fetch monitoring records
    const fetchMonitoringRecords = useCallback(async () => {
        if (!checkUserPrivilege(user, 'project_monitoring.read')) return;
        
        setLoadingMonitoring(true);
        setMonitoringError(null);
        
        try {
            const response = await apiService.projectMonitoring.getRecordsByProject(projectId);
            setMonitoringRecords(response);
        } catch (err) {
            console.error('Error fetching monitoring records:', err);
            setMonitoringError('Failed to load monitoring records.');
        } finally {
            setLoadingMonitoring(false);
        }
    }, [projectId, user]);

    // NEW: Function to fetch project photos
    const fetchProjectPhotos = useCallback(async () => {
        if (!checkUserPrivilege(user, 'project_photos.read')) {
            setProjectPhotos([]);
            return;
        }
        
        setLoadingPhotos(true);
        try {
            const photos = await apiService.projectPhotos.getPhotosByProject(projectId);
            setProjectPhotos(photos || []);
        } catch (err) {
            console.error('Error fetching project photos:', err);
            setProjectPhotos([]);
        } finally {
            setLoadingPhotos(false);
        }
    }, [projectId, user]);
    
    // NEW: Function to fetch project sites
    const fetchProjectSites = useCallback(async () => {
        setLoadingSites(true);
        setSitesError(null);
        
        try {
            const result = await apiService.junctions.getProjectSites(projectId);
            // API returns an object: { projectId, summary, sites: [...] }
            const sitesArray = Array.isArray(result?.sites)
                ? result.sites
                : Array.isArray(result)
                    ? result
                    : [];
            setProjectSites(sitesArray);
        } catch (err) {
            console.error('Error fetching project sites:', err);
            setSitesError('Failed to load project sites.');
            setProjectSites([]);
        } finally {
            setLoadingSites(false);
        }
    }, [projectId]);

    // NEW: Function to fetch contractors for project
    const fetchProjectContractors = useCallback(async () => {
        setLoadingContractors(true);
        setContractorsError(null);
        
        try {
            const contractors = await apiService.projects.getContractors(projectId);
            setProjectContractors(contractors || []);
        } catch (err) {
            console.error('Error fetching contractors:', err);
            setContractorsError('Failed to load contractor information.');
            setProjectContractors([]);
        } finally {
            setLoadingContractors(false);
        }
    }, [projectId]);

    // NEW: Function to fetch teams for project
    const fetchProjectTeams = useCallback(async () => {
        setLoadingTeams(true);
        setTeamsError(null);
        
        try {
            // Try API endpoint if it exists
            if (apiService.projects?.getTeams) {
                const teams = await apiService.projects.getTeams(projectId);
                setProjectTeams(teams || []);
            } else {
                // Fallback to localStorage for now (until API is implemented)
                const storedTeams = localStorage.getItem(`project-teams-${projectId}`);
                if (storedTeams) {
                    setProjectTeams(JSON.parse(storedTeams));
                } else {
                    setProjectTeams([]);
                }
            }
        } catch (err) {
            console.error('Error fetching teams:', err);
            // Fallback to localStorage on error
            try {
                const storedTeams = localStorage.getItem(`project-teams-${projectId}`);
                if (storedTeams) {
                    setProjectTeams(JSON.parse(storedTeams));
                } else {
                    setProjectTeams([]);
                }
            } catch (localErr) {
                setTeamsError('Failed to load team information.');
                setProjectTeams([]);
            }
        } finally {
            setLoadingTeams(false);
        }
    }, [projectId]);

    // NEW: Team handlers
    const handleSaveTeam = async () => {
        try {
            let updatedTeams = [...projectTeams];
            
            if (editingTeam) {
                // Update existing team member
                if (apiService.projects?.updateTeamMember) {
                    await apiService.projects.updateTeamMember(projectId, editingTeam.teamMemberId, teamFormData);
                }
                // Update local state
                const index = updatedTeams.findIndex(t => t.teamMemberId === editingTeam.teamMemberId);
                if (index !== -1) {
                    updatedTeams[index] = { ...editingTeam, ...teamFormData };
                }
                setSnackbar({ open: true, message: 'Team member updated successfully!', severity: 'success' });
            } else {
                // Create new team member
            const newTeamMember = {
                teamMemberId: Date.now().toString(), // Temporary ID until API provides one
                teamName: teamFormData.teamName || teamFormData.role || 'General Team',
                ...teamFormData,
                projectId: projectId
            };
                
                if (apiService.projects?.addTeamMember) {
                    const saved = await apiService.projects.addTeamMember(projectId, teamFormData);
                    updatedTeams.push(saved || newTeamMember);
                } else {
                    updatedTeams.push(newTeamMember);
                }
                setSnackbar({ open: true, message: 'Team member added successfully!', severity: 'success' });
            }
            
            // Update state and localStorage
            setProjectTeams(updatedTeams);
            localStorage.setItem(`project-teams-${projectId}`, JSON.stringify(updatedTeams));
            
            setOpenTeamDialog(false);
            setEditingTeam(null);
            setTeamFormData({
                name: '',
                role: '',
                email: '',
                phone: '',
                dateAppointed: '',
                dateEnded: '',
                notes: ''
            });
        } catch (err) {
            setSnackbar({ open: true, message: err.message || 'Failed to save team member.', severity: 'error' });
        }
    };

    const handleEditTeam = (team) => {
        setEditingTeam(team);
        setTeamFormData({
            teamName: team.teamName || '',
            name: team.name || '',
            role: team.role || '',
            email: team.email || '',
            phone: team.phone || '',
            dateAppointed: team.dateAppointed ? new Date(team.dateAppointed).toISOString().split('T')[0] : '',
            dateEnded: team.dateEnded ? new Date(team.dateEnded).toISOString().split('T')[0] : '',
            notes: team.notes || ''
        });
        setOpenTeamDialog(true);
    };

    const handleDeleteTeam = async (teamMemberId) => {
        if (!window.confirm('Are you sure you want to delete this team member?')) return;
        
        try {
            if (apiService.projects?.deleteTeamMember) {
                await apiService.projects.deleteTeamMember(projectId, teamMemberId);
            }
            
            // Update local state
            const updatedTeams = projectTeams.filter(t => t.teamMemberId !== teamMemberId);
            setProjectTeams(updatedTeams);
            localStorage.setItem(`project-teams-${projectId}`, JSON.stringify(updatedTeams));
            
            setSnackbar({ open: true, message: 'Team member deleted successfully!', severity: 'success' });
        } catch (err) {
            setSnackbar({ open: true, message: err.message || 'Failed to delete team member.', severity: 'error' });
        }
    };

    const handleDownloadTeamTemplate = () => {
        // Create Excel template with required columns
        const headers = ['Team Name', 'Name', 'Role', 'Email', 'Phone', 'Date Appointed', 'Date Ended', 'Notes'];
        const exampleRows = [
            ['Inspection Team', 'John Doe', 'Project Manager', 'john.doe@example.com', '+254712345678', '2024-01-01', '', 'Team leader'],
            ['Evaluation Committee', 'Jane Smith', 'Evaluation Committee', 'jane.smith@example.com', '+254712345679', '2024-01-15', '', 'Committee member'],
            ['PMC', 'Bob Johnson', 'PMC', 'bob.johnson@example.com', '+254712345680', '2024-02-01', '', 'PMC member']
        ];
        
        // Create worksheet data
        const worksheetData = [headers, ...exampleRows];
        
        // Create worksheet
        const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
        
        // Set column widths for better readability
        worksheet['!cols'] = [
            { wch: 20 }, // Team Name
            { wch: 25 }, // Name
            { wch: 25 }, // Role
            { wch: 30 }, // Email
            { wch: 18 }, // Phone
            { wch: 15 }, // Date Appointed
            { wch: 15 }, // Date Ended
            { wch: 30 }  // Notes
        ];
        
        // Freeze header row
        worksheet['!freeze'] = { xSplit: 0, ySplit: 1 };
        
        // Create workbook
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Team Template');
        
        // Generate Excel file
        const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
        const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        
        // Download file
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', `project-teams-template-${projectId}.xlsx`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        
        setSnackbar({ open: true, message: 'Excel template downloaded successfully!', severity: 'success' });
    };

    const handleTeamFileUpload = async (event) => {
        const file = event.target.files[0];
        if (!file) return;

        try {
            const fileExtension = file.name.split('.').pop().toLowerCase();
            let uploadedTeams = [];

            if (fileExtension === 'xlsx' || fileExtension === 'xls') {
                // Parse Excel file
                const arrayBuffer = await file.arrayBuffer();
                const workbook = XLSX.read(arrayBuffer, { 
                    type: 'array',
                    cellDates: true, // Parse dates properly
                    cellNF: false, // Don't parse number formats
                    cellText: false // Get raw values
                });
                
                // Get the first worksheet
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                
                // Convert to JSON array (array of arrays)
                const jsonData = XLSX.utils.sheet_to_json(worksheet, { 
                    header: 1, // Use array format
                    defval: '', // Default value for empty cells
                    raw: false, // Convert dates and numbers to strings
                    blankrows: false // Skip blank rows
                });
                
                console.log('Parsed Excel data (first 5 rows):', jsonData.slice(0, 5));
                console.log('Total rows in Excel:', jsonData.length);
                
                if (jsonData.length < 2) {
                    throw new Error('Excel file must contain at least a header row and one data row. Found only ' + jsonData.length + ' row(s).');
                }
                
                // First row is headers, skip it
                let skippedRows = 0;
                for (let i = 1; i < jsonData.length; i++) {
                    const row = jsonData[i];
                    
                    // Skip completely empty rows
                    if (!row || row.length === 0) {
                        skippedRows++;
                        continue;
                    }
                    
                    // Ensure row is an array
                    const rowArray = Array.isArray(row) ? row : [row];
                    
                    // Check if row has any non-empty cells
                    const hasData = rowArray.some(cell => {
                        if (cell === null || cell === undefined) return false;
                        const str = cell.toString().trim();
                        return str.length > 0;
                    });
                    
                    if (!hasData) {
                        skippedRows++;
                        continue;
                    }
                    
                    // Extract values, handling different data types
                    const getCellValue = (index) => {
                        if (index >= rowArray.length) return '';
                        const cell = rowArray[index];
                        if (cell === null || cell === undefined) return '';
                        // Handle date objects
                        if (cell instanceof Date) {
                            return cell.toISOString().split('T')[0];
                        }
                        // Handle Excel date serial numbers (if any)
                        if (typeof cell === 'number' && cell > 25569) { // Excel epoch starts at 1900-01-01
                            try {
                                const excelDate = XLSX.SSF.parse_date_code(cell);
                                if (excelDate) {
                                    const date = new Date(excelDate.y, excelDate.m - 1, excelDate.d);
                                    return date.toISOString().split('T')[0];
                                }
                            } catch (e) {
                                // Not a date, continue
                            }
                        }
                        return cell.toString().trim();
                    };
                    
                    const teamName = getCellValue(0);
                    const name = getCellValue(1);
                    const role = getCellValue(2);
                    const email = getCellValue(3);
                    const phone = getCellValue(4);
                    const dateAppointed = getCellValue(5);
                    const dateEnded = getCellValue(6);
                    const notes = getCellValue(7);
                    
                    const teamData = {
                        teamMemberId: `upload-${Date.now()}-${i}`,
                        teamName: teamName,
                        name: name,
                        role: role,
                        email: email,
                        phone: phone,
                        dateAppointed: dateAppointed,
                        dateEnded: dateEnded,
                        notes: notes,
                        projectId: projectId
                    };
                    
                    console.log(`Row ${i} parsed:`, teamData);
                    
                    // Only add if at least team name or name is provided
                    if (teamName || name) {
                        uploadedTeams.push(teamData);
                    } else {
                        skippedRows++;
                        console.log(`Row ${i} skipped: no team name or name provided`);
                    }
                }
                
                console.log(`Total team members parsed: ${uploadedTeams.length}`, uploadedTeams);
                console.log(`Skipped ${skippedRows} empty or invalid rows`);
            } else if (fileExtension === 'csv') {
                // Parse CSV file (backward compatibility)
                const text = await file.text();
                const lines = text.split('\n').filter(line => line.trim());
                const headers = lines[0].split(',').map(h => h.trim());
                
                for (let i = 1; i < lines.length; i++) {
                    const values = lines[i].split(',').map(v => v.trim());
                    if (values.length >= headers.length) {
                        const teamData = {
                            teamMemberId: Date.now().toString() + i,
                            teamName: values[0] || '',
                            name: values[1] || '',
                            role: values[2] || '',
                            email: values[3] || '',
                            phone: values[4] || '',
                            dateAppointed: values[5] || '',
                            dateEnded: values[6] || '',
                            notes: values[7] || '',
                            projectId: projectId
                        };
                        uploadedTeams.push(teamData);
                    }
                }
            } else {
                throw new Error('Unsupported file format. Please upload a .xlsx, .xls, or .csv file.');
            }
            
            if (uploadedTeams.length === 0) {
                throw new Error('No valid team member data found in the file. Please check the file format and ensure data rows are present.');
            }
            
            // Log before API call
            console.log('Uploading teams:', uploadedTeams);
            
            if (apiService.projects?.uploadTeamList) {
                try {
                    const formData = new FormData();
                    formData.append('file', file);
                    await apiService.projects.uploadTeamList(projectId, formData);
                } catch (apiError) {
                    console.warn('API upload failed, continuing with local storage:', apiError);
                    // Continue with local storage even if API fails
                }
            }
            
            // Update local state - merge with existing teams, avoiding duplicates
            const existingTeamIds = new Set(projectTeams.map(t => `${t.teamName}-${t.name}-${t.email}`));
            const newTeams = uploadedTeams.filter(t => {
                const key = `${t.teamName}-${t.name}-${t.email}`;
                return !existingTeamIds.has(key);
            });
            
            const updatedTeams = [...projectTeams, ...newTeams];
            console.log('Updated teams list:', updatedTeams);
            console.log(`Added ${newTeams.length} new team members (${uploadedTeams.length - newTeams.length} duplicates skipped)`);
            
            setProjectTeams(updatedTeams);
            localStorage.setItem(`project-teams-${projectId}`, JSON.stringify(updatedTeams));
            
            // Verify data was saved and trigger a re-render
            const savedData = localStorage.getItem(`project-teams-${projectId}`);
            const parsedData = savedData ? JSON.parse(savedData) : [];
            console.log('Saved to localStorage:', parsedData);
            console.log('Current state after update:', updatedTeams);
            
            // Force a refresh of the teams list
            setTimeout(() => {
                fetchProjectTeams();
            }, 100);
            
            setSnackbar({ 
                open: true, 
                message: `Successfully uploaded ${newTeams.length} team member(s)! ${uploadedTeams.length - newTeams.length > 0 ? `(${uploadedTeams.length - newTeams.length} duplicates skipped)` : ''}`, 
                severity: 'success' 
            });
            
            // Reset file input
            event.target.value = '';
        } catch (err) {
            console.error('Error uploading team list:', err);
            setSnackbar({ open: true, message: err.message || 'Failed to upload team list. Please check the file format.', severity: 'error' });
        }
    };

    // Group teams by team name
    const groupedTeams = useMemo(() => {
        const grouped = {};
        projectTeams.forEach(team => {
            const teamName = team.teamName || 'Unassigned';
            if (!grouped[teamName]) {
                grouped[teamName] = [];
            }
            grouped[teamName].push(team);
        });
        return grouped;
    }, [projectTeams]);

    const handleDownloadTeamsPDF = async () => {
        try {
            const doc = new jsPDF('portrait', 'pt', 'a4');
            const pageWidth = doc.internal.pageSize.getWidth();
            const pageHeight = doc.internal.pageSize.getHeight();
            let yPosition = 40;

            // Title
            doc.setFontSize(18);
            doc.setFont('helvetica', 'bold');
            doc.text('Project Team Members', pageWidth / 2, yPosition, { align: 'center' });
            yPosition += 20;

            // Project info
            doc.setFontSize(10);
            doc.setFont('helvetica', 'normal');
            doc.text(`Project: ${project?.projectName || 'N/A'}`, 40, yPosition);
            yPosition += 15;
            doc.text(`Generated: ${new Date().toLocaleDateString()}`, 40, yPosition);
            yPosition += 20;

            // Group teams by team name
            const teamGroups = Object.entries(groupedTeams);

            teamGroups.forEach(([teamName, members], teamIndex) => {
                // Check if we need a new page
                const membersPerPage = 4; // Approximate members per page
                const estimatedHeight = members.length * 60 + 40; // Height for team section
                
                if (yPosition + estimatedHeight > pageHeight - 40) {
                    doc.addPage();
                    yPosition = 40;
                }

                // Team header
                doc.setFontSize(14);
                doc.setFont('helvetica', 'bold');
                doc.setFillColor(41, 128, 185);
                doc.rect(40, yPosition - 10, pageWidth - 80, 20, 'F');
                doc.setTextColor(255, 255, 255);
                doc.text(teamName, 50, yPosition + 5);
                doc.setTextColor(0, 0, 0);
                yPosition += 25;

                // Table headers
                const headers = ['#', 'Name', 'Role', 'Email', 'Phone', 'Date Appointed', 'Signature'];
                const tableData = members.map((member, index) => [
                    (index + 1).toString(),
                    member.name || 'N/A',
                    member.role || 'N/A',
                    member.email || 'N/A',
                    member.phone || 'N/A',
                    formatDate(member.dateAppointed) || 'N/A',
                    '' // Empty space for signature
                ]);

                // Add table with signature column
                autoTable(doc, {
                    head: [headers],
                    body: tableData,
                    startY: yPosition,
                    styles: {
                        fontSize: 9,
                        cellPadding: 4,
                        overflow: 'linebreak',
                        halign: 'left'
                    },
                    headStyles: {
                        fillColor: [41, 128, 185],
                        textColor: 255,
                        fontStyle: 'bold',
                        fontSize: 9
                    },
                    columnStyles: {
                        0: { cellWidth: 20, halign: 'center' }, // #
                        1: { cellWidth: 80 }, // Name
                        2: { cellWidth: 70 }, // Role
                        3: { cellWidth: 90 }, // Email
                        4: { cellWidth: 70 }, // Phone
                        5: { cellWidth: 70 }, // Date Appointed
                        6: { cellWidth: 80, halign: 'center' } // Signature
                    },
                    margin: { left: 40, right: 40 },
                    alternateRowStyles: { fillColor: [245, 245, 245] }
                });

                // Get the final Y position after the table
                yPosition = doc.lastAutoTable.finalY + 15;

                // Add spacing between teams
                if (teamIndex < teamGroups.length - 1) {
                    yPosition += 10;
                }
            });

            // Save PDF
            const filename = `project-teams-${projectId}-${new Date().toISOString().split('T')[0]}.pdf`;
            doc.save(filename);
            setSnackbar({ open: true, message: 'PDF downloaded successfully!', severity: 'success' });
        } catch (err) {
            console.error('Error generating PDF:', err);
            setSnackbar({ open: true, message: err.message || 'Failed to download PDF.', severity: 'error' });
        }
    };

    const handlePrintTeams = () => {
        // Create a print-friendly version
        const printWindow = window.open('', '_blank');
        const printContent = `
            <!DOCTYPE html>
            <html>
            <head>
                <title>Project Team Members</title>
                <style>
                    @media print {
                        @page { margin: 1cm; }
                        body { margin: 0; }
                    }
                    body {
                        font-family: Arial, sans-serif;
                        padding: 20px;
                    }
                    h1 {
                        text-align: center;
                        color: #2980b9;
                        margin-bottom: 10px;
                    }
                    .project-info {
                        text-align: center;
                        margin-bottom: 30px;
                        color: #666;
                    }
                    .team-section {
                        margin-bottom: 30px;
                        page-break-inside: avoid;
                    }
                    .team-header {
                        background-color: #2980b9;
                        color: white;
                        padding: 10px;
                        font-weight: bold;
                        font-size: 16px;
                        margin-bottom: 10px;
                    }
                    table {
                        width: 100%;
                        border-collapse: collapse;
                        margin-bottom: 20px;
                    }
                    th, td {
                        border: 1px solid #ddd;
                        padding: 8px;
                        text-align: left;
                        font-size: 11px;
                    }
                    th {
                        background-color: #2980b9;
                        color: white;
                        font-weight: bold;
                    }
                    tr:nth-child(even) {
                        background-color: #f5f5f5;
                    }
                    .signature-cell {
                        width: 100px;
                        height: 40px;
                        border: 1px solid #ccc;
                    }
                </style>
            </head>
            <body>
                <h1>Project Team Members</h1>
                <div class="project-info">
                    <strong>Project:</strong> ${project?.projectName || 'N/A'}<br>
                    <strong>Generated:</strong> ${new Date().toLocaleDateString()}
                </div>
                ${Object.entries(groupedTeams).map(([teamName, members]) => `
                    <div class="team-section">
                        <div class="team-header">${teamName}</div>
                        <table>
                            <thead>
                                <tr>
                                    <th>#</th>
                                    <th>Name</th>
                                    <th>Role</th>
                                    <th>Email</th>
                                    <th>Phone</th>
                                    <th>Date Appointed</th>
                                    <th>Signature</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${members.map((member, index) => `
                                    <tr>
                                        <td>${index + 1}</td>
                                        <td>${member.name || 'N/A'}</td>
                                        <td>${member.role || 'N/A'}</td>
                                        <td>${member.email || 'N/A'}</td>
                                        <td>${member.phone || 'N/A'}</td>
                                        <td>${formatDate(member.dateAppointed) || 'N/A'}</td>
                                        <td><div class="signature-cell"></div></td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                `).join('')}
            </body>
            </html>
        `;
        printWindow.document.write(printContent);
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => {
            printWindow.print();
        }, 250);
    };
    
    // This effect now conditionally fetches data based on the access check
    useEffect(() => {
        if (isAccessAllowed) {
            fetchProjectDetails();
            fetchProjectPhotos();
            fetchProjectContractors();
            fetchProjectTeams();
        }
    }, [isAccessAllowed, fetchProjectDetails, fetchProjectPhotos, fetchProjectTeams]);

    useEffect(() => {
        if (!milestones.length && !milestoneActivities.length) {
            return;
        }

        const accomplishedActivities = milestoneActivities.filter(a => a.activityStatus === 'completed');
        const accomplishedMilestoneIds = new Set(accomplishedActivities.map(a => a.milestoneId));
        const accomplishedMilestones = milestones.filter(m => accomplishedMilestoneIds.has(m.milestoneId));

        const totalAccomplishedBudget = accomplishedActivities.reduce((sum, activity) => sum + (parseFloat(activity.budgetAllocated) || 0), 0);

        setPaymentJustification({
            totalBudget: totalAccomplishedBudget,
            accomplishedActivities: accomplishedActivities,
            accomplishedMilestones: accomplishedMilestones
        });
    }, [milestones, milestoneActivities]);

    const handleApplyMilestoneTemplate = async () => {
        if (!checkUserPrivilege(user, 'project.apply_template')) {
            setSnackbar({ open: true, message: 'Permission denied to apply milestone templates.', severity: 'error' });
            return;
        }
        setApplyingTemplate(true);
        try {
            const response = await apiService.projects.applyMilestoneTemplate(projectId);
            setSnackbar({ open: true, message: response.message, severity: 'success' });
            fetchProjectDetails();
        } catch (err) {
            setSnackbar({ open: true, message: err.response?.data?.message || 'Failed to apply milestone template.', severity: 'error' });
        } finally {
            setApplyingTemplate(false);
        }
    };

    const handleOpenCreateMilestoneDialog = () => {
        if (!checkUserPrivilege(user, 'milestone.create')) {
            setSnackbar({ open: true, message: 'You do not have permission to create milestones.', severity: 'error' });
            return;
        }
        setCurrentMilestone(null);
        setOpenMilestoneDialog(true);
    };

    const handleOpenEditMilestoneDialog = (milestone) => {
        if (!checkUserPrivilege(user, 'milestone.update')) {
            setSnackbar({ open: true, message: 'You do not have permission to update milestones.', severity: 'error' });
            return;
        }
        setCurrentMilestone(milestone);
        setOpenMilestoneDialog(true);
    };

    const handleCloseMilestoneDialog = () => {
        setOpenMilestoneDialog(false);
        setCurrentMilestone(null);
    };

    const handleMilestoneSubmit = async (dataToSubmit) => {
        try {
            if (currentMilestone) {
                if (!checkUserPrivilege(user, 'milestone.update')) {
                    setSnackbar({ open: true, message: 'You do not have permission to update milestones.', severity: 'error' });
                    return;
                }
                await apiService.milestones.updateMilestone(currentMilestone.milestoneId, dataToSubmit);
                setSnackbar({ open: true, message: 'Milestone updated successfully!', severity: 'success' });
            } else {
                if (!checkUserPrivilege(user, 'milestone.create')) {
                    setSnackbar({ open: true, message: 'You do not have permission to create milestones.', severity: 'error' });
                    return;
                }
                await apiService.milestones.createMilestone(dataToSubmit);
                setSnackbar({ open: true, message: 'Milestone created successfully!', severity: 'success' });
            }
            handleCloseMilestoneDialog();
            fetchProjectDetails();
        } catch (err) {
            console.error("Submit milestone error:", err);
            setSnackbar({ open: true, message: err.error || err.message || 'Failed to save milestone.', severity: 'error' });
        }
    };

    const handleDeleteMilestone = async (milestoneId) => {
        if (!checkUserPrivilege(user, 'milestone.delete')) {
            setSnackbar({ open: true, message: 'You do not have permission to delete milestones.', severity: 'error' });
            return;
        }
        if (window.confirm('Are you sure you want to delete this milestone?')) {
            try {
                await apiService.milestones.deleteMilestone(milestoneId);
                setSnackbar({ open: true, message: 'Milestone deleted successfully!', severity: 'success' });
                fetchProjectDetails();
            } catch (err) {
                console.error("Delete milestone error:", err);
                setSnackbar({ open: true, message: err.error || err.message || 'Failed to delete milestone.', severity: 'error' });
            }
        }
    };

    const handleCloseSnackbar = (event, reason) => {
        if (reason === 'clickaway') {
            return;
        }
        setSnackbar({ ...snackbar, open: false });
    };

    const handleManagePhotos = () => {
        navigate(`/projects/${projectId}/photos`);
    };

    const handleOpenMonitoringModal = () => {
        setOpenMonitoringModal(true);
    };
    const handleCloseMonitoringModal = () => {
        setOpenMonitoringModal(false);
        setEditingMonitoringRecord(null);
        // Refresh monitoring data when modal is closed
        fetchMonitoringRecords();
    };

    const handleEditMonitoringRecord = (record) => {
        setEditingMonitoringRecord(record);
        setOpenMonitoringModal(true);
    };

    const handleMonitoringEditComplete = () => {
        setEditingMonitoringRecord(null);
        fetchMonitoringRecords();
    };

    const handleOpenReviewPanel = () => {
        setOpenReviewPanel(true);
    };
    const handleCloseReviewPanel = () => {
        setOpenReviewPanel(false);
    };

    const handleOpenPaymentRequest = () => {
        setOpenPaymentModal(true);
    };

    const handlePaymentRequestSubmit = async (projectId, formData) => {
        try {
            const newRequest = await apiService.paymentRequests.createRequest(projectId, formData);

            setSnackbar({ open: true, message: 'Payment request submitted successfully!', severity: 'success' });

            setOpenPaymentModal(false);
            setSelectedRequestId(newRequest.requestId);
            setOpenDocumentUploader(true);

            fetchProjectDetails();
        } catch (err) {
            setSnackbar({ open: true, message: err.message || 'Failed to submit payment request.', severity: 'error' });
        }
    };

    const handleOpenCreateActivityDialog = (workplanId, workplanName) => {
        setOpenActivityDialog(true);
        setCurrentActivity(null);
        setActivityFormData({
            activityName: '',
            activityDescription: '',
            responsibleOfficer: null,
            startDate: '',
            endDate: '',
            budgetAllocated: null,
            actualCost: null,
            percentageComplete: null,
            activityStatus: '',
            projectId: null,
            workplanId: workplanId,
            milestoneIds: [],
            selectedWorkplanName: workplanName
        });
    };

    const handleOpenEditActivityDialog = async (activity) => {
        setSnackbar({ open: true, message: 'Loading activity details...', severity: 'info' });

        try {
            const milestoneActivitiesData = await apiService.strategy.milestoneActivities.getActivitiesByActivityId(activity.activityId);
            const currentMilestoneIds = milestoneActivitiesData.map(ma => ma.milestoneId);

            const workplanName = projectWorkPlans.find(wp => wp.workplanId === activity.workplanId)?.workplanName || '';

            setActivityFormData({
                ...activity,
                startDate: activity.startDate ? new Date(activity.startDate).toISOString().split('T')[0] : '',
                endDate: activity.endDate ? new Date(activity.endDate).toISOString().split('T')[0] : '',
                milestoneIds: currentMilestoneIds,
                selectedWorkplanName: workplanName
            });

            setCurrentActivity(activity);
            setOpenActivityDialog(true);
            setSnackbar({ open: false });
        } catch (err) {
            console.error("❌ Error in handleOpenEditActivityDialog:", err);
            setSnackbar({ open: true, message: 'Failed to load activity for editing. Please try again.', severity: 'error' });
            setOpenActivityDialog(false);
        }
    };

    const handleCloseActivityDialog = () => {
        setOpenActivityDialog(false);
        setCurrentActivity(null);
    };

    const handleActivitySubmit = async (formData) => {
        try {
            let activityIdToUse;

            const { selectedWorkplanName, ...payload } = formData;

            if (currentActivity) {
                await apiService.strategy.activities.updateActivity(currentActivity.activityId, payload);
                activityIdToUse = currentActivity.activityId;
                setSnackbar({ open: true, message: 'Activity updated successfully!', severity: 'success' });
            } else {
                const createdActivity = await apiService.strategy.activities.createActivity(payload);
                activityIdToUse = createdActivity.activityId;
                setSnackbar({ open: true, message: 'Activity created successfully!', severity: 'success' });
            }

            if (activityIdToUse) {
                const existingMilestoneLinks = await apiService.strategy.milestoneActivities.getActivitiesByActivityId(activityIdToUse);
                const existingMilestoneIds = new Set(existingMilestoneLinks.map(link => link.milestoneId));
                const newMilestoneIds = new Set(payload.milestoneIds);

                const milestonesToLink = Array.from(newMilestoneIds).filter(id => !existingMilestoneIds.has(id));
                const milestonesToUnlink = Array.from(existingMilestoneIds).filter(id => !newMilestoneIds.has(id));

                await Promise.all(milestonesToLink.map(milestoneId =>
                    apiService.strategy.milestoneActivities.createMilestoneActivity({
                        milestoneId: milestoneId,
                        activityId: activityIdToUse
                    })
                ));

                await Promise.all(milestonesToUnlink.map(milestoneId =>
                    apiService.strategy.milestoneActivities.deleteMilestoneActivity(milestoneId, activityIdToUse)
                ));
            }

            handleCloseActivityDialog();
            fetchProjectDetails();
        } catch (err) {
            setSnackbar({ open: true, message: err.message || 'Failed to save activity.', severity: 'error' });
        }
    };

    const handleDeleteActivity = async (activityId) => {
        if (window.confirm('Are you sure you want to delete this activity?')) {
            try {
                await apiService.strategy.activities.deleteActivity(activityId);
                setSnackbar({ open: true, message: 'Activity deleted successfully!', severity: 'success' });
                fetchProjectDetails();
            } catch (err) {
                setSnackbar({ open: true, message: err.message || 'Failed to delete activity.', severity: 'error' });
            }
        }
    };

    const handleOpenDocumentUploader = (requestId) => {
        setSelectedRequestId(requestId);
        setOpenDocumentUploader(true);
    };

    const handleCloseDocumentUploader = () => {
        setOpenDocumentUploader(false);
        setSelectedRequestId(null);
        fetchProjectDetails();
    };

    const canApplyTemplate = !!projectCategory && checkUserPrivilege(user, 'project.apply_template');
    
    // UPDATED: New logic for canReviewSubmissions
    const canReviewSubmissions = checkUserPrivilege(user, 'project_manager.review') || (user?.contractorId && isAccessAllowed);

    // Manage Loading and Error States for both Access Control and Data Fetching
    if (authLoading || accessLoading) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
                <CircularProgress />
            </Box>
        );
    }
    
    if (accessError) {
        return (
            <Box sx={{ p: 3 }}>
                <Alert severity="error">{accessError}</Alert>
            </Box>
        );
    }
    
    if (loading) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
                <CircularProgress />
            </Box>
        );
    }

    if (error) {
        return (
            <Box sx={{ p: 3 }}>
                <Alert severity="error">{error}</Alert>
            </Box>
        );
    }

    if (!project) {
        return (
            <Box sx={{ p: 3 }}>
                <Alert severity="error">Project not found or an unexpected error occurred.</Alert>
            </Box>
        );
    }

    // Ensure overallProgress is a number, defaulting to 0 if null/undefined/invalid
    const overallProgress = project?.overallProgress != null 
        ? parseFloat(project.overallProgress) || 0 
        : 0;

    // Calculate financial metrics
    const totalBudget = parseFloat(project?.costOfProject) || 0;
    const contractedAmount = parseFloat(project?.Contracted) || 0;
    const paidAmount = parseFloat(project?.paidOut) || 0;
    const remainingBudget = totalBudget - contractedAmount;
    // Disbursement rate: fraction of budget vs disbursed
    const disbursementRate = totalBudget > 0 ? (paidAmount / totalBudget) * 100 : 0;
    const contractPercentage = totalBudget > 0 ? (contractedAmount / totalBudget) * 100 : 0;
    const paymentPercentage = contractedAmount > 0 ? (paidAmount / contractedAmount) * 100 : 0;
    const serverUrl = import.meta.env.VITE_API_BASE_URL || '';

    return (
                    <Box sx={{ 
                p: 1, 
                backgroundColor: theme.palette.mode === 'dark' ? colors.primary[400] : '#E3F2FD', // Very light blue for light mode
                minHeight: '100vh',
                background: theme.palette.mode === 'dark' 
                    ? `linear-gradient(135deg, ${colors.primary[400]} 0%, ${colors.primary[500]} 100%)`
                    : '#E3F2FD', // Very light blue background
                position: 'relative',
                '&::before': theme.palette.mode === 'light' ? {
                    content: '""',
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: `radial-gradient(circle at 20% 80%, rgba(33, 150, 243, 0.05) 0%, transparent 50%), radial-gradient(circle at 80% 20%, rgba(76, 175, 80, 0.05) 0%, transparent 50%)`,
                    pointerEvents: 'none'
                } : {}
            }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                <Button
                    variant="outlined"
                    startIcon={<ArrowBackIcon />}
                    onClick={() => navigate('/projects')}
                    sx={{
                        borderColor: theme.palette.mode === 'dark' ? colors.blueAccent[700] : colors.blueAccent[500],
                        color: theme.palette.mode === 'dark' ? colors.blueAccent[700] : colors.blueAccent[600],
                        '&:hover': {
                            borderColor: theme.palette.mode === 'dark' ? colors.blueAccent[600] : colors.blueAccent[600],
                            backgroundColor: theme.palette.mode === 'dark' ? colors.blueAccent[700] : colors.blueAccent[500],
                            color: theme.palette.mode === 'dark' ? colors.grey[100] : colors.grey[100]
                        },
                        fontWeight: 'bold',
                        borderRadius: '8px',
                        px: 2,
                        py: 0.5,
                        boxShadow: theme.palette.mode === 'light' ? `0 2px 8px ${colors.blueAccent[100]}40` : 'none'
                    }}
                >
                    Back to Projects
                </Button>
            </Box>

            {/* Consolidated Top Section */}
            <Paper elevation={8} sx={{ 
                p: 1, 
                mb: 0.5, 
                borderRadius: '12px',
                background: theme.palette.mode === 'dark'
                    ? `linear-gradient(135deg, ${colors.primary[500]} 0%, ${colors.primary[600]} 100%)`
                    : '#FFFFFF', // White background for light mode
                border: `2px solid ${theme.palette.mode === 'dark' ? colors.blueAccent[700] : colors.blueAccent[200]}`,
                boxShadow: theme.palette.mode === 'dark'
                    ? `0 12px 40px rgba(0, 0, 0, 0.35), 0 6px 20px rgba(0, 0, 0, 0.25)`
                    : `0 12px 40px rgba(0, 0, 0, 0.15), 0 6px 20px rgba(0, 0, 0, 0.1), 0 0 0 1px ${colors.blueAccent[100]}`,
                position: 'relative',
                overflow: 'hidden',
                transition: 'all 0.3s ease-in-out',
                '&:hover': {
                    boxShadow: theme.palette.mode === 'dark'
                        ? `0 16px 48px rgba(0, 0, 0, 0.4), 0 8px 24px rgba(0, 0, 0, 0.3)`
                        : `0 16px 48px rgba(0, 0, 0, 0.18), 0 8px 24px rgba(0, 0, 0, 0.12)`
                },
                '&::before': {
                    content: '""',
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    height: '5px',
                    background: `linear-gradient(90deg, ${colors.blueAccent[500]}, ${colors.greenAccent[500]}, ${colors.blueAccent[500]})`,
                    backgroundSize: '200% 100%',
                    animation: 'shimmer 3s ease-in-out infinite',
                    '@keyframes shimmer': {
                        '0%': { backgroundPosition: '200% 0' },
                        '100%': { backgroundPosition: '-200% 0' }
                    }
                }
            }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', mb: 0.5 }}>
                    <Stack direction="row" alignItems="center" spacing={1} sx={{ flexGrow: 1, minWidth: 0 }}>
                        <Typography
                            variant="h3"
                            component="h1"
                            sx={{
                                fontWeight: 700,
                                fontSize: { xs: '1.35rem', sm: '1.6rem', md: '1.85rem' },
                                color: theme.palette.mode === 'dark' ? colors.grey[100] : '#1a1a1a',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                flexShrink: 1,
                                textShadow: theme.palette.mode === 'dark' ? '2px 2px 4px rgba(0, 0, 0, 0.3)' : '0 1px 2px rgba(0, 0, 0, 0.1)',
                                letterSpacing: '0.3px',
                                lineHeight: 1.2,
                                background: theme.palette.mode === 'light' 
                                    ? 'linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%)'
                                    : 'none',
                                WebkitBackgroundClip: theme.palette.mode === 'light' ? 'text' : 'none',
                                WebkitTextFillColor: theme.palette.mode === 'light' ? 'transparent' : 'inherit',
                                backgroundClip: theme.palette.mode === 'light' ? 'text' : 'none'
                            }}
                        >
                            {project?.projectName || 'Project Name Missing'}
                        </Typography>
                        <Chip
                            label={project?.status || 'N/A'}
                            className="status-chip"
                            sx={{
                                backgroundColor: getProjectStatusBackgroundColor(project?.status),
                                color: getProjectStatusTextColor(project?.status),
                                fontWeight: 'bold',
                                fontSize: '0.875rem',
                                height: '32px',
                                flexShrink: 0,
                                px: 1.5,
                                boxShadow: theme.palette.mode === 'light' ? '0 2px 4px rgba(0, 0, 0, 0.1)' : '0 2px 8px rgba(0, 0, 0, 0.3)',
                                // Enhanced color rendering
                                WebkitColorAdjust: 'exact',
                                colorAdjust: 'exact',
                                transform: 'translateZ(0)',
                                backfaceVisibility: 'hidden',
                                isolation: 'isolate'
                            }}
                        />
                        {getPublicApprovalStatus(project) && (
                            <Chip
                                label={getPublicApprovalStatus(project).label}
                                icon={getPublicApprovalStatus(project).icon}
                                color={getPublicApprovalStatus(project).color}
                                size="small"
                                sx={{
                                    fontWeight: 'bold',
                                    fontSize: '0.75rem',
                                    height: '28px',
                                    flexShrink: 0,
                                    px: 1,
                                    boxShadow: theme.palette.mode === 'light' ? '0 2px 4px rgba(0, 0, 0, 0.1)' : '0 2px 8px rgba(0, 0, 0, 0.3)',
                                    '& .MuiChip-icon': { fontSize: 14 }
                                }}
                            />
                        )}
                    </Stack>
                    <Stack direction="row" spacing={1} sx={{ flexShrink: 0 }}>
                        {canReviewSubmissions && (
                            <Tooltip title="Review Contractor Submissions">
                                <IconButton 
                                    color="success" 
                                    onClick={handleOpenReviewPanel}
                                    sx={{
                                        backgroundColor: theme.palette.mode === 'dark' ? 'rgba(76, 175, 80, 0.2)' : 'rgba(76, 175, 80, 0.1)',
                                        '&:hover': {
                                            backgroundColor: theme.palette.mode === 'dark' ? 'rgba(76, 175, 80, 0.3)' : 'rgba(76, 175, 80, 0.2)',
                                            transform: 'scale(1.1)',
                                            transition: 'all 0.2s ease-in-out'
                                        },
                                        transition: 'all 0.2s ease-in-out'
                                    }}
                                >
                                    <PaidIcon />
                                </IconButton>
                            </Tooltip>
                        )}
                        <Tooltip title="View Project Monitoring">
                            <IconButton 
                                color="info" 
                                onClick={handleOpenMonitoringModal}
                                sx={{
                                    backgroundColor: theme.palette.mode === 'dark' ? 'rgba(33, 150, 243, 0.2)' : 'rgba(33, 150, 243, 0.1)',
                                    '&:hover': {
                                        backgroundColor: theme.palette.mode === 'dark' ? 'rgba(33, 150, 243, 0.3)' : 'rgba(33, 150, 243, 0.2)',
                                        transform: 'scale(1.1)',
                                        transition: 'all 0.2s ease-in-out'
                                    },
                                    transition: 'all 0.2s ease-in-out'
                                }}
                            >
                                <VisibilityIcon />
                            </IconButton>
                        </Tooltip>
                        <Tooltip title="Manage Project Photos">
                            <IconButton 
                                color="secondary" 
                                onClick={handleManagePhotos}
                                sx={{
                                    backgroundColor: theme.palette.mode === 'dark' ? 'rgba(156, 39, 176, 0.2)' : 'rgba(156, 39, 176, 0.1)',
                                    '&:hover': {
                                        backgroundColor: theme.palette.mode === 'dark' ? 'rgba(156, 39, 176, 0.3)' : 'rgba(156, 39, 176, 0.2)',
                                        transform: 'scale(1.1)',
                                        transition: 'all 0.2s ease-in-out'
                                    },
                                    transition: 'all 0.2s ease-in-out'
                                }}
                            >
                                <PhotoCameraIcon />
                            </IconButton>
                        </Tooltip>
                    </Stack>
                </Box>
                <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mt: 0.5, pt: 0.5, borderTop: `1px solid ${theme.palette.mode === 'dark' ? colors.blueAccent[700] : colors.blueAccent[200]}` }}>
                    <Typography variant="h6" sx={{ 
                        fontWeight: 600, 
                        flexShrink: 0,
                        fontSize: '1rem',
                        color: theme.palette.mode === 'dark' ? colors.grey[200] : '#333333',
                        textShadow: theme.palette.mode === 'dark' ? '1px 1px 2px rgba(0, 0, 0, 0.3)' : 'none',
                        minWidth: '160px'
                    }}>
                        Overall Progress: <strong style={{ color: theme.palette.mode === 'dark' ? colors.greenAccent[400] : colors.greenAccent[600], fontSize: '1.1rem' }}>{overallProgress.toFixed(2)}%</strong>
                    </Typography>
                    <LinearProgress
                        variant="determinate"
                        value={Math.min(100, Math.max(0, overallProgress))}
                        sx={{ 
                            flexGrow: 1, 
                            height: 12, 
                            borderRadius: 6, 
                            bgcolor: theme.palette.mode === 'dark' ? colors.grey[700] : colors.grey[200],
                            boxShadow: theme.palette.mode === 'light' ? `inset 0 2px 4px rgba(0, 0, 0, 0.08)` : 'none',
                            border: theme.palette.mode === 'light' ? `1px solid ${colors.grey[300]}` : 'none',
                            '& .MuiLinearProgress-bar': {
                                borderRadius: 8,
                                background: `linear-gradient(90deg, ${colors.greenAccent[500]} 0%, ${colors.greenAccent[600]} 50%, ${colors.greenAccent[500]} 100%)`,
                                backgroundSize: '200% 100%',
                                boxShadow: theme.palette.mode === 'light' 
                                    ? `0 2px 8px ${colors.greenAccent[500]}80, inset 0 1px 0 rgba(255, 255, 255, 0.2)` 
                                    : `0 2px 8px ${colors.greenAccent[500]}60`,
                                transition: 'width 0.6s ease-in-out',
                                animation: 'shimmer 2s ease-in-out infinite',
                                '@keyframes shimmer': {
                                    '0%': { backgroundPosition: '200% 0' },
                                    '100%': { backgroundPosition: '-200% 0' }
                                }
                            }
                        }}
                    />
                </Stack>
            </Paper>

            {/* Key Metrics Cards */}
            <Grid container spacing={1} sx={{ mb: 0.5 }}>
                {/* Total Budget Card */}
                <Grid item xs={12} sm={6} md={3}>
                    <Card sx={{ 
                        background: isLight 
                            ? 'linear-gradient(135deg, #2196f3 0%, #42a5f5 100%)'
                            : `linear-gradient(135deg, ${colors.blueAccent[800]}, ${colors.blueAccent[700]})`,
                        color: 'white',
                        height: '100%',
                        boxShadow: theme.palette.mode === 'dark' ? 4 : `0 4px 20px rgba(33, 150, 243, 0.2)`,
                        borderRadius: '12px',
                        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                        position: 'relative',
                        overflow: 'hidden',
                        '&::before': {
                            content: '""',
                            position: 'absolute',
                            top: 0,
                            left: '-100%',
                            width: '100%',
                            height: '100%',
                            background: 'linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.1), transparent)',
                            transition: 'left 0.5s'
                        },
                        '&:hover': {
                            transform: 'translateY(-6px) scale(1.02)',
                            boxShadow: theme.palette.mode === 'dark' ? 8 : `0 8px 32px rgba(33, 150, 243, 0.4)`,
                            '&::before': {
                                left: '100%'
                            }
                        }
                    }}>
                        <CardContent>
                            <Box display="flex" alignItems="center" justifyContent="space-between">
                                <Box>
                                    <Typography variant="caption" sx={{ opacity: 0.9, fontSize: '0.75rem' }}>
                                        Total Budget
                                    </Typography>
                                    <Typography variant="h6" sx={{ fontWeight: 'bold', mt: 0.25 }}>
                                        {formatCurrency(totalBudget)}
                                    </Typography>
                                </Box>
                                <MoneyIcon sx={{ fontSize: 40, opacity: 0.8 }} />
                            </Box>
                        </CardContent>
                    </Card>
                </Grid>

                {/* Sites Summary Card */}
                <Grid item xs={12} sm={6} md={3}>
                    <Card sx={{ 
                        background: isLight 
                            ? 'linear-gradient(135deg, #42a5f5 0%, #64b5f6 100%)'
                            : `linear-gradient(135deg, ${colors.blueAccent[700]}, ${colors.blueAccent[600]})`,
                        color: 'white',
                        height: '100%',
                        boxShadow: theme.palette.mode === 'dark' ? 4 : `0 4px 20px rgba(66, 165, 245, 0.2)`,
                        borderRadius: '12px',
                        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                    }}>
                        <CardContent sx={{ p: 0.75, '&:last-child': { pb: 0.75 } }}>
                            <Box display="flex" alignItems="center" justifyContent="space-between">
                                <Box>
                                    <Typography variant="caption" sx={{ opacity: 0.9, fontSize: '0.7rem' }}>
                                        Sites
                                    </Typography>
                                    <Typography variant="h6" sx={{ fontWeight: 'bold', mt: 0.2, fontSize: '0.95rem' }}>
                                        {projectSites.length}
                                    </Typography>
                                    <Typography variant="caption" sx={{ opacity: 0.8, mt: 0.25, fontSize: '0.65rem' }}>
                                        Total project sites
                                    </Typography>
                                </Box>
                                <LocationOnIcon sx={{ fontSize: 28, opacity: 0.9 }} />
                            </Box>
                        </CardContent>
                    </Card>
                </Grid>

                {/* Disbursed Card */}
                <Grid item xs={12} sm={6} md={3}>
                    <Card sx={{ 
                        background: isLight 
                            ? 'linear-gradient(135deg, #4caf50 0%, #81c784 100%)'
                            : `linear-gradient(135deg, ${colors.greenAccent[800]}, ${colors.greenAccent[700]})`,
                        color: 'white',
                        height: '100%',
                        boxShadow: theme.palette.mode === 'dark' ? 4 : `0 4px 20px rgba(76, 175, 80, 0.2)`,
                        borderRadius: '12px',
                        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                        position: 'relative',
                        overflow: 'hidden',
                        '&::before': {
                            content: '""',
                            position: 'absolute',
                            top: 0,
                            left: '-100%',
                            width: '100%',
                            height: '100%',
                            background: 'linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.1), transparent)',
                            transition: 'left 0.5s'
                        },
                        '&:hover': {
                            transform: 'translateY(-6px) scale(1.02)',
                            boxShadow: theme.palette.mode === 'dark' ? 8 : `0 8px 32px rgba(76, 175, 80, 0.4)`,
                            '&::before': {
                                left: '100%'
                            }
                        }
                    }}>
                        <CardContent>
                            <Box display="flex" alignItems="center" justifyContent="space-between">
                                <Box>
                                    <Typography variant="caption" sx={{ opacity: 0.9, fontSize: '0.75rem' }}>
                                        Disbursed
                                    </Typography>
                                    <Typography variant="h6" sx={{ fontWeight: 'bold', mt: 0.25 }}>
                                        {formatCurrency(paidAmount)}
                                    </Typography>
                                    <Typography variant="caption" sx={{ opacity: 0.8, mt: 0.5, fontSize: '0.7rem' }}>
                                        {paymentPercentage.toFixed(1)}% of contracted
                                    </Typography>
                                </Box>
                                <PaidIcon sx={{ fontSize: 40, opacity: 0.8 }} />
                            </Box>
                        </CardContent>
                    </Card>
                </Grid>

                {/* Disbursement Rate Card */}
                <Grid item xs={12} sm={6} md={3}>
                    <Card sx={{ 
                        background: isLight 
                            ? 'linear-gradient(135deg, #26a69a 0%, #4db6ac 100%)'
                            : `linear-gradient(135deg, ${colors.tealAccent?.[800] || colors.greenAccent[800]}, ${colors.tealAccent?.[700] || colors.greenAccent[700]})`,
                        color: 'white',
                        height: '100%',
                        boxShadow: theme.palette.mode === 'dark' ? 4 : `0 4px 20px rgba(38, 166, 154, 0.2)`,
                        borderRadius: '12px',
                        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                        position: 'relative',
                        overflow: 'hidden',
                        '&::before': {
                            content: '""',
                            position: 'absolute',
                            top: 0,
                            left: '-100%',
                            width: '100%',
                            height: '100%',
                            background: 'linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.1), transparent)',
                            transition: 'left 0.5s'
                        },
                        '&:hover': {
                            transform: 'translateY(-6px) scale(1.02)',
                            boxShadow: theme.palette.mode === 'dark' ? 8 : `0 8px 32px rgba(38, 166, 154, 0.4)`,
                            '&::before': {
                                left: '100%'
                            }
                        }
                    }}>
                        <CardContent>
                            <Box display="flex" alignItems="center" justifyContent="space-between">
                                <Box>
                                    <Typography variant="caption" sx={{ opacity: 0.9, fontSize: '0.75rem' }}>
                                        Disbursement Rate
                                    </Typography>
                                    <Typography variant="h6" sx={{ fontWeight: 'bold', mt: 0.25 }}>
                                        {disbursementRate.toFixed(1)}%
                                    </Typography>
                                    <Typography variant="caption" sx={{ opacity: 0.8, mt: 0.5, fontSize: '0.7rem' }}>
                                        Disbursed vs Budget
                                    </Typography>
                                </Box>
                                <ScheduleIcon sx={{ fontSize: 40, opacity: 0.8 }} />
                            </Box>
                        </CardContent>
                    </Card>
                </Grid>

                {/* Jobs Summary Card */}
                <Grid item xs={12} sm={6} md={3}>
                    <Card sx={{ 
                        background: isLight 
                            ? 'linear-gradient(135deg, #7e57c2 0%, #9575cd 100%)'
                            : `linear-gradient(135deg, ${colors.primary[700]}, ${colors.primary[500]})`,
                        color: 'white',
                        height: '100%',
                        boxShadow: theme.palette.mode === 'dark' ? 4 : `0 4px 20px rgba(126, 87, 194, 0.25)`,
                        borderRadius: '12px',
                        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                    }}>
                        <CardContent sx={{ p: 0.75, '&:last-child': { pb: 0.75 } }}>
                            <Box display="flex" alignItems="center" justifyContent="space-between">
                                <Box>
                                    <Typography variant="caption" sx={{ opacity: 0.9, fontSize: '0.7rem' }}>
                                        Jobs Created
                                    </Typography>
                                    <Typography variant="h6" sx={{ fontWeight: 'bold', mt: 0.2, fontSize: '0.95rem' }}>
                                        {jobsSummary.totalJobs}
                                    </Typography>
                                    <Typography variant="caption" sx={{ opacity: 0.8, mt: 0.25, fontSize: '0.65rem' }}>
                                        Across all job categories
                                    </Typography>
                                </Box>
                                <WorkIcon sx={{ fontSize: 28, opacity: 0.9 }} />
                            </Box>
                        </CardContent>
                    </Card>
                </Grid>
            </Grid>

            {/* Project Photos Carousel */}
            {projectPhotos.length > 0 && (
                <Paper elevation={6} sx={{ 
                    p: 1, 
                    mb: 1, 
                    borderRadius: '12px',
                    background: theme.palette.mode === 'dark'
                        ? `linear-gradient(135deg, ${colors.primary[400]} 0%, ${colors.primary[500]} 100%)`
                        : `linear-gradient(135deg, ${colors.grey[900]} 0%, ${colors.grey[800]} 100%)`,
                    border: `1px solid ${theme.palette.mode === 'dark' ? colors.blueAccent[700] : colors.blueAccent[200]}`
                }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
                        <Typography variant="h6" sx={{ fontWeight: 'bold', color: theme.palette.mode === 'dark' ? colors.grey[100] : colors.grey[900] }}>
                            Project Photos ({projectPhotos.length})
                        </Typography>
                        <Button
                            size="small"
                            startIcon={<PhotoCameraIcon />}
                            onClick={handleManagePhotos}
                            sx={{ textTransform: 'none' }}
                        >
                            Manage Photos
                        </Button>
                    </Box>
                    <Box sx={{ 
                        display: 'flex', 
                        gap: 1, 
                        overflowX: 'auto',
                        pb: 1,
                        '&::-webkit-scrollbar': {
                            height: 8,
                        },
                        '&::-webkit-scrollbar-thumb': {
                            backgroundColor: colors.blueAccent[500],
                            borderRadius: 4,
                        }
                    }}>
                        {projectPhotos.map((photo) => (
                            <Card 
                                key={photo.photoId}
                                sx={{ 
                                    minWidth: 200,
                                    cursor: 'pointer',
                                    transition: 'transform 0.2s ease-in-out',
                                    '&:hover': {
                                        transform: 'scale(1.05)',
                                        boxShadow: 6
                                    }
                                }}
                                onClick={() => window.open(`${serverUrl}/${photo.filePath}`, '_blank')}
                            >
                                <CardMedia
                                    component="img"
                                    height="150"
                                    image={`${serverUrl}/${photo.filePath}`}
                                    alt={photo.description || 'Project photo'}
                                    sx={{ objectFit: 'cover' }}
                                />
                                <CardContent sx={{ p: 1 }}>
                                    <Typography variant="caption" noWrap sx={{ fontSize: '0.7rem' }}>
                                        {photo.fileName}
                                    </Typography>
                                </CardContent>
                            </Card>
                        ))}
                    </Box>
                </Paper>
            )}

            {/* Tabbed Interface */}
            <Paper elevation={6} sx={{ 
                p: 0.75, 
                mb: 0.5, 
                borderRadius: '10px',
                background: theme.palette.mode === 'dark'
                    ? `linear-gradient(135deg, ${colors.primary[400]} 0%, ${colors.primary[500]} 100%)`
                    : '#FFFFFF', // White background for light mode
                border: `1px solid ${theme.palette.mode === 'dark' ? colors.blueAccent[700] : colors.blueAccent[200]}`,
                boxShadow: theme.palette.mode === 'dark'
                    ? `0 4px 20px rgba(0, 0, 0, 0.2), 0 2px 8px rgba(0, 0, 0, 0.1)`
                    : `0 2px 12px rgba(0, 0, 0, 0.06), 0 1px 4px rgba(0, 0, 0, 0.03)`
            }}>
                <Tabs 
                    value={activeTab} 
                    onChange={(e, newValue) => setActiveTab(newValue)}
                    variant="scrollable"
                    scrollButtons="auto"
                    sx={{
                        borderBottom: `2px solid ${theme.palette.mode === 'dark' ? colors.blueAccent[700] : colors.blueAccent[200]}`,
                        mb: 0.4,
                        '& .MuiTab-root': {
                            color: theme.palette.mode === 'dark' ? colors.grey[300] : '#4a4a4a',
                            textTransform: 'none',
                            fontSize: '0.9rem',
                            fontWeight: 600,
                            minHeight: 40,
                            padding: '8px 16px',
                            transition: 'all 0.2s ease-in-out',
                            borderRadius: '8px 8px 0 0',
                            marginRight: 1,
                            '&:hover': {
                                backgroundColor: theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.02)',
                                color: theme.palette.mode === 'dark' ? colors.blueAccent[400] : colors.blueAccent[600]
                            },
                            '&.Mui-selected': {
                                color: theme.palette.mode === 'dark' ? colors.blueAccent[500] : colors.blueAccent[600],
                                fontWeight: 'bold',
                                backgroundColor: theme.palette.mode === 'dark' ? 'rgba(33, 150, 243, 0.1)' : 'rgba(33, 150, 243, 0.08)',
                                borderBottom: `3px solid ${theme.palette.mode === 'dark' ? colors.blueAccent[500] : colors.blueAccent[600]}`
                            }
                        },
                        '& .MuiTabs-indicator': {
                            display: 'none'
                        }
                    }}
                >
                    <Tab label="Overview" icon={<InfoIcon />} iconPosition="start" />
                    <Tab label="Sites" icon={<LocationOnIcon />} iconPosition="start" />
                    <Tab label="Jobs" icon={<WorkIcon />} iconPosition="start" />
                    <Tab label="Teams" icon={<AccountTreeIcon />} iconPosition="start" />
                    <Tab label="Timeline & Milestones" icon={<ScheduleIcon />} iconPosition="start" />
                    <Tab label="Map" icon={<LocationOnIcon />} iconPosition="start" />
                </Tabs>

                {/* Tab Panels */}
                {activeTab === 0 && (
                    <Box>
                        {/* Combined Overview and Description Section */}
            <Paper elevation={6} sx={{ 
                p: 1, 
                mb: 0.75, 
                borderRadius: '12px',
                background: theme.palette.mode === 'dark'
                    ? `linear-gradient(135deg, ${colors.primary[400]} 0%, ${colors.primary[500]} 100%)`
                    : '#FFFFFF', // White background for light mode
                border: `1px solid ${theme.palette.mode === 'dark' ? colors.blueAccent[700] : colors.blueAccent[200]}`,
                boxShadow: theme.palette.mode === 'dark'
                    ? `0 6px 24px rgba(0, 0, 0, 0.25), 0 3px 12px rgba(0, 0, 0, 0.15)`
                    : `0 2px 12px rgba(0, 0, 0, 0.06), 0 1px 4px rgba(0, 0, 0, 0.03)`,
                transition: 'all 0.3s ease-in-out',
                '&:hover': {
                    boxShadow: theme.palette.mode === 'dark'
                        ? `0 8px 32px rgba(0, 0, 0, 0.3), 0 4px 16px rgba(0, 0, 0, 0.2)`
                        : `0 4px 16px rgba(0, 0, 0, 0.08), 0 2px 8px rgba(0, 0, 0, 0.04)`
                }
            }}>
                <Typography variant="h5" sx={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    mb: 0.4,
                    color: theme.palette.mode === 'dark' ? colors.blueAccent[700] : colors.blueAccent[600],
                    fontWeight: 'bold',
                    textShadow: theme.palette.mode === 'dark' ? '1px 1px 2px rgba(0, 0, 0, 0.2)' : 'none',
                    borderBottom: `2px solid ${theme.palette.mode === 'dark' ? colors.blueAccent[700] : colors.blueAccent[300]}`,
                    pb: 0.3,
                    fontSize: '0.95rem'
                }}>
                    <InfoIcon sx={{ mr: 0.5, fontSize: '0.9rem', color: theme.palette.mode === 'dark' ? colors.blueAccent[700] : colors.blueAccent[600] }} />
                    Project Overview
                </Typography>
                <Grid container spacing={0.5}>
                    {/* First Column: Key Information */}
                    <Grid item xs={12} md={4}>
                        <Box sx={{
                            p: 1,
                            borderRadius: '10px',
                            backgroundColor: theme.palette.mode === 'dark' ? colors.primary[600] : '#F5F5F5', // Light grey background for light mode
                            border: `1px solid ${theme.palette.mode === 'dark' ? colors.blueAccent[700] : colors.blueAccent[200]}`,
                            height: '100%',
                            boxShadow: theme.palette.mode === 'light' ? `0 2px 8px rgba(0, 0, 0, 0.05)` : `0 4px 16px rgba(0, 0, 0, 0.2)`,
                            transition: 'all 0.3s ease-in-out',
                            '&:hover': {
                                transform: 'translateY(-2px)',
                                boxShadow: theme.palette.mode === 'light' ? `0 4px 12px rgba(0, 0, 0, 0.08)` : `0 6px 24px rgba(0, 0, 0, 0.3)`,
                                borderColor: theme.palette.mode === 'dark' ? colors.blueAccent[500] : colors.blueAccent[400]
                            }
                        }}>
                            <Typography variant="h6" sx={{ 
                                fontWeight: 'bold', 
                                mb: 0.4,
                                color: theme.palette.mode === 'dark' ? colors.blueAccent[700] : colors.blueAccent[600],
                                textAlign: 'center',
                                borderBottom: `1px solid ${theme.palette.mode === 'dark' ? colors.blueAccent[700] : colors.blueAccent[300]}`,
                                pb: 0.25,
                                fontSize: '0.85rem'
                            }}>
                                Key Information
                            </Typography>
                            <Stack spacing={0.3}>
                                <Typography variant="body1" sx={{ 
                                    color: theme.palette.mode === 'dark' ? colors.grey[100] : colors.grey[900],
                                    fontSize: '0.9rem'
                                }}>
                                    <strong style={{ color: theme.palette.mode === 'dark' ? colors.blueAccent[500] : colors.blueAccent[600] }}>Project Category:</strong> <span style={{ color: theme.palette.mode === 'dark' ? colors.grey[200] : '#333333', fontWeight: 600 }}>{projectCategory?.categoryName || 'N/A'}</span>
                                </Typography>
                                <Typography variant="body1" sx={{ 
                                    color: theme.palette.mode === 'dark' ? colors.grey[100] : colors.grey[900],
                                    fontSize: '0.9rem'
                                }}>
                                    <strong style={{ color: theme.palette.mode === 'dark' ? colors.blueAccent[500] : colors.blueAccent[600] }}>Department:</strong> <span style={{ color: theme.palette.mode === 'dark' ? colors.grey[200] : '#333333', fontWeight: 600 }}>{project?.departmentAlias || project?.departmentName || 'N/A'}</span>
                                </Typography>
                                <Typography variant="body1" sx={{ 
                                    color: theme.palette.mode === 'dark' ? colors.grey[100] : colors.grey[900],
                                    fontSize: '0.9rem'
                                }}>
                                    <strong style={{ color: theme.palette.mode === 'dark' ? colors.blueAccent[500] : colors.blueAccent[600] }}>Subcounty:</strong> <span style={{ color: theme.palette.mode === 'dark' ? colors.grey[200] : '#333333', fontWeight: 600 }}>{project?.subcountyNames || 'N/A'}</span>
                                </Typography>
                                <Typography variant="body1" sx={{ 
                                    color: theme.palette.mode === 'dark' ? colors.grey[100] : colors.grey[900],
                                    fontSize: '0.9rem'
                                }}>
                                    <strong style={{ color: theme.palette.mode === 'dark' ? colors.blueAccent[500] : colors.blueAccent[600] }}>Ward:</strong> <span style={{ color: theme.palette.mode === 'dark' ? colors.grey[200] : '#333333', fontWeight: 600 }}>{project?.wardNames || 'N/A'}</span>
                                </Typography>
                                <Typography variant="body1" sx={{ 
                                    color: theme.palette.mode === 'dark' ? colors.grey[100] : colors.grey[900],
                                    fontSize: '0.9rem'
                                }}>
                                    <strong style={{ color: theme.palette.mode === 'dark' ? colors.blueAccent[500] : colors.blueAccent[600] }}>Directorate:</strong> <span style={{ color: theme.palette.mode === 'dark' ? colors.grey[200] : '#333333', fontWeight: 600 }}>{project?.directorate || 'N/A'}</span>
                                </Typography>
                                <Typography variant="body1" sx={{ 
                                    color: theme.palette.mode === 'dark' ? colors.grey[100] : colors.grey[900],
                                    fontSize: '0.9rem'
                                }}>
                                    <strong style={{ color: theme.palette.mode === 'dark' ? colors.blueAccent[500] : colors.blueAccent[600] }}>Project Manager:</strong> <span style={{ color: theme.palette.mode === 'dark' ? colors.grey[200] : '#333333', fontWeight: 600 }}>{project?.principalInvestigator || 'N/A'}</span>
                                </Typography>
                                <Divider sx={{ my: 0.3 }} />
                                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <Typography variant="body1" sx={{ 
                                        color: theme.palette.mode === 'dark' ? colors.grey[100] : colors.grey[900],
                                        fontSize: '0.9rem'
                                    }}>
                                        <strong style={{ color: theme.palette.mode === 'dark' ? colors.blueAccent[500] : colors.blueAccent[600] }}>Public Approval:</strong>
                                    </Typography>
                                    {getPublicApprovalStatus(project) && (
                                        <Chip
                                            label={getPublicApprovalStatus(project).label}
                                            icon={getPublicApprovalStatus(project).icon}
                                            color={getPublicApprovalStatus(project).color}
                                            size="small"
                                            sx={{
                                                fontSize: '0.7rem',
                                                height: '22px',
                                                '& .MuiChip-icon': { fontSize: 12 }
                                            }}
                                        />
                                    )}
                                </Box>
                            </Stack>
                        </Box>
                    </Grid>
                    {/* Second Column: Financial Details */}
                    <Grid item xs={12} md={4}>
                        <Box sx={{
                            p: 1,
                            borderRadius: '10px',
                            backgroundColor: theme.palette.mode === 'dark' ? colors.primary[600] : '#F5F5F5', // Light grey background for light mode
                            border: `1px solid ${theme.palette.mode === 'dark' ? colors.blueAccent[700] : colors.blueAccent[200]}`,
                            height: '100%',
                            boxShadow: theme.palette.mode === 'light' ? `0 2px 8px rgba(0, 0, 0, 0.05)` : `0 4px 16px rgba(0, 0, 0, 0.2)`,
                            transition: 'all 0.3s ease-in-out',
                            '&:hover': {
                                transform: 'translateY(-2px)',
                                boxShadow: theme.palette.mode === 'light' ? `0 4px 12px rgba(0, 0, 0, 0.08)` : `0 6px 24px rgba(0, 0, 0, 0.3)`,
                                borderColor: theme.palette.mode === 'dark' ? colors.blueAccent[500] : colors.blueAccent[400]
                            }
                        }}>
                            <Typography variant="h6" sx={{ 
                                fontWeight: 'bold', 
                                mb: 0.4,
                                color: theme.palette.mode === 'dark' ? colors.blueAccent[700] : colors.blueAccent[600],
                                textAlign: 'center',
                                borderBottom: `1px solid ${theme.palette.mode === 'dark' ? colors.blueAccent[700] : colors.blueAccent[300]}`,
                                pb: 0.25,
                                fontSize: '0.85rem'
                            }}>
                                Financial Details
                            </Typography>
                            <Stack spacing={0.3}>
                                <Typography variant="body1" sx={{ 
                                    color: theme.palette.mode === 'dark' ? colors.grey[100] : colors.grey[900],
                                    fontSize: '0.85rem'
                                }}>
                                    <strong style={{ color: theme.palette.mode === 'dark' ? colors.blueAccent[500] : colors.blueAccent[600] }}>Start Date:</strong> <span style={{ color: theme.palette.mode === 'dark' ? colors.grey[200] : '#333333', fontWeight: 600 }}>{formatDate(project?.startDate)}</span>
                                </Typography>
                                <Typography variant="body1" sx={{ 
                                    color: theme.palette.mode === 'dark' ? colors.grey[100] : colors.grey[900],
                                    fontSize: '0.85rem'
                                }}>
                                    <strong style={{ color: theme.palette.mode === 'dark' ? colors.blueAccent[500] : colors.blueAccent[600] }}>End Date:</strong> <span style={{ color: theme.palette.mode === 'dark' ? colors.grey[200] : '#333333', fontWeight: 600 }}>{formatDate(project?.endDate)}</span>
                                </Typography>
                                <Divider sx={{ my: 0.5 }} />
                                <Typography variant="body2" sx={{ 
                                    color: theme.palette.mode === 'dark' ? colors.grey[300] : colors.grey[700], 
                                    fontWeight: 600,
                                    fontSize: '0.75rem',
                                    mb: 0.25
                                }}>
                                    Budget Breakdown
                                </Typography>
                                <Typography variant="body1" sx={{ 
                                    color: theme.palette.mode === 'dark' ? colors.grey[100] : colors.grey[900],
                                    fontSize: '0.85rem'
                                }}>
                                    <strong style={{ color: theme.palette.mode === 'dark' ? colors.blueAccent[500] : colors.blueAccent[600] }}>Total Budget:</strong> <span style={{ color: theme.palette.mode === 'dark' ? colors.grey[200] : '#333333', fontWeight: 600 }}>{formatCurrency(totalBudget)}</span>
                                </Typography>
                                <Box display="flex" justifyContent="space-between" sx={{ fontSize: '0.8rem' }}>
                                    <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>Contracted:</Typography>
                                    <Typography variant="body2" sx={{ fontSize: '0.8rem', fontWeight: 600 }}>
                                        {formatCurrency(contractedAmount)} ({contractPercentage.toFixed(1)}%)
                                    </Typography>
                                </Box>
                                <Box display="flex" justifyContent="space-between" sx={{ fontSize: '0.8rem' }}>
                                    <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>Disbursed:</Typography>
                                    <Typography variant="body2" sx={{ fontSize: '0.8rem', fontWeight: 600, color: colors.greenAccent[500] }}>
                                        {formatCurrency(paidAmount)} ({paymentPercentage.toFixed(1)}%)
                                    </Typography>
                                </Box>
                                <Box display="flex" justifyContent="space-between" sx={{ fontSize: '0.8rem' }}>
                                    <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>Remaining:</Typography>
                                    <Typography variant="body2" sx={{ fontSize: '0.8rem', fontWeight: 600 }}>
                                        {formatCurrency(remainingBudget)}
                                    </Typography>
                                </Box>
                                <Divider sx={{ my: 0.5 }} />
                                <Typography variant="body2" sx={{ 
                                    color: theme.palette.mode === 'dark' ? colors.grey[300] : colors.grey[700], 
                                    fontWeight: 600,
                                    fontSize: '0.75rem',
                                    mb: 0.25
                                }}>
                                    Payment Status
                                </Typography>
                                <LinearProgress 
                                    variant="determinate" 
                                    value={paymentPercentage}
                                    sx={{ mb: 0.5, height: 8, borderRadius: 4 }}
                                />
                                <Box display="flex" justifyContent="space-between" sx={{ fontSize: '0.8rem', mb: 0.5 }}>
                                    <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>Disbursement Rate:</Typography>
                                    <Typography variant="body2" sx={{ fontSize: '0.8rem', fontWeight: 600, color: colors.blueAccent[500] }}>
                                        {disbursementRate.toFixed(1)}%
                                    </Typography>
                                </Box>
                                <Box display="flex" justifyContent="space-between" sx={{ fontSize: '0.8rem' }}>
                                    <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>Contract Coverage:</Typography>
                                    <Typography variant="body2" sx={{ fontSize: '0.8rem', fontWeight: 600 }}>
                                        {contractPercentage.toFixed(1)}%
                                    </Typography>
                                </Box>
                            </Stack>
                        </Box>
                    </Grid>
                    {/* Third Column: Accomplished Work */}
                    <Grid item xs={12} md={4}>
                        <Box sx={{
                            p: 1,
                            borderRadius: '10px',
                            backgroundColor: theme.palette.mode === 'dark' ? colors.primary[600] : '#F5F5F5', // Light grey background for light mode
                            border: `1px solid ${theme.palette.mode === 'dark' ? colors.blueAccent[700] : colors.blueAccent[200]}`,
                            height: '100%',
                            boxShadow: theme.palette.mode === 'light' ? `0 2px 8px rgba(0, 0, 0, 0.05)` : `0 4px 16px rgba(0, 0, 0, 0.2)`,
                            transition: 'all 0.3s ease-in-out',
                            '&:hover': {
                                transform: 'translateY(-2px)',
                                boxShadow: theme.palette.mode === 'light' ? `0 4px 12px rgba(0, 0, 0, 0.08)` : `0 6px 24px rgba(0, 0, 0, 0.3)`,
                                borderColor: theme.palette.mode === 'dark' ? colors.blueAccent[500] : colors.blueAccent[400]
                            }
                        }}>
                            <Typography variant="h6" sx={{ 
                                fontWeight: 'bold', 
                                mb: 0.4,
                                color: theme.palette.mode === 'dark' ? colors.blueAccent[700] : colors.blueAccent[600],
                                textAlign: 'center',
                                borderBottom: `1px solid ${theme.palette.mode === 'dark' ? colors.blueAccent[700] : colors.blueAccent[300]}`,
                                pb: 0.25,
                                fontSize: '0.85rem'
                            }}>
                                Accomplished Work
                            </Typography>
                            <Stack spacing={0.5} alignItems="center">
                                <Typography variant="h4" sx={{ 
                                    fontWeight: 'bold', 
                                    color: colors.greenAccent[500],
                                    textShadow: theme.palette.mode === 'dark' ? '1px 1px 2px rgba(0, 0, 0, 0.3)' : 'none',
                                    fontSize: '1.75rem'
                                }}>
                                    {formatCurrency(paymentJustification.totalBudget)}
                                </Typography>
                                <Typography variant="body2" sx={{ 
                                    color: theme.palette.mode === 'dark' ? colors.grey[200] : '#333333',
                                    textAlign: 'center',
                                    mb: 0.4,
                                    fontSize: '0.85rem',
                                    fontWeight: 600
                                }}>
                                    Total Budget from Completed Activities
                                </Typography>
                                <Button
                                    variant="contained"
                                    startIcon={<PaidIcon />}
                                    onClick={handleOpenPaymentRequest}
                                    disabled={paymentJustification.accomplishedActivities.length === 0}
                                    size="medium"
                                    sx={{
                                        backgroundColor: colors.greenAccent[600],
                                        color: colors.grey[100],
                                        fontWeight: 'bold',
                                        borderRadius: '8px',
                                        px: 3,
                                        '&:hover': {
                                            backgroundColor: colors.greenAccent[700]
                                        }
                                    }}
                                >
                                    Request Payment
                                </Button>
                            </Stack>
                        </Box>
                    </Grid>
                    {/* Full-width row for Project Description */}
                    <Grid item xs={12}>
                        <Box sx={{
                            p: 1,
                            borderRadius: '10px',
                            backgroundColor: theme.palette.mode === 'dark' ? colors.primary[600] : '#F5F5F5',
                            border: `1px solid ${theme.palette.mode === 'dark' ? colors.blueAccent[700] : colors.blueAccent[200]}`,
                            mt: 0.5,
                            boxShadow: theme.palette.mode === 'light' ? `0 2px 8px rgba(0, 0, 0, 0.05)` : `0 4px 16px rgba(0, 0, 0, 0.2)`,
                            transition: 'all 0.3s ease-in-out',
                            '&:hover': {
                                transform: 'translateY(-2px)',
                                boxShadow: theme.palette.mode === 'light' ? `0 4px 12px rgba(0, 0, 0, 0.08)` : `0 6px 24px rgba(0, 0, 0, 0.3)`,
                                borderColor: theme.palette.mode === 'dark' ? colors.blueAccent[500] : colors.blueAccent[400]
                            }
                        }}>
                            <Typography variant="h6" sx={{ 
                                fontWeight: 'bold', 
                                mb: 0.4,
                                color: theme.palette.mode === 'dark' ? colors.blueAccent[700] : colors.blueAccent[600],
                                textAlign: 'center',
                                borderBottom: `1px solid ${theme.palette.mode === 'dark' ? colors.blueAccent[700] : colors.blueAccent[300]}`,
                                pb: 0.25,
                                fontSize: '0.85rem'
                            }}>
                                Project Description
                            </Typography>
                            <Stack spacing={0.5}>
                                <Box>
                                    <Typography variant="body1" sx={{ 
                                        mb: 0.4,
                                        fontWeight: 'bold',
                                        color: theme.palette.mode === 'dark' ? colors.blueAccent[500] : colors.blueAccent[600]
                                    }}>
                                        Objective:
                                    </Typography>
                                    <Typography variant="body1" sx={{ 
                                        color: theme.palette.mode === 'dark' ? colors.grey[200] : '#333333',
                                        pl: 1,
                                        borderLeft: `3px solid ${theme.palette.mode === 'dark' ? colors.blueAccent[700] : colors.blueAccent[400]}`,
                                        py: 0.4,
                                        fontSize: '0.9rem',
                                        fontWeight: 600
                                    }}>
                                        {project?.objective || 'N/A'}
                                    </Typography>
                                </Box>
                                <Box>
                                    <Typography variant="body1" sx={{ 
                                        mb: 0.4,
                                        fontWeight: 'bold',
                                        color: theme.palette.mode === 'dark' ? colors.blueAccent[500] : colors.blueAccent[600],
                                        fontSize: '0.95rem'
                                    }}>
                                        Expected Output:
                                    </Typography>
                                    <Typography variant="body1" sx={{ 
                                        color: theme.palette.mode === 'dark' ? colors.grey[200] : '#333333',
                                        pl: 1,
                                        borderLeft: `3px solid ${theme.palette.mode === 'dark' ? colors.blueAccent[700] : colors.blueAccent[400]}`,
                                        py: 0.4,
                                        fontSize: '0.9rem',
                                        fontWeight: 600
                                    }}>
                                        {project?.expectedOutput || 'N/A'}
                                    </Typography>
                                </Box>
                                <Box>
                                    <Typography variant="body1" sx={{ 
                                        mb: 0.4,
                                        fontWeight: 'bold',
                                        color: theme.palette.mode === 'dark' ? colors.blueAccent[500] : colors.blueAccent[600],
                                        fontSize: '0.95rem'
                                    }}>
                                        Expected Outcome:
                                    </Typography>
                                    <Typography variant="body1" sx={{ 
                                        color: theme.palette.mode === 'dark' ? colors.grey[200] : '#333333',
                                        pl: 1,
                                        borderLeft: `3px solid ${theme.palette.mode === 'dark' ? colors.blueAccent[700] : colors.blueAccent[400]}`,
                                        py: 0.4,
                                        fontSize: '0.9rem',
                                        fontWeight: 600
                                    }}>
                                        {project?.expectedOutcome || 'N/A'}
                                    </Typography>
                                </Box>
                            </Stack>
                        </Box>
                    </Grid>
                </Grid>
            </Paper>
                    </Box>
                )}

                {activeTab === 4 && (
                    <Box>
                        {/* Timeline & Milestones Tab */}
                        {/* Work Plans and Milestones Section (Refactored) */}
            <Box sx={{ mt: 3 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                    <Typography variant="h5" sx={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        fontWeight: 'bold',
                        color: theme.palette.mode === 'dark' ? colors.blueAccent[700] : colors.blueAccent[500],
                        textShadow: theme.palette.mode === 'dark' ? '1px 1px 2px rgba(0, 0, 0, 0.2)' : 'none',
                        borderBottom: `2px solid ${theme.palette.mode === 'dark' ? colors.blueAccent[700] : colors.blueAccent[400]}`,
                        pb: 1
                    }}>
                        <AccountTreeIcon sx={{ mr: 1, color: theme.palette.mode === 'dark' ? colors.blueAccent[700] : colors.blueAccent[500] }} />
                        Work Plans & Milestones
                    </Typography>
                    <Stack direction="row" spacing={1}>
                        {canApplyTemplate && (
                            <Button
                                variant="contained"
                                startIcon={<UpdateIcon />}
                                onClick={handleApplyMilestoneTemplate}
                                disabled={applyingTemplate}
                            >
                                {applyingTemplate ? <CircularProgress size={24} /> : 'Apply Latest Milestones'}
                            </Button>
                        )}
                        {checkUserPrivilege(user, 'activity.create') && (
                            <Button
                                variant="contained"
                                startIcon={<AddIcon />}
                                onClick={() => handleOpenCreateActivityDialog(null, null)}
                                sx={{ backgroundColor: '#16a34a', '&:hover': { backgroundColor: '#15803d' } }}
                            >
                                Add Activity
                            </Button>
                        )}
                    </Stack>
                </Box>
                {loadingWorkPlans ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
                        <CircularProgress />
                    </Box>
                ) : projectWorkPlans.length === 0 ? (
                    <Box>
                        <Alert severity="info" sx={{ mb: 3 }}>No work plans available for this project's subprogram.</Alert>
                        
                        {/* Show Project-Level Milestones when no work plans */}
                        {milestones.length > 0 && (
                            <Box>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                                    <Typography variant="h5" sx={{ 
                                        display: 'flex', 
                                        alignItems: 'center', 
                                        fontWeight: 'bold',
                                        color: theme.palette.mode === 'dark' ? colors.blueAccent[700] : colors.blueAccent[500],
                                        textShadow: theme.palette.mode === 'dark' ? '1px 1px 2px rgba(0, 0, 0, 0.2)' : 'none',
                                        borderBottom: `2px solid ${theme.palette.mode === 'dark' ? colors.blueAccent[700] : colors.blueAccent[400]}`,
                                        pb: 1
                                    }}>
                                        <AccountTreeIcon sx={{ mr: 1, color: theme.palette.mode === 'dark' ? colors.blueAccent[700] : colors.blueAccent[500] }} />
                                        Project Milestones
                                    </Typography>
                                    <Stack direction="row" spacing={1}>
                                        {checkUserPrivilege(user, 'milestone.create') && (
                                            <Button
                                                variant="contained"
                                                startIcon={<AddIcon />}
                                                onClick={handleOpenCreateMilestoneDialog}
                                                size="small"
                                                sx={{ 
                                                    backgroundColor: colors.greenAccent[600],
                                                    color: colors.grey[100],
                                                    fontWeight: 'bold',
                                                    borderRadius: '8px',
                                                    px: 2,
                                                    py: 0.75,
                                                    boxShadow: theme.palette.mode === 'light' ? `0 2px 8px ${colors.greenAccent[100]}40` : 'none',
                                                    '&:hover': { 
                                                        backgroundColor: colors.greenAccent[700],
                                                        transform: 'translateY(-1px)',
                                                        boxShadow: theme.palette.mode === 'light' ? `0 4px 12px ${colors.greenAccent[100]}50` : 'none'
                                                    },
                                                    transition: 'all 0.2s ease-in-out'
                                                }}
                                            >
                                                Add Milestone
                                            </Button>
                                        )}
                                    </Stack>
                                </Box>
                                <Grid container spacing={3} sx={{ width: '100%' }}>
                                    {milestones
                                        .sort((a, b) => (a.sequenceOrder || 0) - (b.sequenceOrder || 0))
                                        .map((milestone) => {
                                        const activitiesForMilestone = milestoneActivities.filter(a => a.milestoneId === milestone.milestoneId);
                                        return (
                                            <Grid item xs={12} md={6} lg={6} key={milestone.milestoneId} sx={{ 
                                                display: 'flex',
                                                minHeight: '100%'
                                            }}>
                                                <Paper elevation={3} sx={{ 
                                                    p: 0, 
                                                    borderRadius: '12px', 
                                                    width: '100%',
                                                    height: '100%', 
                                                    display: 'flex', 
                                                    flexDirection: 'column',
                                                    border: theme.palette.mode === 'light' ? `1px solid ${colors.blueAccent[200]}` : 'none',
                                                    boxShadow: theme.palette.mode === 'light' ? `0 4px 16px ${colors.blueAccent[100]}40, 0 2px 8px ${colors.blueAccent[100]}20` : undefined,
                                                    transition: 'all 0.2s ease-in-out',
                                                    '&:hover': {
                                                        transform: 'translateY(-2px)',
                                                        boxShadow: theme.palette.mode === 'light' ? `0 8px 24px ${colors.blueAccent[100]}50, 0 4px 12px ${colors.blueAccent[100]}30` : undefined
                                                    }
                                                }}>
                                                    <Box
                                                        sx={{
                                                            p: 2,
                                                            pb: 1.5,
                                                            borderLeft: `5px solid ${theme.palette.mode === 'dark' ? theme.palette.primary.main : colors.blueAccent[500]}`,
                                                            backgroundColor: theme.palette.mode === 'dark' ? theme.palette.action.hover : colors.blueAccent[100],
                                                            borderTopLeftRadius: '12px',
                                                            borderTopRightRadius: '12px',
                                                            boxShadow: theme.palette.mode === 'light' ? `inset 0 1px 0 ${colors.blueAccent[200]}` : 'none'
                                                        }}
                                                    >
                                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                            <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                                                <FlagIcon sx={{ 
                                                                    mr: 1,
                                                                    color: theme.palette.mode === 'dark' ? theme.palette.primary.main : colors.blueAccent[500],
                                                                    fontSize: '1.5rem'
                                                                }} />
                                                                <Typography variant="h6" sx={{ 
                                                                    fontWeight: 'bold', 
                                                                    color: theme.palette.mode === 'dark' ? theme.palette.primary.main : colors.blueAccent[600]
                                                                }}>
                                                                    {milestone.milestoneName || 'Unnamed Milestone'}
                                                                </Typography>
                                                            </Box>
                                                            <Stack direction="row" spacing={1} sx={{ flexShrink: 0 }}>
                                                                <Tooltip title="View Attachments">
                                                                    <IconButton 
                                                                        edge="end" 
                                                                        aria-label="attachments" 
                                                                        onClick={() => {
                                                                            setMilestoneToViewAttachments(milestone);
                                                                            setOpenAttachmentsModal(true);
                                                                        }}
                                                                        sx={{
                                                                            color: theme.palette.mode === 'dark' ? colors.blueAccent[400] : colors.blueAccent[600],
                                                                            '&:hover': {
                                                                                backgroundColor: theme.palette.mode === 'dark' ? colors.blueAccent[700] : colors.blueAccent[100],
                                                                                color: theme.palette.mode === 'dark' ? colors.grey[100] : colors.blueAccent[700]
                                                                            }
                                                                        }}
                                                                    >
                                                                        <AttachmentIcon />
                                                                    </IconButton>
                                                                </Tooltip>
                                                                {checkUserPrivilege(user, 'milestone.update') && (
                                                                    <Tooltip title="Edit Milestone">
                                                                        <IconButton 
                                                                            edge="end" 
                                                                            aria-label="edit" 
                                                                            onClick={() => handleOpenEditMilestoneDialog(milestone)}
                                                                            sx={{
                                                                                color: theme.palette.mode === 'dark' ? colors.greenAccent[400] : colors.greenAccent[600],
                                                                                '&:hover': {
                                                                                    backgroundColor: theme.palette.mode === 'dark' ? colors.greenAccent[700] : colors.greenAccent[100],
                                                                                    color: theme.palette.mode === 'dark' ? colors.grey[100] : colors.greenAccent[700]
                                                                                }
                                                                            }}
                                                                        >
                                                                            <EditIcon />
                                                                        </IconButton>
                                                                    </Tooltip>
                                                                )}
                                                                {checkUserPrivilege(user, 'milestone.delete') && (
                                                                    <Tooltip title="Delete Milestone">
                                                                        <IconButton 
                                                                            edge="end" 
                                                                            aria-label="delete" 
                                                                            onClick={() => handleDeleteMilestone(milestone.milestoneId)}
                                                                            sx={{
                                                                                color: theme.palette.mode === 'dark' ? colors.redAccent[400] : colors.redAccent[600],
                                                                                '&:hover': {
                                                                                    backgroundColor: theme.palette.mode === 'dark' ? colors.redAccent[700] : colors.redAccent[100],
                                                                                    color: theme.palette.mode === 'dark' ? colors.grey[100] : colors.redAccent[700]
                                                                                }
                                                                            }}
                                                                        >
                                                                            <DeleteIcon />
                                                                        </IconButton>
                                                                    </Tooltip>
                                                                )}
                                                            </Stack>
                                                        </Box>
                                                    </Box>

                                                    <Box sx={{ 
                                                        p: 2.5, 
                                                        flexGrow: 1,
                                                        backgroundColor: theme.palette.mode === 'dark' ? colors.primary[600] : colors.grey[50],
                                                        borderBottomLeftRadius: '12px',
                                                        borderBottomRightRadius: '12px'
                                                    }}>
                                                        <Typography variant="body2" sx={{ 
                                                            mb: 2,
                                                            color: theme.palette.mode === 'dark' ? colors.grey[200] : colors.grey[800],
                                                            fontWeight: 400,
                                                            lineHeight: 1.6,
                                                            fontSize: '0.9rem'
                                                        }}>
                                                            {milestone.description || 'No description.'}
                                                        </Typography>
                                                        
                                                        <Stack spacing={1.5} sx={{ mb: 2 }}>
                                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                                <ScheduleIcon sx={{ 
                                                                    fontSize: '1rem', 
                                                                    color: theme.palette.mode === 'dark' ? colors.blueAccent[400] : colors.blueAccent[600] 
                                                                }} />
                                                                <Typography variant="body2" sx={{ 
                                                                    color: theme.palette.mode === 'dark' ? colors.grey[300] : colors.grey[800],
                                                                    fontWeight: 500
                                                                }}>
                                                                    Due Date: {formatDate(milestone.dueDate)}
                                                                </Typography>
                                                            </Box>
                                                            {milestone.completedDate && (
                                                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                                    <CheckCircleIcon sx={{ 
                                                                        fontSize: '1rem', 
                                                                        color: theme.palette.mode === 'dark' ? colors.greenAccent[400] : colors.greenAccent[600] 
                                                                    }} />
                                                                    <Typography variant="body2" sx={{ 
                                                                        color: theme.palette.mode === 'dark' ? colors.grey[300] : colors.grey[800],
                                                                        fontWeight: 500
                                                                    }}>
                                                                        Completed: {formatDate(milestone.completedDate)}
                                                                    </Typography>
                                                                </Box>
                                                            )}
                                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                                <TrendingUpIcon sx={{ 
                                                                    fontSize: '1rem', 
                                                                    color: theme.palette.mode === 'dark' ? colors.blueAccent[400] : colors.blueAccent[600] 
                                                                }} />
                                                                <Typography variant="body2" sx={{ 
                                                                    color: theme.palette.mode === 'dark' ? colors.grey[300] : colors.grey[800],
                                                                    fontWeight: 500
                                                                }}>
                                                                    Progress: {milestone.progress || 0}% (Weight: {milestone.weight || 1.00})
                                                                </Typography>
                                                            </Box>
                                                        </Stack>
                                                        
                                                        <LinearProgress 
                                                            variant="determinate" 
                                                            value={milestone.progress || 0} 
                                                            sx={{ 
                                                                height: 10, 
                                                                borderRadius: 5, 
                                                                mb: 1.5,
                                                                bgcolor: theme.palette.mode === 'dark' ? colors.grey[700] : colors.grey[300],
                                                                '& .MuiLinearProgress-bar': {
                                                                    borderRadius: 5,
                                                                    background: theme.palette.mode === 'dark'
                                                                        ? `linear-gradient(90deg, ${colors.blueAccent[500]} 0%, ${colors.blueAccent[400]} 100%)`
                                                                        : `linear-gradient(90deg, ${colors.blueAccent[500]} 0%, ${colors.blueAccent[600]} 100%)`,
                                                                    boxShadow: theme.palette.mode === 'light' ? `0 2px 4px ${colors.blueAccent[200]}60` : 'none'
                                                                }
                                                            }} 
                                                        />
                                                        
                                                        <Chip
                                                            label={milestone.status || 'Not Started'}
                                                            size="small"
                                                            sx={{
                                                                backgroundColor: getMilestoneStatusColors(milestone.status || 'not_started').backgroundColor,
                                                                color: getMilestoneStatusColors(milestone.status || 'not_started').textColor,
                                                                fontWeight: 'bold',
                                                                fontSize: '0.75rem',
                                                                height: '24px',
                                                                borderRadius: '6px'
                                                            }}
                                                        />
                                                        
                                                        {/* Activities for this milestone */}
                                                        <Box sx={{ 
                                                            mt: 3,
                                                            pt: 2.5,
                                                            borderTop: `2px solid ${theme.palette.mode === 'dark' ? colors.grey[700] : colors.grey[200]}`
                                                        }}>
                                                            <Typography variant="subtitle2" sx={{ 
                                                                fontWeight: 'bold',
                                                                mb: 2,
                                                                color: theme.palette.mode === 'dark' ? colors.blueAccent[400] : colors.blueAccent[700],
                                                                fontSize: '1rem',
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                gap: 0.5
                                                            }}>
                                                                Activities ({activitiesForMilestone.length})
                                                            </Typography>
                                                            {activitiesForMilestone.length > 0 ? (
                                                                <List dense disablePadding>
                                                                    {activitiesForMilestone.map((activity, idx) => (
                                                                        <ListItem 
                                                                            key={activity.activityId} 
                                                                            disablePadding
                                                                            sx={{ 
                                                                                mb: idx < activitiesForMilestone.length - 1 ? 1.5 : 0,
                                                                                pb: idx < activitiesForMilestone.length - 1 ? 1.5 : 0,
                                                                                borderBottom: idx < activitiesForMilestone.length - 1 
                                                                                    ? `1px solid ${theme.palette.mode === 'dark' ? colors.grey[700] : colors.grey[200]}`
                                                                                    : 'none'
                                                                            }}
                                                                        >
                                                                            <ListItemText
                                                                                primary={
                                                                                    <Typography variant="body2" sx={{ 
                                                                                        fontWeight: 700,
                                                                                        color: theme.palette.mode === 'dark' ? colors.grey[100] : '#000000',
                                                                                        fontSize: '0.95rem',
                                                                                        mb: 0.4,
                                                                                        letterSpacing: '0.01em'
                                                                                    }}>
                                                                                        {activity.activityName}
                                                                                    </Typography>
                                                                                }
                                                                                secondary={
                                                                                    <Stack spacing={0.5} sx={{ mt: 0.5 }}>
                                                                                        <Typography variant="caption" sx={{
                                                                                            color: theme.palette.mode === 'dark' ? colors.grey[400] : colors.grey[700],
                                                                                            fontWeight: 500,
                                                                                            fontSize: '0.8rem',
                                                                                            display: 'block'
                                                                                        }}>
                                                                                            {formatDate(activity.startDate)} - {formatDate(activity.endDate)}
                                                                                        </Typography>
                                                                                        <Typography variant="caption" sx={{
                                                                                            color: theme.palette.mode === 'dark' ? colors.grey[400] : colors.grey[700],
                                                                                            fontWeight: 500,
                                                                                            fontSize: '0.8rem',
                                                                                            display: 'block'
                                                                                        }}>
                                                                                            Status: {activity.activityStatus?.replace(/_/g, ' ') || 'not started'} | Progress: {activity.percentageComplete || 0}%
                                                                                        </Typography>
                                                                                        {activity.budgetAllocated && (
                                                                                            <Typography variant="caption" sx={{
                                                                                                color: theme.palette.mode === 'dark' ? colors.grey[400] : colors.grey[700],
                                                                                                fontWeight: 500,
                                                                                                fontSize: '0.8rem',
                                                                                                display: 'block'
                                                                                            }}>
                                                                                                Budget: {formatCurrency(activity.budgetAllocated)}
                                                                                            </Typography>
                                                                                        )}
                                                                                    </Stack>
                                                                                }
                                                                            />
                                                                        </ListItem>
                                                                    ))}
                                                                </List>
                                                            ) : (
                                                                <Typography variant="body2" sx={{ 
                                                                    fontStyle: 'italic', 
                                                                    mt: 1,
                                                                    color: theme.palette.mode === 'dark' ? colors.grey[400] : colors.grey[500],
                                                                    textAlign: 'center',
                                                                    py: 2
                                                                }}>
                                                                    No activities linked to this milestone.
                                                                </Typography>
                                                            )}
                                                        </Box>
                                                    </Box>
                                                </Paper>
                                            </Grid>
                                        );
                                    })}
                                </Grid>
                            </Box>
                        )}
                    </Box>
                ) : (
                    projectWorkPlans.map((workplan) => {
                        const activitiesForWorkplan = milestoneActivities.filter(a => String(a.workplanId) === String(workplan.workplanId));
                        const milestoneIdsForWorkplan = new Set(activitiesForWorkplan.map(a => a.milestoneId));
                        const milestonesForWorkplan = milestones.filter(m => milestoneIdsForWorkplan.has(m.milestoneId));
                        const totalMappedBudget = activitiesForWorkplan.reduce((sum, activity) => sum + (parseFloat(activity.budgetAllocated) || 0), 0);
                        const remainingBudget = (parseFloat(workplan.totalBudget) || 0) - totalMappedBudget;

                        return (
                            <Accordion
                                key={workplan.workplanId}
                                expanded={expandedWorkPlan === workplan.workplanId}
                                onChange={handleAccordionChange(workplan.workplanId)}
                                sx={{ mb: 2, borderRadius: '12px', '&:before': { display: 'none' }, border: '1px solid', borderColor: theme.palette.grey[300] }}
                            >
                                <AccordionSummary
                                    expandIcon={<ExpandMoreIcon />}
                                    aria-controls={`panel-${workplan.workplanId}-content`}
                                    id={`panel-${workplan.workplanId}-header`}
                                >
                                    <Box sx={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                                        <Typography variant="h6" sx={{ flexShrink: 0, fontWeight: 'bold' }}>
                                            {workplan.workplanName} ({workplan.financialYear})
                                        </Typography>
                                        <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                                            <Chip
                                                label={`Budget: ${formatCurrency(workplan.totalBudget)}`}
                                                color="primary"
                                                size="small"
                                                sx={{ mr: 1, mb: { xs: 1, sm: 0 } }}
                                            />
                                            <Chip
                                                label={`Utilized: ${formatCurrency(totalMappedBudget)}`}
                                                color="secondary"
                                                size="small"
                                                sx={{ mr: 1, mb: { xs: 1, sm: 0 } }}
                                            />
                                            <Chip
                                                label={`Remaining: ${formatCurrency(remainingBudget)}`}
                                                color={remainingBudget >= 0 ? 'success' : 'error'}
                                                size="small"
                                            />
                                        </Box>
                                    </Box>
                                </AccordionSummary>
                                <AccordionDetails>
                                    <Typography variant="body1" sx={{ fontStyle: 'italic', mb: 2 }}>
                                        {workplan.workplanDescription || 'No description provided.'}
                                    </Typography>

                                    {/* Milestones and Activities for this Workplan */}
                                    <Box sx={{ mt: 2 }}>
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                                            <Typography variant="h6" sx={{ 
                                                fontWeight: 'bold',
                                                color: theme.palette.mode === 'dark' ? colors.blueAccent[700] : colors.blueAccent[600],
                                                display: 'flex',
                                                alignItems: 'center',
                                                '&::before': {
                                                    content: '""',
                                                    width: '4px',
                                                    height: '24px',
                                                    backgroundColor: theme.palette.mode === 'dark' ? colors.blueAccent[700] : colors.blueAccent[500],
                                                    borderRadius: '2px',
                                                    marginRight: '12px'
                                                }
                                            }}>
                                                Milestones
                                            </Typography>
                                            {checkUserPrivilege(user, 'milestone.create') && !projectCategory && (
                                                <Button
                                                    variant="contained"
                                                    startIcon={<AddIcon />}
                                                    onClick={handleOpenCreateMilestoneDialog}
                                                    size="small"
                                                    sx={{ 
                                                        backgroundColor: colors.greenAccent[600],
                                                        color: colors.grey[100],
                                                        fontWeight: 'bold',
                                                        borderRadius: '8px',
                                                        px: 2,
                                                        py: 0.75,
                                                        boxShadow: theme.palette.mode === 'light' ? `0 2px 8px ${colors.greenAccent[100]}40` : 'none',
                                                        '&:hover': { 
                                                            backgroundColor: colors.greenAccent[700],
                                                            transform: 'translateY(-1px)',
                                                            boxShadow: theme.palette.mode === 'light' ? `0 4px 12px ${colors.greenAccent[100]}50` : 'none'
                                                        },
                                                        transition: 'all 0.2s ease-in-out'
                                                    }}
                                                >
                                                    Add Milestone
                                                </Button>
                                            )}
                                        </Box>

                                        {milestonesForWorkplan.length === 0 ? (
                                            <Box sx={{
                                                p: 3,
                                                textAlign: 'center',
                                                backgroundColor: theme.palette.mode === 'dark' ? colors.primary[600] : colors.grey[100],
                                                borderRadius: '12px',
                                                border: `2px dashed ${theme.palette.mode === 'dark' ? colors.grey[600] : colors.grey[300]}`,
                                                color: theme.palette.mode === 'dark' ? colors.grey[300] : colors.grey[600]
                                            }}>
                                                <Typography variant="h6" sx={{ 
                                                    fontWeight: 'bold',
                                                    mb: 0.4,
                                                    color: theme.palette.mode === 'dark' ? colors.grey[300] : colors.grey[700]
                                                }}>
                                                    No Milestones Yet
                                                </Typography>
                                                <Typography variant="body2" sx={{ 
                                                    color: theme.palette.mode === 'dark' ? colors.grey[400] : colors.grey[600],
                                                    fontStyle: 'italic'
                                                }}>
                                                    No milestones have been linked to this work plan yet.
                                                </Typography>
                                            </Box>
                                        ) : (
                                            <Grid container spacing={3} sx={{ width: '100%' }}>
                                                {milestonesForWorkplan.map((milestone) => {
                                                    const activitiesForMilestone = activitiesForWorkplan.filter(a => a.milestoneId === milestone.milestoneId);
                                                    return (
                                                        <Grid item xs={12} md={6} lg={6} key={milestone.milestoneId} sx={{ 
                                                            display: 'flex',
                                                            minHeight: '100%'
                                                        }}>
                                                            <Paper elevation={3} sx={{ 
                                                                p: 0, 
                                                                borderRadius: '12px', 
                                                                width: '100%',
                                                                height: '100%', 
                                                                display: 'flex', 
                                                                flexDirection: 'column',
                                                                border: theme.palette.mode === 'light' ? `1px solid ${colors.blueAccent[200]}` : 'none',
                                                                boxShadow: theme.palette.mode === 'light' ? `0 4px 16px ${colors.blueAccent[100]}40, 0 2px 8px ${colors.blueAccent[100]}20` : undefined,
                                                                transition: 'all 0.2s ease-in-out',
                                                                '&:hover': {
                                                                    transform: 'translateY(-2px)',
                                                                    boxShadow: theme.palette.mode === 'light' ? `0 8px 24px ${colors.blueAccent[100]}50, 0 4px 12px ${colors.blueAccent[100]}30` : undefined
                                                                }
                                                            }}>
                                                                <Box
                                                                    sx={{
                                                                        p: 2.5,
                                                                        pb: 2,
                                                                        background: theme.palette.mode === 'dark' 
                                                                            ? `linear-gradient(135deg, ${colors.primary[700]} 0%, ${colors.primary[800]} 100%)`
                                                                            : `linear-gradient(135deg, ${colors.blueAccent[600]} 0%, ${colors.blueAccent[700]} 100%)`,
                                                                        borderTopLeftRadius: '12px',
                                                                        borderTopRightRadius: '12px',
                                                                        boxShadow: theme.palette.mode === 'light' 
                                                                            ? `0 2px 8px ${colors.blueAccent[200]}40, inset 0 1px 0 ${colors.blueAccent[400]}20` 
                                                                            : `0 2px 8px rgba(0, 0, 0, 0.3)`
                                                                    }}
                                                                >
                                                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                                        <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                                                            <FlagIcon sx={{ 
                                                                                mr: 1.5,
                                                                                color: theme.palette.mode === 'dark' ? colors.blueAccent[400] : '#ffffff',
                                                                                fontSize: '1.75rem',
                                                                                filter: theme.palette.mode === 'light' ? 'drop-shadow(0 1px 2px rgba(0,0,0,0.1))' : 'none'
                                                                            }} />
                                                                            <Typography variant="h6" sx={{ 
                                                                                fontWeight: 'bold', 
                                                                                color: theme.palette.mode === 'dark' ? colors.grey[100] : '#ffffff',
                                                                                fontSize: '1.1rem',
                                                                                textShadow: theme.palette.mode === 'light' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none'
                                                                            }}>
                                                                                {milestone.milestoneName || 'Unnamed Milestone'}
                                                                            </Typography>
                                                                        </Box>
                                                                        <Stack direction="row" spacing={0.5} sx={{ flexShrink: 0 }}>
                                                                            <Tooltip title="View Attachments">
                                                                                <IconButton 
                                                                                    edge="end" 
                                                                                    aria-label="attachments" 
                                                                                    onClick={() => {
                                                                                        setMilestoneToViewAttachments(milestone);
                                                                                        setOpenAttachmentsModal(true);
                                                                                    }}
                                                                                    sx={{
                                                                                        color: theme.palette.mode === 'dark' ? colors.blueAccent[300] : '#ffffff',
                                                                                        '&:hover': {
                                                                                            backgroundColor: theme.palette.mode === 'dark' ? colors.blueAccent[800] : 'rgba(255, 255, 255, 0.2)',
                                                                                            color: '#ffffff'
                                                                                        },
                                                                                        transition: 'all 0.2s ease-in-out'
                                                                                    }}
                                                                                >
                                                                                    <AttachmentIcon />
                                                                                </IconButton>
                                                                            </Tooltip>
                                                                            {checkUserPrivilege(user, 'milestone.update') && (
                                                                                <Tooltip title="Edit Milestone">
                                                                                    <IconButton 
                                                                                        edge="end" 
                                                                                        aria-label="edit" 
                                                                                        onClick={() => handleOpenEditMilestoneDialog(milestone)}
                                                                                        sx={{
                                                                                            color: theme.palette.mode === 'dark' ? colors.greenAccent[300] : '#ffffff',
                                                                                            '&:hover': {
                                                                                                backgroundColor: theme.palette.mode === 'dark' ? colors.greenAccent[800] : 'rgba(255, 255, 255, 0.2)',
                                                                                                color: '#ffffff'
                                                                                            },
                                                                                            transition: 'all 0.2s ease-in-out'
                                                                                        }}
                                                                                    >
                                                                                        <EditIcon />
                                                                                    </IconButton>
                                                                                </Tooltip>
                                                                            )}
                                                                            {checkUserPrivilege(user, 'milestone.delete') && (
                                                                                <Tooltip title="Delete Milestone">
                                                                                    <IconButton 
                                                                                        edge="end" 
                                                                                        aria-label="delete" 
                                                                                        onClick={() => handleDeleteMilestone(milestone.milestoneId)}
                                                                                        sx={{
                                                                                            color: theme.palette.mode === 'dark' ? colors.redAccent[300] : '#ffffff',
                                                                                            '&:hover': {
                                                                                                backgroundColor: theme.palette.mode === 'dark' ? colors.redAccent[800] : 'rgba(255, 255, 255, 0.2)',
                                                                                                color: '#ffffff'
                                                                                            },
                                                                                            transition: 'all 0.2s ease-in-out'
                                                                                        }}
                                                                                    >
                                                                                        <DeleteIcon />
                                                                                    </IconButton>
                                                                                </Tooltip>
                                                                            )}
                                                                        </Stack>
                                                                    </Box>
                                                                </Box>

                                                                <Box sx={{ 
                                                                    p: 2.5, 
                                                                    flexGrow: 1,
                                                                    backgroundColor: theme.palette.mode === 'dark' ? colors.primary[600] : colors.grey[50],
                                                                    borderBottomLeftRadius: '12px',
                                                                    borderBottomRightRadius: '12px'
                                                                }}>
                                                                    <Typography variant="body2" sx={{ 
                                                                        mb: 2,
                                                                        color: theme.palette.mode === 'dark' ? colors.grey[200] : colors.grey[800],
                                                                        fontWeight: 400,
                                                                        lineHeight: 1.6,
                                                                        fontSize: '0.9rem'
                                                                    }}>
                                                                        {milestone.description || 'No description.'}
                                                                    </Typography>
                                                                    
                                                                    <Stack spacing={1.5} sx={{ mb: 2 }}>
                                                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                                            <ScheduleIcon sx={{ 
                                                                                fontSize: '1rem', 
                                                                                color: theme.palette.mode === 'dark' ? colors.blueAccent[400] : colors.blueAccent[600] 
                                                                            }} />
                                                                            <Typography variant="body2" sx={{ 
                                                                                color: theme.palette.mode === 'dark' ? colors.grey[300] : colors.grey[800],
                                                                                fontWeight: 500
                                                                            }}>
                                                                                Due Date: {formatDate(milestone.dueDate)}
                                                                            </Typography>
                                                                        </Box>
                                                                        {milestone.completedDate && (
                                                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                                                <CheckCircleIcon sx={{ 
                                                                                    fontSize: '1rem', 
                                                                                    color: theme.palette.mode === 'dark' ? colors.greenAccent[400] : colors.greenAccent[600] 
                                                                                }} />
                                                                                <Typography variant="body2" sx={{ 
                                                                                    color: theme.palette.mode === 'dark' ? colors.grey[300] : colors.grey[800],
                                                                                    fontWeight: 500
                                                                                }}>
                                                                                    Completed: {formatDate(milestone.completedDate)}
                                                                                </Typography>
                                                                            </Box>
                                                                        )}
                                                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                                            <TrendingUpIcon sx={{ 
                                                                                fontSize: '1rem', 
                                                                                color: theme.palette.mode === 'dark' ? colors.blueAccent[400] : colors.blueAccent[600] 
                                                                            }} />
                                                                            <Typography variant="body2" sx={{ 
                                                                                color: theme.palette.mode === 'dark' ? colors.grey[300] : colors.grey[800],
                                                                                fontWeight: 500
                                                                            }}>
                                                                                Progress: {milestone.progress || 0}% (Weight: {milestone.weight || 1.00})
                                                                            </Typography>
                                                                        </Box>
                                                                    </Stack>
                                                                    
                                                                    <LinearProgress 
                                                                        variant="determinate" 
                                                                        value={milestone.progress || 0} 
                                                                        sx={{ 
                                                                            height: 10, 
                                                                            borderRadius: 5, 
                                                                            mb: 1.5,
                                                                            bgcolor: theme.palette.mode === 'dark' ? colors.grey[700] : colors.grey[300],
                                                                            '& .MuiLinearProgress-bar': {
                                                                                borderRadius: 5,
                                                                                background: theme.palette.mode === 'dark'
                                                                                    ? `linear-gradient(90deg, ${colors.blueAccent[500]} 0%, ${colors.blueAccent[400]} 100%)`
                                                                                    : `linear-gradient(90deg, ${colors.blueAccent[500]} 0%, ${colors.blueAccent[600]} 100%)`,
                                                                                boxShadow: theme.palette.mode === 'light' ? `0 2px 4px ${colors.blueAccent[200]}60` : 'none'
                                                                            }
                                                                        }} 
                                                                    />
                                                                    
                                                                    <Chip
                                                                        label={milestone.status || 'Not Started'}
                                                                        size="small"
                                                                        sx={{
                                                                            backgroundColor: getMilestoneStatusColors(milestone.status || 'not_started').backgroundColor,
                                                                            color: getMilestoneStatusColors(milestone.status || 'not_started').textColor,
                                                                            fontWeight: 'bold',
                                                                            fontSize: '0.75rem',
                                                                            height: '24px',
                                                                            borderRadius: '6px'
                                                                        }}
                                                                    />

                                                                    {/* Activities for this milestone */}
                                                                    <Box sx={{ 
                                                                        mt: 3,
                                                                        pt: 2.5,
                                                                        borderTop: `2px solid ${theme.palette.mode === 'dark' ? colors.grey[700] : colors.grey[200]}`
                                                                    }}>
                                                                        <Typography variant="subtitle2" sx={{ 
                                                                            fontWeight: 'bold',
                                                                            mb: 2,
                                                                            color: theme.palette.mode === 'dark' ? colors.blueAccent[400] : colors.blueAccent[700],
                                                                            fontSize: '1rem',
                                                                            display: 'flex',
                                                                            alignItems: 'center',
                                                                            gap: 0.5
                                                                        }}>
                                                                            Activities ({activitiesForMilestone.length})
                                                                        </Typography>
                                                                        {activitiesForMilestone.length > 0 ? (
                                                                            <List dense disablePadding>
                                                                                {activitiesForMilestone.map((activity, idx) => (
                                                                                    <ListItem 
                                                                                        key={activity.activityId} 
                                                                                        disablePadding
                                                                                        sx={{ 
                                                                                            mb: idx < activitiesForMilestone.length - 1 ? 1.5 : 0,
                                                                                            pb: idx < activitiesForMilestone.length - 1 ? 1.5 : 0,
                                                                                            borderBottom: idx < activitiesForMilestone.length - 1 
                                                                                                ? `1px solid ${theme.palette.mode === 'dark' ? colors.grey[700] : colors.grey[200]}`
                                                                                                : 'none'
                                                                                        }}
                                                                                    >
                                                                                        <ListItemText
                                                                                            primary={
                                                                                                <Typography variant="body2" sx={{ 
                                                                                                    fontWeight: 700,
                                                                                                    color: theme.palette.mode === 'dark' ? colors.grey[100] : '#000000',
                                                                                                    fontSize: '0.95rem',
                                                                                                    mb: 0.4,
                                                                                                    letterSpacing: '0.01em'
                                                                                                }}>
                                                                                                    {activity.activityName}
                                                                                                </Typography>
                                                                                            }
                                                                                            secondary={
                                                                                                <Stack spacing={0.5} sx={{ mt: 0.5 }}>
                                                                                                    <Typography variant="caption" sx={{
                                                                                                        color: theme.palette.mode === 'dark' ? colors.grey[400] : colors.grey[700],
                                                                                                        fontWeight: 500,
                                                                                                        fontSize: '0.8rem',
                                                                                                        display: 'block'
                                                                                                    }}>
                                                                                                        {formatDate(activity.startDate)} - {formatDate(activity.endDate)}
                                                                                                    </Typography>
                                                                                                    <Typography variant="caption" sx={{
                                                                                                        color: theme.palette.mode === 'dark' ? colors.grey[400] : colors.grey[700],
                                                                                                        fontWeight: 500,
                                                                                                        fontSize: '0.8rem',
                                                                                                        display: 'block'
                                                                                                    }}>
                                                                                                        Status: {activity.activityStatus?.replace(/_/g, ' ') || 'not started'} | Progress: {activity.percentageComplete || 0}%
                                                                                                    </Typography>
                                                                                                    {activity.budgetAllocated && (
                                                                                                        <Typography variant="caption" sx={{
                                                                                                            color: theme.palette.mode === 'dark' ? colors.grey[400] : colors.grey[700],
                                                                                                            fontWeight: 500,
                                                                                                            fontSize: '0.8rem',
                                                                                                            display: 'block'
                                                                                                        }}>
                                                                                                            Budget: {formatCurrency(activity.budgetAllocated)}
                                                                                                        </Typography>
                                                                                                    )}
                                                                                                </Stack>
                                                                                            }
                                                                                        />
                                                                                    </ListItem>
                                                                                ))}
                                                                            </List>
                                                                        ) : (
                                                                            <Typography variant="body2" sx={{ 
                                                                                fontStyle: 'italic', 
                                                                                mt: 1,
                                                                                color: theme.palette.mode === 'dark' ? colors.grey[400] : colors.grey[500],
                                                                                textAlign: 'center',
                                                                                py: 2
                                                                            }}>
                                                                                No activities linked to this milestone.
                                                                            </Typography>
                                                                        )}
                                                                    </Box>
                                                                </Box>
                                                            </Paper>
                                                        </Grid>
                                                    );
                                                })}
                                            </Grid>
                                        )}
                                    </Box>
                                </AccordionDetails>
                            </Accordion>
                        );
                    })
                )}
            </Box>

                    </Box>
                )}

                {/* Gantt Chart Tab - Hidden */}
                {/* M&E Tab - Removed */}
                {/* Documents Tab - Removed */}

                {/* M&E Tab Content - Removed (lines 3244-3695) */}

                {/* Documents Tab Content - Removed */}

                {activeTab === 2 && (
                    <Box>
                        {/* Jobs Tab */}
                        <Typography variant="h6" sx={{ 
                            mb: 1, 
                            fontWeight: 'bold',
                            color: theme.palette.mode === 'dark' ? colors.blueAccent[500] : colors.blueAccent[600],
                            display: 'flex',
                            alignItems: 'center',
                            gap: 1,
                            fontSize: '1rem'
                        }}>
                            <WorkIcon /> Jobs Created
                        </Typography>

                        {/* Summary cards */}
                        <Grid container spacing={2} sx={{ mb: 2 }}>
                            <Grid item xs={12} md={3}>
                                <Paper sx={{ p: 2 }}>
                                    <Typography variant="subtitle2" color="text.secondary">
                                        Total Jobs
                                    </Typography>
                                    <Typography variant="h5" fontWeight={600}>
                                        {jobsSummary.totalJobs}
                                    </Typography>
                                </Paper>
                            </Grid>
                            <Grid item xs={12} md={3}>
                                <Paper sx={{ p: 2 }}>
                                    <Typography variant="subtitle2" color="text.secondary">
                                        Male
                                    </Typography>
                                    <Typography variant="h6">
                                        {jobsSummary.totalMale}
                                    </Typography>
                                </Paper>
                            </Grid>
                            <Grid item xs={12} md={3}>
                                <Paper sx={{ p: 2 }}>
                                    <Typography variant="subtitle2" color="text.secondary">
                                        Female
                                    </Typography>
                                    <Typography variant="h6">
                                        {jobsSummary.totalFemale}
                                    </Typography>
                                </Paper>
                            </Grid>
                            <Grid item xs={12} md={3}>
                                <Paper sx={{ p: 2 }}>
                                    <Typography variant="subtitle2" color="text.secondary">
                                        Youth
                                    </Typography>
                                    <Typography variant="h6">
                                        {jobsSummary.totalYouth}
                                    </Typography>
                                </Paper>
                            </Grid>
                        </Grid>

                        {/* Add Job form */}
                        <Paper sx={{ p: 2, mb: 2 }}>
                            <Typography variant="subtitle2" sx={{ mb: 1 }}>
                                Add Jobs Created
                            </Typography>
                            <Grid container spacing={2}>
                                <Grid item xs={12} md={4}>
                                    <FormControl fullWidth size="small" sx={{ minWidth: 220 }}>
                                        <InputLabel id="job-category-label">Job Category</InputLabel>
                                        <Select
                                            labelId="job-category-label"
                                            label="Job Category"
                                            value={jobFormData.categoryId}
                                            onChange={(e) => setJobFormData(prev => ({ ...prev, categoryId: e.target.value }))}
                                            error={!!jobFormErrors.categoryId}
                                        >
                                            {loadingJobCategories ? (
                                                <MenuItem disabled>Loading...</MenuItem>
                                            ) : (
                                                jobCategories.map(cat => (
                                                    <MenuItem key={cat.id} value={cat.id}>
                                                        {cat.jobCategory || cat.name}
                                                    </MenuItem>
                                                ))
                                            )}
                                        </Select>
                                    </FormControl>
                                </Grid>
                                <Grid item xs={12} md={2}>
                                    <TextField
                                        label="Jobs"
                                        type="number"
                                        size="small"
                                        fullWidth
                                        value={jobFormData.jobsCount}
                                        onChange={(e) => setJobFormData(prev => ({ ...prev, jobsCount: e.target.value }))}
                                        error={!!jobFormErrors.jobsCount}
                                    />
                                </Grid>
                                <Grid item xs={12} md={2}>
                                    <TextField
                                        label="Male"
                                        type="number"
                                        size="small"
                                        fullWidth
                                        value={jobFormData.maleCount}
                                        onChange={(e) => setJobFormData(prev => ({ ...prev, maleCount: e.target.value }))}
                                    />
                                </Grid>
                                <Grid item xs={12} md={2}>
                                    <TextField
                                        label="Female"
                                        type="number"
                                        size="small"
                                        fullWidth
                                        value={jobFormData.femaleCount}
                                        onChange={(e) => setJobFormData(prev => ({ ...prev, femaleCount: e.target.value }))}
                                    />
                                </Grid>
                                <Grid item xs={12} md={2}>
                                    <TextField
                                        label="Youth"
                                        type="number"
                                        size="small"
                                        fullWidth
                                        value={jobFormData.youthCount}
                                        onChange={(e) => setJobFormData(prev => ({ ...prev, youthCount: e.target.value }))}
                                    />
                                </Grid>
                                <Grid item xs={12} md={12}>
                                    <Box display="flex" justifyContent="flex-end" gap={1}>
                                        <Button
                                            variant="outlined"
                                            size="small"
                                            onClick={() => {
                                                setJobFormData({
                                                    categoryId: '',
                                                    jobsCount: '',
                                                    maleCount: '',
                                                    femaleCount: '',
                                                    youthCount: '',
                                                });
                                                setJobFormErrors({});
                                            }}
                                        >
                                            Clear
                                        </Button>
                                        <Button
                                            variant="contained"
                                            size="small"
                                            onClick={async () => {
                                                const errors = {};
                                                if (!jobFormData.categoryId) {
                                                    errors.categoryId = 'Job category is required';
                                                }
                                                if (!jobFormData.jobsCount || parseInt(jobFormData.jobsCount, 10) <= 0) {
                                                    errors.jobsCount = 'Jobs must be a positive number';
                                                }
                                                setJobFormErrors(errors);
                                                if (Object.keys(errors).length > 0) return;

                                                try {
                                                    await projectService.junctions.createProjectJob(projectId, {
                                                        categoryId: jobFormData.categoryId,
                                                        jobsCount: jobFormData.jobsCount,
                                                        maleCount: jobFormData.maleCount,
                                                        femaleCount: jobFormData.femaleCount,
                                                        youthCount: jobFormData.youthCount,
                                                    });
                                                    setSnackbar({
                                                        open: true,
                                                        message: 'Job record added successfully',
                                                        severity: 'success',
                                                    });
                                                    setJobFormData({
                                                        categoryId: '',
                                                        jobsCount: '',
                                                        maleCount: '',
                                                        femaleCount: '',
                                                        youthCount: '',
                                                    });
                                                    setJobFormErrors({});
                                                    fetchProjectJobs();
                                                } catch (error) {
                                                    console.error('Error creating project job:', error);
                                                    setSnackbar({
                                                        open: true,
                                                        message: error?.response?.data?.message || 'Failed to add job record',
                                                        severity: 'error',
                                                    });
                                                }
                                            }}
                                        >
                                            Save
                                        </Button>
                    </Box>
                                </Grid>
                            </Grid>
                        </Paper>

                        {/* Jobs list */}
                        <Paper sx={{ p: 2 }}>
                            <Typography variant="subtitle2" sx={{ mb: 1 }}>
                                Jobs by Category
                            </Typography>
                            {loadingJobs ? (
                                <Box display="flex" justifyContent="center" alignItems="center" minHeight="120px">
                                    <CircularProgress size={24} />
                    </Box>
                            ) : jobsError ? (
                                <Alert severity="error">{jobsError}</Alert>
                            ) : !Array.isArray(projectJobs) || projectJobs.length === 0 ? (
                                <Typography variant="body2" color="text.secondary">
                                    No job records have been captured for this project yet.
                                </Typography>
                            ) : (
                                <TableContainer>
                                    <Table size="small">
                                        <TableHead>
                                            <TableRow>
                                                <TableCell><strong>Category</strong></TableCell>
                                                <TableCell><strong>Date</strong></TableCell>
                                                <TableCell><strong>Jobs</strong></TableCell>
                                                <TableCell><strong>Male</strong></TableCell>
                                                <TableCell><strong>Female</strong></TableCell>
                                                <TableCell><strong>Youth</strong></TableCell>
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {(Array.isArray(projectJobs) ? projectJobs : []).map(job => (
                                                <TableRow key={job.id}>
                                                    <TableCell>{job.category_name || 'Uncategorized'}</TableCell>
                                                    <TableCell>
                                                        {job.created_at ? (() => {
                                                            try {
                                                                const date = new Date(job.created_at);
                                                                return isNaN(date.getTime()) ? 'N/A' : date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
                                                            } catch {
                                                                return 'N/A';
                                                            }
                                                        })() : 'N/A'}
                                                    </TableCell>
                                                    <TableCell>{job.jobs_count ?? 0}</TableCell>
                                                    <TableCell>{job.male_count ?? 0}</TableCell>
                                                    <TableCell>{job.female_count ?? 0}</TableCell>
                                                    <TableCell>{job.youth_count ?? 0}</TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </TableContainer>
                            )}
                        </Paper>
                    </Box>
                )}

                {/* M&E Tab Content - Removed */}
                {/* Documents Tab Content - Removed */}

                {activeTab === 1 && (
                    <Box>
                        {/* Sites Tab */}
                        <Typography variant="h6" sx={{ 
                            mb: 1, 
                            fontWeight: 'bold',
                            color: theme.palette.mode === 'dark' ? colors.blueAccent[500] : colors.blueAccent[600],
                            display: 'flex',
                            alignItems: 'center',
                            gap: 1,
                            fontSize: '1rem'
                        }}>
                            <LocationOnIcon /> Project Sites
                        </Typography>
                        {loadingSites ? (
                            <Box display="flex" justifyContent="center" alignItems="center" minHeight="150px">
                                <CircularProgress />
                            </Box>
                        ) : sitesError ? (
                            <Alert severity="error" sx={{ mb: 1 }}>
                                {sitesError}
                            </Alert>
                        ) : projectSites.length === 0 ? (
                            <Paper sx={{ p: 2, textAlign: 'center' }}>
                                <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.9rem', mb: 2 }}>
                                    No sites added to this project yet.
                                </Typography>
                            </Paper>
                        ) : (
                            <TableContainer component={Paper} sx={{ mt: 2 }}>
                                <Table size="small">
                                    <TableHead>
                                        <TableRow>
                                            <TableCell><strong>Site Name</strong></TableCell>
                                            <TableCell><strong>Location</strong></TableCell>
                                            <TableCell><strong>Status</strong></TableCell>
                                            <TableCell><strong>Progress</strong></TableCell>
                                            <TableCell><strong>Actions</strong></TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {projectSites.map((site) => (
                                            <TableRow key={site.site_id}>
                                                <TableCell>{site.site_name || 'N/A'}</TableCell>
                                                <TableCell>
                                                    {[site.ward, site.constituency, site.county].filter(Boolean).join(', ') || 'N/A'}
                                                </TableCell>
                                                <TableCell>{site.status_norm || 'N/A'}</TableCell>
                                                <TableCell>{site.percent_complete || 0}%</TableCell>
                                                <TableCell>
                                                    <IconButton 
                                                        size="small" 
                                                        color="error"
                                                        onClick={() => handleDeleteSite(site.site_id)}
                                                    >
                                                        <DeleteIcon fontSize="small" />
                                                    </IconButton>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </TableContainer>
                        )}
                    </Box>
                )}

                {activeTab === 5 && (
                    <Box>
                        {/* Map Tab */}
                        <ProjectMapEditor 
                            projectId={projectId} 
                            projectName={project?.projectName || ''}
                        />
                    </Box>
                )}

                {activeTab === 1 && (
                    <Box>
                        {/* Sites Tab */}
                        <Typography variant="h6" sx={{ 
                            mb: 1, 
                            fontWeight: 'bold',
                            color: theme.palette.mode === 'dark' ? colors.blueAccent[500] : colors.blueAccent[600],
                            display: 'flex',
                            alignItems: 'center',
                            gap: 1,
                            fontSize: '1rem'
                        }}>
                            <LocationOnIcon /> Project Sites
                        </Typography>
                        {loadingSites ? (
                            <Box display="flex" justifyContent="center" alignItems="center" minHeight="150px">
                                <CircularProgress />
                            </Box>
                        ) : sitesError ? (
                            <Alert severity="error" sx={{ mb: 1 }}>
                                {sitesError}
                            </Alert>
                        ) : projectSites.length === 0 ? (
                            <Paper sx={{ p: 2, textAlign: 'center' }}>
                                <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.9rem', mb: 2 }}>
                                    No sites added to this project yet.
                                </Typography>
                                <Button
                                    variant="contained"
                                    startIcon={<AddIcon />}
                                    onClick={() => {
                                        setEditingSite(null);
                                        setSiteFormData({
                                            siteName: '',
                                            county: '',
                                            constituency: '',
                                            ward: '',
                                            status: '',
                                            progress: '',
                                            approvedCost: '',
                                        });
                                        setSiteFormErrors({});
                                        setOpenSiteDialog(true);
                                    }}
                                    sx={{
                                        backgroundColor: colors.greenAccent[600],
                                        '&:hover': {
                                            backgroundColor: colors.greenAccent[700]
                                        }
                                    }}
                                >
                                    Add Site
                                </Button>
                            </Paper>
                        ) : (
                            <Box>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, flexWrap: 'wrap', gap: 1.5 }}>
                                    <Typography variant="body2" color="text.secondary">
                                        {projectSites.length} site{projectSites.length !== 1 ? 's' : ''} found
                                    </Typography>
                                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                                        <TextField
                                            label="Filter by Location"
                                            size="small"
                                            value={siteFilters.location}
                                            onChange={(e) =>
                                                setSiteFilters((prev) => ({ ...prev, location: e.target.value }))
                                            }
                                            placeholder="County / Constituency / Ward"
                                            sx={{ minWidth: 200 }}
                                        />
                                        <FormControl size="small" sx={{ minWidth: 180 }}>
                                            <InputLabel id="site-status-filter-label">Status</InputLabel>
                                            <Select
                                                labelId="site-status-filter-label"
                                                label="Status"
                                                value={siteFilters.status}
                                                onChange={(e) =>
                                                    setSiteFilters((prev) => ({ ...prev, status: e.target.value }))
                                                }
                                            >
                                                <MenuItem value="">
                                                    <em>All</em>
                                                </MenuItem>
                                                <MenuItem value="Not Started">Not Started</MenuItem>
                                                <MenuItem value="In Progress">In Progress</MenuItem>
                                                <MenuItem value="Completed">Completed</MenuItem>
                                                <MenuItem value="Stalled">Stalled</MenuItem>
                                            </Select>
                                        </FormControl>
                                        <Button
                                            variant="outlined"
                                            size="small"
                                            onClick={() => setSiteFilters({ location: '', status: '' })}
                                        >
                                            Clear
                                        </Button>
                                    <Button
                                        variant="contained"
                                        startIcon={<AddIcon />}
                                        onClick={() => {
                                                setEditingSite(null);
                                                setSiteFormData({
                                                    siteName: '',
                                                    county: '',
                                                    constituency: '',
                                                    ward: '',
                                                    status: '',
                                                    progress: '',
                                                    approvedCost: '',
                                                });
                                                setSiteFormErrors({});
                                                setOpenSiteDialog(true);
                                        }}
                                        size="small"
                                        sx={{
                                            backgroundColor: colors.greenAccent[600],
                                            '&:hover': {
                                                backgroundColor: colors.greenAccent[700]
                                            }
                                        }}
                                    >
                                        Add Site
                                    </Button>
                                </Box>
                                </Box>
                                <Grid container spacing={1.5}>
                                    {projectSites
                                        .filter((site) => {
                                            const locationFilter = siteFilters.location?.toLowerCase() || '';
                                            const statusFilter = siteFilters.status;

                                            const locationText = [
                                                site.county,
                                                site.constituency,
                                                site.ward,
                                            ]
                                                .filter(Boolean)
                                                .join(' ')
                                                .toLowerCase();

                                            const statusText = (site.status_norm || site.status_raw || '').toString();

                                            const matchesLocation =
                                                !locationFilter ||
                                                locationText.includes(locationFilter);

                                            const matchesStatus =
                                                !statusFilter || statusText === statusFilter;

                                            return matchesLocation && matchesStatus;
                                        })
                                        .map((site, index) => (
                                        <Grid item xs={12} md={6} key={site.site_id || index}>
                                            <Paper 
                                                sx={{ 
                                                    p: 1.75, 
                                                    borderRadius: '10px',
                                                    backgroundColor: theme.palette.mode === 'dark' ? '#1F2A40' : '#ffffff',
                                                    border: `1px solid ${theme.palette.mode === 'dark' ? colors.blueAccent[700] : '#e0e0e0'}`,
                                                    boxShadow: theme.palette.mode === 'dark'
                                                        ? '0 2px 6px rgba(0,0,0,0.6)'
                                                        : '0 1px 4px rgba(0,0,0,0.06)',
                                                }}
                                            >
                                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                                                    <Box>
                                                        <Typography
                                                            variant="subtitle2"
                                                            sx={{
                                                                fontWeight: 700,
                                                                color: theme.palette.mode === 'dark' ? colors.blueAccent[300] : colors.blueAccent[600],
                                                                fontSize: '0.9rem',
                                                                mb: 0.4,
                                                            }}
                                                        >
                                                        {site.site_name || `Site ${index + 1}`}
                                                    </Typography>
                                                        <Typography
                                                            variant="caption"
                                                            sx={{ color: 'text.secondary', fontSize: '0.7rem' }}
                                                        >
                                                            {[site.ward, site.constituency, site.county]
                                                                .filter(Boolean)
                                                                .join(', ') || 'No location set'}
                                                        </Typography>
                                                    </Box>
                                                    <Box>
                                                        <Tooltip title="Edit site details">
                                                            <IconButton
                                                                size="small"
                                                                onClick={() => {
                                                                    setEditingSite(site);
                                                                    setSiteFormData({
                                                                        siteName: site.site_name || site.siteName || '',
                                                                        county: site.county || '',
                                                                        constituency: site.constituency || '',
                                                                        ward: site.ward || '',
                                                                        status: site.status_norm || site.status_raw || '',
                                                                        progress: site.percent_complete ?? '',
                                                                        approvedCost: site.approved_cost_kes ?? '',
                                                                    });
                                                                    setSiteFormErrors({});
                                                                    setOpenSiteDialog(true);
                                                                }}
                                                                sx={{ color: colors.blueAccent[500] }}
                                                            >
                                                                <EditIcon fontSize="small" />
                                                            </IconButton>
                                                        </Tooltip>
                                                        <Tooltip title="Delete site">
                                                            <IconButton
                                                                size="small"
                                                                onClick={async () => {
                                                                    if (window.confirm('Are you sure you want to delete this site?')) {
                                                                        try {
                                                                            await apiService.junctions.deleteProjectSite(projectId, site.site_id);
                                                                            setSnackbar({ open: true, message: 'Site deleted successfully', severity: 'success' });
                                                                            fetchProjectSites();
                                                                        } catch (err) {
                                                                            setSnackbar({ open: true, message: 'Failed to delete site', severity: 'error' });
                                                                        }
                                                                    }
                                                                }}
                                                                sx={{ color: colors.redAccent[500] }}
                                                            >
                                                                <DeleteIcon fontSize="small" />
                                                            </IconButton>
                                                        </Tooltip>
                                                        <Tooltip title="Observations / Site updates">
                                                            <IconButton
                                                                size="small"
                                                                onClick={() => {
                                                                    setSiteForUpdates(site);
                                                                    setSiteUpdatesDialogOpen(true);
                                                                }}
                                                                sx={{ color: colors.grey[500] }}
                                                            >
                                                                <UpdateIcon fontSize="small" />
                                                            </IconButton>
                                                        </Tooltip>
                                                    </Box>
                                                </Box>
                                                <Stack spacing={0.5}>
                                                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 0.5 }}>
                                                    {site.status_norm && (
                                                            <Chip
                                                                label={site.status_norm}
                                                                size="small"
                                                                color={
                                                                    site.status_norm === 'Completed'
                                                                        ? 'success'
                                                                        : site.status_norm === 'In Progress'
                                                                            ? 'primary'
                                                                            : 'default'
                                                                }
                                                                sx={{ fontSize: '0.7rem', height: 22 }}
                                                            />
                                                        )}
                                                        {site.percent_complete !== null &&
                                                            site.percent_complete !== undefined && (
                                                                <Chip
                                                                    label={`Progress: ${site.percent_complete}%`}
                                                                    size="small"
                                                                    variant="outlined"
                                                                    sx={{ fontSize: '0.7rem', height: 22 }}
                                                                />
                                                    )}
                                                    {site.approved_cost_kes && (
                                                            <Chip
                                                                label={`KES ${formatCurrency(site.approved_cost_kes)}`}
                                                                size="small"
                                                                variant="outlined"
                                                                sx={{ fontSize: '0.7rem', height: 22 }}
                                                            />
                                                        )}
                                                    </Box>
                                                </Stack>
                                            </Paper>
                                        </Grid>
                                    ))}
                                </Grid>
                            </Box>
                        )}
                    </Box>
                )}

                {/* Add/Edit Site Dialog */}
                <Dialog
                    open={openSiteDialog}
                    onClose={() => {
                        setOpenSiteDialog(false);
                        setEditingSite(null);
                        setSiteFormErrors({});
                    }}
                    maxWidth="sm"
                    fullWidth
                >
                    <DialogTitle>
                        {editingSite ? 'Edit Site' : 'Add Site'}
                    </DialogTitle>
                    <DialogContent>
                        <Stack spacing={2} sx={{ mt: 1 }}>
                            <TextField
                                label="Site Name"
                                fullWidth
                                size="small"
                                value={siteFormData.siteName}
                                onChange={(e) => setSiteFormData(prev => ({ ...prev, siteName: e.target.value }))}
                                error={!!siteFormErrors.siteName}
                                helperText={siteFormErrors.siteName}
                            />
                            <TextField
                                label="County"
                                fullWidth
                                size="small"
                                value={siteFormData.county}
                                onChange={(e) => setSiteFormData(prev => ({ ...prev, county: e.target.value }))}
                            />
                            <TextField
                                label="Constituency"
                                fullWidth
                                size="small"
                                value={siteFormData.constituency}
                                onChange={(e) => setSiteFormData(prev => ({ ...prev, constituency: e.target.value }))}
                            />
                            <TextField
                                label="Ward"
                                fullWidth
                                size="small"
                                value={siteFormData.ward}
                                onChange={(e) => setSiteFormData(prev => ({ ...prev, ward: e.target.value }))}
                            />
                            <FormControl fullWidth size="small">
                                <InputLabel id="site-status-label">Status</InputLabel>
                                <Select
                                    labelId="site-status-label"
                                    label="Status"
                                    value={siteFormData.status}
                                    onChange={(e) => setSiteFormData(prev => ({ ...prev, status: e.target.value }))}
                                >
                                    <MenuItem value="Not Started">Not Started</MenuItem>
                                    <MenuItem value="In Progress">In Progress</MenuItem>
                                    <MenuItem value="Completed">Completed</MenuItem>
                                    <MenuItem value="Stalled">Stalled</MenuItem>
                                </Select>
                            </FormControl>
                            <TextField
                                label="Progress (%)"
                                type="number"
                                fullWidth
                                size="small"
                                value={siteFormData.progress}
                                onChange={(e) => setSiteFormData(prev => ({ ...prev, progress: e.target.value }))}
                            />
                            <TextField
                                label="Approved Cost (KES)"
                                type="number"
                                fullWidth
                                size="small"
                                value={siteFormData.approvedCost}
                                onChange={(e) => setSiteFormData(prev => ({ ...prev, approvedCost: e.target.value }))}
                            />
                        </Stack>
                    </DialogContent>
                    <DialogActions>
                        <Button
                            onClick={() => {
                                setOpenSiteDialog(false);
                                setEditingSite(null);
                                setSiteFormErrors({});
                            }}
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="contained"
                            onClick={async () => {
                                const errors = {};
                                if (!siteFormData.siteName.trim()) {
                                    errors.siteName = 'Site name is required';
                                }
                                setSiteFormErrors(errors);
                                if (Object.keys(errors).length > 0) return;

                                const payload = {
                                    site_name: siteFormData.siteName.trim(),
                                    county: siteFormData.county.trim() || null,
                                    constituency: siteFormData.constituency.trim() || null,
                                    ward: siteFormData.ward.trim() || null,
                                    status_norm: siteFormData.status || null,
                                    percent_complete: siteFormData.progress !== '' ? parseFloat(siteFormData.progress) || 0 : null,
                                    approved_cost_kes: siteFormData.approvedCost !== '' ? parseFloat(siteFormData.approvedCost) || 0 : null,
                                };

                                try {
                                    if (editingSite) {
                                        await apiService.junctions.updateProjectSite(projectId, editingSite.site_id, payload);
                                        setSnackbar({ open: true, message: 'Site updated successfully', severity: 'success' });
                                    } else {
                                        await apiService.junctions.createProjectSite(projectId, payload);
                                        setSnackbar({ open: true, message: 'Site created successfully', severity: 'success' });
                                    }
                                    setOpenSiteDialog(false);
                                    setEditingSite(null);
                                    setSiteFormErrors({});
                                    await fetchProjectSites();
                                } catch (err) {
                                    console.error('Error saving site:', err);
                                    setSnackbar({ open: true, message: 'Failed to save site', severity: 'error' });
                                }
                            }}
                        >
                            Save
                        </Button>
                    </DialogActions>
                </Dialog>

                {siteForUpdates && (
                    <SiteUpdatesDialog
                        open={siteUpdatesDialogOpen}
                        onClose={() => {
                            setSiteUpdatesDialogOpen(false);
                            setSiteForUpdates(null);
                        }}
                        projectId={projectId}
                        site={siteForUpdates}
                    />
                )}

                {activeTab === 3 && (
                    <Box>
                        {/* Teams Tab */}
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                            <Typography variant="h6" sx={{ 
                                fontWeight: 'bold',
                                color: theme.palette.mode === 'dark' ? colors.blueAccent[500] : colors.blueAccent[600],
                                display: 'flex',
                                alignItems: 'center',
                                gap: 1,
                                fontSize: '1rem'
                            }}>
                                <GroupIcon /> Project Teams
                            </Typography>
                            <Stack direction="row" spacing={0.75}>
                                <Button
                                    variant="outlined"
                                    startIcon={<DownloadIcon />}
                                    onClick={handleDownloadTeamTemplate}
                                    size="small"
                                    sx={{ fontSize: '0.75rem', py: 0.4, px: 1 }}
                                >
                                    Download Template
                                </Button>
                                <Button
                                    variant="outlined"
                                    startIcon={<UploadIcon />}
                                    onClick={() => document.getElementById('team-upload-input')?.click()}
                                    size="small"
                                    sx={{ fontSize: '0.75rem', py: 0.4, px: 1 }}
                                >
                                    Upload List
                                </Button>
                                <Button
                                    variant="outlined"
                                    startIcon={<AddIcon />}
                                    onClick={() => setOpenTeamDialog(true)}
                                    size="small"
                                    sx={{ fontSize: '0.75rem', py: 0.4, px: 1 }}
                                >
                                    Add Member
                                </Button>
                                {projectTeams.length > 0 && (
                                    <>
                                        <Button
                                            variant="outlined"
                                            startIcon={<DownloadIcon />}
                                            onClick={handleDownloadTeamsPDF}
                                            size="small"
                                            sx={{ fontSize: '0.75rem', py: 0.4, px: 1 }}
                                        >
                                            PDF
                                        </Button>
                                        <Button
                                            variant="outlined"
                                            startIcon={<PrintIcon />}
                                            onClick={handlePrintTeams}
                                            size="small"
                                            sx={{ fontSize: '0.75rem', py: 0.4, px: 1 }}
                                        >
                                            Print
                                        </Button>
                                    </>
                                )}
                            </Stack>
                        </Box>
                        <input
                            type="file"
                            id="team-upload-input"
                            accept=".csv,.xlsx,.xls"
                            style={{ display: 'none' }}
                            onChange={handleTeamFileUpload}
                        />
                        {loadingTeams ? (
                            <Box display="flex" justifyContent="center" alignItems="center" minHeight="150px">
                                <CircularProgress />
                            </Box>
                        ) : teamsError ? (
                            <Alert severity="error" sx={{ mb: 1 }}>
                                {teamsError}
                            </Alert>
                        ) : projectTeams.length === 0 ? (
                            <Paper sx={{ p: 1, textAlign: 'center' }}>
                                <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.8rem' }}>
                                    No team members assigned to this project.
                                </Typography>
                            </Paper>
                        ) : (
                            <Box sx={{ mt: 1 }}>
                                {Object.entries(groupedTeams).map(([teamName, members]) => (
                                    <Accordion 
                                        key={teamName} 
                                        defaultExpanded={Object.keys(groupedTeams).length === 1}
                                        sx={{ 
                                            mb: 1,
                                            '&:before': { display: 'none' },
                                            boxShadow: theme.palette.mode === 'dark' 
                                                ? '0 2px 8px rgba(0,0,0,0.3)' 
                                                : '0 2px 4px rgba(0,0,0,0.1)'
                                        }}
                                    >
                                        <AccordionSummary
                                            expandIcon={<ExpandMoreIcon />}
                                            sx={{
                                                backgroundColor: theme.palette.mode === 'dark' 
                                                    ? colors.blueAccent[800] 
                                                    : colors.blueAccent[50],
                                                borderLeft: `4px solid ${colors.blueAccent[500]}`,
                                                '&:hover': {
                                                    backgroundColor: theme.palette.mode === 'dark' 
                                                        ? colors.blueAccent[700] 
                                                        : colors.blueAccent[100]
                                                }
                                            }}
                                        >
                                            <Stack direction="row" spacing={1} alignItems="center" sx={{ width: '100%' }}>
                                                <Chip 
                                                    label={teamName} 
                                                    size="small"
                                                    sx={{ 
                                                        fontSize: '0.75rem', 
                                                        fontWeight: 'bold',
                                                        backgroundColor: colors.blueAccent[500],
                                                        color: 'white'
                                                    }}
                                                />
                                                <Typography variant="body2" sx={{ 
                                                    color: theme.palette.mode === 'dark' ? colors.grey[200] : colors.grey[700],
                                                    fontWeight: 500
                                                }}>
                                                    {members.length} member{members.length !== 1 ? 's' : ''}
                                                </Typography>
                                            </Stack>
                                        </AccordionSummary>
                                        <AccordionDetails sx={{ p: 0 }}>
                                            <TableContainer>
                                                <Table size="small">
                                                    <TableHead>
                                                        <TableRow sx={{ backgroundColor: theme.palette.mode === 'dark' ? colors.primary[600] : colors.grey[100] }}>
                                                            <TableCell sx={{ fontWeight: 'bold', fontSize: '0.8rem', py: 0.5, px: 1 }}>Name</TableCell>
                                                            <TableCell sx={{ fontWeight: 'bold', fontSize: '0.8rem', py: 0.5, px: 1 }}>Role</TableCell>
                                                            <TableCell sx={{ fontWeight: 'bold', fontSize: '0.8rem', py: 0.5, px: 1 }}>Email</TableCell>
                                                            <TableCell sx={{ fontWeight: 'bold', fontSize: '0.8rem', py: 0.5, px: 1 }}>Phone</TableCell>
                                                            <TableCell sx={{ fontWeight: 'bold', fontSize: '0.8rem', py: 0.5, px: 1 }}>Date Appointed</TableCell>
                                                            <TableCell sx={{ fontWeight: 'bold', fontSize: '0.8rem', py: 0.5, px: 1 }}>Date Ended</TableCell>
                                                            <TableCell sx={{ fontWeight: 'bold', fontSize: '0.8rem', py: 0.5, px: 1 }}>Status</TableCell>
                                                            <TableCell sx={{ fontWeight: 'bold', fontSize: '0.8rem', py: 0.5, px: 1 }}>Actions</TableCell>
                                                        </TableRow>
                                                    </TableHead>
                                                    <TableBody>
                                                        {members.map((member, index) => (
                                                            <TableRow key={member.teamMemberId || index} hover>
                                                                <TableCell sx={{ fontSize: '0.8rem', py: 0.5, px: 1 }}>{member.name || 'N/A'}</TableCell>
                                                                <TableCell sx={{ fontSize: '0.8rem', py: 0.5, px: 1 }}>
                                                                    <Chip 
                                                                        label={member.role || 'N/A'} 
                                                                        size="small"
                                                                        sx={{ fontSize: '0.7rem', height: '20px' }}
                                                                    />
                                                                </TableCell>
                                                                <TableCell sx={{ fontSize: '0.8rem', py: 0.5, px: 1 }}>{member.email || 'N/A'}</TableCell>
                                                                <TableCell sx={{ fontSize: '0.8rem', py: 0.5, px: 1 }}>{member.phone || 'N/A'}</TableCell>
                                                                <TableCell sx={{ fontSize: '0.8rem', py: 0.5, px: 1 }}>{formatDate(member.dateAppointed)}</TableCell>
                                                                <TableCell sx={{ fontSize: '0.8rem', py: 0.5, px: 1 }}>{formatDate(member.dateEnded) || 'Active'}</TableCell>
                                                                <TableCell sx={{ fontSize: '0.8rem', py: 0.5, px: 1 }}>
                                                                    <Chip 
                                                                        label={member.dateEnded ? 'Inactive' : 'Active'} 
                                                                        size="small"
                                                                        color={member.dateEnded ? 'default' : 'success'}
                                                                        sx={{ fontSize: '0.7rem', height: '20px' }}
                                                                    />
                                                                </TableCell>
                                                                <TableCell sx={{ fontSize: '0.8rem', py: 0.5, px: 1 }}>
                                                                    <Tooltip title="Actions">
                                                                        <IconButton
                                                                            size="small"
                                                                            onClick={(e) => {
                                                                                setSelectedRow(member);
                                                                                setRowActionMenuAnchor(e.currentTarget);
                                                                            }}
                                                                            sx={{ p: 0.25 }}
                                                                        >
                                                                            <MoreVertIcon fontSize="small" />
                                                                        </IconButton>
                                                                    </Tooltip>
                                                                </TableCell>
                                                            </TableRow>
                                                        ))}
                                                    </TableBody>
                                                </Table>
                                            </TableContainer>
                                        </AccordionDetails>
                                    </Accordion>
                                ))}
                            </Box>
                        )}

                        {/* Add/Edit Team Member Dialog */}
                        <Dialog 
                            open={openTeamDialog} 
                            onClose={() => {
                                setOpenTeamDialog(false);
                                setEditingTeam(null);
                                setTeamFormData({
                                    teamName: '',
                                    name: '',
                                    role: '',
                                    email: '',
                                    phone: '',
                                    dateAppointed: '',
                                    dateEnded: '',
                                    notes: ''
                                });
                            }}
                            maxWidth="sm"
                            fullWidth
                        >
                            <DialogTitle sx={{ fontSize: '1rem', pb: 1 }}>
                                {editingTeam ? 'Edit Team Member' : 'Add Team Member'}
                            </DialogTitle>
                            <DialogContent>
                                <Stack spacing={0.75} sx={{ mt: 0.25 }}>
                                    <TextField
                                        label="Team Name"
                                        fullWidth
                                        value={teamFormData.teamName || ''}
                                        onChange={(e) => setTeamFormData({ ...teamFormData, teamName: e.target.value })}
                                        size="small"
                                        placeholder="e.g., Inspection Team, Evaluation Committee"
                                        helperText="Name of the team this member belongs to"
                                    />
                                    <TextField
                                        label="Name"
                                        fullWidth
                                        value={teamFormData.name}
                                        onChange={(e) => setTeamFormData({ ...teamFormData, name: e.target.value })}
                                        size="small"
                                        required
                                    />
                                    <FormControl fullWidth size="small" required>
                                        <InputLabel>Role</InputLabel>
                                        <Select
                                            value={teamFormData.role}
                                            label="Role"
                                            onChange={(e) => setTeamFormData({ ...teamFormData, role: e.target.value })}
                                        >
                                            <MenuItem value="Project Manager">Project Manager</MenuItem>
                                            <MenuItem value="Evaluation Committee">Evaluation Committee</MenuItem>
                                            <MenuItem value="PMC">PMC (Project Management Committee)</MenuItem>
                                            <MenuItem value="Inspection Team">Inspection Team</MenuItem>
                                            <MenuItem value="Technical Advisor">Technical Advisor</MenuItem>
                                            <MenuItem value="Financial Officer">Financial Officer</MenuItem>
                                            <MenuItem value="Quality Assurance">Quality Assurance</MenuItem>
                                            <MenuItem value="Safety Officer">Safety Officer</MenuItem>
                                            <MenuItem value="Other">Other</MenuItem>
                                        </Select>
                                    </FormControl>
                                    <TextField
                                        label="Email"
                                        fullWidth
                                        type="email"
                                        value={teamFormData.email}
                                        onChange={(e) => setTeamFormData({ ...teamFormData, email: e.target.value })}
                                        size="small"
                                    />
                                    <TextField
                                        label="Phone"
                                        fullWidth
                                        value={teamFormData.phone}
                                        onChange={(e) => setTeamFormData({ ...teamFormData, phone: e.target.value })}
                                        size="small"
                                    />
                                    <TextField
                                        label="Date Appointed"
                                        fullWidth
                                        type="date"
                                        value={teamFormData.dateAppointed}
                                        onChange={(e) => setTeamFormData({ ...teamFormData, dateAppointed: e.target.value })}
                                        size="small"
                                        InputLabelProps={{ shrink: true }}
                                        required
                                    />
                                    <TextField
                                        label="Date Ended (if applicable)"
                                        fullWidth
                                        type="date"
                                        value={teamFormData.dateEnded}
                                        onChange={(e) => setTeamFormData({ ...teamFormData, dateEnded: e.target.value })}
                                        size="small"
                                        InputLabelProps={{ shrink: true }}
                                    />
                                    <TextField
                                        label="Notes"
                                        fullWidth
                                        multiline
                                        rows={2}
                                        value={teamFormData.notes}
                                        onChange={(e) => setTeamFormData({ ...teamFormData, notes: e.target.value })}
                                        size="small"
                                    />
                                </Stack>
                            </DialogContent>
                            <DialogActions sx={{ px: 1.25, pb: 0.75, pt: 0.5 }}>
                                <Button 
                                    onClick={() => {
                                        setOpenTeamDialog(false);
                                        setEditingTeam(null);
                                        setTeamFormData({
                                            name: '',
                                            role: '',
                                            email: '',
                                            phone: '',
                                            dateAppointed: '',
                                            dateEnded: '',
                                            notes: ''
                                        });
                                    }}
                                    size="small"
                                >
                                    Cancel
                                </Button>
                                <Button 
                                    onClick={handleSaveTeam} 
                                    variant="contained"
                                    disabled={!teamFormData.name || !teamFormData.role || !teamFormData.dateAppointed}
                                    size="small"
                                >
                                    {editingTeam ? 'Update' : 'Add'}
                                </Button>
                            </DialogActions>
                        </Dialog>

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
                        >
                            {selectedRow && (
                                <MenuItem onClick={() => {
                                    handleEditTeam(selectedRow);
                                    setRowActionMenuAnchor(null);
                                    setSelectedRow(null);
                                }}>
                                    <ListItemIcon>
                                        <EditIcon fontSize="small" />
                                    </ListItemIcon>
                                    <ListItemText>Edit</ListItemText>
                                </MenuItem>
                            )}
                            {selectedRow && (
                                <MenuItem onClick={() => {
                                    handleDeleteTeam(selectedRow.teamMemberId);
                                    setRowActionMenuAnchor(null);
                                    setSelectedRow(null);
                                }}>
                                    <ListItemIcon>
                                        <DeleteIcon fontSize="small" sx={{ color: 'error.main' }} />
                                    </ListItemIcon>
                                    <ListItemText>Delete</ListItemText>
                                </MenuItem>
                            )}
                        </Menu>
                    </Box>
                )}
            </Paper>

            {/* Modals for Milestones and Monitoring */}
            <MilestoneAttachments
                open={openAttachmentsModal}
                onClose={() => setOpenAttachmentsModal(false)}
                milestoneId={milestoneToViewAttachments?.milestoneId}
                currentMilestoneName={milestoneToViewAttachments?.milestoneName}
                onUploadSuccess={fetchProjectDetails}
                projectId={projectId}
            />
            <ProjectMonitoringComponent
                open={openMonitoringModal}
                onClose={handleCloseMonitoringModal}
                projectId={projectId}
                editRecord={editingMonitoringRecord}
                onEditComplete={handleMonitoringEditComplete}
            />
            <ProjectManagerReviewPanel
                open={openReviewPanel}
                onClose={handleCloseReviewPanel}
                projectId={projectId}
                projectName={project?.projectName}
                paymentJustification={paymentJustification}
                handleOpenDocumentUploader={handleOpenDocumentUploader}
            />
            <AddEditMilestoneModal
                isOpen={openMilestoneDialog}
                onClose={handleCloseMilestoneDialog}
                editedMilestone={currentMilestone}
                projectId={projectId}
                onSave={handleMilestoneSubmit}
            />
            <AddEditActivityForm
                open={openActivityDialog}
                onClose={handleCloseActivityDialog}
                onSubmit={handleActivitySubmit}
                initialData={activityFormData}
                milestones={milestones}
                staff={staff}
                isEditing={!!currentActivity}
            />

            <PaymentRequestForm
                open={openPaymentModal}
                onClose={() => setOpenPaymentModal(false)}
                projectId={project?.projectId}
                projectName={project?.projectName}
                onSubmit={handlePaymentRequestSubmit}
                accomplishedActivities={paymentJustification.accomplishedActivities}
                totalJustifiedAmount={paymentJustification.totalBudget}
            />

            <PaymentRequestDocumentUploader
                open={openDocumentUploader}
                onClose={handleCloseDocumentUploader}
                requestId={selectedRequestId}
                projectId={projectId}
            />

            <Snackbar open={snackbar.open} autoHideDuration={6000} onClose={handleCloseSnackbar}>
                <Alert onClose={handleCloseSnackbar} severity={snackbar.severity} sx={{ width: '100%' }}>
                    {snackbar.message}
                </Alert>
            </Snackbar>
        </Box>
    );
}

export default ProjectDetailsPage;