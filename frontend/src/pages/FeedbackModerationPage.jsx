import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  Grid,
  Card,
  CardContent,
  Chip,
  Button,
  TextField,
  InputAdornment,
  CircularProgress,
  Alert,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Divider,
  Avatar,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Pagination,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  List,
  ListItem,
  Tooltip,
  Badge,
  Tabs,
  Tab,
  LinearProgress,
  FormControlLabel,
  RadioGroup,
  Radio,
  TextareaAutosize
} from '@mui/material';
import {
  Search,
  ExpandMore,
  Comment,
  CheckCircle,
  Schedule,
  Reply,
  Person,
  Business,
  CalendarToday,
  FilterList,
  Email,
  Phone,
  Close,
  Send,
  Visibility,
  Assessment,
  Forum,
  Star,
  Gavel,
  Flag,
  Block,
  CheckCircleOutline,
  Cancel,
  Warning,
  PictureAsPdf
} from '@mui/icons-material';
import { useAuth } from '../context/AuthContext';
import ModerationAnalytics from '../components/ModerationAnalytics';
import axiosInstance from '../api/axiosInstance';
import { isAdmin } from '../utils/privilegeUtils.js';
import {
  downloadFeedbackOfficialResponsePdf,
  downloadFeedbackListOfficialPdf,
} from '../utils/feedbackOfficialResponsePdf.js';

const FeedbackModerationPage = () => {
  const { user, hasPrivilege } = useAuth();
  console.log('FeedbackModerationPage component rendered');
  const [activeTab, setActiveTab] = useState(0);
  const [feedbacks, setFeedbacks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [moderationFilter, setModerationFilter] = useState('pending');
  const [expandedId, setExpandedId] = useState(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [selectedFeedback, setSelectedFeedback] = useState(null);
  const [moderationModalOpen, setModerationModalOpen] = useState(false);
  const [moderationAction, setModerationAction] = useState('');
  const [moderationReason, setModerationReason] = useState('');
  const [customReason, setCustomReason] = useState('');
  const [moderatorNotes, setModeratorNotes] = useState('');
  const [reopenReason, setReopenReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [statistics, setStatistics] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalFeedbacks, setModalFeedbacks] = useState([]);
  const [modalTitle, setModalTitle] = useState('');
  const [modalModerationStatus, setModalModerationStatus] = useState(null);
  const [countyResponseModalOpen, setCountyResponseModalOpen] = useState(false);
  const [countyResponseTarget, setCountyResponseTarget] = useState(null);
  const [countyResponseText, setCountyResponseText] = useState('');
  const [respondSubmitting, setRespondSubmitting] = useState(false);

  const fetchFeedbacks = async () => {
    try {
      if (!hasPrivilege('public_content.approve') && !isAdmin(user)) {
        setLoading(false);
        setFeedbacks([]);
        return;
      }
      setLoading(true);
      console.log('Fetching moderation queue...');
      const params = new URLSearchParams({
        page,
        limit: 10,
      });
      
      if (moderationFilter && moderationFilter !== 'all') {
        params.append('moderation_status', moderationFilter);
      }
      if (searchTerm) {
        params.append('search', searchTerm);
      }

      console.log('API URL:', `/moderate/queue?${params.toString()}`);
      const response = await axiosInstance.get(
        `/moderate/queue?${params.toString()}`
      );

      console.log('Moderation API response:', response.data);
      setFeedbacks(response.data.items || []);
      setTotalPages(response.data.pagination?.totalPages || 1);
      setError(null);
    } catch (err) {
      console.error('Error fetching moderation feedback:', err);
      setError('Failed to load feedback. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const fetchStatistics = async () => {
    try {
      if (!hasPrivilege('public_content.approve') && !isAdmin(user)) {
        return;
      }
      const response = await axiosInstance.get('/moderate/statistics');
      setStatistics(response.data);
    } catch (err) {
      console.error('Error fetching statistics:', err);
    }
  };

  useEffect(() => {
    if (!hasPrivilege('public_content.approve') && !isAdmin(user)) {
      setLoading(false);
      return;
    }
    fetchFeedbacks();
    fetchStatistics();
  }, [page, moderationFilter, searchTerm, user, hasPrivilege]);

  const handleAccordionChange = (id) => (event, isExpanded) => {
    setExpandedId(isExpanded ? id : null);
  };

  const handleStatCardClick = async (moderationStatus, title) => {
    try {
      setLoading(true);
      
      // Fetch all feedback for the specific moderation status
      const params = new URLSearchParams({
        page: 1,
        limit: 100, // Get more items for the modal
        moderation_status: moderationStatus
      });

      const response = await axiosInstance.get(
        `/moderate/queue?${params.toString()}`
      );

      setModalFeedbacks(response.data.items || []);
      setModalTitle(title);
      setModalModerationStatus(moderationStatus);
      setModalOpen(true);
    } catch (err) {
      console.error('Error fetching feedback for modal:', err);
      setError('Failed to load feedback. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleCloseModal = () => {
    setModalOpen(false);
    setModalFeedbacks([]);
    setModalTitle('');
    setModalModerationStatus(null);
  };

  const refreshModalQueue = async (moderationStatus) => {
    if (!moderationStatus) return;
    try {
      const params = new URLSearchParams({
        page: 1,
        limit: 100,
        moderation_status: moderationStatus,
      });
      const response = await axiosInstance.get(`/moderate/queue?${params.toString()}`);
      setModalFeedbacks(response.data.items || []);
    } catch (e) {
      console.error('Error refreshing modal queue:', e);
    }
  };

  const handleOpenCountyResponseModal = (feedback) => {
    setCountyResponseTarget(feedback);
    setCountyResponseText(feedback.admin_response || '');
    setCountyResponseModalOpen(true);
    setError(null);
  };

  const handleCloseCountyResponseModal = () => {
    setCountyResponseModalOpen(false);
    setCountyResponseTarget(null);
    setCountyResponseText('');
  };

  const handleSubmitCountyResponse = async () => {
    if (!countyResponseTarget) return;
    if (!countyResponseText.trim()) {
      setError('Please enter an official response');
      return;
    }
    const statusForModal = modalModerationStatus;
    try {
      setRespondSubmitting(true);
      setError(null);
      await axiosInstance.put(`/public/feedback/${countyResponseTarget.id}/respond`, {
        admin_response: countyResponseText.trim(),
        responded_by: user?.id || user?.userId,
      });
      setSuccessMessage('Official response submitted successfully');
      handleCloseCountyResponseModal();
      await fetchFeedbacks();
      fetchStatistics();
      if (modalOpen && statusForModal) {
        await refreshModalQueue(statusForModal);
      }
      setTimeout(() => setSuccessMessage(''), 4000);
    } catch (err) {
      console.error('Error submitting county response:', err);
      const detail =
        err.response?.data?.error ||
        err.response?.data?.details ||
        err.response?.data?.message;
      setError(detail || 'Failed to submit response. Please try again.');
    } finally {
      setRespondSubmitting(false);
    }
  };

  const handleDownloadCountyResponsePdf = (feedback) => {
    try {
      setError(null);
      downloadFeedbackOfficialResponsePdf(feedback, formatDate);
    } catch (e) {
      console.error(e);
      setError('Could not generate PDF. Please try again.');
    }
  };

  const handleExportModalListPdf = () => {
    try {
      setError(null);
      downloadFeedbackListOfficialPdf(modalFeedbacks, formatDate, modalTitle);
    } catch (e) {
      console.error(e);
      setError('Could not generate combined PDF. Please try again.');
    }
  };

  const handleOpenModerationModal = (feedback, action) => {
    setSelectedFeedback(feedback);
    setModerationAction(action);
    setModerationReason('');
    setCustomReason('');
    setModeratorNotes('');
    setReopenReason('');
    setModerationModalOpen(true);
  };

  const handleCloseModerationModal = () => {
    setModerationModalOpen(false);
    setSelectedFeedback(null);
    setModerationAction('');
    setModerationReason('');
    setCustomReason('');
    setModeratorNotes('');
    setReopenReason('');
  };

  const handleModerationSubmit = async () => {
    if (!selectedFeedback) return;

    try {
      setSubmitting(true);
      
      let endpoint = '';
      let payload = {
        moderator_notes: moderatorNotes
      };

      switch (moderationAction) {
        case 'approve':
          endpoint = `/moderate/${selectedFeedback.id}/approve`;
          break;
        case 'reject':
          if (!moderationReason) {
            setError('Please select a reason for rejection');
            return;
          }
          endpoint = `/moderate/${selectedFeedback.id}/reject`;
          payload = {
            moderation_reason: moderationReason,
            custom_reason: customReason,
            moderator_notes: moderatorNotes
          };
          break;
        case 'flag':
          endpoint = `/moderate/${selectedFeedback.id}/flag`;
          payload = {
            moderation_reason: moderationReason,
            custom_reason: customReason,
            moderator_notes: moderatorNotes
          };
          break;
        case 'reopen':
          if (!reopenReason && selectedFeedback.moderation_status === 'rejected') {
            setError('Please provide a reason for reopening a rejected feedback');
            return;
          }
          endpoint = `/moderate/${selectedFeedback.id}/reopen`;
          payload = {
            reopen_reason: reopenReason || `Reopened from ${selectedFeedback.moderation_status} status`,
            moderator_notes: moderatorNotes || `Reopened for further review`
          };
          break;
        default:
          throw new Error('Invalid moderation action');
      }

      await axiosInstance.post(endpoint, payload);
      
      const actionMessages = {
        'approve': 'approved',
        'reject': 'rejected',
        'flag': 'flagged',
        'reopen': 'reopened'
      };
      
      setSuccessMessage(`Feedback ${actionMessages[moderationAction] || moderationAction}d successfully`);
      handleCloseModerationModal();
      fetchFeedbacks();
      fetchStatistics();
    } catch (err) {
      console.error('Error moderating feedback:', err);
      setError(`Failed to ${moderationAction} feedback. Please try again.`);
    } finally {
      setSubmitting(false);
    }
  };

  const getModerationStatusColor = (status) => {
    const statusMap = {
      'pending': { color: 'warning', icon: <Schedule />, label: 'Awaiting Response' },
      'approved': { color: 'success', icon: <CheckCircle />, label: 'Approved' },
      'rejected': { color: 'error', icon: <Cancel />, label: 'Rejected (Permanent)' },
      'flagged': { color: 'warning', icon: <Flag />, label: 'Flagged (Needs Review)' }
    };
    return statusMap[status] || statusMap['pending'];
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const moderationReasons = [
    { value: 'inappropriate_content', label: 'Inappropriate Content' },
    { value: 'spam', label: 'Spam' },
    { value: 'off_topic', label: 'Off Topic' },
    { value: 'personal_attack', label: 'Personal Attack' },
    { value: 'false_information', label: 'False Information' },
    { value: 'duplicate', label: 'Duplicate' },
    { value: 'incomplete', label: 'Incomplete' },
    { value: 'language_violation', label: 'Language Violation' },
    { value: 'other', label: 'Other' }
  ];

  if (!hasPrivilege('public_content.approve') && !isAdmin(user)) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">You do not have permission to access feedback review.</Alert>
      </Box>
    );
  }

  if (loading && feedbacks.length === 0) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="80vh">
        <CircularProgress size={60} />
      </Box>
    );
  }

  console.log('FeedbackModerationPage render - feedbacks:', feedbacks.length, 'loading:', loading);
  
  return (
    <Box>
      {/* Header */}
      <Box sx={{ 
        mb: 2,
        p: 1.5,
        backgroundColor: '#f8f9fa',
        borderRadius: 1,
        border: '1px solid #e0e0e0'
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.5 }}>
          <Gavel sx={{ fontSize: '1.5rem', color: 'primary.main', mr: 1.5 }} />
          <Typography variant="h6" fontWeight="bold" color="text.primary">
            Feedback Review
          </Typography>
        </Box>
        <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.875rem', ml: 5 }}>
          Review citizen feedback before it is shown publicly
        </Typography>
      </Box>

      {/* Tabs */}
      <Box sx={{ 
        borderBottom: 1, 
        borderColor: 'divider', 
        mb: 2,
        backgroundColor: '#f8f9fa',
        borderRadius: 1,
        px: 1.5,
        py: 0.5
      }}>
        <Tabs 
          value={activeTab} 
          onChange={(e, newValue) => setActiveTab(newValue)}
          sx={{
            '& .MuiTab-root': {
              textTransform: 'none',
              fontWeight: 600,
              fontSize: '0.875rem',
              minHeight: 40,
              px: 2,
              py: 1,
              borderRadius: 1,
              margin: '0 2px',
              transition: 'all 0.2s ease-in-out',
              '&:hover': {
                backgroundColor: 'rgba(0, 0, 0, 0.04)',
                transform: 'translateY(-1px)'
              }
            },
            '& .Mui-selected': {
              backgroundColor: 'white',
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
              color: 'primary.main',
              fontWeight: 700
            },
            '& .MuiTabs-indicator': {
              height: 3,
              borderRadius: '2px 2px 0 0',
              backgroundColor: 'primary.main'
            }
          }}
        >
          <Tab 
            label={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <Schedule sx={{ fontSize: '1rem' }} />
                Review queue
              </Box>
            } 
          />
          <Tab 
            label={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <Assessment sx={{ fontSize: '1rem' }} />
                Review analytics
              </Box>
            } 
          />
        </Tabs>
      </Box>

      {/* Tab Content */}
      {activeTab === 0 && (
        <>

      {/* Statistics Cards */}
      {statistics && (
        <Grid container spacing={2} sx={{ mb: 2 }}>
          <Grid item xs={12} sm={6} md={3}>
            <Card 
              sx={{ 
                background: 'linear-gradient(135deg, #ff9800 0%, #ffb74d 100%)', 
                color: 'white',
                cursor: 'pointer',
                transition: 'transform 0.2s ease-in-out',
                '&:hover': {
                  transform: 'translateY(-4px)',
                  boxShadow: 6
                }
              }}
              onClick={() => handleStatCardClick('pending', 'Awaiting Response')}
            >
              <CardContent sx={{ textAlign: 'center', py: 1.5 }}>
                <Schedule sx={{ fontSize: '2rem', mb: 0.5 }} />
                <Typography variant="h5" fontWeight="bold">
                  {statistics.statistics.pending_count}
                </Typography>
                <Typography variant="body2" sx={{ fontSize: '0.875rem' }}>
                  Awaiting Response
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Card 
              sx={{ 
                background: 'linear-gradient(135deg, #4caf50 0%, #81c784 100%)', 
                color: 'white',
                cursor: 'pointer',
                transition: 'transform 0.2s ease-in-out',
                '&:hover': {
                  transform: 'translateY(-4px)',
                  boxShadow: 6
                }
              }}
              onClick={() => handleStatCardClick('approved', 'Approved')}
            >
              <CardContent sx={{ textAlign: 'center', py: 1.5 }}>
                <CheckCircle sx={{ fontSize: '2rem', mb: 0.5 }} />
                <Typography variant="h5" fontWeight="bold">
                  {statistics.statistics.approved_count}
                </Typography>
                <Typography variant="body2" sx={{ fontSize: '0.875rem' }}>
                  Approved
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Tooltip title="Permanently rejected feedback - requires justification to reopen" arrow>
              <Card 
                sx={{ 
                  background: 'linear-gradient(135deg, #f44336 0%, #ef5350 100%)', 
                  color: 'white',
                  cursor: 'pointer',
                  transition: 'transform 0.2s ease-in-out',
                  '&:hover': {
                    transform: 'translateY(-4px)',
                    boxShadow: 6
                  }
                }}
                onClick={() => handleStatCardClick('rejected', 'Rejected (Permanent)')}
              >
                <CardContent sx={{ textAlign: 'center', py: 1.5 }}>
                  <Cancel sx={{ fontSize: '2rem', mb: 0.5 }} />
                  <Typography variant="h5" fontWeight="bold">
                    {statistics.statistics.rejected_count}
                  </Typography>
                  <Typography variant="body2" sx={{ fontSize: '0.875rem' }}>
                    Rejected (Permanent)
                  </Typography>
                </CardContent>
              </Card>
            </Tooltip>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Tooltip title="Flagged for further review - can be easily re-reviewed, approved, or rejected" arrow>
              <Card 
                sx={{ 
                  background: 'linear-gradient(135deg, #9c27b0 0%, #ba68c8 100%)', 
                  color: 'white',
                  cursor: 'pointer',
                  transition: 'transform 0.2s ease-in-out',
                  '&:hover': {
                    transform: 'translateY(-4px)',
                    boxShadow: 6
                  }
                }}
                onClick={() => handleStatCardClick('flagged', 'Flagged (Needs Review)')}
              >
                <CardContent sx={{ textAlign: 'center', py: 1.5 }}>
                  <Flag sx={{ fontSize: '2rem', mb: 0.5 }} />
                  <Typography variant="h5" fontWeight="bold">
                    {statistics.statistics.flagged_count}
                  </Typography>
                  <Typography variant="body2" sx={{ fontSize: '0.875rem' }}>
                    Flagged (Needs Review)
                  </Typography>
                </CardContent>
              </Card>
            </Tooltip>
          </Grid>
        </Grid>
      )}

      {/* Success Message */}
      {successMessage && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccessMessage('')}>
          {successMessage}
        </Alert>
      )}

      {/* Error Message */}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Filters */}
      <Paper sx={{ p: 1.5, mb: 2 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} md={4}>
            <TextField
              fullWidth
              placeholder="Search feedback..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <Search />
                  </InputAdornment>
                ),
              }}
            />
          </Grid>
          <Grid item xs={12} md={3}>
            <FormControl fullWidth>
              <InputLabel>Review status</InputLabel>
              <Select
                value={moderationFilter}
                onChange={(e) => setModerationFilter(e.target.value)}
                label="Review status"
              >
                <MenuItem value="all">All Status</MenuItem>
                <MenuItem value="pending">Pending</MenuItem>
                <MenuItem value="approved">Approved</MenuItem>
                <MenuItem value="rejected">Rejected</MenuItem>
                <MenuItem value="flagged">Flagged</MenuItem>
              </Select>
            </FormControl>
          </Grid>
        </Grid>
      </Paper>

      {/* Feedback List */}
      <Box>
        {feedbacks.length === 0 && !loading ? (
          <Paper 
            elevation={1} 
            sx={{ 
              p: 4, 
              textAlign: 'center',
              backgroundColor: '#f5f5f5'
            }}
          >
            <Comment sx={{ fontSize: 48, color: 'text.secondary', mb: 2 }} />
            <Typography variant="h6" color="text.secondary" gutterBottom>
              No feedback found
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {moderationFilter !== 'all' 
                ? `No feedback with review status "${moderationFilter}"` 
                : 'No feedback items in the review queue'}
            </Typography>
          </Paper>
        ) : (
          feedbacks.map((feedback) => {
          const statusInfo = getModerationStatusColor(feedback.moderation_status);
          return (
            <Accordion
              key={feedback.id}
              expanded={expandedId === feedback.id}
              onChange={handleAccordionChange(feedback.id)}
              sx={{ mb: 2 }}
            >
              <AccordionSummary expandIcon={<ExpandMore />} sx={{ py: 1 }}>
                <Box sx={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', flex: 1 }}>
                    <Avatar sx={{ mr: 1.5, width: 32, height: 32 }}>
                      <Person sx={{ fontSize: '1rem' }} />
                    </Avatar>
                    <Box sx={{ flex: 1 }}>
                      <Typography variant="subtitle1" component="div" fontWeight="bold">
                        {feedback.name || 'Anonymous'}
                      </Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.875rem' }}>
                        {feedback.subject || 'No Subject'}
                      </Typography>
                    </Box>
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Chip
                      icon={statusInfo.icon}
                      label={statusInfo.label}
                      color={statusInfo.color}
                      size="small"
                      sx={{ fontSize: '0.75rem' }}
                    />
                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
                      {formatDate(feedback.created_at)}
                    </Typography>
                  </Box>
                </Box>
              </AccordionSummary>
              <AccordionDetails sx={{ pt: 1.5 }}>
                <Box sx={{ mb: 1.5 }}>
                  <Typography variant="body2" sx={{ mb: 1.5, fontSize: '0.875rem' }}>
                    {feedback.message}
                  </Typography>
                  
                  {feedback.project_name && (
                    <Box sx={{ mb: 1 }}>
                      <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
                        Related Project: {feedback.project_name}
                      </Typography>
                    </Box>
                  )}

                  {feedback.moderation_status === 'flagged' && (
                    <Box sx={{ mb: 1, p: 1, backgroundColor: '#fff3e0', borderRadius: 1 }}>
                      <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.75rem', fontWeight: 'bold' }}>
                        ⚠️ Flagged for Review: This feedback needs further review. You can approve, reject, or reopen it.
                      </Typography>
                    </Box>
                  )}
                  
                  {feedback.moderation_status === 'rejected' && (
                    <Box sx={{ mb: 1, p: 1, backgroundColor: '#ffebee', borderRadius: 1 }}>
                      <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.75rem', fontWeight: 'bold' }}>
                        ❌ Permanently Rejected: This feedback was permanently rejected. Reopening requires justification.
                      </Typography>
                    </Box>
                  )}

                  {feedback.moderation_reason && (
                    <Box sx={{ mb: 1 }}>
                      <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
                        Review reason: {moderationReasons.find(r => r.value === feedback.moderation_reason)?.label}
                      </Typography>
                      {feedback.custom_reason && (
                        <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.75rem', display: 'block' }}>
                          Custom Reason: {feedback.custom_reason}
                        </Typography>
                      )}
                    </Box>
                  )}

                  {feedback.moderator_notes && (
                    <Box sx={{ mb: 1 }}>
                      <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
                        Reviewer notes: {feedback.moderator_notes}
                      </Typography>
                    </Box>
                  )}
                </Box>

                <Divider sx={{ my: 1.5 }} />

                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                  {feedback.moderation_status === 'pending' && (
                    <>
                      <Button
                        variant="contained"
                        color="info"
                        startIcon={<Reply />}
                        onClick={() => handleOpenCountyResponseModal(feedback)}
                        size="small"
                      >
                        Respond
                      </Button>
                      <Button
                        variant="contained"
                        color="success"
                        startIcon={<CheckCircleOutline />}
                        onClick={() => handleOpenModerationModal(feedback, 'approve')}
                        size="small"
                      >
                        Approve
                      </Button>
                      <Button
                        variant="contained"
                        color="error"
                        startIcon={<Block />}
                        onClick={() => handleOpenModerationModal(feedback, 'reject')}
                        size="small"
                      >
                        Reject
                      </Button>
                      <Button
                        variant="contained"
                        color="warning"
                        startIcon={<Flag />}
                        onClick={() => handleOpenModerationModal(feedback, 'flag')}
                        size="small"
                      >
                        Flag for Review
                      </Button>
                    </>
                  )}
                  
                  {/* Flagged items: Can be easily re-reviewed (approve, reject, or reopen) */}
                  {feedback.moderation_status === 'flagged' && (
                    <>
                      <Button
                        variant="contained"
                        color="success"
                        startIcon={<CheckCircleOutline />}
                        onClick={() => handleOpenModerationModal(feedback, 'approve')}
                        size="small"
                      >
                        Approve
                      </Button>
                      <Button
                        variant="contained"
                        color="error"
                        startIcon={<Block />}
                        onClick={() => handleOpenModerationModal(feedback, 'reject')}
                        size="small"
                      >
                        Reject
                      </Button>
                      <Button
                        variant="outlined"
                        color="warning"
                        startIcon={<Schedule />}
                        onClick={() => handleOpenModerationModal(feedback, 'reopen')}
                        size="small"
                      >
                        Reopen for Review
                      </Button>
                    </>
                  )}
                  
                  {/* Rejected items: Permanent decision, but can be reviewed/reopened with confirmation */}
                  {feedback.moderation_status === 'rejected' && (
                    <>
                      <Button
                        variant="outlined"
                        color="warning"
                        startIcon={<Gavel />}
                        onClick={() => handleOpenModerationModal(feedback, 'review')}
                        size="small"
                      >
                        Review Decision
                      </Button>
                      <Button
                        variant="outlined"
                        color="info"
                        startIcon={<Schedule />}
                        onClick={() => handleOpenModerationModal(feedback, 'reopen')}
                        size="small"
                        sx={{ 
                          borderColor: 'warning.main',
                          color: 'warning.main',
                          '&:hover': {
                            borderColor: 'warning.dark',
                            backgroundColor: 'warning.light'
                          }
                        }}
                      >
                        Reopen (Requires Justification)
                      </Button>
                    </>
                  )}
                  
                  {/* Approved items: Can only be reviewed */}
                  {feedback.moderation_status === 'approved' && (
                    <Button
                      variant="outlined"
                      startIcon={<Gavel />}
                      onClick={() => handleOpenModerationModal(feedback, 'review')}
                      size="small"
                    >
                      Review Decision
                    </Button>
                  )}

                  <Button
                    variant="outlined"
                    color="primary"
                    startIcon={<PictureAsPdf />}
                    onClick={() => handleDownloadCountyResponsePdf(feedback)}
                    size="small"
                  >
                    Download PDF
                  </Button>
                </Box>
              </AccordionDetails>
            </Accordion>
          );
          })
        )}
      </Box>

      {/* Pagination */}
      {totalPages > 1 && (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 3 }}>
          <Pagination
            count={totalPages}
            page={page}
            onChange={(event, value) => setPage(value)}
            color="primary"
          />
        </Box>
      )}

      {/* Review decision dialog */}
      <Dialog
        open={moderationModalOpen}
        onClose={handleCloseModerationModal}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          {moderationAction === 'approve' && 'Approve Feedback'}
          {moderationAction === 'reject' && 'Reject Feedback (Permanent Decision)'}
          {moderationAction === 'flag' && 'Flag Feedback for Further Review'}
          {moderationAction === 'review' && 'Review feedback decision'}
          {moderationAction === 'reopen' && `Reopen Feedback from ${selectedFeedback?.moderation_status || ''} Status`}
        </DialogTitle>
        <DialogContent>
          {selectedFeedback && (
            <Box sx={{ mb: 3 }}>
              <Typography variant="h6" gutterBottom>
                Feedback from: {selectedFeedback.name || 'Anonymous'}
              </Typography>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Subject: {selectedFeedback.subject || 'No Subject'}
              </Typography>
              <Typography variant="body1" sx={{ mb: 2 }}>
                {selectedFeedback.message}
              </Typography>
            </Box>
          )}

          {/* Show warning for rejected items being reopened */}
          {moderationAction === 'reopen' && selectedFeedback?.moderation_status === 'rejected' && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              <Typography variant="body2" fontWeight="bold" gutterBottom>
                Warning: Reopening a Rejected Feedback
              </Typography>
              <Typography variant="body2">
                This feedback was permanently rejected. Reopening it requires a valid justification. 
                Please provide a clear reason why this rejected feedback should be reconsidered.
              </Typography>
            </Alert>
          )}

          {/* Show info for flagged items being reopened */}
          {moderationAction === 'reopen' && selectedFeedback?.moderation_status === 'flagged' && (
            <Alert severity="info" sx={{ mb: 2 }}>
              <Typography variant="body2">
                This feedback was flagged for further review. Reopening will change its status back to pending 
                so it can be reviewed again by the review team.
              </Typography>
            </Alert>
          )}

          {/* Reopen reason field */}
          {moderationAction === 'reopen' && (
            <TextField
              fullWidth
              label={selectedFeedback?.moderation_status === 'rejected' ? 'Justification for Reopening (Required)' : 'Reason for Reopening'}
              multiline
              rows={3}
              value={reopenReason}
              onChange={(e) => setReopenReason(e.target.value)}
              required={selectedFeedback?.moderation_status === 'rejected'}
              sx={{ mb: 2 }}
              placeholder={
                selectedFeedback?.moderation_status === 'rejected' 
                  ? 'Please explain why this rejected feedback should be reconsidered...'
                  : 'Optional: Add a reason for reopening this flagged feedback...'
              }
            />
          )}

          {(moderationAction === 'reject' || moderationAction === 'flag') && (
            <FormControl fullWidth sx={{ mb: 2 }}>
              <InputLabel>Reason</InputLabel>
              <Select
                value={moderationReason}
                onChange={(e) => setModerationReason(e.target.value)}
                label="Reason"
              >
                {moderationReasons.map((reason) => (
                  <MenuItem key={reason.value} value={reason.value}>
                    {reason.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}

          {moderationReason === 'other' && (
            <TextField
              fullWidth
              label="Custom Reason"
              value={customReason}
              onChange={(e) => setCustomReason(e.target.value)}
              sx={{ mb: 2 }}
            />
          )}

          <TextField
            fullWidth
            label="Reviewer notes"
            multiline
            rows={4}
            value={moderatorNotes}
            onChange={(e) => setModeratorNotes(e.target.value)}
            placeholder={
              moderationAction === 'reopen' 
                ? 'Add any additional notes about reopening this feedback...'
                : 'Add any additional notes about this review decision...'
            }
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseModerationModal}>Cancel</Button>
          <Button
            onClick={handleModerationSubmit}
            variant="contained"
            disabled={submitting}
            color={
              moderationAction === 'approve' ? 'success' :
              moderationAction === 'reject' ? 'error' :
              moderationAction === 'flag' ? 'warning' :
              moderationAction === 'reopen' ? 'info' : 'primary'
            }
          >
            {submitting ? <CircularProgress size={20} /> : 
             moderationAction === 'approve' ? 'Approve' :
             moderationAction === 'reject' ? 'Reject Permanently' :
             moderationAction === 'flag' ? 'Flag for Review' :
             moderationAction === 'reopen' ? 'Reopen for Review' : 'Update'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Official county response (citizen-facing reply + PDF) */}
      <Dialog
        open={countyResponseModalOpen}
        onClose={handleCloseCountyResponseModal}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="h6" fontWeight="bold">
              Official response to feedback
            </Typography>
            <IconButton onClick={handleCloseCountyResponseModal} size="small">
              <Close />
            </IconButton>
          </Box>
        </DialogTitle>
        <DialogContent dividers>
          {countyResponseTarget && (
            <>
              <Box sx={{ mb: 3, p: 2, backgroundColor: '#f5f5f5', borderRadius: 1 }}>
                <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                  Citizen feedback
                </Typography>
                <Typography variant="body2" fontWeight="bold" gutterBottom>
                  From: {countyResponseTarget.name || 'Anonymous'}
                </Typography>
                {countyResponseTarget.project_name && (
                  <Typography variant="body2" color="text.secondary" gutterBottom>
                    Project: {countyResponseTarget.project_name}
                  </Typography>
                )}
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  Subject: {countyResponseTarget.subject || 'No subject'}
                </Typography>
                <Typography variant="body1" sx={{ mt: 1 }}>
                  {countyResponseTarget.message}
                </Typography>
              </Box>
              <TextField
                fullWidth
                multiline
                rows={8}
                label="Official county response"
                placeholder="Enter the official response to this feedback…"
                value={countyResponseText}
                onChange={(e) => setCountyResponseText(e.target.value)}
                variant="outlined"
                helperText="This response is stored with the feedback record and can be exported to PDF."
              />
            </>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={handleCloseCountyResponseModal} disabled={respondSubmitting}>
            Cancel
          </Button>
          <Button
            variant="outlined"
            startIcon={<PictureAsPdf />}
            onClick={() =>
              countyResponseTarget &&
              handleDownloadCountyResponsePdf({
                ...countyResponseTarget,
                admin_response: countyResponseText,
              })
            }
            disabled={respondSubmitting}
          >
            Download PDF
          </Button>
          <Button
            variant="contained"
            color="primary"
            startIcon={respondSubmitting ? <CircularProgress size={20} /> : <Send />}
            onClick={handleSubmitCountyResponse}
            disabled={respondSubmitting || !countyResponseText.trim()}
          >
            {respondSubmitting ? 'Submitting…' : 'Submit response'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Feedback Modal */}
      <Dialog 
        open={modalOpen} 
        onClose={handleCloseModal}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 1,
              flexWrap: 'wrap',
            }}
          >
            <Typography variant="h6" fontWeight="bold">
              {modalTitle}
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              {modalFeedbacks.length > 0 && (
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<PictureAsPdf />}
                  onClick={handleExportModalListPdf}
                >
                  Download all (PDF)
                </Button>
              )}
              <IconButton onClick={handleCloseModal} size="small">
                <Close />
              </IconButton>
            </Box>
          </Box>
        </DialogTitle>
        
        <DialogContent dividers>
          {modalFeedbacks.length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 4 }}>
              <Typography variant="body1" color="text.secondary">
                No feedback found in this category.
              </Typography>
            </Box>
          ) : (
            <List>
              {modalFeedbacks.map((feedback) => (
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
                        label={getModerationStatusColor(feedback.moderation_status).label}
                        color={getModerationStatusColor(feedback.moderation_status).color}
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
                          Review reason: {moderationReasons.find(r => r.value === feedback.moderation_reason)?.label}
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
                      </Box>
                    )}

                    {feedback.admin_response && (
                      <Box sx={{ mt: 2, p: 2, backgroundColor: '#e8f5e9', borderRadius: 1 }}>
                        <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                          Official county response
                        </Typography>
                        <Typography variant="body2">{feedback.admin_response}</Typography>
                        {feedback.responded_at && (
                          <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1 }}>
                            Recorded {formatDate(feedback.responded_at)}
                          </Typography>
                        )}
                      </Box>
                    )}

                    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 2, width: '100%' }}>
                      {feedback.moderation_status === 'pending' && (
                        <Button
                          variant="contained"
                          color="info"
                          size="small"
                          startIcon={<Reply />}
                          onClick={() => handleOpenCountyResponseModal(feedback)}
                        >
                          Respond
                        </Button>
                      )}
                      <Button
                        variant="outlined"
                        size="small"
                        startIcon={<PictureAsPdf />}
                        onClick={() => handleDownloadCountyResponsePdf(feedback)}
                      >
                        Download PDF
                      </Button>
                    </Box>
                  </Box>
                  <Divider sx={{ width: '100%', mt: 1 }} />
                </ListItem>
              ))}
            </List>
          )}
        </DialogContent>
      </Dialog>
        </>
      )}

      {/* Analytics Tab */}
      {activeTab === 1 && (
        <ModerationAnalytics />
      )}
    </Box>
  );
};

export default FeedbackModerationPage;
