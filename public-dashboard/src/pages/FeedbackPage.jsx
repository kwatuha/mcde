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
  Divider,
} from '@mui/material';
import { Send } from '@mui/icons-material';
import { submitFeedback } from '../services/publicApi';
import RatingInput from './RatingInput';
import BilingualQuestionField from './BilingualQuestionField';
import {
  EVALUATION_INTRO,
  EVALUATION_CRITERIA,
  OPEN_ENDED_QUESTIONS,
  EMPTY_EVALUATION_FORM,
  hasEvaluationResponse,
} from '../constants/evaluationQuestions';

const baseForm = {
  name: '',
  email: '',
  phone: '',
  subject: '',
  message: '',
  ...EMPTY_EVALUATION_FORM,
};

const FeedbackPage = () => {
  const [formData, setFormData] = useState(baseForm);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState(null);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!hasEvaluationResponse(formData)) {
      setError('Please provide at least one rating or written response.');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      await submitFeedback(formData);
      setSuccess(true);
      setFormData(baseForm);
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
          {EVALUATION_INTRO.titleEn} / {EVALUATION_INTRO.titleSw}
        </Typography>
        <Typography variant="body1" color="text.secondary">
          {EVALUATION_INTRO.instructionEn}
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ fontStyle: 'italic' }}>
          {EVALUATION_INTRO.instructionSw}
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
          <Typography variant="h6" fontWeight="bold" gutterBottom>
            Evaluation Criteria (Optional) / Vigezo vya Tathmini (Si lazima)
          </Typography>

          {EVALUATION_CRITERIA.map((criterion, index) => (
            <RatingInput
              key={criterion.name}
              criterionEn={`${index + 1}. ${criterion.criterionEn}`}
              criterionSw={criterion.criterionSw}
              statementEn={criterion.statementEn}
              statementSw={criterion.statementSw}
              name={criterion.name}
              value={formData[criterion.name]}
              onChange={handleChange}
              disabled={loading}
            />
          ))}

          <Divider sx={{ my: 4 }} />

          <Typography variant="h6" fontWeight="bold" gutterBottom>
            Open-Ended Questions (Optional)
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2, fontStyle: 'italic' }}>
            Maswali ya Maoni ya Ziada (Si lazima)
          </Typography>

          {OPEN_ENDED_QUESTIONS.map((question) => (
            <BilingualQuestionField
              key={question.name}
              labelEn={question.en}
              labelSw={question.sw}
              name={question.name}
              value={formData[question.name]}
              onChange={handleChange}
              disabled={loading}
            />
          ))}

          <Divider sx={{ my: 4 }} />

          <Typography variant="h6" fontWeight="bold" gutterBottom>
            Additional Comments (Optional)
          </Typography>
          <TextField
            fullWidth
            multiline
            rows={4}
            label="Your feedback"
            name="message"
            value={formData.message}
            onChange={handleChange}
            disabled={loading}
            placeholder="Any other comments..."
            sx={{ mb: 3 }}
          />

          <Divider sx={{ my: 4 }} />

          <Typography variant="h6" fontWeight="bold" gutterBottom>
            Contact Information (Optional)
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
    </Container>
  );
};

export default FeedbackPage;
