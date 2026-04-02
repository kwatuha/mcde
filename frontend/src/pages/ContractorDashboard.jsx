import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Typography, Button, Paper, Grid, CircularProgress, Alert,
  List, ListItem, ListItemText,
  Chip, Snackbar, Card, CardContent
} from '@mui/material';
import {
  Visibility as VisibilityIcon,
  PendingActions as PendingActionsIcon,
  CheckCircle as CheckCircleIcon,
  RateReview as RateReviewIcon,
  PersonAdd as PersonAddIcon,
  People as PeopleIcon
} from '@mui/icons-material';
import { useAuth } from '../context/AuthContext.jsx';
import { isAdmin } from '../utils/privilegeUtils.js';
import apiService from '../api';

const PersonalDashboard = () => {
  const navigate = useNavigate();
  const { user, authLoading, hasPrivilege } = useAuth();
 
  const contractorId = user?.contractorId;

  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
  
  // User approval management states
  const [pendingUsers, setPendingUsers] = useState([]);
  const [approvedUsersSummary, setApprovedUsersSummary] = useState(null);
  const [loadingUsers, setLoadingUsers] = useState(false);
  
  // Check if user can approve users
  const canApproveUsers = isAdmin(user) || hasPrivilege('user.update') || hasPrivilege('user.approve');
const fetchData = useCallback(async () => {
  console.log("Starting fetchData...");
  setLoading(true);
  setError(null);
  
  // Log the user details here
  console.log("User details before fetching projects:", user);
  console.log("Contractor ID being used:", contractorId);

  if (!contractorId) {
    console.error("fetchData aborted: contractorId is not defined.");
    setLoading(false);
    return;
  }

  try {
    const projectsData = await apiService.contractors.getProjectsByContractor(contractorId); 
    
    setProjects(projectsData);

  } catch (err) {
    console.error('An error occurred during API calls:', err);
    setError(err.response?.data?.message || 'Failed to load dashboard data.');
  } finally {
    setLoading(false);
  }
}, [contractorId, user]);

// Fetch pending users and approved users summary if user can approve users
const fetchUserApprovalData = useCallback(async () => {
  if (!canApproveUsers) return;
  
  setLoadingUsers(true);
  try {
    const [pendingData, summaryData] = await Promise.all([
      apiService.users.getPendingUsers(),
      apiService.users.getApprovedUsersSummary()
    ]);
    
    setPendingUsers(Array.isArray(pendingData) ? pendingData : []);
    setApprovedUsersSummary(summaryData);
  } catch (err) {
    console.error('Error fetching user approval data:', err);
    // Don't set error state for user approval data, just log it
  } finally {
    setLoadingUsers(false);
  }
}, [canApproveUsers]);

  useEffect(() => {
    // Only fetch data when contractorId is available and not during auth loading
    if (!authLoading && contractorId) {
      console.log("useEffect triggered with valid contractorId. Calling fetchData().");
      fetchData();
    } else if (!authLoading && !contractorId) {
      // If auth is done but no contractorId is present, stop loading.
      console.log("Auth is complete, but no contractorId found. Stopping loader.");
      setLoading(false);
    }
  }, [fetchData, contractorId, authLoading]);
  
  useEffect(() => {
    if (!authLoading && canApproveUsers) {
      fetchUserApprovalData();
    }
  }, [authLoading, canApproveUsers, fetchUserApprovalData]);
  
  const handleCloseSnackbar = () => {
    setSnackbar({ ...snackbar, open: false });
  };
  
  // Filter projects by approval status
  const projectCategories = useMemo(() => {
    const pendingApproval = projects.filter(proj => {
      const isApproved = proj.approved_for_public === 1 || proj.approved_for_public === true;
      const needsRevision = proj.revision_requested === 1 || proj.revision_requested === true;
      return !isApproved && !needsRevision;
    });

    const approved = projects.filter(proj => {
      const isApproved = proj.approved_for_public === 1 || proj.approved_for_public === true;
      return isApproved;
    });

    const requestedForReview = projects.filter(proj => {
      const needsRevision = proj.revision_requested === 1 || proj.revision_requested === true;
      return needsRevision;
    });

    return { pendingApproval, approved, requestedForReview };
  }, [projects]);

  const handleViewProjectDetails = (projectId) => {
    navigate(`/projects/${projectId}`);
  };
  
  const handleViewUserManagement = () => {
    navigate('/user-management');
  };
  
  const handleApproveUser = async (userId) => {
    try {
      await apiService.users.updateUser(userId, { isActive: true });
      setSnackbar({ open: true, message: 'User approved successfully!', severity: 'success' });
      fetchUserApprovalData();
    } catch (err) {
      console.error('Error approving user:', err);
      setSnackbar({ 
        open: true, 
        message: err.response?.data?.message || 'Failed to approve user.', 
        severity: 'error' 
      });
    }
  };

  if (authLoading || (loading && !error)) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">{error}</Alert>
      </Box>
    );
  }
  
  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" component="h1" gutterBottom sx={{ color: '#0A2342', fontWeight: 'bold' }}>
        Personal Dashboard
      </Typography>
      <Typography variant="h6" gutterBottom sx={{ color: '#333', mb: 3 }}>
        Welcome, {user?.firstName || 'User'}. Here's an overview of your activities in the system.
      </Typography>

      <Grid container spacing={3} sx={{ mt: 2 }}>
        {/* Projects Pending Approval Section */}
        <Grid item xs={12} md={4}>
          <Card elevation={3} sx={{ height: '100%', borderRadius: '8px', borderLeft: '4px solid #ff9800' }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <PendingActionsIcon sx={{ color: '#ff9800', mr: 1, fontSize: 28 }} />
                <Typography variant="h6" sx={{ fontWeight: 'bold', color: '#0A2342' }}>
                  Projects Pending Approval
                </Typography>
              </Box>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                {projectCategories.pendingApproval.length} project{projectCategories.pendingApproval.length !== 1 ? 's' : ''} awaiting approval
              </Typography>
              <List sx={{ maxHeight: 400, overflow: 'auto' }}>
                {projectCategories.pendingApproval.length > 0 ? (
                  projectCategories.pendingApproval.map(proj => (
                    <ListItem key={proj.id} divider sx={{ flexDirection: 'column', alignItems: 'flex-start', py: 1.5 }}>
                      <ListItemText 
                        primary={proj.projectName || proj.name || `Project #${proj.id}`}
                        secondary={
                          <React.Fragment>
                            <Typography component="span" variant="body2" color="text.primary">
                              Status: {proj.status || 'N/A'}
                            </Typography>
                            {proj.createdAt && (
                              <>
                                <br />
                                <Typography component="span" variant="caption" color="text.secondary">
                                  Created: {new Date(proj.createdAt).toLocaleDateString()}
                                </Typography>
                              </>
                            )}
                          </React.Fragment>
                        }
                      />
                      <Button
                        variant="outlined"
                        size="small"
                        startIcon={<VisibilityIcon />}
                        onClick={() => handleViewProjectDetails(proj.id)}
                        sx={{ mt: 1 }}
                      >
                        View Details
                      </Button>
                    </ListItem>
                  ))
                ) : (
                  <Alert severity="info" sx={{ mt: 1 }}>No projects pending approval.</Alert>
                )}
              </List>
            </CardContent>
          </Card>
        </Grid>

        {/* Approved Projects Section */}
        <Grid item xs={12} md={4}>
          <Card elevation={3} sx={{ height: '100%', borderRadius: '8px', borderLeft: '4px solid #4caf50' }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <CheckCircleIcon sx={{ color: '#4caf50', mr: 1, fontSize: 28 }} />
                <Typography variant="h6" sx={{ fontWeight: 'bold', color: '#0A2342' }}>
                  Approved Projects
                </Typography>
              </Box>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                {projectCategories.approved.length} project{projectCategories.approved.length !== 1 ? 's' : ''} approved
              </Typography>
              <List sx={{ maxHeight: 400, overflow: 'auto' }}>
                {projectCategories.approved.length > 0 ? (
                  projectCategories.approved.map(proj => (
                    <ListItem key={proj.id} divider sx={{ flexDirection: 'column', alignItems: 'flex-start', py: 1.5 }}>
                      <ListItemText 
                        primary={proj.projectName || proj.name || `Project #${proj.id}`}
                        secondary={
                          <React.Fragment>
                            <Typography component="span" variant="body2" color="text.primary">
                              Status: {proj.status || 'N/A'}
                            </Typography>
                            {proj.approved_at && (
                              <>
                                <br />
                                <Typography component="span" variant="caption" color="text.secondary">
                                  Approved: {new Date(proj.approved_at).toLocaleDateString()}
                                </Typography>
                              </>
                            )}
                          </React.Fragment>
                        }
                      />
                      <Button
                        variant="outlined"
                        size="small"
                        startIcon={<VisibilityIcon />}
                        onClick={() => handleViewProjectDetails(proj.id)}
                        sx={{ mt: 1 }}
                      >
                        View Details
                      </Button>
                    </ListItem>
                  ))
                ) : (
                  <Alert severity="info" sx={{ mt: 1 }}>No approved projects yet.</Alert>
                )}
              </List>
            </CardContent>
          </Card>
        </Grid>

        {/* Projects Requested for Review Section */}
        <Grid item xs={12} md={4}>
          <Card elevation={3} sx={{ height: '100%', borderRadius: '8px', borderLeft: '4px solid #2196f3' }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <RateReviewIcon sx={{ color: '#2196f3', mr: 1, fontSize: 28 }} />
                <Typography variant="h6" sx={{ fontWeight: 'bold', color: '#0A2342' }}>
                  Projects Requested for Review
                </Typography>
              </Box>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                {projectCategories.requestedForReview.length} project{projectCategories.requestedForReview.length !== 1 ? 's' : ''} requiring revision
              </Typography>
              <List sx={{ maxHeight: 400, overflow: 'auto' }}>
                {projectCategories.requestedForReview.length > 0 ? (
                  projectCategories.requestedForReview.map(proj => (
                    <ListItem key={proj.id} divider sx={{ flexDirection: 'column', alignItems: 'flex-start', py: 1.5 }}>
                      <ListItemText 
                        primary={proj.projectName || proj.name || `Project #${proj.id}`}
                        secondary={
                          <React.Fragment>
                            <Typography component="span" variant="body2" color="text.primary">
                              Status: {proj.status || 'N/A'}
                            </Typography>
                            {proj.revision_requested_at && (
                              <>
                                <br />
                                <Typography component="span" variant="caption" color="text.secondary">
                                  Review requested: {new Date(proj.revision_requested_at).toLocaleDateString()}
                                </Typography>
                              </>
                            )}
                            {proj.revision_notes && (
                              <>
                                <br />
                                <Typography component="span" variant="caption" color="error.main" sx={{ fontStyle: 'italic' }}>
                                  {proj.revision_notes.length > 50 
                                    ? `${proj.revision_notes.substring(0, 50)}...` 
                                    : proj.revision_notes}
                                </Typography>
                              </>
                            )}
                          </React.Fragment>
                        }
                      />
                      <Button
                        variant="outlined"
                        size="small"
                        startIcon={<VisibilityIcon />}
                        onClick={() => handleViewProjectDetails(proj.id)}
                        sx={{ mt: 1 }}
                      >
                        View Details
                      </Button>
                    </ListItem>
                  ))
                ) : (
                  <Alert severity="info" sx={{ mt: 1 }}>No projects requested for review.</Alert>
                )}
              </List>
            </CardContent>
          </Card>
        </Grid>

        {/* Summary Statistics */}
        <Grid item xs={12}>
          <Paper elevation={2} sx={{ p: 3, borderRadius: '8px', bgcolor: '#f5f5f5' }}>
            <Typography variant="h6" gutterBottom sx={{ fontWeight: 'bold', color: '#0A2342' }}>
              Activity Summary
            </Typography>
            <Grid container spacing={2} sx={{ mt: 1 }}>
              <Grid item xs={12} sm={3}>
                <Box sx={{ textAlign: 'center' }}>
                  <Typography variant="h4" sx={{ color: '#ff9800', fontWeight: 'bold' }}>
                    {projectCategories.pendingApproval.length}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Pending Approval
                  </Typography>
                </Box>
              </Grid>
              <Grid item xs={12} sm={3}>
                <Box sx={{ textAlign: 'center' }}>
                  <Typography variant="h4" sx={{ color: '#4caf50', fontWeight: 'bold' }}>
                    {projectCategories.approved.length}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Approved
                  </Typography>
                </Box>
              </Grid>
              <Grid item xs={12} sm={3}>
                <Box sx={{ textAlign: 'center' }}>
                  <Typography variant="h4" sx={{ color: '#2196f3', fontWeight: 'bold' }}>
                    {projectCategories.requestedForReview.length}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Requested for Review
                  </Typography>
                </Box>
              </Grid>
              <Grid item xs={12} sm={3}>
                <Box sx={{ textAlign: 'center' }}>
                  <Typography variant="h4" sx={{ color: '#0A2342', fontWeight: 'bold' }}>
                    {projects.length}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Total Projects
                  </Typography>
                </Box>
              </Grid>
            </Grid>
          </Paper>
        </Grid>
        
        {/* User Approval Management Section - Only show if user can approve users */}
        {canApproveUsers && (
          <>
            {/* Pending Users Approval Section */}
            <Grid item xs={12} md={6}>
              <Card elevation={3} sx={{ height: '100%', borderRadius: '8px', borderLeft: '4px solid #f44336' }}>
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                      <PersonAddIcon sx={{ color: '#f44336', mr: 1, fontSize: 28 }} />
                      <Typography variant="h6" sx={{ fontWeight: 'bold', color: '#0A2342' }}>
                        Pending Users Approval
                      </Typography>
                    </Box>
                    <Button
                      variant="outlined"
                      size="small"
                      onClick={handleViewUserManagement}
                      sx={{ ml: 2 }}
                    >
                      Manage Users
                    </Button>
                  </Box>
                  {loadingUsers ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
                      <CircularProgress size={24} />
                    </Box>
                  ) : (
                    <>
                      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                        {pendingUsers.length} user{pendingUsers.length !== 1 ? 's' : ''} awaiting approval
                      </Typography>
                      <List sx={{ maxHeight: 400, overflow: 'auto' }}>
                        {pendingUsers.length > 0 ? (
                          pendingUsers.slice(0, 5).map((pendingUser) => (
                            <ListItem key={pendingUser.userId} divider sx={{ flexDirection: 'column', alignItems: 'flex-start', py: 1.5 }}>
                              <ListItemText 
                                primary={`${pendingUser.firstName || ''} ${pendingUser.lastName || ''}`.trim() || pendingUser.username}
                                secondary={
                                  <React.Fragment>
                                    <Typography component="span" variant="body2" color="text.primary">
                                      {pendingUser.email}
                                    </Typography>
                                    {pendingUser.role && (
                                      <>
                                        <br />
                                        <Chip 
                                          label={pendingUser.role} 
                                          size="small" 
                                          sx={{ mt: 0.5, fontSize: '0.7rem' }}
                                        />
                                      </>
                                    )}
                                    {pendingUser.createdAt && (
                                      <>
                                        <br />
                                        <Typography component="span" variant="caption" color="text.secondary">
                                          Registered: {new Date(pendingUser.createdAt).toLocaleDateString()}
                                        </Typography>
                                      </>
                                    )}
                                  </React.Fragment>
                                }
                              />
                              <Button
                                variant="contained"
                                size="small"
                                startIcon={<CheckCircleIcon />}
                                onClick={() => handleApproveUser(pendingUser.userId)}
                                sx={{ mt: 1, bgcolor: '#4caf50', '&:hover': { bgcolor: '#45a049' } }}
                              >
                                Approve
                              </Button>
                            </ListItem>
                          ))
                        ) : (
                          <Alert severity="info" sx={{ mt: 1 }}>No pending users.</Alert>
                        )}
                      </List>
                      {pendingUsers.length > 5 && (
                        <Box sx={{ mt: 2, textAlign: 'center' }}>
                          <Button
                            variant="text"
                            size="small"
                            onClick={handleViewUserManagement}
                          >
                            View all {pendingUsers.length} pending users
                          </Button>
                        </Box>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
            </Grid>

            {/* Approved Users Summary Section */}
            <Grid item xs={12} md={6}>
              <Card elevation={3} sx={{ height: '100%', borderRadius: '8px', borderLeft: '4px solid #4caf50' }}>
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                      <PeopleIcon sx={{ color: '#4caf50', mr: 1, fontSize: 28 }} />
                      <Typography variant="h6" sx={{ fontWeight: 'bold', color: '#0A2342' }}>
                        Approved Users Summary
                      </Typography>
                    </Box>
                    <Button
                      variant="outlined"
                      size="small"
                      onClick={handleViewUserManagement}
                      sx={{ ml: 2 }}
                    >
                      View All
                    </Button>
                  </Box>
                  {loadingUsers ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
                      <CircularProgress size={24} />
                    </Box>
                  ) : approvedUsersSummary ? (
                    <>
                      <Grid container spacing={2} sx={{ mt: 1 }}>
                        <Grid item xs={6}>
                          <Box sx={{ textAlign: 'center', p: 2, bgcolor: '#f5f5f5', borderRadius: '8px' }}>
                            <Typography variant="h4" sx={{ color: '#4caf50', fontWeight: 'bold' }}>
                              {approvedUsersSummary.totalApproved || 0}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                              Total Approved
                            </Typography>
                          </Box>
                        </Grid>
                        <Grid item xs={6}>
                          <Box sx={{ textAlign: 'center', p: 2, bgcolor: '#f5f5f5', borderRadius: '8px' }}>
                            <Typography variant="h4" sx={{ color: '#2196f3', fontWeight: 'bold' }}>
                              {approvedUsersSummary.approvedLast7Days || 0}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                              Last 7 Days
                            </Typography>
                          </Box>
                        </Grid>
                        <Grid item xs={6}>
                          <Box sx={{ textAlign: 'center', p: 2, bgcolor: '#f5f5f5', borderRadius: '8px' }}>
                            <Typography variant="h4" sx={{ color: '#ff9800', fontWeight: 'bold' }}>
                              {approvedUsersSummary.approvedLast30Days || 0}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                              Last 30 Days
                            </Typography>
                          </Box>
                        </Grid>
                        <Grid item xs={6}>
                          <Box sx={{ textAlign: 'center', p: 2, bgcolor: '#f5f5f5', borderRadius: '8px' }}>
                            <Typography variant="h4" sx={{ color: '#9c27b0', fontWeight: 'bold' }}>
                              {approvedUsersSummary.uniqueRoles || 0}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                              Unique Roles
                            </Typography>
                          </Box>
                        </Grid>
                      </Grid>
                      {approvedUsersSummary.roleBreakdown && approvedUsersSummary.roleBreakdown.length > 0 && (
                        <Box sx={{ mt: 2 }}>
                          <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mb: 1, color: '#0A2342' }}>
                            Breakdown by Role:
                          </Typography>
                          <List dense>
                            {approvedUsersSummary.roleBreakdown.slice(0, 5).map((item, index) => (
                              <ListItem key={index} sx={{ py: 0.5 }}>
                                <ListItemText
                                  primary={item.role || 'Unknown'}
                                  secondary={`${item.count || 0} users`}
                                  primaryTypographyProps={{ variant: 'body2' }}
                                  secondaryTypographyProps={{ variant: 'caption' }}
                                />
                              </ListItem>
                            ))}
                          </List>
                        </Box>
                      )}
                    </>
                  ) : (
                    <Alert severity="info" sx={{ mt: 1 }}>No approved users data available.</Alert>
                  )}
                </CardContent>
              </Card>
            </Grid>
          </>
        )}
      </Grid>
      
      <Snackbar open={snackbar.open} autoHideDuration={6000} onClose={handleCloseSnackbar}>
        <Alert onClose={handleCloseSnackbar} severity={snackbar.severity} sx={{ width: '100%' }}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default PersonalDashboard;