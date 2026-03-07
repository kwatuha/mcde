// src/components/Register.jsx
import React, { useState, useEffect } from 'react';
import { useNavigate, Link as RouterLink } from 'react-router-dom';
import axiosInstance from '../api/axiosInstance';
import {
    Box,
    Card,
    CardContent,
    TextField,
    Button,
    Typography,
    Link,
    Alert,
    CircularProgress,
    Container,
    Checkbox,
    FormControlLabel,
    FormHelperText,
    Autocomplete
} from '@mui/material';
import apiService from '../api';

const Register = () => {
    const [formData, setFormData] = useState({
        username: '',
        email: '',
        password: '',
        phoneNumber: '',
        firstName: '',
        lastName: '',
        idNumber: '',
        employeeNumber: '',
        ministry: '',
        stateDepartment: '',
        agencyId: '',
    });
    const [consentGiven, setConsentGiven] = useState(false);
    const [emailError, setEmailError] = useState('');
    const [error, setError] = useState('');
    const [successMessage, setSuccessMessage] = useState('');
    const [loading, setLoading] = useState(false);
    const [loadingAgencies, setLoadingAgencies] = useState(false);
    const [agencies, setAgencies] = useState([]);
    const [filteredAgencies, setFilteredAgencies] = useState([]);
    const [filteredStateDepartments, setFilteredStateDepartments] = useState([]);
    const [ministries, setMinistries] = useState([]);
    const [formErrors, setFormErrors] = useState({});
    const navigate = useNavigate();

    // Fetch agencies on component mount
    useEffect(() => {
        const fetchAgencies = async () => {
            setLoadingAgencies(true);
            try {
                // Use public endpoint for registration form (no auth required)
                const response = await axiosInstance.get('/public/agencies');
                console.log('Agencies API response:', response); // Debug log
                
                // Handle different response structures - public endpoint returns {data: [...], total: number}
                let agenciesList = [];
                if (response && response.data) {
                    if (Array.isArray(response.data)) {
                        agenciesList = response.data;
                    } else if (response.data.data && Array.isArray(response.data.data)) {
                        agenciesList = response.data.data;
                    } else if (Array.isArray(response.data)) {
                        agenciesList = response.data;
                    }
                } else if (Array.isArray(response)) {
                    agenciesList = response;
                }
                
                console.log('Agencies list:', agenciesList); // Debug log
                console.log('Number of agencies:', agenciesList.length); // Debug log
                
                if (agenciesList.length === 0) {
                    console.warn('No agencies found in response');
                    setError('No agencies found. Please contact administrator.');
                }
                
                setAgencies(agenciesList);
                
                // Extract unique ministries - handle both snake_case and camelCase
                const ministriesList = agenciesList
                    .map(agency => {
                        // Try multiple possible field names
                        return agency.ministry || agency.ministryName || agency.ministry_name || '';
                    })
                    .filter(Boolean);
                
                const uniqueMinistries = [...new Set(ministriesList)].sort();
                console.log('Unique ministries:', uniqueMinistries); // Debug log
                console.log('Number of unique ministries:', uniqueMinistries.length); // Debug log
                
                if (uniqueMinistries.length === 0 && agenciesList.length > 0) {
                    console.warn('No ministries found in agencies. Sample agency:', agenciesList[0]);
                }
                
                setMinistries(uniqueMinistries);
            } catch (err) {
                console.error('Error fetching agencies:', err);
                console.error('Error details:', {
                    message: err.message,
                    response: err.response?.data,
                    status: err.response?.status,
                    statusText: err.response?.statusText,
                    config: {
                        url: err.config?.url,
                        method: err.config?.method,
                        baseURL: err.config?.baseURL
                    },
                    code: err.code,
                    request: err.request
                });
                
                // Show more specific error message
                let errorMessage = 'Failed to load agencies. ';
                
                if (err.code === 'ECONNABORTED' || err.message?.includes('timeout')) {
                    errorMessage += 'Request timed out. Please check your connection and try again.';
                } else if (err.code === 'ERR_NETWORK' || err.message?.includes('Network Error')) {
                    errorMessage += 'Network error. Please check your internet connection.';
                } else if (err.response?.status === 401) {
                    errorMessage += 'Authentication required. Please try again or contact support.';
                } else if (err.response?.status === 403) {
                    errorMessage += 'Access denied. Please contact support.';
                } else if (err.response?.status === 404) {
                    errorMessage += 'Agencies endpoint not found. Please contact support.';
                } else if (err.response?.status >= 500) {
                    errorMessage += 'Server error. Please try again later.';
                } else if (err.response?.data?.message) {
                    errorMessage += err.response.data.message;
                } else if (err.message) {
                    errorMessage += err.message;
                } else {
                    errorMessage += 'Unknown error. Please check the browser console for details.';
                }
                
                setError(errorMessage);
            } finally {
                setLoadingAgencies(false);
            }
        };
        fetchAgencies();
    }, []);

    // Filter state departments when ministry changes
    useEffect(() => {
        if (formData.ministry) {
            const filtered = agencies
                .filter(agency => {
                    const agencyMinistry = agency.ministry || agency.ministryName;
                    return agencyMinistry && agencyMinistry.toLowerCase() === formData.ministry.toLowerCase();
                })
                .map(agency => agency.state_department || agency.stateDepartment)
                .filter(Boolean);
            const uniqueStateDepartments = [...new Set(filtered)].sort();
            setFilteredStateDepartments(uniqueStateDepartments);
            
            // Clear state department and agency if current selection doesn't match the ministry
            if (formData.stateDepartment) {
                const selectedAgency = agencies.find(a => {
                    const agencyMinistry = a.ministry || a.ministryName;
                    const agencyStateDept = a.state_department || a.stateDepartment;
                    return agencyStateDept?.toLowerCase() === formData.stateDepartment.toLowerCase() &&
                           agencyMinistry?.toLowerCase() === formData.ministry.toLowerCase();
                });
                if (!selectedAgency) {
                    setFormData(prev => ({ ...prev, stateDepartment: '', agencyId: '' }));
                }
            }
            if (formData.agencyId) {
                const selectedAgency = agencies.find(a => a.id === formData.agencyId || a.agencyId === formData.agencyId);
                const agencyMinistry = selectedAgency?.ministry || selectedAgency?.ministryName;
                if (!selectedAgency || agencyMinistry?.toLowerCase() !== formData.ministry.toLowerCase()) {
                    setFormData(prev => ({ ...prev, agencyId: '' }));
                }
            }
        } else {
            setFilteredStateDepartments([]);
            setFormData(prev => ({ ...prev, stateDepartment: '', agencyId: '' }));
        }
    }, [formData.ministry, agencies]);

    // Filter agencies when state department changes
    useEffect(() => {
        if (formData.ministry && formData.stateDepartment) {
            const filtered = agencies.filter(agency => {
                const agencyMinistry = agency.ministry || agency.ministryName;
                const agencyStateDept = agency.state_department || agency.stateDepartment;
                return agencyMinistry && agencyMinistry.toLowerCase() === formData.ministry.toLowerCase() &&
                       agencyStateDept && agencyStateDept.toLowerCase() === formData.stateDepartment.toLowerCase();
            });
            setFilteredAgencies(filtered);
            
            // Clear agency if current selection doesn't match the state department
            if (formData.agencyId) {
                const selectedAgency = agencies.find(a => a.id === formData.agencyId || a.agencyId === formData.agencyId);
                const agencyMinistry = selectedAgency?.ministry || selectedAgency?.ministryName;
                const agencyStateDept = selectedAgency?.state_department || selectedAgency?.stateDepartment;
                if (!selectedAgency || 
                    agencyMinistry?.toLowerCase() !== formData.ministry.toLowerCase() ||
                    agencyStateDept?.toLowerCase() !== formData.stateDepartment.toLowerCase()) {
                    setFormData(prev => ({ ...prev, agencyId: '' }));
                }
            }
        } else {
            setFilteredAgencies([]);
            if (!formData.stateDepartment) {
                setFormData(prev => ({ ...prev, agencyId: '' }));
            }
        }
    }, [formData.ministry, formData.stateDepartment, agencies]);

    // Email validation function
    const validateEmail = (email) => {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    };

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
        
        // Validate email in real-time
        if (name === 'email') {
            if (value && !validateEmail(value)) {
                setEmailError('Please enter a valid email address (e.g., user@example.com)');
            } else {
                setEmailError('');
            }
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setSuccessMessage('');
        setEmailError('');
        setLoading(true);

        // Basic client-side validation for required fields
        const errors = {};
        if (!formData.username || !formData.email || !formData.password || !formData.firstName || !formData.lastName || !formData.idNumber || !formData.employeeNumber) {
            setError('Please fill in all required fields.');
            setLoading(false);
            return;
        }

        // Validate ministry, state department, and agency
        if (!formData.ministry) {
            errors.ministry = 'Ministry is required';
        }
        if (!formData.stateDepartment) {
            errors.stateDepartment = 'State Department is required';
        }
        if (!formData.agencyId) {
            errors.agencyId = 'Agency is required';
        }

        if (Object.keys(errors).length > 0) {
            setFormErrors(errors);
            setError('Please fill in all required fields.');
            setLoading(false);
            return;
        }

        // Email validation
        if (!validateEmail(formData.email)) {
            setEmailError('Please enter a valid email address (e.g., user@example.com)');
            setLoading(false);
            return;
        }

        // Consent validation
        if (!consentGiven) {
            setError('You must consent to the collection and use of your information to proceed.');
            setLoading(false);
            return;
        }

        // Password strength validation
        if (formData.password.length < 6) {
            setError('Password must be at least 6 characters long.');
            setLoading(false);
            return;
        }

        try {
            // Call the register API endpoint using axiosInstance
            const response = await axiosInstance.post('/auth/register', {
                ...formData,
                consentGiven: consentGiven,
                agency_id: formData.agencyId,
                state_department: formData.stateDepartment
            });
            const data = response.data;
            
            setSuccessMessage(data.message || 'Registration successful! Your account is pending approval by an administrator.');
            
            // Clear form
            setFormData({
                username: '',
                email: '',
                password: '',
                phoneNumber: '',
                firstName: '',
                lastName: '',
                idNumber: '',
                employeeNumber: '',
                ministry: '',
                stateDepartment: '',
                agencyId: '',
            });
            setConsentGiven(false);
            setFormErrors({});
            
            // Redirect to login page after a delay to let user read the message
            setTimeout(() => {
                navigate('/login');
            }, 4000);
        } catch (err) {
            console.error('Registration API error:', err);
            const errorMessage = err.response?.data?.error || err.message || 'Registration failed. Please try again.';
            setError(errorMessage);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Container 
            maxWidth="sm" 
            sx={{ 
                minHeight: '100vh', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                background: 'linear-gradient(135deg, #2196f3 0%, #42a5f5 25%, #1976d2 50%, #1e88e5 75%, #2196f3 100%)',
                py: 4
            }}
        >
            <Card 
                sx={{ 
                    width: '100%', 
                    maxWidth: 480,
                    p: 4,
                    borderRadius: 4,
                    background: 'rgba(255, 255, 255, 0.98)',
                    backdropFilter: 'blur(15px)',
                    border: '1px solid rgba(59, 130, 246, 0.1)',
                    boxShadow: '0 12px 40px rgba(30, 58, 138, 0.15), 0 4px 16px rgba(30, 58, 138, 0.1)',
                    transform: 'translateY(0)',
                    transition: 'all 0.3s ease-in-out',
                    '&:hover': {
                        transform: 'translateY(-6px)',
                        boxShadow: '0 20px 60px rgba(30, 58, 138, 0.2), 0 8px 24px rgba(30, 58, 138, 0.15)'
                    }
                }}
            >
                <CardContent sx={{ p: 0 }}>
                    {/* Logo and Title Section */}
                    <Box sx={{ textAlign: 'center', mb: 4 }}>
                        <Box
                            sx={{
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center',
                                mb: 2
                            }}
                        >
                            <Typography 
                                variant="h4" 
                                sx={{ 
                                    fontSize: '2.5rem',
                                    fontWeight: 700,
                                    background: 'linear-gradient(135deg, #1976d2 0%, #42a5f5 50%, #64b5f6 100%)',
                                    backgroundClip: 'text',
                                    WebkitBackgroundClip: 'text',
                                    WebkitTextFillColor: 'transparent',
                                    letterSpacing: '-0.02em',
                                    mb: 0.5,
                                    fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif'
                                }}
                            >
                                GPRP
                            </Typography>
                            <Typography 
                                variant="subtitle1" 
                                sx={{ 
                                    fontSize: '0.875rem',
                                    fontWeight: 500,
                                    color: '#64748b',
                                    letterSpacing: '0.05em',
                                    textTransform: 'none'
                                }}
                            >
                                Government Projects Reporting Platform
                            </Typography>
                        </Box>
                        <Typography 
                            variant="body2" 
                            sx={{ 
                                fontSize: '0.85rem', 
                                mt: 0.5,
                                fontStyle: 'italic',
                                color: '#6b7280'
                            }}
                        >
                            Create Your Account
                        </Typography>
                    </Box>

                    <Box component="form" onSubmit={handleSubmit}>
                        {/* Personal Information */}
                        <TextField
                            fullWidth
                            label="First Name"
                            id="firstName"
                            name="firstName"
                            value={formData.firstName}
                            onChange={handleChange}
                            required
                            disabled={loading}
                            sx={{ 
                                mb: 2,
                                '& .MuiOutlinedInput-root': {
                                    borderRadius: 2,
                                    backgroundColor: '#f8fafc',
                                    transition: 'all 0.3s ease-in-out',
                                    '&:hover': {
                                        backgroundColor: '#f1f5f9',
                                        '& .MuiOutlinedInput-notchedOutline': {
                                            borderColor: '#3b82f6',
                                            borderWidth: 2
                                        }
                                    },
                                    '&.Mui-focused': {
                                        backgroundColor: 'white',
                                        '& .MuiOutlinedInput-notchedOutline': {
                                            borderColor: '#1e3a8a',
                                            borderWidth: 2
                                        }
                                    }
                                }
                            }}
                            variant="outlined"
                        />
                        <TextField
                            fullWidth
                            label="Last Name"
                            id="lastName"
                            name="lastName"
                            value={formData.lastName}
                            onChange={handleChange}
                            required
                            disabled={loading}
                            sx={{ 
                                mb: 2,
                                '& .MuiOutlinedInput-root': {
                                    borderRadius: 2,
                                    backgroundColor: '#f8fafc',
                                    transition: 'all 0.3s ease-in-out',
                                    '&:hover': {
                                        backgroundColor: '#f1f5f9',
                                        '& .MuiOutlinedInput-notchedOutline': {
                                            borderColor: '#3b82f6',
                                            borderWidth: 2
                                        }
                                    },
                                    '&.Mui-focused': {
                                        backgroundColor: 'white',
                                        '& .MuiOutlinedInput-notchedOutline': {
                                            borderColor: '#1e3a8a',
                                            borderWidth: 2
                                        }
                                    }
                                }
                            }}
                            variant="outlined"
                        />
                        <TextField
                            fullWidth
                            label="ID Number"
                            id="idNumber"
                            name="idNumber"
                            value={formData.idNumber}
                            onChange={handleChange}
                            required
                            disabled={loading}
                            inputProps={{ maxLength: 20 }}
                            helperText="Enter your national ID number"
                            sx={{ 
                                mb: 2,
                                '& .MuiOutlinedInput-root': {
                                    borderRadius: 2,
                                    backgroundColor: '#f8fafc',
                                    transition: 'all 0.3s ease-in-out',
                                    '&:hover': {
                                        backgroundColor: '#f1f5f9',
                                        '& .MuiOutlinedInput-notchedOutline': {
                                            borderColor: '#3b82f6',
                                            borderWidth: 2
                                        }
                                    },
                                    '&.Mui-focused': {
                                        backgroundColor: 'white',
                                        '& .MuiOutlinedInput-notchedOutline': {
                                            borderColor: '#1e3a8a',
                                            borderWidth: 2
                                        }
                                    }
                                }
                            }}
                            variant="outlined"
                        />
                        <TextField
                            fullWidth
                            label="Employee Number"
                            id="employeeNumber"
                            name="employeeNumber"
                            value={formData.employeeNumber}
                            onChange={handleChange}
                            required
                            disabled={loading}
                            inputProps={{ maxLength: 20 }}
                            helperText="Enter your employee number"
                            sx={{ 
                                mb: 2,
                                '& .MuiOutlinedInput-root': {
                                    borderRadius: 2,
                                    backgroundColor: '#f8fafc',
                                    transition: 'all 0.3s ease-in-out',
                                    '&:hover': {
                                        backgroundColor: '#f1f5f9',
                                        '& .MuiOutlinedInput-notchedOutline': {
                                            borderColor: '#3b82f6',
                                            borderWidth: 2
                                        }
                                    },
                                    '&.Mui-focused': {
                                        backgroundColor: 'white',
                                        '& .MuiOutlinedInput-notchedOutline': {
                                            borderColor: '#1e3a8a',
                                            borderWidth: 2
                                        }
                                    }
                                }
                            }}
                            variant="outlined"
                        />

                        {/* Account & Contact Details */}
                        <TextField
                            fullWidth
                            label="Username"
                            id="username"
                            name="username"
                            value={formData.username}
                            onChange={handleChange}
                            required
                            disabled={loading}
                            sx={{ 
                                mb: 2,
                                '& .MuiOutlinedInput-root': {
                                    borderRadius: 2,
                                    backgroundColor: '#f8fafc',
                                    transition: 'all 0.3s ease-in-out',
                                    '&:hover': {
                                        backgroundColor: '#f1f5f9',
                                        '& .MuiOutlinedInput-notchedOutline': {
                                            borderColor: '#3b82f6',
                                            borderWidth: 2
                                        }
                                    },
                                    '&.Mui-focused': {
                                        backgroundColor: 'white',
                                        '& .MuiOutlinedInput-notchedOutline': {
                                            borderColor: '#1e3a8a',
                                            borderWidth: 2
                                        }
                                    }
                                }
                            }}
                            variant="outlined"
                        />
                        
                        <TextField
                            fullWidth
                            label="Email"
                            id="email"
                            name="email"
                            type="email"
                            value={formData.email}
                            onChange={handleChange}
                            required
                            disabled={loading}
                            error={!!emailError}
                            helperText={emailError || 'Enter a valid email address (e.g., user@example.com)'}
                            sx={{ 
                                mb: 2,
                                '& .MuiOutlinedInput-root': {
                                    borderRadius: 2,
                                    backgroundColor: '#f8fafc',
                                    transition: 'all 0.3s ease-in-out',
                                    '&:hover': {
                                        backgroundColor: '#f1f5f9',
                                        '& .MuiOutlinedInput-notchedOutline': {
                                            borderColor: '#3b82f6',
                                            borderWidth: 2
                                        }
                                    },
                                    '&.Mui-focused': {
                                        backgroundColor: 'white',
                                        '& .MuiOutlinedInput-notchedOutline': {
                                            borderColor: '#1e3a8a',
                                            borderWidth: 2
                                        }
                                    }
                                }
                            }}
                            variant="outlined"
                        />

                        <TextField
                            fullWidth
                            label="Phone Number"
                            id="phoneNumber"
                            name="phoneNumber"
                            type="tel"
                            value={formData.phoneNumber}
                            onChange={handleChange}
                            disabled={loading}
                            helperText="Optional: Include a contact phone number"
                            sx={{ 
                                mb: 2,
                                '& .MuiOutlinedInput-root': {
                                    borderRadius: 2,
                                    backgroundColor: '#f8fafc',
                                    transition: 'all 0.3s ease-in-out',
                                    '&:hover': {
                                        backgroundColor: '#f1f5f9',
                                        '& .MuiOutlinedInput-notchedOutline': {
                                            borderColor: '#3b82f6',
                                            borderWidth: 2
                                        }
                                    },
                                    '&.Mui-focused': {
                                        backgroundColor: 'white',
                                        '& .MuiOutlinedInput-notchedOutline': {
                                            borderColor: '#1e3a8a',
                                            borderWidth: 2
                                        }
                                    }
                                }
                            }}
                            variant="outlined"
                        />

                        <TextField
                            fullWidth
                            label="Password"
                            id="password"
                            name="password"
                            type="password"
                            value={formData.password}
                            onChange={handleChange}
                            required
                            disabled={loading}
                            helperText="Must be at least 6 characters"
                            sx={{ 
                                mb: 2,
                                '& .MuiOutlinedInput-root': {
                                    borderRadius: 2,
                                    backgroundColor: '#f8fafc',
                                    transition: 'all 0.3s ease-in-out',
                                    '&:hover': {
                                        backgroundColor: '#f1f5f9',
                                        '& .MuiOutlinedInput-notchedOutline': {
                                            borderColor: '#3b82f6',
                                            borderWidth: 2
                                        }
                                    },
                                    '&.Mui-focused': {
                                        backgroundColor: 'white',
                                        '& .MuiOutlinedInput-notchedOutline': {
                                            borderColor: '#1e3a8a',
                                            borderWidth: 2
                                        }
                                    }
                                }
                            }}
                            variant="outlined"
                        />

                        {/* Organization Details */}

                        <Autocomplete
                            fullWidth
                            options={ministries}
                            value={formData.ministry || null}
                            onChange={(event, newValue) => {
                                setFormData(prev => ({ 
                                    ...prev, 
                                    ministry: newValue || '',
                                    stateDepartment: '', // Clear state department when ministry changes
                                    agencyId: '' // Clear agency when ministry changes
                                }));
                                setFormErrors(prev => ({ ...prev, ministry: '', stateDepartment: '', agencyId: '' }));
                            }}
                            loading={loadingAgencies}
                            disabled={loading}
                            renderInput={(params) => (
                                <TextField
                                    {...params}
                                    label="Ministry"
                                    required
                                    error={!!formErrors.ministry}
                                    helperText={formErrors.ministry || 'Select your ministry'}
                                    sx={{ 
                                        mb: 2,
                                        '& .MuiOutlinedInput-root': {
                                            borderRadius: 2,
                                            backgroundColor: '#f8fafc',
                                            transition: 'all 0.3s ease-in-out',
                                            '&:hover': {
                                                backgroundColor: '#f1f5f9',
                                                '& .MuiOutlinedInput-notchedOutline': {
                                                    borderColor: '#3b82f6',
                                                    borderWidth: 2
                                                }
                                            },
                                            '&.Mui-focused': {
                                                backgroundColor: 'white',
                                                '& .MuiOutlinedInput-notchedOutline': {
                                                    borderColor: '#1e3a8a',
                                                    borderWidth: 2
                                                }
                                            }
                                        }
                                    }}
                                />
                            )}
                        />

                        <Autocomplete
                            fullWidth
                            options={filteredStateDepartments}
                            value={formData.stateDepartment || null}
                            onChange={(event, newValue) => {
                                setFormData(prev => ({ 
                                    ...prev, 
                                    stateDepartment: newValue || '',
                                    agencyId: '' // Clear agency when state department changes
                                }));
                                setFormErrors(prev => ({ ...prev, stateDepartment: '', agencyId: '' }));
                            }}
                            loading={loadingAgencies}
                            disabled={loading || !formData.ministry}
                            renderInput={(params) => (
                                <TextField
                                    {...params}
                                    label="State Department"
                                    required
                                    error={!!formErrors.stateDepartment}
                                    helperText={formErrors.stateDepartment || (formData.ministry ? 'Select your state department' : 'Please select a ministry first')}
                                    sx={{ 
                                        mb: 2,
                                        '& .MuiOutlinedInput-root': {
                                            borderRadius: 2,
                                            backgroundColor: '#f8fafc',
                                            transition: 'all 0.3s ease-in-out',
                                            '&:hover': {
                                                backgroundColor: '#f1f5f9',
                                                '& .MuiOutlinedInput-notchedOutline': {
                                                    borderColor: '#3b82f6',
                                                    borderWidth: 2
                                                }
                                            },
                                            '&.Mui-focused': {
                                                backgroundColor: 'white',
                                                '& .MuiOutlinedInput-notchedOutline': {
                                                    borderColor: '#1e3a8a',
                                                    borderWidth: 2
                                                }
                                            }
                                        }
                                    }}
                                />
                            )}
                        />

                        <Autocomplete
                            fullWidth
                            options={filteredAgencies}
                            value={filteredAgencies.find(agency => 
                                (agency.id === formData.agencyId || agency.agencyId === formData.agencyId)
                            ) || null}
                            getOptionLabel={(option) => {
                                const name = option.agency_name || option.agencyName || option.name || '';
                                return name;
                            }}
                            onChange={(event, newValue) => {
                                const agencyId = newValue ? (newValue.id || newValue.agencyId) : '';
                                setFormData(prev => ({ ...prev, agencyId }));
                                setFormErrors(prev => ({ ...prev, agencyId: '' }));
                            }}
                            loading={loadingAgencies}
                            disabled={loading || !formData.ministry || !formData.stateDepartment}
                            renderInput={(params) => (
                                <TextField
                                    {...params}
                                    label="Agency"
                                    required
                                    error={!!formErrors.agencyId}
                                    helperText={formErrors.agencyId || (formData.ministry && formData.stateDepartment ? 'Select your agency' : 'Please select a ministry and state department first')}
                                    sx={{ 
                                        mb: 2,
                                        '& .MuiOutlinedInput-root': {
                                            borderRadius: 2,
                                            backgroundColor: '#f8fafc',
                                            transition: 'all 0.3s ease-in-out',
                                            '&:hover': {
                                                backgroundColor: '#f1f5f9',
                                                '& .MuiOutlinedInput-notchedOutline': {
                                                    borderColor: '#3b82f6',
                                                    borderWidth: 2
                                                }
                                            },
                                            '&.Mui-focused': {
                                                backgroundColor: 'white',
                                                '& .MuiOutlinedInput-notchedOutline': {
                                                    borderColor: '#1e3a8a',
                                                    borderWidth: 2
                                                }
                                            }
                                        }
                                    }}
                                />
                            )}
                        />

                        <Box sx={{ mb: 2 }}>
                            <FormControlLabel
                                control={
                                    <Checkbox
                                        checked={consentGiven}
                                        onChange={(e) => setConsentGiven(e.target.checked)}
                                        disabled={loading}
                                        required
                                        sx={{
                                            color: '#3b82f6',
                                            '&.Mui-checked': {
                                                color: '#1e3a8a',
                                            },
                                        }}
                                    />
                                }
                                label={
                                    <Typography variant="body2" sx={{ fontSize: '0.875rem' }}>
                                        I consent to the collection and use of my information for account registration and portal management purposes.
                                    </Typography>
                                }
                            />
                            {!consentGiven && (
                                <FormHelperText sx={{ color: '#d32f2f', ml: 4, mt: 0 }}>
                                    You must provide consent to proceed
                                </FormHelperText>
                            )}
                        </Box>

                        {error && (
                            <Alert severity="error" sx={{ mb: 2, fontSize: '0.875rem' }}>
                                {error}
                            </Alert>
                        )}
                        
                        {successMessage && (
                            <Alert severity="success" sx={{ mb: 2, fontSize: '0.875rem' }}>
                                {successMessage}
                            </Alert>
                        )}
                        
                        <Button
                            type="submit"
                            fullWidth
                            variant="contained"
                            disabled={loading}
                            sx={{ 
                                py: 1.8,
                                fontSize: '1.1rem',
                                fontWeight: 'bold',
                                borderRadius: 3,
                                textTransform: 'none',
                                background: 'linear-gradient(45deg, #1e3a8a 30%, #3b82f6 90%)',
                                boxShadow: '0 4px 12px rgba(30, 58, 138, 0.3)',
                                transition: 'all 0.3s ease-in-out',
                                mb: 2,
                                '&:hover': {
                                    background: 'linear-gradient(45deg, #1e40af 30%, #2563eb 90%)',
                                    boxShadow: '0 6px 16px rgba(30, 58, 138, 0.4)',
                                    transform: 'translateY(-2px)'
                                },
                                '&:disabled': {
                                    background: 'linear-gradient(45deg, #bdbdbd 30%, #e0e0e0 90%)',
                                    boxShadow: 'none',
                                    transform: 'none'
                                }
                            }}
                        >
                            {loading ? (
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <CircularProgress size={20} color="inherit" />
                                    Registering...
                                </Box>
                            ) : (
                                'Create Account'
                            )}
                        </Button>
                        
                        {/* Login Link */}
                        <Box sx={{ textAlign: 'center', mt: 2 }}>
                            <Typography variant="body2" sx={{ color: '#6b7280', mb: 1 }}>
                                Already have an account?
                            </Typography>
                            <Link 
                                component={RouterLink}
                                to="/login"
                                sx={{ 
                                    fontSize: '0.9rem',
                                    textDecoration: 'none',
                                    color: '#3b82f6',
                                    fontWeight: 600,
                                    '&:hover': { 
                                        textDecoration: 'underline',
                                        color: '#1e3a8a'
                                    }
                                }}
                            >
                                Login here
                            </Link>
                        </Box>
                    </Box>
                </CardContent>
            </Card>
        </Container>
    );
};

export default Register;
