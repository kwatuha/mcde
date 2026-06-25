import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Link,
  MenuItem,
  Paper,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import RocketLaunchIcon from '@mui/icons-material/RocketLaunch';
import RefreshIcon from '@mui/icons-material/Refresh';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ArchitectureIcon from '@mui/icons-material/Architecture';
import CompareArrowsIcon from '@mui/icons-material/CompareArrows';
import { Link as RouterLink } from 'react-router-dom';
import budgetService from '../api/budgetService';
import metaDataService from '../api/metaDataService';
import CreateRegistryProjectDialog from '../components/budget/CreateRegistryProjectDialog';
import ProjectScopeSetupDialog from '../components/budget/ProjectScopeSetupDialog';
import ProjectQuotationDialog from '../components/budget/ProjectQuotationDialog';
import Header from './dashboard/Header';
import { ROUTES } from '../configs/appConfig';
import { useAuth } from '../context/AuthContext';
import { formatCurrency, formatToSentenceCase } from '../utils/helpers';

function formatCommittedDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString();
}

function BudgetLineCell({ item }) {
  return (
    <>
      <Typography variant="body2" fontWeight={600}>
        {formatToSentenceCase(item.projectName) || 'Unnamed item'}
      </Typography>
      {item.adpProgrammeName && (
        <Typography variant="caption" color="text.secondary" display="block">
          {item.adpProgrammeName}
        </Typography>
      )}
      {item.adpProjectId && (
        <Chip label="ADP" size="small" color="info" sx={{ mt: 0.5, height: 20, fontSize: '0.7rem' }} />
      )}
    </>
  );
}

function scopeStatusLabel(status) {
  if (status === 'planned') return { label: 'Scope locked', color: 'success' };
  if (status === 'draft') return { label: 'Scope draft', color: 'warning' };
  return { label: 'No scope', color: 'default' };
}

function quotationRiskLabel(level) {
  if (level === 'high') return { label: 'Front-load risk', color: 'error' };
  if (level === 'medium') return { label: 'Quote watch', color: 'warning' };
  if (level === 'low') return { label: 'Quote OK', color: 'success' };
  return null;
}

export default function BudgetProcurementPage() {
  const { hasPrivilege } = useAuth();
  const [items, setItems] = useState([]);
  const [committedItems, setCommittedItems] = useState([]);
  const [summary, setSummary] = useState({ count: 0, totalAmount: 0 });
  const [committedSummary, setCommittedSummary] = useState({ count: 0, totalAmount: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [budgets, setBudgets] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [activeTab, setActiveTab] = useState('pending');
  const [filters, setFilters] = useState({
    budgetId: '',
    departmentId: '',
    search: '',
  });
  const [dialogItem, setDialogItem] = useState(null);
  const [scopeSetupItem, setScopeSetupItem] = useState(null);
  const [quotationItem, setQuotationItem] = useState(null);
  const [successMessage, setSuccessMessage] = useState('');

  const canCreateProject = hasPrivilege?.('budget.update') || hasPrivilege?.('project.create');

  useEffect(() => {
    Promise.all([
      budgetService.getBudgetContainers?.({ status: 'Approved' }).catch(() => ({ budgets: [] })),
      metaDataService.getDepartments?.().catch(() => []),
    ]).then(([budgetData, deptData]) => {
      const budgetList = Array.isArray(budgetData) ? budgetData : (budgetData?.budgets || []);
      setBudgets(budgetList);
      setDepartments(Array.isArray(deptData) ? deptData : (deptData?.departments || []));
    });
  }, []);

  const loadQueue = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = {};
      if (filters.budgetId) params.budgetId = filters.budgetId;
      if (filters.departmentId) params.departmentId = filters.departmentId;
      if (filters.search.trim()) params.search = filters.search.trim();
      const data = await budgetService.getProcurementQueue(params);
      setItems(data?.items || []);
      setSummary(data?.summary || { count: 0, totalAmount: 0 });
      setCommittedItems(data?.committed?.items || []);
      setCommittedSummary(data?.committed?.summary || { count: 0, totalAmount: 0 });
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Failed to load budget procurement queue.');
      setItems([]);
      setSummary({ count: 0, totalAmount: 0 });
      setCommittedItems([]);
      setCommittedSummary({ count: 0, totalAmount: 0 });
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    loadQueue();
  }, [loadQueue]);

  const selectedBudgetLabel = useMemo(() => {
    if (!dialogItem?.budgetId) return '';
    const match = budgets.find((b) => String(b.budgetId) === String(dialogItem.budgetId));
    return match?.budgetName || dialogItem.budgetName || '';
  }, [budgets, dialogItem]);

  const handleCreateSuccess = async (result) => {
    const projectId = result?.registryProjectId;
    setSuccessMessage(
      projectId
        ? `Registry project #${projectId} linked. It now appears under Committed.`
        : 'Registry project created successfully.'
    );
    setDialogItem(null);
    setActiveTab('committed');
    await loadQueue();
  };

  const handleScopeSetupSuccess = async (result) => {
    setSuccessMessage(result?.message || 'Project scope updated successfully.');
    setScopeSetupItem(null);
    await loadQueue();
  };

  const handleQuotationSuccess = async (result) => {
    setSuccessMessage(result?.message || 'Contracted quotation updated.');
    setQuotationItem(null);
    await loadQueue();
  };

  return (
    <Box m="20px">
      <Header
        title="Budget Procurement Intake"
        subtitle="Create registry projects from approved budget lines and track what is already committed"
      />

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ mb: 2 }} alignItems={{ md: 'center' }}>
        <Chip
          label={`${summary.count} pending`}
          color="warning"
          variant="outlined"
        />
        <Chip
          label={`${formatCurrency(Number(summary.totalAmount || 0))} pending`}
          color="warning"
          variant="outlined"
          sx={{ display: { xs: 'none', sm: 'inline-flex' } }}
        />
        <Chip
          icon={<CheckCircleOutlineIcon />}
          label={`${committedSummary.count} committed`}
          color="success"
          variant="outlined"
        />
        <Chip
          label={`${formatCurrency(Number(committedSummary.totalAmount || 0))} committed`}
          color="success"
          variant="outlined"
          sx={{ display: { xs: 'none', sm: 'inline-flex' } }}
        />
        <Box sx={{ flexGrow: 1 }} />
        <Button
          variant="outlined"
          startIcon={<RefreshIcon />}
          onClick={loadQueue}
          disabled={loading}
        >
          Refresh
        </Button>
        <Button
          component={RouterLink}
          to={ROUTES.BUDGET_MANAGEMENT}
          variant="text"
          endIcon={<OpenInNewIcon fontSize="small" />}
        >
          Department budgets
        </Button>
      </Stack>

      {successMessage && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccessMessage('')}>
          {successMessage}
          {' '}
          {successMessage.includes('#') && (
            <Link component={RouterLink} to={ROUTES.PROCUREMENT} underline="hover">
              Open procurement
            </Link>
          )}
        </Alert>
      )}

      <Paper sx={{ p: 2, mb: 2 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
          <TextField
            select
            label="Department budget"
            value={filters.budgetId}
            onChange={(event) => setFilters((prev) => ({ ...prev, budgetId: event.target.value }))}
            sx={{ minWidth: 220 }}
            size="small"
          >
            <MenuItem value="">All approved budgets</MenuItem>
            {budgets.map((budget) => (
              <MenuItem key={budget.budgetId} value={budget.budgetId}>
                {budget.budgetName}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            label="Department"
            value={filters.departmentId}
            onChange={(event) => setFilters((prev) => ({ ...prev, departmentId: event.target.value }))}
            sx={{ minWidth: 200 }}
            size="small"
          >
            <MenuItem value="">All departments</MenuItem>
            {departments.map((dept) => (
              <MenuItem key={dept.departmentId || dept.id} value={dept.departmentId || dept.id}>
                {dept.name}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            label="Search budget line, budget, or registry project"
            value={filters.search}
            onChange={(event) => setFilters((prev) => ({ ...prev, search: event.target.value }))}
            size="small"
            sx={{ minWidth: 240, flexGrow: 1 }}
          />
        </Stack>
      </Paper>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Paper sx={{ mb: 2 }}>
        <Tabs
          value={activeTab}
          onChange={(_, value) => setActiveTab(value)}
          sx={{ px: 2, borderBottom: 1, borderColor: 'divider' }}
        >
          <Tab
            value="pending"
            label={`Pending (${summary.count})`}
          />
          <Tab
            value="committed"
            label={`Committed (${committedSummary.count})`}
          />
        </Tabs>

        {activeTab === 'pending' && (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 700 }}>Budget line</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Department budget</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Department</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Location</TableCell>
                  <TableCell sx={{ fontWeight: 700 }} align="right">Amount</TableCell>
                  <TableCell sx={{ fontWeight: 700 }} align="center" width={160}>Action</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={6} align="center" sx={{ py: 5 }}>
                      <CircularProgress size={28} />
                    </TableCell>
                  </TableRow>
                ) : items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} align="center" sx={{ py: 5 }}>
                      <Typography variant="body2" color="text.secondary">
                        No pending budget lines. Switch to Committed to see linked registry projects.
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  items.map((item) => (
                    <TableRow key={item.itemId} hover>
                      <TableCell><BudgetLineCell item={item} /></TableCell>
                      <TableCell>
                        <Typography variant="body2">{item.budgetName || '—'}</Typography>
                        <Typography variant="caption" color="text.secondary">{item.finYearName || ''}</Typography>
                      </TableCell>
                      <TableCell>{item.departmentName || '—'}</TableCell>
                      <TableCell>
                        {[item.subcountyName, item.wardName].filter(Boolean).join(' · ') || '—'}
                      </TableCell>
                      <TableCell align="right" sx={{ fontWeight: 600, color: 'success.main' }}>
                        {formatCurrency(Number(item.amount || 0))}
                      </TableCell>
                      <TableCell align="center">
                        {canCreateProject ? (
                          <Tooltip title="Create or link registry project">
                            <Button
                              size="small"
                              variant="contained"
                              startIcon={<RocketLaunchIcon fontSize="small" />}
                              onClick={() => setDialogItem(item)}
                            >
                              Create project
                            </Button>
                          </Tooltip>
                        ) : (
                          <Typography variant="caption" color="text.secondary">No access</Typography>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        )}

        {activeTab === 'committed' && (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 700 }}>Budget line</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Registry project</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Department budget</TableCell>
                  <TableCell sx={{ fontWeight: 700 }} align="right">Amount</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Scope</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Committed</TableCell>
                  <TableCell sx={{ fontWeight: 700 }} align="center" width={200}>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={8} align="center" sx={{ py: 5 }}>
                      <CircularProgress size={28} />
                    </TableCell>
                  </TableRow>
                ) : committedItems.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} align="center" sx={{ py: 5 }}>
                      <Typography variant="body2" color="text.secondary">
                        No committed lines yet. Create a registry project from the Pending tab.
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  committedItems.map((item) => (
                    <TableRow key={`committed-${item.itemId}`} hover>
                      <TableCell><BudgetLineCell item={item} /></TableCell>
                      <TableCell>
                        {item.registryProjectId ? (
                          <Link
                            component={RouterLink}
                            to={`/projects/${item.registryProjectId}`}
                            underline="hover"
                            fontWeight={600}
                          >
                            {formatToSentenceCase(item.registryProjectName) || `Project #${item.registryProjectId}`}
                          </Link>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">{item.budgetName || '—'}</Typography>
                        <Typography variant="caption" color="text.secondary">{item.finYearName || ''}</Typography>
                      </TableCell>
                      <TableCell align="right" sx={{ fontWeight: 600, color: 'success.main' }}>
                        {formatCurrency(Number(item.amount || 0))}
                      </TableCell>
                      <TableCell>
                        {(() => {
                          const meta = scopeStatusLabel(item.scopeStatus);
                          return (
                            <Stack spacing={0.5}>
                              <Chip
                                label={meta.label}
                                size="small"
                                color={meta.color}
                                variant="outlined"
                                sx={{ height: 22, fontSize: '0.7rem', width: 'fit-content' }}
                              />
                              {(item.milestoneCount > 0 || item.bqItemCount > 0) && (
                                <Typography variant="caption" color="text.secondary">
                                  {item.milestoneCount || 0} ms · {item.bqItemCount || 0} BQ
                                  {item.bqBudgetAmount > 0 ? ` · ${formatCurrency(Number(item.bqBudgetAmount))}` : ''}
                                </Typography>
                              )}
                              {item.hasQuotation && quotationRiskLabel(item.quotationRiskLevel) && (
                                <Chip
                                  label={quotationRiskLabel(item.quotationRiskLevel).label}
                                  size="small"
                                  color={quotationRiskLabel(item.quotationRiskLevel).color}
                                  sx={{ height: 20, fontSize: '0.68rem', width: 'fit-content' }}
                                />
                              )}
                            </Stack>
                          );
                        })()}
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={item.registryProjectStatus || 'Linked'}
                          size="small"
                          color={item.registryProjectStatus === 'Under Procurement' ? 'warning' : 'default'}
                          variant="outlined"
                          sx={{ height: 22, fontSize: '0.7rem' }}
                        />
                      </TableCell>
                      <TableCell sx={{ fontSize: '0.813rem' }}>
                        {formatCommittedDate(item.committedAt)}
                      </TableCell>
                      <TableCell align="center">
                        <Stack direction="row" spacing={0.5} justifyContent="center" flexWrap="wrap" useFlexGap>
                          {item.registryProjectId && (
                            <>
                              <Button
                                component={RouterLink}
                                to={`/projects/${item.registryProjectId}`}
                                size="small"
                                variant="text"
                              >
                                View
                              </Button>
                              <Button
                                size="small"
                                variant="contained"
                                startIcon={<ArchitectureIcon fontSize="small" />}
                                onClick={() => setScopeSetupItem(item)}
                              >
                                Setup scope
                              </Button>
                              <Button
                                size="small"
                                variant={item.quotationRiskLevel === 'high' ? 'contained' : 'outlined'}
                                color={item.quotationRiskLevel === 'high' ? 'warning' : 'primary'}
                                startIcon={<CompareArrowsIcon fontSize="small" />}
                                onClick={() => setQuotationItem(item)}
                              >
                                Quote
                              </Button>
                              <Button
                                component={RouterLink}
                                to={ROUTES.PROCUREMENT}
                                size="small"
                                variant="text"
                              >
                                Procure
                              </Button>
                            </>
                          )}
                        </Stack>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>

      <CreateRegistryProjectDialog
        open={Boolean(dialogItem)}
        onClose={() => setDialogItem(null)}
        item={dialogItem}
        budgetLabel={selectedBudgetLabel || dialogItem?.budgetName}
        onSuccess={handleCreateSuccess}
      />

      <ProjectScopeSetupDialog
        open={Boolean(scopeSetupItem)}
        onClose={() => setScopeSetupItem(null)}
        item={scopeSetupItem}
        onSuccess={handleScopeSetupSuccess}
      />

      <ProjectQuotationDialog
        open={Boolean(quotationItem)}
        onClose={() => setQuotationItem(null)}
        item={quotationItem}
        onSuccess={handleQuotationSuccess}
      />
    </Box>
  );
}
