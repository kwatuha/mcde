import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Box,
  Typography,
  TextField,
  Button,
  Grid,
  Alert,
  CircularProgress,
} from '@mui/material';
import { useAuth } from '../context/AuthContext';
import userService from '../api/userService';

const ProfileModal = ({ open, onClose }) => {
  const { user: currentUser } = useAuth();
  const currentUserId = currentUser?.userId || currentUser?.id || currentUser?.actualUserId || null;
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [formData, setFormData] = useState({
    email: '',
    firstName: '',
    lastName: '',
    ministry: '',
    stateDepartment: '',
    agencyName: '',
    idNumber: '',
    employeeNumber: '',
    phoneNumber: '',
  });
  const [formErrors, setFormErrors] = useState({});

  const toDisplayValue = (...values) => {
    for (const value of values) {
      if (value !== undefined && value !== null && String(value).trim() !== '') {
        return String(value);
      }
    }
    return '';
  };

  const normalizeUserData = (data = {}) => ({
    email: toDisplayValue(data.email),
    firstName: toDisplayValue(data.firstName, data.firstname, data.first_name, currentUser?.firstName),
    lastName: toDisplayValue(data.lastName, data.lastname, data.last_name, currentUser?.lastName),
    ministry: toDisplayValue(data.ministry),
    stateDepartment: toDisplayValue(data.stateDepartment, data.state_department),
    agencyName: toDisplayValue(data.agencyName, data.agency_name, data.agency),
    idNumber: toDisplayValue(data.idNumber, data.id_number),
    employeeNumber: toDisplayValue(data.employeeNumber, data.employee_number),
    phoneNumber: toDisplayValue(data.phoneNumber, data.phone_number),
  });

  // Fetch user data when modal opens
  useEffect(() => {
    if (open && currentUserId) {
      fetchUserData();
    }
  }, [open, currentUserId]);

  useEffect(() => {
    if (!open) return;
    if (!currentUserId && currentUser) {
      setFormData((prev) => ({
        ...prev,
        ...normalizeUserData(currentUser),
      }));
    }
  }, [open, currentUserId, currentUser]);

  const fetchUserData = async () => {
    if (!currentUserId) return;
    
    setLoading(true);
    setError('');
    try {
      const userData = await userService.getUserById(currentUserId);
      setFormData(normalizeUserData(userData));
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

    // Validate phone number in real-time when provided
    if (field === 'phoneNumber' && value && !/^(?:07\d{8}|\+2547\d{8})$/.test(value)) {
      setFormErrors(prev => ({
        ...prev,
        phoneNumber: 'Use 07XXXXXXXX or +2547XXXXXXXX'
      }));
    }
  };

  const validateForm = () => {
    const errors = {};

    if (!formData.idNumber || formData.idNumber.trim() === '') {
      errors.idNumber = 'ID number is required';
    }

    if (!formData.employeeNumber || formData.employeeNumber.trim() === '') {
      errors.employeeNumber = 'Employee number is required';
    }

    const phone = String(formData.phoneNumber || '').trim();
    if (phone && !/^(?:07\d{8}|\+2547\d{8})$/.test(phone)) {
      errors.phoneNumber = 'Use 07XXXXXXXX or +2547XXXXXXXX';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSave = async () => {
    if (!currentUserId) {
      setError('Unable to identify the logged-in user. Please sign in again.');
      return;
    }
    if (!validateForm()) {
      setError('Please correct the form errors before saving.');
      return;
    }

    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const updated = await userService.updateUser(currentUserId, {
        idNumber: formData.idNumber.trim(),
        employeeNumber: formData.employeeNumber.trim(),
        phoneNumber: String(formData.phoneNumber || '').trim() || null,
      });
      if (updated && typeof updated === 'object') {
        setFormData((prev) => ({ ...prev, ...normalizeUserData(updated) }));
      }

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

  const handleCloseDialog = () => {
    setIsEditing(false);
    setFormErrors({});
    setError('');
    setSuccess('');
    onClose();
  };

  const handleEdit = () => {
    setIsEditing(true);
    setError('');
    setSuccess('');
  };

  return (
    <Dialog
      open={open}
      onClose={handleCloseDialog}
      maxWidth="sm"
      fullWidth
    >
      <DialogTitle sx={{ backgroundColor: 'primary.main', color: 'white' }}>
        My Profile
      </DialogTitle>

      <DialogContent dividers>
        <Box sx={{ mt: 1, mb: 2 }}>
          <Typography variant="body2" color="text.secondary">
            View and update your account details.
          </Typography>
        </Box>
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
                  margin="dense"
                  variant="outlined"
                  label="First Name"
                  value={formData.firstName}
                  disabled
                  helperText="Managed by Super Admin"
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  margin="dense"
                  variant="outlined"
                  label="Last Name"
                  value={formData.lastName}
                  disabled
                  helperText="Managed by Super Admin"
                />
              </Grid>

              <Grid item xs={12}>
                <TextField
                  fullWidth
                  margin="dense"
                  variant="outlined"
                  label="Email"
                  type="email"
                  value={formData.email}
                  disabled
                  helperText="Managed by Super Admin"
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  margin="dense"
                  variant="outlined"
                  label="Ministry"
                  value={formData.ministry}
                  disabled
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  margin="dense"
                  variant="outlined"
                  label="State Department"
                  value={formData.stateDepartment}
                  disabled
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  margin="dense"
                  variant="outlined"
                  label="Agency"
                  value={formData.agencyName}
                  disabled
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  margin="dense"
                  variant="outlined"
                  label="ID Number"
                  value={formData.idNumber}
                  onChange={(e) => handleInputChange('idNumber', e.target.value)}
                  disabled={!isEditing}
                  required
                  error={!!formErrors.idNumber}
                  helperText={formErrors.idNumber || 'National ID number'}
                  inputProps={{ maxLength: 50 }}
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  margin="dense"
                  variant="outlined"
                  label="Employee Number"
                  value={formData.employeeNumber}
                  onChange={(e) => handleInputChange('employeeNumber', e.target.value)}
                  disabled={!isEditing}
                  required
                  error={!!formErrors.employeeNumber}
                  helperText={formErrors.employeeNumber || 'Employee number'}
                  inputProps={{ maxLength: 50 }}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  margin="dense"
                  variant="outlined"
                  label="Phone Number"
                  value={formData.phoneNumber}
                  onChange={(e) => handleInputChange('phoneNumber', e.target.value)}
                  disabled={!isEditing}
                  error={!!formErrors.phoneNumber}
                  helperText={formErrors.phoneNumber || 'Format: 07XXXXXXXX or +2547XXXXXXXX'}
                />
              </Grid>
            </Grid>
          </>
        )}
      </DialogContent>

      <DialogActions sx={{ padding: '16px 24px' }}>
        {!isEditing ? (
          <>
            <Button onClick={handleCloseDialog} color="primary" variant="outlined">
              Close
            </Button>
            <Button onClick={handleEdit} color="primary" variant="contained" disabled={loading}>
              Edit
            </Button>
          </>
        ) : (
          <>
            <Button onClick={handleCancel} color="primary" variant="outlined" disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} color="primary" variant="contained" disabled={saving}>
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
};

export default ProfileModal;
