// src/components/kdsp/KdspRisksForm.jsx
import React from 'react';
import { Box, TextField, Grid } from '@mui/material';
import { riskLevels } from '../../utils/helpers';
import KdspSearchableSelect from './KdspSearchableSelect';

function KdspRisksForm({ formData, handleFormChange }) {
  return (
    <Box component="form">
      <Grid container spacing={2}>
        <Grid item xs={12}>
          <TextField
            margin="dense"
            name="riskDescription"
            label="Risk Description"
            fullWidth
            multiline
            rows={3}
            value={formData.riskDescription || ''}
            onChange={handleFormChange}
          />
        </Grid>
        <Grid item xs={12} sm={6}>
          <KdspSearchableSelect
            label="Likelihood"
            name="likelihood"
            value={formData.likelihood || ''}
            options={riskLevels}
            onChange={handleFormChange}
            minWidth={260}
          />
        </Grid>
        <Grid item xs={12} sm={6}>
          <KdspSearchableSelect
            label="Impact"
            name="impact"
            value={formData.impact || ''}
            options={riskLevels}
            onChange={handleFormChange}
            minWidth={260}
          />
        </Grid>
        <Grid item xs={12}>
          <TextField
            margin="dense"
            name="mitigationStrategy"
            label="Mitigation Strategy"
            fullWidth
            multiline
            rows={3}
            value={formData.mitigationStrategy || ''}
            onChange={handleFormChange}
          />
        </Grid>
      </Grid>
    </Box>
  );
}

export default KdspRisksForm;