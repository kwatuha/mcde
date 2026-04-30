// src/components/strategicPlan/SubprogramForm.jsx
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Box, TextField, Typography, Grid, Stack, FormControl, InputLabel, Select, MenuItem } from '@mui/material';

const SubprogramForm = React.memo(({ formData, handleFormChange, readOnly = false }) => {
  const years = [1, 2, 3, 4, 5];
  const unitOfMeasureOptions = [
    { value: '', label: 'None' },
    { value: '%', label: 'Percentage (%)' },
    { value: 'count', label: 'Count' },
    { value: 'length', label: 'Length (m)' },
    { value: 'area', label: 'Area (m²)' },
    { value: 'volume', label: 'Volume (m³)' },
    { value: 'weight', label: 'Weight (kg)' },
    { value: 'time', label: 'Time (days)' },
    { value: 'currency', label: 'Currency (KES)' },
    { value: 'units', label: 'Units' },
    { value: 'stalls', label: 'Stalls' },
    { value: 'beds', label: 'Beds' },
    { value: 'rooms', label: 'Rooms' },
    { value: 'classrooms', label: 'Classrooms' },
    { value: 'kilometers', label: 'Kilometers (km)' },
    { value: 'meters', label: 'Meters (m)' },
    { value: 'hectares', label: 'Hectares' },
    { value: 'acres', label: 'Acres' }
  ];
  
  const isInitialRender = useRef(true);

  const [formState, setFormState] = useState(() => ({
    ...formData,
    ...years.reduce((acc, year) => {
      acc[`yr${year}Budget`] = formData[`yr${year}Budget`] ? formData[`yr${year}Budget`].toLocaleString('en-US') : '';
      return acc;
    }, {})
  }));

  // Helper to parse numbers from formatted strings
  const parseNumber = useCallback((value) => {
    return parseFloat(String(value).replace(/,/g, '')) || 0;
  }, []);

  // Helper to format numbers for display
  const formatNumber = useCallback((value) => {
    if (value === null || value === undefined || value === '') return '';
    return parseFloat(value).toLocaleString('en-US');
  }, []);
  
  const totalBudget = years.reduce((sum, year) => sum + parseNumber(formState[`yr${year}Budget`]), 0);

  // This useEffect syncs parent state on initial load.
  useEffect(() => {
    if (isInitialRender.current) {
        setFormState(prev => ({
            ...prev,
            ...years.reduce((acc, year) => {
                acc[`yr${year}Budget`] = formData[`yr${year}Budget`] ? formatNumber(formData[`yr${year}Budget`]) : '';
                return acc;
            }, {}),
            totalBudget: formData.totalBudget ? formatNumber(formData.totalBudget) : ''
        }));
        isInitialRender.current = false;
    }
  }, [formData, formatNumber, years]);

  // CORRECTED: New local change handler
  const handleLocalFormChange = useCallback((e) => {
    const { name, value } = e.target;
    setFormState(prev => ({ ...prev, [name]: value }));
  }, []);

  // CORRECTED: New onBlur handler to update parent state only when focus is lost
  const handleBlur = useCallback((e) => {
    const { name, value, type } = e.target;
    const isBudgetField = name.includes('Budget');
    
    let formattedValueForLocalState = value;
    let valueForParentState = value;

    if (type === 'number' || isBudgetField) {
      valueForParentState = parseNumber(value);
      formattedValueForLocalState = formatNumber(valueForParentState);
    }

    setFormState(prev => ({ ...prev, [name]: formattedValueForLocalState }));
    
    if (formData[name] !== valueForParentState) {
        handleFormChange({ target: { name, value: valueForParentState } });
    }
    
  }, [handleFormChange, parseNumber, formatNumber, formData]);

  useEffect(() => {
    if (parseNumber(formData.totalBudget) !== totalBudget) {
        handleFormChange({ target: { name: 'totalBudget', value: totalBudget } });
    }
  }, [totalBudget, formData.totalBudget, handleFormChange, parseNumber]);
  

  return (
    <Box sx={{ mt: 0.5, p: 0 }}>
      <Grid container spacing={1.5}>
        <Grid item xs={12}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ xs: 'stretch', sm: 'flex-end' }}>
            <TextField
              autoFocus
              margin="none"
              name="subProgramme"
              label="Sub-Program"
              type="text"
              fullWidth
              variant="outlined"
              value={formState.subProgramme || ''}
              onChange={handleLocalFormChange}
              onBlur={handleBlur}
              InputProps={{ readOnly }}
            />
            <TextField
              margin="none"
              name="totalBudget"
              label="Total Budget"
              type="text"
              sx={{ width: { xs: '100%', sm: 220 }, ml: { sm: 'auto' } }}
              variant="filled"
              value={formatNumber(totalBudget) || ''}
              InputProps={{ readOnly: true }}
              onBlur={handleBlur}
            />
          </Stack>
        </Grid>

        <Grid item xs={12}>
          <Typography variant="subtitle1" sx={{ fontWeight: 'bold', mb: 0.75 }}>Yearly Targets & Budgets</Typography>
          <Box sx={{ border: '1px solid #ccc', borderRadius: 1, overflow: 'hidden' }}>
            
            <Box sx={{ display: 'flex', bgcolor: 'grey.100', borderBottom: '1px solid #ccc' }}>
                <Box sx={{ width: '15%', borderRight: '1px solid #ccc' }} />
                {years.map(year => (
                    <Box key={`year-header-${year}`} sx={{ flex: 1, borderRight: '1px solid #ccc', py: 1, '&:last-child': { borderRight: 'none' } }}>
                        <Typography variant="body2" sx={{ fontWeight: 'bold' }} align="center">Year {year}</Typography>
                    </Box>
                ))}
            </Box>
            
            <Box sx={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid #ccc' }}>
                <Box sx={{ width: '15%', py: 1, borderRight: '1px solid #ccc', display: 'flex', justifyContent: 'center' }}>
                    <Typography variant="body2" sx={{ fontWeight: 'bold' }}>Target</Typography>
                </Box>
                {years.map(year => (
                    <Box key={`target-input-${year}`} sx={{ flex: 1, borderRight: '1px solid #ccc', px: 0.5, '&:last-child': { borderRight: 'none' } }}>
                        <TextField
                            margin="none"
                            size="small"
                            name={`yr${year}Targets`}
                            fullWidth
                            variant="outlined"
                            value={formState[`yr${year}Targets`] || ''}
                            onChange={handleLocalFormChange}
                            onBlur={handleBlur}
                            InputProps={{ readOnly }}
                        />
                    </Box>
                ))}
            </Box>
            
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
                <Box sx={{ width: '15%', py: 1, borderRight: '1px solid #ccc', display: 'flex', justifyContent: 'center' }}>
                    <Typography variant="body2" sx={{ fontWeight: 'bold' }}>Budget</Typography>
                </Box>
                {years.map(year => (
                    <Box key={`budget-input-${year}`} sx={{ flex: 1, borderRight: '1px solid #ccc', px: 0.5, '&:last-child': { borderRight: 'none' } }}>
                        <TextField
                            margin="none"
                            size="small"
                            name={`yr${year}Budget`}
                            type="text"
                            fullWidth
                            variant="outlined"
                            value={formState[`yr${year}Budget`] || ''}
                            onChange={handleLocalFormChange}
                            onBlur={handleBlur}
                            InputProps={{ readOnly }}
                        />
                    </Box>
                ))}
            </Box>
          </Box>
        </Grid>
        
        <Grid item xs={12}>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={3}>
                <TextField
                    margin="dense"
                    name="kpi"
                    label="Key Performance Indicator (KPI)"
                    type="text"
                    fullWidth
                    multiline
                    rows={4}
                    variant="outlined"
                    value={formState.kpi || ''}
                    onChange={handleLocalFormChange}
                    onBlur={handleBlur}
                    InputProps={{ readOnly }}
                />
            </Grid>
            <Grid item xs={12} sm={3}>
              <FormControl fullWidth margin="dense">
                <InputLabel>Unit of Measure</InputLabel>
                <Select
                  name="unitOfMeasure"
                  label="Unit of Measure"
                  value={formState.unitOfMeasure || ''}
                  onChange={handleLocalFormChange}
                  onBlur={handleBlur}
                  disabled={readOnly}
                >
                  {unitOfMeasureOptions.map((option) => (
                    <MenuItem key={option.value || 'none'} value={option.value}>
                      {option.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={3}>
              <TextField
                margin="dense"
                name="baseline"
                label="Baseline"
                type="text"
                fullWidth
                variant="outlined"
                value={formState.baseline || ''}
                onChange={handleLocalFormChange}
                onBlur={handleBlur}
                InputProps={{ readOnly }}
              />
            </Grid>
            <Grid item xs={12} sm={3}>
              <TextField
                margin="dense"
                name="keyOutcome"
                label="Key Outcome"
                type="text"
                fullWidth
                multiline
                rows={4}
                variant="outlined"
                value={formState.keyOutcome || ''}
                onChange={handleLocalFormChange}
                onBlur={handleBlur}
                InputProps={{ readOnly }}
              />
            </Grid>
          </Grid>
        </Grid>
      </Grid>
    </Box>
  );
});

export default SubprogramForm;