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
    Lock as LockIcon
} from '@mui/icons-material';
import { useTheme } from '@mui/material/styles';
import { tokens } from '../pages/dashboard/theme';
import apiService from '../api';
import { useAuth } from '../context/AuthContext';
import GenericFileUploadModal from './GenericFileUploadModal';
import axiosInstance from '../api/axiosInstance';

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
    { value: 'other', label: 'Other Document', icon: '📎' }
];

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
            const [documentsData, photosResponse] = await Promise.all([
                apiService.documents.getProjectDocuments(projectId).catch(err => {
                    console.error('Error fetching documents:', err);
                    return [];
                }),
                axiosInstance.get(`/projects/${projectId}/photos`).catch(err => {
                    console.error('Error fetching photos:', err);
                    return { data: [] };
                })
            ]);
            
            const documents = documentsData || [];
            const photos = photosResponse.data || [];
            
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
                isPhoto: true // Flag to identify photos
            }));
            
            // Merge documents and photos
            const allItems = [...documents, ...photosAsDocuments];
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


    const handleDelete = async (documentId, isPhoto = false) => {
        if (!hasPrivilege('document.delete')) {
            setSnackbar({ 
                open: true, 
                message: 'Permission denied', 
                severity: 'error' 
            });
            return;
        }
        if (!window.confirm(`Are you sure you want to delete this ${isPhoto ? 'photo' : 'document'}?`)) return;

        try {
            if (isPhoto) {
                // Delete photo from photos endpoint
                await axiosInstance.delete(`/project_photos/${documentId}`);
            } else {
                // Delete document from documents endpoint
                await apiService.documents.deleteDocument(documentId);
            }
            setSnackbar({ 
                open: true, 
                message: `${isPhoto ? 'Photo' : 'Document'} deleted successfully`, 
                severity: 'success' 
            });
            fetchDocuments();
        } catch (error) {
            setSnackbar({ 
                open: true, 
                message: error.response?.data?.message || `Failed to delete ${isPhoto ? 'photo' : 'document'}`, 
                severity: 'error' 
            });
        }
    };

    const handlePreview = (document) => {
        setPreviewDocument(document);
        setOpenPreview(true);
    };

    const handleDownload = async (doc) => {
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
            
            // For cross-origin requests, we need to fetch the file and create a blob
            // Try with credentials if needed
            const fetchOptions = {
                method: 'GET',
                credentials: 'include', // Include cookies for authenticated requests
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

        try {
            const isPhoto = approvalDocument.isPhoto || approvalDocument.photoId;
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
        return groups;
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
                <Typography variant="h6" sx={{ 
                    fontWeight: 'bold',
                    color: theme.palette.mode === 'dark' ? colors.blueAccent[500] : colors.blueAccent[600]
                }}>
                    Project Documents & Attachments
                </Typography>
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

            <Tabs value={activeTab} onChange={(e, newValue) => setActiveTab(newValue)} sx={{ mb: 3 }}>
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
            </Tabs>

            {filteredDocuments().length === 0 ? (
                <Paper sx={{ p: 4, textAlign: 'center' }}>
                    <DescriptionIcon sx={{ fontSize: 64, color: colors.grey[400], mb: 2 }} />
                    <Typography variant="h6" color="text.secondary">
                        No {activeTab === 1 ? 'documents' : activeTab === 2 ? 'photos' : activeTab === 3 ? 'approved items' : 'files'} found
                    </Typography>
                </Paper>
            ) : (
                Object.entries(groupedDocuments()).map(([category, categoryDocs]) => (
                    <Box key={category} sx={{ mb: 4 }}>
                        <Typography variant="h6" sx={{ 
                            mb: 2, 
                            textTransform: 'capitalize',
                            fontWeight: 'bold',
                            color: theme.palette.mode === 'dark' ? colors.blueAccent[400] : colors.blueAccent[600]
                        }}>
                            {category} Documents ({categoryDocs.length})
                        </Typography>
                        <Grid container spacing={3}>
                            {categoryDocs.map((doc) => {
                                const filePath = doc.documentPath || doc.filePath;
                                const isImage = isImageFile(filePath);
                                const fileUrl = getFileUrl(filePath);
                                const docType = documentTypeOptions.find(opt => opt.value === doc.documentType);

                                return (
                                    <Grid item xs={12} sm={6} md={4} lg={3} key={doc.id}>
                                        <Card sx={{ 
                                            height: '100%', 
                                            display: 'flex', 
                                            flexDirection: 'column',
                                            border: doc.approved_for_public ? `2px solid ${colors.greenAccent[500]}` : '1px solid',
                                            borderColor: theme.palette.mode === 'dark' ? colors.grey[700] : colors.grey[300]
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
                                                    backgroundColor: theme.palette.mode === 'dark' ? colors.primary[600] : colors.grey[100],
                                                    cursor: 'pointer'
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
                                                <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                                                    {doc.approved_for_public ? (
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
                                                {hasPrivilege('public_content.approve') && (
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
                                                {hasPrivilege('document.delete') && (
                                                    <Tooltip title="Delete">
                                                        <IconButton 
                                                            size="small" 
                                                            color="error" 
                                                            onClick={() => handleDelete(doc.isPhoto ? doc.photoId : doc.id, doc.isPhoto)}
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

