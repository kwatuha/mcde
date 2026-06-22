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
  Paper,
} from '@mui/material';
import {
  Close,
  Send,
  Comment,
  Business,
  CalendarToday,
  CheckCircle,
} from '@mui/icons-material';
import { submitFeedback } from '../services/publicApi';
import { formatCurrency, formatDate } from '../utils/formatters';
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

const ProjectFeedbackModal = ({ open, onClose, project }) => {
  const [formData, setFormData] = useState(baseForm);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [successDialogOpen, setSuccessDialogOpen] = useState(false);
  const [error, setError] = useState(null);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const resetForm = () => setFormData(baseForm);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!hasEvaluationResponse(formData)) {
      setError('Please provide at least one rating or written response.');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const feedbackData = {
        ...formData,
        projectId: project.id,
        subject: formData.subject || `Evaluation: ${project.projectName}`,
      };

      await submitFeedback(feedbackData);

      setSuccess(true);
      setSuccessDialogOpen(true);
      resetForm();
    } catch (err) {
      console.error('Error submitting feedback:', err);
      setError(`Failed to submit feedback: ${err.message || 'Please try again later.'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!loading) {
      resetForm();
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

  if (!project) return null;

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
            boxShadow: '0 8px 32px rgba(0,0,0,0.1)',
          },
        }}
      >
        <DialogTitle sx={{
          pb: 2,
          background: 'linear-gradient(135deg, #1976d2 0%, #42a5f5 100%)',
          color: 'white',
          position: 'relative',
        }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Comment sx={{ fontSize: '2rem' }} />
              <Box>
                <Typography variant="h5" sx={{ fontWeight: 'bold' }}>
                  Submit Feedback
                </Typography>
                <Typography variant="body2" sx={{ opacity: 0.9 }}>
                  {EVALUATION_INTRO.titleEn} / {EVALUATION_INTRO.titleSw}
                </Typography>
              </Box>
            </Box>
            <IconButton
              onClick={handleClose}
              disabled={loading}
              sx={{
                color: 'white',
                '&:hover': { backgroundColor: 'rgba(255,255,255,0.1)' },
              }}
            >
              <Close />
            </IconButton>
          </Box>
        </DialogTitle>

        <DialogContent sx={{ p: 3 }}>
          <Paper
            elevation={0}
            sx={{
              p: 2,
              mb: 3,
              backgroundColor: '#f8f9fa',
              borderRadius: '12px',
              border: '1px solid #e0e0e0',
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
                    fontWeight: 'bold',
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

          {error && (
            <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
              {error}
            </Alert>
          )}

          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            {EVALUATION_INTRO.instructionEn}
            <br />
            <Box component="span" sx={{ fontStyle: 'italic' }}>
              {EVALUATION_INTRO.instructionSw}
            </Box>
          </Typography>

          <Box sx={{ mb: 4 }}>
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
                disabled={loading || success}
              />
            ))}
          </Box>

          <Divider sx={{ my: 3 }} />

          <Box sx={{ mb: 4 }}>
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
                disabled={loading || success}
              />
            ))}
          </Box>

          <Divider sx={{ my: 3 }} />

          <Typography variant="h6" fontWeight="bold" gutterBottom>
            Additional Comments (Optional)
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Maoni ya ziada (si lazima)
          </Typography>
          <TextField
            fullWidth
            multiline
            rows={4}
            label="Your feedback"
            name="message"
            value={formData.message}
            onChange={handleChange}
            disabled={loading || success}
            placeholder="Any other comments about this project..."
            sx={{ mb: 3 }}
          />

          <Typography variant="h6" fontWeight="bold" gutterBottom>
            Contact Information (Optional)
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Provide your contact details only if you&apos;d like us to respond. You can submit feedback anonymously.
          </Typography>

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
        </DialogContent>

        <DialogActions sx={{ p: 3, pt: 0 }}>
          <Button
            onClick={handleClose}
            disabled={loading}
            variant="outlined"
            sx={{ borderRadius: '8px', textTransform: 'none', fontWeight: 'bold' }}
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
              background: 'linear-gradient(135deg, #1976d2 0%, #42a5f5 100%)',
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
        PaperProps={{ sx: { borderRadius: '8px', overflow: 'hidden' } }}
      >
        <Box
          sx={{
            background: 'linear-gradient(135deg, #2e7d32 0%, #66bb6a 100%)',
            color: 'white',
            textAlign: 'center',
            py: 3,
            px: 3,
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
              justifyContent: 'center',
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
          <Paper variant="outlined" sx={{ p: 2.5, borderRadius: '8px', backgroundColor: '#fafafa' }}>
            <Typography variant="body1" sx={{ lineHeight: 1.75 }}>
              Thank you for visiting the County Government of Machakos Public Investment Management System.
              Your evaluation has been received and forwarded for feedback processing. Kindly stay patient as
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
              '&:hover': { backgroundColor: '#1b5e20' },
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
