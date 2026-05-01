import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, CircularProgress, Alert, Button,
  Grid, Snackbar, Chip, Dialog, DialogTitle, DialogContent, DialogActions, Paper,
  IconButton,
  Accordion, AccordionSummary, AccordionDetails,
  Stack, Tooltip, useTheme, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
} from '@mui/material';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowBack as ArrowBackIcon, FileDownload as FileDownloadIcon,
  Edit as EditIcon, Delete as DeleteIcon, Add as AddIcon,
  ExpandMore as ExpandMoreIcon, Visibility as ViewIcon,
  TableChart as TableChartIcon,
} from '@mui/icons-material';
import apiService from '../api';

// Hooks
import { useAuth } from '../context/AuthContext.jsx';
import useStrategicPlanDetails from '../hooks/useStrategicPlanDetails';
import useFormManagement from '../hooks/useFormManagement';
import useCrudOperations from '../hooks/useCrudOperations';

// Components
import StrategicPlanForm from '../components/strategicPlan/StrategicPlanForm';
import ProgramForm from '../components/strategicPlan/ProgramForm';
import SubprogramForm from "../components/strategicPlan/SubprogramForm";
import AnnualWorkPlanForm from '../components/strategicPlan/AnnualWorkPlanForm';
import ApprovalWorkflowPanel from '../components/approval/ApprovalWorkflowPanel';

// Helpers
import {
  formatCurrency,
  checkUserPrivilege,
} from '../utils/helpers';
import { downloadStrategicPlanExcel } from '../utils/exportStrategicPlanExcel';
// Labels
import strategicPlanningLabels from '../configs/strategicPlanningLabels';


function StrategicPlanDetailsPage() {
  const { planId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const theme = useTheme();

  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
  const [expandedProgram, setExpandedProgram] = useState(false);
  const [parentEntityId, setParentEntityId] = useState(null);
  const [isViewMode, setIsViewMode] = useState(false);
  const [openWorkplansDialog, setOpenWorkplansDialog] = useState(false);
  const [selectedSubprogram, setSelectedSubprogram] = useState(null);
  const [workplanApprovalSelected, setWorkplanApprovalSelected] = useState(null);
  const [pendingAccordionOpen, setPendingAccordionOpen] = useState(false);
  const [myPendingSteps, setMyPendingSteps] = useState([]);
  const [myPendingLoading, setMyPendingLoading] = useState(false);

  const {
    strategicPlan, programs, subprograms, annualWorkPlans,
    loading: dataLoading, error, fetchStrategicPlanData
  } = useStrategicPlanDetails(planId);

  const {
    openDialog, dialogType, currentRecord, formData,
    handleOpenCreateDialog, handleOpenEditDialog, handleCloseDialog, setFormData
  } = useFormManagement();

  const {
    loading: crudLoading, handleSubmit, handleDelete, handleDownloadPdf
  } = useCrudOperations('strategy', fetchStrategicPlanData, setSnackbar);

  const loading = dataLoading || crudLoading;
  const canManagePrograms =
    checkUserPrivilege(user, 'program.create') ||
    checkUserPrivilege(user, 'program.update') ||
    checkUserPrivilege(user, 'strategic_plan.create') ||
    checkUserPrivilege(user, 'strategic_plan.update');
  const canManageSubprograms =
    checkUserPrivilege(user, 'subprogram.create') ||
    checkUserPrivilege(user, 'subprogram.update') ||
    checkUserPrivilege(user, 'program.create') ||
    checkUserPrivilege(user, 'program.update') ||
    checkUserPrivilege(user, 'strategic_plan.create') ||
    checkUserPrivilege(user, 'strategic_plan.update');
  const canManageWorkplans =
    checkUserPrivilege(user, 'workplan.create') ||
    checkUserPrivilege(user, 'workplan.update') ||
    checkUserPrivilege(user, 'subprogram.create') ||
    checkUserPrivilege(user, 'subprogram.update') ||
    checkUserPrivilege(user, 'program.create') ||
    checkUserPrivilege(user, 'program.update') ||
    checkUserPrivilege(user, 'strategic_plan.create') ||
    checkUserPrivilege(user, 'strategic_plan.update');

  const handleFormChange = useCallback((e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
        ...prev,
        [name]: type === 'checkbox' ? checked : value,
    }));
  }, [setFormData]);

  const handleCloseSnackbar = (event, reason) => {
    if (reason === 'clickaway') return;
    setSnackbar({ ...snackbar, open: false });
  };

  const handleProgramAccordionChange = (programId) => (event, isExpanded) => {
    setExpandedProgram(isExpanded ? programId : false);
  };

  const handleViewSubprogram = (subprogramRow) => {
    if (subprogramRow?.programId) {
      setExpandedProgram(subprogramRow.programId);
    }
    setParentEntityId(subprogramRow?.programId || null);
    setIsViewMode(true);
    handleOpenEditDialog('subprogram', subprogramRow);
  };

  const handleOpenCreateProgramDialog = (parentId) => {
      setIsViewMode(false);
      setParentEntityId(parentId);
      handleOpenCreateDialog('program');
  };

  const handleOpenCreateSubprogramDialog = (programId) => {
      setIsViewMode(false);
      setParentEntityId(programId);
      handleOpenCreateDialog('subprogram');
  };

  const handleOpenEditSubprogramDialog = (subprogram) => {
    setIsViewMode(false);
    setParentEntityId(subprogram.programId);
    handleOpenEditDialog('subprogram', subprogram);
  };

  const handleOpenCreateWorkplanDialog = (subProgramId) => {
    setIsViewMode(false);
    setParentEntityId(subProgramId);
    handleOpenCreateDialog('workplan', subProgramId);
  };

  const handleOpenSubprogramWorkplansDialog = (subprogram) => {
    setSelectedSubprogram(subprogram);
    setOpenWorkplansDialog(true);
  };

  const handleCloseSubprogramWorkplansDialog = () => {
    setOpenWorkplansDialog(false);
    setSelectedSubprogram(null);
  };

  const handleCloseDialogWithReset = () => {
      setParentEntityId(null);
      setIsViewMode(false);
      handleCloseDialog();
  };

  const loadMyPendingApprovals = useCallback(async () => {
    setMyPendingLoading(true);
    try {
      const rows = await apiService.approvalWorkflow.listPendingForMe();
      const list = Array.isArray(rows) ? rows : [];
      setMyPendingSteps(list.filter((r) => r.entity_type === 'annual_workplan'));
    } catch {
      setMyPendingSteps([]);
    } finally {
      setMyPendingLoading(false);
    }
  }, []);

  useEffect(() => {
    if (pendingAccordionOpen) {
      loadMyPendingApprovals();
    }
  }, [pendingAccordionOpen, loadMyPendingApprovals]);

  const handleExportExcel = () => {
    try {
      downloadStrategicPlanExcel({ strategicPlan, programs, subprograms });
    } catch (err) {
      console.error('Excel export failed:', err);
      setSnackbar({
        open: true,
        message: err?.message || 'Could not export to Excel.',
        severity: 'error',
      });
    }
  };

  const renderDialogForm = () => {
    const commonFormProps = { formData, handleFormChange, setFormData };
    switch (dialogType) {
      case 'strategicPlan': return <StrategicPlanForm {...commonFormProps} />;
      case 'program': return <ProgramForm {...commonFormProps} />;
      case 'subprogram': return <SubprogramForm {...commonFormProps} readOnly={isViewMode} />;
      case 'workplan': return <AnnualWorkPlanForm {...commonFormProps} />;
      default: return <Typography>No form available for this type.</Typography>;
    }
  };

  if (loading && !strategicPlan) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" height="80vh">
        <CircularProgress />
        <Typography sx={{ ml: 2 }}>Loading strategic plan data...</Typography>
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">{error}</Alert>
        <Button variant="contained" startIcon={<ArrowBackIcon />} onClick={() => navigate('/strategic-planning')} sx={{ mt: 2 }}>
          Back to Strategic Plans
        </Button>
      </Box>
    );
  }

  if (!strategicPlan) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="warning">Strategic Plan not found.</Alert>
        <Button variant="contained" startIcon={<ArrowBackIcon />} onClick={() => navigate('/strategic-planning')} sx={{ mt: 2 }}>
          Back to Strategic Plans
        </Button>
      </Box>
    );
  }

  const getDialogLabel = (type) => {
    const labelMapping = {
      strategicPlan: strategicPlanningLabels.strategicPlan,
      program: strategicPlanningLabels.program,
      subprogram: strategicPlanningLabels.subprogram,
      workplan: { singular: 'Work Plan', plural: 'Work Plans' },
      activity: { singular: 'Activity', plural: 'Activities' },
      attachment: strategicPlanningLabels.attachments,
    };
    return labelMapping[type] || { singular: 'Record' };
  };

  return (
    <Box sx={{ p: 2 }}>
      <Box display="flex" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}>
        <Box>
          {checkUserPrivilege(user, 'strategic_plan.update') && (
            <Button
              size="small"
              variant="outlined"
              startIcon={<EditIcon />}
              onClick={() => handleOpenEditDialog('strategicPlan', strategicPlan)}
            >
              Edit plan
            </Button>
          )}
        </Box>
        <Stack direction="row" spacing={1}>
          <Button
            variant="outlined"
            color="primary"
            startIcon={<TableChartIcon />}
            onClick={handleExportExcel}
          >
            Export to Excel
          </Button>
          {checkUserPrivilege(user, 'strategic_plan_pdf.download') && (
            <Button variant="contained" startIcon={<FileDownloadIcon />} onClick={() => handleDownloadPdf('strategic_plan_pdf', strategicPlan.planName, strategicPlan.planId)}>
              Download Plan PDF
            </Button>
          )}
        </Stack>
      </Box>
      <Paper elevation={0} sx={{ px: 1.75, py: 1, mb: 2, borderRadius: 2, border: '1px solid', borderColor: 'primary.main', bgcolor: 'primary.main' }}>
        <Typography variant="h6" sx={{ fontWeight: 800, color: 'primary.contrastText', lineHeight: 1.2 }}>
          {strategicPlan.cidpName || strategicPlan.cidpid || 'N/A'}
        </Typography>
      </Paper>

      {(strategicPlan.vision || strategicPlan.mission) && (
        <Paper variant="outlined" sx={{ p: 2, mb: 2, borderRadius: 2 }}>
          {strategicPlan.vision ? (
            <Box sx={{ mb: strategicPlan.mission ? 2 : 0 }}>
              <Typography variant="subtitle2" color="primary" sx={{ fontWeight: 700, mb: 0.5 }}>
                {strategicPlanningLabels.strategicPlan.fields.vision}
              </Typography>
              <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                {strategicPlan.vision}
              </Typography>
            </Box>
          ) : null}
          {strategicPlan.mission ? (
            <Box>
              <Typography variant="subtitle2" color="primary" sx={{ fontWeight: 700, mb: 0.5 }}>
                {strategicPlanningLabels.strategicPlan.fields.mission}
              </Typography>
              <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                {strategicPlan.mission}
              </Typography>
            </Box>
          ) : null}
        </Paper>
      )}

      <Box display="flex" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
        <Typography variant="h6" sx={{ fontWeight: 700 }}>
          Programs and Sub-programs
        </Typography>
        <Stack direction="row" spacing={1} alignItems="center">
          <Chip
            label={`Selected Plan: ${strategicPlan.cidpName || strategicPlan.cidpid || 'N/A'}`}
            color="primary"
            variant="outlined"
          />
          {canManagePrograms && (
            <Button size="small" startIcon={<AddIcon />} variant="contained" onClick={() => handleOpenCreateProgramDialog(strategicPlan.cidpid)}>
              Add Program
            </Button>
          )}
        </Stack>
      </Box>

        {programs.length > 0 ? (
          <Box>
            {programs.map(program => (
              <Accordion
                key={program.programId}
                expanded={expandedProgram === program.programId}
                onChange={handleProgramAccordionChange(program.programId)}
                sx={{
                  my: 1,
                  boxShadow: 2,
                  borderRadius: 1,
                  '&:before': { display: 'none' },
                  '&:hover': {
                    boxShadow: theme.shadows[6],
                  },
                }}
              >
                <AccordionSummary
                  expandIcon={<ExpandMoreIcon sx={{ transition: 'transform 0.3s' }} />}
                  aria-controls={`panel-${program.programId}-content`}
                  id={`panel-${program.programId}-header`}
                  sx={{
                    bgcolor: theme.palette.action.hover, 
                    border: '1px solid',
                    borderColor: 'divider',
                    borderRadius: 1,
                    '&.Mui-expanded': { borderBottomLeftRadius: 0, borderBottomRightRadius: 0 },
                    '& .MuiAccordionSummary-expandIconWrapper.Mui-expanded': {
                      transform: 'rotate(180deg)',
                    },
                  }}
                >
                  <Box display="flex" alignItems="center" justifyContent="space-between" width="100%" pr={2}>
                    <Box flex={1} minWidth={0} mr={1}>
                      <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>
                        {program.programme || 'Unnamed Program'}
                      </Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
                        {program.description || 'No description'}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Expand row to view or manage sub-programs
                      </Typography>
                    </Box>
                    <Stack direction="row" spacing={1} onClick={(e) => e.stopPropagation()}>
                      {canManagePrograms && (
                        <Tooltip title="Edit Program">
                          <IconButton size="small" color="primary" onClick={() => handleOpenEditDialog('program', program)}>
                            <EditIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                      {canManagePrograms && (
                        <Tooltip title="Delete Program">
                          <IconButton size="small" color="error" onClick={() => handleDelete('program', program.programId)}>
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                      {canManageSubprograms && (
                        <Button
                          size="small"
                          startIcon={<AddIcon />}
                          onClick={() => handleOpenCreateSubprogramDialog(program.programId)}
                        >
                          Add sub-program
                        </Button>
                      )}
                    </Stack>
                  </Box>
                </AccordionSummary>
                <AccordionDetails sx={{ pt: 2 }}>
                  <TableContainer component={Paper} variant="outlined">
                    <Table size="small">
                      <TableHead sx={{ '& .MuiTableCell-root': { backgroundColor: theme.palette.primary.main, color: theme.palette.primary.contrastText, fontWeight: 'bold', borderBottom: 'none' } }}>
                        <TableRow>
                          <TableCell>{strategicPlanningLabels.subprogram.fields.subProgramme}</TableCell>
                          <TableCell>{strategicPlanningLabels.subprogram.fields.kpi}</TableCell>
                            <TableCell>{strategicPlanningLabels.subprogram.fields.unitOfMeasure}</TableCell>
                            <TableCell>{strategicPlanningLabels.subprogram.fields.baseline}</TableCell>
                          <TableCell>{strategicPlanningLabels.subprogram.fields.totalBudget}</TableCell>
                          <TableCell align="right">Actions</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {subprograms.filter(sub => sub.programId === program.programId).length > 0 ? (
                          subprograms
                            .filter(sub => sub.programId === program.programId)
                            .map((subprogram) => (
                              <TableRow key={subprogram.subProgramId}>
                                <TableCell>{subprogram.subProgramme || '—'}</TableCell>
                                <TableCell>{subprogram.kpi || '—'}</TableCell>
                                <TableCell>{subprogram.unitOfMeasure || '—'}</TableCell>
                                <TableCell>{subprogram.baseline || '—'}</TableCell>
                                <TableCell>{formatCurrency(subprogram.totalBudget) || '—'}</TableCell>
                                <TableCell align="right">
                                  <Stack direction="row" spacing={1} justifyContent="flex-end">
                                    {canManageWorkplans && (
                                      <Tooltip title="Add Annual Work Plan">
                                        <IconButton
                                          size="small"
                                          color="secondary"
                                          onClick={() => handleOpenCreateWorkplanDialog(subprogram.subProgramId)}
                                        >
                                          <AddIcon fontSize="small" />
                                        </IconButton>
                                      </Tooltip>
                                    )}
                                    <Tooltip title="View Annual Work Plans">
                                      <IconButton
                                        size="small"
                                        color="inherit"
                                        onClick={() => handleOpenSubprogramWorkplansDialog(subprogram)}
                                      >
                                        <ViewIcon fontSize="small" />
                                      </IconButton>
                                    </Tooltip>
                                    <Tooltip title="View">
                                      <IconButton size="small" color="info" onClick={() => handleViewSubprogram(subprogram)}>
                                        <ViewIcon fontSize="small" />
                                      </IconButton>
                                    </Tooltip>
                                    {canManageSubprograms && (
                                      <Tooltip title="Edit">
                                        <IconButton size="small" color="primary" onClick={() => handleOpenEditSubprogramDialog(subprogram)}>
                                          <EditIcon fontSize="small" />
                                        </IconButton>
                                      </Tooltip>
                                    )}
                                    {checkUserPrivilege(user, 'subprogram.delete') && (
                                      <Tooltip title="Delete">
                                        <IconButton size="small" color="error" onClick={() => handleDelete('subprogram', subprogram.subProgramId)}>
                                          <DeleteIcon fontSize="small" />
                                        </IconButton>
                                      </Tooltip>
                                    )}
                                    <Tooltip title="Annual Work Plans linked to this sub-program">
                                      <Chip
                                        size="small"
                                        variant="outlined"
                                        label={`AWP: ${annualWorkPlans.filter(wp => wp.subProgramId === subprogram.subProgramId).length}`}
                                      />
                                    </Tooltip>
                                  </Stack>
                                </TableCell>
                              </TableRow>
                            ))
                        ) : (
                          <TableRow>
                            <TableCell colSpan={6}>
                              <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                                No sub-programs available for this program.
                              </Typography>
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </TableContainer>
                  {checkUserPrivilege(user, 'program_pdf.download') && (
                    <Box mt={1} display="flex" justifyContent="flex-end">
                      <Button
                        size="small"
                        startIcon={<FileDownloadIcon />}
                        onClick={() => handleDownloadPdf('program_pdf', program.programme, program.programId)}
                      >
                        Download Program PDF
                      </Button>
                    </Box>
                  )}
                </AccordionDetails>
              </Accordion>
            ))}
          </Box>
        ) : (
          <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
            No programs available for this plan.
          </Typography>
        )}

      {/* Shared Dialog for all Forms */}
      <Dialog open={openDialog} onClose={handleCloseDialogWithReset} fullWidth maxWidth="md">
        <DialogTitle>
          {isViewMode
            ? `View ${getDialogLabel(dialogType).singular}`
            : (currentRecord ? `Edit ${getDialogLabel(dialogType).singular}` : `Add ${getDialogLabel(dialogType).singular}`)}
        </DialogTitle>
        <DialogContent dividers>
          {renderDialogForm()}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialogWithReset} disabled={loading}>Cancel</Button>
          {!isViewMode && (
            <Button onClick={() => handleSubmit(dialogType, currentRecord, formData, handleCloseDialogWithReset, parentEntityId)} variant="contained" disabled={loading}>
              {loading ? <CircularProgress size={24} /> : (currentRecord ? 'Update' : 'Create')}
            </Button>
          )}
        </DialogActions>
      </Dialog>

      {/* Sub-program Annual Work Plans Dialog */}
      <Dialog open={openWorkplansDialog} onClose={handleCloseSubprogramWorkplansDialog} fullWidth maxWidth="lg">
        <DialogTitle>
          Annual Work Plans - {selectedSubprogram?.subProgramme || 'Sub-Program'}
        </DialogTitle>
        <DialogContent dividers>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
            Click a work plan row to show the approval workflow panel below.
          </Typography>
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead sx={{ '& .MuiTableCell-root': { backgroundColor: theme.palette.primary.main, color: theme.palette.primary.contrastText, fontWeight: 'bold', borderBottom: 'none' } }}>
                <TableRow>
                  <TableCell>Work Plan Name</TableCell>
                  <TableCell>Financial Year</TableCell>
                  <TableCell>Approval Status</TableCell>
                  <TableCell>Total Budget</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(annualWorkPlans.filter(wp => wp.subProgramId === selectedSubprogram?.subProgramId)).length > 0 ? (
                  annualWorkPlans
                    .filter(wp => wp.subProgramId === selectedSubprogram?.subProgramId)
                    .map((workplan) => (
                      <TableRow
                        key={workplan.workplanId}
                        hover
                        selected={workplanApprovalSelected?.workplanId === workplan.workplanId}
                        onClick={() => setWorkplanApprovalSelected(workplan)}
                        sx={{ cursor: 'pointer' }}
                      >
                        <TableCell>{workplan.workplanName || '—'}</TableCell>
                        <TableCell>{workplan.financialYear || '—'}</TableCell>
                        <TableCell>{workplan.approvalStatus || '—'}</TableCell>
                        <TableCell>{formatCurrency(workplan.totalBudget) || '—'}</TableCell>
                        <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                          <Stack direction="row" spacing={1} justifyContent="flex-end">
                            {canManageWorkplans && (
                              <Tooltip title="Edit Work Plan">
                                <IconButton size="small" color="primary" onClick={() => handleOpenEditDialog('workplan', workplan)}>
                                  <EditIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            )}
                            {checkUserPrivilege(user, 'workplan.delete') && (
                              <Tooltip title="Delete Work Plan">
                                <IconButton size="small" color="error" onClick={() => handleDelete('workplan', workplan.workplanId)}>
                                  <DeleteIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            )}
                          </Stack>
                        </TableCell>
                      </TableRow>
                    ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={5}>
                      <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                        No annual work plans available for this sub-program.
                      </Typography>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
          {workplanApprovalSelected && (
            <ApprovalWorkflowPanel
              entityType="annual_workplan"
              entityId={workplanApprovalSelected.workplanId}
              user={user}
              onChanged={fetchStrategicPlanData}
              compact
            />
          )}
        </DialogContent>
        <DialogActions>
          {canManageWorkplans && selectedSubprogram?.subProgramId && (
            <Button
              startIcon={<AddIcon />}
              variant="contained"
              onClick={() => {
                handleCloseSubprogramWorkplansDialog();
                handleOpenCreateWorkplanDialog(selectedSubprogram.subProgramId);
              }}
            >
              Add Work Plan
            </Button>
          )}
          <Button onClick={handleCloseSubprogramWorkplansDialog}>Close</Button>
        </DialogActions>
      </Dialog>

      <Accordion
        expanded={pendingAccordionOpen}
        onChange={(_, exp) => setPendingAccordionOpen(exp)}
        sx={{ mt: 2, '&:before': { display: 'none' }, boxShadow: 1 }}
      >
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography variant="subtitle1" fontWeight={700}>
            My pending annual work plan approvals
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
            (expand to load)
          </Typography>
        </AccordionSummary>
        <AccordionDetails>
          {myPendingLoading ? (
            <CircularProgress size={22} />
          ) : myPendingSteps.length === 0 ? (
            <Typography variant="body2" color="text.secondary">No pending work plan steps for your role.</Typography>
          ) : (
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Request</TableCell>
                    <TableCell>Work plan ID</TableCell>
                    <TableCell>Step</TableCell>
                    <TableCell>Due</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {myPendingSteps.map((row) => (
                    <TableRow key={`${row.request_id}-${row.instance_id ?? row.step_order}`} hover>
                      <TableCell>{row.request_id}</TableCell>
                      <TableCell>{row.entity_id}</TableCell>
                      <TableCell>{row.step_name || row.step_order}</TableCell>
                      <TableCell>{row.due_at ? new Date(row.due_at).toLocaleString() : '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
          <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1 }}>
            Open the sub-program work plans dialog and select the work plan row to approve or reject.
          </Typography>
        </AccordionDetails>
      </Accordion>

      <Snackbar open={snackbar.open} autoHideDuration={6000} onClose={handleCloseSnackbar}>
        <Alert onClose={handleCloseSnackbar} severity={snackbar.severity} sx={{ width: '100%' }}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}

export default StrategicPlanDetailsPage;