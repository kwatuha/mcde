import { useCallback, useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  LinearProgress,
  List,
  ListItem,
  ListItemText,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import LinkIcon from '@mui/icons-material/Link';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import projectFileChecklistService from '../../api/projectFileChecklistService';
import projectService from '../../api/projectService';
import GenericFileUploadModal from '../GenericFileUploadModal';
import { getProjectDocumentFileUrl } from '../../utils/projectDocumentFileUtils';

const STATUS_META = {
  missing: { label: 'Missing', color: 'error' },
  uploaded: { label: 'Uploaded', color: 'success' },
  not_applicable: { label: 'N/A', color: 'default' },
  waived: { label: 'Waived', color: 'warning' },
};

const DOCUMENT_TYPE_OPTIONS = [
  { value: 'concept_note', label: 'Concept Note / Inception' },
  { value: 'award_letter', label: 'Award Letter' },
  { value: 'evaluation_report', label: 'Evaluation Report' },
  { value: 'contract_agreement', label: 'Contract Agreement' },
  { value: 'completion_letter', label: 'Completion Letter' },
  { value: 'warning_letter', label: 'Warning / Notice Letter' },
  { value: 'payment_certificate', label: 'Payment Certificate' },
  { value: 'invoice', label: 'Invoice' },
  { value: 'receipt', label: 'Receipt' },
  { value: 'progress_photo', label: 'Progress Photo' },
  { value: 'other', label: 'Other Document' },
];

function categoryProgress(category) {
  if (!category.required) return 100;
  return category.required > 0
    ? Math.round((category.satisfied / category.required) * 100)
    : 100;
}

function linkSourceLabel(link) {
  if (link.sourceType === 'procurement_attachment') {
    return `procurement attachment${link.procurementStage ? ` (${link.procurementStage})` : ''}`;
  }
  if (link.sourceType === 'certificate') return 'payment certificate';
  return link.documentType || 'project document';
}

export default function ProjectFileChecklistPanel({ projectId, canEdit = false, onProgressChange }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState('');
  const [uploadItem, setUploadItem] = useState(null);
  const [linkItem, setLinkItem] = useState(null);
  const [projectDocuments, setProjectDocuments] = useState([]);
  const [selectedDocumentId, setSelectedDocumentId] = useState('');
  const [naItem, setNaItem] = useState(null);
  const [naReason, setNaReason] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setError('');
    try {
      const result = await projectFileChecklistService.getChecklist(projectId);
      setData(result);
      onProgressChange?.(result?.progress || null);
      setExpanded((prev) => prev || result?.categories?.[0]?.key || '');
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Failed to load project file checklist.');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [projectId, onProgressChange]);

  useEffect(() => {
    load();
  }, [load]);

  const progress = data?.progress;

  const uploadConfig = useMemo(() => {
    if (!uploadItem) return null;
    const suggested = uploadItem.suggestedDocumentType || 'other';
    const options = DOCUMENT_TYPE_OPTIONS.some((opt) => opt.value === suggested)
      ? DOCUMENT_TYPE_OPTIONS
      : [{ value: suggested, label: suggested }, ...DOCUMENT_TYPE_OPTIONS];
    return {
      options,
      optionsLabel: 'Document type',
      apiCallKey: 'documentType',
    };
  }, [uploadItem]);

  const handleUpload = async (formData) => {
    await projectService.documents.uploadDocument(formData);
    if (uploadItem?.itemId) {
      const docs = await projectService.documents.getProjectDocuments(projectId);
      const docType = String(formData.get('documentType') || '').toLowerCase();
      const sorted = [...(Array.isArray(docs) ? docs : [])].sort(
        (a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0)
      );
      const match = sorted.find((doc) => String(doc.documentType || '').toLowerCase() === docType);
      if (match) {
        await projectFileChecklistService.linkDocument(
          projectId,
          uploadItem.itemId,
          match.id || match.documentId
        );
      }
    }
    await load();
    setUploadItem(null);
  };

  const openLinkDialog = async (item) => {
    setLinkItem(item);
    setSelectedDocumentId('');
    try {
      const docs = await projectService.documents.getProjectDocuments(projectId);
      setProjectDocuments(Array.isArray(docs) ? docs : []);
    } catch {
      setProjectDocuments([]);
    }
  };

  const handleLinkExisting = async () => {
    if (!linkItem || !selectedDocumentId) return;
    setBusy(true);
    try {
      await projectFileChecklistService.linkDocument(projectId, linkItem.itemId, Number(selectedDocumentId));
      setLinkItem(null);
      await load();
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Failed to link document.');
    } finally {
      setBusy(false);
    }
  };

  const handleMarkNa = async () => {
    if (!naItem || !naReason.trim()) return;
    setBusy(true);
    try {
      await projectFileChecklistService.updateItem(projectId, naItem.itemId, {
        status: 'not_applicable',
        waivedReason: naReason.trim(),
      });
      setNaItem(null);
      setNaReason('');
      await load();
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Failed to update item.');
    } finally {
      setBusy(false);
    }
  };

  const handleUnlink = async (linkId) => {
    setBusy(true);
    try {
      await projectFileChecklistService.unlinkDocument(projectId, linkId);
      await load();
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Failed to remove link.');
    } finally {
      setBusy(false);
    }
  };

  const handleDownloadPdf = async () => {
    setBusy(true);
    setError('');
    try {
      const blob = await projectFileChecklistService.downloadAuditPdf(projectId);
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `project-file-audit-${projectId}.pdf`;
      anchor.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Failed to download audit PDF.');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ py: 4, display: 'flex', justifyContent: 'center' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error && !data) {
    return <Alert severity="error">{error}</Alert>;
  }

  return (
    <Box>
      {error ? <Alert severity="warning" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert> : null}

      {data?.phaseGates?.length ? (
        <Stack spacing={1} sx={{ mb: 2 }}>
          {data.phaseGates.map((gate) => (
            <Alert
              key={gate.key}
              severity={gate.passed ? 'success' : 'warning'}
              icon={gate.passed ? <CheckCircleIcon fontSize="inherit" /> : undefined}
            >
              <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>{gate.label}</Typography>
              <Typography variant="body2">
                {gate.passed ? 'Requirements met for gated milestones.' : gate.message}
              </Typography>
            </Alert>
          ))}
        </Stack>
      ) : null}

      <Paper variant="outlined" sx={{ p: 2, mb: 2, borderRadius: 2 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ md: 'center' }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>Project File Checklist Guide</Typography>
            <Typography variant="body2" color="text.secondary">
              County audit register for pre-contract through contract administration documents.
            </Typography>
          </Box>
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
            <Button
              variant="outlined"
              size="small"
              startIcon={<PictureAsPdfIcon />}
              disabled={busy}
              onClick={handleDownloadPdf}
            >
              Download audit PDF
            </Button>
          </Stack>
          <Stack spacing={0.5} sx={{ minWidth: 220 }}>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              Overall completeness: {progress?.completionPct ?? 0}%
            </Typography>
            <LinearProgress
              variant="determinate"
              value={progress?.completionPct ?? 0}
              sx={{ height: 8, borderRadius: 1 }}
            />
            <Typography variant="caption" color="text.secondary">
              {progress?.satisfiedRequired ?? 0} of {progress?.requiredItems ?? 0} required items satisfied
            </Typography>
          </Stack>
        </Stack>
      </Paper>

      {(data?.categories || []).map((category) => {
        const catProgress = progress?.categories?.find((c) => c.key === category.key);
        const pct = catProgress ? categoryProgress(catProgress) : 0;
        return (
          <Accordion
            key={category.key}
            expanded={expanded === category.key}
            onChange={(_, isExpanded) => setExpanded(isExpanded ? category.key : false)}
            sx={{ mb: 1, '&:before': { display: 'none' } }}
          >
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Box sx={{ width: '100%', pr: 1 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
                  <Typography sx={{ fontWeight: 700 }}>{category.label}</Typography>
                  <Chip size="small" label={`${pct}%`} color={pct >= 100 ? 'success' : 'default'} />
                </Stack>
                <LinearProgress variant="determinate" value={pct} sx={{ mt: 1, height: 6, borderRadius: 1 }} />
              </Box>
            </AccordionSummary>
            <AccordionDetails>
              <Stack spacing={1.5}>
                {(category.items || []).map((item) => {
                  const meta = STATUS_META[item.status] || STATUS_META.missing;
                  const effectiveStatus = item.links?.length && item.status === 'missing' ? 'uploaded' : item.status;
                  const displayMeta = STATUS_META[effectiveStatus] || meta;
                  return (
                    <Paper key={item.itemId} variant="outlined" sx={{ p: 1.5, borderRadius: 1.5 }}>
                      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} justifyContent="space-between">
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>{item.itemLabel}</Typography>
                            {item.isRequired ? <Chip size="small" label="Required" color="primary" variant="outlined" /> : null}
                            <Chip size="small" label={displayMeta.label} color={displayMeta.color} />
                          </Stack>
                          {item.waivedReason ? (
                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                              Reason: {item.waivedReason}
                            </Typography>
                          ) : null}
                        </Box>
                        {canEdit ? (
                          <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                            <Button size="small" startIcon={<CloudUploadIcon />} onClick={() => setUploadItem(item)}>
                              Upload
                            </Button>
                            <Button size="small" startIcon={<LinkIcon />} onClick={() => openLinkDialog(item)}>
                              Link
                            </Button>
                            <Button size="small" onClick={() => { setNaItem(item); setNaReason(''); }}>
                              Mark N/A
                            </Button>
                          </Stack>
                        ) : null}
                      </Stack>

                      {item.links?.length ? (
                        <List dense sx={{ mt: 1 }}>
                          {item.links.map((link) => (
                            <ListItem
                              key={link.linkId}
                              secondaryAction={canEdit ? (
                                <IconButton edge="end" size="small" disabled={busy} onClick={() => handleUnlink(link.linkId)}>
                                  <DeleteOutlineIcon fontSize="small" />
                                </IconButton>
                              ) : null}
                            >
                              <ListItemText
                                primary={link.originalFileName || link.description || `Document #${link.sourceId}`}
                                secondary={linkSourceLabel(link)}
                              />
                              {link.documentPath ? (
                                <Tooltip title="Open file">
                                  <IconButton
                                    size="small"
                                    component="a"
                                    href={getProjectDocumentFileUrl(link.documentPath)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                  >
                                    <OpenInNewIcon fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                              ) : null}
                            </ListItem>
                          ))}
                        </List>
                      ) : (
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                          No files linked yet.
                        </Typography>
                      )}
                    </Paper>
                  );
                })}
              </Stack>
            </AccordionDetails>
          </Accordion>
        );
      })}

      {uploadItem && uploadConfig ? (
        <GenericFileUploadModal
          open
          onClose={() => setUploadItem(null)}
          title={`Upload — ${uploadItem.itemLabel}`}
          uploadConfig={uploadConfig}
          submitFunction={handleUpload}
          additionalFormData={{
            projectId,
            documentCategory: 'general',
            status: 'pending_review',
            description: uploadItem.itemLabel,
          }}
        />
      ) : null}

      <Dialog open={Boolean(linkItem)} onClose={() => setLinkItem(null)} fullWidth maxWidth="sm">
        <DialogTitle>Link existing document</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {linkItem?.itemLabel}
          </Typography>
          <TextField
            select
            fullWidth
            size="small"
            label="Project document"
            value={selectedDocumentId}
            onChange={(e) => setSelectedDocumentId(e.target.value)}
          >
            {projectDocuments.map((doc) => (
              <MenuItem key={doc.id || doc.documentId} value={doc.id || doc.documentId}>
                {(doc.originalFileName || doc.description || `Document #${doc.id}`)} ({doc.documentType || 'file'})
              </MenuItem>
            ))}
          </TextField>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setLinkItem(null)}>Cancel</Button>
          <Button variant="contained" disabled={!selectedDocumentId || busy} onClick={handleLinkExisting}>
            Link
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(naItem)} onClose={() => setNaItem(null)} fullWidth maxWidth="sm">
        <DialogTitle>Mark as not applicable</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2 }}>{naItem?.itemLabel}</Typography>
          <TextField
            fullWidth
            multiline
            minRows={3}
            label="Reason"
            value={naReason}
            onChange={(e) => setNaReason(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setNaItem(null)}>Cancel</Button>
          <Button variant="contained" disabled={!naReason.trim() || busy} onClick={handleMarkNa}>
            Save
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

ProjectFileChecklistPanel.propTypes = {
  projectId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
  canEdit: PropTypes.bool,
  onProgressChange: PropTypes.func,
};

export function ProjectFileChecklistSummary({ progress, onOpen }) {
  if (!progress) return null;
  return (
    <Paper variant="outlined" sx={{ p: 1.25, borderRadius: 1.5, height: '100%' }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.75 }}>
        <Typography variant="body2" sx={{ fontWeight: 700, color: 'primary.main' }}>
          Project File Checklist
        </Typography>
        {onOpen ? (
          <Button size="small" onClick={onOpen}>Open</Button>
        ) : null}
      </Stack>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
        <CheckCircleIcon color={progress.completionPct >= 100 ? 'success' : 'action'} fontSize="small" />
        <Typography variant="h6" sx={{ fontWeight: 800 }}>{progress.completionPct}%</Typography>
        <Typography variant="caption" color="text.secondary">
          {progress.satisfiedRequired}/{progress.requiredItems} required
        </Typography>
      </Stack>
      <LinearProgress variant="determinate" value={progress.completionPct} sx={{ height: 8, borderRadius: 1 }} />
    </Paper>
  );
}

ProjectFileChecklistSummary.propTypes = {
  progress: PropTypes.object,
  onOpen: PropTypes.func,
};
