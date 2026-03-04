// src/pages/ReportsPage.jsx
import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, CircularProgress, Alert, Paper, Grid,
} from '@mui/material';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts'; // Import BarChart components
import apiService from '../api';
import { useAuth } from '../context/AuthContext';
import { getProjectStatusBackgroundColor, getProjectStatusTextColor } from '../utils/projectStatusColors';
import { groupStatusesByNormalized } from '../utils/projectStatusNormalizer';

// Define a set of consistent colors for the pie chart slices
// NOTE: PIE_COLORS is now largely redundant for the status chart as we'll use getProjectStatusBackgroundColor
const PIE_COLORS = [
  '#0A2342', // KEMRI Blue (primary)
  '#16a34a', // Green (Completed)
  '#f97316', // Orange (On Hold/At Risk)
  '#dc2626', // Red (Cancelled/Delayed)
  '#3b82f6', // Blue (In Progress)
  '#6b7280', // Gray (Not Started)
  '#9333ea', // Purple (Planning)
  '#ca8a04', // Yellow (Stalled)
  '#be123c', // Dark Red (Closed)
  '#db2777', // Pink (Initiated)
  '#0d9488', // Teal
  '#a21caf', // Magenta
];

// Define a set of consistent colors for bar chart bars
const BAR_COLORS = [
  '#0A2342', // KEMRI Blue
  '#3b82f6', // Blue
  '#16a34a', // Green
  '#f97316', // Orange
  '#dc2626', // Red
  '#9333ea', // Purple
  '#ca8a04', // Yellow
  '#6b7280', // Gray
  '#be123c', // Dark Red
  '#0d9488', // Teal
  '#a21caf', // Magenta
  '#db2777', // Pink
];

function ReportsPage() {
  const { logout } = useAuth();
  const [projectStatusData, setProjectStatusData] = useState([]);
  const [projectsByDirectorateData, setProjectsByDirectorateData] = useState([]); // New state for directorate data
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [totalProjects, setTotalProjects] = useState(0);

  const fetchProjectReports = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Fetch Project Status Counts
      // analytics is a top-level service on apiService
      const statusCounts = await apiService.analytics.getProjectStatusCounts();
      console.log('Fetched project status counts:', statusCounts);

      // Group statuses by normalized categories for charts
      const groupedStatuses = groupStatusesByNormalized(statusCounts, 'status', 'count');
      const chartStatusData = groupedStatuses.map((item) => ({
        name: item.name,
        value: item.value,
        // Use the utility function to get the color based on the normalized status name
        color: getProjectStatusBackgroundColor(item.name)
      }));
      const total = statusCounts.reduce((sum, item) => sum + item.count, 0);
      setTotalProjects(total);
      setProjectStatusData(chartStatusData);

      // Fetch Projects by Directorate Counts
      const directorateCounts = await apiService.getProjectsByDirectorateCounts();
      console.log('Fetched projects by directorate counts:', directorateCounts);

      // Transform data for Recharts BarChart, ensuring a default name if directorate is null/empty
      const chartDirectorateData = directorateCounts.map((item, index) => ({
        name: item.directorate || 'Unknown Directorate', // Handle null/empty directorate
        count: item.count,
        color: BAR_COLORS[index % BAR_COLORS.length] // Assign color cyclically
      }));
      setProjectsByDirectorateData(chartDirectorateData);

    } catch (err) {
      console.error('Error fetching project reports:', err);
      if (err.error === "Project not found.") {
        setError("No projects found to generate reports. Please add some projects first.");
      } else {
        setError(err.message || 'Failed to load project reports.');
      }

      if (err.status === 401) {
        logout();
      }
    } finally {
      setLoading(false);
    }
  }, [logout]);

  useEffect(() => {
    fetchProjectReports();
  }, [fetchProjectReports]);

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" height="80vh">
        <CircularProgress />
        <Typography sx={{ ml: 2 }}>Loading reports...</Typography>
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">{error}</Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" component="h1" gutterBottom sx={{ color: '#0A2342', fontWeight: 'bold' }}>
        Project Reports
      </Typography>

      <Grid container spacing={3}>
        {/* Project Status Summary */}
        <Grid item xs={12} md={6}>
          <Paper elevation={3} sx={{ p: 3, borderRadius: '8px', height: '100%' }}>
            <Typography variant="h5" color="primary.main" gutterBottom>
              Project Status Distribution
            </Typography>
            {projectStatusData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={projectStatusData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    outerRadius={100}
                    fill="#8884d8"
                    dataKey="value"
                    label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                  >
                    {/* Use getProjectStatusBackgroundColor for the fill color */}
                    {projectStatusData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <Alert severity="info" sx={{ mt: 2 }}>No project status data available for charting.</Alert>
            )}
            <Typography variant="h6" sx={{ mt: 2, textAlign: 'center', color: 'text.secondary' }}>
              Total Projects: {totalProjects}
            </Typography>
          </Paper>
        </Grid>

        {/* Projects by Directorate Chart */}
        <Grid item xs={12} md={6}>
          <Paper elevation={3} sx={{ p: 3, borderRadius: '8px', height: '100%' }}>
            <Typography variant="h5" color="primary.main" gutterBottom>
              Projects by Directorate
            </Typography>
            {projectsByDirectorateData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart
                  data={projectsByDirectorateData}
                  margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" angle={-45} textAnchor="end" height={80} interval={0} /> {/* Rotate labels */}
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="count" name="Number of Projects">
                    {projectsByDirectorateData.map((entry, index) => (
                      <Cell key={`bar-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <Alert severity="info" sx={{ mt: 2 }}>No projects by directorate data available.</Alert>
            )}
          </Paper>
        </Grid>

        {/* Other Reports (Placeholder for future expansion) */}
        <Grid item xs={12}>
          <Paper elevation={3} sx={{ p: 3, borderRadius: '8px', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
            <Typography variant="h5" color="primary.main" gutterBottom>
              Additional Reports
            </Typography>
            <Typography variant="body1" color="text.secondary">
              More detailed reports on funding, principal investigators, and participants will be added here.
            </Typography>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
}

export default ReportsPage;
