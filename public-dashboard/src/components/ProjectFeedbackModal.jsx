import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Box,
  Typography,
  IconButton,
  TextField,
  Button,
  Alert,
  CircularProgress,
  Chip,
  Grid,
  Divider,
  Paper
} from '@mui/material';
import {
  Close,
  Send,
  Comment,
  Business,
  CalendarToday,
  CheckCircle
} from '@mui/icons-material';
import { submitFeedback } from '../services/publicApi';
import { formatCurrency, formatDate } from '../utils/formatters';
import RatingInput from './RatingInput';

const ProjectFeedbackModal = ({ open, onClose, project }) => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    subject: '',
    message: '',
    ratingOverallSupport: null,
    ratingQualityOfLifeImpact: null,
    ratingCommunityAlignment: null,
    ratingTransparency: null,
    ratingFeasibilityConfidence: null
  });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [successDialogOpen, setSuccessDialogOpen] = useState(false);
  const [error, setError] = useState(null);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    console.log('Submit button clicked');
    console.log('Form data:', formData);
    console.log('Project ID:', project.id);
    
    // Validation
    if (!formData.message) {
      console.log('Validation failed:', { message: formData.message });
      setError('Message is required');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      
      const feedbackData = {
        ...formData,
        projectId: project.id,
        subject: formData.subject || `Feedback on: ${project.projectName}`
      };
      
      console.log('Submitting feedback:', feedbackData);
      
      // Submit feedback with project ID
      const result = await submitFeedback(feedbackData);
      
      console.log('Feedback submission result:', result);
      
      setSuccess(true);
      setSuccessDialogOpen(true);
      
      // Reset form
      setFormData({
        name: '',
        email: '',
        phone: '',
        subject: '',
        message: '',
        ratingOverallSupport: null,
        ratingQualityOfLifeImpact: null,
        ratingCommunityAlignment: null,
        ratingTransparency: null,
        ratingFeasibilityConfidence: null
      });
    } catch (err) {
      console.error('Error submitting feedback:', err);
      setError(`Failed to submit feedback: ${err.message || 'Please try again later.'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!loading) {
      setFormData({
        name: '',
        email: '',
        phone: '',
        subject: '',
        message: '',
        ratingOverallSupport: null,
        ratingQualityOfLifeImpact: null,
        ratingCommunityAlignment: null,
        ratingTransparency: null,
        ratingFeasibilityConfidence: null
      });
      setSuccess(false);
      setSuccessDialogOpen(false);
      setError(null);
      onClose();
    }
  };

  const handleSuccessDialogClose = () => {
    setSuccessDialogOpen(false);
    setSuccess(false);
    onClose();
  };

  console.log('ProjectFeedbackModal - open:', open, 'project:', project);

  if (!project) {
    console.log('ProjectFeedbackModal - No project provided, returning null');
    return null;
  }

  return (
    <>
    <Dialog 
      open={open} 
      onClose={handleClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: '16px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.1)'
        }
      }}
    >
      <DialogTitle sx={{ 
        pb: 2,
        background: 'linear-gradient(135deg, #1976d2 0%, #42a5f5 100%)',
        color: 'white',
        position: 'relative'
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Comment sx={{ fontSize: '2rem' }} />
            <Box>
              <Typography variant="h5" sx={{ fontWeight: 'bold' }}>
                Submit Feedback
              </Typography>
              <Typography variant="body2" sx={{ opacity: 0.9 }}>
                Share your thoughts about this project
              </Typography>
            </Box>
          </Box>
          <IconButton 
            onClick={handleClose}
            disabled={loading}
            sx={{ 
              color: 'white',
              '&:hover': { backgroundColor: 'rgba(255,255,255,0.1)' }
            }}
          >
            <Close />
          </IconButton>
        </Box>
      </DialogTitle>

      <DialogContent sx={{ p: 3 }}>
        {/* Project Information */}
        <Paper 
          elevation={0} 
          sx={{ 
            p: 2, 
            mb: 3, 
            backgroundColor: '#f8f9fa',
            borderRadius: '12px',
            border: '1px solid #e0e0e0'
          }}
        >
          <Typography variant="subtitle2" color="text.secondary" gutterBottom>
            PROJECT DETAILS
          </Typography>
          
          <Typography variant="h6" fontWeight="bold" gutterBottom>
            {project.projectName}
          </Typography>

          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12} sm={6}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Business sx={{ fontSize: 18, color: 'text.secondary' }} />
                <Typography variant="body2" color="text.secondary">
                  {project.department || 'N/A'}
                </Typography>
              </Box>
            </Grid>

            <Grid item xs={12} sm={6}>
              <Typography variant="body2" color="text.secondary">
                Budget: <strong>{formatCurrency(project.budget)}</strong>
              </Typography>
            </Grid>

            {/* Project Timeline */}
            <Grid item xs={12} sm={6}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <CalendarToday sx={{ fontSize: 18, color: 'text.secondary' }} />
                <Typography variant="body2" color="text.secondary">
                  Start: <strong>{formatDate(project.startDate || project.start_date)}</strong>
                </Typography>
              </Box>
            </Grid>

            <Grid item xs={12} sm={6}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <CalendarToday sx={{ fontSize: 18, color: 'text.secondary' }} />
                <Typography variant="body2" color="text.secondary">
                  End: <strong>{formatDate(project.endDate || project.end_date)}</strong>
                </Typography>
              </Box>
            </Grid>

            <Grid item xs={12}>
              <Chip 
                label={project.status}
                size="small"
                sx={{
                  backgroundColor: project.statusColor || '#757575',
                  color: 'white',
                  fontWeight: 'bold'
                }}
              />
              <Chip 
                label={`${project.completionPercentage || 0}% Complete`}
                size="small"
                sx={{ ml: 1 }}
              />
            </Grid>
          </Grid>
        </Paper>

        <Divider sx={{ mb: 3 }} />

        {/* Error Message */}
        {error && (
          <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {/* Feedback Form - FIRST (Required) */}
        <Typography variant="h6" fontWeight="bold" gutterBottom>
          Your Feedback
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Please share your thoughts about this project. Your feedback is valuable and can be submitted anonymously.
        </Typography>

        <form onSubmit={handleSubmit}>
          <Grid container spacing={2}>
            {/* Message First */}
            <Grid item xs={12}>
              <TextField
                fullWidth
                required
                multiline
                rows={5}
                label="Your Feedback"
                name="message"
                value={formData.message}
                onChange={handleChange}
                disabled={loading || success}
                placeholder="Please share your feedback, suggestions, or concerns about this project..."
                helperText="Your feedback helps us improve project delivery and transparency"
              />
            </Grid>
          </Grid>
        </form>

        <Divider sx={{ my: 4 }} />

        {/* Rating Section - SECOND (Optional) */}
        <Box sx={{ mb: 4 }}>
          <Typography variant="h6" fontWeight="bold" gutterBottom sx={{ mb: 3 }}>
            Rate This Project (Optional)
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Your ratings help us understand public sentiment and improve project delivery. All ratings are optional.
          </Typography>

          <RatingInput
            label="1. Overall Satisfaction/Support for the Project"
            name="ratingOverallSupport"
            value={formData.ratingOverallSupport}
            onChange={handleChange}
            disabled={loading || success}
            descriptions={[
              'Strongly Oppose - The project should not proceed in its current form',
              'Oppose - I have significant concerns or reservations about the project',
              'Neutral - I have mixed feelings or no strong opinion on the project',
              'Support - I generally agree with the project and its goals',
              'Strongly Support - The project is excellent and I fully agree with it'
            ]}
          />

          <RatingInput
            label="2. Perceived Impact on Personal/Community Quality of Life"
            name="ratingQualityOfLifeImpact"
            value={formData.ratingQualityOfLifeImpact}
            onChange={handleChange}
            disabled={loading || success}
            descriptions={[
              'Highly Negative Impact - Will significantly worsen quality of life',
              'Moderately Negative Impact - Will cause some inconvenience or harm',
              'No Significant Change - The project will have little to no impact',
              'Moderately Positive Impact - Will lead to noticeable improvements',
              'Highly Positive Impact - Will significantly improve quality of life'
            ]}
          />

          <RatingInput
            label="3. Alignment with Community Needs and Priorities"
            name="ratingCommunityAlignment"
            value={formData.ratingCommunityAlignment}
            onChange={handleChange}
            disabled={loading || success}
            descriptions={[
              'Not Aligned at All - This project is unnecessary or misplaced',
              'Poorly Aligned - This is not a priority for the community',
              'Somewhat Aligned - This is a secondary need, but acceptable',
              'Well Aligned - This addresses an important community need',
              'Perfectly Aligned - This is a top priority need for the community'
            ]}
          />

          <RatingInput
            label="4. Implementation/Supervision"
            name="ratingTransparency"
            value={formData.ratingTransparency}
            onChange={handleChange}
            disabled={loading || success}
            descriptions={[
              'Very Poor Implementation - Implementation teams were unprofessional and unresponsive',
              'Poor Implementation - Implementation teams showed poor management and communication',
              'Adequate Implementation - Implementation teams were acceptable but had some issues',
              'Good Implementation - Implementation teams managed the process well with minor issues',
              'Excellent Implementation - Implementation teams were highly professional and effective'
            ]}
          />

          <RatingInput
            label="5. Confidence in the Project's Timeline and Budget (Feasibility)"
            name="ratingFeasibilityConfidence"
            value={formData.ratingFeasibilityConfidence}
            onChange={handleChange}
            disabled={loading || success}
            descriptions={[
              'Very Low Confidence - Do not believe the project can be completed successfully',
              'Low Confidence - Significant concerns about delays and costs',
              'Moderate Confidence - Expect delays or minor budget overruns',
              'High Confidence - Mostly confident, with only minor doubts',
              'Very High Confidence - Trust the project will be delivered as promised'
            ]}
          />
        </Box>

        <Divider sx={{ my: 4 }} />

        {/* Contact Information - THIRD (Optional) */}
        <Typography variant="h6" fontWeight="bold" gutterBottom>
          Contact Information (Optional)
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Provide your contact details only if you'd like us to respond. You can submit feedback anonymously.
        </Typography>

        <form onSubmit={handleSubmit}>
          <Grid container spacing={2}>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Your Name (Optional)"
                name="name"
                value={formData.name}
                onChange={handleChange}
                disabled={loading || success}
                placeholder="Enter your name if you'd like us to contact you"
              />
            </Grid>

            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Email Address (Optional)"
                name="email"
                type="email"
                value={formData.email}
                onChange={handleChange}
                disabled={loading || success}
                placeholder="your.email@example.com"
              />
            </Grid>

            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Phone Number (Optional)"
                name="phone"
                value={formData.phone}
                onChange={handleChange}
                disabled={loading || success}
                placeholder="+254 700 000 000"
              />
            </Grid>

            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Subject (Optional)"
                name="subject"
                value={formData.subject}
                onChange={handleChange}
                disabled={loading || success}
                placeholder={`Feedback about ${project.projectName}`}
              />
            </Grid>
          </Grid>
        </form>
      </DialogContent>

      <DialogActions sx={{ p: 3, pt: 0 }}>
        <Button 
          onClick={handleClose}
          disabled={loading}
          variant="outlined"
          sx={{ 
            borderRadius: '8px',
            textTransform: 'none',
            fontWeight: 'bold'
          }}
        >
          Cancel
        </Button>
        <Button 
          onClick={handleSubmit}
          disabled={loading || success}
          variant="contained"
          startIcon={loading ? <CircularProgress size={20} /> : <Send />}
          sx={{ 
            borderRadius: '8px',
            textTransform: 'none',
            fontWeight: 'bold',
            background: 'linear-gradient(135deg, #1976d2 0%, #42a5f5 100%)'
          }}
        >
          {loading ? 'Submitting...' : success ? 'Submitted!' : 'Submit Feedback'}
        </Button>
      </DialogActions>
    </Dialog>
    <Dialog
      open={successDialogOpen}
      onClose={handleSuccessDialogClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: '8px',
          overflow: 'hidden'
        }
      }}
    >
      <Box
        sx={{
          background: 'linear-gradient(135deg, #2e7d32 0%, #66bb6a 100%)',
          color: 'white',
          textAlign: 'center',
          py: 3,
          px: 3
        }}
      >
        <Box
          sx={{
            width: 44,
            height: 44,
            mx: 'auto',
            mb: 1.5,
            borderRadius: '50%',
            backgroundColor: 'rgba(255,255,255,0.92)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <CheckCircle sx={{ fontSize: 34, color: '#2e7d32' }} />
        </Box>
        <Typography variant="h5" fontWeight="bold">
          Your message has been received
        </Typography>
        <Typography variant="body2" sx={{ mt: 1, opacity: 0.95 }}>
          Thank you for contacting the County Government of Machakos
        </Typography>
      </Box>
      <DialogContent sx={{ p: 3, pb: 1 }}>
        <Paper
          variant="outlined"
          sx={{
            p: 2.5,
            borderRadius: '8px',
            backgroundColor: '#fafafa'
          }}
        >
          <Typography variant="body1" sx={{ lineHeight: 1.75 }}>
            Thank you for visiting the County Government of Machakos Public Investment Management System.
            Your message has been received and forwarded for feedback processing. Kindly stay patient as
            we process your concerns.
          </Typography>
        </Paper>
      </DialogContent>
      <DialogActions sx={{ justifyContent: 'center', px: 3, pb: 3 }}>
        <Button
          variant="contained"
          onClick={handleSuccessDialogClose}
          autoFocus
          sx={{
            minWidth: 160,
            borderRadius: '8px',
            py: 1,
            fontWeight: 'bold',
            backgroundColor: '#2e7d32',
            '&:hover': {
              backgroundColor: '#1b5e20'
            }
          }}
        >
          OK
        </Button>
      </DialogActions>
    </Dialog>
    </>
  );
};

export default ProjectFeedbackModal;

