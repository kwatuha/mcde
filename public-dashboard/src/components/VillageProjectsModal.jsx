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
  Home,
  Assessment,
  Comment
} from '@mui/icons-material';
import { getProjectsByVillage } from '../services/publicApi';
import { formatCurrency } from '../utils/formatters';
import ProjectFeedbackModal from './ProjectFeedbackModal';

const VillageProjectsModal = ({ open, onClose, village, finYearId }) => {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [feedbackModalOpen, setFeedbackModalOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState(null);

  useEffect(() => {
    if (open && village) {
      fetchProjects();
    }
  }, [open, village, finYearId]);

  const fetchProjects = async () => {
    try {
      setLoading(true);
      const data = await getProjectsByVillage(village.village_id, finYearId, {
        wardId: village.ward_id,
        subcountyId: village.subcounty_id,
        sublocationId: village.sublocation_id
      });
      setProjects(data || []);
      setError(null);
    } catch (err) {
      console.error('Error fetching village projects:', err);
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

  return (
    <>
      <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth PaperProps={{ sx: { borderRadius: 2, maxHeight: '90vh' } }}>
        <DialogTitle>
          <Box display="flex" justifyContent="space-between" alignItems="center">
            <Box display="flex" alignItems="center" gap={1}>
              <Home sx={{ color: '#f57c00' }} />
              <Box>
                <Typography variant="h6" fontWeight="bold">{village?.village_name} Village</Typography>
                <Typography variant="caption" color="text.secondary">
                  {village?.sublocation_name} · {village?.ward_name} Ward · {village?.subcounty_name}
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
                <Grid item xs={6}>
                  <Card sx={{ background: 'linear-gradient(135deg, #ffb74d 0%, #f57c00 100%)', color: 'white' }}>
                    <CardContent>
                      <Typography variant="h4" fontWeight="bold">{projects.length}</Typography>
                      <Typography variant="body2">Total Projects</Typography>
                    </CardContent>
                  </Card>
                </Grid>
                <Grid item xs={6}>
                  <Card sx={{ background: 'linear-gradient(135deg, #ff8a65 0%, #e64a19 100%)', color: 'white' }}>
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
                              <Chip label={formatCurrency(project.budget || 0)} size="small" color="primary" variant="outlined" sx={{ mt: 1 }} />
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
                  <Typography variant="h6" color="text.secondary">No projects found for this village</Typography>
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

export default VillageProjectsModal;
