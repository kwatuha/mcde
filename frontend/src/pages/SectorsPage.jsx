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
  Category as CategoryIcon,
  Search as SearchIcon,
  Clear as ClearIcon
} from '@mui/icons-material';
import axiosInstance from '../api/axiosInstance';
import { useAuth } from '../context/AuthContext.jsx';
import { tokens } from "./dashboard/theme";
import Header from "./dashboard/Header";

function SectorsPage() {
  const { user, hasPrivilege } = useAuth();
  const theme = useTheme();
  const colors = tokens(theme.palette.mode);
  const isLight = theme.palette.mode === 'light';

  const [sectors, setSectors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
  const [searchQuery, setSearchQuery] = useState('');

  // Dialog states
  const [openDialog, setOpenDialog] = useState(false);
  const [currentSector, setCurrentSector] = useState(null);
  const [formData, setFormData] = useState({
    sectorName: '',
    description: '',
  });
  const [formErrors, setFormErrors] = useState({});
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [sectorToDelete, setSectorToDelete] = useState(null);

  // Fetch sectors
  const fetchSectors = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await axiosInstance.get('/sectors');
      setSectors(response.data || []);
    } catch (err) {
      console.error('Error fetching sectors:', err);
      setError(err?.response?.data?.message || err.message || 'Failed to fetch sectors');
      setSnackbar({
        open: true,
        message: 'Failed to fetch sectors',
        severity: 'error'
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSectors();
  }, []);

  // Filter sectors based on search
  const filteredSectors = sectors.filter(sector => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      (sector.sectorName || '').toLowerCase().includes(query) ||
      (sector.description || '').toLowerCase().includes(query)
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
    if (!formData.sectorName.trim()) {
      errors.sectorName = 'Sector name is required';
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Handle save (create or update)
  const handleSave = async () => {
    if (!validateForm()) return;

    try {
      if (currentSector) {
        // Update
        await axiosInstance.put(`/sectors/${currentSector.id}`, formData);
        setSnackbar({
          open: true,
          message: 'Sector updated successfully',
          severity: 'success'
        });
      } else {
        // Create
        await axiosInstance.post('/sectors', formData);
        setSnackbar({
          open: true,
          message: 'Sector created successfully',
          severity: 'success'
        });
      }
      setOpenDialog(false);
      resetForm();
      fetchSectors();
    } catch (err) {
      console.error('Error saving sector:', err);
      const errorMessage = err?.response?.data?.message || err.message || 'Failed to save sector';
      setSnackbar({
        open: true,
        message: errorMessage,
        severity: 'error'
      });
    }
  };

  // Handle delete
  const handleDelete = async () => {
    if (!sectorToDelete) return;

    try {
      await axiosInstance.delete(`/sectors/${sectorToDelete.id}`);
      setSnackbar({
        open: true,
        message: 'Sector deleted successfully',
        severity: 'success'
      });
      setDeleteConfirmOpen(false);
      setSectorToDelete(null);
      fetchSectors();
    } catch (err) {
      console.error('Error deleting sector:', err);
      setSnackbar({
        open: true,
        message: err?.response?.data?.message || 'Failed to delete sector',
        severity: 'error'
      });
    }
  };

  // Open dialog for create
  const handleCreate = () => {
    setCurrentSector(null);
    resetForm();
    setOpenDialog(true);
  };

  // Open dialog for edit
  const handleEdit = (sector) => {
    setCurrentSector(sector);
    setFormData({
      sectorName: sector.sectorName || '',
      description: sector.description || '',
    });
    setFormErrors({});
    setOpenDialog(true);
  };

  // Reset form
  const resetForm = () => {
    setFormData({
      sectorName: '',
      description: '',
    });
    setFormErrors({});
    setCurrentSector(null);
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
      field: 'sectorName',
      headerName: 'Sector Name',
      flex: 1,
      minWidth: 250,
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
              setSectorToDelete(params.row);
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
      <Header title="Sectors Management" subtitle="Manage government sectors" />
      
      {/* Summary Card */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" gap={2}>
                <CategoryIcon sx={{ fontSize: 40, color: colors.blueAccent[500] }} />
                <Box>
                  <Typography variant="h4" fontWeight={600}>
                    {sectors.length}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Total Sectors
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
          placeholder="Search sectors..."
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
          Add Sector
        </Button>
      </Box>

      {/* DataGrid */}
      <Paper sx={{ height: 600, width: '100%' }}>
        <DataGrid
          rows={filteredSectors}
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
              backgroundColor: isLight ? colors.blueAccent[100] : colors.blueAccent[800],
              borderBottom: `2px solid ${isLight ? colors.blueAccent[300] : colors.blueAccent[600]}`,
            },
            '& .MuiDataGrid-columnHeaderTitle': {
              fontWeight: 700,
            },
          }}
        />
      </Paper>

      {/* Create/Edit Dialog */}
      <Dialog open={openDialog} onClose={() => { setOpenDialog(false); resetForm(); }} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ backgroundColor: theme.palette.primary.main, color: 'white' }}>
          {currentSector ? 'Edit Sector' : 'Add Sector'}
        </DialogTitle>
        <DialogContent dividers sx={{ backgroundColor: theme.palette.background.default }}>
          <Stack spacing={2}>
            <TextField
              autoFocus
              margin="dense"
              label="Sector Name"
              fullWidth
              required
              variant="outlined"
              value={formData.sectorName}
              onChange={(e) => handleInputChange('sectorName', e.target.value)}
              error={!!formErrors.sectorName}
              helperText={formErrors.sectorName}
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
            {currentSector ? 'Update Sector' : 'Create Sector'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteConfirmOpen} onClose={() => setDeleteConfirmOpen(false)}>
        <DialogTitle>Confirm Delete</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete "{sectorToDelete?.sectorName}"? This action cannot be undone.
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

export default SectorsPage;
