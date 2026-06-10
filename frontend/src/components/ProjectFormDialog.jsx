// src/components/ProjectFormDialog.jsx
import React, { useEffect, useState } from 'react';
import {
  Box, Typography, Button, TextField, Dialog, DialogTitle,
  DialogContent, DialogActions, Select, MenuItem, FormControl, InputLabel,
  Stack, useTheme, Paper, Grid, OutlinedInput, Chip, Autocomplete,
} from '@mui/material';
import useProjectForm from '../hooks/useProjectForm';
import { getProjectStatusBackgroundColor, getProjectStatusTextColor } from '../utils/projectStatusColors';
import { tokens } from '../pages/dashboard/theme';
import { DEFAULT_COUNTY } from '../configs/appConfig';
import apiService from '../api';
import axiosInstance from '../api/axiosInstance';

const ProjectFormDialog = ({
  open,
  handleClose,
  currentProject,
  onFormSuccess,
  setSnackbar,
  allMetadata, // Now includes projectCategories
  user,
  villageOptions = [],
}) => {
  const theme = useTheme();
  // Get the color mode more robustly, defaulting to 'dark' if not available
  const colorMode = theme?.palette?.mode || 'dark';
  const colors = tokens(colorMode);

  const {
    formData,
    formErrors,
    loading,
    handleChange,
    handleSubmit,
  } = useProjectForm(currentProject, allMetadata, onFormSuccess, setSnackbar, user);

  // State for Kenya wards dropdowns
  const [subcounties, setSubcounties] = useState([]);
  const [wards, setWards] = useState([]);
  const [loadingSubcounties, setLoadingSubcounties] = useState(false);
  const [loadingWards, setLoadingWards] = useState(false);

  /** GET /ministries — cabinet / parent org names for projects */
  const [ministryNameOptions, setMinistryNameOptions] = useState([]);
  const [loadingMinistries, setLoadingMinistries] = useState(false);

  const [sectorsFallback, setSectorsFallback] = useState([]);
  const [loadingSectorsFallback, setLoadingSectorsFallback] = useState(false);
  const [financialYearsFallback, setFinancialYearsFallback] = useState([]);

  useEffect(() => {
    if (!open) return;
    const sectorsFromMetadata = allMetadata?.sectors;
    const financialYearsFromMetadata = allMetadata?.financialYears;
    if (Array.isArray(sectorsFromMetadata) && sectorsFromMetadata.length > 0) {
      setSectorsFallback([]);
    }
    if (Array.isArray(financialYearsFromMetadata) && financialYearsFromMetadata.length > 0) {
      setFinancialYearsFallback([]);
    }
    if (
      Array.isArray(sectorsFromMetadata) && sectorsFromMetadata.length > 0 &&
      Array.isArray(financialYearsFromMetadata) && financialYearsFromMetadata.length > 0
    ) {
      return;
    }

    let cancelled = false;
    const fetchFormMetadataFallbacks = async () => {
      setLoadingSectorsFallback(true);
      try {
        const [sectors, financialYears] = await Promise.all([
          Array.isArray(sectorsFromMetadata) && sectorsFromMetadata.length > 0
            ? Promise.resolve([])
            : apiService.sectors.getAllSectors().catch((err) => {
                console.error('ProjectFormDialog: fallback fetch sectors failed', err);
                return [];
              }),
          Array.isArray(financialYearsFromMetadata) && financialYearsFromMetadata.length > 0
            ? Promise.resolve([])
            : apiService.metadata.financialYears.getAllFinancialYears().catch((err) => {
                console.error('ProjectFormDialog: fallback fetch financial years failed', err);
                return [];
              }),
        ]);
        if (!cancelled) {
          if (!(Array.isArray(sectorsFromMetadata) && sectorsFromMetadata.length > 0)) {
            setSectorsFallback(Array.isArray(sectors) ? sectors : []);
          }
          if (!(Array.isArray(financialYearsFromMetadata) && financialYearsFromMetadata.length > 0)) {
            setFinancialYearsFallback(Array.isArray(financialYears) ? financialYears : []);
          }
        }
      } finally {
        if (!cancelled) setLoadingSectorsFallback(false);
      }
    };
    fetchFormMetadataFallbacks();
    return () => { cancelled = true; };
  }, [open, allMetadata?.sectors, allMetadata?.financialYears]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const load = async () => {
      setLoadingMinistries(true);
      try {
        const { data } = await axiosInstance.get('/ministries', { params: { withDepartments: '0' } });
        const list = Array.isArray(data) ? data : [];
        if (!cancelled) {
          setMinistryNameOptions(list.map((m) => m.name).filter(Boolean).sort((a, b) => a.localeCompare(b)));
        }
      } catch (e) {
        console.error('ProjectFormDialog: ministries fetch failed', e);
        if (!cancelled) {
          setMinistryNameOptions([]);
        }
      } finally {
        if (!cancelled) setLoadingMinistries(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [open]);

  // Fetch sub-counties when county changes
  useEffect(() => {
    if (!open) return;
    
    const fetchSubcounties = async () => {
      const countyName = formData.county || DEFAULT_COUNTY.name;
      if (!countyName) {
        setSubcounties([]);
        setWards([]);
        // Clear sub-county and ward when county is cleared
        if (formData.subcounty || formData.ward) {
          // Use a ref to avoid infinite loops - update formData directly via setFormData if available
          // For now, just clear the local state
        }
        return;
      }
      setLoadingSubcounties(true);
      try {
        const data = await apiService.kenyaWards.getSubcounties(countyName);
        setSubcounties(data);
        // Clear sub-county and ward when county changes - use a flag to prevent re-triggering
        const hadSubcounty = formData.subcounty;
        const hadWard = formData.ward;
        if (hadSubcounty || hadWard) {
          // Update formData directly to avoid triggering handleChange which might cause loops
          // We'll let the parent handle this through the formData prop
        }
      } catch (error) {
        console.error('Error fetching sub-counties:', error);
        // Only show error if dialog is open and user is interacting
        if (open) {
          setSnackbar({ 
            open: true, 
            message: 'Failed to load sub-counties. Please try again.', 
            severity: 'error' 
          });
        }
      } finally {
        setLoadingSubcounties(false);
      }
    };
    fetchSubcounties();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.county, open]);

  // Fetch wards when sub-county changes
  useEffect(() => {
    if (!open) return;
    
    const fetchWards = async () => {
      if (!formData.subcounty) {
        setWards([]);
        return;
      }
      setLoadingWards(true);
      try {
        const data = await apiService.kenyaWards.getWardsBySubcounty(formData.subcounty);
        setWards(data);
        // Don't clear ward here - let user keep their selection if they change sub-county back
      } catch (error) {
        console.error('Error fetching wards:', error);
        // Only show error if dialog is open
        if (open) {
          setSnackbar({ 
            open: true, 
            message: 'Failed to load wards. Please try again.', 
            severity: 'error' 
          });
        }
      } finally {
        setLoadingWards(false);
      }
    };
    fetchWards();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.subcounty, open]);

  // Use normalized status options for consistency across the application
  const projectStatuses = [
    'Completed',
    'Ongoing',
    'Not started',
    'Stalled',
    'Under Procurement',
    'Suspended',
    'Other'
  ];

  const financialYearOptions = (allMetadata?.financialYears?.length ? allMetadata.financialYears : financialYearsFallback) || [];
  const currentFinancialYearName = formData.finYearId || '';
  const financialYearNames = [
    ...new Set([
      ...financialYearOptions.map((fy) => fy.finYearName || fy.name).filter(Boolean),
      currentFinancialYearName,
    ].filter(Boolean)),
  ];
  const sectorOptions = (allMetadata?.sectors?.length ? allMetadata.sectors : sectorsFallback) || [];
  const selectedSector = sectorOptions.find((sector) => {
    const sectorName = sector.sectorName || sector.name || '';
    return sectorName === formData.sector || sector.alias === formData.sector;
  }) || (formData.sector ? { sectorName: formData.sector, subSectors: [] } : null);
  const subSectorOptions = selectedSector?.subSectors || [];
  const selectedSubSector = subSectorOptions.find((subSector) => {
    const subSectorName = subSector.subSectorName || subSector.name || '';
    return String(subSector.id || '') === String(formData.subSectorId || '')
      || subSectorName === formData.subSector;
  }) || (formData.subSector ? { id: formData.subSectorId || '', subSectorName: formData.subSector } : null);

  return (
    <Dialog 
      open={open} 
      onClose={handleClose} 
      fullWidth 
      maxWidth="lg"
      sx={{
        '& .MuiDialog-paper': {
          borderRadius: '12px',
          overflow: 'hidden',
          boxShadow: '0 12px 40px rgba(0, 0, 0, 0.25)',
        },
      }}
    >
      <DialogTitle sx={{ backgroundColor: theme.palette.primary.main, color: 'white', py: 1.25, fontSize: '1.1rem', fontWeight: 700 }}>
        {currentProject ? 'Edit Project' : 'Add New Project'}
      </DialogTitle>
      <DialogContent dividers sx={{ backgroundColor: theme.palette.background.default, padding: '12px 16px', maxHeight: '72vh', overflowY: 'auto' }}>
        <Typography variant="caption" sx={{ display: 'block', color: colors.grey[500], mb: 1, fontStyle: 'italic' }}>
          Fields marked with * are required.
        </Typography>
        {/* Project Details Section */}
        <Paper 
          elevation={0} 
          sx={{ 
            p: 1.25, 
            mb: 1.5, 
            borderRadius: '10px',
            background: colorMode === 'dark' ? colors.primary[400] : colors.grey[50],
            border: `1px solid ${colorMode === 'dark' ? colors.blueAccent[700] : colors.grey[300]}`,
          }}
        >
          <Typography variant="subtitle1" sx={{ color: colors.blueAccent[600], mb: 1, fontWeight: 700, fontSize: '0.9rem' }}>
            Project Details
          </Typography>
          <Grid container spacing={1.5}>
            <Grid item xs={12} sm={6}>
              <TextField 
                autoFocus 
                name="projectName" 
                label="Project Name" 
                type="text" 
                fullWidth 
                variant="outlined" 
                size="small"
                required
                value={formData.projectName} 
                onChange={handleChange} 
                error={!!formErrors.projectName} 
                helperText={formErrors.projectName || "Enter a descriptive name for the project"}
                placeholder="e.g., Construction of New Health Center"
                inputProps={{ maxLength: 200 }}
                sx={{
                  '& .MuiOutlinedInput-root': {
                    '& fieldset': {
                      borderColor: colors.blueAccent[600],
                      borderWidth: '2px',
                    },
                    '&:hover fieldset': {
                      borderColor: colors.blueAccent[500],
                    },
                    '&.Mui-focused fieldset': {
                      borderColor: colors.greenAccent[500],
                      borderWidth: '2px',
                    },
                  },
                                     '& .MuiInputLabel-root': {
                     color: colorMode === 'dark' ? colors.grey[100] : colors.grey[200],
                     fontWeight: 'bold',
                   },
                   '& .MuiInputBase-input': {
                     color: colorMode === 'dark' ? colors.grey[100] : colors.grey[200],
                   },
                }}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth variant="outlined" size="small" sx={{ minWidth: 200 }}>
                <InputLabel sx={{ color: colorMode === 'dark' ? colors.grey[100] : colors.grey[200], fontWeight: 'bold' }}>Status</InputLabel>
                <Select 
                  name="status" 
                  label="Status" 
                  value={formData.status} 
                  onChange={handleChange} 
                  inputProps={{ 'aria-label': 'Select project status' }}
                  sx={{
                    '& .MuiOutlinedInput-root': {
                      '& fieldset': {
                        borderColor: colorMode === 'dark' ? colors.blueAccent[600] : colors.blueAccent[400],
                        borderWidth: '2px',
                      },
                      '&:hover fieldset': {
                        borderColor: colorMode === 'dark' ? colors.blueAccent[500] : colors.blueAccent[300],
                      },
                      '&.Mui-focused fieldset': {
                        borderColor: colorMode === 'dark' ? colors.greenAccent[500] : colors.greenAccent[400],
                        borderWidth: '2px',
                      },
                    },
                  }}
                >
                  {projectStatuses.map(status => (
                    <MenuItem key={status} value={status}>
                      <span style={{ 
                        backgroundColor: getProjectStatusBackgroundColor(status), 
                        color: getProjectStatusTextColor(status), 
                        padding: '6px 12px', 
                        borderRadius: '8px', 
                        display: 'inline-block', 
                        minWidth: '100px', 
                        textAlign: 'center', 
                        fontWeight: 'bold',
                        fontSize: '0.875rem'
                      }}>
                        {status}
                      </span>
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField 
                name="overallProgress" 
                label="Percentage Complete (%)" 
                type="number" 
                fullWidth 
                variant="outlined" 
                size="small"
                value={formData.overallProgress || ''} 
                onChange={handleChange}
                placeholder="e.g., 45"
                error={!!formErrors.overallProgress}
                helperText={formErrors.overallProgress || "Overall project completion percentage (0-100)"}
                inputProps={{ min: 0, max: 100, step: 1 }}
                onBlur={(e) => {
                  // Validate on blur and clamp value if needed
                  const value = parseFloat(e.target.value);
                  if (!isNaN(value)) {
                    if (value < 0) {
                      handleChange({ target: { name: 'overallProgress', value: '0' } });
                    } else if (value > 100) {
                      handleChange({ target: { name: 'overallProgress', value: '100' } });
                    }
                  }
                }}
                sx={{
                  '& .MuiOutlinedInput-root': {
                    '& fieldset': {
                      borderColor: formErrors.overallProgress 
                        ? colors.redAccent[500] 
                        : (colorMode === 'dark' ? colors.blueAccent[600] : colors.blueAccent[400]),
                      borderWidth: '2px',
                    },
                    '&:hover fieldset': {
                      borderColor: formErrors.overallProgress 
                        ? colors.redAccent[600] 
                        : (colorMode === 'dark' ? colors.blueAccent[500] : colors.blueAccent[300]),
                    },
                    '&.Mui-focused fieldset': {
                      borderColor: formErrors.overallProgress 
                        ? colors.redAccent[500] 
                        : (colorMode === 'dark' ? colors.greenAccent[500] : colors.greenAccent[400]),
                      borderWidth: '2px',
                    },
                  },
                  '& .MuiInputLabel-root': {
                    color: colorMode === 'dark' ? colors.grey[100] : colors.grey[200],
                    fontWeight: 'bold',
                  },
                  '& .MuiInputBase-input': {
                    color: colorMode === 'dark' ? colors.grey[100] : colors.grey[200],
                  },
                }}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField 
                name="startDate" 
                label="Start Date" 
                type="date" 
                fullWidth 
                variant="outlined" 
                size="small"
                InputLabelProps={{ shrink: true }} 
                value={formData.startDate} 
                onChange={handleChange} 
                error={!!formErrors.startDate} 
                helperText={formErrors.startDate}
                sx={{
                  '& .MuiOutlinedInput-root': {
                    '& fieldset': {
                      borderColor: colors.blueAccent[600],
                      borderWidth: '2px',
                    },
                    '&:hover fieldset': {
                      borderColor: colors.blueAccent[500],
                    },
                    '&.Mui-focused fieldset': {
                      borderColor: colors.greenAccent[500],
                      borderWidth: '2px',
                    },
                  },
                                     '& .MuiInputLabel-root': {
                     color: colorMode === 'dark' ? colors.grey[100] : colors.grey[200],
                     fontWeight: 'bold',
                   },
                   '& .MuiInputBase-input': {
                     color: colorMode === 'dark' ? colors.grey[100] : colors.grey[200],
                   },
                }}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField 
                name="endDate" 
                label="End Date" 
                type="date" 
                fullWidth 
                variant="outlined" 
                size="small"
                InputLabelProps={{ shrink: true }} 
                value={formData.endDate} 
                onChange={handleChange} 
                error={!!formErrors.endDate || !!formErrors.date_range} 
                helperText={formErrors.endDate || formErrors.date_range}
                sx={{
                  '& .MuiOutlinedInput-root': {
                    '& fieldset': {
                      borderColor: colors.blueAccent[600],
                      borderWidth: '2px',
                    },
                    '&:hover fieldset': {
                      borderColor: colors.blueAccent[500],
                    },
                    '&.Mui-focused fieldset': {
                      borderColor: colors.greenAccent[500],
                      borderWidth: '2px',
                    },
                  },
                                     '& .MuiInputLabel-root': {
                     color: colorMode === 'dark' ? colors.grey[100] : colors.grey[200],
                     fontWeight: 'bold',
                   },
                   '& .MuiInputBase-input': {
                     color: colorMode === 'dark' ? colors.grey[100] : colors.grey[200],
                   },
                }}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                select
                name="finYearId"
                label="Financial Year"
                fullWidth
                required
                variant="outlined"
                size="small"
                value={formData.finYearId || ''}
                onChange={handleChange}
                error={!!formErrors.finYearId}
                helperText={formErrors.finYearId || 'Financial year runs from July 1 to June 30'}
                sx={{ minWidth: 200 }}
              >
                <MenuItem value="">
                  <em>Select financial year</em>
                </MenuItem>
                {financialYearNames.map((name) => (
                  <MenuItem key={name} value={name}>
                    {name}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid item xs={12}>
              <TextField 
                name="projectDescription" 
                label="Project Description" 
                type="text" 
                fullWidth 
                multiline 
                rows={2} 
                variant="outlined" 
                size="small"
                value={formData.projectDescription} 
                onChange={handleChange}
                sx={{
                  '& .MuiOutlinedInput-root': {
                    '& fieldset': {
                      borderColor: colors.blueAccent[600],
                      borderWidth: '2px',
                    },
                    '&:hover fieldset': {
                      borderColor: colors.blueAccent[500],
                    },
                    '&.Mui-focused fieldset': {
                      borderColor: colors.greenAccent[500],
                      borderWidth: '2px',
                    },
                  },
                                     '& .MuiInputLabel-root': {
                     color: colorMode === 'dark' ? colors.grey[100] : colors.grey[200],
                     fontWeight: 'bold',
                   },
                   '& .MuiInputBase-input': {
                     color: colorMode === 'dark' ? colors.grey[100] : colors.grey[200],
                   },
                }}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField 
                name="objective" 
                label="Objective" 
                type="text" 
                fullWidth 
                multiline 
                rows={2} 
                variant="outlined" 
                size="small"
                value={formData.objective} 
                onChange={handleChange}
                sx={{
                  '& .MuiOutlinedInput-root': {
                    '& fieldset': {
                      borderColor: colors.blueAccent[600],
                      borderWidth: '2px',
                    },
                    '&:hover fieldset': {
                      borderColor: colors.blueAccent[500],
                    },
                    '&.Mui-focused fieldset': {
                      borderColor: colors.greenAccent[500],
                      borderWidth: '2px',
                    },
                  },
                                     '& .MuiInputLabel-root': {
                     color: colorMode === 'dark' ? colors.grey[100] : colors.grey[200],
                     fontWeight: 'bold',
                   },
                   '& .MuiInputBase-input': {
                     color: colorMode === 'dark' ? colors.grey[100] : colors.grey[200],
                   },
                }}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField 
                name="expectedOutcome" 
                label="Expected Outcome" 
                type="text" 
                fullWidth 
                multiline 
                rows={2} 
                variant="outlined" 
                size="small"
                value={formData.expectedOutcome} 
                onChange={handleChange}
                sx={{
                  '& .MuiOutlinedInput-root': {
                    '& fieldset': {
                      borderColor: colors.blueAccent[600],
                      borderWidth: '2px',
                    },
                    '&:hover fieldset': {
                      borderColor: colors.blueAccent[500],
                    },
                    '&.Mui-focused fieldset': {
                      borderColor: colors.greenAccent[500],
                      borderWidth: '2px',
                    },
                  },
                                     '& .MuiInputLabel-root': {
                     color: colorMode === 'dark' ? colors.grey[100] : colors.grey[200],
                     fontWeight: 'bold',
                   },
                   '& .MuiInputBase-input': {
                     color: colorMode === 'dark' ? colors.grey[100] : colors.grey[200],
                   },
                }}
              />
            </Grid>
          </Grid>
        </Paper>

        {/* Organizational Details Section */}
        <Paper 
          elevation={0} 
          sx={{ 
            p: 1.25, 
            mb: 1.5, 
            borderRadius: '10px',
            background: colorMode === 'dark' ? colors.primary[400] : colors.grey[50],
            border: `1px solid ${colorMode === 'dark' ? colors.blueAccent[700] : colors.grey[300]}`,
          }}
        >
          <Typography variant="subtitle1" sx={{ color: colors.blueAccent[600], mb: 1, fontWeight: 700, fontSize: '0.9rem' }}>
            Organizational Details
          </Typography>
          <Grid container spacing={1.5}>
            <Grid item xs={12} sm={6}>
              <Autocomplete
                options={sectorOptions}
                value={selectedSector}
                loading={loadingSectorsFallback}
                onChange={(event, newValue) => {
                  const sectorName = newValue ? (newValue.sectorName || newValue.name || '') : '';
                  handleChange({ target: { name: 'sector', value: sectorName } });
                  handleChange({ target: { name: 'subSector', value: '' } });
                  handleChange({ target: { name: 'subSectorId', value: '' } });
                }}
                getOptionLabel={(option) => {
                  if (!option) return '';
                  if (typeof option === 'string') return option;
                  return option.sectorName || option.name || '';
                }}
                isOptionEqualToValue={(option, value) => {
                  const optionName = option?.sectorName || option?.name || '';
                  const valueName = value?.sectorName || value?.name || value || '';
                  return optionName === valueName;
                }}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    name="sector"
                    label="Sector"
                    required
                    variant="outlined"
                    size="small"
                    error={!!formErrors.sector}
                    helperText={formErrors.sector || (loadingSectorsFallback ? 'Loading sectors...' : 'Required; sourced from Sectors metadata')}
                    sx={{ minWidth: 200 }}
                  />
                )}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <Autocomplete
                options={subSectorOptions}
                value={selectedSubSector}
                onChange={(event, newValue) => {
                  handleChange({
                    target: {
                      name: 'subSector',
                      value: newValue ? (newValue.subSectorName || newValue.name || '') : '',
                    },
                  });
                  handleChange({
                    target: {
                      name: 'subSectorId',
                      value: newValue ? (newValue.id || '') : '',
                    },
                  });
                }}
                disabled={!selectedSector}
                getOptionLabel={(option) => {
                  if (!option) return '';
                  if (typeof option === 'string') return option;
                  return option.subSectorName || option.name || '';
                }}
                isOptionEqualToValue={(option, value) => {
                  const optionId = option?.id ? String(option.id) : '';
                  const valueId = value?.id ? String(value.id) : '';
                  const optionName = option?.subSectorName || option?.name || '';
                  const valueName = value?.subSectorName || value?.name || value || '';
                  return (optionId && optionId === valueId) || optionName === valueName;
                }}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    name="subSector"
                    label="Sub-sector"
                    variant="outlined"
                    size="small"
                    helperText={selectedSector ? 'Optional' : 'Select sector first'}
                    sx={{ minWidth: 200 }}
                  />
                )}
              />
            </Grid>
            <Grid item xs={12} sm={8}>
              <Autocomplete
                options={ministryNameOptions}
                value={formData.ministry || null}
                onChange={(event, newValue) => {
                  handleChange({ target: { name: 'ministry', value: newValue || '' } });
                }}
                loading={loadingMinistries}
                disabled={loadingMinistries && ministryNameOptions.length === 0}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    name="ministry"
                    label="Ministry"
                    variant="outlined"
                    size="small"
                    helperText={formErrors.ministry || 'Select ministry from directory'}
                    error={!!formErrors.ministry}
                    sx={{
                      '& .MuiOutlinedInput-root': {
                        '& fieldset': {
                          borderColor: formErrors.ministry ? colors.redAccent[500] : colors.blueAccent[600],
                          borderWidth: '2px',
                        },
                        '&:hover fieldset': {
                          borderColor: formErrors.ministry ? colors.redAccent[600] : colors.blueAccent[500],
                        },
                        '&.Mui-focused fieldset': {
                          borderColor: formErrors.ministry ? colors.redAccent[500] : colors.greenAccent[500],
                          borderWidth: '2px',
                        },
                      },
                      '& .MuiInputLabel-root': {
                        color: colorMode === 'dark' ? colors.grey[100] : colors.grey[200],
                        fontWeight: 'bold',
                      },
                      '& .MuiInputBase-input': {
                        color: colorMode === 'dark' ? colors.grey[100] : colors.grey[200],
                      },
                    }}
                  />
                )}
              />
            </Grid>
          </Grid>
        </Paper>

        {/* Geographical Coverage Section */}
        <Paper 
          elevation={0} 
          sx={{ 
            p: 1.25, 
            mb: 1.5, 
            borderRadius: '10px',
            background: colorMode === 'dark' ? colors.primary[400] : colors.grey[50],
            border: `1px solid ${colorMode === 'dark' ? colors.blueAccent[700] : colors.grey[300]}`,
          }}
        >
          <Typography variant="subtitle1" sx={{ color: colors.blueAccent[600], mb: 1, fontWeight: 700, fontSize: '0.9rem' }}>
            Geographical Coverage
          </Typography>
          <Grid container spacing={1.5}>
            <Grid item xs={12}>
              <Typography variant="caption" color="text.secondary">
                County is fixed to <strong>{DEFAULT_COUNTY.name}</strong>. Select only the project sub-county and ward.
              </Typography>
            </Grid>
            <Grid item xs={12} sm={6} md={4}>
              <Autocomplete
                options={subcounties}
                value={formData.subcounty || null}
                onChange={(event, newValue) => {
                  const newSubcounty = newValue || '';
                  handleChange({ target: { name: 'subcounty', value: newSubcounty } });
                  // Clear ward if sub-county changes
                  if (newSubcounty !== formData.subcounty && formData.ward) {
                    handleChange({ target: { name: 'ward', value: '' } });
                  }
                }}
                loading={loadingSubcounties}
                freeSolo
                sx={{ minWidth: 200 }}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    name="subcounty"
                    label="Sub-county"
                    variant="outlined"
                    size="small"
                    placeholder="Search or select sub-county"
                    sx={{
                      minWidth: 200,
                      '& .MuiOutlinedInput-root': {
                        '& fieldset': {
                          borderColor: colorMode === 'dark' ? colors.blueAccent[600] : colors.blueAccent[400],
                          borderWidth: '2px',
                        },
                        '&:hover fieldset': {
                          borderColor: colorMode === 'dark' ? colors.blueAccent[500] : colors.blueAccent[300],
                        },
                        '&.Mui-focused fieldset': {
                          borderColor: colorMode === 'dark' ? colors.greenAccent[500] : colors.greenAccent[400],
                          borderWidth: '2px',
                        },
                      },
                    }}
                  />
                )}
                filterOptions={(options, params) => {
                  const filtered = options.filter((option) =>
                    option.toLowerCase().includes(params.inputValue.toLowerCase())
                  );
                  return filtered;
                }}
              />
            </Grid>
            <Grid item xs={12} sm={6} md={4}>
              <Autocomplete
                options={wards}
                getOptionLabel={(option) => {
                  if (!option) return '';
                  if (typeof option === 'string') return option;
                  return option.name || '';
                }}
                value={wards.find(w => {
                  const wardName = typeof w === 'string' ? w : w.name || '';
                  return wardName === formData.ward;
                }) || null}
                onChange={(event, newValue) => {
                  let value = '';
                  if (newValue) {
                    value = typeof newValue === 'string' ? newValue : (newValue.name || '');
                  }
                  handleChange({ target: { name: 'ward', value } });
                }}
                loading={loadingWards}
                disabled={!formData.subcounty}
                freeSolo
                sx={{ minWidth: 200 }}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    name="ward"
                    label="Ward"
                    variant="outlined"
                    size="small"
                    placeholder={formData.subcounty ? "Search or select ward" : "Select sub-county first"}
                    sx={{
                      minWidth: 200,
                      '& .MuiOutlinedInput-root': {
                        '& fieldset': {
                          borderColor: colorMode === 'dark' ? colors.blueAccent[600] : colors.blueAccent[400],
                          borderWidth: '2px',
                        },
                        '&:hover fieldset': {
                          borderColor: colorMode === 'dark' ? colors.blueAccent[500] : colors.blueAccent[300],
                        },
                        '&.Mui-focused fieldset': {
                          borderColor: colorMode === 'dark' ? colors.greenAccent[500] : colors.greenAccent[400],
                          borderWidth: '2px',
                        },
                      },
                    }}
                  />
                )}
                filterOptions={(options, params) => {
                  const filtered = options.filter((option) => {
                    const name = typeof option === 'string' ? option : (option.name || '');
                    return name.toLowerCase().includes(params.inputValue.toLowerCase());
                  });
                  return filtered;
                }}
                isOptionEqualToValue={(option, value) => {
                  const optionName = typeof option === 'string' ? option : (option.name || '');
                  const valueName = typeof value === 'string' ? value : (value.name || '');
                  return optionName === valueName;
                }}
              />
            </Grid>
            <Grid item xs={12} sm={6} md={4}>
              <Autocomplete
                options={villageOptions}
                value={formData.village || ''}
                inputValue={formData.village || ''}
                onInputChange={(event, newInputValue) => {
                  handleChange({ target: { name: 'village', value: newInputValue || '' } });
                }}
                onChange={(event, newValue) => {
                  handleChange({ target: { name: 'village', value: newValue || '' } });
                }}
                freeSolo
                sx={{ minWidth: 200 }}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    name="village"
                    label="Village"
                    variant="outlined"
                    size="small"
                    placeholder="Type village name"
                    helperText="Free text; existing villages are suggested"
                    sx={{
                      minWidth: 200,
                      '& .MuiOutlinedInput-root': {
                        '& fieldset': {
                          borderColor: colorMode === 'dark' ? colors.blueAccent[600] : colors.blueAccent[400],
                          borderWidth: '2px',
                        },
                        '&:hover fieldset': {
                          borderColor: colorMode === 'dark' ? colors.blueAccent[500] : colors.blueAccent[300],
                        },
                        '&.Mui-focused fieldset': {
                          borderColor: colorMode === 'dark' ? colors.greenAccent[500] : colors.greenAccent[400],
                          borderWidth: '2px',
                        },
                      },
                    }}
                  />
                )}
                filterOptions={(options, params) => {
                  const input = String(params.inputValue || '').toLowerCase();
                  return options.filter((option) => String(option || '').toLowerCase().includes(input));
                }}
              />
            </Grid>
          </Grid>
        </Paper>


        {/* Additional Details Section */}
        <Paper 
          elevation={0} 
          sx={{ 
            p: 1.25, 
            mb: 1.5, 
            borderRadius: '10px',
            background: colorMode === 'dark' ? colors.primary[400] : colors.grey[50],
            border: `1px solid ${colorMode === 'dark' ? colors.blueAccent[700] : colors.grey[300]}`,
          }}
        >
          <Typography variant="subtitle1" sx={{ color: colors.blueAccent[600], mb: 1, fontWeight: 700, fontSize: '0.9rem' }}>
            Additional Details
          </Typography>
          <Grid container spacing={1.5}>
            {/* Budget Details */}
            <Grid item xs={12} sm={4}>
              <TextField
                name="costOfProject"
                label="Allocated Budget (KES)"
                type="number"
                fullWidth
                variant="outlined"
                size="small"
                value={formData.costOfProject ?? ''}
                onChange={handleChange}
                placeholder="e.g., 70000000"
                helperText="Maps to budget.allocated_amount_kes"
                inputProps={{ min: 0, step: 'any' }}
                sx={{
                  '& .MuiOutlinedInput-root': {
                    '& fieldset': {
                      borderColor: colors.blueAccent[600],
                      borderWidth: '2px',
                    },
                    '&:hover fieldset': {
                      borderColor: colors.blueAccent[500],
                    },
                    '&.Mui-focused fieldset': {
                      borderColor: colors.greenAccent[500],
                      borderWidth: '2px',
                    },
                  },
                  '& .MuiInputLabel-root': {
                    color: colorMode === 'dark' ? colors.grey[100] : colors.grey[200],
                    fontWeight: 'bold',
                  },
                  '& .MuiInputBase-input': {
                    color: colorMode === 'dark' ? colors.grey[100] : colors.grey[200],
                  },
                }}
              />
            </Grid>

            <Grid item xs={12} sm={4}>
              <TextField
                name="Contracted"
                label="Contracted Amount (KES)"
                type="number"
                fullWidth
                variant="outlined"
                size="small"
                value={formData.Contracted ?? ''}
                onChange={handleChange}
                placeholder="e.g., 65000000"
                helperText="Maps to budget.contracted"
                inputProps={{ min: 0, step: 'any' }}
                sx={{
                  '& .MuiOutlinedInput-root': {
                    '& fieldset': {
                      borderColor: colors.blueAccent[600],
                      borderWidth: '2px',
                    },
                    '&:hover fieldset': {
                      borderColor: colors.blueAccent[500],
                    },
                    '&.Mui-focused fieldset': {
                      borderColor: colors.greenAccent[500],
                      borderWidth: '2px',
                    },
                  },
                  '& .MuiInputLabel-root': {
                    color: colorMode === 'dark' ? colors.grey[100] : colors.grey[200],
                    fontWeight: 'bold',
                  },
                  '& .MuiInputBase-input': {
                    color: colorMode === 'dark' ? colors.grey[100] : colors.grey[200],
                  },
                }}
              />
            </Grid>

            <Grid item xs={12} sm={4}>
              <TextField
                name="paidOut"
                label="Paid Amount (KES)"
                type="number"
                fullWidth
                variant="outlined"
                size="small"
                value={formData.paidOut ?? ''}
                onChange={handleChange}
                placeholder="e.g., 30000000"
                helperText="Amount paid against the project budget"
                inputProps={{ min: 0, step: 'any' }}
                sx={{
                  '& .MuiOutlinedInput-root': {
                    '& fieldset': {
                      borderColor: colors.blueAccent[600],
                      borderWidth: '2px',
                    },
                    '&:hover fieldset': {
                      borderColor: colors.blueAccent[500],
                    },
                    '&.Mui-focused fieldset': {
                      borderColor: colors.greenAccent[500],
                      borderWidth: '2px',
                    },
                  },
                  '& .MuiInputLabel-root': {
                    color: colorMode === 'dark' ? colors.grey[100] : colors.grey[200],
                    fontWeight: 'bold',
                  },
                  '& .MuiInputBase-input': {
                    color: colorMode === 'dark' ? colors.grey[100] : colors.grey[200],
                  },
                }}
              />
            </Grid>

            {/* Budget Source */}
            <Grid item xs={12} sm={6}>
              <TextField 
                name="budgetSource" 
                label="Budget Source" 
                type="text" 
                fullWidth 
                variant="outlined" 
                size="small"
                value={formData.budgetSource || ''} 
                onChange={handleChange}
                placeholder="e.g., Government of Kenya, Private Sector Investment"
                helperText="Source of project funding"
                sx={{
                  '& .MuiOutlinedInput-root': {
                    '& fieldset': {
                      borderColor: colors.blueAccent[600],
                      borderWidth: '2px',
                    },
                    '&:hover fieldset': {
                      borderColor: colors.blueAccent[500],
                    },
                    '&.Mui-focused fieldset': {
                      borderColor: colors.greenAccent[500],
                      borderWidth: '2px',
                    },
                  },
                  '& .MuiInputLabel-root': {
                    color: colorMode === 'dark' ? colors.grey[100] : colors.grey[200],
                    fontWeight: 'bold',
                  },
                  '& .MuiInputBase-input': {
                    color: colorMode === 'dark' ? colors.grey[100] : colors.grey[200],
                  },
                }}
              />
            </Grid>

            <Grid item xs={12} sm={6}>
              <TextField
                name="tenderContractNo"
                label="Tender/Contract No"
                type="text"
                fullWidth
                variant="outlined"
                size="small"
                required={!currentProject}
                value={formData.tenderContractNo || ''}
                onChange={handleChange}
                error={Boolean(formErrors.tenderContractNo)}
                placeholder="e.g., KSM/FIN/ONT/001/2026"
                helperText={formErrors.tenderContractNo || (currentProject ? 'Tender or contract reference number' : 'Required for new projects')}
                inputProps={{ maxLength: 120 }}
                sx={{
                  '& .MuiOutlinedInput-root': {
                    '& fieldset': {
                      borderColor: colors.blueAccent[600],
                      borderWidth: '2px',
                    },
                    '&:hover fieldset': {
                      borderColor: colors.blueAccent[500],
                    },
                    '&.Mui-focused fieldset': {
                      borderColor: colors.greenAccent[500],
                      borderWidth: '2px',
                    },
                  },
                  '& .MuiInputLabel-root': {
                    color: colorMode === 'dark' ? colors.grey[100] : colors.grey[200],
                    fontWeight: 'bold',
                  },
                  '& .MuiInputBase-input': {
                    color: colorMode === 'dark' ? colors.grey[100] : colors.grey[200],
                  },
                }}
              />
            </Grid>

            {/* Progress Summary */}
            <Grid item xs={12}>
              <TextField 
                name="progressSummary" 
                label="Progress Summary / Latest Update" 
                type="text" 
                fullWidth 
                multiline 
                rows={2} 
                variant="outlined" 
                size="small"
                value={formData.progressSummary || ''} 
                onChange={handleChange}
                placeholder="Provide a summary of the latest project progress and updates..."
                helperText="Detailed summary of project progress and current status"
                sx={{
                  '& .MuiOutlinedInput-root': {
                    '& fieldset': {
                      borderColor: colors.blueAccent[600],
                      borderWidth: '2px',
                    },
                    '&:hover fieldset': {
                      borderColor: colors.blueAccent[500],
                    },
                    '&.Mui-focused fieldset': {
                      borderColor: colors.greenAccent[500],
                      borderWidth: '2px',
                    },
                  },
                  '& .MuiInputLabel-root': {
                    color: colorMode === 'dark' ? colors.grey[100] : colors.grey[200],
                    fontWeight: 'bold',
                  },
                  '& .MuiInputBase-input': {
                    color: colorMode === 'dark' ? colors.grey[100] : colors.grey[200],
                  },
                }}
              />
            </Grid>

            {/* Geocoordinates */}
            <Grid item xs={12}>
              <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 'bold', color: colors.blueAccent[300] }}>
                📍 Project Location Coordinates (Optional)
              </Typography>
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField 
                name="latitude" 
                label="Latitude" 
                type="number" 
                fullWidth 
                variant="outlined" 
                size="small"
                value={formData.latitude || ''} 
                onChange={handleChange}
                placeholder="e.g., -1.2921"
                inputProps={{ step: "0.0001" }}
                helperText="Decimal degrees (e.g., -1.2921)"
                sx={{
                  '& .MuiOutlinedInput-root': {
                    '& fieldset': {
                      borderColor: colors.blueAccent[600],
                      borderWidth: '2px',
                    },
                    '&:hover fieldset': {
                      borderColor: colors.blueAccent[500],
                    },
                    '&.Mui-focused fieldset': {
                      borderColor: colors.greenAccent[500],
                      borderWidth: '2px',
                    },
                  },
                  '& .MuiInputLabel-root': {
                    color: colorMode === 'dark' ? colors.grey[100] : colors.grey[200],
                    fontWeight: 'bold',
                  },
                  '& .MuiInputBase-input': {
                    color: colorMode === 'dark' ? colors.grey[100] : colors.grey[200],
                  },
                }}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField 
                name="longitude" 
                label="Longitude" 
                type="number" 
                fullWidth 
                variant="outlined" 
                size="small"
                value={formData.longitude || ''} 
                onChange={handleChange}
                placeholder="e.g., 36.8219"
                inputProps={{ step: "0.0001" }}
                helperText="Decimal degrees (e.g., 36.8219)"
                sx={{
                  '& .MuiOutlinedInput-root': {
                    '& fieldset': {
                      borderColor: colors.blueAccent[600],
                      borderWidth: '2px',
                    },
                    '&:hover fieldset': {
                      borderColor: colors.blueAccent[500],
                    },
                    '&.Mui-focused fieldset': {
                      borderColor: colors.greenAccent[500],
                      borderWidth: '2px',
                    },
                  },
                  '& .MuiInputLabel-root': {
                    color: colorMode === 'dark' ? colors.grey[100] : colors.grey[200],
                    fontWeight: 'bold',
                  },
                  '& .MuiInputBase-input': {
                    color: colorMode === 'dark' ? colors.grey[100] : colors.grey[200],
                  },
                }}
              />
            </Grid>

            {/* Public Engagement */}
            <Grid item xs={12}>
              <Typography variant="subtitle2" sx={{ mb: 1, mt: 1, fontWeight: 'bold', color: colors.blueAccent[300] }}>
                💬 Public Engagement
              </Typography>
            </Grid>
            <Grid item xs={12} sm={4}>
              <FormControl fullWidth size="small">
                <InputLabel sx={{ color: colorMode === 'dark' ? colors.grey[100] : colors.grey[200], fontWeight: 'bold' }}>
                  Feedback Enabled
                </InputLabel>
                <Select
                  name="feedbackEnabled"
                  value={formData.feedbackEnabled !== undefined ? formData.feedbackEnabled : true}
                  onChange={handleChange}
                  sx={{
                    '& .MuiOutlinedInput-notchedOutline': {
                      borderColor: colors.blueAccent[600],
                      borderWidth: '2px',
                    },
                    '&:hover .MuiOutlinedInput-notchedOutline': {
                      borderColor: colors.blueAccent[500],
                    },
                    '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                      borderColor: colors.greenAccent[500],
                      borderWidth: '2px',
                    },
                    '& .MuiSelect-select': {
                      color: colorMode === 'dark' ? colors.grey[100] : colors.grey[200],
                    },
                    minWidth: 200,
                  }}
                >
                  <MenuItem value={true}>Yes</MenuItem>
                  <MenuItem value={false}>No</MenuItem>
                </Select>
              </FormControl>
            </Grid>
          </Grid>
        </Paper>
      </DialogContent>
      <DialogActions 
        sx={{ 
          padding: '12px 16px', 
          borderTop: colorMode === 'dark' 
            ? `1px solid ${colors.blueAccent[700]}`
            : `1px solid ${colors.blueAccent[300]}`,
          background: colorMode === 'dark'
            ? `linear-gradient(135deg, ${colors.primary[500]}, ${colors.primary[600]})`
            : `linear-gradient(135deg, ${colors.grey[800]}, ${colors.grey[700]})`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          boxShadow: colorMode === 'dark'
            ? '0 -4px 20px rgba(0, 0, 0, 0.3)'
            : '0 -2px 10px rgba(0, 0, 0, 0.1)'
        }}
      >
        <Button 
          onClick={handleClose} 
          variant="outlined"
          size="small"
          sx={{
            borderColor: colorMode === 'dark' ? colors.blueAccent[600] : colors.blueAccent[400],
            color: colorMode === 'dark' ? colors.blueAccent[600] : colors.blueAccent[400],
            fontWeight: 'bold',
            px: 2.5,
            py: 0.9,
            borderRadius: '8px',
            borderWidth: '1.5px',
            textTransform: 'none',
            fontSize: '0.9rem',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
            '&:hover': {
              borderColor: colorMode === 'dark' ? colors.blueAccent[500] : colors.blueAccent[300],
              backgroundColor: colorMode === 'dark' ? colors.blueAccent[500] : colors.blueAccent[300],
              color: 'white',
              transform: 'translateY(-1px)',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.25)',
            },
            transition: 'all 0.2s ease-in-out'
          }}
        >
          Cancel
        </Button>
        <Button 
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            handleSubmit();
          }} 
          variant="contained" 
          disabled={loading}
          size="small"
          sx={{
            background: colorMode === 'dark'
              ? `linear-gradient(135deg, ${colors.greenAccent[600]}, ${colors.greenAccent[500]})`
              : `linear-gradient(135deg, ${colors.greenAccent[500]}, ${colors.greenAccent[400]})`,
            color: 'white',
            fontWeight: 'bold',
            px: 3,
            py: 0.9,
            borderRadius: '8px',
            textTransform: 'none',
            fontSize: '0.9rem',
            boxShadow: colorMode === 'dark'
              ? '0 4px 16px rgba(0, 0, 0, 0.25)'
              : '0 3px 12px rgba(0, 0, 0, 0.2)',
            '&:hover': {
              background: colorMode === 'dark'
                ? `linear-gradient(135deg, ${colors.greenAccent[700]}, ${colors.greenAccent[600]})`
                : `linear-gradient(135deg, ${colors.greenAccent[600]}, ${colors.greenAccent[500]})`,
              transform: 'translateY(-1px)',
              boxShadow: colorMode === 'dark'
                ? '0 6px 24px rgba(0, 0, 0, 0.35)'
                : '0 5px 18px rgba(0, 0, 0, 0.3)',
            },
            '&:disabled': {
              background: colorMode === 'dark' ? colors.grey[600] : colors.grey[500],
              color: colorMode === 'dark' ? colors.grey[300] : colors.grey[200],
              boxShadow: 'none',
              transform: 'none'
            },
            transition: 'all 0.2s ease-in-out'
          }}
        >
          {loading ? 'Processing...' : (currentProject ? 'Update Project' : 'Create Project')}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ProjectFormDialog;
