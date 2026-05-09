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
  const [subjects, setSubjects] = useState([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState('');
  const [assessmentTemplate, setAssessmentTemplate] = useState(null);
  const [assessmentResponses, setAssessmentResponses] = useState({});
  const [assessmentDecision, setAssessmentDecision] = useState('');
  const [assessmentNotes, setAssessmentNotes] = useState('');
  const [assessmentLoading, setAssessmentLoading] = useState(false);
  const [savingAssessment, setSavingAssessment] = useState(false);
  const [newBidderName, setNewBidderName] = useState('');
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [templates, setTemplates] = useState([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [templateName, setTemplateName] = useState('');
  const [templateSubjectType, setTemplateSubjectType] = useState('bidder');
  const [templateFields, setTemplateFields] = useState([]);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [templateStage, setTemplateStage] = useState('');
  const [overview, setOverview] = useState(null);

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
        const data = await apiService.procurement.getOverview();
        if (!cancelled) setOverview(data || null);
      } catch {
        if (!cancelled) setOverview(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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
      if ((stepForm.stage || '').trim()) {
        const subs = await apiService.procurement.listStageSubjects(project.projectId, stepForm.stage, { subjectType: 'bidder' });
        const list = Array.isArray(subs) ? subs : [];
        setSubjects(list);
        if (list.length) setSelectedSubjectId(String(list[0].id));
      } else {
        setSubjects([]);
        setSelectedSubjectId('');
      }
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
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || 'Failed to save workflow step.');
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

  const loadSubjectsForCurrentStage = useCallback(async () => {
    if (!selectedProject?.projectId || !stepForm.stage) return;
    const subs = await apiService.procurement.listStageSubjects(selectedProject.projectId, stepForm.stage, { subjectType: 'bidder' });
    const list = Array.isArray(subs) ? subs : [];
    setSubjects(list);
    if (list.length && !list.some((s) => String(s.id) === String(selectedSubjectId))) {
      setSelectedSubjectId(String(list[0].id));
    }
  }, [selectedProject?.projectId, stepForm.stage, selectedSubjectId]);

  useEffect(() => {
    loadSubjectsForCurrentStage();
  }, [loadSubjectsForCurrentStage]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!selectedSubjectId) {
        setAssessmentTemplate(null);
        setAssessmentResponses({});
        setAssessmentDecision('');
        setAssessmentNotes('');
        return;
      }
      setAssessmentLoading(true);
      try {
        const payload = await apiService.procurement.getSubjectAssessment(selectedSubjectId);
        if (cancelled) return;
        setAssessmentTemplate(payload?.template || null);
        setAssessmentResponses(payload?.assessment?.responses || {});
        setAssessmentDecision(payload?.assessment?.decision || '');
        setAssessmentNotes(payload?.assessment?.notes || '');
      } finally {
        if (!cancelled) setAssessmentLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedSubjectId]);

  const handleAddBidder = async () => {
    if (!selectedProject?.projectId || !stepForm.stage || !newBidderName.trim()) return;
    await apiService.procurement.createStageSubject(selectedProject.projectId, stepForm.stage, {
      subjectType: 'bidder',
      subjectName: newBidderName.trim(),
    });
    setNewBidderName('');
    await loadSubjectsForCurrentStage();
  };

  const setAssessmentValue = (key, value) => {
    setAssessmentResponses((prev) => ({ ...prev, [key]: value }));
  };

  const handleSaveAssessment = async () => {
    if (!selectedSubjectId) return;
    setSavingAssessment(true);
    try {
      await apiService.procurement.saveSubjectAssessment(selectedSubjectId, {
        responses: assessmentResponses,
        decision: assessmentDecision,
        notes: assessmentNotes,
      });
      await loadSubjectsForCurrentStage();
    } finally {
      setSavingAssessment(false);
    }
  };

  const openTemplatesManager = async () => {
    try {
      setTemplatesOpen(true);
      const initialStage = stepForm.stage || stageOptions[0] || '';
      setTemplateStage(initialStage);
      const data = await apiService.procurement.listTemplates({ stage: initialStage, all: true });
      const list = Array.isArray(data) ? data : [];
      setTemplates(list);
      if (list.length) {
        const t = list[0];
        setSelectedTemplateId(String(t.id));
        setTemplateStage(t.stage || initialStage);
        setTemplateName(t.name || '');
        setTemplateSubjectType(t.subjectType || 'bidder');
        setTemplateFields(Array.isArray(t.fields) ? t.fields : []);
      } else {
        setSelectedTemplateId('');
        setTemplateStage(initialStage);
        setTemplateName('');
        setTemplateSubjectType('bidder');
        setTemplateFields([]);
      }
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || 'Failed to load stage templates.');
    }
  };

  const onTemplateSelect = (idRaw) => {
    const id = String(idRaw || '');
    setSelectedTemplateId(id);
    const t = templates.find((x) => String(x.id) === id);
    if (!t) return;
    setTemplateStage(t.stage || templateStage);
    setTemplateName(t.name || '');
    setTemplateSubjectType(t.subjectType || 'bidder');
    setTemplateFields(Array.isArray(t.fields) ? t.fields : []);
  };

  const handleTemplateStageChange = async (newStage) => {
    const stage = String(newStage || '').trim();
    setTemplateStage(stage);
    setSelectedTemplateId('');
    setTemplateName('');
    setTemplateSubjectType('bidder');
    setTemplateFields([]);
    if (!stage) {
      setTemplates([]);
      return;
    }
    try {
      const data = await apiService.procurement.listTemplates({ stage, all: true });
      const list = Array.isArray(data) ? data : [];
      setTemplates(list);
      if (list.length) {
        const t = list[0];
        setSelectedTemplateId(String(t.id));
        setTemplateName(t.name || '');
        setTemplateSubjectType(t.subjectType || 'bidder');
        setTemplateFields(Array.isArray(t.fields) ? t.fields : []);
      }
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || 'Failed to load templates for selected stage.');
    }
  };

  const addTemplateField = () => {
    setTemplateFields((p) => [...p, { key: '', label: '', type: 'text', required: false, weight: 0 }]);
  };

  const patchTemplateField = (idx, patch) => {
    setTemplateFields((p) => p.map((f, i) => (i === idx ? { ...f, ...patch } : f)));
  };

  const removeTemplateField = (idx) => {
    setTemplateFields((p) => p.filter((_, i) => i !== idx));
  };

  const saveTemplate = async () => {
    if (!templateStage || !templateName.trim() || !templateFields.length) return;
    setSavingTemplate(true);
    try {
      const payload = {
        stage: templateStage,
        name: templateName.trim(),
        subjectType: templateSubjectType || 'bidder',
        fields: templateFields,
      };
      let savedId = selectedTemplateId;
      if (selectedTemplateId) {
        await apiService.procurement.updateTemplate(selectedTemplateId, payload);
      } else {
        const created = await apiService.procurement.createTemplate(payload);
        savedId = String(created?.id || '');
      }
      const data = await apiService.procurement.listTemplates({ stage: templateStage, all: true });
      const list = Array.isArray(data) ? data : [];
      setTemplates(list);
      if (savedId && list.some((t) => String(t.id) === String(savedId))) {
        onTemplateSelect(savedId);
      }
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || 'Failed to save template.');
    } finally {
      setSavingTemplate(false);
    }
  };

  const downloadBlob = (blob, fileName) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName || 'download';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const exportBidderSheet = async (format) => {
    if (!selectedProject?.projectId || !stepForm.stage) return;
    const { blob, fileName } = await apiService.procurement.exportBidderEvaluation(selectedProject.projectId, stepForm.stage, format);
    downloadBlob(blob, fileName);
  };

  const exportComprehensive = async (scope = 'all') => {
    const params = {};
    if (scope === 'project' && selectedProject?.projectId) params.projectId = selectedProject.projectId;
    const { blob, fileName } = await apiService.procurement.exportComprehensiveWorkbook(params);
    downloadBlob(blob, fileName);
  };

  return (
    <Box sx={{ p: 2 }}>
      <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, mb: 2 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
          <Typography variant="h6" fontWeight={800}>
            Procurement Management
          </Typography>
          <Stack direction="row" spacing={1}>
            <Button size="small" variant="outlined" onClick={() => exportComprehensive('all')}>
              Export Comprehensive Excel
            </Button>
            <Button size="small" variant="outlined" onClick={openTemplatesManager}>
              Manage Templates
            </Button>
          </Stack>
        </Stack>
        <Typography variant="body2" color="text.secondary">
          Projects currently under procurement and their basic workflow progress.
        </Typography>
        {overview?.metrics ? (
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} sx={{ mt: 1 }}>
            <Chip size="small" label={`Projects: ${overview.metrics.projectsUnderProcurement || 0}`} />
            <Chip size="small" label={`Subjects: ${overview.metrics.totalSubjects || 0}`} />
            <Chip size="small" label={`Qualified: ${overview.metrics.totalQualifiedSubjects || 0}`} color="success" />
            <Chip size="small" label={`Assessments: ${overview.metrics.totalAssessments || 0}`} />
            <Chip size="small" label={`Checklist done: ${overview.metrics.totalChecklistCompleted || 0}/${overview.metrics.totalChecklistItems || 0}`} />
            <Chip size="small" label={`Attachments: ${overview.metrics.totalAttachments || 0}`} />
          </Stack>
        ) : null}
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
              <Typography variant="subtitle1" fontWeight={700}>Bidder Suitability Assessment (Stage Template)</Typography>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                <TextField
                  size="small"
                  fullWidth
                  label="Add bidder"
                  value={newBidderName}
                  onChange={(e) => setNewBidderName(e.target.value)}
                />
                <Button variant="contained" onClick={handleAddBidder} disabled={!newBidderName.trim()}>
                  Add Bidder
                </Button>
              </Stack>
              <TextField
                select
                size="small"
                label="Select bidder"
                value={selectedSubjectId}
                onChange={(e) => setSelectedSubjectId(e.target.value)}
                sx={{ minWidth: 260 }}
              >
                {subjects.map((s) => (
                  <MenuItem key={s.id} value={String(s.id)}>
                    {s.subjectName} {s.latestScore != null ? `(${Number(s.latestScore).toFixed(2)})` : ''}
                  </MenuItem>
                ))}
              </TextField>

              {assessmentLoading ? (
                <Typography variant="body2">Loading bidder assessment...</Typography>
              ) : assessmentTemplate?.fields?.length ? (
                <Stack spacing={1}>
                  {assessmentTemplate.fields.map((f) => {
                    const key = f.key;
                    const val = assessmentResponses?.[key];
                    if (f.type === 'checkbox') {
                      return (
                        <Stack key={key} direction="row" spacing={1} alignItems="center">
                          <Checkbox checked={Boolean(val)} onChange={(e) => setAssessmentValue(key, e.target.checked)} />
                          <Typography>{f.label}</Typography>
                        </Stack>
                      );
                    }
                    if (f.type === 'select') {
                      return (
                        <TextField
                          key={key}
                          select
                          size="small"
                          label={f.label}
                          value={val ?? ''}
                          onChange={(e) => setAssessmentValue(key, e.target.value)}
                        >
                          {(Array.isArray(f.options) ? f.options : []).map((o) => (
                            <MenuItem key={o} value={o}>{o}</MenuItem>
                          ))}
                        </TextField>
                      );
                    }
                    if (f.type === 'number') {
                      return (
                        <TextField
                          key={key}
                          size="small"
                          type="number"
                          label={f.label}
                          value={val ?? ''}
                          onChange={(e) => setAssessmentValue(key, e.target.value)}
                        />
                      );
                    }
                    return (
                      <TextField
                        key={key}
                        size="small"
                        label={f.label}
                        multiline={f.type === 'textarea'}
                        minRows={f.type === 'textarea' ? 2 : undefined}
                        value={val ?? ''}
                        onChange={(e) => setAssessmentValue(key, e.target.value)}
                      />
                    );
                  })}
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                    <TextField
                      size="small"
                      label="Assessment Decision"
                      value={assessmentDecision}
                      onChange={(e) => setAssessmentDecision(e.target.value)}
                      sx={{ minWidth: 240 }}
                    />
                    <TextField
                      size="small"
                      fullWidth
                      label="Assessment Notes"
                      value={assessmentNotes}
                      onChange={(e) => setAssessmentNotes(e.target.value)}
                    />
                    <Button variant="contained" onClick={handleSaveAssessment} disabled={savingAssessment || !selectedSubjectId}>
                      Save Assessment
                    </Button>
                    <Button variant="outlined" onClick={() => exportBidderSheet('xlsx')} disabled={!subjects.length}>
                      Export Excel
                    </Button>
                    <Button variant="outlined" onClick={() => exportBidderSheet('pdf')} disabled={!subjects.length}>
                      Export PDF
                    </Button>
                  </Stack>
                </Stack>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  No active stage template found for this stage / subject type.
                </Typography>
              )}

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
          <Button variant="outlined" onClick={() => exportComprehensive('project')} disabled={!selectedProject?.projectId}>
            Export Project Workbook
          </Button>
          <Button variant="contained" onClick={saveStep} disabled={saving}>
            Save Workflow Step
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={templatesOpen} onClose={() => setTemplatesOpen(false)} fullWidth maxWidth="lg">
        <DialogTitle>Procurement Stage Template Manager</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={1}>
            <TextField
              select
              size="small"
              label="Stage"
              value={templateStage}
              onChange={(e) => handleTemplateStageChange(e.target.value)}
              sx={{ minWidth: 260 }}
            >
              {stageOptions.map((s) => (
                <MenuItem key={s} value={s}>{s}</MenuItem>
              ))}
            </TextField>
            <TextField
              select
              size="small"
              label="Existing template"
              value={selectedTemplateId}
              onChange={(e) => onTemplateSelect(e.target.value)}
              sx={{ minWidth: 260 }}
            >
              <MenuItem value="">Create New Template</MenuItem>
              {templates.map((t) => (
                <MenuItem key={t.id} value={String(t.id)}>
                  {t.name} ({t.subjectType}) - {t.stage}
                </MenuItem>
              ))}
            </TextField>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
              <TextField size="small" fullWidth label="Template Name" value={templateName} onChange={(e) => setTemplateName(e.target.value)} />
              <TextField
                select
                size="small"
                label="Subject Type"
                value={templateSubjectType}
                onChange={(e) => setTemplateSubjectType(e.target.value)}
                sx={{ minWidth: 200 }}
              >
                <MenuItem value="bidder">Bidder</MenuItem>
                <MenuItem value="generic">Generic</MenuItem>
              </TextField>
            </Stack>
            <Divider />
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Typography variant="subtitle2">Fields</Typography>
              <Button size="small" variant="outlined" onClick={addTemplateField}>Add Field</Button>
            </Stack>
            {templateFields.map((f, idx) => (
              <Stack key={`${f.key || 'field'}-${idx}`} direction={{ xs: 'column', md: 'row' }} spacing={1}>
                <TextField size="small" label="Key" value={f.key || ''} onChange={(e) => patchTemplateField(idx, { key: e.target.value })} />
                <TextField size="small" label="Label" value={f.label || ''} onChange={(e) => patchTemplateField(idx, { label: e.target.value })} sx={{ minWidth: 220 }} />
                <TextField
                  select
                  size="small"
                  label="Type"
                  value={f.type || 'text'}
                  onChange={(e) => patchTemplateField(idx, { type: e.target.value })}
                  sx={{ minWidth: 140 }}
                >
                  <MenuItem value="text">Text</MenuItem>
                  <MenuItem value="textarea">Textarea</MenuItem>
                  <MenuItem value="number">Number</MenuItem>
                  <MenuItem value="checkbox">Checkbox</MenuItem>
                  <MenuItem value="select">Select</MenuItem>
                </TextField>
                <TextField size="small" type="number" label="Weight" value={f.weight ?? 0} onChange={(e) => patchTemplateField(idx, { weight: Number(e.target.value || 0) })} sx={{ width: 120 }} />
                <Stack direction="row" alignItems="center" spacing={1}>
                  <Checkbox checked={Boolean(f.required)} onChange={(e) => patchTemplateField(idx, { required: e.target.checked })} />
                  <Typography variant="body2">Required</Typography>
                  <Button size="small" color="error" onClick={() => removeTemplateField(idx)}>Remove</Button>
                </Stack>
              </Stack>
            ))}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setTemplatesOpen(false)}>Close</Button>
          <Button variant="contained" onClick={saveTemplate} disabled={savingTemplate}>
            Save Template
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
