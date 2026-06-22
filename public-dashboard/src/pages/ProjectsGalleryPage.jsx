import React, { useState, useEffect } from 'react';
import {
  Container,
  Grid,
  Typography,
  Box,
  Paper,
  Card,
  CardContent,
  CardActions,
  Button,
  Chip,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  InputAdornment,
  CircularProgress,
  Alert,
  Pagination,
  LinearProgress
} from '@mui/material';
import {
  Search,
  FilterList,
  Visibility,
  LocationOn,
  AccountBalanceWallet,
  CalendarToday,
  Comment,
  Business
} from '@mui/icons-material';
import {
  getProjects,
  getFinancialYears,
  getDepartments,
  getProjectTypes,
  getSubCounties,
  getWards,
  getSublocations,
  getVillages
} from '../services/publicApi';
import { formatCurrency, formatDate, getStatusColor, truncateText, formatStatus } from '../utils/formatters';
import ProjectFeedbackModal from '../components/ProjectFeedbackModal';
import ProjectDetailsModal from '../components/ProjectDetailsModal';

const ProjectsGalleryPage = () => {
  const [projects, setProjects] = useState([]);
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 12, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [feedbackModalOpen, setFeedbackModalOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState(null);
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const [selectedProjectForDetails, setSelectedProjectForDetails] = useState(null);
  
  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedYear, setSelectedYear] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [selectedDepartment, setSelectedDepartment] = useState('all');
  const [selectedProjectType, setSelectedProjectType] = useState('all');
  const [selectedSubcounty, setSelectedSubcounty] = useState('all');
  const [selectedWard, setSelectedWard] = useState('all');
  const [selectedSublocation, setSelectedSublocation] = useState('all');
  const [selectedVillage, setSelectedVillage] = useState('all');
  
  // Filter Options
  const [financialYears, setFinancialYears] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [projectTypes, setProjectTypes] = useState([]);
  const [subcounties, setSubcounties] = useState([]);
  const [wards, setWards] = useState([]);
  const [sublocations, setSublocations] = useState([]);
  const [villages, setVillages] = useState([]);

  const statuses = ['Completed', 'Ongoing', 'Not Started', 'Under Procurement', 'Stalled'];

  useEffect(() => {
    fetchFilterOptions();
  }, []);

  useEffect(() => {
    fetchProjects();
  }, [pagination.page, selectedYear, selectedStatus, selectedDepartment, selectedProjectType, selectedSubcounty, selectedWard, selectedSublocation, selectedVillage, searchTerm]);

  useEffect(() => {
    if (selectedSubcounty && selectedSubcounty !== 'all') {
      fetchWardsForSubcounty(selectedSubcounty);
    } else {
      setWards([]);
      setSelectedWard('all');
    }
    setSublocations([]);
    setSelectedSublocation('all');
    setVillages([]);
    setSelectedVillage('all');
  }, [selectedSubcounty]);

  useEffect(() => {
    if (selectedWard && selectedWard !== 'all') {
      fetchSublocationsForWard(selectedWard);
    } else {
      setSublocations([]);
      setSelectedSublocation('all');
    }
    setVillages([]);
    setSelectedVillage('all');
  }, [selectedWard, selectedSubcounty]);

  useEffect(() => {
    if (selectedSublocation && selectedSublocation !== 'all') {
      fetchVillagesForSublocation(selectedSublocation);
    } else {
      setVillages([]);
      setSelectedVillage('all');
    }
  }, [selectedSublocation, selectedWard, selectedSubcounty]);

  const fetchFilterOptions = async () => {
    try {
      const [yearsData, deptsData, typesData, subcountyData] = await Promise.all([
        getFinancialYears(),
        getDepartments(),
        getProjectTypes(),
        getSubCounties()
      ]);
      setFinancialYears(yearsData);
      setDepartments(deptsData);
      setProjectTypes(typesData);
      setSubcounties(subcountyData || []);
    } catch (err) {
      console.error('Error fetching filter options:', err);
    }
  };

  const fetchWardsForSubcounty = async (subcountyId) => {
    try {
      const wardData = await getWards(subcountyId);
      setWards(wardData || []);
    } catch (err) {
      console.error('Error fetching wards:', err);
      setWards([]);
    }
  };

  const fetchSublocationsForWard = async (wardId) => {
    try {
      const data = await getSublocations(wardId, selectedSubcounty !== 'all' ? selectedSubcounty : null);
      setSublocations(data || []);
    } catch (err) {
      console.error('Error fetching sublocations:', err);
      setSublocations([]);
    }
  };

  const fetchVillagesForSublocation = async (sublocationId) => {
    try {
      const data = await getVillages(
        sublocationId,
        selectedWard !== 'all' ? selectedWard : null,
        selectedSubcounty !== 'all' ? selectedSubcounty : null
      );
      setVillages(data || []);
    } catch (err) {
      console.error('Error fetching villages:', err);
      setVillages([]);
    }
  };

  const fetchProjects = async () => {
    try {
      setLoading(true);
      const filters = {
        page: pagination.page,
        limit: pagination.limit
      };

      if (selectedYear !== 'all') filters.finYearId = selectedYear;
      if (selectedStatus !== 'all') filters.status = selectedStatus;
      if (selectedDepartment !== 'all') filters.departmentId = selectedDepartment;
      if (selectedProjectType !== 'all') filters.projectType = selectedProjectType;
      if (selectedSubcounty !== 'all') filters.subCountyId = selectedSubcounty;
      if (selectedWard !== 'all') filters.wardId = selectedWard;
      if (selectedSublocation !== 'all') filters.sublocationId = selectedSublocation;
      if (selectedVillage !== 'all') filters.villageId = selectedVillage;
      if (searchTerm) filters.search = searchTerm;

      const response = await getProjects(filters);
      const projectsData = response.projects || [];
      setProjects(projectsData);
      setPagination(prev => ({
        ...prev,
        total: response.pagination?.total || 0,
        totalPages: response.pagination?.totalPages || 0
      }));
      
      setError(null);
    } catch (err) {
      console.error('Error fetching projects:', err);
      setError('Failed to load projects. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  const handlePageChange = (event, value) => {
    setPagination(prev => ({ ...prev, page: value }));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleClearFilters = () => {
    setSearchTerm('');
    setSelectedYear('all');
    setSelectedStatus('all');
    setSelectedDepartment('all');
    setSelectedProjectType('all');
    setSelectedSubcounty('all');
    setSelectedWard('all');
    setSelectedSublocation('all');
    setSelectedVillage('all');
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  const handleOpenFeedback = (project) => {
    console.log('Opening feedback modal for project:', project);
    setSelectedProject({
      ...project,
      // Normalize field names for feedback modal compatibility
      projectName: project.project_name || project.projectName,
      project_name: project.project_name || project.projectName,
      startDate: project.start_date || project.startDate,
      endDate: project.end_date || project.endDate,
      department: project.department_name || project.department,
      statusColor: getStatusColor(project.status)
    });
    setFeedbackModalOpen(true);
    console.log('Modal state set to true');
  };

  const handleViewDetails = (project) => {
    setSelectedProjectForDetails(project);
    setDetailsModalOpen(true);
  };

  const ProjectCard = ({ project }) => {
    // Calculate progress: 100% if status contains "completed", otherwise use completionPercentage
    const status = project.status?.toLowerCase() || '';
    const progress = status.includes('completed') 
      ? 100 
      : Math.min(100, Math.max(0, parseFloat(project.completionPercentage) || 0));

    return (
      <Card 
        sx={{ 
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          transition: 'all 0.3s ease',
          '&:hover': {
            transform: 'translateY(-8px)',
            boxShadow: 6
          }
        }}
      >
        <CardContent sx={{ flexGrow: 1, pt: 1.5, pb: 1, px: 1.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 1, flexWrap: 'wrap' }}>
            <Chip 
              label={formatStatus(project.status)}
              size="small"
              sx={{
                backgroundColor: getStatusColor(project.status),
                color: 'white',
                fontWeight: 'bold',
                height: '22px',
                fontSize: '0.7rem',
                '& .MuiChip-label': {
                  px: 1
                }
              }}
            />
            {project.financialYear && (
              <Chip 
                label={project.financialYear}
                size="small"
                sx={{
                  backgroundColor: 'primary.light',
                  color: 'primary.contrastText',
                  fontWeight: '600',
                  fontSize: '0.7rem',
                  height: '22px',
                  '& .MuiChip-label': {
                    px: 1
                  }
                }}
              />
            )}
          </Box>
          
          <Typography variant="subtitle1" fontWeight="bold" gutterBottom sx={{ mb: 0.75, lineHeight: 1.3 }}>
            {truncateText(project.project_name || project.projectName, 60)}
          </Typography>
          
          <Typography variant="caption" color="text.secondary" sx={{ mb: 1.25, display: 'block' }}>
            {truncateText(project.description, 100)}
          </Typography>

          <Box sx={{ mb: 0.75, display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <LocationOn sx={{ fontSize: 16, color: 'text.secondary' }} />
            <Typography variant="caption" color="text.secondary">
              {project.ward_name || project.subcounty_name || project.constituency || 'N/A'}
            </Typography>
          </Box>

          {(project.department_name || project.ministry) && (
            <Box sx={{ mb: 0.75, display: 'flex', alignItems: 'center', gap: 0.75 }}>
              <Business sx={{ fontSize: 16, color: 'text.secondary' }} />
              <Typography variant="caption" color="text.secondary">
                Department: {project.department_name || project.ministry}
              </Typography>
            </Box>
          )}

          <Box sx={{ mb: 0.75, display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <AccountBalanceWallet sx={{ fontSize: 16, color: 'success.main' }} />
            <Typography variant="caption" fontWeight="bold">
              {formatCurrency(project.budget)}
            </Typography>
          </Box>

          <Box sx={{ mb: 0.75, display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <CalendarToday sx={{ fontSize: 16, color: 'text.secondary' }} />
            <Typography variant="caption" color="text.secondary">
              {formatDate(project.start_date || project.startDate)} - {formatDate(project.end_date || project.endDate)}
            </Typography>
          </Box>

          {/* Progress Bar */}
          <Box sx={{ mt: 1.25 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.25 }}>
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
                Progress
              </Typography>
              <Typography variant="caption" fontWeight="bold" sx={{ fontSize: '0.7rem' }}>
                {progress}%
              </Typography>
            </Box>
            <LinearProgress 
              variant="determinate" 
              value={progress}
              sx={{
                height: 4,
                borderRadius: 2,
                backgroundColor: '#e0e0e0',
                '& .MuiLinearProgress-bar': {
                  backgroundColor: getStatusColor(project.status)
                }
              }}
            />
          </Box>
        </CardContent>

      <CardActions sx={{ p: 1, pt: 0, px: 1.5, display: 'flex', justifyContent: 'space-between' }}>
        <Button 
          size="small" 
          startIcon={<Visibility sx={{ fontSize: 16 }} />}
          onClick={() => handleViewDetails(project)}
          sx={{ textTransform: 'none', fontSize: '0.75rem', px: 1 }}
        >
          View Details
        </Button>
        <Button 
          size="small" 
          startIcon={<Comment sx={{ fontSize: 16 }} />}
          onClick={() => handleOpenFeedback(project)}
          color="primary"
          variant="outlined"
          sx={{ textTransform: 'none', fontSize: '0.75rem', px: 1 }}
        >
          Comment
        </Button>
      </CardActions>
    </Card>
    );
  };

  return (
    <Container maxWidth="lg" sx={{ py: 1 }}>
      {/* Header */}
      <Box sx={{ mb: 0.75, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h6" fontWeight="bold">
          Projects Gallery
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {projects.length > 0 && `Showing ${projects.length} of ${pagination.total}`}
        </Typography>
      </Box>

      {/* Filters Section */}
      <Paper elevation={1} sx={{ p: 0.75, mb: 1 }}>
        <Grid container spacing={0.75} alignItems="center">
          {/* Search */}
          <Grid item xs={12} sm={5} md={3.5}>
            <TextField
              fullWidth
              size="small"
              placeholder="Search projects..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              sx={{ 
                '& .MuiOutlinedInput-root': { 
                  height: '32px',
                  fontSize: '0.8125rem'
                } 
              }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <Search sx={{ fontSize: 14 }} />
                  </InputAdornment>
                ),
              }}
            />
          </Grid>

          {/* Financial Year */}
          <Grid item xs={6} sm={3.5} md={1.8}>
            <FormControl fullWidth size="small">
              <InputLabel sx={{ fontSize: '0.8125rem' }}>Year</InputLabel>
              <Select
                value={selectedYear}
                label="Year"
                onChange={(e) => {
                  setSelectedYear(e.target.value);
                  setPagination(prev => ({ ...prev, page: 1 }));
                }}
                sx={{ height: '32px', fontSize: '0.8125rem' }}
              >
                <MenuItem value="all" sx={{ fontSize: '0.8125rem' }}>All</MenuItem>
                {financialYears.map((year) => (
                  <MenuItem key={year.id} value={year.id} sx={{ fontSize: '0.8125rem' }}>
                    {year.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>

          {/* Status */}
          <Grid item xs={6} sm={3.5} md={1.8}>
            <FormControl fullWidth size="small">
              <InputLabel sx={{ fontSize: '0.8125rem' }}>Status</InputLabel>
              <Select
                value={selectedStatus}
                label="Status"
                onChange={(e) => {
                  setSelectedStatus(e.target.value);
                  setPagination(prev => ({ ...prev, page: 1 }));
                }}
                sx={{ height: '32px', fontSize: '0.8125rem' }}
              >
                <MenuItem value="all" sx={{ fontSize: '0.8125rem' }}>All</MenuItem>
                {statuses.map((status) => (
                  <MenuItem key={status} value={status} sx={{ fontSize: '0.8125rem' }}>
                    {status}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>

          {/* Department */}
          <Grid item xs={6} sm={3.5} md={2}>
            <FormControl fullWidth size="small">
              <InputLabel sx={{ fontSize: '0.8125rem' }}>Department</InputLabel>
              <Select
                value={selectedDepartment}
                label="Department"
                onChange={(e) => {
                  setSelectedDepartment(e.target.value);
                  setPagination(prev => ({ ...prev, page: 1 }));
                }}
                sx={{ height: '32px', fontSize: '0.8125rem' }}
              >
                <MenuItem value="all" sx={{ fontSize: '0.8125rem' }}>All</MenuItem>
                {departments.map((dept) => (
                  <MenuItem key={dept.id} value={dept.id} sx={{ fontSize: '0.8125rem' }}>
                    {dept.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>

          {/* Project Type */}
          <Grid item xs={6} sm={3.5} md={2}>
            <FormControl fullWidth size="small">
              <InputLabel sx={{ fontSize: '0.8125rem' }}>Category</InputLabel>
              <Select
                value={selectedProjectType}
                label="Category"
                onChange={(e) => {
                  setSelectedProjectType(e.target.value);
                  setPagination(prev => ({ ...prev, page: 1 }));
                }}
                sx={{ height: '32px', fontSize: '0.8125rem' }}
              >
                <MenuItem value="all" sx={{ fontSize: '0.8125rem' }}>All</MenuItem>
                {projectTypes.map((type) => (
                  <MenuItem key={type.id} value={type.name} sx={{ fontSize: '0.8125rem' }}>
                    {type.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>

          {/* Subcounty */}
          <Grid item xs={6} sm={3.5} md={2}>
            <FormControl fullWidth size="small">
              <InputLabel sx={{ fontSize: '0.8125rem' }}>Subcounty</InputLabel>
              <Select
                value={selectedSubcounty}
                label="Subcounty"
                onChange={(e) => {
                  setSelectedSubcounty(e.target.value);
                  setPagination(prev => ({ ...prev, page: 1 }));
                }}
                sx={{ height: '32px', fontSize: '0.8125rem' }}
              >
                <MenuItem value="all" sx={{ fontSize: '0.8125rem' }}>All</MenuItem>
                {subcounties.map((subcounty) => (
                  <MenuItem key={subcounty.id || subcounty.subcountyId} value={subcounty.id || subcounty.subcountyId} sx={{ fontSize: '0.8125rem' }}>
                    {subcounty.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>

          {/* Ward */}
          <Grid item xs={6} sm={3.5} md={2}>
            <FormControl fullWidth size="small" disabled={selectedSubcounty === 'all'}>
              <InputLabel sx={{ fontSize: '0.8125rem' }}>Ward</InputLabel>
              <Select
                value={selectedWard}
                label="Ward"
                onChange={(e) => {
                  setSelectedWard(e.target.value);
                  setPagination(prev => ({ ...prev, page: 1 }));
                }}
                sx={{ height: '32px', fontSize: '0.8125rem' }}
              >
                <MenuItem value="all" sx={{ fontSize: '0.8125rem' }}>All</MenuItem>
                {wards.map((ward) => (
                  <MenuItem key={ward.id || ward.wardId} value={ward.id || ward.wardId} sx={{ fontSize: '0.8125rem' }}>
                    {ward.name || ward.ward_name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>

          {/* Sublocation */}
          <Grid item xs={6} sm={3.5} md={2}>
            <FormControl fullWidth size="small" disabled={selectedWard === 'all'}>
              <InputLabel sx={{ fontSize: '0.8125rem' }}>Sublocation</InputLabel>
              <Select
                value={selectedSublocation}
                label="Sublocation"
                onChange={(e) => {
                  setSelectedSublocation(e.target.value);
                  setPagination(prev => ({ ...prev, page: 1 }));
                }}
                sx={{ height: '32px', fontSize: '0.8125rem' }}
              >
                <MenuItem value="all" sx={{ fontSize: '0.8125rem' }}>All</MenuItem>
                {sublocations.map((row) => (
                  <MenuItem key={row.id || row.sublocation_id} value={row.id || row.sublocation_id} sx={{ fontSize: '0.8125rem' }}>
                    {row.name || row.sublocation_name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>

          {/* Village */}
          <Grid item xs={6} sm={3.5} md={2}>
            <FormControl fullWidth size="small" disabled={selectedSublocation === 'all'}>
              <InputLabel sx={{ fontSize: '0.8125rem' }}>Village</InputLabel>
              <Select
                value={selectedVillage}
                label="Village"
                onChange={(e) => {
                  setSelectedVillage(e.target.value);
                  setPagination(prev => ({ ...prev, page: 1 }));
                }}
                sx={{ height: '32px', fontSize: '0.8125rem' }}
              >
                <MenuItem value="all" sx={{ fontSize: '0.8125rem' }}>All</MenuItem>
                {villages.map((row) => (
                  <MenuItem key={row.id || row.village_id} value={row.id || row.village_id} sx={{ fontSize: '0.8125rem' }}>
                    {row.name || row.village_name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>

          {/* Clear Filters Button */}
          <Grid item xs={12} sm={12} md={0.9} sx={{ display: 'flex', justifyContent: { xs: 'flex-end', md: 'center' }, mt: { xs: 0.25, md: 0 } }}>
            <Button
              size="small"
              variant="outlined"
              onClick={handleClearFilters}
              sx={{ 
                textTransform: 'none',
                fontSize: '0.7rem',
                height: '32px',
                px: 1.25,
                minWidth: 'auto'
              }}
            >
              Clear
            </Button>
          </Grid>
        </Grid>
      </Paper>

      {/* Results Summary - Filters Applied Chip */}
      {(selectedYear !== 'all' || selectedStatus !== 'all' || selectedDepartment !== 'all' || selectedProjectType !== 'all' || selectedSubcounty !== 'all' || selectedWard !== 'all' || selectedSublocation !== 'all' || selectedVillage !== 'all' || searchTerm) && (
        <Box sx={{ mb: 0.75, display: 'flex', justifyContent: 'flex-end' }}>
          <Chip 
            label="Filters Applied" 
            color="primary" 
            size="small"
            onDelete={handleClearFilters}
            sx={{ fontSize: '0.7rem', height: '20px' }}
          />
        </Box>
      )}

      {/* Loading State */}
      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress size={60} />
        </Box>
      )}

      {/* Error State */}
      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Projects Grid */}
      {!loading && !error && (
        <>
          {projects.length > 0 ? (
            <Grid container spacing={2}>
              {projects.map((project) => (
                <Grid item xs={12} sm={6} md={4} key={project.id}>
                  <ProjectCard project={project} />
                </Grid>
              ))}
            </Grid>
          ) : (
            <Paper 
              elevation={1} 
              sx={{ 
                p: 8, 
                textAlign: 'center',
                backgroundColor: '#f5f5f5'
              }}
            >
              <Typography variant="h6" color="text.secondary" gutterBottom>
                No projects found
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Try adjusting your filters or search criteria
              </Typography>
              <Button
                variant="outlined"
                onClick={handleClearFilters}
                sx={{ mt: 2, textTransform: 'none' }}
              >
                Clear Filters
              </Button>
            </Paper>
          )}

          {/* Pagination */}
          {projects.length > 0 && pagination.totalPages > 1 && (
            <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
              <Pagination 
                count={pagination.totalPages} 
                page={pagination.page} 
                onChange={handlePageChange}
                color="primary"
                size="large"
                showFirstButton
                showLastButton
              />
            </Box>
          )}
        </>
      )}

      {/* Project Feedback Modal */}
      <ProjectFeedbackModal
        open={feedbackModalOpen}
        onClose={() => setFeedbackModalOpen(false)}
        project={selectedProject}
      />

      {/* Project Details Modal */}
      <ProjectDetailsModal
        open={detailsModalOpen}
        onClose={() => {
          setDetailsModalOpen(false);
          setSelectedProjectForDetails(null);
          // Refresh projects when modal closes to show updated status
          fetchProjects();
        }}
        project={selectedProjectForDetails}
        projectId={selectedProjectForDetails?.id}
      />
    </Container>
  );
};

export default ProjectsGalleryPage;

