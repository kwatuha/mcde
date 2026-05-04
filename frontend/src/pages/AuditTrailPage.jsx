import React from 'react';
import { Box, Container, Typography } from '@mui/material';
import AuditTrailViewer from '../components/admin/AuditTrailViewer';
import { useAuth } from '../context/AuthContext';
import { isAdmin } from '../utils/privilegeUtils';

const AuditTrailPage = () => {
  const { user } = useAuth();
  const hasAdminAccess = isAdmin(user);

  if (!hasAdminAccess) {
    return (
      <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <Typography variant="h5" color="error" gutterBottom>
            Access Denied
          </Typography>
          <Typography variant="body1" color="textSecondary">
            You don&apos;t have permission to view the audit trail.
          </Typography>
        </Box>
      </Container>
    );
  }

  return (
    <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
      <Typography variant="h4" fontWeight="bold" sx={{ mb: 1 }}>
        Audit trail
      </Typography>
      <AuditTrailViewer />
    </Container>
  );
};

export default AuditTrailPage;
