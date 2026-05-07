import {
  Box,
  Checkbox,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Radio,
  RadioGroup,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material';

function formatAnswerDisplay(item, raw) {
  if (raw === undefined || raw === null || raw === '') return '—';
  if (item.type === 'multi_select') {
    if (!Array.isArray(raw) || !raw.length) return '—';
    return raw.join(', ');
  }
  if (item.type === 'yes_no') return raw === 'yes' || raw === true ? 'Yes' : raw === 'no' || raw === false ? 'No' : String(raw);
  return String(raw);
}

/** Render editable checklist from template `structure` ({ sections: [{ id, title, items: [{ id, label, type, required, options? }] }] }). */
export default function ChecklistFormFields({ structure, value, onChange, disabled = false }) {
  const answers = value && typeof value === 'object' ? value : {};

  const setField = (id, v) => {
    if (disabled || typeof onChange !== 'function') return;
    onChange({ ...answers, [id]: v });
  };

  if (!structure?.sections?.length) {
    return (
      <Typography variant="body2" color="text.secondary">
        Choose a checklist template to see items.
      </Typography>
    );
  }

  return (
    <Stack spacing={2.5} sx={{ mt: 0.5 }}>
      {structure.sections.map((sec) => (
        <Box key={sec.id}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1, color: 'primary.main' }}>
            {sec.title}
          </Typography>
          <Stack spacing={1.75}>
            {(sec.items || []).map((item) => (
              <Box key={item.id}>
                <Typography variant="body2" sx={{ mb: 0.5, fontWeight: item.required ? 600 : 400 }}>
                  {item.label}
                  {item.required ? ' *' : ''}
                </Typography>
                {item.type === 'yes_no' && (
                  <FormControl disabled={disabled} component="fieldset" variant="standard">
                    <RadioGroup
                      row
                      value={answers[item.id] === 'yes' || answers[item.id] === true ? 'yes' : answers[item.id] === 'no' || answers[item.id] === false ? 'no' : ''}
                      onChange={(e) => setField(item.id, e.target.value)}
                    >
                      <FormControlLabel value="yes" control={<Radio size="small" />} label="Yes" />
                      <FormControlLabel value="no" control={<Radio size="small" />} label="No" />
                    </RadioGroup>
                  </FormControl>
                )}
                {item.type === 'text' && (
                  <TextField
                    size="small"
                    fullWidth
                    value={answers[item.id] ?? ''}
                    onChange={(e) => setField(item.id, e.target.value)}
                    disabled={disabled}
                  />
                )}
                {item.type === 'textarea' && (
                  <TextField
                    size="small"
                    fullWidth
                    multiline
                    minRows={2}
                    value={answers[item.id] ?? ''}
                    onChange={(e) => setField(item.id, e.target.value)}
                    disabled={disabled}
                  />
                )}
                {item.type === 'number' && (
                  <TextField
                    size="small"
                    fullWidth
                    type="number"
                    value={answers[item.id] ?? ''}
                    onChange={(e) => setField(item.id, e.target.value === '' ? '' : Number(e.target.value))}
                    disabled={disabled}
                  />
                )}
                {item.type === 'select' && (
                  <FormControl size="small" fullWidth disabled={disabled}>
                    <InputLabel id={`${item.id}-lbl`}>Select</InputLabel>
                    <Select
                      labelId={`${item.id}-lbl`}
                      label="Select"
                      value={answers[item.id] ?? ''}
                      onChange={(e) => setField(item.id, e.target.value)}
                    >
                      <MenuItem value="">
                        <em>—</em>
                      </MenuItem>
                      {(item.options || []).map((opt) => (
                        <MenuItem key={opt} value={opt}>
                          {opt}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                )}
                {item.type === 'multi_select' && (
                  <FormControl size="small" fullWidth disabled={disabled}>
                    <InputLabel id={`${item.id}-lbl`}>Select one or more</InputLabel>
                    <Select
                      multiple
                      labelId={`${item.id}-lbl`}
                      label="Select one or more"
                      value={Array.isArray(answers[item.id]) ? answers[item.id] : []}
                      onChange={(e) => setField(item.id, Array.isArray(e.target.value) ? e.target.value : [])}
                      renderValue={(selected) => (Array.isArray(selected) && selected.length ? selected.join(', ') : '—')}
                    >
                      {(item.options || []).map((opt) => (
                        <MenuItem key={opt} value={opt}>
                          <Checkbox size="small" checked={Array.isArray(answers[item.id]) && answers[item.id].includes(opt)} />
                          {opt}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                )}
              </Box>
            ))}
          </Stack>
        </Box>
      ))}
    </Stack>
  );
}

/** Build human-readable rows [{ section, label, value }] for PDF / export */
export function checklistAnswersToRows(structure, answers) {
  if (!structure?.sections?.length) return [];
  const rows = [];
  for (const sec of structure.sections) {
    for (const item of sec.items || []) {
      rows.push({
        section: sec.title,
        label: item.label,
        value: formatAnswerDisplay(item, answers?.[item.id]),
      });
    }
  }
  return rows;
}
