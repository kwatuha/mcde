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
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import RefreshIcon from '@mui/icons-material/Refresh';
import ScheduleIcon from '@mui/icons-material/Schedule';
import engineerWorkspaceService from '../../api/engineerWorkspaceService';
import { brand } from '../../theme/colorTokens';
import { getProjectDocumentFileUrl } from '../../utils/projectDocumentFileUtils';
import {
  ENGINEER_WORKSPACE_ROUTES,
  projectTabLink,
} from './engineerWorkspaceShared';
import { groupProgressPhotos, isPendingReviewPhoto } from './progressPhotoUtils';

function PhotoCard({ photo }) {
  return (
    <Box sx={{ minWidth: 260, maxWidth: 360, flex: '1 1 260px' }}>
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
            {photo.contractorName ? (
              <Chip size="small" label={photo.contractorName} variant="outlined" sx={{ height: 20, fontSize: '0.7rem' }} />
            ) : null}
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
    </Box>
  );
}

export default function EngineerWorkspaceProgressPhotosPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const preselectedProjectId = searchParams.get('projectId') || '';
  const preselectedStatus = searchParams.get('status') || 'all';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [projects, setProjects] = useState([]);
  const [photos, setPhotos] = useState([]);
  const [summary, setSummary] = useState({});
  const [projectFilter, setProjectFilter] = useState(preselectedProjectId);
  const [statusFilter, setStatusFilter] = useState(preselectedStatus);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const payload = await engineerWorkspaceService.getProgressPhotos({
        projectId: projectFilter || undefined,
        status: statusFilter !== 'all' ? statusFilter : undefined,
      });
      setProjects(payload?.projects || []);
      setPhotos(payload?.photos || []);
      setSummary(payload?.summary || {});
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Failed to load progress photos.');
      setProjects([]);
      setPhotos([]);
      setSummary({});
    } finally {
      setLoading(false);
    }
  }, [projectFilter, statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const next = new URLSearchParams();
    if (projectFilter) next.set('projectId', projectFilter);
    if (statusFilter && statusFilter !== 'all') next.set('status', statusFilter);
    setSearchParams(next, { replace: true });
  }, [projectFilter, statusFilter, setSearchParams]);

  const groupedPhotos = useMemo(() => groupProgressPhotos(photos), [photos]);
  const pendingReview = useMemo(
    () => photos.filter(isPendingReviewPhoto).length,
    [photos]
  );

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1280, mx: 'auto' }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={() => navigate(ENGINEER_WORKSPACE_ROUTES.overview)}
          size="small"
        >
          Workspace
        </Button>
        <Tooltip title="Refresh">
          <IconButton onClick={load} disabled={loading} aria-label="Refresh progress photos">
            <RefreshIcon />
          </IconButton>
        </Tooltip>
      </Stack>

      <Typography variant="h5" sx={{ fontWeight: 800, mb: 0.5 }}>Progress photos</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Contractor milestone progress photos from projects in your scope.
      </Typography>

      {error ? <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert> : null}

      <Paper variant="outlined" sx={{ p: 2, mb: 2, borderRadius: 2 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ md: 'center' }} justifyContent="space-between">
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <Chip size="small" label={`Total ${photos.length}`} variant="outlined" />
            <Chip size="small" label={`Projects ${summary.projectCount ?? groupedPhotos.length}`} variant="outlined" />
            <Chip size="small" label={`Pending review ${pendingReview}`} color="warning" variant="outlined" />
          </Stack>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ minWidth: { sm: 420 } }}>
            <FormControl size="small" fullWidth>
              <InputLabel>Project</InputLabel>
              <Select
                value={projectFilter}
                label="Project"
                onChange={(e) => setProjectFilter(e.target.value)}
              >
                <MenuItem value="">All projects</MenuItem>
                {projects.map((p) => (
                  <MenuItem key={p.projectId} value={String(p.projectId)}>
                    {p.projectName || `Project #${p.projectId}`}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl size="small" fullWidth>
              <InputLabel>Status</InputLabel>
              <Select
                value={statusFilter}
                label="Status"
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <MenuItem value="all">All statuses</MenuItem>
                <MenuItem value="pending_review">Pending review</MenuItem>
                <MenuItem value="completed">Completed</MenuItem>
              </Select>
            </FormControl>
          </Stack>
        </Stack>
      </Paper>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      ) : groupedPhotos.length === 0 ? (
        <Paper variant="outlined" sx={{ p: 3, borderRadius: 2 }}>
          <Typography variant="body2" color="text.secondary">
            No contractor progress photos in your project scope yet.
          </Typography>
        </Paper>
      ) : (
        groupedPhotos.map((projectGroup) => (
          <Paper key={projectGroup.projectId} variant="outlined" sx={{ p: 2, mb: 2, borderRadius: 2 }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} spacing={1} sx={{ mb: 1.5 }}>
              <Box>
                <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                  {projectGroup.projectName}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {projectGroup.milestoneGroups.reduce((sum, g) => sum + g.photos.length, 0)} photo(s)
                </Typography>
              </Box>
              <Button
                size="small"
                startIcon={<ScheduleIcon />}
                onClick={() => navigate(projectTabLink(projectGroup.projectId, 'schedule'))}
                sx={{ textTransform: 'none', alignSelf: { xs: 'flex-start', sm: 'center' } }}
              >
                Milestones
              </Button>
            </Stack>
            <Divider sx={{ mb: 2 }} />
            {projectGroup.milestoneGroups.map((milestoneGroup) => (
              <Box key={milestoneGroup.key} sx={{ mb: 2.5 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
                  {milestoneGroup.label}
                </Typography>
                <Stack direction="row" spacing={2} useFlexGap flexWrap="wrap">
                  {milestoneGroup.photos.map((photo) => (
                    <PhotoCard key={photo.photoId} photo={photo} />
                  ))}
                </Stack>
              </Box>
            ))}
          </Paper>
        ))
      )}
    </Box>
  );
}
