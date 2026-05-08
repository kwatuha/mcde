import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Link,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import apiService from '../api';

/** Matches api `/procurement` seed when API/catalog unavailable */
const PROCUREMENT_STAGE_FALLBACK = [
  'Needs Identification',
  'Requisition Approved',
  'Tender Published',
  'Bid Evaluation',
  'Award Decision',
  'Contract Signing',
  'Purchase Order Issued',
];

const DECISIONS = ['Pending', 'Approved', 'Rejected', 'Clarification Required', 'Awarded'];

const fmtCurrency = (v) =>
  `KES ${Number(v || 0).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtDate = (v) => (v ? new Date(v).toLocaleString() : 'N/A');

export default function ProcurementPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedProject, setSelectedProject] = useState(null);
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [stageOptions, setStageOptions] = useState(PROCUREMENT_STAGE_FALLBACK);
  const [stepForm, setStepForm] = useState({
    stage: PROCUREMENT_STAGE_FALLBACK[0],
    decision: 'Pending',
    notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [attachments, setAttachments] = useState([]);
  const [checklist, setChecklist] = useState([]);
  const [newChecklistLabel, setNewChecklistLabel] = useState('');
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [addingChecklist, setAddingChecklist] = useState(false);

  const loadProjects = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await apiService.procurement.getUnderProcurementProjects();
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || 'Failed to load procurement projects.');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await apiService.procurement.listStages();
        const labels = (Array.isArray(data) ? data : []).map((s) => s.label).filter(Boolean);
        if (!cancelled && labels.length) setStageOptions(labels);
      } catch {
        /* keep PROCUREMENT_STAGE_FALLBACK */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setStepForm((prev) => {
      if (!stageOptions.length) return prev;
      if (!prev.stage || !stageOptions.includes(prev.stage)) {
        return { ...prev, stage: stageOptions[0] };
      }
      return prev;
    });
  }, [stageOptions]);

  const openWorkflow = async (project) => {
    setSelectedProject(project);
    setHistory([]);
    setHistoryLoading(true);
    try {
      const [data, docs, checks] = await Promise.all([
        apiService.procurement.getWorkflowHistory(project.projectId),
        apiService.procurement.getAttachments(project.projectId),
        apiService.procurement.getChecklist(project.projectId),
      ]);
      setHistory(Array.isArray(data) ? data : []);
      setAttachments(Array.isArray(docs) ? docs : []);
      setChecklist(Array.isArray(checks) ? checks : []);
    } finally {
      setHistoryLoading(false);
    }
  };

  const saveStep = async () => {
    if (!selectedProject?.projectId) return;
    setSaving(true);
    try {
      await apiService.procurement.addWorkflowStep(selectedProject.projectId, stepForm);
      const refreshed = await apiService.procurement.getWorkflowHistory(selectedProject.projectId);
      setHistory(Array.isArray(refreshed) ? refreshed : []);
      const [docs, checks] = await Promise.all([
        apiService.procurement.getAttachments(selectedProject.projectId),
        apiService.procurement.getChecklist(selectedProject.projectId),
      ]);
      setAttachments(Array.isArray(docs) ? docs : []);
      setChecklist(Array.isArray(checks) ? checks : []);
      await loadProjects();
      setStepForm({ stage: stageOptions[0] || PROCUREMENT_STAGE_FALLBACK[0], decision: 'Pending', notes: '' });
    } finally {
      setSaving(false);
    }
  };

  const handleUploadAttachment = async (event) => {
    const file = event.target.files?.[0];
    if (!file || !selectedProject?.projectId) return;
    const formData = new FormData();
    formData.append('file', file);
    formData.append('stage', stepForm.stage || '');
    formData.append('title', file.name);
    setUploadingDoc(true);
    try {
      await apiService.procurement.uploadAttachment(selectedProject.projectId, formData);
      const docs = await apiService.procurement.getAttachments(selectedProject.projectId);
      setAttachments(Array.isArray(docs) ? docs : []);
    } finally {
      setUploadingDoc(false);
      event.target.value = '';
    }
  };

  const handleAddChecklist = async () => {
    if (!selectedProject?.projectId || !newChecklistLabel.trim()) return;
    setAddingChecklist(true);
    try {
      await apiService.procurement.addChecklistItem(selectedProject.projectId, {
        stage: stepForm.stage || '',
        label: newChecklistLabel.trim(),
      });
      const checks = await apiService.procurement.getChecklist(selectedProject.projectId);
      setChecklist(Array.isArray(checks) ? checks : []);
      setNewChecklistLabel('');
    } finally {
      setAddingChecklist(false);
    }
  };

  const handleToggleChecklist = async (item) => {
    if (!selectedProject?.projectId || !item?.id) return;
    await apiService.procurement.updateChecklistItem(selectedProject.projectId, item.id, {
      completed: !Boolean(item.completed),
    });
    const checks = await apiService.procurement.getChecklist(selectedProject.projectId);
    setChecklist(Array.isArray(checks) ? checks : []);
  };

  return (
    <Box sx={{ p: 2 }}>
      <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, mb: 2 }}>
        <Typography variant="h6" fontWeight={800}>
          Procurement Management
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Projects currently under procurement and their basic workflow progress.
        </Typography>
      </Paper>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Paper variant="outlined" sx={{ borderRadius: 2 }}>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell><strong>Project</strong></TableCell>
                <TableCell><strong>Status</strong></TableCell>
                <TableCell><strong>Stage</strong></TableCell>
                <TableCell><strong>Latest Decision</strong></TableCell>
                <TableCell align="right"><strong>Budget</strong></TableCell>
                <TableCell><strong>Action</strong></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {!loading && rows.map((r) => (
                <TableRow key={r.projectId}>
                  <TableCell>{r.projectName || `Project ${r.projectId}`}</TableCell>
                  <TableCell>
                    <Chip size="small" label={r.projectStatus || 'Under Procurement'} />
                  </TableCell>
                  <TableCell>{r.procurementStage || 'Not started'}</TableCell>
                  <TableCell>{r.latestDecision || 'Pending'}</TableCell>
                  <TableCell align="right">{fmtCurrency(r.budget)}</TableCell>
                  <TableCell>
                    <Button size="small" variant="outlined" onClick={() => openWorkflow(r)}>
                      Open Workflow
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {!loading && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} align="center">
                    No projects are currently marked under procurement.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <Dialog open={Boolean(selectedProject)} onClose={() => setSelectedProject(null)} maxWidth="md" fullWidth>
        <DialogTitle>
          Procurement Workflow: {selectedProject?.projectName || ''}
        </DialogTitle>
        <DialogContent dividers>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mb: 2 }}>
            <TextField
              select
              label="Stage"
              value={stepForm.stage}
              onChange={(e) => setStepForm((p) => ({ ...p, stage: e.target.value }))}
              size="small"
              sx={{ minWidth: 220 }}
            >
              {stageOptions.map((s) => (
                <MenuItem key={s} value={s}>
                  {s}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              label="Decision"
              value={stepForm.decision}
              onChange={(e) => setStepForm((p) => ({ ...p, decision: e.target.value }))}
              size="small"
              sx={{ minWidth: 220 }}
            >
              {DECISIONS.map((d) => <MenuItem key={d} value={d}>{d}</MenuItem>)}
            </TextField>
            <TextField
              label="Notes"
              value={stepForm.notes}
              onChange={(e) => setStepForm((p) => ({ ...p, notes: e.target.value }))}
              size="small"
              fullWidth
            />
          </Stack>

          {historyLoading ? (
            <Typography variant="body2">Loading workflow history...</Typography>
          ) : (
            <Stack spacing={2}>
              <TableContainer component={Paper} variant="outlined">
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell><strong>Stage</strong></TableCell>
                      <TableCell><strong>Decision</strong></TableCell>
                      <TableCell><strong>Notes</strong></TableCell>
                      <TableCell><strong>Updated</strong></TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {history.map((h) => (
                      <TableRow key={h.id}>
                        <TableCell>{h.stage}</TableCell>
                        <TableCell>{h.decision || 'Pending'}</TableCell>
                        <TableCell>{h.notes || '-'}</TableCell>
                        <TableCell>{fmtDate(h.updatedAt || h.createdAt)}</TableCell>
                      </TableRow>
                    ))}
                    {history.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={4} align="center">No workflow updates yet.</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>

              <Divider />
              <Typography variant="subtitle1" fontWeight={700}>Stage / Project Documents</Typography>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }}>
                <Button variant="outlined" component="label" disabled={uploadingDoc}>
                  {uploadingDoc ? 'Uploading...' : 'Attach Document'}
                  <input type="file" hidden onChange={handleUploadAttachment} />
                </Button>
                <Typography variant="caption" color="text.secondary">
                  Document can be tied to current stage: {stepForm.stage || 'N/A'}
                </Typography>
              </Stack>
              <TableContainer component={Paper} variant="outlined">
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell><strong>Title / File</strong></TableCell>
                      <TableCell><strong>Stage</strong></TableCell>
                      <TableCell><strong>Uploaded</strong></TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {attachments.map((a) => (
                      <TableRow key={a.id}>
                        <TableCell>
                          <Link href={`/${String(a.filePath || '').replace(/^\/+/, '')}`} target="_blank" rel="noreferrer">
                            {a.title || a.fileName || `Attachment ${a.id}`}
                          </Link>
                        </TableCell>
                        <TableCell>{a.stage || '-'}</TableCell>
                        <TableCell>{fmtDate(a.createdAt)}</TableCell>
                      </TableRow>
                    ))}
                    {!attachments.length && (
                      <TableRow>
                        <TableCell colSpan={3} align="center">No attachments uploaded yet.</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>

              <Divider />
              <Typography variant="subtitle1" fontWeight={700}>Data Collection Checklist</Typography>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                <TextField
                  size="small"
                  fullWidth
                  label="Checklist item"
                  value={newChecklistLabel}
                  onChange={(e) => setNewChecklistLabel(e.target.value)}
                />
                <Button variant="contained" onClick={handleAddChecklist} disabled={addingChecklist || !newChecklistLabel.trim()}>
                  Add
                </Button>
              </Stack>
              <TableContainer component={Paper} variant="outlined">
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell><strong>Done</strong></TableCell>
                      <TableCell><strong>Item</strong></TableCell>
                      <TableCell><strong>Stage</strong></TableCell>
                      <TableCell><strong>Updated</strong></TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {checklist.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell padding="checkbox">
                          <Checkbox checked={Boolean(item.completed)} onChange={() => handleToggleChecklist(item)} />
                        </TableCell>
                        <TableCell>{item.label}</TableCell>
                        <TableCell>{item.stage || '-'}</TableCell>
                        <TableCell>{fmtDate(item.updatedAt || item.createdAt)}</TableCell>
                      </TableRow>
                    ))}
                    {!checklist.length && (
                      <TableRow>
                        <TableCell colSpan={4} align="center">No checklist items yet.</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSelectedProject(null)}>Close</Button>
          <Button variant="contained" onClick={saveStep} disabled={saving}>
            Save Workflow Step
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
