import React from 'react';
import {
  Card,
  CardContent,
  Typography,
  Grid,
  Box,
  LinearProgress,
  useTheme
} from '@mui/material';
import {
  AttachMoney as MoneyIcon,
  TrendingUp as TrendingUpIcon,
  Assessment as AssessmentIcon,
  Warning as WarningIcon
} from '@mui/icons-material';
import { tokens } from '../../../pages/dashboard/theme';
import FilteredDashboardComponent from '../FilteredDashboardComponent';
import projectService from '../../../api/projectService';
import { isAdmin } from '../../../utils/privilegeUtils.js';

/**
 * Budget Filtered Metrics Card - Shows budget metrics filtered by user's budget access limits
 */
const BudgetFilteredMetricsCardContent = ({ data, loading, error, user }) => {
  const theme = useTheme();
  const colors = tokens(theme.palette.mode);

  if (loading) {
    return (
      <Card sx={{ height: '100%', minHeight: 200 }}>
        <CardContent>
          <Typography variant="h6">Loading Budget Metrics...</Typography>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card sx={{ height: '100%', minHeight: 200 }}>
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

  const metrics = data || {
    totalBudget: 0,
    allocatedBudget: 0,
    spentBudget: 0,
    remainingBudget: 0,
    utilizationRate: 0,
    projectCount: 0
  };

  const utilizationPercentage = metrics.totalBudget > 0 
    ? (metrics.spentBudget / metrics.totalBudget) * 100 
    : 0;

  const getUtilizationColor = (percentage) => {
    if (percentage < 50) return colors.greenAccent[500];
    if (percentage < 80) return colors.blueAccent[500];
    return colors.redAccent[500];
  };

  return (
    <Card sx={{ 
      height: '100%',
      borderRadius: 3,
      bgcolor: theme.palette.mode === 'dark' ? colors.primary[400] : colors.primary[50],
      boxShadow: `0 4px 20px ${theme.palette.mode === 'dark' ? colors.primary[300] : colors.primary[200]}15`,
    }}>
      <CardContent sx={{ p: 3 }}>
        <Box display="flex" alignItems="center" mb={3}>
          <MoneyIcon sx={{ color: colors.greenAccent[500], mr: 1 }} />
          <Typography variant="h6" fontWeight="bold">
            Budget Overview
          </Typography>
        </Box>
        
        <Grid container spacing={3}>
          {/* Total Budget */}
          <Grid item xs={6} md={3}>
            <Box textAlign="center">
              <AssessmentIcon sx={{ color: colors.blueAccent[500], fontSize: '2rem', mb: 1 }} />
              <Typography variant="h5" fontWeight="bold" color={colors.blueAccent[500]}>
                {formatCurrency(metrics.totalBudget)}
              </Typography>
              <Typography variant="body2" color="textSecondary">
                Total Budget
              </Typography>
            </Box>
          </Grid>

          {/* Spent Budget */}
          <Grid item xs={6} md={3}>
            <Box textAlign="center">
              <TrendingUpIcon sx={{ color: colors.greenAccent[500], fontSize: '2rem', mb: 1 }} />
              <Typography variant="h5" fontWeight="bold" color={colors.greenAccent[500]}>
                {formatCurrency(metrics.spentBudget)}
              </Typography>
              <Typography variant="body2" color="textSecondary">
                Spent
              </Typography>
            </Box>
          </Grid>

          {/* Remaining Budget */}
          <Grid item xs={6} md={3}>
            <Box textAlign="center">
              <MoneyIcon sx={{ color: colors.grey[500], fontSize: '2rem', mb: 1 }} />
              <Typography variant="h5" fontWeight="bold" color={colors.grey[500]}>
                {formatCurrency(metrics.remainingBudget)}
              </Typography>
              <Typography variant="body2" color="textSecondary">
                Remaining
              </Typography>
            </Box>
          </Grid>

          {/* Project Count */}
          <Grid item xs={6} md={3}>
            <Box textAlign="center">
              <WarningIcon sx={{ color: colors.redAccent[500], fontSize: '2rem', mb: 1 }} />
              <Typography variant="h5" fontWeight="bold" color={colors.redAccent[500]}>
                {metrics.projectCount}
              </Typography>
              <Typography variant="body2" color="textSecondary">
                Projects
              </Typography>
            </Box>
          </Grid>

          {/* Budget Utilization Progress */}
          <Grid item xs={12}>
            <Box mt={2}>
              <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
                <Typography variant="body2" fontWeight="bold">
                  Budget Utilization
                </Typography>
                <Typography variant="body2" color={getUtilizationColor(utilizationPercentage)}>
                  {utilizationPercentage.toFixed(1)}%
                </Typography>
              </Box>
              <LinearProgress
                variant="determinate"
                value={Math.min(utilizationPercentage, 100)}
                sx={{
                  height: 8,
                  borderRadius: 4,
                  bgcolor: theme.palette.mode === 'dark' ? colors.grey[700] : colors.grey[300],
                  '& .MuiLinearProgress-bar': {
                    bgcolor: getUtilizationColor(utilizationPercentage),
                    borderRadius: 4,
                  },
                }}
              />
            </Box>
          </Grid>
        </Grid>
      </CardContent>
    </Card>
  );
};

// Data fetcher for budget metrics
const fetchBudgetMetricsData = async (user, accessConfig) => {
  try {
    // Get projects based on user's access configuration
    let projects = [];
    
    if (accessConfig?.userProjects?.length > 0) {
      // User has specific project assignments
      projects = await projectService.getProjectsByIds(accessConfig.userProjects);
    } else if (accessConfig?.userDepartments?.length > 0) {
      // User has department assignments
      projects = await projectService.getProjectsByDepartments(accessConfig.userDepartments);
    } else if (accessConfig?.userWards?.length > 0) {
      // User has ward assignments
      projects = await projectService.getProjectsByWards(accessConfig.userWards);
    } else if (isAdmin(user)) {
      // Admin sees all projects
      projects = await projectService.getAllProjects();
    }

    // Apply budget filter if configured
    if (accessConfig?.budgetRange) {
      const { min, max } = accessConfig.budgetRange;
      projects = projects.filter(project => {
        const budget = project.allocatedBudget || project.budget || 0;
        return budget >= min && budget <= max;
      });
    }

    // Calculate metrics
    const totalBudget = projects.reduce((sum, p) => sum + (p.allocatedBudget || 0), 0);
    const spentBudget = projects.reduce((sum, p) => sum + (p.amountPaid || 0), 0);
    const allocatedBudget = projects.reduce((sum, p) => sum + (p.contractSum || 0), 0);
    const remainingBudget = totalBudget - spentBudget;

    return {
      totalBudget,
      allocatedBudget,
      spentBudget,
      remainingBudget,
      utilizationRate: totalBudget > 0 ? (spentBudget / totalBudget) * 100 : 0,
      projectCount: projects.length
    };
  } catch (error) {
    console.error('Error fetching budget metrics:', error);
    throw error;
  }
};

// Main component with filtering
const BudgetFilteredMetricsCard = (props) => {
  return (
    <FilteredDashboardComponent
      componentKey="budgetMetrics"
      dataFetcher={fetchBudgetMetricsData}
      {...props}
    >
      <BudgetFilteredMetricsCardContent />
    </FilteredDashboardComponent>
  );
};

export default BudgetFilteredMetricsCard;
