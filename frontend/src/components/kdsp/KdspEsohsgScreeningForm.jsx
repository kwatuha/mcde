// src/components/kdsp/KdspEsohsgScreeningForm.jsx
import React from 'react';
import {
  Box, TextField, Grid, FormControlLabel, Switch
} from '@mui/material';
import JsonInputList from '../common/JsonInputList.jsx';
import { screeningOutcomes } from '../../utils/helpers';
import KdspSearchableSelect from './KdspSearchableSelect';

function KdspEsohsgScreeningForm({ formData, handleFormChange, setFormData }) {
  return (
    <Box component="form">
      <Grid container spacing={2}>
        <Grid item xs={12}>
          <TextField
            margin="dense"
            name="nameOfTheProject"
            label="Name of the Project"
            fullWidth
            value={formData.nameOfTheProject || ''}
            onChange={handleFormChange}
          />
        </Grid>
        <Grid item xs={12}>
          <TextField
            margin="dense"
            name="briefProjectDescription"
            label="Brief Project Description"
            fullWidth
            multiline
            rows={3}
            value={formData.briefProjectDescription || ''}
            onChange={handleFormChange}
          />
        </Grid>
        <Grid item xs={12}>
          <TextField
            margin="dense"
            name="locationOfTheProject"
            label="Location of the Project"
            fullWidth
            value={formData.locationOfTheProject || ''}
            onChange={handleFormChange}
          />
        </Grid>
        <Grid item xs={12}>
          <FormControlLabel
            control={
              <Switch
                checked={formData.emcaTriggers || false}
                onChange={handleFormChange}
                name="emcaTriggers"
              />
            }
            label="Does the project fall under the Second Schedule of EMCA Cap. 387?"
          />
        </Grid>
        <Grid item xs={12}>
          <TextField
            margin="dense"
            name="emcaDescription"
            label="If Yes, Briefly Describe"
            fullWidth
            multiline
            rows={2}
            value={formData.emcaDescription || ''}
            onChange={handleFormChange}
            disabled={!formData.emcaTriggers} // Disable if emcaTriggers is false
          />
        </Grid>
        <Grid item xs={12}>
          <FormControlLabel
            control={
              <Switch
                checked={formData.worldBankSafeguardApplicable || false}
                onChange={handleFormChange}
                name="worldBankSafeguardApplicable"
              />
            }
            label="Applicable World Bank Environment Social Standards?"
          />
        </Grid>
        <Grid item xs={12}>
          <JsonInputList
            label="World Bank Standards"
            items={formData.worldBankStandards}
            onChange={(newItems) => setFormData(prev => ({ ...prev, worldBankStandards: newItems }))}
          />
        </Grid>
        <Grid item xs={12}>
          <FormControlLabel
            control={
              <Switch
                checked={formData.goKPoliciesApplicable || false}
                onChange={handleFormChange}
                name="goKPoliciesApplicable"
              />
            }
            label="Applicable GoK Policies?"
          />
        </Grid>
        <Grid item xs={12}>
          <JsonInputList
            label="GoK Policies/Laws"
            items={formData.goKPoliciesLaws}
            onChange={(newItems) => setFormData(prev => ({ ...prev, goKPoliciesLaws: newItems }))}
          />
        </Grid>
        <Grid item xs={12}>
          <KdspSearchableSelect
            label="Screening Result Outcome"
            name="screeningResultOutcome"
            value={formData.screeningResultOutcome || ''}
            options={screeningOutcomes}
            onChange={handleFormChange}
            minWidth={320}
          />
        </Grid>
        <Grid item xs={12}>
          <TextField
            margin="dense"
            name="screeningUndertakenBy"
            label="Screening Undertaken By"
            fullWidth
            value={formData.screeningUndertakenBy || ''}
            onChange={handleFormChange}
          />
        </Grid>
      </Grid>
    </Box>
  );
}

export default KdspEsohsgScreeningForm;