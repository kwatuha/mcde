// src/components/ProjectFormDialog.jsx
import React, { useEffect, useMemo, useState } from 'react';
import {
  Box, Typography, Button, TextField, Dialog, DialogTitle,
  DialogContent, DialogActions, Select, MenuItem, FormControl, InputLabel,
  Stack, useTheme, Paper, Grid, OutlinedInput, Chip, Autocomplete,
  Alert, CircularProgress, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow,
} from '@mui/material';
import useProjectForm from '../hooks/useProjectForm';
import { getProjectStatusBackgroundColor, getProjectStatusTextColor } from '../utils/projectStatusColors';
import { tokens } from '../pages/dashboard/theme';
import { DEFAULT_COUNTY } from '../configs/appConfig';
import apiService from '../api';
import { isAdmin as isAdminUser } from '../utils/privilegeUtils';

const parseMoney = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(String(value).replace(/,/g, '').trim());
  return Number.isFinite(parsed) ? parsed : null;
};

const fmtKes = (value) => {
  const parsed = parseMoney(value);
  return parsed === null
    ? '-'
    : `KES ${parsed.toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const fmtNumber = (value) => {
  const parsed = parseMoney(value);
  return parsed === null ? '-' : parsed.toLocaleString('en-KE', { maximumFractionDigits: 2 });
};

const normalizeOrgKey = (value) => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
const isAllOrgScope = (value) => ['*', 'all', 'all ministries', 'all_ministries'].includes(normalizeOrgKey(value));
const aliasKeys = (value) => String(value || '')
  .split(/[,;|/]/)
  .map(normalizeOrgKey)
  .filter(Boolean);

const getUserDepartmentScope = (user) => {
  if (!user || isAdminUser(user) || user.privileges?.includes('organization.scope_bypass')) {
    return { restricted: false, allowedKeys: new Set() };
  }

  const scopes = Array.isArray(user.organizationScopes) ? user.organizationScopes : [];
  const hasAllDepartmentsScope = scopes.some((scope) => {
    const scopeType = String(scope?.scopeType || scope?.scope_type || '').trim().toUpperCase();
    return scopeType === 'ALL_MINISTRIES' || (scopeType === 'MINISTRY_ALL' && isAllOrgScope(scope?.ministry));
  });
  if (hasAllDepartmentsScope) {
    return { restricted: false, allowedKeys: new Set() };
  }

  const allowedKeys = new Set();
  let hasRestrictingScope = false;

  scopes.forEach((scope) => {
    const scopeType = String(scope?.scopeType || scope?.scope_type || '').trim().toUpperCase();
    if (scopeType === 'STATE_DEPARTMENT_ALL') {
      hasRestrictingScope = true;
      const key = normalizeOrgKey(scope?.stateDepartment || scope?.state_department);
      if (key) allowedKeys.add(key);
    }
  });

  if (allowedKeys.size === 0 && !scopes.length) {
    const profileDepartment = normalizeOrgKey(user.stateDepartment || user.state_department);
    if (profileDepartment) {
      hasRestrictingScope = true;
      allowedKeys.add(profileDepartment);
    }
  }

  return { restricted: hasRestrictingScope && allowedKeys.size > 0, allowedKeys };
};

const ProjectFormDialog = ({
  open,
  handleClose,
  currentProject,
  onFormSuccess,
  setSnackbar,
  allMetadata, // Now includes projectCategories
  user,
  villageOptions = [],
}) => {
  const theme = useTheme();
  // Get the color mode more robustly, defaulting to 'dark' if not available
  const colorMode = theme?.palette?.mode || 'dark';
  const colors = tokens(colorMode);

  const {
    formData,
    formErrors,
    loading,
    handleChange,
    handleSubmit,
  } = useProjectForm(currentProject, allMetadata, onFormSuccess, setSnackbar, user);

  // State for Kenya wards dropdowns
  const [subcounties, setSubcounties] = useState([]);
  const [wards, setWards] = useState([]);
  const [loadingSubcounties, setLoadingSubcounties] = useState(false);
  const [loadingWards, setLoadingWards] = useState(false);

  const [departmentCatalog, setDepartmentCatalog] = useState([]);
  const [sectionCatalog, setSectionCatalog] = useState([]);
  const [loadingOrgCatalog, setLoadingOrgCatalog] = useState(false);

  const [sectorsFallback, setSectorsFallback] = useState([]);
  const [loadingSectorsFallback, setLoadingSectorsFallback] = useState(false);
  const [financialYearsFallback, setFinancialYearsFallback] = useState([]);
  const [projectTypesFallback, setProjectTypesFallback] = useState([]);
  const [projectTypeScopePreview, setProjectTypeScopePreview] = useState({
    loading: false,
    error: '',
    milestones: [],
    bqTemplates: [],
  });
  const [scopePreviewOpen, setScopePreviewOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const sectorsFromMetadata = allMetadata?.sectors;
    const financialYearsFromMetadata = allMetadata?.financialYears;
    const projectTypesFromMetadata = allMetadata?.projectCategories;
    if (Array.isArray(sectorsFromMetadata) && sectorsFromMetadata.length > 0) {
      setSectorsFallback([]);
    }
    if (Array.isArray(financialYearsFromMetadata) && financialYearsFromMetadata.length > 0) {
      setFinancialYearsFallback([]);
    }
    if (Array.isArray(projectTypesFromMetadata) && projectTypesFromMetadata.length > 0) {
      setProjectTypesFallback([]);
    }
    if (
      Array.isArray(sectorsFromMetadata) && sectorsFromMetadata.length > 0 &&
      Array.isArray(financialYearsFromMetadata) && financialYearsFromMetadata.length > 0 &&
      Array.isArray(projectTypesFromMetadata) && projectTypesFromMetadata.length > 0
    ) {
      return;
    }

    let cancelled = false;
    const fetchFormMetadataFallbacks = async () => {
      setLoadingSectorsFallback(true);
      try {
        const [sectors, financialYears, projectTypes] = await Promise.all([
          Array.isArray(sectorsFromMetadata) && sectorsFromMetadata.length > 0
            ? Promise.resolve([])
            : apiService.sectors.getAllSectors().catch((err) => {
                console.error('ProjectFormDialog: fallback fetch sectors failed', err);
                return [];
              }),
          Array.isArray(financialYearsFromMetadata) && financialYearsFromMetadata.length > 0
            ? Promise.resolve([])
            : apiService.metadata.financialYears.getAllFinancialYears().catch((err) => {
                console.error('ProjectFormDialog: fallback fetch financial years failed', err);
                return [];
              }),
          Array.isArray(projectTypesFromMetadata) && projectTypesFromMetadata.length > 0
            ? Promise.resolve([])
            : apiService.metadata.projectCategories.getAllCategories().catch((err) => {
                console.error('ProjectFormDialog: fallback fetch project types failed', err);
                return [];
              }),
        ]);
        if (!cancelled) {
          if (!(Array.isArray(sectorsFromMetadata) && sectorsFromMetadata.length > 0)) {
            setSectorsFallback(Array.isArray(sectors) ? sectors : []);
          }
          if (!(Array.isArray(financialYearsFromMetadata) && financialYearsFromMetadata.length > 0)) {
            setFinancialYearsFallback(Array.isArray(financialYears) ? financialYears : []);
          }
          if (!(Array.isArray(projectTypesFromMetadata) && projectTypesFromMetadata.length > 0)) {
            setProjectTypesFallback(Array.isArray(projectTypes) ? projectTypes : []);
          }
        }
      } finally {
        if (!cancelled) setLoadingSectorsFallback(false);
      }
    };
    fetchFormMetadataFallbacks();
    return () => { cancelled = true; };
  }, [open, allMetadata?.sectors, allMetadata?.financialYears, allMetadata?.projectCategories]);

  useEffect(() => {
    if (!open) return;
    const departmentsFromMetadata = allMetadata?.departments;
    const sectionsFromMetadata = allMetadata?.sections;
    if (Array.isArray(departmentsFromMetadata) && departmentsFromMetadata.length > 0) {
      setDepartmentCatalog(departmentsFromMetadata);
    }
    if (Array.isArray(sectionsFromMetadata) && sectionsFromMetadata.length > 0) {
      setSectionCatalog(sectionsFromMetadata);
    }
    if (
      Array.isArray(departmentsFromMetadata) && departmentsFromMetadata.length > 0 &&
      Array.isArray(sectionsFromMetadata) && sectionsFromMetadata.length > 0
    ) {
      return;
    }

    let cancelled = false;
    const loadCountyOrgCatalog = async () => {
      setLoadingOrgCatalog(true);
      try {
        const [departments, sections] = await Promise.all([
          Array.isArray(departmentsFromMetadata) && departmentsFromMetadata.length > 0
            ? Promise.resolve(departmentsFromMetadata)
            : apiService.metadata.departments.getAllDepartments().catch((err) => {
                console.error('ProjectFormDialog: departments fetch failed', err);
                return [];
              }),
          Array.isArray(sectionsFromMetadata) && sectionsFromMetadata.length > 0
            ? Promise.resolve(sectionsFromMetadata)
            : apiService.metadata.sections.getAllSections().catch((err) => {
                console.error('ProjectFormDialog: directorates fetch failed', err);
                return [];
              }),
        ]);
        if (!cancelled) {
          setDepartmentCatalog(Array.isArray(departments) ? departments : []);
          setSectionCatalog(Array.isArray(sections) ? sections : []);
        }
      } finally {
        if (!cancelled) setLoadingOrgCatalog(false);
      }
    };
    loadCountyOrgCatalog();
    return () => {
      cancelled = true;
    };
  }, [open, allMetadata?.departments, allMetadata?.sections]);

  // Fetch sub-counties when county changes
  useEffect(() => {
    if (!open) return;
    
    const fetchSubcounties = async () => {
      const countyName = formData.county || DEFAULT_COUNTY.name;
      if (!countyName) {
        setSubcounties([]);
        setWards([]);
        // Clear sub-county and ward when county is cleared
        if (formData.subcounty || formData.ward) {
          // Use a ref to avoid infinite loops - update formData directly via setFormData if available
          // For now, just clear the local state
        }
        return;
      }
      setLoadingSubcounties(true);
      try {
        const data = await apiService.kenyaWards.getSubcounties(countyName);
        setSubcounties(data);
        // Clear sub-county and ward when county changes - use a flag to prevent re-triggering
        const hadSubcounty = formData.subcounty;
        const hadWard = formData.ward;
        if (hadSubcounty || hadWard) {
          // Update formData directly to avoid triggering handleChange which might cause loops
          // We'll let the parent handle this through the formData prop
        }
      } catch (error) {
        console.error('Error fetching sub-counties:', error);
        // Only show error if dialog is open and user is interacting
        if (open) {
          setSnackbar({ 
            open: true, 
            message: 'Failed to load sub-counties. Please try again.', 
            severity: 'error' 
          });
        }
      } finally {
        setLoadingSubcounties(false);
      }
    };
    fetchSubcounties();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.county, open]);

  // Fetch wards when sub-county changes
  useEffect(() => {
    if (!open) return;
    
    const fetchWards = async () => {
      if (!formData.subcounty) {
        setWards([]);
        return;
      }
      setLoadingWards(true);
      try {
        const data = await apiService.kenyaWards.getWardsBySubcounty(formData.subcounty);
        setWards(data);
        // Don't clear ward here - let user keep their selection if they change sub-county back
      } catch (error) {
        console.error('Error fetching wards:', error);
        // Only show error if dialog is open
        if (open) {
          setSnackbar({ 
            open: true, 
            message: 'Failed to load wards. Please try again.', 
            severity: 'error' 
          });
        }
      } finally {
        setLoadingWards(false);
      }
    };
    fetchWards();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.subcounty, open]);

  // Use normalized status options for consistency across the application
  const projectStatuses = [
    'Completed',
    'Ongoing',
    'Not started',
    'Stalled',
    'Under Procurement',
    'Suspended',
    'Other'
  ];

  const financialYearOptions = (allMetadata?.financialYears?.length ? allMetadata.financialYears : financialYearsFallback) || [];
  const currentFinancialYearName = formData.finYearId || '';
  const financialYearNames = [
    ...new Set([
      ...financialYearOptions.map((fy) => fy.finYearName || fy.name).filter(Boolean),
      currentFinancialYearName,
    ].filter(Boolean)),
  ];
  const sectorOptions = (allMetadata?.sectors?.length ? allMetadata.sectors : sectorsFallback) || [];
  const projectTypeOptions = (Array.isArray(allMetadata?.projectCategories) && allMetadata.projectCategories.length > 0
    ? allMetadata.projectCategories
    : projectTypesFallback) || [];
  const selectedSector = sectorOptions.find((sector) => {
    const sectorName = sector.sectorName || sector.name || '';
    return sectorName === formData.sector || sector.alias === formData.sector;
  }) || (formData.sector ? { sectorName: formData.sector, subSectors: [] } : null);
  const subSectorOptions = selectedSector?.subSectors || [];
  const selectedSubSector = subSectorOptions.find((subSector) => {
    const subSectorName = subSector.subSectorName || subSector.name || '';
    return String(subSector.id || '') === String(formData.subSectorId || '')
      || subSectorName === formData.subSector;
  }) || (formData.subSector ? { id: formData.subSectorId || '', subSectorName: formData.subSector } : null);
  const selectedProjectType = projectTypeOptions.find((category) =>
    String(category.categoryId) === String(formData.categoryId || '')
  );
  const userDepartmentScope = useMemo(() => getUserDepartmentScope(user), [user]);
  const departmentOptions = userDepartmentScope.restricted
    ? departmentCatalog.filter((department) => {
        const keys = [
          normalizeOrgKey(department?.name),
          normalizeOrgKey(department?.alias),
          ...aliasKeys(department?.alias),
        ].filter(Boolean);
        return keys.some((key) => userDepartmentScope.allowedKeys.has(key));
      })
    : departmentCatalog;
  const departmentScopeHelper = userDepartmentScope.restricted
    ? 'Limited to departments in your access scope'
    : 'Select the responsible county department';
  const selectedDepartment = departmentOptions.find((department) => {
    const departmentName = department?.name || '';
    const departmentAlias = department?.alias || '';
    return departmentName === formData.stateDepartment || departmentAlias === formData.stateDepartment;
  }) || (formData.stateDepartment ? { name: formData.stateDepartment } : null);
  const selectedDepartmentId = selectedDepartment?.departmentId || selectedDepartment?.id || '';
  const directorateOptions = selectedDepartmentId
    ? sectionCatalog.filter((section) => String(section.departmentId || section.department_id || '') === String(selectedDepartmentId))
    : sectionCatalog;
  const selectedDirectorate = directorateOptions.find((section) => {
    const sectionName = section?.name || '';
    const sectionAlias = section?.alias || '';
    return sectionName === formData.directorate || sectionAlias === formData.directorate;
  }) || (formData.directorate ? { name: formData.directorate } : null);

  useEffect(() => {
    if (!open || currentProject || !userDepartmentScope.restricted || formData.stateDepartment || departmentOptions.length !== 1) return;
    handleChange({ target: { name: 'stateDepartment', value: departmentOptions[0].name || '' } });
  }, [open, currentProject, userDepartmentScope.restricted, formData.stateDepartment, departmentOptions, handleChange]);
  const templateBudgetTotal = projectTypeScopePreview.bqTemplates.reduce((sum, line) => {
    const amount = parseMoney(line.budgetAmount ?? line.budget_amount);
    return sum + (amount || 0);
  }, 0);
  const projectBudgetAmount = parseMoney(formData.costOfProject);
  const hasTemplateBudget = templateBudgetTotal > 0;
  const isBudgetBelowTemplate = hasTemplateBudget
    && projectBudgetAmount !== null
    && projectBudgetAmount < templateBudgetTotal;

  useEffect(() => {
    if (!open || !formData.categoryId) {
      setProjectTypeScopePreview({ loading: false, error: '', milestones: [], bqTemplates: [] });
      return undefined;
    }

    let cancelled = false;
    const loadProjectTypeScope = async () => {
      setProjectTypeScopePreview((prev) => ({ ...prev, loading: true, error: '' }));
      try {
        const [milestones, bqTemplates] = await Promise.all([
          apiService.metadata.projectCategories.getMilestonesByCategory(formData.categoryId).catch((err) => {
            console.error('ProjectFormDialog: project type milestones preview failed', err);
            return [];
          }),
          apiService.metadata.projectCategories.getBqTemplatesByCategory(formData.categoryId).catch((err) => {
            console.error('ProjectFormDialog: project type BQ preview failed', err);
            return [];
          }),
        ]);
        if (!cancelled) {
          setProjectTypeScopePreview({
            loading: false,
            error: '',
            milestones: Array.isArray(milestones) ? milestones : [],
            bqTemplates: Array.isArray(bqTemplates) ? bqTemplates : [],
          });
        }
      } catch (err) {
        if (!cancelled) {
          setProjectTypeScopePreview({
            loading: false,
            error: err?.response?.data?.message || err?.message || 'Failed to load project type scope preview.',
            milestones: [],
            bqTemplates: [],
          });
        }
      }
    };
    loadProjectTypeScope();
    return () => {
      cancelled = true;
    };
  }, [open, formData.categoryId]);

  return (
    <>
    <Dialog 
      open={open} 
      onClose={handleClose} 
      fullWidth 
      maxWidth="lg"
      sx={{
        '& .MuiDialog-paper': {
          borderRadius: '12px',
          overflow: 'hidden',
          boxShadow: '0 12px 40px rgba(0, 0, 0, 0.25)',
        },
      }}
    >
      <DialogTitle sx={{ backgroundColor: theme.palette.primary.main, color: 'white', py: 1.25, fontSize: '1.1rem', fontWeight: 700 }}>
        {currentProject ? 'Edit Project' : 'Add New Project'}
      </DialogTitle>
      <DialogContent dividers sx={{ backgroundColor: theme.palette.background.default, padding: '12px 16px', maxHeight: '72vh', overflowY: 'auto' }}>
        <Typography variant="caption" sx={{ display: 'block', color: colors.grey[500], mb: 1, fontStyle: 'italic' }}>
          Fields marked with * are required.
        </Typography>
        {/* Project Basics Section */}
        <Paper 
          elevation={0} 
          sx={{ 
            p: 1.25, 
            mb: 1.5, 
            borderRadius: '10px',
            background: colorMode === 'dark' ? colors.primary[400] : colors.grey[50],
            border: `1px solid ${colorMode === 'dark' ? colors.blueAccent[700] : colors.grey[300]}`,
          }}
        >
          <Typography variant="subtitle1" sx={{ color: colors.blueAccent[600], mb: 1, fontWeight: 700, fontSize: '0.9rem' }}>
            Project Basics
          </Typography>
          <Grid container spacing={1.5}>
            <Grid item xs={12} sm={6}>
              <TextField 
                autoFocus 
                name="projectName" 
                label="Project Name" 
                type="text" 
                fullWidth 
                variant="outlined" 
                size="small"
                required
                value={formData.projectName} 
                onChange={handleChange} 
                error={!!formErrors.projectName} 
                helperText={formErrors.projectName || "Enter a descriptive name for the project"}
                placeholder="e.g., Construction of New Health Center"
                inputProps={{ maxLength: 200 }}
                sx={{
                  '& .MuiOutlinedInput-root': {
                    '& fieldset': {
                      borderColor: colors.blueAccent[600],
                      borderWidth: '2px',
                    },
                    '&:hover fieldset': {
                      borderColor: colors.blueAccent[500],
                    },
                    '&.Mui-focused fieldset': {
                      borderColor: colors.greenAccent[500],
                      borderWidth: '2px',
                    },
                  },
                                     '& .MuiInputLabel-root': {
                     color: colorMode === 'dark' ? colors.grey[100] : colors.grey[200],
                     fontWeight: 'bold',
                   },
                   '& .MuiInputBase-input': {
                     color: colorMode === 'dark' ? colors.grey[100] : colors.grey[200],
                   },
                }}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                select
                name="categoryId"
                label="Project Type"
                fullWidth
                variant="outlined"
                size="small"
                value={formData.categoryId || ''}
                onChange={handleChange}
                helperText="Used later to prepare procurement milestones and BQ scope."
                sx={{ minWidth: 200 }}
              >
                <MenuItem value="">
                  <em>No project type selected</em>
                </MenuItem>
                {projectTypeOptions.map((category) => (
                  <MenuItem key={category.categoryId} value={String(category.categoryId)}>
                    {category.categoryName}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            {formData.categoryId ? (
              <Grid item xs={12}>
                <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                  {projectTypeScopePreview.loading ? (
                    <Chip size="small" icon={<CircularProgress size={14} />} label="Loading scope..." />
                  ) : (
                    <>
                      <Chip size="small" label={`${projectTypeScopePreview.milestones.length} milestone(s)`} />
                      <Chip size="small" label={`${projectTypeScopePreview.bqTemplates.length} BQ line(s)`} />
                    </>
                  )}
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => setScopePreviewOpen(true)}
                    disabled={projectTypeScopePreview.loading}
                  >
                    View Milestones & BQ
                  </Button>
                </Stack>
              </Grid>
            ) : null}
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth variant="outlined" size="small" sx={{ minWidth: 200 }}>
                <InputLabel sx={{ color: colorMode === 'dark' ? colors.grey[100] : colors.grey[200], fontWeight: 'bold' }}>Status</InputLabel>
                <Select 
                  name="status" 
                  label="Status" 
                  value={formData.status} 
                  onChange={handleChange} 
                  inputProps={{ 'aria-label': 'Select project status' }}
                  sx={{
                    '& .MuiOutlinedInput-root': {
                      '& fieldset': {
                        borderColor: colorMode === 'dark' ? colors.blueAccent[600] : colors.blueAccent[400],
                        borderWidth: '2px',
                      },
                      '&:hover fieldset': {
                        borderColor: colorMode === 'dark' ? colors.blueAccent[500] : colors.blueAccent[300],
                      },
                      '&.Mui-focused fieldset': {
                        borderColor: colorMode === 'dark' ? colors.greenAccent[500] : colors.greenAccent[400],
                        borderWidth: '2px',
                      },
                    },
                  }}
                >
                  {projectStatuses.map(status => (
                    <MenuItem key={status} value={status}>
                      <span style={{ 
                        backgroundColor: getProjectStatusBackgroundColor(status), 
                        color: getProjectStatusTextColor(status), 
                        padding: '6px 12px', 
                        borderRadius: '8px', 
                        display: 'inline-block', 
                        minWidth: '100px', 
                        textAlign: 'center', 
                        fontWeight: 'bold',
                        fontSize: '0.875rem'
                      }}>
                        {status}
                      </span>
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField 
                name="overallProgress" 
                label="Percentage Complete (%)" 
                type="number" 
                fullWidth 
                variant="outlined" 
                size="small"
                value={formData.overallProgress || ''} 
                onChange={handleChange}
                placeholder="e.g., 45"
                error={!!formErrors.overallProgress}
                helperText={formErrors.overallProgress || "Overall project completion percentage (0-100)"}
                inputProps={{ min: 0, max: 100, step: 1 }}
                onBlur={(e) => {
                  // Validate on blur and clamp value if needed
                  const value = parseFloat(e.target.value);
                  if (!isNaN(value)) {
                    if (value < 0) {
                      handleChange({ target: { name: 'overallProgress', value: '0' } });
                    } else if (value > 100) {
                      handleChange({ target: { name: 'overallProgress', value: '100' } });
                    }
                  }
                }}
                sx={{
                  '& .MuiOutlinedInput-root': {
                    '& fieldset': {
                      borderColor: formErrors.overallProgress 
                        ? colors.redAccent[500] 
                        : (colorMode === 'dark' ? colors.blueAccent[600] : colors.blueAccent[400]),
                      borderWidth: '2px',
                    },
                    '&:hover fieldset': {
                      borderColor: formErrors.overallProgress 
                        ? colors.redAccent[600] 
                        : (colorMode === 'dark' ? colors.blueAccent[500] : colors.blueAccent[300]),
                    },
                    '&.Mui-focused fieldset': {
                      borderColor: formErrors.overallProgress 
                        ? colors.redAccent[500] 
                        : (colorMode === 'dark' ? colors.greenAccent[500] : colors.greenAccent[400]),
                      borderWidth: '2px',
                    },
                  },
                  '& .MuiInputLabel-root': {
                    color: colorMode === 'dark' ? colors.grey[100] : colors.grey[200],
                    fontWeight: 'bold',
                  },
                  '& .MuiInputBase-input': {
                    color: colorMode === 'dark' ? colors.grey[100] : colors.grey[200],
                  },
                }}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField 
                name="startDate" 
                label="Start Date" 
                type="date" 
                fullWidth 
                variant="outlined" 
                size="small"
                InputLabelProps={{ shrink: true }} 
                value={formData.startDate} 
                onChange={handleChange} 
                error={!!formErrors.startDate} 
                helperText={formErrors.startDate}
                sx={{
                  '& .MuiOutlinedInput-root': {
                    '& fieldset': {
                      borderColor: colors.blueAccent[600],
                      borderWidth: '2px',
                    },
                    '&:hover fieldset': {
                      borderColor: colors.blueAccent[500],
                    },
                    '&.Mui-focused fieldset': {
                      borderColor: colors.greenAccent[500],
                      borderWidth: '2px',
                    },
                  },
                                     '& .MuiInputLabel-root': {
                     color: colorMode === 'dark' ? colors.grey[100] : colors.grey[200],
                     fontWeight: 'bold',
                   },
                   '& .MuiInputBase-input': {
                     color: colorMode === 'dark' ? colors.grey[100] : colors.grey[200],
                   },
                }}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField 
                name="endDate" 
                label="End Date" 
                type="date" 
                fullWidth 
                variant="outlined" 
                size="small"
                InputLabelProps={{ shrink: true }} 
                value={formData.endDate} 
                onChange={handleChange} 
                error={!!formErrors.endDate || !!formErrors.date_range} 
                helperText={formErrors.endDate || formErrors.date_range}
                sx={{
                  '& .MuiOutlinedInput-root': {
                    '& fieldset': {
                      borderColor: colors.blueAccent[600],
                      borderWidth: '2px',
                    },
                    '&:hover fieldset': {
                      borderColor: colors.blueAccent[500],
                    },
                    '&.Mui-focused fieldset': {
                      borderColor: colors.greenAccent[500],
                      borderWidth: '2px',
                    },
                  },
                                     '& .MuiInputLabel-root': {
                     color: colorMode === 'dark' ? colors.grey[100] : colors.grey[200],
                     fontWeight: 'bold',
                   },
                   '& .MuiInputBase-input': {
                     color: colorMode === 'dark' ? colors.grey[100] : colors.grey[200],
                   },
                }}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                select
                name="finYearId"
                label="Financial Year"
                fullWidth
                required
                variant="outlined"
                size="small"
                value={formData.finYearId || ''}
                onChange={handleChange}
                error={!!formErrors.finYearId}
                helperText={formErrors.finYearId || 'Financial year runs from July 1 to June 30'}
                sx={{ minWidth: 200 }}
              >
                <MenuItem value="">
                  <em>Select financial year</em>
                </MenuItem>
                {financialYearNames.map((name) => (
                  <MenuItem key={name} value={name}>
                    {name}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid item xs={12}>
              <TextField 
                name="projectDescription" 
                label="Project Description" 
                type="text" 
                fullWidth 
                multiline 
                rows={2} 
                variant="outlined" 
                size="small"
                value={formData.projectDescription} 
                onChange={handleChange}
                sx={{
                  '& .MuiOutlinedInput-root': {
                    '& fieldset': {
                      borderColor: colors.blueAccent[600],
                      borderWidth: '2px',
                    },
                    '&:hover fieldset': {
                      borderColor: colors.blueAccent[500],
                    },
                    '&.Mui-focused fieldset': {
                      borderColor: colors.greenAccent[500],
                      borderWidth: '2px',
                    },
                  },
                                     '& .MuiInputLabel-root': {
                     color: colorMode === 'dark' ? colors.grey[100] : colors.grey[200],
                     fontWeight: 'bold',
                   },
                   '& .MuiInputBase-input': {
                     color: colorMode === 'dark' ? colors.grey[100] : colors.grey[200],
                   },
                }}
              />
            </Grid>
          </Grid>
        </Paper>

        {/* Classification & Ownership Section */}
        <Paper 
          elevation={0} 
          sx={{ 
            p: 1.25, 
            mb: 1.5, 
            borderRadius: '10px',
            background: colorMode === 'dark' ? colors.primary[400] : colors.grey[50],
            border: `1px solid ${colorMode === 'dark' ? colors.blueAccent[700] : colors.grey[300]}`,
          }}
        >
          <Typography variant="subtitle1" sx={{ color: colors.blueAccent[600], mb: 1, fontWeight: 700, fontSize: '0.9rem' }}>
            Classification & Ownership
          </Typography>
          <Grid container spacing={1.5}>
            <Grid item xs={12} sm={6}>
              <Autocomplete
                options={sectorOptions}
                value={selectedSector}
                loading={loadingSectorsFallback}
                onChange={(event, newValue) => {
                  const sectorName = newValue ? (newValue.sectorName || newValue.name || '') : '';
                  handleChange({ target: { name: 'sector', value: sectorName } });
                  handleChange({ target: { name: 'subSector', value: '' } });
                  handleChange({ target: { name: 'subSectorId', value: '' } });
                }}
                getOptionLabel={(option) => {
                  if (!option) return '';
                  if (typeof option === 'string') return option;
                  return option.sectorName || option.name || '';
                }}
                isOptionEqualToValue={(option, value) => {
                  const optionName = option?.sectorName || option?.name || '';
                  const valueName = value?.sectorName || value?.name || value || '';
                  return optionName === valueName;
                }}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    name="sector"
                    label="Sector"
                    required
                    variant="outlined"
                    size="small"
                    error={!!formErrors.sector}
                    helperText={formErrors.sector || (loadingSectorsFallback ? 'Loading sectors...' : 'Required; sourced from Sectors metadata')}
                    sx={{ minWidth: 200 }}
                  />
                )}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <Autocomplete
                options={subSectorOptions}
                value={selectedSubSector}
                onChange={(event, newValue) => {
                  handleChange({
                    target: {
                      name: 'subSector',
                      value: newValue ? (newValue.subSectorName || newValue.name || '') : '',
                    },
                  });
                  handleChange({
                    target: {
                      name: 'subSectorId',
                      value: newValue ? (newValue.id || '') : '',
                    },
                  });
                }}
                disabled={!selectedSector}
                getOptionLabel={(option) => {
                  if (!option) return '';
                  if (typeof option === 'string') return option;
                  return option.subSectorName || option.name || '';
                }}
                isOptionEqualToValue={(option, value) => {
                  const optionId = option?.id ? String(option.id) : '';
                  const valueId = value?.id ? String(value.id) : '';
                  const optionName = option?.subSectorName || option?.name || '';
                  const valueName = value?.subSectorName || value?.name || value || '';
                  return (optionId && optionId === valueId) || optionName === valueName;
                }}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    name="subSector"
                    label="Sub-sector"
                    variant="outlined"
                    size="small"
                    helperText={selectedSector ? 'Optional' : 'Select sector first'}
                    sx={{ minWidth: 200 }}
                  />
                )}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <Autocomplete
                options={departmentOptions}
                value={selectedDepartment}
                onChange={(event, newValue) => {
                  handleChange({ target: { name: 'stateDepartment', value: newValue ? (newValue.name || '') : '' } });
                  const nextDepartmentId = newValue?.departmentId || newValue?.id || '';
                  const currentDirectorateStillValid = !formData.directorate || sectionCatalog.some((section) => (
                    String(section.departmentId || section.department_id || '') === String(nextDepartmentId) &&
                    (section.name === formData.directorate || section.alias === formData.directorate)
                  ));
                  if (!currentDirectorateStillValid) {
                    handleChange({ target: { name: 'directorate', value: '' } });
                  }
                }}
                loading={loadingOrgCatalog}
                disabled={loadingOrgCatalog && departmentOptions.length === 0}
                getOptionLabel={(option) => {
                  if (!option) return '';
                  if (typeof option === 'string') return option;
                  return option.name || '';
                }}
                isOptionEqualToValue={(option, value) => {
                  const optionName = option?.name || option || '';
                  const valueName = value?.name || value || '';
                  return optionName === valueName;
                }}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    name="stateDepartment"
                    label="Department"
                    variant="outlined"
                    size="small"
                    helperText={formErrors.stateDepartment || departmentScopeHelper}
                    error={!!formErrors.stateDepartment}
                    sx={{
                      '& .MuiOutlinedInput-root': {
                        '& fieldset': {
                          borderColor: formErrors.stateDepartment ? colors.redAccent[500] : colors.blueAccent[600],
                          borderWidth: '2px',
                        },
                        '&:hover fieldset': {
                          borderColor: formErrors.stateDepartment ? colors.redAccent[600] : colors.blueAccent[500],
                        },
                        '&.Mui-focused fieldset': {
                          borderColor: formErrors.stateDepartment ? colors.redAccent[500] : colors.greenAccent[500],
                          borderWidth: '2px',
                        },
                      },
                      '& .MuiInputLabel-root': {
                        color: colorMode === 'dark' ? colors.grey[100] : colors.grey[200],
                        fontWeight: 'bold',
                      },
                      '& .MuiInputBase-input': {
                        color: colorMode === 'dark' ? colors.grey[100] : colors.grey[200],
                      },
                    }}
                  />
                )}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <Autocomplete
                options={directorateOptions}
                value={selectedDirectorate}
                onChange={(event, newValue) => {
                  handleChange({ target: { name: 'directorate', value: newValue ? (newValue.name || '') : '' } });
                }}
                loading={loadingOrgCatalog}
                disabled={loadingOrgCatalog && directorateOptions.length === 0}
                getOptionLabel={(option) => {
                  if (!option) return '';
                  if (typeof option === 'string') return option;
                  return option.name || '';
                }}
                isOptionEqualToValue={(option, value) => {
                  const optionName = option?.name || option || '';
                  const valueName = value?.name || value || '';
                  return optionName === valueName;
                }}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    name="directorate"
                    label="Directorate"
                    variant="outlined"
                    size="small"
                    helperText={selectedDepartment ? 'Select directorate/section under the department' : 'Select department first, or choose from all directorates'}
                    sx={{
                      '& .MuiOutlinedInput-root': {
                        '& fieldset': {
                          borderColor: colors.blueAccent[600],
                          borderWidth: '2px',
                        },
                        '&:hover fieldset': {
                          borderColor: colors.blueAccent[500],
                        },
                        '&.Mui-focused fieldset': {
                          borderColor: colors.greenAccent[500],
                          borderWidth: '2px',
                        },
                      },
                      '& .MuiInputLabel-root': {
                        color: colorMode === 'dark' ? colors.grey[100] : colors.grey[200],
                        fontWeight: 'bold',
                      },
                      '& .MuiInputBase-input': {
                        color: colorMode === 'dark' ? colors.grey[100] : colors.grey[200],
                      },
                    }}
                  />
                )}
              />
            </Grid>
          </Grid>
        </Paper>

        {/* Geographical Coverage Section */}
        <Paper 
          elevation={0} 
          sx={{ 
            p: 1.25, 
            mb: 1.5, 
            borderRadius: '10px',
            background: colorMode === 'dark' ? colors.primary[400] : colors.grey[50],
            border: `1px solid ${colorMode === 'dark' ? colors.blueAccent[700] : colors.grey[300]}`,
          }}
        >
          <Typography variant="subtitle1" sx={{ color: colors.blueAccent[600], mb: 1, fontWeight: 700, fontSize: '0.9rem' }}>
            Location
          </Typography>
          <Grid container spacing={1.5}>
            <Grid item xs={12} sm={6} md={4}>
              <Autocomplete
                options={subcounties}
                value={formData.subcounty || null}
                onChange={(event, newValue) => {
                  const newSubcounty = newValue || '';
                  handleChange({ target: { name: 'subcounty', value: newSubcounty } });
                  // Clear ward if sub-county changes
                  if (newSubcounty !== formData.subcounty && formData.ward) {
                    handleChange({ target: { name: 'ward', value: '' } });
                  }
                }}
                loading={loadingSubcounties}
                freeSolo
                sx={{ minWidth: 200 }}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    name="subcounty"
                    label="Sub-county"
                    variant="outlined"
                    size="small"
                    placeholder="Search or select sub-county"
                    sx={{
                      minWidth: 200,
                      '& .MuiOutlinedInput-root': {
                        '& fieldset': {
                          borderColor: colorMode === 'dark' ? colors.blueAccent[600] : colors.blueAccent[400],
                          borderWidth: '2px',
                        },
                        '&:hover fieldset': {
                          borderColor: colorMode === 'dark' ? colors.blueAccent[500] : colors.blueAccent[300],
                        },
                        '&.Mui-focused fieldset': {
                          borderColor: colorMode === 'dark' ? colors.greenAccent[500] : colors.greenAccent[400],
                          borderWidth: '2px',
                        },
                      },
                    }}
                  />
                )}
                filterOptions={(options, params) => {
                  const filtered = options.filter((option) =>
                    option.toLowerCase().includes(params.inputValue.toLowerCase())
                  );
                  return filtered;
                }}
              />
            </Grid>
            <Grid item xs={12} sm={6} md={4}>
              <Autocomplete
                options={wards}
                getOptionLabel={(option) => {
                  if (!option) return '';
                  if (typeof option === 'string') return option;
                  return option.name || '';
                }}
                value={wards.find(w => {
                  const wardName = typeof w === 'string' ? w : w.name || '';
                  return wardName === formData.ward;
                }) || null}
                onChange={(event, newValue) => {
                  let value = '';
                  if (newValue) {
                    value = typeof newValue === 'string' ? newValue : (newValue.name || '');
                  }
                  handleChange({ target: { name: 'ward', value } });
                }}
                loading={loadingWards}
                disabled={!formData.subcounty}
                freeSolo
                sx={{ minWidth: 200 }}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    name="ward"
                    label="Ward"
                    variant="outlined"
                    size="small"
                    placeholder={formData.subcounty ? "Search or select ward" : "Select sub-county first"}
                    sx={{
                      minWidth: 200,
                      '& .MuiOutlinedInput-root': {
                        '& fieldset': {
                          borderColor: colorMode === 'dark' ? colors.blueAccent[600] : colors.blueAccent[400],
                          borderWidth: '2px',
                        },
                        '&:hover fieldset': {
                          borderColor: colorMode === 'dark' ? colors.blueAccent[500] : colors.blueAccent[300],
                        },
                        '&.Mui-focused fieldset': {
                          borderColor: colorMode === 'dark' ? colors.greenAccent[500] : colors.greenAccent[400],
                          borderWidth: '2px',
                        },
                      },
                    }}
                  />
                )}
                filterOptions={(options, params) => {
                  const filtered = options.filter((option) => {
                    const name = typeof option === 'string' ? option : (option.name || '');
                    return name.toLowerCase().includes(params.inputValue.toLowerCase());
                  });
                  return filtered;
                }}
                isOptionEqualToValue={(option, value) => {
                  const optionName = typeof option === 'string' ? option : (option.name || '');
                  const valueName = typeof value === 'string' ? value : (value.name || '');
                  return optionName === valueName;
                }}
              />
            </Grid>
            <Grid item xs={12} sm={6} md={4}>
              <Autocomplete
                options={villageOptions}
                value={formData.village || ''}
                inputValue={formData.village || ''}
                onInputChange={(event, newInputValue) => {
                  handleChange({ target: { name: 'village', value: newInputValue || '' } });
                }}
                onChange={(event, newValue) => {
                  handleChange({ target: { name: 'village', value: newValue || '' } });
                }}
                freeSolo
                sx={{ minWidth: 200 }}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    name="village"
                    label="Village"
                    variant="outlined"
                    size="small"
                    placeholder="Type village name"
                    helperText="Free text; existing villages are suggested"
                    sx={{
                      minWidth: 200,
                      '& .MuiOutlinedInput-root': {
                        '& fieldset': {
                          borderColor: colorMode === 'dark' ? colors.blueAccent[600] : colors.blueAccent[400],
                          borderWidth: '2px',
                        },
                        '&:hover fieldset': {
                          borderColor: colorMode === 'dark' ? colors.blueAccent[500] : colors.blueAccent[300],
                        },
                        '&.Mui-focused fieldset': {
                          borderColor: colorMode === 'dark' ? colors.greenAccent[500] : colors.greenAccent[400],
                          borderWidth: '2px',
                        },
                      },
                    }}
                  />
                )}
                filterOptions={(options, params) => {
                  const input = String(params.inputValue || '').toLowerCase();
                  return options.filter((option) => String(option || '').toLowerCase().includes(input));
                }}
              />
            </Grid>
          </Grid>
        </Paper>


        {/* Budget & Procurement Section */}
        <Paper 
          elevation={0} 
          sx={{ 
            p: 1.25, 
            mb: 1.5, 
            borderRadius: '10px',
            background: colorMode === 'dark' ? colors.primary[400] : colors.grey[50],
            border: `1px solid ${colorMode === 'dark' ? colors.blueAccent[700] : colors.grey[300]}`,
          }}
        >
          <Typography variant="subtitle1" sx={{ color: colors.blueAccent[600], mb: 1, fontWeight: 700, fontSize: '0.9rem' }}>
            Budget & Procurement
          </Typography>
          <Grid container spacing={1.5}>
            <Grid item xs={12} sm={4}>
              <TextField
                name="costOfProject"
                label="Allocated Budget (KES)"
                type="number"
                fullWidth
                variant="outlined"
                size="small"
                value={formData.costOfProject ?? ''}
                onChange={handleChange}
                placeholder="e.g., 70000000"
                helperText="Total budget approved for the project"
                inputProps={{ min: 0, step: 'any' }}
                sx={{
                  '& .MuiOutlinedInput-root': {
                    '& fieldset': {
                      borderColor: colors.blueAccent[600],
                      borderWidth: '2px',
                    },
                    '&:hover fieldset': {
                      borderColor: colors.blueAccent[500],
                    },
                    '&.Mui-focused fieldset': {
                      borderColor: colors.greenAccent[500],
                      borderWidth: '2px',
                    },
                  },
                  '& .MuiInputLabel-root': {
                    color: colorMode === 'dark' ? colors.grey[100] : colors.grey[200],
                    fontWeight: 'bold',
                  },
                  '& .MuiInputBase-input': {
                    color: colorMode === 'dark' ? colors.grey[100] : colors.grey[200],
                  },
                }}
              />
            </Grid>

            <Grid item xs={12} sm={4}>
              <TextField
                name="Contracted"
                label="Contracted Amount (KES)"
                type="number"
                fullWidth
                variant="outlined"
                size="small"
                value={formData.Contracted ?? ''}
                onChange={handleChange}
                placeholder="e.g., 65000000"
                helperText="Contract value, if already awarded"
                inputProps={{ min: 0, step: 'any' }}
                sx={{
                  '& .MuiOutlinedInput-root': {
                    '& fieldset': {
                      borderColor: colors.blueAccent[600],
                      borderWidth: '2px',
                    },
                    '&:hover fieldset': {
                      borderColor: colors.blueAccent[500],
                    },
                    '&.Mui-focused fieldset': {
                      borderColor: colors.greenAccent[500],
                      borderWidth: '2px',
                    },
                  },
                  '& .MuiInputLabel-root': {
                    color: colorMode === 'dark' ? colors.grey[100] : colors.grey[200],
                    fontWeight: 'bold',
                  },
                  '& .MuiInputBase-input': {
                    color: colorMode === 'dark' ? colors.grey[100] : colors.grey[200],
                  },
                }}
              />
            </Grid>

            <Grid item xs={12} sm={4}>
              <TextField
                name="paidOut"
                label="Paid Amount (KES)"
                type="number"
                fullWidth
                variant="outlined"
                size="small"
                value={formData.paidOut ?? ''}
                onChange={handleChange}
                placeholder="e.g., 30000000"
                helperText="Amount paid against the project budget"
                inputProps={{ min: 0, step: 'any' }}
                sx={{
                  '& .MuiOutlinedInput-root': {
                    '& fieldset': {
                      borderColor: colors.blueAccent[600],
                      borderWidth: '2px',
                    },
                    '&:hover fieldset': {
                      borderColor: colors.blueAccent[500],
                    },
                    '&.Mui-focused fieldset': {
                      borderColor: colors.greenAccent[500],
                      borderWidth: '2px',
                    },
                  },
                  '& .MuiInputLabel-root': {
                    color: colorMode === 'dark' ? colors.grey[100] : colors.grey[200],
                    fontWeight: 'bold',
                  },
                  '& .MuiInputBase-input': {
                    color: colorMode === 'dark' ? colors.grey[100] : colors.grey[200],
                  },
                }}
              />
            </Grid>

            <Grid item xs={12}>
              <Paper
                variant="outlined"
                sx={{
                  p: 1.25,
                  borderRadius: 2,
                  bgcolor: colorMode === 'dark' ? colors.primary[500] : '#fbfdff',
                  borderColor: isBudgetBelowTemplate ? theme.palette.warning.main : 'divider',
                }}
              >
                <Stack
                  direction={{ xs: 'column', md: 'row' }}
                  spacing={1}
                  alignItems={{ xs: 'stretch', md: 'center' }}
                  justifyContent="space-between"
                >
                  <Box>
                    <Typography variant="subtitle2" fontWeight={700}>
                      Project Type BQ Estimate
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {selectedProjectType
                        ? `${selectedProjectType.categoryName} template estimate. Actual scope is prepared later in Procurement Management.`
                        : 'Select a Project Type to see its estimated BQ budget.'}
                    </Typography>
                  </Box>
                  <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" useFlexGap>
                    <Chip
                      size="small"
                      color={isBudgetBelowTemplate ? 'warning' : 'default'}
                      label={`BQ Estimate: ${selectedProjectType ? fmtKes(templateBudgetTotal) : '-'}`}
                    />
                    {selectedProjectType ? (
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={() => setScopePreviewOpen(true)}
                        disabled={projectTypeScopePreview.loading}
                      >
                        View Milestones & BQ
                      </Button>
                    ) : null}
                  </Stack>
                </Stack>
                {selectedProjectType && projectTypeScopePreview.error ? (
                  <Alert severity="warning" variant="outlined" sx={{ mt: 1 }}>
                    {projectTypeScopePreview.error}
                  </Alert>
                ) : selectedProjectType && projectBudgetAmount === null ? (
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                    Enter the allocated budget above to compare it against this template estimate.
                  </Typography>
                ) : selectedProjectType && isBudgetBelowTemplate ? (
                  <Alert severity="warning" variant="outlined" sx={{ mt: 1 }}>
                    The allocated project budget ({fmtKes(projectBudgetAmount)}) is below the project type BQ estimate ({fmtKes(templateBudgetTotal)}).
                  </Alert>
                ) : selectedProjectType && hasTemplateBudget ? (
                  <Alert severity="success" variant="outlined" sx={{ mt: 1 }}>
                    The allocated project budget can cover the current project type BQ estimate.
                  </Alert>
                ) : null}
              </Paper>
            </Grid>

            <Grid item xs={12} sm={6}>
              <TextField
                name="tenderContractNo"
                label="Tender/Contract No"
                type="text"
                fullWidth
                variant="outlined"
                size="small"
                required={!currentProject}
                value={formData.tenderContractNo || ''}
                onChange={handleChange}
                error={Boolean(formErrors.tenderContractNo)}
                placeholder="e.g., KSM/FIN/ONT/001/2026"
                helperText={formErrors.tenderContractNo || 'Tender or contract reference number'}
                inputProps={{ maxLength: 120 }}
                sx={{
                  '& .MuiOutlinedInput-root': {
                    '& fieldset': {
                      borderColor: colors.blueAccent[600],
                      borderWidth: '2px',
                    },
                    '&:hover fieldset': {
                      borderColor: colors.blueAccent[500],
                    },
                    '&.Mui-focused fieldset': {
                      borderColor: colors.greenAccent[500],
                      borderWidth: '2px',
                    },
                  },
                  '& .MuiInputLabel-root': {
                    color: colorMode === 'dark' ? colors.grey[100] : colors.grey[200],
                    fontWeight: 'bold',
                  },
                  '& .MuiInputBase-input': {
                    color: colorMode === 'dark' ? colors.grey[100] : colors.grey[200],
                  },
                }}
              />
            </Grid>
          </Grid>
        </Paper>
      </DialogContent>
      <DialogActions 
        sx={{ 
          padding: '12px 16px', 
          borderTop: colorMode === 'dark' 
            ? `1px solid ${colors.blueAccent[700]}`
            : `1px solid ${colors.blueAccent[300]}`,
          background: colorMode === 'dark'
            ? `linear-gradient(135deg, ${colors.primary[500]}, ${colors.primary[600]})`
            : `linear-gradient(135deg, ${colors.grey[800]}, ${colors.grey[700]})`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          boxShadow: colorMode === 'dark'
            ? '0 -4px 20px rgba(0, 0, 0, 0.3)'
            : '0 -2px 10px rgba(0, 0, 0, 0.1)'
        }}
      >
        <Button 
          onClick={handleClose} 
          variant="outlined"
          size="small"
          sx={{
            borderColor: colorMode === 'dark' ? colors.blueAccent[600] : colors.blueAccent[400],
            color: colorMode === 'dark' ? colors.blueAccent[600] : colors.blueAccent[400],
            fontWeight: 'bold',
            px: 2.5,
            py: 0.9,
            borderRadius: '8px',
            borderWidth: '1.5px',
            textTransform: 'none',
            fontSize: '0.9rem',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
            '&:hover': {
              borderColor: colorMode === 'dark' ? colors.blueAccent[500] : colors.blueAccent[300],
              backgroundColor: colorMode === 'dark' ? colors.blueAccent[500] : colors.blueAccent[300],
              color: 'white',
              transform: 'translateY(-1px)',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.25)',
            },
            transition: 'all 0.2s ease-in-out'
          }}
        >
          Cancel
        </Button>
        <Button 
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            handleSubmit();
          }} 
          variant="contained" 
          disabled={loading}
          size="small"
          sx={{
            background: colorMode === 'dark'
              ? `linear-gradient(135deg, ${colors.greenAccent[600]}, ${colors.greenAccent[500]})`
              : `linear-gradient(135deg, ${colors.greenAccent[500]}, ${colors.greenAccent[400]})`,
            color: 'white',
            fontWeight: 'bold',
            px: 3,
            py: 0.9,
            borderRadius: '8px',
            textTransform: 'none',
            fontSize: '0.9rem',
            boxShadow: colorMode === 'dark'
              ? '0 4px 16px rgba(0, 0, 0, 0.25)'
              : '0 3px 12px rgba(0, 0, 0, 0.2)',
            '&:hover': {
              background: colorMode === 'dark'
                ? `linear-gradient(135deg, ${colors.greenAccent[700]}, ${colors.greenAccent[600]})`
                : `linear-gradient(135deg, ${colors.greenAccent[600]}, ${colors.greenAccent[500]})`,
              transform: 'translateY(-1px)',
              boxShadow: colorMode === 'dark'
                ? '0 6px 24px rgba(0, 0, 0, 0.35)'
                : '0 5px 18px rgba(0, 0, 0, 0.3)',
            },
            '&:disabled': {
              background: colorMode === 'dark' ? colors.grey[600] : colors.grey[500],
              color: colorMode === 'dark' ? colors.grey[300] : colors.grey[200],
              boxShadow: 'none',
              transform: 'none'
            },
            transition: 'all 0.2s ease-in-out'
          }}
        >
          {loading ? 'Processing...' : (currentProject ? 'Update Project' : 'Create Project')}
        </Button>
      </DialogActions>
    </Dialog>
    <Dialog
      open={scopePreviewOpen}
      onClose={() => setScopePreviewOpen(false)}
      fullWidth
      maxWidth="md"
      scroll="paper"
      aria-labelledby="project-type-scope-preview-title"
    >
      <DialogTitle id="project-type-scope-preview-title">
        {selectedProjectType?.categoryName || 'Project Type'} Milestones & BQ Preview
      </DialogTitle>
      <DialogContent dividers>
        {projectTypeScopePreview.loading ? (
          <Stack direction="row" spacing={1} alignItems="center" sx={{ py: 2 }}>
            <CircularProgress size={20} />
            <Typography variant="body2" color="text.secondary">
              Loading milestone and BQ templates...
            </Typography>
          </Stack>
        ) : projectTypeScopePreview.error ? (
          <Alert severity="warning" variant="outlined">
            {projectTypeScopePreview.error}
          </Alert>
        ) : (
          <Stack spacing={2}>
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
              <Chip size="small" label={`Milestones: ${projectTypeScopePreview.milestones.length}`} />
              <Chip size="small" label={`BQ Lines: ${projectTypeScopePreview.bqTemplates.length}`} />
              <Chip size="small" label={`BQ Estimate: ${fmtKes(templateBudgetTotal)}`} />
            </Stack>

            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.75 }}>
                Milestone Templates
              </Typography>
              <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 260 }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell><strong>#</strong></TableCell>
                      <TableCell><strong>Milestone</strong></TableCell>
                      <TableCell><strong>Description</strong></TableCell>
                      <TableCell align="right"><strong>Target</strong></TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {projectTypeScopePreview.milestones.length ? (
                      projectTypeScopePreview.milestones.map((milestone, index) => (
                        <TableRow key={milestone.milestoneId || `${milestone.milestoneName}-${index}`}>
                          <TableCell>{milestone.sequenceOrder || index + 1}</TableCell>
                          <TableCell>{milestone.milestoneName}</TableCell>
                          <TableCell>{milestone.description || '-'}</TableCell>
                          <TableCell align="right">
                            {[fmtNumber(milestone.achievement_value ?? milestone.achievementValue), milestone.unit_of_measure ?? milestone.unitOfMeasure]
                              .filter((part) => part && part !== '-')
                              .join(' ') || '-'}
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={4} align="center">No milestones configured.</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>

            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.75 }}>
                BQ Template Estimate
              </Typography>
              <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 300 }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell><strong>Activity</strong></TableCell>
                      <TableCell><strong>Milestone</strong></TableCell>
                      <TableCell align="right"><strong>Qty</strong></TableCell>
                      <TableCell align="right"><strong>Unit Cost</strong></TableCell>
                      <TableCell align="right"><strong>Budget</strong></TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {projectTypeScopePreview.bqTemplates.length ? (
                      projectTypeScopePreview.bqTemplates.map((line, index) => (
                        <TableRow key={line.templateId || `${line.activityName}-${index}`}>
                          <TableCell>{line.activityName}</TableCell>
                          <TableCell>{line.milestoneName || '-'}</TableCell>
                          <TableCell align="right">
                            {[fmtNumber(line.quantity), line.unitOfMeasure ?? line.unit_of_measure]
                              .filter((part) => part && part !== '-')
                              .join(' ') || '-'}
                          </TableCell>
                          <TableCell align="right">{fmtKes(line.unitCost ?? line.unit_cost)}</TableCell>
                          <TableCell align="right">{fmtKes(line.budgetAmount ?? line.budget_amount)}</TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={5} align="center">No BQ template lines configured.</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>

            <Typography variant="caption" color="text.secondary">
              This is a read-only template preview. Procurement will create the actual project scope and BQ from this project type when the project reaches Procurement Management.
            </Typography>
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button variant="contained" onClick={() => setScopePreviewOpen(false)}>
          Close
        </Button>
      </DialogActions>
    </Dialog>
    </>
  );
};

export default ProjectFormDialog;
