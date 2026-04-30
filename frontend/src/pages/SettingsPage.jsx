import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  Box, Typography, Button, TextField, Dialog, DialogTitle,
  DialogContent, DialogActions, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Paper, CircularProgress, IconButton,
  Alert, Snackbar, Stack, Collapse, Accordion, AccordionSummary, AccordionDetails,
  Grid, useTheme, Tabs, Tab, FormControl, InputLabel, Select, MenuItem,
  InputAdornment, Chip
} from '@mui/material';
import { Add as AddIcon, Edit as EditIcon, Delete as DeleteIcon, ExpandMore as ExpandMoreIcon, LocationCity as LocationCityIcon, Map as MapIcon, CalendarToday as CalendarTodayIcon, Search as SearchIcon, Clear as ClearIcon, Security as SecurityIcon, Percent as PercentIcon } from '@mui/icons-material';
import { useAuth } from '../context/AuthContext.jsx';
import apiService from '../api';
import metaDataService from '../api/metaDataService';
import useDepartmentData from '../hooks/useDepartmentData';
import { DEFAULT_COUNTY } from '../configs/appConfig';
import { isSuperAdminUser } from '../utils/roleUtils';

// Reusable Delete Confirmation Dialog
const DeleteConfirmDialog = ({ open, onClose, onConfirm, itemToDeleteName, itemType }) => {
  console.log('DeleteConfirmDialog props:', { open, itemToDeleteName, itemType });
  return (
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
};

const DepartmentAndSectionManagement = () => {
  const { hasPrivilege } = useAuth();
  const theme = useTheme();

  const {
    departments, loading, setLoading, snackbar, setSnackbar,
    fetchDepartmentsAndSections,
  } = useDepartmentData();

  // Global search state
  const [globalSearch, setGlobalSearch] = useState('');

  const [dialogState, setDialogState] = useState({
    openDeptDialog: false,
    openSectionDialog: false,
    openDeleteConfirmDialog: false,
    currentDeptToEdit: null,
    currentSectionToEdit: null,
    deptFormData: { name: '', alias: '', location: '', address: '', contactPerson: '', phoneNumber: '', email: '', remarks: '' },
    sectionFormData: { name: '', alias: '', departmentId: '' },
    itemToDelete: null,
    deptFormErrors: {},
    sectionFormErrors: {}
  });

  const {
    openDeptDialog, openSectionDialog, openDeleteConfirmDialog,
    currentDeptToEdit, currentSectionToEdit,
    deptFormData, sectionFormData, itemToDelete,
    deptFormErrors, sectionFormErrors
  } = dialogState;

  const setDialogStateValue = (key, value) => {
    setDialogState(prev => ({ ...prev, [key]: value }));
  };
  
  const handleOpenCreateDeptDialog = () => {
    if (!hasPrivilege('department.create')) {
      setSnackbar({ open: true, message: "Permission denied to create departments.", severity: 'error' });
      return;
    }
    setDialogStateValue('currentDeptToEdit', null);
    setDialogStateValue('deptFormData', { name: '', alias: '', location: '', address: '', contactPerson: '', phoneNumber: '', email: '', remarks: '' });
    setDialogStateValue('deptFormErrors', {});
    setDialogStateValue('openDeptDialog', true);
  };

  const handleOpenEditDeptDialog = (department) => {
    if (!hasPrivilege('department.update')) {
      setSnackbar({ open: true, message: "Permission denied to update departments.", severity: 'error' });
      return;
    }
    setDialogStateValue('currentDeptToEdit', department);
    setDialogStateValue('deptFormData', { 
      name: department.name || '', 
      alias: department.alias || '', 
      location: department.location || '',
      address: department.address || '',
      contactPerson: department.contactPerson || '',
      phoneNumber: department.phoneNumber || '',
      email: department.email || '',
      remarks: department.remarks || ''
    });
    setDialogStateValue('deptFormErrors', {});
    setDialogStateValue('openDeptDialog', true);
  };

  const handleDeptFormChange = (e) => {
    const { name, value } = e.target;
    setDialogState(prev => ({ 
      ...prev, 
      deptFormData: { 
        ...prev.deptFormData, 
        [name]: value 
      } 
    }));

    // Real-time validation for name field
    if (name === 'name') {
      const trimmedName = value.trim();
      if (trimmedName) {
        const isDuplicate = departments.some(dept => 
          dept.name.toLowerCase() === trimmedName.toLowerCase() && 
          (!currentDeptToEdit || dept.departmentId !== currentDeptToEdit.departmentId)
        );
        if (isDuplicate) {
          setDialogState(prev => ({
            ...prev,
            deptFormErrors: {
              ...prev.deptFormErrors,
              name: 'A department with this name already exists.'
            }
          }));
        } else {
          setDialogState(prev => ({
            ...prev,
            deptFormErrors: {
              ...prev.deptFormErrors,
              name: ''
            }
          }));
        }
      } else {
        setDialogState(prev => ({
          ...prev,
          deptFormErrors: {
            ...prev.deptFormErrors,
            name: ''
          }
        }));
      }
    }
  };

  const validateDeptForm = () => {
    let errors = {};
    if (!deptFormData.name) {
      errors.name = 'Name is required.';
    } else {
      // Check for duplicate names (case-insensitive)
      const trimmedName = deptFormData.name.trim();
      const isDuplicate = departments.some(dept => 
        dept.name.toLowerCase() === trimmedName.toLowerCase() && 
        (!currentDeptToEdit || dept.departmentId !== currentDeptToEdit.departmentId)
      );
      if (isDuplicate) {
        errors.name = 'A department with this name already exists.';
      }
    }
    if (deptFormData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(deptFormData.email)) {
      errors.email = 'Please enter a valid email address.';
    }
    setDialogStateValue('deptFormErrors', errors);
    return Object.keys(errors).length === 0;
  };

  const handleDeptSubmit = async () => {
    if (!validateDeptForm()) {
      setSnackbar({ open: true, message: 'Please correct the form errors.', severity: 'error' });
      return;
    }
    setLoading(true);
    try {
      if (currentDeptToEdit) {
        console.log('Updating department:', currentDeptToEdit.departmentId, deptFormData);
        await apiService.metadata.departments.updateDepartment(currentDeptToEdit.departmentId, deptFormData);
        setSnackbar({ open: true, message: 'Department updated successfully!', severity: 'success' });
      } else {
        console.log('Creating department:', deptFormData);
        await apiService.metadata.departments.createDepartment(deptFormData);
        setSnackbar({ open: true, message: 'Department created successfully!', severity: 'success' });
      }
      setDialogStateValue('openDeptDialog', false);
      fetchDepartmentsAndSections();
    } catch (error) {
      console.error('Department save error:', error);
      let errorMessage = error.response?.data?.message || error.message || 'Failed to save department.';
      
      // Handle duplicate name error specifically
      if (error.response?.status === 409) {
        errorMessage = 'A department with this name already exists.';
        // Set the name field error for immediate feedback
        setDialogState(prev => ({
          ...prev,
          deptFormErrors: {
            ...prev.deptFormErrors,
            name: errorMessage
          }
        }));
      }
      
      setSnackbar({ open: true, message: errorMessage, severity: 'error' });
    } finally {
      setLoading(false);
    }
  };
  
  const handleOpenCreateSectionDialog = (departmentId) => {
      if (!hasPrivilege('section.create')) {
        setSnackbar({ open: true, message: "Permission denied to create sections.", severity: 'error' });
        return;
      }
      setDialogStateValue('currentSectionToEdit', { departmentId });
      setDialogStateValue('sectionFormData', { departmentId, name: '', alias: '' });
      setDialogStateValue('sectionFormErrors', {});
      setDialogStateValue('openSectionDialog', true);
  };
  
  const handleOpenEditSectionDialog = (section) => {
    console.log('Opening edit section dialog for:', section);
    if (!hasPrivilege('section.update')) {
      setSnackbar({ open: true, message: "Permission denied to update sections.", severity: 'error' });
      return;
    }
    const formData = { name: section.name, alias: section.alias, departmentId: section.departmentId };
    console.log('Setting section form data to:', formData);
    setDialogStateValue('currentSectionToEdit', section);
    setDialogStateValue('sectionFormData', formData);
    setDialogStateValue('sectionFormErrors', {});
    setDialogStateValue('openSectionDialog', true);
  };

  const handleCloseSectionDialog = () => {
    setDialogStateValue('openSectionDialog', false);
    setDialogStateValue('currentSectionToEdit', null);
    setDialogStateValue('sectionFormErrors', {});
  };
  
  const handleSectionFormChange = (e) => {
      const { name, value } = e.target;
      console.log('Section form change:', { name, value });
      setDialogState(prev => ({ ...prev, sectionFormData: { ...prev.sectionFormData, [name]: value } }));
  };

  const validateSectionForm = () => {
    let errors = {};
    if (!sectionFormData.name) errors.name = 'Name is required.';
    setDialogStateValue('sectionFormErrors', errors);
    return Object.keys(errors).length === 0;
  };
  
  const handleSectionSubmit = async () => {
    if (!validateSectionForm()) {
      setSnackbar({ open: true, message: 'Please correct the form errors.', severity: 'error' });
      return;
    }
    setLoading(true);
    try {
      if (currentSectionToEdit?.sectionId) {
        console.log('Updating section:', currentSectionToEdit.sectionId);
        console.log('Section form data being sent:', sectionFormData);
        console.log('Current section to edit:', currentSectionToEdit);
        // CORRECTED: Call the metadata sections service for update
        await apiService.metadata.sections.updateSection(currentSectionToEdit.sectionId, sectionFormData);
        setSnackbar({ open: true, message: 'Section updated successfully!', severity: 'success' });
      } else {
        console.log('Creating section:', sectionFormData);
        // CORRECTED: Call the metadata sections service for create
        await apiService.metadata.sections.createSection(sectionFormData);
        setSnackbar({ open: true, message: 'Section created successfully!', severity: 'success' });
      }
      handleCloseSectionDialog();
      fetchDepartmentsAndSections();
    } catch (error) {
      console.error('Section save error:', error);
      const errorMessage = error.response?.data?.message || error.message || 'Failed to save section.';
      setSnackbar({ open: true, message: errorMessage, severity: 'error' });
    } finally {
      setLoading(false);
    }
  };

  // --- Delete Handlers ---
  const handleOpenDeleteConfirm = (item, type) => {
    console.log('Opening delete confirm for:', { item, type });
    if (type === 'department' && !hasPrivilege('department.delete')) {
      setSnackbar({ open: true, message: "Permission denied to delete departments.", severity: 'error' });
      return;
    }
    if (type === 'section' && !hasPrivilege('section.delete')) {
      setSnackbar({ open: true, message: "Permission denied to delete sections.", severity: 'error' });
      return;
    }
    const deleteItem = { 
      id: item.departmentId || item.sectionId, 
      name: item.name, 
      type 
    };
    console.log('Setting item to delete:', deleteItem);
    setDialogStateValue('itemToDelete', deleteItem);
    setDialogStateValue('openDeleteConfirmDialog', true);
  };

  const handleConfirmDelete = async () => {
    if (!itemToDelete) return;
    setLoading(true);
    setDialogStateValue('openDeleteConfirmDialog', false);
    try {
      if (itemToDelete.type === 'department') {
        console.log('Deleting department:', itemToDelete.id);
        await apiService.metadata.departments.deleteDepartment(itemToDelete.id);
        setSnackbar({ open: true, message: 'Department deleted successfully!', severity: 'success' });
      } else if (itemToDelete.type === 'section') {
        console.log('Deleting section:', itemToDelete.id);
        await apiService.metadata.sections.deleteSection(itemToDelete.id);
        setSnackbar({ open: true, message: 'Section deleted successfully!', severity: 'success' });
      }
      // Refresh the data after successful deletion
      await fetchDepartmentsAndSections();
    } catch (error) {
      console.error('Delete error:', error);
      const errorMessage = error.response?.data?.message || error.message || `Failed to delete ${itemToDelete.type}.`;
      setSnackbar({ open: true, message: errorMessage, severity: 'error' });
    } finally {
      setLoading(false);
      setDialogStateValue('itemToDelete', null);
    }
  };

  const handleCloseSnackbar = (event, reason) => {
    if (reason === 'clickaway') return;
    setSnackbar({ ...snackbar, open: false });
  };

  // Filter departments and sections based on global search
  const filteredDepartments = useMemo(() => {
    if (!globalSearch.trim()) {
      return departments;
    }

    const query = globalSearch.toLowerCase().trim();
    return departments
      .map(department => {
        // Check if department matches search
        const deptMatches = [
          department.departmentId?.toString() || '',
          department.name || '',
          department.alias || '',
          department.location || '',
          department.address || '',
          department.contactPerson || '',
          department.phoneNumber || '',
          department.email || '',
          department.remarks || '',
        ].some(field => field.toLowerCase().includes(query));

        // Filter sections that match search
        const filteredSections = department.sections?.filter(section => {
          const sectionMatches = [
            section.sectionId?.toString() || '',
            section.name || '',
            section.alias || '',
          ].some(field => field.toLowerCase().includes(query));
          return sectionMatches;
        }) || [];

        // Include department if it matches OR if any of its sections match
        if (deptMatches || filteredSections.length > 0) {
          return {
            ...department,
            sections: deptMatches ? department.sections : filteredSections, // Show all sections if dept matches, otherwise only matching sections
          };
        }
        return null;
      })
      .filter(dept => dept !== null);
  }, [departments, globalSearch]);

  // Calculate total count of matching items
  const totalMatches = useMemo(() => {
    if (!globalSearch.trim()) return { departments: departments.length, sections: departments.reduce((sum, dept) => sum + (dept.sections?.length || 0), 0) };
    
    let deptCount = filteredDepartments.length;
    let sectionCount = filteredDepartments.reduce((sum, dept) => sum + (dept.sections?.length || 0), 0);
    return { departments: deptCount, sections: sectionCount };
  }, [filteredDepartments, globalSearch, departments]);

  if (loading && departments.length === 0) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" component="h1" sx={{ color: theme.palette.primary.main, fontWeight: 'bold' }}>
          Departments & Sections
        </Typography>
        {hasPrivilege('department.create') && (
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={handleOpenCreateDeptDialog}
            sx={{ backgroundColor: '#16a34a', '&:hover': { backgroundColor: '#15803d' }, color: 'white', fontWeight: 'semibold', borderRadius: '8px' }}
          >
            Add New Department
          </Button>
        )}
      </Box>

      {/* Global Search Bar */}
      <Paper 
        elevation={2} 
        sx={{ 
          p: 2, 
          mb: 3, 
          backgroundColor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.02)',
          borderRadius: 2
        }}
      >
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} md={6}>
            <TextField
              fullWidth
              size="small"
              placeholder="Search departments and sections by name, alias, location, contact, email..."
              value={globalSearch}
              onChange={(e) => setGlobalSearch(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon />
                  </InputAdornment>
                ),
                endAdornment: globalSearch && (
                  <InputAdornment position="end">
                    <IconButton
                      size="small"
                      onClick={() => setGlobalSearch('')}
                      edge="end"
                    >
                      <ClearIcon fontSize="small" />
                    </IconButton>
                  </InputAdornment>
                ),
              }}
              sx={{
                backgroundColor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.1)' : 'white',
                '& .MuiOutlinedInput-root': {
                  '&:hover fieldset': {
                    borderColor: theme.palette.primary.main,
                  },
                },
              }}
            />
          </Grid>
          {globalSearch && (
            <Grid item xs={12} md={6}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                <Chip
                  label={`${totalMatches.departments} department${totalMatches.departments !== 1 ? 's' : ''}`}
                  color="primary"
                  size="small"
                  icon={<SearchIcon />}
                />
                <Chip
                  label={`${totalMatches.sections} section${totalMatches.sections !== 1 ? 's' : ''}`}
                  color="secondary"
                  size="small"
                />
                {totalMatches.departments < departments.length && (
                  <Typography variant="caption" color="text.secondary">
                    (filtered from {departments.length} total)
                  </Typography>
                )}
              </Box>
            </Grid>
          )}
        </Grid>
      </Paper>

      {departments.length === 0 ? (
        <Alert severity="info">No departments found. Add a new department to get started.</Alert>
      ) : filteredDepartments.length === 0 && globalSearch ? (
        <Alert severity="info">
          No departments or sections found matching "{globalSearch}". Try a different search term.
        </Alert>
      ) : (
        <TableContainer component={Paper} sx={{ borderRadius: '8px', overflow: 'hidden', boxShadow: theme.shadows[2] }}>
          <Table>
            <TableHead>
              <TableRow sx={{ backgroundColor: theme.palette.primary.main }}>
                <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Department</TableCell>
                <TableCell align="right" sx={{ color: 'white', fontWeight: 'bold' }}>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredDepartments.map((department) => (
                <TableRow key={department.departmentId}>
                  <TableCell colSpan={2} sx={{ p: 0, borderBottom: 'none' }}>
                    <Accordion sx={{ boxShadow: 'none', '&:nth-of-type(odd)': { backgroundColor: theme.palette.action.hover } }}>
                      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                        <Grid container alignItems="center">
                          <Grid item xs={8}>
                            <Box>
                              <Typography variant="body2" sx={{ fontWeight: 'bold' }}>{department.name}</Typography>
                              <Typography variant="caption" color="text.secondary">{department.alias} - {department.location}</Typography>
                            </Box>
                          </Grid>
                          <Grid item xs={4} sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
                            {hasPrivilege('department.update') && (
                              <IconButton onClick={(e) => { e.stopPropagation(); handleOpenEditDeptDialog(department); }} color="primary">
                                <EditIcon fontSize="small" />
                              </IconButton>
                            )}
                            {hasPrivilege('department.delete') && (
                              <IconButton onClick={(e) => { e.stopPropagation(); handleOpenDeleteConfirm(department, 'department'); }} color="error">
                                <DeleteIcon fontSize="small" />
                              </IconButton>
                            )}
                          </Grid>
                        </Grid>
                      </AccordionSummary>
                      <AccordionDetails sx={{ py: 1 }}>
                        <Box sx={{ pl: 4, pr: 2, pt: 2, pb: 4 }}>
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                            <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>Sections for {department.name}</Typography>
                            {hasPrivilege('section.create') && (
                                <Button
                                  variant="contained"
                                  size="small"
                                  startIcon={<AddIcon />}
                                  onClick={() => handleOpenCreateSectionDialog(department.departmentId)}
                                >
                                  Add Section
                                </Button>
                            )}
                          </Box>
                          <TableContainer component={Paper} sx={{ mb: 2, boxShadow: theme.shadows[1] }}>
                            <Table size="small">
                              <TableHead>
                                <TableRow sx={{ backgroundColor: theme.palette.secondary.main }}>
                                  <TableCell sx={{ fontWeight: 'bold', color: 'white' }}>ID</TableCell>
                                  <TableCell sx={{ fontWeight: 'bold', color: 'white' }}>Name</TableCell>
                                  <TableCell sx={{ fontWeight: 'bold', color: 'white' }}>Alias</TableCell>
                                  <TableCell align="right" sx={{ fontWeight: 'bold', color: 'white' }}>Actions</TableCell>
                                </TableRow>
                              </TableHead>
                              <TableBody>
                                {department.sections.map((section) => (
                                  <TableRow key={section.sectionId}>
                                    <TableCell>{section.sectionId}</TableCell>
                                    <TableCell>{section.name}</TableCell>
                                    <TableCell>{section.alias}</TableCell>
                                    <TableCell align="right">
                                      <Stack direction="row" spacing={1} justifyContent="flex-end">
                                        {hasPrivilege('section.update') && (
                                          <IconButton onClick={() => handleOpenEditSectionDialog(section)} color="primary">
                                            <EditIcon fontSize="small" />
                                          </IconButton>
                                        )}
                                        {hasPrivilege('section.delete') && (
                                          <IconButton onClick={() => handleOpenDeleteConfirm(section, 'section')} color="error">
                                            <DeleteIcon fontSize="small" />
                                          </IconButton>
                                        )}
                                      </Stack>
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </TableContainer>
                        </Box>
                      </AccordionDetails>
                    </Accordion>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Add/Edit Department Dialog */}
      <Dialog open={openDeptDialog} onClose={() => setDialogStateValue('openDeptDialog', false)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ backgroundColor: theme.palette.primary.main, color: 'white' }}>
          {currentDeptToEdit ? 'Edit Department' : 'Add New Department'}
        </DialogTitle>
        <DialogContent dividers sx={{ backgroundColor: theme.palette.background.default }}>
          <TextField
            autoFocus
            margin="dense"
            name="name"
            label="Department Name"
            type="text"
            fullWidth
            variant="outlined"
            value={deptFormData.name}
            onChange={handleDeptFormChange}
            error={!!deptFormErrors.name}
            helperText={deptFormErrors.name}
            sx={{ mb: 2 }}
          />
          <TextField
            margin="dense"
            name="alias"
            label="Alias"
            type="text"
            fullWidth
            variant="outlined"
            value={deptFormData.alias}
            onChange={handleDeptFormChange}
            sx={{ mb: 2 }}
          />
          <TextField
            margin="dense"
            name="location"
            label="Location"
            type="text"
            fullWidth
            variant="outlined"
            value={deptFormData.location}
            onChange={handleDeptFormChange}
            sx={{ mb: 2 }}
          />
          <TextField
            margin="dense"
            name="address"
            label="Address"
            type="text"
            fullWidth
            variant="outlined"
            value={deptFormData.address}
            onChange={handleDeptFormChange}
            sx={{ mb: 2 }}
          />
          <TextField
            margin="dense"
            name="contactPerson"
            label="Contact Person"
            type="text"
            fullWidth
            variant="outlined"
            value={deptFormData.contactPerson}
            onChange={handleDeptFormChange}
            sx={{ mb: 2 }}
          />
          <TextField
            margin="dense"
            name="phoneNumber"
            label="Phone Number"
            type="text"
            fullWidth
            variant="outlined"
            value={deptFormData.phoneNumber}
            onChange={handleDeptFormChange}
            sx={{ mb: 2 }}
          />
          <TextField
            margin="dense"
            name="email"
            label="Email"
            type="email"
            fullWidth
            variant="outlined"
            value={deptFormData.email}
            onChange={handleDeptFormChange}
            error={!!deptFormErrors.email}
            helperText={deptFormErrors.email}
            sx={{ mb: 2 }}
          />
          <TextField
            margin="dense"
            name="remarks"
            label="Remarks"
            type="text"
            fullWidth
            variant="outlined"
            multiline
            rows={3}
            value={deptFormData.remarks}
            onChange={handleDeptFormChange}
            sx={{ mb: 2 }}
          />
        </DialogContent>
        <DialogActions sx={{ padding: '16px 24px' }}>
          <Button onClick={() => setDialogStateValue('openDeptDialog', false)} color="primary" variant="outlined">Cancel</Button>
          <Button onClick={handleDeptSubmit} color="primary" variant="contained">{currentDeptToEdit ? 'Update Department' : 'Create Department'}</Button>
        </DialogActions>
      </Dialog>

      {/* Add/Edit Section Dialog - Now used for both actions */}
      <Dialog open={openSectionDialog} onClose={handleCloseSectionDialog} fullWidth maxWidth="sm">
        <DialogTitle sx={{ backgroundColor: theme.palette.primary.main, color: 'white' }}>
          {currentSectionToEdit?.sectionId ? 'Edit Section' : 'Add New Section'}
        </DialogTitle>
        <DialogContent dividers sx={{ backgroundColor: theme.palette.background.default }}>
          <TextField
            autoFocus
            margin="dense"
            name="name"
            label="Section Name"
            type="text"
            fullWidth
            variant="outlined"
            value={sectionFormData.name}
            onChange={handleSectionFormChange}
            error={!!sectionFormErrors.name}
            helperText={sectionFormErrors.name}
            sx={{ mb: 2 }}
          />
          <TextField
            margin="dense"
            name="alias"
            label="Alias"
            type="text"
            fullWidth
            variant="outlined"
            value={sectionFormData.alias}
            onChange={handleSectionFormChange}
            sx={{ mb: 2 }}
          />
        </DialogContent>
        <DialogActions sx={{ padding: '16px 24px' }}>
          <Button onClick={handleCloseSectionDialog} color="primary" variant="outlined">Cancel</Button>
          <Button onClick={handleSectionSubmit} color="primary" variant="contained">{currentSectionToEdit?.sectionId ? 'Update Section' : 'Create Section'}</Button>
        </DialogActions>
      </Dialog>

      <DeleteConfirmDialog
        open={openDeleteConfirmDialog}
        onClose={() => setDialogStateValue('openDeleteConfirmDialog', false)}
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

// Counties, Subcounties & Wards Management Component (hierarchical)
const SubcountyManagement = () => {
  const { hasPrivilege, user } = useAuth();
  const theme = useTheme();
  const [counties, setCounties] = useState([]);
  const [subcounties, setSubcounties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
  const [openCountyDialog, setOpenCountyDialog] = useState(false);
  const [openSubcountyDialog, setOpenSubcountyDialog] = useState(false);
  const [openWardDialog, setOpenWardDialog] = useState(false);
  const [openDeleteDialog, setOpenDeleteDialog] = useState(false);
  const [currentCounty, setCurrentCounty] = useState(null);
  const [currentSubcounty, setCurrentSubcounty] = useState(null);
  const [currentWard, setCurrentWard] = useState(null);
  const [itemToDelete, setItemToDelete] = useState(null);
  const [countyFormData, setCountyFormData] = useState({ name: '', geoLat: '', geoLon: '', remarks: '' });
  const [subcountyFormData, setSubcountyFormData] = useState({ name: '', countyId: '', geoLat: '', geoLon: '' });
  const [wardFormData, setWardFormData] = useState({ name: '', subcountyId: '', geoLat: '', geoLon: '', remarks: '' });
  const [countyFormErrors, setCountyFormErrors] = useState({});
  const [subcountyFormErrors, setSubcountyFormErrors] = useState({});
  const [wardFormErrors, setWardFormErrors] = useState({});

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [countiesData, subcountiesData] = await Promise.all([
        metaDataService.counties.getAllCounties(),
        metaDataService.subcounties.getAllSubcounties()
      ]);
      
      // Fetch subcounties for each county and wards for each subcounty
      const countiesWithSubcounties = await Promise.all(
        countiesData.map(async (county) => {
          try {
            const countySubcounties = subcountiesData.filter(sc => sc.countyId === county.countyId);
            const subcountiesWithWards = await Promise.all(
              countySubcounties.map(async (subcounty) => {
                try {
                  const wards = await metaDataService.subcounties.getWardsBySubcounty(subcounty.subcountyId);
                  return { ...subcounty, wards: wards || [] };
                } catch (error) {
                  console.error(`Error fetching wards for subcounty ${subcounty.subcountyId}:`, error);
                  return { ...subcounty, wards: [] };
                }
              })
            );
            return { ...county, subcounties: subcountiesWithWards };
          } catch (error) {
            console.error(`Error processing county ${county.countyId}:`, error);
            return { ...county, subcounties: [] };
          }
        })
      );
      
      setCounties(countiesWithSubcounties);
      setSubcounties(subcountiesData);
    } catch (error) {
      console.error('Error fetching data:', error);
      setSnackbar({ open: true, message: 'Failed to load data.', severity: 'error' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // County handlers
  const handleOpenCreateCountyDialog = () => {
    setCurrentCounty(null);
    setCountyFormData({ name: '', geoLat: '', geoLon: '', remarks: '' });
    setCountyFormErrors({});
    setOpenCountyDialog(true);
  };

  const handleOpenEditCountyDialog = (county) => {
    setCurrentCounty(county);
    setCountyFormData({
      name: county.name || '',
      geoLat: county.geoLat || '',
      geoLon: county.geoLon || '',
      remarks: county.remarks || ''
    });
    setCountyFormErrors({});
    setOpenCountyDialog(true);
  };

  const handleCountyFormChange = (e) => {
    const { name, value } = e.target;
    setCountyFormData(prev => ({ ...prev, [name]: value }));
    if (countyFormErrors[name]) {
      setCountyFormErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  const validateCountyForm = () => {
    let errors = {};
    if (!countyFormData.name?.trim()) {
      errors.name = 'Name is required.';
    }
    setCountyFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleCountySubmit = async () => {
    if (!validateCountyForm()) {
      setSnackbar({ open: true, message: 'Please correct the form errors.', severity: 'error' });
      return;
    }
    setLoading(true);
    try {
      if (currentCounty) {
        await metaDataService.counties.updateCounty(currentCounty.countyId, countyFormData);
        setSnackbar({ open: true, message: 'County updated successfully!', severity: 'success' });
      } else {
        await metaDataService.counties.createCounty(countyFormData);
        setSnackbar({ open: true, message: 'County created successfully!', severity: 'success' });
      }
      setOpenCountyDialog(false);
      fetchData();
    } catch (error) {
      console.error('County save error:', error);
      const errorMessage = error.response?.data?.message || error.message || 'Failed to save county.';
      setSnackbar({ open: true, message: errorMessage, severity: 'error' });
    } finally {
      setLoading(false);
    }
  };

  // Subcounty handlers
  const handleOpenCreateSubcountyDialog = (countyId = null) => {
    setCurrentSubcounty(null);
    const defaultCountyId = countyId ? String(countyId) : (counties.length > 0 ? String(counties[0].countyId) : '');
    setSubcountyFormData({ name: '', countyId: defaultCountyId, geoLat: '', geoLon: '' });
    setSubcountyFormErrors({});
    setOpenSubcountyDialog(true);
  };

  const handleOpenEditSubcountyDialog = (subcounty) => {
    setCurrentSubcounty(subcounty);
    setSubcountyFormData({
      name: subcounty.name || '',
      countyId: subcounty.countyId != null ? String(subcounty.countyId) : '',
      geoLat: subcounty.geoLat || '',
      geoLon: subcounty.geoLon || ''
    });
    setSubcountyFormErrors({});
    setOpenSubcountyDialog(true);
  };

  const handleSubcountyFormChange = (e) => {
    const { name, value } = e.target;
    // Ensure countyId is stored as a string for consistency with Select component
    const processedValue = name === 'countyId' ? String(value) : value;
    setSubcountyFormData(prev => ({ ...prev, [name]: processedValue }));
    if (subcountyFormErrors[name]) {
      setSubcountyFormErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  const validateSubcountyForm = () => {
    let errors = {};
    if (!subcountyFormData.name?.trim()) {
      errors.name = 'Name is required.';
    }
    if (!subcountyFormData.countyId) {
      errors.countyId = 'County is required.';
    }
    setSubcountyFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubcountySubmit = async () => {
    if (!validateSubcountyForm()) {
      setSnackbar({ open: true, message: 'Please correct the form errors.', severity: 'error' });
      return;
    }
    setLoading(true);
    try {
      // Convert countyId back to number for API call
      const submitData = {
        ...subcountyFormData,
        countyId: subcountyFormData.countyId ? parseInt(subcountyFormData.countyId, 10) : null
      };
      
      if (currentSubcounty) {
        await metaDataService.subcounties.updateSubcounty(currentSubcounty.subcountyId, submitData);
        setSnackbar({ open: true, message: 'Subcounty updated successfully!', severity: 'success' });
      } else {
        await metaDataService.subcounties.createSubcounty(submitData);
        setSnackbar({ open: true, message: 'Subcounty created successfully!', severity: 'success' });
      }
      setOpenSubcountyDialog(false);
      fetchData();
    } catch (error) {
      console.error('Subcounty save error:', error);
      const errorMessage = error.response?.data?.message || error.message || 'Failed to save subcounty.';
      setSnackbar({ open: true, message: errorMessage, severity: 'error' });
    } finally {
      setLoading(false);
    }
  };

  // Ward handlers
  const handleOpenCreateWardDialog = (subcountyId) => {
    setCurrentWard(null);
    setWardFormData({ name: '', subcountyId, geoLat: '', geoLon: '', remarks: '' });
    setWardFormErrors({});
    setOpenWardDialog(true);
  };

  const handleOpenEditWardDialog = (ward) => {
    setCurrentWard(ward);
    setWardFormData({
      name: ward.name || '',
      subcountyId: ward.subcountyId || '',
      geoLat: ward.geoLat || '',
      geoLon: ward.geoLon || '',
      remarks: ward.remarks || ''
    });
    setWardFormErrors({});
    setOpenWardDialog(true);
  };

  const handleWardFormChange = (e) => {
    const { name, value } = e.target;
    setWardFormData(prev => ({ ...prev, [name]: value }));
    if (wardFormErrors[name]) {
      setWardFormErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  const validateWardForm = () => {
    let errors = {};
    if (!wardFormData.name?.trim()) {
      errors.name = 'Name is required.';
    }
    if (!wardFormData.subcountyId) {
      errors.subcountyId = 'Subcounty is required.';
    }
    setWardFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleWardSubmit = async () => {
    if (!validateWardForm()) {
      setSnackbar({ open: true, message: 'Please correct the form errors.', severity: 'error' });
      return;
    }
    setLoading(true);
    try {
      if (currentWard) {
        await metaDataService.wards.updateWard(currentWard.wardId, wardFormData);
        setSnackbar({ open: true, message: 'Ward updated successfully!', severity: 'success' });
      } else {
        await metaDataService.wards.createWard(wardFormData);
        setSnackbar({ open: true, message: 'Ward created successfully!', severity: 'success' });
      }
      setOpenWardDialog(false);
      fetchData();
    } catch (error) {
      console.error('Ward save error:', error);
      const errorMessage = error.response?.data?.message || error.message || 'Failed to save ward.';
      setSnackbar({ open: true, message: errorMessage, severity: 'error' });
    } finally {
      setLoading(false);
    }
  };

  // Delete handlers
  const handleOpenDeleteDialog = (item, type) => {
    setItemToDelete({ ...item, type });
    setOpenDeleteDialog(true);
  };

  const handleConfirmDelete = async () => {
    if (!itemToDelete) return;
    setLoading(true);
    setOpenDeleteDialog(false);
    try {
      if (itemToDelete.type === 'county') {
        await metaDataService.counties.deleteCounty(itemToDelete.countyId);
        setSnackbar({ open: true, message: 'County deleted successfully!', severity: 'success' });
      } else if (itemToDelete.type === 'subcounty') {
        await metaDataService.subcounties.deleteSubcounty(itemToDelete.subcountyId);
        setSnackbar({ open: true, message: 'Subcounty deleted successfully!', severity: 'success' });
      } else if (itemToDelete.type === 'ward') {
        await metaDataService.wards.deleteWard(itemToDelete.wardId);
        setSnackbar({ open: true, message: 'Ward deleted successfully!', severity: 'success' });
      }
      fetchData();
    } catch (error) {
      console.error('Delete error:', error);
      const errorMessage = error.response?.data?.message || error.message || `Failed to delete ${itemToDelete.type}.`;
      setSnackbar({ open: true, message: errorMessage, severity: 'error' });
    } finally {
      setLoading(false);
      setItemToDelete(null);
    }
  };

  const handleCloseSnackbar = (event, reason) => {
    if (reason === 'clickaway') return;
    setSnackbar({ ...snackbar, open: false });
  };

  if (loading && counties.length === 0) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" component="h1" sx={{ color: theme.palette.primary.main, fontWeight: 'bold' }}>
          Counties, Subcounties & Wards
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={handleOpenCreateCountyDialog}
          sx={{ backgroundColor: '#16a34a', '&:hover': { backgroundColor: '#15803d' }, color: 'white', fontWeight: 'semibold', borderRadius: '8px' }}
        >
          Add New County
        </Button>
      </Box>

      {counties.length === 0 ? (
        <Alert severity="info">No counties found. Add a new county to get started.</Alert>
      ) : (
        <TableContainer component={Paper} sx={{ borderRadius: '8px', overflow: 'hidden', boxShadow: theme.shadows[2] }}>
          <Table>
            <TableHead>
              <TableRow sx={{ backgroundColor: theme.palette.primary.main }}>
                <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>County</TableCell>
                <TableCell align="right" sx={{ color: 'white', fontWeight: 'bold' }}>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {counties.map((county) => (
                <TableRow key={county.countyId}>
                  <TableCell colSpan={2} sx={{ p: 0, borderBottom: 'none' }}>
                    <Accordion sx={{ boxShadow: 'none', '&:nth-of-type(odd)': { backgroundColor: theme.palette.action.hover } }}>
                      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                        <Grid container alignItems="center">
                          <Grid item xs={8}>
                            <Box>
                              <Typography variant="body1" sx={{ fontWeight: 'bold' }}>{county.name}</Typography>
                              <Typography variant="caption" color="text.secondary">
                                {county.geoLat && county.geoLon ? `${county.geoLat}, ${county.geoLon}` : 'No coordinates'} 
                                {county.subcounties && county.subcounties.length > 0 && ` • ${county.subcounties.length} subcounty${county.subcounties.length !== 1 ? 'ies' : ''}`}
                              </Typography>
                            </Box>
                          </Grid>
                          <Grid item xs={4} sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
                            <IconButton onClick={(e) => { e.stopPropagation(); handleOpenEditCountyDialog(county); }} color="primary">
                              <EditIcon fontSize="small" />
                            </IconButton>
                            <IconButton onClick={(e) => { e.stopPropagation(); handleOpenDeleteDialog(county, 'county'); }} color="error">
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </Grid>
                        </Grid>
                      </AccordionSummary>
                      <AccordionDetails sx={{ py: 1 }}>
                        <Box sx={{ pl: 4, pr: 2, pt: 2, pb: 4 }}>
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                            <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>Subcounties for {county.name}</Typography>
                            <Button
                              variant="contained"
                              size="small"
                              startIcon={<AddIcon />}
                              onClick={() => handleOpenCreateSubcountyDialog(county.countyId)}
                            >
                              Add Subcounty
                            </Button>
                          </Box>
                          {county.subcounties && county.subcounties.length > 0 ? (
                            county.subcounties.map((subcounty) => (
                              <Accordion key={subcounty.subcountyId} sx={{ mb: 2, boxShadow: theme.shadows[1] }}>
                                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                                  <Grid container alignItems="center">
                                    <Grid item xs={8}>
                                      <Box>
                                        <Typography variant="body2" sx={{ fontWeight: 'bold' }}>{subcounty.name}</Typography>
                                        <Typography variant="caption" color="text.secondary">
                                          {subcounty.geoLat && subcounty.geoLon ? `${subcounty.geoLat}, ${subcounty.geoLon}` : 'No coordinates'}
                                          {subcounty.wards && subcounty.wards.length > 0 && ` • ${subcounty.wards.length} ward${subcounty.wards.length !== 1 ? 's' : ''}`}
                                        </Typography>
                                      </Box>
                                    </Grid>
                                    <Grid item xs={4} sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
                                      <IconButton onClick={(e) => { e.stopPropagation(); handleOpenEditSubcountyDialog(subcounty); }} color="primary">
                                        <EditIcon fontSize="small" />
                                      </IconButton>
                                      <IconButton onClick={(e) => { e.stopPropagation(); handleOpenDeleteDialog(subcounty, 'subcounty'); }} color="error">
                                        <DeleteIcon fontSize="small" />
                                      </IconButton>
                                    </Grid>
                                  </Grid>
                                </AccordionSummary>
                                <AccordionDetails sx={{ py: 1 }}>
                                  <Box sx={{ pl: 2, pr: 2, pt: 2, pb: 2 }}>
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                                      <Typography variant="subtitle2" sx={{ fontWeight: 'bold' }}>Wards for {subcounty.name}</Typography>
                                      <Button
                                        variant="contained"
                                        size="small"
                                        startIcon={<AddIcon />}
                                        onClick={() => handleOpenCreateWardDialog(subcounty.subcountyId)}
                                      >
                                        Add Ward
                                      </Button>
                                    </Box>
                                    <TableContainer component={Paper} sx={{ mb: 2, boxShadow: theme.shadows[1] }}>
                                      <Table size="small">
                                        <TableHead>
                                          <TableRow sx={{ backgroundColor: theme.palette.secondary.main }}>
                                            <TableCell sx={{ fontWeight: 'bold', color: 'white' }}>ID</TableCell>
                                            <TableCell sx={{ fontWeight: 'bold', color: 'white' }}>Name</TableCell>
                                            <TableCell sx={{ fontWeight: 'bold', color: 'white' }}>Coordinates</TableCell>
                                            <TableCell align="right" sx={{ fontWeight: 'bold', color: 'white' }}>Actions</TableCell>
                                          </TableRow>
                                        </TableHead>
                                        <TableBody>
                                          {subcounty.wards && subcounty.wards.length > 0 ? (
                                            subcounty.wards.map((ward) => (
                                              <TableRow key={ward.wardId}>
                                                <TableCell>{ward.wardId}</TableCell>
                                                <TableCell>{ward.name}</TableCell>
                                                <TableCell>
                                                  {ward.geoLat && ward.geoLon 
                                                    ? `${ward.geoLat}, ${ward.geoLon}` 
                                                    : 'N/A'}
                                                </TableCell>
                                                <TableCell align="right">
                                                  <Stack direction="row" spacing={1} justifyContent="flex-end">
                                                    <IconButton onClick={() => handleOpenEditWardDialog(ward)} color="primary">
                                                      <EditIcon fontSize="small" />
                                                    </IconButton>
                                                    <IconButton onClick={() => handleOpenDeleteDialog(ward, 'ward')} color="error">
                                                      <DeleteIcon fontSize="small" />
                                                    </IconButton>
                                                  </Stack>
                                                </TableCell>
                                              </TableRow>
                                            ))
                                          ) : (
                                            <TableRow>
                                              <TableCell colSpan={4} align="center">
                                                <Typography variant="body2" color="text.secondary">
                                                  No wards found. Add a ward to get started.
                                                </Typography>
                                              </TableCell>
                                            </TableRow>
                                          )}
                                        </TableBody>
                                      </Table>
                                    </TableContainer>
                                  </Box>
                                </AccordionDetails>
                              </Accordion>
                            ))
                          ) : (
                            <Alert severity="info" sx={{ mt: 2 }}>
                              No subcounties found. Add a subcounty to get started.
                            </Alert>
                          )}
                        </Box>
                      </AccordionDetails>
                    </Accordion>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Add/Edit County Dialog */}
      <Dialog open={openCountyDialog} onClose={() => setOpenCountyDialog(false)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ backgroundColor: theme.palette.primary.main, color: 'white' }}>
          {currentCounty ? 'Edit County' : 'Add New County'}
        </DialogTitle>
        <DialogContent dividers sx={{ backgroundColor: theme.palette.background.default, pt: 2 }}>
          <TextField
            autoFocus
            margin="dense"
            name="name"
            label="County Name"
            type="text"
            fullWidth
            variant="outlined"
            value={countyFormData.name}
            onChange={handleCountyFormChange}
            error={!!countyFormErrors.name}
            helperText={countyFormErrors.name}
            sx={{ mb: 2 }}
          />
          <TextField
            margin="dense"
            name="geoLat"
            label="Latitude"
            type="text"
            fullWidth
            variant="outlined"
            value={countyFormData.geoLat}
            onChange={handleCountyFormChange}
            sx={{ mb: 2 }}
          />
          <TextField
            margin="dense"
            name="geoLon"
            label="Longitude"
            type="text"
            fullWidth
            variant="outlined"
            value={countyFormData.geoLon}
            onChange={handleCountyFormChange}
            sx={{ mb: 2 }}
          />
          <TextField
            margin="dense"
            name="remarks"
            label="Remarks"
            type="text"
            fullWidth
            variant="outlined"
            multiline
            rows={3}
            value={countyFormData.remarks}
            onChange={handleCountyFormChange}
            sx={{ mb: 2 }}
          />
        </DialogContent>
        <DialogActions sx={{ padding: '16px 24px' }}>
          <Button onClick={() => setOpenCountyDialog(false)} color="primary" variant="outlined">Cancel</Button>
          <Button onClick={handleCountySubmit} color="primary" variant="contained" disabled={loading}>
            {currentCounty ? 'Update County' : 'Create County'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Add/Edit Subcounty Dialog */}
      <Dialog open={openSubcountyDialog} onClose={() => setOpenSubcountyDialog(false)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ backgroundColor: theme.palette.primary.main, color: 'white' }}>
          {currentSubcounty ? 'Edit Subcounty' : 'Add New Subcounty'}
        </DialogTitle>
        <DialogContent dividers sx={{ backgroundColor: theme.palette.background.default, pt: 2 }}>
          <TextField
            autoFocus
            margin="dense"
            name="name"
            label="Subcounty Name"
            type="text"
            fullWidth
            variant="outlined"
            value={subcountyFormData.name}
            onChange={handleSubcountyFormChange}
            error={!!subcountyFormErrors.name}
            helperText={subcountyFormErrors.name}
            sx={{ mb: 2 }}
          />
          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel>County</InputLabel>
            <Select
              name="countyId"
              value={subcountyFormData.countyId || ''}
              onChange={handleSubcountyFormChange}
              label="County"
              error={!!subcountyFormErrors.countyId}
            >
              {counties.map((county) => (
                <MenuItem key={county.countyId} value={String(county.countyId)}>
                  {county.name}
                </MenuItem>
              ))}
            </Select>
            {subcountyFormErrors.countyId && (
              <Typography variant="caption" color="error" sx={{ mt: 0.5, ml: 1.75 }}>
                {subcountyFormErrors.countyId}
              </Typography>
            )}
          </FormControl>
          <TextField
            margin="dense"
            name="geoLat"
            label="Latitude"
            type="text"
            fullWidth
            variant="outlined"
            value={subcountyFormData.geoLat}
            onChange={handleSubcountyFormChange}
            sx={{ mb: 2 }}
          />
          <TextField
            margin="dense"
            name="geoLon"
            label="Longitude"
            type="text"
            fullWidth
            variant="outlined"
            value={subcountyFormData.geoLon}
            onChange={handleSubcountyFormChange}
            sx={{ mb: 2 }}
          />
        </DialogContent>
        <DialogActions sx={{ padding: '16px 24px' }}>
          <Button onClick={() => setOpenSubcountyDialog(false)} color="primary" variant="outlined">Cancel</Button>
          <Button onClick={handleSubcountySubmit} color="primary" variant="contained" disabled={loading}>
            {currentSubcounty ? 'Update Subcounty' : 'Create Subcounty'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Add/Edit Ward Dialog */}
      <Dialog open={openWardDialog} onClose={() => setOpenWardDialog(false)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ backgroundColor: theme.palette.primary.main, color: 'white' }}>
          {currentWard ? 'Edit Ward' : 'Add New Ward'}
        </DialogTitle>
        <DialogContent dividers sx={{ backgroundColor: theme.palette.background.default, pt: 2 }}>
          <TextField
            autoFocus
            margin="dense"
            name="name"
            label="Ward Name"
            type="text"
            fullWidth
            variant="outlined"
            value={wardFormData.name}
            onChange={handleWardFormChange}
            error={!!wardFormErrors.name}
            helperText={wardFormErrors.name}
            sx={{ mb: 2 }}
          />
          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel>Subcounty</InputLabel>
            <Select
              name="subcountyId"
              value={wardFormData.subcountyId}
              onChange={handleWardFormChange}
              label="Subcounty"
              error={!!wardFormErrors.subcountyId}
            >
              {subcounties.map((subcounty) => (
                <MenuItem key={subcounty.subcountyId} value={subcounty.subcountyId}>
                  {subcounty.name}
                </MenuItem>
              ))}
            </Select>
            {wardFormErrors.subcountyId && (
              <Typography variant="caption" color="error" sx={{ mt: 0.5, ml: 1.75 }}>
                {wardFormErrors.subcountyId}
              </Typography>
            )}
          </FormControl>
          <TextField
            margin="dense"
            name="geoLat"
            label="Latitude"
            type="text"
            fullWidth
            variant="outlined"
            value={wardFormData.geoLat}
            onChange={handleWardFormChange}
            sx={{ mb: 2 }}
          />
          <TextField
            margin="dense"
            name="geoLon"
            label="Longitude"
            type="text"
            fullWidth
            variant="outlined"
            value={wardFormData.geoLon}
            onChange={handleWardFormChange}
            sx={{ mb: 2 }}
          />
          <TextField
            margin="dense"
            name="remarks"
            label="Remarks"
            type="text"
            fullWidth
            variant="outlined"
            multiline
            rows={3}
            value={wardFormData.remarks}
            onChange={handleWardFormChange}
            sx={{ mb: 2 }}
          />
        </DialogContent>
        <DialogActions sx={{ padding: '16px 24px' }}>
          <Button onClick={() => setOpenWardDialog(false)} color="primary" variant="outlined">Cancel</Button>
          <Button onClick={handleWardSubmit} color="primary" variant="contained" disabled={loading}>
            {currentWard ? 'Update Ward' : 'Create Ward'}
          </Button>
        </DialogActions>
      </Dialog>

      <DeleteConfirmDialog
        open={openDeleteDialog}
        onClose={() => setOpenDeleteDialog(false)}
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

// Financial Year Management Component
const FinancialYearManagement = () => {
  const { hasPrivilege } = useAuth();
  const theme = useTheme();
  const [financialYears, setFinancialYears] = useState([]);
  const [loading, setLoading] = useState(true);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
  const [openDialog, setOpenDialog] = useState(false);
  const [openDeleteDialog, setOpenDeleteDialog] = useState(false);
  const [currentFinancialYear, setCurrentFinancialYear] = useState(null);
  const [itemToDelete, setItemToDelete] = useState(null);
  const [formData, setFormData] = useState({ finYearName: '', startDate: '', endDate: '', remarks: '' });
  const [formErrors, setFormErrors] = useState({});

  const fetchFinancialYears = useCallback(async () => {
    setLoading(true);
    try {
      const data = await metaDataService.financialYears.getAllFinancialYears();
      setFinancialYears(data || []);
    } catch (error) {
      console.error('Error fetching financial years:', error);
      setSnackbar({ open: true, message: 'Failed to load financial years.', severity: 'error' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFinancialYears();
  }, [fetchFinancialYears]);

  const handleOpenCreateDialog = () => {
    if (!hasPrivilege('financialyear.create')) {
      setSnackbar({ open: true, message: "Permission denied to create financial years.", severity: 'error' });
      return;
    }
    setCurrentFinancialYear(null);
    setFormData({ finYearName: '', startDate: '', endDate: '', remarks: '' });
    setFormErrors({});
    setOpenDialog(true);
  };

  const handleOpenEditDialog = (financialYear) => {
    if (!hasPrivilege('financialyear.update')) {
      setSnackbar({ open: true, message: "Permission denied to update financial years.", severity: 'error' });
      return;
    }
    setCurrentFinancialYear(financialYear);
    // Format dates for input fields (YYYY-MM-DD)
    const formatDateForInput = (dateString) => {
      if (!dateString) return '';
      const date = new Date(dateString);
      return date.toISOString().split('T')[0];
    };
    setFormData({
      finYearName: financialYear.finYearName || '',
      startDate: formatDateForInput(financialYear.startDate),
      endDate: formatDateForInput(financialYear.endDate),
      remarks: financialYear.remarks || ''
    });
    setFormErrors({});
    setOpenDialog(true);
  };

  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (formErrors[name]) {
      setFormErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  const validateForm = () => {
    let errors = {};
    if (!formData.finYearName?.trim()) {
      errors.finYearName = 'Financial Year Name is required.';
    }
    if (!formData.startDate) {
      errors.startDate = 'Start Date is required.';
    }
    if (!formData.endDate) {
      errors.endDate = 'End Date is required.';
    }
    if (formData.startDate && formData.endDate) {
      const start = new Date(formData.startDate);
      const end = new Date(formData.endDate);
      if (start >= end) {
        errors.endDate = 'End Date must be after Start Date.';
      }
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validateForm()) {
      setSnackbar({ open: true, message: 'Please correct the form errors.', severity: 'error' });
      return;
    }
    setLoading(true);
    try {
      if (currentFinancialYear) {
        await metaDataService.financialYears.updateFinancialYear(currentFinancialYear.finYearId, formData);
        setSnackbar({ open: true, message: 'Financial year updated successfully!', severity: 'success' });
      } else {
        await metaDataService.financialYears.createFinancialYear(formData);
        setSnackbar({ open: true, message: 'Financial year created successfully!', severity: 'success' });
      }
      setOpenDialog(false);
      fetchFinancialYears();
    } catch (error) {
      console.error('Financial year save error:', error);
      const errorMessage = error.response?.data?.message || error.message || 'Failed to save financial year.';
      setSnackbar({ open: true, message: errorMessage, severity: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDeleteDialog = (financialYear) => {
    if (!hasPrivilege('financialyear.delete')) {
      setSnackbar({ open: true, message: "Permission denied to delete financial years.", severity: 'error' });
      return;
    }
    setItemToDelete({ id: financialYear.finYearId, name: financialYear.finYearName, type: 'financial year' });
    setOpenDeleteDialog(true);
  };

  const handleConfirmDelete = async () => {
    if (!itemToDelete) return;
    setLoading(true);
    setOpenDeleteDialog(false);
    try {
      await metaDataService.financialYears.deleteFinancialYear(itemToDelete.id);
      setSnackbar({ open: true, message: 'Financial year deleted successfully!', severity: 'success' });
      fetchFinancialYears();
    } catch (error) {
      console.error('Delete error:', error);
      const errorMessage = error.response?.data?.message || error.message || 'Failed to delete financial year.';
      setSnackbar({ open: true, message: errorMessage, severity: 'error' });
    } finally {
      setLoading(false);
      setItemToDelete(null);
    }
  };

  const handleCloseSnackbar = (event, reason) => {
    if (reason === 'clickaway') return;
    setSnackbar({ ...snackbar, open: false });
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  if (loading && financialYears.length === 0) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" component="h1" sx={{ color: theme.palette.primary.main, fontWeight: 'bold' }}>
          Financial Years
        </Typography>
        {hasPrivilege('financialyear.create') && (
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={handleOpenCreateDialog}
            sx={{ backgroundColor: '#16a34a', '&:hover': { backgroundColor: '#15803d' }, color: 'white', fontWeight: 'semibold', borderRadius: '8px' }}
          >
            Add New Financial Year
          </Button>
        )}
      </Box>

      {financialYears.length === 0 ? (
        <Alert severity="info">No financial years found. Add a new financial year to get started.</Alert>
      ) : (
        <TableContainer component={Paper} sx={{ borderRadius: '8px', overflow: 'hidden', boxShadow: theme.shadows[2] }}>
          <Table>
            <TableHead sx={{ '& .MuiTableCell-root': { backgroundColor: theme.palette.primary.main, color: theme.palette.primary.contrastText, fontWeight: 'bold', borderBottom: 'none' } }}>
              <TableRow>
                <TableCell>ID</TableCell>
                <TableCell>Financial Year Name</TableCell>
                <TableCell>Start Date</TableCell>
                <TableCell>End Date</TableCell>
                <TableCell>Remarks</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {financialYears.map((fy) => (
                <TableRow key={fy.finYearId} sx={{ '&:nth-of-type(odd)': { backgroundColor: theme.palette.action.hover } }}>
                  <TableCell>{fy.finYearId}</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>{fy.finYearName}</TableCell>
                  <TableCell>{formatDate(fy.startDate)}</TableCell>
                  <TableCell>{formatDate(fy.endDate)}</TableCell>
                  <TableCell>{fy.remarks || 'N/A'}</TableCell>
                  <TableCell align="right">
                    <Stack direction="row" spacing={1} justifyContent="flex-end">
                      {hasPrivilege('financialyear.update') && (
                        <IconButton onClick={() => handleOpenEditDialog(fy)} color="primary">
                          <EditIcon fontSize="small" />
                        </IconButton>
                      )}
                      {hasPrivilege('financialyear.delete') && (
                        <IconButton onClick={() => handleOpenDeleteDialog(fy)} color="error">
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      )}
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Add/Edit Financial Year Dialog */}
      <Dialog open={openDialog} onClose={() => setOpenDialog(false)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ backgroundColor: theme.palette.primary.main, color: 'white' }}>
          {currentFinancialYear ? 'Edit Financial Year' : 'Add New Financial Year'}
        </DialogTitle>
        <DialogContent dividers sx={{ backgroundColor: theme.palette.background.default, pt: 2 }}>
          <TextField
            autoFocus
            margin="dense"
            name="finYearName"
            label="Financial Year Name"
            type="text"
            fullWidth
            variant="outlined"
            value={formData.finYearName}
            onChange={handleFormChange}
            error={!!formErrors.finYearName}
            helperText={formErrors.finYearName || 'e.g., FY2024/2025 or 2024/2025'}
            sx={{ mb: 2 }}
          />
          <TextField
            margin="dense"
            name="startDate"
            label="Start Date"
            type="date"
            fullWidth
            variant="outlined"
            value={formData.startDate}
            onChange={handleFormChange}
            error={!!formErrors.startDate}
            helperText={formErrors.startDate}
            InputLabelProps={{ shrink: true }}
            sx={{ mb: 2 }}
          />
          <TextField
            margin="dense"
            name="endDate"
            label="End Date"
            type="date"
            fullWidth
            variant="outlined"
            value={formData.endDate}
            onChange={handleFormChange}
            error={!!formErrors.endDate}
            helperText={formErrors.endDate}
            InputLabelProps={{ shrink: true }}
            sx={{ mb: 2 }}
          />
          <TextField
            margin="dense"
            name="remarks"
            label="Remarks"
            type="text"
            fullWidth
            variant="outlined"
            multiline
            rows={3}
            value={formData.remarks}
            onChange={handleFormChange}
            sx={{ mb: 2 }}
          />
        </DialogContent>
        <DialogActions sx={{ padding: '16px 24px' }}>
          <Button onClick={() => setOpenDialog(false)} color="primary" variant="outlined">Cancel</Button>
          <Button onClick={handleSubmit} color="primary" variant="contained" disabled={loading}>
            {currentFinancialYear ? 'Update Financial Year' : 'Create Financial Year'}
          </Button>
        </DialogActions>
      </Dialog>

      <DeleteConfirmDialog
        open={openDeleteDialog}
        onClose={() => setOpenDeleteDialog(false)}
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

const TaxRateManagement = () => {
  const { hasPrivilege, user } = useAuth();
  const theme = useTheme();
  const [rates, setRates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [openDialog, setOpenDialog] = useState(false);
  const [editingRate, setEditingRate] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
  const [formData, setFormData] = useState({
    taxType: 'vat',
    ratePercent: '',
    withholdingRate: '',
    effectiveFrom: new Date().toISOString().slice(0, 10),
    effectiveTo: '',
    notes: '',
  });

  const canManage = isSuperAdminUser(user) || hasPrivilege('admin.access');

  const loadRates = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await apiService.taxRates.getAll();
      setRates(Array.isArray(rows) ? rows : []);
    } catch (error) {
      setSnackbar({ open: true, message: 'Failed to load tax rates.', severity: 'error' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRates();
  }, [loadRates]);

  const openCreateDialog = () => {
    setEditingRate(null);
    setFormData({
      taxType: 'vat',
      ratePercent: '',
      withholdingRate: '',
      effectiveFrom: new Date().toISOString().slice(0, 10),
      effectiveTo: '',
      notes: '',
    });
    setOpenDialog(true);
  };

  const openEditDialog = (row) => {
    setEditingRate(row);
    setFormData({
      taxType: row.tax_type || 'vat',
      ratePercent: row.rate_percent ?? '',
      withholdingRate: row.withholding_rate ?? '',
      effectiveFrom: row.effective_from ? String(row.effective_from).slice(0, 10) : '',
      effectiveTo: row.effective_to ? String(row.effective_to).slice(0, 10) : '',
      notes: row.notes || '',
    });
    setOpenDialog(true);
  };

  const saveRate = async () => {
    if (!formData.taxType || formData.ratePercent === '' || formData.withholdingRate === '' || !formData.effectiveFrom) {
      setSnackbar({ open: true, message: 'Tax type, rate, withholding rate, and effective from date are required.', severity: 'error' });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        taxType: formData.taxType,
        ratePercent: Number(formData.ratePercent),
        withholdingRate: Number(formData.withholdingRate),
        effectiveFrom: formData.effectiveFrom,
        effectiveTo: formData.effectiveTo || null,
        notes: formData.notes || null,
      };
      if (editingRate?.id) {
        await apiService.taxRates.update(editingRate.id, payload);
        setSnackbar({ open: true, message: 'Tax rate updated.', severity: 'success' });
      } else {
        await apiService.taxRates.create(payload);
        setSnackbar({ open: true, message: 'Tax rate created.', severity: 'success' });
      }
      setOpenDialog(false);
      await loadRates();
    } catch (error) {
      setSnackbar({ open: true, message: error?.response?.data?.message || 'Failed to save tax rate.', severity: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const removeRate = async () => {
    if (!deleteTarget?.id) return;
    setSaving(true);
    try {
      await apiService.taxRates.remove(deleteTarget.id);
      setSnackbar({ open: true, message: 'Tax rate deleted.', severity: 'success' });
      setDeleteTarget(null);
      await loadRates();
    } catch (error) {
      setSnackbar({ open: true, message: error?.response?.data?.message || 'Failed to delete tax rate.', severity: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const formatTaxType = (taxType) => {
    const map = {
      vat: 'VAT',
      withholding_tax: 'Withholding Tax',
      retention: 'Retention',
    };
    return map[String(taxType || '').toLowerCase()] || taxType;
  };

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" component="h1" sx={{ color: theme.palette.primary.main, fontWeight: 'bold' }}>
          Tax Rate Table
        </Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={openCreateDialog} disabled={!canManage}>
          Add Tax Rate
        </Button>
      </Box>

      <Alert severity="info" sx={{ mb: 2 }}>
        Add effective-dated VAT, Withholding Tax, and Retention rates. Payment certificates will automatically use the rate active on the certificate date.
      </Alert>
      {!canManage && <Alert severity="warning" sx={{ mb: 2 }}>Only admin users can amend tax rates.</Alert>}

      {loading ? (
        <CircularProgress size={24} />
      ) : (
        <TableContainer component={Paper} sx={{ borderRadius: '8px', overflow: 'hidden', boxShadow: theme.shadows[2] }}>
          <Table size="small">
            <TableHead sx={{ '& .MuiTableCell-root': { backgroundColor: theme.palette.primary.main, color: theme.palette.primary.contrastText, fontWeight: 'bold', borderBottom: 'none' } }}>
              <TableRow>
                <TableCell>Tax Type</TableCell>
                <TableCell>Rate (%)</TableCell>
                <TableCell>Withholding Rate (%)</TableCell>
                <TableCell>Effective From</TableCell>
                <TableCell>Effective To</TableCell>
                <TableCell>Notes</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rates.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} align="center">
                    <Typography variant="body2" color="text.secondary">No tax rates configured yet.</Typography>
                  </TableCell>
                </TableRow>
              ) : (
                rates.map((row) => (
                  <TableRow key={row.id} sx={{ '&:nth-of-type(odd)': { backgroundColor: theme.palette.action.hover } }}>
                    <TableCell>{formatTaxType(row.tax_type)}</TableCell>
                    <TableCell>{Number(row.rate_percent || 0).toFixed(2)}</TableCell>
                    <TableCell>{Number(row.withholding_rate || 0).toFixed(2)}</TableCell>
                    <TableCell>{row.effective_from ? String(row.effective_from).slice(0, 10) : '-'}</TableCell>
                    <TableCell>{row.effective_to ? String(row.effective_to).slice(0, 10) : 'Open ended'}</TableCell>
                    <TableCell>{row.notes || '-'}</TableCell>
                    <TableCell align="right">
                      <Stack direction="row" spacing={1} justifyContent="flex-end">
                        <IconButton onClick={() => openEditDialog(row)} color="primary" disabled={!canManage}>
                          <EditIcon fontSize="small" />
                        </IconButton>
                        <IconButton onClick={() => setDeleteTarget(row)} color="error" disabled={!canManage}>
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <Dialog open={openDialog} onClose={() => setOpenDialog(false)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ backgroundColor: theme.palette.primary.main, color: 'white' }}>
          {editingRate ? 'Edit Tax Rate' : 'Add Tax Rate'}
        </DialogTitle>
        <DialogContent dividers sx={{ backgroundColor: theme.palette.background.default, pt: 2 }}>
          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel>Tax Type</InputLabel>
            <Select
              value={formData.taxType}
              label="Tax Type"
              onChange={(e) => setFormData((p) => ({ ...p, taxType: e.target.value }))}
            >
              <MenuItem value="vat">VAT</MenuItem>
              <MenuItem value="withholding_tax">Withholding Tax</MenuItem>
              <MenuItem value="retention">Retention</MenuItem>
            </Select>
          </FormControl>
          <TextField
            fullWidth
            label="Rate (%)"
            type="number"
            value={formData.ratePercent}
            onChange={(e) => setFormData((p) => ({ ...p, ratePercent: e.target.value }))}
            inputProps={{ min: 0, step: 0.01 }}
            sx={{ mb: 2 }}
          />
          <TextField
            fullWidth
            label="Withholding Rate (%)"
            type="number"
            value={formData.withholdingRate}
            onChange={(e) => setFormData((p) => ({ ...p, withholdingRate: e.target.value }))}
            inputProps={{ min: 0, step: 0.01 }}
            helperText="Example: VAT rate 16, withholding rate 2."
            sx={{ mb: 2 }}
          />
          <TextField
            fullWidth
            label="Effective From"
            type="date"
            value={formData.effectiveFrom}
            onChange={(e) => setFormData((p) => ({ ...p, effectiveFrom: e.target.value }))}
            InputLabelProps={{ shrink: true }}
            sx={{ mb: 2 }}
          />
          <TextField
            fullWidth
            label="Effective To"
            type="date"
            value={formData.effectiveTo}
            onChange={(e) => setFormData((p) => ({ ...p, effectiveTo: e.target.value }))}
            InputLabelProps={{ shrink: true }}
            helperText="Optional. Leave empty for an open-ended rate."
            sx={{ mb: 2 }}
          />
          <TextField
            fullWidth
            label="Notes"
            multiline
            minRows={2}
            value={formData.notes}
            onChange={(e) => setFormData((p) => ({ ...p, notes: e.target.value }))}
          />
        </DialogContent>
        <DialogActions sx={{ padding: '16px 24px' }}>
          <Button onClick={() => setOpenDialog(false)} color="primary" variant="outlined">Cancel</Button>
          <Button onClick={saveRate} color="primary" variant="contained" disabled={!canManage || saving}>
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>

      <DeleteConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={removeRate}
        itemToDeleteName={`${formatTaxType(deleteTarget?.tax_type)} ${deleteTarget?.effective_from ? `(${String(deleteTarget.effective_from).slice(0, 10)})` : ''}`}
        itemType="tax rate"
      />

      <Snackbar open={snackbar.open} autoHideDuration={5000} onClose={() => setSnackbar((p) => ({ ...p, open: false }))}>
        <Alert onClose={() => setSnackbar((p) => ({ ...p, open: false }))} severity={snackbar.severity} sx={{ width: '100%' }}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

const SessionSecuritySettings = () => {
  const { user } = useAuth();
  const [value, setValue] = useState(60);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
  const canManage = isSuperAdminUser(user);

  const loadPolicy = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiService.auth.getSessionPolicy();
      const mins = parseInt(String(data?.idleTimeoutMinutes), 10);
      setValue(Number.isFinite(mins) && mins > 0 ? mins : 60);
    } catch (error) {
      setSnackbar({
        open: true,
        message: error?.response?.data?.error || error?.message || 'Failed to load session policy.',
        severity: 'error',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPolicy();
  }, [loadPolicy]);

  const handleSave = async () => {
    const mins = parseInt(String(value), 10);
    if (!Number.isFinite(mins) || mins < 1 || mins > 1440) {
      setSnackbar({ open: true, message: 'Idle timeout must be between 1 and 1440 minutes.', severity: 'error' });
      return;
    }
    setSaving(true);
    try {
      await apiService.auth.updateSessionPolicy(mins);
      setSnackbar({ open: true, message: 'Idle timeout policy updated successfully.', severity: 'success' });
    } catch (error) {
      setSnackbar({
        open: true,
        message: error?.response?.data?.error || error?.message || 'Failed to update session policy.',
        severity: 'error',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box sx={{ p: 3, maxWidth: 680 }}>
      <Typography variant="h5" sx={{ fontWeight: 'bold', mb: 1 }}>
        Session Security
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Configure automatic logout after user inactivity. This applies to all users.
      </Typography>

      {loading ? (
        <CircularProgress size={24} />
      ) : (
        <Stack spacing={2}>
          <TextField
            label="Idle timeout (minutes)"
            type="number"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            inputProps={{ min: 1, max: 1440 }}
            helperText="Minimum 1 minute, maximum 1440 minutes (24 hours)."
            disabled={!canManage}
          />
          {!canManage && (
            <Alert severity="info">Only Super Admin can change idle timeout policy.</Alert>
          )}
          <Box>
            <Button variant="contained" onClick={handleSave} disabled={!canManage || saving}>
              {saving ? 'Saving...' : 'Save Policy'}
            </Button>
          </Box>
        </Stack>
      )}

      <Snackbar
        open={snackbar.open}
        autoHideDuration={5000}
        onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
      >
        <Alert
          onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
          severity={snackbar.severity}
          sx={{ width: '100%' }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};


// Main Settings Page with Tabs
const SettingsPage = () => {
  const theme = useTheme();
  const [currentTab, setCurrentTab] = useState(0);

  const handleTabChange = (event, newValue) => {
    setCurrentTab(newValue);
  };

  return (
    <Box sx={{ width: '100%' }}>
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
        <Tabs
          value={currentTab}
          onChange={handleTabChange}
          aria-label="metadata management tabs"
          variant="scrollable"
          scrollButtons="auto"
          allowScrollButtonsMobile
        >
          <Tab icon={<LocationCityIcon />} label="Departments & Sections" iconPosition="start" />
          <Tab icon={<MapIcon />} label="Counties, Subcounties & Wards" iconPosition="start" />
          <Tab icon={<CalendarTodayIcon />} label="Financial Years" iconPosition="start" />
          <Tab icon={<PercentIcon />} label="Tax Rates" iconPosition="start" />
          <Tab icon={<SecurityIcon />} label="Session Security" iconPosition="start" />
        </Tabs>
      </Box>
      {currentTab === 0 && <DepartmentAndSectionManagement />}
      {currentTab === 1 && <SubcountyManagement />}
      {currentTab === 2 && <FinancialYearManagement />}
      {currentTab === 3 && <TaxRateManagement />}
      {currentTab === 4 && <SessionSecuritySettings />}
    </Box>
  );
};

export default SettingsPage;