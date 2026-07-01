import {
  Box,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import {
  SHOW_IF_OPS,
  defaultShowIfRule,
  getShowIfMode,
  opNeedsValue,
  valueOptionsForShowIf,
} from '../utils/checklistVisibility';

function RuleFields({ rule, priorItems, onChange, onRemove, removeLabel }) {
  const triggerItem = priorItems.find((p) => p.id === rule.itemId) || priorItems[0];
  const op = rule.op || 'eq';
  const valueChoices = valueOptionsForShowIf(triggerItem, op);

  return (
    <Stack spacing={1} sx={{ p: 1, bgcolor: 'background.default', borderRadius: 1 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Typography variant="caption" color="text.secondary" fontWeight={600}>
          Condition
        </Typography>
        {onRemove && (
          <IconButton size="small" color="error" onClick={onRemove} aria-label={removeLabel || 'Remove condition'}>
            <DeleteOutlineIcon fontSize="small" />
          </IconButton>
        )}
      </Stack>
      <FormControl size="small" fullWidth>
        <InputLabel>Earlier question</InputLabel>
        <Select
          label="Earlier question"
          value={rule.itemId || ''}
          onChange={(e) => {
            const nextTrigger = priorItems.find((p) => p.id === e.target.value);
            onChange({
              ...defaultShowIfRule(nextTrigger),
              itemId: e.target.value,
            });
          }}
        >
          {priorItems.map((p) => (
            <MenuItem key={p.id} value={p.id}>
              {p.label || p.id}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
      <FormControl size="small" fullWidth>
        <InputLabel>Operator</InputLabel>
        <Select
          label="Operator"
          value={op}
          onChange={(e) => {
            const nextOp = e.target.value;
            const next = { ...rule, op: nextOp };
            if (!opNeedsValue(nextOp)) {
              delete next.value;
              delete next.values;
              delete next.valuesText;
            }
            onChange(next);
          }}
        >
          {SHOW_IF_OPS.map((x) => (
            <MenuItem key={x.value} value={x.value}>
              {x.label}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
      {opNeedsValue(op) &&
        (op === 'in' || op === 'not_in' ? (
          <TextField
            size="small"
            fullWidth
            label="Values (comma-separated)"
            value={rule.valuesText ?? (rule.values || []).join(', ')}
            onChange={(e) => {
              const raw = e.target.value;
              const values = raw
                .split(',')
                .map((x) => x.trim())
                .filter(Boolean);
              onChange({ ...rule, valuesText: raw, values, value: undefined });
            }}
          />
        ) : valueChoices.length ? (
          <FormControl size="small" fullWidth>
            <InputLabel>Value</InputLabel>
            <Select
              label="Value"
              value={rule.value ?? ''}
              onChange={(e) => onChange({ ...rule, value: e.target.value, values: undefined, valuesText: '' })}
            >
              {valueChoices.map((opt) => (
                <MenuItem key={opt} value={opt}>
                  {opt === 'yes' ? 'Yes' : opt === 'no' ? 'No' : opt}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        ) : (
          <TextField
            size="small"
            fullWidth
            label="Value"
            value={rule.value ?? ''}
            onChange={(e) => onChange({ ...rule, value: e.target.value, values: undefined, valuesText: '' })}
          />
        ))}
    </Stack>
  );
}

export default function ShowIfConditionEditor({ showIf, priorItems, showIfValuesText, onChange }) {
  if (!priorItems.length) {
    return (
      <Typography variant="caption" color="text.secondary">
        Add earlier questions above before setting conditional visibility.
      </Typography>
    );
  }

  const mode = getShowIfMode(showIf);
  const rules = mode === 'all' ? showIf?.all || [] : mode === 'any' ? showIf?.any || [] : [];

  const setMode = (nextMode) => {
    const first = priorItems[0];
    if (nextMode === 'single') {
      onChange({ showIf: defaultShowIfRule(first), showIfValuesText: '' });
      return;
    }
    const key = nextMode === 'all' ? 'all' : 'any';
    onChange({
      showIf: { [key]: [defaultShowIfRule(first)] },
      showIfValuesText: '',
    });
  };

  const patchRules = (nextRules) => {
    const key = mode === 'all' ? 'all' : 'any';
    onChange({ showIf: { [key]: nextRules }, showIfValuesText: '' });
  };

  return (
    <Stack spacing={1.25}>
      <FormControl size="small" fullWidth>
        <InputLabel>Rule type</InputLabel>
        <Select label="Rule type" value={mode} onChange={(e) => setMode(e.target.value)}>
          <MenuItem value="single">Single condition</MenuItem>
          <MenuItem value="all">All match (AND) — every condition must be true</MenuItem>
          <MenuItem value="any">Any match (OR) — at least one condition must be true</MenuItem>
        </Select>
      </FormControl>

      {mode === 'single' ? (
        <RuleFields
          rule={showIf || defaultShowIfRule(priorItems[0])}
          priorItems={priorItems}
          onChange={(nextRule) =>
            onChange({
              showIf: nextRule,
              showIfValuesText: nextRule.valuesText ?? showIfValuesText ?? '',
            })
          }
        />
      ) : (
        <Box>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
            {mode === 'all'
              ? 'This question appears only when every condition below is satisfied.'
              : 'This question appears when any condition below is satisfied.'}
          </Typography>
          <Stack spacing={1}>
            {rules.map((rule, ri) => (
              <RuleFields
                key={`${rule.itemId || 'rule'}-${ri}`}
                rule={rule}
                priorItems={priorItems}
                onChange={(nextRule) => {
                  const next = [...rules];
                  next[ri] = nextRule;
                  patchRules(next);
                }}
                onRemove={rules.length > 1 ? () => patchRules(rules.filter((_, i) => i !== ri)) : undefined}
                removeLabel="Remove condition"
              />
            ))}
            <Box>
              <IconButton
                size="small"
                color="primary"
                onClick={() => patchRules([...rules, defaultShowIfRule(priorItems[0])])}
                aria-label="Add condition"
              >
                <AddIcon fontSize="small" />
              </IconButton>
              <Typography component="span" variant="caption" color="primary">
                Add condition
              </Typography>
            </Box>
          </Stack>
        </Box>
      )}
    </Stack>
  );
}
