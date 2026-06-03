import { useState, useCallback, useEffect, useRef } from 'react';
import {
  Box,
  Typography,
  Paper,
  Tabs,
  Tab,
  Button,
  Stack,
  Backdrop,
  CircularProgress,
  Divider,
  Alert,
  List,
  ListItem,
  ListItemText,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import CloudDownloadIcon from '@mui/icons-material/CloudDownload';
import TableChartIcon from '@mui/icons-material/TableChart';
import SummarizeIcon from '@mui/icons-material/Summarize';
import DownloadIcon from '@mui/icons-material/Download';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import VisibilityIcon from '@mui/icons-material/Visibility';
import apiService from '../api';
import reportsService from '../api/reportsService';
import { exportMEReportExcel, exportMESummaryPdf } from '../utils/meReportExports';

const ACCEPT_UPLOAD =
  'application/pdf,.pdf,.doc,.docx,.xls,.xlsx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function formatBytes(n) {
  if (n == null || Number.isNaN(n)) return '';
  const u = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toFixed(i ? 1 : 0)} ${u[i]}`;
}

function TabPanel({ children, value, index }) {
  if (value !== index) return null;
  return (
    <Box role="tabpanel" sx={{ pt: 2 }}>
      {children}
    </Box>
  );
}

function canPreviewInBrowser(row) {
  const mime = String(row?.mimeType || '').toLowerCase();
  const name = String(row?.originalFileName || '').toLowerCase();
  return mime.includes('pdf') || name.endsWith('.pdf');
}

export default function ReportLibraryPage() {
  const [tab, setTab] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('Working...');
  const [uploadedReports, setUploadedReports] = useState([]);
  const [listError, setListError] = useState(null);
  const [uploadHint, setUploadHint] = useState(null);
  const [reportName, setReportName] = useState('');
  const [reportDescription, setReportDescription] = useState('');
  const fileInputRef = useRef(null);
  const editFileInputRef = useRef(null);

  const [editOpen, setEditOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [replaceFile, setReplaceFile] = useState(null);

  const getCountyRows = useCallback(async () => {
    try {
      const data = await reportsService.getDetailedProjectList();
      return Array.isArray(data) ? data : [];
    } catch (primaryErr) {
      // Fallback: if detailed-report endpoint is unavailable, use the project registry list.
      const fallback = await apiService.projects.getProjects({ limit: 5000 });
      const rows = Array.isArray(fallback?.projects)
        ? fallback.projects
        : Array.isArray(fallback)
          ? fallback
          : [];
      if (!rows.length) throw primaryErr;
      return rows;
    }
  }, []);

  const loadUploadedReports = useCallback(async () => {
    setListError(null);
    try {
      const rows = await reportsService.listReportLibraryUploads();
      setUploadedReports(Array.isArray(rows) ? rows : []);
    } catch (e) {
      setListError(e?.response?.data?.message || e?.message || 'Could not load uploaded reports.');
      setUploadedReports([]);
    }
  }, []);

  useEffect(() => {
    loadUploadedReports();
  }, [loadUploadedReports]);

  const run = useCallback(async (fn, message = 'Working...') => {
    setLoadingMessage(message);
    setLoading(true);
    try {
      await fn();
    } catch (e) {
      window.alert(e?.response?.data?.message || e?.message || 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleDownloadUploaded = (id, fallbackName) =>
    run(async () => {
      const { blob, fileName } = await reportsService.downloadReportLibraryFile(id, fallbackName);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    }, 'Downloading...');

  const handlePreviewUploaded = (row) => {
    const previewWindow = window.open('', '_blank');
    if (previewWindow) {
      previewWindow.document.write('<p style="font-family: sans-serif; padding: 16px;">Loading preview...</p>');
    }

    run(async () => {
      const { blob } = await reportsService.downloadReportLibraryFile(row.id, row.originalFileName);
      const previewBlob = blob.type === 'application/pdf'
        ? blob
        : new Blob([blob], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(previewBlob);

      if (previewWindow) {
        previewWindow.location.href = url;
        setTimeout(() => window.URL.revokeObjectURL(url), 60_000);
      } else {
        const link = document.createElement('a');
        link.href = url;
        link.target = '_blank';
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => window.URL.revokeObjectURL(url), 60_000);
      }
    }, 'Opening preview...');
  };

  const handleDownloadExcel = () =>
    run(async () => {
      const rows = await getCountyRows();
      await exportMEReportExcel(rows);
    }, 'Generating report...');

  const handleSummaryPdf = () =>
    run(async () => {
      const rows = await getCountyRows();
      await exportMESummaryPdf(rows);
    }, 'Generating report...');

  const openEdit = (row) => {
    setEditingId(row.id);
    setEditTitle(row.reportTitle || '');
    setEditDescription(row.reportDescription || '');
    setReplaceFile(null);
    if (editFileInputRef.current) editFileInputRef.current.value = '';
    setEditOpen(true);
  };

  const closeEdit = () => {
    setEditOpen(false);
    setEditingId(null);
    setEditTitle('');
    setEditDescription('');
    setReplaceFile(null);
    if (editFileInputRef.current) editFileInputRef.current.value = '';
  };

  const handleSaveEdit = () => {
    const title = editTitle.trim();
    if (!title || editingId == null) return;
    run(async () => {
      await reportsService.updateReportLibrary(editingId, {
        title,
        description: editDescription,
      });
      if (replaceFile) {
        await reportsService.replaceReportLibraryFile(editingId, replaceFile);
      }
      await loadUploadedReports();
      closeEdit();
    }, 'Saving...');
  };

  const handleDeleteUploaded = (row) => {
    const label = row.reportTitle || row.originalFileName || `report #${row.id}`;
    if (!window.confirm(`Delete "${label}" from the library? This cannot be undone.`)) return;
    run(async () => {
      await reportsService.deleteReportLibrary(row.id);
      await loadUploadedReports();
    }, 'Removing...');
  };

  const onReplaceFilePicked = (e) => {
    const file = e.target?.files?.[0];
    if (!file) return setReplaceFile(null);
    const lower = file.name.toLowerCase();
    const ok = ['.pdf', '.doc', '.docx', '.xls', '.xlsx'].some((x) => lower.endsWith(x));
    if (!ok) {
      window.alert('Please choose a PDF, Word, or Excel file.');
      e.target.value = '';
      return setReplaceFile(null);
    }
    setReplaceFile(file);
  };

  const onFileSelected = async (e) => {
    const file = e.target?.files?.[0];
    e.target.value = '';
    if (!file) return;
    const lower = file.name.toLowerCase();
    const ok = ['.pdf', '.doc', '.docx', '.xls', '.xlsx'].some((x) => lower.endsWith(x));
    if (!ok) return window.alert('Please choose a PDF, Word, or Excel file.');
    const title = reportName.trim();
    if (!title) return window.alert('Please enter a report name before uploading.');

    setUploadHint(null);
    await run(async () => {
      await reportsService.uploadReportLibraryFile(file, {
        title,
        description: reportDescription.trim() || undefined,
      });
      setUploadHint(`Uploaded "${title}". It now appears under Download reports.`);
      setReportName('');
      setReportDescription('');
      await loadUploadedReports();
      setTab(1);
    }, 'Uploading...');
  };

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      <Paper
        elevation={0}
        sx={{
          p: { xs: 2.25, md: 3 },
          borderRadius: 3,
          border: '1px solid',
          borderColor: 'divider',
          boxShadow: '0 8px 24px rgba(15, 23, 42, 0.06)',
        }}
      >
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          justifyContent="space-between"
          alignItems={{ xs: 'stretch', md: 'flex-start' }}
          spacing={2.5}
          sx={{ mb: 2 }}
        >
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="h5" sx={{ fontWeight: 800, mb: 0.5 }}>
              Report Library
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 760, lineHeight: 1.6 }}>
              Upload approved report files and download county-level M&amp;E summaries from one workspace.
            </Typography>
          </Box>
          <Tabs
            value={tab}
            onChange={(_e, v) => setTab(v)}
            variant="standard"
            sx={{
              minHeight: 40,
              alignSelf: { xs: 'stretch', md: 'center' },
              border: '1px solid',
              borderColor: 'divider',
              borderRadius: 2,
              px: 0.5,
              bgcolor: 'background.default',
              '& .MuiTab-root': {
                minHeight: 38,
                minWidth: { xs: 0, sm: 180 },
                flex: { xs: 1, sm: 'initial' },
                textTransform: 'none',
                fontWeight: 700,
              },
              '& .MuiTabs-indicator': { display: 'none' },
            }}
          >
            <Tab icon={<CloudDownloadIcon />} iconPosition="start" label={`Downloads (${uploadedReports.length})`} />
            <Tab icon={<CloudUploadIcon />} iconPosition="start" label="Upload" />
          </Tabs>
        </Stack>

        {listError && <Alert severity="error" sx={{ mb: 2 }}>{listError}</Alert>}
        {uploadHint && <Alert severity="success" sx={{ mb: 2 }}>{uploadHint}</Alert>}

        <TabPanel value={tab} index={0}>
          <Paper variant="outlined" sx={{ p: 2, mb: 2.5, borderRadius: 2.5, bgcolor: 'background.default' }}>
            <Stack
              direction={{ xs: 'column', md: 'row' }}
              alignItems={{ xs: 'stretch', md: 'center' }}
              justifyContent="space-between"
              spacing={2}
            >
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="subtitle1" fontWeight={700}>
                  Monitoring &amp; evaluation exports
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  County-level project workbook plus printable summary, yearly and coverage PDF.
                </Typography>
              </Box>
              <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ flexShrink: 0 }}>
                <Button
                  variant="contained"
                  startIcon={<TableChartIcon />}
                  onClick={handleDownloadExcel}
                  disabled={loading}
                >
                  Excel
                </Button>
                <Button
                  variant="outlined"
                  startIcon={<SummarizeIcon />}
                  onClick={handleSummaryPdf}
                  disabled={loading}
                >
                  PDF summary
                </Button>
              </Stack>
            </Stack>
          </Paper>

          <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'center' }} spacing={1} sx={{ mb: 1.5 }}>
            <Box>
              <Typography variant="subtitle1" fontWeight={700}>
                Uploaded reports
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Approved report files available for download.
              </Typography>
            </Box>
            <Button variant="outlined" startIcon={<CloudUploadIcon />} onClick={() => setTab(1)}>
              Upload report
            </Button>
          </Stack>
          {uploadedReports.length === 0 ? (
            <Alert severity="info">No reports uploaded yet.</Alert>
          ) : (
            <List sx={{ bgcolor: 'background.paper', borderRadius: 1 }}>
              {uploadedReports.map((row) => (
                <ListItem
                  key={row.id}
                  divider
                  secondaryAction={
                    <Stack direction="row" spacing={1}>
                      {canPreviewInBrowser(row) && (
                        <Button size="small" startIcon={<VisibilityIcon />} onClick={() => handlePreviewUploaded(row)}>
                          Preview
                        </Button>
                      )}
                      <Button size="small" startIcon={<DownloadIcon />} onClick={() => handleDownloadUploaded(row.id, row.originalFileName)}>
                        Download
                      </Button>
                      <Button size="small" startIcon={<EditOutlinedIcon />} onClick={() => openEdit(row)}>
                        Edit
                      </Button>
                      <Button size="small" color="error" startIcon={<DeleteOutlineIcon />} onClick={() => handleDeleteUploaded(row)}>
                        Delete
                      </Button>
                    </Stack>
                  }
                >
                  <InsertDriveFileIcon sx={{ mr: 1.5, color: 'text.secondary' }} />
                  <ListItemText
                    primary={row.reportTitle || row.originalFileName}
                    secondary={
                      <>
                        {row.reportDescription || 'No description'}{' '}
                        {row.fileSize ? `- ${formatBytes(Number(row.fileSize))}` : ''}
                      </>
                    }
                  />
                </ListItem>
              ))}
            </List>
          )}
          </TabPanel>

        <TabPanel value={tab} index={1}>
          <Stack spacing={2} sx={{ maxWidth: 640 }}>
            <TextField
              label="Report name"
              value={reportName}
              onChange={(e) => setReportName(e.target.value)}
              fullWidth
              required
            />
            <TextField
              label="Description (optional)"
              value={reportDescription}
              onChange={(e) => setReportDescription(e.target.value)}
              fullWidth
              multiline
              minRows={3}
            />
            <Stack direction="row" spacing={1}>
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPT_UPLOAD}
                hidden
                onChange={onFileSelected}
              />
              <Button
                variant="contained"
                startIcon={<CloudUploadIcon />}
                onClick={() => fileInputRef.current?.click()}
                disabled={!reportName.trim()}
              >
                Select and upload file
              </Button>
            </Stack>
          </Stack>
        </TabPanel>
      </Paper>

      <Dialog open={editOpen} onClose={closeEdit} fullWidth maxWidth="sm">
        <DialogTitle>Edit report</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField label="Report name" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} fullWidth required />
            <TextField label="Description (optional)" value={editDescription} onChange={(e) => setEditDescription(e.target.value)} fullWidth multiline minRows={3} />
            <input ref={editFileInputRef} type="file" accept={ACCEPT_UPLOAD} onChange={onReplaceFilePicked} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeEdit}>Cancel</Button>
          <Button variant="contained" onClick={handleSaveEdit}>Save</Button>
        </DialogActions>
      </Dialog>

      <Backdrop open={loading} sx={{ color: '#fff', zIndex: (t) => t.zIndex.modal + 1 }}>
        <Stack alignItems="center" spacing={1.5}>
          <CircularProgress color="inherit" />
          <Typography variant="body2">{loadingMessage}</Typography>
        </Stack>
      </Backdrop>
    </Box>
  );
}
