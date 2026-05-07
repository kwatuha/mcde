import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Paper,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { Add as AddIcon, Edit as EditIcon, Delete as DeleteIcon } from '@mui/icons-material';
import IconButton from '@mui/material/IconButton';
import { Link } from 'react-router-dom';
import { DataGrid } from '@mui/x-data-grid';
import apiService from '../api';
import { useAuth } from '../context/AuthContext.jsx';
import { ROUTES } from '../configs/appConfig';

function useProcurementAccess() {
  const { user, hasPrivilege } = useAuth();
  const role = String(user?.roleName || user?.role || '').toLowerCase();
  const isAdminLike = ['admin', 'super_admin', 'super admin', 'administrator'].includes(role);
  const canUse =
    isAdminLike ||
    hasPrivilege('project.read_all') ||
    hasPrivilege('project.update');
  return { canUse };
}

export default function ProcurementStagesPage() {
  const { canUse } = useProcurementAccess();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [dialog, setDialog] = useState({ open: false, editing: null });
  const [form, setForm] = useState({ label: '', sortOrder: 0, active: true });

  const load = useCallback(async () => {
    if (!canUse) return;
    const data = await apiService.procurement.listStages({ all: true });
    setRows(Array.isArray(data) ? data : []);
  }, [canUse]);

  useEffect(() => {
    if (!canUse) {
      setLoading(false);
      setError('You need project access privileges to manage procurement stages.');
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        await load();
      } catch (e) {
        if (!cancelled)
          setError(e?.response?.data?.message || e?.message || 'Failed to load procurement stages.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [canUse, load]);

  const openCreate = () => {
    const nextOrder =
      rows.length > 0 ? Math.max(...rows.map((r) => Number(r.sortOrder) || 0)) + 1 : 0;
    setForm({ label: '', sortOrder: nextOrder, active: true });
    setDialog({ open: true, editing: null });
  };

  const openEdit = (row) => {
    setForm({
      label: row.label || '',
      sortOrder: Number(row.sortOrder) || 0,
      active: row.active !== false,
    });
    setDialog({ open: true, editing: row });
  };

  const save = async () => {
    if (!canUse) return;
    setMessage('');
    setError('');
    const label = form.label.trim();
    if (!label) {
      setError('Label is required.');
      return;
    }
    try {
      if (dialog.editing) {
        await apiService.procurement.updateStage(dialog.editing.id, {
          label,
          sortOrder: Number(form.sortOrder) || 0,
          active: form.active,
        });
        setMessage('Stage updated.');
      } else {
        await apiService.procurement.createStage({
          label,
          sortOrder: Number(form.sortOrder) || 0,
          active: form.active,
        });
        setMessage('Stage added.');
      }
      setDialog({ open: false, editing: null });
      await load();
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || 'Save failed.');
    }
  };

  const remove = async (row) => {
    if (!canUse || !window.confirm(`Remove stage “${row.label}”? It will no longer be selectable for new workflow steps.`))
      return;
    setError('');
    try {
      await apiService.procurement.deleteStage(row.id);
      setMessage('Stage removed.');
      await load();
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || 'Remove failed.');
    }
  };

  const columns = [
    {
      field: 'sortOrder',
      headerName: 'Order',
      width: 90,
      type: 'number',
    },
    { field: 'label', headerName: 'Stage label', flex: 1, minWidth: 220 },
    {
      field: 'active',
      headerName: 'Active',
      width: 100,
      renderCell: (params) => (params.row.active ? 'Yes' : 'No'),
    },
    {
      field: 'actions',
      headerName: '',
      width: 108,
      sortable: false,
      renderCell: (params) => (
        <Stack direction="row" spacing={0}>
          <Tooltip title="Edit">
            <IconButton size="small" onClick={() => openEdit(params.row)} disabled={!canUse}>
              <EditIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Remove">
            <IconButton size="small" color="error" onClick={() => remove(params.row)} disabled={!canUse}>
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>
      ),
    },
  ];

  return (
    <Box sx={{ p: 2 }}>
      <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, mb: 2 }}>
        <Typography variant="h6" fontWeight={800}>
          Procurement stages
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Configure labels shown when recording procurement workflow steps on{' '}
          <Link to={ROUTES.PROCUREMENT}>Project Procurement</Link>. New installs are seeded with the former default
          stage list.
        </Typography>
      </Paper>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}
      {message && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setMessage('')}>
          {message}
        </Alert>
      )}

      <Paper variant="outlined" sx={{ borderRadius: 2, p: 2 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
          <Typography variant="subtitle1" fontWeight={700}>
            Stage catalog
          </Typography>
          <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate} disabled={!canUse}>
            Add stage
          </Button>
        </Stack>

        {loading ? (
          <Typography variant="body2">Loading…</Typography>
        ) : (
          <Box sx={{ height: 480, width: '100%' }}>
            <DataGrid
              rows={rows}
              columns={columns}
              getRowId={(r) => r.id}
              disableRowSelectionOnClick
              pageSizeOptions={[10, 25]}
              initialState={{ pagination: { paginationModel: { pageSize: 10 } } }}
            />
          </Box>
        )}
      </Paper>

      <Dialog open={dialog.open} onClose={() => setDialog({ open: false, editing: null })} fullWidth maxWidth="sm">
        <DialogTitle>{dialog.editing ? 'Edit stage' : 'New stage'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Label"
              required
              fullWidth
              value={form.label}
              onChange={(e) => setForm((p) => ({ ...p, label: e.target.value }))}
              helperText="Must match exactly when saving workflow steps (case-sensitive)."
            />
            <TextField
              label="Sort order"
              type="number"
              fullWidth
              value={form.sortOrder}
              onChange={(e) => setForm((p) => ({ ...p, sortOrder: e.target.value }))}
            />
            <FormControlLabel
              control={
                <Switch
                  checked={form.active}
                  onChange={(e) => setForm((p) => ({ ...p, active: e.target.checked }))}
                />
              }
              label="Active (selectable for new workflow steps)"
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialog({ open: false, editing: null })}>Cancel</Button>
          <Button variant="contained" onClick={save} disabled={!canUse}>
            Save
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
