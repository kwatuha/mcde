import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Snackbar,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { Add as AddIcon, Delete as DeleteIcon, Edit as EditIcon } from '@mui/icons-material';
import { DataGrid } from '@mui/x-data-grid';
import apiService from '../api';

export default function ContractorTypesPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [openDialog, setOpenDialog] = useState(false);
  const [editingRow, setEditingRow] = useState(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiService.contractors.getContractorTypes();
      setRows(Array.isArray(data) ? data : []);
    } catch (error) {
      setSnackbar({ open: true, message: error?.response?.data?.message || 'Failed to load contractor types.', severity: 'error' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    setEditingRow(null);
    setName('');
    setDescription('');
    setOpenDialog(true);
  };

  const openEdit = (row) => {
    setEditingRow(row);
    setName(row.name || '');
    setDescription(row.description || '');
    setOpenDialog(true);
  };

  const submit = async () => {
    if (!name.trim()) {
      setSnackbar({ open: true, message: 'Type name is required.', severity: 'error' });
      return;
    }
    try {
      if (editingRow?.contractorTypeId) {
        await apiService.contractors.updateContractorType(editingRow.contractorTypeId, { name: name.trim(), description });
      } else {
        await apiService.contractors.createContractorType({ name: name.trim(), description });
      }
      setOpenDialog(false);
      await load();
      setSnackbar({ open: true, message: 'Contractor type saved.', severity: 'success' });
    } catch (error) {
      setSnackbar({ open: true, message: error?.response?.data?.message || 'Failed to save contractor type.', severity: 'error' });
    }
  };

  const remove = async (row) => {
    try {
      await apiService.contractors.deleteContractorType(row.contractorTypeId);
      await load();
      setSnackbar({ open: true, message: 'Contractor type deleted.', severity: 'success' });
    } catch (error) {
      setSnackbar({ open: true, message: error?.response?.data?.message || 'Failed to delete contractor type.', severity: 'error' });
    }
  };

  const columns = [
    { field: 'contractorTypeId', headerName: 'ID', minWidth: 90, flex: 0.4 },
    { field: 'name', headerName: 'Type Name', minWidth: 220, flex: 1 },
    { field: 'description', headerName: 'Description', minWidth: 280, flex: 1.4 },
    {
      field: 'actions',
      headerName: 'Actions',
      minWidth: 140,
      sortable: false,
      filterable: false,
      renderCell: (params) => (
        <Stack direction="row" spacing={1}>
          <Tooltip title="Edit">
            <IconButton size="small" color="primary" onClick={() => openEdit(params.row)}>
              <EditIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Delete">
            <IconButton size="small" color="error" onClick={() => remove(params.row)}>
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>
      ),
    },
  ];

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h4">Contractor Types</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
          Add Type
        </Button>
      </Box>

      <Alert severity="info" sx={{ mb: 2 }}>
        Define categories used when registering contractors.
      </Alert>

      <Box sx={{ height: '70vh' }}>
        <DataGrid rows={rows} columns={columns} loading={loading} getRowId={(row) => row.contractorTypeId} />
      </Box>

      <Dialog open={openDialog} onClose={() => setOpenDialog(false)} fullWidth maxWidth="sm">
        <DialogTitle>{editingRow ? 'Edit Contractor Type' : 'Add Contractor Type'}</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            fullWidth
            label="Type Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <TextField
            margin="dense"
            fullWidth
            multiline
            minRows={3}
            label="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenDialog(false)} variant="outlined">Cancel</Button>
          <Button onClick={submit} variant="contained">Save</Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={snackbar.open} autoHideDuration={5000} onClose={() => setSnackbar((s) => ({ ...s, open: false }))}>
        <Alert severity={snackbar.severity} sx={{ width: '100%' }}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
