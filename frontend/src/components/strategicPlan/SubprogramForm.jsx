// src/components/strategicPlan/SubprogramForm.jsx
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Box, TextField, Typography, Grid, Stack, Autocomplete, createFilterOptions } from '@mui/material';
import apiService from '../../api';

const indicatorFilterOptions = createFilterOptions({
  ignoreCase: true,
  stringify: (option) =>
    `${option.name || ''} ${option.description || ''} ${option.measurementTypeLabel || ''} ${option.measurementTypeCode || ''}`,
});

const SubprogramForm = React.memo(({ formData, handleFormChange, readOnly = false }) => {
  const years = [1, 2, 3, 4, 5];
  const [indicatorOptions, setIndicatorOptions] = useState([]);
  const [indicatorsLoading, setIndicatorsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await apiService.planning.getIndicators();
        if (!cancelled && Array.isArray(rows)) setIndicatorOptions(rows);
      } catch {
        if (!cancelled) setIndicatorOptions([]);
      } finally {
        if (!cancelled) setIndicatorsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const isInitialRender = useRef(true);

  const [formState, setFormState] = useState(() => ({
    ...formData,
    ...years.reduce((acc, year) => {
      acc[`yr${year}Budget`] = formData[`yr${year}Budget`] ? formData[`yr${year}Budget`].toLocaleString('en-US') : '';
      return acc;
    }, {}),
  }));

  const parseNumber = useCallback((value) => {
    return parseFloat(String(value).replace(/,/g, '')) || 0;
  }, []);

  const formatNumber = useCallback((value) => {
    if (value === null || value === undefined || value === '') return '';
    return parseFloat(value).toLocaleString('en-US');
  }, []);

  const totalBudget = years.reduce((sum, year) => sum + parseNumber(formState[`yr${year}Budget`]), 0);

  useEffect(() => {
    if (isInitialRender.current) {
      setFormState((prev) => ({
        ...prev,
        ...years.reduce((acc, year) => {
          acc[`yr${year}Budget`] = formData[`yr${year}Budget`] ? formatNumber(formData[`yr${year}Budget`]) : '';
          return acc;
        }, {}),
        totalBudget: formData.totalBudget ? formatNumber(formData.totalBudget) : '',
      }));
      isInitialRender.current = false;
    }
  }, [formData, formatNumber, years]);

  const selectedIndicator = useMemo(() => {
    const raw = formState.planningIndicatorId ?? formData.planningIndicatorId;
    if (raw == null || raw === '') return null;
    const id = Number(raw);
    if (!Number.isFinite(id)) return null;
    return indicatorOptions.find((o) => Number(o.id) === id) || null;
  }, [formState.planningIndicatorId, formData.planningIndicatorId, indicatorOptions]);

  const applyPlanningIndicator = useCallback(
    (opt) => {
      const id = opt?.id != null ? Number(opt.id) : null;
      const planningIndicatorId = Number.isFinite(id) ? id : null;
      const kpi = opt?.name ?? '';
      const unitOfMeasure = opt?.measurementTypeCode ?? '';

      setFormState((prev) => ({
        ...prev,
        planningIndicatorId,
        kpi,
        unitOfMeasure,
      }));

      const sameId =
        Number(formData.planningIndicatorId ?? NaN) === Number(planningIndicatorId ?? NaN) ||
        (formData.planningIndicatorId == null && planningIndicatorId == null);
      if (!sameId) handleFormChange({ target: { name: 'planningIndicatorId', value: planningIndicatorId } });
      if (formData.kpi !== kpi) handleFormChange({ target: { name: 'kpi', value: kpi } });
      if (formData.unitOfMeasure !== unitOfMeasure) {
        handleFormChange({ target: { name: 'unitOfMeasure', value: unitOfMeasure } });
      }
    },
    [handleFormChange, formData]
  );

  const handleLocalFormChange = useCallback((e) => {
    const { name, value } = e.target;
    setFormState((prev) => ({ ...prev, [name]: value }));
  }, []);

  const handleBlur = useCallback(
    (e) => {
      const { name, value, type } = e.target;
      const isBudgetField = name.includes('Budget');

      let formattedValueForLocalState = value;
      let valueForParentState = value;

      if (type === 'number' || isBudgetField) {
        valueForParentState = parseNumber(value);
        formattedValueForLocalState = formatNumber(valueForParentState);
      }

      setFormState((prev) => ({ ...prev, [name]: formattedValueForLocalState }));

      if (formData[name] !== valueForParentState) {
        handleFormChange({ target: { name, value: valueForParentState } });
      }
    },
    [handleFormChange, parseNumber, formatNumber, formData]
  );

  useEffect(() => {
    if (parseNumber(formData.totalBudget) !== totalBudget) {
      handleFormChange({ target: { name: 'totalBudget', value: totalBudget } });
    }
  }, [totalBudget, formData.totalBudget, handleFormChange, parseNumber]);

  const legacyKpiHint =
    !selectedIndicator && (formState.kpi || formData.kpi)
      ? `Previously recorded as: ${formState.kpi || formData.kpi}${
          formState.unitOfMeasure || formData.unitOfMeasure
            ? ` (${formState.unitOfMeasure || formData.unitOfMeasure})`
            : ''
        }. Select a catalog indicator to link this sub-program.`
      : '';

  return (
    <Box sx={{ mt: 0.5, p: 0 }}>
      <Grid container spacing={1.5}>
        <Grid item xs={12}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ xs: 'stretch', sm: 'flex-end' }}>
            <TextField
              autoFocus
              margin="none"
              name="subProgramme"
              label="Sub-Program"
              type="text"
              fullWidth
              variant="outlined"
              value={formState.subProgramme || ''}
              onChange={handleLocalFormChange}
              onBlur={handleBlur}
              InputProps={{ readOnly }}
            />
            <TextField
              margin="none"
              name="totalBudget"
              label="Total Budget"
              type="text"
              sx={{ width: { xs: '100%', sm: 220 }, ml: { sm: 'auto' } }}
              variant="filled"
              value={formatNumber(totalBudget) || ''}
              InputProps={{ readOnly: true }}
              onBlur={handleBlur}
            />
          </Stack>
        </Grid>

        <Grid item xs={12}>
          <Typography variant="subtitle1" sx={{ fontWeight: 'bold', mb: 0.75 }}>
            Yearly Targets & Budgets
          </Typography>
          <Box sx={{ border: '1px solid #ccc', borderRadius: 1, overflow: 'hidden' }}>
            <Box sx={{ display: 'flex', bgcolor: 'grey.100', borderBottom: '1px solid #ccc' }}>
              <Box sx={{ width: '15%', borderRight: '1px solid #ccc' }} />
              {years.map((year) => (
                <Box
                  key={`year-header-${year}`}
                  sx={{ flex: 1, borderRight: '1px solid #ccc', py: 1, '&:last-child': { borderRight: 'none' } }}
                >
                  <Typography variant="body2" sx={{ fontWeight: 'bold' }} align="center">
                    Year {year}
                  </Typography>
                </Box>
              ))}
            </Box>

            <Box sx={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid #ccc' }}>
              <Box sx={{ width: '15%', py: 1, borderRight: '1px solid #ccc', display: 'flex', justifyContent: 'center' }}>
                <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                  Target
                </Typography>
              </Box>
              {years.map((year) => (
                <Box
                  key={`target-input-${year}`}
                  sx={{ flex: 1, borderRight: '1px solid #ccc', px: 0.5, '&:last-child': { borderRight: 'none' } }}
                >
                  <TextField
                    margin="none"
                    size="small"
                    name={`yr${year}Targets`}
                    fullWidth
                    variant="outlined"
                    value={formState[`yr${year}Targets`] || ''}
                    onChange={handleLocalFormChange}
                    onBlur={handleBlur}
                    InputProps={{ readOnly }}
                  />
                </Box>
              ))}
            </Box>

            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <Box sx={{ width: '15%', py: 1, borderRight: '1px solid #ccc', display: 'flex', justifyContent: 'center' }}>
                <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                  Budget
                </Typography>
              </Box>
              {years.map((year) => (
                <Box
                  key={`budget-input-${year}`}
                  sx={{ flex: 1, borderRight: '1px solid #ccc', px: 0.5, '&:last-child': { borderRight: 'none' } }}
                >
                  <TextField
                    margin="none"
                    size="small"
                    name={`yr${year}Budget`}
                    type="text"
                    fullWidth
                    variant="outlined"
                    value={formState[`yr${year}Budget`] || ''}
                    onChange={handleLocalFormChange}
                    onBlur={handleBlur}
                    InputProps={{ readOnly }}
                  />
                </Box>
              ))}
            </Box>
          </Box>
        </Grid>

        <Grid item xs={12}>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
              <Autocomplete
                options={indicatorOptions}
                loading={indicatorsLoading}
                disabled={readOnly}
                value={selectedIndicator}
                onChange={(_, opt) => applyPlanningIndicator(opt)}
                getOptionLabel={(o) =>
                  o?.name
                    ? `${o.name} (${o.measurementTypeLabel || o.measurementTypeCode || '—'})`
                    : ''
                }
                isOptionEqualToValue={(a, b) => a && b && Number(a.id) === Number(b.id)}
                filterOptions={indicatorFilterOptions}
                autoHighlight
                selectOnFocus
                handleHomeEndKeys
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="KPI / indicator (catalog)"
                    margin="dense"
                    helperText={
                      legacyKpiHint ||
                      'Search by name, unit, or description. KPI wording and unit of measure follow the catalog entry.'
                    }
                  />
                )}
              />
            </Grid>
            <Grid item xs={12} sm={3}>
              <TextField
                margin="dense"
                name="baseline"
                label="Baseline"
                type="text"
                fullWidth
                variant="outlined"
                value={formState.baseline || ''}
                onChange={handleLocalFormChange}
                onBlur={handleBlur}
                InputProps={{ readOnly }}
              />
            </Grid>
            <Grid item xs={12} sm={3}>
              <TextField
                margin="dense"
                name="keyOutcome"
                label="Key Outcome"
                type="text"
                fullWidth
                multiline
                rows={4}
                variant="outlined"
                value={formState.keyOutcome || ''}
                onChange={handleLocalFormChange}
                onBlur={handleBlur}
                InputProps={{ readOnly }}
              />
            </Grid>
          </Grid>
        </Grid>
      </Grid>
    </Box>
  );
});

export default SubprogramForm;
