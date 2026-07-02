import React from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { ROUTES } from '../../configs/appConfig';
import { CO_FINANCE_WORKSPACE_ROUTES } from './coFinanceWorkspaceShared';

const financeLinks = [
  {
    title: 'Payment certificates register',
    description: 'Full county finance list with filters and workflow panels.',
    to: `${ROUTES.FINANCE_PAYMENT_CERTIFICATES}?pendingMe=1`,
  },
  {
    title: 'Payment list',
    description: 'County payment tracking and disbursement overview.',
    to: ROUTES.FINANCE_PAYMENT_LIST,
  },
  {
    title: 'Budget management',
    description: 'Budget lines, allocations, and finance dashboards.',
    to: ROUTES.BUDGET_MANAGEMENT,
  },
  {
    title: 'Workflow approvals inbox',
    description: 'All pending approval steps assigned to your role.',
    to: ROUTES.WORKFLOW_APPROVALS,
  },
];

export default function CoFinanceWorkspaceFinancePage() {
  const navigate = useNavigate();

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 900, mx: 'auto' }}>
      <Button
        startIcon={<ArrowBackIcon />}
        onClick={() => navigate(CO_FINANCE_WORKSPACE_ROUTES.overview)}
        size="small"
        sx={{ mb: 2 }}
      >
        Workspace
      </Button>

      <Typography variant="h5" sx={{ fontWeight: 800, mb: 0.5 }}>County finance tools</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Extended finance views beyond the engineer workspace — use these for county-wide review and reporting.
      </Typography>

      <Alert severity="info" sx={{ mb: 2 }}>
        Payment certificates should follow the workflow: Resident Engineer → Chief Engineer → Co-Finance.
        Configure the three steps under Approvals &amp; workflows.
      </Alert>

      <Stack spacing={1.5}>
        {financeLinks.map((link) => (
          <Paper key={link.title} variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>{link.title}</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>{link.description}</Typography>
            <Button component={RouterLink} to={link.to} variant="outlined" size="small">
              Open
            </Button>
          </Paper>
        ))}
      </Stack>
    </Box>
  );
}
