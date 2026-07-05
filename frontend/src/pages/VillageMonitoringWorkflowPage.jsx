import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  List,
  ListItem,
  ListItemText,
  MenuItem,
  Paper,
  Snackbar,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import {
  Add as AddIcon,
  CheckCircle as ApproveIcon,
  Description as DescriptionIcon,
  Download as DownloadIcon,
  EditNote as EditNoteIcon,
  History as HistoryIcon,
  Refresh as RefreshIcon,
  Replay as ReturnIcon,
  Send as SendIcon,
  UploadFile as UploadFileIcon,
  Visibility as ViewIcon,
} from '@mui/icons-material';
import { DataGrid } from '@mui/x-data-grid';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import apiService from '../api';
import dataCollectionService from '../api/dataCollectionService';
import villageMonitoringService from '../api/villageMonitoringService';
import ChecklistFormFields from '../components/ChecklistFormFields';
import MonitoringChangeList from '../components/MonitoringChangeList';
import { ROUTES } from '../configs/appConfig';
import {
  canChiefApproveMonitoringReports,
  canSubCountyReviewMonitoringReports,
  canVillageSubmitMonitoringReports,
  canWardReviewMonitoringReports,
} from '../utils/privilegeUtils';

const WARD_EDITABLE_STATUSES = ['pending_ward', 'returned_to_ward'];
const SUBCOUNTY_REVIEWABLE_STATUSES = ['pending_subcounty'];
const CHIEF_REVIEWABLE_STATUSES = ['pending_chief'];
const EXPORTABLE_STATUSES = ['pending_ward', 'pending_subcounty', 'returned_to_ward', 'pending_chief', 'approved'];

function isExportableStatus(status) {
  return EXPORTABLE_STATUSES.includes(status);
}

function isDraftStatus(status) {
  return !status || status === 'draft';
}

const STATUS_COLORS = {
  draft: 'default',
  pending_ward: 'info',
  pending_subcounty: 'warning',
  returned_to_ward: 'error',
  pending_chief: 'secondary',
  approved: 'success',
};

const PROGRESS_OPTIONS = ['on_track', 'delayed', 'stalled', 'completed'];

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('en-KE', { year: 'numeric', month: 'short', day: '2-digit' });
}

function statusLabel(status) {
  return String(status || 'draft').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

const ACTION_LABELS = {
  created: 'Draft created',
  updated: 'Updated',
  ward_revised: 'Ward revision',
  submitted_to_ward: 'Submitted to ward',
  forwarded_to_subcounty: 'Forwarded to sub-county',
  resubmitted_to_subcounty: 'Resubmitted to sub-county',
  returned_to_ward: 'Returned to ward',
  forwarded_to_chief: 'Forwarded to chief officer',
  chief_approved: 'Chief approved — published',
  formatted_report_uploaded: 'Formatted Word report uploaded',
};

function triggerBlobDownload(response, fallbackName) {
  const disposition = response.headers?.['content-disposition'] || '';
  const match = disposition.match(/filename="([^"]+)"/i);
  const filename = match?.[1] || fallbackName;
  const blob = new Blob([response.data], { type: response.headers?.['content-type'] || 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export default function VillageMonitoringWorkflowPage({
  embedded = false,
  initialQueue = null,
  homeRoute = null,
} = {}) {
  const { hasPrivilege, user } = useAuth();
  const [searchParams] = useSearchParams();
  const projectIdFilter = searchParams.get('projectId') || '';
  const queueParam = searchParams.get('queue') || '';
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
  const [queue, setQueue] = useState(initialQueue);
  const [selected, setSelected] = useState(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState([]);
  const [actionOpen, setActionOpen] = useState(false);
  const [actionType, setActionType] = useState('');
  const [comment, setComment] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [editProgress, setEditProgress] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [progressFilter, setProgressFilter] = useState('');
  const [batchSubmitting, setBatchSubmitting] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [formProjects, setFormProjects] = useState([]);
  const [formTemplates, setFormTemplates] = useState([]);
  const [loadingFormResources, setLoadingFormResources] = useState(false);
  const [formProject, setFormProject] = useState(null);
  const [formTemplateId, setFormTemplateId] = useState('');
  const [formStructure, setFormStructure] = useState({ sections: [] });
  const [formVisitDate, setFormVisitDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [formTitle, setFormTitle] = useState('');
  const [formAnswers, setFormAnswers] = useState({});
  const [formProgress, setFormProgress] = useState('');
  const [editAnswers, setEditAnswers] = useState({});
  const [editStructure, setEditStructure] = useState({ sections: [] });
  const [editProjectId, setEditProjectId] = useState(null);
  const [editLoading, setEditLoading] = useState(false);
  const [editWardChanges, setEditWardChanges] = useState([]);
  const [forwardWardChanges, setForwardWardChanges] = useState([]);
  const [forwardLoading, setForwardLoading] = useState(false);
  const [exportingWord, setExportingWord] = useState(false);
  const [formattedReportFile, setFormattedReportFile] = useState(null);
  const [uploadingFormattedReport, setUploadingFormattedReport] = useState(false);

  const canVillage = canVillageSubmitMonitoringReports(user);
  const canWard = canWardReviewMonitoringReports(user);
  const canSubcounty = canSubCountyReviewMonitoringReports(user);
  const canChief = canChiefApproveMonitoringReports(user);

  const defaultQueue = useMemo(() => {
    if (canChief) return 'chief';
    if (canSubcounty) return 'subcounty';
    if (canWard) return 'ward';
    if (canVillage) return 'village';
    return '';
  }, [canChief, canSubcounty, canWard, canVillage]);

  const activeQueue = useMemo(() => {
    if (queueParam) return queueParam;
    if (queue != null && queue !== '') return queue;
    return defaultQueue;
  }, [queueParam, queue, defaultQueue]);

  const listFilters = useMemo(() => {
    const filters = {};
    if (activeQueue === 'all') filters.queue = 'all';
    else if (activeQueue) filters.queue = activeQueue;
    if (projectIdFilter) filters.projectId = projectIdFilter;
    return filters;
  }, [activeQueue, projectIdFilter]);

  const filteredRows = useMemo(() => {
    if (!progressFilter) return rows;
    if (progressFilter === 'attention') {
      return rows.filter((r) => ['stalled', 'delayed'].includes(r.progressStatus));
    }
    return rows.filter((r) => r.progressStatus === progressFilter);
  }, [rows, progressFilter]);

  const draftRowsInView = useMemo(
    () => filteredRows.filter((r) => isDraftStatus(r.workflowStatus)),
    [filteredRows]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await villageMonitoringService.listReports(listFilters);
      setRows(data?.rows || []);
      try {
        const sum = await villageMonitoringService.getSummary();
        setSummary(sum);
      } catch {
        setSummary(null);
      }
    } catch (e) {
      setError(e?.response?.data?.message || e.message || 'Failed to load monitoring reports.');
    } finally {
      setLoading(false);
    }
  }, [listFilters]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (initialQueue != null) setQueue(initialQueue);
  }, [initialQueue]);

  useEffect(() => {
    if (!createOpen) return undefined;
    let cancelled = false;
    (async () => {
      setLoadingFormResources(true);
      try {
        const [projRes, tplList] = await Promise.all([
          apiService.projects.getProjects({ limit: 3000 }),
          dataCollectionService.listTemplates({ category: 'monitoring_checklist' }).catch(() => []),
        ]);
        if (cancelled) return;
        const rawProjects = Array.isArray(projRes) ? projRes : (projRes?.projects || projRes?.data || []);
        setFormProjects(
          rawProjects.map((p) => ({
            id: p.project_id ?? p.projectId ?? p.id,
            projectName: p.projectName ?? p.name,
            name: p.name ?? p.projectName,
          })).filter((p) => p.id != null)
        );
        let templates = Array.isArray(tplList) ? tplList : [];
        if (!templates.length) {
          templates = await dataCollectionService.listTemplates().catch(() => []);
        }
        const projectTemplates = (templates || []).filter(
          (t) => !Array.isArray(t.allowedSubjectTypes) || t.allowedSubjectTypes.includes('project')
        );
        setFormTemplates(projectTemplates);
        const preferred =
          projectTemplates.find((t) => String(t.description || '').includes('templateKey:village-admin-field-monitoring'))
          || projectTemplates.find((t) => /village field monitoring/i.test(String(t.name || '')))
          || (projectTemplates.length === 1 ? projectTemplates[0] : null);
        if (preferred) {
          setFormTemplateId(String(preferred.templateId));
          setFormStructure(preferred.structure || { sections: [] });
        }
      } catch {
        if (!cancelled) {
          setFormProjects([]);
          setFormTemplates([]);
        }
      } finally {
        if (!cancelled) setLoadingFormResources(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [createOpen]);

  const resetCreateForm = () => {
    setFormProject(null);
    setFormTemplateId('');
    setFormStructure({ sections: [] });
    setFormVisitDate(new Date().toISOString().slice(0, 10));
    setFormTitle('');
    setFormAnswers({});
    setFormProgress('');
  };

  const openCreateForm = () => {
    resetCreateForm();
    setCreateOpen(true);
  };

  const openEditForm = async (row) => {
    setSelected(row);
    setEditTitle(row.title || '');
    setEditProgress(row.progressStatus || '');
    setEditAnswers({});
    setEditStructure({ sections: [] });
    setEditProjectId(row.projectId ?? null);
    setEditWardChanges([]);
    setEditOpen(true);
    setEditLoading(true);
    try {
      const data = await villageMonitoringService.getReport(row.submissionId, { detail: true });
      setEditTitle(data.title || '');
      setEditProgress(data.progressStatus || '');
      setEditAnswers(data.answers || {});
      setEditStructure(data.structure || { sections: [] });
      setEditProjectId(data.projectId ?? null);
      setEditWardChanges(data.wardChangesFromVillage || []);
    } catch {
      setSnackbar({ open: true, message: 'Could not load checklist for editing.', severity: 'error' });
    } finally {
      setEditLoading(false);
    }
  };

  const saveCreate = async () => {
    if (!formProject?.id) {
      setSnackbar({ open: true, message: 'Select a project.', severity: 'warning' });
      return;
    }
    if (!formTemplateId) {
      setSnackbar({ open: true, message: 'Select a monitoring checklist template.', severity: 'warning' });
      return;
    }
    setBusy(true);
    try {
      await villageMonitoringService.createReport({
        projectId: formProject.id,
        templateId: Number(formTemplateId),
        visitDate: formVisitDate || null,
        title: formTitle.trim() || null,
        answers: formAnswers,
        progressStatus: formProgress || undefined,
      });
      setCreateOpen(false);
      resetCreateForm();
      setSnackbar({ open: true, message: 'Monitoring report draft created. Complete the checklist and submit to ward when ready.', severity: 'success' });
      await load();
    } catch (e) {
      setSnackbar({
        open: true,
        message: e?.response?.data?.message || e.message || 'Failed to create monitoring report.',
        severity: 'error',
      });
    } finally {
      setBusy(false);
    }
  };

  const openWorkflowAction = async (row, type) => {
    setSelected(row);
    setActionType(type);
    setComment('');
    setForwardWardChanges([]);
    setActionOpen(true);
    if (type === 'forward_subcounty') {
      setForwardLoading(true);
      try {
        const data = await villageMonitoringService.getReport(row.submissionId, { detail: true });
        setForwardWardChanges(data?.wardChangesFromVillage || []);
      } catch {
        setForwardWardChanges([]);
      } finally {
        setForwardLoading(false);
      }
    }
  };

  const openHistory = async (row) => {
    setSelected(row);
    setHistoryOpen(true);
    try {
      const data = await villageMonitoringService.getHistory(row.submissionId);
      setHistory(data?.actions || []);
    } catch {
      setHistory([]);
    }
  };

  const openDetail = async (row) => {
    setSelected(row);
    setDetailOpen(true);
    setFormattedReportFile(null);
    setDetailLoading(true);
    try {
      const data = await villageMonitoringService.getReport(row.submissionId, { detail: true });
      setDetail(data);
    } catch {
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const rowFromDetail = () => {
    if (!selected) return null;
    return {
      ...selected,
      workflowStatus: detail?.workflowStatus ?? selected.workflowStatus,
      title: detail?.title ?? selected.title,
      progressStatus: detail?.progressStatus ?? selected.progressStatus,
      projectId: detail?.projectId ?? selected.projectId,
    };
  };

  const startReviseFromDetail = () => {
    const row = rowFromDetail();
    if (!row) return;
    setDetailOpen(false);
    openEditForm(row);
  };

  const startForwardFromDetail = () => {
    const row = rowFromDetail();
    if (!row) return;
    setDetailOpen(false);
    openWorkflowAction(row, 'forward_subcounty');
  };

  const startSubmitFromDetail = () => {
    const row = rowFromDetail();
    if (!row) return;
    setDetailOpen(false);
    setSelected(row);
    setActionType('submit');
    setActionOpen(true);
  };

  const startFillFormFromDetail = () => {
    const row = rowFromDetail();
    if (!row) return;
    setDetailOpen(false);
    openEditForm(row);
  };

  const startReturnFromDetail = () => {
    const row = rowFromDetail();
    if (!row) return;
    setDetailOpen(false);
    openWorkflowAction(row, 'return_ward');
  };

  const startForwardChiefFromDetail = () => {
    const row = rowFromDetail();
    if (!row) return;
    setDetailOpen(false);
    openWorkflowAction(row, 'forward_chief');
  };

  const startApproveFromDetail = () => {
    const row = rowFromDetail();
    if (!row) return;
    setDetailOpen(false);
    openWorkflowAction(row, 'approve');
  };

  const handleExportWord = async () => {
    if (!selected?.submissionId) return;
    setExportingWord(true);
    try {
      const response = await villageMonitoringService.exportWordReport(selected.submissionId);
      triggerBlobDownload(response, `monitoring-report-${selected.submissionId}.docx`);
      setSnackbar({ open: true, message: 'Word report downloaded.', severity: 'success' });
    } catch (e) {
      setSnackbar({
        open: true,
        message: e?.response?.data?.message || e?.message || 'Failed to download Word report.',
        severity: 'error',
      });
    } finally {
      setExportingWord(false);
    }
  };

  const handleDownloadUploadedReport = async () => {
    if (!selected?.submissionId) return;
    setExportingWord(true);
    try {
      const response = await villageMonitoringService.downloadFormattedReport(selected.submissionId);
      triggerBlobDownload(response, detail?.formattedReportFileName || `monitoring-report-${selected.submissionId}.docx`);
    } catch (e) {
      setSnackbar({
        open: true,
        message: e?.response?.data?.message || e?.message || 'Failed to download uploaded report.',
        severity: 'error',
      });
    } finally {
      setExportingWord(false);
    }
  };

  const handleUploadFormattedReport = async () => {
    if (!selected?.submissionId || !formattedReportFile) return;
    setUploadingFormattedReport(true);
    try {
      const updated = await villageMonitoringService.uploadFormattedReport(selected.submissionId, formattedReportFile);
      setDetail((prev) => ({ ...(prev || {}), ...updated, hasFormattedReport: true }));
      setFormattedReportFile(null);
      setSnackbar({ open: true, message: 'Formatted Word report uploaded.', severity: 'success' });
      load();
    } catch (e) {
      setSnackbar({
        open: true,
        message: e?.response?.data?.message || e?.message || 'Failed to upload formatted report.',
        severity: 'error',
      });
    } finally {
      setUploadingFormattedReport(false);
    }
  };

  const progressLabel = (value) => {
    const map = { on_track: 'On track', delayed: 'Delayed', stalled: 'Stalled', completed: 'Completed' };
    return map[value] || statusLabel(value);
  };

  const runAction = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      const id = selected.submissionId;
      if (actionType === 'submit') await villageMonitoringService.submitToWard(id);
      else if (actionType === 'forward_subcounty') await villageMonitoringService.forwardToSubcounty(id, comment);
      else if (actionType === 'return_ward') await villageMonitoringService.returnToWard(id, comment);
      else if (actionType === 'forward_chief') await villageMonitoringService.forwardToChief(id, comment);
      else if (actionType === 'approve') await villageMonitoringService.approve(id, comment);
      setActionOpen(false);
      setComment('');
      setSnackbar({ open: true, message: 'Action completed.', severity: 'success' });
      await load();
    } catch (e) {
      setSnackbar({
        open: true,
        message: e?.response?.data?.message || e.message || 'Action failed.',
        severity: 'error',
      });
    } finally {
      setBusy(false);
    }
  };

  const submitAllDrafts = async () => {
    setBatchSubmitting(true);
    try {
      const result = await villageMonitoringService.submitAllDrafts();
      const submitted = result?.submitted?.length || 0;
      const failed = result?.failed?.length || 0;
      if (submitted > 0 && failed === 0) {
        setSnackbar({ open: true, message: `${submitted} draft(s) submitted to ward.`, severity: 'success' });
      } else if (submitted > 0 && failed > 0) {
        setSnackbar({
          open: true,
          message: `${submitted} submitted, ${failed} failed (missing progress status or other errors).`,
          severity: 'warning',
        });
      } else if (failed > 0) {
        setSnackbar({
          open: true,
          message: result.failed[0]?.message || 'No drafts could be submitted.',
          severity: 'error',
        });
      } else {
        setSnackbar({ open: true, message: 'No draft reports to submit.', severity: 'info' });
      }
      await load();
    } catch (e) {
      setSnackbar({
        open: true,
        message: e?.response?.data?.message || e.message || 'Batch submit failed.',
        severity: 'error',
      });
    } finally {
      setBatchSubmitting(false);
    }
  };

  const saveAndSubmitToWard = async () => {
    if (!selected) return;
    if (!editProgress) {
      setSnackbar({
        open: true,
        message: 'Select physical progress status before submitting to the ward.',
        severity: 'warning',
      });
      return;
    }
    setBusy(true);
    try {
      await villageMonitoringService.updateReport(selected.submissionId, {
        title: editTitle,
        progressStatus: editProgress,
        answers: editAnswers,
      });
      await villageMonitoringService.submitToWard(selected.submissionId);
      setEditOpen(false);
      setSnackbar({ open: true, message: 'Report submitted to ward administrator.', severity: 'success' });
      await load();
    } catch (e) {
      setSnackbar({
        open: true,
        message: e?.response?.data?.message || e.message || 'Submit failed.',
        severity: 'error',
      });
    } finally {
      setBusy(false);
    }
  };

  const saveEdit = async () => {
    if (!selected) return;
    const isWardRevise = canWard && WARD_EDITABLE_STATUSES.includes(selected.workflowStatus);
    setBusy(true);
    try {
      await villageMonitoringService.updateReport(selected.submissionId, {
        title: editTitle,
        progressStatus: editProgress,
        answers: editAnswers,
      });
      setEditOpen(false);
      setSnackbar({
        open: true,
        message: isWardRevise
          ? 'Revision saved. Each field change is recorded in History.'
          : 'Report updated.',
        severity: 'success',
      });
      await load();
    } catch (e) {
      setSnackbar({
        open: true,
        message: e?.response?.data?.message || e.message || 'Update failed.',
        severity: 'error',
      });
    } finally {
      setBusy(false);
    }
  };

  const columns = useMemo(() => [
    { field: 'submissionId', headerName: 'ID', width: 70 },
    { field: 'projectName', headerName: 'Project', flex: 1.2, minWidth: 160 },
    { field: 'village', headerName: 'Village', width: 120 },
    { field: 'ward', headerName: 'Ward', width: 110 },
    {
      field: 'progressStatus',
      headerName: 'Progress',
      width: 110,
      valueFormatter: (v) => progressLabel(v),
    },
    {
      field: 'workflowStatus',
      headerName: 'Workflow',
      width: 140,
      renderCell: (p) => (
        <Chip size="small" label={statusLabel(p.value)} color={STATUS_COLORS[p.value] || 'default'} />
      ),
    },
    { field: 'visitDate', headerName: 'Visit', width: 110 },
    { field: 'updatedAt', headerName: 'Updated', width: 150, valueFormatter: (v) => formatDate(v) },
    {
      field: 'actions',
      headerName: 'Actions',
      width: embedded ? 520 : 460,
      pinned: 'right',
      sortable: false,
      cellClassName: 'monitoring-actions-cell',
      renderCell: (p) => {
        const row = p.row;
        const st = row.workflowStatus || 'draft';
        return (
          <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap" sx={{ py: 0.5, width: '100%' }}>
            <Button size="small" startIcon={<ViewIcon />} onClick={() => openDetail(row)}>View</Button>
            <Button size="small" startIcon={<HistoryIcon />} onClick={() => openHistory(row)}>History</Button>
            {canVillage && isDraftStatus(st) && (
              <>
                <Button size="small" onClick={() => openEditForm(row)}>Fill form</Button>
                <Button size="small" variant="contained" startIcon={<SendIcon />} onClick={() => {
                  setSelected(row);
                  setActionType('submit');
                  setActionOpen(true);
                }}>Submit to ward</Button>
              </>
            )}
            {canWard && WARD_EDITABLE_STATUSES.includes(st) && (
              <>
                <Button size="small" variant="contained" startIcon={<EditNoteIcon />} onClick={() => openEditForm(row)}>Revise</Button>
                <Button size="small" startIcon={<SendIcon />} onClick={() => openWorkflowAction(row, 'forward_subcounty')}>Forward</Button>
              </>
            )}
            {canSubcounty && SUBCOUNTY_REVIEWABLE_STATUSES.includes(st) && (
              <>
                <Button size="small" color="warning" startIcon={<ReturnIcon />} onClick={() => openWorkflowAction(row, 'return_ward')}>Return to ward</Button>
                <Button size="small" variant="contained" startIcon={<SendIcon />} onClick={() => openWorkflowAction(row, 'forward_chief')}>To chief</Button>
              </>
            )}
            {canChief && CHIEF_REVIEWABLE_STATUSES.includes(st) && (
              <Button size="small" color="success" startIcon={<ApproveIcon />} onClick={() => openWorkflowAction(row, 'approve')}>Approve</Button>
            )}
          </Stack>
        );
      },
    },
  ], [canVillage, canWard, canSubcounty, canChief, embedded]);

  return (
    <Box sx={{ p: embedded ? 0 : { xs: 2, md: 3 } }}>
      {!embedded ? (
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'center' }} mb={2} spacing={2}>
        <Box>
          <Typography variant="h5" fontWeight={600}>Village monitoring workflow</Typography>
          <Typography variant="body2" color="text.secondary">
            Village → Ward (revise & track) → Sub-county (return/forward) → Chief Officer → public project
          </Typography>
        </Box>
        <Stack direction="row" spacing={1} flexWrap="wrap">
          {canVillage && (
            <Button variant="contained" startIcon={<AddIcon />} onClick={openCreateForm}>
              New monitoring report
            </Button>
          )}
          <TextField select size="small" label="Queue" value={activeQueue} onChange={(e) => setQueue(e.target.value)} sx={{ minWidth: 160 }}>
            {canVillage && <MenuItem value="village">My drafts</MenuItem>}
            {canWard && <MenuItem value="ward">Ward review</MenuItem>}
            {canSubcounty && <MenuItem value="subcounty">Sub-county review</MenuItem>}
            {canChief && <MenuItem value="chief">Chief approval</MenuItem>}
            <MenuItem value="all">All accessible</MenuItem>
          </TextField>
          <TextField select size="small" label="Progress" value={progressFilter} onChange={(e) => setProgressFilter(e.target.value)} sx={{ minWidth: 150 }}>
            <MenuItem value="">All</MenuItem>
            <MenuItem value="attention">Stalled / delayed</MenuItem>
            {PROGRESS_OPTIONS.map((o) => <MenuItem key={o} value={o}>{progressLabel(o)}</MenuItem>)}
          </TextField>
          {canVillage && draftRowsInView.length > 1 && (
            <Button
              variant="contained"
              startIcon={<SendIcon />}
              onClick={submitAllDrafts}
              disabled={batchSubmitting}
            >
              {batchSubmitting ? 'Submitting…' : `Submit ${draftRowsInView.length} drafts`}
            </Button>
          )}
          <Button startIcon={<RefreshIcon />} variant="outlined" onClick={load}>Refresh</Button>
        </Stack>
      </Stack>
      ) : (
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'center' }} mb={2} spacing={2}>
        <Stack direction="row" spacing={1} flexWrap="wrap" alignItems="center">
          {canVillage && homeRoute && (
            <Button variant="contained" startIcon={<AddIcon />} onClick={openCreateForm}>
              New monitoring report
            </Button>
          )}
          <TextField select size="small" label="Queue" value={activeQueue} onChange={(e) => setQueue(e.target.value)} sx={{ minWidth: 180 }}>
            {canWard && <MenuItem value="ward">Ward review</MenuItem>}
            {canVillage && <MenuItem value="village">Village drafts</MenuItem>}
            {canSubcounty && <MenuItem value="subcounty">Sub-county review</MenuItem>}
            {canChief && <MenuItem value="chief">Chief approval</MenuItem>}
            <MenuItem value="all">All reports</MenuItem>
          </TextField>
          <TextField select size="small" label="Progress" value={progressFilter} onChange={(e) => setProgressFilter(e.target.value)} sx={{ minWidth: 150 }}>
            <MenuItem value="">All</MenuItem>
            <MenuItem value="attention">Stalled / delayed</MenuItem>
            {PROGRESS_OPTIONS.map((o) => <MenuItem key={o} value={o}>{progressLabel(o)}</MenuItem>)}
          </TextField>
          {canVillage && homeRoute && draftRowsInView.length > 1 && (
            <Button
              variant="contained"
              startIcon={<SendIcon />}
              onClick={submitAllDrafts}
              disabled={batchSubmitting}
            >
              {batchSubmitting ? 'Submitting…' : `Submit ${draftRowsInView.length} drafts`}
            </Button>
          )}
          <Button startIcon={<RefreshIcon />} variant="outlined" onClick={load}>Refresh</Button>
        </Stack>
      </Stack>
      )}

      {canVillage && !loading && rows.length === 0 && (
        <Alert severity="info" sx={{ mb: 2 }}>
          No monitoring reports yet. Click <strong>New monitoring report</strong> to select a project and fill the village monitoring checklist.
          You can also use <RouterLink to="/data-collection-tools">Checklists &amp; visits</RouterLink> or the mobile collector app.
        </Alert>
      )}

      {canSubcounty && !canWard && !canVillage && activeQueue === 'subcounty' && !loading && rows.length === 0 && (
        <Alert severity="info" sx={{ mb: 2 }}>
          No reports in the sub-county review queue yet. Ward administrators forward satisfied reports here after revision.
          {homeRoute ? (
            <> Use <strong>All reports</strong> to browse every stage in your sub-county scope.</>
          ) : (
            <> Use <strong>All accessible</strong> to browse reports in your scope.</>
          )}
        </Alert>
      )}

      {canChief && !canSubcounty && !canWard && !canVillage && activeQueue === 'chief' && !loading && rows.length === 0 && (
        <Alert severity="info" sx={{ mb: 2 }}>
          No reports in the chief approval queue yet. Sub-county administrators forward satisfied reports here after review.
          {homeRoute ? (
            <> Use <strong>All reports</strong> to browse every stage in your department scope.</>
          ) : (
            <> Use <strong>All accessible</strong> to browse reports in your scope.</>
          )}
        </Alert>
      )}

      {canWard && !canVillage && activeQueue === 'ward' && !loading && rows.length === 0 && (
        <Alert severity="info" sx={{ mb: 2 }}>
          No reports in the ward review queue yet. Village drafts appear under <strong>Village drafts</strong> until submitted.
          {homeRoute ? (
            <> Use <strong>All reports</strong> to browse every stage.</>
          ) : (
            <> Use <strong>All accessible</strong> or switch to <strong>Village drafts</strong>.</>
          )}
        </Alert>
      )}

      {canWard && !canVillage && activeQueue === 'village' && !loading && rows.length === 0 && (
        <Alert severity="info" sx={{ mb: 2 }}>
          No village drafts in your ward scope. Drafts appear here while village administrators complete checklists — submit moves them to <strong>Ward review</strong>.
        </Alert>
      )}

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {projectIdFilter && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Showing visits for project #{projectIdFilter}.{' '}
          <RouterLink to="/monitoring/village-workflow">Clear filter</RouterLink>
        </Alert>
      )}

      {summary?.myQueue > 0 && (
        <Alert severity={summary.returnedToWard > 0 ? 'warning' : 'info'} sx={{ mb: 2 }}>
          {summary.returnedToWard > 0
            ? `${summary.myQueue} report(s) need your action (${summary.returnedToWard} returned for ward revision).`
            : `${summary.myQueue} report(s) in your queue awaiting action.`}
        </Alert>
      )}

      {summary && (
        <Stack direction="row" spacing={1} flexWrap="wrap" mb={2}>
          {summary.draft > 0 && (
            <Chip label={`${summary.draft} draft${summary.draft > 1 ? 's' : ''}`} size="small" />
          )}
          {summary.wardQueue > 0 && (
            <Chip label={`${summary.wardQueue} ward queue`} size="small" color="info" />
          )}
          {summary.returnedToWard > 0 && (
            <Chip label={`${summary.returnedToWard} returned`} size="small" color="error" variant="outlined" />
          )}
          {summary.subcountyQueue > 0 && (
            <Chip label={`${summary.subcountyQueue} sub-county`} size="small" color="warning" />
          )}
          {summary.chiefQueue > 0 && (
            <Chip label={`${summary.chiefQueue} chief`} size="small" color="secondary" />
          )}
          {summary.approved > 0 && (
            <Chip label={`${summary.approved} published`} size="small" color="success" variant="outlined" />
          )}
        </Stack>
      )}

      <Paper sx={{ height: embedded ? 520 : 580 }}>
        {loading ? (
          <Box display="flex" justifyContent="center" alignItems="center" height="100%">
            <CircularProgress />
          </Box>
        ) : (
          <DataGrid
            rows={filteredRows}
            columns={columns}
            getRowId={(r) => r.submissionId}
            getRowHeight={() => 'auto'}
            disableRowSelectionOnClick
            pageSizeOptions={[10, 25, 50]}
            initialState={{
              pagination: { paginationModel: { pageSize: 25 } },
              pinnedColumns: { right: ['actions'] },
            }}
            sx={{
              '& .MuiDataGrid-row': {
                maxHeight: 'none !important',
              },
              '& .MuiDataGrid-cell': {
                maxHeight: 'none !important',
                alignItems: 'flex-start',
                py: 1,
                overflow: 'visible !important',
              },
              '& .monitoring-actions-cell': {
                alignItems: 'flex-start',
                py: 1,
              },
              '& .MuiDataGrid-cellContent': {
                overflow: 'visible !important',
                whiteSpace: 'normal',
              },
            }}
          />
        )}
      </Paper>

      <Dialog open={detailOpen} onClose={() => setDetailOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>
          Monitoring report #{selected?.submissionId}
          {detail?.title ? ` — ${detail.title}` : ''}
        </DialogTitle>
        <DialogContent dividers>
          {detailLoading ? (
            <Box display="flex" justifyContent="center" py={4}><CircularProgress /></Box>
          ) : detail ? (
            <Stack spacing={2}>
              {canVillage && isDraftStatus(detail.workflowStatus) && (
                <Alert
                  severity="info"
                  action={(
                    <Button color="inherit" size="small" variant="outlined" onClick={startSubmitFromDetail}>
                      Submit to ward
                    </Button>
                  )}
                >
                  This report is still a draft. Complete the checklist and progress status, then submit to your ward administrator for review.
                </Alert>
              )}
              {canSubcounty && SUBCOUNTY_REVIEWABLE_STATUSES.includes(detail.workflowStatus) && (
                <Alert severity="info">
                  Review this ward-forwarded report. You cannot edit checklist answers — return to the ward administrator with comments for correction, or forward to the chief officer when satisfied.
                </Alert>
              )}
              {canChief && CHIEF_REVIEWABLE_STATUSES.includes(detail.workflowStatus) && (
                <Alert severity="info">
                  Final department-level review. You cannot edit checklist answers — read the report and ward/sub-county history, then approve to publish the linked project on the citizen dashboard.
                </Alert>
              )}
              {canWard && WARD_EDITABLE_STATUSES.includes(detail.workflowStatus) && (
                <Alert
                  severity="info"
                  action={(
                    <Button color="inherit" size="small" variant="outlined" onClick={startReviseFromDetail}>
                      Edit report
                    </Button>
                  )}
                >
                  This report is awaiting ward review. Edit the checklist here, then forward to sub-county when ready.
                </Alert>
              )}
              {canWard && detail.workflowStatus === 'draft' && (
                <Alert severity="warning">
                  This is still a village draft — ward revision is available after the village administrator submits to ward.
                </Alert>
              )}
              <Stack direction="row" spacing={1} flexWrap="wrap">
                <Chip size="small" label={statusLabel(detail.workflowStatus)} color={STATUS_COLORS[detail.workflowStatus] || 'default'} />
                {detail.progressStatus && (
                  <Chip
                    size="small"
                    label={progressLabel(detail.progressStatus)}
                    color={detail.progressStatus === 'stalled' ? 'error' : detail.progressStatus === 'delayed' ? 'warning' : 'default'}
                  />
                )}
              </Stack>
              <Typography variant="body2" color="text.secondary">
                {detail.projectName} · {detail.village || '—'}, {detail.ward || '—'} · Visit {detail.visitDate || '—'}
              </Typography>
              {detail.reviewComment && (
                <Alert severity="info">Latest review comment: {detail.reviewComment}</Alert>
              )}
              {isExportableStatus(detail.workflowStatus) && (
                <Alert severity="success" icon={<DescriptionIcon fontSize="inherit" />}>
                  <Stack spacing={1.5}>
                    <Typography variant="body2">
                      Download a formatted Word report generated from the completed checklist. The checklist remains the system record; ward administrators may edit the Word file offline and upload the revised version.
                    </Typography>
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} flexWrap="wrap">
                      <Button
                        size="small"
                        variant="outlined"
                        startIcon={<DescriptionIcon />}
                        onClick={handleExportWord}
                        disabled={exportingWord}
                      >
                        {exportingWord ? 'Preparing…' : 'Download Word report'}
                      </Button>
                      {detail.hasFormattedReport && (
                        <Button
                          size="small"
                          variant="outlined"
                          startIcon={<DownloadIcon />}
                          onClick={handleDownloadUploadedReport}
                          disabled={exportingWord}
                        >
                          Download ward document
                        </Button>
                      )}
                    </Stack>
                    {canWard && WARD_EDITABLE_STATUSES.includes(detail.workflowStatus) && (
                      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ xs: 'stretch', sm: 'center' }}>
                        <Button variant="outlined" component="label" size="small" startIcon={<UploadFileIcon />}>
                          {formattedReportFile
                            ? formattedReportFile.name
                            : (detail.hasFormattedReport ? 'Replace ward Word/PDF document' : 'Upload edited Word/PDF document')}
                          <input
                            hidden
                            type="file"
                            accept=".doc,.docx,.pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/pdf"
                            onChange={(event) => setFormattedReportFile(event.target.files?.[0] || null)}
                          />
                        </Button>
                        {formattedReportFile && (
                          <Button
                            size="small"
                            variant="contained"
                            onClick={handleUploadFormattedReport}
                            disabled={uploadingFormattedReport}
                          >
                            {uploadingFormattedReport ? 'Uploading…' : 'Save uploaded document'}
                          </Button>
                        )}
                      </Stack>
                    )}
                    {detail.formattedReportUploadedAt && (
                      <Typography variant="caption" color="text.secondary">
                        Ward document last uploaded: {formatDate(detail.formattedReportUploadedAt)}
                        {detail.formattedReportFileName ? ` · ${detail.formattedReportFileName}` : ''}
                      </Typography>
                    )}
                  </Stack>
                </Alert>
              )}
              {detail.wardChangesFromVillage?.length > 0 && (
                <Alert severity="warning" icon={false}>
                  <MonitoringChangeList
                    wardChangesFromVillage={detail.wardChangesFromVillage}
                    title="Ward changes from village submission"
                  />
                </Alert>
              )}
              {detail.structure?.sections?.length > 0 && (
                <ChecklistFormFields
                  structure={detail.structure}
                  value={detail.answers || {}}
                  onChange={() => {}}
                  disabled
                  projectId={detail.projectId}
                />
              )}
              {detail.projectId && (
                <Button
                  component={RouterLink}
                  to={`/projects/${detail.projectId}`}
                  variant="outlined"
                  size="small"
                >
                  Open project
                </Button>
              )}
            </Stack>
          ) : (
            <Typography color="text.secondary">Could not load report details.</Typography>
          )}
        </DialogContent>
        <DialogActions sx={{ flexWrap: 'wrap', gap: 1 }}>
          {canVillage && isDraftStatus(detail?.workflowStatus) && (
            <>
              <Button onClick={startFillFormFromDetail}>Fill form</Button>
              <Button variant="contained" startIcon={<SendIcon />} onClick={startSubmitFromDetail}>
                Submit to ward
              </Button>
            </>
          )}
          {canSubcounty && SUBCOUNTY_REVIEWABLE_STATUSES.includes(detail?.workflowStatus) && (
            <>
              <Button color="warning" startIcon={<ReturnIcon />} onClick={startReturnFromDetail}>
                Return to ward
              </Button>
              <Button variant="contained" startIcon={<SendIcon />} onClick={startForwardChiefFromDetail}>
                Forward to chief
              </Button>
            </>
          )}
          {canWard && WARD_EDITABLE_STATUSES.includes(detail?.workflowStatus) && (
            <>
              <Button variant="contained" startIcon={<EditNoteIcon />} onClick={startReviseFromDetail}>
                Edit report
              </Button>
              <Button variant="outlined" startIcon={<SendIcon />} onClick={startForwardFromDetail}>
                Forward to sub-county
              </Button>
            </>
          )}
          {canChief && CHIEF_REVIEWABLE_STATUSES.includes(detail?.workflowStatus) && (
            <Button variant="contained" color="success" startIcon={<ApproveIcon />} onClick={startApproveFromDetail}>
              Approve & publish
            </Button>
          )}
          {detail && isExportableStatus(detail.workflowStatus) && (
            <Button
              variant="outlined"
              startIcon={<DescriptionIcon />}
              onClick={handleExportWord}
              disabled={exportingWord}
            >
              Word report
            </Button>
          )}
          <Box sx={{ flex: 1 }} />
          <Button onClick={() => setDetailOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={historyOpen} onClose={() => setHistoryOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>Change history — report #{selected?.submissionId}</DialogTitle>
        <DialogContent dividers>
          <List dense>
            {history.map((a) => (
              <ListItem key={a.actionId} alignItems="flex-start" sx={{ flexDirection: 'column', alignItems: 'stretch', py: 1.5 }}>
                <ListItemText
                  primary={`${ACTION_LABELS[a.actionType] || a.actionType} — ${a.actorName || 'System'}`}
                  secondary={(
                    <Typography variant="caption" display="block">{formatDate(a.createdAt)}</Typography>
                  )}
                />
                {a.comment ? <Typography variant="body2" sx={{ mb: 1 }}>{a.comment}</Typography> : null}
                {(a.changedFields?.wardChangesFromVillage?.length > 0 || (a.changedFields && Object.keys(a.changedFields).length > 0)) && (
                  <Box sx={{ mt: 0.5, mb: 1 }}>
                    <MonitoringChangeList
                      changedFields={a.changedFields?.wardChangesFromVillage ? null : a.changedFields}
                      wardChangesFromVillage={a.changedFields?.wardChangesFromVillage}
                      compact={!!a.changedFields?.wardChangesFromVillage?.length}
                      title={
                        a.actionType === 'forwarded_to_subcounty' || a.actionType === 'resubmitted_to_subcounty'
                          ? 'Ward changes forwarded to sub-county'
                          : a.actionType === 'ward_revised'
                            ? 'Fields changed in this revision'
                            : undefined
                      }
                    />
                  </Box>
                )}
              </ListItem>
            ))}
            {!history.length && <ListItem><ListItemText primary="No actions recorded yet." /></ListItem>}
          </List>
        </DialogContent>
        <DialogActions><Button onClick={() => setHistoryOpen(false)}>Close</Button></DialogActions>
      </Dialog>

      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>New village monitoring report</DialogTitle>
        <DialogContent dividers>
          {loadingFormResources ? (
            <Box display="flex" justifyContent="center" py={4}><CircularProgress /></Box>
          ) : (
            <Stack spacing={2} sx={{ mt: 0.5 }}>
              <Alert severity="info" sx={{ py: 0.5 }}>
                Record a field visit for a project in your village scope. Save as draft, then submit to the ward when the checklist and progress status are complete.
              </Alert>
              <Autocomplete
                options={formProjects}
                getOptionLabel={(p) => (p?.projectName || p?.name ? `${p.projectName || p.name} (#${p.id})` : '')}
                value={formProject}
                onChange={(_, value) => setFormProject(value)}
                renderInput={(params) => <TextField {...params} label="Project" required />}
              />
              <TextField
                select
                label="Monitoring checklist"
                fullWidth
                required
                value={formTemplateId}
                onChange={(e) => {
                  const id = e.target.value;
                  setFormTemplateId(id);
                  const tpl = formTemplates.find((t) => String(t.templateId) === String(id));
                  setFormStructure(tpl?.structure || { sections: [] });
                  setFormAnswers({});
                }}
              >
                {formTemplates.map((t) => (
                  <MenuItem key={t.templateId} value={String(t.templateId)}>
                    {t.name}
                  </MenuItem>
                ))}
              </TextField>
              {!formTemplates.length && (
                <Typography variant="body2" color="text.secondary">
                  No checklist templates available. Contact ICT to assign a monitoring template to your role.
                </Typography>
              )}
              <TextField
                label="Visit date"
                type="date"
                value={formVisitDate}
                onChange={(e) => setFormVisitDate(e.target.value)}
                InputLabelProps={{ shrink: true }}
                fullWidth
              />
              <TextField label="Visit title (optional)" fullWidth value={formTitle} onChange={(e) => setFormTitle(e.target.value)} />
              <TextField select label="Physical progress status" fullWidth value={formProgress} onChange={(e) => setFormProgress(e.target.value)}>
                <MenuItem value="">— Select before ward submit —</MenuItem>
                {PROGRESS_OPTIONS.map((o) => <MenuItem key={o} value={o}>{progressLabel(o)}</MenuItem>)}
              </TextField>
              {formStructure?.sections?.length > 0 && (
                <>
                  <Typography variant="subtitle2" fontWeight={600}>Monitoring checklist</Typography>
                  <ChecklistFormFields
                    structure={formStructure}
                    value={formAnswers}
                    onChange={setFormAnswers}
                    projectId={formProject?.id ?? null}
                    subjectType="project"
                  />
                </>
              )}
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateOpen(false)} disabled={busy}>Cancel</Button>
          <Button variant="contained" onClick={saveCreate} disabled={busy || loadingFormResources || !formTemplates.length}>
            {busy ? 'Saving…' : 'Save draft'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={editOpen} onClose={() => setEditOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>
          {canWard && selected?.workflowStatus !== 'draft' ? 'Revise monitoring report' : 'Fill monitoring report'}
        </DialogTitle>
        <DialogContent dividers>
          {editLoading ? (
            <Box display="flex" justifyContent="center" py={4}><CircularProgress /></Box>
          ) : (
            <Stack spacing={2} sx={{ mt: 0.5 }}>
              {canVillage && isDraftStatus(selected?.workflowStatus) && (
                <Alert severity="info" sx={{ py: 0.5 }}>
                  Set <strong>Physical progress status</strong>, complete the checklist, then save or submit to your ward administrator.
                </Alert>
              )}
              {canWard && WARD_EDITABLE_STATUSES.includes(selected?.workflowStatus) && (
                <Alert severity="info" sx={{ py: 0.5 }}>
                  Edit the checklist or progress status as needed. Each save records exactly which fields changed in <strong>History</strong>.
                </Alert>
              )}
              {canWard && editWardChanges.length > 0 && (
                <Alert severity="warning" icon={false}>
                  <MonitoringChangeList
                    wardChangesFromVillage={editWardChanges}
                    title={`Changes from village submission (${editWardChanges.length})`}
                    compact
                  />
                </Alert>
              )}
              <TextField label="Title" fullWidth value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
              <TextField select label="Physical progress status" fullWidth value={editProgress} onChange={(e) => setEditProgress(e.target.value)}>
                <MenuItem value="">—</MenuItem>
                {PROGRESS_OPTIONS.map((o) => <MenuItem key={o} value={o}>{progressLabel(o)}</MenuItem>)}
              </TextField>
              {editStructure?.sections?.length > 0 ? (
                <>
                  <Typography variant="subtitle2" fontWeight={600}>Monitoring checklist</Typography>
                  <ChecklistFormFields
                    structure={editStructure}
                    value={editAnswers}
                    onChange={setEditAnswers}
                    projectId={editProjectId}
                    subjectType="project"
                  />
                </>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  No checklist structure loaded for this report.
                </Typography>
              )}
            </Stack>
          )}
        </DialogContent>
        <DialogActions sx={{ flexWrap: 'wrap', gap: 1 }}>
          <Button onClick={() => setEditOpen(false)}>Cancel</Button>
          <Box sx={{ flex: 1 }} />
          <Button variant="outlined" onClick={saveEdit} disabled={busy || editLoading}>{busy ? 'Saving…' : 'Save'}</Button>
          {canVillage && isDraftStatus(selected?.workflowStatus) && (
            <Button variant="contained" startIcon={<SendIcon />} onClick={saveAndSubmitToWard} disabled={busy || editLoading}>
              {busy ? 'Submitting…' : 'Submit to ward'}
            </Button>
          )}
        </DialogActions>
      </Dialog>

      <Dialog open={actionOpen} onClose={() => setActionOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          {actionType === 'submit' && 'Submit to Ward Administrator'}
          {actionType === 'forward_subcounty' && 'Forward to Sub-County Administrator'}
          {actionType === 'return_ward' && 'Return to Ward Administrator'}
          {actionType === 'forward_chief' && 'Forward to Chief Officer'}
          {actionType === 'approve' && 'Final approval & publish project'}
        </DialogTitle>
        <DialogContent dividers>
          {actionType === 'submit' && (
            <Alert severity="info" sx={{ mt: 1 }}>
              Send this monitoring report to your Ward Administrator for review. Physical progress status must be set — use <strong>Fill form</strong> first if it is missing.
            </Alert>
          )}
          {actionType === 'return_ward' && (
            <Alert severity="warning" sx={{ mt: 1 }}>
              Return this report to the ward administrator for correction. A comment is required — describe what needs to be fixed.
            </Alert>
          )}
          {actionType === 'forward_chief' && (
            <Alert severity="info" sx={{ mt: 1 }}>
              Forward this report to the Department Chief Officer for final approval. Add an optional comment for the chief.
            </Alert>
          )}
          {actionType !== 'submit' && (
            <TextField
              label={
                actionType === 'return_ward'
                  ? 'Comment (required)'
                  : 'Comment (optional)'
              }
              fullWidth
              multiline
              minRows={3}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              sx={{ mt: 1 }}
            />
          )}
          {actionType === 'forward_subcounty' && (
            <>
              {forwardLoading ? (
                <Box display="flex" justifyContent="center" py={2}><CircularProgress size={28} /></Box>
              ) : forwardWardChanges.length > 0 ? (
                <Alert severity="info" icon={false} sx={{ mt: 2 }}>
                  <MonitoringChangeList
                    wardChangesFromVillage={forwardWardChanges}
                    title="Ward changes from village submission (recorded on forward)"
                    compact
                  />
                </Alert>
              ) : (
                <Alert severity="success" sx={{ mt: 2 }}>
                  No changes from the village submission — forwarding the report as submitted.
                </Alert>
              )}
            </>
          )}
          {actionType === 'approve' && (
            <Alert severity="info" sx={{ mt: 2 }}>
              Approving will mark the linked project as publicly visible on the citizen dashboard.
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setActionOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={runAction}
            disabled={busy || forwardLoading || (actionType === 'return_ward' && !comment.trim())}
          >
            {busy ? 'Working…' : actionType === 'submit' ? 'Submit to ward' : actionType === 'return_ward' ? 'Return to ward' : actionType === 'forward_chief' ? 'Forward to chief' : actionType === 'approve' ? 'Approve & publish' : 'Confirm'}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={snackbar.open} autoHideDuration={6000} onClose={() => setSnackbar((s) => ({ ...s, open: false }))}>
        <Alert severity={snackbar.severity} onClose={() => setSnackbar((s) => ({ ...s, open: false }))}>{snackbar.message}</Alert>
      </Snackbar>
    </Box>
  );
}
