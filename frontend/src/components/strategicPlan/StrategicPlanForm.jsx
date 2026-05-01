// src/components/strategicPlan/StrategicPlanForm.jsx
import React from 'react';
import { Box, TextField, Grid } from '@mui/material';

/**
 * Form for editing a strategic plan on the plan details page (API fields).
 */
function StrategicPlanForm({ formData, handleFormChange }) {
  const cidpName = formData.cidpName ?? formData.planName ?? '';

  return (
    <Box component="form">
      <Grid container spacing={2}>
        <Grid item xs={12}>
          <TextField
            margin="dense"
            name="cidpName"
            label="Plan name"
            fullWidth
            value={cidpName}
            onChange={handleFormChange}
            required
          />
        </Grid>
        <Grid item xs={12}>
          <TextField
            margin="dense"
            name="vision"
            label="Vision"
            fullWidth
            multiline
            minRows={3}
            value={formData.vision ?? ''}
            onChange={handleFormChange}
          />
        </Grid>
        <Grid item xs={12}>
          <TextField
            margin="dense"
            name="mission"
            label="Mission"
            fullWidth
            multiline
            minRows={3}
            value={formData.mission ?? ''}
            onChange={handleFormChange}
          />
        </Grid>
        <Grid item xs={12}>
          <TextField
            margin="dense"
            name="remarks"
            label="Remarks"
            fullWidth
            multiline
            minRows={2}
            value={formData.remarks ?? ''}
            onChange={handleFormChange}
          />
        </Grid>
        <Grid item xs={12} sm={6}>
          <TextField
            margin="dense"
            name="startDate"
            label="Start date"
            fullWidth
            type="date"
            InputLabelProps={{ shrink: true }}
            value={formData.startDate ?? ''}
            onChange={handleFormChange}
          />
        </Grid>
        <Grid item xs={12} sm={6}>
          <TextField
            margin="dense"
            name="endDate"
            label="End date"
            fullWidth
            type="date"
            InputLabelProps={{ shrink: true }}
            value={formData.endDate ?? ''}
            onChange={handleFormChange}
          />
        </Grid>
      </Grid>
    </Box>
  );
}

export default StrategicPlanForm;
