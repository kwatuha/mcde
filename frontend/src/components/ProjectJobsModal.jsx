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
  CircularProgress,
  Alert,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
} from '@mui/material';
import { Work as WorkIcon, Close as CloseIcon } from '@mui/icons-material';
import axiosInstance from '../api/axiosInstance';
import { useTheme } from '@mui/material/styles';

const ProjectJobsModal = ({ open, onClose, projectId, projectName }) => {
  const theme = useTheme();
  const [jobs, setJobs] = useState([]);
  const [summary, setSummary] = useState({
    totalJobs: 0,
    totalMale: 0,
    totalFemale: 0,
    totalDirectJobs: 0,
    totalIndirectJobs: 0,
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
        totalDirectJobs: 0,
        totalIndirectJobs: 0,
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
        totalDirectJobs: 0,
        totalIndirectJobs: 0,
      });
      setJobs(Array.isArray(data.jobs) ? data.jobs : []);
    } catch (err) {
      console.error('Error fetching project jobs:', err);
      setJobs([]);
      setSummary({
        totalJobs: 0,
        totalMale: 0,
        totalFemale: 0,
        totalDirectJobs: 0,
        totalIndirectJobs: 0,
      });
      setError(err?.response?.data?.message || err.message || 'Failed to fetch project jobs');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '—';
    try {
      const d = new Date(dateStr);
      return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    } catch {
      return '—';
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
          borderRadius: 2,
        },
      }}
    >
      <DialogTitle
        sx={{
          borderBottom: `1px solid ${theme.palette.divider}`,
          py: 1.5,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 1,
        }}
      >
        <Box display="flex" alignItems="center" gap={1.5} minWidth={0}>
          <WorkIcon sx={{ color: 'primary.main', fontSize: 28 }} />
          <Box minWidth={0}>
            <Typography variant="h6" noWrap sx={{ fontSize: '1.1rem' }}>
              Jobs Created
            </Typography>
            <Typography variant="body2" color="text.secondary" noWrap>
              {projectName}
            </Typography>
          </Box>
        </Box>
        <IconButton onClick={onClose} size="small" aria-label="Close">
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers sx={{ p: 0 }}>
        {loading && (
          <Box display="flex" justifyContent="center" alignItems="center" minHeight={200}>
            <CircularProgress />
          </Box>
        )}

        {error && !loading && (
          <Alert severity="error" sx={{ m: 2 }}>
            {error}
          </Alert>
        )}

        {!loading && !error && (
          <>
            {/* Compact summary strip - aligned with Project Details Jobs tab */}
            <Box
              sx={{
                px: 2,
                py: 1.5,
                backgroundColor: theme.palette.mode === 'dark' ? theme.palette.action.hover : theme.palette.grey[50],
                borderBottom: `1px solid ${theme.palette.divider}`,
              }}
            >
              <Grid container spacing={2}>
                {[
                  { label: 'Total Jobs', value: summary.totalJobs, strong: true },
                  { label: 'Male', value: summary.totalMale },
                  { label: 'Female', value: summary.totalFemale },
                  { label: 'Direct', value: summary.totalDirectJobs },
                  { label: 'Indirect', value: summary.totalIndirectJobs },
                ].map(({ label, value, strong }) => (
                  <Grid item xs={6} sm={4} md={2} key={label}>
                    <Typography variant="caption" color="text.secondary" display="block">
                      {label}
                    </Typography>
                    <Typography variant="body1" fontWeight={strong ? 600 : 500}>
                      {value}
                    </Typography>
                  </Grid>
                ))}
              </Grid>
            </Box>

            {/* Jobs by category - table to match Project Details and improve scanability */}
            <Box sx={{ px: 2, py: 2 }}>
              <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1.5, fontWeight: 600 }}>
                Jobs by Category
              </Typography>

              {jobs.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  No job records have been captured for this project yet.
                </Typography>
              ) : (
                <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 1, overflow: 'hidden' }}>
                  <Table size="small" stickyHeader>
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 600, backgroundColor: (t) => t.palette.mode === 'dark' ? t.palette.grey[800] : t.palette.grey[50], fontSize: '0.75rem' }}>
                          Category
                        </TableCell>
                        <TableCell sx={{ fontWeight: 600, backgroundColor: (t) => t.palette.mode === 'dark' ? t.palette.grey[800] : t.palette.grey[50], fontSize: '0.75rem' }}>
                          Date
                        </TableCell>
                        <TableCell align="right" sx={{ fontWeight: 600, backgroundColor: (t) => t.palette.mode === 'dark' ? t.palette.grey[800] : t.palette.grey[50], fontSize: '0.75rem' }}>
                          Jobs
                        </TableCell>
                        <TableCell align="right" sx={{ fontWeight: 600, backgroundColor: (t) => t.palette.mode === 'dark' ? t.palette.grey[800] : t.palette.grey[50], fontSize: '0.75rem' }}>
                          Male
                        </TableCell>
                        <TableCell align="right" sx={{ fontWeight: 600, backgroundColor: (t) => t.palette.mode === 'dark' ? t.palette.grey[800] : t.palette.grey[50], fontSize: '0.75rem' }}>
                          Female
                        </TableCell>
                        <TableCell align="right" sx={{ fontWeight: 600, backgroundColor: (t) => t.palette.mode === 'dark' ? t.palette.grey[800] : t.palette.grey[50], fontSize: '0.75rem' }}>
                          Direct
                        </TableCell>
                        <TableCell align="right" sx={{ fontWeight: 600, backgroundColor: (t) => t.palette.mode === 'dark' ? t.palette.grey[800] : t.palette.grey[50], fontSize: '0.75rem' }}>
                          Indirect
                        </TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {jobs.map((job) => (
                        <TableRow key={job.id} hover>
                          <TableCell sx={{ fontSize: '0.8125rem' }}>
                            {job.category_name || 'Uncategorized'}
                          </TableCell>
                          <TableCell sx={{ fontSize: '0.8125rem', color: 'text.secondary' }}>
                            {formatDate(job.created_at)}
                          </TableCell>
                          <TableCell align="right" sx={{ fontSize: '0.8125rem' }}>
                            {job.jobs_count ?? 0}
                          </TableCell>
                          <TableCell align="right" sx={{ fontSize: '0.8125rem' }}>
                            {job.male_count ?? 0}
                          </TableCell>
                          <TableCell align="right" sx={{ fontSize: '0.8125rem' }}>
                            {job.female_count ?? 0}
                          </TableCell>
                          <TableCell align="right" sx={{ fontSize: '0.8125rem' }}>
                            {job.direct_jobs ?? 0}
                          </TableCell>
                          <TableCell align="right" sx={{ fontSize: '0.8125rem' }}>
                            {job.indirect_jobs ?? 0}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </Box>
          </>
        )}
      </DialogContent>

      <DialogActions sx={{ borderTop: `1px solid ${theme.palette.divider}`, px: 2, py: 1 }}>
        <Button onClick={onClose} variant="contained" size="small">
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ProjectJobsModal;

