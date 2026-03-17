import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Button, TextField, Dialog, DialogTitle,
  DialogContent, DialogActions, CircularProgress, IconButton,
  Select, MenuItem, FormControl, InputLabel, Snackbar, Alert, Stack, useTheme, Tooltip
} from '@mui/material';
import { DataGrid } from '@mui/x-data-grid';
import { Add as AddIcon, Edit as EditIcon, Delete as DeleteIcon } from '@mui/icons-material';
import apiService from '../api'; // Use the main api service
import { useAuth } from '../context/AuthContext.jsx';
import { tokens } from "../pages/dashboard/theme";


function ContractorManagementPage() {
  const { user, hasPrivilege } = useAuth();
  const theme = useTheme();
  const colors = tokens(theme.palette.mode);

  const [contractors, setContractors] = useState([]);
  const [users, setUsers] = useState([]); // All users for linking
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
  
  // Dialog States
  const [openDialog, setOpenDialog] = useState(false);
  const [currentContractorToEdit, setCurrentContractorToEdit] = useState(null);
  const [formData, setFormData] = useState({
    companyName: '',
    contactPerson: '',
    email: '',
    phone: '',
    userId: '', // For linking to a user
  });
  const [formErrors, setFormErrors] = useState({});

  // Delete Confirmation States
  const [openDeleteConfirmDialog, setOpenDeleteConfirmDialog] = useState(false);
  const [contractorToDeleteId, setContractorToDeleteId] = useState(null);
  const [contractorToDeleteName, setContractorToDeleteName] = useState('');

  const fetchContractors = useCallback(async () => {
      setLoading(true);
      setError(null);
      try {
          if (hasPrivilege('contractors.read')) {
              const data = await apiService.contractors.getAllContractors();
              setContractors(data);
          } else {
              setError("You do not have permission to view contractors.");
          }
      } catch (err) {
          console.error('Error fetching contractors:', err);
          setError(err.message || "Failed to load contractors.");
      } finally {
          setLoading(false);
      }
  }, [hasPrivilege]);
  
  const fetchUsers = useCallback(async () => {
      try {
          const data = await apiService.users.getUsers();
          setUsers(data);
      } catch (err) {
          console.error('Error fetching users:', err);
      }
  }, []);

  useEffect(() => {
      fetchContractors();
      fetchUsers();
  }, [fetchContractors, fetchUsers]);

  // --- Handlers ---

  const handleOpenCreateDialog = () => {
      if (!hasPrivilege('contractors.create')) {
          setSnackbar({ open: true, message: 'Permission denied to create contractors.', severity: 'error' });
          return;
      }
      setCurrentContractorToEdit(null);
      setFormData({ companyName: '', contactPerson: '', email: '', phone: '', userId: '' });
      setFormErrors({});
      setOpenDialog(true);
  };

  const handleOpenEditDialog = (contractor) => {
      if (!hasPrivilege('contractors.update')) {
          setSnackbar({ open: true, message: 'Permission denied to edit contractors.', severity: 'error' });
          return;
      }
      setCurrentContractorToEdit(contractor);
 
      setFormData({
          companyName: contractor.companyName || '',
          contactPerson: contractor.contactPerson || '',
          email: contractor.email || '',
          phone: contractor.phone || '',
          userId: user.id || '',
      });
   
      setFormErrors({});
      setOpenDialog(true);
  };

  const handleCloseDialog = () => {
      setOpenDialog(false);
      setCurrentContractorToEdit(null);
      setFormErrors({});
  };

  const handleFormChange = (e) => {
      const { name, value } = e.target;
      setFormData(prev => ({ ...prev, [name]: value }));
  };

  const validateForm = () => {
      let errors = {};
      if (!formData.companyName.trim()) errors.companyName = 'Company Name is required.';
      if (!formData.email.trim()) errors.email = 'Email is required.';
      if (!/\S+@\S+\.\S+/.test(formData.email)) errors.email = 'Email is invalid.';
      setFormErrors(errors);
      return Object.keys(errors).length === 0;
  };
  
  const handleFormSubmit = async () => {
      if (!validateForm()) {
          setSnackbar({ open: true, message: 'Please correct the form errors.', severity: 'error' });
          return;
      }

      setLoading(true);
      try {
          if (currentContractorToEdit) {
              await apiService.contractors.updateContractor(currentContractorToEdit.contractorId, formData);
              setSnackbar({ open: true, message: 'Contractor updated successfully!', severity: 'success' });
          } else {
              const dataToSubmit = { ...formData };
              if (!dataToSubmit.userId && user?.uid) {
                  dataToSubmit.userId = user.uid;
              }

              await apiService.contractors.createContractor(dataToSubmit);

              setSnackbar({ open: true, message: 'Contractor created successfully!', severity: 'success' });
          }
          handleCloseDialog();
          fetchContractors();
          fetchUsers();
      } catch (err) {
          console.error("Submit contractor error:", err);
          setSnackbar({ open: true, message: err.response?.data?.message || err.message || 'Failed to save contractor.', severity: 'error' });
      } finally {
          setLoading(false);
      }
  };

  const handleOpenDeleteConfirmDialog = (contractorId, companyName) => {
      if (!hasPrivilege('contractors.delete')) {
          setSnackbar({ open: true, message: 'Permission denied to delete contractors.', severity: 'error' });
          return;
      }
      setContractorToDeleteId(contractorId);
      setContractorToDeleteName(companyName);
      setOpenDeleteConfirmDialog(true);
  };

  const handleCloseDeleteConfirmDialog = () => {
      setOpenDeleteConfirmDialog(false);
      setContractorToDeleteId(null);
      setContractorToDeleteName('');
  };

  const handleConfirmDelete = async () => {
      setLoading(true);
      handleCloseDeleteConfirmDialog();
      try {
          await apiService.contractors.deleteContractor(contractorToDeleteId);
          setSnackbar({ open: true, message: 'Contractor deleted successfully!', severity: 'success' });
          fetchContractors();
      } catch (err) {
          console.error("Delete contractor error:", err);
          setSnackbar({ open: true, message: err.response?.data?.message || err.message || 'Failed to delete contractor.', severity: 'error' });
      } finally {
          setLoading(false);
      }
  };
  
  const handleCloseSnackbar = (event, reason) => {
      if (reason === 'clickaway') {
          return;
      }
      setSnackbar({ ...snackbar, open: false });
  };


  const columns = [
      { field: 'contractorId', headerName: 'ID', flex: 0.5, minWidth: 50 },
      { field: 'companyName', headerName: 'Company Name', flex: 1, minWidth: 200 },
      { field: 'contactPerson', headerName: 'Contact Person', flex: 1, minWidth: 150 },
      { field: 'email', headerName: 'Email', flex: 1.5, minWidth: 250 },
      { field: 'phone', headerName: 'Phone', flex: 1, minWidth: 150 },
      {
          field: 'actions',
          headerName: 'Actions',
          flex: 1,
          minWidth: 150,
          sortable: false,
          filterable: false,
          renderCell: (params) => (
              <Stack direction="row" spacing={1}>
                  {hasPrivilege('contractors.update') && (
                      <Tooltip title="Edit"><IconButton color="primary" onClick={() => handleOpenEditDialog(params.row)}><EditIcon /></IconButton></Tooltip>
                  )}
                  {hasPrivilege('contractors.delete') && (
                      <Tooltip title="Delete"><IconButton color="error" onClick={() => handleOpenDeleteConfirmDialog(params.row.contractorId, params.row.companyName)}><DeleteIcon /></IconButton></Tooltip>
                  )}
              </Stack>
          ),
      },
  ];

  if (loading && !error) {
      return (
          <Box display="flex" justifyContent="center" alignItems="center" height="80vh">
              <CircularProgress />
              <Typography sx={{ ml: 2 }}>Loading contractors...</Typography>
          </Box>
      );
  }

  if (error && !hasPrivilege('contractors.read')) {
      return (
          <Box sx={{ p: 3 }}>
              <Alert severity="error">{error || "You do not have sufficient privileges to view this page."}</Alert>
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
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
              <Typography variant="h4" component="h1" sx={{ color: theme.palette.primary.main, fontWeight: 'bold' }}>
                  Contractor Management
              </Typography>
              {hasPrivilege('contractors.create') && (
                  <Button
                      variant="contained"
                      startIcon={<AddIcon />}
                      onClick={handleOpenCreateDialog}
                      sx={{ backgroundColor: '#16a34a', '&:hover': { backgroundColor: '#15803d' }, color: 'white', fontWeight: 'semibold', borderRadius: '8px', boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)' }}
                  >
                      Add New Contractor
                  </Button>
              )}
          </Box>
          <Box
              m="20px 0 0 0"
              height="75vh"
              sx={{
                  "& .MuiDataGrid-root": {
                      border: "none",
                  },
                  "& .MuiDataGrid-cell": {
                      borderBottom: "none",
                  },
                              "& .MuiDataGrid-columnHeaders": {
              backgroundColor: `${colors.blueAccent[700]} !important`,
              borderBottom: "none",
            },
            "& .MuiDataGrid-virtualScroller": {
              backgroundColor: colors.primary[400],
            },
            "& .MuiDataGrid-footerContainer": {
              borderTop: "none",
              backgroundColor: `${colors.blueAccent[700]} !important`,
            },
                  "& .MuiCheckbox-root": {
                      color: `${colors.greenAccent[200]} !important`,
                  },
              }}
          >
              {contractors && contractors.length > 0 ? (
                  <DataGrid
                      rows={contractors}
                      columns={columns}
                      getRowId={(row) => row.contractorId}
                  />
              ) : (
                  <Box display="flex" justifyContent="center" alignItems="center" height="100%">
                      <Typography variant="h6">No contractors found. Add a new contractor to get started.</Typography>
                  </Box>
              )}
          </Box>

          {/* Create/Edit Contractor Dialog */}
          <Dialog open={openDialog} onClose={handleCloseDialog} fullWidth maxWidth="sm">
              <DialogTitle sx={{ backgroundColor: theme.palette.primary.main, color: 'white' }}>
                  {currentContractorToEdit ? 'Edit Contractor' : 'Add New Contractor'}
              </DialogTitle>
              <DialogContent dividers sx={{ backgroundColor: theme.palette.background.default }}>
                  <TextField autoFocus margin="dense" name="companyName" label="Company Name" type="text" fullWidth variant="outlined" value={formData.companyName} onChange={handleFormChange} error={!!formErrors.companyName} helperText={formErrors.companyName} sx={{ mb: 2 }} />
                  <TextField margin="dense" name="contactPerson" label="Contact Person" type="text" fullWidth variant="outlined" value={formData.contactPerson} onChange={handleFormChange} sx={{ mb: 2 }} />
                  <TextField margin="dense" name="email" label="Email" type="email" fullWidth variant="outlined" value={formData.email} onChange={handleFormChange} error={!!formErrors.email} helperText={formErrors.email} sx={{ mb: 2 }} />
                  <TextField margin="dense" name="phone" label="Phone" type="tel" fullWidth variant="outlined" value={formData.phone} onChange={handleFormChange} sx={{ mb: 2 }} />
                  {!currentContractorToEdit && (
                      <FormControl fullWidth margin="dense" variant="outlined" sx={{ minWidth: 200, mb: 2 }}>
                          <InputLabel>Link to User Account</InputLabel>
                          <Select
                              name="userId"
                              label="Link to User Account"
                              value={formData.userId}
                              onChange={handleFormChange}
                          >
                              <MenuItem value=""><em>None</em></MenuItem>
                              {users.map(userItem => (
                                  <MenuItem key={userItem.userId} value={userItem.userId}>{userItem.username} ({userItem.email})</MenuItem>
                              ))}
                          </Select>
                      </FormControl>
                  )}
              </DialogContent>
              <DialogActions sx={{ padding: '16px 24px', borderTop: `1px solid ${theme.palette.divider}` }}>
                  <Button onClick={handleCloseDialog} color="primary" variant="outlined">Cancel</Button>
                  <Button onClick={handleFormSubmit} color="primary" variant="contained">{currentContractorToEdit ? 'Update Contractor' : 'Create Contractor'}</Button>
              </DialogActions>
          </Dialog>

          {/* Delete Confirmation Dialog */}
          <Dialog open={openDeleteConfirmDialog} onClose={handleCloseDeleteConfirmDialog}>
              <DialogTitle>Confirm Deletion</DialogTitle>
              <DialogContent>
                  <Typography>Are you sure you want to delete contractor "{contractorToDeleteName}"? This action cannot be undone.</Typography>
              </DialogContent>
              <DialogActions>
                  <Button onClick={handleCloseDeleteConfirmDialog} color="primary" variant="outlined">Cancel</Button>
                  <Button onClick={handleConfirmDelete} color="error" variant="contained">Delete</Button>
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

export default ContractorManagementPage;