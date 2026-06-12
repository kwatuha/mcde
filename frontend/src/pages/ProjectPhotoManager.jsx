import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    Box, Typography, CircularProgress, Alert, Button, Paper,
    Grid, Card, CardMedia, CardContent, CardActions, IconButton,
    Dialog, DialogTitle, DialogContent, DialogActions, Snackbar, LinearProgress,
    Chip, Stack
} from '@mui/material';
import {
    ArrowBack as ArrowBackIcon, CloudUpload as CloudUploadIcon,
    Delete as DeleteIcon, Star as StarIcon, Close as CloseIcon
} from '@mui/icons-material';
import apiService from '../api';
import { API_BASE_URL } from '../api';
import { useAuth } from '../context/AuthContext';

const buildPhotoUrl = (filePath) => {
    if (!filePath) return '';
    const apiBaseUrl = API_BASE_URL || '';
    const normalizedBase = apiBaseUrl.replace(/\/api\/?$/, '').replace(/\/$/, '');
    const normalizedPath = String(filePath).replace(/^\/+/, '');

    if (/^https?:\/\//i.test(filePath)) return filePath;
    if (normalizedPath.startsWith('uploads/')) return `${normalizedBase}/${normalizedPath}`;
    return `${normalizedBase}/uploads/${normalizedPath}`;
};

const ProjectPhotoManager = () => {
    const { projectId } = useParams();
    const navigate = useNavigate();
    const { hasPrivilege } = useAuth();

    const [photos, setPhotos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState(null);
    const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
    const [previewPhoto, setPreviewPhoto] = useState(null);

    const fileInputRef = useRef(null);

    const fetchPhotos = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            if (hasPrivilege('project_photos.read')) {
                const response = await apiService.projectPhotos.getPhotosByProject(projectId);
                setPhotos(response);
            } else {
                setError("You do not have permission to view project photos.");
            }
        } catch (err) {
            console.error('Error fetching project photos:', err);
            setError('Failed to load project photos.');
            setPhotos([]);
        } finally {
            setLoading(false);
        }
    }, [projectId, hasPrivilege]);

    useEffect(() => {
        fetchPhotos();
    }, [fetchPhotos]);

    const handleFileSelect = (event) => {
        if (!hasPrivilege('project_photos.create')) {
            setSnackbar({ open: true, message: 'Permission denied to upload photos.', severity: 'error' });
            return;
        }
        const file = event.target.files[0];
        if (file) {
            handleUploadFile(file);
        }
    };

    const handleUploadFile = async (file) => {
        setUploading(true);
        setError(null);
        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('description', `Photo for project ${projectId}`);

            await apiService.projectPhotos.uploadPhoto(projectId, formData);
            setSnackbar({ open: true, message: 'Photo uploaded successfully!', severity: 'success' });
            fetchPhotos();
        } catch (err) {
            console.error('Error uploading file:', err);
            setError(err.response?.data?.message || 'Failed to upload photo.');
        } finally {
            setUploading(false);
        }
    };

    const handleSetDefaultPhoto = async (photoId) => {
        if (!hasPrivilege('project_photos.set_default')) {
            setSnackbar({ open: true, message: 'Permission denied to set a default photo.', severity: 'error' });
            return;
        }
        try {
            await apiService.projectPhotos.setDefaultPhoto(photoId);
            setSnackbar({ open: true, message: 'Default photo updated successfully!', severity: 'success' });
            fetchPhotos();
        } catch (err) {
            console.error('Error setting default photo:', err);
            setSnackbar({ open: true, message: err.response?.data?.message || 'Failed to set default photo.', severity: 'error' });
        }
    };

    const handleDeletePhoto = async (photoId) => {
        if (!hasPrivilege('project_photos.delete')) {
            setSnackbar({ open: true, message: 'Permission denied to delete photos.', severity: 'error' });
            return;
        }
        if (window.confirm('Are you sure you want to delete this photo?')) {
            try {
                await apiService.projectPhotos.deletePhoto(photoId);
                setSnackbar({ open: true, message: 'Photo deleted successfully!', severity: 'success' });
                fetchPhotos();
            } catch (err) {
                console.error('Error deleting photo:', err);
                setSnackbar({ open: true, message: err.response?.data?.message || 'Failed to delete photo.', severity: 'error' });
            }
        }
    };

    const handleOpenPreview = (photo) => {
        setPreviewPhoto(photo);
    };

    const handleClosePreview = () => {
        setPreviewPhoto(null);
    };

    const handleCloseSnackbar = (event, reason) => {
        if (reason === 'clickaway') return;
        setSnackbar({ ...snackbar, open: false });
    };

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

    return (
        <Box sx={{ p: 3 }}>
            <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 3 }}>
                <Button variant="outlined" startIcon={<ArrowBackIcon />} onClick={() => navigate(-1)}>
                    Back to Project Details
                </Button>
                <Typography variant="h4" component="h1" sx={{ color: '#0A2342', fontWeight: 'bold' }}>
                    Project Photos
                </Typography>
            </Stack>

            <Paper elevation={3} sx={{ p: 3, mb: 4, borderRadius: '8px' }}>
                <Typography variant="h6" color="primary.main" gutterBottom>Photo Gallery</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    Click any photo to view the full-size image. Gallery previews preserve the full photo so important details are not cropped.
                </Typography>
                <Grid container spacing={3}>
                    {photos.length > 0 ? (
                        photos.map((photo) => (
                            <Grid item key={photo.photoId} xs={12} sm={6} md={4} xl={3}>
                                <Card sx={{ position: 'relative', height: '100%', border: photo.isDefault ? '2px solid #22c55e' : '1px solid #ccc' }}>
                                    <Box
                                        sx={{
                                            height: { xs: 260, sm: 280, md: 300 },
                                            bgcolor: 'grey.100',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            cursor: 'pointer',
                                            overflow: 'hidden',
                                        }}
                                        onClick={() => handleOpenPreview(photo)}
                                    >
                                        <CardMedia
                                            component="img"
                                            image={buildPhotoUrl(photo.filePath)}
                                            alt={photo.description || photo.fileName || 'Project photo'}
                                            sx={{
                                                width: '100%',
                                                height: '100%',
                                                objectFit: 'contain',
                                                p: 1,
                                            }}
                                        />
                                    </Box>
                                    <CardContent>
                                        <Typography gutterBottom variant="subtitle2" component="div" noWrap>
                                            {photo.fileName}
                                        </Typography>
                                        <Typography variant="body2" color="text.secondary" noWrap>
                                            {photo.description}
                                        </Typography>
                                        {photo.isDefault && (
                                            <Chip
                                                icon={<StarIcon />}
                                                label="Default Photo"
                                                color="success"
                                                size="small"
                                                sx={{ position: 'absolute', top: 8, right: 8 }}
                                            />
                                        )}
                                    </CardContent>
                                    <CardActions sx={{ justifyContent: 'flex-end' }}>
                                        {hasPrivilege('project_photos.set_default') && !photo.isDefault && (
                                            <Button size="small" onClick={() => handleSetDefaultPhoto(photo.photoId)}>
                                                Set as Default
                                            </Button>
                                        )}
                                        {hasPrivilege('project_photos.delete') && (
                                            <IconButton size="small" color="error" onClick={() => handleDeletePhoto(photo.photoId)}>
                                                <DeleteIcon />
                                            </IconButton>
                                        )}
                                    </CardActions>
                                </Card>
                            </Grid>
                        ))
                    ) : (
                        <Grid item xs={12}>
                            <Alert severity="info">No photos found for this project.</Alert>
                        </Grid>
                    )}
                </Grid>

                {hasPrivilege('project_photos.create') && (
                    <Box sx={{ mt: 4 }}>
                        <Button
                            variant="contained"
                            component="label"
                            startIcon={<CloudUploadIcon />}
                            disabled={uploading}
                        >
                            Upload Photo
                            <input type="file" accept="image/*" hidden onChange={handleFileSelect} ref={fileInputRef} />
                        </Button>
                        {uploading && <LinearProgress sx={{ mt: 1 }} />}
                    </Box>
                )}
            </Paper>

            <Dialog open={!!previewPhoto} onClose={handleClosePreview} fullWidth maxWidth="lg">
                <DialogTitle>
                    {previewPhoto?.fileName}
                    <IconButton
                        aria-label="close"
                        onClick={handleClosePreview}
                        sx={{ position: 'absolute', right: 8, top: 8 }}
                    >
                        <CloseIcon />
                    </IconButton>
                </DialogTitle>
                <DialogContent dividers>
                    {previewPhoto && (
                        <Box sx={{ display: 'flex', justifyContent: 'center', bgcolor: 'grey.100', borderRadius: 1, p: 1 }}>
                            <img
                                src={buildPhotoUrl(previewPhoto.filePath)}
                                alt={previewPhoto.description || previewPhoto.fileName || 'Project photo'}
                                style={{ maxWidth: '100%', maxHeight: '82vh', objectFit: 'contain' }}
                            />
                        </Box>
                    )}
                </DialogContent>
            </Dialog>

            <Snackbar open={snackbar.open} autoHideDuration={6000} onClose={handleCloseSnackbar}>
                <Alert onClose={handleCloseSnackbar} severity={snackbar.severity} sx={{ width: '100%' }}>
                    {snackbar.message}
                </Alert>
            </Snackbar>
        </Box>
    );
};

export default ProjectPhotoManager;