import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Typography,
  Divider,
  IconButton,
  Tooltip,
} from '@mui/material';
import { DataGrid } from '@mui/x-data-grid';
import AddIcon from '@mui/icons-material/Add';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import RefreshIcon from '@mui/icons-material/Refresh';
import { useAuth } from '../context/AuthContext';
import apiService from '../api';
import { formatCurrency } from '../utils/helpers';

const statusColor = (status) => {
  const s = String(status || '').toLowerCase();
  if (s.includes('approved') || s.includes('paid')) return 'success';
  if (s.includes('reject') || s.includes('declined')) return 'error';
  if (s.includes('pending') || s.includes('submitted')) return 'warning';
  return 'default';
};

export default function ContractorPaymentsPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const preselectedProjectId = searchParams.get('projectId');
  const { user, authLoading } = useAuth();
  const contractorId = user?.contractorId;
  const profile = user?.contractorProfile;

  const [projects, setProjects] = useState([]);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    projectId: '',
    amount: '',
    description: '',
    invoiceNumber: '',
  });
  const [formError, setFormError] = useState('');

  const load = useCallback(async () => {
    if (!contractorId) return;
    setLoading(true);
    setError('');
    try {
      const [projectsData, paymentsData] = await Promise.all([
        apiService.contractors.getProjectsByContractor(contractorId),
        apiService.contractors.getPaymentRequestsByContractor(contractorId),
      ]);
      const projectList = Array.isArray(projectsData)
        ? projectsData
        : Array.isArray(projectsData?.projects)
          ? projectsData.projects
          : [];
      setProjects(projectList);
      setPayments(Array.isArray(paymentsData) ? paymentsData : []);
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Failed to load payment requests.');
    } finally {
      setLoading(false);
    }
  }, [contractorId]);

  useEffect(() => {
    if (!authLoading && contractorId) load();
    else if (!authLoading) setLoading(false);
  }, [authLoading, contractorId, load]);

  useEffect(() => {
    if (!preselectedProjectId || loading) return;
    setForm((prev) => ({ ...prev, projectId: preselectedProjectId }));
    setDialogOpen(true);
  }, [preselectedProjectId, loading]);

  const handleSubmit = async () => {
    setFormError('');
    if (!form.projectId || !form.amount || !form.description.trim()) {
      setFormError('Project, amount, and description are required.');
      return;
    }
    setSubmitting(true);
    try {
      await apiService.contractors.createPaymentRequest(contractorId, {
        projectId: Number(form.projectId),
        amount: Number(form.amount),
        description: form.description.trim(),
        invoiceNumber: form.invoiceNumber.trim() || undefined,
      });
      setDialogOpen(false);
      setForm({ projectId: '', amount: '', description: '', invoiceNumber: '' });
      await load();
    } catch (err) {
      setFormError(err?.response?.data?.message || err?.message || 'Failed to submit payment request.');
    } finally {
      setSubmitting(false);
    }
  };

  const rows = useMemo(
    () =>
      payments.map((row) => ({
        id: row.requestId || row.requestid || row.id,
        projectName: row.projectName || row.projectname || `Project #${row.projectId || row.projectid}`,
        amount: Number(row.amount || 0),
        description: row.description || '',
        invoiceNumber: row.invoiceNumber || row.invoicenumber || '—',
        submittedAt: row.submittedAt || row.submittedat || null,
        status: row.approvalWorkflowStatus || row.approvalworkflowstatus || 'Submitted',
      })),
    [payments]
  );

  const columns = [
    { field: 'projectName', headerName: 'Project', flex: 1.2, minWidth: 160 },
    {
      field: 'amount',
      headerName: 'Amount (KES)',
      width: 140,
      valueFormatter: (value) => formatCurrency(value),
    },
    { field: 'invoiceNumber', headerName: 'Invoice #', width: 120 },
    {
      field: 'submittedAt',
      headerName: 'Submitted',
      width: 120,
      valueFormatter: (value) => (value ? String(value).slice(0, 10) : '—'),
    },
    {
      field: 'status',
      headerName: 'Status',
      width: 140,
      renderCell: (params) => (
        <Chip size="small" label={params.value || '—'} color={statusColor(params.value)} variant="outlined" />
      ),
    },
    { field: 'description', headerName: 'Description', flex: 1.5, minWidth: 200 },
  ];

  const totalPending = rows.filter((r) => String(r.status).toLowerCase().includes('pending')).length;
  const totalApproved = rows.filter((r) => String(r.status).toLowerCase().includes('approved')).length;

  if (authLoading || loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '50vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!contractorId) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="warning">
          Your account is not linked to a contractor profile. Contact an administrator to assign your company
          record before requesting payments.
        </Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1200, mx: 'auto' }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/contractor-dashboard')} size="small">
          Dashboard
        </Button>
        <Tooltip title="Refresh list">
          <IconButton size="small" onClick={load} disabled={loading} sx={{ color: 'text.secondary' }}>
            <RefreshIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Stack>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Paper variant="outlined" sx={{ p: { xs: 2, md: 2.5 }, borderRadius: 2.5 }}>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          justifyContent="space-between"
          alignItems={{ sm: 'flex-start' }}
          spacing={1.5}
          sx={{ mb: 2 }}
        >
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
              Payment requests
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
              {profile?.companyName || 'Your company'} — submit and track requests for assigned projects.
            </Typography>
          </Box>
          <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap sx={{ flexShrink: 0 }}>
            <Chip size="small" label={`Total ${rows.length}`} variant="outlined" />
            <Chip size="small" label={`Pending ${totalPending}`} color="warning" variant="outlined" />
            <Chip size="small" label={`Approved ${totalApproved}`} color="success" variant="outlined" />
          </Stack>
        </Stack>

        <Divider sx={{ mb: 2 }} />

        <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ sm: 'center' }} spacing={1} sx={{ mb: 2 }}>
          <Typography variant="body1" sx={{ fontWeight: 600, flex: 1 }}>
            Your requests
          </Typography>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setDialogOpen(true)}
            disabled={projects.length === 0}
          >
            New payment request
          </Button>
        </Stack>

        {projects.length === 0 && (
          <Alert severity="info" sx={{ mb: 2 }}>
            You have no assigned projects yet. Payment requests can be submitted once a project is assigned to your company.
          </Alert>
        )}

        <Box sx={{ height: 420, width: '100%' }}>
          <DataGrid
            rows={rows}
            columns={columns}
            pageSizeOptions={[10, 25]}
            initialState={{ pagination: { paginationModel: { pageSize: 10 } } }}
            disableRowSelectionOnClick
            sx={{ border: 'none' }}
          />
        </Box>
      </Paper>

      <Dialog open={dialogOpen} onClose={() => !submitting && setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Submit payment request</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {formError && <Alert severity="error">{formError}</Alert>}
            <FormControl fullWidth required>
              <InputLabel>Project</InputLabel>
              <Select
                value={form.projectId}
                label="Project"
                onChange={(e) => setForm((f) => ({ ...f, projectId: e.target.value }))}
              >
                {projects.map((p) => (
                  <MenuItem key={p.id} value={p.id}>
                    {p.projectName || p.name || `Project #${p.id}`}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              label="Amount (KES)"
              type="number"
              required
              fullWidth
              value={form.amount}
              onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
              inputProps={{ min: 1, step: '0.01' }}
            />
            <TextField
              label="Invoice / reference number"
              fullWidth
              value={form.invoiceNumber}
              onChange={(e) => setForm((f) => ({ ...f, invoiceNumber: e.target.value }))}
            />
            <TextField
              label="Description"
              required
              fullWidth
              multiline
              minRows={3}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Describe the work completed and what this payment covers..."
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button variant="contained" onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Submitting…' : 'Submit request'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
