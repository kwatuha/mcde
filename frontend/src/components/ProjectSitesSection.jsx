// src/components/ProjectSitesSection.jsx
import React from 'react';
import {
  Box, Typography, TextField, Button, Grid, Paper, IconButton, FormControl, InputLabel, Select, MenuItem,
  Accordion, AccordionSummary, AccordionDetails, Chip, Divider
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import LocationOnIcon from '@mui/icons-material/LocationOn';

const ProjectSitesSection = ({ 
  sites, 
  onSitesChange, 
  allMetadata, 
  colors, 
  colorMode,
  formSubcounties,
  formWards,
  projectCategoryId, // Category ID to determine which fields to show
}) => {
  // Determine which fields to show based on project category
  const getVisibleFields = () => {
    if (!projectCategoryId || !allMetadata?.projectCategories) {
      return { units: true, stalls: true, bed_capacity: true, acreage: true }; // Show all
    }
    
    const category = allMetadata.projectCategories.find(c => c.categoryId === projectCategoryId);
    if (!category) {
      return { units: true, stalls: true, bed_capacity: true, acreage: true };
    }
    
    const categoryName = (category.categoryName || '').toLowerCase();
    
    // Healthcare projects
    if (categoryName.includes('health') || categoryName.includes('hospital') || categoryName.includes('clinic')) {
      return { units: true, bed_capacity: true, acreage: true, stalls: false };
    }
    
    // Education projects
    if (categoryName.includes('education') || categoryName.includes('school') || categoryName.includes('classroom')) {
      return { units: true, acreage: true, stalls: false, bed_capacity: false };
    }
    
    // Market projects
    if (categoryName.includes('market') || categoryName.includes('trading')) {
      return { stalls: true, units: true, acreage: true, bed_capacity: false };
    }
    
    // Infrastructure (roads, bridges, etc.)
    if (categoryName.includes('road') || categoryName.includes('bridge') || categoryName.includes('infrastructure')) {
      return { units: true, acreage: true, stalls: false, bed_capacity: false };
    }
    
    // Default: show all
    return { units: true, stalls: true, bed_capacity: true, acreage: true };
  };

  const visibleFields = getVisibleFields();
  const handleAddSite = () => {
    const newSite = {
      site_name: '',
      site_level: 'site',
      region: '',
      county: '',
      constituency: '',
      ward: '',
      status_norm: 'Not Started',
      percent_complete: 0,
      contract_sum_kes: '',
      approved_cost_kes: '',
      amount_disbursed_kes: '',
      units: '',
      stalls: '',
      bed_capacity: '',
      acreage: '',
      start_date: '',
      end_date: '',
      remarks: '',
      key_issues: '',
      suggested_solutions: '',
    };
    onSitesChange([...sites, newSite]);
  };

  const handleRemoveSite = (index) => {
    const newSites = sites.filter((_, i) => i !== index);
    onSitesChange(newSites);
  };

  const handleSiteChange = (index, field, value) => {
    const newSites = [...sites];
    newSites[index] = { ...newSites[index], [field]: value };
    onSitesChange(newSites);
  };

  // Get available counties, subcounties, and wards from metadata
  const availableCounties = allMetadata?.counties || [];
  const availableSubcounties = formSubcounties || [];
  const availableWards = formWards || [];

  return (
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
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography 
          variant="h6" 
          sx={{ 
            color: colorMode === 'dark' ? colors.blueAccent[700] : colors.blueAccent[300], 
            fontWeight: 'bold',
            display: 'flex',
            alignItems: 'center',
            gap: 1
          }}
        >
          <LocationOnIcon />
          Project Sites
          <Typography component="span" variant="caption" sx={{ ml: 1, opacity: 0.7, fontWeight: 'normal' }}>
            (Add multiple locations for this project)
          </Typography>
        </Typography>
        <Button
          startIcon={<AddIcon />}
          onClick={handleAddSite}
          variant="contained"
          size="small"
          sx={{
            background: `linear-gradient(135deg, ${colors.greenAccent[600]}, ${colors.greenAccent[500]})`,
            color: 'white',
            fontWeight: 'bold',
            textTransform: 'none',
            borderRadius: '8px',
            '&:hover': {
              background: `linear-gradient(135deg, ${colors.greenAccent[700]}, ${colors.greenAccent[600]})`,
            }
          }}
        >
          Add Site
        </Button>
      </Box>

      {sites.length === 0 ? (
        <Box 
          sx={{ 
            textAlign: 'center', 
            py: 4, 
            color: colorMode === 'dark' ? colors.grey[300] : colors.grey[400],
            border: `2px dashed ${colors.blueAccent[600]}`,
            borderRadius: '12px',
            background: colorMode === 'dark' ? colors.primary[500] : colors.grey[700],
          }}
        >
          <Typography variant="body1" sx={{ mb: 1 }}>
            No sites added yet
          </Typography>
          <Typography variant="body2" sx={{ opacity: 0.7 }}>
            Click "Add Site" to add project locations
          </Typography>
        </Box>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {sites.map((site, index) => (
            <Accordion 
              key={index}
              defaultExpanded={index === 0}
              sx={{
                borderRadius: '12px',
                border: `1px solid ${colors.blueAccent[600]}`,
                background: colorMode === 'dark' ? colors.primary[500] : colors.grey[700],
                '&:before': { display: 'none' },
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
              }}
            >
              <AccordionSummary
                expandIcon={<ExpandMoreIcon sx={{ color: colors.blueAccent[500] }} />}
                sx={{
                  '& .MuiAccordionSummary-content': {
                    alignItems: 'center',
                    gap: 2,
                  }
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: 1 }}>
                  <Chip 
                    label={`Site ${index + 1}`}
                    size="small"
                    sx={{
                      background: colors.blueAccent[600],
                      color: 'white',
                      fontWeight: 'bold',
                    }}
                  />
                  <Typography 
                    variant="body1" 
                    sx={{ 
                      fontWeight: 'bold',
                      color: colorMode === 'dark' ? colors.grey[100] : colors.grey[200],
                    }}
                  >
                    {site.site_name || `Site ${index + 1}`}
                  </Typography>
                  {site.county && (
                    <Chip 
                      label={site.county}
                      size="small"
                      variant="outlined"
                      sx={{ borderColor: colors.greenAccent[500], color: colors.greenAccent[500] }}
                    />
                  )}
                </Box>
                <IconButton
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemoveSite(index);
                  }}
                  size="small"
                  sx={{
                    color: colors.redAccent[500],
                    '&:hover': {
                      background: colors.redAccent[50],
                    }
                  }}
                >
                  <DeleteIcon />
                </IconButton>
              </AccordionSummary>
              <AccordionDetails>
                <Grid container spacing={2}>
                  {/* Site Name */}
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      label="Site Name"
                      size="small"
                      value={site.site_name || ''}
                      onChange={(e) => handleSiteChange(index, 'site_name', e.target.value)}
                      placeholder="e.g., Main Construction Site, Phase 1 Site"
                      sx={{
                        '& .MuiOutlinedInput-root': {
                          '& fieldset': { borderColor: colors.blueAccent[600], borderWidth: '2px' },
                          '&:hover fieldset': { borderColor: colors.blueAccent[500] },
                          '&.Mui-focused fieldset': { borderColor: colors.greenAccent[500], borderWidth: '2px' },
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

                  {/* Site Level */}
                  <Grid item xs={12} sm={6}>
                    <FormControl fullWidth size="small" sx={{ minWidth: 200 }}>
                      <InputLabel sx={{ color: colorMode === 'dark' ? colors.grey[100] : colors.grey[200], fontWeight: 'bold' }}>
                        Site Level
                      </InputLabel>
                      <Select
                        value={site.site_level || 'site'}
                        label="Site Level"
                        onChange={(e) => handleSiteChange(index, 'site_level', e.target.value)}
                        sx={{
                          '& .MuiOutlinedInput-root': {
                            '& fieldset': { borderColor: colors.blueAccent[600], borderWidth: '2px' },
                            '&:hover fieldset': { borderColor: colors.blueAccent[500] },
                            '&.Mui-focused fieldset': { borderColor: colors.greenAccent[500], borderWidth: '2px' },
                          },
                        }}
                      >
                        <MenuItem value="site">Site</MenuItem>
                        <MenuItem value="phase">Phase</MenuItem>
                        <MenuItem value="location">Location</MenuItem>
                        <MenuItem value="facility">Facility</MenuItem>
                      </Select>
                    </FormControl>
                  </Grid>

                  <Divider sx={{ my: 1, width: '100%' }} />

                  {/* Location Fields */}
                  <Grid item xs={12}>
                    <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 'bold', color: colors.blueAccent[500] }}>
                          Location Details
                        </Typography>
                      </Grid>

                  {/* Region */}
                  <Grid item xs={12} sm={6} md={3}>
                    <TextField
                      fullWidth
                      label="Region"
                      size="small"
                      value={site.region || ''}
                      onChange={(e) => handleSiteChange(index, 'region', e.target.value)}
                      sx={{
                        '& .MuiOutlinedInput-root': {
                          '& fieldset': { borderColor: colors.blueAccent[600], borderWidth: '2px' },
                          '&:hover fieldset': { borderColor: colors.blueAccent[500] },
                          '&.Mui-focused fieldset': { borderColor: colors.greenAccent[500], borderWidth: '2px' },
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

                  {/* County */}
                  <Grid item xs={12} sm={6} md={3}>
                    <FormControl fullWidth size="small" sx={{ minWidth: 200 }}>
                      <InputLabel sx={{ color: colorMode === 'dark' ? colors.grey[100] : colors.grey[200], fontWeight: 'bold' }}>
                        County
                      </InputLabel>
                      <Select
                        value={site.county || ''}
                        label="County"
                        onChange={(e) => handleSiteChange(index, 'county', e.target.value)}
                        sx={{
                          '& .MuiOutlinedInput-root': {
                            '& fieldset': { borderColor: colors.blueAccent[600], borderWidth: '2px' },
                            '&:hover fieldset': { borderColor: colors.blueAccent[500] },
                            '&.Mui-focused fieldset': { borderColor: colors.greenAccent[500], borderWidth: '2px' },
                          },
                        }}
                      >
                        {availableCounties.map((county) => (
                          <MenuItem key={county.countyId} value={county.name}>
                            {county.name}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Grid>

                  {/* Sub-county */}
                  <Grid item xs={12} sm={6} md={3}>
                    <TextField
                      fullWidth
                      label="Sub-county"
                      size="small"
                      value={site.constituency || ''}
                      onChange={(e) => handleSiteChange(index, 'constituency', e.target.value)}
                      sx={{
                        '& .MuiOutlinedInput-root': {
                          '& fieldset': { borderColor: colors.blueAccent[600], borderWidth: '2px' },
                          '&:hover fieldset': { borderColor: colors.blueAccent[500] },
                          '&.Mui-focused fieldset': { borderColor: colors.greenAccent[500], borderWidth: '2px' },
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

                  {/* Ward */}
                  <Grid item xs={12} sm={6} md={3}>
                    <FormControl fullWidth size="small" sx={{ minWidth: 200 }}>
                      <InputLabel sx={{ color: colorMode === 'dark' ? colors.grey[100] : colors.grey[200], fontWeight: 'bold' }}>
                        Ward
                      </InputLabel>
                      <Select
                        value={site.ward || ''}
                        label="Ward"
                        onChange={(e) => handleSiteChange(index, 'ward', e.target.value)}
                        sx={{
                          '& .MuiOutlinedInput-root': {
                            '& fieldset': { borderColor: colors.blueAccent[600], borderWidth: '2px' },
                            '&:hover fieldset': { borderColor: colors.blueAccent[500] },
                            '&.Mui-focused fieldset': { borderColor: colors.greenAccent[500], borderWidth: '2px' },
                          },
                        }}
                      >
                        {availableWards.map((ward) => (
                          <MenuItem key={ward.wardId} value={ward.name}>
                            {ward.name}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Grid>

                  <Divider sx={{ my: 1, width: '100%' }} />

                  {/* Status and Progress */}
                  <Grid item xs={12}>
                    <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 'bold', color: colors.blueAccent[500] }}>
                      Status & Progress
                    </Typography>
                  </Grid>

                  <Grid item xs={12} sm={6} md={3}>
                    <FormControl fullWidth size="small" sx={{ minWidth: 200 }}>
                      <InputLabel sx={{ color: colorMode === 'dark' ? colors.grey[100] : colors.grey[200], fontWeight: 'bold' }}>
                        Status
                      </InputLabel>
                      <Select
                        value={site.status_norm || 'Not Started'}
                        label="Status"
                        onChange={(e) => handleSiteChange(index, 'status_norm', e.target.value)}
                        sx={{
                          '& .MuiOutlinedInput-root': {
                            '& fieldset': { borderColor: colors.blueAccent[600], borderWidth: '2px' },
                            '&:hover fieldset': { borderColor: colors.blueAccent[500] },
                            '&.Mui-focused fieldset': { borderColor: colors.greenAccent[500], borderWidth: '2px' },
                          },
                        }}
                      >
                        <MenuItem value="Not Started">Not Started</MenuItem>
                        <MenuItem value="Ongoing">Ongoing</MenuItem>
                        <MenuItem value="Completed">Completed</MenuItem>
                        <MenuItem value="Stalled">Stalled</MenuItem>
                        <MenuItem value="Suspended">Suspended</MenuItem>
                      </Select>
                    </FormControl>
                  </Grid>

                  <Grid item xs={12} sm={6} md={3}>
                    <TextField
                      fullWidth
                      label="Progress (%)"
                      type="number"
                      size="small"
                      inputProps={{ min: 0, max: 100, step: 0.1 }}
                      value={site.percent_complete || 0}
                      onChange={(e) => handleSiteChange(index, 'percent_complete', parseFloat(e.target.value) || 0)}
                      sx={{
                        '& .MuiOutlinedInput-root': {
                          '& fieldset': { borderColor: colors.blueAccent[600], borderWidth: '2px' },
                          '&:hover fieldset': { borderColor: colors.blueAccent[500] },
                          '&.Mui-focused fieldset': { borderColor: colors.greenAccent[500], borderWidth: '2px' },
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

                  <Grid item xs={12} sm={6} md={3}>
                    <TextField
                      fullWidth
                      label="Start Date"
                      type="date"
                      size="small"
                      InputLabelProps={{ shrink: true }}
                      value={site.start_date || ''}
                      onChange={(e) => handleSiteChange(index, 'start_date', e.target.value)}
                      sx={{
                        '& .MuiOutlinedInput-root': {
                          '& fieldset': { borderColor: colors.blueAccent[600], borderWidth: '2px' },
                          '&:hover fieldset': { borderColor: colors.blueAccent[500] },
                          '&.Mui-focused fieldset': { borderColor: colors.greenAccent[500], borderWidth: '2px' },
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

                  <Grid item xs={12} sm={6} md={3}>
                    <TextField
                      fullWidth
                      label="End Date"
                      type="date"
                      size="small"
                      InputLabelProps={{ shrink: true }}
                      value={site.end_date || ''}
                      onChange={(e) => handleSiteChange(index, 'end_date', e.target.value)}
                      sx={{
                        '& .MuiOutlinedInput-root': {
                          '& fieldset': { borderColor: colors.blueAccent[600], borderWidth: '2px' },
                          '&:hover fieldset': { borderColor: colors.blueAccent[500] },
                          '&.Mui-focused fieldset': { borderColor: colors.greenAccent[500], borderWidth: '2px' },
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

                  <Divider sx={{ my: 1, width: '100%' }} />

                  {/* Budget Fields */}
                  <Grid item xs={12}>
                    <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 'bold', color: colors.blueAccent[500] }}>
                      Budget Information
                    </Typography>
                  </Grid>

                  <Grid item xs={12} sm={6} md={4}>
                    <TextField
                      fullWidth
                      label="Contract Sum (KES)"
                      type="number"
                      size="small"
                      inputProps={{ step: "0.01", min: "0" }}
                      value={site.contract_sum_kes || ''}
                      onChange={(e) => handleSiteChange(index, 'contract_sum_kes', e.target.value)}
                      sx={{
                        '& .MuiOutlinedInput-root': {
                          '& fieldset': { borderColor: colors.blueAccent[600], borderWidth: '2px' },
                          '&:hover fieldset': { borderColor: colors.blueAccent[500] },
                          '&.Mui-focused fieldset': { borderColor: colors.greenAccent[500], borderWidth: '2px' },
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

                  <Grid item xs={12} sm={6} md={4}>
                    <TextField
                      fullWidth
                      label="Approved Cost (KES)"
                      type="number"
                      size="small"
                      inputProps={{ step: "0.01", min: "0" }}
                      value={site.approved_cost_kes || ''}
                      onChange={(e) => handleSiteChange(index, 'approved_cost_kes', e.target.value)}
                      sx={{
                        '& .MuiOutlinedInput-root': {
                          '& fieldset': { borderColor: colors.blueAccent[600], borderWidth: '2px' },
                          '&:hover fieldset': { borderColor: colors.blueAccent[500] },
                          '&.Mui-focused fieldset': { borderColor: colors.greenAccent[500], borderWidth: '2px' },
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

                  <Grid item xs={12} sm={6} md={4}>
                    <TextField
                      fullWidth
                      label="Amount Paid (KES)"
                      type="number"
                      size="small"
                      inputProps={{ step: "0.01", min: "0" }}
                      value={site.amount_disbursed_kes || ''}
                      onChange={(e) => handleSiteChange(index, 'amount_disbursed_kes', e.target.value)}
                      sx={{
                        '& .MuiOutlinedInput-root': {
                          '& fieldset': { borderColor: colors.blueAccent[600], borderWidth: '2px' },
                          '&:hover fieldset': { borderColor: colors.blueAccent[500] },
                          '&.Mui-focused fieldset': { borderColor: colors.greenAccent[500], borderWidth: '2px' },
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

                  <Divider sx={{ my: 1, width: '100%' }} />

                  {/* Capacity Fields */}
                  <Grid item xs={12}>
                    <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 'bold', color: colors.blueAccent[500] }}>
                      Capacity Information
                    </Typography>
                  </Grid>

                  <Grid item xs={12} sm={6} md={3}>
                    <TextField
                      fullWidth
                      label="Units"
                      type="number"
                      size="small"
                      inputProps={{ step: "1", min: "0" }}
                      value={site.units || ''}
                      onChange={(e) => handleSiteChange(index, 'units', e.target.value)}
                      sx={{
                        '& .MuiOutlinedInput-root': {
                          '& fieldset': { borderColor: colors.blueAccent[600], borderWidth: '2px' },
                          '&:hover fieldset': { borderColor: colors.blueAccent[500] },
                          '&.Mui-focused fieldset': { borderColor: colors.greenAccent[500], borderWidth: '2px' },
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

                  <Grid item xs={12} sm={6} md={3}>
                    <TextField
                      fullWidth
                      label="Stalls"
                      type="number"
                      size="small"
                      inputProps={{ step: "1", min: "0" }}
                      value={site.stalls || ''}
                      onChange={(e) => handleSiteChange(index, 'stalls', e.target.value)}
                      sx={{
                        '& .MuiOutlinedInput-root': {
                          '& fieldset': { borderColor: colors.blueAccent[600], borderWidth: '2px' },
                          '&:hover fieldset': { borderColor: colors.blueAccent[500] },
                          '&.Mui-focused fieldset': { borderColor: colors.greenAccent[500], borderWidth: '2px' },
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

                  <Grid item xs={12} sm={6} md={3}>
                    <TextField
                      fullWidth
                      label="Bed Capacity"
                      type="number"
                      size="small"
                      inputProps={{ step: "1", min: "0" }}
                      value={site.bed_capacity || ''}
                      onChange={(e) => handleSiteChange(index, 'bed_capacity', e.target.value)}
                      sx={{
                        '& .MuiOutlinedInput-root': {
                          '& fieldset': { borderColor: colors.blueAccent[600], borderWidth: '2px' },
                          '&:hover fieldset': { borderColor: colors.blueAccent[500] },
                          '&.Mui-focused fieldset': { borderColor: colors.greenAccent[500], borderWidth: '2px' },
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

                  <Grid item xs={12} sm={6} md={3}>
                    <TextField
                      fullWidth
                      label="Acreage"
                      type="number"
                      size="small"
                      inputProps={{ step: "0.01", min: "0" }}
                      value={site.acreage || ''}
                      onChange={(e) => handleSiteChange(index, 'acreage', e.target.value)}
                      sx={{
                        '& .MuiOutlinedInput-root': {
                          '& fieldset': { borderColor: colors.blueAccent[600], borderWidth: '2px' },
                          '&:hover fieldset': { borderColor: colors.blueAccent[500] },
                          '&.Mui-focused fieldset': { borderColor: colors.greenAccent[500], borderWidth: '2px' },
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

                  <Divider sx={{ my: 1, width: '100%' }} />

                  {/* Additional Notes */}
                  <Grid item xs={12}>
                    <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 'bold', color: colors.blueAccent[500] }}>
                      Additional Information
                    </Typography>
                  </Grid>

                  <Grid item xs={12}>
                    <TextField
                      fullWidth
                      label="Remarks"
                      multiline
                      rows={2}
                      size="small"
                      value={site.remarks || ''}
                      onChange={(e) => handleSiteChange(index, 'remarks', e.target.value)}
                      sx={{
                        '& .MuiOutlinedInput-root': {
                          '& fieldset': { borderColor: colors.blueAccent[600], borderWidth: '2px' },
                          '&:hover fieldset': { borderColor: colors.blueAccent[500] },
                          '&.Mui-focused fieldset': { borderColor: colors.greenAccent[500], borderWidth: '2px' },
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
                      fullWidth
                      label="Key Issues"
                      multiline
                      rows={2}
                      size="small"
                      value={site.key_issues || ''}
                      onChange={(e) => handleSiteChange(index, 'key_issues', e.target.value)}
                      sx={{
                        '& .MuiOutlinedInput-root': {
                          '& fieldset': { borderColor: colors.blueAccent[600], borderWidth: '2px' },
                          '&:hover fieldset': { borderColor: colors.blueAccent[500] },
                          '&.Mui-focused fieldset': { borderColor: colors.greenAccent[500], borderWidth: '2px' },
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
                      fullWidth
                      label="Suggested Solutions"
                      multiline
                      rows={2}
                      size="small"
                      value={site.suggested_solutions || ''}
                      onChange={(e) => handleSiteChange(index, 'suggested_solutions', e.target.value)}
                      sx={{
                        '& .MuiOutlinedInput-root': {
                          '& fieldset': { borderColor: colors.blueAccent[600], borderWidth: '2px' },
                          '&:hover fieldset': { borderColor: colors.blueAccent[500] },
                          '&.Mui-focused fieldset': { borderColor: colors.greenAccent[500], borderWidth: '2px' },
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
              </AccordionDetails>
            </Accordion>
          ))}
        </Box>
      )}
    </Paper>
  );
};

export default ProjectSitesSection;
