import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, CircularProgress, Alert, Button,
  Grid, Snackbar, Chip, Dialog, DialogTitle, DialogContent, DialogActions, Paper,
  IconButton,
  Accordion, AccordionSummary, AccordionDetails,
  Stack, Tooltip, useTheme, Table, TableBody, TableCell, TableContainer, TableHead, TableRow
} from '@mui/material';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowBack as ArrowBackIcon, FileDownload as FileDownloadIcon,
  Edit as EditIcon, Delete as DeleteIcon, Add as AddIcon,
  ExpandMore as ExpandMoreIcon, Visibility as ViewIcon
} from '@mui/icons-material';

// Hooks
import { useAuth } from '../context/AuthContext.jsx';
import useStrategicPlanDetails from '../hooks/useStrategicPlanDetails';
import useFormManagement from '../hooks/useFormManagement';
import useCrudOperations from '../hooks/useCrudOperations';

// Components
import StrategicPlanForm from '../components/strategicPlan/StrategicPlanForm';
import ProgramForm from '../components/strategicPlan/ProgramForm';
import SubprogramForm from "../components/strategicPlan/SubprogramForm";

// Helpers
import {
  formatCurrency,
  checkUserPrivilege,
} from '../utils/helpers';
// Labels
import strategicPlanningLabels from '../configs/strategicPlanningLabels';
import { tokens } from './dashboard/theme';


function StrategicPlanDetailsPage() {
  const { planId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const theme = useTheme();
  const colors = tokens(theme.palette.mode);

  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
  const [expandedProgram, setExpandedProgram] = useState(false);
  const [parentEntityId, setParentEntityId] = useState(null);
  const [isViewMode, setIsViewMode] = useState(false);

  const {
    strategicPlan, programs, subprograms,
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

  const handleCloseDialogWithReset = () => {
      setParentEntityId(null);
      setIsViewMode(false);
      handleCloseDialog();
  };

  const renderDialogForm = () => {
    const commonFormProps = { formData, handleFormChange, setFormData };
    switch (dialogType) {
      case 'strategicPlan': return <StrategicPlanForm {...commonFormProps} />;
      case 'program': return <ProgramForm {...commonFormProps} />;
      case 'subprogram': return <SubprogramForm {...commonFormProps} readOnly={isViewMode} />;
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
        <Box />
        {checkUserPrivilege(user, 'strategic_plan_pdf.download') && (
          <Button variant="contained" startIcon={<FileDownloadIcon />} onClick={() => handleDownloadPdf('strategic_plan_pdf', strategicPlan.planName, strategicPlan.planId)}>
            Download Plan PDF
          </Button>
        )}
      </Box>
      <Paper elevation={0} sx={{ px: 1.75, py: 1, mb: 2, borderRadius: 2, border: '1px solid', borderColor: 'primary.main', bgcolor: 'primary.main' }}>
        <Typography variant="h6" sx={{ fontWeight: 800, color: 'primary.contrastText', lineHeight: 1.2 }}>
          {strategicPlan.cidpName || strategicPlan.cidpid || 'N/A'}
        </Typography>
      </Paper>

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

      <Snackbar open={snackbar.open} autoHideDuration={6000} onClose={handleCloseSnackbar}>
        <Alert onClose={handleCloseSnackbar} severity={snackbar.severity} sx={{ width: '100%' }}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}

export default StrategicPlanDetailsPage;