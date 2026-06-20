import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Box, Button, CircularProgress, Dialog, DialogContent, DialogTitle,
  IconButton, List, ListItem, ListItemIcon, ListItemText, Stack, Typography,
} from '@mui/material';
import {
  Description as DescriptionIcon,
  Download as DownloadIcon,
  OpenInNew as OpenInNewIcon,
  PictureAsPdf as PdfIcon,
  Visibility as VisibilityIcon,
  Close as CloseIcon,
} from '@mui/icons-material';
import { Link as RouterLink } from 'react-router-dom';
import apiService from '../../api';
import {
  canPreviewProjectDocumentInline,
  getProjectDocumentFileUrl,
  inferProjectDocumentMimeType,
  isProjectDocumentImage,
} from '../../utils/projectDocumentFileUtils';

export default function InceptionConceptNoteAttachments({ projectId }) {
  const [loading, setLoading] = useState(true);
  const [attachments, setAttachments] = useState([]);
  const [previewDoc, setPreviewDoc] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [previewMime, setPreviewMime] = useState('');
  const previewObjectUrlRef = useRef('');

  const cleanupPreviewUrl = () => {
    if (previewObjectUrlRef.current) {
      window.URL.revokeObjectURL(previewObjectUrlRef.current);
      previewObjectUrlRef.current = '';
    }
  };

  const loadAttachments = useCallback(async () => {
    if (!projectId) {
      setAttachments([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const rows = await apiService.documents.getProjectDocuments(projectId);
      const list = (Array.isArray(rows) ? rows : []).filter(
        (doc) => String(doc.documentType || '').toLowerCase() === 'concept_note'
      );
      setAttachments(list);
    } catch {
      setAttachments([]);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    loadAttachments();
    return () => cleanupPreviewUrl();
  }, [loadAttachments]);

  const handleDownload = async (doc) => {
    const filePath = doc.documentPath || doc.filePath;
    const fileUrl = getProjectDocumentFileUrl(filePath);
    let fileName = doc.originalFileName || doc.fileName || doc.description || 'concept-note';
    if (!fileName.includes('.')) {
      const ext = (filePath || '').match(/\.([^.]+)$/);
      if (ext) fileName = `${fileName}${ext[0]}`;
    }
    try {
      const response = await fetch(fileUrl, { method: 'GET', credentials: 'omit', mode: 'cors' });
      if (!response.ok) throw new Error('Download failed');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch {
      window.open(fileUrl, '_blank', 'noopener,noreferrer');
    }
  };

  const handlePreview = (doc) => {
    cleanupPreviewUrl();
    const filePath = doc.documentPath || doc.filePath;
    setPreviewDoc(doc);
    setPreviewMime(inferProjectDocumentMimeType(doc));
    setPreviewUrl(getProjectDocumentFileUrl(filePath));
  };

  const handleClosePreview = () => {
    setPreviewDoc(null);
    setPreviewUrl('');
    setPreviewMime('');
    cleanupPreviewUrl();
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 2 }}>
        <CircularProgress size={18} />
        <Typography variant="caption" color="text.secondary">Loading attached concept notes…</Typography>
      </Box>
    );
  }

  if (!attachments.length) {
    return (
      <Box sx={{ mt: 2, p: 1.5, bgcolor: 'action.hover', borderRadius: 1 }}>
        <Typography variant="body2" color="text.secondary">
          No concept note file uploaded yet. Upload a <strong>Concept Note</strong> document on the
          {' '}<RouterLink to={`/projects/${projectId}?tab=documents`}>Documents</RouterLink> tab.
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ mt: 2 }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
        <Typography variant="subtitle2" fontWeight={700}>
          Attached concept note{attachments.length > 1 ? 's' : ''}
        </Typography>
        <Button
          size="small"
          component={RouterLink}
          to={`/projects/${projectId}?tab=documents`}
          endIcon={<OpenInNewIcon />}
        >
          All documents
        </Button>
      </Stack>
      <List dense disablePadding>
        {attachments.map((doc) => {
          const name = doc.originalFileName || doc.description || 'Concept Note';
          const canPreview = canPreviewProjectDocumentInline(doc);
          return (
            <ListItem
              key={doc.id || doc.documentId || name}
              sx={{
                px: 1.5, py: 0.75, mb: 0.5,
                bgcolor: 'background.default', borderRadius: 1, border: '1px solid', borderColor: 'divider',
              }}
              secondaryAction={(
                <Stack direction="row" spacing={0.5}>
                  {canPreview && (
                    <IconButton size="small" aria-label="Preview" onClick={() => handlePreview(doc)}>
                      <VisibilityIcon fontSize="small" />
                    </IconButton>
                  )}
                  <IconButton size="small" aria-label="Download" onClick={() => handleDownload(doc)}>
                    <DownloadIcon fontSize="small" />
                  </IconButton>
                </Stack>
              )}
            >
              <ListItemIcon sx={{ minWidth: 36 }}>
                {String(name).toLowerCase().endsWith('.pdf') ? <PdfIcon color="error" /> : <DescriptionIcon color="primary" />}
              </ListItemIcon>
              <ListItemText
                primary={name}
                secondary={doc.description && doc.description !== name ? doc.description : 'Uploaded concept note file'}
              />
            </ListItem>
          );
        })}
      </List>

      <Dialog open={Boolean(previewDoc)} onClose={handleClosePreview} maxWidth="lg" fullWidth>
        <DialogTitle sx={{ pr: 6 }}>
          {previewDoc?.originalFileName || previewDoc?.description || 'Concept Note'}
          <IconButton
            aria-label="close"
            onClick={handleClosePreview}
            sx={{ position: 'absolute', right: 8, top: 8 }}
          >
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers sx={{ p: 0, minHeight: 420 }}>
          {previewDoc && previewUrl && (
            isProjectDocumentImage(previewDoc) ? (
              <Box component="img" src={previewUrl} alt="" sx={{ width: '100%', maxHeight: '75vh', objectFit: 'contain', bgcolor: '#111' }} />
            ) : previewMime === 'application/pdf' || String(previewDoc.originalFileName || '').toLowerCase().endsWith('.pdf') ? (
              <Box component="iframe" src={previewUrl} title="Concept note preview" sx={{ width: '100%', height: '75vh', border: 0 }} />
            ) : previewMime.startsWith('text/') ? (
              <Box component="iframe" src={previewUrl} title="Concept note preview" sx={{ width: '100%', height: '75vh', border: 0 }} />
            ) : (
              <Box sx={{ p: 3, textAlign: 'center' }}>
                <Typography color="text.secondary" sx={{ mb: 2 }}>Preview not available for this file type.</Typography>
                <Button variant="contained" startIcon={<DownloadIcon />} onClick={() => handleDownload(previewDoc)}>
                  Download file
                </Button>
              </Box>
            )
          )}
        </DialogContent>
      </Dialog>
    </Box>
  );
}
