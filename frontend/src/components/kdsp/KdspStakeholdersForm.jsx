// src/components/kdsp/KdspStakeholdersForm.jsx
import React from 'react';
import { Box, TextField, Grid } from '@mui/material';
import { riskLevels } from '../../utils/helpers';
import KdspSearchableSelect from './KdspSearchableSelect';

function KdspStakeholdersForm({ formData, handleFormChange }) {
  return (
    <Box component="form">
      <Grid container spacing={2}>
        <Grid item xs={12}>
          <TextField
            margin="dense"
            name="stakeholderName"
            label="Stakeholder Name"
            fullWidth
            value={formData.stakeholderName || ''}
            onChange={handleFormChange}
          />
        </Grid>
        <Grid item xs={12}>
          <KdspSearchableSelect
            label="Level of Influence"
            name="levelInfluence"
            value={formData.levelInfluence || ''}
            options={riskLevels}
            onChange={handleFormChange}
            minWidth={280}
          />
        </Grid>
        <Grid item xs={12}>
          <TextField
            margin="dense"
            name="engagementStrategy"
            label="Engagement Strategy"
            fullWidth
            multiline
            rows={3}
            value={formData.engagementStrategy || ''}
            onChange={handleFormChange}
          />
        </Grid>
      </Grid>
    </Box>
  );
}

export default KdspStakeholdersForm;