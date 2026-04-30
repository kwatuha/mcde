import React, { useState } from 'react';
import {
  Container,
  Typography,
  Box,
  Paper,
  TextField,
  Button,
  Alert,
  CircularProgress,
  Grid,
  Divider
} from '@mui/material';
import { Send } from '@mui/icons-material';
import { submitFeedback } from '../services/publicApi';
import RatingInput from '../components/RatingInput';

const FeedbackPage = () => {
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
  const [error, setError] = useState(null);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Validation
    if (!formData.message) {
      setError('Message is required');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      await submitFeedback(formData);
      setSuccess(true);
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
      // Hide success message after 5 seconds
      setTimeout(() => setSuccess(false), 5000);
    } catch (err) {
      console.error('Error submitting feedback:', err);
      setError('Failed to submit feedback. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" fontWeight="bold" gutterBottom>
          Submit Feedback
        </Typography>
        <Typography variant="body1" color="text.secondary">
          We value your feedback and suggestions. Help us improve our services.
        </Typography>
      </Box>

      {success && (
        <Alert severity="success" sx={{ mb: 3 }} onClose={() => setSuccess(false)}>
          Thank you for your feedback! We will review it and get back to you if needed.
        </Alert>
      )}

      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Paper elevation={2} sx={{ p: 4 }}>
        <form onSubmit={handleSubmit}>
          {/* Your Feedback - FIRST (Required) */}
          <Typography variant="h6" fontWeight="bold" gutterBottom>
            Your Feedback
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Share your thoughts, suggestions, or concerns. Your feedback is valuable and can be submitted anonymously.
          </Typography>

          <Grid container spacing={3}>
            <Grid item xs={12}>
              <TextField
                fullWidth
                required
                multiline
                rows={6}
                label="Your Message"
                name="message"
                value={formData.message}
                onChange={handleChange}
                disabled={loading}
                placeholder="Please share your feedback, suggestions, or questions..."
                helperText="Your message helps us improve our services"
              />
            </Grid>
          </Grid>

          <Divider sx={{ my: 4 }} />

          {/* Rating Section - SECOND (Optional) */}
          <Box sx={{ mb: 4 }}>
            <Typography variant="h6" fontWeight="bold" gutterBottom>
              Rate County Projects (Optional)
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              If your feedback is about a specific project, please provide ratings to help us understand your sentiment better.
            </Typography>

            <RatingInput
              label="1. Overall Satisfaction/Support for the Project"
              name="ratingOverallSupport"
              value={formData.ratingOverallSupport}
              onChange={handleChange}
              disabled={loading}
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
              disabled={loading}
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
              disabled={loading}
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
              disabled={loading}
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
              disabled={loading}
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

          <Grid container spacing={3}>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Your Name (Optional)"
                name="name"
                value={formData.name}
                onChange={handleChange}
                disabled={loading}
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
                disabled={loading}
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
                disabled={loading}
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
                disabled={loading}
                placeholder="Brief subject of your feedback"
              />
            </Grid>

            <Grid item xs={12}>
              <Button
                type="submit"
                variant="contained"
                size="large"
                fullWidth
                disabled={loading}
                startIcon={loading ? <CircularProgress size={20} /> : <Send />}
              >
                {loading ? 'Submitting...' : 'Submit Feedback'}
              </Button>
            </Grid>
          </Grid>
        </form>
      </Paper>

      {/* Contact Information */}
      <Box sx={{ mt: 4 }}>
        <Typography variant="h6" fontWeight="bold" gutterBottom>
          Contact Information
        </Typography>
        <Paper elevation={1} sx={{ p: 3 }}>
          <Typography variant="body1" gutterBottom>
            <strong>Email:</strong> info@machos.go.ke
          </Typography>
          <Typography variant="body1" gutterBottom>
            <strong>Phone:</strong> +254 700 123 456
          </Typography>
          <Typography variant="body1">
            <strong>Office Hours:</strong> Monday - Friday, 8:00 AM - 5:00 PM
          </Typography>
        </Paper>
      </Box>
    </Container>
  );
};

export default FeedbackPage;

