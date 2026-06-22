import React from 'react';
import { Box, TextField, Typography } from '@mui/material';

/** Optional open-ended question with English and Kiswahili prompts. */
export default function BilingualQuestionField({
  labelEn,
  labelSw,
  name,
  value,
  onChange,
  disabled = false,
  rows = 3,
}) {
  return (
    <Box sx={{ mb: 2.5 }}>
      <Typography variant="body2" fontWeight={600} gutterBottom>
        {labelEn}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1, fontStyle: 'italic' }}>
        {labelSw}
      </Typography>
      <TextField
        fullWidth
        multiline
        rows={rows}
        name={name}
        value={value}
        onChange={onChange}
        disabled={disabled}
        placeholder="Optional — your response / Jibu lako (si lazima)"
      />
    </Box>
  );
}
