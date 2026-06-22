import React, { useState, useEffect } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Typography,
  Box,
  CircularProgress,
  Alert,
  Chip,
  Grid,
  Card,
  CardContent
} from '@mui/material';
import {
  TrendingUp,
  Assessment,
  Business,
  AttachMoney
} from '@mui/icons-material';
import { getYearlyTrends } from '../services/publicApi';
import { formatCurrency } from '../utils/formatters';
import YearlyProjectsModal from './YearlyProjectsModal';

const YearlyTrendsTable = ({ filters = {} }) => {
  const [yearlyData, setYearlyData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedYear, setSelectedYear] = useState(null);

  useEffect(() => {
    fetchYearlyTrends();
  }, [filters]);

  const fetchYearlyTrends = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getYearlyTrends(filters);
      setYearlyData(data || []);
    } catch (err) {
      console.error('Error fetching yearly trends:', err);
      setError('Failed to load yearly trends data');
    } finally {
      setLoading(false);
    }
  };

  const activeYears = yearlyData.filter((year) => year.totalProjects > 0);
  const totalProjects = yearlyData.reduce((sum, year) => sum + year.totalProjects, 0);
  const totalBudget = yearlyData.reduce((sum, year) => sum + (year.totalBudget || 0), 0);
  const avgProjectsPerYear = activeYears.length
    ? Math.round(totalProjects / activeYears.length)
    : 0;

  const getYearTrend = (year, prevYear) => {
    if (!prevYear) return 'neutral';
    const currentTotal = year.totalBudget;
    const prevTotal = prevYear.totalBudget;

    if (currentTotal > prevTotal) return 'up';
    if (currentTotal < prevTotal) return 'down';
    return 'neutral';
  };

  const handleYearClick = (yearData) => {
    if (!yearData.finYearId) return;
    setSelectedYear(yearData);
    setModalOpen(true);
  };

  const handleCloseModal = () => {
    setModalOpen(false);
    setSelectedYear(null);
  };

  const peakYear = activeYears.reduce(
    (best, year) => (year.totalProjects > (best?.totalProjects || 0) ? year : best),
    null
  );

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" py={4}>
        <CircularProgress />
        <Typography variant="body2" sx={{ ml: 2 }}>
          Loading yearly trends...
        </Typography>
      </Box>
    );
  }

  if (error) {
    return (
      <Alert severity="error" sx={{ mb: 2 }}>
        {error}
      </Alert>
    );
  }

  return (
    <Box>
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white' }}>
            <CardContent>
              <Box display="flex" alignItems="center" justifyContent="space-between">
                <Box>
                  <Typography variant="h4" fontWeight="bold">
                    {totalProjects}
                  </Typography>
                  <Typography variant="body2" sx={{ opacity: 0.9 }}>
                    Total Projects
                  </Typography>
                </Box>
                <Assessment sx={{ fontSize: 40, opacity: 0.8 }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)', color: 'white' }}>
            <CardContent>
              <Box display="flex" alignItems="center" justifyContent="space-between">
                <Box>
                  <Typography variant="h4" fontWeight="bold">
                    {formatCurrency(totalBudget)}
                  </Typography>
                  <Typography variant="body2" sx={{ opacity: 0.9 }}>
                    Total Budget
                  </Typography>
                </Box>
                <AttachMoney sx={{ fontSize: 40, opacity: 0.8 }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)', color: 'white' }}>
            <CardContent>
              <Box display="flex" alignItems="center" justifyContent="space-between">
                <Box>
                  <Typography variant="h4" fontWeight="bold">
                    {activeYears.length}
                  </Typography>
                  <Typography variant="body2" sx={{ opacity: 0.9 }}>
                    Active Years
                  </Typography>
                </Box>
                <TrendingUp sx={{ fontSize: 40, opacity: 0.8 }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ background: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)', color: 'white' }}>
            <CardContent>
              <Box display="flex" alignItems="center" justifyContent="space-between">
                <Box>
                  <Typography variant="h4" fontWeight="bold">
                    {avgProjectsPerYear}
                  </Typography>
                  <Typography variant="body2" sx={{ opacity: 0.9 }}>
                    Avg Projects/Year
                  </Typography>
                </Box>
                <Business sx={{ fontSize: 40, opacity: 0.8 }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <TableContainer component={Paper} sx={{ borderRadius: 2 }}>
        <Table>
          <TableHead>
            <TableRow sx={{ backgroundColor: '#f5f5f5' }}>
              <TableCell sx={{ fontWeight: 'bold', fontSize: '1rem' }}>
                Financial Year
              </TableCell>
              <TableCell align="center" sx={{ fontWeight: 'bold', fontSize: '1rem' }}>
                Total Projects
              </TableCell>
              <TableCell align="center" sx={{ fontWeight: 'bold', fontSize: '1rem' }}>
                Total Budget
              </TableCell>
              <TableCell align="center" sx={{ fontWeight: 'bold', fontSize: '1rem' }}>
                Completed
              </TableCell>
              <TableCell align="center" sx={{ fontWeight: 'bold', fontSize: '1rem' }}>
                Ongoing
              </TableCell>
              <TableCell align="center" sx={{ fontWeight: 'bold', fontSize: '1rem' }}>
                Not Started
              </TableCell>
              <TableCell align="center" sx={{ fontWeight: 'bold', fontSize: '1rem' }}>
                Departments
              </TableCell>
              <TableCell align="center" sx={{ fontWeight: 'bold', fontSize: '1rem' }}>
                Coverage
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {yearlyData.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} align="center" sx={{ py: 4 }}>
                  <Typography color="text.secondary">
                    No public projects found for the selected filters.
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              yearlyData.map((year, index) => {
                const prevYear = index > 0 ? yearlyData[index - 1] : null;
                const trend = getYearTrend(year, prevYear);
                const clickable = Boolean(year.finYearId);

                return (
                  <TableRow
                    key={year.year}
                    onClick={() => clickable && handleYearClick(year)}
                    sx={{
                      cursor: clickable ? 'pointer' : 'default',
                      '&:hover': clickable ? { backgroundColor: '#f0f0f0' } : {},
                      '&:nth-of-type(even)': { backgroundColor: '#fafafa' },
                      transition: 'background-color 0.2s ease-in-out'
                    }}
                  >
                    <TableCell sx={{ fontWeight: 600 }}>
                      <Box display="flex" alignItems="center" gap={1}>
                        <Typography variant="body1" fontWeight="bold">
                          {year.year}
                        </Typography>
                        {trend === 'up' && <TrendingUp sx={{ fontSize: 16, color: 'success.main' }} />}
                        {trend === 'down' && (
                          <TrendingUp sx={{ fontSize: 16, color: 'error.main', transform: 'rotate(180deg)' }} />
                        )}
                      </Box>
                    </TableCell>
                    <TableCell align="center">
                      <Chip
                        label={year.totalProjects}
                        color={year.totalProjects > 0 ? 'primary' : 'default'}
                        size="small"
                      />
                    </TableCell>
                    <TableCell align="center">
                      <Typography variant="body2" fontWeight="bold">
                        {year.totalBudget > 0 ? formatCurrency(year.totalBudget) : '-'}
                      </Typography>
                    </TableCell>
                    <TableCell align="center">
                      <Chip label={year.completedProjects} color="success" size="small" />
                    </TableCell>
                    <TableCell align="center">
                      <Chip label={year.ongoingProjects} color="warning" size="small" />
                    </TableCell>
                    <TableCell align="center">
                      <Chip label={year.plannedProjects ?? year.notStartedProjects ?? 0} color="info" size="small" />
                    </TableCell>
                    <TableCell align="center">
                      <Typography variant="body2">{year.departments}</Typography>
                    </TableCell>
                    <TableCell align="center">
                      <Typography variant="body2" color="text.secondary">
                        {year.subcounties} Subcounties, {year.wards} Wards
                      </Typography>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {peakYear && (
        <Paper sx={{ mt: 3, p: 3, borderRadius: 2, background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white' }}>
          <Typography variant="h6" fontWeight="bold" gutterBottom>
            Trend Analysis
          </Typography>
          <Typography variant="body2" sx={{ opacity: 0.9 }}>
            {totalProjects} public projects across {activeYears.length} financial{' '}
            {activeYears.length === 1 ? 'year' : 'years'}, with a combined budget of{' '}
            {formatCurrency(totalBudget)}.
            {peakYear.totalProjects > 0 && (
              <>
                {' '}
                {peakYear.year} has the highest activity with {peakYear.totalProjects} project
                {peakYear.totalProjects === 1 ? '' : 's'}
                {peakYear.totalBudget > 0 ? ` (${formatCurrency(peakYear.totalBudget)})` : ''}.
              </>
            )}
          </Typography>
        </Paper>
      )}

      {selectedYear && (
        <YearlyProjectsModal
          open={modalOpen}
          onClose={handleCloseModal}
          yearData={selectedYear}
          finYearId={selectedYear.finYearId}
        />
      )}
    </Box>
  );
};

export default YearlyTrendsTable;
