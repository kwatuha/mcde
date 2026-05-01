import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Button, TextField, Dialog, DialogTitle,
  DialogContent, DialogActions, Paper, CircularProgress, IconButton,
  Snackbar, Alert, Stack, useTheme, Grid, Card, CardContent,
  TablePagination, LinearProgress, Divider, Checkbox, FormControlLabel,
} from '@mui/material';
import { DataGrid } from "@mui/x-data-grid";
import { 
  Add as AddIcon, 
  Edit as EditIcon, 
  Delete as DeleteIcon, 
  LocationOn as LocationIcon,
  Search as SearchIcon,
  Clear as ClearIcon,
  CloudUpload as UploadIcon,
  FileUpload as FileUploadIcon,
  PictureAsPdf as PdfIcon,
  TableChart as ExcelIcon
} from '@mui/icons-material';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import axiosInstance from '../api/axiosInstance';
import { useAuth } from '../context/AuthContext.jsx';
import { tokens } from "./dashboard/theme";
import Header from "./dashboard/Header";

function KenyaWardsPage() {
  const { user, hasPrivilege } = useAuth();
  const theme = useTheme();
  const colors = tokens(theme.palette.mode);
  const isLight = theme.palette.mode === 'light';

  const [wards, setWards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
  const [searchQuery, setSearchQuery] = useState('');
  const [pagination, setPagination] = useState({
    page: 0,
    limit: 50,
    total: 0,
    totalPages: 0,
  });

  // Dialog states
  const [openDialog, setOpenDialog] = useState(false);
  const [currentWard, setCurrentWard] = useState(null);
  const [formData, setFormData] = useState({
    iebc_ward_name: '',
    count: '',
    province: '',
    district: '',
    division: '',
    county: '',
    constituency: '',
    pcode: '',
    status: '',
    no: '',
    shape_type: '',
    status_1: '',
  });
  const [formErrors, setFormErrors] = useState({});
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [wardToDelete, setWardToDelete] = useState(null);

  // Import dialog states
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(null);

  // Export states
  const [exportingExcel, setExportingExcel] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportAll, setExportAll] = useState(false);

  // Fetch wards with pagination
  const fetchWards = async (page = pagination.page, limit = pagination.limit, search = searchQuery) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: (page + 1).toString(),
        limit: limit.toString(),
      });
      if (search) {
        params.append('search', search);
      }
      
      const response = await axiosInstance.get(`/kenya-wards?${params.toString()}`);
      
      // Handle case where table doesn't exist
      if (response.data.message && response.data.message.includes('does not exist')) {
        setWards([]);
        setPagination({
          page: 0,
          limit: 50,
          total: 0,
          totalPages: 0,
        });
        setError(response.data.message);
        setSnackbar({
          open: true,
          message: response.data.message,
          severity: 'warning'
        });
        return;
      }
      
      setWards(response.data.data || []);
      setPagination({
        page,
        limit,
        total: response.data.pagination?.total || 0,
        totalPages: response.data.pagination?.totalPages || 0,
      });
    } catch (err) {
      console.error('Error fetching wards:', err);
      const errorMessage = err?.response?.data?.message || err.message || 'Failed to fetch wards';
      setError(errorMessage);
      setSnackbar({
        open: true,
        message: errorMessage,
        severity: 'error'
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWards();
  }, []);

  // Handle pagination change
  const handlePageChange = (newPage) => {
    fetchWards(newPage, pagination.limit, searchQuery);
  };

  const handlePageSizeChange = (newPageSize) => {
    fetchWards(0, newPageSize, searchQuery);
  };

  // Handle search
  const handleSearch = () => {
    fetchWards(0, pagination.limit, searchQuery);
  };

  const handleSearchClear = () => {
    setSearchQuery('');
    fetchWards(0, pagination.limit, '');
  };

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
    if (!formData.iebc_ward_name.trim()) {
      errors.iebc_ward_name = 'IEBC ward name is required';
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Handle save (create or update)
  const handleSave = async () => {
    if (!validateForm()) return;

    try {
      const payload = {
        ...formData,
        count: formData.count ? parseInt(formData.count) : null,
        no: formData.no ? parseInt(formData.no) : null,
      };

      if (currentWard) {
        // Update
        await axiosInstance.put(`/kenya-wards/${currentWard.id}`, payload);
        setSnackbar({
          open: true,
          message: 'Ward updated successfully',
          severity: 'success'
        });
      } else {
        // Create
        await axiosInstance.post('/kenya-wards', payload);
        setSnackbar({
          open: true,
          message: 'Ward created successfully',
          severity: 'success'
        });
      }
      setOpenDialog(false);
      resetForm();
      fetchWards(pagination.page, pagination.limit, searchQuery);
    } catch (err) {
      console.error('Error saving ward:', err);
      const errorMessage = err?.response?.data?.message || err.message || 'Failed to save ward';
      setSnackbar({
        open: true,
        message: errorMessage,
        severity: 'error'
      });
    }
  };

  // Handle delete
  const handleDelete = async () => {
    if (!wardToDelete) return;

    try {
      await axiosInstance.delete(`/kenya-wards/${wardToDelete.id}`);
      setSnackbar({
        open: true,
        message: 'Ward deleted successfully',
        severity: 'success'
      });
      setDeleteConfirmOpen(false);
      setWardToDelete(null);
      fetchWards(pagination.page, pagination.limit, searchQuery);
    } catch (err) {
      console.error('Error deleting ward:', err);
      setSnackbar({
        open: true,
        message: err?.response?.data?.message || 'Failed to delete ward',
        severity: 'error'
      });
    }
  };

  // Handle CSV import
  const handleImport = async () => {
    if (!importFile) {
      setSnackbar({
        open: true,
        message: 'Please select a CSV file',
        severity: 'error'
      });
      return;
    }

    setImporting(true);
    setImportProgress(null);

    try {
      const formData = new FormData();
      formData.append('file', importFile);

      const response = await axiosInstance.post('/kenya-wards/import', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      setImportProgress(response.data.summary);
      setSnackbar({
        open: true,
        message: `Import completed: ${response.data.summary.success} successful, ${response.data.summary.skipped} skipped, ${response.data.summary.errors} errors`,
        severity: response.data.summary.errors > 0 ? 'warning' : 'success'
      });

      // Refresh wards list
      fetchWards(pagination.page, pagination.limit, searchQuery);
      
      // Close dialog after a delay
      setTimeout(() => {
        setImportDialogOpen(false);
        setImportFile(null);
        setImportProgress(null);
      }, 3000);
    } catch (err) {
      console.error('Error importing wards:', err);
      setSnackbar({
        open: true,
        message: err?.response?.data?.message || 'Failed to import wards',
        severity: 'error'
      });
    } finally {
      setImporting(false);
    }
  };

  // Handle import from server path
  const handleImportFromPath = async () => {
    setImporting(true);
    setImportProgress(null);

    try {
      const response = await axiosInstance.post('/kenya-wards/import-from-path', {
        filePath: '/app/adp/Kenya_wards.csv'
      });

      setImportProgress(response.data.summary);
      setSnackbar({
        open: true,
        message: `Import completed: ${response.data.summary.success} successful, ${response.data.summary.skipped} skipped, ${response.data.summary.errors} errors`,
        severity: response.data.summary.errors > 0 ? 'warning' : 'success'
      });

      // Refresh wards list
      fetchWards(pagination.page, pagination.limit, searchQuery);
      
      // Close dialog after a delay
      setTimeout(() => {
        setImportDialogOpen(false);
        setImportProgress(null);
      }, 3000);
    } catch (err) {
      console.error('Error importing wards:', err);
      setSnackbar({
        open: true,
        message: err?.response?.data?.message || 'Failed to import wards',
        severity: 'error'
      });
    } finally {
      setImporting(false);
    }
  };

  // Open dialog for create
  const handleCreate = () => {
    setCurrentWard(null);
    resetForm();
    setOpenDialog(true);
  };

  // Open dialog for edit
  const handleEdit = (ward) => {
    setCurrentWard(ward);
    setFormData({
      iebc_ward_name: ward.iebc_ward_name || '',
      count: ward.count?.toString() || '',
      province: ward.province || '',
      district: ward.district || '',
      division: ward.division || '',
      county: ward.county || '',
      constituency: ward.constituency || '',
      pcode: ward.pcode || '',
      status: ward.status || '',
      no: ward.no?.toString() || '',
      shape_type: ward.shape_type || '',
      status_1: ward.status_1 || '',
    });
    setFormErrors({});
    setOpenDialog(true);
  };

  // Reset form
  const resetForm = () => {
    setFormData({
      iebc_ward_name: '',
      count: '',
      province: '',
      district: '',
      division: '',
      county: '',
      constituency: '',
      pcode: '',
      status: '',
      no: '',
      shape_type: '',
      status_1: '',
    });
    setFormErrors({});
    setCurrentWard(null);
  };

  // Fetch all wards for export
  const fetchAllWards = async () => {
    try {
      const params = new URLSearchParams({
        page: '1',
        limit: '10000', // Large limit to get all records
      });
      if (searchQuery) {
        params.append('search', searchQuery);
      }
      
      const response = await axiosInstance.get(`/kenya-wards?${params.toString()}`);
      return response.data.data || [];
    } catch (err) {
      console.error('Error fetching all wards:', err);
      throw err;
    }
  };

  // Export handlers
  const handleExportToExcel = async () => {
    setExportingExcel(true);
    try {
      // Get data to export - all wards if exportAll is checked, otherwise current page
      let wardsToExport = wards;
      if (exportAll) {
        wardsToExport = await fetchAllWards();
      }
      
      if (wardsToExport.length === 0) {
        setSnackbar({ 
          open: true, 
          message: 'No wards to export', 
          severity: 'warning' 
        });
        setExportingExcel(false);
        return;
      }

      // Get visible columns (excluding actions)
      const visibleColumns = columns.filter(col => col.field !== 'actions');
      
      // Prepare data for export
      const dataToExport = wardsToExport.map((ward) => {
        const row = {};
        visibleColumns.forEach(col => {
          let value = ward[col.field];
          
          // Format values for display
          if (value === null || value === undefined || value === '') {
            value = 'N/A';
          } else if (col.field === 'count' || col.field === 'no') {
            value = value || 'N/A';
          } else if (col.field === 'created_at' || col.field === 'updated_at') {
            if (value) {
              value = new Date(value).toLocaleDateString();
            } else {
              value = 'N/A';
            }
          }
          row[col.headerName] = value;
        });
        return row;
      });

      // Create workbook and worksheet
      const worksheet = XLSX.utils.json_to_sheet(dataToExport);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Wards');
      
      // Generate filename with current date
      const dateStr = new Date().toISOString().split('T')[0];
      const hasSearch = searchQuery && searchQuery.trim() !== '';
      const filename = hasSearch 
        ? `kenya_wards_export_filtered_${dateStr}.xlsx`
        : `kenya_wards_export_${dateStr}.xlsx`;
      
      // Write file
      XLSX.writeFile(workbook, filename);
      setSnackbar({ 
        open: true, 
        message: `Exported ${wardsToExport.length} ward${wardsToExport.length !== 1 ? 's' : ''} to Excel successfully!`, 
        severity: 'success' 
      });
    } catch (err) {
      console.error('Error exporting to Excel:', err);
      setSnackbar({ open: true, message: 'Failed to export to Excel. Please try again.', severity: 'error' });
    } finally {
      setExportingExcel(false);
    }
  };

  const handleExportToPDF = async () => {
    setExportingPdf(true);
    try {
      // Get data to export - all wards if exportAll is checked, otherwise current page
      let wardsToExport = wards;
      if (exportAll) {
        wardsToExport = await fetchAllWards();
      }
      
      if (wardsToExport.length === 0) {
        setSnackbar({ 
          open: true, 
          message: 'No wards to export', 
          severity: 'warning' 
        });
        return;
      }

      // Get visible columns (excluding actions)
      const visibleColumns = columns.filter(col => col.field !== 'actions');
      
      // Prepare headers and data
      const headers = visibleColumns.map(col => col.headerName);
      const dataRows = wardsToExport.map(ward => {
        return visibleColumns.map(col => {
          let value = ward[col.field];
          
          // Format values for display
          if (value === null || value === undefined || value === '') {
            return 'N/A';
          } else if (col.field === 'count' || col.field === 'no') {
            return value || 'N/A';
          } else if (col.field === 'created_at' || col.field === 'updated_at') {
            if (value) {
              return new Date(value).toLocaleDateString();
            }
            return 'N/A';
          }
          
          return String(value);
        });
      });
      
      // Create PDF - use landscape for better table display
      const doc = new jsPDF('landscape', 'pt', 'a4');
      
      // Use autoTable directly (jspdf-autotable v5+ requires passing doc as first parameter)
      autoTable(doc, {
        head: [headers],
        body: dataRows,
        startY: 20,
        styles: { 
          fontSize: 8, 
          cellPadding: 2,
          overflow: 'linebreak',
          halign: 'left'
        },
        headStyles: { 
          fillColor: [41, 128, 185], 
          textColor: 255, 
          fontStyle: 'bold' 
        },
        alternateRowStyles: { fillColor: [245, 245, 245] },
        margin: { top: 20, left: 40, right: 40 },
      });
      
      // Generate filename with current date
      const dateStr = new Date().toISOString().split('T')[0];
      const hasSearch = searchQuery && searchQuery.trim() !== '';
      const filename = hasSearch 
        ? `kenya_wards_export_filtered_${dateStr}.pdf`
        : `kenya_wards_export_${dateStr}.pdf`;
      
      // Save PDF
      doc.save(filename);
      setSnackbar({ 
        open: true, 
        message: `Exported ${wardsToExport.length} ward${wardsToExport.length !== 1 ? 's' : ''} to PDF successfully!`, 
        severity: 'success' 
      });
    } catch (err) {
      console.error('Error exporting to PDF:', err);
      setSnackbar({ open: true, message: 'Failed to export to PDF. Please try again.', severity: 'error' });
    } finally {
      setExportingPdf(false);
    }
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
      field: 'iebc_ward_name',
      headerName: 'Ward Name',
      flex: 1,
      minWidth: 200,
    },
    {
      field: 'province',
      headerName: 'Province',
      flex: 1,
      minWidth: 150,
    },
    {
      field: 'district',
      headerName: 'District',
      flex: 1,
      minWidth: 150,
    },
    {
      field: 'division',
      headerName: 'Division',
      flex: 1,
      minWidth: 150,
    },
    {
      field: 'county',
      headerName: 'County',
      flex: 1,
      minWidth: 150,
    },
    {
      field: 'constituency',
      headerName: 'Constituency',
      flex: 1,
      minWidth: 150,
    },
    {
      field: 'pcode',
      headerName: 'PCODE',
      width: 120,
    },
    {
      field: 'count',
      headerName: 'Count',
      width: 100,
      type: 'number',
    },
    {
      field: 'actions',
      headerName: 'Actions',
      width: 150,
      sortable: false,
      renderCell: (params) => (
        <Box 
          sx={{ display: 'flex', gap: 1 }}
          onClick={(e) => e.stopPropagation()} // Prevent row click when clicking action buttons
        >
          <IconButton
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              handleEdit(params.row);
            }}
            sx={{ color: colors.blueAccent[500] }}
            title="Edit Ward"
          >
            <EditIcon fontSize="small" />
          </IconButton>
          <IconButton
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              setWardToDelete(params.row);
              setDeleteConfirmOpen(true);
            }}
            sx={{ color: colors.redAccent[500] }}
            title="Delete Ward"
          >
            <DeleteIcon fontSize="small" />
          </IconButton>
        </Box>
      ),
    },
  ];

  const compactActionButtonSx = {
    fontSize: '0.75rem',
    py: 0.5,
    px: 1,
    minWidth: 'auto',
    textTransform: 'none',
    whiteSpace: 'nowrap',
    '& .MuiButton-startIcon': {
      mr: 0.5,
      '& > *': { fontSize: '0.95rem' },
    },
  };

  return (
    <Box m="20px">
      <Header title="Wards" subtitle="Machakos County ward data (IEBC reference)" />
      
      {/* Summary Card */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" gap={2}>
                <LocationIcon sx={{ fontSize: 40, color: colors.blueAccent[500] }} />
                <Box>
                  <Typography variant="h4" fontWeight={600}>
                    {pagination.total}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Total Wards
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Error Message */}
      {error && (
        <Alert severity="warning" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Actions Bar — compact labels, single horizontal row (scroll on narrow viewports) */}
      <Box
        sx={{
          display: 'flex',
          flexWrap: 'nowrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 1.5,
          mb: 2,
          minWidth: 0,
          overflowX: 'auto',
          pb: 0.25,
          '&::-webkit-scrollbar': { height: 6 },
          '&::-webkit-scrollbar-thumb': {
            borderRadius: 3,
            bgcolor: isLight ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.2)',
          },
        }}
      >
        <TextField
          placeholder="Search wards..."
          variant="outlined"
          size="small"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyPress={(e) => {
            if (e.key === 'Enter') {
              handleSearch();
            }
          }}
          InputProps={{
            startAdornment: <SearchIcon sx={{ mr: 1, color: 'text.secondary' }} />,
            endAdornment: searchQuery && (
              <IconButton
                size="small"
                onClick={handleSearchClear}
                sx={{ mr: -1 }}
              >
                <ClearIcon fontSize="small" />
              </IconButton>
            ),
          }}
          sx={{
            width: 280,
            flex: '0 0 auto',
            '& .MuiInputBase-input': { fontSize: '0.8rem' },
          }}
        />
        <Box
          sx={{
            display: 'flex',
            flexWrap: 'nowrap',
            alignItems: 'center',
            gap: 0.5,
            flex: '0 0 auto',
            ml: 'auto',
          }}
        >
          <FormControlLabel
            control={
              <Checkbox
                checked={exportAll}
                onChange={(e) => setExportAll(e.target.checked)}
                size="small"
              />
            }
            label="Export All"
            sx={{
              mr: 0,
              flexShrink: 0,
              whiteSpace: 'nowrap',
              '& .MuiFormControlLabel-label': { fontSize: '0.75rem' },
            }}
          />
          <Button
            variant="outlined"
            size="small"
            startIcon={<UploadIcon />}
            onClick={() => setImportDialogOpen(true)}
            sx={{
              ...compactActionButtonSx,
              borderColor: colors.greenAccent[500],
              color: colors.greenAccent[500],
              '&:hover': {
                borderColor: colors.greenAccent[600],
                backgroundColor: colors.greenAccent[100],
              },
            }}
          >
            Import CSV
          </Button>
          <Button
            variant="outlined"
            size="small"
            startIcon={exportingExcel ? <CircularProgress size={14} color="inherit" /> : <ExcelIcon />}
            onClick={handleExportToExcel}
            disabled={exportingExcel || (!exportAll && wards.length === 0)}
            sx={{
              ...compactActionButtonSx,
              borderColor: colors.greenAccent[500],
              color: colors.greenAccent[500],
              '&:hover': {
                borderColor: colors.greenAccent[600],
                backgroundColor: colors.greenAccent[100],
              },
              '&:disabled': {
                borderColor: colors.grey[400],
                color: colors.grey[400],
              },
            }}
          >
            {exportingExcel ? 'Exporting...' : 'Export Excel'}
          </Button>
          <Button
            variant="outlined"
            size="small"
            startIcon={exportingPdf ? <CircularProgress size={14} color="inherit" /> : <PdfIcon />}
            onClick={handleExportToPDF}
            disabled={exportingPdf || (!exportAll && wards.length === 0)}
            sx={{
              ...compactActionButtonSx,
              borderColor: colors.redAccent[500],
              color: colors.redAccent[500],
              '&:hover': {
                borderColor: colors.redAccent[600],
                backgroundColor: colors.redAccent[100],
              },
              '&:disabled': {
                borderColor: colors.grey[400],
                color: colors.grey[400],
              },
            }}
          >
            {exportingPdf ? 'Exporting...' : 'Export PDF'}
          </Button>
          <Button
            variant="contained"
            size="small"
            startIcon={<AddIcon />}
            onClick={handleCreate}
            sx={{
              ...compactActionButtonSx,
              backgroundColor: colors.blueAccent[500],
              '&:hover': {
                backgroundColor: colors.blueAccent[600],
              },
            }}
          >
            Add Ward
          </Button>
        </Box>
      </Box>

      {/* DataGrid */}
      <Paper sx={{ height: 600, width: '100%' }}>
        <DataGrid
          rows={wards}
          columns={columns}
          loading={loading}
          getRowId={(row) => row.id}
          pageSizeOptions={[25, 50, 100]}
          paginationModel={{ page: pagination.page, pageSize: pagination.limit }}
          onPaginationModelChange={(model) => {
            handlePageChange(model.page);
            if (model.pageSize !== pagination.limit) {
              handlePageSizeChange(model.pageSize);
            }
          }}
          rowCount={pagination.total}
          paginationMode="server"
          onRowClick={(params) => {
            // Open edit dialog when row is clicked (but not when clicking action buttons)
            if (params.field !== 'actions') {
              handleEdit(params.row);
            }
          }}
          sx={{
            '& .MuiDataGrid-cell': {
              borderBottom: `1px solid ${isLight ? colors.grey[200] : colors.grey[700]}`,
              cursor: 'pointer',
            },
            '& .MuiDataGrid-row:hover': {
              backgroundColor: isLight ? colors.grey[50] : colors.grey[700],
            },
            '& .MuiDataGrid-columnHeaders': {
              backgroundColor: isLight ? colors.grey[100] : colors.grey[800],
              borderBottom: `2px solid ${isLight ? colors.grey[300] : colors.grey[700]}`,
            },
            '& .MuiDataGrid-columnHeaderTitle': {
              fontWeight: 700,
            },
            '& .MuiDataGrid-cell[data-field="actions"]': {
              cursor: 'default',
            },
          }}
        />
      </Paper>

      {/* Create/Edit Dialog */}
      <Dialog open={openDialog} onClose={() => { setOpenDialog(false); resetForm(); }} maxWidth="md" fullWidth>
        <DialogTitle sx={{ backgroundColor: theme.palette.primary.main, color: 'white' }}>
          {currentWard ? 'Edit ward' : 'Add ward'}
        </DialogTitle>
        <DialogContent dividers sx={{ backgroundColor: theme.palette.background.default }}>
          <Stack spacing={2}>
            <Grid container spacing={2}>
              <Grid item xs={12}>
                <TextField
                  autoFocus
                  margin="dense"
                  label="IEBC Ward Name"
                  fullWidth
                  required
                  variant="outlined"
                  value={formData.iebc_ward_name}
                  onChange={(e) => handleInputChange('iebc_ward_name', e.target.value)}
                  error={!!formErrors.iebc_ward_name}
                  helperText={formErrors.iebc_ward_name}
                  sx={{ mb: 2 }}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  margin="dense"
                  label="Province"
                  fullWidth
                  variant="outlined"
                  value={formData.province}
                  onChange={(e) => handleInputChange('province', e.target.value)}
                  sx={{ mb: 2 }}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  margin="dense"
                  label="District"
                  fullWidth
                  variant="outlined"
                  value={formData.district}
                  onChange={(e) => handleInputChange('district', e.target.value)}
                  sx={{ mb: 2 }}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  margin="dense"
                  label="Division"
                  fullWidth
                  variant="outlined"
                  value={formData.division}
                  onChange={(e) => handleInputChange('division', e.target.value)}
                  sx={{ mb: 2 }}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  margin="dense"
                  label="County"
                  fullWidth
                  variant="outlined"
                  value={formData.county}
                  onChange={(e) => handleInputChange('county', e.target.value)}
                  sx={{ mb: 2 }}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  margin="dense"
                  label="Constituency"
                  fullWidth
                  variant="outlined"
                  value={formData.constituency}
                  onChange={(e) => handleInputChange('constituency', e.target.value)}
                  sx={{ mb: 2 }}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  margin="dense"
                  label="PCODE"
                  fullWidth
                  variant="outlined"
                  value={formData.pcode}
                  onChange={(e) => handleInputChange('pcode', e.target.value)}
                  sx={{ mb: 2 }}
                />
              </Grid>
              <Grid item xs={12} sm={4}>
                <TextField
                  margin="dense"
                  label="Count"
                  fullWidth
                  type="number"
                  variant="outlined"
                  value={formData.count}
                  onChange={(e) => handleInputChange('count', e.target.value)}
                  sx={{ mb: 2 }}
                />
              </Grid>
              <Grid item xs={12} sm={4}>
                <TextField
                  margin="dense"
                  label="Status"
                  fullWidth
                  variant="outlined"
                  value={formData.status}
                  onChange={(e) => handleInputChange('status', e.target.value)}
                  sx={{ mb: 2 }}
                />
              </Grid>
              <Grid item xs={12} sm={4}>
                <TextField
                  margin="dense"
                  label="NO"
                  fullWidth
                  type="number"
                  variant="outlined"
                  value={formData.no}
                  onChange={(e) => handleInputChange('no', e.target.value)}
                  sx={{ mb: 2 }}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  margin="dense"
                  label="Shape Type"
                  fullWidth
                  variant="outlined"
                  value={formData.shape_type}
                  onChange={(e) => handleInputChange('shape_type', e.target.value)}
                  sx={{ mb: 2 }}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  margin="dense"
                  label="Status 1"
                  fullWidth
                  variant="outlined"
                  value={formData.status_1}
                  onChange={(e) => handleInputChange('status_1', e.target.value)}
                  sx={{ mb: 2 }}
                />
              </Grid>
            </Grid>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ padding: '16px 24px' }}>
          <Button onClick={() => { setOpenDialog(false); resetForm(); }} color="primary" variant="outlined">
            Cancel
          </Button>
          <Button onClick={handleSave} color="primary" variant="contained">
            {currentWard ? 'Update Ward' : 'Create Ward'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Import Dialog */}
      <Dialog open={importDialogOpen} onClose={() => { setImportDialogOpen(false); setImportFile(null); }} maxWidth="sm" fullWidth>
        <DialogTitle>Import wards from CSV</DialogTitle>
        <DialogContent>
          <Stack spacing={3} sx={{ mt: 1 }}>
            <Typography variant="body2" color="text.secondary">
              Upload a CSV file with the following columns: IEBC_WARDS, COUNT, FIRST_PROV, FIRST_DIST, FIRST_DIVI, PCODE, STATUS, NO, SHAPE_1, STATUS_1
            </Typography>
            
            <Button
              variant="outlined"
              component="label"
              startIcon={<FileUploadIcon />}
              fullWidth
            >
              Select CSV File
              <input
                type="file"
                hidden
                accept=".csv"
                onChange={(e) => setImportFile(e.target.files[0])}
              />
            </Button>

            {importFile && (
              <Typography variant="body2" color="text.secondary">
                Selected: {importFile.name}
              </Typography>
            )}

            <Divider>OR</Divider>

            <Button
              variant="outlined"
              startIcon={<UploadIcon />}
              onClick={handleImportFromPath}
              disabled={importing}
              fullWidth
            >
              Import from Server Path
              <Typography variant="caption" display="block" color="text.secondary">
                /home/dev/dev/imes_working/government_projects/adp/Kenya_wards.csv
              </Typography>
            </Button>

            {importing && (
              <Box>
                <LinearProgress />
                <Typography variant="body2" sx={{ mt: 1 }}>
                  Importing wards...
                </Typography>
              </Box>
            )}

            {importProgress && (
              <Box sx={{ p: 2, bgcolor: 'background.default', borderRadius: 1 }}>
                <Typography variant="subtitle2" gutterBottom>Import Summary</Typography>
                <Typography variant="body2">Total: {importProgress.total}</Typography>
                <Typography variant="body2" color="success.main">Success: {importProgress.success}</Typography>
                <Typography variant="body2" color="warning.main">Skipped: {importProgress.skipped}</Typography>
                <Typography variant="body2" color="error.main">Errors: {importProgress.errors}</Typography>
              </Box>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setImportDialogOpen(false); setImportFile(null); setImportProgress(null); }}>
            Close
          </Button>
          <Button 
            onClick={handleImport} 
            variant="contained" 
            color="primary"
            disabled={!importFile || importing}
          >
            Import
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteConfirmOpen} onClose={() => setDeleteConfirmOpen(false)}>
        <DialogTitle>Confirm Delete</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete "{wardToDelete?.iebc_ward_name}"? This action cannot be undone.
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

export default KenyaWardsPage;
