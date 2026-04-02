import React from 'react';
import {
  Box,
  Grid,
  Card,
  CardContent,
  Typography,
  Avatar,
  Chip,
  Button,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Divider,
  LinearProgress,
  useTheme,
} from '@mui/material';
import {
  Assignment as AssignmentIcon,
  People as PeopleIcon,
  TrendingUp as TrendingUpIcon,
  Warning as WarningIcon,
  CheckCircle as CheckCircleIcon,
  Schedule as ScheduleIcon,
  AttachMoney as MoneyIcon,
  Assessment as AssessmentIcon,
  Build as BuildIcon,
  Security as SecurityIcon,
  SupervisorAccount as SupervisorIcon,
} from '@mui/icons-material';
import { tokens } from '../../pages/dashboard/theme';
import { isAdmin, normalizeRoleName } from '../../utils/privilegeUtils.js';

const RoleBasedDashboard = ({ user, dashboardData }) => {
  const theme = useTheme();
  const colors = tokens(theme.palette.mode);

  // Admin Dashboard Components
  const AdminDashboard = () => (
    <Grid container spacing={3}>
      <Grid item xs={12} md={6}>
        <Card sx={{ bgcolor: colors.primary[400], borderRadius: 3 }}>
          <CardContent>
            <Typography variant="h6" fontWeight="bold" color={colors.grey[100]} mb={2}>
              System Overview
            </Typography>
            <List>
              <ListItem>
                <ListItemIcon>
                  <Avatar sx={{ bgcolor: colors.blueAccent[500], width: 32, height: 32 }}>
                    <PeopleIcon />
                  </Avatar>
                </ListItemIcon>
                <ListItemText
                  primary="Total Users"
                  secondary={`${dashboardData.metrics?.totalUsers || 0} registered`}
                  primaryTypographyProps={{ color: colors.grey[100] }}
                  secondaryTypographyProps={{ color: colors.grey[300] }}
                />
              </ListItem>
              <ListItem>
                <ListItemIcon>
                  <Avatar sx={{ bgcolor: colors.greenAccent[500], width: 32, height: 32 }}>
                    <AssignmentIcon />
                  </Avatar>
                </ListItemIcon>
                <ListItemText
                  primary="Active Projects"
                  secondary={`${dashboardData.metrics?.activeProjects || 0} in progress`}
                  primaryTypographyProps={{ color: colors.grey[100] }}
                  secondaryTypographyProps={{ color: colors.grey[300] }}
                />
              </ListItem>
              <ListItem>
                <ListItemIcon>
                  <Avatar sx={{ bgcolor: colors.yellowAccent[500], width: 32, height: 32 }}>
                    <WarningIcon />
                  </Avatar>
                </ListItemIcon>
                <ListItemText
                  primary="Pending Approvals"
                  secondary={`${dashboardData.metrics?.pendingApprovals || 0} awaiting review`}
                  primaryTypographyProps={{ color: colors.grey[100] }}
                  secondaryTypographyProps={{ color: colors.grey[300] }}
                />
              </ListItem>
            </List>
          </CardContent>
        </Card>
      </Grid>
      
      <Grid item xs={12} md={6}>
        <Card sx={{ bgcolor: colors.primary[400], borderRadius: 3 }}>
          <CardContent>
            <Typography variant="h6" fontWeight="bold" color={colors.grey[100]} mb={2}>
              Quick Actions
            </Typography>
            <Box display="flex" flexDirection="column" gap={2}>
              <Button
                variant="contained"
                startIcon={<PeopleIcon />}
                sx={{ 
                  bgcolor: colors.blueAccent[500],
                  '&:hover': { bgcolor: colors.blueAccent[600] }
                }}
              >
                Manage Users
              </Button>
              <Button
                variant="contained"
                startIcon={<AssignmentIcon />}
                sx={{ 
                  bgcolor: colors.greenAccent[500],
                  '&:hover': { bgcolor: colors.greenAccent[600] }
                }}
              >
                Create Project
              </Button>
              <Button
                variant="contained"
                startIcon={<AssessmentIcon />}
                sx={{ 
                  bgcolor: colors.yellowAccent[500],
                  '&:hover': { bgcolor: colors.yellowAccent[600] }
                }}
              >
                View Reports
              </Button>
            </Box>
          </CardContent>
        </Card>
      </Grid>
    </Grid>
  );

  // Contractor Dashboard Components
  const ContractorDashboard = () => (
    <Grid container spacing={3}>
      <Grid item xs={12} md={6}>
        <Card sx={{ bgcolor: colors.primary[400], borderRadius: 3 }}>
          <CardContent>
            <Typography variant="h6" fontWeight="bold" color={colors.grey[100]} mb={2}>
              My Projects
            </Typography>
            <List>
              <ListItem>
                <ListItemIcon>
                  <Avatar sx={{ bgcolor: colors.blueAccent[500], width: 32, height: 32 }}>
                    <AssignmentIcon />
                  </Avatar>
                </ListItemIcon>
                <ListItemText
                  primary="Assigned Projects"
                  secondary={`${dashboardData.metrics?.assignedProjects || 0} projects`}
                  primaryTypographyProps={{ color: colors.grey[100] }}
                  secondaryTypographyProps={{ color: colors.grey[300] }}
                />
              </ListItem>
              <ListItem>
                <ListItemIcon>
                  <Avatar sx={{ bgcolor: colors.greenAccent[500], width: 32, height: 32 }}>
                    <CheckCircleIcon />
                  </Avatar>
                </ListItemIcon>
                <ListItemText
                  primary="Completed Tasks"
                  secondary={`${dashboardData.metrics?.completedTasks || 0} this month`}
                  primaryTypographyProps={{ color: colors.grey[100] }}
                  secondaryTypographyProps={{ color: colors.grey[300] }}
                />
              </ListItem>
              <ListItem>
                <ListItemIcon>
                  <Avatar sx={{ bgcolor: colors.yellowAccent[500], width: 32, height: 32 }}>
                    <MoneyIcon />
                  </Avatar>
                </ListItemIcon>
                <ListItemText
                  primary="Payment Status"
                  secondary={`${dashboardData.metrics?.paymentStatus || 'Pending'}`}
                  primaryTypographyProps={{ color: colors.grey[100] }}
                  secondaryTypographyProps={{ color: colors.grey[300] }}
                />
              </ListItem>
            </List>
          </CardContent>
        </Card>
      </Grid>
      
      <Grid item xs={12} md={6}>
        <Card sx={{ bgcolor: colors.primary[400], borderRadius: 3 }}>
          <CardContent>
            <Typography variant="h6" fontWeight="bold" color={colors.grey[100]} mb={2}>
              Project Progress
            </Typography>
            <Box mb={2}>
              <Box display="flex" justifyContent="space-between" mb={1}>
                <Typography variant="body2" color={colors.grey[200]}>
                  Water Management
                </Typography>
                <Typography variant="body2" color={colors.grey[300]}>
                  75%
                </Typography>
              </Box>
              <LinearProgress 
                variant="determinate" 
                value={75} 
                sx={{ 
                  bgcolor: colors.primary[300],
                  '& .MuiLinearProgress-bar': { bgcolor: colors.greenAccent[500] }
                }}
              />
            </Box>
            <Box mb={2}>
              <Box display="flex" justifyContent="space-between" mb={1}>
                <Typography variant="body2" color={colors.grey[200]}>
                  Infrastructure
                </Typography>
                <Typography variant="body2" color={colors.grey[300]}>
                  45%
                </Typography>
              </Box>
              <LinearProgress 
                variant="determinate" 
                value={45} 
                sx={{ 
                  bgcolor: colors.primary[300],
                  '& .MuiLinearProgress-bar': { bgcolor: colors.blueAccent[500] }
                }}
              />
            </Box>
            <Box>
              <Box display="flex" justifyContent="space-between" mb={1}>
                <Typography variant="body2" color={colors.grey[200]}>
                  Health Initiative
                </Typography>
                <Typography variant="body2" color={colors.grey[300]}>
                  90%
                </Typography>
              </Box>
              <LinearProgress 
                variant="determinate" 
                value={90} 
                sx={{ 
                  bgcolor: colors.primary[300],
                  '& .MuiLinearProgress-bar': { bgcolor: colors.yellowAccent[500] }
                }}
              />
            </Box>
          </CardContent>
        </Card>
      </Grid>
    </Grid>
  );

  // Regular User Dashboard Components
  const UserDashboard = () => (
    <Grid container spacing={3}>
      <Grid item xs={12} md={6}>
        <Card sx={{ bgcolor: colors.primary[400], borderRadius: 3 }}>
          <CardContent>
            <Typography variant="h6" fontWeight="bold" color={colors.grey[100]} mb={2}>
              My Tasks
            </Typography>
            <List>
              <ListItem>
                <ListItemIcon>
                  <Avatar sx={{ bgcolor: colors.blueAccent[500], width: 32, height: 32 }}>
                    <ScheduleIcon />
                  </Avatar>
                </ListItemIcon>
                <ListItemText
                  primary="Today's Tasks"
                  secondary={`${dashboardData.metrics?.todayTasks || 0} tasks`}
                  primaryTypographyProps={{ color: colors.grey[100] }}
                  secondaryTypographyProps={{ color: colors.grey[300] }}
                />
              </ListItem>
              <ListItem>
                <ListItemIcon>
                  <Avatar sx={{ bgcolor: colors.greenAccent[500], width: 32, height: 32 }}>
                    <CheckCircleIcon />
                  </Avatar>
                </ListItemIcon>
                <ListItemText
                  primary="Completed This Week"
                  secondary={`${dashboardData.metrics?.completedThisWeek || 0} tasks`}
                  primaryTypographyProps={{ color: colors.grey[100] }}
                  secondaryTypographyProps={{ color: colors.grey[300] }}
                />
              </ListItem>
              <ListItem>
                <ListItemIcon>
                  <Avatar sx={{ bgcolor: colors.yellowAccent[500], width: 32, height: 32 }}>
                    <WarningIcon />
                  </Avatar>
                </ListItemIcon>
                <ListItemText
                  primary="Overdue Tasks"
                  secondary={`${dashboardData.metrics?.overdueTasks || 0} tasks`}
                  primaryTypographyProps={{ color: colors.grey[100] }}
                  secondaryTypographyProps={{ color: colors.grey[300] }}
                />
              </ListItem>
            </List>
          </CardContent>
        </Card>
      </Grid>
      
      <Grid item xs={12} md={6}>
        <Card sx={{ bgcolor: colors.primary[400], borderRadius: 3 }}>
          <CardContent>
            <Typography variant="h6" fontWeight="bold" color={colors.grey[100]} mb={2}>
              Quick Access
            </Typography>
            <Box display="flex" flexDirection="column" gap={2}>
              <Button
                variant="contained"
                startIcon={<AssignmentIcon />}
                sx={{ 
                  bgcolor: colors.blueAccent[500],
                  '&:hover': { bgcolor: colors.blueAccent[600] }
                }}
              >
                View My Projects
              </Button>
              <Button
                variant="contained"
                startIcon={<ScheduleIcon />}
                sx={{ 
                  bgcolor: colors.greenAccent[500],
                  '&:hover': { bgcolor: colors.greenAccent[600] }
                }}
              >
                My Schedule
              </Button>
              <Button
                variant="contained"
                startIcon={<AssessmentIcon />}
                sx={{ 
                  bgcolor: colors.yellowAccent[500],
                  '&:hover': { bgcolor: colors.yellowAccent[600] }
                }}
              >
                Submit Report
              </Button>
            </Box>
          </CardContent>
        </Card>
      </Grid>
    </Grid>
  );

  // Render role-specific dashboard
  const renderRoleDashboard = () => {
    const roleName = normalizeRoleName(user?.roleName || user?.role);
    if (isAdmin(user)) {
      return <AdminDashboard />;
    }
    switch (roleName) {
      case 'mda_ict_admin':
      case 'super_admin':
      case 'administrator':
        return <AdminDashboard />;
      case 'contractor':
        return <ContractorDashboard />;
      default:
        return <UserDashboard />;
    }
  };

  return (
    <Box>
      <Typography variant="h5" fontWeight="bold" color={colors.grey[100]} mb={3}>
        {isAdmin(user) ? 'System Management' : 
         user?.roleName === 'contractor' ? 'Personal Dashboard' : 
         'Personal Dashboard'}
      </Typography>
      {renderRoleDashboard()}
    </Box>
  );
};

export default RoleBasedDashboard;
