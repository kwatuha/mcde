import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Box,
  Typography,
  Avatar,
  TextField,
  Button,
  Grid,
  IconButton,
  useTheme,
  Alert,
  CircularProgress,
} from '@mui/material';
import {
  Close as CloseIcon,
  Edit as EditIcon,
  Save as SaveIcon,
  Cancel as CancelIcon,
  Person as AccountIcon,
  Email as EmailIcon,
  Badge as BadgeIcon,
  Work as WorkIcon,
} from '@mui/icons-material';
import { tokens } from '../pages/dashboard/theme';
import { useAuth } from '../context/AuthContext';
import userService from '../api/userService';

const ProfileModal = ({ open, onClose }) => {
  const theme = useTheme();
  const colors = tokens(theme.palette.mode);
  const { user: currentUser } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [formData, setFormData] = useState({
    email: '',
    firstName: '',
    lastName: '',
    idNumber: '',
    employeeNumber: '',
  });
  const [formErrors, setFormErrors] = useState({});

  // Email validation function
  const validateEmail = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  // Fetch user data when modal opens
  useEffect(() => {
    if (open && currentUser?.userId) {
      fetchUserData();
    }
  }, [open, currentUser?.userId]);

  const fetchUserData = async () => {
    if (!currentUser?.userId) return;
    
    setLoading(true);
    setError('');
    try {
      const userData = await userService.getUserById(currentUser.userId);
      setFormData({
        email: userData.email || '',
        firstName: userData.firstName || '',
        lastName: userData.lastName || '',
        idNumber: userData.idNumber || '',
        employeeNumber: userData.employeeNumber || '',
      });
    } catch (err) {
      console.error('Error fetching user data:', err);
      setError('Failed to load profile data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));

    // Clear error for this field
    if (formErrors[field]) {
      setFormErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }

    // Validate email in real-time
    if (field === 'email' && value && !validateEmail(value)) {
      setFormErrors(prev => ({
        ...prev,
        email: 'Please enter a valid email address (e.g., user@example.com)'
      }));
    }
  };

  const validateForm = () => {
    const errors = {};

    if (!formData.email || formData.email.trim() === '') {
      errors.email = 'Email is required';
    } else if (!validateEmail(formData.email)) {
      errors.email = 'Please enter a valid email address (e.g., user@example.com)';
    }

    if (!formData.firstName || formData.firstName.trim() === '') {
      errors.firstName = 'First name is required';
    }

    if (!formData.lastName || formData.lastName.trim() === '') {
      errors.lastName = 'Last name is required';
    }

    if (!formData.idNumber || formData.idNumber.trim() === '') {
      errors.idNumber = 'ID number is required';
    }

    if (!formData.employeeNumber || formData.employeeNumber.trim() === '') {
      errors.employeeNumber = 'Employee number is required';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSave = async () => {
    if (!validateForm()) {
      setError('Please correct the form errors before saving.');
      return;
    }

    setSaving(true);
    setError('');
    setSuccess('');

    try {
      await userService.updateUser(currentUser.userId, {
        email: formData.email.trim(),
        firstName: formData.firstName.trim(),
        lastName: formData.lastName.trim(),
        idNumber: formData.idNumber.trim(),
        employeeNumber: formData.employeeNumber.trim(),
      });

      setSuccess('Profile updated successfully!');
      setIsEditing(false);
      
      // Refresh user data
      setTimeout(() => {
        fetchUserData();
      }, 500);
    } catch (err) {
      console.error('Error updating profile:', err);
      setError(err.response?.data?.message || err.message || 'Failed to update profile. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    fetchUserData(); // Reset to original values
    setIsEditing(false);
    setFormErrors({});
    setError('');
    setSuccess('');
  };

  const handleEdit = () => {
    setIsEditing(true);
    setError('');
    setSuccess('');
  };

  const fullName = `${formData.firstName || ''} ${formData.lastName || ''}`.trim() || currentUser?.username || 'User';

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          bgcolor: theme.palette.mode === 'dark' ? colors.primary[100] : '#ffffff',
          borderRadius: 3,
          boxShadow: `0 8px 32px rgba(0, 0, 0, 0.1)`,
        }
      }}
    >
      <DialogTitle sx={{ 
        bgcolor: theme.palette.mode === 'dark' ? colors.primary[200] : colors.blueAccent?.[100] || '#e0e2f5',
        color: theme.palette.mode === 'dark' ? colors.grey[900] : colors.grey[800],
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        p: 3
      }}>
        <Box display="flex" alignItems="center" gap={2}>
          <Avatar sx={{ 
            bgcolor: colors.blueAccent?.[500] || '#6870fa',
            width: 40,
            height: 40
          }}>
            {fullName.charAt(0).toUpperCase()}
          </Avatar>
          <Box>
            <Typography variant="h6" fontWeight="bold">
              My Profile
            </Typography>
            <Typography variant="body2" color={theme.palette.mode === 'dark' ? colors.grey[700] : colors.grey[600]}>
              Manage your personal information
            </Typography>
          </Box>
        </Box>
        <Box display="flex" alignItems="center" gap={1}>
          {!isEditing ? (
            <IconButton 
              onClick={handleEdit}
              sx={{ 
                color: colors.blueAccent?.[500] || '#6870fa',
                '&:hover': { bgcolor: colors.blueAccent?.[500] + '20' }
              }}
            >
              <EditIcon />
            </IconButton>
          ) : (
            <Box display="flex" gap={1}>
              <IconButton 
                onClick={handleSave}
                disabled={saving}
                sx={{ 
                  color: colors.greenAccent?.[500] || '#4cceac',
                  '&:hover': { bgcolor: colors.greenAccent?.[500] + '20' },
                  '&:disabled': { opacity: 0.5 }
                }}
              >
                {saving ? <CircularProgress size={20} /> : <SaveIcon />}
              </IconButton>
              <IconButton 
                onClick={handleCancel}
                disabled={saving}
                sx={{ 
                  color: colors.redAccent?.[500] || '#db4f4a',
                  '&:hover': { bgcolor: colors.redAccent?.[500] + '20' },
                  '&:disabled': { opacity: 0.5 }
                }}
              >
                <CancelIcon />
              </IconButton>
            </Box>
          )}
          <IconButton 
            onClick={onClose}
            sx={{ 
              color: theme.palette.mode === 'dark' ? colors.grey[700] : colors.grey[600],
              '&:hover': { bgcolor: theme.palette.mode === 'dark' ? colors.primary[300] : colors.grey[200] }
            }}
          >
            <CloseIcon />
          </IconButton>
        </Box>
      </DialogTitle>

      <DialogContent sx={{ p: 3 }}>
        {loading ? (
          <Box display="flex" justifyContent="center" alignItems="center" minHeight={200}>
            <CircularProgress />
          </Box>
        ) : (
          <>
            {error && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {error}
              </Alert>
            )}
            {success && (
              <Alert severity="success" sx={{ mb: 2 }}>
                {success}
              </Alert>
            )}

            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="First Name"
                  value={formData.firstName}
                  onChange={(e) => handleInputChange('firstName', e.target.value)}
                  disabled={!isEditing}
                  required
                  error={!!formErrors.firstName}
                  helperText={formErrors.firstName}
                  InputProps={{
                    startAdornment: <AccountIcon sx={{ color: theme.palette.mode === 'dark' ? colors.grey[600] : colors.grey[500], mr: 1 }} />
                  }}
                  sx={{
                    '& .MuiOutlinedInput-root': {
                      bgcolor: theme.palette.mode === 'dark' ? colors.primary[50] : '#ffffff',
                      '& fieldset': { borderColor: colors.grey[400] },
                      '&:hover fieldset': { borderColor: colors.blueAccent?.[500] || '#6870fa' },
                      '&.Mui-focused fieldset': { borderColor: colors.blueAccent?.[500] || '#6870fa' },
                    },
                    '& .MuiInputLabel-root': { color: theme.palette.mode === 'dark' ? colors.grey[700] : colors.grey[600] },
                    '& .MuiOutlinedInput-input': { color: theme.palette.mode === 'dark' ? colors.grey[900] : colors.grey[800] },
                  }}
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Last Name"
                  value={formData.lastName}
                  onChange={(e) => handleInputChange('lastName', e.target.value)}
                  disabled={!isEditing}
                  required
                  error={!!formErrors.lastName}
                  helperText={formErrors.lastName}
                  InputProps={{
                    startAdornment: <AccountIcon sx={{ color: theme.palette.mode === 'dark' ? colors.grey[600] : colors.grey[500], mr: 1 }} />
                  }}
                  sx={{
                    '& .MuiOutlinedInput-root': {
                      bgcolor: theme.palette.mode === 'dark' ? colors.primary[50] : '#ffffff',
                      '& fieldset': { borderColor: colors.grey[400] },
                      '&:hover fieldset': { borderColor: colors.blueAccent?.[500] || '#6870fa' },
                      '&.Mui-focused fieldset': { borderColor: colors.blueAccent?.[500] || '#6870fa' },
                    },
                    '& .MuiInputLabel-root': { color: theme.palette.mode === 'dark' ? colors.grey[700] : colors.grey[600] },
                    '& .MuiOutlinedInput-input': { color: theme.palette.mode === 'dark' ? colors.grey[900] : colors.grey[800] },
                  }}
                />
              </Grid>

              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => handleInputChange('email', e.target.value)}
                  disabled={!isEditing}
                  required
                  error={!!formErrors.email}
                  helperText={formErrors.email || 'Enter a valid email address (e.g., user@example.com)'}
                  InputProps={{
                    startAdornment: <EmailIcon sx={{ color: theme.palette.mode === 'dark' ? colors.grey[600] : colors.grey[500], mr: 1 }} />
                  }}
                  sx={{
                    '& .MuiOutlinedInput-root': {
                      bgcolor: theme.palette.mode === 'dark' ? colors.primary[50] : '#ffffff',
                      '& fieldset': { borderColor: colors.grey[400] },
                      '&:hover fieldset': { borderColor: colors.blueAccent?.[500] || '#6870fa' },
                      '&.Mui-focused fieldset': { borderColor: colors.blueAccent?.[500] || '#6870fa' },
                    },
                    '& .MuiInputLabel-root': { color: theme.palette.mode === 'dark' ? colors.grey[700] : colors.grey[600] },
                    '& .MuiOutlinedInput-input': { color: theme.palette.mode === 'dark' ? colors.grey[900] : colors.grey[800] },
                  }}
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="ID Number"
                  value={formData.idNumber}
                  onChange={(e) => handleInputChange('idNumber', e.target.value)}
                  disabled={!isEditing}
                  required
                  error={!!formErrors.idNumber}
                  helperText={formErrors.idNumber || 'National ID number'}
                  inputProps={{ maxLength: 50 }}
                  InputProps={{
                    startAdornment: <BadgeIcon sx={{ color: theme.palette.mode === 'dark' ? colors.grey[600] : colors.grey[500], mr: 1 }} />
                  }}
                  sx={{
                    '& .MuiOutlinedInput-root': {
                      bgcolor: theme.palette.mode === 'dark' ? colors.primary[50] : '#ffffff',
                      '& fieldset': { borderColor: colors.grey[400] },
                      '&:hover fieldset': { borderColor: colors.blueAccent?.[500] || '#6870fa' },
                      '&.Mui-focused fieldset': { borderColor: colors.blueAccent?.[500] || '#6870fa' },
                    },
                    '& .MuiInputLabel-root': { color: theme.palette.mode === 'dark' ? colors.grey[700] : colors.grey[600] },
                    '& .MuiOutlinedInput-input': { color: theme.palette.mode === 'dark' ? colors.grey[900] : colors.grey[800] },
                  }}
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Employee Number"
                  value={formData.employeeNumber}
                  onChange={(e) => handleInputChange('employeeNumber', e.target.value)}
                  disabled={!isEditing}
                  required
                  error={!!formErrors.employeeNumber}
                  helperText={formErrors.employeeNumber || 'Employee number'}
                  inputProps={{ maxLength: 50 }}
                  InputProps={{
                    startAdornment: <WorkIcon sx={{ color: theme.palette.mode === 'dark' ? colors.grey[600] : colors.grey[500], mr: 1 }} />
                  }}
                  sx={{
                    '& .MuiOutlinedInput-root': {
                      bgcolor: theme.palette.mode === 'dark' ? colors.primary[50] : '#ffffff',
                      '& fieldset': { borderColor: colors.grey[400] },
                      '&:hover fieldset': { borderColor: colors.blueAccent?.[500] || '#6870fa' },
                      '&.Mui-focused fieldset': { borderColor: colors.blueAccent?.[500] || '#6870fa' },
                    },
                    '& .MuiInputLabel-root': { color: theme.palette.mode === 'dark' ? colors.grey[700] : colors.grey[600] },
                    '& .MuiOutlinedInput-input': { color: theme.palette.mode === 'dark' ? colors.grey[900] : colors.grey[800] },
                  }}
                />
              </Grid>
            </Grid>
          </>
        )}
      </DialogContent>

      <DialogActions sx={{ p: 3, bgcolor: theme.palette.mode === 'dark' ? colors.primary[100] : '#f5f5f5' }}>
        <Button
          onClick={onClose}
          sx={{
            color: theme.palette.mode === 'dark' ? colors.grey[700] : colors.grey[600],
            '&:hover': { bgcolor: theme.palette.mode === 'dark' ? colors.primary[200] : colors.grey[200] }
          }}
        >
          Close
        </Button>
        {isEditing && (
          <Button
            onClick={handleSave}
            variant="contained"
            disabled={saving}
            sx={{
              bgcolor: colors.blueAccent?.[500] || '#6870fa',
              '&:hover': { bgcolor: colors.blueAccent?.[600] || '#535ac8' },
              '&:disabled': { opacity: 0.5 }
            }}
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
};

export default ProfileModal;
