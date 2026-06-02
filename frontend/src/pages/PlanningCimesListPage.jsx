import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
  FormControlLabel,
  IconButton,
  MenuItem,
  Paper,
  Snackbar,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { DataGrid } from '@mui/x-data-grid';
import {
  Add as AddIcon,
  AccountBalanceWallet as AccountBalanceWalletIcon,
  FileDownload as FileDownloadIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  Event as EventIcon,
  Layers as LayersIcon,
  PictureAsPdf as PictureAsPdfIcon,
  PlaylistAddCheck as PlaylistAddCheckIcon,
  Search as SearchIcon,
} from '@mui/icons-material';
import { Link as RouterLink } from 'react-router-dom';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import axiosInstance from '../api/axiosInstance';
import planningService from '../api/planningService';
import { ROUTES } from '../configs/appConfig';
import Header from './dashboard/Header';

const emptyForms = {
  cidp: { periodName: '', startDate: '', endDate: '', active: true },
  adp: { cidpPeriodId: '', cidpPeriod: '', periodName: '', startDate: '', endDate: '', active: true },
  programmes: {
    cidpPeriod: '',
    pillarName: '',
    objectiveName: '',
    sectorCode: '',
    sectorName: '',
    programmeName: '',
    programmeDescription: '',
    sdgCode: '',
    sdgName: '',
    programmePeriod: '',
    active: true,
  },
  sectors: { sectorCode: '', sectorName: '', sectorDescription: '' },
  budgetAllocation: {},
};

const config = {
  cidp: {
    title: 'CIDP Period List',
    subtitle: 'County Integrated Development Plan planning periods',
    addLabel: 'Add CIDP Period',
    icon: EventIcon,
    getRows: planningService.getCidpPeriods,
    create: planningService.createCidpPeriod,
    update: planningService.updateCidpPeriod,
    remove: planningService.deleteCidpPeriod,
  },
  adp: {
    title: 'ADP Period List',
    subtitle: 'Annual Development Plan periods linked to CIDP periods',
    addLabel: 'Add ADP Period',
    icon: EventIcon,
    getRows: planningService.getAdpPeriods,
    create: planningService.createAdpPeriod,
    update: planningService.updateAdpPeriod,
    remove: planningService.deleteAdpPeriod,
  },
  programmes: {
    title: 'Programme List',
    subtitle: 'CIDP-aligned programmes, sectors, objectives, and SDGs',
    addLabel: 'Add Programme',
    icon: PlaylistAddCheckIcon,
    getRows: planningService.getProgrammes,
    create: planningService.createProgramme,
    update: planningService.updateProgramme,
    remove: planningService.deleteProgramme,
  },
  sectors: {
    title: 'Sector List',
    subtitle: 'Planning sectors with project status counts',
    addLabel: 'Add Sector',
    icon: LayersIcon,
    getRows: planningService.getPlanningSectors,
    create: async (payload) => axiosInstance.post('/sectors', {
      sectorName: payload.sectorName,
      alias: payload.sectorCode,
      description: payload.sectorDescription,
    }),
    update: async (id, payload) => axiosInstance.put(`/sectors/${id}`, {
      sectorName: payload.sectorName,
      alias: payload.sectorCode,
      description: payload.sectorDescription,
    }),
    remove: async (id) => axiosInstance.delete(`/sectors/${id}`),
  },
  budgetAllocation: {
    title: 'Budget Allocation List',
    subtitle: 'Planning-facing project budget allocation register',
    addLabel: 'Add Budget Allocation',
    icon: AccountBalanceWalletIcon,
    getRows: planningService.getBudgetAllocations,
    externalAddRoute: ROUTES.BUDGET_MANAGEMENT,
  },
};

function toDateInput(value) {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

function formatDate(value) {
  if (!value) return 'N/A';
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? String(value)
    : d.toLocaleDateString('en-KE', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatCurrency(value) {
  const amount = Number(value || 0);
  return amount.toLocaleString('en-KE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function normalizeRowForForm(variant, row) {
  if (variant === 'cidp') {
    return {
      periodName: row.periodName || '',
      startDate: toDateInput(row.startDate),
      endDate: toDateInput(row.endDate),
      active: row.active !== false,
    };
  }
  if (variant === 'adp') {
    return {
      cidpPeriodId: row.cidpPeriodId || '',
      cidpPeriod: row.cidpPeriod || '',
      periodName: row.periodName || '',
      startDate: toDateInput(row.startDate),
      endDate: toDateInput(row.endDate),
      active: row.active !== false,
    };
  }
  if (variant === 'sectors') {
    return {
      sectorCode: row.sectorCode || '',
      sectorName: row.sectorName || '',
      sectorDescription: row.sectorDescription || '',
    };
  }
  return {
    cidpPeriod: row.cidpPeriod || '',
    pillarName: row.pillarName || '',
    objectiveName: row.objectiveName || '',
    sectorCode: row.sectorCode || '',
    sectorName: row.sectorName || '',
    programmeName: row.programmeName || '',
    programmeDescription: row.programmeDescription || '',
    sdgCode: row.sdgCode || '',
    sdgName: row.sdgName || '',
    programmePeriod: row.programmePeriod || '',
    active: row.active !== false,
  };
}

export default function PlanningCimesListPage({ variant }) {
  const cfg = config[variant] || config.cidp;
  const Icon = cfg.icon;
  const [rows, setRows] = useState([]);
  const [cidpPeriods, setCidpPeriods] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [currentRow, setCurrentRow] = useState(null);
  const [form, setForm] = useState(emptyForms[variant]);
  const [deleteRow, setDeleteRow] = useState(null);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
  const [allocationFilters, setAllocationFilters] = useState({ startDate: '', endDate: '', search: '' });

  const isReadonlySectorList = variant === 'sectors';
  const isBudgetAllocation = variant === 'budgetAllocation';
  const rowsWithIndex = useMemo(
    () => rows.map((row, index) => ({ ...row, rowNumber: index + 1 })),
    [rows]
  );
  const totalAllocated = useMemo(
    () => rows.reduce((sum, row) => sum + Number(row.allocatedAmount || 0), 0),
    [rows]
  );

  const loadRows = useCallback(async () => {
    setLoading(true);
    try {
      const params = isBudgetAllocation
        ? {
          startDate: allocationFilters.startDate || undefined,
          endDate: allocationFilters.endDate || undefined,
          search: allocationFilters.search || undefined,
        }
        : undefined;
      const data = await cfg.getRows(params);
      setRows(Array.isArray(data) ? data : []);
    } catch (error) {
      setSnackbar({
        open: true,
        severity: 'error',
        message: error?.response?.data?.message || `Failed to load ${cfg.title}`,
      });
    } finally {
      setLoading(false);
    }
  }, [allocationFilters, cfg, isBudgetAllocation]);

  useEffect(() => {
    loadRows();
    if (variant === 'adp' || variant === 'programmes') {
      planningService.getCidpPeriods().then((data) => setCidpPeriods(Array.isArray(data) ? data : [])).catch(() => {});
    }
  }, [variant, loadRows]);

  const setField = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const openCreate = () => {
    setCurrentRow(null);
    setForm(emptyForms[variant]);
    setDialogOpen(true);
  };

  const openEdit = (row) => {
    setCurrentRow(row);
    setForm(normalizeRowForForm(variant, row));
    setDialogOpen(true);
  };

  const save = async () => {
    try {
      if (variant === 'cidp' && !form.periodName.trim()) throw new Error('CIDP period is required');
      if (variant === 'adp' && !form.periodName.trim()) throw new Error('ADP period is required');
      if (variant === 'programmes' && !form.programmeName.trim()) throw new Error('Programme name is required');
      if (variant === 'sectors' && !form.sectorName.trim()) throw new Error('Sector name is required');

      if (currentRow) {
        await cfg.update(currentRow.id, form);
      } else {
        await cfg.create(form);
      }
      setDialogOpen(false);
      setSnackbar({ open: true, severity: 'success', message: `${cfg.title.replace(' List', '')} saved successfully` });
      loadRows();
    } catch (error) {
      setSnackbar({
        open: true,
        severity: 'error',
        message: error?.response?.data?.message || error.message || 'Save failed',
      });
    }
  };

  const confirmDelete = async () => {
    if (!deleteRow) return;
    try {
      await cfg.remove(deleteRow.id);
      setDeleteRow(null);
      setSnackbar({ open: true, severity: 'success', message: `${cfg.title.replace(' List', '')} deleted successfully` });
      loadRows();
    } catch (error) {
      setSnackbar({
        open: true,
        severity: 'error',
        message: error?.response?.data?.message || 'Delete failed',
      });
    }
  };

  const allocationExportRows = rowsWithIndex.map((row) => ({
    '#': row.rowNumber,
    'Project Code': row.projectCode || '',
    'Project Name': row.projectName || '',
    'Vote Code': row.voteCode || '',
    Sponsor: row.sponsor || '',
    Remarks: row.remarks || '',
    Status: row.status || '',
    'Approved by': row.approvedBy || '',
    'Approved At': row.approvedAt ? formatDate(row.approvedAt) : '',
    'Allocated Amount': formatCurrency(row.allocatedAmount),
  }));

  const exportBudgetCsv = () => {
    const headers = Object.keys(allocationExportRows[0] || {
      '#': '',
      'Project Code': '',
      'Project Name': '',
      'Vote Code': '',
      Sponsor: '',
      Remarks: '',
      Status: '',
      'Approved by': '',
      'Approved At': '',
      'Allocated Amount': '',
    });
    const escape = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const csv = [
      headers.join(','),
      ...allocationExportRows.map((row) => headers.map((header) => escape(row[header])).join(',')),
      ['', '', '', '', '', '', '', '', 'Totals:', escape(formatCurrency(totalAllocated))].join(','),
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'budget-allocation-list.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  const exportBudgetPdf = () => {
    const doc = new jsPDF({ orientation: 'landscape' });
    doc.setFontSize(14);
    doc.text('Budget Allocation List', 14, 14);
    autoTable(doc, {
      startY: 22,
      head: [[
        '#',
        'Project Code',
        'Project Name',
        'Vote Code',
        'Sponsor',
        'Remarks',
        'Status',
        'Approved by',
        'Approved At',
        'Allocated Amount',
      ]],
      body: allocationExportRows.map((row) => [
        row['#'],
        row['Project Code'],
        row['Project Name'],
        row['Vote Code'],
        row.Sponsor,
        row.Remarks,
        row.Status,
        row['Approved by'],
        row['Approved At'],
        row['Allocated Amount'],
      ]),
      foot: [['', '', '', '', '', '', '', '', 'Totals:', formatCurrency(totalAllocated)]],
      styles: { fontSize: 8 },
      headStyles: { fillColor: [10, 45, 104] },
    });
    doc.save('budget-allocation-list.pdf');
  };

  const actionColumn = {
    field: 'actions',
    headerName: 'Action',
    width: 120,
    sortable: false,
    filterable: false,
    renderCell: ({ row }) => (
      <Stack direction="row" spacing={0.5}>
        <Tooltip title="Edit">
          <IconButton size="small" onClick={() => openEdit(row)}>
            <EditIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Delete">
          <IconButton size="small" color="error" onClick={() => setDeleteRow(row)}>
            <DeleteIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Stack>
    ),
  };

  const columns = (() => {
    const activeColumn = {
      field: 'active',
      headerName: 'Active/Inactive',
      width: 140,
      renderCell: ({ value }) => (
        <Chip size="small" label={value === false || value === 0 ? 'Inactive' : 'Active'} color={value === false || value === 0 ? 'default' : 'success'} />
      ),
    };
    const indexColumn = {
      field: 'rowNumber',
      headerName: '#',
      width: 70,
      sortable: false,
    };

    if (variant === 'cidp') {
      return [
        indexColumn,
        { field: 'periodName', headerName: 'CIDP Period', flex: 1, minWidth: 220 },
        { field: 'startDate', headerName: 'Start Date', width: 150, valueFormatter: (value) => formatDate(value) },
        { field: 'endDate', headerName: 'End Date', width: 150, valueFormatter: (value) => formatDate(value) },
        activeColumn,
        actionColumn,
      ];
    }
    if (variant === 'adp') {
      return [
        indexColumn,
        { field: 'cidpPeriod', headerName: 'CIDP Period', flex: 1, minWidth: 200 },
        { field: 'periodName', headerName: 'ADP Period', flex: 1, minWidth: 200 },
        { field: 'startDate', headerName: 'Start Date', width: 150, valueFormatter: (value) => formatDate(value) },
        { field: 'endDate', headerName: 'End Date', width: 150, valueFormatter: (value) => formatDate(value) },
        activeColumn,
        actionColumn,
      ];
    }
    if (variant === 'sectors') {
      return [
        indexColumn,
        { field: 'sectorCode', headerName: 'Sector Code', width: 130 },
        { field: 'sectorName', headerName: 'Sector Name', flex: 1, minWidth: 260 },
        { field: 'sectorDescription', headerName: 'Sector Description', flex: 1, minWidth: 260 },
        { field: 'planningCount', headerName: 'Planning', width: 110, type: 'number' },
        { field: 'ongoingCount', headerName: 'Ongoing', width: 110, type: 'number' },
        { field: 'stalledCount', headerName: 'Stalled', width: 110, type: 'number' },
        { field: 'terminatedCount', headerName: 'Terminated', width: 130, type: 'number' },
        { field: 'closedCount', headerName: 'Closed', width: 110, type: 'number' },
        { field: 'projectCount', headerName: 'Project Count', width: 130, type: 'number' },
        activeColumn,
        actionColumn,
      ];
    }
    if (variant === 'budgetAllocation') {
      return [
        indexColumn,
        { field: 'projectCode', headerName: 'Project Code', width: 140 },
        { field: 'projectName', headerName: 'Project Name', flex: 1, minWidth: 240 },
        { field: 'voteCode', headerName: 'Vote Code', width: 130 },
        { field: 'sponsor', headerName: 'Select Sponsor', width: 190 },
        { field: 'remarks', headerName: 'Remarks', flex: 1, minWidth: 260 },
        {
          field: 'status',
          headerName: 'Status',
          width: 140,
          renderCell: ({ value }) => (
            <Chip
              size="small"
              label={value || 'DRAFT'}
              color={String(value || '').toUpperCase() === 'APPROVED' ? 'success' : 'warning'}
            />
          ),
        },
        { field: 'approvedBy', headerName: 'Approved by', width: 180 },
        { field: 'approvedAt', headerName: 'Approved At', width: 150, valueFormatter: (value) => (value ? formatDate(value) : 'N/A') },
        {
          field: 'allocatedAmount',
          headerName: 'Allocated Amount',
          width: 170,
          type: 'number',
          valueFormatter: (value) => formatCurrency(value),
        },
      ];
    }
    return [
      indexColumn,
      { field: 'cidpPeriod', headerName: 'CIDP Period', width: 180 },
      { field: 'pillarName', headerName: 'CIDP Pillar Name', width: 220 },
      { field: 'objectiveName', headerName: 'CIDP Objective Name', width: 280 },
      { field: 'sectorCode', headerName: 'Sector Code', width: 130 },
      { field: 'sectorName', headerName: 'Sector Name', width: 240 },
      { field: 'programmeName', headerName: 'Programme Name', width: 280 },
      { field: 'programmeDescription', headerName: 'Programme Description', width: 280 },
      { field: 'sdgCode', headerName: 'SDG Code', width: 120 },
      { field: 'sdgName', headerName: 'SDG Name', width: 220 },
      { field: 'programmePeriod', headerName: 'Programme Period', width: 190 },
      activeColumn,
      actionColumn,
    ];
  })();

  const renderPeriodFields = (isAdp = false) => (
    <>
      {isAdp && (
        <TextField
          select
          fullWidth
          label="CIDP Period"
          value={form.cidpPeriodId || ''}
          onChange={(event) => {
            const selected = cidpPeriods.find((period) => String(period.id) === String(event.target.value));
            setForm((prev) => ({
              ...prev,
              cidpPeriodId: event.target.value,
              cidpPeriod: selected?.periodName || '',
            }));
          }}
        >
          <MenuItem value="">Select CIDP Period</MenuItem>
          {cidpPeriods.map((period) => (
            <MenuItem key={period.id} value={period.id}>{period.periodName}</MenuItem>
          ))}
        </TextField>
      )}
      <TextField
        fullWidth
        required
        label={isAdp ? 'ADP Period' : 'CIDP Period'}
        value={form.periodName || ''}
        onChange={(event) => setField('periodName', event.target.value)}
      />
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        <TextField
          fullWidth
          type="date"
          label="Start Date"
          InputLabelProps={{ shrink: true }}
          value={form.startDate || ''}
          onChange={(event) => setField('startDate', event.target.value)}
        />
        <TextField
          fullWidth
          type="date"
          label="End Date"
          InputLabelProps={{ shrink: true }}
          value={form.endDate || ''}
          onChange={(event) => setField('endDate', event.target.value)}
        />
      </Stack>
      <FormControlLabel
        control={<Switch checked={form.active !== false} onChange={(event) => setField('active', event.target.checked)} />}
        label="Active"
      />
    </>
  );

  const renderProgrammeFields = () => (
    <>
      <TextField select fullWidth label="CIDP Period" value={form.cidpPeriod || ''} onChange={(event) => setField('cidpPeriod', event.target.value)}>
        <MenuItem value="">Select CIDP Period</MenuItem>
        {cidpPeriods.map((period) => (
          <MenuItem key={period.id} value={period.periodName}>{period.periodName}</MenuItem>
        ))}
      </TextField>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
        <TextField fullWidth label="CIDP Pillar Name" value={form.pillarName || ''} onChange={(event) => setField('pillarName', event.target.value)} />
        <TextField fullWidth label="CIDP Objective Name" value={form.objectiveName || ''} onChange={(event) => setField('objectiveName', event.target.value)} />
      </Stack>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
        <TextField fullWidth label="Sector Code" value={form.sectorCode || ''} onChange={(event) => setField('sectorCode', event.target.value)} />
        <TextField fullWidth label="Sector Name" value={form.sectorName || ''} onChange={(event) => setField('sectorName', event.target.value)} />
      </Stack>
      <TextField fullWidth required label="Programme Name" value={form.programmeName || ''} onChange={(event) => setField('programmeName', event.target.value)} />
      <TextField fullWidth multiline minRows={2} label="Programme Description" value={form.programmeDescription || ''} onChange={(event) => setField('programmeDescription', event.target.value)} />
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
        <TextField fullWidth label="SDG Code" value={form.sdgCode || ''} onChange={(event) => setField('sdgCode', event.target.value)} />
        <TextField fullWidth label="SDG Name" value={form.sdgName || ''} onChange={(event) => setField('sdgName', event.target.value)} />
      </Stack>
      <TextField fullWidth label="Programme Period" value={form.programmePeriod || ''} onChange={(event) => setField('programmePeriod', event.target.value)} />
      <FormControlLabel control={<Switch checked={form.active !== false} onChange={(event) => setField('active', event.target.checked)} />} label="Active" />
    </>
  );

  const renderSectorFields = () => (
    <>
      <TextField fullWidth label="Sector Code" value={form.sectorCode || ''} onChange={(event) => setField('sectorCode', event.target.value)} />
      <TextField fullWidth required label="Sector Name" value={form.sectorName || ''} onChange={(event) => setField('sectorName', event.target.value)} />
      <TextField fullWidth multiline minRows={3} label="Sector Description" value={form.sectorDescription || ''} onChange={(event) => setField('sectorDescription', event.target.value)} />
    </>
  );

  return (
    <Box m="20px">
      <Header title={cfg.title} subtitle={cfg.subtitle} />
      <Paper sx={{ p: 2, borderRadius: 2 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', md: 'center' }} spacing={2} mb={2}>
          <Stack direction="row" alignItems="center" spacing={1}>
            <Icon color="primary" />
            <Typography variant="h6" fontWeight={700}>{cfg.title}</Typography>
          </Stack>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
            {isBudgetAllocation && (
              <>
                <Button variant="outlined" startIcon={<PictureAsPdfIcon />} onClick={exportBudgetPdf}>
                  Export PDF
                </Button>
                <Button variant="outlined" startIcon={<FileDownloadIcon />} onClick={exportBudgetCsv}>
                  Export CSV
                </Button>
              </>
            )}
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={cfg.externalAddRoute ? undefined : openCreate}
              component={cfg.externalAddRoute ? RouterLink : 'button'}
              to={cfg.externalAddRoute || undefined}
            >
              {cfg.addLabel}
            </Button>
          </Stack>
        </Stack>

        {isBudgetAllocation && (
          <Stack spacing={2} mb={2}>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
              <TextField
                type="date"
                label="Start Date"
                InputLabelProps={{ shrink: true }}
                value={allocationFilters.startDate}
                onChange={(event) => setAllocationFilters((prev) => ({ ...prev, startDate: event.target.value }))}
                sx={{ minWidth: 180 }}
              />
              <TextField
                type="date"
                label="End Date"
                InputLabelProps={{ shrink: true }}
                value={allocationFilters.endDate}
                onChange={(event) => setAllocationFilters((prev) => ({ ...prev, endDate: event.target.value }))}
                sx={{ minWidth: 180 }}
              />
              <TextField
                label="Search"
                placeholder="Search project, code, vote, or sponsor"
                value={allocationFilters.search}
                onChange={(event) => setAllocationFilters((prev) => ({ ...prev, search: event.target.value }))}
                fullWidth
              />
              <Button variant="outlined" startIcon={<SearchIcon />} onClick={loadRows} sx={{ minWidth: 130 }}>
                Search
              </Button>
            </Stack>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ xs: 'stretch', sm: 'center' }}>
              <Chip label={`${rows.length} allocation${rows.length === 1 ? '' : 's'}`} />
              <Chip color="primary" label={`Total Allocated: KES ${formatCurrency(totalAllocated)}`} />
            </Stack>
          </Stack>
        )}

        {loading ? (
          <Stack alignItems="center" justifyContent="center" minHeight={360}>
            <CircularProgress />
          </Stack>
        ) : (
          <Box sx={{ height: variant === 'programmes' || variant === 'sectors' || variant === 'budgetAllocation' ? 640 : 520, width: '100%' }}>
            <DataGrid
              rows={rowsWithIndex}
              columns={columns}
              disableRowSelectionOnClick
              pageSizeOptions={[10, 25, 50, 100]}
              initialState={{ pagination: { paginationModel: { pageSize: 10 } } }}
              sx={{ '& .MuiDataGrid-columnHeaders': { fontWeight: 700 } }}
            />
          </Box>
        )}
      </Paper>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} fullWidth maxWidth={variant === 'programmes' ? 'md' : 'sm'}>
        <DialogTitle>{currentRow ? `Edit ${cfg.title.replace(' List', '')}` : cfg.addLabel}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {variant === 'cidp' && renderPeriodFields(false)}
            {variant === 'adp' && renderPeriodFields(true)}
            {variant === 'programmes' && renderProgrammeFields()}
            {isReadonlySectorList && renderSectorFields()}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={save}>Save</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(deleteRow)} onClose={() => setDeleteRow(null)} fullWidth maxWidth="xs">
        <DialogTitle>Delete Record</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete this record?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteRow(null)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={confirmDelete}>Delete</Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={snackbar.open} autoHideDuration={4000} onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}>
        <Alert severity={snackbar.severity} onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
