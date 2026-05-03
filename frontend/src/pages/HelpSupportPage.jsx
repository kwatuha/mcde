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
                Programs & Sub Programs Guide
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
                    primary="Step 2: Add Programs"
                    secondary="Inside the selected plan details, go to Programs and click Add Program."
                  />
                </ListItem>
                <ListItem>
                  <ListItemText
                    primary="Step 3: Add Sub Programs"
                    secondary="Under each Program, click Add Sub Program and save."
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
