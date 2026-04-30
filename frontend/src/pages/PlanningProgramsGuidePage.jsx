import React from 'react';
import { Box, Button, Card, CardContent, Stack, Typography } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';

function PlanningProgramsGuidePage() {
  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" sx={{ fontWeight: 700, mb: 2 }}>
        How to Create Programs and Sub Programs
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
        Use this quick guide to register a CIDP/ADP plan, then add Programs and Sub Programs under that plan.
      </Typography>

      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" sx={{ mb: 1.5 }}>
            Step 1: Create or Open a CIDP Registry
          </Typography>
          <Typography variant="body2" sx={{ mb: 2 }}>
            Go to CIDP Registry, click Add New, enter the plan details (name, start date, end date), then open the plan.
          </Typography>
          <Button component={RouterLink} to="/strategic-planning" variant="contained">
            Open CIDP Registry
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Typography variant="h6" sx={{ mb: 1.5 }}>
            Step 2: Add Programs and Sub Programs
          </Typography>
          <Stack spacing={1.25} sx={{ mb: 2 }}>
            <Typography variant="body2">1. Open a plan from CIDP Registry and go to its details page.</Typography>
            <Typography variant="body2">2. In the Programs section, click Add Program and save.</Typography>
            <Typography variant="body2">3. Under each Program, click Add Sub Program and save.</Typography>
            <Typography variant="body2">4. Continue with activities and annual work plans as needed.</Typography>
          </Stack>
          <Button component={RouterLink} to="/strategic-planning" variant="outlined">
            Go to Strategic Planning
          </Button>
        </CardContent>
      </Card>
    </Box>
  );
}

export default PlanningProgramsGuidePage;
