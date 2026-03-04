import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  TextField,
  Grid,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Alert,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  InputAdornment,
  IconButton,
  Tooltip,
} from '@mui/material';
import {
  Search as SearchIcon,
  Clear as ClearIcon,
  LocationOn as LocationIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Update as UpdateIcon,
} from '@mui/icons-material';
import { DataGrid } from '@mui/x-data-grid';
import axiosInstance from '../api/axiosInstance';
import SiteUpdatesDialog from './SiteUpdatesDialog';

const ProjectSitesModal = ({ open, onClose, projectId, projectName }) => {
  const [sites, setSites] = useState([]);
  const [summary, setSummary] = useState({ total: 0, byCounty: {}, byConstituency: {}, byWard: {} });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({
    county: '',
    constituency: '',
    ward: '',
  });
  const [selectedCounty, setSelectedCounty] = useState(null);
  const [selectedConstituency, setSelectedConstituency] = useState(null);

  // Local edit state for inline editing from the DataGrid
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingSite, setEditingSite] = useState(null);
  const [editForm, setEditForm] = useState({
    status: '',
    progress: '',
    approvedCost: '',
  });
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState(null);

  // Site updates history state
  const [updatesDialogOpen, setUpdatesDialogOpen] = useState(false);
  const [updatesSite, setUpdatesSite] = useState(null);

  useEffect(() => {
    if (open && projectId) {
      fetchSites();
    } else {
      // Reset when modal closes
      setSites([]);
      setSummary({ total: 0, byCounty: {}, byConstituency: {}, byWard: {} });
      setFilters({ county: '', constituency: '', ward: '' });
      setSelectedCounty(null);
      setSelectedConstituency(null);
      setError(null);
    }
  }, [open, projectId]);

  const fetchSites = async () => {
    if (!projectId) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const params = new URLSearchParams();
      if (filters.county) params.append('county', filters.county);
      if (filters.constituency) params.append('constituency', filters.constituency);
      if (filters.ward) params.append('ward', filters.ward);
      
      const response = await axiosInstance.get(`/projects/${projectId}/sites?${params.toString()}`);
      
      // Always handle the response data, even if it's empty
      const sites = response.data?.sites || [];
      const summary = response.data?.summary || { total: 0, byCounty: {}, byConstituency: {}, byWard: {} };
      const message = response.data?.message;
      
      setSites(sites);
      setSummary(summary);
      
      // Only show error message if there's a specific message and no sites
      // Otherwise, just show empty state (which is normal if no sites exist)
      if (message && sites.length === 0) {
        // Show informational message, not an error
        setError(null); // Don't show as error, just informational
        console.log('Project sites info:', message);
      } else {
        setError(null);
      }
    } catch (err) {
      console.error('Error fetching project sites:', err);
      
      // Always set empty data on error to prevent UI crashes
      setSites([]);
      setSummary({ total: 0, byCounty: {}, byConstituency: {}, byWard: {} });
      
      // Only show error for actual network/server errors (not 200 responses)
      // If the server returns 200 with empty data, that's fine - no error needed
      if (err.response?.status && err.response.status !== 200) {
        const errorMessage = err.response?.data?.message || err.message || 'Failed to fetch project sites';
        // Don't show error for schema/table issues - those are handled gracefully by backend
        if (!errorMessage.includes('does not exist') && !errorMessage.includes('relation')) {
          setError(errorMessage);
        } else {
          setError(null); // Schema errors are handled gracefully
        }
      } else if (!err.response) {
        // Network error (no response) - show a brief message but don't block the UI
        console.warn('Network error fetching project sites:', err.message);
        setError(null); // Don't show error for network issues - just show empty state
      } else {
        // Other unexpected error - don't show error, just log it
        console.warn('Unexpected error fetching project sites:', err.message);
        setError(null);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && projectId) {
      // Debounce filter changes
      const timeoutId = setTimeout(() => {
        fetchSites();
      }, 300);
      return () => clearTimeout(timeoutId);
    }
  }, [filters, open, projectId]);

  const handleFilterChange = (field, value) => {
    setFilters(prev => ({ ...prev, [field]: value }));
  };

  const clearFilters = () => {
    setFilters({ county: '', constituency: '', ward: '' });
    setSelectedCounty(null);
    setSelectedConstituency(null);
  };

  const handleOpenEdit = (site) => {
    if (!site) return;
    setEditingSite(site);
    setEditForm({
      status: site.status_norm || site.status_raw || '',
      progress: site.percent_complete ?? '',
      approvedCost: site.approved_cost_kes ?? '',
    });
    setEditError(null);
    setEditDialogOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!editingSite || !projectId) {
      setEditDialogOpen(false);
      return;
    }

    try {
      setEditSaving(true);
      setEditError(null);

      const payload = {
        status: editForm.status,
        percent_complete: editForm.progress !== '' ? Number(editForm.progress) : null,
        approved_cost_kes: editForm.approvedCost !== '' ? Number(editForm.approvedCost) : null,
      };

      await axiosInstance.put(
        `/projects/${projectId}/sites/${editingSite.site_id || editingSite.id}`,
        payload
      );

      setEditDialogOpen(false);
      setEditingSite(null);
      await fetchSites();
    } catch (err) {
      console.error('Failed to update site:', err);
      setEditError(
        err.response?.data?.message ||
          err.message ||
          'Failed to update site. Please try again.'
      );
    } finally {
      setEditSaving(false);
    }
  };

  const handleDeleteSite = async (site) => {
    if (!site || !projectId) return;
    const siteId = site.site_id || site.id;
    if (!siteId) return;

    const confirmed = window.confirm('Are you sure you want to delete this site?');
    if (!confirmed) return;

    try {
      await axiosInstance.delete(`/projects/${projectId}/sites/${siteId}`);
      await fetchSites();
    } catch (err) {
      console.error('Failed to delete site:', err);
      // Keep the modal usable; just log for now
    }
  };

  const columns = [
    { field: 'site_id', headerName: 'ID', width: 80 },
    {
      field: 'site_name',
      headerName: 'Site Name',
      flex: 1.2,
      minWidth: 180,
    },
    { 
      field: 'county', 
      headerName: 'County', 
      flex: 1,
      minWidth: 140,
    },
    { 
      field: 'constituency', 
      headerName: 'Constituency', 
      flex: 1,
      minWidth: 160,
    },
    { 
      field: 'ward', 
      headerName: 'Ward', 
      flex: 1,
      minWidth: 140,
    },
    {
      field: 'status_norm',
      headerName: 'Status',
      flex: 1,
      minWidth: 140,
      valueGetter: (params) => {
        const row = params?.row || {};
        return row.status_norm || row.status_raw || 'N/A';
      },
    },
    {
      field: 'percent_complete',
      headerName: 'Progress (%)',
      type: 'number',
      width: 130,
      valueGetter: (params) => {
        const row = params?.row || {};
        return row.percent_complete != null ? row.percent_complete : 0;
      },
    },
    {
      field: 'approved_cost_kes',
      headerName: 'Approved Cost (KES)',
      flex: 1,
      minWidth: 170,
      valueGetter: (params) => {
        const row = params?.row || {};
        return row.approved_cost_kes != null ? row.approved_cost_kes : 0;
      },
      valueFormatter: (params) => {
        const value = Number(params?.value || 0);
        return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
      },
    },
    {
      field: 'actions',
      headerName: 'Actions / Observations',
      width: 150,
      sortable: false,
      filterable: false,
      renderCell: (params) => {
        const row = params?.row;
        if (!row) return null;
        return (
          <Box sx={{ display: 'flex', gap: 0.5 }}>
            <IconButton
              size="small"
              color="primary"
              onClick={() => handleOpenEdit(row)}
            >
              <EditIcon fontSize="small" />
            </IconButton>
            <IconButton
              size="small"
              color="error"
              onClick={() => handleDeleteSite(row)}
            >
              <DeleteIcon fontSize="small" />
            </IconButton>
            <Tooltip title="Observations / Site updates">
              <IconButton
                size="small"
                onClick={() => {
                  setUpdatesSite(row);
                  setUpdatesDialogOpen(true);
                }}
                sx={{ color: '#757575' }}
              >
                <UpdateIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>
        );
      },
    },
  ];

  return (
    <Dialog 
      open={open} 
      onClose={onClose} 
      maxWidth="lg" 
      fullWidth
      PaperProps={{
        sx: {
          height: '90vh',
          maxHeight: '900px',
        }
      }}
    >
      <DialogTitle>
        <Box display="flex" justifyContent="space-between" alignItems="center">
          <Box>
            <Typography variant="h6" component="div">
              Project Coverage: {projectName}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Total Sites: {summary.total}
            </Typography>
          </Box>
          <IconButton onClick={onClose} size="small">
            <ClearIcon />
          </IconButton>
        </Box>
      </DialogTitle>
      
      <DialogContent dividers>
        {loading && (
          <Box display="flex" justifyContent="center" p={3}>
            <CircularProgress />
          </Box>
        )}
        
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        
        {!loading && !error && (
          <>
            {/* Summary Cards */}
            <Grid container spacing={2} sx={{ mb: 3 }}>
              <Grid item xs={12} md={4}>
                <Card>
                  <CardContent>
                    <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                      Counties
                    </Typography>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 1 }}>
                      {Object.entries(summary.byCounty).map(([county, count]) => (
                        <Chip
                          key={county}
                          label={`${county}: ${count}`}
                          size="small"
                          color={selectedCounty === county ? 'primary' : 'default'}
                          variant={selectedCounty === county ? 'filled' : 'outlined'}
                          clickable
                          onClick={() => {
                            // Toggle county selection; when selecting a county:
                            // - set county filter
                            // - clear constituency & ward filters and selections
                            const isSame = selectedCounty === county;
                            const newCounty = isSame ? '' : county;
                            setSelectedCounty(isSame ? null : county);
                            setSelectedConstituency(null);
                            setFilters(prev => ({
                              ...prev,
                              county: newCounty,
                              constituency: '',
                              ward: '',
                            }));
                          }}
                        />
                      ))}
                      {Object.keys(summary.byCounty).length === 0 && (
                        <Typography variant="body2" color="text.secondary">
                          No counties
                        </Typography>
                      )}
                    </Box>
                  </CardContent>
                </Card>
              </Grid>
              
              <Grid item xs={12} md={4}>
                <Card>
                  <CardContent>
                    <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                      Constituencies
                    </Typography>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 1 }}>
                      {Object.entries(summary.byConstituency).map(([constituency, count]) => (
                        <Chip
                          key={constituency}
                          label={`${constituency}: ${count}`}
                          size="small"
                          color={selectedConstituency === constituency ? 'secondary' : 'default'}
                          variant={selectedConstituency === constituency ? 'filled' : 'outlined'}
                          clickable
                          onClick={() => {
                            // Toggle constituency selection; when selecting:
                            // - keep current county filter (if any)
                            // - set constituency filter
                            // - clear ward filter
                            const isSame = selectedConstituency === constituency;
                            const newConstituency = isSame ? '' : constituency;
                            setSelectedConstituency(isSame ? null : constituency);
                            setFilters(prev => ({
                              ...prev,
                              constituency: newConstituency,
                              // keep county as-is to respect cascading from county
                              ward: '',
                            }));
                          }}
                        />
                      ))}
                      {Object.keys(summary.byConstituency).length === 0 && (
                        <Typography variant="body2" color="text.secondary">
                          No constituencies
                        </Typography>
                      )}
                    </Box>
                  </CardContent>
                </Card>
              </Grid>
              
              <Grid item xs={12} md={4}>
                <Card>
                  <CardContent>
                    <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                      Wards
                    </Typography>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 1 }}>
                      {Object.entries(summary.byWard).map(([ward, count]) => (
                        <Chip
                          key={ward}
                          label={`${ward}: ${count}`}
                          size="small"
                          color="success"
                          variant="outlined"
                          clickable
                          onClick={() => {
                            // Clicking a ward chip narrows results to that ward within
                            // the currently selected county/constituency (if any).
                            setFilters(prev => ({
                              ...prev,
                              ward: ward,
                            }));
                          }}
                        />
                      ))}
                      {Object.keys(summary.byWard).length === 0 && (
                        <Typography variant="body2" color="text.secondary">
                          No wards
                        </Typography>
                      )}
                    </Box>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>

            {/* Filters */}
            <Box sx={{ mb: 2 }}>
              <Grid container spacing={2}>
                <Grid item xs={12} md={4}>
                  <TextField
                    fullWidth
                    size="small"
                    label="Filter by County"
                    value={filters.county}
                    onChange={(e) => handleFilterChange('county', e.target.value)}
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start">
                          <LocationIcon fontSize="small" />
                        </InputAdornment>
                      ),
                      endAdornment: filters.county && (
                        <InputAdornment position="end">
                          <IconButton
                            size="small"
                            onClick={() => handleFilterChange('county', '')}
                          >
                            <ClearIcon fontSize="small" />
                          </IconButton>
                        </InputAdornment>
                      ),
                    }}
                  />
                </Grid>
                <Grid item xs={12} md={4}>
                  <TextField
                    fullWidth
                    size="small"
                    label="Filter by Constituency"
                    value={filters.constituency}
                    onChange={(e) => handleFilterChange('constituency', e.target.value)}
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start">
                          <LocationIcon fontSize="small" />
                        </InputAdornment>
                      ),
                      endAdornment: filters.constituency && (
                        <InputAdornment position="end">
                          <IconButton
                            size="small"
                            onClick={() => handleFilterChange('constituency', '')}
                          >
                            <ClearIcon fontSize="small" />
                          </IconButton>
                        </InputAdornment>
                      ),
                    }}
                  />
                </Grid>
                <Grid item xs={12} md={4}>
                  <TextField
                    fullWidth
                    size="small"
                    label="Filter by Ward"
                    value={filters.ward}
                    onChange={(e) => handleFilterChange('ward', e.target.value)}
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start">
                          <LocationIcon fontSize="small" />
                        </InputAdornment>
                      ),
                      endAdornment: filters.ward && (
                        <InputAdornment position="end">
                          <IconButton
                            size="small"
                            onClick={() => handleFilterChange('ward', '')}
                          >
                            <ClearIcon fontSize="small" />
                          </IconButton>
                        </InputAdornment>
                      ),
                    }}
                  />
                </Grid>
              </Grid>
              {(filters.county || filters.constituency || filters.ward) && (
                <Box sx={{ mt: 1 }}>
                  <Button
                    size="small"
                    startIcon={<ClearIcon />}
                    onClick={clearFilters}
                  >
                    Clear Filters
                  </Button>
                </Box>
              )}
            </Box>

            {/* Sites Table */}
            <Box sx={{ height: 400, width: '100%' }}>
              <DataGrid
                rows={sites}
                columns={columns}
                getRowId={(row) => row.id || row.site_id || Math.random()}
                pageSizeOptions={[10, 25, 50, 100]}
                initialState={{
                  pagination: {
                    paginationModel: { pageSize: 25 },
                  },
                }}
                disableRowSelectionOnClick
                sx={{
                  '& .MuiDataGrid-columnHeaders': {
                    backgroundColor: '#f5f5f5',
                    fontWeight: 'bold',
                    fontSize: '0.8rem',
                    borderBottom: '1px solid #e0e0e0',
                  },
                  '& .MuiDataGrid-columnHeaderTitle': {
                    fontWeight: 700,
                  },
                  '& .MuiDataGrid-cell': {
                    fontSize: '0.8rem',
                  },
                  '& .MuiDataGrid-row:nth-of-type(odd)': {
                    backgroundColor: '#fafafa',
                  },
                  '& .MuiDataGrid-row:hover': {
                    backgroundColor: '#e3f2fd',
                  },
                }}
              />
            </Box>
          </>
        )}
      </DialogContent>
      
      {updatesSite && (
        <SiteUpdatesDialog
          open={updatesDialogOpen}
          onClose={() => {
            setUpdatesDialogOpen(false);
            setUpdatesSite(null);
          }}
          projectId={projectId}
          site={updatesSite}
        />
      )}
      
      {/* Inline Edit Dialog for a single site */}
      <Dialog
        open={editDialogOpen}
        onClose={() => {
          if (editSaving) return;
          setEditDialogOpen(false);
          setEditingSite(null);
          setEditError(null);
        }}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Edit Site</DialogTitle>
        <DialogContent>
          {editingSite && (
            <Box sx={{ mt: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Typography variant="subtitle2">
                {editingSite.site_name || `Site ${editingSite.site_id || ''}`}
              </Typography>
              <TextField
                label="Status"
                fullWidth
                size="small"
                value={editForm.status}
                onChange={(e) =>
                  setEditForm((prev) => ({ ...prev, status: e.target.value }))
                }
              />
              <TextField
                label="Progress (%)"
                type="number"
                fullWidth
                size="small"
                value={editForm.progress}
                onChange={(e) =>
                  setEditForm((prev) => ({ ...prev, progress: e.target.value }))
                }
              />
              <TextField
                label="Approved Cost (KES)"
                type="number"
                fullWidth
                size="small"
                value={editForm.approvedCost}
                onChange={(e) =>
                  setEditForm((prev) => ({ ...prev, approvedCost: e.target.value }))
                }
              />
              {editError && (
                <Alert severity="error" sx={{ mt: 1 }}>
                  {editError}
                </Alert>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              if (editSaving) return;
              setEditDialogOpen(false);
              setEditingSite(null);
              setEditError(null);
            }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleSaveEdit}
            disabled={editSaving}
          >
            {editSaving ? 'Saving...' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>
      
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
};

export default ProjectSitesModal;
