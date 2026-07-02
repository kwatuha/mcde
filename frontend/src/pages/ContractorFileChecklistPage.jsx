import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  FormControl,
  IconButton,
  InputLabel,
  LinearProgress,
  List,
  ListItem,
  ListItemText,
  MenuItem,
  Paper,
  Select,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import DownloadIcon from '@mui/icons-material/Download';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import RefreshIcon from '@mui/icons-material/Refresh';
import { useAuth } from '../context/AuthContext';
import apiService from '../api';
import { brand } from '../theme/colorTokens';
import { getProjectDocumentFileUrl } from '../utils/projectDocumentFileUtils';

const STATUS_META = {
  missing: { label: 'Missing', color: 'error' },
  uploaded: { label: 'Uploaded', color: 'success' },
};

export default function ContractorFileChecklistPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const preselectedProjectId = searchParams.get('projectId');
  const { user, authLoading } = useAuth();
  const contractorId = user?.contractorId;
  const profile = user?.contractorProfile;
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

  const refreshAll = useCallback(async () => {
    await loadProjects();
    if (projectId) await loadChecklist();
  }, [loadProjects, loadChecklist, projectId]);

  useEffect(() => {
    if (preselectedProjectId) {
      setProjectId(preselectedProjectId);
    }
  }, [preselectedProjectId]);

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

  const progress = checklist?.progress;
  const completionPct = progress?.completionPct ?? 0;
  const requiredItems = progress?.requiredItems ?? 0;
  const satisfiedRequired = progress?.satisfiedRequired ?? 0;
  const missingRequired = Math.max(requiredItems - satisfiedRequired, 0);

  const totalUploadSlots = useMemo(() => {
    if (!checklist?.categories) return 0;
    return checklist.categories.reduce(
      (sum, cat) => sum + (cat.items?.length || 0),
      0
    );
  }, [checklist]);

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

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, width: '100%', minWidth: { xs: 0, sm: 720 }, maxWidth: 1200, mx: 'auto' }}>
      <input
        ref={fileInputRef}
        type="file"
        hidden
        onChange={handleFileChange}
      />

      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/contractor-dashboard')} size="small">
          Dashboard
        </Button>
        <Tooltip title="Refresh checklist">
          <IconButton
            size="small"
            onClick={refreshAll}
            disabled={loading || checklistLoading}
            sx={{ color: 'text.secondary' }}
          >
            <RefreshIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Stack>

      {error ? <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert> : null}
      {success ? <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess('')}>{success}</Alert> : null}

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
              Project files
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
              {profile?.companyName || 'Your company'} — submit required contract and compliance documents.
            </Typography>
          </Box>
          <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap sx={{ flexShrink: 0 }}>
            <Chip size="small" label={`Progress ${completionPct}%`} variant="outlined" color="primary" />
            <Chip
              size="small"
              label={`Uploaded ${satisfiedRequired}/${requiredItems || '—'}`}
              color="success"
              variant="outlined"
            />
            <Chip size="small" label={`Missing ${missingRequired}`} color="warning" variant="outlined" />
          </Stack>
        </Stack>

        <Divider sx={{ mb: 2 }} />

        <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ sm: 'center' }} spacing={1.5} sx={{ mb: 2 }}>
          <Typography variant="body1" sx={{ fontWeight: 600, flex: 1 }}>
            Select project
          </Typography>
          <FormControl fullWidth size="small" sx={{ maxWidth: { sm: 420 } }}>
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
        </Stack>

        {checklistLoading && !checklist ? (
          <Box sx={{ py: 4, display: 'flex', justifyContent: 'center' }}>
            <CircularProgress />
          </Box>
        ) : null}

        {checklist ? (
          <>
            <Paper variant="outlined" sx={{ p: 2, mb: 2, borderRadius: 2, bgcolor: brand.surface }}>
              <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={1} sx={{ mb: 1 }}>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  Upload progress for this project
                </Typography>
                {totalUploadSlots > 0 ? (
                  <Typography variant="caption" color="text.secondary">
                    {totalUploadSlots} checklist item{totalUploadSlots === 1 ? '' : 's'}
                  </Typography>
                ) : null}
              </Stack>
              <LinearProgress
                variant="determinate"
                value={completionPct}
                sx={{ height: 8, borderRadius: 1, mb: 0.75 }}
              />
              <Typography variant="caption" color="text.secondary">
                {satisfiedRequired} of {requiredItems} required contractor items submitted
              </Typography>
            </Paper>

            <Typography variant="body1" sx={{ fontWeight: 600, mb: 1.5 }}>
              Required documents
            </Typography>

            {checklist.categories?.map((category) => (
              <Accordion
                key={category.key}
                expanded={expanded === category.key}
                onChange={(_, isExpanded) => setExpanded(isExpanded ? category.key : false)}
                variant="outlined"
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
                          <Stack
                            direction={{ xs: 'column', sm: 'row' }}
                            spacing={1}
                            justifyContent="space-between"
                            alignItems={{ sm: 'center' }}
                          >
                            <Box sx={{ flex: 1, minWidth: 0 }}>
                              <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                                <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>{item.itemLabel}</Typography>
                                {item.isRequired ? (
                                  <Chip size="small" label="Required" color="primary" variant="outlined" />
                                ) : null}
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
                            <List dense disablePadding sx={{ mt: 1 }}>
                              {item.links.map((link) => {
                                const fileUrl = getProjectDocumentFileUrl(link.documentPath);
                                const fileName = link.originalFileName || link.description || `Document #${link.sourceId}`;
                                return (
                                  <ListItem
                                    key={link.linkId || `${item.itemId}-${link.sourceId}`}
                                    disableGutters
                                    secondaryAction={fileUrl ? (
                                      <Stack direction="row" spacing={0.5}>
                                        <Tooltip title="Open in new tab">
                                          <IconButton
                                            size="small"
                                            component="a"
                                            href={fileUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                          >
                                            <OpenInNewIcon fontSize="small" />
                                          </IconButton>
                                        </Tooltip>
                                        <Tooltip title="Download">
                                          <IconButton
                                            size="small"
                                            component="a"
                                            href={fileUrl}
                                            download={fileName}
                                          >
                                            <DownloadIcon fontSize="small" />
                                          </IconButton>
                                        </Tooltip>
                                      </Stack>
                                    ) : null}
                                  >
                                    <ListItemText
                                      primary={fileName}
                                      secondary={link.documentPath ? 'Uploaded file' : 'Linked document'}
                                      primaryTypographyProps={{ variant: 'body2', fontWeight: 600 }}
                                      secondaryTypographyProps={{ variant: 'caption' }}
                                    />
                                  </ListItem>
                                );
                              })}
                            </List>
                          ) : (
                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                              No files uploaded yet for this item.
                            </Typography>
                          )}
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
      </Paper>
    </Box>
  );
}
