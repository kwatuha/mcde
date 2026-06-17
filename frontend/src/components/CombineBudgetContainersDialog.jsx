import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Avatar,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  Grid,
  InputLabel,
  MenuItem,
  Select,
  TextField,
  Typography,
  useTheme,
} from '@mui/material';
import {
  AttachMoney as MoneyIcon,
  CheckCircle as CheckCircleIcon,
} from '@mui/icons-material';
import { tokens } from '../pages/dashboard/theme';
import { formatCurrency } from '../utils/helpers';

const parseBudgetAmount = (value) => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }
  if (value === null || value === undefined || value === '') {
    return 0;
  }
  const numericValue = Number(String(value).replace(/,/g, '').replace(/[^\d.-]/g, ''));
  return Number.isFinite(numericValue) ? numericValue : 0;
};

const ContainerOption = React.memo(function ContainerOption({
  container,
  isSelected,
  onToggle,
}) {
  const theme = useTheme();
  const colors = tokens(theme.palette.mode);
  const isLight = theme.palette.mode === 'light';

  return (
    <Box
      onClick={() => onToggle(container.budgetId)}
      sx={{
        p: 1.5,
        mb: 1,
        borderRadius: 1,
        cursor: 'pointer',
        bgcolor: isSelected
          ? (isLight ? colors.blueAccent[500] : colors.blueAccent[600])
          : (isLight ? 'background.paper' : colors.primary[600]),
        color: isSelected ? 'white' : 'text.primary',
        border: 1,
        borderColor: isSelected
          ? (isLight ? colors.blueAccent[500] : colors.blueAccent[600])
          : 'divider',
        '&:hover': {
          bgcolor: isSelected
            ? (isLight ? colors.blueAccent[400] : colors.blueAccent[700])
            : (isLight ? 'action.hover' : colors.primary[700]),
        },
        transition: 'background-color 0.2s, border-color 0.2s',
      }}
    >
      <Box display="flex" justifyContent="space-between" alignItems="center">
        <Box>
          <Typography
            variant="body2"
            fontWeight={600}
            sx={{ color: isSelected ? 'white' : 'text.primary' }}
          >
            {container.budgetName}
          </Typography>
          <Typography
            variant="caption"
            sx={{
              opacity: isSelected ? 0.9 : 1,
              color: isSelected ? 'white' : 'text.secondary',
            }}
          >
            {container.departmentName || 'No Department'} • {formatCurrency(parseBudgetAmount(container.totalAmount))}
          </Typography>
        </Box>
        <CheckCircleIcon
          sx={{
            fontSize: 20,
            opacity: isSelected ? 1 : 0.35,
            color: isSelected ? 'white' : 'action.active',
          }}
        />
      </Box>
    </Box>
  );
});

function CombineBudgetContainersDialog({
  open,
  onClose,
  onSubmit,
  containers = [],
  financialYears = [],
  loading = false,
}) {
  const theme = useTheme();
  const colors = tokens(theme.palette.mode);
  const isLight = theme.palette.mode === 'light';

  const [budgetName, setBudgetName] = useState('');
  const [finYearId, setFinYearId] = useState('');
  const [description, setDescription] = useState('');
  const [selectedContainerIds, setSelectedContainerIds] = useState([]);

  useEffect(() => {
    if (!open) return;
    setBudgetName('');
    setFinYearId('');
    setDescription('');
    setSelectedContainerIds([]);
  }, [open]);

  const eligibleContainers = useMemo(
    () => containers.filter((c) => c.isCombined !== 1 && !c.parentBudgetId && c.status !== 'Rejected'),
    [containers]
  );

  const selectedSet = useMemo(() => new Set(selectedContainerIds), [selectedContainerIds]);

  const handleToggleContainer = useCallback((budgetId) => {
    setSelectedContainerIds((prev) => (
      prev.includes(budgetId)
        ? prev.filter((id) => id !== budgetId)
        : [...prev, budgetId]
    ));
  }, []);

  const handleSubmit = () => {
    onSubmit({
      budgetName: budgetName.trim(),
      finYearId,
      description: description.trim(),
      selectedContainerIds,
    });
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 3,
          bgcolor: 'background.paper',
        },
      }}
    >
      <DialogTitle
        sx={{
          backgroundColor: isLight ? colors.blueAccent[500] : colors.blueAccent[600],
          color: 'white',
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          py: 2.5,
        }}
      >
        <Avatar sx={{ bgcolor: isLight ? colors.blueAccent[400] : colors.blueAccent[700] }}>
          <MoneyIcon />
        </Avatar>
        <Box>
          <Typography variant="h6" fontWeight="bold">
            Create Consolidated Budget
          </Typography>
          <Typography variant="body2" sx={{ opacity: 0.9 }}>
            Roll up multiple department budgets into one county-wide view
          </Typography>
        </Box>
      </DialogTitle>
      <DialogContent sx={{ py: 3, px: 3 }}>
        <Grid container spacing={2}>
          <Grid item xs={12}>
            <TextField
              fullWidth
                label="Consolidated Budget Name *"
              value={budgetName}
              onChange={(e) => setBudgetName(e.target.value)}
              placeholder="e.g., 2025/2026 Organizational Budget"
              required
            />
          </Grid>
          <Grid item xs={12} md={6}>
            <FormControl fullWidth required sx={{ minWidth: 200 }}>
              <InputLabel>Financial Year *</InputLabel>
              <Select
                value={finYearId}
                label="Financial Year *"
                onChange={(e) => setFinYearId(e.target.value)}
              >
                {financialYears.map((fy) => (
                  <MenuItem key={fy.finYearId} value={fy.finYearId}>
                    {fy.finYearName}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12}>
            <TextField
              fullWidth
              label="Description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              multiline
              rows={2}
              placeholder="Description of the combined budget..."
            />
          </Grid>
          <Grid item xs={12}>
            <Typography variant="subtitle2" fontWeight={600} gutterBottom>
              Select department budgets to include ({selectedContainerIds.length} selected)
            </Typography>
            <Box
              sx={{
                maxHeight: 300,
                overflowY: 'auto',
                border: 1,
                borderColor: 'divider',
                borderRadius: 1,
                p: 1,
                bgcolor: isLight ? theme.palette.grey[50] : colors.primary[500],
              }}
            >
              {eligibleContainers.map((container) => (
                <ContainerOption
                  key={container.budgetId}
                  container={container}
                  isSelected={selectedSet.has(container.budgetId)}
                  onToggle={handleToggleContainer}
                />
              ))}
              {eligibleContainers.length === 0 ? (
                <Typography variant="body2" color="text.secondary" textAlign="center" p={2}>
                  No available department budgets to consolidate
                </Typography>
              ) : null}
            </Box>
          </Grid>
        </Grid>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2, gap: 1 }}>
        <Button onClick={onClose} variant="outlined" color="inherit">
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          disabled={loading || selectedContainerIds.length === 0}
          sx={{
            backgroundColor: isLight ? colors.blueAccent[500] : colors.blueAccent[600],
            '&:hover': { backgroundColor: isLight ? colors.blueAccent[400] : colors.blueAccent[700] },
            fontWeight: 'bold',
          }}
          startIcon={<MoneyIcon />}
        >
          {loading ? <CircularProgress size={20} color="inherit" /> : 'Create Consolidated Budget'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default React.memo(CombineBudgetContainersDialog);
