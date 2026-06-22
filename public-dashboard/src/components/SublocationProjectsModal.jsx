import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  IconButton,
  Typography,
  Box,
  CircularProgress,
  Alert,
  Chip,
  List,
  ListItem,
  ListItemText,
  Divider,
  Grid,
  Paper,
  Card,
  CardContent
} from '@mui/material';
import {
  Close,
  Place,
  Assessment,
  CheckCircle,
  TrendingUp,
  Comment
} from '@mui/icons-material';
import { getProjectsBySublocation } from '../services/publicApi';
import { formatCurrency, formatDate } from '../utils/formatters';
import ProjectFeedbackModal from './ProjectFeedbackModal';

const SublocationProjectsModal = ({ open, onClose, sublocation, finYearId }) => {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [feedbackModalOpen, setFeedbackModalOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState(null);

  useEffect(() => {
    if (open && sublocation) {
      fetchProjects();
    }
  }, [open, sublocation, finYearId]);

  const fetchProjects = async () => {
    try {
      setLoading(true);
      const data = await getProjectsBySublocation(sublocation.sublocation_id, finYearId, {
        wardId: sublocation.ward_id,
        subcountyId: sublocation.subcounty_id
      });
      setProjects(data || []);
      setError(null);
    } catch (err) {
      console.error('Error fetching sublocation projects:', err);
      setError('Failed to load projects');
      setProjects([]);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status) => {
    const statusColors = {
      'Completed': 'success',
      'Ongoing': 'info',
      'Stalled': 'error',
      'Not Started': 'warning',
      'Under Procurement': 'secondary'
    };
    return statusColors[status] || 'default';
  };

  const totalBudget = projects.reduce((sum, p) => sum + (parseFloat(p.budget) || 0), 0);
  const completedCount = projects.filter(p => p.status === 'Completed').length;

  return (
    <>
      <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth PaperProps={{ sx: { borderRadius: 2, maxHeight: '90vh' } }}>
        <DialogTitle>
          <Box display="flex" justifyContent="space-between" alignItems="center">
            <Box display="flex" alignItems="center" gap={1}>
              <Place color="success" />
              <Box>
                <Typography variant="h6" fontWeight="bold">
                  {sublocation?.sublocation_name} Sublocation
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {sublocation?.ward_name} Ward · {sublocation?.subcounty_name} Sub-County
                </Typography>
              </Box>
            </Box>
            <IconButton onClick={onClose} size="small"><Close /></IconButton>
          </Box>
        </DialogTitle>
        <DialogContent dividers>
          {loading ? (
            <Box display="flex" justifyContent="center" p={4}><CircularProgress /></Box>
          ) : error ? (
            <Alert severity="error">{error}</Alert>
          ) : (
            <>
              <Grid container spacing={2} sx={{ mb: 3 }}>
                <Grid item xs={12} sm={4}>
                  <Card sx={{ background: 'linear-gradient(135deg, #26a69a 0%, #00897b 100%)', color: 'white' }}>
                    <CardContent>
                      <Typography variant="h4" fontWeight="bold">{projects.length}</Typography>
                      <Typography variant="body2">Total Projects</Typography>
                    </CardContent>
                  </Card>
                </Grid>
                <Grid item xs={12} sm={4}>
                  <Card sx={{ background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)', color: 'white' }}>
                    <CardContent>
                      <Typography variant="h4" fontWeight="bold">{completedCount}</Typography>
                      <Typography variant="body2">Completed</Typography>
                    </CardContent>
                  </Card>
                </Grid>
                <Grid item xs={12} sm={4}>
                  <Card sx={{ background: 'linear-gradient(135deg, #66bb6a 0%, #43a047 100%)', color: 'white' }}>
                    <CardContent>
                      <Typography variant="h6" fontWeight="bold" noWrap>{formatCurrency(totalBudget)}</Typography>
                      <Typography variant="body2">Total Budget</Typography>
                    </CardContent>
                  </Card>
                </Grid>
              </Grid>
              {projects.length > 0 ? (
                <Paper elevation={2} sx={{ borderRadius: 2 }}>
                  <List>
                    {projects.map((project, index) => (
                      <React.Fragment key={project.id || index}>
                        <ListItem sx={{ display: 'block' }}>
                          <ListItemText
                            primary={
                              <Box display="flex" justifyContent="space-between" gap={2}>
                                <Typography variant="subtitle1" fontWeight="medium">{project.project_name}</Typography>
                                <Box display="flex" gap={1}>
                                  <Chip label={project.status || 'Unknown'} color={getStatusColor(project.status)} size="small" />
                                  <IconButton size="small" color="primary" onClick={() => { setSelectedProject(project); setFeedbackModalOpen(true); }}>
                                    <Comment />
                                  </IconButton>
                                </Box>
                              </Box>
                            }
                            secondary={
                              <Box display="flex" gap={1} mt={1} flexWrap="wrap">
                                <Chip label={formatCurrency(project.budget || 0)} size="small" color="primary" variant="outlined" />
                                {project.village_name && <Chip label={project.village_name} size="small" variant="outlined" />}
                              </Box>
                            }
                          />
                        </ListItem>
                        {index < projects.length - 1 && <Divider />}
                      </React.Fragment>
                    ))}
                  </List>
                </Paper>
              ) : (
                <Paper sx={{ p: 4, textAlign: 'center' }}>
                  <Assessment sx={{ fontSize: 60, color: 'text.secondary', mb: 2 }} />
                  <Typography variant="h6" color="text.secondary">No projects found for this sublocation</Typography>
                </Paper>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
      {selectedProject && (
        <ProjectFeedbackModal open={feedbackModalOpen} onClose={() => { setFeedbackModalOpen(false); setSelectedProject(null); }} project={selectedProject} />
      )}
    </>
  );
};

export default SublocationProjectsModal;
