import React from 'react';
import {
  Box,
  Typography,
  FormControl,
  FormLabel,
  RadioGroup,
  FormControlLabel,
  Radio,
  Paper,
  Tooltip,
} from '@mui/material';
import {
  SentimentVeryDissatisfied,
  SentimentDissatisfied,
  SentimentNeutral,
  SentimentSatisfied,
  SentimentVerySatisfied,
} from '@mui/icons-material';
import { LIKERT_DISPLAY_ORDER, LIKERT_SCALE } from '../constants/evaluationQuestions';

const EMOTICONS_BY_VALUE = {
  1: <SentimentVeryDissatisfied key="1" />,
  2: <SentimentDissatisfied key="2" />,
  3: <SentimentNeutral key="3" />,
  4: <SentimentSatisfied key="4" />,
  5: <SentimentVerySatisfied key="5" />,
};

const COLORS_BY_VALUE = {
  1: '#f44336',
  2: '#ff9800',
  3: '#fdd835',
  4: '#8bc34a',
  5: '#4caf50',
};

/**
 * Bilingual 5-point Likert scale — Strongly Agree (5) shown first (left).
 */
const RatingInput = ({
  criterionEn,
  criterionSw,
  statementEn,
  statementSw,
  name,
  value,
  onChange,
  disabled = false,
  scaleOptions = LIKERT_SCALE,
}) => {
  const scaleByValue = Object.fromEntries(scaleOptions.map((item) => [item.value, item]));

  const handleChange = (event) => {
    onChange({ target: { name, value: parseInt(event.target.value, 10) } });
  };

  const selectedScale = value ? scaleByValue[value] : null;

  return (
    <Box sx={{ mb: 3 }}>
      <FormControl component="fieldset" fullWidth disabled={disabled}>
        <FormLabel
          component="legend"
          sx={{
            fontWeight: 'bold',
            color: 'text.primary',
            mb: 1.5,
            fontSize: '1rem',
            lineHeight: 1.6,
          }}
        >
          <Typography component="span" variant="subtitle1" fontWeight="bold" display="block">
            {criterionEn}
            {criterionSw ? ` (${criterionSw})` : ''}
          </Typography>
          <Typography variant="body2" sx={{ mt: 0.75, fontWeight: 500 }}>
            {statementEn}
          </Typography>
          {statementSw && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, fontStyle: 'italic' }}>
              {statementSw}
            </Typography>
          )}
        </FormLabel>

        <RadioGroup
          row
          name={name}
          value={value || ''}
          onChange={handleChange}
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 1,
            mt: 1,
          }}
        >
          {LIKERT_DISPLAY_ORDER.map((rating) => {
            const scale = scaleByValue[rating];
            const color = COLORS_BY_VALUE[rating];
            const tooltip = scale ? `${scale.en} / ${scale.sw}` : '';

            return (
              <Tooltip key={rating} title={tooltip} arrow placement="top">
                <Paper
                  elevation={value === rating ? 4 : 1}
                  sx={{
                    flex: '1 1 0',
                    minWidth: { xs: '70px', sm: '85px', md: '100px' },
                    textAlign: 'center',
                    borderRadius: '12px',
                    transition: 'all 0.3s ease',
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    border: value === rating ? `4px solid ${color}` : '2px solid #e0e0e0',
                    backgroundColor: value === rating ? `${color}20` : 'white',
                    boxShadow: value === rating ? `0 4px 12px ${color}40` : undefined,
                    '&:hover': {
                      transform: disabled ? 'none' : 'translateY(-4px)',
                      boxShadow: disabled ? 1 : 6,
                      borderColor: color,
                      backgroundColor: `${color}08`,
                    },
                  }}
                >
                  <FormControlLabel
                    value={rating}
                    control={<Radio sx={{ display: 'none' }} />}
                    label={
                      <Box sx={{ py: 2, px: { xs: 0.5, sm: 1, md: 1.5 } }}>
                        <Box
                          sx={{
                            color,
                            fontSize: { xs: '1.75rem', sm: '2rem' },
                            display: 'flex',
                            justifyContent: 'center',
                            mb: 0.5,
                          }}
                        >
                          {EMOTICONS_BY_VALUE[rating]}
                        </Box>
                        <Typography
                          variant="h6"
                          sx={{
                            fontWeight: 'bold',
                            fontSize: { xs: '1.1rem', sm: '1.25rem' },
                            color: 'text.primary',
                          }}
                        >
                          {rating}
                        </Typography>
                        {scale && (
                          <Box sx={{ display: { xs: 'none', md: 'block' } }}>
                            <Typography
                              variant="caption"
                              sx={{
                                color: 'rgba(0, 0, 0, 0.75)',
                                fontSize: '0.7rem',
                                fontWeight: value === rating ? 600 : 500,
                                lineHeight: 1.25,
                                mt: 0.5,
                                minHeight: '32px',
                                px: 0.5,
                                wordWrap: 'break-word',
                                display: 'block',
                              }}
                            >
                              {scale.en}
                            </Typography>
                            <Typography
                              variant="caption"
                              sx={{
                                color: 'text.secondary',
                                fontSize: '0.68rem',
                                lineHeight: 1.2,
                                px: 0.5,
                                display: 'block',
                              }}
                            >
                              {scale.sw}
                            </Typography>
                          </Box>
                        )}
                      </Box>
                    }
                    sx={{
                      margin: 0,
                      width: '100%',
                      '& .MuiFormControlLabel-label': { width: '100%' },
                    }}
                  />
                </Paper>
              </Tooltip>
            );
          })}
        </RadioGroup>

        {selectedScale && (
          <Box
            sx={{
              mt: 2,
              p: 2.5,
              backgroundColor: `${COLORS_BY_VALUE[value]}15`,
              borderLeft: `5px solid ${COLORS_BY_VALUE[value]}`,
              borderRadius: '8px',
              boxShadow: `0 2px 8px ${COLORS_BY_VALUE[value]}20`,
            }}
          >
            <Typography variant="body1" sx={{ color: 'rgba(0, 0, 0, 0.87)', fontWeight: 500, lineHeight: 1.6 }}>
              <Box component="span" sx={{ fontWeight: 700, color: COLORS_BY_VALUE[value] }}>
                {value}/5:
              </Box>{' '}
              {selectedScale.en} / {selectedScale.sw}
            </Typography>
          </Box>
        )}
      </FormControl>
    </Box>
  );
};

export default RatingInput;
