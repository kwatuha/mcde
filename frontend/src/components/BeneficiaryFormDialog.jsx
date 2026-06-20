import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  MenuItem,
  TextField,
  Typography,
} from '@mui/material';
import { createFilterOptions } from '@mui/material/Autocomplete';
import apiService from '../api';

const DEFAULT_COUNTY = 'Machakos';

const GROUP_TYPES = [
  'SHG', 'CBO', 'Farmer Group', 'Youth Group', 'Women Group',
  'Cooperative', 'School', 'Health Facility', 'Market Group', 'Other',
];

const LOCATION_AUTOCOMPLETE_PROPS = {
  fullWidth: true,
  sx: { minWidth: 260 },
  slotProps: { paper: { sx: { minWidth: 260 } } },
};

const LINK_AUTOCOMPLETE_PROPS = {
  fullWidth: true,
  autoHighlight: true,
  openOnFocus: true,
  clearOnEscape: true,
  sx: { minWidth: 260 },
  slotProps: { paper: { sx: { minWidth: 320 } } },
};

const getProjectOptionId = (project) => project?.projectId ?? project?.id ?? null;

const getProjectOptionLabel = (project) => {
  const projectId = getProjectOptionId(project);
  const projectName = project?.projectName || project?.name || `Project ${projectId || ''}`;
  const projectCode = project?.projectCode || project?.project_code || project?.code || '';
  return projectCode ? `${projectName} (${projectCode})` : projectName;
};

const filterProjectOptions = createFilterOptions({
  stringify: (project) => [
    getProjectOptionLabel(project),
    project?.projectName,
    project?.name,
    project?.projectCode,
    project?.project_code,
    project?.code,
    project?.departmentName,
    project?.wardNames,
    project?.subcountyNames,
    String(getProjectOptionId(project) || ''),
  ].filter(Boolean).join(' '),
});

const getProgrammeOptionId = (programme) => programme?.programmeId ?? null;

const getProgrammeOptionLabel = (programme) => {
  const id = getProgrammeOptionId(programme);
  const name = programme?.name || `Programme ${id || ''}`;
  const sector = programme?.sector ? ` · ${programme.sector}` : '';
  return `${name}${sector}`;
};

const filterProgrammeOptions = createFilterOptions({
  stringify: (programme) => [
    getProgrammeOptionLabel(programme),
    programme?.name,
    programme?.sector,
    programme?.coverageSummary,
    String(getProgrammeOptionId(programme) || ''),
  ].filter(Boolean).join(' '),
});

const getSiteOptionId = (site) => site?.siteId ?? null;

const getSiteOptionLabel = (site) => {
  const name = site?.siteName || `Site ${getSiteOptionId(site) || ''}`;
  const location = [site?.subcounty, site?.ward].filter(Boolean).join(' · ');
  return location ? `${name} (${location})` : name;
};

const filterSiteOptions = createFilterOptions({
  stringify: (site) => [
    getSiteOptionLabel(site),
    site?.siteName,
    site?.subcounty,
    site?.ward,
    String(getSiteOptionId(site) || ''),
  ].filter(Boolean).join(' '),
});

const emptyForm = {
  beneficiaryType: 'individual',
  registryCode: '',
  displayName: '',
  firstName: '',
  lastName: '',
  gender: '',
  age: '',
  idNumber: '',
  phone: '',
  email: '',
  groupType: '',
  memberCount: '',
  leadContactName: '',
  leadContactPhone: '',
  county: DEFAULT_COUNTY,
  subcounty: '',
  ward: '',
  village: '',
  projectId: '',
  rriProgrammeId: '',
  rriSiteId: '',
  sector: '',
  enrollmentDate: '',
  notes: '',
};

function optionLabel(option) {
  if (typeof option === 'string') return option;
  return option?.name || option?.wardName || '';
}

export default function BeneficiaryFormDialog({ open, onClose, beneficiary, onSaved }) {
  const [form, setForm] = useState(emptyForm);
  const [types, setTypes] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [subcountyOptions, setSubcountyOptions] = useState([]);
  const [wardOptions, setWardOptions] = useState([]);
  const [villageOptions, setVillageOptions] = useState([]);
  const [loadingSubcounties, setLoadingSubcounties] = useState(false);
  const [loadingWards, setLoadingWards] = useState(false);
  const [loadingVillages, setLoadingVillages] = useState(false);
  const [projects, setProjects] = useState([]);
  const [rriProgrammes, setRriProgrammes] = useState([]);
  const [rriSites, setRriSites] = useState([]);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [loadingProgrammes, setLoadingProgrammes] = useState(false);
  const [loadingSites, setLoadingSites] = useState(false);

  useEffect(() => {
    if (!open) return;
    apiService.beneficiaries.getTypes().then((data) => setTypes(data?.types || [])).catch(() => setTypes([]));
    if (beneficiary) {
      setForm({
        ...emptyForm,
        beneficiaryType: beneficiary.beneficiaryType || 'individual',
        registryCode: beneficiary.registryCode || '',
        displayName: beneficiary.displayName || '',
        firstName: beneficiary.firstName || '',
        lastName: beneficiary.lastName || '',
        gender: beneficiary.gender || '',
        age: beneficiary.age ?? '',
        idNumber: beneficiary.idNumber || '',
        phone: beneficiary.phone || '',
        email: beneficiary.email || '',
        groupType: beneficiary.groupType || '',
        memberCount: beneficiary.memberCount ?? '',
        leadContactName: beneficiary.leadContactName || '',
        leadContactPhone: beneficiary.leadContactPhone || '',
        county: DEFAULT_COUNTY,
        subcounty: beneficiary.subcounty || beneficiary.subCounty || '',
        ward: beneficiary.ward || '',
        village: beneficiary.village || '',
        projectId: beneficiary.projectId ?? '',
        rriProgrammeId: beneficiary.rriProgrammeId ?? '',
        rriSiteId: beneficiary.rriSiteId ?? '',
        sector: beneficiary.sector || '',
        enrollmentDate: beneficiary.enrollmentDate || '',
        notes: beneficiary.notes || '',
      });
    } else {
      setForm(emptyForm);
    }
    setError('');
  }, [open, beneficiary]);

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    (async () => {
      setLoadingSubcounties(true);
      try {
        let list = [];
        if (typeof apiService.kenyaWards?.getCatalogSubcounties === 'function') {
          list = await apiService.kenyaWards.getCatalogSubcounties(DEFAULT_COUNTY);
        }
        if (!Array.isArray(list) || list.length === 0) {
          list = await apiService.kenyaWards.getSubcounties(DEFAULT_COUNTY);
        }
        if (!cancelled) setSubcountyOptions(Array.isArray(list) ? list.filter(Boolean) : []);
      } catch {
        if (!cancelled) setSubcountyOptions([]);
      } finally {
        if (!cancelled) setLoadingSubcounties(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    (async () => {
      setLoadingProjects(true);
      setLoadingProgrammes(true);
      try {
        const [projectResult, programmeResult] = await Promise.allSettled([
          apiService.projects.getProjects({ limit: 5000 }),
          apiService.rri.listProgrammes(),
        ]);
        if (!cancelled && projectResult.status === 'fulfilled') {
          const list = Array.isArray(projectResult.value?.projects)
            ? projectResult.value.projects
            : Array.isArray(projectResult.value) ? projectResult.value : [];
          setProjects(list);
        } else if (!cancelled) {
          setProjects([]);
        }
        if (!cancelled && programmeResult.status === 'fulfilled') {
          setRriProgrammes(Array.isArray(programmeResult.value?.rows) ? programmeResult.value.rows : []);
        } else if (!cancelled) {
          setRriProgrammes([]);
        }
      } finally {
        if (!cancelled) {
          setLoadingProjects(false);
          setLoadingProgrammes(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [open]);

  useEffect(() => {
    if (!open || !beneficiary?.projectId) return undefined;
    const projectId = Number(beneficiary.projectId);
    if (!Number.isFinite(projectId)) return undefined;
    if (projects.some((project) => Number(getProjectOptionId(project)) === projectId)) return undefined;

    let cancelled = false;
    (async () => {
      try {
        const project = await apiService.projects.getProjectById(projectId);
        if (!cancelled && project) {
          setProjects((prev) => {
            if (prev.some((item) => Number(getProjectOptionId(item)) === projectId)) return prev;
            return [...prev, project];
          });
        }
      } catch {
        // Keep form usable even if the linked project cannot be loaded.
      }
    })();
    return () => { cancelled = true; };
  }, [open, beneficiary?.projectId, projects]);

  useEffect(() => {
    if (!open || !beneficiary?.rriProgrammeId) return undefined;
    const programmeId = Number(beneficiary.rriProgrammeId);
    if (!Number.isFinite(programmeId)) return undefined;
    if (rriProgrammes.some((programme) => Number(getProgrammeOptionId(programme)) === programmeId)) {
      return undefined;
    }

    let cancelled = false;
    (async () => {
      try {
        const detail = await apiService.rri.getProgramme(programmeId);
        const programme = detail?.programme || detail;
        if (!cancelled && programme?.programmeId) {
          setRriProgrammes((prev) => {
            if (prev.some((item) => Number(getProgrammeOptionId(item)) === programmeId)) return prev;
            return [...prev, programme];
          });
        }
      } catch {
        // Keep form usable even if the linked programme cannot be loaded.
      }
    })();
    return () => { cancelled = true; };
  }, [open, beneficiary?.rriProgrammeId, rriProgrammes]);

  const loadRriSites = useCallback(async (programmeId) => {
    const id = Number(programmeId);
    if (!Number.isFinite(id)) {
      setRriSites([]);
      return;
    }
    setLoadingSites(true);
    try {
      const detail = await apiService.rri.getProgramme(id);
      setRriSites(Array.isArray(detail?.sites) ? detail.sites : []);
    } catch {
      setRriSites([]);
    } finally {
      setLoadingSites(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    if (form.rriProgrammeId) {
      loadRriSites(form.rriProgrammeId);
    } else {
      setRriSites([]);
    }
  }, [open, form.rriProgrammeId, loadRriSites]);

  const loadWards = useCallback(async (subcounty) => {
    const key = String(subcounty || '').trim();
    if (!key) {
      setWardOptions([]);
      return;
    }
    setLoadingWards(true);
    try {
      let list = [];
      if (typeof apiService.kenyaWards?.getCatalogWardsBySubcounty === 'function') {
        list = await apiService.kenyaWards.getCatalogWardsBySubcounty(key, DEFAULT_COUNTY);
      }
      if (!Array.isArray(list) || list.length === 0) {
        list = await apiService.kenyaWards.getWardsBySubcounty(key);
      }
      const values = (Array.isArray(list) ? list : [])
        .map((item) => optionLabel(item))
        .filter(Boolean);
      setWardOptions(values);
    } catch {
      setWardOptions([]);
    } finally {
      setLoadingWards(false);
    }
  }, []);

  const loadVillages = useCallback(async (subcounty, ward) => {
    const sub = String(subcounty || '').trim();
    const w = String(ward || '').trim();
    if (!sub || !w) {
      setVillageOptions([]);
      return;
    }
    setLoadingVillages(true);
    try {
      const list = await apiService.kenyaWards.getVillages({
        county: DEFAULT_COUNTY,
        subcounty: sub,
        ward: w,
      });
      setVillageOptions(Array.isArray(list) ? list.filter(Boolean) : []);
    } catch {
      setVillageOptions([]);
    } finally {
      setLoadingVillages(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    if (form.subcounty) {
      loadWards(form.subcounty);
    } else {
      setWardOptions([]);
    }
  }, [open, form.subcounty, loadWards]);

  useEffect(() => {
    if (!open) return;
    if (form.subcounty && form.ward) {
      loadVillages(form.subcounty, form.ward);
    } else {
      setVillageOptions([]);
    }
  }, [open, form.subcounty, form.ward, loadVillages]);

  const isGroupLike = useMemo(
    () => ['group', 'household', 'institution'].includes(form.beneficiaryType),
    [form.beneficiaryType],
  );

  const selectedProject = useMemo(
    () => projects.find((project) => String(getProjectOptionId(project)) === String(form.projectId)) || null,
    [projects, form.projectId],
  );

  const selectedProgramme = useMemo(
    () => rriProgrammes.find((programme) => String(getProgrammeOptionId(programme)) === String(form.rriProgrammeId)) || null,
    [rriProgrammes, form.rriProgrammeId],
  );

  const selectedSite = useMemo(
    () => rriSites.find((site) => String(getSiteOptionId(site)) === String(form.rriSiteId)) || null,
    [rriSites, form.rriSiteId],
  );

  const handleProjectChange = (_, value) => {
    setForm((prev) => ({
      ...prev,
      projectId: value ? String(getProjectOptionId(value) || '') : '',
    }));
  };

  const handleProgrammeChange = (_, value) => {
    setForm((prev) => ({
      ...prev,
      rriProgrammeId: value ? String(getProgrammeOptionId(value) || '') : '',
      rriSiteId: '',
    }));
  };

  const handleSiteChange = (_, value) => {
    setForm((prev) => ({
      ...prev,
      rriSiteId: value ? String(getSiteOptionId(value) || '') : '',
    }));
  };

  const handleChange = (field) => (event) => {
    setForm((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const handleSubcountyChange = (_, value) => {
    setForm((prev) => ({
      ...prev,
      subcounty: value || '',
      ward: '',
      village: '',
    }));
  };

  const handleWardChange = (_, value) => {
    setForm((prev) => ({
      ...prev,
      ward: value || '',
      village: '',
    }));
  };

  const handleVillageChange = (_, value) => {
    setForm((prev) => ({ ...prev, village: value || '' }));
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      const payload = {
        ...form,
        county: DEFAULT_COUNTY,
        beneficiaryId: beneficiary?.beneficiaryId,
        age: form.age !== '' ? Number(form.age) : null,
        memberCount: form.memberCount !== '' ? Number(form.memberCount) : null,
        projectId: form.projectId !== '' ? Number(form.projectId) : null,
        rriProgrammeId: form.rriProgrammeId !== '' ? Number(form.rriProgrammeId) : null,
        rriSiteId: form.rriSiteId !== '' ? Number(form.rriSiteId) : null,
      };
      if (beneficiary?.beneficiaryId) {
        await apiService.beneficiaries.update(beneficiary.beneficiaryId, payload);
      } else {
        await apiService.beneficiaries.create(payload);
      }
      onSaved?.();
      onClose?.();
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Failed to save beneficiary.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>{beneficiary ? 'Edit beneficiary' : 'Add beneficiary'}</DialogTitle>
      <DialogContent>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <Grid container spacing={2} sx={{ mt: 0.5 }}>
          <Grid item xs={12} sm={6}>
            <TextField select fullWidth sx={{ minWidth: 260 }} label="Beneficiary type" value={form.beneficiaryType} onChange={handleChange('beneficiaryType')}>
              {(types.length ? types : [{ typeCode: 'individual', label: 'Individual' }]).map((t) => (
                <MenuItem key={t.typeCode} value={t.typeCode}>{t.label || t.typeCode}</MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField fullWidth label="Registry code (optional)" value={form.registryCode} onChange={handleChange('registryCode')} />
          </Grid>
          <Grid item xs={12}>
            <TextField fullWidth required label="Display name" value={form.displayName} onChange={handleChange('displayName')} />
          </Grid>
          {!isGroupLike && (
            <>
              <Grid item xs={12} sm={6}>
                <TextField fullWidth label="First name" value={form.firstName} onChange={handleChange('firstName')} />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField fullWidth label="Last name" value={form.lastName} onChange={handleChange('lastName')} />
              </Grid>
              <Grid item xs={12} sm={4}>
                <TextField select fullWidth sx={{ minWidth: 260 }} label="Gender" value={form.gender} onChange={handleChange('gender')}>
                  <MenuItem value="">—</MenuItem>
                  {['Male', 'Female', 'Other'].map((g) => <MenuItem key={g} value={g}>{g}</MenuItem>)}
                </TextField>
              </Grid>
              <Grid item xs={12} sm={4}>
                <TextField fullWidth type="number" label="Age" value={form.age} onChange={handleChange('age')} />
              </Grid>
              <Grid item xs={12} sm={4}>
                <TextField fullWidth label="ID number" value={form.idNumber} onChange={handleChange('idNumber')} />
              </Grid>
            </>
          )}
          {isGroupLike && (
            <>
              <Grid item xs={12} sm={6}>
                <Autocomplete
                  freeSolo
                  {...LOCATION_AUTOCOMPLETE_PROPS}
                  options={GROUP_TYPES}
                  value={form.groupType}
                  onChange={(_, v) => setForm((p) => ({ ...p, groupType: v || '' }))}
                  onInputChange={(_, v) => setForm((p) => ({ ...p, groupType: v || '' }))}
                  renderInput={(params) => <TextField {...params} label="Group type" />}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField fullWidth required type="number" label="Member count" value={form.memberCount} onChange={handleChange('memberCount')} />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField fullWidth label="Lead contact name" value={form.leadContactName} onChange={handleChange('leadContactName')} />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField fullWidth label="Lead contact phone" value={form.leadContactPhone} onChange={handleChange('leadContactPhone')} />
              </Grid>
            </>
          )}
          <Grid item xs={12} sm={6}>
            <TextField fullWidth label="Phone" value={form.phone} onChange={handleChange('phone')} />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField fullWidth label="Email" value={form.email} onChange={handleChange('email')} />
          </Grid>

          <Grid item xs={12}>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
              Location — {DEFAULT_COUNTY} County
            </Typography>
          </Grid>
          <Grid item xs={12} sm={4}>
            <Autocomplete
              {...LOCATION_AUTOCOMPLETE_PROPS}
              options={subcountyOptions}
              value={form.subcounty || null}
              onChange={handleSubcountyChange}
              loading={loadingSubcounties}
              renderInput={(params) => (
                <TextField {...params} label="Sub-County" placeholder="Select sub-county" />
              )}
            />
          </Grid>
          <Grid item xs={12} sm={4}>
            <Autocomplete
              freeSolo
              {...LOCATION_AUTOCOMPLETE_PROPS}
              options={wardOptions}
              value={form.ward || ''}
              inputValue={form.ward || ''}
              onInputChange={(_, value) => setForm((prev) => ({ ...prev, ward: value || '', village: prev.ward === value ? prev.village : '' }))}
              onChange={handleWardChange}
              loading={loadingWards}
              disabled={!form.subcounty}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Ward"
                  placeholder={form.subcounty ? 'Select ward' : 'Select sub-county first'}
                />
              )}
            />
          </Grid>
          <Grid item xs={12} sm={4}>
            <Autocomplete
              freeSolo
              {...LOCATION_AUTOCOMPLETE_PROPS}
              options={villageOptions}
              value={form.village || ''}
              inputValue={form.village || ''}
              onInputChange={(_, value) => setForm((prev) => ({ ...prev, village: value || '' }))}
              onChange={handleVillageChange}
              loading={loadingVillages}
              disabled={!form.subcounty || !form.ward}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Village"
                  placeholder={form.ward ? 'Select or type village' : 'Select ward first'}
                />
              )}
            />
          </Grid>

          <Grid item xs={12} sm={4}>
            <Autocomplete
              {...LINK_AUTOCOMPLETE_PROPS}
              options={projects}
              value={selectedProject}
              onChange={handleProjectChange}
              loading={loadingProjects}
              getOptionLabel={getProjectOptionLabel}
              filterOptions={filterProjectOptions}
              isOptionEqualToValue={(option, value) => (
                String(getProjectOptionId(option)) === String(getProjectOptionId(value))
              )}
              noOptionsText="No matching projects"
              renderOption={(props, option) => (
                <li {...props} key={getProjectOptionId(option)}>
                  <Box>
                    <Typography variant="body2" fontWeight={600}>{getProjectOptionLabel(option)}</Typography>
                    {(option?.subcountyNames || option?.wardNames) && (
                      <Typography variant="caption" color="text.secondary">
                        {[option.subcountyNames, option.wardNames].filter(Boolean).join(' · ')}
                      </Typography>
                    )}
                  </Box>
                </li>
              )}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Project"
                  placeholder="Search project name or code"
                  InputProps={{
                    ...params.InputProps,
                    endAdornment: (
                      <>
                        {loadingProjects ? <CircularProgress color="inherit" size={18} /> : null}
                        {params.InputProps.endAdornment}
                      </>
                    ),
                  }}
                />
              )}
            />
          </Grid>
          <Grid item xs={12} sm={4}>
            <Autocomplete
              {...LINK_AUTOCOMPLETE_PROPS}
              options={rriProgrammes}
              value={selectedProgramme}
              onChange={handleProgrammeChange}
              loading={loadingProgrammes}
              getOptionLabel={getProgrammeOptionLabel}
              filterOptions={filterProgrammeOptions}
              isOptionEqualToValue={(option, value) => (
                String(getProgrammeOptionId(option)) === String(getProgrammeOptionId(value))
              )}
              noOptionsText="No matching RRI programmes"
              renderOption={(props, option) => (
                <li {...props} key={getProgrammeOptionId(option)}>
                  <Box>
                    <Typography variant="body2" fontWeight={600}>{option?.name || getProgrammeOptionLabel(option)}</Typography>
                    {(option?.sector || option?.coverageSummary) && (
                      <Typography variant="caption" color="text.secondary">
                        {[option.sector, option.coverageSummary].filter(Boolean).join(' · ')}
                      </Typography>
                    )}
                  </Box>
                </li>
              )}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="RRI programme"
                  placeholder="Search programme name"
                  InputProps={{
                    ...params.InputProps,
                    endAdornment: (
                      <>
                        {loadingProgrammes ? <CircularProgress color="inherit" size={18} /> : null}
                        {params.InputProps.endAdornment}
                      </>
                    ),
                  }}
                />
              )}
            />
          </Grid>
          <Grid item xs={12} sm={4}>
            <Autocomplete
              {...LINK_AUTOCOMPLETE_PROPS}
              options={rriSites}
              value={selectedSite}
              onChange={handleSiteChange}
              loading={loadingSites}
              disabled={!form.rriProgrammeId}
              getOptionLabel={getSiteOptionLabel}
              filterOptions={filterSiteOptions}
              isOptionEqualToValue={(option, value) => (
                String(getSiteOptionId(option)) === String(getSiteOptionId(value))
              )}
              noOptionsText={form.rriProgrammeId ? 'No sites for this programme' : 'Select an RRI programme first'}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="RRI site"
                  placeholder={form.rriProgrammeId ? 'Search programme site' : 'Select programme first'}
                  InputProps={{
                    ...params.InputProps,
                    endAdornment: (
                      <>
                        {loadingSites ? <CircularProgress color="inherit" size={18} /> : null}
                        {params.InputProps.endAdornment}
                      </>
                    ),
                  }}
                />
              )}
            />
          </Grid>
          <Grid item xs={12}>
            <TextField fullWidth multiline minRows={2} label="Notes" value={form.notes} onChange={handleChange('notes')} />
          </Grid>
        </Grid>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleSave} disabled={saving || !form.displayName.trim()}>
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}
