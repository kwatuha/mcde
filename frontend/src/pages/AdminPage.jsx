import React from 'react';
import { Box, Container, Typography } from '@mui/material';
import AdminDashboard from '../components/admin/AdminDashboard';
import { useAuth } from '../context/AuthContext';
import { isAdmin } from '../utils/privilegeUtils';

const AdminPage = () => {
  const { user } = useAuth();

  // Check if user has admin privileges
  const hasAdminAccess = isAdmin(user);

  if (!hasAdminAccess) {
    return (
      <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <Typography variant="h5" color="error" gutterBottom>
            Access Denied
          </Typography>
          <Typography variant="body1" color="textSecondary">
            You don't have permission to access the admin dashboard.
          </Typography>
        </Box>
      </Container>
    );
  }

  return (
    <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
      <AdminDashboard />
    </Container>
  );
};

export default AdminPage;
