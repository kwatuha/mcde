import React from 'react';
import { Autocomplete, TextField } from '@mui/material';

/**
 * Searchable dropdown for KDSP inception forms.
 * Works with handleFormChange({ target: { name, value } }).
 */
export default function KdspSearchableSelect({
  label,
  name,
  value,
  options = [],
  onChange,
  minWidth = 260,
  freeSolo = false,
  helperText,
  disabled = false,
}) {
  const normalizedOptions = options.map((option) => (
    typeof option === 'string' ? option : option?.label ?? option?.value ?? ''
  )).filter(Boolean);

  const selected = value || null;

  return (
    <Autocomplete
      fullWidth
      disabled={disabled}
      freeSolo={freeSolo}
      options={normalizedOptions}
      value={selected}
      onChange={(_, newValue) => {
        onChange({
          target: {
            name,
            value: typeof newValue === 'string' ? newValue : (newValue || ''),
          },
        });
      }}
      onInputChange={freeSolo ? (_, newInput, reason) => {
        if (reason === 'input') {
          onChange({ target: { name, value: newInput } });
        }
      } : undefined}
      renderInput={(params) => (
        <TextField
          {...params}
          margin="dense"
          label={label}
          helperText={helperText}
        />
      )}
      sx={{ minWidth }}
    />
  );
}
