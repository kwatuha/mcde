// src/components/strategicPlan/AnnualWorkPlanForm.jsx
import React from 'react';
import { Box, TextField, Typography, Grid, FormControl, InputLabel, Select, MenuItem, Divider, Paper } from '@mui/material';

/**
 * Form component for creating and editing an Annual Work Plan.
 * It uses a clean and responsive grid layout for optimal user experience.
 *
 * @param {object} props - The component props.
 * @param {object} props.formData - The current form data.
 * @param {function} props.handleFormChange - The change handler for form inputs.
 */
const AnnualWorkPlanForm = React.memo(({ formData, handleFormChange }) => {
  const approvalStatusOptions = ['draft', 'submitted', 'approved', 'rejected'];
  const commonFieldProps = {
    fullWidth: true,
    margin: 'dense',
    size: 'small',
    variant: 'outlined',
  };

  return (
    <Box sx={{ mt: 1.5, p: 1 }}>
      <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1.5 }}>
          Work Plan Information
        </Typography>
        <Grid container spacing={2}>
          <Grid item xs={12} md={8}>
            <TextField
              autoFocus
              name="workplanName"
              label="Work Plan Name"
              type="text"
              value={formData.workplanName || ''}
              onChange={handleFormChange}
              {...commonFieldProps}
            />
          </Grid>
          <Grid item xs={12} md={4}>
            <TextField
              name="financialYear"
              label="Financial Year"
              placeholder="e.g. 2024/2025"
              type="text"
              value={formData.financialYear || ''}
              onChange={handleFormChange}
              {...commonFieldProps}
            />
          </Grid>
          <Grid item xs={12} md={6}>
            <TextField
              name="totalBudget"
              label="Total Budget"
              type="number"
              value={formData.totalBudget || ''}
              onChange={handleFormChange}
              {...commonFieldProps}
            />
          </Grid>
          <Grid item xs={12} md={6}>
            <FormControl fullWidth margin="dense" size="small" variant="outlined" sx={{ minWidth: 240 }}>
              <InputLabel>Approval Status</InputLabel>
              <Select
                name="approvalStatus"
                label="Approval Status"
                value={formData.approvalStatus || ''}
                onChange={handleFormChange}
              >
                {approvalStatusOptions.map((status) => (
                  <MenuItem key={status} value={status}>
                    {status.charAt(0).toUpperCase() + status.slice(1)}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12}>
            <TextField
              name="workplanDescription"
              label="Work Plan Description"
              type="text"
              multiline
              rows={3}
              value={formData.workplanDescription || ''}
              onChange={handleFormChange}
              {...commonFieldProps}
            />
          </Grid>
        </Grid>
      </Paper>

      <Divider sx={{ my: 2 }} />

      <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1.5 }}>
          Performance and Review
        </Typography>
        <Grid container spacing={2}>
          <Grid item xs={12} md={6}>
            <TextField
              name="actualExpenditure"
              label="Actual Expenditure"
              type="number"
              value={formData.actualExpenditure || ''}
              onChange={handleFormChange}
              {...commonFieldProps}
            />
          </Grid>
          <Grid item xs={12} md={6}>
            <TextField
              name="performanceScore"
              label="Performance Score"
              type="number"
              value={formData.performanceScore || ''}
              onChange={handleFormChange}
              {...commonFieldProps}
            />
          </Grid>
          <Grid item xs={12}>
            <TextField
              name="challenges"
              label="Challenges"
              type="text"
              multiline
              rows={3}
              value={formData.challenges || ''}
              onChange={handleFormChange}
              {...commonFieldProps}
            />
          </Grid>
          <Grid item xs={12}>
            <TextField
              name="lessons"
              label="Lessons Learned"
              type="text"
              multiline
              rows={3}
              value={formData.lessons || ''}
              onChange={handleFormChange}
              {...commonFieldProps}
            />
          </Grid>
          <Grid item xs={12}>
            <TextField
              name="recommendations"
              label="Recommendations"
              type="text"
              multiline
              rows={3}
              value={formData.recommendations || ''}
              onChange={handleFormChange}
              {...commonFieldProps}
            />
          </Grid>
        </Grid>
      </Paper>
    </Box>
  );
});

export default AnnualWorkPlanForm;