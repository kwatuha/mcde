import React from 'react';
import {
  Card,
  CardContent,
  Typography,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Chip,
  Box,
  useTheme
} from '@mui/material';
import {
  LocationOn as LocationIcon,
  Assignment as ProjectIcon,
  AttachMoney as BudgetIcon
} from '@mui/icons-material';
import { tokens } from '../../../pages/dashboard/theme';
import FilteredDashboardComponent from '../FilteredDashboardComponent';
import projectService from '../../../api/projectService';
import { isAdmin } from '../../../utils/privilegeUtils.js';

/**
 * Regional Projects Card - Shows projects filtered by user's ward/subcounty assignments
 */
const RegionalProjectsCardContent = ({ data, loading, error, user }) => {
  const theme = useTheme();
  const colors = tokens(theme.palette.mode);

  if (loading) {
    return (
      <Card sx={{ height: '100%', minHeight: 300 }}>
        <CardContent>
          <Typography variant="h6">Loading Regional Projects...</Typography>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card sx={{ height: '100%', minHeight: 300 }}>
        <CardContent>
          <Typography variant="h6" color="error">Error: {error}</Typography>
        </CardContent>
      </Card>
    );
  }

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-KE', {
      style: 'currency',
      currency: 'KES',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const getStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case 'active': return colors.greenAccent[500];
      case 'planning': return colors.blueAccent[500];
      case 'completed': return colors.grey[500];
      case 'on-hold': return colors.redAccent[500];
      default: return colors.grey[400];
    }
  };

  return (
    <Card sx={{ 
      height: '100%', 
      minHeight: 300,
      borderRadius: 3,
      bgcolor: theme.palette.mode === 'dark' ? colors.primary[400] : colors.primary[50],
      boxShadow: `0 4px 20px ${theme.palette.mode === 'dark' ? colors.primary[300] : colors.primary[200]}15`,
    }}>
      <CardContent sx={{ p: 3 }}>
        <Box display="flex" alignItems="center" mb={2}>
          <LocationIcon sx={{ color: colors.blueAccent[500], mr: 1 }} />
          <Typography variant="h6" fontWeight="bold">
            Regional Projects ({data?.length || 0})
          </Typography>
        </Box>
        
        {data && data.length > 0 ? (
          <List sx={{ maxHeight: 250, overflow: 'auto' }}>
            {data.map((project, index) => (
              <ListItem key={project.id || index} sx={{ px: 0, py: 1 }}>
                <ListItemIcon>
                  <ProjectIcon sx={{ color: colors.blueAccent[500] }} />
                </ListItemIcon>
                <ListItemText
                  primary={
                    <Box display="flex" alignItems="center" gap={1}>
                      <Typography variant="body2" fontWeight="bold">
                        {project.projectName || project.name}
                      </Typography>
                      <Chip 
                        label={project.status || 'Unknown'} 
                        size="small"
                        sx={{ 
                          bgcolor: getStatusColor(project.status),
                          color: 'white',
                          fontSize: '0.7rem'
                        }}
                      />
                    </Box>
                  }
                  secondary={
                    <Box>
                      <Typography variant="caption" display="block">
                        Ward: {project.wardName || project.ward || 'N/A'}
                      </Typography>
                      <Typography variant="caption" display="block">
                        Budget: {formatCurrency(project.allocatedBudget || project.budget || 0)}
                      </Typography>
                    </Box>
                  }
                />
              </ListItem>
            ))}
          </List>
        ) : (
          <Typography variant="body2" color="textSecondary" textAlign="center" py={4}>
            No projects found for your assigned regions
          </Typography>
        )}
      </CardContent>
    </Card>
  );
};

// Data fetcher for regional projects
const fetchRegionalProjectsData = async (user, accessConfig) => {
  try {
    // If user has ward assignments, filter by those wards
    if (accessConfig?.userWards?.length > 0) {
      const projects = await projectService.getProjectsByWards(accessConfig.userWards);
      return projects;
    }
    
    // If user has department assignments, filter by departments
    if (accessConfig?.userDepartments?.length > 0) {
      const projects = await projectService.getProjectsByDepartments(accessConfig.userDepartments);
      return projects;
    }
    
    // If admin or no specific assignments, return all projects
    if (isAdmin(user)) {
      const projects = await projectService.getAllProjects();
      return projects;
    }
    
    return [];
  } catch (error) {
    console.error('Error fetching regional projects:', error);
    throw error;
  }
};

// Main component with filtering
const RegionalProjectsCard = (props) => {
  return (
    <FilteredDashboardComponent
      componentKey="regionalProjects"
      dataFetcher={fetchRegionalProjectsData}
      {...props}
    >
      <RegionalProjectsCardContent />
    </FilteredDashboardComponent>
  );
};

export default RegionalProjectsCard;
