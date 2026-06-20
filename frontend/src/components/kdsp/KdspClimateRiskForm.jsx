// src/components/kdsp/KdspClimateRiskForm.jsx
import React from 'react';
import { Box, TextField, Grid } from '@mui/material';
import { formatNumberForInput, riskLevels } from '../../utils/helpers';
import KdspSearchableSelect from './KdspSearchableSelect';

function KdspClimateRiskForm({ formData, handleFormChange }) {
  return (
    <Box component="form">
      <Grid container spacing={2}>
        <Grid item xs={12}>
          <TextField
            margin="dense"
            name="hazardName"
            label="Hazard Name"
            fullWidth
            value={formData.hazardName || ''}
            onChange={handleFormChange}
          />
        </Grid>
        <Grid item xs={12} sm={6}>
          <KdspSearchableSelect
            label="Hazard Exposure"
            name="hazardExposure"
            value={formData.hazardExposure || ''}
            options={riskLevels}
            onChange={handleFormChange}
            minWidth={260}
          />
        </Grid>
        <Grid item xs={12} sm={6}>
          <KdspSearchableSelect
            label="Vulnerability"
            name="vulnerability"
            value={formData.vulnerability || ''}
            options={riskLevels}
            onChange={handleFormChange}
            minWidth={260}
          />
        </Grid>
        <Grid item xs={12}>
          <KdspSearchableSelect
            label="Risk Level"
            name="riskLevel"
            value={formData.riskLevel || ''}
            options={riskLevels}
            onChange={handleFormChange}
            minWidth={280}
          />
        </Grid>
        <Grid item xs={12}>
          <TextField
            margin="dense"
            name="riskReductionStrategies"
            label="Risk Reduction Strategies"
            fullWidth
            multiline
            rows={3}
            value={formData.riskReductionStrategies || ''}
            onChange={handleFormChange}
          />
        </Grid>
        <Grid item xs={12} sm={6}>
          <TextField
            margin="dense"
            name="riskReductionCosts"
            label="Risk Reduction Costs"
            type="text"
            fullWidth
            value={formatNumberForInput(formData.riskReductionCosts)}
            onChange={handleFormChange}
            inputProps={{ 'data-type': 'number' }} // Custom data attribute to hint for number parsing
            helperText="Enter numbers only."
          />
        </Grid>
        <Grid item xs={12} sm={6}>
          <TextField
            margin="dense"
            name="resourcesRequired"
            label="Resources Required"
            fullWidth
            multiline
            rows={2}
            value={formData.resourcesRequired || ''}
            onChange={handleFormChange}
          />
        </Grid>
      </Grid>
    </Box>
  );
}

export default KdspClimateRiskForm;