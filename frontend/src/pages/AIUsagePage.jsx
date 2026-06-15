import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Container,
  Grid,
  Link,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import aiAssistantService from '../api/aiAssistantService';
import { useAuth } from '../context/AuthContext';
import { isAdmin } from '../utils/privilegeUtils';

const today = new Date();
const thirtyDaysAgo = new Date(today);
thirtyDaysAgo.setDate(today.getDate() - 30);

const DEFAULT_FILTERS = {
  startDate: thirtyDaysAgo.toISOString().slice(0, 10),
  endDate: today.toISOString().slice(0, 10),
  model: '',
};

function formatNumber(value) {
  return Number(value || 0).toLocaleString();
}

function formatUsd(value) {
  return Number(value || 0).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  });
}

function formatDateTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString();
}

function cleanFilters(filters) {
  return Object.fromEntries(
    Object.entries(filters).filter(([, value]) => String(value ?? '').trim() !== '')
  );
}

function MetricCard({ label, value, sub }) {
  return (
    <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', height: '100%' }}>
      <CardContent>
        <Typography variant="caption" color="text.secondary">{label}</Typography>
        <Typography variant="h5" sx={{ fontWeight: 800, mt: 0.5 }}>{value}</Typography>
        {sub ? <Typography variant="caption" color="text.secondary">{sub}</Typography> : null}
      </CardContent>
    </Card>
  );
}

function BreakdownTable({ title, rows, columns, emptyText = 'No records found.' }) {
  return (
    <Paper sx={{ p: 2 }}>
      <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>{title}</Typography>
      <TableContainer sx={{ maxHeight: 360 }}>
        <Table size="small" stickyHeader sx={{ minWidth: columns.reduce((sum, column) => sum + (column.minWidth || 120), 0) }}>
          <TableHead>
            <TableRow>
              {columns.map((column) => (
                <TableCell
                  key={column.key}
                  align={column.numeric ? 'right' : 'left'}
                  sx={{ minWidth: column.minWidth || 120 }}
                >
                  {column.label}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length}>{emptyText}</TableCell>
              </TableRow>
            ) : rows.map((row, index) => (
              <TableRow key={row.id || row.userId || row.model || row.day || index}>
                {columns.map((column) => (
                  <TableCell
                    key={column.key}
                    align={column.numeric ? 'right' : 'left'}
                    sx={{ minWidth: column.minWidth || 120 }}
                  >
                    {column.render ? column.render(row) : row[column.key]}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  );
}

export default function AIUsagePage() {
  const { user } = useAuth();
  const hasAdminAccess = isAdmin(user);
  const [filters, setFilters] = useState(() => ({ ...DEFAULT_FILTERS }));
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const modelOptions = useMemo(() => {
    const values = new Set(Object.keys(data?.pricing || {}));
    (data?.models || []).forEach((row) => {
      if (row.model) values.add(row.model);
    });
    return [...values].sort();
  }, [data]);

  const load = useCallback(async (nextFilters = DEFAULT_FILTERS) => {
    if (!hasAdminAccess) return;
    setLoading(true);
    setError('');
    try {
      const response = await aiAssistantService.getUsage(cleanFilters(nextFilters));
      setData(response || null);
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Failed to load AI usage statistics.');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [hasAdminAccess]);

  useEffect(() => {
    load(DEFAULT_FILTERS);
  }, [load]);

  if (!hasAdminAccess) {
    return (
      <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <Typography variant="h5" color="error" gutterBottom>Access Denied</Typography>
          <Typography variant="body1" color="text.secondary">
            Only administrators can view AI usage and cost statistics.
          </Typography>
        </Box>
      </Container>
    );
  }

  const summary = data?.summary || {};

  return (
    <Container maxWidth="xl" sx={{ mt: 3, mb: 4 }}>
      <Stack spacing={2}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 800 }}>AI Usage & Costs</Typography>
          <Typography variant="body2" color="text.secondary">
            Track AI assistant requests, tokens, errors, users, and estimated OpenAI costs.
          </Typography>
        </Box>

        <Alert severity="info">
          Costs shown here are estimates based on captured token usage and configured model pricing.
        </Alert>

        {error ? <Alert severity="error">{error}</Alert> : null}

        <Paper sx={{ p: 2 }}>
          <Grid container spacing={1.5} alignItems="center">
            <Grid item xs={12} sm={4} md={2}>
              <TextField
                fullWidth
                size="small"
                type="date"
                label="Start date"
                value={filters.startDate}
                onChange={(event) => setFilters((prev) => ({ ...prev, startDate: event.target.value }))}
                InputLabelProps={{ shrink: true }}
                sx={{ minWidth: 180 }}
              />
            </Grid>
            <Grid item xs={12} sm={4} md={2}>
              <TextField
                fullWidth
                size="small"
                type="date"
                label="End date"
                value={filters.endDate}
                onChange={(event) => setFilters((prev) => ({ ...prev, endDate: event.target.value }))}
                InputLabelProps={{ shrink: true }}
                sx={{ minWidth: 180 }}
              />
            </Grid>
            <Grid item xs={12} sm={4} md={2}>
              <TextField
                fullWidth
                select
                size="small"
                label="Model"
                value={filters.model}
                onChange={(event) => setFilters((prev) => ({ ...prev, model: event.target.value }))}
                sx={{ minWidth: 220 }}
              >
                <MenuItem value="">All models</MenuItem>
                {modelOptions.map((model) => (
                  <MenuItem key={model} value={model}>{model}</MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid item xs={12} md={4}>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                <Button
                  variant="contained"
                  startIcon={loading ? <CircularProgress size={16} color="inherit" /> : <RefreshIcon />}
                  onClick={() => load(filters)}
                  disabled={loading}
                  sx={{ minWidth: 130 }}
                >
                  Refresh
                </Button>
                <Button
                  variant="text"
                  onClick={() => {
                    setFilters({ ...DEFAULT_FILTERS });
                    load(DEFAULT_FILTERS);
                  }}
                  sx={{ minWidth: 96 }}
                >
                  Reset
                </Button>
              </Stack>
            </Grid>
          </Grid>
        </Paper>

        <Grid container spacing={2}>
          <Grid item xs={12} sm={6} md={2.4}>
            <MetricCard label="Requests" value={formatNumber(summary.requests)} sub={`${formatNumber(summary.errors)} errors`} />
          </Grid>
          <Grid item xs={12} sm={6} md={2.4}>
            <MetricCard label="Input tokens" value={formatNumber(summary.inputTokens)} />
          </Grid>
          <Grid item xs={12} sm={6} md={2.4}>
            <MetricCard label="Output tokens" value={formatNumber(summary.outputTokens)} />
          </Grid>
          <Grid item xs={12} sm={6} md={2.4}>
            <MetricCard label="Total tokens" value={formatNumber(summary.totalTokens)} />
          </Grid>
          <Grid item xs={12} sm={6} md={2.4}>
            <MetricCard label="Estimated cost" value={formatUsd(summary.estimatedCostUsd)} sub="Official balance is in OpenAI" />
          </Grid>
        </Grid>

        <Grid container spacing={2}>
          <Grid item xs={12} lg={6}>
            <BreakdownTable
              title="Usage by Model"
              rows={data?.models || []}
              columns={[
                { key: 'model', label: 'Model', minWidth: 180 },
                { key: 'requests', label: 'Requests', numeric: true, minWidth: 120, render: (row) => formatNumber(row.requests) },
                { key: 'totalTokens', label: 'Tokens', numeric: true, minWidth: 140, render: (row) => formatNumber(row.totalTokens) },
                { key: 'estimatedCostUsd', label: 'Est. cost', numeric: true, minWidth: 140, render: (row) => formatUsd(row.estimatedCostUsd) },
              ]}
            />
          </Grid>
          <Grid item xs={12} lg={6}>
            <BreakdownTable
              title="Usage by User"
              rows={data?.users || []}
              columns={[
                { key: 'username', label: 'User', minWidth: 180 },
                { key: 'requests', label: 'Requests', numeric: true, minWidth: 120, render: (row) => formatNumber(row.requests) },
                { key: 'totalTokens', label: 'Tokens', numeric: true, minWidth: 140, render: (row) => formatNumber(row.totalTokens) },
                { key: 'estimatedCostUsd', label: 'Est. cost', numeric: true, minWidth: 140, render: (row) => formatUsd(row.estimatedCostUsd) },
              ]}
            />
          </Grid>
          <Grid item xs={12} lg={6}>
            <BreakdownTable
              title="Daily Usage"
              rows={data?.daily || []}
              columns={[
                { key: 'day', label: 'Date', minWidth: 140, render: (row) => String(row.day || '').slice(0, 10) },
                { key: 'requests', label: 'Requests', numeric: true, minWidth: 120, render: (row) => formatNumber(row.requests) },
                { key: 'totalTokens', label: 'Tokens', numeric: true, minWidth: 140, render: (row) => formatNumber(row.totalTokens) },
                { key: 'estimatedCostUsd', label: 'Est. cost', numeric: true, minWidth: 140, render: (row) => formatUsd(row.estimatedCostUsd) },
              ]}
            />
          </Grid>
          <Grid item xs={12} lg={6}>
            <BreakdownTable
              title="Recent Interactions"
              rows={data?.recent || []}
              columns={[
                { key: 'occurredAt', label: 'Time', minWidth: 180, render: (row) => formatDateTime(row.occurredAt) },
                { key: 'username', label: 'User', minWidth: 160 },
                { key: 'routePath', label: 'Page', minWidth: 180 },
                { key: 'status', label: 'Status', minWidth: 120 },
                { key: 'totalTokens', label: 'Tokens', numeric: true, minWidth: 120, render: (row) => formatNumber(row.totalTokens) },
                { key: 'estimatedCostUsd', label: 'Cost', numeric: true, minWidth: 130, render: (row) => formatUsd(row.estimatedCostUsd) },
              ]}
            />
          </Grid>
        </Grid>
      </Stack>
    </Container>
  );
}
