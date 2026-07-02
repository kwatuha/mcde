import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Card,
  CardMedia,
  Chip,
  CircularProgress,
  Divider,
  FormControl,
  Grid,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import RefreshIcon from '@mui/icons-material/Refresh';
import { useAuth } from '../context/AuthContext';
import apiService from '../api';
import { brand } from '../theme/colorTokens';
import { getProjectDocumentFileUrl } from '../utils/projectDocumentFileUtils';

function projectKey(project) {
  return String(project?.id ?? project?.projectId ?? project?.project_id ?? '');
}

function projectLabel(project) {
  return project?.projectName || project?.name || `Project #${projectKey(project)}`;
}

function normalizeMilestone(row) {
  const milestoneId = row?.milestone_id ?? row?.milestoneId;
  return {
    milestoneId: milestoneId != null ? String(milestoneId) : '',
    sequenceOrder: Number(row?.sequence_order ?? row?.sequenceOrder ?? 0),
    milestoneName: row?.milestone_name ?? row?.milestoneName ?? 'Milestone',
  };
}

function milestoneSortKey(photo) {
  const order = photo?.milestoneSequenceOrder;
  if (order == null || order === '') return 2147483647;
  return Number(order);
}

function milestoneGroupLabel(photo) {
  if (photo?.milestoneName) {
    const order = photo?.milestoneSequenceOrder;
    if (order != null && order !== '') {
      return `${photo.milestoneName} (step ${order})`;
    }
    return photo.milestoneName;
  }
  return 'General progress (no milestone)';
}

function PhotoCard({ photo }) {
  return (
    <Grid item xs={12} sm={6} md={4} sx={{ minWidth: 260 }}>
      <Card variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden', height: '100%' }}>
        <CardMedia
          component="img"
          height="180"
          image={getProjectDocumentFileUrl(photo.filePath || photo.documentPath)}
          alt={photo.caption || photo.originalFileName || 'Progress photo'}
          sx={{ objectFit: 'cover', bgcolor: brand.surface }}
        />
        <Box sx={{ p: 1.5 }}>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {photo.caption || photo.originalFileName || 'No caption'}
          </Typography>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.5 }} flexWrap="wrap" useFlexGap>
            <Typography variant="caption" color="text.secondary">
              {photo.submittedAt ? String(photo.submittedAt).slice(0, 10) : '—'}
            </Typography>
            {photo.status ? (
              <Chip size="small" label={photo.status} variant="outlined" sx={{ height: 20, fontSize: '0.7rem' }} />
            ) : null}
          </Stack>
          {(photo.filePath || photo.documentPath) ? (
            <Button
              size="small"
              startIcon={<OpenInNewIcon />}
              component="a"
              href={getProjectDocumentFileUrl(photo.filePath || photo.documentPath)}
              target="_blank"
              rel="noopener noreferrer"
              sx={{ mt: 1 }}
            >
              View photo
            </Button>
          ) : null}
        </Box>
      </Card>
    </Grid>
  );
}

export default function ContractorPhotosPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const preselectedProjectId = searchParams.get('projectId');
  const { user, authLoading } = useAuth();
  const contractorId = user?.contractorId;
  const profile = user?.contractorProfile;

  const [projects, setProjects] = useState([]);
  const [photos, setPhotos] = useState([]);
  const [milestones, setMilestones] = useState([]);
  const [milestonesLoading, setMilestonesLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [form, setForm] = useState({ projectId: '', milestoneId: '', caption: '', file: null });

  const load = useCallback(async () => {
    if (!contractorId) return;
    setLoading(true);
    setError('');
    try {
      const [projectsData, photosData] = await Promise.all([
        apiService.contractors.getProjectsByContractor(contractorId),
        apiService.contractors.getPhotosByContractor(contractorId),
      ]);
      const projectList = Array.isArray(projectsData)
        ? projectsData
        : Array.isArray(projectsData?.projects)
          ? projectsData.projects
          : [];
      setProjects(projectList);
      setPhotos(Array.isArray(photosData) ? photosData : []);
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Failed to load photos.');
    } finally {
      setLoading(false);
    }
  }, [contractorId]);

  const loadMilestones = useCallback(async (projectId) => {
    if (!projectId) {
      setMilestones([]);
      return;
    }
    setMilestonesLoading(true);
    try {
      const rows = await apiService.milestones.getMilestonesForProject(projectId);
      const normalized = (Array.isArray(rows) ? rows : [])
        .map(normalizeMilestone)
        .sort((a, b) => a.sequenceOrder - b.sequenceOrder || a.milestoneName.localeCompare(b.milestoneName));
      setMilestones(normalized);
    } catch (err) {
      setMilestones([]);
      setError(err?.response?.data?.message || err?.message || 'Failed to load milestones for this project.');
    } finally {
      setMilestonesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && contractorId) load();
    else if (!authLoading) setLoading(false);
  }, [authLoading, contractorId, load]);

  useEffect(() => {
    if (preselectedProjectId) {
      setForm((prev) => ({ ...prev, projectId: preselectedProjectId, milestoneId: '' }));
    }
  }, [preselectedProjectId]);

  useEffect(() => {
    if (!form.projectId) {
      setMilestones([]);
      return;
    }
    loadMilestones(form.projectId);
  }, [form.projectId, loadMilestones]);

  const pendingReview = useMemo(
    () => photos.filter((p) => {
      const s = String(p.status || '').toLowerCase();
      return !s || s.includes('pending') || s.includes('review') || s.includes('submitted');
    }).length,
    [photos]
  );

  const projectNameById = useMemo(() => {
    const map = new Map();
    for (const project of projects) {
      map.set(projectKey(project), projectLabel(project));
    }
    return map;
  }, [projects]);

  const groupedPhotos = useMemo(() => {
    const byProject = new Map();
    for (const photo of photos) {
      const pid = String(photo.projectId ?? photo.project_id ?? 'unknown');
      if (!byProject.has(pid)) byProject.set(pid, []);
      byProject.get(pid).push(photo);
    }

    return [...byProject.entries()].map(([projectId, projectPhotos]) => {
      const byMilestone = new Map();
      for (const photo of projectPhotos) {
        const key = photo.milestoneId != null && photo.milestoneId !== ''
          ? String(photo.milestoneId)
          : '__none__';
        if (!byMilestone.has(key)) byMilestone.set(key, []);
        byMilestone.get(key).push(photo);
      }

      const milestoneGroups = [...byMilestone.entries()]
        .map(([key, items]) => ({
          key,
          label: key === '__none__' ? 'General progress (no milestone)' : milestoneGroupLabel(items[0]),
          sortOrder: key === '__none__' ? 2147483647 : milestoneSortKey(items[0]),
          photos: [...items].sort((a, b) => String(b.submittedAt || '').localeCompare(String(a.submittedAt || ''))),
        }))
        .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label));

      return {
        projectId,
        projectName: projectNameById.get(projectId) || `Project #${projectId}`,
        milestoneGroups,
      };
    });
  }, [photos, projectNameById]);

  const handleUpload = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    if (!form.projectId || !form.file) {
      setError('Select a project and choose a photo to upload.');
      return;
    }
    if (milestones.length > 0 && !form.milestoneId) {
      setError('Select the milestone this photo relates to.');
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('projectId', form.projectId);
      if (form.milestoneId) fd.append('milestoneId', form.milestoneId);
      fd.append('caption', form.caption);
      fd.append('file', form.file);
      await apiService.contractors.uploadPhoto(contractorId, fd);
      setSuccess('Photo uploaded and sent for review.');
      setForm({ projectId: form.projectId, milestoneId: '', caption: '', file: null });
      await load();
    } catch (err) {
      setError(err?.response?.data?.message || err?.response?.data?.error || err?.message || 'Upload failed.');
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
    <Box sx={{ p: { xs: 2, md: 3 }, width: '100%', minWidth: { xs: 0, sm: 720 }, maxWidth: 1200, mx: 'auto' }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/contractor-dashboard')} size="small">
          Dashboard
        </Button>
        <Tooltip title="Refresh list">
          <IconButton size="small" onClick={load} disabled={loading} sx={{ color: 'text.secondary' }}>
            <RefreshIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}

      <Paper variant="outlined" sx={{ p: { xs: 2, md: 2.5 }, borderRadius: 2.5 }}>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          justifyContent="space-between"
          alignItems={{ sm: 'flex-start' }}
          spacing={1.5}
          sx={{ mb: 2 }}
        >
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
              Progress photos
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
              {profile?.companyName || 'Your company'} — link each photo to a project milestone so progress is easy to review.
            </Typography>
          </Box>
          <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap sx={{ flexShrink: 0 }}>
            <Chip size="small" label={`Total ${photos.length}`} variant="outlined" />
            <Chip size="small" label={`Projects ${projects.length}`} variant="outlined" />
            <Chip size="small" label={`In review ${pendingReview}`} color="warning" variant="outlined" />
          </Stack>
        </Stack>

        <Divider sx={{ mb: 2 }} />

        <Typography variant="body1" sx={{ fontWeight: 600, mb: 2 }}>
          Upload new photo
        </Typography>
        <Paper
          component="form"
          onSubmit={handleUpload}
          variant="outlined"
          sx={{ p: 2, mb: 3, borderRadius: 2, bgcolor: brand.surface }}
        >
          <Grid container spacing={2}>
            <Grid item xs={12} md={3} sx={{ minWidth: { xs: 0, md: 160 } }}>
              <FormControl fullWidth required size="small">
                <InputLabel>Project</InputLabel>
                <Select
                  value={form.projectId}
                  label="Project"
                  onChange={(e) => setForm({ projectId: e.target.value, milestoneId: '', caption: form.caption, file: form.file })}
                >
                  {projects.map((p) => (
                    <MenuItem key={projectKey(p)} value={projectKey(p)}>
                      {projectLabel(p)}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={3} sx={{ minWidth: { xs: 0, md: 160 } }}>
              <FormControl
                fullWidth
                size="small"
                required={milestones.length > 0}
                disabled={!form.projectId || milestonesLoading}
              >
                <InputLabel>Milestone</InputLabel>
                <Select
                  value={form.milestoneId}
                  label="Milestone"
                  onChange={(e) => setForm((f) => ({ ...f, milestoneId: e.target.value }))}
                >
                  {milestones.length === 0 ? (
                    <MenuItem value="">
                      <em>{milestonesLoading ? 'Loading…' : 'No milestones on this project'}</em>
                    </MenuItem>
                  ) : (
                    milestones.map((m) => (
                      <MenuItem key={m.milestoneId} value={m.milestoneId}>
                        {m.sequenceOrder ? `${m.sequenceOrder}. ` : ''}{m.milestoneName}
                      </MenuItem>
                    ))
                  )}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={3} sx={{ minWidth: { xs: 0, md: 140 } }}>
              <TextField
                label="Caption"
                fullWidth
                size="small"
                value={form.caption}
                onChange={(e) => setForm((f) => ({ ...f, caption: e.target.value }))}
              />
            </Grid>
            <Grid item xs={12} md={3} sx={{ minWidth: { xs: 0, md: 140 } }}>
              <Button variant="outlined" component="label" fullWidth sx={{ height: 40 }}>
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
                disabled={uploading || projects.length === 0 || milestonesLoading}
              >
                {uploading ? 'Uploading…' : 'Upload photo'}
              </Button>
            </Grid>
          </Grid>
        </Paper>

        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
          <Typography variant="body1" sx={{ fontWeight: 600 }}>
            Your uploads
          </Typography>
          {photos.length > 0 ? (
            <Chip size="small" label={`${photos.length} photo${photos.length === 1 ? '' : 's'}`} variant="outlined" />
          ) : null}
        </Stack>

        {photos.length === 0 ? (
          <Alert severity="info">No photos uploaded yet.</Alert>
        ) : (
          <Stack spacing={3}>
            {groupedPhotos.map((projectGroup) => (
              <Box key={projectGroup.projectId}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5 }}>
                  {projectGroup.projectName}
                </Typography>
                <Stack spacing={2}>
                  {projectGroup.milestoneGroups.map((milestoneGroup) => (
                    <Box key={`${projectGroup.projectId}-${milestoneGroup.key}`}>
                      <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600, mb: 1 }}>
                        {milestoneGroup.label}
                      </Typography>
                      <Grid container spacing={2}>
                        {milestoneGroup.photos.map((photo) => (
                          <PhotoCard key={photo.photoId || photo.id} photo={photo} />
                        ))}
                      </Grid>
                    </Box>
                  ))}
                </Stack>
              </Box>
            ))}
          </Stack>
        )}
      </Paper>
    </Box>
  );
}
