import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Autocomplete,
  Box,
  Button,
  Chip,
  Divider,
  Grid,
  IconButton,
  Paper,
  TextField,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import apiService from '../api';

const RRI_DROPDOWN_SX = { minWidth: 220, width: '100%' };

export const RRI_AUTOCOMPLETE_PROPS = {
  fullWidth: true,
  sx: RRI_DROPDOWN_SX,
  slotProps: { paper: { sx: { minWidth: 220 } } },
};

export const emptyRriSite = () => ({
  siteName: '',
  subcounty: '',
  ward: '',
  targetBeneficiaries: '',
  remarks: '',
});

function siteLabel(site, index) {
  if (site.siteName?.trim()) return site.siteName.trim();
  const parts = [site.subcounty, site.ward].filter(Boolean);
  if (parts.length) return parts.join(' · ');
  return `Location ${index + 1}`;
}

export default function RriProgrammeSitesSection({ sites, onSitesChange, subcountyOptions = [], loadingSubcounties = false }) {
  const [wardOptionsBySubcounty, setWardOptionsBySubcounty] = useState({});
  const [wardLoading, setWardLoading] = useState({});
  const loadedSubcountiesRef = useRef(new Set());

  const loadWards = useCallback(async (subcounty) => {
    const key = String(subcounty || '').trim();
    if (!key || loadedSubcountiesRef.current.has(key)) return;
    loadedSubcountiesRef.current.add(key);
    setWardLoading((prev) => ({ ...prev, [key]: true }));
    try {
      let list = [];
      if (typeof apiService.kenyaWards?.getCatalogWardsBySubcounty === 'function') {
        list = await apiService.kenyaWards.getCatalogWardsBySubcounty(key);
      }
      if (!Array.isArray(list) || list.length === 0) {
        list = await apiService.kenyaWards.getWardsBySubcounty(key);
      }
      const values = (Array.isArray(list) ? list : [])
        .map((item) => (typeof item === 'string' ? item : item?.name || item?.wardName || ''))
        .filter(Boolean);
      setWardOptionsBySubcounty((prev) => ({ ...prev, [key]: values }));
    } catch {
      setWardOptionsBySubcounty((prev) => ({ ...prev, [key]: [] }));
    } finally {
      setWardLoading((prev) => ({ ...prev, [key]: false }));
    }
  }, []);

  useEffect(() => {
    const uniqueSubcounties = [...new Set(
      (sites || []).map((site) => String(site.subcounty || '').trim()).filter(Boolean),
    )];
    uniqueSubcounties.forEach((subcounty) => {
      loadWards(subcounty);
    });
  }, [sites, loadWards]);

  const handleAddSite = () => {
    onSitesChange([...(sites || []), emptyRriSite()]);
  };

  const handleRemoveSite = (index) => {
    onSitesChange((sites || []).filter((_, i) => i !== index));
  };

  const handleSiteChange = (index, field, value) => {
    const next = [...(sites || [])];
    next[index] = { ...next[index], [field]: value };
    if (field === 'subcounty' && value !== sites[index]?.subcounty) {
      next[index].ward = '';
    }
    onSitesChange(next);
  };

  return (
    <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <LocationOnIcon color="primary" fontSize="small" />
          <Box>
            <Typography variant="subtitle1" fontWeight={700}>Coverage locations</Typography>
            <Typography variant="caption" color="text.secondary">
              Add each sub-county or ward where this programme will operate
            </Typography>
          </Box>
        </Box>
        <Button startIcon={<AddIcon />} onClick={handleAddSite} size="small" variant="outlined">
          Add location
        </Button>
      </Box>

      {!sites?.length ? (
        <Box
          sx={{
            textAlign: 'center',
            py: 3,
            border: '1px dashed',
            borderColor: 'divider',
            borderRadius: 2,
          }}
        >
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            No coverage locations yet
          </Typography>
          <Button startIcon={<AddIcon />} onClick={handleAddSite} size="small">
            Add first location
          </Button>
        </Box>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {sites.map((site, index) => {
            const subcountyKey = String(site.subcounty || '').trim();
            const wardOptions = subcountyKey ? (wardOptionsBySubcounty[subcountyKey] || []) : [];
            return (
              <Accordion
                key={`rri-site-${index}`}
                defaultExpanded={index === sites.length - 1}
                disableGutters
                sx={{ border: '1px solid', borderColor: 'divider', borderRadius: '8px !important', '&:before': { display: 'none' } }}
              >
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: 1, minWidth: 0 }}>
                    <Chip label={`#${index + 1}`} size="small" color="primary" variant="outlined" />
                    <Typography variant="body2" fontWeight={600} noWrap>
                      {siteLabel(site, index)}
                    </Typography>
                  </Box>
                  <IconButton
                    size="small"
                    color="error"
                    onClick={(event) => {
                      event.stopPropagation();
                      handleRemoveSite(index);
                    }}
                    aria-label="Remove location"
                  >
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </AccordionSummary>
                <AccordionDetails>
                  <Grid container spacing={2}>
                    <Grid item xs={12}>
                      <TextField
                        fullWidth
                        size="small"
                        label="Location label (optional)"
                        value={site.siteName || ''}
                        onChange={(e) => handleSiteChange(index, 'siteName', e.target.value)}
                        placeholder="e.g. Eastern cluster, Phase 1"
                      />
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <Autocomplete
                        freeSolo
                        {...RRI_AUTOCOMPLETE_PROPS}
                        options={subcountyOptions}
                        value={site.subcounty || null}
                        loading={loadingSubcounties}
                        onChange={(_, value) => handleSiteChange(index, 'subcounty', value || '')}
                        onInputChange={(_, value) => handleSiteChange(index, 'subcounty', value || '')}
                        renderInput={(params) => (
                          <TextField {...params} size="small" label="Sub-county" placeholder="Search sub-county" />
                        )}
                      />
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <Autocomplete
                        freeSolo
                        {...RRI_AUTOCOMPLETE_PROPS}
                        options={wardOptions}
                        value={site.ward || null}
                        loading={Boolean(wardLoading[subcountyKey])}
                        disabled={!subcountyKey}
                        onChange={(_, value) => handleSiteChange(index, 'ward', value || '')}
                        onInputChange={(_, value) => handleSiteChange(index, 'ward', value || '')}
                        renderInput={(params) => (
                          <TextField
                            {...params}
                            size="small"
                            label="Ward"
                            placeholder={subcountyKey ? 'Search ward' : 'Select sub-county first'}
                          />
                        )}
                      />
                    </Grid>
                    <Grid item xs={12}>
                      <Divider />
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <TextField
                        fullWidth
                        size="small"
                        type="number"
                        label="Target beneficiaries (optional)"
                        value={site.targetBeneficiaries ?? ''}
                        onChange={(e) => handleSiteChange(index, 'targetBeneficiaries', e.target.value)}
                      />
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <TextField
                        fullWidth
                        size="small"
                        label="Remarks (optional)"
                        value={site.remarks || ''}
                        onChange={(e) => handleSiteChange(index, 'remarks', e.target.value)}
                      />
                    </Grid>
                  </Grid>
                </AccordionDetails>
              </Accordion>
            );
          })}
        </Box>
      )}
    </Paper>
  );
}
