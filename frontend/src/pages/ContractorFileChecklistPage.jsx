import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  FormControl,
  InputLabel,
  LinearProgress,
  MenuItem,
  Paper,
  Select,
  Stack,
  Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import { useAuth } from '../context/AuthContext';
import apiService from '../api';
import { brand } from '../theme/colorTokens';

const STATUS_META = {
  missing: { label: 'Missing', color: 'error' },
  uploaded: { label: 'Uploaded', color: 'success' },
};

export default function ContractorFileChecklistPage() {
  const navigate = useNavigate();
  const { user, authLoading } = useAuth();
  const contractorId = user?.contractorId;
  const fileInputRef = useRef(null);

  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState('');
  const [checklist, setChecklist] = useState(null);
  const [loading, setLoading] = useState(true);
  const [checklistLoading, setChecklistLoading] = useState(false);
  const [uploadingItemId, setUploadingItemId] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [expanded, setExpanded] = useState('');

  const loadProjects = useCallback(async () => {
    if (!contractorId) return;
    setLoading(true);
    setError('');
    try {
      const data = await apiService.contractors.getProjectsByContractor(contractorId);
      const list = Array.isArray(data) ? data : Array.isArray(data?.projects) ? data.projects : [];
      setProjects(list);
      if (!projectId && list.length) {
        const firstId = list[0].projectId ?? list[0].id ?? list[0].project_id;
        if (firstId) setProjectId(String(firstId));
      }
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Failed to load projects.');
    } finally {
      setLoading(false);
    }
  }, [contractorId, projectId]);

  const loadChecklist = useCallback(async () => {
    if (!contractorId || !projectId) {
      setChecklist(null);
      return;
    }
    setChecklistLoading(true);
    setError('');
    try {
      const data = await apiService.contractors.getProjectFileChecklist(contractorId, projectId);
      setChecklist(data);
      setExpanded((prev) => prev || data?.categories?.[0]?.key || '');
    } catch (err) {
      setChecklist(null);
      setError(err?.response?.data?.message || err?.message || 'Failed to load project file checklist.');
    } finally {
      setChecklistLoading(false);
    }
  }, [contractorId, projectId]);

  useEffect(() => {
    if (!authLoading && contractorId) loadProjects();
    else if (!authLoading) setLoading(false);
  }, [authLoading, contractorId, loadProjects]);

  useEffect(() => {
    if (!authLoading && contractorId && projectId) loadChecklist();
  }, [authLoading, contractorId, projectId, loadChecklist]);

  const handleUploadClick = (itemId) => {
    setUploadingItemId(itemId);
    fileInputRef.current?.click();
  };

  const handleFileChange = async (event) => {
    const file = event.target.files?.[0];
    const itemId = uploadingItemId;
    event.target.value = '';
    if (!file || !itemId || !contractorId || !projectId) return;

    setError('');
    setSuccess('');
    setChecklistLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const data = await apiService.contractors.uploadChecklistDocument(
        contractorId,
        projectId,
        itemId,
        formData
      );
      setChecklist(data);
      setSuccess('Document uploaded and linked to the checklist item.');
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Upload failed.');
    } finally {
      setUploadingItemId(null);
      setChecklistLoading(false);
    }
  };

  if (authLoading || (loading && !error)) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!contractorId) {
    return (
      <Box sx={{ p: 3, maxWidth: 720, mx: 'auto' }}>
        <Alert severity="warning">
          Your account is not linked to a contractor company. Contact an administrator to enable file uploads.
        </Alert>
      </Box>
    );
  }

  const progress = checklist?.progress;

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 960, mx: 'auto' }}>
      <input
        ref={fileInputRef}
        type="file"
        hidden
        onChange={handleFileChange}
      />

      <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/contractor-dashboard')} sx={{ mb: 2 }}>
        Back to dashboard
      </Button>

      <Paper
        elevation={0}
        sx={{
          p: { xs: 2, md: 2.5 },
          mb: 3,
          borderRadius: 3,
          background: `linear-gradient(135deg, ${brand.main} 0%, ${brand.dark} 100%)`,
          color: brand.onPrimary,
        }}
      >
        <Stack direction="row" spacing={1.5} alignItems="center">
          <FolderOpenIcon sx={{ fontSize: 36, opacity: 0.9 }} />
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 700 }}>Project file uploads</Typography>
            <Typography variant="body2" sx={{ opacity: 0.9 }}>
              Submit post-award documents required before and during contract execution.
            </Typography>
          </Box>
        </Stack>
      </Paper>

      {error ? <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert> : null}
      {success ? <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess('')}>{success}</Alert> : null}

      <Paper variant="outlined" sx={{ p: 2, mb: 2, borderRadius: 2 }}>
        <FormControl fullWidth size="small">
          <InputLabel id="contractor-checklist-project-label">Project</InputLabel>
          <Select
            labelId="contractor-checklist-project-label"
            label="Project"
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
          >
            {projects.map((p) => {
              const id = p.projectId ?? p.id ?? p.project_id;
              const name = p.projectName ?? p.name ?? `Project #${id}`;
              return (
                <MenuItem key={id} value={String(id)}>{name}</MenuItem>
              );
            })}
          </Select>
        </FormControl>
      </Paper>

      {checklistLoading && !checklist ? (
        <Box sx={{ py: 4, display: 'flex', justifyContent: 'center' }}>
          <CircularProgress />
        </Box>
      ) : null}

      {checklist ? (
        <>
          <Paper variant="outlined" sx={{ p: 2, mb: 2, borderRadius: 2 }}>
            <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
              Your upload progress: {progress?.completionPct ?? 0}%
            </Typography>
            <LinearProgress variant="determinate" value={progress?.completionPct ?? 0} sx={{ height: 8, borderRadius: 1 }} />
            <Typography variant="caption" color="text.secondary">
              {progress?.satisfiedRequired ?? 0} of {progress?.requiredItems ?? 0} required contractor items submitted
            </Typography>
          </Paper>

          {checklist.categories?.map((category) => (
            <Accordion
              key={category.key}
              expanded={expanded === category.key}
              onChange={(_, isExpanded) => setExpanded(isExpanded ? category.key : false)}
              sx={{ mb: 1, borderRadius: '8px !important', '&:before': { display: 'none' } }}
            >
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography sx={{ fontWeight: 600 }}>{category.label}</Typography>
              </AccordionSummary>
              <AccordionDetails>
                <Stack spacing={1.5}>
                  {(category.items || []).map((item) => {
                    const effectiveStatus = item.links?.length && item.status === 'missing' ? 'uploaded' : item.status;
                    const meta = STATUS_META[effectiveStatus] || STATUS_META.missing;
                    return (
                      <Paper key={item.itemId} variant="outlined" sx={{ p: 1.5, borderRadius: 1.5 }}>
                        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} justifyContent="space-between" alignItems={{ sm: 'center' }}>
                          <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                              <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>{item.itemLabel}</Typography>
                              {item.isRequired ? <Chip size="small" label="Required" color="primary" variant="outlined" /> : null}
                              <Chip size="small" label={meta.label} color={meta.color} />
                            </Stack>
                            {item.helpText ? (
                              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                                {item.helpText}
                              </Typography>
                            ) : null}
                          </Box>
                          <Button
                            size="small"
                            variant="contained"
                            startIcon={<CloudUploadIcon />}
                            disabled={checklistLoading || uploadingItemId === item.itemId}
                            onClick={() => handleUploadClick(item.itemId)}
                          >
                            {uploadingItemId === item.itemId ? 'Uploading…' : 'Upload'}
                          </Button>
                        </Stack>
                        {item.links?.length ? (
                          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                            Linked: {item.links.map((l) => l.originalFileName || l.description).filter(Boolean).join(', ')}
                          </Typography>
                        ) : null}
                      </Paper>
                    );
                  })}
                </Stack>
              </AccordionDetails>
            </Accordion>
          ))}
        </>
      ) : null}

      {!checklistLoading && projectId && !checklist?.categories?.length ? (
        <Alert severity="info">No contractor upload slots are configured for this project yet.</Alert>
      ) : null}
    </Box>
  );
}
