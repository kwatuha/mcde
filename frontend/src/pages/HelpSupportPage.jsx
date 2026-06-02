import React from 'react';
import {
  Alert,
  Box,
  Card,
  CardContent,
  Container,
  Divider,
  Grid,
  List,
  ListItem,
  ListItemText,
  Typography,
} from '@mui/material';

const HelpSupportPage = () => {
  return (
    <Container maxWidth="lg" sx={{ py: 3 }}>
      <Typography variant="h4" sx={{ fontWeight: 700, mb: 1 }}>
        Help & Support
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
        Quick user documentation for navigating and using the Machakos County Monitoring and Evaluation System.
      </Typography>

      <Grid container spacing={2}>
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>
                Getting Started
              </Typography>
              <List dense disablePadding>
                <ListItem>
                  <ListItemText primary="1. Log in with your assigned username and password." />
                </ListItem>
                <ListItem>
                  <ListItemText primary="2. Use the sidebar to open modules such as Projects, Reports, and User Management." />
                </ListItem>
                <ListItem>
                  <ListItemText primary="3. Use dashboard cards to monitor project status and performance at a glance." />
                </ListItem>
                <ListItem>
                  <ListItemText primary="4. Use your profile menu to update profile details and change your password." />
                </ListItem>
              </List>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>
                Common Tasks
              </Typography>
              <List dense disablePadding>
                <ListItem>
                  <ListItemText
                    primary="Register a new project"
                    secondary="Open Projects and use Add New Project. Fill required fields, then save."
                  />
                </ListItem>
                <ListItem>
                  <ListItemText
                    primary="Manage users"
                    secondary="Open User Management to add, edit, void, or restore users (role-based access applies)."
                  />
                </ListItem>
                <ListItem>
                  <ListItemText
                    primary="Import agencies"
                    secondary="Open Agencies and use Import. You can provide a custom server file path."
                  />
                </ListItem>
                <ListItem>
                  <ListItemText
                    primary="Reset your password"
                    secondary="Use Change Password from the three-dot menu. If prompted, complete forced password change before proceeding."
                  />
                </ListItem>
              </List>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>
                Programmes & Sub-programmes Guide
              </Typography>
              <Divider sx={{ mb: 2 }} />
              <List dense disablePadding>
                <ListItem>
                  <ListItemText
                    primary="Step 1: Create or open CIDP"
                    secondary="Open Planning > CIDP, click Add New, fill plan details (name, start date, end date), then open the plan."
                  />
                </ListItem>
                <ListItem>
                  <ListItemText
                    primary="Step 2: Add Programmes"
                    secondary="Inside the selected plan details, go to Programmes and click Add Programme."
                  />
                </ListItem>
                <ListItem>
                  <ListItemText
                    primary="Step 3: Add Sub-programmes"
                    secondary="Under each Programme, click Add Sub-programme and save."
                  />
                </ListItem>
                <ListItem>
                  <ListItemText
                    primary="Step 4: Continue planning flow"
                    secondary="Proceed to activities and annual work plans as needed."
                  />
                </ListItem>
              </List>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>
                Planning — Project activities catalog
              </Typography>
              <Divider sx={{ mb: 2 }} />
              <Typography variant="body2" color="text.secondary">
                Define activities with a short code and link each to an indicator so progress can be measured consistently.
                Create KPIs / indicators first under <strong>Indicators &amp; KPIs</strong> (Planning). Later, projects can
                reference these activities when you attach delivery to indicators. For a standard risk register (code,
                name, description), use <strong>Project Risks</strong> (Planning). To attach catalog activities to a live
                project, use the Projects menu <strong>Project Activities</strong> screen (Project activity links).
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>
                Approval Workflows Guide
              </Typography>
              <Divider sx={{ mb: 2 }} />
              <List dense disablePadding>
                <ListItem>
                  <ListItemText
                    primary="Generic approval workflows"
                    secondary="Use workflow definitions and ordered role-based steps for new features."
                  />
                </ListItem>
                <ListItem>
                  <ListItemText
                    primary="How requests move"
                    secondary='Each definition uses an entity_type (for example annual_workplan or payment_request). Optional "Open item link" on the definition uses placeholders {{entity_id}} and {{request_id}} for approver deep links. Approvers see items when their role matches the current step (home dashboard + strategic plan accordion).'
                  />
                </ListItem>
                <ListItem>
                  <ListItemText
                    primary="How to start from your feature"
                    secondary="Call POST /api/approval-workflow/requests/start with entityType and entityId."
                  />
                </ListItem>
              </List>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>
                Procurement (Bidder Flow)
              </Typography>
              <Divider sx={{ mb: 2 }} />
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Register all bidders once in Bidder Registry (master list). Pre-Qualification starts from Registry, then bidders drop off as they fail qualification.
                Bid Evaluation lists only qualified pre-qualified bidders; Award Decision lists bidders qualified at Bid Evaluation; Contract Signing lists the bidder marked Awarded at Award.
                Stage transitions enforce gate rules (minimum qualified bidders and optional minimum score in procurement_stage_gate_rules).
                If no one qualifies or procurement must stop, use assessment decision Terminated at Pre-Qualification or Bid Evaluation, then save a workflow step with Stage set to Procurement Terminated to record closure without award.
                To readvertise (a new tender round), move the Stage selector back to Tender Published—backward moves skip gates; you do not need a separate “re-advertise” stage in the catalog (void or hide that label under Procurement stages if it was added).
              </Typography>
              <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 0.5 }}>
                Purchase orders &amp; Kenya financial year (30 June)
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Under Kenya PFM practice, budget commitments tied to an LPO/PO typically must be utilised or paid within the financial year; amounts not covered by payment/commitment before the year-end (30 June) are treated as lapsed—often requiring cancellation of the old commitment and a fresh procurement action that produces a new PO for continued spend.
                In this app, record each PO under Purchase Order Issued (reference, issue date, acknowledgement). If you issue a replacement PO after a lapse, tick &quot;supersedes prior lapsed PO&quot; and capture the prior PO reference and notes; you may add another workflow step at the same stage when a new PO is registered.
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>
                Troubleshooting
              </Typography>
              <Divider sx={{ mb: 2 }} />
              <List dense disablePadding>
                <ListItem>
                  <ListItemText
                    primary="I cannot sign in"
                    secondary="Confirm your username and password. If your account was deactivated, contact a system administrator for restoration."
                  />
                </ListItem>
                <ListItem>
                  <ListItemText
                    primary="I get an authorization error"
                    secondary="Your role may not have the required privilege. Contact your administrator to update role permissions."
                  />
                </ListItem>
                <ListItem>
                  <ListItemText
                    primary="Import failed"
                    secondary="Confirm the CSV structure, field names, and server file path. Then retry the import."
                  />
                </ListItem>
              </List>
              <Alert severity="info" sx={{ mt: 2 }}>
                Need additional help? Contact your system administrator or ICT support team with screenshots and the exact error message.
              </Alert>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Box sx={{ mt: 3 }}>
        <Typography variant="body2" color="text.secondary">
          Tip: Open this page anytime from the top-right three-dot menu, then select Help & Support.
        </Typography>
      </Box>
    </Container>
  );
};

export default HelpSupportPage;
