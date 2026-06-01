import React from 'react';
import {
  Box,
  Card,
  CardActionArea,
  CardContent,
  Container,
  Typography,
} from '@mui/material';
import Grid from '@mui/material/Grid';
import { Link as RouterLink } from 'react-router-dom';
import { ROUTES } from '../configs/appConfig';

const SECTIONS = [
  {
    title: 'Financial & registry',
    description: 'Downloads, statements, and finance-oriented outputs.',
    links: [
      {
        title: 'Report library',
        description: 'Curated report documents and references.',
        to: ROUTES.REPORT_LIBRARY,
      },
      {
        title: 'Pending bills report',
        description: 'Outstanding project bill balances and exports.',
        to: ROUTES.PENDING_BILLS_REPORT,
      },
      {
        title: 'Budget justification',
        description: 'Filter projects and download justification templates.',
        to: ROUTES.BUDGET_JUSTIFICATION_REPORT,
      },
      {
        title: 'Project finance overview',
        description: 'Financing mix, partner contributions, and statements.',
        to: ROUTES.PROJECT_FINANCE_OVERVIEW_REPORT,
      },
      {
        title: 'Absorption report',
        description: 'Budget absorption and financial analytics.',
        to: ROUTES.ABSORPTION_REPORT,
      },
      {
        title: 'Scheduled reports',
        description: 'Automated or recurring report configuration.',
        to: ROUTES.SCHEDULED_REPORTS,
      },
    ],
  },
  {
    title: 'Performance & accountability',
    description: 'Periodic and county-level performance views.',
    links: [
      {
        title: 'Performance management report',
        description: 'Performance metrics and management analytics.',
        to: ROUTES.PERFORMANCE_MANAGEMENT_REPORT,
      },
      {
        title: 'CAPR report',
        description: 'County annual performance reporting.',
        to: ROUTES.CAPR_REPORT,
      },
      {
        title: 'Quarterly implementation report',
        description: 'Quarterly implementation summary.',
        to: ROUTES.QUARTERLY_IMPLEMENTATION_REPORT,
      },
    ],
  },
  {
    title: 'Dashboards & geography',
    description: 'Consolidated views also reachable from the Dashboard ribbon.',
    links: [
      {
        title: 'Reporting dashboard',
        description: 'Cross-cutting reporting dashboard.',
        to: ROUTES.REPORTING_DASHBOARD,
      },
      {
        title: 'Regional reports',
        description: 'Regional analytics overview.',
        to: ROUTES.REGIONAL_DASHBOARD,
      },
      {
        title: 'Regional breakdown',
        description: 'Sub-county and ward dashboards.',
        to: ROUTES.REGIONAL_REPORTING,
      },
      {
        title: 'Departmental reports',
        description: 'Executive department and implementation unit performance.',
        to: ROUTES.DEPARTMENTAL_REPORTING,
      },
      {
        title: 'Project dashboards',
        description: 'Per-project dashboard analytics.',
        to: ROUTES.REPORTING_OVERVIEW,
      },
      {
        title: 'Projects dashboard',
        description: 'Registry-wide projects dashboard view.',
        to: ROUTES.NEW_DASHBOARD,
      },
      {
        title: 'GIS dashboard',
        description: 'Map-based indicators and geographic summaries.',
        to: ROUTES.GIS_DASHBOARD,
      },
    ],
  },
  {
    title: 'Projects & monitoring',
    description: 'Charts, evaluation exports, field tools, and raw tables.',
    links: [
      {
        title: 'Project status charts',
        description: 'Status distribution and projects by directorate.',
        to: ROUTES.REPORTS,
      },
      {
        title: 'Project evaluation',
        description: 'M&E evaluation grid and structured export.',
        to: ROUTES.PROJECT_EVALUATION,
      },
      {
        title: 'Checklists & visits',
        description: 'Inspection templates and visit records.',
        to: ROUTES.DATA_COLLECTION_TOOLS,
      },
      {
        title: 'Raw data',
        description: 'Tabular data and document-style exports.',
        to: ROUTES.RAW_DATA,
      },
    ],
  },
  {
    title: 'Planning',
    description: 'Planning catalog links to reporting cadence.',
    links: [
      {
        title: 'Reporting frequency',
        description: 'How often indicators and milestones are reported.',
        to: ROUTES.PLANNING_REPORTING_FREQUENCY,
      },
    ],
  },
];

export default function ReportsHubPage() {
  return (
    <Container maxWidth="lg" sx={{ py: 3 }}>
      <Typography variant="h4" sx={{ fontWeight: 700, mb: 1 }}>
        Reports hub
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 3, maxWidth: 720 }}>
        One place to open reporting and analytics screens that also live elsewhere in the app. Each card
        goes to the existing page; permissions are unchanged.
      </Typography>

      {SECTIONS.map((section) => (
        <Box key={section.title} sx={{ mb: 4 }}>
          <Typography variant="h6" sx={{ fontWeight: 600, mb: 0.5 }}>
            {section.title}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {section.description}
          </Typography>
          <Grid container spacing={2}>
            {section.links.map(({ title, description, to }) => (
              <Grid item xs={12} sm={6} md={4} key={to}>
                <Card variant="outlined" sx={{ height: '100%' }}>
                  <CardActionArea component={RouterLink} to={to} sx={{ height: '100%', alignItems: 'stretch' }}>
                    <CardContent>
                      <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 0.5 }}>
                        {title}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {description}
                      </Typography>
                    </CardContent>
                  </CardActionArea>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Box>
      ))}
    </Container>
  );
}
