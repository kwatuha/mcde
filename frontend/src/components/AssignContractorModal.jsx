import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Button, Dialog, DialogTitle,
  DialogContent, DialogActions, Select, MenuItem, FormControl, InputLabel,
  CircularProgress, Alert, Chip, OutlinedInput, Tooltip,
  IconButton, Snackbar // CORRECTED: Added Snackbar to the imports
} from '@mui/material';
import {
  Close as CloseIcon, Save as SaveIcon,
  GroupAdd as GroupAddIcon
} from '@mui/icons-material';
import apiService from '../api';
import { useAuth } from '../context/AuthContext';


const AssignContractorModal = ({ open, onClose, project }) => {
  const { hasPrivilege } = useAuth();
  const canManageAssignments =
    hasPrivilege('projects.assign_contractor') ||
    hasPrivilege('project.update') ||
    hasPrivilege('admin.access');

  const [allContractors, setAllContractors] = useState([]);
  const [assignedContractors, setAssignedContractors] = useState([]);
  const [selectedContractors, setSelectedContractors] = useState([]);
  
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });

  const fetchContractorData = useCallback(async () => {
    if (!project?.id || !canManageAssignments) {
      if (project?.id) {
        setError("You do not have permission to manage contractor assignments for this project.");
      }
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const [all, assigned] = await Promise.all([
        apiService.contractors.getAllContractors(),
        apiService.projects.getContractors(project.id),
      ]);
      setAllContractors(all);
      setAssignedContractors(assigned.map(c => c.contractorId));
      setSelectedContractors(assigned.map(c => c.contractorId));
    } catch (err) {
      console.error('Error fetching contractor data:', err);
      setError('Failed to load contractors. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [project, canManageAssignments]);

  useEffect(() => {
    if (open) {
      fetchContractorData();
    }
  }, [open, fetchContractorData]);

  const handleSelectionChange = (e) => {
    const { value } = e.target;
    setSelectedContractors(typeof value === 'string' ? value.split(',') : value);
  };
  
  const handleFormSubmit = async () => {
    if (!canManageAssignments) {
      setSnackbar({ open: true, message: 'Permission denied to assign contractors.', severity: 'error' });
      return;
    }
    setSubmitting(true);
    setError(null);

    const contractorsToAssign = selectedContractors.filter(id => !assignedContractors.includes(id));
    const contractorsToRemove = assignedContractors.filter(id => !selectedContractors.includes(id));

    try {
      const assignPromises = contractorsToAssign.map(contractorId =>
        apiService.projects.assignContractor(project.id, contractorId)
      );
      
      const removePromises = contractorsToRemove.map(contractorId =>
        apiService.projects.removeContractor(project.id, contractorId)
      );

      await Promise.allSettled([...assignPromises, ...removePromises]);

      setSnackbar({ open: true, message: 'Contractor assignments updated!', severity: 'success' });
      onClose();
    } catch (err) {
      console.error('Submission Error:', err);
      setError('Failed to update assignments. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCloseSnackbar = (event, reason) => {
    if (reason === 'clickaway') return;
    setSnackbar({ ...snackbar, open: false });
  };
  
  const handleClose = () => {
    onClose();
  };


  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>
        Assign Contractors to: {project?.projectName}
        <IconButton
          aria-label="close"
          onClick={onClose}
          sx={{ position: 'absolute', right: 8, top: 8 }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        {loading ? (
          <Box display="flex" justifyContent="center" py={4}><CircularProgress /></Box>
        ) : error ? (
          <Alert severity="error">{error}</Alert>
        ) : (
          <FormControl fullWidth>
            <InputLabel id="contractor-select-label">Select Contractors</InputLabel>
            <Select
              labelId="contractor-select-label"
              multiple
              value={selectedContractors}
              onChange={handleSelectionChange}
              input={<OutlinedInput label="Select Contractors" />}
              renderValue={(selected) => (
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                  {selected.map((id) => {
                    const contractor = allContractors.find(c => c.contractorId === id);
                    return <Chip key={id} label={contractor?.companyName || `ID: ${id}`} />;
                  })}
                </Box>
              )}
            >
              {allContractors.map(contractor => (
                <MenuItem key={contractor.contractorId} value={contractor.contractorId}>
                  {contractor.companyName}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} variant="outlined">Cancel</Button>
        <Button onClick={handleFormSubmit} variant="contained" disabled={submitting}>
          {submitting ? <CircularProgress size={24} /> : 'Save Assignments'}
        </Button>
      </DialogActions>
      <Snackbar open={snackbar.open} autoHideDuration={6000} onClose={handleCloseSnackbar}>
        <Alert onClose={handleCloseSnackbar} severity={snackbar.severity} sx={{ width: '100%' }}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Dialog>
  );
};

export default AssignContractorModal;