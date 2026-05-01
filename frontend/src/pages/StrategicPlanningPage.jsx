import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Button, Paper, CircularProgress, Alert,
  IconButton, Dialog, DialogTitle, DialogContent, DialogActions, TextField, Snackbar, useTheme, Tooltip, Stack,
} from '@mui/material';
import { DataGrid } from '@mui/x-data-grid';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Visibility as ViewIcon,
  MoreHoriz as MoreHorizIcon,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import apiService from '../api';
import strategicPlanningLabels from '../configs/strategicPlanningLabels';
import { useAuth } from '../context/AuthContext.jsx';
import { tokens } from "./dashboard/theme";
import Header from "./dashboard/Header";

/**
 * Helper function to check if the user has a specific privilege.
 * @param {object | null} user - The user object from AuthContext.
 * @param {string} privilegeName - The name of the privilege to check.
 * @returns {boolean} True if the user has the privilege, false otherwise.
 */
const checkUserPrivilege = (user, privilegeName) => {
  return user && user.privileges && Array.isArray(user.privileges) && user.privileges.includes(privilegeName);
};

// Helper function to format dates for display
const formatDate = (dateString) => {
  if (!dateString) return 'N/A';
  const options = { year: 'numeric', month: 'long', day: 'numeric' };
  return new Date(dateString).toLocaleDateString(undefined, options);
};

function StrategicPlanningPage() {
  const theme = useTheme();
  const colors = tokens(theme.palette.mode);
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [strategicPlans, setStrategicPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });

  const [openFormDialog, setOpenFormDialog] = useState(false);
  const [currentPlan, setCurrentPlan] = useState(null);
  const [planDetailsOpen, setPlanDetailsOpen] = useState(false);
  const [planForDetails, setPlanForDetails] = useState(null);
  const [formValues, setFormValues] = useState({
    cidpid: '',
    cidpName: '',
    startDate: '',
    endDate: '',
    vision: '',
    mission: '',
  });

  const fetchStrategicPlans = useCallback(async () => {
    setLoading(true);
    setError(null);

    if (authLoading) {
      console.log('StrategicPlanningPage: AuthContext still loading. Skipping fetchStrategicPlans.');
      return;
    }

    if (!user || !Array.isArray(user.privileges)) {
      console.log('StrategicPlanningPage: User or privileges not available after auth loading. Cannot fetch strategic plans.');
      setLoading(false);
      setError("Authentication data loading or missing privileges. Cannot fetch strategic plans.");
      return;
    }

    try {
      if (checkUserPrivilege(user, 'strategic_plan.read_all')) {
        const data = await apiService.strategy.getStrategicPlans();
        setStrategicPlans(data);
      } else {
        console.log('StrategicPlanningPage: User lacks strategic_plan.read_all privilege. Setting empty plans.');
        setStrategicPlans([]);
        setError(`You do not have '${'strategic_plan.read_all'}' privilege to view ${strategicPlanningLabels.strategicPlan.plural.toLowerCase()}.`);
      }
    } catch (err) {
      console.error('Error fetching strategic plans:', err);
      setError(err.message || 'Failed to load strategic plans.');
      setStrategicPlans([]);
    } finally {
      setLoading(false);
    }
  }, [user, authLoading]);

  useEffect(() => {
    fetchStrategicPlans();
  }, [fetchStrategicPlans]);

  const handleOpenCreateDialog = () => {
    if (!checkUserPrivilege(user, 'strategic_plan.create')) {
      setSnackbar({ open: true, message: `You do not have permission to create ${strategicPlanningLabels.strategicPlan.plural.toLowerCase()}.`, severity: 'error' });
      return;
    }
    setCurrentPlan(null);
    setFormValues({
      cidpid: '',
      cidpName: '',
      startDate: '',
      endDate: '',
      vision: '',
      mission: '',
    });
    setOpenFormDialog(true);
  };

  const handleOpenEditDialog = (plan) => {
    if (!checkUserPrivilege(user, 'strategic_plan.update')) {
      setSnackbar({ open: true, message: `You do not have permission to edit ${strategicPlanningLabels.strategicPlan.plural.toLowerCase()}.`, severity: 'error' });
      return;
    }
    setCurrentPlan(plan);
    setFormValues({
      cidpid: plan.cidpid || '',
      cidpName: plan.cidpName || '',
      startDate: plan.startDate ? new Date(plan.startDate).toISOString().split('T')[0] : '',
      endDate: plan.endDate ? new Date(plan.endDate).toISOString().split('T')[0] : '',
      vision: plan.vision || '',
      mission: plan.mission || '',
    });
    setOpenFormDialog(true);
  };

  const handleOpenPlanDetails = (plan) => {
    setPlanForDetails(plan);
    setPlanDetailsOpen(true);
  };

  const handleClosePlanDetails = () => {
    setPlanDetailsOpen(false);
    setPlanForDetails(null);
  };

  const handleCloseFormDialog = () => {
    setOpenFormDialog(false);
  };

  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setFormValues(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmitForm = async () => {
    setLoading(true);
    setError(null);
    try {
      if (currentPlan) {
        if (!checkUserPrivilege(user, 'strategic_plan.update')) {
          setSnackbar({ open: true, message: `You do not have permission to update ${strategicPlanningLabels.strategicPlan.plural.toLowerCase()}.`, severity: 'error' });
          return;
        }
        await apiService.strategy.updateStrategicPlan(currentPlan.id, formValues);
      } else {
        if (!checkUserPrivilege(user, 'strategic_plan.create')) {
          setSnackbar({ open: true, message: `You do not have permission to create ${strategicPlanningLabels.strategicPlan.plural.toLowerCase()}.`, severity: 'error' });
          return;
        }
        await apiService.strategy.createStrategicPlan(formValues);
      }
      setOpenFormDialog(false);
      setSnackbar({ open: true, message: `${strategicPlanningLabels.strategicPlan.singular} saved successfully!`, severity: 'success' });
      fetchStrategicPlans();
    } catch (err) {
      console.error('Error saving strategic plan:', err);
      setSnackbar({ open: true, message: err.message || `Failed to save ${strategicPlanningLabels.strategicPlan.singular.toLowerCase()}.`, severity: 'error' });
      setError(err.message || `Failed to save ${strategicPlanningLabels.strategicPlan.singular.toLowerCase()}.`);
    } finally {
      setLoading(false);
    }
  };

  const handleDeletePlan = async (planId) => {
    if (!checkUserPrivilege(user, 'strategic_plan.delete')) {
      setSnackbar({ open: true, message: `You do not have permission to delete ${strategicPlanningLabels.strategicPlan.plural.toLowerCase()}.`, severity: 'error' });
      return;
    }
    if (!window.confirm(`Are you sure you want to delete this ${strategicPlanningLabels.strategicPlan.singular}? This action cannot be undone.`)) {
      return;
    }
    setLoading(true);
    try {
      await apiService.strategy.deleteStrategicPlan(planId);
      setSnackbar({ open: true, message: `${strategicPlanningLabels.strategicPlan.singular} deleted successfully!`, severity: 'success' });
      fetchStrategicPlans();
    } catch (err) {
      console.error('Error deleting strategic plan:', err);
      setSnackbar({ open: true, message: err.message || `Failed to delete ${strategicPlanningLabels.strategicPlan.singular.toLowerCase()}.`, severity: 'error' });
      setError(err.message || `Failed to delete ${strategicPlanningLabels.strategicPlan.singular.toLowerCase()}.`);
    } finally {
      setLoading(false);
    }
  };

  const handleViewPlanDetails = (planId) => {
    navigate(`/strategic-planning/${planId}`);
  };

  const handleCloseSnackbar = (event, reason) => {
    if (reason === 'clickaway') return;
    setSnackbar({ ...snackbar, open: false });
  };

  const columns = [
    { field: 'cidpName', headerName: strategicPlanningLabels.strategicPlan.fields.cidpName, flex: 1.5, minWidth: 250 },
    { 
      field: 'startDate', 
      headerName: strategicPlanningLabels.strategicPlan.fields.startDate, 
      flex: 1, 
      minWidth: 150,
      renderCell: (params) => {
        // Access date directly from row - DataGrid should map the field automatically
        const dateValue = params.row?.startDate || params.row?.StartDate || params.value;
        if (!dateValue) return 'N/A';
        return formatDate(dateValue);
      }
    },
    { 
      field: 'endDate', 
      headerName: strategicPlanningLabels.strategicPlan.fields.endDate, 
      flex: 1, 
      minWidth: 150,
      renderCell: (params) => {
        // Access date directly from row - DataGrid should map the field automatically
        const dateValue = params.row?.endDate || params.row?.EndDate || params.value;
        if (!dateValue) return 'N/A';
        return formatDate(dateValue);
      }
    },
    {
      field: 'actions',
      headerName: 'Actions',
      flex: 1,
      minWidth: 200,
      sortable: false,
      filterable: false,
      renderCell: (params) => (
        <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
          <Tooltip title="Open plan (programs & sub-programs)">
            <IconButton color="info" size="small" onClick={() => handleViewPlanDetails(params.row.id)}>
              <ViewIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Plan details (vision, mission, …)">
            <IconButton color="secondary" size="small" onClick={() => handleOpenPlanDetails(params.row)}>
              <MoreHorizIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          {checkUserPrivilege(user, 'strategic_plan.update') && (
            <Tooltip title="Edit">
              <IconButton color="primary" size="small" onClick={() => handleOpenEditDialog(params.row)}>
                <EditIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          {checkUserPrivilege(user, 'strategic_plan.delete') && (
            <Tooltip title="Delete">
              <IconButton color="error" size="small" onClick={() => handleDeletePlan(params.row.id)}>
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
        </Stack>
      ),
    },
  ];

  if (authLoading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" height="80vh">
        <CircularProgress />
        <Typography sx={{ ml: 2 }}>Loading authentication data...</Typography>
      </Box>
    );
  }

  return (
    <Box m="5px 20px">
      <Box sx={{ mb: 0.5, '& > div': { mb: '0 !important' } }}>
        <Header title="CIDP Registry" subtitle="List of strategic plans" />
      </Box>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 0.5 }}>
        {checkUserPrivilege(user, 'strategic_plan.create') && (
          <Button
            variant="contained"
            size="small"
            startIcon={<AddIcon />}
            onClick={handleOpenCreateDialog}
            sx={{ backgroundColor: colors.greenAccent[600], '&:hover': { backgroundColor: colors.greenAccent[700] }, color: colors.white }}
          >
            Add New {strategicPlanningLabels.strategicPlan.singular}
          </Button>
        )}
      </Box>

      {loading ? (
        <Box display="flex" justifyContent="center" alignItems="center" height="60vh">
          <CircularProgress />
        </Box>
      ) : error ? (
        <Alert severity="error">{error}</Alert>
      ) : strategicPlans.length === 0 && checkUserPrivilege(user, 'strategic_plan.read_all') ? (
        <Alert severity="info">No {strategicPlanningLabels.strategicPlan.plural.toLowerCase()} found. Click "Add New {strategicPlanningLabels.strategicPlan.singular}" to get started.</Alert>
      ) : strategicPlans.length === 0 && !checkUserPrivilege(user, 'strategic_plan.read_all') ? (
        <Alert severity="warning">You do not have the necessary permissions to view any {strategicPlanningLabels.strategicPlan.plural.toLowerCase()}.</Alert>
      ) : (
        <Box
          mt={0.5}
          height="75vh"
          sx={{
            "& .MuiDataGrid-root": {
              border: "none",
            },
            "& .MuiDataGrid-cell": {
              borderBottom: "none",
            },
            "& .MuiDataGrid-columnHeaders": {
              backgroundColor: colors.blueAccent[700],
              borderBottom: "none",
            },
            "& .MuiDataGrid-virtualScroller": {
              backgroundColor: colors.primary[400],
            },
            "& .MuiDataGrid-footerContainer": {
              borderTop: "none",
              backgroundColor: colors.blueAccent[700],
            },
            "& .MuiCheckbox-root": {
              color: `${colors.greenAccent[200]} !important`,
            },
          }}
        >
          <DataGrid
            rows={strategicPlans}
            columns={columns}
            getRowId={(row) => row.id}
          />
        </Box>
      )}

      {/* Plan details (read-only): vision, mission, etc. — not shown in grid */}
      <Dialog open={planDetailsOpen} onClose={handleClosePlanDetails} maxWidth="sm" fullWidth>
        <DialogTitle>Plan details</DialogTitle>
        <DialogContent dividers>
          {planForDetails && (
            <Stack spacing={2}>
              <Box>
                <Typography variant="caption" color="text.secondary" display="block">
                  {strategicPlanningLabels.strategicPlan.fields.cidpName}
                </Typography>
                <Typography variant="body1" fontWeight={600}>
                  {planForDetails.cidpName || '—'}
                </Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary" display="block">
                  {strategicPlanningLabels.strategicPlan.fields.cidpid}
                </Typography>
                <Typography variant="body2">{planForDetails.cidpid || '—'}</Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary" display="block">
                  {strategicPlanningLabels.strategicPlan.fields.startDate} / {strategicPlanningLabels.strategicPlan.fields.endDate}
                </Typography>
                <Typography variant="body2">
                  {formatDate(planForDetails.startDate)} — {formatDate(planForDetails.endDate)}
                </Typography>
              </Box>
              <Box>
                <Typography variant="subtitle2" color="primary" fontWeight={700} gutterBottom>
                  {strategicPlanningLabels.strategicPlan.fields.vision}
                </Typography>
                <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                  {planForDetails.vision?.trim() ? planForDetails.vision : '—'}
                </Typography>
              </Box>
              <Box>
                <Typography variant="subtitle2" color="primary" fontWeight={700} gutterBottom>
                  {strategicPlanningLabels.strategicPlan.fields.mission}
                </Typography>
                <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                  {planForDetails.mission?.trim() ? planForDetails.mission : '—'}
                </Typography>
              </Box>
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClosePlanDetails}>Close</Button>
          <Button variant="contained" onClick={() => { handleClosePlanDetails(); handleViewPlanDetails(planForDetails.id); }}>
            Open plan
          </Button>
        </DialogActions>
      </Dialog>

      {/* Strategic Plan Form Dialog */}
      <Dialog open={openFormDialog} onClose={handleCloseFormDialog} maxWidth="sm" fullWidth>
        <DialogTitle>{currentPlan ? `Edit ${strategicPlanningLabels.strategicPlan.singular}` : `Add New ${strategicPlanningLabels.strategicPlan.singular}`}</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            name="cidpName"
            label={strategicPlanningLabels.strategicPlan.fields.cidpName}
            type="text"
            fullWidth
            value={formValues.cidpName}
            onChange={handleFormChange}
            required
            sx={{ mb: 2 }}
          />
          <TextField
            margin="dense"
            name="cidpid"
            label={strategicPlanningLabels.strategicPlan.fields.cidpid}
            type="text"
            fullWidth
            value={formValues.cidpid}
            onChange={handleFormChange}
            helperText="Optional. If left blank, a Plan ID is auto-generated (example: CIDP-2026-0430)."
            sx={{ mb: 2 }}
          />
          <TextField
            margin="dense"
            name="vision"
            label={strategicPlanningLabels.strategicPlan.fields.vision}
            fullWidth
            multiline
            minRows={3}
            value={formValues.vision}
            onChange={handleFormChange}
            sx={{ mb: 2 }}
          />
          <TextField
            margin="dense"
            name="mission"
            label={strategicPlanningLabels.strategicPlan.fields.mission}
            fullWidth
            multiline
            minRows={3}
            value={formValues.mission}
            onChange={handleFormChange}
            sx={{ mb: 2 }}
          />
          <TextField
            margin="dense"
            name="startDate"
            label={strategicPlanningLabels.strategicPlan.fields.startDate}
            type="date"
            fullWidth
            InputLabelProps={{ shrink: true }}
            value={formValues.startDate}
            onChange={handleFormChange}
            required
            sx={{ mb: 2 }}
          />
          <TextField
            margin="dense"
            name="endDate"
            label={strategicPlanningLabels.strategicPlan.fields.endDate}
            type="date"
            fullWidth
            InputLabelProps={{ shrink: true }}
            value={formValues.endDate}
            onChange={handleFormChange}
            required
            sx={{ mb: 2 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseFormDialog} sx={{ color: colors.grey[400] }}>Cancel</Button>
          <Button onClick={handleSubmitForm} variant="contained" color="primary" disabled={loading}
            sx={{
              backgroundColor: colors.blueAccent[600], '&:hover': { backgroundColor: colors.blueAccent[700] }
            }}
          >
            {currentPlan ? `Update ${strategicPlanningLabels.strategicPlan.singular}` : `Create ${strategicPlanningLabels.strategicPlan.singular}`}
          </Button>
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

export default StrategicPlanningPage;