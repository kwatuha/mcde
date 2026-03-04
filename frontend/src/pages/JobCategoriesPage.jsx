import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Button, TextField, Dialog, DialogTitle,
  DialogContent, DialogActions, Paper, CircularProgress, IconButton,
  Snackbar, Alert, Stack, useTheme, Grid, Card, CardContent,
} from '@mui/material';
import { DataGrid } from "@mui/x-data-grid";
import { 
  Add as AddIcon, 
  Edit as EditIcon, 
  Delete as DeleteIcon, 
  Work as WorkIcon,
  Search as SearchIcon,
  Clear as ClearIcon
} from '@mui/icons-material';
import axiosInstance from '../api/axiosInstance';
import { useAuth } from '../context/AuthContext.jsx';
import { tokens } from "./dashboard/theme";
import Header from "./dashboard/Header";

function JobCategoriesPage() {
  const { user, hasPrivilege } = useAuth();
  const theme = useTheme();
  const colors = tokens(theme.palette.mode);
  const isLight = theme.palette.mode === 'light';

  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
  const [searchQuery, setSearchQuery] = useState('');

  // Dialog states
  const [openDialog, setOpenDialog] = useState(false);
  const [currentCategory, setCurrentCategory] = useState(null);
  const [formData, setFormData] = useState({
    jobCategory: '',
    description: '',
  });
  const [formErrors, setFormErrors] = useState({});
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [categoryToDelete, setCategoryToDelete] = useState(null);

  // Fetch job categories
  const fetchCategories = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await axiosInstance.get('/job-categories');
      setCategories(response.data || []);
    } catch (err) {
      console.error('Error fetching job categories:', err);
      setError(err?.response?.data?.message || err.message || 'Failed to fetch job categories');
      setSnackbar({
        open: true,
        message: 'Failed to fetch job categories',
        severity: 'error'
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCategories();
  }, []);

  // Filter categories based on search
  const filteredCategories = categories.filter(cat => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      (cat.jobCategory || '').toLowerCase().includes(query) ||
      (cat.description || '').toLowerCase().includes(query)
    );
  });

  // Handle form input change
  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Clear error for this field
    if (formErrors[field]) {
      setFormErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  // Validate form
  const validateForm = () => {
    const errors = {};
    if (!formData.jobCategory.trim()) {
      errors.jobCategory = 'Job category name is required';
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Handle save (create or update)
  const handleSave = async () => {
    if (!validateForm()) return;

    try {
      if (currentCategory) {
        // Update
        await axiosInstance.put(`/job-categories/${currentCategory.id}`, formData);
        setSnackbar({
          open: true,
          message: 'Job category updated successfully',
          severity: 'success'
        });
      } else {
        // Create
        await axiosInstance.post('/job-categories', formData);
        setSnackbar({
          open: true,
          message: 'Job category created successfully',
          severity: 'success'
        });
      }
      setOpenDialog(false);
      resetForm();
      fetchCategories();
    } catch (err) {
      console.error('Error saving job category:', err);
      const errorMessage = err?.response?.data?.message || err.message || 'Failed to save job category';
      setSnackbar({
        open: true,
        message: errorMessage,
        severity: 'error'
      });
    }
  };

  // Handle delete
  const handleDelete = async () => {
    if (!categoryToDelete) return;

    try {
      await axiosInstance.delete(`/job-categories/${categoryToDelete.id}`);
      setSnackbar({
        open: true,
        message: 'Job category deleted successfully',
        severity: 'success'
      });
      setDeleteConfirmOpen(false);
      setCategoryToDelete(null);
      fetchCategories();
    } catch (err) {
      console.error('Error deleting job category:', err);
      setSnackbar({
        open: true,
        message: err?.response?.data?.message || 'Failed to delete job category',
        severity: 'error'
      });
    }
  };

  // Open dialog for create
  const handleCreate = () => {
    setCurrentCategory(null);
    resetForm();
    setOpenDialog(true);
  };

  // Open dialog for edit
  const handleEdit = (category) => {
    setCurrentCategory(category);
    setFormData({
      jobCategory: category.jobCategory || '',
      description: category.description || '',
    });
    setFormErrors({});
    setOpenDialog(true);
  };

  // Reset form
  const resetForm = () => {
    setFormData({
      jobCategory: '',
      description: '',
    });
    setFormErrors({});
    setCurrentCategory(null);
  };

  // DataGrid columns
  const columns = [
    {
      field: 'id',
      headerName: 'ID',
      width: 80,
      sortable: false,
    },
    {
      field: 'jobCategory',
      headerName: 'Job Category',
      flex: 1,
      minWidth: 200,
      editable: false,
    },
    {
      field: 'description',
      headerName: 'Description',
      flex: 2,
      minWidth: 300,
      editable: false,
      renderCell: (params) => (
        <Typography variant="body2" sx={{ 
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          maxWidth: '100%'
        }}>
          {params.value || '-'}
        </Typography>
      ),
    },
    {
      field: 'actions',
      headerName: 'Actions',
      width: 150,
      sortable: false,
      renderCell: (params) => (
        <Box sx={{ display: 'flex', gap: 1 }}>
          <IconButton
            size="small"
            onClick={() => handleEdit(params.row)}
            sx={{ color: colors.blueAccent[500] }}
          >
            <EditIcon fontSize="small" />
          </IconButton>
          <IconButton
            size="small"
            onClick={() => {
              setCategoryToDelete(params.row);
              setDeleteConfirmOpen(true);
            }}
            sx={{ color: colors.redAccent[500] }}
          >
            <DeleteIcon fontSize="small" />
          </IconButton>
        </Box>
      ),
    },
  ];

  return (
    <Box m="20px">
      <Header title="Job Categories" subtitle="Manage job opportunity categories" />
      
      {/* Summary Card */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" gap={2}>
                <WorkIcon sx={{ fontSize: 40, color: colors.blueAccent[500] }} />
                <Box>
                  <Typography variant="h4" fontWeight={600}>
                    {categories.length}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Total Categories
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Actions Bar */}
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
        <TextField
          placeholder="Search categories..."
          variant="outlined"
          size="small"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          InputProps={{
            startAdornment: <SearchIcon sx={{ mr: 1, color: 'text.secondary' }} />,
            endAdornment: searchQuery && (
              <IconButton
                size="small"
                onClick={() => setSearchQuery('')}
                sx={{ mr: -1 }}
              >
                <ClearIcon fontSize="small" />
              </IconButton>
            ),
          }}
          sx={{ width: 300 }}
        />
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={handleCreate}
          sx={{
            backgroundColor: colors.blueAccent[500],
            '&:hover': {
              backgroundColor: colors.blueAccent[600],
            },
          }}
        >
          Add Job Category
        </Button>
      </Box>

      {/* DataGrid */}
      <Paper sx={{ height: 600, width: '100%' }}>
        <DataGrid
          rows={filteredCategories}
          columns={columns}
          loading={loading}
          getRowId={(row) => row.id}
          pageSizeOptions={[10, 25, 50, 100]}
          initialState={{
            pagination: {
              paginationModel: { pageSize: 25 },
            },
          }}
          sx={{
            '& .MuiDataGrid-cell': {
              borderBottom: `1px solid ${isLight ? colors.grey[200] : colors.grey[700]}`,
            },
            '& .MuiDataGrid-columnHeaders': {
              backgroundColor: isLight ? colors.grey[100] : colors.grey[800],
              borderBottom: `2px solid ${isLight ? colors.grey[300] : colors.grey[700]}`,
            },
          }}
        />
      </Paper>

      {/* Create/Edit Dialog */}
      <Dialog open={openDialog} onClose={() => { setOpenDialog(false); resetForm(); }} maxWidth="sm" fullWidth>
        <DialogTitle>
          {currentCategory ? 'Edit Job Category' : 'Add Job Category'}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={3} sx={{ mt: 1 }}>
            <TextField
              label="Job Category"
              fullWidth
              required
              value={formData.jobCategory}
              onChange={(e) => handleInputChange('jobCategory', e.target.value)}
              error={!!formErrors.jobCategory}
              helperText={formErrors.jobCategory}
            />
            <TextField
              label="Description"
              fullWidth
              multiline
              rows={4}
              value={formData.description}
              onChange={(e) => handleInputChange('description', e.target.value)}
              error={!!formErrors.description}
              helperText={formErrors.description}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setOpenDialog(false); resetForm(); }}>
            Cancel
          </Button>
          <Button onClick={handleSave} variant="contained" color="primary">
            {currentCategory ? 'Update' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteConfirmOpen} onClose={() => setDeleteConfirmOpen(false)}>
        <DialogTitle>Confirm Delete</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete "{categoryToDelete?.jobCategory}"? This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConfirmOpen(false)}>Cancel</Button>
          <Button onClick={handleDelete} color="error" variant="contained">
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert onClose={() => setSnackbar({ ...snackbar, open: false })} severity={snackbar.severity}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}

export default JobCategoriesPage;
