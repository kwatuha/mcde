import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Card,
  CardMedia,
  CircularProgress,
  FormControl,
  Grid,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import { useAuth } from '../context/AuthContext';
import apiService from '../api';
import { brand } from '../theme/colorTokens';

const uploadBase = () => {
  const raw = import.meta.env.VITE_API_URL || '';
  if (!raw) return '';
  return String(raw).replace(/\/api\/?$/, '');
};

function photoUrl(filePath) {
  if (!filePath) return '';
  const path = String(filePath).replace(/\\/g, '/');
  if (path.startsWith('http')) return path;
  const normalized = path.startsWith('/') ? path : `/${path}`;
  const base = uploadBase();
  return base ? `${base}${normalized}` : normalized;
}

export default function ContractorPhotosPage() {
  const navigate = useNavigate();
  const { user, authLoading } = useAuth();
  const contractorId = user?.contractorId;

  const [projects, setProjects] = useState([]);
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [form, setForm] = useState({ projectId: '', caption: '', file: null });

  const load = useCallback(async () => {
    if (!contractorId) return;
    setLoading(true);
    setError('');
    try {
      const [projectsData, photosData] = await Promise.all([
        apiService.contractors.getProjectsByContractor(contractorId),
        apiService.contractors.getPhotosByContractor(contractorId),
      ]);
      setProjects(Array.isArray(projectsData) ? projectsData : []);
      setPhotos(Array.isArray(photosData) ? photosData : []);
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Failed to load photos.');
    } finally {
      setLoading(false);
    }
  }, [contractorId]);

  useEffect(() => {
    if (!authLoading && contractorId) load();
    else if (!authLoading) setLoading(false);
  }, [authLoading, contractorId, load]);

  const handleUpload = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    if (!form.projectId || !form.file) {
      setError('Select a project and choose a photo to upload.');
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('projectId', form.projectId);
      fd.append('caption', form.caption);
      fd.append('file', form.file);
      await apiService.contractors.uploadPhoto(contractorId, fd);
      setSuccess('Photo uploaded and sent for review.');
      setForm({ projectId: form.projectId, caption: '', file: null });
      await load();
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Upload failed.');
    } finally {
      setUploading(false);
    }
  };

  if (authLoading || loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '50vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!contractorId) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="warning">
          Your account is not linked to a contractor profile. Contact an administrator.
        </Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1100, mx: 'auto' }}>
      <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/contractor-dashboard')} size="small" sx={{ mb: 2 }}>
        Dashboard
      </Button>

      <Paper
        elevation={0}
        sx={{
          p: 3,
          mb: 3,
          borderRadius: 2,
          background: `linear-gradient(135deg, ${brand.main} 0%, ${brand.dark} 100%)`,
          color: brand.onPrimary,
        }}
      >
        <Typography variant="h5" sx={{ fontWeight: 700 }}>
          Progress Photos
        </Typography>
        <Typography variant="body2" sx={{ opacity: 0.9, mt: 0.5 }}>
          Upload site photos for your assigned projects. Images are reviewed before publication.
        </Typography>
      </Paper>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}

      <Paper component="form" onSubmit={handleUpload} elevation={2} sx={{ p: 3, mb: 3, borderRadius: 2 }}>
        <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
          Upload new photo
        </Typography>
        <Grid container spacing={2}>
          <Grid item xs={12} md={4}>
            <FormControl fullWidth required>
              <InputLabel>Project</InputLabel>
              <Select
                value={form.projectId}
                label="Project"
                onChange={(e) => setForm((f) => ({ ...f, projectId: e.target.value }))}
              >
                {projects.map((p) => (
                  <MenuItem key={p.id} value={p.id}>
                    {p.projectName || p.name || `Project #${p.id}`}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} md={4}>
            <TextField
              label="Caption"
              fullWidth
              value={form.caption}
              onChange={(e) => setForm((f) => ({ ...f, caption: e.target.value }))}
            />
          </Grid>
          <Grid item xs={12} md={4}>
            <Button variant="outlined" component="label" fullWidth sx={{ height: 56 }}>
              {form.file ? form.file.name : 'Choose image'}
              <input
                type="file"
                hidden
                accept="image/*"
                onChange={(e) => setForm((f) => ({ ...f, file: e.target.files?.[0] || null }))}
              />
            </Button>
          </Grid>
          <Grid item xs={12}>
            <Button
              type="submit"
              variant="contained"
              startIcon={<CloudUploadIcon />}
              disabled={uploading || projects.length === 0}
            >
              {uploading ? 'Uploading…' : 'Upload photo'}
            </Button>
          </Grid>
        </Grid>
      </Paper>

      <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
        Your uploads ({photos.length})
      </Typography>

      {photos.length === 0 ? (
        <Alert severity="info">No photos uploaded yet.</Alert>
      ) : (
        <Grid container spacing={2}>
          {photos.map((photo) => (
            <Grid item xs={12} sm={6} md={4} key={photo.photoId || photo.id}>
              <Card sx={{ borderRadius: 2, overflow: 'hidden' }}>
                <CardMedia
                  component="img"
                  height="180"
                  image={photoUrl(photo.filePath || photo.documentPath)}
                  alt={photo.caption || 'Progress photo'}
                  sx={{ objectFit: 'cover', bgcolor: brand.surface }}
                />
                <Box sx={{ p: 1.5 }}>
                  <Typography variant="body2" color="text.secondary">
                    {photo.caption || 'No caption'}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {photo.submittedAt ? String(photo.submittedAt).slice(0, 10) : ''}
                    {photo.status ? ` · ${photo.status}` : ''}
                  </Typography>
                </Box>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}
    </Box>
  );
}
