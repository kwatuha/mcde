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
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import PhoneAndroidIcon from '@mui/icons-material/PhoneAndroid';
import { Link as RouterLink } from 'react-router-dom';
import { ROUTES } from '../configs/appConfig';
import apiService from '../api';
import ChecklistFormFields from '../components/ChecklistFormFields';
import { downloadMonitoringVisitPdf } from '../utils/monitoringVisitPdf';
import {
  formSectionsToStructure,
  ensureMonitoringProgressField,
  priorItemsForIndex,
  hasShowIf,
  normalizeShowIfForEditor,
  defaultShowIfRule,
} from '../utils/checklistVisibility';
import ShowIfConditionEditor from '../components/ShowIfConditionEditor';

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
  { value: 'photo', label: 'Photo (camera / upload)' },
  { value: 'location', label: 'GPS location' },
  { value: 'area_location', label: 'Admin area (sub-county → ward → sublocation → village)' },
  { value: 'user', label: 'Logged-in user (auto-filled)' },
  { value: 'progress_status', label: 'Progress status (on track / delayed / stalled / completed)' },
  { value: 'project_milestones', label: 'Project milestones (from DB)' },
  { value: 'project_bq_items', label: 'Project BQ / activities (from DB)' },
  { value: 'indicator', label: 'M&E indicator (from planning links)' },
];

const SUBJECT_TYPES = [
  { value: 'project', label: 'Project' },
  { value: 'rri_programme', label: 'RRI programme' },
];

function getProgrammeId(p) {
  return p?.programmeId ?? p?.id ?? null;
}

function getProgrammeLabel(p) {
  return p?.name || p?.programmeName || (getProgrammeId(p) != null ? `Programme #${getProgrammeId(p)}` : '');
}
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
    restrictAccess: false,
    roleIds: [],
    userIds: [],
    allowedSubjectTypes: ['project'],
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
    items: (Array.isArray(section?.items) ? section.items : []).map((item) => {
      const showIf = normalizeShowIfForEditor(item?.showIf);
      return {
        ...item,
        showIf,
        optionsText: Array.isArray(item?.options) ? item.options.join(', ') : '',
        showIfValuesText:
          showIf?.itemId && Array.isArray(showIf.values)
            ? showIf.values.join(', ')
            : item?.showIf?.values
              ? item.showIf.values.join(', ')
              : '',
      };
    }),
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
  const [editorTab, setEditorTab] = useState('design');
  const [previewAnswers, setPreviewAnswers] = useState({});
  const [previewProject, setPreviewProject] = useState(null);
  const [previewSubjectType, setPreviewSubjectType] = useState('project');
  const [previewRriProgramme, setPreviewRriProgramme] = useState(null);
  const [roleOptions, setRoleOptions] = useState([]);
  const [userOptions, setUserOptions] = useState([]);

  const [submissions, setSubmissions] = useState([]);
  const [loadingSub, setLoadingSub] = useState(false);
  const [subError, setSubError] = useState(null);
  const [projects, setProjects] = useState([]);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [rriProgrammes, setRriProgrammes] = useState([]);
  const [loadingRriProgrammes, setLoadingRriProgrammes] = useState(false);

  const [visitOpen, setVisitOpen] = useState(false);
  const [visitSubjectType, setVisitSubjectType] = useState('project');
  const [visitProject, setVisitProject] = useState(null);
  const [visitRriProgramme, setVisitRriProgramme] = useState(null);
  const [visitTemplateId, setVisitTemplateId] = useState('');
  const [visitDate, setVisitDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [visitTitle, setVisitTitle] = useState('');
  const [visitAnswers, setVisitAnswers] = useState({});
  const [visitStructure, setVisitStructure] = useState(null);
  const [visitSaving, setVisitSaving] = useState(false);
  const [visitEditingId, setVisitEditingId] = useState(null);
  const [visitReadOnly, setVisitReadOnly] = useState(false);
  const [loadingVisit, setLoadingVisit] = useState(false);
  const [visitListFilterSubject, setVisitListFilterSubject] = useState('all');
  const [visitListFilterProject, setVisitListFilterProject] = useState(null);
  const [visitListFilterProgramme, setVisitListFilterProgramme] = useState(null);
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
      const rows = await apiService.dataCollection.listTemplates({
        activeOnly: tab !== 0,
        manage: tab === 0,
      });
      setTemplates(Array.isArray(rows) ? rows : []);
    } catch (e) {
      setListError(e?.response?.data?.message || e?.message || 'Could not load templates.');
      setTemplates([]);
    } finally {
      setLoadingList(false);
    }
  }, [tab]);

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

  const selectedVisitTemplate = useMemo(() => {
    const tid = Number(visitTemplateId);
    if (!Number.isFinite(tid)) return null;
    return monitoringTemplates.find((t) => Number(t.templateId) === tid) || null;
  }, [visitTemplateId, monitoringTemplates]);

  const visitAllowedSubjectTypes = useMemo(() => {
    const raw = selectedVisitTemplate?.allowedSubjectTypes;
    if (Array.isArray(raw) && raw.length) return raw;
    return ['project'];
  }, [selectedVisitTemplate]);

  const loadSubmissions = useCallback(async () => {
    setLoadingSub(true);
    setSubError(null);
    try {
      const opts = {};
      if (visitListFilterSubject === 'project') {
        opts.subjectType = 'project';
        if (visitListFilterProject?.id != null) opts.projectId = visitListFilterProject.id;
      } else if (visitListFilterSubject === 'rri_programme') {
        opts.subjectType = 'rri_programme';
        const rid = getProgrammeId(visitListFilterProgramme);
        if (Number.isFinite(Number(rid))) opts.rriProgrammeId = Number(rid);
      }
      const rows = await apiService.dataCollection.listSubmissions(opts);
      setSubmissions(Array.isArray(rows) ? rows : []);
    } catch (e) {
      setSubError(e?.response?.data?.message || e?.message || 'Could not load visits.');
      setSubmissions([]);
    } finally {
      setLoadingSub(false);
    }
  }, [visitListFilterSubject, visitListFilterProject, visitListFilterProgramme]);

  useEffect(() => {
    if (tab === 1) loadSubmissions();
  }, [tab, loadSubmissions]);

  useEffect(() => {
    if (tab !== 1 && !editorOpen) return;
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
  }, [tab, editorOpen]);

  useEffect(() => {
    if (tab !== 1 && !visitOpen && !editorOpen) return;
    let cancelled = false;
    (async () => {
      setLoadingRriProgrammes(true);
      try {
        const rows = await apiService.rri.listProgrammes();
        if (!cancelled) setRriProgrammes(Array.isArray(rows) ? rows : []);
      } catch {
        if (!cancelled) setRriProgrammes([]);
      } finally {
        if (!cancelled) setLoadingRriProgrammes(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tab, visitOpen, editorOpen]);

  useEffect(() => {
    if (!visitTemplateId || visitEditingId) return;
    if (!visitAllowedSubjectTypes.includes(visitSubjectType)) {
      setVisitSubjectType(visitAllowedSubjectTypes[0] || 'project');
      setVisitProject(null);
      setVisitRriProgramme(null);
    }
  }, [visitTemplateId, visitAllowedSubjectTypes, visitSubjectType, visitEditingId]);

  useEffect(() => {
    if (!editorOpen) return;
    let cancelled = false;
    (async () => {
      try {
        const [roles, usersRes] = await Promise.all([
          apiService.users.getRoles(),
          apiService.users.getUsers(),
        ]);
        if (cancelled) return;
        setRoleOptions(Array.isArray(roles) ? roles : []);
        const users = Array.isArray(usersRes?.users) ? usersRes.users : Array.isArray(usersRes) ? usersRes : [];
        setUserOptions(users);
      } catch {
        if (!cancelled) {
          setRoleOptions([]);
          setUserOptions([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [editorOpen]);

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
    setVisitSubjectType('project');
    setVisitProject(null);
    setVisitRriProgramme(null);
    setVisitTemplateId('');
    setVisitDate(new Date().toISOString().slice(0, 10));
    setVisitTitle('');
    setVisitAnswers({});
    setVisitStructure(null);
  }, []);

  const restoreDraftToForm = useCallback(
    (draft) => {
      if (!draft || typeof draft !== 'object') return false;
      const subjectType = draft.subjectType === 'rri_programme' ? 'rri_programme' : 'project';
      setVisitSubjectType(subjectType);
      const pid = Number(draft.projectId);
      if (Number.isFinite(pid)) {
        setVisitProject({
          id: pid,
          projectName: draft.projectName || draft.projectLabel || `Project #${pid}`,
        });
      } else {
        setVisitProject(null);
      }
      const rid = Number(draft.rriProgrammeId);
      if (Number.isFinite(rid)) {
        setVisitRriProgramme({
          programmeId: rid,
          name: draft.rriProgrammeName || draft.rriProgrammeLabel || `Programme #${rid}`,
        });
      } else {
        setVisitRriProgramme(null);
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
      const subjectType = s?.subjectType === 'rri_programme' ? 'rri_programme' : 'project';
      setVisitSubjectType(subjectType);
      const pid = Number(s?.projectId);
      const selectedProject =
        projects.find((p) => Number(p?.id) === pid) ||
        (Number.isFinite(pid) ? { id: pid, projectName: projectsById.get(pid) || `Project #${pid}` } : null);
      const rid = Number(s?.rriProgrammeId);
      const selectedProgramme =
        rriProgrammes.find((p) => Number(getProgrammeId(p)) === rid) ||
        (Number.isFinite(rid)
          ? { programmeId: rid, name: s?.rriProgrammeName || `Programme #${rid}` }
          : null);
      setVisitEditingId(sid);
      setVisitProject(selectedProject);
      setVisitRriProgramme(selectedProgramme);
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

  const previewStructure = useMemo(() => formSectionsToStructure(form.sections), [form.sections]);

  const patchItem = (secIdx, itemIdx, patch) => {
    setForm((prev) => {
      const sections = [...prev.sections];
      const items = [...(sections[secIdx]?.items || [])];
      items[itemIdx] = { ...items[itemIdx], ...patch };
      sections[secIdx] = { ...sections[secIdx], items };
      return { ...prev, sections };
    });
  };

  const openCreate = () => {
    setEditingId(null);
    setEditorTab('design');
    setPreviewAnswers({});
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

  const openDuplicate = async (row) => {
    try {
      const t = await apiService.dataCollection.getTemplate(row.templateId);
      setEditingId(null);
      setEditorTab('design');
      setPreviewAnswers({});
      setTemplateDraftRestoredAt(null);
      setForm({
        name: `Copy of ${t.name || 'Template'}`,
        description: (t.description || '').replace(/\n*\[templateKey:[^\]]+\]\s*$/, '').trim(),
        templateCategory: t.templateCategory || 'monitoring_checklist',
        allowedSubjectTypes: Array.isArray(t.allowedSubjectTypes) && t.allowedSubjectTypes.length
          ? t.allowedSubjectTypes
          : ['project'],
        sections: withOptionsTextForEditing(
          Array.isArray(t.structure?.sections) && t.structure.sections.length
            ? JSON.parse(JSON.stringify(t.structure.sections))
            : emptyTemplateForm().sections
        ),
      });
      setEditorOpen(true);
    } catch (e) {
      window.alert(e?.response?.data?.message || e?.message || 'Failed to duplicate template.');
    }
  };

  const openEdit = async (row) => {
    try {
      const t = await apiService.dataCollection.getTemplate(row.templateId, { manage: true });
      setEditingId(t.templateId);
      setEditorTab('design');
      setPreviewAnswers({});
      const nextForm = {
        name: t.name || '',
        description: t.description || '',
        templateCategory: t.templateCategory || 'general',
        restrictAccess: !!t.restrictAccess,
        roleIds: t.access?.roleIds || [],
        userIds: t.access?.userIds || [],
        allowedSubjectTypes: Array.isArray(t.allowedSubjectTypes) && t.allowedSubjectTypes.length
          ? t.allowedSubjectTypes
          : ['project'],
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
      const sectionsForSave = ensureMonitoringProgressField(form.sections, form.templateCategory);
      const body = {
        name,
        description: form.description.trim() || undefined,
        templateCategory: form.templateCategory,
        structure: formSectionsToStructure(sectionsForSave),
        restrictAccess: !!form.restrictAccess,
        roleIds: form.roleIds || [],
        userIds: form.userIds || [],
        allowedSubjectTypes: Array.isArray(form.allowedSubjectTypes) && form.allowedSubjectTypes.length
          ? form.allowedSubjectTypes
          : ['project'],
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
    if (visitSubjectType === 'project' && !visitProject?.id) {
      window.alert('Select a project.');
      return;
    }
    if (visitSubjectType === 'rri_programme' && !getProgrammeId(visitRriProgramme)) {
      window.alert('Select an RRI programme.');
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
        subjectType: visitSubjectType,
        projectId: visitSubjectType === 'project' ? visitProject.id : undefined,
        rriProgrammeId:
          visitSubjectType === 'rri_programme' ? getProgrammeId(visitRriProgramme) : undefined,
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
      !!getProgrammeId(visitRriProgramme) ||
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
        subjectType: visitSubjectType,
        projectId: visitProject?.id ?? null,
        projectName: visitProject?.projectName || visitProject?.name || null,
        rriProgrammeId: getProgrammeId(visitRriProgramme),
        rriProgrammeName: getProgrammeLabel(visitRriProgramme) || null,
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
    visitSubjectType,
    visitProject,
    visitRriProgramme,
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
        visits against a project or RRI programme.
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
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }} flexWrap="wrap" gap={1}>
              <Typography variant="subtitle1" fontWeight={600}>
                Checklist templates
              </Typography>
              <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
                New template
              </Button>
            </Stack>
            <Alert severity="info" sx={{ mb: 2 }}>
              After creating or editing a template, use the highlighted <strong>Preview form</strong> step in the
              editor (top bar and bottom button) to walk through the checklist like a field officer before saving.
            </Alert>
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
                    <TableCell>Access</TableCell>
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
                      <TableCell>
                        {t.restrictAccess ? (
                          <Chip size="small" label="Restricted" color="warning" variant="outlined" />
                        ) : (
                          'All staff'
                        )}
                      </TableCell>
                      <TableCell>{t.isActive ? 'Yes' : 'No'}</TableCell>
                      <TableCell align="right">
                        <IconButton size="small" onClick={() => openDuplicate(t)} aria-label="Duplicate">
                          <ContentCopyIcon fontSize="small" />
                        </IconButton>
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
              Capture a standalone monitoring visit linked to a project or RRI programme, including checklist responses
              and visit details.
            </Alert>
            <Stack
              direction={{ xs: 'column', md: 'row' }}
              spacing={1.5}
              alignItems={{ xs: 'stretch', md: 'flex-end' }}
              sx={{ mb: 2 }}
            >
              <FormControl size="small" sx={{ minWidth: { xs: '100%', md: 180 } }}>
                <InputLabel>Subject filter</InputLabel>
                <Select
                  label="Subject filter"
                  value={visitListFilterSubject}
                  onChange={(e) => {
                    const next = e.target.value;
                    setVisitListFilterSubject(next);
                    setVisitListFilterProject(null);
                    setVisitListFilterProgramme(null);
                  }}
                >
                  <MenuItem value="all">All visits</MenuItem>
                  <MenuItem value="project">Projects only</MenuItem>
                  <MenuItem value="rri_programme">RRI programmes only</MenuItem>
                </Select>
              </FormControl>
              {visitListFilterSubject === 'project' && (
                <Autocomplete
                  sx={{ flex: 1, minWidth: { xs: '100%', md: 280 } }}
                  options={projects}
                  loading={loadingProjects}
                  getOptionLabel={(p) =>
                    p?.projectName || p?.name ? `${p.projectName || p.name} (#${p.id})` : ''
                  }
                  value={visitListFilterProject}
                  onChange={(_, v) => setVisitListFilterProject(v)}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      size="small"
                      label="Filter by project (optional)"
                      placeholder="All projects"
                    />
                  )}
                />
              )}
              {visitListFilterSubject === 'rri_programme' && (
                <Autocomplete
                  sx={{ flex: 1, minWidth: { xs: '100%', md: 280 } }}
                  options={rriProgrammes}
                  loading={loadingRriProgrammes}
                  getOptionLabel={getProgrammeLabel}
                  isOptionEqualToValue={(a, b) => Number(getProgrammeId(a)) === Number(getProgrammeId(b))}
                  value={visitListFilterProgramme}
                  onChange={(_, v) => setVisitListFilterProgramme(v)}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      size="small"
                      label="Filter by RRI programme (optional)"
                      placeholder="All programmes"
                    />
                  )}
                />
              )}
              {(visitListFilterSubject !== 'all' ||
                visitListFilterProject ||
                visitListFilterProgramme) && (
                <Button
                  size="small"
                  onClick={() => {
                    setVisitListFilterSubject('all');
                    setVisitListFilterProject(null);
                    setVisitListFilterProgramme(null);
                  }}
                >
                  Clear filters
                </Button>
              )}
            </Stack>
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
                    <TableCell>Subject</TableCell>
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
                        {s.subjectType === 'rri_programme' && s.rriProgrammeId != null ? (
                          <Stack spacing={0.25}>
                            <Typography variant="body2" fontWeight={600}>
                              {s.rriProgrammeName || `Programme #${s.rriProgrammeId}`}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              RRI programme · ID: {s.rriProgrammeId}
                            </Typography>
                          </Stack>
                        ) : s.projectId != null ? (
                          <Stack spacing={0.25}>
                            <Typography variant="body2" fontWeight={600}>
                              {projectsById.get(Number(s.projectId)) || `Project #${s.projectId}`}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              Project · ID: {s.projectId}
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

      <Dialog open={editorOpen} onClose={() => !saving && setEditorOpen(false)} fullWidth maxWidth="lg">
        <DialogTitle sx={{ pb: 1 }}>
          <Stack spacing={1.5}>
            <Typography variant="h6" component="span" fontWeight={700}>
              {editingId ? 'Edit template' : 'New template'}
            </Typography>
            <Paper
              variant="outlined"
              sx={{
                p: 0.5,
                borderColor: 'primary.main',
                borderWidth: 2,
                bgcolor: 'background.paper',
              }}
            >
              <Tabs
                value={editorTab}
                onChange={(_, v) => setEditorTab(v)}
                variant="fullWidth"
                sx={{
                  minHeight: 48,
                  '& .MuiTab-root': { minHeight: 48, fontWeight: 700, textTransform: 'none' },
                  '& .Mui-selected': { color: 'primary.main' },
                  '& .MuiTabs-indicator': { height: 4 },
                }}
              >
                <Tab label="1. Design checklist" value="design" />
                <Tab
                  label="2. Preview form (test like field officer)"
                  value="preview"
                  icon={<VisibilityOutlinedIcon fontSize="small" />}
                  iconPosition="start"
                />
              </Tabs>
            </Paper>
          </Stack>
        </DialogTitle>
        <DialogContent dividers sx={{ pt: 2 }}>
          {editorTab === 'preview' ? (
            <Box>
              <Alert severity="success" sx={{ mb: 2 }}>
                You are in <strong>Preview form</strong> mode. Fill answers below exactly as field staff would on web
                or mobile — including conditional questions that appear/disappear based on earlier answers.
              </Alert>
              {Array.isArray(form.allowedSubjectTypes) && form.allowedSubjectTypes.length > 1 && (
                <FormControl fullWidth size="small" sx={{ mb: 2 }}>
                  <InputLabel>Preview subject type</InputLabel>
                  <Select
                    label="Preview subject type"
                    value={previewSubjectType}
                    onChange={(e) => {
                      setPreviewSubjectType(e.target.value);
                      setPreviewProject(null);
                      setPreviewRriProgramme(null);
                    }}
                  >
                    {SUBJECT_TYPES.filter((st) => form.allowedSubjectTypes.includes(st.value)).map((st) => (
                      <MenuItem key={st.value} value={st.value}>
                        {st.label}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              )}
              {previewSubjectType === 'rri_programme' ? (
                <Autocomplete
                  options={rriProgrammes}
                  loading={loadingRriProgrammes}
                  getOptionLabel={getProgrammeLabel}
                  value={previewRriProgramme}
                  onChange={(_, v) => setPreviewRriProgramme(v)}
                  sx={{ mb: 2 }}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label="Preview RRI programme (for indicator fields)"
                      helperText="Optional — pick a programme to load aggregated indicator options."
                    />
                  )}
                />
              ) : (
                <Autocomplete
                  options={projects}
                  loading={loadingProjects}
                  getOptionLabel={(p) => (p?.projectName || p?.name ? `${p.projectName || p.name} (#${p.id})` : '')}
                  value={previewProject}
                  onChange={(_, v) => setPreviewProject(v)}
                  sx={{ mb: 2 }}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label="Preview project (for milestone / BQ / indicator fields)"
                      helperText="Optional — pick a project to load database-driven field options."
                    />
                  )}
                />
              )}
              <ChecklistFormFields
                structure={previewStructure}
                value={previewAnswers}
                onChange={setPreviewAnswers}
                projectId={previewProject?.id ?? null}
                subjectType={previewSubjectType}
                rriProgrammeId={getProgrammeId(previewRriProgramme)}
              />
            </Box>
          ) : (
          <Stack spacing={2} sx={{ mt: 0 }}>
            <Alert severity="info" icon={<VisibilityOutlinedIcon fontSize="inherit" />}>
              When your sections and questions are ready, click{' '}
              <strong>2. Preview form (test like field officer)</strong> in the bar above (or the Preview button
              below) before saving.
            </Alert>
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
            <Typography variant="subtitle2" fontWeight={700}>
              Visit subject types
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Choose whether field staff link submissions to a project, an RRI programme, or both.
            </Typography>
            <Stack direction="row" spacing={1} flexWrap="wrap">
              {SUBJECT_TYPES.map((st) => (
                <FormControlLabel
                  key={st.value}
                  control={
                    <Checkbox
                      checked={(form.allowedSubjectTypes || ['project']).includes(st.value)}
                      onChange={(e) => {
                        setForm((p) => {
                          const cur = Array.isArray(p.allowedSubjectTypes) ? [...p.allowedSubjectTypes] : ['project'];
                          let next = e.target.checked
                            ? [...new Set([...cur, st.value])]
                            : cur.filter((v) => v !== st.value);
                          if (!next.length) next = ['project'];
                          return { ...p, allowedSubjectTypes: next };
                        });
                      }}
                    />
                  }
                  label={st.label}
                />
              ))}
            </Stack>
            <Divider />
            <Typography variant="subtitle2" fontWeight={700}>
              Access control (optional)
            </Typography>
            <Alert severity="info" sx={{ py: 0.5 }}>
              Leave unrestricted to show this template to all staff. When restricted, only assigned roles, assigned
              users, and the template creator can use it (admins always see all templates here).
            </Alert>
            <FormControlLabel
              control={
                <Checkbox
                  checked={!!form.restrictAccess}
                  onChange={(e) => setForm((p) => ({ ...p, restrictAccess: e.target.checked }))}
                />
              }
              label="Restrict access — limit who can see and use this template"
            />
            {form.restrictAccess && (
              <Stack spacing={1.5}>
                <Autocomplete
                  multiple
                  options={roleOptions}
                  getOptionLabel={(r) => r.roleName || r.name || r.role || `Role #${r.roleId ?? r.roleid ?? r.id}`}
                  value={roleOptions.filter((r) =>
                    (form.roleIds || []).includes(Number(r.roleId ?? r.roleid ?? r.id))
                  )}
                  onChange={(_, vals) =>
                    setForm((p) => ({
                      ...p,
                      roleIds: vals.map((r) => Number(r.roleId ?? r.roleid ?? r.id)).filter(Number.isFinite),
                    }))
                  }
                  renderInput={(params) => <TextField {...params} label="Allowed roles" size="small" />}
                />
                <Autocomplete
                  multiple
                  options={userOptions}
                  getOptionLabel={(u) => {
                    const name = [u.firstName || u.firstname, u.lastName || u.lastname].filter(Boolean).join(' ').trim();
                    return name ? `${name} (${u.username || u.email || u.id})` : u.username || u.email || `User #${u.id}`;
                  }}
                  value={userOptions.filter((u) => (form.userIds || []).includes(Number(u.id ?? u.userId ?? u.userid)))}
                  onChange={(_, vals) =>
                    setForm((p) => ({
                      ...p,
                      userIds: vals.map((u) => Number(u.id ?? u.userId ?? u.userid)).filter(Number.isFinite),
                    }))
                  }
                  renderInput={(params) => <TextField {...params} label="Allowed users" size="small" />}
                />
              </Stack>
            )}
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
                        {(it.type === 'project_milestones' || it.type === 'project_bq_items' || it.type === 'indicator') && (
                          <FormControlLabel
                            control={
                              <Checkbox
                                checked={!!it.allowMultiple}
                                onChange={(e) => patchItem(si, ii, { allowMultiple: e.target.checked })}
                              />
                            }
                            label="Allow multiple selections"
                          />
                        )}
                        {it.type === 'photo' && (
                          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                            <TextField
                              size="small"
                              fullWidth
                              type="number"
                              label="Max photos"
                              inputProps={{ min: 1, max: 10 }}
                              value={it.maxPhotos ?? 1}
                              onChange={(e) => {
                                patchItem(si, ii, { maxPhotos: Number(e.target.value) || 1 });
                              }}
                            />
                            <FormControlLabel
                              control={
                                <Checkbox
                                  checked={!!it.requireGps}
                                  onChange={(e) => patchItem(si, ii, { requireGps: e.target.checked })}
                                />
                              }
                              label="Require GPS with photo"
                            />
                          </Stack>
                        )}
                        {(() => {
                          const priorItems = priorItemsForIndex(form.sections, si, ii);
                          const showIfActive = hasShowIf(it.showIf);
                          return (
                            <Box sx={{ pt: 0.5 }}>
                              <FormControlLabel
                                control={
                                  <Checkbox
                                    checked={showIfActive}
                                    disabled={!priorItems.length}
                                    onChange={(e) => {
                                      if (!e.target.checked) {
                                        patchItem(si, ii, { showIf: undefined, showIfValuesText: '' });
                                        return;
                                      }
                                      patchItem(si, ii, {
                                        showIf: defaultShowIfRule(priorItems[0]),
                                        showIfValuesText: '',
                                      });
                                    }}
                                  />
                                }
                                label={
                                  priorItems.length
                                    ? 'Show only when (conditional)'
                                    : 'Show only when — add earlier questions first'
                                }
                              />
                              {showIfActive && priorItems.length > 0 && (
                                <Box
                                  sx={{
                                    mt: 0.5,
                                    pl: 1.5,
                                    borderLeft: 2,
                                    borderColor: 'primary.light',
                                  }}
                                >
                                  <ShowIfConditionEditor
                                    showIf={it.showIf}
                                    showIfValuesText={it.showIfValuesText}
                                    priorItems={priorItems}
                                    onChange={({ showIf, showIfValuesText }) =>
                                      patchItem(si, ii, { showIf, showIfValuesText: showIfValuesText ?? '' })
                                    }
                                  />
                                </Box>
                              )}
                            </Box>
                          );
                        })()}
                      </Stack>
                    </Paper>
                  ))}
                </Stack>
              </Paper>
            ))}
          </Stack>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2, justifyContent: 'space-between' }}>
          <Button
            variant={editorTab === 'preview' ? 'contained' : 'outlined'}
            color={editorTab === 'preview' ? 'success' : 'primary'}
            startIcon={<VisibilityOutlinedIcon />}
            onClick={() => setEditorTab('preview')}
            disabled={saving}
          >
            Preview form
          </Button>
          <Stack direction="row" spacing={1}>
            <Button onClick={() => setEditorOpen(false)} disabled={saving}>
              Cancel
            </Button>
            {editorTab === 'preview' && (
              <Button variant="outlined" onClick={() => setEditorTab('design')} disabled={saving}>
                Back to design
              </Button>
            )}
            <Button variant="contained" startIcon={<SaveIcon />} onClick={saveTemplate} disabled={saving}>
              {saving ? 'Saving…' : 'Save template'}
            </Button>
          </Stack>
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
                      {Array.isArray(t.allowedSubjectTypes) && t.allowedSubjectTypes.includes('rri_programme')
                        ? ' · project + RRI'
                        : ''}
                    </MenuItem>
                  ))}
              </Select>
            </FormControl>
            {visitAllowedSubjectTypes.length > 1 && (
              <FormControl fullWidth size="small" required>
                <InputLabel>Visit subject</InputLabel>
                <Select
                  label="Visit subject"
                  value={visitSubjectType}
                  onChange={(e) => {
                    const next = e.target.value;
                    setVisitSubjectType(next);
                    setVisitProject(null);
                    setVisitRriProgramme(null);
                  }}
                  disabled={visitReadOnly || loadingVisit}
                >
                  {SUBJECT_TYPES.filter((st) => visitAllowedSubjectTypes.includes(st.value)).map((st) => (
                    <MenuItem key={st.value} value={st.value}>
                      {st.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}
            {visitSubjectType === 'rri_programme' ? (
              <>
                <Autocomplete
                  options={rriProgrammes}
                  loading={loadingRriProgrammes}
                  getOptionLabel={getProgrammeLabel}
                  isOptionEqualToValue={(a, b) => Number(getProgrammeId(a)) === Number(getProgrammeId(b))}
                  value={visitRriProgramme}
                  onChange={(_, v) => setVisitRriProgramme(v)}
                  disabled={visitReadOnly || loadingVisit}
                  renderInput={(params) => <TextField {...params} label="RRI programme" required />}
                />
                {getProgrammeId(visitRriProgramme) != null && (
                  <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                    <Chip
                      size="small"
                      color="primary"
                      variant="outlined"
                      label={`Programme: ${getProgrammeLabel(visitRriProgramme)}`}
                    />
                    <Chip size="small" variant="outlined" label={`ID: ${getProgrammeId(visitRriProgramme)}`} />
                  </Stack>
                )}
              </>
            ) : (
              <>
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
              </>
            )}
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
              <ChecklistFormFields
                structure={visitStructure}
                value={visitAnswers}
                onChange={setVisitAnswers}
                projectId={visitProject?.id ?? null}
                subjectType={visitSubjectType}
                rriProgrammeId={getProgrammeId(visitRriProgramme)}
              />
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
