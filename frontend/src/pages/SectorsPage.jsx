import React, { useMemo, useState, useEffect } from 'react';
import {
  Box, Typography, Button, TextField, Dialog, DialogTitle,
  DialogContent, DialogActions, Paper, CircularProgress, IconButton,
  Snackbar, Alert, Stack, useTheme, Grid, Card, CardContent,
  Chip, Divider, Autocomplete, Tabs, Tab,
} from '@mui/material';
import { DataGrid } from "@mui/x-data-grid";
import * as XLSX from 'xlsx';
import { 
  Add as AddIcon, 
  Edit as EditIcon, 
  Delete as DeleteIcon, 
  Category as CategoryIcon,
  Search as SearchIcon,
  Clear as ClearIcon,
  TableChart as ExcelIcon,
  PictureAsPdf as PdfIcon,
} from '@mui/icons-material';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import axiosInstance from '../api/axiosInstance';
import userService from '../api/userService';
import { useAuth } from '../context/AuthContext';
import { normalizeRoleName } from '../utils/privilegeUtils';
import { drawCountyOfficialHeader, getCountyLogoDataUrl } from '../utils/countyOfficialPdfHeader';
import { tokens } from "./dashboard/theme";
import Header from "./dashboard/Header";

const normalizeName = (value) => String(value || '').trim().toLowerCase();

const emptySubSector = () => ({
  id: null,
  subSectorName: '',
  alias: '',
  description: '',
});

function SectorsPage() {
  const theme = useTheme();
  const colors = tokens(theme.palette.mode);
  const isLight = theme.palette.mode === 'light';
  const { user } = useAuth();
  const isSuperAdmin = normalizeRoleName(user?.roleName || user?.role) === 'super_admin';

  const [sectors, setSectors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
  const [activeTab, setActiveTab] = useState('sectors');
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [exportingExcel, setExportingExcel] = useState(false);
  const [exportingMappingExcel, setExportingMappingExcel] = useState(false);
  const [exportingMappingPdf, setExportingMappingPdf] = useState(false);
  const [mappingLoading, setMappingLoading] = useState(false);
  const [mappingSaving, setMappingSaving] = useState(false);
  const [mappingAccessDenied, setMappingAccessDenied] = useState(false);
  const [mappingOptions, setMappingOptions] = useState({ sectors: [], departments: [] });
  const [departmentSectorMappings, setDepartmentSectorMappings] = useState([]);
  const [selectedMappingSector, setSelectedMappingSector] = useState(null);
  const [selectedMappingDepartments, setSelectedMappingDepartments] = useState([]);

  // Dialog states
  const [openDialog, setOpenDialog] = useState(false);
  const [currentSector, setCurrentSector] = useState(null);
  const [formData, setFormData] = useState({
    sectorName: '',
    alias: '',
    description: '',
    subSectors: [],
  });
  const [formErrors, setFormErrors] = useState({});
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [sectorToDelete, setSectorToDelete] = useState(null);

  // Fetch sectors
  const fetchSectors = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await axiosInstance.get('/sectors');
      setSectors(response.data || []);
    } catch (err) {
      console.error('Error fetching sectors:', err);
      setError(err?.response?.data?.message || err.message || 'Failed to fetch sectors');
      setSnackbar({
        open: true,
        message: 'Failed to fetch sectors',
        severity: 'error'
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSectors();
  }, []);

  const departmentsForSector = (sector, mappings = departmentSectorMappings, departments = mappingOptions.departments) => {
    const sectorKey = normalizeName(sector?.sectorName);
    if (!sectorKey) return [];
    const departmentByName = new Map(departments.map((department) => [normalizeName(department.departmentName), department]));
    return mappings
      .filter((row) => normalizeName(row.sectorName) === sectorKey)
      .map((row) => {
        const key = normalizeName(row.departmentName);
        return departmentByName.get(key) || {
          id: row.departmentId || null,
          departmentName: row.departmentName,
          alias: '',
        };
      })
      .filter((row) => row.departmentName);
  };

  const mappedSectorCount = useMemo(
    () => new Set(departmentSectorMappings.map((row) => normalizeName(row.sectorName)).filter(Boolean)).size,
    [departmentSectorMappings]
  );

  const mappingRows = useMemo(
    () => mappingOptions.sectors.map((sector) => ({
      sector,
      departments: departmentsForSector(sector),
    })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mappingOptions.sectors, mappingOptions.departments, departmentSectorMappings]
  );

  const mappingExportRows = useMemo(
    () => mappingRows.flatMap(({ sector, departments }) => {
      if (!departments.length) {
        return [{
          sectorName: sector.sectorName || '',
          departmentName: '',
          departmentCount: 0,
        }];
      }
      return departments.map((department) => ({
        sectorName: sector.sectorName || '',
        departmentName: department.departmentName || '',
        departmentCount: departments.length,
      }));
    }),
    [mappingRows]
  );

  const fetchDepartmentSectorMappings = async () => {
    setMappingLoading(true);
    try {
      const data = await userService.getProjectScopeOptions();
      const sectorsList = Array.isArray(data?.sectors) ? data.sectors : [];
      const departmentsList = Array.isArray(data?.departments) ? data.departments : [];
      const mappingsList = Array.isArray(data?.departmentSectorMappings) ? data.departmentSectorMappings : [];
      const firstSector = sectorsList[0] || null;

      setMappingOptions({ sectors: sectorsList, departments: departmentsList });
      setDepartmentSectorMappings(mappingsList);
      setSelectedMappingSector((previous) => {
        const previousKey = normalizeName(previous?.sectorName);
        return sectorsList.find((sector) => normalizeName(sector.sectorName) === previousKey) || firstSector;
      });
      setSelectedMappingDepartments(departmentsForSector(firstSector, mappingsList, departmentsList));
      setMappingAccessDenied(false);
    } catch (err) {
      const status = err?.response?.status;
      if (status === 403 || status === 501) {
        setMappingAccessDenied(true);
        return;
      }
      console.error('Error fetching sector-department mappings:', err);
      setSnackbar({
        open: true,
        message: 'Could not load sector-department mappings.',
        severity: 'warning',
      });
    } finally {
      setMappingLoading(false);
    }
  };

  useEffect(() => {
    fetchDepartmentSectorMappings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Filter sectors based on search
  const filteredSectors = sectors.filter(sector => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      (sector.sectorName || '').toLowerCase().includes(query) ||
      (sector.alias || '').toLowerCase().includes(query) ||
      (sector.description || '').toLowerCase().includes(query) ||
      (sector.subSectors || []).some((subSector) =>
        (subSector.subSectorName || '').toLowerCase().includes(query) ||
        (subSector.alias || '').toLowerCase().includes(query) ||
        (subSector.description || '').toLowerCase().includes(query)
      )
    );
  });

  // Handle form input change
  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Clear error for this field
    if (formErrors[field]) {
      setFormErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  // Validate form
  const validateForm = () => {
    const errors = {};
    if (!formData.sectorName.trim()) {
      errors.sectorName = 'Sector name is required';
    }
    const subSectorNames = new Set();
    formData.subSectors.forEach((subSector, index) => {
      const name = (subSector.subSectorName || '').trim();
      if (!name) {
        errors[`subSectors.${index}.subSectorName`] = 'Sub-sector name is required';
        return;
      }
      const key = name.toLowerCase();
      if (subSectorNames.has(key)) {
        errors[`subSectors.${index}.subSectorName`] = 'Duplicate sub-sector name in this sector';
      }
      subSectorNames.add(key);
    });
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubSectorChange = (index, field, value) => {
    setFormData((prev) => ({
      ...prev,
      subSectors: prev.subSectors.map((subSector, i) =>
        i === index ? { ...subSector, [field]: value } : subSector
      ),
    }));
    const errorKey = `subSectors.${index}.${field}`;
    if (formErrors[errorKey]) {
      setFormErrors((prev) => ({ ...prev, [errorKey]: '' }));
    }
  };

  const handleAddSubSector = () => {
    setFormData((prev) => ({ ...prev, subSectors: [...prev.subSectors, emptySubSector()] }));
  };

  const handleRemoveSubSector = (index) => {
    setFormData((prev) => ({
      ...prev,
      subSectors: prev.subSectors.filter((_, i) => i !== index),
    }));
  };

  const handleExportToExcel = () => {
    setExportingExcel(true);
    try {
      const sectorsToExport = filteredSectors;
      if (!sectorsToExport.length) {
        setSnackbar({
          open: true,
          message: 'No sectors available to export.',
          severity: 'warning',
        });
        return;
      }

      const summaryRows = sectorsToExport.map((sector, index) => {
        const subSectors = sector.subSectors || [];
        return {
          '#': index + 1,
          'Sector Name': sector.sectorName || '',
          'Sector Chart Label': sector.alias || '',
          Description: sector.description || '',
          'Sub-sector Count': subSectors.length,
          'Sub-sectors': subSectors.map((subSector) => subSector.subSectorName || subSector.name || '').filter(Boolean).join(', '),
        };
      });

      const subSectorRows = sectorsToExport.flatMap((sector) => {
        const subSectors = sector.subSectors || [];
        if (!subSectors.length) {
          return [{
            'Sector Name': sector.sectorName || '',
            'Sector Chart Label': sector.alias || '',
            'Sub-sector Name': '',
            'Sub-sector Chart Label': '',
            'Sub-sector Description': '',
          }];
        }
        return subSectors.map((subSector) => ({
          'Sector Name': sector.sectorName || '',
          'Sector Chart Label': sector.alias || '',
          'Sub-sector Name': subSector.subSectorName || subSector.name || '',
          'Sub-sector Chart Label': subSector.alias || '',
          'Sub-sector Description': subSector.description || '',
        }));
      });

      const workbook = XLSX.utils.book_new();
      const summarySheet = XLSX.utils.json_to_sheet(summaryRows);
      const subSectorsSheet = XLSX.utils.json_to_sheet(subSectorRows);

      summarySheet['!cols'] = [
        { wch: 6 },
        { wch: 42 },
        { wch: 36 },
        { wch: 70 },
        { wch: 18 },
        { wch: 90 },
      ];
      subSectorsSheet['!cols'] = [
        { wch: 42 },
        { wch: 36 },
        { wch: 36 },
        { wch: 36 },
        { wch: 80 },
      ];

      XLSX.utils.book_append_sheet(workbook, summarySheet, 'Sectors');
      XLSX.utils.book_append_sheet(workbook, subSectorsSheet, 'Sub-sectors');

      const dateStr = new Date().toISOString().split('T')[0];
      const filename = searchQuery.trim()
        ? `sectors_management_filtered_${dateStr}.xlsx`
        : `sectors_management_${dateStr}.xlsx`;
      XLSX.writeFile(workbook, filename);

      setSnackbar({
        open: true,
        message: `Exported ${sectorsToExport.length} sector${sectorsToExport.length !== 1 ? 's' : ''} to Excel.`,
        severity: 'success',
      });
    } catch (err) {
      console.error('Error exporting sectors to Excel:', err);
      setSnackbar({
        open: true,
        message: 'Failed to export sectors to Excel. Please try again.',
        severity: 'error',
      });
    } finally {
      setExportingExcel(false);
    }
  };

  const handleExportMappingExcel = () => {
    setExportingMappingExcel(true);
    try {
      if (!mappingRows.length) {
        setSnackbar({
          open: true,
          message: 'No sector-department linkages available to export.',
          severity: 'warning',
        });
        return;
      }

      const summaryRows = mappingRows.map(({ sector, departments }, index) => ({
        '#': index + 1,
        Sector: sector.sectorName || '',
        'Department Count': departments.length,
        Departments: departments.map((department) => department.departmentName).filter(Boolean).join(', '),
      }));
      const detailRows = mappingExportRows.map((row, index) => ({
        '#': index + 1,
        Sector: row.sectorName,
        Department: row.departmentName || 'No departments mapped',
      }));

      const workbook = XLSX.utils.book_new();
      const summarySheet = XLSX.utils.json_to_sheet(summaryRows);
      const detailSheet = XLSX.utils.json_to_sheet(detailRows);
      summarySheet['!cols'] = [
        { wch: 6 },
        { wch: 44 },
        { wch: 18 },
        { wch: 100 },
      ];
      detailSheet['!cols'] = [
        { wch: 6 },
        { wch: 44 },
        { wch: 64 },
      ];
      XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary');
      XLSX.utils.book_append_sheet(workbook, detailSheet, 'Sector Departments');

      XLSX.writeFile(workbook, `sector_departments_${new Date().toISOString().slice(0, 10)}.xlsx`);
      setSnackbar({
        open: true,
        message: `Exported ${mappingRows.length} sector-department mapping${mappingRows.length !== 1 ? 's' : ''} to Excel.`,
        severity: 'success',
      });
    } catch (err) {
      console.error('Error exporting sector-department mappings to Excel:', err);
      setSnackbar({
        open: true,
        message: 'Failed to export sector-department mappings to Excel. Please try again.',
        severity: 'error',
      });
    } finally {
      setExportingMappingExcel(false);
    }
  };

  const handleExportMappingPdf = async () => {
    setExportingMappingPdf(true);
    try {
      if (!mappingRows.length) {
        setSnackbar({
          open: true,
          message: 'No sector-department linkages available to export.',
          severity: 'warning',
        });
        return;
      }

      const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
      const logoDataUrl = await getCountyLogoDataUrl();
      const generatedAt = new Date();
      let y = drawCountyOfficialHeader(doc, {
        unit: 'pt',
        logoDataUrl,
        title: 'Sector-Department Linkages',
      });
      doc.setFontSize(9);
      doc.text(`Generated: ${generatedAt.toLocaleString()} | Sectors: ${mappingRows.length} | Linkages: ${departmentSectorMappings.length}`, 40, y);
      y += 16;

      autoTable(doc, {
        startY: y,
        head: [['#', 'Sector', 'Department Count', 'Departments']],
        body: mappingRows.map(({ sector, departments }, index) => [
          index + 1,
          sector.sectorName || '',
          departments.length,
          departments.length
            ? departments.map((department) => department.departmentName).filter(Boolean).join(', ')
            : 'No departments mapped',
        ]),
        styles: {
          fontSize: 8,
          cellPadding: 5,
          valign: 'top',
        },
        headStyles: {
          fillColor: [31, 78, 121],
          textColor: 255,
        },
        columnStyles: {
          0: { cellWidth: 34 },
          1: { cellWidth: 180 },
          2: { cellWidth: 80, halign: 'center' },
          3: { cellWidth: 470 },
        },
        margin: { left: 40, right: 40 },
      });

      doc.save(`sector_departments_${new Date().toISOString().slice(0, 10)}.pdf`);
      setSnackbar({
        open: true,
        message: 'Exported sector-department mappings to PDF.',
        severity: 'success',
      });
    } catch (err) {
      console.error('Error exporting sector-department mappings to PDF:', err);
      setSnackbar({
        open: true,
        message: 'Failed to export sector-department mappings to PDF. Please try again.',
        severity: 'error',
      });
    } finally {
      setExportingMappingPdf(false);
    }
  };

  const handleMappingSectorChange = (_event, sector) => {
    setSelectedMappingSector(sector);
    setSelectedMappingDepartments(departmentsForSector(sector));
  };

  const handleSaveDepartmentSectorMapping = async () => {
    if (!selectedMappingSector) {
      setSnackbar({
        open: true,
        message: 'Select a sector before saving department mappings.',
        severity: 'warning',
      });
      return;
    }

    const sectorKey = normalizeName(selectedMappingSector.sectorName);
    const existingForOtherSectors = departmentSectorMappings.filter((row) => normalizeName(row.sectorName) !== sectorKey);
    const newRows = selectedMappingDepartments.map((department) => ({
      sectorId: selectedMappingSector.id || null,
      sectorName: selectedMappingSector.sectorName,
      departmentId: department.id || null,
      departmentName: department.departmentName,
    }));

    setMappingSaving(true);
    try {
      const savedMappings = await userService.saveDepartmentSectorMappings([...existingForOtherSectors, ...newRows]);
      setDepartmentSectorMappings(Array.isArray(savedMappings) ? savedMappings : []);
      setSnackbar({
        open: true,
        message: 'Sector-department mapping saved.',
        severity: 'success',
      });
    } catch (err) {
      console.error('Error saving sector-department mappings:', err);
      setSnackbar({
        open: true,
        message: err?.response?.data?.error || 'Failed to save sector-department mapping.',
        severity: 'error',
      });
    } finally {
      setMappingSaving(false);
    }
  };

  // Handle save (create or update)
  const handleSave = async () => {
    if (!validateForm()) return;

    try {
      let response;
      if (currentSector) {
        // Update
        response = await axiosInstance.put(`/sectors/${currentSector.id}`, formData);
        console.log('Update response:', response.data);
        setSnackbar({
          open: true,
          message: 'Sector updated successfully',
          severity: 'success'
        });
      } else {
        // Create
        response = await axiosInstance.post('/sectors', formData);
        console.log('Create response:', response.data);
        setSnackbar({
          open: true,
          message: 'Sector created successfully',
          severity: 'success'
        });
      }
      setOpenDialog(false);
      resetForm();
      // Force refresh by updating key and fetching
      setRefreshKey(prev => prev + 1);
      // Small delay to ensure database commit
      setTimeout(() => {
        fetchSectors();
      }, 100);
    } catch (err) {
      console.error('Error saving sector:', err);
      const errorMessage = err?.response?.data?.message || err.message || 'Failed to save sector';
      setSnackbar({
        open: true,
        message: errorMessage,
        severity: 'error'
      });
    }
  };

  // Handle delete
  const handleDelete = async () => {
    if (!sectorToDelete) return;

    try {
      await axiosInstance.delete(`/sectors/${sectorToDelete.id}`);
      setSnackbar({
        open: true,
        message: 'Sector deleted successfully',
        severity: 'success'
      });
      setDeleteConfirmOpen(false);
      setSectorToDelete(null);
      fetchSectors();
    } catch (err) {
      console.error('Error deleting sector:', err);
      setSnackbar({
        open: true,
        message: err?.response?.data?.message || 'Failed to delete sector',
        severity: 'error'
      });
    }
  };

  // Open dialog for create
  const handleCreate = () => {
    setCurrentSector(null);
    resetForm();
    setOpenDialog(true);
  };

  // Open dialog for edit
  const handleEdit = (sector) => {
    setCurrentSector(sector);
    setFormData({
      sectorName: sector.sectorName || '',
      alias: sector.alias || '',
      description: sector.description || '',
      subSectors: (sector.subSectors || []).map((subSector) => ({
        id: subSector.id || null,
        subSectorName: subSector.subSectorName || subSector.name || '',
        alias: subSector.alias || '',
        description: subSector.description || '',
      })),
    });
    setFormErrors({});
    setOpenDialog(true);
  };

  // Reset form
  const resetForm = () => {
    setFormData({
      sectorName: '',
      alias: '',
      description: '',
      subSectors: [],
    });
    setFormErrors({});
    setCurrentSector(null);
  };

  // DataGrid columns
  const columns = [
    {
      field: 'id',
      headerName: 'ID',
      width: 80,
      sortable: false,
    },
    {
      field: 'sectorName',
      headerName: 'Sector Name',
      flex: 1,
      minWidth: 200,
      editable: false,
    },
    {
      field: 'alias',
      headerName: 'Chart Label',
      flex: 1,
      minWidth: 150,
      editable: false,
      renderCell: (params) => (
        <Typography variant="body2" sx={{ 
          fontStyle: params.value ? 'normal' : 'italic',
          color: params.value ? 'text.primary' : 'text.secondary'
        }}>
          {params.value || '-'}
        </Typography>
      ),
    },
    {
      field: 'subSectors',
      headerName: 'Sub-sectors',
      flex: 1.4,
      minWidth: 260,
      sortable: false,
      renderCell: (params) => {
        const subSectors = params.row?.subSectors || [];
        if (!subSectors.length) {
          return (
            <Typography variant="body2" sx={{ fontStyle: 'italic', color: 'text.secondary' }}>
              No sub-sectors
            </Typography>
          );
        }
        return (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, py: 0.5 }}>
            {subSectors.slice(0, 4).map((subSector) => (
              <Chip
                key={subSector.id || subSector.subSectorName}
                size="small"
                label={subSector.alias ? `${subSector.subSectorName} (${subSector.alias})` : subSector.subSectorName}
                variant="outlined"
              />
            ))}
            {subSectors.length > 4 && (
              <Chip size="small" label={`+${subSectors.length - 4} more`} color="primary" variant="outlined" />
            )}
          </Box>
        );
      },
    },
    {
      field: 'description',
      headerName: 'Description',
      flex: 2,
      minWidth: 300,
      editable: false,
      renderCell: (params) => (
        <Typography variant="body2" sx={{ 
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          maxWidth: '100%'
        }}>
          {params.value || '-'}
        </Typography>
      ),
    },
    {
      field: 'actions',
      headerName: 'Actions',
      width: 150,
      sortable: false,
      renderCell: (params) => (
        <Box sx={{ display: 'flex', gap: 1 }}>
          <IconButton
            size="small"
            onClick={() => handleEdit(params.row)}
            sx={{ color: colors.blueAccent[500] }}
          >
            <EditIcon fontSize="small" />
          </IconButton>
          <IconButton
            size="small"
            onClick={() => {
              setSectorToDelete(params.row);
              setDeleteConfirmOpen(true);
            }}
            sx={{ color: colors.redAccent[500] }}
          >
            <DeleteIcon fontSize="small" />
          </IconButton>
        </Box>
      ),
    },
  ];

  return (
    <Box m="20px">
      <Header title="Sectors Management" subtitle="Manage government sectors" />

      <Paper sx={{ mb: 3 }}>
        <Tabs
          value={activeTab}
          onChange={(_event, value) => setActiveTab(value)}
          variant="scrollable"
          scrollButtons="auto"
          sx={{
            px: 2,
            borderBottom: `1px solid ${isLight ? colors.grey[200] : colors.grey[700]}`,
          }}
        >
          <Tab value="sectors" label="Sectors" />
          <Tab value="sectorDepartments" label="Sector-Departments" />
        </Tabs>
      </Paper>

      {activeTab === 'sectors' && (
        <Stack spacing={3}>
          <Grid container spacing={2}>
            <Grid item xs={12} md={6}>
              <Card>
                <CardContent>
                  <Box display="flex" alignItems="center" gap={2}>
                    <CategoryIcon sx={{ fontSize: 40, color: colors.blueAccent[500] }} />
                    <Box>
                      <Typography variant="h4" fontWeight={600}>
                        {sectors.length}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Total Sectors
                      </Typography>
                    </Box>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} md={6}>
              <Card>
                <CardContent>
                  <Box display="flex" alignItems="center" gap={2}>
                    <CategoryIcon sx={{ fontSize: 40, color: colors.greenAccent[500] }} />
                    <Box>
                      <Typography variant="h4" fontWeight={600}>
                        {sectors.reduce((sum, sector) => sum + (sector.subSectors?.length || 0), 0)}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Total Sub-sectors
                      </Typography>
                    </Box>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          <Box display="flex" justifyContent="space-between" alignItems="center" gap={2} flexWrap="wrap">
            <TextField
              placeholder="Search sectors, chart labels, or sub-sectors..."
              variant="outlined"
              size="small"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              InputProps={{
                startAdornment: <SearchIcon sx={{ mr: 1, color: 'text.secondary' }} />,
                endAdornment: searchQuery && (
                  <IconButton
                    size="small"
                    onClick={() => setSearchQuery('')}
                    sx={{ mr: -1 }}
                  >
                    <ClearIcon fontSize="small" />
                  </IconButton>
                ),
              }}
              sx={{ width: { xs: '100%', sm: 420 } }}
            />
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ xs: 'stretch', sm: 'center' }}>
              <Button
                variant="outlined"
                startIcon={exportingExcel ? <CircularProgress size={16} color="inherit" /> : <ExcelIcon />}
                onClick={handleExportToExcel}
                disabled={exportingExcel || loading || filteredSectors.length === 0}
              >
                {exportingExcel ? 'Exporting...' : 'Export Excel'}
              </Button>
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={handleCreate}
                sx={{
                  backgroundColor: colors.blueAccent[500],
                  '&:hover': {
                    backgroundColor: colors.blueAccent[600],
                  },
                }}
              >
                Add Sector
              </Button>
            </Stack>
          </Box>

          {error && (
            <Alert severity="error">
              {error}
            </Alert>
          )}
          <Paper sx={{ height: 600, width: '100%' }}>
            <DataGrid
              key={refreshKey}
              rows={filteredSectors}
              columns={columns}
              loading={loading}
              getRowId={(row) => row.id}
              getRowHeight={() => 'auto'}
              pageSizeOptions={[10, 25, 50, 100]}
              initialState={{
                pagination: {
                  paginationModel: { pageSize: 25 },
                },
              }}
              sx={{
                '& .MuiDataGrid-cell': {
                  borderBottom: `1px solid ${isLight ? colors.grey[200] : colors.grey[700]}`,
                },
                '& .MuiDataGrid-columnHeaders': {
                  backgroundColor: isLight ? colors.blueAccent[100] : colors.blueAccent[800],
                  borderBottom: `2px solid ${isLight ? colors.blueAccent[300] : colors.blueAccent[600]}`,
                },
                '& .MuiDataGrid-columnHeaderTitle': {
                  fontWeight: 700,
                },
              }}
            />
          </Paper>
        </Stack>
      )}

      {activeTab === 'sectorDepartments' && (
        <Stack spacing={3}>
          <Grid container spacing={2}>
            <Grid item xs={12} md={6}>
              <Card>
                <CardContent>
                  <Box display="flex" alignItems="center" gap={2}>
                    <CategoryIcon sx={{ fontSize: 40, color: colors.blueAccent[500] }} />
                    <Box>
                      <Typography variant="h4" fontWeight={600}>
                        {mappedSectorCount}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Sectors with Departments
                      </Typography>
                    </Box>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} md={6}>
              <Card>
                <CardContent>
                  <Box display="flex" alignItems="center" gap={2}>
                    <CategoryIcon sx={{ fontSize: 40, color: colors.greenAccent[500] }} />
                    <Box>
                      <Typography variant="h4" fontWeight={600}>
                        {departmentSectorMappings.length}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Department Linkages
                      </Typography>
                    </Box>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          {mappingAccessDenied ? (
            <Alert severity="warning">
              You do not have permission to view sector-department linkages.
            </Alert>
          ) : (
            <Paper sx={{ p: 2.5, border: `1px solid ${isLight ? colors.blueAccent[100] : colors.blueAccent[700]}` }}>
              <Stack spacing={2}>
                <Box display="flex" justifyContent="space-between" alignItems="flex-start" gap={2} flexWrap="wrap">
                  <Box>
                    <Typography variant="h5" fontWeight={700}>
                      Sector-Department Linkage
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Admins can view how sectors cascade to departments for the import template. Super Admin can update the linkage here.
                    </Typography>
                  </Box>
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ xs: 'stretch', sm: 'center' }}>
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={exportingMappingExcel ? <CircularProgress size={14} color="inherit" /> : <ExcelIcon />}
                      onClick={handleExportMappingExcel}
                      disabled={mappingLoading || exportingMappingExcel || exportingMappingPdf || mappingRows.length === 0}
                    >
                      {exportingMappingExcel ? 'Exporting...' : 'Excel'}
                    </Button>
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={exportingMappingPdf ? <CircularProgress size={14} color="inherit" /> : <PdfIcon />}
                      onClick={handleExportMappingPdf}
                      disabled={mappingLoading || exportingMappingExcel || exportingMappingPdf || mappingRows.length === 0}
                    >
                      {exportingMappingPdf ? 'Exporting...' : 'PDF'}
                    </Button>
                  </Stack>
                </Box>

                {!isSuperAdmin && (
                  <Alert severity="info">
                    You can view the current linkage. Only Super Admin can change and save sector-department mappings.
                  </Alert>
                )}

                <Grid container spacing={2} alignItems="flex-start">
                  <Grid item xs={12} md={4}>
                    <Autocomplete
                      size="small"
                      options={mappingOptions.sectors}
                      value={selectedMappingSector}
                      loading={mappingLoading}
                      getOptionLabel={(option) => option?.sectorName || ''}
                      isOptionEqualToValue={(option, value) => normalizeName(option?.sectorName) === normalizeName(value?.sectorName)}
                      onChange={handleMappingSectorChange}
                      renderInput={(params) => (
                        <TextField
                          {...params}
                          label="Sector"
                          helperText="Choose a sector to view its departments"
                        />
                      )}
                    />
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <Autocomplete
                      multiple
                      size="small"
                      options={mappingOptions.departments}
                      value={selectedMappingDepartments}
                      loading={mappingLoading}
                      disabled={!isSuperAdmin}
                      getOptionLabel={(option) => option?.departmentName || ''}
                      isOptionEqualToValue={(option, value) => normalizeName(option?.departmentName) === normalizeName(value?.departmentName)}
                      onChange={(_event, value) => setSelectedMappingDepartments(value)}
                      renderTags={(value, getTagProps) =>
                        value.map((option, index) => {
                          const { key, ...tagProps } = getTagProps({ index });
                          return (
                            <Chip
                              key={key || option.id || option.departmentName}
                              {...tagProps}
                              size="small"
                              label={option.departmentName}
                            />
                          );
                        })
                      }
                      renderInput={(params) => (
                        <TextField
                          {...params}
                          label="Departments in selected sector"
                          helperText={isSuperAdmin ? 'Select all departments under this sector' : 'Read-only for non-Super Admin users'}
                        />
                      )}
                    />
                  </Grid>
                  <Grid item xs={12} md={2}>
                    <Button
                      fullWidth
                      variant="contained"
                      onClick={handleSaveDepartmentSectorMapping}
                      disabled={!isSuperAdmin || mappingLoading || mappingSaving || !selectedMappingSector}
                      startIcon={mappingSaving ? <CircularProgress size={16} color="inherit" /> : null}
                      sx={{ minHeight: 40 }}
                    >
                      {mappingSaving ? 'Saving...' : 'Save Mapping'}
                    </Button>
                  </Grid>
                </Grid>

                <Divider />
                <Box>
                  <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1 }}>
                    All Current Linkages
                  </Typography>
                  <Grid container spacing={1.25}>
                    {mappingRows.map(({ sector, departments }) => (
                      <Grid item xs={12} md={6} key={sector.id || sector.sectorName}>
                        <Paper variant="outlined" sx={{ p: 1.5, height: '100%', borderRadius: 1.5 }}>
                          <Typography variant="subtitle2" fontWeight={700}>
                            {sector.sectorName}
                          </Typography>
                          <Box sx={{ mt: 1, display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
                            {departments.length ? departments.map((department) => (
                              <Chip
                                key={department.id || department.departmentName}
                                size="small"
                                label={department.departmentName}
                                variant="outlined"
                              />
                            )) : (
                              <Typography variant="body2" color="text.secondary">
                                No departments mapped.
                              </Typography>
                            )}
                          </Box>
                        </Paper>
                      </Grid>
                    ))}
                  </Grid>
                </Box>
              </Stack>
            </Paper>
          )}
        </Stack>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={openDialog} onClose={() => { setOpenDialog(false); resetForm(); }} maxWidth="md" fullWidth>
        <DialogTitle sx={{ backgroundColor: theme.palette.primary.main, color: 'white' }}>
          {currentSector ? 'Edit Sector' : 'Add Sector'}
        </DialogTitle>
        <DialogContent dividers sx={{ backgroundColor: theme.palette.background.default }}>
          <Stack spacing={2}>
            <TextField
              autoFocus
              margin="dense"
              label="Sector Name"
              fullWidth
              required
              variant="outlined"
              value={formData.sectorName}
              onChange={(e) => handleInputChange('sectorName', e.target.value)}
              error={!!formErrors.sectorName}
              helperText={formErrors.sectorName}
              sx={{ mb: 2 }}
            />
            <TextField
              margin="dense"
              label="Sector Chart Label"
              fullWidth
              variant="outlined"
              value={formData.alias}
              onChange={(e) => handleInputChange('alias', e.target.value)}
              helperText="Optional short display name used in dashboard charts and reports"
              sx={{ mb: 2 }}
            />
            <TextField
              margin="dense"
              label="Description"
              fullWidth
              variant="outlined"
              multiline
              rows={3}
              value={formData.description}
              onChange={(e) => handleInputChange('description', e.target.value)}
              sx={{ mb: 2 }}
            />
            <Divider />
            <Box>
              <Box display="flex" justifyContent="space-between" alignItems="center" gap={1} sx={{ mb: 1 }}>
                <Box>
                  <Typography variant="subtitle1" fontWeight={700}>
                    Sub-sectors
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Add sub-sectors under this sector. Each sub-sector can also have a short chart label.
                  </Typography>
                </Box>
                <Button size="small" startIcon={<AddIcon />} variant="outlined" onClick={handleAddSubSector}>
                  Add Sub-sector
                </Button>
              </Box>
              <Stack spacing={1.25}>
                {formData.subSectors.map((subSector, index) => (
                  <Paper key={subSector.id || `new-${index}`} variant="outlined" sx={{ p: 1.25, borderRadius: 1.5 }}>
                    <Grid container spacing={1}>
                      <Grid item xs={12} md={4}>
                        <TextField
                          label="Sub-sector Name"
                          size="small"
                          fullWidth
                          required
                          value={subSector.subSectorName}
                          onChange={(e) => handleSubSectorChange(index, 'subSectorName', e.target.value)}
                          error={!!formErrors[`subSectors.${index}.subSectorName`]}
                          helperText={formErrors[`subSectors.${index}.subSectorName`]}
                        />
                      </Grid>
                      <Grid item xs={12} md={3}>
                        <TextField
                          label="Chart Label"
                          size="small"
                          fullWidth
                          value={subSector.alias}
                          onChange={(e) => handleSubSectorChange(index, 'alias', e.target.value)}
                          helperText="Short display name"
                        />
                      </Grid>
                      <Grid item xs={12} md={4}>
                        <TextField
                          label="Description"
                          size="small"
                          fullWidth
                          value={subSector.description}
                          onChange={(e) => handleSubSectorChange(index, 'description', e.target.value)}
                        />
                      </Grid>
                      <Grid item xs={12} md={1} display="flex" alignItems="flex-start" justifyContent="flex-end">
                        <IconButton
                          color="error"
                          size="small"
                          onClick={() => handleRemoveSubSector(index)}
                          aria-label="Remove sub-sector"
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Grid>
                    </Grid>
                  </Paper>
                ))}
                {formData.subSectors.length === 0 && (
                  <Alert severity="info">
                    No sub-sectors added yet. Use Add Sub-sector to create one under this sector.
                  </Alert>
                )}
              </Stack>
            </Box>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ padding: '16px 24px' }}>
          <Button onClick={() => { setOpenDialog(false); resetForm(); }} color="primary" variant="outlined">
            Cancel
          </Button>
          <Button onClick={handleSave} color="primary" variant="contained">
            {currentSector ? 'Update Sector' : 'Create Sector'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteConfirmOpen} onClose={() => setDeleteConfirmOpen(false)}>
        <DialogTitle>Confirm Delete</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete "{sectorToDelete?.sectorName}"? This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConfirmOpen(false)}>Cancel</Button>
          <Button onClick={handleDelete} color="error" variant="contained">
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert onClose={() => setSnackbar({ ...snackbar, open: false })} severity={snackbar.severity}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}

export default SectorsPage;
