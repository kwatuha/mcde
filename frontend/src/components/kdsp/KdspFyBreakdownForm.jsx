// src/components/kdsp/KdspFyBreakdownForm.jsx
import React from 'react';
import { Box, TextField, Grid } from '@mui/material';
import { formatNumberForInput } from '../../utils/helpers';
import KdspSearchableSelect from './KdspSearchableSelect';

const FY_OPTIONS = ['2023/2024', '2024/2025', '2025/2026', '2026/2027', '2027/2028', '2028/2029'];

function KdspFyBreakdownForm({ formData, handleFormChange }) {
  return (
    <Box component="form">
      <Grid container spacing={2}>
        <Grid item xs={12} sm={6}>
          <KdspSearchableSelect
            label="Financial Year"
            name="financialYear"
            value={formData.financialYear || ''}
            options={FY_OPTIONS}
            onChange={handleFormChange}
            minWidth={260}
            freeSolo
            helperText="e.g., 2025/2026"
          />
        </Grid>
        <Grid item xs={12} sm={6}>
          <TextField
            margin="dense"
            name="totalCost"
            label="Total Cost (KES)"
            type="text" // Use text to allow formatted input
            fullWidth
            value={formatNumberForInput(formData.totalCost)}
            onChange={handleFormChange}
            inputProps={{ 'data-type': 'number' }} // Custom data attribute to hint for number parsing
            helperText="Enter numbers only. Commas will be added automatically on display."
          />
        </Grid>
      </Grid>
    </Box>
  );
}

export default KdspFyBreakdownForm;