import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box, Typography, Button, TextField, Dialog, DialogTitle,
  DialogContent, DialogActions, CircularProgress, IconButton,
  Select, MenuItem, FormControl, InputLabel, FormHelperText, Snackbar, Alert, Stack, useTheme,
  Tooltip, Tabs, Tab, Paper, Divider, Grid, Chip, FormControlLabel, Switch,
} from '@mui/material';
import {
  Add as AddIcon, Edit as EditIcon, Delete as DeleteIcon,
  Refresh as RefreshIcon, PlayArrow as PlayArrowIcon,
} from '@mui/icons-material';
import { DataGrid } from '@mui/x-data-grid'; // Added DataGrid import
import { useAuth } from '../context/AuthContext.jsx';
import apiService from '../api';
import PropTypes from 'prop-types';
import { tokens } from './dashboard/theme'; // Added for consistent styling

/** Wider list panels for role / escalation selects in the workflow dialog */
const WORKFLOW_SELECT_MENU_PROPS = {
  PaperProps: {
    sx: {
      minWidth: 300,
      maxHeight: 420,
    },
  },
  anchorOrigin: { vertical: 'bottom', horizontal: 'left' },
  transformOrigin: { vertical: 'top', horizontal: 'left' },
};

const WORKFLOW_FORM_CONTROL_SELECT_SX = {
  minWidth: { xs: '100%', sm: 220 },
  width: '100%',
};

const WORKFLOW_ENTITY_SUGGESTIONS = [
  'payment_request',
  'project_certificate',
  'annual_workplan',
  'purchase_order',
  'budget_change',
];

const DeleteConfirmDialog = ({ open, onClose, onConfirm, itemToDeleteName, itemType }) => (
  <Dialog open={open} onClose={onClose} aria-labelledby="delete-dialog-title">
    <DialogTitle id="delete-dialog-title">Confirm Deletion</DialogTitle>
    <DialogContent>
      <Typography>Are you sure you want to delete this {itemType} "{itemToDeleteName}"? This action cannot be undone.</Typography>
    </DialogContent>
    <DialogActions>
      <Button onClick={onClose} color="primary" variant="outlined">Cancel</Button>
      <Button onClick={onConfirm} color="error" variant="contained">Delete</Button>
    </DialogActions>
  </Dialog>
);

const ApprovalLevelsManagementPage = () => {
  const { hasPrivilege } = useAuth();
  const theme = useTheme();
  const colors = tokens(theme.palette.mode);

  const [approvalLevels, setApprovalLevels] = useState([]);
  const [roles, setRoles] = useState([]);
  const [paymentStatuses, setPaymentStatuses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
  
  const [mainTabValue, setMainTabValue] = useState(0);

  const [openLevelDialog, setOpenLevelDialog] = useState(false);
  const [currentLevelToEdit, setCurrentLevelToEdit] = useState(null);
  const [levelFormData, setLevelFormData] = useState({
    levelName: '',
    roleId: '',
    approvalOrder: '',
  });
  const [levelFormErrors, setLevelFormErrors] = useState({});

  const [openStatusDialog, setOpenStatusDialog] = useState(false);
  const [currentStatusToEdit, setCurrentStatusToEdit] = useState(null);
  const [statusFormData, setStatusFormData] = useState({
    statusName: '',
    description: '',
  });
  const [statusFormErrors, setStatusFormErrors] = useState({});

  const [openDeleteConfirmDialog, setOpenDeleteConfirmDialog] = useState(false);
  const [itemToDelete, setItemToDelete] = useState(null);

  const [workflowDefs, setWorkflowDefs] = useState([]);
  const [workflowPending, setWorkflowPending] = useState([]);
  const [workflowLoading, setWorkflowLoading] = useState(false);
  const [createWorkflowOpen, setCreateWorkflowOpen] = useState(false);
  const [workflowDraft, setWorkflowDraft] = useState({
    entity_type: 'payment_request',
    code: 'default',
    name: '',
    version: 1,
    active: true,
    link_template: '/projects?focusPaymentRequest={{entity_id}}',
    steps: [
      { step_name: 'First review', role_id: '', sla_hours: '72', escalation_role_id: '' },
      { step_name: 'Second review', role_id: '', sla_hours: '', escalation_role_id: '' },
    ],
  });
  const [workflowFormErrors, setWorkflowFormErrors] = useState({});
  const [editWorkflowDefinitionId, setEditWorkflowDefinitionId] = useState(null);
  const [workflowDefinitionLocked, setWorkflowDefinitionLocked] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (hasPrivilege('approval_levels.read')) {
        const approvalData = await apiService.approval.getApprovalLevels();
        setApprovalLevels(Array.isArray(approvalData) ? approvalData : []);
      } else {
        setError("You do not have permission to view approval levels.");
        setApprovalLevels([]);
      }

      if (hasPrivilege('payment_status_definitions.read')) {
        const statusData = await apiService.approval.getPaymentStatusDefinitions();
        setPaymentStatuses(Array.isArray(statusData) ? statusData : []);
      } else {
        setPaymentStatuses([]);
      }

      const rolesData = await apiService.users.getRoles();
      setRoles(Array.isArray(rolesData) ? rolesData : []);

    } catch (err) {
      console.error('Error fetching data:', err);
      setError(err.message || "Failed to load management data.");
      setSnackbar({ open: true, message: `Failed to load data: ${err.message}`, severity: 'error' });
    } finally {
      setLoading(false);
    }
  }, [hasPrivilege]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const loadWorkflowPanels = useCallback(async () => {
    setWorkflowLoading(true);
    try {
      if (hasPrivilege('approval_levels.read')) {
        const defs = await apiService.approvalWorkflow.listDefinitions();
        setWorkflowDefs(Array.isArray(defs) ? defs : []);
      } else {
        setWorkflowDefs([]);
      }
      try {
        const pending = await apiService.approvalWorkflow.listPendingForMe();
        setWorkflowPending(Array.isArray(pending) ? pending : []);
      } catch {
        setWorkflowPending([]);
      }
    } catch (err) {
      console.error('Workflow UI load:', err);
      setSnackbar({ open: true, message: err.response?.data?.message || err.message || 'Failed to load workflows', severity: 'error' });
    } finally {
      setWorkflowLoading(false);
    }
  }, [hasPrivilege]);

  useEffect(() => {
    if (hasPrivilege('approval_levels.read')) {
      loadWorkflowPanels();
    }
  }, [hasPrivilege, loadWorkflowPanels]);

  const handleSeedAnnualWorkplanWorkflow = async () => {
    if (!hasPrivilege('approval_levels.create')) return;
    setWorkflowLoading(true);
    try {
      const out = await apiService.approvalWorkflow.seedAnnualWorkplan();
      setSnackbar({
        open: true,
        message: out.skipped ? 'Annual work plan workflow already exists.' : 'Annual work plan workflow created.',
        severity: 'success',
      });
      await loadWorkflowPanels();
    } catch (err) {
      setSnackbar({ open: true, message: err.response?.data?.message || err.message, severity: 'error' });
    } finally {
      setWorkflowLoading(false);
    }
  };

  const handleSeedPaymentRequestWorkflow = async () => {
    if (!hasPrivilege('approval_levels.create')) return;
    setWorkflowLoading(true);
    try {
      const out = await apiService.approvalWorkflow.seedPaymentRequest();
      setSnackbar({
        open: true,
        message: out.skipped
          ? 'Payment request workflow already exists.'
          : 'Payment request workflow (generic) created. Use entityType payment_request when starting a request.',
        severity: 'success',
      });
      await loadWorkflowPanels();
    } catch (err) {
      setSnackbar({ open: true, message: err.response?.data?.message || err.message, severity: 'error' });
    } finally {
      setWorkflowLoading(false);
    }
  };

  const resetWorkflowDraft = () => {
    setEditWorkflowDefinitionId(null);
    setWorkflowDefinitionLocked(false);
    setWorkflowDraft({
      entity_type: 'payment_request',
      code: 'default',
      name: '',
      version: 1,
      active: true,
      link_template: '/projects?focusPaymentRequest={{entity_id}}',
      steps: [
        { step_name: 'First review', role_id: '', sla_hours: '72', escalation_role_id: '' },
        { step_name: 'Second review', role_id: '', sla_hours: '', escalation_role_id: '' },
      ],
    });
    setWorkflowFormErrors({});
  };

  const handleOpenCreateWorkflow = () => {
    if (!hasPrivilege('approval_levels.create') && !hasPrivilege('approval_levels.update')) {
      setSnackbar({ open: true, message: 'You need approval_levels.create or approval_levels.update.', severity: 'error' });
      return;
    }
    resetWorkflowDraft();
    setCreateWorkflowOpen(true);
  };

  const handleOpenEditWorkflow = useCallback(
    async (row) => {
      const id = row.definition_id ?? row.definitionId;
      if (id == null) return;
      if (!hasPrivilege('approval_levels.update') && !hasPrivilege('approval_levels.create')) {
        setSnackbar({ open: true, message: 'You need approval_levels.create or approval_levels.update.', severity: 'error' });
        return;
      }
      setWorkflowLoading(true);
      try {
        const def = await apiService.approvalWorkflow.getDefinition(id);
        const stepRows = Array.isArray(def.steps) && def.steps.length ? def.steps : [{ step_name: 'Step 1', role_id: '', sla_hours: '', escalation_role_id: '' }];
        setWorkflowDraft({
          entity_type: def.entity_type || '',
          code: def.code || 'default',
          name: def.name || '',
          version: def.version ?? 1,
          active: def.active !== false && def.active !== 0,
          link_template: def.link_template != null && def.link_template !== '' ? String(def.link_template) : '',
          steps: stepRows.map((s) => ({
            step_name: s.step_name || '',
            role_id: s.role_id != null && s.role_id !== '' ? String(s.role_id) : '',
            sla_hours: s.sla_hours != null && s.sla_hours !== '' ? String(s.sla_hours) : '',
            escalation_role_id:
              s.escalation_role_id != null && s.escalation_role_id !== '' ? String(s.escalation_role_id) : '',
          })),
        });
        setWorkflowDefinitionLocked(Number(def.used_in_requests || 0) > 0);
        setEditWorkflowDefinitionId(id);
        setWorkflowFormErrors({});
        setCreateWorkflowOpen(true);
      } catch (err) {
        setSnackbar({
          open: true,
          message: err.response?.data?.message || err.message || 'Failed to load definition',
          severity: 'error',
        });
      } finally {
        setWorkflowLoading(false);
      }
    },
    [hasPrivilege]
  );

  const handleWorkflowStepField = (index, field, value) => {
    setWorkflowDraft((prev) => {
      const steps = [...prev.steps];
      steps[index] = { ...steps[index], [field]: value };
      return { ...prev, steps };
    });
  };

  const handleAddWorkflowStep = () => {
    setWorkflowDraft((prev) => ({
      ...prev,
      steps: [...prev.steps, { step_name: '', role_id: '', sla_hours: '', escalation_role_id: '' }],
    }));
  };

  const handleRemoveWorkflowStep = (index) => {
    setWorkflowDraft((prev) => ({
      ...prev,
      steps: prev.steps.length <= 1 ? prev.steps : prev.steps.filter((_, i) => i !== index),
    }));
  };

  const handleSubmitWorkflowDefinition = async () => {
    const errs = {};
    if (!workflowDefinitionLocked) {
      if (!workflowDraft.entity_type?.trim()) errs.entity_type = 'Entity type is required (e.g. payment_request, annual_workplan).';
      workflowDraft.steps.forEach((s, i) => {
        if (!s.role_id) errs[`step_${i}`] = 'Each step needs a role.';
      });
    }
    setWorkflowFormErrors(errs);
    if (Object.keys(errs).length) {
      setSnackbar({ open: true, message: 'Fix the highlighted fields.', severity: 'warning' });
      return;
    }
    setWorkflowLoading(true);
    try {
      if (editWorkflowDefinitionId != null) {
        if (workflowDefinitionLocked) {
          await apiService.approvalWorkflow.updateDefinition(editWorkflowDefinitionId, {
            name: workflowDraft.name?.trim() || null,
            active: workflowDraft.active !== false,
            link_template: workflowDraft.link_template?.trim() || null,
          });
          setSnackbar({ open: true, message: 'Definition updated (name, active, open link — in use by requests).', severity: 'success' });
        } else {
          const steps = workflowDraft.steps.map((s, idx) => ({
            step_order: idx + 1,
            step_name: s.step_name?.trim() || `Step ${idx + 1}`,
            role_id: Number(s.role_id),
            sla_hours: s.sla_hours === '' || s.sla_hours == null ? null : Number(s.sla_hours),
            escalation_role_id: s.escalation_role_id === '' || s.escalation_role_id == null ? null : Number(s.escalation_role_id),
          }));
          await apiService.approvalWorkflow.updateDefinition(editWorkflowDefinitionId, {
            entity_type: workflowDraft.entity_type.trim(),
            code: (workflowDraft.code || 'default').trim() || 'default',
            version: Number(workflowDraft.version) || 1,
            name: workflowDraft.name?.trim() || null,
            active: workflowDraft.active !== false,
            link_template: workflowDraft.link_template?.trim() || null,
            steps,
          });
          setSnackbar({ open: true, message: 'Workflow definition updated.', severity: 'success' });
        }
        setCreateWorkflowOpen(false);
        resetWorkflowDraft();
        await loadWorkflowPanels();
      } else {
        const steps = workflowDraft.steps.map((s, idx) => ({
          step_order: idx + 1,
          step_name: s.step_name?.trim() || `Step ${idx + 1}`,
          role_id: Number(s.role_id),
          sla_hours: s.sla_hours === '' || s.sla_hours == null ? null : Number(s.sla_hours),
          escalation_role_id: s.escalation_role_id === '' || s.escalation_role_id == null ? null : Number(s.escalation_role_id),
        }));
        await apiService.approvalWorkflow.createDefinition({
          entity_type: workflowDraft.entity_type.trim(),
          code: (workflowDraft.code || 'default').trim() || 'default',
          version: Number(workflowDraft.version) || 1,
          name: workflowDraft.name?.trim() || null,
          active: workflowDraft.active !== false,
          link_template: workflowDraft.link_template?.trim() || null,
          steps,
        });
        setSnackbar({ open: true, message: 'Workflow definition created.', severity: 'success' });
        setCreateWorkflowOpen(false);
        resetWorkflowDraft();
        await loadWorkflowPanels();
      }
    } catch (err) {
      setSnackbar({
        open: true,
        message: err.response?.data?.message || err.message || 'Failed to save definition',
        severity: 'error',
      });
    } finally {
      setWorkflowLoading(false);
    }
  };

  const handleRunSlaProcessor = async () => {
    if (!hasPrivilege('approval_levels.update')) return;
    setWorkflowLoading(true);
    try {
      const out = await apiService.approvalWorkflow.processSla();
      setSnackbar({
        open: true,
        message: `SLA run: ${out.escalated ?? 0} step(s) escalated (${out.processed ?? 0} overdue checked).`,
        severity: 'success',
      });
      await loadWorkflowPanels();
    } catch (err) {
      setSnackbar({ open: true, message: err.response?.data?.message || err.message, severity: 'error' });
    } finally {
      setWorkflowLoading(false);
    }
  };

  const workflowDefColumns = useMemo(
    () => [
      { field: 'definition_id', headerName: 'ID', width: 70 },
      { field: 'entity_type', headerName: 'Entity type', flex: 1, minWidth: 140 },
      { field: 'code', headerName: 'Code', width: 100 },
      { field: 'version', headerName: 'Ver', width: 60 },
      { field: 'name', headerName: 'Name', flex: 1, minWidth: 160 },
      {
        field: 'active',
        headerName: 'Active',
        width: 90,
        renderCell: (params) => (params.row.active === true || params.row.active === 1 ? 'Yes' : 'No'),
      },
      {
        field: '_edit',
        headerName: '',
        width: 52,
        sortable: false,
        filterable: false,
        disableColumnMenu: true,
        renderCell: (params) =>
          hasPrivilege('approval_levels.update') || hasPrivilege('approval_levels.create') ? (
            <Tooltip title="Edit definition">
              <IconButton size="small" onClick={() => handleOpenEditWorkflow(params.row)} aria-label="Edit workflow definition">
                <EditIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          ) : null,
      },
    ],
    [hasPrivilege, handleOpenEditWorkflow]
  );

  const workflowPendingColumns = [
    { field: 'request_id', headerName: 'Request', width: 90 },
    { field: 'entity_type', headerName: 'Entity', flex: 1, minWidth: 120 },
    { field: 'entity_id', headerName: 'Entity ID', width: 100 },
    { field: 'step_order', headerName: 'Step', width: 70 },
    { field: 'step_name', headerName: 'Step name', flex: 1, minWidth: 140 },
    {
      field: 'due_at',
      headerName: 'Due',
      flex: 1,
      minWidth: 160,
      renderCell: (params) => (params.row.due_at ? new Date(params.row.due_at).toLocaleString() : '—'),
    },
  ];

  const handleCloseSnackbar = () => {
    setSnackbar({ ...snackbar, open: false });
  };
  
  const handleMainTabChange = (event, newValue) => {
    setMainTabValue(newValue);
  };

  // --- Approval Level Handlers ---
  const handleOpenCreateLevelDialog = () => {
    if (!hasPrivilege('approval_levels.create')) {
      setSnackbar({ open: true, message: "Permission denied to create approval levels.", severity: 'error' });
      return;
    }
    setCurrentLevelToEdit(null);
    setLevelFormData({ levelName: '', roleId: '', approvalOrder: '' });
    setLevelFormErrors({});
    setOpenLevelDialog(true);
  };

  const handleOpenEditLevelDialog = (level) => {
    if (!hasPrivilege('approval_levels.update')) {
      setSnackbar({ open: true, message: "Permission denied to update approval levels.", severity: 'error' });
      return;
    }
    setCurrentLevelToEdit(level);
    setLevelFormData({
      levelName: level.levelName || '',
      roleId: level.roleId || '',
      approvalOrder: level.approvalOrder || '',
    });
    setLevelFormErrors({});
    setOpenLevelDialog(true);
  };

  const handleCloseLevelDialog = () => {
    setOpenLevelDialog(false);
    setCurrentLevelToEdit(null);
    setLevelFormErrors({});
  };

  const handleLevelFormChange = (e) => {
    const { name, value } = e.target;
    setLevelFormData(prev => ({ ...prev, [name]: value }));
  };

  const validateLevelForm = () => {
    let errors = {};
    if (!levelFormData.levelName) errors.levelName = 'Level name is required.';
    if (!levelFormData.roleId) errors.roleId = 'Role is required.';
    if (!levelFormData.approvalOrder) errors.approvalOrder = 'Approval order is required.';
    setLevelFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleLevelSubmit = async () => {
    if (!validateLevelForm()) {
      setSnackbar({ open: true, message: 'Please correct the form errors.', severity: 'error' });
      return;
    }
    setLoading(true);
    try {
      if (currentLevelToEdit) {
        await apiService.approval.updateApprovalLevel(currentLevelToEdit.levelId, levelFormData);
        setSnackbar({ open: true, message: 'Approval level updated successfully!', severity: 'success' });
      } else {
        await apiService.approval.createApprovalLevel(levelFormData);
        setSnackbar({ open: true, message: 'Approval level created successfully!', severity: 'success' });
      }
      handleCloseLevelDialog();
      fetchData();
    } catch (err) {
      setSnackbar({ open: true, message: err.response?.data?.message || 'Failed to save approval level.', severity: 'error' });
    } finally {
      setLoading(false);
    }
  };

  // --- Payment Status Handlers ---
  const handleOpenCreateStatusDialog = () => {
    if (!hasPrivilege('payment_status_definitions.create')) {
        setSnackbar({ open: true, message: "Permission denied to create statuses.", severity: 'error' });
        return;
    }
    setCurrentStatusToEdit(null);
    setStatusFormData({ statusName: '', description: '' });
    setStatusFormErrors({});
    setOpenStatusDialog(true);
  };
  
  const handleOpenEditStatusDialog = (status) => {
    if (!hasPrivilege('payment_status_definitions.update')) {
        setSnackbar({ open: true, message: "Permission denied to update statuses.", severity: 'error' });
        return;
    }
    setCurrentStatusToEdit(status);
    setStatusFormData({
        statusName: status.statusName || '',
        description: status.description || '',
    });
    setStatusFormErrors({});
    setOpenStatusDialog(true);
  };

  const handleCloseStatusDialog = () => {
    setOpenStatusDialog(false);
    setCurrentStatusToEdit(null);
    setStatusFormErrors({});
  };

  const handleStatusFormChange = (e) => {
    const { name, value } = e.target;
    setStatusFormData(prev => ({ ...prev, [name]: value }));
  };

  const validateStatusForm = () => {
    let errors = {};
    if (!statusFormData.statusName.trim()) errors.statusName = 'Status name is required.';
    setStatusFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleStatusSubmit = async () => {
    if (!validateStatusForm()) {
      setSnackbar({ open: true, message: 'Please correct the form errors.', severity: 'error' });
      return;
    }
    setLoading(true);
    try {
      if (currentStatusToEdit) {
        await apiService.approval.updatePaymentStatusDefinition(currentStatusToEdit.statusId, statusFormData);
        setSnackbar({ open: true, message: 'Payment status updated successfully!', severity: 'success' });
      } else {
        await apiService.approval.createPaymentStatusDefinition(statusFormData);
        setSnackbar({ open: true, message: 'Payment status created successfully!', severity: 'success' });
      }
      handleCloseStatusDialog();
      fetchData();
    } catch (err) {
      setSnackbar({ open: true, message: err.response?.data?.message || 'Failed to save payment status.', severity: 'error' });
    } finally {
      setLoading(false);
    }
  };

  // --- Delete Handlers ---
  const handleOpenDeleteConfirm = (item, type) => {
    if (type === 'level' && !hasPrivilege('approval_levels.delete')) {
      setSnackbar({ open: true, message: "Permission denied to delete approval levels.", severity: 'error' });
      return;
    }
    if (type === 'status' && !hasPrivilege('payment_status_definitions.delete')) {
      setSnackbar({ open: true, message: "Permission denied to delete statuses.", severity: 'error' });
      return;
    }
    setItemToDelete({ id: item.levelId || item.statusId, name: item.levelName || item.statusName, type });
    setOpenDeleteConfirmDialog(true);
  };

  const handleConfirmDelete = async () => {
    if (!itemToDelete) return;
    setLoading(true);
    setOpenDeleteConfirmDialog(false);
    try {
      if (itemToDelete.type === 'level') {
        await apiService.approval.deleteApprovalLevel(itemToDelete.id);
        setSnackbar({ open: true, message: 'Approval level deleted successfully!', severity: 'success' });
        fetchData();
      } else if (itemToDelete.type === 'status') {
        await apiService.approval.deletePaymentStatusDefinition(itemToDelete.id);
        setSnackbar({ open: true, message: 'Payment status deleted successfully!', severity: 'success' });
        fetchData();
      }
    } catch (error) {
      setSnackbar({ open: true, message: error.response?.data?.message || `Failed to delete ${itemToDelete.type}.`, severity: 'error' });
    } finally {
      setLoading(false);
      setItemToDelete(null);
    }
  };

  // DataGrid column definitions for Approval Levels - moved inside component to access roles state
  const levelColumns = React.useMemo(() => [
    { field: 'levelName', headerName: 'Level Name', flex: 1.5, minWidth: 200 },
    {
      field: 'roleId',
      headerName: 'Assigned Role',
      flex: 1,
      minWidth: 150,
      // MUI X Data Grid v6+: valueGetter(value, row, column, apiRef) — not (params) => params.row
      valueGetter: (value, row) => {
        const rowRoleId = row?.roleId;
        if (rowRoleId === null || rowRoleId === undefined) return 'N/A';

        const rowRoleIdNum = Number(rowRoleId);
        const role = roles.find((r) => {
          if (!r || r.roleId === null || r.roleId === undefined) return false;
          const rRoleIdNum = Number(r.roleId);
          return !isNaN(rowRoleIdNum) && !isNaN(rRoleIdNum) && rowRoleIdNum === rRoleIdNum;
        });
        return role ? role.roleName : 'N/A';
      },
    },
    { field: 'approvalOrder', headerName: 'Approval Order', type: 'number', flex: 1, minWidth: 150 },
    {
      field: 'actions',
      headerName: 'Actions',
      type: 'actions',
      flex: 1,
      minWidth: 120,
      sortable: false,
      filterable: false,
      renderCell: (params) => (
        <Stack direction="row" spacing={1}>
          {hasPrivilege('approval_levels.update') && (
            <Tooltip title="Edit Level">
              <IconButton color="primary" onClick={() => handleOpenEditLevelDialog(params.row)}>
                <EditIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          {hasPrivilege('approval_levels.delete') && (
            <Tooltip title="Delete Level">
              <IconButton color="error" onClick={() => handleOpenDeleteConfirm(params.row, 'level')}>
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
        </Stack>
      ),
    },
  ], [roles, hasPrivilege]);
  
  // DataGrid column definitions for Payment Statuses
  const statusColumns = [
    { field: 'statusId', headerName: 'ID', flex: 0.5, minWidth: 50 },
    { field: 'statusName', headerName: 'Status Name', flex: 1.5, minWidth: 200 },
    { field: 'description', headerName: 'Description', flex: 2, minWidth: 250 },
    {
      field: 'actions',
      headerName: 'Actions',
      type: 'actions',
      flex: 1,
      minWidth: 120,
      sortable: false,
      filterable: false,
      renderCell: (params) => (
        <Stack direction="row" spacing={1} justifyContent="flex-end">
          {hasPrivilege('payment_status_definitions.update') && (
            <Tooltip title="Edit Status">
              <IconButton color="primary" onClick={() => handleOpenEditStatusDialog(params.row)}>
                <EditIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          {hasPrivilege('payment_status_definitions.delete') && (
            <Tooltip title="Delete Status">
              <IconButton color="error" onClick={() => handleOpenDeleteConfirm(params.row, 'status')}>
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
        </Stack>
      ),
    },
  ];

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" height="80vh">
        <CircularProgress />
        <Typography sx={{ ml: 2 }}>Loading data...</Typography>
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">{error}</Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" component="h1" sx={{ color: theme.palette.primary.main, fontWeight: 'bold', mb: 1 }}>
        Approvals & workflows
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Configure approval definitions and role-based steps. For implementation guidance, see Help &amp; Support.
      </Typography>

      <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
        <Typography variant="subtitle1" fontWeight={700} gutterBottom>
          Generic approval workflows
        </Typography>
        <Alert severity="info" sx={{ mb: 2 }}>
          <Typography variant="body2" component="div">
            Use this page to manage workflow definitions and step order by role. Detailed integration notes are in Help &amp; Support.
          </Typography>
        </Alert>
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap alignItems="center" sx={{ mb: 2 }}>
          <Button
            size="small"
            variant="outlined"
            startIcon={<RefreshIcon />}
            disabled={workflowLoading || !hasPrivilege('approval_levels.read')}
            onClick={() => loadWorkflowPanels()}
          >
            Refresh
          </Button>
          {(hasPrivilege('approval_levels.create') || hasPrivilege('approval_levels.update')) && (
            <Button
              size="small"
              variant="contained"
              color="primary"
              startIcon={<AddIcon />}
              disabled={workflowLoading}
              onClick={handleOpenCreateWorkflow}
            >
              Add workflow definition
            </Button>
          )}
          {hasPrivilege('approval_levels.update') && (
            <Button
              size="small"
              variant="outlined"
              color="warning"
              startIcon={<PlayArrowIcon />}
              disabled={workflowLoading}
              onClick={handleRunSlaProcessor}
            >
              Run SLA escalation
            </Button>
          )}
        </Stack>

        {!hasPrivilege('approval_levels.read') ? (
          <Alert severity="info">You need approval_levels.read to list workflow definitions.</Alert>
        ) : workflowLoading && workflowDefs.length === 0 ? (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 2 }}>
            <CircularProgress size={22} />
            <Typography variant="body2">Loading…</Typography>
          </Box>
        ) : workflowDefs.length === 0 ? (
          <Alert severity="info">
            No definitions yet. Click <strong>Add workflow definition</strong> to create one.
          </Alert>
        ) : (
          <>
            <Typography variant="subtitle2" fontWeight={700}>
              Definitions
            </Typography>
            <Box sx={{ height: 260, width: '100%', mb: 2 }}>
              <DataGrid
                rows={workflowDefs}
                columns={workflowDefColumns}
                getRowId={(row) => row.definition_id ?? row.definitionId}
                density="compact"
                pageSizeOptions={[5, 10]}
                initialState={{ pagination: { paginationModel: { pageSize: 5 } } }}
              />
            </Box>
          </>
        )}

        <Typography variant="subtitle2" fontWeight={700} sx={{ pt: 1 }}>
          My pending approval steps
        </Typography>
        {workflowPending.length === 0 ? (
          <Alert severity="info">No pending steps for your role.</Alert>
        ) : (
          <Box sx={{ height: 220, width: '100%' }}>
            <DataGrid
              rows={workflowPending}
              columns={workflowPendingColumns}
              getRowId={(row) => `${row.request_id}-${row.instance_id ?? row.step_order}`}
              density="compact"
              pageSizeOptions={[5, 10]}
              initialState={{ pagination: { paginationModel: { pageSize: 5 } } }}
            />
          </Box>
        )}
      </Paper>

      {/* Add/Edit Approval Level Dialog */}
      <Dialog open={openLevelDialog} onClose={handleCloseLevelDialog} fullWidth maxWidth="sm">
        <DialogTitle sx={{ backgroundColor: theme.palette.primary.main, color: 'white' }}>
          {currentLevelToEdit ? 'Edit Approval Level' : 'Add New Approval Level'}
        </DialogTitle>
        <DialogContent dividers sx={{ backgroundColor: theme.palette.background.default }}>
          <TextField
            autoFocus
            margin="dense"
            name="levelName"
            label="Level Name"
            type="text"
            fullWidth
            variant="outlined"
            value={levelFormData.levelName}
            onChange={handleLevelFormChange}
            error={!!levelFormErrors.levelName}
            helperText={levelFormErrors.levelName}
            sx={{ mb: 2 }}
          />
          <FormControl fullWidth margin="dense" variant="outlined" error={!!levelFormErrors.roleId} sx={{ minWidth: 200, mb: 2 }}>
            <InputLabel>Assigned Role</InputLabel>
            <Select
              name="roleId"
              label="Assigned Role"
              value={levelFormData.roleId}
              onChange={handleLevelFormChange}
            >
              {roles.map(role => (
                <MenuItem key={role.roleId} value={role.roleId}>{role.roleName}</MenuItem>
              ))}
            </Select>
            {levelFormErrors.roleId && <Alert severity="error">{levelFormErrors.roleId}</Alert>}
          </FormControl>
          <TextField
            margin="dense"
            name="approvalOrder"
            label="Approval Order"
            type="number"
            fullWidth
            variant="outlined"
            value={levelFormData.approvalOrder}
            onChange={handleLevelFormChange}
            error={!!levelFormErrors.approvalOrder}
            helperText={levelFormErrors.approvalOrder}
            sx={{ mb: 2 }}
          />
        </DialogContent>
        <DialogActions sx={{ padding: '16px 24px', borderTop: `1px solid ${theme.palette.divider}` }}>
          <Button onClick={handleCloseLevelDialog} color="primary" variant="outlined">Cancel</Button>
          <Button onClick={handleLevelSubmit} color="primary" variant="contained">{currentLevelToEdit ? 'Update Level' : 'Create Level'}</Button>
        </DialogActions>
      </Dialog>
      
      {/* Add/Edit Payment Status Dialog */}
      <Dialog open={openStatusDialog} onClose={handleCloseStatusDialog} fullWidth maxWidth="sm">
        <DialogTitle sx={{ backgroundColor: theme.palette.primary.main, color: 'white' }}>
          {currentStatusToEdit ? 'Edit Payment Status' : 'Add New Payment Status'}
        </DialogTitle>
        <DialogContent dividers sx={{ backgroundColor: theme.palette.background.default }}>
          <TextField
            autoFocus
            margin="dense"
            name="statusName"
            label="Status Name"
            type="text"
            fullWidth
            variant="outlined"
            value={statusFormData.statusName}
            onChange={handleStatusFormChange}
            error={!!statusFormErrors.statusName}
            helperText={statusFormErrors.statusName}
            sx={{ mb: 2 }}
          />
          <TextField
            margin="dense"
            name="description"
            label="Description"
            type="text"
            fullWidth
            multiline
            rows={2}
            variant="outlined"
            value={statusFormData.description}
            onChange={handleStatusFormChange}
            sx={{ mb: 2 }}
          />
        </DialogContent>
        <DialogActions sx={{ padding: '16px 24px', borderTop: `1px solid ${theme.palette.divider}` }}>
          <Button onClick={handleCloseStatusDialog} color="primary" variant="outlined">Cancel</Button>
          <Button onClick={handleStatusSubmit} color="primary" variant="contained">{currentStatusToEdit ? 'Update Status' : 'Create Status'}</Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={createWorkflowOpen}
        onClose={() => {
          setCreateWorkflowOpen(false);
          resetWorkflowDraft();
        }}
        fullWidth
        maxWidth="md"
        scroll="paper"
        aria-labelledby="create-workflow-dialog-title"
      >
        <DialogTitle id="create-workflow-dialog-title">
          <Stack spacing={0.5}>
            <Typography component="span" variant="h6" fontWeight={700}>
              {editWorkflowDefinitionId != null ? 'Edit workflow definition' : 'Add workflow definition'}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Definitions are matched by <code>entity_type</code> + <code>code</code> + <code>version</code>. Only one active definition per type is used when starting a request.
            </Typography>
          </Stack>
        </DialogTitle>
        <DialogContent dividers sx={{ pt: 1 }}>
          <Stack spacing={3}>
            {workflowDefinitionLocked && (
              <Alert severity="warning">
                This definition already has approval requests. You can still change <strong>display name</strong>, <strong>active</strong>, and the{' '}
                <strong>open item link</strong> below. To change steps or <code>entity_type</code>, create a <strong>new version</strong> (or code) with &quot;Add workflow definition&quot;.
              </Alert>
            )}
            <Alert severity="info" variant="outlined">
              <Typography variant="body2">
                This form saves workflow definitions and steps used by the approval engine.
              </Typography>
            </Alert>

            <Box>
              <Typography variant="overline" color="text.secondary" sx={{ letterSpacing: 0.5 }}>
                Definition
              </Typography>
              <Grid container spacing={2} sx={{ mt: 0.5 }}>
                <Grid item xs={12}>
                  <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.75 }}>
                    Quick entity types (click or type your own — lowercase, underscores recommended)
                  </Typography>
                  <Stack direction="row" flexWrap="wrap" useFlexGap spacing={0.75} sx={{ mb: 1 }}>
                    {WORKFLOW_ENTITY_SUGGESTIONS.map((t) => (
                      <Chip
                        key={t}
                        size="small"
                        label={t}
                        disabled={workflowDefinitionLocked}
                        onClick={() => setWorkflowDraft((p) => ({ ...p, entity_type: t }))}
                        color={workflowDraft.entity_type === t ? 'primary' : 'default'}
                        variant={workflowDraft.entity_type === t ? 'filled' : 'outlined'}
                      />
                    ))}
                  </Stack>
                  <TextField
                    label="Entity type"
                    fullWidth
                    required
                    disabled={workflowDefinitionLocked}
                    value={workflowDraft.entity_type}
                    onChange={(e) => setWorkflowDraft((p) => ({ ...p, entity_type: e.target.value }))}
                    error={!!workflowFormErrors.entity_type}
                    helperText={
                      workflowFormErrors.entity_type ||
                      'Stable identifier used in API: e.g. payment_request, annual_workplan'
                    }
                    inputProps={{ spellCheck: false, autoCapitalize: 'off' }}
                  />
                </Grid>
                <Grid item xs={12} sm={5}>
                  <TextField
                    label="Code"
                    fullWidth
                    disabled={workflowDefinitionLocked}
                    value={workflowDraft.code}
                    onChange={(e) => setWorkflowDraft((p) => ({ ...p, code: e.target.value }))}
                    helperText="Variant label; most apps use default"
                    inputProps={{ spellCheck: false }}
                  />
                </Grid>
                <Grid item xs={12} sm={3}>
                  <TextField
                    label="Version"
                    type="number"
                    fullWidth
                    disabled={workflowDefinitionLocked}
                    value={workflowDraft.version}
                    onChange={(e) => setWorkflowDraft((p) => ({ ...p, version: e.target.value }))}
                    inputProps={{ min: 1 }}
                    helperText="Integer ≥ 1"
                  />
                </Grid>
                <Grid item xs={12} sm={4} sx={{ display: 'flex', alignItems: 'center' }}>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={workflowDraft.active !== false}
                        onChange={(e) => setWorkflowDraft((p) => ({ ...p, active: e.target.checked }))}
                        color="primary"
                      />
                    }
                    label="Active"
                  />
                  <Typography variant="caption" color="text.secondary" sx={{ ml: 1, maxWidth: 200 }}>
                    Inactive definitions are not picked when starting a request.
                  </Typography>
                </Grid>
                <Grid item xs={12}>
                  <TextField
                    label="Display name"
                    fullWidth
                    value={workflowDraft.name}
                    onChange={(e) => setWorkflowDraft((p) => ({ ...p, name: e.target.value }))}
                    helperText="Shown in admin lists only"
                  />
                </Grid>
                <Grid item xs={12}>
                  <TextField
                    label="Open item link (optional)"
                    fullWidth
                    multiline
                    minRows={2}
                    value={workflowDraft.link_template}
                    onChange={(e) => setWorkflowDraft((p) => ({ ...p, link_template: e.target.value }))}
                    placeholder="/finance/payment-certificates?pendingMe=1&focusCertificate={{entity_id}}"
                    helperText={
                      'In-app path (leading / is optional — it will be added if missing). Placeholders: {{entity_id}}, {{request_id}} (URL-encoded). ' +
                      'Dashboard “My workflow approvals” uses this for each pending row. For certificates include pendingMe=1 so finance shows only items waiting for this user’s role; example: /finance/payment-certificates?pendingMe=1&focusCertificate={{entity_id}}. Leave blank for built-in defaults by entity type.'
                    }
                    inputProps={{ spellCheck: false }}
                  />
                </Grid>
              </Grid>
            </Box>

            <Box sx={{ opacity: workflowDefinitionLocked ? 0.55 : 1, pointerEvents: workflowDefinitionLocked ? 'none' : 'auto' }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" useFlexGap spacing={1}>
                <Box>
                  <Typography variant="overline" color="text.secondary" sx={{ letterSpacing: 0.5 }}>
                    Steps
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    First row is step 1 (runs first). Each step needs a role that can approve in &quot;My pending steps&quot;.
                  </Typography>
                </Box>
                <Button size="small" variant="outlined" startIcon={<AddIcon />} onClick={handleAddWorkflowStep} disabled={workflowDefinitionLocked}>
                  Add step
                </Button>
              </Stack>
              <Stack spacing={1.5} sx={{ mt: 1.5 }}>
                {workflowDraft.steps.map((step, index) => (
                  <Paper
                    key={index}
                    variant="outlined"
                    sx={{
                      p: 2,
                      borderLeft: 4,
                      borderLeftColor: 'primary.main',
                      bgcolor: 'action.hover',
                    }}
                  >
                    <Typography variant="caption" fontWeight={700} color="primary" sx={{ display: 'block', mb: 1 }}>
                      Step {index + 1}
                    </Typography>
                    <Grid container spacing={2} alignItems="flex-start">
                      <Grid item xs={12} md={4}>
                        <TextField
                          label="Step name"
                          fullWidth
                          size="small"
                          disabled={workflowDefinitionLocked}
                          value={step.step_name}
                          onChange={(e) => handleWorkflowStepField(index, 'step_name', e.target.value)}
                          helperText="Label for approvers"
                        />
                      </Grid>
                      <Grid item xs={12} sm={6} md={3}>
                        <FormControl
                          fullWidth
                          size="small"
                          error={!!workflowFormErrors[`step_${index}`]}
                          sx={WORKFLOW_FORM_CONTROL_SELECT_SX}
                        >
                          <InputLabel id={`wf-role-label-${index}`}>Approver role</InputLabel>
                          <Select
                            labelId={`wf-role-label-${index}`}
                            label="Approver role"
                            disabled={workflowDefinitionLocked}
                            value={step.role_id}
                            onChange={(e) => handleWorkflowStepField(index, 'role_id', e.target.value)}
                            MenuProps={WORKFLOW_SELECT_MENU_PROPS}
                          >
                            <MenuItem value="">
                              <em>Select role…</em>
                            </MenuItem>
                            {roles.map((role) => (
                              <MenuItem key={role.roleId} value={role.roleId} sx={{ minHeight: 40 }}>
                                {role.roleName || role.name}
                              </MenuItem>
                            ))}
                          </Select>
                          {workflowFormErrors[`step_${index}`] ? (
                            <FormHelperText>{workflowFormErrors[`step_${index}`]}</FormHelperText>
                          ) : (
                            <FormHelperText>Required</FormHelperText>
                          )}
                        </FormControl>
                      </Grid>
                      <Grid item xs={12} sm={6} md={2}>
                        <TextField
                          label="SLA (hours)"
                          type="number"
                          fullWidth
                          size="small"
                          disabled={workflowDefinitionLocked}
                          value={step.sla_hours}
                          onChange={(e) => handleWorkflowStepField(index, 'sla_hours', e.target.value)}
                          helperText="Optional; due date for this step"
                          inputProps={{ min: 0 }}
                        />
                      </Grid>
                      <Grid item xs={12} sm={6} md={2}>
                        <FormControl fullWidth size="small" sx={WORKFLOW_FORM_CONTROL_SELECT_SX}>
                          <InputLabel id={`wf-esc-label-${index}`}>Escalate to</InputLabel>
                          <Select
                            labelId={`wf-esc-label-${index}`}
                            label="Escalate to"
                            disabled={workflowDefinitionLocked}
                            value={step.escalation_role_id}
                            onChange={(e) => handleWorkflowStepField(index, 'escalation_role_id', e.target.value)}
                            MenuProps={WORKFLOW_SELECT_MENU_PROPS}
                          >
                            <MenuItem value="">
                              <em>None</em>
                            </MenuItem>
                            {roles.map((role) => (
                              <MenuItem key={`esc-${role.roleId}-${index}`} value={role.roleId} sx={{ minHeight: 40 }}>
                                {role.roleName || role.name}
                              </MenuItem>
                            ))}
                          </Select>
                          <FormHelperText>If SLA missed, reassign pending step</FormHelperText>
                        </FormControl>
                      </Grid>
                      <Grid item xs={12} sm={6} md={1} sx={{ display: 'flex', alignItems: 'center', justifyContent: { xs: 'flex-start', md: 'center' } }}>
                        <Tooltip title={workflowDraft.steps.length <= 1 ? 'At least one step' : 'Remove step'}>
                          <span>
                            <IconButton
                              aria-label="remove step"
                              disabled={workflowDefinitionLocked || workflowDraft.steps.length <= 1}
                              onClick={() => handleRemoveWorkflowStep(index)}
                              color="error"
                              size="small"
                            >
                              <DeleteIcon />
                            </IconButton>
                          </span>
                        </Tooltip>
                      </Grid>
                    </Grid>
                  </Paper>
                ))}
              </Stack>
            </Box>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2, borderTop: 1, borderColor: 'divider' }}>
          <Button
            onClick={() => {
              setCreateWorkflowOpen(false);
              resetWorkflowDraft();
            }}
            color="inherit"
          >
            Cancel
          </Button>
          <Button onClick={handleSubmitWorkflowDefinition} variant="contained" disabled={workflowLoading} size="large">
            {editWorkflowDefinitionId != null ? 'Save changes' : 'Create definition'}
          </Button>
        </DialogActions>
      </Dialog>

      <DeleteConfirmDialog
        open={openDeleteConfirmDialog}
        onClose={() => setOpenDeleteConfirmDialog(false)}
        onConfirm={handleConfirmDelete}
        itemToDeleteName={itemToDelete?.name || ''}
        itemType={itemToDelete?.type || ''}
      />

      <Snackbar open={snackbar.open} autoHideDuration={6000} onClose={handleCloseSnackbar}>
        <Alert onClose={handleCloseSnackbar} severity={snackbar.severity} sx={{ width: '100%' }}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

ApprovalLevelsManagementPage.propTypes = {
    // No props for this page component
};

export default ApprovalLevelsManagementPage;