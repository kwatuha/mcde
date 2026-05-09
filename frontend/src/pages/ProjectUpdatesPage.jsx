import React from 'react';
import {
  Card,
  CardActionArea,
  CardContent,
  Container,
  Typography,
} from '@mui/material';
import Grid from '@mui/material/Grid';
import { Link as RouterLink } from 'react-router-dom';
import { ROUTES } from '../configs/appConfig';

const LINKS = [
  {
    title: 'Project Status',
    description: 'Overall progress and status entries across the registry.',
    to: ROUTES.PROJECT_STATUS,
  },
  {
    title: 'Project Documents',
    description: 'Attachments and supporting documents grouped by project.',
    to: ROUTES.PROJECT_DOCUMENTS_BY_PROJECT,
  },
  {
    title: 'Project evaluation',
    description: 'M&E evaluation lines and structured export.',
    to: ROUTES.PROJECT_EVALUATION,
  },
  {
    title: 'Stakeholder feedback',
    description: 'Public feedback linked to projects.',
    to: ROUTES.PROJECT_FEEDBACK_BY_PROJECT,
  },
  {
    title: 'Checklists & visits',
    description: 'Field monitoring templates and visit records.',
    to: ROUTES.DATA_COLLECTION_TOOLS,
  },
];

export default function ProjectUpdatesPage() {
  return (
    <Container maxWidth="lg" sx={{ py: 3 }}>
      <Typography variant="h4" sx={{ fontWeight: 700, mb: 1 }}>
        Project Updates
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
        Entry point for monitoring progress, documents, evaluation, and stakeholder input. Open a module
        below or use the Monitoring section in the sidebar.
      </Typography>

      <Grid container spacing={2}>
        {LINKS.map(({ title, description, to }) => (
          <Grid item xs={12} sm={6} md={4} key={to}>
            <Card variant="outlined" sx={{ height: '100%' }}>
              <CardActionArea component={RouterLink} to={to} sx={{ height: '100%', alignItems: 'stretch' }}>
                <CardContent>
                  <Typography variant="h6" sx={{ fontWeight: 600, mb: 0.5 }}>
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
    </Container>
  );
}
