import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  Paper,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import apiService from '../api';

const SUPPORT_TYPE_OPTIONS = ['Funding', 'Training', 'Technical support', 'In-kind support', 'Advisory'];

function emptyForm() {
  return {
    partnerName: '',
    supportTypes: [],
    supportTypesText: '',
    organizationType: '',
    contactPerson: '',
    email: '',
    phone: '',
    notes: '',
    isActive: true,
  };
}

export default function ProjectPartnersPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const activeCount = useMemo(() => rows.filter((r) => r.isActive).length, [rows]);

  const loadPartners = async () => {
    setLoading(true);
    setError('');
    try {
      const list = await apiService.partners.listPartners();
      setRows(Array.isArray(list) ? list : []);
    } catch (e) {
      setRows([]);
      setError(e?.response?.data?.message || e?.message || 'Failed to load partners.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPartners();
  }, []);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm());
    setOpen(true);
  };

  const openEdit = (row) => {
    setEditingId(row.partnerId);
    setForm({
      partnerName: row.partnerName || '',
      supportTypes: Array.isArray(row.supportTypes) ? row.supportTypes : [],
      supportTypesText: (Array.isArray(row.supportTypes) ? row.supportTypes : []).join(', '),
      organizationType: row.organizationType || '',
      contactPerson: row.contactPerson || '',
      email: row.email || '',
      phone: row.phone || '',
      notes: row.notes || '',
      isActive: row.isActive !== false,
    });
    setOpen(true);
  };

  const savePartner = async () => {
    if (!form.partnerName.trim()) {
      window.alert('Partner name is required.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        supportTypes: (form.supportTypesText || '')
          .split(',')
          .map((x) => x.trim())
          .filter(Boolean),
        partnerName: form.partnerName.trim(),
        organizationType: form.organizationType.trim() || null,
        contactPerson: form.contactPerson.trim() || null,
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        notes: form.notes.trim() || null,
      };
      if (editingId) {
        await apiService.partners.updatePartner(editingId, payload);
      } else {
        await apiService.partners.createPartner(payload);
      }
      setOpen(false);
      await loadPartners();
    } catch (e) {
      window.alert(e?.response?.data?.message || e?.message || 'Save failed.');
    } finally {
      setSaving(false);
    }
  };

  const removePartner = async (row) => {
    if (!window.confirm(`Delete partner "${row.partnerName}"?`)) return;
    try {
      await apiService.partners.deletePartner(row.partnerId);
      await loadPartners();
    } catch (e) {
      window.alert(e?.response?.data?.message || e?.message || 'Delete failed.');
    }
  };

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1200, mx: 'auto' }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }} flexWrap="wrap" gap={1}>
        <Box>
          <Typography variant="h4" component="h1" sx={{ fontWeight: 700 }}>
            Project partners
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Manage organizations supporting projects through funding, training, technical support, and other contributions.
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
          Add partner
        </Button>
      </Stack>

      <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
        <Chip label={`Total: ${rows.length}`} />
        <Chip color="success" variant="outlined" label={`Active: ${activeCount}`} />
      </Stack>

      {error ? (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      ) : null}

      <Paper variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Partner</TableCell>
              <TableCell>Support types</TableCell>
              <TableCell>Contact</TableCell>
              <TableCell>Status</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.partnerId}>
                <TableCell>
                  <Typography variant="body2" fontWeight={600}>
                    {r.partnerName}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {r.organizationType || '—'}
                  </Typography>
                </TableCell>
                <TableCell>{(Array.isArray(r.supportTypes) ? r.supportTypes : []).join(', ') || '—'}</TableCell>
                <TableCell>
                  {[r.contactPerson, r.email, r.phone].filter(Boolean).join(' | ') || '—'}
                </TableCell>
                <TableCell>{r.isActive ? 'Active' : 'Inactive'}</TableCell>
                <TableCell align="right">
                  <IconButton size="small" onClick={() => openEdit(r)} aria-label="Edit partner">
                    <EditOutlinedIcon fontSize="small" />
                  </IconButton>
                  <IconButton size="small" color="error" onClick={() => removePartner(r)} aria-label="Delete partner">
                    <DeleteOutlineIcon fontSize="small" />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
            {!loading && !rows.length ? (
              <TableRow>
                <TableCell colSpan={5} align="center">
                  <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
                    No partners found.
                  </Typography>
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </Paper>

      <Dialog open={open} onClose={() => !saving && setOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>{editingId ? 'Edit partner' : 'Add partner'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Partner name"
              value={form.partnerName}
              onChange={(e) => setForm((p) => ({ ...p, partnerName: e.target.value }))}
              required
              fullWidth
            />
            <TextField
              label="Support types (comma-separated)"
              value={form.supportTypesText}
              onChange={(e) => setForm((p) => ({ ...p, supportTypesText: e.target.value }))}
              helperText={`Examples: ${SUPPORT_TYPE_OPTIONS.join(', ')}`}
              fullWidth
            />
            <TextField label="Organization type" value={form.organizationType} onChange={(e) => setForm((p) => ({ ...p, organizationType: e.target.value }))} fullWidth />
            <TextField label="Contact person" value={form.contactPerson} onChange={(e) => setForm((p) => ({ ...p, contactPerson: e.target.value }))} fullWidth />
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
              <TextField label="Email" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} fullWidth />
              <TextField label="Phone" value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} fullWidth />
            </Stack>
            <TextField label="Notes" value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} fullWidth multiline minRows={3} />
            <FormControlLabel
              control={<Switch checked={form.isActive} onChange={(e) => setForm((p) => ({ ...p, isActive: e.target.checked }))} />}
              label="Active partner"
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)} disabled={saving}>
            Cancel
          </Button>
          <Button variant="contained" onClick={savePartner} disabled={saving}>
            {saving ? 'Saving…' : editingId ? 'Update' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
