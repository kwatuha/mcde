import React, { useState, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import {
    Box, Typography, Button, Grid, Card, CardMedia, CardContent, CardActions,
    Dialog, DialogTitle, DialogContent, DialogActions, Snackbar, Alert,
    IconButton, Chip, Stack, Tabs, Tab, TextField, MenuItem, Select,
    FormControl, InputLabel, Tooltip, CircularProgress, LinearProgress,
    Divider, Paper, List, ListItem, ListItemText, ListItemIcon
} from '@mui/material';
import {
    CloudUpload as CloudUploadIcon,
    Delete as DeleteIcon,
    Visibility as VisibilityIcon,
    CheckCircle as CheckCircleIcon,
    Cancel as CancelIcon,
    Description as DescriptionIcon,
    Photo as PhotoIcon,
    PictureAsPdf as PdfIcon,
    InsertDriveFile as FileIcon,
    Download as DownloadIcon,
    Edit as EditIcon,
    Public as PublicIcon,
    Lock as LockIcon,
    OutlinedFlag as OutlinedFlagIcon,
    Flag as FlagIcon,
} from '@mui/icons-material';
import { useTheme, alpha } from '@mui/material/styles';
import { tokens } from '../pages/dashboard/theme';
import apiService from '../api';
import { useAuth } from '../context/AuthContext';
import GenericFileUploadModal from './GenericFileUploadModal';
import axiosInstance from '../api/axiosInstance';
import { workflowChipProps, workflowDetailLine } from '../utils/certificateWorkflowDisplay.js';

// Document type options for various project aspects
const documentTypeOptions = [
    { value: 'award_letter', label: 'Award Letter', icon: '📋' },
    { value: 'inspection_certificate', label: 'Inspection Certificate', icon: '🔍' },
    { value: 'evaluation_report', label: 'Evaluation Report', icon: '📊' },
    { value: 'completion_letter', label: 'Completion Letter', icon: '✅' },
    { value: 'warning_letter', label: 'Warning Letter', icon: '⚠️' },
    { value: 'request_for_payment', label: 'Request for Payment', icon: '💳' },
    { value: 'contract_agreement', label: 'Contract Agreement', icon: '📝' },
    { value: 'invoice', label: 'Invoice', icon: '🧾' },
    { value: 'receipt', label: 'Receipt', icon: '📄' },
    { value: 'progress_photo', label: 'Progress Photo', icon: '📸' },
    { value: 'payment_certificate', label: 'Payment Certificate', icon: '📜' },
    { value: 'inspection_attachment', label: 'Inspection attachment', icon: '🔍' },
    { value: 'other', label: 'Other Document', icon: '📎' }
];

function isExternalAttachment(doc) {
    return doc?.sourceKind === 'certificate' || doc?.sourceKind === 'inspection_file';
}

/** Schedule → milestone uploads (project_documents with milestoneId / category milestone). */
function isMilestoneProjectDocument(doc) {
    if (!doc || doc.isPhoto || isExternalAttachment(doc)) return false;
    const cat = String(doc.documentCategory || '').toLowerCase();
    if (cat === 'milestone') return true;
    return doc.milestoneId != null && doc.milestoneId !== '';
}

const DOCUMENT_CATEGORY_ORDER = {
    milestone: 0,
    general: 1,
    payment: 2,
    photos: 3,
    certificates: 4,
    inspection: 5,
};

function formatDocumentCategoryHeading(category) {
    const key = String(category || 'general').toLowerCase();
    const labels = {
        milestone: 'Milestone documents & progress',
        general: 'General documents',
        payment: 'Payment documents',
        photos: 'Photos',
        certificates: 'Certificates',
        inspection: 'Inspection attachments',
    };
    return labels[key] || `${key} documents`;
}

function isDocFlagged(doc) {
    if (!doc || doc.isPhoto || isExternalAttachment(doc)) return false;
    const v = doc.isFlagged ?? doc.isflagged;
    return v === true || v === 1 || String(v).toLowerCase() === 'true';
}

const ProjectDocumentsAttachments = ({ projectId }) => {
    const theme = useTheme();
    const colors = tokens(theme.palette.mode);
    const { user, hasPrivilege } = useAuth();
    const serverUrl = import.meta.env.VITE_API_BASE_URL || '';

    const [documents, setDocuments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [activeTab, setActiveTab] = useState(0); // 0: All, 1: Documents, 2: Photos, 3: Public Approved
    const [openUploadModal, setOpenUploadModal] = useState(false);
    const [openPreview, setOpenPreview] = useState(false);
    const [previewDocument, setPreviewDocument] = useState(null);
    const [openApprovalDialog, setOpenApprovalDialog] = useState(false);
    const [approvalDocument, setApprovalDocument] = useState(null);
    const [approvalNotes, setApprovalNotes] = useState('');
    const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });

    const fetchDocuments = useCallback(async () => {
        if (!projectId) return;
        setLoading(true);
        try {
            // Fetch both documents and photos
            const [documentsData, photosResponse, certificatesData, inspectionsData] = await Promise.all([
                apiService.documents.getProjectDocuments(projectId).catch(err => {
                    console.error('Error fetching documents:', err);
                    return [];
                }),
                axiosInstance.get(`/projects/${projectId}/photos`).catch(err => {
                    console.error('Error fetching photos:', err);
                    return { data: [] };
                }),
                apiService.certificates.getByProject(projectId).catch((err) => {
                    console.error('Error fetching certificates:', err);
                    return [];
                }),
                apiService.inspections.getProjectInspections(projectId).catch((err) => {
                    console.error('Error fetching inspections:', err);
                    return [];
                }),
            ]);
            
            const documents = documentsData || [];
            const photos = photosResponse.data || [];
            const certRows = Array.isArray(certificatesData) ? certificatesData : [];
            const inspectionRows = Array.isArray(inspectionsData) ? inspectionsData : [];
            
            // Convert photos to document-like format for unified display
            const photosAsDocuments = photos.map(photo => ({
                id: `photo_${photo.photoId}`, // Unique ID to avoid conflicts
                photoId: photo.photoId,
                projectId: photo.projectId,
                documentType: 'progress_photo',
                documentCategory: 'photos',
                documentPath: photo.filePath,
                originalFileName: photo.fileName || photo.description || 'Photo',
                description: photo.description || '',
                approved_for_public: photo.approved_for_public || 0,
                approved_by: photo.approved_by,
                approved_at: photo.approved_at,
                approval_notes: photo.approval_notes,
                createdAt: photo.createdAt,
                updatedAt: photo.updatedAt,
                isPhoto: true, // Flag to identify photos
                sourceKind: 'photo',
            }));

            const certificatesAsDocuments = certRows
                .map((cert) => {
                    const certificateId = cert.certificateId ?? cert.certificateid;
                    const filePath = cert.path ?? cert.filePath ?? cert.filepath;
                    const fileName = cert.fileName ?? cert.filename;
                    const parts = [cert.certType, cert.certNumber].filter(Boolean);
                    return {
                        id: `cert_${certificateId}`,
                        certificateId,
                        projectId: cert.projectId ?? cert.projectid ?? projectId,
                        documentType: 'payment_certificate',
                        documentCategory: 'certificates',
                        documentPath: filePath,
                        originalFileName: fileName || parts.join(' · ') || `certificate-${certificateId}`,
                        description: parts.length ? parts.join(' · ') : 'Project certificate',
                        createdAt: cert.requestDate ?? cert.requestdate ?? cert.createdAt,
                        isPhoto: false,
                        sourceKind: 'certificate',
                        approved_for_public: 0,
                        approvalWorkflowStatus: cert.approvalWorkflowStatus ?? cert.approval_workflow_status,
                        approvalRequestId: cert.approvalRequestId ?? cert.approval_request_id,
                        approvalCurrentStepName: cert.approvalCurrentStepName ?? cert.approval_current_step_name,
                        approvalCurrentStepOrder: cert.approvalCurrentStepOrder ?? cert.approval_current_step_order,
                        approvalTotalSteps: cert.approvalTotalSteps ?? cert.approval_total_steps,
                        applicationStatus: cert.applicationStatus ?? cert.applicationstatus,
                    };
                })
                .filter((d) => d.certificateId != null && d.documentPath);

            const inspectionFilesAsDocuments = [];
            for (const insp of inspectionRows) {
                const inspectionId = insp.inspectionId ?? insp.inspectionid;
                const files = Array.isArray(insp.files) ? insp.files : [];
                const dateLabel = insp.inspectionDate ?? insp.inspectiondate;
                for (const f of files) {
                    const fileId = f.fileId ?? f.fileid;
                    const filePath = f.filePath ?? f.filepath;
                    if (fileId == null || !filePath) continue;
                    const isPhotoCat = String(f.fileCategory || f.filecategory || '').toLowerCase() === 'photo';
                    inspectionFilesAsDocuments.push({
                        id: `inspfile_${fileId}`,
                        inspectionFileId: fileId,
                        inspectionId,
                        projectId: insp.projectId ?? insp.projectid ?? projectId,
                        documentType: isPhotoCat ? 'progress_photo' : 'inspection_attachment',
                        documentCategory: 'inspection',
                        documentPath: filePath,
                        originalFileName: f.fileName ?? f.filename ?? `inspection-${fileId}`,
                        description: dateLabel
                            ? `Inspection ${dateLabel}${f.fileCategory ? ` · ${f.fileCategory}` : ''}`
                            : 'Inspection attachment',
                        createdAt: f.createdAt ?? f.createdat,
                        isPhoto: isPhotoCat,
                        sourceKind: 'inspection_file',
                        approved_for_public: 0,
                    });
                }
            }
            
            // Merge project documents, progress photos, certificates, and inspection files
            const allItems = [...documents, ...photosAsDocuments, ...certificatesAsDocuments, ...inspectionFilesAsDocuments];
            setDocuments(allItems);
        } catch (error) {
            console.error('Error fetching documents and photos:', error);
            setSnackbar({ 
                open: true, 
                message: 'Failed to load documents and photos', 
                severity: 'error' 
            });
        } finally {
            setLoading(false);
        }
    }, [projectId]);

    useEffect(() => {
        fetchDocuments();
    }, [fetchDocuments]);


    const handleToggleFlag = async (doc) => {
        if (doc.isPhoto || isExternalAttachment(doc) || !doc.id) return;
        if (!hasPrivilege('document.update')) {
            setSnackbar({ open: true, message: 'Permission denied', severity: 'error' });
            return;
        }
        const next = !isDocFlagged(doc);
        try {
            await apiService.documents.updateDocument(doc.id, { isFlagged: next });
            setSnackbar({
                open: true,
                message: next ? 'Flagged for follow-up.' : 'Flag cleared.',
                severity: 'success',
            });
            fetchDocuments();
        } catch (err) {
            const msg = err.response?.data?.message || err.message || 'Failed to update flag';
            setSnackbar({ open: true, message: msg, severity: 'error' });
        }
    };

    const handleDelete = async (doc) => {
        if (isExternalAttachment(doc)) {
            setSnackbar({
                open: true,
                message: 'Certificates and inspection files are managed from their tabs on the project page.',
                severity: 'info',
            });
            return;
        }
        if (!hasPrivilege('document.delete')) {
            setSnackbar({ 
                open: true, 
                message: 'Permission denied', 
                severity: 'error' 
            });
            return;
        }
        const isProgressPhoto = doc.sourceKind === 'photo' && doc.photoId != null;
        const kindLabel = isProgressPhoto ? 'photo' : 'document';
        if (!window.confirm(`Are you sure you want to delete this ${kindLabel}?`)) return;

        try {
            if (isProgressPhoto) {
                await axiosInstance.delete(`/project_photos/${doc.photoId}`);
            } else {
                await apiService.documents.deleteDocument(doc.id);
            }
            setSnackbar({ 
                open: true, 
                message: `${isProgressPhoto ? 'Photo' : 'Document'} deleted successfully`, 
                severity: 'success' 
            });
            fetchDocuments();
        } catch (error) {
            setSnackbar({ 
                open: true, 
                message: error.response?.data?.message || `Failed to delete ${kindLabel}`, 
                severity: 'error' 
            });
        }
    };

    const handlePreview = (document) => {
        setPreviewDocument(document);
        setOpenPreview(true);
    };

    const handleDownload = async (doc) => {
        if (doc.sourceKind === 'certificate' && doc.certificateId != null) {
            try {
                const blob = await apiService.certificates.download(doc.certificateId);
                const url = window.URL.createObjectURL(blob);
                const link = document.createElement('a');
                const fallbackName = `certificate-${doc.certificateId}`;
                link.href = url;
                link.download = doc.originalFileName || doc.description || fallbackName;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                window.URL.revokeObjectURL(url);
                setSnackbar({ open: true, message: 'File downloaded successfully', severity: 'success' });
            } catch (error) {
                console.error('Error downloading certificate:', error);
                setSnackbar({
                    open: true,
                    message: error.response?.data?.message || error.message || 'Failed to download certificate.',
                    severity: 'error',
                });
            }
            return;
        }

        try {
            // Use documentPath for documents, filePath for photos
            const filePath = doc.documentPath || doc.filePath;
            const fileUrl = getFileUrl(filePath);
            
            console.log('Download attempt:', {
                docId: doc.id,
                filePath: filePath,
                fileUrl: fileUrl,
                isPhoto: doc.isPhoto
            });
            
            // Get file name with extension
            let fileName = doc.originalFileName || doc.fileName || doc.description || 'download';
            
            // If fileName doesn't have extension, try to get it from filePath
            if (!fileName.includes('.')) {
                const pathParts = (filePath || '').split('/');
                const pathFileName = pathParts[pathParts.length - 1];
                if (pathFileName && pathFileName.includes('.')) {
                    fileName = pathFileName;
                } else {
                    // Try to determine extension from file type or path
                    const extension = (filePath || '').match(/\.([^.]+)$/);
                    if (extension) {
                        fileName = `${fileName}${extension[0]}`;
                    }
                }
            }
            
            // Static /uploads is not behind JWT; omit credentials so CORS works with Allow-Origin: *
            // (browsers block credentialed fetches when the server responds with *).
            const fetchOptions = {
                method: 'GET',
                credentials: 'omit',
                mode: 'cors',
            };

            const response = await fetch(fileUrl, fetchOptions);
            console.log('Download response:', {
                status: response.status,
                statusText: response.statusText,
                ok: response.ok,
                url: fileUrl,
                headers: Object.fromEntries(response.headers.entries())
            });
            
            if (!response.ok) {
                // Try to get more details about the error
                let errorMessage = `Failed to download file: ${response.status} ${response.statusText}`;
                try {
                    const errorText = await response.text();
                    if (errorText) {
                        errorMessage += ` - ${errorText}`;
                    }
                } catch (e) {
                    // Ignore if we can't read error text
                }
                throw new Error(errorMessage);
            }
            
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = fileName;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);
            
            setSnackbar({ 
                open: true, 
                message: 'File downloaded successfully', 
                severity: 'success' 
            });
        } catch (error) {
            console.error('Error downloading file:', error);
            setSnackbar({ 
                open: true, 
                message: error.message || 'Failed to download file. Please try again.', 
                severity: 'error' 
            });
        }
    };

    const handleOpenApprovalDialog = (document) => {
        setApprovalDocument(document);
        setApprovalNotes(document.approval_notes || '');
        setOpenApprovalDialog(true);
    };

    const handleApproval = async (approved) => {
        if (!hasPrivilege('public_content.approve')) {
            setSnackbar({ 
                open: true, 
                message: 'Permission denied', 
                severity: 'error' 
            });
            return;
        }
        if (isExternalAttachment(approvalDocument)) {
            setSnackbar({
                open: true,
                message: 'Public approval applies to project documents and progress photos only.',
                severity: 'info',
            });
            return;
        }

        try {
            const isPhoto = approvalDocument.sourceKind === 'photo' && approvalDocument.photoId != null;
            const approvalData = {
                approved_for_public: approved,
                approval_notes: approvalNotes,
                approved_by: user?.userId,
                approved_at: new Date().toISOString()
            };
            
            if (isPhoto) {
                // Update photo approval
                await axiosInstance.put(`/project_photos/${approvalDocument.photoId}/approval`, approvalData);
            } else {
                // Update document approval
                await apiService.documents.updateDocumentApproval(approvalDocument.id, approvalData);
            }
            setSnackbar({ 
                open: true, 
                message: `${isPhoto ? 'Photo' : 'Document'} ${approved ? 'approved' : 'revoked'} for public viewing`, 
                severity: 'success' 
            });
            setOpenApprovalDialog(false);
            fetchDocuments();
        } catch (error) {
            setSnackbar({ 
                open: true, 
                message: error.response?.data?.error || 'Failed to update approval status', 
                severity: 'error' 
            });
        }
    };

    const getFileIcon = (documentType, filePath) => {
        const isPhoto = documentType === 'photo' || documentType === 'progress_photo' || 
                       /\.(jpg|jpeg|png|gif|webp)$/i.test(filePath);
        if (isPhoto) return <PhotoIcon />;
        if (/\.pdf$/i.test(filePath)) return <PdfIcon />;
        return <FileIcon />;
    };

    const isImageFile = (filePath) => {
        return /\.(jpg|jpeg|png|gif|webp)$/i.test(filePath);
    };

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

    const getFileUrl = (filePath) => {
        if (!filePath) return '';
        
        // Handle different path formats (similar to PublicApprovalManagementPage)
        if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
            return filePath; // Already a full URL
        }
        
        const apiBaseUrl = getApiBaseUrl();
        let fileUrl = filePath;
        
        // Documents are stored with path like "uploads/projects/123/general/file.pdf" (relative from project root)
        // OR might be "api/uploads/projects/123/general/file.pdf" if project root is parent of api
        // Photos are stored with path like "project-photos/file.jpg" (relative from uploads directory)
        // API serves static files at /uploads, so paths need to start with /uploads/
        
        // Remove "api/" prefix if present (some paths might include it)
        if (fileUrl.startsWith('api/')) {
            fileUrl = fileUrl.substring(4); // Remove "api/" prefix
        }
        
        if (fileUrl.startsWith('/uploads/')) {
            // Already has /uploads/ prefix with leading slash
            fileUrl = `${apiBaseUrl}${fileUrl}`;
        } else if (fileUrl.startsWith('uploads/')) {
            // Has uploads/ prefix but missing leading slash (documents from project details)
            // Convert: uploads/projects/123/general/file.pdf -> /uploads/projects/123/general/file.pdf
            fileUrl = `${apiBaseUrl}/${fileUrl}`;
        } else if (fileUrl.startsWith('/')) {
            // Absolute path from root (shouldn't happen, but handle it)
            fileUrl = `${apiBaseUrl}${fileUrl}`;
        } else {
            // Relative path (photos from public approval like "project-photos/file.jpg")
            // Add /uploads/ prefix: project-photos/file.jpg -> /uploads/project-photos/file.jpg
            fileUrl = `${apiBaseUrl}/uploads/${fileUrl}`;
        }
        
        // Debug logging
        console.log('File URL construction:', {
            originalPath: filePath,
            constructedUrl: fileUrl,
            apiBaseUrl: apiBaseUrl,
            startsWithUploads: filePath?.startsWith('uploads/'),
            startsWithSlashUploads: filePath?.startsWith('/uploads/'),
            startsWithApi: filePath?.startsWith('api/')
        });
        
        return fileUrl;
    };

    const filteredDocuments = () => {
        switch (activeTab) {
            case 1: // Documents only
                return documents.filter(doc => {
                    const filePath = doc.documentPath || doc.filePath;
                    return doc.documentType !== 'photo' && 
                           doc.documentType !== 'progress_photo' &&
                           !isImageFile(filePath);
                });
            case 2: // Photos only
                return documents.filter(doc => {
                    const filePath = doc.documentPath || doc.filePath;
                    return (doc.documentType === 'photo' || doc.documentType === 'progress_photo') ||
                           isImageFile(filePath);
                });
            case 3: // Public approved
                return documents.filter(doc => doc.approved_for_public === 1);
            case 4: // Flagged (non-photo project documents)
                return documents.filter((doc) => !doc.isPhoto && isDocFlagged(doc));
            default: // All
                return documents;
        }
    };

    const groupedDocuments = () => {
        const filtered = filteredDocuments();
        const groups = {};
        filtered.forEach(doc => {
            const category = doc.documentCategory || 'general';
            if (!groups[category]) groups[category] = [];
            groups[category].push(doc);
        });
        return Object.entries(groups).sort(([a], [b]) => {
            const ao = DOCUMENT_CATEGORY_ORDER[String(a).toLowerCase()] ?? 100;
            const bo = DOCUMENT_CATEGORY_ORDER[String(b).toLowerCase()] ?? 100;
            if (ao !== bo) return ao - bo;
            return String(a).localeCompare(String(b));
        });
    };

    if (loading) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
                <CircularProgress />
            </Box>
        );
    }

    return (
        <Box>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
                <Box>
                    <Typography variant="h6" sx={{ 
                        fontWeight: 'bold',
                        color: theme.palette.mode === 'dark' ? colors.blueAccent[500] : colors.blueAccent[600]
                    }}>
                        Project Documents & Attachments
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, maxWidth: 720 }}>
                        Files uploaded under Schedule → Milestone Documents &amp; Progress also appear here under
                        &quot;Milestone documents &amp; progress&quot;, with status and progress when recorded.
                    </Typography>
                </Box>
                {hasPrivilege('document.create') && (
                    <Button
                        variant="contained"
                        startIcon={<CloudUploadIcon />}
                        onClick={() => setOpenUploadModal(true)}
                        sx={{
                            backgroundColor: colors.greenAccent[600],
                            '&:hover': { backgroundColor: colors.greenAccent[700] }
                        }}
                    >
                        Upload Files
                    </Button>
                )}
            </Stack>

            <Tabs value={activeTab} onChange={(e, newValue) => setActiveTab(newValue)} sx={{ mb: 3 }} variant="scrollable" scrollButtons="auto">
                <Tab label={`All (${documents.length})`} />
                <Tab label={`Documents (${documents.filter(d => {
                    const filePath = d.documentPath || d.filePath;
                    return d.documentType !== 'photo' && d.documentType !== 'progress_photo' && !isImageFile(filePath);
                }).length})`} />
                <Tab label={`Photos (${documents.filter(d => {
                    const filePath = d.documentPath || d.filePath;
                    return (d.documentType === 'photo' || d.documentType === 'progress_photo') || isImageFile(filePath);
                }).length})`} />
                <Tab label={`Public Approved (${documents.filter(d => d.approved_for_public === 1).length})`} />
                <Tab label={`Flagged (${documents.filter((d) => !d.isPhoto && isDocFlagged(d)).length})`} />
            </Tabs>

            {filteredDocuments().length === 0 ? (
                <Paper sx={{ p: 4, textAlign: 'center' }}>
                    <DescriptionIcon sx={{ fontSize: 64, color: colors.grey[400], mb: 2 }} />
                    <Typography variant="h6" color="text.secondary">
                        No {activeTab === 1 ? 'documents' : activeTab === 2 ? 'photos' : activeTab === 3 ? 'approved items' : activeTab === 4 ? 'flagged items' : 'files'} found
                    </Typography>
                </Paper>
            ) : (
                groupedDocuments().map(([category, categoryDocs]) => (
                    <Box key={category} sx={{ mb: 4 }}>
                        <Typography variant="h6" sx={{ 
                            mb: 2, 
                            fontWeight: 'bold',
                            color: theme.palette.mode === 'dark' ? colors.blueAccent[400] : colors.blueAccent[600]
                        }}>
                            {formatDocumentCategoryHeading(category)} ({categoryDocs.length})
                        </Typography>
                        <Grid container spacing={3}>
                            {categoryDocs.map((doc) => {
                                const filePath = doc.documentPath || doc.filePath;
                                const isImage = isImageFile(filePath);
                                const fileUrl = getFileUrl(filePath);
                                const docType = documentTypeOptions.find(opt => opt.value === doc.documentType);
                                const flagged = isDocFlagged(doc);

                                return (
                                    <Grid item xs={12} sm={6} md={4} lg={3} key={doc.id}>
                                        <Card sx={{ 
                                            height: '100%', 
                                            display: 'flex', 
                                            flexDirection: 'column',
                                            border: doc.approved_for_public ? `2px solid ${colors.greenAccent[500]}` : '1px solid',
                                            borderColor: 'divider',
                                            ...(flagged && !doc.isPhoto
                                                ? {
                                                      borderLeft: '4px solid',
                                                      borderLeftColor: 'warning.main',
                                                  }
                                                : {}),
                                        }}>
                                            {isImage ? (
                                                <CardMedia
                                                    component="img"
                                                    height="200"
                                                    image={fileUrl}
                                                    alt={doc.description || doc.originalFileName}
                                                    sx={{ objectFit: 'cover', cursor: 'pointer' }}
                                                    onClick={() => handlePreview(doc)}
                                                />
                                            ) : (
                                                <Box sx={{ 
                                                    height: 200, 
                                                    display: 'flex', 
                                                    alignItems: 'center', 
                                                    justifyContent: 'center',
                                                    // tokens('light').grey[100] is near-black — use theme neutrals for light mode
                                                    backgroundColor: theme.palette.mode === 'dark'
                                                        ? colors.primary[600]
                                                        : alpha(theme.palette.common.black, 0.06),
                                                    borderBottom: '1px solid',
                                                    borderColor: 'divider',
                                                    cursor: 'pointer',
                                                    '& .MuiSvgIcon-root': {
                                                        fontSize: 64,
                                                        color: theme.palette.mode === 'dark'
                                                            ? alpha(theme.palette.common.white, 0.85)
                                                            : theme.palette.grey[700],
                                                    },
                                                }}
                                                onClick={() => handlePreview(doc)}
                                                >
                                                    {getFileIcon(doc.documentType, filePath)}
                                                </Box>
                                            )}
                                            <CardContent sx={{ flexGrow: 1 }}>
                                                <Typography variant="subtitle2" noWrap sx={{ fontWeight: 'bold', mb: 1 }}>
                                                    {doc.originalFileName || doc.description || 'Untitled'}
                                                </Typography>
                                                <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
                                                    {docType?.label || doc.documentType}
                                                </Typography>
                                                {doc.description && (
                                                    <Typography variant="body2" color="text.secondary" sx={{ 
                                                        overflow: 'hidden',
                                                        textOverflow: 'ellipsis',
                                                        display: '-webkit-box',
                                                        WebkitLineClamp: 2,
                                                        WebkitBoxOrient: 'vertical'
                                                    }}>
                                                        {doc.description}
                                                    </Typography>
                                                )}
                                                {isMilestoneProjectDocument(doc) && (
                                                    <Stack direction="row" spacing={0.5} sx={{ mt: 1 }} flexWrap="wrap" useFlexGap>
                                                        {(doc.milestoneDisplayName || doc.milestoneName) && (
                                                            <Chip
                                                                size="small"
                                                                variant="outlined"
                                                                color="secondary"
                                                                label={doc.milestoneDisplayName || doc.milestoneName}
                                                            />
                                                        )}
                                                        {doc.status && (
                                                            <Chip
                                                                size="small"
                                                                label={String(doc.status).replace(/_/g, ' ')}
                                                                color={doc.status === 'completed' ? 'success' : 'default'}
                                                            />
                                                        )}
                                                        {doc.progressPercentage != null &&
                                                            doc.progressPercentage !== '' && (
                                                                <Chip
                                                                    size="small"
                                                                    variant="outlined"
                                                                    label={`${doc.progressPercentage}% progress`}
                                                                />
                                                            )}
                                                    </Stack>
                                                )}
                                                <Stack direction="row" spacing={1} sx={{ mt: 1 }} flexWrap="wrap" useFlexGap>
                                                    {flagged && !doc.isPhoto && (
                                                        <Chip
                                                            icon={<FlagIcon />}
                                                            label="Flagged"
                                                            size="small"
                                                            color="warning"
                                                            variant="filled"
                                                        />
                                                    )}
                                                    {doc.sourceKind === 'certificate' ? (
                                                        <>
                                                            <Tooltip title={workflowDetailLine(doc)}>
                                                                <Chip size="small" variant="outlined" {...workflowChipProps(doc)} />
                                                            </Tooltip>
                                                            {(() => {
                                                                const w = String(
                                                                    doc.approvalWorkflowStatus ?? doc.approval_workflow_status ?? ''
                                                                ).toLowerCase();
                                                                if (w !== 'pending') return null;
                                                                const total =
                                                                    Number(doc.approvalTotalSteps ?? doc.approval_total_steps) || 0;
                                                                const ordRaw =
                                                                    doc.approvalCurrentStepOrder ?? doc.approval_current_step_order;
                                                                const ord = ordRaw != null ? Number(ordRaw) : null;
                                                                const stepName = String(
                                                                    doc.approvalCurrentStepName ??
                                                                        doc.approval_current_step_name ??
                                                                        ''
                                                                ).trim();
                                                                if (total > 0 && ord != null && !Number.isNaN(ord)) {
                                                                    const stepLabel = `Step ${ord} / ${total}`;
                                                                    return (
                                                                        <Tooltip
                                                                            title={
                                                                                stepName ||
                                                                                'Current approval step in the payment certificate workflow.'
                                                                            }
                                                                        >
                                                                            <Chip
                                                                                size="small"
                                                                                variant="outlined"
                                                                                color="info"
                                                                                label={stepLabel}
                                                                            />
                                                                        </Tooltip>
                                                                    );
                                                                }
                                                                return (
                                                                    <Chip
                                                                        size="small"
                                                                        variant="outlined"
                                                                        color="warning"
                                                                        label="Awaiting review"
                                                                    />
                                                                );
                                                            })()}
                                                        </>
                                                    ) : doc.approved_for_public ? (
                                                        <Chip 
                                                            icon={<PublicIcon />} 
                                                            label="Public" 
                                                            size="small" 
                                                            color="success"
                                                        />
                                                    ) : (
                                                        <Chip 
                                                            icon={<LockIcon />} 
                                                            label="Private" 
                                                            size="small" 
                                                            color="default"
                                                        />
                                                    )}
                                                </Stack>
                                            </CardContent>
                                            <CardActions>
                                                <Tooltip title="Preview">
                                                    <IconButton size="small" onClick={() => handlePreview(doc)}>
                                                        <VisibilityIcon />
                                                    </IconButton>
                                                </Tooltip>
                                                <Tooltip title="Download">
                                                    <IconButton 
                                                        size="small" 
                                                        onClick={() => handleDownload(doc)}
                                                        color="primary"
                                                    >
                                                        <DownloadIcon />
                                                    </IconButton>
                                                </Tooltip>
                                                {hasPrivilege('public_content.approve') && !isExternalAttachment(doc) && (
                                                    <Tooltip title={doc.approved_for_public ? "Revoke Approval" : "Approve for Public"}>
                                                        <IconButton 
                                                            size="small" 
                                                            onClick={() => handleOpenApprovalDialog(doc)}
                                                            color={doc.approved_for_public ? "warning" : "success"}
                                                        >
                                                            {doc.approved_for_public ? <CancelIcon /> : <CheckCircleIcon />}
                                                        </IconButton>
                                                    </Tooltip>
                                                )}
                                                {!doc.isPhoto && !isExternalAttachment(doc) && hasPrivilege('document.update') && (
                                                    <Tooltip title={flagged ? 'Clear follow-up flag' : 'Flag for follow-up'}>
                                                        <IconButton
                                                            size="small"
                                                            color={flagged ? 'warning' : 'default'}
                                                            onClick={() => handleToggleFlag(doc)}
                                                        >
                                                            {flagged ? <FlagIcon /> : <OutlinedFlagIcon />}
                                                        </IconButton>
                                                    </Tooltip>
                                                )}
                                                {hasPrivilege('document.delete') && !isExternalAttachment(doc) && (
                                                    <Tooltip title="Delete">
                                                        <IconButton 
                                                            size="small" 
                                                            color="error" 
                                                            onClick={() => handleDelete(doc)}
                                                        >
                                                            <DeleteIcon />
                                                        </IconButton>
                                                    </Tooltip>
                                                )}
                                            </CardActions>
                                        </Card>
                                    </Grid>
                                );
                            })}
                        </Grid>
                    </Box>
                ))
            )}

            {/* Upload Modal */}
            <GenericFileUploadModal
                open={openUploadModal}
                onClose={() => {
                    setOpenUploadModal(false);
                    fetchDocuments(); // Refresh documents when modal closes
                }}
                title="Upload Project Documents & Photos"
                uploadConfig={{
                    options: documentTypeOptions,
                    optionsLabel: "Document Type",
                    apiCallKey: "documentType",
                    followUpFlag: {
                        documentTypeValues: ['warning_letter'],
                        formFieldName: 'isFlagged',
                        label: 'Flag this warning letter for compliance follow-up (listed under Flagged)',
                        defaultChecked: true,
                    },
                    description: {
                        label: 'Description (Optional)',
                        placeholder: 'Add a description for this document or photo...'
                    }
                }}
                submitFunction={async (formData) => {
                    // Ensure all required fields are present
                    if (!formData.has('projectId')) {
                        formData.append('projectId', projectId);
                    }
                    if (!formData.has('documentCategory')) {
                        formData.append('documentCategory', 'general');
                    }
                    if (!formData.has('status')) {
                        formData.append('status', 'pending_review');
                    }
                    const result = await apiService.documents.uploadDocument(formData);
                    // Refresh documents after successful upload
                    setTimeout(() => {
                        fetchDocuments();
                        setSnackbar({ 
                            open: true, 
                            message: 'Files uploaded successfully!', 
                            severity: 'success' 
                        });
                    }, 500);
                    return result;
                }}
                additionalFormData={{
                    projectId,
                    documentCategory: 'general',
                    status: 'pending_review'
                }}
            />

            {/* Preview Dialog */}
            <Dialog 
                open={openPreview} 
                onClose={() => setOpenPreview(false)} 
                maxWidth="lg" 
                fullWidth
            >
                <DialogTitle>
                    {previewDocument?.originalFileName || previewDocument?.description || 'Preview'}
                    <IconButton
                        aria-label="close"
                        onClick={() => setOpenPreview(false)}
                        sx={{ position: 'absolute', right: 8, top: 8 }}
                    >
                        <CancelIcon />
                    </IconButton>
                </DialogTitle>
                <DialogContent>
                    {previewDocument && (
                        <Box>
                            {isImageFile(previewDocument.documentPath || previewDocument.filePath) ? (
                                <img 
                                    src={getFileUrl(previewDocument.documentPath || previewDocument.filePath)} 
                                    alt={previewDocument.description}
                                    style={{ width: '100%', height: 'auto', maxHeight: '70vh', objectFit: 'contain' }}
                                />
                            ) : (
                                <Box sx={{ textAlign: 'center', p: 4 }}>
                                    <FileIcon sx={{ fontSize: 64, color: colors.grey[400], mb: 2 }} />
                                    <Typography variant="h6" gutterBottom>
                                        {previewDocument.originalFileName || 'Document'}
                                    </Typography>
                                    <Button
                                        variant="contained"
                                        startIcon={<DownloadIcon />}
                                        onClick={() => handleDownload(previewDocument)}
                                        sx={{ mt: 2 }}
                                    >
                                        Download Document
                                    </Button>
                                </Box>
                            )}
                            {previewDocument.description && (
                                <Box sx={{ mt: 2 }}>
                                    <Typography variant="subtitle2" gutterBottom>Description:</Typography>
                                    <Typography variant="body2">{previewDocument.description}</Typography>
                                </Box>
                            )}
                        </Box>
                    )}
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setOpenPreview(false)}>Close</Button>
                </DialogActions>
            </Dialog>

            {/* Approval Dialog */}
            <Dialog open={openApprovalDialog} onClose={() => setOpenApprovalDialog(false)}>
                <DialogTitle>
                    {approvalDocument?.approved_for_public ? 'Revoke Public Approval' : 'Approve for Public Viewing'}
                </DialogTitle>
                <DialogContent>
                    <TextField
                        fullWidth
                        multiline
                        rows={4}
                        label="Approval Notes"
                        value={approvalNotes}
                        onChange={(e) => setApprovalNotes(e.target.value)}
                        sx={{ mt: 2 }}
                        placeholder="Add notes about this approval decision..."
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setOpenApprovalDialog(false)}>Cancel</Button>
                    <Button 
                        onClick={() => handleApproval(!approvalDocument?.approved_for_public)}
                        variant="contained"
                        color={approvalDocument?.approved_for_public ? "warning" : "success"}
                    >
                        {approvalDocument?.approved_for_public ? 'Revoke' : 'Approve'}
                    </Button>
                </DialogActions>
            </Dialog>

            <Snackbar 
                open={snackbar.open} 
                autoHideDuration={6000} 
                onClose={() => setSnackbar({ ...snackbar, open: false })}
            >
                <Alert onClose={() => setSnackbar({ ...snackbar, open: false })} severity={snackbar.severity}>
                    {snackbar.message}
                </Alert>
            </Snackbar>
        </Box>
    );
};

ProjectDocumentsAttachments.propTypes = {
    projectId: PropTypes.oneOfType([PropTypes.number, PropTypes.string]).isRequired
};

export default ProjectDocumentsAttachments;

