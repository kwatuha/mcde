import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  CircularProgress,
  Alert,
  Divider,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Avatar,
  LinearProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton
} from '@mui/material';
import {
  TrendingUp,
  TrendingDown,
  Schedule,
  CheckCircle,
  Cancel,
  Flag,
  Person,
  Assessment,
  Timeline,
  BarChart,
  PieChart,
  AccessTime,
  Warning,
  Close
} from '@mui/icons-material';
import axiosInstance from '../api/axiosInstance';

const ModerationAnalytics = () => {
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reasonModalOpen, setReasonModalOpen] = useState(false);
  const [reasonFeedbacks, setReasonFeedbacks] = useState([]);
  const [reasonTitle, setReasonTitle] = useState('');

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const fetchAnalytics = async () => {
    try {
      setLoading(true);
      const response = await axiosInstance.get('/moderate/analytics');
      setAnalytics(response.data.analytics);
    } catch (err) {
      console.error('Error fetching moderation analytics:', err);
      setError('Failed to load analytics data');
    } finally {
      setLoading(false);
    }
  };

  const handleReasonClick = async (reason) => {
    try {
      setLoading(true);
      console.log('Fetching feedback for reason:', reason);
      const url = `/moderate/queue?moderation_reason=${reason}&limit=100`;
      console.log('API URL:', url);
      const response = await axiosInstance.get(url);
      console.log('API response:', response.data);
      console.log('Response items:', response.data.items);
      console.log('Items length:', response.data.items ? response.data.items.length : 'undefined');
      
      if (response.data.success) {
        setReasonFeedbacks(response.data.items || []);
        setReasonTitle(`${getReasonLabel(reason)} Feedback`);
        setReasonModalOpen(true);
      } else {
        console.error('API returned success: false');
        setError('API returned an error');
      }
    } catch (err) {
      console.error('Error fetching feedback by reason:', err);
      console.error('Error response:', err.response?.data);
      setError(`Failed to load feedback for this reason: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleCloseReasonModal = () => {
    setReasonModalOpen(false);
    setReasonFeedbacks([]);
    setReasonTitle('');
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString();
  };

  const formatTime = (hours) => {
    if (hours < 1) return '< 1 hour';
    if (hours < 24) return `${Math.round(hours)} hours`;
    return `${Math.round(hours / 24)} days`;
  };

  const getReasonLabel = (reason) => {
    const reasonLabels = {
      'inappropriate_content': 'Inappropriate Content',
      'spam': 'Spam',
      'off_topic': 'Off Topic',
      'personal_attack': 'Personal Attack',
      'false_information': 'False Information',
      'duplicate': 'Duplicate',
      'incomplete': 'Incomplete',
      'language_violation': 'Language Violation',
      'other': 'Other'
    };
    return reasonLabels[reason] || reason;
  };

  const getStatusColor = (status) => {
    const colors = {
      'approved': 'success',
      'rejected': 'error',
      'flagged': 'warning',
      'pending': 'info'
    };
    return colors[status] || 'default';
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Alert severity="error" sx={{ mb: 3 }}>
        {error}
      </Alert>
    );
  }

  if (!analytics) {
    return (
      <Alert severity="info" sx={{ mb: 3 }}>
        No analytics data available
      </Alert>
    );
  }

  return (
    <Box>
      <Typography variant="h5" fontWeight="bold" gutterBottom sx={{ mb: 3 }}>
        Review analytics
      </Typography>

      {/* Response Time Statistics */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" mb={2}>
                <AccessTime color="primary" sx={{ mr: 1 }} />
                <Typography variant="h6">Average Response Time</Typography>
              </Box>
              <Typography variant="h4" fontWeight="bold" color="primary">
                {formatTime(analytics.responseTimeStats?.avg_response_hours || 0)}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {analytics.responseTimeStats?.total_moderated || 0} items reviewed
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" mb={2}>
                <Timeline color="success" sx={{ mr: 1 }} />
                <Typography variant="h6">Fastest Response</Typography>
              </Box>
              <Typography variant="h4" fontWeight="bold" color="success.main">
                {formatTime(analytics.responseTimeStats?.min_response_hours || 0)}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Best performance
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" mb={2}>
                <Warning color="warning" sx={{ mr: 1 }} />
                <Typography variant="h6">Slowest Response</Typography>
              </Box>
              <Typography variant="h4" fontWeight="bold" color="warning.main">
                {formatTime(analytics.responseTimeStats?.max_response_hours || 0)}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Needs improvement
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Review reasons breakdown */}
      <Card sx={{ mb: 4 }}>
        <CardContent>
          <Typography variant="h6" fontWeight="bold" gutterBottom>
            <Flag sx={{ mr: 1, verticalAlign: 'middle' }} />
            Review reasons breakdown
          </Typography>
          {analytics.reasonBreakdown && analytics.reasonBreakdown.length > 0 ? (
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Reason</TableCell>
                    <TableCell align="center">Count</TableCell>
                    <TableCell align="center">Percentage</TableCell>
                    <TableCell align="center">Visual</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {analytics.reasonBreakdown.map((reason, index) => (
                    <TableRow 
                      key={reason.moderation_reason}
                      sx={{ 
                        cursor: 'pointer',
                        '&:hover': {
                          backgroundColor: 'rgba(0, 0, 0, 0.04)'
                        }
                      }}
                      onClick={() => handleReasonClick(reason.moderation_reason)}
                    >
                      <TableCell>
                        <Typography variant="body2" fontWeight="medium">
                          {getReasonLabel(reason.moderation_reason)}
                        </Typography>
                      </TableCell>
                      <TableCell align="center">
                        <Chip 
                          label={reason.count} 
                          color="primary" 
                          size="small" 
                        />
                      </TableCell>
                      <TableCell align="center">
                        <Typography variant="body2" fontWeight="bold">
                          {reason.percentage}%
                        </Typography>
                      </TableCell>
                      <TableCell align="center">
                        <Box sx={{ width: '100%', maxWidth: 200 }}>
                          <LinearProgress 
                            variant="determinate" 
                            value={reason.percentage} 
                            sx={{ height: 8, borderRadius: 4 }}
                          />
                        </Box>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          ) : (
            <Typography variant="body2" color="text.secondary">
              No review reason data available
            </Typography>
          )}
        </CardContent>
      </Card>

      {/* Reviewer activity */}
      <Card sx={{ mb: 4 }}>
        <CardContent>
          <Typography variant="h6" fontWeight="bold" gutterBottom>
            <Person sx={{ mr: 1, verticalAlign: 'middle' }} />
            Reviewer activity
          </Typography>
          {analytics.moderatorActivity && analytics.moderatorActivity.length > 0 ? (
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Reviewer</TableCell>
                    <TableCell align="center">Total</TableCell>
                    <TableCell align="center">Approved</TableCell>
                    <TableCell align="center">Rejected</TableCell>
                    <TableCell align="center">Flagged</TableCell>
                    <TableCell align="center">Avg Response Time</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {analytics.moderatorActivity.map((moderator, index) => (
                    <TableRow key={index}>
                      <TableCell>
                        <Box display="flex" alignItems="center">
                          <Avatar sx={{ mr: 2, width: 32, height: 32 }}>
                            {moderator.moderator_name?.charAt(0) || 'M'}
                          </Avatar>
                          <Typography variant="body2" fontWeight="medium">
                            {moderator.moderator_name || 'Unknown'}
                          </Typography>
                        </Box>
                      </TableCell>
                      <TableCell align="center">
                        <Chip label={moderator.total_moderated} color="primary" size="small" />
                      </TableCell>
                      <TableCell align="center">
                        <Chip label={moderator.approved_count} color="success" size="small" />
                      </TableCell>
                      <TableCell align="center">
                        <Chip label={moderator.rejected_count} color="error" size="small" />
                      </TableCell>
                      <TableCell align="center">
                        <Chip label={moderator.flagged_count} color="warning" size="small" />
                      </TableCell>
                      <TableCell align="center">
                        <Typography variant="body2">
                          {Math.round(moderator.avg_response_time_minutes)} min
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          ) : (
            <Typography variant="body2" color="text.secondary">
              No reviewer activity data available
            </Typography>
          )}
        </CardContent>
      </Card>

      {/* Ratings Analysis */}
      <Card sx={{ mb: 4 }}>
        <CardContent>
          <Typography variant="h6" fontWeight="bold" gutterBottom>
            <Assessment sx={{ mr: 1, verticalAlign: 'middle' }} />
            Ratings analysis by review status
          </Typography>
          {analytics.ratingsByStatus && analytics.ratingsByStatus.length > 0 ? (
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Status</TableCell>
                    <TableCell align="center">Count</TableCell>
                    <TableCell align="center">Overall Support</TableCell>
                    <TableCell align="center">Quality Impact</TableCell>
                    <TableCell align="center">Community Alignment</TableCell>
                    <TableCell align="center">Transparency</TableCell>
                    <TableCell align="center">Feasibility</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {analytics.ratingsByStatus.map((rating, index) => (
                    <TableRow key={rating.moderation_status}>
                      <TableCell>
                        <Chip 
                          label={rating.moderation_status} 
                          color={getStatusColor(rating.moderation_status)}
                          size="small"
                        />
                      </TableCell>
                      <TableCell align="center">
                        <Typography variant="body2" fontWeight="bold">
                          {rating.count}
                        </Typography>
                      </TableCell>
                      <TableCell align="center">
                        <Typography variant="body2">
                          {rating.avg_overall_support || 'N/A'}
                        </Typography>
                      </TableCell>
                      <TableCell align="center">
                        <Typography variant="body2">
                          {rating.avg_quality_impact || 'N/A'}
                        </Typography>
                      </TableCell>
                      <TableCell align="center">
                        <Typography variant="body2">
                          {rating.avg_community_alignment || 'N/A'}
                        </Typography>
                      </TableCell>
                      <TableCell align="center">
                        <Typography variant="body2">
                          {rating.avg_transparency || 'N/A'}
                        </Typography>
                      </TableCell>
                      <TableCell align="center">
                        <Typography variant="body2">
                          {rating.avg_feasibility_confidence || 'N/A'}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          ) : (
            <Typography variant="body2" color="text.secondary">
              No ratings data available
            </Typography>
          )}
        </CardContent>
      </Card>

      {/* Recent review trends */}
      <Card>
        <CardContent>
          <Typography variant="h6" fontWeight="bold" gutterBottom>
            <TrendingUp sx={{ mr: 1, verticalAlign: 'middle' }} />
            Recent review trends (last 30 days)
          </Typography>
          {analytics.moderationTrends && analytics.moderationTrends.length > 0 ? (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Date</TableCell>
                    <TableCell align="center">Approved</TableCell>
                    <TableCell align="center">Rejected</TableCell>
                    <TableCell align="center">Flagged</TableCell>
                    <TableCell align="center">Total</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {analytics.moderationTrends.slice(0, 10).map((trend, index) => (
                    <TableRow key={trend.date}>
                      <TableCell>
                        <Typography variant="body2">
                          {formatDate(trend.date)}
                        </Typography>
                      </TableCell>
                      <TableCell align="center">
                        <Chip label={trend.approved} color="success" size="small" />
                      </TableCell>
                      <TableCell align="center">
                        <Chip label={trend.rejected} color="error" size="small" />
                      </TableCell>
                      <TableCell align="center">
                        <Chip label={trend.flagged} color="warning" size="small" />
                      </TableCell>
                      <TableCell align="center">
                        <Typography variant="body2" fontWeight="bold">
                          {trend.total_moderated}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          ) : (
            <Typography variant="body2" color="text.secondary">
              No review trend data available
            </Typography>
          )}
        </CardContent>
      </Card>

      {/* Reason Feedback Modal */}
      <Dialog 
        open={reasonModalOpen} 
        onClose={handleCloseReasonModal}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="h6" fontWeight="bold">
              {reasonTitle}
            </Typography>
            <IconButton onClick={handleCloseReasonModal} size="small">
              <Close />
            </IconButton>
          </Box>
        </DialogTitle>
        
        <DialogContent dividers>
          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress />
            </Box>
          ) : reasonFeedbacks.length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 4 }}>
              <Typography variant="body1" color="text.secondary">
                No feedback found for this review reason.
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                Debug: reasonFeedbacks length = {reasonFeedbacks.length}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                Debug: reasonTitle = {reasonTitle}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                Debug: reasonFeedbacks = {JSON.stringify(reasonFeedbacks)}
              </Typography>
            </Box>
          ) : (
            <List>
              {reasonFeedbacks.map((feedback) => (
                <ListItem key={feedback.id} sx={{ flexDirection: 'column', alignItems: 'flex-start', py: 2 }}>
                  <Box sx={{ width: '100%', mb: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                      <Avatar sx={{ mr: 2 }}>
                        <Person />
                      </Avatar>
                      <Box sx={{ flex: 1 }}>
                        <Typography variant="subtitle1" fontWeight="bold">
                          {feedback.name || 'Anonymous'}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          {feedback.subject || 'No Subject'}
                        </Typography>
                      </Box>
                      <Chip
                        label={getStatusColor(feedback.moderation_status).label}
                        color={getStatusColor(feedback.moderation_status).color}
                        size="small"
                      />
                    </Box>
                    
                    <Typography variant="body2" sx={{ mb: 1 }}>
                      {feedback.message}
                    </Typography>
                    
                    {feedback.project_name && (
                      <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
                        Related Project: {feedback.project_name}
                      </Typography>
                    )}
                    
                    <Typography variant="caption" color="text.secondary">
                      Submitted: {formatDate(feedback.created_at)}
                    </Typography>
                    
                    {feedback.moderation_reason && (
                      <Box sx={{ mt: 2, p: 2, backgroundColor: '#fff3e0', borderRadius: 1 }}>
                        <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                          Review reason: {getReasonLabel(feedback.moderation_reason)}
                        </Typography>
                        {feedback.custom_reason && (
                          <Typography variant="body2">
                            Custom Reason: {feedback.custom_reason}
                          </Typography>
                        )}
                        {feedback.moderator_notes && (
                          <Typography variant="body2">
                            Reviewer notes: {feedback.moderator_notes}
                          </Typography>
                        )}
                        {feedback.moderated_at && (
                          <Typography variant="caption" color="text.secondary">
                            Reviewed on: {formatDate(feedback.moderated_at)}
                          </Typography>
                        )}
                      </Box>
                    )}
                  </Box>
                  <Divider sx={{ width: '100%', mt: 1 }} />
                </ListItem>
              ))}
            </List>
          )}
        </DialogContent>
      </Dialog>
    </Box>
  );
};

export default ModerationAnalytics;
