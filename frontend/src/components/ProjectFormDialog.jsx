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
import { normalizeProjectStatus } from '../utils/projectStatusNormalizer';
import apiService from '../api';

const ProjectFormDialog = ({
  open,
  handleClose,
  currentProject,
  onFormSuccess,
  setSnackbar,
  allMetadata, // Now includes projectCategories
  user,
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
    handleMultiSelectChange,
    handleSubmit,
    formSubcounties,
    formWards,
  } = useProjectForm(currentProject, allMetadata, onFormSuccess, setSnackbar, user);

  // State for Kenya wards dropdowns
  const [counties, setCounties] = useState([]);
  const [constituencies, setConstituencies] = useState([]);
  const [wards, setWards] = useState([]);
  const [loadingCounties, setLoadingCounties] = useState(false);
  const [loadingConstituencies, setLoadingConstituencies] = useState(false);
  const [loadingWards, setLoadingWards] = useState(false);

  // State for agencies dropdown
  const [agencies, setAgencies] = useState([]);
  const [loadingAgencies, setLoadingAgencies] = useState(false);

  // State for sectors dropdown
  const [sectors, setSectors] = useState([]);
  const [loadingSectors, setLoadingSectors] = useState(false);

  // Fetch counties on mount - only if dialog is open
  useEffect(() => {
    if (!open) return;
    
    const fetchCounties = async () => {
      setLoadingCounties(true);
      try {
        const data = await apiService.kenyaWards.getCounties();
        setCounties(data);
      } catch (error) {
        console.error('Error fetching counties:', error);
        // Don't show snackbar on mount - might be too aggressive
        // setSnackbar({ 
        //   open: true, 
        //   message: 'Failed to load counties. Please try again.', 
        //   severity: 'error' 
        // });
      } finally {
        setLoadingCounties(false);
      }
    };
    fetchCounties();
  }, [open]);

  // Fetch agencies on mount - only if dialog is open
  useEffect(() => {
    if (!open) return;
    
    const fetchAgencies = async () => {
      setLoadingAgencies(true);
      try {
        const data = await apiService.agencies.getAllAgencies();
        setAgencies(data);
      } catch (error) {
        console.error('Error fetching agencies:', error);
      } finally {
        setLoadingAgencies(false);
      }
    };
    fetchAgencies();
  }, [open]);

  // Fetch sectors on mount - only if dialog is open
  useEffect(() => {
    if (!open) return;
    
    const fetchSectors = async () => {
      setLoadingSectors(true);
      try {
        const data = await apiService.sectors.getAllSectors();
        setSectors(data);
      } catch (error) {
        console.error('Error fetching sectors:', error);
      } finally {
        setLoadingSectors(false);
      }
    };
    fetchSectors();
  }, [open]);

  // Fetch constituencies when county changes
  useEffect(() => {
    if (!open) return;
    
    const fetchConstituencies = async () => {
      if (!formData.county) {
        setConstituencies([]);
        setWards([]);
        // Clear constituency and ward when county is cleared
        if (formData.constituency || formData.ward) {
          // Use a ref to avoid infinite loops - update formData directly via setFormData if available
          // For now, just clear the local state
        }
        return;
      }
      setLoadingConstituencies(true);
      try {
        const data = await apiService.kenyaWards.getConstituenciesByCounty(formData.county);
        setConstituencies(data);
        // Clear constituency and ward when county changes - use a flag to prevent re-triggering
        const hadConstituency = formData.constituency;
        const hadWard = formData.ward;
        if (hadConstituency || hadWard) {
          // Update formData directly to avoid triggering handleChange which might cause loops
          // We'll let the parent handle this through the formData prop
        }
      } catch (error) {
        console.error('Error fetching constituencies:', error);
        // Only show error if dialog is open and user is interacting
        if (open) {
          setSnackbar({ 
            open: true, 
            message: 'Failed to load constituencies. Please try again.', 
            severity: 'error' 
          });
        }
      } finally {
        setLoadingConstituencies(false);
      }
    };
    fetchConstituencies();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.county, open]);

  // Fetch wards when constituency changes
  useEffect(() => {
    if (!open) return;
    
    const fetchWards = async () => {
      if (!formData.constituency) {
        setWards([]);
        return;
      }
      setLoadingWards(true);
      try {
        const data = await apiService.kenyaWards.getWardsByConstituency(formData.constituency);
        setWards(data);
        // Don't clear ward here - let user keep their selection if they change constituency back
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
  }, [formData.constituency, open]);

  // Format currency
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-KE', {
      style: 'currency',
      currency: 'KES',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

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

  return (
    <Dialog 
      open={open} 
      onClose={handleClose} 
      fullWidth 
      maxWidth="lg"
      sx={{
        '& .MuiDialog-paper': {
          borderRadius: '20px',
          overflow: 'hidden',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
        },
        '@keyframes shimmer': {
          '0%': { backgroundPosition: '200% 0' },
          '100%': { backgroundPosition: '-200% 0' },
        }
      }}
    >
      <DialogTitle 
        sx={{ 
          background: `linear-gradient(135deg, ${colors.blueAccent[700]}, ${colors.blueAccent[600]})`,
          color: 'white', 
          padding: '16px 24px',
          position: 'relative',
          overflow: 'hidden',
          '&::before': {
            content: '""',
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: '4px',
            background: `linear-gradient(90deg, ${colors.greenAccent[500]}, ${colors.blueAccent[400]}, ${colors.greenAccent[500]})`,
            backgroundSize: '200% 100%',
            animation: 'shimmer 3s ease-in-out infinite',
          },
          '&::after': {
            content: '""',
            position: 'absolute',
            top: '50%',
            right: '24px',
            transform: 'translateY(-50%)',
            width: '40px',
            height: '40px',
            background: `radial-gradient(circle, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.05) 50%, transparent 100%)`,
            borderRadius: '50%',
          }
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Box 
            sx={{ 
              width: '36px', 
              height: '36px', 
              borderRadius: '50%',
              background: `linear-gradient(135deg, ${colors.greenAccent[500]}, ${colors.blueAccent[400]})`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 3px 12px rgba(0, 0, 0, 0.2)',
              border: '2px solid rgba(255, 255, 255, 0.3)',
              fontSize: '16px'
            }}
          >
            {currentProject ? '✏️' : '🚀'}
          </Box>
          <Box>
            <Typography 
              variant="h5" 
              sx={{ 
                fontWeight: 'bold', 
                textShadow: '0 2px 4px rgba(0, 0, 0, 0.3)',
                mb: 0.25,
                lineHeight: 1.2
              }}
            >
              {currentProject ? 'Edit Project' : 'Add New Project'}
            </Typography>
            <Typography 
              variant="body2" 
              sx={{ 
                opacity: 0.9, 
                fontWeight: 500,
                textShadow: '0 1px 2px rgba(0, 0, 0, 0.3)',
                fontSize: '0.875rem',
                lineHeight: 1.3
              }}
            >
              {currentProject ? 'Update project information and details' : 'Create a new project with comprehensive details'}
            </Typography>
          </Box>
        </Box>
      </DialogTitle>
              <DialogContent dividers sx={{ backgroundColor: colors.primary[400], padding: '16px' }}>
        {/* Project Details Section */}
        <Paper 
          elevation={0} 
          sx={{ 
            p: 2, 
            mb: 2.5, 
            borderRadius: '16px',
            background: colorMode === 'dark' 
              ? `linear-gradient(145deg, ${colors.primary[300]}, ${colors.primary[400]})`
              : `linear-gradient(145deg, ${colors.grey[900]}, ${colors.grey[800]})`,
            border: `1px solid ${colors.blueAccent[700]}`,
            boxShadow: `0 6px 24px rgba(0, 0, 0, 0.08)`,
            position: 'relative',
            '&::before': {
              content: '""',
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: '4px',
              background: `linear-gradient(90deg, ${colors.greenAccent[500]}, ${colors.blueAccent[500]})`,
              borderRadius: '16px 16px 0 0',
            }
          }}
        >
          <Typography 
            variant="h6" 
            gutterBottom 
            sx={{ 
              color: colorMode === 'dark' ? colors.blueAccent[700] : colors.blueAccent[300], 
              mb: 2, 
              fontWeight: 'bold',
              display: 'flex',
              alignItems: 'center',
              gap: 1
            }}
          >
            📋 Project Details
          </Typography>
          <Grid container spacing={2}>
            {/* Project Type - determines which site fields are shown */}
            <Grid item xs={12} sm={6}>
              <FormControl 
                fullWidth 
                variant="outlined" 
                size="small" 
                error={!!formErrors.categoryId}
                sx={{ minWidth: 200 }}
              >
                <InputLabel sx={{ color: colorMode === 'dark' ? colors.grey[100] : colors.grey[200], fontWeight: 'bold' }}>
                  Project Type
                </InputLabel>
                <Select 
                  name="categoryId" 
                  label="Project Type"
                  value={formData.categoryId ? String(formData.categoryId) : ''} 
                  onChange={handleChange}
                  sx={{
                    '& .MuiOutlinedInput-root': {
                      '& fieldset': {
                        borderColor: formErrors.categoryId ? colors.redAccent[500] : colors.blueAccent[600],
                        borderWidth: '2px',
                      },
                      '&:hover fieldset': {
                        borderColor: formErrors.categoryId ? colors.redAccent[600] : colors.blueAccent[500],
                      },
                      '&.Mui-focused fieldset': {
                        borderColor: formErrors.categoryId ? colors.redAccent[500] : colors.greenAccent[500],
                        borderWidth: '2px',
                      },
                    },
                  }}
                >
                  {(() => {
                    const categories = allMetadata?.projectCategories;
                    // Remove the console.warn to reduce noise - categories will be logged in useProjectData
                    if (!categories || categories.length === 0) {
                      return (
                        <MenuItem disabled value="">
                          {categories === undefined ? 'Loading project types...' : 'No project types available. Please add project types first.'}
                        </MenuItem>
                      );
                    }
                    return categories.map((category) => (
                      <MenuItem key={category.categoryId} value={String(category.categoryId)}>
                        {category.categoryName}
                      </MenuItem>
                    ));
                  })()}
                </Select>
                {formErrors.categoryId && (
                  <Typography variant="caption" sx={{ color: colors.redAccent[500], mt: 0.5, ml: 1.75 }}>
                    {formErrors.categoryId}
                  </Typography>
                )}
              </FormControl>
            </Grid>
            {/* Sector Field */}
            <Grid item xs={12} sm={6}>
              <Autocomplete
                options={sectors}
                getOptionLabel={(option) => typeof option === 'string' ? option : (option.sectorName || option.name || '')}
                value={sectors.find(s => (s.sectorName || s.name) === formData.sector) || null}
                onChange={(event, newValue) => {
                  if (newValue) {
                    handleChange({ target: { name: 'sector', value: newValue.sectorName || newValue.name } });
                  } else {
                    handleChange({ target: { name: 'sector', value: '' } });
                  }
                }}
                loading={loadingSectors}
                freeSolo
                sx={{ minWidth: 200 }}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    name="sector"
                    label="Sector"
                    variant="outlined"
                    size="small"
                    required
                    placeholder="Search or select sector"
                    helperText={formErrors.sector || "Select the government sector for this project"}
                    error={!!formErrors.sector}
                    sx={{
                      minWidth: 200,
                      '& .MuiOutlinedInput-root': {
                        '& fieldset': {
                          borderColor: formErrors.sector 
                            ? (colorMode === 'dark' ? colors.redAccent[500] : colors.redAccent[400])
                            : (colorMode === 'dark' ? colors.blueAccent[600] : colors.blueAccent[400]),
                          borderWidth: '2px',
                        },
                        '&:hover fieldset': {
                          borderColor: formErrors.sector 
                            ? (colorMode === 'dark' ? colors.redAccent[600] : colors.redAccent[500])
                            : (colorMode === 'dark' ? colors.blueAccent[500] : colors.blueAccent[300]),
                        },
                        '&.Mui-focused fieldset': {
                          borderColor: formErrors.sector 
                            ? (colorMode === 'dark' ? colors.redAccent[500] : colors.redAccent[400])
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
                )}
                filterOptions={(options, params) => {
                  const filtered = options.filter((option) => {
                    const sectorName = typeof option === 'string' ? option : (option.sectorName || option.name || '');
                    return sectorName.toLowerCase().includes(params.inputValue.toLowerCase());
                  });
                  return filtered;
                }}
              />
            </Grid>
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
              <Autocomplete
                options={agencies}
                getOptionLabel={(option) => typeof option === 'string' ? option : (option.agency_name || '')}
                value={agencies.find(a => a.agency_name === formData.directorate) || null}
                onChange={(event, newValue) => {
                  if (newValue) {
                    // Set implementing agency
                    handleChange({ target: { name: 'directorate', value: newValue.agency_name } });
                    // Prefill ministry and state department
                    handleChange({ target: { name: 'ministry', value: newValue.ministry || '' } });
                    handleChange({ target: { name: 'stateDepartment', value: newValue.state_department || '' } });
                  } else {
                    // Clear all fields if agency is cleared
                    handleChange({ target: { name: 'directorate', value: '' } });
                  }
                }}
                loading={loadingAgencies}
                freeSolo
                sx={{ minWidth: 200 }}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    name="directorate"
                    label="Implementing Agency"
                    variant="outlined"
                    size="small"
                    required
                    placeholder="Search or select agency"
                    helperText={formErrors.directorate || "The organization responsible for project implementation"}
                    error={!!formErrors.directorate}
                    sx={{
                      minWidth: 200,
                      '& .MuiOutlinedInput-root': {
                        '& fieldset': {
                          borderColor: formErrors.directorate 
                            ? (colorMode === 'dark' ? colors.redAccent[500] : colors.redAccent[400])
                            : (colorMode === 'dark' ? colors.blueAccent[600] : colors.blueAccent[400]),
                          borderWidth: '2px',
                        },
                        '&:hover fieldset': {
                          borderColor: formErrors.directorate 
                            ? (colorMode === 'dark' ? colors.redAccent[600] : colors.redAccent[500])
                            : (colorMode === 'dark' ? colors.blueAccent[500] : colors.blueAccent[300]),
                        },
                        '&.Mui-focused fieldset': {
                          borderColor: formErrors.directorate 
                            ? (colorMode === 'dark' ? colors.redAccent[500] : colors.redAccent[400])
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
                )}
                filterOptions={(options, params) => {
                  const filtered = options.filter((option) => {
                    const agencyName = typeof option === 'string' ? option : (option.agency_name || '');
                    return agencyName.toLowerCase().includes(params.inputValue.toLowerCase());
                  });
                  return filtered;
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
            p: 2, 
            mb: 2.5, 
            borderRadius: '16px',
            background: colorMode === 'dark' 
              ? `linear-gradient(145deg, ${colors.primary[300]}, ${colors.primary[400]})`
              : `linear-gradient(145deg, ${colors.grey[900]}, ${colors.grey[800]})`,
            border: `1px solid ${colors.blueAccent[700]}`,
            boxShadow: `0 6px 24px rgba(0, 0, 0, 0.08)`,
            position: 'relative',
            '&::before': {
              content: '""',
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: '4px',
              background: `linear-gradient(90deg, ${colors.greenAccent[500]}, ${colors.blueAccent[500]})`,
              borderRadius: '16px 16px 0 0',
            }
          }}
        >
          <Typography 
            variant="h6" 
            gutterBottom 
            sx={{ 
              color: colorMode === 'dark' ? colors.blueAccent[700] : colors.blueAccent[300], 
              mb: 2, 
              fontWeight: 'bold',
              display: 'flex',
              alignItems: 'center',
              gap: 1
            }}
          >
            🏢 Organizational Details
          </Typography>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
              <TextField 
                name="ministry" 
                label="Ministry" 
                type="text" 
                fullWidth 
                variant="outlined" 
                size="small"
                value={formData.ministry || ''} 
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
            <Grid item xs={12} sm={6}>
              <TextField 
                name="stateDepartment" 
                label="State Department" 
                type="text" 
                fullWidth 
                variant="outlined" 
                size="small"
                value={formData.stateDepartment || ''} 
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

        {/* Geographical Coverage Section */}
        <Paper 
          elevation={0} 
          sx={{ 
            p: 2, 
            borderRadius: '16px',
            background: colorMode === 'dark' 
              ? `linear-gradient(145deg, ${colors.primary[300]}, ${colors.primary[400]})`
              : `linear-gradient(145deg, ${colors.grey[900]}, ${colors.grey[800]})`,
            border: `1px solid ${colors.blueAccent[700]}`,
            boxShadow: `0 6px 24px rgba(0, 0, 0, 0.08)`,
            position: 'relative',
            '&::before': {
              content: '""',
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: '4px',
              background: `linear-gradient(90deg, ${colors.greenAccent[500]}, ${colors.blueAccent[500]})`,
              borderRadius: '16px 16px 0 0',
            }
          }}
        >
          <Typography 
            variant="h6" 
            gutterBottom 
            sx={{ 
              color: colorMode === 'dark' ? colors.blueAccent[700] : colors.blueAccent[300], 
              mb: 2, 
              fontWeight: 'bold',
              display: 'flex',
              alignItems: 'center',
              gap: 1
            }}
          >
            📍 Geographical Coverage
            <Typography component="span" variant="caption" sx={{ ml: 1, opacity: 0.7, fontWeight: 'normal' }}>
              (Select Counties, Constituencies, and Wards)
            </Typography>
          </Typography>
          <Grid container spacing={2}>
            {/* Searchable dropdowns for County, Constituency, Ward */}
            <Grid item xs={12} sm={4}>
              <Autocomplete
                options={counties}
                value={formData.county || null}
                onChange={(event, newValue) => {
                  const newCounty = newValue || '';
                  handleChange({ target: { name: 'county', value: newCounty } });
                  // Clear constituency and ward if county changes
                  if (newCounty !== formData.county) {
                    if (formData.constituency) {
                      handleChange({ target: { name: 'constituency', value: '' } });
                    }
                    if (formData.ward) {
                      handleChange({ target: { name: 'ward', value: '' } });
                    }
                  }
                }}
                loading={loadingCounties}
                freeSolo
                sx={{ minWidth: 200 }}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    name="county"
                    label="County"
                    variant="outlined"
                    size="small"
                    placeholder="Search or select county"
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
            <Grid item xs={12} sm={4}>
              <Autocomplete
                options={constituencies}
                value={formData.constituency || null}
                onChange={(event, newValue) => {
                  const newConstituency = newValue || '';
                  handleChange({ target: { name: 'constituency', value: newConstituency } });
                  // Clear ward if constituency changes
                  if (newConstituency !== formData.constituency && formData.ward) {
                    handleChange({ target: { name: 'ward', value: '' } });
                  }
                }}
                loading={loadingConstituencies}
                disabled={!formData.county}
                freeSolo
                sx={{ minWidth: 200 }}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    name="constituency"
                    label="Constituency"
                    variant="outlined"
                    size="small"
                    placeholder={formData.county ? "Search or select constituency" : "Select county first"}
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
            <Grid item xs={12} sm={4}>
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
                disabled={!formData.constituency}
                freeSolo
                sx={{ minWidth: 200 }}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    name="ward"
                    label="Ward"
                    variant="outlined"
                    size="small"
                    placeholder={formData.constituency ? "Search or select ward" : "Select constituency first"}
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
          </Grid>
        </Paper>


        {/* Additional Details Section */}
        <Paper 
          elevation={0} 
          sx={{ 
            p: 2, 
            mb: 2.5, 
            borderRadius: '16px',
            background: colorMode === 'dark' 
              ? `linear-gradient(145deg, ${colors.primary[300]}, ${colors.primary[400]})`
              : `linear-gradient(145deg, ${colors.grey[900]}, ${colors.grey[800]})`,
            border: `1px solid ${colors.blueAccent[700]}`,
            boxShadow: `0 6px 24px rgba(0, 0, 0, 0.08)`,
            position: 'relative',
            '&::before': {
              content: '""',
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: '4px',
              background: `linear-gradient(90deg, ${colors.greenAccent[500]}, ${colors.blueAccent[500]})`,
              borderRadius: '16px 16px 0 0',
            }
          }}
        >
          <Typography 
            variant="h6" 
            gutterBottom 
            sx={{ 
              color: colorMode === 'dark' ? colors.blueAccent[700] : colors.blueAccent[300], 
              mb: 2, 
              fontWeight: 'bold',
              display: 'flex',
              alignItems: 'center',
              gap: 1
            }}
          >
            📋 Additional Details
          </Typography>
          
          <Grid container spacing={2}>
            {/* Budget Details */}
            <Grid item xs={12} sm={6}>
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

            <Grid item xs={12} sm={6}>
              <TextField
                name="paidOut"
                label="Disbursed Amount (KES)"
                type="number"
                fullWidth
                variant="outlined"
                size="small"
                value={formData.paidOut ?? ''}
                onChange={handleChange}
                placeholder="e.g., 30000000"
                helperText="Maps to budget.disbursed_amount_kes"
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

            {/* Progress Summary */}
            <Grid item xs={12}>
              <TextField 
                name="progressSummary" 
                label="Progress Summary / Latest Update" 
                type="text" 
                fullWidth 
                multiline 
                rows={3} 
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
          padding: '20px 24px', 
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
          sx={{
            borderColor: colorMode === 'dark' ? colors.blueAccent[600] : colors.blueAccent[400],
            color: colorMode === 'dark' ? colors.blueAccent[600] : colors.blueAccent[400],
            fontWeight: 'bold',
            px: 3,
            py: 1.2,
            borderRadius: '10px',
            borderWidth: '2px',
            textTransform: 'none',
            fontSize: '0.95rem',
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
          sx={{
            background: colorMode === 'dark'
              ? `linear-gradient(135deg, ${colors.greenAccent[600]}, ${colors.greenAccent[500]})`
              : `linear-gradient(135deg, ${colors.greenAccent[500]}, ${colors.greenAccent[400]})`,
            color: 'white',
            fontWeight: 'bold',
            px: 4,
            py: 1.2,
            borderRadius: '10px',
            textTransform: 'none',
            fontSize: '0.95rem',
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
