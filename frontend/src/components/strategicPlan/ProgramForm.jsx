// src/components/strategicPlan/ProgramForm.jsx
import React, { useMemo, useState } from 'react';
import { Box, TextField, Typography, Grid, Paper, Stack, Button, Chip, IconButton } from '@mui/material';
import { Add as AddIcon, Close as CloseIcon } from '@mui/icons-material';

const splitItems = (value) =>
  String(value || '')
    .split('\n')
    .map((v) => v.trim())
    .filter(Boolean);

const joinItems = (items) => items.join('\n');

const ListCardEditor = ({ title, fieldName, formData, handleFormChange, numbered = false, placeholder }) => {
  const items = useMemo(() => splitItems(formData[fieldName]), [formData, fieldName]);
  const [draft, setDraft] = useState('');
  const [inputError, setInputError] = useState('');
  const [editingIndex, setEditingIndex] = useState(null);

  const pushToParent = (nextItems) => {
    handleFormChange({ target: { name: fieldName, value: joinItems(nextItems) } });
  };

  const handleAdd = () => {
    const value = draft.trim();
    if (!value) return;
    const normalizedValue = value.toLowerCase();
    const exists = items.some((item, idx) => idx !== editingIndex && item.trim().toLowerCase() === normalizedValue);
    if (exists) {
      setInputError('This entry already exists.');
      return;
    }
    let nextItems = [...items];
    if (editingIndex !== null && nextItems[editingIndex] !== undefined) {
      nextItems[editingIndex] = value;
    } else {
      nextItems.push(value);
    }
    setInputError('');
    pushToParent(nextItems);
    setDraft('');
    setEditingIndex(null);
  };

  const handleRemove = (idx) => {
    if (editingIndex === idx) {
      setDraft('');
      setEditingIndex(null);
      setInputError('');
    }
    pushToParent(items.filter((_, index) => index !== idx));
  };

  const handleStartEdit = (idx) => {
    setDraft(items[idx] || '');
    setEditingIndex(idx);
    setInputError('');
  };

  return (
    <Paper variant="outlined" sx={{ p: 1.25, borderRadius: 1.5, height: '100%' }}>
      <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
        {title}
      </Typography>
      <Stack direction="row" spacing={1}>
        <TextField
          size="small"
          fullWidth
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            if (inputError) setInputError('');
          }}
          placeholder={placeholder}
          error={Boolean(inputError)}
          helperText={inputError || ' '}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleAdd();
            }
          }}
        />
        <Button variant="contained" size="small" startIcon={<AddIcon />} onClick={handleAdd}>
          {editingIndex !== null ? 'Update' : 'Add'}
        </Button>
      </Stack>
      {editingIndex !== null && (
        <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
          Editing item {editingIndex + 1}. Click Update to save changes.
        </Typography>
      )}
      <Box sx={{ mt: 1, minHeight: 72 }}>
        {items.length === 0 ? (
          <Typography variant="caption" color="text.secondary">No items added yet.</Typography>
        ) : (
          <Stack spacing={0.75}>
            {items.map((item, idx) => (
              <Chip
                key={`${fieldName}-${idx}`}
                label={`${numbered ? `${idx + 1}. ` : ''}${item}`}
                onDelete={() => handleRemove(idx)}
                deleteIcon={<CloseIcon />}
                onDoubleClick={() => handleStartEdit(idx)}
                sx={{ justifyContent: 'space-between', '& .MuiChip-label': { textAlign: 'left', whiteSpace: 'normal' } }}
              />
            ))}
          </Stack>
        )}
      </Box>
    </Paper>
  );
};

const ProgramForm = React.memo(({ formData, handleFormChange }) => {
  return (
    <Box sx={{ mt: 0.5, p: 0, width: '100%' }}>
      <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1.5 }}>
        Define the Key Result Area details and expected delivery direction.
      </Typography>
      <Grid container spacing={1.5}>
        <Grid item xs={12} md={9}>
          <TextField
            autoFocus
            margin="dense"
            name="programme"
            label="Key Result Area Name"
            type="text"
            fullWidth
            variant="outlined"
            value={formData.programme || ''}
            onChange={handleFormChange}
            required
            helperText="Example: Infrastructure Development and Maintenance"
          />
        </Grid>
        <Grid item xs={12} md={3}>
          <TextField
            margin="dense"
            name="programCode"
            label="KRA Code (optional)"
            type="text"
            fullWidth
            variant="outlined"
            value={formData.programCode || ''}
            onChange={handleFormChange}
            placeholder="KRA-01"
          />
        </Grid>
        <Grid item xs={12} md={6}>
          <ListCardEditor
            title="Needs & Priorities"
            fieldName="needsPriorities"
            formData={formData}
            handleFormChange={handleFormChange}
            numbered
            placeholder="Type one need/priority"
          />
        </Grid>
        <Grid item xs={12} md={6}>
          <ListCardEditor
            title="Strategies"
            fieldName="strategies"
            formData={formData}
            handleFormChange={handleFormChange}
            numbered
            placeholder="Type one strategy"
          />
        </Grid>
        <Grid item xs={12} md={6}>
          <ListCardEditor
            title="Objectives"
            fieldName="objectives"
            formData={formData}
            handleFormChange={handleFormChange}
            numbered
            placeholder="Type one objective"
          />
        </Grid>
        <Grid item xs={12} md={6}>
          <ListCardEditor
            title="Outcomes"
            fieldName="outcomes"
            formData={formData}
            handleFormChange={handleFormChange}
            numbered
            placeholder="Type one expected outcome"
          />
        </Grid>
        <Grid item xs={12} md={12} sx={{ display: 'flex' }}>
          <TextField
            margin="dense"
            name="description"
            label="Description"
            type="text"
            fullWidth
            multiline
            minRows={1}
            maxRows={8}
            variant="standard"
            value={formData.description || ''}
            onChange={handleFormChange}
            placeholder="Type a short description..."
            helperText="Description expands as you add line breaks."
            sx={{
              flex: 1,
              '& .MuiInput-root': {
                alignItems: 'flex-start',
              },
              '& .MuiInputBase-inputMultiline': {
                lineHeight: 1.5,
                py: 0.5,
              },
            }}
          />
        </Grid>
      </Grid>
    </Box>
  );
});

export default ProgramForm;