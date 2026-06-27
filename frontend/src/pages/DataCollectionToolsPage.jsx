import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box,
  Typography,
  Paper,
  Tabs,
  Tab,
  Button,
  Stack,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  IconButton,
  Alert,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Checkbox,
  FormControlLabel,
  Divider,
  Autocomplete,
  CircularProgress,
  Chip,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import SaveIcon from '@mui/icons-material/Save';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import PhoneAndroidIcon from '@mui/icons-material/PhoneAndroid';
import { Link as RouterLink } from 'react-router-dom';
import { ROUTES } from '../configs/appConfig';
import apiService from '../api';
import ChecklistFormFields from '../components/ChecklistFormFields';
import { downloadMonitoringVisitPdf } from '../utils/monitoringVisitPdf';

const CATEGORIES = [
  { value: 'general', label: 'General' },
  { value: 'inspection_checklist', label: 'Inspection checklist' },
  { value: 'monitoring_checklist', label: 'Monitoring checklist' },
];

const ITEM_TYPES = [
  { value: 'yes_no', label: 'Yes / No' },
  { value: 'text', label: 'Short text' },
  { value: 'textarea', label: 'Long text' },
  { value: 'number', label: 'Number' },
  { value: 'select', label: 'Dropdown' },
  { value: 'multi_select', label: 'Multi-select dropdown' },
];
const VISIT_DRAFT_STORAGE_KEY = 'dataCollection.monitoringVisitDraft.v1';
const TEMPLATE_CREATE_DRAFT_STORAGE_KEY = 'dataCollection.templateDraft.create.v1';
const templateEditDraftKey = (id) => `dataCollection.templateDraft.edit.${id}.v1`;

function TabPanel({ children, value, index }) {
  if (value !== index) return null;
  return (
    <Box sx={{ pt: 2 }} role="tabpanel">
      {children}
    </Box>
  );
}

function emptyTemplateForm() {
  return {
    name: '',
    description: '',
    templateCategory: 'general',
    sections: [
      {
        id: `sec-${Date.now()}`,
        title: 'Section 1',
        items: [],
      },
    ],
  };
}

function withOptionsTextForEditing(sections) {
  return (Array.isArray(sections) ? sections : []).map((section) => ({
    ...section,
    items: (Array.isArray(section?.items) ? section.items : []).map((item) => ({
      ...item,
      optionsText: Array.isArray(item?.options) ? item.options.join(', ') : '',
    })),
  }));
}

export default function DataCollectionToolsPage() {
  const [tab, setTab] = useState(0);
  const [templates, setTemplates] = useState([]);
  const [loadingList, setLoadingList] = useState(false);
  const [listError, setListError] = useState(null);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyTemplateForm);
  const [saving, setSaving] = useState(false);
  const [templateDraftRestoredAt, setTemplateDraftRestoredAt] = useState(null);

  const [submissions, setSubmissions] = useState([]);
  const [loadingSub, setLoadingSub] = useState(false);
  const [subError, setSubError] = useState(null);
  const [projects, setProjects] = useState([]);
  const [loadingProjects, setLoadingProjects] = useState(false);

  const [visitOpen, setVisitOpen] = useState(false);
  const [visitProject, setVisitProject] = useState(null);
  const [visitTemplateId, setVisitTemplateId] = useState('');
  const [visitDate, setVisitDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [visitTitle, setVisitTitle] = useState('');
  const [visitAnswers, setVisitAnswers] = useState({});
  const [visitStructure, setVisitStructure] = useState(null);
  const [visitSaving, setVisitSaving] = useState(false);
  const [visitEditingId, setVisitEditingId] = useState(null);
  const [visitReadOnly, setVisitReadOnly] = useState(false);
  const [loadingVisit, setLoadingVisit] = useState(false);
  const [downloadingVisitPdfId, setDownloadingVisitPdfId] = useState(null);
  const [pendingDraftAnswers, setPendingDraftAnswers] = useState(null);
  const [draftRestoredAt, setDraftRestoredAt] = useState(null);
  const projectsById = useMemo(() => {
    const map = new Map();
    for (const p of projects) {
      if (p?.id != null) {
        map.set(Number(p.id), p.projectName || p.name || null);
      }
    }
    return map;
  }, [projects]);

  const loadTemplates = useCallback(async () => {
    setLoadingList(true);
    setListError(null);
    try {
      const rows = await apiService.dataCollection.listTemplates({ activeOnly: false });
      setTemplates(Array.isArray(rows) ? rows : []);
    } catch (e) {
      setListError(e?.response?.data?.message || e?.message || 'Could not load templates.');
      setTemplates([]);
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  const monitoringTemplates = useMemo(
    () =>
      templates.filter(
        (t) =>
          t.templateCategory === 'monitoring_checklist' ||
          t.templateCategory === 'general' ||
          t.isActive !== false
      ),
    [templates]
  );

  const loadSubmissions = useCallback(async () => {
    setLoadingSub(true);
    setSubError(null);
    try {
      const rows = await apiService.dataCollection.listSubmissions();
      setSubmissions(Array.isArray(rows) ? rows : []);
    } catch (e) {
      setSubError(e?.response?.data?.message || e?.message || 'Could not load visits.');
      setSubmissions([]);
    } finally {
      setLoadingSub(false);
    }
  }, []);

  useEffect(() => {
    if (tab === 1) loadSubmissions();
  }, [tab, loadSubmissions]);

  useEffect(() => {
    if (tab !== 1) return;
    let cancelled = false;
    (async () => {
      setLoadingProjects(true);
      try {
        const res = await apiService.projects.getProjects({ limit: 3000 });
        const list = Array.isArray(res?.projects) ? res.projects : Array.isArray(res) ? res : [];
        if (!cancelled) setProjects(list);
      } catch {
        if (!cancelled) setProjects([]);
      } finally {
        if (!cancelled) setLoadingProjects(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tab]);

  useEffect(() => {
    if (!visitTemplateId) {
      setVisitStructure(null);
      if (!visitReadOnly) setVisitAnswers({});
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const t = await apiService.dataCollection.getTemplate(visitTemplateId);
        if (!cancelled) {
          setVisitStructure(t?.structure || null);
          if (pendingDraftAnswers && typeof pendingDraftAnswers === 'object') {
            setVisitAnswers(pendingDraftAnswers);
            setPendingDraftAnswers(null);
          } else if (!visitEditingId) {
            setVisitAnswers({});
          }
        }
      } catch {
        if (!cancelled) {
          setVisitStructure(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visitTemplateId, visitEditingId, visitReadOnly, pendingDraftAnswers]);

  const readVisitDraft = useCallback(() => {
    try {
      const raw = localStorage.getItem(VISIT_DRAFT_STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
      return null;
    }
  }, []);

  const clearVisitDraft = useCallback(() => {
    try {
      localStorage.removeItem(VISIT_DRAFT_STORAGE_KEY);
    } catch {
      // Ignore storage cleanup errors.
    }
  }, []);

  const saveVisitDraft = useCallback(
    (payload) => {
      try {
        localStorage.setItem(VISIT_DRAFT_STORAGE_KEY, JSON.stringify(payload));
      } catch {
        // Ignore storage quota/unavailable errors to avoid interrupting user flow.
      }
    },
    []
  );

  const resetVisitForm = useCallback(() => {
    setVisitEditingId(null);
    setVisitReadOnly(false);
    setLoadingVisit(false);
    setPendingDraftAnswers(null);
    setVisitProject(null);
    setVisitTemplateId('');
    setVisitDate(new Date().toISOString().slice(0, 10));
    setVisitTitle('');
    setVisitAnswers({});
    setVisitStructure(null);
  }, []);

  const restoreDraftToForm = useCallback(
    (draft) => {
      if (!draft || typeof draft !== 'object') return false;
      const pid = Number(draft.projectId);
      if (Number.isFinite(pid)) {
        setVisitProject({
          id: pid,
          projectName: draft.projectName || draft.projectLabel || `Project #${pid}`,
        });
      }
      const nextTemplateId = draft.templateId != null ? String(draft.templateId) : '';
      setVisitTemplateId(nextTemplateId);
      setVisitDate(draft.visitDate ? String(draft.visitDate).slice(0, 10) : new Date().toISOString().slice(0, 10));
      setVisitTitle(draft.visitTitle || '');
      const ans = draft.visitAnswers && typeof draft.visitAnswers === 'object' ? draft.visitAnswers : {};
      if (nextTemplateId) {
        setPendingDraftAnswers(ans);
      } else {
        setVisitAnswers(ans);
      }
      setDraftRestoredAt(draft.savedAt || new Date().toISOString());
      return true;
    },
    []
  );

  const openNewVisit = () => {
    resetVisitForm();
    const draft = readVisitDraft();
    if (draft) restoreDraftToForm(draft);
    setVisitOpen(true);
  };

  const openVisitRecord = async (row, readOnly = false) => {
    const sid = Number(row?.submissionId);
    if (!Number.isFinite(sid)) return;
    setVisitOpen(true);
    setVisitReadOnly(readOnly);
    setLoadingVisit(true);
    try {
      const s = await apiService.dataCollection.getSubmission(sid);
      const pid = Number(s?.projectId);
      const selectedProject =
        projects.find((p) => Number(p?.id) === pid) ||
        (Number.isFinite(pid) ? { id: pid, projectName: projectsById.get(pid) || `Project #${pid}` } : null);
      setVisitEditingId(sid);
      setVisitProject(selectedProject);
      setVisitTemplateId(s?.templateId != null ? String(s.templateId) : '');
      setVisitDate(s?.visitDate ? String(s.visitDate).slice(0, 10) : '');
      setVisitTitle(s?.title || '');
      setVisitAnswers(s?.answers && typeof s.answers === 'object' ? s.answers : {});
    } catch (e) {
      window.alert(e?.response?.data?.message || e?.message || 'Failed to load visit.');
      setVisitOpen(false);
    } finally {
      setLoadingVisit(false);
    }
  };

  const downloadVisitPdf = async (row) => {
    const sid = Number(row?.submissionId);
    if (!Number.isFinite(sid)) return;
    setDownloadingVisitPdfId(sid);
    try {
      const submission = await apiService.dataCollection.getSubmission(sid);
      const template = await apiService.dataCollection.getTemplate(submission.templateId);
      const pid = Number(submission?.projectId);
      const projectLabel =
        projectsById.get(pid) ||
        (Number.isFinite(pid) ? row?.projectName || `Project #${pid}` : '—');
      downloadMonitoringVisitPdf({
        submission,
        template,
        projectName: projectLabel,
      });
    } catch (e) {
      window.alert(e?.response?.data?.message || e?.message || 'Failed to generate visit PDF.');
    } finally {
      setDownloadingVisitPdfId(null);
    }
  };

  const openCreate = () => {
    setEditingId(null);
    let nextForm = emptyTemplateForm();
    try {
      const raw = localStorage.getItem(TEMPLATE_CREATE_DRAFT_STORAGE_KEY);
      if (raw) {
        const draft = JSON.parse(raw);
        if (draft?.form && typeof draft.form === 'object') {
          nextForm = draft.form;
          setTemplateDraftRestoredAt(draft.savedAt || new Date().toISOString());
        } else {
          setTemplateDraftRestoredAt(null);
        }
      } else {
        setTemplateDraftRestoredAt(null);
      }
    } catch {
      setTemplateDraftRestoredAt(null);
    }
    setForm(nextForm);
    setEditorOpen(true);
  };

  const openEdit = async (row) => {
    try {
      const t = await apiService.dataCollection.getTemplate(row.templateId);
      setEditingId(t.templateId);
      const nextForm = {
        name: t.name || '',
        description: t.description || '',
        templateCategory: t.templateCategory || 'general',
        sections: withOptionsTextForEditing(
          Array.isArray(t.structure?.sections) && t.structure.sections.length
            ? JSON.parse(JSON.stringify(t.structure.sections))
            : emptyTemplateForm().sections
        ),
      };
      try {
        const raw = localStorage.getItem(templateEditDraftKey(t.templateId));
        if (raw) {
          const draft = JSON.parse(raw);
          if (draft?.form && typeof draft.form === 'object') {
            setForm(draft.form);
            setTemplateDraftRestoredAt(draft.savedAt || new Date().toISOString());
          } else {
            setForm(nextForm);
            setTemplateDraftRestoredAt(null);
          }
        } else {
          setForm(nextForm);
          setTemplateDraftRestoredAt(null);
        }
      } catch {
        setForm(nextForm);
        setTemplateDraftRestoredAt(null);
      }
      setEditorOpen(true);
    } catch (e) {
      window.alert(e?.response?.data?.message || e?.message || 'Failed to load template.');
    }
  };

  const saveTemplate = async () => {
    const name = form.name.trim();
    if (!name) {
      window.alert('Template name is required.');
      return;
    }
    const hasItems = form.sections.some((s) => (s.items || []).length > 0);
    if (!hasItems) {
      window.alert('Add at least one checklist item in a section.');
      return;
    }
    setSaving(true);
    try {
      const body = {
        name,
        description: form.description.trim() || undefined,
        templateCategory: form.templateCategory,
        structure: { sections: form.sections },
      };
      if (editingId) {
        await apiService.dataCollection.updateTemplate(editingId, body);
        try {
          localStorage.removeItem(templateEditDraftKey(editingId));
        } catch {
          // Ignore local storage errors.
        }
      } else {
        await apiService.dataCollection.createTemplate(body);
        try {
          localStorage.removeItem(TEMPLATE_CREATE_DRAFT_STORAGE_KEY);
        } catch {
          // Ignore local storage errors.
        }
      }
      setEditorOpen(false);
      setTemplateDraftRestoredAt(null);
      await loadTemplates();
    } catch (e) {
      window.alert(e?.response?.data?.message || e?.message || 'Save failed.');
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (!editorOpen) return;
    const key = editingId ? templateEditDraftKey(editingId) : TEMPLATE_CREATE_DRAFT_STORAGE_KEY;
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(
          key,
          JSON.stringify({
            form,
            savedAt: new Date().toISOString(),
          })
        );
      } catch {
        // Ignore local storage errors.
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [editorOpen, editingId, form]);

  const removeTemplate = async (row) => {
    const label = row.name || `Template #${row.templateId}`;
    if (!window.confirm(`Remove “${label}” from the library? Existing inspections keep their saved answers.`)) return;
    try {
      await apiService.dataCollection.deleteTemplate(row.templateId);
      await loadTemplates();
    } catch (e) {
      window.alert(e?.response?.data?.message || e?.message || 'Delete failed.');
    }
  };

  const addSection = () => {
    setForm((prev) => ({
      ...prev,
      sections: [
        ...prev.sections,
        { id: `sec-${Date.now()}`, title: `Section ${prev.sections.length + 1}`, items: [] },
      ],
    }));
  };

  const addItem = (secIdx) => {
    setForm((prev) => {
      const sections = [...prev.sections];
      const sec = { ...sections[secIdx], items: [...(sections[secIdx].items || [])] };
      sec.items.push({
        id: `item-${Date.now()}`,
        label: '',
        type: 'text',
        required: false,
        options: [],
        optionsText: '',
      });
      sections[secIdx] = sec;
      return { ...prev, sections };
    });
  };

  const saveVisit = async () => {
    if (!visitProject?.id) {
      window.alert('Select a project.');
      return;
    }
    if (!visitTemplateId) {
      window.alert('Select a checklist template.');
      return;
    }
    setVisitSaving(true);
    try {
      const payload = {
        templateId: Number(visitTemplateId),
        projectId: visitProject.id,
        visitDate: visitDate || null,
        title: visitTitle.trim() || undefined,
        answers: visitAnswers,
      };
      if (visitEditingId) {
        await apiService.dataCollection.updateSubmission(visitEditingId, payload);
      } else {
        await apiService.dataCollection.createSubmission(payload);
        clearVisitDraft();
      }
      setVisitOpen(false);
      resetVisitForm();
      await loadSubmissions();
    } catch (e) {
      const msg = e?.response?.data?.message || e?.message || 'Save failed.';
      const missing = e?.response?.data?.missing;
      window.alert(missing?.length ? `${msg}\n\nMissing: ${missing.join(', ')}` : msg);
    } finally {
      setVisitSaving(false);
    }
  };


  useEffect(() => {
    if (!visitOpen || visitReadOnly || visitEditingId) return;
    const hasValues =
      !!visitProject?.id ||
      !!visitTemplateId ||
      !!visitTitle.trim() ||
      !!visitDate ||
      (visitAnswers && Object.keys(visitAnswers).length > 0);
    if (!hasValues) {
      clearVisitDraft();
      return;
    }
    const timer = setTimeout(() => {
      saveVisitDraft({
        projectId: visitProject?.id ?? null,
        projectName: visitProject?.projectName || visitProject?.name || null,
        templateId: visitTemplateId ? Number(visitTemplateId) : null,
        visitDate: visitDate || null,
        visitTitle: visitTitle || '',
        visitAnswers: visitAnswers && typeof visitAnswers === 'object' ? visitAnswers : {},
        savedAt: new Date().toISOString(),
      });
    }, 500);
    return () => clearTimeout(timer);
  }, [
    visitOpen,
    visitReadOnly,
    visitEditingId,
    visitProject,
    visitTemplateId,
    visitDate,
    visitTitle,
    visitAnswers,
    saveVisitDraft,
    clearVisitDraft,
  ]);

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1100, mx: 'auto' }}>
      <Typography variant="h4" component="h1" gutterBottom sx={{ fontWeight: 700 }}>
        Data collection tools
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Design inspection and monitoring checklists, use them on project inspections, and record standalone monitoring
        visits against a project.
      </Typography>

      <Alert
        severity="info"
        icon={<PhoneAndroidIcon fontSize="inherit" />}
        sx={{ mb: 2 }}
        action={
          <Button color="inherit" size="small" component={RouterLink} to={ROUTES.MOBILE_APP_DOWNLOAD}>
            Get Android app
          </Button>
        }
      >
        Field staff can download the Machakos Collector Android app to sync these checklists and collect data offline.
      </Alert>

      <Paper elevation={2} sx={{ borderRadius: 2 }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ borderBottom: 1, borderColor: 'divider', px: 1 }}>
          <Tab label="Templates" />
          <Tab label="Monitoring visits" />
        </Tabs>
        <Box sx={{ p: 2 }}>
          <TabPanel value={tab} index={0}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
              <Typography variant="subtitle1" fontWeight={600}>
                Checklist templates
              </Typography>
              <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
                New template
              </Button>
            </Stack>
            {listError && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {listError}
              </Alert>
            )}
            {loadingList ? (
              <Box sx={{ py: 4, display: 'flex', justifyContent: 'center' }}>
                <CircularProgress />
              </Box>
            ) : (
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Name</TableCell>
                    <TableCell>Category</TableCell>
                    <TableCell>Active</TableCell>
                    <TableCell align="right">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {templates.map((t) => (
                    <TableRow key={t.templateId}>
                      <TableCell>{t.name}</TableCell>
                      <TableCell>
                        {CATEGORIES.find((c) => c.value === t.templateCategory)?.label || t.templateCategory}
                      </TableCell>
                      <TableCell>{t.isActive ? 'Yes' : 'No'}</TableCell>
                      <TableCell align="right">
                        <IconButton size="small" onClick={() => openEdit(t)} aria-label="Edit">
                          <EditOutlinedIcon fontSize="small" />
                        </IconButton>
                        <IconButton size="small" color="error" onClick={() => removeTemplate(t)} aria-label="Delete">
                          <DeleteOutlineIcon fontSize="small" />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </TabPanel>

          <TabPanel value={tab} index={1}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }} flexWrap="wrap" gap={1}>
              <Typography variant="subtitle1" fontWeight={600}>
                Record a monitoring visit (standalone)
              </Typography>
              <Stack direction="row" spacing={1}>
                <Button variant="outlined" onClick={loadSubmissions} disabled={loadingSub}>
                  Refresh list
                </Button>
                <Button variant="contained" startIcon={<AddIcon />} onClick={openNewVisit}>
                  New visit
                </Button>
              </Stack>
            </Stack>
            <Alert severity="info" sx={{ mb: 2 }}>
              Capture a standalone monitoring visit linked to a project, including checklist responses and visit details.
            </Alert>
            {subError && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {subError}
              </Alert>
            )}
            {loadingSub ? (
              <Box sx={{ py: 4, display: 'flex', justifyContent: 'center' }}>
                <CircularProgress />
              </Box>
            ) : (
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Date</TableCell>
                    <TableCell>Project</TableCell>
                    <TableCell>Template</TableCell>
                    <TableCell>Title</TableCell>
                    <TableCell align="right">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {submissions.map((s) => (
                    <TableRow key={s.submissionId}>
                      <TableCell>{s.visitDate ? String(s.visitDate).slice(0, 10) : '—'}</TableCell>
                      <TableCell>
                        {s.projectId != null ? (
                          <Stack spacing={0.25}>
                            <Typography variant="body2" fontWeight={600}>
                              {projectsById.get(Number(s.projectId)) || `Project #${s.projectId}`}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              ID: {s.projectId}
                            </Typography>
                          </Stack>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell>{s.templateName || '—'}</TableCell>
                      <TableCell>{s.title || '—'}</TableCell>
                      <TableCell align="right">
                        <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                          <IconButton
                            size="small"
                            onClick={() => downloadVisitPdf(s)}
                            aria-label="Download visit PDF"
                            disabled={downloadingVisitPdfId === s.submissionId}
                          >
                            <DownloadOutlinedIcon fontSize="small" />
                          </IconButton>
                          <IconButton size="small" onClick={() => openVisitRecord(s, true)} aria-label="View visit">
                            <VisibilityOutlinedIcon fontSize="small" />
                          </IconButton>
                          <IconButton size="small" onClick={() => openVisitRecord(s, false)} aria-label="Edit visit">
                            <EditOutlinedIcon fontSize="small" />
                          </IconButton>
                        </Stack>
                      </TableCell>
                    </TableRow>
                  ))}
                  {!submissions.length && (
                    <TableRow>
                      <TableCell colSpan={5} align="center">
                        <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
                          No monitoring visits recorded yet.
                        </Typography>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
            <Divider sx={{ my: 3 }} />
            <Alert
              severity="info"
              action={
                <Button
                  size="small"
                  endIcon={<OpenInNewIcon fontSize="small" />}
                  onClick={() => {
                    window.location.href = ROUTES.SCHEDULED_REPORTS;
                  }}
                >
                  Open
                </Button>
              }
            >
              Scheduled reports moved to Reports &gt; Scheduled reports for system-wide access.
            </Alert>
          </TabPanel>
        </Box>
      </Paper>

      <Dialog open={editorOpen} onClose={() => !saving && setEditorOpen(false)} fullWidth maxWidth="md">
        <DialogTitle>{editingId ? 'Edit template' : 'New template'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {templateDraftRestoredAt && (
              <Alert severity="success">
                Draft restored automatically from {new Date(templateDraftRestoredAt).toLocaleString()}.
              </Alert>
            )}
            <TextField
              label="Template name"
              required
              fullWidth
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
            />
            <TextField
              label="Description"
              fullWidth
              multiline
              minRows={2}
              value={form.description}
              onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
            />
            <FormControl fullWidth size="small">
              <InputLabel>Category</InputLabel>
              <Select
                label="Category"
                value={form.templateCategory}
                onChange={(e) => setForm((p) => ({ ...p, templateCategory: e.target.value }))}
              >
                {CATEGORIES.map((c) => (
                  <MenuItem key={c.value} value={c.value}>
                    {c.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <Divider />
            <Button size="small" variant="outlined" onClick={addSection}>
              Add section
            </Button>
            {form.sections.map((sec, si) => (
              <Paper key={sec.id} variant="outlined" sx={{ p: 1.5 }}>
                <TextField
                  size="small"
                  fullWidth
                  label="Section title"
                  value={sec.title}
                  onChange={(e) => {
                    const sections = [...form.sections];
                    sections[si] = { ...sec, title: e.target.value };
                    setForm((p) => ({ ...p, sections }));
                  }}
                  sx={{ mb: 1 }}
                />
                <Button size="small" onClick={() => addItem(si)}>
                  Add checklist item
                </Button>
                <Stack spacing={1} sx={{ mt: 1 }}>
                  {(sec.items || []).map((it, ii) => (
                    <Paper key={it.id} variant="outlined" sx={{ p: 1, bgcolor: 'action.hover' }}>
                      <Stack spacing={1}>
                        <TextField
                          size="small"
                          fullWidth
                          label="Item label (question)"
                          value={it.label}
                          onChange={(e) => {
                            const sections = [...form.sections];
                            const items = [...sections[si].items];
                            items[ii] = { ...it, label: e.target.value };
                            sections[si] = { ...sections[si], items };
                            setForm((p) => ({ ...p, sections }));
                          }}
                        />
                        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                          <FormControl size="small" fullWidth>
                            <InputLabel>Type</InputLabel>
                            <Select
                              label="Type"
                              value={it.type}
                              onChange={(e) => {
                                const sections = [...form.sections];
                                const items = [...sections[si].items];
                                const nextType = e.target.value;
                                items[ii] = {
                                  ...it,
                                  type: nextType,
                                  optionsText:
                                    nextType === 'select' || nextType === 'multi_select'
                                      ? it.optionsText ?? (Array.isArray(it.options) ? it.options.join(', ') : '')
                                      : it.optionsText || '',
                                };
                                sections[si] = { ...sections[si], items };
                                setForm((p) => ({ ...p, sections }));
                              }}
                            >
                              {ITEM_TYPES.map((x) => (
                                <MenuItem key={x.value} value={x.value}>
                                  {x.label}
                                </MenuItem>
                              ))}
                            </Select>
                          </FormControl>
                          <FormControlLabel
                            control={
                              <Checkbox
                                checked={!!it.required}
                                onChange={(e) => {
                                  const sections = [...form.sections];
                                  const items = [...sections[si].items];
                                  items[ii] = { ...it, required: e.target.checked };
                                  sections[si] = { ...sections[si], items };
                                  setForm((p) => ({ ...p, sections }));
                                }}
                              />
                            }
                            label="Required"
                          />
                        </Stack>
                        {(it.type === 'select' || it.type === 'multi_select') && (
                          <TextField
                            size="small"
                            fullWidth
                            label="Options (comma-separated)"
                            value={it.optionsText ?? (it.options || []).join(', ')}
                            onChange={(e) => {
                              const raw = e.target.value;
                              const options = e.target.value
                                .split(',')
                                .map((x) => x.trim())
                                .filter(Boolean);
                              const sections = [...form.sections];
                              const items = [...sections[si].items];
                              items[ii] = { ...it, optionsText: raw, options };
                              sections[si] = { ...sections[si], items };
                              setForm((p) => ({ ...p, sections }));
                            }}
                          />
                        )}
                      </Stack>
                    </Paper>
                  ))}
                </Stack>
              </Paper>
            ))}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditorOpen(false)} disabled={saving}>
            Cancel
          </Button>
          <Button variant="contained" startIcon={<SaveIcon />} onClick={saveTemplate} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={visitOpen}
        onClose={() => {
          if (!visitSaving) {
            setVisitOpen(false);
            resetVisitForm();
          }
        }}
        fullWidth
        maxWidth="md"
      >
        <DialogTitle>
          {visitEditingId ? (visitReadOnly ? 'View monitoring visit' : 'Edit monitoring visit') : 'New monitoring visit'}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {!visitEditingId && draftRestoredAt && (
              <Alert severity="success">
                Draft restored automatically from {new Date(draftRestoredAt).toLocaleString()}.
              </Alert>
            )}
            {loadingVisit && (
              <Box sx={{ py: 2, display: 'flex', justifyContent: 'center' }}>
                <CircularProgress size={24} />
              </Box>
            )}
            <Autocomplete
              options={projects}
              loading={loadingProjects}
              getOptionLabel={(p) => (p?.projectName || p?.name ? `${p.projectName || p.name} (#${p.id})` : '')}
              value={visitProject}
              onChange={(_, v) => setVisitProject(v)}
              disabled={visitReadOnly || loadingVisit}
              renderInput={(params) => <TextField {...params} label="Project" required />}
            />
            {visitProject?.id != null && (
              <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                <Chip
                  size="small"
                  color="primary"
                  variant="outlined"
                  label={`Project name: ${visitProject.projectName || visitProject.name || '—'}`}
                />
                <Chip size="small" variant="outlined" label={`Project ID: ${visitProject.id}`} />
              </Stack>
            )}
            <FormControl fullWidth size="small" required>
              <InputLabel>Checklist template</InputLabel>
              <Select
                label="Checklist template"
                value={visitTemplateId}
                onChange={(e) => setVisitTemplateId(e.target.value)}
                disabled={visitReadOnly || loadingVisit}
              >
                <MenuItem value="">
                  <em>Select…</em>
                </MenuItem>
                {monitoringTemplates.map((t) => (
                    <MenuItem key={t.templateId} value={String(t.templateId)}>
                      {t.name}
                    </MenuItem>
                  ))}
              </Select>
            </FormControl>
            <TextField
              label="Visit date"
              type="date"
              value={visitDate}
              onChange={(e) => setVisitDate(e.target.value)}
              InputLabelProps={{ shrink: true }}
              fullWidth
              size="small"
              disabled={visitReadOnly || loadingVisit}
            />
            <TextField
              label="Visit title (optional)"
              value={visitTitle}
              onChange={(e) => setVisitTitle(e.target.value)}
              fullWidth
              size="small"
              disabled={visitReadOnly || loadingVisit}
            />
            <Typography variant="subtitle2" fontWeight={600}>
              Checklist
            </Typography>
            <Box sx={visitReadOnly ? { pointerEvents: 'none', opacity: 0.75 } : undefined}>
              <ChecklistFormFields structure={visitStructure} value={visitAnswers} onChange={setVisitAnswers} />
            </Box>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setVisitOpen(false);
              resetVisitForm();
            }}
            disabled={visitSaving}
          >
            Cancel
          </Button>
          {visitEditingId ? (
            <Button
              variant="outlined"
              startIcon={<DownloadOutlinedIcon />}
              onClick={() =>
                downloadVisitPdf({
                  submissionId: visitEditingId,
                  projectName: visitProject?.projectName || visitProject?.name || null,
                })
              }
              disabled={loadingVisit || visitSaving}
            >
              Download PDF
            </Button>
          ) : null}
          {visitReadOnly ? (
            <Button variant="contained" onClick={() => setVisitReadOnly(false)}>
              Edit
            </Button>
          ) : (
            <Button variant="contained" onClick={saveVisit} disabled={visitSaving || loadingVisit}>
              {visitSaving ? 'Saving…' : visitEditingId ? 'Update visit' : 'Save visit'}
            </Button>
          )}
        </DialogActions>
      </Dialog>
    </Box>
  );
}
