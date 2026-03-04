import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  Grid,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Alert,
} from '@mui/material';
import { Work as WorkIcon, Close as CloseIcon, Group as GroupIcon } from '@mui/icons-material';
import axiosInstance from '../api/axiosInstance';

const ProjectJobsModal = ({ open, onClose, projectId, projectName }) => {
  const [jobs, setJobs] = useState([]);
  const [summary, setSummary] = useState({
    totalJobs: 0,
    totalMale: 0,
    totalFemale: 0,
    totalYouth: 0,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (open && projectId) {
      fetchJobs();
    } else {
      setJobs([]);
      setSummary({
        totalJobs: 0,
        totalMale: 0,
        totalFemale: 0,
        totalYouth: 0,
      });
      setError(null);
    }
  }, [open, projectId]);

  const fetchJobs = async () => {
    if (!projectId) return;

    setLoading(true);
    setError(null);

    try {
      const response = await axiosInstance.get(`/projects/${projectId}/jobs`);
      const data = response.data || {};
      setSummary(data.summary || {
        totalJobs: 0,
        totalMale: 0,
        totalFemale: 0,
        totalYouth: 0,
      });
      setJobs(Array.isArray(data.jobs) ? data.jobs : []);
    } catch (err) {
      console.error('Error fetching project jobs:', err);
      setJobs([]);
      setSummary({
        totalJobs: 0,
        totalMale: 0,
        totalFemale: 0,
        totalYouth: 0,
      });
      setError(err?.response?.data?.message || err.message || 'Failed to fetch project jobs');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: {
          maxHeight: '90vh',
        },
      }}
    >
      <DialogTitle>
        <Box display="flex" justifyContent="space-between" alignItems="center">
          <Box display="flex" alignItems="center" gap={1}>
            <WorkIcon color="primary" />
            <Box>
              <Typography variant="h6">
                Jobs Created: {projectName}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Total Jobs: {summary.totalJobs}
              </Typography>
            </Box>
          </Box>
          <Button onClick={onClose} size="small">
            <CloseIcon />
          </Button>
        </Box>
      </DialogTitle>

      <DialogContent dividers>
        {loading && (
          <Box display="flex" justifyContent="center" p={3}>
            <CircularProgress />
          </Box>
        )}

        {error && !loading && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {!loading && !error && (
          <>
            {/* Summary cards */}
            <Grid container spacing={2} sx={{ mb: 3 }}>
              <Grid item xs={12} md={3}>
                <Card>
                  <CardContent>
                    <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                      Total Jobs
                    </Typography>
                    <Typography variant="h5" fontWeight={600}>
                      {summary.totalJobs}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
              <Grid item xs={12} md={3}>
                <Card>
                  <CardContent>
                    <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                      Male
                    </Typography>
                    <Typography variant="h6">
                      {summary.totalMale}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
              <Grid item xs={12} md={3}>
                <Card>
                  <CardContent>
                    <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                      Female
                    </Typography>
                    <Typography variant="h6">
                      {summary.totalFemale}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
              <Grid item xs={12} md={3}>
                <Card>
                  <CardContent>
                    <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                      Youth
                    </Typography>
                    <Typography variant="h6">
                      {summary.totalYouth}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>

            {/* Breakdown by category */}
            <Box sx={{ mb: 2 }}>
              <Typography variant="subtitle1" gutterBottom>
                Jobs by Category
              </Typography>

              {jobs.length === 0 && (
                <Typography variant="body2" color="text.secondary">
                  No job records have been captured for this project yet.
                </Typography>
              )}

              {jobs.length > 0 && (
                <Grid container spacing={2}>
                  {jobs.map((job) => (
                    <Grid item xs={12} md={6} key={job.id}>
                      <Card variant="outlined">
                        <CardContent>
                          <Box display="flex" alignItems="center" justifyContent="space-between" mb={1}>
                            <Box display="flex" alignItems="center" gap={1}>
                              <GroupIcon fontSize="small" color="action" />
                              <Typography variant="subtitle1" fontWeight={600}>
                                {job.category_name || 'Uncategorized'}
                              </Typography>
                            </Box>
                            <Chip
                              label={`${job.jobs_count ?? 0} jobs`}
                              size="small"
                              color="primary"
                              variant="outlined"
                            />
                          </Box>
                          {job.category_description && (
                            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                              {job.category_description}
                            </Typography>
                          )}
                          <Box display="flex" gap={1} flexWrap="wrap">
                            <Chip
                              label={`Male: ${job.male_count ?? 0}`}
                              size="small"
                              variant="outlined"
                            />
                            <Chip
                              label={`Female: ${job.female_count ?? 0}`}
                              size="small"
                              variant="outlined"
                            />
                            <Chip
                              label={`Youth: ${job.youth_count ?? 0}`}
                              size="small"
                              variant="outlined"
                            />
                          </Box>
                        </CardContent>
                      </Card>
                    </Grid>
                  ))}
                </Grid>
              )}
            </Box>
          </>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
};

export default ProjectJobsModal;

