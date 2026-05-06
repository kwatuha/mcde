import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Box, Typography, Button, IconButton, Dialog, DialogTitle,
  DialogContent, DialogActions, Alert, CircularProgress, Stack,
  List, ListItem, ListItemText, ListItemSecondaryAction, Chip, LinearProgress,
  Snackbar, TextField, Select, MenuItem, FormControl, InputLabel, Grid, Paper,
  Tabs, Tab
} from '@mui/material';
import {
  Close as CloseIcon, Delete as DeleteIcon, CloudUpload as CloudUploadIcon,
  AttachFile as AttachFileIcon, Add as AddIcon, Photo as PhotoIcon, InsertDriveFile as DocumentIcon
} from '@mui/icons-material';
import apiService from '../api';
import { useAuth } from '../context/AuthContext';
import PropTypes from 'prop-types';

const statusOptions = [
    { value: 'pending_review', label: 'Pending Review' },
    { value: 'in_progress', label: 'In Progress' },
    { value: 'completed', label: 'Completed' },
];

const documentTypeOptions = [
    { value: 'document', label: 'Document' },
    { value: 'photo', label: 'Photo' },
];

/** Stored paths are like `uploads/projects/...`; Express serves them at `/uploads/...` (not under `/api`). */
const IMAGE_PATH_RE = /\.(jpe?g|png|gif|webp|bmp|svg)(\?.*)?$/i;

function isImagePath(filePath, originalFileName) {
  const combined = `${filePath || ''} ${originalFileName || ''}`;
  return IMAGE_PATH_RE.test(combined);
}

function isPhotoAttachment(doc) {
  return String(doc?.documentType || '').toLowerCase().trim() === 'photo';
}

function getApiBaseUrl() {
  const apiUrl = import.meta.env.VITE_API_URL || '';
  if (apiUrl) {
    return String(apiUrl).replace(/\/api\/?$/, '').replace(/\/public\/?$/, '');
  }
  if (typeof window === 'undefined') return '';
  const origin = window.location.origin;
  if (origin.includes(':8080') || origin.includes(':5174')) {
    return origin.replace(/:8080|:5174/, ':3000');
  }
  return origin;
}

function getAttachmentFileUrl(filePath) {
  if (!filePath) return '';
  if (filePath.startsWith('http://') || filePath.startsWith('https://')) return filePath;
  const base = getApiBaseUrl();
  let p = filePath;
  if (p.startsWith('api/')) p = p.slice(4);
  if (p.startsWith('/uploads/')) return `${base}${p}`;
  if (p.startsWith('uploads/')) return `${base}/${p}`;
  if (p.startsWith('/')) return `${base}${p}`;
  return `${base}/uploads/${p}`;
}

function TabPanel(props) {
  const { children, value, index, ...other } = props;
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`simple-tabpanel-${index}`}
      aria-labelledby={`simple-tab-${index}`}
      {...other}
    >
      {value === index && (
        <Box sx={{ p: 0 }}>
          {children}
        </Box>
      )}
    </div>
  );
}

function MilestoneImagePreview({ doc, variant = 'grid', onOpenUrl }) {
  const [failed, setFailed] = useState(false);
  const url = getAttachmentFileUrl(doc.documentPath);
  const isGrid = variant === 'grid';
  const listSize = 88;

  if (failed || !url) {
    return (
      <Box
        sx={{
          width: isGrid ? '100%' : listSize,
          height: isGrid ? 220 : listSize,
          minHeight: isGrid ? 220 : listSize,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          bgcolor: 'action.hover',
          borderRadius: 1,
          border: '1px dashed',
          borderColor: 'divider',
        }}
      >
        <PhotoIcon color="disabled" fontSize={isGrid ? 'large' : 'medium'} />
      </Box>
    );
  }

  return (
    <Box
      component="img"
      src={url}
      alt={doc.description || doc.originalFileName || 'Attachment'}
      loading="lazy"
      onClick={() => isGrid && onOpenUrl?.(url)}
      sx={{
        width: isGrid ? '100%' : listSize,
        height: isGrid ? 240 : listSize,
        minHeight: isGrid ? 240 : listSize,
        maxHeight: isGrid ? 360 : listSize,
        objectFit: isGrid ? 'contain' : 'cover',
        bgcolor: isGrid ? 'grey.100' : 'action.hover',
        borderRadius: 1,
        display: 'block',
        ...(isGrid && onOpenUrl
          ? { cursor: 'pointer', '&:hover': { opacity: 0.92 } }
          : {}),
      }}
      onError={() => setFailed(true)}
    />
  );
}

const MilestoneAttachments = ({ open, onClose, milestoneId, onUploadSuccess, currentMilestoneName, projectId }) => {
  const { user, hasPrivilege } = useAuth();
  const [attachments, setAttachments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState(null);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
  const [progressData, setProgressData] = useState({ 
      status: '', 
      progressPercentage: '',
      documentType: '',
      description: ''
  });
  const [selectedFile, setSelectedFile] = useState(null);
  const [acceptedFileTypes, setAcceptedFileTypes] = useState('');
  
  const [openUploadModal, setOpenUploadModal] = useState(false);
  const [activeTab, setActiveTab] = useState(0);

  const fileInputRef = useRef(null);

  const fetchAttachments = useCallback(async () => {
    if (!milestoneId || !hasPrivilege('document.read_all')) {
      if (!milestoneId) {
        setError('No milestone ID provided.');
      }
      setAttachments([]);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await apiService.documents.getMilestoneDocuments(milestoneId);
      setAttachments(response);
    } catch (err) {
      console.error('Error fetching milestone documents:', err);
      setError('Failed to load attachments.');
      setAttachments([]);
    } finally {
      setLoading(false);
    }
  }, [milestoneId, hasPrivilege]);

  useEffect(() => {
    if (open) {
      fetchAttachments();
    }
  }, [open, fetchAttachments]);
  
  const handleFileChange = (event) => {
    const file = event.target.files[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  const handleUploadClick = async () => {
    if (!selectedFile) {
      setError('Please select a file to upload.');
      return;
    }
    if (!progressData.documentType) {
        setError('Please select a document type.');
        return;
    }
    if (!progressData.status) {
        setError('Please select a status for the attachment.');
        return;
    }

    if (progressData.documentType === 'photo' && !selectedFile.type.startsWith('image/')) {
        setError('The selected file must be a photo (image file).');
        return;
    }
    if (projectId === undefined || projectId === null || projectId === '') {
        setError('Project ID is missing. Open this dialog from a project details page and try again.');
        return;
    }

    setUploading(true);
    setUploadProgress(0);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('documents', selectedFile);
      formData.append('projectId', projectId); 
      formData.append('milestoneId', milestoneId);
      formData.append('documentCategory', 'milestone');
      formData.append('status', progressData.status);
      formData.append('documentType', progressData.documentType);
      formData.append('originalFileName', selectedFile.name);
      formData.append('description', progressData.description);
      
      if (progressData.progressPercentage) {
          formData.append('progressPercentage', progressData.progressPercentage);
      }
      
      await apiService.documents.uploadDocument(formData, (progressEvent) => {
        const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
        setUploadProgress(percentCompleted);
      });
      
      setSnackbar({ open: true, message: 'Document uploaded successfully!', severity: 'success' });
      setProgressData({ status: '', progressPercentage: '', documentType: '', description: '' });
      setSelectedFile(null);
      
      setOpenUploadModal(false);
      fetchAttachments();
      if (onUploadSuccess) onUploadSuccess();
    } catch (err) {
      console.error('Error uploading file:', err);
      setError(err.response?.data?.message || 'Failed to upload document.');
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const handleDeleteAttachment = async (documentId) => {
    if (!hasPrivilege('document.delete')) {
      setSnackbar({ open: true, message: 'Permission denied to delete documents.', severity: 'error' });
      return;
    }
    if (window.confirm('Are you sure you want to delete this document?')) {
      try {
        await apiService.documents.deleteDocument(documentId);
        setSnackbar({ open: true, message: 'Document deleted successfully!', severity: 'success' });
        fetchAttachments();
      } catch (err) {
        console.error('Error deleting document:', err);
        setSnackbar({ open: true, message: err.response?.data?.message || 'Failed to delete document.', severity: 'error' });
      }
    }
  };

  const handleDownloadAttachment = (filePath) => {
    window.open(getAttachmentFileUrl(filePath), '_blank', 'noopener,noreferrer');
  };

  const handleCloseSnackbar = (event, reason) => {
    if (reason === 'clickaway') return;
    setSnackbar({ ...snackbar, open: false });
  };
  
  const handleProgressChange = (e) => {
    const { name, value } = e.target;
    
    setProgressData(prev => ({ ...prev, [name]: value }));

    if (name === 'documentType') {
        if (value === 'photo') {
            setAcceptedFileTypes('image/*');
        } else {
            setAcceptedFileTypes('');
        }
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>
        Milestone Documents & Progress
        <IconButton
          aria-label="close"
          onClick={onClose}
          sx={{ position: 'absolute', right: 8, top: 8, color: (theme) => theme.palette.grey[500] }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
            <Typography variant="subtitle1">
                Attachments for: **{currentMilestoneName}**
            </Typography>
            {hasPrivilege('document.create') && (
                <Button 
                    variant="contained" 
                    startIcon={<AddIcon />}
                    onClick={() => setOpenUploadModal(true)}
                >
                    Upload New
                </Button>
            )}
        </Stack>

        {loading ? (
          <Box display="flex" justifyContent="center" alignItems="center" my={4}>
            <CircularProgress />
          </Box>
        ) : (
          <Paper elevation={0} sx={{ bgcolor: 'grey.50', p: 2 }}>
            <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
                <Tabs value={activeTab} onChange={(e, newValue) => setActiveTab(newValue)} aria-label="document tabs">
                    <Tab label="Documents" icon={<DocumentIcon />} iconPosition="start" />
                    <Tab label="Photos" icon={<PhotoIcon />} iconPosition="start" />
                </Tabs>
            </Box>

            <TabPanel value={activeTab} index={0}>
                <List>
                    {attachments.filter((doc) => !isPhotoAttachment(doc)).length > 0 ? (
                    attachments.filter((doc) => !isPhotoAttachment(doc)).map((doc) => {
                      const showThumb = isImagePath(doc.documentPath, doc.originalFileName);
                      return (
                        <ListItem key={doc.id} divider alignItems="flex-start" sx={{ gap: 2 }}>
                            {showThumb && (
                              <Box sx={{ flexShrink: 0, pt: 0.5 }}>
                                <MilestoneImagePreview doc={doc} variant="list" />
                              </Box>
                            )}
                            <ListItemText
                                primary={doc.originalFileName || doc.documentPath.split('/').pop()}
                                secondary={
                                    <>
                                        <Typography component="span" variant="body2" color="text.primary" sx={{ display: 'block' }}>
                                            {doc.description || 'No description provided.'}
                                        </Typography>
                                        <Chip
                                            label={doc.status?.replace(/_/g, ' ') || 'No Status'}
                                            size="small"
                                            color={doc.status === 'completed' ? 'success' : 'default'}
                                            sx={{ mt: 0.5 }}
                                        />
                                        {doc.progressPercentage && (
                                            <Chip
                                                label={`${doc.progressPercentage}% Progress`}
                                                size="small"
                                                sx={{ ml: 1, mt: 0.5 }}
                                            />
                                        )}
                                    </>
                                }
                            />
                            <ListItemSecondaryAction>
                                <IconButton edge="end" aria-label="download" onClick={() => handleDownloadAttachment(doc.documentPath)}>
                                    <AttachFileIcon />
                                </IconButton>
                                {hasPrivilege('document.delete') && (
                                    <IconButton edge="end" aria-label="delete" onClick={() => handleDeleteAttachment(doc.id)}>
                                        <DeleteIcon color="error" />
                                    </IconButton>
                                )}
                            </ListItemSecondaryAction>
                        </ListItem>
                      );
                    })
                    ) : (
                    <Alert severity="info" sx={{ mt: 2 }}>No documents found for this milestone.</Alert>
                    )}
                </List>
            </TabPanel>

            <TabPanel value={activeTab} index={1}>
                <Grid container spacing={2}>
                    {attachments.filter((doc) => isPhotoAttachment(doc)).length > 0 ? (
                    attachments.filter((doc) => isPhotoAttachment(doc)).map((doc) => (
                        <Grid item xs={12} sm={6} md={4} key={doc.id}>
                            <Paper elevation={2} sx={{ position: 'relative', p: 1, overflow: 'hidden' }}>
                                <Box title="Open full size in a new tab">
                                  <MilestoneImagePreview
                                    doc={doc}
                                    variant="grid"
                                    onOpenUrl={(url) => window.open(url, '_blank', 'noopener,noreferrer')}
                                  />
                                </Box>
                                <Typography variant="body2" noWrap sx={{ mt: 1, fontWeight: 'bold' }} title={doc.originalFileName || ''}>
                                    {doc.originalFileName || doc.documentPath.split('/').pop()}
                                </Typography>
                                <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                                    {doc.description || 'No description'}
                                </Typography>
                                <Stack direction="row" spacing={1} sx={{ mt: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                                    <Chip
                                        label={doc.status?.replace(/_/g, ' ') || 'No Status'}
                                        size="small"
                                        color={doc.status === 'completed' ? 'success' : 'default'}
                                    />
                                    {doc.progressPercentage && (
                                        <Chip
                                            label={`${doc.progressPercentage}% Progress`}
                                            size="small"
                                        />
                                    )}
                                </Stack>
                                <Stack direction="row" spacing={1} sx={{ mt: 1, justifyContent: 'flex-end' }}>
                                    <IconButton size="small" onClick={() => handleDownloadAttachment(doc.documentPath)} aria-label="Open file">
                                        <AttachFileIcon fontSize="small" />
                                    </IconButton>
                                    {hasPrivilege('document.delete') && (
                                        <IconButton size="small" onClick={() => handleDeleteAttachment(doc.id)} aria-label="Delete">
                                            <DeleteIcon color="error" fontSize="small" />
                                        </IconButton>
                                    )}
                                </Stack>
                            </Paper>
                        </Grid>
                    ))
                    ) : (
                    <Grid item xs={12}>
                        <Alert severity="info" sx={{ mt: 2 }}>No photos found for this milestone.</Alert>
                    </Grid>
                    )}
                </Grid>
            </TabPanel>
          </Paper>
        )}

      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Done</Button>
      </DialogActions>
      <Snackbar open={snackbar.open} autoHideDuration={6000} onClose={handleCloseSnackbar}>
        <Alert onClose={handleCloseSnackbar} severity={snackbar.severity} sx={{ width: '100%' }}>
          {snackbar.message}
        </Alert>
      </Snackbar>

      <Dialog open={openUploadModal} onClose={() => setOpenUploadModal(false)} fullWidth maxWidth="sm">
          <DialogTitle>
              Upload New Document
              <IconButton onClick={() => setOpenUploadModal(false)} sx={{ position: 'absolute', right: 8, top: 8 }}><CloseIcon /></IconButton>
          </DialogTitle>
          <DialogContent dividers>
            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
            <Grid container spacing={2} mb={2}>
                <Grid item xs={12} sm={6}>
                    <FormControl fullWidth margin="dense" size="small" sx={{ minWidth: 200 }}>
                        <InputLabel shrink>Document Type</InputLabel>
                        <Select
                            name="documentType"
                            value={progressData.documentType}
                            label="Document Type"
                            onChange={handleProgressChange}
                            sx={{ minWidth: '100%' }}
                        >
                            {documentTypeOptions.map(option => (
                                <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                </Grid>
                <Grid item xs={12} sm={6}>
                    <FormControl fullWidth margin="dense" size="small" sx={{ minWidth: 200 }}>
                        <InputLabel shrink>Status</InputLabel>
                        <Select
                            name="status"
                            value={progressData.status}
                            label="Status"
                            onChange={handleProgressChange}
                            sx={{ minWidth: '100%' }}
                        >
                            {statusOptions.map(option => (
                                <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                </Grid>
                <Grid item xs={12} sm={6}>
                    <TextField
                        fullWidth
                        margin="dense"
                        name="progressPercentage"
                        label="Progress %"
                        type="number"
                        size="small"
                        value={progressData.progressPercentage || ''}
                        onChange={handleProgressChange}
                        InputLabelProps={{ shrink: true }}
                        inputProps={{ min: 0, max: 100 }}
                        sx={{ minWidth: 200 }}
                    />
                </Grid>
                <Grid item xs={12}>
                    <TextField
                        fullWidth
                        margin="dense"
                        name="description"
                        label="Description"
                        multiline
                        rows={2}
                        value={progressData.description || ''}
                        onChange={handleProgressChange}
                        InputLabelProps={{ shrink: true }}
                    />
                </Grid>
            </Grid>
            <Stack direction="row" spacing={2} alignItems="center">
                <Button
                    variant="outlined"
                    component="label"
                    htmlFor="file-upload-input"
                    startIcon={<AttachFileIcon />}
                >
                    {selectedFile ? selectedFile.name : 'Choose File'}
                    <input
                        id="file-upload-input"
                        type="file"
                        hidden
                        accept={acceptedFileTypes}
                        onChange={handleFileChange}
                        ref={fileInputRef}
                    />
                </Button>
            </Stack>
            {uploading && (
                <Box sx={{ width: '100%', mt: 2 }}>
                    <LinearProgress variant="determinate" value={uploadProgress} />
                    <Typography variant="body2" color="text.secondary">{uploadProgress}%</Typography>
                </Box>
            )}
          </DialogContent>
          <DialogActions>
              <Button onClick={() => setOpenUploadModal(false)}>Cancel</Button>
              <Button 
                  onClick={handleUploadClick} 
                  variant="contained" 
                  startIcon={<CloudUploadIcon />} 
                  disabled={uploading || !selectedFile || !progressData.documentType || !progressData.status}
              >
                  {uploading ? <CircularProgress size={24} color="inherit" /> : 'Upload'}
              </Button>
          </DialogActions>
      </Dialog>
    </Dialog>
  );
};

MilestoneAttachments.propTypes = {
    open: PropTypes.bool.isRequired,
    onClose: PropTypes.func.isRequired,
    milestoneId: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    onUploadSuccess: PropTypes.func.isRequired,
    currentMilestoneName: PropTypes.string.isRequired,
    projectId: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
};

MilestoneAttachments.defaultProps = {
    milestoneId: null,
};

export default MilestoneAttachments;