import React, { useState, useEffect } from 'react';
import {
  Container,
  Typography,
  Box,
  Paper,
  Grid,
  Card,
  CardContent,
  CardMedia,
  Chip,
  Button,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Avatar,
  Divider,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  ListItemSecondaryAction,
  Badge,
  Alert,
  CircularProgress
} from '@mui/material';
import {
  Announcement as AnnouncementIcon,
  Event as EventIcon,
  LocationOn as LocationIcon,
  Schedule as ScheduleIcon,
  Person as PersonIcon,
  Visibility as ViewIcon,
  CalendarToday as CalendarIcon,
  AccessTime as TimeIcon,
  Public as PublicIcon,
  School as SchoolIcon,
  Construction as ConstructionIcon,
  LocalHospital as HealthIcon,
  Water as WaterIcon,
  DirectionsCar as TransportIcon,
  Agriculture as AgricultureIcon,
  Notifications as NotificationIcon,
  FilterList as FilterIcon,
  Search as SearchIcon
} from '@mui/icons-material';
import { formatCurrency } from '../utils/formatters';
import { getAnnouncements } from '../services/publicApi';

const AnnouncementsPage = () => {
  const [activeTab, setActiveTab] = useState(0);
  const [selectedAnnouncement, setSelectedAnnouncement] = useState(null);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [filterCategory, setFilterCategory] = useState('All');
  const [loading, setLoading] = useState(false);
  const [announcements, setAnnouncements] = useState([]);

  // Fetch announcements on component mount
  useEffect(() => {
    fetchAnnouncements();
  }, []);

  const fetchAnnouncements = async () => {
    try {
      setLoading(true);
      const data = await getAnnouncements();
      setAnnouncements(data.announcements || []);
      if (data.announcements && data.announcements.length === 0) {
        console.log('No announcements found in database');
      }
    } catch (error) {
      console.error('Error fetching announcements:', error);
      const errorMsg = error.response?.data?.error || error.response?.data?.details || error.message || 'Failed to load announcements';
      console.error('Error details:', errorMsg);
      setAnnouncements([]);
    } finally {
      setLoading(false);
    }
  };

  // Mock data for announcements (kept for reference)
  const mockAnnouncements = [
    {
      id: 1,
      title: 'Public Participation Meeting - Kondele Market Project',
      description: 'Join us for a public participation meeting to discuss the proposed Kondele Market development project. Your input is valuable!',
      content: 'The County Government of Machakos invites all residents to participate in a public meeting regarding the proposed Kondele Market development project. This meeting will provide an opportunity for community members to:\n\n• Learn about the project details and timeline\n• Ask questions and provide feedback\n• Share concerns and suggestions\n• Understand the project\'s impact on the community\n\nDate: March 15, 2024\nTime: 2:00 PM - 5:00 PM\nVenue: Kondele Community Hall\n\nAll interested parties are encouraged to attend.',
      category: 'Public Participation',
      type: 'Meeting',
      date: '2024-03-15',
      time: '14:00',
      location: 'Kondele Community Hall',
      organizer: 'County Planning Department',
      status: 'Upcoming',
      priority: 'High',
      image: '/api/placeholder/400/200',
      attendees: 45,
      maxAttendees: 100
    },
    {
      id: 2,
      title: 'Project Launch - Youth Skills Training Center',
      description: 'Official launch of the new Youth Skills Training Center in Kisumu Central. Join us for the grand opening ceremony!',
      content: 'We are excited to announce the official launch of the Youth Skills Training Center, a state-of-the-art facility designed to empower young people with practical skills for employment and entrepreneurship.\n\nProgram Highlights:\n• Vocational training in various trades\n• Entrepreneurship development\n• Job placement assistance\n• Mentorship programs\n\nLaunch Event Details:\nDate: March 20, 2024\nTime: 10:00 AM - 2:00 PM\nVenue: Youth Skills Training Center, Kisumu Central\n\nSpecial guests include the Governor, County officials, and successful alumni.',
      category: 'Project Launch',
      type: 'Event',
      date: '2024-03-20',
      time: '10:00',
      location: 'Youth Skills Training Center, Kisumu Central',
      organizer: 'Youth Development Department',
      status: 'Upcoming',
      priority: 'High',
      image: '/api/placeholder/400/200',
      attendees: 120,
      maxAttendees: 200
    },
    {
      id: 3,
      title: 'Water Project Update - Nyakach Sub-County',
      description: 'Progress update on the water supply extension project in Nyakach Sub-County. Phase 1 completed successfully.',
      content: 'We are pleased to announce the successful completion of Phase 1 of the water supply extension project in Nyakach Sub-County.\n\nCompleted Work:\n• Installation of 15km of water pipes\n• Construction of 3 water storage tanks\n• Connection of 500 households\n• Establishment of 5 water kiosks\n\nNext Steps:\n• Phase 2 will begin in April 2024\n• Additional 20km of pipes to be installed\n• 800 more households to be connected\n• Project completion expected by December 2024\n\nFor more information, contact the Water Department.',
      category: 'Project Update',
      type: 'Update',
      date: '2024-03-10',
      time: '09:00',
      location: 'Nyakach Sub-County',
      organizer: 'Water & Sanitation Department',
      status: 'Completed',
      priority: 'Medium',
      image: '/api/placeholder/400/200',
      attendees: 0,
      maxAttendees: 0
    },
    {
      id: 4,
      title: 'Call for Proposals - Agricultural Development Projects',
      description: 'The County Government is seeking proposals for agricultural development projects. Submit your innovative ideas!',
      content: 'The County Government of Machakos is calling for proposals for innovative agricultural development projects that will benefit local farmers and communities.\n\nEligibility Criteria:\n• Registered farmer groups or cooperatives\n• Agricultural organizations\n• Community-based organizations\n• Individual farmers with innovative ideas\n\nProject Focus Areas:\n• Modern farming techniques\n• Irrigation systems\n• Post-harvest handling\n• Market access improvement\n• Value addition\n\nSubmission Deadline: April 30, 2024\nMaximum Funding: KES 2,000,000 per project\n\nFor application forms and guidelines, visit the Agriculture Department offices.',
      category: 'Call for Proposals',
      type: 'Opportunity',
      date: '2024-04-30',
      time: '17:00',
      location: 'Agriculture Department Offices',
      organizer: 'Agriculture Department',
      status: 'Open',
      priority: 'High',
      image: '/api/placeholder/400/200',
      attendees: 0,
      maxAttendees: 0
    },
    {
      id: 5,
      title: 'Health Center Renovation - Temporary Closure Notice',
      description: 'Kisumu Central Health Center will be temporarily closed for renovation works. Alternative arrangements provided.',
      content: 'Please be informed that Kisumu Central Health Center will be temporarily closed for renovation works from March 25 to April 15, 2024.\n\nRenovation Works:\n• Upgrading of patient rooms\n• Installation of new medical equipment\n• Improvement of sanitation facilities\n• Expansion of waiting areas\n\nAlternative Health Services:\n• Jaramogi Oginga Odinga Teaching and Referral Hospital\n• Kisumu County Hospital\n• Private health facilities in the area\n\nEmergency services will be available at the nearest alternative facility.\n\nWe apologize for any inconvenience caused.',
      category: 'Service Notice',
      type: 'Notice',
      date: '2024-03-25',
      time: '08:00',
      location: 'Kisumu Central Health Center',
      organizer: 'Health Department',
      status: 'Active',
      priority: 'High',
      image: '/api/placeholder/400/200',
      attendees: 0,
      maxAttendees: 0
    }
  ];

  const categories = [
    'All',
    'Public Participation',
    'Project Launch',
    'Project Update',
    'Call for Proposals',
    'Service Notice',
    'Emergency',
    'General'
  ];

  const priorityColors = {
    'High': 'error',
    'Medium': 'warning',
    'Low': 'success'
  };

  const statusColors = {
    'Upcoming': 'primary',
    'Active': 'success',
    'Completed': 'default',
    'Open': 'info',
    'Closed': 'error'
  };

  const categoryIcons = {
    'Public Participation': <PublicIcon />,
    'Project Launch': <ConstructionIcon />,
    'Project Update': <ScheduleIcon />,
    'Call for Proposals': <AnnouncementIcon />,
    'Service Notice': <NotificationIcon />,
    'Emergency': <NotificationIcon />,
    'General': <AnnouncementIcon />
  };

  const filteredAnnouncements = filterCategory === 'All' 
    ? announcements 
    : announcements.filter(announcement => announcement.category === filterCategory);

  const handleViewAnnouncement = (announcement) => {
    setSelectedAnnouncement(announcement);
    setViewDialogOpen(true);
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const formatTime = (timeString) => {
    const [hours, minutes] = timeString.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      {/* Header */}
      <Box sx={{ mb: 2 }}>
        <Typography variant="h4" fontWeight="bold" sx={{ mb: 0.5 }}>
          Project Announcements
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ mb: 0 }}>
          Stay updated with project launches, public participation meetings, and important announcements
        </Typography>
      </Box>

      {/* Filter Tabs */}
      <Paper sx={{ mb: 3 }}>
        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Box sx={{ display: 'flex', px: 2, py: 1, gap: 1, flexWrap: 'wrap' }}>
            {categories.map((category) => (
              <Chip
                key={category}
                label={category}
                variant={filterCategory === category ? 'filled' : 'outlined'}
                onClick={() => setFilterCategory(category)}
                icon={categoryIcons[category]}
                sx={{
                  mb: 1,
                  '&:hover': {
                    backgroundColor: 'primary.light',
                    color: 'white'
                  }
                }}
              />
            ))}
          </Box>
        </Box>
      </Paper>

      {/* Announcements Grid */}
      {loading ? (
        <Box display="flex" justifyContent="center" alignItems="center" minHeight="200px">
          <CircularProgress />
        </Box>
      ) : (
        <Grid container spacing={3}>
          {filteredAnnouncements.map((announcement) => (
          <Grid item xs={12} md={6} lg={4} key={announcement.id}>
            <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
              {announcement.image_url && announcement.image_url.startsWith('http') && (
                <CardMedia
                  component="img"
                  height="200"
                  image={announcement.image_url}
                  alt=""
                  onError={(e) => {
                    e.target.style.display = 'none';
                  }}
                  sx={{ objectFit: 'cover' }}
                />
              )}
              <CardContent sx={{ flexGrow: 1, pt: 2 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1.5 }}>
                  <Chip
                    label={announcement.status}
                    color={statusColors[announcement.status]}
                    size="small"
                  />
                  <Chip
                    label={announcement.priority}
                    color={priorityColors[announcement.priority]}
                    size="small"
                    variant="outlined"
                  />
                </Box>

                <Typography variant="h6" fontWeight="bold" sx={{ mb: 1, lineHeight: 1.3 }}>
                  {announcement.title}
                </Typography>

                <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                  {announcement.description}
                </Typography>

                <Box sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                  <CalendarIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
                  <Typography variant="body2" color="text.secondary">
                    {formatDate(announcement.date)}
                  </Typography>
                </Box>

                <Box sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                  <TimeIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
                  <Typography variant="body2" color="text.secondary">
                    {formatTime(announcement.time)}
                  </Typography>
                </Box>

                <Box sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                  <LocationIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
                  <Typography variant="body2" color="text.secondary">
                    {announcement.location}
                  </Typography>
                </Box>

                <Box sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                  <PersonIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
                  <Typography variant="body2" color="text.secondary">
                    {announcement.organizer}
                  </Typography>
                </Box>

                {announcement.max_attendees > 0 && (
                  <Box sx={{ mb: 2 }}>
                    <Typography variant="body2" color="text.secondary" gutterBottom>
                      Attendance: {announcement.attendees}/{announcement.max_attendees}
                    </Typography>
                    <Box sx={{ width: '100%', bgcolor: 'grey.200', borderRadius: 1, height: 8 }}>
                      <Box
                        sx={{
                          width: `${(announcement.attendees / announcement.max_attendees) * 100}%`,
                          bgcolor: 'primary.main',
                          borderRadius: 1,
                          height: 8
                        }}
                      />
                    </Box>
                  </Box>
                )}

                <Button
                  variant="outlined"
                  fullWidth
                  startIcon={<ViewIcon />}
                  onClick={() => handleViewAnnouncement(announcement)}
                  sx={{ mt: 'auto' }}
                >
                  View Details
                </Button>
              </CardContent>
            </Card>
          </Grid>
        ))}
        </Grid>
      )}

      {/* No announcements message */}
      {filteredAnnouncements.length === 0 && (
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <AnnouncementIcon sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
          <Typography variant="h6" color="text.secondary">
            No announcements found for this category
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Check back later for new announcements
          </Typography>
        </Box>
      )}

      {/* View Announcement Dialog */}
      <Dialog
        open={viewDialogOpen}
        onClose={() => setViewDialogOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            {categoryIcons[selectedAnnouncement?.category]}
            <Typography variant="h5" fontWeight="bold">
              {selectedAnnouncement?.title}
            </Typography>
          </Box>
        </DialogTitle>
        <DialogContent>
          {selectedAnnouncement && (
            <Box>
              <Grid container spacing={3}>
                <Grid item xs={12} md={6}>
                  <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                    Category
                  </Typography>
                  <Chip
                    label={selectedAnnouncement.category}
                    icon={categoryIcons[selectedAnnouncement.category]}
                    sx={{ mb: 2 }}
                  />

                  <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                    Date & Time
                  </Typography>
                  <Typography variant="body1" sx={{ mb: 2 }}>
                    {formatDate(selectedAnnouncement.date)} at {formatTime(selectedAnnouncement.time)}
                  </Typography>

                  <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                    Location
                  </Typography>
                  <Typography variant="body1" sx={{ mb: 2 }}>
                    {selectedAnnouncement.location}
                  </Typography>

                  <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                    Organizer
                  </Typography>
                  <Typography variant="body1" sx={{ mb: 2 }}>
                    {selectedAnnouncement.organizer}
                  </Typography>
                </Grid>

                <Grid item xs={12} md={6}>
                  <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                    Status
                  </Typography>
                  <Chip
                    label={selectedAnnouncement.status}
                    color={statusColors[selectedAnnouncement.status]}
                    sx={{ mb: 2 }}
                  />

                  <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                    Priority
                  </Typography>
                  <Chip
                    label={selectedAnnouncement.priority}
                    color={priorityColors[selectedAnnouncement.priority]}
                    variant="outlined"
                    sx={{ mb: 2 }}
                  />

                  {selectedAnnouncement.max_attendees > 0 && (
                    <>
                      <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                        Attendance
                      </Typography>
                      <Typography variant="body1" sx={{ mb: 1 }}>
                        {selectedAnnouncement.attendees}/{selectedAnnouncement.max_attendees} people
                      </Typography>
                      <Box sx={{ width: '100%', bgcolor: 'grey.200', borderRadius: 1, height: 8, mb: 2 }}>
                        <Box
                          sx={{
                            width: `${(selectedAnnouncement.attendees / selectedAnnouncement.max_attendees) * 100}%`,
                            bgcolor: 'primary.main',
                            borderRadius: 1,
                            height: 8
                          }}
                        />
                      </Box>
                    </>
                  )}
                </Grid>

                <Grid item xs={12}>
                  <Divider sx={{ my: 2 }} />
                  <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                    Full Content
                  </Typography>
                  <Typography variant="body1" sx={{ whiteSpace: 'pre-line' }}>
                    {selectedAnnouncement.content}
                  </Typography>
                </Grid>
              </Grid>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setViewDialogOpen(false)}>
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default AnnouncementsPage;























