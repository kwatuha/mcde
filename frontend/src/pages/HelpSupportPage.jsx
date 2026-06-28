import React from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Card,
  CardContent,
  Chip,
  Container,
  Divider,
  Grid,
  List,
  ListItem,
  ListItemText,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import helpKb from '../../../api/data/help-knowledge-base.json';

const {
  moduleGuides = [],
  quickTasks = [],
  troubleshootingRows = [],
  roleGuidance = [],
  goodPracticeItems = [],
  supportChecklist = [],
} = helpKb;

const renderList = (items) => (
  <List dense disablePadding>
    {items.map((item) => (
      <ListItem key={item} sx={{ alignItems: 'flex-start', py: 0.35 }}>
        <ListItemText primary={item} />
      </ListItem>
    ))}
  </List>
);

const HelpSupportPage = () => {
  return (
    <Container maxWidth="xl" sx={{ py: 3 }}>
      <Paper
        elevation={0}
        sx={{
          p: { xs: 2, md: 3 },
          mb: 3,
          borderRadius: 3,
          bgcolor: 'primary.main',
          color: 'primary.contrastText',
        }}
      >
        <Typography variant="h4" sx={{ fontWeight: 800, mb: 1 }}>
          Help &amp; Support
        </Typography>
        <Typography variant="body1" sx={{ maxWidth: 980, opacity: 0.95 }}>
          Self-service guide for the Machakos County Integrated Project, Performance and Reporting
          Management System — workflows, dashboards, finance certificates, AI assistant, mobile field
          collection, reports, troubleshooting, and ICT escalation.
        </Typography>
      </Paper>

      <Alert severity="info" sx={{ mb: 3 }}>
        The system is role-based. If a screen, button, project, or report is missing, confirm your role,
        permissions, organisation scope, and active filters. The AI Assistant (sparkle button) also uses
        this manual for navigation questions.
      </Alert>

      <Grid container spacing={2.5}>
        <Grid item xs={12} lg={8}>
          <Card variant="outlined" sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="h5" sx={{ fontWeight: 700, mb: 1 }}>
                Logical Flow of the System
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Most work follows this path from planning to reporting and public accountability.
              </Typography>
              <Grid container spacing={1.5}>
                {[
                  'Planning setup',
                  'Project registration',
                  'Procurement',
                  'Implementation tracking',
                  'Monitoring & field data',
                  'Finance & certificates',
                  'Reporting & AI outputs',
                  'Public transparency',
                  'Administration & audit',
                ].map((item, index) => (
                  <Grid item xs={12} sm={6} md={4} key={item}>
                    <Paper variant="outlined" sx={{ p: 1.5, height: '100%' }}>
                      <Chip label={`Step ${index + 1}`} size="small" color="primary" sx={{ mb: 1 }} />
                      <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                        {item}
                      </Typography>
                    </Paper>
                  </Grid>
                ))}
              </Grid>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} lg={4}>
          <Card variant="outlined" sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="h5" sx={{ fontWeight: 700, mb: 1 }}>
                First Things to Check
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                These checks solve many support issues before escalation.
              </Typography>
              {renderList([
                'Am I using the correct URL?',
                'Is my account active and approved?',
                'Do I have the right role and organisation scope?',
                'Are filters hiding the record I expect?',
                'For AI reports — am I on the correct dashboard first?',
                'For certificates — try QR scan or Finance → Verify Certificate.',
                'Did I save or confirm the action?',
              ])}
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12}>
          <Card variant="outlined">
            <CardContent>
              <Typography variant="h5" sx={{ fontWeight: 700, mb: 1 }}>
                Quick Task Guide
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Start here when you know what you want to do but are unsure where to go.
              </Typography>
              <TableContainer component={Paper} variant="outlined">
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 700 }}>Task</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Where to Go</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>What to Do</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {quickTasks.map(([task, location, action]) => (
                      <TableRow key={task}>
                        <TableCell>{task}</TableCell>
                        <TableCell>{location}</TableCell>
                        <TableCell>{action}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12}>
          <Card variant="outlined">
            <CardContent>
              <Typography variant="h5" sx={{ fontWeight: 700, mb: 1 }}>
                Module-by-Module Self Guide
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Expand a section for purpose, route, steps, and good practice. Updated for AI assistant,
                mobile collector, PMC, certificates (including QR verification), and expanded dashboards.
              </Typography>
              {moduleGuides.map((guide, index) => (
                <Accordion key={guide.title} defaultExpanded={index < 2} disableGutters>
                  <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <Box sx={{ width: '100%' }}>
                      <Stack
                        direction={{ xs: 'column', sm: 'row' }}
                        spacing={1}
                        alignItems={{ xs: 'flex-start', sm: 'center' }}
                      >
                        <Typography variant="subtitle1" sx={{ fontWeight: 700, flexGrow: 1 }}>
                          {guide.title}
                        </Typography>
                        <Chip label={guide.audience} size="small" variant="outlined" />
                        <Chip label={guide.route} size="small" color="primary" variant="outlined" />
                      </Stack>
                    </Box>
                  </AccordionSummary>
                  <AccordionDetails>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                      {guide.purpose}
                    </Typography>
                    <Grid container spacing={2}>
                      <Grid item xs={12} md={6}>
                        <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
                          How to use this area
                        </Typography>
                        {renderList(guide.steps)}
                      </Grid>
                      <Grid item xs={12} md={6}>
                        <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
                          Good practice
                        </Typography>
                        {renderList(guide.tips)}
                      </Grid>
                    </Grid>
                  </AccordionDetails>
                </Accordion>
              ))}
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12}>
          <Card variant="outlined">
            <CardContent>
              <Typography variant="h5" sx={{ fontWeight: 700, mb: 1 }}>
                Role-Based Guidance
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Your role determines what you can see and what actions you can perform.
              </Typography>
              <TableContainer component={Paper} variant="outlined">
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 700 }}>Role / User Group</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Primary Responsibility</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {roleGuidance.map(([role, responsibility]) => (
                      <TableRow key={role}>
                        <TableCell>{role}</TableCell>
                        <TableCell>{responsibility}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={6}>
          <Card variant="outlined" sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="h5" sx={{ fontWeight: 700, mb: 1 }}>
                Good Data Practice
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Good data quality keeps dashboards, reports, certificates, and public pages reliable.
              </Typography>
              {renderList(goodPracticeItems)}
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={6}>
          <Card variant="outlined" sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="h5" sx={{ fontWeight: 700, mb: 1 }}>
                Before Contacting ICT Support
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Include these details so support can reproduce and resolve the issue quickly.
              </Typography>
              {renderList(supportChecklist)}
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12}>
          <Card variant="outlined">
            <CardContent>
              <Typography variant="h5" sx={{ fontWeight: 700, mb: 1 }}>
                Troubleshooting Guide
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Use this table for first-level diagnosis before escalation.
              </Typography>
              <TableContainer component={Paper} variant="outlined">
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 700 }}>Issue</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Likely Cause</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>First Action</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {troubleshootingRows.map(([issue, cause, action]) => (
                      <TableRow key={issue}>
                        <TableCell>{issue}</TableCell>
                        <TableCell>{cause}</TableCell>
                        <TableCell>{action}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
              <Alert severity="warning" sx={{ mt: 2 }}>
                Do not send screenshots containing passwords, OTP codes, private tokens, or confidential
                personal data. Mask sensitive information before sharing support evidence.
              </Alert>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Box sx={{ mt: 3 }}>
        <Divider sx={{ mb: 2 }} />
        <Typography variant="body2" color="text.secondary">
          Open this page from the top-right three-dot menu → Help &amp; Support. The AI Assistant uses
          this manual for navigation and how-to questions.
        </Typography>
      </Box>
    </Container>
  );
};

export default HelpSupportPage;
