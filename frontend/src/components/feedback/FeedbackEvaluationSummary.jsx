import React from 'react';
import {
  Box,
  Grid,
  LinearProgress,
  Paper,
  Typography,
} from '@mui/material';
import {
  FEEDBACK_RATING_FIELDS,
  LEGACY_FEEDBACK_RATING_FIELDS,
  FEEDBACK_OPEN_FIELDS,
  feedbackHasAnyRating,
  feedbackHasAnyOpenResponse,
  getLikertLabel,
} from '../../constants/evaluationQuestions';

function RatingBar({ field, value }) {
  const numeric = Number(value);
  if (!numeric) return null;

  const likert = getLikertLabel(numeric);

  return (
    <Grid item xs={12}>
      <Box sx={{ mb: 2 }}>
        <Typography variant="subtitle2" fontWeight="bold">
          {field.label}
        </Typography>
        {field.statementEn && (
          <>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {field.statementEn}
            </Typography>
            {field.statementSw && (
              <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                {field.statementSw}
              </Typography>
            )}
          </>
        )}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
          <Typography variant="h6" fontWeight="bold">
            {numeric}/5
          </Typography>
          <Box sx={{ flexGrow: 1 }}>
            <LinearProgress
              variant="determinate"
              value={(numeric / 5) * 100}
              sx={{
                height: 8,
                borderRadius: 4,
                backgroundColor: '#e0e0e0',
                '& .MuiLinearProgress-bar': {
                  backgroundColor: numeric >= 4 ? '#4caf50' : numeric >= 3 ? '#fdd835' : '#f44336',
                },
              }}
            />
          </Box>
        </Box>
        {likert && (
          <Typography variant="body2" sx={{ mt: 0.75, fontWeight: 500 }}>
            {likert}
          </Typography>
        )}
      </Box>
    </Grid>
  );
}

function LegacyRatingBar({ label, value }) {
  const numeric = Number(value);
  if (!numeric) return null;

  return (
    <Grid item xs={12} sm={6} md={4}>
      <Box>
        <Typography variant="caption" color="text.secondary">
          {label}
        </Typography>
        <Typography variant="h6" fontWeight="bold">
          {numeric}/5
        </Typography>
      </Box>
    </Grid>
  );
}

export default function FeedbackEvaluationSummary({ feedback }) {
  const showRatings = feedbackHasAnyRating(feedback);
  const showOpen = feedbackHasAnyOpenResponse(feedback);

  if (!showRatings && !showOpen) return null;

  return (
    <>
      {showRatings && (
        <Box sx={{ mb: 3 }}>
          <Typography variant="subtitle2" color="primary" fontWeight="bold" gutterBottom>
            CITIZEN EVALUATION RATINGS
          </Typography>
          <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
            5 = Strongly Agree (Nakubaliana Kabisa) · 1 = Strongly Disagree (Sikubaliani Kabisa)
          </Typography>
          <Paper
            elevation={0}
            sx={{
              p: 2,
              backgroundColor: '#fff3e0',
              borderLeft: '4px solid #ff9800',
              borderRadius: '8px',
            }}
          >
            <Grid container spacing={1}>
              {FEEDBACK_RATING_FIELDS.map((field) => (
                <RatingBar key={field.key} field={field} value={feedback[field.key]} />
              ))}
              {LEGACY_FEEDBACK_RATING_FIELDS.map((field) => (
                <LegacyRatingBar key={field.key} label={field.label} value={feedback[field.key]} />
              ))}
            </Grid>
          </Paper>
        </Box>
      )}

      {showOpen && (
        <Box sx={{ mb: 3 }}>
          <Typography variant="subtitle2" color="primary" fontWeight="bold" gutterBottom>
            OPEN-ENDED RESPONSES
          </Typography>
          <Paper
            elevation={0}
            sx={{
              p: 2,
              backgroundColor: '#f3f8ff',
              borderLeft: '4px solid #1976d2',
              borderRadius: '8px',
            }}
          >
            {FEEDBACK_OPEN_FIELDS.map((field) => {
              const text = String(feedback[field.key] || '').trim();
              if (!text) return null;
              return (
                <Box key={field.key} sx={{ mb: 2, '&:last-child': { mb: 0 } }}>
                  <Typography variant="body2" fontWeight="bold" display="block">
                    {field.labelEn}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" display="block" sx={{ fontStyle: 'italic' }}>
                    {field.labelSw}
                  </Typography>
                  <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', mt: 0.5 }}>
                    {text}
                  </Typography>
                </Box>
              );
            })}
          </Paper>
        </Box>
      )}
    </>
  );
}
