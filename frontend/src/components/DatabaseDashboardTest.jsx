import React, { useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Alert,
  CircularProgress,
  useTheme,
} from '@mui/material';
import { tokens } from '../pages/dashboard/theme';
import DatabaseDrivenTabbedDashboard from './DatabaseDrivenTabbedDashboard';
import { normalizeRoleName } from '../utils/privilegeUtils.js';

const DatabaseDashboardTest = () => {
  const theme = useTheme();
  const colors = tokens(theme.palette.mode);
  
  const [testStatus, setTestStatus] = useState('ready');
  const [error, setError] = useState(null);

  // Mock user data for testing
  const testUsers = {
    admin: {
      id: 1,
      name: 'Dr. Aisha Mwangi',
      email: 'aisha.mwangi@company.com',
      role: 'admin',
      department: 'IT'
    },
    contractor: {
      id: 2,
      name: 'John Kiprotich',
      email: 'john.kiprotich@contractor.com',
      role: 'contractor',
      department: 'Construction'
    }
  };

  const [currentUser, setCurrentUser] = useState(testUsers.admin);
  const isSelectedUserAdmin = normalizeRoleName(currentUser?.role) === 'admin';

  // Mock dashboard data
  const mockDashboardData = {
    metrics: {
      totalProjects: 24,
      completedProjects: 18,
      activeProjects: 6
    },
    notifications: [
      { id: 1, message: 'New project assigned', type: 'info' },
      { id: 2, message: 'Payment request approved', type: 'success' }
    ]
  };

  const handleTestDatabaseDashboard = () => {
    setTestStatus('testing');
    setError(null);
    
    try {
      // Simulate API call delay
      setTimeout(() => {
        setTestStatus('success');
      }, 1000);
    } catch (err) {
      setError(err.message);
      setTestStatus('error');
    }
  };

  const handleSwitchUser = (userType) => {
    setCurrentUser(testUsers[userType]);
    setTestStatus('ready');
    setError(null);
  };

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" fontWeight="bold" color={theme.palette.mode === 'dark' ? colors.grey[100] : colors.grey[900]} mb={3}>
        Dashboard Configuration
      </Typography>

      {/* Test Controls */}
      <Card sx={{ 
        mb: 3,
        borderRadius: 3, 
        bgcolor: theme.palette.mode === 'dark' ? colors.primary[400] : colors.primary[50],
        boxShadow: `0 4px 20px ${theme.palette.mode === 'dark' ? colors.primary[300] : colors.primary[200]}15`,
        border: `1px solid ${theme.palette.mode === 'dark' ? colors.primary[300] : colors.primary[200]}30`,
      }}>
        <CardContent>
          <Typography variant="h6" fontWeight="bold" color={theme.palette.mode === 'dark' ? colors.grey[100] : colors.grey[900]} mb={2}>
            Role Configuration
          </Typography>
          
          <Box display="flex" gap={2} mb={2}>
            <Button
              variant={isSelectedUserAdmin ? 'contained' : 'outlined'}
              onClick={() => handleSwitchUser('admin')}
              sx={{ 
                bgcolor: isSelectedUserAdmin ? colors.redAccent?.[500] : 'transparent',
                borderColor: colors.redAccent?.[500],
                color: isSelectedUserAdmin ? 'white' : colors.redAccent?.[500]
              }}
            >
              Admin User
            </Button>
            <Button
              variant={currentUser.role === 'contractor' ? 'contained' : 'outlined'}
              onClick={() => handleSwitchUser('contractor')}
              sx={{ 
                bgcolor: currentUser.role === 'contractor' ? colors.blueAccent?.[500] : 'transparent',
                borderColor: colors.blueAccent?.[500],
                color: currentUser.role === 'contractor' ? 'white' : colors.blueAccent?.[500]
              }}
            >
              Contractor User
            </Button>
          </Box>

          <Box display="flex" alignItems="center" gap={2}>
            <Typography variant="body2" color={theme.palette.mode === 'dark' ? colors.grey[300] : colors.grey[600]}>
              Current User: <strong>{currentUser.name}</strong> ({currentUser.role})
            </Typography>
            <Button
              variant="contained"
              onClick={handleTestDatabaseDashboard}
              disabled={testStatus === 'testing'}
              sx={{ 
                bgcolor: colors.greenAccent?.[500] || '#4caf50',
                '&:hover': { bgcolor: colors.greenAccent?.[600] || '#388e3c' }
              }}
            >
              {testStatus === 'testing' ? (
                <>
                  <CircularProgress size={16} sx={{ mr: 1 }} />
                  Loading...
                </>
              ) : (
                'Load Dashboard'
              )}
            </Button>
          </Box>

          {testStatus === 'success' && (
            <Alert severity="success" sx={{ mt: 2 }}>
              Dashboard configuration loaded successfully! The dashboard will show different components based on the user's role.
            </Alert>
          )}

          {error && (
            <Alert severity="error" sx={{ mt: 2 }}>
              Error: {error}
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Database Dashboard Preview */}
      <Card sx={{ 
        borderRadius: 3, 
        bgcolor: theme.palette.mode === 'dark' ? colors.primary[400] : colors.primary[50],
        boxShadow: `0 4px 20px ${theme.palette.mode === 'dark' ? colors.primary[300] : colors.primary[200]}15`,
        border: `1px solid ${theme.palette.mode === 'dark' ? colors.primary[300] : colors.primary[200]}30`,
      }}>
        <CardContent>
          <Typography variant="h6" fontWeight="bold" color={theme.palette.mode === 'dark' ? colors.grey[100] : colors.grey[900]} mb={3}>
            Dashboard Preview
          </Typography>
          
          <Alert severity="info" sx={{ mb: 3 }}>
            <Typography variant="body2">
              This dashboard is now driven by database configuration. 
              {isSelectedUserAdmin && ' Admin users see all tabs: Overview, Projects, Collaboration, Analytics.'}
              {currentUser.role === 'contractor' && ' Contractor users see: Overview, Projects, Payments.'}
            </Typography>
          </Alert>
          
          <DatabaseDrivenTabbedDashboard 
            user={currentUser} 
            dashboardData={mockDashboardData} 
          />
        </CardContent>
      </Card>
    </Box>
  );
};

export default DatabaseDashboardTest;
