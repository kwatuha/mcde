import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, useNavigate, Link as RouterLink } from 'react-router-dom';
import {
    Box, Typography, CircularProgress, Alert, Button, Paper,
    List, ListItem, ListItemText, IconButton,
    Stack, Chip, Snackbar, LinearProgress,
    Tooltip, Accordion, AccordionSummary, AccordionDetails, useTheme, Grid,
    Divider, Tabs, Tab, Card, CardContent, CardMedia,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
    Dialog, DialogTitle, DialogContent, DialogActions, TextField, MenuItem,
    InputLabel, Select, FormControl, Menu, ListItemIcon, Switch, FormControlLabel,
    Autocomplete, Checkbox, Collapse
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
    ExpandLess as ExpandLessIcon,
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
    People as PeopleIcon,
    CheckCircle as CheckCircleIcon,
    Upload as UploadIcon,
    Download as DownloadIcon,
    Print as PrintIcon,
    FileDownload as FileDownloadIcon,
    PictureAsPdf as PictureAsPdfIcon,
    Group as GroupIcon,
    Public as PublicIcon,
    Cancel as CancelIcon,
    Pending as PendingIcon,
    Work as WorkIcon,
    Feedback as FeedbackIcon,
    FactCheck as FactCheckIcon,
    AccountBalanceWallet as AccountBalanceWalletIcon
} from '@mui/icons-material';
import apiService from '../api';
import { ROUTES } from '../configs/appConfig';
import { useAuth } from '../context/AuthContext.jsx';
import { canViewProjectsWithBackendScope } from '../utils/privilegeUtils.js';
import ProjectBQTab from '../components/ProjectBQTab';
import ProjectCertificatesTab from '../components/ProjectCertificatesTab';
import ProjectMapEditor from '../components/ProjectMapEditor';
import { getProjectStatusBackgroundColor, getProjectStatusTextColor } from '../utils/projectStatusColors';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { axiosInstance } from '../api';
import projectService from '../api/projectService';
import SiteUpdatesDialog from '../components/SiteUpdatesDialog';
import ProjectSitesModal from '../components/ProjectSitesModal';

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

// Helper function to normalize status for filtering (handle "In Progress" vs "Ongoing" variations)
const normalizeStatusForFilter = (status) => {
    if (!status) return '';
    const s = status.toLowerCase().trim();
    // Map variations to standard values
    if (s === 'in progress' || s === 'ongoing' || s === 'on-going') return 'in progress';
    if (s === 'not started' || s === 'notstarted') return 'not started';
    if (s === 'completed' || s === 'complete') return 'completed';
    return s;
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

import { alpha } from '@mui/material/styles';
import { tokens } from "./dashboard/theme"; // Import tokens for color styling
import MilestoneAttachments from '../components/MilestoneAttachments.jsx';
import ProjectMonitoringComponent from '../components/ProjectMonitoringComponent.jsx';
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
    const { user, logout, authLoading, hasPrivilege } = useAuth();
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
    const [sitesSummary, setSitesSummary] = useState({ total: 0 });
    const [openSitesModal, setOpenSitesModal] = useState(false);
    const [openImportSitesDialog, setOpenImportSitesDialog] = useState(false);
    const [importFile, setImportFile] = useState(null);
    const [importingSites, setImportingSites] = useState(false);
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
    // Cascading location for site dialog (same as Add New Project)
    const [siteCounties, setSiteCounties] = useState([]);
    const [siteConstituencies, setSiteConstituencies] = useState([]);
    const [siteWards, setSiteWards] = useState([]);
    const [loadingSiteCounties, setLoadingSiteCounties] = useState(false);
    const [loadingSiteConstituencies, setLoadingSiteConstituencies] = useState(false);
    const [loadingSiteWards, setLoadingSiteWards] = useState(false);
    // Export project sites (Excel/PDF) - same pattern as Kenya Wards
    const [exportAllSites, setExportAllSites] = useState(false);
    const [exportingSitesExcel, setExportingSitesExcel] = useState(false);
    const [exportingSitesPdf, setExportingSitesPdf] = useState(false);
    // KPI section collapsed by default so tabs have clear hierarchy
    const [kpiExpanded, setKpiExpanded] = useState(false);

    // NEW: State for Project Jobs
    const [projectJobs, setProjectJobs] = useState([]);
    const [jobsSummary, setJobsSummary] = useState({
        totalJobs: 0,
        totalMale: 0,
        totalFemale: 0,
        totalDirectJobs: 0,
        totalIndirectJobs: 0,
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
        directJobs: '',
        indirectJobs: '',
    });
    const [jobFormErrors, setJobFormErrors] = useState({});
    const [editingJob, setEditingJob] = useState(null);
    const [deleteJobConfirmOpen, setDeleteJobConfirmOpen] = useState(false);
    const [jobToDelete, setJobToDelete] = useState(null);

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
                totalDirectJobs: summary.totalDirectJobs || 0,
                totalIndirectJobs: summary.totalIndirectJobs || 0,
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
    const [projectInspections, setProjectInspections] = useState([]);
    const [loadingInspections, setLoadingInspections] = useState(false);
    const [inspectionsError, setInspectionsError] = useState(null);
    const [openInspectionDialog, setOpenInspectionDialog] = useState(false);
    const [editingInspection, setEditingInspection] = useState(null);
    const [inspectionFormData, setInspectionFormData] = useState({
        inspectionDate: '',
        findings: '',
        warnings: '',
        recommendations: '',
        teamMemberRefs: [],
    });
    const [uploadingInspectionFiles, setUploadingInspectionFiles] = useState(false);
    const [fundingSources, setFundingSources] = useState([]);
    const [projectFundingEntries, setProjectFundingEntries] = useState([]);
    const [loadingFunding, setLoadingFunding] = useState(false);
    const [fundingError, setFundingError] = useState(null);
    const [newFundingSourceName, setNewFundingSourceName] = useState('');
    const [fundingForm, setFundingForm] = useState({
        sourceId: '',
        amount: '',
        stage: '',
        notes: '',
    });

    const formatAmountInput = useCallback((value) => {
        const raw = String(value || '').replace(/,/g, '').trim();
        if (!raw) return '';
        const [whole, fraction] = raw.split('.');
        const wholeFormatted = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
        return fraction !== undefined ? `${wholeFormatted}.${fraction}` : wholeFormatted;
    }, []);

    // NEW: State for Tabs and Photos
    const [activeTab, setActiveTab] = useState(0);
    const [projectPhotos, setProjectPhotos] = useState([]);
    const [loadingPhotos, setLoadingPhotos] = useState(false);
    const [planningSnapshot, setPlanningSnapshot] = useState({ activities: [], risks: [] });
    const [planningDocumentsCount, setPlanningDocumentsCount] = useState(0);
    const [loadingPlanningSnapshot, setLoadingPlanningSnapshot] = useState(false);
    const [planningSnapshotError, setPlanningSnapshotError] = useState(null);
    const canViewProjectDocuments =
        checkUserPrivilege(user, 'document.read_all') || checkUserPrivilege(user, 'document.create');

    const [scheduleGanttVisible, setScheduleGanttVisible] = useState(false);

    // Load jobs & categories when Jobs tab is active
    useEffect(() => {
        if (activeTab === 3) { // Jobs tab index (0:Overview,1:Financials,2:Sites,3:Jobs,4:Inspection,5:Schedule+Gantt,6:BQ,7:Certificates,8:Map)
            fetchJobCategories();
            fetchProjectJobs();
        }
    }, [activeTab, fetchJobCategories, fetchProjectJobs]);

    useEffect(() => {
        if (activeTab !== 0 || !projectId) return;
        let mounted = true;
        const loadPlanningSnapshot = async () => {
            setLoadingPlanningSnapshot(true);
            setPlanningSnapshotError(null);
            try {
                const [activities, risks, documents] = await Promise.all([
                    projectService.projects.getPlanningCatalogActivityLinks(projectId),
                    projectService.projects.getPlanningCatalogRiskLinks(projectId),
                    canViewProjectDocuments
                        ? projectService.documents.getProjectDocuments(projectId)
                        : Promise.resolve([]),
                ]);
                if (!mounted) return;
                setPlanningSnapshot({
                    activities: Array.isArray(activities) ? activities : [],
                    risks: Array.isArray(risks) ? risks : [],
                });
                const documentRows = Array.isArray(documents)
                    ? documents
                    : Array.isArray(documents?.documents)
                        ? documents.documents
                        : Array.isArray(documents?.rows)
                            ? documents.rows
                            : [];
                setPlanningDocumentsCount(documentRows.length);
            } catch (err) {
                if (!mounted) return;
                setPlanningSnapshot({ activities: [], risks: [] });
                setPlanningDocumentsCount(0);
                setPlanningSnapshotError(err?.response?.data?.message || err?.message || 'Failed to load planning snapshot.');
            } finally {
                if (mounted) setLoadingPlanningSnapshot(false);
            }
        };
        loadPlanningSnapshot();
        return () => {
            mounted = false;
        };
    }, [activeTab, projectId, canViewProjectDocuments]);


    const getTeamMemberRef = useCallback((member) => {
        if (!member || typeof member !== 'object') return '';
        return String(
            member.teamMemberId ||
            `${member.teamName || ''}|${member.name || ''}|${member.email || ''}`
        ).trim();
    }, []);

    const teamMemberLabel = useCallback((member) => {
        const teamName = member?.teamName || 'Team';
        const name = member?.name || 'Member';
        const role = member?.role || '';
        return role ? `${name} (${role}) - ${teamName}` : `${name} - ${teamName}`;
    }, []);

    const teamMemberOptions = useMemo(() => {
        return (projectTeams || []).map((m) => ({
            ref: getTeamMemberRef(m),
            label: teamMemberLabel(m),
            raw: m,
        })).filter((m) => m.ref);
    }, [projectTeams, getTeamMemberRef, teamMemberLabel]);

    const fetchProjectInspections = useCallback(async () => {
        if (!projectId) return;
        setLoadingInspections(true);
        setInspectionsError(null);
        try {
            const rows = await projectService.inspections.getProjectInspections(projectId);
            setProjectInspections(Array.isArray(rows) ? rows : []);
        } catch (err) {
            console.error('Error fetching project inspections:', err);
            setInspectionsError(err?.message || 'Failed to load inspection records.');
        } finally {
            setLoadingInspections(false);
        }
    }, [projectId]);

    useEffect(() => {
        if (activeTab === 4) {
            fetchProjectInspections();
        }
    }, [activeTab, fetchProjectInspections]);

    const handleOpenInspectionDialog = (inspection = null) => {
        if (inspection) {
            setEditingInspection(inspection);
            setInspectionFormData({
                inspectionDate: inspection.inspectionDate ? String(inspection.inspectionDate).slice(0, 10) : '',
                findings: inspection.findings || '',
                warnings: inspection.warnings || '',
                recommendations: inspection.recommendations || '',
                teamMemberRefs: Array.isArray(inspection.teamMemberRefs) ? inspection.teamMemberRefs : [],
            });
        } else {
            setEditingInspection(null);
            setInspectionFormData({
                inspectionDate: new Date().toISOString().slice(0, 10),
                findings: '',
                warnings: '',
                recommendations: '',
                teamMemberRefs: [],
            });
        }
        setOpenInspectionDialog(true);
    };

    const handleSaveInspection = async () => {
        if (!inspectionFormData.inspectionDate) {
            setSnackbar({ open: true, message: 'Inspection date is required.', severity: 'error' });
            return;
        }
        try {
            setLoading(true);
            const payload = {
                inspectionDate: inspectionFormData.inspectionDate,
                findings: inspectionFormData.findings,
                warnings: inspectionFormData.warnings,
                recommendations: inspectionFormData.recommendations,
                teamMemberRefs: inspectionFormData.teamMemberRefs || [],
            };
            if (editingInspection?.inspectionId) {
                await projectService.inspections.updateInspection(projectId, editingInspection.inspectionId, payload);
                setSnackbar({ open: true, message: 'Inspection updated successfully.', severity: 'success' });
            } else {
                await projectService.inspections.createInspection(projectId, payload);
                setSnackbar({ open: true, message: 'Inspection created successfully.', severity: 'success' });
            }
            setOpenInspectionDialog(false);
            setEditingInspection(null);
            fetchProjectInspections();
        } catch (err) {
            setSnackbar({ open: true, message: err?.message || 'Failed to save inspection.', severity: 'error' });
        } finally {
            setLoading(false);
        }
    };

    const handleUploadInspectionFiles = async (inspection, fileCategory, fileList) => {
        if (!inspection?.inspectionId || !fileList || fileList.length === 0) return;
        try {
            setUploadingInspectionFiles(true);
            const formData = new FormData();
            formData.append('fileCategory', fileCategory);
            Array.from(fileList).forEach((f) => formData.append('files', f));
            await projectService.inspections.uploadInspectionFiles(projectId, inspection.inspectionId, formData);
            setSnackbar({ open: true, message: `${fileCategory === 'photo' ? 'Photo' : 'Document'} upload successful.`, severity: 'success' });
            fetchProjectInspections();
        } catch (err) {
            setSnackbar({ open: true, message: err?.message || 'Upload failed.', severity: 'error' });
        } finally {
            setUploadingInspectionFiles(false);
        }
    };

    const isSuperAdmin = useMemo(() => {
        const role = String(user?.roleName || user?.role || '').toLowerCase().trim();
        return role === 'super admin';
    }, [user]);

    const fetchFundingData = useCallback(async () => {
        if (!projectId) return;
        setLoadingFunding(true);
        setFundingError(null);
        try {
            const [sources, entries] = await Promise.all([
                projectService.funding.getFundingSources(),
                projectService.funding.getProjectFundingEntries(projectId),
            ]);
            setFundingSources(Array.isArray(sources) ? sources : []);
            setProjectFundingEntries(Array.isArray(entries) ? entries : []);
        } catch (err) {
            console.error('Error loading funding data:', err);
            setFundingError(err?.message || 'Failed to load funding data.');
        } finally {
            setLoadingFunding(false);
        }
    }, [projectId]);

    useEffect(() => {
        if (activeTab === 1) {
            fetchFundingData();
        }
    }, [activeTab, fetchFundingData]);

    const handleDownloadInspectionReport = (inspection) => {
        try {
            const doc = new jsPDF({ orientation: 'p', unit: 'pt', format: 'a4' });
            const pageWidth = doc.internal.pageSize.getWidth();
            const pageHeight = doc.internal.pageSize.getHeight();
            const margin = 42;
            let y = 44;

            const inspectionDate = String(inspection?.inspectionDate || '').slice(0, 10) || 'N/A';
            const projectTitle = project?.projectName || project?.name || `Project #${projectId}`;

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(15);
            doc.text('Project Inspection Report', pageWidth / 2, y, { align: 'center' });
            y += 20;

            doc.setFontSize(10);
            doc.setFont('helvetica', 'normal');
            doc.text(`Project: ${projectTitle}`, margin, y);
            y += 14;
            doc.text(`Inspection Date: ${inspectionDate}`, margin, y);
            y += 14;
            doc.text(`Generated On: ${new Date().toLocaleString()}`, margin, y);
            y += 18;

            doc.setDrawColor(180, 180, 180);
            doc.line(margin, y, pageWidth - margin, y);
            y += 14;

            const writeSection = (title, value) => {
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(11);
                doc.text(title, margin, y);
                y += 12;
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(10);
                const text = value && String(value).trim() !== '' ? String(value) : 'N/A';
                const wrapped = doc.splitTextToSize(text, pageWidth - margin * 2);
                doc.text(wrapped, margin, y);
                y += wrapped.length * 12 + 8;
            };

            writeSection('Findings', inspection?.findings);
            writeSection('Warnings', inspection?.warnings);
            writeSection('Recommendations', inspection?.recommendations);

            const members = (inspection?.teamMemberRefs || []).map((ref) => {
                const found = (projectTeams || []).find((m) => getTeamMemberRef(m) === ref);
                if (!found) {
                    return { name: String(ref), role: '', teamName: '' };
                }
                return {
                    name: found.name || '',
                    role: found.role || '',
                    teamName: found.teamName || '',
                };
            });

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(11);
            doc.text('Inspection Team Members', margin, y);
            y += 10;

            const body = (members.length > 0 ? members : [{ name: 'N/A', role: '', teamName: '' }]).map((m, idx) => [
                String(idx + 1),
                m.name || 'N/A',
                m.role || 'N/A',
                m.teamName || 'N/A',
                '____________________',
            ]);

            autoTable(doc, {
                startY: y,
                head: [['#', 'Name', 'Role', 'Team', 'Signature']],
                body,
                theme: 'grid',
                styles: { fontSize: 9, cellPadding: 5 },
                headStyles: { fillColor: [41, 128, 185] },
                columnStyles: {
                    0: { cellWidth: 24 },
                    4: { cellWidth: 120 },
                },
                margin: { left: margin, right: margin },
            });
            y = (doc.lastAutoTable?.finalY || y) + 24;

            if (y > pageHeight - 80) {
                doc.addPage();
                y = 52;
            }

            doc.setFont('helvetica', 'normal');
            doc.setFontSize(10);
            doc.text('Inspection Team Lead Signature: ________________________________', margin, y);
            y += 24;
            doc.text('Date: ____________________', margin, y);

            const filename = `inspection-report-project-${projectId}-inspection-${inspection?.inspectionId || 'record'}.pdf`;
            doc.save(filename);
        } catch (err) {
            console.error('Error generating inspection report PDF:', err);
            setSnackbar({ open: true, message: 'Failed to generate inspection report PDF.', severity: 'error' });
        }
    };

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
            if (canViewProjectsWithBackendScope(user)) {
                setIsAccessAllowed(true);
            } else {
                setAccessError("You do not have the necessary privileges to view this project.");
                setIsAccessAllowed(false);
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

            /* SCOPE_DOWN: programs/subprograms/annual_workplans tables removed. Re-enable when restoring for wider market. */
            // const subProgramId = projectData.subProgramId;
            // if (subProgramId) {
            //     setLoadingWorkPlans(true);
            //     try {
            //         const workPlansData = await apiService.strategy.annualWorkPlans.getWorkPlansBySubprogramId(subProgramId);
            //         setProjectWorkPlans(workPlansData);
            //     } catch (err) {
            //         console.error("Error fetching work plans for subprogram:", err);
            //         setProjectWorkPlans([]);
            //     } finally {
            //         setLoadingWorkPlans(false);
            //     }
            // }

            if (projectData.categoryId) {
                const categoryData = await apiService.metadata.projectCategories.getCategoryById(projectData.categoryId);
                setProjectCategory(categoryData);
            } else {
                setProjectCategory(null);
            }

            const milestonesDataRaw = await apiService.milestones.getMilestonesForProject(projectId);
            const milestonesData = Array.isArray(milestonesDataRaw)
                ? milestonesDataRaw.map((m) => snakeToCamelCase(m))
                : [];
            setMilestones(milestonesData);

            // Fetch activities for each milestone (only if there are milestones)
            let milestoneActivitiesResults = [];
            if (milestonesData && milestonesData.length > 0) {
                try {
                    const milestoneActivitiesPromises = milestonesData.map(m =>
                        apiService.strategy.milestoneActivities.getActivitiesByMilestoneId(m.milestoneId).catch(err => {
                            console.warn(`Error fetching activities for milestone ${m.milestoneId}:`, err);
                            return []; // Return empty array on error
                        })
                    );
                    milestoneActivitiesResults = (await Promise.all(milestoneActivitiesPromises))
                        .flat()
                        .map((a) => snakeToCamelCase(a));
                } catch (err) {
                    console.warn('Error fetching milestone activities:', err);
                    milestoneActivitiesResults = [];
                }
            }
            setMilestoneActivities(milestoneActivitiesResults);

            const rawStaffData = await apiService.users.getStaff();
            const camelCaseStaffData = rawStaffData.map(s => snakeToCamelCase(s));
            setStaff(camelCaseStaffData);

            // NEW: Fetch monitoring records
            await fetchMonitoringRecords();
            
            // NEW: Fetch teams (don't fail if this errors)
            try {
                await fetchProjectTeams();
            } catch (err) {
                console.warn('Error fetching teams (non-critical):', err);
            }
            
            // Sites are loaded when the user opens the Sites tab (see useEffect below), not on initial load.

        } catch (err) {
            console.error('ProjectDetailsPage: Error fetching project details:', err);
            const status = err.response?.status;
            if (status === 404) {
                setError('Project not found or you do not have access to it.');
            } else {
                setError(err.response?.data?.message || err.message || 'Failed to load project details.');
            }
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
    const fetchProjectSites = useCallback(async (forceRefresh = false, limitForTab = false) => {
        if (!projectId) return;
        // Don't refetch if we already have data and it's not a forced refresh (avoids duplicate requests)
        if (!forceRefresh && projectSites.length > 0 && !loadingSites) {
            return;
        }
        
        setLoadingSites(true);
        setSitesError(null);
        
        try {
            const result = await apiService.junctions.getProjectSites(projectId);
            // API returns an object: { projectId, summary, sites: [...] }
            let sitesArray = Array.isArray(result?.sites)
                ? result.sites
                : Array.isArray(result)
                    ? result
                    : [];
            
            // If limitForTab is true, only keep the latest 10 sites (sorted by most recent)
            // Always limit to 10 for tab display, even on forceRefresh
            if (limitForTab && sitesArray.length > 10) {
                // Sort by created_at or updated_at (most recent first), fallback to site_id
                sitesArray = sitesArray
                    .sort((a, b) => {
                        const dateA = a.created_at || a.updated_at || a.site_id || 0;
                        const dateB = b.created_at || b.updated_at || b.site_id || 0;
                        // If dates, compare as dates; otherwise compare as numbers
                        if (dateA instanceof Date || typeof dateA === 'string') {
                            return new Date(dateB) - new Date(dateA);
                        }
                        return (dateB || 0) - (dateA || 0);
                    })
                    .slice(0, 10);
            }
            
            setProjectSites(sitesArray);
            // Store summary if available (always use full count from API)
            if (result?.summary) {
                setSitesSummary(result.summary);
            } else {
                // Get full count from original result, not limited array
                const fullSitesArray = Array.isArray(result?.sites)
                    ? result.sites
                    : Array.isArray(result)
                        ? result
                        : [];
                setSitesSummary({ total: fullSitesArray.length });
            }
        } catch (err) {
            console.error('Error fetching project sites:', err);
            setSitesError('Failed to load project sites.');
            setProjectSites([]);
            setSitesSummary({ total: 0 });
        } finally {
            setLoadingSites(false);
        }
    }, [projectId]);

    // Load project sites when Sites tab is active (only when tab or projectId changes, not when fetchProjectSites identity changes)
    useEffect(() => {
        if (activeTab === 2 && projectId) {
            fetchProjectSites(false, true);
        }
    }, [activeTab, projectId, fetchProjectSites]);

    // Site dialog: fetch counties when dialog opens (cascading location, same as Add New Project)
    useEffect(() => {
        if (!openSiteDialog) return;
        let cancelled = false;
        const load = async () => {
            setLoadingSiteCounties(true);
            try {
                const data = await apiService.kenyaWards.getCounties();
                if (!cancelled) setSiteCounties(data || []);
            } catch (e) {
                if (!cancelled) console.error('Error fetching counties for site:', e);
            } finally {
                if (!cancelled) setLoadingSiteCounties(false);
            }
        };
        load();
        return () => { cancelled = true; };
    }, [openSiteDialog]);

    useEffect(() => {
        if (!openSiteDialog || !siteFormData.county) {
            setSiteConstituencies([]);
            return;
        }
        let cancelled = false;
        setLoadingSiteConstituencies(true);
        apiService.kenyaWards.getConstituenciesByCounty(siteFormData.county)
            .then((data) => { if (!cancelled) setSiteConstituencies(data || []); })
            .catch((e) => { if (!cancelled) console.error('Error fetching constituencies for site:', e); })
            .finally(() => { if (!cancelled) setLoadingSiteConstituencies(false); });
        return () => { cancelled = true; };
    }, [openSiteDialog, siteFormData.county]);

    useEffect(() => {
        if (!openSiteDialog || !siteFormData.constituency) {
            setSiteWards([]);
            return;
        }
        let cancelled = false;
        setLoadingSiteWards(true);
        apiService.kenyaWards.getWardsByConstituency(siteFormData.constituency)
            .then((data) => { if (!cancelled) setSiteWards(data || []); })
            .catch((e) => { if (!cancelled) console.error('Error fetching wards for site:', e); })
            .finally(() => { if (!cancelled) setLoadingSiteWards(false); });
        return () => { cancelled = true; };
    }, [openSiteDialog, siteFormData.constituency]);

    // Fetch all project sites for export (when Export All is checked)
    const fetchAllProjectSites = useCallback(async () => {
        if (!projectId) return [];
        try {
            const result = await apiService.junctions.getProjectSites(projectId);
            const sites = Array.isArray(result?.sites) ? result.sites : Array.isArray(result) ? result : [];
            return sites;
        } catch (err) {
            console.error('Error fetching all project sites:', err);
            throw err;
        }
    }, [projectId]);

    // Export project sites to Excel (current tab list or all if exportAllSites)
    const handleExportSitesToExcel = useCallback(async () => {
        setExportingSitesExcel(true);
        try {
            let sitesToExport = projectSites;
            if (exportAllSites) {
                sitesToExport = await fetchAllProjectSites();
            }
            if (!sitesToExport.length) {
                setSnackbar({ open: true, message: 'No sites to export', severity: 'warning' });
                setExportingSitesExcel(false);
                return;
            }
            const headers = ['Site Name', 'County', 'Constituency', 'Ward', 'Status', 'Progress', 'Approved Cost (KES)'];
            const rows = sitesToExport.map((site) => {
                const name = site.site_name || site.siteName || '';
                const status = site.status_norm || site.status_raw || site.status || '';
                const progress = site.progress != null && site.progress !== '' ? `${site.progress}%` : '';
                const cost = site.approved_cost != null || site.approvedCost != null
                    ? (site.approved_cost ?? site.approvedCost)
                    : '';
                return [name, site.county || '', site.constituency || '', site.ward || '', status, progress, cost];
            });
            const data = [headers, ...rows];
            const worksheet = XLSX.utils.aoa_to_sheet(data);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, 'Project Sites');
            const dateStr = new Date().toISOString().split('T')[0];
            const filename = exportAllSites
                ? `project_sites_export_all_${dateStr}.xlsx`
                : `project_sites_export_${dateStr}.xlsx`;
            XLSX.writeFile(workbook, filename);
            setSnackbar({
                open: true,
                message: `Exported ${sitesToExport.length} site${sitesToExport.length !== 1 ? 's' : ''} to Excel successfully!`,
                severity: 'success',
            });
        } catch (err) {
            console.error('Error exporting sites to Excel:', err);
            setSnackbar({ open: true, message: 'Failed to export sites to Excel. Please try again.', severity: 'error' });
        } finally {
            setExportingSitesExcel(false);
        }
    }, [projectId, projectSites, exportAllSites, fetchAllProjectSites]);

    // Export project sites to PDF (current tab list or all if exportAllSites)
    const handleExportSitesToPDF = useCallback(async () => {
        setExportingSitesPdf(true);
        try {
            let sitesToExport = projectSites;
            if (exportAllSites) {
                sitesToExport = await fetchAllProjectSites();
            }
            if (!sitesToExport.length) {
                setSnackbar({ open: true, message: 'No sites to export', severity: 'warning' });
                setExportingSitesPdf(false);
                return;
            }
            const headers = ['Site Name', 'County', 'Constituency', 'Ward', 'Status', 'Progress', 'Approved Cost (KES)'];
            const dataRows = sitesToExport.map((site) => {
                const name = site.site_name || site.siteName || '';
                const status = site.status_norm || site.status_raw || site.status || '';
                const progress = site.progress != null && site.progress !== '' ? `${site.progress}%` : '';
                const cost = site.approved_cost != null || site.approvedCost != null
                    ? String(site.approved_cost ?? site.approvedCost)
                    : '';
                return [name, site.county || '', site.constituency || '', site.ward || '', status, progress, cost];
            });
            const doc = new jsPDF('landscape', 'pt', 'a4');
            autoTable(doc, {
                head: [headers],
                body: dataRows,
                startY: 20,
                styles: { fontSize: 8, cellPadding: 2, overflow: 'linebreak', halign: 'left' },
                headStyles: { fillColor: [41, 128, 185], textColor: 255, fontStyle: 'bold' },
                alternateRowStyles: { fillColor: [245, 245, 245] },
                margin: { top: 20, left: 40, right: 40 },
            });
            const dateStr = new Date().toISOString().split('T')[0];
            const filename = exportAllSites
                ? `project_sites_export_all_${dateStr}.pdf`
                : `project_sites_export_${dateStr}.pdf`;
            doc.save(filename);
            setSnackbar({
                open: true,
                message: `Exported ${sitesToExport.length} site${sitesToExport.length !== 1 ? 's' : ''} to PDF successfully!`,
                severity: 'success',
            });
        } catch (err) {
            console.error('Error exporting sites to PDF:', err);
            setSnackbar({ open: true, message: 'Failed to export sites to PDF. Please try again.', severity: 'error' });
        } finally {
            setExportingSitesPdf(false);
        }
    }, [projectSites, exportAllSites, fetchAllProjectSites]);

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

    const handleDownloadSitesTemplate = () => {
        // Create template data
        const templateData = [
            ['Site Name', 'County', 'Constituency', 'Ward', 'Status', 'Progress (%)', 'Approved Cost (KES)', 'Remarks']
        ];
        
        // Create worksheet
        const worksheet = XLSX.utils.aoa_to_sheet(templateData);
        
        // Set column widths
        worksheet['!cols'] = [
            { wch: 30 }, // Site Name
            { wch: 20 }, // County
            { wch: 25 }, // Constituency
            { wch: 20 }, // Ward
            { wch: 15 }, // Status
            { wch: 15 }, // Progress
            { wch: 20 }, // Approved Cost
            { wch: 40 }  // Remarks
        ];
        
        // Freeze header row
        worksheet['!freeze'] = { xSplit: 0, ySplit: 1 };
        
        // Create workbook
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Sites Template');
        
        // Generate Excel file
        const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
        const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        
        // Download file
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', `project-sites-template-${projectId}.xlsx`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        
        setSnackbar({ open: true, message: 'Sites template downloaded successfully!', severity: 'success' });
    };

    const handleImportSites = async () => {
        if (!importFile) {
            setSnackbar({ open: true, message: 'Please select a file to import', severity: 'warning' });
            return;
        }

        setImportingSites(true);
        try {
            const fileExtension = importFile.name.split('.').pop().toLowerCase();
            
            if (fileExtension !== 'xlsx' && fileExtension !== 'xls') {
                setSnackbar({ open: true, message: 'Please upload an Excel file (.xlsx or .xls)', severity: 'error' });
                setImportingSites(false);
                return;
            }

            // Parse Excel file
            const arrayBuffer = await importFile.arrayBuffer();
            const workbook = XLSX.read(arrayBuffer, { 
                type: 'array',
                cellDates: true,
                cellNF: false,
                cellText: false
            });
            
            // Get the first worksheet
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];
            
            // Convert to JSON (skip header row)
            const jsonData = XLSX.utils.sheet_to_json(worksheet, { 
                header: 1,
                defval: '',
                raw: false,
                blankrows: false
            });
            
            if (jsonData.length < 2) {
                setSnackbar({ open: true, message: 'Template is empty. Please add site data.', severity: 'warning' });
                setImportingSites(false);
                return;
            }

            // Process rows (skip header)
            const sitesToImport = [];
            for (let i = 1; i < jsonData.length; i++) {
                const row = jsonData[i];
                if (!row || row.length === 0 || !row[0]) continue; // Skip empty rows
                
                // Map Excel columns to API expected format (camelCase)
                const site = {
                    siteName: (row[0] || '').toString().trim(),
                    county: row[1] ? (row[1]).toString().trim() : null,
                    constituency: row[2] ? (row[2]).toString().trim() : null,
                    ward: row[3] ? (row[3]).toString().trim() : null,
                    status: row[4] ? (row[4]).toString().trim() : null,
                    progress: row[5] ? (parseFloat(row[5]) || null) : null,
                    approvedCost: row[6] ? (parseFloat(row[6]) || null) : null,
                };
                
                if (site.siteName) {
                    sitesToImport.push(site);
                }
            }

            if (sitesToImport.length === 0) {
                setSnackbar({ open: true, message: 'No valid sites found in the file', severity: 'warning' });
                setImportingSites(false);
                return;
            }

            // Import sites one by one
            let successCount = 0;
            let errorCount = 0;
            const errors = [];
            
            for (const site of sitesToImport) {
                try {
                    await apiService.junctions.createProjectSite(projectId, site);
                    successCount++;
                } catch (err) {
                    console.error('Error importing site:', err);
                    errorCount++;
                    const errorMsg = err.response?.data?.message || err.message || 'Unknown error';
                    errors.push(`${site.siteName}: ${errorMsg}`);
                }
            }

            let message = `Imported ${successCount} site(s) successfully`;
            if (errorCount > 0) {
                message += `. ${errorCount} failed.`;
                if (errors.length > 0) {
                    message += ` Errors: ${errors.slice(0, 3).join('; ')}${errors.length > 3 ? '...' : ''}`;
                }
            }
            
            setSnackbar({ 
                open: true, 
                message: message, 
                severity: errorCount > 0 ? 'warning' : 'success' 
            });
            
            setOpenImportSitesDialog(false);
            setImportFile(null);
            await fetchProjectSites(true, true); // Force refresh after import (still limit to 10 for tab)
        } catch (error) {
            console.error('Error importing sites:', error);
            setSnackbar({ open: true, message: 'Failed to import sites. Please check the file format.', severity: 'error' });
        } finally {
            setImportingSites(false);
        }
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


    /* SCOPE_DOWN: payment_requests tables removed. Re-enable when restoring for wider market. */
    // const handleOpenPaymentRequest = () => { setOpenPaymentModal(true); };
    // const handlePaymentRequestSubmit = async (projectId, formData) => {
    //     try {
    //         const newRequest = await apiService.paymentRequests.createRequest(projectId, formData);
    //         setSnackbar({ open: true, message: 'Payment request submitted successfully!', severity: 'success' });
    //         setOpenPaymentModal(false);
    //         setSelectedRequestId(newRequest.requestId);
    //         setOpenDocumentUploader(true);
    //         fetchProjectDetails();
    //     } catch (err) {
    //         setSnackbar({ open: true, message: err.message || 'Failed to submit payment request.', severity: 'error' });
    //     }
    // };

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
    const canModifyOrCreateProjects =
        checkUserPrivilege(user, 'project.update') || checkUserPrivilege(user, 'project.create');
    
    // UPDATED: New logic for canReviewSubmissions
    /* SCOPE_DOWN: contractorId removed with contractor_users table. Re-enable second part when restoring. */
    const canReviewSubmissions = checkUserPrivilege(user, 'project_manager.review');

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
    const paidAmount = parseFloat(project?.paidOut) || 0;
    const remainingBudget = totalBudget - paidAmount;
    // Disbursement rate: fraction of budget vs disbursed
    const disbursementRate = totalBudget > 0 ? (paidAmount / totalBudget) * 100 : 0;
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
            {/* Title – inline with page, no separate panel */}
            <Box sx={{ mb: 1.5 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 0.75 }}>
                    <Stack direction="row" alignItems="center" spacing={0.75} sx={{ flexGrow: 1, minWidth: 0 }}>
                        <Typography
                            variant="h1"
                            component="h1"
                            sx={{
                                fontWeight: 700,
                                fontSize: { xs: '1.1rem', sm: '1.25rem', md: '1.4rem' },
                                color: theme.palette.text.primary,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                flexShrink: 1,
                                lineHeight: 1.25,
                            }}
                        >
                            {project?.projectName || 'Project Name Missing'}
                        </Typography>
                        <Chip
                            label={project?.status || 'N/A'}
                            className="status-chip"
                            size="small"
                            sx={{
                                backgroundColor: getProjectStatusBackgroundColor(project?.status),
                                color: getProjectStatusTextColor(project?.status),
                                fontWeight: 600,
                                fontSize: '0.75rem',
                                height: 24,
                                flexShrink: 0,
                                px: 1,
                                '& .MuiChip-label': { px: 0.5 }
                            }}
                        />
                        {getPublicApprovalStatus(project) && (
                            <Chip
                                label={getPublicApprovalStatus(project).label}
                                icon={getPublicApprovalStatus(project).icon}
                                color={getPublicApprovalStatus(project).color}
                                size="small"
                                sx={{
                                    fontWeight: 600,
                                    fontSize: '0.7rem',
                                    height: 22,
                                    flexShrink: 0,
                                    px: 0.75,
                                    '& .MuiChip-icon': { fontSize: 12 }
                                }}
                            />
                        )}
                    </Stack>
                    <Stack direction="row" spacing={0.5} sx={{ flexShrink: 0 }}>
                        <Tooltip title="View Project Monitoring">
                            <IconButton size="small" color="info" onClick={handleOpenMonitoringModal} sx={{ p: 0.5 }}>
                                <VisibilityIcon sx={{ fontSize: 18 }} />
                            </IconButton>
                        </Tooltip>
                        <Tooltip title="Manage Project Photos">
                            <IconButton size="small" color="secondary" onClick={handleManagePhotos} sx={{ p: 0.5 }}>
                                <PhotoCameraIcon sx={{ fontSize: 18 }} />
                            </IconButton>
                        </Tooltip>
                    </Stack>
                </Box>
                <Stack direction="row" alignItems="center" spacing={1} sx={{ mt: 0.75 }}>
                    <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600, flexShrink: 0, fontSize: '0.8rem', minWidth: '130px' }}>
                        Overall Progress: <strong style={{ color: theme.palette.success.main, fontSize: '0.9rem' }}>{overallProgress.toFixed(2)}%</strong>
                    </Typography>
                    <LinearProgress
                        variant="determinate"
                        value={Math.min(100, Math.max(0, overallProgress))}
                        sx={{
                            flexGrow: 1,
                            height: 6,
                            borderRadius: 1,
                            bgcolor: theme.palette.mode === 'dark' ? colors.grey[700] : colors.grey[200],
                            '& .MuiLinearProgress-bar': { borderRadius: 1, backgroundColor: theme.palette.success.main },
                        }}
                    />
                </Stack>
            </Box>

            {/* Key metrics – collapsible, collapsed by default for clear tab hierarchy */}
            <Box
                sx={{
                    mb: kpiExpanded ? 1.5 : 0.5,
                    border: `1px solid ${theme.palette.divider}`,
                    borderRadius: 2,
                    overflow: 'hidden',
                }}
            >
                <Box
                    onClick={() => setKpiExpanded(!kpiExpanded)}
                    sx={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        px: 1,
                        py: 0.5,
                        cursor: 'pointer',
                        backgroundColor: theme.palette.mode === 'dark' ? undefined : theme.palette.grey[50],
                        '&:hover': { backgroundColor: theme.palette.action.hover },
                    }}
                >
                    <Typography variant="caption" sx={{ fontWeight: 600, fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: 0.5, color: 'text.secondary' }}>
                        Key metrics
                    </Typography>
                    {kpiExpanded ? <ExpandLessIcon sx={{ fontSize: 20, color: 'text.secondary' }} /> : <ExpandMoreIcon sx={{ fontSize: 20, color: 'text.secondary' }} />}
                </Box>
                <Collapse in={kpiExpanded}>
                    <Box sx={{ px: 1, pb: 1, pt: 0.5 }}>
                        <Grid container spacing={1.5}>
                            {[
                                { key: 'budget', label: 'Total Budget', value: formatCurrency(totalBudget), sub: null, Icon: MoneyIcon },
                                { key: 'sites', label: 'Sites', value: sitesSummary.total || 0, sub: 'Project sites', Icon: LocationOnIcon },
                                { key: 'disbursed', label: 'Disbursed', value: formatCurrency(paidAmount), sub: `${disbursementRate.toFixed(1)}% of budget`, Icon: PaidIcon },
                                { key: 'rate', label: 'Disbursement Rate', value: `${disbursementRate.toFixed(1)}%`, sub: 'Disbursed vs Budget', Icon: ScheduleIcon },
                                { key: 'jobs', label: 'Jobs Created', value: jobsSummary.totalJobs, sub: 'All categories', Icon: WorkIcon },
                            ].map(({ key, label, value, sub, Icon }) => (
                                <Grid item xs={6} sm={4} md key={key}>
                                    <Card variant="outlined" sx={{
                                        height: '100%',
                                        borderRadius: 2,
                                        borderColor: theme.palette.divider,
                                        bgcolor: theme.palette.mode === 'dark' ? theme.palette.background.default : theme.palette.background.paper,
                                        boxShadow: 'none',
                                    }}>
                                        <CardContent sx={{ py: 1.25, px: 1.5, '&:last-child': { pb: 1.25 } }}>
                                            <Box display="flex" alignItems="center" justifyContent="space-between" gap={1}>
                                                <Box minWidth={0}>
                                                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                                                        {label}
                                                    </Typography>
                                                    <Typography variant="body2" sx={{ fontWeight: 700, mt: 0.25, fontSize: '0.875rem', color: 'text.primary' }}>
                                                        {value}
                                                    </Typography>
                                                    {sub && (
                                                        <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem', display: 'block', mt: 0.15 }}>
                                                            {sub}
                                                        </Typography>
                                                    )}
                                                </Box>
                                                <Icon sx={{ fontSize: 20, color: 'text.secondary', opacity: 0.7, flexShrink: 0 }} />
                                            </Box>
                                        </CardContent>
                                    </Card>
                                </Grid>
                            ))}
                        </Grid>
                    </Box>
                </Collapse>
            </Box>

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

            {/* Tabbed Interface – integrated with page, clearer & more visible tab bar */}
            <Box
                sx={{
                    position: 'sticky',
                    top: 64, // below AppBar
                    zIndex: 5,
                    mb: 0,
                    backgroundColor: theme.palette.mode === 'dark' ? colors.primary[500] : theme.palette.background.paper,
                    borderBottom: `1px solid ${theme.palette.divider}`,
                }}
            >
                <Tabs
                    value={activeTab}
                    onChange={(e, newValue) => setActiveTab(newValue)}
                    variant="scrollable"
                    scrollButtons="auto"
                    sx={{
                        minHeight: 46,
                        px: 0.5,
                        py: 0.5,
                        '& .MuiTabs-flexContainer': { gap: 0.75, alignItems: 'center', px: 0.5 },
                        '& .MuiTabs-scrollButtons': {
                            '&.Mui-disabled': { opacity: 0.25 },
                        },
                        '& .MuiTabs-indicator': {
                            height: 0, // we use pill highlight instead of indicator
                        },
                        '& .MuiTab-root': {
                            textTransform: 'none',
                            fontSize: '0.85rem',
                            fontWeight: 600,
                            minHeight: 36,
                            height: 36,
                            py: 0,
                            px: 1.5,
                            borderRadius: 999,
                            color: theme.palette.text.secondary,
                            backgroundColor: 'transparent',
                            border: `1px solid transparent`,
                            transition: 'all 0.2s ease',
                            '& .MuiTab-iconWrapper': { fontSize: '1.05rem', mr: 0.75, opacity: 0.9 },
                            '&:hover': {
                                color: theme.palette.text.primary,
                                backgroundColor: theme.palette.mode === 'dark'
                                    ? 'rgba(255,255,255,0.06)'
                                    : 'rgba(2, 132, 199, 0.08)',
                                borderColor: theme.palette.mode === 'dark'
                                    ? 'rgba(255,255,255,0.10)'
                                    : 'rgba(2, 132, 199, 0.18)',
                            },
                            '&.Mui-selected': {
                                color: theme.palette.mode === 'dark' ? colors.grey[100] : theme.palette.primary.main,
                                backgroundColor: theme.palette.mode === 'dark'
                                    ? 'rgba(2, 132, 199, 0.25)'
                                    : 'rgba(2, 132, 199, 0.12)',
                                borderColor: theme.palette.mode === 'dark'
                                    ? 'rgba(56, 189, 248, 0.35)'
                                    : 'rgba(2, 132, 199, 0.25)',
                                boxShadow: theme.palette.mode === 'dark'
                                    ? '0 6px 16px rgba(0,0,0,0.25)'
                                    : '0 4px 12px rgba(2, 132, 199, 0.18)',
                                '& .MuiTab-iconWrapper': { opacity: 1 },
                            },
                        },
                    }}
                >
                    {/* Tab indices: 0=Overview, 1=Financials(+Funds), 2=Sites, 3=Jobs, 4=Inspection, 5=Schedule (milestones + Gantt), 6=BQ, 7=Certificates, 8=Map */}
                    <Tab label="Overview" icon={<InfoIcon />} iconPosition="start" />
                    <Tab label="Financials" icon={<MoneyIcon />} iconPosition="start" />
                    <Tab label="Sites" icon={<LocationOnIcon />} iconPosition="start" />
                    <Tab label="Jobs" icon={<WorkIcon />} iconPosition="start" />
                    <Tab label="Inspection" icon={<FactCheckIcon />} iconPosition="start" />
                    <Tab label="Schedule" icon={<ScheduleIcon />} iconPosition="start" />
                    <Tab label="BQ" icon={<AssessmentIcon />} iconPosition="start" />
                    <Tab label="Certificates" icon={<AssessmentIcon />} iconPosition="start" />
                    <Tab label="Map" icon={<LocationOnIcon />} iconPosition="start" />
                </Tabs>
            </Box>

            <Box sx={{ pt: 1.5 }}>
                {/* Tab Panels */}
                {activeTab === 0 && (
                    <Box>
                        {/* Project Overview – neutral card */}
            <Paper elevation={0} sx={{ 
                p: 1.25, 
                mb: 0.75, 
                borderRadius: 2,
                background: theme.palette.mode === 'dark' ? colors.primary[500] : theme.palette.background.paper,
                border: `1px solid ${theme.palette.divider}`,
                boxShadow: 'none',
            }}>
                <Typography variant="subtitle1" sx={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    mb: 1,
                    color: theme.palette.primary.main,
                    fontWeight: 600,
                    borderBottom: `1px solid ${theme.palette.divider}`,
                    pb: 0.5,
                    fontSize: '0.95rem'
                }}>
                    <InfoIcon sx={{ mr: 0.5, fontSize: '1rem', opacity: 0.9 }} />
                    Project Overview
                </Typography>
                <Grid container spacing={1}>
                    {/* First Column: Key Information */}
                    <Grid item xs={12}>
                        <Box sx={{
                            p: 1.25,
                            borderRadius: 2,
                            backgroundColor: theme.palette.mode === 'dark' ? colors.primary[600] : theme.palette.grey[50],
                            border: `1px solid ${theme.palette.divider}`,
                            height: '100%',
                        }}>
                            <Typography variant="subtitle2" sx={{ 
                                fontWeight: 600, 
                                mb: 0.75,
                                color: theme.palette.text.secondary,
                                textAlign: 'center',
                                borderBottom: `1px solid ${theme.palette.divider}`,
                                pb: 0.5,
                                fontSize: '0.8rem'
                            }}>
                                Key Information
                            </Typography>
                            <Box
                                sx={{
                                    display: 'grid',
                                    gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
                                    columnGap: 2,
                                    rowGap: 0.4,
                                    alignItems: 'start',
                                }}
                            >
                                <Typography variant="body1" sx={{ 
                                    color: theme.palette.mode === 'dark' ? colors.grey[100] : colors.grey[900],
                                    fontSize: '0.9rem'
                                }}>
                                    <strong style={{ color: theme.palette.primary.main }}>Project Category:</strong> <span style={{ color: theme.palette.mode === 'dark' ? colors.grey[200] : '#333333', fontWeight: 600 }}>{projectCategory?.categoryName || 'N/A'}</span>
                                </Typography>
                                <Typography variant="body1" sx={{ 
                                    color: theme.palette.mode === 'dark' ? colors.grey[100] : colors.grey[900],
                                    fontSize: '0.9rem'
                                }}>
                                    <strong style={{ color: theme.palette.primary.main }}>Ministry:</strong> <span style={{ color: theme.palette.mode === 'dark' ? colors.grey[200] : '#333333', fontWeight: 600 }}>{project?.departmentAlias || project?.departmentName || 'N/A'}</span>
                                </Typography>
                                <Typography variant="body1" sx={{ 
                                    color: theme.palette.mode === 'dark' ? colors.grey[100] : colors.grey[900],
                                    fontSize: '0.9rem'
                                }}>
                                    <strong style={{ color: theme.palette.primary.main }}>County:</strong> <span style={{ color: theme.palette.mode === 'dark' ? colors.grey[200] : '#333333', fontWeight: 600 }}>{project?.countyNames || 'N/A'}</span>
                                </Typography>
                                <Typography variant="body1" sx={{ 
                                    color: theme.palette.mode === 'dark' ? colors.grey[100] : colors.grey[900],
                                    fontSize: '0.9rem'
                                }}>
                                    <strong style={{ color: theme.palette.primary.main }}>Constituency:</strong> <span style={{ color: theme.palette.mode === 'dark' ? colors.grey[200] : '#333333', fontWeight: 600 }}>{project?.subcountyNames || 'N/A'}</span>
                                </Typography>
                                <Typography variant="body1" sx={{ 
                                    color: theme.palette.mode === 'dark' ? colors.grey[100] : colors.grey[900],
                                    fontSize: '0.9rem'
                                }}>
                                    <strong style={{ color: theme.palette.primary.main }}>Ward:</strong> <span style={{ color: theme.palette.mode === 'dark' ? colors.grey[200] : '#333333', fontWeight: 600 }}>{project?.wardNames || 'N/A'}</span>
                                </Typography>
                                <Typography variant="body1" sx={{ 
                                    color: theme.palette.mode === 'dark' ? colors.grey[100] : colors.grey[900],
                                    fontSize: '0.9rem'
                                }}>
                                    <strong style={{ color: theme.palette.primary.main }}>State Department:</strong> <span style={{ color: theme.palette.mode === 'dark' ? colors.grey[200] : '#333333', fontWeight: 600 }}>{project?.directorate || 'N/A'}</span>
                                </Typography>
                                <Typography variant="body1" sx={{ 
                                    color: theme.palette.mode === 'dark' ? colors.grey[100] : colors.grey[900],
                                    fontSize: '0.9rem'
                                }}>
                                    <strong style={{ color: theme.palette.primary.main }}>Sector:</strong> <span style={{ color: theme.palette.mode === 'dark' ? colors.grey[200] : '#333333', fontWeight: 600 }}>{project?.sector || 'N/A'}</span>
                                </Typography>
                                <Typography variant="body1" sx={{ 
                                    color: theme.palette.mode === 'dark' ? colors.grey[100] : colors.grey[900],
                                    fontSize: '0.9rem'
                                }}>
                                    <strong style={{ color: theme.palette.primary.main }}>Implementing Agency:</strong> <span style={{ color: theme.palette.mode === 'dark' ? colors.grey[200] : '#333333', fontWeight: 600 }}>{project?.implementingAgency || project?.directorate || 'N/A'}</span>
                                </Typography>
                                <Typography variant="body1" sx={{ 
                                    color: theme.palette.mode === 'dark' ? colors.grey[100] : colors.grey[900],
                                    fontSize: '0.9rem'
                                }}>
                                    <strong style={{ color: theme.palette.primary.main }}>Financial Year:</strong> <span style={{ color: theme.palette.mode === 'dark' ? colors.grey[200] : '#333333', fontWeight: 600 }}>{project?.financialYear || project?.financialYearName || 'N/A'}</span>
                                </Typography>
                                <Typography variant="body1" sx={{ 
                                    color: theme.palette.mode === 'dark' ? colors.grey[100] : colors.grey[900],
                                    fontSize: '0.9rem'
                                }}>
                                    <strong style={{ color: theme.palette.primary.main }}>Last Updated:</strong> <span style={{ color: theme.palette.mode === 'dark' ? colors.grey[200] : '#333333', fontWeight: 600 }}>{formatDate(project?.updatedAt) || 'N/A'}</span>
                                </Typography>
                                <Divider sx={{ my: 0.3, gridColumn: { md: '1 / -1' } }} />
                                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gridColumn: { md: '1 / -1' } }}>
                                    <Typography variant="body1" sx={{ 
                                        color: theme.palette.mode === 'dark' ? colors.grey[100] : colors.grey[900],
                                        fontSize: '0.9rem'
                                    }}>
                                        <strong style={{ color: theme.palette.primary.main }}>Public Approval:</strong>
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
                                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gridColumn: { md: '1 / -1' } }}>
                                    <Typography variant="body1" sx={{ 
                                        color: theme.palette.mode === 'dark' ? colors.grey[100] : colors.grey[900],
                                        fontSize: '0.9rem'
                                    }}>
                                        <strong style={{ color: theme.palette.primary.main }}>Feedback Enabled:</strong>
                                    </Typography>
                                    <Chip
                                        label={project?.feedbackEnabled === true || project?.feedbackEnabled === 1 ? 'Yes' : project?.feedbackEnabled === false || project?.feedbackEnabled === 0 ? 'No' : 'N/A'}
                                        size="small"
                                        variant="outlined"
                                        color={project?.feedbackEnabled ? 'success' : 'default'}
                                        sx={{ fontSize: '0.7rem', height: '22px' }}
                                    />
                                </Box>
                            </Box>
                        </Box>
                    </Grid>
                    {/* Full-width row for Project Description */}
                    <Grid item xs={12}>
                        <Box sx={{
                            p: 1.25,
                            borderRadius: 2,
                            backgroundColor: theme.palette.mode === 'dark' ? colors.primary[600] : theme.palette.grey[50],
                            border: `1px solid ${theme.palette.divider}`,
                            mt: 0.5,
                        }}>
                            <Typography variant="subtitle2" sx={{ 
                                fontWeight: 600, 
                                mb: 0.75,
                                color: theme.palette.text.secondary,
                                textAlign: 'center',
                                borderBottom: `1px solid ${theme.palette.divider}`,
                                pb: 0.5,
                                fontSize: '0.8rem'
                            }}>
                                Project Description
                            </Typography>
                            <Stack spacing={0.75}>
                                <Box>
                                    <Typography variant="body2" sx={{ mb: 0.25, fontWeight: 600, color: theme.palette.primary.main }}>
                                        Description:
                                    </Typography>
                                    <Typography variant="body2" sx={{ 
                                        color: 'text.primary',
                                        pl: 1,
                                        borderLeft: `3px solid ${theme.palette.primary.main}`,
                                        py: 0.25,
                                        fontSize: '0.875rem'
                                    }}>
                                        {project?.projectDescription || 'N/A'}
                                    </Typography>
                                </Box>
                                <Box>
                                    <Typography variant="body2" sx={{ mb: 0.25, fontWeight: 600, color: theme.palette.primary.main }}>
                                        Objective:
                                    </Typography>
                                    <Typography variant="body2" sx={{ 
                                        color: 'text.primary',
                                        pl: 1,
                                        borderLeft: `3px solid ${theme.palette.primary.main}`,
                                        py: 0.25,
                                        fontSize: '0.875rem'
                                    }}>
                                        {project?.objective || 'N/A'}
                                    </Typography>
                                </Box>
                                <Box>
                                    <Typography variant="body2" sx={{ mb: 0.25, fontWeight: 600, color: theme.palette.primary.main }}>
                                        Expected Outcome:
                                    </Typography>
                                    <Typography variant="body2" sx={{ 
                                        color: 'text.primary',
                                        pl: 1,
                                        borderLeft: `3px solid ${theme.palette.primary.main}`,
                                        py: 0.25,
                                        fontSize: '0.875rem'
                                    }}>
                                        {project?.expectedOutcome || 'N/A'}
                                    </Typography>
                                </Box>
                            </Stack>
                        </Box>
                    </Grid>

                    <Grid item xs={12}>
                        <Box sx={{
                            p: 1.25,
                            borderRadius: 2,
                            backgroundColor: theme.palette.mode === 'dark' ? colors.primary[600] : theme.palette.grey[50],
                            border: `1px solid ${theme.palette.divider}`,
                            mt: 0.5,
                        }}>
                            <Box sx={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                borderBottom: `1px solid ${theme.palette.divider}`,
                                pb: 0.5,
                                mb: 0.75,
                            }}>
                                <Typography variant="subtitle2" sx={{
                                    fontWeight: 600,
                                    color: theme.palette.text.secondary,
                                    textAlign: 'center',
                                    fontSize: '0.8rem',
                                }}>
                                    Planning & Documents Snapshot
                                </Typography>
                                <Stack direction="row" spacing={1}>
                                    <Button size="small" component={RouterLink} to={`${ROUTES.PROJECT_PLANNING_ACTIVITY_LINKS}?projectId=${encodeURIComponent(projectId)}`}>View Activities</Button>
                                    <Button size="small" component={RouterLink} to={`${ROUTES.PROJECT_PLANNING_RISK_LINKS}?projectId=${encodeURIComponent(projectId)}`}>View Risks</Button>
                                    {canViewProjectDocuments && (
                                        <Button size="small" component={RouterLink} to={`${ROUTES.PROJECT_DOCUMENTS_BY_PROJECT}?projectId=${encodeURIComponent(projectId)}`}>View Documents</Button>
                                    )}
                                </Stack>
                            </Box>

                            {loadingPlanningSnapshot ? (
                                <Box sx={{ py: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <CircularProgress size={16} />
                                    <Typography variant="body2" color="text.secondary">Loading planning snapshot...</Typography>
                                </Box>
                            ) : planningSnapshotError ? (
                                <Alert severity="warning">{planningSnapshotError}</Alert>
                            ) : (
                                <Grid container spacing={1.5}>
                                    <Grid item xs={12} md={4}>
                                        <Paper variant="outlined" sx={{ p: 1.25, borderRadius: 1.5, height: '100%' }}>
                                            <Typography variant="body2" sx={{ fontWeight: 700, color: theme.palette.primary.main }}>
                                                Activities ({planningSnapshot.activities.length})
                                            </Typography>
                                            <Stack spacing={0.4} sx={{ mt: 0.6 }}>
                                                {planningSnapshot.activities.slice(0, 3).map((item) => (
                                                    <Typography key={item.linkId || item.planningActivityId || item.activityId} variant="body2">
                                                        {item.activityName || item.name || 'Unnamed activity'}
                                                    </Typography>
                                                ))}
                                                {planningSnapshot.activities.length === 0 && (
                                                    <Typography variant="body2" color="text.secondary">No linked activities yet.</Typography>
                                                )}
                                                {planningSnapshot.activities.length > 3 && (
                                                    <Typography variant="caption" color="text.secondary">
                                                        +{planningSnapshot.activities.length - 3} more
                                                    </Typography>
                                                )}
                                            </Stack>
                                        </Paper>
                                    </Grid>
                                    <Grid item xs={12} md={4}>
                                        <Paper variant="outlined" sx={{ p: 1.25, borderRadius: 1.5, height: '100%' }}>
                                            <Typography variant="body2" sx={{ fontWeight: 700, color: theme.palette.primary.main }}>
                                                Risks ({planningSnapshot.risks.length})
                                            </Typography>
                                            <Stack spacing={0.4} sx={{ mt: 0.6 }}>
                                                {planningSnapshot.risks.slice(0, 3).map((item) => (
                                                    <Typography key={item.linkId || item.planningRiskId || item.riskId} variant="body2">
                                                        {item.riskName || item.name || 'Unnamed risk'}
                                                    </Typography>
                                                ))}
                                                {planningSnapshot.risks.length === 0 && (
                                                    <Typography variant="body2" color="text.secondary">No linked risks yet.</Typography>
                                                )}
                                                {planningSnapshot.risks.length > 3 && (
                                                    <Typography variant="caption" color="text.secondary">
                                                        +{planningSnapshot.risks.length - 3} more
                                                    </Typography>
                                                )}
                                            </Stack>
                                        </Paper>
                                    </Grid>
                                    <Grid item xs={12} md={4}>
                                        <Paper variant="outlined" sx={{ p: 1.25, borderRadius: 1.5, height: '100%' }}>
                                            <Typography variant="body2" sx={{ fontWeight: 700, color: theme.palette.primary.main }}>
                                                Documents ({canViewProjectDocuments ? planningDocumentsCount : '—'})
                                            </Typography>
                                            <Stack spacing={0.4} sx={{ mt: 0.6 }}>
                                                {canViewProjectDocuments ? (
                                                    <>
                                                        <Typography variant="body2" color="text.secondary">
                                                            Documents linked to this project.
                                                        </Typography>
                                                        {planningDocumentsCount === 0 ? (
                                                            <Typography variant="body2" color="text.secondary">No documents uploaded yet.</Typography>
                                                        ) : (
                                                            <Typography variant="body2">
                                                                {planningDocumentsCount} document{planningDocumentsCount === 1 ? '' : 's'} available.
                                                            </Typography>
                                                        )}
                                                    </>
                                                ) : (
                                                    <Typography variant="body2" color="text.secondary">
                                                        Requires document.read_all or document.create to view document totals.
                                                    </Typography>
                                                )}
                                            </Stack>
                                        </Paper>
                                    </Grid>
                                </Grid>
                            )}
                        </Box>
                    </Grid>

                </Grid>
            </Paper>
                    </Box>
                )}

                {activeTab === 1 && (
                    <Box>
                        {/* Financials Tab */}
                        <Paper elevation={2} sx={{ p: 2, borderRadius: 2, mb: 2 }}>
                            <Typography variant="h6" sx={{ mb: 1.5, fontWeight: 600, color: theme.palette.mode === 'dark' ? colors.blueAccent[400] : colors.blueAccent[600] }}>
                                Financial Details
                            </Typography>
                            <Grid container spacing={1.5}>
                                <Grid item xs={12} md={4}>
                                    <Paper variant="outlined" sx={{ p: 1.25, borderRadius: 2, height: '100%' }}>
                                        <Stack spacing={0.6}>
                                            <Typography variant="body2"><strong>Start Date:</strong> {formatDate(project?.startDate)}</Typography>
                                            <Typography variant="body2"><strong>End Date:</strong> {formatDate(project?.endDate)}</Typography>
                                            <Typography variant="body2"><strong>Budget Source:</strong> {project?.budgetSource || 'N/A'}</Typography>
                                        </Stack>
                                    </Paper>
                                </Grid>
                                <Grid item xs={12} md={8}>
                                    <Paper variant="outlined" sx={{ p: 1.25, borderRadius: 2, height: '100%' }}>
                                        <Grid container spacing={1}>
                                            <Grid item xs={12} sm={4}>
                                                <Typography variant="caption" color="text.secondary">Total Budget</Typography>
                                                <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>{formatCurrency(totalBudget)}</Typography>
                                            </Grid>
                                            <Grid item xs={12} sm={4}>
                                                <Typography variant="caption" color="text.secondary">Disbursed</Typography>
                                                <Typography variant="subtitle2" sx={{ fontWeight: 700, color: colors.greenAccent[500] }}>
                                                    {formatCurrency(paidAmount)}
                                                </Typography>
                                            </Grid>
                                            <Grid item xs={12} sm={4}>
                                                <Typography variant="caption" color="text.secondary">Remaining</Typography>
                                                <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>{formatCurrency(remainingBudget)}</Typography>
                                            </Grid>
                                        </Grid>
                                        <Divider sx={{ my: 1 }} />
                                        <Box display="flex" justifyContent="space-between" sx={{ mb: 0.5 }}>
                                            <Typography variant="body2">Disbursement Rate</Typography>
                                            <Typography variant="body2" sx={{ fontWeight: 700, color: colors.blueAccent[500] }}>
                                                {disbursementRate.toFixed(1)}%
                                            </Typography>
                                        </Box>
                                        <LinearProgress variant="determinate" value={disbursementRate} sx={{ height: 8, borderRadius: 4 }} />
                                    </Paper>
                                </Grid>
                            </Grid>
                        </Paper>

                        <Paper elevation={2} sx={{ p: 2, borderRadius: 2 }}>
                            <Typography variant="h6" sx={{ mb: 1.5, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 1 }}>
                                <AccountBalanceWalletIcon /> Project Funding Sources
                            </Typography>

                            {loadingFunding ? (
                                <Box sx={{ py: 3, display: 'flex', justifyContent: 'center' }}>
                                    <CircularProgress size={26} />
                                </Box>
                            ) : fundingError ? (
                                <Alert severity="error" sx={{ mb: 1.5 }}>{fundingError}</Alert>
                            ) : (
                                <>
                                    {isSuperAdmin && (
                                        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} sx={{ mb: 2 }}>
                                            <TextField
                                                label="New Funding Source (Admin)"
                                                size="small"
                                                value={newFundingSourceName}
                                                onChange={(e) => setNewFundingSourceName(e.target.value)}
                                                sx={{ minWidth: 260 }}
                                            />
                                            <Button
                                                variant="outlined"
                                                onClick={async () => {
                                                    const sourceName = newFundingSourceName.trim();
                                                    if (!sourceName) return;
                                                    try {
                                                        await projectService.funding.createFundingSource({ sourceName });
                                                        setNewFundingSourceName('');
                                                        setSnackbar({ open: true, message: 'Funding source added.', severity: 'success' });
                                                        fetchFundingData();
                                                    } catch (err) {
                                                        setSnackbar({ open: true, message: err?.message || 'Failed to add funding source.', severity: 'error' });
                                                    }
                                                }}
                                            >
                                                Add Source
                                            </Button>
                                        </Stack>
                                    )}

                                    <Paper variant="outlined" sx={{ p: 1.5, mb: 2 }}>
                                        <Typography variant="subtitle2" sx={{ mb: 1 }}>
                                            Add Project Funding Entry
                                        </Typography>
                                        <Grid container spacing={1}>
                                            <Grid item xs={12} md={3}>
                                                <FormControl fullWidth size="small" sx={{ minWidth: 260 }}>
                                                    <InputLabel>Funding Source</InputLabel>
                                                    <Select
                                                        label="Funding Source"
                                                        value={fundingForm.sourceId}
                                                        onChange={(e) => setFundingForm((p) => ({ ...p, sourceId: e.target.value }))}
                                                    >
                                                        {fundingSources.map((s) => (
                                                            <MenuItem key={s.sourceId} value={String(s.sourceId)}>{s.sourceName}</MenuItem>
                                                        ))}
                                                    </Select>
                                                </FormControl>
                                            </Grid>
                                            <Grid item xs={12} md={2}>
                                                <TextField
                                                    fullWidth
                                                    label="Amount"
                                                    size="small"
                                                    inputMode="decimal"
                                                    value={formatAmountInput(fundingForm.amount)}
                                                    onChange={(e) => {
                                                        const next = String(e.target.value || '').replace(/,/g, '');
                                                        if (next === '' || /^\d*(\.\d{0,2})?$/.test(next)) {
                                                            setFundingForm((p) => ({ ...p, amount: next }));
                                                        }
                                                    }}
                                                />
                                            </Grid>
                                            <Grid item xs={12} md={3}>
                                                <TextField
                                                    fullWidth
                                                    label="Stage"
                                                    size="small"
                                                    value={fundingForm.stage}
                                                    onChange={(e) => setFundingForm((p) => ({ ...p, stage: e.target.value }))}
                                                    placeholder="e.g. Design, Procurement, Construction"
                                                />
                                            </Grid>
                                            <Grid item xs={12} md={4}>
                                                <TextField
                                                    fullWidth
                                                    label="Notes"
                                                    size="small"
                                                    value={fundingForm.notes}
                                                    onChange={(e) => setFundingForm((p) => ({ ...p, notes: e.target.value }))}
                                                />
                                            </Grid>
                                            <Grid item xs={12}>
                                                <Button
                                                    variant="contained"
                                                    onClick={async () => {
                                                        if (!fundingForm.sourceId || fundingForm.amount === '') {
                                                            setSnackbar({ open: true, message: 'Funding source and amount are required.', severity: 'error' });
                                                            return;
                                                        }
                                                        try {
                                                            await projectService.funding.createProjectFundingEntry(projectId, {
                                                                sourceId: Number(fundingForm.sourceId),
                                                                amount: Number(fundingForm.amount),
                                                                stage: fundingForm.stage,
                                                                notes: fundingForm.notes,
                                                            });
                                                            setFundingForm({ sourceId: '', amount: '', stage: '', notes: '' });
                                                            setSnackbar({ open: true, message: 'Funding entry added.', severity: 'success' });
                                                            fetchFundingData();
                                                        } catch (err) {
                                                            setSnackbar({ open: true, message: err?.message || 'Failed to add funding entry.', severity: 'error' });
                                                        }
                                                    }}
                                                >
                                                    Save Funding Entry
                                                </Button>
                                            </Grid>
                                        </Grid>
                                    </Paper>

                                    {projectFundingEntries.length === 0 ? (
                                        <Alert severity="info">No funding entries recorded for this project yet.</Alert>
                                    ) : (
                                        <TableContainer component={Paper} variant="outlined">
                                            <Table size="small">
                                                <TableHead>
                                                    <TableRow>
                                                        <TableCell><strong>Funding Source</strong></TableCell>
                                                        <TableCell><strong>Amount</strong></TableCell>
                                                        <TableCell><strong>Stage</strong></TableCell>
                                                        <TableCell><strong>Notes</strong></TableCell>
                                                    </TableRow>
                                                </TableHead>
                                                <TableBody>
                                                    {projectFundingEntries.map((entry) => (
                                                        <TableRow key={entry.entryId}>
                                                            <TableCell>{entry.sourceName || 'N/A'}</TableCell>
                                                            <TableCell>{formatCurrency(entry.amount || 0)}</TableCell>
                                                            <TableCell>{entry.stage || 'N/A'}</TableCell>
                                                            <TableCell>{entry.notes || 'N/A'}</TableCell>
                                                        </TableRow>
                                                    ))}
                                                </TableBody>
                                            </Table>
                                        </TableContainer>
                                    )}
                                </>
                            )}
                        </Paper>
                    </Box>
                )}

                {activeTab === 5 && (
                    <Box>
                        <Paper variant="outlined" sx={{ p: 2, mb: 2, borderRadius: 2 }}>
                            <Stack
                                direction={{ xs: 'column', sm: 'row' }}
                                spacing={2}
                                alignItems={{ xs: 'stretch', sm: 'center' }}
                                justifyContent="space-between"
                            >
                                <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                                    Schedule &amp; milestones
                                </Typography>
                                <Button
                                    variant={scheduleGanttVisible ? 'outlined' : 'contained'}
                                    color="primary"
                                    startIcon={scheduleGanttVisible ? <ExpandLessIcon /> : <TimelineIcon />}
                                    onClick={() => setScheduleGanttVisible((v) => !v)}
                                    sx={{ flexShrink: 0, alignSelf: { xs: 'stretch', sm: 'center' } }}
                                >
                                    {scheduleGanttVisible ? 'Hide Gantt chart' : 'Show Gantt chart'}
                                </Button>
                            </Stack>
                        </Paper>
                        {scheduleGanttVisible && (
                            <Paper elevation={2} sx={{ p: 2, borderRadius: 2, mb: 2 }}>
                                <ProjectGanttChart
                                    milestones={milestones}
                                    activities={milestoneActivities}
                                    projectName={project?.projectName || project?.name || 'Project'}
                                />
                            </Paper>
                        )}
                        {/* Timeline & Milestones Tab */}
                        {/* Work Plans and Milestones Section (Refactored) */}
            <Box sx={{ mt: 1 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                    <Typography variant="h5" sx={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        fontWeight: 700,
                        color: 'text.primary',
                        borderBottom: '2px solid',
                        borderColor: 'divider',
                        pb: 1
                    }}>
                        <AccountTreeIcon sx={{ mr: 1, color: 'primary.main' }} />
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
                                        fontWeight: 700,
                                        color: 'text.primary',
                                        borderBottom: '2px solid',
                                        borderColor: 'divider',
                                        pb: 1
                                    }}>
                                        <AccountTreeIcon sx={{ mr: 1, color: 'primary.main' }} />
                                        Project Milestones
                                    </Typography>
                                    <Stack direction="row" spacing={1}>
                                        {checkUserPrivilege(user, 'milestone.create') && (
                                            <Button
                                                variant="contained"
                                                color="success"
                                                startIcon={<AddIcon />}
                                                onClick={handleOpenCreateMilestoneDialog}
                                                size="small"
                                            >
                                                Add Milestone
                                            </Button>
                                        )}
                                    </Stack>
                                </Box>
                                <Box
                                    sx={{
                                        display: 'grid',
                                        width: '100%',
                                        gap: 3,
                                        gridTemplateColumns: {
                                            xs: '1fr',
                                            sm: 'repeat(auto-fit, minmax(min(100%, 380px), 1fr))',
                                        },
                                    }}
                                >
                                    {milestones
                                        .sort((a, b) => (a.sequenceOrder || 0) - (b.sequenceOrder || 0))
                                        .map((milestone) => {
                                        const activitiesForMilestone = milestoneActivities.filter(a => a.milestoneId === milestone.milestoneId);
                                        return (
                                            <Box
                                                key={milestone.milestoneId}
                                                sx={{ display: 'flex', minHeight: '100%', minWidth: 0 }}
                                            >
                                                <Paper elevation={0} sx={{ 
                                                    p: 0, 
                                                    borderRadius: 2, 
                                                    width: '100%',
                                                    height: '100%', 
                                                    display: 'flex', 
                                                    flexDirection: 'column',
                                                    border: '1px solid',
                                                    borderColor: 'divider',
                                                    bgcolor: 'background.paper',
                                                    transition: 'box-shadow 0.2s ease, border-color 0.2s ease',
                                                    '&:hover': {
                                                        boxShadow: theme.shadows[2],
                                                    }
                                                }}>
                                                    <Box
                                                        sx={{
                                                            p: 2,
                                                            pb: 1.5,
                                                            borderLeft: '4px solid',
                                                            borderColor: 'primary.main',
                                                            backgroundColor: alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.14 : 0.06),
                                                            borderTopLeftRadius: 8,
                                                            borderTopRightRadius: 8,
                                                        }}
                                                    >
                                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                            <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                                                <FlagIcon sx={{ 
                                                                    mr: 1,
                                                                    color: 'primary.main',
                                                                    fontSize: '1.5rem'
                                                                }} />
                                                                <Typography variant="h6" sx={{ 
                                                                    fontWeight: 700, 
                                                                    color: 'text.primary',
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
                                                                            color: 'text.secondary',
                                                                            '&:hover': { backgroundColor: 'action.hover' },
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
                                                                                color: 'primary.main',
                                                                                '&:hover': { backgroundColor: 'action.hover' },
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
                                                                                color: 'error.main',
                                                                                '&:hover': { backgroundColor: 'action.hover' },
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
                                                        backgroundColor: theme.palette.mode === 'dark'
                                                            ? alpha(theme.palette.common.white, 0.03)
                                                            : alpha(theme.palette.common.black, 0.02),
                                                        borderBottomLeftRadius: 8,
                                                        borderBottomRightRadius: 8
                                                    }}>
                                                        <Typography variant="body2" sx={{ 
                                                            mb: 2,
                                                            color: 'text.secondary',
                                                            fontWeight: 400,
                                                            lineHeight: 1.6,
                                                            fontSize: '0.9rem'
                                                        }}>
                                                            {milestone.description || 'No description.'}
                                                        </Typography>
                                                        
                                                        <Stack spacing={1.5} sx={{ mb: 2 }}>
                                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                                <ScheduleIcon sx={{ fontSize: '1rem', color: 'primary.main' }} />
                                                                <Typography variant="body2" sx={{ color: 'text.primary', fontWeight: 500 }}>
                                                                    Due Date: {formatDate(milestone.dueDate)}
                                                                </Typography>
                                                            </Box>
                                                            {milestone.completedDate && (
                                                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                                    <CheckCircleIcon sx={{ fontSize: '1rem', color: 'success.main' }} />
                                                                    <Typography variant="body2" sx={{ color: 'text.primary', fontWeight: 500 }}>
                                                                        Completed: {formatDate(milestone.completedDate)}
                                                                    </Typography>
                                                                </Box>
                                                            )}
                                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                                <TrendingUpIcon sx={{ fontSize: '1rem', color: 'primary.main' }} />
                                                                <Typography variant="body2" sx={{ color: 'text.primary', fontWeight: 500 }}>
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
                                                                bgcolor: 'action.hover',
                                                                '& .MuiLinearProgress-bar': {
                                                                    borderRadius: 5,
                                                                    bgcolor: 'primary.main',
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
                                                            borderTop: '1px solid',
                                                            borderColor: 'divider',
                                                        }}>
                                                            <Typography variant="subtitle2" sx={{ 
                                                                fontWeight: 700,
                                                                mb: 2,
                                                                color: 'primary.main',
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
                                                                                borderBottom: idx < activitiesForMilestone.length - 1 ? '1px solid' : 'none',
                                                                                borderColor: 'divider',
                                                                            }}
                                                                        >
                                                                            <ListItemText
                                                                                primary={
                                                                                    <Typography variant="body2" sx={{ 
                                                                                        fontWeight: 700,
                                                                                        color: 'text.primary',
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
                                                                                            color: 'text.secondary',
                                                                                            fontWeight: 500,
                                                                                            fontSize: '0.8rem',
                                                                                            display: 'block'
                                                                                        }}>
                                                                                            {formatDate(activity.startDate)} - {formatDate(activity.endDate)}
                                                                                        </Typography>
                                                                                        <Typography variant="caption" sx={{
                                                                                            color: 'text.secondary',
                                                                                            fontWeight: 500,
                                                                                            fontSize: '0.8rem',
                                                                                            display: 'block'
                                                                                        }}>
                                                                                            Status: {activity.activityStatus?.replace(/_/g, ' ') || 'not started'} | Progress: {activity.percentageComplete || 0}%
                                                                                        </Typography>
                                                                                        {activity.budgetAllocated && (
                                                                                            <Typography variant="caption" sx={{
                                                                                                color: 'text.secondary',
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
                                                                    color: 'text.secondary',
                                                                    textAlign: 'center',
                                                                    py: 2
                                                                }}>
                                                                    No activities linked to this milestone.
                                                                </Typography>
                                                            )}
                                                        </Box>
                                                    </Box>
                                                </Paper>
                                            </Box>
                                        );
                                    })}
                                </Box>
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
                                sx={{
                                    mb: 2,
                                    borderRadius: 2,
                                    '&:before': { display: 'none' },
                                    border: '1px solid',
                                    borderColor: 'divider',
                                    bgcolor: 'background.paper',
                                    overflow: 'hidden',
                                }}
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
                                                fontWeight: 700,
                                                color: 'text.primary',
                                                display: 'flex',
                                                alignItems: 'center',
                                                '&::before': {
                                                    content: '""',
                                                    width: '4px',
                                                    height: '24px',
                                                    backgroundColor: 'primary.main',
                                                    borderRadius: '2px',
                                                    marginRight: '12px'
                                                }
                                            }}>
                                                Milestones
                                            </Typography>
                                            {checkUserPrivilege(user, 'milestone.create') && !projectCategory && (
                                                <Button
                                                    variant="contained"
                                                    color="success"
                                                    startIcon={<AddIcon />}
                                                    onClick={handleOpenCreateMilestoneDialog}
                                                    size="small"
                                                >
                                                    Add Milestone
                                                </Button>
                                            )}
                                        </Box>

                                        {milestonesForWorkplan.length === 0 ? (
                                            <Box sx={{
                                                p: 3,
                                                textAlign: 'center',
                                                backgroundColor: alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.08 : 0.04),
                                                borderRadius: 2,
                                                border: '2px dashed',
                                                borderColor: 'divider',
                                            }}>
                                                <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.4, color: 'text.primary' }}>
                                                    No Milestones Yet
                                                </Typography>
                                                <Typography variant="body2" sx={{ color: 'text.secondary', fontStyle: 'italic' }}>
                                                    No milestones have been linked to this work plan yet.
                                                </Typography>
                                            </Box>
                                        ) : (
                                            <Box
                                                sx={{
                                                    display: 'grid',
                                                    width: '100%',
                                                    gap: 3,
                                                    gridTemplateColumns: {
                                                        xs: '1fr',
                                                        sm: 'repeat(auto-fit, minmax(min(100%, 380px), 1fr))',
                                                    },
                                                }}
                                            >
                                                {milestonesForWorkplan.map((milestone) => {
                                                    const activitiesForMilestone = activitiesForWorkplan.filter(a => a.milestoneId === milestone.milestoneId);
                                                    return (
                                                        <Box
                                                            key={milestone.milestoneId}
                                                            sx={{ display: 'flex', minHeight: '100%', minWidth: 0 }}
                                                        >
                                                            <Paper elevation={0} sx={{ 
                                                                p: 0, 
                                                                borderRadius: 2, 
                                                                width: '100%',
                                                                height: '100%', 
                                                                display: 'flex', 
                                                                flexDirection: 'column',
                                                                border: '1px solid',
                                                                borderColor: 'divider',
                                                                bgcolor: 'background.paper',
                                                                transition: 'box-shadow 0.2s ease',
                                                                '&:hover': { boxShadow: theme.shadows[2] },
                                                            }}>
                                                                <Box
                                                                    sx={{
                                                                        p: 2,
                                                                        pb: 1.5,
                                                                        borderLeft: '4px solid',
                                                                        borderColor: 'primary.main',
                                                                        backgroundColor: alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.14 : 0.06),
                                                                        borderTopLeftRadius: 8,
                                                                        borderTopRightRadius: 8,
                                                                    }}
                                                                >
                                                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                                        <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                                                            <FlagIcon sx={{ mr: 1, color: 'primary.main', fontSize: '1.5rem' }} />
                                                                            <Typography variant="h6" sx={{ fontWeight: 700, color: 'text.primary', fontSize: '1.05rem' }}>
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
                                                                                    sx={{ color: 'text.secondary', '&:hover': { backgroundColor: 'action.hover' } }}
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
                                                                                        sx={{ color: 'primary.main', '&:hover': { backgroundColor: 'action.hover' } }}
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
                                                                                        sx={{ color: 'error.main', '&:hover': { backgroundColor: 'action.hover' } }}
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
                                                                    backgroundColor: theme.palette.mode === 'dark'
                                                                        ? alpha(theme.palette.common.white, 0.03)
                                                                        : alpha(theme.palette.common.black, 0.02),
                                                                    borderBottomLeftRadius: 8,
                                                                    borderBottomRightRadius: 8
                                                                }}>
                                                                    <Typography variant="body2" sx={{ 
                                                                        mb: 2,
                                                                        color: 'text.secondary',
                                                                        fontWeight: 400,
                                                                        lineHeight: 1.6,
                                                                        fontSize: '0.9rem'
                                                                    }}>
                                                                        {milestone.description || 'No description.'}
                                                                    </Typography>
                                                                    
                                                                    <Stack spacing={1.5} sx={{ mb: 2 }}>
                                                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                                            <ScheduleIcon sx={{ fontSize: '1rem', color: 'primary.main' }} />
                                                                            <Typography variant="body2" sx={{ color: 'text.primary', fontWeight: 500 }}>
                                                                                Due Date: {formatDate(milestone.dueDate)}
                                                                            </Typography>
                                                                        </Box>
                                                                        {milestone.completedDate && (
                                                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                                                <CheckCircleIcon sx={{ fontSize: '1rem', color: 'success.main' }} />
                                                                                <Typography variant="body2" sx={{ color: 'text.primary', fontWeight: 500 }}>
                                                                                    Completed: {formatDate(milestone.completedDate)}
                                                                                </Typography>
                                                                            </Box>
                                                                        )}
                                                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                                            <TrendingUpIcon sx={{ fontSize: '1rem', color: 'primary.main' }} />
                                                                            <Typography variant="body2" sx={{ color: 'text.primary', fontWeight: 500 }}>
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
                                                                            bgcolor: 'action.hover',
                                                                            '& .MuiLinearProgress-bar': {
                                                                                borderRadius: 5,
                                                                                bgcolor: 'primary.main',
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
                                                                        borderTop: '1px solid',
                                                                        borderColor: 'divider',
                                                                    }}>
                                                                        <Typography variant="subtitle2" sx={{ 
                                                                            fontWeight: 700,
                                                                            mb: 2,
                                                                            color: 'primary.main',
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
                                                                                            borderBottom: idx < activitiesForMilestone.length - 1 ? '1px solid' : 'none',
                                                                                            borderColor: 'divider',
                                                                                        }}
                                                                                    >
                                                                                        <ListItemText
                                                                                            primary={
                                                                                                <Typography variant="body2" sx={{ 
                                                                                                    fontWeight: 700,
                                                                                                    color: 'text.primary',
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
                                                                                                        color: 'text.secondary',
                                                                                                        fontWeight: 500,
                                                                                                        fontSize: '0.8rem',
                                                                                                        display: 'block'
                                                                                                    }}>
                                                                                                        {formatDate(activity.startDate)} - {formatDate(activity.endDate)}
                                                                                                    </Typography>
                                                                                                    <Typography variant="caption" sx={{
                                                                                                        color: 'text.secondary',
                                                                                                        fontWeight: 500,
                                                                                                        fontSize: '0.8rem',
                                                                                                        display: 'block'
                                                                                                    }}>
                                                                                                        Status: {activity.activityStatus?.replace(/_/g, ' ') || 'not started'} | Progress: {activity.percentageComplete || 0}%
                                                                                                    </Typography>
                                                                                                    {activity.budgetAllocated && (
                                                                                                        <Typography variant="caption" sx={{
                                                                                                            color: 'text.secondary',
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
                                                                                color: 'text.secondary',
                                                                                textAlign: 'center',
                                                                                py: 2
                                                                            }}>
                                                                                No activities linked to this milestone.
                                                                            </Typography>
                                                                        )}
                                                                    </Box>
                                                                </Box>
                                                            </Paper>
                                                        </Box>
                                                    );
                                                })}
                                            </Box>
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

                {/* Gantt: toggled from header in Schedule tab */}
                {/* M&E Tab - Removed */}
                {/* Documents Tab - Removed */}

                {/* M&E Tab Content - Removed (lines 3244-3695) */}

                {/* Documents Tab Content - Removed */}

                {activeTab === 3 && (
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
                                        Direct Jobs
                                    </Typography>
                                    <Typography variant="h6">
                                        {jobsSummary.totalDirectJobs}
                                    </Typography>
                                </Paper>
                            </Grid>
                            <Grid item xs={12} md={3}>
                                <Paper sx={{ p: 2 }}>
                                    <Typography variant="subtitle2" color="text.secondary">
                                        Indirect Jobs
                                    </Typography>
                                    <Typography variant="h6">
                                        {jobsSummary.totalIndirectJobs}
                                    </Typography>
                                </Paper>
                            </Grid>
                        </Grid>

                        {/* Add/Edit Job form — only users who can create/update projects */}
                        {canModifyOrCreateProjects && (
                        <Paper sx={{ p: 2, mb: 2 }}>
                            <Typography variant="subtitle2" sx={{ mb: 1 }}>
                                {editingJob ? 'Edit Job Record' : 'Add Jobs Created'}
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
                                        onChange={(e) => {
                                            const newValue = e.target.value;
                                            setJobFormData(prev => ({ ...prev, jobsCount: newValue }));
                                            // Clear errors when Jobs field changes
                                            if (jobFormErrors.jobsCount) {
                                                setJobFormErrors(prev => ({ ...prev, jobsCount: undefined }));
                                            }
                                            // Re-validate male/female if they exist
                                            if (jobFormData.maleCount || jobFormData.femaleCount) {
                                                const jobsCountInt = parseInt(newValue, 10) || 0;
                                                const maleCountInt = parseInt(jobFormData.maleCount, 10) || 0;
                                                const femaleCountInt = parseInt(jobFormData.femaleCount, 10) || 0;
                                                const errors = { ...jobFormErrors };
                                                if (maleCountInt + femaleCountInt > jobsCountInt) {
                                                    errors.maleCount = 'Male + Female cannot exceed total jobs';
                                                    errors.femaleCount = 'Male + Female cannot exceed total jobs';
                                                } else {
                                                    delete errors.maleCount;
                                                    delete errors.femaleCount;
                                                }
                                                setJobFormErrors(errors);
                                            }
                                        }}
                                        error={!!jobFormErrors.jobsCount}
                                        helperText={jobFormErrors.jobsCount}
                                    />
                                </Grid>
                                <Grid item xs={12} md={2}>
                                    <TextField
                                        label="Male"
                                        type="number"
                                        size="small"
                                        fullWidth
                                        value={jobFormData.maleCount}
                                        onChange={(e) => {
                                            const newValue = e.target.value;
                                            const jobsCountInt = parseInt(jobFormData.jobsCount, 10) || 0;
                                            const maleCountInt = parseInt(newValue, 10) || 0;
                                            const femaleCountInt = parseInt(jobFormData.femaleCount, 10) || 0;
                                            
                                            setJobFormData(prev => ({ 
                                                ...prev, 
                                                maleCount: newValue
                                            }));
                                            
                                            // Real-time validation: male + female cannot exceed jobs
                                            const errors = { ...jobFormErrors };
                                            if (jobsCountInt > 0 && maleCountInt + femaleCountInt > jobsCountInt) {
                                                errors.maleCount = 'Male + Female cannot exceed total jobs';
                                                errors.femaleCount = 'Male + Female cannot exceed total jobs';
                                            } else {
                                                delete errors.maleCount;
                                                delete errors.femaleCount;
                                            }
                                            setJobFormErrors(errors);
                                        }}
                                        error={!!jobFormErrors.maleCount}
                                        helperText={jobFormErrors.maleCount}
                                    />
                                </Grid>
                                <Grid item xs={12} md={2}>
                                    <TextField
                                        label="Female"
                                        type="number"
                                        size="small"
                                        fullWidth
                                        value={jobFormData.femaleCount}
                                        onChange={(e) => {
                                            const newValue = e.target.value;
                                            const jobsCountInt = parseInt(jobFormData.jobsCount, 10) || 0;
                                            const maleCountInt = parseInt(jobFormData.maleCount, 10) || 0;
                                            const femaleCountInt = parseInt(newValue, 10) || 0;
                                            
                                            setJobFormData(prev => ({ 
                                                ...prev, 
                                                femaleCount: newValue
                                            }));
                                            
                                            // Real-time validation: male + female cannot exceed jobs
                                            const errors = { ...jobFormErrors };
                                            if (jobsCountInt > 0 && maleCountInt + femaleCountInt > jobsCountInt) {
                                                errors.maleCount = 'Male + Female cannot exceed total jobs';
                                                errors.femaleCount = 'Male + Female cannot exceed total jobs';
                                            } else {
                                                delete errors.maleCount;
                                                delete errors.femaleCount;
                                            }
                                            setJobFormErrors(errors);
                                        }}
                                        error={!!jobFormErrors.femaleCount}
                                        helperText={jobFormErrors.femaleCount}
                                    />
                                </Grid>
                                <Grid item xs={12} md={2}>
                                    <TextField
                                        label="Direct Jobs"
                                        type="number"
                                        size="small"
                                        fullWidth
                                        value={jobFormData.directJobs}
                                        onChange={(e) => {
                                            const newValue = e.target.value;
                                            const jobsCountInt = parseInt(jobFormData.jobsCount, 10) || 0;
                                            const directJobsInt = parseInt(newValue, 10) || 0;
                                            const indirectJobsInt = parseInt(jobFormData.indirectJobs, 10) || 0;
                                            
                                            setJobFormData(prev => ({ 
                                                ...prev, 
                                                directJobs: newValue
                                            }));
                                            
                                            // Real-time validation: direct + indirect cannot exceed jobs
                                            const errors = { ...jobFormErrors };
                                            if (jobsCountInt > 0 && directJobsInt + indirectJobsInt > jobsCountInt) {
                                                errors.directJobs = 'Direct + Indirect jobs cannot exceed total jobs';
                                                errors.indirectJobs = 'Direct + Indirect jobs cannot exceed total jobs';
                                            } else {
                                                delete errors.directJobs;
                                                delete errors.indirectJobs;
                                            }
                                            setJobFormErrors(errors);
                                        }}
                                        error={!!jobFormErrors.directJobs}
                                        helperText={jobFormErrors.directJobs}
                                    />
                                </Grid>
                                <Grid item xs={12} md={2}>
                                    <TextField
                                        label="Indirect Jobs"
                                        type="number"
                                        size="small"
                                        fullWidth
                                        value={jobFormData.indirectJobs}
                                        onChange={(e) => {
                                            const newValue = e.target.value;
                                            const jobsCountInt = parseInt(jobFormData.jobsCount, 10) || 0;
                                            const directJobsInt = parseInt(jobFormData.directJobs, 10) || 0;
                                            const indirectJobsInt = parseInt(newValue, 10) || 0;
                                            
                                            setJobFormData(prev => ({ 
                                                ...prev, 
                                                indirectJobs: newValue
                                            }));
                                            
                                            // Real-time validation: direct + indirect cannot exceed jobs
                                            const errors = { ...jobFormErrors };
                                            if (jobsCountInt > 0 && directJobsInt + indirectJobsInt > jobsCountInt) {
                                                errors.directJobs = 'Direct + Indirect jobs cannot exceed total jobs';
                                                errors.indirectJobs = 'Direct + Indirect jobs cannot exceed total jobs';
                                            } else {
                                                delete errors.directJobs;
                                                delete errors.indirectJobs;
                                            }
                                            setJobFormErrors(errors);
                                        }}
                                        error={!!jobFormErrors.indirectJobs}
                                        helperText={jobFormErrors.indirectJobs}
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
                                                    directJobs: '',
                                                    indirectJobs: '',
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

                                                // Validation: directJobs + indirectJobs should not exceed jobsCount
                                                const jobsCountInt = parseInt(jobFormData.jobsCount, 10) || 0;
                                                const directJobsInt = parseInt(jobFormData.directJobs, 10) || 0;
                                                const indirectJobsInt = parseInt(jobFormData.indirectJobs, 10) || 0;
                                                if (directJobsInt + indirectJobsInt > jobsCountInt) {
                                                    errors.directJobs = 'Direct + Indirect jobs cannot exceed total jobs';
                                                    errors.indirectJobs = 'Direct + Indirect jobs cannot exceed total jobs';
                                                }

                                                // Validation: maleCount + femaleCount should not exceed jobsCount
                                                const maleCountInt = parseInt(jobFormData.maleCount, 10) || 0;
                                                const femaleCountInt = parseInt(jobFormData.femaleCount, 10) || 0;
                                                if (maleCountInt + femaleCountInt > jobsCountInt) {
                                                    errors.maleCount = 'Male + Female cannot exceed total jobs';
                                                    errors.femaleCount = 'Male + Female cannot exceed total jobs';
                                                }

                                                setJobFormErrors(errors);
                                                if (Object.keys(errors).length > 0) return;

                                                try {
                                                    if (editingJob) {
                                                        // Update existing job
                                                        await projectService.junctions.updateProjectJob(projectId, editingJob.id, {
                                                            categoryId: jobFormData.categoryId,
                                                            jobsCount: jobFormData.jobsCount,
                                                            maleCount: jobFormData.maleCount,
                                                            femaleCount: jobFormData.femaleCount,
                                                            directJobs: jobFormData.directJobs,
                                                            indirectJobs: jobFormData.indirectJobs,
                                                        });
                                                        setSnackbar({
                                                            open: true,
                                                            message: 'Job record updated successfully',
                                                            severity: 'success',
                                                        });
                                                        setEditingJob(null);
                                                    } else {
                                                        // Create new job
                                                        await projectService.junctions.createProjectJob(projectId, {
                                                            categoryId: jobFormData.categoryId,
                                                            jobsCount: jobFormData.jobsCount,
                                                            maleCount: jobFormData.maleCount,
                                                            femaleCount: jobFormData.femaleCount,
                                                            directJobs: jobFormData.directJobs,
                                                            indirectJobs: jobFormData.indirectJobs,
                                                        });
                                                        setSnackbar({
                                                            open: true,
                                                            message: 'Job record added successfully',
                                                            severity: 'success',
                                                        });
                                                    }
                                                    setJobFormData({
                                                        categoryId: '',
                                                        jobsCount: '',
                                                        maleCount: '',
                                                        femaleCount: '',
                                                        directJobs: '',
                                                        indirectJobs: '',
                                                    });
                                                    setJobFormErrors({});
                                                    fetchProjectJobs();
                                                } catch (error) {
                                                    console.error(`Error ${editingJob ? 'updating' : 'creating'} project job:`, error);
                                                    setSnackbar({
                                                        open: true,
                                                        message: error?.response?.data?.message || `Failed to ${editingJob ? 'update' : 'add'} job record`,
                                                        severity: 'error',
                                                    });
                                                }
                                            }}
                                        >
                                            {editingJob ? 'Update' : 'Save'}
                                        </Button>
                                        {editingJob && (
                                            <Button
                                                variant="outlined"
                                                size="small"
                                                onClick={() => {
                                                    setEditingJob(null);
                                                    setJobFormData({
                                                        categoryId: '',
                                                        jobsCount: '',
                                                        maleCount: '',
                                                        femaleCount: '',
                                                        directJobs: '',
                                                        indirectJobs: '',
                                                    });
                                                    setJobFormErrors({});
                                                }}
                                            >
                                                Cancel
                                            </Button>
                                        )}
                    </Box>
                                </Grid>
                            </Grid>
                        </Paper>
                        )}

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
                                                <TableCell><strong>Direct Jobs</strong></TableCell>
                                                <TableCell><strong>Indirect Jobs</strong></TableCell>
                                                {canModifyOrCreateProjects && (
                                                    <TableCell><strong>Actions</strong></TableCell>
                                                )}
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
                                                    <TableCell>{job.direct_jobs ?? 0}</TableCell>
                                                    <TableCell>{job.indirect_jobs ?? 0}</TableCell>
                                                    {canModifyOrCreateProjects && (
                                                    <TableCell>
                                                        <Box display="flex" gap={0.5}>
                                                            <Tooltip title="Edit">
                                                                <IconButton
                                                                    size="small"
                                                                    color="primary"
                                                                    onClick={() => {
                                                                        setEditingJob(job);
                                                                        setJobFormData({
                                                                            categoryId: job.category_id,
                                                                            jobsCount: String(job.jobs_count || ''),
                                                                            maleCount: String(job.male_count || ''),
                                                                            femaleCount: String(job.female_count || ''),
                                                                            directJobs: String(job.direct_jobs || ''),
                                                                            indirectJobs: String(job.indirect_jobs || ''),
                                                                        });
                                                                        setJobFormErrors({});
                                                                    }}
                                                                >
                                                                    <EditIcon fontSize="small" />
                                                                </IconButton>
                                                            </Tooltip>
                                                            <Tooltip title="Delete">
                                                                <IconButton
                                                                    size="small"
                                                                    color="error"
                                                                    onClick={() => {
                                                                        setJobToDelete(job);
                                                                        setDeleteJobConfirmOpen(true);
                                                                    }}
                                                                >
                                                                    <DeleteIcon fontSize="small" />
                                                                </IconButton>
                                                            </Tooltip>
                                                        </Box>
                                                    </TableCell>
                                                    )}
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

                {activeTab === 4 && (
                    <Box>
                        <Paper elevation={2} sx={{ p: 2, borderRadius: 2, mb: 2 }}>
                            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}>
                                <Typography variant="h6" sx={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <FactCheckIcon /> Project Inspection
                                </Typography>
                                <Button variant="contained" startIcon={<AddIcon />} onClick={() => handleOpenInspectionDialog(null)} disabled={!canModifyOrCreateProjects}>
                                    New Inspection
                                </Button>
                            </Stack>
                            {loadingInspections ? (
                                <Box sx={{ py: 3, display: 'flex', justifyContent: 'center' }}><CircularProgress size={26} /></Box>
                            ) : inspectionsError ? (
                                <Alert severity="error">{inspectionsError}</Alert>
                            ) : projectInspections.length === 0 ? (
                                <Alert severity="info">No inspections recorded yet for this project.</Alert>
                            ) : (
                                <Stack spacing={1.5}>
                                    {projectInspections.map((inspection) => {
                                        const files = Array.isArray(inspection.files) ? inspection.files : [];
                                        const docs = files.filter((f) => f.fileCategory === 'document');
                                        const photos = files.filter((f) => f.fileCategory === 'photo');
                                        const members = (inspection.teamMemberRefs || []).map((ref) => {
                                            const found = teamMemberOptions.find((m) => m.ref === ref);
                                            return found ? found.label : String(ref);
                                        });
                                        return (
                                            <Paper key={inspection.inspectionId} variant="outlined" sx={{ p: 1.5, borderRadius: 1.5 }}>
                                                <Stack direction="row" justifyContent="space-between" alignItems="center">
                                                    <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                                                        Inspection Date: {String(inspection.inspectionDate || '').slice(0, 10)}
                                                    </Typography>
                                                    <Button size="small" variant="text" onClick={() => handleOpenInspectionDialog(inspection)} disabled={!canModifyOrCreateProjects}>
                                                        Edit
                                                    </Button>
                                                </Stack>
                                                <Typography variant="body2" sx={{ mt: 0.75 }}><strong>Findings:</strong> {inspection.findings || 'N/A'}</Typography>
                                                <Typography variant="body2" sx={{ mt: 0.5 }}><strong>Warnings:</strong> {inspection.warnings || 'N/A'}</Typography>
                                                <Typography variant="body2" sx={{ mt: 0.5 }}><strong>Recommendations:</strong> {inspection.recommendations || 'N/A'}</Typography>
                                                <Typography variant="body2" sx={{ mt: 0.75 }}><strong>Team Members:</strong> {members.length > 0 ? members.join(', ') : 'None selected'}</Typography>

                                                <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1.25, flexWrap: 'wrap' }}>
                                                    <Button
                                                        size="small"
                                                        variant="outlined"
                                                        startIcon={<DownloadIcon />}
                                                        onClick={() => handleDownloadInspectionReport(inspection)}
                                                    >
                                                        Download Report
                                                    </Button>
                                                    <Button component="label" size="small" variant="outlined" startIcon={<AttachmentIcon />} disabled={uploadingInspectionFiles || !canModifyOrCreateProjects}>
                                                        Upload Documents
                                                        <input hidden type="file" multiple onChange={(e) => handleUploadInspectionFiles(inspection, 'document', e.target.files)} />
                                                    </Button>
                                                    <Button component="label" size="small" variant="outlined" startIcon={<PhotoCameraIcon />} disabled={uploadingInspectionFiles || !canModifyOrCreateProjects}>
                                                        Upload Photos
                                                        <input hidden type="file" accept="image/*" multiple onChange={(e) => handleUploadInspectionFiles(inspection, 'photo', e.target.files)} />
                                                    </Button>
                                                    {uploadingInspectionFiles && <CircularProgress size={16} />}
                                                </Stack>

                                                {(docs.length > 0 || photos.length > 0) && (
                                                    <Box sx={{ mt: 1 }}>
                                                        {docs.length > 0 && (
                                                            <Typography variant="caption" sx={{ display: 'block' }}>
                                                                Documents: {docs.map((d) => d.fileName).join(', ')}
                                                            </Typography>
                                                        )}
                                                        {photos.length > 0 && (
                                                            <Typography variant="caption" sx={{ display: 'block' }}>
                                                                Photos: {photos.map((p) => p.fileName).join(', ')}
                                                            </Typography>
                                                        )}
                                                    </Box>
                                                )}
                                            </Paper>
                                        );
                                    })}
                                </Stack>
                            )}
                        </Paper>

                        <Dialog open={openInspectionDialog} onClose={() => setOpenInspectionDialog(false)} fullWidth maxWidth="md">
                            <DialogTitle>{editingInspection ? 'Edit Inspection' : 'New Inspection'}</DialogTitle>
                            <DialogContent>
                                <Stack spacing={1.5} sx={{ mt: 0.75 }}>
                                    <TextField
                                        label="Inspection Date"
                                        type="date"
                                        value={inspectionFormData.inspectionDate}
                                        onChange={(e) => setInspectionFormData((prev) => ({ ...prev, inspectionDate: e.target.value }))}
                                        InputLabelProps={{ shrink: true }}
                                        required
                                    />
                                    <TextField
                                        label="Findings"
                                        value={inspectionFormData.findings}
                                        onChange={(e) => setInspectionFormData((prev) => ({ ...prev, findings: e.target.value }))}
                                        multiline
                                        rows={3}
                                    />
                                    <TextField
                                        label="Warnings"
                                        value={inspectionFormData.warnings}
                                        onChange={(e) => setInspectionFormData((prev) => ({ ...prev, warnings: e.target.value }))}
                                        multiline
                                        rows={2}
                                    />
                                    <TextField
                                        label="Recommendations"
                                        value={inspectionFormData.recommendations}
                                        onChange={(e) => setInspectionFormData((prev) => ({ ...prev, recommendations: e.target.value }))}
                                        multiline
                                        rows={2}
                                    />
                                    <Autocomplete
                                        multiple
                                        options={teamMemberOptions}
                                        getOptionLabel={(option) => option.label}
                                        value={teamMemberOptions.filter((opt) => (inspectionFormData.teamMemberRefs || []).includes(opt.ref))}
                                        onChange={(event, values) => {
                                            setInspectionFormData((prev) => ({
                                                ...prev,
                                                teamMemberRefs: values.map((v) => v.ref),
                                            }));
                                        }}
                                        renderInput={(params) => <TextField {...params} label="Inspection Team Members" placeholder="Select team members" />}
                                    />
                                </Stack>
                            </DialogContent>
                            <DialogActions>
                                <Button onClick={() => setOpenInspectionDialog(false)}>Cancel</Button>
                                <Button variant="contained" onClick={handleSaveInspection} disabled={loading}>
                                    {editingInspection ? 'Update' : 'Create'}
                                </Button>
                            </DialogActions>
                        </Dialog>
                    </Box>
                )}

                {activeTab === 6 && (
                    <Box>
                        {/* BQ Tab */}
                        <Paper elevation={2} sx={{ p: 2, borderRadius: 2 }}>
                            <ProjectBQTab
                                projectId={projectId}
                                canModify={canModifyOrCreateProjects}
                            />
                        </Paper>
                    </Box>
                )}

                {activeTab === 2 && (
                    <Box>
                        {/* Sites Tab – toolbar, filters, then grid */}
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 1.5, mb: 1.5 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <Typography variant="subtitle1" sx={{ fontWeight: 600, color: 'text.primary', display: 'flex', alignItems: 'center', gap: 0.75 }}>
                                    <LocationOnIcon fontSize="small" />
                                    Project Sites
                                </Typography>
                                {projectSites.length > 0 && (
                                    <Chip
                                        label={`${sitesSummary.total} site${sitesSummary.total !== 1 ? 's' : ''}`}
                                        size="small"
                                        variant="outlined"
                                        sx={{ fontWeight: 500, fontSize: '0.75rem' }}
                                    />
                                )}
                            </Box>
                            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                                {projectSites.length > 0 && (
                                    <>
                                        <FormControlLabel
                                            control={<Checkbox checked={exportAllSites} onChange={(e) => setExportAllSites(e.target.checked)} size="small" />}
                                            label="Export all"
                                            sx={{ '& .MuiFormControlLabel-label': { fontSize: '0.8rem' } }}
                                        />
                                        <Button
                                            variant="outlined"
                                            size="small"
                                            startIcon={exportingSitesExcel ? <CircularProgress size={14} color="inherit" /> : <FileDownloadIcon sx={{ fontSize: 16 }} />}
                                            onClick={handleExportSitesToExcel}
                                            disabled={exportingSitesExcel || exportingSitesPdf}
                                            sx={{ borderColor: 'divider', color: 'text.secondary', minWidth: 80 }}
                                        >
                                            {exportingSitesExcel ? '…' : 'Excel'}
                                        </Button>
                                        <Button
                                            variant="outlined"
                                            size="small"
                                            startIcon={exportingSitesPdf ? <CircularProgress size={14} color="inherit" /> : <PictureAsPdfIcon sx={{ fontSize: 16 }} />}
                                            onClick={handleExportSitesToPDF}
                                            disabled={exportingSitesExcel || exportingSitesPdf}
                                            sx={{ borderColor: 'divider', color: 'text.secondary', minWidth: 72 }}
                                        >
                                            {exportingSitesPdf ? '…' : 'PDF'}
                                        </Button>
                                    </>
                                )}
                                {canModifyOrCreateProjects && (
                                <Button
                                    variant="outlined"
                                    size="small"
                                    startIcon={<UploadIcon />}
                                    onClick={() => setOpenImportSitesDialog(true)}
                                    sx={{ borderColor: theme.palette.divider, color: 'text.secondary' }}
                                >
                                    Import
                                </Button>
                                )}
                                {canModifyOrCreateProjects && (
                                <Button
                                    variant="contained"
                                    size="small"
                                    startIcon={<AddIcon />}
                                    onClick={() => {
                                        setEditingSite(null);
                                        setSiteFormData({
                                            siteName: '', county: '', constituency: '', ward: '',
                                            status: '', progress: '', approvedCost: '',
                                        });
                                        setSiteFormErrors({});
                                        setOpenSiteDialog(true);
                                    }}
                                    sx={{
                                        backgroundColor: theme.palette.primary.main,
                                        '&:hover': { backgroundColor: theme.palette.primary.dark }
                                    }}
                                >
                                    Add site
                                </Button>
                                )}
                            </Stack>
                        </Box>
                        {loadingSites ? (
                            <Box display="flex" justifyContent="center" alignItems="center" minHeight="140px">
                                <CircularProgress />
                            </Box>
                        ) : sitesError ? (
                            <Alert severity="error" sx={{ mb: 1 }}>{sitesError}</Alert>
                        ) : projectSites.length === 0 ? (
                            <Paper variant="outlined" sx={{ p: 3, textAlign: 'center', borderColor: 'divider' }}>
                                <Typography variant="body2" color="text.secondary">
                                    {canModifyOrCreateProjects ? (
                                        <>No sites yet. Use <strong>Add site</strong> or <strong>Import</strong> above to add sites.</>
                                    ) : (
                                        'No sites have been recorded for this project yet.'
                                    )}
                                </Typography>
                            </Paper>
                        ) : (
                            <Box>
                                {sitesSummary.total > 10 && (
                                    <Box sx={{ mb: 1.5, p: 1.25, borderRadius: 1, border: 1, borderColor: 'divider', bgcolor: theme.palette.mode === 'dark' ? theme.palette.action.hover : theme.palette.grey[50] }}>
                                        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                                            Showing latest 10 of {sitesSummary.total} sites.
                                        </Typography>
                                        <Button variant="outlined" size="small" startIcon={<LocationOnIcon />} onClick={() => setOpenSitesModal(true)} sx={{ borderColor: 'divider' }}>
                                            View all sites
                                        </Button>
                                    </Box>
                                )}
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.5, flexWrap: 'wrap' }}>
                                    <TextField
                                        size="small"
                                        placeholder="Filter by location…"
                                        value={siteFilters.location}
                                        onChange={(e) => setSiteFilters((prev) => ({ ...prev, location: e.target.value }))}
                                        sx={{ minWidth: 220, '& .MuiOutlinedInput-root': { backgroundColor: theme.palette.background.paper } }}
                                    />
                                    <FormControl size="small" sx={{ minWidth: 160 }}>
                                        <InputLabel id="site-status-filter-label">Status</InputLabel>
                                        <Select
                                            labelId="site-status-filter-label"
                                            label="Status"
                                            value={siteFilters.status}
                                            onChange={(e) => setSiteFilters((prev) => ({ ...prev, status: e.target.value }))}
                                        >
                                            <MenuItem value=""><em>All</em></MenuItem>
                                            <MenuItem value="Not Started">Not Started</MenuItem>
                                            <MenuItem value="In Progress">In Progress</MenuItem>
                                            <MenuItem value="Ongoing">Ongoing</MenuItem>
                                            <MenuItem value="Completed">Completed</MenuItem>
                                            <MenuItem value="Stalled">Stalled</MenuItem>
                                            <MenuItem value="Suspended">Suspended</MenuItem>
                                        </Select>
                                    </FormControl>
                                    <Button size="small" onClick={() => setSiteFilters({ location: '', status: '' })} sx={{ color: 'text.secondary' }}>
                                        Clear filters
                                    </Button>
                                    <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>
                                        {projectSites.length} of {sitesSummary.total} shown
                                    </Typography>
                                </Box>
                                <TableContainer component={Paper} variant="outlined" sx={{ borderColor: 'divider', borderRadius: 1, overflow: 'hidden' }}>
                                    <Table size="small" stickyHeader>
                                        <TableHead>
                                            <TableRow>
                                                <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem', py: 1.25, bgcolor: theme.palette.mode === 'dark' ? 'grey.900' : 'grey.100' }}>Site Name</TableCell>
                                                <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem', py: 1.25, bgcolor: theme.palette.mode === 'dark' ? 'grey.900' : 'grey.100' }}>County</TableCell>
                                                <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem', py: 1.25, bgcolor: theme.palette.mode === 'dark' ? 'grey.900' : 'grey.100' }}>Constituency</TableCell>
                                                <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem', py: 1.25, bgcolor: theme.palette.mode === 'dark' ? 'grey.900' : 'grey.100' }}>Ward</TableCell>
                                                <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem', py: 1.25, bgcolor: theme.palette.mode === 'dark' ? 'grey.900' : 'grey.100' }}>Status</TableCell>
                                                <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem', py: 1.25, bgcolor: theme.palette.mode === 'dark' ? 'grey.900' : 'grey.100' }}>Progress</TableCell>
                                                <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem', py: 1.25, bgcolor: theme.palette.mode === 'dark' ? 'grey.900' : 'grey.100' }}>Approved Cost</TableCell>
                                                {canModifyOrCreateProjects && (
                                                    <TableCell align="right" sx={{ fontWeight: 600, fontSize: '0.8rem', py: 1.25, bgcolor: theme.palette.mode === 'dark' ? 'grey.900' : 'grey.100' }}>Actions</TableCell>
                                                )}
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {projectSites
                                                .filter((site) => {
                                                    const locationFilter = siteFilters.location?.toLowerCase() || '';
                                                    const statusFilter = siteFilters.status;
                                                    const locationText = [site.county, site.constituency, site.ward].filter(Boolean).join(' ').toLowerCase();
                                                    const statusText = (site.status_norm || site.status_raw || '').toString().toLowerCase();
                                                    const matchesLocation = !locationFilter || locationText.includes(locationFilter.toLowerCase());
                                                    const matchesStatus = !statusFilter || normalizeStatusForFilter(statusText) === normalizeStatusForFilter(statusFilter);
                                                    return matchesLocation && matchesStatus;
                                                })
                                                .map((site, index) => (
                                                    <TableRow
                                                        key={site.site_id || index}
                                                        hover
                                                        sx={{
                                                            '&:nth-of-type(even)': { bgcolor: theme.palette.mode === 'dark' ? theme.palette.action.hover : theme.palette.grey[50] }
                                                        }}
                                                    >
                                                        <TableCell sx={{ fontWeight: 500, py: 1.25 }}>{site.site_name || site.siteName || `Site ${index + 1}`}</TableCell>
                                                        <TableCell sx={{ py: 1.25 }}>{site.county || '—'}</TableCell>
                                                        <TableCell sx={{ py: 1.25 }}>{site.constituency || '—'}</TableCell>
                                                        <TableCell sx={{ py: 1.25 }}>{site.ward || '—'}</TableCell>
                                                        <TableCell sx={{ py: 1.25 }}>
                                                            {(site.status_norm || site.status_raw) ? (
                                                                <Chip
                                                                    label={site.status_norm || site.status_raw}
                                                                    size="small"
                                                                    sx={{
                                                                        fontSize: '0.7rem',
                                                                        height: 22,
                                                                        backgroundColor: getProjectStatusBackgroundColor(site.status_norm || site.status_raw),
                                                                        color: getProjectStatusTextColor(site.status_norm || site.status_raw),
                                                                        fontWeight: 700,
                                                                        '& .MuiChip-label': { px: 0.75 },
                                                                    }}
                                                                />
                                                            ) : '—'}
                                                        </TableCell>
                                                        <TableCell sx={{ py: 1.25 }}>
                                                            {site.percent_complete !== null && site.percent_complete !== undefined ? `${site.percent_complete}%` : '—'}
                                                        </TableCell>
                                                        <TableCell sx={{ py: 1.25 }}>
                                                            {site.approved_cost_kes != null ? formatCurrency(site.approved_cost_kes) : '—'}
                                                        </TableCell>
                                                        {canModifyOrCreateProjects && (
                                                        <TableCell align="right" sx={{ py: 1.25 }}>
                                                            <Tooltip title="Edit site">
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
                                                                                await fetchProjectSites(true, true);
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
                                                        </TableCell>
                                                        )}
                                                    </TableRow>
                                                ))}
                                        </TableBody>
                                    </Table>
                                </TableContainer>
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
                            <Autocomplete
                                options={siteCounties}
                                value={siteFormData.county || null}
                                onChange={(event, newValue) => {
                                    const county = newValue || '';
                                    setSiteFormData(prev => ({
                                        ...prev,
                                        county,
                                        ...(county !== prev.county ? { constituency: '', ward: '' } : {}),
                                    }));
                                }}
                                loading={loadingSiteCounties}
                                freeSolo
                                fullWidth
                                size="small"
                                renderInput={(params) => (
                                    <TextField {...params} label="County" placeholder="Search or select county" />
                                )}
                                filterOptions={(options, params) =>
                                    options.filter((o) =>
                                        String(o).toLowerCase().includes((params.inputValue || '').toLowerCase())
                                    )
                                }
                            />
                            <Autocomplete
                                options={siteConstituencies}
                                value={siteFormData.constituency || null}
                                onChange={(event, newValue) => {
                                    const constituency = newValue || '';
                                    setSiteFormData(prev => ({
                                        ...prev,
                                        constituency,
                                        ...(constituency !== prev.constituency ? { ward: '' } : {}),
                                    }));
                                }}
                                loading={loadingSiteConstituencies}
                                disabled={!siteFormData.county}
                                freeSolo
                                fullWidth
                                size="small"
                                renderInput={(params) => (
                                    <TextField
                                        {...params}
                                        label="Constituency"
                                        placeholder={siteFormData.county ? 'Search or select constituency' : 'Select county first'}
                                    />
                                )}
                                filterOptions={(options, params) =>
                                    options.filter((o) =>
                                        String(o).toLowerCase().includes((params.inputValue || '').toLowerCase())
                                    )
                                }
                            />
                            <Autocomplete
                                options={siteWards}
                                getOptionLabel={(option) => !option ? '' : (typeof option === 'string' ? option : (option.name || ''))}
                                value={siteWards.find((w) => {
                                    const name = typeof w === 'string' ? w : (w && w.name);
                                    return name === siteFormData.ward;
                                }) || null}
                                onChange={(event, newValue) => {
                                    const ward = newValue ? (typeof newValue === 'string' ? newValue : (newValue.name || '')) : '';
                                    setSiteFormData(prev => ({ ...prev, ward }));
                                }}
                                loading={loadingSiteWards}
                                disabled={!siteFormData.constituency}
                                freeSolo
                                fullWidth
                                size="small"
                                renderInput={(params) => (
                                    <TextField
                                        {...params}
                                        label="Ward"
                                        placeholder={siteFormData.constituency ? 'Search or select ward' : 'Select constituency first'}
                                    />
                                )}
                                filterOptions={(options, params) => {
                                    const q = (params.inputValue || '').toLowerCase();
                                    return options.filter((option) => {
                                        const name = typeof option === 'string' ? option : (option && option.name);
                                        return String(name || '').toLowerCase().includes(q);
                                    });
                                }}
                                isOptionEqualToValue={(option, value) => {
                                    const a = typeof option === 'string' ? option : (option && option.name);
                                    const b = typeof value === 'string' ? value : (value && value.name);
                                    return a === b;
                                }}
                            />
                            <FormControl fullWidth size="small">
                                <InputLabel id="site-status-label">Status</InputLabel>
                                <Select
                                    labelId="site-status-label"
                                    label="Status"
                                    value={siteFormData.status}
                                    onChange={(e) => setSiteFormData(prev => ({ ...prev, status: e.target.value }))}
                                    renderValue={(value) => (
                                        <Chip
                                            label={value || 'Select status'}
                                            size="small"
                                            sx={{
                                                backgroundColor: getProjectStatusBackgroundColor(value),
                                                color: getProjectStatusTextColor(value),
                                                fontWeight: 700,
                                                height: 22,
                                                '& .MuiChip-label': { px: 0.75, fontSize: '0.75rem' },
                                            }}
                                        />
                                    )}
                                >
                                    <MenuItem value="Not Started">
                                        <Chip
                                            label="Not Started"
                                            size="small"
                                            sx={{
                                                backgroundColor: getProjectStatusBackgroundColor('Not Started'),
                                                color: getProjectStatusTextColor('Not Started'),
                                                fontWeight: 700,
                                                height: 22,
                                                '& .MuiChip-label': { px: 0.75, fontSize: '0.75rem' },
                                            }}
                                        />
                                    </MenuItem>
                                    {/* Ongoing and In Progress mean the same thing; keep one canonical value */}
                                    <MenuItem value="Ongoing">
                                        <Chip
                                            label="Ongoing"
                                            size="small"
                                            sx={{
                                                backgroundColor: getProjectStatusBackgroundColor('Ongoing'),
                                                color: getProjectStatusTextColor('Ongoing'),
                                                fontWeight: 700,
                                                height: 22,
                                                '& .MuiChip-label': { px: 0.75, fontSize: '0.75rem' },
                                            }}
                                        />
                                    </MenuItem>
                                    <MenuItem value="Completed">
                                        <Chip
                                            label="Completed"
                                            size="small"
                                            sx={{
                                                backgroundColor: getProjectStatusBackgroundColor('Completed'),
                                                color: getProjectStatusTextColor('Completed'),
                                                fontWeight: 700,
                                                height: 22,
                                                '& .MuiChip-label': { px: 0.75, fontSize: '0.75rem' },
                                            }}
                                        />
                                    </MenuItem>
                                    <MenuItem value="Stalled">
                                        <Chip
                                            label="Stalled"
                                            size="small"
                                            sx={{
                                                backgroundColor: getProjectStatusBackgroundColor('Stalled'),
                                                color: getProjectStatusTextColor('Stalled'),
                                                fontWeight: 700,
                                                height: 22,
                                                '& .MuiChip-label': { px: 0.75, fontSize: '0.75rem' },
                                            }}
                                        />
                                    </MenuItem>
                                    <MenuItem value="Suspended">
                                        <Chip
                                            label="Suspended"
                                            size="small"
                                            sx={{
                                                backgroundColor: getProjectStatusBackgroundColor('Suspended'),
                                                color: getProjectStatusTextColor('Suspended'),
                                                fontWeight: 700,
                                                height: 22,
                                                '& .MuiChip-label': { px: 0.75, fontSize: '0.75rem' },
                                            }}
                                        />
                                    </MenuItem>
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
                            disabled={!canModifyOrCreateProjects}
                            onClick={async () => {
                                const errors = {};
                                if (!siteFormData.siteName.trim()) {
                                    errors.siteName = 'Site name is required';
                                }
                                setSiteFormErrors(errors);
                                if (Object.keys(errors).length > 0) return;

                                const payload = {
                                    siteName: siteFormData.siteName.trim(),
                                    county: siteFormData.county.trim() || null,
                                    constituency: siteFormData.constituency.trim() || null,
                                    ward: siteFormData.ward.trim() || null,
                                    status: siteFormData.status || null,
                                    progress: siteFormData.progress !== '' ? parseFloat(siteFormData.progress) || null : null,
                                    approvedCost: siteFormData.approvedCost !== '' ? parseFloat(siteFormData.approvedCost) || null : null,
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
                                    await fetchProjectSites(true, true); // Force refresh after save (still limit to 10 for tab)
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

                {activeTab === 99 && (
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

                {activeTab === 7 && (
                    <Box>
                        <ProjectCertificatesTab
                            projectId={projectId}
                            canModify={canModifyOrCreateProjects}
                        />
                    </Box>
                )}

                {activeTab === 8 && (
                    <Box>
                        <ProjectMapEditor projectId={projectId} projectName={project?.projectName || project?.name || 'Project'} />
                    </Box>
                )}

            </Box>

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

            {/* SCOPE_DOWN: payment_requests tables removed. Re-enable when restoring for wider market. */}
            {false && (
                <>
                    <PaymentRequestForm
                        open={openPaymentModal}
                        onClose={() => setOpenPaymentModal(false)}
                        projectId={project?.projectId}
                        projectName={project?.projectName}
                        onSubmit={() => {}}
                        accomplishedActivities={paymentJustification.accomplishedActivities}
                        totalJustifiedAmount={paymentJustification.totalBudget}
                    />
                    <PaymentRequestDocumentUploader
                        open={openDocumentUploader}
                        onClose={handleCloseDocumentUploader}
                        requestId={selectedRequestId}
                        projectId={projectId}
                    />
                </>
            )}

            {/* Project Sites Modal */}
            <ProjectSitesModal
                open={openSitesModal}
                onClose={() => {
                    setOpenSitesModal(false);
                    fetchProjectSites(true, true); // Force refresh after modal closes (still limit to 10 for tab)
                }}
                projectId={projectId}
                projectName={project?.projectName || 'Project'}
                showSiteActions={canModifyOrCreateProjects}
            />

            {/* Import Sites Dialog */}
            <Dialog
                open={openImportSitesDialog}
                onClose={() => {
                    setOpenImportSitesDialog(false);
                    setImportFile(null);
                }}
                maxWidth="sm"
                fullWidth
            >
                <DialogTitle>Import Sites</DialogTitle>
                <DialogContent>
                    <Box sx={{ mt: 2 }}>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                            Download the template, fill it with site data, and upload it here.
                        </Typography>
                        <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
                            <Button
                                variant="outlined"
                                startIcon={<DownloadIcon />}
                                onClick={handleDownloadSitesTemplate}
                                fullWidth
                            >
                                Download Template
                            </Button>
                        </Box>
                        <input
                            type="file"
                            accept=".xlsx,.xls"
                            onChange={(e) => setImportFile(e.target.files[0])}
                            style={{ display: 'none' }}
                            id="import-sites-file-input"
                        />
                        <TextField
                            fullWidth
                            size="small"
                            value={importFile ? importFile.name : ''}
                            placeholder="No file selected"
                            InputProps={{
                                readOnly: true,
                                endAdornment: (
                                    <Button 
                                        component="label" 
                                        htmlFor="import-sites-file-input" 
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
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => {
                        setOpenImportSitesDialog(false);
                        setImportFile(null);
                    }}>
                        Cancel
                    </Button>
                    <Button
                        variant="contained"
                        onClick={handleImportSites}
                        disabled={!importFile || importingSites}
                        startIcon={importingSites ? <CircularProgress size={16} /> : <UploadIcon />}
                    >
                        {importingSites ? 'Importing...' : 'Import Sites'}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Delete Job Confirmation Dialog */}
            <Dialog open={deleteJobConfirmOpen} onClose={() => setDeleteJobConfirmOpen(false)}>
                <DialogTitle>Delete Job Record</DialogTitle>
                <DialogContent>
                    <Typography>
                        Are you sure you want to delete this job record? This action cannot be undone.
                        {jobToDelete && (
                            <Box sx={{ mt: 1, p: 1, bgcolor: 'grey.100', borderRadius: 1 }}>
                                <Typography variant="body2"><strong>Category:</strong> {jobToDelete.category_name || 'Uncategorized'}</Typography>
                                <Typography variant="body2"><strong>Jobs:</strong> {jobToDelete.jobs_count || 0}</Typography>
                            </Box>
                        )}
                    </Typography>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => {
                        setDeleteJobConfirmOpen(false);
                        setJobToDelete(null);
                    }}>
                        Cancel
                    </Button>
                    <Button
                        color="error"
                        variant="contained"
                        onClick={async () => {
                            if (jobToDelete) {
                                try {
                                    await projectService.junctions.deleteProjectJob(projectId, jobToDelete.id);
                                    setSnackbar({
                                        open: true,
                                        message: 'Job record deleted successfully',
                                        severity: 'success',
                                    });
                                    setDeleteJobConfirmOpen(false);
                                    setJobToDelete(null);
                                    fetchProjectJobs();
                                } catch (error) {
                                    console.error('Error deleting project job:', error);
                                    setSnackbar({
                                        open: true,
                                        message: error?.response?.data?.message || 'Failed to delete job record',
                                        severity: 'error',
                                    });
                                }
                            }
                        }}
                    >
                        Delete
                    </Button>
                </DialogActions>
            </Dialog>

            <Snackbar open={snackbar.open} autoHideDuration={6000} onClose={handleCloseSnackbar}>
                <Alert onClose={handleCloseSnackbar} severity={snackbar.severity} sx={{ width: '100%' }}>
                    {snackbar.message}
                </Alert>
            </Snackbar>
        </Box>
    );
}

export default ProjectDetailsPage;