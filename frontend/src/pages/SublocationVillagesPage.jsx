import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  Paper,
  Snackbar,
  Stack,
  TextField,
  Typography,
  useTheme,
} from '@mui/material';
import { DataGrid } from '@mui/x-data-grid';
import {
  Add as AddIcon,
  Clear as ClearIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  FileDownload as FileDownloadIcon,
  LocationOn as LocationIcon,
  Refresh as RefreshIcon,
  Search as SearchIcon,
} from '@mui/icons-material';
import * as XLSX from 'xlsx';
import axiosInstance from '../api/axiosInstance';
import { tokens } from './dashboard/theme';
import Header from './dashboard/Header';

const emptyForm = {
  county: 'Machakos',
  subcounty: '',
  ward: '',
  sublocation: '',
  village: '',
};

function clean(value) {
  return String(value ?? '').trim();
}

function SublocationVillagesPage() {
  const theme = useTheme();
  const colors = tokens(theme.palette.mode);
  const isLight = theme.palette.mode === 'light';

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState({ subcounty: '', ward: '', sublocation: '' });
  const [pagination, setPagination] = useState({ page: 0, pageSize: 50, rowCount: 0 });
  const [options, setOptions] = useState({ subcounties: [], wards: [], sublocations: [] });
  const [exportingExcel, setExportingExcel] = useState(false);
  const [openDialog, setOpenDialog] = useState(false);
  const [currentRow, setCurrentRow] = useState(null);
  const [formData, setFormData] = useState(emptyForm);
  const [formErrors, setFormErrors] = useState({});
  const [cascadeProjectLocations, setCascadeProjectLocations] = useState(true);
  const [deleteRow, setDeleteRow] = useState(null);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });

  const fetchRows = useCallback(async ({
    page = 0,
    pageSize = 50,
    search = '',
    activeFilters = { subcounty: '', ward: '', sublocation: '' },
  } = {}) => {
    setLoading(true);
    try {
      const params = {
        page: page + 1,
        limit: pageSize,
      };
      if (clean(search)) params.search = clean(search);
      if (clean(activeFilters.subcounty)) params.subcounty = clean(activeFilters.subcounty);
      if (clean(activeFilters.ward)) params.ward = clean(activeFilters.ward);
      if (clean(activeFilters.sublocation)) params.sublocation = clean(activeFilters.sublocation);

      const response = await axiosInstance.get('/geography/catalog', { params });
      setRows(response.data?.data || []);
      setPagination({
        page,
        pageSize,
        rowCount: response.data?.pagination?.total || 0,
      });
    } catch (error) {
      console.error('Error fetching sublocation villages:', error);
      setSnackbar({
        open: true,
        message: error?.response?.data?.message || 'Failed to fetch sublocations and villages.',
        severity: 'error',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchOptions = useCallback(async (activeFilters = { subcounty: '', ward: '', sublocation: '' }) => {
    try {
      const [subcountiesRes, wardsRes, sublocationsRes] = await Promise.all([
        axiosInstance.get('/geography/subcounties'),
        axiosInstance.get('/geography/wards', { params: clean(activeFilters.subcounty) ? { subcounty: activeFilters.subcounty } : {} }),
        axiosInstance.get('/geography/sublocations', {
          params: {
            ...(clean(activeFilters.subcounty) ? { subcounty: activeFilters.subcounty } : {}),
            ...(clean(activeFilters.ward) ? { ward: activeFilters.ward } : {}),
          },
        }),
      ]);
      setOptions({
        subcounties: subcountiesRes.data?.data || [],
        wards: wardsRes.data?.data || [],
        sublocations: sublocationsRes.data?.data || [],
      });
    } catch (error) {
      console.error('Error fetching geography filter options:', error);
    }
  }, []);

  useEffect(() => {
    fetchRows({ page: 0, pageSize: 50, search: '', activeFilters: { subcounty: '', ward: '', sublocation: '' } });
    fetchOptions({ subcounty: '', ward: '', sublocation: '' });
  }, [fetchOptions, fetchRows]);

  const resetForm = () => {
    setCurrentRow(null);
    setFormData(emptyForm);
    setFormErrors({});
    setCascadeProjectLocations(true);
  };

  const openCreateDialog = () => {
    resetForm();
    setOpenDialog(true);
  };

  const openEditDialog = (row) => {
    setCurrentRow(row);
    setFormData({
      county: row.county || 'Machakos',
      subcounty: row.subcounty || '',
      ward: row.ward || '',
      sublocation: row.sublocation || '',
      village: row.village || '',
    });
    setFormErrors({});
    setCascadeProjectLocations(true);
    setOpenDialog(true);
  };

  const handleFormChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (formErrors[field]) {
      setFormErrors((prev) => ({ ...prev, [field]: '' }));
    }
  };

  const validateForm = () => {
    const errors = {};
    if (!clean(formData.subcounty)) errors.subcounty = 'Sub-county is required';
    if (!clean(formData.ward)) errors.ward = 'Ward is required';
    if (!clean(formData.sublocation)) errors.sublocation = 'Sublocation is required';
    if (!clean(formData.village)) errors.village = 'Village is required';
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSave = async () => {
    if (!validateForm()) return;
    const payload = {
      county: clean(formData.county) || 'Machakos',
      subcounty: clean(formData.subcounty),
      ward: clean(formData.ward),
      sublocation: clean(formData.sublocation),
      village: clean(formData.village),
      cascadeProjectLocations: Boolean(currentRow && cascadeProjectLocations),
    };

    try {
      if (currentRow) {
        const response = await axiosInstance.put(`/geography/catalog/${currentRow.id}`, payload);
        const projectsUpdated = response.data?.cascade?.projectsUpdated || 0;
        setSnackbar({
          open: true,
          message: `Sublocation/village updated successfully. Updated ${projectsUpdated} project location(s).`,
          severity: 'success',
        });
      } else {
        await axiosInstance.post('/geography/catalog', payload);
        setSnackbar({ open: true, message: 'Sublocation/village created successfully.', severity: 'success' });
      }
      setOpenDialog(false);
      resetForm();
      fetchRows({ page: pagination.page, pageSize: pagination.pageSize, search: searchQuery, activeFilters: filters });
      fetchOptions(filters);
    } catch (error) {
      console.error('Error saving sublocation village:', error);
      setSnackbar({
        open: true,
        message: error?.response?.data?.message || 'Failed to save sublocation/village.',
        severity: 'error',
      });
    }
  };

  const handleDelete = async () => {
    if (!deleteRow) return;
    try {
      await axiosInstance.delete(`/geography/catalog/${deleteRow.id}`);
      setSnackbar({ open: true, message: 'Sublocation/village deleted successfully.', severity: 'success' });
      setDeleteRow(null);
      fetchRows({ page: pagination.page, pageSize: pagination.pageSize, search: searchQuery, activeFilters: filters });
      fetchOptions(filters);
    } catch (error) {
      console.error('Error deleting sublocation village:', error);
      setSnackbar({
        open: true,
        message: error?.response?.data?.message || 'Failed to delete sublocation/village.',
        severity: 'error',
      });
    }
  };

  const applyFilters = (nextFilters = filters) => {
    setFilters(nextFilters);
    fetchRows({ page: 0, pageSize: pagination.pageSize, search: searchQuery, activeFilters: nextFilters });
    fetchOptions(nextFilters);
  };

  const clearFilters = () => {
    const nextFilters = { subcounty: '', ward: '', sublocation: '' };
    setSearchQuery('');
    setFilters(nextFilters);
    fetchRows({ page: 0, search: '', activeFilters: nextFilters });
    fetchOptions(nextFilters);
  };

  const fetchAllRowsForExport = async () => {
    const limit = 500;
    let page = 1;
    let allRows = [];
    let totalPages = 1;

    do {
      const params = {
        page,
        limit,
      };
      if (clean(searchQuery)) params.search = clean(searchQuery);
      if (clean(filters.subcounty)) params.subcounty = clean(filters.subcounty);
      if (clean(filters.ward)) params.ward = clean(filters.ward);
      if (clean(filters.sublocation)) params.sublocation = clean(filters.sublocation);

      const response = await axiosInstance.get('/geography/catalog', { params });
      allRows = [...allRows, ...(response.data?.data || [])];
      totalPages = response.data?.pagination?.totalPages || 1;
      page += 1;
    } while (page <= totalPages);

    return allRows;
  };

  const handleExportToExcel = async () => {
    setExportingExcel(true);
    try {
      const exportRows = await fetchAllRowsForExport();
      if (exportRows.length === 0) {
        setSnackbar({ open: true, message: 'No sublocations or villages to export.', severity: 'warning' });
        return;
      }

      const worksheetRows = exportRows.map((row, index) => ({
        '#': index + 1,
        County: row.county || '',
        'Sub-county': row.subcounty || '',
        Ward: row.ward || '',
        Sublocation: row.sublocation || '',
        Village: row.village || '',
        'Source row': row.source_row_no || '',
        'Created at': row.created_at ? new Date(row.created_at).toLocaleString() : '',
        'Updated at': row.updated_at ? new Date(row.updated_at).toLocaleString() : '',
      }));
      const worksheet = XLSX.utils.json_to_sheet(worksheetRows);
      worksheet['!cols'] = [
        { wch: 6 },
        { wch: 14 },
        { wch: 20 },
        { wch: 22 },
        { wch: 28 },
        { wch: 30 },
        { wch: 12 },
        { wch: 22 },
        { wch: 22 },
      ];
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Sublocations Villages');

      const dateStr = new Date().toISOString().slice(0, 10);
      const suffix = searchQuery || filters.subcounty || filters.ward || filters.sublocation ? 'filtered' : 'all';
      XLSX.writeFile(workbook, `sublocations_villages_${suffix}_${dateStr}.xlsx`);
      setSnackbar({
        open: true,
        message: `Exported ${exportRows.length} sublocation/village record${exportRows.length === 1 ? '' : 's'} to Excel.`,
        severity: 'success',
      });
    } catch (error) {
      console.error('Error exporting sublocation villages:', error);
      setSnackbar({
        open: true,
        message: error?.response?.data?.message || 'Failed to export sublocations and villages.',
        severity: 'error',
      });
    } finally {
      setExportingExcel(false);
    }
  };

  const columns = [
    { field: 'subcounty', headerName: 'Sub-county', flex: 1, minWidth: 150 },
    { field: 'ward', headerName: 'Ward', flex: 1, minWidth: 150 },
    { field: 'sublocation', headerName: 'Sublocation', flex: 1, minWidth: 170 },
    { field: 'village', headerName: 'Village', flex: 1, minWidth: 180 },
    { field: 'source_row_no', headerName: 'Source row', width: 110 },
    {
      field: 'actions',
      headerName: 'Actions',
      width: 120,
      sortable: false,
      filterable: false,
      renderCell: (params) => (
        <Stack direction="row" spacing={0.5}>
          <IconButton size="small" onClick={() => openEditDialog(params.row)} sx={{ color: colors.blueAccent[400] }}>
            <EditIcon fontSize="small" />
          </IconButton>
          <IconButton size="small" onClick={() => setDeleteRow(params.row)} sx={{ color: colors.redAccent[400] }}>
            <DeleteIcon fontSize="small" />
          </IconButton>
        </Stack>
      ),
    },
  ];

  const fieldSx = {
    '& .MuiOutlinedInput-root': {
      backgroundColor: isLight ? '#fff' : colors.primary[500],
    },
  };

  return (
    <Box m="20px">
      <Header title="Sublocations & Villages" subtitle="Manage Machakos sublocation and village reference data" />

      <Card sx={{ mb: 2, backgroundColor: isLight ? '#fff' : colors.primary[400] }}>
        <CardContent>
          <Stack direction={{ xs: 'column', lg: 'row' }} spacing={1.5} alignItems={{ lg: 'center' }}>
            <TextField
              size="small"
              placeholder="Search subcounty, ward, sublocation, village..."
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') fetchRows({ page: 0, pageSize: pagination.pageSize, search: searchQuery, activeFilters: filters });
              }}
              sx={{ minWidth: { xs: '100%', lg: 320 }, ...fieldSx }}
            />
            <Autocomplete
              options={options.subcounties}
              value={filters.subcounty || null}
              onChange={(event, value) => applyFilters({ subcounty: value || '', ward: '', sublocation: '' })}
              renderInput={(params) => <TextField {...params} label="Sub-county" size="small" sx={fieldSx} />}
              sx={{ minWidth: { xs: '100%', sm: 220 } }}
            />
            <Autocomplete
              options={options.wards}
              value={filters.ward || null}
              onChange={(event, value) => applyFilters({ ...filters, ward: value || '', sublocation: '' })}
              renderInput={(params) => <TextField {...params} label="Ward" size="small" sx={fieldSx} />}
              sx={{ minWidth: { xs: '100%', sm: 220 } }}
            />
            <Autocomplete
              options={options.sublocations}
              value={filters.sublocation || null}
              onChange={(event, value) => applyFilters({ ...filters, sublocation: value || '' })}
              renderInput={(params) => <TextField {...params} label="Sublocation" size="small" sx={fieldSx} />}
              sx={{ minWidth: { xs: '100%', sm: 240 } }}
            />
            <Stack direction="row" spacing={1}>
              <Button variant="contained" startIcon={<SearchIcon />} onClick={() => fetchRows({ page: 0, pageSize: pagination.pageSize, search: searchQuery, activeFilters: filters })}>
                Search
              </Button>
              <Button variant="outlined" startIcon={<ClearIcon />} onClick={clearFilters}>
                Clear
              </Button>
              <Button variant="outlined" startIcon={<RefreshIcon />} onClick={() => fetchRows({ page: pagination.page, pageSize: pagination.pageSize, search: searchQuery, activeFilters: filters })}>
                Refresh
              </Button>
            </Stack>
          </Stack>
        </CardContent>
      </Card>

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ sm: 'center' }} justifyContent="space-between" sx={{ mb: 1.5 }}>
        <Typography variant="body2" color="text.secondary">
          {pagination.rowCount.toLocaleString()} active village record{pagination.rowCount === 1 ? '' : 's'}.
        </Typography>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
          <Button
            variant="outlined"
            startIcon={<FileDownloadIcon />}
            onClick={handleExportToExcel}
            disabled={exportingExcel || pagination.rowCount === 0}
          >
            {exportingExcel ? 'Exporting...' : 'Export Excel'}
          </Button>
          <Button variant="contained" startIcon={<AddIcon />} onClick={openCreateDialog}>
            Add Sublocation/Village
          </Button>
        </Stack>
      </Stack>

      <Paper sx={{ height: 650, width: '100%', backgroundColor: isLight ? '#fff' : colors.primary[400] }}>
        <DataGrid
          rows={rows}
          columns={columns}
          loading={loading}
          paginationMode="server"
          rowCount={pagination.rowCount}
          pageSizeOptions={[25, 50, 100, 250]}
          paginationModel={{ page: pagination.page, pageSize: pagination.pageSize }}
          onPaginationModelChange={(model) => {
            fetchRows({ page: model.page, pageSize: model.pageSize, search: searchQuery, activeFilters: filters });
          }}
          disableRowSelectionOnClick
          sx={{
            border: 'none',
            '& .MuiDataGrid-columnHeaders': {
              backgroundColor: isLight ? colors.blueAccent[700] : colors.blueAccent[800],
              color: '#fff',
              fontWeight: 'bold',
            },
          }}
        />
      </Paper>

      <Dialog open={openDialog} onClose={() => setOpenDialog(false)} maxWidth="md" fullWidth>
        <DialogTitle>
          <Stack direction="row" spacing={1} alignItems="center">
            <LocationIcon color="primary" />
            <Typography variant="h6">{currentRow ? 'Edit Sublocation/Village' : 'Add Sublocation/Village'}</Typography>
          </Stack>
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="County"
              value={formData.county}
              onChange={(event) => handleFormChange('county', event.target.value)}
              fullWidth
              sx={fieldSx}
            />
            <TextField
              label="Sub-county"
              value={formData.subcounty}
              onChange={(event) => handleFormChange('subcounty', event.target.value)}
              error={Boolean(formErrors.subcounty)}
              helperText={formErrors.subcounty}
              fullWidth
              sx={fieldSx}
            />
            <TextField
              label="Ward"
              value={formData.ward}
              onChange={(event) => handleFormChange('ward', event.target.value)}
              error={Boolean(formErrors.ward)}
              helperText={formErrors.ward}
              fullWidth
              sx={fieldSx}
            />
            <TextField
              label="Sublocation"
              value={formData.sublocation}
              onChange={(event) => handleFormChange('sublocation', event.target.value)}
              error={Boolean(formErrors.sublocation)}
              helperText={formErrors.sublocation}
              fullWidth
              sx={fieldSx}
            />
            <TextField
              label="Village"
              value={formData.village}
              onChange={(event) => handleFormChange('village', event.target.value)}
              error={Boolean(formErrors.village)}
              helperText={formErrors.village}
              fullWidth
              sx={fieldSx}
            />
            {currentRow && (
              <FormControlLabel
                control={
                  <Checkbox
                    checked={cascadeProjectLocations}
                    onChange={(event) => setCascadeProjectLocations(event.target.checked)}
                  />
                }
                label="Update matching project locations that use the old sublocation/village path"
              />
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenDialog(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSave}>{currentRow ? 'Update' : 'Create'}</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(deleteRow)} onClose={() => setDeleteRow(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Delete Sublocation/Village</DialogTitle>
        <DialogContent>
          <Typography>
            Delete <strong>{deleteRow?.village}</strong> in <strong>{deleteRow?.sublocation}</strong>? This removes it from future dropdowns.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteRow(null)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={handleDelete}>Delete</Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={5000}
        onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert severity={snackbar.severity} onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}

export default SublocationVillagesPage;
