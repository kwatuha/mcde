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
import { tokens } from "./dashboard/theme";
import Header from "./dashboard/Header";
import { getThemedDataGridSx } from '../utils/dataGridTheme';
import { useNavigationLayout } from '../context/NavigationLayoutContext.jsx';

function JobCategoriesPage() {
  const theme = useTheme();
  const { isTreeLayout } = useNavigationLayout();
  const isTreeGrid = isTreeLayout && theme.palette.mode === 'light';
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
        <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center', height: '100%' }}>
          <IconButton
            size="small"
            color="primary"
            onClick={() => handleEdit(params.row)}
            aria-label={`Edit ${params.row.jobCategory || 'category'}`}
          >
            <EditIcon fontSize="small" />
          </IconButton>
          <IconButton
            size="small"
            color="error"
            onClick={() => {
              setCategoryToDelete(params.row);
              setDeleteConfirmOpen(true);
            }}
            aria-label={`Delete ${params.row.jobCategory || 'category'}`}
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

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* DataGrid — Material surface + themed header, rows, footer (shared app pattern) */}
      <Paper
        elevation={0}
        sx={{
          height: 600,
          width: '100%',
          overflow: 'hidden',
          ...getThemedDataGridSx(theme, colors, {
            _isTreeLayout: isTreeGrid,
            ...(!isTreeGrid
              ? {
                  '& .MuiDataGrid-columnHeader': {
                    '&:hover': {
                      backgroundColor: isLight
                        ? 'rgba(25, 118, 210, 0.08) !important'
                        : `${colors.blueAccent[700]} !important`,
                    },
                  },
                }
              : {}),
          }),
        }}
      >
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
          disableRowSelectionOnClick
          columnHeaderHeight={48}
          sx={{
            border: 'none',
            '& .MuiDataGrid-cell:focus, & .MuiDataGrid-cell:focus-within': {
              outline: 'none',
            },
            '& .MuiDataGrid-cell[data-field="actions"]': {
              cursor: 'default',
            },
            '& .MuiDataGrid-virtualScroller::-webkit-scrollbar': { height: 10, width: 10 },
            '& .MuiDataGrid-virtualScroller::-webkit-scrollbar-thumb': {
              backgroundColor: isLight ? theme.palette.grey[400] : theme.palette.grey[700],
              borderRadius: 8,
            },
            '& .MuiDataGrid-virtualScroller::-webkit-scrollbar-track': {
              backgroundColor: 'transparent',
            },
          }}
        />
      </Paper>

      {/* Create/Edit Dialog */}
      <Dialog open={openDialog} onClose={() => { setOpenDialog(false); resetForm(); }} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ backgroundColor: theme.palette.primary.main, color: 'white' }}>
          {currentCategory ? 'Edit Job Category' : 'Add Job Category'}
        </DialogTitle>
        <DialogContent dividers sx={{ backgroundColor: theme.palette.background.default }}>
          <Stack spacing={2}>
            <TextField
              autoFocus
              margin="dense"
              label="Job Category"
              fullWidth
              required
              variant="outlined"
              value={formData.jobCategory}
              onChange={(e) => handleInputChange('jobCategory', e.target.value)}
              error={!!formErrors.jobCategory}
              helperText={formErrors.jobCategory}
              sx={{ mb: 2 }}
            />
            <TextField
              margin="dense"
              label="Description"
              fullWidth
              variant="outlined"
              multiline
              rows={3}
              value={formData.description}
              onChange={(e) => handleInputChange('description', e.target.value)}
              sx={{ mb: 2 }}
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ padding: '16px 24px' }}>
          <Button onClick={() => { setOpenDialog(false); resetForm(); }} color="primary" variant="outlined">
            Cancel
          </Button>
          <Button onClick={handleSave} color="primary" variant="contained">
            {currentCategory ? 'Update Job Category' : 'Create Job Category'}
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
