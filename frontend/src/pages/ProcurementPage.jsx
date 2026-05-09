import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams, useNavigate, useLocation } from 'react-router-dom';
import {
  Alert,
  Badge,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  IconButton,
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
  Tooltip,
  Typography,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import CloseIcon from '@mui/icons-material/Close';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import { Link as RouterLink } from 'react-router-dom';
import { ROUTES } from '../configs/appConfig';
import apiService from '../api';

/** Matches api `/procurement` seed when API/catalog unavailable */
const PROCUREMENT_STAGE_FALLBACK = [
  'Needs Identification',
  'Requisition Approved',
  'Tender Published',
  'Bidder Registry',
  'Bidder Pre-Qualification',
  'Bid Evaluation',
  'Award Decision',
  'Contract Signing',
  'Purchase Order Issued',
  'Procurement Terminated',
];

/** Standard assessment outcomes for almost all procurement stages. */
const DECISIONS_STANDARD = ['Pending', 'Approved', 'Rejected', 'Clarification Required'];

/** Only at Award Decision does “Awarded” apply (winning bidder). */
const STAGE_AWARD_DECISION = 'Award Decision';

/** Pre-qual / bid eval: record closure without award before moving workflow to Procurement Terminated (optional). */
const STAGE_PRE_QUALIFICATION = 'Bidder Pre-Qualification';
const STAGE_BID_EVALUATION = 'Bid Evaluation';

function decisionsForStage(stage) {
  const s = String(stage || '').trim();
  if (s === STAGE_AWARD_DECISION) return [...DECISIONS_STANDARD, 'Awarded'];
  if (s === STAGE_PRE_QUALIFICATION || s === STAGE_BID_EVALUATION) return [...DECISIONS_STANDARD, 'Terminated'];
  return DECISIONS_STANDARD;
}

/** Short context shown beside the assessment form on wide screens. */
const STAGE_ASSESSMENT_SIDEBAR_HINTS = {
  'Needs Identification': 'Capture strategic need, feasibility, and alignment before committing budget.',
  'Requisition Approved': 'Confirm internal approvals and budget lines match the planned procurement.',
  'Tender Published': 'Verify advertisement, dates, bid security/fees, and clarification access per PPDA rules.',
  'Bidder Registry': 'Register bidders and complete master details before downstream stages.',
  'Bidder Pre-Qualification':
    'Record qualification outcomes. If no bidder qualifies or procurement stops, choose Terminated here and Save Workflow Step → Procurement Terminated. To readvertise (new tender round), set Stage back to Tender Published.',
  'Bid Evaluation':
    'Score criteria and Recommended for award for finalists. If none qualify or procurement stops, use Terminated and/or Procurement Terminated. To readvertise, move Stage to Tender Published (backward moves skip gates).',
  'Procurement Terminated':
    'Capture closure reason and references—procurement ends without award. Not a substitute for readvertising; use Tender Published again for a new tender cycle.',
  'Award Decision': 'Mark the winning bidder as Awarded before contract signing.',
  'Contract Signing':
    'Record execution dates and signatures. With Assessment Decision set to Approved, Save Workflow Step completes procurement on PostgreSQL: contractor is created or linked, contract dates from this form are copied to the project, and the project leaves the procurement list.',
  'Purchase Order Issued':
    'Record LPO references, amounts, and issue dates. County budgets often follow a July–June year—many POs lapse at financial year-end (30 June); plan renewals or replacement POs and use the template notes if a new PO supersedes an earlier one.',
};

function getStageAssessmentSidebarHint(stage) {
  const s = String(stage || '').trim();
  return STAGE_ASSESSMENT_SIDEBAR_HINTS[s]
    || 'Complete the template fields for this stage, save assessment, then save workflow step when the stage is ready.';
}

/** Stages that use bidder subjects (same list as workflow bidder-stage semantics). */
const PROCUREMENT_BIDDER_STAGES = new Set([
  'Bidder Registry',
  'Bidder Pre-Qualification',
  'Bid Evaluation',
  'Award Decision',
  'Contract Signing',
]);

const STAGE_PURCHASE_ORDER_ISSUED = 'Purchase Order Issued';
const STAGE_CONTRACT_SIGNING_LABEL = 'Contract Signing';

/** Latest workflow row by updated time — sensible default stage when reviewing handed-off projects. */
function latestWorkflowStageFromHistory(historyRows) {
  const rows = Array.isArray(historyRows) ? historyRows : [];
  if (!rows.length) return STAGE_CONTRACT_SIGNING_LABEL;
  let best = rows[0];
  let bestT = new Date(best?.updatedAt || best?.createdAt || 0).getTime();
  for (let i = 1; i < rows.length; i += 1) {
    const h = rows[i];
    const t = new Date(h?.updatedAt || h?.createdAt || 0).getTime();
    if (t >= bestT) {
      bestT = t;
      best = h;
    }
  }
  const st = String(best?.stage || '').trim();
  return st || STAGE_CONTRACT_SIGNING_LABEL;
}

function resolveProcurementReviewStage(stageHint, historyRows) {
  const hint = String(stageHint || '').trim();
  if (hint) return hint;
  return latestWorkflowStageFromHistory(historyRows);
}

/** Map API procurementHandoff payload to an acknowledgment modal for Save Workflow Step / edit history. */
function describeProcurementHandoff(h, { stage, flow }) {
  if (!h || typeof h !== 'object') return null;
  const st = String(stage || '').trim();
  if (h.ok === true) {
    return { severity: 'success', text: h.message || 'Procurement completed and project handed off.' };
  }
  if (h.ok === false && h.message) {
    return {
      severity: 'warning',
      text: `${flow === 'update' ? 'Workflow updated' : 'Workflow step saved'}, but handoff did not finish: ${h.message}`,
    };
  }
  if (!h.skipped) return null;
  if (h.reason === 'not_postgres') {
    return {
      severity: 'info',
      text: 'Automatic contractor handoff requires PostgreSQL. Update the contractor record manually if you use another database.',
    };
  }
  if (h.reason === 'decision_not_approved' && st === 'Contract Signing') {
    return {
      severity: 'info',
      text: 'Set Assessment Decision to Approved (and save assessment), then Save Workflow Step to complete procurement and hand off the contractor (PostgreSQL).',
    };
  }
  if (h.reason === 'already_finalized') {
    return { severity: 'info', text: 'This project was already handed off from procurement.' };
  }
  if (h.reason === 'wrong_stage' || h.reason === 'decision_not_approved') return null;
  return null;
}

const phoneRegex = /^(?:07\d{8}|\+2547\d{8})$/;
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const fmtCurrency = (v) =>
  `KES ${Number(v || 0).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtDate = (v) => (v ? new Date(v).toLocaleString() : 'N/A');

/** ISO YYYY-MM-DD: end date from start + duration (days or months). Null if incomplete. */
function computeContractEndDateIso(startRaw, durationRaw, unitRaw) {
  const startIso = String(startRaw || '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startIso)) return null;
  const n = Number(durationRaw);
  if (!Number.isFinite(n) || n < 0) return null;
  const unit = String(unitRaw || '').trim().toLowerCase();
  if (unit !== 'days' && unit !== 'months') return null;
  const parts = startIso.split('-').map(Number);
  const dt = new Date(parts[0], parts[1] - 1, parts[2]);
  if (Number.isNaN(dt.getTime())) return null;
  if (unit === 'days') dt.setDate(dt.getDate() + n);
  else dt.setMonth(dt.getMonth() + n);
  const yyyy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export default function ProcurementPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedProject, setSelectedProject] = useState(null);
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [showFullHistory, setShowFullHistory] = useState(false);
  const [workflowHistoryOpen, setWorkflowHistoryOpen] = useState(false);
  const [editingStep, setEditingStep] = useState(null);
  const [editDecision, setEditDecision] = useState('Pending');
  const [editNotes, setEditNotes] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingStepId, setDeletingStepId] = useState('');
  const [stageOptions, setStageOptions] = useState(PROCUREMENT_STAGE_FALLBACK);
  const [stepForm, setStepForm] = useState({
    stage: PROCUREMENT_STAGE_FALLBACK[0],
  });
  const [saving, setSaving] = useState(false);
  const [attachments, setAttachments] = useState([]);
  const [stageDocumentsOpen, setStageDocumentsOpen] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [subjects, setSubjects] = useState([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState('');
  const [assessmentTemplate, setAssessmentTemplate] = useState(null);
  const [assessmentResponses, setAssessmentResponses] = useState({});
  const [assessmentErrors, setAssessmentErrors] = useState({});
  const [assessmentDecision, setAssessmentDecision] = useState('');
  const [assessmentNotes, setAssessmentNotes] = useState('');
  const [assessmentLoading, setAssessmentLoading] = useState(false);
  const [savingAssessment, setSavingAssessment] = useState(false);
  const [newBidderName, setNewBidderName] = useState('');
  const [editBidderOpen, setEditBidderOpen] = useState(false);
  const [editBidderName, setEditBidderName] = useState('');
  const [savingBidderEdit, setSavingBidderEdit] = useState(false);
  const [deletingBidder, setDeletingBidder] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [templates, setTemplates] = useState([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [templateName, setTemplateName] = useState('');
  const [templateSubjectType, setTemplateSubjectType] = useState('bidder');
  const [templateFields, setTemplateFields] = useState([]);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [templateStage, setTemplateStage] = useState('');
  const [templateSuccess, setTemplateSuccess] = useState('');
  const [overview, setOverview] = useState(null);
  const [completedHistory, setCompletedHistory] = useState([]);
  const [workbookViewerOpen, setWorkbookViewerOpen] = useState(false);
  const [workbookViewerHtml, setWorkbookViewerHtml] = useState('');
  const [workbookViewerLoading, setWorkbookViewerLoading] = useState(false);
  const [workbookViewerProjectLabel, setWorkbookViewerProjectLabel] = useState('');
  /** Small acknowledgment modal after successful saves (above scroll area so always noticed). */
  const [saveAckModal, setSaveAckModal] = useState({
    open: false,
    title: 'Saved',
    body: '',
    extra: '',
    severity: 'success',
  });
  /** Set when opening from procured / deep link so UI explains why the project is not on the main table. */
  const [workflowEntryMode, setWorkflowEntryMode] = useState(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  /** While stages load from API, prevent resetting away from a requested stage (e.g. Purchase Order Issued). */
  const forcedWorkflowStageRef = useRef(null);

  const openProcurementWorkbookViewer = useCallback(async (projectId, projectLabel) => {
    if (!projectId) return;
    setError('');
    setWorkbookViewerProjectLabel(projectLabel?.trim() || `Project ${projectId}`);
    setWorkbookViewerLoading(true);
    setWorkbookViewerHtml('');
    setWorkbookViewerOpen(true);
    try {
      const html = await apiService.procurement.getComprehensiveWorkbookHtml({ projectId });
      setWorkbookViewerHtml(html);
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || 'Failed to load procurement workbook view.');
      setWorkbookViewerOpen(false);
    } finally {
      setWorkbookViewerLoading(false);
    }
  }, []);

  const isBidderStage = PROCUREMENT_BIDDER_STAGES.has(stepForm.stage);
  const stageSubjectType = isBidderStage ? 'bidder' : 'generic';

  const stageSelectOptions = useMemo(() => {
    const cur = String(stepForm.stage || '').trim();
    const base = [...stageOptions];
    if (cur && !base.includes(cur)) base.unshift(cur);
    return base;
  }, [stageOptions, stepForm.stage]);
  const canAddBidders = stepForm.stage === 'Bidder Registry';
  const selectedSubject = useMemo(
    () => subjects.find((s) => String(s.id) === String(selectedSubjectId)) || null,
    [subjects, selectedSubjectId]
  );
  const bidderRegistryRows = useMemo(() => {
    if (stepForm.stage !== 'Bidder Registry') return [];
    return subjects.map((s) => {
      const m = s?.metadata && typeof s.metadata === 'object' ? s.metadata : {};
      const companyName = String(m.companyName || s.subjectName || '').trim();
      return {
        id: s.id,
        companyName,
        contactName: String(m.contactName || '').trim(),
        contactPhone: String(m.contactPhone || '').trim(),
        contactEmail: String(m.contactEmail || '').trim(),
        updatedAt: s.updatedAt || s.createdAt,
      };
    });
  }, [subjects, stepForm.stage]);
  const attachmentsScopeLabel = isBidderStage && selectedSubjectId
    ? `Bidder: ${selectedSubject?.subjectName || selectedSubjectId}`
    : 'Stage / Project';

  const historyDisplay = useMemo(() => {
    if (showFullHistory) return history;
    const byStage = new Map();
    for (const h of Array.isArray(history) ? history : []) {
      const key = String(h?.stage || '').trim();
      if (!key) continue;
      const prev = byStage.get(key);
      const t = new Date(h?.updatedAt || h?.createdAt || 0).getTime();
      const pt = prev ? new Date(prev?.updatedAt || prev?.createdAt || 0).getTime() : -Infinity;
      if (!prev || t >= pt) byStage.set(key, h);
    }
    return Array.from(byStage.values()).sort((a, b) => {
      const ta = new Date(a?.updatedAt || a?.createdAt || 0).getTime();
      const tb = new Date(b?.updatedAt || b?.createdAt || 0).getTime();
      return tb - ta;
    });
  }, [history, showFullHistory]);

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
      const forced = forcedWorkflowStageRef.current;
      if (forced) {
        if (stageOptions.includes(forced)) {
          forcedWorkflowStageRef.current = null;
          return { ...prev, stage: forced };
        }
        if (prev.stage === forced) return prev;
        return { ...prev, stage: forced };
      }
      if (!prev.stage || !stageOptions.includes(prev.stage)) {
        return { stage: stageOptions[0] };
      }
      return prev;
    });
  }, [stageOptions]);

  useEffect(() => {
    if (stepForm.stage === STAGE_AWARD_DECISION) return;
    if (assessmentDecision !== 'Awarded') return;
    setAssessmentDecision('Pending');
  }, [stepForm.stage, assessmentDecision]);

  useEffect(() => {
    if (stepForm.stage === STAGE_PRE_QUALIFICATION || stepForm.stage === STAGE_BID_EVALUATION) return;
    if (assessmentDecision !== 'Terminated') return;
    setAssessmentDecision('Pending');
  }, [stepForm.stage, assessmentDecision]);

  /** Avoid saving/loading the wrong subject row when stage changes (bidder id vs generic project row). */
  const prevWorkflowStageRef = useRef();
  useEffect(() => {
    const prev = prevWorkflowStageRef.current;
    if (prev !== undefined && prev !== stepForm.stage) {
      setSelectedSubjectId('');
    }
    prevWorkflowStageRef.current = stepForm.stage;
  }, [stepForm.stage]);

  const closeSaveAckModal = () =>
    setSaveAckModal((s) => ({
      ...s,
      open: false,
    }));

  const openWorkflow = async (project, options = {}) => {
    const effectiveStage = String(options.stage ?? stepForm.stage ?? '').trim();
    const subjectTypeForStage = PROCUREMENT_BIDDER_STAGES.has(effectiveStage) ? 'bidder' : 'generic';

    setSaveAckModal((s) => ({ ...s, open: false }));
    setSelectedProject(project);
    setWorkflowEntryMode(
      options.postHandoffPo ? 'postHandoffPo' : options.postHandoffReview ? 'postHandoffReview' : null
    );
    if (options.stage) {
      forcedWorkflowStageRef.current = effectiveStage;
      setStepForm((p) => ({ ...p, stage: effectiveStage }));
    } else {
      forcedWorkflowStageRef.current = null;
    }
    setWorkflowHistoryOpen(Boolean(options.postHandoffPo || options.postHandoffReview));
    setHistory([]);
    setHistoryLoading(true);
    try {
      const data = Array.isArray(options.prefetchedHistory)
        ? options.prefetchedHistory
        : await apiService.procurement.getWorkflowHistory(project.projectId);
      setHistory(Array.isArray(data) ? data : []);
      if (effectiveStage) {
        const subs = await apiService.procurement.listStageSubjects(project.projectId, effectiveStage, {
          subjectType: subjectTypeForStage,
        });
        const list = Array.isArray(subs) ? subs : [];
        setSubjects(list);
        if (list.length) setSelectedSubjectId(String(list[0].id));
        else setSelectedSubjectId('');
      } else {
        setSubjects([]);
        setSelectedSubjectId('');
      }
    } finally {
      setHistoryLoading(false);
    }
  };

  /** Deep link: `/procurement?openPoFor=<id>&poStage=…` (query `?` must not clash with JSONB operators on the API). */
  useEffect(() => {
    const pidRaw = searchParams.get('openPoFor');
    if (!pidRaw) return undefined;
    const stageFromUrl = searchParams.get('poStage') || STAGE_PURCHASE_ORDER_ISSUED;
    let cancelled = false;
    (async () => {
      try {
        const raw = await apiService.projects.getProjectById(Number(pidRaw));
        if (cancelled || !raw) return;
        const projectId = raw.projectId ?? raw.id;
        await openWorkflow(
          {
            projectId,
            projectName: raw.projectName ?? raw.name ?? `Project ${projectId}`,
            projectStatus: raw.projectStatus ?? raw.status ?? '',
          },
          { stage: stageFromUrl, postHandoffPo: true }
        );
        if (cancelled) return;
        setSearchParams({}, { replace: true });
      } catch {
        if (!cancelled) setSearchParams({}, { replace: true });
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- openWorkflow intentionally omitted from deps
  }, [searchParams]);

  /** Open PO workspace from Procured projects via `navigate(ROUTES.PROCUREMENT, { state: { openPoFor } })`. */
  useEffect(() => {
    const pidRaw = location.state?.openPoFor;
    if (pidRaw == null || pidRaw === '') return undefined;
    let cancelled = false;
    (async () => {
      try {
        const raw = await apiService.projects.getProjectById(Number(pidRaw));
        if (cancelled || !raw) return;
        const projectId = raw.projectId ?? raw.id;
        await openWorkflow(
          {
            projectId,
            projectName: raw.projectName ?? raw.name ?? `Project ${projectId}`,
            projectStatus: raw.projectStatus ?? raw.status ?? '',
          },
          { stage: STAGE_PURCHASE_ORDER_ISSUED, postHandoffPo: true }
        );
        if (cancelled) return;
        const rest = { ...(typeof location.state === 'object' && location.state ? location.state : {}) };
        delete rest.openPoFor;
        navigate(location.pathname, { replace: true, state: rest });
      } catch {
        const rest = { ...(typeof location.state === 'object' && location.state ? location.state : {}) };
        delete rest.openPoFor;
        if (!cancelled) navigate(location.pathname, { replace: true, state: rest });
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- openWorkflow intentionally omitted from deps
  }, [location.state?.openPoFor, navigate, location.pathname]);

  /** Deep link: `/procurement?openReviewFor=<id>&reviewStage=<optional>` — handed-off project workflow modal + history. */
  useEffect(() => {
    const pidRaw = searchParams.get('openReviewFor');
    if (!pidRaw) return undefined;
    const stageHint = searchParams.get('reviewStage');
    let cancelled = false;
    (async () => {
      try {
        const raw = await apiService.projects.getProjectById(Number(pidRaw));
        if (cancelled || !raw) return;
        const projectId = raw.projectId ?? raw.id;
        const project = {
          projectId,
          projectName: raw.projectName ?? raw.name ?? `Project ${projectId}`,
          projectStatus: raw.projectStatus ?? raw.status ?? '',
        };
        const hist = await apiService.procurement.getWorkflowHistory(projectId);
        if (cancelled) return;
        const stage = resolveProcurementReviewStage(stageHint, hist);
        await openWorkflow(project, {
          stage,
          postHandoffReview: true,
          prefetchedHistory: hist,
        });
        if (cancelled) return;
        setSearchParams((prev) => {
          const next = new URLSearchParams(prev);
          next.delete('openReviewFor');
          next.delete('reviewStage');
          return next;
        }, { replace: true });
      } catch {
        if (!cancelled) {
          setSearchParams((prev) => {
            const next = new URLSearchParams(prev);
            next.delete('openReviewFor');
            next.delete('reviewStage');
            return next;
          }, { replace: true });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- openWorkflow intentionally omitted from deps
  }, [searchParams]);

  /** Review modal from Procured projects: `navigate(PROCUREMENT, { state: { openProcurementReviewFor, procurementReviewStage? } })`. */
  useEffect(() => {
    const pidRaw = location.state?.openProcurementReviewFor;
    if (pidRaw == null || pidRaw === '') return undefined;
    const stageHint = location.state?.procurementReviewStage;
    let cancelled = false;
    (async () => {
      try {
        const raw = await apiService.projects.getProjectById(Number(pidRaw));
        if (cancelled || !raw) return;
        const projectId = raw.projectId ?? raw.id;
        const project = {
          projectId,
          projectName: raw.projectName ?? raw.name ?? `Project ${projectId}`,
          projectStatus: raw.projectStatus ?? raw.status ?? '',
        };
        const hist = await apiService.procurement.getWorkflowHistory(projectId);
        if (cancelled) return;
        const stage = resolveProcurementReviewStage(stageHint, hist);
        await openWorkflow(project, {
          stage,
          postHandoffReview: true,
          prefetchedHistory: hist,
        });
        if (cancelled) return;
        const rest = { ...(typeof location.state === 'object' && location.state ? location.state : {}) };
        delete rest.openProcurementReviewFor;
        delete rest.procurementReviewStage;
        navigate(location.pathname, { replace: true, state: rest });
      } catch {
        const rest = { ...(typeof location.state === 'object' && location.state ? location.state : {}) };
        delete rest.openProcurementReviewFor;
        delete rest.procurementReviewStage;
        if (!cancelled) navigate(location.pathname, { replace: true, state: rest });
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- openWorkflow intentionally omitted from deps
  }, [location.state?.openProcurementReviewFor, location.state?.procurementReviewStage, navigate, location.pathname]);

  /** Workbook only: `/procurement?openWorkbookFor=<id>` */
  useEffect(() => {
    const pidRaw = searchParams.get('openWorkbookFor');
    if (!pidRaw) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const raw = await apiService.projects.getProjectById(Number(pidRaw));
        if (cancelled || !raw) return;
        const projectId = raw.projectId ?? raw.id;
        const label = raw.projectName ?? raw.name ?? `Project ${projectId}`;
        await openProcurementWorkbookViewer(projectId, label);
        if (cancelled) return;
        setSearchParams((prev) => {
          const next = new URLSearchParams(prev);
          next.delete('openWorkbookFor');
          return next;
        }, { replace: true });
      } catch {
        if (!cancelled) {
          setSearchParams((prev) => {
            const next = new URLSearchParams(prev);
            next.delete('openWorkbookFor');
            return next;
          }, { replace: true });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [searchParams, openProcurementWorkbookViewer]);

  /** Workbook only from navigation state (Procured projects button). */
  useEffect(() => {
    const pidRaw = location.state?.openProcurementWorkbookFor;
    if (pidRaw == null || pidRaw === '') return undefined;
    let cancelled = false;
    (async () => {
      try {
        const raw = await apiService.projects.getProjectById(Number(pidRaw));
        if (cancelled || !raw) return;
        const projectId = raw.projectId ?? raw.id;
        const label = raw.projectName ?? raw.name ?? `Project ${projectId}`;
        await openProcurementWorkbookViewer(projectId, label);
        if (cancelled) return;
        const rest = { ...(typeof location.state === 'object' && location.state ? location.state : {}) };
        delete rest.openProcurementWorkbookFor;
        navigate(location.pathname, { replace: true, state: rest });
      } catch {
        const rest = { ...(typeof location.state === 'object' && location.state ? location.state : {}) };
        delete rest.openProcurementWorkbookFor;
        if (!cancelled) navigate(location.pathname, { replace: true, state: rest });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [location.state?.openProcurementWorkbookFor, navigate, location.pathname, openProcurementWorkbookViewer]);

  const saveStep = async () => {
    if (!selectedProject?.projectId) return;
    setSaving(true);
    setError('');
    try {
      const res = await apiService.procurement.addWorkflowStep(selectedProject.projectId, {
        stage: stepForm.stage,
        decision: (assessmentDecision || '').trim() || null,
        notes: (assessmentNotes || '').trim() || null,
      });
      const notice = describeProcurementHandoff(res?.procurementHandoff, { stage: stepForm.stage, flow: 'add' });
      const sev = notice?.severity || 'success';
      setSaveAckModal({
        open: true,
        title:
          sev === 'success' && notice
            ? 'Procurement complete'
            : sev === 'warning'
              ? 'Saved — note'
              : 'Saved successfully',
        body: 'Workflow step saved successfully.',
        extra: notice?.text || '',
        severity: sev === 'warning' ? 'warning' : sev === 'info' ? 'info' : 'success',
      });
      const refreshed = await apiService.procurement.getWorkflowHistory(selectedProject.projectId);
      setHistory(Array.isArray(refreshed) ? refreshed : []);
      await loadAttachmentsForScope();
      await loadProjects();
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || 'Failed to save workflow step.');
    } finally {
      setSaving(false);
    }
  };

  const openEditStep = (row) => {
    setEditingStep(row || null);
    const d = row?.decision || 'Pending';
    const stageRow = String(row?.stage || '').trim();
    const allowAwarded = stageRow === STAGE_AWARD_DECISION;
    const allowTerminated = stageRow === STAGE_PRE_QUALIFICATION || stageRow === STAGE_BID_EVALUATION;
    let next = d;
    if (!allowAwarded && d === 'Awarded') next = 'Pending';
    if (!allowTerminated && d === 'Terminated') next = 'Pending';
    setEditDecision(next);
    setEditNotes(row?.notes || '');
  };

  const closeEditStep = () => {
    setEditingStep(null);
    setEditDecision('Pending');
    setEditNotes('');
  };

  const saveEditStep = async () => {
    if (!selectedProject?.projectId || !editingStep?.id) return;
    setSavingEdit(true);
    setError('');
    try {
      const res = await apiService.procurement.updateWorkflowStep(selectedProject.projectId, editingStep.id, {
        decision: editDecision,
        notes: editNotes,
      });
      const notice = describeProcurementHandoff(res?.procurementHandoff, {
        stage: editingStep?.stage,
        flow: 'update',
      });
      const sev = notice?.severity || 'success';
      setSaveAckModal({
        open: true,
        title:
          sev === 'success' && notice
            ? 'Procurement complete'
            : sev === 'warning'
              ? 'Updated — note'
              : 'Saved successfully',
        body: 'Workflow history updated successfully.',
        extra: notice?.text || '',
        severity: sev === 'warning' ? 'warning' : sev === 'info' ? 'info' : 'success',
      });
      const refreshed = await apiService.procurement.getWorkflowHistory(selectedProject.projectId);
      setHistory(Array.isArray(refreshed) ? refreshed : []);
      await loadProjects();
      closeEditStep();
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || 'Failed to update workflow step.');
    } finally {
      setSavingEdit(false);
    }
  };

  const deleteStep = async (row) => {
    if (!selectedProject?.projectId || !row?.id) return;
    setDeletingStepId(String(row.id));
    setError('');
    try {
      await apiService.procurement.deleteWorkflowStep(selectedProject.projectId, row.id);
      const refreshed = await apiService.procurement.getWorkflowHistory(selectedProject.projectId);
      setHistory(Array.isArray(refreshed) ? refreshed : []);
      await loadProjects();
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || 'Failed to delete workflow step.');
    } finally {
      setDeletingStepId('');
    }
  };

  const handleUploadAttachment = async (event) => {
    const file = event.target.files?.[0];
    if (!file || !selectedProject?.projectId) return;
    const formData = new FormData();
    formData.append('file', file);
    formData.append('stage', stepForm.stage || '');
    if (isBidderStage && selectedSubjectId) formData.append('subjectId', String(selectedSubjectId));
    formData.append('title', file.name);
    setUploadingDoc(true);
    try {
      await apiService.procurement.uploadAttachment(selectedProject.projectId, formData);
      const docs = await apiService.procurement.getAttachments(selectedProject.projectId, {
        subjectId: isBidderStage && selectedSubjectId ? String(selectedSubjectId) : undefined,
        stage: stepForm.stage || '',
      });
      setAttachments(Array.isArray(docs) ? docs : []);
    } finally {
      setUploadingDoc(false);
      event.target.value = '';
    }
  };

  const loadSubjectsForCurrentStage = useCallback(async () => {
    if (!selectedProject?.projectId || !stepForm.stage) return;
    const subs = await apiService.procurement.listStageSubjects(selectedProject.projectId, stepForm.stage, { subjectType: stageSubjectType });
    const list = Array.isArray(subs) ? subs : [];
    setSubjects(list);
    setSelectedSubjectId((prev) => {
      if (!list.length) return '';
      const stillValid = list.some((s) => String(s.id) === String(prev));
      return stillValid ? prev : String(list[0].id);
    });
  }, [selectedProject?.projectId, stepForm.stage, stageSubjectType]);

  useEffect(() => {
    loadSubjectsForCurrentStage();
  }, [loadSubjectsForCurrentStage]);

  const loadAttachmentsForScope = useCallback(async () => {
    if (!selectedProject?.projectId) return;
    try {
      const docs = await apiService.procurement.getAttachments(selectedProject.projectId, {
        subjectId: isBidderStage && selectedSubjectId ? String(selectedSubjectId) : undefined,
        stage: stepForm.stage || '',
      });
      setAttachments(Array.isArray(docs) ? docs : []);
    } catch {
      setAttachments([]);
    }
  }, [selectedProject?.projectId, isBidderStage, selectedSubjectId, stepForm.stage]);

  useEffect(() => {
    loadAttachmentsForScope();
  }, [loadAttachmentsForScope]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!selectedSubjectId) {
        setAssessmentTemplate(null);
        setAssessmentResponses({});
        setAssessmentErrors({});
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
        setAssessmentErrors({});
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

  useEffect(() => {
    if (stepForm.stage !== 'Contract Signing') return;
    const computed = computeContractEndDateIso(
      assessmentResponses?.contractProjectStartDate,
      assessmentResponses?.contractDurationValue,
      assessmentResponses?.contractDurationUnit,
    );
    if (!computed) return;
    setAssessmentResponses((prev) => {
      if (prev.contractProjectEndDate === computed) return prev;
      return { ...prev, contractProjectEndDate: computed };
    });
  }, [
    stepForm.stage,
    assessmentResponses?.contractProjectStartDate,
    assessmentResponses?.contractDurationValue,
    assessmentResponses?.contractDurationUnit,
  ]);

  const handleAddBidder = async () => {
    if (!selectedProject?.projectId || !stepForm.stage || !newBidderName.trim()) return;
    const created = await apiService.procurement.createStageSubject(selectedProject.projectId, stepForm.stage, {
      subjectType: 'bidder',
      subjectName: newBidderName.trim(),
    });
    setNewBidderName('');
    await loadSubjectsForCurrentStage();
    if (created?.id) setSelectedSubjectId(String(created.id));
  };

  const openEditBidder = () => {
    if (!selectedSubjectId || !selectedSubject) return;
    setEditBidderName(selectedSubject.subjectName || '');
    setEditBidderOpen(true);
  };

  const saveBidderEdit = async () => {
    if (!selectedSubjectId) return;
    setSavingBidderEdit(true);
    setError('');
    try {
      await apiService.procurement.updateSubject(selectedSubjectId, { subjectName: editBidderName });
      setEditBidderOpen(false);
      await loadSubjectsForCurrentStage();
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || 'Failed to update bidder.');
    } finally {
      setSavingBidderEdit(false);
    }
  };

  const deleteSelectedBidder = async () => {
    if (!selectedSubjectId) return;
    setDeletingBidder(true);
    setError('');
    try {
      await apiService.procurement.deleteSubject(selectedSubjectId);
      setSelectedSubjectId('');
      await loadSubjectsForCurrentStage();
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || 'Failed to delete bidder.');
    } finally {
      setDeletingBidder(false);
    }
  };

  const validateBidderRegistryField = (key, valueRaw) => {
    if (stepForm.stage !== 'Bidder Registry') return '';
    const v = String(valueRaw ?? '').trim();
    if (key === 'contactEmail') {
      if (v && !emailRegex.test(v)) return 'Please enter a valid email address (e.g., user@example.com)';
    }
    if (key === 'contactPhone') {
      if (v && !phoneRegex.test(v)) return 'Use 07XXXXXXXX or +2547XXXXXXXX';
    }
    return '';
  };

  const setAssessmentValue = (key, value) => {
    setAssessmentResponses((prev) => ({ ...prev, [key]: value }));
    const msg = validateBidderRegistryField(key, value);
    setAssessmentErrors((prev) => {
      const next = { ...prev };
      if (msg) next[key] = msg;
      else delete next[key];
      return next;
    });
  };

  const validateAssessmentBeforeSave = () => {
    if (stepForm.stage !== 'Bidder Registry') return true;
    const next = {};
    const emailMsg = validateBidderRegistryField('contactEmail', assessmentResponses?.contactEmail);
    const phoneMsg = validateBidderRegistryField('contactPhone', assessmentResponses?.contactPhone);
    if (emailMsg) next.contactEmail = emailMsg;
    if (phoneMsg) next.contactPhone = phoneMsg;
    setAssessmentErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSaveAssessment = async () => {
    if (!selectedSubjectId) {
      setError('Select or load a stage subject before saving the assessment (wait for the subject list to finish loading).');
      return;
    }
    if (!validateAssessmentBeforeSave()) return;
    const savingForSubjectId = String(selectedSubjectId);
    setSavingAssessment(true);
    setError('');
    try {
      await apiService.procurement.saveSubjectAssessment(savingForSubjectId, {
        responses: assessmentResponses,
        decision: assessmentDecision,
        notes: assessmentNotes,
      });
      // Reload the just-saved bidder/item so the form reflects what was persisted.
      try {
        const payload = await apiService.procurement.getSubjectAssessment(savingForSubjectId);
        setAssessmentTemplate(payload?.template || null);
        setAssessmentResponses(payload?.assessment?.responses || {});
        setAssessmentErrors({});
        setAssessmentDecision(payload?.assessment?.decision || '');
        setAssessmentNotes(payload?.assessment?.notes || '');
      } catch {
        // ignore; stage reload below will still refresh list and stats
      }
      await loadSubjectsForCurrentStage();
      setSaveAckModal({
        open: true,
        title: 'Saved successfully',
        body:
          stepForm.stage === 'Bidder Registry'
            ? 'Bidder details saved successfully.'
            : 'Assessment saved successfully.',
        extra: '',
        severity: 'success',
      });
    } finally {
      setSavingAssessment(false);
    }
  };

  const openTemplatesManager = async () => {
    try {
      setTemplatesOpen(true);
      setTemplateSuccess('');
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
    const t = templates.find((x) => String(x.id) === id);
    if (!t) return;
    const idNum = Number(id);
    // Fallback templates can have negative ids; treat them as "Create New" while pre-filling fields.
    setSelectedTemplateId(Number.isFinite(idNum) && idNum > 0 ? id : '');
    setTemplateStage(t.stage || templateStage);
    setTemplateName(t.name || '');
    setTemplateSubjectType(t.subjectType || 'bidder');
    setTemplateFields(Array.isArray(t.fields) ? t.fields : []);
    setTemplateSuccess('');
  };

  const handleTemplateStageChange = async (newStage) => {
    const stage = String(newStage || '').trim();
    setTemplateStage(stage);
    setTemplateSuccess('');
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
    setTemplateSuccess('');
    try {
      const payload = {
        stage: templateStage,
        name: templateName.trim(),
        subjectType: templateSubjectType || 'bidder',
        fields: templateFields,
      };
      let savedId = selectedTemplateId;
      const idNum = Number(selectedTemplateId);
      if (selectedTemplateId && Number.isFinite(idNum) && idNum > 0) {
        await apiService.procurement.updateTemplate(selectedTemplateId, payload);
      } else {
        const created = await apiService.procurement.createTemplate(payload);
        savedId = String(created?.id || '');
      }
      const data = await apiService.procurement.listTemplates({ stage: templateStage, all: true });
      const list = Array.isArray(data) ? data : [];
      setTemplates(list);
      if (savedId) {
        const t = list.find((x) => String(x.id) === String(savedId));
        if (t) {
          setSelectedTemplateId(String(t.id));
          setTemplateStage(t.stage || templateStage);
          setTemplateName(t.name || templateName);
          setTemplateSubjectType(t.subjectType || templateSubjectType || 'bidder');
          setTemplateFields(Array.isArray(t.fields) ? t.fields : []);
        }
      }
      setTemplateSuccess(`Saved at ${new Date().toLocaleTimeString()}`);
      window.setTimeout(() => setTemplateSuccess(''), 2500);
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

  const closeWorkbookViewer = () => {
    setWorkbookViewerOpen(false);
    setWorkbookViewerHtml('');
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
          Projects currently under procurement and their basic workflow progress. Handed-off projects are listed in{' '}
          <Link component={RouterLink} to={ROUTES.PROCUREMENT_PROCURED_PROJECTS} underline="hover">
            Procured Projects
          </Link>
          .
        </Typography>
        {overview?.metrics ? (
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} sx={{ mt: 1 }}>
            <Chip size="small" label={`Projects: ${overview.metrics.projectsUnderProcurement || 0}`} />
            <Chip size="small" label={`Subjects: ${overview.metrics.totalSubjects || 0}`} />
            <Chip size="small" label={`Qualified: ${overview.metrics.totalQualifiedSubjects || 0}`} color="success" />
            <Chip size="small" label={`Assessments: ${overview.metrics.totalAssessments || 0}`} />
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
                <TableCell align="center"><strong>Actions</strong></TableCell>
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
                  <TableCell align="center">
                    <Stack direction="row" spacing={0.5} alignItems="center" justifyContent="center">
                      <Tooltip title="View procurement workbook (summary, workflow, assessments, attachments…)">
                        <IconButton
                          size="small"
                          color="primary"
                          aria-label="View procurement workbook"
                          onClick={() => openProcurementWorkbookViewer(r.projectId, r.projectName)}
                        >
                          <VisibilityOutlinedIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Button size="small" variant="outlined" onClick={() => openWorkflow(r)}>
                        Open Workflow
                      </Button>
                    </Stack>
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

      <Dialog
        open={Boolean(selectedProject)}
        onClose={() => {
          setSaveAckModal((s) => ({ ...s, open: false }));
          setWorkflowEntryMode(null);
          forcedWorkflowStageRef.current = null;
          setSelectedProject(null);
        }}
        maxWidth="lg"
        fullWidth
        scroll="paper"
        PaperProps={{
          sx: {
            height: { xs: 'calc(100vh - 16px)', sm: 'calc(100vh - 32px)' },
            maxHeight: { xs: 'calc(100vh - 16px)', sm: 'calc(100vh - 32px)' },
            display: 'flex',
            flexDirection: 'column',
            m: { xs: 1, sm: 2 },
          },
        }}
      >
        <DialogTitle sx={{ py: 1, px: 2, flexShrink: 0 }}>
          <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
            <Typography
              variant="subtitle1"
              component="div"
              fontWeight={700}
              noWrap
              sx={{ flex: 1, minWidth: 0 }}
              title={selectedProject?.projectName ? `Procurement Workflow: ${selectedProject.projectName}` : ''}
            >
              {workflowEntryMode === 'postHandoffPo'
                ? `Purchase order — ${selectedProject?.projectName || ''}`
                : workflowEntryMode === 'postHandoffReview'
                  ? `Procurement history — ${selectedProject?.projectName || ''}`
                  : `Procurement Workflow: ${selectedProject?.projectName || ''}`}
            </Typography>
            <Tooltip title="View full procurement workbook in the app">
              <IconButton
                size="small"
                color="primary"
                aria-label="View procurement workbook"
                onClick={() =>
                  openProcurementWorkbookViewer(selectedProject?.projectId, selectedProject?.projectName)
                }
                disabled={!selectedProject?.projectId || workbookViewerLoading}
              >
                <VisibilityOutlinedIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Stack>
        </DialogTitle>
        <DialogContent
          dividers
          sx={{
            pt: 1,
            px: { xs: 1.5, sm: 2 },
            pb: 1,
            flex: '1 1 auto',
            overflow: 'auto',
            minHeight: 0,
          }}
        >
          {workflowEntryMode === 'postHandoffPo' ? (
            <Alert severity="info" sx={{ mb: 1.25 }}>
              This project has already left <strong>under procurement</strong> (handoff after contract signing). It will not appear in the main procurement table.
              Use this dialog to record or update <strong>Purchase Order Issued</strong> (template, attachments, workflow step). You can switch stage to review earlier procurement history if needed.
            </Alert>
          ) : null}
          {workflowEntryMode === 'postHandoffReview' ? (
            <Alert severity="info" sx={{ mb: 1.25 }}>
              This project has completed procurement <strong>handoff</strong> and does not appear in the main under-procurement table. Use the workflow history below and the <strong>Stage</strong> selector to browse steps, assessments, and attachments.
              Open the <strong>workbook</strong> (eye icon above) for the full HTML summary—same as on active procurement projects.
            </Alert>
          ) : null}
          <Box
            sx={{
              position: 'sticky',
              top: 0,
              zIndex: 2,
              bgcolor: 'background.paper',
              pb: 1,
              mb: 0.75,
              borderBottom: 1,
              borderColor: 'divider',
            }}
          >
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
              <TextField
                select
                label="Stage"
                value={stageSelectOptions.includes(stepForm.stage) ? stepForm.stage : ''}
                onChange={(e) => {
                  const next = e.target.value;
                  forcedWorkflowStageRef.current = null;
                  setSelectedSubjectId('');
                  setStepForm((p) => ({ ...p, stage: next }));
                }}
                size="small"
                sx={{ minWidth: 280 }}
              >
                {stageSelectOptions.map((s) => (
                  <MenuItem key={s} value={s}>
                    {s}
                  </MenuItem>
                ))}
              </TextField>
              <Tooltip
                title={
                  isBidderStage && !selectedSubjectId
                    ? 'Select a bidder first, then open to view or upload documents for this stage.'
                    : 'View and upload documents for the current stage (opens in a panel).'
                }
              >
                <span>
                  <IconButton
                    color="primary"
                    aria-label="Stage documents"
                    onClick={() => {
                      setStageDocumentsOpen(true);
                      void loadAttachmentsForScope();
                    }}
                    size="medium"
                  >
                    <Badge
                      color="secondary"
                      badgeContent={attachments.length}
                      invisible={attachments.length === 0}
                      max={99}
                    >
                      <AttachFileIcon />
                    </Badge>
                  </IconButton>
                </span>
              </Tooltip>
            </Stack>
          </Box>

          {historyLoading ? (
            <Typography variant="body2">Loading workflow history...</Typography>
          ) : (
            <Stack spacing={1.5}>
              <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
                <Stack
                  direction="row"
                  alignItems="center"
                  justifyContent="space-between"
                  onClick={() => setWorkflowHistoryOpen((v) => !v)}
                  sx={{
                    px: 1.25,
                    py: 0.75,
                    cursor: 'pointer',
                    userSelect: 'none',
                    '&:hover': { bgcolor: 'action.hover' },
                  }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setWorkflowHistoryOpen((v) => !v);
                    }
                  }}
                  aria-expanded={workflowHistoryOpen}
                >
                  <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                    <ExpandMoreIcon
                      sx={{
                        transform: workflowHistoryOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                        transition: 'transform 0.2s',
                      }}
                    />
                    <Typography variant="subtitle1" fontWeight={700}>
                      Workflow history {showFullHistory ? '(full audit trail)' : '(latest per stage)'}
                    </Typography>
                    {!workflowHistoryOpen && (
                      <Chip
                        size="small"
                        label={
                          historyDisplay.length === 0
                            ? 'No entries'
                            : `${historyDisplay.length} ${showFullHistory ? 'row' : 'stage'}${historyDisplay.length === 1 ? '' : 's'}`
                        }
                        variant="outlined"
                      />
                    )}
                  </Stack>
                  <Typography variant="caption" color="text.secondary">
                    {workflowHistoryOpen ? 'Hide' : 'Show'}
                  </Typography>
                </Stack>
                <Collapse in={workflowHistoryOpen}>
                  <Stack spacing={1.25} sx={{ px: 1.25, pb: 1.5 }}>
                    <FormControlLabel
                      control={(
                        <Checkbox
                          checked={showFullHistory}
                          onChange={(e) => setShowFullHistory(e.target.checked)}
                          size="small"
                        />
                      )}
                      label={<Typography variant="body2">Show full audit trail (every save)</Typography>}
                    />
                    <TableContainer component={Paper} variant="outlined">
                      <Table size="small">
                        <TableHead>
                          <TableRow>
                            <TableCell><strong>Stage</strong></TableCell>
                            <TableCell><strong>Decision</strong></TableCell>
                            <TableCell><strong>Notes</strong></TableCell>
                            <TableCell><strong>Updated</strong></TableCell>
                            <TableCell align="right"><strong>Actions</strong></TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {historyDisplay.map((h) => (
                            <TableRow key={h.id}>
                              <TableCell>{h.stage}</TableCell>
                              <TableCell>{h.decision || 'Pending'}</TableCell>
                              <TableCell>{h.notes || '-'}</TableCell>
                              <TableCell>{fmtDate(h.updatedAt || h.createdAt)}</TableCell>
                              <TableCell align="right">
                                <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                                  <Tooltip title="Edit step">
                                    <IconButton size="small" onClick={() => openEditStep(h)}>
                                      <EditIcon fontSize="small" />
                                    </IconButton>
                                  </Tooltip>
                                  <Tooltip title="Delete step">
                                    <span>
                                      <IconButton
                                        size="small"
                                        color="error"
                                        disabled={deletingStepId === String(h.id)}
                                        onClick={() => deleteStep(h)}
                                      >
                                        <DeleteIcon fontSize="small" />
                                      </IconButton>
                                    </span>
                                  </Tooltip>
                                </Stack>
                              </TableCell>
                            </TableRow>
                          ))}
                          {historyDisplay.length === 0 && (
                            <TableRow>
                              <TableCell colSpan={5} align="center">No workflow updates yet.</TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </Stack>
                </Collapse>
              </Paper>

              <Divider />
              <Typography variant="subtitle1" fontWeight={700}>
                {isBidderStage ? 'Bidder assessment (stage template)' : 'Stage assessment (stage template)'}
              </Typography>
              {isBidderStage && canAddBidders ? (
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                  <TextField
                    size="small"
                    fullWidth
                    label="Add bidder (registry)"
                    value={newBidderName}
                    onChange={(e) => setNewBidderName(e.target.value)}
                  />
                  <Button variant="contained" onClick={handleAddBidder} disabled={!newBidderName.trim()}>
                    Register Bidder
                  </Button>
                </Stack>
              ) : null}
              {stepForm.stage === 'Bidder Registry' && subjects.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  No bidders registered yet. Use “Register Bidder” above to add bidders, then select one to capture registry details using the template fields.
                </Typography>
              ) : null}
              {stepForm.stage === 'Bidder Registry' && subjects.length ? (
                <TableContainer component={Paper} variant="outlined">
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell><strong>Company</strong></TableCell>
                        <TableCell><strong>Contact person</strong></TableCell>
                        <TableCell><strong>Phone</strong></TableCell>
                        <TableCell><strong>Email</strong></TableCell>
                        <TableCell><strong>Updated</strong></TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {bidderRegistryRows.map((b) => (
                        <TableRow
                          key={b.id}
                          hover
                          selected={String(selectedSubjectId) === String(b.id)}
                          sx={{ cursor: 'pointer' }}
                          onClick={() => setSelectedSubjectId(String(b.id))}
                        >
                          <TableCell>{b.companyName || '-'}</TableCell>
                          <TableCell>{b.contactName || '-'}</TableCell>
                          <TableCell>{b.contactPhone || '-'}</TableCell>
                          <TableCell>{b.contactEmail || '-'}</TableCell>
                          <TableCell>{fmtDate(b.updatedAt)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              ) : null}
              {(isBidderStage || subjects.length > 1) ? (
                <TextField
                  select
                  size="small"
                  label={isBidderStage ? 'Select bidder' : 'Select item'}
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
              ) : null}
              {stepForm.stage === 'Bidder Registry' ? (
                <Stack direction="row" spacing={1}>
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={openEditBidder}
                    disabled={!selectedSubjectId}
                  >
                    Edit bidder
                  </Button>
                  <Button
                    size="small"
                    color="error"
                    variant="outlined"
                    onClick={deleteSelectedBidder}
                    disabled={!selectedSubjectId || deletingBidder}
                  >
                    {deletingBidder ? 'Deleting...' : 'Delete bidder'}
                  </Button>
                </Stack>
              ) : null}

              {assessmentLoading ? (
                <Typography variant="body2">Loading assessment...</Typography>
              ) : assessmentTemplate?.fields?.length ? (
                <Stack direction={{ xs: 'column', lg: 'row' }} spacing={2} alignItems="flex-start">
                  <Box sx={{ flex: 1, minWidth: 0, width: '100%' }}>
                    <Box
                      sx={{
                        display: 'grid',
                        gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' },
                        gap: 1,
                        columnGap: 2,
                        rowGap: 0.5,
                        alignItems: 'start',
                      }}
                    >
                      {assessmentTemplate.fields.map((f) => {
                        const key = f.key;
                        if (stepForm.stage === 'Bid Evaluation' && key === 'recommendedForAward') return null;
                        const val = assessmentResponses?.[key];
                        const fullSpan = { gridColumn: '1 / -1' };
                        if (f.type === 'checkbox') {
                          return (
                            <Stack key={key} direction="row" spacing={1} alignItems="flex-start" sx={{ minWidth: 0 }}>
                              <Checkbox checked={Boolean(val)} onChange={(e) => setAssessmentValue(key, e.target.checked)} sx={{ py: 0.25 }} />
                              <Typography variant="body2" sx={{ pt: 0.35 }}>{f.label}</Typography>
                            </Stack>
                          );
                        }
                        if (f.type === 'select') {
                          return (
                            <TextField
                              key={key}
                              select
                              size="small"
                              fullWidth
                              sx={fullSpan}
                              label={f.label}
                              value={val ?? ''}
                              onChange={(e) => setAssessmentValue(key, e.target.value)}
                            >
                              {(Array.isArray(f.options) ? f.options : []).map((o, oi) => (
                                <MenuItem key={o === '' ? `opt-empty-${oi}` : String(o)} value={o}>
                                  {o === '' ? '—' : o === 'days' ? 'Days' : o === 'months' ? 'Months' : o}
                                </MenuItem>
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
                              fullWidth
                              sx={fullSpan}
                              label={f.label}
                              value={val ?? ''}
                              onChange={(e) => setAssessmentValue(key, e.target.value)}
                              inputProps={{
                                ...(f.min != null ? { min: f.min } : {}),
                                ...(f.max != null ? { max: f.max } : {}),
                              }}
                            />
                          );
                        }
                        if (f.type === 'date') {
                          return (
                            <TextField
                              key={key}
                              type="date"
                              size="small"
                              fullWidth
                              sx={fullSpan}
                              label={f.label}
                              value={val ?? ''}
                              onChange={(e) => setAssessmentValue(key, e.target.value)}
                              InputLabelProps={{ shrink: true }}
                            />
                          );
                        }
                        return (
                          <TextField
                            key={key}
                            size="small"
                            fullWidth
                            sx={fullSpan}
                            label={f.label}
                            multiline={f.type === 'textarea'}
                            minRows={f.type === 'textarea' ? 2 : undefined}
                            type={stepForm.stage === 'Bidder Registry' && key === 'contactEmail' ? 'email' : (stepForm.stage === 'Bidder Registry' && key === 'contactPhone' ? 'tel' : undefined)}
                            value={val ?? ''}
                            onChange={(e) => setAssessmentValue(key, e.target.value)}
                            error={Boolean(assessmentErrors?.[key])}
                            helperText={assessmentErrors?.[key] || ''}
                          />
                        );
                      })}
                    </Box>
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ xs: 'stretch', sm: 'flex-start' }} sx={{ mt: 1.5 }}>
                      <Stack spacing={0.5} sx={{ minWidth: 240 }}>
                        <TextField
                          select
                          size="small"
                          label="Assessment Decision"
                          value={assessmentDecision}
                          onChange={(e) => setAssessmentDecision(e.target.value)}
                          fullWidth
                          helperText={
                            stepForm.stage === STAGE_AWARD_DECISION
                              ? 'Set “Awarded” for the winning bidder. Contract Signing will list only Awarded bidders.'
                              : stepForm.stage === STAGE_BID_EVALUATION
                                ? 'Tick “Recommended for award” below when proceeding to award. Use Terminated when no qualifying bidder or procurement must stop.'
                                : stepForm.stage === STAGE_PRE_QUALIFICATION
                                  ? 'Use Terminated when no bidder qualifies or procurement stops; then Save Workflow Step → Procurement Terminated if closing without award.'
                                  : ''
                          }
                        >
                          {decisionsForStage(stepForm.stage).map((d) => <MenuItem key={d} value={d}>{d}</MenuItem>)}
                        </TextField>
                        {stepForm.stage === 'Bid Evaluation' ? (
                          <Stack direction="row" spacing={1} alignItems="flex-start">
                            <Checkbox
                              size="small"
                              checked={Boolean(assessmentResponses?.recommendedForAward)}
                              onChange={(e) => setAssessmentValue('recommendedForAward', e.target.checked)}
                              sx={{ py: 0, mt: -0.5 }}
                            />
                            <Typography variant="body2" color="text.secondary" sx={{ pt: 0.25 }}>
                              Recommended for award (required for Award Decision list)
                            </Typography>
                          </Stack>
                        ) : null}
                      </Stack>
                      <TextField
                        size="small"
                        fullWidth
                        label="Assessment Notes"
                        value={assessmentNotes}
                        onChange={(e) => setAssessmentNotes(e.target.value)}
                      />
                      <Button variant="contained" onClick={handleSaveAssessment} disabled={savingAssessment || !selectedSubjectId}>
                        {stepForm.stage === 'Bidder Registry' ? 'Save Bidder Details' : 'Save Assessment'}
                      </Button>
                      <Button variant="outlined" onClick={() => exportBidderSheet('xlsx')} disabled={!subjects.length}>
                        Export Excel
                      </Button>
                      <Button variant="outlined" onClick={() => exportBidderSheet('pdf')} disabled={!subjects.length}>
                        Export PDF
                      </Button>
                    </Stack>
                  </Box>
                  <Paper
                    variant="outlined"
                    sx={{
                      p: 1.5,
                      width: { xs: '100%', lg: 280 },
                      flexShrink: 0,
                      bgcolor: (theme) =>
                        theme.palette.mode === 'dark'
                          ? alpha(theme.palette.common.white, 0.06)
                          : alpha(theme.palette.grey[700], 0.06),
                      borderColor: 'divider',
                      position: { lg: 'sticky' },
                      top: { lg: 0 },
                      alignSelf: { lg: 'flex-start' },
                    }}
                  >
                    <Typography variant="subtitle2" fontWeight={700} color="text.primary" gutterBottom>
                      Stage guide
                    </Typography>
                    <Typography variant="body2" color="text.primary" sx={{ mb: 1.5, opacity: 0.92 }}>
                      {getStageAssessmentSidebarHint(stepForm.stage)}
                    </Typography>
                    {selectedSubject ? (
                      <Typography variant="caption" component="div" color="text.primary" sx={{ mb: 1.25, opacity: 0.88 }}>
                        <strong>Subject:</strong> {selectedSubject.subjectName || '—'}
                      </Typography>
                    ) : null}
                    <Button
                      size="small"
                      fullWidth
                      variant="outlined"
                      startIcon={<AttachFileIcon />}
                      onClick={() => {
                        setStageDocumentsOpen(true);
                        void loadAttachmentsForScope();
                      }}
                    >
                      Stage documents
                    </Button>
                    <Typography variant="caption" component="div" color="text.primary" sx={{ mt: 1, opacity: 0.78, lineHeight: 1.45 }}>
                      Files are scoped to this stage (and selected bidder when applicable). Same list as the header paperclip.
                    </Typography>
                  </Paper>
                </Stack>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  No active stage template found for this stage / subject type.
                </Typography>
              )}
            </Stack>
          )}
        </DialogContent>
        <DialogActions sx={{ py: 1, px: 2, flexShrink: 0, flexWrap: 'wrap', gap: 1 }}>
          <Button
            onClick={() => {
              setSaveAckModal((s) => ({ ...s, open: false }));
              setWorkflowEntryMode(null);
              forcedWorkflowStageRef.current = null;
              setSelectedProject(null);
            }}
          >
            Close
          </Button>
          <Button variant="outlined" onClick={() => exportComprehensive('project')} disabled={!selectedProject?.projectId}>
            Export Project Workbook
          </Button>
          <Button variant="contained" onClick={saveStep} disabled={saving}>
            Save Workflow Step
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={saveAckModal.open}
        onClose={closeSaveAckModal}
        maxWidth="xs"
        fullWidth
        disableScrollLock
        aria-labelledby="procurement-save-ack-title"
        slotProps={{ root: { sx: { zIndex: (t) => t.zIndex.modal + 2 } } } }
      >
        <DialogTitle id="procurement-save-ack-title" sx={{ pb: 0.5, fontWeight: 700 }}>
          {saveAckModal.title}
        </DialogTitle>
        <DialogContent sx={{ pt: 0.5 }}>
          <Typography variant="body1" color="text.primary">
            {saveAckModal.body}
          </Typography>
          {saveAckModal.extra ? (
            <Alert
              severity={saveAckModal.severity === 'warning' ? 'warning' : saveAckModal.severity === 'info' ? 'info' : 'success'}
              variant="outlined"
              sx={{ mt: 2 }}
            >
              {saveAckModal.extra}
            </Alert>
          ) : null}
        </DialogContent>
        <DialogActions sx={{ px: 2.5, pb: 2, pt: 0 }}>
          <Button variant="contained" onClick={closeSaveAckModal} autoFocus>
            OK
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={workbookViewerOpen}
        onClose={closeWorkbookViewer}
        maxWidth="lg"
        fullWidth
        scroll="paper"
        PaperProps={{
          sx: {
            height: { xs: 'calc(100vh - 24px)', sm: 'calc(100vh - 48px)' },
            maxHeight: { xs: 'calc(100vh - 24px)', sm: 'calc(100vh - 48px)' },
            display: 'flex',
            flexDirection: 'column',
            m: { xs: 1, sm: 2 },
          },
        }}
      >
        <DialogTitle sx={{ py: 1.25, px: 2, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography variant="subtitle1" component="span" fontWeight={700} sx={{ flex: 1, minWidth: 0 }} noWrap>
            Procurement workbook · {workbookViewerProjectLabel}
          </Typography>
          <IconButton aria-label="Close workbook view" onClick={closeWorkbookViewer} size="small">
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent
          dividers
          sx={{
            flex: '1 1 auto',
            minHeight: 0,
            p: 0,
            display: 'flex',
            flexDirection: 'column',
            bgcolor: 'grey.100',
          }}
        >
          {workbookViewerLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
              <CircularProgress />
            </Box>
          ) : (
            <Box sx={{ flex: 1, minHeight: 0, position: 'relative', bgcolor: '#fff' }}>
              <iframe
                title="Procurement workbook"
                srcDoc={workbookViewerHtml}
                sandbox=""
                style={{
                  position: 'absolute',
                  inset: 0,
                  width: '100%',
                  height: '100%',
                  border: 'none',
                }}
              />
            </Box>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={stageDocumentsOpen} onClose={() => setStageDocumentsOpen(false)} maxWidth="md" fullWidth scroll="paper">
        <DialogTitle sx={{ pb: 1 }}>
          Documents for this stage
          <Typography component="div" variant="body2" color="text.secondary" sx={{ mt: 0.5, fontWeight: 400 }}>
            {stepForm.stage || '—'} · {attachmentsScopeLabel}
          </Typography>
        </DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            {isBidderStage && !selectedSubjectId ? (
              <Alert severity="info">Select a bidder in the assessment section below to view or upload documents for this stage.</Alert>
            ) : null}
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }}>
              <Button
                variant="outlined"
                component="label"
                disabled={uploadingDoc || (isBidderStage && !selectedSubjectId)}
              >
                {uploadingDoc ? 'Uploading...' : 'Attach document'}
                <input type="file" hidden onChange={handleUploadAttachment} />
              </Button>
              <Typography variant="caption" color="text.secondary">
                {isBidderStage
                  ? (selectedSubjectId
                    ? 'Files are stored for this bidder at the current stage.'
                    : 'Choose a bidder first.')
                  : `Stored under stage “${stepForm.stage || '—'}”.`}
              </Typography>
            </Stack>
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell><strong>Title / file</strong></TableCell>
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
                      <TableCell>{a.stage || '—'}</TableCell>
                      <TableCell>{fmtDate(a.createdAt)}</TableCell>
                    </TableRow>
                  ))}
                  {!attachments.length && (
                    <TableRow>
                      <TableCell colSpan={3} align="center">No attachments for this stage yet.</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setStageDocumentsOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(editingStep)} onClose={closeEditStep} maxWidth="sm" fullWidth>
        <DialogTitle>Edit workflow step</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={1}>
            <TextField size="small" label="Stage" value={editingStep?.stage || ''} disabled />
            <TextField
              select
              size="small"
              label="Decision"
              value={editDecision}
              onChange={(e) => setEditDecision(e.target.value)}
            >
              {decisionsForStage(editingStep?.stage).map((d) => <MenuItem key={d} value={d}>{d}</MenuItem>)}
            </TextField>
            <TextField
              size="small"
              label="Notes"
              value={editNotes}
              onChange={(e) => setEditNotes(e.target.value)}
              multiline
              minRows={2}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeEditStep} disabled={savingEdit}>Cancel</Button>
          <Button variant="contained" onClick={saveEditStep} disabled={savingEdit}>
            {savingEdit ? 'Saving...' : 'Save changes'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={templatesOpen} onClose={() => setTemplatesOpen(false)} fullWidth maxWidth="lg">
        <DialogTitle>Procurement Stage Template Manager</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={1}>
            {templateSuccess ? <Alert severity="success">{templateSuccess}</Alert> : null}
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

      <Dialog open={editBidderOpen} onClose={() => setEditBidderOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Edit bidder</DialogTitle>
        <DialogContent dividers>
          <TextField
            size="small"
            fullWidth
            label="Bidder name"
            value={editBidderName}
            onChange={(e) => setEditBidderName(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditBidderOpen(false)} disabled={savingBidderEdit}>Cancel</Button>
          <Button variant="contained" onClick={saveBidderEdit} disabled={savingBidderEdit || !editBidderName.trim()}>
            {savingBidderEdit ? 'Saving...' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
