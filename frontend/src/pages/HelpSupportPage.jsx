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

const moduleGuides = [
  {
    title: '1. Accessing the system',
    audience: 'All users',
    route: '/login',
    purpose: 'Use this area when logging in, changing passwords, or confirming why a user sees a specific landing page.',
    steps: [
      'Open the internal system URL in a supported browser.',
      'Log in using the username or email and password issued by the administrator.',
      'Complete OTP verification if your account has OTP enabled.',
      'If prompted, complete the forced password change before continuing.',
      'Confirm that your landing page and visible menus match your assigned role.',
    ],
    tips: [
      'If login fails, confirm that the account is active and approved.',
      'If a menu is missing, check role permissions and organisation scope before reporting a system fault.',
      'Do not share passwords, OTP codes, or administrator accounts.',
    ],
  },
  {
    title: '2. Home page, navigation, and common controls',
    audience: 'All users',
    route: '/',
    purpose: 'Understand the common screen controls used across the system.',
    steps: [
      'Use the main menu to open Dashboard, Finance, Projects, Planning, Data, Procurement, Monitoring, Reports, Public, and Admin areas.',
      'Use search fields to find known records quickly.',
      'Apply filters before reviewing dashboards, tables, and reports.',
      'Use row actions to view details, edit records, upload evidence, or open related screens where permitted.',
      'Read success and error messages after saving, importing, or deleting records.',
    ],
    tips: [
      'Clear filters before concluding that a record is missing.',
      'Refresh only after saving or confirming that changes are complete.',
      'For wide dashboards and tables, use browser zoom around 90% to 110%.',
    ],
  },
  {
    title: '3. Dashboards and executive views',
    audience: 'Leadership, department heads, M&E, finance, and report users',
    route: '/summary-statistics',
    purpose: 'Review project status, finance position, jobs impact, regional distribution, and GIS information.',
    steps: [
      'Open the required dashboard from the Dashboard menu.',
      'Set filters such as department, status, sector, subcounty, ward, or financial year.',
      'Read summary cards first, then charts, maps, and detail tables.',
      'Use dashboard drill-downs to open the related project list where available.',
      'Capture or export results only after confirming the active filters.',
    ],
    tips: [
      'Dashboard numbers depend on project visibility and data completeness.',
      'If dashboard totals look wrong, compare the dashboard filters with the Projects Registry filters.',
      'Use dashboards during review meetings to identify attention projects and data gaps.',
    ],
  },
  {
    title: '4. Projects Registry',
    audience: 'Project officers, department users, M&E, finance, procurement, and administrators',
    route: '/projects',
    purpose: 'Find, create, edit, review, and export project records.',
    steps: [
      'Open Projects > Projects Registry.',
      'Search or filter by department, financial year, sector, status, subcounty, or ward.',
      'Open project details before editing to understand the full record.',
      'Create a project only after confirming that it does not already exist.',
      'Use exports after applying the required filters.',
    ],
    tips: [
      'Use consistent project names, departments, locations, and financial years.',
      'Avoid duplicate projects by searching before adding a new record.',
      'Project visibility affects dashboards, reports, and public publishing.',
    ],
  },
  {
    title: '5. Project details and implementation records',
    audience: 'Project officers, M&E users, department users, finance users, and administrators',
    route: '/projects',
    purpose: 'Understand how each project connects to milestones, status updates, documents, photos, teams, partners, funding, and timelines.',
    steps: [
      'Open a project from the Projects Registry.',
      'Review the overview before adding related records.',
      'Update milestones and project status using verified implementation evidence.',
      'Upload documents with clear names and correct categories.',
      'Add photos that show relevant progress and avoid sensitive personal information.',
      'Use team, partner, Gantt chart, and finance links where available.',
    ],
    tips: [
      'Evidence should support the reported progress percentage.',
      'Use comments to explain delays, scope changes, or payment issues.',
      'Keep documents and photos organised because reports and audits may depend on them.',
    ],
  },
  {
    title: '6. Planning module',
    audience: 'Planning, M&E, department focal persons, and administrators',
    route: '/strategic-planning',
    purpose: 'Maintain planning structures that support project classification, KPI tracking, and reporting alignment.',
    steps: [
      'Open Planning from the main menu.',
      'Review CIDP periods, ADP periods, sectors, programmes, and budget allocations.',
      'Maintain indicators, KPIs, measurement types, and reporting frequency using approved terminology.',
      'Maintain project activities and project risks as reusable catalogues.',
      'Link planning activities and risks to projects so monitoring and reports use consistent categories.',
    ],
    tips: [
      'Planning catalogues should be updated only by authorised planning or admin users.',
      'Changing catalogue names can affect reports; coordinate changes with M&E and ICT.',
      'Search before creating new sectors, programmes, indicators, or risks.',
    ],
  },
  {
    title: '7. Data import and upload logs',
    audience: 'ICT admins, MDA ICT admins, migration users, and authorised project creators',
    route: '/data-import',
    purpose: 'Safely import project or budget data using templates, previews, validation, and upload logs.',
    steps: [
      'Open Data > Import Data.',
      'Choose the correct import type.',
      'Download and fill the official template without changing required column names.',
      'Upload the file for preview and review all validation messages.',
      'Correct the spreadsheet and preview again if errors are shown.',
      'Confirm the import only after verifying the preview.',
      'Open Data Import Logs to verify completion and investigate failed rows.',
    ],
    tips: [
      'Never import production data from an unverified spreadsheet.',
      'Keep the original and corrected upload files for audit reference.',
      'Use training data when demonstrating imports during user training.',
    ],
  },
  {
    title: '8. Procurement module',
    audience: 'Procurement officers, project officers, departments, and administrators',
    route: '/procurement',
    purpose: 'Track procurement stages, bidders, awards, contractor handoff, and procured project history.',
    steps: [
      'Open Procurement > Project Procurement.',
      'Filter for projects requiring procurement action.',
      'Open the procurement record and review the current stage.',
      'Attach required procurement evidence and update stage status according to procedure.',
      'Record award, termination, purchase order, or contract handoff details where authorised.',
      'Review Procured Projects for completed procurement history.',
    ],
    tips: [
      'Procurement stage updates should match approved procurement documentation.',
      'Do not skip workflow stages unless the configured process allows it.',
      'Use attachments and notes to support audit review.',
    ],
  },
  {
    title: '9. Monitoring and evaluation',
    audience: 'M&E officers, project officers, department focal persons, and supervisors',
    route: '/monitoring/project-monitoring',
    purpose: 'Record monitoring visits, review checklists, update evaluations, and follow stakeholder feedback.',
    steps: [
      'Open Monitoring > Project Monitoring.',
      'Search or filter for the project to be reviewed.',
      'Create or update monitoring records based on field evidence.',
      'Use checklists and visits to capture structured observations.',
      'Update evaluation values and comments where authorised.',
      'Review stakeholder feedback and identify required follow-up actions.',
    ],
    tips: [
      'Monitoring records should be timely, evidence-based, and linked to the correct project.',
      'Use consistent scoring and comments across departments.',
      'Escalate projects with persistent delay, low absorption, or unresolved complaints.',
    ],
  },
  {
    title: '10. Finance and certificate verification',
    audience: 'Finance users, accounts users, project officers, department heads, and leadership',
    route: '/finance-dashboard',
    purpose: 'Review funding, payments, certificates, pending bills, project finance, and verification results.',
    steps: [
      'Open Finance Dashboard for high-level financial performance.',
      'Use Payment List to review payment records and filters.',
      'Use Payment Certificates to review certificate records and related project information.',
      'Open Funding Sources Report and Project Finance Overview for deeper analysis.',
      'Use Verify Certificate to confirm whether a certificate is valid.',
    ],
    tips: [
      'Finance screens depend on complete project budget, contract, and payment data.',
      'Verify certificates before relying on printed or shared copies.',
      'Use financial year and department filters during finance review meetings.',
    ],
  },
  {
    title: '11. Reports and scheduled reporting',
    audience: 'Leadership, M&E, planning, finance, department users, and ICT administrators',
    route: '/reports-hub',
    purpose: 'Generate, interpret, export, archive, and schedule operational reports.',
    steps: [
      'Open Reports > Reports Hub to identify the correct report.',
      'Set department, financial year, project status, subcounty, or date filters.',
      'Generate or refresh the report.',
      'Review totals, exceptions, and attention items before exporting.',
      'Save official reports to the Report Library where applicable.',
      'Use Scheduled Reports for recurring distribution where configured.',
    ],
    tips: [
      'Reports are only as accurate as project, finance, and monitoring data.',
      'Always record filter criteria when sharing exported reports.',
      'Use the report library as the official archive for approved outputs.',
    ],
  },
  {
    title: '12. Public dashboard and citizen engagement',
    audience: 'Public engagement teams, communication users, administrators, and trainers',
    route: '/citizen',
    purpose: 'Understand what citizens see and how public project information, feedback, proposals, and announcements are used.',
    steps: [
      'Open the public dashboard URL.',
      'Use Dashboard to review public statistics.',
      'Use Projects to browse approved public projects.',
      'Open project details to review public status, location, and description.',
      'Submit feedback or proposals using public forms where enabled.',
      'Review announcements for official county communication.',
    ],
    tips: [
      'Only approved content should appear on public pages.',
      'Avoid publishing sensitive internal notes or unverified project data.',
      'Use public feedback as input to monitoring and citizen engagement reporting.',
    ],
  },
  {
    title: '13. Public approval and feedback moderation',
    audience: 'Administrators, communication users, public content approvers, and feedback responders',
    route: '/public-approval',
    purpose: 'Approve public-facing projects, moderate citizen feedback, respond to submissions, and manage announcements.',
    steps: [
      'Open Public > Public Approval.',
      'Review project data, photos, and documents before approval.',
      'Approve only records that are accurate and suitable for public release.',
      'Open Feedback Review to moderate submitted feedback.',
      'Assign or record responses to citizen feedback where required.',
      'Create announcements with clear title, message, dates, and publishing status.',
    ],
    tips: [
      'Moderation decisions should be consistent and auditable.',
      'Do not edit citizen feedback in a way that changes its meaning.',
      'Coordinate sensitive public responses with the responsible department.',
    ],
  },
  {
    title: '14. User administration and access control',
    audience: 'ICT administrators, super administrators, and authorised MDA ICT admins',
    route: '/user-management',
    purpose: 'Manage users, roles, organisation scope, account status, password resets, and OTP settings.',
    steps: [
      'Open Admin > User Management.',
      'Search for the user before creating a new account.',
      'Create or edit profile details, role, and organisation scope.',
      'Approve or activate users according to county procedure.',
      'Reset passwords or resend credentials only after verifying the request.',
      'Disable users who have left, transferred, or no longer require access.',
    ],
    tips: [
      'Use least privilege: give only the access required for the user duties.',
      'Organisation scope controls project visibility; verify it carefully.',
      'Document administrator actions for audit and support follow-up.',
    ],
  },
  {
    title: '15. Metadata, workflows, and audit trail',
    audience: 'ICT administrators, system owners, workflow administrators, and support teams',
    route: '/metadata-management',
    purpose: 'Maintain setup data, approval levels, workflow rules, and audit logs.',
    steps: [
      'Open Admin > Metadata Management or the relevant setup page.',
      'Search existing values before adding new metadata.',
      'Update approval levels only after confirming the approval policy.',
      'Use workflow management to review process stages where enabled.',
      'Use Audit Trail to investigate user actions, changes, or support incidents.',
      'Maintain sectors, wards, agencies, ministries, job categories, and other master data using approved sources.',
    ],
    tips: [
      'Duplicate metadata causes reporting errors.',
      'Workflow and approval changes should be tested before training users.',
      'Use audit trail for facts when investigating incidents.',
    ],
  },
];

const quickTasks = [
  ['Find a project', 'Projects > Projects Registry', 'Search by name/code or filter by department, status, subcounty, ward, or financial year.'],
  ['Update project progress', 'Projects > Project Status or Project Details', 'Open the project, add progress/status details, and attach supporting comments or evidence.'],
  ['Upload project documents', 'Projects > Project Documents', 'Select the project, choose the correct document category, upload, and verify the document appears in the list.'],
  ['Record monitoring evidence', 'Monitoring > Project Monitoring', 'Find the project, add visit/checklist/evaluation notes, and save verified observations.'],
  ['Generate a report', 'Reports > Reports Hub', 'Choose the report, set filters, review totals, and export only after confirming the filter criteria.'],
  ['Verify certificate', 'Finance > Verify Certificate', 'Enter the certificate reference and confirm whether it is valid.'],
  ['Approve public content', 'Public > Public Approval', 'Review content, photos, and details before approving for citizen visibility.'],
  ['Reset a user password', 'Admin > User Management', 'Search the user, verify the request, then use the reset/resend credential action.'],
];

const troubleshootingRows = [
  ['Cannot log in', 'Wrong password, inactive account, pending approval, OTP issue, or disabled user.', 'Confirm username, account status, and password reset process. Escalate to ICT if OTP or activation fails.'],
  ['Missing menu item', 'The user role or permissions do not include that module.', 'Check role, privileges, and whether the account has the correct organisation scope.'],
  ['Cannot see expected project', 'Filters are active, project department is wrong, or user scope does not include the project.', 'Clear filters, search again, then verify project department and user scope.'],
  ['Dashboard figures look wrong', 'Filters differ from report filters, or source project/finance/monitoring data is incomplete.', 'Record active filters, compare with Projects Registry, and inspect source records.'],
  ['Import failed', 'Wrong template, missing required fields, invalid metadata, duplicate values, or validation errors.', 'Review preview errors, correct the spreadsheet, and upload again before confirming import.'],
  ['Upload failed', 'Unsupported file type, large file, unstable connection, or missing permission.', 'Try a smaller supported file and confirm the user has upload permission.'],
  ['Authorization error', 'The user is signed in but lacks the required privilege.', 'Capture the module/action and ask an administrator to review role permissions.'],
  ['Certificate not verified', 'Wrong certificate reference, inactive certificate, or invalid certificate.', 'Re-enter the reference and confirm the source record in Payment Certificates.'],
];

const supportChecklist = [
  'Your name, department, role, and phone/email contact.',
  'The exact module or page where the issue occurred.',
  'The project name/code, certificate number, report name, or user account involved.',
  'The action you were trying to complete.',
  'The exact error message shown on screen.',
  'A screenshot with passwords, OTPs, and confidential personal data hidden.',
  'The date and time when the issue happened.',
  'Whether the issue affects one user, one department, or all users.',
];

const roleGuidance = [
  ['County leadership', 'Use dashboards and reports to review status, finance, regional distribution, and attention projects.'],
  ['Department focal persons', 'Maintain departmental projects, update progress, upload evidence, and review department reports.'],
  ['Planning users', 'Maintain CIDP/ADP catalogues, programmes, indicators, activities, risks, and budget alignment.'],
  ['M&E users', 'Record monitoring visits, evaluate implementation, validate evidence, and review stakeholder feedback.'],
  ['Finance users', 'Review payment lists, certificates, funding sources, pending bills, and finance reports.'],
  ['Procurement users', 'Track procurement stages, bidders, awards, contractor handoff, and procured project history.'],
  ['Public engagement users', 'Review public content, moderate feedback, manage announcements, and monitor citizen engagement.'],
  ['ICT administrators', 'Manage users, roles, organisation scope, metadata, audit logs, workflows, and first-level support.'],
];

const goodPracticeItems = [
  'Always search before creating a new project, user, sector, ward, agency, or other setup record.',
  'Check active filters before reporting missing data.',
  'Use clear comments when updating progress, monitoring records, procurement stages, or finance records.',
  'Attach evidence where the process requires proof, such as documents, photos, approvals, or certificates.',
  'Use least privilege when assigning roles and organisation scope.',
  'Do not use live production data for practice exercises unless the training lead has approved it.',
  'Do not share passwords, OTPs, certificate QR codes, or confidential citizen information in screenshots.',
];

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
          A self-service guide for using the Machakos County Integrated Project, Performance and Reporting Management
          System. Use this page to understand workflows, common tasks, module responsibilities, troubleshooting steps,
          and the information ICT needs when you request support.
        </Typography>
      </Paper>

      <Alert severity="info" sx={{ mb: 3 }}>
        The system is role-based. If a screen, button, project, or report is missing, first confirm your role,
        permissions, organisation scope, and active filters.
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
                  'Monitoring and evaluation',
                  'Finance tracking',
                  'Reporting',
                  'Public transparency',
                  'Administration and audit',
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
                'Did I save or confirm the action?',
                'Is the issue reproducible after refreshing the page?',
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
                Expand a section to see the purpose, route, steps, and good practice for each area.
              </Typography>
              {moduleGuides.map((guide, index) => (
                <Accordion key={guide.title} defaultExpanded={index < 2} disableGutters>
                  <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <Box sx={{ width: '100%' }}>
                      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ xs: 'flex-start', sm: 'center' }}>
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
                Do not send screenshots containing passwords, OTP codes, private tokens, or confidential personal data.
                Mask sensitive information before sharing support evidence.
              </Alert>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Box sx={{ mt: 3 }}>
        <Divider sx={{ mb: 2 }} />
        <Typography variant="body2" color="text.secondary">
          Tip: Open this page anytime from the top-right three-dot menu, then select Help &amp; Support.
        </Typography>
      </Box>
    </Container>
  );
};

export default HelpSupportPage;
