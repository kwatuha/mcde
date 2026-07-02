import React from 'react';
import { Chip, LinearProgress, Paper, Stack, Typography } from '@mui/material';
import { workflowChipProps } from '../../utils/certificateWorkflowDisplay.js';

export function complianceColor(pct) {
  if (pct >= 100) return 'success';
  if (pct >= 70) return 'warning';
  return 'error';
}

export function scopeChip(scopeStatus) {
  const map = {
    none: { label: 'No scope', color: 'default' },
    draft: { label: 'Scope draft', color: 'warning' },
    planned: { label: 'Baseline set', color: 'success' },
  };
  return map[scopeStatus] || map.none;
}

export function workflowChip(status) {
  const props = workflowChipProps(status);
  return <Chip size="small" label={props.label} color={props.color} variant={props.variant || 'filled'} />;
}

export function projectTabLink(projectId, tabKey) {
  return `/projects/${projectId}?tab=${tabKey}`;
}

export function SummaryCard({ label, value, sublabel, color }) {
  return (
    <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, height: '100%' }}>
      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
        {label}
      </Typography>
      <Typography variant="h4" sx={{ fontWeight: 800, color: color || 'text.primary', my: 0.5 }}>
        {value}
      </Typography>
      {sublabel ? (
        <Typography variant="caption" color="text.secondary">{sublabel}</Typography>
      ) : null}
    </Paper>
  );
}

export function ComplianceBar({ pct, satisfied, required }) {
  return (
    <Stack spacing={0.5}>
      <Stack direction="row" spacing={1} alignItems="center">
        <Typography variant="body2" sx={{ fontWeight: 700, minWidth: 38 }}>{pct}%</Typography>
        <LinearProgress
          variant="determinate"
          value={pct}
          color={complianceColor(pct)}
          sx={{ flex: 1, height: 8, borderRadius: 1 }}
        />
      </Stack>
      {required != null ? (
        <Typography variant="caption" color="text.secondary">
          {satisfied || 0}/{required || 0} required files
        </Typography>
      ) : null}
    </Stack>
  );
}

export const CO_FINANCE_WORKSPACE_ROUTES = {
  overview: '/co-finance-workspace',
  projects: '/co-finance-workspace/projects',
  payments: '/co-finance-workspace/payments',
  certificates: '/co-finance-workspace/certificates',
  finance: '/co-finance-workspace/finance',
};

export const CO_FINANCE_BRAND = { main: '#6a1b9a', light: '#9c27b0' };
