// src/components/Register.jsx
import React, { useState } from 'react';
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
    FormHelperText
} from '@mui/material';

const Register = () => {
    const [formData, setFormData] = useState({
        username: '',
        email: '',
        password: '',
        firstName: '',
        lastName: '',
        idNumber: '',
        employeeNumber: '',
    });
    const [consentGiven, setConsentGiven] = useState(false);
    const [emailError, setEmailError] = useState('');
    const [error, setError] = useState('');
    const [successMessage, setSuccessMessage] = useState('');
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

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
        if (!formData.username || !formData.email || !formData.password || !formData.firstName || !formData.lastName || !formData.idNumber || !formData.employeeNumber) {
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
                consentGiven: consentGiven
            });
            const data = response.data;
            
            setSuccessMessage(data.message || 'Registration successful! Your account is pending approval by an administrator.');
            
            // Clear form
            setFormData({
                username: '',
                email: '',
                password: '',
                firstName: '',
                lastName: '',
                idNumber: '',
                employeeNumber: '',
            });
            setConsentGiven(false);
            
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
                                CivicChat
                            </Typography>
                            <Typography 
                                variant="subtitle1" 
                                sx={{ 
                                    fontSize: '0.875rem',
                                    fontWeight: 500,
                                    color: '#64748b',
                                    letterSpacing: '0.05em',
                                    textTransform: 'uppercase'
                                }}
                            >
                                CivicChat Portal
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
