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
    Autocomplete,
    IconButton,
    InputAdornment,
} from '@mui/material';
import { Visibility, VisibilityOff } from '@mui/icons-material';
import apiService from '../api';
import AppFooter from './AppFooter.jsx';
import gprisLogo from '../assets/gpris.png';

/** Match Login.jsx — ICT.go.ke palette */
const micde = {
    brand: '#005a9a',
    brandHover: '#00477d',
    brandMuted: '#5a92c4',
    brandDark: '#003559',
    pageBgTop: '#e8f4fc',
    pageBgMid: '#f8fafc',
    pageBgBottom: '#f0f4f8',
    textPrimary: '#1c1917',
    textSecondary: '#44403c',
    textMuted: '#78716c',
    borderLight: 'rgba(0, 90, 154, 0.14)',
    inputBg: '#fafafa',
    inputBgHover: '#f4f4f5',
};

const Register = () => {
    const phoneRegex = /^(?:07\d{8}|\+2547\d{8})$/;
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
    });
    const [consentGiven, setConsentGiven] = useState(false);
    const [emailError, setEmailError] = useState('');
    const [error, setError] = useState('');
    const [successMessage, setSuccessMessage] = useState('');
    const [loading, setLoading] = useState(false);
    const [loadingOrg, setLoadingOrg] = useState(false);
    /** Full GET /public/ministries?withDepartments=1&withSections=1 payload */
    const [ministriesHierarchy, setMinistriesHierarchy] = useState([]);
    const [departmentOptions, setDepartmentOptions] = useState([]);
    const [filteredStateDepartments, setFilteredStateDepartments] = useState([]);
    const [formErrors, setFormErrors] = useState({});
    const [showPassword, setShowPassword] = useState(false);
    const [logoFailed, setLogoFailed] = useState(false);
    const navigate = useNavigate();
    const fontStack = '"Helvetica Neue", Helvetica, Arial, "Segoe UI", sans-serif';

    // Department/directorate catalog for self-registration (from ministries->departments->sections hierarchy)
    useEffect(() => {
        const fetchOrg = async () => {
            setLoadingOrg(true);
            try {
                const response = await axiosInstance.get('/public/ministries', {
                    params: { withDepartments: '1', withSections: '1' },
                });
                const list = Array.isArray(response.data) ? response.data : [];
                setMinistriesHierarchy(list);
                const flattenedDepartments = list
                    .flatMap((m) => (Array.isArray(m.departments) ? m.departments : []))
                    .filter((d) => d && d.name)
                    .map((d) => ({
                        ...d,
                        ministryName: list.find((m) => m.ministryId === d.ministryId)?.name || '',
                    }))
                    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
                setDepartmentOptions(flattenedDepartments);
                if (flattenedDepartments.length === 0) {
                    setError('Organization directory is not available. Please contact an administrator.');
                }
            } catch (err) {
                console.error('Error fetching ministries:', err);
                const msg =
                    err?.response?.data?.message ||
                    err?.response?.data?.error ||
                    err?.message ||
                    'Failed to load ministries.';
                setError(
                    err?.response?.status === 501
                        ? 'Department directory requires PostgreSQL on the server.'
                        : msg
                );
            } finally {
                setLoadingOrg(false);
            }
        };
        fetchOrg();
    }, []);

    useEffect(() => {
        if (!formData.ministry) {
            setFilteredStateDepartments([]);
            return;
        }

        // formData.ministry stores selected Department value for backward compatibility with backend payload.
        const selectedDepartment = departmentOptions.find((d) => d.name === formData.ministry);
        let directorates = (selectedDepartment?.sections || []).map((s) => s.name).filter(Boolean);
        directorates = [...new Set(directorates)].sort((a, b) => a.localeCompare(b));
        if (formData.stateDepartment && !directorates.includes(formData.stateDepartment)) {
            directorates = [...directorates, formData.stateDepartment].sort((a, b) => a.localeCompare(b));
        }
        setFilteredStateDepartments(directorates);
    }, [formData.ministry, formData.stateDepartment, departmentOptions]);

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

        if (name === 'phoneNumber') {
            setFormErrors((prev) => ({ ...prev, phoneNumber: '' }));
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

        // Validate department and directorate (agency is optional)
        if (!formData.ministry) {
            errors.ministry = 'Department is required';
        }
        if (!formData.stateDepartment) {
            errors.stateDepartment = 'Directorate is required';
        }
        if (formData.phoneNumber && !phoneRegex.test(formData.phoneNumber.trim())) {
            errors.phoneNumber = 'Use 07XXXXXXXX or +2547XXXXXXXX';
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
                username: formData.username,
                email: formData.email,
                password: formData.password,
                phoneNumber: formData.phoneNumber,
                firstName: formData.firstName,
                lastName: formData.lastName,
                idNumber: formData.idNumber,
                employeeNumber: formData.employeeNumber,
                ministry: formData.ministry,
                consentGiven: consentGiven,
                agency_id: null,
                state_department: formData.stateDepartment,
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
            });
            setConsentGiven(false);
            setFormErrors({});
            setShowPassword(false);
            
            // Redirect to login page after a delay to let user read the message
            setTimeout(() => {
                navigate('/login');
            }, 4000);
        } catch (err) {
            console.error('Registration API error:', err);
            // axiosInstance rejects with response.data on error, so err may be { error, ... } without .response
            const payload = err?.response?.data ?? err;
            const apiError =
                (payload && typeof payload === 'object' && payload.error) ||
                (typeof payload === 'string' ? payload : null);
            const errorMessage =
                apiError ||
                err?.message ||
                'Registration failed. Please try again.';
            setError(errorMessage);
        } finally {
            setLoading(false);
        }
    };

    return (
        <>
        <Box
            sx={{
                minHeight: '100vh',
                display: 'flex',
                flexDirection: 'column',
                background: `linear-gradient(165deg, ${micde.pageBgTop} 0%, ${micde.pageBgMid} 42%, ${micde.pageBgBottom} 100%)`,
                pt: 0,
                pb: 3,
            }}
        >
        <Container
            maxWidth="sm"
            sx={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                py: 3,
                pb: 6,
            }}
        >
            <Card
                elevation={0}
                sx={{
                    width: '100%',
                    maxWidth: 480,
                    p: { xs: 2.25, sm: 3 },
                    borderRadius: 2,
                    background: '#ffffff',
                    border: `1px solid ${micde.borderLight}`,
                    boxShadow: '0 4px 24px rgba(0, 90, 154, 0.08), 0 1px 3px rgba(0,0,0,0.06)',
                }}
            >
                <CardContent sx={{ p: 0 }}>
                    <Box sx={{ textAlign: 'center', mb: 2.5 }}>
                        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', mb: 1.5 }}>
                            {!logoFailed ? (
                                <Box
                                    component="img"
                                    src={gprisLogo}
                                    alt="GPRIS — Machakos County Monitoring and Evaluation System"
                                    onError={() => setLogoFailed(true)}
                                    sx={{
                                        maxWidth: '100%',
                                        width: 'auto',
                                        height: 'auto',
                                        maxHeight: { xs: 76, sm: 92 },
                                        objectFit: 'contain',
                                        mb: 1.25,
                                        display: 'block',
                                    }}
                                />
                            ) : (
                                <Typography
                                    variant="h5"
                                    component="h1"
                                    sx={{
                                        fontFamily: fontStack,
                                        fontWeight: 800,
                                        color: micde.textPrimary,
                                        letterSpacing: '-0.02em',
                                        mb: 1.25,
                                    }}
                                >
                                    GPRIS
                                </Typography>
                            )}
                            <Typography
                                variant="body2"
                                component="p"
                                sx={{
                                    fontSize: '0.8125rem',
                                    fontWeight: 500,
                                    color: micde.textSecondary,
                                    fontFamily: fontStack,
                                    lineHeight: 1.45,
                                    maxWidth: 360,
                                    mx: 'auto',
                                }}
                            >
                                Machakos County Monitoring and Evaluation System
                            </Typography>
                        </Box>
                        <Typography
                            variant="body2"
                            sx={{
                                fontSize: '0.8125rem',
                                mt: 0.75,
                                color: micde.textMuted,
                                fontFamily: fontStack,
                            }}
                        >
                            Create your account
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
                            error={!!formErrors.phoneNumber}
                            helperText={formErrors.phoneNumber || "Optional: 07XXXXXXXX or +2547XXXXXXXX"}
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
                            type={showPassword ? 'text' : 'password'}
                            value={formData.password}
                            onChange={handleChange}
                            required
                            disabled={loading}
                            helperText="Must be at least 6 characters"
                            InputProps={{
                                endAdornment: (
                                    <InputAdornment position="end">
                                        <IconButton
                                            edge="end"
                                            onClick={() => setShowPassword((prev) => !prev)}
                                            disabled={loading}
                                            aria-label={showPassword ? 'Hide password' : 'Show password'}
                                        >
                                            {showPassword ? <VisibilityOff /> : <Visibility />}
                                        </IconButton>
                                    </InputAdornment>
                                ),
                            }}
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
                            options={departmentOptions.map((d) => d.name)}
                            value={formData.ministry || null}
                            onChange={(event, newValue) => {
                                setFormData(prev => ({ 
                                    ...prev, 
                                    ministry: newValue || '',
                                    stateDepartment: '',
                                }));
                                setFormErrors(prev => ({ ...prev, ministry: '', stateDepartment: '' }));
                            }}
                            loading={loadingOrg}
                            disabled={loading}
                            renderInput={(params) => (
                                <TextField
                                    {...params}
                                    label="Department"
                                    required
                                    error={!!formErrors.ministry}
                                    helperText={formErrors.ministry || 'Select your department'}
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
                                }));
                                setFormErrors(prev => ({ ...prev, stateDepartment: '' }));
                            }}
                            loading={loadingOrg}
                            disabled={loading || !formData.ministry}
                            renderInput={(params) => (
                                <TextField
                                    {...params}
                                    label="Directorate"
                                    required
                                    error={!!formErrors.stateDepartment}
                                    helperText={
                                        formErrors.stateDepartment ||
                                        (formData.ministry
                                            ? (filteredStateDepartments.length > 0
                                                ? 'Select your directorate'
                                                : 'No directorates found for selected department')
                                            : 'Please select a department first')
                                    }
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
                                            color: micde.brand,
                                            '&.Mui-checked': { color: micde.brand },
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
                                py: 1.15,
                                fontSize: '1rem',
                                fontWeight: 700,
                                borderRadius: 1,
                                textTransform: 'none',
                                fontFamily: fontStack,
                                bgcolor: micde.brand,
                                color: '#fff',
                                boxShadow: 'none',
                                mb: 2,
                                '&:hover': {
                                    bgcolor: micde.brandHover,
                                    boxShadow: '0 4px 14px rgba(0, 90, 154, 0.35)',
                                },
                                '&:disabled': {
                                    bgcolor: '#a8a29e',
                                    color: '#f5f5f4',
                                },
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
                        <Box sx={{ textAlign: 'center', mt: 2, pt: 2, borderTop: `1px solid ${micde.borderLight}` }}>
                            <Typography variant="body2" sx={{ color: micde.textMuted, mb: 0.5, fontSize: '0.8125rem', fontFamily: fontStack }}>
                                Already have an account?
                            </Typography>
                            <Link
                                component={RouterLink}
                                to="/login"
                                sx={{
                                    fontSize: '0.9rem',
                                    textDecoration: 'none',
                                    color: micde.brand,
                                    fontWeight: 700,
                                    fontFamily: fontStack,
                                    '&:hover': { textDecoration: 'underline', color: micde.brandDark },
                                }}
                            >
                                Sign in
                            </Link>
                        </Box>
                    </Box>
                </CardContent>
            </Card>
        </Container>
        </Box>
        <AppFooter variant="fixed" />
        </>
    );
};

export default Register;
