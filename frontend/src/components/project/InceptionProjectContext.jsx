import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Button, Chip, Grid, Paper, Stack, Typography,
} from '@mui/material';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import LinkIcon from '@mui/icons-material/Link';
import { Link as RouterLink } from 'react-router-dom';
import apiService from '../../api';
import { formatCurrency } from '../../utils/helpers';

function sumCapitalCosts(financials) {
  if (!financials) return 0;
  return [
    'capitalCostConsultancy', 'capitalCostLandAcquisition', 'capitalCostSitePrep',
    'capitalCostConstruction', 'capitalCostPlantEquipment', 'capitalCostFixturesFittings',
    'capitalCostOther', 'recurrentCostLabor', 'recurrentCostOperating',
    'recurrentCostMaintenance', 'recurrentCostOther',
  ].reduce((total, key) => total + (Number(financials[key]) || 0), 0);
}

export default function InceptionProjectContext({ project, projectId, financials }) {
  const [bqItems, setBqItems] = useState([]);
  const [bqLoading, setBqLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setBqLoading(true);
      try {
        const rows = await apiService.projects.bq.getItems(projectId);
        if (!cancelled) setBqItems(Array.isArray(rows) ? rows : []);
      } catch {
        if (!cancelled) setBqItems([]);
      } finally {
        if (!cancelled) setBqLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [projectId]);

  const bqTotal = useMemo(
    () => bqItems.reduce((sum, row) => sum + (Number(row.budget_amount ?? row.budgetAmount) || 0), 0),
    [bqItems]
  );

  const inceptionTotal = useMemo(() => sumCapitalCosts(financials), [financials]);
  const registryBudget = Number(project?.costOfProject ?? project?.allocatedBudget) || 0;

  const budgetAligned = !registryBudget || !inceptionTotal
    || Math.abs(registryBudget - inceptionTotal) / Math.max(registryBudget, 1) < 0.15;
  const bqAligned = !bqTotal || !inceptionTotal
    || Math.abs(bqTotal - inceptionTotal) / Math.max(bqTotal, 1) < 0.15;

  return (
    <Paper variant="outlined" sx={{ p: 2, mb: 2, bgcolor: 'background.default' }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
        <LinkIcon fontSize="small" color="primary" />
        <Typography variant="subtitle1" fontWeight={700}>
          Linked to project registry
        </Typography>
      </Stack>

      <Grid container spacing={2}>
        <Grid item xs={12} sm={6} md={3}>
          <Typography variant="caption" color="text.secondary">Project category</Typography>
          <Typography variant="body2" fontWeight={600}>{project?.categoryName || 'Not set'}</Typography>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Typography variant="caption" color="text.secondary">Sector</Typography>
          <Typography variant="body2" fontWeight={600}>{project?.sector || 'Not set'}</Typography>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Typography variant="caption" color="text.secondary">Registry budget</Typography>
          <Typography variant="body2" fontWeight={600}>{formatCurrency(registryBudget || null)}</Typography>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Typography variant="caption" color="text.secondary">Bill of Quantities</Typography>
          <Typography variant="body2" fontWeight={600}>
            {bqLoading ? 'Loading…' : `${bqItems.length} item(s) · ${formatCurrency(bqTotal || null)}`}
          </Typography>
        </Grid>
      </Grid>

      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mt: 1.5, mb: 1.5 }}>
        <Chip size="small" label={`Inception cost total: ${formatCurrency(inceptionTotal || null)}`} />
        <Chip
          size="small"
          color={budgetAligned ? 'success' : 'warning'}
          variant="outlined"
          label={budgetAligned ? 'Near registry budget' : 'Differs from registry budget'}
        />
        {bqItems.length > 0 && (
          <Chip
            size="small"
            color={bqAligned ? 'success' : 'warning'}
            variant="outlined"
            label={bqAligned ? 'Near BQ total' : 'Differs from BQ total'}
          />
        )}
      </Stack>

      {!budgetAligned || (bqItems.length > 0 && !bqAligned) ? (
        <Alert severity="info" sx={{ mb: 1.5 }}>
          Inception financials should align with the project registry budget and the BQ tab.
          Update inception costs or the BQ so exports reflect the same figures.
        </Alert>
      ) : null}

      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
        <Button
          size="small"
          variant="outlined"
          component={RouterLink}
          to={`/projects/${projectId}?tab=bq`}
          endIcon={<OpenInNewIcon />}
        >
          Open Bill of Quantities
        </Button>
        <Button
          size="small"
          variant="text"
          component={RouterLink}
          to={`/projects/${projectId}?tab=overview`}
          endIcon={<OpenInNewIcon />}
        >
          Project overview
        </Button>
      </Stack>
    </Paper>
  );
}
