// src/pages/RawDataPage.jsx
import React, { useState, useEffect, useCallback } from 'react';
import {
  Typography,
  Box,
  CircularProgress,
  Alert,
  Button,
  Stack,
  useTheme,
  Tooltip,
} from '@mui/material';
import { DataGrid, GridToolbar } from '@mui/x-data-grid';
import { getThemedDataGridSx } from '../utils/dataGridTheme';
import { useNavigationLayout } from '../context/NavigationLayoutContext.jsx';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import apiService from '../api';
import FilterPanel from '../components/FilterPanel';
import Header from "./dashboard/Header";
import { tokens } from "./dashboard/theme";

function RawDataPage() {
  const theme = useTheme();
  const { isTreeLayout } = useNavigationLayout();
  const isTreeGrid = isTreeLayout && theme.palette.mode === 'light';
  const colors = tokens(theme.palette.mode);
  const isLight = theme.palette.mode === 'light';
  
  const [participants, setParticipants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [totalRows, setTotalRows] = useState(0);

  // Pagination states
  const [paginationModel, setPaginationModel] = useState({
    page: 0,
    pageSize: 25,
  });
  
  // Sorting states
  const [sortModel, setSortModel] = useState([
    { field: 'individualId', sort: 'asc' },
  ]);

  // Column visibility (persist across sessions)
  const [columnVisibilityModel, setColumnVisibilityModel] = useState(() => {
    try {
      const saved = localStorage.getItem('rawDataColumnVisibility');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  // Filter state
  const [filters, setFilters] = useState({});

  // Export loading states
  const [exportingExcel, setExportingExcel] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);

  // Define columns for DataGrid
  const renderHeader = (label) => (
    <Tooltip title={label} arrow>
      <span className="dg--headerTitle">{label}</span>
    </Tooltip>
  );

  const columns = [
    { field: 'individualId', headerName: 'Individual ID', renderHeader: () => renderHeader('Individual ID'), flex: 1, minWidth: 120, headerClassName: 'dg--mono', cellClassName: 'dg--mono' },
    { field: 'householdId', headerName: 'Household ID', renderHeader: () => renderHeader('Household ID'), flex: 1, minWidth: 120, headerClassName: 'dg--mono', cellClassName: 'dg--mono' },
    { field: 'gpsLatitudeIndividual', headerName: 'Latitude', renderHeader: () => renderHeader('Latitude'), flex: 1, minWidth: 100, type: 'number', align: 'right', headerAlign: 'right' },
    { field: 'gpsLongitudeIndividual', headerName: 'Longitude', renderHeader: () => renderHeader('Longitude'), flex: 1, minWidth: 100, type: 'number', align: 'right', headerAlign: 'right' },
    { field: 'county', headerName: 'County', renderHeader: () => renderHeader('County'), flex: 1, minWidth: 100 },
    { field: 'subCounty', headerName: 'Sub-County', renderHeader: () => renderHeader('Sub-County'), flex: 1, minWidth: 120 },
    { field: 'gender', headerName: 'Gender', renderHeader: () => renderHeader('Gender'), flex: 1, minWidth: 80 },
    { field: 'age', headerName: 'Age', renderHeader: () => renderHeader('Age'), type: 'number', flex: 0.5, minWidth: 60, align: 'right', headerAlign: 'right' },
    { field: 'occupation', headerName: 'Occupation', renderHeader: () => renderHeader('Occupation'), flex: 1, minWidth: 120 },
    { field: 'educationLevel', headerName: 'Education Level', renderHeader: () => renderHeader('Education Level'), flex: 1, minWidth: 140 },
    { field: 'diseaseStatusMalaria', headerName: 'Malaria Status', renderHeader: () => renderHeader('Malaria Status'), flex: 1, minWidth: 130 },
    { field: 'diseaseStatusDengue', headerName: 'Dengue Status', renderHeader: () => renderHeader('Dengue Status'), flex: 1, minWidth: 130 },
    { field: 'mosquitoNetUse', headerName: 'Mosquito Net Use', renderHeader: () => renderHeader('Mosquito Net Use'), flex: 1, minWidth: 150 },
    { field: 'waterStoragePractices', headerName: 'Water Storage', renderHeader: () => renderHeader('Water Storage'), flex: 1, minWidth: 140 },
    { field: 'climatePerception', headerName: 'Climate Perception', renderHeader: () => renderHeader('Climate Perception'), flex: 1, minWidth: 160 },
    { field: 'recentRainfall', headerName: 'Recent Rainfall', renderHeader: () => renderHeader('Recent Rainfall'), flex: 1, minWidth: 130 },
    { field: 'averageTemperatureC', headerName: 'Avg. Temp (°C)', renderHeader: () => renderHeader('Avg. Temp (°C)'), type: 'number', flex: 1, minWidth: 150, align: 'right', headerAlign: 'right', valueFormatter: (v) => (v?.value != null ? Number(v.value).toFixed(1) : '') },
    { field: 'householdSize', headerName: 'Household Size', renderHeader: () => renderHeader('Household Size'), type: 'number', flex: 0.5, minWidth: 120, align: 'right', headerAlign: 'right' },
    { field: 'accessToHealthcare', headerName: 'Healthcare Access', renderHeader: () => renderHeader('Healthcare Access'), flex: 1, minWidth: 160 },
    { field: 'projectId', headerName: 'Project ID', renderHeader: () => renderHeader('Project ID'), flex: 1, minWidth: 100 },
  ];

  const fetchRawData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiService.participants.getStudyParticipants(
        filters,
        paginationModel.page + 1,
        paginationModel.pageSize,
        sortModel[0]?.field,
        sortModel[0]?.sort?.toUpperCase()
      );
      setParticipants(response.data);
      setTotalRows(response.totalCount);
    } catch (err) {
      setError("Failed to load raw data. Please try again later.");
      console.error("Failed to fetch raw participant data:", err);
    } finally {
      setLoading(false);
    }
  }, [filters, paginationModel, sortModel]);

  useEffect(() => {
    fetchRawData();
  }, [fetchRawData]);

  const handleApplyFilters = (newFilters) => {
    setFilters(newFilters);
    setPaginationModel(prev => ({ ...prev, page: 0 }));
  };

  const handleExportExcel = async () => {
    setExportingExcel(true);
    try {
      const excelHeadersMapping = columns.reduce((acc, col) => {
        acc[col.field] = col.headerName;
        return acc;
      }, {});
      const data = await apiService.participants.exportStudyParticipantsToExcel(
        filters,
        excelHeadersMapping,
        sortModel[0]?.field,
        sortModel[0]?.sort?.toUpperCase()
      );
      const blob = new Blob([data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'participants_export.xlsx';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Error exporting to Excel:', err);
      alert('Failed to export data to Excel. Please try again.');
    } finally {
      setExportingExcel(false);
    }
  };

  const handleExportPdf = async () => {
    setExportingPdf(true);
    try {
      const allParticipantsResponse = await apiService.participants.getStudyParticipants(
        filters,
        1,
        totalRows > 0 ? totalRows : 100000,
        sortModel[0]?.field,
        sortModel[0]?.sort?.toUpperCase()
      );
      const allParticipants = allParticipantsResponse.data;

      const headers = columns.map(col => col.headerName);
      const dataRows = allParticipants.map(participant =>
        columns.map(col => participant[col.field] !== null && participant[col.field] !== undefined ? String(participant[col.field]) : 'N/A')
      );
      
      const data = await apiService.participants.exportStudyParticipantsToPdf(
        headers,
        dataRows,
      );

      const blob = new Blob([data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'participants_report.pdf';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Error exporting to PDF:', err);
      alert('Failed to export data to PDF. Please try again.');
    } finally {
      setExportingPdf(false);
    }
  };

  return (
    <Box m="20px">
      <Header title="RAW DATA" subtitle="List of Raw Participant Data" />

      <FilterPanel onApplyFilters={handleApplyFilters} />

      <Stack direction="row" spacing={2} sx={{ my: 2, justifyContent: 'flex-end' }}>
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

      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '400px', mt: 2 }}>
          <CircularProgress />
          <Typography sx={{ ml: 2 }}>Loading Raw Data...</Typography>
        </Box>
      )}

      {error && (
        <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>
      )}

      {!loading && !error && participants.length === 0 && (
        <Alert severity="info" sx={{ mt: 2 }}>No raw data available for the selected filters.</Alert>
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
            getRowId={(row) => row.individualId}
            disableRowSelectionOnClick
            density="compact"
            columnHeaderHeight={48}
            pagination
            initialState={{
              pinnedColumns: { left: ['individualId', 'householdId'] },
            }}
            columnVisibilityModel={columnVisibilityModel}
            onColumnVisibilityModelChange={(model) => {
              setColumnVisibilityModel(model);
              try { localStorage.setItem('rawDataColumnVisibility', JSON.stringify(model)); } catch {}
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
    </Box>
  );
}

export default RawDataPage;