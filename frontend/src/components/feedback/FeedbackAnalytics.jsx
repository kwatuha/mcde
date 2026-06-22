import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  Grid,
  Card,
  CardContent,
  CircularProgress,
  Alert,
  Tabs,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
} from '@mui/material';
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { Assessment, Star } from '@mui/icons-material';
import axiosInstance from '../../api/axiosInstance';
import {
  FEEDBACK_RATING_ANALYTICS,
  feedbackHasAnyRatingValue,
  collectRatingValues,
  averageRating,
  ratingDistribution,
} from '../../constants/evaluationQuestions';

const COLORS = ['#f44336', '#ff9800', '#fdd835', '#8bc34a', '#4caf50'];
const CHART_COLORS = ['#1976d2', '#2e7d32', '#ed6c02', '#7b1fa2', '#00838f', '#5d4037'];

const flatAnalyticsCardSx = (accentColor) => ({
  height: '100%',
  border: '1px solid',
  borderColor: 'divider',
  borderLeft: `4px solid ${accentColor}`,
  backgroundColor: 'background.paper',
  boxShadow: 'none',
});

const FeedbackAnalytics = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [activeTab, setActiveTab] = useState(0);

  useEffect(() => {
    fetchFeedbackAnalytics();
  }, []);

  const fetchFeedbackAnalytics = async () => {
    try {
      setLoading(true);
      const response = await axiosInstance.get('/public/feedback?limit=1000');
      const feedbacks = response.data.feedbacks || [];
      setAnalytics(calculateAnalytics(feedbacks));
      setError(null);
    } catch (err) {
      console.error('Error fetching feedback analytics:', err);
      setError('Failed to load analytics data');
    } finally {
      setLoading(false);
    }
  };

  const calculateAnalytics = (feedbacks) => {
    const withRatings = feedbacks.filter(feedbackHasAnyRatingValue);
    if (!withRatings.length) {
      return { totalWithRatings: 0, averages: {}, distributions: {}, byProject: [], trendData: [] };
    }

    const averages = Object.fromEntries(
      FEEDBACK_RATING_ANALYTICS.map(({ key, avgKey }) => [
        avgKey,
        averageRating(collectRatingValues(withRatings, key)),
      ]),
    );

    const distributions = Object.fromEntries(
      FEEDBACK_RATING_ANALYTICS.map(({ key, avgKey }) => [
        avgKey,
        ratingDistribution(withRatings, key),
      ]),
    );

    const byProject = calculateByProject(withRatings);
    const trendData = calculateTrends(withRatings);

    return {
      totalWithRatings: withRatings.length,
      averages,
      distributions,
      byProject,
      trendData,
    };
  };

  const calculateByProject = (feedbacks) => {
    const projectMap = {};

    feedbacks.forEach((f) => {
      if (!f.project_name) return;
      if (!projectMap[f.project_name]) {
        projectMap[f.project_name] = { name: f.project_name, count: 0 };
        FEEDBACK_RATING_ANALYTICS.forEach(({ avgKey }) => {
          projectMap[f.project_name][avgKey] = [];
        });
      }
      projectMap[f.project_name].count += 1;
      FEEDBACK_RATING_ANALYTICS.forEach(({ key, avgKey }) => {
        if (f[key]) projectMap[f.project_name][avgKey].push(Number(f[key]));
      });
    });

    return Object.values(projectMap)
      .map((project) => ({
        name: project.name,
        count: project.count,
        ...Object.fromEntries(
          FEEDBACK_RATING_ANALYTICS.map(({ avgKey }) => [
            avgKey,
            averageRating(project[avgKey]),
          ]),
        ),
      }))
      .sort((a, b) => b.count - a.count);
  };

  const calculateTrends = (feedbacks) => {
    const monthMap = {};

    feedbacks.forEach((f) => {
      const date = new Date(f.created_at);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      if (!monthMap[monthKey]) {
        monthMap[monthKey] = { month: monthKey, count: 0 };
        FEEDBACK_RATING_ANALYTICS.forEach(({ avgKey }) => {
          monthMap[monthKey][avgKey] = [];
        });
      }
      monthMap[monthKey].count += 1;
      FEEDBACK_RATING_ANALYTICS.forEach(({ key, avgKey }) => {
        if (f[key]) monthMap[monthKey][avgKey].push(Number(f[key]));
      });
    });

    return Object.values(monthMap)
      .map((month) => ({
        month: month.month,
        count: month.count,
        ...Object.fromEntries(
          FEEDBACK_RATING_ANALYTICS.map(({ avgKey }) => [
            avgKey,
            averageRating(month[avgKey]),
          ]),
        ),
      }))
      .sort((a, b) => a.month.localeCompare(b.month));
  };

  const getRatingColor = (rating) => {
    const value = Number(rating);
    if (value >= 4.5) return '#4caf50';
    if (value >= 3.5) return '#8bc34a';
    if (value >= 2.5) return '#fdd835';
    if (value >= 1.5) return '#ff9800';
    return '#f44336';
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="60vh">
        <CircularProgress size={60} />
      </Box>
    );
  }

  if (error) {
    return <Alert severity="error" sx={{ m: 3 }}>{error}</Alert>;
  }

  if (!analytics || analytics.totalWithRatings === 0) {
    return (
      <Paper sx={{ p: 6, textAlign: 'center' }}>
        <Star sx={{ fontSize: 60, color: 'text.secondary', mb: 2 }} />
        <Typography variant="h6" color="text.secondary" gutterBottom>
          No evaluation ratings available yet
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Citizen evaluation scores will appear here once submitted and approved
        </Typography>
      </Paper>
    );
  }

  const barChartData = FEEDBACK_RATING_ANALYTICS.map(({ shortLabel, avgKey }) => ({
    name: shortLabel,
    value: parseFloat(analytics.averages[avgKey] || 0),
  }));

  return (
    <Box>
      <Grid container spacing={2} sx={{ mb: 4 }}>
        {FEEDBACK_RATING_ANALYTICS.map(({ label, shortLabel, avgKey }, index) => {
          const accent = CHART_COLORS[index % CHART_COLORS.length];
          const swLabel = label.split(' / ')[1] || '';
          return (
            <Grid item xs={12} sm={6} md={4} lg={2} key={avgKey}>
              <Card elevation={0} sx={flatAnalyticsCardSx(accent)}>
                <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                  <Typography
                    variant="body2"
                    fontWeight={600}
                    color="text.primary"
                    sx={{ minHeight: 40, lineHeight: 1.35 }}
                  >
                    {shortLabel}
                  </Typography>
                  <Typography variant="h4" fontWeight="bold" color="text.primary" sx={{ my: 0.5 }}>
                    {analytics.averages[avgKey]}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" display="block">
                    {swLabel ? `${swLabel} · ` : ''}out of 5
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          );
        })}
      </Grid>

      <Paper sx={{ mb: 3 }}>
        <Tabs value={activeTab} onChange={(_, v) => setActiveTab(v)} variant="fullWidth">
          <Tab label="Overview" />
          <Tab label="By Project" />
          <Tab label="Trends" />
        </Tabs>
      </Paper>

      {activeTab === 0 && (
        <Grid container spacing={2}>
          <Grid item xs={12}>
            <Paper sx={{ p: 2 }}>
              <Typography variant="h6" fontWeight="bold" gutterBottom>
                Average evaluation scores (1 = Strongly Disagree, 5 = Strongly Agree)
              </Typography>
              <ResponsiveContainer width="100%" height={360}>
                <BarChart data={barChartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" interval={0} angle={-20} textAnchor="end" height={90} />
                  <YAxis domain={[0, 5]} />
                  <Tooltip formatter={(value) => [Number(value).toFixed(2), 'Average']} />
                  <Bar dataKey="value" fill="#2196f3">
                    {barChartData.map((entry, index) => (
                      <Cell key={entry.name} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Paper>
          </Grid>

          {FEEDBACK_RATING_ANALYTICS.map(({ shortLabel, avgKey }, index) => (
            <Grid item xs={12} sm={6} md={4} key={avgKey}>
              <Paper sx={{ p: 2, height: '100%' }}>
                <Typography variant="subtitle2" fontWeight="bold" textAlign="center" gutterBottom>
                  {shortLabel}
                </Typography>
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie
                      data={analytics.distributions[avgKey]}
                      dataKey="count"
                      nameKey="rating"
                      cx="50%"
                      cy="50%"
                      outerRadius={90}
                      label={(entry) => `${entry.count}`}
                    >
                      {analytics.distributions[avgKey].map((entry, i) => (
                        <Cell key={`${avgKey}-${entry.rating}`} fill={COLORS[i]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value, name, props) => [`${value} (${props.payload.percentage}%)`, 'Responses']} />
                  </PieChart>
                </ResponsiveContainer>
              </Paper>
            </Grid>
          ))}
        </Grid>
      )}

      {activeTab === 1 && (
        <Paper>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ backgroundColor: '#f5f5f5' }}>
                  <TableCell><strong>Project</strong></TableCell>
                  <TableCell align="center"><strong>Responses</strong></TableCell>
                  {FEEDBACK_RATING_ANALYTICS.map(({ shortLabel, avgKey }) => (
                    <TableCell key={avgKey} align="center"><strong>{shortLabel}</strong></TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {analytics.byProject.slice(0, 20).map((project) => (
                  <TableRow key={project.name} hover>
                    <TableCell>{project.name}</TableCell>
                    <TableCell align="center"><Chip label={project.count} size="small" /></TableCell>
                    {FEEDBACK_RATING_ANALYTICS.map(({ avgKey }) => (
                      <TableCell key={avgKey} align="center">
                        <Chip
                          label={project[avgKey] || 'N/A'}
                          size="small"
                          sx={{
                            backgroundColor: project[avgKey] ? getRatingColor(project[avgKey]) : '#e0e0e0',
                            color: 'white',
                            fontWeight: 'bold',
                          }}
                        />
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}

      {activeTab === 2 && (
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" fontWeight="bold" gutterBottom>
            Evaluation score trends over time
          </Typography>
          <ResponsiveContainer width="100%" height={520}>
            <LineChart data={analytics.trendData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis domain={[0, 5]} />
              <Tooltip />
              <Legend />
              {FEEDBACK_RATING_ANALYTICS.map(({ shortLabel, avgKey }, index) => (
                <Line
                  key={avgKey}
                  type="monotone"
                  dataKey={avgKey}
                  stroke={CHART_COLORS[index % CHART_COLORS.length]}
                  name={shortLabel}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </Paper>
      )}
    </Box>
  );
};

export default FeedbackAnalytics;
