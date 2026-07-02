import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Button, TextField, Dialog, DialogTitle,
  DialogContent, DialogActions, CircularProgress, IconButton,
  Select, MenuItem, FormControl, InputLabel, Snackbar, Alert, Stack, useTheme, Tooltip
} from '@mui/material';
import { DataGrid } from '@mui/x-data-grid';
import { Add as AddIcon, Edit as EditIcon, Delete as DeleteIcon, UploadFile as UploadFileIcon } from '@mui/icons-material';
import apiService from '../api'; // Use the main api service
import ContractorImportDialog from '../components/contractors/ContractorImportDialog';
import { useAuth } from '../context/AuthContext.jsx';
import { tokens } from "../pages/dashboard/theme";

const phoneRegex = /^(?:07\d{8}|\+2547\d{8})$/;
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function ContractorManagementPage() {
  const { user, hasPrivilege } = useAuth();
  const theme = useTheme();
  const colors = tokens(theme.palette.mode);

  const [contractors, setContractors] = useState([]);
  const [contractorTypes, setContractorTypes] = useState([]);
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
    contractorTypeId: '',
    __matchCompanyName: '',
    __matchEmail: '',
    __sourceTable: '',
  });
  const [formErrors, setFormErrors] = useState({});

  // Delete Confirmation States
  const [openDeleteConfirmDialog, setOpenDeleteConfirmDialog] = useState(false);
  const [contractorToDeleteId, setContractorToDeleteId] = useState(null);
  const [contractorToDeleteName, setContractorToDeleteName] = useState('');
  const [openImportDialog, setOpenImportDialog] = useState(false);
  const canReadContractors =
      hasPrivilege('contractors.read') ||
      hasPrivilege('contractor.read') ||
      hasPrivilege('admin.access') ||
      hasPrivilege('project.read_all');
  const canCreateContractors =
      hasPrivilege('contractors.create') ||
      hasPrivilege('contractor.create') ||
      hasPrivilege('admin.access') ||
      hasPrivilege('project.update');
  const canUpdateContractors =
      hasPrivilege('contractors.update') ||
      hasPrivilege('contractor.update') ||
      hasPrivilege('admin.access') ||
      hasPrivilege('project.update');
  const canDeleteContractors =
      hasPrivilege('contractors.delete') ||
      hasPrivilege('contractor.delete') ||
      hasPrivilege('admin.access') ||
      hasPrivilege('project.update');

  const fetchContractors = useCallback(async () => {
      setLoading(true);
      setError(null);
      try {
          if (canReadContractors) {
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
  }, [canReadContractors]);
  
  const fetchUsers = useCallback(async () => {
      try {
          const data = await apiService.users.getUsers();
          setUsers(data);
      } catch (err) {
          console.error('Error fetching users:', err);
      }
  }, []);

  const fetchContractorTypes = useCallback(async () => {
      try {
          const data = await apiService.contractors.getContractorTypes();
          setContractorTypes(Array.isArray(data) ? data : []);
      } catch (err) {
          console.error('Error fetching contractor types:', err);
      }
  }, []);

  useEffect(() => {
      fetchContractors();
      fetchUsers();
      fetchContractorTypes();
  }, [fetchContractors, fetchUsers, fetchContractorTypes]);

  // --- Handlers ---

  const handleOpenCreateDialog = () => {
      if (!canCreateContractors) {
          setSnackbar({ open: true, message: 'Permission denied to create contractors.', severity: 'error' });
          return;
      }
      setCurrentContractorToEdit(null);
      setFormData({ companyName: '', contactPerson: '', email: '', phone: '', userId: '', contractorTypeId: '', __matchCompanyName: '', __matchEmail: '', __sourceTable: '' });
      setFormErrors({});
      setOpenDialog(true);
  };

  const handleOpenEditDialog = (contractor) => {
      if (!canUpdateContractors) {
          setSnackbar({ open: true, message: 'Permission denied to edit contractors.', severity: 'error' });
          return;
      }
      setCurrentContractorToEdit(contractor);
 
      setFormData({
          companyName: contractor.companyName || '',
          contactPerson: contractor.contactPerson || '',
          email: contractor.email || '',
          phone: contractor.phone || '',
          userId: contractor.userId != null && contractor.userId !== '' ? String(contractor.userId) : '',
          contractorTypeId: contractor.contractorTypeId || '',
          __matchCompanyName: contractor.companyName || '',
          __matchEmail: contractor.email || '',
          __sourceTable: contractor.sourceTable || '',
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
      setFormErrors((prev) => {
          const next = { ...prev };
          if (name === 'email') {
              if (!String(value || '').trim()) {
                  next.email = 'Email is required.';
              } else if (!emailRegex.test(String(value).trim())) {
                  next.email = 'Please enter a valid email address (e.g., user@example.com)';
              } else {
                  delete next.email;
              }
          }
          if (name === 'phone') {
              if (String(value || '').trim() && !phoneRegex.test(String(value).trim())) {
                  next.phone = 'Use 07XXXXXXXX or +2547XXXXXXXX';
              } else {
                  delete next.phone;
              }
          }
          return next;
      });
  };

  const validateForm = () => {
      let errors = {};
      if (!formData.companyName.trim()) errors.companyName = 'Company Name is required.';
      if (!formData.email.trim()) errors.email = 'Email is required.';
      if (formData.email.trim() && !emailRegex.test(formData.email.trim())) {
          errors.email = 'Please enter a valid email address (e.g., user@example.com)';
      }
      if (formData.phone.trim() && !phoneRegex.test(formData.phone.trim())) {
          errors.phone = 'Use 07XXXXXXXX or +2547XXXXXXXX';
      }
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
          const dataToSubmit = { ...formData };
          if (dataToSubmit.userId === '' || dataToSubmit.userId == null) {
              delete dataToSubmit.userId;
          }
          if (dataToSubmit.contractorTypeId === '' || dataToSubmit.contractorTypeId == null) {
              dataToSubmit.contractorTypeId = null;
          }
          if (currentContractorToEdit) {
              await apiService.contractors.updateContractor(currentContractorToEdit.contractorId, dataToSubmit);
              setSnackbar({ open: true, message: 'Contractor updated successfully!', severity: 'success' });
          } else {
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
      if (!canDeleteContractors) {
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
          field: 'linkedUsername',
          headerName: 'Linked user',
          flex: 1,
          minWidth: 180,
          valueGetter: (_value, row) => {
              if (row?.linkedUsername) return row.linkedUsername;
              if (row?.userId) {
                  const match = users.find((u) => String(u.userId) === String(row.userId));
                  return match?.username || `User #${row.userId}`;
              }
              return '—';
          },
      },
      {
          field: 'contractorTypeName',
          headerName: 'Contractor Type',
          flex: 1,
          minWidth: 170,
          valueGetter: (_value, row) => {
              const directName = String(row?.contractorTypeName || '').trim();
              if (directName) return directName;
              const typeId = row?.contractorTypeId;
              const match = contractorTypes.find((t) => String(t.contractorTypeId) === String(typeId));
              return match?.name || '';
          },
      },
      {
          field: 'actions',
          headerName: 'Actions',
          flex: 1,
          minWidth: 150,
          sortable: false,
          filterable: false,
          renderCell: (params) => (
              <Stack direction="row" spacing={1}>
                  {canUpdateContractors && (
                      <Tooltip title="Edit"><IconButton color="primary" onClick={() => handleOpenEditDialog(params.row)}><EditIcon /></IconButton></Tooltip>
                  )}
                  {canDeleteContractors && (
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

  if (error && !canReadContractors) {
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
              {canCreateContractors && (
                  <Stack direction="row" spacing={1}>
                      <Button
                          variant="outlined"
                          startIcon={<UploadFileIcon />}
                          onClick={() => setOpenImportDialog(true)}
                          sx={{ borderRadius: '8px' }}
                      >
                          Import Excel
                      </Button>
                      <Button
                          variant="contained"
                          startIcon={<AddIcon />}
                          onClick={handleOpenCreateDialog}
                          sx={{ backgroundColor: '#16a34a', '&:hover': { backgroundColor: '#15803d' }, color: 'white', fontWeight: 'semibold', borderRadius: '8px', boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)' }}
                      >
                          Add New Contractor
                      </Button>
                  </Stack>
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
                  <TextField margin="dense" name="email" label="Email" type="email" fullWidth variant="outlined" value={formData.email} onChange={handleFormChange} error={!!formErrors.email} helperText={formErrors.email || 'Enter a valid email address (e.g., user@example.com)'} sx={{ mb: 2 }} />
                  <TextField margin="dense" name="phone" label="Phone" type="tel" fullWidth variant="outlined" value={formData.phone} onChange={handleFormChange} error={!!formErrors.phone} helperText={formErrors.phone || 'Optional: 07XXXXXXXX or +2547XXXXXXXX'} sx={{ mb: 2 }} />
                  <FormControl fullWidth margin="dense" variant="outlined" sx={{ minWidth: 200, mb: 2 }}>
                      <InputLabel>Contractor Type</InputLabel>
                      <Select
                          name="contractorTypeId"
                          label="Contractor Type"
                          value={formData.contractorTypeId}
                          onChange={handleFormChange}
                      >
                          <MenuItem value=""><em>None</em></MenuItem>
                          {contractorTypes.map((typeItem) => (
                              <MenuItem key={typeItem.contractorTypeId} value={typeItem.contractorTypeId}>
                                  {typeItem.name}
                              </MenuItem>
                          ))}
                      </Select>
                  </FormControl>
                  <FormControl fullWidth margin="dense" variant="outlined" sx={{ minWidth: 200, mb: 2 }}>
                      <InputLabel>Link to user account</InputLabel>
                      <Select
                          name="userId"
                          label="Link to user account"
                          value={formData.userId}
                          onChange={handleFormChange}
                      >
                          <MenuItem value=""><em>None — not linked</em></MenuItem>
                          {users.map((userItem) => (
                              <MenuItem key={userItem.userId} value={String(userItem.userId)}>
                                  {userItem.username} ({userItem.email || 'no email'})
                              </MenuItem>
                          ))}
                      </Select>
                      <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                        The contractor logs in with this user account to access the contractor portal and assigned projects.
                      </Typography>
                  </FormControl>
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

          <ContractorImportDialog
              open={openImportDialog}
              onClose={() => setOpenImportDialog(false)}
              onSuccess={(result) => {
                  fetchContractors();
                  setSnackbar({
                      open: true,
                      message: result?.message || `Imported ${result?.createdCount || 0} contractor(s).`,
                      severity: 'success',
                  });
              }}
          />

          <Snackbar open={snackbar.open} autoHideDuration={6000} onClose={handleCloseSnackbar}>
              <Alert onClose={handleCloseSnackbar} severity={snackbar.severity} sx={{ width: '100%' }}>
                  {snackbar.message}
              </Alert>
          </Snackbar>
      </Box>
  );
}

export default ContractorManagementPage;