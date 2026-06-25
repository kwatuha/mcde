// src/pages/RawDataPage.jsx — County Beneficiary Registry
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Typography,
  Box,
  CircularProgress,
  Alert,
  Button,
  Stack,
  useTheme,
  Tooltip,
  Chip,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  Paper,
} from '@mui/material';
import { DataGrid, GridToolbar } from '@mui/x-data-grid';
import { getThemedDataGridSx } from '../utils/dataGridTheme';
import { useNavigationLayout } from '../context/NavigationLayoutContext.jsx';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import apiService from '../api';
import Header from "./dashboard/Header";
import { tokens } from "./dashboard/theme";
import BeneficiaryFormDialog from '../components/BeneficiaryFormDialog';
import {
  exportBeneficiaryRegistryExcel,
  exportBeneficiaryRegistryPdf,
} from '../utils/beneficiaryRegistryExport';

function normalizeBeneficiaryFilters(filters) {
  const apiFilters = { ...filters };
  if (apiFilters.beneficiaryType === 'All') delete apiFilters.beneficiaryType;
  if (apiFilters.county === 'All') delete apiFilters.county;
  if (apiFilters.subCounty === 'All') delete apiFilters.subCounty;
  if (apiFilters.ward === 'All') delete apiFilters.ward;
  if (!apiFilters.search) delete apiFilters.search;
  if (!apiFilters.rriProgrammeId) delete apiFilters.rriProgrammeId;
  if (!apiFilters.projectId) delete apiFilters.projectId;
  return apiFilters;
}

function RawDataPage() {
  const [searchParams] = useSearchParams();
  const theme = useTheme();
  const { isTreeLayout } = useNavigationLayout();
  const isTreeGrid = isTreeLayout && theme.palette.mode === 'light';
  const colors = tokens(theme.palette.mode);
  const isLight = theme.palette.mode === 'light';
  
  const [participants, setParticipants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [totalRows, setTotalRows] = useState(0);
  const [typeOptions, setTypeOptions] = useState([]);
  const [filterOptions, setFilterOptions] = useState({
    counties: [], subCounties: [], wards: [], genders: [], sectors: [],
  });
  const [exportError, setExportError] = useState('');

  const [paginationModel, setPaginationModel] = useState({ page: 0, pageSize: 25 });
  const [sortModel, setSortModel] = useState([{ field: 'beneficiaryId', sort: 'asc' }]);
  const [columnVisibilityModel, setColumnVisibilityModel] = useState(() => {
    try {
      const saved = localStorage.getItem('beneficiaryRegistryColumnVisibility');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const [filters, setFilters] = useState({
    beneficiaryType: 'All',
    county: 'All',
    subCounty: 'All',
    ward: 'All',
    search: '',
    rriProgrammeId: searchParams.get('rriProgrammeId') || '',
    projectId: searchParams.get('projectId') || '',
  });
  const [appliedFilters, setAppliedFilters] = useState({
    beneficiaryType: 'All',
    county: 'All',
    subCounty: 'All',
    ward: 'All',
    rriProgrammeId: searchParams.get('rriProgrammeId') || '',
    projectId: searchParams.get('projectId') || '',
    search: '',
  });

  // Export loading states
  const [exportingExcel, setExportingExcel] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editingBeneficiary, setEditingBeneficiary] = useState(null);

  // Define columns for DataGrid
  const renderHeader = (label) => (
    <Tooltip title={label} arrow>
      <span className="dg--headerTitle">{label}</span>
    </Tooltip>
  );

  const columns = [
    { field: 'registryCode', headerName: 'Registry code', renderHeader: () => renderHeader('Registry code'), flex: 1, minWidth: 120 },
    {
      field: 'beneficiaryType',
      headerName: 'Type',
      renderHeader: () => renderHeader('Type'),
      width: 110,
      renderCell: (params) => (
        <Chip size="small" label={params.row.beneficiaryTypeLabel || params.value || '—'} variant="outlined" />
      ),
    },
    { field: 'displayName', headerName: 'Name', renderHeader: () => renderHeader('Name'), flex: 1.2, minWidth: 180 },
    { field: 'gender', headerName: 'Gender', renderHeader: () => renderHeader('Gender'), width: 90 },
    { field: 'age', headerName: 'Age', renderHeader: () => renderHeader('Age'), type: 'number', width: 70 },
    { field: 'groupType', headerName: 'Group type', renderHeader: () => renderHeader('Group type'), flex: 1, minWidth: 120 },
    { field: 'memberCount', headerName: 'Members', renderHeader: () => renderHeader('Members'), type: 'number', width: 90 },
    { field: 'subCounty', headerName: 'Sub-County', renderHeader: () => renderHeader('Sub-County'), flex: 1, minWidth: 120 },
    { field: 'ward', headerName: 'Ward', renderHeader: () => renderHeader('Ward'), flex: 1, minWidth: 120 },
    { field: 'phone', headerName: 'Phone', renderHeader: () => renderHeader('Phone'), flex: 1, minWidth: 110 },
    { field: 'projectId', headerName: 'Project ID', renderHeader: () => renderHeader('Project ID'), width: 100 },
    { field: 'rriProgrammeId', headerName: 'RRI Programme', renderHeader: () => renderHeader('RRI Programme'), width: 120 },
    { field: 'sector', headerName: 'Sector', renderHeader: () => renderHeader('Sector'), flex: 1, minWidth: 120 },
    { field: 'notes', headerName: 'Notes', renderHeader: () => renderHeader('Notes'), flex: 1, minWidth: 140 },
    {
      field: 'actions',
      headerName: 'Actions',
      width: 90,
      sortable: false,
      filterable: false,
      renderCell: (params) => (
        <Button
          size="small"
          startIcon={<EditIcon fontSize="small" />}
          onClick={() => {
            setEditingBeneficiary(params.row);
            setFormOpen(true);
          }}
        >
          Edit
        </Button>
      ),
    },
  ];

  const fetchRawData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const apiFilters = normalizeBeneficiaryFilters(appliedFilters);
      const response = await apiService.beneficiaries.list(
        apiFilters,
        paginationModel.page + 1,
        paginationModel.pageSize,
        sortModel[0]?.field,
        sortModel[0]?.sort?.toUpperCase()
      );
      setParticipants(response.data || []);
      setTotalRows(response.totalCount || 0);
    } catch (err) {
      setError('Failed to load beneficiary registry. Please try again later.');
      console.error('Failed to fetch beneficiaries:', err);
    } finally {
      setLoading(false);
    }
  }, [appliedFilters, paginationModel, sortModel]);

  useEffect(() => {
    apiService.beneficiaries.getTypes().then((data) => {
      setTypeOptions(data?.types || []);
    }).catch(() => setTypeOptions([]));
    apiService.beneficiaries.getFilterOptions().then((data) => {
      setFilterOptions({
        counties: data?.counties || [],
        subCounties: data?.subCounties || [],
        wards: data?.wards || [],
        genders: data?.genders || [],
        sectors: data?.sectors || [],
      });
    }).catch(() => setFilterOptions({
      counties: [], subCounties: [], wards: [], genders: [], sectors: [],
    }));
  }, []);

  useEffect(() => {
    fetchRawData();
  }, [fetchRawData]);

  const handleApplyFilters = () => {
    setAppliedFilters({ ...filters });
    setPaginationModel((prev) => ({ ...prev, page: 0 }));
  };

  const fetchAllForExport = useCallback(async () => {
    const apiFilters = normalizeBeneficiaryFilters(appliedFilters);
    const pageSize = Math.min(Math.max(totalRows || paginationModel.pageSize, 1), 100000);
    const response = await apiService.beneficiaries.list(
      apiFilters,
      1,
      pageSize,
      sortModel[0]?.field,
      sortModel[0]?.sort?.toUpperCase()
    );
    return response.data || [];
  }, [appliedFilters, totalRows, paginationModel.pageSize, sortModel]);

  const exportSummaryRows = useMemo(() => [
    { label: 'Records exported', value: totalRows },
    { label: 'Beneficiary type', value: appliedFilters.beneficiaryType === 'All' ? 'All types' : appliedFilters.beneficiaryType },
    { label: 'Sub-County', value: appliedFilters.subCounty === 'All' ? 'All' : appliedFilters.subCounty },
    { label: 'Ward', value: appliedFilters.ward === 'All' ? 'All' : appliedFilters.ward },
  ], [totalRows, appliedFilters]);

  const handleExportExcel = async () => {
    setExportingExcel(true);
    setExportError('');
    try {
      const rows = await fetchAllForExport();
      exportBeneficiaryRegistryExcel({ rows, summaryRows: exportSummaryRows });
    } catch (err) {
      console.error('Error exporting to Excel:', err);
      setExportError(err?.response?.data?.message || err?.message || 'Failed to export beneficiaries to Excel.');
    } finally {
      setExportingExcel(false);
    }
  };

  const handleExportPdf = async () => {
    setExportingPdf(true);
    setExportError('');
    try {
      const rows = await fetchAllForExport();
      await exportBeneficiaryRegistryPdf({
        rows,
        summaryRows: exportSummaryRows,
        subtitle: appliedFilters.search ? `Search: ${appliedFilters.search}` : '',
      });
    } catch (err) {
      console.error('Error exporting to PDF:', err);
      setExportError(err?.message || 'Failed to export beneficiaries to PDF.');
    } finally {
      setExportingPdf(false);
    }
  };

  return (
    <Box m="20px">
      <Header
        title="Beneficiary Registry"
        subtitle="Individuals, groups, households, and institutions linked to county programmes and projects"
      />

      <Paper sx={{ p: 2, mb: 2 }}>
        <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel>Type</InputLabel>
            <Select
              label="Type"
              value={filters.beneficiaryType}
              onChange={(e) => setFilters((p) => ({ ...p, beneficiaryType: e.target.value }))}
            >
              <MenuItem value="All">All types</MenuItem>
              {typeOptions.map((t) => (
                <MenuItem key={t.typeCode} value={t.typeCode}>{t.label}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel>Sub-County</InputLabel>
            <Select
              label="Sub-County"
              value={filters.subCounty}
              onChange={(e) => setFilters((p) => ({ ...p, subCounty: e.target.value }))}
            >
              <MenuItem value="All">All sub-counties</MenuItem>
              {filterOptions.subCounties.map((c) => (
                <MenuItem key={c} value={c}>{c}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel>Ward</InputLabel>
            <Select
              label="Ward"
              value={filters.ward}
              onChange={(e) => setFilters((p) => ({ ...p, ward: e.target.value }))}
            >
              <MenuItem value="All">All wards</MenuItem>
              {filterOptions.wards.map((w) => (
                <MenuItem key={w} value={w}>{w}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField
            size="small"
            label="Search name / code / phone"
            value={filters.search}
            onChange={(e) => setFilters((p) => ({ ...p, search: e.target.value }))}
            sx={{ minWidth: 240 }}
          />
          <TextField
            size="small"
            label="Project ID"
            value={filters.projectId}
            onChange={(e) => setFilters((p) => ({ ...p, projectId: e.target.value }))}
            sx={{ minWidth: 140 }}
          />
          <TextField
            size="small"
            label="RRI Programme ID"
            value={filters.rriProgrammeId}
            onChange={(e) => setFilters((p) => ({ ...p, rriProgrammeId: e.target.value }))}
            sx={{ minWidth: 180 }}
          />
          <Button variant="contained" onClick={handleApplyFilters}>Apply</Button>
        </Stack>
      </Paper>

      {exportError && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setExportError('')}>{exportError}</Alert>}

      <Stack direction="row" spacing={2} sx={{ my: 2, justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => {
            setEditingBeneficiary(null);
            setFormOpen(true);
          }}
        >
          Add beneficiary
        </Button>
        <Stack direction="row" spacing={2}>
        <Button
          variant="contained"
          onClick={handleExportExcel}
          disabled={loading || participants.length === 0 || exportingExcel}
          startIcon={exportingExcel ? <CircularProgress size={20} color="inherit" /> : <FileDownloadIcon />}
          sx={{
            backgroundColor: isLight ? colors.blueAccent[600] : colors.blueAccent[700],
            color: '#fff',
            '&:hover': { backgroundColor: isLight ? colors.blueAccent[700] : colors.blueAccent[600] },
            fontWeight: 'bold',
            borderRadius: '8px',
            px: 3,
            py: 1.5,
            boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
          }}
        >
          {exportingExcel ? 'Exporting...' : 'Export to Excel'}
        </Button>
        <Button
          variant="contained"
          onClick={handleExportPdf}
          disabled={loading || participants.length === 0 || exportingPdf}
          startIcon={exportingPdf ? <CircularProgress size={20} color="inherit" /> : <PictureAsPdfIcon />}
          sx={{
            backgroundColor: colors.greenAccent[600],
            color: 'white',
            '&:hover': {
              backgroundColor: colors.greenAccent[700],
            },
            fontWeight: 'bold',
            borderRadius: '8px',
            px: 3,
            py: 1.5,
            boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
          }}
        >
          {exportingPdf ? 'Generating PDF...' : 'Export to PDF'}
        </Button>
        </Stack>
      </Stack>

      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '400px', mt: 2 }}>
          <CircularProgress />
          <Typography sx={{ ml: 2 }}>Loading beneficiary registry...</Typography>
        </Box>
      )}

      {error && (
        <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>
      )}

      {!loading && !error && participants.length === 0 && (
        <Alert severity="info" sx={{ mt: 2 }}>
          No beneficiaries found. Import records from Data → Import Data (Beneficiaries) using the county template.
        </Alert>
      )}

      {!loading && !error && participants.length > 0 && (
        <Box
          m="40px 0 0 0"
          height="75vh"
          width="100%"
          sx={{
            overflow: 'hidden',
            ...getThemedDataGridSx(theme, colors, {
              _isTreeLayout: isTreeGrid,
              ...(!isTreeGrid
                ? {
                    '& .MuiDataGrid-columnHeader': {
                      '&:hover': {
                        backgroundColor: `${isLight ? colors.blueAccent[200] : colors.blueAccent[600]} !important`,
                      },
                    },
                  }
                : {}),
            }),
          }}
        >
          <DataGrid
            rows={participants}
            columns={columns}
            rowCount={totalRows}
            loading={loading}
            pageSizeOptions={[10, 25, 50, 100]}
            paginationModel={paginationModel}
            onPaginationModelChange={setPaginationModel}
            paginationMode="server"
            sortingMode="server"
            onSortModelChange={setSortModel}
            sortModel={sortModel}
            getRowId={(row) => row.beneficiaryId || row.individualId}
            disableRowSelectionOnClick
            density="compact"
            columnHeaderHeight={48}
            pagination
            initialState={{
              pinnedColumns: { left: ['registryCode', 'displayName'] },
            }}
            columnVisibilityModel={columnVisibilityModel}
            onColumnVisibilityModelChange={(model) => {
              setColumnVisibilityModel(model);
              try { localStorage.setItem('beneficiaryRegistryColumnVisibility', JSON.stringify(model)); } catch {}
            }}
            slots={{ toolbar: GridToolbar }}
            slotProps={{ toolbar: { showQuickFilter: true, quickFilterProps: { debounceMs: 300 } } }}
            sx={{
              '& .dg--mono': { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace' },
              '& .MuiDataGrid-toolbarContainer': {
                p: 1,
                borderBottom: `1px solid ${isLight ? '#e0e7ff' : 'transparent'}`,
                backgroundColor: `${isLight ? colors.blueAccent[100] : 'transparent'}`,
                '& .MuiButton-root': {
                  color: isLight ? colors.blueAccent[900] : '#fff',
                  borderColor: isLight ? colors.blueAccent[300] : colors.grey[300],
                },
                '& .MuiInputBase-root': {
                  backgroundColor: isLight ? '#fff' : 'transparent',
                }
              },
              // Prevent header icons from overlapping text by reserving space
              '& .MuiDataGrid-columnHeaderTitleContainer': {
                paddingRight: '40px',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                alignItems: 'center',
              },
              // Anchor header so we can place sort icon without covering text
              '& .MuiDataGrid-columnHeader': {
                position: 'relative',
              },
              // Show column menu/sort icons on hover, but keep space reserved
              '& .MuiDataGrid-iconButtonContainer, & .MuiDataGrid-menuIcon': {
                position: 'absolute',
                right: 6,
                top: '50%',
                transform: 'translateY(-50%)',
                visibility: 'hidden',
                opacity: 0.9,
                color: '#ffffff',
              },
              '& .MuiDataGrid-columnHeader:hover .MuiDataGrid-iconButtonContainer, & .MuiDataGrid-columnHeader:hover .MuiDataGrid-menuIcon': {
                visibility: 'visible',
                opacity: 1,
              },
              '& .MuiDataGrid-sortIcon': {
                position: 'absolute',
                right: 28,
                top: '50%',
                transform: 'translateY(-50%)',
                opacity: 1,
                color: '#ffffff',
                pointerEvents: 'none',
                zIndex: 1,
              },
              '& .MuiDataGrid-columnHeader.MuiDataGrid-columnHeader--sorted .MuiDataGrid-sortIcon': {
                visibility: 'visible',
                opacity: 1,
              },
              '& .MuiDataGrid-columnHeader .MuiSvgIcon-root': {
                color: '#ffffff',
              },
              // Selection and focus aesthetics
              '& .MuiDataGrid-row.Mui-selected': {
                backgroundColor: `${isLight ? '#eef4ff' : '#0f172a'} !important`,
              },
              '& .MuiDataGrid-cell:focus, & .MuiDataGrid-cell:focus-within, & .MuiDataGrid-columnHeader:focus, & .MuiDataGrid-columnHeader:focus-within': {
                outline: 'none',
              },
              // Subtle scrollbar
              '& .MuiDataGrid-virtualScroller::-webkit-scrollbar': { height: 10, width: 10 },
              '& .MuiDataGrid-virtualScroller::-webkit-scrollbar-thumb': { backgroundColor: isLight ? '#c7d2fe' : '#334155', borderRadius: 8 },
              '& .MuiDataGrid-virtualScroller::-webkit-scrollbar-track': { backgroundColor: 'transparent' }
            }}
          />
        </Box>
      )}

      <BeneficiaryFormDialog
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditingBeneficiary(null);
        }}
        beneficiary={editingBeneficiary}
        onSaved={fetchRawData}
      />
    </Box>
  );
}

export default RawDataPage;