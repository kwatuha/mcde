import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import { DataGrid } from '@mui/x-data-grid';
import AddIcon from '@mui/icons-material/Add';
import axiosInstance from '../../api/axiosInstance';
import { formatCurrency } from '../../utils/helpers';

const statusColor = (status) => {
  const s = String(status || '').toLowerCase();
  if (s.includes('approved') || s.includes('paid')) return 'success';
  if (s.includes('reject') || s.includes('declined')) return 'error';
  if (s.includes('pending') || s.includes('submitted')) return 'warning';
  return 'default';
};

export default function ProjectPaymentRequestsPanel({ projectId, onOpenCertificatesTab }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setError('');
    try {
      const { data } = await axiosInstance.get(`/projects/project_certificates/project/${projectId}`);
      const list = Array.isArray(data) ? data : [];
      setRows(list.map((row) => ({
        id: row.certificateId || row.id,
        certificateNumber: row.certificateNumber || row.certificatenumber || '—',
        requestDate: row.requestDate || row.requestdate || null,
        amount: Number(row.amount || row.totalAmount || row.totalamount || 0),
        status: row.approvalWorkflowStatus || row.status || row.paymentStatus || 'Draft',
        description: row.description || row.remarks || '',
      })));
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Failed to load payment certificates.');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  const columns = [
    { field: 'certificateNumber', headerName: 'Certificate #', flex: 1, minWidth: 140 },
    {
      field: 'requestDate',
      headerName: 'Request date',
      width: 120,
      valueFormatter: (value) => (value ? String(value).slice(0, 10) : '—'),
    },
    {
      field: 'amount',
      headerName: 'Amount',
      width: 130,
      valueFormatter: (value) => formatCurrency(value),
    },
    {
      field: 'status',
      headerName: 'Status',
      width: 150,
      renderCell: (params) => (
        <Chip size="small" label={params.value || '—'} color={statusColor(params.value)} variant="outlined" />
      ),
    },
    { field: 'description', headerName: 'Description', flex: 1.2, minWidth: 180 },
  ];

  const totalRequested = rows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const approvedCount = rows.filter((row) => String(row.status).toLowerCase().includes('approved')).length;

  return (
    <Box>
      <Paper elevation={2} sx={{ p: 2, borderRadius: 2, mb: 2 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} alignItems={{ md: 'center' }} sx={{ mb: 2 }}>
          <Typography variant="h6" sx={{ fontWeight: 600, flex: 1 }}>
            Payment Requests & Certificates
          </Typography>
          <Stack direction="row" spacing={1}>
            <Chip label={`Requests: ${rows.length}`} size="small" />
            <Chip label={`Approved: ${approvedCount}`} size="small" color="success" variant="outlined" />
            <Chip label={`Total: ${formatCurrency(totalRequested)}`} size="small" color="primary" variant="outlined" />
          </Stack>
          {onOpenCertificatesTab && (
            <Button variant="contained" size="small" startIcon={<AddIcon />} onClick={onOpenCertificatesTab}>
              New certificate
            </Button>
          )}
        </Stack>

        <Alert severity="info" sx={{ mb: 2 }}>
          Payment requests are managed through project payment certificates with approval workflow.
          Create and track certificates from the Certificates tab.
        </Alert>

        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        {loading ? (
          <Box sx={{ py: 4, display: 'flex', justifyContent: 'center' }}>
            <CircularProgress size={28} />
          </Box>
        ) : rows.length === 0 ? (
          <Alert severity="warning">No payment certificates recorded for this project yet.</Alert>
        ) : (
          <Box sx={{ height: 360 }}>
            <DataGrid
              rows={rows}
              columns={columns}
              disableRowSelectionOnClick
              pageSizeOptions={[5, 10, 25]}
              initialState={{ pagination: { paginationModel: { pageSize: 10 } } }}
            />
          </Box>
        )}
      </Paper>
    </Box>
  );
}
