import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Avatar,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  Grid,
  InputAdornment,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
  useTheme,
} from '@mui/material';
import {
  AttachMoney as MoneyIcon,
  CheckCircle as CheckCircleIcon,
  Search as SearchIcon,
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

const statusChipColor = (status) => {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'approved') return 'success';
  if (normalized === 'rejected') return 'error';
  if (normalized === 'pending' || normalized === 'submitted') return 'warning';
  return 'default';
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
        height: '100%',
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
      <Box display="flex" justifyContent="space-between" alignItems="flex-start" gap={1}>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography
            variant="body2"
            fontWeight={600}
            noWrap
            title={container.budgetName}
            sx={{ color: isSelected ? 'white' : 'text.primary' }}
          >
            {container.budgetName}
          </Typography>
          <Typography
            variant="caption"
            display="block"
            sx={{
              opacity: isSelected ? 0.9 : 1,
              color: isSelected ? 'white' : 'text.secondary',
            }}
          >
            {container.departmentName || 'No Department'}
          </Typography>
          <Box display="flex" flexWrap="wrap" gap={0.5} mt={0.75} alignItems="center">
            <Typography
              variant="caption"
              fontWeight={600}
              sx={{ color: isSelected ? 'white' : 'text.primary' }}
            >
              {formatCurrency(parseBudgetAmount(container.totalAmount))}
            </Typography>
            {container.finYearName ? (
              <Chip
                label={container.finYearName}
                size="small"
                sx={{
                  height: 20,
                  fontSize: '0.7rem',
                  bgcolor: isSelected ? 'rgba(255,255,255,0.2)' : 'action.hover',
                  color: isSelected ? 'white' : 'text.secondary',
                }}
              />
            ) : null}
            {container.status ? (
              <Chip
                label={container.status}
                size="small"
                color={isSelected ? 'default' : statusChipColor(container.status)}
                sx={{
                  height: 20,
                  fontSize: '0.7rem',
                  ...(isSelected ? {
                    bgcolor: 'rgba(255,255,255,0.2)',
                    color: 'white',
                  } : {}),
                }}
              />
            ) : null}
            {container.itemCount > 0 ? (
              <Typography
                variant="caption"
                sx={{ color: isSelected ? 'rgba(255,255,255,0.85)' : 'text.secondary' }}
              >
                {container.itemCount} items
              </Typography>
            ) : null}
          </Box>
        </Box>
        <CheckCircleIcon
          sx={{
            fontSize: 20,
            flexShrink: 0,
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
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (!open) return;
    setBudgetName('');
    setFinYearId('');
    setDescription('');
    setSelectedContainerIds([]);
    setSearchQuery('');
  }, [open]);

  const eligibleContainers = useMemo(
    () => containers.filter((c) => c.isCombined !== 1 && !c.parentBudgetId && c.status !== 'Rejected'),
    [containers]
  );

  const filteredContainers = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return eligibleContainers;
    return eligibleContainers.filter((container) => {
      const haystack = [
        container.budgetName,
        container.departmentName,
        container.finYearName,
        container.status,
      ].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(query);
    });
  }, [eligibleContainers, searchQuery]);

  const selectedSet = useMemo(() => new Set(selectedContainerIds), [selectedContainerIds]);

  const selectedTotal = useMemo(
    () => eligibleContainers
      .filter((container) => selectedSet.has(container.budgetId))
      .reduce((sum, container) => sum + parseBudgetAmount(container.totalAmount), 0),
    [eligibleContainers, selectedSet]
  );

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
      maxWidth="lg"
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
        <Stack spacing={2.5}>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, md: 8 }}>
              <TextField
                fullWidth
                label="Consolidated Budget Name *"
                value={budgetName}
                onChange={(e) => setBudgetName(e.target.value)}
                placeholder="e.g., 2025/2026 Organizational Budget"
                required
              />
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <FormControl fullWidth required>
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
          </Grid>

          <TextField
            fullWidth
            label="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            multiline
            rows={2}
            placeholder="Description of the consolidated budget..."
          />

          <Box>
            <Box
              display="flex"
              justifyContent="space-between"
              alignItems={{ xs: 'stretch', sm: 'center' }}
              flexDirection={{ xs: 'column', sm: 'row' }}
              gap={1.5}
              mb={1.5}
            >
              <Typography variant="subtitle2" fontWeight={600}>
                Select department budgets to include ({selectedContainerIds.length} selected)
              </Typography>
              {selectedContainerIds.length > 0 ? (
                <Typography variant="body2" color="text.secondary" fontWeight={600}>
                  Combined total: {formatCurrency(selectedTotal)}
                </Typography>
              ) : null}
            </Box>

            <TextField
              fullWidth
              size="small"
              placeholder="Search by name, department, or year..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              sx={{ mb: 1.5 }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon fontSize="small" color="action" />
                  </InputAdornment>
                ),
              }}
            />

            <Box
              sx={{
                maxHeight: 360,
                overflowY: 'auto',
                border: 1,
                borderColor: 'divider',
                borderRadius: 1,
                p: 1.5,
                bgcolor: isLight ? theme.palette.grey[50] : colors.primary[500],
              }}
            >
              {filteredContainers.length > 0 ? (
                <Grid container spacing={1.5}>
                  {filteredContainers.map((container) => (
                    <Grid key={container.budgetId} size={{ xs: 12, sm: 6 }}>
                      <ContainerOption
                        container={container}
                        isSelected={selectedSet.has(container.budgetId)}
                        onToggle={handleToggleContainer}
                      />
                    </Grid>
                  ))}
                </Grid>
              ) : (
                <Typography variant="body2" color="text.secondary" textAlign="center" py={3}>
                  {eligibleContainers.length === 0
                    ? 'No available department budgets to consolidate'
                    : 'No budgets match your search'}
                </Typography>
              )}
            </Box>
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2, gap: 1 }}>
        <Button onClick={onClose} variant="outlined" color="inherit">
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          disabled={loading || selectedContainerIds.length === 0 || !budgetName.trim() || !finYearId}
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
