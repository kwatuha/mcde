import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Box,
  Typography,
  IconButton,
  InputAdornment,
  Alert,
  CircularProgress,
} from '@mui/material';
import {
  Visibility,
  VisibilityOff,
} from '@mui/icons-material';
import authService from '../api/authService';

const ChangePasswordModal = ({ open, onClose }) => {
  const [formData, setFormData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [showPasswords, setShowPasswords] = useState({
    current: false,
    new: false,
    confirm: false,
  });

  const handleInputChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({
        ...prev,
        [field]: ''
      }));
    }
    setError('');
  };

  const validateForm = () => {
    const newErrors = {};

    if (!formData.currentPassword) {
      newErrors.currentPassword = 'Current password is required';
    }

    if (!formData.newPassword) {
      newErrors.newPassword = 'New password is required';
    } else if (formData.newPassword.length < 6) {
      newErrors.newPassword = 'Password must be at least 6 characters long';
    }

    if (!formData.confirmPassword) {
      newErrors.confirmPassword = 'Please confirm your new password';
    } else if (formData.newPassword !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
    }

    if (formData.currentPassword === formData.newPassword) {
      newErrors.newPassword = 'New password must be different from current password';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    setLoading(true);
    setError('');
    setSuccess(false);

    try {
      // Call API to change password for authenticated user
      const response = await authService.changePassword({
        currentPassword: formData.currentPassword,
        newPassword: formData.newPassword,
      });

      // Check if the response indicates success
      if (response && (response.success !== false)) {
        setSuccess(true);
        // Reset form after successful change
        setTimeout(() => {
          handleClose();
          setSuccess(false);
        }, 2000);
      } else {
        setError(response?.message || 'Failed to change password. Please try again.');
      }
    } catch (err) {
      console.error('Password change error:', err);
      
      // Handle different error types
      let errorMessage = 'Failed to change password. Please try again.';
      
      if (err.response) {
        // Server responded with error status
        const status = err.response.status;
        const data = err.response.data;
        
        if (status === 401 || status === 403) {
          errorMessage = data?.message || 'Current password is incorrect. Please check and try again.';
        } else if (status === 400) {
          errorMessage = data?.message || 'Invalid request. Please check your input and try again.';
        } else if (status === 404) {
          errorMessage = 'Password change service is not available. Please contact support.';
        } else if (status === 500) {
          errorMessage = 'Server error occurred. Please try again later.';
        } else {
          errorMessage = data?.message || data?.error || `Error: ${status}. Please try again.`;
        }
      } else if (err?.status) {
        // API wrapper may throw plain payloads without axios response object
        const status = err.status;
        if (status === 401 || status === 403) {
          errorMessage = err?.message || err?.error || 'Current password is incorrect. Please check and try again.';
        } else if (status === 400) {
          errorMessage = err?.message || err?.error || 'Invalid request. Please check your input and try again.';
        } else if (status === 404) {
          errorMessage = err?.message || err?.error || 'Password change service is not available. Please contact support.';
        } else if (status === 500) {
          errorMessage = err?.message || err?.error || 'Server error occurred. Please try again later.';
        } else {
          errorMessage = err?.message || err?.error || `Error: ${status}. Please try again.`;
        }
      } else if (err.request) {
        // Request was made but no response received
        errorMessage = 'Unable to connect to server. Please check your connection and try again.';
      } else {
        // Something else happened
        errorMessage = err.message || 'An unexpected error occurred. Please try again.';
      }
      
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setFormData({
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    });
    setErrors({});
    setError('');
    setSuccess(false);
    setShowPasswords({
      current: false,
      new: false,
      confirm: false,
    });
    onClose();
  };

  const togglePasswordVisibility = (field) => {
    setShowPasswords(prev => ({
      ...prev,
      [field]: !prev[field]
    }));
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
    >
      <DialogTitle sx={{ backgroundColor: 'primary.main', color: 'white' }}>
        Change Password
      </DialogTitle>

      <DialogContent dividers>
        <Box sx={{ mt: 1, mb: 2 }}>
          <Typography variant="body2" color="text.secondary">
            Update your account password securely.
          </Typography>
        </Box>
        {success && (
          <Alert severity="success" sx={{ mb: 2 }}>
            Password changed successfully! This dialog will close shortly.
          </Alert>
        )}

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <form onSubmit={handleSubmit} id="change-password-form">
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <TextField
              fullWidth
              margin="dense"
              variant="outlined"
              label="Current Password"
              type={showPasswords.current ? 'text' : 'password'}
              value={formData.currentPassword}
              onChange={(e) => handleInputChange('currentPassword', e.target.value)}
              error={!!errors.currentPassword}
              helperText={errors.currentPassword}
              disabled={loading}
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      onClick={() => togglePasswordVisibility('current')}
                      edge="end"
                    >
                      {showPasswords.current ? <VisibilityOff /> : <Visibility />}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />

            <TextField
              fullWidth
              margin="dense"
              variant="outlined"
              label="New Password"
              type={showPasswords.new ? 'text' : 'password'}
              value={formData.newPassword}
              onChange={(e) => handleInputChange('newPassword', e.target.value)}
              error={!!errors.newPassword}
              helperText={errors.newPassword || 'Must be at least 6 characters long'}
              disabled={loading}
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      onClick={() => togglePasswordVisibility('new')}
                      edge="end"
                    >
                      {showPasswords.new ? <VisibilityOff /> : <Visibility />}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />

            <TextField
              fullWidth
              margin="dense"
              variant="outlined"
              label="Confirm New Password"
              type={showPasswords.confirm ? 'text' : 'password'}
              value={formData.confirmPassword}
              onChange={(e) => handleInputChange('confirmPassword', e.target.value)}
              error={!!errors.confirmPassword}
              helperText={errors.confirmPassword}
              disabled={loading}
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      onClick={() => togglePasswordVisibility('confirm')}
                      edge="end"
                    >
                      {showPasswords.confirm ? <VisibilityOff /> : <Visibility />}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />
          </Box>
        </form>
      </DialogContent>

      <DialogActions sx={{ padding: '16px 24px' }}>
        <Button
          onClick={handleClose}
          disabled={loading}
          color="primary"
          variant="outlined"
        >
          Cancel
        </Button>
        <Button
          type="submit"
          form="change-password-form"
          variant="contained"
          disabled={loading || success}
          color="primary"
        >
          {loading ? (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <CircularProgress size={18} />
              <Typography sx={{ fontSize: '0.95rem' }}>Changing...</Typography>
            </Box>
          ) : (
            'Change Password'
          )}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ChangePasswordModal;

